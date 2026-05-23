# Terraform — context for this directory

**Source of truth for ReelMart AWS infra.** Backend runs on **ECS Fargate** (cluster `reelmart-dev`, ap-south-1, account `632127307144`).

## Layout
- S3 backend: bucket `reelmart-tf-state-632127307144`, DynamoDB locks `reelmart-tf-locks`.
- Three layers under `environments/dev/` (apply in this order; `services` reads `network`'s remote-state outputs):
  - **network** — VPC, public subnets, security groups (incl. `aws_security_group.fargate`), ALB + listener rules + **IP** target groups, ECR repos, IAM (task exec/role), Secrets Manager, ECS cluster.
  - **cluster** — intentionally empty after the EC2→Fargate migration (EC2 ASG/capacity-provider removed).
  - **services** — the 10 ECS Fargate services via `modules/ecs-service` (`launch_type=FARGATE`, `awsvpc`, 256 CPU / 512 MB, public subnets + public IP, awslogs).

## Rules (important)
- **Change infra here, then apply — never via raw AWS CLI.** Out-of-band CLI changes create drift (that's how the EC2→Fargate migration first diverged).
- Always `terraform plan` and review before applying. For risky changes save a plan: `terraform plan -out=tfplan` → review → `terraform apply tfplan`. `terraform apply -auto-approve` and `terraform destroy` are blocked by the guard/permissions.
- To reconcile resources changed outside TF: `terraform import` the live one / `terraform state rm` the gone one until `plan` is clean (state ops don't touch live infra).
- Use the `/tf-drift` skill or the **infra-guardian** agent to inspect.
- AWS creds via SSO (`/aws-session`); automation uses the OIDC role `reelmart-gha-deploy`.
