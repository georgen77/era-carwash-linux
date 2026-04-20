import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

// ─── Types ────────────────────────────────────────────────────
export type VoiceContext = "movement" | "emma_cash" | "task";

export interface MovementResult {
  from_location: string;
  to_location: string;
  items: Array<{ item_type: string; quantity: number }>;
  notes?: string;
}

export interface TransactionResult {
  transaction_type: "income" | "expense";
  amount: number;
  description?: string;
  payment_source?: string;
  counterparty?: string;
  category?: string;
  apartment?: string;
  location?: string;
}

export interface TaskResult {
  title: string;
  description: string;
  emoji?: string;
  steps?: Array<{ description: string; emoji?: string }>;
}

interface SmartVoiceButtonProps {
  context: VoiceContext;
  onMovementResult?: (data: MovementResult) => void;
  onTransactionResult?: (data: TransactionResult) => void;
  onTaskResult?: (data: TaskResult) => void;
}

// ─── Silence detection constants ──────────────────────────────
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 4000;
const CHECK_INTERVAL_MS = 200;

export default function SmartVoiceButton({
  context, onMovementResult, onTransactionResult, onTaskResult,
}: SmartVoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<"transcribing" | "parsing" | "">("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const silenceCheckRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup silence detection
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      silenceStartRef.current = null;

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
        audioCtx.close();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        processAudio(blob);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);

      // Check for silence
      const dataArray = new Float32Array(analyser.fftSize);
      silenceCheckRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now();
          else if (Date.now() - silenceStartRef.current > SILENCE_DURATION_MS) {
            mr.stop();
            setIsRecording(false);
          }
        } else {
          silenceStartRef.current = null;
        }
      }, CHECK_INTERVAL_MS);

    } catch {
      toast({ title: "Нет доступа к микрофону", variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    setProcessingStage("transcribing");

    try {
      // Step 1: Transcribe
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { data: txData, error: txError } = await invoke("transcribe-audio", {
        body: { audioBase64: base64, mimeType: "audio/webm" },
      });

      if (txError || !txData?.transcription) {
        toast({ title: "Ошибка транскрипции", variant: "destructive" });
        setIsProcessing(false);
        setProcessingStage("");
        return;
      }

      setProcessingStage("parsing");

      // Step 2: Parse with AI
      const { data: parseData, error: parseError } = await invoke("smart-voice-input", {
        body: { transcription: txData.transcription, context },
      });

      if (parseError || parseData?.error) {
        toast({ title: parseData?.error || "Ошибка распознавания", variant: "destructive" });
        setIsProcessing(false);
        setProcessingStage("");
        return;
      }

      const { result, functionName } = parseData;

      // Step 3: Send directly to the form via callbacks / events
      if (functionName === "fill_movement") {
        if (onMovementResult) {
          onMovementResult(result);
        } else {
          window.dispatchEvent(new CustomEvent("smart-voice-fill-movement", { detail: result }));
        }
        scrollToForm("movement-form");
      } else if (functionName === "fill_transaction") {
        if (onTransactionResult) {
          onTransactionResult(result);
        } else {
          window.dispatchEvent(new CustomEvent("smart-voice-fill-transaction", { detail: result }));
        }
        scrollToForm("emma-cash-form");
      } else if (functionName === "fill_task") {
        if (onTaskResult) {
          onTaskResult(result);
        } else {
          window.dispatchEvent(new CustomEvent("smart-voice-fill-task", { detail: result }));
        }
      }

      toast({ title: "✨ Форма заполнена — проверьте и отправьте" });

    } catch {
      toast({ title: "Ошибка обработки голоса", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const scrollToForm = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const handleClick = () => {
    if (isProcessing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ─── FAB ────────────────────────────────────────────────────
  return (
    <button
      onClick={handleClick}
      disabled={isProcessing}
      className={cn(
        "fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all",
        isRecording
          ? "bg-destructive text-destructive-foreground animate-pulse scale-110 ring-4 ring-destructive/30"
          : isProcessing
            ? "bg-warning text-warning-foreground"
            : "bg-primary text-primary-foreground hover:scale-105 active:scale-95 opacity-80 hover:opacity-100"
      )}
      title="Интеллектуальный голосовой ввод"
    >
      {isProcessing ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : isRecording ? (
        <MicOff className="h-6 w-6" />
      ) : (
        <Mic className="h-6 w-6" />
      )}

      {/* Processing label */}
      {isProcessing && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-background text-foreground px-2 py-1 rounded-lg shadow whitespace-nowrap border">
          {processingStage === "transcribing" ? "🎙 Транскрибирую..." : "🧠 Анализирую..."}
        </span>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-destructive text-destructive-foreground px-2 py-1 rounded-lg shadow whitespace-nowrap">
          🔴 Говорите...
        </span>
      )}
    </button>
  );
}
