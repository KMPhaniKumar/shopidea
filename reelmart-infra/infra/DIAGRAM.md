# ReelMart Architecture Diagram

End-to-end view of every component, data flow, and external integration in the deployed system. Region: `ap-south-1` (Mumbai).

---

## 1. End-to-end runtime view

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                       USERS                                              │
│   ┌──────────────────┐   ┌───────────────────┐   ┌─────────────────────────────────────┐ │
│   │     Sellers      │   │      Admins       │   │           Buyers                    │ │
│   │ desktop / mobile │   │ desktop browser   │   │  iOS / Android Expo app             │ │
│   │  (browser)       │   │  (browser)        │   │  + WhatsApp chat                    │ │
│   └────────┬─────────┘   └────────┬──────────┘   └──────────────┬──────────────────────┘ │
└────────────┼──────────────────────┼─────────────────────────────┼────────────────────────┘
             │                      │                             │
             │  HTTPS               │  HTTPS                      │  HTTPS / Expo update
             ▼                      ▼                             ▼
┌─────────────────────────────┐  ┌────────────────────────┐  ┌──────────────────────────┐
│  Vercel CDN (global edge)   │  │ Vercel CDN (same proj) │  │  Apple TestFlight /      │
│  reelmart.in (one Next.js)  │  │ reelmart.in/admin      │  │  Google Play Internal    │
│  Routes:                    │  │  (path-based)          │  │  buyer app .apk / .ipa   │
│  /                landing   │  │                        │  │                          │
│  /seller          dash      │  │                        │  │                          │
│  /admin           dash      │  │                        │  │                          │
│  /s/<slug>        store     │  │                        │  │                          │
│  /order/<id>      receipt   │  │                        │  │                          │
└──────────────┬──────────────┘  └────────────┬───────────┘  └────────────┬─────────────┘
               │                              │                           │
               │ Direct: Supabase client      │                           │
               │ + API: api-dev.reelmart.in   │                           │
               └──────────────────────────────┴───────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────────┐
                              │  Route 53 (public hosted zone)  │
                              │  reelmart.in                    │
                              │  ├── api-dev.reelmart.in  → ALB │
                              │  ├── api.reelmart.in      → ALB │
                              │  ├── dev.reelmart.in   → Vercel │
                              │  └── reelmart.in       → Vercel │
                              └────────────────┬────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────────────────────┐
