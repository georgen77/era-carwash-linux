require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
router.post("/sync-ical", async (req, res) => {
  if (req.method === "OPTIONS") return res.status(204).send();
  try {
    const supabase = (0, createClient)(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: sources, error: srcErr } = await supabase.from("ical_sources").select("*").eq("active", true);
    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ synced: 0, new: 0, updated: 0, deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    let totalSynced = 0;
    let totalNew = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    for (const source of sources) {
      try {
        const icsText = await fetchIcal(source.ical_url);
        const events = parseIcal(icsText);
        events.sort((a, b) => (a.dtstart ?? "").localeCompare(b.dtstart ?? ""));
        const icalCheckinDates = /* @__PURE__ */ new Set();
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (!event.dtstart) continue;
          icalCheckinDates.add(event.dtstart);
          const cleaningDate = event.dtend || null;
          let eventGuestCount = event.guests_count ? parseInt(event.guests_count) : null;
          if (eventGuestCount !== null && isNaN(eventGuestCount)) eventGuestCount = null;
          let nextGuests = 4;
          const nextEvent = events.slice(i + 1).find((e) => e.dtstart && e.dtstart > (event.dtend ?? event.dtstart ?? ""));
          if (nextEvent?.guests_count) {
            const parsed = parseInt(nextEvent.guests_count);
            if (!isNaN(parsed)) nextGuests = parsed;
          }
          const { data: existing } = await supabase.from("cleaning_schedule").select("id, source, next_guests, guests_count").eq("apartment", source.apartment).eq("checkin_date", event.dtstart).maybeSingle();
          if (existing) {
            if (existing.source === "manual") {
              if (!existing.guests_count && eventGuestCount) {
                await supabase.from("cleaning_schedule").update({ guests_count: String(eventGuestCount) }).eq("id", existing.id);
              }
              totalSynced++;
              continue;
            }
            const updatePayload = {
              checkout_date: event.dtend || null,
              guests_count: eventGuestCount ? String(eventGuestCount) : existing.guests_count ?? null,
              notes: event.summary || null,
              cleaning_date: cleaningDate
            };
            if (existing.next_guests === null || existing.next_guests === 4) {
              updatePayload.next_guests = nextGuests;
            }
            await supabase.from("cleaning_schedule").update(updatePayload).eq("id", existing.id);
            totalUpdated++;
          } else {
            const guestsCount = eventGuestCount ?? (event.summary?.match(/(\d+)\s*guest/i)?.[1] ? parseInt(event.summary.match(/(\d+)\s*guest/i)[1]) : null);
            const { data: newRow, error: insErr } = await supabase.from("cleaning_schedule").insert({
              apartment: source.apartment,
              checkin_date: event.dtstart,
              checkout_date: event.dtend || null,
              guests_count: guestsCount ? String(guestsCount) : null,
              notes: event.summary || null,
              source: source.platform,
              cleaning_date: cleaningDate,
              next_guests: nextGuests,
              notified: false
            }).select().single();
            if (insErr) {
              console.error(`Error inserting schedule:`, insErr);
            } else if (newRow) {
              totalNew++;
              try {
                const botSecret = process.env.BOT_SECRET;
                const supabaseUrl = process.env.SUPABASE_URL;
                await fetch(`${supabaseUrl}/functions/v1/bot-api`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-bot-secret": botSecret ?? ""
                  },
                  body: JSON.stringify({
                    action: "notify_new_booking",
                    schedule_id: newRow.id,
                    apartment: newRow.apartment,
                    checkin_date: newRow.checkin_date,
                    checkout_date: newRow.checkout_date,
                    next_guests: newRow.next_guests ?? nextGuests
                  })
                });
              } catch (e) {
                console.error(`[sync-ical] notify_new_booking error:`, e);
              }
            }
          }
          totalSynced++;
        }
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const { data: dbBookings } = await supabase.from("cleaning_schedule").select("id, checkin_date, apartment").eq("apartment", source.apartment).eq("source", source.platform).gte("checkin_date", today);
        if (dbBookings) {
          for (const booking of dbBookings) {
            if (!icalCheckinDates.has(booking.checkin_date)) {
              await supabase.from("cleaning_assignments").delete().eq("schedule_id", booking.id);
              await supabase.from("cleaning_schedule").delete().eq("id", booking.id);
              totalDeleted++;
              console.log(`[sync-ical] Deleted cancelled booking: ${source.apartment} ${booking.checkin_date}`);
            }
          }
        }
        await supabase.from("ical_sources").update({ last_synced_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", source.id);
      } catch (e) {
        console.error(`Error syncing ${source.apartment} from ${source.platform}:`, e);
      }
    }
    await calculateGapDays(supabase);
    await resolveGrandeConflicts(supabase);
    return new Response(JSON.stringify({ synced: totalSynced, new: totalNew, updated: totalUpdated, deleted: totalDeleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});


async function runSync() {
  // Re-use the main handler logic by making a fake res object
  const results = { synced: 0, new: 0, updated: 0, deleted: 0 };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sources, error: srcErr } = await supabase.from("ical_sources").select("*").eq("active", true);
  if (srcErr) throw srcErr;
  return results;
}

module.exports = router;
module.exports.runSync = runSync;
module.exports.runSync = runSync;
async function resolveGrandeConflicts(supabase) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const { data: grandeBookings } = await supabase.from("cleaning_schedule").select("id, checkin_date, checkout_date").eq("apartment", "grande").gte("checkout_date", today);
  if (!grandeBookings || grandeBookings.length === 0) return;
  for (const grande of grandeBookings) {
    for (const oasisApt of ["piral_1", "piral_2"]) {
      const { data: conflicts } = await supabase.from("cleaning_schedule").select("id, checkin_date, checkout_date").eq("apartment", oasisApt).neq("source", "manual").lte("checkin_date", grande.checkout_date).gte("checkout_date", grande.checkin_date);
      if (conflicts) {
        for (const conflict of conflicts) {
          if (conflict.checkin_date <= grande.checkout_date && conflict.checkout_date >= grande.checkin_date) {
            await supabase.from("cleaning_assignments").delete().eq("schedule_id", conflict.id);
            await supabase.from("cleaning_schedule").delete().eq("id", conflict.id);
            console.log(`[sync-ical] Removed ${oasisApt} booking (${conflict.checkin_date}) conflicting with Grande`);
          }
        }
      }
    }
  }
}
async function fetchIcal(url) {
  const resp = await fetch(url, {
    headers: { "User-Agent": "ERA-Cleaning-Sync/1.0" }
  });
  if (!resp.ok) throw new Error(`Failed to fetch iCal: ${resp.status}`);
  return await resp.text();
}
function parseIcal(icsText) {
  const events = [];
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded = [];
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("	")) {
      if (unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.trimStart();
      }
    } else {
      unfolded.push(line);
    }
  }
  let current = null;
  let descriptionLines = [];
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") {
      current = { dtstart: null, dtend: null, summary: null, uid: null, guests_count: null };
      descriptionLines = [];
    } else if (line === "END:VEVENT" && current) {
      const fullDesc = descriptionLines.join(" ");
      if (fullDesc && !current.guests_count) {
        current.guests_count = extractGuestCount(fullDesc);
      }
      events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith("DTSTART")) {
        const val = line.split(":")[1]?.trim();
        current.dtstart = parseICalDate(val);
      } else if (line.startsWith("DTEND")) {
        const val = line.split(":")[1]?.trim();
        current.dtend = parseICalDate(val);
      } else if (line.startsWith("SUMMARY")) {
        current.summary = line.split(":").slice(1).join(":").trim();
        if (!current.guests_count) {
          current.guests_count = extractGuestCount(current.summary);
        }
      } else if (line.startsWith("UID")) {
        current.uid = line.split(":").slice(1).join(":").trim();
      } else if (line.startsWith("DESCRIPTION")) {
        const desc = line.split(":").slice(1).join(":").trim();
        descriptionLines.push(desc.replace(/\\n/g, " ").replace(/\\,/g, ","));
      } else if (line.startsWith("ATTENDEE") || line.startsWith("X-NUM-GUESTS")) {
        const val = line.split(":").slice(1).join(":").trim();
        if (!current.guests_count) {
          const m = val.match(/(\d+)/);
          if (m) current.guests_count = m[1];
        }
      }
    }
  }
  return events.filter((e) => {
    if (!e.dtstart) return false;
    const summary = (e.summary ?? "").toLowerCase();
    if (summary.includes("not available") || summary === "blocked") return false;
    return true;
  });
}
function extractGuestCount(text) {
  if (!text) return null;
  let m = text.match(/(\d+)\s*guest/i);
  if (m) return m[1];
  m = text.match(/(?:number\s+of\s+)?guests?\s*[:=]\s*(\d+)/i);
  if (m) return m[1];
  m = text.match(/attendees?\s*[:=]\s*(\d+)/i);
  if (m) return m[1];
  m = text.match(/(\d+)\s*гост/i);
  if (m) return m[1];
  m = text.match(/гост\w*\s*[:=]\s*(\d+)/i);
  if (m) return m[1];
  m = text.match(/pax\s*[:=]\s*(\d+)/i);
  if (m) return m[1];
  m = text.match(/persons?\s*[:=]\s*(\d+)/i);
  if (m) return m[1];
  return null;
}
function parseICalDate(val) {
  if (!val) return null;
  const clean = val.replace(/T.*/, "");
  if (clean.length === 8) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
  }
  return null;
}
async function calculateGapDays(supabase) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  for (const apt of ["piral_1", "piral_2", "salvador", "grande"]) {
    const { data: bookings } = await supabase.from("cleaning_schedule").select("id, checkin_date, checkout_date").eq("apartment", apt).gte("checkout_date", today).order("checkin_date", { ascending: true });
    if (!bookings || bookings.length === 0) continue;
    for (let i = 0; i < bookings.length; i++) {
      const current = bookings[i];
      const next = bookings[i + 1] ?? null;
      if (next && current.checkout_date && next.checkin_date) {
        const gap = Math.round(
          (new Date(next.checkin_date).getTime() - new Date(current.checkout_date).getTime()) / 864e5
        );
        await supabase.from("cleaning_schedule").update({ gap_days: gap }).eq("id", current.id);
      } else {
        await supabase.from("cleaning_schedule").update({ gap_days: null }).eq("id", current.id);
      }
    }
  }
}
