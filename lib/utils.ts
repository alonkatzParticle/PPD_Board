import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format, isPast, differenceInDays, parseISO,
  startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO as parse,
} from "date-fns";
import type { DashboardItem, MondayItem, MondayColumnValue, BoardType, ColumnMapping } from "./types";
import { MARKETING_DEPARTMENTS, PIPELINE_STATUSES, BOARD_IDS } from "./types";

// ── Week Window ────────────────────────────────────────────────────────────

export interface WeekWindow {
  /** weekOffset: 0 = default (last + this + next), -1 = one week earlier, etc. */
  weekOffset: number;
  /** Inclusive start date of the window */
  start: Date;
  /** Inclusive end date of the window */
  end: Date;
  label: string;
}

/**
 * Build a 3-week window centered on (this week + weekOffset adjustment).
 * weekOffset=0  → last week Mon → next week Sun
 * weekOffset=-1 → two weeks ago Mon → this week Sun
 * weekOffset=+1 → this week Mon → the week after next Sun
 */
export function getWeekWindow(weekOffset = 0): WeekWindow {
  const now = new Date();
  const weekOptions = { weekStartsOn: 0 as const }; // Sunday start

  // Anchor on the Monday of the target week
  const anchor = weekOffset === 0 ? now
    : weekOffset > 0 ? addWeeks(now, weekOffset)
    : subWeeks(now, Math.abs(weekOffset));

  const start = startOfWeek(anchor, weekOptions);
  const end   = endOfWeek(anchor, weekOptions);

  const startLabel = format(start, "MMM d");
  const endLabel   = format(end, "MMM d, yyyy");
  const label      = `${startLabel} – ${endLabel}`;

  return { weekOffset, start, end, label };
}

/** Filter dashboard items so only those with timelineEnd inside the window survive */
export function filterByWeekWindow(items: DashboardItem[], window: WeekWindow): DashboardItem[] {
  return items.filter((item) => {
    if (!item.timelineEnd) return false;
    try {
      const end = parseISO(item.timelineEnd);
      return isWithinInterval(end, { start: window.start, end: window.end });
    } catch {
      return false;
    }
  });
}

/**
 * Returns items that count as "pipeline credit" for next week.
 * These are unscheduled (or far-future) tasks from Marketing departments
 * sitting in intake-stage groups (Form Requests / Ready for Assignment).
 * The caller is responsible for passing only intake-group items — no status
 * check is needed here because group membership already implies pipeline stage.
 *
 * Qualifies when ALL of the following are true:
 *  - department ∈ MARKETING_DEPARTMENTS
 *  - timelineEnd is null  OR  timelineEnd is after nextWeekWindow.end
 */
export function getPipelineTasks(
  allItems: DashboardItem[],
  nextWeekWindow: WeekWindow,
  excludeIds: Set<string>
): DashboardItem[] {
  return allItems
    .filter((item) => {
      if (excludeIds.has(item.id)) return false;
      if (!MARKETING_DEPARTMENTS.includes(item.department)) return false;
      // No timeline: qualifies
      if (!item.timelineEnd) return true;
      // Timeline exists but is beyond next week: qualifies
      try {
        return parseISO(item.timelineEnd) > nextWeekWindow.end;
      } catch {
        return false;
      }
    })
    .map((item) => ({ ...item, isPipeline: true }));
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Build the Monday.com deep-link URL for an item */
export function getMondayItemUrl(item: DashboardItem): string {
  return `https://particle-for-men.monday.com/boards/${BOARD_IDS[item.boardType]}/items/${item.id}`;
}

/** Extract the display label from a Monday task name — everything after the last "|" */
export function formatTaskName(name: string): string {
  const idx = name.lastIndexOf("|");
  return idx === -1 ? name : name.slice(idx + 1).trim();
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    return isPast(parseISO(dateStr));
  } catch {
    return false;
  }
}

export function isDueSoon(dateStr: string | null, days = 7): boolean {
  if (!dateStr) return false;
  try {
    const diff = differenceInDays(parseISO(dateStr), new Date());
    return diff >= 0 && diff <= days;
  } catch {
    return false;
  }
}

/** Parse a Monday timeline value JSON → { start, end } */
export function parseTimeline(value: string | null): { start: string | null; end: string | null } {
  if (!value) return { start: null, end: null };
  try {
    const parsed = JSON.parse(value);
    return {
      start: parsed.from ?? null,
      end: parsed.to ?? null,
    };
  } catch {
    return { start: null, end: null };
  }
}

