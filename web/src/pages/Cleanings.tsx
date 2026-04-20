import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LogOut, Palette, Settings2, Package, Wallet, ClipboardList,
  CalendarDays, List, Plus, X, Download, BarChart2, AlertTriangle,
  ChevronLeft, ChevronRight, MessageSquare, RefreshCw, ScrollText
} from "lucide-react";
import ActivityLog from "@/components/cleaning/ActivityLog";
import HeaderNavGrid from "@/components/HeaderNavGrid";
import logo from "@/assets/logo.jpg";
import apt1 from "@/assets/apt1.jpg";
import apt2 from "@/assets/apt2.jpg";
import apt3 from "@/assets/apt3.jpg";
import apt4 from "@/assets/apt4.jpg";
import apt5 from "@/assets/apt5.jpg";
import apt6 from "@/assets/apt6.jpg";
import apt7 from "@/assets/apt7.jpg";
import apt8 from "@/assets/apt8.jpg";
import CityCarouselOverlay from "@/components/CityCarouselOverlay";
import WeatherWidget, { WeatherForecastModal } from "@/components/WeatherWidget";
import CitySettingsPanel from "@/components/CitySettingsPanel";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useCityTheme } from "@/context/CityThemeContext";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameMonth, isToday, parseISO, addDays, startOfWeek, endOfWeek,
  addMonths, differenceInDays, eachWeekOfInterval
} from "date-fns";
import { ru } from "date-fns/locale";
import { invoke } from "@/lib/invoke";

const SLIDES = [apt1, apt2, apt3, apt4, apt5, apt6, apt7, apt8];

const APARTMENT_RU: Record<string, string> = {
  piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор",
};
const APARTMENT_SHORT: Record<string, string> = {
  piral_1: "О1", piral_2: "О2", grande: "ГРА", salvador: "САЛ",
};
// badge bg colors (colored, with text)
const APARTMENT_BADGE_COLOR: Record<string, string> = {
  piral_1: "bg-blue-500 text-white",
  piral_2: "bg-violet-500 text-white",
  grande: "bg-amber-600 text-white",
  salvador: "bg-emerald-500 text-white",
};

const KNOWN_CLEANERS = ["Марьяна", "Ирина", "Ольга", "Ольга (мама Вики)", "Вика"];

interface CleaningUser { id: string; username: string; full_name: string; role: string; }
interface Assignment {
  id: string; apartment: string; cleaning_date: string; cleaner_name: string | null;
  cleaner_telegram_id?: string | null;
  status: string | null; started_at: string | null; finished_at: string | null;
  payment_amount: number | null; payment_confirmed: boolean | null;
  payment_confirmed_at: string | null; schedule_id: string | null;
  receipt_url: string | null; receipt_amount: number | null; receipt_store: string | null;
  next_guests: number | null; registered_at?: string | null;
}
interface Schedule {
  id: string; apartment: string; checkin_date: string; checkout_date: string | null;
  guests_count: string | null; notes: string | null; cleaning_date: string | null;
  next_guests: number | null; source: string | null;
}

// ─── Source Badge (A = Airbnb red, H = Holidu orange) ─────────────────────────
function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes("airbnb")) {
    return <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500 text-white leading-none" title="Airbnb">A</span>;
  }
  if (s.includes("holidu")) {
    return <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-amber-500 text-white leading-none" title="Holidu">H</span>;
  }
  return null;
}

// ─── Editable Guest Count ─────────────────────────────────────────────────────
function EditableGuestCount({ scheduleId, value, onUpdated }: {
  scheduleId: string; value: number | null; onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value ?? 4));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseInt(val) || 4;
    setSaving(true);
    await supabase.from("cleaning_schedule").update({ next_guests: num }).eq("id", scheduleId);
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input type="number" value={val} min={1} max={20}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-12 px-1 py-0.5 rounded border bg-background text-xs text-center"
          autoFocus
        />
        <button onClick={save} disabled={saving} className="text-[10px] text-primary font-medium">✓</button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground">✕</button>
      </span>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="underline decoration-dotted cursor-pointer hover:text-primary transition-colors" title="Нажмите для редактирования">
      {value ?? 4}
    </button>
  );
}

type PeriodFilter = "week" | "month" | "next_month" | "custom";

interface Filters {
  apartment: string;
  cleaner: string;
  status: string;
  period: PeriodFilter;
  customStart: string;
  customEnd: string;
}

function PhotoSlideshow() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % SLIDES.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative w-full h-full overflow-hidden">
      {SLIDES.map((src, i) => (
        <img key={i} src={src} alt=""
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-1000", i === current ? "opacity-100" : "opacity-0")} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
    </div>
  );
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "d MMM", { locale: ru }); } catch { return d; }
}
function fmtDateTime(d: string) {
  try { return format(parseISO(d), "d MMM HH:mm", { locale: ru }); } catch { return d; }
}

// ─── Sync iCal Button ───────────────────────────────────────────────────────
function SyncIcalButton({ onSynced }: { onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ added: number; removed: number; updated: number } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const { data, error } = await invoke("sync-ical", { method: "POST" });
      if (error) throw error;
      setResult({ added: data?.new ?? 0, removed: data?.deleted ?? 0, updated: data?.updated ?? 0 });
      onSynced();
    } catch (e: any) {
      console.error("Sync error:", e);
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <div className="relative">
      <button onClick={handleSync} disabled={syncing}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/40 text-sm text-primary hover:bg-primary/5 transition disabled:opacity-50">
        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
        {syncing ? "..." : "Синхр."}
      </button>
      {result && (
        <div className="absolute top-full mt-1 right-0 bg-card border rounded-lg px-3 py-1.5 text-xs shadow-lg whitespace-nowrap z-20">
          +{result.added} / ✏️{result.updated} / 🗑{result.removed}
        </div>
      )}
    </div>
  );
}

