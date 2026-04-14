import { neon } from "@neondatabase/serverless";
import type { MondayItem, ColumnMapping, BoardType, PlannedTask } from "./types";

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

  // Planned tasks — dashboard-only draft tasks with assignees (never touches Monday.com)
  await sql`
    CREATE TABLE IF NOT EXISTS planned_tasks (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      board_type  TEXT        NOT NULL,
      week_key    TEXT        NOT NULL,
      product     TEXT        NOT NULL,
      name        TEXT        NOT NULL,
      assignee    TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Add done column to existing tables (safe to run repeatedly)
  await sql`ALTER TABLE planned_tasks ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false`;
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

// ── Planned Tasks CRUD ───────────────────────────────────────────────────────

interface DbPlannedTaskRow {
  id: string;
  board_type: string;
  week_key: string;
  product: string;
  name: string;
  assignee: string | null;
  done: boolean;
  created_at: Date;
}

function toPlannedTask(row: DbPlannedTaskRow): PlannedTask {
  return {
    id: row.id,
    boardType: row.board_type as BoardType,
    weekKey: row.week_key,
    product: row.product,
    name: row.name,
    assignee: row.assignee,
    done: row.done,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getPlannedTasks(
  boardType: string,
  weekKey: string
): Promise<PlannedTask[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, board_type, week_key, product, name, assignee, done, created_at
    FROM planned_tasks
    WHERE board_type = ${boardType} AND week_key = ${weekKey}
    ORDER BY created_at ASC
  ` as DbPlannedTaskRow[];
  return rows.map(toPlannedTask);
}

export async function createPlannedTask(
  boardType: string,
  weekKey: string,
  product: string,
  name: string,
  assignee: string | null
): Promise<PlannedTask> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO planned_tasks (board_type, week_key, product, name, assignee)
    VALUES (${boardType}, ${weekKey}, ${product}, ${name}, ${assignee})
    RETURNING id, board_type, week_key, product, name, assignee, done, created_at
  ` as DbPlannedTaskRow[];
  return toPlannedTask(rows[0]);
}

export async function updatePlannedTask(
  id: string,
  updates: { name?: string; assignee?: string | null; done?: boolean }
): Promise<PlannedTask | null> {
  const sql = getDb();
  const current = await sql`
    SELECT id, board_type, week_key, product, name, assignee, done, created_at
    FROM planned_tasks WHERE id = ${id}
  ` as DbPlannedTaskRow[];
  if (!current[0]) return null;
  const newName     = updates.name     !== undefined ? updates.name     : current[0].name;
  const newAssignee = updates.assignee !== undefined ? updates.assignee : current[0].assignee;
  const newDone     = updates.done     !== undefined ? updates.done     : current[0].done;
  const rows = await sql`
    UPDATE planned_tasks
    SET name = ${newName}, assignee = ${newAssignee}, done = ${newDone}
    WHERE id = ${id}
    RETURNING id, board_type, week_key, product, name, assignee, done, created_at
  ` as DbPlannedTaskRow[];
  return rows[0] ? toPlannedTask(rows[0]) : null;
}

export async function deletePlannedTask(id: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM planned_tasks WHERE id = ${id}`;
}
