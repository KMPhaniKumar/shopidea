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

data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = "reelmart-tf-state-632127307144"
    key    = "infra/dev/network.tfstate"
    region = "ap-south-1"
  }
}

module "ec2_asg" {
  source = "../../../modules/ec2-asg"

  environment       = var.environment
  cluster_name      = data.terraform_remote_state.network.outputs.cluster_name
  instance_type     = var.ec2_instance_type
  subnet_ids        = data.terraform_remote_state.network.outputs.public_subnet_ids
  security_group_id = data.terraform_remote_state.network.outputs.ec2_security_group_id
  key_pair_name     = var.ec2_key_pair_name
  min_size          = var.asg_min
  max_size          = var.asg_max
  desired_capacity  = var.asg_desired
  tags              = local.common_tags
}
