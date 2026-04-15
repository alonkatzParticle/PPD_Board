/**
 * Server-side item fetching — shared between API routes and Server Components.
 * The module-level cache is shared across all callers in the same Node.js process,
 * so a Server Component render and a subsequent API call both benefit from the same
 * in-memory cache.
 *
 * Cache hierarchy:
 *  1. In-memory Map  — 0 ms  (lost on restart)
 *  2. Postgres DB    — ~50ms (survives restarts, cold starts, deployments)
 *  3. Monday.com API — 5-15s (only when cache is cold or force-refreshed)
 */

import { mondayQuery } from "./monday";
import { hasDb, getItemsCache, setItemsCache, ensureSchema } from "./db";
import {
  normalizeMondayItem, detectColumnMapping, buildProductSummary,
  filterByWeekWindow, getWeekWindow, getPipelineTasks,
} from "./utils";
import type {
  BoardType, MondayItem, ColumnMapping, ItemsMode, DashboardItem, ProductSummary,
} from "./types";

// ── Exported types ────────────────────────────────────────────────────────────

export interface WeekData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
}

export interface AllWeeksData {
  lastWeek: WeekData;
  thisWeek: WeekData;
  nextWeek: WeekData;
  cached?: boolean;
  cacheAgeSeconds?: number;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface ColumnsAndGroupsResponse {
  boards: {
    columns: { id: string; title: string; type: string; settings_str: string }[];
    groups: { id: string; title: string }[];
  }[];
}

interface BoardPageResponse {
  boards: {
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

// ── Module-level cache (shared across all callers in the same process) ────────

export const boardItemCache = new Map<string, BoardCache>();
export const inflightFetches = new Map<string, Promise<BoardCache>>();
export const BOARD_ITEM_TTL = 5 * 60 * 1000; // 5 minutes

const INTAKE_STAGE_KEYWORDS = ["form request", "pending", "ready for assignment"];

const GET_COLS_AND_GROUPS = `
  query GetColsAndGroups($boardId: ID!) {
    boards(ids: [$boardId]) {
      columns { id title type settings_str }
      groups { id title }
    }
  }`;

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildItemFields(colIds: string[]): string {
  const filter = colIds.length > 0
    ? `ids: [${colIds.map((id) => `"${id}"`).join(", ")}]`
    : "";
  return `id name group { id title } column_values(${filter}) { id text value type }`;
}

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

async function fetchIntakeItems(
  boardId: string,
  columnMapping: ColumnMapping,
  allGroups: { id: string; title: string }[]
): Promise<MondayItem[]> {
  const intakeGroupIds = allGroups
    .filter((g) => INTAKE_STAGE_KEYWORDS.some((kw) => g.title.toLowerCase().includes(kw)))
    .map((g) => g.id);

  if (intakeGroupIds.length === 0) return [];

  const colIds = [
    columnMapping.timeline, columnMapping.department,
    columnMapping.product, columnMapping.status,
  ].filter(Boolean) as string[];

  const itemFields = buildItemFields(colIds);
  const groupIdsArg = intakeGroupIds.map((id) => `"${id}"`).join(", ");

  const data = await mondayQuery<GroupPageResponse>(`
    query {
      boards(ids: [${boardId}]) {
        groups(ids: [${groupIdsArg}]) {
          id title
          items_page(limit: 500) { cursor items { ${itemFields} } }
        }
      }
    }
  `);

  const all: MondayItem[] = [];
  for (const group of data.boards[0]?.groups ?? []) {
    const page = group.items_page;
    all.push(...await drainCursor(page.items ?? [], page.cursor ?? null, itemFields));
  }
  return all;
}

async function fetchTimelineItems(
  boardId: string,
  columnMapping: ColumnMapping
): Promise<MondayItem[]> {
  const colIds = [
    columnMapping.timeline, columnMapping.department,
    columnMapping.product, columnMapping.status,
  ].filter(Boolean) as string[];

  const itemFields = buildItemFields(colIds);
  const queryParams = columnMapping.timeline
    ? `query_params: { rules: [{ column_id: "${columnMapping.timeline}", compare_value: [], operator: is_not_empty }] }`
    : "";

  const firstData = await mondayQuery<BoardPageResponse>(`
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 500, ${queryParams}) { cursor items { ${itemFields} } }
      }
    }
  `);

  const page = firstData.boards[0]?.items_page;
  return drainCursor(page?.items ?? [], page?.cursor ?? null, itemFields);
}

// ── Cached fetch ──────────────────────────────────────────────────────────────

export async function fetchBoardCached(
  boardId: string,
  columnMapping: ColumnMapping,
  allGroups: { id: string; title: string }[],
  mode: ItemsMode,
  force = false
): Promise<BoardCache> {
  const cacheKey = `${boardId}:${mode}`;

  if (!force) {
    const mem = boardItemCache.get(cacheKey);
    if (mem && Date.now() - mem.fetchedAt < BOARD_ITEM_TTL) return mem;
  }

  if (!force && hasDb()) {
    try {
      await ensureSchema();
      const db = await getItemsCache(boardId, mode);
      if (db) {
        const age = Date.now() - db.fetchedAt.getTime();
        if (age < BOARD_ITEM_TTL) {
          const cached: BoardCache = { items: db.items, columnMapping: db.columnMapping, fetchedAt: db.fetchedAt.getTime() };
          boardItemCache.set(cacheKey, cached);
          return cached;
        }
      }
    } catch { /* DB unavailable — continue */ }
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

      if (hasDb()) {
        setItemsCache(boardId, mode, items, columnMapping).catch(() => {});
      }

      return result;
    } finally {
      inflightFetches.delete(cacheKey);
    }
  })();

