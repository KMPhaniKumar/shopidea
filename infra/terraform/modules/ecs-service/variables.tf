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

variable "target_group_arn" {
  type = string
}

variable "task_execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "log_group_name" {
  type    = string
  default = ""
  description = "Unused since CloudWatch was disabled; kept for backward compat. Remove once all callers stop passing it."
}

variable "log_region" {
  type    = string
  default = "ap-south-1"
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
