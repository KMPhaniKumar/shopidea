# Environment: prod

Same module composition as `dev/`, with prod-sized inputs. Build out only after dev has been running stably for at least a week.

## Sizing (prod)
- EC2: 2× t3.medium (multi-AZ)
- ASG: min=2, max=5, desired=2
- ECS task: cpu=512, memory=1024 per task
- Per-service: min=1, max=5 (catalog/order), max=3 (mid-traffic), max=1 (batch/admin)

## Differences from dev
- VPC CIDR: `10.10.0.0/16`
- Subnet CIDRs: `10.10.1.0/24`, `10.10.2.0/24`
- ALB cert: `*.reelmart.in` and `reelmart.in` (same as dev — both share the wildcard)
- DNS: `api.reelmart.in` (instead of `api-dev.reelmart.in`)
- Secrets: under `reelmart/prod/*` namespace
- Monitoring: stricter thresholds; PagerDuty integration in addition to email
- Plus: AWS Backup for the ECS task definitions, Inspector enabled, GuardDuty.
