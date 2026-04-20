require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/check-password", async (req, res) => {
  try {
    const { password } = req.body;
    const validPassword = process.env.APP_PASSWORD || "0809";
    res.json({ isValid: password === validPassword });
  } catch (error) {
    console.error("[check-password] error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
