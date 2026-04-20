import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Plus, CheckCircle2, Circle, Bot, FileText, Image as ImageIcon,
  Volume2, Loader2, Check, Camera, Mic, MicOff, X, Send, Clock,
  Paperclip, Phone, MapPin, ExternalLink, ChevronRight, ArrowLeft,
  Calendar, Edit2, Trash2, Pen, Type, ZoomIn
} from "lucide-react";
import RichTextEditor from "@/components/tasks/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CleaningUser { id: string; username: string; full_name: string; role: string; }
interface Attachment {
  id: string; file_name: string; file_url: string; file_type: string;
  transcription?: string; created_at?: string; task_step_id?: string; task_id?: string;
  created_by?: string;
}
interface TaskStep {
  id: string; description: string; emoji: string;
  contact_info?: string; documents_submitted?: string;
  documents_received?: string; information_obtained?: string;
  completed_date?: string; is_completed: boolean; sort_order: number;
  created_at?: string; updated_at?: string; attachments?: Attachment[];
}
interface Task {
  id: string; title: string; description: string; emoji: string;
  status: string; initiated_date: string; due_date?: string;
  created_by: string; created_at?: string; steps?: TaskStep[];
}

interface TimelineEvent {
  id: string; timestamp: string;
  kind: "created" | "field" | "image" | "voice" | "document" | "completed" | "chat_user" | "chat_ai";
  fieldLabel?: string; value?: string; attachment?: Attachment;
}

const TASK_EMOJIS = ["📋","🏠","📄","⚖️","🏥","🎓","💰","🔧","🚗","✈️","🏦","📞","🌐","🔑","📬"];
const STEP_EMOJIS = ["📝","📞","📧","🤝","📨","📥","📤","🗣️","✅","⏳","🔍","💬","🏢","📅","🖊️"];
const SUPPLY_CATEGORIES = [
  { emoji: "🧴", label: "Химия для уборки" }, { emoji: "💧", label: "Вода питьевая" },
  { emoji: "🛏️", label: "Постельное бельё" }, { emoji: "🍽️", label: "Кухонная утварь" },
  { emoji: "🧻", label: "Туалетная бумага" }, { emoji: "🧽", label: "Губки / тряпки" },
  { emoji: "🗑️", label: "Мешки для мусора" }, { emoji: "🪣", label: "Инвентарь" },
  { emoji: "🧹", label: "Другой расходник" },
];

