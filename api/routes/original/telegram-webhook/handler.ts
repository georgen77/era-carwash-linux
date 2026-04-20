// ALL business logic lives here. index.ts NEVER changes.
// Lazy-load all heavy deps inside functions — never at module top-level.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Supabase client (lazy singleton) ────────────────────────────────────────
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
  }
  return _supabase;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const APARTMENT_RU: Record<string, string> = {
  piral_1: "Оазис 1", piral_2: "Оазис 2", grande: "Гранде", salvador: "Сальвадор",
};
const APT_SHORT: Record<string, string> = {
  piral_1: "О1", piral_2: "О2", grande: "Гранде", salvador: "Сал",
};
const PAYMENT_AMOUNT: Record<string, number> = {
  piral_1: 35, piral_2: 35, salvador: 35, grande: 70,
};

/** Get first name from full name */
function firstName(name: string | null): string {
  if (!name) return "";
  return name.split(" ")[0];
}

/** Resolve cleaner name from DB by telegram chat_id, falling back to provided name */
async function resolveCleanerName(chatIdStr: string, fallbackName: string): Promise<string> {
  const db = getSupabase();
  const { data: rec }: { data: any } = await db.from("cleaners")
    .select("name")
    .eq("telegram_id", chatIdStr)
    .maybeSingle();
  return rec?.name ?? fallbackName;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function processUpdate(body: any): Promise<void> {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_LINEN_BOT_TOKEN") ?? "";
  const EMMA_CHAT_ID = Deno.env.get("EMMA_TELEGRAM_CHAT_ID") ?? "";
  const IRINA_CHAT_ID = Deno.env.get("IRINA_TELEGRAM_CHAT_ID") ?? "";

  const msg = body?.message;
  const cbq = body?.callback_query;

  if (cbq) {
    await handleCallback(cbq, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID);
  } else if (msg) {
    await handleMessage(msg, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID);
  }
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────
async function sendMsg(
  chatId: number | string,
  text: string,
  extra: Record<string, any> = {},
  token: string,
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra }),
  }).catch(console.error);
}

async function answerCbq(cbqId: string, text: string, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cbqId, text }),
  }).catch(console.error);
}

async function editMsg(
  chatId: number | string,
  messageId: number,
  text: string,
  token: string,
  replyMarkup?: any,
) {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(console.error);
}

