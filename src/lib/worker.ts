import { parseSscAnswerKey } from "@/lib/ssc-parser";
import {
  claimNextSubmission,
  getSubmissionRecord,
  markSubmissionFailed,
  saveCompletedSubmission,
} from "@/lib/db";
import { setInCache, singleFlight } from "@/lib/cache";
import { ScoreCardResponse } from "@/types";

// Strict concurrency limit to cbexams.com to prevent 429 or geo-blocks
export const SCRAPER_CONCURRENCY_CAP = 2;

/**
 * Evaluates an SSC response sheet, normalizes exam and shift,
 * and saves subjectwise report card counts to PostgreSQL.
 */
export async function processSubmission(
  submissionId: number,
  url: string,
  encKey: string
): Promise<ScoreCardResponse> {
  const cacheKey = `ssc:enc:${encKey}`;

  return await singleFlight(cacheKey, async () => {
    try {
      // 1. Fetch & parse response sheet
      const parsed = await parseSscAnswerKey(url);

      if (!parsed.candidate || !parsed.sections) {
        throw new Error(
          "Could not parse candidate details or sections from answer key."
        );
      }

      // 2. Persist to Postgres (deduplicated exam & shift, subjectwise counts, roll number check)
      const saveResult = await saveCompletedSubmission({
        submissionId,
        candidate: parsed.candidate,
        sections: parsed.sections,
        questions: parsed.questions,
      });

      const responseWithMeta: ScoreCardResponse = {
        ...parsed,
        status: "completed",
        submissionId,
        encKey,
        alreadySavedByRollNo: saveResult?.alreadySavedByRollNo,
        duplicateNotice: saveResult?.alreadySavedByRollNo
          ? "This roll number is already saved, showing saved results."
          : undefined,
      };

      // 3. Cache the completed response
      await setInCache(cacheKey, responseWithMeta);

      return responseWithMeta;
    } catch (err: any) {
      console.error(`Worker error on submission ${submissionId}:`, err);
      await markSubmissionFailed(
        submissionId,
        err.message || "Failed to retrieve or parse answer key."
      );
      throw err;
    }
  });
}

/**
 * Worker tick: Claims next pending submission using SKIP LOCKED and processes it.
 */
export async function tickWorker(concurrencyCap = SCRAPER_CONCURRENCY_CAP) {
  const claimed = await claimNextSubmission(concurrencyCap);
  if (!claimed) return null;

  try {
    return await processSubmission(
      claimed.id,
      claimed.answerKeyUrl,
      claimed.encKey
    );
  } catch {
    return null;
  }
}
