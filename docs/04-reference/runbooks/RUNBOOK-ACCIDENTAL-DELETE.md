# Runbook — Accidental project / data delete

> **Stamp**: 2026-07-16 · **Status**: DRAFT — ⚠️ PARTLY ASPIRATIONAL (read the reality banner below)
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md), fourth of four failure-mode runbooks per A.35.
> **Owner**: customer success (CS) lead; SRE escalation for log correlation.

---

> # ⚠️ REALITY CHECK (2026-07-16, L-349) — READ BEFORE FOLLOWING ANY STEP BELOW
>
> **The trash UI, cold-tier retention, and the `pryzm-ops restore-cold` CLI described in §3 DO NOT EXIST YET.** They are the *target* C48 design (tracked as **L-344**), not shipped tooling. **Today, `DELETE /api/projects/:id` (`server.js`) is a PERMANENT, immediate cascade delete** — there is no `deleted_at` column, no trash, no soft-delete, and no cold backup to restore from (confirmed: `dbMigrate.js` has no soft-delete column; `pryzm-ops` exists only in docs). **A CS rep who follows §3.1–§3.3 will promise a recovery that is impossible.** Use **§0 (the real procedure)** until L-344 ships the tooling and this banner is removed.

---

## §0 — REAL procedure today (what actually works)

**Deletes are permanent.** The only recoverable state comes from version history a client still holds, or a customer-held export:

1. **Ask if the project is still open in a browser tab — and tell them NOT to close it.** Version snapshots are written to the browser's IndexedDB (`VersionRepository`, ~2 MB compressed per version) and synced to the server as project versions. If the delete removed the server project but a client still holds the live session, that client can re-save the project to recreate it. This is the single most likely recovery path — act on it first, before the tab closes.
2. **Get the `errorId`.** The `DELETE /api/projects/:id` response and the delete-path logs carry an `errorId` correlation key. Capture it from the customer or the logs so SRE can correlate the exact delete event (actor, timestamp, cascade scope) in the server logs — this establishes what happened even when the data itself is unrecoverable.
3. **Check for a partial/failed delete.** `DELETE` cascades (`ON DELETE CASCADE`), so once the project row is gone its `project_versions` are gone too. Server-side version history only helps if the delete was *partial* (row survived). Have SRE check whether the row still exists before promising anything.
4. **Customer-held `.pryzm` exports are the ONLY durable archive today.** If the customer exported a `.pryzm` file, import it to recreate the project.
5. **If none of the above apply, the data is GONE.** Communicate honestly (§0.1). Do not promise a restore.

### §0.1 — Honest customer comms (today)

> "I'm very sorry — deleting a project in PRYZM is currently permanent and immediate; we don't yet have a trash or a backup restore. **If you still have the project open in a browser tab, please keep it open** and I'll help you re-save it right now. If you previously exported a `.pryzm` file, we can import that. Otherwise, I'm afraid we can't recover it. We're actively building trash + backup restore so this can't happen again."

**Do NOT** tell a customer to "check Settings → Trash" or promise a 30/90/365-day restore — none of that exists yet.

### §0.2 — The prevention that is actually the priority

Until restore tooling ships (L-344), the highest-value real work is **prevention**, not recovery:

- A **confirm-before-delete** gate (single project) and the existing **bulk-delete auto-escalation** (>10 projects in 5 min, §2) are cheap and high-value.
- Encourage customers to keep **`.pryzm` exports** as their durable archive.

---

# ═══════════════════════════════════════════════════════════════
# TARGET STATE (C48 — NOT YET BUILT — do NOT follow as live procedure)
# ═══════════════════════════════════════════════════════════════

_Everything below describes the INTENDED C48 design (trash UI, cold-tier retention, `pryzm-ops restore-cold`). It is retained as the specification for **L-344** (build soft-delete + trash + restore). **It is NOT live.** When L-344 ships the tooling, delete the reality banner above and promote these sections back to the live procedure._

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

## §3 — Procedure (TARGET STATE — not built)

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

## §4 — Common pitfalls (TARGET STATE)

### §4.1 — Don't restore over a more-recent legitimate edit

If the customer deleted Project X on T-10d, then created a NEW Project X on T-2d, then asks to restore the old one — restore as `<name> (restored YYYY-MM-DD)` to avoid overwriting their current work. The trash UI does this automatically; manual restores in §3.3 MUST set the `--restored-suffix` flag.

### §4.2 — Don't restore deleted shared projects without the owner's consent

If the deleted project was shared with the customer (not owned by them), restoring the customer's view requires the OWNER's consent — unilaterally restoring breaches the C08 §3 cross-org confidentiality rule. CS contacts the owner via email; SRE waits for written confirmation.

### §4.3 — Document the "why" — every restore is audited

The note field on every restore is queried in the quarterly audit. "Restored on customer request" is not enough — include the ticket number, the customer-facing reason, the date.

---

## §5 — Verification — DID we hit the SLA? (TARGET STATE)

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
3. Should we add a "you're about to delete N projects — confirm" gate? **(Real near-term priority — see §0.2.)**

Single-project accidental deletes don't get post-incident reviews unless they uncovered something unusual.

---

## §7 — Related runbooks

- [RUNBOOK-RANSOMWARE.md](RUNBOOK-RANSOMWARE.md) — if the "delete" is actually malicious encryption
- [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) — DB-side failure, not user-initiated
- [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) — quarterly drill
- [C48 §1.6 retention table](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) — per-tier retention windows

---

## §8 — Drill cadence

This runbook is NOT drilled formally. **Note (L-349):** the "exercised in production every week" claim assumes a working restore path — until L-344 ships, §0 is the only exercisable procedure. The quarterly review checks: (a) any real §0 recovery attempts + outcomes, (b) progress on L-344 (trash/backup), (c) any tier-retention policy changes for when §3.4 becomes live.
