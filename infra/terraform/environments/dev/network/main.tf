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

  cluster_name = "reelmart-${var.environment}"

  # Path-routed services on the ALB. Listener rule priorities are 100..190.
  services = {
    catalog      = { path = "/api/catalog/*",       priority = 100 }
    order        = { path = "/api/orders/*",        priority = 110 }
    payment      = { path = "/api/payments/*",      priority = 120 }
    delivery     = { path = "/api/delivery/*",      priority = 130 }
    notification = { path = "/api/notifications/*", priority = 140 }
    whatsapp     = { path = "/api/whatsapp/*",      priority = 150 }
    payout       = { path = "/api/payouts/*",       priority = 160 }
    analytics    = { path = "/api/analytics/*",     priority = 170 }
    return       = { path = "/api/returns/*",       priority = 180 }
    admin        = { path = "/api/admin/*",         priority = 190 }
  }

  service_names = keys(local.services)
}

module "network" {
  source = "../../../modules/network"

  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  azs                 = var.azs
  public_subnet_cidrs = var.public_subnet_cidrs
  operator_ip_cidr    = var.operator_ip_cidr
  tags                = local.common_tags
}

module "ecr" {
  source   = "../../../modules/ecr"
  services = local.service_names
  tags     = local.common_tags
}

module "secrets" {
  source      = "../../../modules/secrets"
  environment = var.environment
  tags        = local.common_tags
}

module "iam" {
  source      = "../../../modules/iam"
  environment = var.environment
  secret_arns = values(module.secrets.secret_arns)
  tags        = local.common_tags
}

module "cluster" {
  source       = "../../../modules/ecs-cluster"
  cluster_name = local.cluster_name
  tags         = local.common_tags
}

module "alb" {
  source            = "../../../modules/alb"
  environment       = var.environment
  vpc_id            = module.network.vpc_id
  subnet_ids        = module.network.public_subnet_ids
  security_group_id = module.network.alb_security_group_id
  services          = local.services
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = toset(local.service_names)

  name              = "/ecs/reelmart/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  tags              = merge(local.common_tags, { Service = each.key })
}
