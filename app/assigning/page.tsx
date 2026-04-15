export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { BOARD_IDS } from "@/lib/types";
import { toWeekKey } from "@/lib/targets";
import { getWeekWindow } from "@/lib/utils";
import { getAllWeeksData } from "@/lib/items-server";
import { getWeekGoalsFromDb } from "@/lib/db";
import { AssigningClient } from "./AssigningClient";

export default async function AssigningPage() {
  const defaultBoard = "video" as const;
  const weekKey      = toWeekKey(getWeekWindow(1).start);
  const boardId      = BOARD_IDS[defaultBoard];

  const [allWeeksData, goals] = await Promise.all([
    getAllWeeksData(boardId, defaultBoard).catch(() => null),
    getWeekGoalsFromDb(defaultBoard, weekKey),
  ]);

  return (
    <AssigningClient
      initialBoard={defaultBoard}
      initialAllWeeksData={allWeeksData}
      initialGoals={goals}
    />
  );
}
