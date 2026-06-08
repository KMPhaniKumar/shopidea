variable "services" {
  type        = list(string)
  description = "Service names; one ECR repo created per service as reelmart/<service>-service"
}

variable "tags" {
  type    = map(string)
  default = {}
}
