import { NextRequest, NextResponse } from "next/server";
import { getActiveProcessingCount } from "@/lib/db";
import { SCRAPER_CONCURRENCY_CAP, tickWorker } from "@/lib/worker";

export const maxDuration = 30; // 30s timeout on Vercel

/**
 * Worker endpoint: Drains pending submissions one by one from the Postgres queue.
 * Can be triggered via Vercel Cron or an external webhook.
 */
export async function GET(req: NextRequest) {
  return await handleWorkerTick();
}

export async function POST(req: NextRequest) {
  return await handleWorkerTick();
}

async function handleWorkerTick() {
  try {
    const activeBefore = await getActiveProcessingCount();
    const result = await tickWorker(SCRAPER_CONCURRENCY_CAP);

    return NextResponse.json({
      success: true,
      processed: Boolean(result),
      activeWorkers: activeBefore,
      concurrencyCap: SCRAPER_CONCURRENCY_CAP,
      result: result ? { id: result.submissionId, encKey: result.encKey } : null,
    });
  } catch (err: any) {
    console.error("Worker endpoint error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
