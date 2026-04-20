import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { X, Camera, Paperclip, Receipt, Calendar, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

interface Transaction {
  id: string;
  transaction_type: "income" | "expense";
  amount: number;
  description: string;
  counterparty: string | null;
  category?: string | null;
  location?: string | null;
  transaction_date: string;
  receipt_url?: string | null;
  payment_source?: string | null;
}

interface TransactionEditModalProps {
  tx: Transaction;
  currentUserId: string;
  cashType: "emma" | "main";
  counterpartySuggestions: string[];
  categorySuggestions: string[];
  onSave: () => void;
  onClose: () => void;
}

function SimpleSelect({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  const filtered = options.filter(o => o.toLowerCase().includes(input.toLowerCase()));

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input
          value={input}
          onChange={e => { setInput(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pr-8"
        />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setOpen(o => !o)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(o => (
            <button key={o} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onClick={() => { onChange(o); setInput(o); setOpen(false); }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransactionEditModal({
  tx, currentUserId, cashType, counterpartySuggestions, categorySuggestions, onSave, onClose,
}: TransactionEditModalProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description || "");
  const [counterparty, setCounterparty] = useState(tx.counterparty || "");
  const [category, setCategory] = useState(tx.category || "");
  const [location, setLocation] = useState(tx.location || "");
  const [transactionDate, setTransactionDate] = useState<Date>(new Date(tx.transaction_date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(tx.receipt_url || null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setReceiptPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ title: "Введите корректную сумму", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      let receiptUrl: string | null = tx.receipt_url || null;

      // Upload new receipt if changed
      if (receiptFile) {
        const fileName = `${cashType}-receipts/${Date.now()}_${receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, receiptFile, { cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error("Ошибка загрузки: " + uploadError.message);
        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
        receiptUrl = urlData.publicUrl;
      }

      // If receipt was cleared
      if (!receiptPreview && !receiptFile) receiptUrl = null;

      const fnName = cashType === "emma" ? "emma-cash" : "main-cash";
      const { data, error } = await invoke(fnName, {
        body: {
          action: "update",
          userId: currentUserId,
          transactionId: tx.id,
          transactionData: {
            amount: numAmount,
            description,
            counterparty: counterparty || null,
            category: category || null,
            location: location || null,
            transaction_date: transactionDate.toISOString(),
            receipt_url: receiptUrl,
          },
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      toast({ title: "✅ Сохранено" });
      onSave();
      onClose();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div
        className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl border border-border"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10",
        )}>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-semibold px-2 py-1 rounded-full",
          tx.transaction_type === "income"
                ? "bg-[hsl(142_76%_92%)] text-[hsl(142_71%_35%)]"
                : "bg-[hsl(0_86%_92%)] text-[hsl(0_72%_40%)]"
            )}>
              {tx.transaction_type === "income" ? "➕ Приход" : "➖ Расход"}
            </span>
            <span className="text-sm font-semibold text-foreground">Редактирование</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Сумма (€)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="text-base font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Дата</Label>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <button type="button" className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/40">
                    <span>{format(transactionDate, "dd.MM.yyyy", { locale: ru })}</span>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarUI
                    mode="single"
                    selected={transactionDate}
                    onSelect={d => { if (d) { setTransactionDate(d); setShowDatePicker(false); } }}
                    locale={ru}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Counterparty */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {tx.transaction_type === "income" ? "Источник" : "Контрагент"}
            </Label>
            <SimpleSelect
              value={counterparty}
              onChange={setCounterparty}
              options={counterpartySuggestions}
              placeholder="Выберите или введите..."
            />
          </div>

          {/* Category (only for expense) */}
          {tx.transaction_type === "expense" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Категория</Label>
              <SimpleSelect
                value={category}
                onChange={setCategory}
                options={categorySuggestions}
                placeholder="Категория расхода..."
              />
            </div>
          )}

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Место / Апартамент</Label>
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Era Deluxe, Oasis 1..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Описание</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="min-h-[70px] resize-none"
              placeholder="Описание транзакции..."
            />
          </div>

          {/* Receipt */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Чек / Документ</Label>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
            <input ref={galleryRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />

            {receiptPreview ? (
              <div className="relative inline-flex gap-2 items-start">
                <button onClick={() => setViewingReceipt(receiptPreview)}
                  className="relative group">
                  <img src={receiptPreview} alt="Чек" className="h-24 rounded-xl border object-cover shadow-sm" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-xl transition flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-white" />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                  className="absolute -top-1.5 -left-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                  <Camera className="h-4 w-4" /> Камера
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                  <Paperclip className="h-4 w-4" /> Галерея
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-3 sticky bottom-0 bg-background">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSaving}>
            Отмена
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Сохранение..." : (
              <><Check className="h-4 w-4 mr-1.5" /> Сохранить</>
            )}
          </Button>
        </div>
      </div>

      {/* Receipt viewer */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4" onClick={() => setViewingReceipt(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingReceipt(null)} className="absolute -top-3 -right-3 bg-white text-black rounded-full w-7 h-7 flex items-center justify-center shadow-lg z-10">
              <X className="h-4 w-4" />
            </button>
            <img src={viewingReceipt} alt="Чек" className="rounded-xl w-full object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
