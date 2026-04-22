import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "uk" | "en" | "de" | "ru";
export type AppTheme = "light" | "dark" | "odessa" | "heidelberg" | "valencia" | "cities";

const translations: Record<Lang, Record<string, string>> = {
  uk: {
    appTitle: "ERA Автомийки",
    subtitle: "Панель звітності",
    today: "Сьогодні",
    yesterday: "Вчора",
    currentWeek: "Поточний тиждень",
    lastWeek: "Минулий тиждень",
    currentMonth: "Поточний місяць",
    lastMonth: "Минулий місяць",
    customDates: "Період",
    totalRevenue: "Загальна виручка",
    revenue: "Виручка",
    noData: "Немає даних за обраний період",
    loading: "Завантаження...",
    error: "Помилка",
    collections: "Інкасації",
    collectionsDesc: "Дані по інкасаціях",
    analytics: "Аналітика",
    analyticsDesc: "Середній чек, клієнти, оборот",
    middleCheck: "Середній чек",
    middleCheckDesc: "Графік середнього чеку",
    hoursAgo: "год",
    month: "Місяць",
    avgCheck: "Сер. чек ₴",
    clients: "Клієнти",
    revenue2: "Оборот ₴",
    services: "Послуги ₴",
    avgActivity: "Сер. акт.",
    avgServiceCost: "Сер. варт. НП ₴",
    expenses: "Витрати",
    profit: "Прибуток",
  },
  en: {
    appTitle: "ERA Car Wash",
    subtitle: "Reporting Panel",
    today: "Today",
    yesterday: "Yesterday",
    currentWeek: "This Week",
    lastWeek: "Last Week",
    currentMonth: "This Month",
    lastMonth: "Last Month",
    customDates: "Period",
    totalRevenue: "Total Revenue",
    revenue: "Revenue",
    noData: "No data for selected period",
    loading: "Loading...",
    error: "Error",
    collections: "Collections",
    collectionsDesc: "Collection data",
    analytics: "Analytics",
    analyticsDesc: "Avg check, clients, turnover",
    middleCheck: "Avg Check",
    middleCheckDesc: "Average check chart",
    hoursAgo: "hrs",
    month: "Month",
    avgCheck: "Avg Check ₴",
    clients: "Clients",
    revenue2: "Turnover ₴",
    services: "Services ₴",
    avgActivity: "Avg Activity",
    avgServiceCost: "Avg Service ₴",
    expenses: "Expenses",
    profit: "Profit",
  },
  de: {
    appTitle: "ERA Autowaschanlage",
    subtitle: "Berichtsübersicht",
    today: "Heute",
    yesterday: "Gestern",
    currentWeek: "Aktuelle Woche",
    lastWeek: "Letzte Woche",
    currentMonth: "Aktueller Monat",
    lastMonth: "Letzter Monat",
    customDates: "Zeitraum",
    totalRevenue: "Gesamtumsatz",
    revenue: "Umsatz",
    noData: "Keine Daten für den ausgewählten Zeitraum",
    loading: "Laden...",
    error: "Fehler",
    collections: "Inkasso",
    collectionsDesc: "Inkassodaten",
    analytics: "Analytik",
    analyticsDesc: "Durchschn. Scheck, Kunden, Umsatz",
    middleCheck: "Durchschn. Scheck",
    middleCheckDesc: "Durchschn. Scheckdiagramm",
    hoursAgo: "Std",
    month: "Monat",
    avgCheck: "Durchschn. ₴",
    clients: "Kunden",
    revenue2: "Umsatz ₴",
    services: "Dienste ₴",
    avgActivity: "Durchschn. Akt.",
    avgServiceCost: "Durchschn. NP ₴",
    expenses: "Ausgaben",
    profit: "Gewinn",
  },
  ru: {
    appTitle: "ERA Автомойки",
    subtitle: "Панель отчётности",
    today: "Сегодня",
    yesterday: "Вчера",
    currentWeek: "Текущая неделя",
    lastWeek: "Прошлая неделя",
    currentMonth: "Текущий месяц",
    lastMonth: "Прошлый месяц",
    customDates: "Период",
    totalRevenue: "Общая выручка",
    revenue: "Выручка",
    noData: "Нет данных за выбранный период",
    loading: "Загрузка...",
    error: "Ошибка",
    collections: "Инкассации",
    collectionsDesc: "Данные по инкассациям",
    analytics: "Аналитика",
    analyticsDesc: "Средний чек, клиенты, оборот",
    middleCheck: "Средний чек",
    middleCheckDesc: "График среднего чека",
    hoursAgo: "ч",
    month: "Месяц",
    avgCheck: "Ср. чек ₴",
    clients: "Клиенты",
    revenue2: "Оборот ₴",
    services: "Услуги ₴",
    avgActivity: "Ср. акт.",
    avgServiceCost: "Ср. ст. НУ ₴",
    expenses: "Расходы",
    profit: "Прибыль",
  },
};

interface AppContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  t: (key: string) => string;
}

const AppContext = createContext<AppContextType>({
  lang: "uk",
  setLang: () => {},
  theme: "dark",
  setTheme: () => {},
  t: (k) => k,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "uk");
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem("app_theme") as AppTheme) || "dark");

  useEffect(() => {
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("app_theme", theme);
    // dark-mode class: all city themes use dark base too
    document.documentElement.classList.toggle("dark", theme !== "light");
    // Remove old theme classes
    document.documentElement.classList.remove("theme-odessa", "theme-heidelberg", "theme-valencia");
    if (theme === "odessa") document.documentElement.classList.add("theme-odessa");
    else if (theme === "heidelberg") document.documentElement.classList.add("theme-heidelberg");
    else if (theme === "valencia") document.documentElement.classList.add("theme-valencia");
    // "cities" uses dark base (no city-specific CSS vars, just slideshow)
  }, [theme]);

  const t = (key: string) => translations[lang]?.[key] || translations.uk[key] || key;

  return (
    <AppContext.Provider value={{ lang, setLang, theme, setTheme, t }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
