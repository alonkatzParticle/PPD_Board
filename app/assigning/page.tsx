"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, UserCheck, CalendarDays, BarChart3, X } from "lucide-react";
import type { BoardType, DashboardItem } from "@/lib/types";
import { getWeekWindow, cn, formatDate } from "@/lib/utils";
import { toWeekKey, fetchWeekGoals, type WeekGoals } from "@/lib/targets";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { StatusBadge } from "@/components/StatusBadge";

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
  const [goals, setGoals]               = useState<WeekGoals>({ totalTarget: null, products: {} });
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
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

  // ── Load goals (per-product weekly targets) ─────────────────────────────────
  useEffect(() => {
    fetchWeekGoals(activeBoard, weekKey).then(setGoals);
  }, [activeBoard, weekKey]);

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

  // ── Board switch ────────────────────────────────────────────────────────────
  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setAllWeeksData(null);
    setGoals({ totalTarget: null, products: {} });
    setSelectedProduct(null);
  };

  // ── Derive data ─────────────────────────────────────────────────────────────
  const nextWeekItems  = allWeeksData?.nextWeek.items ?? [];
  const assignedItems  = nextWeekItems.filter((i) => isAssignedStatus(i.status) && !i.isPipeline);

  // All products that have assigned tasks OR have a goal set
  const productNames = Array.from(new Set([
    ...assignedItems.map((i) => i.product),
    ...Object.keys(goals.products),
  ])).filter((p) => p && p !== "—");

  interface ProductData {
    product: string;
    assigned: number;
    goal: number | null;
    items: DashboardItem[];
  }

  const productData: ProductData[] = productNames
    .map((product) => ({
      product,
      assigned: assignedItems.filter((i) => i.product === product).length,
      goal:     goals.products[product] ?? null,
      items:    assignedItems.filter((i) => i.product === product),
    }))
    .filter((p) => p.assigned > 0 || p.goal !== null);

  // Sort: most behind (highest goal - assigned) first; no-goal products go last
  productData.sort((a, b) => {
    const aRemaining = a.goal !== null ? Math.max(0, a.goal - a.assigned) : -1;
    const bRemaining = b.goal !== null ? Math.max(0, b.goal - b.assigned) : -1;
    if (bRemaining !== aRemaining) return bRemaining - aRemaining;
    return b.assigned - a.assigned;
  });

  const totalAssigned = assignedItems.length;
  const totalGoal     = Object.values(goals.products).reduce((s, v) => s + v, 0);

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
              onClick={() => { loadItems(true); fetchWeekGoals(activeBoard, weekKey).then(setGoals); }}
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
        {!loadingItems && (totalAssigned > 0 || totalGoal > 0) && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <UserCheck className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-zinc-300 text-sm font-medium">Assigned</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-violet-300 text-xs font-semibold">
                {totalAssigned}
              </span>
            </div>
            {totalGoal > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-300 text-sm font-medium">Goal</span>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-emerald-300 text-xs font-semibold">
                  {totalGoal}
                </span>
              </div>
            )}
            {totalGoal > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium ml-auto">
                <BarChart3 className="w-3 h-3" />
                {Math.round((totalAssigned / totalGoal) * 100)}% of goal assigned
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
              No pending tasks scheduled for next week, or no product goals set in Planning.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {productData.map((p, idx) => (
              <ProductCard
                key={p.product}
                product={p.product}
                assigned={p.assigned}
                goal={p.goal}
                idx={idx}
                onClick={() => setSelectedProduct(p.product)}
              />
            ))}
          </div>
        )}

        {/* ── Task modal ───────────────────────────────────────────────────── */}
        {selectedProduct && (() => {
          const pd = productData.find((p) => p.product === selectedProduct);
          const modalItems = pd?.items ?? [];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedProduct(null)}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <div
                className="relative z-10 w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                  <div>
                    <p className="text-base font-semibold text-zinc-100">{selectedProduct}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {modalItems.length} assigned task{modalItems.length !== 1 ? "s" : ""} for next week
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Task list */}
                <div className="overflow-y-auto flex-1 divide-y divide-zinc-800/60">
                  {modalItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-2">
                      <UserCheck className="w-8 h-8" />
                      <p className="text-sm">No assigned tasks for this product</p>
                    </div>
                  ) : (
                    modalItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-zinc-800/40 transition-colors">
                        <p className="flex-1 text-sm text-zinc-200 truncate" title={item.name}>{item.name}</p>
                        <div className="w-36 flex-shrink-0"><StatusBadge label={item.status} color={item.statusColor} /></div>
                        <span className="hidden sm:block w-[130px] flex-shrink-0 text-xs text-zinc-500 truncate">{item.groupTitle}</span>
                        <span className={cn(
                          "w-20 flex-shrink-0 text-xs font-medium text-right",
                          item.isOverdue ? "text-red-400" : item.isDueSoon ? "text-amber-400" : "text-zinc-400"
                        )}>
                          {formatDate(item.timelineEnd)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      </main>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product, assigned, goal, idx, onClick,
}: {
  product: string; assigned: number; goal: number | null; idx: number; onClick: () => void;
}) {
  const hasGoal   = goal !== null && goal > 0;
  const pct       = hasGoal ? Math.min(assigned / goal!, 1) : 0;
  const remaining = hasGoal ? Math.max(0, goal! - assigned) : null;

  const barColor = !hasGoal
    ? "bg-zinc-600"
    : pct >= 1   ? "bg-emerald-500"
    : pct >= 0.5 ? "bg-amber-500"
    :              "bg-red-500";

  const countColor = !hasGoal
    ? "text-zinc-500"
    : pct >= 1   ? "text-emerald-400"
    : pct >= 0.5 ? "text-amber-400"
    :              "text-red-400";

  const statusText = !hasGoal          ? null
    : pct >= 1                          ? "Fully assigned ✓"
    : remaining === goal                ? "Not yet assigned"
    : `${remaining} more to assign`;

  const statusColor = !hasGoal
    ? ""
    : pct >= 1   ? "text-emerald-400"
    : pct >= 0.5 ? "text-amber-400"
    :              "text-red-400";

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3 animate-fade-in hover:border-zinc-700 hover:bg-zinc-800/30 cursor-pointer transition-colors"
      style={{ animationDelay: `${idx * 30}ms` }}
    >
      {/* Name + count / goal */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2" title={product}>
          {product}
        </p>
        {hasGoal ? (
          <div className="flex-shrink-0 text-right leading-none">
            <span className={cn("text-2xl font-black", countColor)}>{assigned}</span>
            <span className="text-sm text-zinc-600 font-semibold"> / {goal}</span>
          </div>
        ) : (
          // No goal → gray count only, no denominator
          <span className={cn("text-2xl font-black flex-shrink-0", countColor)}>{assigned}</span>
        )}
      </div>

      {/* Progress bar + status */}
      {hasGoal && (
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

      {!hasGoal && (
        <p className="text-xs text-zinc-700">No goal set in Planning</p>
      )}
    </div>
  );
}
