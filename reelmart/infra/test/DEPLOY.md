# ReelMart — Minimal Test Deployment

**Infrastructure:** Single EC2 t2.micro + Docker + nginx  
**Cost:** $0 (AWS free tier — 750 hrs/month, first 12 months)  
**Time:** ~10 minutes

---

## Prerequisites

1. AWS CLI installed and configured (`aws configure`)
2. An EC2 key pair created in AWS Console → EC2 → Key Pairs
3. Your repo pushed to GitHub (must be public, or update the git clone command)

---

## Step 1 — Deploy the CloudFormation stack

```bash
aws cloudformation create-stack \
  --stack-name reelmart-test \
  --template-body file://reelmart/infra/test/cloudformation.yml \
  --parameters \
    ParameterKey=KeyPairName,ParameterValue=YOUR_KEY_PAIR_NAME \
    ParameterKey=GitRepo,ParameterValue=https://github.com/KMPhaniKumar/shopidea.git \
  --region ap-south-1
```

Wait ~3 minutes for it to complete:
```bash
aws cloudformation wait stack-create-complete --stack-name reelmart-test --region ap-south-1
```

Get the server IP:
```bash
aws cloudformation describe-stacks \
  --stack-name reelmart-test \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

---

## Step 2 — SSH into the server

```bash
ssh -i ~/.ssh/YOUR_KEY_PAIR_NAME.pem ec2-user@<PUBLIC_IP>
```

Check that the setup script finished:
```bash
tail -50 /var/log/reelmart-setup.log
# Last line should say: "=== Setup complete. ==="
```

---

## Step 3 — Fill in environment variables

```bash
cd ~/shopidea/reelmart/services
cp ~/shopidea/reelmart/infra/test/.env.example .env
nano .env
```

Fill in at minimum:
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_KEY` — your Supabase service role key
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` — for payments
- `ALLOWED_ORIGINS` — set to `http://<PUBLIC_IP>`

---

## Step 4 — Build and start all services

```bash
cd ~/shopidea/reelmart/services
docker-compose up --build -d
```

First build takes ~5–8 minutes (downloads Node, compiles TypeScript).

Check all containers are running:
```bash
docker-compose ps
```

All should show `Up`. If any show `Exit`, check logs:
```bash
docker-compose logs <service-name>
```

---

## Step 5 — Smoke test (from your local machine)

```bash
chmod +x reelmart/infra/test/smoke-test.sh
./reelmart/infra/test/smoke-test.sh <PUBLIC_IP>
```

Expected output:
```
ReelMart Smoke Test → http://13.235.100.200
──────────────────────────────
  ✅  nginx /health (200)
  ✅  catalog-service (200)
  ✅  order-service (200)
  ...
  Passed: 11 / 11
```

---

## Step 6 — Point client apps to the server

Update `reelmart/apps/buyer-app/app.json`:
```json
"extra": { "EXPO_PUBLIC_API_URL": "http://<PUBLIC_IP>" }
```

Update `reelmart/apps/web/.env.local`:
```
API_URL=http://<PUBLIC_IP>
NEXT_PUBLIC_API_URL=http://<PUBLIC_IP>
```

---

## Useful commands (on the server)

```bash
# Restart all services
docker-compose restart

# View logs for one service
docker-compose logs -f catalog-service

# Rebuild after code changes
git -C ~/shopidea pull
docker-compose up --build -d

# Stop everything
docker-compose down
```

---

## Tear down (stop all charges)

```bash
# Delete the stack — terminates EC2, removes security group
aws cloudformation delete-stack --stack-name reelmart-test --region ap-south-1
```

---

## Why not ECS / ALB?

| Resource | Cost/month |
|----------|-----------|
| ALB | ~$16 |
| NAT Gateway | ~$32 |
| ECS Fargate (10 tasks, 0.25 vCPU each) | ~$20 |
| **This setup (t2.micro)** | **$0 (free tier)** |

When you're ready to go live, use Phase 5 from `MICROSERVICES_TRACKER.md` to set up proper ECS + ALB.
