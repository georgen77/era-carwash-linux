import { useNavigate } from "react-router-dom";
import { Package, ClipboardList, MessageSquare, Settings2, Wallet } from "lucide-react";

const NAV_ITEMS = [
  { icon: <Package className="h-3.5 w-3.5" />, label: "Бельё", path: "/" },
  { icon: <Wallet className="h-3.5 w-3.5" />, label: "Финансы", path: "/cleaning" },
  { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "Задачи", path: "/tasks" },
  { icon: <span className="text-sm">🧹</span>, label: "Уборки", path: "/cleanings" },
  { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Переписка", path: "/telegram-messages" },
  { icon: <span className="text-sm">📊</span>, label: "Статист.", path: "/cleaner-stats" },
  { icon: <Settings2 className="h-3.5 w-3.5" />, label: "Персонал", path: "/cleaner-management" },
  { icon: <span className="text-sm">🧺</span>, label: "Альберт", path: "/albert" },
  { icon: <span className="text-sm">🔑</span>, label: "Замки", path: "/locks" },
];

const PAGE_LABELS: Record<number, string> = {
  0: "📦 Учёт белья",
  1: "💰 Финансы",
  2: "🗂️ Задачи",
  3: "🧹 Уборки",
};

interface HeaderNavGridProps {
  /** 0=Бельё, 1=Финансы, 2=Задачи, 3=Уборки */
  activePage: number;
}

export default function HeaderNavGrid({ activePage }: HeaderNavGridProps) {
  const navigate = useNavigate();

  return (
    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 z-10">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-white/70 text-xs font-medium uppercase tracking-widest">
          {PAGE_LABELS[activePage] ?? ""}
        </p>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 border border-white/30">
          {[0, 1, 2, 3].map(i => (
            <span key={i} className={`rounded-full transition-all ${i === activePage ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"}`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-0.5 py-1 px-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-sm transition-all text-white/70 hover:text-white"
          >
            {item.icon}
            <span className="text-[9px] leading-tight font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