async function getFileUrl(fileId: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const d = await r.json();
    if (!d.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${d.result.file_path}`;
  } catch { return null; }
}

function fmtDateShort(d: string | null): string {
  if (!d) return "";
  if (d.includes("-")) {
    const parts = d.split("-");
    return `${parts[2]}.${parts[1]}`;
  }
  return d;
}

export function fmtDateFull(d: string | null): string {
  if (!d) return "";
  if (d.includes("-")) {
    const parts = d.split("-");
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return d;
}

export function buildSlotButtonText(slot: {
  apartment?: string | null;
  cleaner_name?: string | null;
  cleaning_date?: string | null;
  checkout_date?: string | null;
  checkin_date?: string | null;
}) {
  const effectiveDate = slot.cleaning_date ?? slot.checkout_date ?? slot.checkin_date ?? "";
  const aptShort = APT_SHORT[slot.apartment ?? ""] ?? slot.apartment ?? "?";
  const cleanerLabel = slot.cleaner_name ? firstName(slot.cleaner_name) : "свободно";
  return `${aptShort} · ${fmtDateFull(effectiveDate)} · ${cleanerLabel}`;
}

type SlotManagementCallback =
  | { kind: "detail"; slotId: string }
  | { kind: "replace_menu"; slotId: string }
  | { kind: "replace_pick"; slotId: string; cleanerIdx: number }
  | { kind: "remove"; slotId: string };

function stripCallbackPrefix(data: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    if (data.startsWith(prefix)) {
      const value = data.slice(prefix.length).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function parseSlotManagementCallback(data: string): SlotManagementCallback | null {
  const replaceColon = data.match(/^(?:rc|replace_choice|replace_pick):([^:]+):(\d+)$/);
  if (replaceColon) {
    return { kind: "replace_pick", slotId: replaceColon[1], cleanerIdx: Number(replaceColon[2]) };
  }

  const replaceUnderscore = data.match(/^(?:rc|replace_choice|replace_pick)_([^_]+)_(\d+)$/);
  if (replaceUnderscore) {
    return { kind: "replace_pick", slotId: replaceUnderscore[1], cleanerIdx: Number(replaceUnderscore[2]) };
  }

  const detailId = stripCallbackPrefix(data, [
    "sd:", "slot:", "slot_", "schedule:", "schedule_", "detail:", "detail_", "shift:", "shift_", "open:", "open_",
  ]);
  if (detailId) return { kind: "detail", slotId: detailId };

  const replaceId = stripCallbackPrefix(data, [
    "rp:", "replace:", "replace_", "replace_cleaner:", "replace_cleaner_", "manage:", "manage_",
  ]);
  if (replaceId) return { kind: "replace_menu", slotId: replaceId };

  const removeId = stripCallbackPrefix(data, [
    "rm:", "remove:", "remove_", "delete:", "delete_", "remove_cleaner:", "remove_cleaner_", "delete_cleaner:", "delete_cleaner_",
  ]);
  if (removeId) return { kind: "remove", slotId: removeId };

  return null;
}

/** Get main reply keyboard */
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📅 Расписание" }, { text: "✋ Записаться на уборку" }],
        [{ text: "📋 Мои смены" }, { text: "🧺 Грязное бельё" }],
        [{ text: "❓ Помощь" }],
      ],
      resize_keyboard: true,
      persistent: true,
    },
  };
}

function isAdmin(chatIdStr: string): boolean {
  const admins = [
    Deno.env.get("IRINA_TELEGRAM_CHAT_ID"),
    Deno.env.get("EMMA_TELEGRAM_CHAT_ID"),
    Deno.env.get("OWNER_TELEGRAM_CHAT_ID"),
  ].filter(Boolean);
  return admins.includes(chatIdStr);
}

// ─── Call bot-api ─────────────────────────────────────────────────────────────
async function callBotApi(action: string, payload: any = {}) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bot-api`;
  const secret = Deno.env.get("BOT_SECRET") ?? "";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-secret": secret,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  return resp.json();
}

// ─── Main message handler ────────────────────────────────────────────────────
async function handleMessage(
  msg: any,
  BOT_TOKEN: string,
  EMMA_CHAT_ID: string,
  IRINA_CHAT_ID: string,
) {
  const chatId = msg.chat?.id;
  const text = (msg.text ?? "").trim();
  const from = msg.from;
  const chatIdStr = String(chatId);

  // ── /myid ──────────────────────────────────────────────────────────────────
  if (text === "/myid" || text.startsWith("/myid@")) {
    await sendMsg(chatId, `🆔 Ваш chat ID: <code>${chatId}</code>`, {}, BOT_TOKEN);
    return;
  }

  // ── /start ─────────────────────────────────────────────────────────────────
  if (text === "/start" || text.startsWith("/start@")) {
    await sendMsg(chatId,
      "👋 Привет! Я бот управления бельём и уборками.\n\n" +
      "Используйте кнопки меню ниже для навигации.",
      getMainKeyboard(),
      BOT_TOKEN);
    return;
  }

  // ── /status ────────────────────────────────────────────────────────────────
  if (text === "/status" || text.startsWith("/status@")) {
    await handleStatusCommand(chatId, chatIdStr, BOT_TOKEN);
    return;
  }

  // ── Menu buttons ───────────────────────────────────────────────────────────
  if (text === "📅 Расписание") {
    await handleScheduleMenu(chatId, chatIdStr, BOT_TOKEN, from);
    return;
  }
  if (text === "✋ Записаться на уборку") {
    await handleFreeSlots(chatId, chatIdStr, from, BOT_TOKEN);
    return;
  }
  if (text === "📋 Мои смены") {
    await handleMyShifts(chatId, chatIdStr, BOT_TOKEN);
    return;
  }
  if (text === "🧺 Грязное бельё") {
    await sendMsg(chatId, "📦 Отправьте сообщение с описанием белья или фото чека.", {}, BOT_TOKEN);
    return;
  }
  if (text === "❓ Помощь") {
    await sendMsg(chatId,
      "📋 <b>Доступные команды:</b>\n\n" +
      "📅 <b>Расписание</b> — все смены на ближайшие дни\n" +
      "✋ <b>Записаться на уборку</b> — свободные слоты\n" +
      "📋 <b>Мои смены</b> — ваш личный график\n" +
      "🧺 <b>Грязное бельё</b> — отправить данные о белье\n" +
      "/myid — узнать свой chat ID\n" +
      "/status — статус уборки",
      getMainKeyboard(),
      BOT_TOKEN);
    return;
  }

  // ── Photo — OCR receipt ──────────────────────────────────────────────────────
  if (msg.photo || msg.document) {
    await handlePhoto(msg, chatId, from, BOT_TOKEN, EMMA_CHAT_ID);
    return;
  }

  // ── Text from Irina — schedule parsing ────────────────────────────────────────
  if (chatIdStr === IRINA_CHAT_ID && text.length > 10) {
    await handleScheduleParsing(text, chatId, BOT_TOKEN);
    return;
  }

  // ── Text from any cleaner — linen parsing ─────────────────────────────────────
  if (text.length > 3 && !text.startsWith("/")) {
    await handleLinenParsing(msg, chatId, from, text, BOT_TOKEN, EMMA_CHAT_ID);
    return;
  }
}

// ─── 📅 Расписание ──────────────────────────────────────────────────────────
async function handleScheduleMenu(chatId: number, chatIdStr: string, BOT_TOKEN: string, _fromUser?: any) {
  try {
    const result = await callBotApi("get_schedule");
    if (!result.success || !result.data || result.data.length === 0) {
      await sendMsg(chatId, "📅 Нет предстоящих бронирований.", getMainKeyboard(), BOT_TOKEN);
      return;
    }

    const isAdm = isAdmin(chatIdStr);

    // Build inline keyboard with schedule slots
    const buttons: any[][] = [];
    for (const slot of result.data.slice(0, 20)) {
      const effectiveDate = slot.cleaning_date ?? slot.checkout_date;
      if (!effectiveDate) continue;

      const buttonText = buildSlotButtonText(slot);
      const slotId = slot.assignment_id ?? slot.schedule_id ?? slot.id;

      if (isAdm) {
        // Admins can click to manage
        buttons.push([{ text: buttonText, callback_data: `sd:${slotId}` }]);
      } else {
        // Cleaners see info only (or can take if free)
        if (!slot.cleaner_name) {
          buttons.push([{ text: `${buttonText} ✋`, callback_data: `take_slot:${slotId}` }]);
        } else {
          buttons.push([{ text: buttonText, callback_data: `noop` }]);
        }
      }
    }

    if (buttons.length === 0) {
      await sendMsg(chatId, "📅 Нет предстоящих смен.", getMainKeyboard(), BOT_TOKEN);
      return;
    }

    await sendMsg(chatId, "📅 <b>Расписание уборок:</b>\n\n" +
      (isAdm ? "Нажмите на смену для управления:" : "Свободные слоты можно взять, нажав ✋:"),
      { reply_markup: { inline_keyboard: buttons } },
      BOT_TOKEN);
  } catch (e) {
    console.error("Schedule menu error:", e);
    await sendMsg(chatId, "⚠️ Ошибка загрузки расписания.", getMainKeyboard(), BOT_TOKEN);
  }
}

// ─── ✋ Записаться на уборку (free slots only) ─────────────────────────────
async function handleFreeSlots(chatId: number, chatIdStr: string, from: any, BOT_TOKEN: string) {
  try {
    const result = await callBotApi("get_schedule");
    if (!result.success || !result.data) {
      await sendMsg(chatId, "📅 Нет доступных слотов.", getMainKeyboard(), BOT_TOKEN);
      return;
    }

    const freeSlots = result.data.filter((s: any) => !s.cleaner_name);
    if (freeSlots.length === 0) {
      await sendMsg(chatId, "📅 Все смены уже заняты.", getMainKeyboard(), BOT_TOKEN);
      return;
    }

    // Try to find cleaner name from the cleaners table by telegram_id
    const db = getSupabase();
    const { data: cleanerRec } = await db.from("cleaners")
      .select("name")
      .eq("telegram_id", chatIdStr)
      .maybeSingle();
    const cleanerName = cleanerRec?.name ?? from?.first_name ?? "Уборщица";

    const buttons: any[][] = [];
    for (const slot of freeSlots.slice(0, 15)) {
      const effectiveDate = slot.cleaning_date ?? slot.checkout_date;
      if (!effectiveDate) continue;

      const aptShort = APT_SHORT[slot.apartment] ?? slot.apartment;
      const dateShort = fmtDateShort(effectiveDate);
      const fee = PAYMENT_AMOUNT[slot.apartment] ?? 35;
      const slotId = slot.schedule_id ?? slot.assignment_id ?? slot.id;

      buttons.push([{
        text: `✋ ${dateShort} ${aptShort} · ${fee}€`,
        callback_data: `signup:${slotId}:${cleanerName.substring(0, 20)}`,
      }]);
    }

    await sendMsg(chatId, "✋ <b>Свободные смены:</b>\nНажмите, чтобы записаться:", {
      reply_markup: { inline_keyboard: buttons },
    }, BOT_TOKEN);
  } catch (e) {
    console.error("Free slots error:", e);
    await sendMsg(chatId, "⚠️ Ошибка загрузки слотов.", getMainKeyboard(), BOT_TOKEN);
  }
}

// ─── 📋 Мои смены ──────────────────────────────────────────────────────────
async function handleMyShifts(chatId: number, chatIdStr: string, BOT_TOKEN: string) {
  try {
    const result = await callBotApi("get_my_assignments", { chat_id: chatIdStr });
    if (!result.success || !result.data || result.data.length === 0) {
      await sendMsg(chatId, "📋 У вас пока нет назначенных смен.", getMainKeyboard(), BOT_TOKEN);
      return;
    }

    let text = "📋 <b>Ваши смены:</b>\n\n";
    const buttons: any[][] = [];

    for (const a of result.data.slice(0, 10)) {
      const apt = APARTMENT_RU[a.apartment] ?? a.apartment;
      const statusLabel = a.status === "done" ? "✅ Завершено"
        : a.status === "started" ? "🧹 В процессе"
        : a.status === "paid" ? "💰 Оплачено"
        : a.status === "confirmed" ? "✅ Подтверждено"
        : "⏳ Ожидает";
      text += `🏠 <b>${apt}</b> · 📅 ${fmtDateShort(a.cleaning_date)}\n${statusLabel} · 💰 ${a.payment_amount ?? 35}€\n\n`;

      // Add start/finish buttons for active shifts
      if (a.status === "confirmed" || a.status === "assigned" || a.status === "pending") {
        buttons.push([{ text: `🧹 Начать: ${APT_SHORT[a.apartment] ?? a.apartment} ${fmtDateShort(a.cleaning_date)}`, callback_data: `start_cleaning:${a.id}` }]);
      } else if (a.status === "started") {
        buttons.push([{ text: `✅ Закончить: ${APT_SHORT[a.apartment] ?? a.apartment} ${fmtDateShort(a.cleaning_date)}`, callback_data: `finish_cleaning:${a.id}` }]);
      }
    }

    const extra: any = {};
    if (buttons.length > 0) {
      extra.reply_markup = { inline_keyboard: buttons };
    }
    await sendMsg(chatId, text, extra, BOT_TOKEN);
  } catch (e) {
    console.error("My shifts error:", e);
    await sendMsg(chatId, "⚠️ Ошибка загрузки смен.", getMainKeyboard(), BOT_TOKEN);
  }
}

// ─── /status command ──────────────────────────────────────────────────────────
async function handleStatusCommand(chatId: number, chatIdStr: string, BOT_TOKEN: string) {
  const db = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const { data: statusData }: { data: any } = await db.from("cleaning_assignments")
    .select("*")
    .eq("cleaner_telegram_id", chatIdStr)
    .gte("cleaning_date", today)
    .order("cleaning_date", { ascending: true })
    .limit(5);

  if (!statusData || statusData.length === 0) {
    await sendMsg(chatId, "📅 У вас нет предстоящих уборок.", getMainKeyboard(), BOT_TOKEN);
    return;
  }

  let text = "📋 <b>Ваши ближайшие уборки:</b>\n\n";
  for (const a of (statusData as any[])) {
    const apt = APARTMENT_RU[a.apartment] ?? a.apartment;
    const date = a.cleaning_date;
    const status = a.status === "done" ? "✅ Выполнено"
      : a.status === "started" ? "🧹 В процессе"
      : a.status === "confirmed" ? "✅ Подтверждено"
      : "⏳ Ожидает";
    text += `🏠 <b>${apt}</b> · ${date}\n${status} · 💰 ${a.payment_amount ?? 35}€\n\n`;
  }
  await sendMsg(chatId, text, getMainKeyboard(), BOT_TOKEN);
}

// ─── Photo / receipt OCR ──────────────────────────────────────────────────────
async function handlePhoto(
  msg: any,
  chatId: number,
  from: any,
  BOT_TOKEN: string,
  EMMA_CHAT_ID: string,
) {
  const db = getSupabase();
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!ANTHROPIC_KEY) return;

  let fileId: string | null = null;
  if (msg.photo) {
    const photos = msg.photo;
    fileId = photos[photos.length - 1].file_id;
  } else if (msg.document?.mime_type?.startsWith("image/")) {
    fileId = msg.document.file_id;
  }
  if (!fileId) return;

  const fileUrl = await getFileUrl(fileId, BOT_TOKEN);
  if (!fileUrl) return;

  await sendMsg(chatId, "🔍 Анализирую чек...", {}, BOT_TOKEN);

  try {
    const imgResp = await fetch(fileUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: mimeType, data: base64 },
          }, {
            type: "text",
            text: `Это чек/квитанция. Извлеки: 1) общую сумму в евро (число), 2) название магазина/заведения. 
Ответь ТОЛЬКО в формате JSON: {"amount": 12.50, "store": "Mercadona"}
Если не можешь определить — {"amount": null, "store": null}`,
          }],
        }],
      }),
    });

    const claudeData = await claudeResp.json();
    const rawText = claudeData?.content?.[0]?.text ?? "";
    let amount: number | null = null;
    let store: string | null = null;
    try {
      const jsonMatch = rawText.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        amount = parsed.amount ?? null;
        store = parsed.store ?? null;
      }
    } catch { /**/ }

    const cleanerName = await resolveCleanerName(String(chatId), from?.first_name ?? from?.username ?? "Unknown");
    const fileName = `receipt_${Date.now()}.jpg`;
    const { data: uploadData } = await db.storage.from("receipts")
      .upload(fileName, imgBuffer, { contentType: mimeType, upsert: true });
    const receiptUrl = uploadData
      ? `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/receipts/${fileName}`
      : fileUrl;

    const today = new Date().toISOString().slice(0, 10);
    const { data: assignment }: { data: any } = await db.from("cleaning_assignments")
      .select("*")
      .eq("cleaner_name", cleanerName)
      .lte("cleaning_date", today)
      .order("cleaning_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignment && amount) {
      await (db.from("cleaning_assignments") as any).update({
        receipt_url: receiptUrl,
        receipt_amount: amount,
        receipt_store: store,
      }).eq("id", assignment.id);

      const { data: newTx }: { data: any } = await (db.from("emma_transactions") as any).insert({
        transaction_type: "expense",
        amount,
        description: `Хозрасходы: ${store ?? "чек от уборщицы"}`,
        counterparty: store,
        receipt_url: receiptUrl,
        created_by: "00000000-0000-0000-0000-000000000001",
        transaction_date: new Date().toISOString(),
      }).select().maybeSingle();

      if (EMMA_CHAT_ID && newTx) {
        const apt = APARTMENT_RU[assignment.apartment] ?? assignment.apartment;
        await sendMsg(EMMA_CHAT_ID,
          `🧾 <b>Чек от ${cleanerName}</b>\n` +
          `🏠 ${apt} · 📅 ${assignment.cleaning_date}\n` +
          `💰 Сумма: <b>${amount}€</b>${store ? ` · ${store}` : ""}\n\n` +
          `Подтвердить расход?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: `✅ Подтвердить ${amount}€`, callback_data: `confirm_receipt:${newTx.id}` },
                { text: "❌ Отклонить", callback_data: `reject_receipt:${newTx.id}` },
              ]],
            },
          },
          BOT_TOKEN,
        );
      }

      await sendMsg(chatId,
        `✅ Чек принят!\n💰 ${amount}€${store ? ` · ${store}` : ""}\nЭммочка получила уведомление.`,
        {}, BOT_TOKEN);
    } else if (amount) {
      await sendMsg(chatId, `✅ Чек проанализирован: ${amount}€${store ? ` · ${store}` : ""}.\nУборка не найдена — чек сохранён.`, {}, BOT_TOKEN);
    } else {
      await sendMsg(chatId, "⚠️ Не удалось распознать сумму на чеке. Отправьте снова или введите сумму текстом.", {}, BOT_TOKEN);
    }
  } catch (e) {
    console.error("OCR error:", e);
    await sendMsg(chatId, "⚠️ Ошибка при обработке чека. Попробуйте позже.", {}, BOT_TOKEN);
  }
}

// ─── Schedule parsing (Irina's messages) ─────────────────────────────────────
async function handleScheduleParsing(text: string, chatId: number, BOT_TOKEN: string) {
  const db = getSupabase();
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!ANTHROPIC_KEY) return;

  const currentYear = new Date().getFullYear();

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `Извлеки данные о бронированиях из этого сообщения расписания. Текущий год: ${currentYear}.

Правила:
- Формат дат входа: DD.MM → преобразуй в YYYY-MM-DD (добавь год ${currentYear})
- Апартаменты: Оазис 1/О1/П1 → "piral_1", Оазис 2/О2/П2 → "piral_2", Гранде/Grande → "grande", Сальвадор/Salvador → "salvador"
- Если дата выезда не указана — предположи минимум 1 ночь
- guests_count — число гостей (строка)

Ответь ТОЛЬКО JSON массивом:
[{"apartment":"piral_1","checkin_date":"2026-03-20","checkout_date":"2026-03-25","guests_count":"4","notes":null}]

Если бронирований нет — верни пустой массив [].

Сообщение:
${text}`,
        }],
      }),
    });

    const data = await resp.json();
    const raw = data?.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await sendMsg(chatId, "📋 Не нашёл бронирований в сообщении.", {}, BOT_TOKEN);
      return;
    }

    const bookings: any[] = JSON.parse(jsonMatch[0]);
    if (bookings.length === 0) {
      await sendMsg(chatId, "📋 Бронирований не найдено.", {}, BOT_TOKEN);
      return;
    }

    let saved = 0;
    for (const b of bookings) {
      if (!b.apartment || !b.checkin_date) continue;
      const cleaningDate = b.checkout_date ?? null;
      const nextGuests = parseInt(b.guests_count ?? "0") || null;

      await db.from("cleaning_schedule").upsert({
        apartment: b.apartment,
        checkin_date: b.checkin_date,
        checkout_date: b.checkout_date ?? null,
        cleaning_date: cleaningDate,
        guests_count: b.guests_count ?? null,
        notes: b.notes ?? null,
        source: "manual",
      }, { onConflict: "apartment,checkin_date" });
      saved++;
    }

    await sendMsg(chatId,
      `✅ Расписание обновлено!\n📅 Сохранено бронирований: <b>${saved}</b>\n\n` +
      bookings.map(b =>
        `🏠 ${APARTMENT_RU[b.apartment] ?? b.apartment}: ${b.checkin_date} → ${b.checkout_date ?? "?"} (${b.guests_count ?? "?"} гостей)`
      ).join("\n"),
      {}, BOT_TOKEN);
  } catch (e) {
    console.error("Schedule parsing error:", e);
    await sendMsg(chatId, "⚠️ Ошибка парсинга расписания.", {}, BOT_TOKEN);
  }
}

// ─── Linen parsing ─────────────────────────────────────────────────────────────
async function handleLinenParsing(
  msg: any,
  chatId: number,
  from: any,
  text: string,
  BOT_TOKEN: string,
  EMMA_CHAT_ID: string,
) {
  const db = getSupabase();
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!ANTHROPIC_KEY) return;

  const linenKeywords = /простын|пододеяльник|наволочк|полотенц|кухонн|ковр|подстилк|наматрасник|лён|белье|бельё|убор|П1|П2|оазис|сальвадор/i;
  if (!linenKeywords.test(text)) return;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `Извлеки данные о перемещении белья. Правила:
- item_type: sheets, duvet_covers, pillowcases, large_towels, small_towels, kitchen_towels, rugs, beach_mat, mattress_pad
- from_location: piral_1, piral_2, salvador, dirty_linen_piral, dirty_linen_salvador, clean_linen_piral, clean_linen_salvador, albert_laundry
- to_location: same options
- "П1"/"Оазис 1" → piral_1, "П2"/"Оазис 2" → piral_2

Ответ JSON: {"apartment_name":"...","items":[{"item_type":"sheets","quantity":2,"from_location":"piral_1","to_location":"dirty_linen_piral"}]}

Текст: ${text}`,
        }],
      }),
    });

    const data = await resp.json();
    const raw = data?.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    const movements = parsed.items ?? [];
    if (movements.length === 0) return;

    const cleanerName = from?.first_name ?? from?.username ?? "Уборщица";

    const pending = (await db.from("pending_movements").insert({
      items: movements,
      from_location: movements[0]?.from_location ?? null,
      to_location: movements[0]?.to_location ?? null,
      apartment_name: parsed.apartment_name ?? null,
      original_message: text,
      cleaner_name: cleanerName,
      source: "telegram",
      chat_id: String(chatId),
      telegram_message_id: String(msg.message_id),
      confirmed: false,
    }).select().maybeSingle()).data;

    const ITEM_RU: Record<string, string> = {
      sheets: "Простыни", duvet_covers: "Пододеяльники", pillowcases: "Наволочки",
      large_towels: "Бол. полотенца", small_towels: "Мал. полотенца",
      kitchen_towels: "Кух. полотенца", rugs: "Коврики", beach_mat: "Подстилки",
      mattress_pad: "Наматрасники",
    };
    const summary = movements.map((m: any) =>
      `• ${ITEM_RU[m.item_type] ?? m.item_type}: ${m.quantity} шт.`
    ).join("\n");

    const aptName = parsed.apartment_name ?? movements[0]?.from_location ?? "Апартамент";

    await sendMsg(chatId,
      `📦 <b>Белье из ${aptName}</b>\n\n${summary}\n\n✅ Всё верно?`,
      pending ? {
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Подтвердить", callback_data: `confirm_linen:${pending.id}` },
            { text: "❌ Отмена", callback_data: `cancel_linen:${pending.id}` },
          ]],
        },
      } : {},
      BOT_TOKEN,
    );
  } catch (e) {
    console.error("Linen parsing error:", e);
  }
}

// ─── Callback query handler ───────────────────────────────────────────────────
async function handleCallback(cbq: any, BOT_TOKEN: string, EMMA_CHAT_ID: string, IRINA_CHAT_ID: string) {
  const data = cbq.data ?? "";
  const chatId = cbq.message?.chat?.id;
  const messageId = cbq.message?.message_id;
  const chatIdStr = String(chatId);
  const db = getSupabase();

  await answerCbq(cbq.id, "", BOT_TOKEN);

  // ── noop ───────────────────────────────────────────────────────────────────
  if (data === "noop") return;

  const slotAction = parseSlotManagementCallback(data);
  if (slotAction) {
    if (slotAction.kind === "detail") {
      await showSlotDetail(chatId, messageId, slotAction.slotId, BOT_TOKEN);
      return;
    }
    if (slotAction.kind === "replace_menu") {
      await showReplaceMenu(chatId, messageId, slotAction.slotId, BOT_TOKEN);
      return;
    }
    if (slotAction.kind === "replace_pick") {
      await doReplaceCleaner(chatId, messageId, slotAction.slotId, slotAction.cleanerIdx, BOT_TOKEN);
      return;
    }
    if (slotAction.kind === "remove") {
      await doRemoveCleaner(chatId, messageId, slotAction.slotId, BOT_TOKEN);
      return;
    }
  }

  // ── signup:<schedule_id>:<cleaner_name> — signup for cleaning ──────────────
  if (data.startsWith("signup:") || data.startsWith("signup_")) {
    const separator = data.startsWith("signup:") ? ":" : "_";
    const rest = data.startsWith("signup:") ? data.substring(7) : data.substring(7);
    const sepIdx = rest.indexOf(separator === ":" ? ":" : "_never_");
    
    let scheduleId: string;
    let cleanerName: string;
    
    if (separator === ":" && sepIdx > 0) {
      scheduleId = rest.substring(0, sepIdx);
      cleanerName = await resolveCleanerName(chatIdStr, rest.substring(sepIdx + 1));
    } else {
      scheduleId = rest;
      cleanerName = await resolveCleanerName(chatIdStr, cbq.from?.first_name ?? "Уборщица");
    }

    try {
      const result = await callBotApi("signup_cleaning", {
        schedule_id: scheduleId,
        id: scheduleId,
        chat_id: chatIdStr,
        cleaner_name: cleanerName,
      });

      if (result.success) {
        const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
        await editMsg(chatId, messageId,
          `✅ <b>Вы записались на уборку!</b>\n🏠 ${apt} · 📅 ${fmtDateShort(result.cleaning_date)}\n💰 ${PAYMENT_AMOUNT[result.apartment] ?? 35}€`,
          BOT_TOKEN);
      } else if (result.conflict) {
        await editMsg(chatId, messageId,
          `⚠️ Эта смена уже занята: ${result.taken_by}`,
          BOT_TOKEN);
      } else {
        await editMsg(chatId, messageId, `⚠️ Не удалось записаться.`, BOT_TOKEN);
      }
    } catch (e) {
      console.error("Signup error:", e);
      await sendMsg(chatId, "⚠️ Ошибка при записи.", {}, BOT_TOKEN);
    }
    return;
  }

  // ── confirm_linen:<pending_id> ─────────────────────────────────────────────
  if (data.startsWith("confirm_linen:")) {
    const pendingId = data.split(":")[1];
    const { data: pending }: { data: any } = await db.from("pending_movements")
      .select("*").eq("id", pendingId).maybeSingle();
    if (!pending) return;

    const movements: any[] = (pending as any).items ?? [];
    let savedCount = 0;
    for (const m of movements) {
      const { error } = await db.from("movements").insert({
        from_location: m.from_location,
        to_location: m.to_location,
        item_type: m.item_type,
        quantity: m.quantity,
        cleaner_name: pending.cleaner_name ?? null,
        notes: pending.original_message ?? null,
      });
      if (!error) savedCount++;
    }

    await db.from("pending_movements").update({ confirmed: true }).eq("id", pendingId);

    const ITEM_RU: Record<string, string> = {
      sheets: "Простыни", duvet_covers: "Пододеяльники", pillowcases: "Наволочки",
      large_towels: "Бол. полотенца", small_towels: "Мал. полотенца",
      kitchen_towels: "Кух. полотенца", rugs: "Коврики", beach_mat: "Подстилки",
      mattress_pad: "Наматрасники",
    };
    const summary = movements.map((m: any) =>
      `• ${ITEM_RU[m.item_type] ?? m.item_type}: ${m.quantity} шт.`
    ).join("\n");

    await editMsg(chatId, messageId,
      `✅ <b>Белье зафиксировано!</b>\n\n${summary}\n\nСохранено позиций: ${savedCount}`,
      BOT_TOKEN);
    return;
  }

  // ── cancel_linen:<pending_id> ──────────────────────────────────────────────
  if (data.startsWith("cancel_linen:")) {
    const pendingId = data.split(":")[1];
    await db.from("pending_movements").delete().eq("id", pendingId);
    await editMsg(chatId, messageId, "❌ Отменено. Отправьте сообщение ещё раз.", BOT_TOKEN);
    return;
  }

  // ── confirm_payment:<assignment_id> ────────────────────────────────────────
  if (data.startsWith("confirm_payment:")) {
    const assignmentId = data.split(":")[1];
    const { data: payAsgn }: { data: any } = await db.from("cleaning_assignments")
      .select("*").eq("id", assignmentId).maybeSingle();
    if (!payAsgn) return;

    const now = new Date().toISOString();
    await (db.from("cleaning_assignments") as any).update({
      payment_confirmed: true,
      payment_confirmed_at: now,
    }).eq("id", assignmentId);

    if (payAsgn.payment_transaction_id) {
      await (db.from("emma_transactions") as any).update({
        transaction_date: now,
      }).eq("id", payAsgn.payment_transaction_id);
    }

    const apt = APARTMENT_RU[payAsgn.apartment] ?? payAsgn.apartment;
    const amount = payAsgn.payment_amount ?? 35;
    await editMsg(chatId, messageId,
      `✅ Выплата подтверждена!\n🏠 ${apt} · 📅 ${payAsgn.cleaning_date}\n👤 ${payAsgn.cleaner_name}\n💰 ${amount}€`,
      BOT_TOKEN);

    if (payAsgn.cleaner_telegram_id) {
      await sendMsg(payAsgn.cleaner_telegram_id,
        `💰 Эммочка выдала вам ${amount}€ за уборку ${apt} (${payAsgn.cleaning_date}) ✅`,
        {}, BOT_TOKEN);
    }
    return;
  }

  // ── confirm_receipt / reject_receipt ────────────────────────────────────────
  if (data.startsWith("confirm_receipt:")) {
    const txId = data.split(":")[1];
    await editMsg(chatId, messageId, "✅ Расход подтверждён и сохранён в кассе Эммочки.", BOT_TOKEN);
    return;
  }
  if (data.startsWith("reject_receipt:")) {
    const txId = data.split(":")[1];
    await (db.from("emma_transactions") as any).delete().eq("id", txId);
    await editMsg(chatId, messageId, "❌ Расход отклонён и удалён.", BOT_TOKEN);
    return;
  }

  // ── take_slot:<assignment_id>:<cleaner_name> ──────────────────────────────
  if (data.startsWith("take_slot:")) {
    const parts = data.split(":");
    const assignmentId = parts[1];
    const cleanerTgId = String(chatId);
    const rawCleanerName = parts.slice(2).join(":").trim();
    const cleanerName = await resolveCleanerName(cleanerTgId, rawCleanerName || cbq.from?.first_name || "Уборщица");

    const { error } = await db.from("cleaning_assignments").update({
      cleaner_name: cleanerName,
      cleaner_telegram_id: cleanerTgId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: cleanerTgId,
    }).eq("id", assignmentId).is("cleaner_name", null);

    if (error) {
      await sendMsg(chatId, "⚠️ Этот слот уже занят другой уборщицей.", {}, BOT_TOKEN);
    } else {
      const { data: asgn } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
      if (asgn) {
        const apt = APARTMENT_RU[asgn.apartment] ?? asgn.apartment;
        await editMsg(chatId, messageId,
          `✅ <b>Вы взяли уборку!</b>\n🏠 ${apt} · 📅 ${asgn.cleaning_date}\n💰 ${asgn.payment_amount ?? 35}€`,
          BOT_TOKEN);
        if (EMMA_CHAT_ID) {
          await sendMsg(EMMA_CHAT_ID,
            `✅ ${cleanerName} взяла уборку\n🏠 ${apt} · 📅 ${asgn.cleaning_date}`,
            {}, BOT_TOKEN);
        }
      }
    }
    return;
  }

  // ── start_cleaning:<assignment_id> ────────────────────────────────────────
  if (data.startsWith("start_cleaning:")) {
    const assignmentId = data.split(":")[1];

    // First fetch the assignment to validate
    const { data: startAsgn, error: fetchErr }: { data: any; error: any } = await db
      .from("cleaning_assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();

    if (fetchErr || !startAsgn) {
      await editMsg(chatId, messageId,
        `❌ Смена не найдена (ID: ${assignmentId?.slice(0, 8)}…). Возможно она была удалена.`,
        BOT_TOKEN);
      return;
    }

    // Check if status allows starting
    const allowedStatuses = ["assigned", "confirmed", "pending"];
    if (!allowedStatuses.includes(startAsgn.status)) {
      const statusMessages: Record<string, string> = {
        started: "🧹 Уборка уже начата!",
        done: "✅ Уборка уже завершена.",
        completed: "✅ Уборка уже завершена.",
        paid: "💰 Уборка завершена и оплачена.",
        cancelled: "❌ Эта смена была отменена.",
      };
      await editMsg(chatId, messageId,
        statusMessages[startAsgn.status] ?? `⚠️ Невозможно начать уборку (статус: ${startAsgn.status})`,
        BOT_TOKEN);
      return;
    }

    const now = new Date().toISOString();
    const { error: updErr } = await (db.from("cleaning_assignments") as any).update({
      status: "started", started_at: now,
    }).eq("id", assignmentId);

    if (updErr) {
      await editMsg(chatId, messageId,
        `❌ Ошибка при запуске уборки: ${updErr.message}`,
        BOT_TOKEN);
      return;
    }

    const apt = APARTMENT_RU[startAsgn.apartment] ?? startAsgn.apartment;
    await editMsg(chatId, messageId,
      `🧹 <b>Уборка началась!</b>\n🏠 ${apt} · ⏰ ${new Date().toLocaleTimeString("ru")}`,
      BOT_TOKEN);
    if (EMMA_CHAT_ID) {
      await sendMsg(EMMA_CHAT_ID,
        `🧹 ${startAsgn.cleaner_name} начала уборку\n🏠 ${apt} · 📅 ${startAsgn.cleaning_date}`,
        {}, BOT_TOKEN);
    }
    return;
  }

  // ── finish_cleaning:<assignment_id> ───────────────────────────────────────
  if (data.startsWith("finish_cleaning:")) {
    const assignmentId = data.split(":")[1];
    const now = new Date().toISOString();
    await (db.from("cleaning_assignments") as any).update({
      status: "done", finished_at: now,
    }).eq("id", assignmentId);

    const { data: finishAsgn }: { data: any } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (!finishAsgn) return;

    const apt = APARTMENT_RU[finishAsgn.apartment] ?? finishAsgn.apartment;
    const amount = finishAsgn.payment_amount ?? 35;

    await editMsg(chatId, messageId,
      `✅ <b>Уборка завершена!</b>\n🏠 ${apt} · 💰 ${amount}€ будет выплачено`,
      BOT_TOKEN);

    const { data: tx } = await db.from("emma_transactions").insert({
      transaction_type: "expense",
      amount,
      description: `Уборка ${apt} — ${finishAsgn.cleaner_name}`,
      counterparty: finishAsgn.cleaner_name,
      created_by: "00000000-0000-0000-0000-000000000001",
      transaction_date: now,
    }).select().maybeSingle();

    if (tx) {
      await (db.from("cleaning_assignments") as any).update({ payment_transaction_id: tx.id }).eq("id", assignmentId);
    }

    if (EMMA_CHAT_ID) {
      await sendMsg(EMMA_CHAT_ID,
        `✅ <b>Уборка завершена!</b>\n🏠 ${apt}\n👤 ${finishAsgn.cleaner_name}\n📅 ${finishAsgn.cleaning_date}\n💰 Выплатить: <b>${amount}€</b>`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: `✅ Выдала ${amount}€ ${finishAsgn.cleaner_name}`, callback_data: `confirm_payment:${assignmentId}` },
            ]],
          },
        },
        BOT_TOKEN,
      );
    }
    return;
  }
}

async function loadSlotContext(slotId: string) {
  const db = getSupabase();

  let assignment = null;
  let scheduleRow = null;

  const { data: slotAsgn }: { data: any } = await db.from("cleaning_assignments")
    .select("*")
    .eq("id", slotId)
    .neq("status", "cancelled")
    .maybeSingle();

  if (slotAsgn) {
    assignment = slotAsgn;
    if (slotAsgn.schedule_id) {
      const { data: sched } = await db.from("cleaning_schedule")
        .select("*")
        .eq("id", slotAsgn.schedule_id)
        .maybeSingle();
      scheduleRow = sched;
    }
  }

  if (!scheduleRow) {
    const { data: sched } = await db.from("cleaning_schedule")
      .select("*")
      .eq("id", slotId)
      .maybeSingle();

    if (sched) {
      scheduleRow = sched;
    }
  }

  if (!assignment && scheduleRow) {
    const effectiveDate = (scheduleRow as any).cleaning_date ?? (scheduleRow as any).checkout_date;
    const { data: matchAsgn }: { data: any } = await db.from("cleaning_assignments")
      .select("*")
      .or(`schedule_id.eq.${(scheduleRow as any).id},and(apartment.eq.${(scheduleRow as any).apartment},cleaning_date.eq.${effectiveDate})`)
      .neq("status", "cancelled")
      .maybeSingle();

    assignment = matchAsgn;
  }

  const apartment = (assignment as any)?.apartment ?? (scheduleRow as any)?.apartment ?? "?";
  const cleaningDate = (assignment as any)?.cleaning_date ?? (scheduleRow as any)?.cleaning_date ?? (scheduleRow as any)?.checkout_date ?? "?";

  return {
    assignment,
    scheduleRow,
    apartment,
    cleaningDate,
    aptName: APARTMENT_RU[apartment] ?? apartment,
    aptShort: APT_SHORT[apartment] ?? apartment,
    effectiveId: (assignment as any)?.id ?? (scheduleRow as any)?.id ?? slotId,
  };
}

// ─── Show slot detail (for admins) ───────────────────────────────────────────
async function showSlotDetail(chatId: number, messageId: number, slotId: string, BOT_TOKEN: string) {
  const { assignment, scheduleRow, cleaningDate, aptName, aptShort, effectiveId } = await loadSlotContext(slotId);

  if (!assignment && !scheduleRow) {
    await editMsg(chatId, messageId, "⚠️ Смена не найдена.", BOT_TOKEN);
    return;
  }

  let text = `📋 <b>Детали смены</b>\n\n`;
  text += `🏠 <b>${aptName}</b> (${aptShort})\n`;
  text += `📅 Дата уборки: ${fmtDateFull(cleaningDate)}\n`;
  
  if (scheduleRow) {
    if ((scheduleRow as any).checkin_date) text += `📆 Заезд: ${fmtDateFull((scheduleRow as any).checkin_date)}\n`;
    if ((scheduleRow as any).checkout_date) text += `📆 Выезд: ${fmtDateFull((scheduleRow as any).checkout_date)}\n`;
    if ((scheduleRow as any).guests_count) text += `👥 Гостей: ${(scheduleRow as any).guests_count}\n`;
  }

  if (assignment?.cleaner_name) {
    text += `\n👤 Уборщица: <b>${assignment.cleaner_name}</b>\n`;
    const statusLabel = assignment.status === "done" ? "✅ Завершено"
      : assignment.status === "started" ? "🧹 В процессе"
      : assignment.status === "paid" ? "💰 Оплачено"
      : "⏳ Ожидает";
    text += `📊 Статус: ${statusLabel}\n`;
    text += `💰 ЗП: ${assignment.payment_amount ?? 35}€\n`;
  } else {
    text += `\n🟢 <b>Смена свободна</b>\n`;
  }

  // Build action buttons
  const buttons: any[][] = [];

  if (assignment?.cleaner_name) {
    buttons.push([
      { text: "🔄 Заменить или удалить", callback_data: `rp:${effectiveId}` },
    ]);
  } else {
    // Can assign directly
    buttons.push([
      { text: "👤 Назначить уборщицу", callback_data: `rp:${effectiveId}` },
    ]);
  }

  await editMsg(chatId, messageId, text, BOT_TOKEN, { inline_keyboard: buttons });
}

// ─── Show replacement cleaner menu ───────────────────────────────────────────
async function showReplaceMenu(chatId: number, messageId: number, slotId: string, BOT_TOKEN: string) {
  const slot = await loadSlotContext(slotId);
  const db = getSupabase();

  if (!slot.assignment && !slot.scheduleRow) {
    await editMsg(chatId, messageId, "⚠️ Смена не найдена.", BOT_TOKEN);
    return;
  }
  
  const { data: cleaners } = await db.from("cleaners")
    .select("id, name, telegram_id")
    .eq("is_active", true)
    .order("name");

  if (!cleaners || cleaners.length === 0) {
    await editMsg(chatId, messageId, "⚠️ Нет активных уборщиц.", BOT_TOKEN);
    return;
  }

  const buttons: any[][] = [];
  for (let i = 0; i < cleaners.length; i++) {
    buttons.push([{
      text: `👤 ${cleaners[i].name}`,
      callback_data: `rc:${slot.effectiveId}:${i}`,
    }]);
  }

  if (slot.assignment?.cleaner_name) {
    buttons.push([{
      text: `🗑 Удалить: ${firstName(slot.assignment.cleaner_name)}`,
      callback_data: `rm:${slot.effectiveId}`,
    }]);
  }

  buttons.push([{ text: "⬅️ Назад", callback_data: `sd:${slot.effectiveId}` }]);

  await editMsg(chatId, messageId,
    `🔄 <b>Заменить или удалить</b>\n🏠 ${slot.aptShort} · ${fmtDateFull(slot.cleaningDate)}\n` +
    `👤 Сейчас: <b>${slot.assignment?.cleaner_name ?? "свободно"}</b>\n\nВыберите уборщицу:`,
    BOT_TOKEN, { inline_keyboard: buttons });
}

// ─── Do replace cleaner ──────────────────────────────────────────────────────
async function doReplaceCleaner(chatId: number, messageId: number, slotId: string, cleanerIdx: number, BOT_TOKEN: string) {
  const db = getSupabase();

  const { data: cleaners } = await db.from("cleaners")
    .select("id, name, telegram_id")
    .eq("is_active", true)
    .order("name");

  if (!cleaners || cleanerIdx >= cleaners.length) {
    await editMsg(chatId, messageId, "⚠️ Уборщица не найдена.", BOT_TOKEN);
    return;
  }

  const cleaner = cleaners[cleanerIdx];

  try {
    const result = await callBotApi("replace_cleaner", {
      schedule_id: slotId,
      id: slotId,
      assignment_id: slotId,
      new_cleaner_name: cleaner.name,
      new_cleaner_chat_id: cleaner.telegram_id ?? "0",
    });

    if (result.success) {
      const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
      await editMsg(chatId, messageId,
        `✅ <b>Замена выполнена!</b>\n🏠 ${apt} · 📅 ${fmtDateShort(result.cleaning_date)}\n❌ ${result.old_cleaner_name ?? "—"} → ✅ ${cleaner.name}`,
        BOT_TOKEN);
    } else {
      await editMsg(chatId, messageId, `⚠️ Не удалось заменить: ${result.error ?? "неизвестная ошибка"}`, BOT_TOKEN);
    }
  } catch (e) {
    console.error("Replace cleaner error:", e);
    await editMsg(chatId, messageId, "⚠️ Ошибка при замене уборщицы.", BOT_TOKEN);
  }
}

// ─── Do remove cleaner ───────────────────────────────────────────────────────
async function doRemoveCleaner(chatId: number, messageId: number, slotId: string, BOT_TOKEN: string) {
  try {
    const result = await callBotApi("remove_cleaner", {
      schedule_id: slotId,
      id: slotId,
      assignment_id: slotId,
    });

    if (result.success) {
      const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
      await editMsg(chatId, messageId,
        `🗑 <b>Уборщица удалена!</b>\n🏠 ${apt} · 📅 ${fmtDateShort(result.cleaning_date)}\n👤 ${result.removed_cleaner_name ?? "—"}`,
        BOT_TOKEN);
    } else {
      await editMsg(chatId, messageId, `⚠️ Не удалось удалить: ${result.error ?? "неизвестная ошибка"}`, BOT_TOKEN);
    }
  } catch (e) {
    console.error("Remove cleaner error:", e);
    await editMsg(chatId, messageId, "⚠️ Ошибка при удалении уборщицы.", BOT_TOKEN);
  }
}
