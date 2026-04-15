import { BOARD_IDS } from "@/lib/types";
import { getAllWeeksData, getBoardGroups } from "@/lib/items-server";
import { TimelineClient } from "./TimelineClient";

export default async function TimelinePage() {
  const defaultBoard = "video" as const;
  const boardId      = BOARD_IDS[defaultBoard];

  const [allWeeksData, groups] = await Promise.all([
    getAllWeeksData(boardId, defaultBoard).catch(() => null),
    getBoardGroups(boardId).catch(() => []),
  ]);

  return (
    <TimelineClient
      initialBoard={defaultBoard}
      initialAllWeeksData={allWeeksData}
      initialGroups={groups}
    />
  );
}
