import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ImageIcon, CheckCircle2, ArrowLeft } from "lucide-react";

const CACHE_NAME = "share-target-cache-v1";
const SHARED_IMAGE_KEY = "shared-image";

export default function ShareTarget() {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [sharedText, setSharedText] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSharedContent = async () => {
      try {
        if (!("caches" in window)) {
          setLoading(false);
          return;
        }

        const cache = await caches.open(CACHE_NAME);

        // Load image
        const imageResponse = await cache.match(SHARED_IMAGE_KEY);
        if (imageResponse) {
          const blob = await imageResponse.blob();
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
          setImageName("shared-image");
        }

        // Load meta (text/title)
        const metaResponse = await cache.match("shared-meta");
        if (metaResponse) {
          const meta = await metaResponse.json();
          if (meta.text) setSharedText(meta.text);
          else if (meta.title) setSharedText(meta.title);
        }
      } catch (err) {
        console.error("Error loading shared content:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSharedContent();

    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, []);

  const handleClear = async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(SHARED_IMAGE_KEY);
      await cache.delete("shared-meta");
    } catch {}
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Фото получено</h1>
          {sharedText && (
            <p className="text-muted-foreground text-sm">{sharedText}</p>
          )}
        </div>

        {/* Image preview */}
        <div className="rounded-xl overflow-hidden border border-border bg-muted/30 shadow-sm">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
              <span className="text-sm">Загрузка...</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Shared image"
              className="w-full object-contain max-h-96"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <ImageIcon className="w-12 h-12 opacity-40" />
              <span className="text-sm">Изображение не найдено</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleClear}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
          {imageUrl && (
            <Button
              className="flex-1"
              onClick={() => {
                const a = document.createElement("a");
                a.href = imageUrl;
                a.download = imageName || "shared-image.jpg";
                a.click();
              }}
            >
              Сохранить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
