import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCityTheme, CityKey } from "@/context/CityThemeContext";

interface WeatherDay {
  date: string;
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
  precipitation: number;
  windSpeed: number;
  windDir: number;
}

interface CurrentWeather {
  temp: number;
  weatherCode: number;
  windSpeed: number;
}

function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

function weatherDesc(code: number): string {
  if (code === 0) return "Ясно";
  if (code <= 2) return "Переменная облачность";
  if (code === 3) return "Пасмурно";
  if (code <= 45) return "Туман";
  if (code <= 49) return "Изморозь";
  if (code <= 57) return "Морось";
  if (code <= 67) return "Дождь";
  if (code <= 77) return "Снег";
  if (code <= 82) return "Ливень";
  if (code <= 86) return "Снегопад";
  if (code <= 99) return "Гроза";
  return "Неизвестно";
}

function windDirLabel(deg: number): string {
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  return dirs[Math.round(deg / 45) % 8];
}

const DAY_NAMES: Record<number, string> = { 0: "Вс", 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб" };
const MONTH_SHORT: Record<number, string> = {
  0: "янв", 1: "фев", 2: "мар", 3: "апр", 4: "май", 5: "июн",
  6: "июл", 7: "авг", 8: "сен", 9: "окт", 10: "ноя", 11: "дек"
};

export const CITY_WEATHER = [
  { name: "Valencia", flag: "🇪🇸", lat: 39.4699, lon: -0.3763, tz: "Europe/Madrid", key: "valencia" as CityKey },
  { name: "Одесса", flag: "🇺🇦", lat: 46.4825, lon: 30.7233, tz: "Europe/Kyiv", key: "odessa" as CityKey },
  { name: "Heidelberg", flag: "🇩🇪", lat: 49.4093, lon: 8.6942, tz: "Europe/Berlin", key: "heidelberg" as CityKey },
];

export default function WeatherWidget({ onOpenForecast }: { onOpenForecast: () => void }) {
  const [weathers, setWeathers] = useState<(CurrentWeather | null)[]>([null, null, null]);
  const [isLoading, setIsLoading] = useState(true);
  const { activeTheme, setActiveTheme, activeCity, isMuted, toggleMute } = useCityTheme();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const results = await Promise.all(
          CITY_WEATHER.map(city =>
            window.fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weathercode,windspeed_10m&timezone=${encodeURIComponent(city.tz)}`
            ).then(r => r.json())
          )
        );
        setWeathers(results.map(data => ({
          temp: Math.round(data.current.temperature_2m),
          weatherCode: data.current.weathercode,
          windSpeed: Math.round(data.current.windspeed_10m),
        })));
      } catch {}
      setIsLoading(false);
    };
    fetchAll();
  }, []);

  if (isLoading) return <div className="text-white/60 text-xs mt-1">Загрузка погоды...</div>;

  return (
    <div className="mt-1 space-y-0.5">
      {CITY_WEATHER.map((city, i) => {
        const w = weathers[i];
        if (!w) return null;
        const isActive = activeCity === city.key;
        return (
          <div key={city.name} className="flex items-center gap-1">
            {/* Flag + city name → toggle city theme */}
            <button
              onClick={() => setActiveTheme(city.key)}
              className={cn(
                "flex items-center gap-1 transition-all rounded px-1 py-0.5",
                isActive
                  ? "bg-white/25 text-white"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
              title={`Тема: ${city.name}`}
            >
              <span className="text-sm leading-none">{city.flag}</span>
              <span className="text-xs w-[4.5rem] text-left">{city.name}</span>
            </button>

            {/* Weather icon + temp → open forecast modal */}
            <button
              onClick={onOpenForecast}
              className="flex items-center gap-1 text-white/90 hover:text-white transition-colors"
              title="Прогноз погоды"
            >
              <span className="text-sm leading-none">{weatherIcon(w.weatherCode)}</span>
              <span className="text-sm font-semibold">{w.temp}°</span>
              <span className="text-xs text-white/60 hidden sm:inline">💨{w.windSpeed}</span>
            </button>

            {/* Mute toggle (only for active city) */}
            {isActive && (
              <button
                onClick={toggleMute}
                className="ml-0.5 p-0.5 rounded text-white/70 hover:text-white transition"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WeatherForecastModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [daysByCity, setDaysByCity] = useState<WeatherDay[][]>([[], [], []]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCity, setActiveCity] = useState(0);
  const [seaTemp, setSeaTemp] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const doFetch = async () => {
      setIsLoading(true);
      try {
        const results = await Promise.all(
          CITY_WEATHER.map(city =>
            window.fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant&timezone=${encodeURIComponent(city.tz)}&forecast_days=10`
            ).then(r => r.json())
          )
        );
        const seaRes = await window.fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=39.4639&longitude=-0.3362&daily=temperature_2m_max&timezone=Europe%2FMadrid&forecast_days=1"
        );
        const sData = await seaRes.json();
        setSeaTemp(Math.round(sData.daily.temperature_2m_max[0]) - 4);

        setDaysByCity(results.map(wData =>
          wData.daily.time.map((date: string, i: number) => ({
            date,
            maxTemp: Math.round(wData.daily.temperature_2m_max[i]),
            minTemp: Math.round(wData.daily.temperature_2m_min[i]),
            weatherCode: wData.daily.weathercode[i],
            precipitation: wData.daily.precipitation_sum[i] || 0,
            windSpeed: Math.round(wData.daily.windspeed_10m_max[i]),
            windDir: wData.daily.winddirection_10m_dominant[i],
          }))
        ));
      } catch {}
      setIsLoading(false);
    };
    doFetch();
  }, [open]);

  if (!open) return null;

  const days = daysByCity[activeCity] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">🌤 Прогноз погоды</h2>
            {activeCity === 0 && <p className="text-xs text-muted-foreground">Валенсия · пляжи Малварроса, Аррен</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>

        <div className="flex border-b">
          {CITY_WEATHER.map((city, i) => (
            <button
              key={city.name}
              onClick={() => setActiveCity(i)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeCity === i ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {city.flag} {city.name}
            </button>
          ))}
        </div>

        {activeCity === 0 && seaTemp !== null && (
          <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border p-3 bg-blue-50 border-blue-200">
            <span className="text-2xl">🌊</span>
            <div>
              <p className="text-sm font-semibold text-blue-800">Температура моря сегодня</p>
              <p className="text-xl font-bold text-blue-700">~{seaTemp}°C</p>
              <p className="text-xs text-blue-500">Городские пляжи Валенсии</p>
            </div>
          </div>
        )}

        <div className="p-5">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Загрузка прогноза...</p>
          ) : (
            <div className="space-y-2">
              {days.map((day, i) => {
                const d = new Date(day.date + "T12:00:00");
                const dayName = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : DAY_NAMES[d.getDay()];
                const dateStr = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
                return (
                  <div key={day.date} className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 border",
                    i === 0 ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-transparent"
                  )}>
                    <div className="w-20 shrink-0">
                      <p className="text-sm font-semibold">{dayName}</p>
                      <p className="text-xs text-muted-foreground">{dateStr}</p>
                    </div>
                    <span className="text-2xl">{weatherIcon(day.weatherCode)}</span>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{weatherDesc(day.weatherCode)}</p>
                      {day.precipitation > 0 && (
                        <p className="text-xs text-blue-600">🌧 {day.precipitation.toFixed(1)} мм</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{day.maxTemp}° <span className="font-normal text-muted-foreground">{day.minTemp}°</span></p>
                      <p className="text-xs text-muted-foreground">💨 {day.windSpeed} км/ч {windDirLabel(day.windDir)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
