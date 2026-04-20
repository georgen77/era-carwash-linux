import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw, PlusCircle } from "lucide-react";

interface InventoryActionsProps {
  location: string;
  locationLabel: string;
  onSuccess: () => void;
}

const itemTypeOptions = [
  { value: "sheets", label: "Простыни" },
  { value: "duvet_covers", label: "Пододеяльники" },
  { value: "pillowcases", label: "Наволочки" },
  { value: "large_towels", label: "Большие полотенца" },
  { value: "small_towels", label: "Маленькие полотенца" },
  { value: "kitchen_towels", label: "Кухонное полотенце" },
  { value: "rugs", label: "Коврик" },
  { value: "beach_mat", label: "Подстилка пляж" },
  { value: "mattress_pad", label: "Наматрасник" },
];

export default function InventoryActions({ location, locationLabel, onSuccess }: InventoryActionsProps) {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showSetDialog, setShowSetDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentInventory, setCurrentInventory] = useState<Record<string, number>>({});
  const [newQuantities, setNewQuantities] = useState<Record<string, string>>({
    sheets: "",
    duvet_covers: "",
    pillowcases: "",
    large_towels: "",
    small_towels: "",
    kitchen_towels: "",
    rugs: "",
    beach_mat: "",
    mattress_pad: "",
  });

  const loadCurrentInventory = async () => {
    try {
      const { data: movements, error } = await supabase
        .from('movements')
        .select('*')
        .or(`from_location.eq.${location},to_location.eq.${location}`);

      if (error) throw error;

      const inventory: Record<string, number> = {};
      movements?.forEach(movement => {
        if (!inventory[movement.item_type]) {
          inventory[movement.item_type] = 0;
        }
        if (movement.to_location === location) {
          inventory[movement.item_type] += movement.quantity;
        } else if (movement.from_location === location) {
          inventory[movement.item_type] -= movement.quantity;
        }
      });

      setCurrentInventory(inventory);
      
      // Set newQuantities to current inventory values
      const quantities: Record<string, string> = {};
      itemTypeOptions.forEach(option => {
        quantities[option.value] = String(inventory[option.value] || 0);
      });
      setNewQuantities(quantities);
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error("Ошибка при загрузке остатков");
    }
  };

  const handleReset = async () => {
    setIsProcessing(true);

    try {
      // Get current inventory
      const { data: movements, error: fetchError } = await supabase
        .from('movements')
        .select('*')
        .or(`from_location.eq.${location},to_location.eq.${location}`);

      if (fetchError) throw fetchError;

      // Calculate current quantities per item type
      const currentInventory: Record<string, number> = {};
      movements?.forEach(movement => {
        if (!currentInventory[movement.item_type]) {
          currentInventory[movement.item_type] = 0;
        }
        if (movement.to_location === location) {
          currentInventory[movement.item_type] += movement.quantity;
        } else if (movement.from_location === location) {
          currentInventory[movement.item_type] -= movement.quantity;
        }
      });

      // Create movements to zero out each item type
      const targetLocation = location === 'damaged' ? 'purchase' : 'damaged';
      const resetMovements = Object.entries(currentInventory)
        .filter(([_, qty]) => qty > 0)
        .map(([itemType, qty]) => ({
          from_location: location as any,
          to_location: targetLocation as any,
          item_type: itemType as any,
          quantity: qty,
          notes: 'Обнуление остатков'
        }));

      if (resetMovements.length > 0) {
        const { error: insertError } = await supabase
          .from('movements')
          .insert(resetMovements);

        if (insertError) throw insertError;
      }

      toast.success(`Остатки склада "${locationLabel}" обнулены`);
      onSuccess();
    } catch (error) {
      console.error('Error resetting inventory:', error);
      toast.error("Ошибка при обнулении остатков");
    } finally {
      setIsProcessing(false);
      setShowResetDialog(false);
    }
  };

  const handleSetNew = async () => {
    setIsProcessing(true);

    try {
      const movementsToCreate = [];

      for (const [itemType, qtyString] of Object.entries(newQuantities)) {
        const newQty = qtyString
          .split(/[;,]/)
          .map((v) => parseInt(v.trim()) || 0)
          .reduce((acc, val) => acc + val, 0);
        
        const currentQty = currentInventory[itemType] || 0;
        const difference = newQty - currentQty;

        if (difference > 0) {
          // Need to add items
          movementsToCreate.push({
            from_location: 'purchase' as any,
            to_location: location as any,
            item_type: itemType as any,
            quantity: difference,
            notes: 'Установка остатков'
          });
        } else if (difference < 0) {
          // Need to remove items
          const targetLocation = location === 'damaged' ? 'purchase' : 'damaged';
          movementsToCreate.push({
            from_location: location as any,
            to_location: targetLocation as any,
            item_type: itemType as any,
            quantity: Math.abs(difference),
            notes: 'Установка остатков'
          });
        }
      }

      if (movementsToCreate.length > 0) {
        const { error } = await supabase.from('movements').insert(movementsToCreate);
        if (error) throw error;
      }

      toast.success(`Остатки склада "${locationLabel}" обновлены`);
      onSuccess();
    } catch (error) {
      console.error('Error setting new inventory:', error);
      toast.error("Ошибка при установке остатков");
    } finally {
      setIsProcessing(false);
      setShowSetDialog(false);
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowResetDialog(true)}
        className="flex-1"
      >
        <RotateCcw className="h-4 w-4 mr-1" />
        Обнулить
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          loadCurrentInventory();
          setShowSetDialog(true);
        }}
        className="flex-1"
      >
        <PlusCircle className="h-4 w-4 mr-1" />
        Установить
      </Button>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите обнуление</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите обнулить все остатки на складе "{locationLabel}"? 
              Это действие переместит все предметы в "{location === 'damaged' ? 'Закупка' : 'Испорченное/украденное'}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={isProcessing}>
              {isProcessing ? "Обнуление..." : "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSetDialog} onOpenChange={setShowSetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Установить остатки для "{locationLabel}"</DialogTitle>
            <DialogDescription>
              Укажите количество каждого типа белья для добавления на склад
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {itemTypeOptions.map((option) => {
              const rawValue = newQuantities[option.value];
              const sum = rawValue
                ? rawValue
                    .split(/[;,]/)
                    .map((v) => parseInt(v.trim()) || 0)
                    .reduce((acc, val) => acc + val, 0)
                : 0;

              return (
                <div key={option.value} className="flex items-center gap-3">
                  <Label htmlFor={`new-${option.value}`} className="flex-1">
                    {option.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`new-${option.value}`}
                      type="text"
                      value={newQuantities[option.value]}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^[\d;,\s]+$/.test(value)) {
                          setNewQuantities({ ...newQuantities, [option.value]: value });
                        }
                      }}
                      placeholder="1;2;3"
                      className="w-32"
                    />
                    {rawValue && /[;,]/.test(rawValue) && (
                      <span className="text-sm font-medium text-primary min-w-[2rem]">
                        = {sum}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetDialog(false)} disabled={isProcessing}>
              Отмена
            </Button>
            <Button onClick={handleSetNew} disabled={isProcessing}>
              {isProcessing ? "Добавление..." : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
