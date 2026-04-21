import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getPlannedTasks, createPlannedTask } from "@/lib/db";
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
    const tasks = await getPlannedTasks(boardType, weekKey);
    return NextResponse.json(tasks);
  } catch (err) {
    console.error("[GET /api/planned-tasks]", err);
    return NextResponse.json({ error: "Failed to fetch planned tasks", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { boardType, weekKey, product, name, assignee } = body as {
      boardType: BoardType;
      weekKey: string;
      product: string;
      name: string;
      assignee?: string | null;
    };

    if (!boardType || !weekKey || !product || !name?.trim()) {
      return NextResponse.json(
        { error: "boardType, weekKey, product, and name are required" },
        { status: 400 }
      );
    }

    await ensureSchema();
    const task = await createPlannedTask(boardType, weekKey, product, name.trim(), assignee ?? null);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error("[POST /api/planned-tasks]", err);
    return NextResponse.json({ error: "Failed to create planned task", detail: String(err) }, { status: 500 });
  }
}
