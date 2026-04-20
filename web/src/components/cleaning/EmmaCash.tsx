import { useState, useEffect, useRef } from "react";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Minus, TrendingUp, TrendingDown, ChevronDown, Send, Calendar, X, Filter, Pencil, Trash2, RotateCcw, Check, Receipt, Camera, Paperclip, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import TransactionEditModal from "@/components/cleaning/TransactionEditModal";
import { invoke } from "@/lib/invoke";

interface EmmaCashProps {
  currentUserId: string;
  currentUserRole?: string;
}

interface Transaction {
  id: string;
  transaction_type: "income" | "expense";
  amount: number;
  description: string;
  payment_source: string | null;
  counterparty: string | null;
  location?: string | null;
  transaction_date: string;
  created_at: string;
  balance?: number;
  receipt_url?: string | null;
  receipt_text?: string | null;
}

const DEFAULT_EXPENSE_CATEGORIES = [
  "Оплата клининга",
  "Расходники для гостей",
  "Хозяйственные товары",
  "Ремонт и обслуживание",
  "Коммунальные услуги",
  "Стирка и бельё",
  "Маркетинг",
  "Другое",
];

const APARTMENTS = ["Era Deluxe", "Oasis 1", "Oasis 2", "Oasis Grande"];

const DEFAULT_LOCATIONS = ["Era Deluxe", "Oasis 1", "Oasis 2"];

const DEFAULT_COUNTERPARTIES = ["Марьяна", "Ира", "Вика", "Мама Вики"];

const INCOME_SOURCES = ["Наличные", "Карта папы", "Моя карта"];

