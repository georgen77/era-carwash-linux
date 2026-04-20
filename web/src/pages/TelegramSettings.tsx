import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Send, Plus, Trash2, Clock, User, MessageSquare,
  Bot, ChevronDown, ChevronUp, Play, Check, Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
import TelegramNotificationRules from "@/components/TelegramNotificationRules";
import { invoke } from "@/lib/invoke";

interface TgUser {
  id: string;
  name: string;
  chat_id: string;
  username?: string;
}

interface TgTemplate {
  id: string;
  name: string;
  body: string;
  variables: string[];
}

interface ScheduledMsg {
  id: string;
  template_id: string;
  user_ids: string[];
  cron: string;
  enabled: boolean;
  last_sent?: string;
}

const DEFAULT_USERS: TgUser[] = [
  { id: "1", name: "Джордж", chat_id: "", username: "igera" },
  { id: "2", name: "Эмма", chat_id: "", username: "" },
];

const DEFAULT_TEMPLATES: TgTemplate[] = [
  {
    id: "t1",
    name: "Ежедневный отчёт кассы",
    body: "📊 *Касса Эммочка — {date}*\n\n💰 Баланс: *{balance}€*\n📈 Приходы: {income}€\n📉 Расходы: {expenses}€\n\n_ERA Apartments_",
    variables: ["date", "balance", "income", "expenses"],
  },
  {
    id: "t2",
    name: "Новое задание",
    body: "📋 *Новое задание для {cleaner}*\n\n🏠 Апартамент: {apartment}\n📅 Дата: {date}\n🕐 Время: {time}\n\n{description}",
    variables: ["cleaner", "apartment", "date", "time", "description"],
  },
  {
    id: "t3",
    name: "Перемещение белья",
    body: "🛏 *Перемещение белья*\n\n📦 {item}: {quantity} шт.\n➡️ Откуда: {from}\n⬅️ Куда: {to}\n\n_ERA Apartments_",
    variables: ["item", "quantity", "from", "to"],
  },
];

const CRON_PRESETS = [
  { label: "Каждый день в 9:00", value: "0 9 * * *" },
  { label: "Каждый день в 18:00", value: "0 18 * * *" },
  { label: "Каждый понедельник в 10:00", value: "0 10 * * 1" },
  { label: "Каждое воскресенье в 20:00", value: "0 20 * * 0" },
];

const LS_KEY = "telegram_settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return null;
}

