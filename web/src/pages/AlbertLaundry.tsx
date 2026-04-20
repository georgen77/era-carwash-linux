import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, DollarSign, FileText, History, List, Check, X, Archive, Truck, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { invoke } from "@/lib/invoke";

interface LaundryPrice {
  id: string;
  item_key: string;
  name_ru: string;
  price: number;
  unit: string;
  active: boolean;
}

interface LaundryInvoice {
  id: string;
  invoice_number: string | null;
  period_from: string | null;
  period_to: string | null;
  invoice_amount: number | null;
  calculated_amount: number | null;
  difference: number | null;
  paid: boolean;
  invoice_file_url: string | null;
  payment_file_url: string | null;
  created_at: string;
}

interface AlbertBalance {
  items: Record<string, number>;
  calculated_cost: number;
  vat: number;
  total: number;
}

interface VisitSummary {
  id: string;
  visited_at: string;
  delivered_cost: number;
  delivered_count: number;
  picked_count: number;
  notes: string | null;
}

interface VisitDetail {
  id: string;
  visited_at: string;
  source_locations: string[];
  delivered_items: Record<string, number>;
  picked_items: Record<string, number>;
  delivered_cost: number;
  balance_after: Record<string, number>;
  dirty_remaining: Record<string, Record<string, number>>;
  notes: string | null;
}

interface FinancialBalance {
  nominal_balance: number;
  factual_balance: number;
  total_invoiced: number;
  total_paid: number;
  total_factual: number;
  discrepancy: number;
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  sheets: "Простыни", duvet_covers: "Пододеяльники", pillowcases: "Наволочки",
  large_towels: "Большие полотенца", small_towels: "Малые полотенца",
  kitchen_towels: "Кухонные полотенца", rugs: "Коврики", mattress_pad: "Наматрасники",
  beach_mat: "Пляжные коврики",
};

const LOCATION_LABELS: Record<string, string> = {
  dirty_linen_piral: "Грязное (Пирал)",
  dirty_linen_salvador: "Грязное (Сальвадор)",
};

