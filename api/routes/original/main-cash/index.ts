import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, userId, transactionData, transactionId, logId, counterpartyName, oldName, newName } = body;

    // Verify user is admin
    const { data: user, error: userError } = await supabase
      .from('cleaning_users')
      .select('id, role, is_active')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) throw new Error('User not found or inactive');
    if (user.role !== 'admin') throw new Error('Only admin can access main cashbox');

    // ── add_counterparty ──────────────────────────────────────
    if (action === 'add_counterparty') {
      if (counterpartyName) {
        await supabase.from('main_counterparties').upsert(
          { name: counterpartyName, created_by: userId },
          { onConflict: 'name', ignoreDuplicates: true }
        );
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── edit_counterparty ─────────────────────────────────────
    if (action === 'edit_counterparty') {
      if (oldName && newName) {
        await supabase.from('main_counterparties').update({ name: newName }).eq('name', oldName);
        await supabase.from('main_transactions').update({ counterparty: newName }).eq('counterparty', oldName);
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── list_counterparties ───────────────────────────────────
    if (action === 'list_counterparties') {
      const { data, error } = await supabase.from('main_counterparties').select('name').order('name');
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, counterparties: data?.map(c => c.name) || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── add ───────────────────────────────────────────────────
    if (action === 'add') {
      // Save counterparties if new
      if (transactionData.counterparty) {
        const names: string[] = transactionData.counterparty.split(', ').map((n: string) => n.trim()).filter(Boolean);
        for (const name of names) {
          await supabase.from('main_counterparties').upsert({ name, created_by: userId }, { onConflict: 'name', ignoreDuplicates: true });
        }
      }

      const { data: tx, error: txError } = await supabase
        .from('main_transactions')
        .insert({
          transaction_type: transactionData.transaction_type,
          amount: transactionData.amount,
          description: transactionData.description,
          counterparty: transactionData.counterparty || null,
          category: transactionData.category || null,
          location: transactionData.location || null,
          created_by: userId,
          transaction_date: transactionData.transaction_date || new Date().toISOString(),
          receipt_url: transactionData.receipt_url || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Audit log
      await supabase.from('main_transaction_log').insert({
        transaction_id: tx.id, action: 'create', changed_by: userId, new_data: tx,
      });

      // ── Auto-sync to Emma's cashbox ─────────────────────────
      // Expense to "Эмма 7260" → income in emma_transactions from "Карта папы"
      // Expense to "Эмма efectivo" → income in emma_transactions from "Наличные"
      if (transactionData.transaction_type === 'expense' && transactionData.counterparty) {
        const cp = transactionData.counterparty;
        let emmaSource: string | null = null;
        if (cp.includes('Эмма 7260')) emmaSource = 'Карта папы';
        else if (cp.includes('Эмма efectivo')) emmaSource = 'Наличные';

        if (emmaSource) {
          const { data: emmaTx } = await supabase.from('emma_transactions').insert({
            transaction_type: 'income',
            amount: transactionData.amount,
            description: `Перевод из основной кассы (авто): ${transactionData.description || ''}`,
            counterparty: emmaSource,
            payment_source: emmaSource === 'Карта папы' ? 'george_card' : 'emma_cash',
            created_by: userId,
            transaction_date: transactionData.transaction_date || new Date().toISOString(),
          }).select().single();

          if (emmaTx) {
            await supabase.from('emma_transaction_log').insert({
              transaction_id: emmaTx.id, action: 'create', changed_by: userId, new_data: emmaTx,
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, transaction: tx }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── list ──────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await supabase
        .from('main_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, transactions: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── update ────────────────────────────────────────────────
    if (action === 'update') {
      const { data: existing } = await supabase.from('main_transactions').select('*').eq('id', transactionId).single();
      const updatePayload: any = {
        amount: transactionData.amount,
        description: transactionData.description,
      };
      if (transactionData.counterparty !== undefined) updatePayload.counterparty = transactionData.counterparty;
      if (transactionData.category !== undefined) updatePayload.category = transactionData.category;
      if (transactionData.location !== undefined) updatePayload.location = transactionData.location;
      if (transactionData.transaction_date !== undefined) updatePayload.transaction_date = transactionData.transaction_date;
      if (transactionData.receipt_url !== undefined) updatePayload.receipt_url = transactionData.receipt_url;
      const { data: updated, error: updErr } = await supabase.from('main_transactions').update(updatePayload).eq('id', transactionId).select().single();
      if (updErr) throw updErr;
      await supabase.from('main_transaction_log').insert({ transaction_id: transactionId, action: 'update', changed_by: userId, old_data: existing, new_data: updated });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── delete ────────────────────────────────────────────────
    if (action === 'delete') {
      const { data: existing } = await supabase.from('main_transactions').select('*').eq('id', transactionId).single();
      await supabase.from('main_transaction_log').insert({ transaction_id: transactionId, action: 'delete', changed_by: userId, old_data: existing, new_data: null });
      await supabase.from('main_transactions').delete().eq('id', transactionId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── restore ───────────────────────────────────────────────
    if (action === 'restore') {
      const { data: logEntry } = await supabase.from('main_transaction_log').select('*').eq('id', logId).single();
      if (!logEntry || !logEntry.old_data) throw new Error('Log entry not found or has no data to restore');
      const oldData = logEntry.old_data as any;
      const { error: restoreErr } = await supabase.from('main_transactions').upsert({
        id: oldData.id, transaction_type: oldData.transaction_type, amount: oldData.amount,
        description: oldData.description, counterparty: oldData.counterparty,
        category: oldData.category, location: oldData.location,
        created_by: oldData.created_by, transaction_date: oldData.transaction_date,
      });
      if (restoreErr) throw restoreErr;
      await supabase.from('main_transaction_log').insert({ transaction_id: oldData.id, action: 'restore', changed_by: userId, old_data: null, new_data: oldData });
      await supabase.from('main_transaction_log').update({ action: 'delete_restored' }).eq('id', logId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── list_log ──────────────────────────────────────────────
    if (action === 'list_log') {
      const { data, error } = await supabase.from('main_transaction_log').select('*').order('changed_at', { ascending: false }).limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, logs: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error('Invalid action');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
