import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, LogOut, Package, ClipboardList, History, Building2, Brain, Send, Palette, Settings2, CreditCard, MessageSquare } from "lucide-react";
import HeaderNavGrid from "@/components/HeaderNavGrid";
import PaymentLog from "@/components/cleaning/PaymentLog";
import TasksTab from "@/components/tasks/TasksTab";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import EmmaCash from "@/components/cleaning/EmmaCash";
import EmmaCashLog from "@/components/cleaning/EmmaCashLog";
import MainCash from "@/components/cleaning/MainCash";
import WeatherWidget, { WeatherForecastModal } from "@/components/WeatherWidget";
import SmartVoiceButton, { TransactionResult, TaskResult, VoiceContext } from "@/components/SmartVoiceButton";
import CityCarouselOverlay from "@/components/CityCarouselOverlay";
import CitySettingsPanel from "@/components/CitySettingsPanel";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useCityTheme } from "@/context/CityThemeContext";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";
import apt1 from "@/assets/apt1.jpg";
import apt2 from "@/assets/apt2.jpg";
import apt3 from "@/assets/apt3.jpg";
import apt4 from "@/assets/apt4.jpg";
import apt5 from "@/assets/apt5.jpg";
import apt6 from "@/assets/apt6.jpg";
import apt7 from "@/assets/apt7.jpg";
import apt8 from "@/assets/apt8.jpg";
import { invoke } from "@/lib/invoke";

const SLIDES = [apt1, apt2, apt3, apt4, apt5, apt6, apt7, apt8];

interface CleaningUser {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'coordinator' | 'cleaner';
}

function PhotoSlideshow() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % SLIDES.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative w-full h-full overflow-hidden">
      {SLIDES.map((src, i) => (
        <img key={i} src={src} alt=""
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-1000", i === current ? "opacity-100" : "opacity-0")}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={cn("w-1.5 h-1.5 rounded-full transition-all", i === current ? "bg-white w-4" : "bg-white/50")} />
        ))}
      </div>
    </div>
  );
}


const CleaningDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<CleaningUser | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("emma-cash");
  const [pendingVoiceTask, setPendingVoiceTask] = useState<TaskResult | null>(null);
  const { activeCity, activeTheme, setWeatherOpen, weatherOpen, settingsOpen, setSettingsOpen, themeSwitcherOpen, setThemeSwitcherOpen } = useCityTheme();

  // Swipe right on HEADER → go to linen tracking page
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleHeaderTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      // Circular: Финансы → swipe right → Бельё, swipe left → Задачи
      if (dx > 0) navigate('/');
      else navigate('/tasks');
      // Note: Уборки is accessible from Задачи (swipe left)
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [navigate]);

  useEffect(() => {
    const userStr = sessionStorage.getItem('cleaning_user');
    const authenticated = sessionStorage.getItem('cleaning_authenticated');
    if (!authenticated || !userStr) {
      navigate('/cleaning-auth');
      return;
    }
    const user = JSON.parse(userStr);
    setCurrentUser(user);
    invoke("emma-cash", { body: { action: "list", userId: user.id } }).then(({ data }) => {
      if (data?.transactions) {
        const txs = data.transactions as Array<{ transaction_type: string; amount: number }>;
        const inc = txs.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
        const exp = txs.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
        setBalance(inc - exp);
      }
    });
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('cleaning_user');
    sessionStorage.removeItem('cleaning_authenticated');
    toast({ title: "Выход выполнен", description: "До свидания!" });
    navigate('/cleaning-auth');
  };

  const handleVoiceTransaction = (data: TransactionResult) => {
    window.dispatchEvent(new CustomEvent("smart-voice-fill-transaction", { detail: data }));
    if (activeTab !== "emma-cash") setActiveTab("emma-cash");
  };

  const handleVoiceTask = (data: TaskResult) => {
    // Switch to tasks tab first, then after a short delay set pending data
    // so TasksTab has time to mount before receiving the prop
    setActiveTab("tasks");
    setTimeout(() => setPendingVoiceTask(data), 150);
  };

  if (!currentUser) return null;

  const isAdminOrCoordinator = currentUser.role === 'admin' || currentUser.role === 'coordinator';
  const isAdmin = currentUser.role === 'admin';
  const isCleaner = currentUser.role === "cleaner";
  const voiceContext: VoiceContext = isCleaner ? "task" : (activeTab === "tasks" ? "task" : "emma_cash");

  const header = (
    <>
      <WeatherForecastModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />
      {/* HERO — swipe here to navigate between pages */}
      <div
        className="relative w-full"
        style={{ height: "260px" }}
        onTouchStart={handleHeaderTouchStart}
        onTouchEnd={handleHeaderTouchEnd}
      >
        <PhotoSlideshow />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/60" />
        <div className="absolute top-0 left-0 right-0 px-4 pt-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} title="Учёт белья" className="shrink-0 hover:opacity-80 transition-opacity">
              <img src={logo} alt="ERA Logo" className="h-10 object-contain drop-shadow-lg" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white drop-shadow-md tracking-tight">
                {isCleaner ? "Задачи и заявки" : "ERA · Управление"}
              </h1>
              <p className="text-white/70 text-xs">
                {currentUser.full_name} · {currentUser.role === 'admin' ? 'Администратор' : currentUser.role === 'coordinator' ? 'Координатор' : 'Уборщица'}
              </p>
              {!isCleaner && balance !== null && (
                <button onClick={() => setActiveTab("emma-cash")} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                  <span className="text-white/60 text-xs">Касса:</span>
                  <span className={cn("text-xs font-bold drop-shadow", balance >= 0 ? "text-green-300" : "text-red-300")}>
                    {balance >= 0 ? "+" : ""}{balance.toFixed(2)}€
                  </span>
                </button>
              )}
              {!isCleaner && <WeatherWidget onOpenForecast={() => setWeatherOpen(true)} />}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Logout removed */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setThemeSwitcherOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm"
                title="Сменить тему"
              >
                <Palette className="h-3 w-3" />
                <span className="hidden sm:inline">Тема</span>
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm"
                title="Настройки городов"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        <HeaderNavGrid activePage={1} />
      </div>
    </>
  );

  return (
    <div className="min-h-screen transition-all duration-700 relative">
      {/* City carousel overlay (or solid dark bg when no city theme) */}
      <CityCarouselOverlay />

      {/* Dark background when no city theme active */}
      {!activeCity && activeTheme !== "mix" && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{
          background: activeTheme === "light"
            ? "linear-gradient(180deg, hsl(210 20% 98%), hsl(200 30% 96%))"
            : "linear-gradient(180deg, hsl(215 28% 10%), hsl(220 25% 13%))"
        }} />
      )}

      {settingsOpen && <CitySettingsPanel onClose={() => setSettingsOpen(false)} />}
      {themeSwitcherOpen && <ThemeSwitcher onClose={() => setThemeSwitcherOpen(false)} />}

      <div className="relative z-10">
        {header}

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">
        {isCleaner ? (
        <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
            <div className="px-6 pb-6 pt-4 bg-white/30">
              <TasksTab currentUser={currentUser} pendingVoiceTask={pendingVoiceTask} onPendingVoiceTaskHandled={() => setPendingVoiceTask(null)} />
            </div>
          </div>
        ) : isAdminOrCoordinator ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-4" : "grid-cols-2")}>
              <TabsTrigger value="emma-cash" className="text-xs">
                <Wallet className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="truncate">Касса</span>
              </TabsTrigger>
              <TabsTrigger value="log" className="text-xs">
                <History className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="truncate">Журнал</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="main-cash" className="text-xs">
                  <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span className="truncate">Основная</span>
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="payments" className="text-xs">
                  <CreditCard className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <span className="truncate">Выплаты</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="emma-cash">
              <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
                <div className="px-6 py-4 flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></span>
                  <span className="text-base font-semibold tracking-tight">Касса Эммочка</span>
                </div>
                <div className="px-6 pb-6 pt-2 border-t border-white/20 bg-white/30">
                  <EmmaCash currentUserId={currentUser.id} currentUserRole={currentUser.role} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="log">
              <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
                <div className="px-6 py-4 flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-primary/10 text-primary"><History className="h-5 w-5" /></span>
                  <span className="text-base font-semibold tracking-tight">Журнал изменений</span>
                </div>
                <div className="px-6 pb-6 pt-2 border-t border-white/20 bg-white/30">
                  <EmmaCashLog currentUserId={currentUser.id} />
                </div>
              </div>
            </TabsContent>
            {isAdmin && (
              <TabsContent value="main-cash">
                <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
                  <div className="px-6 py-4 flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
                    <span className="text-base font-semibold tracking-tight">Касса Основная</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 ml-auto">🔒 Только для вас</span>
                  </div>
                  <div className="px-6 pb-6 pt-2 border-t border-white/20 bg-white/30">
                    <MainCash currentUserId={currentUser.id} />
                  </div>
                </div>
              </TabsContent>
            )}
            {isAdmin && (
              <TabsContent value="payments">
                <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-white/60 backdrop-blur-sm">
                  <div className="px-6 py-4 flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
                    <span className="text-base font-semibold tracking-tight">Лог выплат уборщицам</span>
                  </div>
                  <div className="px-6 pb-6 pt-2 border-t border-white/20 bg-white/30">
                    <PaymentLog currentUserId={currentUser.id} />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        ) : null}

        {/* Hidden admin links — AI training + Telegram settings */}
        {isAdmin && (
          <div className="flex justify-center gap-4 pt-4 pb-2">
            <button
              onClick={() => navigate('/ai-training')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
              title="Тренировка голосового ИИ"
            >
              <Brain className="h-3 w-3" />
              <span>ИИ</span>
            </button>
            <button
              onClick={() => navigate('/telegram-settings')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
              title="Настройки Telegram"
            >
              <Send className="h-3 w-3" />
              <span>TG</span>
            </button>
          </div>
        )}
      </div>
      </div>

      <SmartVoiceButton
        context={voiceContext}
        onTransactionResult={handleVoiceTransaction}
        onTaskResult={handleVoiceTask}
      />
    </div>
  );
};

export default CleaningDashboard;
