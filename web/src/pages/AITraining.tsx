import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Save, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Password to access this page
const ACCESS_PASSWORD = "era2024ai";

interface SynonymEntry {
  id: string;
  canonical: string;
  synonyms: string[];
  context: "movement" | "emma_cash" | "both";
}

// Built-in entries from the edge function, shown for reference
const BUILTIN_LOCATION_SYNONYMS: SynonymEntry[] = [
  { id: "b1", canonical: "piral_1", synonyms: ["пераль 1", "пираль 1", "oasis 1", "оазис 1", "первый"], context: "movement" },
  { id: "b2", canonical: "piral_2", synonyms: ["пераль 2", "пираль 2", "oasis 2", "оазис 2", "второй", "гранде", "oasis grande", "оазис гранде"], context: "movement" },
  { id: "b3", canonical: "salvador", synonyms: ["сальвадор", "salvador", "era deluxe", "эра делюкс", "делюкс", "eulra deluxe"], context: "movement" },
  { id: "b4", canonical: "dirty_linen_piral", synonyms: ["грязное пераль", "грязное пираль", "грязное бельё пераль"], context: "movement" },
  { id: "b5", canonical: "dirty_linen_salvador", synonyms: ["грязное сальвадор", "грязное бельё сальвадор"], context: "movement" },
  { id: "b6", canonical: "clean_linen_piral", synonyms: ["кладовка пераль", "кладовка", "чистое пераль"], context: "movement" },
  { id: "b7", canonical: "clean_linen_salvador", synonyms: ["шкаф сальвадор", "шкаф", "чистое сальвадор"], context: "movement" },
  { id: "b8", canonical: "albert_laundry", synonyms: ["прачечная", "альберт", "albert", "прачечная альберт"], context: "movement" },
  { id: "b9", canonical: "purchase", synonyms: ["закупка", "покупка", "новое", "купили"], context: "movement" },
  { id: "b10", canonical: "damaged", synonyms: ["испорченное", "украденное", "повреждённое", "списание"], context: "movement" },
];

const BUILTIN_ITEM_SYNONYMS: SynonymEntry[] = [
  { id: "i1", canonical: "sheets", synonyms: ["простыни", "простыня", "простынь", "простыни"], context: "movement" },
  { id: "i2", canonical: "duvet_covers", synonyms: ["пододеяльники", "пододеяльник", "пуховик", "одеяльники"], context: "movement" },
  { id: "i3", canonical: "pillowcases", synonyms: ["наволочки", "наволочка", "подушки"], context: "movement" },
  { id: "i4", canonical: "large_towels", synonyms: ["большие полотенца", "большое полотенце", "большие", "банные"], context: "movement" },
  { id: "i5", canonical: "small_towels", synonyms: ["маленькие полотенца", "маленькое полотенце", "маленькие", "малые"], context: "movement" },
  { id: "i6", canonical: "kitchen_towels", synonyms: ["кухонное полотенце", "кухонные полотенца", "кухонные"], context: "movement" },
  { id: "i7", canonical: "rugs", synonyms: ["коврик", "коврики", "ковры"], context: "movement" },
  { id: "i8", canonical: "beach_mat", synonyms: ["подстилка", "пляж", "пляжная подстилка", "пляжный коврик"], context: "movement" },
  { id: "i9", canonical: "mattress_pad", synonyms: ["наматрасник", "наматрасники", "чехол на матрас"], context: "movement" },
];

const BUILTIN_CASH_SYNONYMS: SynonymEntry[] = [
  { id: "c1", canonical: "Марьяна", synonyms: ["маша", "мариана", "марьяша"], context: "emma_cash" },
  { id: "c2", canonical: "Карта папы", synonyms: ["папина карта", "карта жоржа", "george card", "жорж"], context: "emma_cash" },
  { id: "c3", canonical: "Наличные", synonyms: ["нал", "кэш", "cash"], context: "emma_cash" },
  { id: "c4", canonical: "Оплата клининга", synonyms: ["уборка", "клининг", "платёж уборщице", "оплата"], context: "emma_cash" },
];

const CONTEXT_LABELS = {
  movement: "📦 Перемещение белья",
  emma_cash: "💰 Касса",
  both: "🔄 Везде",
};

