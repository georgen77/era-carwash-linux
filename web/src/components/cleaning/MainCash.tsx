import { useState, useEffect, useRef } from "react";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Minus, ChevronDown, Calendar, X, Filter, Pencil, Trash2, RotateCcw, Check, Receipt, Camera, Paperclip, History, Upload, CloudUpload, Phone, Globe, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import TransactionEditModal from "@/components/cleaning/TransactionEditModal";
import { invoke } from "@/lib/invoke";

interface MainCashProps {
  currentUserId: string;
}

interface Transaction {
  id: string;
  transaction_type: "income" | "expense";
  amount: number;
  description: string;
  counterparty: string | null;
  category: string | null;
  location: string | null;
  transaction_date: string;
  created_at: string;
  receipt_url?: string | null;
  receipt_text?: string | null;
  balance?: number;
}

interface StoreInfo {
  name?: string;
  phone?: string;
  website?: string;
  maps?: string;
}

const DEFAULT_INCOME_COUNTERPARTIES = ["Airbnb", "Holidu", "Booking.com"];
const DEFAULT_EXPENSE_COUNTERPARTIES = [
  "Эмма 7260", "Эмма efectivo",
  "Iberdrola Peral", "Iberdrola Salvador",
  "Agua Peral", "Agua Salvador",
  "Mantenimiento Peral", "Mantenimiento Salvador",
];
const DEFAULT_EXPENSE_CATEGORIES = ["Коммунальные", "Ремонты", "Мебель", "Техника", "Стройматериалы"];
const DEFAULT_INCOME_CATEGORIES = ["Бронь", "Спа", "Другое"];
const INCOME_APARTMENTS = ["Oasis 1", "Oasis 2", "Oasis Grande", "Salvador"];
const INCOME_PLATFORMS = ["Airbnb", "Holidu", "Booking.com", "Прямая"];

