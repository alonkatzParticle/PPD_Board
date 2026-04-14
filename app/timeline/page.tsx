"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, BarChart3 } from "lucide-react";
import type { BoardType, MondayGroup, DashboardItem, ProductSummary, ColumnMapping } from "@/lib/types";
import { getWeekWindow, cn } from "@/lib/utils";
import { toWeekKey } from "@/lib/targets";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { GroupFilter } from "@/components/GroupFilter";
import { TaskTable } from "@/components/TaskTable";
import { ProductSummaryPanel } from "@/components/ProductSummaryPanel";

interface BoardsData {
  video: { id: string; name: string } | null;
  design: { id: string; name: string } | null;
}

interface WeekData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
}

interface AllWeeksData {
  lastWeek: WeekData;
  thisWeek: WeekData;
  nextWeek: WeekData;
}

// ── Fetch all 3 week views in ONE API call ─────────────────────────────────
async function fetchAllWeeks(
  boardId: string,
  boardType: BoardType,
  force = false
): Promise<AllWeeksData> {
  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("boardId", boardId);
  url.searchParams.set("boardType", boardType);
  url.searchParams.set("groups", "all");
  url.searchParams.set("allWeeks", "1");
  if (force) url.searchParams.set("refresh", "1");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to load items");
  return res.json() as Promise<AllWeeksData>;
}

// ── Prefetch both boards in background ────────────────────────────────────
async function prefetchAll(boardsData: BoardsData) {
  const boards: BoardType[] = ["video", "design"];
  await Promise.allSettled(
    boards.map(async (boardType) => {
      const boardId = boardsData[boardType]?.id;
      if (!boardId) return;
      const cacheKey = `allweeks:${boardId}`;
      if (getCached(cacheKey)) return; // already warm
      try {
        const data = await fetchAllWeeks(boardId, boardType);
        setCached(cacheKey, data);
      } catch { /* silent */ }
    })
  );
}

// ── Map weekOffset → key in AllWeeksData ──────────────────────────────────
const WEEK_KEYS: Record<number, keyof AllWeeksData> = { [-1]: "lastWeek", 0: "thisWeek", 1: "nextWeek" };

