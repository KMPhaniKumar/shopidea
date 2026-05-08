# Module: ec2-asg

Launch template + Auto Scaling Group + ECS capacity provider. EC2 hosts join the ECS cluster on boot.

Filled in during **Phase 2** ([`agents/03_ec2_asg.md`](../../../agents/03_ec2_asg.md)).

## Inputs (planned)
- `environment`, `cluster_name`
- `instance_type` (e.g., `t3.small`)
- `key_pair_name`
- `subnet_ids` (list)
- `security_group_id`
- `min_size`, `max_size`, `desired_capacity`

## Outputs (planned)
- `asg_arn`
- `capacity_provider_name`
