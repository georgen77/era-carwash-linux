import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp, TrendingDown, Filter, X, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

interface Transaction {
  id: string;
  transaction_type: "income" | "expense";
  amount: number;
  description: string;
  counterparty: string | null;
  location?: string | null;
  transaction_date: string;
  balance?: number;
}

export default function EmmaCashReports({ currentUserId }: { currentUserId: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [filterCell, setFilterCell] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showDateFilter, setShowDateFilter] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const { data } = await invoke("emma-cash", {
        body: { action: "list", userId: currentUserId },
      });
      if (data?.transactions) setTransactions(data.transactions);
      setIsLoading(false);
    };
    fetch();
  }, [currentUserId]);

  // compute running balance
  const withBalance = [...transactions].reverse().reduce<(Transaction & { balance: number })[]>(
    (acc, tx) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const balance = tx.transaction_type === "income" ? prev + Number(tx.amount) : prev - Number(tx.amount);
      return [...acc, { ...tx, balance }];
    }, []
  ).reverse();

  const totalIncome = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const totalBalance = totalIncome - totalExpense;

  // Apply filters
  const activeFilter = filterCell || filterText;
  const filtered = withBalance.filter(tx => {
    if (dateFrom && new Date(tx.transaction_date) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59);
      if (new Date(tx.transaction_date) > end) return false;
    }
    if (activeFilter) {
      const q = activeFilter.toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        (tx.counterparty || "").toLowerCase().includes(q) ||
        (tx.location || "").toLowerCase().includes(q) ||
        (tx.transaction_type === "income" ? "приход" : "расход").includes(q) ||
        String(tx.amount).includes(q) ||
        format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }).includes(q)
      );
    }
    return true;
  });

  const handleCellClick = (value: string) => {
    if (!value || value === "—") return;
    setFilterCell(prev => prev === value ? null : value);
    setFilterText("");
  };

  const clearFilters = () => { setFilterText(""); setFilterCell(null); setDateFrom(undefined); setDateTo(undefined); };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border p-3 text-center" style={{ background: "hsl(142 76% 97%)", borderColor: "hsl(142 76% 85%)" }}>
          <p className="text-xs font-medium" style={{ color: "hsl(142 71% 35%)" }}>Приходы</p>
          <p className="text-lg font-bold" style={{ color: "hsl(142 71% 30%)" }}>+{totalIncome.toFixed(2)}€</p>
        </div>
        <div className="rounded-xl border p-3 text-center" style={{ background: "hsl(0 86% 97%)", borderColor: "hsl(0 86% 85%)" }}>
          <p className="text-xs font-medium" style={{ color: "hsl(0 72% 45%)" }}>Расходы</p>
          <p className="text-lg font-bold" style={{ color: "hsl(0 72% 38%)" }}>-{totalExpense.toFixed(2)}€</p>
        </div>
        <div className="rounded-xl border p-3 text-center bg-primary/10 border-primary/20">
          <p className="text-xs font-medium text-primary">Остаток</p>
          <p className={cn("text-lg font-bold", totalBalance >= 0 ? "text-primary" : "text-destructive")}>
            {totalBalance.toFixed(2)}€
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Фильтр по любому полю..."
            value={filterText}
            onChange={e => { setFilterText(e.target.value); setFilterCell(null); }}
          />
        </div>
        <Popover open={showDateFilter} onOpenChange={setShowDateFilter}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {dateFrom || dateTo
                ? `${dateFrom ? format(dateFrom, "dd.MM", { locale: ru }) : "…"} — ${dateTo ? format(dateTo, "dd.MM", { locale: ru }) : "…"}`
                : "Период"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 space-y-3" align="end">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium mb-1">С:</p>
                <CalendarUI mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ru} initialFocus />
              </div>
              <div>
                <p className="text-xs font-medium mb-1">По:</p>
                <CalendarUI mode="single" selected={dateTo} onSelect={setDateTo} locale={ru} />
              </div>
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setShowDateFilter(false); }}>
              Сбросить
            </Button>
          </PopoverContent>
        </Popover>
        {(activeFilter || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Очистить
          </Button>
        )}
      </div>

      {filterCell && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Фильтр по значению:</span>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{filterCell}</span>
          <button onClick={() => setFilterCell(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-6 text-sm">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-sm">Операций нет</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Дата</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Тип</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Сумма</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Источник / Контрагент</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Место</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Описание</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, i) => (
                <tr key={tx.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                  <td
                    className="px-3 py-2 whitespace-nowrap text-muted-foreground cursor-pointer hover:text-foreground hover:bg-primary/5 rounded"
                    onClick={() => handleCellClick(format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }))}
                  >
                    {format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru })}
                  </td>
                  <td
                    className="px-3 py-2 cursor-pointer hover:bg-primary/5 rounded"
                    onClick={() => handleCellClick(tx.transaction_type === "income" ? "приход" : "расход")}
                  >
                    {tx.transaction_type === "income" ? (
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: "hsl(142 71% 35%)" }}>
                        <TrendingUp className="h-3 w-3" /> Приход
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: "hsl(0 72% 45%)" }}>
                        <TrendingDown className="h-3 w-3" /> Расход
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-semibold whitespace-nowrap cursor-pointer hover:bg-primary/5 rounded"
                    style={{ color: tx.transaction_type === "income" ? "hsl(142 71% 30%)" : "hsl(0 72% 40%)" }}
                    onClick={() => handleCellClick(String(Number(tx.amount).toFixed(2)))}
                  >
                    {tx.transaction_type === "income" ? "+" : "-"}{Number(tx.amount).toFixed(2)}€
                  </td>
                  <td
                    className="px-3 py-2 text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-primary/5 rounded"
                    onClick={() => handleCellClick(tx.counterparty || "")}
                  >
                    {tx.counterparty || <span className="opacity-40">—</span>}
                  </td>
                  <td
                    className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs cursor-pointer hover:bg-primary/5 rounded"
                    onClick={() => handleCellClick((tx as any).location || "")}
                  >
                    {(tx as any).location || <span className="opacity-40">—</span>}
                  </td>
                  <td
                    className="px-3 py-2 text-muted-foreground max-w-[250px] truncate cursor-pointer hover:bg-primary/5 rounded"
                    title={tx.description}
                    onClick={() => handleCellClick(tx.description)}
                  >
                    {tx.description}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-bold whitespace-nowrap",
                    (tx.balance || 0) >= 0 ? "text-primary" : "text-destructive")}>
                    {(tx.balance || 0).toFixed(2)}€
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-1">
        💡 Нажмите на любое значение в ячейке для быстрой фильтрации
      </p>
    </div>
  );
}
