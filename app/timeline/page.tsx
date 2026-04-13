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

interface ItemsData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
}

// ── Pure fetch helper (no React state, safe to call anywhere) ──────────────
async function fetchItems(
  boardId: string,
  boardType: BoardType,
  groupsParam: string,
  weekOffset: number,
  force = false
): Promise<ItemsData> {
  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("boardId", boardId);
  url.searchParams.set("boardType", boardType);
  url.searchParams.set("groups", groupsParam);
  url.searchParams.set("weekOffset", String(weekOffset));
  if (force) url.searchParams.set("refresh", "1");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to load items");
  return res.json() as Promise<ItemsData>;
}

// ── Prefetch all week offsets + all boards in the background ───────────────
// Fires silently after initial boards load so every tab/board switch is instant.
async function prefetchAll(boardsData: BoardsData) {
  const boards: BoardType[] = ["video", "design"];
  const offsets = [-1, 0, 1];

  await Promise.allSettled(
    boards.flatMap((boardType) => {
      const boardId = boardsData[boardType]?.id;
      if (!boardId) return [];
      return offsets.map(async (offset) => {
        const cacheKey = `items:timeline:${boardId}:all:${offset}`;
        if (getCached(cacheKey)) return; // already warm — skip
        try {
          const data = await fetchItems(boardId, boardType, "all", offset);
          setCached(cacheKey, data);
        } catch {
          // prefetch failure is silent — user will see a spinner on demand
        }
      });
    })
  );
}

export default function DashboardPage() {
  const [activeBoard, setActiveBoard] = useState<BoardType>("video");
  const [boardsData, setBoardsData] = useState<BoardsData | null>(null);
  const [groups, setGroups] = useState<MondayGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [itemsData, setItemsData] = useState<ItemsData | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [hasNewData, setHasNewData] = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 1: Load board IDs (cached + prefetch everything) ────────────────
  useEffect(() => {
    async function loadBoards() {
      const hit = getCached<BoardsData>("boards");
      if (hit) {
        setBoardsData(hit);
        setLoadingBoards(false);
        // Still prefetch in case any week offsets are stale
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
        // Kick off background prefetch for all boards × all weeks
        prefetchAll(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingBoards(false);
      }
    }
    loadBoards();
  }, []);

  // ── Step 2: Load groups when board changes (cached) ──────────────────────
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

  // ── Step 3: Load items — reads from cache first, never blocks tab switches ─
  const loadItems = useCallback(async (forceRefresh = false, silent = false) => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    const groupsParam = selectedGroups.length > 0 ? selectedGroups.join(",") : "all";
    const cacheKey = `items:timeline:${boardId}:${groupsParam}:${weekOffset}`;

    // Always check cache first — tab switches are instant if prefetch ran
    if (!forceRefresh) {
      const hit = getCached<ItemsData>(cacheKey);
      if (hit) {
        setItemsData(hit);
        return;
      }
    }

    if (!silent) setLoadingItems(true);
    setError(null);

    try {
      if (forceRefresh) bustCacheByPrefix(`items:timeline:${boardId}`);
      const data = await fetchItems(boardId, activeBoard, groupsParam, weekOffset, forceRefresh);
      setCached(cacheKey, data);

      if (silent) {
        setItemsData((prev) => {
          if (prev?.total !== data.total) {
            setHasNewData(true);
            setTimeout(() => setHasNewData(false), 4000);
            return data;
          }
          return prev;
        });
      } else {
        setItemsData(data);
      }
      setLastRefresh(new Date());
    } catch (e) {
      if (!silent) setError((e as Error).message);
    } finally {
      if (!silent) setLoadingItems(false);
    }
  }, [activeBoard, selectedGroups, weekOffset, boardsData]);

  // Trigger on dependency change
  useEffect(() => {
    if (!loadingGroups && boardsData) {
      loadItems();
    }
  }, [loadItems, loadingGroups, boardsData]);

  // ── Background refresh every 5 min — refreshes all cached combinations ───
  useEffect(() => {
    if (!boardsData) return;
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);

    refreshIntervalRef.current = setInterval(async () => {
      // Bust and re-prefetch all boards × all weeks
      const boards: BoardType[] = ["video", "design"];
      for (const boardType of boards) {
        const boardId = boardsData[boardType]?.id;
        if (!boardId) continue;
        bustCacheByPrefix(`items:timeline:${boardId}`);
      }
      await prefetchAll(boardsData);

      // Then silently refresh the current view
      loadItems(false, true);
    }, 5 * 60 * 1000);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [boardsData, loadItems]);

  // ── Board switch — instant if prefetch warmed the cache ──────────────────
  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setWeekOffset(0);
    // Don't null itemsData — keep showing old board while new one loads from cache
    // (loadItems will update it instantly if cached)
  };

  const weekWindow = getWeekWindow(weekOffset);
  const overdueCount = itemsData?.items.filter((i) => i.isOverdue).length ?? 0;
  const dueSoonCount = itemsData?.items.filter((i) => i.isDueSoon && !i.isOverdue).length ?? 0;

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
              onClick={() => loadItems(true)}
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
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            {([
              { label: "Last Week", offset: -1 },
              { label: "This Week", offset: 0  },
              { label: "Next Week", offset: 1  },
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

          {!loadingItems && itemsData && (
            <div className="flex items-center gap-2 ml-auto">
              {overdueCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-950/60 border border-red-800/50 text-red-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {overdueCount} overdue
                </span>
              )}
              {dueSoonCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {dueSoonCount} due soon
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
                <BarChart3 className="w-3 h-3" />
                {itemsData.total} tasks
              </span>
            </div>
          )}
        </div>

        {/* ── Product Summary ── */}
        <ProductSummaryPanel
          summary={itemsData?.productSummary ?? []}
          totalItems={itemsData?.total ?? 0}
          loading={loadingItems}
          allItems={itemsData?.items ?? []}
          boardType={activeBoard}
          weekKey={toWeekKey(weekWindow.start)}
          weekOffset={weekOffset}
        />

        {/* ── Task Table ── */}
        <TaskTable items={itemsData?.items ?? []} loading={loadingItems} />
      </main>
    </div>
  );
}
