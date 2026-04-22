import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, ChevronLeft, Save, X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { isAuthenticated } from "@/lib/api";
import { useApp } from "@/lib/i18n";
import FloatingAiButton from "@/components/FloatingAiButton";
import { format } from "date-fns";

interface PromptEntry {
  id: string;
  question: string;
  description: string | null;
  data_source: string | null;
  example_answer: string | null;
  category: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORIES = [
  { value: "revenue", label: "Выручка" },
  { value: "cashless", label: "Безнал" },
  { value: "forecast", label: "Прогноз" },
  { value: "expenses", label: "Расходы" },
  { value: "technical", label: "Терминалы" },
  { value: "general", label: "Общее" },
];

const CATEGORY_COLORS: Record<string, string> = {
  revenue: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cashless: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  forecast: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  expenses: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  technical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const emptyForm = {
  question: "",
  description: "",
  data_source: "",
  example_answer: "",
  category: "general",
  active: true,
  sort_order: 0,
};

export default function AiPromptJournal() {
  const navigate = useNavigate();
  const { lang } = useApp();
  const [entries, setEntries] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) { navigate("/login"); return; }
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_prompt_journal")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setEntries((data as PromptEntry[]) || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (entry: PromptEntry) => {
    setEditId(entry.id);
    setForm({
      question: entry.question,
      description: entry.description || "",
      data_source: entry.data_source || "",
      example_answer: entry.example_answer || "",
      category: entry.category || "general",
      active: entry.active,
      sort_order: entry.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.question.trim()) return;
    setSaving(true);
    const payload = {
      question: form.question.trim(),
      description: form.description.trim() || null,
      data_source: form.data_source.trim() || null,
      example_answer: form.example_answer.trim() || null,
      category: form.category,
      active: form.active,
      sort_order: form.sort_order,
    };
    if (editId) {
      await supabase.from("ai_prompt_journal").update(payload).eq("id", editId);
    } else {
      await supabase.from("ai_prompt_journal").insert(payload);
    }
    setSaving(false);
    setDialogOpen(false);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить запись?")) return;
    await supabase.from("ai_prompt_journal").delete().eq("id", id);
    fetchEntries();
  };

  const filtered = entries.filter(e => {
    const matchCat = filterCategory === "all" || e.category === filterCategory;
    const matchSearch = !search || e.question.toLowerCase().includes(search.toLowerCase()) || (e.description || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" />
            Назад
          </Button>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Журнал вопросов AI</h1>
          </div>
          <Button className="ml-auto gap-1.5" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Добавить вопрос
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm max-w-xs"
          />
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={filterCategory === "all" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilterCategory("all")}
            >
              Все
            </Button>
            {CATEGORIES.map(c => (
              <Button
                key={c.value}
                variant={filterCategory === c.value ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilterCategory(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Entries */}
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            {entries.length === 0 ? "Нет записей. Добавьте первый вопрос для AI." : "Ничего не найдено"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => (
              <Card key={entry.id} className={`${!entry.active ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs px-1.5 py-0 ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.general}`} variant="outline">
                          {CATEGORIES.find(c => c.value === entry.category)?.label || entry.category}
                        </Badge>
                        {!entry.active && <Badge variant="outline" className="text-xs">Неактивен</Badge>}
                      </div>
                      <CardTitle className="text-sm font-medium leading-tight">{entry.question}</CardTitle>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {(entry.description || entry.data_source || entry.example_answer) && (
                  <CardContent className="px-4 pb-4 space-y-2">
                    {entry.description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Описание / как отвечать:</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{entry.description}</p>
                      </div>
                    )}
                    {entry.data_source && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Источник данных:</p>
                        <p className="text-xs text-foreground">{entry.data_source}</p>
                      </div>
                    )}
                    {entry.example_answer && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Пример ответа:</p>
                        <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">{entry.example_answer}</p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать вопрос" : "Новый вопрос для AI"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Вопрос *</label>
              <Input
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Например: Какой прогноз выручки на конец месяца?"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Категория</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Как AI должен отвечать</label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Опишите логику ответа, какие данные использовать, формат..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Источник данных</label>
              <Input
                value={form.data_source}
                onChange={e => setForm(f => ({ ...f, data_source: e.target.value }))}
                placeholder="Например: таблица expenses / fullSummary report / аналитика"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Пример ответа</label>
              <Textarea
                value={form.example_answer}
                onChange={e => setForm(f => ({ ...f, example_answer: e.target.value }))}
                placeholder="Как должен выглядеть идеальный ответ..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Порядок сортировки:</label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                className="h-8 w-20 text-sm"
              />
              <label className="flex items-center gap-1.5 ml-4 text-xs cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Активен
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.question.trim()} className="gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="gap-1.5">
                <X className="h-4 w-4" />
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <FloatingAiButton dateFrom={format(new Date(), "yyyy-MM-dd")} dateTo={format(new Date(), "yyyy-MM-dd")} />
    </div>
  );
}
