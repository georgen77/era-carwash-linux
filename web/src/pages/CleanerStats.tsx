import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, parseISO, differenceInMinutes } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

const APARTMENT_RU: Record<string, string> = {
  piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор",
};

interface Assignment {
  id: string; apartment: string; cleaning_date: string; cleaner_name: string | null;
  started_at: string | null; finished_at: string | null;
  payment_amount: number | null; payment_confirmed: boolean | null;
  status: string | null;
}

interface Cleaner { id: string; name: string; telegram_id: string | null; }

type Period = "current" | "previous" | "custom";

export default function CleanerStats() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [selectedCleaner, setSelectedCleaner] = useState("");
  const [period, setPeriod] = useState<Period>("current");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = sessionStorage.getItem('cleaning_authenticated');
    if (!auth) { navigate('/cleaning-auth'); return; }
    Promise.all([
      supabase.from("cleaning_assignments").select("*").order("cleaning_date", { ascending: false }),
      supabase.from("cleaners").select("id,name,telegram_id").order("name"),
    ]).then(([{ data: a }, { data: c }]) => {
      setAssignments((a ?? []) as Assignment[]);
      setCleaners((c ?? []) as Cleaner[]);
      setLoading(false);
    });
  }, [navigate]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === "current") return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    if (period === "previous") {
      const prev = subMonths(now, 1);
      return { start: format(startOfMonth(prev), "yyyy-MM-dd"), end: format(endOfMonth(prev), "yyyy-MM-dd") };
    }
    return { start: customStart, end: customEnd };
  }, [period, customStart, customEnd]);

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      if (a.cleaning_date < dateRange.start || a.cleaning_date > dateRange.end) return false;
      if (selectedCleaner && a.cleaner_name !== selectedCleaner) return false;
      return true;
    });
  }, [assignments, dateRange, selectedCleaner]);

  const stats = useMemo(() => {
    const totalCleanings = filtered.length;
    let totalMinutes = 0;
    let countedTimes = 0;
    for (const a of filtered) {
      if (a.started_at && a.finished_at) {
        totalMinutes += differenceInMinutes(parseISO(a.finished_at), parseISO(a.started_at));
        countedTimes++;
      }
    }
    const totalEarned = filtered.reduce((s, a) => s + (a.payment_amount ?? 35), 0);
    const unpaid = filtered.filter(a => !a.payment_confirmed).reduce((s, a) => s + (a.payment_amount ?? 35), 0);
    return { totalCleanings, totalHours: (totalMinutes / 60).toFixed(1), totalEarned, unpaid };
  }, [filtered]);

  function fmtTime(dt: string | null) {
    if (!dt) return "—";
    try { return format(parseISO(dt), "HH:mm"); } catch { return "—"; }
  }

  function duration(start: string | null, end: string | null) {
    if (!start || !end) return "—";
    const mins = differenceInMinutes(parseISO(end), parseISO(start));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}ч ${m}м`;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">📊 Статистика уборщиц</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Filters */}
        <div className="space-y-3 p-3 rounded-xl border bg-card/80">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Уборщица</label>
            <select value={selectedCleaner} onChange={e => setSelectedCleaner(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background">
              <option value="">Все уборщицы</option>
              {cleaners.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {(["current", "previous", "custom"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("text-xs px-3 py-1.5 rounded-lg border transition",
                  period === p ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {p === "current" ? "Текущий месяц" : p === "previous" ? "Прошлый месяц" : "Свой период"}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border bg-background flex-1" />
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border bg-background flex-1" />
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border bg-card/80 p-3 text-center">
            <div className="text-2xl font-bold">{stats.totalCleanings}</div>
            <div className="text-xs text-muted-foreground">Всего уборок</div>
          </div>
          <div className="rounded-xl border bg-card/80 p-3 text-center">
            <div className="text-2xl font-bold">{stats.totalHours}ч</div>
            <div className="text-xs text-muted-foreground">Всего часов</div>
          </div>
          <div className="rounded-xl border bg-card/80 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.totalEarned}€</div>
            <div className="text-xs text-muted-foreground">Всего заработано</div>
          </div>
          <div className="rounded-xl border bg-card/80 p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.unpaid}€</div>
            <div className="text-xs text-muted-foreground">К выплате</div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Дата</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Апартамент</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Начало</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Конец</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Длит.</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">Сумма</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2">💰</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-6">Загрузка...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-6">Нет данных</td></tr>
                ) : (
                  filtered.map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs">{format(parseISO(a.cleaning_date), "dd.MM", { locale: ru })}</td>
                      <td className="px-3 py-2 text-xs font-medium">{APARTMENT_RU[a.apartment] ?? a.apartment}</td>
                      <td className="px-3 py-2 text-xs">{fmtTime(a.started_at)}</td>
                      <td className="px-3 py-2 text-xs">{fmtTime(a.finished_at)}</td>
                      <td className="px-3 py-2 text-xs">{duration(a.started_at, a.finished_at)}</td>
                      <td className="px-3 py-2 text-xs text-right font-semibold">{a.payment_amount ?? 35}€</td>
                      <td className="px-3 py-2 text-center">{a.payment_confirmed ? "✅" : "⏳"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
