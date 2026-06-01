# W-06 — Supabase cutover (founder-only steps)

> **Source**: W-06 of `docs/archive/pryzm3-internal/reference/phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`
> **Status (engineering)**: SHIPPED — migration + checklist enforcer + dual-write seam.
> **Status (provisioning)**: PENDING founder action.
> **Authority**: ADR-0035 (soft-locks + cutover), ADR-0040 (authz).

---

## §0 What ships in W-06 (engineering — DONE)

The agent shipped:

| Artefact | Path |
|---|---|
| Combined SQL migration for the 5 Phase-2 schemas | `apps/sync-server/migrations/001_phase2_supabase.sql` |
| Cutover-checklist enforcer (D5 destructive actions are gated) | `scripts/cutover-checklist.mjs` |
| This document — the founder's runbook | `apps/bench/reports/W-06-COMPLETION.md` |
| `M24-beta.md` §3 row updated to reflect cutover artefacts ready | `apps/bench/reports/M24-beta.md` |

The migration is idempotent (`CREATE … IF NOT EXISTS`) and wrapped in a single
transaction.  The checklist enforcer refuses to run the destructive D5 actions
unless the restore-verify streak has been green for ≥ 14 nights.

---

## §1 What the founder must do (NOT engineering work)

### Step 1 — Provision the Supabase project

Founder action.  Out of scope for the agent.  Suggested:

* Region: `us-east-1` (R2 colocation per ADR-016).
* Plan: Pro (so we get pgbouncer + 14-day point-in-time recovery).
* Capture the URL + service-role key + anon key.

### Step 2 — Set Replit secrets

Use the Replit secrets panel.  **Do NOT commit any of these to the repo.**

| Secret | Where used |
|---|---|
| `SUPABASE_URL` | sync-server REST + auth |
| `SUPABASE_ANON_KEY` | sync-client public APIs (Phase 3C) |
| `SUPABASE_SERVICE_ROLE_KEY` | sync-server server-to-server |
| `DATABASE_URL` (Postgres URI) | sync-server event log + soft-locks + authz |

Once the secrets are set, run:

```sh
node scripts/cutover-checklist.mjs --step provision-check
node scripts/cutover-checklist.mjs --step connectivity
```

Both must report `PASS`.

### Step 3 — Apply the migration

```sh
node scripts/cutover-checklist.mjs --step apply-migration
```

(Equivalent to `psql "$DATABASE_URL" -f apps/sync-server/migrations/001_phase2_supabase.sql`.)

The migration is idempotent.  Re-running is safe.

### Step 4 — Engage dual-write

Set `SYNC_EVENT_LOG=pg` in the deployed sync-server env (Replit secrets).  The
in-memory event log remains the dev/test default; the PG path engages only
when this is set.

```sh
node scripts/cutover-checklist.mjs --step dual-write-on
```

### Step 5 — Start the burn-in clock

Set `PRYZM_RESTORE_VERIFY_WIRED=true` in the deployed env so the
`restore-verify.bench.ts` bench runs against real Supabase rather than
returning the deferred sentinel.  The streak counter writes to
`.local/restore-verify-streak.json` per ADR-0036.

The first night counts as `streak=1`.  Re-run nightly via cron / GitHub
Actions schedule.

### Step 6 — Burn-in status (every morning)

```sh
node scripts/cutover-checklist.mjs --step burn-in-status
```

Look for `streak: N` and the corresponding date.  Once `N ≥ 14`, step 6 will
PASS.

### Step 7 — Run the destructive D5 actions

Only after step 5 PASSes:

```sh
node scripts/cutover-checklist.mjs --step d5-actions --execute
```

The enforcer prints each action; the `--execute` flag is reserved for the
founder.  Five destructive actions:

1. `DROP TABLE project_command_log;` (Replit-PG legacy)
2. Decommission Replit-PG add-on.
3. Gate the in-memory event-log fallback on `NODE_ENV !== "production"`
   (one-line edit in `apps/sync-server/src/eventLog/createEventLog.ts`).
4. Delete `src/snapping/` (PRYZM 1 dead code, per S61 D5).
5. `git tag m24-cutover-burn-in-complete && git push --tags`.

### Step 8 — Update M24-beta.md

Flip §3 row "Supabase cutover" from `[ ]` to `[x]` with the burn-in
completion date and the tagged commit hash.

---

## §2 Rollback

The cutover-checklist enforcer is the rollback safeguard — by design,
nothing irreversible happens until burn-in clears.  If something fails
during burn-in, set `SYNC_EVENT_LOG=memory` and Replit-PG remains the
source of truth.  Engineering effort to invert the dual-write is < 1
hour; founder effort is just flipping the secret.

---

## §3 Why this exists outside the engineering tracks

W-06 is one of two items in the entire Phase-2 close plan that engineering
cannot complete on its own (the other is W-21 — sub-phase demo recordings,
also founder-only).  Provisioning Supabase requires an account, a billing
relationship, and a 14-day calendar window — none of which the agent can
take action on.

The agent's deliverable is the **infrastructure to safely cut over**, which
ships in this PR.  The cutover itself is the founder's call.

---

*Last updated: 2026-04-28.  Re-open if any cutover step regresses or the
burn-in counter resets.*
