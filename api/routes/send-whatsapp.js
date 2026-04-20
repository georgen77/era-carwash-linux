require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

async function sendWhatsApp(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) throw new Error("Missing Twilio credentials");

  const fromNumber = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const params = new URLSearchParams();
  params.append("From", fromNumber);
  params.append("To", toNumber);
  params.append("Body", message);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send WhatsApp message: ${error}`);
  }
  return response.json();
}

router.post("/send-whatsapp", async (req, res) => {
  try {
    const { movementDetails, phoneNumber, movementId, to, message: directMessage } = req.body;
    const targetPhone = to || phoneNumber;
    const finalMessage = directMessage || (movementDetails ? JSON.stringify(movementDetails) : "");
    if (!finalMessage) throw new Error("No message provided");
    if (!targetPhone) throw new Error("No target phone provided");

    const result = await sendWhatsApp(targetPhone, finalMessage);

    if (movementId) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("movements").update({
        whatsapp_status: "sent",
        whatsapp_sent_at: new Date().toISOString(),
      }).eq("id", movementId);
    }

    res.json({ success: true, messageSid: result.sid });
  } catch (error) {
    console.error("[send-whatsapp] error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
