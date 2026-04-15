"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, Inbox, BarChart3 } from "lucide-react";
import type { BoardType, MondayGroup, DashboardItem, ProductSummary, ColumnMapping } from "@/lib/types";
import { BOARD_IDS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getCached, setCached, bustCacheByPrefix } from "@/lib/clientCache";
import { BoardToggle } from "@/components/BoardToggle";
import { GroupFilter } from "@/components/GroupFilter";
import { ProductSummaryPanel } from "@/components/ProductSummaryPanel";
import type { IntakeData } from "@/lib/items-server";

interface IntakeClientProps {
  initialBoard: BoardType;
  initialItemsData: IntakeData | null;
  initialGroups: { id: string; title: string; color?: string }[];
}

interface ItemsData {
  items: DashboardItem[];
  productSummary: ProductSummary[];
  columnMapping: ColumnMapping;
  total: number;
  cached?: boolean;
  cacheAgeSeconds?: number;
}

const INTAKE_LABELS: { label: string; keyword: string }[] = [
  { label: "Form Requests",          keyword: "form request" },
  { label: "Pending",                keyword: "pending" },
  { label: "Ready For Assignment",   keyword: "ready for assignment" },
];

export function IntakeClient({
  initialBoard, initialItemsData, initialGroups,
}: IntakeClientProps) {
  const [activeBoard, setActiveBoard]       = useState<BoardType>(initialBoard);
  const [groups, setGroups]                 = useState<MondayGroup[]>(initialGroups);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [itemsData, setItemsData]           = useState<ItemsData | null>(initialItemsData);
  const [loadingGroups, setLoadingGroups]   = useState(false);
  const [loadingItems, setLoadingItems]     = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]       = useState<Date | null>(null);

  const itemsLoadSkipped  = useRef(!!initialItemsData && selectedGroups.length === 0);
  const groupsLoadSkipped = useRef(initialGroups.length > 0);
  const initialBoardRef   = useRef(initialBoard);

  // Load groups
  const loadGroups = useCallback(async () => {
    const boardId  = BOARD_IDS[activeBoard];
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
  }, [activeBoard]);

  useEffect(() => {
    if (groupsLoadSkipped.current && activeBoard === initialBoardRef.current) {
      groupsLoadSkipped.current = false;
      return;
    }
    loadGroups();
  }, [loadGroups, activeBoard]);

  // Load items
  const loadItems = useCallback(async (forceRefresh = false) => {
    const boardId     = BOARD_IDS[activeBoard];
    const groupsParam = selectedGroups.length > 0 ? selectedGroups.join(",") : "all";
    const cacheKey    = `items:intake:${boardId}:${groupsParam}`;

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
  }, [activeBoard, selectedGroups]);

  // Skip initial load if SSR provided data; re-run on board/group change
  useEffect(() => {
    if (itemsLoadSkipped.current) { itemsLoadSkipped.current = false; return; }
    if (!loadingGroups) loadItems();
  }, [loadItems, loadingGroups]);

  const handleBoardSwitch = (board: BoardType) => {
    setActiveBoard(board);
    setItemsData(null);
    setSelectedGroups([]);
  };

  const byGroup = INTAKE_LABELS.reduce<Record<string, DashboardItem[]>>((acc, { label, keyword }) => {
    acc[label] = itemsData?.items.filter(
      (i) => i.groupTitle.toLowerCase().includes(keyword)
    ) ?? [];
    return acc;
  }, {});

  return (
    <div className="min-h-screen hero-gradient">
      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Row 1 */}
        <div className="flex flex-wrap items-center gap-4">
          <BoardToggle active={activeBoard} onChange={handleBoardSwitch} loading={loadingItems} />

          <GroupFilter groups={groups} selectedIds={selectedGroups} onChange={setSelectedGroups} loading={loadingGroups} />

          <div className="ml-auto flex items-center gap-3">
            {lastRefresh && <span className="text-xs text-zinc-600 hidden sm:block">Updated {lastRefresh.toLocaleTimeString()}</span>}
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
              <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <Inbox className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-300 text-sm font-medium">{label}</span>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">
                  {byGroup[label]?.length ?? 0}
                </span>
              </div>
            ))}
            <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
              <BarChart3 className="w-3 h-3" />{itemsData.total} total
            </span>
          </div>
        )}

        {loadingItems && !itemsData && (
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-48 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />
            ))}
          </div>
        )}

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
