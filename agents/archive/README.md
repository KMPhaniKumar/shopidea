# Archive — historical build guides

These are the **original step-by-step guides** used to *build* ReelMart (features, microservices, AWS infra). The platform is now built and deployed, so they are kept only for history. **They contain stale assumptions** (e.g. Shiprocket, Railway, a `reelmart/backend` monolith, Supabase-Phone OTP) and must **not** be treated as current.

For the current truth, use:
- [`agents/AUDIT_gaps.md`](../AUDIT_gaps.md) — canonical status (architecture, features, gaps, test accounts)
- [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) + nested `CLAUDE.md` files (services / infra / web)
- [`MAINTENANCE.md`](../../MAINTENANCE.md) — skills, agents, guardrails, CI

Contents: `agent_*.md` (feature build order), `microservices/ms_*.md` (service split), `infra-build-guides/` (original AWS bring-up), `00_master_agent_guide.md`, `SUPABASE_COMPLETE_AUDIT.md` (point-in-time schema snapshot).
