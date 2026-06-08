variable "environment" {
  type    = string
  default = "dev"
}

variable "ec2_instance_type" {
  type    = string
  default = "t3.small"
}

variable "ec2_key_pair_name" {
  type    = string
  default = ""
}

variable "asg_min" {
  type    = number
  default = 1
}

variable "asg_max" {
  type    = number
  default = 3
}

variable "asg_desired" {
  type    = number
  default = 1
}
