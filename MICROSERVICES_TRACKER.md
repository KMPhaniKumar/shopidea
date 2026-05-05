# ReelMart — Microservices Conversion Tracker
> Monolith → 11 ECS microservices on AWS

**Target:** AWS ECS (Fargate) + ALB + ECR  
**Started:** 2026-05-03  
**Status:** 📋 Agent Files Complete — Ready for Phase 1 (Service Extraction)

---

## Client Apps in Scope (V1)

| App | Platform | Who Uses It | Status |
|-----|----------|-------------|--------|
| **Seller Web Dashboard** | Next.js (Web) | Sellers — manage store, products, orders, payouts | 🟡 Build |
| **Buyer Mobile App** | React Native (iOS + Android) | Buyers — browse, order, track | 🟡 Build |
| **Admin Web Dashboard** | Next.js (Web) | ReelMart team — moderate, analytics, payouts | 🟡 Build |
| ~~Seller Mobile App~~ | ~~React Native~~ | ~~Sellers~~ | 🗓️ Future Roadmap |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT APPS                                                │
│                                                             │
│  Seller Web (Next.js)   Buyer App (RN)   Admin Web (Next)  │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
                    AWS ALB (HTTPS)
                    Path-based routing
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  MICROSERVICES (ECS Fargate, private subnets)               │
│                                                             │
│  /api/stores,/api/products  →  catalog-service      :3001  │
│  /api/orders                →  order-service         :3002  │
│  /api/payments              →  payment-service       :3003  │
│  /api/delivery              →  delivery-service      :3004  │
│  /api/notifications         →  notification-service  :3005  │
│  /api/whatsapp              →  whatsapp-service      :3006  │
│  /api/payouts               →  payout-service        :3007  │
│  /api/analytics             →  analytics-service     :3008  │
│  /api/returns               →  return-service        :3009  │
│  /api/admin                 →  admin-service         :3010  │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
              Supabase (DB + Auth + Storage + Realtime)
