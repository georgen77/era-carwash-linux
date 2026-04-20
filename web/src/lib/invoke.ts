/**
 * Drop-in replacement for supabase.functions.invoke()
 * Routes calls to the local Express API instead of Supabase Edge Functions.
 */
export const invoke = async <T = any>(
  name: string,
  options?: { body?: any; method?: string }
): Promise<{ data: T | null; error: { message: string } | null }> => {
  try {
    const resp = await fetch(`/api/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { data: null, error: { message: text } };
    }
    const data = await resp.json() as T;
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message || "Network error" } };
  }
};
