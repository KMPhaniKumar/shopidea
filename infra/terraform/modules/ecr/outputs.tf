output "repo_urls" {
  value = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "repo_arns" {
  value = { for k, r in aws_ecr_repository.service : k => r.arn }
}

output "repo_names" {
  value = { for k, r in aws_ecr_repository.service : k => r.name }
}
