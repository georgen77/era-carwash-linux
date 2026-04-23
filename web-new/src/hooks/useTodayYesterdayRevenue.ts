import { useQuery } from "@tanstack/react-query";
import { fetchAllWashes, formatDateForApi } from "@/lib/api";
import { subDays } from "date-fns";

export interface DayRevenueSummary {
  today: { total: number; card: number } | null;
  yesterday: { total: number; card: number } | null;
  isLoading: boolean;
}

/** Find index of card/cashless payment column in headers */
function findCardColIndex(headers: string[]): number {
  const candidates = ["за безготівку", "за безгот", "безготівкова", "безготівка", "безнал", "картка", "card", "cashless", "безгот.", "б/г"];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (candidates.some(c => h.includes(c))) return i;
  }
  // fallback: any header containing "без"
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (h.includes("без")) return i;
  }
  return -1;
}

function extractSums(results: import("@/lib/api").WashReport[], washName?: string) {
  const filtered = washName
    ? results.filter(r => r.washName === washName && !r.error)
    : results.filter(r => !r.error);

  if (!filtered.length) return { total: 0, card: 0 };

  let total = 0;
  let card = 0;

  for (const w of filtered) {
    total += parseFloat(w.totalRow?.[1] || "0");
    const cardIdx = findCardColIndex(w.headers);
    console.log('[cardCol]', w.washName, 'headers:', w.headers, 'cardIdx:', cardIdx, 'totalRow:', w.totalRow);
    if (cardIdx > 0) {
      card += parseFloat(w.totalRow?.[cardIdx] || "0");
    }
  }
  return { total, card };
}

export function useTodayYesterdayRevenue() {
  const today = formatDateForApi(new Date());
  const yesterday = formatDateForApi(subDays(new Date(), 1));

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ["rev-today", today],
    queryFn: () => fetchAllWashes(today, today),
    staleTime: 1000 * 60 * 5,
  });

  const { data: yesterdayData, isLoading: yesterdayLoading } = useQuery({
    queryKey: ["rev-yesterday", yesterday],
    queryFn: () => fetchAllWashes(yesterday, yesterday),
    staleTime: 1000 * 60 * 60,
  });

  return {
    isLoading: todayLoading || yesterdayLoading,
    todayData: todayData?.results ?? null,
    yesterdayData: yesterdayData?.results ?? null,
    getSums(washName?: string) {
      return {
        today: todayData ? extractSums(todayData.results, washName) : null,
        yesterday: yesterdayData ? extractSums(yesterdayData.results, washName) : null,
      };
    },
  };
}
