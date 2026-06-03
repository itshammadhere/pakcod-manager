# PakCOD Manager

A Pakistan-specific COD (Cash on Delivery) order management app for Shopify. Manage COD orders with WhatsApp confirmation, multi-courier integration, and automated workflows.

## Features

- **Auto Import COD Orders** — New COD orders from Shopify are automatically imported and processed
- **WhatsApp Confirmation** — Customers receive a WhatsApp message to confirm their COD order (YES/NO)
- **Phone Blacklist** — Block high-risk phone numbers from placing orders
- **COD Rules Engine** — Set min/max order values, city restrictions, and phone prefix rules
- **Multi-Courier Support** — Book shipments with TCS, Leopards, Trax, M&P, BlueEx, and WeShip aggregator
- **Courier Tracking** — Auto-sync tracking status from courier APIs
- **Google Sheets Export** — Export orders directly to Google Sheets for accounting
- **COD Payment Capture** — Auto-mark orders as paid in Shopify when delivered (COD)
- **Analytics Dashboard** — Delivery rates, RTO rates, city-wise breakdown, daily trends
- **24h Auto-Cancel** — Unconfirmed orders are automatically cancelled after 24 hours
- **Status Timeline** — Full audit trail of all status changes and notifications

## Prerequisites

1. **Node.js** v22.12+ (or v20.19+)
2. **Shopify Partners Account** — [partners.shopify.com](https://partners.shopify.com)
3. **Shopify Development Store** — Create a dev store in your Partners dashboard
4. **Railway Account** — [railway.app](https://railway.app) (for hosting)
5. **Meta WhatsApp Business Account** — [business.facebook.com](https://business.facebook.com)

## Quick Start

### 1. Clone & Install

```bash
cd pakcod-manager
npm install
```

### 2. Shopify App Setup

```bash
# Create a Shopify app in your Partners dashboard
# https://partners.shopify.com/current/apps
# Choose "Create app" > "Public app"

# Config link your app
npm run config:link
# Select your newly created app from the list

# Copy these from your Shopify app dashboard:
# - API key
# - API secret key
```

### 3. Environment Variables

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | From Shopify Partners app dashboard |
| `SHOPIFY_API_SECRET` | From Shopify Partners app dashboard |
| `SHOPIFY_APP_URL` | Your app's Railway URL (e.g., `https://pakcod.up.railway.app`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `WHATSAPP_VERIFY_TOKEN` | Any random string for webhook verification |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta WhatsApp Business account |
| `WHATSAPP_ACCESS_TOKEN` | From Meta WhatsApp Business account |
| `SESSION_SECRET_KEY` | Random 64-character hex string |

### 4. Database Setup

```bash
# Run migrations
npm run prisma generate
npm run prisma migrate dev --name init
```

### 5. Run Locally

```bash
# Start the app with Shopify tunnel
npm run dev
```

This will output a URL like `https://xxxx.ngrok.io`. Use this as your app URL during development.

## WhatsApp Setup

1. Go to [business.facebook.com](https://business.facebook.com) > WhatsApp > API Setup
2. Generate a permanent access token
3. Copy the Phone Number ID and Access Token to your `.env`
4. Set the webhook URL in Meta to: `https://your-app.railway.app/webhooks/whatsapp`
5. Set the Verify Token to the value of `WHATSAPP_VERIFY_TOKEN`
6. Subscribe to the `messages` webhook field

## Deployment (Railway)

### Option A: GitHub + Railway (Recommended)

1. **Create GitHub repo:**
```bash
# Remove existing git
rm -rf .git
git init
git add -A
git commit -m "Initial commit: PakCOD Manager"

# Create repo on GitHub and push
gh repo create pakcod-manager --public --push --source=.
```

2. **Connect to Railway:**
   - Go to [railway.app](https://railway.app) > Dashboard > New Project
   - Select "Deploy from GitHub repo"
   - Select your `pakcod-manager` repo
   - Railway auto-detects Dockerfile and deploys

3. **Add PostgreSQL:**
   - In Railway dashboard, click "New" > "Database" > "Add PostgreSQL"
   - Railway auto-injects `DATABASE_URL` into your app

4. **Set Environment Variables** in Railway dashboard:
   - `SHOPIFY_API_KEY` — from Shopify Partners
   - `SHOPIFY_API_SECRET` — from Shopify Partners
   - `SHOPIFY_APP_URL` — your Railway app URL (e.g., `https://pakcod.up.railway.app`)
   - `WHATSAPP_VERIFY_TOKEN` — your webhook verify token
   - `WHATSAPP_PHONE_NUMBER_ID` — from Meta
   - `WHATSAPP_ACCESS_TOKEN` — from Meta
   - `SESSION_SECRET_KEY` — generate with `openssl rand -hex 32`
   - `START_SCHEDULER` — set to `true`

5. **Deploy!** Railway auto-builds and deploys from your GitHub repo.

### Option B: Railway CLI

```bash
npm i -g @railway/cli
railway login
railway init
railway add postgresql
railway up
```

## Shopify App Configuration

1. In Shopify Partners > Your App > Configuration:
   - **App URL**: `https://your-app.railway.app`
   - **Allowed redirection URL(s)**: `https://your-app.railway.app/auth/callback`
   - **Allowed and bypassed redirection URL(s)**: Add both:
     - `https://your-app.railway.app/auth/callback`
     - `https://your-app.railway.app/auth/shopify/callback`

2. In your app's "Extensions" tab, add the PosCustomExtension or leave empty if not needed.

3. Install the app on your dev store:
   ```bash
   npm run dev
   # Or visit: https://your-app.railway.app/auth?shop=your-store.myshopify.com
   ```

## Webhooks Configuration

Once deployed, configure these webhooks in Shopify:

1. In Shopify Partners > Your App > Webhooks
2. Add these webhook URLs:

| Event | URL |
|-------|-----|
| Orders Create | `https://your-app.railway.app/webhooks/orders/create` |
| Orders Updated | `https://your-app.railway.app/webhooks/orders/updated` |
| App Uninstalled | `https://your-app.railway.app/webhooks/app/uninstalled` |

3. Or configure them in `shopify.app.toml` before deployment:
```toml
[[webhooks]]
  topic = "orders/create"
  uri = "/webhooks/orders/create"

[[webhooks]]
  topic = "orders/updated"
  uri = "/webhooks/orders/updated"

[[webhooks]]
  topic = "app/uninstalled"
  uri = "/webhooks/app/uninstalled"
```

## Couriers Configuration

### WeShip Aggregator (Recommended)
1. Sign up at [weship.pk](https://weship.pk)
2. Get your API key from the WeShip dashboard
3. In PakCOD Manager > Settings > Courier Settings:
   - Select "WeShip" as courier
   - Enter your API key
   - Set default courier preference

### Individual Couriers
For TCS, Leopards, Trax, etc., you need API credentials from each courier. Configure them in Settings > Courier Settings.

## Google Sheets Export

1. Enable Google Sheets API in [Google Cloud Console](https://console.cloud.google.com)
2. Create a service account and download the JSON key
3. Set environment variables:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`

Then use the Export button on the Orders page to export to Google Sheets.

## External Cron Jobs

For production reliability, set up these cron jobs (optional — the built-in scheduler handles them if `START_SCHEDULER=true`):

| Cron | Endpoint | Frequency |
|------|----------|-----------|
| Sync courier tracking | `POST https://your-app/api/cron/sync-tracking` | Every 2 hours |
| Cancel unconfirmed | `POST https://your-app/api/cron/cancel-unconfirmed` | Every 1 hour |

Use [cron-job.org](https://cron-job.org) or similar free service.

## Project Structure

```
pakcod-manager/
├── app/
│   ├── db.server.ts              # Prisma client
│   ├── shopify.server.ts          # Shopify app config
│   ├── entry.server.tsx           # SSR entry with scheduler boot
│   ├── routes/
│   │   ├── app.tsx                # App layout + navigation
│   │   ├── app._index.tsx         # Dashboard
│   │   ├── app.orders.tsx         # Orders list
│   │   ├── app.orders.$id.tsx     # Order detail
│   │   ├── app.analytics.tsx      # Analytics
│   │   ├── app.settings.tsx       # Settings
│   │   ├── app.rules.tsx          # COD rules
│   │   ├── app.blacklist.tsx      # Phone blacklist
│   │   ├── api.stats.tsx          # Dashboard stats API
│   │   ├── api.analytics.tsx      # Analytics API
│   │   ├── api.orders.export.tsx  # Google Sheets export
│   │   ├── api.couriers.book.tsx  # Book shipment
│   │   ├── api.couriers.track.tsx # Track shipment
│   │   ├── api.cod.capture-payment.tsx  # COD payment capture
│   │   ├── api.cron.*.tsx         # Background job endpoints
│   │   ├── webhooks.*.tsx         # Shopify webhooks
│   │   └── auth.*.tsx             # OAuth flow
│   ├── models/
│   │   ├── order.server.ts        # Order CRUD
│   │   ├── store.server.ts        # Store config
│   │   ├── rules.server.ts        # COD rules engine
│   │   └── blacklist.server.ts    # Phone blacklist
│   └── services/
│       ├── whatsapp.server.ts     # WhatsApp Cloud API
│       ├── gsheets.server.ts      # Google Sheets export
│       ├── scheduler.server.ts    # Background scheduler
│       └── couriers/              # Courier adapters
│           ├── base.ts            # Adapter interface
│           ├── index.ts           # Registry
│           ├── tcs.ts             # TCS
│           ├── leopards.ts        # Leopards
│           └── weship.ts          # WeShip aggregator
├── prisma/
│   └── schema.prisma              # Database schema
├── Dockerfile                     # Railway deployment
├── railway.json                   # Railway config
└── package.json
```

## Tech Stack

- **Framework**: React Router v7 (Shopify App Template)
- **Database**: PostgreSQL (via Prisma ORM)
- **Hosting**: Railway (Docker-based)
- **WhatsApp**: Meta Cloud API (direct, no third-party)
- **UI**: Shopify Polaris + App Bridge React
- **Couriers**: WeShip aggregator (multi-courier via single API)
- **Authentication**: Shopify OAuth (built-in)

## License

MIT
