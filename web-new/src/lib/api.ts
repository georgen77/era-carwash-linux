import { supabase } from "@/integrations/supabase/client";

// Local Express API base URL - uses relative path for same-origin requests
const API_BASE = '';

async function localApi(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface WashReport {
  washName: string;
  headers: string[];
  rows: string[][];
  totalRow: string[];
  error?: string;
}

export interface AllWashesResponse {
  success: boolean;
  results: WashReport[];
  period: { from: string; to: string };
}

export interface ExtraReportResult {
  washName: string;
  // For table reports (collections, bonuses)
  headers?: string[];
  rows?: string[][];
  totalRow?: string[];
  // For chart reports (middleCheck, clientsCount)
  labels?: string[];
  values?: number[];
  error?: string;
}

export interface ExtraReportResponse {
  success: boolean;
  reportType: string;
  results: ExtraReportResult[];
  period: { from: string; to: string };
}

export type ReportType = 'collections' | 'bonuses' | 'middleCheck' | 'clientsCount' | 'details' | 'analytics';

export interface AnalyticsRow {
  month: string;
  midCheck: string;
  clCnt: string;
  profitTurnover: string;
  providedServices: string;
  midClAct: string;
  midCostOfPS: string;
  [key: string]: string;
}

export interface AnalyticsResult {
  washName: string;
  rows: AnalyticsRow[];
  error?: string;
}

export interface AnalyticsResponse {
  success: boolean;
  reportType: string;
  results: AnalyticsResult[];
  period: { from: string; to: string };
}

export interface DetailsResult {
  washName: string;
  headers: string[];
  rows: string[][];
  error?: string;
}

export interface DetailsResponse {
  success: boolean;
  reportType: string;
  results: DetailsResult[];
}

export async function fetchDetails(): Promise<DetailsResponse> {
  const data = await localApi('scrape-carwash', { reportType: 'details', dateFrom: '2026-01-01', dateTo: '2026-01-01', authToken: getAuthToken() });
  return data as DetailsResponse;
}

export async function fetchWashDetails(washIdx: number): Promise<DetailsResult> {
  const data = await localApi('scrape-carwash', { reportType: 'details', washIdx, dateFrom: '2026-01-01', dateTo: '2026-01-01', authToken: getAuthToken() });
  return data as DetailsResult;
}

export interface Expense {
  id: string;
  wash_name: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  comment: string;
  contractor: string;
  created_by: string;
  created_at: string;
}

export const EXPENSE_TYPES = [
  'Електрика',
  'Хімія',
  'Газ',
  'ДТ для генератора',
  'Запчастини',
  'Адмінвитрати',
  'Ремонтні роботи',
  'Податки та збори',
  'Інші витрати',
] as const;

export const WASH_NAMES = ['Усатово', 'Корсунцы', 'Левитана'] as const;

export const FIXED_DAILY_COST = 600; // грн за мийника на день

export function formatDateForApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getAuthToken(): string {
  const username = localStorage.getItem('carwash_user');
  if (username) {
    return btoa(`${username}:${Date.now()}`);
  }
  return localStorage.getItem('carwash_legacy_token') || '';
}

export async function login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const data = await localApi('manage-users', { action: 'login', username, password }) as Record<string, unknown>;
  if (data.success) {
    const token = (data.token as string) || btoa(`${username}:${Date.now()}`);
    localStorage.setItem('carwash_token', token);
    localStorage.setItem('carwash_legacy_token', token);
    localStorage.setItem('carwash_user', (data.username as string) || username);
    if (data.role) localStorage.setItem('carwash_role', data.role as string);
    window.dispatchEvent(new Event('auth-changed'));
    return { success: true };
  }
  return { success: false, error: data.error as string };
}

