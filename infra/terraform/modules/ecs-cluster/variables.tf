variable "cluster_name" {
  type        = string
  description = "ECS cluster name (e.g., reelmart-dev)"
}

variable "tags" {
  type    = map(string)
  default = {}
}