// ─── SmartText ────────────────────────────────────────────────
function SmartText({ text }: { text: string }) {
  if (!text) return null;
  const urlRe = /https?:\/\/[^\s<>"]+/g;
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const phoneRe = /(\+\d[\d\s\-().]{6,18}\d)/g;
  const addressRe = /(?:calle|avenida|carrer|passeig|plaza|rua|via|straße|улица|проспект|ул\.|пр\.)\s+[^\n,.]{3,40}/gi;
  type Hit = { start: number; end: number; type: "url"|"phone"|"email"|"address"; value: string; display: string };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) hits.push({ start: m.index, end: m.index + m[0].length, type: "url", value: m[0], display: m[0] });
  while ((m = emailRe.exec(text)) !== null) hits.push({ start: m.index, end: m.index + m[0].length, type: "email", value: m[0], display: m[0] });
  while ((m = phoneRe.exec(text)) !== null) hits.push({ start: m.index, end: m.index + m[0].length, type: "phone", value: m[1].replace(/[\s\-().]/g,""), display: m[1] });
  while ((m = addressRe.exec(text)) !== null) hits.push({ start: m.index, end: m.index + m[0].length, type: "address", value: m[0], display: m[0] });
  hits.sort((a, b) => a.start - b.start);
  const filtered: Hit[] = [];
  for (const h of hits) { if (!filtered.length || h.start >= filtered[filtered.length-1].end) filtered.push(h); }
  if (!filtered.length) return <span className="whitespace-pre-wrap break-words">{text}</span>;
  const nodes: React.ReactNode[] = []; let cursor = 0;
  filtered.forEach((item, i) => {
    if (item.start > cursor) nodes.push(<span key={`t${i}`} className="whitespace-pre-wrap">{text.slice(cursor, item.start)}</span>);
    if (item.type === "url") nodes.push(<a key={`u${i}`} href={item.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 underline hover:text-blue-800"><ExternalLink className="h-3 w-3 shrink-0" />{item.display.slice(0,40)}{item.display.length>40?"…":""}</a>);
    else if (item.type === "email") nodes.push(<a key={`e${i}`} href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(item.value)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 underline hover:text-sky-800">✉️ {item.display}</a>);
    else if (item.type === "phone") nodes.push(<a key={`p${i}`} href={`tel:${item.value}`} className="inline-flex items-center gap-1 text-green-600 underline hover:text-green-800"><Phone className="h-3 w-3 shrink-0" />{item.display}</a>);
    else { const url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.value)}`; nodes.push(<a key={`a${i}`} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-orange-600 underline hover:text-orange-800"><MapPin className="h-3 w-3 shrink-0" />{item.display}</a>); }
    cursor = item.end;
  });
  if (cursor < text.length) nodes.push(<span key="tend" className="whitespace-pre-wrap">{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

// ─── EmojiPicker ─────────────────────────────────────────────
function EmojiPicker({ value, onChange, emojis }: { value: string; onChange: (e: string) => void; emojis: string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild><button className="text-2xl hover:scale-110 transition-transform shrink-0" type="button">{value}</button></PopoverTrigger>
      <PopoverContent className="w-64 p-2 z-[300]">
        <div className="grid grid-cols-5 gap-1">
          {emojis.map(e => <button key={e} type="button" onClick={() => onChange(e)} className={cn("text-xl p-1.5 rounded hover:bg-muted", e === value && "bg-primary/10 ring-1 ring-primary")}>{e}</button>)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── VoiceButton ──────────────────────────────────────────────
function VoiceButton({ onTranscription, onBlobOnly, disabled }: {
  onTranscription: (text: string, url: string, blob: Blob) => void;
  onBlobOnly?: (blob: Blob, url: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(",")[1];
            const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
              method: "POST",
              headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ audioBase64: base64, mimeType: "audio/webm" }),
            });
            const data = await res.json();
            if (data?.transcription) onTranscription(data.transcription, url, blob);
            else { onBlobOnly?.(blob, url); toast({ title: "🎙 Голос записан" }); }
            setTranscribing(false);
          };
          reader.readAsDataURL(blob);
        } catch { setTranscribing(false); toast({ title: "Ошибка транскрипции", variant: "destructive" }); }
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
    } catch { toast({ title: "Нет доступа к микрофону", variant: "destructive" }); }
  };
  const stop = () => { mrRef.current?.stop(); setRecording(false); };

  return (
    <button type="button" onClick={recording ? stop : start} disabled={disabled || transcribing}
      className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all",
        recording ? "bg-destructive/10 text-destructive border-destructive/30 animate-pulse" :
        transcribing ? "bg-muted text-muted-foreground border-muted" :
        "bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border")}>
      {transcribing ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Обработка...</span></> :
       recording ? <><MicOff className="h-4 w-4" /><span>Стоп</span></> :
       <><Mic className="h-4 w-4" /><span>Голос</span></>}
    </button>
  );
}

// ─── FilePickerButton ─────────────────────────────────────────
function FilePickerButton({ icon, label, accept, capture, onFile, disabled }: {
  icon: React.ReactNode; label: string; accept: string; capture?: boolean;
  onFile: (f: File) => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border disabled:opacity-50 transition-all">
        {icon}<span>{label}</span>
      </button>
      <input ref={ref} type="file" className="hidden" accept={accept}
        capture={capture ? "environment" : undefined}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
    </>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────
function AIChatPanel({ taskId, stepId, taskTitle, taskDescription, stepDescription, currentUserId, onApply }: {
  taskId: string; stepId?: string; taskTitle: string; taskDescription: string;
  stepDescription?: string; currentUserId: string; onApply?: (text: string, field: string) => void;
}) {
  const [messages, setMessages] = useState<{ id: string; role: "user"|"assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applyField, setApplyField] = useState("information_obtained");
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const hdr = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/task_chats?task_id=eq.${taskId}&order=created_at.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
      .then(r => r.json()).then(rows => {
        const filtered = stepId
          ? (rows||[]).filter((r: any) => r.content?.startsWith(`[step:${stepId}]`))
          : (rows||[]).filter((r: any) => !r.content?.match(/^\[step:/));
        setMessages(filtered.map((r: any) => ({ id: r.id, role: r.role, content: r.content.replace(/^\[step:[^\]]+\]\s*/,"") })));
        setLoaded(true);
      }).catch(() => setLoaded(true));
  }, [stepId ? `step_${stepId}` : `task_${taskId}`]);

  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }, [messages]);

  const saveMsg = async (role: "user"|"assistant", content: string) => {
    const prefixed = stepId ? `[step:${stepId}] ${content}` : content;
    await fetch(`${SUPABASE_URL}/rest/v1/task_chats`, {
      method: "POST", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({ task_id: taskId, role, content: prefixed, created_by: currentUserId })
    });
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = { id: Date.now().toString(), role: "user" as const, content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    await saveMsg("user", text);
    const context = stepDescription ? `Задача: ${taskTitle}\nПодзадача: ${stepDescription}\n${taskDescription}` : `Задача: ${taskTitle}\n${taskDescription}`;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/task-ai-chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })), taskTitle: context, taskDescription })
      });
      if (!resp.ok || !resp.body) throw new Error();
      const reader = resp.body.getReader(); const decoder = new TextDecoder();
      let buf = "", aiText = "";
      const aid = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aid, role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0,-1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim(); if (json === "[DONE]") break;
          try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) { aiText += c; setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: aiText } : m)); } } catch {}
        }
      }
      await saveMsg("assistant", aiText);
    } catch { toast({ title: "Ошибка ИИ", variant: "destructive" }); }
    setLoading(false);
  };

  const PRESETS = [
    { emoji: "📋", label: "Шаги", prompt: "Какие конкретные следующие шаги нужно предпринять?" },
    { emoji: "📞", label: "Телефоны", prompt: "Найди контактные телефоны нужных организаций в Валенсии" },
    { emoji: "📄", label: "Документы", prompt: "Какие документы нужны для этой задачи?" },
    { emoji: "✉️", label: "Письмо", prompt: "Помоги написать официальное письмо по этой задаче" },
    { emoji: "🗺️", label: "Маршрут", prompt: "Как добраться? Дай адрес и ссылку на карту" },
    { emoji: "⏰", label: "Сроки", prompt: "Какие типичные сроки рассмотрения?" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-to-b from-violet-50/50 to-background">
      <div className="flex items-center gap-2 px-4 py-3 bg-violet-100 border-b border-violet-200 shrink-0">
        <div className="p-1.5 bg-violet-200 rounded-lg"><Bot className="h-4 w-4 text-violet-700" /></div>
        <span className="font-semibold text-sm text-violet-800">ИИ-помощник</span>
        {stepDescription && <span className="text-xs text-violet-500 truncate">· {stepDescription.slice(0,30)}</span>}
      </div>
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="px-4 pt-4 pb-2 shrink-0">
              <p className="text-xs text-muted-foreground mb-2.5">⚡ Быстрые запросы:</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(q => (
                  <button key={q.label} onClick={() => send(q.prompt)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white hover:bg-violet-100 text-violet-700 border border-violet-200 transition-colors">
                    {q.emoji} {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words",
                  msg.role === "user" ? "bg-violet-600 text-white rounded-tr-sm" : "bg-white text-foreground rounded-tl-sm border shadow-sm")}>
                  {msg.role === "assistant" ? <SmartText text={msg.content || (loading ? "..." : "")} /> : msg.content}
                </div>
              </div>
            ))}
            {messages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESETS.slice(0,3).map(q => (
                  <button key={q.label} onClick={() => send(q.prompt)}
                    className="text-xs px-2.5 py-1 rounded-full bg-white hover:bg-violet-50 text-violet-600 border border-violet-200 transition-colors">
                    {q.emoji} {q.label}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {onApply && messages.some(m => m.role === "assistant") && (
            <div className="px-4 py-2 border-t border-violet-200 bg-white/80 flex items-center gap-2 shrink-0 flex-wrap">
              <span className="text-xs text-muted-foreground">Применить к:</span>
              <select value={applyField} onChange={e => setApplyField(e.target.value)} className="text-xs border rounded px-1.5 py-0.5 bg-white flex-1 min-w-0">
                <option value="contact_info">Контакт</option>
                <option value="information_obtained">Информация</option>
                <option value="documents_submitted">Документы поданы</option>
                <option value="documents_received">Документы получены</option>
              </select>
              <button onClick={() => { const last=[...messages].reverse().find(m=>m.role==="assistant"); if(last){onApply(last.content,applyField);toast({title:"✅ Совет применён"});} }}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors font-medium">Применить</button>
            </div>
          )}
          <div className="px-4 py-3 border-t border-violet-200 bg-white/80 shrink-0">
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl border overflow-hidden">
                <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Спросите ИИ..."
                  className="border-0 focus-visible:ring-0 h-10 text-sm"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
              </div>
              <VoiceButton onTranscription={(text) => send(text)} disabled={loading} />
              <button type="button" onClick={() => send(input)} disabled={!input.trim() || loading}
                className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TimelineView ─────────────────────────────────────────────
function TimelineView({ step, chats }: { step: TaskStep; chats: { role: string; content: string; created_at: string }[] }) {
  const events: TimelineEvent[] = [];
  if (step.created_at) events.push({ id: "created", timestamp: step.created_at, kind: "created", value: step.description });
  if (step.contact_info) events.push({ id: "contact", timestamp: step.updated_at || step.created_at || "", kind: "field", fieldLabel: "📞 Контакт", value: step.contact_info });
  if (step.information_obtained) events.push({ id: "info", timestamp: step.updated_at || step.created_at || "", kind: "field", fieldLabel: "📥 Информация", value: step.information_obtained });
  if (step.documents_submitted) events.push({ id: "docs_out", timestamp: step.updated_at || step.created_at || "", kind: "field", fieldLabel: "📤 Документы поданы", value: step.documents_submitted });
  if (step.documents_received) events.push({ id: "docs_in", timestamp: step.updated_at || step.created_at || "", kind: "field", fieldLabel: "📨 Документы получены", value: step.documents_received });
  (step.attachments || []).forEach(att => events.push({
    id: att.id, timestamp: att.created_at || step.created_at || "",
    kind: att.file_type === "image" ? "image" : att.file_type === "voice" ? "voice" : "document",
    attachment: att
  }));
  chats.forEach((msg, i) => events.push({ id: `chat_${i}`, timestamp: msg.created_at, kind: msg.role === "user" ? "chat_user" : "chat_ai", value: msg.content }));
  if (step.is_completed && step.completed_date) events.push({ id: "completed", timestamp: step.completed_date, kind: "completed", value: "Подзадача выполнена" });
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (!events.length) return <p className="text-sm text-muted-foreground text-center py-12">Нет записей в хронологии</p>;

  const dot = (kind: string) => ({
    "created": "bg-blue-500", "completed": "bg-green-500",
    "chat_ai": "bg-violet-400", "chat_user": "bg-violet-600",
    "image": "bg-sky-400", "voice": "bg-purple-400", "document": "bg-amber-400",
  }[kind] || "bg-muted-foreground");

  return (
    <div className="space-y-0 py-2">
      {events.map((ev, i) => {
        const ts = ev.timestamp ? (() => { try { return format(new Date(ev.timestamp), "dd.MM HH:mm", { locale: ru }); } catch { return ""; } })() : "";
        return (
          <div key={ev.id} className="flex gap-3 py-3 relative">
            {i < events.length - 1 && <div className="absolute left-[9px] top-8 bottom-0 w-0.5 bg-border" />}
            <div className={cn("w-[18px] h-[18px] rounded-full border-2 border-background shadow shrink-0 mt-1 z-10", dot(ev.kind))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {ev.kind==="created"?"📌 Создана":ev.kind==="completed"?"✅ Выполнена":ev.kind==="chat_user"?"💬 Вопрос ИИ":ev.kind==="chat_ai"?"🤖 Ответ ИИ":ev.kind==="image"?"🖼 Фото":ev.kind==="voice"?"🎙 Голосовая заметка":ev.kind==="document"?"📎 Документ":ev.fieldLabel||""}
                </span>
                {ts && <span className="text-xs text-muted-foreground/50 tabular-nums">{ts}</span>}
              </div>
              {ev.kind==="image"&&ev.attachment&&(
                <a href={ev.attachment.file_url} target="_blank" rel="noopener noreferrer">
                  <img src={ev.attachment.file_url} alt="" className="max-h-48 max-w-full object-cover rounded-xl border shadow-sm hover:opacity-90 transition-opacity" />
                </a>
              )}
              {ev.kind==="voice"&&ev.attachment&&(
                <div className="space-y-2">
                  {ev.attachment.transcription&&<p className="text-sm italic text-foreground bg-muted/30 rounded-xl px-3 py-2">"{ev.attachment.transcription}"</p>}
                  <audio src={ev.attachment.file_url} controls className="h-9 w-full max-w-sm" />
                </div>
              )}
              {ev.kind==="document"&&ev.attachment&&(
                <a href={ev.attachment.file_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100 hover:bg-blue-100 transition-colors">
                  <FileText className="h-4 w-4 shrink-0" />{ev.attachment.file_name}
                </a>
              )}
              {(ev.kind==="created"||ev.kind==="completed"||ev.kind==="field")&&ev.value&&(
                <p className="text-sm text-foreground"><SmartText text={ev.value} /></p>
              )}
              {ev.kind==="chat_user"&&ev.value&&(
                <div className="bg-violet-50 rounded-xl px-3 py-2 text-sm text-violet-900 border border-violet-100">{ev.value.replace(/^\[step:[^\]]+\]\s*/,"")}</div>
              )}
              {ev.kind==="chat_ai"&&ev.value&&(
                <div className="bg-white rounded-xl px-3 py-2 text-sm border shadow-sm"><SmartText text={ev.value.replace(/^\[step:[^\]]+\]\s*/,"")} /></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── InlineTextButton ─────────────────────────────────────────
function InlineTextButton({ onSave }: { onSave: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (open) {
    return (
      <div className="w-full mt-2 space-y-2 rounded-xl border bg-card p-3">
        <RichTextEditor value={text} onChange={setText} placeholder="Добавить текстовую заметку..." rows={3} autoFocus />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => { setOpen(false); setText(""); }}
            className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors">Отмена</button>
          <button type="button" onClick={() => { if (text.trim()) { onSave(text); setOpen(false); setText(""); } }}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">Сохранить</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border transition-all">
      <Type className="h-4 w-4" /><span>Текст</span>
    </button>
  );
}

// ─── StepDetailPanel ──────────────────────────────────────────
function StepDetailPanel({ step, task, currentUser, apiCall, headers, onReload, isAdminOrCoord }: {
  step: TaskStep; task: Task; currentUser: CleaningUser;
  apiCall: (path: string, opts?: RequestInit) => Promise<any>;
  headers: Record<string, string>;
  onReload: () => Promise<void>;
  isAdminOrCoord: boolean;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [fieldVals, setFieldVals] = useState({
    contact_info: step.contact_info || "",
    information_obtained: step.information_obtained || "",
    documents_submitted: step.documents_submitted || "",
    documents_received: step.documents_received || "",
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields"|"timeline"|"ai">("fields");
  const [stepChats, setStepChats] = useState<any[]>([]);
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    setFieldVals({ contact_info: step.contact_info||"", information_obtained: step.information_obtained||"", documents_submitted: step.documents_submitted||"", documents_received: step.documents_received||"" });
    fetch(`${SUPABASE_URL}/rest/v1/task_chats?task_id=eq.${task.id}&order=created_at.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
      .then(r => r.json()).then(rows => setStepChats((rows||[]).filter((r: any) => r.content?.startsWith(`[step:${step.id}]`))));
  }, [step.id]);

  // Upload file to storage and save attachment record
  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const path = `steps/${task.id}/${step.id}/${safeName}`;

      // Use fetch directly to upload — more reliable across all file types
      const SUPABASE_URL_VAL = import.meta.env.VITE_SUPABASE_URL;
      const KEY_VAL = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const uploadRes = await fetch(
        `${SUPABASE_URL_VAL}/storage/v1/object/task-attachments/${path}`,
        {
          method: "POST",
          headers: {
            apikey: KEY_VAL,
            Authorization: `Bearer ${KEY_VAL}`,
            "Content-Type": file.type || "application/octet-stream",
            "x-upsert": "false",
          },
          body: file,
        }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Storage: ${uploadRes.status} ${errText}`);
      }

      const publicUrl = `${SUPABASE_URL_VAL}/storage/v1/object/public/task-attachments/${path}`;
      const fileType = file.type.startsWith("image") ? "image" : "document";
      const { error: dbError } = await supabase.from("task_attachments").insert({
        task_step_id: step.id, task_id: task.id,
        file_name: file.name, file_url: publicUrl,
        file_type: fileType, created_by: currentUser.id,
      });
      if (dbError) throw dbError;
      await onReload();
      toast({ title: fileType === "image" ? "🖼 Фото добавлено" : "📎 Документ прикреплён" });
    } catch (e: any) {
      console.error("Upload error:", e);
      toast({ title: `Ошибка загрузки: ${e?.message || String(e)}`, variant: "destructive" });
    }
    setUploading(false);
  };

  // Upload voice blob to storage
  const addVoice = async (transcription: string, audioUrl: string, blob: Blob) => {
    setUploading(true);
    try {
      const path = `steps/${task.id}/${step.id}/voice_${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, blob, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("task-attachments").getPublicUrl(path);
      const { error: dbError } = await supabase.from("task_attachments").insert({
        task_step_id: step.id, task_id: task.id,
        file_name: "voice-note.webm", file_url: urlData.publicUrl,
        file_type: "voice", transcription, created_by: currentUser.id
      });
      if (dbError) throw dbError;
      await onReload();
      toast({ title: "🎙 Голосовая заметка сохранена" });
    } catch (e: any) {
      console.error("Voice upload error:", e);
      toast({ title: `Ошибка: ${e?.message || e}`, variant: "destructive" });
    }
    setUploading(false);
  };

  const saveField = async (field: string, value: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("task_steps").update({ [field]: value || null }).eq("id", step.id);
      if (error) throw error;
      await onReload(); setEditField(null);
      toast({ title: "✅ Сохранено" });
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
    setSaving(false);
  };

  const toggleComplete = async () => {
    await supabase.from("task_steps").update({
      is_completed: !step.is_completed,
      completed_date: !step.is_completed ? format(new Date(), "yyyy-MM-dd") : null
    }).eq("id", step.id);
    await onReload();
  };

  const applyAI = async (text: string, field: string) => {
    setFieldVals(prev => ({ ...prev, [field]: text }));
    await saveField(field, text);
  };

  const FIELDS = [
    { key: "contact_info", label: "📞 Контакт / с кем", placeholder: "Имя, организация, телефон..." },
    { key: "information_obtained", label: "📥 Информация получена", placeholder: "Что узнали, ответы, решения..." },
    { key: "documents_submitted", label: "📤 Документы поданы", placeholder: "Перечень поданных документов..." },
    { key: "documents_received", label: "📨 Документы получены", placeholder: "Перечень полученных документов..." },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Step header */}
      <div className={cn("px-4 py-3 border-b shrink-0 flex items-center gap-3", step.is_completed ? "bg-green-50" : "bg-muted/20")}>
        <button onClick={toggleComplete} type="button" className="shrink-0 p-0.5">
          {step.is_completed ? <CheckCircle2 className="h-6 w-6 text-green-500" /> : <Circle className="h-6 w-6 text-muted-foreground" />}
        </button>
        <span className="text-2xl">{step.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-base", step.is_completed && "line-through text-muted-foreground")}>{step.description}</p>
          {step.created_at && <p className="text-xs text-muted-foreground mt-0.5">🕐 {format(new Date(step.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}</p>}
        </div>
      </div>

      {/* Universal quick-add bar — FULL WIDTH */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Добавить в хронологию:
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <VoiceButton onTranscription={addVoice} disabled={uploading} />
          <FilePickerButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" accept="image/*" onFile={uploadFile} disabled={uploading} />
          <FilePickerButton icon={<Camera className="h-4 w-4" />} label="Камера" accept="image/*" capture onFile={uploadFile} disabled={uploading} />
          <FilePickerButton icon={<Paperclip className="h-4 w-4" />} label="Документ" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onFile={uploadFile} disabled={uploading} />
          <InlineTextButton onSave={(text) => {
            setFieldVals(prev => ({ ...prev, information_obtained: prev.information_obtained ? prev.information_obtained + "\n" + text : text }));
            saveField("information_obtained", (fieldVals.information_obtained ? fieldVals.information_obtained + "\n" : "") + text);
          }} />
          {uploading && <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка...</div>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        {[{ key:"fields", label:"✏️ Поля" }, { key:"timeline", label:"⏱ Хронология" }, { key:"ai", label:"🤖 ИИ" }].map(tab => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as any)}
            className={cn("flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key ? "border-primary text-primary bg-background" : "border-transparent text-muted-foreground hover:text-foreground bg-muted/10")}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — flex-1 fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "fields" && (
          <div className="p-4 space-y-5">
            {FIELDS.map(f => (
              <div key={f.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{f.label}</Label>
                  {editField !== f.key && (
                    <button type="button" onClick={() => setEditField(f.key)}
                      className="text-xs text-primary hover:underline flex items-center gap-1">
                      <Edit2 className="h-3 w-3" />
                      {fieldVals[f.key as keyof typeof fieldVals] ? "Изменить" : "+ Добавить"}
                    </button>
                  )}
                </div>
                {editField === f.key ? (
                  <div className="space-y-2">
                    <RichTextEditor
                      value={fieldVals[f.key as keyof typeof fieldVals]}
                      onChange={val => setFieldVals(prev => ({ ...prev, [f.key]: val }))}
                      placeholder={f.placeholder} rows={3} autoFocus
                    />
                    {/* Voice input for this field */}
                    <div className="flex items-center gap-2">
                      <VoiceButton
                        onTranscription={(text, url, blob) => {
                          setFieldVals(prev => ({ ...prev, [f.key]: prev[f.key as keyof typeof fieldVals] ? prev[f.key as keyof typeof fieldVals] + " " + text : text }));
                          addVoice(text, url, blob);
                        }}
                        disabled={uploading}
                      />
                      <FilePickerButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" accept="image/*" onFile={uploadFile} disabled={uploading} />
                      <FilePickerButton icon={<Paperclip className="h-4 w-4" />} label="Файл" accept=".pdf,.doc,.docx,.txt" onFile={uploadFile} disabled={uploading} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setEditField(null)}>Отмена</Button>
                      <Button size="sm" onClick={() => saveField(f.key, fieldVals[f.key as keyof typeof fieldVals])} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} Сохранить
                      </Button>
                    </div>
                  </div>
                ) : fieldVals[f.key as keyof typeof fieldVals] ? (
                  <div className="text-sm bg-muted/30 rounded-xl px-3 py-3 break-words border">
                    <SmartText text={fieldVals[f.key as keyof typeof fieldVals]} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic px-1">Не заполнено</p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="px-4">
            <TimelineView step={step} chats={stepChats} />
          </div>
        )}

        {activeTab === "ai" && (
          <div className="h-full" style={{ minHeight: "calc(100vh - 280px)" }}>
            <AIChatPanel
              taskId={task.id} stepId={step.id}
              taskTitle={task.title} taskDescription={task.description}
              stepDescription={step.description}
              currentUserId={currentUser.id}
              onApply={applyAI}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TaskDetailModal ──────────────────────────────────────────
function TaskDetailModal({ task, currentUser, onClose, onReload }: {
  task: Task; currentUser: CleaningUser;
  onClose: () => void; onReload: () => void;
}) {
  const { toast } = useToast();
  const isAdminOrCoord = currentUser.role === "admin" || currentUser.role === "coordinator";
  const [steps, setSteps] = useState<TaskStep[]>(task.steps || []);
  const [activeStep, setActiveStep] = useState<TaskStep | null>(null);
  const [showNewStep, setShowNewStep] = useState(false);
  const [showTaskAI, setShowTaskAI] = useState(false);
  const [stepDesc, setStepDesc] = useState("");
  const [stepEmoji, setStepEmoji] = useState("📝");
  const [savingStep, setSavingStep] = useState(false);
  // Task-level attachments
  const [taskAttachments, setTaskAttachments] = useState<Attachment[]>((task.steps || []).flatMap(s => s.attachments || []).filter(a => !a.task_step_id));
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<"image"|"annotate">("image");
  // Photo annotation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotateMode, setAnnotateMode] = useState<"pen"|"text">("pen");
  const [isDrawing, setIsDrawing] = useState(false);
  const annotateImgRef = useRef<HTMLImageElement | null>(null);
  const lastPosRef = useRef<{x:number;y:number}|null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

  useEffect(() => { loadSteps(); }, [task.id]);

  const loadSteps = async () => {
    const [stepsData, attachments] = await Promise.all([
      supabase.from("task_steps").select("*").eq("task_id", task.id).order("sort_order"),
      supabase.from("task_attachments").select("*").eq("task_id", task.id).order("created_at"),
    ]);
    const allAtts = attachments.data || [];
    const merged = (stepsData.data || []).map(s => ({ ...s, attachments: allAtts.filter(a => a.task_step_id === s.id) }));
    setSteps(merged);
    // Task-level attachments: no task_step_id
    setTaskAttachments(allAtts.filter(a => !a.task_step_id));
    if (activeStep) {
      const updated = merged.find(s => s.id === activeStep.id);
      if (updated) setActiveStep(updated);
    }
  };

  // Upload file at task level
  const uploadTaskFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const path = `tasks/${task.id}/${safeName}`;
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/task-attachments/${path}`,
        { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file }
      );
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/task-attachments/${path}`;
      const fileType = file.type.startsWith("image") ? "image" : "document";
      const { error } = await supabase.from("task_attachments").insert({
        task_id: task.id, file_name: file.name, file_url: publicUrl,
        file_type: fileType, created_by: currentUser.id,
      });
      if (error) throw error;
      await loadSteps();
      toast({ title: fileType === "image" ? "🖼 Фото добавлено" : "📎 Файл прикреплён" });
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
    setUploading(false);
  };

  // Upload voice note at task level
  const addTaskVoice = async (transcription: string, audioUrl: string, blob: Blob) => {
    setUploading(true);
    try {
      const path = `tasks/${task.id}/voice_${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, blob, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("task-attachments").getPublicUrl(path);
      const { error } = await supabase.from("task_attachments").insert({
        task_id: task.id, file_name: "voice-note.webm", file_url: urlData.publicUrl,
        file_type: "voice", transcription, created_by: currentUser.id
      });
      if (error) throw error;
      await loadSteps();
      toast({ title: "🎙 Голосовая заметка сохранена" });
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
    setUploading(false);
  };

  // Delete task-level attachment
  const deleteTaskAttachment = async (att: Attachment) => {
    if (!confirm(`Удалить ${att.file_name}?`)) return;
    try {
      const { error } = await supabase.from("task_attachments").delete().eq("id", att.id);
      if (error) throw error;
      await loadSteps();
      toast({ title: "🗑 Удалено" });
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
  };

  // Canvas annotation helpers
  const initCanvas = (imgUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      annotateImgRef.current = img;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
    };
    img.src = imgUrl;
  };

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const createStep = async () => {
    if (!stepDesc.trim()) return;
    setSavingStep(true);
    try {
      const { error } = await supabase.from("task_steps").insert({
        task_id: task.id, description: stepDesc, emoji: stepEmoji,
        sort_order: steps.length, created_by: currentUser.id
      });
      if (error) throw error;
      await loadSteps();
      setShowNewStep(false); setStepDesc(""); setStepEmoji("📝");
      toast({ title: "✅ Подзадача добавлена" });
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
    setSavingStep(false);
  };

  const completedCount = steps.filter(s => s.is_completed).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  const markTaskComplete = async () => {
    await supabase.from("tasks").update({ status: task.status === "completed" ? "active" : "completed" }).eq("id", task.id);
    onReload(); onClose();
  };

  // Photo lightbox / annotation overlay
  const PhotoLightbox = lightboxUrl ? (
    <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {lightboxType === "annotate" && (
            <>
              <button onClick={() => setAnnotateMode("pen")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all",
                  annotateMode === "pen" ? "bg-primary text-primary-foreground border-primary" : "bg-white/10 text-white border-white/20")}>
                <Pen className="h-4 w-4" /> Рисовать
              </button>
              <button onClick={() => setAnnotateMode("text")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all",
                  annotateMode === "text" ? "bg-primary text-primary-foreground border-primary" : "bg-white/10 text-white border-white/20")}>
                <Type className="h-4 w-4" /> Текст
              </button>
              <button
                onClick={() => {
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const file = new File([blob], `annotated_${Date.now()}.png`, { type: "image/png" });
                    await uploadTaskFile(file);
                    setLightboxUrl(null);
                    toast({ title: "✅ Фото с пометками сохранено" });
                  }, "image/png");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-green-600 text-white border border-green-500">
                <Check className="h-4 w-4" /> Сохранить
              </button>
            </>
          )}
          {lightboxType === "image" && (
            <button onClick={() => { setLightboxType("annotate"); initCanvas(lightboxUrl); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-white/10 text-white border border-white/20">
              <Pen className="h-4 w-4" /> Пометки
            </button>
          )}
        </div>
        <button onClick={() => { setLightboxUrl(null); setLightboxType("image"); setIsDrawing(false); }}
          className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden p-2 min-h-0">
        {lightboxType === "image" ? (
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain rounded-xl touch-none cursor-crosshair"
            style={{ background: "#000" }}
            onPointerDown={(e) => {
              setIsDrawing(true);
              const pos = getCanvasPos(e);
              lastPosRef.current = pos;
              if (annotateMode === "text") {
                const text = prompt("Введите текст:");
                if (text) {
                  const ctx = canvasRef.current!.getContext("2d")!;
                  ctx.font = `bold ${Math.max(24, canvasRef.current!.width / 20)}px Arial`;
                  ctx.fillStyle = "#FF3B30";
                  ctx.strokeStyle = "#fff";
                  ctx.lineWidth = 2;
                  ctx.strokeText(text, pos.x, pos.y);
                  ctx.fillText(text, pos.x, pos.y);
                }
              }
            }}
            onPointerMove={(e) => {
              if (!isDrawing || annotateMode !== "pen") return;
              const canvas = canvasRef.current!;
              const ctx = canvas.getContext("2d")!;
              const pos = getCanvasPos(e);
              if (lastPosRef.current) {
                ctx.beginPath();
                ctx.strokeStyle = "#FF3B30";
                ctx.lineWidth = Math.max(3, canvas.width / 150);
                ctx.lineCap = "round";
                ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
              }
              lastPosRef.current = pos;
            }}
            onPointerUp={() => { setIsDrawing(false); lastPosRef.current = null; }}
          />
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {PhotoLightbox}
      <div className="fixed inset-0 z-[150] bg-background flex flex-col" style={{ height: "100dvh" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b bg-card shrink-0 shadow-sm">
        <button onClick={() => { if (activeStep) setActiveStep(null); else onClose(); }} type="button"
          className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-xl shrink-0">{task.emoji}</span>
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 mb-0.5">
            <button onClick={onClose} type="button"
              className="text-xs font-semibold text-primary hover:underline transition-colors px-1.5 py-0.5 rounded-md hover:bg-primary/10 active:bg-primary/20">
              ← Задачи
            </button>
            {activeStep && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <button onClick={() => setActiveStep(null)} type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors truncate max-w-[120px]">
                  {task.title}
                </button>
              </>
            )}
          </div>
          <h2 className="font-bold text-sm truncate">{activeStep ? activeStep.description : task.title}</h2>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className={cn("text-xs px-1.5 py-0.5 rounded-full", task.status==="completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
              {task.status==="completed" ? "✅ Завершено" : "🔄 Активна"}
            </span>
            {!activeStep && steps.length > 0 && <span className="text-xs text-muted-foreground">📊 {completedCount}/{steps.length}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdminOrCoord && !activeStep && (
            <button onClick={markTaskComplete} type="button"
              className={cn("flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium border transition-colors",
                task.status==="completed" ? "bg-muted text-muted-foreground border-border" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100")}>
              <Check className="h-3.5 w-3.5" />{task.status==="completed"?"Вернуть":"Готово"}
            </button>
          )}
          {!activeStep && (
            <button onClick={() => setShowTaskAI(s => !s)} type="button"
              className={cn("flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium border transition-colors",
                showTaskAI ? "bg-violet-600 text-white border-violet-600" : "text-violet-600 border-violet-300 hover:bg-violet-50")}>
              <Bot className="h-3.5 w-3.5" /> ИИ
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {steps.length > 0 && (
        <div className="h-1 bg-muted shrink-0">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Body — fills all remaining space */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Main content */}
        <div className={cn("flex-1 overflow-hidden flex flex-col min-h-0 min-w-0", showTaskAI && "hidden lg:flex")}>
          {activeStep ? (
            <StepDetailPanel
              step={activeStep} task={task} currentUser={currentUser}
              apiCall={async (path, opts) => {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, ...opts });
                if (!res.ok) throw new Error(await res.text());
                if (res.status === 204) return null;
                return res.json();
              }}
              headers={headers}
              onReload={loadSteps}
              isAdminOrCoord={isAdminOrCoord}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Task description */}
              {task.description && (
                <div className="mx-4 mt-4 bg-muted/30 rounded-xl px-4 py-3 text-sm text-foreground border">
                  <p className="text-xs text-muted-foreground font-medium mb-1">📝 Описание</p>
                  <SmartText text={task.description} />
                </div>
              )}

              {/* Task-level media & attachments */}
              <div className="mx-4 mt-3 space-y-2">
                {/* Universal quick-add bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <VoiceButton onTranscription={addTaskVoice} disabled={uploading} />
                  <FilePickerButton icon={<Camera className="h-4 w-4" />} label="Камера" accept="image/*" capture onFile={uploadTaskFile} disabled={uploading} />
                  <FilePickerButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" accept="image/*" onFile={uploadTaskFile} disabled={uploading} />
                  <FilePickerButton icon={<Paperclip className="h-4 w-4" />} label="Файл" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onFile={uploadTaskFile} disabled={uploading} />
                  <InlineTextButton onSave={(text) => {
                    // Save as a text attachment note
                    const blob = new Blob([text], { type: "text/plain" });
                    const file = new File([blob], `note_${Date.now()}.txt`, { type: "text/plain" });
                    uploadTaskFile(file);
                  }} />
                  {uploading && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загрузка...</div>}
                </div>

                {/* Task-level attachments */}
                {taskAttachments.length > 0 && (
                  <div className="space-y-2">
                    {/* Images grid */}
                    {taskAttachments.filter(a => a.file_type === "image").length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {taskAttachments.filter(a => a.file_type === "image").map(att => (
                          <div key={att.id} className="relative group rounded-xl overflow-hidden border aspect-square bg-muted">
                            <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                              <button onClick={() => { setLightboxUrl(att.file_url); setLightboxType("image"); }}
                                className="p-1.5 bg-white/90 rounded-lg text-foreground hover:bg-white transition-colors">
                                <ZoomIn className="h-4 w-4" />
                              </button>
                              <button onClick={() => deleteTaskAttachment(att)}
                                className="p-1.5 bg-destructive/90 rounded-lg text-white hover:bg-destructive transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Voice notes */}
                    {taskAttachments.filter(a => a.file_type === "voice").map(att => (
                      <div key={att.id} className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border">
                        <div className="flex-1 space-y-1.5 min-w-0">
                          {att.transcription && <p className="text-xs italic text-muted-foreground line-clamp-2">"{att.transcription}"</p>}
                          <audio src={att.file_url} controls className="h-8 w-full max-w-xs" />
                        </div>
                        <button onClick={() => deleteTaskAttachment(att)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {/* Documents */}
                    {taskAttachments.filter(a => a.file_type === "document").map(att => (
                      <div key={att.id} className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border">
                        <a href={att.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center gap-2 text-sm text-primary hover:underline min-w-0">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate">{att.file_name}</span>
                        </a>
                        <button onClick={() => deleteTaskAttachment(att)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 space-y-3">
                {steps.length === 0 && !showNewStep && (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-5xl mb-3">📂</p>
                    <p className="font-medium text-base">Нет подзадач</p>
                    {isAdminOrCoord && <p className="text-sm mt-1 text-muted-foreground/60">Нажмите «+ Добавить подзадачу»</p>}
                  </div>
                )}

                {steps.map((step, idx) => (
                  <button key={step.id} type="button" onClick={() => setActiveStep(step)}
                    className="w-full text-left rounded-xl border bg-card hover:bg-muted/20 transition-all shadow-sm active:scale-[0.99] overflow-hidden">
                    <div className="px-4 py-4 flex items-center gap-3">
                      <div className={cn("shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center",
                        step.is_completed ? "bg-green-500 border-green-500" : "border-muted-foreground/40")}>
                        {step.is_completed && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className="text-xl shrink-0">{step.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-base truncate", step.is_completed && "line-through text-muted-foreground")}>
                          {idx + 1}. {step.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {step.created_at && <span className="text-xs text-muted-foreground">🕐 {format(new Date(step.created_at), "dd.MM.yyyy", { locale: ru })}</span>}
                          {(step.attachments||[]).length > 0 && <span className="text-xs text-muted-foreground">📎 {(step.attachments||[]).length}</span>}
                          {step.contact_info && <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-100">📞</span>}
                          {step.information_obtained && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full border border-green-100">📥</span>}
                          {step.documents_submitted && <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full border border-purple-100">📤</span>}
                          {step.documents_received && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100">📨</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </button>
                ))}

                {/* New step form */}
                {isAdminOrCoord && showNewStep && (
                  <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                    <p className="text-sm font-semibold">➕ Новая подзадача</p>
                    <div className="flex items-start gap-2">
                      <EmojiPicker value={stepEmoji} onChange={setStepEmoji} emojis={STEP_EMOJIS} />
                      <RichTextEditor value={stepDesc} onChange={setStepDesc}
                        placeholder="Описание подзадачи..." rows={2} autoFocus className="flex-1" />
                    </div>
                    {/* Universal input bar for subtask creation */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <VoiceButton onTranscription={(text) => setStepDesc(prev => prev ? prev + " " + text : text)} />
                      <FilePickerButton icon={<Camera className="h-4 w-4" />} label="Камера" accept="image/*" capture onFile={() => {}} />
                      <FilePickerButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" accept="image/*" onFile={() => {}} />
                      <FilePickerButton icon={<Paperclip className="h-4 w-4" />} label="Файл" accept=".pdf,.doc,.docx,.txt" onFile={() => {}} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setShowNewStep(false); setStepDesc(""); setStepEmoji("📝"); }}>Отмена</Button>
                      <Button size="sm" onClick={createStep} disabled={savingStep || !stepDesc.trim()}>
                        {savingStep ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} Добавить
                      </Button>
                    </div>
                  </div>
                )}

                {isAdminOrCoord && !showNewStep && (
                  <button type="button" onClick={() => setShowNewStep(true)}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                    <Plus className="h-4 w-4" /> Добавить подзадачу
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Task-level AI side panel */}
        {showTaskAI && (
          <div className={cn("flex flex-col border-l bg-background min-h-0 overflow-hidden", "w-full lg:w-[420px] flex-shrink-0")}>
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <span className="font-semibold text-sm flex items-center gap-1.5"><Bot className="h-4 w-4 text-violet-600" /> ИИ по задаче</span>
              <button onClick={() => setShowTaskAI(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <AIChatPanel
                taskId={task.id} taskTitle={task.title} taskDescription={task.description}
                currentUserId={currentUser.id}
              />
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

// ─── Main TasksTab ────────────────────────────────────────────
interface VoiceTaskData { title: string; description: string; emoji?: string; steps?: Array<{ description: string; emoji?: string }> }
interface TasksTabProps { currentUser: CleaningUser; pendingVoiceTask?: VoiceTaskData | null; onPendingVoiceTaskHandled?: () => void; }

// ─── TaskAIModal ─────────────────────────────────────────────
function TaskAIModal({ task, currentUser, onClose }: { task: Task; currentUser: CleaningUser; onClose: () => void }) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const hdr = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const [allChats, setAllChats] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [steps, setSteps] = useState<{ id: string; description: string; emoji: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const loadChats = async () => {
    const [chatsRes, stepsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/task_chats?task_id=eq.${task.id}&order=created_at.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then(r => r.json()),
      supabase.from("task_steps").select("id,description,emoji").eq("task_id", task.id).order("sort_order"),
    ]);
    setAllChats(chatsRes || []);
    setSteps(stepsRes.data || []);
    setLoaded(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  useEffect(() => { loadChats(); }, [task.id]);

  const getStepLabel = (content: string) => {
    const m = content.match(/^\[step:([^\]]+)\]/);
    if (!m) return null;
    const step = steps.find(s => s.id === m[1]);
    return step ? `${step.emoji} ${step.description}` : "Подзадача";
  };

  const cleanContent = (content: string) => content.replace(/^\[step:[^\]]+\]\s*/, "");

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    setInput("");
    const userMsg = { id: Date.now().toString(), role: "user", content: text, created_at: new Date().toISOString() };
    setAllChats(prev => [...prev, userMsg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    // Save user msg
    await fetch(`${SUPABASE_URL}/rest/v1/task_chats`, {
      method: "POST", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({ task_id: task.id, role: "user", content: text, created_by: currentUser.id })
    });

    // Stream AI response
    try {
      const msgs = allChats.filter(m => !m.id?.toString().startsWith(Date.now().toString().slice(0,-3)));
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/task-ai-chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ messages: [...msgs, userMsg].map(m => ({ role: m.role, content: cleanContent(m.content) })), taskTitle: task.title, taskDescription: task.description })
      });
      if (!resp.ok || !resp.body) throw new Error();
      const reader = resp.body.getReader(); const decoder = new TextDecoder();
      let buf = "", aiText = "";
      const aid = (Date.now() + 1).toString();
      setAllChats(prev => [...prev, { id: aid, role: "assistant", content: "", created_at: new Date().toISOString() }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0,-1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim(); if (json === "[DONE]") break;
          try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) { aiText += c; setAllChats(prev => prev.map(m => m.id === aid ? { ...m, content: aiText } : m)); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 20); } } catch {}
        }
      }
      await fetch(`${SUPABASE_URL}/rest/v1/task_chats`, {
        method: "POST", headers: { ...hdr, Prefer: "return=minimal" },
        body: JSON.stringify({ task_id: task.id, role: "assistant", content: aiText, created_by: currentUser.id })
      });
    } catch { toast({ title: "Ошибка ИИ", variant: "destructive" }); }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col" style={{ height: "100dvh" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-violet-50 shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="p-1.5 bg-violet-200 rounded-lg shrink-0"><Bot className="h-4 w-4 text-violet-700" /></div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{task.emoji} {task.title}</p>
          <p className="text-xs text-muted-foreground">Все обсуждения с ИИ</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!loaded ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
        ) : allChats.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Обсуждений пока нет</p>
          </div>
        ) : (
          allChats.map((msg, i) => {
            const stepLabel = getStepLabel(msg.content);
            const content = cleanContent(msg.content);
            return (
              <div key={msg.id || i}>
                {stepLabel && (i === 0 || getStepLabel(allChats[i-1]?.content) !== stepLabel) && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">{stepLabel}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {!stepLabel && i === 0 && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">📋 По задаче в целом</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className="max-w-[88%]">
                    <div className={cn("rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words",
                      msg.role === "user" ? "bg-violet-600 text-white rounded-tr-sm" : "bg-card text-foreground rounded-tl-sm border shadow-sm")}>
                      {msg.role === "assistant" ? <SmartText text={content} /> : content}
                    </div>
                    <p className="text-xs text-muted-foreground/50 mt-0.5 px-1">
                      {msg.created_at ? format(new Date(msg.created_at), "dd.MM HH:mm", { locale: ru }) : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Continue discussion */}
      <div className="border-t bg-card px-4 py-3 shrink-0">
        <p className="text-xs text-muted-foreground mb-2">Продолжить обсуждение по задаче в целом:</p>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl border overflow-hidden">
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Спросите ИИ..."
              className="border-0 focus-visible:ring-0 h-10 text-sm"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          </div>
          <VoiceButton onTranscription={(text) => send(text)} disabled={sending} />
          <button type="button" onClick={() => send(input)} disabled={!input.trim() || sending}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TasksTab({ currentUser, pendingVoiceTask, onPendingVoiceTaskHandled }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [aiTask, setAiTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const isCleaner = currentUser.role === "cleaner";
  const [supplyCategory, setSupplyCategory] = useState(SUPPLY_CATEGORIES[0]);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEmoji, setNewEmoji] = useState("📋");
  const [newDate, setNewDate] = useState<Date | undefined>(new Date());
  const [newDue, setNewDue] = useState<Date | undefined>();
  const [newIsPrivate, setNewIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | "shared" | "private">("all");
  const [pendingStepsFromVoice, setPendingStepsFromVoice] = useState<Array<{ description: string; emoji?: string }>>([]);
  const [voiceBanner, setVoiceBanner] = useState(false);

  const newTaskFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTasks();
    supabase.from("cleaning_users").select("id,full_name").eq("is_active", true)
      .then(({ data }) => { if (data) { const map: Record<string,string> = {}; data.forEach(u => { map[u.id] = u.full_name; }); setUsersMap(map); } });
  }, []);

  // Handle pending voice task passed via prop — pre-fill the form for user to review
  useEffect(() => {
    if (!pendingVoiceTask) return;
    const data = pendingVoiceTask;

    // Pre-fill form fields
    setNewTitle(data.title || "");
    setNewDesc(data.description || "");
    setNewEmoji(data.emoji || "📋");
    setNewDate(new Date());
    setNewDue(undefined);
    setNewIsPrivate(false);
    setPendingStepsFromVoice(data.steps || []);
    setVoiceBanner(true);

    // Open the new task form so user can review and confirm
    setShowNewTask(true);

    onPendingVoiceTaskHandled?.();

    // Scroll the form into view after a short delay so it's definitely rendered
    setTimeout(() => {
      newTaskFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [pendingVoiceTask]);

  const loadTasks = async () => {
    try {
      let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (isCleaner) q = q.eq("created_by", currentUser.id);
      const { data, error } = await q;
      if (error) throw error;
      // Filter: shared = is_private false, private = only mine
      const all = (data || []) as any[];
      const visible = all.filter(t => !(t as any).is_private || t.created_by === currentUser.id);
      setTasks(visible);
    } catch { toast({ title: "Ошибка загрузки задач", variant: "destructive" }); }
  };

  const createTask = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase.from("tasks").insert({
        title: newTitle, description: newDesc || "", emoji: newEmoji,
        initiated_date: newDate ? format(newDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        due_date: newDue ? format(newDue, "yyyy-MM-dd") : null,
        created_by: currentUser.id,
        is_private: newIsPrivate,
      } as any).select().single();
      if (error) throw error;

      // If voice steps were pre-filled, create them
      if (pendingStepsFromVoice.length > 0 && inserted?.id) {
        for (let i = 0; i < pendingStepsFromVoice.length; i++) {
          await supabase.from("task_steps").insert({
            task_id: inserted.id,
            description: pendingStepsFromVoice[i].description || "",
            emoji: pendingStepsFromVoice[i].emoji || "📝",
            sort_order: i,
            created_by: currentUser.id,
          } as any);
        }
      }

      setShowNewTask(false);
      setNewTitle(""); setNewDesc(""); setNewEmoji("📋");
      setNewDate(new Date()); setNewDue(undefined); setNewIsPrivate(false);
      setPendingStepsFromVoice([]); setVoiceBanner(false);
      await loadTasks();
      toast({ title: "✅ Задача создана" });

      // Auto-open the newly created task card
      if (inserted) await handleOpenTask(inserted as Task);
    } catch (e: any) { toast({ title: `Ошибка: ${e?.message}`, variant: "destructive" }); }
    setSaving(false);
  };

  const handleOpenTask = async (task: Task) => {
    const [stepsRes, attRes] = await Promise.all([
      supabase.from("task_steps").select("*").eq("task_id", task.id).order("sort_order"),
      supabase.from("task_attachments").select("*").eq("task_id", task.id).order("created_at"),
    ]);
    const merged = (stepsRes.data || []).map(s => ({ ...s, attachments: (attRes.data || []).filter(a => a.task_step_id === s.id) }));
    setOpenTask({ ...task, steps: merged });
  };

  // Filtered tasks list based on tab
  const displayedTasks = useMemo(() => {
    if (taskFilter === "shared") return tasks.filter(t => !(t as any).is_private);
    if (taskFilter === "private") return tasks.filter(t => (t as any).is_private && t.created_by === currentUser.id);
    return tasks;
  }, [tasks, taskFilter, currentUser.id]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold truncate min-w-0">{isCleaner ? "🧹 Заявки на расходники" : "🗂️ Задачи и поручения"}</h2>
        <Button size="sm" onClick={() => setShowNewTask(s => !s)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />{isCleaner ? "Заявка" : "Новая задача"}
        </Button>
      </div>

      {/* Shared / Private filter tabs (admin/coord only) */}
      {!isCleaner && (
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border">
          {([
            { key: "all", label: "Все" },
            { key: "shared", label: "🌐 Общие" },
            { key: "private", label: "🔒 Личные" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTaskFilter(tab.key)}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
                taskFilter === tab.key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* New task form */}
      {showNewTask && (
        <div ref={newTaskFormRef} className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          {/* Voice data banner */}
          {voiceBanner && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm">
              <span>🎤</span>
              <span className="font-medium">Данные из голосового ввода — проверьте и сохраните</span>
              <button type="button" onClick={() => setVoiceBanner(false)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
            </div>
          )}
          {isCleaner ? (
            <>
              <h3 className="font-semibold text-sm">🛒 Заявка на расходник</h3>
              <div className="flex flex-wrap gap-2">
                {SUPPLY_CATEGORIES.map(cat => (
                  <button key={cat.label} type="button"
                    onClick={() => { setSupplyCategory(cat); setNewEmoji(cat.emoji); setNewTitle(cat.label); }}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors",
                      supplyCategory.label === cat.label ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <EmojiPicker value={newEmoji} onChange={setNewEmoji} emojis={TASK_EMOJIS} />
              <Input placeholder="Название задачи..." value={newTitle} onChange={e => setNewTitle(e.target.value)} className="flex-1 font-medium" autoFocus />
            </div>
          )}
          <div>
            <RichTextEditor value={newDesc} onChange={setNewDesc}
              placeholder={isCleaner ? "Уточнение, количество, для какого объекта..." : "Описание задачи..."}
              rows={3} />
            {/* Universal input bar */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <VoiceButton onTranscription={(text) => setNewDesc(prev => prev ? prev + " " + text : text)} />
              <FilePickerButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" accept="image/*" onFile={(f) => { setNewDesc(prev => prev ? prev + `\n📎 ${f.name}` : `📎 ${f.name}`); }} />
              <FilePickerButton icon={<Camera className="h-4 w-4" />} label="Камера" accept="image/*" capture onFile={(f) => { setNewDesc(prev => prev ? prev + `\n📷 ${f.name}` : `📷 ${f.name}`); }} />
              <FilePickerButton icon={<Paperclip className="h-4 w-4" />} label="Файл" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onFile={(f) => { setNewDesc(prev => prev ? prev + `\n📎 ${f.name}` : `📎 ${f.name}`); }} />
            </div>
          </div>
          {/* Pre-filled voice steps preview */}
          {pendingStepsFromVoice.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">📋 Подзадачи из голоса:</p>
              {pendingStepsFromVoice.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                  <span>{s.emoji || "📝"}</span>
                  <span className="flex-1">{s.description}</span>
                  <button type="button" onClick={() => setPendingStepsFromVoice(prev => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive transition-colors">✕</button>
                </div>
              ))}
            </div>
          )}
          {!isCleaner && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNewIsPrivate(p => !p)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                  newIsPrivate ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-muted text-muted-foreground border-border"
                )}
              >
                {newIsPrivate ? "🔒 Личная задача" : "🌐 Общая задача"}
              </button>
              <span className="text-xs text-muted-foreground">{newIsPrivate ? "Видна только вам" : "Видна всем"}</span>
            </div>
          )}
          {!isCleaner && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Дата начала:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />{newDate ? format(newDate, "dd.MM.yyyy") : "Выбрать"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[200]"><CalendarUI mode="single" selected={newDate} onSelect={setNewDate} locale={ru} /></PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Срок:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />{newDue ? format(newDue, "dd.MM.yyyy") : "Не задан"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[200]"><CalendarUI mode="single" selected={newDue} onSelect={setNewDue} locale={ru} /></PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowNewTask(false); setPendingStepsFromVoice([]); setVoiceBanner(false); }}>Отмена</Button>
            <Button size="sm" onClick={createTask} disabled={saving || (!isCleaner && !newTitle.trim())}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              {isCleaner ? "Отправить" : "Создать"}
            </Button>
          </div>
        </div>
      )}

      {/* Tasks list — full width */}
      {displayedTasks.length === 0 && !showNewTask && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-5xl mb-3">📂</p>
          <p className="font-medium text-base">Нет задач</p>
          {taskFilter === "private" ? <p className="text-sm mt-1">У вас нет личных задач</p> : <p className="text-sm mt-1">Создайте первую задачу</p>}
        </div>
      )}

      <div className="space-y-2">
        {displayedTasks.map(task => {
          const steps = task.steps || [];
          const completedCount = steps.filter(s => s.is_completed).length;
          const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;
          const daysOld = differenceInDays(new Date(), new Date(task.initiated_date));
          const isPrivate = (task as any).is_private;
          return (
            <div key={task.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <button type="button" onClick={() => handleOpenTask(task)}
                className="w-full text-left hover:bg-muted/20 active:scale-[0.995] transition-all group">
                <div className="px-3 py-3 flex items-center gap-3">
                  <span className="text-xl shrink-0">{task.emoji}</span>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <h3 className="font-semibold text-sm leading-tight break-words min-w-0 flex-1">{task.title}</h3>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap">
                        {isPrivate && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">🔒</span>}
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full",
                          task.status==="completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
                          {task.status==="completed"?"✅":"🔄"}
                        </span>
                      </div>
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 break-words">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>📅 {format(new Date(task.initiated_date), "dd.MM.yy", { locale: ru })}</span>
                      {task.due_date && <span>⏰ {format(new Date(task.due_date), "dd.MM.yy", { locale: ru })}</span>}
                      {usersMap[task.created_by] && <span className="truncate max-w-[80px]">👤 {usersMap[task.created_by]}</span>}
                      <span className="font-medium text-primary/80">{daysOld}д.</span>
                    </div>
                    {steps.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{completedCount}/{steps.length}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </div>
              </button>
              {/* Bottom bar with AI icon */}
              <div className="px-3 py-1.5 border-t bg-muted/10 flex items-center justify-end">
                <button type="button"
                  onClick={e => { e.stopPropagation(); setAiTask(task); }}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 px-2 py-1 rounded-lg transition-colors border border-violet-200 hover:border-violet-300">
                  <Bot className="h-3 w-3" />
                  ИИ
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {openTask && (
        <TaskDetailModal
          task={openTask}
          currentUser={currentUser}
          onClose={() => setOpenTask(null)}
          onReload={loadTasks}
        />
      )}
      {aiTask && (
        <TaskAIModal
          task={aiTask}
          currentUser={currentUser}
          onClose={() => setAiTask(null)}
        />
      )}
    </div>
  );
}
