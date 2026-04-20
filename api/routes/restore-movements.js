require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

router.post("/restore-movements", async (req, res) => {
  try {
    console.log("[restore-movements] starting restore");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: backupData } = req.body;
    if (!backupData || !Array.isArray(backupData)) throw new Error("Invalid backup data format");
    console.log(`[restore-movements] restoring ${backupData.length} records`);
    const { error: deleteError } = await supabase
      .from("movements")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase.from("movements").insert(backupData);
    if (insertError) throw insertError;
    res.json({ success: true, restored_records: backupData.length });
  } catch (error) {
    console.error("[restore-movements] error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
