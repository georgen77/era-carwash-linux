require("dotenv").config();
const express = require("express");
const router = express.Router();
const { processUpdate } = require("./handler");

// THIS FILE MUST NEVER BE CHANGED.
// All business logic lives in handler.js only.
router.post("/telegram-webhook", async (req, res) => {
  const body = req.body || {};
  // Process in background — never await, never block
  (async () => { await processUpdate(body).catch(console.error); })();
  // Return 200 IMMEDIATELY to Telegram (before any processing)
  return res.status(200).json({ ok: true });
});

module.exports = router;