// ── CounterpartySelect ─────────────────────────────────────────
function CounterpartySelect({ value, onChange, suggestions, onNewSaved }: {
  value: string; onChange: (v: string) => void;
  suggestions: string[]; onNewSaved: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setInputVal(value); }, [value]);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(inputVal.toLowerCase()));
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input placeholder="Выберите контрагента..." value={inputVal}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} className="pr-8" />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setOpen(o => !o)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(s => (
            <button key={s} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { onChange(s); setInputVal(s); setOpen(false); }}>{s}</button>
          ))}
          {inputVal.trim() && !suggestions.includes(inputVal.trim()) && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t"
              onClick={() => { const n = inputVal.trim(); onNewSaved(n); onChange(n); setOpen(false); }}>
              + Добавить «{inputVal.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── CategorySelect ─────────────────────────────────────────────
function CategorySelect({ value, onChange, categories, onNewCategory }: {
  value: string; onChange: (v: string) => void;
  categories: string[]; onNewCategory: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filtered = categories.filter(c => c.toLowerCase().includes(inputVal.toLowerCase()));
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input placeholder="Выберите категорию..." value={open ? inputVal : (value || "")}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setInputVal(""); setOpen(true); }} className="pr-8" />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setOpen(o => !o)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(c => (
            <button key={c} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { onChange(c); setInputVal(c); setOpen(false); }}>{c}</button>
          ))}
          {inputVal.trim() && !categories.includes(inputVal.trim()) && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t"
              onClick={() => { const n = inputVal.trim(); onNewCategory(n); onChange(n); setOpen(false); }}>
              + Добавить «{inputVal.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── MainCashLog ────────────────────────────────────────────────
function MainCashLog({ currentUserId }: { currentUserId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [restored, setRestored] = useState<Set<string>>(new Set());

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await invoke("main-cash", { body: { action: "list_log", userId: currentUserId } });
    setLogs(data?.logs || []);
    setLoading(false);
  };

  useEffect(() => { loadLogs(); }, []);

  const restore = async (logId: string) => {
    const { data, error } = await invoke("main-cash", { body: { action: "restore", userId: currentUserId, logId } });
    if (error || data?.error) { toast({ title: "Ошибка восстановления", variant: "destructive" }); return; }
    toast({ title: "Транзакция восстановлена" });
    setRestored(prev => new Set([...prev, logId]));
    loadLogs();
  };

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">Загрузка...</p>;

  return (
    <div className="space-y-2">
      {logs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Журнал пуст</p>}
      {logs.map(log => {
        const isDelete = log.action === "delete";
        const isRestored = log.action === "delete_restored" || restored.has(log.id);
        const data = log.new_data || log.old_data;
        return (
          <div key={log.id} className="rounded-xl border p-3 text-sm flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                  log.action === "create" ? "bg-green-100 text-green-700" :
                  log.action === "update" ? "bg-blue-100 text-blue-700" :
                  log.action === "delete" || log.action === "delete_restored" ? "bg-red-100 text-red-700" :
                  "bg-purple-100 text-purple-700")}>
                  {log.action === "create" ? "Создание" : log.action === "update" ? "Изменение" : log.action === "delete" ? "Удаление" : log.action === "restore" ? "Восстановление" : "Удалено (восст.)"}
                </span>
                {data && <span className="text-muted-foreground truncate">{data.description} — {Number(data.amount).toFixed(2)}€</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(log.changed_at), "dd.MM.yyyy HH:mm", { locale: ru })}</p>
            </div>
            {isDelete && !isRestored && (
              <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => restore(log.id)}>
                <RotateCcw className="h-3 w-3 mr-1" /> Восстановить
              </Button>
            )}
            {(isRestored) && (
              <span className="text-xs text-green-600 shrink-0 flex items-center gap-1"><Check className="h-3 w-3" /> Восстановлено</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── MainCashReports ────────────────────────────────────────────
function MainCashReports({ transactions }: { transactions: Transaction[] }) {
  const byCategory = transactions.filter(t => t.transaction_type === "expense").reduce<Record<string, number>>((acc, t) => {
    const cat = t.category || "Без категории";
    acc[cat] = (acc[cat] || 0) + Number(t.amount);
    return acc;
  }, {});
  const byCounterparty = transactions.reduce<Record<string, { income: number; expense: number }>>((acc, t) => {
    const cp = t.counterparty || "Без контрагента";
    if (!acc[cp]) acc[cp] = { income: 0, expense: 0 };
    acc[cp][t.transaction_type] += Number(t.amount);
    return acc;
  }, {});

  const totalIncome = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-5">
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
          <p className={cn("text-lg font-bold", (totalIncome - totalExpense) >= 0 ? "text-primary" : "text-destructive")}>
            {(totalIncome - totalExpense).toFixed(2)}€
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">По категориям расходов</h4>
        <div className="space-y-1.5">
          {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, sum]) => (
            <div key={cat} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 text-sm">
              <span>{cat}</span>
              <span className="font-semibold text-destructive">-{sum.toFixed(2)}€</span>
            </div>
          ))}
          {Object.keys(byCategory).length === 0 && <p className="text-sm text-muted-foreground">Нет расходов</p>}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">По контрагентам</h4>
        <div className="space-y-1.5">
          {Object.entries(byCounterparty).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense)).map(([cp, vals]) => (
            <div key={cp} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 text-sm">
              <span>{cp}</span>
              <div className="flex gap-3">
                {vals.income > 0 && <span className="text-green-700 font-medium">+{vals.income.toFixed(2)}€</span>}
                {vals.expense > 0 && <span className="text-destructive font-medium">-{vals.expense.toFixed(2)}€</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MainCash main component ────────────────────────────────────
export default function MainCash({ currentUserId }: MainCashProps) {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState<"income" | "expense" | null>(null);
  const [activeTab, setActiveTab] = useState<"cash" | "reports" | "log">("cash");

  const [counterparties, setCounterparties] = useState<string[]>([
    ...DEFAULT_INCOME_COUNTERPARTIES, ...DEFAULT_EXPENSE_COUNTERPARTIES
  ]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);

  // form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Коммунальные");
  const [incomeCategory, setIncomeCategory] = useState("Бронь");
  const [incomeApartment, setIncomeApartment] = useState("");
  const [incomePlatform, setIncomePlatform] = useState("Airbnb");
  const [incomeCheckin, setIncomeCheckin] = useState("");
  const [incomeCheckout, setIncomeCheckout] = useState("");
  const [counterparty, setCounterparty] = useState("Airbnb");
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  const [transactionTime, setTransactionTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [showTxDatePicker, setShowTxDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const receiptCameraRef = useRef<HTMLInputElement>(null);
  const receiptGalleryRef = useRef<HTMLInputElement>(null);

  // bank statement import
  const [showBankImport, setShowBankImport] = useState(false);
  const [bankImportLoading, setBankImportLoading] = useState(false);
  const [parsedBankTx, setParsedBankTx] = useState<any[]>([]);
  const [selectedBankTx, setSelectedBankTx] = useState<Set<number>>(new Set());
  const [importingBank, setImportingBank] = useState(false);
  const bankFileRef = useRef<HTMLInputElement>(null);

  const [editingTxModal, setEditingTxModal] = useState<Transaction | null>(null);

  // filters
  const [filterText, setFilterText] = useState("");
  const [filterHasReceipt, setFilterHasReceipt] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showDateFilter, setShowDateFilter] = useState(false);

  // receipt viewer
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const fetchAll = async () => {
    setIsLoading(true);
    const [txRes, cpRes] = await Promise.all([
      invoke("main-cash", { body: { action: "list", userId: currentUserId } }),
      invoke("main-cash", { body: { action: "list_counterparties", userId: currentUserId } }),
    ]);
    if (!txRes.error && !txRes.data?.error) setTransactions(txRes.data?.transactions || []);
    if (!cpRes.error && !cpRes.data?.error) {
      const fetched: string[] = cpRes.data?.counterparties || [];
      setCounterparties(Array.from(new Set([...DEFAULT_INCOME_COUNTERPARTIES, ...DEFAULT_EXPENSE_COUNTERPARTIES, ...fetched])));
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    const now = new Date();
    setAmount(""); setDescription(""); setCategory("Коммунальные"); setCounterparty("Airbnb");
    setIncomeCategory("Бронь"); setIncomeApartment(""); setIncomePlatform("Airbnb");
    setIncomeCheckin(""); setIncomeCheckout("");
    setTransactionDate(new Date());
    setTransactionTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    setReceiptFile(null); setReceiptPreview(null); setStoreInfo(null);
    setShowForm(null);
  };

  // OCR auto-fill on receipt select
  const handleReceiptSelected = async (file: File) => {
    setReceiptFile(file);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result as string;
      setReceiptPreview(base64);
      setIsOcrLoading(true);
      toast({ title: "🔍 Анализирую чек..." });
      try {
        const { data, error } = await invoke("ocr-receipt", {
          body: { imageBase64: base64, mode: "analyze" },
        });
        if (error) throw new Error(error?.message || "OCR error");
        const d = data?.data || {};
        console.log("OCR result:", JSON.stringify(d).substring(0, 300));
        let filled = 0;
        if (d.amount != null && !isNaN(Number(d.amount))) { setAmount(String(d.amount)); filled++; }
        if (d.date) {
          const parsed = new Date(d.date);
          if (!isNaN(parsed.getTime())) { setTransactionDate(parsed); filled++; }
        }
        if (d.category) { setCategory(d.category); filled++; }
        if (d.description) { setDescription(d.description); filled++; }
        if (d.store_name || d.store_phone || d.store_website || d.store_google_maps) {
          setStoreInfo({
            name: d.store_name,
            phone: d.store_phone,
            website: d.store_website,
            maps: d.store_google_maps,
          });
          filled++;
        }
        if (filled > 0) {
          toast({ title: `✅ Чек распознан! Заполнено полей: ${filled}` });
        } else {
          toast({ title: "⚠️ Чек загружен, но данные не распознаны", description: "Попробуйте более чёткое фото", variant: "destructive" });
        }
      } catch (e: any) {
        toast({ title: "Ошибка анализа чека", description: e.message, variant: "destructive" });
      } finally {
        setIsOcrLoading(false);
      }
    };
  };

  // Bank statement import
  const handleBankFileSelect = async (file: File) => {
    setBankImportLoading(true);
    setParsedBankTx([]);
    setSelectedBankTx(new Set());
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const { data, error } = await invoke("parse-bank-statement", {
          body: { imageBase64: reader.result as string },
        });
        if (error || !data?.transactions) throw new Error(error?.message || "Ошибка парсинга");
        const txs = data.transactions as any[];
        if (txs.length === 0) {
          toast({ title: "Приходы не найдены", description: "ИИ не нашёл платежей на этом скриншоте", variant: "destructive" });
        } else {
          setParsedBankTx(txs);
          setSelectedBankTx(new Set(txs.map((_: any, i: number) => i)));
          toast({ title: `Найдено ${txs.length} платежей — выберите нужные` });
        }
      } catch (e: any) {
        toast({ title: "Ошибка анализа выписки", description: e.message, variant: "destructive" });
      } finally {
        setBankImportLoading(false);
      }
    };
  };

  const importSelectedBankTx = async () => {
    const toImport = parsedBankTx.filter((_: any, i: number) => selectedBankTx.has(i));
    if (toImport.length === 0) return;
    setImportingBank(true);
    let imported = 0;
    for (const tx of toImport) {
      try {
        await invoke("main-cash", {
          body: {
            action: "add",
            userId: currentUserId,
            transactionData: {
              transaction_type: "income",
              amount: tx.amount,
              description: tx.description || tx.source || "Импорт из выписки",
              counterparty: tx.source || null,
              category: null,
              transaction_date: tx.date ? new Date(tx.date).toISOString() : new Date().toISOString(),
            },
          },
        });
        imported++;
      } catch (e) {
        console.warn("Failed to import tx:", e);
      }
    }
    toast({ title: `✅ Импортировано ${imported} из ${toImport.length} платежей` });
    setShowBankImport(false);
    setParsedBankTx([]);
    fetchAll();
    setImportingBank(false);
  };

  const handleSubmit = async () => {
    if (!amount) { toast({ title: "Введите сумму", variant: "destructive" }); return; }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast({ title: "Корректную сумму", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const [hours, minutes] = transactionTime.split(":").map(Number);
      const txDateTime = new Date(transactionDate);
      txDateTime.setHours(hours || 0, minutes || 0, 0, 0);

      let receiptUrl: string | null = null;
      if (receiptFile && showForm === "expense") {
        const fileName = `main-receipts/${Date.now()}_${receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from("receipts").upload(fileName, receiptFile, { cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error("Ошибка загрузки чека: " + uploadError.message);
        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
        receiptUrl = urlData.publicUrl;
      }

      // Build description
      let fullDescription = description || "";
      let txCategory: string | null = null;
      let txLocation: string | null = null;

      if (showForm === "income") {
        txCategory = incomeCategory || null;
        txLocation = incomeApartment || null;
        // Enrich description with booking details
        const parts: string[] = [];
        if (incomeCategory) parts.push(incomeCategory);
        if (incomeApartment) parts.push(incomeApartment);
        if (incomePlatform) parts.push(incomePlatform);
        if (incomeCheckin || incomeCheckout) {
          const fmtD = (d: string) => { const p = d.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; };
          const dates = [incomeCheckin ? fmtD(incomeCheckin) : "?", incomeCheckout ? fmtD(incomeCheckout) : "?"].join("–");
          parts.push(dates);
        }
        if (fullDescription) parts.push(fullDescription);
        fullDescription = parts.join(" | ");
      } else {
        txCategory = category || null;
        if (storeInfo) {
          const parts: string[] = [];
          if (storeInfo.name) parts.push(storeInfo.name);
          if (storeInfo.phone) parts.push(`Тел: ${storeInfo.phone}`);
          if (storeInfo.website) parts.push(storeInfo.website);
          if (storeInfo.maps) parts.push(storeInfo.maps);
          if (parts.length > 0 && !fullDescription.includes(parts[0])) {
            fullDescription = fullDescription ? `${fullDescription}\n📍 ${parts.join(" | ")}` : `📍 ${parts.join(" | ")}`;
          }
        }
      }

      const { data, error } = await invoke("main-cash", {
        body: {
          action: "add",
          userId: currentUserId,
          transactionData: {
            transaction_type: showForm!,
            amount: numAmount,
            description: fullDescription || "",
            counterparty: counterparty || null,
            category: txCategory,
            location: txLocation,
            transaction_date: txDateTime.toISOString(),
            receipt_url: receiptUrl,
          },
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      // OCR text save after transaction saved
      if (receiptFile && receiptUrl && data?.transaction?.id) {
        const reader = new FileReader();
        reader.readAsDataURL(receiptFile);
        reader.onload = async () => {
          try {
            await invoke("ocr-receipt", {
              body: { imageBase64: reader.result as string, transactionId: data.transaction.id, tableName: "main_transactions" },
            });
            fetchAll();
          } catch (e) { console.warn("OCR save failed:", e); }
        };
      }

      const syncNote = (showForm === "expense" && (counterparty === "Эмма 7260" || counterparty === "Эмма efectivo"))
        ? ` + автоматически создан приход в кассу Эммы`
        : "";
      toast({ title: showForm === "income" ? "Приход добавлен" : `Расход добавлен${syncNote}` });
      resetForm();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!window.confirm("Удалить транзакцию?")) return;
    await invoke("main-cash", { body: { action: "delete", userId: currentUserId, transactionId: id } });
    toast({ title: "Удалено" });
    fetchAll();
  };

  const openEditModal = (tx: Transaction) => setEditingTxModal(tx);

  // Balance with running total
  const withBalance = [...transactions].reverse().reduce<(Transaction & { balance: number })[]>((acc, tx) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0;
    const balance = tx.transaction_type === "income" ? prev + Number(tx.amount) : prev - Number(tx.amount);
    return [...acc, { ...tx, balance }];
  }, []).reverse();

  const totalBalance = withBalance.length > 0 ? withBalance[0].balance : 0;
  const totalIncome = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const filtered = withBalance.filter(tx => {
    if (dateFrom && new Date(tx.transaction_date) < dateFrom) return false;
    if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59); if (new Date(tx.transaction_date) > end) return false; }
    if (filterHasReceipt && !tx.receipt_url) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      return tx.description.toLowerCase().includes(q) ||
        (tx.counterparty || "").toLowerCase().includes(q) ||
        (tx.category || "").toLowerCase().includes(q) ||
        String(tx.amount).includes(q) ||
        format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }).includes(q) ||
        ((tx as any).receipt_text || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Click-to-filter for table cells
  const handleCellFilter = (value: string) => {
    if (!value || value === "—") return;
    setFilterText(prev => prev === value ? "" : value);
  };

  const currentCounterpartySuggestions = showForm === "income"
    ? counterparties.filter(c => DEFAULT_INCOME_COUNTERPARTIES.includes(c) || !DEFAULT_EXPENSE_COUNTERPARTIES.includes(c))
    : counterparties.filter(c => DEFAULT_EXPENSE_COUNTERPARTIES.includes(c) || !DEFAULT_INCOME_COUNTERPARTIES.includes(c));

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["cash", "log"] as const).map(t => (
          <button key={t} type="button"
            onClick={() => setActiveTab(t)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "cash" ? <><Plus className="h-4 w-4" /> Касса</> : <><History className="h-4 w-4" /> Журнал</>}
          </button>
        ))}
      </div>

      {activeTab === "log" && <MainCashLog currentUserId={currentUserId} />}

      {activeTab === "cash" && (
        <>
          {/* Balance summary */}
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
              <p className={cn("text-lg font-bold", totalBalance >= 0 ? "text-primary" : "text-destructive")}>{totalBalance.toFixed(2)}€</p>
            </div>
          </div>

          {/* Last transaction info */}
          {transactions.length > 0 && (() => {
            const last = transactions[0];
            const days = differenceInDays(new Date(), new Date(last.transaction_date));
            return (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border text-xs shadow-sm">
                <span className="text-foreground/70">Последний {last.transaction_type === "income" ? "приход" : "расход"}:</span>
                <span className={cn("font-bold text-sm", days <= 1 ? "text-green-600 dark:text-green-400" : days <= 3 ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>
                  {days === 0 ? "сегодня" : `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"} назад`}
                </span>
                <span className="text-foreground/50">· {format(new Date(last.transaction_date), "d MMM yyyy", { locale: ru })}</span>
              </div>
            );
          })()}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button className="flex-1" style={{ background: "hsl(142 71% 40%)", color: "white" }}
              onClick={() => { setShowForm(showForm === "income" ? null : "income"); setCounterparty("Airbnb"); setStoreInfo(null); }}>
              <Plus className="h-4 w-4 mr-2" /> Приход
            </Button>
            <Button className="flex-1" style={{ background: "hsl(0 72% 50%)", color: "white" }}
              onClick={() => { setShowForm(showForm === "expense" ? null : "expense"); setCounterparty("Эмма 7260"); setCategory("Коммунальные"); setStoreInfo(null); }}>
              <Minus className="h-4 w-4 mr-2" /> Расход
            </Button>
            <Button variant="outline" className="px-3" title="Загрузить банковскую выписку"
              onClick={() => setShowBankImport(v => !v)}>
              <Upload className="h-4 w-4" />
            </Button>
          </div>

          {/* Bank statement import panel */}
          {showBankImport && (
            <div className="rounded-xl border p-4 space-y-3 bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-blue-800">📊 Импорт из банковской выписки</p>
                <button onClick={() => { setShowBankImport(false); setParsedBankTx([]); }}><X className="h-4 w-4 text-blue-600" /></button>
              </div>
              <p className="text-xs text-blue-700">Загрузите скриншот или PDF банковской выписки — ИИ найдёт все платежи от Airbnb, Holidu, Booking.com и создаст приходы.</p>
              <input ref={bankFileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleBankFileSelect(f); if (bankFileRef.current) bankFileRef.current.value = ""; }} />
              {parsedBankTx.length === 0 ? (
                <Button size="sm" disabled={bankImportLoading} onClick={() => bankFileRef.current?.click()}
                  className="w-full" style={{ background: "hsl(217 91% 50%)", color: "white" }}>
                  {bankImportLoading ? "Анализирую..." : <><Paperclip className="h-4 w-4 mr-2" /> Выбрать скриншот или PDF выписки</>}
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-blue-800">Найдено {parsedBankTx.length} платежей — отметьте нужные:</p>
                  {parsedBankTx.map((tx: any, i: number) => (
                    <label key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white border cursor-pointer hover:bg-blue-50">
                      <input type="checkbox" checked={selectedBankTx.has(i)} className="mt-0.5"
                        onChange={e => {
                          const s = new Set(selectedBankTx);
                          if (e.target.checked) s.add(i); else s.delete(i);
                          setSelectedBankTx(s);
                        }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-green-700">+{Number(tx.amount).toFixed(2)}€</span>
                          <span className="text-xs text-muted-foreground">{tx.date}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{tx.source} — {tx.description}</p>
                      </div>
                    </label>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setParsedBankTx([]); bankFileRef.current?.click(); }}>Другой файл</Button>
                    <Button size="sm" disabled={importingBank || selectedBankTx.size === 0} onClick={importSelectedBankTx}
                      className="flex-1" style={{ background: "hsl(142 71% 40%)", color: "white" }}>
                      {importingBank ? "Импорт..." : `Добавить ${selectedBankTx.size} приход(ов)`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inline form */}
          {showForm && (
            <div className="rounded-xl border p-4 space-y-3"
              style={showForm === "income" ? { background: "hsl(142 76% 97%)", borderColor: "hsl(142 76% 80%)" } : { background: "hsl(0 86% 97%)", borderColor: "hsl(0 86% 80%)" }}>
              <p className="font-semibold text-sm">{showForm === "income" ? "➕ Новый приход" : "➖ Новый расход"}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Сумма (€) *</Label>
                  <div className="relative">
                    <Input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className={isOcrLoading ? "animate-pulse" : ""} />
                    {isOcrLoading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔍</span>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Дата и время</Label>
                  <div className="flex gap-2">
                    <Popover open={showTxDatePicker} onOpenChange={setShowTxDatePicker}>
                      <PopoverTrigger asChild>
                        <button type="button" className="flex-1 flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/40">
                          <span>{format(transactionDate, "dd.MM.yyyy", { locale: ru })}</span>
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarUI mode="single" selected={transactionDate} onSelect={d => { if (d) { setTransactionDate(d); setShowTxDatePicker(false); } }} locale={ru} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <Input type="time" value={transactionTime} onChange={e => setTransactionTime(e.target.value)} className="w-28" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Контрагент</Label>
                  <CounterpartySelect value={counterparty} onChange={setCounterparty} suggestions={currentCounterpartySuggestions}
                    onNewSaved={name => {
                      invoke("main-cash", { body: { action: "add_counterparty", userId: currentUserId, counterpartyName: name } });
                      setCounterparties(prev => Array.from(new Set([...prev, name])));
                    }} />
                  {showForm === "expense" && (counterparty === "Эмма 7260" || counterparty === "Эмма efectivo") && (
                    <p className="text-xs text-amber-600 mt-1">⚡ Автоматически создаст приход в кассе Эммы ({counterparty === "Эмма 7260" ? "Карта папы" : "Наличные"})</p>
                  )}
                </div>
                {/* Income-specific fields */}
                {showForm === "income" && (
                  <>
                    <div>
                      <Label className="text-xs">Категория</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={incomeCategory} onChange={e => setIncomeCategory(e.target.value)}>
                        {DEFAULT_INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Апартамент</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={incomeApartment} onChange={e => setIncomeApartment(e.target.value)}>
                        <option value="">— выбрать —</option>
                        {INCOME_APARTMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Платформа</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={incomePlatform} onChange={e => { setIncomePlatform(e.target.value); setCounterparty(e.target.value === "Прямая" ? "Прямая бронь" : e.target.value); }}>
                        {INCOME_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Заезд</Label>
                        <Input type="date" value={incomeCheckin} onChange={e => setIncomeCheckin(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Выезд</Label>
                        <Input type="date" value={incomeCheckout} onChange={e => setIncomeCheckout(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
                {showForm === "expense" && (
                  <div>
                    <Label className="text-xs">Категория</Label>
                    <CategorySelect value={category} onChange={setCategory} categories={expenseCategories}
                      onNewCategory={name => setExpenseCategories(prev => Array.from(new Set([...prev, name])))} />
                  </div>
                )}
                <div className="md:col-span-2">
                  <Label className="text-xs">Описание</Label>
                  <Textarea placeholder="Описание (необязательно)" value={description} onChange={e => setDescription(e.target.value)} className="min-h-[60px]" />
                </div>

                {/* Store info from OCR */}
                {storeInfo && showForm === "expense" && (
                  <div className="md:col-span-2 rounded-lg border bg-amber-50 border-amber-200 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-amber-800">📍 Информация о магазине (из чека)</p>
                    {storeInfo.name && <p className="text-xs font-medium">{storeInfo.name}</p>}
                    <div className="flex flex-wrap gap-2">
                      {storeInfo.phone && (
                        <a href={`tel:${storeInfo.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                          <Phone className="h-3 w-3" /> {storeInfo.phone}
                        </a>
                      )}
                      {storeInfo.website && (
                        <a href={storeInfo.website.startsWith("http") ? storeInfo.website : `https://${storeInfo.website}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                          <Globe className="h-3 w-3" /> {storeInfo.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {storeInfo.maps && (
                        <a href={storeInfo.maps} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                          <MapPin className="h-3 w-3" /> Карта
                        </a>
                      )}
                    </div>
                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setStoreInfo(null)}>× убрать</button>
                  </div>
                )}

                {showForm === "expense" && (
                  <div className="md:col-span-2">
                    <Label className="text-xs">Фото чека {isOcrLoading && <span className="text-amber-600 font-normal">— анализирую ИИ...</span>}</Label>
                    <input ref={receiptCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptSelected(f); if (receiptCameraRef.current) receiptCameraRef.current.value = ""; }} />
                    <input ref={receiptGalleryRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptSelected(f); if (receiptGalleryRef.current) receiptGalleryRef.current.value = ""; }} />
                    {receiptPreview ? (
                      <div className="relative inline-block mt-1">
                        <img src={receiptPreview} alt="Чек" className="h-24 rounded-lg border object-cover cursor-pointer" onClick={() => setViewingReceipt(receiptPreview)} />
                        {isOcrLoading && (
                          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                            <span className="text-white text-xs font-medium">🔍 ИИ анализ...</span>
                          </div>
                        )}
                        <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); setStoreInfo(null); }}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1 flex gap-2">
                        <button type="button" onClick={() => receiptCameraRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                          <Camera className="h-4 w-4" /> Сфотографировать
                        </button>
                        <button type="button" onClick={() => receiptGalleryRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                          <Paperclip className="h-4 w-4" /> Из галереи
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
                <Button size="sm" disabled={isSubmitting || isOcrLoading} onClick={handleSubmit}
                  style={showForm === "income" ? { background: "hsl(142 71% 40%)", color: "white" } : { background: "hsl(0 72% 50%)", color: "white" }}>
                  {isSubmitting ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Поиск..." value={filterText} onChange={e => setFilterText(e.target.value)} />
            </div>
            <button type="button" onClick={() => setFilterHasReceipt(f => !f)}
              className={cn("h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
                filterHasReceipt ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted")}>
              <Receipt className="h-3.5 w-3.5" /> С чеком
            </button>
            <Popover open={showDateFilter} onOpenChange={setShowDateFilter}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateFrom || dateTo ? `${dateFrom ? format(dateFrom, "dd.MM", { locale: ru }) : "…"} — ${dateTo ? format(dateTo, "dd.MM", { locale: ru }) : "…"}` : "Период"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 space-y-3" align="end">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs font-medium mb-1">С:</p><CalendarUI mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ru} initialFocus /></div>
                  <div><p className="text-xs font-medium mb-1">По:</p><CalendarUI mode="single" selected={dateTo} onSelect={setDateTo} locale={ru} /></div>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setShowDateFilter(false); }}>Сбросить</Button>
              </PopoverContent>
            </Popover>
            {(filterText || dateFrom || dateTo || filterHasReceipt) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterText(""); setDateFrom(undefined); setDateTo(undefined); setFilterHasReceipt(false); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Очистить
              </Button>
            )}
          </div>

          {/* Receipt viewer */}
          {viewingReceipt && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewingReceipt(null)}>
              <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
                <button onClick={() => setViewingReceipt(null)} className="absolute -top-3 -right-3 bg-white text-black rounded-full w-7 h-7 flex items-center justify-center shadow-lg z-10"><X className="h-4 w-4" /></button>
                <img src={viewingReceipt} alt="Чек" className="rounded-xl w-full object-contain shadow-2xl" />
              </div>
            </div>
          )}

          {/* Report buttons */}
          <div className="pt-1 flex justify-end gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors"
              onClick={async () => {
                const income = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
                const expense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
                const bal = income - expense;
                const lines = [...transactions].slice(0, 10).map(t => `${t.transaction_type === "income" ? "➕" : "➖"} ${Number(t.amount).toFixed(2)}€ | ${t.counterparty || "—"} | ${t.description?.slice(0, 40)}`).join("\n");
                const text = `💰 Основная касса\n\n➕ ${income.toFixed(2)}€\n➖ ${expense.toFixed(2)}€\n💵 ${bal.toFixed(2)}€\n\n${lines}`;
                await navigator.clipboard.writeText(text).catch(() => {});
                toast({ title: "Текст скопирован для Telegram" });
              }}
            >
              <span className="text-base leading-none">✈️</span> Telegram
            </button>
          </div>

          {/* Google Drive receipts note */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
            <CloudUpload className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
            <span>Все чеки сохраняются в облачном хранилище. Для автосинхронизации с Google Drive — подключите Google Drive в настройках.</span>
          </div>

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
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Контрагент</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Категория</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Описание</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Чек</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Остаток</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx, i) => (
                    <tr key={tx.id} className={cn("border-b last:border-0 group", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground cursor-pointer hover:bg-muted/40" onClick={() => handleCellFilter(format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }))}>{format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru })}</td>
                      <td className="px-3 py-2 cursor-pointer hover:bg-muted/40" onClick={() => handleCellFilter(tx.transaction_type === "income" ? "приход" : "расход")}>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          tx.transaction_type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                          {tx.transaction_type === "income" ? "➕" : "➖"} {tx.transaction_type === "income" ? "Приход" : "Расход"}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/40", tx.transaction_type === "income" ? "text-green-700" : "text-red-700")} onClick={() => handleCellFilter(String(tx.amount))}>
                        {tx.transaction_type === "income" ? "+" : "-"}{Number(tx.amount).toFixed(2)}€
                      </td>
                      <td className="px-3 py-2 text-muted-foreground cursor-pointer hover:bg-muted/40" onClick={() => handleCellFilter(tx.counterparty || "")}>{tx.counterparty || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground cursor-pointer hover:bg-muted/40" onClick={() => handleCellFilter(tx.category || "")}>{tx.category || "—"}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <div className="space-y-0.5">
                          <span className="truncate block">{tx.description}</span>
                          {tx.receipt_text && tx.receipt_text.includes("maps.google") && (
                            <a href={tx.receipt_text.match(/https:\/\/maps\.google[^\s|]*/)?.[0]} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline">
                              <MapPin className="h-3 w-3" /> Карта
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {tx.receipt_url && (
                          <button onClick={() => setViewingReceipt(tx.receipt_url!)} className="text-amber-600 hover:text-amber-800 transition-colors text-base" title="Просмотр чека">🧾</button>
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums text-xs", (tx.balance ?? 0) >= 0 ? "text-primary" : "text-destructive")}>
                        {(tx.balance ?? 0).toFixed(2)}€
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEditModal(tx)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteTransaction(tx.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Full edit modal */}
      {editingTxModal && (
        <TransactionEditModal
          tx={editingTxModal}
          currentUserId={currentUserId}
          cashType="main"
          counterpartySuggestions={counterparties}
          categorySuggestions={expenseCategories}
          onSave={fetchAll}
          onClose={() => setEditingTxModal(null)}
        />
      )}
    </div>
  );
}
