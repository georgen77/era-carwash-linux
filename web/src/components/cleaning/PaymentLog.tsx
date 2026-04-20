import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invoke } from "@/lib/invoke";

interface Assignment {
  id: string;
  apartment: string;
  cleaning_date: string;
  cleaner_name: string | null;
  status: string;
  payment_amount: number;
  payment_confirmed: boolean;
  payment_confirmed_at: string | null;
  registered_at: string;
  started_at: string | null;
  finished_at: string | null;
  schedule_id: string | null;
}

interface ScheduleInfo {
  id: string;
  checkin_date: string;
  checkout_date: string | null;
}

const APARTMENT_RU: Record<string, string> = {
  piral_1: "Оазис 1",
  piral_2: "Оазис 2",
  grande: "Гранде",
  salvador: "Сальвадор",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  requested: { label: "Заявка", color: "bg-blue-100 text-blue-700 border-blue-200" },
  confirmed: { label: "Подтверждено", color: "bg-green-100 text-green-700 border-green-200" },
  started: { label: "Убирает", color: "bg-purple-100 text-purple-700 border-purple-200" },
  done: { label: "Завершено", color: "bg-gray-100 text-gray-700 border-gray-200" },
  cancelled: { label: "Отменено", color: "bg-red-100 text-red-700 border-red-200" },
};

interface PaymentLogProps {
  currentUserId: string;
}

