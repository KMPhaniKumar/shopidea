# First apply: leave this file as-is (no backend block = local state).
# After the first apply succeeds, uncomment the block below and run:
#   terraform init -migrate-state

terraform {
  backend "s3" {
    bucket         = "reelmart-tf-state-632127307144"
    key            = "infra/bootstrap.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "reelmart-tf-locks"
    encrypt        = true
  }
}
