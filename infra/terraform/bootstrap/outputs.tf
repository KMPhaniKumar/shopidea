output "tf_state_bucket" {
  description = "S3 bucket name for Terraform remote state"
  value       = aws_s3_bucket.tf_state.bucket
}

output "tf_lock_table" {
  description = "DynamoDB table name for state locks"
  value       = aws_dynamodb_table.tf_locks.name
}

output "github_oidc_provider_arn" {
  description = "OIDC provider ARN for GitHub Actions"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "gha_deploy_role_arn" {
  description = "Role assumed by GitHub Actions via OIDC"
  value       = aws_iam_role.gha_deploy.arn
}

output "next_steps" {
  description = "What to do after the first apply"
  value       = <<-EOT
    1. Uncomment the backend block in backend.tf with these values:
         bucket         = "${aws_s3_bucket.tf_state.bucket}"
         key            = "infra/bootstrap.tfstate"
         region         = "${var.aws_region}"
         dynamodb_table = "${aws_dynamodb_table.tf_locks.name}"
         encrypt        = true
    2. Run: terraform init -migrate-state
    3. Confirm: yes
    4. Move on to Phase 1 (agents/02_network_ecs.md)
  EOT
}
