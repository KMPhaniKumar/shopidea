resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)

  name                    = "reelmart/${var.environment}/${each.key}"
  description             = "ReelMart ${var.environment} – ${each.key} credentials"
  recovery_window_in_days = 0 # easy to delete in dev; raise for prod
  tags                    = merge(var.tags, { Name = "reelmart/${var.environment}/${each.key}", Concern = each.key })
}
