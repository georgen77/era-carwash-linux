require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const SYSTEM_PROMPT = `Ты распознаёшь рукописные записки уборщиц испанских апартаментов.
Записки могут быть двух типов:

ТИП 1 — ПЕРЕМЕЩЕНИЕ БЕЛЬЯ:
Содержит название апартамента и список предметов с количеством.
Предметы: Простыни, Пододеяльники, Наволочки, Большие полотенца, Маленькие полотенца, Кухонное полотенце, Коврик, Подстилка пляж, Наматрасник.
Правила маппинга:
- Оазис 1, Пераль 1 → from: "piral_1", to: "dirty_linen_piral"
- Оазис 2, Пераль 2 → from: "piral_2", to: "dirty_linen_piral"
- Гранде, Grande → from: "grande", to: "dirty_linen_piral"
- Сальвадор, Salvador → from: "salvador", to: "dirty_linen_salvador"

Маппинг предметов:
- Простыни → sheets
- Пододеяльники → duvet_covers
- Наволочки → pillowcases
- Большие полотенца → large_towels
- Маленькие полотенца → small_towels
- Кухонное полотенце → kitchen_towels
- Коврик → rugs
- Подстилка пляж → beach_mat
- Наматрасник → mattress_pad

ТИП 2 — РАСХОД НА КЛИНИНГ:
Содержит слово "расход" или имя уборщицы + апартамент + иногда сумму.
Уборщицы: Марьяна, Ира, Вика, Оля (и другие имена).
Правила:
- Апартамент Гранде → сумма по умолчанию 70
- Все остальные апартаменты → сумма по умолчанию 35
- Контрагент = имя уборщицы из записки
- Категория всегда = "Оплата клининга"

Верни ТОЛЬКО валидный JSON без markdown.
Для перемещения:
{"type":"movement","from_location":"piral_1","to_location":"dirty_linen_piral","items":{"sheets":0,"duvet_covers":0,"pillowcases":0,"large_towels":0,"small_towels":0,"kitchen_towels":0,"rugs":0,"beach_mat":0,"mattress_pad":0},"notes":""}
Для расхода:
{"type":"expense","contractor":"имя","apartment":"название апартамента","amount":35,"category":"Оплата клининга","notes":""}`;

router.post("/scan-linen", async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const lovableApiKey = process.env.LOVABLE_API_KEY;

    const { action, imageBase64, data: saveData, userId } = req.body;

    // ── action: recognize ─────────────────────────────────────────────────────
    if (action === "recognize") {
      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imageBase64 } },
                { type: "text", text: SYSTEM_PROMPT },
              ],
            },
          ],
          max_tokens: 1000,
          temperature: 0,
        }),
      });

      if (!aiResponse.ok) {
        const err = await aiResponse.text();
        throw new Error(`AI API error: ${aiResponse.status} — ${err}`);
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content || "";

      // Strip markdown fences and parse JSON
      let cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.search(/[\{\[]/);
      if (start > -1) cleaned = cleaned.substring(start);
      const end = cleaned.lastIndexOf(cleaned[start] === "{" ? "}" : "]");
      if (end > -1) cleaned = cleaned.substring(0, end + 1);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = JSON.parse(cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, " "));
      }

      return res.json({ success: true, data: parsed });
    }

    // ── action: save_movement ─────────────────────────────────────────────────
    if (action === "save_movement") {
      const { from_location, to_location, items, notes } = saveData;

      const itemsJson = {};
      for (const [key, val] of Object.entries(items)) {
        if (Number(val) > 0) itemsJson[key] = Number(val);
      }

      const { data: pending, error } = await supabase.from("pending_movements").insert({
        from_location,
        to_location,
        items: itemsJson,
        notes: notes || null,
        source: "photo_scan",
        confirmed: false,
      }).select().single();

      if (error) throw error;

      const irinaId = process.env.IRINA_TELEGRAM_CHAT_ID;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (irinaId && botToken) {
        const aptNames = {
          piral_1: "Oasis 1", piral_2: "Oasis 2", grande: "Oasis Grande", salvador: "Salvador",
          dirty_linen_piral: "Пераль грязное", dirty_linen_salvador: "Сальвадор грязное",
        };
        const itemLabels = {
          sheets: "Простыни", duvet_covers: "Пододеяльники", pillowcases: "Наволочки",
          large_towels: "Бол. полотенца", small_towels: "Мал. полотенца",
          kitchen_towels: "Кух. полотенце", rugs: "Коврик", beach_mat: "Подстилка", mattress_pad: "Наматрасник",
        };
        const itemLines = Object.entries(itemsJson)
          .map(([k, v]) => `  • ${itemLabels[k] || k}: ${v}`)
          .join("\n");
        const msg = `📸 *Скан записки — перемещение белья*\n\n` +
          `Откуда: *${aptNames[from_location] || from_location}*\n` +
          `Куда: *${aptNames[to_location] || to_location}*\n\n` +
          `${itemLines}\n\n` +
          `${notes ? `📝 ${notes}\n\n` : ""}` +
          `_Ожидает подтверждения_`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: irinaId, text: msg, parse_mode: "Markdown" }),
        });
      }

      return res.json({ success: true, id: pending.id });
    }

    // ── action: save_expense ──────────────────────────────────────────────────
    if (action === "save_expense") {
      const { contractor, apartment, amount, category, notes } = saveData;
      if (!userId) throw new Error("userId required");

      const { data: tx, error } = await supabase.from("emma_transactions").insert({
        transaction_type: "expense",
        amount: Number(amount),
        description: `${category}: ${apartment}`,
        payment_source: "emma_cash",
        counterparty: contractor,
        location: apartment,
        transaction_date: new Date().toISOString(),
        created_by: userId,
      }).select().single();

      if (error) throw error;

      const irinaId = process.env.IRINA_TELEGRAM_CHAT_ID;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (irinaId && botToken) {
        const msg = `📸 *Скан записки — расход*\n\n` +
          `💸 Сумма: *${amount}€*\n` +
          `👤 Уборщица: *${contractor}*\n` +
          `🏠 Апартамент: *${apartment}*\n` +
          `📂 Категория: ${category}\n` +
          `${notes ? `📝 ${notes}` : ""}`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: irinaId, text: msg, parse_mode: "Markdown" }),
        });
      }

      return res.json({ success: true, id: tx.id });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[scan-linen] error:", msg);
    return res.status(500).json({ error: msg });
  }
});

module.exports = router;
