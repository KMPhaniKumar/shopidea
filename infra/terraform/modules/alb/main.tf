# Phase 1 ALB: HTTP-only with path-based routing to 10 target groups.
# Phase 5 layers HTTPS on top: cert via ACM, HTTPS listener takes the rules,
# HTTP listener becomes a 301 redirect.
#
# We can't pre-create the HTTPS listener here because AWS rejects HTTPS
# listeners without a validated certificate.

locals {
  name = "reelmart-${var.environment}"
}

resource "aws_lb" "this" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.subnet_ids
  idle_timeout       = 60
  tags               = merge(var.tags, { Name = "${local.name}-alb" })
}

resource "aws_lb_target_group" "service" {
  for_each = var.services

  name        = "${local.name}-tg-${each.key}"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = var.vpc_id

  health_check {
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-299"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = merge(var.tags, { Name = "${local.name}-tg-${each.key}", Service = each.key })
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "ReelMart API — route not found"
      status_code  = "503"
    }
  }

  tags = merge(var.tags, { Name = "${local.name}-http" })
}

resource "aws_lb_listener_rule" "service" {
  for_each = var.services

  listener_arn = aws_lb_listener.http.arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }

  condition {
    path_pattern {
      values = [each.value.path]
    }
  }

  tags = merge(var.tags, { Service = each.key })
}
