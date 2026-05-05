import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays } from "date-fns";
import { uk } from "date-fns/locale";
import { CalendarIcon, RefreshCw, Droplets, ChevronDown, LogOut, Globe, Moon, Sun, CreditCard, Maximize2, Bot, ListChecks, StickyNote, MessageSquare, Sparkles, Palette, Receipt, Shield, Fingerprint, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllWashes, formatDateForApi, logout, getUsername, type WashReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useApp, type Lang, type AppTheme } from "@/lib/i18n";
import { useCurrencyState, CurrencyRateBadge, MoneyDisplay } from "@/components/CurrencyDisplay";
import { formatCurrency } from "@/hooks/useCurrencyRates";
import RevenueCharts from "@/components/RevenueCharts";
import ExtraReports from "@/components/ExtraReports";
import ExpensesBlock from "@/components/ExpensesBlock";
import WeatherWidget from "@/components/WeatherWidget";
import MonthYearQuickPick from "@/components/MonthYearQuickPick";
import FloatingAiButton from "@/components/FloatingAiButton";
import TelegramNotificationSettings from "@/components/TelegramNotificationSettings";
import carwashNight from "@/assets/carwash-night.jpg";
import washUsatogo from "@/assets/wash-usatogo.jpg";
import washKorsuntsy from "@/assets/wash-korsuntsy.jpg";
import washLevitana from "@/assets/wash-levitana.jpg";
import odessa1 from "@/assets/odessa-1.jpg";
import odessa2 from "@/assets/odessa-2.jpg";
import odessa3 from "@/assets/odessa-3.jpg";
import odessa4 from "@/assets/odessa-4.jpg";
import odessa5 from "@/assets/odessa-5.jpg";
import odessa6 from "@/assets/odessa-6.jpg";
import odessa7 from "@/assets/odessa-7.jpg";
import heidelberg1 from "@/assets/heidelberg-1.jpg";
import heidelberg2 from "@/assets/heidelberg-2.jpg";
import heidelberg3 from "@/assets/heidelberg-3.jpg";
import heidelberg4 from "@/assets/heidelberg-4.jpg";
import heidelberg5 from "@/assets/heidelberg-5.jpg";
import heidelberg6 from "@/assets/heidelberg-6.jpg";
import heidelberg7 from "@/assets/heidelberg-7.jpg";
import valencia1 from "@/assets/valencia-1.jpg";
import valencia2 from "@/assets/valencia-2.jpg";
import valencia3 from "@/assets/valencia-3.jpg";
import valencia4 from "@/assets/valencia-4.jpg";
import valencia5 from "@/assets/valencia-5.jpg";
import valencia6 from "@/assets/valencia-6.jpg";
import valencia7 from "@/assets/valencia-7.jpg";

const WASH_IMAGES: Record<string, string> = {
  'Усатово': washUsatogo,
  'Корсунцы': washKorsuntsy,
  'Левитана': washLevitana,
};

const LANG_LABELS: Record<Lang, string> = { uk: "🇺🇦 UA", en: "🇬🇧 EN", de: "🇩🇪 DE", ru: "🇷🇺 RU" };

const THEME_SLIDESHOW: Partial<Record<AppTheme, string[]>> = {
  odessa:     [odessa1, odessa2, odessa3, odessa4, odessa5, odessa6, odessa7],
  heidelberg: [heidelberg1, heidelberg2, heidelberg3, heidelberg4, heidelberg5, heidelberg6, heidelberg7],
  valencia:   [valencia1, valencia2, valencia3, valencia4, valencia5, valencia6, valencia7],
  cities:     [odessa1, heidelberg1, valencia1, odessa2, heidelberg2, valencia2, odessa3, heidelberg3, valencia3, odessa4, heidelberg4, valencia4, odessa5, heidelberg5, valencia5, odessa6, heidelberg6, valencia6, odessa7, heidelberg7, valencia7],
};

const THEME_OPTIONS: { value: AppTheme; label: string; icon: string }[] = [
  { value: "light",      label: "Світла",      icon: "☀️" },
  { value: "dark",       label: "Темна",        icon: "🌑" },
  { value: "odessa",     label: "Одеса",        icon: "🌊" },
  { value: "heidelberg", label: "Гейдельберг",  icon: "🏰" },
  { value: "valencia",   label: "Валенсія",     icon: "🍊" },
  { value: "cities",     label: "Три міста",    icon: "🌍" },
];

const DAY_SHORT_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Parse Ukrainian DD.MM.YYYY, DD.MM.YY, or MM.YYYY date string to Date (local timezone) */
function parseDateStr(d: string): Date | null {
  if (!d) return null;
  const clean = d.trim().replace(/\s+/g, " ");
  const parts = clean.split(".");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    // Handle 2-digit year: "26" → 2026
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 0 || month > 11) return null;
    return new Date(year, month, day);
  }
  // Try YYYY-MM-DD (ISO) format
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }
  return null;
}

/** Get short day-of-week label for DD.MM.YYYY string */
function getDayLabel(d: string): string {
  const dt = parseDateStr(d);
  if (!dt) return "";
  return DAY_SHORT_UK[dt.getDay()];
}

type DatePreset = "today" | "yesterday" | "currentWeek" | "lastWeek" | "currentMonth" | "lastMonth" | "custom";

