"use client";

import { useState, useRef } from "react";
import {
  X, Package, CalendarDays, Pencil, ClipboardList, Plus, Check, ExternalLink,
} from "lucide-react";
import type { DashboardItem, PlannedTask } from "@/lib/types";
import { TEAM_MEMBERS } from "@/lib/team";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatTaskName, cn } from "@/lib/utils";

// Base URL of the external Task Creator site
const TASK_CREATOR_BASE = "https://form-nine-sooty.vercel.app/";

function buildTaskCreatorUrl(task: PlannedTask): string {
  const taskType = "Script (<1 min)";
  const params = new URLSearchParams({
    board:      task.boardType,
    department: "Marketing/Media",
    product:    task.product,
    type:       taskType,
    prompt:     `Create a brief for this task: ${task.name}`,
  });
  return `${TASK_CREATOR_BASE}?${params}`;
}


interface PlanningPanelProps {
  product: string;
  weekLabel: string;
  mondayItems: DashboardItem[];
  plannedTasks: PlannedTask[];
  dbError: boolean;
  onClose: () => void;
  onAddTask: (product: string, name: string, assignee: string | null) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onUpdateTask: (id: string, updates: { name?: string; assignee?: string | null; done?: boolean }) => Promise<void>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlanningPanel({
  product, weekLabel, mondayItems, plannedTasks,
  dbError, onClose, onAddTask, onDeleteTask, onUpdateTask,
}: PlanningPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const scheduled = mondayItems.filter((i) => !i.isPipeline);
  const pipeline  = mondayItems.filter((i) =>  i.isPipeline);

  return (
    <>
      <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden sticky top-24 animate-fade-in" style={{ height: "calc(100vh - 9rem)" }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-zinc-100 truncate" title={product}>{product}</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Next Week · {weekLabel}</p>
            </div>
          </div>
          <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
        </div>

        {/* ── Stats bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-zinc-800/60 bg-zinc-950/40 flex-shrink-0 flex-wrap">
          <StatChip value={scheduled.length} label="scheduled" color="violet" />
          {pipeline.length > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <StatChip value={pipeline.length} label="no date" color="amber" />
            </>
          )}
          <span className="text-zinc-700">·</span>
          <StatChip value={plannedTasks.length} label="planned" color="emerald" />
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Planned drafts section — TOP */}
          <section className="px-4 py-4 border-b border-zinc-800/40">
            <div className="flex items-center justify-between">
              <SectionLabel icon={<Pencil className="w-3.5 h-3.5" />}>
                Planned Drafts ({plannedTasks.length})
              </SectionLabel>
              <button
                onClick={() => setShowAddModal(true)}
                disabled={dbError}
                title={dbError ? "Database not connected" : "Add planned task"}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 hover:text-violet-300 border border-violet-600/30 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>

            {plannedTasks.length === 0 ? (
              <div className="mt-4 py-8 flex flex-col items-center gap-2 text-zinc-700">
                <ClipboardList className="w-8 h-8" />
                <p className="text-sm font-medium text-zinc-600">No draft tasks yet</p>
                <p className="text-xs text-zinc-700 text-center">
                  Press <strong className="text-zinc-500">+ Add task</strong> above to plan who makes what this week
                </p>
              </div>
            ) : (
              <div className="mt-2.5 space-y-0.5">
                {plannedTasks.map((task) => (
                  <PlannedTaskRow
                    key={task.id}
                    task={task}
                    onDelete={() => onDeleteTask(task.id)}
                    onUpdate={(updates) => onUpdateTask(task.id, updates)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Monday tasks section — BOTTOM */}
          {mondayItems.length > 0 && (
            <section className="px-4 py-4">
              <SectionLabel icon={<CalendarDays className="w-3.5 h-3.5" />}>
                Monday Tasks ({mondayItems.length})
              </SectionLabel>
              <div className="mt-2.5 space-y-0.5">
                {mondayItems.map((item) => (
                  <MondayTaskRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Add task modal ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Add Planned Task</p>
                <p className="text-xs text-zinc-500 mt-0.5">{product}</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <AddTaskForm
              onAdd={(name, assignee) => onAddTask(product, name, assignee)}
              onClose={() => setShowAddModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ── StatChip ──────────────────────────────────────────────────────────────────

function StatChip({ value, label, color }: { value: number; label: string; color: "violet" | "amber" | "emerald" }) {
  const colorMap = {
    violet:  "text-violet-400",
    amber:   "text-amber-400",
    emerald: "text-emerald-400",
  };
  return (
    <span className="text-xs text-zinc-500">
      <span className={cn("font-bold", colorMap[color])}>{value}</span> {label}
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
      {icon}
      {children}
    </div>
  );
}

// ── Monday task row ───────────────────────────────────────────────────────────

function MondayTaskRow({ item }: { item: DashboardItem }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-zinc-800/40",
        item.isPipeline && "border-l-2 border-amber-500/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate" title={item.name}>{formatTaskName(item.name)}</p>

      </div>
      <div className="flex-shrink-0">
        <StatusBadge label={item.status} color={item.statusColor} />
      </div>
      <span
        className={cn(
          "text-xs font-medium flex-shrink-0 w-16 text-right",
          item.isOverdue ? "text-red-400" : item.isDueSoon ? "text-amber-400" : "text-zinc-500"
        )}
      >
        {formatDate(item.timelineEnd)}
      </span>
    </div>
  );
}

// ── Planned task row ──────────────────────────────────────────────────────────

function PlannedTaskRow({
  task, onDelete, onUpdate,
}: {
  task: PlannedTask;
  onDelete: () => void;
  onUpdate: (updates: { name?: string; assignee?: string | null; done?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    setDraft(task.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitName = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.name) onUpdate({ name: trimmed });
    else setDraft(task.name);
    setEditing(false);
  };

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-zinc-800/40 group transition-all",
      task.done && "opacity-60"
    )}>
      {/* Done toggle */}
      <button
        onClick={() => onUpdate({ done: !task.done })}
        className={cn(
          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
          task.done
            ? "border-emerald-500 bg-emerald-500"
            : "border-zinc-600 hover:border-emerald-400"
        )}
        title={task.done ? "Mark as not done" : "Mark as done"}
      >
        {task.done && <Check className="w-2.5 h-2.5 text-white" />}
      </button>

      {/* Pencil icon */}
      <Pencil className="w-3 h-3 text-zinc-700 flex-shrink-0" />

      {/* Task name — click to edit inline */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitName(); }
            if (e.key === "Escape") { setDraft(task.name); setEditing(false); }
          }}
          className="flex-1 text-sm bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-zinc-100 focus:outline-none focus:border-violet-500 min-w-0"
        />
      ) : (
        <button
          onClick={openEdit}
          title="Click to rename"
          className={cn(
            "flex-1 text-sm text-left truncate hover:text-zinc-100 min-w-0 transition-colors",
            task.done ? "line-through text-zinc-500" : "text-zinc-200"
          )}
        >
          {task.name}
        </button>
      )}

      {/* Create Task link — anchor so right-click → Copy link works natively */}
      <a
        href={buildTaskCreatorUrl(task)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open Task Creator"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 hover:text-teal-300 border border-teal-600/30 transition-colors flex-shrink-0 whitespace-nowrap"
      >
        <ExternalLink className="w-3 h-3" />
        Create
      </a>

      {/* Assignee select */}
      <select
        value={task.assignee ?? ""}
        onChange={(e) => onUpdate({ assignee: e.target.value || null })}
        className="text-xs bg-zinc-800/80 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-violet-500 flex-shrink-0 max-w-[130px]"
      >
        <option value="">— Unassigned</option>
        {TEAM_MEMBERS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {/* Confirm edit */}
      {editing && (
        <button
          onClick={commitName}
          className="p-1 rounded text-emerald-500 hover:bg-emerald-950/30 transition-colors flex-shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Delete — visible on hover */}
      {!editing && (
        <button
          onClick={onDelete}
          className="p-1 rounded text-zinc-700 hover:text-red-400 hover:bg-red-950/30 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ onAdd, onClose }: {
  onAdd: (name: string, assignee: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [assignee, setAssignee] = useState("");
  const [adding, setAdding]     = useState(false);

  const submit = async () => {
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await onAdd(name.trim(), assignee || null);
      setName("");
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-5 space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="What needs to be made?"
        autoFocus
        className="w-full px-3 py-2.5 text-sm rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
      />

      <div className="flex gap-2">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-violet-500"
        >
          <option value="">— Who will make this?</option>
          {TEAM_MEMBERS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <button
          onClick={submit}
          disabled={!name.trim() || adding}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
        >
          {adding ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Add
        </button>
      </div>
    </div>
  );
}
