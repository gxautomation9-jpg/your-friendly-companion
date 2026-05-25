// Lightweight in-memory rate limiter (per Worker isolate).
// Soft cooldown: 1 req / 1s, burst of 20, 15s timeout for obvious spam.
// Designed to be invisible to normal users.

type Bucket = {
  tokens: number;
  last: number;
  blockedUntil: number;
};

const BUCKETS = new Map<string, Bucket>();
const CAPACITY = 20;          // burst
const REFILL_PER_SEC = 1;     // 1 req/sec sustained
const BLOCK_MS = 15_000;      // cooldown on abuse
const MAX_ENTRIES = 5_000;

export type RateResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

export function checkRateLimit(key: string): RateResult {
  const now = Date.now();

  // Cheap GC to keep map bounded.
  if (BUCKETS.size > MAX_ENTRIES) {
    for (const [k, b] of BUCKETS) {
      if (now - b.last > 60_000 && b.blockedUntil < now) BUCKETS.delete(k);
      if (BUCKETS.size <= MAX_ENTRIES / 2) break;
    }
  }

  let b = BUCKETS.get(key);
  if (!b) {
    b = { tokens: CAPACITY, last: now, blockedUntil: 0 };
    BUCKETS.set(key, b);
  }

  if (b.blockedUntil > now) {
    return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }

  // Refill.
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(CAPACITY, b.tokens + elapsed * REFILL_PER_SEC);
  b.last = now;

  if (b.tokens < 1) {
    b.blockedUntil = now + BLOCK_MS;
    return { ok: false, retryAfter: Math.ceil(BLOCK_MS / 1000) };
  }

  b.tokens -= 1;
  return { ok: true };
}

export function requestRateKey(request: Request, prefix: string) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return `${prefix}:${ip}:${ua.slice(0, 80)}`;
}
