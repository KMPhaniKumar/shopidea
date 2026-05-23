# Phase 2 — EC2 Auto Scaling Group

> Launch template + ASG that registers EC2 instances into the ECS cluster on boot.

## Goal
EC2 instances running the ECS agent, automatically joining `reelmart-dev` cluster, ready to host tasks.

## Prerequisites
- Phase 1 complete (cluster, VPC, ec2-sg exist)
- ECS-optimized AMI ID resolvable via SSM parameter (no manual AMI ID lookups)

## Inputs
- Environment: `dev`
- Instance type: `t3.small` (dev) | `t3.medium` (prod)
- ASG sizing:  dev `min=1 max=3 desired=1`  | prod `min=2 max=5 desired=2`
- Operator key pair name (for SSH; create one in EC2 console: `reelmart-ops`)

## Layer
This phase appends to `infra/dev/cluster.tfstate` (separate from network).

## Module used
`modules/ec2-asg/`

## Steps

### 2.1 — Create the cluster layer
```bash
cd infra/terraform/environments/dev

# Add to terraform.tfvars:
cat >> terraform.tfvars <<EOF
ec2_instance_type   = "t3.small"
ec2_key_pair_name   = "reelmart-ops"
asg_min             = 1
asg_max             = 3
asg_desired         = 1
EOF

terraform plan -target=module.ec2_asg -out=tfplan
terraform apply tfplan
```

### 2.2 — Wait for the instance to register
```bash
# Should show 1 container instance within 2 minutes of apply
aws ecs list-container-instances --cluster reelmart-dev --query 'containerInstanceArns[]'
```

## Deliverables

### Launch Template `reelmart-dev-ec2-lt`
- AMI: latest Amazon ECS-optimized AL2023 (`/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended`)
- Instance type from input
- IAM instance profile: `reelmart-dev-ec2-instance-profile` (attached managed policies: `AmazonEC2ContainerServiceforEC2Role`, `AmazonSSMManagedInstanceCore`, `CloudWatchAgentServerPolicy`)
- Security group: `ec2-sg`
- Metadata: IMDSv2 only (`http_tokens=required`, hop_limit=2)
- Block device: 30 GB gp3 root, encrypted
- User data: registers to `reelmart-dev` cluster + enables CloudWatch agent
  ```bash
  #!/bin/bash
  echo "ECS_CLUSTER=reelmart-dev" >> /etc/ecs/ecs.config
  echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config
  ```

### Auto Scaling Group `reelmart-dev-ec2-asg`
- Spans both public subnets (multi-AZ)
- Health check type: `EC2` for now (ELB health check requires a service registered to the same TG; we add that in Phase 4)
- Capacity rebalance: enabled
- Tag propagation: yes, including `AmazonECSManaged=true` (required for cluster capacity provider)

### ECS Capacity Provider
- Name: `reelmart-dev-cp`
- ASG: linked to the ASG above
- Managed scaling: enabled, target capacity 100 (means the cluster sizes itself based on task pending/in-progress count)
- Managed termination protection: enabled (don't kill instances with running tasks)
- Cluster default strategy: `capacity_provider = reelmart-dev-cp, weight = 1, base = 1`

### Scaling policies (ASG-level CPU; cluster handles task-driven scaling itself)
- `cpu-out`: target tracking, target = 70 (CPU avg), out cooldown 300s
- `cpu-in`: target tracking, target = 30 (CPU avg), in cooldown 600s

## Validation
```bash
# Container instance is ACTIVE in cluster
aws ecs describe-container-instances --cluster reelmart-dev \
  --container-instances $(aws ecs list-container-instances --cluster reelmart-dev --query 'containerInstanceArns[0]' --output text) \
  --query 'containerInstances[0].{Status:status,RunningTasks:runningTasksCount,RegisteredCpu:registeredResources[?name==`CPU`].integerValue|[0]}'
# → Status="ACTIVE", RunningTasks=0, RegisteredCpu=2048 (t3.small) or 4096 (t3.medium)

# SSH (uses Session Manager — no public SSH needed)
aws ssm start-session --target $(aws ec2 describe-instances \
  --filters Name=tag:Project,Values=reelmart Name=tag:Environment,Values=dev Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

# Inside the instance:
sudo cat /etc/ecs/ecs.config       # → ECS_CLUSTER=reelmart-dev
sudo systemctl status ecs           # → active (running)
```

## Common pitfalls
- **AmazonECSManaged tag missing.** ASG must propagate this tag to instances or the cluster capacity provider won't recognize them; managed scaling will spin them down repeatedly.
- **AMI parameter wrong.** Use SSM Parameter Store, not a hardcoded AMI ID — AMIs change monthly and hardcoding leads to silent EOL.
- **IMDSv1 enabled.** Older AMIs leave it on; explicitly set `http_tokens=required`.
- **Ports 32768–65535 on ec2-sg.** ECS dynamic port range. If you forgot this in Phase 1, tasks will start but ALB can't reach them.
- **Wrong health check type.** `ELB` health check on the ASG needs a service registered first. Use `EC2` until Phase 4.
- **t3.nano / t3.micro temptation.** Too small for the ECS agent overhead + multiple tasks. `t3.small` is the floor.
- **Apply order.** If you `terraform destroy` Phase 2, instances are gone but ECS task definitions in Phase 4 won't drain — terminate services first.

## Rollback
```bash
terraform plan -destroy -target=module.ec2_asg -out=tfplan
terraform apply tfplan
# Instances drain (managed termination protection respects running tasks)
```

## Next: Phase 3
Hand off to `04_build_push.md`.
