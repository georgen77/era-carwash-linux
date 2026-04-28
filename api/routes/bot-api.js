require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const APT_DISPLAY = {
  piral_1: "Оазис 1",
  piral_2: "Оазис 2",
  grande: "Гранде",
  salvador: "Сальвадор",
};

const APT_FEE = {
  piral_1: 35,
  piral_2: 35,
  grande: 70,
  salvador: 35,
};

const DIRTY_LINEN_LOCATION = {
  piral_1: "dirty_linen_piral",
  piral_2: "dirty_linen_piral",
  grande: "dirty_linen_piral",
  salvador: "dirty_linen_salvador",
};

const CLEANER_NAME_ALIASES = {
  Helga: "Ольга",
  Vika: "Вика",
  Viktoria: "Вика",
  Viktoriia: "Вика",
  Irina: "Ирина",
  Iryna: "Ирина",
};

const CLEANER_LOOKUP_CANDIDATES = {
  "Ольга": ["Ольга", "Helga"],
  "Вика": ["Вика", "Vika", "Viktoria", "Viktoriia"],
  "Ирина": ["Ирина", "Irina", "Iryna"],
  "Марьяна": ["Марьяна", "Maryana", "Mariana"],
};

const STANDARD_LINEN = [
  { item_type: "sheets",        quantity: 1 },
  { item_type: "duvet_covers",  quantity: 1 },
  { item_type: "pillowcases",   quantity: 2 },
  { item_type: "large_towels",  quantity: 2 },
  { item_type: "small_towels",  quantity: 2 },
  { item_type: "kitchen_towels",quantity: 1 },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getTelegramToken() {
  return process.env.TELEGRAM_LINEN_BOT_TOKEN?? process.env.TELEGRAM_BOT_TOKEN?? null;
}

function getAdminChatIds() {
  return [
    process.env.IRINA_TELEGRAM_CHAT_ID,
    process.env.EMMA_TELEGRAM_CHAT_ID,
    process.env.OWNER_TELEGRAM_CHAT_ID,
  ].filter(Boolean);
}

async function sendTg(token, chatId, text, parseMode = "Markdown", replyMarkup) {
  try {
    const body = { chat_id: String(chatId), text, parse_mode: parseMode };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[sendTg] error sending to ${chatId}:`, e);
  }
}

/** Notify all admins (Irina, Emma, Owner) */
async function notifyAdmins(text) {
  const token = getTelegramToken();
  if (!token) return;
  for (const chatId of getAdminChatIds()) {
    await sendTg(token, chatId, text);
  }
}

/** Notify a specific cleaner */
async function notifyCleaner(chatId, text) {
  const token = getTelegramToken();
  if (!token || !chatId) return;
  await sendTg(token, chatId, text);
}

function fmtDate(d) {
  if (!d) return "";
  if (d.includes("-")) {
    const parts = d.split("-");
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return d;
}

function normalizeCleanerName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  return CLEANER_NAME_ALIASES[trimmed] ?? trimmed;
}

function getCleanerLookupCandidates(name) {
  const normalized = normalizeCleanerName(name);
  if (!normalized) return [];
  return Array.from(new Set([normalized, ...(CLEANER_LOOKUP_CANDIDATES[normalized] ?? [])]));
}

function normalizeTelegramId(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed && trimmed !== "0" ? trimmed : null;
}

function normalizeAssignment(row) {
  return {
    ...row,
    cleaner_name: normalizeCleanerName(row?.cleaner_name),
    cleaner_telegram_id: normalizeTelegramId(row?.cleaner_telegram_id),
  };
}

function assignmentKey(row) {
  if (row?.schedule_id) return `schedule:${row.schedule_id}`;
  return `manual:${row?.apartment ?? ""}:${row?.cleaning_date ?? ""}`;
}

function assignmentPriority(row) {
  let score = 0;
  if (normalizeCleanerName(row?.cleaner_name)) score += 1000;
  if (normalizeTelegramId(row?.cleaner_telegram_id)) score += 100;
  if (row?.status && row.status !== "cancelled") score += 10;
  if (row?.registered_at) score += new Date(row.registered_at).getTime() / 1_000_000_000_000_000;
  return score;
}

function dedupeAssignments(rows) {
  const grouped = new Map();

  for (const row of rows ?? []) {
    const normalized = normalizeAssignment(row);
    const key = assignmentKey(normalized);
    const existing = grouped.get(key);

    if (!existing || assignmentPriority(normalized) >= assignmentPriority(existing)) {
      grouped.set(key, normalized);
    }
  }

  return Array.from(grouped.values());
}

function pickBestAssignment(rows) {
  const deduped = dedupeAssignments(rows ?? []);
  if (deduped.length === 0) return null;
  return deduped.sort((a, b) => assignmentPriority(b) - assignmentPriority(a))[0] ?? null;
}

/** Get cleaner's first name from full name for greeting */
function firstName(name) {
  const normalized = normalizeCleanerName(name);
  if (!normalized) return "";
  return normalized.split(" ")[0];
}

function getEffectiveDate(row) {
  return row.cleaning_date ?? row.checkout_date ?? row.checkin_date ?? null;
}

function getDateRange(row) {
  return {
    start: row.checkin_date ?? row.cleaning_date ?? row.checkout_date ?? null,
    end: row.checkout_date ?? row.cleaning_date ?? row.checkin_date ?? null,
  };
}

function sameGrandeSlot(
  a,
  b,
) {
  if (a.checkin_date && a.checkout_date && b.checkin_date && b.checkout_date) {
    return a.checkin_date === b.checkin_date && a.checkout_date === b.checkout_date;
  }

  return getEffectiveDate(a) === getEffectiveDate(b);
}

function rangesOverlap(
  a,
  b,
) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return a.start <= b.end && b.start <= a.end;
}

function suppressGrandeOverlaps(rows) {
  const grandeRows = rows.filter((row) => row.apartment === "grande");
  if (grandeRows.length === 0) return rows;

  return rows.filter((row) => {
    if (row.apartment !== "piral_1" && row.apartment !== "piral_2") return true;
    return !grandeRows.some((grande) => sameGrandeSlot(row, grande));
  });
}

async function lookupCleanerChatId(supabase, cleanerName) {
  const candidates = getCleanerLookupCandidates(cleanerName);
  if (candidates.length === 0) return null;

  const { data, error } = await supabase
    .from("cleaners")
    .select("name, telegram_id")
    .in("name", candidates)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;

  const cleanerHit = (data ?? []).find((row) => normalizeTelegramId(row?.telegram_id));
  if (cleanerHit) return normalizeTelegramId(cleanerHit.telegram_id);

  const { data: assignmentHits, error: assignmentError } = await supabase
    .from("cleaning_assignments")
    .select("cleaner_name, cleaner_telegram_id, registered_at, cleaning_date")
    .in("cleaner_name", candidates)
    .not("cleaner_telegram_id", "is", null)
    .order("registered_at", { ascending: false })
    .order("cleaning_date", { ascending: false })
    .limit(20);

  if (assignmentError) throw assignmentError;

  const assignmentHit = (assignmentHits ?? []).find((row) => normalizeTelegramId(row?.cleaner_telegram_id));
  if (assignmentHit) return normalizeTelegramId(assignmentHit.cleaner_telegram_id);

  const { data: messageHits, error: messageError } = await supabase
    .from("telegram_messages")
    .select("chat_id, user_first_name, created_at")
    .in("user_first_name", candidates)
    .order("created_at", { ascending: false })
    .limit(20);

  if (messageError) throw messageError;

  const messageHit = (messageHits ?? []).find((row) => normalizeTelegramId(row?.chat_id));
  return normalizeTelegramId(messageHit?.chat_id);
}

async function getEquivalentAssignments(supabase, assignment) {
  if (!assignment?.apartment || !assignment?.cleaning_date) {
    return assignment ? [normalizeAssignment(assignment)] : [];
  }

  if (assignment.schedule_id) {
    const { data, error } = await supabase
      .from("cleaning_assignments")
      .select("*")
      .or(`schedule_id.eq.${assignment.schedule_id},and(apartment.eq.${assignment.apartment},cleaning_date.eq.${assignment.cleaning_date})`)
      .neq("status", "cancelled");

    if (error) throw error;
    return (data ?? []).map(normalizeAssignment);
  }

  const { data, error } = await supabase
    .from("cleaning_assignments")
    .select("*")
    .eq("apartment", assignment.apartment)
    .eq("cleaning_date", assignment.cleaning_date)
    .neq("status", "cancelled");

  if (error) throw error;
  return (data ?? []).map(normalizeAssignment);
}

async function findAssignmentRecord(
  supabase,
  refs,
) {
  const directId = refs.assignment_id ?? refs.id ?? null;
  const scheduleRef = refs.schedule_id ?? refs.id ?? null;

  if (directId) {
    const { data, error } = await supabase
      .from("cleaning_assignments")
      .select("*")
      .eq("id", directId)
      .neq("status", "cancelled")
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (!scheduleRef) return null;

  const { data: bySchedule, error: scheduleError } = await supabase
    .from("cleaning_assignments")
    .select("*")
    .eq("schedule_id", scheduleRef)
    .neq("status", "cancelled");

  if (scheduleError) throw scheduleError;
  const bestBySchedule = pickBestAssignment(bySchedule ?? []);
  if (bestBySchedule) return bestBySchedule;

  const { data: scheduleRow, error: scheduleLookupError } = await supabase
    .from("cleaning_schedule")
    .select("apartment, cleaning_date, checkout_date")
    .eq("id", scheduleRef)
    .maybeSingle();

  if (scheduleLookupError) throw scheduleLookupError;

  if (scheduleRow) {
    const effectiveDate = scheduleRow.cleaning_date ?? scheduleRow.checkout_date;

    if (effectiveDate) {
      const { data: byApartmentDate, error: apartmentDateError } = await supabase
        .from("cleaning_assignments")
        .select("*")
        .eq("apartment", scheduleRow.apartment)
        .eq("cleaning_date", effectiveDate)
        .neq("status", "cancelled");

      if (apartmentDateError) throw apartmentDateError;
      const bestByApartmentDate = pickBestAssignment(byApartmentDate ?? []);
      if (bestByApartmentDate) return bestByApartmentDate;
    }
  }

  if (!directId) {
    const { data: byId, error: idError } = await supabase
      .from("cleaning_assignments")
      .select("*")
      .eq("id", scheduleRef)
      .neq("status", "cancelled");

    if (idError) throw idError;
    const bestById = pickBestAssignment(byId ?? []);
    if (bestById) return bestById;
  }

  return null;
}

router.post("/bot-api", async (req, res) => {
  try {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const botSecret = req.headers.get("x-bot-secret");
  const expectedSecret = process.env.BOT_SECRET;
  const authHeader = req.headers.get("authorization");

  // Allow access via x-bot-secret OR via Supabase auth (anon/service key)
  const hasValidBotSecret = botSecret && botSecret === expectedSecret;
  const hasSupabaseAuth = authHeader && authHeader.startsWith("Bearer ");

  if (!hasValidBotSecret && !hasSupabaseAuth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body = {};
  try {
    body = req.body;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { action } = body;
  console.log("[bot-api] action:", action, "body keys:", Object.keys(body).join(","));
  if (!action) {
    return new Response(
      JSON.stringify({ error: "Missing action field" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY?? ""
  );

  try {
    switch (action) {

      // ─── 1. GET PENDING MOVEMENTS ───────────────────────────────────────
      case "get_pending": {
        const { data, error } = await supabase
          .from("pending_movements")
          .select("*")
          .eq("confirmed", false)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 2. CONFIRM MOVEMENT ────────────────────────────────────────────
      case "confirm_movement": {
        const { id } = body;
        if (!id) return json({ error: "Missing id" }, 400);

        const { data: pending, error: fetchErr } = await supabase
          .from("pending_movements")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchErr || !pending) return json({ error: "Pending movement not found" }, 404);

        if (pending.confirmed === true) {
          return json({ success: false, already_confirmed: true });
        }

        const items = Array.isArray(pending.items) ? pending.items : [];
        const inserted = [];

        const fixLocation = (loc) => {
          if (!loc) return null;
          if (loc === "piral") return "piral_1";
          if (loc === "dirty_linen") return "dirty_linen_piral";
          if (loc === "clean_linen") return "clean_linen_piral";
          return loc;
        };

        for (const item of items) {
          const { data: mov, error: insErr } = await supabase
            .from("movements")
            .insert({
              from_location: fixLocation(pending.from_location ?? item.from_location),
              to_location: fixLocation(pending.to_location ?? item.to_location),
              item_type: item.item_type ?? item.type,
              quantity: item.quantity ?? 1,
              cleaner_name: pending.cleaner_name,
              notes: pending.original_message,
            })
            .select()
            .single();

          if (insErr) throw insErr;
          inserted.push(mov);
        }

        await supabase
          .from("pending_movements")
          .update({ confirmed: true })
          .eq("id", id);

        return json({ success: true, inserted_count: inserted.length, data: inserted });
      }

      // ─── 3. REJECT MOVEMENT ─────────────────────────────────────────────
      case "reject_movement": {
        const { id } = body;
        if (!id) return json({ error: "Missing id" }, 400);

        const { error } = await supabase
          .from("pending_movements")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return json({ success: true });
      }

      // ─── 4. SAVE PENDING ─────────────────────────────────────────────────
      case "save_pending": {
        const {
          items, from_location, to_location, apartment_name,
          original_message, cleaner_name, source, chat_id,
          telegram_message_id, whatsapp_message_sid, needs_clarification,
        } = body;

        const { data, error } = await supabase
          .from("pending_movements")
          .insert({
            items: items ?? null,
            from_location: from_location ?? null,
            to_location: to_location ?? null,
            apartment_name: apartment_name ?? null,
            original_message: original_message ?? null,
            cleaner_name: cleaner_name ?? null,
            source: source ?? "telegram",
            chat_id: chat_id ? String(chat_id) : null,
            telegram_message_id: telegram_message_id ? String(telegram_message_id) : null,
            whatsapp_message_sid: whatsapp_message_sid ?? null,
            needs_clarification: needs_clarification ?? false,
            confirmed: false,
          })
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 5. GET SCHEDULE ─────────────────────────────────────────────────
      case "get_schedule": {
        const today = new Date().toISOString().split("T")[0];
        const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const { data: schedules, error } = await supabase
          .from("cleaning_schedule")
          .select("*")
          .gte("checkout_date", today)
          .lte("checkout_date", in60)
          .order("checkout_date", { ascending: true });

        if (error) throw error;

        // Fetch ALL non-cancelled assignments in the date range, including manual slots without cleaning_schedule
        const { data: allAssignments, error: assignmentsError } = await supabase
          .from("cleaning_assignments")
          .select("id, schedule_id, cleaner_name, cleaner_telegram_id, status, apartment, cleaning_date, next_guests, payment_amount, registered_at")
          .gte("cleaning_date", today)
          .lte("cleaning_date", in60)
          .neq("status", "cancelled");

        if (assignmentsError) throw assignmentsError;

        const cleanedAssignments = dedupeAssignments(allAssignments ?? []);
        const matchedAssignmentIds = new Set();

        const scheduleRows = (schedules ?? []).map((s) => {
          const effectiveDate = getEffectiveDate(s);

          const matched = cleanedAssignments.filter((a) =>
            (a.schedule_id && a.schedule_id === s.id) ||
            (!a.schedule_id && a.apartment === s.apartment && a.cleaning_date === effectiveDate)
          );

          for (const assignment of matched) matchedAssignmentIds.add(assignment.id);

          const primaryAssignment = pickBestAssignment(matched) ?? null;

          return {
            ...s,
            schedule_id: s.id,
            assignment_id: primaryAssignment?.id ?? null,
            slot_id: s.id,
            next_guests: s.next_guests ?? primaryAssignment?.next_guests ?? null,
            assignments: matched,
            cleaner_name: primaryAssignment?.cleaner_name ?? null,
            cleaner_telegram_id: primaryAssignment?.cleaner_telegram_id ?? null,
            status: primaryAssignment?.status ?? null,
          };
        });

        const manualRows = cleanedAssignments
          .filter((assignment) => !matchedAssignmentIds.has(assignment.id))
          .map((assignment) => ({
            id: assignment.id,
            schedule_id,
            assignment_id: assignment.id,
            slot_id: assignment.id,
            apartment: assignment.apartment,
            checkin_date,
            checkout_date: assignment.cleaning_date,
            cleaning_date: assignment.cleaning_date,
            guests_count: assignment.next_guests != null ? String(assignment.next_guests) : null,
            next_guests: assignment.next_guests ?? null,
            notes: "Ручная смена",
            source: "manual_assignment",
            assignments: [assignment],
            cleaner_name: assignment.cleaner_name ?? null,
            cleaner_telegram_id: assignment.cleaner_telegram_id ?? null,
            status: assignment.status ?? null,
            is_manual_slot: true,
            registered_at: assignment.registered_at ?? null,
          }));

        const sortedData = suppressGrandeOverlaps([...scheduleRows, ...manualRows]).sort((a, b) => {
          const aDate = getEffectiveDate(a) ?? "";
          const bDate = getEffectiveDate(b) ?? "";
          if (aDate !== bDate) return aDate.localeCompare(bDate);
          return String(a.apartment ?? "").localeCompare(String(b.apartment ?? ""));
        });

        // Enrich with income_amount from main_transactions
        const { data: allIncomes } = await supabase
          .from("main_transactions")
          .select("amount, description, location")
          .eq("transaction_type", "income")
          .gte("transaction_date", today)
          .lte("transaction_date", in60 + "T23:59:59");

        const aptKw = {
          piral_1: ["оазис 1", "oasis 1", "oasis1", "piral_1"],
          piral_2: ["оазис 2", "oasis 2", "oasis2", "piral_2"],
          grande: ["гранде", "grande", "oasis_grande"],
          salvador: ["сальвадор", "salvador"],
        };

        const enrichedSchedule = sortedData.map((slot) => {
          const keywords = aptKw[slot.apartment] || [];
          const incomeAmount = (allIncomes ?? [])
            .filter((t) => {
              const text = `${t.description || ""} ${t.location || ""}`.toLowerCase();
              return keywords.some((kw) => text.includes(kw));
            })
            .reduce((s, t) => s + Number(t.amount), 0);
          return { ...slot, income_amount: incomeAmount };
        });

        return json({ success: true, data: enrichedSchedule });
      }

      // ─── LOG TELEGRAM MESSAGE ─────────────────────────────────────────────
      case "log_message": {
        const { chat_id, user_name, user_first_name, message_text, message_type, photo_url, direction } = body;
        if (!chat_id) return json({ error: "Missing chat_id" }, 400);

        const { error } = await supabase
          .from("telegram_messages")
          .insert({
            chat_id: String(chat_id),
            user_name: user_name ?? null,
            user_first_name: user_first_name ?? null,
            message_text: message_text ?? null,
            message_type: message_type ?? "text",
            photo_url: photo_url ?? null,
            direction: direction ?? "incoming",
          });

        if (error) throw error;
        return json({ success: true });
      }

      // ─── DELETE MOVEMENT ─────────────────────────────────────────────────
      case "delete_movement": {
        const { id } = body;
        if (!id) return json({ error: "Missing id" }, 400);

        const { error } = await supabase
          .from("movements")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return json({ success: true });
      }

      // ─── UPDATE SCHEDULE GUESTS ───────────────────────────────────────────
      case "update_schedule_guests": {
        const { schedule_id, next_guests } = body;
        if (!schedule_id || next_guests === undefined) {
          return json({ error: "Missing schedule_id or next_guests" }, 400);
        }

        const { error } = await supabase
          .from("cleaning_schedule")
          .update({ next_guests: Number(next_guests) })
          .eq("id", schedule_id);

        if (error) throw error;
        return json({ success: true });
      }

      // ─── UPDATE SLOT ────────────────────────────────────────────────────────
      case "update_slot": {
        const { slot_id, next_guests, special_instructions } = body;
        console.log("[update_slot] called with:", JSON.stringify({ slot_id, next_guests, special_instructions }));
        if (!slot_id) return json({ error: "Missing slot_id" }, 400);

        const updateFields = {};
        if (next_guests !== undefined) updateFields.next_guests = Number(next_guests);
        if (special_instructions !== undefined) updateFields.special_instructions = special_instructions;

        if (Object.keys(updateFields).length === 0) {
          return json({ error: "No fields to update" }, 400);
        }

        // Try updating cleaning_schedule directly first
        console.log("[update_slot] updating cleaning_schedule id=", slot_id, "fields=", JSON.stringify(updateFields));
        const { data: scheduleData, error: scheduleErr } = await supabase
          .from("cleaning_schedule")
          .update(updateFields)
          .eq("id", slot_id)
          .select();

        if (scheduleErr) {
          console.error("[update_slot] schedule update error:", JSON.stringify(scheduleErr));
          throw scheduleErr;
        }

        console.log("[update_slot] schedule update result:", JSON.stringify(scheduleData));

        if (scheduleData && scheduleData.length > 0) {
          return json({ success: true, data: scheduleData[0] });
        }

        // slot_id might be an assignment_id — look up the schedule_id from assignments
        console.log("[update_slot] not found in schedule, checking assignments...");
        const { data: assignment, error: aErr } = await supabase
          .from("cleaning_assignments")
          .select("schedule_id")
          .eq("id", slot_id)
          .maybeSingle();

        if (aErr) {
          console.error("[update_slot] assignment lookup error:", JSON.stringify(aErr));
          throw aErr;
        }

        if (assignment?.schedule_id) {
          console.log("[update_slot] found schedule_id via assignment:", assignment.schedule_id);
          const { data: updated, error: updateErr } = await supabase
            .from("cleaning_schedule")
            .update(updateFields)
            .eq("id", assignment.schedule_id)
            .select()
            .single();

          if (updateErr) {
            console.error("[update_slot] schedule update via assignment error:", JSON.stringify(updateErr));
            throw updateErr;
          }
          console.log("[update_slot] updated via assignment:", JSON.stringify(updated));
          return json({ success: true, data: updated });
        }

        console.error("[update_slot] slot_id not found anywhere:", slot_id);
        return json({ error: "Slot not found", slot_id }, 404);
      }

      // ─── ASSIGN CLEANER BY IRINA ───────────────────────────────────────────
      case "assign_cleaner_by_irina": {
        const { schedule_id, assignment_id, id, cleaner_name, cleaner_chat_id, apartment_override } = body;
        const slotRef = schedule_id ?? id;
        const normalizedCleanerName = normalizeCleanerName(cleaner_name);
        const normalizedCleanerChatId = normalizeTelegramId(cleaner_chat_id) ?? await lookupCleanerChatId(supabase, cleaner_name);

        if ((!slotRef && !assignment_id) || !normalizedCleanerName) {
          return json({ error: "Missing schedule_id/assignment_id/id or cleaner_name" }, 400);
        }

        const existingAssignment = await findAssignmentRecord(supabase, { schedule_id: slotRef, assignment_id, id });
        if (existingAssignment) {
          const apartment = apartment_override ?? existingAssignment.apartment;
          const cleaning_date = existingAssignment.cleaning_date;
          const aptName = APT_DISPLAY[apartment] ?? apartment;
          const relatedAssignments = await getEquivalentAssignments(supabase, existingAssignment);
          const targetIds = Array.from(new Set((relatedAssignments.length > 0 ? relatedAssignments : [existingAssignment]).map((row) => row.id)));

          const updatePayload = {
            cleaner_name: normalizedCleanerName,
            cleaner_telegram_id: normalizedCleanerChatId ?? null,
            apartment,
            cleaning_date,
            status: existingAssignment.status ?? "assigned",
          };

          const { error: updErr } = targetIds.length > 1
            ? await supabase.from("cleaning_assignments").update(updatePayload).in("id", targetIds)
            : await supabase.from("cleaning_assignments").update(updatePayload).eq("id", existingAssignment.id);

          if (updErr) throw updErr;

          const updated = await findAssignmentRecord(supabase, {
            assignment_id: existingAssignment.id,
            schedule_id: existingAssignment.schedule_id ?? slotRef,
          });

          if (normalizedCleanerChatId) {
            await notifyCleaner(normalizedCleanerChatId,
              `📅 Добрый день, ${firstName(normalizedCleanerName)}! Вам назначена уборка:\n🏠 ${aptName}\n📆 Выезд: ${fmtDate(cleaning_date)}\n👥 ${existingAssignment.next_guests ?? 4} гостей`
            );
          }
          await notifyAdmins(
            `📋 *Назначение смены (Ирина)*\n👤 ${normalizedCleanerName}\n🏠 ${aptName}\n📆 ${fmtDate(cleaning_date)}`
          );

          return json({ success: true, apartment, cleaning_date, assignment: updated });
        }

        const { data: schedule, error: schedErr } = await supabase
          .from("cleaning_schedule")
          .select("apartment, checkout_date, checkin_date, next_guests")
          .eq("id", slotRef)
          .single();

        if (schedErr || !schedule) return json({ error: "Schedule not found" }, 404);

        const apartment = apartment_override ?? schedule.apartment;
        const cleaning_date = schedule.checkout_date;
        const aptName = APT_DISPLAY[apartment] ?? apartment;

        const { data: existing } = await supabase
          .from("cleaning_assignments")
          .select("id")
          .eq("schedule_id", slotRef)
          .neq("status", "cancelled")
          .maybeSingle();

        let assignment;
        if (existing) {
          const { data: updated, error: updErr } = await supabase
            .from("cleaning_assignments")
            .update({
              cleaner_name: normalizedCleanerName,
              cleaner_telegram_id: normalizedCleanerChatId ?? null,
              apartment,
              cleaning_date,
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (updErr) throw updErr;
          assignment = updated;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("cleaning_assignments")
            .insert({
              schedule_id: slotRef,
              apartment,
              cleaning_date,
              cleaner_name: normalizedCleanerName,
              cleaner_telegram_id: normalizedCleanerChatId ?? null,
              status: "assigned",
              registered_at: new Date().toISOString(),
              next_guests: schedule.next_guests ?? 4,
            })
            .select()
            .single();
          if (insErr) throw insErr;
          assignment = inserted;
        }

        // Notify assigned cleaner
        if (normalizedCleanerChatId) {
          await notifyCleaner(normalizedCleanerChatId,
            `📅 Добрый день, ${firstName(normalizedCleanerName)}! Вам назначена уборка:\n🏠 ${aptName}\n📆 Выезд: ${fmtDate(cleaning_date)}\n👥 ${schedule.next_guests ?? 4} гостей`
          );
        }
        // Notify admins
        await notifyAdmins(
          `📋 *Назначение смены (Ирина)*\n👤 ${normalizedCleanerName}\n🏠 ${aptName}\n📆 ${fmtDate(cleaning_date)}`
        );

        return json({ success: true, apartment, cleaning_date, assignment });
      }

      // ─── 6. GET CLEANERS ─────────────────────────────────────────────────
      case "get_cleaners": {
        try {
          console.log("[get_cleaners] called, fetching active cleaners...");
          const { data, error } = await supabase
            .from("cleaners")
            .select("name, telegram_id")
            .eq("is_active", true)
            .order("name", { ascending: true });

          if (error) {
            console.error("[get_cleaners] DB error:", JSON.stringify(error));
            return json({ success: false, error: error.message }, 500);
          }

          const result = (data ?? []).map((c) => ({ name: c.name, telegram_id: c.telegram_id }));
          console.log("[get_cleaners] returning", result.length, "cleaners:", JSON.stringify(result));
          return json({ success: true, data: result });
        } catch (e) {
          console.error("[get_cleaners] unexpected error:", String(e));
          return json({ success: false, error: String(e) }, 500);
        }
      }

      // ─── SYNC ICAL ───────────────────────────────────────────────────────
      case "sync_ical": {
        const supabaseUrl = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_ANON_KEY?? process.env.SUPABASE_PUBLISHABLE_KEY?? "";

        const resp = await fetch(`${supabaseUrl}/functions/v1/sync-ical`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
        });

        const result = await resp.json();
        if (!resp.ok) {
          return json({ success: false, error: result?.error ?? "sync-ical failed" }, resp.status);
        }

        return json({
          success: true,
          added: result.new ?? 0,
          removed: result.deleted ?? 0,
          updated: result.updated ?? 0,
          synced: result.synced ?? 0,
        });
      }

      // ─── 7. GET MY ASSIGNMENTS ───────────────────────────────────────────
      case "get_my_assignments": {
        const { chat_id } = body;
        if (!chat_id) return json({ error: "Missing chat_id" }, 400);

        const { data, error } = await supabase
          .from("cleaning_assignments")
          .select("*")
          .eq("cleaner_telegram_id", String(chat_id))
          .order("cleaning_date", { ascending: false });

        if (error) throw error;
        return json({
          success: true,
          data: dedupeAssignments(data ?? [])
            .sort((a, b) => String(b.cleaning_date ?? "").localeCompare(String(a.cleaning_date ?? "")))
            .slice(0, 20),
        });
      }

      // ─── 8. SIGNUP CLEANING ──────────────────────────────────────────────
      case "signup_cleaning": {
        const { schedule_id, id, chat_id, cleaner_name } = body;
        const slotRef = schedule_id ?? id;
        if (!slotRef || !chat_id || !cleaner_name) {
          return json({ error: "Missing schedule_id/id, chat_id, or cleaner_name" }, 400);
        }

        const normalizedCleanerName = normalizeCleanerName(cleaner_name);
        const normalizedChatId = normalizeTelegramId(chat_id) ?? String(chat_id);

        const existing = await findAssignmentRecord(supabase, { schedule_id: slotRef });

        if (existing) {
          if (existing.cleaner_name) {
            return json({ success: false, conflict: true, taken_by: existing.cleaner_name });
          }

          const { data: updated, error: updateErr } = await supabase
            .from("cleaning_assignments")
            .update({
              cleaner_name: normalizedCleanerName,
              cleaner_telegram_id: normalizedChatId,
              status: "assigned",
              registered_at: existing.registered_at ?? new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (updateErr) throw updateErr;

          const aptName = APT_DISPLAY[existing.apartment] ?? existing.apartment;

          await notifyCleaner(String(chat_id),
            `✅ Добрый день, ${firstName(normalizedCleanerName)}! Вы успешно записались на уборку:\n🏠 ${aptName}\n📆 Выезд: ${fmtDate(existing.cleaning_date)}\n👥 ${existing.next_guests ?? 4} гостей`
          );
          await notifyAdmins(
            `✋ *Запись на уборку*\n👤 ${normalizedCleanerName} записалась\n🏠 ${aptName}\n📆 ${fmtDate(existing.cleaning_date)}`
          );

          return json({
            success: true,
            apartment: existing.apartment,
            cleaning_date: existing.cleaning_date,
            assignment: updated,
          });
        }

        const { data: schedule, error: schedErr } = await supabase
          .from("cleaning_schedule")
          .select("apartment, checkout_date, checkin_date, next_guests")
          .eq("id", slotRef)
          .single();

        if (schedErr || !schedule) return json({ error: "Schedule not found" }, 404);

        const { data: assignment, error: insErr } = await supabase
          .from("cleaning_assignments")
          .insert({
            schedule_id: slotRef,
            apartment: schedule.apartment,
            cleaning_date: schedule.checkout_date,
            cleaner_name: normalizedCleanerName,
            cleaner_telegram_id: normalizedChatId,
            status: "assigned",
            registered_at: new Date().toISOString(),
            next_guests: schedule.next_guests ?? 4,
          })
          .select()
          .single();

        if (insErr) throw insErr;

        const aptName = APT_DISPLAY[schedule.apartment] ?? schedule.apartment;

        // Notify the cleaner
        await notifyCleaner(String(chat_id),
          `✅ Добрый день, ${firstName(normalizedCleanerName)}! Вы успешно записались на уборку:\n🏠 ${aptName}\n📆 Выезд: ${fmtDate(schedule.checkout_date)}\n${schedule.checkin_date ? `📆 Заезд: ${fmtDate(schedule.checkin_date)}\n` : ""}👥 ${schedule.next_guests ?? 4} гостей`
        );
        // Notify admins about signup
        await notifyAdmins(
          `✋ *Запись на уборку*\n👤 ${normalizedCleanerName} записалась\n🏠 ${aptName}\n📆 ${fmtDate(schedule.checkout_date)}`
        );

        return json({
          success: true,
          apartment: schedule.apartment,
          cleaning_date: schedule.checkout_date,
          assignment,
        });
      }

      // ─── 9. COMPLETE CLEANING ────────────────────────────────────────────
      case "complete_cleaning": {
        const { assignment_id } = body;
        if (!assignment_id) return json({ error: "Missing assignment_id" }, 400);

        const { data: assignment, error: fetchErr } = await supabase
          .from("cleaning_assignments")
          .select("*")
          .eq("id", assignment_id)
          .single();

        if (fetchErr || !assignment) return json({ error: "Assignment not found" }, 404);

        const { apartment, cleaning_date, cleaner_name, cleaner_telegram_id } = assignment;
        const fee = APT_FEE[apartment] ?? 35;
        const aptDisplay = APT_DISPLAY[apartment] ?? apartment;

        await supabase
          .from("cleaning_assignments")
          .update({ status: "completed", finished_at: new Date().toISOString(), payment_amount: fee })
          .eq("id", assignment_id);

        const { data: systemUser } = await supabase
          .from("cleaning_users")
          .select("id")
          .in("role", ["admin", "coordinator"])
          .eq("is_active", true)
          .limit(1)
          .single();

        const createdBy = systemUser?.id ?? "00000000-0000-0000-0000-000000000000";

        const { data: tx, error: txErr } = await supabase
          .from("emma_transactions")
          .insert({
            transaction_type: "expense",
            amount: fee,
            description: `Оплата клининга: ${aptDisplay} (${cleaning_date})`,
            payment_source: "emma_cash",
            counterparty: cleaner_name,
            location: aptDisplay,
            transaction_date: new Date().toISOString(),
            created_by: createdBy,
          })
          .select()
          .single();

        if (txErr) throw txErr;

        await supabase
          .from("cleaning_assignments")
          .update({ payment_transaction_id: tx.id })
          .eq("id", assignment_id);

        const dirtyLinenDest = DIRTY_LINEN_LOCATION[apartment] ?? "dirty_linen_piral";
        const linenInserts = STANDARD_LINEN.map((linen) => ({
          from_location: apartment,
          to_location: dirtyLinenDest,
          item_type: linen.item_type,
          quantity: linen.quantity,
          cleaner_name: cleaner_name,
          notes: "Авто при завершении уборки",
        }));

        const { error: linenErr } = await supabase
          .from("movements")
          .insert(linenInserts);

        if (linenErr) console.error("[complete_cleaning] linen insert error:", linenErr);

        // Notify cleaner about completion
        if (cleaner_telegram_id) {
          await notifyCleaner(cleaner_telegram_id,
            `🎉 ${firstName(cleaner_name)}, уборка завершена!\n🏠 ${aptDisplay}\n📆 ${fmtDate(cleaning_date)}\n💰 К выплате: ${fee}€`
          );
        }
        // Notify admins
        await notifyAdmins(
          `✅ *Уборка завершена*\n👤 ${cleaner_name}\n🏠 ${aptDisplay}\n📆 ${fmtDate(cleaning_date)}\n💰 ${fee}€`
        );

        return json({
          success: true,
          fee,
          cleaner_name,
          apartment,
          apt_display: aptDisplay,
          cleaning_date,
          cleaner_telegram_id,
          transaction_id: tx.id,
        });
      }

      // ─── 10. CONFIRM PAYMENT ─────────────────────────────────────────────
      case "confirm_payment": {
        const { assignment_id } = body;
        if (!assignment_id) return json({ error: "Missing assignment_id" }, 400);

        const { data: assignment, error: fetchErr } = await supabase
          .from("cleaning_assignments")
          .select("*")
          .eq("id", assignment_id)
          .single();

        if (fetchErr || !assignment) return json({ error: "Assignment not found" }, 404);

        const now = new Date().toISOString();

        await supabase
          .from("cleaning_assignments")
          .update({
            status: "paid",
            confirmed_at: now,
            confirmed_by: "emma_telegram",
            payment_confirmed: true,
            payment_confirmed_at: now,
          })
          .eq("id", assignment_id);

        const aptDisplay = APT_DISPLAY[assignment.apartment] ?? assignment.apartment;

        // Notify cleaner about payment
        if (assignment.cleaner_telegram_id) {
          await notifyCleaner(assignment.cleaner_telegram_id,
            `💰 ${firstName(assignment.cleaner_name)}, оплата подтверждена!\n🏠 ${aptDisplay}\n📆 ${fmtDate(assignment.cleaning_date)}\n💵 ${assignment.payment_amount ?? 35}€`
          );
        }
        // Notify admins
        await notifyAdmins(
          `💰 *Оплата подтверждена*\n👤 ${assignment.cleaner_name}\n🏠 ${aptDisplay}\n📆 ${fmtDate(assignment.cleaning_date)}\n💵 ${assignment.payment_amount ?? 35}€`
        );

        return json({
          success: true,
          cleaner_name: assignment.cleaner_name,
          apartment: assignment.apartment,
          apt_display: aptDisplay,
          cleaning_date: assignment.cleaning_date,
          payment_amount: assignment.payment_amount,
          cleaner_telegram_id: assignment.cleaner_telegram_id,
        });
      }

      // ─── 11. REPLACE CLEANER ─────────────────────────────────────────────
      case "replace_cleaner": {
        const schedule_id = body.schedule_id ?? body.slot_id;
        const { assignment_id, id, new_cleaner_name, new_cleaner_chat_id } = body;
        if ((!schedule_id && !assignment_id && !id) || !new_cleaner_name) {
          return json({ error: "Missing schedule_id/slot_id/assignment_id/id or new_cleaner_name" }, 400);
        }

        const normalizedNewCleanerName = normalizeCleanerName(new_cleaner_name);
        const normalizedNewCleanerChatId = normalizeTelegramId(new_cleaner_chat_id) ?? await lookupCleanerChatId(supabase, new_cleaner_name);

        const assignment = await findAssignmentRecord(supabase, { schedule_id, assignment_id, id });
        
        // If no existing assignment found — create a new one instead of returning error
        if (!assignment) {
          const sid = schedule_id ?? body.slot_id;
          const { data: slot } = await supabase.from("cleaning_schedule").select("*").eq("id", sid).maybeSingle();
          const effectiveDate = slot?.cleaning_date ?? slot?.checkout_date ?? slot?.checkin_date;
          const apt = slot?.apartment ?? "piral_1";

          const { data: newAssignment, error: newErr } = await supabase
            .from("cleaning_assignments")
            .insert({
              schedule_id: sid,
              apartment: apt,
              cleaning_date: effectiveDate,
              cleaner_name: normalizedNewCleanerName,
              cleaner_telegram_id: normalizedNewCleanerChatId,
              status: "assigned",
              next_guests: slot?.next_guests,
              payment_amount: APT_FEE[apt] ?? 35,
            })
            .select()
            .single();

          if (newErr) throw newErr;

          const aptName = APT_DISPLAY[apt] ?? apt;
          if (normalizedNewCleanerChatId) {
            await notifyCleaner(normalizedNewCleanerChatId,
              `📅 Добрый день, ${firstName(normalizedNewCleanerName)}! Вам назначена уборка:\n🏠 ${aptName}\n📆 ${fmtDate(effectiveDate)}`
            );
          }
          await notifyAdmins(`✅ Назначена уборка: ${aptName} ${fmtDate(effectiveDate)} — ${normalizedNewCleanerName}`);

          return json({ success: true, created: true, data: normalizeAssignment(newAssignment) });
        }

        const relatedAssignments = await getEquivalentAssignments(supabase, assignment);
        const targetIds = Array.from(new Set((relatedAssignments.length > 0 ? relatedAssignments : [assignment]).map((row) => row.id)));

        const previousCleanerName = normalizeCleanerName(assignment.cleaner_name);
        const previousCleanerChatId = normalizeTelegramId(assignment.cleaner_telegram_id);

        const updatePayload = {
          cleaner_name: normalizedNewCleanerName,
          cleaner_telegram_id: normalizedNewCleanerChatId ?? null,
          status: assignment.status ?? "assigned",
        };

        const { error: updateErr } = targetIds.length > 1
          ? await supabase.from("cleaning_assignments").update(updatePayload).in("id", targetIds)
          : await supabase.from("cleaning_assignments").update(updatePayload).eq("id", assignment.id);

        if (updateErr) throw updateErr;

        const aptName = APT_DISPLAY[assignment.apartment] ?? assignment.apartment;

        // Notify OLD cleaner about removal
        if (previousCleanerChatId) {
          await notifyCleaner(previousCleanerChatId,
            `⚠️ ${firstName(previousCleanerName)}, ваша смена заменена.\n🏠 ${aptName}\n📆 ${fmtDate(assignment.cleaning_date)}\nНовая уборщица: ${normalizedNewCleanerName}`
          );
        }
        // Notify NEW cleaner about assignment
        if (normalizedNewCleanerChatId) {
          await notifyCleaner(normalizedNewCleanerChatId,
            `📅 Добрый день, ${firstName(normalizedNewCleanerName)}! Вам назначена уборка:\n🏠 ${aptName}\n📆 ${fmtDate(assignment.cleaning_date)}`
          );
        }
        // Notify admins
        await notifyAdmins(
          `🔄 *Замена уборщицы*\n🏠 ${aptName} · ${fmtDate(assignment.cleaning_date)}\n❌ ${previousCleanerName ?? "—"} → ✅ ${normalizedNewCleanerName}`
        );

        return json({
          success: true,
          old_cleaner_name: previousCleanerName,
          old_cleaner_telegram_id: previousCleanerChatId,
          new_cleaner_name: normalizedNewCleanerName,
          apartment: assignment.apartment,
          cleaning_date: assignment.cleaning_date,
        });
      }

      // ─── REMOVE CLEANER ─────────────────────────────────────────────────
      case "remove_cleaner": {
        const { schedule_id, assignment_id, id } = body;
        if (!schedule_id && !assignment_id && !id) {
          return json({ error: "Missing schedule_id, assignment_id, or id" }, 400);
        }

        const assignment = await findAssignmentRecord(supabase, { schedule_id, assignment_id, id });
        if (!assignment) return json({ error: "Assignment not found" }, 404);
        const relatedAssignments = await getEquivalentAssignments(supabase, assignment);
        const targetIds = Array.from(new Set((relatedAssignments.length > 0 ? relatedAssignments : [assignment]).map((row) => row.id)));

        const normalizedRemovedCleanerName = normalizeCleanerName(assignment.cleaner_name);
        const normalizedRemovedCleanerChatId = normalizeTelegramId(assignment.cleaner_telegram_id);

        const { error: delErr } = targetIds.length > 1
          ? await supabase.from("cleaning_assignments").delete().in("id", targetIds)
          : await supabase.from("cleaning_assignments").delete().eq("id", assignment.id);

        if (delErr) throw delErr;

        const aptName = APT_DISPLAY[assignment.apartment] ?? assignment.apartment;

        // Notify removed cleaner
        if (normalizedRemovedCleanerChatId) {
          await notifyCleaner(normalizedRemovedCleanerChatId,
            `❌ ${firstName(normalizedRemovedCleanerName)}, ваша смена отменена.\n🏠 ${aptName}\n📆 ${fmtDate(assignment.cleaning_date)}`
          );
        }
        // Notify admins
        await notifyAdmins(
          `🗑 *Удаление уборщицы из смены*\n👤 ${normalizedRemovedCleanerName ?? "—"}\n🏠 ${aptName}\n📆 ${fmtDate(assignment.cleaning_date)}`
        );

        return json({
          success: true,
          removed_cleaner_name: normalizedRemovedCleanerName,
          removed_cleaner_telegram_id: normalizedRemovedCleanerChatId,
          apartment: assignment.apartment,
          cleaning_date: assignment.cleaning_date,
        });
      }

      // ─── 12. GET PENDING BY ID ───────────────────────────────────────────
      case "get_pending_by_id": {
        const { id } = body;
        if (!id) return json({ error: "Missing id" }, 400);

        const { data, error } = await supabase
          .from("pending_movements")
          .select("*")
          .eq("id", id)
          .single();

        if (error) return json({ error: "Not found" }, 404);
        return json({ success: true, data });
      }

      // ─── 13. AUTO CONFIRM PENDING ────────────────────────────────────────
      case "auto_confirm_pending": {
        const { data: stale, error: fetchErr } = await supabase
          .from("pending_movements")
          .select("*")
          .eq("confirmed", false)
          .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (fetchErr) throw fetchErr;
        if (!stale || stale.length === 0) return json({ success: true, auto_confirmed: 0 });

        let confirmed = 0;
        for (const pending of stale) {
          const items = Array.isArray(pending.items) ? pending.items : [];
          if (items.length === 0) continue;

          let allOk = true;
          for (const item of items) {
            // Fix invalid location names like "piral" → "piral_1"
            const fixLocation = (loc) => {
              if (!loc) return null;
              if (loc === "piral") return "piral_1";
              if (loc === "dirty_linen") return "dirty_linen_piral";
              if (loc === "clean_linen") return "clean_linen_piral";
              return loc;
            };

            const { error: insErr } = await supabase
              .from("movements")
              .insert({
                from_location: fixLocation(pending.from_location ?? item.from_location),
                to_location: fixLocation(pending.to_location ?? item.to_location),
                item_type: item.item_type ?? item.type,
                quantity: item.quantity ?? 1,
                cleaner_name: pending.cleaner_name,
                notes: `[Авто] ${pending.original_message ?? ""}`,
              });
            if (insErr) { allOk = false; console.error("[auto_confirm] insert error:", insErr); }
          }

          if (allOk) {
            await supabase.from("pending_movements").update({ confirmed: true }).eq("id", pending.id);
            confirmed++;
          }
        }

        return json({ success: true, auto_confirmed: confirmed });
      }

      // ─── NOTIFY CLEANER ──────────────────────────────────────────────────
      case "notify_cleaner": {
        const { cleaner_chat_id, apartment_name, cleaning_date, message } = body;
        if (!cleaner_chat_id) return json({ error: "Missing cleaner_chat_id" }, 400);

        const telegramToken = getTelegramToken();
        if (!telegramToken) return json({ error: "No Telegram token configured" }, 500);

        const text = message ?? `📅 Ваша смена!\n🏠 ${apartment_name ?? ""}\n📆 ${cleaning_date ?? ""}`;

        const tgResp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: String(cleaner_chat_id), text, parse_mode: "HTML" }),
        });

        const tgData = await tgResp.json();
        if (!tgResp.ok) {
          return json({ error: "Telegram send failed", details: tgData }, 502);
        }
        return json({ success: true, message_id: tgData?.result?.message_id });
      }

      // ─── NOTIFY NEW BOOKING ──────────────────────────────────────────────
      case "notify_new_booking": {
        const { schedule_id, apartment, checkout_date, checkin_date, next_guests } = body;
        if (!schedule_id || !apartment) return json({ error: "Missing schedule_id or apartment" }, 400);

        const telegramToken = getTelegramToken();
        if (!telegramToken) return json({ error: "No Telegram token configured" }, 500);

        const aptName = APT_DISPLAY[apartment] ?? apartment;
        const checkoutFmt = fmtDate(checkout_date);
        const checkinFmt = fmtDate(checkin_date);
        const guests = next_guests ?? 4;

        // Get all cleaners with telegram_id
        const { data: cleaners } = await supabase
          .from("cleaners")
          .select("name, telegram_id")
          .eq("is_active", true)
          .not("telegram_id", "is", null);

        let notified = 0;

        // Send personalized message to each cleaner with signup button
        for (const cleaner of cleaners ?? []) {
          if (!cleaner.telegram_id) continue;
          try {
            const personalText = `Добрый день, ${firstName(cleaner.name)}! Появилось новое бронирование на *${aptName}*.\n\n📆 Заезд: ${checkinFmt || "—"}\n📆 Выезд: ${checkoutFmt}\n👥 ${guests} гостей\n\nПри желании и возможности записаться на эту смену отметьте это в расписании, нажав на кнопку ниже.`;

            await sendTg(telegramToken, cleaner.telegram_id, personalText, "Markdown", {
              inline_keyboard: [[{ text: "✋ Записаться", callback_data: `signup_${schedule_id}` }]],
            });
            notified++;
          } catch (e) {
            console.error(`[notify_new_booking] Error sending to ${cleaner.name}:`, e);
          }
        }

        // Notify admins with full info (no signup button)
        const adminText = `🏠 *Новое бронирование*\n\n*${aptName}*\n📆 Заезд: ${checkinFmt || "—"}\n📆 Выезд: ${checkoutFmt}\n👥 ${guests} гостей`;
        for (const chatId of getAdminChatIds()) {
          await sendTg(telegramToken, chatId, adminText);
        }

        return json({ success: true, notified });
      }

      // ─── START CLEANING ────────────────────────────────────────────────
      case "start_cleaning": {
        const { assignment_id } = body;
        if (!assignment_id) return json({ error: "Missing assignment_id" }, 400);

        const { data: assignment, error: fetchErr } = await supabase
          .from("cleaning_assignments")
          .select("*")
          .eq("id", assignment_id)
          .maybeSingle();

        if (fetchErr || !assignment) {
          return json({ error: `Assignment not found (ID: ${assignment_id?.slice(0, 8)}…)` }, 404);
        }

        const allowedStatuses = ["assigned", "confirmed", "pending"];
        if (!allowedStatuses.includes(assignment.status)) {
          const statusMessages = {
            started: "Уборка уже начата",
            done: "Уборка уже завершена",
            completed: "Уборка уже завершена",
            paid: "Уборка завершена и оплачена",
            cancelled: "Смена была отменена",
          };
          return json({
            success: false,
            error: statusMessages[assignment.status] ?? `Невозможно начать (статус: ${assignment.status})`,
            current_status: assignment.status,
          }, 200);
        }

        const now = new Date().toISOString();
        const { error: updErr } = await supabase
          .from("cleaning_assignments")
          .update({ status: "started", started_at: now })
          .eq("id", assignment_id);

        if (updErr) throw updErr;

        const aptDisplay = APT_DISPLAY[assignment.apartment] ?? assignment.apartment;

        // Notify admins
        await notifyAdmins(
          `🧹 *Уборка начата*\n👤 ${assignment.cleaner_name}\n🏠 ${aptDisplay}\n📆 ${fmtDate(assignment.cleaning_date)}`
        );

        return json({
          success: true,
          apartment: assignment.apartment,
          apt_display: aptDisplay,
          cleaning_date: assignment.cleaning_date,
          cleaner_name: assignment.cleaner_name,
        });
      }

      // ─── GET BOOKINGS WITH SPA/CRIB ──────────────────────────────────────
      case "get_bookings_with_spa": {
        const today = new Date().toISOString().split("T")[0];

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .select("*")
          .gte("checkin_date", today)
          .eq("tasks_assigned", true)
          .order("checkin_date", { ascending: true });

        if (error) throw error;

        // Filter for spa=true or crib=true in tasks (supports both object and array formats)
        const filtered = (data ?? []).filter((row) => {
          const tasks = row.tasks;
          if (!tasks) return false;
          // Array format: [{key:"spa",enabled:true}, ...]
          if (Array.isArray(tasks)) {
            return tasks.some((t) => (t.key === "spa" || t.key === "crib") && t.enabled === true);
          }
          // Object format: {spa: true, crib: true}
          if (typeof tasks === "object") {
            return tasks.spa === true || tasks.crib === true;
          }
          return false;
        });

        return json({ success: true, data: filtered });
      }

      // ─── GET BOOKINGS WITH TASKS ──────────────────────────────────────────
      case "get_bookings_with_tasks": {
        const today = new Date().toISOString().split("T")[0];

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .select("id, apartment, checkin_date, checkout_date, guests_count, tasks, source, gap_days")
          .gte("checkin_date", today)
          .eq("tasks_assigned", true)
          .order("checkin_date", { ascending: true });

        if (error) throw error;
        return json({ success: true, data: data ?? [] });
      }

      // ─── GET BOOKINGS BY PERIOD ──────────────────────────────────────────
      case "get_bookings_by_period": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from or date_to" }, 400);

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .select("id, apartment, checkin_date, checkout_date, guests_count, source, tasks, gap_days")
          .lt("checkin_date", date_to)
          .gt("checkout_date", date_from)
          .order("checkin_date", { ascending: true });

        if (error) throw error;

        // Fetch incomes from main_transactions to match bookings
        const { data: incomes } = await supabase
          .from("main_transactions")
          .select("amount, description, location")
          .eq("transaction_type", "income")
          .gte("transaction_date", date_from)
          .lte("transaction_date", date_to + "T23:59:59");

        const aptKeywords = {
          piral_1: ["оазис 1", "oasis 1", "oasis1", "piral_1", "piral 1"],
          piral_2: ["оазис 2", "oasis 2", "oasis2", "piral_2", "piral 2"],
          grande: ["гранде", "grande", "oasis_grande"],
          salvador: ["сальвадор", "salvador"],
        };

        const enriched = (data ?? []).map((booking) => {
          const keywords = aptKeywords[booking.apartment] || [];
          const matchedIncome = (incomes ?? [])
            .filter((t) => {
              const text = `${t.description || ""} ${t.location || ""}`.toLowerCase();
              return keywords.some(kw => text.includes(kw));
            })
            .reduce((s, t) => s + Number(t.amount), 0);
          return { ...booking, income_amount: matchedIncome, has_income: matchedIncome > 0 };
        });

        return json({ success: true, data: enriched });
      }

      // ─── GET CLEANING TASKS FOR SLOT ─────────────────────────────────────
      case "get_cleaning_tasks_for_slot": {
        const { slot_id } = body;
        if (!slot_id) return json({ error: "Missing slot_id" }, 400);

        const { data: slot, error: slotErr } = await supabase
          .from("cleaning_schedule")
          .select("id, apartment, checkout_date, checkin_date")
          .eq("id", slot_id)
          .single();

        if (slotErr || !slot) return json({ error: "Slot not found" }, 404);

        // Find the next booking in the same apartment after checkout
        const { data: nextBooking, error: nextErr } = await supabase
          .from("cleaning_schedule")
          .select("id, checkin_date, checkout_date, guests_count, tasks, gap_days")
          .eq("apartment", slot.apartment)
          .gt("checkin_date", slot.checkout_date)
          .order("checkin_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextErr) throw nextErr;

        if (!nextBooking) {
          return json({ success: true, data: null });
        }

        const gapDays = nextBooking.checkin_date && slot.checkout_date
          ? Math.round((new Date(nextBooking.checkin_date).getTime() - new Date(slot.checkout_date).getTime()) / 86400000)
          : null;

        return json({
          success: true,
          data: {
            gap_days: gapDays,
            tasks: nextBooking.tasks,
            checkin_date: nextBooking.checkin_date,
            checkout_date: nextBooking.checkout_date,
            guests_count: nextBooking.guests_count,
          },
        });
      }

      // ─── GET NEW BOOKINGS TO NOTIFY ──────────────────────────────────────
      case "get_new_bookings_to_notify": {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        // Atomically mark and return updated rows to prevent race conditions
        const { data: marked, error: markErr } = await supabase
          .from("cleaning_schedule")
          .update({ notified: true })
          .eq("notified", false)
          .gte("created_at", twoHoursAgo)
          .select("id, apartment, checkin_date, checkout_date, guests_count, source, gap_days")
          .order("checkin_date", { ascending: true });

        if (markErr) throw markErr;

        return json({ success: true, data: marked ?? [] });
      }

      // ─── GET NEXT BOOKING FOR APT ────────────────────────────────────────
      case "get_next_booking_for_apt": {
        const { apartment, checkout_date } = body;
        if (!apartment || !checkout_date) return json({ error: "Missing apartment or checkout_date" }, 400);

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .select("id, checkin_date, checkout_date, guests_count, tasks, gap_days, source")
          .eq("apartment", apartment)
          .gt("checkin_date", checkout_date)
          .order("checkin_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return json({ success: true, data: data ?? null });
      }

      // ─── ASSIGN BOOKING TASKS ────────────────────────────────────────────
      case "assign_booking_tasks": {
        const { booking_id, tasks, gap_days } = body;
        if (!booking_id) return json({ error: "Missing booking_id" }, 400);

        const updatePayload = { tasks_assigned: true };
        if (tasks !== undefined) updatePayload.tasks = tasks;
        if (gap_days !== undefined) updatePayload.gap_days = gap_days;

        // If tasks is an array, extract guests value for next_guests
        if (Array.isArray(tasks)) {
          const guestsTask = tasks.find((t) => t.key === "guests" && t.value != null);
          if (guestsTask) {
            updatePayload.next_guests = Number(guestsTask.value);
          }
        }

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .update(updatePayload)
          .eq("id", booking_id)
          .select()
          .single();

        if (error) throw error;

        // If gap_days <= 2, copy task descriptions to the cleaning slot's special_instructions
        if (gap_days !== undefined && gap_days <= 2 && data) {
          let taskDescriptions = "";
          if (Array.isArray(tasks)) {
            taskDescriptions = tasks
              .filter((t) => t.enabled === true && t.key !== "guests")
              .map((t) => t.name || t.key)
              .join(", ");
          } else if (tasks && typeof tasks === "object") {
            taskDescriptions = Object.entries(tasks)
              .filter(([_, v]) => v === true)
              .map(([k]) => k)
              .join(", ");
          }

          if (taskDescriptions) {
            await supabase
              .from("cleaning_schedule")
              .update({ special_instructions: `Задания: ${taskDescriptions}` })
              .eq("apartment", data.apartment)
              .eq("checkout_date", data.checkin_date);
          }
        }

        return json({ success: true, data });
      }

      // ─── UPDATE BOOKING TASK ─────────────────────────────────────────────
      case "update_booking_task": {
        const { booking_id, task_key, value } = body;
        if (!booking_id || !task_key) return json({ error: "Missing booking_id or task_key" }, 400);

        // Fetch current tasks
        const { data: booking, error: fetchErr } = await supabase
          .from("cleaning_schedule")
          .select("tasks")
          .eq("id", booking_id)
          .single();

        if (fetchErr || !booking) return json({ error: "Booking not found" }, 404);

        const currentTasks = (booking.tasks && typeof booking.tasks === "object") ? booking.tasks : {};
        (currentTasks)[task_key] = value;

        const { data, error } = await supabase
          .from("cleaning_schedule")
          .update({ tasks: currentTasks })
          .eq("id", booking_id)
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── EMMA CONFIRMED PREPARATION ──────────────────────────────────────
      case "emma_confirmed_preparation": {
        const { booking_id, confirmed_tasks, removed_items } = body;
        if (!booking_id) return json({ error: "Missing booking_id" }, 400);

        let movement_id = null;

        if (removed_items && Object.keys(removed_items).length > 0) {
          const { data: booking } = await supabase
            .from("cleaning_schedule")
            .select("apartment")
            .eq("id", booking_id)
            .single();

          if (booking) {
            const fromLoc = booking.apartment;
            for (const [itemType, qty] of Object.entries(removed_items)) {
              if (Number(qty) > 0) {
                const { data: mov } = await supabase
                  .from("movements")
                  .insert({
                    from_location: fromLoc,
                    to_location: "clean_stock",
                    item_type: itemType,
                    quantity: Number(qty),
                    notes: "Убрано при подготовке",
                  })
                  .select("id")
                  .single();
                if (mov) movement_id = mov.id;
              }
            }
          }
        }

        return json({ success: true, movement_id });
      }

      // ─── LAUNDRY: GET PRICES ─────────────────────────────────────────────
      case "get_laundry_prices": {
        const { data, error } = await supabase
          .from("laundry_prices")
          .select("*")
          .eq("active", true)
          .order("item_key", { ascending: true });

        if (error) throw error;
        return json({ success: true, data: data ?? [] });
      }

      // ─── LAUNDRY: UPDATE PRICE ───────────────────────────────────────────
      case "update_laundry_price": {
        const { item_key, price } = body;
        if (!item_key || price === undefined) return json({ error: "Missing item_key or price" }, 400);

        const { data, error } = await supabase
          .from("laundry_prices")
          .update({ price: Number(price) })
          .eq("item_key", item_key)
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── LAUNDRY: CALCULATE COST ─────────────────────────────────────────
      case "calculate_laundry_cost": {
        const { items } = body;
        if (!items || typeof items !== "object") return json({ error: "Missing items object" }, 400);

        const { data: prices, error } = await supabase
          .from("laundry_prices")
          .select("item_key, price")
          .eq("active", true);

        if (error) throw error;

        const priceMap = {};
        for (const p of prices ?? []) priceMap[p.item_key] = Number(p.price);

        let subtotal = 0;
        for (const [key, qty] of Object.entries(items)) {
          if (priceMap[key] !== undefined) subtotal += priceMap[key] * Number(qty);
        }

        const vat = subtotal * 0.21;
        const total = subtotal + vat;
        const free_delivery = (items).sheet_set >= 15;

        return json({ success: true, data: { subtotal, vat, total, free_delivery } });
      }

      // ─── LAUNDRY: GET ALBERT BALANCE ─────────────────────────────────────
      case "get_albert_balance": {
        // Sent TO Albert
        const { data: sentData, error: sentErr } = await supabase
          .from("movements")
          .select("item_type, quantity")
          .eq("to_location", "albert_laundry");

        if (sentErr) throw sentErr;

        // Received FROM Albert
        const { data: recvData, error: recvErr } = await supabase
          .from("movements")
          .select("item_type, quantity")
          .eq("from_location", "albert_laundry");

        if (recvErr) throw recvErr;

        const balance = {};
        for (const row of sentData ?? []) {
          balance[row.item_type] = (balance[row.item_type] ?? 0) + row.quantity;
        }
        for (const row of recvData ?? []) {
          balance[row.item_type] = (balance[row.item_type] ?? 0) - row.quantity;
        }

        // Calculate cost from prices
        const { data: prices } = await supabase
          .from("laundry_prices")
          .select("item_key, price")
          .eq("active", true);

        const priceMap = {};
        for (const p of prices ?? []) priceMap[p.item_key] = Number(p.price);

        // Map item_type to item_key for cost calculation
        const itemTypeToKey = {
          sheets: "sheet",
          duvet_covers: "duvet_cover",
          pillowcases: "pillowcase",
          large_towels: "large_towel",
          small_towels: "small_towel",
          kitchen_towels: "kitchen_towel",
          rugs: "bath_mat",
          mattress_pad: "mattress_pad",
        };

        let calculated_cost = 0;
        for (const [itemType, qty] of Object.entries(balance)) {
          if (qty > 0) {
            const key = itemTypeToKey[itemType] ?? itemType;
            calculated_cost += (priceMap[key] ?? 0) * qty;
          }
        }
        const vat2 = calculated_cost * 0.21;

        return json({ success: true, data: { items: balance, calculated_cost, vat: vat2, total: calculated_cost + vat2 } });
      }

      // ─── LAUNDRY: MONTHLY SUMMARY ────────────────────────────────────────
      case "get_laundry_monthly_summary": {
        const { year, month } = body;
        if (!year || !month) return json({ error: "Missing year or month" }, 400);

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

        const { data: movements, error } = await supabase
          .from("movements")
          .select("*")
          .or(`to_location.eq.albert_laundry,from_location.eq.albert_laundry`)
          .gte("created_at", startDate)
          .lt("created_at", endDate)
          .order("created_at", { ascending: true });

        if (error) throw error;

        return json({ success: true, data: movements ?? [] });
      }

      // ─── LAUNDRY: SAVE INVOICE ───────────────────────────────────────────
      case "save_laundry_invoice": {
        const { invoice_number, period_from, period_to, invoice_amount, calculated_amount, items } = body;

        const difference = (Number(invoice_amount) || 0) - (Number(calculated_amount) || 0);

        const { data, error } = await supabase
          .from("laundry_invoices")
          .insert({
            invoice_number,
            period_from,
            period_to,
            invoice_amount: Number(invoice_amount) || 0,
            calculated_amount: Number(calculated_amount) || 0,
            difference,
            items: items ?? null,
          })
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── LAUNDRY: GET INVOICES ───────────────────────────────────────────
      case "get_laundry_invoices": {
        const { data, error } = await supabase
          .from("laundry_invoices")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return json({ success: true, data: data ?? [] });
      }

      // ─── LAUNDRY: OPEN PENDING DELIVERY ──────────────────────────────────
      case "open_pending_delivery": {
        const { date, type, notes } = body;
        if (!date || !type) return json({ error: "Missing date or type" }, 400);

        const { data, error } = await supabase
          .from("laundry_pending_deliveries")
          .insert({ date, type, notes: notes ?? null, confirmed: false })
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── LAUNDRY: CONFIRM PENDING DELIVERY ──────────────────────────────
      case "confirm_pending_delivery": {
        const { id, items } = body;
        if (!id) return json({ error: "Missing id" }, 400);

        const { data: delivery, error: fetchErr } = await supabase
          .from("laundry_pending_deliveries")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchErr || !delivery) return json({ error: "Delivery not found" }, 404);

        await supabase
          .from("laundry_pending_deliveries")
          .update({ confirmed: true, items: items ?? null })
          .eq("id", id);

        // Create corresponding movement
        const movementIds = [];
        if (items && typeof items === "object") {
          for (const [itemType, qty] of Object.entries(items)) {
            if (Number(qty) > 0) {
              const fromLoc = delivery.type === "incoming" ? "albert_laundry" : undefined;
              const toLoc = delivery.type === "incoming" ? "clean_stock" : "albert_laundry";
              const fromLocation = fromLoc ?? (delivery.type === "outgoing" ? "dirty_linen_piral" : "albert_laundry");

              const { data: mov } = await supabase
                .from("movements")
                .insert({
                  from_location: fromLocation,
                  to_location: toLoc,
                  item_type: itemType,
                  quantity: Number(qty),
                  notes: `Доставка Альберта ${delivery.type === "incoming" ? "(привёз)" : "(забрал)"}`,
                })
                .select("id")
                .single();
              if (mov) movementIds.push(mov.id);
            }
          }
        }

        return json({ success: true, movement_ids: movementIds });
      }

      // ─── LAUNDRY: GET UNCONFIRMED DELIVERIES ─────────────────────────────
      case "get_pending_deliveries_unconfirmed": {
        const { data, error } = await supabase
          .from("laundry_pending_deliveries")
          .select("*")
          .eq("confirmed", false)
          .order("date", { ascending: false });

        if (error) throw error;
        return json({ success: true, data: data ?? [] });
      }

      // ─── LAUNDRY: UPLOAD FILE ────────────────────────────────────────────
      case "upload_laundry_file": {
        const { file_data, file_name, file_type, invoice_id } = body;
        if (!file_data || !file_name) return json({ error: "Missing file_data or file_name" }, 400);

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const path = `laundry/${year}/${month}/${file_name}`;

        // Decode base64
        const binaryStr = atob(file_data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const { error: uploadErr } = await supabase.storage
          .from("receipts")
          .upload(path, bytes, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
        const file_url = urlData?.publicUrl;

        // Update invoice if invoice_id provided
        if (invoice_id) {
          const updateField = file_type === "payment" ? "payment_file_url" : "invoice_file_url";
          await supabase
            .from("laundry_invoices")
            .update({ [updateField]: file_url })
            .eq("id", invoice_id);
        }

        return json({ success: true, file_url });
      }

      // ─── LAUNDRY: SAVE ALBERT PAYMENT ────────────────────────────────────
      case "save_albert_payment": {
        const { amount, date, description, file_url } = body;
        if (!amount) return json({ error: "Missing amount" }, 400);

        const { data: systemUser } = await supabase
          .from("cleaning_users")
          .select("id")
          .in("role", ["admin", "coordinator"])
          .eq("is_active", true)
          .limit(1)
          .single();

        const createdBy = systemUser?.id ?? "00000000-0000-0000-0000-000000000000";

        const { data, error } = await supabase
          .from("emma_transactions")
          .insert({
            transaction_type: "expense",
            amount: Number(amount),
            description: description ?? "Оплата прачечной Альберт",
            counterparty: "Прачечная Альберт",
            location: "Прачечная",
            transaction_date: date ?? new Date().toISOString(),
            created_by: createdBy,
            receipt_url: file_url ?? null,
          })
          .select()
          .single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── LAUNDRY: SEND TO ALBERT ─────────────────────────────────────────
      case "send_to_albert": {
        const { items, from_locations } = body;
        const movementIds = [];

        if (items && typeof items === "object" && Object.keys(items).length > 0) {
          for (const [itemType, qty] of Object.entries(items)) {
            if (Number(qty) > 0) {
              const fromLoc = (from_locations && from_locations[0]) ?? "dirty_linen_piral";
              const { data: mov } = await supabase
                .from("movements")
                .insert({
                  from_location: fromLoc,
                  to_location: "albert_laundry",
                  item_type: itemType,
                  quantity: Number(qty),
                  notes: "Отправлено Альберту",
                })
                .select("id")
                .single();
              if (mov) movementIds.push(mov.id);
            }
          }
        }

        return json({ success: true, movement_ids: movementIds });
      }

      // ─── LAUNDRY: RECEIVE FROM ALBERT ────────────────────────────────────
      case "receive_from_albert": {
        const { items } = body;
        if (!items || typeof items !== "object") return json({ error: "Missing items" }, 400);

        const movementIds = [];
        const { data: prices } = await supabase
          .from("laundry_prices")
          .select("item_key, price")
          .eq("active", true);

        const priceMap = {};
        for (const p of prices ?? []) priceMap[p.item_key] = Number(p.price);

        const itemTypeToKey = {
          sheets: "sheet", duvet_covers: "duvet_cover", pillowcases: "pillowcase",
          large_towels: "large_towel", small_towels: "small_towel",
          kitchen_towels: "kitchen_towel", rugs: "bath_mat", mattress_pad: "mattress_pad",
        };

        let calculated_cost = 0;

        for (const [itemType, qty] of Object.entries(items)) {
          if (Number(qty) > 0) {
            const { data: mov } = await supabase
              .from("movements")
              .insert({
                from_location: "albert_laundry",
                to_location: "clean_stock",
                item_type: itemType,
                quantity: Number(qty),
                notes: "Получено от Альберта",
              })
              .select("id")
              .single();
            if (mov) movementIds.push(mov.id);

            const key = itemTypeToKey[itemType] ?? itemType;
            calculated_cost += (priceMap[key] ?? 0) * Number(qty);
          }
        }

        const vat3 = calculated_cost * 0.21;

        return json({ success: true, movement_ids: movementIds, calculated_cost, vat: vat3, total: calculated_cost + vat3 });
      }

      // ─── ASSIGN CLEANER ─────────────────────────────────────────────
      case "assign_cleaner": {
        const { slot_id, cleaner_name: cName, cleaner_telegram_id: cTgId, sub_apartment } = body;
        if (!slot_id) return json({ error: "Missing slot_id" }, 400);

        // Check if assignment already exists for this slot
        const { data: existing } = await supabase
          .from("cleaning_assignments")
          .select("id, cleaner_name, status")
          .eq("schedule_id", slot_id)
          .neq("status", "cancelled")
          .not("cleaner_name", "is", null);

        if (existing && existing.length > 0) {
          const taken = existing.find((a) => a.cleaner_name && normalizeCleanerName(a.cleaner_name) !== normalizeCleanerName(cName));
          if (taken) {
            return json({ error: `Этот слот уже занят: ${normalizeCleanerName(taken.cleaner_name)}` }, 409);
          }
        }

        // Get slot info
        const { data: slot, error: slotErr } = await supabase
          .from("cleaning_schedule")
          .select("*")
          .eq("id", slot_id)
          .single();
        if (slotErr || !slot) return json({ error: "Слот не найден" }, 404);

        const effectiveDate = slot.cleaning_date ?? slot.checkout_date ?? slot.checkin_date;
        const apt = sub_apartment ?? slot.apartment;
        const normalized = normalizeCleanerName(cName);
        const tgId = normalizeTelegramId(cTgId) ?? await lookupCleanerChatId(supabase, cName);

        // Upsert assignment
        const { data: assignment, error: assignErr } = await supabase
          .from("cleaning_assignments")
          .insert({
            schedule_id: slot_id,
            apartment: apt,
            cleaning_date: effectiveDate,
            cleaner_name: normalized,
            cleaner_telegram_id: tgId,
            status: "assigned",
            next_guests: slot.next_guests,
            payment_amount: APT_FEE[apt] ?? 35,
          })
          .select()
          .single();

        if (assignErr) throw assignErr;
        return json({ success: true, data: normalizeAssignment(assignment) });
      }

      // ─── REPLACE CLEANER ─────────────────────────────────────────────
      case "replace_cleaner": {
        const { slot_id, assignment_id, cleaner_name: cName, cleaner_telegram_id: cTgId, sub_apartment } = body;
        const refId = assignment_id ?? slot_id;
        if (!refId) return json({ error: "Missing slot_id or assignment_id" }, 400);

        // Find existing assignment
        const record = await findAssignmentRecord(supabase, { assignment_id, schedule_id: slot_id });
        const normalized = normalizeCleanerName(cName);
        const tgId = normalizeTelegramId(cTgId) ?? await lookupCleanerChatId(supabase, cName);

        if (record) {
          // Cancel old assignment
          await supabase
            .from("cleaning_assignments")
            .update({ status: "cancelled" })
            .eq("id", record.id);

          // Notify old cleaner
          if (record.cleaner_telegram_id) {
            const apt = APT_DISPLAY[record.apartment] ?? record.apartment;
            await notifyCleaner(record.cleaner_telegram_id, `❌ Ваша уборка ${apt} ${fmtDate(record.cleaning_date)} отменена. Назначена другая уборщица.`);
          }

          // Create new assignment
          const { data: newAssignment, error: newErr } = await supabase
            .from("cleaning_assignments")
            .insert({
              schedule_id: record.schedule_id ?? slot_id,
              apartment: sub_apartment ?? record.apartment,
              cleaning_date: record.cleaning_date,
              cleaner_name: normalized,
              cleaner_telegram_id: tgId,
              status: "assigned",
              next_guests: record.next_guests,
              payment_amount: record.payment_amount ?? APT_FEE[record.apartment] ?? 35,
            })
            .select()
            .single();

          if (newErr) throw newErr;

          // Notify admins
          const aptDisplay = APT_DISPLAY[record.apartment] ?? record.apartment;
          await notifyAdmins(`🔄 Замена: ${aptDisplay} ${fmtDate(record.cleaning_date)}\n${normalizeCleanerName(record.cleaner_name) ?? "—"} → ${normalized}`);

          return json({ success: true, old: normalizeAssignment(record), data: normalizeAssignment(newAssignment) });
        }

        // No existing assignment — just create new one
        const { data: slot } = await supabase.from("cleaning_schedule").select("*").eq("id", slot_id).single();
        const effectiveDate = slot?.cleaning_date ?? slot?.checkout_date ?? slot?.checkin_date;
        const apt = sub_apartment ?? slot?.apartment ?? "piral_1";

        const { data: newAssignment, error: newErr } = await supabase
          .from("cleaning_assignments")
          .insert({
            schedule_id: slot_id,
            apartment: apt,
            cleaning_date: effectiveDate,
            cleaner_name: normalized,
            cleaner_telegram_id: tgId,
            status: "assigned",
            next_guests: slot?.next_guests,
            payment_amount: APT_FEE[apt] ?? 35,
          })
          .select()
          .single();

        if (newErr) throw newErr;
        return json({ success: true, data: normalizeAssignment(newAssignment) });
      }

      // ─── DELETE SLOT ──────────────────────────────────────────────────
      case "delete_slot": {
        const { slot_id } = body;
        if (!slot_id) return json({ error: "slot_id is required" }, 400);

        // Cancel non-completed assignments and clear cleaner info (free the slot)
        const { data: cancelled, error: cancelErr } = await supabase
          .from("cleaning_assignments")
          .update({ status: "cancelled", cleaner_name, cleaner_telegram_id: null })
          .eq("schedule_id", slot_id)
          .neq("status", "completed")
          .select();

        if (cancelErr) throw cancelErr;

        // Do NOT delete the schedule slot — keep it available for another cleaner
        return json({ success: true, cancelled_assignments: cancelled?.length ?? 0 });
      }

      // ─── GET BOOKING BY ID ──────────────────────────────────────────────
      case "get_booking_by_id": {
        const { booking_id } = body;
        if (!booking_id) return json({ error: "Missing booking_id" }, 400);

        const { data: booking, error: bookErr } = await supabase
          .from("cleaning_schedule")
          .select("*")
          .eq("id", booking_id)
          .single();

        if (bookErr || !booking) return json({ error: "Booking not found" }, 404);

        // Also get assignment info
        const { data: assignment } = await supabase
          .from("cleaning_assignments")
          .select("cleaner_name, cleaner_telegram_id, status")
          .eq("schedule_id", booking_id)
          .neq("status", "cancelled")
          .maybeSingle();

        return json({
          success: true,
          data: {
            ...booking,
            cleaner_name: assignment?.cleaner_name ?? null,
            cleaner_telegram_id: assignment?.cleaner_telegram_id ?? null,
          },
        });
      }

      // ─── CREATE ALBERT VISIT ──────────────────────────────────────────
      case "create_albert_visit": {
        const { source_locations, delivered_items, picked_items, visited_at, notes } = body;

        // 1. Create movements for picked_items (dirty → albert_laundry)
        const pickedMovementIds = [];
        if (picked_items && typeof picked_items === "object") {
          for (const [itemType, qty] of Object.entries(picked_items)) {
            if (Number(qty) <= 0) continue;
            for (const fromLoc of (source_locations ?? ["dirty_linen_piral"])) {
              const { data: mov } = await supabase
                .from("movements")
                .insert({
                  from_location: fromLoc,
                  to_location: "albert_laundry",
                  item_type: itemType,
                  quantity: Number(qty),
                  notes: "Визит Альберта — забрал",
                })
                .select("id")
                .single();
              if (mov) pickedMovementIds.push(mov.id);
              break; // one movement per item type
            }
          }
        }

        // 2. Create movements for delivered_items (albert_laundry → clean_stock)
        const deliveredMovementIds = [];
        if (delivered_items && typeof delivered_items === "object") {
          for (const [itemType, qty] of Object.entries(delivered_items)) {
            if (Number(qty) <= 0) continue;
            const { data: mov } = await supabase
              .from("movements")
              .insert({
                from_location: "albert_laundry",
                to_location: "clean_stock",
                item_type: itemType,
                quantity: Number(qty),
                notes: "Визит Альберта — привёз",
              })
              .select("id")
              .single();
            if (mov) deliveredMovementIds.push(mov.id);
          }
        }

        // 3. Calculate delivered_cost from laundry_prices
        const { data: prices } = await supabase
          .from("laundry_prices")
          .select("item_key, price")
          .eq("active", true);

        const priceMap = {};
        for (const p of prices ?? []) priceMap[p.item_key] = Number(p.price);

        const itemTypeToKey = {
          sheets: "sheet", duvet_covers: "duvet_cover", pillowcases: "pillowcase",
          large_towels: "large_towel", small_towels: "small_towel",
          kitchen_towels: "kitchen_towel", rugs: "bath_mat", mattress_pad: "mattress_pad",
        };

        let subtotal = 0;
        if (delivered_items && typeof delivered_items === "object") {
          for (const [itemType, qty] of Object.entries(delivered_items)) {
            const key = itemTypeToKey[itemType] ?? itemType;
            subtotal += (priceMap[key] ?? 0) * Number(qty);
          }
        }
        const delivered_cost = subtotal * 1.21; // with VAT

        // 4. Calculate balance_after (what's at Albert's after this visit)
        const { data: sentToAlbert } = await supabase
          .from("movements")
          .select("item_type, quantity")
          .eq("to_location", "albert_laundry");
        const { data: recvFromAlbert } = await supabase
          .from("movements")
          .select("item_type, quantity")
          .eq("from_location", "albert_laundry");

        const balance_after = {};
        for (const row of sentToAlbert ?? []) {
          balance_after[row.item_type] = (balance_after[row.item_type] ?? 0) + row.quantity;
        }
        for (const row of recvFromAlbert ?? []) {
          balance_after[row.item_type] = (balance_after[row.item_type] ?? 0) - row.quantity;
        }
        // Remove zero/negative entries
        for (const k of Object.keys(balance_after)) {
          if (balance_after[k] <= 0) delete balance_after[k];
        }

        // 5. Calculate dirty_remaining
        const dirty_remaining = {};
        for (const loc of ["dirty_linen_piral", "dirty_linen_salvador"]) {
          const { data: sentOut } = await supabase
            .from("movements")
            .select("item_type, quantity")
            .eq("from_location", loc);
          const { data: sentIn } = await supabase
            .from("movements")
            .select("item_type, quantity")
            .eq("to_location", loc);

          const locBalance = {};
          for (const row of sentIn ?? []) {
            locBalance[row.item_type] = (locBalance[row.item_type] ?? 0) + row.quantity;
          }
          for (const row of sentOut ?? []) {
            locBalance[row.item_type] = (locBalance[row.item_type] ?? 0) - row.quantity;
          }
          for (const k of Object.keys(locBalance)) {
            if (locBalance[k] <= 0) delete locBalance[k];
          }
          if (Object.keys(locBalance).length > 0) {
            dirty_remaining[loc] = locBalance;
          }
        }

        // 6. Save to albert_visits
        const { data: visit, error: visitErr } = await supabase
          .from("albert_visits")
          .insert({
            visited_at: visited_at ?? new Date().toISOString(),
            source_locations: source_locations ?? ["dirty_linen_piral"],
            delivered_items: delivered_items ?? {},
            picked_items: picked_items ?? {},
            delivered_cost,
            balance_after,
            dirty_remaining,
            notes: notes ?? null,
          })
          .select()
          .single();

        if (visitErr) throw visitErr;

        return json({
          success: true,
          visit_id: visit.id,
          delivered_cost,
          balance_after,
          dirty_remaining,
        });
      }

      // ─── GET ALBERT VISITS ──────────────────────────────────────────────
      case "get_albert_visits": {
        const limit = body.limit ?? 20;

        const { data, error } = await supabase
          .from("albert_visits")
          .select("id, visited_at, delivered_cost, delivered_items, picked_items, notes")
          .order("visited_at", { ascending: false })
          .limit(limit);

        if (error) throw error;

        const result = (data ?? []).map((v) => {
          const deliveredCount = Object.values(v.delivered_items ?? {}).reduce((s, q) => s + Number(q), 0);
          const pickedCount = Object.values(v.picked_items ?? {}).reduce((s, q) => s + Number(q), 0);
          return {
            id: v.id,
            visited_at: v.visited_at,
            delivered_cost: v.delivered_cost,
            delivered_count: deliveredCount,
            picked_count: pickedCount,
            notes: v.notes,
          };
        });

        return json({ success: true, data: result });
      }

      // ─── GET ALBERT VISIT DETAIL ────────────────────────────────────────
      case "get_albert_visit_detail": {
        const { visit_id } = body;
        if (!visit_id) return json({ error: "Missing visit_id" }, 400);

        const { data, error } = await supabase
          .from("albert_visits")
          .select("*")
          .eq("id", visit_id)
          .single();

        if (error || !data) return json({ error: "Visit not found" }, 404);
        return json({ success: true, data });
      }

      // ─── GET FINANCIAL BALANCE ──────────────────────────────────────────
      case "get_financial_balance": {
        // Total invoiced
        const { data: invoices } = await supabase
          .from("laundry_invoices")
          .select("invoice_amount");

        const total_invoiced = (invoices ?? []).reduce((s, i) => s + (Number(i.invoice_amount) || 0), 0);

        // Total paid (expenses with category = Прачечная or counterparty containing Альберт)
        const { data: payments } = await supabase
          .from("emma_transactions")
          .select("amount")
          .eq("transaction_type", "expense")
          .ilike("counterparty", "%Альберт%");

        const total_paid = (payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

        // Total factual (sum of delivered_cost from albert_visits)
        const { data: visits } = await supabase
          .from("albert_visits")
          .select("delivered_cost");

        const total_factual = (visits ?? []).reduce((s, v) => s + (Number(v.delivered_cost) || 0), 0);

        const nominal_balance = total_invoiced - total_paid;
        const factual_balance = total_factual - total_paid;

        return json({
          success: true,
          data: {
            nominal_balance,
            factual_balance,
            total_invoiced,
            total_paid,
            total_factual,
            discrepancy: nominal_balance - factual_balance,
          },
        });
      }

      // ─── GET DIRTY LINEN BALANCE ────────────────────────────────────────
      case "get_dirty_linen_balance": {
        const result = {};

        for (const loc of ["dirty_linen_piral", "dirty_linen_salvador"]) {
          const { data: sentOut } = await supabase
            .from("movements")
            .select("item_type, quantity")
            .eq("from_location", loc);
          const { data: sentIn } = await supabase
            .from("movements")
            .select("item_type, quantity")
            .eq("to_location", loc);

          const locBalance = {};
          for (const row of sentIn ?? []) {
            locBalance[row.item_type] = (locBalance[row.item_type] ?? 0) + row.quantity;
          }
          for (const row of sentOut ?? []) {
            locBalance[row.item_type] = (locBalance[row.item_type] ?? 0) - row.quantity;
          }
          for (const k of Object.keys(locBalance)) {
            if (locBalance[k] <= 0) delete locBalance[k];
          }
          result[loc] = locBalance;
        }

        return json({ success: true, data: result });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ─── VOICE BOT ACTIONS (23 new) ─────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════════════

      // ─── 1. CREATE EXPENSE ──────────────────────────────────────────────
      case "create_expense": {
        const { amount, category, description, counterparty, apartment, source, created_at, receipt_url, receipt_text } = body;
        if (!amount) return json({ error: "Missing amount" }, 400);

        const sourceMap = {
          "наличные": "emma_cash",
          "карта папы": "george_card",
          "моя карта": "emma_card",
          "карта эммы": "emma_card",
          "банк": "emma_bank",
        };

        // Build description from category + description
        const descParts = [category, description].filter(Boolean);
        const finalDesc = descParts.length > 0 ? descParts.join(": ") : "Расход";

        const insertData = {
          transaction_type: "expense",
          amount: Number(amount),
          description: finalDesc,
          counterparty: counterparty || null,
          location: apartment || null,
          payment_source: sourceMap[(source || "").toLowerCase()] || "emma_cash",
          receipt_url: receipt_url || null,
          receipt_text: receipt_text || null,
        };
        if (created_at) insertData.transaction_date = created_at;

        const { data, error } = await supabase.from("emma_transactions").insert(insertData).select().single();
        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 2. CREATE INCOME ───────────────────────────────────────────────
      case "create_income": {
        const { amount, category, description, source, booking_id, created_at } = body;
        if (!amount) return json({ error: "Missing amount" }, 400);

        const insertData = {
          transaction_type: "income",
          amount: Number(amount),
          description: description || source || category || "Приход",
          counterparty: source || null,
          category: category || source || null,
          created_by: "00000000-0000-0000-0000-000000000000",
        };
        if (created_at) insertData.transaction_date = created_at;

        const { data, error } = await supabase.from("main_transactions").insert(insertData).select().single();
        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 3. GET TRANSACTIONS BY PERIOD ──────────────────────────────────
      case "get_transactions_by_period": {
        const { date_from, date_to, type, category: filterCat, cash_register } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        const tables = cash_register === "main" ? ["main_transactions"] : cash_register === "emma" ? ["emma_transactions"] : ["emma_transactions", "main_transactions"];
        let allTx = [];

        for (const tbl of tables) {
          let q = supabase.from(tbl).select("*").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
          if (type && type !== "all") q = q.eq("transaction_type", type);
          const { data, error } = await q.order("transaction_date", { ascending: false });
          if (error) throw error;
          allTx = allTx.concat((data ?? []).map((r) => ({ ...r, _source: tbl })));
        }

        if (filterCat) allTx = allTx.filter((t) => (t.category || t.description || "").toLowerCase().includes(filterCat.toLowerCase()));

        const totalIncome = allTx.filter((t) => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
        const totalExpense = allTx.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);

        return json({ success: true, data: allTx, summary: { total_income: totalIncome, total_expense: totalExpense, balance: totalIncome - totalExpense, count: allTx.length } });
      }

      // ─── 4. GET CLEANER STATS ───────────────────────────────────────────
      case "get_cleaner_stats": {
        const { cleaner_name, date_from, date_to } = body;
        if (!cleaner_name) return json({ error: "Missing cleaner_name" }, 400);

        // Use ILIKE for partial name match
        let q = supabase.from("cleaning_assignments").select("*").ilike("cleaner_name", `%${cleaner_name}%`).in("status", ["assigned", "started", "completed", "paid"]);
        if (date_from) q = q.gte("cleaning_date", date_from);
        if (date_to) q = q.lte("cleaning_date", date_to);
        const { data, error } = await q.order("cleaning_date", { ascending: true });
        if (error) throw error;

        const rows = data ?? [];
        const totalPay = rows.reduce((s, r) => s + (Number(r.payment_amount) || 35), 0);
        const today = new Date().toISOString().split("T")[0];
        const past = rows.filter((r) => r.cleaning_date <= today);
        const future = rows.filter((r) => r.cleaning_date > today);

        return json({
          success: true, data: {
            cleaner_name: rows.length > 0 ? rows[0].cleaner_name : cleaner_name,
            shifts: rows.length,
            total_payment: totalPay,
            last_cleaning: past.length ? past[past.length - 1].cleaning_date : null,
            next_cleaning: future.length ? future[0].cleaning_date : null,
          }
        });
      }

      // ─── 5. GET ALL CLEANERS STATS ──────────────────────────────────────
      case "get_all_cleaners_stats": {
        const { date_from, date_to } = body;
        let q = supabase.from("cleaning_assignments").select("*").in("status", ["assigned", "started", "completed", "paid"]);
        if (date_from) q = q.gte("cleaning_date", date_from);
        if (date_to) q = q.lte("cleaning_date", date_to);
        const { data, error } = await q.order("cleaning_date", { ascending: true });
        if (error) throw error;

        const byName = {};
        for (const r of data ?? []) {
          const n = r.cleaner_name || "Без имени";
          (byName[n] ??= []).push(r);
        }

        const today = new Date().toISOString().split("T")[0];
        const stats = Object.entries(byName).map(([name, rows]) => {
          const past = rows.filter(r => r.cleaning_date <= today);
          const future = rows.filter(r => r.cleaning_date > today);
          return {
            cleaner_name: name,
            shifts: rows.length,
            total_payment: rows.reduce((s, r) => s + (Number(r.payment_amount) || 35), 0),
            total_earned: rows.reduce((s, r) => s + (Number(r.payment_amount) || 35), 0),
            last_cleaning: past.length ? past[past.length - 1].cleaning_date : null,
            next_cleaning: future.length ? future[0].cleaning_date : null,
          };
        });

        return json({ success: true, data: stats });
      }

      // ─── 6. GET LAUNDRY COST BY PERIOD ──────────────────────────────────
      case "get_laundry_cost_by_period": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        const { data, error } = await supabase
          .from("movements")
          .select("item_type, quantity, total_laundry_cost, laundry_item_cost, created_at")
          .eq("to_location", "albert_laundry")
          .gte("created_at", date_from)
          .lte("created_at", date_to + "T23:59:59");

        if (error) throw error;

        const totalCost = (data ?? []).reduce((s, r) => s + (Number(r.total_laundry_cost) || 0), 0);
        const totalItems = (data ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);

        return json({ success: true, data: { total_cost: totalCost, total_items: totalItems, movements_count: (data ?? []).length } });
      }

      // ─── 7. CREATE MOVEMENT ─────────────────────────────────────────────
      case "create_movement": {
        const { from_location, to_location, items, notes } = body;
        if (!from_location || !to_location || !items) return json({ error: "Missing from_location/to_location/items" }, 400);

        const locationMap = {
          piral_storage: "clean_linen_piral",
          salvador_closet: "clean_linen_salvador",
        };
        const fromLoc = locationMap[from_location] || from_location;
        const toLoc = locationMap[to_location] || to_location;

        const inserted = [];
        const itemEntries = Array.isArray(items) ? items : Object.entries(items).map(([k, v]) => ({ item_type: k, quantity: v }));

        for (const item of itemEntries) {
          const itemType = item.item_type || item.type;
          const qty = Number(item.quantity) || 0;
          if (!itemType || qty <= 0) continue;

          const { data, error } = await supabase.from("movements").insert({
            from_location: fromLoc,
            to_location: toLoc,
            item_type: itemType,
            quantity: qty,
            notes: notes || null,
          }).select().single();

          if (error) throw error;
          inserted.push(data);
        }

        return json({ success: true, data: inserted, count: inserted.length });
      }

      // ─── 8. CREATE TASK ─────────────────────────────────────────────────
      case "create_task": {
        const { title, description: taskDesc, due_date, is_public, assigned_to } = body;
        if (!title) return json({ error: "Missing title" }, 400);

        const { data, error } = await supabase.from("tasks").insert({
          title,
          description: taskDesc || "",
          due_date: due_date || null,
          is_private: is_public === false || is_public === "false",
          created_by: "00000000-0000-0000-0000-000000000000",
          status: "active",
        }).select().single();

        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 9. GET TASKS ──────────────────────────────────────────────────
      case "get_tasks": {
        const { status: taskStatus, assigned_to } = body;
        let q = supabase.from("tasks").select("*");
        if (taskStatus === "open" || taskStatus === "active") q = q.eq("status", "active");
        else if (taskStatus === "done" || taskStatus === "completed") q = q.eq("status", "completed");

        const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 10. GET FINANCIAL SUMMARY ──────────────────────────────────────
      case "get_financial_summary": {
        const { date_from, date_to, cash_register } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        const tables = cash_register === "main" ? ["main_transactions"] : cash_register === "emma" ? ["emma_transactions"] : ["emma_transactions", "main_transactions"];
        let allTx = [];

        for (const tbl of tables) {
          const { data, error } = await supabase.from(tbl).select("*").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
          if (error) throw error;
          allTx = allTx.concat(data ?? []);
        }

        const income = allTx.filter(t => t.transaction_type === "income");
        const expense = allTx.filter(t => t.transaction_type === "expense");
        const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
        const totalExpense = expense.reduce((s, t) => s + Number(t.amount), 0);

        const byCategory = {};
        for (const t of expense) {
          const cat = t.category || t.description || "Другое";
          byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
        }

        const topExpenses = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cat, amt]) => ({ category: cat, amount: amt }));

        return json({
          success: true, data: {
            total_income: totalIncome,
            total_expense: totalExpense,
            balance: totalIncome - totalExpense,
            count: allTx.length,
            categories: byCategory,
            top_expenses: topExpenses,
          }
        });
      }

      // ─── 11. GET TRANSACTIONS BY CATEGORY ───────────────────────────────
      case "get_transactions_by_category": {
        const { category: cat, date_from, date_to } = body;
        if (!cat || !date_from || !date_to) return json({ error: "Missing category/date_from/date_to" }, 400);

        let all = [];
        for (const tbl of ["emma_transactions", "main_transactions"]) {
          const { data, error } = await supabase.from(tbl).select("*").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
          if (error) throw error;
          all = all.concat((data ?? []).filter((t) => (t.category || t.description || "").toLowerCase().includes(cat.toLowerCase())));
        }

        return json({ success: true, data: all, total: all.reduce((s, t) => s + Number(t.amount), 0) });
      }

      // ─── 12. GET INCOME SOURCES ─────────────────────────────────────────
      case "get_income_sources": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        let all = [];
        for (const tbl of ["emma_transactions", "main_transactions"]) {
          const { data, error } = await supabase.from(tbl).select("*").eq("transaction_type", "income").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
          if (error) throw error;
          all = all.concat(data ?? []);
        }

        const bySource = {};
        for (const t of all) {
          const src = t.counterparty || t.payment_source || "Другое";
          bySource[src] = (bySource[src] || 0) + Number(t.amount);
        }

        return json({ success: true, data: bySource, total: all.reduce((s, t) => s + Number(t.amount), 0) });
      }

      // ─── 13. GET CLEANER PAYMENT LOG ────────────────────────────────────
      case "get_cleaner_payment_log": {
        const { cleaner_name, date_from, date_to } = body;
        if (!cleaner_name) return json({ error: "Missing cleaner_name" }, 400);

        let q = supabase.from("cleaning_assignments").select("cleaning_date, apartment, payment_amount, payment_confirmed, payment_confirmed_at, status").ilike("cleaner_name", `%${cleaner_name}%`).in("status", ["completed", "paid"]);
        if (date_from) q = q.gte("cleaning_date", date_from);
        if (date_to) q = q.lte("cleaning_date", date_to);
        const { data, error } = await q.order("cleaning_date", { ascending: false });
        if (error) throw error;

        return json({
          success: true, data: (data ?? []).map((r) => ({
            date: r.cleaning_date,
            apartment: APT_DISPLAY[r.apartment] || r.apartment,
            amount: Number(r.payment_amount) || 35,
            paid: r.payment_confirmed ?? false,
            paid_at: r.payment_confirmed_at,
          })),
          total: (data ?? []).reduce((s, r) => s + (Number(r.payment_amount) || 35), 0),
        });
      }

      // ─── 14. GET UNPAID CLEANINGS ───────────────────────────────────────
      case "get_unpaid_cleanings": {
        const { data, error } = await supabase
          .from("cleaning_assignments")
          .select("cleaner_name, cleaning_date, apartment, payment_amount, status")
          .in("status", ["completed", "assigned", "started"])
          .eq("payment_confirmed", false)
          .order("cleaning_date", { ascending: true });

        if (error) throw error;

        const byName = {};
        for (const r of data ?? []) {
          const name = r.cleaner_name || "Без имени";
          if (!byName[name]) byName[name] = { shifts: 0, total: 0, details: [] };
          byName[name].shifts++;
          byName[name].total += Number(r.payment_amount) || 35;
          byName[name].details.push({ date: r.cleaning_date, apartment: APT_DISPLAY[r.apartment] || r.apartment, amount: Number(r.payment_amount) || 35 });
        }

        return json({ success: true, data: byName });
      }

      // ─── 15. GET MOVEMENTS BY PERIOD ────────────────────────────────────
      case "get_movements_by_period": {
        const { date_from, date_to, location, direction } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        let q = supabase.from("movements").select("*").gte("created_at", date_from).lte("created_at", date_to + "T23:59:59");

        if (location) {
          if (direction === "in") q = q.eq("to_location", location);
          else if (direction === "out") q = q.eq("from_location", location);
          else q = q.or(`from_location.eq.${location},to_location.eq.${location}`);
        }

        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        return json({ success: true, data, count: (data ?? []).length });
      }

      // ─── 16. GET STOCK BALANCE ──────────────────────────────────────────
      case "get_stock_balance": {
        const { location } = body;
        const { data: allMov, error } = await supabase.from("movements").select("from_location, to_location, item_type, quantity");
        if (error) throw error;

        const balance = {};
        for (const m of allMov ?? []) {
          if (!balance[m.to_location]) balance[m.to_location] = {};
          balance[m.to_location][m.item_type] = (balance[m.to_location][m.item_type] || 0) + m.quantity;
          if (!balance[m.from_location]) balance[m.from_location] = {};
          balance[m.from_location][m.item_type] = (balance[m.from_location][m.item_type] || 0) - m.quantity;
        }

        for (const loc of Object.keys(balance)) {
          for (const item of Object.keys(balance[loc])) {
            if (balance[loc][item] <= 0) delete balance[loc][item];
          }
          if (Object.keys(balance[loc]).length === 0) delete balance[loc];
        }

        if (location) {
          return json({ success: true, data: { [location]: balance[location] || {} } });
        }

        return json({ success: true, data: balance });
      }

      // ─── 17. GET MOVEMENT SUMMARY ───────────────────────────────────────
      case "get_movement_summary": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        const { data, error } = await supabase.from("movements").select("*").gte("created_at", date_from).lte("created_at", date_to + "T23:59:59");
        if (error) throw error;

        const rows = data ?? [];
        const sentToLaundry = rows.filter(r => r.to_location === "albert_laundry").reduce((s, r) => s + r.quantity, 0);
        const returnedFromLaundry = rows.filter(r => r.from_location === "albert_laundry").reduce((s, r) => s + r.quantity, 0);
        const damaged = rows.filter(r => r.to_location === "damaged").reduce((s, r) => s + r.quantity, 0);
        const purchased = rows.filter(r => r.from_location === "purchase").reduce((s, r) => s + r.quantity, 0);

        return json({
          success: true, data: {
            sent_to_laundry: sentToLaundry,
            returned_from_laundry: returnedFromLaundry,
            difference: sentToLaundry - returnedFromLaundry,
            damaged,
            purchased,
            total_movements: rows.length,
          }
        });
      }

      // ─── 18. GET TASKS SUMMARY ──────────────────────────────────────────
      case "get_tasks_summary": {
        const { data, error } = await supabase.from("tasks").select("status, due_date");
        if (error) throw error;

        const today = new Date().toISOString().split("T")[0];
        const active = (data ?? []).filter(t => t.status === "active");
        const completed = (data ?? []).filter(t => t.status === "completed");
        const overdue = active.filter(t => t.due_date && t.due_date < today);

        return json({
          success: true, data: {
            active: active.length,
            completed: completed.length,
            overdue: overdue.length,
            total: (data ?? []).length,
          }
        });
      }

      // ─── 19. UPDATE TASK STATUS ─────────────────────────────────────────
      case "update_task_status": {
        const { task_id, status: newStatus } = body;
        if (!task_id || !newStatus) return json({ error: "Missing task_id/status" }, 400);

        const statusMap = { done: "completed", cancelled: "cancelled", active: "active" };
        const mappedStatus = statusMap[newStatus] || newStatus;

        const { data, error } = await supabase.from("tasks").update({ status: mappedStatus }).eq("id", task_id).select().single();
        if (error) throw error;
        return json({ success: true, data });
      }

      // ─── 20. GET BOOKINGS SUMMARY ───────────────────────────────────────
      case "get_bookings_summary": {
        const { date_from, date_to, apartment } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        let q = supabase.from("cleaning_schedule").select("*").gte("checkout_date", date_from).lte("checkin_date", date_to);
        if (apartment) q = q.eq("apartment", apartment);
        const { data, error } = await q;
        if (error) throw error;

        const rows = data ?? [];
        const byApt = {};
        const bySource = {};
        let totalGuests = 0;
        let totalDuration = 0;

        for (const r of rows) {
          byApt[r.apartment] = (byApt[r.apartment] || 0) + 1;
          const src = r.source || "unknown";
          bySource[src] = (bySource[src] || 0) + 1;
          totalGuests += Number(r.next_guests) || Number(r.guests_count) || 0;
          if (r.checkin_date && r.checkout_date) {
            totalDuration += Math.round((new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / 86400000);
          }
        }

        // Calculate income
        const { data: incomes } = await supabase
          .from("main_transactions")
          .select("amount")
          .eq("transaction_type", "income")
          .gte("transaction_date", date_from)
          .lte("transaction_date", date_to + "T23:59:59");
        const totalIncome = (incomes ?? []).reduce((s, t) => s + Number(t.amount), 0);

        // Occupancy: total booked nights / (total days in period * number of apartments)
        const periodDays = Math.max(1, Math.round((new Date(date_to).getTime() - new Date(date_from).getTime()) / 86400000));
        const numApartments = Object.keys(byApt).length || 4;
        const occupancyRate = Math.round((totalDuration / (periodDays * numApartments)) * 100);

        return json({
          success: true, data: {
            total_bookings: rows.length,
            total_income: totalIncome,
            total_guests: totalGuests,
            avg_guests: rows.length ? Math.round(totalGuests / rows.length * 10) / 10 : 0,
            avg_duration: rows.length ? Math.round(totalDuration / rows.length * 10) / 10 : 0,
            occupancy_rate: occupancyRate,
            by_apartment: byApt,
            by_source: bySource,
          }
        });
      }

      // ─── 21. GET APARTMENT REVENUE ──────────────────────────────────────
      case "get_apartment_revenue": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        // Search in emma_transactions by description containing apartment name
        const { data: emmaData, error: emmaErr } = await supabase.from("emma_transactions").select("amount, description, location").eq("transaction_type", "income").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
        if (emmaErr) throw emmaErr;

        const { data: mainData, error: mainErr } = await supabase.from("main_transactions").select("amount, description, location, counterparty").eq("transaction_type", "income").gte("transaction_date", date_from).lte("transaction_date", date_to + "T23:59:59");
        if (mainErr) throw mainErr;

        const aptKeywords = {
          piral_1: ["оазис 1", "oasis 1", "oasis1", "piral_1", "piral 1"],
          piral_2: ["оазис 2", "oasis 2", "oasis2", "piral_2", "piral 2"],
          grande: ["гранде", "grande", "oasis_grande"],
          salvador: ["сальвадор", "salvador"],
        };

        const result = { piral_1: 0, piral_2: 0, grande: 0, salvador: 0 };
        let unmatched = 0;

        for (const t of [...(emmaData ?? []), ...(mainData ?? [])]) {
          const text = `${t.description || ""} ${t.location || ""} ${(t).counterparty || ""}`.toLowerCase();
          let matched = false;
          for (const [apt, keywords] of Object.entries(aptKeywords)) {
            if (keywords.some(kw => text.includes(kw))) {
              result[apt] += Number(t.amount);
              matched = true;
              break;
            }
          }
          if (!matched) unmatched += Number(t.amount);
        }

        return json({ success: true, data: { ...result, unmatched }, total: Object.values(result).reduce((s, v) => s + v, 0) + unmatched });
      }

      // ─── 22. GET ALBERT STATS BY PERIOD ─────────────────────────────────
      case "get_albert_stats_by_period": {
        const { date_from, date_to } = body;
        if (!date_from || !date_to) return json({ error: "Missing date_from/date_to" }, 400);

        const { data, error } = await supabase.from("albert_visits").select("*").gte("visited_at", date_from).lte("visited_at", date_to + "T23:59:59");
        if (error) throw error;

        const rows = data ?? [];
        let totalItems = 0;
        let totalCost = 0;
        for (const v of rows) {
          totalCost += Number(v.delivered_cost) || 0;
          const items = v.picked_items || v.delivered_items || {};
          for (const qty of Object.values(items)) totalItems += Number(qty) || 0;
        }

        return json({
          success: true, data: {
            visits_count: rows.length,
            total_items: totalItems,
            total_cost: totalCost,
            avg_cost: rows.length ? Math.round(totalCost / rows.length * 100) / 100 : 0,
          }
        });
      }

      // ─── 23. GET ALBERT DEBT HISTORY ────────────────────────────────────
      case "get_albert_debt_history": {
        const { data: invoices, error: invErr } = await supabase.from("laundry_invoices").select("*").order("period_from", { ascending: true });
        if (invErr) throw invErr;

        let runningDebt = 0;
        const history = (invoices ?? []).map((inv) => {
          runningDebt += Number(inv.invoice_amount) || 0;
          if (inv.paid) runningDebt -= Number(inv.invoice_amount) || 0;
          return {
            invoice_number: inv.invoice_number,
            period: `${inv.period_from ?? "?"} — ${inv.period_to ?? "?"}`,
            invoice_amount: Number(inv.invoice_amount) || 0,
            paid: inv.paid,
            paid_at: inv.paid_at,
            running_debt: runningDebt,
          };
        });

        return json({ success: true, data: history, current_debt: runningDebt });
      }

      // ─── GET BOOKINGS WITHOUT INCOME ─────────────────────────────────
      case "get_bookings_without_income": {
        const today = new Date().toISOString().split("T")[0];
        const { data: bookings, error } = await supabase
          .from("cleaning_schedule")
          .select("id, apartment, checkin_date, checkout_date, guests_count, source, gap_days")
          .lte("checkout_date", today)
          .order("checkout_date", { ascending: false })
          .limit(200);

        if (error) throw error;

        // Get all incomes to match
        const { data: incomes } = await supabase
          .from("main_transactions")
          .select("description, location")
          .eq("transaction_type", "income");

        const aptKwMap = {
          piral_1: ["оазис 1", "oasis 1", "oasis1", "piral_1"],
          piral_2: ["оазис 2", "oasis 2", "oasis2", "piral_2"],
          grande: ["гранде", "grande", "oasis_grande"],
          salvador: ["сальвадор", "salvador"],
        };

        // For each booking check if there's a matching income
        const withoutIncome = (bookings ?? []).filter((b) => {
          const keywords = aptKwMap[b.apartment] || [];
          if (keywords.length === 0) return true;
          const hasMatch = (incomes ?? []).some((t) => {
            const text = `${t.description || ""} ${t.location || ""}`.toLowerCase();
            return keywords.some((kw) => text.includes(kw));
          });
          return !hasMatch;
        });

        // Get cleaner names from assignments
        const bookingIds = withoutIncome.map((b) => b.id);
        const { data: assignments } = await supabase
          .from("cleaning_assignments")
          .select("schedule_id, cleaner_name")
          .in("schedule_id", bookingIds.length > 0 ? bookingIds : ["00000000-0000-0000-0000-000000000000"]);

        const cleanerMap = {};
        for (const a of assignments ?? []) {
          if (a.schedule_id && a.cleaner_name) cleanerMap[a.schedule_id] = a.cleaner_name;
        }

        const result = withoutIncome.map((b) => ({
          ...b,
          cleaner_name: cleanerMap[b.id] || null,
        }));

        return json({ success: true, data: result });
      }

      case "upload_receipt": {
        const { image_base64, file_name } = body;
        if (!image_base64 || !file_name) return json({ error: "Missing image_base64 or file_name" }, 400);

        // Decode base64 to Uint8Array
        const rawBase64 = image_base64.replace(/^data:[^;]+;base64,/, "");
        const binaryStr = atob(rawBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Determine content type
        const ext = (file_name.split(".").pop() || "jpg").toLowerCase();
        const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
        const contentType = mimeMap[ext] || "image/jpeg";

        const path = `bot/${Date.now()}_${file_name}`;
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, bytes, { contentType, upsert: false });

        if (uploadError) return json({ error: `Upload failed: ${uploadError.message}` }, 500);

        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);

        return json({ success: true, url: urlData.publicUrl });
      }

      // ─── LOG LOCK CODE ──────────────────────────────────────────────
      case "log_lock_code": {
        const { apartment, code, checkin_date, checkout_date, valid_from, valid_to, action: lockAction, notes } = body;
        if (!apartment || !code) return json({ error: "apartment and code are required" }, 400);

        const { data: entry, error: lcErr } = await supabase
          .from("lock_codes_log")
          .insert({
            apartment,
            code,
            checkin_date: checkin_date ?? null,
            checkout_date: checkout_date ?? null,
            valid_from: valid_from ?? null,
            valid_to: valid_to ?? null,
            action: lockAction ?? "create",
            notes: notes ?? null,
          })
          .select()
          .single();

        if (lcErr) return json({ error: lcErr.message }, 500);
        return json({ success: true, data: entry });
      }

      // ─── LOG GUEST MESSAGE ────────────────────────────────────────────
      case "log_guest_message": {
        const { apartment, code, language, checkin_date, checkout_date } = body;
        if (!apartment) return json({ error: "apartment is required" }, 400);

        const { data: entry, error: gmErr } = await supabase
          .from("guest_messages_log")
          .insert({
            apartment,
            code: code ?? null,
            language: language ?? null,
            checkin_date: checkin_date ?? null,
            checkout_date: checkout_date ?? null,
          })
          .select()
          .single();

        if (gmErr) return json({ error: gmErr.message }, 500);
        return json({ success: true, data: entry });
      }

      case "update_expense_receipt": {
        const { expense_id, receipt_url, receipt_text, amount, description } = body;
        if (!expense_id) return json({ error: "Missing expense_id" }, 400);

        const updateFields = {};
        if (receipt_url !== undefined) updateFields.receipt_url = receipt_url;
        if (receipt_text !== undefined) updateFields.receipt_text = receipt_text;
        if (amount !== undefined) updateFields.amount = amount;
        if (description !== undefined) updateFields.description = description;

        if (Object.keys(updateFields).length === 0) {
          return json({ error: "No fields to update" }, 400);
        }

        const { data: updated, error: updErr } = await supabase
          .from("emma_transactions")
          .update(updateFields)
          .eq("id", expense_id)
          .select()
          .single();

        if (updErr) return json({ error: updErr.message }, 500);
        return json({ success: true, transaction: updated });
      }

      case "create_guest_portal": {
        const { apartment, checkin_date, checkout_date, door_code, guests_count } = body;
        if (!apartment || !checkin_date || !checkout_date) {
          return json({ error: "apartment, checkin_date, checkout_date required" }, 400);
        }
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let token = "";
        for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
        token = token.toLowerCase();

        const { data: portal, error: pErr } = await supabase
          .from("guest_portals")
          .insert({
            token,
            apartment,
            checkin_date,
            checkout_date,
            door_code: door_code || null,
            guests_count: guests_count || null,
          })
          .select()
          .single();

        if (pErr) return json({ error: pErr.message }, 500);
        const url = `https://era-aparts.lovable.app/guest/${token}`;
        return json({ success: true, token, url, portal });
      }

      case "get_guest_portal": {
        const { token } = body;
        if (!token) return json({ error: "token required" }, 400);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split("T")[0];
        const todayStr = today.toISOString().split("T")[0];

        const { data: portal, error: gErr } = await supabase
          .from("guest_portals")
          .select("*")
          .eq("token", token)
          .single();

        if (gErr || !portal) return json({ error: "Portal not found", expired: true }, 404);

        if (portal.checkin_date > tomorrowStr || portal.checkout_date < todayStr || portal.status === "expired") {
          return json({ expired: true });
        }

        return json({ expired: false, portal });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[bot-api] error:", err);
    return json({ error: err.message ?? "Internal server error" }, 500);
  }
  } catch (e) {
    console.error("[bot-api]", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
