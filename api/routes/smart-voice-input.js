require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/smart-voice-input", async (req, res) => {
  try {
    const { transcription, context } = req.body;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let tools = [];
    let toolChoice;

    if (context === "movement") {
      systemPrompt = `Ты помощник для учёта перемещения белья. Из голосового сообщения пользователя извлеки данные перемещения.

Локации: пераль 1 (oasis 1), пераль 2 (oasis 2), сальвадор (era deluxe), грязное бельё пераль, грязное бельё сальвадор, кладовка пераль (чистое бельё), шкаф сальвадор (чистое бельё), прачечная альберт, закупка, испорченное.

Типы белья: простыни (sheets), пододеяльники (duvet_covers), наволочки (pillowcases), большие полотенца (large_towels), маленькие полотенца (small_towels), кухонное полотенце (kitchen_towels), коврик (rugs), подстилка пляж (beach_mat), наматрасник (mattress_pad).

Извлеки: откуда (from_location), куда (to_location), массив предметов [{item_type, quantity}], заметки (notes).
Используй системные значения (на английском) для location и item_type.`;

      tools = [{
        type: "function",
        function: {
          name: "fill_movement",
          description: "Fill movement form with extracted data",
          parameters: {
            type: "object",
            properties: {
              from_location: { type: "string", enum: ["piral_1","piral_2","salvador","dirty_linen_piral","dirty_linen_salvador","clean_linen_piral","clean_linen_salvador","albert_laundry","purchase","damaged"] },
              to_location: { type: "string", enum: ["piral_1","piral_2","salvador","dirty_linen_piral","dirty_linen_salvador","clean_linen_piral","clean_linen_salvador","albert_laundry","purchase","damaged"] },
              items: { type: "array", items: { type: "object", properties: { item_type: { type: "string", enum: ["sheets","duvet_covers","pillowcases","large_towels","small_towels","kitchen_towels","rugs","beach_mat","mattress_pad"] }, quantity: { type: "number" } }, required: ["item_type","quantity"] } },
              notes: { type: "string" }
            },
            required: ["from_location","to_location","items"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "fill_movement" } };

    } else if (context === "emma_cash") {
      systemPrompt = `Ты помощник для учёта финансов кассы. Из голосового сообщения извлеки данные транзакции.

Типы: income (приход/доход) или expense (расход).
Источники дохода: Наличные, Карта папы, Моя карта.
Контрагенты расходов: Марьяна, Ира, Вика, Мама Вики (или новые).
Категории расходов: Оплата клининга, Расходники для гостей, Другое.
Апартаменты: Era Deluxe (он же Сальвадор, EULRA), Oasis 1 (Пераль 1), Oasis 2 (Пераль 2), Oasis Grande.

Если категория = "Оплата клининга", обязательно заполни apartment.
Дата/время по умолчанию = сейчас. Если пользователь не упоминал дату, оставь пустыми.`;

      tools = [{
        type: "function",
        function: {
          name: "fill_transaction",
          description: "Fill transaction form with extracted data",
          parameters: {
            type: "object",
            properties: {
              transaction_type: { type: "string", enum: ["income","expense"] },
              amount: { type: "number" },
              description: { type: "string" },
              payment_source: { type: "string" },
              counterparty: { type: "string" },
              category: { type: "string" },
              apartment: { type: "string" },
              location: { type: "string" }
            },
            required: ["transaction_type","amount"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "fill_transaction" } };

    } else if (context === "task") {
      systemPrompt = `Ты помощник для создания задач. Из голосового сообщения извлеки название задачи, описание, эмодзи и подзадачи (если есть).`;

      tools = [{
        type: "function",
        function: {
          name: "fill_task",
          description: "Fill task form with extracted data",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              emoji: { type: "string" },
              steps: { type: "array", items: { type: "object", properties: { description: { type: "string" }, emoji: { type: "string" } }, required: ["description"] } }
            },
            required: ["title","description"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "fill_task" } };
    }

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Транскрипция голосового сообщения: "${transcription}"` }
      ],
      tools,
      tool_choice: toolChoice,
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({ error: "Лимит запросов превышен" });
      }
      if (response.status === 402) {
        return res.status(402).json({ error: "Недостаточно средств" });
      }
      const t = await response.text();
      throw new Error(`AI error: ${response.status} ${t}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return res.status(400).json({ error: "Не удалось распознать данные из голоса" });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return res.json({ result: parsed, functionName: toolCall.function.name });
  } catch (e) {
    console.error("[smart-voice-input] error:", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

module.exports = router;
