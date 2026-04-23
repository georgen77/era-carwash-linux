import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInCalendarDays, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Plus, Trash2, Receipt, TrendingDown, TrendingUp, Sparkles, CalendarIcon, Pencil, ChevronDown, X, History, Check,
} from "lucide-react";
import ContractorCombobox from "@/components/ContractorCombobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchExpenses, addExpense, deleteExpense, updateExpense, restoreExpense,
  fetchDailyFixedCosts, upsertDailyFixedCost, calcFixedCosts,
  fetchMonthlyExpenseDefaults, upsertMonthlyExpenseDefault, calcMonthlyDefaults,
  fetchExpenseLogs,
  EXPENSE_TYPES, WASH_NAMES, FIXED_DAILY_COST,
  getUsername, type Expense, type MonthlyExpenseDefault, type ExpenseLog,
} from "@/lib/api";
import { MoneyDisplay, type CurrencyContextValue } from "@/components/CurrencyDisplay";
import ExpenseCharts from "@/components/ExpenseCharts";

interface Props {
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  revenueByWash: Record<string, number>;
  cur: CurrencyContextValue;
  autoScrollToForm?: boolean;
}

export default function ExpensesBlock({ dateFrom, dateTo, totalRevenue, revenueByWash, cur, autoScrollToForm }: Props) {
  const addFormRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [expDate, setExpDate] = useState<Date>(new Date());
  const [expDateOpen, setExpDateOpen] = useState(false);
  const [washName, setWashName] = useState<string>(WASH_NAMES[0]);
  const [expType, setExpType] = useState<string>(EXPENSE_TYPES[0]);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [contractor, setContractor] = useState("");
  const [editingFixed, setEditingFixed] = useState(false);
  const [fixedEdits, setFixedEdits] = useState<Record<string, string>>({});
  const [editingDefaults, setEditingDefaults] = useState(false);
  const [defaultEdits, setDefaultEdits] = useState<Record<string, string>>({});
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Auto-scroll to add form when opened from banner
  useEffect(() => {
    if (autoScrollToForm && addFormRef.current) {
      setTimeout(() => {
        addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [autoScrollToForm]);

  // Filter state
  const [filterWash, setFilterWash] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterContractor, setFilterContractor] = useState<string | null>(null);

  // Edit state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});
  const [editDateOpen, setEditDateOpen] = useState(false);

  // Log dialog
  const [logOpen, setLogOpen] = useState(false);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteExp, setConfirmDeleteExp] = useState<Expense | null>(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", dateFrom, dateTo],
    queryFn: () => fetchExpenses(null, dateFrom, dateTo),
  });

  const { data: customCosts = [] } = useQuery({
    queryKey: ["dailyFixedCosts", dateFrom, dateTo],
    queryFn: () => fetchDailyFixedCosts(dateFrom, dateTo),
  });

  const { data: monthlyDefaults = [] } = useQuery({
    queryKey: ["monthlyExpenseDefaults"],
    queryFn: fetchMonthlyExpenseDefaults,
  });

  const { data: expenseLogs = [] } = useQuery({
    queryKey: ["expenseLogs"],
    queryFn: fetchExpenseLogs,
    enabled: logOpen,
  });

  const upsertMut = useMutation({
    mutationFn: ({ wash, date, amt }: { wash: string; date: string; amt: number }) =>
      upsertDailyFixedCost(wash, date, amt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dailyFixedCosts"] }),
  });

  const upsertDefaultMut = useMutation({
    mutationFn: ({ wash, type, amount, validFrom }: { wash: string; type: string; amount: number; validFrom: string }) =>
      upsertMonthlyExpenseDefault(wash, type, amount, validFrom),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthlyExpenseDefaults"] }),
  });

  const addMut = useMutation({
    mutationFn: addExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setAmount("");
      setComment("");
      setContractor("");
      toast.success("Витрату додано");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: ({ id, oldData }: { id: string; oldData: Expense }) => deleteExpense(id, oldData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expenseLogs"] });
      setConfirmDeleteId(null);
      setConfirmDeleteExp(null);
      toast.success("Видалено");
    },
  });

  const restoreMut = useMutation({
    mutationFn: (log: ExpenseLog) => restoreExpense(log),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Відновлено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, updates, oldData }: { id: string; updates: Partial<Omit<Expense, 'id' | 'created_at'>>; oldData: Expense }) =>
      updateExpense(id, updates, oldData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setEditingExpense(null);
      toast.success("Витрату оновлено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAdd = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error("Вкажіть суму"); return; }
    if (contractor.trim()) {
      await supabase.from("contractors").upsert({ name: contractor.trim() }, { onConflict: "name" });
      qc.invalidateQueries({ queryKey: ["contractors"] });
    }
    addMut.mutate({
      wash_name: washName,
      expense_date: format(expDate, "yyyy-MM-dd"),
      expense_type: expType,
      amount: val,
      comment,
      contractor,
      created_by: getUsername(),
    });
  };

  const handleSaveFixed = () => {
    const promises = Object.entries(fixedEdits).map(([key, val]) => {
      const [wash, date] = key.split('__');
      const amt = parseFloat(val);
      if (!isNaN(amt) && amt >= 0) return upsertMut.mutateAsync({ wash, date, amt });
      return Promise.resolve();
    });
    Promise.all(promises).then(() => {
      toast.success("Постійні витрати збережено");
      setEditingFixed(false);
      setFixedEdits({});
    });
  };

  const handleSaveDefaults = () => {
    // Editing planned expenses creates actual expense records instead
    const promises = Object.entries(defaultEdits).map(([key, val]) => {
      const [wash_name, expense_type] = key.split('__');
      const amt = parseFloat(val);
      if (!isNaN(amt) && amt > 0) {
        return addExpense({
          wash_name,
          expense_date: format(new Date(dateTo), "yyyy-MM-dd"),
          expense_type,
          amount: amt,
          comment: `З планових витрат (${format(new Date(dateFrom), "dd.MM")}–${format(new Date(dateTo), "dd.MM.yyyy")})`,
          contractor: '',
          created_by: getUsername(),
        });
      }
      return Promise.resolve();
    });
    Promise.all(promises).then(() => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Фактичні витрати додано з планових");
      setEditingDefaults(false);
      setDefaultEdits({});
    });
  };

  const startEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditForm({
      expense_date: exp.expense_date,
      wash_name: exp.wash_name,
      expense_type: exp.expense_type,
      amount: exp.amount,
      comment: exp.comment,
      contractor: exp.contractor,
    });
  };

  const handleSaveEdit = () => {
    if (!editingExpense) return;
    updateMut.mutate({ id: editingExpense.id, updates: editForm, oldData: editingExpense });
  };

  // Calculations
  const days = differenceInCalendarDays(new Date(dateTo), new Date(dateFrom)) + 1;
  const { total: fixedTotal, byWash: fixedByWash } = calcFixedCosts(dateFrom, dateTo, customCosts);
  const variableTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const defaultsCalc = calcMonthlyDefaults(dateFrom, dateTo, monthlyDefaults);

  const variableByType: Record<string, number> = {};
  const variableByWash: Record<string, number> = {};
  // variableByTypeAndWash: for deducting actuals from planned display
  const variableByTypeAndWash: Record<string, Record<string, number>> = {};
  expenses.forEach(e => {
    variableByType[e.expense_type] = (variableByType[e.expense_type] || 0) + Number(e.amount);
    variableByWash[e.wash_name] = (variableByWash[e.wash_name] || 0) + Number(e.amount);
    if (!variableByTypeAndWash[e.expense_type]) variableByTypeAndWash[e.expense_type] = {};
    variableByTypeAndWash[e.expense_type][e.wash_name] = (variableByTypeAndWash[e.expense_type][e.wash_name] || 0) + Number(e.amount);
  });

  // Planned amount reduced by actuals of same type (visual offset — no double-counting)
  // Planned types that have actuals: planned shown = max(0, planned - actual)
  const plannedTypes = new Set(monthlyDefaults.map(d => d.expense_type));
  const actualForPlannedTypes = expenses
    .filter(e => plannedTypes.has(e.expense_type))
    .reduce((s, e) => s + Number(e.amount), 0);
  // Adjusted planned total (subtract actuals for same types)
  const adjustedDefaultsTotal = Math.max(0, defaultsCalc.total - actualForPlannedTypes);
  const totalExpenses = fixedTotal + variableTotal + adjustedDefaultsTotal;
  const netProfit = totalRevenue - totalExpenses;

  const costAmountMap = new Map(customCosts.map(c => [`${c.wash_name}_${c.cost_date}`, c.amount] as [string, number]));
  const dateList: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(new Date(dateFrom), i);
    dateList.push(format(d, "yyyy-MM-dd"));
  }

  const defaultsMap = new Map(monthlyDefaults.map(d => [`${d.wash_name}__${d.expense_type}`, d.default_amount]));
  const defaultExpenseTypes = [...new Set(monthlyDefaults.map(d => d.expense_type))];

  // Filtered expenses
  const filteredExpenses = expenses.filter(e => {
    if (filterWash && e.wash_name !== filterWash) return false;
    if (filterType && e.expense_type !== filterType) return false;
    if (filterContractor && e.contractor !== filterContractor) return false;
    return true;
  });

  const hasFilters = filterWash || filterType || filterContractor;

  const clearFilters = () => {
    setFilterWash(null);
    setFilterType(null);
    setFilterContractor(null);
  };

  return (
    <div className="space-y-6">
      {/* Profit Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-gold/30 bg-gradient-to-br from-gold-muted to-card shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-accent" />
              Загальний дохід
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyDisplay amountUAH={totalRevenue} convert={cur.convert} currency={cur.currency} symbol={cur.symbol} icon={cur.icon} />
          </CardContent>
        </Card>

        <Card className="border-destructive/20 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Загальні витрати
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyDisplay amountUAH={totalExpenses} convert={cur.convert} currency={cur.currency} symbol={cur.symbol} icon={cur.icon} className="text-destructive" />
            <div className="mt-1 text-xs text-muted-foreground">
              Мийник: {cur.convert(fixedTotal).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} {cur.symbol}
              {" · "}Планові: {cur.convert(adjustedDefaultsTotal).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} {cur.symbol}
              {actualForPlannedTypes > 0 && <span className="text-gold"> (−{cur.convert(actualForPlannedTypes).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} факт)</span>}
              {" · "}Фактичні: {cur.convert(variableTotal).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} {cur.symbol}
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "shadow-lg border-2",
          netProfit >= 0
            ? "border-accent/40 bg-gradient-to-br from-accent/5 to-card"
            : "border-destructive/40 bg-gradient-to-br from-destructive/5 to-card"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-gold" />
              Чистий прибуток
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyDisplay
              amountUAH={netProfit}
              convert={cur.convert}
              currency={cur.currency}
              symbol={cur.symbol}
              icon={cur.icon}
              className={netProfit >= 0 ? "text-accent" : "text-destructive"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Expense breakdown by category */}
      <Collapsible open={categoryOpen} onOpenChange={setCategoryOpen}>
        <Card className="border-gold/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-5 w-5 text-gold" />
                Розбивка витрат за статтями
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", categoryOpen && "rotate-180")} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
                  <span className="text-sm font-medium">🧹 Оплата мийника</span>
                  <Badge variant="outline" className="border-gold/40 font-semibold tabular-nums">
                    {fixedTotal.toLocaleString("uk-UA")} ₴
                  </Badge>
                </div>
                {Object.entries(defaultsCalc.byType).map(([type, amt]) => {
                  const actualForType = variableByType[type] || 0;
                  const adjustedAmt = Math.max(0, amt - actualForType);
                  return (
                  <div key={type}>
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
                      <span className="text-sm font-medium">📋 {type} (план)</span>
                      <div className="flex items-center gap-2">
                        {actualForType > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums line-through">
                            {amt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                          </span>
                        )}
                        <Badge variant="outline" className={cn("font-semibold tabular-nums", actualForType > 0 ? "border-gold/40 text-gold" : "border-gold/40")}>
                          {adjustedAmt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                        </Badge>
                      </div>
                    </div>
                    {defaultsCalc.byTypeAndWash[type] && (
                      <div className="ml-6 mt-1 space-y-1">
                        {Object.entries(defaultsCalc.byTypeAndWash[type]).map(([wash, washAmt]) => {
                          const actualForWash = variableByTypeAndWash[type]?.[wash] || 0;
                          const adjustedWashAmt = Math.max(0, washAmt - actualForWash);
                          return (
                          <div key={wash} className="flex items-center justify-between text-xs text-muted-foreground px-3 py-0.5">
                            <span>{wash}</span>
                            <div className="flex items-center gap-1">
                              {actualForWash > 0 && <span className="line-through">{washAmt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴</span>}
                              <span className="tabular-nums font-medium text-foreground">{adjustedWashAmt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴</span>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
                {Object.entries(variableByType).map(([type, amt]) => (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
                    <span className="text-sm font-medium">📝 {type} (факт)</span>
                    <Badge variant="outline" className="border-destructive/40 font-semibold tabular-nums">
                      {amt.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                    </Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-gold-muted/80 px-4 py-2 font-semibold border-t">
                  <span className="text-sm">Разом витрати</span>
                  <Badge variant="outline" className="border-gold/40 font-bold tabular-nums">
                    {totalExpenses.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                  </Badge>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Expense Charts */}
      <ExpenseCharts
        fixedByWash={fixedByWash}
        defaultsByWash={defaultsCalc.byWash}
        defaultsByType={defaultsCalc.byType}
        defaultsByTypeAndWash={defaultsCalc.byTypeAndWash}
        variableByType={variableByType}
        variableByWash={variableByWash}
        fixedTotal={fixedTotal}
        defaultsTotal={adjustedDefaultsTotal}
        variableTotal={variableTotal}
      />

      {/* Monthly planned expenses defaults (editable) */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base flex-wrap">
            <Receipt className="h-5 w-5 text-gold" />
            Планові щомісячні витрати
            <Badge variant="secondary" className="text-xs font-normal">
              {format(new Date(dateFrom), "dd.MM.yyyy")} — {format(new Date(dateTo), "dd.MM.yyyy")}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => {
                if (editingDefaults) { setEditingDefaults(false); setDefaultEdits({}); }
                else setEditingDefaults(true);
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              {editingDefaults ? "Скасувати" : "Внести факт"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!editingDefaults ? (
            <div className="space-y-2">
              {defaultExpenseTypes.map(type => {
                const washes = WASH_NAMES.filter(w => defaultsMap.has(`${w}__${type}`));
                return (
                  <div key={type} className="rounded-lg bg-gold-muted/50 px-4 py-2">
                    <div className="text-sm font-medium mb-1">{type}</div>
                    <div className="flex flex-wrap gap-3">
                      {washes.map(wash => {
                        const plannedAmt = defaultsMap.get(`${wash}__${type}`) || 0;
                        const actualAmt = variableByTypeAndWash[type]?.[wash] || 0;
                        return (
                          <div key={wash} className="text-xs text-muted-foreground">
                            {wash}: <span className="font-semibold text-foreground tabular-nums">
                              {plannedAmt.toLocaleString("uk-UA")} ₴/міс
                            </span>
                            {actualAmt > 0 && (
                              <span className="ml-1 text-gold font-medium">
                                (сплачено: {actualAmt.toLocaleString("uk-UA")} ₴)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {monthlyDefaults.find(d => d.expense_type === type && d.active_months.length < 12) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Місяці: {monthlyDefaults.find(d => d.expense_type === type && d.active_months.length < 12)?.active_months.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                💡 Введіть фактичні суми — вони додадуться до фактичних витрат і зарахуються в рахунок планових.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Стаття</TableHead>
                    {WASH_NAMES.map(w => <TableHead key={w} className="text-center">{w}<div className="text-xs font-normal text-muted-foreground">план: {(defaultsMap.get(`${w}__`) || 0).toLocaleString()}</div></TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defaultExpenseTypes.map(type => (
                    <TableRow key={type}>
                      <TableCell className="text-xs font-medium">
                        <div>{type}</div>
                        {variableByType[type] && (
                          <div className="text-xs text-gold font-normal">сплачено: {variableByType[type].toLocaleString("uk-UA")} ₴</div>
                        )}
                      </TableCell>
                      {WASH_NAMES.map(wash => {
                        const key = `${wash}__${type}`;
                        const planned = defaultsMap.get(key) || 0;
                        const paid = variableByTypeAndWash[type]?.[wash] || 0;
                        const current = defaultEdits[key] ?? '';
                        return (
                          <TableCell key={wash} className="p-1">
                            <Input
                              type="number"
                              className="h-7 text-xs text-center w-24 mx-auto"
                              value={current}
                              onChange={e => setDefaultEdits(prev => ({ ...prev, [key]: e.target.value }))}
                              min={0}
                              placeholder={paid > 0 ? `сплач: ${paid.toLocaleString()}` : `план: ${planned.toLocaleString()}`}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button onClick={handleSaveDefaults} className="bg-gold text-gold-foreground hover:bg-gold/90">
                <Check className="h-4 w-4 mr-1" />
                Додати як фактичні
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fixed costs (washer pay) */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5 text-gold" />
            Оплата мийника
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => {
                if (editingFixed) { setEditingFixed(false); setFixedEdits({}); }
                else setEditingFixed(true);
              }}
            >
              <Pencil className="h-3 w-3 mr-1" />
              {editingFixed ? "Скасувати" : "Редагувати"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!editingFixed ? (
            <div className="space-y-2">
              {WASH_NAMES.map(wash => (
                <div key={wash} className="flex items-center justify-between rounded-lg bg-gold-muted/50 px-4 py-2">
                  <span className="text-sm font-medium">{wash}</span>
                  <Badge variant="outline" className="border-gold/40 text-foreground font-semibold tabular-nums">
                    {fixedByWash[wash]?.toLocaleString("uk-UA")} ₴
                  </Badge>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-gold-muted/80 px-4 py-2 font-semibold">
                <span className="text-sm">Разом</span>
                <Badge variant="outline" className="border-gold/40 text-foreground font-bold tabular-nums">
                  {fixedTotal.toLocaleString("uk-UA")} ₴
                </Badge>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Дата</TableHead>
                      {WASH_NAMES.map(w => <TableHead key={w} className="text-center">{w}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dateList.map(date => (
                      <TableRow key={date}>
                        <TableCell className="tabular-nums text-xs">{format(new Date(date), "dd.MM")}</TableCell>
                        {WASH_NAMES.map(wash => {
                          const key = `${wash}__${date}`;
                          const mapKey = `${wash}_${date}`;
                          const current = fixedEdits[key] ?? (costAmountMap.has(mapKey) ? String(costAmountMap.get(mapKey)) : String(FIXED_DAILY_COST));
                          return (
                            <TableCell key={wash} className="p-1">
                              <Input
                                type="number"
                                className="h-7 text-xs text-center w-20 mx-auto"
                                value={current}
                                onChange={e => setFixedEdits(prev => ({ ...prev, [key]: e.target.value }))}
                                min={0}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={handleSaveFixed} className="bg-gold text-gold-foreground hover:bg-gold/90">
                Зберегти
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add expense form */}
      <Card ref={addFormRef} className="border-gold/20 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5 text-gold" />
            Додати змінну витрату
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Popover open={expDateOpen} onOpenChange={setExpDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(expDate, "dd.MM.yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={expDate}
                  onSelect={(d) => { if (d) { setExpDate(d); setExpDateOpen(false); } }}
                  locale={uk}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Select value={washName} onValueChange={setWashName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {WASH_NAMES.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={expType} onValueChange={setExpType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              placeholder="Сума ₴"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
            />

            <ContractorCombobox value={contractor} onChange={setContractor} />

            <div className="flex gap-2">
              <Input
                placeholder="Коментар"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleAdd}
                disabled={addMut.isPending}
                className="bg-gold text-gold-foreground hover:bg-gold/90 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses table */}
      <Card className="border-gold/20 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base flex-wrap">
            <TrendingDown className="h-5 w-5 text-destructive" />
            Фактичні витрати за період
            {hasFilters && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={clearFilters}>
                <X className="h-2.5 w-2.5" />
                Скинути фільтри
              </Badge>
            )}
            {filterWash && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{filterWash}</Badge>}
            {filterType && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{filterType}</Badge>}
            {filterContractor && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{filterContractor}</Badge>}
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => setLogOpen(true)}>
              <History className="h-3.5 w-3.5 mr-1" />
              Лог змін
            </Button>
            <Badge variant="secondary" className="tabular-nums">
              {filteredExpenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString("uk-UA")} ₴
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Завантаження...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              {hasFilters ? "Немає витрат за обраним фільтром" : "Немає витрат за обраний період"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Об'єкт</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Коментар</TableHead>
                  <TableHead className="text-right">Сума</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((exp) => (
                  <TableRow key={exp.id} className="group">
                    <TableCell
                      className="tabular-nums cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setFilterWash(exp.wash_name)}
                      title="Фільтрувати за об'єктом"
                    >
                      {format(new Date(exp.expense_date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer hover:text-primary transition-colors font-medium"
                      onClick={() => setFilterWash(exp.wash_name)}
                      title="Фільтрувати за об'єктом"
                    >
                      {exp.wash_name}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => setFilterType(exp.expense_type)}
                      title="Фільтрувати за типом"
                    >
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">{exp.expense_type}</Badge>
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                      onClick={() => exp.contractor && setFilterContractor(exp.contractor)}
                      title="Фільтрувати за контрагентом"
                    >
                      {exp.contractor}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{exp.comment}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {Number(exp.amount).toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(exp)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/60 hover:text-destructive"
                          onClick={() => { setConfirmDeleteId(exp.id); setConfirmDeleteExp(exp); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit expense dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(o) => !o && setEditingExpense(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Редагувати витрату
            </DialogTitle>
          </DialogHeader>
          {editingExpense && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата</label>
                  <Popover open={editDateOpen} onOpenChange={setEditDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editForm.expense_date ? format(new Date(editForm.expense_date + 'T00:00:00'), "dd.MM.yyyy") : '—'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50">
                      <Calendar
                        mode="single"
                        selected={editForm.expense_date ? new Date(editForm.expense_date + 'T00:00:00') : undefined}
                        onSelect={(d) => {
                          if (d) {
                            setEditForm(f => ({ ...f, expense_date: format(d, 'yyyy-MM-dd') }));
                            setEditDateOpen(false);
                          }
                        }}
                        locale={uk}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Об'єкт</label>
                  <Select value={editForm.wash_name || ''} onValueChange={v => setEditForm(f => ({ ...f, wash_name: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WASH_NAMES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
                  <Select value={editForm.expense_type || ''} onValueChange={v => setEditForm(f => ({ ...f, expense_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Сума ₴</label>
                  <Input
                    type="number"
                    value={String(editForm.amount || '')}
                    onChange={e => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Контрагент</label>
                <ContractorCombobox value={editForm.contractor || ''} onChange={v => setEditForm(f => ({ ...f, contractor: v }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Коментар</label>
                <Input
                  value={editForm.comment || ''}
                  onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingExpense(null)}>Скасувати</Button>
                <Button onClick={handleSaveEdit} disabled={updateMut.isPending} className="bg-gold text-gold-foreground hover:bg-gold/90">
                  <Check className="h-4 w-4 mr-1" />
                  Зберегти
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Expense change log dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Лог змін витрат
            </DialogTitle>
          </DialogHeader>
          {expenseLogs.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Немає записів</div>
          ) : (
            <div className="space-y-2">
              {expenseLogs.map(log => {
                const old = log.old_data as Record<string, unknown>;
                const newD = log.new_data as Record<string, unknown> | null;
                return (
                  <div key={log.id} className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    log.action === 'delete' ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"
                  )}>
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={log.action === 'delete' ? 'destructive' : 'secondary'} className="text-xs">
                          {log.action === 'delete' ? 'Видалено' : log.action === 'restore' ? 'Відновлено' : 'Змінено'}
                        </Badge>
                        <span className="text-muted-foreground text-xs font-medium">{log.changed_by}</span>
                      </div>
                      {log.action === 'restore' ? (
                        <span className="text-xs text-muted-foreground/50 px-2 py-1 border border-border rounded-md bg-muted/30">✓ Відновлено</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2 border-accent/40 text-accent hover:bg-accent/10"
                          disabled={restoreMut.isPending}
                          onClick={() => restoreMut.mutate(log)}
                        >
                          ↩ Відновити
                        </Button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{String(old.wash_name)}</span>
                      {' · '}{String(old.expense_type)}
                      {' · '}<span className="font-semibold">{Number(old.amount).toLocaleString('uk-UA')} ₴</span>
                      {old.contractor && <span> · {String(old.contractor)}</span>}
                      {old.comment && <span> · {String(old.comment)}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground/60 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {old.expense_date && (
                        <span>📆 Дата витрати: {String(old.expense_date)}</span>
                      )}
                      {old.created_at && (
                        <span>🕐 Запис створено: {format(new Date(String(old.created_at)), "dd.MM.yyyy HH:mm")}</span>
                      )}
                      {log.action === 'restore' && newD && (newD as Record<string, unknown>).prev_action_at && (
                        <span>
                          {(newD as Record<string, unknown>).prev_action === 'delete' ? '🗑 Видалено: ' : '✏️ Змінено: '}
                          {format(new Date(String((newD as Record<string, unknown>).prev_action_at)), "dd.MM.yyyy HH:mm")}
                        </span>
                      )}
                      <span>
                        {log.action === 'delete' ? '🗑 Видалено: ' : log.action === 'restore' ? '↩ Відновлено: ' : '✏️ Змінено: '}
                        {format(new Date(log.changed_at), "dd.MM.yyyy HH:mm")}
                      </span>
                    </div>
                    {newD && log.action === 'edit' && (
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <span className="text-muted-foreground/60">→</span>
                        {newD.wash_name && String(newD.wash_name) !== String(old.wash_name) && (
                          <span className="text-foreground">{String(newD.wash_name)}</span>
                        )}
                        {newD.expense_type && String(newD.expense_type) !== String(old.expense_type) && (
                          <span className="text-foreground">{String(newD.expense_type)}</span>
                        )}
                        {newD.amount !== undefined && Number(newD.amount) !== Number(old.amount) && (
                          <span className="font-semibold text-foreground">{Number(newD.amount).toLocaleString('uk-UA')} ₴</span>
                        )}
                        {newD.contractor !== undefined && String(newD.contractor) !== String(old.contractor) && (
                          <span className="text-foreground">{String(newD.contractor)}</span>
                        )}
                        {newD.comment !== undefined && String(newD.comment) !== String(old.comment) && (
                          <span className="text-foreground">{String(newD.comment)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) { setConfirmDeleteId(null); setConfirmDeleteExp(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Підтвердити видалення
            </DialogTitle>
          </DialogHeader>
          {confirmDeleteExp && (
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm">
                <div className="font-medium">{confirmDeleteExp.wash_name} · {confirmDeleteExp.expense_type}</div>
                <div className="text-muted-foreground mt-0.5">
                  {Number(confirmDeleteExp.amount).toLocaleString('uk-UA')} ₴
                  {confirmDeleteExp.contractor && ` · ${confirmDeleteExp.contractor}`}
                  {confirmDeleteExp.comment && ` · ${confirmDeleteExp.comment}`}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Ви впевнені? Цю дію можна буде відмінити через «Лог змін».</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setConfirmDeleteId(null); setConfirmDeleteExp(null); }}>
                  Скасувати
                </Button>
                <Button
                  variant="destructive"
                  disabled={delMut.isPending}
                  onClick={() => confirmDeleteId && confirmDeleteExp && delMut.mutate({ id: confirmDeleteId, oldData: confirmDeleteExp })}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Видалити
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