function saveSettings(data: object) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export default function TelegramSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Current user from session
  const [currentUserId, setCurrentUserId] = useState<string>("system");
  useEffect(() => {
    const userStr = sessionStorage.getItem("cleaning_user");
    if (userStr) {
      try { setCurrentUserId(JSON.parse(userStr).id || "system"); } catch { /* noop */ }
    }
  }, []);

  const saved = loadSettings();
  const [botToken, setBotToken] = useState<string>(saved?.botToken || "");
  const [users, setUsers] = useState<TgUser[]>(saved?.users || DEFAULT_USERS);
  const [templates, setTemplates] = useState<TgTemplate[]>(saved?.templates || DEFAULT_TEMPLATES);
  const [scheduled, setScheduled] = useState<ScheduledMsg[]>(saved?.scheduled || []);

  const [activeSection, setActiveSection] = useState<string>("bot");
  const [sending, setSending] = useState<Record<string, boolean>>({});

  // New user form
  const [newUser, setNewUser] = useState<Omit<TgUser, "id">>({ name: "", chat_id: "", username: "" });
  // New template form
  const [newTpl, setNewTpl] = useState<Omit<TgTemplate, "id" | "variables">>({ name: "", body: "" });
  // New schedule form
  const [newSched, setNewSched] = useState<Omit<ScheduledMsg, "id" | "last_sent">>({
    template_id: templates[0]?.id || "",
    user_ids: [],
    cron: "0 9 * * *",
    enabled: true,
  });

  // persist on change
  useEffect(() => {
    saveSettings({ botToken, users, templates, scheduled });
  }, [botToken, users, templates, scheduled]);

  const parseVariables = (body: string): string[] => {
    const matches = body.match(/\{(\w+)\}/g) || [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  };

  const sendNow = async (templateId: string, userId: string, preview?: string) => {
    const key = `${templateId}-${userId}`;
    setSending(s => ({ ...s, [key]: true }));
    try {
      const user = users.find(u => u.id === userId);
      const tpl = templates.find(t => t.id === templateId);
      if (!user || !tpl) throw new Error("Не найден пользователь или шаблон");
      if (!user.chat_id) throw new Error("Не задан Chat ID для пользователя " + user.name);

      const text = preview || tpl.body
        .replace(/\{date\}/g, new Date().toLocaleDateString("ru-RU"))
        .replace(/\{balance\}/g, "—")
        .replace(/\{income\}/g, "—")
        .replace(/\{expenses\}/g, "—");

      const { data, error } = await invoke("send-telegram", {
        body: { chat_id: user.chat_id, text, bot_token: botToken },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Ошибка");
      toast({ title: "✅ Отправлено", description: `Сообщение отправлено ${user.name}` });
    } catch (e: unknown) {
      toast({
        title: "❌ Ошибка отправки",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSending(s => ({ ...s, [key]: false }));
    }
  };

  const Section = ({
    id, title, icon, children,
  }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => {
    const open = activeSection === id;
    return (
      <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/40 transition-colors"
          onClick={() => setActiveSection(open ? "" : id)}
        >
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">{icon}</span>
            <span className="text-base font-semibold tracking-tight">{title}</span>
          </div>
          {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </button>
        {open && (
          <div className="px-6 pb-6 pt-2 border-t border-white/20 bg-white/30">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: "linear-gradient(145deg, hsl(35 40% 97%) 0%, hsl(40 30% 94%) 50%, hsl(30 25% 96%) 100%)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-white/40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/cleaning')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xl">✈️</span>
            <h1 className="text-lg font-bold tracking-tight">Telegram — Настройки</h1>
          </div>
          <Badge variant="outline" className="ml-auto text-xs">iGera Bot</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* BOT TOKEN */}
        <Section id="bot" title="Настройка бота iGera" icon={<Bot className="h-5 w-5" />}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <p className="font-medium mb-1">🤖 Бот: @igera_bot</p>
              <p className="text-xs text-blue-600">Введите токен вашего Telegram-бота. Получить у @BotFather командой /token</p>
            </div>
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input
                type="password"
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdef..."
                className="font-mono text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={async () => {
                if (!botToken) { toast({ title: "Введите токен", variant: "destructive" }); return; }
                try {
                  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
                  const data = await res.json();
                  if (data.ok) {
                    toast({ title: "✅ Бот подключён", description: `@${data.result.username}` });
                  } else {
                    throw new Error(data.description);
                  }
                } catch (e: unknown) {
                  toast({ title: "❌ Ошибка", description: (e as Error).message, variant: "destructive" });
                }
              }}
              className="w-full"
            >
              <Check className="h-4 w-4 mr-2" />
              Проверить подключение
            </Button>
          </div>
        </Section>

        {/* USERS */}
        <Section id="users" title="Получатели" icon={<User className="h-5 w-5" />}>
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/70 border border-white/40">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {u.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.username ? `@${u.username} · ` : ""}Chat ID: {u.chat_id || <span className="text-amber-600">не задан</span>}
                  </p>
                </div>
                <Input
                  value={u.chat_id}
                  onChange={e => setUsers(us => us.map(x => x.id === u.id ? { ...x, chat_id: e.target.value } : x))}
                  placeholder="Chat ID"
                  className="w-32 text-xs h-8"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => setUsers(us => us.filter(x => x.id !== u.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="p-3 rounded-xl border border-dashed border-primary/30 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Добавить получателя</p>
              <div className="flex gap-2">
                <Input
                  value={newUser.name}
                  onChange={e => setNewUser(n => ({ ...n, name: e.target.value }))}
                  placeholder="Имя"
                  className="h-8 text-sm"
                />
                <Input
                  value={newUser.username}
                  onChange={e => setNewUser(n => ({ ...n, username: e.target.value }))}
                  placeholder="@username"
                  className="h-8 text-sm"
                />
                <Input
                  value={newUser.chat_id}
                  onChange={e => setNewUser(n => ({ ...n, chat_id: e.target.value }))}
                  placeholder="Chat ID"
                  className="h-8 text-sm"
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    if (!newUser.name) return;
                    setUsers(us => [...us, { id: Date.now().toString(), ...newUser }]);
                    setNewUser({ name: "", chat_id: "", username: "" });
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Chat ID: напишите боту /start, затем откройте{" "}
                <code className="bg-muted px-1 rounded">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
              </p>
            </div>
          </div>
        </Section>

        {/* TEMPLATES */}
        <Section id="templates" title="Шаблоны сообщений" icon={<MessageSquare className="h-5 w-5" />}>
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="p-3 rounded-xl bg-white/70 border border-white/40 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm flex-1">{t.name}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {users.map(u => (
                      <Button
                        key={u.id}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={sending[`${t.id}-${u.id}`]}
                        onClick={() => sendNow(t.id, u.id)}
                      >
                        {sending[`${t.id}-${u.id}`] ? (
                          <span className="animate-spin mr-1">⏳</span>
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        {u.name}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => setTemplates(ts => ts.filter(x => x.id !== t.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={t.body}
                  onChange={e => setTemplates(ts => ts.map(x =>
                    x.id === t.id ? { ...x, body: e.target.value, variables: parseVariables(e.target.value) } : x
                  ))}
                  className="text-xs font-mono min-h-[80px] bg-white/60"
                />
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.variables.map(v => (
                      <Badge key={v} variant="secondary" className="text-xs">{`{${v}}`}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="p-3 rounded-xl border border-dashed border-primary/30 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Новый шаблон</p>
              <Input
                value={newTpl.name}
                onChange={e => setNewTpl(n => ({ ...n, name: e.target.value }))}
                placeholder="Название шаблона"
                className="h-8 text-sm"
              />
              <Textarea
                value={newTpl.body}
                onChange={e => setNewTpl(n => ({ ...n, body: e.target.value }))}
                placeholder="Текст сообщения. Используйте {переменная} для подстановки."
                className="text-xs font-mono min-h-[80px]"
              />
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  if (!newTpl.name || !newTpl.body) return;
                  setTemplates(ts => [...ts, {
                    id: Date.now().toString(),
                    name: newTpl.name,
                    body: newTpl.body,
                    variables: parseVariables(newTpl.body),
                  }]);
                  setNewTpl({ name: "", body: "" });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Добавить шаблон
              </Button>
            </div>
          </div>
        </Section>

        {/* SCHEDULED */}
        <Section id="scheduled" title="Отправка по расписанию" icon={<Clock className="h-5 w-5" />}>
          <div className="space-y-3">
            {scheduled.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Нет запланированных рассылок</p>
            )}
            {scheduled.map(s => {
              const tpl = templates.find(t => t.id === s.template_id);
              const recipients = users.filter(u => s.user_ids.includes(u.id));
              const preset = CRON_PRESETS.find(p => p.value === s.cron);
              return (
                <div key={s.id} className={cn(
                  "p-3 rounded-xl border transition-all",
                  s.enabled ? "bg-green-50/70 border-green-200" : "bg-white/50 border-white/40"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{tpl?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        👥 {recipients.map(r => r.name).join(", ") || "никому"} · ⏰ {preset?.label || s.cron}
                      </p>
                      {s.last_sent && (
                        <p className="text-xs text-green-600">Последняя: {new Date(s.last_sent).toLocaleString("ru-RU")}</p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant={s.enabled ? "default" : "outline"}
                      className="h-8 w-8"
                      onClick={() => setScheduled(ss => ss.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setScheduled(ss => ss.filter(x => x.id !== s.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <div className="p-3 rounded-xl border border-dashed border-primary/30 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Новое расписание</p>
              <div className="space-y-2">
                <Label className="text-xs">Шаблон</Label>
                <select
                  value={newSched.template_id}
                  onChange={e => setNewSched(n => ({ ...n, template_id: e.target.value }))}
                  className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                >
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Получатели</Label>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setNewSched(n => ({
                        ...n,
                        user_ids: n.user_ids.includes(u.id)
                          ? n.user_ids.filter(id => id !== u.id)
                          : [...n.user_ids, u.id],
                      }))}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs border transition-all",
                        newSched.user_ids.includes(u.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white/60 border-border text-muted-foreground"
                      )}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Расписание</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setNewSched(n => ({ ...n, cron: p.value }))}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs border text-left transition-all",
                        newSched.cron === p.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white/60 border-border text-muted-foreground"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={newSched.cron}
                  onChange={e => setNewSched(n => ({ ...n, cron: e.target.value }))}
                  placeholder="Cron: * * * * *"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  if (!newSched.template_id || newSched.user_ids.length === 0) {
                    toast({ title: "Выберите шаблон и получателей", variant: "destructive" });
                    return;
                  }
                  setScheduled(ss => [...ss, { id: Date.now().toString(), ...newSched }]);
                  setNewSched({ template_id: templates[0]?.id || "", user_ids: [], cron: "0 9 * * *", enabled: true });
                  toast({ title: "✅ Расписание добавлено" });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Добавить расписание
              </Button>
            </div>
          </div>
        </Section>

        {/* NOTIFICATION RULES */}
        <Section id="notification-rules" title="Telegram уведомления" icon={<Bell className="h-5 w-5" />}>
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <p className="text-xs text-blue-700">
                Настройте правила автоматической отправки уведомлений при перемещениях белья или операциях в кассе.
                Укажите Chat ID получателя и события, которые должны вызывать отправку.
              </p>
            </div>
            <TelegramNotificationRules userId={currentUserId} />
          </div>
        </Section>

        {/* SEND NOW - quick panel */}
        <Section id="sendnow" title="Отправить сейчас" icon={<Send className="h-5 w-5" />}>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Шаблон</Label>
              <select
                id="quick-tpl"
                className="w-full h-9 text-sm rounded-md border border-input bg-background px-2"
                defaultValue={templates[0]?.id}
              >
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Получатель</Label>
              <div className="flex flex-wrap gap-2">
                {users.map(u => (
                  <Button
                    key={u.id}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={!u.chat_id || !botToken}
                    onClick={() => {
                      const sel = (document.getElementById("quick-tpl") as HTMLSelectElement)?.value;
                      sendNow(sel || templates[0]?.id, u.id);
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {u.name}
                  </Button>
                ))}
              </div>
              {(!botToken) && (
                <p className="text-xs text-amber-600">⚠️ Сначала настройте токен бота</p>
              )}
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
