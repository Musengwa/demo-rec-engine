import { LRUCache } from "lru-cache";
import { config } from "../config";

// One shared cache instance, entries keyed by "<endpoint>:<userId-or-guest>:<extra>".
// TTL is passed per-set() call so each endpoint can use its own value from config.
const cache = new LRUCache<string, {}>({
  max: config.cache.maxEntries,
  ttl: config.cache.feedTtlMs, // default; overridden per-entry below
});

export function cacheKey(parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => (p === null || p === undefined ? "guest" : String(p))).join(":");
}

export function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, value as {}, { ttl: ttlMs });
}

// Useful when an interaction is written and a user's own feed should not
// serve a stale cached result until the next natural TTL expiry.
export function invalidateForUser(userId: string): void {
  for (const key of cache.keys()) {
    if (key.includes(`:${userId}:`) || key.endsWith(`:${userId}`)) {
      cache.delete(key);
    }
  }
}
