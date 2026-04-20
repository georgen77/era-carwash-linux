import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TasksTab from "@/components/tasks/TasksTab";
import SmartVoiceButton, { TaskResult, VoiceContext } from "@/components/SmartVoiceButton";
import CityCarouselOverlay from "@/components/CityCarouselOverlay";
import WeatherWidget, { WeatherForecastModal } from "@/components/WeatherWidget";
import { useCityTheme } from "@/context/CityThemeContext";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";
import { LogOut, Wallet, Package, Palette, Settings2 } from "lucide-react";
import HeaderNavGrid from "@/components/HeaderNavGrid";
import { Button } from "@/components/ui/button";
import CitySettingsPanel from "@/components/CitySettingsPanel";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import apt1 from "@/assets/apt1.jpg";
import apt2 from "@/assets/apt2.jpg";
import apt3 from "@/assets/apt3.jpg";
import apt4 from "@/assets/apt4.jpg";
import apt5 from "@/assets/apt5.jpg";
import apt6 from "@/assets/apt6.jpg";
import apt7 from "@/assets/apt7.jpg";
import apt8 from "@/assets/apt8.jpg";

const SLIDES = [apt1, apt2, apt3, apt4, apt5, apt6, apt7, apt8];

interface CleaningUser {
  id: string; username: string; full_name: string; role: string;
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
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const { activeCity, activeTheme, setWeatherOpen, weatherOpen, settingsOpen, setSettingsOpen, themeSwitcherOpen, setThemeSwitcherOpen } = useCityTheme();
  const [currentUser, setCurrentUser] = useState<CleaningUser | null>(null);
  const [pendingVoiceTask, setPendingVoiceTask] = useState<TaskResult | null>(null);

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
      // Circular: Задачи → swipe right → Финансы, swipe left → Уборки
      if (dx > 0) navigate('/cleaning');
      else navigate('/cleanings');
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
    setCurrentUser(JSON.parse(userStr));
  }, [navigate]);

  const handleVoiceTask = (data: TaskResult) => {
    setPendingVoiceTask(data);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('cleaning_user');
    sessionStorage.removeItem('cleaning_authenticated');
    navigate('/cleaning-auth');
  };

  if (!currentUser) return null;

  const voiceContext: VoiceContext = "task";

  return (
    <div className="min-h-screen relative">
      <CityCarouselOverlay />
      {!activeCity && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{
          background: activeTheme === "light"
            ? "linear-gradient(180deg, hsl(210 20% 98%), hsl(200 30% 96%))"
            : "linear-gradient(180deg, hsl(215 28% 10%), hsl(220 25% 13%))"
        }} />
      )}

      <div className="relative z-10">
        <WeatherForecastModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />
        {settingsOpen && <CitySettingsPanel onClose={() => setSettingsOpen(false)} />}
        {themeSwitcherOpen && <ThemeSwitcher onClose={() => setThemeSwitcherOpen(false)} />}

        {/* HERO */}
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
              <button onClick={() => navigate('/')} className="shrink-0 hover:opacity-80 transition-opacity">
                <img src={logo} alt="ERA Logo" className="h-10 object-contain drop-shadow-lg" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow-md tracking-tight">🗂️ Задачи</h1>
                <p className="text-white/70 text-xs">{currentUser.full_name}</p>
                <WeatherWidget onOpenForecast={() => setWeatherOpen(true)} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button size="sm" variant="ghost" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-3 text-xs" onClick={handleLogout}>
                <LogOut className="h-3 w-3 mr-1" />Выход
              </Button>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setThemeSwitcherOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm">
                  <Palette className="h-3 w-3" />
                </button>
                <button onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm">
                  <Settings2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <HeaderNavGrid activePage={2} />
        </div>

        {/* Content */}
        <div className="max-w-2xl mx-auto px-3 py-4">
          <div className="rounded-2xl overflow-hidden border border-white/30 shadow-lg bg-card/80 backdrop-blur-sm">
            <div className="px-4 pb-6 pt-4">
              <TasksTab
                currentUser={currentUser}
                pendingVoiceTask={pendingVoiceTask}
                onPendingVoiceTaskHandled={() => setPendingVoiceTask(null)}
              />
            </div>
          </div>
        </div>
      </div>

      <SmartVoiceButton context={voiceContext} onTaskResult={handleVoiceTask} />
    </div>
  );
}
