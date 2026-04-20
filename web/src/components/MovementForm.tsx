import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, Loader2, Upload, X, Zap } from "lucide-react";
import { invoke } from "@/lib/invoke";

const locationOptions = [
  { value: "piral_1", label: "Пераль 1" },
  { value: "piral_2", label: "Пераль 2" },
  { value: "salvador", label: "Сальвадор" },
  { value: "dirty_linen_piral", label: "Пераль грязное бельё" },
  { value: "dirty_linen_salvador", label: "Сальвадор грязное бельё" },
  { value: "clean_linen_piral", label: "Пераль кладовка" },
  { value: "clean_linen_salvador", label: "Сальвадор шкаф" },
  { value: "albert_laundry", label: "Прачечная Альберт" },
  { value: "purchase", label: "Закупка" },
  { value: "damaged", label: "Испорченное/украденное" },
];

const itemTypeOptions = [
  { value: "sheets", label: "Простыни" },
  { value: "duvet_covers", label: "Пододеяльники" },
  { value: "pillowcases", label: "Наволочки" },
  { value: "large_towels", label: "Большие полотенца" },
  { value: "small_towels", label: "Маленькие полотенца" },
  { value: "kitchen_towels", label: "Кухонное полотенце" },
  { value: "rugs", label: "Коврик" },
  { value: "beach_mat", label: "Подстилка пляж" },
  { value: "mattress_pad", label: "Наматрасник" },
];

interface MovementFormProps {
  onSuccess: () => void;
}

