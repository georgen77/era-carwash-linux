import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Camera, Paperclip, X, Receipt, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from "@/integrations/supabase/client";
import { invoke } from "@/lib/invoke";

interface Movement {
  id: string;
  from_location: string;
  to_location: string;
  item_type: string;
  quantity: number;
  created_at: string;
  laundry_item_cost?: number;
  delivery_cost?: number;
  large_stain_count?: number;
  small_stain_count?: number;
  large_stain_cost?: number;
  small_stain_cost?: number;
  manual_adjustment?: number;
  total_laundry_cost?: number;
  notes?: string;
}

interface AlbertInvoice {
  id: string;
  date: string;
  amount: number;
  description: string;
  receipt_url?: string;
  receipt_text?: string;
}

interface LaundryReportProps {
  movements: Movement[];
}

const itemTypeNames: Record<string, string> = {
  sheets: 'Простыни',
  duvet_covers: 'Пододеяльники',
  pillowcases: 'Наволочки',
  large_towels: 'Большие полотенца',
  small_towels: 'Маленькие полотенца',
  kitchen_towels: 'Кухонное полотенце',
  rugs: 'Коврик',
  beach_mat: 'Пляжный коврик',
  mattress_pad: 'Наматрасник',
};

export default function LaundryReport({ movements }: LaundryReportProps) {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [appliedDateFrom, setAppliedDateFrom] = useState<Date>();
  const [appliedDateTo, setAppliedDateTo] = useState<Date>();

  // Albert invoice input
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDesc, setInvoiceDesc] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [invoices, setInvoices] = useState<AlbertInvoice[]>([]);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleQuickPeriod = (days: number) => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - days);
    setDateFrom(from);
    setDateTo(today);
  };

  const applyFilters = () => {
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
  };

  const handleFileSelect = (file: File) => {
    setInvoiceFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setInvoicePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveInvoice = async () => {
    if (!invoiceAmount) return;
    setIsUploadingInvoice(true);
    try {
      let receiptUrl: string | null = null;
      let receiptText: string | null = null;
      if (invoiceFile) {
        const fileName = `albert-invoices/${Date.now()}_${invoiceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, invoiceFile, { cacheControl: "3600", upsert: false });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(uploadData.path);
          receiptUrl = urlData.publicUrl;
          // OCR
          const reader = new FileReader();
          reader.readAsDataURL(invoiceFile);
          reader.onload = async () => {
            try {
              const { data: ocrData } = await invoke("ocr-receipt", {
                body: { imageBase64: reader.result as string, transactionId: "albert_" + Date.now() },
              });
              if (ocrData?.text) receiptText = ocrData.text;
            } catch {}
          };
        }
      }
      const newInvoice: AlbertInvoice = {
        id: Date.now().toString(),
        date: invoiceDate.toISOString(),
        amount: parseFloat(invoiceAmount),
        description: invoiceDesc || "Счёт прачечной Альберт",
        receipt_url: receiptUrl || undefined,
        receipt_text: receiptText || undefined,
      };
      setInvoices(prev => [newInvoice, ...prev]);
      setInvoiceAmount("");
      setInvoiceDesc("");
      setInvoiceFile(null);
      setInvoicePreview(null);
      setShowInvoiceForm(false);
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const reportData = useMemo(() => {
    let filtered = movements.filter(m =>
      m.from_location === 'albert_laundry' &&
      m.total_laundry_cost !== null &&
      m.total_laundry_cost !== undefined
    );

    if (appliedDateFrom) filtered = filtered.filter(m => new Date(m.created_at) >= appliedDateFrom);
    if (appliedDateTo) {
      const endOfDay = new Date(appliedDateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(m => new Date(m.created_at) <= endOfDay);
    }

    const totalCost = filtered.reduce((sum, m) => sum + (m.total_laundry_cost || 0), 0);
    const totalItemCost = filtered.reduce((sum, m) => sum + (m.laundry_item_cost || 0), 0);
    const totalDeliveryCost = filtered.reduce((sum, m) => sum + (m.delivery_cost || 0), 0);
    const totalLargeStainCost = filtered.reduce((sum, m) => sum + (m.large_stain_cost || 0), 0);
    const totalSmallStainCost = filtered.reduce((sum, m) => sum + (m.small_stain_cost || 0), 0);
    const totalAdjustments = filtered.reduce((sum, m) => sum + (m.manual_adjustment || 0), 0);

    const byItemType: Record<string, { quantity: number; cost: number }> = {};
    filtered.forEach(m => {
      if (!byItemType[m.item_type]) byItemType[m.item_type] = { quantity: 0, cost: 0 };
      byItemType[m.item_type].quantity += m.quantity;
      byItemType[m.item_type].cost += m.laundry_item_cost || 0;
    });

    const totalInvoices = invoices.reduce((s, i) => s + i.amount, 0);

    return { movements: filtered, totalCost, totalItemCost, totalDeliveryCost, totalLargeStainCost, totalSmallStainCost, totalAdjustments, byItemType, totalInvoices };
  }, [movements, appliedDateFrom, appliedDateTo, invoices]);

  const balance = reportData.totalCost - reportData.totalInvoices;

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">Взаиморасчёты с Прачечной Альберт</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Albert laundry current inventory */}
        {(() => {
          const albertItems = new Map<string, number>();
          movements.forEach(m => {
            if (m.to_location === 'albert_laundry') {
              albertItems.set(m.item_type, (albertItems.get(m.item_type) || 0) + m.quantity);
            }
            if (m.from_location === 'albert_laundry') {
              albertItems.set(m.item_type, (albertItems.get(m.item_type) || 0) - m.quantity);
            }
          });
          const items = Array.from(albertItems.entries()).filter(([, qty]) => qty > 0);
          if (items.length === 0) return null;
          return (
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                🏭 Остатки на складе прачечной Альберт
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(([itemType, qty]) => (
                  <div key={itemType} className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-background border text-xs">
                    <span className="text-muted-foreground">{itemTypeNames[itemType] || itemType}</span>
                    <span className="font-bold">{qty} шт.</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Albert invoice input */}
        <div className="rounded-xl border-2 border-dashed border-primary/30 p-4 space-y-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">📄 Счета от Альберта</p>
            <button
              onClick={() => setShowInvoiceForm(v => !v)}
              className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
            >
              {showInvoiceForm ? "Скрыть" : "+ Добавить счёт"}
            </button>
          </div>

          {showInvoiceForm && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Сумма (€)</label>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Дата</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-background">
                        <span>{format(invoiceDate, "dd.MM.yyyy", { locale: ru })}</span>
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={invoiceDate} onSelect={d => d && setInvoiceDate(d)} initialFocus locale={ru} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Описание</label>
                <input
                  type="text" placeholder="Счёт №..."
                  value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>

              {/* File attachment */}
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-primary font-medium">
                  <Camera className="h-3.5 w-3.5" /> Камера
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 transition font-medium">
                  <Receipt className="h-3.5 w-3.5" /> Галерея
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-muted hover:bg-muted/40 transition font-medium">
                  <Paperclip className="h-3.5 w-3.5" /> Файл
                </button>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
                <input ref={galleryRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
              </div>

              {invoicePreview && (
                <div className="relative inline-block">
                  <img src={invoicePreview} alt="preview" className="h-24 rounded-lg border object-cover" />
                  <button onClick={() => { setInvoiceFile(null); setInvoicePreview(null); }}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveInvoice} disabled={!invoiceAmount || isUploadingInvoice}>
                  {isUploadingInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Сохранить счёт
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInvoiceForm(false)}>Отмена</Button>
              </div>
            </div>
          )}

          {/* Invoices list */}
          {invoices.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border text-sm">
                  <div>
                    <p className="font-medium">{inv.description}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(inv.date), "dd.MM.yyyy", { locale: ru })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.receipt_url && (
                      <a href={inv.receipt_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">📎</a>
                    )}
                    <span className="font-bold text-destructive">{inv.amount.toFixed(2)}€</span>
                    <button onClick={() => setInvoices(p => p.filter(i => i.id !== inv.id))} className="text-muted-foreground hover:text-destructive transition">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/50 text-sm font-semibold">
                <span>Итого счетов Альберта:</span>
                <span className="text-destructive">{reportData.totalInvoices.toFixed(2)}€</span>
              </div>
            </div>
          )}
        </div>

        {/* Balance vs our costs */}
        {(reportData.totalCost > 0 || reportData.totalInvoices > 0) && (
          <div className={`rounded-xl border-2 p-4 flex items-center justify-between ${balance > 5 ? "border-destructive/40 bg-destructive/5" : balance < -5 ? "border-success/40 bg-success/5" : "border-primary/30 bg-primary/5"}`}>
            <div>
              <p className="text-sm text-muted-foreground">Баланс взаиморасчётов</p>
              <p className="text-xs text-muted-foreground">Наш учёт: {reportData.totalCost.toFixed(2)}€ / Счета Альберта: {reportData.totalInvoices.toFixed(2)}€</p>
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold ${balance > 5 ? "text-destructive" : balance < -5 ? "text-success" : "text-primary"}`}>
                {balance > 0 ? "+" : ""}{balance.toFixed(2)}€
              </p>
              <p className="text-xs text-muted-foreground">{balance > 5 ? "Переплата нам" : balance < -5 ? "Долг нам" : "Сходится ✓"}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map(d => (
              <Button key={d} variant="outline" size="sm" onClick={() => handleQuickPeriod(d)}>
                {d === 7 ? "Неделя" : d === 30 ? "Месяц" : "3 месяца"}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>Сбросить</Button>
          </div>
          <div className="flex flex-wrap gap-4">
            {[{ label: "Дата от", date: dateFrom, setDate: setDateFrom }, { label: "Дата до", date: dateTo, setDate: setDateTo }].map(({ label, date, setDate }) => (
              <Popover key={label}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP', { locale: ru }) : label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={ru} />
                </PopoverContent>
              </Popover>
            ))}
            <Button onClick={applyFilters}>Применить</Button>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="font-semibold">Наш учёт — итого по периоду</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Заказов", value: reportData.movements.length, unit: "" },
              { label: "Общая сумма", value: reportData.totalCost.toFixed(2), unit: " EUR" },
              { label: "Стирка", value: reportData.totalItemCost.toFixed(2), unit: " EUR" },
              { label: "Доставка", value: reportData.totalDeliveryCost.toFixed(2), unit: " EUR" },
              { label: "Большие пятна", value: reportData.totalLargeStainCost.toFixed(2), unit: " EUR" },
              { label: "Малые пятна", value: reportData.totalSmallStainCost.toFixed(2), unit: " EUR" },
            ].map(({ label, value, unit }) => (
              <div key={label} className="p-3 bg-muted rounded-xl text-center">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-bold">{value}{unit}</div>
              </div>
            ))}
          </div>

          {Object.keys(reportData.byItemType).length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-sm">По типам предметов</h4>
              <div className="space-y-1.5">
                {Object.entries(reportData.byItemType).map(([itemType, data]) => (
                  <div key={itemType} className="flex justify-between items-center p-2.5 bg-muted rounded-lg text-sm">
                    <span>{itemTypeNames[itemType] || itemType}</span>
                    <span className="font-semibold">{data.quantity} шт. · {data.cost.toFixed(2)} EUR</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reportData.movements.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-sm">Детализация</h4>
              <div className="space-y-2">
                {reportData.movements.map((movement) => (
                  <div key={movement.id} className="p-3 border rounded-xl space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{itemTypeNames[movement.item_type] || movement.item_type}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(movement.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}</div>
                        <div className="text-xs">× {movement.quantity} шт.</div>
                      </div>
                      <div className="font-bold text-base">{movement.total_laundry_cost?.toFixed(2)} EUR</div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-3 border-l-2 border-muted">
                      <div>Стирка: {movement.laundry_item_cost?.toFixed(2)} EUR · Доставка: {movement.delivery_cost?.toFixed(2)} EUR</div>
                      {(movement.large_stain_count || 0) > 0 && <div>Большие пятна: {movement.large_stain_count} × 3 = {movement.large_stain_cost?.toFixed(2)} EUR</div>}
                      {(movement.small_stain_count || 0) > 0 && <div>Малые пятна: {movement.small_stain_count} × 1.5 = {movement.small_stain_cost?.toFixed(2)} EUR</div>}
                      {(movement.manual_adjustment || 0) !== 0 && <div className="text-amber-600">Корректировка: {movement.manual_adjustment! > 0 ? "+" : ""}{movement.manual_adjustment?.toFixed(2)} EUR</div>}
                    </div>
                    {movement.notes && <div className="text-xs text-muted-foreground italic">📝 {movement.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {reportData.movements.length === 0 && (
            <div className="text-center text-muted-foreground py-8">Нет данных за выбранный период</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
