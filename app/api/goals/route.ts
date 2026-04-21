import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import type { BoardType } from "@/lib/types";

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const boardType = req.nextUrl.searchParams.get("boardType") as BoardType;
  const weekKey   = req.nextUrl.searchParams.get("weekKey");

  if (!boardType || !weekKey) {
    return NextResponse.json({ error: "boardType and weekKey are required" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT goals FROM week_goals
      WHERE board_type = ${boardType} AND week_key = ${weekKey}
      LIMIT 1
    ` as { goals: { totalTarget: number | null; products: Record<string, number> } }[];
    const goals = rows[0]?.goals ?? { totalTarget: null, products: {} };
    return NextResponse.json(goals);
  } catch (err) {
    console.error("[GET /api/goals]", err);
    return NextResponse.json({ totalTarget: null, products: {} }); // graceful fallback
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { boardType, weekKey, goals } = body as {
      boardType: BoardType;
      weekKey: string;
      goals: { totalTarget: number | null; products: Record<string, number> };
    };

    if (!boardType || !weekKey || !goals) {
      return NextResponse.json({ error: "boardType, weekKey, and goals are required" }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();
    await sql`
      INSERT INTO week_goals (board_type, week_key, goals, updated_at)
      VALUES (${boardType}, ${weekKey}, ${JSON.stringify(goals)}, now())
      ON CONFLICT (board_type, week_key)
      DO UPDATE SET goals = ${JSON.stringify(goals)}, updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/goals]", err);
    return NextResponse.json({ error: "Failed to save goals" }, { status: 500 });
  }
}
