# Module: alb

Internet-facing Application Load Balancer with HTTP→HTTPS redirect, HTTPS listener, 10 target groups (one per service), and 10 path-based listener rules.

Filled in during **Phase 1**. Cert is attached in **Phase 5**.

## Inputs (planned)
- `environment`, `vpc_id`, `subnet_ids`
- `security_group_id` (alb-sg)
- `services` (list of names — used to generate target groups + listener rule priorities)

## Outputs (planned)
- `alb_arn`
- `alb_dns_name`
- `alb_zone_id`
- `https_listener_arn`
- `target_group_arns` (map: service → ARN)
- `target_group_arn_suffixes` (for CloudWatch metric dimensions)
