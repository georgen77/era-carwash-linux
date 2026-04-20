import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowRight, Loader2, ChevronDown, Edit2, Check, X, CalendarIcon, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Movement {
  id: string;
  from_location: string;
  to_location: string;
  item_type: string;
  quantity: number;
  created_at: string;
  notes: string | null;
  laundry_item_cost?: number | null;
  delivery_cost?: number | null;
  large_stain_count?: number | null;
  small_stain_count?: number | null;
  large_stain_cost?: number | null;
  small_stain_cost?: number | null;
  manual_adjustment?: number | null;
  total_laundry_cost?: number | null;
}

// Grouped movement — multiple items moved at the same time from→to
interface GroupedMovement {
  key: string;
  from_location: string;
  to_location: string;
  created_at: string;
  notes: string | null;
  items: { item_type: string; quantity: number }[];
  // Laundry details (if from albert_laundry)
  laundry?: {
    id: string;
    laundry_item_cost?: number | null;
    delivery_cost?: number | null;
    large_stain_count?: number | null;
    small_stain_count?: number | null;
    large_stain_cost?: number | null;
    small_stain_cost?: number | null;
    manual_adjustment?: number | null;
    total_laundry_cost?: number | null;
  };
}

interface MovementHistoryProps {
  movements: Movement[];
  isLoading: boolean;
  onMovementDeleted?: () => void;
}

const locationNames: Record<string, string> = {
  piral_1: "Пераль 1",
  piral_2: "Пераль 2",
  salvador: "Сальвадор",
  dirty_linen_piral: "Пераль грязное бельё",
  dirty_linen_salvador: "Сальвадор грязное бельё",
  clean_linen_piral: "Пераль кладовка",
  clean_linen_salvador: "Сальвадор шкаф",
  albert_laundry: "Прачечная Альберт",
  purchase: "Закупка",
  damaged: "Испорченное/украденное",
};

const itemTypeNames: Record<string, string> = {
  sheets: "Простыни",
  duvet_covers: "Пододеяльники",
  pillowcases: "Наволочки",
  large_towels: "Большие полотенца",
  small_towels: "Маленькие полотенца",
  kitchen_towels: "Кухонное полотенце",
  rugs: "Коврик",
  beach_mat: "Пляжный коврик",
  mattress_pad: "Наматрасник",
};

/** Group movements that share the same from→to and were created within 5 minutes */
function groupMovements(movements: Movement[]): GroupedMovement[] {
  const groups: GroupedMovement[] = [];
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  for (const mv of movements) {
    const mvTime = new Date(mv.created_at).getTime();
    // Find existing group with same from→to within time window
    const existing = groups.find(g =>
      g.from_location === mv.from_location &&
      g.to_location === mv.to_location &&
      Math.abs(new Date(g.created_at).getTime() - mvTime) <= WINDOW_MS
    );
    if (existing) {
      existing.items.push({ item_type: mv.item_type, quantity: mv.quantity });
      // Merge notes
      if (mv.notes && !existing.notes) existing.notes = mv.notes;
    } else {
      const group: GroupedMovement = {
        key: mv.id,
        from_location: mv.from_location,
        to_location: mv.to_location,
        created_at: mv.created_at,
        notes: mv.notes,
        items: [{ item_type: mv.item_type, quantity: mv.quantity }],
      };
      // Attach laundry info if applicable
      if (mv.from_location === 'albert_laundry' && mv.total_laundry_cost != null) {
        group.laundry = {
          id: mv.id,
          laundry_item_cost: mv.laundry_item_cost,
          delivery_cost: mv.delivery_cost,
          large_stain_count: mv.large_stain_count,
          small_stain_count: mv.small_stain_count,
          large_stain_cost: mv.large_stain_cost,
          small_stain_cost: mv.small_stain_cost,
          manual_adjustment: mv.manual_adjustment,
          total_laundry_cost: mv.total_laundry_cost,
        };
      }
      groups.push(group);
    }
  }
  return groups;
}

