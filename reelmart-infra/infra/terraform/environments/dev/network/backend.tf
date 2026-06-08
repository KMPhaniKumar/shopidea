terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }

  backend "s3" {
    bucket         = "reelmart-tf-state-632127307144"
    key            = "infra/dev/network.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "reelmart-tf-locks"
    encrypt        = true
  }
}
