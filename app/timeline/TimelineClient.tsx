"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, BarChart3 } from "lucide-react";
import type { BoardType, MondayGroup, ProductSummary, ColumnMapping } from "@/lib/types";
import { BOARD_IDS } from "@/lib/types";
import { getWeekWindow, cn } from "@/lib/utils";
import { toWeekKey } from "@/lib/targets";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { GroupFilter } from "@/components/GroupFilter";
import { TaskTable } from "@/components/TaskTable";
import { ProductSummaryPanel } from "@/components/ProductSummaryPanel";
import type { AllWeeksData } from "@/lib/items-server";

interface TimelineClientProps {
  initialBoard: BoardType;
  initialAllWeeksData: AllWeeksData | null;
  initialGroups: { id: string; title: string; color?: string }[];
}

interface WeekData {
  items: ReturnType<typeof Array.prototype.filter>[0][];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
}

const WEEK_KEYS: Record<number, keyof AllWeeksData> = { [-1]: "lastWeek", 0: "thisWeek", 1: "nextWeek" };

export function TimelineClient({
  initialBoard, initialAllWeeksData, initialGroups,
}: TimelineClientProps) {
  const [activeBoard, setActiveBoard]     = useState<BoardType>(initialBoard);
  const [groups, setGroups]               = useState<MondayGroup[]>(initialGroups);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [allWeeksData, setAllWeeksData]   = useState<AllWeeksData | null>(initialAllWeeksData);
  const [weekOffset, setWeekOffset]       = useState(0);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);
  const [hasNewData, setHasNewData]       = useState(false);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const itemsLoadSkipped  = useRef(!!initialAllWeeksData);
  const groupsLoadSkipped = useRef(initialGroups.length > 0);
  const initialBoardRef   = useRef(initialBoard);

  // Load groups — skip on initial board if SSR provided them
  const loadGroups = useCallback(async () => {
    const boardId  = BOARD_IDS[activeBoard];
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
  }, [activeBoard]);

  useEffect(() => {
    if (groupsLoadSkipped.current && activeBoard === initialBoardRef.current) {
      groupsLoadSkipped.current = false;
      return;
    }
    loadGroups();
  }, [loadGroups, activeBoard]);

  // Load all weeks
  const loadAllWeeks = useCallback(async (forceRefresh = false, silent = false, bypassServerCache = forceRefresh) => {
    const boardId  = BOARD_IDS[activeBoard];
    const cacheKey = `allweeks:${boardId}`;

    if (!forceRefresh) {
      const hit = getCached<AllWeeksData>(cacheKey);
      if (hit) { setAllWeeksData(hit); return; }
    }

    if (!silent) setLoadingItems(true);
    setError(null);
    try {
      if (forceRefresh) bustCacheByPrefix(`allweeks:${boardId}`);
      const url = new URL("/api/items", window.location.origin);
      url.searchParams.set("boardId", boardId);
      url.searchParams.set("boardType", activeBoard);
      url.searchParams.set("groups", "all");
      url.searchParams.set("allWeeks", "1");
      if (bypassServerCache) url.searchParams.set("refresh", "1");
      url.searchParams.set("_t", Date.now().toString());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load items");
      const data: AllWeeksData = await res.json();
      setCached(cacheKey, data);

      if (silent) {
        setAllWeeksData((prev) => {
          const prevTotal = (prev as AllWeeksData | null)?.thisWeek?.total ?? -1;
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
  }, [activeBoard]);

  useEffect(() => {
    if (itemsLoadSkipped.current) { itemsLoadSkipped.current = false; return; }
    loadAllWeeks();
  }, [loadAllWeeks]);

  // Background refresh every 1 min during Israeli working hours
  useEffect(() => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(() => {
      const hour = new Date().getHours();
      if (hour >= 8 && hour < 18) {
        loadAllWeeks(true, true, false); // Bypass client cache, hit SWR Postgres cache
      }
    }, 60 * 1000);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [loadAllWeeks]);

  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setWeekOffset(0);
    setSelectedGroups([]);
  };

  // Derive current week data
  const itemsData = allWeeksData
    ? (allWeeksData[WEEK_KEYS[weekOffset] ?? "thisWeek"] as WeekData)
    : null;

  const filteredItemsData = (() => {
    if (!itemsData || selectedGroups.length === 0) return itemsData;
    const filtered = itemsData.items.filter((i: { groupId?: string }) =>
      selectedGroups.includes(i.groupId ?? "")
    );
    return { ...itemsData, items: filtered, total: filtered.length };
  })();

  const weekWindow    = getWeekWindow(weekOffset);
  const overdueCount  = filteredItemsData?.items.filter((i: { isOverdue: boolean }) => i.isOverdue).length ?? 0;
  const dueSoonCount  = filteredItemsData?.items.filter((i: { isDueSoon: boolean; isOverdue: boolean }) => i.isDueSoon && !i.isOverdue).length ?? 0;

  const isInitialLoading = loadingItems && !allWeeksData;

  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Row 1 */}
        <div className="flex flex-wrap items-center gap-4">
          <BoardToggle active={activeBoard} onChange={handleBoardSwitch} loading={isInitialLoading} />

          <GroupFilter groups={groups} selectedIds={selectedGroups} onChange={setSelectedGroups} loading={loadingGroups} />

          <div className="ml-auto flex items-center gap-3">
            {hasNewData && <span className="text-xs text-emerald-400 font-medium animate-pulse hidden sm:block">● Updated</span>}
            {lastRefresh && !hasNewData && <span className="text-xs text-zinc-600 hidden sm:block">Updated {lastRefresh.toLocaleTimeString()}</span>}
            <button
              id="refresh-btn"
              onClick={async () => {
                setIsRefreshing(true);
                await loadAllWeeks(true, true, true);
                setIsRefreshing(false);
              }}
              disabled={isRefreshing}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-700",
                isRefreshing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Row 2: Week tabs + stats */}
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
                  weekOffset === offset ? "bg-violet-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!isInitialLoading && filteredItemsData && (
            <div className="flex items-center gap-2 ml-auto">
              {weekOffset !== 0 && overdueCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-950/60 border border-red-800/50 text-red-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{overdueCount} overdue
                </span>
              )}
              {weekOffset !== 0 && dueSoonCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{dueSoonCount} due soon
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
                <BarChart3 className="w-3 h-3" />{filteredItemsData.total} tasks
              </span>
            </div>
          )}
        </div>

        <ProductSummaryPanel
          summary={filteredItemsData?.productSummary ?? []}
          totalItems={filteredItemsData?.total ?? 0}
          loading={isInitialLoading}
          allItems={filteredItemsData?.items ?? []}
          boardType={activeBoard}
          weekKey={toWeekKey(weekWindow.start)}
          weekOffset={weekOffset}
        />

        <TaskTable items={filteredItemsData?.items ?? []} loading={isInitialLoading} hideOverdue={weekOffset === 0} />
      </main>
    </div>
  );
}
