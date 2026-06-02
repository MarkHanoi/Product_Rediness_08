# Runbook — Ransomware / encrypted-payload attack

> **Stamp**: 2026-06-02 · **Status**: DRAFT
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md), third of four failure-mode runbooks per A.35.
> **SLA**: 24 hours from incident-declared to customer-restored. Last-known-good is 5 min before the encrypted-payload event ([C48 §1.5](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)).
> **Owner**: founder + on-call SRE + external incident-response retainer (the contract requires this — see [C08 §6](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md)).

---

## §1 — When this runbook applies

A malicious actor has encrypted (or exfiltrated then encrypted) customer project data or PRYZM infrastructure data. Distinguishing this from corrupted-data:

- Ransom note appears in customer-facing UI or admin panel
- Project files become unreadable + carry an attacker-controlled extension
- Postgres rows or S3 objects mass-modified within a short window
- The pattern matches "all rows touched in the last N hours" rather than "rows that involved a specific feature"

**Pre-condition for prevention**: every backup is encrypted-at-rest with AES-256-GCM using KMS keys outside the application's IAM role ([C48 §1.3](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)). The application principal CANNOT decrypt cold backups, so ransomware cannot reach back and encrypt them. Audit this invariant during every quarterly review.

---

## §2 — Symptoms

