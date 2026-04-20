require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const ITEM_TYPE_NAMES = { sheets:"Простыни", duvet_covers:"Пододеяльники", pillowcases:"Наволочки", large_towels:"Большие полотенца", small_towels:"Маленькие полотенца", kitchen_towels:"Кухонные полотенца", rugs:"Коврики", beach_mat:"Пляжные подстилки", mattress_pad:"Наматрасники" };
const LOCATION_NAMES = { piral_1:"Пераль 1", piral_2:"Пераль 2", salvador:"Сальвадор", dirty_linen_piral:"Пераль (грязное бельё)", dirty_linen_salvador:"Сальвадор (грязное бельё)", clean_linen_piral:"Пераль (кладовка)", clean_linen_salvador:"Сальвадор (шкаф)", albert_laundry:"Прачечная Альберт", damaged:"Испорченное", purchase:"Закупка" };

const AI_PROMPT = `You are a laundry tracking assistant for vacation rentals in Spain.\nParse the Russian message and extract linen movement data.\n\nLOCATION RULES (girl writes only FROM, TO is always automatic):\n"Пераль 1","П1","Оазис 1" → from: "piral_1", to: "dirty_linen_piral"\n"Пераль 2","П2","Оазис 2" → from: "piral_2", to: "dirty_linen_piral"\n"Сальвадор","Salvador","Салв" → from: "salvador", to: "dirty_linen_salvador"\n"П1+П2","обе" → TWO movements: piral_1 and piral_2 both to dirty_linen_piral\n\nITEM TYPES: sheets,duvet_covers,pillowcases,large_towels,small_towels,kitchen_towels,rugs,beach_mat,mattress_pad\n\nReturn ONLY valid JSON:\n{"movements":[{"from_location":"piral_1","to_location":"dirty_linen_piral","apartment_name":"Пераль 1","items":[{"item_type":"sheets","quantity":2}]}],"needs_clarification":false,"cleaner_hint":"name if visible"}\nReturn null if not a linen movement message.`;

async function parseWithClaude(text) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content: `${AI_PROMPT}\n\nMessage to parse:\n${text}` }] }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();
  if (!content || content === "null") return null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.movements?.length && !parsed.needs_clarification) return null;
  return parsed;
}

async function sendWhatsAppMsg(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) return;
  const fromNumber = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const params = new URLSearchParams();
  params.append("From", fromNumber); params.append("To", toNumber); params.append("Body", body);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
}

function buildItemsList(items) { return items.map(item => `• ${ITEM_TYPE_NAMES[item.item_type] || item.item_type}: ${item.quantity}`).join("\n"); }

async function confirmPending(supabase, pendingId, irinaFrom) {
  const { data: pending, error } = await supabase.from("pending_movements").select("*").eq("id", pendingId).single();
  if (error || !pending) return { success: false, error: "Pending not found" };
  const rows = pending.items.map(item => ({ from_location: pending.from_location, to_location: pending.to_location, item_type: item.item_type, quantity: item.quantity, notes: `Bot: ${pending.source}`, created_at: new Date().toISOString() }));
  const { error: insertErr } = await supabase.from("movements").insert(rows);
  if (insertErr) return { success: false, error: insertErr.message };
  await supabase.from("pending_movements").update({ confirmed: true }).eq("id", pendingId);
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Madrid" });
  await sendWhatsAppMsg(irinaFrom, `✅ Внесено!\n\n📍 ${pending.apartment_name || pending.from_location}\n👤 ${pending.cleaner_name || "—"}\n\n${buildItemsList(pending.items)}\n\n⏰ ${now}`);
  return { success: true };
}

