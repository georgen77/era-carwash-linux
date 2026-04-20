require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const VALID_LOCATIONS = ["piral_1","piral_2","salvador","dirty_linen_piral","dirty_linen_salvador","clean_linen_piral","clean_linen_salvador","albert_laundry","damaged","purchase"];
const VALID_ITEM_TYPES = ["sheets","duvet_covers","pillowcases","large_towels","small_towels","kitchen_towels","rugs","beach_mat","mattress_pad"];
router.post("/bot-movement", async (req, res) => {
  try {
    const { from_location, to_location, items, notes, source } = req.body;
    if (!from_location || !to_location || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "from_location, to_location, and items[] are required" });
    if (!VALID_LOCATIONS.includes(from_location) || !VALID_LOCATIONS.includes(to_location)) return res.status(400).json({ error: "Invalid location" });
    for (const item of items) {
      if (!item.item_type || !VALID_ITEM_TYPES.includes(item.item_type)) return res.status(400).json({ error: `Invalid item_type: ${item.item_type}` });
      if (!item.quantity || item.quantity <= 0) return res.status(400).json({ error: `Invalid quantity for ${item.item_type}` });
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    const rows = items.map(item => ({ from_location, to_location, item_type: item.item_type, quantity: item.quantity, notes: notes ? `${notes}${source ? ` [via ${source}]` : ""}` : (source ? `[via ${source}]` : null), created_at: now }));
    const { data, error } = await supabase.from("movements").insert(rows).select("id");
    if (error) throw error;
    res.json({ success: true, inserted: data.length, movement_ids: data.map(r => r.id) });
  } catch (e) { console.error("[bot-movement]", e.message); res.status(500).json({ error: e.message }); }
});
module.exports = router;
