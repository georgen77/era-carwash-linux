import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/invoke";

interface LogEntry {
  id: string;
  transaction_id: string;
  action: string;
  changed_by: string;
  changed_at: string;
  old_data: any;
  new_data: any;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: "Создание", color: "hsl(142 71% 35%)" },
  update: { label: "Редактирование", color: "hsl(40 90% 45%)" },
  delete: { label: "Удаление", color: "hsl(0 72% 45%)" },
  delete_restored: { label: "Удалено (восстановлено)", color: "hsl(220 70% 55%)" },
  restore: { label: "Восстановление", color: "hsl(220 70% 55%)" },
};

export default function EmmaCashLog({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data } = await invoke("emma-cash", {
      body: { action: "list_log", userId: currentUserId },
    });
    if (data?.logs) setLogs(data.logs);
    setIsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [currentUserId]);

  const handleRestore = async (log: LogEntry) => {
    if (!window.confirm("Восстановить эту транзакцию?")) return;
    setRestoringId(log.id);
    try {
      const { data, error } = await invoke("emma-cash", {
        body: { action: "restore", userId: currentUserId, logId: log.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Транзакция восстановлена" });
      fetchLogs();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setRestoringId(null);
    }
  };

  const formatData = (data: any) => {
    if (!data) return "—";
    const parts = [];
    if (data.transaction_type) parts.push(data.transaction_type === "income" ? "Приход" : "Расход");
    if (data.amount != null) parts.push(`${Number(data.amount).toFixed(2)}€`);
    if (data.description) parts.push(data.description);
    if (data.counterparty) parts.push(`(${data.counterparty})`);
    return parts.join(" · ") || "—";
  };

  const formatDate = (data: any, field: string) => {
    if (!data?.[field]) return "—";
    try {
      return format(new Date(data[field]), "dd.MM.yyyy HH:mm", { locale: ru });
    } catch { return "—"; }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Полный журнал всех изменений транзакций. Удалённые записи можно восстановить.
      </p>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Загрузка...</p>
      ) : logs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Журнал пуст</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Действие</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Дата записи</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Дата транзакции</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Данные</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Изменение</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "hsl(220 10% 50%)" };
                const isDeletedAndNotRestored = log.action === "delete";
                const isRestored = log.action === "delete_restored";

                return (
                  <tr key={log.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: actionInfo.color, background: actionInfo.color + "18" }}>
                        {actionInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(log.changed_at), "dd.MM.yy HH:mm", { locale: ru })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(log.old_data || log.new_data, "transaction_date")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={formatData(log.new_data || log.old_data)}>
                      {formatData(log.new_data || log.old_data)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[180px]">
                      {log.action === "update" && log.old_data && log.new_data ? (
                        <span>
                          <span className="line-through opacity-60">{Number(log.old_data.amount).toFixed(2)}€</span>
                          {" → "}
                          <span className="font-medium">{Number(log.new_data.amount).toFixed(2)}€</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {isDeletedAndNotRestored ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                          disabled={restoringId === log.id}
                          onClick={() => handleRestore(log)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Восстановить
                        </Button>
                      ) : isRestored ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          className="h-7 text-xs gap-1 text-muted-foreground cursor-default opacity-60"
                        >
                          <Check className="h-3 w-3" />
                          Восстановлено
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
