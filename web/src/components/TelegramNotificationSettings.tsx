import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, Send, Clock, Users, MessageSquare, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = [
  { label: "Пн", value: 1 },
  { label: "Вт", value: 2 },
  { label: "Ср", value: 3 },
  { label: "Чт", value: 4 },
  { label: "Пт", value: 5 },
  { label: "Сб", value: 6 },
  { label: "Вс", value: 7 },
];

const AI_PRESET_LABELS: Record<string, string> = {
  daily_revenue_report: "Ежедневный отчёт по выручке",
  daily_summary: "Краткая сводка за день",
  monthly_forecast: "Прогноз на конец месяца",
};

const EMOJI_OPTIONS = ["📊", "💰", "🚗", "🔧", "📋", "📈", "💵", "🏦", "⚙️", "📱", "🔔", "✅", "🌙", "☀️", "💼"];

export default function TelegramNotificationSettings() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedules" | "recipients" | "templates">("schedules");
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<"new" | "edit" | null>(null);
  const qc = useQueryClient();

  // --- Recipients ---
  const { data: recipients = [] } = useQuery({
    queryKey: ["notif-recipients"],
    queryFn: async () => {
      const { data } = await supabase.from("notification_recipients" as any).select("*").order("created_at");
      return data || [];
    },
  });

  const [newRecipient, setNewRecipient] = useState({ name: "", telegram_chat_id: "" });
  const addRecipient = useMutation({
    mutationFn: async () => {
      await supabase.from("notification_recipients" as any).insert(newRecipient);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-recipients"] }); setNewRecipient({ name: "", telegram_chat_id: "" }); toast.success("Получатель добавлен"); },
  });
  const deleteRecipient = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notification_recipients" as any).delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-recipients"] }); qc.invalidateQueries({ queryKey: ["notif-schedules"] }); },
  });

  // --- Templates ---
  const { data: templates = [] } = useQuery({
    queryKey: ["notif-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("notification_templates" as any).select("*").order("created_at");
      return data || [];
    },
  });

  const [newTemplate, setNewTemplate] = useState({ name: "", content: "", emoji: "📋" });
  const addTemplate = useMutation({
    mutationFn: async () => {
      await supabase.from("notification_templates" as any).insert({
        name: `${newTemplate.emoji} ${newTemplate.name}`,
        content: newTemplate.content,
        is_ai_preset: false,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-templates"] }); setNewTemplate({ name: "", content: "", emoji: "📋" }); toast.success("Шаблон добавлен"); },
  });
  const updateTemplate = useMutation({
    mutationFn: async () => {
      if (!editingTemplate) return;
      await supabase.from("notification_templates" as any).update({
        name: editingTemplate.name,
        content: editingTemplate.content,
      }).eq("id", editingTemplate.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-templates"] }); setEditingTemplate(null); toast.success("Шаблон обновлён"); },
  });
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notification_templates" as any).delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-templates"] }); },
  });

  // --- Schedules ---
  const { data: schedules = [] } = useQuery({
    queryKey: ["notif-schedules"],
    queryFn: async () => {
      const { data } = await supabase.from("notification_schedules" as any).select("*, recipient:notification_recipients(*), template:notification_templates(*)").order("created_at");
      return data || [];
    },
  });

  const defaultSchedule = {
    recipient_id: "",
    template_id: "",
    custom_message: "",
    send_time: "22:00",
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    is_recurring: true,
    active: true,
  };
  const [newSchedule, setNewSchedule] = useState(defaultSchedule);
  const addSchedule = useMutation({
    mutationFn: async () => {
      await supabase.from("notification_schedules" as any).insert({
        ...newSchedule,
        send_time: newSchedule.send_time + ":00",
        template_id: newSchedule.template_id || null,
        custom_message: newSchedule.custom_message || null,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-schedules"] }); setNewSchedule(defaultSchedule); toast.success("Расписание добавлено"); },
  });
  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notification_schedules" as any).delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-schedules"] }),
  });
  const toggleSchedule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await supabase.from("notification_schedules" as any).update({ active }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-schedules"] }),
  });

  // --- Send now ---
  const sendNow = useMutation({
    mutationFn: async (recipientId?: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-daily-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ recipientId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      return resp.json();
    },
    onSuccess: () => toast.success("Отчёт отправлен в Telegram!"),
    onError: (e: any) => toast.error("Ошибка: " + e.message),
  });

  const toggleDay = (day: number) => {
    setNewSchedule(s => ({
      ...s,
      days_of_week: s.days_of_week.includes(day)
        ? s.days_of_week.filter(d => d !== day)
        : [...s.days_of_week, day].sort(),
    }));
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full h-9 w-9 p-0 shadow-lg bg-background border-border"
        onClick={() => setOpen(o => !o)}
        title="Уведомления Telegram"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute bottom-12 left-0 w-[360px] max-w-[calc(100vw-2rem)] bg-background border border-border rounded-xl shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4" /> Telegram-уведомления
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => sendNow.mutate(undefined)} disabled={sendNow.isPending}>
                <Send className="h-3 w-3" /> Отправить сейчас
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}><X className="h-3 w-3" /></Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border text-xs">
            {([["schedules", "Расписание", Clock], ["recipients", "Получатели", Users], ["templates", "Шаблоны", MessageSquare]] as const).map(([tab, label, Icon]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn("flex-1 flex items-center justify-center gap-1 py-2 transition-colors", activeTab === tab ? "border-b-2 border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="h-3 w-3" />{label}
              </button>
            ))}
          </div>

          <div className="p-3 max-h-[400px] overflow-y-auto space-y-3">

            {/* SCHEDULES TAB */}
            {activeTab === "schedules" && (
              <>
                {schedules.map((s: any) => (
                  <div key={s.id} className="flex items-start gap-2 bg-muted/30 rounded-lg p-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.recipient?.name || "—"}</div>
                      <div className="text-muted-foreground">{s.send_time?.slice(0,5)} · {s.is_recurring ? "ежедневно" : "однократно"}</div>
                      <div className="flex gap-0.5 mt-1">
                        {DAYS.map(d => (
                          <span key={d.value} className={cn("px-1 rounded text-[10px]", (s.days_of_week || []).includes(d.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                            {d.label}
                          </span>
                        ))}
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate">
                        {s.template ? (AI_PRESET_LABELS[s.template.content] || s.template.name) : s.custom_message || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => toggleSchedule.mutate({ id: s.id, active: !s.active })} className={cn("rounded-full h-5 w-5 flex items-center justify-center border", s.active ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                        {s.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </button>
                      <button onClick={() => sendNow.mutate(s.recipient_id)} title="Отправить сейчас" className="rounded-full h-5 w-5 flex items-center justify-center border border-border text-muted-foreground hover:text-primary">
                        <Send className="h-3 w-3" />
                      </button>
                      <button onClick={() => deleteSchedule.mutate(s.id)} className="rounded-full h-5 w-5 flex items-center justify-center border border-border text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add schedule form */}
                <div className="border border-dashed border-border rounded-lg p-2 space-y-2 text-xs">
                  <div className="font-medium text-muted-foreground">+ Новое расписание</div>
                  <select className="w-full bg-background border border-border rounded px-2 py-1 text-xs" value={newSchedule.recipient_id} onChange={e => setNewSchedule(s => ({ ...s, recipient_id: e.target.value }))}>
                    <option value="">Получатель...</option>
                    {recipients.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <select className="w-full bg-background border border-border rounded px-2 py-1 text-xs" value={newSchedule.template_id} onChange={e => setNewSchedule(s => ({ ...s, template_id: e.target.value }))}>
                    <option value="">Шаблон сообщения...</option>
                    {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {!newSchedule.template_id && (
                    <Input className="h-7 text-xs" placeholder="Или своё сообщение..." value={newSchedule.custom_message} onChange={e => setNewSchedule(s => ({ ...s, custom_message: e.target.value }))} />
                  )}
                  <div className="flex items-center gap-2">
                    <Input type="time" className="h-7 text-xs flex-1" value={newSchedule.send_time} onChange={e => setNewSchedule(s => ({ ...s, send_time: e.target.value }))} />
                    <label className="flex items-center gap-1 whitespace-nowrap cursor-pointer">
                      <input type="checkbox" checked={newSchedule.is_recurring} onChange={e => setNewSchedule(s => ({ ...s, is_recurring: e.target.checked }))} />
                      повтор
                    </label>
                  </div>
                  <div className="flex gap-1">
                    {DAYS.map(d => (
                      <button key={d.value} onClick={() => toggleDay(d.value)} className={cn("flex-1 py-0.5 rounded text-[10px] border transition-colors", newSchedule.days_of_week.includes(d.value) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => addSchedule.mutate()} disabled={!newSchedule.recipient_id || addSchedule.isPending}>
                    <Plus className="h-3 w-3 mr-1" /> Добавить
                  </Button>
                </div>
              </>
            )}

            {/* RECIPIENTS TAB */}
            {activeTab === "recipients" && (
              <>
                {recipients.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground font-mono">{r.telegram_chat_id || "Chat ID не указан"}</div>
                    </div>
                    <button onClick={() => deleteRecipient.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="border border-dashed border-border rounded-lg p-2 space-y-2 text-xs">
                  <div className="font-medium text-muted-foreground">+ Новый получатель</div>
                  <Input className="h-7 text-xs" placeholder="Имя" value={newRecipient.name} onChange={e => setNewRecipient(r => ({ ...r, name: e.target.value }))} />
                  <Input className="h-7 text-xs font-mono" placeholder="Telegram Chat ID" value={newRecipient.telegram_chat_id} onChange={e => setNewRecipient(r => ({ ...r, telegram_chat_id: e.target.value }))} />
                  <p className="text-[10px] text-muted-foreground">Узнать Chat ID: напиши боту @userinfobot в Telegram</p>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => addRecipient.mutate()} disabled={!newRecipient.name || !newRecipient.telegram_chat_id || addRecipient.isPending}>
                    <Plus className="h-3 w-3 mr-1" /> Добавить
                  </Button>
                </div>
              </>
            )}

            {/* TEMPLATES TAB */}
            {activeTab === "templates" && (
              <>
                {templates.map((t: any) => (
                  <div key={t.id} className="bg-muted/30 rounded-lg p-2 text-xs">
                    {editingTemplate?.id === t.id ? (
                      <div className="space-y-2">
                        <Input
                          className="h-7 text-xs"
                          value={editingTemplate.name}
                          onChange={e => setEditingTemplate((et: any) => ({ ...et, name: e.target.value }))}
                          placeholder="Название"
                        />
                        <textarea
                          className="w-full bg-background border border-border rounded px-2 py-1 text-xs resize-none h-16"
                          value={editingTemplate.content}
                          onChange={e => setEditingTemplate((et: any) => ({ ...et, content: e.target.value }))}
                          placeholder="Текст сообщения..."
                        />
                        <div className="flex gap-1">
                          <Button size="sm" className="flex-1 h-6 text-xs" onClick={() => updateTemplate.mutate()} disabled={updateTemplate.isPending}>
                            <Check className="h-3 w-3 mr-1" /> Сохранить
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingTemplate(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-1">
                            {t.is_ai_preset && <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">🤖 ИИ</span>}
                            {t.name}
                          </div>
                          <div className="text-muted-foreground truncate">{AI_PRESET_LABELS[t.content] || t.content}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setEditingTemplate({ ...t })} className="text-muted-foreground hover:text-primary mt-0.5">
                            <Pencil className="h-3 w-3" />
                          </button>
                          {!t.is_ai_preset && (
                            <button onClick={() => deleteTemplate.mutate(t.id)} className="text-muted-foreground hover:text-destructive mt-0.5">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new template */}
                <div className="border border-dashed border-border rounded-lg p-2 space-y-2 text-xs">
                  <div className="font-medium text-muted-foreground">+ Свой шаблон</div>
                  {/* Emoji picker */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEmojiPicker(p => p === "new" ? null : "new")}
                      className="h-7 w-8 border border-border rounded text-base flex items-center justify-center hover:bg-muted/50"
                    >
                      {newTemplate.emoji}
                    </button>
                    <Input className="h-7 text-xs flex-1" placeholder="Название шаблона" value={newTemplate.name} onChange={e => setNewTemplate(t => ({ ...t, name: e.target.value }))} />
                  </div>
                  {showEmojiPicker === "new" && (
                    <div className="flex flex-wrap gap-1 bg-muted/30 rounded p-1">
                      {EMOJI_OPTIONS.map(em => (
                        <button key={em} onClick={() => { setNewTemplate(t => ({ ...t, emoji: em })); setShowEmojiPicker(null); }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-background text-sm">
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea className="w-full bg-background border border-border rounded px-2 py-1 text-xs resize-none h-16" placeholder="Текст сообщения..." value={newTemplate.content} onChange={e => setNewTemplate(t => ({ ...t, content: e.target.value }))} />
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => addTemplate.mutate()} disabled={!newTemplate.name || !newTemplate.content || addTemplate.isPending}>
                    <Plus className="h-3 w-3 mr-1" /> Добавить
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
