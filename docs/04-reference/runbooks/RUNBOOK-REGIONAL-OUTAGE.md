# Runbook — Full regional outage

> **Stamp**: 2026-06-02 · **Status**: DRAFT
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md), second of four failure-mode runbooks per A.35.
> **SLA**: 4 hours from incident-declared to customer-restored (per [C48 §1.5](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) RTO).
> **Owner**: on-call SRE + founder (this one wakes both).

---

## §1 — When this runbook applies

The entire primary region (us-east-1) is unreachable. Not a single AZ — the whole region. Distinguishing characteristics:

- AWS status page shows multiple correlated incidents across services
- Cross-region health probes from us-west-2 → us-east-1 endpoints all timeout
- The primary Postgres AND read replicas AND S3 buckets all unreachable

If only Postgres is down, use [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) — much faster recovery.

**Pre-condition**: this runbook is only available to Enterprise + opt-in Mid-firm customers ([C48 §1.6](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) CLASS-1 cross-region tier). Solo + Studio customers are single-region by design — their recovery is "wait for AWS to come back".

---

## §2 — Symptoms

- Cross-region health probe `us-west-2 → us-east-1` returns nothing
- AWS Personal Health Dashboard shows a "region-impacting event"
- Customer reports flood `#cs-tier-enterprise`
- Public status page MUST go to "major outage — region recovery in progress" within 5 minutes

---

## §3 — Procedure

### §3.1 — Declare the incident

1. PagerDuty incident severity **SEV-1** (customer-down, multi-customer impact)
2. Open incident channel `#inc-<YYYYMMDD>-region`
3. Wake the founder + the named secondary SRE
4. Post to public status page within 5 minutes — "Major outage in progress, switching to secondary region"
5. Email all Enterprise + opt-in Mid-firm contacts (the SLA email template is at `docs/04-reference/runbooks/templates/sla-major-outage.md`)

### §3.2 — Confirm region is gone

Don't assume — verify:

```bash
# From a us-west-2 bastion:
aws ec2 describe-regions --region us-east-1 --no-cli-pager 2>&1 | head -5
# AWS API itself may be down — that's confirming evidence

# Check AWS Personal Health Dashboard:
aws health describe-events --filter "regions=us-east-1" --region us-east-1
```

If at least one us-east-1 service responds normally, this is a partial outage — escalate to the AWS TAM and consider [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) instead.

### §3.3 — Fail over DNS + load balancer

```bash
# Route 53 weighted policy already has us-west-2 at weight 0 — promote it:
aws route53 change-resource-record-sets \
    --hosted-zone-id $PRYZM_HOSTED_ZONE \
    --change-batch file://failover/promote-us-west-2.json

# Verify propagation (takes 60-300 s with TTL 60):
dig +short api.pryzm.app
# Expect: us-west-2 IPs only
```

### §3.4 — Promote the cold replica region

The us-west-2 region is in "warm standby" — Postgres replication is continuous, but the app fleet runs at 1 pod minimum. Scale up:

```bash
# Switch to the us-west-2 kubeconfig context first:
kubectl config use-context pryzm-prod-us-west-2

# Scale the api fleet:
kubectl scale deployment/api --replicas=20

# Promote the cross-region Postgres replica to standalone primary:
aws rds promote-read-replica \
    --db-instance-identifier pryzm-pg-us-west-2-replica \
    --region us-west-2

# Wait (typically 4-10 min):
aws rds wait db-instance-available \
    --db-instance-identifier pryzm-pg-us-west-2-replica \
    --region us-west-2
```

Cross-region replication lag was monitored continuously pre-incident. The last 15 minutes of cross-region replication lag MUST be reviewed:

```bash
# CloudWatch metric: ReplicaLagInSeconds for pryzm-pg-us-west-2-replica
# Acceptable: ≤ 30 s over the last 15 minutes
# Concerning: 30-300 s — customers may see up to 5 min of data loss
# Disqualifying: > 300 s — restore from cold backup instead (§3.6)
```

### §3.5 — Cut traffic over

1. Update `DATABASE_URL` in us-west-2 Secrets Manager
2. Rolling restart `kubectl rollout restart deployment/api`
3. Confirm `/api/health` returns `database: "primary"` AND `region: "us-west-2"`
4. Confirm a single test write per customer tier succeeds
5. Public status page: "Failed over to us-west-2 — restoring customer-by-customer"

### §3.6 — Cold-backup fallback (only if §3.4 disqualifies)

If cross-region replication lag was > 300 s, the warm replica is unsafe. Restore CLASS-1 from S3 cold backups in us-west-2:

```bash
# This adds 60-180 minutes to RTO. ONLY use if §3.4 disqualified.
pryzm-ops restore-cold \
    --tier class-1 \
    --target-region us-west-2 \
    --to-timestamp $(date -u -d "10 minutes ago" --iso-8601=seconds) \
    --customers enterprise,mid-firm-opt-in
```

Solo + Studio are NOT restored in this path — they're single-region and accept the AWS-recovery wait.

### §3.7 — Customer-facing communication

Per the SLA, individual emails go to Enterprise contacts every 30 minutes until restored:
1. T+0: outage declared
2. T+30 min: status update
3. T+60 min: ETA
4. T+90 min: restored OR new ETA
5. T+restored: confirmation + post-incident review schedule

The customer success lead handles email; the SRE focuses on recovery.

### §3.8 — Reverse-failover (when us-east-1 returns)

Do NOT auto-reverse-failover. The us-east-1 region returning to health is the BEGINNING of a separate planned-maintenance window (typical: 24-72 h after the original incident). Treat the reverse failover as a planned change, scheduled with customer notice. The reverse procedure mirrors §3.4 with us-east-1 as the target.

---

## §4 — Verification — DID we hit the 4 h RTO?

| Step | Target | Measured |
|---|---|---|
| Detect (pager → incident channel) | ≤ 5 min | — |
| Public status page update | ≤ 10 min | — |
| Region confirmed dead (§3.2) | ≤ 15 min | — |
| DNS failover initiated (§3.3) | ≤ 20 min | — |
| Cross-region promote complete (§3.4) | ≤ 60 min | — |
| Traffic cut (§3.5) | ≤ 90 min | — |
| Enterprise customers verified | ≤ 180 min | — |
| Mid-firm opt-in customers verified | ≤ 240 min | — |

Solo + Studio customers are NOT on the RTO clock — they're single-region by tier. Their RTO is "us-east-1 returns".

---

## §5 — Post-incident review

Within 48 hours of resolution, the on-call SRE files at `docs/04-reference/runbooks/incidents/YYYY-MM-DD-region.md`. The post-mortem template is identical to [RUNBOOK-DB-PRIMARY-FAILURE.md §5](RUNBOOK-DB-PRIMARY-FAILURE.md), with additional sections for cross-region replication-lag forensics + reverse-failover plan.

---

## §6 — Related runbooks

- [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) — single-node, not whole region
- [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) — quarterly drill that exercises this runbook
- [C49 multi-region contract](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) — governs which customers are in which region

---

## §7 — Drill cadence

This runbook is exercised every Q3 DR drill ([C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)). The Q3 2026 drill (the first scheduled) is the trial run — if not all SLA targets are met, the drill is repeated mid-Q4.
