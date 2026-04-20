import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Movement {
  id: string;
  from_location: string;
  to_location: string;
  item_type: string;
  quantity: number;
  created_at: string;
  notes: string | null;
}

interface MovementReportProps {
  movements: Movement[];
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
  beach_mat: "Подстилка пляж",
  mattress_pad: "Наматрасник",
};

export default function MovementReport({ movements }: MovementReportProps) {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [selectedFromLocations, setSelectedFromLocations] = useState<string[]>([]);
  const [selectedToLocations, setSelectedToLocations] = useState<string[]>([]);
  
  // Applied filters (used in report calculation)
  const [appliedDateFrom, setAppliedDateFrom] = useState<Date>(subDays(new Date(), 7));
  const [appliedDateTo, setAppliedDateTo] = useState<Date>(new Date());
  const [appliedFromLocations, setAppliedFromLocations] = useState<string[]>([]);
  const [appliedToLocations, setAppliedToLocations] = useState<string[]>([]);

  const quickPeriods = [
    { label: "1 день", days: 1 },
    { label: "7 дней", days: 7 },
    { label: "10 дней", days: 10 },
    { label: "30 дней", days: 30 },
  ];

  const handleQuickPeriod = (days: number) => {
    setDateTo(new Date());
    setDateFrom(subDays(new Date(), days));
  };

  const toggleFromLocation = (location: string) => {
    setSelectedFromLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : [...prev, location]
    );
  };

  const toggleToLocation = (location: string) => {
    setSelectedToLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : [...prev, location]
    );
  };

  const applyFilters = () => {
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setAppliedFromLocations(selectedFromLocations);
    setAppliedToLocations(selectedToLocations);
  };

  const reportData = useMemo(() => {
    const filtered = movements.filter((m) => {
      const movementDate = new Date(m.created_at);
      const isInDateRange = movementDate >= appliedDateFrom && movementDate <= appliedDateTo;
      
      // Location filtering logic:
      // - If both filters selected: show only movements matching both (AND)
      // - If only one filter selected: show all movements from/to that location
      // - If no filters selected: show all movements
      let locationMatch = true;
      
      if (appliedFromLocations.length > 0 && appliedToLocations.length > 0) {
        // Both selected - require both to match
        locationMatch = appliedFromLocations.includes(m.from_location) && 
                        appliedToLocations.includes(m.to_location);
      } else if (appliedFromLocations.length > 0) {
        // Only "from" selected - show all movements involving these locations
        locationMatch = appliedFromLocations.includes(m.from_location) || 
                        appliedFromLocations.includes(m.to_location);
      } else if (appliedToLocations.length > 0) {
        // Only "to" selected - show all movements involving these locations
        locationMatch = appliedToLocations.includes(m.from_location) || 
                        appliedToLocations.includes(m.to_location);
      }

      return isInDateRange && locationMatch;
    });

    // Group by item type
    const byItemType: Record<string, number> = {};
    filtered.forEach((m) => {
      byItemType[m.item_type] = (byItemType[m.item_type] || 0) + m.quantity;
    });

    // Group by from location
    const byFromLocation: Record<string, Record<string, number>> = {};
    filtered.forEach((m) => {
      if (!byFromLocation[m.from_location]) {
        byFromLocation[m.from_location] = {};
      }
      byFromLocation[m.from_location][m.item_type] = 
        (byFromLocation[m.from_location][m.item_type] || 0) + m.quantity;
    });

    // Group by to location
    const byToLocation: Record<string, Record<string, number>> = {};
    filtered.forEach((m) => {
      if (!byToLocation[m.to_location]) {
        byToLocation[m.to_location] = {};
      }
      byToLocation[m.to_location][m.item_type] = 
        (byToLocation[m.to_location][m.item_type] || 0) + m.quantity;
    });

    return { byItemType, byFromLocation, byToLocation, totalMovements: filtered.length };
  }, [movements, appliedDateFrom, appliedDateTo, appliedFromLocations, appliedToLocations]);

  return (
    <Card className="bg-[hsl(var(--card)/0.65)] backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Отчёт по перемещениям
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick period buttons */}
        <div>
          <Label className="mb-2 block">Быстрый выбор периода</Label>
          <div className="flex flex-wrap gap-2">
            {quickPeriods.map((period) => (
              <Button
                key={period.days}
                variant="outline"
                size="sm"
                onClick={() => handleQuickPeriod(period.days)}
              >
                {period.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Date range selection */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Дата от</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd MMM yyyy", { locale: ru }) : "Выберите дату"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(date) => date && setDateFrom(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Дата до</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd MMM yyyy", { locale: ru }) : "Выберите дату"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(date) => date && setDateTo(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Location filters */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Откуда (группировка)</Label>
            <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
              {Object.entries(locationNames).map(([value, label]) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`from-${value}`}
                    checked={selectedFromLocations.includes(value)}
                    onCheckedChange={() => toggleFromLocation(value)}
                  />
                  <label
                    htmlFor={`from-${value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Куда (группировка)</Label>
            <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
              {Object.entries(locationNames).map(([value, label]) => (
                <div key={value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`to-${value}`}
                    checked={selectedToLocations.includes(value)}
                    onCheckedChange={() => toggleToLocation(value)}
                  />
                  <label
                    htmlFor={`to-${value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Apply filters button */}
        <div className="flex gap-2">
          <Button onClick={applyFilters} className="flex-1">
            Обновить отчёт
          </Button>
          {(selectedFromLocations.length > 0 || selectedToLocations.length > 0) && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFromLocations([]);
                setSelectedToLocations([]);
              }}
            >
              Сбросить выбор
            </Button>
          )}
        </div>

        {/* Report results */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Результаты</h3>
            <p className="text-sm text-muted-foreground">
              Всего перемещений: {reportData.totalMovements}
            </p>
          </div>

          {/* Summary by item type */}
          <div>
            <h4 className="text-sm font-medium mb-2">По типам белья</h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(reportData.byItemType).map(([itemType, quantity]) => (
                <div
                  key={itemType}
                  className="rounded-lg border bg-secondary/30 p-3 flex justify-between items-center"
                >
                  <span className="text-sm font-medium">{itemTypeNames[itemType]}</span>
                  <span className="text-lg font-bold text-primary">{quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* From locations breakdown */}
          {Object.keys(reportData.byFromLocation).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Откуда перемещено</h4>
              <div className="space-y-3">
                {Object.entries(reportData.byFromLocation).map(([location, items]) => (
                  <div key={location} className="rounded-lg border p-3">
                    <h5 className="font-semibold mb-2">{locationNames[location]}</h5>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(items).map(([itemType, quantity]) => (
                        <div key={itemType} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{itemTypeNames[itemType]}</span>
                          <span className="font-semibold">{quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* To locations breakdown */}
          {Object.keys(reportData.byToLocation).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Куда перемещено</h4>
              <div className="space-y-3">
                {Object.entries(reportData.byToLocation).map(([location, items]) => (
                  <div key={location} className="rounded-lg border p-3">
                    <h5 className="font-semibold mb-2">{locationNames[location]}</h5>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(items).map(([itemType, quantity]) => (
                        <div key={itemType} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{itemTypeNames[itemType]}</span>
                          <span className="font-semibold">{quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
