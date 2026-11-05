-- Neon PostgreSQL Schema for SSC Answer Key Parser
-- High-concurrency URL intake, deduplicated exams/shifts, and subjectwise report cards

-- 1. Deduplicated examination names (Combined Graduate Level Examination, 2026, etc.)
CREATE TABLE IF NOT EXISTS examinations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Deduplicated exam shifts per exam
CREATE TABLE IF NOT EXISTS exam_shifts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  test_date VARCHAR(50) NOT NULL,
  shift_time VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_exam_shift UNIQUE (exam_id, test_date, shift_time)
);

-- 3. Intake Queue & Master Submissions
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  enc_key VARCHAR(128) NOT NULL UNIQUE,
  answer_key_url TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
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

CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_enc_key ON submissions(enc_key);
CREATE INDEX IF NOT EXISTS idx_submissions_roll_no ON submissions(roll_no);

-- 4. Normalized Report Cards: subjectwise correct, wrong, unattempted (marks calculated in browser)
CREATE TABLE IF NOT EXISTS report_cards (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  section_id VARCHAR(10) NOT NULL, -- 'A', 'B', 'C', 'D'
  section_name VARCHAR(100) NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 25,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unattempted_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_submission_section UNIQUE (submission_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_report_cards_submission_id ON report_cards(submission_id);
