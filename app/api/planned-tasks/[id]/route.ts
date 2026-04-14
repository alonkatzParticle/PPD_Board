import { NextRequest, NextResponse } from "next/server";
import { updatePlannedTask, deletePlannedTask } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { name, assignee } = body as { name?: string; assignee?: string | null };
    const task = await updatePlannedTask(params.id, { name, assignee });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (err) {
    console.error("[PATCH /api/planned-tasks/:id]", err);
    return NextResponse.json({ error: "Failed to update planned task", detail: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deletePlannedTask(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/planned-tasks/:id]", err);
    return NextResponse.json({ error: "Failed to delete planned task", detail: String(err) }, { status: 500 });
  }
}
