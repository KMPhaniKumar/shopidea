---
name: aws-session
description: Check or refresh AWS credentials for ReelMart ops. Use when AWS CLI commands fail with ExpiredToken / could-not-connect, before any deploy or terraform work.
allowed-tools: Bash
---

# AWS session — ReelMart (account `632127307144`, region `ap-south-1`)

Access is **AWS SSO** (`AWSAdministratorAccess`); sessions are temporary (~1h) and expire often.

1. **Check**: `aws sts get-caller-identity` (add `--profile <profile>` if you use one). Success ⇒ good to go.
2. **If `ExpiredToken`** (or `Could not connect` right after): refresh SSO:
   ```bash
   aws sso login --profile reelmart-admin
   ```
   then use `export AWS_PROFILE=reelmart-admin AWS_REGION=ap-south-1` for subsequent commands.
3. Re-run `aws sts get-caller-identity` to confirm.

## Rules
- **Never paste long-lived AWS keys into the chat** — they end up in the transcript. Use SSO.
- **Unattended automation must NOT use your session.** CI / scheduled jobs assume the GitHub OIDC role `arn:aws:iam::632127307144:role/reelmart-gha-deploy` (already configured; GitHub secret `AWS_DEPLOY_ROLE_ARN` points to it).
- A transient `Could not connect to the endpoint URL` is usually a network blip — retry once before assuming an auth problem.
