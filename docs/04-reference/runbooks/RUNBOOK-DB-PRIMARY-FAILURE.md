# Runbook — Postgres primary failure

> **Stamp**: 2026-06-02 · **Status**: DRAFT
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) — first of four failure-mode runbooks per A.35.
> **SLA**: 30 minutes from incident-declared to customer-restored (per [C48 §1.5](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) RTO).
> **Owner**: on-call SRE (founder during pre-GA).

---

## §1 — When this runbook applies

The primary Postgres node is unreachable, locked, or returning errors on every write. Read replicas are still serving traffic but stale-by-replication-lag.

**Distinguishing this from a regional outage** ([RUNBOOK-REGIONAL-OUTAGE.md](RUNBOOK-REGIONAL-OUTAGE.md)): the primary is dead but the same region's read replica + storage are intact. If the entire region is unreachable, switch runbooks immediately.

**Distinguishing this from a transient connection blip**: do NOT promote until two consecutive 60-second windows both show `pg_isready` returning non-zero. Transient blips self-recover and a premature promotion creates split-brain.

---

## §2 — Symptoms

- Pager fires on `postgres-primary-unreachable` (Datadog monitor, threshold 60 s)
- `server.js` `§SERVER-PG-DEGRADE` in-memory fallback engages (per the migration-gate fix logged in [DAILY-USE-FIX-LOG Round 50](../../03_PRYZM3/DAILY-USE-FIX-LOG-2026-05-20.md))
- `/api/health` reports `database: "in-memory-fallback"` instead of `"primary"`
- Customer-side: every write that needs durability blocks; reads from a 30 s-stale snapshot still succeed
- Span `pryzm.persistence.write` records non-zero error rate at the SDK level

---

## §3 — Procedure

### §3.1 — Declare the incident

1. PagerDuty incident severity **SEV-2** (one degraded subsystem, not customer-down)
2. Open incident channel `#inc-<YYYYMMDD>-pg-primary`
3. Post in `#status` (internal-only at this severity) — DO NOT post to the public status page until §3.4

### §3.2 — Confirm primary is dead

```bash
# From a bastion host:
pg_isready -h $PG_PRIMARY_HOST -p 5432 -t 10
# Expect: exit code 2 (no response), repeat after 60 s to confirm
```

If `pg_isready` succeeds, abort this runbook — the issue is something else. Check connection-pool exhaustion or DNS instead.

### §3.3 — Promote the read replica

```bash
# Trigger the AWS RDS failover:
aws rds promote-read-replica \
    --db-instance-identifier pryzm-pg-replica-1 \
    --region us-east-1

# Wait for it to come online (typical: 4-7 minutes):
aws rds wait db-instance-available \
    --db-instance-identifier pryzm-pg-replica-1
```

While the failover runs, the in-memory fallback in `server.js` continues serving reads. Customer writes queue in the WAL-buffer + replay once the new primary is healthy.

### §3.4 — Cut traffic over

1. Update the `DATABASE_URL` secret in AWS Secrets Manager — point at the promoted replica
2. Trigger a rolling restart of the API fleet (`kubectl rollout restart deployment/api`)
3. Confirm `/api/health` returns `database: "primary"`
4. Confirm a single test write succeeds end-to-end (`pryzm-ops write-canary --project test-canary`)
5. Post to the public status page: "Database connectivity degraded — restoring now"

### §3.5 — Reintegrate or replace the dead primary

The dead primary now becomes a new read replica:

```bash
# Re-create the dead node as a replica of the new primary:
aws rds create-db-instance-read-replica \
    --db-instance-identifier pryzm-pg-replica-new \
    --source-db-instance-identifier pryzm-pg-replica-1
```

Once it catches up (typical: 20-40 minutes for our row count), it's a hot spare for the next event.

### §3.6 — Close the incident

1. Public status page: "Restored — full investigation underway"
2. Internal post-incident review within 24 h (template: §5)
3. Pager: resolve the incident with notes pointing to the channel

---

## §4 — Verification — DID we hit the 30 min RTO?

| Step | Target | Measured |
|---|---|---|
| Detect (pager → incident channel) | ≤ 60 s | — |
| Confirm primary dead (§3.2) | ≤ 2 min | — |
| Promote replica (§3.3) | ≤ 8 min | — |
| Cut traffic (§3.4) | ≤ 5 min | — |
| Customer-restored (test write succeeds) | ≤ 15 min total | — |

If total ≥ 30 min, the next DR drill MUST cover this scenario and the runbook MUST be revised.

---

## §5 — Post-incident review template

Within 24 hours of resolution, the on-call SRE files an entry at `docs/04-reference/runbooks/incidents/YYYY-MM-DD-pg-primary.md`:

```markdown
# Incident YYYY-MM-DD — Postgres primary failure

## Timeline
- HH:MM:SS UTC — first error log
- HH:MM:SS UTC — pager fired
- HH:MM:SS UTC — promote-read-replica issued
- HH:MM:SS UTC — DATABASE_URL flipped
- HH:MM:SS UTC — first successful customer write post-failover

## Root cause
[What killed the primary? AWS infra incident? Disk pressure? Bad migration?]

## Customer impact
- Writes blocked for: X minutes
- Reads stale by: Y seconds (replication lag at failure time)
- Customers affected: Z (unique customer-orgs with attempted writes during outage)

## What worked
[List what this runbook got right.]

## What didn't
[List failures — slow detection? Missing dashboard? Unclear step?]

## Action items
- [ ] Update this runbook (specific line numbers)
- [ ] Adjust monitor threshold X
- [ ] Add dashboard Y
```

---

## §6 — Related runbooks

- [RUNBOOK-REGIONAL-OUTAGE.md](RUNBOOK-REGIONAL-OUTAGE.md) — if the entire region is gone, not just one node
- [RUNBOOK-RANSOMWARE.md](RUNBOOK-RANSOMWARE.md) — if the primary is alive but encrypted with malicious payload
- [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) — quarterly drill that exercises this runbook

---

## §7 — Drill cadence

This runbook is exercised every Q2 + Q4 DR drill ([C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)). The Q3 drill exercises the regional-outage runbook; the Q1 drill exercises ransomware.

Drift inspection: the "deadletter" customer writes that queued in the in-memory buffer during §3.3 MUST be verified replayed before §3.6 closes. The drill script does this automatically; in a real incident, the on-call SRE confirms manually via `pryzm-ops verify-deadletter --since <pager-time>`.
