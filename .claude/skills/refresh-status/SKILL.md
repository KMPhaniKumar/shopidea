---
name: refresh-status
description: Regenerate agents_reports/AUDIT_gaps.md so the canonical project status matches live reality. Use weekly, or after notable feature/infra changes, or when the Stop-hook reminds you.
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# Refresh the canonical status doc (`agents_reports/AUDIT_gaps.md`)

Re-derive the truth from reality, then edit the doc — **verify every claim, don't carry stale text forward.**

## Gather
1. **Backend reality**: `aws ecs describe-services --cluster reelmart-dev --services <all 10> --query 'services[].{n:serviceName,launch:launchType,run:runningCount}'` (confirm all FARGATE/running). Use **/health-check**.
2. **Migrations**: files in `reelmart/supabase/migrations/` vs columns actually present in the live DB (see **/db-migrate** probe). Note any pending.
3. **Git activity**: `git log --oneline --since="<last reviewed date>"` to see what shipped.
4. **Re-check known gaps** — for each item in the current "Pending / gaps" section, verify whether it's still true:
   - Razorpay web checkout wired? (`grep -rn "TODO: Razorpay" reelmart/apps/web`)
   - RazorpayX payouts implemented? (`reelmart/services/payout-service`)
   - `NIMBUS_AUTH_TOKEN` on delivery task def? (`aws ecs describe-task-definition --task-definition reelmart-dev-delivery --query 'taskDefinition.containerDefinitions[0].secrets[].name'`)
   - Buyer-app `EXPO_PUBLIC_RAZORPAY_KEY_ID` / `EXPO_PUBLIC_GOOGLE_MAPS_KEY` present?

## Update
Edit `agents_reports/AUDIT_gaps.md`: bump **Last reviewed** to today, move completed items out of gaps, add new gaps, correct the architecture section if anything changed. Keep it concise. Also append a dated entry to `TRACKER.md`. Don't invent — every line must reflect something you verified.
