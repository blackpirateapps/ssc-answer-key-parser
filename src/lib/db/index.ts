import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import {
  CandidateInfo,
  ExamShiftSummary,
  ExaminationSummary,
  QuestionDetail,
  RawSectionReport,
  ScoreCardResponse,
  SectionSummary,
  SubmissionStatus,
} from "@/types";
import { calculateClientScores } from "@/lib/scoring";

let cachedSql: NeonQueryFunction<false, false> | null = null;
let schemaInitialized = false;

export function getDb(): NeonQueryFunction<false, false> | null {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!connectionString) {
    return null;
  }
  if (!cachedSql) {
    cachedSql = neon(connectionString);
  }
  return cachedSql;
}

/**
 * Automatically creates all tables and indexes if they do not exist.
 * Runs once per serverless worker instance.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaInitialized) return;
  const sql = getDb();
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS examinations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS exam_shifts (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
        test_date VARCHAR(50) NOT NULL,
        shift_time VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_exam_shift UNIQUE (exam_id, test_date, shift_time)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        enc_key VARCHAR(128) NOT NULL UNIQUE,
        answer_key_url TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        roll_no VARCHAR(50),
        candidate_name VARCHAR(255),
        centre VARCHAR(255),
        exam_id INTEGER REFERENCES examinations(id) ON DELETE SET NULL,
        shift_id INTEGER REFERENCES exam_shifts(id) ON DELETE SET NULL,
        raw_questions JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_submissions_enc_key ON submissions(enc_key);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_submissions_roll_no ON submissions(roll_no);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS report_cards (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        section_id VARCHAR(10) NOT NULL,
        section_name VARCHAR(100) NOT NULL,
        total_questions INTEGER NOT NULL DEFAULT 25,
        correct_count INTEGER NOT NULL DEFAULT 0,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        unattempted_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_submission_section UNIQUE (submission_id, section_id)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_report_cards_submission_id ON report_cards(submission_id);
    `;

    schemaInitialized = true;
  } catch (err) {
    console.warn("ensureSchema warning:", err);
  }
}

export interface EnqueueResult {
  id: number;
  encKey: string;
  status: SubmissionStatus;
  isNew: boolean;
}

/**
 * Saves the answer key URL immediately first into the submissions queue table.
 * Takes ~10-20ms. High-concurrency safe via ON CONFLICT (enc_key).
 */
export async function enqueueSubmission(
  rawUrl: string,
  encKey: string,
  forceRequeue = false
): Promise<EnqueueResult | null> {
  const sql = getDb();
  if (!sql) return null;
  await ensureSchema();

  let rows;
  if (forceRequeue) {
    rows = await sql`
      INSERT INTO submissions (enc_key, answer_key_url, status)
      VALUES (${encKey}, ${rawUrl}, 'pending')
      ON CONFLICT (enc_key) DO UPDATE
        SET answer_key_url = EXCLUDED.answer_key_url,
            status = 'pending',
            updated_at = NOW()
      RETURNING id, status, enc_key, (xmax = 0) AS is_new;
    `;
  } else {
    rows = await sql`
      INSERT INTO submissions (enc_key, answer_key_url, status)
      VALUES (${encKey}, ${rawUrl}, 'pending')
      ON CONFLICT (enc_key) DO UPDATE
        SET answer_key_url = EXCLUDED.answer_key_url,
            updated_at = NOW()
      RETURNING id, status, enc_key, (xmax = 0) AS is_new;
    `;
  }

  if (rows.length === 0) return null;

  return {
    id: rows[0].id,
    encKey: rows[0].enc_key,
    status: rows[0].status as SubmissionStatus,
    isNew: Boolean(rows[0].is_new),
  };
}

/**
 * Checks queue position for a given submission ID.
 */
