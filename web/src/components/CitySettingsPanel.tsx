import { useState, useRef } from "react";
import { X, Upload, Music, Trash2, Sparkles, Image as ImageIcon } from "lucide-react";
import { CITIES, CityKey, getCityCustomImages, setCityCustomImages, getCityCustomMusic, setCityCustomMusic, getCityImages } from "@/context/CityThemeContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const AI_SUGGESTED: Record<CityKey, string[]> = {
  valencia: [
    "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1280&q=80",
    "https://images.unsplash.com/photo-1625472603325-7c3b5c4e6c4a?w=1280&q=80",
    "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=1280&q=80",
  ],
  odessa: [
    "https://images.unsplash.com/photo-1520466809213-7b9a56adcd45?w=1280&q=80",
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1280&q=80",
    "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?w=1280&q=80",
  ],
  heidelberg: [
    "https://images.unsplash.com/photo-1548013146-72479768bada?w=1280&q=80",
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1280&q=80",
    "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1280&q=80",
  ],
};

export default function CitySettingsPanel({ onClose }: { onClose: () => void }) {
  const [activeCity, setActiveCity] = useState<CityKey>("valencia");
  const [customImages, setCustomImages] = useState<string[]>(() => getCityCustomImages(activeCity));
  const [customMusic, setCustomMusic] = useState<{ url: string; title: string } | null>(() => getCityCustomMusic(activeCity));
  const [urlInput, setUrlInput] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const cityConfig = CITIES.find(c => c.key === activeCity)!;

  const switchCity = (key: CityKey) => {
    setActiveCity(key);
    setCustomImages(getCityCustomImages(key));
    setCustomMusic(getCityCustomMusic(key));
    setUrlInput("");
  };

  const addImageUrl = () => {
    if (!urlInput.trim()) return;
    const next = [...customImages, urlInput.trim()];
    setCustomImages(next);
    setCityCustomImages(activeCity, next);
    setUrlInput("");
  };

  const removeImage = (idx: number) => {
    const next = customImages.filter((_, i) => i !== idx);
    setCustomImages(next);
    setCityCustomImages(activeCity, next);
  };

  const addSuggested = (url: string) => {
    if (customImages.includes(url)) return;
    const next = [...customImages, url];
    setCustomImages(next);
    setCityCustomImages(activeCity, next);
  };

  const saveMusic = () => {
    if (!musicUrl.trim()) return;
    const music = { url: musicUrl.trim(), title: musicTitle.trim() || "Пользовательская музыка" };
    setCityCustomMusic(activeCity, music);
    setCustomMusic(music);
    setMusicUrl("");
    setMusicTitle("");
  };

  const clearMusic = () => {
    localStorage.removeItem(`city_music_${activeCity}`);
    setCustomMusic(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `city-themes/${activeCity}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("city-assets").upload(path, file, { upsert: true });
      if (!error) {
        const { data } = supabase.storage.from("city-assets").getPublicUrl(path);
        const next = [...customImages, data.publicUrl];
        setCustomImages(next);
        setCityCustomImages(activeCity, next);
      }
    } catch {}
    setUploading(false);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `city-music/${activeCity}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("city-assets").upload(path, file, { upsert: true });
      if (!error) {
        const { data } = supabase.storage.from("city-assets").getPublicUrl(path);
        const music = { url: data.publicUrl, title: file.name.replace(/\.[^.]+$/, "") };
        setCityCustomMusic(activeCity, music);
        setCustomMusic(music);
      }
    } catch {}
    setUploading(false);
  };

  const allImages = getCityImages(activeCity);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Настройки городов
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* City tabs */}
        <div className="flex border-b border-white/10">
          {CITIES.map(c => (
            <button
              key={c.key}
              onClick={() => switchCity(c.key)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeCity === c.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {c.flag} {c.name}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-5">
          {/* Current images preview */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Текущие картинки ({allImages.length})</p>
            <div className="grid grid-cols-5 gap-1.5">
              {allImages.slice(0, 10).map((url, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                  <img src={url} alt="" className="w-full h-full object-cover" onError={e => (e.target as HTMLImageElement).style.display = "none"} />
                  {i < customImages.length && (
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add custom image */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Добавить картинку</p>
            <div className="flex gap-2 mb-2">
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="Вставить URL картинки..."
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={e => e.key === "Enter" && addImageUrl()}
              />
              <button onClick={addImageUrl} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition">
                +
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => imgInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Загрузка..." : "Загрузить файл"}
              </button>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          </div>

          {/* AI suggestions */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              Предложения ИИ для {cityConfig.name}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AI_SUGGESTED[activeCity].map((url, i) => (
                <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border border-white/10 cursor-pointer" onClick={() => addSuggested(url)}>
                  <img src={url} alt="" className="w-full h-full object-cover" onError={e => (e.target as HTMLImageElement).style.display = "none"} />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <span className="text-white text-xs font-medium">+ Добавить</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Music */}
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
              <Music className="h-3.5 w-3.5" />
              Музыка для {cityConfig.name}
            </p>
            {customMusic ? (
              <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg border border-primary/20">
                <div>
                  <p className="text-sm font-medium">🎵 {customMusic.title}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{customMusic.url}</p>
                </div>
                <button onClick={clearMusic} className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-2">Сейчас: {cityConfig.musicTitle}</p>
            )}
            <div className="space-y-2 mt-2">
              <input
                value={musicTitle}
                onChange={e => setMusicTitle(e.target.value)}
                placeholder="Название песни..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex gap-2">
                <input
                  value={musicUrl}
                  onChange={e => setMusicUrl(e.target.value)}
                  placeholder="URL аудио (.ogg, .mp3)..."
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button onClick={saveMusic} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition">
                  ✓
                </button>
              </div>
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Загрузка..." : "Загрузить аудио файл"}
              </button>
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
