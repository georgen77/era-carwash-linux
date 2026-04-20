import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import InventoryActions from "./InventoryActions";
import PurchaseInventoryActions from "./PurchaseInventoryActions";
import { itemPrices } from "@/lib/utils";

interface InventoryItem {
  location: string;
  item_type: string;
  quantity: number;
}

interface InventoryGridProps {
  inventory: InventoryItem[];
  isLoading: boolean;
  onUpdate: () => void;
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

export default function InventoryGrid({ inventory, isLoading, onUpdate }: InventoryGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group inventory by location
  const inventoryByLocation = inventory.reduce((acc, item) => {
    if (!acc[item.location]) {
      acc[item.location] = [];
    }
    acc[item.location].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Add locations with zero inventory
  Object.keys(locationNames).forEach((location) => {
    if (!inventoryByLocation[location]) {
      inventoryByLocation[location] = [];
    }
  });

  // Fixed order of locations
  const locationOrder = [
    'piral_1',
    'piral_2',
    'dirty_linen_piral',
    'clean_linen_piral',
    'salvador',
    'dirty_linen_salvador',
    'clean_linen_salvador',
    'albert_laundry',
    'damaged',
    'purchase'
  ];

  const sortedLocations = Object.entries(inventoryByLocation).sort(([locA], [locB]) => {
    const indexA = locationOrder.indexOf(locA);
    const indexB = locationOrder.indexOf(locB);
    return indexA - indexB;
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sortedLocations.map(([location, items]) => {
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalValue = items.reduce((sum, item) => sum + (item.quantity * (itemPrices[item.item_type] || 0)), 0);
        
        return (
          <Card key={location} className="transition-shadow hover:shadow-lg bg-[hsl(var(--card)/0.6)] backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">
                {locationNames[location]}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Всего предметов: {totalItems}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.keys(itemTypeNames).map((itemType) => {
                  const item = items.find((i) => i.item_type === itemType);
                  const quantity = item?.quantity || 0;
                  const price = itemPrices[itemType] || 0;
                  const value = quantity * price;
                  
                  return (
                    <div
                      key={itemType}
                      className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {itemTypeNames[itemType]}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${quantity === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                          {quantity}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {value}€
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-right">
                  Итого на сумму: <span className="font-semibold">{totalValue}€</span>
                </p>
              </div>
              {location === 'purchase' ? (
                <PurchaseInventoryActions onSuccess={onUpdate} />
              ) : (
                <InventoryActions
                  location={location}
                  locationLabel={locationNames[location]}
                  onSuccess={onUpdate}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
