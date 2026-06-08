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

variable "use_fargate_spot" {
  type        = bool
  default     = true
  description = "Run dev services on FARGATE_SPOT (~70% cheaper compute; may be briefly interrupted)."
}

variable "enable_scheduled_shutdown" {
  type        = bool
  default     = true
  description = "Scale dev services to 0 overnight (down at shutdown_schedule, up at startup_schedule)."
}

variable "shutdown_schedule" {
  type        = string
  default     = "cron(0 22 * * ? *)" # 22:00 IST daily
  description = "Cron to scale dev to 0 (interpreted in schedule_timezone)."
}

variable "startup_schedule" {
  type        = string
  default     = "cron(0 8 * * ? *)" # 08:00 IST daily
  description = "Cron to scale dev back up (interpreted in schedule_timezone)."
}

variable "schedule_timezone" {
  type        = string
  default     = "Asia/Kolkata"
  description = "IANA timezone for the scheduled scale actions."
}
