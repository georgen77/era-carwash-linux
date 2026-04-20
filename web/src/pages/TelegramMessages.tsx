import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, startOfDay, subDays, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowLeft, Search, CalendarIcon, X, Download, Users, Image, MessageSquare,
  ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

interface TelegramMessage {
  id: string;
  chat_id: string;
  user_name: string | null;
  user_first_name: string | null;
  message_text: string | null;
  message_type: string;
  photo_url: string | null;
  direction: string;
  created_at: string;
}

const PAGE_SIZE = 50;

const typeLabel: Record<string, string> = {
  text: "текст",
  photo: "фото",
  document: "документ",
};
const typeEmoji: Record<string, string> = {
  text: "📝",
  photo: "📷",
  document: "📄",
};

function getInitials(firstName?: string | null, userName?: string | null): string {
  if (firstName) return firstName.charAt(0).toUpperCase();
  if (userName) return userName.charAt(0).toUpperCase();
  return "?";
}

function getUserColor(id: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % colors.length;
  return colors[hash];
}

function formatDaySeparator(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Сегодня";
  if (isYesterday(d)) return "Вчера";
  return format(d, "d MMMM yyyy", { locale: ru });
}

function MessageBubble({ msg }: { msg: TelegramMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isIncoming = msg.direction === "incoming";
  const text = msg.message_text ?? "";
  const truncated = text.length > 200 && !expanded;
  const displayText = truncated ? text.slice(0, 200) + "…" : text;

  return (
    <div className={cn("flex gap-2 max-w-[85%]", isIncoming ? "self-start flex-row" : "self-end flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold",
        getUserColor(msg.chat_id)
      )}>
        {getInitials(msg.user_first_name, msg.user_name)}
      </div>

      <div className={cn(
        "rounded-2xl px-3 py-2 text-sm space-y-1 shadow-sm",
        isIncoming
          ? "bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-tl-sm"
          : "bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-tr-sm"
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-xs text-foreground">
            {msg.user_first_name ?? msg.user_name ?? "Unknown"}
          </span>
          {msg.user_name && msg.user_first_name && (
            <span className="text-muted-foreground text-[10px]">@{msg.user_name}</span>
          )}
          <span className="text-muted-foreground text-[10px] ml-auto">
            {format(new Date(msg.created_at), "HH:mm")}
          </span>
        </div>

        {/* Photo */}
        {msg.photo_url && (
          <img
            src={msg.photo_url}
            alt="photo"
            className="w-32 h-32 rounded-lg object-cover border border-border cursor-pointer"
            onClick={() => window.open(msg.photo_url!, "_blank")}
          />
        )}

        {/* Text */}
        {displayText && (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-snug">
            {displayText}
          </p>
        )}
        {text.length > 200 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary flex items-center gap-0.5 hover:underline"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" /> скрыть</> : <><ChevronDown className="h-3 w-3" /> показать больше</>}
          </button>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <Badge variant="secondary" className="text-[10px] font-normal py-0 h-4">
            {typeEmoji[msg.message_type] ?? "📩"} {typeLabel[msg.message_type] ?? msg.message_type}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-[10px] py-0 h-4",
              isIncoming ? "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30" : "text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30"
            )}
          >
            {isIncoming ? "⬇ вход." : "⬆ исх."}
          </Badge>
        </div>
      </div>
    </div>
  );
}

const TelegramMessages = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [distinctUsers, setDistinctUsers] = useState<string[]>([]);

  // Stats
  const [stats, setStats] = useState<{
    uniqueUsers: number; mostActive: string | null; photosCount: number;
  }>({ uniqueUsers: 0, mostActive: null, photosCount: 0 });

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Fetch distinct first names for user dropdown
  useEffect(() => {
    supabase
      .from("telegram_messages")
      .select("user_first_name")
      .not("user_first_name", "is", null)
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map(r => r.user_first_name as string))).sort();
          setDistinctUsers(unique);
        }
      });
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("telegram_messages")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (debouncedSearch.trim()) {
        query = query.or(`message_text.ilike.%${debouncedSearch.trim()}%,user_first_name.ilike.%${debouncedSearch.trim()}%`);
      }
      if (userFilter && userFilter !== "all") {
        query = query.eq("user_first_name", userFilter);
      }
      if (typeFilter && typeFilter !== "all") {
        query = query.eq("message_type", typeFilter);
      }
      if (directionFilter && directionFilter !== "all") {
        query = query.eq("direction", directionFilter);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom.toISOString());
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data, count, error } = await query;
      if (error) throw error;
      const msgs = (data as TelegramMessage[]) ?? [];
      setMessages(msgs);
      setTotalCount(count ?? 0);

      // Compute stats from full filtered set (first page gives us enough for UI)
      const uniqueSet = new Set(msgs.map(m => m.user_first_name ?? m.user_name ?? m.chat_id));
      const freqMap = new Map<string, number>();
      msgs.forEach(m => {
        const key = m.user_first_name ?? m.user_name ?? m.chat_id;
        freqMap.set(key, (freqMap.get(key) ?? 0) + 1);
      });
      let mostActive: string | null = null;
      let maxFreq = 0;
      freqMap.forEach((freq, key) => { if (freq > maxFreq) { maxFreq = freq; mostActive = key; } });
      const photosCount = msgs.filter(m => m.message_type === "photo").length;
      setStats({ uniqueUsers: uniqueSet.size, mostActive, photosCount });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, userFilter, typeFilter, directionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [debouncedSearch, userFilter, typeFilter, directionFilter, dateFrom, dateTo]);

  // Quick date presets
  const setQuickDate = (preset: "today" | "week" | "month") => {
    const now = new Date();
    if (preset === "today") { setDateFrom(startOfDay(now)); setDateTo(now); }
    else if (preset === "week") { setDateFrom(subDays(now, 7)); setDateTo(now); }
    else if (preset === "month") { setDateFrom(subMonths(now, 1)); setDateTo(now); }
  };

  // Export CSV
  const exportCSV = () => {
    const header = ["Дата", "Пользователь", "@username", "Текст", "Тип", "Направление"];
    const rows = messages.map(m => [
      format(new Date(m.created_at), "dd.MM.yyyy HH:mm"),
      m.user_first_name ?? m.user_name ?? "",
      m.user_name ? `@${m.user_name}` : "",
      (m.message_text ?? "").replace(/"/g, '""'),
      m.message_type,
      m.direction,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "telegram_messages.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Group messages by day
  const grouped: { dateLabel: string; messages: TelegramMessage[] }[] = [];
  let lastDay = "";
  for (const msg of messages) {
    const dayKey = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (dayKey !== lastDay) {
      grouped.push({ dateLabel: formatDaySeparator(msg.created_at), messages: [] });
      lastDay = dayKey;
    }
    grouped[grouped.length - 1].messages.push(msg);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const hasActiveFilters = debouncedSearch || userFilter !== "all" || typeFilter !== "all" || directionFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Переписка Telegram
          </h1>
          <span className="ml-auto text-xs text-muted-foreground">{totalCount} сообщений</span>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>

        {/* Filter bar */}
        <div className="max-w-3xl mx-auto px-4 pb-3 space-y-2">
          {/* Row 1: search + user + type + direction */}
          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Поиск по тексту или имени..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* User filter */}
            <Select value={userFilter} onValueChange={v => { setUserFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 text-sm w-[140px]">
                <SelectValue placeholder="Пользователь" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {distinctUsers.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Type filter */}
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 text-sm w-[120px]">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="text">📝 Текст</SelectItem>
                <SelectItem value="photo">📷 Фото</SelectItem>
                <SelectItem value="document">📄 Документ</SelectItem>
              </SelectContent>
            </Select>

            {/* Direction filter */}
            <Select value={directionFilter} onValueChange={v => { setDirectionFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 text-sm w-[120px]">
                <SelectValue placeholder="Напр." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="incoming">⬇ Входящие</SelectItem>
                <SelectItem value="outgoing">⬆ Исходящие</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: quick date + date pickers + reset */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={dateFrom && isToday(dateFrom) ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setQuickDate("today")}
            >
              Сегодня
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setQuickDate("week")}
            >
              Неделя
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setQuickDate("month")}
            >
              Месяц
            </Button>

            {/* Date from */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-7 text-xs px-2.5", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {dateFrom ? format(dateFrom, "dd.MM.yy", { locale: ru }) : "От"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                {dateFrom && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateFrom(undefined)}>Сбросить</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Date to */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-7 text-xs px-2.5", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {dateTo ? format(dateTo, "dd.MM.yy", { locale: ru }) : "До"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                {dateTo && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateTo(undefined)}>Сбросить</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive px-2"
                onClick={() => {
                  setSearch(""); setDebouncedSearch("");
                  setUserFilter("all"); setTypeFilter("all"); setDirectionFilter("all");
                  setDateFrom(undefined); setDateTo(undefined); setPage(0);
                }}
              >
                <X className="h-3 w-3 mr-1" /> Сбросить всё
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-1">
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Сообщений", value: totalCount, color: "text-blue-600" },
            { icon: <Users className="h-3.5 w-3.5" />, label: "Пользователей", value: stats.uniqueUsers, color: "text-violet-600" },
            { icon: <span className="text-base">🏆</span>, label: "Активнее всех", value: stats.mostActive ?? "—", color: "text-amber-600" },
            { icon: <Image className="h-3.5 w-3.5" />, label: "Фото", value: stats.photosCount, color: "text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card/80 p-2.5 flex flex-col items-center justify-center gap-0.5 text-center">
              <span className={cn("text-muted-foreground", s.color)}>{s.icon}</span>
              <span className={cn("text-sm font-bold leading-tight", s.color)}>{s.value}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Загрузка...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <span className="text-3xl">💬</span>
            <span className="text-sm">Сообщений не найдено</span>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.dateLabel} className="space-y-3">
                {/* Day separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted">
                    {group.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Messages for this day */}
                <div className="flex flex-col gap-2">
                  {group.messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Страница {page + 1} из {totalPages} · {totalCount} записей</span>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        className={cn("cursor-pointer text-xs h-8", page === 0 && "pointer-events-none opacity-40")}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        className={cn("cursor-pointer text-xs h-8", page >= totalPages - 1 && "pointer-events-none opacity-40")}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TelegramMessages;
