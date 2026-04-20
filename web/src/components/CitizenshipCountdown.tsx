import { useState, useEffect } from "react";
import { ChevronRight, X } from "lucide-react";
import prisyagaImg from "@/assets/prisyaga.jpg";

const TARGET_DATE = new Date("2027-02-27T00:00:00");
const CACHE_KEY = "eur_ron_rate";
const CACHE_DATE_KEY = "eur_ron_rate_date";

function getDaysLeft(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = TARGET_DATE.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function fetchEurRon(): Promise<number | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    if (cached && cachedDate === today) return parseFloat(cached);

    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=RON");
    const data = await res.json();
    const rate = data?.rates?.RON as number;
    if (rate) {
      localStorage.setItem(CACHE_KEY, String(rate));
      localStorage.setItem(CACHE_DATE_KEY, today);
      return rate;
    }
  } catch {}
  return null;
}

interface Props {
  onClick: () => void;
}

function PrisyagaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
      >
        <X className="h-5 w-5 text-white" />
      </button>
      <img
        src={prisyagaImg}
        alt="Присяга Румынии"
        className="max-w-full max-h-full w-full h-full object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

export function CitizenshipCountdown({ onClick }: Props) {
  const [days, setDays] = useState(getDaysLeft());
  const [rate, setRate] = useState<number | null>(null);
  const [prisyagaOpen, setPrisyagaOpen] = useState(false);

  useEffect(() => {
    setDays(getDaysLeft());
    fetchEurRon().then(setRate);
  }, []);

  return (
    <>
      <PrisyagaModal open={prisyagaOpen} onClose={() => setPrisyagaOpen(false)} />
      <div className="flex items-center gap-1 text-white/55 mt-0.5">
        <span className="text-xs">🇷🇴</span>
        <span className="text-xs">
          До{" "}
          <button
            onClick={e => { e.stopPropagation(); setPrisyagaOpen(true); }}
            className="underline decoration-dotted underline-offset-2 hover:text-white/90 transition-colors"
          >
            присяги
          </button>
          :{" "}
          <button
            onClick={onClick}
            className="font-semibold text-white/70 hover:text-white/90 transition-colors"
          >
            {days} дн
          </button>
          {rate !== null && (
            <> · 1€ = <span className="font-semibold text-white/70">{rate.toFixed(2)} RON</span></>
          )}
        </span>
        <button onClick={onClick} className="group">
          <ChevronRight className="h-2.5 w-2.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </>
  );
}
