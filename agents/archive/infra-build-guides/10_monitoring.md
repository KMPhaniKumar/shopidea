# Phase 9 — CloudWatch Alarms + SNS

> Get notified before users notice. The minimal alarm set: ECS task health, ALB error rate, latency, EC2 CPU.

## Goal
- SNS topic `reelmart-<env>-alerts` with email subscription confirmed.
- 5 alarms wired to that SNS topic.
- (Optional) Slack webhook subscriber for the same topic.

## Prerequisites
- Phase 1–4 complete (cluster + services exist; metrics flowing)
- Email address that you'll actually read

## Inputs
- `EMAIL_FOR_ALERTS`
- `SLACK_WEBHOOK_URL` (optional)

## Layer
This phase writes to `infra/dev/monitoring.tfstate`.

## Module used
`modules/monitoring/`

## Alarms to create

| Alarm                                | Metric                                         | Threshold        | Period | Action            |
|--------------------------------------|------------------------------------------------|------------------|--------|-------------------|
| `<svc>-task-count-low`               | `ECS/ContainerInsights RunningTaskCount`       | < desired        | 5 min  | SNS               |
| `alb-5xx-rate-high`                  | `ALB/HTTPCode_Target_5XX_Count` / `RequestCount`| > 1%            | 5 min  | SNS               |
| `alb-target-response-time-p95-high`  | `ALB/TargetResponseTime` p95                   | > 2s             | 5 min  | SNS               |
| `ec2-cpu-high`                       | `EC2/CPUUtilization` avg                       | > 85%            | 10 min | SNS               |
| `ecs-service-deployment-failed`      | `ECS Events` rule (EventBridge → CloudWatch)   | DeploymentState=FAILED | n/a | SNS               |

Plus a meta-alarm:
| `alb-no-healthy-hosts`               | `ALB/HealthyHostCount` per target group        | < 1              | 1 min  | SNS (high priority) |

## Steps

### 9.1 — SNS topic + email subscription
```hcl
# environments/dev/monitoring.tf
module "monitoring" {
  source = "../../modules/monitoring"

  environment            = "dev"
  cluster_name           = data.terraform_remote_state.cluster.outputs.ecs_cluster_name
  alb_arn_suffix         = data.terraform_remote_state.network.outputs.alb_arn_suffix
  target_group_suffixes  = data.terraform_remote_state.network.outputs.target_group_arn_suffixes
  service_names          = ["catalog-service", "order-service", ...]
  alert_email            = var.alert_email
  slack_webhook_url      = var.slack_webhook_url   # optional, "" disables
}
```

```bash
terraform apply
# AWS sends a confirmation email — click the link.
```

### 9.2 — Confirm subscription
```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $(terraform output -raw alerts_topic_arn) \
  --query 'Subscriptions[].{Endpoint:Endpoint,Status:SubscriptionArn}'
# Status should be a real ARN, not "PendingConfirmation"
```

### 9.3 — Smoke-test an alarm (force a 5xx)
```bash
# Stop one task to force healthy host count down
aws ecs update-service --cluster reelmart-dev --service catalog-service --desired-count 0
# Wait 2 min — `alb-no-healthy-hosts` for catalog target group should fire
# Then restore:
aws ecs update-service --cluster reelmart-dev --service catalog-service --desired-count 1
```

You should get the alert email + Slack message (if wired). After it clears, the alarm goes back to OK and AWS sends an "OK" notification.

### 9.4 — Slack subscriber (optional)
Use a tiny Lambda or AWS Chatbot. Simplest: AWS Chatbot:
1. AWS Chatbot console → Configure new client → Slack workspace → grant permissions.
2. Create configuration → channel → subscribe to `reelmart-dev-alerts` topic.

## Deliverables
- SNS topic `reelmart-dev-alerts`
- Email subscription confirmed
- 6+ CloudWatch alarms (one per service for task count, plus the global ones)
- (Optional) Slack/Chatbot subscription
- EventBridge rule for ECS deployment failures → SNS

## Validation
```bash
# All alarms in OK state (or INSUFFICIENT_DATA if just created)
aws cloudwatch describe-alarms \
  --alarm-name-prefix reelmart-dev \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}' --output table

# Forced alarm fired and recovered (from 9.3)
aws cloudwatch describe-alarm-history \
  --alarm-name reelmart-dev-alb-no-healthy-hosts-catalog \
  --history-item-type StateUpdate --max-records 5
```

## Common pitfalls
- **Email subscription pending.** AWS won't send anything until you click the confirm link. Check spam.
- **`ARN suffix` vs `ARN`.** ALB CloudWatch metrics need the **suffix** (`app/reelmart-dev-alb/abc123`), not the full ARN. Outputs from the network module should expose both.
- **Threshold on a noisy metric.** `TargetResponseTime` jitters under low traffic. Use p95 over 5 min, not avg over 1 min.
- **Per-service task-count alarms exploding.** With 10 services × 1 alarm each, plus the global ones, you have ~16 alarms. CloudWatch alarms are $0.10/alarm/mo — fine but not free.
- **No alarm on the dependencies that matter.** Add Supabase availability monitoring via Supabase's own status (HTTP probe) — Supabase outage = your platform outage.
- **Slack flood.** A misbehaving service that flaps healthy/unhealthy can fire dozens of notifications. Use `evaluation_periods=2` to require sustained badness.

## Rollback
```bash
terraform destroy -target=module.monitoring
# Removes alarms + topic + subscriptions.
# Note: SNS subscriptions confirmed by email still exist as zombies for 3 days; that's fine.
```

## Next
Dev environment is fully wired. To bring up `prod`:
1. Re-run Phases 0 (already done — bootstrap is account-wide).
2. Re-run Phases 1, 2, 4, 5, 6, 9 against `environments/prod/` with prod sizing.
3. Update Vercel env vars (Phase 7) — promote production environment.
4. Run Phase 8 with `--profile production` and `eas submit` to the App Store / Play Store.
