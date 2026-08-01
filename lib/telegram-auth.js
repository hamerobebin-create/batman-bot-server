// ============================================================
// Validates Telegram Mini App `initData` using the official
// algorithm, so we know a submitted result really came from
// Telegram and wasn't spoofed by someone calling our API directly.
// Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ============================================================

const crypto = require('crypto');

// Returns the parsed Telegram user object if initData is valid, otherwise null.
function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const userRaw = params.get('user');
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  try {
    return userRaw ? JSON.parse(userRaw) : null;
  } catch {
    return null;
  }
}

module.exports = { validateInitData };
