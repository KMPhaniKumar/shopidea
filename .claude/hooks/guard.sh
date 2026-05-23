#!/usr/bin/env bash
# PreToolUse(Bash) guard — blocks catastrophic / irreversible / secret-leaking
# commands before they run. Exit 2 = block (message goes back to Claude).
# This is a safety net on top of the permission allow/deny lists in settings.json.

payload=$(cat)
cmd=$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception:
    print("")' 2>/dev/null)
lc=$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')

deny() {
  echo "🛑 guard.sh blocked this command: $1." >&2
  echo "   If you truly intend it, run it in a normal terminal (outside Claude) or edit .claude/hooks/guard.sh." >&2
  exit 2
}

case "$lc" in
  *"git push"*"--force"*|*"git push -f"*)                deny "git force-push" ;;
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf /*"*|*":(){"*)       deny "destructive recursive delete / fork bomb" ;;
  *"terraform destroy"*)                                  deny "terraform destroy (use targeted plan instead)" ;;
  *"aws ecs delete-cluster"*)                             deny "deleting the ECS cluster" ;;
  *"supabase db reset"*|*"drop database"*|*"drop schema"*) deny "database reset / drop" ;;
  *"aws iam delete-role"*"reelmart-gha-deploy"*)          deny "deleting the CI deploy role" ;;
esac

# Never commit an env / secrets file.
printf '%s' "$cmd" | grep -Eq 'git add[^&|;]*\.env([^a-zA-Z]|$)' && deny "adding a .env file to git"
# Protect the Terraform state bucket.
printf '%s' "$lc" | grep -Eq 'aws s3 (rb|rm)[^&|;]*reelmart-tf-state' && deny "modifying the Terraform state bucket"

exit 0
