"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Inbox, BarChart3 } from "lucide-react";
import type { BoardType, MondayGroup, DashboardItem, ProductSummary, ColumnMapping } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { GroupFilter } from "@/components/GroupFilter";
import { ProductSummaryPanel } from "@/components/ProductSummaryPanel";

interface BoardsData {
  video: { id: string; name: string } | null;
  design: { id: string; name: string } | null;
}

interface ItemsData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
  cached?: boolean;
  cacheAgeSeconds?: number;
}

// Each badge maps a display label to the keyword used to match groups
const INTAKE_LABELS: { label: string; keyword: string }[] = [
  { label: "Form Requests", keyword: "form request" },
  { label: "Pending",       keyword: "pending" },
  { label: "Ready For Assignment", keyword: "ready for assignment" },
];

export default function IntakePage() {
  const [activeBoard, setActiveBoard] = useState<BoardType>("video");
  const [boardsData, setBoardsData] = useState<BoardsData | null>(null);
  const [groups, setGroups] = useState<MondayGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [itemsData, setItemsData] = useState<ItemsData | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Step 1: Load boards (cached)
  useEffect(() => {
    async function loadBoards() {
      const cacheKey = "boards";
      const hit = getCached<BoardsData>(cacheKey);
      if (hit) { setBoardsData(hit); setLoadingBoards(false); return; }

      setLoadingBoards(true);
      try {
        const res = await fetch("/api/boards");
        if (!res.ok) throw new Error("Failed to load boards");
        const data = await res.json();
        setCached(cacheKey, data);
        setBoardsData(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingBoards(false);
      }
    }
    loadBoards();
  }, []);

  // Step 2: Load groups when board changes (cached)
  useEffect(() => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    async function loadGroups() {
      const cacheKey = `groups:${boardId}`;
      const hit = getCached<MondayGroup[]>(cacheKey);
      if (hit) { setGroups(hit); return; }

      setLoadingGroups(true);
      setSelectedGroups([]);
      try {
        const res = await fetch(`/api/groups?boardId=${boardId}`);
        if (!res.ok) throw new Error("Failed to load groups");
        const data = await res.json();
        setCached(cacheKey, data.groups ?? []);
        setGroups(data.groups ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingGroups(false);
      }
    }
    loadGroups();
  }, [activeBoard, boardsData]);

  // Step 3: Load items in intake mode (cached)
  const loadItems = useCallback(async (forceRefresh = false) => {
    if (!boardsData) return;
    const boardId = boardsData[activeBoard]?.id;
    if (!boardId) return;

    const groupsParam = selectedGroups.length > 0 ? selectedGroups.join(",") : "all";
    const cacheKey = `items:intake:${boardId}:${groupsParam}`;

    // Serve from client cache instantly (skip loading state)
    if (!forceRefresh) {
      const hit = getCached<ItemsData>(cacheKey);
      if (hit) { setItemsData(hit); return; }
    }

    setLoadingItems(true);
    setError(null);

    const url = new URL("/api/items", window.location.origin);
    url.searchParams.set("boardId", boardId);
    url.searchParams.set("boardType", activeBoard);
    url.searchParams.set("groups", groupsParam);
    url.searchParams.set("mode", "intake");
    if (forceRefresh) {
      url.searchParams.set("refresh", "1");
      bustCacheByPrefix(`items:intake:${boardId}`);
    }

    try {
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load items");
      const data = await res.json();
      setCached(cacheKey, data);
      setItemsData(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingItems(false);
    }
  }, [activeBoard, selectedGroups, boardsData]);

  useEffect(() => {
    if (!loadingGroups && boardsData) loadItems();
  }, [loadItems, loadingGroups, boardsData]);

  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    // Don't clear itemsData — let cache serve it instantly on next render
    setItemsData(null);
  };

  // Count by group name (items are fetched BY GROUP, not by status column value)
  const byGroup = INTAKE_LABELS.reduce<Record<string, DashboardItem[]>>((acc, { label, keyword }) => {
    acc[label] = itemsData?.items.filter(
      (i) => i.groupTitle.toLowerCase().includes(keyword)
    ) ?? [];
    return acc;
  }, {});

  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Row 1: Board toggle + Group filter + Refresh */}
        <div className="flex flex-wrap items-center gap-4">
          {loadingBoards ? (
            <div className="h-11 w-72 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
          ) : (
            <BoardToggle active={activeBoard} onChange={handleBoardSwitch} loading={loadingItems} />
          )}

          <GroupFilter
            groups={groups}
            selectedIds={selectedGroups}
            onChange={setSelectedGroups}
            loading={loadingGroups}
          />

          <div className="ml-auto flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-zinc-600 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              id="refresh-btn"
              onClick={() => loadItems(true)}
              disabled={loadingItems}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-700",
                loadingItems && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loadingItems && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status badges */}
        {!loadingItems && itemsData && (
          <div className="flex flex-wrap items-center gap-3">
            {INTAKE_LABELS.map(({ label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800"
              >
                <Inbox className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-300 text-sm font-medium">{label}</span>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">
                  {byGroup[label]?.length ?? 0}
                </span>
              </div>
            ))}
            <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
              <BarChart3 className="w-3 h-3" />
              {itemsData.total} total
            </span>
          </div>
        )}

        {/* Loading state */}
        {loadingItems && !itemsData && (
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-48 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
            ))}
          </div>
        )}

        {/* Product Summary */}
        <ProductSummaryPanel
          summary={itemsData?.productSummary ?? []}
          totalItems={itemsData?.total ?? 0}
          loading={loadingItems}
          allItems={itemsData?.items ?? []}
        />

      </main>
    </div>
  );
}
