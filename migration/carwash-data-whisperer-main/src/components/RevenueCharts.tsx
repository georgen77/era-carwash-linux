import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { WashReport } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { differenceInCalendarDays } from "date-fns";

const WASH_COLORS = [
  "hsl(215, 80%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 65%, 55%)",
];

interface Props {
  results: WashReport[];
  dateFrom?: string;
  dateTo?: string;
}

export default function RevenueCharts({ results, dateFrom, dateTo }: Props) {
  const validResults = results.filter((r) => !r.error);

  const days = dateFrom && dateTo
    ? differenceInCalendarDays(new Date(dateTo), new Date(dateFrom)) + 1
    : 0;
  const useMonthly = days > 31;

  // Summary bar chart data — one bar per wash
  const summaryData = validResults.map((w) => ({
    name: w.washName,
    revenue: parseFloat(w.totalRow?.[1] || "0"),
  }));

  // Daily or monthly line/bar chart
  const trendData = useMemo(() => {
    if (useMonthly) {
      // Aggregate by month (format: MM.YYYY from daily rows like DD.MM.YYYY)
      const monthMap = new Map<string, Record<string, number>>();
      for (const wash of validResults) {
        for (const row of wash.rows) {
          const day = row[0]; // DD.MM.YYYY
          if (!day) continue;
          const parts = day.split(".");
          const monthKey = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : day;
          if (!monthMap.has(monthKey)) monthMap.set(monthKey, {});
          const entry = monthMap.get(monthKey)!;
          entry[wash.washName] = (entry[wash.washName] || 0) + parseFloat(row[1] || "0");
        }
      }
      return Array.from(monthMap.entries())
        .sort((a, b) => {
          const [ma, ya] = a[0].split(".").map(Number);
          const [mb, yb] = b[0].split(".").map(Number);
          return (ya - yb) || (ma - mb);
        })
        .map(([key, vals]) => ({ day: key, ...vals }));
    } else {
      // Daily
      const dayMap = new Map<string, Record<string, number | string>>();
      for (const wash of validResults) {
        for (const row of wash.rows) {
          const day = row[0];
          if (!day) continue;
          if (!dayMap.has(day)) dayMap.set(day, { day });
          dayMap.get(day)![wash.washName] = parseFloat(row[1] || "0");
        }
      }
      return Array.from(dayMap.values()).sort((a, b) => {
        const parseDay = (d: string) => {
          const parts = String(d).split(".");
          if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
          return new Date(String(d)).getTime();
        };
        return parseDay(String(a.day)) - parseDay(String(b.day));
      });
    }
  }, [validResults, useMonthly]);

  if (!validResults.length) return null;

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: 12,
  };

  return (
    <div className="space-y-6">
      {/* Total revenue comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Виручка по об'єктах
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summaryData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(value: number) => [`${value.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴`, "Виручка"]}
                />
                <Bar dataKey="revenue" fill="hsl(215, 80%, 50%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Daily/Monthly revenue trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              {useMonthly ? "Виручка по місяцях" : "Щоденна виручка"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {useMonthly ? (
                  <BarChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [`${value.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴`, name]}
                    />
                    <Legend />
                    {validResults.map((w, i) => (
                      <Bar key={w.washName} dataKey={w.washName} fill={WASH_COLORS[i % WASH_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [`${value.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴`, name]}
                    />
                    <Legend />
                    {validResults.map((w, i) => (
                      <Line key={w.washName} type="monotone" dataKey={w.washName}
                        stroke={WASH_COLORS[i % WASH_COLORS.length]} strokeWidth={2}
                        dot={{ r: 3 }} activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