export default function AlbertLaundry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState("prices");
  const [prices, setPrices] = useState<LaundryPrice[]>([]);
  const [invoices, setInvoices] = useState<LaundryInvoice[]>([]);
  const [balance, setBalance] = useState<AlbertBalance | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(false);

  // Visits
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<VisitDetail | null>(null);

  // Financial balance
  const [financial, setFinancial] = useState<FinancialBalance | null>(null);

  // Period filter for settlements
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    loadPrices();
    loadInvoices();
    loadBalance();
  }, []);

  useEffect(() => {
    loadMovements();
  }, [periodYear, periodMonth]);

  useEffect(() => {
    if (tab === "visits") loadVisits();
    if (tab === "finance") loadFinancial();
  }, [tab]);

  async function loadPrices() {
    const { data } = await supabase.from("laundry_prices").select("*").order("item_key");
    if (data) setPrices(data as any);
  }

  async function loadInvoices() {
    const { data } = await supabase.from("laundry_invoices").select("*").order("created_at", { ascending: false });
    if (data) setInvoices(data as any);
  }

  async function loadBalance() {
    const { data } = await invoke("bot-api", {
      body: { action: "get_albert_balance" },
    });
    if (data?.data) setBalance(data.data);
  }

  async function loadMovements() {
    const { data } = await invoke("bot-api", {
      body: { action: "get_laundry_monthly_summary", year: periodYear, month: periodMonth },
    });
    if (data?.data) setMovements(data.data);
  }

  async function loadVisits() {
    const { data } = await invoke("bot-api", {
      body: { action: "get_albert_visits", limit: 30 },
    });
    if (data?.data) setVisits(data.data);
  }

  async function loadVisitDetail(visitId: string) {
    const { data } = await invoke("bot-api", {
      body: { action: "get_albert_visit_detail", visit_id: visitId },
    });
    if (data?.data) setSelectedVisit(data.data);
  }

  async function loadFinancial() {
    const { data } = await invoke("bot-api", {
      body: { action: "get_financial_balance" },
    });
    if (data?.data) setFinancial(data.data);
  }

  async function savePrice(itemKey: string) {
    const newPrice = parseFloat(editValue);
    if (isNaN(newPrice)) return;
    setLoading(true);
    const { data } = await invoke("bot-api", {
      body: { action: "update_laundry_price", item_key: itemKey, price: newPrice },
    });
    if (data?.success) {
      toast({ title: "Цена обновлена" });
      loadPrices();
    }
    setEditingKey(null);
    setLoading(false);
  }

  async function toggleActive(item: LaundryPrice) {
    await supabase.from("laundry_prices").update({ active: !item.active }).eq("id", item.id);
    loadPrices();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">🧺 Прачечная Альберт</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="prices" className="text-xs"><List className="h-3 w-3" /></TabsTrigger>
            <TabsTrigger value="docs" className="text-xs"><FileText className="h-3 w-3" /></TabsTrigger>
            <TabsTrigger value="settle" className="text-xs"><DollarSign className="h-3 w-3" /></TabsTrigger>
            <TabsTrigger value="history" className="text-xs"><History className="h-3 w-3" /></TabsTrigger>
            <TabsTrigger value="visits" className="text-xs"><Truck className="h-3 w-3" /></TabsTrigger>
            <TabsTrigger value="finance" className="text-xs"><Calculator className="h-3 w-3" /></TabsTrigger>
          </TabsList>

          {/* PRICES TAB */}
          <TabsContent value="prices">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Прайс-лист Альберта</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {prices.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between px-4 py-2.5 ${!p.active ? "opacity-40" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name_ru}</p>
                        <p className="text-xs text-muted-foreground">{p.item_key} · {p.unit}</p>
                      </div>
                      {editingKey === p.item_key ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-20 h-7 text-sm"
                            type="number"
                            step="0.01"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && savePrice(p.item_key)}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => savePrice(p.item_key)} disabled={loading}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingKey(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingKey(p.item_key); setEditValue(String(p.price)); }}
                            className="text-sm font-semibold hover:text-primary transition-colors"
                          >
                            {p.price.toFixed(2)}€
                          </button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleActive(p)} title={p.active ? "Архивировать" : "Активировать"}>
                            <Archive className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DOCUMENTS TAB */}
          <TabsContent value="docs">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Документы</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Документов пока нет</p>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="text-sm font-medium">Счёт {inv.invoice_number ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.period_from && inv.period_to
                              ? `${format(new Date(inv.period_from), "dd.MM.yy")} — ${format(new Date(inv.period_to), "dd.MM.yy")}`
                              : format(new Date(inv.created_at), "dd.MM.yyyy")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{inv.invoice_amount?.toFixed(2) ?? "—"}€</p>
                          <Badge variant={inv.paid ? "default" : "secondary"} className="text-xs">
                            {inv.paid ? "Оплачен" : "Не оплачен"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTLEMENTS TAB */}
          <TabsContent value="settle">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Баланс у Альберта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {balance ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <p className="text-xs text-blue-600 font-medium">Наш учёт (без НДС)</p>
                        <p className="text-lg font-bold text-blue-700">{balance.calculated_cost.toFixed(2)}€</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                        <p className="text-xs text-green-600 font-medium">С НДС (21%)</p>
                        <p className="text-lg font-bold text-green-700">{balance.total.toFixed(2)}€</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Баланс у Альберта:</p>
                      {Object.entries(balance.items)
                        .filter(([, qty]) => qty !== 0)
                        .map(([type, qty]) => (
                          <div key={type} className="flex justify-between text-sm">
                            <span>{ITEM_TYPE_LABELS[type] ?? type}</span>
                            <span className={qty > 0 ? "text-orange-600 font-medium" : "text-green-600 font-medium"}>
                              {qty > 0 ? `${qty} у Альберта` : `${Math.abs(qty)} лишних`}
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Загрузка...</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">История перемещений</CardTitle>
                  <div className="flex items-center gap-1">
                    <select
                      value={periodMonth}
                      onChange={(e) => setPeriodMonth(Number(e.target.value))}
                      className="text-xs border rounded px-1 py-0.5"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {format(new Date(2024, i), "LLLL", { locale: ru })}
                        </option>
                      ))}
                    </select>
                    <select
                      value={periodYear}
                      onChange={(e) => setPeriodYear(Number(e.target.value))}
                      className="text-xs border rounded px-1 py-0.5"
                    >
                      {[2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Нет перемещений за этот период</p>
                ) : (
                  <div className="space-y-1.5">
                    {movements.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between p-2 rounded border text-sm">
                        <div className="flex items-center gap-2">
                          <span>{m.to_location === "albert_laundry" ? "📤" : "📥"}</span>
                          <div>
                            <span className="font-medium">{ITEM_TYPE_LABELS[m.item_type] ?? m.item_type}</span>
                            <span className="text-muted-foreground ml-1">×{m.quantity}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(m.created_at), "dd.MM")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VISITS TAB */}
          <TabsContent value="visits">
            {selectedVisit ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Визит {format(new Date(selectedVisit.visited_at), "dd.MM.yyyy HH:mm")}
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedVisit(null)}>← Назад</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-green-600 font-medium mb-1">📥 Привёз (постиранное)</p>
                    {Object.entries(selectedVisit.delivered_items ?? {}).map(([type, qty]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span>{ITEM_TYPE_LABELS[type] ?? type}</span>
                        <span className="font-medium">{String(qty)}</span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-green-200 text-sm font-semibold text-green-700">
                      Стоимость: {selectedVisit.delivered_cost?.toFixed(2)}€
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <p className="text-xs text-orange-600 font-medium mb-1">📤 Забрал (грязное)</p>
                    {Object.entries(selectedVisit.picked_items ?? {}).map(([type, qty]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span>{ITEM_TYPE_LABELS[type] ?? type}</span>
                        <span className="font-medium">{String(qty)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium mb-1">📦 Остаток у Альберта</p>
                    {Object.entries(selectedVisit.balance_after ?? {}).map(([type, qty]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span>{ITEM_TYPE_LABELS[type] ?? type}</span>
                        <span className="font-medium">{String(qty)}</span>
                      </div>
                    ))}
                    {Object.keys(selectedVisit.balance_after ?? {}).length === 0 && (
                      <p className="text-sm text-muted-foreground">Пусто</p>
                    )}
                  </div>

                  {Object.keys(selectedVisit.dirty_remaining ?? {}).length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-xs text-red-600 font-medium mb-1">🧺 Осталось в грязном</p>
                      {Object.entries(selectedVisit.dirty_remaining ?? {}).map(([loc, items]) => (
                        <div key={loc} className="mb-2">
                          <p className="text-xs font-medium">{LOCATION_LABELS[loc] ?? loc}</p>
                          {Object.entries(items as Record<string, number>).map(([type, qty]) => (
                            <div key={type} className="flex justify-between text-sm pl-2">
                              <span>{ITEM_TYPE_LABELS[type] ?? type}</span>
                              <span>{qty}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedVisit.notes && (
                    <p className="text-sm text-muted-foreground">📝 {selectedVisit.notes}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">История визитов Альберта</CardTitle>
                </CardHeader>
                <CardContent>
                  {visits.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Визитов пока нет</p>
                  ) : (
                    <div className="space-y-2">
                      {visits.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => loadVisitDetail(v.id)}
                          className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                {format(new Date(v.visited_at), "dd.MM.yyyy HH:mm")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                📥 Привёз: {v.delivered_count} · 📤 Забрал: {v.picked_count}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{v.delivered_cost?.toFixed(2)}€</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* FINANCIAL TAB */}
          <TabsContent value="finance">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Взаиморасчёты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {financial ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <p className="text-xs text-blue-600 font-medium">Номинальный долг</p>
                        <p className="text-xs text-muted-foreground">Счета − оплаты</p>
                        <p className="text-lg font-bold text-blue-700">{financial.nominal_balance.toFixed(2)}€</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                        <p className="text-xs text-green-600 font-medium">Фактический долг</p>
                        <p className="text-xs text-muted-foreground">Стоимость − оплаты</p>
                        <p className="text-lg font-bold text-green-700">{financial.factual_balance.toFixed(2)}€</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Всего по счетам</span>
                        <span className="font-medium">{financial.total_invoiced.toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Фактическая стоимость</span>
                        <span className="font-medium">{financial.total_factual.toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Оплачено</span>
                        <span className="font-medium">{financial.total_paid.toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-muted-foreground">Расхождение</span>
                        <span className={`font-semibold ${financial.discrepancy > 0 ? "text-red-600" : financial.discrepancy < 0 ? "text-green-600" : ""}`}>
                          {financial.discrepancy.toFixed(2)}€
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Загрузка...</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