  inflightFetches.set(cacheKey, promise);
  return promise;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getBoardMetadata(boardId: string) {
  const meta = await mondayQuery<ColumnsAndGroupsResponse>(GET_COLS_AND_GROUPS, { boardId });
  const columns = meta.boards[0]?.columns ?? [];
  const allGroups = meta.boards[0]?.groups ?? [];
  const columnMapping = detectColumnMapping(columns);

  const productCol = columns.find((c) => c.id === columnMapping.product);
  let knownProducts: string[] | undefined;
  if (productCol?.settings_str) {
    try {
      const settings = JSON.parse(productCol.settings_str) as { labels?: Record<string, string> };
      knownProducts = Object.values(settings.labels ?? {}).filter((v) => v && v !== "-");
    } catch { /* ignore */ }
  }

  return { columns, allGroups, columnMapping, knownProducts };
}

export function buildWeekData(
  normalized: DashboardItem[],
  intakeNormalized: DashboardItem[],
  columnMapping: ColumnMapping,
  knownProducts: string[] | undefined,
  offset: number
): WeekData {
  const weekWindow = getWeekWindow(offset);
  let filtered = filterByWeekWindow(normalized, weekWindow);

  if (offset === 1) {
    const scheduledIds = new Set(filtered.map((i) => i.id));
    const pipeline = getPipelineTasks(intakeNormalized, weekWindow, scheduledIds);
    filtered = [...filtered, ...pipeline];
  }

  filtered.sort((a, b) => {
    if (!a.timelineEnd && !b.timelineEnd) return 0;
    if (!a.timelineEnd) return 1;
    if (!b.timelineEnd) return -1;
    return new Date(a.timelineEnd).getTime() - new Date(b.timelineEnd).getTime();
  });

  return {
    items: filtered,
    productSummary: buildProductSummary(filtered, knownProducts),
    columnMapping,
    total: filtered.length,
  };
}

// ── Groups ────────────────────────────────────────────────────────────────────

interface GroupsResponse {
  boards: { groups: { id: string; title: string; color?: string }[] }[];
}

export async function getBoardGroups(
  boardId: string
): Promise<{ id: string; title: string; color?: string }[]> {
  const data = await mondayQuery<GroupsResponse>(`
    query { boards(ids: [${boardId}]) { groups { id title color } } }
  `);
  return data.boards[0]?.groups ?? [];
}

// ── Intake ────────────────────────────────────────────────────────────────────

export interface IntakeData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
  cached: boolean;
  cacheAgeSeconds: number;
}

export async function getIntakeData(
  boardId: string,
  boardType: BoardType,
  force = false
): Promise<IntakeData> {
  const { allGroups, columnMapping, knownProducts } = await getBoardMetadata(boardId);
  const entry = await fetchBoardCached(boardId, columnMapping, allGroups, "intake", force);
  const age   = Date.now() - entry.fetchedAt;

  const items = entry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items,
    productSummary: buildProductSummary(items, knownProducts),
    columnMapping,
    total:           items.length,
    cached:          age < BOARD_ITEM_TTL,
    cacheAgeSeconds: Math.round(age / 1000),
  };
}

// ── All weeks ─────────────────────────────────────────────────────────────────

export async function getAllWeeksData(
  boardId: string,
  boardType: BoardType,
  force = false
): Promise<AllWeeksData> {
  const { allGroups, columnMapping, knownProducts } = await getBoardMetadata(boardId);

  const [cacheEntry, intakeCacheEntry] = await Promise.all([
    fetchBoardCached(boardId, columnMapping, allGroups, "timeline", force),
    fetchBoardCached(boardId, columnMapping, allGroups, "intake", force),
  ]);

  const age = Date.now() - cacheEntry.fetchedAt;

  const normalized = cacheEntry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, false))
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const intakeNormalized = intakeCacheEntry.items
    .map((i) => normalizeMondayItem(i, boardType, columnMapping, true))
    .filter((i): i is NonNullable<typeof i> => i !== null);

  return {
    lastWeek:  buildWeekData(normalized, intakeNormalized, columnMapping, knownProducts, -1),
    thisWeek:  buildWeekData(normalized, intakeNormalized, columnMapping, knownProducts, 0),
    nextWeek:  buildWeekData(normalized, intakeNormalized, columnMapping, knownProducts, 1),
    cached:    age < BOARD_ITEM_TTL,
    cacheAgeSeconds: Math.round(age / 1000),
  };
}
