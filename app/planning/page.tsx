import { BOARD_IDS } from "@/lib/types";
import { toWeekKey } from "@/lib/targets";
import { getWeekWindow } from "@/lib/utils";
import { getAllWeeksData } from "@/lib/items-server";
import { hasDb, getDb, getPlannedTasks, ensureSchema } from "@/lib/db";
import type { WeekGoals } from "@/lib/targets";
import { PlanningClient } from "./PlanningClient";

async function getGoals(boardType: string, weekKey: string): Promise<WeekGoals> {
  if (!hasDb()) return { totalTarget: null, products: {} };
  try {
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT goals FROM week_goals
      WHERE board_type = ${boardType} AND week_key = ${weekKey}
      LIMIT 1
    ` as { goals: WeekGoals }[];
    return rows[0]?.goals ?? { totalTarget: null, products: {} };
  } catch {
    return { totalTarget: null, products: {} };
  }
}

export default async function PlanningPage() {
  const defaultBoard = "video" as const;
  const weekWindow   = getWeekWindow(1);
  const weekKey      = toWeekKey(weekWindow.start);
  const boardId      = BOARD_IDS[defaultBoard];

  const [allWeeksData, plannedTasks, goals] = await Promise.all([
    getAllWeeksData(boardId, defaultBoard).catch(() => null),
    hasDb() ? getPlannedTasks(defaultBoard, weekKey).catch(() => []) : Promise.resolve([]),
    getGoals(defaultBoard, weekKey),
  ]);

  return (
    <PlanningClient
      initialBoard={defaultBoard}
      initialAllWeeksData={allWeeksData}
      initialPlannedTasks={plannedTasks}
      initialGoals={goals}
    />
  );
}
