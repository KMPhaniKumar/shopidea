variable "environment" {
  type    = string
  default = "dev"
}

variable "image_tag" {
  type        = string
  default     = "dev-latest"
  description = "Container image tag to deploy across services"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "default_cpu" {
  type    = number
  default = 256
}

variable "default_memory" {
  type    = number
  default = 384
}

variable "log_region" {
  type    = string
  default = "ap-south-1"
}
