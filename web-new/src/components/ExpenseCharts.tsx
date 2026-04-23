import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart as PieIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from "recharts";

const COLORS = [
  "hsl(215, 80%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 65%, 55%)",
  "hsl(270, 60%, 55%)",
  "hsl(190, 70%, 45%)",
  "hsl(15, 80%, 55%)",
  "hsl(100, 50%, 45%)",
  "hsl(50, 80%, 50%)",
  "hsl(300, 50%, 50%)",
];

interface Props {
  fixedByWash: Record<string, number>;
  defaultsByWash: Record<string, number>;
  defaultsByType: Record<string, number>;
  defaultsByTypeAndWash: Record<string, Record<string, number>>;
  variableByType: Record<string, number>;
  variableByWash: Record<string, number>;
  fixedTotal: number;
  defaultsTotal: number;
  variableTotal: number;
}

export default function ExpenseCharts({
  fixedByWash, defaultsByWash, defaultsByType, defaultsByTypeAndWash,
  variableByType, variableByWash,
  fixedTotal, defaultsTotal, variableTotal,
}: Props) {
  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: 12,
  };

  const fmt = (v: number) => v.toLocaleString("uk-UA", { maximumFractionDigits: 0 });

  // 1. Expenses by wash (stacked: fixed + planned + actual)
  const byWashData = useMemo(() => {
    const washes = new Set([
      ...Object.keys(fixedByWash),
      ...Object.keys(defaultsByWash),
      ...Object.keys(variableByWash),
    ]);
    return Array.from(washes).map(wash => ({
      name: wash,
      "Мийник": fixedByWash[wash] || 0,
      "Планові": defaultsByWash[wash] || 0,
      "Фактичні": variableByWash[wash] || 0,
    }));
  }, [fixedByWash, defaultsByWash, variableByWash]);

  // 2. Expenses by category (pie chart)
  const byCategoryData = useMemo(() => {
    const items: { name: string; value: number }[] = [];
    if (fixedTotal > 0) items.push({ name: "Мийник", value: fixedTotal });
    Object.entries(defaultsByType).forEach(([type, amt]) => {
      if (amt > 0) items.push({ name: `${type} (план)`, value: amt });
    });
    Object.entries(variableByType).forEach(([type, amt]) => {
      if (amt > 0) items.push({ name: `${type} (факт)`, value: amt });
    });
    return items.sort((a, b) => b.value - a.value);
  }, [fixedTotal, defaultsByType, variableByType]);

  // 3. Detailed: each category by wash
  const categoryByWashData = useMemo(() => {
    const washes = new Set([
      ...Object.keys(fixedByWash),
      ...Object.keys(defaultsByWash),
      ...Object.keys(variableByWash),
    ]);
    const washList = Array.from(washes);

    const categories: { name: string; data: Record<string, number> }[] = [];

    // Fixed
    if (fixedTotal > 0) {
      const d: Record<string, number> = {};
      washList.forEach(w => { d[w] = fixedByWash[w] || 0; });
      categories.push({ name: "Мийник", data: d });
    }

    // Planned by type
    Object.entries(defaultsByTypeAndWash).forEach(([type, washAmts]) => {
      const d: Record<string, number> = {};
      washList.forEach(w => { d[w] = washAmts[w] || 0; });
      if (Object.values(d).some(v => v > 0)) {
        categories.push({ name: `${type} (план)`, data: d });
      }
    });

    return { categories, washList };
  }, [fixedByWash, fixedTotal, defaultsByTypeAndWash, defaultsByWash, variableByWash]);

  const totalExpenses = fixedTotal + defaultsTotal + variableTotal;
  if (totalExpenses === 0) return null;

  return (
    <div className="space-y-6">
      {/* Expenses by wash - stacked bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PieIcon className="h-4 w-4 text-primary" />
            Витрати по об'єктах
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWashData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [`${fmt(value)} ₴`, name]}
                />
                <Legend />
                <Bar dataKey="Мийник" stackId="a" fill={COLORS[0]} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Планові" stackId="a" fill={COLORS[1]} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Фактичні" stackId="a" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Expenses by category - pie chart */}
      {byCategoryData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-4 w-4 text-primary" />
              Структура витрат за статтями
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {byCategoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${fmt(value)} ₴`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed: category breakdown by wash */}
      {categoryByWashData.categories.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-4 w-4 text-primary" />
              Витрати за статтями по об'єктах
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryByWashData.categories.map(c => ({
                    name: c.name,
                    ...c.data,
                  }))}
                  margin={{ top: 5, right: 20, bottom: 40, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="name"
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    height={60}
                  />
                  <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [`${fmt(value)} ₴`, name]}
                  />
                  <Legend />
                  {categoryByWashData.washList.map((wash, i) => (
                    <Bar key={wash} dataKey={wash} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
