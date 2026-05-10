locals {
  full_name = "reelmart-${var.environment}-${var.service_name}"
}

# ─── Task Definition ──────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "this" {
  family             = local.full_name
  network_mode       = "bridge"
  cpu                = var.cpu
  memory             = var.memory
  execution_role_arn = var.task_execution_role_arn
  task_role_arn      = var.task_role_arn
  requires_compatibilities = ["EC2"]

  container_definitions = jsonencode([
    {
      name              = var.service_name
      image             = var.container_image
      essential         = true
      cpu               = var.cpu
      memoryReservation = var.memory

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = 0 # dynamic — ALB target group uses bridge mode + dynamic ports
          protocol      = "tcp"
        }
      ]

      environment = [
        for k, v in var.env_vars : { name = k, value = v }
      ]

      secrets = var.secret_env_refs

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.log_region
          awslogs-stream-prefix = var.service_name
        }
      }
    }
  ])

  tags = merge(var.tags, { Name = local.full_name, Service = var.service_name })
}

# ─── ECS Service ──────────────────────────────────────────────────────────────

resource "aws_ecs_service" "this" {
  name            = "${var.service_name}-service"
  cluster         = var.cluster_name
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "EC2"

  health_check_grace_period_seconds = var.health_check_grace_period_seconds

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }

  ordered_placement_strategy {
    type  = "binpack"
    field = "memory"
  }

  lifecycle {
    ignore_changes = [desired_count] # let auto-scaling drive it
  }

  tags = merge(var.tags, { Name = local.full_name, Service = var.service_name })
}

# ─── Application Auto Scaling ─────────────────────────────────────────────────

resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_capacity
  max_capacity       = var.max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.full_name}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.scale_target_cpu
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
