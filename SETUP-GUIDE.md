# ELEVATE CRM - Complete Setup Guide

## 🚀 Quick Start (2-Week MVP)

This guide gets you from code to a deployed MVP in 2 weeks.

---

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ running
- Redis installed (for worker queues)
- SendGrid account (free tier works)
- Domain/subdomain for deployment

---

## Step 1: Initial Setup (Day 1)

### 1.1 Clone and Install Dependencies

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate
```

### 1.2 Environment Variables

Create `.env` in the root directory:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/elevate_crm"

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET="your-super-secret-jwt-key-change-this"

# App URL (for email tracking)
APP_URL="http://localhost:3000"

# Redis (for worker queues)
REDIS_URL="redis://localhost:6379"

# SendGrid (get from sendgrid.com)
SENDGRID_API_KEY="SG.xxxx"

# Twilio (optional, for SMS - get from twilio.com)
TWILIO_ACCOUNT_SID="ACxxxx"
TWILIO_AUTH_TOKEN="xxxxx"
TWILIO_PHONE_NUMBER="+1234567890"
```

### 1.3 Database Setup

```bash
# Start PostgreSQL and Redis
npm run docker:up

# Run migrations
npm run db:migrate

# Seed demo data
npm run db:seed
```

You now have:
- Demo tenant: `demo-agency`
- Admin user: `admin@elevate.local` / `admin123`

---

## Step 2: Development (Days 2-10)

### 2.1 Start Development Servers

Open 3 terminals:

```bash
# Terminal 1: Next.js app
cd apps/web
npm run dev
# → http://localhost:3000

# Terminal 2: Worker (emails, SMS)
cd packages/worker
npm run dev
# → Processing queues

# Terminal 3: Prisma Studio (database GUI)
npm run db:studio
# → http://localhost:5555
```

### 2.2 First Login

1. Go to http://localhost:3000
2. Login with `admin@elevate.local` / `admin123`
3. You should see the dashboard

### 2.3 Configure SendGrid

1. **Get API Key:**
   - Go to sendgrid.com → Settings → API Keys
   - Create new key with "Full Access"
   - Copy to `.env` as `SENDGRID_API_KEY`

2. **Add Email Account in App:**
   - Settings → Email Accounts → Add Account
   - Provider: SendGrid
   - Paste API key
   - Set as default

3. **Test Email:**
   - CRM → Pick a contact → Send Email
   - Check SendGrid dashboard for delivery

### 2.4 Import Contacts

1. Download template:
   - CRM → Import → Download Template

2. Fill in your contacts:
   ```csv
   First Name,Last Name,Email,Phone,Company,Job Title,Lead Source
   John,Doe,john@example.com,+1234567890,Acme Inc,CEO,Website
   ```

3. Upload:
   - CRM → Import → Select CSV
   - Preview → Confirm Import

---

## Step 3: Production Deployment (Days 11-14)

### 3.1 Vercel (Recommended for Next.js)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/web
vercel

# Add environment variables in Vercel dashboard:
# - DATABASE_URL (production PostgreSQL)
# - JWT_SECRET
# - APP_URL (https://yourdomain.com)
# - SENDGRID_API_KEY
```

### 3.2 Database (Supabase or Railway)

**Option A: Supabase**
```bash
# 1. Create project at supabase.com
# 2. Get connection string
# 3. Run migrations:
DATABASE_URL="postgresql://..." npm run db:migrate
```

**Option B: Railway**
```bash
# 1. railway.app → New Project → PostgreSQL
# 2. Get connection string
# 3. Add to Vercel env vars
```

### 3.3 Worker (Background Jobs)

Deploy worker to Railway, Render, or Heroku:

```bash
# Railway example
railway init
railway add
# Select PostgreSQL and Redis
railway up
```

Or use Vercel Cron (simpler but less robust):

```javascript
// apps/web/app/api/cron/process-emails/route.ts
import { emailQueue } from '@elevate/worker'

