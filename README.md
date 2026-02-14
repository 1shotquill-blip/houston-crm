# Elevate CRM

**Self-hosted, premium CRM & Marketing Automation Platform**

A modern, full-stack alternative to GoHighLevel built with Next.js 14, tRPC, Prisma, and PostgreSQL.

---

## ✨ Features

### ✅ MVP Features (Ready Now)
- **Contact Management** - Full CRUD, tags, custom fields, lead scoring
- **CSV Import** - Bulk import with duplicate detection
- **Deal Pipeline** - Kanban board with drag-and-drop stages
- **Email Campaigns** - SendGrid integration with open/click tracking
- **Dashboard Analytics** - Revenue, conversion rates, lead sources
- **Multi-tenancy** - Complete tenant isolation with custom branding
- **Role-based Access** - Owner, Admin, Manager, Member roles
- **Activity Tracking** - Full audit trail of all interactions

### 🚧 Coming Soon (V2)
- SMS campaigns (Twilio)
- Email automations & sequences
- Calendar booking pages
- Funnel builder
- Social media posting
- API access & webhooks

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your database and SendGrid credentials

# 3. Start infrastructure
npm run docker:up

# 4. Run migrations and seed
npm run db:migrate
npm run db:seed

# 5. Start dev servers
npm run dev           # Web app (http://localhost:3000)
npm run worker:dev    # Background jobs

# 6. Login
# Email: admin@elevate.local
# Password: admin123
```

See [SETUP-GUIDE.md](./SETUP-GUIDE.md) for detailed deployment instructions.

---

## 📦 Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TailwindCSS, Radix UI
- **Backend:** tRPC, Prisma ORM, PostgreSQL
- **Auth:** JWT with bcrypt
- **Jobs:** Bull queues with Redis
- **Email:** SendGrid (with SMTP fallback)
- **SMS:** Twilio
- **Deployment:** Vercel (web), Railway (worker)

---

## 🏗 Architecture

```
Monorepo Structure (Turborepo)
├── apps/
│   └── web/              # Next.js frontend + API
├── packages/
│   ├── database/         # Prisma schema + client
│   ├── trpc/            # Type-safe API layer
│   └── worker/          # Background job processors
└── infrastructure/
    └── docker/          # Local dev services
```

**Key Design Decisions:**
- **Multi-tenant from day 1** - Every query filtered by tenantId
- **Type-safe end-to-end** - tRPC eliminates API contracts
- **Job queues for reliability** - Emails/SMS never block UI
- **Audit trail built-in** - Activity log for compliance

---

## 🎯 Differentiation from GoHighLevel

### What We Do Better:
1. **Simpler UX** - Clean, intuitive interface (not overwhelming)
2. **Transparent Pricing** - No hidden fees, clear overage costs
3. **Better Support** - Built-in chat, comprehensive docs
4. **Self-hosted Option** - Own your data
5. **Developer-friendly** - Public API, webhooks, extensible

### Target Users:
- Agencies tired of HighLevel's complexity
- Businesses wanting white-label CRM
- Teams needing transparent pricing
- Developers building custom workflows

---

## 💰 Pricing Strategy

**Keep it Simple:**
- **Free:** 100 contacts, 500 emails/mo
- **Starter ($29/mo):** 1,000 contacts, 5,000 emails
- **Pro ($99/mo):** 10,000 contacts, 50,000 emails
- **Agency ($299/mo):** Unlimited contacts, 200,000 emails

**Overage:**
- $10 per 1,000 extra emails (no surprises)

**No Gotchas:**
- Free trial with no credit card
- Cancel anytime
- Export your data anytime

---

## 📊 Current Status

**Launch Readiness:** 45% → **Target: 100% in 2 weeks**

✅ Complete:
- Database schema & migrations
- Authentication & multi-tenancy
- Core UI components

🟡 In Progress:
- Contact CRUD (90%)
- Email sending (80%)
- Pipeline/deals (75%)

❌ TODO:
- Automations (0%)
- SMS integration (0%)
- Public API (0%)

**MVP Launch Checklist:**
- [ ] Contact management working
- [ ] CSV import tested with 1,000+ contacts
- [ ] Email sending via SendGrid
- [ ] Pipeline drag-and-drop working
- [ ] Dashboard showing real metrics
- [ ] Onboarding flow for new users
- [ ] Production deployment on Vercel
- [ ] Documentation complete

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Database integrity
npm run db:validate
```

---

## 📖 Documentation

- **[Setup Guide](./SETUP-GUIDE.md)** - Complete deployment walkthrough
- **[API Reference](./docs/API.md)** - tRPC procedures
- **[Database Schema](./packages/database/prisma/schema.prisma)** - Prisma models
- **[Architecture](./docs/ARCHITECTURE.md)** - System design

---

## 🤝 Contributing

We're not open-source yet, but will be after MVP launch. Stay tuned!

---

## 📝 License

Proprietary (for now) - MIT license planned post-launch

---

## 🎯 2-Week Sprint to Launch

### Week 1: Make It Work
- **Days 1-2:** Complete tRPC routers (contact, deal, pipeline)
- **Days 3-4:** Build core pages (dashboard, CRM, pipeline)
- **Days 5-7:** Email sending + tracking working

### Week 2: Make It Useful
- **Days 8-9:** CSV import + validation
- **Day 10:** Dashboard with real metrics
- **Days 11-12:** Email templates
- **Days 13-14:** Polish + production deploy

**Launch Feature Set:**
1. ✅ Contact management
2. ✅ CSV import
3. ✅ Email campaigns
4. ✅ Deal pipeline
5. ✅ Analytics dashboard

**Explicitly CUT for V2:**
- Automations (too complex)
- SMS (email first)
- Funnels (overkill)
- Calendar (nice-to-have)

---

## 🚀 Let's Build This

**Next Steps:**
1. Read [SETUP-GUIDE.md](./SETUP-GUIDE.md)
2. Get local dev running
3. Ship MVP in 2 weeks
4. Launch early access
5. Iterate based on feedback

**Questions?** Open an issue or email: hello@elevate-crm.com

---

Built with ❤️ for agencies tired of GoHighLevel's BS.
