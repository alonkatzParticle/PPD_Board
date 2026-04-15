import { BOARD_IDS } from "@/lib/types";
import { getIntakeData, getBoardGroups } from "@/lib/items-server";
import { IntakeClient } from "./IntakeClient";

export default async function IntakePage() {
  const defaultBoard = "video" as const;
  const boardId      = BOARD_IDS[defaultBoard];

  const [itemsData, groups] = await Promise.all([
    getIntakeData(boardId, defaultBoard).catch(() => null),
    getBoardGroups(boardId).catch(() => []),
  ]);

  return (
    <IntakeClient
      initialBoard={defaultBoard}
      initialItemsData={itemsData}
      initialGroups={groups}
    />
  );
}
