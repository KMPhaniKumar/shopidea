---
name: db-migrate
description: Check which Supabase migrations are actually applied vs pending for ReelMart, and apply pending ones safely. Use before relying on new columns/tables or when schema looks out of sync.
allowed-tools: Bash, Read
---

# Supabase migrations — ReelMart (project `nysgwdpmpxqmfwelfaxo`)

Migration files: `reelmart/supabase/migrations/NNN_*.sql` (001 … latest).

**⚠️ GOTCHA:** migrations have been applied **out of order** before — e.g. 016/017/018 were live while **014/015/019/020 were NOT**. Never assume sequential. The migration-history table isn't exposed via the API, so **detect applied state by probing live columns**.

## Detect what's actually applied
Run a quick probe with the service key (read from `reelmart/services/.env` is blocked by policy — instead use the values already in the environment or ask the user). Probe key columns, e.g. for the `stores` table check: `approval_status` (015), `address`/`state` (014), `pickup_status` (019), `pan_number`/`selfie_path` (020). A missing column ⇒ that migration is pending.

```bash
node --input-type=module -e '
import {createClient} from "@supabase/supabase-js";
const db=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
for (const c of ["approval_status","address","state","pickup_status","pan_number","selfie_path"]) {
  const {error}=await db.from("stores").select(c).limit(1);
  console.log((error?"MISSING ":"present "), c);
}'
```
(run from `reelmart/apps/web` so `@supabase/supabase-js` resolves; pass SUPABASE_URL/SERVICE_KEY inline.)

## Apply pending migrations
All ReelMart migrations are **additive & idempotent** (`ADD COLUMN IF NOT EXISTS`), safe to re-run. Two options:
1. **Supabase SQL editor** (most reliable): paste each pending file in order. Avoids CLI config issues.
2. **CLI**: `cd reelmart && supabase db push`. Note: `supabase` CLI may fail on a `config.toml` `SMS_HOOK_SECRET` validation — set a dummy `SMS_HOOK_SECRET` env or fix config first.

Then **re-run the probe** to confirm the columns now exist. Update `agents/AUDIT_gaps.md` if the migration-status section changes.

**Never** run destructive SQL (DROP/reset) — the guard hook blocks `supabase db reset`.
