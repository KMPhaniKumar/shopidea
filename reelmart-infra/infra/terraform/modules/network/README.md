# Module: network

VPC, public subnets across 2 AZs, Internet Gateway, route tables, security groups (`alb-sg`, `ec2-sg`).

Filled in during **Phase 1** ([`agents/02_network_ecs.md`](../../../agents/02_network_ecs.md)).

## Inputs (planned)
- `environment` (string): `dev` | `prod`
- `vpc_cidr` (string)
- `azs` (list(string))
- `public_subnet_cidrs` (list(string))
- `operator_ip_cidr` (string): allowed for SSH on ec2-sg

## Outputs (planned)
- `vpc_id`
- `public_subnet_ids` (list)
- `alb_security_group_id`
- `ec2_security_group_id`