// Multi-select counterparty combobox
function CounterpartyMultiSelect({
  value,
  onChange,
  suggestions,
  onNewSaved,
  onEditName,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  onNewSaved: (name: string) => void;
  onEditName: (old: string, newName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(inputVal.toLowerCase()) && !value.includes(s)
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter(v => v !== name));
    } else {
      onChange([...value, name]);
    }
  };

  const addNew = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!suggestions.includes(trimmed)) onNewSaved(trimmed);
    if (!value.includes(trimmed)) onChange([...value, trimmed]);
    setInputVal("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="min-h-9 flex flex-wrap gap-1 items-center border rounded-md px-2 py-1 cursor-text bg-background" onClick={() => setOpen(true)}>
        {value.map(v => (
          <span key={v} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
            {v}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
          placeholder={value.length === 0 ? "Выбрать контрагента..." : ""}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-52 overflow-y-auto">
          {/* Existing suggestions */}
          {(inputVal ? filtered : suggestions.filter(s => !value.includes(s))).map(s => (
            <div key={s} className="flex items-center justify-between px-3 py-2 hover:bg-muted group">
              <button type="button" className="flex-1 text-left text-sm" onClick={() => { toggle(s); setInputVal(""); }}>{s}</button>
              {editingName === s ? (
                <div className="flex items-center gap-1">
                  <input
                    className="text-xs border rounded px-1 py-0.5 w-24"
                    value={editVal}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { onEditName(s, editVal.trim()); setEditingName(null); }
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    autoFocus
                  />
                  <button type="button" className="text-xs text-primary" onClick={e => { e.stopPropagation(); onEditName(s, editVal.trim()); setEditingName(null); }}>✓</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 ml-2"
                  onClick={e => { e.stopPropagation(); setEditingName(s); setEditVal(s); }}
                >✏️</button>
              )}
            </div>
          ))}
          {inputVal && !suggestions.includes(inputVal.trim()) && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t"
              onClick={() => addNew(inputVal)}
            >
              + Добавить «{inputVal}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Multi-select apartments (same pattern as CounterpartyMultiSelect but simpler — no edit)
function ApartmentMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(inputVal.toLowerCase()) && !value.includes(o));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter(v => v !== name));
    else onChange([...value, name]);
    setInputVal("");
  };

  const addCustom = (name: string) => {
    const t = name.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInputVal("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="min-h-9 flex flex-wrap gap-1 items-center border rounded-md px-2 py-1 cursor-text bg-background" onClick={() => setOpen(true)}>
        {value.map(v => (
          <span key={v} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
            {v}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
          placeholder={value.length === 0 ? "Выбрать апартамент(ы)..." : ""}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-52 overflow-y-auto">
          {(inputVal ? filtered : options.filter(o => !value.includes(o))).map(o => (
            <button key={o} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => toggle(o)}>{o}</button>
          ))}
          {inputVal && !options.includes(inputVal.trim()) && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t"
              onClick={() => addCustom(inputVal)}>+ Добавить «{inputVal}»</button>
          )}
        </div>
      )}
    </div>
  );
}

// Location combobox (single select with add new)
function LocationSelect({
  value,
  onChange,
  locations,
  onNewLocation,
}: {
  value: string;
  onChange: (v: string) => void;
  locations: string[];
  onNewLocation: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputVal(value); }, [value]);

  const filtered = locations.filter(l => l.toLowerCase().includes(inputVal.toLowerCase()));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input
          placeholder="Выберите место..."
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="pr-8"
        />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setOpen(o => !o)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(l => (
            <button key={l} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { onChange(l); setInputVal(l); setOpen(false); }}>{l}</button>
          ))}
          {inputVal && !locations.includes(inputVal) && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t"
              onClick={() => { onNewLocation(inputVal); onChange(inputVal); setOpen(false); }}>
              + Добавить «{inputVal}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Category select with ability to add new
function CategorySelect({ value, onChange, categories, onNewCategory }: {
  value: string; onChange: (v: string) => void;
  categories: string[]; onNewCategory: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = categories.filter(c => c.toLowerCase().includes(inputVal.toLowerCase()));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input placeholder="Выберите или добавьте категорию..."
          value={open ? inputVal : (value || "")}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setInputVal(""); setOpen(true); }}
          className="pr-8" />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setOpen(o => !o)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(c => (
            <button key={c} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
              onClick={() => { onChange(c); setInputVal(c); setOpen(false); }}>
              {c}
              {!DEFAULT_EXPENSE_CATEGORIES.includes(c) && <span className="text-xs text-muted-foreground/50">своя</span>}
            </button>
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

// Multi-date picker for cleaning dates
function MultiDatePicker({ dates, onChange }: { dates: Date[]; onChange: (d: Date[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/40 text-left">
          <span className={dates.length === 0 ? "text-muted-foreground" : ""}>
            {dates.length === 0 ? "Выберите даты уборок..." : dates.sort((a, b) => a.getTime() - b.getTime()).map(d => format(d, "dd.MM", { locale: ru })).join(", ")}
          </span>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarUI
          mode="multiple"
          selected={dates}
          onSelect={d => onChange(d || [])}
          locale={ru}
          initialFocus
        />
        <div className="p-2 border-t flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Выбрано: {dates.length} дат</span>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function EmmaCash({ currentUserId, currentUserRole }: EmmaCashProps) {
  const isAdminOrCoord = currentUserRole === 'admin' || currentUserRole === 'coordinator';
  const isAdmin = currentUserRole === 'admin';
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingTxModal, setEditingTxModal] = useState<Transaction | null>(null);
  const [counterparties, setCounterparties] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState<"income" | "expense" | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("emma_custom_categories");
      if (saved) {
        const custom = JSON.parse(saved) as string[];
        return Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...custom]));
      }
    } catch {}
    return DEFAULT_EXPENSE_CATEGORIES;
  });

  // form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [storeNotes, setStoreNotes] = useState<{ name?: string; phone?: string; website?: string; maps?: string } | null>(null);
  const [selectedCounterparties, setSelectedCounterparties] = useState<string[]>([]);
  const [incomeSource, setIncomeSource] = useState("");
  const [location, setLocation] = useState("");
  const [cleaningApartments, setCleaningApartments] = useState<string[]>([]);
  const [cleaningDates, setCleaningDates] = useState<Date[]>([]);
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
  const receiptCameraRef = useRef<HTMLInputElement>(null);
  const receiptGalleryRef = useRef<HTMLInputElement>(null);

  // bank statement import
  const [showBankImport, setShowBankImport] = useState(false);
  const [bankImportLoading, setBankImportLoading] = useState(false);
  const [parsedBankTx, setParsedBankTx] = useState<any[]>([]);
  const [selectedBankTx, setSelectedBankTx] = useState<Set<number>>(new Set());
  const [importingBank, setImportingBank] = useState(false);
  const bankFileRef = useRef<HTMLInputElement>(null);

  // receipt viewer state
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [viewingReceiptText, setViewingReceiptText] = useState<string | null>(null);

  // filter for has receipt
  const [filterHasReceipt, setFilterHasReceipt] = useState(false);

  // filters
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showDateFilter, setShowDateFilter] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    const [txRes, cpRes] = await Promise.all([
      invoke("emma-cash", { body: { action: "list", userId: currentUserId } }),
      invoke("emma-cash", { body: { action: "list_counterparties", userId: currentUserId } }),
    ]);
    if (!txRes.error && !txRes.data?.error) setTransactions(txRes.data?.transactions || []);
    if (!cpRes.error && !cpRes.data?.error) {
      const fetched: string[] = cpRes.data?.counterparties || [];
      // merge defaults
      const merged = Array.from(new Set([...DEFAULT_COUNTERPARTIES, ...fetched]));
      setCounterparties(merged);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Listen for smart voice fill events
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      const type = data.transaction_type as "income" | "expense" | undefined;
      if (type) setShowForm(type);
      if (data.amount) setAmount(data.amount.toString());
      if (data.description) setDescription(data.description);
      if (data.payment_source) setIncomeSource(data.payment_source);
      if (data.counterparty) {
        const names = data.counterparty.split(",").map((s: string) => s.trim()).filter(Boolean);
        setSelectedCounterparties(names);
      }
      if (data.category) setCategory(data.category);
      if (data.apartment) setCleaningApartments(data.apartment ? [data.apartment] : []);
      if (data.location) setLocation(data.location);
      // Scroll to the form after it opens
      setTimeout(() => {
        const el = document.getElementById("emma-cash-form");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      toast({ title: "Форма заполнена — проверьте и нажмите «Добавить» ✨" });
    };
    window.addEventListener("smart-voice-fill-transaction", handler);
    return () => window.removeEventListener("smart-voice-fill-transaction", handler);
  }, [toast]);

  const saveNewCounterparty = async (name: string) => {
    await invoke("emma-cash", {
      body: { action: "add_counterparty", userId: currentUserId, counterpartyName: name },
    });
    setCounterparties(prev => Array.from(new Set([...prev, name])));
  };

  const editCounterpartyName = async (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return;
    await invoke("emma-cash", {
      body: { action: "edit_counterparty", userId: currentUserId, oldName, newName },
    });
    setCounterparties(prev => prev.map(c => c === oldName ? newName : c));
    setSelectedCounterparties(prev => prev.map(c => c === oldName ? newName : c));
  };

  // OCR auto-fill on receipt select
  const handleReceiptSelected = async (file: File) => {
    setReceiptFile(file);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result as string;
      setReceiptPreview(base64);
      // Run AI analysis immediately
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
          setStoreNotes({ name: d.store_name, phone: d.store_phone, website: d.store_website, maps: d.store_google_maps });
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
          const all = new Set(txs.map((_: any, i: number) => i));
          setSelectedBankTx(all);
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
        await invoke("emma-cash", {
          body: {
            action: "add",
            userId: currentUserId,
            transactionData: {
              transaction_type: "income",
              amount: tx.amount,
              description: tx.description || tx.source || "Импорт из выписки",
              counterparty: tx.source || null,
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
    if (!amount) {
      toast({ title: "Введите сумму", variant: "destructive" });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ title: "Введите корректную сумму", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let fullDescription = description || "";
      if (showForm === "expense" && category) {
        if (category === "Оплата клининга" && cleaningApartments.length > 0) {
          const datesStr = cleaningDates.length > 0
            ? " (" + cleaningDates.sort((a, b) => a.getTime() - b.getTime()).map(d => format(d, "dd.MM.yyyy")).join(", ") + ")"
            : "";
          fullDescription = `${category}: ${cleaningApartments.join(", ")}${datesStr} — ${description}`;
        } else {
          fullDescription = `${category}: ${description}`;
        }
      }

      const counterpartyStr = showForm === "expense" ? (selectedCounterparties.join(", ") || null) : null;
      const sourceStr = showForm === "income" ? (incomeSource || null) : null;

      // Build the transaction datetime from date picker + time input
      const [hours, minutes] = transactionTime.split(":").map(Number);
      const txDateTime = new Date(transactionDate);
      txDateTime.setHours(hours || 0, minutes || 0, 0, 0);

      // Upload receipt if present
      let receiptUrl: string | null = null;
      if (receiptFile && showForm === "expense") {
        const fileName = `receipts/${Date.now()}_${receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, receiptFile, { cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error("Ошибка загрузки чека: " + uploadError.message);
        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
        receiptUrl = urlData.publicUrl;
      }

      const { data, error } = await invoke("emma-cash", {
        body: {
          action: "add",
          userId: currentUserId,
          transactionData: {
            transaction_type: showForm!,
            amount: numAmount,
            description: fullDescription,
            counterparty: counterpartyStr || sourceStr,
            location: showForm === "expense" ? (location || null) : null,
            transaction_date: txDateTime.toISOString(),
            receipt_url: receiptUrl,
          },
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      // Run OCR on receipt after transaction saved
      if (receiptFile && receiptUrl && data?.transaction?.id) {
        const transactionId = data.transaction.id;
        // Convert to base64 data URL for AI vision
        const reader = new FileReader();
        reader.readAsDataURL(receiptFile);
        reader.onload = async () => {
          try {
            await invoke("ocr-receipt", {
              body: { imageBase64: reader.result as string, transactionId },
            });
            // Refresh to get OCR text
            fetchAll();
          } catch (e) {
            console.warn("OCR failed:", e);
          }
        };
      }

      toast({ title: showForm === "income" ? "Приход добавлен" : "Расход добавлен" });
      resetForm();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    const now = new Date();
    setAmount(""); setDescription(""); setCategory(""); setSelectedCounterparties([]);
    setIncomeSource(""); setLocation(""); setCleaningApartments([]); setCleaningDates([]);
    setTransactionDate(new Date());
    setTransactionTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    setReceiptFile(null); setReceiptPreview(null); setStoreNotes(null);
    setShowForm(null);
  };

  const deleteTransaction = async (id: string) => {
    if (!window.confirm("Удалить транзакцию? Её можно будет восстановить из журнала.")) return;
    await invoke("emma-cash", {
      body: { action: "delete", userId: currentUserId, transactionId: id },
    });
    toast({ title: "Удалено" });
    fetchAll();
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTxModal(tx);
  };

  // Click-to-filter: clicking a cell value sets filterText
  const handleCellFilter = (value: string) => {
    if (!value || value === "—") return;
    setFilterText(prev => prev === value ? "" : value);
  };

  // Send Telegram report
  const sendTelegramReport = async () => {
    const income = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense;
    const lastTx = transactions[0];
    try {
      const { data, error } = await invoke("send-telegram-notification", {
        body: {
          trigger_page: "кассы",
          event_data: {
            balances: { emma: balance },
            last_transaction: lastTx ? {
              transaction_type: lastTx.transaction_type,
              amount: lastTx.amount,
              counterparty: lastTx.counterparty,
              description: lastTx.description,
              transaction_date: lastTx.transaction_date,
            } : undefined,
          },
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Ошибка");
      if (data?.sent === 0) throw new Error("Нет активных правил уведомлений для кассы. Настройте правила в разделе Telegram.");
      toast({ title: `✅ Отправлено в Telegram (${data?.sent} получателей)` });
    } catch (e: any) {
      toast({ title: "Ошибка Telegram", description: e.message, variant: "destructive" });
    }
  };

  // Send Email report
  const sendEmailReport = async () => {
    const income = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense;
    const recent = [...transactions].slice(0, 10);
    const rows = recent.map(t =>
      `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${format(new Date(t.transaction_date), "dd.MM.yyyy", { locale: ru })}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${t.transaction_type === "income" ? "➕ Приход" : "➖ Расход"}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;color:${t.transaction_type === "income" ? "#16a34a" : "#dc2626"}">${Number(t.amount).toFixed(2)}€</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${t.counterparty || "—"}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${t.description}</td>
      </tr>`
    ).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#7c3aed">💰 Касса Эммы — отчёт</h2>
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="background:#f0fdf4;padding:12px 20px;border-radius:8px;flex:1;text-align:center">
            <div style="color:#16a34a;font-size:12px">➕ Приходы</div>
            <div style="font-size:20px;font-weight:bold;color:#16a34a">${income.toFixed(2)}€</div>
          </div>
          <div style="background:#fef2f2;padding:12px 20px;border-radius:8px;flex:1;text-align:center">
            <div style="color:#dc2626;font-size:12px">➖ Расходы</div>
            <div style="font-size:20px;font-weight:bold;color:#dc2626">${expense.toFixed(2)}€</div>
          </div>
          <div style="background:${balance >= 0 ? "#f0fdf4" : "#fef2f2"};padding:12px 20px;border-radius:8px;flex:1;text-align:center">
            <div style="color:#374151;font-size:12px">💵 Остаток</div>
            <div style="font-size:20px;font-weight:bold;color:${balance >= 0 ? "#16a34a" : "#dc2626"}">${balance.toFixed(2)}€</div>
          </div>
        </div>
        <h3 style="color:#374151">Последние операции</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">Дата</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">Тип</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">Сумма</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">Контрагент</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">Описание</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px">Отчёт сформирован ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: ru })}</p>
      </div>`;

    try {
      const { data, error } = await invoke("send-email", {
        body: {
          to: "georgen77@gmail.com",
          subject: `Касса Эммы — отчёт (остаток ${balance.toFixed(2)}€)`,
          html,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Неизвестная ошибка");
      toast({ title: "Отчёт отправлен на email!" });
    } catch (err) {
      console.error("Email send error:", err);
      toast({ title: "Ошибка отправки email", description: String(err), variant: "destructive" });
    }
  };

  // Compute balance
  const withBalance = [...transactions].reverse().reduce<(Transaction & { balance: number })[]>(
    (acc, tx) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const balance = tx.transaction_type === "income" ? prev + Number(tx.amount) : prev - Number(tx.amount);
      return [...acc, { ...tx, balance }];
    }, []
  ).reverse();

  const totalBalance = withBalance.length > 0 ? withBalance[0].balance : 0;
  const totalIncome = transactions.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  // Apply filters
  const filtered = withBalance.filter(tx => {
    if (filterType !== "all" && tx.transaction_type !== filterType) return false;
    if (dateFrom && new Date(tx.transaction_date) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59);
      if (new Date(tx.transaction_date) > end) return false;
    }
    if (filterHasReceipt && !tx.receipt_url) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        (tx.counterparty || "").toLowerCase().includes(q) ||
        (tx.transaction_type === "income" ? "приход" : "расход").includes(q) ||
        String(tx.amount).includes(q) ||
        format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }).includes(q) ||
        ((tx as any).receipt_text || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
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
          <p className={cn("text-lg font-bold", totalBalance >= 0 ? "text-primary" : "text-destructive")}>
            {totalBalance.toFixed(2)}€
          </p>
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
          onClick={() => { setShowForm(showForm === "income" ? null : "income"); setCategory(""); }}>
          <Plus className="h-4 w-4 mr-2" /> Приход
        </Button>
        <Button className="flex-1" style={{ background: "hsl(0 72% 50%)", color: "white" }}
          onClick={() => { setShowForm(showForm === "expense" ? null : "expense"); setCategory("Оплата клининга"); setAmount("35"); }}>
          <Minus className="h-4 w-4 mr-2" /> Расход
        </Button>
        <Button variant="outline" className="px-3" title="Загрузить банковскую выписку"
          onClick={() => setShowBankImport(v => !v)}>
          <Upload className="h-4 w-4" />
        </Button>
      </div>

      {/* Type filter buttons */}
      <div className="flex gap-1">
        {([["all", "Все"], ["income", "Приходы"], ["expense", "Расходы"]] as const).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilterType(val)}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors",
              filterType === val
                ? val === "income" ? "bg-green-100 border-green-300 text-green-700"
                  : val === "expense" ? "bg-red-100 border-red-300 text-red-700"
                  : "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {label} ({val === "all" ? transactions.length : transactions.filter(t => t.transaction_type === val).length})
          </button>
        ))}
      </div>

      {/* Standalone bank import panel */}
      {showBankImport && (
        <div className="rounded-xl border p-4 space-y-3 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm text-blue-800">📊 Импорт из банковской выписки</p>
            <button onClick={() => { setShowBankImport(false); setParsedBankTx([]); }}><X className="h-4 w-4 text-blue-600" /></button>
          </div>
          <p className="text-xs text-blue-700">Загрузите скриншот или PDF банковской выписки — ИИ найдёт все платежи от Airbnb, Holidu, Booking.com и создаст приходы.</p>
          <input ref={bankFileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleBankFileSelect(f); if (bankFileRef.current) bankFileRef.current.value = ""; }} />
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
        <div id="emma-cash-form" className="rounded-xl border p-4 space-y-3"
          style={showForm === "income"
            ? { background: "hsl(142 76% 97%)", borderColor: "hsl(142 76% 80%)" }
            : { background: "hsl(0 86% 97%)", borderColor: "hsl(0 86% 80%)" }
          }>
          <p className="font-semibold text-sm">
            {showForm === "income" ? "➕ Новый приход" : "➖ Новый расход"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Сумма (€) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            {/* Date + Time */}
            <div>
              <Label className="text-xs">Дата и время</Label>
              <div className="flex gap-2">
                <Popover open={showTxDatePicker} onOpenChange={setShowTxDatePicker}>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex-1 flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/40 text-left">
                      <span>{format(transactionDate, "dd.MM.yyyy", { locale: ru })}</span>
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarUI
                      mode="single"
                      selected={transactionDate}
                      onSelect={d => { if (d) { setTransactionDate(d); setShowTxDatePicker(false); } }}
                      locale={ru}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={transactionTime}
                  onChange={e => setTransactionTime(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>

            {/* Income: source dropdown; Expense: counterparty multi-select */}
            {showForm === "income" ? (
              <div>
                <Label className="text-xs">Источник</Label>
                <Select value={incomeSource} onValueChange={setIncomeSource}>
                  <SelectTrigger><SelectValue placeholder="Выберите источник" /></SelectTrigger>
                  <SelectContent>
                    {INCOME_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Контрагент</Label>
                <CounterpartyMultiSelect
                  value={selectedCounterparties}
                  onChange={setSelectedCounterparties}
                  suggestions={counterparties}
                  onNewSaved={saveNewCounterparty}
                  onEditName={editCounterpartyName}
                />
              </div>
            )}

            {/* Expense category */}
            {showForm === "expense" && (
              <div>
                <Label className="text-xs">Категория</Label>
                <CategorySelect
                  value={category}
                  onChange={setCategory}
                  categories={expenseCategories}
                  onNewCategory={name => {
                    setExpenseCategories(prev => {
                      const updated = Array.from(new Set([...prev, name]));
                      const custom = updated.filter(c => !DEFAULT_EXPENSE_CATEGORIES.includes(c));
                      localStorage.setItem("emma_custom_categories", JSON.stringify(custom));
                      return updated;
                    });
                  }}
                />
              </div>
            )}

            {/* Location for expense */}
            {showForm === "expense" && (
              <div>
              <Label className="text-xs">Место выдачи</Label>
                <LocationSelect
                  value={location}
                  onChange={setLocation}
                  locations={locations}
                  onNewLocation={name => setLocations(prev => [...prev, name])}
                />
              </div>
            )}

            {/* Cleaning: apartment + dates */}
            {showForm === "expense" && category === "Оплата клининга" && (
              <>
                <div>
                  <Label className="text-xs">Апартамент(ы) уборки</Label>
                  <ApartmentMultiSelect
                    value={cleaningApartments}
                    onChange={setCleaningApartments}
                    options={APARTMENTS}
                  />
                </div>
                <div>
                  <Label className="text-xs">Дата(ы) уборки</Label>
                  <MultiDatePicker dates={cleaningDates} onChange={setCleaningDates} />
                </div>
              </>
            )}

            <div className={showForm === "expense" ? "md:col-span-2" : "md:col-span-2"}>
              <Label className="text-xs">Описание</Label>
              <Textarea placeholder="Описание операции (необязательно)" value={description}
                onChange={e => setDescription(e.target.value)} className="min-h-[60px]" />
            </div>

            {/* Receipt upload for expenses — with OCR auto-fill */}
            {showForm === "expense" && (
              <div className="md:col-span-2 space-y-2">
                <Label className="text-xs">Фото чека {isOcrLoading && <span className="text-primary ml-1 animate-pulse">🔍 Анализирую...</span>}</Label>
                <input ref={receiptCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptSelected(f); if (receiptCameraRef.current) receiptCameraRef.current.value = ""; }} />
                <input ref={receiptGalleryRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptSelected(f); if (receiptGalleryRef.current) receiptGalleryRef.current.value = ""; }} />
                {receiptPreview ? (
                  <div className="flex items-start gap-3">
                    <div className="relative inline-block">
                      <img src={receiptPreview} alt="Чек" className="h-24 rounded-lg border object-cover cursor-pointer" onClick={() => setViewingReceipt(receiptPreview)} />
                      <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); setStoreNotes(null); }}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {storeNotes && (
                      <div className="flex-1 text-xs space-y-1 p-2 rounded-lg bg-amber-50 border border-amber-200">
                        {storeNotes.name && <p className="font-semibold text-amber-800">🏪 {storeNotes.name}</p>}
                        <div className="flex flex-wrap gap-2">
                          {storeNotes.phone && (
                            <a href={`tel:${storeNotes.phone.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              📞 {storeNotes.phone}
                            </a>
                          )}
                          {storeNotes.website && (
                            <a href={storeNotes.website.startsWith("http") ? storeNotes.website : `https://${storeNotes.website}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              🌐 {storeNotes.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                          {storeNotes.maps && (
                            <a href={storeNotes.maps} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              📍 Карта
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
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

            {/* Bank statement import for income — use the standalone panel (Upload button above) */}
            {showForm === "income" && parsedBankTx.length === 0 && (
              <div className="md:col-span-2">
                <button type="button" onClick={() => { setShowForm(null); setShowBankImport(true); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed text-sm text-primary hover:bg-primary/5 transition-colors">
                  <Upload className="h-4 w-4" />
                  📊 Импортировать из банковской выписки (скриншот или PDF)
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
            <Button size="sm" disabled={isSubmitting || isOcrLoading} onClick={handleSubmit}
              style={showForm === "income"
                ? { background: "hsl(142 71% 40%)", color: "white" }
                : { background: "hsl(0 72% 50%)", color: "white" }
              }>
              {isSubmitting ? "Сохранение..." : isOcrLoading ? "Анализ чека..." : "Сохранить"}
            </Button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Поиск по описанию / тексту чека..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterHasReceipt(f => !f)}
          className={cn(
            "h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
            filterHasReceipt ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
          )}>
          <Receipt className="h-3.5 w-3.5" />
          С чеком
        </button>
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
        {(filterText || dateFrom || dateTo || filterHasReceipt || filterType !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterText(""); setDateFrom(undefined); setDateTo(undefined); setFilterHasReceipt(false); setFilterType("all"); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Очистить
          </Button>
        )}
      </div>

      {/* Receipt viewer modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { setViewingReceipt(null); setViewingReceiptText(null); }}>
          <div className="relative max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setViewingReceipt(null); setViewingReceiptText(null); }}
              className="absolute -top-3 -right-3 bg-white text-black rounded-full w-7 h-7 flex items-center justify-center shadow-lg z-10">
              <X className="h-4 w-4" />
            </button>
            <img src={viewingReceipt} alt="Чек" className="rounded-xl w-full object-contain shadow-2xl" />
            {/* OCR text with highlight */}
            {viewingReceiptText && (
              <div className="rounded-xl bg-background border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Текст чека
                </p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap">
                  {filterText
                    ? viewingReceiptText.split(new RegExp(`(${filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, idx) =>
                        part.toLowerCase() === filterText.toLowerCase()
                          ? <mark key={idx} className="bg-yellow-300 text-yellow-900 rounded px-0.5">{part}</mark>
                          : part
                      )
                    : viewingReceiptText
                  }
                </p>
              </div>
            )}
            {filterText && !viewingReceiptText && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" />
                Поиск: «{filterText}» — текст чека пока не распознан (OCR обрабатывается)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transactions table */}
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
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Место выдачи</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Описание</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Чек</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Остаток</th>
                {isAdminOrCoord && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
      {filtered.map((tx, i) => (
                 <tr key={tx.id} className={cn("border-b last:border-0 group", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                   <td className="px-3 py-2 whitespace-nowrap text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors"
                     onClick={() => handleCellFilter(format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru }))}>
                     {format(new Date(tx.transaction_date), "dd.MM.yy", { locale: ru })}
                   </td>
                   <td className="px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                     onClick={() => handleCellFilter(tx.transaction_type === "income" ? "приход" : "расход")}>
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
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                      style={{ color: tx.transaction_type === "income" ? "hsl(142 71% 30%)" : "hsl(0 72% 40%)" }}
                      onClick={() => handleCellFilter(String(tx.amount))}>
                      {tx.transaction_type === "income" ? "+" : "-"}{Number(tx.amount).toFixed(2)}€
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => handleCellFilter(tx.counterparty || "")}>
                      {tx.counterparty || <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => handleCellFilter((tx as any).location || "")}>
                      {(tx as any).location || <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => handleCellFilter(tx.description?.slice(0, 30))}>
                      {tx.description}
                    </td>
                   <td className="px-3 py-2 text-center">
                     {tx.receipt_url ? (
                       <button
                         onClick={() => { setViewingReceipt(tx.receipt_url!); setViewingReceiptText((tx as any).receipt_text || null); }}
                         className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
                         title="Посмотреть чек"
                       >
                         <Receipt className="h-3.5 w-3.5" />
                       </button>
                     ) : (
                       <span className="opacity-20 text-xs">—</span>
                     )}
                   </td>
                   <td className={cn("px-3 py-2 text-right font-bold whitespace-nowrap",
                     tx.balance >= 0 ? "text-primary" : "text-destructive")}>
                     {(tx.balance || 0).toFixed(2)}€
                   </td>
                   {isAdminOrCoord && (
                     <td className="px-2 py-2 whitespace-nowrap">
                       <div className="flex gap-1">
                         <button onClick={() => openEditModal(tx)} className="text-xs text-muted-foreground hover:text-primary p-1" title="Редактировать"><Pencil className="h-3.5 w-3.5" /></button>
                         <button onClick={() => deleteTransaction(tx.id)} className="text-xs text-muted-foreground hover:text-destructive p-1" title="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
                       </div>
                     </td>
                   )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Report buttons */}
      <div className="pt-2 flex justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-2 text-sm" onClick={sendTelegramReport}>
          <span className="text-base leading-none">✈️</span>
          Telegram
        </Button>
        <Button variant="outline" size="sm" className="gap-2 text-sm" onClick={sendEmailReport}>
          <Send className="h-4 w-4" />
          Email отчёт
        </Button>
      </div>

      {/* Full edit modal */}
      {editingTxModal && (
        <TransactionEditModal
          tx={editingTxModal}
          currentUserId={currentUserId}
          cashType="emma"
          counterpartySuggestions={counterparties}
          categorySuggestions={expenseCategories}
          onSave={fetchAll}
          onClose={() => setEditingTxModal(null)}
        />
      )}
    </div>
  );
}
