locals {
  full_name = "reelmart-${var.environment}-${var.service_name}"
  log_group = "/ecs/reelmart-${var.environment}-${var.service_name}"
}

# ─── CloudWatch Logs (required for Fargate) ───────────────────────────────────

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group
  retention_in_days = 14
  tags              = merge(var.tags, { Name = local.full_name, Service = var.service_name })
}

# ─── Task Definition (Fargate / awsvpc) ───────────────────────────────────────

resource "aws_ecs_task_definition" "this" {
  family                   = local.full_name
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn
  requires_compatibilities = ["FARGATE"]

  container_definitions = jsonencode([
    {
      name      = var.service_name
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
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
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.log_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = merge(var.tags, { Name = local.full_name, Service = var.service_name })
}

# ─── ECS Service (Fargate) ────────────────────────────────────────────────────

resource "aws_ecs_service" "this" {
  name            = "${var.service_name}-service"
  cluster         = var.cluster_name
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = var.health_check_grace_period_seconds

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = var.service_name
    container_port   = var.container_port
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
