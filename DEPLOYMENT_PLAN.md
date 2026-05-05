# ReelMart — Deployment Plan
> ECS on EC2 + Auto Scaling | Budget: $150/month max | Region: ap-south-1 (Mumbai)

---

## Architecture Overview

```
Internet
    │
    ▼
Route 53 (api.reelmart.in)
    │
    ▼
ALB (HTTPS:443)  ← path-based routing
    │
    ├── /api/stores,/api/products  → catalog-service
    ├── /api/orders                → order-service
    ├── /api/payments              → payment-service
    ├── /api/delivery              → delivery-service
    ├── /api/notifications         → notification-service
    ├── /api/whatsapp              → whatsapp-service
    ├── /api/payouts               → payout-service
    ├── /api/analytics             → analytics-service
    ├── /api/returns               → return-service
    └── /api/admin                 → admin-service
          │
          ▼
    ECS Cluster (EC2 launch type)
    ┌─────────────────────────────┐
    │  EC2 t3.medium #1  (AZ-a)  │  ← always running
    │  EC2 t3.medium #2  (AZ-b)  │  ← always running
    │  EC2 t3.medium #3  (AZ-a)  │  ← auto-added on high load
    └─────────────────────────────┘
    Auto Scaling Group: min=2, max=5
          │
          ▼
    Supabase Cloud (DB + Auth + Storage)
```

### Why ECS on EC2 (not Fargate)?
```
Fargate: you pay per task (container) → expensive at scale
EC2:     you pay per instance → containers are free on top
         NO NAT Gateway needed (EC2 in public subnet with SG rules)
         Saves $37/month vs Fargate setup
```

---

## Cost Breakdown

### Monthly (normal load)
```
EC2 t3.medium × 2          $60/month  (2vCPU, 4GB each)
ALB                         $21/month
ECR (10 repos)              $2/month
CloudWatch Logs             $3/month
Secrets Manager             $4/month
Route 53                    $1/month
ACM Certificate             $0
─────────────────────────────────────
AWS Total:                  $91/month

Supabase Free tier          $0/month   (up to 50k users)
Vercel (web apps)           $0/month
Twilio (SMS OTP)            $5/month
Gupshup (WhatsApp)          $5/month
Firebase FCM                $0/month
Razorpay                    $0/month   (% per transaction)
─────────────────────────────────────
Grand Total:               ~$101/month ✅ Under $150
```

### Monthly (peak load — 3rd EC2 added by ASG)
```
EC2 t3.medium × 3          $90/month
ALB                         $21/month
Others                      $15/month
─────────────────────────────────────
Grand Total:               ~$131/month ✅ Under $150
```

---

## Auto Scaling Rules

### EC2 Auto Scaling Group (adds/removes EC2 instances)
```
Min instances: 2  (always 2 running for HA)
Max instances: 5
Desired:       2

Scale OUT (add EC2) when:
  - Cluster CPU reservation > 70% for 2 min
  - Cluster memory reservation > 75% for 2 min

Scale IN (remove EC2) when:
  - Cluster CPU reservation < 30% for 10 min
  - Never go below min=2
```

### ECS Service Auto Scaling (adds/removes containers per service)
```
catalog-service:       min=1, max=5  (most traffic)
order-service:         min=1, max=5
payment-service:       min=1, max=3
whatsapp-service:      min=1, max=3
notification-service:  min=1, max=3
delivery-service:      min=1, max=3
analytics-service:     min=1, max=2
return-service:        min=1, max=2
payout-service:        min=1, max=1  (batch job, no scaling)
admin-service:         min=1, max=1  (low traffic)

Scale trigger: CPU > 60% for 60 seconds → add 1 task
Scale down:    CPU < 30% for 300 seconds → remove 1 task
```

---

## Phases

---

### Phase 1 — AWS Foundation (Day 1)
> Set up VPC, EC2, ECS cluster, ALB, ECR, IAM, Secrets

**What you do:**
```
1. Create AWS account (if not done)
2. Set region to ap-south-1 (Mumbai)
3. Run infrastructure setup (we'll build this)
```

