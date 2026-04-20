import { useState, useRef, useCallback } from "react";
import { Bold, Italic, List, ListOrdered, Smile, Type, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_GROUPS = [
  ["📋","📌","✅","❌","⚠️","🔴","🟢","🔵","⭐","💡","🔑","📎","📞","✉️","🏠"],
  ["👍","👎","🤝","💪","🎯","🚀","⏰","🗓️","💰","🔧","📦","🧹","🛒","🎉","❤️"],
  ["😀","😊","😂","🤔","😎","👀","🙏","👋","✨","🔥","💥","🌟","💫","🎯","🏆"],
];

const TEXT_COLORS = [
  { label: "Чёрный", class: "", value: "" },
  { label: "Красный", class: "text-red-600", value: "🔴 " },
  { label: "Зелёный", class: "text-green-600", value: "🟢 " },
  { label: "Синий", class: "text-blue-600", value: "🔵 " },
  { label: "Оранжевый", class: "text-orange-600", value: "🟠 " },
  { label: "Фиолетовый", class: "text-purple-600", value: "🟣 " },
];

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 3, className, autoFocus }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0, selected: "" };
    return { start: ta.selectionStart, end: ta.selectionEnd, selected: value.slice(ta.selectionStart, ta.selectionEnd) };
  }, [value]);

  const insertAt = useCallback((before: string, after: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end, selected } = getSelection();
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [value, onChange, getSelection]);

  const wrapSelection = useCallback((prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end, selected } = getSelection();
    if (selected) {
      const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
      onChange(newVal);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, end + prefix.length); }, 0);
    } else {
      const newVal = value.slice(0, start) + prefix + suffix + value.slice(end);
      onChange(newVal);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
    }
  }, [value, onChange, getSelection]);

  const addBulletList = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end, selected } = getSelection();
    if (selected) {
      const lines = selected.split("\n").map(l => `• ${l}`).join("\n");
      const newVal = value.slice(0, start) + lines + value.slice(end);
      onChange(newVal);
    } else {
      const prefix = (start === 0 || value[start - 1] === "\n") ? "" : "\n";
      insertAt(prefix + "• ", "");
    }
  }, [value, onChange, getSelection, insertAt]);

  const addNumberedList = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end, selected } = getSelection();
    if (selected) {
      const lines = selected.split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n");
      const newVal = value.slice(0, start) + lines + value.slice(end);
      onChange(newVal);
    } else {
      const prefix = (start === 0 || value[start - 1] === "\n") ? "" : "\n";
      insertAt(prefix + "1. ", "");
    }
  }, [value, onChange, getSelection, insertAt]);

  const addEmoji = useCallback((emoji: string) => {
    insertAt(emoji);
  }, [insertAt]);

  return (
    <div className={cn("space-y-1", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap px-1 py-1 rounded-lg bg-muted/40 border">
        <ToolButton icon={<Bold className="h-3.5 w-3.5" />} title="Жирный" onClick={() => wrapSelection("**", "**")} />
        <ToolButton icon={<Italic className="h-3.5 w-3.5" />} title="Курсив" onClick={() => wrapSelection("_", "_")} />
        <div className="w-px h-5 bg-border mx-0.5" />
        <ToolButton icon={<List className="h-3.5 w-3.5" />} title="Маркированный список" onClick={addBulletList} />
        <ToolButton icon={<ListOrdered className="h-3.5 w-3.5" />} title="Нумерованный список" onClick={addNumberedList} />
        <div className="w-px h-5 bg-border mx-0.5" />
        
        {/* Color picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title="Цветная метка" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Palette className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 z-[300]">
            <p className="text-xs font-semibold mb-1.5 text-muted-foreground">Цветная метка</p>
            <div className="grid grid-cols-3 gap-1">
              {TEXT_COLORS.filter(c => c.value).map(c => (
                <button key={c.label} type="button" onClick={() => insertAt(c.value)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors">
                  <span>{c.value.trim()}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Emoji picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title="Эмоджи" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Smile className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2 z-[300]">
            <p className="text-xs font-semibold mb-1.5 text-muted-foreground">Эмоджи</p>
            {EMOJI_GROUPS.map((group, gi) => (
              <div key={gi} className="flex flex-wrap gap-0.5 mb-1">
                {group.map(e => (
                  <button key={e} type="button" onClick={() => addEmoji(e)}
                    className="text-lg p-1 rounded hover:bg-muted transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* Heading */}
        <ToolButton icon={<Type className="h-3.5 w-3.5" />} title="Заголовок" onClick={() => {
          const ta = textareaRef.current;
          if (!ta) return;
          const { start } = getSelection();
          const prefix = (start === 0 || value[start - 1] === "\n") ? "" : "\n";
          insertAt(prefix + "### ", "");
        }} />
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
      />

      {/* Preview hint */}
      {value && (value.includes("**") || value.includes("_") || value.includes("•") || value.includes("###")) && (
        <p className="text-xs text-muted-foreground/60 px-1">💡 Текст сохраняется с форматированием</p>
      )}
    </div>
  );
}

function ToolButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {icon}
    </button>
  );
}
