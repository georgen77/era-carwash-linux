require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = (0, createClient)(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
    );
  }
  return _supabase;
}
const APARTMENT_RU = {
  piral_1: "\u041E\u0430\u0437\u0438\u0441 1",
  piral_2: "\u041E\u0430\u0437\u0438\u0441 2",
  grande: "\u0413\u0440\u0430\u043D\u0434\u0435",
  salvador: "\u0421\u0430\u043B\u044C\u0432\u0430\u0434\u043E\u0440"
};
const APT_SHORT = {
  piral_1: "\u041E1",
  piral_2: "\u041E2",
  grande: "\u0413\u0440\u0430\u043D\u0434\u0435",
  salvador: "\u0421\u0430\u043B"
};
const PAYMENT_AMOUNT = {
  piral_1: 35,
  piral_2: 35,
  salvador: 35,
  grande: 70
};
function firstName(name) {
  if (!name) return "";
  return name.split(" ")[0];
}
async function resolveCleanerName(chatIdStr, fallbackName) {
  const db = getSupabase();
  const { data: rec } = await db.from("cleaners").select("name").eq("telegram_id", chatIdStr).maybeSingle();
  return rec?.name ?? fallbackName;
}
async function processUpdate(body) {
  const BOT_TOKEN = process.env.TELEGRAM_LINEN_BOT_TOKEN ?? "";
  const EMMA_CHAT_ID = process.env.EMMA_TELEGRAM_CHAT_ID ?? "";
  const IRINA_CHAT_ID = process.env.IRINA_TELEGRAM_CHAT_ID ?? "";
  const msg = body?.message;
  const cbq = body?.callback_query;
  if (cbq) {
    await handleCallback(cbq, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID);
  } else if (msg) {
    await handleMessage(msg, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID);
  }
}
async function sendMsg(chatId, text, extra = {}, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra })
  }).catch(console.error);
}
async function answerCbq(cbqId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cbqId, text })
  }).catch(console.error);
}
async function editMsg(chatId, messageId, text, token, replyMarkup) {
  const body = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).catch(console.error);
}
async function getFileUrl(fileId, token) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const d = await r.json();
    if (!d.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${d.result.file_path}`;
  } catch {
    return null;
  }
}
function fmtDateShort(d) {
  if (!d) return "";
  if (d.includes("-")) {
    const parts = d.split("-");
    return `${parts[2]}.${parts[1]}`;
  }
  return d;
}
function fmtDateFull(d) {
  if (!d) return "";
  if (d.includes("-")) {
    const parts = d.split("-");
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return d;
}
function buildSlotButtonText(slot) {
  const effectiveDate = slot.cleaning_date ?? slot.checkout_date ?? slot.checkin_date ?? "";
  const aptShort = APT_SHORT[slot.apartment ?? ""] ?? slot.apartment ?? "?";
  const cleanerLabel = slot.cleaner_name ? firstName(slot.cleaner_name) : "\u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E";
  return `${aptShort} \xB7 ${fmtDateFull(effectiveDate)} \xB7 ${cleanerLabel}`;
}
function stripCallbackPrefix(data, prefixes) {
  for (const prefix of prefixes) {
    if (data.startsWith(prefix)) {
      const value = data.slice(prefix.length).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
function parseSlotManagementCallback(data) {
  const replaceColon = data.match(/^(?:rc|replace_choice|replace_pick):([^:]+):(\d+)$/);
  if (replaceColon) {
    return { kind: "replace_pick", slotId: replaceColon[1], cleanerIdx: Number(replaceColon[2]) };
  }
  const replaceUnderscore = data.match(/^(?:rc|replace_choice|replace_pick)_([^_]+)_(\d+)$/);
  if (replaceUnderscore) {
    return { kind: "replace_pick", slotId: replaceUnderscore[1], cleanerIdx: Number(replaceUnderscore[2]) };
  }
  const detailId = stripCallbackPrefix(data, [
    "sd:",
    "slot:",
    "slot_",
    "schedule:",
    "schedule_",
    "detail:",
    "detail_",
    "shift:",
    "shift_",
    "open:",
    "open_"
  ]);
  if (detailId) return { kind: "detail", slotId: detailId };
  const replaceId = stripCallbackPrefix(data, [
    "rp:",
    "replace:",
    "replace_",
    "replace_cleaner:",
    "replace_cleaner_",
    "manage:",
    "manage_"
  ]);
  if (replaceId) return { kind: "replace_menu", slotId: replaceId };
  const removeId = stripCallbackPrefix(data, [
    "rm:",
    "remove:",
    "remove_",
    "delete:",
    "delete_",
    "remove_cleaner:",
    "remove_cleaner_",
    "delete_cleaner:",
    "delete_cleaner_"
  ]);
  if (removeId) return { kind: "remove", slotId: removeId };
  return null;
}
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "\u{1F4C5} \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }, { text: "\u270B \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0443\u0431\u043E\u0440\u043A\u0443" }],
        [{ text: "\u{1F4CB} \u041C\u043E\u0438 \u0441\u043C\u0435\u043D\u044B" }, { text: "\u{1F9FA} \u0413\u0440\u044F\u0437\u043D\u043E\u0435 \u0431\u0435\u043B\u044C\u0451" }],
        [{ text: "\u2753 \u041F\u043E\u043C\u043E\u0449\u044C" }]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
}
function isAdmin(chatIdStr) {
  const admins = [
    process.env.IRINA_TELEGRAM_CHAT_ID,
    process.env.EMMA_TELEGRAM_CHAT_ID,
    process.env.OWNER_TELEGRAM_CHAT_ID
  ].filter(Boolean);
  return admins.includes(chatIdStr);
}
async function callBotApi(action, payload = {}) {
  const url = `${process.env.SUPABASE_URL}/functions/v1/bot-api`;
  const secret = process.env.BOT_SECRET ?? "";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-secret": secret
    },
    body: JSON.stringify({ action, ...payload })
  });
  return resp.json();
}
async function handleMessage(msg, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID) {
  const chatId = msg.chat?.id;
  const text = (msg.text ?? "").trim();
  const from = msg.from;
  const chatIdStr = String(chatId);
  if (text === "/myid" || text.startsWith("/myid@")) {
    await sendMsg(chatId, `\u{1F194} \u0412\u0430\u0448 chat ID: <code>${chatId}</code>`, {}, BOT_TOKEN);
    return;
  }
  if (text === "/start" || text.startsWith("/start@")) {
    await sendMsg(
      chatId,
      "\u{1F44B} \u041F\u0440\u0438\u0432\u0435\u0442! \u042F \u0431\u043E\u0442 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0431\u0435\u043B\u044C\u0451\u043C \u0438 \u0443\u0431\u043E\u0440\u043A\u0430\u043C\u0438.\n\n\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u043C\u0435\u043D\u044E \u043D\u0438\u0436\u0435 \u0434\u043B\u044F \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438.",
      getMainKeyboard(),
      BOT_TOKEN
    );
    return;
  }
  if (text === "/status" || text.startsWith("/status@")) {
    await handleStatusCommand(chatId, chatIdStr, BOT_TOKEN);
    return;
  }
  if (text === "\u{1F4C5} \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435") {
    await handleScheduleMenu(chatId, chatIdStr, BOT_TOKEN, from);
    return;
  }
  if (text === "\u270B \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0443\u0431\u043E\u0440\u043A\u0443") {
    await handleFreeSlots(chatId, chatIdStr, from, BOT_TOKEN);
    return;
  }
  if (text === "\u{1F4CB} \u041C\u043E\u0438 \u0441\u043C\u0435\u043D\u044B") {
    await handleMyShifts(chatId, chatIdStr, BOT_TOKEN);
    return;
  }
  if (text === "\u{1F9FA} \u0413\u0440\u044F\u0437\u043D\u043E\u0435 \u0431\u0435\u043B\u044C\u0451") {
    await sendMsg(chatId, "\u{1F4E6} \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435\u043C \u0431\u0435\u043B\u044C\u044F \u0438\u043B\u0438 \u0444\u043E\u0442\u043E \u0447\u0435\u043A\u0430.", {}, BOT_TOKEN);
    return;
  }
  if (text === "\u2753 \u041F\u043E\u043C\u043E\u0449\u044C") {
    await sendMsg(
      chatId,
      "\u{1F4CB} <b>\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B:</b>\n\n\u{1F4C5} <b>\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435</b> \u2014 \u0432\u0441\u0435 \u0441\u043C\u0435\u043D\u044B \u043D\u0430 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0434\u043D\u0438\n\u270B <b>\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0443\u0431\u043E\u0440\u043A\u0443</b> \u2014 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0441\u043B\u043E\u0442\u044B\n\u{1F4CB} <b>\u041C\u043E\u0438 \u0441\u043C\u0435\u043D\u044B</b> \u2014 \u0432\u0430\u0448 \u043B\u0438\u0447\u043D\u044B\u0439 \u0433\u0440\u0430\u0444\u0438\u043A\n\u{1F9FA} <b>\u0413\u0440\u044F\u0437\u043D\u043E\u0435 \u0431\u0435\u043B\u044C\u0451</b> \u2014 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043E \u0431\u0435\u043B\u044C\u0435\n/myid \u2014 \u0443\u0437\u043D\u0430\u0442\u044C \u0441\u0432\u043E\u0439 chat ID\n/status \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0443\u0431\u043E\u0440\u043A\u0438",
      getMainKeyboard(),
      BOT_TOKEN
    );
    return;
  }
  if (msg.photo || msg.document) {
    await handlePhoto(msg, chatId, from, BOT_TOKEN, EMMA_CHAT_ID);
    return;
  }
  if (chatIdStr === IRINA_CHAT_ID && text.length > 10) {
    await handleScheduleParsing(text, chatId, BOT_TOKEN);
    return;
  }
  if (text.length > 3 && !text.startsWith("/")) {
    await handleLinenParsing(msg, chatId, from, text, BOT_TOKEN, EMMA_CHAT_ID);
    return;
  }
}
async function handleScheduleMenu(chatId, chatIdStr, BOT_TOKEN, _fromUser) {
  try {
    const result = await callBotApi("get_schedule");
    if (!result.success || !result.data || result.data.length === 0) {
      await sendMsg(chatId, "\u{1F4C5} \u041D\u0435\u0442 \u043F\u0440\u0435\u0434\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439.", getMainKeyboard(), BOT_TOKEN);
      return;
    }
    const isAdm = isAdmin(chatIdStr);
    const buttons = [];
    for (const slot of result.data.slice(0, 20)) {
      const effectiveDate = slot.cleaning_date ?? slot.checkout_date;
      if (!effectiveDate) continue;
      const buttonText = buildSlotButtonText(slot);
      const slotId = slot.assignment_id ?? slot.schedule_id ?? slot.id;
      if (isAdm) {
        buttons.push([{ text: buttonText, callback_data: `sd:${slotId}` }]);
      } else {
        if (!slot.cleaner_name) {
          buttons.push([{ text: `${buttonText} \u270B`, callback_data: `take_slot:${slotId}` }]);
        } else {
          buttons.push([{ text: buttonText, callback_data: `noop` }]);
        }
      }
    }
    if (buttons.length === 0) {
      await sendMsg(chatId, "\u{1F4C5} \u041D\u0435\u0442 \u043F\u0440\u0435\u0434\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0441\u043C\u0435\u043D.", getMainKeyboard(), BOT_TOKEN);
      return;
    }
    await sendMsg(
      chatId,
      "\u{1F4C5} <b>\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0443\u0431\u043E\u0440\u043E\u043A:</b>\n\n" + (isAdm ? "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u0441\u043C\u0435\u043D\u0443 \u0434\u043B\u044F \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F:" : "\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0441\u043B\u043E\u0442\u044B \u043C\u043E\u0436\u043D\u043E \u0432\u0437\u044F\u0442\u044C, \u043D\u0430\u0436\u0430\u0432 \u270B:"),
      { reply_markup: { inline_keyboard: buttons } },
      BOT_TOKEN
    );
  } catch (e) {
    console.error("Schedule menu error:", e);
    await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F.", getMainKeyboard(), BOT_TOKEN);
  }
}
async function handleFreeSlots(chatId, chatIdStr, from, BOT_TOKEN) {
  try {
    const result = await callBotApi("get_schedule");
    if (!result.success || !result.data) {
      await sendMsg(chatId, "\u{1F4C5} \u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0441\u043B\u043E\u0442\u043E\u0432.", getMainKeyboard(), BOT_TOKEN);
      return;
    }
    const freeSlots = result.data.filter((s) => !s.cleaner_name);
    if (freeSlots.length === 0) {
      await sendMsg(chatId, "\u{1F4C5} \u0412\u0441\u0435 \u0441\u043C\u0435\u043D\u044B \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442\u044B.", getMainKeyboard(), BOT_TOKEN);
      return;
    }
    const db = getSupabase();
    const { data: cleanerRec } = await db.from("cleaners").select("name").eq("telegram_id", chatIdStr).maybeSingle();
    const cleanerName = cleanerRec?.name ?? from?.first_name ?? "\u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430";
    const buttons = [];
    for (const slot of freeSlots.slice(0, 15)) {
      const effectiveDate = slot.cleaning_date ?? slot.checkout_date;
      if (!effectiveDate) continue;
      const aptShort = APT_SHORT[slot.apartment] ?? slot.apartment;
      const dateShort = fmtDateShort(effectiveDate);
      const fee = PAYMENT_AMOUNT[slot.apartment] ?? 35;
      const slotId = slot.schedule_id ?? slot.assignment_id ?? slot.id;
      buttons.push([{
        text: `\u270B ${dateShort} ${aptShort} \xB7 ${fee}\u20AC`,
        callback_data: `signup:${slotId}:${cleanerName.substring(0, 20)}`
      }]);
    }
    await sendMsg(chatId, "\u270B <b>\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0441\u043C\u0435\u043D\u044B:</b>\n\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F:", {
      reply_markup: { inline_keyboard: buttons }
    }, BOT_TOKEN);
  } catch (e) {
    console.error("Free slots error:", e);
    await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043B\u043E\u0442\u043E\u0432.", getMainKeyboard(), BOT_TOKEN);
  }
}
async function handleMyShifts(chatId, chatIdStr, BOT_TOKEN) {
  try {
    const result = await callBotApi("get_my_assignments", { chat_id: chatIdStr });
    if (!result.success || !result.data || result.data.length === 0) {
      await sendMsg(chatId, "\u{1F4CB} \u0423 \u0432\u0430\u0441 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0445 \u0441\u043C\u0435\u043D.", getMainKeyboard(), BOT_TOKEN);
      return;
    }
    let text = "\u{1F4CB} <b>\u0412\u0430\u0448\u0438 \u0441\u043C\u0435\u043D\u044B:</b>\n\n";
    const buttons = [];
    for (const a of result.data.slice(0, 10)) {
      const apt = APARTMENT_RU[a.apartment] ?? a.apartment;
      const statusLabel = a.status === "done" ? "\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" : a.status === "started" ? "\u{1F9F9} \u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" : a.status === "paid" ? "\u{1F4B0} \u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E" : a.status === "confirmed" ? "\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E" : "\u23F3 \u041E\u0436\u0438\u0434\u0430\u0435\u0442";
      text += `\u{1F3E0} <b>${apt}</b> \xB7 \u{1F4C5} ${fmtDateShort(a.cleaning_date)}
${statusLabel} \xB7 \u{1F4B0} ${a.payment_amount ?? 35}\u20AC

`;
      if (a.status === "confirmed" || a.status === "assigned" || a.status === "pending") {
        buttons.push([{ text: `\u{1F9F9} \u041D\u0430\u0447\u0430\u0442\u044C: ${APT_SHORT[a.apartment] ?? a.apartment} ${fmtDateShort(a.cleaning_date)}`, callback_data: `start_cleaning:${a.id}` }]);
      } else if (a.status === "started") {
        buttons.push([{ text: `\u2705 \u0417\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C: ${APT_SHORT[a.apartment] ?? a.apartment} ${fmtDateShort(a.cleaning_date)}`, callback_data: `finish_cleaning:${a.id}` }]);
      }
    }
    const extra = {};
    if (buttons.length > 0) {
      extra.reply_markup = { inline_keyboard: buttons };
    }
    await sendMsg(chatId, text, extra, BOT_TOKEN);
  } catch (e) {
    console.error("My shifts error:", e);
    await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043C\u0435\u043D.", getMainKeyboard(), BOT_TOKEN);
  }
}
async function handleStatusCommand(chatId, chatIdStr, BOT_TOKEN) {
  const db = getSupabase();
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const { data: statusData } = await db.from("cleaning_assignments").select("*").eq("cleaner_telegram_id", chatIdStr).gte("cleaning_date", today).order("cleaning_date", { ascending: true }).limit(5);
  if (!statusData || statusData.length === 0) {
    await sendMsg(chatId, "\u{1F4C5} \u0423 \u0432\u0430\u0441 \u043D\u0435\u0442 \u043F\u0440\u0435\u0434\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0443\u0431\u043E\u0440\u043E\u043A.", getMainKeyboard(), BOT_TOKEN);
    return;
  }
  let text = "\u{1F4CB} <b>\u0412\u0430\u0448\u0438 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0443\u0431\u043E\u0440\u043A\u0438:</b>\n\n";
  for (const a of statusData) {
    const apt = APARTMENT_RU[a.apartment] ?? a.apartment;
    const date = a.cleaning_date;
    const status = a.status === "done" ? "\u2705 \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E" : a.status === "started" ? "\u{1F9F9} \u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" : a.status === "confirmed" ? "\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E" : "\u23F3 \u041E\u0436\u0438\u0434\u0430\u0435\u0442";
    text += `\u{1F3E0} <b>${apt}</b> \xB7 ${date}
${status} \xB7 \u{1F4B0} ${a.payment_amount ?? 35}\u20AC

`;
  }
  await sendMsg(chatId, text, getMainKeyboard(), BOT_TOKEN);
}
async function handlePhoto(msg, chatId, from, BOT_TOKEN, EMMA_CHAT_ID) {
  const db = getSupabase();
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
  if (!ANTHROPIC_KEY) return;
  let fileId = null;
  if (msg.photo) {
    const photos = msg.photo;
    fileId = photos[photos.length - 1].file_id;
  } else if (msg.document?.mime_type?.startsWith("image/")) {
    fileId = msg.document.file_id;
  }
  if (!fileId) return;
  const fileUrl = await getFileUrl(fileId, BOT_TOKEN);
  if (!fileUrl) return;
  await sendMsg(chatId, "\u{1F50D} \u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u044E \u0447\u0435\u043A...", {}, BOT_TOKEN);
  try {
    const imgResp = await fetch(fileUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(String.fromCharCode(...new Uint8Array(imgBuffer).toString("base64")));
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: mimeType, data: base64 }
          }, {
            type: "text",
            text: `\u042D\u0442\u043E \u0447\u0435\u043A/\u043A\u0432\u0438\u0442\u0430\u043D\u0446\u0438\u044F. \u0418\u0437\u0432\u043B\u0435\u043A\u0438: 1) \u043E\u0431\u0449\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u0432 \u0435\u0432\u0440\u043E (\u0447\u0438\u0441\u043B\u043E), 2) \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430/\u0437\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u044F. 
