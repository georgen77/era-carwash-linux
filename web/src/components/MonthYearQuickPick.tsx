import { useState } from "react";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { uk } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MONTHS_SHORT = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2024, i, 1);
  return d.toLocaleString("uk-UA", { month: "short" });
});

interface Props {
  onSelectRange: (from: Date, to: Date) => void;
}

export default function MonthYearQuickPick({ onSelectRange }: Props) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [yearForMonths, setYearForMonths] = useState(currentYear);

  const toggleMonth = (key: string) => {
    const next = new Set(selectedMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedMonths(next);

    if (next.size > 0) {
      const parsed = [...next].map(k => {
        const [y, m] = k.split("-").map(Number);
        return { y, m };
      });
      parsed.sort((a, b) => a.y - b.y || a.m - b.m);
      const from = startOfMonth(new Date(parsed[0].y, parsed[0].m));
      const to = endOfMonth(new Date(parsed[parsed.length - 1].y, parsed[parsed.length - 1].m));
      onSelectRange(from, to);
    }
  };

  const toggleYear = (year: number) => {
    const next = new Set(selectedYears);
    if (next.has(year)) next.delete(year);
    else next.add(year);
    setSelectedYears(next);

    if (next.size > 0) {
      const sorted = [...next].sort();
      const from = startOfYear(new Date(sorted[0], 0, 1));
      const to = endOfYear(new Date(sorted[sorted.length - 1], 0, 1));
      onSelectRange(from, to);
    }
  };

  return (
    <div className="border-t p-3 space-y-2">
      <Tabs defaultValue="months" className="w-full">
        <TabsList className="w-full h-7">
          <TabsTrigger value="months" className="text-xs flex-1 h-5">Місяці</TabsTrigger>
          <TabsTrigger value="years" className="text-xs flex-1 h-5">Роки</TabsTrigger>
        </TabsList>

        <TabsContent value="months" className="mt-2 space-y-2">
          {/* Year selector for months */}
          <div className="flex items-center justify-center gap-1">
            {years.slice(0, 3).map(y => (
              <Button
                key={y}
                variant={yearForMonths === y ? "default" : "ghost"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => { setYearForMonths(y); setSelectedMonths(new Set()); }}
              >
                {y}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTHS_SHORT.map((label, i) => {
              const key = `${yearForMonths}-${i}`;
              const isSelected = selectedMonths.has(key);
              const isFuture = yearForMonths === currentYear && i > new Date().getMonth();
              return (
                <Button
                  key={key}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-1 capitalize"
                  disabled={isFuture}
                  onClick={() => toggleMonth(key)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="years" className="mt-2">
          <div className="grid grid-cols-3 gap-1">
            {years.map(y => {
              const isSelected = selectedYears.has(y);
              const isFuture = y > currentYear;
              return (
                <Button
                  key={y}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isFuture}
                  onClick={() => toggleYear(y)}
                >
                  {y}
                </Button>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
