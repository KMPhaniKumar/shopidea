# Environment: dev

Composes the modules with dev-sized inputs. Each Terraform "layer" gets its own state file (`network`, `cluster`, `services`, `dns`, `monitoring`) — split for blast-radius reasons.

Layers and the agent that builds each:

| Layer        | Built in phase | Agent                                |
|--------------|----------------|--------------------------------------|
| `network`    | Phase 1        | `agents/02_network_ecs.md`           |
| `cluster`    | Phase 2        | `agents/03_ec2_asg.md`               |
| `services`   | Phase 4        | `agents/05_ecs_services.md`          |
| `dns`        | Phase 5        | `agents/06_dns_ssl.md`               |
| `monitoring` | Phase 9        | `agents/10_monitoring.md`            |

Each layer has its own subfolder here once it's built (`environments/dev/network/`, `environments/dev/cluster/`, etc.) with its own `backend.tf` pointing at a distinct state key.

## Sizing (dev)
- EC2: 1× t3.small
- ASG: min=1, max=3, desired=1
- ECS task: cpu=256, memory=512 per task
- Per-service: min=1, max=2 tasks
