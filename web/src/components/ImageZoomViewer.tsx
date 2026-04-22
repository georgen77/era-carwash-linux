/**
 * ImageZoomViewer — fullscreen image viewer with pinch-to-zoom and touch pan.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageZoomViewerProps {
  src: string;
  onClose: () => void;
}

export default function ImageZoomViewer({ src, onClose }: ImageZoomViewerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const imgRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  // Touch events for pinch-zoom and pan
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isDragging.current = false;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = dist / lastTouchDist.current;
      setScale(s => Math.min(Math.max(s * delta, 0.5), 5));
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && lastTouchPos.current && scale > 1) {
      e.preventDefault();
      isDragging.current = true;
      const nx = e.touches[0].clientX;
      const ny = e.touches[0].clientY;
      const dx = nx - lastTouchPos.current.x;
      const dy = ny - lastTouchPos.current.y;
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
      lastTouchPos.current = { x: nx, y: ny };
    }
  }, [scale]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchDist.current = null;
    if (!isDragging.current && e.changedTouches.length === 1 && scale <= 1) {
      onClose();
    }
    isDragging.current = false;
  }, [onClose, scale]);

  // Mouse wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => Math.min(Math.max(s * delta, 0.5), 5));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center select-none"
      onClick={() => { if (!isDragging.current && scale <= 1) onClose(); }}
      onWheel={onWheel}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10" onClick={e => e.stopPropagation()}>
        <button onClick={() => setScale(s => Math.min(s * 1.3, 5))}
          className="h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button onClick={() => setScale(s => Math.max(s / 1.3, 0.5))}
          className="h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button onClick={reset}
          className="h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button onClick={onClose}
          className="h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scale indicator */}
      {scale !== 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs bg-black/40 px-2 py-1 rounded-full">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* Image container */}
      <div
        ref={imgRef}
        style={{ transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`, transition: isDragging.current ? "none" : "transform 0.15s ease" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={e => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing"
      >
        <img
          src={src}
          alt=""
          className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
          draggable={false}
        />
      </div>

      {/* Hint */}
      {scale === 1 && (
        <p className="absolute bottom-4 right-4 text-white/30 text-[10px]">Щипок / колёсико = зум · Tap = закрыть</p>
      )}
    </div>
  );
}
