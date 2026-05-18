import { NextResponse } from "next/server";
import { BOARD_IDS } from "@/lib/types";
import { getBoardMetadata, fetchBoardCached, buildWeekData } from "@/lib/items-server";
import { normalizeMondayItem, getWeekWindow } from "@/lib/utils";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product") ?? "";
  const boardKey = (searchParams.get("board") ?? "video") as "video" | "design";
  const boardId  = boardKey === "video" ? BOARD_IDS.video : BOARD_IDS.design;

  if (!boardId) return NextResponse.json({ error: "board not configured" }, { status: 400 });

  const { allGroups, columnMapping, knownProducts } = await getBoardMetadata(boardId);
  const [timelineEntry, intakeEntry] = await Promise.all([
    fetchBoardCached(boardId, columnMapping, allGroups, "timeline", false),
    fetchBoardCached(boardId, columnMapping, allGroups, "intake",   false),
  ]);

  const boardType = boardKey === "video" ? "video" : "design";

  const normalized = timelineEntry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, false))
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeMondayItem>>[];

  const intakeNormalized = intakeEntry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeMondayItem>>[];

  const allDepts = timelineEntry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeMondayItem>>[];

  const weekData = buildWeekData(normalized, intakeNormalized, allDepts, columnMapping, knownProducts, 1);
  const weekWindow = getWeekWindow(1);

  const items = weekData.items.filter((i) =>
    !product || i.product.toLowerCase().includes(product.toLowerCase())
  );

  const summary = {
    weekWindow: { start: weekWindow.start.toISOString(), end: weekWindow.end.toISOString() },
    serverNow: new Date().toISOString(),
    total: items.length,
    mondayCount:   items.filter((i) => !i.isPipeline).length,
    pipelineCount: items.filter((i) =>  i.isPipeline).length,
    timelineCacheSize: timelineEntry.items.length,
    intakeCacheSize:   intakeEntry.items.length,
    items: items.map((i) => ({
      name:       i.name,
      product:    i.product,
      group:      i.groupTitle,
      status:     i.status,
      department: i.department,
      timeline:   `${i.timelineStart ?? "?"} → ${i.timelineEnd ?? "none"}`,
      isPipeline: i.isPipeline,
    })),
  };

  return NextResponse.json(summary, { status: 200 });
}
