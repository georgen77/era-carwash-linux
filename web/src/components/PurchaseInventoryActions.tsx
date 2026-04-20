import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RotateCcw, Plus, Upload, X, CalendarIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface PurchaseInventoryActionsProps {
  onSuccess: () => void;
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

export default function PurchaseInventoryActions({ onSuccess }: PurchaseInventoryActionsProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [purchaseDate, setPurchaseDate] = useState<Date>();

  const handleReset = async () => {
    setIsSubmitting(true);
    try {
      const movements = Object.entries(itemTypeNames).map(([itemType]) => ({
        from_location: 'purchase' as any,
        to_location: 'damaged' as any,
        item_type: itemType as any,
        quantity: 9999,
        notes: 'Обнуление склада закупки',
      }));

      const { error } = await supabase
        .from('movements')
        .insert(movements);

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Склад закупки обнулен",
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error resetting purchase:', error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обнулить склад",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + receiptFiles.length > 5) {
      toast({
        title: "Слишком много файлов",
        description: "Максимум 5 фотографий",
        variant: "destructive",
      });
      return;
    }
    setReceiptFiles([...receiptFiles, ...files]);
  };

  const removeFile = (index: number) => {
    setReceiptFiles(receiptFiles.filter((_, i) => i !== index));
  };

  const handleSetQuantities = async () => {
    if (Object.keys(quantities).length === 0) {
      toast({
        title: "Ошибка",
        description: "Укажите хотя бы одно количество",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload receipt images if any
      const receiptUrls: string[] = [];
      for (const file of receiptFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `purchase-receipts/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);

        receiptUrls.push(urlData.publicUrl);
      }

      // Create movements for each item type with quantity > 0
      const dateNote = purchaseDate ? `Дата закупки: ${format(purchaseDate, 'dd.MM.yyyy')}` : '';
      const fullNotes = [dateNote, notes].filter(Boolean).join(' | ') || 'Установка количества закупки';
      
      const movements = Object.entries(quantities)
        .filter(([_, qty]) => qty > 0)
        .map(([itemType, quantity]) => ({
          from_location: 'damaged' as any,
          to_location: 'purchase' as any,
          item_type: itemType as any,
          quantity,
          notes: fullNotes,
          receipt_url: receiptUrls.length > 0 ? receiptUrls.join(',') : null,
        }));

      if (movements.length === 0) {
        toast({
          title: "Ошибка",
          description: "Укажите количество больше 0",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('movements')
        .insert(movements);

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Количество установлено",
      });

      setIsDialogOpen(false);
      setQuantities({});
      setNotes("");
      setReceiptFiles([]);
      setPurchaseDate(undefined);
      onSuccess();
    } catch (error: any) {
      console.error('Error setting quantities:', error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось установить количество",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 flex gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Обнулить
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Обнулить склад закупки?</AlertDialogTitle>
            <AlertDialogDescription>
              Все предметы на складе закупки будут перемещены в "Испорченное/украденное".
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обнулить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex-1">
            <Plus className="h-4 w-4 mr-2" />
            Установить
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Установить количество на складе закупки</DialogTitle>
            <DialogDescription>
              Укажите количество для каждого типа товара
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(itemTypeNames).map(([itemType, label]) => (
                <div key={itemType}>
                  <Label htmlFor={itemType}>{label}</Label>
                  <Input
                    id={itemType}
                    type="number"
                    min="0"
                    value={quantities[itemType] || ""}
                    onChange={(e) => setQuantities({
                      ...quantities,
                      [itemType]: parseInt(e.target.value) || 0
                    })}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <div>
              <Label>Дата закупки</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !purchaseDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {purchaseDate ? format(purchaseDate, "dd.MM.yyyy") : <span>Выберите дату</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={purchaseDate}
                    onSelect={setPurchaseDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="notes">Комментарий</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Дополнительная информация..."
                rows={3}
              />
            </div>

            <div>
              <Label>Фото чеков (максимум 5)</Label>
              <div className="space-y-2">
                {receiptFiles.length < 5 && (
                  <div className="relative">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                    <Upload className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
                
                {receiptFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {receiptFiles.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Receipt ${index + 1}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setQuantities({});
                  setNotes("");
                  setReceiptFiles([]);
                  setPurchaseDate(undefined);
                }}
              >
                Отмена
              </Button>
              <Button onClick={handleSetQuantities} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