export async function getQueuePosition(submissionId: number): Promise<number> {
  const sql = getDb();
  if (!sql) return 0;

  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS pos
      FROM submissions
      WHERE status = 'pending'
        AND created_at < (SELECT created_at FROM submissions WHERE id = ${submissionId});
    `;
    return (rows[0]?.pos ?? 0) + 1;
  } catch {
    return 1;
  }
}

/**
 * Counts how many submissions are currently in 'processing' status.
 */
export async function getActiveProcessingCount(): Promise<number> {
  const sql = getDb();
  if (!sql) return 0;

  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM submissions
      WHERE status = 'processing'
        AND updated_at > NOW() - INTERVAL '45 seconds';
    `;
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

export interface ClaimedSubmission {
  id: number;
  encKey: string;
  answerKeyUrl: string;
}

/**
 * Claims the next pending submission using PostgreSQL FOR UPDATE SKIP LOCKED.
 * Enforces strict concurrency cap to avoid overwhelming cbexams.com.
 */
export async function claimNextSubmission(
  concurrencyCap = 2,
  targetSubmissionId?: number
): Promise<ClaimedSubmission | null> {
  const sql = getDb();
  if (!sql) return null;
  await ensureSchema();

  const activeCount = await getActiveProcessingCount();
  if (activeCount >= concurrencyCap) {
    return null;
  }

  try {
    let rows;
    if (targetSubmissionId) {
      // Opportunistically claim this specific pending submission if slot available
      rows = await sql`
        WITH next_job AS (
          SELECT id FROM submissions
          WHERE id = ${targetSubmissionId}
            AND (status = 'pending' OR (status = 'processing' AND updated_at < NOW() - INTERVAL '45 seconds'))
          FOR UPDATE SKIP LOCKED
        )
        UPDATE submissions
        SET status = 'processing', updated_at = NOW()
        FROM next_job
        WHERE submissions.id = next_job.id
        RETURNING submissions.id, submissions.enc_key, submissions.answer_key_url;
      `;
    }

    if (!rows || rows.length === 0) {
      // Pick next oldest pending item in the queue
      rows = await sql`
        WITH next_job AS (
          SELECT id FROM submissions
          WHERE status = 'pending'
             OR (status = 'processing' AND updated_at < NOW() - INTERVAL '45 seconds')
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE submissions
        SET status = 'processing', updated_at = NOW()
        FROM next_job
        WHERE submissions.id = next_job.id
        RETURNING submissions.id, submissions.enc_key, submissions.answer_key_url;
      `;
    }

    if (rows && rows.length > 0) {
      return {
        id: rows[0].id,
        encKey: rows[0].enc_key,
        answerKeyUrl: rows[0].answer_key_url,
      };
    }
  } catch (err) {
    console.error("claimNextSubmission error:", err);
  }

  return null;
}

export interface SaveCompletedResult {
  alreadySavedByRollNo: boolean;
  existingSubmissionId?: number;
  existingEncKey?: string;
}

/**
 * Saves completed submission data:
 * 1. Upserts & deduplicates examination title -> returns exam_id
 * 2. Upserts & deduplicates exam shift date & time -> returns shift_id
 * 3. Checks if roll number was already saved in another completed submission
 * 4. Updates submission master record with candidate info & raw questions
 * 5. Inserts subjectwise report_cards (correct, wrong, unattempted)
 */
export async function saveCompletedSubmission(params: {
  submissionId: number;
  candidate: CandidateInfo;
  sections: SectionSummary[];
  questions?: QuestionDetail[];
}): Promise<SaveCompletedResult> {
  const sql = getDb();
  if (!sql) return { alreadySavedByRollNo: false };

  const { submissionId, candidate, sections, questions } = params;

  // 1. Examination (deduplicated)
  const examName =
    candidate.examLevel.trim() || "Combined Graduate Level Examination, 2026";
  const examRows = await sql`
    INSERT INTO examinations (name)
    VALUES (${examName})
    ON CONFLICT (name) DO UPDATE
      SET name = EXCLUDED.name
    RETURNING id;
  `;
  const examId = examRows[0]?.id;

  // 2. Exam Shift (deduplicated per exam)
  const testDate = candidate.testDate.trim() || "N/A";
  const shiftTime = candidate.shift.trim() || "N/A";
  const shiftRows = await sql`
    INSERT INTO exam_shifts (exam_id, test_date, shift_time)
    VALUES (${examId}, ${testDate}, ${shiftTime})
    ON CONFLICT (exam_id, test_date, shift_time) DO UPDATE
      SET shift_time = EXCLUDED.shift_time
    RETURNING id;
  `;
  const shiftId = shiftRows[0]?.id;

  // 2.5 Duplicate Roll Number Detector:
  // Check if this roll number already exists for this examination in an earlier completed submission
  let alreadySavedByRollNo = false;
  let existingEncKey: string | undefined;
  let existingSubmissionId: number | undefined;

  if (candidate.rollNo && candidate.rollNo !== "N/A" && examId) {
    const existingRoll = await sql`
      SELECT id, enc_key
      FROM submissions
      WHERE roll_no = ${candidate.rollNo}
        AND exam_id = ${examId}
        AND status = 'completed'
        AND id != ${submissionId}
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    if (existingRoll.length > 0) {
      alreadySavedByRollNo = true;
      existingSubmissionId = existingRoll[0].id;
      existingEncKey = existingRoll[0].enc_key;
    }
  }

  // 3. Update master submission record
  const rawQuestionsJson = questions ? JSON.stringify(questions) : null;

  await sql`
    UPDATE submissions
    SET roll_no = ${candidate.rollNo},
        candidate_name = ${candidate.name},
        centre = ${candidate.centre},
        exam_id = ${examId},
        shift_id = ${shiftId},
        raw_questions = ${rawQuestionsJson}::jsonb,
        status = 'completed',
        error_message = NULL,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${submissionId};
  `;

  // 4. Upsert subjectwise report_cards (storing raw correct, wrong, unattempted)
  for (const sec of sections) {
    await sql`
      INSERT INTO report_cards (
        submission_id,
        section_id,
        section_name,
        total_questions,
        correct_count,
        wrong_count,
        unattempted_count
      )
      VALUES (
        ${submissionId},
        ${sec.id},
        ${sec.name},
        ${sec.totalQuestions || 25},
        ${sec.correct},
        ${sec.wrong},
        ${sec.unattempted}
      )
      ON CONFLICT (submission_id, section_id) DO UPDATE
        SET total_questions = EXCLUDED.total_questions,
            correct_count = EXCLUDED.correct_count,
            wrong_count = EXCLUDED.wrong_count,
            unattempted_count = EXCLUDED.unattempted_count;
    `;
  }

  return {
    alreadySavedByRollNo,
    existingSubmissionId,
    existingEncKey,
  };
}

/**
 * Marks a submission as failed with error details.
 */
export async function markSubmissionFailed(
  submissionId: number,
  errorMessage: string
): Promise<void> {
  const sql = getDb();
  if (!sql) return;

  await sql`
    UPDATE submissions
    SET status = 'failed',
        error_message = ${errorMessage},
        updated_at = NOW()
    WHERE id = ${submissionId};
  `;
}

/**
 * Retrieves a submission by EncKey or ID from Postgres.
 * If completed, reconstructs candidate details and subjectwise report cards.
 */
export async function getSubmissionRecord(
  encKey: string
): Promise<ScoreCardResponse | null> {
  const sql = getDb();
  if (!sql) return null;
  await ensureSchema();

  const subRows = await sql`
    SELECT s.id,
           s.enc_key,
           s.answer_key_url,
           s.status,
           s.error_message,
           s.roll_no,
           s.candidate_name,
           s.centre,
           s.raw_questions,
           s.created_at,
           s.processed_at,
           e.name AS exam_name,
           es.test_date,
           es.shift_time
    FROM submissions s
    LEFT JOIN examinations e ON s.exam_id = e.id
    LEFT JOIN exam_shifts es ON s.shift_id = es.id
    WHERE s.enc_key = ${encKey}
    LIMIT 1;
  `;

  if (subRows.length === 0) {
    return null;
  }

  const sub = subRows[0];
  const status = sub.status as SubmissionStatus;

  if (status === "pending" || status === "processing") {
    const queuePos = await getQueuePosition(sub.id);
    return {
      success: true,
      status,
      submissionId: sub.id,
      encKey: sub.enc_key,
      queuePosition: queuePos,
      message:
        status === "processing"
          ? "Processing answer key..."
          : `Queued at position #${queuePos}. Processing one by one...`,
    };
  }

  if (status === "failed") {
    return {
      success: false,
      status: "failed",
      submissionId: sub.id,
      encKey: sub.enc_key,
      error: sub.error_message || "Failed to process answer key.",
    };
  }

  // If completed, fetch report card sections
  const reportRows = await sql`
    SELECT section_id,
           section_name,
           total_questions,
           correct_count,
           wrong_count,
           unattempted_count
    FROM report_cards
    WHERE submission_id = ${sub.id}
    ORDER BY section_id ASC;
  `;

  const rawSections: RawSectionReport[] = reportRows.map((r) => ({
    sectionId: r.section_id,
    sectionName: r.section_name,
    totalQuestions: r.total_questions,
    correct: r.correct_count,
    wrong: r.wrong_count,
    unattempted: r.unattempted_count,
  }));

  // Browser score calculator reconstructs section marks & overall summary
  const { sections, summary } = calculateClientScores(rawSections);

  // Duplicate roll number detector for read requests
  let alreadySavedByRollNo = false;
  if (sub.roll_no && sub.roll_no !== "N/A" && sub.exam_name) {
    const prior = await sql`
      SELECT s2.id
      FROM submissions s2
      LEFT JOIN examinations e ON s2.exam_id = e.id
      WHERE s2.roll_no = ${sub.roll_no}
        AND e.name = ${sub.exam_name}
        AND s2.status = 'completed'
        AND s2.id < ${sub.id}
      LIMIT 1;
    `;
    if (prior.length > 0) {
      alreadySavedByRollNo = true;
    }
  }

  const candidate: CandidateInfo = {
    rollNo: sub.roll_no || "N/A",
    name: sub.candidate_name || "N/A",
    examLevel: sub.exam_name || "Combined Graduate Level Examination, 2026",
    testDate: sub.test_date || "N/A",
    shift: sub.shift_time || "N/A",
    centre: sub.centre || "N/A",
  };

  return {
    success: true,
    status: "completed",
    submissionId: sub.id,
    encKey: sub.enc_key,
    alreadySavedByRollNo,
    duplicateNotice: alreadySavedByRollNo
      ? "This roll number is already saved, showing saved results."
      : undefined,
    candidate,
    rawSections,
    sections,
    summary,
    questions: (sub.raw_questions as QuestionDetail[]) || [],
    fetchedAt: sub.processed_at ? new Date(sub.processed_at).toISOString() : undefined,
  };
}

