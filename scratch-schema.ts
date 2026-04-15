import { BOARD_IDS } from "./lib/types";
import { getBoardMetadata } from "./lib/items-server";

async function main() {
  const vidCols = await getBoardMetadata(BOARD_IDS.video);
  const desCols = await getBoardMetadata(BOARD_IDS.design);

  console.log("Video Board Columns:");
  vidCols.columns.forEach(c => console.log(c.id, c.title, c.type));

  console.log("\nDesign Board Columns:");
  desCols.columns.forEach(c => console.log(c.id, c.title, c.type));
}

main().catch(console.error);