router.post("/whatsapp-webhook", async (req, res) => {
  res.setHeader("Content-Type", "text/xml");
  const EMPTY_RESP = "<Response></Response>";
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const irinaNumber = process.env.IRINA_WHATSAPP_NUMBER || "";

  try {
    let from = "", messageText = "", profileName = "";
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      from = req.body.From || ""; messageText = req.body.Body || ""; profileName = req.body.ProfileName || "";
    } else {
      from = req.body.From || ""; messageText = req.body.Body || ""; profileName = req.body.ProfileName || "";
    }

    if (!messageText.trim()) return res.send(EMPTY_RESP);

    const fromNorm = from.replace("whatsapp:", "");
    const irinaNorm = irinaNumber.replace("whatsapp:", "");
    const isIrina = irinaNumber && fromNorm === irinaNorm;

    if (isIrina) {
      const upperText = messageText.trim().toUpperCase();
      if (["ДА","YES","1"].includes(upperText)) {
        const { data: latest } = await supabase.from("pending_movements").select("*").eq("confirmed", false).eq("source", "whatsapp").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latest) { const result = await confirmPending(supabase, latest.id, from); if (!result.success) await sendWhatsAppMsg(from, `❌ Ошибка: ${result.error}`); }
        else await sendWhatsAppMsg(from, "❓ Нет ожидающих записей");
        return res.send(EMPTY_RESP);
      }
      if (["НЕТ","NO","2"].includes(upperText)) {
        const { data: latest } = await supabase.from("pending_movements").select("*").eq("confirmed", false).eq("source", "whatsapp").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latest) { await supabase.from("pending_movements").delete().eq("id", latest.id); await sendWhatsAppMsg(from, "❌ Отменено"); }
        else await sendWhatsAppMsg(from, "❓ Нет ожидающих записей");
        return res.send(EMPTY_RESP);
      }
    }

    let parsed;
    try { parsed = await parseWithClaude(messageText); }
    catch (err) { console.error("[whatsapp-webhook] Claude error:", err.message); return res.send(EMPTY_RESP); }
    if (!parsed) return res.send(EMPTY_RESP);

    const cleanerName = parsed.cleaner_hint || profileName || from;
    if (parsed.needs_clarification || !parsed.movements?.length) {
      if (irinaNumber) await sendWhatsAppMsg(irinaNumber, `⚠️ Не определён апартамент!\n👤 ${cleanerName}: "${messageText.substring(0, 120)}"\nОтветьте: П1, П2 или САЛ`);
      return res.send(EMPTY_RESP);
    }

    for (const movement of parsed.movements) {
      const { data: existing } = await supabase.from("pending_movements").select("id").eq("from_location", movement.from_location).eq("chat_id", from).eq("confirmed", false).maybeSingle();
      let pendingId;
      if (existing) {
        await supabase.from("pending_movements").update({ items: movement.items, apartment_name: movement.apartment_name, original_message: messageText, cleaner_name: cleanerName }).eq("id", existing.id);
        pendingId = existing.id;
      } else {
        const { data: inserted } = await supabase.from("pending_movements").insert({ from_location: movement.from_location, to_location: movement.to_location, items: movement.items, apartment_name: movement.apartment_name, original_message: messageText, cleaner_name: cleanerName, source: "whatsapp", chat_id: from, needs_clarification: false }).select().single();
        pendingId = inserted?.id;
      }
      if (!pendingId || !irinaNumber) continue;
      const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Madrid" });
      const irinaMsg = `🧺 Бельё из ${movement.apartment_name}\n👤 ${cleanerName}\n\n📋 Распознано:\n${buildItemsList(movement.items)}\n\n✅ Записать: ${LOCATION_NAMES[movement.from_location] || movement.from_location} → ${LOCATION_NAMES[movement.to_location] || movement.to_location}\n\n⏰ ${now}\n\nОтветьте:\nДА — внести ✅\nНЕТ — отменить ❌`;
      await sendWhatsAppMsg(irinaNumber, irinaMsg);
    }

    res.send(EMPTY_RESP);
  } catch (err) {
    console.error("[whatsapp-webhook]", err.message);
    res.send(EMPTY_RESP);
  }
});

module.exports = router;
