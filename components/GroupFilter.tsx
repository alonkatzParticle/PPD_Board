"use client";

import { useState } from "react";
import { Filter, X, ChevronDown } from "lucide-react";
import type { MondayGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GroupFilterProps {
  groups: MondayGroup[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
}

export function GroupFilter({ groups, selectedIds, onChange, loading }: GroupFilterProps) {
  const [open, setOpen] = useState(false);

  const isAll = selectedIds.length === 0;

  const toggleGroup = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((g) => g !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = () => onChange([]);

  if (loading || groups.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm animate-pulse">
        <Filter className="w-3.5 h-3.5" />
        Loading groups…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        id="group-filter-toggle"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
          open || !isAll
            ? "bg-zinc-800 border-zinc-700 text-zinc-100"
            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
        )}
      >
        <Filter className="w-3.5 h-3.5" />
        {isAll ? (
          "All Groups"
        ) : (
          <span>
            {selectedIds.length} group{selectedIds.length !== 1 ? "s" : ""}
          </span>
        )}
        {!isAll && (
          <span
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
            className="ml-1 text-zinc-400 hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 z-20 w-72 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/60 animate-fade-in overflow-hidden">
            <div className="p-2">
              {/* All option */}
              <button
                id="group-filter-all"
                onClick={() => { clearAll(); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isAll
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <span className="w-3 h-3 rounded-full bg-zinc-500" />
                All Groups
                {isAll && <span className="ml-auto text-xs text-violet-400">active</span>}
              </button>

              <div className="my-1 border-t border-zinc-800" />

              {groups.map((group) => {
                const selected = selectedIds.includes(group.id);
                return (
                  <button
                    key={group.id}
                    id={`group-filter-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      selected
                        ? "bg-violet-600/20 text-violet-200"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color || "#6b7280" }}
                    />
                    <span className="truncate">{group.title}</span>
                    {selected && (
                      <span className="ml-auto text-xs text-violet-400">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
