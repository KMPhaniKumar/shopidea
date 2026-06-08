variable "environment" {
  type        = string
  description = "dev | prod"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR (e.g., 10.0.0.0/16)"
}

variable "azs" {
  type        = list(string)
  description = "Availability zones (must be at least 2 for ALB)"
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Public subnet CIDRs, one per AZ, in the same order as azs"
}

variable "operator_ip_cidr" {
  type        = string
  description = "Operator's public IP / CIDR allowed to SSH into EC2 (ec2-sg)"
}

variable "tags" {
  type    = map(string)
  default = {}
}
