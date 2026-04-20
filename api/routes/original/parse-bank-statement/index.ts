const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROMPT = `Ты эксперт по анализу банковских выписок. Проанализируй эту выписку (может быть на любом языке: немецком, английском, русском и т.д.).

Найди ВСЕ входящие платежи (приходы / Geldeingang / credit) от Airbnb, Holidu, Booking.com и других платформ краткосрочной аренды, а также любые другие доходы от сдачи в аренду.

ВАЖНО для немецких выписок Revolut/немецких банков:
- "Geldeingang" = приход (входящий платёж)
- "Geldausgang" = расход (исходящий платёж)
- Дата в формате DD.MM.YYYY нужно конвертировать в YYYY-MM-DD
- Суммы с "€" — это EUR, убери символ валюты

Верни ТОЛЬКО валидный JSON массив без markdown, без пояснений:
[
  {
    "date": "YYYY-MM-DD",
    "amount": 1234.56,
    "source": "Airbnb",
    "description": "описание как в выписке",
    "reference": "референс или null",
    "apartment_hint": "апартамент если определяется или null"
  }
]

Если входящих платежей от аренды не найдено — верни [].`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!
    const body = await req.json()
    const { imageBase64 } = body

    if (!imageBase64) throw new Error('No file provided')

    const isPdf = imageBase64.startsWith('data:application/pdf') ||
                  imageBase64.startsWith('data:application/x-pdf') ||
                  imageBase64.startsWith('data:application/octet-stream')

    let messages: any[]

    if (isPdf) {
      // Strip data URL prefix and pass raw base64 to Gemini as inline PDF document
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '')

      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: PROMPT,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64Data}`,
              },
            },
          ],
        },
      ]
    } else {
      // Image: send as vision message
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: PROMPT,
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
          ],
        },
      ]
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 4000,
        temperature: 0,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI API error: ${response.status} — ${errText}`)
    }

    const aiData = await response.json()
    const rawContent = aiData.choices?.[0]?.message?.content || '[]'

    console.log('AI raw response (first 500):', rawContent.substring(0, 500))

    let transactions: any[] = []
    try {
      // Strip markdown fences if present
      const cleaned = rawContent
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()

      // Find JSON array boundaries
      const start = cleaned.indexOf('[')
      const end = cleaned.lastIndexOf(']')
      if (start !== -1 && end !== -1) {
        const jsonStr = cleaned.substring(start, end + 1)
        transactions = JSON.parse(jsonStr)
      } else {
        transactions = JSON.parse(cleaned)
      }

      if (!Array.isArray(transactions)) transactions = []
    } catch (e) {
      console.warn('Failed to parse AI response:', e, '\nRaw:', rawContent.substring(0, 500))
      transactions = []
    }

    console.log(`Found ${transactions.length} transactions`)

    return new Response(JSON.stringify({ success: true, transactions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('parse-bank-statement error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
