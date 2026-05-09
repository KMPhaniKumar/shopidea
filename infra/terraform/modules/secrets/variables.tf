variable "environment" {
  type = string
}

variable "secret_names" {
  type        = list(string)
  description = "Bare names; container path will be reelmart/<env>/<name>"
  default     = ["supabase", "razorpay", "gupshup", "twilio", "shiprocket", "firebase", "jwt"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
