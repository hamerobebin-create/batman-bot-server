// ============================================================
// Receives a completed quiz result from the webapp, verifies it
// really came from Telegram (via initData), and logs it to Supabase.
// ============================================================

const { validateInitData } = require('../lib/telegram-auth');
const { upsertUser, logEvent, sb } = require('../lib/supabase');

const BOT_TOKEN = process.env.BOT_TOKEN;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const { initData, pct, levelName, answers } = req.body || {};
  const user = validateInitData(initData, BOT_TOKEN);

  if (!user) {
    res.status(401).json({ ok: false, error: 'invalid or missing initData' });
    return;
  }

  try {
    await upsertUser(user);

    await sb('quiz_results', {
      body: {
        user_id: user.id,
        pct,
        level_name: levelName,
        answers,
      },
    });

    await logEvent(user.id, 'quiz_completed', { pct, levelName });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('submit-quiz error:', err);
    res.status(500).json({ ok: false });
  }
};
