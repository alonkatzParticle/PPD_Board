import { neon } from "@neondatabase/serverless";
import type { MondayItem, ColumnMapping } from "./types";

let _sql: ReturnType<typeof neon> | null = null;

export function hasDb(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_DATABASE_URL);
}

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL or POSTGRES_DATABASE_URL environment variable is not set");
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Creates all required tables if they don't exist.
 * Safe to call on every request — uses IF NOT EXISTS.
 */
export async function ensureSchema() {
  const sql = getDb();

  // Goals table (per team, shared)
  await sql`
    CREATE TABLE IF NOT EXISTS week_goals (
      board_type  TEXT        NOT NULL,
      week_key    TEXT        NOT NULL,
      goals       JSONB       NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (board_type, week_key)
    )
  `;

  // Items cache table — stores raw Monday.com item data per board+mode
  // Replaces the in-memory Map so data survives server restarts and cold starts
  await sql`
    CREATE TABLE IF NOT EXISTS items_cache (
      board_id       TEXT        NOT NULL,
      mode           TEXT        NOT NULL,  -- 'timeline' | 'intake'
      items          JSONB       NOT NULL DEFAULT '[]',
      column_mapping JSONB       NOT NULL DEFAULT '{}',
      fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (board_id, mode)
    )
  `;
}

// ── Items cache helpers ──────────────────────────────────────────────────────

export interface DbItemsCache {
  items: MondayItem[];
  columnMapping: ColumnMapping;
  fetchedAt: Date;
}

export async function getItemsCache(
  boardId: string,
  mode: string
): Promise<DbItemsCache | null> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT items, column_mapping, fetched_at
      FROM items_cache
      WHERE board_id = ${boardId} AND mode = ${mode}
      LIMIT 1
    ` as { items: MondayItem[]; column_mapping: ColumnMapping; fetched_at: Date }[];

    if (!rows[0]) return null;
    return {
      items: rows[0].items,
      columnMapping: rows[0].column_mapping,
      fetchedAt: new Date(rows[0].fetched_at),
    };
  } catch {
    return null; // DB not available — caller falls back to Monday.com
  }
}

export async function setItemsCache(
  boardId: string,
  mode: string,
  items: MondayItem[],
  columnMapping: ColumnMapping
): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      INSERT INTO items_cache (board_id, mode, items, column_mapping, fetched_at)
      VALUES (${boardId}, ${mode}, ${JSON.stringify(items)}, ${JSON.stringify(columnMapping)}, now())
      ON CONFLICT (board_id, mode)
      DO UPDATE SET
        items          = ${JSON.stringify(items)},
        column_mapping = ${JSON.stringify(columnMapping)},
        fetched_at     = now()
    `;
  } catch (err) {
    console.warn("[db] setItemsCache failed:", err);
    // Non-fatal — in-memory cache still works as fallback
  }
}
