import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cloud, CloudRain, CloudSnow, Sun, Wind, Droplets, CloudSun } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, subDays } from "date-fns";
import { uk } from "date-fns/locale";

// Locations mapped to wash names
const WASH_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  'Усатово': { lat: 46.53, lon: 30.65, label: 'Nerubajske' },
  'Корсунцы': { lat: 46.58, lon: 30.62, label: 'Korsunzi' },
  'Левитана': { lat: 46.47, lon: 30.73, label: 'Odessa' },
};

interface DayWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  windMax: number;
  code: number;
}

interface WeatherData {
  current: { temp: number; precip: number; wind: number; code: number };
  days: DayWeather[];
}

interface HistoricalDayWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  precip: number;
  windMax: number;
  code: number;
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&timezone=Europe/Kiev&forecast_days=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const d = await res.json();
  return {
    current: {
      temp: Math.round(d.current.temperature_2m),
      precip: d.current.precipitation,
      wind: Math.round(d.current.wind_speed_10m),
      code: d.current.weather_code,
    },
    days: d.daily.time.map((date: string, i: number) => ({
      date,
      tempMax: Math.round(d.daily.temperature_2m_max[i]),
      tempMin: Math.round(d.daily.temperature_2m_min[i]),
      precip: d.daily.precipitation_sum[i],
      windMax: Math.round(d.daily.wind_speed_10m_max[i]),
      code: d.daily.weather_code[i],
    })),
  };
}

