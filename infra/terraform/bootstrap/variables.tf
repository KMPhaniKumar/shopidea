variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "aws_account_id" {
  description = "12-digit AWS account ID"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo in <owner>/<repo> form (e.g., KMPhaniKumar/shopidea)"
  type        = string
}

variable "operator_ip_cidr" {
  description = "Operator's public IP in CIDR form (e.g., 1.2.3.4/32)"
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default = {
    Project   = "reelmart"
    ManagedBy = "terraform"
    Owner     = "platform"
  }
}
