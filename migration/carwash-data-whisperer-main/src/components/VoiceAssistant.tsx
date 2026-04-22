import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2, Volume2, Bot, Send, X, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/i18n";

interface VoiceAssistantProps {
  dateFrom: string;
  dateTo: string;
}

type State = "idle" | "listening" | "processing" | "answering" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionAPI = any;

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionAPI;
    webkitSpeechRecognition: SpeechRecognitionAPI;
  }
}

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  image?: string;
}

const EXAMPLES = [
  "Сколько безнал на Левитана вчера?",
  "Какая выручка по всем за последние 7 дней?",
  "Безналичные Усатово сегодня?",
  "Покажи общую выручку за текущий месяц",
];

function getUsername(): string {
  try {
    const token = localStorage.getItem("carwash_token") || "";
    return atob(token).split(":")[0] || "unknown";
  } catch { return "unknown"; }
}

export default function VoiceAssistant({ dateFrom, dateTo }: VoiceAssistantProps) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history from DB when dialog opens
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

  const speak = useCallback((text: string, msgIndex: number) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : lang === "en" ? "en-US" : "uk-UA";
      utterance.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith(lang === "ru" ? "ru" : lang === "de" ? "de" : lang === "en" ? "en" : "uk"))
        || voices.find(v => v.lang.startsWith("ru"))
        || voices[0];
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => {
        setState("idle");
        setSpeakingIndex(null);
      };
      setSpeakingIndex(msgIndex);
      setState("answering");
      window.speechSynthesis.speak(utterance);
    }
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState("idle");
    setSpeakingIndex(null);
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
      // Build conversation history for context (last 6 messages)
      const history = [...messages.slice(-6), userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { query, authToken, dateFrom, dateTo, history, imageData, lang },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Ошибка");

      const assistantMsg: Message = { role: "assistant", content: data.answer };
      setMessages(prev => {
        const next = [...prev, assistantMsg];
        setTimeout(() => speak(data.answer, next.length - 1), 100);
        return next;
      });
      saveMessage(assistantMsg);

      // If AI created a task — show toast notification
      if (data?.taskCreated) {
        import("sonner").then(({ toast }) => {
          toast.success(`✅ Задача создана: "${data.taskCreated.title}" (${data.taskCreated.wash_name})`);
        });
      }

      setState("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка соединения";
      const errMsg: Message = { role: "assistant", content: msg, error: true };
      setMessages(prev => [...prev, errMsg]);
      saveMessage(errMsg);
      setState("error");
    }
  }, [dateFrom, dateTo, speak, messages, lang, saveMessage]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMessages(prev => [...prev, { role: "assistant", content: "Браузер не поддерживает распознавание голоса. Попробуйте Chrome.", error: true }]);
      setState("error");
      return;
    }

    setState("listening");

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : lang === "en" ? "en-US" : "uk-UA";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let finalText = "";

    recognition.onresult = (event: any) => {
      finalText = event.results[0][0].transcript;
    };

    recognition.onend = () => {
      setState("idle");
      if (finalText) askAI(finalText);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        setMessages(prev => [...prev, { role: "assistant", content: `Ошибка микрофона: ${event.error}`, error: true }]);
        setState("error");
      } else {
        setState("idle");
      }
    };

    recognition.start();
  }, [askAI, lang]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setState("idle");
  };

  const handleClose = () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setOpen(false);
    setState("idle");
    setSpeakingIndex(null);
    setAttachedImage(null);
  };

  const handleClearChat = async () => {
    const username = getUsername();
    if (username && username !== "unknown") {
      await supabase.from("ai_chat_messages").delete().eq("username", username);
    }
    setMessages([]);
    setState("idle");
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputText.trim() || attachedImage) && state !== "processing") {
      askAI(inputText.trim() || "Что показано на скриншоте?", attachedImage || undefined);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 relative"
        onClick={handleOpen}
        title="AI Помощник"
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline text-xs">AI</span>
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Помощник
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={handleClearChat}
                  title="Очистить чат"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1" style={{ maxHeight: "50vh" }}>
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center py-2">Задайте вопрос голосом или текстом</p>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Примеры:</p>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      className="block w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors text-muted-foreground"
                      onClick={() => askAI(ex)}
                    >
                      💬 {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2 text-sm",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-xl px-3 py-2 max-w-[85%] relative group",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : msg.error
                          ? "bg-destructive/10 border border-destructive/20 text-destructive"
                          : "bg-muted"
                      )}
                    >
                      {msg.image && (
                        <img src={msg.image} alt="Attached" className="mb-1.5 rounded-lg max-h-32 max-w-full object-contain" />
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      {msg.role === "assistant" && !msg.error && (
                        <button
                          className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => speakingIndex === i ? stopSpeaking() : speak(msg.content, i)}
                          title="Озвучить"
                        >
                          <Volume2 className={cn("h-3.5 w-3.5", speakingIndex === i ? "text-primary animate-pulse" : "text-muted-foreground")} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {state === "processing" && (
                  <div className="flex gap-2 justify-start">
                    <Bot className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="bg-muted rounded-xl px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t pt-3 space-y-2">
            {/* Image preview */}
            {attachedImage && (
              <div className="relative inline-block">
                <img src={attachedImage} alt="Attached" className="h-16 rounded-lg object-cover border" />
                <button
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  onClick={() => setAttachedImage(null)}
                  type="button"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-1.5">
              <Input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Напишите вопрос..."
                className="flex-1 h-9 text-sm"
                disabled={state === "processing"}
              />
              {/* Image attach button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageAttach}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("h-9 w-9 p-0 flex-shrink-0", attachedImage && "border-primary text-primary")}
                onClick={() => fileInputRef.current?.click()}
                disabled={state === "processing"}
                title="Прикрепить фото"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-9 w-9 p-0 flex-shrink-0"
                disabled={(!inputText.trim() && !attachedImage) || state === "processing"}
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={state === "listening" ? "destructive" : "outline"}
                size="sm"
                className={cn("h-9 w-9 p-0 flex-shrink-0 relative", state === "listening" && "ring-2 ring-destructive")}
                onClick={state === "listening" ? stopListening : startListening}
                disabled={state === "processing"}
                title={state === "listening" ? "Остановить" : "Говорить"}
              >
                {state === "listening" && (
                  <span className="absolute inset-0 rounded animate-ping bg-destructive/30" />
                )}
                {state === "listening" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