**What gets created:**
```
VPC (10.0.0.0/16)
├── Public Subnet AZ-a (10.0.1.0/24)  ← ALB + EC2 here
├── Public Subnet AZ-b (10.0.2.0/24)  ← ALB + EC2 here
Internet Gateway
Security Groups:
  ├── alb-sg    (inbound: 80, 443 from internet)
  ├── ec2-sg    (inbound: 32768-65535 from alb-sg, 22 from your IP)
  └── ecs-sg    (inbound: all from ec2-sg)
ECR repos × 10 (one per service)
ECS Cluster (EC2 launch type)
ALB + HTTPS listener + 10 target groups
IAM roles (ECS execution + task)
Secrets Manager (Supabase keys, Razorpay, etc.)
CloudWatch log groups × 10
```

**Time: 2-3 hours**

---

### Phase 2 — EC2 Auto Scaling Group (Day 1)
> Launch EC2 instances that join ECS cluster automatically

**What gets created:**
```
Launch Template:
  AMI: Amazon ECS-optimized AMI (latest)
  Instance type: t3.medium
  IAM role: EC2InstanceProfileForECS
  User data: registers to ECS cluster on boot
  Security group: ec2-sg

Auto Scaling Group:
  Min: 2, Max: 5, Desired: 2
  Subnets: both public subnets (multi-AZ)
  Health check: EC2 + ELB
  
Scaling Policies:
  Scale out: CPU > 70% → add 1 instance (cooldown 300s)
  Scale in:  CPU < 30% → remove 1 instance (cooldown 300s)
```

**Time: 1 hour**

---

### Phase 3 — Docker Images + ECR Push (Day 2)
> Build all 10 service Docker images and push to ECR

**What you do:**
```bash
# We'll create a script: scripts/build-and-push.sh
# Run once manually, then GitHub Actions does it on every push

cd reelmart/services
for service in catalog order payment delivery notification \
               whatsapp payout analytics return admin; do
  docker build -t reelmart/${service}-service ./${service}-service
  docker tag reelmart/${service}-service \
    ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/reelmart/${service}-service:latest
  docker push \
    ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/reelmart/${service}-service:latest
done
```

**Time: 1-2 hours (build + push)**

---

### Phase 4 — ECS Task Definitions + Services (Day 2)
> Deploy all 10 services to ECS with auto scaling

**What gets created:**
```
10 × ECS Task Definitions (JSON configs)
  Each task: 0.5 vCPU, 512MB RAM
  Env vars pulled from Secrets Manager
  Logs → CloudWatch

10 × ECS Services
  Each service: min=1 task, connected to ALB target group
  Deployment: rolling update (no downtime)
  Health check: /health endpoint

10 × Application Auto Scaling policies
  Per-service CPU-based scaling
```

**Time: 2-3 hours**

---

### Phase 5 — DNS + SSL (Day 3)
> Point api.reelmart.in to ALB with HTTPS

```
1. ACM: request certificate for api.reelmart.in (free)
2. Validate via DNS (add CNAME record) → takes ~5 min
3. Add cert to ALB HTTPS listener
4. Route 53: api.reelmart.in → ALB DNS name (A record alias)
5. Update all apps:
   NEXT_PUBLIC_API_URL=https://api.reelmart.in
   API_BASE_URL=https://api.reelmart.in
```

**Time: 1-2 hours**

---

### Phase 6 — CI/CD with GitHub Actions (Day 3-4)
> Push to main → auto build + deploy only changed services

**How it works:**
```
Push code to main
    │
    ├── changed reelmart/services/order-service?
    │       → build order-service image
    │       → push to ECR with git SHA tag
    │       → update ECS task definition
    │       → deploy to ECS (rolling update)
    │       → wait for health checks to pass
    │
    ├── changed reelmart/services/payment-service?
    │       → same flow for payment-service only
    │
    └── unchanged services → skipped (nothing happens)

Result: only changed services redeploy
        takes ~3-4 min per service
        zero downtime (rolling update)
```

