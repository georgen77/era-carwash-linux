require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const ITEM_LABELS = {
  sheets: "Простыни", duvet_covers: "Пододеяльники", pillowcases: "Наволочки",
  large_towels: "Большие полотенца", small_towels: "Маленькие полотенца",
  kitchen_towels: "Кухонные полотенца", rugs: "Коврики",
  beach_mat: "Пляжная подстилка", mattress_pad: "Наматрасник",
};
const LOCATION_LABELS = {
  piral_1: "Оазис 1", piral_2: "Оазис 2", salvador: "Сальвадор",
  dirty_linen_piral: "Оазис (грязное)", dirty_linen_salvador: "Сальвадор (грязное)",
  clean_linen_piral: "Оазис (кладовка)", clean_linen_salvador: "Сальвадор (шкаф)",
  albert_laundry: "Прачечная Альберт", damaged: "Испорченное", purchase: "Закупка",
};

function formatDateTime(date) {
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function sendTelegramMessage(chatId, text, botToken) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return resp.json();
}

function buildLinenMessage(prefix, eventData) {
  const movement = eventData.movement;
  if (!movement) return "❌ Нет данных о перемещении";
  const from = LOCATION_LABELS[movement.from_location] || movement.from_location;
  const to = LOCATION_LABELS[movement.to_location] || movement.to_location;
  const items = movement.items || [];
  const now = formatDateTime(new Date());
  let msg = prefix ? `${prefix}\n\n` : "";
  msg += `🛏 <b>Перемещение белья</b> — ${now}\n\n📍 ${from} → ${to}\n`;
  if (items.length > 0) {
    msg += "\n📋 Бельё:\n";
    items.forEach(item => { msg += `• ${ITEM_LABELS[item.item_type] || item.item_type}: ${item.quantity}\n`; });
  }
  const invFrom = eventData.inventory_from;
  const invTo = eventData.inventory_to;
  if (invFrom && Object.keys(invFrom).length > 0) {
    msg += `\n📊 Остатки <b>${from}</b> после:\n`;
    Object.entries(invFrom).forEach(([k, v]) => { if (v > 0) msg += `• ${ITEM_LABELS[k] || k}: ${v}\n`; });
  }
  if (invTo && Object.keys(invTo).length > 0) {
    msg += `\n📊 Остатки <b>${to}</b>:\n`;
    Object.entries(invTo).forEach(([k, v]) => {
      const delta = items.find(i => i.item_type === k)?.quantity || 0;
      if (v > 0) msg += `• ${ITEM_LABELS[k] || k}: ${delta > 0 ? `+${delta} (всего ${v})` : v}\n`;
    });
  }
  return msg.trim();
}

function buildCashMessage(prefix, eventData) {
  const now = formatDateTime(new Date());
  let msg = prefix ? `${prefix}\n\n` : "";
  msg += `💰 <b>Состояние касс</b> — ${now}\n\n`;
  const balances = eventData.balances;
  if (balances) {
    if (balances.emma !== undefined) msg += `📦 Касса Эммочка: ${balances.emma >= 0 ? "+" : ""}${balances.emma.toFixed(2)}€\n`;
    if (balances.main !== undefined) msg += `📦 Касса Основная: ${balances.main >= 0 ? "+" : ""}${balances.main.toFixed(2)}€\n`;
  }
  const lastTx = eventData.last_transaction;
  if (lastTx) {
    const type = lastTx.transaction_type === "income" ? "Приход" : "Расход";
    const amount = Number(lastTx.amount);
    const sign = lastTx.transaction_type === "income" ? "+" : "-";
    msg += `\n🔄 <b>Последняя операция:</b>\n${type} • ${sign}${amount.toFixed(2)}€`;
    if (lastTx.counterparty) msg += ` • ${lastTx.counterparty}`;
    msg += "\n";
    if (lastTx.description) msg += `${lastTx.description}\n`;
    if (lastTx.transaction_date) msg += formatDateTime(new Date(lastTx.transaction_date)) + "\n";
  }
  return msg.trim();
}

router.post("/send-telegram-notification", async (req, res) => {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_LINEN_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) return res.status(500).json({ error: "No Telegram bot token configured" });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { rule_id, trigger_page, event_data, bot_token } = req.body;
    const effectiveToken = bot_token || TELEGRAM_BOT_TOKEN;

    let query = supabase.from("telegram_notification_rules").select("*");
    if (rule_id) {
      query = query.eq("id", rule_id);
    } else {
      query = query.eq("trigger_page", trigger_page).eq("auto_send", true);
    }

    const { data: rules, error: rulesError } = await query;
    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) return res.json({ success: true, sent: 0, message: "No matching rules" });

    const results = [];
    for (const rule of rules) {
      try {
        const ruleToken = rule.bot_token || effectiveToken;
        let text = "";
        if (rule.trigger_page === "бельё") {
          text = buildLinenMessage(rule.custom_prefix || null, event_data);
        } else if (rule.trigger_page === "кассы") {
          text = buildCashMessage(rule.custom_prefix || null, event_data);
        } else {
          text = (rule.custom_prefix ? rule.custom_prefix + "\n\n" : "") + JSON.stringify(event_data, null, 2);
        }
        const tgResult = await sendTelegramMessage(rule.recipient, text, ruleToken);
        results.push({ rule_id: rule.id, success: tgResult.ok, message_id: tgResult.result?.message_id, tg_error: tgResult.description });
      } catch (e) {
        results.push({ rule_id: rule.id, success: false, error: e.message });
      }
    }

    res.json({ success: true, sent: results.filter(r => r.success).length, results });
  } catch (error) {
    console.error("[send-telegram-notification] error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
