import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const emmaChatId = Deno.env.get("EMMA_TELEGRAM_CHAT_ID")!;

    // Get all unconfirmed payments for done cleanings
    const { data: unpaid } = await supabase
      .from("cleaning_assignments")
      .select("id, apartment, cleaning_date, cleaner_name, payment_amount, schedule_id")
      .eq("status", "done")
      .eq("payment_confirmed", false)
      .order("cleaning_date", { ascending: true });

    if (!unpaid || unpaid.length === 0) {
      // Send "all clear" message
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: emmaChatId,
          text: "✅ Все выплаты уборщицам подтверждены! Долгов нет.",
          parse_mode: "Markdown",
        }),
      });
      return new Response(JSON.stringify({ status: "no_unpaid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aptNames: Record<string, string> = {
      piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор",
    };

    // Group by cleaner
    const byCleanerMap = new Map<string, typeof unpaid>();
    for (const a of unpaid) {
      const name = a.cleaner_name || "Не указано";
      if (!byCleanerMap.has(name)) byCleanerMap.set(name, []);
      byCleanerMap.get(name)!.push(a);
    }

    const totalAmount = unpaid.reduce((s, a) => s + Number(a.payment_amount ?? 35), 0);

    let text = `💰 *Еженедельный отчёт — невыплаченные*\n\n`;
    text += `Всего: *${unpaid.length}* уборок на сумму *${totalAmount}€*\n\n`;

    for (const [name, items] of byCleanerMap) {
      const sum = items.reduce((s, a) => s + Number(a.payment_amount ?? 35), 0);
      text += `👤 *${name}* — ${items.length} уб. = ${sum}€\n`;
      for (const a of items) {
        const fmtD = a.cleaning_date.split("-");
        text += `  • ${fmtD[2]}.${fmtD[1]} ${aptNames[a.apartment] ?? a.apartment} (${a.payment_amount ?? 35}€)\n`;
      }
      text += `\n`;
    }

    text += `\nДля подтверждения выплат откройте приложение → Финансы → Лог выплат`;

    // Send message to Emma
    const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: emmaChatId,
        text,
        parse_mode: "Markdown",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: "✅ Подтвердить все", callback_data: `confirm_all_payments` },
              { text: "📋 По одной", callback_data: `confirm_payments_list` },
            ],
          ],
        }),
      }),
    });

    const result = await resp.json();

    return new Response(JSON.stringify({ status: "sent", unpaid_count: unpaid.length, total: totalAmount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
