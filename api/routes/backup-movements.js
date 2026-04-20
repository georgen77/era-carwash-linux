require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

router.post("/backup-movements", async (req, res) => {
  try {
    console.log("[backup-movements] starting backup");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: movements, error } = await supabase
      .from("movements")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    console.log(`[backup-movements] fetched ${movements?.length || 0} records`);
    res.json({ backup_date: new Date().toISOString(), total_records: movements?.length || 0, data: movements });
  } catch (error) {
    console.error("[backup-movements] error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
