# Module: iam

ECS task execution role (pulls images, reads secrets, writes logs) and base task role (per-service permissions added in `ecs-service`).

Filled in during **Phase 1**.

## Inputs (planned)
- `environment`
- `secret_arns` (list — secrets the task exec role needs to read)

## Outputs (planned)
- `task_execution_role_arn`
- `task_role_arn`
