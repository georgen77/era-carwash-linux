import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { itemPrices } from "@/lib/utils";

interface InventoryItem {
  location: string;
  item_type: string;
  quantity: number;
}

interface TotalInventorySummaryProps {
  inventory: InventoryItem[];
  isLoading: boolean;
}

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

export default function TotalInventorySummary({ inventory, isLoading }: TotalInventorySummaryProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate totals excluding 'purchase' and 'damaged' locations
  const totalsByItemType: Record<string, number> = {};
  
  inventory.forEach((item) => {
    // Exclude purchase and damaged/stolen
    if (item.location === 'purchase' || item.location === 'damaged') {
      return;
    }
    
    if (!totalsByItemType[item.item_type]) {
      totalsByItemType[item.item_type] = 0;
    }
    totalsByItemType[item.item_type] += item.quantity;
  });

  const grandTotal = Object.values(totalsByItemType).reduce((sum, qty) => sum + qty, 0);
  const totalValue = Object.entries(totalsByItemType).reduce((sum, [itemType, qty]) => {
    return sum + (qty * (itemPrices[itemType] || 0));
  }, 0);

  return (
    <Card className="transition-shadow hover:shadow-lg bg-primary/5 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold text-primary">
          Общий остаток на всех складах
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Всего предметов: <span className="font-bold text-lg text-primary">{grandTotal}</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.keys(itemTypeNames).map((itemType) => {
            const quantity = totalsByItemType[itemType] || 0;
            const price = itemPrices[itemType] || 0;
            const value = quantity * price;
            
            return (
              <div
                key={itemType}
                className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-3 border border-border/50"
              >
                <span className="text-sm font-medium">
                  {itemTypeNames[itemType]}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${quantity === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
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
        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-right">
            Итого на сумму: <span className="font-semibold text-primary">{totalValue}€</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
