// ============================================================
// Small helper for talking to Supabase's REST API (PostgREST)
// using the service_role key. No extra npm dependency needed.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, { method = 'POST', body, headers = {} } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Supabase ${path} failed: ${r.status} ${text}`);
  }
}

// Creates the user row if new, or updates last_seen if it already exists.
// Never throws — a logging failure should never break the bot's reply.
async function upsertUser(user) {
  if (!user || !user.id) return;
  try {
    await sb('users?on_conflict=id', {
      body: {
        id: user.id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        last_seen: new Date().toISOString(),
      },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  } catch (err) {
    console.error('upsertUser failed:', err.message);
  }
}

// Generic event logger — used for every important thing worth tracking
// (start, join-check pass/fail, quiz completed, story shared, etc.)
// Never throws, same reasoning as above.
async function logEvent(userId, eventType, payload) {
  try {
    await sb('events', {
      body: { user_id: userId || null, event_type: eventType, payload: payload || {} },
    });
  } catch (err) {
    console.error('logEvent failed:', err.message);
  }
}

module.exports = { sb, upsertUser, logEvent };
