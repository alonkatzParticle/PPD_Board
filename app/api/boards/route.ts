import { NextResponse } from "next/server";
import { mondayQuery } from "@/lib/monday";
import { BOARD_IDS, BOARD_NAMES } from "@/lib/types";

export const dynamic = 'force-dynamic';

const VERIFY_BOARDS_QUERY = `
  query VerifyBoards($videoId: ID!, $designId: ID!) {
    video: boards(ids: [$videoId]) { id name }
    design: boards(ids: [$designId]) { id name }
  }
`;

interface VerifyResponse {
  video: { id: string; name: string }[];
  design: { id: string; name: string }[];
}

export async function GET() {
  try {
    const data = await mondayQuery<VerifyResponse>(VERIFY_BOARDS_QUERY, {
      videoId: BOARD_IDS.video,
      designId: BOARD_IDS.design,
    });

    return NextResponse.json({
      video: data.video[0]
        ? { id: data.video[0].id, name: data.video[0].name }
        : { id: BOARD_IDS.video, name: BOARD_NAMES.video }, // fallback to config
      design: data.design[0]
        ? { id: data.design[0].id, name: data.design[0].name }
        : { id: BOARD_IDS.design, name: BOARD_NAMES.design },
    });
  } catch (err) {
    console.error("[/api/boards]", err);
    // Return configured IDs even on error so the app still works
    return NextResponse.json({
      video: { id: BOARD_IDS.video, name: BOARD_NAMES.video },
      design: { id: BOARD_IDS.design, name: BOARD_NAMES.design },
    });
  }
}
