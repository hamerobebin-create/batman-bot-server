// ============================================================
// Telegram Bot Webhook — @batmanQuizBot
// Runs as a Vercel Serverless Function at /api/webhook
// ============================================================

const { upsertUser, logEvent, sbGet, sbCount } = require('../lib/supabase');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // your quiz webapp's Vercel URL
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Telegram user IDs allowed to use /admin — comma-separated in the env var,
// e.g. ADMIN_IDS=7559465406,123456789
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

// A distinctive marker so we can recognize replies to our own "send me the
// broadcast content" prompt without needing to store any extra state.
const BROADCAST_PROMPT_MARKER = '#BROADCAST_PROMPT_🦇';

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

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 آمار کلی', callback_data: 'admin_stats' }],
      [{ text: '👥 آخرین کاربران', callback_data: 'admin_recent' }],
      [{ text: '📢 ارسال پیام همگانی', callback_data: 'admin_broadcast' }],
    ],
  };
}

// ---- Admin: stats panel ----
async function sendAdminStats(chatId) {
  const [totalUsers, totalQuizzes] = await Promise.all([
    sbCount('users'),
    sbCount('quiz_results'),
  ]);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const newToday = await sbCount(`users?first_seen=gte.${todayStart.toISOString()}`);

  const failedJoin = await sbCount(`events?event_type=eq.join_check_failed`);

  // Most common result level (small dataset assumption — fine for early stage)
  let topLevel = '—';
  try {
    const rows = await sbGet('quiz_results?select=level_name&limit=2000');
    const tally = {};
    rows.forEach(r => { tally[r.level_name] = (tally[r.level_name] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length) topLevel = `${sorted[0][0]} (${sorted[0][1]} نفر)`;
  } catch (e) { /* non-critical */ }

  const text = [
    '📊 *آمار ربات*',
    '',
    `👥 کل کاربران: ${totalUsers}`,
    `🆕 کاربر جدید امروز: ${newToday}`,
    `🦇 آزمون‌های تکمیل‌شده: ${totalQuizzes}`,
    `🚫 رد شده در چک عضویت: ${failedJoin}`,
    `🏆 پرتکرارترین نتیجه: ${topLevel}`,
  ].join('\n');

  await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

// ---- Admin: recent users list ----
async function sendAdminRecentUsers(chatId) {
  const rows = await sbGet('users?select=username,first_name,last_seen&order=first_seen.desc&limit=10');
  if (!rows.length) {
    await tg('sendMessage', { chat_id: chatId, text: 'هنوز هیچ کاربری ثبت نشده.' });
    return;
  }
  const lines = rows.map((u, i) => {
    const name = u.username ? '@' + u.username : (u.first_name || 'بدون‌نام');
    return `${i + 1}. ${name}`;
  });
  await tg('sendMessage', {
    chat_id: chatId,
    text: '👥 *۱۰ کاربر آخر:*\n\n' + lines.join('\n'),
    parse_mode: 'Markdown',
  });
}

// ---- Admin: broadcast ----
async function sendBroadcastPrompt(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: `پیامی که می‌خوای برای همه‌ی کاربرا ارسال بشه رو بفرست (متن، عکس، ویدیو یا هرچی) — روی همین پیام ریپلای کن.\n\n${BROADCAST_PROMPT_MARKER}`,
    reply_markup: { force_reply: true },
  });
}

async function sendBroadcastConfirm(chatId, messageId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: '⚠️ این پیام برای *همه‌ی کاربرای ثبت‌شده* ارسال میشه. مطمئنی؟',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ بله، ارسال کن', callback_data: `bcast_go:${chatId}:${messageId}` },
        { text: '❌ لغو', callback_data: 'bcast_cancel' },
      ]],
    },
  });
}

async function runBroadcast(fromChatId, messageId, statusChatId) {
  const users = await sbGet('users?select=id');
  let sent = 0, failed = 0;

  for (const u of users) {
    try {
      const r = await tg('copyMessage', { chat_id: u.id, from_chat_id: fromChatId, message_id: messageId });
      if (r.ok) sent++; else failed++;
    } catch (e) {
      failed++;
    }
    // Stay comfortably under Telegram's global rate limit (~30 msg/sec)
    if ((sent + failed) % 20 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  await tg('sendMessage', {
    chat_id: statusChatId,
    text: `✅ تموم شد.\nارسال موفق: ${sent}\nناموفق (مثلاً بلاک کرده بودن): ${failed}`,
  });
}

module.exports = async (req, res) => {
  // Telegram only sends POST requests to webhooks
  if (req.method !== 'POST') {
    res.status(200).send('Batman Quiz Bot webhook is alive.');
    return;
  }

  const body = req.body || {};

  try {
    const msg = body.message;

    // ---- Admin broadcast: catches the admin's reply to our prompt ----
    if (
      msg && msg.reply_to_message && msg.reply_to_message.text &&
      msg.reply_to_message.text.includes(BROADCAST_PROMPT_MARKER) &&
      isAdmin(msg.from.id)
    ) {
      await sendBroadcastConfirm(msg.chat.id, msg.message_id);
    }

    // ---- /admin command ----
    else if (msg && msg.text && msg.text.startsWith('/admin')) {
      if (isAdmin(msg.from.id)) {
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text: '🦇 پنل ادمین — یکی رو انتخاب کن:',
          reply_markup: adminKeyboard(),
        });
      }
      // Silently ignore /admin from non-admins — no need to reveal the command exists.
    }

    // ---- /start command ----
    else if (msg && msg.text && msg.text.startsWith('/start')) {
      const userId = msg.from.id;
      const chatId = msg.chat.id;

      await upsertUser(msg.from);
      await logEvent(userId, 'start', {});

      const joined = await isMemberOfAll(userId);
      await logEvent(userId, joined ? 'join_check_passed' : 'join_check_failed', {});

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

    // ---- Callback buttons ----
    if (body.callback_query) {
      const cq = body.callback_query;
      const userId = cq.from.id;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const data = cq.data;

      if (data === 'check_join') {
        const joined = await isMemberOfAll(userId);
        await logEvent(userId, joined ? 'join_check_passed' : 'join_check_failed', { via: 'recheck_button' });

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

      else if (data.startsWith('admin_') || data.startsWith('bcast')) {
        if (!isAdmin(userId)) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'دسترسی نداری.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: cq.id });

          if (data === 'admin_stats') await sendAdminStats(chatId);
          else if (data === 'admin_recent') await sendAdminRecentUsers(chatId);
          else if (data === 'admin_broadcast') await sendBroadcastPrompt(chatId);
          else if (data === 'bcast_cancel') {
            await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '❌ لغو شد.' });
          } else if (data.startsWith('bcast_go:')) {
            const [, fromChatId, msgId] = data.split(':');
            await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '⏳ در حال ارسال...' });
            await runBroadcast(Number(fromChatId), Number(msgId), chatId);
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error:', err);
    // Always answer 200 so Telegram doesn't keep retrying the same update
    res.status(200).send('OK');
  }
};

// NOTE: Vercel's free "Hobby" plan caps serverless functions at ~10 seconds.
// The broadcast loop above can hit that limit once you have more than
// roughly 100-150 users. This config raises the limit — it only takes
// effect on a paid (Pro+) plan; on Hobby it's silently capped at 10s.
module.exports.config = { maxDuration: 60 };