function SynonymCard({ entry, onDelete, isBuiltin }: {
  entry: SynonymEntry;
  onDelete?: (id: string) => void;
  isBuiltin?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2",
      isBuiltin ? "bg-muted/30 border-border/50 opacity-75" : "bg-card border-border shadow-sm"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {entry.canonical}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              {CONTEXT_LABELS[entry.context]}
            </span>
            {isBuiltin && <span className="text-xs text-muted-foreground/60">встроенный</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {entry.synonyms.map((s, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border">
                {s}
              </span>
            ))}
          </div>
        </div>
        {!isBuiltin && onDelete && (
          <button
            onClick={() => onDelete(entry.id)}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AITraining() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [activeSection, setActiveSection] = useState<"locations" | "items" | "cash" | "custom">("locations");

  // Custom synonyms stored locally (in a real app, persist to DB)
  const [customSynonyms, setCustomSynonyms] = useState<SynonymEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("ai_training_synonyms") || "[]"); } catch { return []; }
  });

  // New entry form
  const [newCanonical, setNewCanonical] = useState("");
  const [newSynonymsRaw, setNewSynonymsRaw] = useState("");
  const [newContext, setNewContext] = useState<"movement" | "emma_cash" | "both">("movement");

  const handleAuth = () => {
    if (password === ACCESS_PASSWORD) {
      setAuthed(true);
    } else {
      toast({ title: "Неверный пароль", variant: "destructive" });
    }
  };

  const addCustomSynonym = () => {
    if (!newCanonical.trim() || !newSynonymsRaw.trim()) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    const synonyms = newSynonymsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (synonyms.length === 0) {
      toast({ title: "Добавьте хотя бы один синоним", variant: "destructive" });
      return;
    }
    const entry: SynonymEntry = {
      id: Date.now().toString(),
      canonical: newCanonical.trim(),
      synonyms,
      context: newContext,
    };
    const updated = [...customSynonyms, entry];
    setCustomSynonyms(updated);
    localStorage.setItem("ai_training_synonyms", JSON.stringify(updated));
    setNewCanonical("");
    setNewSynonymsRaw("");
    toast({ title: "✅ Синоним добавлен" });
  };

  const deleteCustomSynonym = (id: string) => {
    const updated = customSynonyms.filter(s => s.id !== id);
    setCustomSynonyms(updated);
    localStorage.setItem("ai_training_synonyms", JSON.stringify(updated));
    toast({ title: "Синоним удалён" });
  };

  const generatePromptForCopy = () => {
    const allCustom = customSynonyms;
    const lines: string[] = ["// === Пользовательские синонимы (добавить в smart-voice-input/index.ts) ==="];
    lines.push("");

    const movementCustom = allCustom.filter(s => s.context !== "emma_cash");
    const cashCustom = allCustom.filter(s => s.context !== "movement");

    if (movementCustom.length > 0) {
      lines.push("// LOCATION_MAP дополнения:");
      movementCustom.forEach(e => {
        e.synonyms.forEach(s => {
          lines.push(`  "${s}": "${e.canonical}",`);
        });
      });
    }
    if (cashCustom.length > 0) {
      lines.push("");
      lines.push("// Касса — синонимы для системного промпта:");
      cashCustom.forEach(e => {
        lines.push(`  // ${e.canonical}: ${e.synonyms.join(", ")}`);
      });
    }
    return lines.join("\n");
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "linear-gradient(145deg, hsl(35 40% 97%) 0%, hsl(40 30% 94%) 50%, hsl(30 25% 96%) 100%)" }}>
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-3">
              <Brain className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold">Тренировка ИИ</h1>
            <p className="text-sm text-muted-foreground mt-1">Введите пароль для доступа</p>
          </div>
          <Input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAuth(); }}
            autoFocus
          />
          <Button className="w-full" onClick={handleAuth}>Войти</Button>
          <button onClick={() => navigate(-1)} className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors">
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const sections = [
    { id: "locations" as const, label: "📍 Локации", entries: BUILTIN_LOCATION_SYNONYMS },
    { id: "items" as const, label: "🛏️ Бельё", entries: BUILTIN_ITEM_SYNONYMS },
    { id: "cash" as const, label: "💰 Касса", entries: BUILTIN_CASH_SYNONYMS },
    { id: "custom" as const, label: "✏️ Мои", entries: customSynonyms },
  ];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(145deg, hsl(35 40% 97%) 0%, hsl(40 30% 94%) 50%, hsl(30 25% 96%) 100%)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="font-bold">Тренировка голосового ИИ</h1>
          </div>
          <p className="text-xs text-muted-foreground">Синонимы и соответствия для распознавания</p>
        </div>
        <button
          onClick={async () => {
            const text = generatePromptForCopy();
            await navigator.clipboard.writeText(text);
            toast({ title: "Код скопирован в буфер", description: "Вставьте в smart-voice-input/index.ts" });
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
        >
          <Save className="h-3.5 w-3.5" /> Экспорт
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Info banner */}
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-3 text-sm">
          <p className="font-semibold text-amber-800 mb-1">🧠 Как это работает</p>
          <p className="text-amber-700 text-xs">
            Когда вы говорите голосом — ИИ использует эти синонимы для сопоставления с системными значениями.
            Добавляйте свои варианты произношения — ИИ научится их понимать.
            Нажмите «Экспорт» чтобы скопировать код для добавления в edge function.
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={cn("flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors",
                activeSection === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}>
              {s.label}
              {s.id === "custom" && customSynonyms.length > 0 && (
                <span className="ml-1.5 text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded-full">{customSynonyms.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Current section entries */}
        <div className="space-y-2">
          {activeSection !== "custom" && sections.find(s => s.id === activeSection)?.entries.map(entry => (
            <SynonymCard key={entry.id} entry={entry} isBuiltin />
          ))}

          {activeSection === "custom" && (
            <>
              {/* Add new */}
              <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <p className="font-semibold text-sm flex items-center gap-2"><Plus className="h-4 w-4" /> Добавить синоним</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-xs">Системное значение (canonical)</Label>
                    <Input
                      placeholder='например: "piral_1" или "Марьяна"'
                      value={newCanonical}
                      onChange={e => setNewCanonical(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Синонимы (через запятую)</Label>
                    <Textarea
                      placeholder='например: "первый, пираль, oasis, оазис первый"'
                      value={newSynonymsRaw}
                      onChange={e => setNewSynonymsRaw(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Контекст</Label>
                    <div className="flex gap-2 mt-1">
                      {(["movement", "emma_cash", "both"] as const).map(c => (
                        <button key={c} type="button"
                          onClick={() => setNewContext(c)}
                          className={cn("flex-1 px-2 py-1.5 rounded-lg border text-xs transition-colors",
                            newContext === c ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}>
                          {CONTEXT_LABELS[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={addCustomSynonym}>
                  <Plus className="h-4 w-4 mr-1" /> Добавить
                </Button>
              </div>

              {customSynonyms.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Нет пользовательских синонимов</p>
                  <p className="text-sm mt-1 text-muted-foreground/60">Добавьте свои варианты произношения</p>
                </div>
              )}

              {customSynonyms.map(entry => (
                <SynonymCard key={entry.id} entry={entry} onDelete={deleteCustomSynonym} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
