/**
 * Week-scoped production goals — persisted to Neon Postgres via /api/goals.
 *
 * Pattern: optimistic local cache (localStorage) + background server sync.
 *  - Reads: return from localStorage immediately, then server hydrates the component
 *  - Writes: update localStorage instantly (UI feels instant), fire PUT to server async
 *
 * This means the UI is never blocked waiting for the DB, but all team members
 * eventually see the same goals once their component mounts and fetches from server.
 */

export interface WeekGoals {
  totalTarget: number | null;
  products: Record<string, number>; // productName → target count
}

const EMPTY: WeekGoals = { totalTarget: null, products: {} };

const localKey = (boardType: string, weekKey: string) =>
  `weekgoals:${boardType}:${weekKey}`;

// ── Local cache helpers ───────────────────────────────────────────────────────

function readLocal(boardType: string, weekKey: string): WeekGoals {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(localKey(boardType, weekKey));
    return raw ? (JSON.parse(raw) as WeekGoals) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeLocal(boardType: string, weekKey: string, goals: WeekGoals) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localKey(boardType, weekKey), JSON.stringify(goals));
  } catch { /* storage full — ignore */ }
}

// ── Server sync ───────────────────────────────────────────────────────────────

/** Fire-and-forget: push current goals to the server in background */
function pushToServer(boardType: string, weekKey: string, goals: WeekGoals) {
  fetch("/api/goals", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardType, weekKey, goals }),
  }).catch(() => { /* silent — local cache is source of truth for now */ });
}

/**
 * Fetch goals from the server and merge into local cache.
 * Returns the server-authoritative goals (or local cache on failure).
 */
export async function fetchWeekGoals(boardType: string, weekKey: string): Promise<WeekGoals> {
  try {
    const res = await fetch(`/api/goals?boardType=${boardType}&weekKey=${weekKey}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("non-ok");
    const goals = (await res.json()) as WeekGoals;
    // Merge into local (server is authoritative)
    writeLocal(boardType, weekKey, goals);
    return goals;
  } catch {
    // Fallback to local cache
    return readLocal(boardType, weekKey);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read goals from local cache (synchronous, zero-latency).
 * Used for the initial render; component should call fetchWeekGoals() on mount
 * to hydrate from the server.
 */
export function getWeekGoals(boardType: string, weekKey: string): WeekGoals {
  return readLocal(boardType, weekKey);
}

export function setTotalTarget(boardType: string, weekKey: string, value: number | null): void {
  const goals = readLocal(boardType, weekKey);
  goals.totalTarget = value;
  writeLocal(boardType, weekKey, goals);
  pushToServer(boardType, weekKey, goals);
}

export function setProductTarget(
  boardType: string,
  weekKey: string,
  product: string,
  value: number | null
): void {
  const goals = readLocal(boardType, weekKey);
  if (value === null || value <= 0) {
    delete goals.products[product];
  } else {
    goals.products[product] = value;
  }
  writeLocal(boardType, weekKey, goals);
  pushToServer(boardType, weekKey, goals);
}

/** Derive a stable week key from a Date (uses the start-of-week Sunday date) */
export function toWeekKey(weekStart: Date): string {
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, "0");
  const d = String(weekStart.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
