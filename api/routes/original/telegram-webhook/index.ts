// @deno-types="npm:@types/node"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processUpdate } from "./handler.ts";

// THIS FILE MUST NEVER BE CHANGED.
// All business logic lives in handler.ts only.
serve(async (req: Request) => {
  let body: any = {};
  try { body = await req.json(); } catch {}
  // Process in background — never await, never block
  (async () => { await processUpdate(body).catch(console.error); })();
  // Return 200 IMMEDIATELY to Telegram (before any processing)
  return new Response('{"ok":true}', {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
