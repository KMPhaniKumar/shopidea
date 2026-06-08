# Backend microservices — context for this directory

10 independent **Express + TypeScript** microservices. Each: own `Dockerfile`, `package.json` (`build`=`tsc`, `start`=`node dist/index.js`), listens on **port 3000**, exposes **`/health`**.

Services: `admin analytics catalog delivery notification order payment payout return whatsapp` (dir = `<svc>-service`). The old `reelmart/backend` monolith no longer exists.

## Where it runs
- **AWS ECS Fargate**, cluster `reelmart-dev`, region `ap-south-1`, account `632127307144`.
- Images: ECR `632127307144.dkr.ecr.ap-south-1.amazonaws.com/reelmart/<svc>-service:dev-latest`.
- Behind ALB `api-dev.reelmart.in`, path-routed (`/api/<area>/*`) to IP target groups `reelmart-dev-tgip-<svc>`.

## How to change / ship
- **Deploy a service:** use the `/deploy-service` skill (build `linux/amd64` → push ECR → `ecs update-service --force-new-deployment`). CI does the same on push to `main` (`.github/workflows/deploy.yml`).
- **Task defs, env vars, secrets, ALB, scaling are Terraform-managed** in `reelmart-infra/infra/terraform/environments/dev/services` — change them there, not via the AWS CLi. Secrets come from Secrets Manager via the task def.
- **Auth bridge** (MSG91 → Supabase session) lives in `admin-service` (`/api/admin/auth/*`).
- **Courier = NimbusPost** (`delivery-service`); per-seller pickup registration via internal endpoints.
- Inter-service calls authenticate with `x-internal-key` (`INTERNAL_API_KEY`) or a Bearer token.

## Conventions
TypeScript, async/await, explicit error handling, Zod input validation, consistent `{success, data|error}` responses. Run `npm run build` (tsc) before shipping. Known gap: `delivery-service` task def lacks `NIMBUS_AUTH_TOKEN`.
