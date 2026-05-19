# Disaster Recovery Drill Runbook

**Sprint**: PRYZM 2 Phase 3D · S69 D6
**Spec source**: `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S69 D6 (line 292) — "DR drill execution (rollback runbook test)"; exit-criterion (line 304) — "DR drill green; rollback runbook validated."
**Failure-mode source**: `docs/03_PRYZM3/reference/specs/SPEC-27-MIGRATION-ROLLBACK.md` §8 (the four migration failure modes) + §9 (DR drill cadence).
**Cadence**: quarterly (next: 2026-Q3 — S70 D8 self-host publish day will tag the first GA-track drill).
**Owner**: founder + on-call SRE (named per drill in §9 sign-off log).

---

## §1 Scope and outcomes

This runbook codifies the operator-side procedure for the four migration failure modes called out in `SPEC-27` §8.  It is the **only** authoritative DR procedure; any out-of-band hot-fix that bypasses this runbook must be reconciled into a follow-on PR within one business day per the post-incident review template in §10.

The runbook covers:

- §3 — Bad **schema migration** (Postgres DDL applied, breaks reads)
- §4 — Bad **file-format migration** (`packages/file-format` codec change ships, breaks deserialization)
- §5 — Bad **event-payload migration** (sync-server CommandEvent shape change, breaks the event-log replay)
- §6 — Bad **cutover** (the canary→GA traffic flip self-detects regression)
- §6.5 — RLS verification step (folded in here because the live Postgres is already up for §3)
- §7 — Memory leak hunt (4-hour staging session sim — operator-side run of the §S69 D5 harness)

It explicitly does **not** cover:

- Region-failover drills (deferred per `0049-s67-multi-region-cut-decision.md` to post-GA when the second region exists).
- Full point-in-time restore from S3-backed Postgres snapshots (deferred to S70 D8 self-host-publish day; this runbook references the procedure but does not executable it).
- Customer-facing comms procedures (owned by the GA marketing playbook in S71).

---

## §2 RTO / RPO targets at GA

Per `SPEC-27` §9 line 213 and `08-VISION.md` §6 NFTs:

| Surface | RTO target | RPO target | Source |
| --- | --- | --- | --- |
| Editor read path | 15 minutes | 0 (CommandEvent log replay)  | SPEC-27 §9 |
| Editor write path | 30 minutes | ≤ 1 commit (≈ 1 second of CommandEvents on staging traffic) | SPEC-27 §9 |
| Marketplace catalog | 1 hour | 0 (idempotent re-seed from publisher pipeline) | SPEC-27 §9 |
| AI workflow execution | 2 hours | 0 (workflow definitions are static; in-flight workflows are fire-and-forget) | SPEC-28 §9 |
| Self-host customer install | N/A (customer-managed) | N/A | `pryzm-selfhost/install.sh` |

Drill PASS = each surface meets BOTH columns within tolerance during the drill window.

---

## §3 Bad schema migration

**Trigger**: a migration in `apps/sync-server/migrations/`, `apps/marketplace-api/migrations/`, or `pryzm-selfhost/init-db/` lands; reads or writes start failing.

### 3.1 Detect

Detection sources (any one trips the drill):
- Sync-server `event_log` insert error rate > 1% for > 60 s (Honeybadger / Sentry).
- API gateway `/api/projects/*` 5xx rate > 5% for > 60 s.
- Manual operator report.

### 3.2 Decide

The reversal decision tree from `SPEC-27` §8.1:
1. **Is the failing migration the most recent one?** → §3.3 down-migration.
2. **Has another migration been applied since?** → §3.4 forward-fix migration (down is no longer safe).
3. **Has the bad migration corrupted data (FK orphans, dropped columns)?** → §3.5 point-in-time restore.

### 3.3 Down-migration (most recent only)

```bash
# 1. Confirm no new commits have shipped on top:
psql "$DATABASE_URL" -c "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 5;"

# 2. Apply the down-migration script (must exist alongside the up-migration):
psql "$DATABASE_URL" -f apps/sync-server/migrations/<NNN>_<name>.down.sql

# 3. Remove the migration ledger row:
psql "$DATABASE_URL" -c "DELETE FROM schema_migrations WHERE version = '<NNN>_<name>';"

# 4. Restart the affected services so they re-detect the schema:
docker compose restart sync-server bake-worker api-gateway

# 5. Verify writes resume:
curl -fsSL "$EDITOR_URL/api/healthz" | jq .
```

### 3.4 Forward-fix migration (later commits exist)

Author `apps/sync-server/migrations/<NNN+k>_fix_<name>.sql` that undoes the bad change idempotently (DROP COLUMN IF EXISTS; CREATE TABLE IF NOT EXISTS; etc.); apply via the normal migration path; do NOT manually edit history.

### 3.5 Point-in-time restore

```bash
# Per SPEC-27 §8.1 last-resort path.  Requires WAL archiving enabled
# (M37+ post-GA per ADR-0049 §F; not yet wired in S69).  The procedure
# documented here is the canonical one; the operator must capture the
# pre-recovery DATABASE state on a separate disk before invoking.
echo "PITR is a documented but not yet wired procedure — see ADR-0049 §F."
exit 2
```

---

## §4 Bad file-format migration

**Trigger**: a `packages/file-format` codec change ships; existing `.pryzm` files fail to deserialise.

### 4.1 Detect

- Any client-side `unpack()` throws on a previously-saved file.
- Server-side `apps/bake-worker` reports `FileFormatVersionMismatch` errors.

### 4.2 Decide

Per `packages/file-format` migration ladder (SPEC-26 §3 — file-format migrations are append-only by contract):

1. **The new format-version is opt-in (writer still emits the old version)** → §4.3 disable the writer flag.
2. **The new format-version is the default writer (existing files now mixed-version)** → §4.4 emergency reader fallback.
3. **The new format-version has corrupted on-disk files** → §4.5 reader-side repair migration.

### 4.3 Disable writer flag (cleanest)

```bash
# Roll back the apps/editor / apps/api-gateway env var that selects writer version.
docker compose exec api-gateway sh -c "PRYZM_WRITER_FORMAT_VERSION=<prev> npx pryzm format select"
```

### 4.4 Emergency reader fallback

If the writer has already produced files at the new version, ship a hot-fix that adds the previous reader to the codec registry.  The reader was deleted as part of the migration — **restore from git**:

```bash
git restore --source=<commit-before-bad-migration> -- packages/file-format/src/codecs/<NN>_<name>.ts
# Re-register in packages/file-format/src/index.ts
# Cut a hotfix release; CDN-deploy.
```

### 4.5 Reader-side repair migration

For corrupted-on-disk cases, author a migration in `packages/file-format/src/migrations/` that reads the broken byte format and writes the fixed one.  Test against a captured corrupted fixture before deploy.  This is a **multi-day** procedure; until the migration is ready, customers must accept that affected files are read-only.

---

## §5 Bad event-payload migration

**Trigger**: a `CommandEvent` payload shape change ships in `apps/sync-server`; replay of the event log fails.

### 5.1 Detect

- `apps/sync-server/__tests__/event-log/replay.test.ts` would catch this in CI; if it slipped past, the operator-side trigger is `event_log` consumer-lag alarms.

### 5.2 Decide

Per `apps/sync-server/src/events/` versioning contract (every CommandEvent carries `payloadVersion: number`):

1. **Replay processor handles old payloadVersion** (forward-compatible read) → no action; the replay just tolerates the version mismatch.
2. **Replay processor was changed to require the new version** → §5.3 ship a tolerant reader.
3. **Already-emitted events are corrupted** → §5.4 emit a compensating-event stream (no in-place mutation of the event log — it's append-only by contract).

### 5.3 Tolerant reader hot-fix

Ship a release that adds the previous decoder to `apps/sync-server/src/events/decoders/registry.ts` (mirror of §4.4).  No event-log surgery required.

### 5.4 Compensating events

For corrupted events, append `EventCorrectionV1{ targetEventId, replacementPayload }` events.  The replay processor must be taught to apply them per `apps/sync-server/src/events/replay/correction-handler.ts` (lands in S70 D8 alongside the operator-tooling release).  Until then, **affected projects must be marked read-only** at the api-gateway layer.

---

## §6 Bad cutover

**Trigger**: a GA traffic flip ships (canary 10% → 100%, or new region brought online); error rate climbs.

### 6.1 Detect

Per the GA observability contract in `08-VISION.md` §7:
- 5xx rate > 1% over 5 min → page on-call.
- p95 latency > 2× baseline over 5 min → page on-call.

### 6.2 Decide and act

Cutover reversal is the **simplest** of the four — no data path is involved, only the traffic-shaping layer:

```bash
# Replit deployment: revert the deployment to the prior version via the deploy-list.
# Self-host: edit pryzm-selfhost/.env to flip PRYZM_RELEASE_TAG back; docker compose pull && up -d.
# Multi-region: the cut decision deferred to post-GA per ADR-0049 — for the single-region
#   GA window this row collapses to "revert the deployment".
```

### 6.3 Post-incident

Within one business day, file the post-incident review per the §10 template.  The cutover that failed must be re-attempted in a staging environment with the same fixture profile before being re-tried in production — no exceptions.

---

## §6.5 RLS verification (folded into §3 because Postgres is already up)

Apply the verified RLS test queries from S69 D6 deliverable:

```bash
# 1. Apply the policy migration (idempotent; safe to re-run):
psql "$DATABASE_URL" -f pryzm-selfhost/init-db/03-rls-policies.sql

# 2. Apply the test seeds + assertions:
psql "$DATABASE_URL" -f pryzm-selfhost/init-db/03-rls-policies.test.sql

# 3. Expect: psql exit 0 + "✓ RLS verification ... PASSED" line.
#    Any assertion failure → psql exits non-zero → drill marker §10.4 fails.
```

---

## §7 Memory leak hunt (4-hour staging sim)

The S69 D5 harness `apps/bench/scripts/heap-leak-hunt.mjs` runs against the largest-project fixture; in dev it defaults to 200 cycles (~30 s).  The 4-hour spec target is the **operator-side** drill step:

```bash
# Run for ~4 hours of wall-clock — 50,000 cycles is empirically a 30-min run on a m6a.large.
# For a true 4 h sim under realistic session traffic, point the harness at a session-driver
# script that mounts the editor in a Playwright headless and clicks through a 4 h script.
# That driver script is the S70 D8 self-host-publish-day deliverable; until it lands, the
# operator records the 50K-cycle Node-side run + a Playwright-recorded 4h DOM-side run as
# two separate drill artifacts (both attached to §10.4).

PRYZM_LEAK_CYCLES=50000 node --expose-gc apps/bench/scripts/heap-leak-hunt.mjs

# Pass criterion: leak=false in the resulting heap-leak-hunt.json (growth < 5% over the
# trailing window).  At S69 D5 dev-env baseline: 200 cycles, growth 0.22%, leak=false.
```

---

## §8 Pre-drill checklist

Tick each box before invoking the drill:

- [ ] Drill announced in #ops-on-call ≥ 24 h prior (cadence-style drills) or ≥ 0 min (incident-response drills — you ARE the announcement).
- [ ] Snapshot of staging Postgres taken: `pg_dump -Fc -d $DATABASE_URL > /backup/staging-pre-drill-<date>.dump`.
- [ ] Snapshot of staging MinIO bucket taken: `mc mirror staging/pryzm /backup/minio-staging-pre-drill-<date>/`.
- [ ] Last green build SHA recorded in §10.4 row.
- [ ] On-call SRE confirmed available for the drill window.
- [ ] Customer-facing status page updated to "scheduled maintenance" (production drills only).

---

## §9 Drill cadence + sign-off matrix

Per `SPEC-27` §9 line 213 — quarterly cadence; per drill, at minimum two human sign-offs (founder + on-call SRE; both names recorded in §10.4).  The first GA-track drill is scheduled S70 D8 self-host-publish day where the live Postgres is already provisioned for the cutover.

| Drill # | Date         | Surface(s)           | Outcome | Founder | SRE       | Audit doc                    |
| ------- | ------------ | -------------------- | ------- | ------- | --------- | ---------------------------- |
| 0       | (this entry) | runbook authored     | n/a     | n/a     | n/a       | (this file)                  |
| 1       | S70 D8       | §3 + §6.5 + §7       | TBD     | TBD     | TBD       | TBD                          |
| 2       | 2026-Q3      | §4 + §5              | TBD     | TBD     | TBD       | TBD                          |

Two drill-sign-offs is a **gate** for the M36 GA cut per `K3-F` (DR drill green is one of the GA GO/NO-GO criteria).

---

## §10 Post-incident review template

Per real-incident (NOT cadence drill):

```
# Post-incident — <YYYY-MM-DD HH:MM> — <one-line title>

## What happened (one paragraph, customer-facing)

## Timeline (UTC)
- HH:MM — first signal
- HH:MM — paged
- HH:MM — runbook §_._ invoked
- HH:MM — recovered
- HH:MM — root cause identified

## Root cause (one paragraph, technical)

## What worked
- (e.g. "down-migration applied cleanly; RTO 8 min vs 15 min target")

## What did NOT work
- (e.g. "the §3.3 step assumed psql was on PATH; it isn't in our prod runner image — fix in §10.5")

## Actions
- [ ] (owner) (deadline) — runbook fix per §10.5
- [ ] (owner) (deadline) — backfill bench harness
- [ ] (owner) (deadline) — customer comms

## Sign-off
- Founder: ___
- SRE:     ___
```

---

## §11 What this runbook does NOT claim

- It does **not** claim a real production drill has been executed at S69 close — drill #0 is the runbook authoring itself; drill #1 is scheduled S70 D8 (the first time the self-host live-Postgres path is operator-touchable in this sprint cadence).
- It does **not** cover region-failover (deferred per `0049-s67-multi-region-cut-decision.md`).
- It does **not** cover full WAL-archive PITR — §3.5 documents the procedure but ADR-0049 §F admits WAL archiving is not yet wired (M37+ post-GA).
- It does **not** replace the SOC2 §1.10 quarterly secret-rotation drill (`docs/security/secret-rotation-playbook.md` §5) — that drill runs on the same cadence but covers different artifacts.
- It does **not** include a customer-comms script — that lives in the S71 marketing playbook.

---

**Authored by**: sprint-S69 (2026-04-28)
**Companion docs**: `docs/03_PRYZM3/reference/specs/SPEC-27-MIGRATION-ROLLBACK.md` (failure-mode source); `pryzm-selfhost/init-db/03-rls-policies.test.sql` (§6.5 invocation target); `apps/bench/scripts/heap-leak-hunt.mjs` (§7 invocation target); `docs/security/secret-rotation-playbook.md` §5 (companion quarterly drill).
