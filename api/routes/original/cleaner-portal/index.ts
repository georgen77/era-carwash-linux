import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const telegramId = url.searchParams.get("telegram_id");

    if (!telegramId) {
      return new Response(JSON.stringify({ error: "telegram_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().split("T")[0];

    // Get all assignments for this cleaner
    const { data: assignments, error: aErr } = await supabase
      .from("cleaning_assignments")
      .select("*")
      .eq("cleaner_telegram_id", telegramId)
      .order("cleaning_date", { ascending: false });

    if (aErr) throw aErr;

    // Split into upcoming and past
    const upcoming = (assignments ?? []).filter(
      (a: any) => a.cleaning_date >= today && a.status !== "done" && a.status !== "cancelled"
    );
    const past = (assignments ?? []).filter(
      (a: any) => a.cleaning_date < today || a.status === "done"
    );

    // Payment summary
    const totalEarned = past
      .filter((a: any) => a.payment_confirmed)
      .reduce((sum: number, a: any) => sum + Number(a.payment_amount ?? 0), 0);

    const pendingPayment = past
      .filter((a: any) => a.status === "done" && !a.payment_confirmed)
      .reduce((sum: number, a: any) => sum + Number(a.payment_amount ?? 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        cleaner_name: assignments?.[0]?.cleaner_name ?? null,
        upcoming,
        past: past.slice(0, 20),
        summary: {
          total_shifts: assignments?.length ?? 0,
          total_earned: totalEarned,
          pending_payment: pendingPayment,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
