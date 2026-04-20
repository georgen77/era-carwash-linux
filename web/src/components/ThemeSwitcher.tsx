import { X, Sun, Moon, Globe, Shuffle } from "lucide-react";
import { useCityTheme, CITIES, ThemeKey } from "@/context/CityThemeContext";
import { cn } from "@/lib/utils";

const THEMES: Array<{ key: ThemeKey; label: string; emoji: string; desc: string; bg: string }> = [
  { key: "dark", label: "Тёмная", emoji: "🌙", desc: "По умолчанию", bg: "from-slate-800 to-slate-900" },
  { key: "light", label: "Светлая", emoji: "☀️", desc: "Светлый фон", bg: "from-sky-100 to-blue-50" },
  { key: "mix", label: "Микс городов", emoji: "🌍", desc: "Все три города", bg: "from-violet-800 to-indigo-900" },
  ...CITIES.map(c => ({
    key: c.key as ThemeKey,
    label: c.name,
    emoji: c.flag,
    desc: c.musicTitle,
    bg: c.key === "valencia" ? "from-red-800 to-orange-900"
      : c.key === "odessa" ? "from-blue-800 to-cyan-900"
      : "from-green-800 to-emerald-900",
  })),
];

export default function ThemeSwitcher({ onClose }: { onClose: () => void }) {
  const { activeTheme, setActiveTheme } = useCityTheme();

  const handleSelect = (key: ThemeKey) => {
    setActiveTheme(key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold">🎨 Тема оформления</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          {THEMES.map(theme => (
            <button
              key={theme.key}
              onClick={() => handleSelect(theme.key)}
              className={cn(
                "relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95",
                `bg-gradient-to-br ${theme.bg}`,
                activeTheme === theme.key
                  ? "border-primary ring-2 ring-primary/60 scale-105"
                  : "border-white/10"
              )}
            >
              <span className="text-3xl">{theme.emoji}</span>
              <div className="text-center">
                <p className="text-sm font-bold text-white">{theme.label}</p>
                <p className="text-xs text-white/60 line-clamp-1">{theme.desc}</p>
              </div>
              {activeTheme === theme.key && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
