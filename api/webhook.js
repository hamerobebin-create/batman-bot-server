// ============================================================
// Telegram Bot Webhook — @batmanQuizBot
// Runs as a Vercel Serverless Function at /api/webhook
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // your quiz webapp's Vercel URL
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Mandatory-join channels (chat_id can be the @username for public channels)
const CHANNELS = [
  { label: 'کانال ۱', chatId: '@Botico_ir', url: 'https://t.me/Botico_ir' },
  { label: 'کانال ۲', chatId: '@Linkdonii_sp', url: 'https://t.me/Linkdonii_sp' },
];

async function tg(method, payload) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

// Checks whether the user is a member/admin/creator of every required channel
async function isMemberOfAll(userId) {
  for (const ch of CHANNELS) {
    const result = await tg('getChatMember', { chat_id: ch.chatId, user_id: userId });
    const status = result?.result?.status;
    if (!['member', 'administrator', 'creator'].includes(status)) {
      return false;
    }
  }
  return true;
}

function joinKeyboard() {
  return {
    inline_keyboard: [
      ...CHANNELS.map(ch => [{ text: `📢 عضویت در ${ch.label}`, url: ch.url }]),
      [{ text: '✅ عضو شدم، بررسی کن', callback_data: 'check_join' }],
    ],
  };
}

function quizKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🦇 شروع آزمون', web_app: { url: WEBAPP_URL } }],
    ],
  };
}

module.exports = async (req, res) => {
  // Telegram only sends POST requests to webhooks
  if (req.method !== 'POST') {
    res.status(200).send('Batman Quiz Bot webhook is alive.');
    return;
  }

  const body = req.body || {};

  try {
    // ---- /start command ----
    if (body.message && body.message.text && body.message.text.startsWith('/start')) {
      const userId = body.message.from.id;
      const chatId = body.message.chat.id;
      const joined = await isMemberOfAll(userId);

      if (joined) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'خوش اومدی 🦇 آماده‌ای ببینی چقدر شبیه بتمنی؟',
          reply_markup: quizKeyboard(),
        });
      } else {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'برای استفاده از ربات، اول باید عضو این کانال‌ها بشی:',
          reply_markup: joinKeyboard(),
        });
      }
    }

    // ---- "✅ عضو شدم" button ----
    if (body.callback_query && body.callback_query.data === 'check_join') {
      const cq = body.callback_query;
      const userId = cq.from.id;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const joined = await isMemberOfAll(userId);

      if (joined) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'خوش اومدی! 🦇' });
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: 'دمت گرم! حالا آماده‌ای ببینی چقدر شبیه بتمنی؟',
          reply_markup: quizKeyboard(),
        });
      } else {
        await tg('answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'هنوز عضو هر دو کانال نشدی — لطفاً اول جوین کن.',
          show_alert: true,
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error:', err);
    // Always answer 200 so Telegram doesn't keep retrying the same update
    res.status(200).send('OK');
  }
};
