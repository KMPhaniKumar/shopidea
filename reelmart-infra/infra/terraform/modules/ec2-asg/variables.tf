variable "environment" {
  type = string
}

variable "cluster_name" {
  type        = string
  description = "ECS cluster name to register instances into"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs across at least 2 AZs"
}

variable "security_group_id" {
  type        = string
  description = "ec2-sg from network module"
}

variable "key_pair_name" {
  type        = string
  description = "EC2 key pair name; leave empty to skip key pair (use SSM Session Manager for shell access)"
  default     = ""
}

variable "min_size" {
  type    = number
  default = 1
}

variable "max_size" {
  type    = number
  default = 3
}

variable "desired_capacity" {
  type    = number
  default = 1
}

variable "root_volume_size_gb" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