export default function PaymentLog({ currentUserId }: PaymentLogProps) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedules, setSchedules] = useState<Map<string, ScheduleInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filterCleaner, setFilterCleaner] = useState("all");
  const [filterApartment, setFilterApartment] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [assignRes, schedRes] = await Promise.all([
      supabase.from("cleaning_assignments").select("*").order("cleaning_date", { ascending: false }),
      supabase.from("cleaning_schedule").select("id, checkin_date, checkout_date"),
    ]);
    setAssignments((assignRes.data as Assignment[]) ?? []);
    const schedMap = new Map<string, ScheduleInfo>();
    (schedRes.data ?? []).forEach((s: any) => schedMap.set(s.id, s));
    setSchedules(schedMap);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const cleaners = [...new Set(assignments.map((a) => a.cleaner_name).filter(Boolean))] as string[];

  const filtered = assignments.filter((a) => {
    if (filterCleaner !== "all" && a.cleaner_name !== filterCleaner) return false;
    if (filterApartment !== "all" && a.apartment !== filterApartment) return false;
    if (filterPayment === "paid" && !a.payment_confirmed) return false;
    if (filterPayment === "unpaid" && a.payment_confirmed) return false;
    if (filterPayment === "done_unpaid" && !(a.status === "done" && !a.payment_confirmed)) return false;
    if (filterDateFrom && a.cleaning_date < filterDateFrom) return false;
    if (filterDateTo && a.cleaning_date > filterDateTo) return false;
    return true;
  });

  const totalAmount = filtered.reduce((s, a) => s + Number(a.payment_amount ?? 0), 0);
  const paidAmount = filtered.filter((a) => a.payment_confirmed).reduce((s, a) => s + Number(a.payment_amount ?? 0), 0);

  const handleConfirmPayment = async (assignment: Assignment) => {
    if (assignment.payment_confirmed) return;
    setConfirmingId(assignment.id);
    try {
      // 1. Update assignment as paid
      const { error: updErr } = await supabase
        .from("cleaning_assignments")
        .update({
          payment_confirmed: true,
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq("id", assignment.id);
      if (updErr) throw updErr;

      // 2. Create expense in Emma's cash
      const aptLabel = APARTMENT_RU[assignment.apartment] ?? assignment.apartment;
      const sched = assignment.schedule_id ? schedules.get(assignment.schedule_id) : null;
      let desc = `Оплата клининга: ${aptLabel}`;
      if (sched) {
        const fmtDate = (d: string) => {
          const p = d.split("-");
          return `${p[2]}.${p[1]}`;
        };
        desc += ` (${fmtDate(sched.checkin_date)}`;
        if (sched.checkout_date) desc += `–${fmtDate(sched.checkout_date)}`;
        desc += `)`;
      }

      await invoke("emma-cash", {
        body: {
          action: "add",
          userId: currentUserId,
          transactionData: {
            transaction_type: "expense",
            amount: Number(assignment.payment_amount ?? 35),
            description: desc,
            counterparty: assignment.cleaner_name || null,
            location: aptLabel,
            transaction_date: new Date().toISOString(),
          },
        },
      });

      toast({ title: `✅ Выплата ${assignment.payment_amount}€ подтверждена` });
      loadData();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  const exportCSV = () => {
    const headers = ["Дата,Апартамент,Заезд,Выезд,Уборщица,Сумма,Статус,Выплата подтверждена,Дата выплаты"];
    const rows = filtered.map((a) => {
      const sched = a.schedule_id ? schedules.get(a.schedule_id) : null;
      return [
        a.cleaning_date,
        APARTMENT_RU[a.apartment] ?? a.apartment,
        sched?.checkin_date ?? "—",
        sched?.checkout_date ?? "—",
        a.cleaner_name ?? "—",
        a.payment_amount,
        STATUS_LABELS[a.status]?.label ?? a.status,
        a.payment_confirmed ? "Да" : "Нет",
        a.payment_confirmed_at ? new Date(a.payment_confirmed_at).toLocaleDateString("ru-RU") : "—",
      ].join(",");
    });
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cleaning_payments_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 bg-white/40 border border-white/30 text-center">
          <div className="text-lg font-bold">{filtered.length}</div>
          <div className="text-xs text-muted-foreground">Всего смен</div>
        </div>
        <div className="rounded-xl p-3 bg-green-50/60 border border-green-200/40 text-center">
          <div className="text-lg font-bold text-green-700">{paidAmount}€</div>
          <div className="text-xs text-muted-foreground">Выплачено</div>
        </div>
        <div className="rounded-xl p-3 bg-amber-50/60 border border-amber-200/40 text-center">
          <div className="text-lg font-bold text-amber-700">{totalAmount - paidAmount}€</div>
          <div className="text-xs text-muted-foreground">К выплате</div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={filterCleaner} onValueChange={setFilterCleaner}>
            <SelectTrigger className="h-8 text-xs bg-white/60">
              <SelectValue placeholder="Уборщица" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все уборщицы</SelectItem>
              {cleaners.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterApartment} onValueChange={setFilterApartment}>
            <SelectTrigger className="h-8 text-xs bg-white/60">
              <SelectValue placeholder="Апартамент" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все апартаменты</SelectItem>
              <SelectItem value="piral_1">Оазис 1</SelectItem>
              <SelectItem value="piral_2">Оазис 2</SelectItem>
              <SelectItem value="grande">Гранде</SelectItem>
              <SelectItem value="salvador">Сальвадор</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="h-8 text-xs bg-white/60">
              <SelectValue placeholder="Выплата" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="paid">Выплачено</SelectItem>
              <SelectItem value="done_unpaid">Завершено, не выплачено</SelectItem>
              <SelectItem value="unpaid">Не выплачено</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-8 text-xs bg-white/60" placeholder="С" />
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-8 text-xs bg-white/60" placeholder="По" />
          </div>
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

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Нет данных</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const sched = a.schedule_id ? schedules.get(a.schedule_id) : null;
            const fmtDate = (d: string) => {
              const p = d.split("-");
              return `${p[2]}.${p[1]}`;
            };
            return (
              <div key={a.id} className="rounded-xl p-3 bg-white/50 border border-white/30 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        {new Date(a.cleaning_date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <span className="text-xs text-muted-foreground">{APARTMENT_RU[a.apartment] ?? a.apartment}</span>
                      {a.cleaner_name && (
                        <span className="text-xs font-medium">👤 {a.cleaner_name}</span>
                      )}
                    </div>
                    {/* Checkin/checkout dates */}
                    {sched && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        📅 {fmtDate(sched.checkin_date)}
                        {sched.checkout_date && ` – ${fmtDate(sched.checkout_date)}`}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABELS[a.status]?.color ?? ""}`}>
                        {STATUS_LABELS[a.status]?.label ?? a.status}
                      </span>
                      {a.payment_confirmed ? (
                        <span className="flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {a.payment_confirmed_at
                            ? new Date(a.payment_confirmed_at).toLocaleDateString("ru-RU")
                            : "Выдано"}
                        </span>
                      ) : a.status === "done" ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="h-3 w-3" />Ожидает выплаты
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className={`text-sm font-bold ${a.payment_confirmed ? "text-green-700" : "text-foreground"}`}>
                      {a.payment_amount}€
                    </div>
                    {/* Payment confirmation checkbox */}
                    {!a.payment_confirmed && a.status === "done" && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={false}
                          disabled={confirmingId === a.id}
                          onCheckedChange={() => handleConfirmPayment(a)}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {confirmingId === a.id ? "..." : "Выплачено"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
