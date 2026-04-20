import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react";
import { CITIES, getCityImages, useCityTheme, CityKey } from "@/context/CityThemeContext";
import { cn } from "@/lib/utils";

// Preload images eagerly for city theme
function preloadImages(urls: string[]) {
  urls.forEach(url => {
    const img = new window.Image();
    img.src = url;
  });
}

// Mix: first 3 images from each city (9 total)
const MIX_IMAGES = CITIES.flatMap(c => getCityImages(c.key).slice(0, 3));

export default function CityCarouselOverlay() {
  const { activeCity, activeTheme, setActiveTheme, isMuted, toggleMute } = useCityTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState<Set<number>>(new Set([0]));

  const isMix = activeTheme === "mix";
  const images = isMix ? MIX_IMAGES : (activeCity ? getCityImages(activeCity) : []);
  const cityConfig = CITIES.find(c => c.key === activeCity);

  // Preload all city images when theme activates
  useEffect(() => {
    if (images.length > 0) {
      preloadImages(images);
    }
    setCurrentSlide(0);
    setImagesLoaded(new Set([0]));
  }, [activeTheme]);

  useEffect(() => {
    if (!images.length) return;
    const t = setInterval(() => {
      setCurrentSlide(i => {
        const next = (i + 1) % images.length;
        setImagesLoaded(prev => new Set([...prev, next]));
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [images.length, activeTheme]);

  const prev = useCallback(() => {
    setCurrentSlide(i => {
      const p = (i - 1 + images.length) % images.length;
      setImagesLoaded(prev => new Set([...prev, p]));
      return p;
    });
  }, [images.length]);

  const next = useCallback(() => {
    setCurrentSlide(i => {
      const n = (i + 1) % images.length;
      setImagesLoaded(prev => new Set([...prev, n]));
      return n;
    });
  }, [images.length]);

  if (!isMix && !activeCity) return null;

  const musicTitle = isMix ? "🌍 Микс городов" : cityConfig?.musicTitle || "";

  return (
    <>
      {/* Background carousel — behind everything */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {images.map((src, i) => (
          <img
            key={`${activeTheme}-${i}`}
            src={imagesLoaded.has(i) ? src : ""}
            data-src={src}
            alt=""
            loading={i < 2 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all duration-[2000ms] ease-in-out",
              i === currentSlide ? "opacity-100 scale-100" : "opacity-0 scale-[1.03]"
            )}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ))}
        {/* Overlay for text readability — semi-transparent dark */}
        <div className="absolute inset-0 bg-black/60" />
        {/* Extra gradient at bottom for content area */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40" />
      </div>

      {/* Controls — bottom right, interactive */}
      <div className="fixed bottom-24 right-3 z-50 flex flex-col items-end gap-1.5 pointer-events-auto">
        {/* Slide dots */}
        <div className="flex gap-1 flex-wrap justify-end max-w-[120px]">
          {images.slice(0, 10).map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrentSlide(i); setImagesLoaded(p => new Set([...p, i])); }}
              className={cn("h-1.5 rounded-full transition-all", i === currentSlide ? "bg-white w-4" : "bg-white/40 w-1.5")}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={next} className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleMute} className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition">
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setActiveTheme("dark")} className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="text-white/50 text-[10px] px-1 max-w-[140px] text-right leading-tight">🎵 {musicTitle}</span>
      </div>
    </>
  );
}
