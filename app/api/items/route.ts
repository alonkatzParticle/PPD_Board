import { NextRequest, NextResponse } from "next/server";
import { mondayQuery } from "@/lib/monday";
import { normalizeMondayItem, detectColumnMapping, buildProductSummary, filterByWeekWindow, getWeekWindow, getPipelineTasks } from "@/lib/utils";
import type { BoardType, MondayItem, ColumnMapping, ItemsMode } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColumnsAndGroupsResponse {
  boards: {
    id: string;
    columns: { id: string; title: string; type: string; settings_str: string }[];
    groups: { id: string; title: string }[];
  }[];
}

interface BoardPageResponse {
  boards: {
    id: string;
    items_page: { cursor: string | null; items: MondayItem[] };
  }[];
}

interface GroupPageResponse {
  boards: {
    groups: {
      id: string;
      title: string;
      items_page: { cursor: string | null; items: MondayItem[] };
    }[];
  }[];
}

interface NextPageResponse {
  next_items_page: { cursor: string | null; items: MondayItem[] };
}

interface BoardCache {
  items: MondayItem[];
  columnMapping: ColumnMapping;
  fetchedAt: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// Separate keys per board+mode so intake and timeline don't evict each other.

const boardItemCache = new Map<string, BoardCache>();
const inflightFetches = new Map<string, Promise<BoardCache>>();
const BOARD_ITEM_TTL = 5 * 60 * 1000; // 5 minutes

// ── Keywords used to match intake-stage group names ──────────────────────────
// Groups whose title contains any of these words (case-insensitive) are fetched.
const INTAKE_STAGE_KEYWORDS = ["form request", "pending", "ready for assignment"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildItemFields(colIds: string[]): string {
  const filter = colIds.length > 0
    ? `ids: [${colIds.map((id) => `"${id}"`).join(", ")}]`
    : "";
  return `id name group { id title } column_values(${filter}) { id text value type }`;
}

/** Follow next_items_page cursors and accumulate results */
async function drainCursor(
  firstItems: MondayItem[],
  firstCursor: string | null,
  itemFields: string
): Promise<MondayItem[]> {
  const all = [...firstItems];
  let cursor = firstCursor;
  while (cursor) {
    const next = await mondayQuery<NextPageResponse>(
      `query { next_items_page(limit: 500, cursor: "${cursor}") { cursor items { ${itemFields} } } }`
    );
    cursor = next.next_items_page?.cursor ?? null;
    all.push(...(next.next_items_page?.items ?? []));
  }
  return all;
}

// ── Intake fetch: query only the groups matching our intake stage keywords ────
// "Form Requests", "Video Editor Pending", "Ready For Assignment" → ~1-2 seconds
// vs fetching the entire board (13,500 items → 50+ seconds)

async function fetchIntakeItems(
  boardId: string,
  columnMapping: ColumnMapping,
  allGroups: { id: string; title: string }[]
): Promise<MondayItem[]> {
  // Find board groups whose title contains any intake keyword
  const intakeGroupIds = allGroups
    .filter((g) =>
      INTAKE_STAGE_KEYWORDS.some((kw) => g.title.toLowerCase().includes(kw))
    )
    .map((g) => g.id);

  if (intakeGroupIds.length === 0) return [];

  const colIds = [
    columnMapping.timeline,
    columnMapping.department,
    columnMapping.product,
    columnMapping.status,
  ].filter(Boolean) as string[];

  const itemFields = buildItemFields(colIds);
  const groupIdsArg = intakeGroupIds.map((id) => `"${id}"`).join(", ");

  const data = await mondayQuery<GroupPageResponse>(`
    query {
      boards(ids: [${boardId}]) {
        groups(ids: [${groupIdsArg}]) {
          id title
          items_page(limit: 500) {
            cursor
            items { ${itemFields} }
          }
        }
      }
    }
  `);

  const groups = data.boards[0]?.groups ?? [];
  const all: MondayItem[] = [];

  for (const group of groups) {
    const page = group.items_page;
    const drained = await drainCursor(page.items ?? [], page.cursor ?? null, itemFields);
    all.push(...drained);
  }

  return all;
}

// ── Timeline fetch: board-level query filtered by timeline is_not_empty ───────
// Only items that have a scheduled timeline — cuts ~13,500 → ~600 items

async function fetchTimelineItems(
  boardId: string,
  columnMapping: ColumnMapping
): Promise<MondayItem[]> {
  const colIds = [
    columnMapping.timeline,
    columnMapping.department,
    columnMapping.product,
    columnMapping.status,
  ].filter(Boolean) as string[];

  const itemFields = buildItemFields(colIds);

  const queryParams = columnMapping.timeline
    ? `query_params: { rules: [{ column_id: "${columnMapping.timeline}", compare_value: [], operator: is_not_empty }] }`
    : "";

  const firstData = await mondayQuery<BoardPageResponse>(`
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 500, ${queryParams}) {
          cursor
          items { ${itemFields} }
        }
      }
    }
  `);

  const page = firstData.boards[0]?.items_page;
  return drainCursor(page?.items ?? [], page?.cursor ?? null, itemFields);
}

// ── Cached fetch (deduplicates concurrent requests) ──────────────────────────

async function fetchBoardCached(
  boardId: string,
  columnMapping: ColumnMapping,
  allGroups: { id: string; title: string }[],
  mode: ItemsMode,
  force = false
): Promise<BoardCache> {
  const cacheKey = `${boardId}:${mode}`;

  if (!force) {
    const cached = boardItemCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < BOARD_ITEM_TTL) return cached;
  }

  if (!force) {
    const inflight = inflightFetches.get(cacheKey);
    if (inflight) return inflight;
  }

  const promise = (async (): Promise<BoardCache> => {
    try {
      const items = mode === "intake"
        ? await fetchIntakeItems(boardId, columnMapping, allGroups)
        : await fetchTimelineItems(boardId, columnMapping);

      const result: BoardCache = { items, columnMapping, fetchedAt: Date.now() };
      boardItemCache.set(cacheKey, result);
      return result;
    } finally {
      inflightFetches.delete(cacheKey);
    }
  })();

  inflightFetches.set(cacheKey, promise);
  return promise;
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Combined columns + groups query — one round trip
const GET_COLS_AND_GROUPS = `
  query GetColsAndGroups($boardId: ID!) {
    boards(ids: [$boardId]) {
      columns { id title type settings_str }
      groups { id title }
    }
  }`;

export async function GET(req: NextRequest) {
  const boardId = req.nextUrl.searchParams.get("boardId");
  const boardType = req.nextUrl.searchParams.get("boardType") as BoardType;
  const groupsParam = req.nextUrl.searchParams.get("groups");
  const weekOffset = parseInt(req.nextUrl.searchParams.get("weekOffset") ?? "0", 10);
  const mode: ItemsMode = (req.nextUrl.searchParams.get("mode") as ItemsMode) ?? "timeline";
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  if (!boardId || !boardType) {
    return NextResponse.json({ error: "boardId and boardType are required" }, { status: 400 });
  }

  const selectedGroupIds = groupsParam && groupsParam !== "all"
    ? groupsParam.split(",").filter(Boolean) : null;

  try {
    // Step 1: Columns + groups metadata — single fast request
    const meta = await mondayQuery<ColumnsAndGroupsResponse>(GET_COLS_AND_GROUPS, { boardId });
    const columns = meta.boards[0]?.columns ?? [];
    const allGroups = meta.boards[0]?.groups ?? [];
    const columnMapping: ColumnMapping = detectColumnMapping(columns);

    // Step 2: Fetch items (cached per board+mode)
    const cacheEntry = await fetchBoardCached(boardId, columnMapping, allGroups, mode, force);
    const rawItems = cacheEntry.items;

    // Step 3: Optional user group filter (from GroupFilter UI)
    const grouped = selectedGroupIds
      ? rawItems.filter((i) => selectedGroupIds.includes(i.group.id))
      : rawItems;

    // Step 4: Normalize — skip department filter in intake mode (items have no dept set)
    const normalized = grouped
      .map((i) => normalizeMondayItem(i, boardType, columnMapping, mode === "intake"))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    // Step 5: Mode-specific filter + sort
    let filtered: NonNullable<ReturnType<typeof normalizeMondayItem>>[];

    if (mode === "intake") {
      // Already fetched only from intake-stage groups — just sort alphabetically
      filtered = normalized.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const weekWindow = getWeekWindow(weekOffset);
      filtered = filterByWeekWindow(normalized, weekWindow);

      // ── Pipeline credit (Next Week only) ────────────────────────────────
      // The timeline fetch uses is_not_empty, so unscheduled intake items
      // (Form Requests / Ready for Assignment) are never in `normalized`.
      // We load them separately from the intake cache and apply the pipeline filter.
      if (weekOffset === 1) {
        const intakeCacheEntry = await fetchBoardCached(boardId, columnMapping, allGroups, "intake", false);
        const intakeNormalized = intakeCacheEntry.items
          .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
          .filter((i): i is NonNullable<typeof i> => i !== null);

        const depts = Array.from(new Set(intakeNormalized.map(i => i.department))).join(", ");
        console.log(`[pipeline] intake items: ${intakeNormalized.length}, departments: ${depts}`);


        const scheduledIds = new Set(filtered.map((i) => i.id));
        const pipeline = getPipelineTasks(intakeNormalized, weekWindow, scheduledIds);

        console.log(`[pipeline] qualified: ${pipeline.length}`);
        filtered = [...filtered, ...pipeline];
      }

      filtered.sort((a, b) => {
        // Pipeline (no timeline) tasks sink to the bottom
        if (!a.timelineEnd && !b.timelineEnd) return 0;
        if (!a.timelineEnd) return 1;
        if (!b.timelineEnd) return -1;
        return new Date(a.timelineEnd).getTime() - new Date(b.timelineEnd).getTime();
      });
    }

    const age = Date.now() - cacheEntry.fetchedAt;

    // Parse all known product names from the product column's dropdown settings
    // so the summary panel shows every product even if count = 0
    const productCol = columns.find((c) => c.id === columnMapping.product);
    let knownProducts: string[] | undefined;
    if (productCol?.settings_str) {
      try {
        const settings = JSON.parse(productCol.settings_str) as { labels?: Record<string, string> };
        knownProducts = Object.values(settings.labels ?? {}).filter((v) => v && v !== "-");
      } catch { /* ignore parse errors */ }
    }

    return NextResponse.json({
      items: filtered,
      productSummary: buildProductSummary(filtered, knownProducts),
      columnMapping,
      total: filtered.length,
      cached: age < BOARD_ITEM_TTL,
      cacheAgeSeconds: Math.round(age / 1000),
    });
  } catch (err) {
    console.error("[/api/items]", err);
    return NextResponse.json({ error: "Failed to fetch items", detail: String(err) }, { status: 500 });
  }
}
