# Document 3 — Tech Stack, Integrations & Maintenance Costs
### Version 1.0 | Date: April 2026

---

## 1. High Level System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENTS                            │
│   Seller App (Android/iOS)  │  Buyer App (Android/iOS)  │
│   Buyer Web (storefront)    │  Admin Dashboard (Web)     │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   API GATEWAY (AWS)                      │
│              Rate limiting + Auth + Routing              │
└─────────────┬───────────────────────────────────────────┘
              │
    ┌─────────┴──────────────────────────┐
    ▼                                    ▼
┌──────────────────┐          ┌──────────────────────────┐
│  BACKEND SERVICES │          │     THIRD PARTY APIs      │
│                  │          │                          │
│  Auth Service    │          │  Razorpay (payments)     │
│  Seller Service  │          │  Shiprocket (delivery)   │
│  Buyer Service   │          │  Twilio (WhatsApp/SMS)   │
│  Order Service   │          │  Firebase (push notifs)  │
│  Product Service │          │  AWS S3 (image storage)  │
│  Payment Service │          │  Google Maps (location)  │
│  Delivery Service│          │  MSG91 (SMS OTP)         │
└────────┬─────────┘          └──────────────────────────┘
         │
    ┌────┴────────────────────┐
    ▼                         ▼
┌──────────────┐    ┌─────────────────────┐
│  PostgreSQL  │    │  Redis (cache)       │
│  (main DB)   │    │  (sessions/OTP/feed) │
└──────────────┘    └─────────────────────┘
```

---

## 2. Tech Stack Recommendation

### 2.1 Backend
| Component | Technology | Why |
|---|---|---|
| Primary backend | Node.js + Express | Fast development, huge community, good for APIs |
| Alternative backend | Python + FastAPI | If team knows Python better |
| Database | PostgreSQL | Reliable, handles complex queries, free |
| Cache | Redis | Fast session management, OTP storage, feed caching |
| File storage | AWS S3 | Product images, cheap, scalable |
| Search | Elasticsearch (later) | Product and seller search at scale |
| Queue | AWS SQS | Order processing, notifications queue |

### 2.2 Frontend — Mobile Apps
| Component | Technology | Why |
|---|---|---|
| Mobile framework | React Native | Single codebase for Android + iOS, saves 40% cost |
| Alternative | Flutter | If team prefers Dart, also single codebase |
| State management | Redux or Zustand | Clean state handling |
| Navigation | React Navigation | Industry standard |

### 2.3 Frontend — Web
| Component | Technology | Why |
|---|---|---|
| Buyer storefront (web) | Next.js | SEO friendly, fast load, server-side rendering |
| Admin dashboard | React + Tailwind | Simple, fast to build |
| Hosting | Vercel (storefront) + AWS (admin) | Cheap, fast |

### 2.4 Infrastructure
| Component | Technology | Why |
|---|---|---|
| Cloud provider | AWS | Best India region support, reliable |
| Container | Docker | Easy deployment, consistent environments |
| Orchestration | AWS ECS (start) → Kubernetes (later) | Start simple, scale when needed |
| CDN | AWS CloudFront | Fast image delivery across India |
| DNS | AWS Route 53 | Subdomain management for seller stores |

---

## 3. Third Party Integrations

### 3.1 Payments — Razorpay
| Feature | Detail |
|---|---|
| What it does | Accepts UPI, cards, netbanking, COD |
| Integration effort | 2-3 days |
| Transaction fee | 2% per transaction (you pass to buyer or absorb) |
| Payout to sellers | Razorpay Route — split payments automatically |
| Escrow | Razorpay holds payment, releases on your trigger |
| Monthly cost | Pay per transaction only, no monthly fee |
| Estimated cost at 10,000 orders/month | ₹10,000-₹15,000/month |

### 3.2 Delivery — Shiprocket
| Feature | Detail |
|---|---|
| What it does | Aggregates 15+ courier partners — Delhivery, Bluedart, Xpressbees |
| Integration effort | 3-4 days |
| How it works | Seller books shipment via your app → Shiprocket handles rest |
| Cost | Per shipment — ₹35-₹80 depending on weight and distance |
| Who pays | Buyer pays delivery fee → you pay Shiprocket → keep margin |
| Monthly fixed cost | ₹0 (pay per shipment only) |
| API | REST API, well documented |

### 3.3 WhatsApp Business — Twilio or Gupshup
| Feature | Detail |
|---|---|
| What it does | Send order notifications, bot conversations via WhatsApp |
| Integration effort | 5-7 days |
| Provider options | Twilio (global, reliable) or Gupshup (India-focused, cheaper) |
| Cost — Gupshup | ₹0.35-₹0.50 per WhatsApp message |
| Cost — Twilio | $0.005 per message (~₹0.40) |
| Monthly estimate at 50,000 messages | ₹17,500-₹25,000/month |
| Recommendation | Start with Gupshup (cheaper, India support) |

### 3.4 SMS OTP — MSG91
| Feature | Detail |
|---|---|
| What it does | OTP for phone number verification |
| Integration effort | 1 day |
| Cost | ₹0.18-₹0.22 per SMS |
| Monthly estimate at 5,000 OTPs | ₹900-₹1,100/month |

### 3.5 Push Notifications — Firebase FCM
| Feature | Detail |
|---|---|
| What it does | Push notifications to Android and iOS |
| Integration effort | 1-2 days |
| Cost | FREE up to 1M messages/day |
| Monthly cost | ₹0 for most early stage usage |

### 3.6 Maps & Location — Google Maps API
| Feature | Detail |
|---|---|
| What it does | Address autocomplete, distance calculation, store locator |
| Integration effort | 2 days |
| Cost | $200 free credit/month, then $2-$7 per 1000 requests |
| Monthly estimate at early stage | ₹0 (within free tier) |
| At scale (100K requests/month) | ₹5,000-₹10,000/month |

### 3.7 Image Storage — AWS S3 + CloudFront
| Feature | Detail |
|---|---|
| What it does | Store all product images, seller photos |
| Cost S3 | ₹1.8 per GB/month |
| Cost CloudFront | ₹0.85 per GB delivered |
| Monthly estimate at 100GB | ₹270/month (S3) + ₹85/month (CDN) = ₹355/month |

---

## 4. Monthly Infrastructure Cost Estimate

### Phase 1 — MVP (0-1,000 sellers, 10,000 buyers)
| Service | Monthly Cost |
|---|---|
| AWS EC2 (2 small servers) | ₹4,000 |
| AWS RDS PostgreSQL | ₹3,500 |
| Redis (ElastiCache) | ₹2,000 |
| AWS S3 + CloudFront | ₹500 |
| Razorpay | ₹5,000 (at 5,000 orders) |
| Gupshup WhatsApp | ₹7,000 (at 20,000 messages) |
| MSG91 SMS | ₹1,000 |
| Firebase | ₹0 |
| Google Maps | ₹0 (free tier) |
| Domain + SSL | ₹500 |
| **Total Phase 1** | **~₹23,500/month** |

### Phase 2 — Growth (1,000-10,000 sellers, 1L buyers)
| Service | Monthly Cost |
|---|---|
| AWS EC2 (scaled up) | ₹15,000 |
| AWS RDS (upgraded) | ₹10,000 |
| Redis | ₹5,000 |
| AWS S3 + CloudFront | ₹3,000 |
| Razorpay | ₹25,000 (at 50,000 orders) |
| Gupshup WhatsApp | ₹35,000 (at 1,00,000 messages) |
| MSG91 SMS | ₹5,000 |
| Google Maps | ₹5,000 |
| Elasticsearch | ₹8,000 |
| **Total Phase 2** | **~₹1,11,000/month** |

### Phase 3 — Scale (10,000+ sellers, 10L+ buyers)
| Service | Monthly Cost |
|---|---|
| AWS (full stack) | ₹1,00,000+ |
| WhatsApp messages | ₹1,50,000+ |
| All other services | ₹50,000+ |
| **Total Phase 3** | **~₹3,00,000+/month** |

*At Phase 3 revenue should be ₹1-2 Cr/month — infra cost is less than 3%*

---

## 5. Development Team Needed

### MVP Build (4-6 months)
| Role | Count | Monthly Cost | Total for 6 months |
|---|---|---|---|
| Full Stack Developer (Node.js + React Native) | 2 | ₹80,000 each | ₹9,60,000 |
| Frontend Developer (React Native) | 1 | ₹60,000 | ₹3,60,000 |
| UI/UX Designer | 1 | ₹50,000 | ₹3,00,000 |
| DevOps (part time) | 1 | ₹30,000 | ₹1,80,000 |
| **Total dev cost for MVP** | | | **~₹18,00,000** |

### Alternative — Freelancer Route (Cheaper)
| Role | Cost |
|---|---|
| Backend developer (freelance) | ₹3,00,000 fixed for MVP |
| React Native developer (freelance) | ₹2,50,000 fixed for MVP |
| UI/UX design | ₹80,000 fixed |
| Total freelancer MVP | **~₹6,30,000** |

---

## 6. Total Initial Investment Needed

| Category | Cost |
|---|---|
| Development (MVP) | ₹6-18 lakhs |
| Infrastructure (6 months) | ₹1.5 lakhs |
| Marketing (first 1000 sellers) | ₹2 lakhs |
| Legal and company registration | ₹50,000 |
| Buffer | ₹2 lakhs |
| **Total to launch** | **₹12-24 lakhs** |

---

## 7. Database Schema (High Level)

```
USERS (sellers and buyers combined)
├── user_id
├── phone_number
├── role (seller / buyer / both)
├── name
├── city
├── created_at
└── referral_source (which seller link they came from)

