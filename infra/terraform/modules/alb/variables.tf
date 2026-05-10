variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type        = list(string)
  description = "At least 2 public subnets in different AZs"
}

variable "security_group_id" {
  type        = string
  description = "alb-sg from network module"
}

variable "services" {
  description = "Map of service name → { path = path-pattern, priority = listener rule priority }"
  type = map(object({
    path     = string
    priority = number
  }))
}

variable "health_check_path" {
  type    = string
  default = "/health"
}

variable "cert_arn" {
  type        = string
  default     = null
  description = "ACM certificate ARN. When set, an HTTPS listener is created and HTTP listener becomes a 301 redirect to HTTPS. When null, ALB stays HTTP-only (Phase 1 behavior)."
}

variable "ssl_policy" {
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  description = "TLS policy for HTTPS listener. Default supports TLS 1.2/1.3."
}

variable "tags" {
  type    = map(string)
  default = {}
}
