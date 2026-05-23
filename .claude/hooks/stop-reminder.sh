#!/usr/bin/env bash
# Stop hook — if code/infra changed this session but the canonical status doc
# (agents/AUDIT_gaps.md) wasn't touched, nudge to keep it current. Non-blocking.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
changed=$(git diff --name-only HEAD 2>/dev/null)
[ -z "$changed" ] && exit 0
printf '%s\n' "$changed" | grep -Eq '^(reelmart/|infra/)' || exit 0
printf '%s\n' "$changed" | grep -q 'agents/AUDIT_gaps.md' && exit 0

echo "📝 Reminder: code/infra changed but agents/AUDIT_gaps.md didn't. If features/architecture/gaps changed, run /refresh-status (or update it) so the canonical doc stays accurate." >&2
exit 0
