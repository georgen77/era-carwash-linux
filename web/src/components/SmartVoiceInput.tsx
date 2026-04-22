/**
 * SmartVoiceInput — Intelligent voice input with self-correction and AI parsing.
 * Similar to Todoist Ramble: streams recognition, detects corrections, parses with LLM.
 */
import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export interface ParsedVoiceResult {
  title: string;
  due_date?: string | null;
  priority?: number;
  raw?: string;
  type?: "task" | "note" | "expense" | "reminder";
  assignee?: string;
  wash_name?: string;
}

interface SmartVoiceInputProps {
  /** Called when AI returns parsed result */
  onResult: (result: ParsedVoiceResult) => void;
  /** Called when raw text is available (fallback) */
  onRawText?: (text: string) => void;
  /** Language */
  lang?: string;
  /** Context type for AI parsing */
  context?: "task" | "note" | "general";
  /** className for the mic button */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether the parent is disabled */
  disabled?: boolean;
  /** Auto-start listening on mount */
  autoStart?: boolean;
  /** Increment this counter to trigger a new voice session */
  triggerCount?: number;
}

const SMART_PAUSE_MS = 3000; // silence → auto-stop

export default function SmartVoiceInput({
  onResult, onRawText, lang = "ru", context = "general",
  className, size = "md", disabled = false, autoStart = false, triggerCount = 0,
}: SmartVoiceInputProps) {
  const [state, setState] = useState<"idle" | "listening" | "processing">("idle");
  const [liveText, setLiveText] = useState("");

  // ALL mutable values live in refs — never in useCallback/useEffect deps
  const onResultRef = useRef(onResult);
  const onRawTextRef = useRef(onRawText);
  const langRef = useRef(lang);
  const contextRef = useRef(context);
  const disabledRef = useRef(disabled);

  // Keep refs up-to-date on every render (no effects needed for this)
  onResultRef.current = onResult;
  onRawTextRef.current = onRawText;
  langRef.current = lang;
  contextRef.current = context;
  disabledRef.current = disabled;

  const recogRef = useRef<SR>(null);
  const accumulatedRef = useRef("");
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizedRef = useRef(false);
  const stateRef = useRef<"idle" | "listening" | "processing">("idle");

  // Keep stateRef in sync
  const setStateSync = (s: "idle" | "listening" | "processing") => {
    stateRef.current = s;
    setState(s);
  };

  // Stable refs for start/stop — defined once, never recreated
  const stopAndProcessRef = useRef<() => Promise<void>>();
  const startListeningRef = useRef<() => void>();

  // Define stopAndProcess once via ref — uses only other refs
  useEffect(() => {
    stopAndProcessRef.current = async () => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;

      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }

      recogRef.current?.stop();
      recogRef.current = null;

      const full = accumulatedRef.current.trim();
      if (!full) {
        setStateSync("idle");
        setLiveText("");
        return;
      }

      setStateSync("processing");

      const currentLang = langRef.current;
      const currentContext = contextRef.current;

      const currentDate = new Date().toLocaleDateString("ru-RU", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });

      let systemPrompt = "";
      if (currentContext === "task") {
        systemPrompt = `Ты — парсер задач с поддержкой исправлений. Твоя цель — понять финальное намерение пользователя.
Если пользователь говорит фразы-исправления ("нет, не это", "ой, передумал", "точнее", "вместо этого", "а нет"), учти исправление.
Пример: "Купить хлеб... ой, нет, не хлеб, а молоко завтра" → title: "Купить молоко", due_date: завтра.
Сегодня: ${currentDate}.
Извлеки: title (без мусорных слов), due_date (YYYY-MM-DD или null), priority (1-4, "срочно"=4, "важно"=3, "обычно"=2, "низкий"=1), assignee (имя исполнителя если упомянуто, иначе null), wash_name (название объекта если упомянуто: Усатово/Левитана/Корсунцы/Общее, иначе "Общее").
Верни ТОЛЬКО JSON: {"title":"...","due_date":"...","priority":2,"assignee":null,"wash_name":"Общее"}`;
      } else if (currentContext === "note") {
        systemPrompt = `Ты — парсер заметок. Очисти текст от слов-паразитов и ненужных исправлений, сохрани смысл.
Если пользователь исправлял себя, возьми финальный вариант.
Сегодня: ${currentDate}.
Верни ТОЛЬКО JSON: {"title":"итоговый текст заметки","due_date":null,"priority":1}`;
      } else {
        systemPrompt = `Ты — парсер голосовых команд. Определи тип команды (task/note/general) и основной текст.
Если пользователь исправлял себя, возьми финальный вариант.
Сегодня: ${currentDate}.
Верни ТОЛЬКО JSON: {"title":"итоговый текст","due_date":null,"priority":1,"type":"general"}`;
      }

      try {
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: {
            query: `Пользователь сказал: "${full}". ${currentContext === "task" ? "Распарси как задачу." : "Распарси команду."}`,
            authToken: localStorage.getItem("carwash_token") || "",
            lang: currentLang,
            systemOverride: systemPrompt,
            jsonMode: true,
          },
        });

        if (!error && data?.answer) {
          try {
            const jsonMatch = data.answer.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed: ParsedVoiceResult = JSON.parse(jsonMatch[0]);
              parsed.raw = full;
              onResultRef.current(parsed);
              setLiveText("");
              setStateSync("idle");
              return;
            }
          } catch { /* fall through */ }
        }
      } catch { /* fall through */ }

      // Fallback: raw text
      onRawTextRef.current?.(full);
      onResultRef.current({ title: full, raw: full });
      setLiveText("");
      setStateSync("idle");
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Define startListening once via ref
  useEffect(() => {
    startListeningRef.current = () => {
      if (disabledRef.current) return;
      if (stateRef.current !== "idle") return; // guard: don't start if already active

      const SRClass = (window as SR).SpeechRecognition || (window as SR).webkitSpeechRecognition;
      if (!SRClass) {
        toast.error("Браузер не поддерживает голосовой ввод");
        return;
      }

      finalizedRef.current = false;
      accumulatedRef.current = "";
      setLiveText("");
      setStateSync("listening");

      const recog = new SRClass();
      const l = langRef.current;
      recog.lang = l === "ru" ? "ru-RU" : l === "uk" ? "uk-UA" : l === "de" ? "de-DE" : "en-US";
      recog.continuous = true;
      recog.interimResults = true;
      recogRef.current = recog;

      recog.onresult = (event: SR) => {
        let interimNew = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            accumulatedRef.current += t + " ";
            interimNew = "";
          } else {
            interimNew = t;
          }
        }
        setLiveText((accumulatedRef.current + interimNew).trim());

        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => stopAndProcessRef.current?.(), SMART_PAUSE_MS);
      };

      recog.onend = () => {
        if (!finalizedRef.current) stopAndProcessRef.current?.();
      };

      recog.onerror = (e: SR) => {
        if (e.error !== "no-speech") {
          setStateSync("idle");
          setLiveText("");
        }
      };

      recog.start();

      // Max session 60s
      setTimeout(() => {
        if (!finalizedRef.current) stopAndProcessRef.current?.();
      }, 60000);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      recogRef.current?.stop();
      finalizedRef.current = true; // prevent any pending async from firing
    };
  }, []);

  // Auto-start — only once on mount
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (autoStart && !didAutoStart.current) {
      didAutoStart.current = true;
      const t = setTimeout(() => startListeningRef.current?.(), 200);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // External trigger — ONLY react to triggerCount changes, nothing else
  const prevTriggerRef = useRef(triggerCount);
  useEffect(() => {
    // On first mount: record initial value without starting
    prevTriggerRef.current = triggerCount;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (triggerCount > prevTriggerRef.current) {
      prevTriggerRef.current = triggerCount;
      startListeningRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCount]);

  const handleClick = () => {
    if (state === "idle") {
      startListeningRef.current?.();
    } else if (state === "listening") {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      stopAndProcessRef.current?.();
    }
  };

  const sizeClasses = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" };
  const iconSize = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === "processing"}
        className={cn(
          "relative rounded-full flex items-center justify-center transition-all select-none",
          sizeClasses[size],
          state === "idle"
            ? "bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground border border-border"
            : state === "listening"
            ? "bg-destructive text-destructive-foreground border-0 ring-4 ring-destructive/30"
            : "bg-muted text-muted-foreground border border-border cursor-not-allowed",
          className
        )}
        title={state === "idle" ? "Голосовой ввод (умный)" : state === "listening" ? "Нажмите для остановки" : "Обрабатываю..."}
      >
        {state === "listening" && (
          <span className="absolute inset-0 rounded-full animate-ping bg-destructive/40" />
        )}
        {state === "processing" ? (
          <Loader2 className={cn("animate-spin", iconSize[size])} />
        ) : state === "listening" ? (
          <MicOff className={iconSize[size]} />
        ) : (
          <Mic className={iconSize[size]} />
        )}
      </button>

      {(state === "listening" || state === "processing") && (
        <div className={cn(
          "rounded-lg px-2.5 py-1.5 text-xs leading-relaxed transition-all",
          state === "listening"
            ? "bg-destructive/5 border border-destructive/20 text-foreground"
            : "bg-muted/60 text-muted-foreground animate-pulse"
        )}>
          {state === "listening" ? (
            <>
              <span className="inline-flex items-center gap-1 text-destructive font-medium mr-1">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse inline-block" />
                Слушаю...
              </span>
              {liveText || <span className="text-muted-foreground italic">говорите...</span>}
            </>
          ) : (
            <span>🧠 Анализирую... «{liveText.slice(0, 60)}{liveText.length > 60 ? "…" : ""}»</span>
          )}
        </div>
      )}
    </div>
  );
}
