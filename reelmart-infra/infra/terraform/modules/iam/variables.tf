variable "environment" {
  type = string
}

variable "secret_arns" {
  type        = list(string)
  description = "Secrets Manager ARNs the task execution role may read"
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
