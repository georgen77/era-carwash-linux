require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
router.get("/cleaner-portal", async (req, res) => {
  try {
    const { telegram_id } = req.query;
    if (!telegram_id) return res.status(400).json({ error: "telegram_id is required" });
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];
    const { data: assignments, error: aErr } = await supabase.from("cleaning_assignments").select("*").eq("cleaner_telegram_id", telegram_id).order("cleaning_date", { ascending: false });
    if (aErr) throw aErr;
    const upcoming = (assignments ?? []).filter(a => a.cleaning_date >= today && a.status !== "done" && a.status !== "cancelled");
    const past = (assignments ?? []).filter(a => a.cleaning_date < today || a.status === "done");
    const totalEarned = past.filter(a => a.payment_confirmed).reduce((s, a) => s + Number(a.payment_amount ?? 0), 0);
    const pendingPayment = past.filter(a => a.status === "done" && !a.payment_confirmed).reduce((s, a) => s + Number(a.payment_amount ?? 0), 0);
    res.json({ success: true, cleaner_name: assignments?.[0]?.cleaner_name ?? null, upcoming, past: past.slice(0, 20), summary: { total_shifts: assignments?.length ?? 0, total_earned: totalEarned, pending_payment: pendingPayment } });
  } catch (e) { console.error("[cleaner-portal]", e.message); res.status(400).json({ error: e.message }); }
});
module.exports = router;
