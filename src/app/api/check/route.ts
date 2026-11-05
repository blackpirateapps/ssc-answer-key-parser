import { NextRequest, NextResponse } from "next/server";
import { parseSscAnswerKey } from "@/lib/ssc-parser";
import {
  extractEncKey,
  getCacheKey,
  getFromCache,
  setInCache,
  singleFlight,
} from "@/lib/cache";
import {
  claimNextSubmission,
  enqueueSubmission,
  getDb,
  getQueuePosition,
  getSubmissionRecord,
} from "@/lib/db";
import {
  processSubmission,
  SCRAPER_CONCURRENCY_CAP,
  tickWorker,
} from "@/lib/worker";

export const maxDuration = 30; // 30s timeout on Vercel

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body.url || body.answerKeyUrl;
    return await handleCheck(rawUrl, null);
  } catch (err: any) {
    console.error("API /api/check POST error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err.message ||
          "An unexpected error occurred while parsing the answer key.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const rawUrl = req.nextUrl.searchParams.get("url");
    const encKeyParam = req.nextUrl.searchParams.get("encKey");
    return await handleCheck(rawUrl, encKeyParam);
  } catch (err: any) {
    console.error("API /api/check GET error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err.message ||
          "An unexpected error occurred while parsing the answer key.",
      },
      { status: 500 }
    );
  }
}

async function handleCheck(
  rawUrl: string | null | undefined,
  encKeyParam: string | null | undefined
) {
  // Case A: Client polling via encKey
  if (encKeyParam && !rawUrl) {
    return await handleEncKeyPolling(encKeyParam.trim());
  }

  // Case B: URL submission
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "Please provide a valid SSC CGL answer key URL.",
      },
      { status: 400 }
    );
  }

  const trimmed = rawUrl.trim();

  // Basic URL Validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "The provided string is not a valid URL.",
      },
      { status: 400 }
    );
  }

  if (!parsedUrl.hostname.includes("cbexams.com")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid domain. URL must belong to an official SSC response sheet portal (e.g. sscexams.cbexams.com).",
      },
      { status: 400 }
    );
  }

  const encKey = extractEncKey(trimmed);
  const cacheKey = getCacheKey(trimmed);

  // 1. In-memory / Redis Cache check
  const cachedData = await getFromCache(cacheKey);
  if (cachedData && (!cachedData.status || cachedData.status === "completed")) {
    return NextResponse.json(cachedData, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  }

  // 2. Check Postgres DB if configured
  const db = getDb();
  if (db) {
    const existing = await getSubmissionRecord(encKey);
    if (existing && existing.status === "completed") {
      await setInCache(cacheKey, existing);
      return NextResponse.json(existing, {
        headers: {
          "X-Cache": "DB-HIT",
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 3. SAVE ANSWER KEY URL FIRST! (Immediate intake write to Neon DB)
    const enqueued = await enqueueSubmission(trimmed, encKey);
    if (enqueued) {
      if (enqueued.status === "completed") {
        const fullRecord = await getSubmissionRecord(encKey);
        if (fullRecord) return NextResponse.json(fullRecord);
      }

      // Try claiming a processing slot within concurrency cap
      const claimed = await claimNextSubmission(
        SCRAPER_CONCURRENCY_CAP,
        enqueued.id
      );

      if (claimed) {
        // We secured a worker slot! Process and return completed record
        try {
          const result = await processSubmission(
            claimed.id,
            claimed.answerKeyUrl,
            claimed.encKey
          );
          return NextResponse.json(result, {
            headers: {
              "X-Cache": "SCRAPED",
              "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
            },
          });
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              status: "failed",
              error:
                err.message ||
                "Failed to retrieve or parse answer key. The link may be expired or cbexams servers are unreachable.",
            },
            { status: 502 }
          );
        }
      } else {
        // System is currently at concurrency cap (10k-100k spike mode)
        // URL is safely saved in DB; return queue position for browser polling
        const queuePos = await getQueuePosition(enqueued.id);
        return NextResponse.json(
          {
            success: true,
            status: "pending",
            submissionId: enqueued.id,
            encKey: enqueued.encKey,
            queuePosition: queuePos,
            message: `URL saved! Queued at position #${queuePos}. Processing one by one...`,
          },
          { status: 202 }
        );
      }
    }
  }

  // Fallback for local development when DATABASE_URL is not configured
  try {
    const result = await singleFlight(cacheKey, async () => {
      const existing = await getFromCache(cacheKey);
      if (existing) return existing;

      const parsedResult = await parseSscAnswerKey(trimmed);
      await setInCache(cacheKey, parsedResult);
      return parsedResult;
    });

    return NextResponse.json(result, {
      headers: {
        "X-Cache": "FALLBACK-DIRECT",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: any) {
    console.error("Scraper execution fallback error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err.message ||
          "Failed to retrieve or parse answer key. The link may be expired or cbexams servers are temporarily unreachable.",
      },
      { status: 502 }
    );
  }
}

/**
 * Handles client polling by encKey
 */
async function handleEncKeyPolling(encKey: string) {
  const cacheKey = `ssc:enc:${encKey}`;

  // 1. Fast cache check
  const cached = await getFromCache(cacheKey);
  if (cached && cached.status === "completed") {
    return NextResponse.json(cached);
  }

  // 2. Postgres check
  const sub = await getSubmissionRecord(encKey);
  if (!sub) {
    return NextResponse.json(
      { success: false, error: "Submission not found." },
      { status: 404 }
    );
  }

  if (sub.status === "completed") {
    await setInCache(cacheKey, sub);
    return NextResponse.json(sub);
  }

  if (sub.status === "failed") {
    return NextResponse.json(sub, { status: 400 });
  }

  // If still pending, opportunistically attempt to claim and process this item
  if (sub.status === "pending" && sub.submissionId) {
    const claimed = await claimNextSubmission(
      SCRAPER_CONCURRENCY_CAP,
      sub.submissionId
    );
    if (claimed) {
      try {
        const result = await processSubmission(
          claimed.id,
          claimed.answerKeyUrl,
          claimed.encKey
        );
        return NextResponse.json(result);
      } catch (err: any) {
        return NextResponse.json(
          { success: false, status: "failed", error: err.message },
          { status: 502 }
        );
      }
    }
  }

  // Otherwise, still in line: return current queue status
  return NextResponse.json(sub, { status: 202 });
}
