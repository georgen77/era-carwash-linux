require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const APT_NAMES = { piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор" };

async function runReminder() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const emmaChatId = process.env.EMMA_CHAT_ID;

  const { data: unpaid } = await supabase
    .from("cleaning_assignments")
    .select("id, apartment, cleaning_date, cleaner_name, payment_amount, schedule_id")
    .eq("status", "done")
    .eq("payment_confirmed", false)
    .order("cleaning_date", { ascending: true });

  if (!unpaid || unpaid.length === 0) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: emmaChatId, text: "✅ Все выплаты уборщицам подтверждены! Долгов нет.", parse_mode: "Markdown" }),
    });
    return { status: "no_unpaid" };
  }

  const byCleanerMap = new Map();
  for (const a of unpaid) {
    const name = a.cleaner_name || "Не указано";
    if (!byCleanerMap.has(name)) byCleanerMap.set(name, []);
    byCleanerMap.get(name).push(a);
  }

  const totalAmount = unpaid.reduce((s, a) => s + Number(a.payment_amount ?? 35), 0);
  let text = `💰 *Еженедельный отчёт — невыплаченные*\n\nВсего: *${unpaid.length}* уборок на сумму *${totalAmount}€*\n\n`;

  for (const [name, items] of byCleanerMap) {
    const sum = items.reduce((s, a) => s + Number(a.payment_amount ?? 35), 0);
    text += `👤 *${name}* — ${items.length} уб. = ${sum}€\n`;
    for (const a of items) {
      const fmtD = a.cleaning_date.split("-");
      text += `  • ${fmtD[2]}.${fmtD[1]} ${APT_NAMES[a.apartment] ?? a.apartment} (${a.payment_amount ?? 35}€)\n`;
    }
    text += "\n";
  }
  text += "\nДля подтверждения выплат откройте приложение → Финансы → Лог выплат";

  await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: emmaChatId, text, parse_mode: "Markdown" }),
  });

  return { status: "sent", unpaid_count: unpaid.length, total: totalAmount };
}

router.post("/weekly-payment-reminder", async (req, res) => {
  try {
    const result = await runReminder();
    res.json(result);
  } catch (error) {
    console.error("[weekly-payment-reminder] error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.runReminder = runReminder;
