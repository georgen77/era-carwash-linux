import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invoke } from "@/lib/invoke";

const apartmentNames = {
  salvador: "Сальвадор",
  oasis_1: "Оазис 1",
  oasis_2: "Оазис 2",
  oasis_grande: "Оазис Гранде",
};

const paymentSources = {
  emma_cash: "Касса Эммы",
  emma_card: "Карта Эммы",
  emma_bank: "Банк Эммы",
};

const formSchema = z.object({
  apartment: z.enum(["salvador", "oasis_1", "oasis_2", "oasis_grande"], {
    required_error: "Выберите апартамент",
  }),
  check_in_date: z.date({
    required_error: "Укажите дату заезда",
  }),
  check_out_date: z.date({
    required_error: "Укажите дату выезда",
  }),
  guest_name: z.string().optional(),
  guest_count: z.coerce.number().min(1, "Минимум 1 гость").max(20, "Максимум 20 гостей"),
  cleaner_id: z.string().optional().nullable(),
  payment_source: z.enum(["emma_cash", "emma_card", "emma_bank"], {
    required_error: "Выберите кассу",
  }),
}).refine((data) => data.check_out_date > data.check_in_date, {
  message: "Дата выезда должна быть позже даты заезда",
  path: ["check_out_date"],
});

interface BookingFormProps {
  currentUserId: string;
  cleaners: Array<{ id: string; full_name: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function BookingForm({ currentUserId, cleaners, onSuccess, onCancel }: BookingFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guest_count: 1,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const bookingData = {
        apartment: values.apartment,
        check_in_date: format(values.check_in_date, 'yyyy-MM-dd'),
        check_out_date: format(values.check_out_date, 'yyyy-MM-dd'),
        guest_name: values.guest_name || null,
        guest_count: values.guest_count,
        cleaner_id: (values.cleaner_id && values.cleaner_id !== 'unassigned') ? values.cleaner_id : null,
        created_by: currentUserId,
      };

      const cleaningData = (values.cleaner_id && values.cleaner_id !== 'unassigned')
        ? {
            apartment: values.apartment,
            cleaning_type: 'regular',
            cleaning_date: format(values.check_out_date, 'yyyy-MM-dd'),
            cleaner_id: values.cleaner_id,
            status: 'planned',
            amount: 35,
            payment_source: values.payment_source,
            created_by: currentUserId,
          }
        : null;

      const { data, error } = await invoke('cleaning-bookings', {
        body: {
          action: 'create',
          userId: currentUserId,
          bookingData,
          cleaningData,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Бронирование создано",
        description: "Бронирование успешно добавлено в систему",
      });

      form.reset();
      onSuccess();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать бронирование",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="apartment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Апартамент *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите апартамент" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(apartmentNames).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="guest_count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Количество гостей *</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="20" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="check_in_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Дата заезда *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "dd.MM.yyyy") : <span>Выберите дату</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="check_out_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Дата выезда *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, "dd.MM.yyyy") : <span>Выберите дату</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="guest_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Имя гостя</FormLabel>
                <FormControl>
                  <Input placeholder="Необязательно" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cleaner_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Сотрудник (уборщица)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите позже" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="unassigned">Не назначен</SelectItem>
                    {cleaners.map((cleaner) => (
                      <SelectItem key={cleaner.id} value={cleaner.id}>
                        {cleaner.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payment_source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Касса для оплаты *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите кассу" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(paymentSources).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
