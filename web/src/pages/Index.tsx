import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import InventoryGrid from "@/components/InventoryGrid";
import TotalInventorySummary from "@/components/TotalInventorySummary";
import MovementForm from "@/components/MovementForm";
import MovementHistory from "@/components/MovementHistory";
import MovementReport from "@/components/MovementReport";
import LaundryReport from "@/components/LaundryReport";
import BackupRestore from "@/components/BackupRestore";
import { Package, LogOut, BarChart2, History, WashingMachine, Wallet, Clock, Settings2, Palette, ChevronRight, ClipboardList } from "lucide-react";
import HeaderNavGrid from "@/components/HeaderNavGrid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";
import movementIcon from "@/assets/movement-icon.png";
import apt1 from "@/assets/apt1.jpg";
import apt2 from "@/assets/apt2.jpg";
import apt3 from "@/assets/apt3.jpg";
import apt4 from "@/assets/apt4.jpg";
import apt5 from "@/assets/apt5.jpg";
import apt6 from "@/assets/apt6.jpg";
import apt7 from "@/assets/apt7.jpg";
import apt8 from "@/assets/apt8.jpg";
import WeatherWidget, { WeatherForecastModal } from "@/components/WeatherWidget";
import SmartVoiceButton, { MovementResult } from "@/components/SmartVoiceButton";
import { CitizenshipCountdown } from "@/components/CitizenshipCountdown";
import { CitizenshipModal } from "@/components/CitizenshipModal";
import CityCarouselOverlay from "@/components/CityCarouselOverlay";
import CitySettingsPanel from "@/components/CitySettingsPanel";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useCityTheme, CITIES, ThemeKey } from "@/context/CityThemeContext";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { invoke } from "@/lib/invoke";

const SLIDES = [apt1, apt2, apt3, apt4, apt5, apt6, apt7, apt8];

interface InventoryItem {
  location: string;
  item_type: string;
  quantity: number;
}

interface Movement {
  id: string;
  from_location: string;
  to_location: string;
  item_type: string;
  quantity: number;
  created_at: string;
  notes: string | null;
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
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />
    </div>
  );
}

// Section that opens directly when clicked from tile (no collapsible header visible)
function DirectSection({
  id, children, open, onToggle, title,
}: {
  id: string; children: React.ReactNode; open: boolean; onToggle: () => void; title: string;
}) {
  return (
    <div id={`section-${id}`} className={cn(
      "rounded-2xl overflow-hidden border shadow-lg transition-all",
      open ? "border-primary/30 bg-card/80 backdrop-blur-sm" : "border-white/10"
    )}>
      {open && (
        <div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <button onClick={onToggle} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/10 transition">Закрыть ✕</button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      )}
    </div>
  );
}

// Movement dropdown with animation — includes thematic icon
function MovementDropdown({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden border shadow-lg transition-all duration-300",
      open ? "border-primary/40 bg-card/80 backdrop-blur-sm" : "border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/15"
    )}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-[0.98]"
        onClick={() => setOpen(o => !o)}
      >
        {/* Thematic movement illustration — same height as button row */}
        <img
          src={movementIcon}
          alt="Перемещение"
          className="h-10 w-auto object-contain opacity-80 shrink-0"
        />
        <span className="text-base font-bold tracking-tight text-foreground flex-1 text-center">Новое перемещение</span>
        <span className={cn(
          "flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 text-sm shrink-0",
          open ? "bg-primary/20 rotate-45" : "bg-primary/10"
        )}>➕</span>
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        open ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-4 pb-4 pt-1 border-t border-white/10">
          <MovementForm onSuccess={() => { onSuccess(); setOpen(false); }} />
        </div>
      </div>
    </div>
  );
}

const locationNames: Record<string, string> = {
  piral_1: "Пераль 1", piral_2: "Пераль 2", salvador: "Сальвадор",
  dirty_linen_piral: "Пераль грязное", dirty_linen_salvador: "Сальвадор грязное",
  clean_linen_piral: "Пераль кладовка", clean_linen_salvador: "Сальвадор шкаф",
  albert_laundry: "Прачечная Альберт", purchase: "Закупка", damaged: "Испорченное",
};

