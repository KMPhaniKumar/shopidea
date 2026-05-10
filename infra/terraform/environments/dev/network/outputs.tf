output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "alb_security_group_id" {
  value = module.network.alb_security_group_id
}

output "ec2_security_group_id" {
  value = module.network.ec2_security_group_id
}

output "ecs_security_group_id" {
  value = module.network.ecs_security_group_id
}

output "alb_arn" {
  value = module.alb.alb_arn
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "alb_zone_id" {
  value = module.alb.alb_zone_id
}

output "alb_arn_suffix" {
  value = module.alb.alb_arn_suffix
}

output "http_listener_arn" {
  value = module.alb.http_listener_arn
}

output "target_group_arns" {
  value = module.alb.target_group_arns
}

output "target_group_arn_suffixes" {
  value = module.alb.target_group_arn_suffixes
}

output "cluster_name" {
  value = module.cluster.cluster_name
}

output "cluster_arn" {
  value = module.cluster.cluster_arn
}

output "ecr_repo_urls" {
  value = module.ecr.repo_urls
}

output "ecr_repo_names" {
  value = module.ecr.repo_names
}

output "task_execution_role_arn" {
  value = module.iam.task_execution_role_arn
}

output "task_role_arn" {
  value = module.iam.task_role_arn
}

output "secret_arns" {
  value = module.secrets.secret_arns
}

output "log_group_names" {
  value = { for k, lg in aws_cloudwatch_log_group.service : k => lg.name }
}

output "services" {
  value = local.services
}

output "acm_cert_arn" {
  value = aws_acm_certificate.api.arn
}

output "acm_validation_records" {
  description = "Add these CNAME records at the domain registrar to validate the ACM certificate."
  value = {
    for opt in aws_acm_certificate.api.domain_validation_options :
    opt.domain_name => {
      name  = opt.resource_record_name
      type  = opt.resource_record_type
      value = opt.resource_record_value
    }
  }
}
