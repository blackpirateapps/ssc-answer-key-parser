import { ScoreCardResponse } from "@/types";

interface CacheEntry {
  data: ScoreCardResponse;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 5000;

// In-Memory LRU Map
const memoryCache = new Map<string, CacheEntry>();

// Single-flight in-flight promise deduplication
const inFlightRequests = new Map<string, Promise<ScoreCardResponse>>();

/**
 * Normalizes an SSC answer key URL to a consistent cache key.
 * Primarily based on the EncKey parameter or the full sanitized URL.
 */
export function getCacheKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const encKey = parsed.searchParams.get("EncKey");
    if (encKey) {
      return `ssc:enc:${encKey.trim()}`;
    }
    // Fallback: stripped URL without fragments
    return `ssc:url:${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return `ssc:raw:${rawUrl.trim()}`;
  }
}

/**
 * Retrieves a cached score card if valid.
 */
export async function getFromCache(key: string): Promise<ScoreCardResponse | null> {
  const now = Date.now();

  // 1. Check in-memory cache
  const entry = memoryCache.get(key);
  if (entry) {
    if (entry.expiresAt > now) {
      // Refresh recency for LRU
      memoryCache.delete(key);
      memoryCache.set(key, entry);
      return { ...entry.data, cached: true };
    } else {
      memoryCache.delete(key);
    }
  }

  // 2. Check Upstash Redis if configured
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const res = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          },
          cache: "no-store",
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          const parsed = JSON.parse(json.result) as ScoreCardResponse;
          // Store in local memory cache too
          setMemoryCache(key, parsed, DEFAULT_TTL_MS);
          return { ...parsed, cached: true };
        }
      }
    } catch (err) {
      console.warn("Upstash Redis get error:", err);
    }
  }

  return null;
}

/**
 * Stores a score card in cache.
 */
export async function setInCache(
  key: string,
  data: ScoreCardResponse,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  // 1. Store in memory LRU
  setMemoryCache(key, data, ttlMs);

  // 2. Store in Upstash Redis if configured
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const ttlSec = Math.floor(ttlMs / 1000);
      await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
          key
        )}?ex=${ttlSec}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          },
          body: JSON.stringify(data),
          cache: "no-store",
        }
      );
    } catch (err) {
      console.warn("Upstash Redis set error:", err);
    }
  }
}

function setMemoryCache(key: string, data: ScoreCardResponse, ttlMs: number) {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest (first item in map iterator)
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Executes a function with single-flight request coalescing.
 * If 10k users ask for the exact same URL at the same millisecond,
 * only 1 fetch execution occurs.
 */
export async function singleFlight<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise as Promise<ScoreCardResponse>);
  return promise;
}