\u041E\u0442\u0432\u0435\u0442\u044C \u0422\u041E\u041B\u042C\u041A\u041E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 JSON: {"amount": 12.50, "store": "Mercadona"}
\u0415\u0441\u043B\u0438 \u043D\u0435 \u043C\u043E\u0436\u0435\u0448\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u2014 {"amount": null, "store": null}`
          }]
        }]
      })
    });
    const claudeData = await claudeResp.json();
    const rawText = claudeData?.content?.[0]?.text ?? "";
    let amount = null;
    let store = null;
    try {
      const jsonMatch = rawText.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        amount = parsed.amount ?? null;
        store = parsed.store ?? null;
      }
    } catch {
    }
    const cleanerName = await resolveCleanerName(String(chatId), from?.first_name ?? from?.username ?? "Unknown");
    const fileName = `receipt_${Date.now()}.jpg`;
    const { data: uploadData } = await db.storage.from("receipts").upload(fileName, imgBuffer, { contentType: mimeType, upsert: true });
    const receiptUrl = uploadData ? `${process.env.SUPABASE_URL}/storage/v1/object/public/receipts/${fileName}` : fileUrl;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const { data: assignment } = await db.from("cleaning_assignments").select("*").eq("cleaner_name", cleanerName).lte("cleaning_date", today).order("cleaning_date", { ascending: false }).limit(1).maybeSingle();
    if (assignment && amount) {
      await db.from("cleaning_assignments").update({
        receipt_url: receiptUrl,
        receipt_amount: amount,
        receipt_store: store
      }).eq("id", assignment.id);
      const { data: newTx } = await db.from("emma_transactions").insert({
        transaction_type: "expense",
        amount,
        description: `\u0425\u043E\u0437\u0440\u0430\u0441\u0445\u043E\u0434\u044B: ${store ?? "\u0447\u0435\u043A \u043E\u0442 \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u044B"}`,
        counterparty: store,
        receipt_url: receiptUrl,
        created_by: "00000000-0000-0000-0000-000000000001",
        transaction_date: (/* @__PURE__ */ new Date()).toISOString()
      }).select().maybeSingle();
      if (EMMA_CHAT_ID && newTx) {
        const apt = APARTMENT_RU[assignment.apartment] ?? assignment.apartment;
        await sendMsg(
          EMMA_CHAT_ID,
          `\u{1F9FE} <b>\u0427\u0435\u043A \u043E\u0442 ${cleanerName}</b>
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${assignment.cleaning_date}
\u{1F4B0} \u0421\u0443\u043C\u043C\u0430: <b>${amount}\u20AC</b>${store ? ` \xB7 ${store}` : ""}

