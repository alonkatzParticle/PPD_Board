"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, AlertCircle, Clock, Calendar } from "lucide-react";
import type { DashboardItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { formatDate, cn } from "@/lib/utils";

type SortKey = "timelineEnd" | "product" | "name" | "status" | "groupTitle";
type SortDir = "asc" | "desc";

interface TaskTableProps {
  items: DashboardItem[];
  loading?: boolean;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />;
  return dir === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 text-violet-400" />
    : <ChevronDown className="w-3.5 h-3.5 text-violet-400" />;
}

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: "name", label: "Task", width: "flex-1 min-w-[200px]" },
  { key: "product", label: "Product", width: "w-36" },
  { key: "status", label: "Status", width: "w-36" },
  { key: "groupTitle", label: "Group", width: "w-36" },
  { key: "timelineEnd", label: "Due Date", width: "w-36" },
];

export function TaskTable({ items, loading }: TaskTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timelineEnd");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...items].sort((a, b) => {
    let av: string | null = a[sortKey] as string | null;
    let bv: string | null = b[sortKey] as string | null;

    if (sortKey === "timelineEnd") {
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
    }

    av = av ?? "";
    bv = bv ?? "";
    const cmp = av.localeCompare(bv);
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800/60"
          >
            <div className="flex-1 h-4 bg-zinc-800 rounded animate-pulse" />
            <div className="w-28 h-4 bg-zinc-800 rounded animate-pulse" />
            <div className="w-24 h-6 bg-zinc-800 rounded-full animate-pulse" />
            <div className="w-28 h-4 bg-zinc-800 rounded animate-pulse" />
            <div className="w-28 h-4 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
        <Calendar className="w-10 h-10 text-zinc-700" />
        <p className="text-sm">No marketing tasks found</p>
        <p className="text-xs text-zinc-600">Try adjusting the group filter or board selection</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 bg-zinc-900/80 border-b border-zinc-800">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            id={`sort-${col.key}`}
            onClick={() => handleSort(col.key)}
            className={cn(
              col.width,
              "flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors",
              sortKey === col.key ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {col.label}
            <SortIcon active={sortKey === col.key} dir={sortDir} />
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-zinc-800/60">
        {sorted.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-800/40 group animate-fade-in",
              item.isOverdue && "border-l-2 border-red-500",
              item.isDueSoon && !item.isOverdue && "border-l-2 border-amber-500"
            )}
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            {/* Task name */}
            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              {item.isOverdue && (
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              )}
              {item.isDueSoon && !item.isOverdue && (
                <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              <span
                className={cn(
                  "text-sm truncate",
                  item.isOverdue ? "text-red-200" : "text-zinc-100"
                )}
                title={item.name}
              >
                {item.name}
              </span>
            </div>

            {/* Product */}
            <div className="w-36 text-sm text-zinc-300 truncate" title={item.product}>
              {item.product}
            </div>

            {/* Status */}
            <div className="w-36">
              <StatusBadge label={item.status} color={item.statusColor} />
            </div>

            {/* Group */}
            <div className="w-36 text-sm text-zinc-400 truncate" title={item.groupTitle}>
              {item.groupTitle}
            </div>

            {/* Due date */}
            <div
              className={cn(
                "w-36 text-sm font-medium",
                item.isOverdue
                  ? "text-red-400"
                  : item.isDueSoon
                  ? "text-amber-400"
                  : "text-zinc-300"
              )}
            >
              {formatDate(item.timelineEnd)}
              {item.isOverdue && (
                <span className="block text-xs text-red-500/80 font-normal">Overdue</span>
              )}
              {item.isDueSoon && !item.isOverdue && (
                <span className="block text-xs text-amber-500/80 font-normal">Due soon</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