export default function MovementForm({ onSuccess }: MovementFormProps) {
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({
    sheets: "",
    duvet_covers: "",
    pillowcases: "",
    large_towels: "",
    small_towels: "",
    kitchen_towels: "",
    rugs: "",
    beach_mat: "",
    mattress_pad: "",
  });
  const [notes, setNotes] = useState("");
  const [purchaseLocation, setPurchaseLocation] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [largeStainCount, setLargeStainCount] = useState(0);
  const [smallStainCount, setSmallStainCount] = useState(0);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // Listen for smart voice fill events
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data.from_location) setFromLocation(data.from_location);
      if (data.to_location) setToLocation(data.to_location);
      if (data.items) {
        const newQty: Record<string, string> = {};
        data.items.forEach((item: { item_type: string; quantity: number }) => {
          newQty[item.item_type] = item.quantity.toString();
        });
        setQuantities(prev => ({ ...prev, ...newQty }));
      }
      if (data.notes) setNotes(data.notes);
      // Scroll to form so user sees the filled fields
      setTimeout(() => {
        const el = document.getElementById("movement-form");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      toast.success("Форма заполнена — проверьте и нажмите «Добавить» ✨");
    };
    window.addEventListener("smart-voice-fill-movement", handler);
    return () => window.removeEventListener("smart-voice-fill-movement", handler);
  }, []);

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    
    const sourceLocation = fromLocation === 'albert_laundry' 
      ? 'albert_laundry' 
      : fromLocation;

    try {
      const newQuantities: Record<string, string> = {};
      
      for (const itemType of itemTypeOptions) {
        const { data: currentQty, error } = await supabase
          .rpc('get_current_inventory', {
            p_location: sourceLocation as any,
            p_item_type: itemType.value as any
          });

        if (error) {
          console.error('Error fetching inventory:', error);
          toast.error(`Ошибка при получении остатков для ${itemType.label}`);
          continue;
        }

        if (currentQty > 0) {
          newQuantities[itemType.value] = currentQty.toString();
        }
      }
      
      setQuantities(prev => ({ ...prev, ...newQuantities }));
      toast.success('Количества заполнены автоматически');
    } catch (error) {
      console.error('Error auto-filling:', error);
      toast.error('Ошибка при автозаполнении');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromLocation || !toLocation) {
      toast.error("Пожалуйста, выберите места перемещения");
      return;
    }

    if (fromLocation === toLocation) {
      toast.error("Место отправления и назначения не могут совпадать");
      return;
    }

    if (fromLocation === 'purchase' && !purchaseLocation) {
      toast.error("Укажите место приобретения для закупки");
      return;
    }

    // Laundry pricing
    const isFromLaundry = fromLocation === 'albert_laundry';
    const laundryPrices: Record<string, number> = {
      bedding_set: 6.6,
      towel_set: 2,
      pillowcases: 0.75,
      duvet_covers: 4,
      large_towels: 1.5,
      small_towels: 0.75,
      sheets: 4, // Fallback for sheets
      kitchen_towels: 0.75,
      rugs: 2,
    };

    // Determine if weekend (Saturday = 6, Sunday = 0)
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    const deliveryCost = isFromLaundry ? (isWeekend ? 22 : 15) : 0;

    // Collect all items with quantities > 0
    const itemsToMove = Object.entries(quantities)
      .filter(([_, qty]) => {
        if (!qty) return false;
        // Calculate sum from semicolon/comma separated values
        const sum = qty
          .split(/[;,]/)
          .map((v) => parseInt(v.trim()) || 0)
          .reduce((acc, val) => acc + val, 0);
        return sum > 0;
      })
      .map(([itemType, qty]) => {
        // Calculate sum from semicolon/comma separated values
        const sum = qty
          .split(/[;,]/)
          .map((v) => parseInt(v.trim()) || 0)
          .reduce((acc, val) => acc + val, 0);
        const baseItem = {
          from_location: fromLocation as any,
          to_location: toLocation as any,
          item_type: itemType as any,
          quantity: sum,
          notes: notes || null,
          purchase_location: fromLocation === 'purchase' ? purchaseLocation : null,
          receipt_url: null as string | null,
        };

        if (isFromLaundry) {
          const itemCost = laundryPrices[itemType] || 0;
          const laundryItemCost = itemCost * sum;
          const largeStainCost = largeStainCount * 3;
          const smallStainCost = smallStainCount * 1.5;
          const totalLaundryCost = laundryItemCost + deliveryCost + largeStainCost + smallStainCost + manualAdjustment;

          return {
            ...baseItem,
            laundry_item_cost: laundryItemCost,
            delivery_cost: deliveryCost,
            large_stain_count: largeStainCount,
            small_stain_count: smallStainCount,
            large_stain_cost: largeStainCost,
            small_stain_cost: smallStainCost,
            manual_adjustment: manualAdjustment,
            total_laundry_cost: totalLaundryCost,
          };
        }

        return baseItem;
      });

    if (itemsToMove.length === 0) {
      toast.error("Укажите хотя бы одно количество больше нуля");
      return;
    }

    setIsSubmitting(true);

    // Upload receipt if provided
    let receiptUrl: string | null = null;
    if (receiptFile && fromLocation === 'purchase') {
      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, receiptFile);

      if (uploadError) {
        console.error('Error uploading receipt:', uploadError);
        toast.error("Ошибка при загрузке фото чека");
        setIsSubmitting(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      receiptUrl = publicUrl;
      
      // Update all items with receipt URL
      itemsToMove.forEach(item => {
        item.receipt_url = receiptUrl;
      });
    }

    // Check if source location has enough items (skip for purchase location)
    if (fromLocation !== 'purchase') {
      for (const item of itemsToMove) {
        const { data: currentQty, error: qtyError } = await supabase
          .rpc('get_current_inventory', {
            p_location: item.from_location,
            p_item_type: item.item_type
          });

        if (qtyError) {
          console.error('Error checking inventory:', qtyError);
          toast.error("Ошибка при проверке остатков");
          setIsSubmitting(false);
          return;
        }

        if (currentQty < item.quantity) {
          const itemName = itemTypeOptions.find(opt => opt.value === item.item_type)?.label;
          const locationName = locationOptions.find(opt => opt.value === fromLocation)?.label;
          toast.error(`Недостаточно "${itemName}" на складе "${locationName}". Доступно: ${currentQty}, требуется: ${item.quantity}`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    const { data: insertedData, error } = await supabase
      .from("movements")
      .insert(itemsToMove)
      .select();

    if (error) {
      setIsSubmitting(false);
      toast.error("Ошибка при добавлении перемещения");
      console.error("Error inserting movement:", error);
      return;
    }

    toast.success(`Перемещение успешно добавлено (${itemsToMove.length} ${itemsToMove.length === 1 ? 'тип' : 'типов'})`);

    // Send WhatsApp + Email notifications (fire and forget)
    if (insertedData && insertedData.length > 0) {
      const fromLabel = locationOptions.find(o => o.value === fromLocation)?.label || fromLocation;
      const toLabel = locationOptions.find(o => o.value === toLocation)?.label || toLocation;
      const timestamp = new Date().toISOString();

      const movementDetails = {
        from: fromLocation,
        to: toLocation,
        items: itemsToMove.map(item => ({
          type: item.item_type,
          quantity: item.quantity,
        })),
        notes: notes || undefined,
        timestamp,
      };

      // Build email HTML
      const itemRows = itemsToMove.map(item => {
        const itemLabel = itemTypeOptions.find(o => o.value === item.item_type)?.label || item.item_type;
        return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${itemLabel}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right"><strong>${item.quantity} шт.</strong></td></tr>`;
      }).join('');

      const emailHtml = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#2d6a4f">🔄 Новое перемещение белья</h2>
          <p><strong>📍 Откуда:</strong> ${fromLabel}</p>
          <p><strong>📍 Куда:</strong> ${toLabel}</p>
          <p><strong>🕐 Время:</strong> ${new Date(timestamp).toLocaleString('ru-RU')}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:12px">
            <thead><tr style="background:#f0f0f0"><th style="padding:6px 8px;text-align:left">Товар</th><th style="padding:6px 8px;text-align:right">Кол-во</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          ${notes ? `<p style="margin-top:12px"><strong>📝 Заметки:</strong> ${notes}</p>` : ''}
        </div>
      `;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Fire Telegram auto-notifications (non-blocking)
      invoke("send-telegram-notification", {
        body: {
          trigger_page: "бельё",
          event_data: {
            movement: {
              from_location: fromLocation,
              to_location: toLocation,
              items: itemsToMove.map(i => ({ item_type: i.item_type, quantity: i.quantity })),
            },
          },
        },
      }).catch(e => console.error("Telegram notification error:", e));

      // Send both WhatsApp and Email in parallel (non-blocking)
      Promise.all([
        fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ to: '+4917622750745', movementDetails, movementId: insertedData[0]?.id }),
        }).then(r => r.json()).then(d => {
          if (d.success) toast.success('WhatsApp отправлен ✓', { duration: 2000 });
        }).catch(e => console.error('WhatsApp error:', e)),

        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            to: 'georgen77@gmail.com',
            subject: `Перемещение белья: ${fromLabel} → ${toLabel}`,
            html: emailHtml,
          }),
        }).then(r => r.json()).then(d => {
          if (d.success) toast.success('Email отправлен ✓', { duration: 2000 });
        }).catch(e => console.error('Email error:', e)),
      ]);
    }

    setIsSubmitting(false);

    // Reset form
    setFromLocation("");
    setToLocation("");
    setQuantities({
      sheets: "",
      duvet_covers: "",
      pillowcases: "",
      large_towels: "",
      small_towels: "",
      kitchen_towels: "",
      rugs: "",
      beach_mat: "",
      mattress_pad: "",
    });
    setNotes("");
    setPurchaseLocation("");
    setReceiptFile(null);
    setLargeStainCount(0);
    setSmallStainCount(0);
    setManualAdjustment(0);
    
    onSuccess();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if file is an image
      if (!file.type.startsWith('image/')) {
        toast.error("Пожалуйста, выберите изображение");
        return;
      }
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Размер файла не должен превышать 5MB");
        return;
      }
      setReceiptFile(file);
    }
  };

  return (
    <Card id="movement-form" className="bg-[hsl(var(--card)/0.65)] backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Новое перемещение</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="from-location">Откуда</Label>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger id="from-location">
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end justify-center pb-2">
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-location">Куда</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger id="to-location">
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Количество по типам белья</Label>
              {fromLocation && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  disabled={isAutoFilling}
                >
                  {isAutoFilling ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Заполнение...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-3 w-3" />
                      Заполнить всё
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {itemTypeOptions.map((option) => {
                const rawValue = quantities[option.value];
                const sum = rawValue
                  ? rawValue
                      .split(/[;,]/)
                      .map((v) => parseInt(v.trim()) || 0)
                      .reduce((acc, val) => acc + val, 0)
                  : 0;

                return (
                  <div key={option.value} className="flex items-center gap-3">
                    <Label htmlFor={option.value} className="flex-1 text-sm">
                      {option.label}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={option.value}
                        type="text"
                        value={quantities[option.value]}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow numbers, semicolons, commas, and spaces
                          if (value === '' || /^[\d;,\s]+$/.test(value)) {
                            setQuantities({ ...quantities, [option.value]: value });
                          }
                        }}
                        placeholder="1;2;3"
                        className="w-32"
                      />
                      {rawValue && /[;,]/.test(rawValue) && (
                        <span className="text-sm font-medium text-primary min-w-[2rem]">
                          = {sum}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {fromLocation === 'purchase' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="purchase-location">Место приобретения *</Label>
                <Input
                  id="purchase-location"
                  value={purchaseLocation}
                  onChange={(e) => setPurchaseLocation(e.target.value)}
                  placeholder="Например: Магазин 'Текстиль', ул. Ленина 5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt">Фото чека (необязательно)</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="receipt"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('receipt')?.click()}
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {receiptFile ? receiptFile.name : 'Выбрать фото'}
                  </Button>
                  {receiptFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setReceiptFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Примечания (необязательно)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Добавьте примечания..."
              rows={2}
            />
          </div>

          {fromLocation === 'albert_laundry' && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <h3 className="font-medium text-sm">Учет прачечной Альберт</h3>
              
              <div className="space-y-2">
                <Label htmlFor="largeStain">Большое пятно (3 EUR за штуку)</Label>
                <Input
                  id="largeStain"
                  type="number"
                  min="0"
                  value={largeStainCount}
                  onChange={(e) => setLargeStainCount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smallStain">Малое пятно (1.5 EUR за штуку)</Label>
                <Input
                  id="smallStain"
                  type="number"
                  min="0"
                  value={smallStainCount}
                  onChange={(e) => setSmallStainCount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manualAdjustment">Ручная корректировка (EUR)</Label>
                <Input
                  id="manualAdjustment"
                  type="number"
                  step="0.01"
                  value={manualAdjustment}
                  onChange={(e) => setManualAdjustment(Number(e.target.value))}
                />
              </div>

              <div className="text-sm text-muted-foreground">
                Доставка: {(() => {
                  const today = new Date();
                  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
                  return isWeekend ? '22 EUR (выходной)' : '15 EUR (будний день)';
                })()}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 bg-card pt-2 pb-1 -mx-6 px-6 border-t mt-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Добавление...
                </>
              ) : (
                "Добавить перемещение"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
