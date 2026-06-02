# Runbook — Accidental project / data delete

> **Stamp**: 2026-06-02 · **Status**: DRAFT
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md), fourth of four failure-mode runbooks per A.35.
> **SLA**: 30 days for self-service trash recovery; older requires support intervention.
> **Owner**: customer success (CS) lead; SRE escalation only for outside-trash-window cases.

---

## §1 — When this runbook applies

A customer (or an admin acting on the customer's behalf) deleted data they want back. This is the most-common DR scenario and the LOWEST stakes — but it MUST be handled cleanly because a slow recovery erodes trust.

Sub-cases:

| Sub-case | Path | SLA |
|---|---|---|
| Deleted within last 30 days, customer-self-service | §3.1 (customer uses trash UI) | Instant |
| Deleted within last 30 days, customer needs help | §3.2 (CS handles in dashboard) | ≤ 30 min |
| Deleted 30-90 days ago, requires admin | §3.3 (cold-tier restore by SRE) | ≤ 48 h |
| Deleted > 90 days ago | §3.4 (declared unrecoverable, with caveats) | — |

The 30-day window is the self-service trash retention. The 90-day window is the cold-tier retention. Anything older than that is gone per [C48 §1.6](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) retention policy.

---

## §2 — Symptoms

- Customer support ticket: "I deleted my project, can you bring it back?"
- Customer-org admin emails: "An employee deleted a folder by mistake"
- Internal alarm: bulk-delete operation (>10 projects in 5 minutes) — automatic CS escalation

---

## §3 — Procedure

### §3.1 — Customer self-service (default path)

Direct the customer to the trash UI:

> "Open PRYZM → Settings → Trash (or visit pryzm.app/trash). Every project deleted in the last 30 days is here — click 'Restore' next to the project you want back. Restored projects appear in your project list immediately."

The trash UI is the C48 §1.5 promise — every customer-initiated delete is recoverable for 30 days without any support contact. If the customer can't see the trash, escalate to §3.2.

### §3.2 — CS-assisted recovery (within 30 days)

The CS rep handles this in the admin dashboard:

```
Admin Dashboard → Customer Lookup → <customer-org> → Trash
```

For each project the customer wants back:
1. Click "Restore"
2. Set a note on the restored project: "Restored YYYY-MM-DD by CS on customer request — ticket #<N>"
3. Confirm the restore with the customer via email reply

Audit log captures the CS action automatically. No SRE involvement needed.

**Edge case**: if the deletion was a shared-project unshare (the customer's view was removed but the underlying project belongs to another org), the unshare can be reversed:

```
Admin Dashboard → Customer Lookup → <customer-org> → Shared-access-log → Restore-access
```

### §3.3 — SRE-assisted recovery (30-90 days)

If the trash window has expired but the cold-tier retention covers it:

1. CS files a ticket in `#ops-restore-requests` with:
   - Customer org id
   - Project id (if known) — else `name LIKE '%foo%'` to be searched
   - Approximate delete date
2. SRE confirms cold-tier retention ([C48 §1.6](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) — Solo/Studio 30 days, Mid-firm 90 days, Enterprise 365 days)
3. SRE restores from cold tier:
   ```bash
   pryzm-ops restore-cold \
       --customer-org $ORG_ID \
       --project $PROJECT_ID \
       --target-snapshot-at $DELETE_DATE \
       --note "ticket #$TICKET_NUMBER — accidental delete on $DELETE_DATE"
   ```
4. SRE verifies the restored project opens in the editor end-to-end on a test account
5. CS confirms with the customer + closes the ticket

The 48-hour SLA gives SRE time to fit the restore into the existing operational cadence — accidental deletes are not pager-worthy.

### §3.4 — Outside cold-tier retention (> tier-retention)

If the data is older than the customer's tier retention, it's gone. CS handles communication:

> "We're sorry — your tier's cold-backup retention is [30 / 90 / 365] days, and the deletion happened [N] days ago, so we no longer have a copy. Going forward, you can: (a) upgrade tier for longer retention, (b) configure project-level autosnapshot exports to your own S3 bucket (Mid-firm + Enterprise), (c) treat published .pryzm exports as your durable archive."

Do NOT promise to "look harder" — the retention is honest, not negotiable.

**Exception**: if the customer is on a Tier-1 critical-incident SLA (Enterprise + contractual data-protection clause), CS escalates to founder. Some Enterprise contracts include extended-retention clauses that override the default policy. Check the customer's signed MSA.

---

## §4 — Common pitfalls

### §4.1 — Don't restore over a more-recent legitimate edit

If the customer deleted Project X on T-10d, then created a NEW Project X on T-2d, then asks to restore the old one — restore as `<name> (restored YYYY-MM-DD)` to avoid overwriting their current work. The trash UI does this automatically; manual restores in §3.3 MUST set the `--restored-suffix` flag.

### §4.2 — Don't restore deleted shared projects without the owner's consent

If the deleted project was shared with the customer (not owned by them), restoring the customer's view requires the OWNER's consent — unilaterally restoring breaches the C08 §3 cross-org confidentiality rule. CS contacts the owner via email; SRE waits for written confirmation.

### §4.3 — Document the "why" — every restore is audited

The note field on every restore is queried in the quarterly audit. "Restored on customer request" is not enough — include the ticket number, the customer-facing reason, the date.

---

## §5 — Verification — DID we hit the SLA?

| Sub-case | SLA | Pass criteria |
|---|---|---|
| §3.1 self-service | Instant | Customer used trash UI without contacting CS |
| §3.2 CS-assisted | ≤ 30 min from ticket | Restore completed + customer confirmed within 30 min |
| §3.3 SRE-assisted | ≤ 48 h from ticket | Restored + customer confirmed within 48 h |

SLA misses go into the quarterly trust-report — not because they're catastrophic but because the customer experienced friction and that friction MUST be visible.

---

## §6 — Post-incident review

The bulk-delete (>10 projects in 5 min) auto-escalation is the ONE accidental-delete scenario that always triggers a review. The review goes at `docs/04-reference/runbooks/incidents/YYYY-MM-DD-bulk-delete.md` and asks:

1. Was it actually accidental? (Or a misconfigured automation?)
2. Did the customer's UI surface a confirmation BEFORE the bulk action?
3. Should we add a "you're about to delete N projects — confirm" gate?

Single-project accidental deletes don't get post-incident reviews unless they uncovered something unusual.

---

## §7 — Related runbooks

- [RUNBOOK-RANSOMWARE.md](RUNBOOK-RANSOMWARE.md) — if the "delete" is actually malicious encryption
- [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) — DB-side failure, not user-initiated
- [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) — quarterly drill
- [C48 §1.6 retention table](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) — per-tier retention windows

---

## §8 — Drill cadence

This runbook is NOT drilled formally — it's exercised in production every week through normal customer support volume. The quarterly review of the runbook checks: (a) any SLA misses since last review, (b) any new edge cases, (c) any tier-retention policy changes that need to be reflected in §3.4.
