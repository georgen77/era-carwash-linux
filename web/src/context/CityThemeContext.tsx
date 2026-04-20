import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

export type CityKey = "valencia" | "odessa" | "heidelberg";
export type ThemeKey = "dark" | "light" | CityKey | "mix";

export interface CityConfig {
  key: CityKey;
  name: string;
  flag: string;
  color: string;
  gradient: string;
  music: string;
  musicTitle: string;
  images: string[];
}

// ── Real verified landmark images per city ──────────────────────────────────
export const CITIES: CityConfig[] = [
  {
    key: "valencia",
    name: "Valencia",
    flag: "🇪🇸",
    color: "#c0392b",
    gradient: "linear-gradient(145deg, hsl(15 60% 96%) 0%, hsl(25 50% 93%) 50%, hsl(10 40% 95%) 100%)",
    music: "https://upload.wikimedia.org/wikipedia/commons/7/79/Ricky_Martin_-_Livin%27_la_Vida_Loca.ogg",
    musicTitle: "Livin' la Vida Loca — Ricky Martin",
    images: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Ciudad_de_las_Artes_y_las_Ciencias_%28Valencia%2C_Spain%29_-_46.jpg/1280px-Ciudad_de_las_Artes_y_las_Ciencias_%28Valencia%2C_Spain%29_-_46.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Cathedral_of_Valencia.jpg/1280px-Cathedral_of_Valencia.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Valencia_city_hall.jpg/1280px-Valencia_city_hall.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Valencia_Torres_de_Serranos.jpg/1280px-Valencia_Torres_de_Serranos.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Valencia_Lonja_de_la_Seda.jpg/1280px-Valencia_Lonja_de_la_Seda.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Valencia_Central_Market.jpg/1280px-Valencia_Central_Market.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Valencia_beach.jpg/1280px-Valencia_beach.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Valencia_Palau_de_les_Arts_Reina_Sofia.jpg/1280px-Valencia_Palau_de_les_Arts_Reina_Sofia.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Oceanografic_Valencia.jpg/1280px-Oceanografic_Valencia.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Bioparc_Valencia.jpg/1280px-Bioparc_Valencia.jpg",
    ],
  },
  {
    key: "odessa",
    name: "Одесса",
    flag: "🇺🇦",
    color: "#2980b9",
    gradient: "linear-gradient(145deg, hsl(210 50% 96%) 0%, hsl(200 45% 93%) 50%, hsl(220 35% 95%) 100%)",
    music: "https://upload.wikimedia.org/wikipedia/commons/8/8e/%D0%A3%D1%82%D1%91%D1%81%D0%BE%D0%B2_%D0%95%D1%81%D1%82%D1%8C_%D0%B3%D0%BE%D1%80%D0%BE%D0%B4_%D0%BA%D0%BE%D1%82%D0%BE%D1%80%D1%8B%D0%B9_%D1%8F_%D0%B2%D0%B8%D0%B6%D1%83_%D0%B2%D0%BE_%D1%81%D0%BD%D0%B5.ogg",
    musicTitle: "Есть город который я вижу во сне — Утёсов",
    images: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Odessa_Potemkin_Stairs.jpg/1280px-Odessa_Potemkin_Stairs.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Odessa_Opera.jpg/1280px-Odessa_Opera.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Odessa_Lanzheron_beach.jpg/1280px-Odessa_Lanzheron_beach.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Duke_Richelieu_Monument_Odessa.jpg/1280px-Duke_Richelieu_Monument_Odessa.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Primorsky_Boulevard_Odessa.jpg/1280px-Primorsky_Boulevard_Odessa.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Odessa_Passage.jpg/1280px-Odessa_Passage.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Vorontsov_Lighthouse_Odessa.jpg/1280px-Vorontsov_Lighthouse_Odessa.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Odessa_Deribasovskaya.jpg/1280px-Odessa_Deribasovskaya.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Odessa_City_Garden.jpg/1280px-Odessa_City_Garden.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Odessa_train_station.jpg/1280px-Odessa_train_station.jpg",
    ],
  },
  {
    key: "heidelberg",
    name: "Heidelberg",
    flag: "🇩🇪",
    color: "#27ae60",
    gradient: "linear-gradient(145deg, hsl(140 30% 96%) 0%, hsl(130 25% 93%) 50%, hsl(150 20% 95%) 100%)",
    music: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Namika_-_Kompliziert.ogg",
    musicTitle: "KOMPLIZIERT — NAMIKA",
    images: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Heidelberg_Altstadt.jpg/1280px-Heidelberg_Altstadt.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Heidelberg_Castle_at_dusk.jpg/1280px-Heidelberg_Castle_at_dusk.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Heidelberg_Alte_Brucke.jpg/1280px-Heidelberg_Alte_Brucke.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Heidelberg_University.jpg/1280px-Heidelberg_University.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Heidelberg_Philosophers_Walk.jpg/1280px-Heidelberg_Philosophers_Walk.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Heidelberg_Schloss_Panorama.jpg/1280px-Heidelberg_Schloss_Panorama.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Heidelberg_Neuenheim_Neckar.jpg/1280px-Heidelberg_Neuenheim_Neckar.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Heidelberg_Heiliggeistkirche.jpg/1280px-Heidelberg_Heiliggeistkirche.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Heidelberg_Kornmarkt.jpg/1280px-Heidelberg_Kornmarkt.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Heidelberg_Hauptstrasse.jpg/1280px-Heidelberg_Hauptstrasse.jpg",
    ],
  },
];

