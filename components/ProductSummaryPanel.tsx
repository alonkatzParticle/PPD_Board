"use client";

import { useState, useEffect, useRef } from "react";
import { Package, ShoppingBag, ChevronDown, ChevronUp, X, Pencil, Check, Target } from "lucide-react";
import type { ProductSummary, DashboardItem, BoardType } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { formatDate, cn, buildProductSummary } from "@/lib/utils";
import {
  getWeekGoals, fetchWeekGoals, setTotalTarget, setProductTarget,
  type WeekGoals,
} from "@/lib/targets";

interface ProductSummaryPanelProps {
  summary: ProductSummary[];
  totalItems: number;
  loading?: boolean;
  allItems?: DashboardItem[];
  boardType?: BoardType;
  weekKey?: string;    // start-of-week Sunday date string e.g. "20260413"
  weekOffset?: number; // 0 = this week, 1 = next week, -1 = last week
}

const BUNDLE_KEYWORDS = ["set", "bundle", "kit"];
const isBundle = (name: string) => BUNDLE_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));

// Distinct colors for the stacked bar – cycles if more products than colors
const SEGMENT_COLORS = [
  "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444",
  "#3B82F6", "#EC4899", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#A855F7", "#22C55E", "#FB923C", "#60A5FA",
  "#F472B6", "#4ADE80", "#FBBF24", "#34D399", "#818CF8",
];
const productColor = (idx: number) => SEGMENT_COLORS[idx % SEGMENT_COLORS.length];