STORES (seller's shop)
├── store_id
├── seller_id (user_id)
├── store_name
├── store_slug (for URL)
├── category
├── logo_url
├── city / area
├── rating_average
├── total_orders
└── is_verified

PRODUCTS
├── product_id
├── store_id
├── name
├── description
├── price
├── stock_quantity
├── images (array)
├── variants (JSON)
└── is_available

ORDERS
├── order_id
├── buyer_id
├── store_id
├── items (JSON — product, variant, qty, price)
├── total_amount
├── delivery_fee
├── status (pending/accepted/preparing/shipped/delivered)
├── delivery_address
├── payment_status
├── payment_id (Razorpay)
├── tracking_id (Shiprocket)
└── created_at

REVIEWS
├── review_id
├── order_id
├── buyer_id
├── store_id
├── rating (1-5)
├── review_text
├── photos (array)
└── created_at

PAYOUTS
├── payout_id
├── store_id
├── amount
├── status (pending/processed)
├── settlement_date
└── razorpay_payout_id
```

---

## 8. Security Considerations

| Area | Approach |
|---|---|
| Authentication | JWT tokens + OTP based, no passwords |
| Payment security | Razorpay handles — PCI DSS compliant |
| API security | Rate limiting, API gateway, HTTPS only |
| Data privacy | No personal data shared between sellers and buyers |
| Image uploads | Virus scan + size limit + type check |
| Seller verification | OTP mandatory, Aadhaar optional for verified badge |
| Fraud detection | Razorpay built-in fraud detection |

---

## 9. Scalability Plan

| Users | Architecture |
|---|---|
| 0-10,000 | Single server, monolithic backend, managed DB |
| 10,000-1,00,000 | Separate services, load balancer, read replicas |
| 1,00,000+ | Microservices, Kubernetes, multi-region |

**Start simple. Do not over-engineer on day one.**

---

*Document 3 of 4 — Next: App Name Options & Business Registration Guide*
