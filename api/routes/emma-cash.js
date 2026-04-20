require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

router.post("/emma-cash", async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { action, userId, transactionData, transactionId, logId, counterpartyName, oldName, newName } = req.body;

    const { data: user, error: userError } = await supabase.from("cleaning_users").select("id, role, is_active").eq("id", userId).eq("is_active", true).single();
    if (userError || !user) throw new Error("User not found or inactive");
    const isAdminOrCoordinator = user.role === "admin" || user.role === "coordinator";
    if (!isAdminOrCoordinator) throw new Error("Insufficient permissions");

    if (action === "add_counterparty") {
      if (counterpartyName) await supabase.from("counterparties").upsert({ name: counterpartyName, created_by: userId }, { onConflict: "name", ignoreDuplicates: true });
      return res.json({ success: true });
    }
    if (action === "edit_counterparty") {
      if (oldName && newName) {
        await supabase.from("counterparties").update({ name: newName }).eq("name", oldName);
        await supabase.from("emma_transactions").update({ counterparty: newName }).eq("counterparty", oldName);
      }
      return res.json({ success: true });
    }
    if (action === "add") {
      if (transactionData.counterparty) {
        const names = transactionData.counterparty.split(", ").map(n => n.trim()).filter(Boolean);
        for (const name of names) await supabase.from("counterparties").upsert({ name, created_by: userId }, { onConflict: "name", ignoreDuplicates: true });
      }
      const { data: tx, error: txError } = await supabase.from("emma_transactions").insert({
        transaction_type: transactionData.transaction_type, amount: transactionData.amount,
        description: transactionData.description, counterparty: transactionData.counterparty || null,
        location: transactionData.location || null, payment_source: "emma_cash", created_by: userId,
        transaction_date: transactionData.transaction_date || new Date().toISOString(),
        receipt_url: transactionData.receipt_url || null,
      }).select().single();
      if (txError) throw txError;
      await supabase.from("emma_transaction_log").insert({ transaction_id: tx.id, action: "create", changed_by: userId, new_data: tx });
      return res.json({ success: true, transaction: tx });
    }
    if (action === "list") {
      const { data, error } = await supabase.from("emma_transactions").select("*, receipt_text").order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return res.json({ success: true, transactions: data });
    }
    if (action === "list_counterparties") {
      const { data, error } = await supabase.from("counterparties").select("name").order("name");
      if (error) throw error;
      return res.json({ success: true, counterparties: data?.map(c => c.name) || [] });
    }
    if (action === "update") {
      const { data: existing } = await supabase.from("emma_transactions").select("*").eq("id", transactionId).single();
      const upd = { amount: transactionData.amount, description: transactionData.description };
      if (transactionData.counterparty !== undefined) upd.counterparty = transactionData.counterparty;
      if (transactionData.location !== undefined) upd.location = transactionData.location;
      if (transactionData.transaction_date !== undefined) upd.transaction_date = transactionData.transaction_date;
      if (transactionData.receipt_url !== undefined) upd.receipt_url = transactionData.receipt_url;
      const { data: updated, error: updErr } = await supabase.from("emma_transactions").update(upd).eq("id", transactionId).select().single();
      if (updErr) throw updErr;
      await supabase.from("emma_transaction_log").insert({ transaction_id: transactionId, action: "update", changed_by: userId, old_data: existing, new_data: updated });
      return res.json({ success: true });
    }
    if (action === "delete") {
      const { data: existing } = await supabase.from("emma_transactions").select("*").eq("id", transactionId).single();
      await supabase.from("emma_transaction_log").insert({ transaction_id: transactionId, action: "delete", changed_by: userId, old_data: existing, new_data: null });
      await supabase.from("emma_transactions").delete().eq("id", transactionId);
      return res.json({ success: true });
    }
    if (action === "restore") {
      const { data: logEntry } = await supabase.from("emma_transaction_log").select("*").eq("id", logId).single();
      if (!logEntry || !logEntry.old_data) throw new Error("Log entry not found or has no data to restore");
      const old = logEntry.old_data;
      const { error: restoreErr } = await supabase.from("emma_transactions").upsert({ id: old.id, transaction_type: old.transaction_type, amount: old.amount, description: old.description, counterparty: old.counterparty, location: old.location, payment_source: old.payment_source, created_by: old.created_by, transaction_date: old.transaction_date });
      if (restoreErr) throw restoreErr;
      await supabase.from("emma_transaction_log").insert({ transaction_id: old.id, action: "restore", changed_by: userId, old_data: null, new_data: old });
      await supabase.from("emma_transaction_log").update({ action: "delete_restored" }).eq("id", logId);
      return res.json({ success: true });
    }
    if (action === "list_log") {
      const { data, error } = await supabase.from("emma_transaction_log").select("*").order("changed_at", { ascending: false }).limit(200);
      if (error) throw error;
      return res.json({ success: true, logs: data });
    }
    throw new Error("Invalid action");
  } catch (e) { console.error("[emma-cash]", e.message); res.status(400).json({ error: e.message }); }
});

module.exports = router;
