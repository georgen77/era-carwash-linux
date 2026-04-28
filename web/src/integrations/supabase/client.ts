// Local API implementation — drop-in replacement for Supabase client
// All calls go to /api/* on the same origin instead of Supabase

async function post(endpoint: string, body: unknown) {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.error || 'Request failed' } };
    return { data: json.data ?? json, error: json.error ?? null };
  } catch (e: unknown) {
    return { data: null, error: { message: (e as Error).message } };
  }
}

class SelectBuilder {
  private _table: string;
  private _columns: string;
  private _filters: Array<{ column: string; op: string; value: unknown }> = [];
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _single = false;
  private _maybe = false;

  constructor(table: string, columns: string) { this._table = table; this._columns = columns; }

  eq(col: string, val: unknown)    { this._filters.push({ column: col, op: '=', value: val }); return this; }
  neq(col: string, val: unknown)   { this._filters.push({ column: col, op: '!=', value: val }); return this; }
  gte(col: string, val: unknown)   { this._filters.push({ column: col, op: 'gte', value: val }); return this; }
  lte(col: string, val: unknown)   { this._filters.push({ column: col, op: 'lte', value: val }); return this; }
  gt(col: string, val: unknown)    { this._filters.push({ column: col, op: '>', value: val }); return this; }
  lt(col: string, val: unknown)    { this._filters.push({ column: col, op: '<', value: val }); return this; }
  ilike(col: string, val: unknown) { this._filters.push({ column: col, op: 'ilike', value: val }); return this; }
  in(col: string, vals: unknown[]) { this._filters.push({ column: col, op: 'in', value: vals }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this._order = { column: col, ascending: opts?.ascending ?? true }; return this; }
  limit(n: number) { this._limit = n; return this; }
  single()      { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }

  then(resolve: (r: { data: unknown; error: unknown }) => void, reject?: (e: Error) => void) {
    return post('db/select', {
      table: this._table, columns: this._columns,
      filters: this._filters, order: this._order, limit: this._limit,
    }).then(result => {
      if (this._single || this._maybe) {
        const rows = Array.isArray(result.data) ? result.data : [];
        resolve({ data: rows[0] ?? null, error: result.error });
      } else {
        resolve(result);
      }
    }, reject);
  }
}

class InsertBuilder {
  private _table: string;
  private _row: unknown;
  private _doSelect = false;
  private _single = false;

  constructor(table: string, row: unknown) { this._table = table; this._row = row; }
  select() { this._doSelect = true; return this; }
  single() { this._single = true; return this; }

  then(resolve: (r: { data: unknown; error: unknown }) => void, reject?: (e: Error) => void) {
    return post('db/insert', { table: this._table, row: this._row }).then(result => {
      if (this._single) {
        const rows = Array.isArray(result.data) ? result.data : [result.data];
        resolve({ data: rows[0] ?? null, error: result.error });
      } else {
        resolve(result);
      }
    }, reject);
  }
}

class UpdateBuilder {
  private _table: string;
  private _updates: unknown;
  private _filters: Array<{ column: string; op: string; value: unknown }> = [];

  constructor(table: string, updates: unknown) { this._table = table; this._updates = updates; }
  eq(col: string, val: unknown) { this._filters.push({ column: col, op: '=', value: val }); return this; }

  then(resolve: (r: { data: unknown; error: unknown }) => void, reject?: (e: Error) => void) {
    return post('db/update', { table: this._table, updates: this._updates, filters: this._filters }).then(resolve, reject);
  }
}

class UpsertBuilder {
  private _table: string;
  private _row: unknown;
  private _conflict?: string | string[];

  constructor(table: string, row: unknown, opts?: { onConflict?: string | string[] }) {
    this._table = table; this._row = row; this._conflict = opts?.onConflict;
  }

  then(resolve: (r: { data: unknown; error: unknown }) => void, reject?: (e: Error) => void) {
    return post('db/upsert', { table: this._table, row: this._row, onConflict: this._conflict }).then(resolve, reject);
  }
}

class DeleteBuilder {
  private _table: string;
  private _filters: Array<{ column: string; op: string; value: unknown }> = [];

  constructor(table: string) { this._table = table; }
  eq(col: string, val: unknown) { this._filters.push({ column: col, op: '=', value: val }); return this; }

  then(resolve: (r: { data: unknown; error: unknown }) => void, reject?: (e: Error) => void) {
    return post('db/delete', { table: this._table, filters: this._filters }).then(resolve, reject);
  }
}

export const supabase = {
  from(table: string) {
    return {
      select: (columns = '*') => new SelectBuilder(table, columns),
      insert: (row: unknown) => new InsertBuilder(table, row),
      update: (updates: unknown) => new UpdateBuilder(table, updates),
      upsert: (row: unknown, opts?: { onConflict?: string | string[] }) => new UpsertBuilder(table, row, opts),
      delete: () => new DeleteBuilder(table),
    };
  },
  functions: {
    async invoke(name: string, opts: { body: unknown }) {
      try {
        const res = await fetch(`/api/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts.body),
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { message: data.error || 'Request failed' } };
        return { data, error: null };
      } catch (e: unknown) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  },
};

export type Database = Record<string, unknown>;
