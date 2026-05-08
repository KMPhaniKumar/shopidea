# Phase 0 — AWS Account Bootstrap

> One-time setup so Terraform can run safely. Idempotent: re-running is a no-op.

## Goal
A clean AWS account in `ap-south-1` with:
- Terraform remote state backend (S3 + DynamoDB)
- GitHub OIDC identity provider
- IAM role for GitHub Actions (`reelmart-gha-deploy`)
- IAM user (or SSO profile) for local Terraform operator
- Billing alerts

## Prerequisites
None. This is the first phase.

## Inputs (collect before starting)
- `AWS_ACCOUNT_ID` — 12-digit account ID
- `OPERATOR_IP_CIDR` — your public IP / 32 (`curl ifconfig.me`)
- `GITHUB_REPO` — `<owner>/<repo>` (e.g., `KMPhaniKumar/shopidea`)
- `EMAIL_FOR_ALERTS` — billing + alarms email

## Steps

### 0.1 — Lock down the root user (manual, AWS Console)
1. Sign in as root.
2. IAM → Security credentials → enable MFA on root.
3. IAM → Users → create `terraform-admin` (programmatic + console).
   - Attach managed policy `AdministratorAccess` (we'll narrow later).
   - Enable MFA.
   - Generate access key. **Save** to `~/.aws/credentials` as profile `reelmart-admin`.
4. Sign out of root. Use only `terraform-admin` from here on.
5. Region: pin to `ap-south-1` in the console.

### 0.2 — Configure local AWS CLI
```bash
aws configure --profile reelmart-admin
# AWS Access Key ID:     <from step 0.1>
# AWS Secret Access Key: <from step 0.1>
# Default region:        ap-south-1
# Default output:        json

export AWS_PROFILE=reelmart-admin
aws sts get-caller-identity   # confirm you're the right user
```

### 0.3 — Set billing alerts (manual, AWS Console)
- Billing → Budgets → create budget `reelmart-dev`, $50/mo, alert at 80% to `EMAIL_FOR_ALERTS`.
- Repeat with `reelmart-prod`, $200/mo, when prod cutover happens.

### 0.4 — Apply the bootstrap Terraform (creates state backend + OIDC + roles)
The bootstrap module is intentionally minimal and uses **local state** initially. After it applies, we migrate the bootstrap's own state to S3.

```bash
cd infra/terraform/bootstrap

# Inspect inputs
cat variables.tf

# Set values
cat > terraform.tfvars <<EOF
aws_account_id    = "${AWS_ACCOUNT_ID}"
github_repo       = "${GITHUB_REPO}"
operator_ip_cidr  = "${OPERATOR_IP_CIDR}/32"
EOF

terraform init       # local backend
terraform plan
terraform apply      # type "yes"
```

### 0.5 — Migrate bootstrap state to S3 (so it's not on a laptop)
```bash
# Edit infra/terraform/bootstrap/backend.tf — uncomment the S3 backend block
# (the values were printed by Phase 0.4 outputs)

terraform init -migrate-state
# Confirm copy: type "yes"
```

### 0.6 — Verify outputs
```bash
terraform output

# Expected:
#   tf_state_bucket          = "reelmart-tf-state-<acct-id>"
#   tf_lock_table            = "reelmart-tf-locks"
#   gha_deploy_role_arn      = "arn:aws:iam::<acct-id>:role/reelmart-gha-deploy"
#   github_oidc_provider_arn = "arn:aws:iam::<acct-id>:oidc-provider/token.actions.githubusercontent.com"
```

## Deliverables
- S3 bucket: `reelmart-tf-state-<acct-id>` (versioning ON, encrypted, public access blocked)
- DynamoDB table: `reelmart-tf-locks` (LockID = HASH)
- OIDC provider: `token.actions.githubusercontent.com`
- IAM role: `reelmart-gha-deploy` (trusted by GitHub OIDC, scoped to ECR + ECS + Secrets read)
- IAM role: `reelmart-tf-operator` (assumed by `terraform-admin` user; full admin in our account)

## Validation
```bash
# State bucket exists, versioned, encrypted
aws s3api head-bucket --bucket reelmart-tf-state-${AWS_ACCOUNT_ID}
aws s3api get-bucket-versioning --bucket reelmart-tf-state-${AWS_ACCOUNT_ID} --query Status
# → "Enabled"

# Lock table exists
aws dynamodb describe-table --table-name reelmart-tf-locks --query Table.TableStatus
# → "ACTIVE"

# OIDC provider exists
aws iam list-open-id-connect-providers
# → contains token.actions.githubusercontent.com

# Deploy role assumable from GitHub
aws iam get-role --role-name reelmart-gha-deploy --query Role.AssumeRolePolicyDocument
# → contains the OIDC trust with sub == "repo:${GITHUB_REPO}:*"
```

## Common pitfalls
- **Region mismatch.** Always check `aws configure get region` returns `ap-south-1` before any `terraform apply`.
- **OIDC trust too loose.** The role's trust policy must restrict by `sub` to your repo (`repo:<owner>/<repo>:*`); without that any GitHub repo could assume it.
- **State bucket not encrypted.** SSE-S3 default is fine; KMS not needed at this scale.
- **Public access not blocked.** All four `BlockPublicAccess` flags must be true. Bootstrap module enforces this.
- **terraform-admin keys committed by accident.** They live in `~/.aws/credentials`, not in the repo. Never paste them into a `.tfvars`.
- **MFA delete on the bucket.** Don't enable — it makes Terraform unable to update the bucket without a TOTP code.

## Rollback
```bash
# Empty the state bucket first (versioned, so this needs --force)
aws s3 rm s3://reelmart-tf-state-${AWS_ACCOUNT_ID} --recursive
aws s3api delete-objects --bucket reelmart-tf-state-${AWS_ACCOUNT_ID} \
  --delete "$(aws s3api list-object-versions --bucket reelmart-tf-state-${AWS_ACCOUNT_ID} \
    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}')"

cd infra/terraform/bootstrap
terraform destroy
```

## Next: Phase 1
After validation passes, hand off to `02_network_ecs.md`.
