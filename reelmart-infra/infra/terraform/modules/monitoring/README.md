# Module: monitoring

SNS topic + email/Slack subscription + CloudWatch alarms (per-service task counts + global ALB/EC2 alarms).

Filled in during **Phase 9** ([`agents/10_monitoring.md`](../../../agents/10_monitoring.md)).

## Inputs (planned)
- `environment`, `cluster_name`
- `service_names` (list)
- `alb_arn_suffix`
- `target_group_arn_suffixes` (map: service → suffix)
- `alert_email` (string)
- `slack_webhook_url` (string, optional)

## Outputs (planned)
- `alerts_topic_arn`