│ AWS account / VPC (ap-south-1)               │                                          │
│                                              ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │       Application Load Balancer (HTTPS:443, HTTP:80→443 redirect)               │   │
│   │       SG: alb-sg (in: 80,443 from 0.0.0.0/0)                                    │   │
│   │       ACM cert: *.reelmart.in (DNS-validated)                                   │   │
│   │       Listener rules (path-based):                                              │   │
│   │  /api/catalog/*        → tg-catalog                                             │   │
│   │  /api/orders/*         → tg-order                                               │   │
│   │  /api/payments/*       → tg-payment                                             │   │
│   │  /api/delivery/*       → tg-delivery                                            │   │
│   │  /api/notifications/*  → tg-notification                                        │   │
│   │  /api/whatsapp/*       → tg-whatsapp                                            │   │
│   │  /api/payouts/*        → tg-payout                                              │   │
│   │  /api/analytics/*      → tg-analytics                                           │   │
│   │  /api/returns/*        → tg-return                                              │   │
│   │  /api/admin/*          → tg-admin                                               │   │
│   │  /health               → tg-catalog (default; could split later)                │   │
│   └────────────────────┬────────────────────────────────────────────────────────────┘   │
│                        │                                                                │
│                        │  Dynamic ports (32768-65535) over private SG path              │
│                        ▼                                                                │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │  ECS Cluster: reelmart-<env>  (EC2 launch type, capacity provider managed)      │   │
│   │  SG: ecs-sg (in: 32768-65535 from alb-sg)                                       │   │
│   │                                                                                 │   │
│   │  EC2 Auto Scaling Group (in public subnets across AZ-a + AZ-b):                 │   │
│   │  ┌───────────────────────┐  ┌───────────────────────┐                           │   │
│   │  │  EC2 #1 (t3.small)    │  │  EC2 #2 (t3.medium,   │                           │   │
│   │  │  AZ-a, public IP      │  │  prod only) AZ-b      │                           │   │
│   │  │  ECS-optimized AMI    │  │                       │                           │   │
│   │  │  IMDSv2 only          │  │                       │                           │   │
│   │  │  IAM: ec2InstanceRole │  │                       │                           │   │
│   │  └───────────────────────┘  └───────────────────────┘                           │   │
│   │  ASG (dev):  min=1, max=3, desired=1                                            │   │
│   │  ASG (prod): min=2, max=5, desired=2                                            │   │
│   │                                                                                 │   │
│   │  10 ECS Services (each 1+ task, autoscaled by per-service CPU policy):          │   │
│   │   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                   │   │
│   │   │ catalog-service │ │ order-service   │ │ payment-service │                   │   │
│   │   ├─────────────────┤ ├─────────────────┤ ├─────────────────┤                   │   │
│   │   │delivery-service │ │notification-svc │ │whatsapp-service │                   │   │
│   │   ├─────────────────┤ ├─────────────────┤ ├─────────────────┤                   │   │
│   │   │ payout-service  │ │analytics-service│ │ return-service  │                   │   │
│   │   ├─────────────────┴─┴─────────────────┴─┴─────────────────┤                   │   │
│   │   │                  admin-service                          │                   │   │
│   │   └─────────────────────────────────────────────────────────┘                   │   │
│   │  Each task:                                                                     │   │
│   │   - cpu=256, memory=512 (dev) | cpu=512, memory=1024 (prod)                     │   │
│   │   - Image from ECR: reelmart/<svc>:<env>-<sha>                                  │   │
│   │   - Env from Secrets Manager + plain env (NODE_ENV, etc.)                       │   │
│   │   - logs → CloudWatch /ecs/reelmart/<env>/<svc>                                 │   │
│   │   - /health endpoint required (used by target group)                            │   │
│   └────────┬───────────────────┬─────────────────────────┬──────────────────────────┘   │
│            │                   │                         │                              │
│            │ aws_secretsmanager │ aws_logs                │ aws_ecr                      │
│            ▼                   ▼                         ▼                              │
│   ┌──────────────────┐  ┌──────────────────┐    ┌──────────────────────────┐            │
│   │ Secrets Manager  │  │ CloudWatch Logs  │    │ ECR (10 repositories)    │            │
│   │ reelmart/<env>/  │  │ /ecs/reelmart/   │    │ reelmart/<svc>-service   │            │
│   │  ├── supabase    │  │  <env>/<svc>     │    │  - immutable tag policy  │            │
│   │  ├── razorpay    │  │  retention: 14d  │    │  - lifecycle: keep 20    │            │
│   │  ├── gupshup     │  │                  │    │                          │            │
│   │  ├── twilio      │  └──────────────────┘    └──────────────────────────┘            │
│   │  ├── shiprocket  │                                                                  │
│   │  ├── firebase    │                                                                  │
│   │  └── jwt         │                                                                  │
│   └────────┬─────────┘                                                                  │
│            │                                                                            │
└────────────┼────────────────────────────────────────────────────────────────────────────┘
             │
             │   service tasks call out to Supabase + payment/comms providers
             ▼
┌─────────────────────────────────┐    ┌──────────────────────────────┐
│ Supabase Cloud (per env)        │    │  External SaaS               │
│  - Postgres + RLS               │    │  ├── Razorpay (payments)     │
│  - Auth (phone OTP)             │    │  ├── Shiprocket (delivery)   │
│  - Storage (product images,     │    │  ├── Gupshup (WhatsApp)      │
│             store logos)        │    │  ├── Twilio (SMS OTP)        │
│  - Realtime (order updates)     │    │  ├── Firebase FCM (push)     │
│  - Edge Functions (server-side  │    │  └── Sentry (errors, optl.)  │
│    bits that need service key)  │    │                              │
└─────────────────────────────────┘    └──────────────────────────────┘
```

---

## 2. Network topology

```
VPC: reelmart-dev-vpc       10.0.0.0/16     (prod: 10.10.0.0/16)
│
├── Public subnet AZ-a      10.0.1.0/24     (prod: 10.10.1.0/24)
│   - ALB ENI
│   - EC2 (ECS host) ENIs
│   - Auto-assigned public IPs
│
├── Public subnet AZ-b      10.0.2.0/24     (prod: 10.10.2.0/24)
│   - ALB ENI
│   - EC2 (ECS host) ENIs (prod)
│
├── Internet Gateway         attached to VPC
│
└── Public route table       0.0.0.0/0 → IGW

(No private subnets, no NAT Gateway in dev/prod-v1 — saves ~$32/mo per NAT.
 Migration to private subnets + NAT or VPC endpoints planned when prod traffic
 justifies the security hardening.)
```

### Security Groups

```
alb-sg
  Inbound:
    80   from 0.0.0.0/0    (redirect)
    443  from 0.0.0.0/0
  Outbound:
    all  to ec2-sg

ec2-sg
  Inbound:
    32768-65535  from alb-sg     (ECS dynamic port range → tasks)
    22           from operator IPs only (allowlist; remove for prod)
  Outbound:
    all to 0.0.0.0/0   (Supabase, ECR, Razorpay, Shiprocket, etc.)

ecs-sg  (currently merged into ec2-sg in EC2 launch type — kept as a marker
         module input for the migration to Fargate / awsvpc mode later)
```

---

## 3. CI/CD topology

```
GitHub repo (KMPhaniKumar/shopidea, main branch)
│
├── push to main with changes under reelmart/services/<svc>/**
│   │
│   └── deploy.yml (matrix workflow)
│       │
│       ├── Job: assume role via OIDC → arn:aws:iam::<acct>:role/reelmart-gha-deploy
│       │
│       ├── For each changed service:
│       │   1. docker buildx build --platform linux/amd64
│       │   2. docker push   <acct>.dkr.ecr.ap-south-1.amazonaws.com/reelmart/<svc>:dev-<sha>
│       │                                                                  reelmart/<svc>:dev-latest
│       │   3. aws ecs update-service --force-new-deployment
│       │      └── ECS rolling update: minHealthyPct=100, maxPct=200
│       │   4. aws ecs wait services-stable
│       │
│       └── Smoke test: curl https://api-dev.reelmart.in/api/<svc>/health → expect 200
│
├── push to main with changes under infra/terraform/**
│   │
│   └── infra.yml
│       ├── On PR: terraform fmt -check, validate, plan (dev) — comments plan on PR
│       └── On main merge: terraform apply (dev), gated by required reviewers for prod
│
└── push to main with changes under reelmart/apps/web/**
    └── Vercel auto-deploy (no GHA needed; Vercel watches main)
```

---

## 4. Per-request data flow examples

### Buyer places an order via web storefront
```
1. Buyer hits   reelmart.in/s/<slug>          (Vercel SSR)
2. Browser JS   → Supabase client              (read products, RLS)
3. Add to cart  → /api/orders (POST)            (api-dev.reelmart.in)
4. ALB → tg-order → order-service ECS task
5. order-service → Supabase (insert order)      + → /api/payments (internal call)
6. payment-service → Razorpay (create order)
7. Browser    → Razorpay checkout              (client-side)
8. Razorpay   → /api/payments/webhook           (signed)
9. payment-service marks paid, fires:
     - order-service: status='paid'
     - notification-service: WhatsApp + SMS
     - delivery-service: Shiprocket pickup create
```

### Seller approves an order from dashboard
```
1. Seller logs in at reelmart.in/seller/login   (Supabase Auth)
2. Dashboard calls   /api/orders?store_id=X     (api-dev.reelmart.in)
3. ALB → tg-order → order-service
4. order-service reads via Supabase (RLS scopes to seller's store)
5. Approve → /api/orders/:id/accept
6. order-service updates status, fires:
     - delivery-service: schedule pickup
     - notification-service: notify buyer
```

### Buyer chats the WhatsApp bot
```
1. Buyer DMs the WA business number
2. Gupshup posts to /api/whatsapp/inbound        (api-dev.reelmart.in)
3. ALB → tg-whatsapp → whatsapp-service
4. whatsapp-service runs the bot state machine, calls:
     - catalog-service for products
     - order-service to create order
     - payment-service to mint a Razorpay payment link
5. Replies to buyer via Gupshup outbound API
```

---

## 5. State (Terraform) layout

```
S3 bucket: reelmart-tf-state-<account-id>
  └── infra/dev/network.tfstate
  └── infra/dev/cluster.tfstate
  └── infra/dev/services.tfstate
  └── infra/dev/dns.tfstate
  └── infra/prod/...

DynamoDB table: reelmart-tf-locks   (LockID = HASH key)
```

Splitting state per concern (network / cluster / services / dns) means a typo
in services.tf can't mangle the network — each layer has its own lock and plan.

---

## 6. Cost summary

| Component                | Dev        | Prod (normal) | Notes                            |
|--------------------------|------------|---------------|----------------------------------|
| EC2 (ECS hosts)          | $15        | $66           | t3.small × 1 / t3.medium × 2     |
| ALB                      | $17        | $21           | floor cost                       |
| ECR                      | $1         | $2            | 10 repos                         |
| CloudWatch logs+alarms   | $1         | $4            | 14d retention                    |
| Secrets Manager          | $5         | $5            | $0.40/secret/mo × ~12            |
| Route 53 hosted zone     | $1         | $1            | shared between envs              |
| ACM                      | $0         | $0            | free for AWS-issued              |
| Data transfer            | $1         | $5            | rough                            |
| **AWS subtotal**         | **~$40**   | **~$104**     |                                  |
| Supabase                 | $0 (free)  | $25 (Pro)     | upgrade when free tier limits hit |
| Vercel                   | $0 (Hobby) | $0–$20 (Pro)  | promote when team needed         |
| Twilio (SMS OTP)         | $0–$5      | $5            | usage based                      |
| Gupshup (WhatsApp)       | $0–$5      | $5            | usage based                      |
| Razorpay                 | $0         | %             | per-transaction fee              |
| **Grand total**          | **~$45**   | **~$140**     | dev cost is mostly ALB           |
