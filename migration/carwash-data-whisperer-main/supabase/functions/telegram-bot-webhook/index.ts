/**
 * Telegram Bot Webhook — принимает сообщения из рабочих групп
 * и сохраняет в work_journal_entries с привязкой к мойке.
 * 
 * Определение мойки по названию группы или по ключевым словам в тексте:
 * - Если название группы содержит "усатово" → Усатово
 * - Если название группы содержит "корсунц"/"красноcилка" → Корсунцы
 * - Если название группы содержит "левитана" → Левитана
 * - Иначе → Общее
 * 
 * Как настроить:
 * 1. Зайти в @BotFather → выбрать бота igera → Bot Settings → Allow Groups → Enable
 * 2. Добавить бота в нужные рабочие группы
 * 3. Установить webhook: https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://wjvsdpgwhdriftevxsqp.supabase.co/functions/v1/telegram-bot-webhook
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

function detectWash(groupTitle: string, text: string): string {
  const combined = (groupTitle + ' ' + text).toLowerCase();
  if (combined.includes('усатов')) return 'Усатово';
  if (combined.includes('корсунц') || combined.includes('красносилка') || combined.includes('krasnosilka')) return 'Корсунцы';
  if (combined.includes('левитана') || combined.includes('левитан')) return 'Левитана';
  return 'Общее';
}

function isServiceMessage(text: string): boolean {
  const keywords = [
    'свет', 'світло', 'генератор', 'топлив', 'пальне', 'залив', 'остаток', 'залишок',
    'вимикання', 'включення', 'вкл', 'выкл', 'запуск', 'прийом', 'приём', 'заправк',
    'авар', 'поломк', 'ремонт', 'техник', 'вода', 'насос', 'поломка', 'не работает',
    'не працює', 'відключили', 'отключили', 'підключили', 'подключили',
  ];
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

async function downloadTelegramFile(fileId: string): Promise<string | null> {
  try {
    const fileResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    if (!fileData.ok) return null;
    const filePath = fileData.result.file_path;
    const imgResp = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    const buffer = await imgResp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const mimeType = filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function saveToJournal(entry: {
  message: string;
  wash_name: string;
  author: string;
  telegram_user: string;
  telegram_group: string;
  telegram_message_id: number;
  source: string;
  tags?: string[];
  image?: string | null;
}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/work_journal_entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(entry),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DB insert failed: ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // GET /telegram-bot-webhook?action=setWebhook — register webhook with Telegram
  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('action') === 'setWebhook') {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot-webhook`;
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=["message","edited_message","channel_post"]&drop_pending_updates=false`);
      const data = await resp.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (url.searchParams.get('action') === 'getWebhookInfo') {
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
      const data = await resp.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response('Telegram Bot Webhook endpoint', { headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log('Telegram update:', JSON.stringify(update).slice(0, 500));

    const msg = update.message || update.edited_message;
    if (!msg) return new Response('ok', { headers: corsHeaders });

    const chatId = msg.chat?.id;
    const chatType = msg.chat?.type; // 'group', 'supergroup', 'private'
    const groupTitle = msg.chat?.title || '';
    const messageId = msg.message_id;
    const from = msg.from;
    const authorName = from?.username ? `@${from.username}` : `${from?.first_name || ''} ${from?.last_name || ''}`.trim();
    const text = msg.text || msg.caption || '';
    const date = new Date(msg.date * 1000).toISOString();

    // Only skip private chats WITHOUT text (pure media without caption from unknown users)
    // But allow private messages with text - the bot should respond to direct messages
    if (chatType === 'private') {
      // For private chats, answer via AI if there's text
      if (text) {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: 'AI-ключ не настроен. Обратитесь к администратору.' }),
          });
          return new Response('ok', { headers: corsHeaders });
        }

        // Try to detect if it's a task creation request
        const taskKeywords = /запиши\s+задачу|отметь\s+задачу|создай\s+задачу|create\s+task|запиши\s+завдання/i;
        const isTaskCreation = taskKeywords.test(text);

        let replyText = '';

        if (isTaskCreation) {
          // Extract wash name
          const washMap: Record<string, string> = {
            'усатово': 'Усатово', 'усатов': 'Усатово',
            'корсунц': 'Корсунцы', 'левитан': 'Левитана',
          };
          let taskWash = 'Общее';
          const qLow = text.toLowerCase();
          for (const [key, val] of Object.entries(washMap)) {
            if (qLow.includes(key)) { taskWash = val; break; }
          }
          const taskTitle = text.replace(/^(запиши|отметь|создай|create)\s+(задачу|task|завдання)\s*/i, '')
            .replace(/\s*(на|по|для)\s+(усатово|корсунц|левитан)\s*/i, '')
            .trim();

          // Detect if should notify someone
          const notifyMap: Record<string, string> = {
            'калин': '1190893632',
            'georgiy': '6270826055',
            'георгий': '6270826055',
          };
          const notifyRecipients: string[] = [];
          for (const [key, chatIdRecip] of Object.entries(notifyMap)) {
            if (qLow.includes(key)) notifyRecipients.push(chatIdRecip);
          }

          if (taskTitle) {
            await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({
                title: taskTitle,
                wash_name: taskWash,
                status: 'todo',
                created_by: authorName,
                notify_recipients: notifyRecipients.length > 0 ? notifyRecipients : null,
              }),
            });

            // Send Telegram notification to recipients if specified
            if (notifyRecipients.length > 0) {
              for (const recipientId of notifyRecipients) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: recipientId,
                    text: `📋 *Новая задача от ${authorName}*\n\n*${taskTitle}*\n🏢 Объект: ${taskWash}\n📊 Статус: Сделать`,
                    parse_mode: 'Markdown',
                  }),
                });
              }
            }

            replyText = `✅ Задача создана!\n\n*${taskTitle}*\n🏢 Объект: ${taskWash}${notifyRecipients.length > 0 ? '\n📬 Уведомление отправлено' : ''}`;
          } else {
            replyText = 'Не удалось распознать задачу. Попробуйте: "Запиши задачу [описание] на [мойку]"';
          }
        } else {
          // General AI query via ai-assistant edge function
          const aiResp = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
              query: text,
              authToken: btoa('georgen77:@77negroeG'), // default auth for telegram users
              lang: 'ru',
              history: [],
            }),
          });
          const aiData = await aiResp.json();
          replyText = aiData?.answer || aiData?.error || 'Не удалось получить ответ';
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' }),
        });
      }
      return new Response('ok', { headers: corsHeaders });
    }

    // Detect wash name from group title and message text
    const washName = detectWash(groupTitle, text);

    // Save all text messages and photos from work groups
    const hasPhoto = !!(msg.photo && msg.photo.length > 0);
    if (!text && !hasPhoto) return new Response('ok', { headers: corsHeaders });

    // Download photo if present (get largest size)
    let imageBase64: string | null = null;
    if (hasPhoto) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      imageBase64 = await downloadTelegramFile(largestPhoto.file_id);
    }

    // Build tags
    const tags: string[] = [];
    const lower = text.toLowerCase();
    if (lower.includes('генератор')) tags.push('генератор');
    if (lower.includes('свет') || lower.includes('світло')) tags.push('електрика');
    if (lower.includes('топлив') || lower.includes('пальне') || lower.includes('залив')) tags.push('паливо');
    if (lower.includes('ремонт') || lower.includes('поломк')) tags.push('ремонт');
    if (hasPhoto) tags.push('фото');

    const messageText = text || `📷 Фото от ${authorName}`;

    await saveToJournal({
      message: messageText,
      wash_name: washName,
      author: authorName,
      telegram_user: authorName,
      telegram_group: groupTitle,
      telegram_message_id: messageId,
      source: 'telegram',
      tags: tags.length > 0 ? tags : undefined,
      image: imageBase64,
    });

    console.log(`Saved journal entry: "${messageText.slice(0, 60)}" [${washName}] from ${authorName} in "${groupTitle}"`);

    return new Response('ok', { headers: corsHeaders });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('ok', { headers: corsHeaders }); // Always return 200 to Telegram
  }
});
