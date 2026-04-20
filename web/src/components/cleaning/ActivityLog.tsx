import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

const APARTMENT_RU: Record<string, string> = {
  piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор",
};

interface LogEntry {
  id: string;
  datetime: string;
  cleaner: string;
  apartment: string;
  action: string;
  details: string;
  bookingDates: string;
  hasSpa: boolean;
  paymentAmount: number;
  paymentConfirmed: boolean;
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fCleaner, setFCleaner] = useState("all");
  const [fApartment, setFApartment] = useState("all");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fSpa, setFSpa] = useState("all");
  const [fPayment, setFPayment] = useState("all");
  const [fAction, setFAction] = useState("all");

  async function loadData() {
    setLoading(true);

    const [assignRes, schedRes, movRes] = await Promise.all([
      supabase.from("cleaning_assignments").select("*").order("cleaning_date", { ascending: false }),
      supabase.from("cleaning_schedule").select("*"),
      supabase.from("movements").select("*").order("created_at", { ascending: false }),
    ]);

    const assignments = assignRes.data ?? [];
    const schedules = schedRes.data ?? [];
    const movements = movRes.data ?? [];

    const schedMap = new Map<string, any>();
    schedules.forEach((s: any) => schedMap.set(s.id, s));

    const result: LogEntry[] = [];

    // From assignments: start/finish events
    for (const a of assignments) {
      const sched = a.schedule_id ? schedMap.get(a.schedule_id) : null;
      const bookingDates = sched
        ? `${fmtShort(sched.checkin_date)}→${sched.checkout_date ? fmtShort(sched.checkout_date) : "?"}`
        : "—";
      const hasSpa = sched?.tasks ? checkSpa(sched.tasks) : false;

      if (a.started_at) {
        result.push({
          id: `${a.id}-start`,
          datetime: a.started_at,
          cleaner: a.cleaner_name || "—",
          apartment: a.apartment,
          action: "Начало уборки",
          details: "",
          bookingDates,
          hasSpa,
          paymentAmount: Number(a.payment_amount ?? 35),
          paymentConfirmed: !!a.payment_confirmed,
        });
      }

      if (a.finished_at) {
        result.push({
          id: `${a.id}-finish`,
          datetime: a.finished_at,
          cleaner: a.cleaner_name || "—",
          apartment: a.apartment,
          action: "Конец уборки",
          details: "",
          bookingDates,
          hasSpa,
          paymentAmount: Number(a.payment_amount ?? 35),
          paymentConfirmed: !!a.payment_confirmed,
        });
      }

      // If assignment exists but no start/finish, still show as entry
      if (!a.started_at && !a.finished_at && a.status !== "cancelled") {
        result.push({
          id: a.id,
          datetime: a.registered_at || a.cleaning_date + "T00:00:00",
          cleaner: a.cleaner_name || "—",
          apartment: a.apartment,
          action: a.status === "done" ? "Конец уборки" : "Назначение",
          details: "",
          bookingDates,
          hasSpa,
          paymentAmount: Number(a.payment_amount ?? 35),
          paymentConfirmed: !!a.payment_confirmed,
        });
      }
    }

    // From movements: linen marking
    const linenMovements = movements.filter((m: any) =>
      m.notes && (m.notes.includes("Грязное бельё") || m.notes.includes("грязное бельё") || m.notes.includes("Грязное белье"))
    );

    for (const m of linenMovements) {
      const itemNames: Record<string, string> = {
        sheets: "простыни", duvet_covers: "пододеяльники", pillowcases: "наволочки",
        large_towels: "б.полотенца", small_towels: "м.полотенца", kitchen_towels: "кух.полотенца",
        rugs: "коврики", beach_mat: "пляж.мат", mattress_pad: "наматрасник",
      };
      const aptKey = m.from_location || "";
      result.push({
        id: `mov-${m.id}`,
        datetime: m.created_at,
        cleaner: m.cleaner_name || "—",
        apartment: aptKey,
        action: "Отметка белья",
        details: `${itemNames[m.item_type] || m.item_type} ×${m.quantity}`,
        bookingDates: "—",
        hasSpa: false,
        paymentAmount: 0,
        paymentConfirmed: false,
      });
    }

    // Sort by datetime descending
    result.sort((a, b) => b.datetime.localeCompare(a.datetime));
    setEntries(result);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  function checkSpa(tasks: any): boolean {
    if (!tasks) return false;
    const str = typeof tasks === "string" ? tasks : JSON.stringify(tasks);
    return str.toLowerCase().includes("spa") || str.toLowerCase().includes("спа") || str.toLowerCase().includes("джакузи");
  }

  function fmtShort(d: string) {
    try {
      const p = d.split("-");
      return `${p[2]}.${p[1]}`;
    } catch {
      return d;
    }
  }

  function fmtDT(d: string) {
    try {
      return format(parseISO(d), "dd.MM HH:mm", { locale: ru });
    } catch {
      return d;
    }
  }

  // Get unique cleaners
  const cleaners = [...new Set(entries.map(e => e.cleaner).filter(c => c !== "—"))];

  // Apply filters
  const filtered = entries.filter(e => {
    if (fCleaner !== "all" && e.cleaner !== fCleaner) return false;
    if (fApartment !== "all" && e.apartment !== fApartment) return false;
    if (fAction !== "all" && e.action !== fAction) return false;
    if (fSpa === "yes" && !e.hasSpa) return false;
    if (fSpa === "no" && e.hasSpa) return false;
    if (fPayment === "paid" && !e.paymentConfirmed) return false;
    if (fPayment === "unpaid" && e.paymentConfirmed) return false;
    if (fDateFrom) {
      const entryDate = e.datetime.substring(0, 10);
      if (entryDate < fDateFrom) return false;
    }
    if (fDateTo) {
      const entryDate = e.datetime.substring(0, 10);
      if (entryDate > fDateTo) return false;
    }
    return true;
  });

  // Summary
  const cleaningEntries = filtered.filter(e => e.action === "Конец уборки" || (e.action === "Начало уборки" && !filtered.find(f => f.id.replace("-start", "-finish") === e.id.replace("-start", "-finish") && f.action === "Конец уборки")));
  const totalCleanings = filtered.filter(e => e.action === "Конец уборки").length;
  const totalPayments = filtered
    .filter(e => e.action === "Конец уборки" || e.action === "Назначение")
    .reduce((s, e) => s + e.paymentAmount, 0);

  const ACTION_COLORS: Record<string, string> = {
    "Начало уборки": "bg-purple-100 text-purple-700 border-purple-200",
    "Конец уборки": "bg-green-100 text-green-700 border-green-200",
    "Отметка белья": "bg-blue-100 text-blue-700 border-blue-200",
    "Назначение": "bg-gray-100 text-gray-600 border-gray-200",
  };

  function exportCSV() {
    const headers = ["Дата/Время,Уборщица,Апартамент,Действие,Детали,Бронь,Спа,Сумма,Выплата"];
    const rows = filtered.map(e => [
      fmtDT(e.datetime),
      e.cleaner,
      APARTMENT_RU[e.apartment] ?? e.apartment,
      e.action,
      e.details,
      e.bookingDates,
      e.hasSpa ? "Да" : "Нет",
      e.paymentAmount || "",
      e.paymentConfirmed ? "Да" : "Нет",
    ].join(","));
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity_log_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={fCleaner} onValueChange={setFCleaner}>
            <SelectTrigger className="h-8 text-xs bg-white/60"><SelectValue placeholder="Уборщица" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все уборщицы</SelectItem>
              {cleaners.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fApartment} onValueChange={setFApartment}>
            <SelectTrigger className="h-8 text-xs bg-white/60"><SelectValue placeholder="Апартамент" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все апартаменты</SelectItem>
              {Object.entries(APARTMENT_RU).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={fAction} onValueChange={setFAction}>
            <SelectTrigger className="h-8 text-xs bg-white/60"><SelectValue placeholder="Действие" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              <SelectItem value="Начало уборки">Начало</SelectItem>
              <SelectItem value="Конец уборки">Конец</SelectItem>
              <SelectItem value="Отметка белья">Бельё</SelectItem>
              <SelectItem value="Назначение">Назначение</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fSpa} onValueChange={setFSpa}>
            <SelectTrigger className="h-8 text-xs bg-white/60"><SelectValue placeholder="Спа" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="yes">Со спа</SelectItem>
              <SelectItem value="no">Без спа</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fPayment} onValueChange={setFPayment}>
            <SelectTrigger className="h-8 text-xs bg-white/60"><SelectValue placeholder="Выплата" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="paid">Выплачено</SelectItem>
              <SelectItem value="unpaid">Не выплачено</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)}
            className="h-8 text-xs bg-white/60 flex-1" placeholder="С" />
          <Input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)}
            className="h-8 text-xs bg-white/60 flex-1" placeholder="По" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} записей</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white/60" onClick={loadData}>
            <RefreshCw className="h-3 w-3 mr-1" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white/60" onClick={exportCSV}>
            <Download className="h-3 w-3 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Нет данных</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="rounded-xl p-3 bg-white/50 border border-white/30 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{fmtDT(e.datetime)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ACTION_COLORS[e.action] ?? ""}`}>
                      {e.action}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="font-medium">👤 {e.cleaner}</span>
                    <span className="text-muted-foreground">🏠 {APARTMENT_RU[e.apartment] ?? e.apartment}</span>
                  </div>
                  {e.details && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">📦 {e.details}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>📅 {e.bookingDates}</span>
                    {e.hasSpa && <span className="text-pink-600 font-medium">🧖 Спа</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {e.paymentAmount > 0 && (
                    <span className={`text-sm font-bold ${e.paymentConfirmed ? "text-green-700" : "text-foreground"}`}>
                      {e.paymentAmount}€
                    </span>
                  )}
                  {e.paymentAmount > 0 && (
                    <span className={`text-[10px] ${e.paymentConfirmed ? "text-green-600" : "text-amber-600"}`}>
                      {e.paymentConfirmed ? "✅ Выплачено" : "⏳ Ожидает"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary row */}
      <div className="rounded-xl p-3 bg-primary/5 border border-primary/20">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Итого за период:</span>
          <div className="flex items-center gap-4">
            <span className="text-xs">{totalCleanings} уборок</span>
            <span className="font-bold">{totalPayments}€</span>
          </div>
        </div>
      </div>
    </div>
  );
}