```

---

## Which Services Each Client Needs

### Seller Web Dashboard
| Service | Used For |
|---------|----------|
| catalog-service | CRUD products, store profile |
| order-service | View + manage orders, cart read |
| analytics-service | Revenue charts, top products |
| payout-service | Payout history, bank account |
| admin-service | Coupons create/validate |
| whatsapp-service | Broadcast to customers |
| delivery-service | Book Shiprocket shipment |

### Buyer Mobile App
| Service | Used For |
|---------|----------|
| catalog-service | Browse stores, view products, reviews |
| order-service | Cart, place order, order history |
| payment-service | Razorpay checkout, payment verify |
| return-service | Submit + track returns |
| notification-service | Register FCM token, receive push |

### Admin Web Dashboard
| Service | Used For |
|---------|----------|
| admin-service | Manage users, stores, coupons, settings |
| analytics-service | Platform GMV, top stores |
| payout-service | Trigger weekly payouts |

### Internal Only (no direct client access)
| Service | Called By |
|---------|-----------|
| notification-service | order-service (fire-and-forget on status change) |
| whatsapp-service | Direct from Gupshup webhook |

---

## Agent Files Status

| # | Service | Agent File | Status |
|---|---------|-----------|--------|
| 0 | **Architecture + Shared Code** | ms_00_architecture.md | ✅ Done |
| 1 | **API Gateway** | ms_01_api_gateway.md | ✅ Done |
| 2 | **Catalog Service** | ms_02_catalog_service.md | ✅ Done |
| 3 | **Order Service** | ms_03_order_service.md | ✅ Done |
| 4 | **Payment Service** | ms_04_payment_service.md | ✅ Done |
| 5 | **Delivery Service** | ms_05_delivery_service.md | ✅ Done |
| 6 | **Notification Service** | ms_06_notification_service.md | ✅ Done |
| 7 | **WhatsApp Bot Service** | ms_07_whatsapp_bot_service.md | ✅ Done |
| 8 | **Payout Service** | ms_08_payout_service.md | ✅ Done |
| 9 | **Analytics Service** | ms_09_analytics_service.md | ✅ Done |
| 10 | **Return Service** | ms_10_return_service.md | ✅ Done |
| 11 | **Admin Service** | ms_11_admin_service.md | ✅ Done |
| 12 | **ECS Infrastructure** | ms_12_ecs_infrastructure.md | ✅ Done |
| 13 | **CI/CD Pipeline** | ms_13_cicd_pipeline.md | ✅ Done |
| 14 | **Seller Web Dashboard** | ms_14_seller_web_dashboard.md | ✅ Done |

---

## Conversion Phases

### Phase 1 — Extract Microservices (Backend Code)
> Goal: All 10 backend services running locally with docker-compose

| Task | Service | Status |
|------|---------|--------|
| Create `reelmart/services/` directory | shared | ✅ |
| Copy shared auth middleware + supabase client | shared | ✅ |
| Extract catalog-service | catalog-service | ✅ |
| Extract order-service | order-service | ✅ |
| Extract payment-service | payment-service | ✅ |
| Extract delivery-service | delivery-service | ✅ |
| Extract notification-service | notification-service | ✅ |
| Extract whatsapp-service | whatsapp-service | ✅ |
| Extract payout-service | payout-service | ✅ |
| Extract analytics-service | analytics-service | ✅ |
| Extract return-service | return-service | ✅ |
| Extract admin-service | admin-service | ✅ |
| Write `docker-compose.yml` (all 10 services) | infra | ✅ |
| Smoke test all `/health` endpoints locally | all | ⬜ |
| Remove old `backend/` monolith folder | cleanup | ⬜ |

### Phase 2 — Seller Web Dashboard
> Goal: Seller can log in, manage products, handle orders, see analytics

| Task | Status |
|------|--------|
| `/seller/login` — phone OTP auth | ✅ |
| `/seller/layout` — sidebar + topbar | ✅ |
| `/seller/dashboard` — stats, chart, pending orders | ✅ |
| `/seller/products` — table, add/edit, drag-drop upload | ✅ |
| `/seller/orders` — tabs, slide-in detail, status update | ✅ |
| `/seller/analytics` — charts, period selector, export | ✅ |
| `/seller/customers` — aggregated, masked phone | ✅ |
| `/seller/payouts` — balance, bank account, history | ✅ |
| `/seller/marketing` — coupons + broadcast | ✅ |
| `/seller/settings` — store settings, QR code | ✅ |
| Point seller web → local microservices (NEXT_PUBLIC_API_URL) | ⬜ |
| Point seller web → deployed ALB URL | ⬜ |

### Phase 3 — Buyer Mobile App
> Goal: Buyer can browse, order, pay, track

| Task | Status |
|------|--------|
| All Supabase direct queries → API calls to catalog-service | ✅ |
| Order creation → order-service | ✅ |
| Payment checkout → payment-service | ✅ |
| Return submission → return-service | ✅ |
| FCM token registration → notification-service | ✅ |
| Point buyer app → ALB URL | ✅ |
| Test E2E: browse → cart → checkout → track | ⬜ |

### Phase 4 — Admin Web Dashboard
> Goal: ReelMart team can moderate and manage platform

| Task | Status |
|------|--------|
| `/admin/users` → admin-service | ✅ |
| `/admin/stores` → admin-service (approve/suspend) | ✅ |
| `/admin/analytics` → analytics-service (platform GMV) | ✅ |
| `/admin/payouts` → payout-service (trigger weekly run) | ✅ |
| `/admin/settings` → admin-service | ✅ |
| Point admin web → ALB URL | ⬜ |

### Phase 5 — AWS Infrastructure
> **Test mode:** Single t2.micro EC2 + Docker + nginx = $0 (free tier)  
> **Production:** ECS Fargate + ALB (set up when ready to go live — ~$70/month)

#### Phase 5a — Minimal Test Server (current)
| Task | Status |
|------|--------|
| CloudFormation template (t2.micro + security group) | ✅ |
| nginx reverse proxy config (routes /api/* → services) | ✅ |
| `.env.example` with all required vars | ✅ |
| Smoke test script | ✅ |
| Deploy guide (DEPLOY.md) | ✅ |
| Deploy stack + SSH + fill .env + `docker-compose up` | ⬜ |
| Smoke test all `/health` endpoints | ⬜ |

#### Phase 5b — Production ECS (later, when going live)
| Task | Status |
|------|--------|
| Create VPC + subnets (2 AZ, public + private) | ⬜ |
| Create NAT Gateway | ⬜ |
| Create ECR repositories (1 per service) | ⬜ |
| Create ECS Cluster (Fargate + container insights) | ⬜ |
| Create ALB + HTTPS listener + HTTP→HTTPS redirect | ⬜ |
| Create target groups + path-based listener rules | ⬜ |
| Create IAM roles (execution + task) | ⬜ |
| Store secrets in Secrets Manager | ⬜ |
| Create CloudWatch log groups (30-day retention) | ⬜ |
| Register ECS task definitions (1 per service) | ⬜ |
| Deploy ECS services — verify `/health` passes | ⬜ |
| Set up Cloud Map service discovery (inter-service DNS) | ⬜ |

### Phase 6 — CI/CD
> Goal: Push to main → auto-deploy only changed services

| Task | Status |
|------|--------|
| Add GitHub Actions secrets (AWS keys, cluster name) | ⬜ |
| Create IAM deploy user with minimum ECR + ECS permissions | ⬜ |
| Create reusable `_deploy-service.yml` workflow | ⬜ |
| Create per-service workflow files (path-filtered) — 10 files | ⬜ |
| Create TypeScript check workflow for PRs | ⬜ |
| Test: push change to order-service → only order-service redeploys | ⬜ |

### Phase 7 — DNS Cutover & Go Live
> Goal: reelmart.in points to ALB, old Railway decommissioned

| Task | Status |
|------|--------|
| Issue ACM certificate for api.reelmart.in | ⬜ |
| Create Route 53 record: api.reelmart.in → ALB | ⬜ |
| Update seller web `NEXT_PUBLIC_API_URL` → api.reelmart.in | ⬜ |
| Update buyer app API base URL → api.reelmart.in | ⬜ |
| Update admin web API base URL → api.reelmart.in | ⬜ |
| Deploy seller web to Vercel | ⬜ |
| Deploy admin web to Vercel | ⬜ |
| Submit buyer app to App Store + Play Store | ⬜ |
| Set up CloudWatch alarms (5xx rate, latency, ECS task health) | ⬜ |
| Smoke test all client apps against production | ⬜ |
| Decommission Railway backend | ⬜ |

---

## Service Port Map (Local docker-compose)

| Service | Port |
|---------|------|
| catalog-service | 3001 |
| order-service | 3002 |
| payment-service | 3003 |
| delivery-service | 3004 |
| notification-service | 3005 |
| whatsapp-service | 3006 |
| payout-service | 3007 |
| analytics-service | 3008 |
| return-service | 3009 |
| admin-service | 3010 |

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Seller UI | Web (Next.js) not mobile | Big screen for bulk ops, analytics, photo upload |
| Seller mobile | Future roadmap | Reduce V1 scope, seller web covers all needs |
| Buyer UI | Mobile only (React Native) | Buyers discover via WhatsApp/Reels — always on phone |
| Container orchestration | ECS Fargate | No cluster management, pay-per-use |
| Database | Shared Supabase | Avoid data duplication at this scale |
| Auth | Supabase JWT (phone OTP) | Same for all 3 clients, zero extra auth infra |
| Service discovery | ALB path routing + Cloud Map | Simple routing, no service mesh needed at this scale |
| Secrets | AWS Secrets Manager | Native ECS integration |
| Logging | CloudWatch Logs | Native ECS integration |

---

## Daily Log

| Date | Work Done |
|------|-----------|
| 2026-05-03 | Conversion planned. All agent files ms_00→ms_13 written. |
| 2026-05-03 | ms_14 added — Seller Web Dashboard (9 pages, full code). |
| 2026-05-04 | Scope locked: Seller Web + Buyer Mobile + Admin Web. Seller mobile → future roadmap. Tracker restructured into 7 phases. |
| 2026-05-04 | Phase 1 complete — all 10 services extracted to reelmart/services/ (92 files). docker-compose.yml written. Ready to smoke test. |
| 2026-05-04 | Phase 2 complete — Seller Web Dashboard built. 19 files: middleware, Supabase SSR clients, Sidebar/TopBar components, sellerStore, login page, and 8 feature pages (dashboard, products, orders, analytics, customers, payouts, marketing, settings). Packages installed: recharts, @tanstack/react-table, react-hook-form, zod, react-dropzone, xlsx, qrcode, react-hot-toast, lucide-react, date-fns, lodash. |
| 2026-05-04 | Phase 3 complete — Buyer Mobile App migrated to microservices. Created src/lib/api.ts (shared auth-aware API client + FCM helper). Updated: discoveryService (catalog-service), orderService (order-service for create/list/detail), returnService (return-service), reviewService (catalog-service reviews + Supabase Storage for photos), PaymentScreen (payment-service URL + snake_case field names fix), authStore (FCM token registration via notification-service on SIGNED_IN). Supabase kept for: realtime subscriptions, cart CRUD, coupon validation, wishlist, followed stores. |
| 2026-05-04 | Phase 5a complete — Minimal test infra created at reelmart/infra/test/. CloudFormation template: single t2.micro (free tier) + security group (ports 22/80) + user data that installs Docker/docker-compose/nginx + clones repo. nginx.conf routes /api/* to service ports 3001–3010. .env.example with all required vars. smoke-test.sh checks all 11 /health endpoints. DEPLOY.md has step-by-step deploy guide. Cost: $0 within free tier. Production ECS/ALB deferred to Phase 5b (when going live). |
| 2026-05-04 | Phase 4 complete (code) — Admin Web Dashboard migrated to microservices. Created lib/admin-api.ts (server-side JWT helper). buyers/page → admin-service /api/admin/users. sellers/page + SellerActions → admin-service /api/admin/stores (approve/suspend). analytics/page (NEW) → analytics-service /api/analytics/platform + /platform/stores with recharts (GMV, top stores bar, pie, revenue breakdown). payouts/page + ProcessPayoutsButton → payout-service /api/payouts/process. settings/page → admin-service /api/admin/settings (GET on load, PUT on save). Dashboard updated to pull 7-day stats from analytics-service. AdminNav updated with Analytics link. API_URL + NEXT_PUBLIC_API_URL added to .env.local. Remaining: point to deployed ALB URL (Phase 7). |
| 2026-05-04 | feat_01 complete — Google Maps location picker added to both apps. Agent spec written at agents/feat_01_maps_location_picker.md. Packages added: react-native-maps + react-native-google-places-autocomplete + expo-location (both apps). Both app.json updated with Google Maps plugins. Seller: LocationPickerScreen → LocationScreen picks up city/area/lat/lng. Buyer: LocationPickerScreen (shared) → Addresses flow (map → confirm name/phone → save) + Checkout has "Pick on map" button that auto-fills address fields. Replace YOUR_GOOGLE_MAPS_API_KEY in both app.json with real key before building. |