const Index = () => {
  const navigate = useNavigate();
  const { activeCity, activeTheme, setWeatherOpen, weatherOpen, settingsOpen, setSettingsOpen, themeSwitcherOpen, setThemeSwitcherOpen } = useCityTheme();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [lastMovement, setLastMovement] = useState<Movement | null>(null);
  const [citizenshipModalOpen, setCitizenshipModalOpen] = useState(false);

  // Section open states
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Swipe state — only header zone triggers navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Header-only swipe handlers
  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const goToCleaning = useCallback(() => {
    const cleaningAuth = sessionStorage.getItem('cleaning_authenticated');
    const cleaningUser = sessionStorage.getItem('cleaning_user');
    if (cleaningAuth && cleaningUser) navigate('/cleaning');
    else navigate('/cleaning-auth');
  }, [navigate]);

  const handleHeaderTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      // Circular: Бельё → swipe left → Финансы, swipe right → Задачи
      if (dx < 0) goToCleaning();
      else {
        const cleaningAuth = sessionStorage.getItem('cleaning_authenticated');
        const cleaningUser = sessionStorage.getItem('cleaning_user');
        if (cleaningAuth && cleaningUser) navigate('/tasks');
        else navigate('/cleaning-auth');
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [goToCleaning, navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('authenticated');
    navigate('/auth');
  };

  const fetchInventory = async () => {
    setIsLoadingInventory(true);
    const { data: movementsData, error } = await supabase.from("movements").select("*");
    if (error) { setIsLoadingInventory(false); return; }
    const inventoryMap = new Map<string, number>();
    movementsData?.forEach((movement) => {
      const toKey = `${movement.to_location}:${movement.item_type}`;
      inventoryMap.set(toKey, (inventoryMap.get(toKey) || 0) + movement.quantity);
      const fromKey = `${movement.from_location}:${movement.item_type}`;
      inventoryMap.set(fromKey, (inventoryMap.get(fromKey) || 0) - movement.quantity);
    });
    const inventoryArray: InventoryItem[] = [];
    inventoryMap.forEach((quantity, key) => {
      if (quantity > 0) {
        const [location, item_type] = key.split(":");
        inventoryArray.push({ location, item_type, quantity });
      }
    });
    setInventory(inventoryArray);
    setIsLoadingInventory(false);
  };

  const fetchMovements = async () => {
    setIsLoadingMovements(true);
    const { data, error } = await supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(50);
    if (!error) {
      setMovements(data || []);
      if (data && data.length > 0) setLastMovement(data[0]);
    }
    setIsLoadingMovements(false);
  };

  useEffect(() => {
    fetchInventory();
    fetchMovements();
    const fetchBalance = async () => {
      const { data: users } = await supabase.from("cleaning_users").select("id").eq("username", "emmochka").single();
      if (users?.id) {
        const { data } = await invoke("emma-cash", { body: { action: "list", userId: users.id } });
        if (data?.transactions) {
          const txs = data.transactions as Array<{ transaction_type: string; amount: number }>;
          const inc = txs.filter(t => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const exp = txs.filter(t => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          setCashBalance(inc - exp);
        }
      }
    };
    fetchBalance();
    const channel = supabase.channel("movements_changes").on("postgres_changes", { event: "*", schema: "public", table: "movements" }, () => { fetchInventory(); fetchMovements(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMovementSuccess = () => { fetchInventory(); fetchMovements(); };

  const handleVoiceMovement = (data: MovementResult) => {
    window.dispatchEvent(new CustomEvent("smart-voice-fill-movement", { detail: data }));
  };

  const lastMovementDays = lastMovement
    ? differenceInDays(new Date(), new Date(lastMovement.created_at))
    : null;

  const handleTileClick = (id: string) => {
    setOpenSection(prev => prev === id ? null : id);
    setTimeout(() => {
      const el = document.getElementById(`section-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const tiles = [
    { icon: <Package className="h-5 w-5" />, label: "Остатки", id: "inventory", emoji: "📦", color: "from-blue-500/20 to-blue-400/10 border-blue-400/30" },
    { icon: <BarChart2 className="h-5 w-5" />, label: "Отчёт", id: "report", emoji: "📊", color: "from-violet-500/20 to-violet-400/10 border-violet-400/30" },
    { icon: <History className="h-5 w-5" />, label: "История", id: "history", emoji: "🕐", color: "from-amber-500/20 to-amber-400/10 border-amber-400/30" },
    { icon: <WashingMachine className="h-5 w-5" />, label: "Альберт", id: "laundry", emoji: "🫧", color: "from-emerald-500/20 to-emerald-400/10 border-emerald-400/30" },
  ];

  return (
    <div className="min-h-screen relative">
      {/* City background carousel - behind everything */}
      <CityCarouselOverlay />

      {/* Dark overlay for content readability when no city theme */}
      {!activeCity && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{
          background: activeTheme === "light"
            ? "linear-gradient(180deg, hsl(210 20% 98%), hsl(200 30% 96%))"
            : "linear-gradient(180deg, hsl(215 28% 10%), hsl(220 25% 13%))"
        }} />
      )}

      {/* All content is above z-0 */}
      <div className="relative z-10">
        <WeatherForecastModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />
        <CitizenshipModal open={citizenshipModalOpen} onClose={() => setCitizenshipModalOpen(false)} />
        {settingsOpen && <CitySettingsPanel onClose={() => setSettingsOpen(false)} />}
        {themeSwitcherOpen && <ThemeSwitcher onClose={() => setThemeSwitcherOpen(false)} />}

        {/* HERO HEADER — swipe here to switch pages */}
        <div
          className="relative"
          style={{ zIndex: 20 }}
          onTouchStart={handleHeaderTouchStart}
          onTouchEnd={handleHeaderTouchEnd}
        >
          <div className="relative w-full" style={{ height: "260px" }}>
            <PhotoSlideshow />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/60" />

            <div className="absolute top-0 left-0 right-0 px-4 pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={logo} alt="ERA Logo" className="h-10 object-contain drop-shadow-lg" />
                <div>
                  <h1 className="text-xl font-bold text-white drop-shadow-md tracking-tight">ERA Apartments</h1>
                  <p className="text-white/70 text-xs">Учёт постельного белья</p>
                  <WeatherWidget onOpenForecast={() => setWeatherOpen(true)} />
                  <CitizenshipCountdown onClick={() => setCitizenshipModalOpen(true)} />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Button size="sm" variant="ghost" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-3 text-xs" onClick={handleLogout}>
                  <LogOut className="h-3 w-3 mr-1" />Выход
                </Button>
                <div className="flex items-center gap-1.5">
                  {/* Theme switcher button */}
                  <button
                    onClick={() => setThemeSwitcherOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs transition backdrop-blur-sm"
                    title="Сменить тему"
                  >
                    <Palette className="h-3 w-3" />
                    <span className="hidden sm:inline">Тема</span>
                  </button>
                  {/* Settings button */}
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

            <HeaderNavGrid activePage={0} />
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">

          {/* Last movement banner */}
          {lastMovement && lastMovementDays !== null && (
            <button
              onClick={() => handleTileClick("history")}
              className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border hover:bg-muted/50 transition-all shadow-sm group"
            >
              <Clock className="h-4 w-4 text-foreground/60 shrink-0" />
              <span className="text-xs text-foreground/70">Последнее перемещение:</span>
              <span className={cn(
                "text-sm font-bold shrink-0",
                lastMovementDays === 0 ? "text-green-500 dark:text-green-400" : lastMovementDays <= 2 ? "text-green-600 dark:text-green-400" : "text-destructive"
              )}>
                {lastMovementDays === 0 ? "сегодня" : `${lastMovementDays} ${lastMovementDays === 1 ? "день" : lastMovementDays < 5 ? "дня" : "дней"} назад`}
              </span>
              <span className="text-xs text-foreground/50 hidden sm:inline">
                {format(new Date(lastMovement.created_at), "d MMM", { locale: ru })}
                {" · "}
                {locationNames[lastMovement.from_location] || lastMovement.from_location}
                {" → "}
                {locationNames[lastMovement.to_location] || lastMovement.to_location}
              </span>
              <ChevronRight className="h-3 w-3 text-foreground/40 ml-auto group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Movement form */}
          <MovementDropdown onSuccess={handleMovementSuccess} />

          {/* Tiles */}
          <div className="grid grid-cols-4 gap-2">
            {tiles.map(tile => (
              <button
                key={tile.id}
                onClick={() => handleTileClick(tile.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-2xl border bg-gradient-to-br shadow-sm hover:shadow-md transition-all active:scale-95 backdrop-blur-sm",
                  tile.color,
                  openSection === tile.id ? "ring-2 ring-primary/60 scale-105" : ""
                )}
              >
                <span className="text-xl">{tile.emoji}</span>
                <span className="text-xs font-semibold text-foreground">{tile.label}</span>
              </button>
            ))}
          </div>

          {/* Direct sections - open/close without CollapsibleSection */}
          <DirectSection id="inventory" open={openSection === "inventory"} onToggle={() => setOpenSection(null)} title="📦 Сводка и текущие остатки">
            <div className="space-y-4">
              <TotalInventorySummary inventory={inventory} isLoading={isLoadingInventory} />
              <InventoryGrid inventory={inventory} isLoading={isLoadingInventory} onUpdate={handleMovementSuccess} />
            </div>
          </DirectSection>

          <DirectSection id="report" open={openSection === "report"} onToggle={() => setOpenSection(null)} title="📊 Отчёт по перемещениям">
            <MovementReport movements={movements} />
          </DirectSection>

          <DirectSection id="history" open={openSection === "history"} onToggle={() => setOpenSection(null)} title="🕐 История перемещений">
            <MovementHistory movements={movements} isLoading={isLoadingMovements} />
          </DirectSection>

          <DirectSection id="laundry" open={openSection === "laundry"} onToggle={() => setOpenSection(null)} title="🫧 Взаиморасчёты с Прачечной Альберт">
            <LaundryReport movements={movements} />
          </DirectSection>

          <DirectSection id="backup" open={openSection === "backup"} onToggle={() => setOpenSection(null)} title="🗄 Резервное копирование">
            <BackupRestore />
          </DirectSection>
        </div>
      </div>

      <SmartVoiceButton context="movement" onMovementResult={handleVoiceMovement} />
    </div>
  );
};

export default Index;
