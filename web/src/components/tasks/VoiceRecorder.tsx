import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invoke } from "@/lib/invoke";

interface VoiceRecorderProps {
  onTranscription: (text: string, audioUrl?: string, audioBlob?: Blob) => void;
  disabled?: boolean;
  compact?: boolean; // icon-only mode
}

export function VoiceRecorder({ onTranscription, disabled, compact }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        setTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(",")[1];
            const { data, error } = await invoke("transcribe-audio", {
              body: { audioBase64: base64, mimeType: "audio/webm" },
            });
            if (error || !data?.transcription) {
              toast({ title: "Ошибка транскрипции", variant: "destructive" });
            } else {
              onTranscription(data.transcription, audioUrl, blob);
            }
            setTranscribing(false);
          };
          reader.readAsDataURL(blob);
        } catch {
          setTranscribing(false);
          toast({ title: "Ошибка транскрипции", variant: "destructive" });
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast({ title: "Нет доступа к микрофону", variant: "destructive" });
    }
  }, [onTranscription, toast]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  if (compact) {
    return (
      <button
        type="button"
        title={recording ? "Остановить запись" : "Голосовой ввод"}
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || transcribing}
        className={`p-1.5 rounded-lg transition-colors ${
          recording
            ? "bg-destructive/20 text-destructive animate-pulse"
            : transcribing
            ? "bg-muted text-muted-foreground"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={recording ? "destructive" : "outline"}
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled || transcribing}
      className="gap-1.5"
    >
      {transcribing ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Транскрибирую...</>
      ) : recording ? (
        <><MicOff className="h-3.5 w-3.5 animate-pulse" />Стоп</>
      ) : (
        <><Mic className="h-3.5 w-3.5" />🎙 Голос</>
      )}
    </Button>
  );
}
