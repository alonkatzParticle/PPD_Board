import { NextResponse } from "next/server";
import { hasDb, getDb, ensureSchema } from "@/lib/db";

export async function GET() {
  // Dump ALL env vars (names only for safety) for debugging
  const allEnvKeys = Object.keys(process.env).sort();
  const dbRelatedVars: Record<string, string> = {};
  for (const key of allEnvKeys) {
    if (key.includes('POSTGRES') || key.includes('DATABASE') || key.includes('MONDAY') || key.includes('CRON')) {
      dbRelatedVars[key] = process.env[key] ? 'SET' : 'EMPTY';
    }
  }

  const envDiag = {
    DATABASE_URL: process.env['DATABASE_URL'] ? "set" : "missing",
    POSTGRES_DATABASE_URL: process.env['POSTGRES_DATABASE_URL'] ? "set" : "missing",
    NODE_ENV: process.env['NODE_ENV'],
    allRelevantKeys: dbRelatedVars,
  };

  const status: Record<string, unknown> = {
    db: "not configured",
    itemsCache: null,
    goalsTable: null,
    envDiag,
  };

  if (!hasDb()) {
    return NextResponse.json({ ok: false, ...status });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    // Check items_cache rows
    const itemRows = await sql`SELECT board_id, mode, fetched_at FROM items_cache` as {
      board_id: string; mode: string; fetched_at: Date;
    }[];
    status.db = "connected";
    status.itemsCache = itemRows.map((r) => ({
      board: r.board_id,
      mode: r.mode,
      age: `${Math.round((Date.now() - new Date(r.fetched_at).getTime()) / 60000)} min ago`,
    }));

    // Check goals rows
    const goalRows = await sql`SELECT COUNT(*) as count FROM week_goals` as { count: number }[];
    status.goalsTable = `${goalRows[0]?.count ?? 0} goal entries`;

    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    return NextResponse.json({ ok: false, db: "error", error: String(err) });
  }
}
