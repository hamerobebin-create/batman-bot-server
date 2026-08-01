# Batman Quiz Bot — Webhook Server

Serverless webhook backend for **@batmanQuizBot**, deployed on Vercel.

## Files
- `api/webhook.js` — Telegram bot webhook (mandatory join check + quiz button)
- `api/submit-quiz.js` — receives finished quiz results from the webapp and logs them to Supabase
- `lib/supabase.js` — small helper for writing to Supabase (no npm dependency needed)
- `lib/telegram-auth.js` — verifies that a quiz submission genuinely came from Telegram

## 1. Supabase setup

Create a project at [supabase.com](https://supabase.com), then open the **SQL Editor** and run:

```sql
create table users (
  id bigint primary key,
  username text,
  first_name text,
  last_name text,
  first_seen timestamptz default now(),
  last_seen timestamptz default now()
);

create table quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id bigint references users(id),
  pct int,
  level_name text,
  answers jsonb,
  completed_at timestamptz default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id bigint,
  event_type text,
  payload jsonb,
  created_at timestamptz default now()
);
```

- `users` — one row per Telegram user
- `quiz_results` — one row per completed quiz, with every answer stored in `answers` (jsonb)
- `events` — a general log of everything worth tracking: `start`, `join_check_passed`, `join_check_failed`, `quiz_completed`, and more later (e.g. story shares)

Then grab your credentials from **Settings → API**:
- `Project URL`
- `service_role` secret key (⚠️ never put this in the webapp's front-end code — server-side only)

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Name                        | Value                                    |
|-----------------------------|-------------------------------------------|
| `BOT_TOKEN`                 | Token from @BotFather                    |
| `WEBAPP_URL`                | The live URL of the quiz web app          |
| `SUPABASE_URL`               | Your Supabase project URL                |
| `SUPABASE_SERVICE_ROLE_KEY`  | Your Supabase `service_role` secret key  |

After adding/changing env vars, **redeploy** — they only apply to new deployments.

## 3. Webhook setup

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_DEPLOY_URL>/api/webhook
```

## 4. Webapp → this server

The quiz webapp posts each finished result to:
```
POST https://batman-bot-server.vercel.app/api/submit-quiz
```
with `{ initData, pct, levelName, answers }`. `initData` is Telegram's signed payload — this server verifies it with your `BOT_TOKEN` before trusting the submission, so results can't be spoofed by someone calling the API directly.
