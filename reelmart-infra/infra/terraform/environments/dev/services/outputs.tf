output "service_arns" {
  value = { for k, m in module.ecs_service : k => m.service_arn }
}

output "task_definition_arns" {
  value = { for k, m in module.ecs_service : k => m.task_definition_arn }
}
