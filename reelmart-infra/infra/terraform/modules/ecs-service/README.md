# Module: ecs-service

Per-service composition: task definition, ECS service, autoscaling target + policy. Instantiated 10 times in `environments/dev/services.tf`.

Filled in during **Phase 4** ([`agents/05_ecs_services.md`](../../../agents/05_ecs_services.md)).

## Inputs (planned)
- `environment`, `cluster_name`
- `service_name` (e.g., `catalog-service`)
- `image_uri` (full ECR URI with tag)
- `container_port` (int, default 3000)
- `cpu`, `memory` (int)
- `desired_count`, `min_capacity`, `max_capacity`
- `target_group_arn`
- `task_execution_role_arn`
- `task_role_arn`
- `log_group_name`
- `env_vars` (map(string)) — plain values
- `secret_refs` (map: env-name → secret-arn:json-key) — Secrets Manager-backed env

## Outputs (planned)
- `service_arn`
- `task_definition_arn`
