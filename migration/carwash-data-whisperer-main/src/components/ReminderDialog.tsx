import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Calendar, Clock, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addMinutes, addHours, addDays, addWeeks, format } from "date-fns";
import { ru } from "date-fns/locale";

function getUsername(): string {
  try {
    const token = localStorage.getItem("carwash_token") || "";
    return atob(token).split(":")[0] || "unknown";
  } catch { return "unknown"; }
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

export async function scheduleLocalReminder(
  remindAt: Date,
  title: string,
  message: string,
  reminderId?: string
): Promise<boolean> {
  const perm = await requestPushPermission();
  if (perm !== "granted") {
    toast.error("Разрешите уведомления в браузере для получения напоминаний", {
      description: "Настройки → Уведомления для этого сайта → Разрешить",
      duration: 6000,
    });
    return false;
  }

  const delay = remindAt.getTime() - Date.now();
  if (delay <= 0) {
    toast.error("Время напоминания уже прошло");
    return false;
  }

  const id = reminderId || crypto.randomUUID();

  // Try to schedule via Service Worker (persists to IndexedDB, survives SW restart)
  let swScheduled = false;
  if ("serviceWorker" in navigator) {
    try {
      // Register SW if not yet done
      if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.register("/sw.js");
      }
      const reg = await navigator.serviceWorker.ready;
      const sw = reg.active || reg.installing || reg.waiting;
      if (sw) {
        sw.postMessage({
          type: "SCHEDULE_REMINDER",
          id,
          remindAt: remindAt.toISOString(),
          title,
          message,
          delay,
        });
        swScheduled = true;
      }
    } catch (e) {
      console.warn("[Reminder] SW scheduling failed, using setTimeout fallback", e);
    }
  }

  // Always also schedule via setTimeout as fallback (works when app is open in same session)
  setTimeout(() => {
    if (Notification.permission === "granted") {
      try {
        new Notification(title, {
          body: message,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `era-reminder-${id}`,
          requireInteraction: true,
        });
      } catch { /* ignore */ }
    }
  }, delay);

  if (!swScheduled) {
    // Store in localStorage as last-resort
    try {
      const stored = JSON.parse(localStorage.getItem("era_reminders") || "[]");
      stored.push({ id, remindAt: remindAt.toISOString(), title, message });
      localStorage.setItem("era_reminders", JSON.stringify(stored.slice(-50)));
    } catch { /* ignore */ }
  }

  return true;
}

const QUICK_OPTIONS = [
  { label: "5 мин", fn: () => addMinutes(new Date(), 5) },
  { label: "15 мин", fn: () => addMinutes(new Date(), 15) },
  { label: "30 мин", fn: () => addMinutes(new Date(), 30) },
  { label: "1 час", fn: () => addHours(new Date(), 1) },
  { label: "3 часа", fn: () => addHours(new Date(), 3) },
  { label: "Завтра", fn: () => addDays(new Date(), 1) },
  { label: "2 дня", fn: () => addDays(new Date(), 2) },
  { label: "Неделя", fn: () => addWeeks(new Date(), 1) },
];

const UNITS = [
  { label: "мин", fn: (n: number) => addMinutes(new Date(), n) },
  { label: "часов", fn: (n: number) => addHours(new Date(), n) },
  { label: "дней", fn: (n: number) => addDays(new Date(), n) },
  { label: "недель", fn: (n: number) => addWeeks(new Date(), n) },
];

interface ReminderDialogProps {
  open: boolean;
  onClose: () => void;
  itemType: "note" | "task";
  itemId: string;
  itemTitle: string;
}

export default function ReminderDialog({ open, onClose, itemType, itemId, itemTitle }: ReminderDialogProps) {
  const [mode, setMode] = useState<"quick" | "calendar" | "custom">("quick");
  const [customValue, setCustomValue] = useState("1");
  const [customUnit, setCustomUnit] = useState(1); // default: hours
  const [calendarDate, setCalendarDate] = useState(format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
  const [saving, setSaving] = useState(false);

  const handleRemind = async (remindAt: Date) => {
    setSaving(true);
    const title = `⏰ ${itemTitle.slice(0, 50)}`;
    const message = `${itemType === "note" ? "📝 Заметка" : "✅ Задача"}: ${itemTitle}`;
    const reminderId = `${itemType}-${itemId}-${Date.now()}`;

    const ok = await scheduleLocalReminder(remindAt, title, message, reminderId);
    if (ok) {
      try {
        await supabase.from("reminders" as any).insert({
          item_type: itemType,
          item_id: itemId,
          item_title: itemTitle,
          remind_at: remindAt.toISOString(),
          message,
          username: getUsername(),
        });
      } catch { /* ignore */ }

      toast.success(
        `🔔 Напомню ${format(remindAt, "d MMM в HH:mm", { locale: ru })}`,
        { duration: 5000, description: "Уведомление придёт даже при свёрнутом приложении" }
      );
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby="reminder-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-primary" />
            Напомнить: <span className="text-primary font-normal truncate max-w-[150px]">{itemTitle}</span>
          </DialogTitle>
        </DialogHeader>
        <p id="reminder-desc" className="sr-only">Выберите время напоминания</p>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          {[
            { key: "quick", label: "Быстро", icon: Clock },
            { key: "custom", label: "Через...", icon: Bell },
            { key: "calendar", label: "Дата", icon: Calendar },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key as any)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all",
                mode === key ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>

        {mode === "quick" && (
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => handleRemind(opt.fn())}
                disabled={saving}
                className="py-2.5 px-1 rounded-lg border border-border text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all text-center"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {mode === "custom" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Напомнить через:</p>
            <div className="flex gap-2 items-center">
              <Input
                type="number" min="1" max="999"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                className="h-10 text-base text-center font-bold w-20 flex-shrink-0"
              />
              <div className="flex flex-wrap gap-1 flex-1">
                {UNITS.map((u, i) => (
                  <button key={u.label} onClick={() => setCustomUnit(i)}
                    className={cn("px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all",
                      customUnit === i ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/60"
                    )}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              ≈ {format(UNITS[customUnit].fn(Number(customValue) || 1), "d MMM в HH:mm", { locale: ru })}
            </p>
            <Button className="w-full h-9 gap-2"
              onClick={() => handleRemind(UNITS[customUnit].fn(Number(customValue) || 1))}
              disabled={saving || !customValue || Number(customValue) < 1}>
              <Bell className="h-4 w-4" /> Установить напоминание
            </Button>
          </div>
        )}

        {mode === "calendar" && (
          <div className="space-y-3">
            <Input type="datetime-local" value={calendarDate}
              onChange={e => setCalendarDate(e.target.value)} className="h-10 text-sm" />
            {calendarDate && (
              <p className="text-[10px] text-muted-foreground text-center">
                {format(new Date(calendarDate), "EEEE, d MMMM в HH:mm", { locale: ru })}
              </p>
            )}
            <Button className="w-full h-9 gap-2"
              onClick={() => calendarDate && handleRemind(new Date(calendarDate))}
              disabled={saving || !calendarDate || new Date(calendarDate) <= new Date()}>
              <Check className="h-4 w-4" /> Напомнить
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
