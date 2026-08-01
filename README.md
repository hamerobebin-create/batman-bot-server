# Batman Quiz Bot — Webhook Server

Serverless webhook backend for **@batmanQuizBot**. Deploy to Vercel as its own project.

## Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Name         | Value                                                              |
|--------------|---------------------------------------------------------------------|
| `BOT_TOKEN`  | Token from @BotFather                                              |
| `WEBAPP_URL` | The live URL of the quiz web app (the one already deployed on Vercel) |

## Deploy steps

1. Push this folder to a new GitHub repo.
2. Import it into Vercel (same flow as the web app).
3. Add the two environment variables above, then redeploy.
4. Copy the deployment URL, e.g. `https://batman-quiz-bot-server.vercel.app`.
5. Register the webhook with Telegram (replace `<TOKEN>` and `<URL>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/webhook
```

Open that link once in a browser (with your real token and deployment URL filled in) — Telegram will respond with `{"ok":true,"result":true,...}` if it worked.

6. Test it: open @batmanQuizBot in Telegram and send `/start`.
