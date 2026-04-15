"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, UserCheck, CalendarDays, BarChart3, ClipboardList } from "lucide-react";
import type { BoardType, DashboardItem, PlannedTask } from "@/lib/types";
import { getWeekWindow, cn } from "@/lib/utils";
import { toWeekKey } from "@/lib/targets";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";

interface BoardsData {
  video: { id: string; name: string } | null;
  design: { id: string; name: string } | null;
}

interface WeekData {
  items: DashboardItem[];
  productSummary: { product: string; total: number; byStatus: Record<string, number> }[];
  total: number;
}

interface AllWeeksData {
  lastWeek: WeekData;
  thisWeek: WeekData;
  nextWeek: WeekData;
}

// Items with this status (case-insensitive) count as "assigned"
const isAssignedStatus = (status: string) => status.toLowerCase().includes("pending");

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssigningPage() {
  const [activeBoard, setActiveBoard]   = useState<BoardType>("video");
  const [boardsData, setBoardsData]     = useState<BoardsData | null>(null);
  const [allWeeksData, setAllWeeksData] = useState<AllWeeksData | null>(null);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);

  const weekWindow = getWeekWindow(1); // always "next week"
  const weekKey    = toWeekKey(weekWindow.start);

  // ── Load boards ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadBoards() {
      const hit = getCached<BoardsData>("boards");
      if (hit) { setBoardsData(hit); setLoadingBoards(false); return; }
      setLoadingBoards(true);
      try {
        const res = await fetch("/api/boards");
        if (!res.ok) throw new Error("Failed to load boards");
        const data: BoardsData = await res.json();
        setCached("boards", data);
        setBoardsData(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingBoards(false);
      }
    }
    loadBoards();
  }, []);

  // ── Load next week items ────────────────────────────────────────────────────
  const loadItems = useCallback(async (forceRefresh = false) => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    const cacheKey = `allweeks:${boardId}`;

    if (!forceRefresh) {
      const hit = getCached<AllWeeksData>(cacheKey);
      if (hit) { setAllWeeksData(hit); return; }
    }

    setLoadingItems(true);
    setError(null);
    try {
      if (forceRefresh) bustCacheByPrefix(`allweeks:${boardId}`);
      const url = new URL("/api/items", window.location.origin);
      url.searchParams.set("boardId", boardId);
      url.searchParams.set("boardType", activeBoard);
      url.searchParams.set("groups", "all");
      url.searchParams.set("allWeeks", "1");
      if (forceRefresh) url.searchParams.set("refresh", "1");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load items");
      const data: AllWeeksData = await res.json();
      setCached(cacheKey, data);
      setAllWeeksData(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingItems(false);
    }
  }, [activeBoard, boardsData]);

  useEffect(() => {
    if (boardsData) loadItems();
  }, [loadItems, boardsData]);

  // ── Load planned tasks from DB ──────────────────────────────────────────────
  const loadPlannedTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/planned-tasks?boardType=${activeBoard}&weekKey=${weekKey}`);
      if (!res.ok) return;
      const tasks: PlannedTask[] = await res.json();
      setPlannedTasks(tasks);
    } catch { /* silent */ }
  }, [activeBoard, weekKey]);

  useEffect(() => {
    loadPlannedTasks();
  }, [loadPlannedTasks]);

  // ── Board switch ────────────────────────────────────────────────────────────
  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setAllWeeksData(null);
    setPlannedTasks([]);
  };

  // ── Derive data ─────────────────────────────────────────────────────────────
  const nextWeekItems  = allWeeksData?.nextWeek.items ?? [];
  const assignedItems  = nextWeekItems.filter((i) => isAssignedStatus(i.status) && !i.isPipeline);

  // Union of products across assigned Monday items + planned DB tasks
  const productNames = Array.from(new Set([
    ...assignedItems.map((i) => i.product),
    ...plannedTasks.map((t) => t.product),
  ])).filter((p) => p && p !== "—");

  interface ProductData {
    product: string;
    assigned: number;
    planned: number;
    assignedItems: DashboardItem[];
  }

  const productData: ProductData[] = productNames
    .map((product) => ({
      product,
      assigned:      assignedItems.filter((i) => i.product === product).length,
      planned:       plannedTasks.filter((t) => t.product === product).length,
      assignedItems: assignedItems.filter((i) => i.product === product),
    }))
    .filter((p) => p.assigned > 0 || p.planned > 0);

  // Sort: most behind (highest remaining) first; no-plan products go last
  productData.sort((a, b) => {
    const aRemaining = a.planned > 0 ? Math.max(0, a.planned - a.assigned) : -1;
    const bRemaining = b.planned > 0 ? Math.max(0, b.planned - b.assigned) : -1;
    if (bRemaining !== aRemaining) return bRemaining - aRemaining;
    return b.assigned - a.assigned;
  });

  const totalAssigned = assignedItems.length;
  const totalPlanned  = plannedTasks.length;
  const totalPct      = totalPlanned > 0 ? Math.round((totalAssigned / totalPlanned) * 100) : null;

  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* ── Top row ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4">
          {loadingBoards ? (
            <div className="h-11 w-72 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
          ) : (
            <BoardToggle active={activeBoard} onChange={handleBoardSwitch} loading={loadingItems} />
          )}

          {/* Week badge */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600/10 border border-violet-500/20">
            <CalendarDays className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-200">Next Week</span>
            <span className="text-xs text-violet-400/70 hidden sm:inline">{weekWindow.label}</span>
          </div>

          {/* Refresh */}
          <div className="ml-auto flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-zinc-600 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              id="refresh-btn"
              onClick={() => { loadItems(true); loadPlannedTasks(); }}
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

        {/* ── Summary badges ───────────────────────────────────────────────── */}
        {!loadingItems && (totalAssigned > 0 || totalPlanned > 0) && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <UserCheck className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-zinc-300 text-sm font-medium">Assigned</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-violet-300 text-xs font-semibold">
                {totalAssigned}
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-300 text-sm font-medium">Planned</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-emerald-300 text-xs font-semibold">
                {totalPlanned}
              </span>
            </div>
            {totalPct !== null && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium ml-auto">
                <BarChart3 className="w-3 h-3" />
                {totalPct}% assigned
              </span>
            )}
          </div>
        )}

        {/* ── Product grid ─────────────────────────────────────────────────── */}
        {loadingItems ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-28 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : productData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-600 gap-3">
            <UserCheck className="w-12 h-12" />
            <p className="text-base font-medium text-zinc-500">No data yet</p>
            <p className="text-sm text-zinc-600 text-center max-w-xs">
              No pending tasks scheduled for next week, or no planned tasks in the system.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {productData.map((p, idx) => (
              <ProductCard
                key={p.product}
                product={p.product}
                assigned={p.assigned}
                planned={p.planned}
                idx={idx}
              />
            ))}
          </div>
        )}

      </main>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product, assigned, planned, idx,
}: {
  product: string; assigned: number; planned: number; idx: number;
}) {
  const hasPlan   = planned > 0;
  const pct       = hasPlan ? Math.min(assigned / planned, 1) : 0;
  const remaining = hasPlan ? Math.max(0, planned - assigned) : null;

  const barColor = !hasPlan
    ? "bg-zinc-600"
    : pct >= 1   ? "bg-emerald-500"
    : pct >= 0.5 ? "bg-amber-500"
    :              "bg-red-500";

  const countColor = !hasPlan
    ? "text-zinc-500"
    : pct >= 1   ? "text-emerald-400"
    : pct >= 0.5 ? "text-amber-400"
    :              "text-red-400";

  const statusText = !hasPlan          ? null
    : pct >= 1                          ? "Fully assigned ✓"
    : remaining === planned             ? "Not yet assigned"
    : `${remaining} more to assign`;

  const statusColor = !hasPlan
    ? ""
    : pct >= 1   ? "text-emerald-400"
    : pct >= 0.5 ? "text-amber-400"
    :              "text-red-400";

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3 animate-fade-in hover:border-zinc-700 transition-colors"
      style={{ animationDelay: `${idx * 30}ms` }}
    >
      {/* Name + fraction */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2" title={product}>
          {product}
        </p>
        {hasPlan ? (
          <div className="flex-shrink-0 text-right leading-none">
            <span className={cn("text-2xl font-black", countColor)}>{assigned}</span>
            <span className="text-sm text-zinc-600 font-semibold"> / {planned}</span>
          </div>
        ) : (
          <span className={cn("text-2xl font-black flex-shrink-0", countColor)}>{assigned}</span>
        )}
      </div>

      {/* Progress bar + status */}
      {hasPlan && (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", barColor)}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          {statusText && (
            <p className={cn("text-xs font-medium", statusColor)}>{statusText}</p>
          )}
        </div>
      )}

      {!hasPlan && (
        <p className="text-xs text-zinc-700">No planned tasks drafted</p>
      )}
    </div>
  );
}
