import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, Loader2, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

type TriggerPage = "кассы" | "бельё" | "задачи" | "любая";

interface Rule {
  id: string;
  recipient: string;
  custom_prefix: string | null;
  trigger_page: TriggerPage;
  events: string[];
  auto_send: boolean;
  user_id: string;
}

const EVENT_OPTIONS: Record<TriggerPage, { key: string; label: string; default: boolean }[]> = {
  "кассы": [
    { key: "balance_all", label: "Текущий баланс всех касс", default: true },
    { key: "last_transaction", label: "Последняя транзакция (расход/доход + сумма + контрагент)", default: true },
    { key: "income_today", label: "Итого приходов за сегодня", default: false },
    { key: "expenses_today", label: "Итого расходов за сегодня", default: false },
  ],
  "бельё": [
    { key: "last_movement", label: "Последнее перемещение (откуда → куда + список белья)", default: true },
    { key: "inventory_from", label: "Новые остатки места ОТКУДА", default: true },
    { key: "inventory_to", label: "Новые остатки места КУДА", default: true },
    { key: "inventory_all", label: "Общие остатки всех мест", default: false },
  ],
  "задачи": [
    { key: "new_task", label: "Новая задача", default: true },
    { key: "completed_task", label: "Задача выполнена", default: true },
  ],
  "любая": [
    { key: "any_event", label: "Любое событие", default: true },
  ],
};

const TRIGGER_LABELS: Record<TriggerPage, string> = {
  "кассы": "💰 Кассы",
  "бельё": "🛏 Бельё",
  "задачи": "📋 Задачи",
  "любая": "🔔 Любая страница",
};

const EMPTY_RULE = {
  recipient: "",
  custom_prefix: "",
  trigger_page: "бельё" as TriggerPage,
  events: EVENT_OPTIONS["бельё"].filter(e => e.default).map(e => e.key),
  auto_send: false,
};

export default function TelegramNotificationRules({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [newRule, setNewRule] = useState({ ...EMPTY_RULE });
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    const { data } = await supabase
      .from("telegram_notification_rules")
      .select("*")
      .order("created_at", { ascending: true });
    setRules((data || []).map(r => ({
      ...r,
      trigger_page: r.trigger_page as TriggerPage,
      events: Array.isArray(r.events) ? r.events as string[] : [],
    })));
    setLoading(false);
  }

  function toggleEvent(events: string[], key: string): string[] {
    return events.includes(key) ? events.filter(e => e !== key) : [...events, key];
  }

  async function addRule() {
    if (!newRule.recipient.trim()) {
      toast({ title: "Укажите получателя", variant: "destructive" });
      return;
    }
    if (rules.length >= 5) {
      toast({ title: "Максимум 5 правил", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("telegram_notification_rules")
      .insert({
        recipient: newRule.recipient.trim(),
        custom_prefix: newRule.custom_prefix?.trim() || null,
        trigger_page: newRule.trigger_page,
        events: newRule.events,
        auto_send: newRule.auto_send,
        user_id: userId,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      return;
    }
    setRules(r => [...r, { ...data, trigger_page: data.trigger_page as TriggerPage, events: data.events as string[] }]);
    setNewRule({ ...EMPTY_RULE });
    setShowAdd(false);
    toast({ title: "✅ Правило добавлено" });
  }

  async function deleteRule(id: string) {
    await supabase.from("telegram_notification_rules").delete().eq("id", id);
    setRules(r => r.filter(x => x.id !== id));
    toast({ title: "Правило удалено" });
  }

  async function updateAutoSend(id: string, value: boolean) {
    await supabase.from("telegram_notification_rules").update({ auto_send: value }).eq("id", id);
    setRules(r => r.map(x => x.id === id ? { ...x, auto_send: value } : x));
  }

  async function sendNow(rule: Rule) {
    setSending(s => ({ ...s, [rule.id]: true }));
    try {
      const { data, error } = await invoke("send-telegram-notification", {
        body: { rule_id: rule.id, trigger_page: rule.trigger_page, event_data: {} },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || "Ошибка");
      toast({ title: "📤 Отправлено", description: `Сообщение отправлено на ${rule.recipient}` });
    } catch (e) {
      toast({ title: "❌ Ошибка", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(s => ({ ...s, [rule.id]: false }));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Existing rules */}
      {rules.length === 0 && !showAdd && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Нет правил уведомлений</p>
        </div>
      )}

      {rules.map(rule => (
        <div key={rule.id} className="p-4 rounded-xl bg-white/70 border border-white/40 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{rule.recipient}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {TRIGGER_LABELS[rule.trigger_page as TriggerPage]}
                </span>
              </div>
              {rule.custom_prefix && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">"{rule.custom_prefix}"</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {(rule.events || []).map(ev => {
                  const opt = EVENT_OPTIONS[rule.trigger_page as TriggerPage]?.find(o => o.key === ev);
                  return opt ? (
                    <span key={ev} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                      {opt.label}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 gap-1 text-xs"
                disabled={sending[rule.id]}
                onClick={() => sendNow(rule)}
              >
                {sending[rule.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Отправить
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => deleteRule(rule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-white/30">
            <Switch
              id={`auto-${rule.id}`}
              checked={rule.auto_send}
              onCheckedChange={(v) => updateAutoSend(rule.id, v)}
            />
            <Label htmlFor={`auto-${rule.id}`} className="text-xs cursor-pointer">
              Авто-отправка при событии
            </Label>
          </div>
        </div>
      ))}

      {/* Add new rule form */}
      {showAdd && (
        <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-white/40 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Новое правило</p>

          <div className="space-y-2">
            <Label className="text-xs">Получатель</Label>
            <Input
              value={newRule.recipient}
              onChange={e => setNewRule(r => ({ ...r, recipient: e.target.value }))}
              placeholder="@username или chat_id"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Префикс сообщения (необязательно)</Label>
            <Input
              value={newRule.custom_prefix || ""}
              onChange={e => setNewRule(r => ({ ...r, custom_prefix: e.target.value }))}
              placeholder="Ирочка, смотри 👇"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Страница-триггер</Label>
            <Select
              value={newRule.trigger_page}
              onValueChange={(v: TriggerPage) => setNewRule(r => ({
                ...r,
                trigger_page: v,
                events: EVENT_OPTIONS[v].filter(e => e.default).map(e => e.key),
              }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TRIGGER_LABELS) as TriggerPage[]).map(key => (
                  <SelectItem key={key} value={key}>{TRIGGER_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Включать в уведомление</Label>
            <div className="space-y-2">
              {EVENT_OPTIONS[newRule.trigger_page].map(opt => (
                <div key={opt.key} className="flex items-start gap-2">
                  <Checkbox
                    id={`evt-${opt.key}`}
                    checked={newRule.events.includes(opt.key)}
                    onCheckedChange={() => setNewRule(r => ({ ...r, events: toggleEvent(r.events, opt.key) }))}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`evt-${opt.key}`} className="text-xs leading-snug cursor-pointer font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="auto-send-new"
              checked={newRule.auto_send}
              onCheckedChange={v => setNewRule(r => ({ ...r, auto_send: v }))}
            />
            <Label htmlFor="auto-send-new" className="text-xs cursor-pointer">
              Авто-отправка при событии
            </Label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={addRule} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Сохранить правило
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {!showAdd && rules.length < 5 && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 border-dashed"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="h-4 w-4" />
          Добавить правило
        </Button>
      )}
      {rules.length >= 5 && (
        <p className="text-xs text-center text-muted-foreground">Максимум 5 правил достигнут</p>
      )}
    </div>
  );
}