/** Parse Monday status value JSON → { label, color } */
export function parseStatus(value: string | null, text: string): { label: string; color: string } {
  if (!value) return { label: text || "—", color: "#c4c4c4" };
  try {
    const parsed = JSON.parse(value);
    return {
      label: parsed.label ?? text ?? "—",
      color: parsed.color ?? "#c4c4c4",
    };
  } catch {
    return { label: text || "—", color: "#c4c4c4" };
  }
}

/** Get a column value by partial title match (case-insensitive) */
export function getColumnByTitle(
  columns: MondayColumnValue[],
  titleFragment: string
): MondayColumnValue | undefined {
  return columns.find((c) =>
    c.title?.toLowerCase().includes(titleFragment.toLowerCase())
  );
}

/** Normalize a raw Monday item into a DashboardItem */
export function normalizeMondayItem(
  item: MondayItem,
  boardType: BoardType,
  columnMapping: ColumnMapping,
  skipDeptFilter = false  // set true for intake mode (view all departments)
): DashboardItem | null {
  const getCol = (id: string): MondayColumnValue | undefined =>
    item.column_values.find((c) => c.id === id);

  // Assignees
  const assigneesCol = getCol(columnMapping.assignees);
  const assigneesText = assigneesCol?.text?.trim() || "";
  const assignees = assigneesText
    ? assigneesText.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Department filter (skipped in intake mode)
  const deptCol = getCol(columnMapping.department);
  const dept = deptCol?.text?.trim() ?? "";
  if (!skipDeptFilter && !MARKETING_DEPARTMENTS.some((d) => dept.toLowerCase() === d.toLowerCase())) {
    return null;
  }

  // Timeline
  const timelineCol = getCol(columnMapping.timeline);
  const { start, end } = parseTimeline(timelineCol?.value ?? null);

  // Status
  const statusCol = getCol(columnMapping.status);
  const { label: statusLabel, color: statusColor } = parseStatus(
    statusCol?.value ?? null,
    statusCol?.text ?? ""
  );

  // Product
  const productCol = getCol(columnMapping.product);
  const product = productCol?.text?.trim() ?? "—";

  // Type
  const typeCol = getCol(columnMapping.type);
  const type = typeCol?.text?.trim() ?? "—";

  return {
    id: item.id,
    name: item.name,
    boardType,
    groupId: item.group.id,
    groupTitle: item.group.title,
    product,
    status: statusLabel,
    statusColor,
    department: dept,
    type,
    timelineStart: start,
    timelineEnd: end,
    isOverdue: isOverdue(end),
    isDueSoon: isDueSoon(end),
    assignees,
  };
}

/** Auto-detect column IDs from column titles */
export function detectColumnMapping(
  columns: { id: string; title: string; type: string; settings_str?: string }[]
): ColumnMapping {
  const find = (fragment: string, type?: string) =>
    columns.find(
      (c) =>
        c.title.toLowerCase().includes(fragment.toLowerCase()) &&
        (type ? c.type === type : true)
    )?.id ?? "";

  return {
    timeline: find("timeline", "timerange") || find("timeline"),
    product: find("product"),
    status: find("status", "color") || find("status"),
    department: find("department"),
    type: find("type"),
    assignees: find("editor") || find("designer") || find("", "people"),
  };
}

/** Summarize items by product */
export function buildProductSummary(items: DashboardItem[], knownProducts?: string[]) {
  const map = new Map<string, { total: number; byStatus: Record<string, number> }>();

  // Seed with all known products at zero (so they always appear)
  if (knownProducts) {
    for (const name of knownProducts) {
      if (name && name !== "-") map.set(name, { total: 0, byStatus: {} });
    }
  }

  for (const item of items) {
    const key = item.product;
    if (!map.has(key)) {
      map.set(key, { total: 0, byStatus: {} });
    }
    const entry = map.get(key)!;
    entry.total++;
    entry.byStatus[item.status] = (entry.byStatus[item.status] ?? 0) + 1;
  }

  return Array.from(map.entries())
    .map(([product, data]) => ({ product, ...data }))
    .sort((a, b) => {
      // Items with tasks first, then alphabetical within each group
      if (b.total !== a.total) return b.total - a.total;
      return a.product.localeCompare(b.product);
    });
}