/**
 * Retrieves all examinations with aggregated student counts, average scores, and highest scores.
 */
export async function getExaminationsList(): Promise<ExaminationSummary[]> {
  const sql = getDb();
  if (!sql) {
    return [
      {
        id: 1,
        name: "Combined Graduate Level Examination, 2026",
        studentCount: 2,
        avgScore: 127.25,
        maxScore: 136.0,
        shiftsCount: 2,
      },
    ];
  }

  await ensureSchema();

  try {
    const rows = await sql`
      WITH sub_scores AS (
        SELECT 
          s.id AS submission_id,
          s.exam_id,
          SUM(rc.correct_count * 2.0 - rc.wrong_count * 0.5) AS total_score
        FROM submissions s
        JOIN report_cards rc ON rc.submission_id = s.id
        WHERE s.status = 'completed' AND s.exam_id IS NOT NULL
        GROUP BY s.id, s.exam_id
      )
      SELECT 
        e.id,
        e.name,
        COUNT(DISTINCT es.id)::int AS shifts_count,
        COUNT(DISTINCT ss.submission_id)::int AS student_count,
        COALESCE(ROUND(AVG(ss.total_score)::numeric, 2), 0)::float AS avg_score,
        COALESCE(ROUND(MAX(ss.total_score)::numeric, 2), 0)::float AS max_score
      FROM examinations e
      LEFT JOIN exam_shifts es ON es.exam_id = e.id
      LEFT JOIN sub_scores ss ON ss.exam_id = e.id
      GROUP BY e.id, e.name
      ORDER BY student_count DESC, e.id DESC;
    `;

    if (rows.length === 0) {
      return [
        {
          id: 1,
          name: "Combined Graduate Level Examination, 2026",
          studentCount: 0,
          avgScore: 0,
          maxScore: 0,
          shiftsCount: 0,
        },
      ];
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      studentCount: r.student_count || 0,
      avgScore: r.avg_score || 0,
      maxScore: r.max_score || 0,
      shiftsCount: r.shifts_count || 0,
    }));
  } catch (err) {
    console.warn("getExaminationsList query error:", err);
    return [];
  }
}

