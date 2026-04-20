import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Upload, ArrowLeft, Loader2, CheckCircle2, X, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

// ── Types ──────────────────────────────────────────────────────────────────

interface MovementData {
  type: "movement";
  from_location: string;
  to_location: string;
  items: Record<string, number>;
  notes: string;
}

interface ExpenseData {
  type: "expense";
  contractor: string;
  apartment: string;
  amount: number;
  category: string;
  notes: string;
}

type RecognizedData = MovementData | ExpenseData;

// ── Constants ─────────────────────────────────────────────────────────────

const ITEM_LABELS: Record<string, string> = {
  sheets: "Простыни",
  duvet_covers: "Пододеяльники",
  pillowcases: "Наволочки",
  large_towels: "Большие полотенца",
  small_towels: "Маленькие полотенца",
  kitchen_towels: "Кухонное полотенце",
  rugs: "Коврик",
  beach_mat: "Подстилка пляж",
  mattress_pad: "Наматрасник",
};

const ALL_ITEMS = Object.keys(ITEM_LABELS);

const LOCATION_LABELS: Record<string, string> = {
  piral_1: "Oasis 1",
  piral_2: "Oasis 2",
  grande: "Oasis Grande",
  salvador: "Salvador",
  dirty_linen_piral: "Пераль грязное",
  dirty_linen_salvador: "Сальвадор грязное",
  clean_linen_piral: "Пераль чистое",
  clean_linen_salvador: "Сальвадор чистое",
  albert_laundry: "Прачечная",
};

const LOCATION_OPTIONS = [
  "piral_1", "piral_2", "grande", "salvador",
  "dirty_linen_piral", "dirty_linen_salvador",
  "clean_linen_piral", "clean_linen_salvador", "albert_laundry",
];

// ── Component ─────────────────────────────────────────────────────────────

