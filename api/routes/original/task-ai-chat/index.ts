import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, taskTitle, taskDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Ты умный помощник для управления задачами. Помогаешь организовать и решить конкретную задачу.
Текущая задача: "${taskTitle}"
Описание: "${taskDescription}"

Ты помогаешь:
- Писать официальные письма в службы и организации на русском, испанском или английском языке
- Находить телефоны организаций в Валенсии, Испании (указывай номер в формате для нажатия: tel:+34...)
- Прокладывать маршруты (давай ссылки в формате https://www.google.com/maps/dir//НАЗВАНИЕ+ОРГАНИЗАЦИИ+Valencia)
- Давать пошаговые инструкции по решению бюрократических вопросов в Испании
- Переводить и объяснять документы
- Предлагать конкретные следующие шаги

Форматируй ответы с эмоджи для наглядности. Будь конкретным и практичным. Отвечай на русском языке если вопрос на русском.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Лимит запросов превышен, попробуйте позже." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Недостаточно средств на счёте." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("task-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
