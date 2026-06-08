variable "environment" {
  type = string
}

variable "service_name" {
  type        = string
  description = "Bare service name, e.g., 'catalog' (resources become reelmart-<env>-<service>)"
}

variable "cluster_name" {
  type = string
}

variable "container_image" {
  type        = string
  description = "Full image URI including tag (e.g., 632127307144.dkr.ecr.ap-south-1.amazonaws.com/reelmart/catalog-service:dev-latest)"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "min_capacity" {
  type    = number
  default = 1
}

variable "max_capacity" {
  type    = number
  default = 2
}

variable "use_fargate_spot" {
  type        = bool
  default     = false
  description = "Run the service on FARGATE_SPOT (~70% cheaper, may be interrupted) instead of on-demand FARGATE. Suitable for dev."
}

variable "enable_scheduled_shutdown" {
  type        = bool
  default     = false
  description = "Scale the service to 0 tasks overnight on a schedule, then back up in the morning (dev cost saving)."
}

variable "shutdown_schedule" {
  type        = string
  default     = "cron(0 22 * * ? *)"
  description = "Application Auto Scaling cron for scaling to 0 (interpreted in schedule_timezone)."
}

variable "startup_schedule" {
  type        = string
  default     = "cron(0 8 * * ? *)"
  description = "Application Auto Scaling cron for scaling back up (interpreted in schedule_timezone)."
}

variable "schedule_timezone" {
  type        = string
  default     = "Asia/Kolkata"
  description = "IANA timezone for the scheduled scale actions."
}

variable "target_group_arn" {
  type = string
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnets for the Fargate task ENIs (awsvpc)."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups for the Fargate task ENIs."
}

variable "assign_public_ip" {
  type        = bool
  default     = true
  description = "Public IP on the task ENI (required to reach ECR/internet without a NAT)."
}

variable "task_execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "log_group_name" {
  type        = string
  default     = ""
  description = "Unused since CloudWatch was disabled; kept for backward compat. Remove once all callers stop passing it."
}

variable "log_region" {
  type        = string
  default     = "ap-south-1"
  description = "Unused since CloudWatch was disabled; kept for backward compat."
}

variable "env_vars" {
  description = "Plain environment variables (key → value)"
  type        = map(string)
  default     = {}
}

variable "secret_env_refs" {
  description = "Environment variables sourced from Secrets Manager. valueFrom can be a secret ARN, optionally with :json-key:: suffix."
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "health_check_grace_period_seconds" {
  type    = number
  default = 60
}

variable "scale_target_cpu" {
  type    = number
  default = 60
}

variable "tags" {
  type    = map(string)
  default = {}
}
