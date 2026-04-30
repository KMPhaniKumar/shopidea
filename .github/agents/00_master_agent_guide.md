# Master Agent Guide — Platform Development
### How to use Claude Code + VS Code to build this platform feature by feature

---

## 1. Your Development Setup

```
Mac
├── VS Code (code editor)
├── Claude Code (AI agent in terminal — npm install -g @anthropic-ai/claude-code)
├── Node.js 20+ (runtime)
├── Git (version control)
└── Supabase CLI (npm install -g supabase)
```

---

## 2. How Agent-Based Development Works

Instead of building everything yourself, you define **skills** (what to build)
and **agents** (how to build it). Claude Code reads these and executes autonomously.

```
You write SKILL file → defines what the feature does
You write AGENT file → defines how to build it step by step
Claude Code reads both → builds the feature autonomously
You review → test → move to next feature
```

---

## 3. Project Folder Structure

```
platform/
├── .claude/                        ← Claude Code config
│   ├── CLAUDE.md                   ← Master instructions for Claude Code
│   └── settings.json
│
├── skills/                         ← What each feature does
│   ├── auth/SKILL.md
│   ├── seller-onboarding/SKILL.md
│   ├── product-management/SKILL.md
│   ├── storefront/SKILL.md
│   ├── orders/SKILL.md
│   ├── payments/SKILL.md
│   ├── delivery/SKILL.md
│   ├── notifications/SKILL.md
│   ├── discovery/SKILL.md
│   ├── reviews/SKILL.md
│   ├── analytics/SKILL.md
│   └── admin/SKILL.md
│
├── agents/                         ← How to build each feature
│   ├── agent_auth.md
│   ├── agent_seller.md
│   ├── agent_products.md
│   ├── agent_storefront.md
│   ├── agent_orders.md
│   ├── agent_payments.md
│   ├── agent_delivery.md
│   ├── agent_notifications.md
│   ├── agent_discovery.md
│   ├── agent_reviews.md
│   ├── agent_analytics.md
│   └── agent_admin.md
│
├── apps/
│   ├── seller-app/                 ← React Native seller app
│   ├── buyer-app/                  ← React Native buyer app
│   └── web/                        ← Next.js storefront + admin
│
├── backend/                        ← Node.js custom logic
│   ├── src/
│   │   ├── delivery/               ← Shiprocket integration
│   │   ├── whatsapp/               ← Gupshup bot
│   │   ├── payments/               ← Razorpay payouts
│   │   └── webhooks/               ← Incoming webhooks
│   └── package.json
│
├── supabase/
│   ├── migrations/                 ← Database schema files
│   ├── functions/                  ← Edge functions
│   └── config.toml
│
└── docs/                           ← All 4 planning documents
```

---

## 4. How to Run Each Agent

```bash
# Start Claude Code in your project
cd platform
claude

# Then give it the agent instruction:
claude --skill skills/auth/SKILL.md --agent agents/agent_auth.md

# Or just paste the agent prompt directly in Claude Code terminal
```

---

## 5. Build Order (Follow This Sequence)

| Step | Feature | Agent File | Estimated Time |
|---|---|---|---|
| 1 | Project setup + Supabase | agent_setup.md | 2 hours |
| 2 | Authentication (OTP login) | agent_auth.md | 1 day |
| 3 | Seller onboarding | agent_seller.md | 2 days |
| 4 | Product management | agent_products.md | 2 days |
| 5 | Storefront (buyer web) | agent_storefront.md | 3 days |
| 6 | Order management | agent_orders.md | 3 days |
| 7 | Payments (Razorpay) | agent_payments.md | 2 days |
| 8 | Delivery (Shiprocket) | agent_delivery.md | 2 days |
| 9 | Notifications | agent_notifications.md | 1 day |
| 10 | Discovery + Search | agent_discovery.md | 2 days |
| 11 | Reviews + Ratings | agent_reviews.md | 1 day |
| 12 | Analytics dashboard | agent_analytics.md | 2 days |
| 13 | Admin panel | agent_admin.md | 2 days |
| **Total** | | | **~25 days** |

---

## 6. Environment Variables You Need

```bash
# .env file at project root
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret

SHIPROCKET_EMAIL=your_shiprocket_email
SHIPROCKET_PASSWORD=your_shiprocket_password

GUPSHUP_API_KEY=your_gupshup_key
GUPSHUP_APP_NAME=your_app_name

FIREBASE_SERVER_KEY=your_firebase_key

GOOGLE_MAPS_API_KEY=your_maps_key
```

---

## 7. Claude Code Tips for This Project

```bash
# Always start Claude Code with context
claude "Read all files in skills/ and agents/ folder first, 
        then help me build the auth feature"

# Give Claude Code permission to run commands
claude --dangerously-skip-permissions

# Run specific agent
claude "Follow the instructions in agents/agent_auth.md exactly 
        and build the complete auth system"

# Check what Claude Code built
claude "Review what you just built and write tests for it"
```

---

## 8. VS Code Extensions to Install

```
Essential:
├── Supabase (official extension)
├── ESLint
├── Prettier
├── React Native Tools
├── GitLens
└── Thunder Client (API testing — like Postman)

Helpful:
├── Tailwind CSS IntelliSense
├── PostgreSQL (for viewing Supabase DB)
└── GitHub Copilot (optional — you have Claude Code)
```
