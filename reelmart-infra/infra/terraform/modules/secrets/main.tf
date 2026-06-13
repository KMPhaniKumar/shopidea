resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)

  name                    = "reelmart/${var.environment}/${each.key}"
  description             = "ReelMart ${var.environment} – ${each.key} credentials"
  recovery_window_in_days = 7 # 7-day recovery window (avoids instant unrecoverable deletion)
  tags                    = merge(var.tags, { Name = "reelmart/${var.environment}/${each.key}", Concern = each.key })
}
