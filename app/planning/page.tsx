import { BOARD_IDS } from "@/lib/types";
import { toWeekKey } from "@/lib/targets";
import { getWeekWindow } from "@/lib/utils";
import { getAllWeeksData } from "@/lib/items-server";
import { hasDb, getPlannedTasks, getWeekGoalsFromDb } from "@/lib/db";
import { PlanningClient } from "./PlanningClient";

export default async function PlanningPage() {
  const defaultBoard = "video" as const;
  const weekWindow   = getWeekWindow(1);
  const weekKey      = toWeekKey(weekWindow.start);
  const boardId      = BOARD_IDS[defaultBoard];

  const [allWeeksData, plannedTasks, goals] = await Promise.all([
    getAllWeeksData(boardId, defaultBoard).catch(() => null),
    hasDb() ? getPlannedTasks(defaultBoard, weekKey).catch(() => []) : Promise.resolve([]),
    getWeekGoalsFromDb(defaultBoard, weekKey),
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