const ScanLinen = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recognized, setRecognized] = useState<RecognizedData | null>(null);
  const [editedData, setEditedData] = useState<RecognizedData | null>(null);
  const [saved, setSaved] = useState(false);

  const getCurrentUserId = () => {
    const userStr = sessionStorage.getItem("cleaning_user");
    if (!userStr) return null;
    try { return JSON.parse(userStr).id; } catch { return null; }
  };

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Только изображения", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      setImageBase64(base64);
      setRecognized(null);
      setEditedData(null);
      setSaved(false);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleRecognize = async () => {
    if (!imageBase64) return;
    setIsProcessing(true);
    try {
      const { data, error } = await invoke("scan-linen", {
        body: { action: "recognize", imageBase64 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Ошибка распознавания");

      const result = data.data as RecognizedData;

      // Ensure all item keys are present for movement type
      if (result.type === "movement") {
        const fullItems: Record<string, number> = {};
        for (const key of ALL_ITEMS) fullItems[key] = result.items?.[key] ?? 0;
        result.items = fullItems;
      }

      setRecognized(result);
      setEditedData(JSON.parse(JSON.stringify(result)));
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!editedData) return;
    setIsSaving(true);
    try {
      const userId = getCurrentUserId();

      if (editedData.type === "movement") {
        const { data, error } = await invoke("scan-linen", {
          body: { action: "save_movement", data: editedData, userId },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Ошибка сохранения");
        toast({ title: "✅ Перемещение сохранено", description: "Ожидает подтверждения. Ирочка уведомлена." });
      } else {
        if (!userId) throw new Error("Необходима авторизация");
        const { data, error } = await invoke("scan-linen", {
          body: { action: "save_expense", data: editedData, userId },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Ошибка сохранения");
        toast({ title: "✅ Расход сохранён", description: "Ирочка уведомлена." });
      }

      setSaved(true);
    } catch (err: any) {
      toast({ title: "Ошибка сохранения", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setImageBase64(null);
    setRecognized(null);
    setEditedData(null);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const updateMovementItem = (key: string, value: string) => {
    if (!editedData || editedData.type !== "movement") return;
    setEditedData({
      ...editedData,
      items: { ...editedData.items, [key]: Math.max(0, parseInt(value) || 0) },
    });
  };

  const updateExpenseField = (field: string, value: string | number) => {
    if (!editedData || editedData.type !== "expense") return;
    setEditedData({ ...editedData, [field]: value });
  };

  const updateMovementField = (field: string, value: string) => {
    if (!editedData || editedData.type !== "movement") return;
    setEditedData({ ...editedData, [field]: value });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h1 className="text-base font-bold tracking-tight">Сканировать записку</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Upload zone */}
        {!imagePreview ? (
          <div
            className="relative rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/30 cursor-pointer"
            style={{ minHeight: 220 }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Загрузите фото записки</p>
                <p className="text-xs text-muted-foreground mt-1">Нажмите или перетащите файл</p>
              </div>
              <div className="flex gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <Upload className="h-3.5 w-3.5" />Галерея
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                >
                  <Camera className="h-3.5 w-3.5" />Камера
                </Button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInput} />
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-border shadow-sm relative">
            <img src={imagePreview} alt="Записка" className="w-full object-cover max-h-72" />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 backdrop-blur-sm"
              onClick={handleReset}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Recognize button */}
        {imagePreview && !recognized && !saved && (
          <Button
            className="w-full gap-2 h-12 text-base font-semibold"
            onClick={handleRecognize}
            disabled={isProcessing}
          >
            {isProcessing
              ? <><Loader2 className="h-5 w-5 animate-spin" />Распознаю…</>
              : <><ScanLine className="h-5 w-5" />Распознать ИИ</>
            }
          </Button>
        )}

        {/* ── SAVED STATE ── */}
        {saved && (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="font-bold text-foreground">Сохранено!</p>
            <p className="text-sm text-muted-foreground">Ирочка получила уведомление</p>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Сканировать ещё
              </Button>
              <Button size="sm" onClick={() => navigate(-1)}>Назад</Button>
            </div>
          </div>
        )}

        {/* ── RECOGNITION RESULT ── */}
        {editedData && !saved && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{editedData.type === "movement" ? "🧺" : "💸"}</span>
                <span className="font-bold text-foreground">
                  {editedData.type === "movement" ? "Перемещение белья" : "Расход на клининг"}
                </span>
              </div>
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                editedData.type === "movement"
                  ? "bg-primary/15 text-primary"
                  : "bg-destructive/15 text-destructive"
              )}>
                {editedData.type === "movement" ? "Бельё" : "Расход"}
              </span>
            </div>

            <div className="px-5 py-4 space-y-4">
              {editedData.type === "movement" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Откуда</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={editedData.from_location}
                        onChange={(e) => updateMovementField("from_location", e.target.value)}
                      >
                        {LOCATION_OPTIONS.map(l => (
                          <option key={l} value={l}>{LOCATION_LABELS[l] || l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Куда</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={editedData.to_location}
                        onChange={(e) => updateMovementField("to_location", e.target.value)}
                      >
                        {LOCATION_OPTIONS.map(l => (
                          <option key={l} value={l}>{LOCATION_LABELS[l] || l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Предметы</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_ITEMS.map((key) => (
                        <div key={key} className={cn(
                          "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors",
                          (editedData.items[key] || 0) > 0
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-muted/30"
                        )}>
                          <span className="text-xs text-foreground truncate flex-1">{ITEM_LABELS[key]}</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={editedData.items[key] || 0}
                            onChange={(e) => updateMovementItem(key, e.target.value)}
                            className="w-12 text-center text-sm font-bold rounded border border-input bg-background py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Примечания</Label>
                    <Input
                      value={editedData.notes || ""}
                      onChange={(e) => updateMovementField("notes", e.target.value)}
                      placeholder="Необязательно"
                      className="text-sm"
                    />
                  </div>
                </>
              )}

              {editedData.type === "expense" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Уборщица</Label>
                      <Input
                        value={editedData.contractor}
                        onChange={(e) => updateExpenseField("contractor", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Сумма (€)</Label>
                      <Input
                        type="number"
                        value={editedData.amount}
                        onChange={(e) => updateExpenseField("amount", parseFloat(e.target.value) || 0)}
                        className="text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Апартамент</Label>
                      <Input
                        value={editedData.apartment}
                        onChange={(e) => updateExpenseField("apartment", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Категория</Label>
                      <Input
                        value={editedData.category}
                        onChange={(e) => updateExpenseField("category", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Примечания</Label>
                    <Input
                      value={editedData.notes || ""}
                      onChange={(e) => updateExpenseField("notes", e.target.value)}
                      placeholder="Необязательно"
                      className="text-sm"
                    />
                  </div>

                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Касса Эммочки</span>
                    <span className="text-lg font-bold text-destructive">−{editedData.amount}€</span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={handleReset}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />Отмена
              </Button>
              <Button
                className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleConfirm}
                disabled={isSaving}
              >
                {isSaving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4" />
                }
                Подтвердить
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ScanLinen;
