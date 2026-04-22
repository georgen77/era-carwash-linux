import { useState } from "react";
import {
  type CurrencyCode,
  CURRENCY_ORDER,
  CURRENCY_SYMBOLS,
  useCurrencyRates,
  convertFromUAH,
  formatCurrency,
  getRateLabel,
} from "@/hooks/useCurrencyRates";
import { Bitcoin, CircleDollarSign, Euro, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const CURRENCY_ICONS: Record<CurrencyCode, React.ReactNode> = {
  UAH: <Coins className="h-3.5 w-3.5 text-yellow-500" />,
  EUR: <Euro className="h-3.5 w-3.5 text-blue-500" />,
  USD: <CircleDollarSign className="h-3.5 w-3.5 text-green-500" />,
  XAU: <span className="font-bold text-amber-400" style={{ fontSize: '9px', lineHeight: 1, letterSpacing: '-0.02em' }}>Au</span>,
  BTC: <Bitcoin className="h-3.5 w-3.5 text-orange-500" />,
};

export interface CurrencyContextValue {
  currency: CurrencyCode;
  cycle: () => void;
  convert: (uah: number) => number;
  symbol: string;
  icon: React.ReactNode;
  rateLabel: string;
  rates: ReturnType<typeof useCurrencyRates>["data"];
}

export function useCurrencyState(): CurrencyContextValue {
  const [idx, setIdx] = useState(0);
  const { data: rates } = useCurrencyRates();
  const currency = CURRENCY_ORDER[idx];

  return {
    currency,
    cycle: () => setIdx((i) => (i + 1) % CURRENCY_ORDER.length),
    convert: (uah: number) => convertFromUAH(uah, currency, rates),
    symbol: CURRENCY_SYMBOLS[currency],
    icon: CURRENCY_ICONS[currency],
    rateLabel: getRateLabel(currency, rates),
    rates,
  };
}

/** Small clickable rate badge */
export function CurrencyRateBadge({
  currency,
  rateLabel,
  icon,
  onCycle,
  className,
}: {
  currency: CurrencyCode;
  rateLabel: string;
  icon: React.ReactNode;
  onCycle: () => void;
  className?: string;
}) {
  if (currency === "UAH") {
    return (
      <button
        onClick={onCycle}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer select-none",
          className
        )}
      >
        {icon}
        <span>₴ UAH</span>
      </button>
    );
  }
  return (
    <button
      onClick={onCycle}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer select-none",
        className
      )}
    >
      {icon}
      <span>{rateLabel}</span>
    </button>
  );
}

/** Format and display an amount with currency symbol + icon */
export function MoneyDisplay({
  amountUAH,
  convert,
  currency,
  symbol,
  icon,
  className,
  size = "2xl",
}: {
  amountUAH: number;
  convert: (n: number) => number;
  currency: CurrencyCode;
  symbol: string;
  icon: React.ReactNode;
  className?: string;
  size?: "2xl" | "xl" | "lg";
}) {
  const converted = convert(amountUAH);
  const formatted = formatCurrency(converted, currency);
  const sizeClass = size === "2xl" ? "text-2xl" : size === "xl" ? "text-xl" : "text-lg";

  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      <span className={cn(sizeClass, "font-bold tabular-nums")}>{formatted}</span>
      <span className="flex items-center gap-0.5 text-sm text-muted-foreground">
        {symbol} {icon}
      </span>
    </div>
  );
}
