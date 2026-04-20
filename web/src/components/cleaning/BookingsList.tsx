import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Users, Home, User, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
import { invoke } from "@/lib/invoke";
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Booking {
  id: string;
  apartment: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string | null;
  guest_count: number;
  cleaner_id: string | null;
  created_at: string;
  cleaning_users: {
    full_name: string;
  } | null;
}

interface BookingsListProps {
  currentUserId: string;
  isAdmin: boolean;
  refreshTrigger: number;
}

const apartmentNames: Record<string, string> = {
  salvador: "Сальвадор",
  oasis_1: "Оазис 1",
  oasis_2: "Оазис 2",
  oasis_grande: "Оазис Гранде",
};

export default function BookingsList({ currentUserId, isAdmin, refreshTrigger }: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchBookings = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          cleaning_users:cleaner_id (
            full_name
          )
        `)
        .order('check_in_date', { ascending: true });

      if (error) throw error;
      setBookings(data || []);
    } catch (error: any) {
      console.error('Error fetching bookings:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить бронирования",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [refreshTrigger]);

  const handleDelete = async (bookingId: string) => {
    try {
      const { data, error } = await invoke('cleaning-bookings', {
        body: {
          action: 'delete',
          userId: currentUserId,
          bookingId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Успешно",
        description: "Бронирование удалено",
      });

      fetchBookings();
    } catch (error: any) {
      console.error('Error deleting booking:', error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить бронирование",
        variant: "destructive",
      });
    }
  };

  const calculateLinenNeeds = (guestCount: number) => {
    const linenSets = Math.ceil(guestCount / 2);
    return {
      sheets: linenSets,
      duvetCovers: linenSets,
      pillowcases: linenSets * 2,
      largeTowels: guestCount,
      smallTowels: guestCount,
      kitchenTowels: 1,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">
            Пока нет бронирований
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking, index) => {
        // Determine guest count for linen (from next booking or default 4)
        const nextBookingOnSameApartment = bookings.find(
          (b, i) => i > index && b.apartment === booking.apartment
        );
        const guestsForLinen = nextBookingOnSameApartment
          ? nextBookingOnSameApartment.guest_count
          : 4;
        
        const linenNeeds = calculateLinenNeeds(guestsForLinen);

        return (
          <Card key={booking.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {apartmentNames[booking.apartment]}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(booking.check_in_date), "dd MMM", { locale: ru })} -{" "}
                      {format(new Date(booking.check_out_date), "dd MMM yyyy", { locale: ru })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {booking.guest_count} {booking.guest_count === 1 ? "гость" : "гостей"}
                    </span>
                  </CardDescription>
                </div>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить бронирование?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Это действие нельзя отменить. Бронирование будет удалено навсегда.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(booking.id)}>
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {booking.guest_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Гость:</span>
                  <span>{booking.guest_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Уборщица:</span>
                {booking.cleaning_users ? (
                  <Badge variant="outline">{booking.cleaning_users.full_name}</Badge>
                ) : (
                  <Badge variant="secondary">Не назначена</Badge>
                )}
              </div>

              <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                <p className="text-sm font-medium">
                  Постельное бельё для {guestsForLinen} {guestsForLinen === 1 ? "гостя" : "гостей"}:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div>Простыни: <span className="font-bold">{linenNeeds.sheets}</span></div>
                  <div>Пододеяльники: <span className="font-bold">{linenNeeds.duvetCovers}</span></div>
                  <div>Наволочки: <span className="font-bold">{linenNeeds.pillowcases}</span></div>
                  <div>Большие полотенца: <span className="font-bold">{linenNeeds.largeTowels}</span></div>
                  <div>Маленькие полотенца: <span className="font-bold">{linenNeeds.smallTowels}</span></div>
                  <div>Кухонные полотенца: <span className="font-bold">{linenNeeds.kitchenTowels}</span></div>
                </div>
                {nextBookingOnSameApartment && (
                  <p className="text-xs text-muted-foreground italic">
                    * Количество рассчитано для следующего бронирования ({nextBookingOnSameApartment.guest_count} гостей)
                  </p>
                )}
                {!nextBookingOnSameApartment && (
                  <p className="text-xs text-muted-foreground italic">
                    * По умолчанию стелим на 4 гостей (нет следующего бронирования)
                  </p>
                )}
              </div>

              <div className="pt-2 border-t">
                <p className="text-sm">
                  <span className="font-medium">Оплата уборки:</span>{" "}
                  <span className="text-lg font-bold text-primary">35€</span>
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
