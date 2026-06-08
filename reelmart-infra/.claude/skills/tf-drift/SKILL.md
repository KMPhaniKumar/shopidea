---
name: tf-drift
description: Detect Terraform drift for ReelMart infra (network / cluster / services layers) and summarize. Read-only — never applies. Use to check infra state or before/after an infra change.
allowed-tools: Bash, Read
---

# Terraform drift check — ReelMart infra

IaC lives in `infra/terraform/environments/dev/{network,cluster,services}` (S3 backend `reelmart-tf-state-632127307144`, locks in DynamoDB). **Infra changes go through Terraform, not raw AWS CLI** — that's how drift gets introduced.

## Steps
1. **Creds**: `aws sts get-caller-identity` (run **/aws-session** if expired).
2. For each layer in order `network`, then `cluster`, then `services` (services reads network's remote-state outputs):
   ```bash
   cd infra/terraform/environments/dev/<layer>
   terraform init -input=false
   terraform plan -no-color -input=false
   ```
3. **Summarize** per layer: report `No changes` (clean) or the `Plan: A to add, C to change, D to destroy` line plus which resources. **Flag any `must be replaced` or `to destroy`** — those need human review (could mean drift or a risky change).

## If asked to apply
- Save and review a plan first: `terraform plan -out=tfplan`, show the diff, then `terraform apply tfplan`.
- `terraform apply -auto-approve` and `terraform destroy` are **blocked** by settings/guard — keep it that way.
- Reconciling resources changed outside TF: `terraform import` the live resource / `terraform state rm` the gone one until `plan` is clean (these don't change live infra). See the recent EC2→Fargate reconciliation for the pattern.