\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0430\u0441\u0445\u043E\u0434?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: `\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C ${amount}\u20AC`, callback_data: `confirm_receipt:${newTx.id}` },
                { text: "\u274C \u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C", callback_data: `reject_receipt:${newTx.id}` }
              ]]
            }
          },
          BOT_TOKEN
        );
      }
      await sendMsg(
        chatId,
        `\u2705 \u0427\u0435\u043A \u043F\u0440\u0438\u043D\u044F\u0442!
\u{1F4B0} ${amount}\u20AC${store ? ` \xB7 ${store}` : ""}
\u042D\u043C\u043C\u043E\u0447\u043A\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0430 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435.`,
        {},
        BOT_TOKEN
      );
    } else if (amount) {
      await sendMsg(chatId, `\u2705 \u0427\u0435\u043A \u043F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D: ${amount}\u20AC${store ? ` \xB7 ${store}` : ""}.
\u0423\u0431\u043E\u0440\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u2014 \u0447\u0435\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D.`, {}, BOT_TOKEN);
    } else {
      await sendMsg(chatId, "\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0442\u044C \u0441\u0443\u043C\u043C\u0443 \u043D\u0430 \u0447\u0435\u043A\u0435. \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0441\u043D\u043E\u0432\u0430 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u0443\u043C\u043C\u0443 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.", {}, BOT_TOKEN);
    }
  } catch (e) {
    console.error("OCR error:", e);
    await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u0447\u0435\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.", {}, BOT_TOKEN);
  }
}
async function handleScheduleParsing(text, chatId, BOT_TOKEN) {
  const db = getSupabase();
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
  if (!ANTHROPIC_KEY) return;
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `\u0418\u0437\u0432\u043B\u0435\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u043E \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F\u0445 \u0438\u0437 \u044D\u0442\u043E\u0433\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F. \u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0433\u043E\u0434: ${currentYear}.

\u041F\u0440\u0430\u0432\u0438\u043B\u0430:
- \u0424\u043E\u0440\u043C\u0430\u0442 \u0434\u0430\u0442 \u0432\u0445\u043E\u0434\u0430: DD.MM \u2192 \u043F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u0443\u0439 \u0432 YYYY-MM-DD (\u0434\u043E\u0431\u0430\u0432\u044C \u0433\u043E\u0434 ${currentYear})
- \u0410\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442\u044B: \u041E\u0430\u0437\u0438\u0441 1/\u041E1/\u041F1 \u2192 "piral_1", \u041E\u0430\u0437\u0438\u0441 2/\u041E2/\u041F2 \u2192 "piral_2", \u0413\u0440\u0430\u043D\u0434\u0435/Grande \u2192 "grande", \u0421\u0430\u043B\u044C\u0432\u0430\u0434\u043E\u0440/Salvador \u2192 "salvador"
- \u0415\u0441\u043B\u0438 \u0434\u0430\u0442\u0430 \u0432\u044B\u0435\u0437\u0434\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430 \u2014 \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u043E\u0436\u0438 \u043C\u0438\u043D\u0438\u043C\u0443\u043C 1 \u043D\u043E\u0447\u044C
- guests_count \u2014 \u0447\u0438\u0441\u043B\u043E \u0433\u043E\u0441\u0442\u0435\u0439 (\u0441\u0442\u0440\u043E\u043A\u0430)

\u041E\u0442\u0432\u0435\u0442\u044C \u0422\u041E\u041B\u042C\u041A\u041E JSON \u043C\u0430\u0441\u0441\u0438\u0432\u043E\u043C:
[{"apartment":"piral_1","checkin_date":"2026-03-20","checkout_date":"2026-03-25","guests_count":"4","notes":null}]

\u0415\u0441\u043B\u0438 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u043D\u0435\u0442 \u2014 \u0432\u0435\u0440\u043D\u0438 \u043F\u0443\u0441\u0442\u043E\u0439 \u043C\u0430\u0441\u0441\u0438\u0432 [].

\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435:
${text}`
        }]
      })
    });
    const data = await resp.json();
    const raw = data?.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await sendMsg(chatId, "\u{1F4CB} \u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u0432 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0438.", {}, BOT_TOKEN);
      return;
    }
    const bookings = JSON.parse(jsonMatch[0]);
    if (bookings.length === 0) {
      await sendMsg(chatId, "\u{1F4CB} \u0411\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E.", {}, BOT_TOKEN);
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
        source: "manual"
      }, { onConflict: "apartment,checkin_date" });
      saved++;
    }
    await sendMsg(
      chatId,
      `\u2705 \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E!
\u{1F4C5} \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439: <b>${saved}</b>

` + bookings.map(
        (b) => `\u{1F3E0} ${APARTMENT_RU[b.apartment] ?? b.apartment}: ${b.checkin_date} \u2192 ${b.checkout_date ?? "?"} (${b.guests_count ?? "?"} \u0433\u043E\u0441\u0442\u0435\u0439)`
      ).join("\n"),
      {},
      BOT_TOKEN
    );
  } catch (e) {
    console.error("Schedule parsing error:", e);
    await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0430\u0440\u0441\u0438\u043D\u0433\u0430 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F.", {}, BOT_TOKEN);
  }
}
async function handleLinenParsing(msg, chatId, from, text, BOT_TOKEN, EMMA_CHAT_ID) {
  const db = getSupabase();
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
  if (!ANTHROPIC_KEY) return;
  const linenKeywords = /простын|пододеяльник|наволочк|полотенц|кухонн|ковр|подстилк|наматрасник|лён|белье|бельё|убор|П1|П2|оазис|сальвадор/i;
  if (!linenKeywords.test(text)) return;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `\u0418\u0437\u0432\u043B\u0435\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u043E \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0438 \u0431\u0435\u043B\u044C\u044F. \u041F\u0440\u0430\u0432\u0438\u043B\u0430:
- item_type: sheets, duvet_covers, pillowcases, large_towels, small_towels, kitchen_towels, rugs, beach_mat, mattress_pad
- from_location: piral_1, piral_2, salvador, dirty_linen_piral, dirty_linen_salvador, clean_linen_piral, clean_linen_salvador, albert_laundry
- to_location: same options
- "\u041F1"/"\u041E\u0430\u0437\u0438\u0441 1" \u2192 piral_1, "\u041F2"/"\u041E\u0430\u0437\u0438\u0441 2" \u2192 piral_2

\u041E\u0442\u0432\u0435\u0442 JSON: {"apartment_name":"...","items":[{"item_type":"sheets","quantity":2,"from_location":"piral_1","to_location":"dirty_linen_piral"}]}

\u0422\u0435\u043A\u0441\u0442: ${text}`
        }]
      })
    });
    const data = await resp.json();
    const raw = data?.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    const movements = parsed.items ?? [];
    if (movements.length === 0) return;
    const cleanerName = from?.first_name ?? from?.username ?? "\u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430";
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
      confirmed: false
    }).select().maybeSingle()).data;
    const ITEM_RU = {
      sheets: "\u041F\u0440\u043E\u0441\u0442\u044B\u043D\u0438",
      duvet_covers: "\u041F\u043E\u0434\u043E\u0434\u0435\u044F\u043B\u044C\u043D\u0438\u043A\u0438",
      pillowcases: "\u041D\u0430\u0432\u043E\u043B\u043E\u0447\u043A\u0438",
      large_towels: "\u0411\u043E\u043B. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      small_towels: "\u041C\u0430\u043B. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      kitchen_towels: "\u041A\u0443\u0445. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      rugs: "\u041A\u043E\u0432\u0440\u0438\u043A\u0438",
      beach_mat: "\u041F\u043E\u0434\u0441\u0442\u0438\u043B\u043A\u0438",
      mattress_pad: "\u041D\u0430\u043C\u0430\u0442\u0440\u0430\u0441\u043D\u0438\u043A\u0438"
    };
    const summary = movements.map(
      (m) => `\u2022 ${ITEM_RU[m.item_type] ?? m.item_type}: ${m.quantity} \u0448\u0442.`
    ).join("\n");
    const aptName = parsed.apartment_name ?? movements[0]?.from_location ?? "\u0410\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442";
    await sendMsg(
      chatId,
      `\u{1F4E6} <b>\u0411\u0435\u043B\u044C\u0435 \u0438\u0437 ${aptName}</b>

${summary}

\u2705 \u0412\u0441\u0451 \u0432\u0435\u0440\u043D\u043E?`,
      pending ? {
        reply_markup: {
          inline_keyboard: [[
            { text: "\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", callback_data: `confirm_linen:${pending.id}` },
            { text: "\u274C \u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `cancel_linen:${pending.id}` }
          ]]
        }
      } : {},
      BOT_TOKEN
    );
  } catch (e) {
    console.error("Linen parsing error:", e);
  }
}
async function handleCallback(cbq, BOT_TOKEN, EMMA_CHAT_ID, IRINA_CHAT_ID) {
  const data = cbq.data ?? "";
  const chatId = cbq.message?.chat?.id;
  const messageId = cbq.message?.message_id;
  const chatIdStr = String(chatId);
  const db = getSupabase();
  await answerCbq(cbq.id, "", BOT_TOKEN);
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
  if (data.startsWith("signup:") || data.startsWith("signup_")) {
    const separator = data.startsWith("signup:") ? ":" : "_";
    const rest = data.startsWith("signup:") ? data.substring(7) : data.substring(7);
    const sepIdx = rest.indexOf(separator === ":" ? ":" : "_never_");
    let scheduleId;
    let cleanerName;
    if (separator === ":" && sepIdx > 0) {
      scheduleId = rest.substring(0, sepIdx);
      cleanerName = await resolveCleanerName(chatIdStr, rest.substring(sepIdx + 1));
    } else {
      scheduleId = rest;
      cleanerName = await resolveCleanerName(chatIdStr, cbq.from?.first_name ?? "\u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430");
    }
    try {
      const result = await callBotApi("signup_cleaning", {
        schedule_id: scheduleId,
        id: scheduleId,
        chat_id: chatIdStr,
        cleaner_name: cleanerName
      });
      if (result.success) {
        const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
        await editMsg(
          chatId,
          messageId,
          `\u2705 <b>\u0412\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u043B\u0438\u0441\u044C \u043D\u0430 \u0443\u0431\u043E\u0440\u043A\u0443!</b>
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${fmtDateShort(result.cleaning_date)}
\u{1F4B0} ${PAYMENT_AMOUNT[result.apartment] ?? 35}\u20AC`,
          BOT_TOKEN
        );
      } else if (result.conflict) {
        await editMsg(
          chatId,
          messageId,
          `\u26A0\uFE0F \u042D\u0442\u0430 \u0441\u043C\u0435\u043D\u0430 \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442\u0430: ${result.taken_by}`,
          BOT_TOKEN
        );
      } else {
        await editMsg(chatId, messageId, `\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F.`, BOT_TOKEN);
      }
    } catch (e) {
      console.error("Signup error:", e);
      await sendMsg(chatId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0438\u0441\u0438.", {}, BOT_TOKEN);
    }
    return;
  }
  if (data.startsWith("confirm_linen:")) {
    const pendingId = data.split(":")[1];
    const { data: pending } = await db.from("pending_movements").select("*").eq("id", pendingId).maybeSingle();
    if (!pending) return;
    const movements = pending.items ?? [];
    let savedCount = 0;
    for (const m of movements) {
      const { error } = await db.from("movements").insert({
        from_location: m.from_location,
        to_location: m.to_location,
        item_type: m.item_type,
        quantity: m.quantity,
        cleaner_name: pending.cleaner_name ?? null,
        notes: pending.original_message ?? null
      });
      if (!error) savedCount++;
    }
    await db.from("pending_movements").update({ confirmed: true }).eq("id", pendingId);
    const ITEM_RU = {
      sheets: "\u041F\u0440\u043E\u0441\u0442\u044B\u043D\u0438",
      duvet_covers: "\u041F\u043E\u0434\u043E\u0434\u0435\u044F\u043B\u044C\u043D\u0438\u043A\u0438",
      pillowcases: "\u041D\u0430\u0432\u043E\u043B\u043E\u0447\u043A\u0438",
      large_towels: "\u0411\u043E\u043B. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      small_towels: "\u041C\u0430\u043B. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      kitchen_towels: "\u041A\u0443\u0445. \u043F\u043E\u043B\u043E\u0442\u0435\u043D\u0446\u0430",
      rugs: "\u041A\u043E\u0432\u0440\u0438\u043A\u0438",
      beach_mat: "\u041F\u043E\u0434\u0441\u0442\u0438\u043B\u043A\u0438",
      mattress_pad: "\u041D\u0430\u043C\u0430\u0442\u0440\u0430\u0441\u043D\u0438\u043A\u0438"
    };
    const summary = movements.map(
      (m) => `\u2022 ${ITEM_RU[m.item_type] ?? m.item_type}: ${m.quantity} \u0448\u0442.`
    ).join("\n");
    await editMsg(
      chatId,
      messageId,
      `\u2705 <b>\u0411\u0435\u043B\u044C\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E!</b>

${summary}

\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u043F\u043E\u0437\u0438\u0446\u0438\u0439: ${savedCount}`,
      BOT_TOKEN
    );
    return;
  }
  if (data.startsWith("cancel_linen:")) {
    const pendingId = data.split(":")[1];
    await db.from("pending_movements").delete().eq("id", pendingId);
    await editMsg(chatId, messageId, "\u274C \u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E. \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.", BOT_TOKEN);
    return;
  }
  if (data.startsWith("confirm_payment:")) {
    const assignmentId = data.split(":")[1];
    const { data: payAsgn } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (!payAsgn) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await db.from("cleaning_assignments").update({
      payment_confirmed: true,
      payment_confirmed_at: now
    }).eq("id", assignmentId);
    if (payAsgn.payment_transaction_id) {
      await db.from("emma_transactions").update({
        transaction_date: now
      }).eq("id", payAsgn.payment_transaction_id);
    }
    const apt = APARTMENT_RU[payAsgn.apartment] ?? payAsgn.apartment;
    const amount = payAsgn.payment_amount ?? 35;
    await editMsg(
      chatId,
      messageId,
      `\u2705 \u0412\u044B\u043F\u043B\u0430\u0442\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430!
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${payAsgn.cleaning_date}
\u{1F464} ${payAsgn.cleaner_name}
\u{1F4B0} ${amount}\u20AC`,
      BOT_TOKEN
    );
    if (payAsgn.cleaner_telegram_id) {
      await sendMsg(
        payAsgn.cleaner_telegram_id,
        `\u{1F4B0} \u042D\u043C\u043C\u043E\u0447\u043A\u0430 \u0432\u044B\u0434\u0430\u043B\u0430 \u0432\u0430\u043C ${amount}\u20AC \u0437\u0430 \u0443\u0431\u043E\u0440\u043A\u0443 ${apt} (${payAsgn.cleaning_date}) \u2705`,
        {},
        BOT_TOKEN
      );
    }
    return;
  }
  if (data.startsWith("confirm_receipt:")) {
    const txId = data.split(":")[1];
    await editMsg(chatId, messageId, "\u2705 \u0420\u0430\u0441\u0445\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0432 \u043A\u0430\u0441\u0441\u0435 \u042D\u043C\u043C\u043E\u0447\u043A\u0438.", BOT_TOKEN);
    return;
  }
  if (data.startsWith("reject_receipt:")) {
    const txId = data.split(":")[1];
    await db.from("emma_transactions").delete().eq("id", txId);
    await editMsg(chatId, messageId, "\u274C \u0420\u0430\u0441\u0445\u043E\u0434 \u043E\u0442\u043A\u043B\u043E\u043D\u0451\u043D \u0438 \u0443\u0434\u0430\u043B\u0451\u043D.", BOT_TOKEN);
    return;
  }
  if (data.startsWith("take_slot:")) {
    const parts = data.split(":");
    const assignmentId = parts[1];
    const cleanerTgId = String(chatId);
    const rawCleanerName = parts.slice(2).join(":").trim();
    const cleanerName = await resolveCleanerName(cleanerTgId, rawCleanerName || cbq.from?.first_name || "\u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430");
    const { error } = await db.from("cleaning_assignments").update({
      cleaner_name: cleanerName,
      cleaner_telegram_id: cleanerTgId,
      status: "confirmed",
      confirmed_at: (/* @__PURE__ */ new Date()).toISOString(),
      confirmed_by: cleanerTgId
    }).eq("id", assignmentId).is("cleaner_name", null);
    if (error) {
      await sendMsg(chatId, "\u26A0\uFE0F \u042D\u0442\u043E\u0442 \u0441\u043B\u043E\u0442 \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442 \u0434\u0440\u0443\u0433\u043E\u0439 \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u0435\u0439.", {}, BOT_TOKEN);
    } else {
      const { data: asgn } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
      if (asgn) {
        const apt = APARTMENT_RU[asgn.apartment] ?? asgn.apartment;
        await editMsg(
          chatId,
          messageId,
          `\u2705 <b>\u0412\u044B \u0432\u0437\u044F\u043B\u0438 \u0443\u0431\u043E\u0440\u043A\u0443!</b>
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${asgn.cleaning_date}
\u{1F4B0} ${asgn.payment_amount ?? 35}\u20AC`,
          BOT_TOKEN
        );
        if (EMMA_CHAT_ID) {
          await sendMsg(
            EMMA_CHAT_ID,
            `\u2705 ${cleanerName} \u0432\u0437\u044F\u043B\u0430 \u0443\u0431\u043E\u0440\u043A\u0443
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${asgn.cleaning_date}`,
            {},
            BOT_TOKEN
          );
        }
      }
    }
    return;
  }
  if (data.startsWith("start_cleaning:")) {
    const assignmentId = data.split(":")[1];
    const { data: startAsgn, error: fetchErr } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (fetchErr || !startAsgn) {
      await editMsg(
        chatId,
        messageId,
        `\u274C \u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 (ID: ${assignmentId?.slice(0, 8)}\u2026). \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u043E\u043D\u0430 \u0431\u044B\u043B\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430.`,
        BOT_TOKEN
      );
      return;
    }
    const allowedStatuses = ["assigned", "confirmed", "pending"];
    if (!allowedStatuses.includes(startAsgn.status)) {
      const statusMessages = {
        started: "\u{1F9F9} \u0423\u0431\u043E\u0440\u043A\u0430 \u0443\u0436\u0435 \u043D\u0430\u0447\u0430\u0442\u0430!",
        done: "\u2705 \u0423\u0431\u043E\u0440\u043A\u0430 \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430.",
        completed: "\u2705 \u0423\u0431\u043E\u0440\u043A\u0430 \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430.",
        paid: "\u{1F4B0} \u0423\u0431\u043E\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430 \u0438 \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u0430.",
        cancelled: "\u274C \u042D\u0442\u0430 \u0441\u043C\u0435\u043D\u0430 \u0431\u044B\u043B\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430."
      };
      await editMsg(
        chatId,
        messageId,
        statusMessages[startAsgn.status] ?? `\u26A0\uFE0F \u041D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0447\u0430\u0442\u044C \u0443\u0431\u043E\u0440\u043A\u0443 (\u0441\u0442\u0430\u0442\u0443\u0441: ${startAsgn.status})`,
        BOT_TOKEN
      );
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { error: updErr } = await db.from("cleaning_assignments").update({
      status: "started",
      started_at: now
    }).eq("id", assignmentId);
    if (updErr) {
      await editMsg(
        chatId,
        messageId,
        `\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0443\u0431\u043E\u0440\u043A\u0438: ${updErr.message}`,
        BOT_TOKEN
      );
      return;
    }
    const apt = APARTMENT_RU[startAsgn.apartment] ?? startAsgn.apartment;
    await editMsg(
      chatId,
      messageId,
      `\u{1F9F9} <b>\u0423\u0431\u043E\u0440\u043A\u0430 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C!</b>
\u{1F3E0} ${apt} \xB7 \u23F0 ${(/* @__PURE__ */ new Date()).toLocaleTimeString("ru")}`,
      BOT_TOKEN
    );
    if (EMMA_CHAT_ID) {
      await sendMsg(
        EMMA_CHAT_ID,
        `\u{1F9F9} ${startAsgn.cleaner_name} \u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0431\u043E\u0440\u043A\u0443
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${startAsgn.cleaning_date}`,
        {},
        BOT_TOKEN
      );
    }
    return;
  }
  if (data.startsWith("finish_cleaning:")) {
    const assignmentId = data.split(":")[1];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await db.from("cleaning_assignments").update({
      status: "done",
      finished_at: now
    }).eq("id", assignmentId);
    const { data: finishAsgn } = await db.from("cleaning_assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (!finishAsgn) return;
    const apt = APARTMENT_RU[finishAsgn.apartment] ?? finishAsgn.apartment;
    const amount = finishAsgn.payment_amount ?? 35;
    await editMsg(
      chatId,
      messageId,
      `\u2705 <b>\u0423\u0431\u043E\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!</b>
\u{1F3E0} ${apt} \xB7 \u{1F4B0} ${amount}\u20AC \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u043F\u043B\u0430\u0447\u0435\u043D\u043E`,
      BOT_TOKEN
    );
    const { data: tx } = await db.from("emma_transactions").insert({
      transaction_type: "expense",
      amount,
      description: `\u0423\u0431\u043E\u0440\u043A\u0430 ${apt} \u2014 ${finishAsgn.cleaner_name}`,
      counterparty: finishAsgn.cleaner_name,
      created_by: "00000000-0000-0000-0000-000000000001",
      transaction_date: now
    }).select().maybeSingle();
    if (tx) {
      await db.from("cleaning_assignments").update({ payment_transaction_id: tx.id }).eq("id", assignmentId);
    }
    if (EMMA_CHAT_ID) {
      await sendMsg(
        EMMA_CHAT_ID,
        `\u2705 <b>\u0423\u0431\u043E\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!</b>
\u{1F3E0} ${apt}
\u{1F464} ${finishAsgn.cleaner_name}
\u{1F4C5} ${finishAsgn.cleaning_date}
\u{1F4B0} \u0412\u044B\u043F\u043B\u0430\u0442\u0438\u0442\u044C: <b>${amount}\u20AC</b>`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: `\u2705 \u0412\u044B\u0434\u0430\u043B\u0430 ${amount}\u20AC ${finishAsgn.cleaner_name}`, callback_data: `confirm_payment:${assignmentId}` }
            ]]
          }
        },
        BOT_TOKEN
      );
    }
    return;
  }
}
async function loadSlotContext(slotId) {
  const db = getSupabase();
  let assignment = null;
  let scheduleRow = null;
  const { data: slotAsgn } = await db.from("cleaning_assignments").select("*").eq("id", slotId).neq("status", "cancelled").maybeSingle();
  if (slotAsgn) {
    assignment = slotAsgn;
    if (slotAsgn.schedule_id) {
      const { data: sched } = await db.from("cleaning_schedule").select("*").eq("id", slotAsgn.schedule_id).maybeSingle();
      scheduleRow = sched;
    }
  }
  if (!scheduleRow) {
    const { data: sched } = await db.from("cleaning_schedule").select("*").eq("id", slotId).maybeSingle();
    if (sched) {
      scheduleRow = sched;
    }
  }
  if (!assignment && scheduleRow) {
    const effectiveDate = scheduleRow.cleaning_date ?? scheduleRow.checkout_date;
    const { data: matchAsgn } = await db.from("cleaning_assignments").select("*").or(`schedule_id.eq.${scheduleRow.id},and(apartment.eq.${scheduleRow.apartment},cleaning_date.eq.${effectiveDate})`).neq("status", "cancelled").maybeSingle();
    assignment = matchAsgn;
  }
  const apartment = assignment?.apartment ?? scheduleRow?.apartment ?? "?";
  const cleaningDate = assignment?.cleaning_date ?? scheduleRow?.cleaning_date ?? scheduleRow?.checkout_date ?? "?";
  return {
    assignment,
    scheduleRow,
    apartment,
    cleaningDate,
    aptName: APARTMENT_RU[apartment] ?? apartment,
    aptShort: APT_SHORT[apartment] ?? apartment,
    effectiveId: assignment?.id ?? scheduleRow?.id ?? slotId
  };
}
async function showSlotDetail(chatId, messageId, slotId, BOT_TOKEN) {
  const { assignment, scheduleRow, cleaningDate, aptName, aptShort, effectiveId } = await loadSlotContext(slotId);
  if (!assignment && !scheduleRow) {
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430.", BOT_TOKEN);
    return;
  }
  let text = `\u{1F4CB} <b>\u0414\u0435\u0442\u0430\u043B\u0438 \u0441\u043C\u0435\u043D\u044B</b>

`;
  text += `\u{1F3E0} <b>${aptName}</b> (${aptShort})
`;
  text += `\u{1F4C5} \u0414\u0430\u0442\u0430 \u0443\u0431\u043E\u0440\u043A\u0438: ${fmtDateFull(cleaningDate)}
`;
  if (scheduleRow) {
    if (scheduleRow.checkin_date) text += `\u{1F4C6} \u0417\u0430\u0435\u0437\u0434: ${fmtDateFull(scheduleRow.checkin_date)}
`;
    if (scheduleRow.checkout_date) text += `\u{1F4C6} \u0412\u044B\u0435\u0437\u0434: ${fmtDateFull(scheduleRow.checkout_date)}
`;
    if (scheduleRow.guests_count) text += `\u{1F465} \u0413\u043E\u0441\u0442\u0435\u0439: ${scheduleRow.guests_count}
`;
  }
  if (assignment?.cleaner_name) {
    text += `
\u{1F464} \u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430: <b>${assignment.cleaner_name}</b>
`;
    const statusLabel = assignment.status === "done" ? "\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" : assignment.status === "started" ? "\u{1F9F9} \u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" : assignment.status === "paid" ? "\u{1F4B0} \u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E" : "\u23F3 \u041E\u0436\u0438\u0434\u0430\u0435\u0442";
    text += `\u{1F4CA} \u0421\u0442\u0430\u0442\u0443\u0441: ${statusLabel}
`;
    text += `\u{1F4B0} \u0417\u041F: ${assignment.payment_amount ?? 35}\u20AC
`;
  } else {
    text += `
\u{1F7E2} <b>\u0421\u043C\u0435\u043D\u0430 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u0430</b>
`;
  }
  const buttons = [];
  if (assignment?.cleaner_name) {
    buttons.push([
      { text: "\u{1F504} \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0438\u0442\u044C", callback_data: `rp:${effectiveId}` }
    ]);
  } else {
    buttons.push([
      { text: "\u{1F464} \u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u0443", callback_data: `rp:${effectiveId}` }
    ]);
  }
  await editMsg(chatId, messageId, text, BOT_TOKEN, { inline_keyboard: buttons });
}
async function showReplaceMenu(chatId, messageId, slotId, BOT_TOKEN) {
  const slot = await loadSlotContext(slotId);
  const db = getSupabase();
  if (!slot.assignment && !slot.scheduleRow) {
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430.", BOT_TOKEN);
    return;
  }
  const { data: cleaners } = await db.from("cleaners").select("id, name, telegram_id").eq("is_active", true).order("name");
  if (!cleaners || cleaners.length === 0) {
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0443\u0431\u043E\u0440\u0449\u0438\u0446.", BOT_TOKEN);
    return;
  }
  const buttons = [];
  for (let i = 0; i < cleaners.length; i++) {
    buttons.push([{
      text: `\u{1F464} ${cleaners[i].name}`,
      callback_data: `rc:${slot.effectiveId}:${i}`
    }]);
  }
  if (slot.assignment?.cleaner_name) {
    buttons.push([{
      text: `\u{1F5D1} \u0423\u0434\u0430\u043B\u0438\u0442\u044C: ${firstName(slot.assignment.cleaner_name)}`,
      callback_data: `rm:${slot.effectiveId}`
    }]);
  }
  buttons.push([{ text: "\u2B05\uFE0F \u041D\u0430\u0437\u0430\u0434", callback_data: `sd:${slot.effectiveId}` }]);
  await editMsg(
    chatId,
    messageId,
    `\u{1F504} <b>\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0438\u0442\u044C</b>
\u{1F3E0} ${slot.aptShort} \xB7 ${fmtDateFull(slot.cleaningDate)}
\u{1F464} \u0421\u0435\u0439\u0447\u0430\u0441: <b>${slot.assignment?.cleaner_name ?? "\u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E"}</b>

\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u0443:`,
    BOT_TOKEN,
    { inline_keyboard: buttons }
  );
}
async function doReplaceCleaner(chatId, messageId, slotId, cleanerIdx, BOT_TOKEN) {
  const db = getSupabase();
  const { data: cleaners } = await db.from("cleaners").select("id, name, telegram_id").eq("is_active", true).order("name");
  if (!cleaners || cleanerIdx >= cleaners.length) {
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430.", BOT_TOKEN);
    return;
  }
  const cleaner = cleaners[cleanerIdx];
  try {
    const result = await callBotApi("replace_cleaner", {
      schedule_id: slotId,
      id: slotId,
      assignment_id: slotId,
      new_cleaner_name: cleaner.name,
      new_cleaner_chat_id: cleaner.telegram_id ?? "0"
    });
    if (result.success) {
      const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
      await editMsg(
        chatId,
        messageId,
        `\u2705 <b>\u0417\u0430\u043C\u0435\u043D\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430!</b>
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${fmtDateShort(result.cleaning_date)}
\u274C ${result.old_cleaner_name ?? "\u2014"} \u2192 \u2705 ${cleaner.name}`,
        BOT_TOKEN
      );
    } else {
      await editMsg(chatId, messageId, `\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u044C: ${result.error ?? "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"}`, BOT_TOKEN);
    }
  } catch (e) {
    console.error("Replace cleaner error:", e);
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043C\u0435\u043D\u0435 \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u044B.", BOT_TOKEN);
  }
}
async function doRemoveCleaner(chatId, messageId, slotId, BOT_TOKEN) {
  try {
    const result = await callBotApi("remove_cleaner", {
      schedule_id: slotId,
      id: slotId,
      assignment_id: slotId
    });
    if (result.success) {
      const apt = APARTMENT_RU[result.apartment] ?? result.apartment;
      await editMsg(
        chatId,
        messageId,
        `\u{1F5D1} <b>\u0423\u0431\u043E\u0440\u0449\u0438\u0446\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430!</b>
\u{1F3E0} ${apt} \xB7 \u{1F4C5} ${fmtDateShort(result.cleaning_date)}
\u{1F464} ${result.removed_cleaner_name ?? "\u2014"}`,
        BOT_TOKEN
      );
    } else {
      await editMsg(chatId, messageId, `\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C: ${result.error ?? "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"}`, BOT_TOKEN);
    }
  } catch (e) {
    console.error("Remove cleaner error:", e);
    await editMsg(chatId, messageId, "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438 \u0443\u0431\u043E\u0440\u0449\u0438\u0446\u044B.", BOT_TOKEN);
  }
}
module.exports = { processUpdate };
