require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

router.post("/cleaning-auth", async (req, res) => {
  try {
    const { username, password } = req.body;
    const login = (username ?? "").toString().trim();
    const pwd = (password ?? "").toString().trim();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: users, error: userError } = await supabase
      .from("cleaning_users")
      .select("*")
      .or(`username.ilike.${login},full_name.ilike.${login}`)
      .eq("is_active", true)
      .limit(1);

    const user = users?.[0] ?? null;
    if (userError || !user) return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    if (user.password_hash !== pwd) return res.status(401).json({ error: "Неверное имя пользователя или пароль" });

    const { password_hash, ...userData } = user;
    res.json({ user: userData, message: "Успешный вход" });
  } catch (error) {
    console.error("[cleaning-auth] error:", error.message);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

module.exports = router;