/** Aggregate daily rows (DD.MM.YYYY) into monthly (MM.YYYY) by summing numeric columns */
function aggregateRowsByMonth(rows: string[][]): string[][] {
  const monthMap = new Map<string, string[]>();
  for (const row of rows) {
    const day = row[0];
    if (!day) continue;
    let dd, mm, yyyy;
    if (day.includes('-')) {
      [yyyy, mm, dd] = day.split('-');
    } else {
      [dd, mm, yyyy] = day.split('.');
    }
    const monthKey = (mm && yyyy) ? `${mm}.${yyyy}` : day;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, row.map((_, i) => (i === 0 ? monthKey : "0")));
    }
    const agg = monthMap.get(monthKey)!;
    for (let i = 1; i < row.length; i++) {
      const n = parseFloat(row[i] || "0");
      if (!isNaN(n)) agg[i] = (parseFloat(agg[i]) + n).toFixed(2);
    }
  }
  return Array.from(monthMap.values()).sort((a, b) => {
    const [ma, ya] = a[0].split(".").map(Number);
    const [mb, yb] = b[0].split(".").map(Number);
    return (ya - yb) || (ma - mb);
  });
}

function TodayYesterdayCardBadges({
  sums,
  isLoading,
}: {
  sums: { today: { total: number; card: number } | null; yesterday: { total: number; card: number } | null };
  isLoading: boolean;
}) {
  if (isLoading) return <div className="mt-2"><Skeleton className="h-4 w-28" /></div>;
  if (!sums.today && !sums.yesterday) return null;
  const fmt = (n: number) => n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {sums.today !== null && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
          <span className="font-medium">Сьогодні:</span>
          <span className="tabular-nums">{fmt(sums.today.total)} ₴</span>
          {sums.today.card > 0 && (
            <span className="tabular-nums text-primary/80">💳 {fmt(sums.today.card)} ₴</span>
          )}
        </div>
      )}
      {sums.yesterday !== null && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
          <span className="font-medium">Вчора:</span>
          <span className="tabular-nums">{fmt(sums.yesterday.total)} ₴</span>
          {sums.yesterday.card > 0 && (
            <span className="tabular-nums text-primary/60">• 💳 {fmt(sums.yesterday.card)} ₴</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Filterable revenue table shared by total and per-wash */
function FilterableRevenueTable({
  rows,
  headers,
  totalRow,
  useMonthly,
  cur,
}: {
  rows: { wash: string; date: string; amount: string }[];
  headers?: string[];
  totalRow?: { total: number };
  useMonthly: boolean;
  cur: ReturnType<typeof useCurrencyState>;
}) {
  const [filterWash, setFilterWash] = useState<Set<string>>(new Set());
  const [filterDate, setFilterDate] = useState<Set<string>>(new Set());

  const toggleFilter = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  const filtered = rows.filter(r =>
    (filterWash.size === 0 || filterWash.has(r.wash)) &&
    (filterDate.size === 0 || filterDate.has(r.date))
  );

  const filteredTotal = filtered.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
  const hasFilters = filterWash.size > 0 || filterDate.size > 0;

  return (
    <>
      {hasFilters && (
        <div className="flex flex-wrap gap-1 mb-1">
          {[...filterWash].map(w => (
            <Badge key={w} variant="outline" className="cursor-pointer text-[10px] h-5 bg-primary/20 text-primary border-primary/30"
              onClick={() => toggleFilter(filterWash, w, setFilterWash)}>
              {w} ×
            </Badge>
          ))}
          {[...filterDate].map(d => (
            <Badge key={d} variant="outline" className="cursor-pointer text-[10px] h-5 bg-primary/20 text-primary border-primary/30"
              onClick={() => toggleFilter(filterDate, d, setFilterDate)}>
              {d} ×
            </Badge>
          ))}
          <Badge variant="secondary" className="cursor-pointer text-[10px] h-5"
            onClick={() => { setFilterWash(new Set()); setFilterDate(new Set()); }}>
            Скинути фільтри
          </Badge>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs py-1.5">Об'єкт</TableHead>
            <TableHead className="text-xs py-1.5">{useMonthly ? 'Місяць' : 'Дата'}</TableHead>
            {!useMonthly && <TableHead className="text-xs py-1.5">День</TableHead>}
            <TableHead className="text-xs py-1.5 text-right">₴</TableHead>
            <TableHead className="text-xs py-1.5 text-right">{cur.symbol}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((entry, idx) => {
            const dayLabel = !useMonthly ? getDayLabel(entry.date) : "";
            return (
              <TableRow key={idx}>
                <TableCell
                  className={cn("text-xs py-1 cursor-pointer hover:bg-primary/10 transition-colors select-none", filterWash.has(entry.wash) && "bg-primary/15 font-semibold")}
                  onClick={() => toggleFilter(filterWash, entry.wash, setFilterWash)}
                >
                  {entry.wash}
                </TableCell>
                <TableCell
                  className={cn("text-xs py-1 tabular-nums cursor-pointer hover:bg-primary/10 transition-colors select-none", filterDate.has(entry.date) && "bg-primary/15 font-semibold")}
                  onClick={() => toggleFilter(filterDate, entry.date, setFilterDate)}
                >
                  {entry.date}
                </TableCell>
                {!useMonthly && (
                  <TableCell className="text-xs py-1 text-muted-foreground">{dayLabel}</TableCell>
                )}
                <TableCell className="text-xs py-1 text-right tabular-nums">{entry.amount}</TableCell>
                <TableCell className="text-xs py-1 text-right tabular-nums">
                  {formatCurrency(cur.convert(parseFloat(entry.amount || "0")), cur.currency)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={useMonthly ? 2 : 3} className="text-xs py-1 font-semibold">
              {hasFilters ? "Фільтр" : "Разом"}
            </TableCell>
            <TableCell className="text-xs py-1 text-right font-semibold tabular-nums">
              {filteredTotal.toLocaleString("uk-UA", { minimumFractionDigits: 2 })}
            </TableCell>
            <TableCell className="text-xs py-1 text-right font-semibold tabular-nums">
              {formatCurrency(cur.convert(filteredTotal), cur.currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const { t, lang, setLang, theme, setTheme } = useApp();
  const cur = useCurrencyState();
  const today = new Date();
  const [currentUser, setCurrentUser] = useState(() => getUsername());
  useEffect(() => {
    setCurrentUser(getUsername());
    const handleStorage = () => setCurrentUser(getUsername());
    window.addEventListener('storage', handleStorage);
    window.addEventListener('auth-changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('auth-changed', handleStorage);
    };
  }, []);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [totalOpen, setTotalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: today,
    to: today,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Slideshow for city themes — crossfade via opacity on stacked layers
  const [slideIdx, setSlideIdx] = useState(0);
  const slides = THEME_SLIDESHOW[theme];
  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    setSlideIdx(0);
    const interval = setInterval(() => {
      setSlideIdx(i => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [theme]);



  const presetLabels: Record<DatePreset, string> = {
    today: t("today"),
    yesterday: t("yesterday"),
    currentWeek: t("currentWeek"),
    lastWeek: t("lastWeek"),
    currentMonth: t("currentMonth"),
    lastMonth: t("lastMonth"),
    custom: t("customDates"),
  };

  const getDateRange = () => {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "yesterday": {
        const y = subDays(today, 1);
        return { from: y, to: y };
      }
      case "currentWeek":
        return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
      case "lastWeek": {
        const prevWeek = subWeeks(today, 1);
        return { from: startOfWeek(prevWeek, { weekStartsOn: 1 }), to: endOfWeek(prevWeek, { weekStartsOn: 1 }) };
      }
      case "currentMonth":
        return { from: startOfMonth(today), to: today };
      case "lastMonth": {
        const prev = subMonths(today, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev) };
      }
      case "custom":
        return dateRange;
    }
  };

  const range = getDateRange();
  const fromStr = formatDateForApi(range.from);
  const toStr = formatDateForApi(range.to);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["carwash-report", fromStr, toStr],
    queryFn: () => {
      setLoadProgress(null);
      return fetchAllWashes(fromStr, toStr, (loaded, total) => setLoadProgress({ loaded, total }));
    },
    staleTime: 1000 * 60 * 5,
  });

  // Last expense date for the banner
  const { data: lastExpenseData } = useQuery({
    queryKey: ["last-expense-date"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("expense_date")
        .order("expense_date", { ascending: false })
        .limit(1)
        .single();
      if (error || !data) return null;
      return data.expense_date as string;
    },
    staleTime: 1000 * 60 * 2,
  });

  const lastExpenseDaysAgo = lastExpenseData
    ? differenceInCalendarDays(new Date(), new Date(lastExpenseData))
    : null;

  const [expenseBannerOpen, setExpenseBannerOpen] = useState(false);
  const [bioRegOpen, setBioRegOpen] = useState(false);
  const [bioRegStatus, setBioRegStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [bioRegError, setBioRegError] = useState('');

  const handleRegisterBiometric = async () => {
    setBioRegStatus('loading');
    setBioRegError('');
    try {
      const { registerBiometric } = await import('@/lib/userApi');
      let userId = localStorage.getItem('carwash_user_id') || '';
      // If userId missing (e.g. logged in via old system), fetch it from DB by username
      if (!userId) {
        const username = localStorage.getItem('carwash_user') || '';
        if (!username) throw new Error('Не знайдено користувача. Будь ласка, перезайдіть.');
        const { data: appUser } = await supabase
          .from('app_users')
          .select('id')
          .eq('username', username)
          .single();
        if (!appUser?.id) throw new Error('Користувач не знайдений у системі. Зверніться до адміністратора.');
        userId = appUser.id;
        localStorage.setItem('carwash_user_id', userId);
      }
      await registerBiometric(userId);
      setBioRegStatus('success');
      setTimeout(() => { setBioRegOpen(false); setBioRegStatus('idle'); }, 2000);
    } catch (e) {
      setBioRegError((e as Error).message);
      setBioRegStatus('error');
    }
  };

  // Send Telegram alert once per day when expenses not entered for >5 days
  useEffect(() => {
    if (lastExpenseDaysAgo === null || lastExpenseDaysAgo <= 5) return;
    const alertKey = `expense_alert_sent_${format(new Date(), 'yyyy-MM-dd')}`;
    if (localStorage.getItem(alertKey)) return;
    localStorage.setItem(alertKey, '1');
    const message = `⚠️ *ERA Автомийки — Нагадування*\n\nДмитро Валентинович, витрати не вносились вже *${lastExpenseDaysAgo} ${lastExpenseDaysAgo < 5 ? 'дні' : 'днів'}*.\n\nОстання дата: ${lastExpenseData ? format(new Date(lastExpenseData), 'dd.MM.yyyy') : '—'}\n\nБудь ласка, внесіть актуальні витрати.`;
    supabase.functions.invoke('send-telegram', {
      body: { chatIds: ['6270826055', '1190893632'], message },
    }).catch(console.error);
  }, [lastExpenseDaysAgo, lastExpenseData]);

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    if (p !== "custom") setCalendarOpen(false);
  };

  const totalRevenue = data?.results?.reduce((sum, w) => {
    const rev = parseFloat(w.totalRow?.[1] || "0");
    return sum + rev;
  }, 0) ?? 0;

  const days = differenceInCalendarDays(range.to, range.from) + 1;
  const useMonthly = days > 31;

  const revenueByWash: Record<string, number> = {};
  data?.results?.forEach((w) => {
    revenueByWash[w.washName] = parseFloat(w.totalRow?.[1] || "0");
  });

  // Build combined revenue rows for the total card
  const WASH_ORDER = ['Усатово', 'Левитана', 'Корсунцы'];
  const totalRevenueRows: { wash: string; date: string; amount: string }[] = [];
  {
    const dateMap = new Map<string, { wash: string; date: string; amount: string }[]>();
    data?.results?.filter(w => !w.error).forEach((wash) => {
      const rows = useMonthly ? aggregateRowsByMonth(wash.rows) : wash.rows;
      rows.forEach((row) => {
        const dateKey = row[0];
        if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
        dateMap.get(dateKey)!.push({ wash: wash.washName, date: row[0], amount: row[1] });
      });
    });
    const parseDateForSort = (s: string): [number, number, number] => {
      if (s.includes('-')) {
        const [y, m, d] = s.split('-').map(Number);
        return [d, m, y];
      }
      const [d, m, y] = s.split('.').map(Number);
      return [d, m, y];
    };
    const sortedDates = [...dateMap.keys()].sort((a, b) => {
      const [da, ma, ya] = parseDateForSort(a);
      const [db, mb, yb] = parseDateForSort(b);
      return (yb - ya) || (mb - ma) || (db - da);
    });
    sortedDates.forEach((dateKey) => {
      const entries = dateMap.get(dateKey)!;
      WASH_ORDER.forEach((washName) => {
        const entry = entries.find(e => e.wash === washName);
        if (entry) totalRevenueRows.push(entry);
      });
    });
  }

  // Determine the label to show on the dropdown trigger
  const dropdownPresets: DatePreset[] = ["yesterday", "currentWeek", "lastWeek", "currentMonth", "lastMonth", "custom"];
  const isDropdownPreset = dropdownPresets.includes(preset);

  // Theme-based app background
  const cityThemes = ['odessa', 'heidelberg', 'valencia', 'cities'] as const;
  const isCityTheme = (cityThemes as readonly string[]).includes(theme);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Full-page crossfade slideshow background for city themes */}
      {isCityTheme && slides && slides.map((src, i) => (
        <div
          key={src}
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none z-0"
          style={{
            backgroundImage: `url(${src})`,
            opacity: i === slideIdx ? 1 : 0,
            transition: 'opacity 1.5s ease-in-out',
          }}
        />
      ))}
      {/* Dark overlay for city themes to keep content readable */}
      {isCityTheme && slides && (
        <div className="fixed inset-0 bg-background/85 pointer-events-none z-0" />
      )}
      <div className="relative z-[1]">
      <header className="relative overflow-hidden border-b shadow-lg">
        {/* Header crossfade slideshow */}
        {slides ? slides.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${src})`,
              opacity: i === slideIdx ? 1 : 0,
              transition: 'opacity 1.5s ease-in-out',
            }}
          />
        )) : (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${carwashNight})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        <div className="relative mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {/* Top row: logo + controls */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/90 shadow-lg shadow-gold/20 flex-shrink-0">
              <Droplets className="h-5 w-5 text-gold-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white drop-shadow leading-tight">{t('appTitle')}</h1>
              <p className="text-xs text-white/60">{t('subtitle')}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {/* Language switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-7 px-2 text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    {LANG_LABELS[lang].split(' ')[1]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
                    <DropdownMenuItem key={code} onClick={() => setLang(code)} className={cn(lang === code && "font-bold bg-accent")}>
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Admin shield — between lang and theme */}
              {currentUser === 'georgen77' && (
                <Button variant="ghost" size="sm" className="text-gold/80 hover:text-gold hover:bg-gold/10 h-7 w-7 p-0 border border-gold/30" onClick={() => navigate('/admin/users')} title="Управління доступом">
                  <Shield className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* Theme switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-7 w-7 p-0">
                    <Palette className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  {THEME_OPTIONS.map(opt => (
                    <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)}
                      className={cn("gap-2", theme === opt.value && "font-bold bg-accent")}>
                      <span>{opt.icon}</span>
                      {opt.label}
                      {theme === opt.value && <span className="ml-auto text-[10px] opacity-60">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Profile dropdown — username + biometric + logout */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-7 px-2 gap-1 text-xs max-w-[80px]">
                    <span className="truncate">{currentUser}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem onClick={() => { setBioRegStatus('idle'); setBioRegError(''); setBioRegOpen(true); }} className="gap-2">
                    <Fingerprint className="h-4 w-4" />
                    Face ID / відбиток
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }} className="gap-2 text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" />
                    Вийти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Expense banner — compact luxury strip */}
          {lastExpenseDaysAgo !== null && (
            <div className="mt-2 flex justify-center">
              <button
                className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold/30 bg-black/25 backdrop-blur-sm hover:bg-black/40 hover:border-gold/50 transition-all cursor-pointer"
                onClick={() => setExpenseBannerOpen(true)}
              >
                <span className="text-gold/50 text-[10px] select-none">✦</span>
                <p className="text-[11px] tracking-wide text-white/85 font-light whitespace-nowrap">
                  <span className="font-semibold text-gold/90 tracking-widest uppercase text-[10px] mr-1">Дмитрий Валентинович</span>
                  <span className="text-white/50 mx-1">·</span>
                  расходы вносились{" "}
                  {lastExpenseDaysAgo === 0
                    ? <span className="font-semibold text-emerald-300">сегодня</span>
                    : lastExpenseDaysAgo === 1
                    ? <span className="font-semibold text-gold">вчера</span>
                    : lastExpenseDaysAgo <= 5
                    ? <span className="font-semibold text-amber-300">{lastExpenseDaysAgo} {lastExpenseDaysAgo < 5 ? "дня" : "дней"} назад</span>
                    : <span className="font-semibold text-rose-400">{lastExpenseDaysAgo} дней назад</span>
                  }
                  {lastExpenseData && (
                    <span className="text-white/35 text-[10px] ml-1">
                      ({format(new Date(lastExpenseData), "dd.MM")})
                    </span>
                  )}
                </p>
                <span className="text-gold/50 text-[10px] select-none">✦</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Biometric Registration Dialog */}
      <Dialog open={bioRegOpen} onOpenChange={setBioRegOpen}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-gold" />
              Реєстрація біометрії
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Зареєструйте Face ID або відбиток пальця для швидкого входу без пароля.
            </p>
            {bioRegStatus === 'success' && (
              <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Біометрію успішно зареєстровано!
              </div>
            )}
            {bioRegStatus === 'error' && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {bioRegError || 'Помилка реєстрації'}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setBioRegOpen(false)}>Скасувати</Button>
              <Button
                className="flex-1 bg-gold hover:bg-gold/90 text-gold-foreground gap-2"
                onClick={handleRegisterBiometric}
                disabled={bioRegStatus === 'loading' || bioRegStatus === 'success'}
              >
                <Fingerprint className="h-4 w-4" />
                {bioRegStatus === 'loading' ? 'Реєстрація...' : 'Зареєструвати'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense entry dialog triggered from banner */}

      <Dialog open={expenseBannerOpen} onOpenChange={setExpenseBannerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Внести расходы
            </DialogTitle>
          </DialogHeader>
          <ExpensesBlock
            dateFrom={fromStr}
            dateTo={toStr}
            totalRevenue={totalRevenue}
            revenueByWash={revenueByWash}
            cur={cur}
            autoScrollToForm
          />
        </DialogContent>
      </Dialog>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
        {/* Date controls + Journal shortcuts — compact two-column card */}
        <Card>
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-stretch gap-0 divide-x divide-border/60">

              {/* LEFT: date controls */}
              <div className="flex flex-col justify-center gap-1.5 pr-4 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Today + dropdown */}
                  <div className="flex items-center">
                    <Button
                      variant={preset === "today" ? "default" : "outline"}
                      size="sm"
                      className="rounded-r-none pr-3 border-r-0 h-8 text-xs font-medium"
                      onClick={() => handlePreset("today")}
                    >
                      {presetLabels["today"]}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={isDropdownPreset ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "rounded-l-none border-l-0 h-8 text-xs gap-1",
                            isDropdownPreset ? "px-2" : "px-1.5"
                          )}
                        >
                          {isDropdownPreset && (
                            <span className="max-w-[80px] truncate">{presetLabels[preset]}</span>
                          )}
                          <ChevronDown className="h-3 w-3 flex-shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[160px]">
                        {(["yesterday", "currentWeek", "lastWeek", "currentMonth", "lastMonth"] as const).map(p => (
                          <DropdownMenuItem key={p} onClick={() => handlePreset(p)} className={cn(preset === p && "bg-accent font-medium")}>
                            {presetLabels[p]}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => { setPreset("custom"); setCalendarOpen(true); }} className={cn(preset === "custom" && "bg-accent font-medium")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-2" /> Период...
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Refresh */}
                  <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-8 w-8 p-0 shrink-0">
                    <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                  </Button>

                  {/* AI Journal robot */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => navigate("/ai-journal")} title="Журнал вопросов AI">
                    <Bot className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Custom calendar popover */}
                {preset === "custom" && (
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 w-fit">
                        <CalendarIcon className="h-3 w-3" />
                        {`${format(dateRange.from, "dd.MM.yy")} – ${format(dateRange.to, "dd.MM.yy")}`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: dateRange.from, to: dateRange.to }}
                        onSelect={(range) => { if (range?.from) setDateRange({ from: range.from, to: range.to || range.from }); }}
                        locale={uk}
                        numberOfMonths={1}
                        disabled={{ after: today }}
                        className="pointer-events-auto"
                      />
                      <MonthYearQuickPick onSelectRange={(from, to) => { setDateRange({ from, to: to > today ? today : to }); setPreset("custom"); }} />
                    </PopoverContent>
                  </Popover>
                )}

                {/* Date label */}
                <span className="text-[11px] text-muted-foreground leading-none">
                  {format(range.from, "d MMM yyyy", { locale: uk })}
                  {fromStr !== toStr && ` – ${format(range.to, "d MMM yyyy", { locale: uk })}`}
                </span>
              </div>

              {/* RIGHT: journal shortcuts */}
              <div className="flex flex-col gap-1 pl-4 justify-center flex-1 min-w-0">
                {/* Tasks */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm"
                    className="h-7 text-xs gap-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 flex-1 justify-start px-2 min-w-0"
                    onClick={() => navigate("/work-journal?tab=tasks")}>
                    <ListChecks className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Задачи</span>
                  </Button>
                  <button title="Умный голосовой ввод — задача"
                    className="h-7 w-7 rounded-md flex items-center justify-center bg-blue-500/15 text-blue-500 hover:bg-blue-500/25 transition-all active:scale-90 shrink-0"
                    onClick={() => navigate("/work-journal?tab=tasks&voice=task")}>
                    <Sparkles className="h-3 w-3" />
                  </button>
                </div>

                {/* Notes */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm"
                    className="h-7 text-xs gap-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex-1 justify-start px-2 min-w-0"
                    onClick={() => navigate("/work-journal?tab=notes")}>
                    <StickyNote className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Заметки</span>
                  </Button>
                  <button title="Умный голосовой ввод — заметка"
                    className="h-7 w-7 rounded-md flex items-center justify-center bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-all active:scale-90 shrink-0"
                    onClick={() => navigate("/work-journal?tab=notes&voice=note")}>
                    <Sparkles className="h-3 w-3" />
                  </button>
                </div>

                {/* Bot Log */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm"
                    className="h-7 text-xs gap-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 flex-1 justify-start px-2 min-w-0"
                    onClick={() => navigate("/work-journal?tab=log")}>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Лог Бота</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          {isLoading && (
            <div className="px-6 pb-4 space-y-2">
              <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Завантаження даних...
                </span>
                {loadProgress && loadProgress.total > 1 && (
                  <span className="tabular-nums">{loadProgress.loaded} / {loadProgress.total} місяців</span>
                )}
              </div>
              {loadProgress && loadProgress.total > 1 && (
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(loadProgress.loaded / loadProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Collapsible open={totalOpen} onOpenChange={setTotalOpen}>
            <Card className="border-l-4 border-l-primary">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    <span>{t('totalRevenue')}</span>
                    <div className="flex items-center gap-1">
                      <CurrencyRateBadge currency={cur.currency} rateLabel={cur.rateLabel} icon={cur.icon} onCycle={cur.cycle} />
                      <ChevronDown className={cn("h-4 w-4 transition-transform", totalOpen && "rotate-180")} />
                    </div>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <div
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setTotalOpen(v => !v)}
                  >
                    <MoneyDisplay amountUAH={totalRevenue} convert={cur.convert} currency={cur.currency} symbol={cur.symbol} icon={cur.icon} />
                  </div>
                )}
              </CardContent>
              <CollapsibleContent>
                <div className="border-t px-3 pb-3">
                  <FilterableRevenueTable
                    rows={totalRevenueRows}
                    useMonthly={useMonthly}
                    cur={cur}
                  />
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {data?.results?.map((wash) => (
            <WashSummaryCard key={wash.washName} wash={wash} isLoading={isLoading} washImage={WASH_IMAGES[wash.washName]} cur={cur} useMonthly={useMonthly} selectedDateFrom={fromStr} selectedDateTo={toStr} />
          ))}
        </div>

        {/* Error state */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-destructive">
              {t('error')}: {(error as Error)?.message}
            </CardContent>
          </Card>
        )}

        {/* Revenue Charts */}
        {data?.results && data.results.length > 0 && (
          <RevenueCharts results={data.results} dateFrom={fromStr} dateTo={toStr} />
        )}

        {/* Extra report buttons */}
        <ExtraReports dateFrom={fromStr} dateTo={toStr} />

        {/* Expenses & Profit */}
        <ExpensesBlock
          dateFrom={fromStr}
          dateTo={toStr}
          totalRevenue={totalRevenue}
          revenueByWash={revenueByWash}
          cur={cur}
        />
      </main>
      <FloatingAiButton dateFrom={fromStr} dateTo={toStr} />
    </div>
    </div>
  );
};

function WashSummaryCard({ wash, isLoading, washImage, cur, useMonthly, selectedDateFrom, selectedDateTo }: {
  wash: WashReport;
  isLoading: boolean;
  washImage?: string;
  cur: ReturnType<typeof useCurrencyState>;
  useMonthly?: boolean;
  selectedDateFrom?: string;
  selectedDateTo?: string;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("revenue");
  const [fullscreenTable, setFullscreenTable] = useState<null | "technical" | "analytics">(null);
  const rev = parseFloat(wash.totalRow?.[1] || "0");

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['fullSummary', wash.washName, selectedDateFrom, selectedDateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-carwash', {
        body: { reportType: 'fullSummary', washName: wash.washName, dateFrom: selectedDateFrom, dateTo: selectedDateTo, authToken: localStorage.getItem('carwash_token') },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 15,
    enabled: summaryModalOpen,
  });

  // Technical state — fetched when tab is opened
  const { data: techData, isLoading: techLoading } = useQuery({
    queryKey: ['technicalState', wash.washName],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-carwash', {
        body: { reportType: 'technicalState', washName: wash.washName, authToken: localStorage.getItem('carwash_token') },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 10,
    enabled: open && activeTab === "technical",
  });

  // Analytics state — fetched when tab is opened
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', wash.washName, selectedDateFrom, selectedDateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-carwash', {
        body: { reportType: 'analytics', washName: wash.washName, dateFrom: selectedDateFrom, dateTo: selectedDateTo, authToken: localStorage.getItem('carwash_token') },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 10,
    enabled: open && activeTab === "analytics",
  });

  // Luxwash balance — fetched once per card
  const { data: luxData } = useQuery({
    queryKey: ['luxwashBalance', wash.washName],
    queryFn: async () => {
      const carwashUser = localStorage.getItem('carwash_user');
      const authToken = carwashUser ? btoa(`${carwashUser}:${Date.now()}`) : (localStorage.getItem('carwash_legacy_token') || '');
      const { data, error } = await supabase.functions.invoke('scrape-carwash', {
        body: { reportType: 'luxwashBalance', washName: wash.washName, authToken },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 30,
  });

  const luxResult = luxData?.results?.find((r: { washName: string }) => r.washName === wash.washName);
  const luxBalance = luxResult?.balance || '';
  const luxFee = luxResult?.monthlyFee || '';
  const isNegativeBalance = luxBalance.startsWith('-');

  const techResult = techData?.results?.find((r: { washName: string }) => r.washName === wash.washName) || techData?.results?.[0];
  const analyticsResult = analyticsData?.results?.find((r: { washName: string }) => r.washName === wash.washName) || analyticsData?.results?.[0];

  const analyticsRows: string[][] = analyticsResult?.rows?.length > 0 && Array.isArray(analyticsResult.rows[0])
    ? analyticsResult.rows
    : analyticsResult?.rows?.map((r: Record<string, string>) => Object.values(r)) || [];

  const analyticsHeaders: string[] = analyticsResult?.headers?.length > 0
    ? analyticsResult.headers
    : (analyticsResult?.rows?.length > 0 && typeof analyticsResult.rows[0] === 'object' && !Array.isArray(analyticsResult.rows[0])
        ? Object.keys(analyticsResult.rows[0])
        : []);

  // Build per-wash revenue rows for filterable table
  const washRevenueRows: { wash: string; date: string; amount: string }[] = [];
  {
    const displayRows = useMonthly ? aggregateRowsByMonth(wash.rows) : wash.rows;
    displayRows.forEach(row => {
      washRevenueRows.push({ wash: wash.washName, date: row[0], amount: row[1] });
    });
  }

  return (
    <>
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        {washImage && (
          <div className="relative h-24 overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${washImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          </div>
        )}
        <CollapsibleTrigger asChild>
          <CardHeader className={cn("pb-2 cursor-pointer hover:bg-muted/50 transition-colors", washImage ? "-mt-8 relative z-10 pt-0" : "")}>
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span className="flex items-center gap-2">
                <Droplets className="h-4 w-4" />
                {wash.washName}
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CardContent>
          {wash.error ? (
            <Badge variant="destructive">{t('error')}</Badge>
          ) : isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
            >
              <MoneyDisplay amountUAH={rev} convert={cur.convert} currency={cur.currency} symbol={cur.symbol} icon={cur.icon} />
            </div>
          )}

          {/* Luxwash balance */}
          {(luxBalance || luxFee) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const link = document.createElement('a');
                link.href = 'privatbank://payment';
                link.click();
                setTimeout(() => {
                  window.open('https://www.privat24.ua/', '_blank');
                }, 1500);
              }}
              className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:opacity-80 transition-opacity cursor-pointer text-left"
              title="Натисніть для оплати через Privat24"
            >
              <CreditCard className="h-2.5 w-2.5 flex-shrink-0" />
              <span>Баланс Luxwash:</span>
              <span className={cn("font-semibold", isNegativeBalance ? "text-destructive" : "text-foreground")}>
                {luxBalance}
              </span>
              {luxFee && <span className="text-muted-foreground">/{luxFee} грн</span>}
            </button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs w-full"
            onClick={(e) => { e.stopPropagation(); setSummaryModalOpen(true); }}
          >
            Підсумковий звіт
          </Button>
        </CardContent>
        <CollapsibleContent>
          <div className="border-t px-2 pb-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full h-7 text-xs mb-2">
                <TabsTrigger value="revenue" className="flex-1 text-xs h-6">Виручка</TabsTrigger>
                <TabsTrigger value="technical" className="flex-1 text-xs h-6">Техн. стан</TabsTrigger>
                <TabsTrigger value="analytics" className="flex-1 text-xs h-6">Аналітика</TabsTrigger>
              </TabsList>

              {/* Revenue tab — now filterable */}
              <TabsContent value="revenue" className="mt-0">
                {wash.rows.length > 0 ? (
                  <FilterableRevenueTable
                    rows={washRevenueRows}
                    useMonthly={useMonthly ?? false}
                    cur={cur}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-4">{t('noData')}</p>
                )}
              </TabsContent>

              {/* Technical state tab */}
              <TabsContent value="technical" className="mt-0">
                {techLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Завантаження...</div>
                ) : !techResult || techResult.error ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    {techResult?.error || 'Немає даних'}
                  </p>
                ) : techResult.rows?.length > 0 ? (
                  <>
                    <div className="mb-2 flex justify-end">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setFullscreenTable("technical")}>
                        <Maximize2 className="mr-1 h-3 w-3" /> Повний екран
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {(techResult.headers || []).map((h: string, i: number) => (
                              <TableHead key={i} className="text-xs py-1.5 whitespace-nowrap font-semibold text-foreground">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {techResult.rows.map((row: string[], ri: number) => {
                            const rawRow = techResult.rawCells?.[ri];
                            return (
                              <TableRow key={ri} className="hover:opacity-90">
                                {row.map((cell: string, ci: number) => {
                                  const raw = rawRow?.[ci];
                                  return (
                                    <TableCell
                                      key={ci}
                                      className={cn(
                                        "text-xs py-1 whitespace-nowrap tabular-nums font-medium text-foreground",
                                        raw?.isRed && "cell-danger",
                                        raw?.isGreen && "cell-success",
                                        raw?.isOrange && "cell-warning",
                                      )}
                                    >
                                      {cell}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">Немає даних</p>
                )}
              </TabsContent>

              {/* Analytics tab */}
              <TabsContent value="analytics" className="mt-0">
                {analyticsLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Завантаження...</div>
                ) : !analyticsResult || analyticsResult.error ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    {analyticsResult?.error || 'Немає даних'}
                  </p>
                ) : analyticsRows.length > 0 ? (
                  <>
                    <div className="mb-2 flex justify-end">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setFullscreenTable("analytics")}>
                        <Maximize2 className="mr-1 h-3 w-3" /> Повний екран
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        {analyticsHeaders.length > 0 && (
                          <TableHeader>
                            <TableRow>
                              {analyticsHeaders.map((h: string, i: number) => (
                                <TableHead key={i} className="text-xs py-1.5 whitespace-nowrap font-semibold text-foreground">{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                        )}
                        <TableBody>
                          {analyticsRows.map((row: string[], ri: number) => {
                            const rawRow = analyticsResult.rawCells?.[ri];
                            return (
                              <TableRow key={ri} className="hover:opacity-90">
                                {row.map((cell: string, ci: number) => {
                                  const raw = rawRow?.[ci];
                                  return (
                                     <TableCell
                                      key={ci}
                                       className={cn(
                                         "text-xs py-1 whitespace-nowrap tabular-nums font-medium text-foreground",
                                         raw?.isRed && "cell-danger",
                                         raw?.isGreen && "cell-success",
                                         raw?.isOrange && "cell-warning",
                                       )}
                                     >
                                       {cell}
                                     </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">Немає даних</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
        <WeatherWidget washName={wash.washName} selectedDateFrom={selectedDateFrom} selectedDateTo={selectedDateTo} />
      </Card>
    </Collapsible>

    {/* Full summary modal */}
    <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Підсумковий звіт (повний) — {wash.washName} ({selectedDateFrom} – {selectedDateTo})</DialogTitle>
        </DialogHeader>
        {summaryLoading ? (
          <div className="py-8 text-center text-muted-foreground">Завантаження...</div>
        ) : (() => {
          const washResult = summaryData?.results?.find((r: { washName: string }) => r.washName === wash.washName) || summaryData?.results?.[0];
          if (!washResult) return <div className="py-8 text-center text-muted-foreground">Немає даних</div>;
          if (washResult.error) return <div className="py-6 text-center text-destructive text-sm">{washResult.error}</div>;
          if (!washResult.rows?.length) return <div className="py-6 text-center text-muted-foreground text-sm">Дані відсутні</div>;
          return (
            <Table>
              <TableHeader>
                <TableRow>
                  {(washResult.headers || []).map((h: string, i: number) => (
                    <TableHead key={i} className={cn("text-xs py-1.5", i > 0 && "text-right")}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {washResult.rows.map((row: string[], ri: number) => (
                  <TableRow key={ri}>
                    {row.map((cell: string, ci: number) => (
                      <TableCell key={ci} className={cn("text-xs py-1", ci > 0 && "text-right tabular-nums")}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {washResult.totalRow?.length > 0 && (
                <TableFooter>
                  <TableRow>
                    {washResult.totalRow.map((cell: string, ci: number) => (
                      <TableCell key={ci} className={cn("text-xs py-1 font-semibold", ci > 0 && "text-right tabular-nums")}>{cell}</TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          );
        })()}
      </DialogContent>
    </Dialog>

    <Dialog open={fullscreenTable !== null} onOpenChange={(isOpen) => !isOpen && setFullscreenTable(null)}>
      <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {fullscreenTable === "technical" ? `Технічний стан — ${wash.washName}` : `Аналітика — ${wash.washName}`}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[78vh] overflow-auto">
          {fullscreenTable === "technical" && techResult?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {(techResult.headers || []).map((h: string, i: number) => (
                    <TableHead key={i} className="text-xs py-1.5 whitespace-nowrap">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {techResult.rows.map((row: string[], ri: number) => {
                  const rawRow = techResult.rawCells?.[ri];
                  return (
                    <TableRow key={ri} className="hover:opacity-90">
                      {row.map((cell: string, ci: number) => {
                        const raw = rawRow?.[ci];
                        return (
                          <TableCell
                            key={ci}
                            className={cn(
                              "text-xs py-1 whitespace-nowrap",
                              raw?.isRed && "cell-danger",
                              raw?.isGreen && "cell-success",
                              raw?.isOrange && "cell-warning",
                              !raw?.isRed && !raw?.isGreen && !raw?.isOrange && "cell-secondary"
                            )}
                          >
                            {cell}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : fullscreenTable === "analytics" && analyticsRows.length ? (
            <Table>
              {analyticsHeaders.length > 0 && (
                <TableHeader>
                  <TableRow>
                    {analyticsHeaders.map((h: string, i: number) => (
                      <TableHead key={i} className="text-xs py-1.5 whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
              )}
              <TableBody>
                {analyticsRows.map((row: string[], ri: number) => {
                  const rawRow = analyticsResult?.rawCells?.[ri];
                  return (
                    <TableRow key={ri} className="hover:opacity-90">
                      {row.map((cell: string, ci: number) => {
                        const raw = rawRow?.[ci];
                        return (
                          <TableCell
                            key={ci}
                            className={cn(
                              "text-xs py-1 whitespace-nowrap tabular-nums",
                              raw?.isRed && "cell-danger",
                              raw?.isGreen && "cell-success",
                              raw?.isOrange && "cell-warning",
                              !raw?.isRed && !raw?.isGreen && !raw?.isOrange && "cell-secondary"
                            )}
                          >
                            {cell}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Немає даних</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <TelegramNotificationSettings />
    </>
  );
}

export default Index;
