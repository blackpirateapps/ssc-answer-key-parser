import { NextRequest, NextResponse } from "next/server";
import { parseSscAnswerKey } from "@/lib/ssc-parser";
import { getCacheKey, getFromCache, setInCache, singleFlight } from "@/lib/cache";

export const maxDuration = 30; // 30s timeout on Vercel

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body.url || body.answerKeyUrl;

    return await handleCheck(rawUrl);
  } catch (err: any) {
    console.error("API /api/check POST error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "An unexpected error occurred while parsing the answer key.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const rawUrl = req.nextUrl.searchParams.get("url");
    return await handleCheck(rawUrl);
  } catch (err: any) {
    console.error("API /api/check GET error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "An unexpected error occurred while parsing the answer key.",
      },
      { status: 500 }
    );
  }
}

async function handleCheck(rawUrl: string | null | undefined) {
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

  // Basic validation
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

  const cacheKey = getCacheKey(trimmed);

  // 1. Fast cache check
  const cachedData = await getFromCache(cacheKey);
  if (cachedData) {
    return NextResponse.json(cachedData, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  }

  // 2. Single-flight request coalescing (prevents dogpiling on cbexams.com)
  try {
    const result = await singleFlight(cacheKey, async () => {
      // Re-check cache inside single flight
      const existing = await getFromCache(cacheKey);
      if (existing) return existing;

      const parsedResult = await parseSscAnswerKey(trimmed);
      await setInCache(cacheKey, parsedResult);
      return parsedResult;
    });

    return NextResponse.json(result, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: any) {
    console.error("Scraper execution error:", err);
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