export function ProductSummaryPanel({
  summary, totalItems, loading, allItems = [], boardType, weekKey, weekOffset = 0,
}: ProductSummaryPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [goals, setGoals] = useState<WeekGoals>({ totalTarget: null, products: {} });

  // Step 1: Load from local cache immediately (synchronous — no flash)
  useEffect(() => {
    if (boardType && weekKey) {
      setGoals(getWeekGoals(boardType, weekKey));
    } else {
      setGoals({ totalTarget: null, products: {} });
    }
  }, [boardType, weekKey]);

  // Step 2: Hydrate from server (shared across team) — runs after render
  useEffect(() => {
    if (!boardType || !weekKey) return;
    fetchWeekGoals(boardType, weekKey).then((serverGoals) => {
      setGoals(serverGoals);
    });
  }, [boardType, weekKey]);

  const canEditGoals = !!(boardType && weekKey);

  const handleTotalTarget = (value: number | null) => {
    if (!canEditGoals) return;
    setTotalTarget(boardType!, weekKey!, value);
    setGoals((g) => ({ ...g, totalTarget: value }));
  };

  const handleProductTarget = (product: string, value: number | null) => {
    if (!canEditGoals) return;
    setProductTarget(boardType!, weekKey!, product, value);
    setGoals((g) => ({
      ...g,
      products: value === null || value <= 0
        ? Object.fromEntries(Object.entries(g.products).filter(([k]) => k !== product))
        : { ...g.products, [product]: value },
    }));
  };

  // Weekly total progress — must be declared before the capping IIFE
  const totalTarget = goals.totalTarget;

  // ── Pipeline capping (Next Week only) ────────────────────────────────────
  // When the total goal is set, pipeline tasks are capped to the remaining
  // slots (totalTarget - scheduledCount). Products with a per-product goal
  // get priority; products without a goal fill any leftover slots.
  const cappedAllItems = (() => {
    if (weekOffset !== 1 || !totalTarget) return allItems;

    const scheduled = allItems.filter((i) => !i.isPipeline);
    const remaining = Math.max(0, totalTarget - scheduled.length);
    if (remaining === 0) return scheduled; // already at/over goal

    const pipeline = allItems.filter((i) => i.isPipeline);
    const withGoal    = pipeline.filter((i) => (goals.products[i.product] ?? 0) > 0);
    const withoutGoal = pipeline.filter((i) => !(goals.products[i.product] ?? 0));

    // Sort within each group: most-needed (goal - actual) first
    const sortByNeed = (a: DashboardItem, b: DashboardItem) => {
      const needA = (goals.products[a.product] ?? 0) - (summary.find(s => s.product === a.product)?.total ?? 0);
      const needB = (goals.products[b.product] ?? 0) - (summary.find(s => s.product === b.product)?.total ?? 0);
      return needB - needA;
    };
    withGoal.sort(sortByNeed);

    const prioritized = [...withGoal, ...withoutGoal].slice(0, remaining);
    return [...scheduled, ...prioritized];
  })();

  // Recompute summary and total from the capped item set
  const displaySummary = weekOffset === 1 && totalTarget
    ? buildProductSummary(cappedAllItems)
    : summary;
  const displayTotal = cappedAllItems.length;

  const cappedProducts = displaySummary.filter((p) => !isBundle(p.product));
  const cappedBundles  = displaySummary.filter((p) =>  isBundle(p.product));

  const modalItems = selectedProduct ? cappedAllItems.filter((i) => i.product === selectedProduct) : [];

  // Warning count — uses display summary
  const warningCount = displaySummary.filter((p) => {
    const t = goals.products[p.product];
    return t !== undefined && p.total < t;
  }).length;

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="h-5 bg-zinc-800 rounded w-40 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (summary.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {/* ── Header ── */}
        <button
          id="product-summary-toggle"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-100">Product Overview</p>
              <p className="text-xs text-zinc-500">
                <span className="text-violet-400 font-semibold">{cappedProducts.length}</span> products ·{" "}
                <span className="text-amber-400 font-semibold">{cappedBundles.length}</span> bundles ·{" "}
                <span className="text-zinc-300 font-medium">{displayTotal}</span> tasks
                {warningCount > 0 && (
                  <span className="ml-2 text-red-400 font-semibold">· {warningCount} below target</span>
                )}
              </p>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>

        {expanded && (
          <div className="border-t border-zinc-800 p-5 space-y-6">

            {/* ── Weekly total goal bar ── */}
            {canEditGoals && (
              <WeeklyTotalBar
                summary={summary}
                actual={totalItems}
                target={totalTarget}
                productGoals={goals.products}
                onSet={handleTotalTarget}
              />
            )}

            {cappedProducts.length > 0 && (
              <section>
                <SectionHeader icon={<Package className="w-3.5 h-3.5" />} label="Products" count={cappedProducts.length} color="violet" />
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
                  {cappedProducts.map((p, idx) => (
                    <ProductCard
                      key={p.product}
                      product={p}
                      idx={idx}
                      accent="violet"
                      target={goals.products[p.product] ?? null}
                      showTargets={canEditGoals}
                      onTargetChange={(v) => handleProductTarget(p.product, v)}
                      onClick={() => setSelectedProduct(p.product)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Bundles ── */}
            {cappedBundles.length > 0 && (
              <section>
                <SectionHeader icon={<ShoppingBag className="w-3.5 h-3.5" />} label="Bundles & Sets" count={cappedBundles.length} color="amber" />
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
                  {cappedBundles.map((p, idx) => (
                    <ProductCard
                      key={p.product}
                      product={p}
                      idx={idx}
                      accent="amber"
                      target={goals.products[p.product] ?? null}
                      showTargets={canEditGoals}
                      onTargetChange={(v) => handleProductTarget(p.product, v)}
                      onClick={() => setSelectedProduct(p.product)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* ── Task modal ── */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProduct(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-4xl max-h-[80vh] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <p className="text-base font-semibold text-zinc-100">{selectedProduct}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{modalItems.length} task{modalItems.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-zinc-800/60">
              {modalItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-2">
                  <Package className="w-8 h-8" />
                  <p className="text-sm">No tasks for this product</p>
                </div>
              ) : (
                modalItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-4 px-6 py-3.5 hover:bg-zinc-800/40 transition-colors",
                      item.isPipeline  && "border-l-2 border-violet-500/60 bg-violet-950/10",
                      item.isOverdue   && "border-l-2 border-red-500",
                      item.isDueSoon && !item.isOverdue && "border-l-2 border-amber-500"
                    )}
                  >
                    <p className="flex-1 text-sm text-zinc-200 truncate" title={item.name}>{item.name}</p>
                    <div className="w-36 flex-shrink-0"><StatusBadge label={item.status} color={item.statusColor} /></div>
                    <span className="hidden sm:block w-[130px] flex-shrink-0 text-xs text-zinc-500 truncate">{item.groupTitle}</span>
                    <span className={cn("w-20 flex-shrink-0 text-xs font-medium text-right",
                      item.isPipeline  ? "text-violet-400"
                      : item.isOverdue ? "text-red-400"
                      : item.isDueSoon ? "text-amber-400"
                      : "text-zinc-400"
                    )}>
                      {item.isPipeline ? "Pipeline" : item.timelineEnd ? formatDate(item.timelineEnd) : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Weekly total bar ──────────────────────────────────────────────────────────
function WeeklyTotalBar({
  summary, actual, target, productGoals, onSet,
}: {
  summary: ProductSummary[];
  actual: number;
  target: number | null;
  productGoals: Record<string, number>;
  onSet: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    setDraft(target !== null ? String(target) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    const n = parseInt(draft, 10);
    onSet(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  };

  // Build a stable color map keyed by product name so both bars share the same color
  const activeProducts = summary
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
  const colorMap: Record<string, string> = {};
  activeProducts.forEach((p, i) => { colorMap[p.product] = productColor(i); });

  // Also include products that only appear in goals (no actual tasks yet)
  const goalProducts = Object.entries(productGoals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  goalProducts.forEach(([name], i) => {
    if (!colorMap[name]) colorMap[name] = productColor(activeProducts.length + i);
  });

  // Denominators
  const actualDenom = target ?? actual;
  const goalDenom   = target ?? goalProducts.reduce((s, [, v]) => s + v, 0);

  const statusText = !target ? null : actual >= target ? "On target ✓" : `${target - actual} more needed`;
  const statusColor = !target ? "" : actual >= target ? "text-emerald-400" : actual >= target * 0.6 ? "text-amber-400" : "text-red-400";

  // Combined legend: union of products in actual and goal
  const legendNames = Array.from(
    new Set([...activeProducts.map((p) => p.product), ...goalProducts.map(([n]) => n)])
  );

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-zinc-200">Weekly Task Goal</span>
          {target !== null && (
            <span className={cn("text-sm font-bold ml-1", statusColor)}>
              {actual} / {target}
            </span>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef} type="number" min={1} value={draft} placeholder="e.g. 30"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
              className="w-24 px-3 py-1.5 text-sm rounded-lg bg-zinc-900 border border-zinc-600 text-zinc-100 focus:outline-none focus:border-violet-500 placeholder-zinc-600"
            />
            <button onClick={commit} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition-colors">
              <Check className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={openEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-xs text-zinc-500 hover:text-zinc-300 transition-all">
            <Pencil className="w-3 h-3" />
            {target !== null ? "Edit goal" : "Set goal"}
          </button>
        )}
      </div>

      {/* Two stacked bars */}
      <div className="space-y-2">
        {/* Actual bar */}
        <div className="flex items-center gap-3">
          <span className="w-12 text-xs text-zinc-500 text-right flex-shrink-0">Actual</span>
          <div className="relative flex-1 h-5 rounded-full bg-zinc-800 overflow-hidden flex">
            {activeProducts.map((p) => {
              const w = actualDenom > 0 ? (p.total / actualDenom) * 100 : 0;
              return (
                <div
                  key={p.product}
                  title={`${p.product}: ${p.total}`}
                  className="h-full transition-all duration-700"
                  style={{ width: `${w}%`, backgroundColor: colorMap[p.product], opacity: 0.9 }}
                />
              );
            })}
          </div>
          <span className="w-12 text-xs text-zinc-400 font-semibold flex-shrink-0">{actual}{target ? `/${target}` : ""}</span>
        </div>

        {/* Goal bar */}
        {goalProducts.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-zinc-500 text-right flex-shrink-0">Goal</span>
            <div className="relative flex-1 h-5 rounded-full bg-zinc-800 overflow-hidden flex">
              {goalProducts.map(([name, val]) => {
                const w = goalDenom > 0 ? (val / goalDenom) * 100 : 0;
                return (
                  <div
                    key={name}
                    title={`${name}: ${val}`}
                    className="h-full transition-all duration-700"
                    style={{ width: `${w}%`, backgroundColor: colorMap[name], opacity: 0.55 }}
                  />
                );
              })}
            </div>
            <span className="w-12 text-xs text-zinc-400 font-semibold flex-shrink-0">
              {goalProducts.reduce((s, [, v]) => s + v, 0)}{target ? `/${target}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Status */}
      {statusText && (
        <p className={cn("text-xs font-semibold", statusColor)}>{statusText}</p>
      )}

      {/* Combined legend: actual / goal per product */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {legendNames.map((name) => {
          const act  = summary.find((p) => p.product === name)?.total ?? 0;
          const goal = productGoals[name] ?? null;
          return (
            <div key={name} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[name] }} />
              <span className="text-xs text-zinc-400 truncate max-w-[110px]" title={name}>{name}</span>
              <span className="text-xs font-bold text-zinc-200">{act}</span>
              {goal !== null && (
                <span className="text-xs text-zinc-600">/ {goal}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, count, color }: {
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

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({
  product, idx, accent, target, showTargets, onTargetChange, onClick,
}: {
  product: ProductSummary; idx: number; accent: "violet" | "amber";
  target: number | null; showTargets: boolean;
  onTargetChange: (v: number | null) => void; onClick: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const countColor = accent === "violet" ? "text-violet-400" : "text-amber-400";
  const ringColor  = accent === "violet" ? "hover:border-violet-600/60" : "hover:border-amber-600/60";
  const focusRing  = accent === "violet" ? "focus:border-violet-500" : "focus:border-amber-500";

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(target !== null ? String(target) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    const n = parseInt(draft, 10);
    onTargetChange(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  };

  const pct = target !== null && target > 0 ? Math.min(product.total / target, 1) : 0;
  const barColor   = !target ? "" : pct >= 1 ? "bg-emerald-500" : pct >= 0.5 ? "bg-amber-500" : "bg-red-500";
  const statusText = !target ? null : pct >= 1 ? "On target ✓" : `${target - product.total} more needed`;
  const statusColor= !target ? "" : pct >= 1 ? "text-emerald-400" : pct >= 0.5 ? "text-amber-400" : "text-red-400";

  return (
    <div
      className={cn("rounded-xl border border-zinc-800 bg-zinc-900 transition-all animate-fade-in flex flex-col", ringColor, "hover:bg-zinc-800/50")}
      style={{ animationDelay: `${idx * 30}ms` }}
    >
      <button onClick={onClick} className="flex items-start justify-between gap-3 w-full text-left p-4 pb-3 active:scale-[0.98] transition-transform">
        <p className="text-sm font-semibold text-zinc-200 leading-snug" title={product.product}>{product.product}</p>
        <span className={cn("flex-shrink-0 text-4xl font-black leading-none tracking-tight", countColor)}>{product.total}</span>
      </button>

      {showTargets && (
        <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef} type="number" min={1} value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
                placeholder="Weekly target…"
                className={cn("flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 placeholder-zinc-600 focus:outline-none", focusRing)}
              />
              <button onClick={commitEdit} className="flex-shrink-0 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : target !== null ? (
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-medium", statusColor)}>{statusText}</span>
                <button onClick={openEdit} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1">
                  <Pencil className="w-2.5 h-2.5" />{product.total}/{target}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openEdit} className="w-full py-2 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 text-xs text-zinc-600 hover:text-zinc-400 transition-all flex items-center justify-center gap-1.5">
              <Pencil className="w-3 h-3" />Set weekly target
            </button>
          )}
        </div>
      )}
    </div>
  );
}
