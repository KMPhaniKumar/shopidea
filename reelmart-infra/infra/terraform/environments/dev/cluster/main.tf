provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = local.common_tags
  }
}

locals {
  common_tags = {
    Project     = "reelmart"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "platform"
  }
}

# EC2 ASG removed — the cluster runs on Fargate now (see modules/ecs-service,
# launch_type=FARGATE). The ec2-asg module (ASG, EC2 capacity provider, launch
# template, instance IAM role) was decommissioned. This layer is intentionally
# empty; kept so the state key (infra/dev/cluster.tfstate) and history persist.
