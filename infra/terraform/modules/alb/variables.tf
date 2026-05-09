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

variable "tags" {
  type    = map(string)
  default = {}
}
