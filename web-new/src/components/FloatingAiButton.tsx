import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2, Send, X, Bot, ImagePlus, Volume2, VolumeX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/i18n";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type State = "idle" | "listening" | "processing" | "speaking" | "error";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionAPI = any;

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  image?: string;
}

function getUsername(): string {
  try {
    const token = localStorage.getItem("carwash_token") || "";
    return atob(token).split(":")[0] || "unknown";
  } catch { return "unknown"; }
}

const EXAMPLES = [
  "Какая выручка по всем за вчера?",
  "Безнал на Левитана сегодня?",
  "Запиши задачу проверить камеры на Усатово",
  "Запиши задачу найти мойщиков на Левитана и отправь Калинину",
];

interface FloatingAiButtonProps {
  dateFrom: string;
  dateTo: string;
  onSmartVoiceTrigger?: () => void;
  /** If set to "tasks" or "notes", single click triggers SmartVoiceInput instead of AI chat */
  activeTab?: string;
}

export default function FloatingAiButton({ dateFrom, dateTo, onSmartVoiceTrigger, activeTab }: FloatingAiButtonProps) {
  const { lang } = useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const username = getUsername();
    if (!username || username === "unknown") return;
    setLoadingHistory(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("ai_chat_messages")
          .select("role, content, image, error")
          .eq("username", username)
          .order("created_at", { ascending: true })
          .limit(100);
        if (data && data.length > 0) {
          setMessages(data.map((r) => ({
            role: r.role as "user" | "assistant",
            content: r.content,
            image: r.image || undefined,
            error: r.error || false,
          })));
        }
      } catch { /* ignore */ } finally {
        setLoadingHistory(false);
      }
    })();
  }, [open]);

  // TTS: speak AI response
  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const langMap: Record<string, string> = {
      ru: "ru-RU", uk: "uk-UA", en: "en-US", de: "de-DE",
    };
    utterance.lang = langMap[lang] || "ru-RU";

    const setVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const targetLang = langMap[lang] || "ru-RU";
        utterance.voice =
          voices.find(v => v.lang === targetLang && v.localService) ||
          voices.find(v => v.lang.startsWith(targetLang.split("-")[0])) ||
          voices[0];
      }
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      setVoice();
    } else {
      window.speechSynthesis.addEventListener("voiceschanged", setVoice, { once: true });
    }

    setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled, lang]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState("idle");
  }, []);

  const saveMessage = useCallback(async (msg: Message) => {
    const username = getUsername();
    if (!username || username === "unknown") return;
    await supabase.from("ai_chat_messages").insert({
      username,
      role: msg.role,
      content: msg.content,
      image: msg.image || null,
      error: msg.error || false,
    });
  }, []);

  const askAI = useCallback(async (query: string, imageData?: string) => {
    if (!query.trim() && !imageData) return;
    const userMsg: Message = { role: "user", content: query, image: imageData };
    setMessages(prev => [...prev, userMsg]);
    saveMessage(userMsg);
    setState("processing");
    setInputText("");
    setAttachedImage(null);

    try {
      const authToken = localStorage.getItem("carwash_token") || "";
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { query, authToken, dateFrom, dateTo, history, imageData, lang },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Ошибка");

      const assistantMsg: Message = { role: "assistant", content: data.answer };
      setMessages(prev => [...prev, assistantMsg]);
      saveMessage(assistantMsg);

      if (data?.taskCreated) {
        toast.success(`✅ Задача: "${data.taskCreated.title}" (${data.taskCreated.wash_name})`);
        qc.invalidateQueries({ queryKey: ["tasks"] });
      }

      // Auto-speak the response
      speakText(data.answer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка соединения";
      const errMsg: Message = { role: "assistant", content: msg, error: true };
      setMessages(prev => [...prev, errMsg]);
      saveMessage(errMsg);
      setState("error");
    }
  }, [dateFrom, dateTo, messages, lang, saveMessage, qc, speakText]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Браузер не поддерживает голосовой ввод");
      return;
    }
    window.speechSynthesis?.cancel();
    setState("listening");
    const recognition = new SR();
    recognition.lang = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : lang === "en" ? "en-US" : "uk-UA";
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    let finalText = "";
    recognition.onresult = (event: any) => { finalText = event.results[0][0].transcript; };
    recognition.onend = () => { setState("idle"); if (finalText) askAI(finalText); };
    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") setState("error");
      else setState("idle");
    };
    recognition.start();
  }, [askAI, lang]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  // Long-press handlers for the floating button
  const handleFloatingPointerDown = useCallback(() => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // If onSmartVoiceTrigger provided, delegate to parent (tasks/notes SmartVoiceInput)
      if (onSmartVoiceTrigger) {
        onSmartVoiceTrigger();
      } else {
        setOpen(true);
        // small delay so panel mounts before voice starts
        setTimeout(() => startListening(), 100);
      }
    }, 500);
  }, [startListening, onSmartVoiceTrigger]);

  const handleFloatingPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleFloatingClick = useCallback(() => {
    if (!isLongPressRef.current) {
      // On tasks/notes tabs, single click directly triggers smart voice input
      if ((activeTab === "tasks" || activeTab === "notes") && onSmartVoiceTrigger) {
        onSmartVoiceTrigger();
      } else {
        setOpen(true);
      }
    }
  }, [activeTab, onSmartVoiceTrigger]);

  const handleClose = () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setOpen(false);
    setState("idle");
    setAttachedImage(null);
  };

  const handleClearChat = async () => {
    const username = getUsername();
    if (username && username !== "unknown") {
      await supabase.from("ai_chat_messages").delete().eq("username", username);
    }
    setMessages([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputText.trim() || attachedImage) && state !== "processing") {
      askAI(inputText.trim() || "Что показано на скриншоте?", attachedImage || undefined);
    }
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onPointerDown={handleFloatingPointerDown}
          onPointerUp={handleFloatingPointerUp}
          onPointerLeave={handleFloatingPointerUp}
          onClick={handleFloatingClick}
          className={cn(
            "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg",
            "bg-primary text-primary-foreground",
            "flex items-center justify-center",
            "transition-all hover:scale-110 active:scale-95",
            "ring-4 ring-primary/20",
            "select-none"
          )}
          title="AI Помощник (долгое нажатие = голос)"
        >
          <Bot className="h-6 w-6" />
          <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-chart-2 animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 w-[350px] max-w-[calc(100vw-2rem)]",
          "bg-background border border-border rounded-2xl shadow-2xl",
          "flex flex-col overflow-hidden",
          "max-h-[75vh]"
        )}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm flex-1">AI Помощник</span>
            {/* TTS toggle */}
            <button
              onClick={() => { setTtsEnabled(v => !v); if (!ttsEnabled) stopSpeaking(); }}
              className={cn("p-1 rounded transition-colors", ttsEnabled ? "text-primary" : "text-muted-foreground")}
              title={ttsEnabled ? "Выключить озвучку" : "Включить озвучку"}
            >
              {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            {state === "speaking" && (
              <button onClick={stopSpeaking} className="text-primary animate-pulse p-1" title="Остановить">
                <VolumeX className="h-3.5 w-3.5" />
              </button>
            )}
            {messages.length > 0 && (
              <button onClick={handleClearChat} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Очистить">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center py-1">Задайте вопрос голосом или текстом</p>
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => askAI(ex)}
                    className="block w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-muted/60 transition-colors text-muted-foreground border border-border/50">
                    💬 {ex}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-1.5 text-xs", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && <Bot className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />}
                    <div className={cn(
                      "rounded-xl px-3 py-2 max-w-[85%]",
                      msg.role === "user" ? "bg-primary text-primary-foreground" :
                      msg.error ? "bg-destructive/10 border border-destructive/20 text-destructive" : "bg-muted"
                    )}>
                      {msg.image && <img src={msg.image} alt="" className="mb-1 rounded-lg max-h-24 object-contain" />}
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      {/* Replay TTS for assistant messages */}
                      {msg.role === "assistant" && !msg.error && (
                        <button
                          onClick={() => speakText(msg.content)}
                          className="mt-1 text-muted-foreground hover:text-primary transition-colors"
                          title="Озвучить"
                        >
                          <Volume2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {state === "processing" && (
                  <div className="flex gap-1.5 justify-start">
                    <Bot className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="bg-muted rounded-xl px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                {state === "speaking" && (
                  <div className="flex gap-1.5 justify-start">
                    <Bot className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0 animate-pulse" />
                    <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                      <Volume2 className="h-3 w-3 text-primary animate-pulse" />
                      <span className="text-xs text-primary">Озвучиваю...</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Image preview */}
          {attachedImage && (
            <div className="px-3 pb-1 flex-shrink-0">
              <div className="relative inline-block">
                <img src={attachedImage} alt="" className="h-14 rounded-lg object-cover border" />
                <button onClick={() => setAttachedImage(null)} type="button"
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border p-2">
            <form onSubmit={handleSubmit} className="flex gap-1">
              <Input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={state === "listening" ? "🎤 Слушаю..." : "Напишите вопрос..."}
                className="flex-1 h-8 text-xs"
                disabled={state === "processing" || state === "listening"}
              />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={() => fileInputRef.current?.click()} disabled={state === "processing"}>
                <ImagePlus className="h-3.5 w-3.5" />
              </Button>
              <Button type="submit" size="sm" className="h-8 w-8 p-0"
                disabled={(!inputText.trim() && !attachedImage) || state === "processing"}>
                <Send className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant={state === "listening" ? "destructive" : "outline"} size="sm"
                className={cn("h-8 w-8 p-0 relative", state === "listening" && "ring-2 ring-destructive")}
                onClick={state === "listening" ? stopListening : startListening}
                disabled={state === "processing" || state === "speaking"}>
                {state === "listening" && <span className="absolute inset-0 rounded animate-ping bg-destructive/30" />}
                {state === "listening" ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
