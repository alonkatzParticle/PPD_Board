import { NextRequest, NextResponse } from "next/server";
import {
  getBoardMetadata, fetchBoardCached, buildWeekData,
  BOARD_ITEM_TTL,
} from "@/lib/items-server";

export const dynamic = 'force-dynamic';

import { normalizeMondayItem, buildProductSummary } from "@/lib/utils";
import type { BoardType, ItemsMode } from "@/lib/types";

export async function GET(req: NextRequest) {
  const boardId     = req.nextUrl.searchParams.get("boardId");
  const boardType   = req.nextUrl.searchParams.get("boardType") as BoardType;
  const groupsParam = req.nextUrl.searchParams.get("groups");
  const weekOffset  = parseInt(req.nextUrl.searchParams.get("weekOffset") ?? "0", 10);
  const allWeeks    = req.nextUrl.searchParams.get("allWeeks") === "1";
  const mode: ItemsMode = (req.nextUrl.searchParams.get("mode") as ItemsMode) ?? "timeline";
  const force       = req.nextUrl.searchParams.get("refresh") === "1";

  if (!boardId || !boardType) {
    return NextResponse.json({ error: "boardId and boardType are required" }, { status: 400 });
  }

  const selectedGroupIds = groupsParam && groupsParam !== "all"
    ? groupsParam.split(",").filter(Boolean) : null;

  try {
    const { allGroups, columnMapping, knownProducts } = await getBoardMetadata(boardId);

    const [cacheEntry, intakeCacheEntry] = await Promise.all([
      fetchBoardCached(boardId, columnMapping, allGroups, "timeline", force),
      fetchBoardCached(boardId, columnMapping, allGroups, "intake",   force),
    ]);

    const age = Date.now() - cacheEntry.fetchedAt;

    // Optional group filter (timeline items only)
    const rawItems = selectedGroupIds
      ? cacheEntry.items.filter((i) => selectedGroupIds.includes(i.group.id))
      : cacheEntry.items;

    const normalized = rawItems
      .map((i) => normalizeMondayItem(i, boardType, columnMapping, false))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    const intakeNormalized = intakeCacheEntry.items
      .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    const allDeptsNormalized = rawItems
      .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    // ── allWeeks mode ────────────────────────────────────────────────────────
    if (allWeeks && mode !== "intake") {
      return NextResponse.json({
        lastWeek: buildWeekData(normalized, intakeNormalized, allDeptsNormalized, columnMapping, knownProducts, -1),
        thisWeek: buildWeekData(normalized, intakeNormalized, allDeptsNormalized, columnMapping, knownProducts,  0),
        nextWeek: buildWeekData(normalized, intakeNormalized, allDeptsNormalized, columnMapping, knownProducts,  1),
        cached: age < BOARD_ITEM_TTL,
        cacheAgeSeconds: Math.round(age / 1000),
      });
    }

    // ── Intake mode ──────────────────────────────────────────────────────────
    if (mode === "intake") {
      const filtered = intakeNormalized.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        items: filtered,
        productSummary: buildProductSummary(filtered, knownProducts),
        columnMapping,
        total: filtered.length,
        cached: age < BOARD_ITEM_TTL,
        cacheAgeSeconds: Math.round(age / 1000),
      });
    }

    // ── Single-week mode ─────────────────────────────────────────────────────
    const weekData = buildWeekData(normalized, intakeNormalized, allDeptsNormalized, columnMapping, knownProducts, weekOffset);
    return NextResponse.json({
      ...weekData,
      cached: age < BOARD_ITEM_TTL,
      cacheAgeSeconds: Math.round(age / 1000),
    });

  } catch (err) {
    console.error("[/api/items]", err);
    return NextResponse.json({ error: "Failed to fetch items", detail: String(err) }, { status: 500 });
  }
}
