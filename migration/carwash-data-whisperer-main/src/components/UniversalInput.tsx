import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Camera, Image, Send, X, Loader2, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SmartVoiceInput from "@/components/SmartVoiceInput";

interface UniversalInputProps {
  placeholder?: string;
  onSubmit: (text: string, imageBase64?: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  rows?: number;
  onSmartVoiceResult?: (title: string) => void;
  smartVoiceContext?: "task" | "note" | "general";
}

export function UniversalInput({
  placeholder = "Введите сообщение...", onSubmit, disabled, className, rows = 3,
  onSmartVoiceResult, smartVoiceContext,
}: UniversalInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [smartVoiceTrigger, setSmartVoiceTrigger] = useState(0);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileAttachRef = useRef<HTMLInputElement>(null);

  const startVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Голосовой ввод не поддерживается"); return; }
    const r = new SpeechRecognition();
    r.lang = "ru-RU"; r.continuous = false; r.interimResults = false;
    r.onresult = (e: any) => setText(prev => prev ? prev + " " + e.results[0][0].transcript : e.results[0][0].transcript);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    recognitionRef.current = r; r.start(); setIsListening(true);
  }, []);

  const stopVoice = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false); }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = async () => {
    if (!text.trim() && !imagePreview) return;
    setIsSubmitting(true);
    try { await onSubmit(text.trim(), imagePreview || undefined); setText(""); setImagePreview(null); }
    finally { setIsSubmitting(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
  };

  return (
    <div className={cn("bg-muted/30 rounded-xl p-2.5 space-y-2", className)}>
      {imagePreview && (
        <div className="relative inline-block">
          <img src={imagePreview} alt="preview" className="h-20 w-auto rounded-lg object-cover border border-border" />
          <button onClick={() => setImagePreview(null)} className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <textarea
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
        style={{ minHeight: `${rows * 1.5}rem` }}
        placeholder={isListening ? "🎤 Слушаю..." : placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSubmitting}
      />

      {/* Compact colorful action bar */}
      <div className="flex items-center gap-2">
        {/* Smart voice */}
        {onSmartVoiceResult && smartVoiceContext && (
          <>
            <SmartVoiceInput
              context={smartVoiceContext}
              lang="ru"
              size="sm"
              triggerCount={smartVoiceTrigger}
              onResult={(p) => { if (p.title) onSmartVoiceResult(p.title); }}
              onRawText={(t) => onSmartVoiceResult(t)}
            />
          </>
        )}

        {/* Regular mic */}
        <button type="button" onClick={isListening ? stopVoice : startVoice} title="Голос"
          className={cn("h-9 w-9 rounded-lg flex items-center justify-center transition-all active:scale-90 shrink-0",
            isListening ? "bg-destructive/20 text-destructive animate-pulse" : "bg-blue-500/15 text-blue-500 hover:bg-blue-500/25")}>
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        {/* Camera */}
        <button type="button" onClick={() => cameraInputRef.current?.click()} title="Камера"
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-all active:scale-90 shrink-0">
          <Camera className="h-4 w-4" />
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {/* Gallery */}
        <button type="button" onClick={() => fileInputRef.current?.click()} title="Галерея"
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-violet-500/15 text-violet-500 hover:bg-violet-500/25 transition-all active:scale-90 shrink-0">
          <Image className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {/* File */}
        <button type="button" onClick={() => fileAttachRef.current?.click()} title="Файл"
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-all active:scale-90 shrink-0">
          <Paperclip className="h-4 w-4" />
        </button>
        <input ref={fileAttachRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        <div className="flex-1" />

        {/* Submit */}
        <button type="button" onClick={handleSubmit} title="Отправить"
          disabled={(!text.trim() && !imagePreview) || disabled || isSubmitting}
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-90 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
