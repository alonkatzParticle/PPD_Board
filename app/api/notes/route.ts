export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { hasDb, getWeekNote, setWeekNote, ensureSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const boardType = searchParams.get("boardType");
  const weekKey   = searchParams.get("weekKey");

  if (!boardType || !weekKey) {
    return NextResponse.json({ error: "boardType and weekKey required" }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ content: "" });

  try {
    await ensureSchema();
    const content = await getWeekNote(boardType, weekKey);
    return NextResponse.json({ content });
  } catch (err) {
    console.error("[api/notes GET]", err);
    return NextResponse.json({ content: "" });
  }
}

export async function PUT(req: NextRequest) {
  const { boardType, weekKey, content } = await req.json();

  if (!boardType || !weekKey || content === undefined) {
    return NextResponse.json({ error: "boardType, weekKey and content required" }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no db" }, { status: 503 });

  try {
    await ensureSchema();
    await setWeekNote(boardType, weekKey, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/notes PUT]", err);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}
