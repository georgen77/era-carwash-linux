require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "era-carwash-api", version: "1.0.0", ts: new Date().toISOString() });
});

// ГРУППА A
app.use("/api", require("./routes/send-telegram"));
app.use("/api", require("./routes/send-telegram-notification"));
app.use("/api", require("./routes/send-whatsapp"));
app.use("/api", require("./routes/send-email"));
app.use("/api", require("./routes/check-password"));
app.use("/api", require("./routes/backup-movements"));
app.use("/api", require("./routes/restore-movements"));
app.use("/api", require("./routes/weekly-payment-reminder"));

// ГРУППА B (раскомментировать после создания файлов):
app.use("/api", require("./routes/cleaning-auth"));
app.use("/api", require("./routes/cleaning-bookings"));
app.use("/api", require("./routes/cleaner-portal"));
app.use("/api", require("./routes/emma-cash"));
app.use("/api", require("./routes/main-cash"));
app.use("/api", require("./routes/task-ai-chat"));
app.use("/api", require("./routes/bot-movement"));
app.use("/api", require("./routes/whatsapp-webhook"));
app.use("/api", require("./routes/parse-bank-statement"));

// ГРУППА C (раскомментировать после создания файлов):
app.use("/api", require("./routes/ocr-receipt"));
app.use("/api", require("./routes/scan-linen"));
app.use("/api", require("./routes/transcribe-audio"));
app.use("/api", require("./routes/smart-voice-input"));
app.use("/api", require("./routes/sync-ical"));
try { app.use("/api", require("./routes/bot-api")); } catch(e) { console.warn("[WARN] bot-api skipped:", e.message); }
app.use("/api", require("./routes/telegram-webhook"));

// === CARWASH TRACKING ROUTES ===
app.use("/api", require("./routes/scrape-carwash"));
app.use("/api", require("./routes/manage-users"));
app.use("/api", require("./routes/ai-assistant"));
app.use("/api", require("./routes/cw-send-telegram"));
app.use("/api", require("./routes/telegram-bot-webhook"));
app.use("/api", require("./routes/whatsapp-daily-report"));
app.use("/api", require("./routes/admin-users"));

// CRON: еженедельное напоминание (понедельник 9:00 Valencia = UTC+2 → 07:00 UTC)
cron.schedule("0 7 * * 1", async () => {
  console.log("[CRON] weekly-payment-reminder");
  try {
    const h = require("./routes/weekly-payment-reminder");
    await h.runReminder();
  } catch (e) { console.error("[CRON] weekly-payment-reminder error:", e.message); }
});

// CRON: iCal sync каждые 6 часов (раскомментировать после создания sync-ical):
cron.schedule("0 */6 * * *", async () => {
  try { const h = require("./routes/sync-ical"); await h.runSync(); }
  catch (e) { console.error("[CRON] sync-ical error:", e.message); }
});

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => { console.log(`ERA Carwash API running on port ${PORT}`); });
module.exports = app;
