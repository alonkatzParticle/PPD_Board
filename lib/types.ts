// Shared TypeScript types for the PPD Dashboard

export type BoardType = "video" | "design";

export interface MondayBoard {
  id: string;
  name: string;
}

export interface MondayGroup {
  id: string;
  title: string;
  color?: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayColumnValue {
  id: string;
  title?: string; // only available in board column metadata, not in items_page
  text: string;
  value: string | null;
  type: string;
}

export interface MondayItem {
  id: string;
  name: string;
  group: {
    id: string;
    title: string;
  };
  column_values: MondayColumnValue[];
}

// ── Parsed / normalized types ──────────────────────────────────────────────

export interface DashboardItem {
  id: string;
  name: string;
  boardType: BoardType;
  groupId: string;
  groupTitle: string;
  product: string;
  status: string;
  statusColor: string; // hex color from Monday
  department: string;
  type: string;
  timelineStart: string | null; // ISO date string
  timelineEnd: string | null;   // ISO date string
  isOverdue: boolean;
  isDueSoon: boolean; // within 7 days
  isPipeline?: boolean; // true = counted as pipeline credit for next week
}

// Statuses that qualify a task as "pipeline credit" for next week
export const PIPELINE_STATUSES = ["form requests", "ready for assignment"];

export interface ProductSummary {
  product: string;
  total: number;
  byStatus: Record<string, number>;
}

export interface BoardsConfig {
  video: string | null;   // board ID
  design: string | null;  // board ID
}

export interface ColumnMapping {
  timeline: string;
  product: string;
  status: string;
  department: string;
  type: string;
}

// Department values to filter on
export const MARKETING_DEPARTMENTS = ["Marketing", "Marketing/Media"];

// Mode for the items API
export type ItemsMode = "timeline" | "intake";

// Statuses shown on the intake (home) page
export const INTAKE_STATUSES = ["form requests", "pending", "ready for assignment"];

// Board display names (for UI only)
export const BOARD_NAMES = {
  video: "Video Projects - 2.0",
  design: "Design Projects - 2.0",
} as const;

// Hardcoded board IDs from Monday.com URLs — never changes
// Video: https://particle-for-men.monday.com/boards/5433027071
// Design: https://particle-for-men.monday.com/boards/8036329818
export const BOARD_IDS: Record<BoardType, string> = {
  video: "5433027071",
  design: "8036329818",
};
