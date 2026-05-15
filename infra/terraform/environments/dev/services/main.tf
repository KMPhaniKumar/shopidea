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

data "terraform_remote_state" "cluster" {
  backend = "s3"
  config = {
    bucket = "reelmart-tf-state-632127307144"
    key    = "infra/dev/cluster.tfstate"
    region = "ap-south-1"
  }
}

locals {
  cluster_name             = data.terraform_remote_state.network.outputs.cluster_name
  ecr_repo_urls            = data.terraform_remote_state.network.outputs.ecr_repo_urls
  target_group_arns        = data.terraform_remote_state.network.outputs.target_group_arns
  task_execution_role_arn  = data.terraform_remote_state.network.outputs.task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.network.outputs.task_role_arn
  secret_arns              = data.terraform_remote_state.network.outputs.secret_arns
  alb_dns_name             = data.terraform_remote_state.network.outputs.alb_dns_name

  base_url = "http://${local.alb_dns_name}"

  # Common env vars across services
  base_env = {
    NODE_ENV         = "production"
    PORT             = tostring(var.container_port)
    ALLOWED_ORIGINS  = "*"
    PAYMENT_SERVICE_URL      = "${local.base_url}/api/payments"
    NOTIFICATION_SERVICE_URL = "${local.base_url}/api/notifications"
  }

  # JSON-keyed Secrets Manager refs: <secret-arn>:<json-key>::
  # Common secrets every service needs.
  base_secrets = [
    { name = "SUPABASE_URL",          valueFrom = "${local.secret_arns["supabase"]}:url::" },
    { name = "SUPABASE_SERVICE_KEY",  valueFrom = "${local.secret_arns["supabase"]}:service_key::" },
    { name = "SUPABASE_ANON_KEY",     valueFrom = "${local.secret_arns["supabase"]}:anon_key::" },
    { name = "INTERNAL_API_KEY",      valueFrom = "${local.secret_arns["jwt"]}:secret::" },
    { name = "JWT_SECRET",            valueFrom = "${local.secret_arns["jwt"]}:secret::" },
  ]

  razorpay_secrets = [
    { name = "RAZORPAY_KEY_ID",          valueFrom = "${local.secret_arns["razorpay"]}:key_id::" },
    { name = "RAZORPAY_KEY_SECRET",      valueFrom = "${local.secret_arns["razorpay"]}:key_secret::" },
    { name = "RAZORPAY_WEBHOOK_SECRET",  valueFrom = "${local.secret_arns["razorpay"]}:webhook_secret::" },
  ]

  shiprocket_secrets = [
    { name = "SHIPROCKET_EMAIL",    valueFrom = "${local.secret_arns["shiprocket"]}:email::" },
    { name = "SHIPROCKET_PASSWORD", valueFrom = "${local.secret_arns["shiprocket"]}:password::" },
  ]

  gupshup_secrets = [
    { name = "GUPSHUP_API_KEY",       valueFrom = "${local.secret_arns["gupshup"]}:api_key::" },
    { name = "GUPSHUP_SENDER_NUMBER", valueFrom = "${local.secret_arns["gupshup"]}:sender_number::" },
    { name = "GUPSHUP_APP_NAME",      valueFrom = "${local.secret_arns["gupshup"]}:app_name::" },
  ]

  twilio_secrets = [
    { name = "TWILIO_SID",          valueFrom = "${local.secret_arns["twilio"]}:sid::" },
    { name = "TWILIO_TOKEN",        valueFrom = "${local.secret_arns["twilio"]}:token::" },
    { name = "TWILIO_PHONE_NUMBER", valueFrom = "${local.secret_arns["twilio"]}:phone_number::" },
  ]

  firebase_secrets = [
    { name = "FIREBASE_SERVICE_ACCOUNT_JSON", valueFrom = "${local.secret_arns["firebase"]}:service_account_json::" },
  ]

  services = {
    catalog = {
      max_capacity   = 2
      extra_secrets  = []
      extra_env      = {}
    }
    order = {
      max_capacity   = 2
      extra_secrets  = []
      extra_env      = {}
    }
    payment = {
      max_capacity   = 2
      extra_secrets  = local.razorpay_secrets
      extra_env      = {}
    }
    delivery = {
      max_capacity   = 2
      extra_secrets  = local.shiprocket_secrets
      extra_env      = {}
    }
    notification = {
      max_capacity   = 2
      extra_secrets  = concat(local.twilio_secrets, local.firebase_secrets)
      extra_env      = {}
    }
    whatsapp = {
      max_capacity   = 2
      extra_secrets  = concat(local.gupshup_secrets, local.twilio_secrets)
      extra_env      = {}
    }
    payout = {
      max_capacity   = 1
      extra_secrets  = local.razorpay_secrets
      extra_env      = {}
    }
    analytics = {
      max_capacity   = 2
      extra_secrets  = []
      extra_env      = {}
    }
    return = {
      max_capacity   = 2
      extra_secrets  = []
      extra_env      = {}
    }
    admin = {
      max_capacity   = 1
      extra_secrets  = []
      extra_env      = {}
    }
  }
}

module "ecs_service" {
  source   = "../../../modules/ecs-service"
  for_each = local.services

  environment             = var.environment
  service_name            = each.key
  cluster_name            = local.cluster_name
  container_image         = "${local.ecr_repo_urls[each.key]}:${var.image_tag}"
  container_port          = var.container_port
  cpu                     = var.default_cpu
  memory                  = var.default_memory
  desired_count           = 1
  min_capacity            = 1
  max_capacity            = each.value.max_capacity
  target_group_arn        = local.target_group_arns[each.key]
  task_execution_role_arn = local.task_execution_role_arn
  task_role_arn           = local.task_role_arn

  env_vars = merge(local.base_env, each.value.extra_env)

  secret_env_refs = concat(local.base_secrets, each.value.extra_secrets)

  tags = local.common_tags
}
