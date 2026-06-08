# Bootstrap (Phase 0)

One-time per AWS account. Creates the Terraform state backend (S3 + DynamoDB), the GitHub OIDC identity provider, and the IAM role that GitHub Actions assumes.

## Order of operations

1. **First apply uses local state** — the S3 backend doesn't exist yet, so we have to.
2. After apply, **migrate state to S3** by uncommenting the backend block in `backend.tf` and running `terraform init -migrate-state`.

See [`agents/01_aws_bootstrap.md`](../../agents/01_aws_bootstrap.md) for the full playbook.

## Files

- `main.tf` — resources (state bucket, lock table, OIDC provider, deploy role)
- `variables.tf` — inputs (account ID, github repo, operator IP)
- `outputs.tf` — exports the bucket name, lock table name, role ARN, OIDC provider ARN
- `backend.tf` — backend block (commented out for first apply, uncomment after)