async function fetchHistoricalWeather(lat: number, lon: number, dateFrom: string, dateTo: string): Promise<HistoricalDayWeather[]> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateFrom}&end_date=${dateTo}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,weather_code&timezone=Europe/Kiev`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Historical weather fetch failed');
  const d = await res.json();
  if (!d.daily?.time) return [];
  return d.daily.time.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(d.daily.temperature_2m_max[i]),
    tempMin: Math.round(d.daily.temperature_2m_min[i]),
    tempMean: Math.round(d.daily.temperature_2m_mean[i]),
    precip: d.daily.precipitation_sum[i] ?? 0,
    windMax: Math.round(d.daily.wind_speed_10m_max[i]),
    code: d.daily.weather_code[i] ?? 0,
  }));
}

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const c = className || "h-3 w-3";
  if (code <= 1) return <Sun className={c} />;
  if (code <= 3) return <CloudSun className={c} />;
  if (code >= 71) return <CloudSnow className={c} />;
  if (code >= 51) return <CloudRain className={c} />;
  return <Cloud className={c} />;
}

function WeatherLabel({ code }: { code: number }) {
  if (code <= 1) return <span className="flex items-center gap-0.5"><Sun className="h-2.5 w-2.5 text-amber-500" /><span className="text-amber-500">Ясно</span></span>;
  if (code <= 3) return <span className="flex items-center gap-0.5"><CloudSun className="h-2.5 w-2.5 text-blue-700" /><span className="text-blue-700">Хмарно</span></span>;
  if (code >= 71) return <span className="flex items-center gap-0.5"><CloudSnow className="h-2.5 w-2.5 text-blue-700" /><span className="text-blue-700">Сніг</span></span>;
  if (code >= 61) return <span className="flex items-center gap-0.5"><CloudRain className="h-2.5 w-2.5 text-blue-700" /><span className="text-blue-700">Дощ</span></span>;
  if (code >= 51) return <span className="flex items-center gap-0.5"><CloudRain className="h-2.5 w-2.5 text-blue-600" /><span className="text-blue-600">Мряка</span></span>;
  if (code >= 45) return <span className="flex items-center gap-0.5"><Cloud className="h-2.5 w-2.5 text-blue-600" /><span className="text-blue-600">Туман</span></span>;
  return <span className="flex items-center gap-0.5"><Cloud className="h-2.5 w-2.5 text-blue-600" /><span className="text-blue-600">Хмари</span></span>;
}

const DAY_LABELS = ['Сьогодні', 'Завтра', 'Післязавтра'];

function formatDayLabel(dateStr: string, index: number): string {
  if (index < 3) return DAY_LABELS[index];
  const date = new Date(dateStr + 'T00:00:00');
  return format(date, 'EEE, d MMM', { locale: uk });
}

function iconColor(code: number, size = "h-5 w-5"): string {
  if (code >= 51) return `${size} text-blue-600`;
  if (code >= 45) return `${size} text-gray-500`;
  if (code <= 1) return `${size} text-amber-500`;
  return `${size} text-amber-400`;
}

export default function WeatherWidget({
  washName,
  selectedDateFrom,
  selectedDateTo,
}: {
  washName: string;
  selectedDateFrom?: string;
  selectedDateTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'forecast' | 'yesterday' | 'period'>('forecast');
  const coords = WASH_COORDS[washName];

  const { data } = useQuery({
    queryKey: ['weather', washName],
    queryFn: () => fetchWeather(coords!.lat, coords!.lon),
    staleTime: 1000 * 60 * 30,
    enabled: !!coords,
  });

  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const { data: yesterdayData } = useQuery({
    queryKey: ['weather-historical', washName, yesterday],
    queryFn: () => fetchHistoricalWeather(coords!.lat, coords!.lon, yesterday, yesterday),
    staleTime: 1000 * 60 * 60 * 6,
    enabled: !!coords && open && activeTab === 'yesterday',
  });

  // Period historical weather (only for past periods)
  const today = format(new Date(), 'yyyy-MM-dd');
  const periodIsPast = selectedDateFrom && selectedDateTo && selectedDateTo < today;
  const { data: periodData, isLoading: periodLoading } = useQuery({
    queryKey: ['weather-historical', washName, selectedDateFrom, selectedDateTo],
    queryFn: () => fetchHistoricalWeather(coords!.lat, coords!.lon, selectedDateFrom!, selectedDateTo!),
    staleTime: 1000 * 60 * 60 * 6,
    enabled: !!coords && open && activeTab === 'period' && !!periodIsPast,
  });

  if (!coords || !data) return null;

  const todayWeather = data.days[0];

  return (
    <>
      <div
        className="px-3 pb-2.5 pt-1.5 border-t border-border/40 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        {/* Header + Current */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Cloud className="h-2.5 w-2.5" />
            <span className="font-medium">{coords.label}</span>
          </div>
          <span className="text-[9px]"><WeatherLabel code={data.current.code} /></span>
        </div>

        {/* Today — highlighted */}
        <div className="flex items-center gap-2 text-[11px] mb-1 bg-primary/5 rounded-md px-2 py-1">
          <WeatherIcon code={data.current.code} className={`h-4 w-4 ${data.current.code >= 51 ? 'text-blue-600' : data.current.code >= 45 ? 'text-gray-500' : 'text-amber-500'}`} />
          <span className="font-bold text-foreground">{data.current.temp}°</span>
          <span className="text-[9px] text-muted-foreground">{todayWeather.tempMax}°/{todayWeather.tempMin}°</span>
          <span className="flex items-center gap-0.5 text-blue-500">
            <Droplets className="h-2.5 w-2.5" /><span className="text-[10px]">{todayWeather.precip}mm</span>
          </span>
          <span className="flex items-center gap-0.5 text-sky-600">
            <Wind className="h-2.5 w-2.5" /><span className="text-[10px]">{data.current.wind}km/h</span>
          </span>
        </div>

        {/* Forecast: tomorrow + day after */}
        <div className="flex gap-3 text-[9px] text-muted-foreground">
          {data.days.slice(1, 3).map((day, i) => {
            const ic = day.code >= 51 ? "h-3 w-3 text-blue-600" : day.code >= 45 ? "h-3 w-3 text-gray-500" : day.code <= 1 ? "h-3 w-3 text-amber-500" : "h-3 w-3 text-amber-400";
            return (
              <div key={i} className="flex items-center gap-1">
                <WeatherIcon code={day.code} className={ic} />
                <span className="font-medium text-foreground/80">{DAY_LABELS[i + 1]}</span>
                <span className="font-semibold text-foreground">{day.tempMax}°/{day.tempMin}°</span>
                {day.precip > 0 && (
                  <span className="text-blue-500 flex items-center gap-0.5">
                    <Droplets className="h-2 w-2" />{day.precip}mm
                  </span>
                )}
                <span className="flex items-center gap-0.5 text-sky-600">
                  <Wind className="h-2 w-2" />{day.windMax}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extended forecast dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Погода — {coords.label}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b pb-2">
            <button
              onClick={() => setActiveTab('forecast')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'forecast' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Прогноз 10 днів
            </button>
            <button
              onClick={() => setActiveTab('yesterday')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'yesterday' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Вчора
            </button>
            {selectedDateFrom && selectedDateTo && (
              <button
                onClick={() => setActiveTab('period')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'period' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Обраний період
              </button>
            )}
          </div>

          {/* Forecast tab */}
          {activeTab === 'forecast' && (
            <div className="space-y-1.5">
              {data.days.map((day, i) => {
                const isToday = i === 0;
                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isToday ? 'bg-primary/10 font-semibold' : 'hover:bg-accent/50'}`}
                  >
                    <WeatherIcon code={day.code} className={iconColor(day.code)} />
                    <span className="min-w-[110px] text-foreground">{formatDayLabel(day.date, i)}</span>
                    <span className="min-w-[60px] text-foreground font-medium">{day.tempMax}° / {day.tempMin}°</span>
                    <span className="flex items-center gap-0.5 text-blue-500 min-w-[55px]">
                      <Droplets className="h-3.5 w-3.5" />
                      <span>{day.precip}mm</span>
                    </span>
                    <span className="flex items-center gap-0.5 text-sky-600">
                      <Wind className="h-3.5 w-3.5" />
                      <span>{day.windMax}km/h</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Yesterday tab */}
          {activeTab === 'yesterday' && (
            <div>
              {!yesterdayData ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Завантаження...</div>
              ) : yesterdayData.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Дані недоступні</div>
              ) : (
                <div className="space-y-2">
                  {yesterdayData.map(day => (
                    <div key={day.date} className="flex items-center gap-3 rounded-lg bg-accent/30 px-3 py-3 text-sm">
                      <WeatherIcon code={day.code} className={iconColor(day.code)} />
                      <span className="font-medium text-foreground min-w-[100px]">
                        {format(new Date(day.date + 'T00:00:00'), 'EEE, d MMM', { locale: uk })}
                      </span>
                      <span className="font-semibold">
                        ↑{day.tempMax}° ↓{day.tempMin}° ≈{day.tempMean}°
                      </span>
                      <span className="flex items-center gap-0.5 text-blue-500">
                        <Droplets className="h-3.5 w-3.5" />{day.precip}mm
                      </span>
                      <span className="flex items-center gap-0.5 text-sky-600">
                        <Wind className="h-3.5 w-3.5" />{day.windMax}km/h
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Period tab */}
          {activeTab === 'period' && (
            <div>
              {!periodIsPast ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  Архівна погода доступна лише для минулих дат
                </div>
              ) : periodLoading || !periodData ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Завантаження...</div>
              ) : periodData.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Дані недоступні</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground px-3 py-1 border-b">
                    <span className="min-w-[120px]">Дата</span>
                    <span className="min-w-[100px]">Темп.</span>
                    <span className="min-w-[60px]">Опади</span>
                    <span>Вітер</span>
                  </div>
                  {periodData.map(day => (
                    <div key={day.date} className="flex items-center gap-3 rounded px-3 py-1.5 text-sm hover:bg-accent/50">
                      <WeatherIcon code={day.code} className={iconColor(day.code, "h-4 w-4")} />
                      <span className="min-w-[110px] text-foreground">
                        {format(new Date(day.date + 'T00:00:00'), 'EEE, d MMM', { locale: uk })}
                      </span>
                      <span className="min-w-[100px] font-medium">
                        ↑{day.tempMax}° ↓{day.tempMin}° ≈{day.tempMean}°
                      </span>
                      <span className="flex items-center gap-0.5 text-blue-500 min-w-[55px]">
                        <Droplets className="h-3.5 w-3.5" />{day.precip}mm
                      </span>
                      <span className="flex items-center gap-0.5 text-sky-600">
                        <Wind className="h-3.5 w-3.5" />{day.windMax}km/h
                      </span>
                    </div>
                  ))}
                  {/* Summary */}
                  <div className="mt-3 pt-2 border-t flex gap-4 text-xs text-muted-foreground px-3">
                    <span>Ср. темп: <strong className="text-foreground">
                      {Math.round(periodData.reduce((s, d) => s + d.tempMean, 0) / periodData.length)}°
                    </strong></span>
                    <span>Опади: <strong className="text-foreground">
                      {periodData.reduce((s, d) => s + d.precip, 0).toFixed(1)}mm
                    </strong></span>
                    <span>Макс. вітер: <strong className="text-foreground">
                      {Math.max(...periodData.map(d => d.windMax))}km/h
                    </strong></span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