- Customer support flood with "my project shows '__ENCRYPTED__'" messages
- `pryzm.persistence.write` span volume spikes anomalously (the attacker is rewriting rows)
- Admin audit log shows a suspicious actor (or an internal account that's been compromised)
- File-format integrity check ([C47 §1.4](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md)) starts failing en-masse
- Ransom note posted to the support inbox, Twitter, or directly in the application

---

## §3 — Procedure

### §3.1 — Declare the incident — and quarantine FIRST

1. PagerDuty incident severity **SEV-1** + add the **security** flag
2. Open incident channel `#inc-<YYYYMMDD>-ransomware`
3. Wake the founder, on-call SRE, and the named incident-response retainer
4. **Before anything else: quarantine.** Disable write access for the application principal:
   ```bash
   aws iam attach-role-policy \
       --role-name pryzm-prod-api \
       --policy-arn arn:aws:iam::aws:policy/AWSDenyAll
   ```
   This stops further damage at the cost of total customer downtime. Accept the trade.
5. Do NOT engage with the attacker. The retainer handles all attacker-side communication.

### §3.2 — Preserve evidence

Before restoring anything, take a forensic snapshot of the current state:

```bash
# Postgres snapshot (read-only — this is for forensics):
aws rds create-db-snapshot \
    --db-instance-identifier pryzm-pg-primary \
    --db-snapshot-identifier forensic-$(date -u +%Y%m%d-%H%M%S)

# S3 inventory snapshot:
aws s3 ls s3://pryzm-projects --recursive > forensic-s3-inventory-$(date -u +%Y%m%d-%H%M%S).txt

# Snapshot the audit log:
pryzm-ops export-audit-log \
    --since "24 hours ago" \
    --out forensic-audit-$(date -u +%Y%m%d-%H%M%S).jsonl
```

These artefacts are evidence — store them in a separate KMS-key-locked S3 bucket that the application principal cannot read OR write.

### §3.3 — Identify scope

Work backward from the first suspicious write to find:

| Question | Answer source |
|---|---|
| When did the attack start? | `audit_log.created_at` for the suspicious actor |
| Which customer-orgs are affected? | `commands` table grouped by `org_id`, filter `created_at >= attack_start` |
| What rows were modified? | `commands` table within the attack window |
| What did the attacker exfiltrate? | Cloudtrail GetObject events on `s3://pryzm-projects` |

Document each in the incident channel.

### §3.4 — Restore from pre-attack backup

The C48 §1.5 promise: customers are restored to 5 minutes BEFORE the attack started (not 5 min before incident declared — the WAL gives us 5-min granularity).

```bash
# Determine the restore timestamp:
ATTACK_START_TS="2026-06-02T14:23:00Z"  # from §3.3
RESTORE_TS=$(date -u -d "$ATTACK_START_TS - 5 minutes" --iso-8601=seconds)

# Restore Postgres to the point-in-time:
aws rds restore-db-instance-to-point-in-time \
    --source-db-instance-identifier pryzm-pg-primary \
    --target-db-instance-identifier pryzm-pg-clean \
    --restore-time "$RESTORE_TS"

# Restore S3 objects (only affected customer-orgs to limit blast radius):
for org_id in $(cat affected-orgs.txt); do
    pryzm-ops restore-s3 \
        --org $org_id \
        --to-timestamp $RESTORE_TS
done
```

The 5-minute window means at most 5 min of pre-attack legitimate work is lost. Customers are informed during §3.6.

### §3.5 — Rotate every credential

Even if you THINK the attacker only had one credential, rotate everything:

```bash
# 1. AWS access keys — the application's principal:
aws iam create-access-key --user-name pryzm-prod-api
# Distribute new keys to staging + prod; revoke the old keys.

# 2. Database master password:
aws rds modify-db-instance \
    --db-instance-identifier pryzm-pg-clean \
    --master-user-password "$(openssl rand -base64 48)" \
    --apply-immediately

# 3. KMS keys (mark old keys pending-deletion with a 30-day cool-off):
aws kms schedule-key-deletion \
    --key-id $OLD_PRYZM_DATA_KEY \
    --pending-window-in-days 30

# 4. Every operator's SSH key + AWS console access:
pryzm-ops force-rotate-operators

# 5. All customer SSO + API tokens:
pryzm-ops invalidate-all-customer-sessions
```

### §3.6 — Cut traffic back on, customer-by-customer

1. Re-attach the normal IAM policy:
   ```bash
   aws iam detach-role-policy \
       --role-name pryzm-prod-api \
       --policy-arn arn:aws:iam::aws:policy/AWSDenyAll
   ```
2. Update `DATABASE_URL` to point at `pryzm-pg-clean`
3. Rolling restart `kubectl rollout restart deployment/api`
4. For each affected customer:
   - Email them with: incident summary, 5-min data-loss window, what to verify, retainer + support contact
   - Re-enable write access only after they confirm verification
5. Once all affected customers confirm, public status page: "Incident resolved — investigation ongoing"

### §3.7 — Mandatory disclosures

The retainer + legal handle this, but the SRE is responsible for surfacing them in the incident channel:

- **GDPR Art. 33** — 72-hour DPA notification (EU customers)
- **CCPA §1798.82** — California consumer notification (US-CA customers)
- **Stripe** — if payment data MAY have been touched
- **Cyber insurance** — claim opens within 24 hours
- **Trust page** — public disclosure once retainer signs off (typically 30-60 days)

---

## §4 — Verification — DID we hit the 24 h RTO?

| Step | Target | Measured |
|---|---|---|
| Detect (suspicious write → pager) | ≤ 30 min | — |
| Quarantine (§3.1) | ≤ 5 min after detect | — |
| Evidence preserved (§3.2) | ≤ 60 min | — |
| Scope identified (§3.3) | ≤ 4 h | — |
| Restore complete (§3.4) | ≤ 8 h | — |
| All credentials rotated (§3.5) | ≤ 12 h | — |
| First customer cut back (§3.6) | ≤ 16 h | — |
| All affected customers cut back | ≤ 24 h | — |

The 24 h SLA is a HARD ceiling — if missed, the incident escalates to "tier-1 critical" with founder + board notification.

---

## §5 — Post-incident review — extended

Within 7 days of resolution (not 24 h — this is bigger). The retainer participates. File at `docs/04-reference/runbooks/incidents/YYYY-MM-DD-ransomware.md` with these mandatory sections:

1. **Timeline** (per [RUNBOOK-DB-PRIMARY-FAILURE.md §5](RUNBOOK-DB-PRIMARY-FAILURE.md))
2. **Initial access vector** — how did the attacker get in?
3. **Lateral movement** — what other systems did they touch before triggering?
4. **Customer impact** — affected customer-orgs, data-loss window per customer, exfiltrated data
5. **Mandatory disclosures** — log of every regulator + customer notified, with timestamps
6. **What broke** — specific control gaps + the corrective action for each
7. **Posture changes** — defaults, IAM scopes, retention, monitoring updates rolled out post-incident

---

## §6 — Related runbooks

- [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) — different shape, different response
- [RUNBOOK-ACCIDENTAL-DELETE.md](RUNBOOK-ACCIDENTAL-DELETE.md) — customer-initiated, not malicious
- [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) — quarterly drill

---

## §7 — Drill cadence

This runbook is exercised every Q1 DR drill ([C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)). The drill uses synthetic encrypted-data injection on a staging tenant — never on production data.
