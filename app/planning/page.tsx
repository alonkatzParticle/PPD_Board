"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  RefreshCw, AlertTriangle, CalendarDays, ClipboardList, Package, ShoppingBag, Target, Pencil,
} from "lucide-react";
import type { BoardType, DashboardItem, ProductSummary, PlannedTask } from "@/lib/types";
import { getWeekWindow, cn } from "@/lib/utils";
import { toWeekKey, fetchWeekGoals, getWeekGoals, setProductTarget, setTotalTarget, type WeekGoals } from "@/lib/targets";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { PlanningPanel } from "@/components/PlanningPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoardsData {
  video: { id: string; name: string } | null;
  design: { id: string; name: string } | null;
}

interface WeekData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  total: number;
}

interface AllWeeksData {
  lastWeek: WeekData;
  thisWeek: WeekData;
  nextWeek: WeekData;
}

const BUNDLE_KEYWORDS   = ["set", "bundle", "kit"];
const isBundle = (name: string) => BUNDLE_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));

// Products that should never appear in the planning grid
const BLOCKED_PRODUCTS = new Set([
  "multiple products",
  "test product",
  "not a product task",
]);

// Same palette as ProductSummaryPanel for visual consistency
const SEGMENT_COLORS = [
  "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444",
  "#3B82F6", "#EC4899", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#A855F7", "#22C55E", "#FB923C", "#60A5FA",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const [activeBoard, setActiveBoard]     = useState<BoardType>("video");
  const [boardsData, setBoardsData]       = useState<BoardsData | null>(null);
  const [allWeeksData, setAllWeeksData]   = useState<AllWeeksData | null>(null);
  const [plannedTasks, setPlannedTasks]   = useState<PlannedTask[]>([]);
  const [goals, setGoals]                 = useState<WeekGoals>({ totalTarget: null, products: {} });
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [showBundles, setShowBundles]         = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [dbError, setDbError]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);

  // Always "Next Week"
  const weekWindow = getWeekWindow(1);
  const weekKey    = toWeekKey(weekWindow.start);

  // ── Load goals ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setGoals(getWeekGoals(activeBoard, weekKey));          // instant from localStorage
    fetchWeekGoals(activeBoard, weekKey).then(setGoals);  // hydrate from server
  }, [activeBoard, weekKey]);

  // ── Load boards ────────────────────────────────────────────────────────────
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

  // ── Load all weeks data ────────────────────────────────────────────────────
  const loadAllWeeks = useCallback(async (forceRefresh = false) => {
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
    if (boardsData) loadAllWeeks();
  }, [loadAllWeeks, boardsData]);

  // ── Load planned tasks ─────────────────────────────────────────────────────
  const loadPlannedTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/planned-tasks?boardType=${activeBoard}&weekKey=${weekKey}`);
      if (!res.ok) { setDbError(true); return; }
      setDbError(false);
      const tasks: PlannedTask[] = await res.json();
      setPlannedTasks(tasks);
    } catch {
      setDbError(true);
    }
  }, [activeBoard, weekKey]);

  useEffect(() => {
    loadPlannedTasks();
  }, [loadPlannedTasks]);

  // ── Board switch ───────────────────────────────────────────────────────────
  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setSelectedProduct(null);
    setShowBundles(false);
    setAllWeeksData(null);
    setPlannedTasks([]);
  };

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const onAddTask = useCallback(async (product: string, name: string, assignee: string | null) => {
    const res = await fetch("/api/planned-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardType: activeBoard, weekKey, product, name, assignee }),
    });
    if (!res.ok) throw new Error("Failed to create task");
    const task: PlannedTask = await res.json();
    setPlannedTasks((prev) => [...prev, task]);
  }, [activeBoard, weekKey]);

  const onDeleteTask = useCallback(async (id: string) => {
    setPlannedTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    try {
      await fetch(`/api/planned-tasks/${id}`, { method: "DELETE" });
    } catch {
      loadPlannedTasks(); // revert on error
    }
  }, [loadPlannedTasks]);

  const onUpdateTask = useCallback(async (id: string, updates: { name?: string; assignee?: string | null; done?: boolean }) => {
    setPlannedTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t)); // optimistic
    try {
      await fetch(`/api/planned-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch {
      loadPlannedTasks(); // revert on error
    }
  }, [loadPlannedTasks]);

  // Update a per-product weekly goal (persisted via targets.ts → Neon Postgres)
  const onSetGoal = useCallback((product: string, value: number | null) => {
    setProductTarget(activeBoard, weekKey, product, value);
    setGoals((prev) => {
      const next = { ...prev, products: { ...prev.products } };
      if (value === null || value <= 0) {
        delete next.products[product];
      } else {
        next.products[product] = value;
      }
      return next;
    });
  }, [activeBoard, weekKey]);

  const onSetTotalGoal = useCallback((value: number | null) => {
    setTotalTarget(activeBoard, weekKey, value);
    setGoals((prev) => ({ ...prev, totalTarget: value }));
  }, [activeBoard, weekKey]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const nextWeekData = allWeeksData?.nextWeek ?? null;

  // Per-product stats map from next week items
  const productStatsMap = useMemo(() => {
    const map = new Map<string, { mondayCount: number; pipelineCount: number }>();
    for (const item of nextWeekData?.items ?? []) {
      const entry = map.get(item.product) ?? { mondayCount: 0, pipelineCount: 0 };
      if (item.isPipeline) entry.pipelineCount++; else entry.mondayCount++;
      map.set(item.product, entry);
    }
    return map;
  }, [nextWeekData]);

  // Full product list: Monday products + any extra from planned tasks
  const allProducts = useMemo(() => {
    const mondayProducts = nextWeekData?.productSummary ?? [];
    const plannedProductNames = Array.from(new Set(plannedTasks.map((t) => t.product)));
    const extra = plannedProductNames
      .filter((p) => !mondayProducts.find((m) => m.product === p))
      .map((p): ProductSummary => ({ product: p, total: 0, byStatus: {} }));
    return [...mondayProducts, ...extra]
      .filter((p) => !BLOCKED_PRODUCTS.has(p.product.toLowerCase()));
  }, [nextWeekData, plannedTasks]);

  // Per-product actual vs goal data for the progress bar
  // Only products with a goal AND that appear in Monday (any count) are included
  const goalsBarData = useMemo(() => {
    const entries = Object.entries(goals.products) as [string, number][];
    const data = entries
      .filter(([, goal]) => goal > 0)
      .map(([product, goal], idx) => {
        const stats = productStatsMap.get(product);
        const actual = Math.min(
          (stats?.mondayCount ?? 0) + (stats?.pipelineCount ?? 0),
          goal
        );
        return { product, actual, goal, color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length] };
      });
    const totalActual = data.reduce((s, d) => s + d.actual, 0);
    const totalGoal   = data.reduce((s, d) => s + d.goal, 0);
    return { data, totalActual, totalGoal };
  }, [goals.products, productStatsMap]);

  const products = allProducts.filter((p) => !isBundle(p.product));
  const bundles  = allProducts.filter((p) =>  isBundle(p.product));

  // Sort: 1) has a goal set, 2) most Monday tasks, 3) most common on board
  const sortFn = (a: ProductSummary, b: ProductSummary) => {
    const aGoal = goals.products[a.product] ? 1 : 0;
    const bGoal = goals.products[b.product] ? 1 : 0;
    if (bGoal !== aGoal) return bGoal - aGoal;
    const aStats = productStatsMap.get(a.product);
    const bStats = productStatsMap.get(b.product);
    const aC = (aStats?.mondayCount ?? 0) + (aStats?.pipelineCount ?? 0);
    const bC = (bStats?.mondayCount ?? 0) + (bStats?.pipelineCount ?? 0);
    if (bC !== aC) return bC - aC;
    return b.total - a.total;
  };
  const sortedProducts = [...products].sort(sortFn);
  const sortedBundles  = [...bundles].sort(sortFn);
  const displayList    = showBundles ? sortedBundles : sortedProducts;

  // Toggle badge: made / needed for each group
  const computeFraction = (list: ProductSummary[]) => {
    let made = 0, needed = 0;
    for (const p of list) {
      const goal = goals.products[p.product];
      if (!goal) continue;
      const stats = productStatsMap.get(p.product);
      made   += (stats?.mondayCount ?? 0) + (stats?.pipelineCount ?? 0);
      needed += goal;
    }
    return { made, needed };
  };
  const productsFrac = computeFraction(products);
  const bundlesFrac  = computeFraction(bundles);

  // Panel data for the selected product
  const panelMondayItems  = nextWeekData?.items.filter((i) => i.product === selectedProduct) ?? [];
  const panelPlannedTasks = plannedTasks.filter((t) => t.product === selectedProduct);

  const plannedCountFor  = (product: string) => plannedTasks.filter((t) => t.product === product).length;
  const assigneesFor     = (product: string): string[] =>
    Array.from(new Set(plannedTasks.filter((t) => t.product === product && t.assignee).map((t) => t.assignee as string)));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in mb-6">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* ── Top row ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
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
              onClick={() => { loadAllWeeks(true); loadPlannedTasks(); }}
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

        {/* DB warning */}
        {dbError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-sm mb-6">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Database not connected — planned tasks cannot be saved. Check <code className="text-amber-200">/api/health</code> for details.</span>
          </div>
        )}

        {/* Goal progress bar */}
        {(goalsBarData.data.length > 0 || goals.totalTarget !== null) && (
          <PlanningGoalBar
            data={goalsBarData.data}
            totalActual={goalsBarData.totalActual}
            totalGoal={goalsBarData.totalGoal}
            totalTarget={goals.totalTarget}
            onSetTotal={onSetTotalGoal}
          />
        )}

        {/* ── Main two-column layout ───────────────────────────────────────── */}
        <div className="flex gap-5 items-start">

          {/* ── Left: product grid ─────────────────────────────────────────── */}
          <div className="w-72 xl:w-80 flex-shrink-0 flex flex-col gap-3">

            {/* Products / Bundles toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
              <button
                onClick={() => { setShowBundles(false); setSelectedProduct(null); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  !showBundles
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Package className="w-3.5 h-3.5" />
                Products{" "}
                <span className="text-xs font-semibold flex items-center gap-0.5">
                  {productsFrac.needed > 0 ? (
                    <>
                      <span className={cn(
                        productsFrac.made >= productsFrac.needed ? "text-emerald-400" :
                        productsFrac.made >= productsFrac.needed * 0.6 ? "text-amber-400" :
                        "text-red-400"
                      )}>{productsFrac.made}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-emerald-400">{productsFrac.needed}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">{productsFrac.made}</span>
                  )}
                </span>
              </button>
              <button
                onClick={() => { setShowBundles(true); setSelectedProduct(null); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  showBundles
                    ? "bg-amber-600/20 text-amber-300 border border-amber-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Bundles{" "}
                <span className="text-xs font-semibold flex items-center gap-0.5">
                  {bundlesFrac.needed > 0 ? (
                    <>
                      <span className={cn(
                        bundlesFrac.made >= bundlesFrac.needed ? "text-emerald-400" :
                        bundlesFrac.made >= bundlesFrac.needed * 0.6 ? "text-amber-400" :
                        "text-red-400"
                      )}>{bundlesFrac.made}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-emerald-400">{bundlesFrac.needed}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">{bundlesFrac.made}</span>
                  )}
                </span>
              </button>
            </div>

            {/* Fixed-height scrollable card list */}
            {(loadingItems && !nextWeekData) ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : (
              <div
                className="overflow-y-auto space-y-1.5 pr-1"
                style={{ height: "calc(100vh - 17rem)" }}
              >
                {displayList.map((p) => (
                  <ProductCard
                    key={p.product}
                    product={p.product}
                    mondayCount={productStatsMap.get(p.product)?.mondayCount ?? 0}
                    pipelineCount={productStatsMap.get(p.product)?.pipelineCount ?? 0}
                    plannedCount={plannedCountFor(p.product)}
                    goalTarget={goals.products[p.product] ?? null}
                    selected={selectedProduct === p.product}
                    onClick={() => setSelectedProduct(
                      selectedProduct === p.product ? null : p.product
                    )}
                    onSetGoal={(value) => onSetGoal(p.product, value)}
                    assignees={assigneesFor(p.product)}
                  />
                ))}
                {displayList.length === 0 && (
                  <div className="py-10 text-center text-zinc-600 text-sm">
                    No {showBundles ? "bundles" : "products"} found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Planning panel or empty state ─────────────────────── */}
          <div className="flex-1 min-w-0">
            {selectedProduct ? (
              <PlanningPanel
                product={selectedProduct}
                weekLabel={weekWindow.label}
                mondayItems={panelMondayItems}
                plannedTasks={panelPlannedTasks}
                dbError={dbError}
                onClose={() => setSelectedProduct(null)}
                onAddTask={onAddTask}
                onDeleteTask={onDeleteTask}
                onUpdateTask={onUpdateTask}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-zinc-700 gap-3" style={{ height: "calc(100vh - 12rem)" }}>
                <ClipboardList className="w-12 h-12" />
                <p className="text-base font-medium text-zinc-500">Select a product to plan</p>
                <p className="text-sm text-center max-w-xs">
                  Click any product on the left to view its Monday tasks and add planned work for next week
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

// ── Planning goal bar ────────────────────────────────────────────────────────

interface GoalsBarItem {
  product: string;
  actual: number;
  goal: number;
  color: string;
}

function PlanningGoalBar({
  data, totalActual, totalGoal, totalTarget, onSetTotal,
}: {
  data: GoalsBarItem[];
  totalActual: number;
  totalGoal: number;
  totalTarget: number | null;
  onSetTotal: (v: number | null) => void;
}) {
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft]     = useState("");
  const totalInputRef = useRef<HTMLInputElement>(null);

  const effectiveTotal = totalTarget ?? totalGoal;
  if (!data.length && !totalTarget) return null;

  const pct = effectiveTotal > 0 ? totalActual / effectiveTotal : 0;
  const statusText  = pct >= 1 ? "All goals met ✓" : `${Math.max(0, effectiveTotal - totalActual)} more tasks needed`;
  const statusColor = pct >= 1 ? "text-emerald-400" : pct >= 0.6 ? "text-amber-400" : "text-red-400";

  const openEdit = () => {
    setTotalDraft(totalTarget !== null ? String(totalTarget) : "");
    setEditingTotal(true);
    setTimeout(() => totalInputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    const n = parseInt(totalDraft, 10);
    onSetTotal(isNaN(n) || n <= 0 ? null : n);
    setEditingTotal(false);
  };

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-4 space-y-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Target className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-zinc-200">Next Week Task Goal</span>
          {effectiveTotal > 0 && (
            <span className={cn("text-sm font-bold ml-1", statusColor)}>
              {totalActual} / {effectiveTotal}
            </span>
          )}
          {effectiveTotal > 0 && (
            <p className={cn("text-xs font-semibold hidden sm:block", statusColor)}>{statusText}</p>
          )}
        </div>
        {editingTotal ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input
              ref={totalInputRef}
              type="number"
              min={1}
              value={totalDraft}
              placeholder="e.g. 30"
              onChange={(e) => setTotalDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingTotal(false); }}
              className="w-20 px-2 py-1 text-sm rounded-lg bg-zinc-900 border border-zinc-600 text-zinc-100 focus:outline-none focus:border-violet-500 placeholder-zinc-600"
            />
            <button onClick={commitEdit} className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors">
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-700 hover:border-zinc-500 text-xs text-zinc-500 hover:text-zinc-300 transition-all flex-shrink-0"
          >
            <Pencil className="w-3 h-3" />
            {totalTarget !== null ? "Edit total" : "Set total"}
          </button>
        )}
      </div>

      {/* Stacked bars */}
      {data.length > 0 && (
        <div className="space-y-2">
          {/* Created */}
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-zinc-500 text-right flex-shrink-0">Created</span>
            <div className="relative flex-1 h-5 rounded-full bg-zinc-800 overflow-hidden flex">
              {data.map((d) => (
                <div
                  key={d.product}
                  title={`${d.product}: ${d.actual}`}
                  className="h-full transition-all duration-700"
                  style={{ width: `${effectiveTotal > 0 ? (d.actual / effectiveTotal) * 100 : 0}%`, backgroundColor: d.color, opacity: 0.9 }}
                />
              ))}
            </div>
            <span className="w-12 text-xs text-zinc-400 font-semibold flex-shrink-0">{totalActual}/{effectiveTotal}</span>
          </div>

          {/* Plan */}
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-zinc-500 text-right flex-shrink-0">Plan</span>
            <div className="relative flex-1 h-5 rounded-full bg-zinc-800 overflow-hidden flex">
              {data.map((d) => (
                <div
                  key={d.product}
                  title={`${d.product}: target ${d.goal}`}
                  className="h-full transition-all duration-700"
                  style={{ width: `${effectiveTotal > 0 ? (d.goal / effectiveTotal) * 100 : 0}%`, backgroundColor: d.color, opacity: 0.45 }}
                />
              ))}
            </div>
            <span className="w-12 text-xs text-zinc-400 font-semibold flex-shrink-0">{totalGoal}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      {data.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {data.map((d) => (
            <div key={d.product} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-zinc-400 truncate max-w-[110px]" title={d.product}>{d.product}</span>
              <span className="text-xs font-bold text-zinc-200">{d.actual}</span>
              <span className="text-xs text-zinc-600">/ {d.goal}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-violet-600 text-violet-100",
  "bg-rose-600   text-rose-100",
  "bg-sky-600    text-sky-100",
  "bg-amber-600  text-amber-100",
  "bg-emerald-600 text-emerald-100",
  "bg-pink-600   text-pink-100",
];

function avatarInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(h)];
}

// ── Grid section header ────────────────────────────────────────────────────────

function GridSectionHeader({ icon, label, count, color }: {
  icon: React.ReactNode; label: string; count: number; color: "violet" | "amber";
}) {
  const colorMap = {
    violet: "text-violet-400 bg-violet-600/10 border-violet-800/40",
    amber:  "text-amber-400  bg-amber-600/10  border-amber-800/40",
  };
  return (
    <div className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold", colorMap[color])}>
      {icon}{label}<span className="opacity-70">({count})</span>
    </div>
  );
}

// ── Product card ───────────────────────────────────────────────────────────────

function ProductCard({
  product, mondayCount, pipelineCount, plannedCount, goalTarget, selected, onClick, onSetGoal, assignees,
}: {
  product: string;
  mondayCount: number;
  pipelineCount: number;
  plannedCount: number;
  goalTarget: number | null;
  selected: boolean;
  onClick: () => void;
  onSetGoal: (value: number | null) => void;
  assignees: string[];
}) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft]     = useState("");
  const goalInputRef = useRef<HTMLInputElement>(null);

  const committed = mondayCount + pipelineCount;
  const remaining  = goalTarget !== null ? Math.max(0, goalTarget - committed) : null;
  const displayNum = remaining !== null ? remaining : committed;
  const numColor   = remaining === null
    ? (selected ? "text-violet-400" : "text-zinc-400")
    : remaining === 0   ? "text-emerald-400"
    : remaining <= 3    ? "text-amber-400"
    : "text-red-400";
  const pct = goalTarget ? Math.min(committed / goalTarget, 1) : 0;
  const barColor = !goalTarget
    ? "bg-violet-500"
    : pct >= 1 ? "bg-emerald-500"
    : pct >= 0.5 ? "bg-amber-500"
    : "bg-red-500";

  const openGoalEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGoalDraft(goalTarget !== null ? String(goalTarget) : "");
    setEditingGoal(true);
    setTimeout(() => goalInputRef.current?.focus(), 0);
  };

  const commitGoal = () => {
    const n = parseInt(goalDraft, 10);
    onSetGoal(isNaN(n) || n <= 0 ? null : n);
    setEditingGoal(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        selected
          ? "border-violet-500/50 bg-violet-950/30 shadow-md shadow-violet-900/20 ring-1 ring-violet-500/15"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
      )}
    >
      {/* Clickable area: selects the product */}
      <button
        onClick={onClick}
        className="w-full text-left p-2.5 pb-2 hover:bg-zinc-800/20 rounded-t-xl transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-xs font-semibold truncate leading-tight",
                selected ? "text-violet-200" : "text-zinc-200"
              )}
              title={product}
            >
              {product}
            </p>
            {assignees.length > 0 && (
              <div className="flex items-center gap-0.5 mt-1 flex-wrap">
                {assignees.map((name) => (
                  <div
                    key={name}
                    title={name}
                    className={cn(
                      "w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center flex-shrink-0",
                      avatarColor(name)
                    )}
                  >
                    {avatarInitials(name)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end flex-shrink-0">
            <span className={cn("text-xl font-black leading-none tabular-nums", numColor)}>
              {displayNum}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px]">
          {mondayCount > 0   && <span className="text-zinc-500">{mondayCount} monday</span>}
          {plannedCount > 0  && <><span className="text-zinc-700">·</span><span className="text-emerald-500">{plannedCount} planned</span></>}
          {pipelineCount > 0 && <><span className="text-zinc-700">·</span><span className="text-amber-600">{pipelineCount} no date</span></>}
          {mondayCount === 0 && plannedCount === 0 && pipelineCount === 0 && (
            <span className="text-zinc-700">no tasks yet</span>
          )}
        </div>
      </button>

      {/* Goal section — does NOT bubble up to select-product */}
      <div className="px-2.5 pb-2 pt-0" onClick={(e) => e.stopPropagation()}>
        {editingGoal ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={goalInputRef}
              type="number"
              min={1}
              value={goalDraft}
              placeholder="e.g. 10"
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitGoal();
                if (e.key === "Escape") setEditingGoal(false);
              }}
              className="flex-1 text-sm px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 min-w-0"
            />
            <button
              onClick={commitGoal}
              className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors flex-shrink-0"
            >
              Save
            </button>
          </div>
        ) : goalTarget !== null ? (
          <div className="space-y-1 group/goal">
            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-[10px] font-medium",
                pct >= 1 ? "text-emerald-400" : pct >= 0.5 ? "text-amber-400" : "text-red-400"
              )}>
                {committed} / {goalTarget}
              </p>
              <button
                onClick={openGoalEdit}
                className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors opacity-0 group-hover/goal:opacity-100"
              >
                edit goal
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={openGoalEdit}
            className="w-full py-1.5 rounded-lg border border-dashed border-zinc-700 hover:border-violet-500/50 text-[11px] text-zinc-500 hover:text-violet-400 transition-all"
          >
            + Set weekly goal
          </button>
        )}
      </div>
    </div>
  );
}

