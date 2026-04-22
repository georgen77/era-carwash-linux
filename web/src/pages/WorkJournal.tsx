import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

// Helper: upload a base64 image string to storage, returns public URL
async function uploadImageToStorage(base64DataUri: string, bucket = "attachments"): Promise<string | null> {
  try {
    const { supabase: sb } = await import("@/integrations/supabase/client");
    // Strip data URI prefix
    const matches = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;
    const [, mimeType, b64] = matches;
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const byteChars = atob(b64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: mimeType });
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(fileName, blob, { contentType: mimeType, upsert: false });
    if (error) { console.error("Storage upload error:", error); return null; }
    const { data: urlData } = sb.storage.from(bucket).getPublicUrl(fileName);
    return urlData.publicUrl || null;
  } catch (e) { console.error("uploadImageToStorage error:", e); return null; }
}

// Helper: generate AI card background image from title+description
// Uses Lovable AI gateway → openai/gpt-5-nano with image generation
async function generateCardBgImage(title: string, description?: string): Promise<string | null> {
  try {
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const prompt = `Vivid atmospheric background for a task card: "${title}${description ? ". " + description.slice(0, 60) : ""}". Abstract, colorful, no text, no faces, wide.`;
    const res = await fetch("https://ai.gateway.lovable.dev/openai/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "dall-e-2", prompt, n: 1, size: "512x512", response_format: "b64_json" }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const b64: string | undefined = json.data?.[0]?.b64_json;
    if (!b64) return null;
    const dataUri = `data:image/png;base64,${b64}`;
    return await uploadImageToStorage(dataUri, "card-backgrounds");
  } catch { return null; }
}
import {
  BookOpen, Plus, Trash2, Check, ChevronDown, ChevronRight,
  Send, ArrowLeft, MessageSquare, ListChecks,
  Clock, Building2, User, Calendar, X, Pencil,
  CheckCircle2, Circle, Loader2, Search, History,
  RotateCcw, PlusCircle, Edit2, MinusCircle, RefreshCw,
  StickyNote, Bell, Maximize2, ArrowRightLeft, Image as ImageIcon
} from "lucide-react";
import ReminderDialog from "@/components/ReminderDialog";
import SmartVoiceInput from "@/components/SmartVoiceInput";
import ImageZoomViewer from "@/components/ImageZoomViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { getUsername } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { UniversalInput } from "@/components/UniversalInput";
import FloatingAiButton from "@/components/FloatingAiButton";
import { format as dateFmt } from "date-fns";

const WASHES = ["Усатово", "Левитана", "Корсунцы", "Общее"];
const NOTIFY_RECIPIENTS = [
  { name: "Georgiy", chat_id: "6270826055" },
  { name: "Kalinin", chat_id: "1190893632" },
];

const WASH_COLORS: Record<string, string> = {
  "Усатово":  "from-blue-500/20 to-blue-600/10 border-blue-400/30",
  "Левитана": "from-violet-500/20 to-violet-600/10 border-violet-400/30",
  "Корсунцы": "from-emerald-500/20 to-emerald-600/10 border-emerald-400/30",
  "Общее":    "from-amber-500/20 to-amber-600/10 border-amber-400/30",
};

const WASH_BADGE_COLORS: Record<string, string> = {
  "Усатово":  "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/40",
  "Левитана": "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-400/40",
  "Корсунцы": "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400/40",
  "Общее":    "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-400/40",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  todo:        { label: "Сделать", color: "text-muted-foreground", bg: "", icon: Circle },
  in_progress: { label: "В работе", color: "text-blue-500", bg: "bg-blue-500/10", icon: Clock },
  done:        { label: "Готово",   color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  cancelled:   { label: "Отменено", color: "text-muted-foreground/50", bg: "", icon: X },
};

function getDefaultDueDate(): string {
  return format(addDays(new Date(), 7), "yyyy-MM-dd");
}

/** Highlight matching text with yellow mark */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/70 dark:bg-yellow-500/40 text-foreground rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Search input with live autocomplete suggestions */
function SearchInput({
  value, onChange, placeholder, suggestions, className, inputRef,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  suggestions?: string[]; className?: string; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const validSuggestions = value.length >= 3 && showSuggestions ? (suggestions || []).filter(s => s && s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 6) : [];

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input value={value} onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder} className="h-8 pl-8 text-xs pr-7" />
      {value && <button onClick={() => { onChange(""); setShowSuggestions(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      {validSuggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {validSuggestions.map((s, i) => (
            <button key={i} onMouseDown={() => { onChange(s); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors truncate">
              <Highlight text={s} query={value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function ActionBtn({ icon: Icon, onClick, title, color }: { icon: any; onClick: (e: React.MouseEvent) => void; title: string; color: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e); }}
      title={title}
      className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-90 shrink-0", color)}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// --- Journal (Bot Log) Tab ---
function JournalTab({
  searchQuery, onSearchHandled, filterWashProp, filterUserProp,
  onFilterClear,
}: {
  searchQuery?: string; onSearchHandled?: () => void;
  filterWashProp?: string; filterUserProp?: string; onFilterClear?: () => void;
}) {
  const qc = useQueryClient();
  const [washName, setWashName] = useState(filterWashProp || "");
  const [convertDialog, setConvertDialog] = useState<any>(null);
  const [search, setSearch] = useState(searchQuery || "");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState(filterUserProp || "");
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { if (searchQuery) { setSearch(searchQuery); onSearchHandled?.(); } }, [searchQuery]);
  useEffect(() => { if (filterWashProp) setWashName(filterWashProp); }, [filterWashProp]);
  useEffect(() => { if (filterUserProp) setUserFilter(filterUserProp); }, [filterUserProp]);

  const { data: entries = [] } = useQuery({
    queryKey: ["work-journal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_journal_entries" as any).select("*")
        .order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const filteredEntries = entries.filter((e: any) => {
    const matchWash = !washName || e.wash_name === washName;
    const matchSource = !sourceFilter || e.source === sourceFilter;
    const matchUser = !userFilter || e.author?.toLowerCase().includes(userFilter.toLowerCase()) || e.telegram_user?.toLowerCase().includes(userFilter.toLowerCase());
    const q = search.toLowerCase();
    const matchSearch = !q || e.message?.toLowerCase().includes(q) || e.author?.toLowerCase().includes(q) || e.wash_name?.toLowerCase().includes(q) || (e as any).ocr_text?.toLowerCase().includes(q);
    return matchWash && matchSource && matchSearch && matchUser;
  });

  useEffect(() => {
    if (search && filteredEntries.length > 0) {
      setTimeout(() => resultRefs.current[0]?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [search]);

  const addEntry = useMutation({
    mutationFn: async ({ text, image }: { text: string; image?: string }) => {
      await supabase.from("work_journal_entries" as any).insert({
        message: text, wash_name: washName || null,
        author: getUsername() || "", source: "manual",
        ...(image ? { image } : {}),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-journal"] }); toast.success("Запись добавлена"); },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => { await supabase.from("work_journal_entries" as any).delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-journal"] }),
  });

  const sourceIcon = (s: string) => s === "telegram" ? "📱" : s === "ai_chat" ? "🤖" : "✏️";

  const hasFilters = search || sourceFilter || washName || userFilter;

  return (
    <div className="space-y-3">
      {/* Wash filter + search icon */}
      <div className="flex gap-1 flex-wrap items-center">
        {["", ...WASHES].map(w => (
          <button key={w || "all"} onClick={() => { setWashName(w); onFilterClear?.(); }}
            className={cn("px-2 py-1 rounded-md text-xs border transition-colors", washName === w ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
            {w || "Все"}
          </button>
        ))}
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="h-7 bg-background border border-input rounded-md px-2 text-xs">
          <option value="">Все</option>
          <option value="telegram">📱 TG</option>
          <option value="manual">✏️ Ручной</option>
          <option value="ai_chat">🤖 AI</option>
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск..."
          suggestions={(entries as any[]).flatMap((e: any) => [e.message, e.author, e.telegram_user, e.ocr_text].filter(Boolean)).flatMap(s => s.split(/\s+/)).filter((w: string) => w.length > 3)}
          className="flex-1 min-w-[120px]"
        />
      </div>

      {userFilter && (
        <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 rounded-lg px-2 py-1">
          <User className="h-3 w-3 text-primary" />
          <span className="text-primary">Фильтр: {userFilter}</span>
          <button onClick={() => setUserFilter("")} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}

      {hasFilters && (
        <p className="text-[10px] text-muted-foreground">
          {filteredEntries.length} из {entries.length}
          <button onClick={() => { setSearch(""); setSourceFilter(""); setWashName(""); setUserFilter(""); }} className="ml-2 text-primary hover:underline">сбросить</button>
        </p>
      )}

      <UniversalInput placeholder={`Запись в журнал${washName ? ` (${washName})` : ""}...`}
        onSubmit={(text, image) => addEntry.mutateAsync({ text, image })} disabled={addEntry.isPending} />

      {filteredEntries.map((e: any, idx: number) => (
        <div key={e.id} ref={el => resultRefs.current[idx] = el}
          className="group bg-card border border-border rounded-xl p-3 text-sm cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setConvertDialog(e)}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-base">{sourceIcon(e.source)}</span>
                {e.wash_name && (
                  <Badge variant="secondary"
                    className={cn("text-[10px] px-1.5 py-0 border cursor-pointer hover:opacity-70", WASH_BADGE_COLORS[e.wash_name] || "")}
                    onClick={ev => { ev.stopPropagation(); setWashName(e.wash_name); }}>
                    {e.wash_name}
                  </Badge>
                )}
                {(e.author || e.telegram_user) && (
                  <span className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={ev => { ev.stopPropagation(); setUserFilter(e.author || e.telegram_user); }}>
                    {e.author || e.telegram_user}
                  </span>
                )}
                {e.converted_to && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary">→ {e.converted_to}</Badge>}
              </div>
              <p className="text-sm leading-relaxed"><Highlight text={e.message} query={search} /></p>
              {e.image && (
                <img src={e.image} alt="" className="mt-2 h-24 w-auto rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={ev => { ev.stopPropagation(); setZoomImg(e.image); }} />
              )}
              {e.ocr_text && search && e.ocr_text.toLowerCase().includes(search.toLowerCase()) && (
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  📷 OCR: <Highlight text={e.ocr_text.slice(0, 100)} query={search} />
                </p>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">
                {format(new Date(e.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
              </div>
            </div>
            <button onClick={ev => { ev.stopPropagation(); deleteEntry.mutate(e.id); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      {filteredEntries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {hasFilters ? "Ничего не найдено" : "Журнал пуст"}
        </div>
      )}

      {convertDialog && <ConvertDialog entry={convertDialog} onClose={() => setConvertDialog(null)} />}
      {zoomImg && <ImageZoomViewer src={zoomImg} onClose={() => setZoomImg(null)} />}
    </div>
  );
}

function ConvertDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<"task" | "expense" | "note" | null>(null);
  const [taskTitle, setTaskTitle] = useState(entry.message.slice(0, 80));
  const [taskWash, setTaskWash] = useState(entry.wash_name || "Общее");

  const convertToTask = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.from("tasks" as any).insert({
        title: taskTitle, wash_name: taskWash,
        created_by: entry.author || getUsername(),
        description: entry.message, due_date: getDefaultDueDate(),
        notify_recipients: ["6270826055", "1190893632"],
      }).select().single();
      await supabase.from("work_journal_entries" as any).update({ converted_to: "task", converted_id: (data as any)?.id }).eq("id", entry.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["work-journal"] }); toast.success("Создана задача!"); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby="convert-desc">
        <DialogHeader><DialogTitle className="text-sm">Трансформировать запись</DialogTitle></DialogHeader>
        <p id="convert-desc" className="text-xs text-muted-foreground bg-muted/30 rounded p-2 line-clamp-3">{entry.message}</p>
        {!type ? (
          <div className="grid grid-cols-3 gap-2">
            {[{ key: "task", icon: "✅", label: "Задача" }, { key: "expense", icon: "💰", label: "Расход" }, { key: "note", icon: "📝", label: "Заметка" }].map(o => (
              <button key={o.key} onClick={() => setType(o.key as any)}
                className="flex flex-col items-center gap-1 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-xl">{o.icon}</span>
                <span className="text-xs">{o.label}</span>
              </button>
            ))}
          </div>
        ) : type === "task" ? (
          <div className="space-y-2">
            <Input className="h-8 text-sm" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Название задачи" />
            <select className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm" value={taskWash} onChange={e => setTaskWash(e.target.value)}>
              {WASHES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => convertToTask.mutate()} disabled={!taskTitle || convertToTask.isPending}>
                <Check className="h-3 w-3 mr-1" /> Создать задачу
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setType(null)}>Назад</Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">Скоро будет доступно</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Task Detail Sheet (full-screen) ---
function TaskDetailSheet({ task, allTasks, onClose, onEdit, onAddSubtask }: {
  task: any; allTasks: any[]; onClose: () => void; onEdit: (t: any) => void; onAddSubtask: (parentId: string) => void;
}) {
  const qc = useQueryClient();
  const subtasks = allTasks.filter(t => t.parent_id === task.id);
  const imgMatches = [...((task.description || "").matchAll(/__img__(https?:\/\/\S+)/g))];
  const images: string[] = imgMatches.map((m: any) => m[1]);
  const [zoom, setZoom] = useState<string | null>(task._zoomImg || null);
  const cleanDesc = (task.description || "")
    .replace(/\n?__bg__https?:\/\/\S+/g, "")
    .replace(/\n?__img__https?:\/\/\S+/g, "")
    .trim();
  const bgMatch = task.description?.match(/__bg__(https?:\/\/\S+)/);
  const bgImage = bgMatch ? bgMatch[1] : null;

  const PRIORITY_COLORS: Record<string, string> = {
    low: "text-blue-500", medium: "text-yellow-500", high: "text-orange-500", critical: "text-destructive",
  };
  const STATUS_LABELS: Record<string, string> = {
    todo: "К выполнению", in_progress: "В процессе", done: "Выполнено", cancelled: "Отменено",
  };

  const addSubtaskNote = useMutation({
    mutationFn: async ({ text, image }: { text: string; image?: string }) => {
      let imageUrl: string | undefined;
      if (image) { imageUrl = (await uploadImageToStorage(image)) || undefined; }
      const payload: any = {
        title: text.slice(0, 120),
        description: text.length > 120 ? text.slice(120) : undefined,
        parent_id: task.id, wash_name: task.wash_name,
        created_by: getUsername() || "user", status: "todo", priority: "normal",
      };
      if (imageUrl) payload.description = (payload.description || "") + `\n__img__${imageUrl}`;
      await supabase.from("tasks" as any).insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Подзадача добавлена"); },
  });

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[92vh] flex flex-col p-0 rounded-t-2xl">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Background image header */}
          {bgImage ? (
            <div className="relative h-32 w-full overflow-hidden shrink-0">
              <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h2 className="text-lg font-bold leading-snug drop-shadow">{task.title}</h2>
              </div>
              <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/70 flex items-center justify-center hover:bg-background/90 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between px-4 pb-2 shrink-0">
              <h2 className="text-lg font-bold leading-snug flex-1 pr-2">{task.title}</h2>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            {/* Meta badges */}
            <div className="flex flex-wrap gap-1.5">
              <span className={cn("text-xs px-2 py-1 rounded-full border font-medium", WASH_BADGE_COLORS[task.wash_name] || "bg-muted text-muted-foreground border-border")}>{task.wash_name}</span>
              <span className={cn("text-xs px-2 py-1 rounded-full bg-muted font-medium", PRIORITY_COLORS[task.priority] || "")}>{task.priority}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{STATUS_LABELS[task.status] || task.status}</span>
              {task.due_date && <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />до {task.due_date}</span>}
              {task.assigned_to && <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{task.assigned_to}</span>}
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>Создано: {new Date(task.created_at).toLocaleString("ru-RU")}</span>
              {task.updated_at && task.updated_at !== task.created_at && (
                <span>Изменено: {new Date(task.updated_at).toLocaleString("ru-RU")}</span>
              )}
            </div>

            {/* Description */}
            {cleanDesc && (
              <div className="text-sm text-foreground/80 bg-muted/40 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">{cleanDesc}</div>
            )}

            {/* Attached images */}
            {images.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Вложения ({images.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setZoom(img)}
                      className="aspect-square rounded-xl overflow-hidden border border-border hover:border-primary/60 transition-colors">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Subtasks */}
            {subtasks.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-2">Подзадачи ({subtasks.length})</p>
                <div className="space-y-2">
                  {subtasks.map(sub => {
                    const subImgs = [...((sub.description || "").matchAll(/__img__(https?:\/\/\S+)/g))].map((m: any) => m[1]);
                    const subDesc = (sub.description || "").replace(/\n?__bg__https?:\/\/\S+/g, "").replace(/\n?__img__https?:\/\/\S+/g, "").trim();
                    return (
                      <div key={sub.id} className="bg-muted/30 rounded-xl p-3 border border-border/40">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold", sub.status === "done" ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>
                            {STATUS_LABELS[sub.status] || sub.status}
                          </span>
                          <span className={cn("text-sm font-medium", sub.status === "done" && "line-through text-muted-foreground")}>{sub.title}</span>
                        </div>
                        {subDesc && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{subDesc}</p>}
                        {subImgs.length > 0 && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {subImgs.map((img, i) => (
                              <button key={i} onClick={() => setZoom(img)}
                                className="h-14 w-14 rounded-lg overflow-hidden border border-border/50 hover:border-primary/60 transition-colors">
                                <img src={img} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-3 mt-1.5">
                          <span className="text-[9px] text-muted-foreground">{new Date(sub.created_at).toLocaleString("ru-RU")}</span>
                          {sub.updated_at && sub.updated_at !== sub.created_at && (
                            <span className="text-[9px] text-muted-foreground">ред. {new Date(sub.updated_at).toLocaleString("ru-RU")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add subtask via UniversalInput */}
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-2">Добавить подзадачу / комментарий</p>
              <UniversalInput
                placeholder="Текст, фото или голос..."
                rows={2}
                onSubmit={(text, image) => addSubtaskNote.mutateAsync({ text, image })}
                disabled={addSubtaskNote.isPending}
              />
            </div>
          </div>

          {/* Footer action buttons */}
          <div className="shrink-0 border-t border-border px-4 py-3 flex gap-2">
            <Button size="sm" className="flex-1 gap-1.5" onClick={() => { onClose(); onEdit(task); }}>
              <Pencil className="h-3.5 w-3.5" /> Редактировать
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { onClose(); onAddSubtask(task.id); }}>
              <Plus className="h-3.5 w-3.5" /> Подзадача
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {zoom && <ImageZoomViewer src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

// --- Note Detail Sheet (full-screen) ---
function NoteDetailSheet({ note, onClose, onEdit, onDelete, onConvert, onReminder, search }: {
  note: any; onClose: () => void; onEdit: () => void; onDelete: () => void;
  onConvert: () => void; onReminder: () => void; search?: string;
}) {
  const bgTag = (note.tags || []).find((t: string) => t?.startsWith("__bg__"));
  const bgImage = bgTag ? bgTag.replace("__bg__", "") : null;
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[88vh] flex flex-col p-0 rounded-t-2xl">
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {bgImage ? (
            <div className="relative h-28 w-full overflow-hidden shrink-0">
              <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  {note.wash_name && <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 border", WASH_BADGE_COLORS[note.wash_name] || "")}>{note.wash_name}</Badge>}
                </div>
                <button onClick={onClose} className="h-7 w-7 rounded-full bg-background/70 flex items-center justify-center"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                {note.wash_name && <Badge variant="secondary" className={cn("text-[10px] border", WASH_BADGE_COLORS[note.wash_name] || "")}>{note.wash_name}</Badge>}
                {note.author && <span className="text-xs text-muted-foreground">{note.author}</span>}
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            <p className="text-base leading-relaxed whitespace-pre-wrap">
              {search ? <Highlight text={note.content} query={search} /> : note.content}
            </p>

            {note.image && (
              <div className="relative inline-block cursor-pointer" onClick={() => setZoom(note.image)}>
                <img src={note.image} alt="" className="max-h-64 w-auto rounded-xl object-cover border border-border hover:opacity-90 transition-opacity" />
                <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center">
                  <Maximize2 className="h-3 w-3" />
                </span>
              </div>
            )}

            {note.ocr_text && (
              <div className="bg-muted/40 rounded-xl p-3 border border-border/30">
                <p className="text-[10px] text-muted-foreground font-semibold mb-1">📷 OCR текст с фото:</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {search ? <Highlight text={note.ocr_text} query={search} /> : note.ocr_text}
                </p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              {format(new Date(note.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}
              {note.updated_at && note.updated_at !== note.created_at && (
                <> · изм. {format(new Date(note.updated_at), "d MMM HH:mm", { locale: ru })}</>
              )}
            </p>
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3 grid grid-cols-4 gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-violet-500 border-violet-500/30 hover:bg-violet-500/10" onClick={() => { onClose(); onEdit(); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-blue-500 border-blue-500/30 hover:bg-blue-500/10" onClick={() => { onClose(); onConvert(); }}>
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10" onClick={() => { onClose(); onReminder(); }}>
              <Bell className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { onClose(); onDelete(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {zoom && <ImageZoomViewer src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

// --- Tasks Tab ---
function TasksTab({
  searchQuery, onSearchHandled, filterWashProp, filterUserProp, onFilterClear, voiceTrigger,
}: {
  searchQuery?: string; onSearchHandled?: () => void;
  filterWashProp?: string; filterUserProp?: string; onFilterClear?: () => void;
  voiceTrigger?: number;
}) {
  const qc = useQueryClient();
  const [filterWash, setFilterWash] = useState(filterWashProp || "Все");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUser, setFilterUser] = useState(filterUserProp || "");
  const [taskSearch, setTaskSearch] = useState(searchQuery || "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [addSubtaskFor, setAddSubtaskFor] = useState<string | null>(null);
  const [reminderTask, setReminderTask] = useState<any>(null);
  const [newlyCreatedTask, setNewlyCreatedTask] = useState<any>(null); // for post-create reminder
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { if (searchQuery) { setTaskSearch(searchQuery); onSearchHandled?.(); } }, [searchQuery]);
  useEffect(() => { if (filterWashProp) setFilterWash(filterWashProp); }, [filterWashProp]);
  useEffect(() => { if (filterUserProp) setFilterUser(filterUserProp); }, [filterUserProp]);

  useEffect(() => {
    if (taskSearch) setTimeout(() => resultRefs.current[0]?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
  }, [taskSearch]);

  const defaultTask = {
    title: "", wash_name: "Общее", description: "",
    assigned_to: "", due_date: getDefaultDueDate(),
    notify_recipients: [] as string[], parent_id: null as string | null,
    images: [] as string[], // attached images
  };
  const [form, setForm] = useState(defaultTask);
  const [detailTask, setDetailTask] = useState<any>(null); // for full task detail dialog

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data } = await supabase.from("tasks" as any).select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: assignees = [] } = useQuery({
    queryKey: ["task-assignees"],
    queryFn: async () => {
      const { data } = await supabase.from("task_assignees" as any).select("*").order("name");
      return data || [];
    },
  });

  const addAssignee = useMutation({
    mutationFn: async (name: string) => { await supabase.from("task_assignees" as any).insert({ name }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-assignees"] }),
  });

  const upsertTask = useMutation({
    mutationFn: async (): Promise<{ id: string; title: string } | null> => {
      const payload = { ...form, parent_id: form.parent_id || null, due_date: form.due_date || getDefaultDueDate(), created_by: getUsername() || "user" };
    // Upload images to storage first, then encode as __img__url lines
    const uploadedUrls: string[] = [];
    for (const img of (form.images || [])) {
      if (img.startsWith("data:")) {
        const url = await uploadImageToStorage(img);
        if (url) uploadedUrls.push(url);
      } else {
        uploadedUrls.push(img); // already a URL
      }
    }
    const imgLines = uploadedUrls.map(url => `\n__img__${url}`).join("");
    const fullDescription = (form.description || "") + imgLines;
    const fullPayload = { ...payload, description: fullDescription };

    if (editTask) {
        await supabase.from("tasks" as any).update(fullPayload).eq("id", editTask.id);
        await supabase.from("task_activity_log" as any).insert({ task_id: editTask.id, task_title: form.title, task_snapshot: fullPayload, action: "updated", performed_by: getUsername() || "user" });
        return null;
      } else {
        const { data } = await supabase.from("tasks" as any).insert(fullPayload).select().single();
        if (data) await supabase.from("task_activity_log" as any).insert({ task_id: (data as any).id, task_title: form.title, task_snapshot: data, action: "created", performed_by: getUsername() || "user" });
        if (form.assigned_to && !(assignees as any[]).find((a: any) => a.name === form.assigned_to)) addAssignee.mutate(form.assigned_to);
        // Generate AI background image in background
        if (data) {
          generateCardBgImage(form.title, form.description).then(imageUrl => {
            if (imageUrl) supabase.from("tasks" as any).update({ description: fullDescription + `\n__bg__${imageUrl}` }).eq("id", (data as any).id).then(() => {});
          });
        }
        return data ? { id: (data as any).id, title: form.title } : null;
      }
    },
    onSuccess: async (createdTask) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      const isNew = !editTask;
      if (form.notify_recipients && form.notify_recipients.length > 0 && isNew) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const text = `📋 *Новая задача*: ${form.title}\n🏢 Объект: ${form.wash_name}${form.description ? `\n📝 ${form.description}` : ""}${form.due_date ? `\n📅 Срок: ${format(new Date(form.due_date), "d MMM yyyy", { locale: ru })}` : ""}`;
        await fetch(`${supabaseUrl}/functions/v1/send-telegram`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` }, body: JSON.stringify({ message: text, chatIds: form.notify_recipients }) }).catch(() => {});
        toast.success("Задача создана и отправлена в Telegram");
      } else {
        toast.success(editTask ? "Задача обновлена" : "Задача создана");
      }
      setShowForm(false); setEditTask(null); setAddSubtaskFor(null); setForm(defaultTask);
      // After creating, offer to set a reminder
      if (isNew && createdTask) {
        setNewlyCreatedTask(createdTask);
      }
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, task }: { id: string; status: string; task: any }) => {
      const update: any = { status };
      if (status === "done") update.completed_at = new Date().toISOString();
      await supabase.from("tasks" as any).update(update).eq("id", id);
      await supabase.from("task_activity_log" as any).insert({ task_id: id, task_title: task.title, task_snapshot: { ...task, ...update }, action: "status_changed", old_status: task.status, new_status: status, performed_by: getUsername() || "user" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (task: any) => {
      await supabase.from("task_activity_log" as any).insert({ task_id: task.id, task_title: task.title, task_snapshot: task, action: "deleted", performed_by: getUsername() || "user" });
      await supabase.from("tasks" as any).delete().eq("id", task.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Задача удалена"); },
  });

  const sendToTelegram = useMutation({
    mutationFn: async (task: any) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const statusLabel = STATUS_CONFIG[task.status]?.label || task.status;
      const text = `📋 *Задача*: ${task.title}\n🏢 Объект: ${task.wash_name}\n📊 Статус: ${statusLabel}${task.description ? `\n📝 ${task.description}` : ""}${task.due_date ? `\n📅 Срок: ${format(new Date(task.due_date), "d MMM yyyy", { locale: ru })}` : ""}`;
      const chatIds: string[] = task.notify_recipients?.length ? task.notify_recipients : ["6270826055", "1190893632"];
      await fetch(`${supabaseUrl}/functions/v1/send-telegram`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` }, body: JSON.stringify({ message: text, chatIds }) });
    },
    onSuccess: () => toast.success("Отправлено в Telegram"),
    onError: () => toast.error("Ошибка отправки"),
  });

  const allTasksArr = allTasks as any[];
  const parentTasks = allTasksArr.filter(t => !t.parent_id);
  const subtasks = (parentId: string) => allTasksArr.filter(t => t.parent_id === parentId);

  const matchesSearch = (task: any): boolean => {
    const q = (taskSearch || "").toLowerCase();
    if (!q && !filterUser) return true;
    const matchUser = !filterUser || task.assigned_to?.toLowerCase().includes(filterUser.toLowerCase());
    if (!q) return matchUser;
    const directMatch = (task.title?.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q) || task.assigned_to?.toLowerCase().includes(q) || task.wash_name?.toLowerCase().includes(q) || (task as any).ocr_text?.toLowerCase().includes(q)) && matchUser;
    if (directMatch) return true;
    return subtasks(task.id).some((s: any) => s.title?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q) || (s as any).ocr_text?.toLowerCase().includes(q));
  };

  const filteredParents = parentTasks.filter((t: any) => {
    if (filterWash !== "Все" && t.wash_name !== filterWash) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return matchesSearch(t);
  });

  const openSubtaskForm = (parentId: string) => {
    setForm({ ...defaultTask, parent_id: parentId });
    setEditTask(null); setAddSubtaskFor(parentId); setShowForm(true);
  };

  const renderTask = (task: any, isSubtask = false, taskIdx = 0) => {
    const subs = subtasks(task.id);
    const isExpanded = expanded.has(task.id) || (taskSearch && subs.some((s: any) => s.title?.toLowerCase().includes(taskSearch.toLowerCase())));
    const StatusIcon = STATUS_CONFIG[task.status]?.icon || Circle;
    const statusCfg = STATUS_CONFIG[task.status];
    const nextStatus = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    const gradientClass = WASH_COLORS[task.wash_name] || "from-muted/30 to-muted/10 border-border";
    // Extract AI-generated background image and attached images from description
    const bgMatch = task.description?.match(/__bg__(https?:\/\/\S+)/);
    const bgImage = bgMatch ? bgMatch[1] : null;
    const imgMatches = [...(task.description?.matchAll(/__img__(https?:\/\/\S+)/g) || [])];
    const attachedImages: string[] = imgMatches.map((m: any) => m[1]);
    const displayDescription = (task.description || "").replace(/\n?__bg__https?:\/\/\S+/g, "").replace(/\n?__img__https?:\/\/\S+/g, "").trim();

    return (
      <div key={task.id} ref={el => { if (!isSubtask) resultRefs.current[taskIdx] = el; }}
        className={cn("rounded-xl border bg-gradient-to-br transition-all overflow-hidden cursor-pointer", gradientClass, isSubtask ? "ml-5 scale-[0.98]" : "", task.status === "done" ? "opacity-60" : "")}
        onClick={() => { if (!isSubtask) setDetailTask(task); }}>
        {/* AI Background image strip */}
        {bgImage && !isSubtask && (
          <div className="relative h-20 w-full overflow-hidden">
            <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90" />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start gap-2">
            <button onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: task.id, status: nextStatus, task }); }}
              className={cn("mt-0.5 shrink-0 transition-colors", statusCfg?.color)} title={`Статус: ${statusCfg?.label}`}>
              <StatusIcon className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              {/* Clickable title → opens detail dialog */}
              <button
                className={cn("text-sm font-semibold leading-snug text-left hover:underline hover:text-primary transition-colors", task.status === "done" && "line-through text-muted-foreground")}
                onClick={e => { e.stopPropagation(); setDetailTask(task); }}
              >
                <Highlight text={task.title} query={taskSearch} />
              </button>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border cursor-pointer hover:opacity-70", WASH_BADGE_COLORS[task.wash_name] || "bg-muted text-muted-foreground")}
                  onClick={() => { setFilterWash(task.wash_name); onFilterClear?.(); }}>
                  <Building2 className="h-2.5 w-2.5" />{task.wash_name}
                </span>
                {statusCfg?.bg && (
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", statusCfg.bg, statusCfg.color)}>
                    <StatusIcon className="h-2.5 w-2.5" />{statusCfg.label}
                  </span>
                )}
                {task.due_date && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />{format(new Date(task.due_date), "d MMM", { locale: ru })}
                  </span>
                )}
                {task.assigned_to && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setFilterUser(task.assigned_to)}>
                    <User className="h-2.5 w-2.5" />
                    <Highlight text={task.assigned_to} query={taskSearch} />
                  </span>
                )}
              </div>
              {displayDescription && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  <Highlight text={displayDescription} query={taskSearch} />
                </p>
              )}
              {/* Tiny image thumbnails row */}
              {attachedImages.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {attachedImages.map((img, i) => (
                    <button key={i} onClick={e => { e.stopPropagation(); setDetailTask({ ...task, _zoomImg: img }); }}
                      className="h-8 w-8 rounded overflow-hidden border border-border/50 hover:border-primary/60 transition-colors shrink-0">
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {subs.length > 0 && (
                <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(task.id) ? next.delete(task.id) : next.add(task.id); return next; })}
                  className="flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {subs.filter((s: any) => s.status === "done").length}/{subs.length} подзадач
                </button>
              )}
            </div>
            {/* Horizontal colorful action buttons */}
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              <ActionBtn icon={Send} onClick={() => sendToTelegram.mutate(task)} title="Telegram" color="text-blue-500 hover:bg-blue-500/15" />
              <ActionBtn icon={Bell} onClick={() => setReminderTask(task)} title="Напомнить" color="text-amber-500 hover:bg-amber-500/15" />
              <ActionBtn icon={Pencil} onClick={() => { setEditTask(task); setForm({ ...task, due_date: task.due_date || getDefaultDueDate(), description: displayDescription, images: attachedImages }); setShowForm(true); }} title="Редактировать" color="text-violet-500 hover:bg-violet-500/15" />
              <ActionBtn icon={Trash2} onClick={() => deleteTask.mutate(task)} title="Удалить" color="text-muted-foreground hover:bg-destructive/15 hover:text-destructive" />
            </div>
          </div>
        </div>
        {isExpanded && subs.length > 0 && (
          <div className="px-3 pb-3 space-y-2">{subs.map((s: any) => renderTask(s, true))}</div>
        )}
        {!isSubtask && (
          <div className="px-3 pb-2">
            <button onClick={() => openSubtaskForm(task.id)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
              <Plus className="h-3 w-3" /> подзадача
            </button>
          </div>
        )}
      </div>
    );
  };

  const doneCnt = filteredParents.filter((t: any) => t.status === "done").length;
  const activeCnt = filteredParents.filter((t: any) => t.status !== "done" && t.status !== "cancelled").length;

  return (
    <div className="space-y-3">
      {filteredParents.length > 0 && (
        <div className="flex gap-2">
          <div className="flex-1 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold text-primary">{activeCnt}</div>
            <div className="text-[10px] text-muted-foreground">активных</div>
          </div>
          <div className="flex-1 bg-gradient-to-br from-chart-2/20 to-chart-2/5 border border-chart-2/30 rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold text-chart-2">{doneCnt}</div>
            <div className="text-[10px] text-muted-foreground">выполнено</div>
          </div>
          <div className="flex-1 bg-gradient-to-br from-muted/50 to-muted/20 border border-border rounded-xl p-2.5 text-center">
            <div className="text-lg font-bold">{filteredParents.length}</div>
            <div className="text-[10px] text-muted-foreground">всего</div>
          </div>
        </div>
      )}

      {filterUser && (
        <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 rounded-lg px-2 py-1">
          <User className="h-3 w-3 text-primary" />
          <span className="text-primary">Исполнитель: {filterUser}</span>
          <button onClick={() => setFilterUser("")} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap items-center">
        {["Все", ...WASHES].map(w => (
          <button key={w} onClick={() => setFilterWash(w)}
            className={cn("px-2 py-1 rounded-md text-xs border transition-colors", filterWash === w ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
            {w}
          </button>
        ))}
        <select className="bg-background border border-border rounded px-2 py-1 text-xs h-7" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Все статусы</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <SearchInput value={taskSearch} onChange={setTaskSearch}
          placeholder="Поиск..."
          suggestions={allTasksArr.flatMap((t: any) => [t.title, t.description, t.assigned_to, ...(subtasks(t.id).map((s: any) => s.title))].filter(Boolean))}
          className="flex-1 min-w-[120px]"
        />
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-9 text-sm gap-2 bg-gradient-to-r from-primary to-primary/80"
          onClick={() => { setForm(defaultTask); setEditTask(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Новая задача
        </Button>
        <SmartVoiceInput context="task" lang="ru" size="md"
          triggerCount={voiceTrigger}
          onResult={(parsed) => {
            setForm(f => ({ ...defaultTask, title: parsed.title || "", due_date: parsed.due_date || getDefaultDueDate(), assigned_to: parsed.assignee || "", wash_name: parsed.wash_name || "Общее" }));
            setEditTask(null); setAddSubtaskFor(null); setShowForm(true);
            if (parsed.title) toast.success(`🎤 «${parsed.title.slice(0, 40)}»`, { description: "Проверьте и сохраните задачу" });
          }}
          onRawText={(text) => { setForm(f => ({ ...defaultTask, title: text })); setShowForm(true); }}
        />
      </div>

      <div className="space-y-2">
        {filteredParents.map((t: any, idx: number) => renderTask(t, false, idx))}
        {filteredParents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{taskSearch || filterUser ? "Ничего не найдено" : "Нет задач"}</p>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditTask(null); setAddSubtaskFor(null); } }}>
        <DialogContent className="max-w-sm" aria-describedby="task-form-desc">
          <DialogHeader>
            <DialogTitle className="text-sm">{editTask ? "Редактировать задачу" : addSubtaskFor ? "Новая подзадача" : "Новая задача"}</DialogTitle>
          </DialogHeader>
          <p id="task-form-desc" className="sr-only">Форма создания или редактирования задачи</p>
          <div className="space-y-2">
            <Input className="h-8 text-sm" placeholder="Название задачи *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <select className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.wash_name} onChange={e => setForm(f => ({ ...f, wash_name: e.target.value }))}>
              {WASHES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            {/* UniversalInput for description + media */}
            <UniversalInput
              placeholder="Описание, фото или файл..."
              rows={2}
              onSubmit={(text, image) => {
                setForm(f => ({
                  ...f,
                  description: text ? (f.description ? f.description + "\n" + text : text) : f.description,
                  images: image ? [...(f.images || []), image] : f.images,
                }));
                if (image) toast.success("📎 Изображение прикреплено");
              }}
            />
            {/* Image thumbnails in form */}
            {(form.images || []).length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {(form.images || []).map((img, i) => (
                  <div key={i} className="relative group/img">
                    <img src={img} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                    <button onClick={() => setForm(f => ({ ...f, images: (f.images || []).filter((_, j) => j !== i) }))}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.description && (
              <div className="flex items-start gap-1">
                <textarea className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs resize-none h-12"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <button onClick={() => setForm(f => ({ ...f, description: "" }))} className="text-muted-foreground hover:text-destructive mt-1"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input className="h-8 text-sm" placeholder="Исполнитель" list="assignee-list"
                  value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} />
                <datalist id="assignee-list">{(assignees as any[]).map((a: any) => <option key={a.id} value={a.name} />)}</datalist>
              </div>
              <Input type="date" className="h-8 text-sm flex-1" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Уведомить в Telegram:</p>
              <div className="flex gap-3">
                {NOTIFY_RECIPIENTS.map(r => (
                  <label key={r.chat_id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox"
                      checked={(form.notify_recipients || []).includes(r.chat_id)}
                      onChange={e => setForm(f => ({ ...f, notify_recipients: e.target.checked ? [...(f.notify_recipients || []), r.chat_id] : (f.notify_recipients || []).filter(id => id !== r.chat_id) }))} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" className="w-full h-8 text-sm" onClick={() => upsertTask.mutate()} disabled={!form.title || upsertTask.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" /> {editTask ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Detail Sheet */}
      {detailTask && (
        <TaskDetailSheet
          task={detailTask}
          allTasks={allTasksArr}
          onClose={() => setDetailTask(null)}
          onEdit={(t) => { setDetailTask(null); const imgMs = [...(t.description?.matchAll(/__img__(https?:\/\/\S+)/g) || [])]; const imgs: string[] = imgMs.map((m: any) => m[1]); const desc = (t.description || "").replace(/\n?__bg__https?:\/\/\S+/g, "").replace(/\n?__img__https?:\/\/\S+/g, "").trim(); setEditTask(t); setForm({ ...t, due_date: t.due_date || getDefaultDueDate(), description: desc, images: imgs }); setShowForm(true); }}
          onAddSubtask={(parentId) => { openSubtaskForm(parentId); }}
        />
      )}

      {reminderTask && (
        <ReminderDialog open={!!reminderTask} onClose={() => setReminderTask(null)}
          itemType="task" itemId={reminderTask.id} itemTitle={reminderTask.title} />
      )}

      {newlyCreatedTask && (
        <ReminderDialog open={!!newlyCreatedTask} onClose={() => setNewlyCreatedTask(null)}
          itemType="task" itemId={newlyCreatedTask.id} itemTitle={newlyCreatedTask.title} />
      )}
    </div>
  );
}

// --- Task Activity Log Tab ---
const ACTION_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  created:        { label: "Создана",       icon: PlusCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  updated:        { label: "Изменена",      icon: Edit2,       color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20" },
  deleted:        { label: "Удалена",       icon: MinusCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
  status_changed: { label: "Статус",        icon: RefreshCw,   color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20" },
  restored:       { label: "Восстановлена", icon: RotateCcw,   color: "text-violet-500",  bg: "bg-violet-500/10 border-violet-500/20" },
};

function TaskActivityLogTab() {
  const qc = useQueryClient();
  const [filterAction, setFilterAction] = useState("");
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["task-activity-log"],
    queryFn: async () => {
      const { data } = await supabase.from("task_activity_log" as any).select("*").order("created_at", { ascending: false }).limit(300);
      return data || [];
    },
  });

  const filtered = (logs as any[]).filter(l => {
    const matchAction = !filterAction || l.action === filterAction;
    const q = search.toLowerCase();
    const matchSearch = !q || l.task_title?.toLowerCase().includes(q) || l.performed_by?.toLowerCase().includes(q);
    return matchAction && matchSearch;
  });

  const restoreTask = useMutation({
    mutationFn: async (log: any) => {
      const snap = log.task_snapshot;
      const { data } = await supabase.from("tasks" as any).insert({
        title: snap.title, wash_name: snap.wash_name || "Общее",
        description: snap.description, due_date: snap.due_date,
        status: "todo", priority: snap.priority || "normal",
        created_by: getUsername() || "user",
        assigned_to: snap.assigned_to || null,
        notify_recipients: snap.notify_recipients || null,
      }).select().single();
      if (data) {
        await supabase.from("task_activity_log" as any).insert({
          task_id: (data as any).id, task_title: snap.title,
          task_snapshot: data, action: "restored",
          performed_by: getUsername() || "user",
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["task-activity-log"] }); toast.success("Задача восстановлена"); },
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск в истории..." className="h-8 pl-8 text-xs" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <select className="h-8 bg-background border border-input rounded-md px-2 text-xs" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">Все</option>
          {Object.entries(ACTION_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : null}

      <div className="space-y-2">
        {filtered.map((log: any) => {
          const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.updated;
          const Icon = cfg.icon;
          const snap = typeof log.task_snapshot === "string" ? JSON.parse(log.task_snapshot) : (log.task_snapshot || {});
          const canRestore = log.action === "deleted";

          return (
            <div key={log.id} className={cn("rounded-xl border p-3 text-sm", cfg.bg)}>
              <div className="flex items-start gap-2.5">
                <span className={cn("shrink-0 mt-0.5", cfg.color)}><Icon className="h-4 w-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wide", cfg.color)}>{cfg.label}</span>
                    {log.old_status && log.new_status && (
                      <span className="text-[10px] text-muted-foreground">{STATUS_CONFIG[log.old_status]?.label} → {STATUS_CONFIG[log.new_status]?.label}</span>
                    )}
                  </div>
                  <p className={cn("text-sm font-medium mt-0.5", log.action === "deleted" && "line-through text-muted-foreground")}>{log.task_title}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {snap.wash_name && <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", WASH_BADGE_COLORS[snap.wash_name] || "bg-muted text-muted-foreground border-border")}>{snap.wash_name}</span>}
                    {log.performed_by && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><User className="h-2.5 w-2.5" />{log.performed_by}</span>}
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />{format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: ru })}</span>
                  </div>
                </div>
                {canRestore && (
                  <button onClick={() => restoreTask.mutate(log)} disabled={restoreTask.isPending}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-violet-500 hover:text-violet-600 border border-violet-500/30 hover:border-violet-500/60 px-2 py-1 rounded-lg transition-all hover:bg-violet-500/10">
                    <RotateCcw className="h-3 w-3" /> Вернуть
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{search || filterAction ? "Ничего не найдено" : "Лог операций пуст"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Notes Tab ---
function NotesTab({ searchQuery, onSearchHandled, voiceTrigger }: { searchQuery?: string; onSearchHandled?: () => void; voiceTrigger?: number }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState(searchQuery || "");
  const [washFilter, setWashFilter] = useState("");
  const [editNote, setEditNote] = useState<any>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<any>(null);
  const [convertNote, setConvertNote] = useState<any>(null);
  const [voiceConfirm, setVoiceConfirm] = useState<{ text: string } | null>(null);
  const [detailNote, setDetailNote] = useState<any>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { if (searchQuery) { setSearch(searchQuery); onSearchHandled?.(); } }, [searchQuery]);

  useEffect(() => {
    if (search && filteredNotes.length > 0) {
      setTimeout(() => resultRefs.current[0]?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
  }, [search]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data } = await supabase.from("notes" as any).select("*").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: assignees = [] } = useQuery({
    queryKey: ["task-assignees"],
    queryFn: async () => {
      const { data } = await supabase.from("task_assignees" as any).select("*").order("name");
      return data || [];
    },
  });

  const filteredNotes = (notes as any[]).filter((n: any) => {
    const q = search.toLowerCase();
    const matchWash = !washFilter || n.wash_name === washFilter;
    const matchSearch = !q || n.content?.toLowerCase().includes(q) || n.author?.toLowerCase().includes(q) || n.ocr_text?.toLowerCase().includes(q);
    return matchWash && matchSearch;
  });

  const addNote = useMutation({
    mutationFn: async ({ text, image }: { text: string; image?: string }) => {
      // Upload image to storage first if it's a base64 data URI
      let imageUrl: string | undefined;
      if (image) {
        if (image.startsWith("data:")) {
          imageUrl = (await uploadImageToStorage(image)) || undefined;
        } else {
          imageUrl = image;
        }
      }
      let ocr_text: string | null = null;
      if (imageUrl) {
        try {
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({ query: "Извлеки весь текст из изображения. Верни только текст без пояснений.", imageData: image, lang: "ru" }),
          });
          const data = await resp.json();
          if (data?.answer) ocr_text = data.answer;
        } catch { /* ignore */ }
      }
      const { data: noteData } = await supabase.from("notes" as any).insert({
        content: text, author: getUsername() || "", wash_name: washFilter || null,
        ...(imageUrl ? { image: imageUrl } : {}), ...(ocr_text ? { ocr_text } : {}),
      }).select().single();
      // Generate AI background image in background
      if (noteData) {
        generateCardBgImage(text).then(imageUrl => {
          if (imageUrl) supabase.from("notes" as any).update({ tags: [...((noteData as any).tags || []), `__bg__${imageUrl}`] }).eq("id", (noteData as any).id).then(() => {});
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); toast.success("Заметка добавлена"); },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => { await supabase.from("notes" as any).delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content, image }: { id: string; content: string; image?: string }) => {
      let ocr_text: string | null = null;
      if (image) {
        try {
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({ query: "Извлеки весь текст из изображения. Верни только текст без пояснений.", imageData: image, lang: "ru" }),
          });
          const data = await resp.json();
          if (data?.answer) ocr_text = data.answer;
        } catch { /* ignore */ }
      }
      await supabase.from("notes" as any).update({
        content, updated_at: new Date().toISOString(),
        ...(image !== undefined ? { image } : {}),
        ...(ocr_text ? { ocr_text } : {}),
      }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); setEditNote(null); toast.success("Заметка обновлена"); },
  });

  const convertNoteToTask = useMutation({
    mutationFn: async ({ note, title, washName }: { note: any; title: string; washName: string }) => {
      await supabase.from("tasks" as any).insert({
        title, wash_name: washName, created_by: getUsername() || "user",
        description: note.content, due_date: getDefaultDueDate(), notify_recipients: ["6270826055", "1190893632"],
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setConvertNote(null); toast.success("Задача создана!"); },
  });

  return (
    <div className="space-y-3">
      {/* Wash filter + inline search */}
      <div className="flex gap-1 flex-wrap items-center">
        {["", ...WASHES].map(w => (
          <button key={w || "all"} onClick={() => setWashFilter(w)}
            className={cn("px-2 py-1 rounded-md text-xs border transition-colors", washFilter === w ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
            {w || "Все"}
          </button>
        ))}
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск..."
          suggestions={(notes as any[]).flatMap((n: any) => [n.content, n.author, n.ocr_text].filter(Boolean)).flatMap(s => s.split(/\s+/)).filter((w: string) => w.length > 3)}
          className="flex-1 min-w-[120px]"
        />
      </div>

      {search.trim() && (
        <p className="text-[10px] text-muted-foreground">
          Найдено: {filteredNotes.length} · «{search.trim()}»
          <button onClick={() => setSearch("")} className="ml-2 text-primary hover:underline">сбросить</button>
        </p>
      )}

      {/* New note — Universal Input with voice */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <UniversalInput
            placeholder={`Новая заметка${washFilter ? ` (${washFilter})` : ""}... (фото = OCR поиск)`}
            onSubmit={(text, image) => addNote.mutateAsync({ text, image })}
            disabled={addNote.isPending}
          />
        </div>
        <SmartVoiceInput context="note" lang="ru" size="md"
          triggerCount={voiceTrigger}
          onResult={(parsed) => { if (parsed.title) setVoiceConfirm({ text: parsed.title }); }}
          onRawText={(text) => setVoiceConfirm({ text })}
        />
      </div>
      {addNote.isPending && <p className="text-[10px] text-muted-foreground text-center animate-pulse">🔍 Анализирую изображение...</p>}

      {/* Voice note confirmation dialog */}
      {voiceConfirm && (
        <Dialog open onOpenChange={() => setVoiceConfirm(null)}>
          <DialogContent className="max-w-sm" aria-describedby="voice-confirm-desc">
            <DialogHeader><DialogTitle className="text-sm">Сохранить заметку?</DialogTitle></DialogHeader>
            <p id="voice-confirm-desc" className="text-sm bg-muted/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{voiceConfirm.text}</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 text-sm" onClick={() => { addNote.mutateAsync({ text: voiceConfirm.text }); setVoiceConfirm(null); }} disabled={addNote.isPending}>
                <Check className="h-3.5 w-3.5 mr-1" /> Сохранить
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-sm flex-1" onClick={() => setVoiceConfirm(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Отмена
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isLoading && <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>}

      {filteredNotes.map((note: any, idx: number) => {
        // Extract AI background image from tags
        const bgTag = (note.tags || []).find((t: string) => t?.startsWith("__bg__"));
        const bgImage = bgTag ? bgTag.replace("__bg__", "") : null;

        return (
        <div key={note.id} ref={el => resultRefs.current[idx] = el}
          className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors cursor-pointer"
          onClick={() => setDetailNote(note)}>
          {/* AI Background image strip */}
          {bgImage && (
            <div className="relative h-16 w-full overflow-hidden">
              <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/95" />
            </div>
          )}
          <div className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" />
                {note.wash_name && <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 border", WASH_BADGE_COLORS[note.wash_name] || "")}>{note.wash_name}</Badge>}
                {note.author && <span className="text-xs text-muted-foreground">{note.author}</span>}
              </div>

              {editNote?.id === note.id ? (
                <div className="space-y-1.5">
                  <textarea className="w-full bg-background border border-primary rounded px-2 py-1.5 text-sm resize-none h-24"
                    value={editNote.content} onChange={e => setEditNote((en: any) => ({ ...en, content: e.target.value }))} />
                  {/* Universal input for editing — allows adding image */}
                  <UniversalInput
                    placeholder="Прикрепить новое фото..."
                    onSubmit={(text, image) => {
                      const newContent = text ? (editNote.content + (editNote.content ? "\n" : "") + text) : editNote.content;
                      updateNote.mutate({ id: note.id, content: newContent, image });
                    }}
                    disabled={updateNote.isPending}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={() => updateNote.mutate({ id: note.id, content: editNote.content })}>
                      <Check className="h-3 w-3 mr-1" /> Сохранить
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditNote(null)}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  <Highlight text={note.content} query={search} />
                </p>
              )}

              {note.image && (
                <div className="mt-2 relative inline-block cursor-pointer" onClick={e => { e.stopPropagation(); setZoomImg(note.image); }}>
                  <img src={note.image} alt="" className="h-32 w-auto rounded-lg object-cover border border-border hover:opacity-90 transition-opacity" />
                  <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
                    <Maximize2 className="h-2.5 w-2.5" />
                  </span>
                </div>
              )}

              {note.ocr_text && search && note.ocr_text.toLowerCase().includes(search.toLowerCase()) && (
                <p className="text-[10px] text-muted-foreground mt-1 italic border-l-2 border-primary/30 pl-2">
                  📷 Текст на фото: <Highlight text={note.ocr_text.slice(0, 120)} query={search} />
                </p>
              )}
              <div className="text-[10px] text-muted-foreground mt-1.5">
                {format(new Date(note.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
              </div>
            </div>

            {/* Horizontal colorful action buttons */}
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              <ActionBtn icon={Pencil} onClick={() => setEditNote(editNote?.id === note.id ? null : { ...note })} title="Редактировать"
                color={editNote?.id === note.id ? "bg-primary text-primary-foreground" : "text-violet-500 hover:bg-violet-500/15"} />
              <ActionBtn icon={ArrowRightLeft} onClick={() => setConvertNote(note)} title="Трансформировать"
                color="text-blue-500 hover:bg-blue-500/15" />
              <ActionBtn icon={Bell} onClick={() => setReminderNote(note)} title="Напомнить"
                color="text-amber-500 hover:bg-amber-500/15" />
              {note.image && (
                <ActionBtn icon={Maximize2} onClick={() => setZoomImg(note.image)} title="Просмотр фото"
                  color="text-emerald-500 hover:bg-emerald-500/15" />
              )}
              <ActionBtn icon={Trash2} onClick={() => deleteNote.mutate(note.id)} title="Удалить"
                color="text-muted-foreground hover:bg-destructive/15 hover:text-destructive" />
            </div>
          </div>
          </div>
        </div>
        );
      })}

      {/* Note Detail Sheet */}
      {detailNote && (
        <NoteDetailSheet
          note={detailNote}
          search={search}
          onClose={() => setDetailNote(null)}
          onEdit={() => setEditNote({ ...detailNote })}
          onDelete={() => { deleteNote.mutate(detailNote.id); }}
          onConvert={() => setConvertNote(detailNote)}
          onReminder={() => setReminderNote(detailNote)}
        />
      )}

      {/* Convert note dialog */}
      {convertNote && (
        <ConvertNoteDialog
          note={convertNote}
          assignees={assignees as any[]}
          onClose={() => setConvertNote(null)}
          onConvertToTask={(title, washName) => convertNoteToTask.mutate({ note: convertNote, title, washName })}
        />
      )}

      {zoomImg && <ImageZoomViewer src={zoomImg} onClose={() => setZoomImg(null)} />}

      {reminderNote && (
        <ReminderDialog open={!!reminderNote} onClose={() => setReminderNote(null)}
          itemType="note" itemId={reminderNote.id} itemTitle={reminderNote.content.slice(0, 60)} />
      )}

      {!isLoading && filteredNotes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search ? "Ничего не найдено" : "Заметок пока нет"}</p>
          <p className="text-xs opacity-60 mt-1">Нажмите на микрофон или введите текст</p>
        </div>
      )}
    </div>
  );
}

function ConvertNoteDialog({ note, assignees, onClose, onConvertToTask }: { note: any; assignees: any[]; onClose: () => void; onConvertToTask: (title: string, wash: string) => void }) {
  const [type, setType] = useState<"task" | "expense" | null>(null);
  const [title, setTitle] = useState(note.content.slice(0, 80));
  const [washName, setWashName] = useState(note.wash_name || "Общее");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby="convert-note-desc">
        <DialogHeader><DialogTitle className="text-sm">Трансформировать заметку</DialogTitle></DialogHeader>
        <p id="convert-note-desc" className="text-xs text-muted-foreground bg-muted/30 rounded p-2 line-clamp-3">{note.content}</p>
        {!type ? (
          <div className="grid grid-cols-2 gap-2">
            {[{ key: "task", icon: "✅", label: "В задачу" }, { key: "expense", icon: "💰", label: "В расход" }].map(o => (
              <button key={o.key} onClick={() => setType(o.key as any)}
                className="flex flex-col items-center gap-1 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-2xl">{o.icon}</span>
                <span className="text-sm font-medium">{o.label}</span>
              </button>
            ))}
          </div>
        ) : type === "task" ? (
          <div className="space-y-2">
            <Input className="h-8 text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Название задачи" />
            <select className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm" value={washName} onChange={e => setWashName(e.target.value)}>
              {WASHES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => { onConvertToTask(title, washName); }} disabled={!title}>
                <Check className="h-3 w-3 mr-1" /> Создать задачу
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setType(null)}>Назад</Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">Скоро будет доступно</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Main Page ---
export default function WorkJournal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "tasks";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [pendingSearch, setPendingSearch] = useState<{ tab: string; query: string } | null>(null);
  const [pendingFilter, setPendingFilter] = useState<{ tab: string; wash?: string; user?: string } | null>(null);
  const [voiceTrigger, setVoiceTrigger] = useState(0);
  const today = dateFmt(new Date(), "yyyy-MM-dd");

  // Auto-trigger voice when opened with ?voice= param
  useEffect(() => {
    const voiceParam = searchParams.get("voice");
    if (voiceParam) {
      const timer = setTimeout(() => setVoiceTrigger(v => v + 1), 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiCommand = useCallback((command: string) => {
    const taskMatch = command.match(/найди\s+в\s+задачах?\s+(.+)/i);
    if (taskMatch) { setActiveTab("tasks"); setPendingSearch({ tab: "tasks", query: taskMatch[1].trim() }); return; }
    const noteSearchMatch = command.match(/найди\s+в\s+заметках?\s+(.+)/i);
    if (noteSearchMatch) { setActiveTab("notes"); setPendingSearch({ tab: "notes", query: noteSearchMatch[1].trim() }); return; }
    const logSearchMatch = command.match(/найди\s+в\s+лог[еу]?\s+(.+)/i);
    if (logSearchMatch) { setActiveTab("log"); setPendingSearch({ tab: "log", query: logSearchMatch[1].trim() }); return; }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-base">Рабочий журнал</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4 grid grid-cols-4">
            <TabsTrigger value="tasks" className="gap-1 text-xs px-1"><ListChecks className="h-3.5 w-3.5" /> Задачи</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1 text-xs px-1"><History className="h-3.5 w-3.5" /> История</TabsTrigger>
            <TabsTrigger value="log" className="gap-1 text-xs px-1"><MessageSquare className="h-3.5 w-3.5" /> Лог Бота</TabsTrigger>
            <TabsTrigger value="notes" className="gap-1 text-xs px-1"><StickyNote className="h-3.5 w-3.5" /> Заметки</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            <TasksTab
              searchQuery={pendingSearch?.tab === "tasks" ? pendingSearch.query : undefined}
              onSearchHandled={() => setPendingSearch(null)}
              filterWashProp={pendingFilter?.tab === "tasks" ? pendingFilter.wash : undefined}
              filterUserProp={pendingFilter?.tab === "tasks" ? pendingFilter.user : undefined}
              onFilterClear={() => setPendingFilter(null)}
              voiceTrigger={activeTab === "tasks" ? voiceTrigger : 0}
            />
          </TabsContent>
          <TabsContent value="activity"><TaskActivityLogTab /></TabsContent>
          <TabsContent value="log">
            <JournalTab
              searchQuery={pendingSearch?.tab === "log" ? pendingSearch.query : undefined}
              onSearchHandled={() => setPendingSearch(null)}
              filterWashProp={pendingFilter?.tab === "log" ? pendingFilter.wash : undefined}
              filterUserProp={pendingFilter?.tab === "log" ? pendingFilter.user : undefined}
              onFilterClear={() => setPendingFilter(null)}
            />
          </TabsContent>
          <TabsContent value="notes">
            <NotesTab
              searchQuery={pendingSearch?.tab === "notes" ? pendingSearch.query : undefined}
              onSearchHandled={() => setPendingSearch(null)}
              voiceTrigger={activeTab === "notes" ? voiceTrigger : 0}
            />
          </TabsContent>
        </Tabs>
      </main>

      <FloatingAiButton dateFrom={today} dateTo={today}
        activeTab={activeTab}
        onSmartVoiceTrigger={() => setVoiceTrigger(v => v + 1)} />
    </div>
  );
}
