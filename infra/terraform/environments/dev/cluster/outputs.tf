output "asg_name" {
  value = module.ec2_asg.asg_name
}

output "capacity_provider_name" {
  value = module.ec2_asg.capacity_provider_name
}

output "ami_id_used" {
  value = module.ec2_asg.ami_id_used
}
