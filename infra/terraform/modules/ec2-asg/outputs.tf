output "asg_name" {
  value = aws_autoscaling_group.this.name
}

output "asg_arn" {
  value = aws_autoscaling_group.this.arn
}

output "launch_template_id" {
  value = aws_launch_template.this.id
}

output "instance_profile_arn" {
  value = aws_iam_instance_profile.ec2.arn
}

output "capacity_provider_name" {
  value = aws_ecs_capacity_provider.this.name
}

output "ami_id_used" {
  value = local.ecs_ami_id
}