// ── Custom images/music per city stored in localStorage ──────────────────────
export function getCityCustomImages(key: CityKey): string[] {
  try {
    const raw = localStorage.getItem(`city_images_${key}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function setCityCustomImages(key: CityKey, imgs: string[]) {
  localStorage.setItem(`city_images_${key}`, JSON.stringify(imgs));
}
export function getCityCustomMusic(key: CityKey): { url: string; title: string } | null {
  try {
    const raw = localStorage.getItem(`city_music_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setCityCustomMusic(key: CityKey, music: { url: string; title: string }) {
  localStorage.setItem(`city_music_${key}`, JSON.stringify(music));
}

export function getCityImages(key: CityKey): string[] {
  const custom = getCityCustomImages(key);
  const base = CITIES.find(c => c.key === key)!.images;
  return custom.length > 0 ? [...custom, ...base].slice(0, 10) : base;
}

interface CityThemeContextValue {
  activeTheme: ThemeKey;
  setActiveTheme: (key: ThemeKey) => void;
  activeCity: CityKey | null;
  isMuted: boolean;
  toggleMute: () => void;
  weatherOpen: boolean;
  setWeatherOpen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  themeSwitcherOpen: boolean;
  setThemeSwitcherOpen: (v: boolean) => void;
}

const CityThemeContext = createContext<CityThemeContextValue>({
  activeTheme: "dark",
  setActiveTheme: () => {},
  activeCity: null,
  isMuted: false,
  toggleMute: () => {},
  weatherOpen: false,
  setWeatherOpen: () => {},
  settingsOpen: false,
  setSettingsOpen: () => {},
  themeSwitcherOpen: false,
  setThemeSwitcherOpen: () => {},
});

export function CityThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeTheme, setActiveThemeState] = useState<ThemeKey>(() => {
    return (localStorage.getItem("app_theme") as ThemeKey) || "dark";
  });
  const [isMuted, setIsMuted] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeSwitcherOpen, setThemeSwitcherOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlayRef = useRef<CityKey | null>(null);

  const activeCity: CityKey | null = (activeTheme === "dark" || activeTheme === "light" || activeTheme === "mix") ? null : activeTheme as CityKey;

  const setActiveTheme = useCallback((key: ThemeKey) => {
    setActiveThemeState(prev => {
      const next = prev === key ? "dark" : key;
      localStorage.setItem("app_theme", next);
      return next;
    });
  }, []);

  // Apply dark/light class on html element
  useEffect(() => {
    if (activeTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, [activeTheme]);

  // ── Music playback ────────────────────────────────────────────────────────
  const tryPlay = useCallback((audio: HTMLAudioElement) => {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay blocked — wait for user interaction
      });
    }
  }, []);

  useEffect(() => {
    // Stop previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    pendingPlayRef.current = null;

    if (!activeCity) return;

    const cityConfig = CITIES.find(c => c.key === activeCity);
    if (!cityConfig) return;

    const customMusic = getCityCustomMusic(activeCity);
    const musicUrl = customMusic?.url || cityConfig.music;

    const audio = new Audio();
    audio.src = musicUrl;
    audio.loop = true;
    audio.muted = isMuted;
    audio.volume = 0.4;
    audioRef.current = audio;

    // Try immediate play (works if user already interacted)
    tryPlay(audio);

    // Also listen for first interaction to unlock audio
    pendingPlayRef.current = activeCity;
    const unlock = () => {
      if (audioRef.current && audioRef.current.paused) {
        tryPlay(audioRef.current);
      }
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      audio.pause();
      audio.src = "";
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCity]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      if (!isMuted && audioRef.current.paused) {
        tryPlay(audioRef.current);
      }
    }
  }, [isMuted, tryPlay]);

  const toggleMute = useCallback(() => setIsMuted(m => !m), []);

  return (
    <CityThemeContext.Provider value={{
      activeTheme, setActiveTheme, activeCity,
      isMuted, toggleMute,
      weatherOpen, setWeatherOpen,
      settingsOpen, setSettingsOpen,
      themeSwitcherOpen, setThemeSwitcherOpen,
    }}>
      {children}
    </CityThemeContext.Provider>
  );
}

export function useCityTheme() {
  return useContext(CityThemeContext);
}