**GitHub Secrets needed:**
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION          = ap-south-1
AWS_ACCOUNT_ID      = your 12-digit account ID
ECS_CLUSTER         = reelmart-cluster
```

**Time: 2-3 hours**

---

### Phase 7 — Web Apps on Vercel (Day 4)
> Deploy seller web + admin web

```
1. Connect GitHub repo to Vercel
2. Seller web:
   - Root: reelmart/apps/web
   - NEXT_PUBLIC_SUPABASE_URL=...
   - NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   - NEXT_PUBLIC_API_URL=https://api.reelmart.in

3. Admin web: same settings

4. Custom domains:
   - seller.reelmart.in → seller web
   - admin.reelmart.in  → admin web

Auto-deploys on every push to main (Vercel handles it)
```

**Time: 1 hour**

---

### Phase 8 — Mobile App Build (Day 5)
> Build buyer app for App Store + Play Store

```
Using Expo EAS Build:

1. eas build --platform ios
2. eas build --platform android
3. Update API URL → https://api.reelmart.in
4. Submit to stores:
   eas submit --platform ios
   eas submit --platform android

Review time: iOS ~24-48 hrs, Android ~2-3 hrs
```

**Time: 1 day setup + review wait**

---

### Phase 9 — Monitoring + Alerts (Day 5)
> Know when something breaks before users notice

```
CloudWatch Alarms:
  ├── ECS service task count < desired → alert
  ├── ALB 5xx rate > 1% → alert
  ├── ALB response time > 2s → alert
  ├── EC2 CPU > 85% → alert
  └── Any service /health failing → alert

Notification: email + (optional) Slack webhook

Cost: ~$1/month for alarms
```

**Time: 1-2 hours**

---

## Full Timeline

```
Day 1:  Phase 1 + 2  — AWS foundation + EC2 ASG
Day 2:  Phase 3 + 4  — Docker images + ECS services
Day 3:  Phase 5 + 6  — DNS/SSL + CI/CD setup
Day 4:  Phase 7      — Web apps on Vercel
Day 5:  Phase 8 + 9  — Mobile build + monitoring
────────────────────────────────────────────────
Total: 5 days to full production deployment
```

---

## What We Build (Files)

```
reelmart/
├── infra/
│   ├── setup.sh                    ← Phase 1+2: VPC, EC2, ECS, ALB (one script)
│   ├── task-definitions/           ← Phase 4: 10 JSON task definition files
│   │   ├── catalog-service.json
│   │   ├── order-service.json
│   │   └── ... (10 files)
│   ├── scripts/
│   │   ├── build-and-push.sh      ← Phase 3: build + push all images
│   │   └── smoke-test.sh          ← verify all /health endpoints
│   └── cloudwatch-alarms.sh       ← Phase 9: set up monitoring
│
└── .github/
    └── workflows/
        ├── _deploy-service.yml    ← reusable workflow
        ├── deploy-catalog.yml
        ├── deploy-order.yml
        └── ... (10 workflow files)
```

---

## Secrets Needed (fill before Phase 1)

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Gupshup (WhatsApp)
GUPSHUP_API_KEY=
GUPSHUP_SENDER_NUMBER=
GUPSHUP_APP_NAME=

# Twilio (SMS OTP)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Shiprocket
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=

# Firebase (FCM push)
FIREBASE_SERVICE_ACCOUNT_JSON=
```

---

## Upgrade Path (when traffic grows)

```
Now → $101/month
  2 × t3.medium EC2
  10 services, 1 task each

10k orders/month → ~$131/month
  ASG auto-adds 3rd EC2
  High-traffic services scale to 2-3 tasks

50k orders/month → move to Fargate ~$200/month
  Revenue at this point: ~₹2.5 crore/month
  Infra is 0.1% of revenue — totally justified

100k+ orders/month → full ECS Fargate + Redis cache
  Multi-AZ, read replicas, CDN
```

---

## Ready to Start?

Say **"start Phase 1"** and I'll build the `infra/setup.sh` script that creates everything on AWS in one run.