/**
 * Retrieves examination statistics including shift-wise candidate counts and average scores.
 */
export async function getExaminationDetails(
  examId: number
): Promise<ExaminationSummary | null> {
  const sql = getDb();
  if (!sql) {
    if (examId === 1) {
      return {
        id: 1,
        name: "Combined Graduate Level Examination, 2026",
        studentCount: 2,
        avgScore: 127.25,
        maxScore: 136.0,
        shiftsCount: 2,
        shifts: [
          {
            id: 1,
            testDate: "05 Oct 2026",
            shiftTime: "10:00 AM (Shift-1)",
            studentCount: 1,
            avgScore: 118.5,
            maxScore: 118.5,
          },
          {
            id: 2,
            testDate: "10 Oct 2026",
            shiftTime: "01:30 PM (Shift-2)",
            studentCount: 1,
            avgScore: 136.0,
            maxScore: 136.0,
          },
        ],
      };
    }
    return null;
  }

  await ensureSchema();

  try {
    const examRows = await sql`
      WITH sub_scores AS (
        SELECT 
          s.id AS submission_id,
          s.exam_id,
          SUM(rc.correct_count * 2.0 - rc.wrong_count * 0.5) AS total_score
        FROM submissions s
        JOIN report_cards rc ON rc.submission_id = s.id
        WHERE s.status = 'completed' AND s.exam_id = ${examId}
        GROUP BY s.id, s.exam_id
      )
      SELECT 
        e.id,
        e.name,
        COUNT(DISTINCT ss.submission_id)::int AS student_count,
        COALESCE(ROUND(AVG(ss.total_score)::numeric, 2), 0)::float AS avg_score,
        COALESCE(ROUND(MAX(ss.total_score)::numeric, 2), 0)::float AS max_score
      FROM examinations e
      LEFT JOIN sub_scores ss ON ss.exam_id = e.id
      WHERE e.id = ${examId}
      GROUP BY e.id, e.name;
    `;

    if (examRows.length === 0) return null;
    const exam = examRows[0];

    const shiftRows = await sql`
      WITH sub_scores AS (
        SELECT 
          s.id AS submission_id,
          s.shift_id,
          SUM(rc.correct_count * 2.0 - rc.wrong_count * 0.5) AS total_score
        FROM submissions s
        JOIN report_cards rc ON rc.submission_id = s.id
        WHERE s.status = 'completed' AND s.exam_id = ${examId}
        GROUP BY s.id, s.shift_id
      )
      SELECT 
        es.id,
        es.test_date,
        es.shift_time,
        COUNT(DISTINCT ss.submission_id)::int AS student_count,
        COALESCE(ROUND(AVG(ss.total_score)::numeric, 2), 0)::float AS avg_score,
        COALESCE(ROUND(MAX(ss.total_score)::numeric, 2), 0)::float AS max_score
      FROM exam_shifts es
      LEFT JOIN sub_scores ss ON ss.shift_id = es.id
      WHERE es.exam_id = ${examId}
      GROUP BY es.id, es.test_date, es.shift_time
      ORDER BY es.test_date ASC, es.shift_time ASC;
    `;

    const shifts: ExamShiftSummary[] = shiftRows.map((s) => ({
      id: s.id,
      testDate: s.test_date,
      shiftTime: s.shift_time,
      studentCount: s.student_count || 0,
      avgScore: s.avg_score || 0,
      maxScore: s.max_score || 0,
    }));

    return {
      id: exam.id,
      name: exam.name,
      studentCount: exam.student_count || 0,
      avgScore: exam.avg_score || 0,
      maxScore: exam.max_score || 0,
      shiftsCount: shifts.length,
      shifts,
    };
  } catch (err) {
    console.warn("getExaminationDetails query error:", err);
    return null;
  }
}
