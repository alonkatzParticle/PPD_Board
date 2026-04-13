"use client";

import { Video, Palette } from "lucide-react";
import type { BoardType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BoardToggleProps {
  active: BoardType;
  onChange: (board: BoardType) => void;
  loading?: boolean;
}

export function BoardToggle({ active, onChange, loading }: BoardToggleProps) {
  const boards: { id: BoardType; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: "video",
      label: "Video Projects",
      icon: <Video className="w-4 h-4" />,
      color: "from-violet-600 to-purple-600",
    },
    {
      id: "design",
      label: "Design Projects",
      icon: <Palette className="w-4 h-4" />,
      color: "from-rose-500 to-pink-600",
    },
  ];

  return (
    <div className="flex items-center gap-2 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
      {boards.map((board) => (
        <button
          key={board.id}
          onClick={() => onChange(board.id)}
          disabled={loading}
          id={`board-toggle-${board.id}`}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 select-none",
            active === board.id
              ? `bg-gradient-to-r ${board.color} text-white shadow-lg shadow-purple-900/30`
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          )}
        >
          {board.icon}
          {board.label}
          {active === board.id && loading && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
          )}
        </button>
      ))}
    </div>
  );
}