// ─── Smart Alerts ────────────────────────────────────────────────────────────
function SmartAlerts({ assignments, schedules }: { assignments: Assignment[]; schedules: Schedule[] }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const in3days = format(addDays(new Date(), 3), "yyyy-MM-dd");

  const alerts: { level: "red" | "yellow" | "blue"; text: string }[] = [];

  // Tomorrow checkouts without assignment
  for (const s of schedules) {
    const cd = s.cleaning_date ?? s.checkout_date;
    if (!cd) continue;
    if (cd === tomorrow) {
      const has = assignments.find(a => a.apartment === s.apartment && a.cleaning_date === cd && a.cleaner_name);
      if (!has) alerts.push({ level: "red", text: `Завтра выезд из ${APARTMENT_RU[s.apartment] ?? s.apartment} — уборщица не назначена!` });
    }
    if (cd > tomorrow && cd <= in3days) {
      const has = assignments.find(a => a.apartment === s.apartment && a.cleaning_date === cd);
      if (!has) alerts.push({ level: "yellow", text: `Через ${differenceInDays(parseISO(cd), new Date())} дн. заезд в ${APARTMENT_RU[s.apartment] ?? s.apartment} — подтверди уборщицу` });
    }
  }

  // Unpaid amounts
  const unpaid = assignments.filter(a => (a.status === "done" || a.finished_at) && !a.payment_confirmed);
  const unpaidTotal = unpaid.reduce((s, a) => s + (a.payment_amount ?? 35), 0);
  if (unpaidTotal > 0) {
    const cleanerSet = new Set(unpaid.map(a => a.cleaner_name).filter(Boolean));
    alerts.push({ level: "blue", text: `Эммочка должна выплатить ${unpaidTotal}€ (${cleanerSet.size} уборщ.)` });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={cn(
          "flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border",
          a.level === "red" && "bg-red-50 border-red-200 text-red-700",
          a.level === "yellow" && "bg-amber-50 border-amber-200 text-amber-700",
          a.level === "blue" && "bg-blue-50 border-blue-200 text-blue-700",
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Assign Cleaner Modal ─────────────────────────────────────────────────────
function AssignCleanerModal({ scheduleItem, date, apartment, onClose, onSuccess }: {
  scheduleItem?: Schedule; date: string; apartment: string;
  onClose: () => void; onSuccess: () => void;
}) {
  const [cleaner, setCleaner] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [existingAssignment, setExistingAssignment] = useState<{ id: string; cleaner_name: string | null } | null>(null);

  useEffect(() => {
    supabase.from("cleaning_assignments")
      .select("id, cleaner_name")
      .eq("apartment", apartment)
      .eq("cleaning_date", date)
      .neq("status", "cancelled")
      .maybeSingle()
      .then(({ data }) => { if (data) setExistingAssignment(data); });
  }, [apartment, date]);

  async function save() {
    if (!cleaner) return;
    setSaving(true);
    if (existingAssignment) {
      await supabase.from("cleaning_assignments").update({ cleaner_name: cleaner, status: "confirmed" }).eq("id", existingAssignment.id);
    } else {
      await supabase.from("cleaning_assignments").insert({
        apartment, cleaning_date: date, cleaner_name: cleaner,
        payment_amount: apartment === "grande" ? 70 : 35,
        status: "confirmed", confirmed_by: "manual", confirmed_at: new Date().toISOString(),
        schedule_id: scheduleItem?.id ?? null,
        next_guests: scheduleItem?.next_guests ?? null,
      });
    }
    try {
      const { data: cleanerData } = await supabase.from("cleaners").select("telegram_id").eq("name", cleaner).maybeSingle();
      if (cleanerData?.telegram_id) {
        await invoke("send-telegram", {
          body: {
            chat_id: cleanerData.telegram_id,
            message: `📅 Назначена уборка!\n🏠 ${APARTMENT_RU[apartment] ?? apartment}\n📆 ${fmtDate(date)}\n💰 ${apartment === "grande" ? 70 : 35}€`,
          }
        });
      }
    } catch {}
    setSaving(false);
    onSuccess();
  }

  async function removeCleaner() {
    if (!existingAssignment) return;
    if (!confirm(`Удалить уборщицу ${existingAssignment.cleaner_name} из этой смены?`)) return;
    setRemoving(true);
    await supabase.from("cleaning_assignments").delete().eq("id", existingAssignment.id);
    setRemoving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{existingAssignment ? "🔄 Заменить или удалить" : "✋ Назначить уборщицу"}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          🏠 {APARTMENT_RU[apartment] ?? apartment} · 📅 {fmtDate(date)}
        </p>
        {existingAssignment && (
          <p className="text-sm mb-3">
            Текущая уборщица: <strong>{existingAssignment.cleaner_name}</strong>
          </p>
        )}
        <select value={cleaner} onChange={e => setCleaner(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm mb-4">
          <option value="">— Выберите уборщицу —</option>
          {KNOWN_CLEANERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button onClick={save} disabled={saving || !cleaner} className="w-full mb-2">
          {saving ? "Сохранение..." : existingAssignment ? "Заменить уборщицу" : "Назначить"}
        </Button>
        {existingAssignment && (
          <Button variant="destructive" onClick={removeCleaner} disabled={removing} className="w-full">
            {removing ? "Удаление..." : "🗑 Удалить уборщицу из смены"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Improved Day Detail Sheet ────────────────────────────────────────────────
function DayDetailSheet({ date, assignments, schedules, onClose, onDataChange }: {
  date: Date; assignments: Assignment[]; schedules: Schedule[];
  onClose: () => void; onDataChange: () => void;
}) {
  const dateStr = format(date, "yyyy-MM-dd");
  const dayAssignments = assignments.filter(a => a.cleaning_date === dateStr);

  // Collect all apartments that have checkout / cleaning this day
  const checkoutSchedules = schedules.filter(s => {
    const cd = s.cleaning_date ?? s.checkout_date;
    return cd === dateStr;
  });
  const checkinSchedules = schedules.filter(s => s.checkin_date === dateStr && s.checkout_date !== dateStr);

  // All apartments touched today (union)
  const apartments = Array.from(new Set([
    ...checkoutSchedules.map(s => s.apartment),
    ...dayAssignments.map(a => a.apartment),
  ]));

  const [assigningFor, setAssigningFor] = useState<{ apartment: string; scheduleItem?: Schedule } | null>(null);

  const statusLabel: Record<string, string> = {
    pending: "⏳ Ожидает", confirmed: "✅ Подтверждено", started: "🧹 В процессе",
    done: "✅ Завершено", cancelled: "❌ Отменено", requested: "📩 Заявка",
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
        <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold">
              📅 {format(date, "d MMMM yyyy (EEE)", { locale: ru })}
            </h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-muted transition"><X className="h-5 w-5" /></button>
          </div>

          {apartments.length === 0 && checkinSchedules.length === 0 && (
            <p className="text-muted-foreground text-sm">Нет событий на этот день</p>
          )}

          {/* Checkout / Cleaning apartments */}
          {apartments.map((apt, idx) => {
            const sched = checkoutSchedules.find(s => s.apartment === apt);
            const asgn = dayAssignments.find(a => a.apartment === apt);
            return (
              <div key={apt} className={cn("mb-3 p-3 rounded-xl border bg-card/80", idx < apartments.length - 1 && "")}>
                <div className="flex items-center gap-2 font-semibold text-sm mb-2">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", APARTMENT_BADGE_COLOR[apt] ?? "bg-gray-400 text-white")}>
                    {APARTMENT_SHORT[apt] ?? apt}
                  </span>
                  <SourceBadge source={sched?.source} />
                  <span>🏠 {APARTMENT_RU[apt] ?? apt}</span>
                </div>

                {sched && (
                  <>
                    <div className="text-sm">🚪 Выезд гостей{sched.checkin_date && <span className="text-xs text-muted-foreground ml-1">· заехали {fmtDate(sched.checkin_date)}</span>}</div>
                    {sched.guests_count && <div className="text-sm">👥 Гостей сейчас: {sched.guests_count} чел.</div>}
                    {sched.next_guests != null && (
                      <div className="text-sm">
                        👥 Следующий заезд: <EditableGuestCount scheduleId={sched.id} value={sched.next_guests} onUpdated={onDataChange} /> чел.
                      </div>
                    )}
                  </>
                )}

                {asgn ? (
                  <>
                    <div className="text-sm mt-1">
                      👤 Уборщица: <strong>{asgn.cleaner_name}</strong>
                      {asgn.status === "done" || asgn.finished_at ? " ✅" : ""}
                    </div>
                    {asgn.started_at && <div className="text-sm">🧹 Начало: {fmtDateTime(asgn.started_at)}</div>}
                    {asgn.finished_at && <div className="text-sm">· Конец: {fmtDateTime(asgn.finished_at)}</div>}
                    <div className="text-sm">
                      💰 ЗП: {asgn.payment_amount ?? 35}€
                      {asgn.payment_confirmed && asgn.payment_confirmed_at
                        ? ` · Выдана ${fmtDateTime(asgn.payment_confirmed_at)}`
                        : " · Ожидает выплаты ⏳"}
                    </div>
                    {asgn.receipt_url && (
                      <div className="text-sm">
                        🧾 Хозрасходы: {asgn.receipt_amount}€
                        {asgn.receipt_store ? ` [${asgn.receipt_store}]` : ""}
                        <a href={asgn.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-primary underline text-xs">открыть</a>
                      </div>
                    )}
                    {asgn.next_guests && !sched?.next_guests && (
                      <div className="text-sm text-muted-foreground">👥 Следующий заезд: {asgn.next_guests} гостя</div>
                    )}
                    {statusLabel[asgn.status ?? ""] && (
                      <div className="text-xs text-muted-foreground mt-1">📊 {statusLabel[asgn.status ?? ""]}</div>
                    )}
                    {/* Replace or Remove cleaner button */}
                    {asgn.status !== "done" && asgn.status !== "paid" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setAssigningFor({ apartment: apt, scheduleItem: sched })}
                          className="flex-1 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition">
                          🔄 Заменить или удалить
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm text-destructive font-medium mt-1">🔴 Уборщица не назначена!</div>
                    <button
                      onClick={() => setAssigningFor({ apartment: apt, scheduleItem: sched })}
                      className="mt-2 w-full py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition">
                      ✋ Назначить уборщицу
                    </button>
                  </>
                )}

                {idx < apartments.length - 1 && <div className="mt-3 border-t border-dashed" />}
              </div>
            );
          })}

          {/* Checkin only days */}
          {checkinSchedules.map(s => (
            <div key={s.id} className="mb-3 p-3 rounded-xl border bg-blue-50/50">
              <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", APARTMENT_BADGE_COLOR[s.apartment] ?? "bg-gray-400 text-white")}>
                  {APARTMENT_SHORT[s.apartment] ?? s.apartment}
                </span>
                <SourceBadge source={s.source} />
                <span>🏠 {APARTMENT_RU[s.apartment] ?? s.apartment}</span>
              </div>
              <div className="text-sm text-blue-700">🔵 Заезд гостей</div>
              {s.guests_count && <div className="text-sm">👥 Гостей: <EditableGuestCount scheduleId={s.id} value={parseInt(s.guests_count) || null} onUpdated={onDataChange} /> чел.</div>}
            </div>
          ))}
        </div>
      </div>

      {assigningFor && (
        <AssignCleanerModal
          apartment={assigningFor.apartment}
          date={dateStr}
          scheduleItem={assigningFor.scheduleItem}
          onClose={() => setAssigningFor(null)}
          onSuccess={() => { setAssigningFor(null); onClose(); onDataChange(); }}
        />
      )}
    </>
  );
}

// ─── Filters Bar ─────────────────────────────────────────────────────────────
function FiltersBar({ filters, onChange, allCleaners }: {
  filters: Filters; onChange: (f: Filters) => void; allCleaners: string[];
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-2 min-w-max">
        {/* Apartment */}
        <select value={filters.apartment} onChange={e => onChange({ ...filters, apartment: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0">
          <option value="">Все апарты ▼</option>
          {Object.entries(APARTMENT_RU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {/* Cleaner */}
        <select value={filters.cleaner} onChange={e => onChange({ ...filters, cleaner: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0">
          <option value="">Все уборщицы ▼</option>
          {KNOWN_CLEANERS.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__unassigned__">Не назначена</option>
          {allCleaners.filter(c => !KNOWN_CLEANERS.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0">
          <option value="">Все статусы ▼</option>
          <option value="done">Выполнено</option>
          <option value="confirmed">Назначено</option>
          <option value="unassigned">Не назначено</option>
          <option value="started">В процессе</option>
        </select>

        {/* Period */}
        <select value={filters.period} onChange={e => onChange({ ...filters, period: e.target.value as PeriodFilter })}
          className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0">
          <option value="month">Этот месяц</option>
          <option value="week">Эта неделя</option>
          <option value="next_month">Следующий месяц</option>
          <option value="custom">Свой период</option>
        </select>

        {filters.period === "custom" && (
          <>
            <input type="date" value={filters.customStart}
              onChange={e => onChange({ ...filters, customStart: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0" />
            <input type="date" value={filters.customEnd}
              onChange={e => onChange({ ...filters, customEnd: e.target.value })}
              className="text-xs px-2 py-1.5 rounded-lg border bg-background shrink-0" />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ assignments, schedules, onDataChange }: {
  assignments: Assignment[]; schedules: Schedule[]; onDataChange: () => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calView, setCalView] = useState<"month" | "week">("month");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filters, setFilters] = useState<Filters>({
    apartment: "", cleaner: "", status: "", period: "month",
    customStart: format(new Date(), "yyyy-MM-dd"),
    customEnd: format(addDays(new Date(), 30), "yyyy-MM-dd"),
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = calView === "month"
    ? eachDayOfInterval({ start: monthStart, end: monthEnd })
    : eachDayOfInterval({ start: currentWeekStart, end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }) });

  const startPad = calView === "month" ? (getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1) : 0;

  // Filter assignments/schedules by current period
  function isInPeriod(dateStr: string): boolean {
    if (filters.period === "week") {
      const ws = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const we = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      return dateStr >= ws && dateStr <= we;
    }
    if (filters.period === "month") {
      const ms = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const me = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      return dateStr >= ms && dateStr <= me;
    }
    if (filters.period === "next_month") {
      const nm = addMonths(currentMonth, 1);
      const ms = format(startOfMonth(nm), "yyyy-MM-dd");
      const me = format(endOfMonth(nm), "yyyy-MM-dd");
      return dateStr >= ms && dateStr <= me;
    }
    if (filters.period === "custom") {
      return dateStr >= filters.customStart && dateStr <= filters.customEnd;
    }
    return true;
  }

  type DayStatusItem = { apt: string; badgeColor: string; dotColor: string; label: string };

  function getDayStatus(date: Date): DayStatusItem[] {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayAssignments = assignments.filter(a => {
      if (a.cleaning_date !== dateStr) return false;
      if (filters.apartment && a.apartment !== filters.apartment) return false;
      if (filters.cleaner === "__unassigned__" && a.cleaner_name) return false;
      if (filters.cleaner && filters.cleaner !== "__unassigned__" && a.cleaner_name !== filters.cleaner) return false;
      return true;
    });
    const daySchedules = schedules.filter(s => {
      const cd = s.cleaning_date ?? s.checkout_date;
      if (cd !== dateStr) return false;
      if (filters.apartment && s.apartment !== filters.apartment) return false;
      return true;
    });
    const checkins = schedules.filter(s => s.checkin_date === dateStr && s.checkout_date !== dateStr && (!filters.apartment || s.apartment === filters.apartment));

    const result: DayStatusItem[] = [];
    const processed = new Set<string>();

    for (const s of daySchedules) {
      processed.add(s.apartment);
      const asgn = dayAssignments.find(a => a.apartment === s.apartment);
      if (asgn) {
        if (filters.status && filters.status !== "unassigned") {
          if (filters.status === "done" && !asgn.payment_confirmed && asgn.status !== "done") continue;
          if (filters.status === "confirmed" && asgn.status !== "confirmed") continue;
          if (filters.status === "started" && asgn.status !== "started") continue;
        }
        const isFuture = dateStr > format(new Date(), "yyyy-MM-dd");
        const isCompleted = !isFuture && (asgn.payment_confirmed || asgn.status === "done" || asgn.finished_at);
        const dotColor = isCompleted
          ? "bg-green-500"
          : (asgn.status === "started" ? "bg-amber-500" : "bg-orange-400");
        const badgeColor = isCompleted
          ? "bg-green-500 text-white"
          : asgn.status === "started"
            ? "bg-amber-500 text-white"
            : "bg-orange-400 text-white";
        result.push({ apt: s.apartment, badgeColor, dotColor, label: APARTMENT_SHORT[s.apartment] ?? s.apartment });
      } else {
        if (filters.status && filters.status !== "unassigned") continue;
        result.push({ apt: s.apartment, badgeColor: "bg-red-500 text-white", dotColor: "bg-red-500", label: APARTMENT_SHORT[s.apartment] ?? s.apartment });
      }
    }

    for (const a of dayAssignments) {
      if (processed.has(a.apartment)) continue;
      processed.add(a.apartment);
      const isFuture = dateStr > format(new Date(), "yyyy-MM-dd");
      const isCompleted = !isFuture && (a.payment_confirmed || a.status === "done" || a.finished_at);
      const dotColor = isCompleted ? "bg-green-500" : a.status === "started" ? "bg-amber-500" : "bg-orange-400";
      const badgeColor = isCompleted ? "bg-green-500 text-white" : a.status === "started" ? "bg-amber-500 text-white" : "bg-orange-400 text-white";
      result.push({ apt: a.apartment, badgeColor, dotColor, label: APARTMENT_SHORT[a.apartment] ?? a.apartment });
    }

    for (const s of checkins) {
      if (processed.has(s.apartment)) continue;
      if (filters.status && filters.status !== "confirmed") continue;
      result.push({ apt: s.apartment, badgeColor: "bg-sky-400 text-white", dotColor: "bg-sky-400", label: APARTMENT_SHORT[s.apartment] ?? s.apartment });
    }

    return result;
  }

  const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  // Cleaner abbreviation (first name only)
  function cleanerAbbr(name: string | null): string {
    if (!name) return "";
    return name.split(" ")[0].slice(0, 6);
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <FiltersBar filters={filters} onChange={setFilters} allCleaners={
        Array.from(new Set(assignments.map(a => a.cleaner_name).filter(Boolean) as string[]))
      } />

      {/* View toggle + nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-lg border overflow-hidden text-xs">
          <button
            onClick={() => setCalView("month")}
            className={cn("px-3 py-1.5 transition", calView === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            Месяц
          </button>
          <button
            onClick={() => setCalView("week")}
            className={cn("px-3 py-1.5 transition", calView === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            Неделя
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (calView === "month") setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
              else setCurrentWeekStart(d => addDays(d, -7));
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-sm capitalize min-w-[140px] text-center">
            {calView === "month"
              ? format(currentMonth, "LLLL yyyy", { locale: ru })
              : `${format(currentWeekStart, "d MMM", { locale: ru })} – ${format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "d MMM", { locale: ru })}`
            }
          </span>
          <button
            onClick={() => {
              if (calView === "month") setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
              else setCurrentWeekStart(d => addDays(d, 7));
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calView === "month" && Array(startPad).fill(null).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const statuses = getDayStatus(day);
          const isCurrentDay = isToday(day);
          const inMonth = calView === "week" || isSameMonth(day, currentMonth);
          // Get cleaner names for this day
          const dateStr = format(day, "yyyy-MM-dd");
          const dayCleaners = assignments
            .filter(a => a.cleaning_date === dateStr && a.cleaner_name)
            .map(a => cleanerAbbr(a.cleaner_name));
          const minH = calView === "week" ? "min-h-[80px]" : "min-h-[52px]";
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "relative flex flex-col items-center justify-start rounded-lg py-1 px-0.5 transition-all bg-card/60",
                minH,
                inMonth ? "hover:bg-muted" : "opacity-25",
                isCurrentDay && "ring-2 ring-primary bg-primary/5",
              )}
            >
              <span className={cn("text-[11px] font-medium mb-0.5 leading-tight", isCurrentDay && "text-primary font-bold")}>
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-0.5 w-full px-0.5">
                {statuses.slice(0, calView === "week" ? 4 : 3).map((s, i) => {
                  const assignedCleaner = assignments.find(a => a.cleaning_date === dateStr && a.apartment === s.apt && a.cleaner_name);
                  const label = calView === "week" && assignedCleaner
                    ? `${s.label} ${cleanerAbbr(assignedCleaner.cleaner_name)}`
                    : s.label;
                  return (
                    <span key={i} className={cn(
                      "text-[9px] font-bold rounded px-1 leading-tight text-center truncate",
                      s.badgeColor
                    )}>
                      {label}
                    </span>
                  );
                })}
                {statuses.length > (calView === "week" ? 4 : 3) && (
                  <span className="text-[9px] text-muted-foreground text-center">+{statuses.length - (calView === "week" ? 4 : 3)}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" /> Выполнено + ЗП</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> В процессе</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-400 inline-block" /> Назначено</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> Без уборщицы</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-400 inline-block" /> Заезд</span>
      </div>

      {selectedDay && (
        <DayDetailSheet
          date={selectedDay}
          assignments={assignments}
          schedules={schedules}
          onClose={() => setSelectedDay(null)}
          onDataChange={onDataChange}
        />
      )}
    </div>
  );
}

// ─── List Tab ─────────────────────────────────────────────────────────────────
function ListTab({ assignments, schedules, onDataChange }: {
  assignments: Assignment[]; schedules: Schedule[]; onDataChange: () => void;
}) {
  const [filterApt, setFilterApt] = useState("");
  const [assigningFor, setAssigningFor] = useState<{ apartment: string; date: string; scheduleItem?: Schedule } | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const in30 = format(addDays(new Date(), 30), "yyyy-MM-dd");

  // Show all upcoming schedule items for next 30 days
  const upcomingSchedule = schedules
    .filter(s => {
      const cd = s.cleaning_date ?? s.checkout_date;
      if (!cd || cd < today || cd > in30) return false;
      if (filterApt && s.apartment !== filterApt) return false;
      return true;
    })
    .sort((a, b) => {
      const aDate = a.checkout_date ?? a.cleaning_date ?? "";
      const bDate = b.checkout_date ?? b.cleaning_date ?? "";
      return aDate.localeCompare(bDate);
    });

  function getAssignment(s: Schedule) {
    const cd = s.cleaning_date ?? s.checkout_date;
    return assignments.find(a =>
      a.apartment === s.apartment &&
      a.cleaning_date === cd &&
      a.status !== "cancelled"
    );
  }

  function exportCSV() {
    const header = ["Дата", "Апартамент", "Гостей", "Уборщица"];
    const rows = upcomingSchedule.map(s => {
      const asgn = getAssignment(s);
      return [
        s.checkout_date ?? s.cleaning_date ?? "",
        APARTMENT_RU[s.apartment] ?? s.apartment,
        String(s.next_guests ?? s.guests_count ?? "—"),
        asgn?.cleaner_name ?? "нет",
      ];
    });
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "schedule.csv"; a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={filterApt} onChange={e => setFilterApt(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border bg-background">
          <option value="">Все апарт.</option>
          {Object.entries(APARTMENT_RU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={exportCSV}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border hover:bg-muted transition ml-auto">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {upcomingSchedule.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Нет событий на ближайшие 30 дней</p>
      )}

      {upcomingSchedule.map(s => {
        const asgn = getAssignment(s);
        const cd = s.checkout_date ?? s.cleaning_date ?? "";
        return (
          <div key={s.id} className="w-full text-left p-3 rounded-xl border bg-card/80 transition-all">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", APARTMENT_BADGE_COLOR[s.apartment] ?? "bg-gray-400 text-white")}>
                  {APARTMENT_SHORT[s.apartment] ?? s.apartment}
                </span>
                <SourceBadge source={s.source} />
                <span className="font-medium text-sm">{fmtDate(cd)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                👥 <EditableGuestCount scheduleId={s.id} value={s.next_guests ?? (parseInt(s.guests_count ?? "") || null)} onUpdated={onDataChange} /> гостей
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {asgn?.cleaner_name ? (
                <span className="text-foreground font-medium">👤 {asgn.cleaner_name}</span>
              ) : (
                <span className="text-destructive font-medium">— нет уборщицы —</span>
              )}
            </div>
            {!asgn?.cleaner_name && (
              <button onClick={() => setAssigningFor({ apartment: s.apartment, date: cd, scheduleItem: s })}
                className="mt-1.5 text-xs text-primary border border-primary/40 rounded px-2 py-0.5 hover:bg-primary/5 transition">
                ✋ Назначить
              </button>
            )}
          </div>
        );
      })}

      {assigningFor && (
        <AssignCleanerModal
          apartment={assigningFor.apartment}
          date={assigningFor.date}
          scheduleItem={assigningFor.scheduleItem}
          onClose={() => setAssigningFor(null)}
          onSuccess={() => { setAssigningFor(null); onDataChange(); }}
        />
      )}
    </div>
  );
}

// ─── Statistics Tab ───────────────────────────────────────────────────────────
function StatsTab({ assignments, schedules }: { assignments: Assignment[]; schedules: Schedule[] }) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const daysInMonth = differenceInDays(endOfMonth(now), startOfMonth(now)) + 1;

  const thisMonth = assignments.filter(a => a.cleaning_date >= monthStart && a.cleaning_date <= monthEnd);

  // Per cleaner stats
  const cleanerStats = KNOWN_CLEANERS.map(name => {
    const their = thisMonth.filter(a => a.cleaner_name === name);
    const totalEarned = their.reduce((s, a) => s + (a.payment_amount ?? 35), 0);
    const times = their.filter(a => a.started_at && a.finished_at).map(a => {
      const start = new Date(a.started_at!).getTime();
      const end = new Date(a.finished_at!).getTime();
      return (end - start) / 3600000;
    });
    const avgTime = times.length > 0 ? (times.reduce((s, t) => s + t, 0) / times.length) : null;
    return { name, count: their.length, earned: totalEarned, avgTime };
  }).filter(s => s.count > 0);

  // Per apartment stats
  const apartmentStats = Object.entries(APARTMENT_RU).map(([key, name]) => {
    const monthSchedules = schedules.filter(s => {
      const cd = s.cleaning_date ?? s.checkout_date;
      return s.apartment === key && cd && cd >= monthStart && cd <= monthEnd;
    });
    const bookings = schedules.filter(s => s.apartment === key && s.checkin_date >= monthStart && s.checkin_date <= monthEnd);
    const bookedDays = bookings.reduce((sum, s) => {
      if (!s.checkin_date || !s.checkout_date) return sum;
      return sum + Math.max(0, differenceInDays(parseISO(s.checkout_date), parseISO(s.checkin_date)));
    }, 0);
    const occupancy = Math.min(100, Math.round((bookedDays / daysInMonth) * 100));
    return { key, name, cleanings: monthSchedules.length, occupancy };
  });

  // Outstanding payments
  const unpaid = assignments.filter(a => (a.status === "done" || a.finished_at) && !a.payment_confirmed);
  const unpaidByCleanerMap = new Map<string, { amount: number; details: string[] }>();
  for (const a of unpaid) {
    const key = a.cleaner_name ?? "Не назначено";
    const existing = unpaidByCleanerMap.get(key) ?? { amount: 0, details: [] };
    existing.amount += a.payment_amount ?? 35;
    existing.details.push(`${a.payment_amount ?? 35}€ (${fmtDate(a.cleaning_date)} ${APARTMENT_RU[a.apartment] ?? a.apartment})`);
    unpaidByCleanerMap.set(key, existing);
  }
  const unpaidTotal = unpaid.reduce((s, a) => s + (a.payment_amount ?? 35), 0);

  return (
    <div className="space-y-5">
      {/* Per cleaner */}
      <div>
        <h3 className="text-sm font-bold mb-2">👤 Уборщицы — {format(now, "LLLL yyyy", { locale: ru })}</h3>
        {cleanerStats.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет данных за этот месяц</p>
        ) : (
          <div className="space-y-2">
            {cleanerStats.sort((a, b) => b.count - a.count).map(s => (
              <div key={s.name} className="flex items-center justify-between p-2.5 rounded-xl border bg-card/80 text-sm">
                <span className="font-medium">{s.name}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.count} уб.</span>
                  <span className="text-green-600 font-semibold">{s.earned}€</span>
                  {s.avgTime !== null && <span>ср. {s.avgTime.toFixed(1)}ч</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per apartment */}
      <div>
        <h3 className="text-sm font-bold mb-2">🏠 Апартаменты — загрузка</h3>
        <div className="space-y-2">
          {apartmentStats.map(s => (
            <div key={s.key} className="p-2.5 rounded-xl border bg-card/80">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", APARTMENT_BADGE_COLOR[s.key] ?? "bg-gray-400 text-white")}>
                    {APARTMENT_SHORT[s.key]}
                  </span>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.cleanings} уборок</span>
                  <span className="font-semibold text-foreground">{s.occupancy}% загр.</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${s.occupancy}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Outstanding payments */}
      {unpaidTotal > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-2">💰 Долги Эммочки</h3>
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50">
            {Array.from(unpaidByCleanerMap.entries()).map(([name, data]) => (
              <div key={name} className="mb-2 last:mb-0">
                <div className="flex justify-between text-sm font-medium">
                  <span>{name}</span>
                  <span className="text-amber-700">{data.amount}€</span>
                </div>
                {data.details.map((d, i) => (
                  <div key={i} className="text-xs text-muted-foreground ml-2">{d}</div>
                ))}
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between text-sm font-bold">
              <span>Итого</span>
              <span className="text-amber-700">{unpaidTotal}€</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CleaningsPage() {
  const navigate = useNavigate();
  const { activeCity, activeTheme, setWeatherOpen, weatherOpen, settingsOpen, setSettingsOpen, themeSwitcherOpen, setThemeSwitcherOpen } = useCityTheme();
  const [currentUser, setCurrentUser] = useState<CleaningUser | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignedModal, setShowAssignedModal] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleHeaderTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx > 0) navigate('/tasks');
      else navigate('/');
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [navigate]);

  useEffect(() => {
    const userStr = sessionStorage.getItem('cleaning_user');
    const authenticated = sessionStorage.getItem('cleaning_authenticated');
    if (!authenticated || !userStr) { navigate('/cleaning-auth'); return; }
    setCurrentUser(JSON.parse(userStr));
    loadData();
  }, [navigate]);

  async function loadData() {
    setLoading(true);
    const [{ data: asgn }, { data: sched }] = await Promise.all([
      supabase.from("cleaning_assignments").select("*").order("cleaning_date", { ascending: false }),
      supabase.from("cleaning_schedule").select("*").order("checkin_date", { ascending: true }),
    ]);
    setAssignments((asgn ?? []) as Assignment[]);
    setSchedules((sched ?? []) as Schedule[]);
    setLoading(false);
  }

  const handleLogout = () => {
    sessionStorage.removeItem('cleaning_user');
    sessionStorage.removeItem('cleaning_authenticated');
    navigate('/cleaning-auth');
  };

  if (!currentUser) return null;

  const today = format(new Date(), "yyyy-MM-dd");

  // Summary stats
  const unassigned = schedules.filter(s => {
    const cd = s.cleaning_date ?? s.checkout_date;
    if (!cd || cd < today) return false;
    return !assignments.find(a => a.apartment === s.apartment && a.cleaning_date === cd && a.cleaner_name);
  });

  // Assigned future cleanings
  const assignedFuture = assignments.filter(a =>
    a.cleaning_date >= today && a.cleaner_name && a.status !== "cancelled"
  );

  // Currently occupied apartments (checkin <= today < checkout)
  const activeBookings = schedules.filter(s =>
    s.checkin_date <= today && (!s.checkout_date || s.checkout_date > today)
  );
  // For each, find who will clean after checkout
  function getNextCleaner(apt: string, checkout: string | null) {
    if (!checkout) return null;
    return assignments.find(a => a.apartment === apt && a.cleaning_date === checkout && a.cleaner_name)?.cleaner_name ?? null;
  }

  return (
    <div className="min-h-screen relative">
      <CityCarouselOverlay />
      {!activeCity && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{
          background: activeTheme === "light"
            ? "linear-gradient(180deg, hsl(210 20% 98%), hsl(200 30% 96%))"
            : "linear-gradient(180deg, hsl(215 28% 10%), hsl(220 25% 13%))"
        }} />
      )}

      <div className="relative z-10">
        <WeatherForecastModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />
        {settingsOpen && <CitySettingsPanel onClose={() => setSettingsOpen(false)} />}
        {themeSwitcherOpen && <ThemeSwitcher onClose={() => setThemeSwitcherOpen(false)} />}

        {/* HERO */}
        <div className="relative w-full" style={{ height: "260px" }}
          onTouchStart={handleHeaderTouchStart}
          onTouchEnd={handleHeaderTouchEnd}>
          <PhotoSlideshow />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/60" />
          <div className="absolute top-0 left-0 right-0 px-4 pt-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={logo} alt="ERA Logo" className="h-10 object-contain drop-shadow-lg" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow-md tracking-tight">🧹 Уборки</h1>
                <p className="text-white/70 text-xs">{currentUser.full_name}</p>
                <WeatherWidget onOpenForecast={() => setWeatherOpen(true)} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Logout removed */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => setThemeSwitcherOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm">
                  <Palette className="h-3 w-3" />
                </button>
                <button onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm">
                  <Settings2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <HeaderNavGrid activePage={3} />
        </div>

        {/* Content */}
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">

          {/* Smart Alerts */}
          {!loading && <SmartAlerts assignments={assignments} schedules={schedules} />}

          {/* Summary cards — 2 cols + 1 wide */}
          <div className="grid grid-cols-2 gap-2">
            {/* Без уборщицы */}
            <div className="rounded-xl border bg-card/80 backdrop-blur-sm p-2.5 flex flex-col items-center justify-center gap-0.5">
              <span className="text-base">🔴</span>
              <span className="text-xl font-bold leading-tight text-destructive">{unassigned.length}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Без уборщ.</span>
            </div>

            {/* Уборки распределены */}
            <button
              onClick={() => setShowAssignedModal(true)}
              className="rounded-xl border bg-card/80 backdrop-blur-sm p-2.5 flex flex-col items-center justify-center gap-0.5 hover:bg-muted/50 transition-all text-left w-full"
            >
              <span className="text-base">✅</span>
              <span className="text-xl font-bold leading-tight text-green-600">{assignedFuture.length}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">Уборки распред.</span>
            </button>
          </div>

          {/* Сейчас занят tile — full width */}
          <div className="rounded-xl border bg-card/80 backdrop-blur-sm p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <span>🏠</span> Сейчас занят
            </div>
            {activeBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет активных заездов</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {activeBookings.map(s => {
                  const nextCleaner = getNextCleaner(s.apartment, s.checkout_date);
                  const guestCount = (parseInt(s.guests_count ?? "0") || 0) || (s.next_guests ?? 0);
                  return (
                    <div key={s.id} className="rounded-lg border bg-background/60 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", APARTMENT_BADGE_COLOR[s.apartment] ?? "bg-muted text-foreground")}>
                          {APARTMENT_SHORT[s.apartment] ?? s.apartment}
                        </span>
                        <SourceBadge source={s.source} />
                        <span className="text-xs font-medium">{APARTMENT_RU[s.apartment] ?? s.apartment}</span>
                      </div>
                      {guestCount > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          👥 {guestCount} {guestCount === 1 ? "гость" : (guestCount < 5 ? "гостя" : "гостей")}
                        </div>
                      )}
                      {s.checkout_date && (
                        <div className="text-[10px] text-muted-foreground">
                          🚪 {format(parseISO(s.checkout_date), "d MMM", { locale: ru })}
                          {nextCleaner && <span className="ml-1">· 🧹 {nextCleaner.split(" ")[0]}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setShowAddModal(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition">
              <Plus className="h-4 w-4" /> Добавить
            </button>
            <SyncIcalButton onSynced={loadData} />
          </div>

          {/* Tabs */}
          <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
            <Tabs defaultValue="calendar" className="p-4">
              <TabsList className="grid grid-cols-4 w-full mb-4">
                <TabsTrigger value="calendar" className="text-xs">
                  <CalendarDays className="h-3.5 w-3.5 mr-1" /> Календарь
                </TabsTrigger>
                <TabsTrigger value="list" className="text-xs">
                  <List className="h-3.5 w-3.5 mr-1" /> Список
                </TabsTrigger>
                <TabsTrigger value="stats" className="text-xs">
                  <BarChart2 className="h-3.5 w-3.5 mr-1" /> Стат.
                </TabsTrigger>
                <TabsTrigger value="log" className="text-xs">
                  <ScrollText className="h-3.5 w-3.5 mr-1" /> Лог
                </TabsTrigger>
              </TabsList>
              <TabsContent value="calendar">
                {loading ? <p className="text-sm text-muted-foreground text-center py-4">Загрузка...</p> :
                  <CalendarTab assignments={assignments} schedules={schedules} onDataChange={loadData} />}
              </TabsContent>
              <TabsContent value="list">
                {loading ? <p className="text-sm text-muted-foreground text-center py-4">Загрузка...</p> :
                  <ListTab assignments={assignments} schedules={schedules} onDataChange={loadData} />}
              </TabsContent>
              <TabsContent value="stats">
                {loading ? <p className="text-sm text-muted-foreground text-center py-4">Загрузка...</p> :
                  <StatsTab assignments={assignments} schedules={schedules} />}
              </TabsContent>
              <TabsContent value="log">
                <ActivityLog />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddAssignmentModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData(); }}
          currentUserId={currentUser.id}
        />
      )}

      {showAssignedModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowAssignedModal(false)}>
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">✅ Уборки распределены</h3>
              <button onClick={() => setShowAssignedModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {assignedFuture.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет назначенных уборок</p>
            ) : (
              <div className="space-y-2">
                {assignedFuture.sort((a, b) => a.cleaning_date.localeCompare(b.cleaning_date)).map(a => (
                  <div key={a.id} className="rounded-lg border bg-background/60 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", APARTMENT_BADGE_COLOR[a.apartment] ?? "bg-muted text-foreground")}>
                        {APARTMENT_SHORT[a.apartment] ?? a.apartment}
                      </span>
                      <SourceBadge source={schedules.find(sc => sc.apartment === a.apartment && (sc.cleaning_date === a.cleaning_date || sc.checkout_date === a.cleaning_date))?.source} />
                      <span className="text-sm font-medium">{APARTMENT_RU[a.apartment] ?? a.apartment}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{fmtDate(a.cleaning_date)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">👤 {a.cleaner_name}</div>
                    {a.registered_at && (
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Записалась {fmtDateTime(a.registered_at)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Assignment Modal ─────────────────────────────────────────────────────
function AddAssignmentModal({ onClose, onSuccess, currentUserId, initialDate, initialApartment }: {
  onClose: () => void; onSuccess: () => void; currentUserId: string;
  initialDate?: string; initialApartment?: string;
}) {
  const [apartment, setApartment] = useState(initialApartment ?? "piral_1");
  const [checkinDate, setCheckinDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [checkoutDate, setCheckoutDate] = useState(format(addDays(new Date(), 3), "yyyy-MM-dd"));
  const [cleaner, setCleaner] = useState("");
  const [nextGuests, setNextGuests] = useState("4");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [cleanersDB, setCleanersDB] = useState<{ id: string; name: string; telegram_id: string | null }[]>([]);

  useEffect(() => {
    supabase.from("cleaners").select("id,name,telegram_id").order("name").then(({ data }) => {
      if (data) setCleanersDB(data);
    });
  }, []);

  const amount = apartment === "grande" ? 70 : 35;

  async function save() {
    setSaving(true);
    try {
      // 1. Create cleaning_schedule entry
      const { data: scheduleRow, error: schedErr } = await supabase.from("cleaning_schedule").insert({
        apartment,
        checkin_date: checkinDate,
        checkout_date: checkoutDate,
        cleaning_date: checkoutDate,
        next_guests: parseInt(nextGuests) || 4,
        guests_count: nextGuests,
        notes: comment || null,
        source: "manual",
      }).select().single();

      if (schedErr) {
        console.error("Error creating schedule:", schedErr);
        setSaving(false);
        return;
      }

      // 2. Create assignment if cleaner selected
      if (cleaner) {
        await supabase.from("cleaning_assignments").insert({
          apartment, cleaning_date: checkoutDate,
          cleaner_name: cleaner,
          payment_amount: amount,
          status: "confirmed",
          confirmed_by: "manual",
          confirmed_at: new Date().toISOString(),
          next_guests: parseInt(nextGuests) || 4,
          registered_at: new Date().toISOString(),
          schedule_id: scheduleRow?.id ?? null,
        });
      }

      // 3. Trigger notify_new_booking for all cleaners + admins
      try {
        await invoke("bot-api", {
          body: {
            action: "notify_new_booking",
            schedule_id: scheduleRow?.id,
            apartment,
            checkin_date: checkinDate,
            checkout_date: checkoutDate,
            next_guests: parseInt(nextGuests) || 4,
          },
        });
      } catch (e) {
        console.error("Notify error:", e);
      }

      // 4. If cleaner assigned, also notify about assignment
      if (cleaner) {
        const cleanerData = cleanersDB.find(c => c.name === cleaner);
        if (cleanerData?.telegram_id) {
          try {
            await invoke("send-telegram", {
              body: {
                chat_id: cleanerData.telegram_id,
                message: `📅 Добрый день, ${cleaner.split(" ")[0]}! Вам назначена уборка:\n🏠 ${APARTMENT_RU[apartment] ?? apartment}\n📆 Заезд: ${fmtDate(checkinDate)}\n📆 Выезд: ${fmtDate(checkoutDate)}\n💰 ${amount}€${comment ? `\n💬 ${comment}` : ""}`,
              }
            });
          } catch {}
        }
      }
    } finally {
      setSaving(false);
      onSuccess();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">➕ Добавить бронирование</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Апартамент</label>
            <select value={apartment} onChange={e => setApartment(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="piral_1">Оазис 1</option>
              <option value="piral_2">Оазис 2</option>
              <option value="grande">Гранде</option>
              <option value="salvador">Сальвадор</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Дата заезда</label>
            <input type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Дата выезда</label>
            <input type="date" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Кол-во гостей</label>
            <input type="number" value={nextGuests} min={1} max={20} onChange={e => setNextGuests(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Уборщица (необязательно)</label>
            <select value={cleaner} onChange={e => setCleaner(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="">— Не назначено —</option>
              {cleanersDB.map(c => <option key={c.id} value={c.name}>{c.name}{c.telegram_id ? " 📱" : ""}</option>)}
              {KNOWN_CLEANERS.filter(k => !cleanersDB.find(c => c.name === k)).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Комментарий (необязательно)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              rows={2}
              placeholder="Доп. информация..."
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm resize-none" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Сумма к выплате: <strong className="text-foreground">{amount}€</strong></span>
            {cleaner && <span className="text-primary">📱 Уведомление будет отправлено</span>}
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Сохранение..." : "Добавить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
