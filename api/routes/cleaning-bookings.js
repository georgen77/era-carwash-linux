require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
router.post("/cleaning-bookings", async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { action, userId, bookingId, bookingData, cleaningData } = req.body;
    const { data: user, error: userError } = await supabase.from("cleaning_users").select("id, role, is_active").eq("id", userId).eq("is_active", true).single();
    if (userError || !user) throw new Error("User not found or inactive");
    const isAdmin = user.role === "admin";
    const isAdminOrCoordinator = isAdmin || user.role === "coordinator";
    if (action === "create") {
      if (!isAdminOrCoordinator) throw new Error("Insufficient permissions");
      const { data: booking, error: bErr } = await supabase.from("bookings").insert(bookingData).select().single();
      if (bErr) throw bErr;
      if (cleaningData) {
        const { error: cErr } = await supabase.from("cleanings").insert(cleaningData);
        if (cErr) { await supabase.from("bookings").delete().eq("id", booking.id); throw cErr; }
      }
      return res.json({ success: true, booking });
    }
    if (action === "delete") {
      if (!isAdmin) throw new Error("Only admins can delete bookings");
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;
      return res.json({ success: true });
    }
    throw new Error("Invalid action");
  } catch (e) { console.error("[cleaning-bookings]", e.message); res.status(400).json({ error: e.message }); }
});
module.exports = router;
