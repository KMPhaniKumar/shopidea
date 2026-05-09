locals {
  name = "reelmart-${var.environment}"
}

# ─── Latest ECS-optimized AL2023 AMI via SSM Parameter Store ──────────────────

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended"
}

locals {
  ecs_ami_id = nonsensitive(jsondecode(data.aws_ssm_parameter.ecs_ami.value).image_id)
}

# ─── IAM: EC2 instance profile (ECS agent + SSM + CW agent) ───────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "ec2_ecs" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_cw_agent" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-instance-profile"
  role = aws_iam_role.ec2.name
}

# ─── Launch Template ──────────────────────────────────────────────────────────

locals {
  user_data = base64encode(<<-EOT
    #!/bin/bash
    echo "ECS_CLUSTER=${var.cluster_name}" >> /etc/ecs/ecs.config
    echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config
    echo "ECS_CONTAINER_STOP_TIMEOUT=30s" >> /etc/ecs/ecs.config
  EOT
  )
}

resource "aws_launch_template" "this" {
  name_prefix   = "${local.name}-ec2-lt-"
  image_id      = local.ecs_ami_id
  instance_type = var.instance_type
  key_name      = var.key_pair_name == "" ? null : var.key_pair_name

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  vpc_security_group_ids = [var.security_group_id]

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    http_endpoint               = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_size_gb
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = false
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(var.tags, { Name = "${local.name}-ec2", AmazonECSManaged = "true" })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = merge(var.tags, { Name = "${local.name}-ec2-vol" })
  }

  user_data = local.user_data

  lifecycle {
    create_before_destroy = true
  }
}

# ─── Auto Scaling Group ───────────────────────────────────────────────────────

resource "aws_autoscaling_group" "this" {
  name_prefix         = "${local.name}-ec2-asg-"
  vpc_zone_identifier = var.subnet_ids
  min_size            = var.min_size
  max_size            = var.max_size
  desired_capacity    = var.desired_capacity

  health_check_type         = "EC2"
  health_check_grace_period = 60
  capacity_rebalance        = true

  launch_template {
    id      = aws_launch_template.this.id
    version = "$Latest"
  }

  # Capacity provider managed scaling needs this exact tag on the ASG.
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = var.tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.name}-ec2"
    propagate_at_launch = true
  }

  # Capacity provider also handles instance termination on scale-in.
  protect_from_scale_in = false

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_capacity] # capacity provider's managed scaling drives this
  }
}

# ─── ECS Capacity Provider linked to the ASG ──────────────────────────────────

resource "aws_ecs_capacity_provider" "this" {
  name = "${local.name}-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.this.arn
    managed_termination_protection = "DISABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 2
      instance_warmup_period    = 120
    }
  }

  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = var.cluster_name
  capacity_providers = [aws_ecs_capacity_provider.this.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.this.name
    base              = 1
    weight            = 1
  }
}

# ─── ASG-level CPU target tracking (cluster sizes via tasks; this is an extra safety net) ──

resource "aws_autoscaling_policy" "cpu_target" {
  name                   = "${local.name}-asg-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.this.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60
  }
}
