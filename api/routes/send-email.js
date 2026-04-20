require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/send-email", async (req, res) => {
  try {
    const { to, subject, html, text } = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Missing RESEND_API_KEY");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ERA Carwash <onboarding@resend.dev>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>`,
        text: text || "",
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to send email");
    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error("[send-email] error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
