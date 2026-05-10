# ALB with two modes:
#   - cert_arn = null  → HTTP-only on :80 (Phase 1 default; rules live on HTTP listener)
#   - cert_arn set     → HTTPS on :443 with rules; HTTP redirects 301 → HTTPS

locals {
  name      = "reelmart-${var.environment}"
  https_on  = var.cert_arn != null
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
    type = local.https_on ? "redirect" : "fixed-response"

    dynamic "redirect" {
      for_each = local.https_on ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "fixed_response" {
      for_each = local.https_on ? [] : [1]
      content {
        content_type = "text/plain"
        message_body = "ReelMart API — route not found"
        status_code  = "503"
      }
    }
  }

  tags = merge(var.tags, { Name = "${local.name}-http" })
}

resource "aws_lb_listener" "https" {
  count             = local.https_on ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.cert_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "ReelMart API — route not found"
      status_code  = "503"
    }
  }

  tags = merge(var.tags, { Name = "${local.name}-https" })
}

resource "aws_lb_listener_rule" "service" {
  for_each = var.services

  listener_arn = local.https_on ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
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
