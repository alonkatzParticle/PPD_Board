/**
 * Client-side cache with two layers:
 *  1. In-memory Map  — zero-latency reads, survives React re-renders
 *  2. sessionStorage — survives page refreshes within the same browser tab
 *
 * TTL matches the server-side item cache (5 min).
 * sessionStorage is cleared automatically when the tab closes.
 */

const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SESSION_KEY_PREFIX = "ppd_cache:";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const memCache = new Map<string, CacheEntry<unknown>>();

// ── sessionStorage helpers ──────────────────────────────────────────────────

function readSession<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage full (5 MB limit) — clear old PPD entries and retry
    clearSessionPrefix();
  }
}

function clearSessionPrefix() {
  if (typeof window === "undefined") return;
  const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(SESSION_KEY_PREFIX));
  keys.forEach((k) => sessionStorage.removeItem(k));
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getCached<T>(key: string): T | null {
  // 1. Try memory first (fastest)
  const mem = memCache.get(key) as CacheEntry<T> | undefined;
  if (mem) {
    if (Date.now() - mem.fetchedAt < CLIENT_CACHE_TTL) return mem.data;
    memCache.delete(key);
  }
  // 2. Fall back to sessionStorage (survives refresh)
  const session = readSession<T>(key);
  if (session) {
    if (Date.now() - session.fetchedAt < CLIENT_CACHE_TTL) {
      memCache.set(key, session); // promote to memory
      return session.data;
    }
    sessionStorage.removeItem(SESSION_KEY_PREFIX + key);
  }
  return null;
}

export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  memCache.set(key, entry);
  writeSession(key, entry);
}

export function bustCache(key: string): void {
  memCache.delete(key);
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY_PREFIX + key);
  }
}

export function bustCacheByPrefix(prefix: string): void {
  // Memory
  const memKeys = Array.from(memCache.keys()).filter((k) => k.startsWith(prefix));
  memKeys.forEach((k) => memCache.delete(k));
  // sessionStorage
  if (typeof window === "undefined") return;
  const sessionKeys = Object.keys(sessionStorage).filter((k) =>
    k.startsWith(SESSION_KEY_PREFIX + prefix)
  );
  sessionKeys.forEach((k) => sessionStorage.removeItem(k));
}
