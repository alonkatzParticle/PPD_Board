import { neon } from "@neondatabase/serverless";

// Lazily initialize so the module works during build when DATABASE_URL may not be set
let _sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _sql = neon(url);
  }
  return _sql;
}

/**
 * One-time schema bootstrap.
 * Call this from an API route on first deploy, or add to a migration script.
 */
export async function ensureSchema() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS week_goals (
      board_type  TEXT        NOT NULL,
      week_key    TEXT        NOT NULL,  -- e.g. "20260413"
      goals       JSONB       NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (board_type, week_key)
    )
  `;
}
