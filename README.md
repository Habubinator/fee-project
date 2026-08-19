# App

Subscription intelligence: Gmail ingest → parse → subscriptions, price alerts, cancel guides. B2B data API for pricing history and signals.

## Flow

1. Register / login (`/login`)
2. Connect Gmail (`GET /v1/auth/gmail` → OAuth callback queues `historical-sync`)
3. Worker filters billing mail, parses with OpenAI, writes `Subscription`
4. Dashboard lists subs, cancel guides, billing checkout
5. Daily scrape job records `PriceSnapshot`; push alerts via FCM
6. B2B: `/v1/services`, `/pricing`, `/cancel-score`, `/competitors`, `/trials`, `/v1/signals`

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma generate
npx prisma db push
npx tsx scripts/seed-services.ts
npm run dev
```

Set `GOOGLE_REDIRECT_URI=http://localhost:3000/v1/auth/gmail/callback` in `.env` (and the same URI in the Google Cloud OAuth client).

Open `http://localhost:3000` (landing), `/login`, `/dashboard`, `/admin`.

Gmail consent returns to `/dashboard?gmail=connected` and queues a year of billing-mail sync. Workers run in the same `npm run dev` process (Redis required).