export function logout() {
  localStorage.removeItem('carwash_token');
  localStorage.removeItem('carwash_user');
  localStorage.removeItem('carwash_role');
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function getUsername(): string {
  return localStorage.getItem('carwash_user') || '';
}

// Fetch a single chunk (≤31 days) with caching and retry
async function fetchChunk(dateFrom: string, dateTo: string, retries = 2): Promise<AllWashesResponse> {
  const cacheKey = `report_${dateFrom}_${dateTo}`;
  const today = formatDateForApi(new Date());

  // Check local cache in localStorage
  if (dateTo < today) {
    const cached = localStorage.getItem(`cache_${cacheKey}`);
    if (cached) {
      try { return JSON.parse(cached) as AllWashesResponse; } catch { /* ignore */ }
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await localApi('scrape-carwash', { washIndex: 'all', dateFrom, dateTo, authToken: getAuthToken() });

      if (dateTo < today && (data as AllWashesResponse)?.success) {
        localStorage.setItem(`cache_${cacheKey}`, JSON.stringify(data));
      }

      return data as AllWashesResponse;
    } catch (e) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Unreachable');
}

// Split large date ranges into monthly chunks to avoid timeouts
function getMonthlyChunks(dateFrom: string, dateTo: string): { from: string; to: string }[] {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const chunks: { from: string; to: string }[] = [];

  let cursor = start;
  while (cursor <= end) {
    const monthEnd = endOfMonth(cursor);
    const chunkEnd = monthEnd > end ? end : monthEnd;
    chunks.push({ from: formatDateForApi(cursor), to: formatDateForApi(chunkEnd) });
    cursor = addMonths(startOfMonth(cursor), 1);
  }
  return chunks;
}

// Merge multiple AllWashesResponse results into one
function mergeResults(responses: AllWashesResponse[], dateFrom: string, dateTo: string): AllWashesResponse {
  if (responses.length === 1) return responses[0];

  const washNames = responses[0].results.map(r => r.washName);
  const merged: WashReport[] = washNames.map(name => {
    const allForWash = responses.map(r => r.results.find(w => w.washName === name)).filter(Boolean) as WashReport[];
    const allRows = allForWash.flatMap(w => w.rows);
    const headers = allForWash[0]?.headers || [];

    const totalRow = allForWash[0]?.totalRow?.map((val, i) => {
      if (i === 0) return val;
      const sum = allForWash.reduce((s, w) => s + parseFloat(w.totalRow?.[i] || "0"), 0);
      return sum.toFixed(2);
    }) || [];

    return { washName: name, headers, rows: allRows, totalRow };
  });

  return { success: true, results: merged, period: { from: dateFrom, to: dateTo } };
}

export async function fetchAllWashes(
  dateFrom: string,
  dateTo: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<AllWashesResponse> {
  const days = differenceInCalendarDays(new Date(dateTo), new Date(dateFrom));

  if (days <= 31) {
    return fetchChunk(dateFrom, dateTo);
  }

  const chunks = getMonthlyChunks(dateFrom, dateTo);
  const BATCH_SIZE = 3;
  const responses: AllWashesResponse[] = [];
  let loaded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(c => fetchChunk(c.from, c.to))
    );
    responses.push(...batchResults);
    loaded += batch.length;
    onProgress?.(loaded, chunks.length);
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return mergeResults(responses, dateFrom, dateTo);
}

export async function fetchExtraReport(reportType: ReportType, dateFrom: string, dateTo: string): Promise<ExtraReportResponse> {
  const data = await localApi('scrape-carwash', { reportType, dateFrom, dateTo, authToken: getAuthToken() });
  return data as ExtraReportResponse;
}

export async function fetchExpenses(washName: string | null, dateFrom: string, dateTo: string): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .order('expense_date', { ascending: false });

  if (washName) {
    query = query.eq('wash_name', washName);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Expense[];
}

export async function addExpense(expense: Omit<Expense, 'id' | 'created_at'>): Promise<Expense> {
  const { data, error } = await supabase.from('expenses').insert(expense).select().single();
  if (error) throw new Error(error.message);
  return data as Expense;
}

export async function deleteExpense(id: string, oldData?: Expense): Promise<void> {
  if (oldData) {
    await supabase.from('expense_logs').insert({
      expense_id: id,
      action: 'delete',
      changed_by: getUsername(),
      old_data: oldData as unknown as import('@/integrations/supabase/types').Json,
    } as never);
  }
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateExpense(id: string, updates: Partial<Omit<Expense, 'id' | 'created_at'>>, oldData: Expense): Promise<Expense> {
  await supabase.from('expense_logs').insert({
    expense_id: id,
    action: 'edit',
    changed_by: getUsername(),
    old_data: oldData as unknown as import('@/integrations/supabase/types').Json,
    new_data: updates as unknown as import('@/integrations/supabase/types').Json,
  } as never);
  const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data as Expense;
}

export interface ExpenseLog {
  id: string;
  expense_id: string;
  action: string;
  changed_by: string;
  changed_at: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown> | null;
}

export async function restoreExpense(log: ExpenseLog): Promise<void> {
  const old = log.old_data as Record<string, unknown>;
  if (log.action === 'delete') {
    const { data, error } = await supabase.from('expenses').insert({
      wash_name: old.wash_name as string,
      expense_date: old.expense_date as string,
      expense_type: old.expense_type as string,
      amount: old.amount as number,
      comment: (old.comment as string) || '',
      contractor: (old.contractor as string) || '',
      created_by: (old.created_by as string) || '',
    }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from('expense_logs').insert({
      expense_id: data.id,
      action: 'restore',
      changed_by: getUsername(),
      old_data: log.old_data as unknown as import('@/integrations/supabase/types').Json,
      new_data: { prev_action: log.action, prev_action_at: log.changed_at } as unknown as import('@/integrations/supabase/types').Json,
    } as never);
  } else if (log.action === 'edit') {
    const { error } = await supabase.from('expenses').update({
      wash_name: old.wash_name as string,
      expense_date: old.expense_date as string,
      expense_type: old.expense_type as string,
      amount: old.amount as number,
      comment: (old.comment as string) || '',
      contractor: (old.contractor as string) || '',
    }).eq('id', log.expense_id);
    if (error) throw new Error(error.message);
    await supabase.from('expense_logs').insert({
      expense_id: log.expense_id,
      action: 'restore',
      changed_by: getUsername(),
      old_data: log.old_data as unknown as import('@/integrations/supabase/types').Json,
      new_data: { prev_action: log.action, prev_action_at: log.changed_at } as unknown as import('@/integrations/supabase/types').Json,
    } as never);
  }
}

export async function fetchExpenseLogs(): Promise<ExpenseLog[]> {
  const { data, error } = await supabase
    .from('expense_logs')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data as unknown as ExpenseLog[];
}

export async function fetchCardPayments(washName: string, dateFrom: string, dateTo: string): Promise<{ headers: string[]; rows: string[][]; totalRow: string[] }> {
  const data = await localApi('scrape-carwash', { reportType: 'cardPayments', washName, dateFrom, dateTo, authToken: getAuthToken() });
  return data as { headers: string[]; rows: string[][]; totalRow: string[] };
}

export interface DailyFixedCost {
  id: string;
  wash_name: string;
  cost_date: string;
  amount: number;
  created_at: string;
}

export async function fetchDailyFixedCosts(dateFrom: string, dateTo: string): Promise<DailyFixedCost[]> {
  const { data, error } = await supabase
    .from('daily_fixed_costs')
    .select('*')
    .gte('cost_date', dateFrom)
    .lte('cost_date', dateTo);
  if (error) throw new Error(error.message);
  return data as DailyFixedCost[];
}

export async function upsertDailyFixedCost(washName: string, costDate: string, amount: number): Promise<void> {
  const { error } = await supabase
    .from('daily_fixed_costs')
    .upsert({ wash_name: washName, cost_date: costDate, amount }, { onConflict: 'wash_name,cost_date' });
  if (error) throw new Error(error.message);
}

export function calcFixedCosts(
  dateFrom: string, dateTo: string, customCosts: DailyFixedCost[]
): { total: number; byWash: Record<string, number> } {
  const days = differenceInCalendarDays(new Date(dateTo), new Date(dateFrom)) + 1;
  const costAmountMap = new Map(customCosts.map(c => [`${c.wash_name}_${c.cost_date}`, c.amount] as [string, number]));
  
  let total = 0;
  const byWash: Record<string, number> = {};
  
  for (const wash of WASH_NAMES) {
    byWash[wash] = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(dateFrom);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateForApi(d);
      const key = `${wash}_${dateStr}`;
      const cost = costAmountMap.has(key) ? costAmountMap.get(key)! : FIXED_DAILY_COST;
      byWash[wash] += cost;
      total += cost;
    }
  }
  return { total, byWash };
}

import { differenceInCalendarDays, startOfMonth, endOfMonth, addMonths, eachMonthOfInterval, format as fnsFormat } from "date-fns";

// === Monthly expense defaults ===

export interface MonthlyExpenseDefault {
  id: string;
  wash_name: string;
  expense_type: string;
  default_amount: number;
  valid_from: string;
  valid_to: string | null;
  active_months: number[];
  created_at: string;
}

export async function fetchMonthlyExpenseDefaults(): Promise<MonthlyExpenseDefault[]> {
  const { data, error } = await supabase
    .from('monthly_expense_defaults')
    .select('*')
    .order('wash_name');
  if (error) throw new Error(error.message);
  return (data || []) as unknown as MonthlyExpenseDefault[];
}

export async function upsertMonthlyExpenseDefault(
  washName: string, expenseType: string, amount: number, validFrom: string
): Promise<void> {
  const { error } = await supabase
    .from('monthly_expense_defaults')
    .upsert(
      { wash_name: washName, expense_type: expenseType, default_amount: amount, valid_from: validFrom },
      { onConflict: 'wash_name,expense_type,valid_from' }
    );
  if (error) throw new Error(error.message);
}

export function calcMonthlyDefaults(
  dateFrom: string,
  dateTo: string,
  defaults: MonthlyExpenseDefault[]
): {
  total: number;
  byType: Record<string, number>;
  byWash: Record<string, number>;
  byTypeAndWash: Record<string, Record<string, number>>;
  monthlyBreakdown: { month: string; type: string; wash: string; amount: number }[];
} {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const months = eachMonthOfInterval({ start, end });

  let total = 0;
  const byType: Record<string, number> = {};
  const byWash: Record<string, number> = {};
  const byTypeAndWash: Record<string, Record<string, number>> = {};
  const monthlyBreakdown: { month: string; type: string; wash: string; amount: number }[] = [];

  for (const monthDate of months) {
    const monthNum = monthDate.getMonth() + 1;
    const monthStr = fnsFormat(monthDate, 'yyyy-MM');

    for (const def of defaults) {
      if (!def.active_months.includes(monthNum)) continue;
      const validFrom = new Date(def.valid_from);
      if (monthDate < startOfMonth(validFrom)) continue;
      if (def.valid_to && monthDate > new Date(def.valid_to)) continue;

      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const periodStart = start > monthStart ? start : monthStart;
      const periodEnd = end < monthEnd ? end : monthEnd;
      const daysInMonth = differenceInCalendarDays(monthEnd, monthStart) + 1;
      const daysInPeriod = differenceInCalendarDays(periodEnd, periodStart) + 1;
      const ratio = daysInPeriod / daysInMonth;
      const amount = def.default_amount * ratio;

      total += amount;
      byType[def.expense_type] = (byType[def.expense_type] || 0) + amount;
      byWash[def.wash_name] = (byWash[def.wash_name] || 0) + amount;
      if (!byTypeAndWash[def.expense_type]) byTypeAndWash[def.expense_type] = {};
      byTypeAndWash[def.expense_type][def.wash_name] = (byTypeAndWash[def.expense_type][def.wash_name] || 0) + amount;

      monthlyBreakdown.push({ month: monthStr, type: def.expense_type, wash: def.wash_name, amount });
    }
  }

  return { total, byType, byWash, byTypeAndWash, monthlyBreakdown };
}
