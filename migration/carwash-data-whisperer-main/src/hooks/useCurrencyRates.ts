import { useQuery } from "@tanstack/react-query";

export type CurrencyCode = "UAH" | "EUR" | "USD" | "XAU" | "BTC";

export const CURRENCY_ORDER: CurrencyCode[] = ["UAH", "EUR", "USD", "XAU", "BTC"];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  UAH: "₴",
  EUR: "€",
  USD: "$",
  XAU: "oz",
  BTC: "₿",
};

export interface Rates {
  EUR_UAH: number;
  USD_UAH: number;
  XAU_UAH: number;
  BTC_UAH: number;
}

async function fetchRates(): Promise<Rates> {
  // Fetch USD/UAH and EUR/UAH from exchangerate API
  const [erRes, btcRes] = await Promise.all([
    fetch("https://open.er-api.com/v6/latest/USD"),
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"),
  ]);

  const erData = await erRes.json();
  const btcData = await btcRes.json();

  const usdToUah = erData.rates?.UAH ?? 41.5;
  const usdToEur = erData.rates?.EUR ?? 0.92;
  const eurToUah = usdToUah / usdToEur;

  // Gold price per troy ounce in USD (fallback)
  let xauUsd = 2650;
  try {
    const goldRes = await fetch("https://api.metalpriceapi.com/v1/latest?api_key=demo&base=XAU&currencies=USD");
    const goldData = await goldRes.json();
    if (goldData.rates?.USD) xauUsd = goldData.rates.USD;
  } catch {
    // Use a reasonable fallback, or try another source
    try {
      const gRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
      const gData = await gRes.json();
      if (gData.items?.[0]?.xauPrice) xauUsd = gData.items[0].xauPrice;
    } catch {
      // keep fallback
    }
  }

  const btcUsd = btcData.bitcoin?.usd ?? 95000;

  return {
    EUR_UAH: eurToUah,
    USD_UAH: usdToUah,
    XAU_UAH: xauUsd * usdToUah,
    BTC_UAH: btcUsd * usdToUah,
  };
}

export function useCurrencyRates() {
  return useQuery({
    queryKey: ["currency-rates"],
    queryFn: fetchRates,
    staleTime: 1000 * 60 * 30, // 30 min
    refetchInterval: 1000 * 60 * 30,
  });
}

/** Convert UAH amount to target currency */
export function convertFromUAH(amountUAH: number, currency: CurrencyCode, rates: Rates | undefined): number {
  if (!rates || currency === "UAH") return amountUAH;
  switch (currency) {
    case "EUR": return amountUAH / rates.EUR_UAH;
    case "USD": return amountUAH / rates.USD_UAH;
    case "XAU": return amountUAH / rates.XAU_UAH;
    case "BTC": return amountUAH / rates.BTC_UAH;
    default: return amountUAH;
  }
}

/** Format amount for display */
export function formatCurrency(amount: number, currency: CurrencyCode): string {
  if (currency === "BTC") return amount.toFixed(6);
  if (currency === "XAU") return amount.toFixed(4);
  return amount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Get rate label for display (e.g. "€1 = 45.20₴") */
export function getRateLabel(currency: CurrencyCode, rates: Rates | undefined): string {
  if (!rates || currency === "UAH") return "";
  switch (currency) {
    case "EUR": return `€1 = ${rates.EUR_UAH.toFixed(2)}₴`;
    case "USD": return `$1 = ${rates.USD_UAH.toFixed(2)}₴`;
    case "XAU": return `1oz = ${rates.XAU_UAH.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}₴`;
    case "BTC": return `₿1 = ${rates.BTC_UAH.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}₴`;
    default: return "";
  }
}