export default function DashboardPage() {
  const [activeBoard, setActiveBoard] = useState<BoardType>("video");
  const [boardsData, setBoardsData] = useState<BoardsData | null>(null);
  const [groups, setGroups] = useState<MondayGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [allWeeksData, setAllWeeksData] = useState<AllWeeksData | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [hasNewData, setHasNewData] = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 1: Load boards then kick off prefetch for both boards ────────────
  useEffect(() => {
    async function loadBoards() {
      const hit = getCached<BoardsData>("boards");
      if (hit) {
        setBoardsData(hit);
        setLoadingBoards(false);
        prefetchAll(hit);
        return;
      }
      setLoadingBoards(true);
      try {
        const res = await fetch("/api/boards");
        if (!res.ok) throw new Error("Failed to load boards");
        const data: BoardsData = await res.json();
        setCached("boards", data);
        setBoardsData(data);
        prefetchAll(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingBoards(false);
      }
    }
    loadBoards();
  }, []);

  // ── Step 2: Load groups when board changes (cached) ───────────────────────
  useEffect(() => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    async function loadGroups() {
      const cacheKey = `groups:${boardId}`;
      const hit = getCached<MondayGroup[]>(cacheKey);
      if (hit) { setGroups(hit); return; }

      setLoadingGroups(true);
      setSelectedGroups([]);
      try {
        const res = await fetch(`/api/groups?boardId=${boardId}`);
        if (!res.ok) throw new Error("Failed to load groups");
        const data = await res.json();
        setCached(cacheKey, data.groups ?? []);
        setGroups(data.groups ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingGroups(false);
      }
    }
    loadGroups();
  }, [activeBoard, boardsData]);

  // ── Step 3: Load all weeks — ONE fetch per board, cached ──────────────────
  const loadAllWeeks = useCallback(async (forceRefresh = false, silent = false) => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    const cacheKey = `allweeks:${boardId}`;

    if (!forceRefresh) {
      const hit = getCached<AllWeeksData>(cacheKey);
      if (hit) { setAllWeeksData(hit); return; }
    }

    if (!silent) setLoadingItems(true);
    setError(null);

    try {
      if (forceRefresh) bustCacheByPrefix(`allweeks:${boardId}`);
      const data = await fetchAllWeeks(boardId, activeBoard, forceRefresh);
      setCached(cacheKey, data);

      if (silent) {
        setAllWeeksData((prev) => {
          const prevTotal = prev?.thisWeek.total ?? -1;
          if (prevTotal !== data.thisWeek.total) {
            setHasNewData(true);
            setTimeout(() => setHasNewData(false), 4000);
            return data;
          }
          return prev;
        });
      } else {
        setAllWeeksData(data);
      }
      setLastRefresh(new Date());
    } catch (e) {
      if (!silent) setError((e as Error).message);
    } finally {
      if (!silent) setLoadingItems(false);
    }
  }, [activeBoard, boardsData]);

  // Trigger when board or groups data is ready
  useEffect(() => {
    if (!loadingGroups && boardsData) {
      loadAllWeeks();
    }
  }, [loadAllWeeks, loadingGroups, boardsData]);

  // ── Background refresh every 5 min — re-warms both boards ────────────────
  useEffect(() => {
    if (!boardsData) return;
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);

    refreshIntervalRef.current = setInterval(async () => {
      const boards: BoardType[] = ["video", "design"];
      for (const b of boards) {
        const id = boardsData[b]?.id;
        if (id) bustCacheByPrefix(`allweeks:${id}`);
      }
      await prefetchAll(boardsData);
      loadAllWeeks(false, true);
    }, 5 * 60 * 1000);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [boardsData, loadAllWeeks]);

  // ── Board switch — instant from cache ────────────────────────────────────
  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setWeekOffset(0);
    // Don't null allWeeksData — keep previous board visible while new loads from cache
  };

  // ── Derive current week's data from cached allWeeks ───────────────────────
  const itemsData: WeekData | null = allWeeksData
    ? allWeeksData[WEEK_KEYS[weekOffset] ?? "thisWeek"]
    : null;

  // If user has a group filter active, filter client-side (no extra fetch needed)
  const filteredItemsData: WeekData | null = (() => {
    if (!itemsData || selectedGroups.length === 0) return itemsData;
    const filtered = itemsData.items.filter((i) =>
      selectedGroups.includes((i as { groupId?: string }).groupId ?? "")
    );
    return { ...itemsData, items: filtered, total: filtered.length };
  })();

  const weekWindow = getWeekWindow(weekOffset);
  const overdueCount = filteredItemsData?.items.filter((i) => i.isOverdue).length ?? 0;
  const dueSoonCount = filteredItemsData?.items.filter((i) => i.isDueSoon && !i.isOverdue).length ?? 0;

  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">
        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* ── Row 1: Board toggle + Group filter + Refresh ── */}
        <div className="flex flex-wrap items-center gap-4">
          {loadingBoards ? (
            <div className="h-11 w-72 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
          ) : (
            <BoardToggle active={activeBoard} onChange={handleBoardSwitch} loading={loadingItems} />
          )}

          <GroupFilter
            groups={groups}
            selectedIds={selectedGroups}
            onChange={setSelectedGroups}
            loading={loadingGroups}
          />

          <div className="ml-auto flex items-center gap-3">
            {hasNewData && (
              <span className="text-xs text-emerald-400 font-medium animate-pulse hidden sm:block">
                ● Updated
              </span>
            )}
            {lastRefresh && !hasNewData && (
              <span className="text-xs text-zinc-600 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              id="refresh-btn"
              onClick={() => loadAllWeeks(true)}
              disabled={loadingItems}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-700",
                loadingItems && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loadingItems && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Row 2: Week tabs + stats ── */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            {([
              { label: "Last Week", offset: -1 },
              { label: "This Week", offset: 0  },
            ] as const).map(({ label, offset }) => (
              <button
                key={offset}
                id={`week-tab-${offset}`}
                onClick={() => setWeekOffset(offset)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  weekOffset === offset
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!loadingItems && filteredItemsData && (
            <div className="flex items-center gap-2 ml-auto">
              {weekOffset !== 0 && overdueCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-950/60 border border-red-800/50 text-red-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {overdueCount} overdue
                </span>
              )}
              {weekOffset !== 0 && dueSoonCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {dueSoonCount} due soon
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
                <BarChart3 className="w-3 h-3" />
                {filteredItemsData.total} tasks
              </span>
            </div>
          )}
        </div>

        {/* ── Product Summary ── */}
        <ProductSummaryPanel
          summary={filteredItemsData?.productSummary ?? []}
          totalItems={filteredItemsData?.total ?? 0}
          loading={loadingItems}
          allItems={filteredItemsData?.items ?? []}
          boardType={activeBoard}
          weekKey={toWeekKey(weekWindow.start)}
          weekOffset={weekOffset}
        />

        {/* ── Task Table ── */}
        <TaskTable items={filteredItemsData?.items ?? []} loading={loadingItems} hideOverdue={weekOffset === 0} />
      </main>
    </div>
  );
}
