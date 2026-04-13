import { NextResponse } from "next/server";
import { mondayQuery } from "@/lib/monday";
import { detectColumnMapping } from "@/lib/utils";
import type { BoardType } from "@/lib/types";

// This endpoint is called by Vercel Cron every 5 minutes.
// It pre-warms the server-side item cache for both boards so that
// the first real user request is served instantly from cache.

interface BoardsResponse {
  boards: { id: string; name: string }[];
}

interface ColumnsAndGroupsResponse {
  boards: {
    columns: { id: string; title: string; type: string; settings_str: string }[];
    groups: { id: string; title: string }[];
  }[];
}

const GET_BOARDS = `
  query {
    boards(limit: 10, order_by: created_at) {
      id name
    }
  }
`;

const GET_META = `
  query($boardId: ID!) {
    boards(ids: [$boardId]) {
      columns { id title type settings_str }
      groups { id title }
    }
  }
`;

export async function GET(req: Request) {
  // Protect the cron endpoint — Vercel sets this header automatically
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};

  try {
    // Fetch both boards by hitting /api/items?allWeeks=1 for each
    // We call /api/items directly (same process) which populates the in-memory cache
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // Get board IDs
    const boardsRes = await fetch(`${base}/api/boards`);
    if (!boardsRes.ok) throw new Error("boards fetch failed");
    const boards: { video: { id: string } | null; design: { id: string } | null } = await boardsRes.json();

    const entries: [BoardType, string | null][] = [
      ["video",  boards.video?.id  ?? null],
      ["design", boards.design?.id ?? null],
    ];

    await Promise.allSettled(
      entries.map(async ([boardType, boardId]) => {
        if (!boardId) { results[boardType] = "no board"; return; }
        const url = `${base}/api/items?boardId=${boardId}&boardType=${boardType}&groups=all&allWeeks=1&refresh=1`;
        const res = await fetch(url);
        results[boardType] = res.ok ? "warmed" : `error ${res.status}`;
      })
    );

    return NextResponse.json({ ok: true, results, warmedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/warm]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