export async function GET() {
  // Process queued emails
  await emailQueue.processQueue()
  return Response.json({ success: true })
}
```

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/process-emails",
    "schedule": "*/5 * * * *"
  }]
}
```

### 3.4 Configure Webhooks

**SendGrid Webhooks:**
1. SendGrid → Settings → Mail Settings → Event Webhook
2. POST URL: `https://yourdomain.com/api/webhooks/sendgrid`
3. Select events: Delivered, Opened, Clicked, Bounced

**Twilio Webhooks (if using SMS):**
1. Twilio → Phone Numbers → Your Number
2. Messaging → Webhook: `https://yourdomain.com/api/webhooks/twilio`

---

## Step 4: Customize & Launch (Ongoing)

### 4.1 Branding

```typescript
// Update in Settings → Branding
{
  "primaryColor": "#0F172A",
  "logoUrl": "https://yourbucket.com/logo.png"
}
```

### 4.2 Add Custom Fields

```sql
-- In Prisma Studio or via migration
INSERT INTO custom_fields (tenant_id, name, key, type)
VALUES ('tenant_id', 'Industry', 'industry', 'SELECT');
```

### 4.3 Email Templates (Simple Version)

Create reusable templates in your app:

```typescript
// Store in database or code
const templates = {
  welcome: {
    subject: "Welcome to {{company}}!",
    body: "Hi {{firstName}},\n\nWelcome aboard!..."
  }
}
```

---

## Common Issues & Fixes

### "No email account configured"
→ Go to Settings → Email Accounts → Add SendGrid account

### Emails not sending
→ Check worker is running: `cd packages/worker && npm run dev`
→ Check Redis connection: `redis-cli ping`

### Database connection errors
→ Verify DATABASE_URL in .env
→ Check PostgreSQL is running: `docker ps`

### Cannot import contacts
→ Ensure CSV has "First Name" and "Last Name" columns
→ Check papaparse is installed: `npm install papaparse`

---

## File Structure Reference

```
elevate-crm/
├── apps/
│   └── web/                 # Next.js frontend
│       ├── app/
│       │   ├── dashboard/   # Dashboard page
│       │   ├── crm/         # Contact management
│       │   ├── pipeline/    # Deal pipeline
│       │   └── api/         # API routes & webhooks
│       └── components/      # React components
├── packages/
│   ├── database/           # Prisma schema & client
│   │   └── prisma/
│   │       └── schema.prisma
│   ├── trpc/              # API layer
│   │   └── src/routers/   # All API endpoints
│   └── worker/            # Background jobs
│       └── src/
│           └── services/  # Email/SMS senders
└── infrastructure/
    └── docker/           # Local PostgreSQL/Redis
```

---

## Next Steps After MVP

1. **Add Automations** - Email sequences, lead scoring
2. **SMS Integration** - Twilio setup for text campaigns
3. **Calendar Booking** - Public booking pages
4. **Analytics** - Better reporting dashboards
5. **API Access** - Public API for integrations
6. **White Label** - Custom domains per tenant

---

## Support & Community

- **Issues:** github.com/your-org/elevate-crm/issues
- **Docs:** docs.elevate-crm.com
- **Discord:** discord.gg/elevate-crm

---

## Pricing Reminder

Keep it simple:
- Free: 100 contacts, 500 emails/mo
- Starter ($29/mo): 1,000 contacts, 5,000 emails
- Pro ($99/mo): 10,000 contacts, 50,000 emails
- Agency ($299/mo): Unlimited contacts, 200,000 emails

No hidden fees. Clear overage pricing: $10 per 1,000 extra emails.

---

**You're ready to launch!** 🚀

Focus on getting these 5 features working perfectly:
1. Contact management (CRUD)
2. CSV import
3. Email sending (SendGrid)
4. Pipeline/deals
5. Basic dashboard

Everything else can wait for V2.
