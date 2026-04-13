import { NextRequest, NextResponse } from "next/server";
import { mondayQuery, GET_GROUPS_QUERY, GET_COLUMNS_QUERY } from "@/lib/monday";
import { detectColumnMapping } from "@/lib/utils";

interface GroupsResponse {
  boards: {
    id: string;
    name: string;
    groups: { id: string; title: string; color: string }[];
  }[];
}

interface ColumnsResponse {
  boards: {
    id: string;
    columns: { id: string; title: string; type: string }[];
  }[];
}

export async function GET(req: NextRequest) {
  const boardId = req.nextUrl.searchParams.get("boardId");

  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  try {
    const [groupsData, columnsData] = await Promise.all([
      mondayQuery<GroupsResponse>(GET_GROUPS_QUERY, { boardId }),
      mondayQuery<ColumnsResponse>(GET_COLUMNS_QUERY, { boardId }),
    ]);

    const board = groupsData.boards[0];
    const columns = columnsData.boards[0]?.columns ?? [];
    const columnMapping = detectColumnMapping(columns);

    return NextResponse.json({
      groups: board?.groups ?? [],
      columns,
      columnMapping,
    });
  } catch (err) {
    console.error("[/api/groups]", err);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}