export default function MovementHistory({ movements, isLoading, onMovementDeleted }: MovementHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterToLocation, setFilterToLocation] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const handleEditClick = (movementId: string, currentValue: number) => {
    setEditingId(movementId);
    setEditValue(currentValue);
  };

  const handleSave = async (movementId: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('movements')
        .update({ manual_adjustment: editValue })
        .eq('id', movementId);
      if (error) throw error;
      toast.success('Корректировка обновлена');
      setEditingId(null);
      window.location.reload();
    } catch (error) {
      console.error('Error updating adjustment:', error);
      toast.error('Ошибка при обновлении');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue(0);
  };

  const handleDelete = async (movementId: string) => {
    setDeletingId(movementId);
    try {
      const { error } = await supabase
        .from('movements')
        .delete()
        .eq('id', movementId);
      if (error) throw error;
      toast.success('Перемещение удалено');
      onMovementDeleted?.();
    } catch (error) {
      console.error('Error deleting movement:', error);
      toast.error('Ошибка при удалении');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter first, then group
  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      if (filterDate) {
        const movementDate = new Date(movement.created_at);
        const filterDateStart = new Date(filterDate);
        filterDateStart.setHours(0, 0, 0, 0);
        const filterDateEnd = new Date(filterDate);
        filterDateEnd.setHours(23, 59, 59, 999);
        if (movementDate < filterDateStart || movementDate > filterDateEnd) return false;
      }
      if (filterToLocation !== "all" && movement.to_location !== filterToLocation) return false;
      return true;
    });
  }, [movements, filterDate, filterToLocation]);

  const groupedMovements = useMemo(() => groupMovements(filteredMovements), [filteredMovements]);

  const resetFilters = () => {
    setFilterDate(undefined);
    setFilterToLocation("all");
  };

  return (
    <Card className="bg-[hsl(var(--card)/0.65)] backdrop-blur-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>История перемещений</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4" />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Дата</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filterDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterDate ? format(filterDate, "dd MMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Склад назначения</label>
                <Select value={filterToLocation} onValueChange={setFilterToLocation}>
                  <SelectTrigger><SelectValue placeholder="Все склады" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все склады</SelectItem>
                    {Object.entries(locationNames).map(([key, name]) => (
                      <SelectItem key={key} value={key}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={resetFilters} className="whitespace-nowrap">Сбросить</Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : groupedMovements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {movements.length === 0 ? "Нет записей о перемещениях" : "Нет перемещений, соответствующих фильтрам"}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground mb-2">
                  Показано записей: {groupedMovements.length} (из {movements.length} строк)
                </div>
                {groupedMovements.map((group) => (
                  <div key={group.key} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                    {/* Header: from → to + date */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-semibold text-sm">{locationNames[group.from_location] || group.from_location}</span>
                        <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-semibold text-sm">{locationNames[group.to_location] || group.to_location}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(group.created_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                        </span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition" title="Удалить">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить перемещение?</AlertDialogTitle>
                              <AlertDialogDescription>Остатки будут пересчитаны.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(group.key)}
                                disabled={deletingId === group.key}
                              >
                                {deletingId === group.key ? "Удаление..." : "Удалить"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Items list */}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {group.items.map((item, idx) => (
                        <span key={idx} className="text-sm">
                          <span className="text-muted-foreground">{itemTypeNames[item.item_type] || item.item_type}</span>
                          <span className="font-bold text-foreground ml-1">× {item.quantity}</span>
                        </span>
                      ))}
                    </div>

                    {group.notes && (
                      <p className="mt-2 text-sm text-muted-foreground">{group.notes}</p>
                    )}

                    {/* Laundry details */}
                    {group.laundry && group.laundry.total_laundry_cost != null && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-2">
                        <div className="text-sm font-medium">Прачечная Альберт</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Стоимость стирки: {group.laundry.laundry_item_cost?.toFixed(2)} EUR</div>
                          <div>Доставка: {group.laundry.delivery_cost?.toFixed(2)} EUR</div>
                          {(group.laundry.large_stain_count ?? 0) > 0 && (
                            <div>Большие пятна: {group.laundry.large_stain_count} × 3 EUR = {group.laundry.large_stain_cost?.toFixed(2)} EUR</div>
                          )}
                          {(group.laundry.small_stain_count ?? 0) > 0 && (
                            <div>Малые пятна: {group.laundry.small_stain_count} × 1.5 EUR = {group.laundry.small_stain_cost?.toFixed(2)} EUR</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t">
                          <span className="text-xs">Ручная корректировка:</span>
                          {editingId === group.laundry.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number" step="0.01" value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                className="h-7 w-24 text-xs" disabled={isSaving}
                              />
                              <Button size="sm" variant="ghost" onClick={() => handleSave(group.laundry!.id)} disabled={isSaving} className="h-7 px-2">
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-7 px-2">
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{group.laundry.manual_adjustment?.toFixed(2) ?? '0.00'} EUR</span>
                              <Button size="sm" variant="ghost" onClick={() => handleEditClick(group.laundry!.id, group.laundry!.manual_adjustment ?? 0)} className="h-6 px-2">
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="text-sm font-bold pt-2 border-t">
                          Итого: {group.laundry.total_laundry_cost?.toFixed(2)} EUR
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
