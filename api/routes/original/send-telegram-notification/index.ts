import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ITEM_LABELS: Record<string, string> = {
  sheets: "Простыни",
  duvet_covers: "Пододеяльники",
  pillowcases: "Наволочки",
  large_towels: "Большие полотенца",
  small_towels: "Маленькие полотенца",
  kitchen_towels: "Кухонные полотенца",
  rugs: "Коврики",
  beach_mat: "Пляжная подстилка",
  mattress_pad: "Наматрасник",
};

const LOCATION_LABELS: Record<string, string> = {
  piral_1: "Оазис 1",
  piral_2: "Оазис 2",
  salvador: "Сальвадор",
  dirty_linen_piral: "Оазис (грязное)",
  dirty_linen_salvador: "Сальвадор (грязное)",
  clean_linen_piral: "Оазис (кладовка)",
  clean_linen_salvador: "Сальвадор (шкаф)",
  albert_laundry: "Прачечная Альберт",
  damaged: "Испорченное",
  purchase: "Закупка",
};

async function sendTelegramMessage(chatId: string, text: string, botToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return resp.json();
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildLinenMessage(prefix: string | null, eventData: Record<string, unknown>): string {
  const movement = eventData.movement as Record<string, unknown> | undefined;
  if (!movement) return "❌ Нет данных о перемещении";

  const from = LOCATION_LABELS[movement.from_location as string] || movement.from_location as string;
  const to = LOCATION_LABELS[movement.to_location as string] || movement.to_location as string;
  const items = (movement.items as Array<{ item_type: string; quantity: number }>) || [];
  const now = formatDateTime(new Date());

  let msg = prefix ? `${prefix}\n\n` : "";
  msg += `🛏 <b>Перемещение белья</b> — ${now}\n\n`;
  msg += `📍 ${from} → ${to}\n`;

  if (items.length > 0) {
    msg += "\n📋 Бельё:\n";
    items.forEach((item) => {
      const label = ITEM_LABELS[item.item_type] || item.item_type;
      msg += `• ${label}: ${item.quantity}\n`;
    });
  }

  const inventoryFrom = eventData.inventory_from as Record<string, number> | undefined;
  const inventoryTo = eventData.inventory_to as Record<string, number> | undefined;

  if (inventoryFrom && Object.keys(inventoryFrom).length > 0) {
    msg += `\n📊 Остатки <b>${from}</b> после:\n`;
    Object.entries(inventoryFrom).forEach(([k, v]) => {
      if (v > 0) msg += `• ${ITEM_LABELS[k] || k}: ${v}\n`;
    });
  }

  if (inventoryTo && Object.keys(inventoryTo).length > 0) {
    msg += `\n📊 Остатки <b>${to}</b>:\n`;
    Object.entries(inventoryTo).forEach(([k, v]) => {
      const qty = v as number;
      const delta = items.find((i) => i.item_type === k)?.quantity || 0;
      if (qty > 0) msg += `• ${ITEM_LABELS[k] || k}: ${delta > 0 ? `+${delta} (всего ${qty})` : qty}\n`;
    });
  }

  return msg.trim();
}

function buildCashMessage(prefix: string | null, eventData: Record<string, unknown>): string {
  const now = formatDateTime(new Date());
  let msg = prefix ? `${prefix}\n\n` : "";
  msg += `💰 <b>Состояние касс</b> — ${now}\n\n`;

  const balances = eventData.balances as Record<string, number> | undefined;
  if (balances) {
    if (balances.emma !== undefined) {
      msg += `📦 Касса Эммочка: ${balances.emma >= 0 ? "+" : ""}${balances.emma.toFixed(2)}€\n`;
    }
    if (balances.main !== undefined) {
      msg += `📦 Касса Основная: ${balances.main >= 0 ? "+" : ""}${balances.main.toFixed(2)}€\n`;
    }
  }

  const lastTx = eventData.last_transaction as Record<string, unknown> | undefined;
  if (lastTx) {
    msg += `\n🔄 <b>Последняя операция:</b>\n`;
    const type = lastTx.transaction_type === "income" ? "Приход" : "Расход";
    const amount = Number(lastTx.amount);
    const sign = lastTx.transaction_type === "income" ? "+" : "-";
    msg += `${type} • ${sign}${amount.toFixed(2)}€`;
    if (lastTx.counterparty) msg += ` • ${lastTx.counterparty}`;
    msg += `\n`;
    if (lastTx.description) msg += `${lastTx.description}\n`;
    if (lastTx.transaction_date) {
      msg += formatDateTime(new Date(lastTx.transaction_date as string)) + "\n";
    }
  }

  return msg.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Try TELEGRAM_BOT_TOKEN first, fall back to TELEGRAM_LINEN_BOT_TOKEN
  const TELEGRAM_BOT_TOKEN =
    Deno.env.get("TELEGRAM_BOT_TOKEN") ||
    Deno.env.get("TELEGRAM_LINEN_BOT_TOKEN");

  if (!TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "No Telegram bot token configured (set TELEGRAM_BOT_TOKEN)" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { rule_id, trigger_page, event_data, bot_token } = body as {
      rule_id?: string;
      trigger_page: string;
      event_data: Record<string, unknown>;
      bot_token?: string;
    };

    // Allow caller to pass a specific bot_token override
    const effectiveToken = bot_token || TELEGRAM_BOT_TOKEN;

    // Load rules — either specific or all matching
    let query = supabase.from("telegram_notification_rules").select("*");
    if (rule_id) {
      query = query.eq("id", rule_id);
    } else {
      query = query.eq("trigger_page", trigger_page).eq("auto_send", true);
    }

    const { data: rules, error: rulesError } = await query;
    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No matching rules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const rule of rules) {
      try {
        // Each rule can override the token via stored bot_token field (if any)
        const ruleToken = (rule as any).bot_token || effectiveToken;

        let text = "";
        if (rule.trigger_page === "бельё") {
          text = buildLinenMessage(rule.custom_prefix || null, event_data);
        } else if (rule.trigger_page === "кассы") {
          text = buildCashMessage(rule.custom_prefix || null, event_data);
        } else {
          text = (rule.custom_prefix ? rule.custom_prefix + "\n\n" : "") +
            JSON.stringify(event_data, null, 2);
        }

        const tgResult = await sendTelegramMessage(rule.recipient, text, ruleToken);
        results.push({ rule_id: rule.id, success: tgResult.ok, message_id: tgResult.result?.message_id, tg_error: tgResult.description });
      } catch (e) {
        results.push({ rule_id: rule.id, success: false, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, sent: results.filter(r => r.success).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
