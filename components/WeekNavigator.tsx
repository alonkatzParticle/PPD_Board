"use client";

import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from "lucide-react";
import type { WeekWindow } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface WeekNavigatorProps {
  window: WeekWindow;
  onShift: (offset: number) => void;
}

export function WeekNavigator({ window: win, onShift }: WeekNavigatorProps) {
  const isDefault = win.weekOffset === 0;

  return (
    <div className="flex items-center gap-2">
      {/* Back button */}
      <button
        id="week-nav-prev"
        onClick={() => onShift(win.weekOffset - 1)}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition-all"
        title="Previous week"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Week label */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 min-w-[260px] justify-center">
        <Calendar className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <span className="text-sm text-zinc-300 font-medium whitespace-nowrap">
          {win.label}
        </span>
      </div>

      {/* Forward button */}
      <button
        id="week-nav-next"
        onClick={() => onShift(win.weekOffset + 1)}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition-all"
        title="Next week"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Reset to default */}
      {!isDefault && (
        <button
          id="week-nav-reset"
          onClick={() => onShift(0)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
            "bg-violet-600/20 border border-violet-600/30 text-violet-300 hover:bg-violet-600/30"
          )}
          title="Back to default (last / this / next week)"
        >
          <RotateCcw className="w-3 h-3" />
          Today
        </button>
      )}
    </div>
  );
}
