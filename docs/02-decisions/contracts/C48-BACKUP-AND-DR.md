# C48 — Backup & Disaster Recovery

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **backup + disaster-recovery surface** — what data is backed up, how often, where it is stored, how long it is retained, the recovery-time-objective (RTO) and recovery-point-objective (RPO) targets per data class, the per-customer self-serve version-history surface, the DR-drill cadence, the runbooks for every failure mode (DB corruption · region outage · ransomware · accidental delete · malicious insider · cascade failure), the cross-region replication policy, and the customer communication during incidents. **A backup nobody can restore is not a backup** — every retention policy is paired with an end-to-end restore test that runs on the same cadence as the backup itself.
> **Depends on**: [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (file-format the backup is composed of), [C08](C08-COLLABORATION-AND-SECURITY.md) (encryption at rest of backups), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (DR metrics dashboards), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (project retention windows + 90-day export grace), [C22](C22-PRIVACY-AND-PII-TIER.md) (per-tier retention; PII tier retention is shorter than project tier per GDPR), [C41](C41-TELEMETRY-AND-ANALYTICS.md) (telemetry retention tiers + cold-tier backup), [C47](C47-FILE-FORMAT-VERSIONING.md) (pre-migration originals preserved in backup), [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md) (cross-region replication policy).
> **Sibling**: [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md).
> **Downstream**: customer-facing "Version History" + "Restore" surfaces · ops runbook library at `docs/04-incidents/runbooks/` · DR-drill schedule + report · accountancy / audit evidence of compliant retention · the trust-page DR section.
> **Key principles**: **P8** (every backup run + every restore + every drill emits a span), **P5** (backup-record schemas L0-pure), **P6** (admin-side restore operations via commandBus), **P0.3** (plugin-data backup is included by default; plugin-specific exclusions explicit + announced).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §14 (Phase 6.4 operational)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.5](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Three data classes with distinct RPO + RTO

```
CLASS-1 PROJECT DATA  — .pryzm files, project metadata, element data, Yjs CRDT state
                       RPO ≤ 5 min · RTO ≤ 1 hour (region-restorable)
                       continuous WAL streaming + 5-min PG snapshot + hourly S3 backup

CLASS-2 BILLING + AUTH — Stripe records, subscription state, sign-in audit, entitlement
                         RPO ≤ 15 min · RTO ≤ 30 min (highest priority for restore)
                         continuous WAL + 15-min snapshot

CLASS-3 TELEMETRY      — TIER-2 + TIER-3 events (per C41), audit logs, analytics
                         RPO ≤ 24 hours · RTO ≤ 24 hours (lower priority)
                         nightly snapshot + weekly cold-tier copy
```

Class boundaries are binding — restoring CLASS-1 must not depend on CLASS-3 being restored. The runbooks per §1.10 honour the ordering.

### §1.2 — Backup retention schedule

| Class | Hot tier (S3 standard) | Warm tier (S3 IA) | Cold tier (S3 Glacier) | Total retention |
|---|---|---|---|---|
| CLASS-1 PROJECT | 14 days | 90 days | 7 years (compliance + customer commitment) | 7 years |
| CLASS-2 BILLING | 30 days | 1 year | 7 years (UK HMRC + IRS retention) | 7 years |
| CLASS-3 TELEMETRY | 30 days | 90 days | per tier — TIER-1 7 yrs, TIER-2 18 mo, TIER-3 13 mo | per [C41 §1.12](C41-TELEMETRY-AND-ANALYTICS.md) |

Hot tier is restorable in under 1 hour. Warm tier in 1-4 hours. Cold tier in 4-24 hours (Glacier retrieval latency). Customer-facing surfaces clearly note the cold-tier delay.

After total retention, data is hard-deleted via the standard S3 lifecycle policy + the corresponding PG retention sweep.

### §1.3 — Backups are encrypted + customer-keyed where applicable

Every backup is encrypted at rest using AES-256-GCM. Encryption keys live in AWS KMS with PRYZM-controlled key rotation per [C08](C08-COLLABORATION-AND-SECURITY.md).

For Enterprise customers with BYOK (per [C39 §1.10](C39-PRICING-AND-PLAN-TIERS.md)), the customer's KMS key encrypts THEIR project backups; revoking BYOK access blocks restore until reissued. This is a deliberate trade-off — BYOK customers accept restore-friction in exchange for cryptographic control. The contract surfaces this clearly during BYOK onboarding.

Cross-region backups stay encrypted with the same per-region key (Enterprise per-region BYOK is supported but adds complexity per [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md)).

### §1.4 — Every backup tier has a paired automated-restore test

The contract's core insight: an untested backup is not a backup. Each backup tier runs an end-to-end restore test:

- **Hot tier** — daily restore-spot-check: pick a random project from the past 24 h, restore to a sandbox, verify integrity (byte-identical after migration normalisation)
- **Warm tier** — weekly restore-spot-check: pick a random project from the past 30-day window, full restore including PG snapshot, verify
- **Cold tier** — quarterly restore-drill: pick a random project from the past 5 years (when applicable), restore from Glacier, verify

A failed restore-test BLOCKS the next backup until the failure is investigated. The contract refuses to mask backup-restore divergence.

### §1.5 — RPO + RTO targets per class

| Target | CLASS-1 PROJECT | CLASS-2 BILLING | CLASS-3 TELEMETRY |
|---|---|---|---|
| RPO (max data loss) | 5 min | 15 min | 24 h |
| RTO single-customer restore | 1 h | 30 min | 4 h |
| RTO multi-customer / region failover | 4 h | 1 h | 24 h |
| RTO regional disaster (full region loss) | 24 h | 8 h | 72 h |

RPO is measured by the gap between the last committed write and the last backup-able write. RTO is measured by the wall-clock from incident-declared to customer-restored.

DR drills verify the targets quarterly per §1.11.

### §1.6 — Cross-region replication is opt-in for project data, default for billing + auth

- **CLASS-1 PROJECT** — replicated to a SECONDARY region for Enterprise customers + opt-in Mid-firm customers. Solo + Studio operate single-region; their backup is in the primary region with cross-AZ redundancy but not cross-region. Cross-region adds cost + complexity that lower tiers don't subscribe to.
- **CLASS-2 BILLING + AUTH** — replicated to a SECONDARY region for ALL customers (Stripe + ID data is global-critical regardless of tier)
- **CLASS-3 TELEMETRY** — single-region (the warehouse layer handles its own replication)

Per [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md), the secondary region is data-residency-constrained: EU customers' secondary is EU; US customers' secondary is US; AP customers' secondary is AP. The contract does NOT cross-region across sovereignty boundaries.

### §1.7 — Customer-facing version history (90-day rolling)

Every customer has access to a per-project version history covering the last 90 days of saves:

- A list of saves with timestamps + who-saved
- Per-save preview (first level of the floor plan rendered at low resolution; click to see full project at that version)
- "Restore this version" CTA — creates a new project at the chosen version, preserving the current as the latest (no destructive restore)

Version history surface lives in `apps/editor/src/ui/version-history/`. Per-save retention follows the hot tier (14 days); older versions accessible via "Request older version" which retrieves from warm + cold (longer wait communicated in the UI).

### §1.8 — Customer self-serve restore vs ops-managed restore

| Restore kind | Surface | SLA |
|---|---|---|
| Self-serve version restore (within 90 days) | Version history modal | Immediate (warm-cached) |
| Self-serve deleted-project restore (within 30 days post-delete per C13) | Trash modal | Immediate |
| Ops-managed restore (older than 90 days or cross-customer scenarios) | Support ticket (per C42) | 4 h for Mid-firm + Enterprise; 24 h for Studio; 2 business days for Solo |
| Ops-managed disaster recovery | Internal ops runbook | Per RTO targets in §1.5 |

Self-serve restores do NOT require support involvement; the UI is the contract. Customers find Version History + Trash without instruction.

### §1.9 — Backup-tier integrity is verified continuously

Every backup file carries:

- A SHA-256 checksum of the contents
- A signature (HMAC-SHA256 keyed by per-region backup-attestation key)
- Object metadata including `customerOrgId`, `dataClass`, `backupRunId`, `originatingRegion`

A nightly job samples 0.1 % of backups + verifies their checksum + signature. Integrity failures alert ops within 5 minutes. A failed integrity check on a CLASS-1 backup is a SEV-1 incident (per [C42](C42-CUSTOMER-SUPPORT-TIER.md)).

### §1.10 — Per-failure-mode runbooks

For each high-priority failure mode, a runbook exists in `docs/04-incidents/runbooks/`:

- **DB primary failure** — failover to read replica + promote; SLA 30 min
- **Region full outage** — failover to secondary region; SLA 4 h
- **Ransomware / encrypted-payload attack** — quarantine + restore from cold tier; SLA 24 h (last-known-good is 5 min before)
- **Accidental project delete** — restore from trash within 30 days; older via support
- **Malicious insider access** — revoke credentials + audit + restore affected projects to pre-tamper state
- **Plugin data corruption** — uninstall affected plugin + restore plugin data from prior backup
- **Migration failure ([C47](C47-FILE-FORMAT-VERSIONING.md))** — restore pre-migration original from backup
- **CRDT divergence** — restore to last successful snapshot of CRDT state

Runbooks are owned by the ops lead, reviewed quarterly, tested per §1.11.

### §1.11 — Quarterly DR drill

Once a quarter, the team runs a full DR drill:

- Simulate a regional outage at ~T+0
- Failover to the secondary region per the runbook
- Restore a representative customer set (~10 customers across plan tiers)
- Verify customer access + data integrity
- Document timing vs. RTO targets in `docs/04-incidents/drills/YYYY-QN-DR-DRILL.md`
- Iterate: any RTO miss → updated runbook + retest

The drill is announced internally; not announced to customers (avoiding false-alarm fatigue). Findings + improvements are published in the quarterly trust-report.

### §1.12 — Every backup operation emits a span

Per P8:

- `pryzm.backup.run` — `{ class, region, customerCount, byteSize, durationMs }`
- `pryzm.backup.restore` — `{ class, customerOrgId, fromBackupAt, toBackupAt, byteSize, durationMs }`
- `pryzm.backup.integrityCheck` — `{ class, sampleSize, failures }`
- `pryzm.backup.restoreTest` — `{ class, tier, passed, durationMs }`
- `pryzm.backup.lifecycleTransition` — `{ class, from: 'hot' \| 'warm' \| 'cold', to: 'warm' \| 'cold' \| 'deleted' }`
- `pryzm.dr.drill.run` — `{ scenario, durationMs, rtoTargetMs, actualMs, missedTargets }`

Spans MUST open at the public boundary of `packages/backup/`.

### §1.13 — Customer-facing communication during DR events

During an incident affecting backup + restore:

- `status.pryzm.app` is the canonical comm surface (per [C42 §1.8](C42-CUSTOMER-SUPPORT-TIER.md))
- A `pryzm.app/dr-status` page shows the current restore-queue depth + per-class restore SLA
- Affected customers receive proactive email within 1 h of incident declaration
- Affected customers get an in-product banner explaining the situation + the expected resolution time

The proactive comm is a deliberate stance — silence during an incident damages trust more than honest "we're working on it".

### §1.14 — Plugin data backup default-in

Plugin-defined data (per [C47 §1.10](C47-FILE-FORMAT-VERSIONING.md)) is backed up by default — it's part of the customer's project. Exceptions (e.g. plugin-defined caches that are recomputable) MUST be explicitly listed in the plugin's manifest as `backupable: false`; the marketplace curation gate verifies the list.

A customer uninstalling a plugin retains the plugin-data in backups for the standard retention period; re-installing within the window restores plugin functionality.

### §1.15 — Discipline-neutrality + retention exception transparency

Retention policies MUST NOT vary by customer discipline. Per the C00 governance bar.

Exceptional retention (legal hold, litigation, regulator request) is documented in the customer's account (a "Legal hold" badge with the start date + the source authority). Customers see the badge; the exception is auditable. Per [C22](C22-PRIVACY-AND-PII-TIER.md), the customer is informed of the hold unless the legal authority prohibits disclosure (e.g. national-security letters).

---

## §2 — Schema (in `packages/schemas/src/backup/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `DataClass` | `'CLASS-1-PROJECT' \| 'CLASS-2-BILLING' \| 'CLASS-3-TELEMETRY'` |
| `BackupTier` | `'hot' \| 'warm' \| 'cold' \| 'deleted'` |
| `BackupRunId` | branded string |
| `BackupRun` | `{ id: BackupRunId, class: DataClass, region: ISO3166, startedAt, completedAt?, customerCount, byteSize, status: 'in_progress' \| 'completed' \| 'failed', failureReason? }` |
| `BackupRecord` | `{ id, runId, customerOrgId, class, tier, originatingRegion, s3Key, sha256, signature, sizeBytes, recordedAt, expiresAt }` |
| `RestoreRequest` | `{ id, customerOrgId, class, fromBackupAt, kind: 'self_serve' \| 'ops_managed' \| 'dr', requestedBy, requestedAt, startedAt?, completedAt?, status: 'queued' \| 'in_progress' \| 'completed' \| 'failed' }` |
| `IntegrityCheck` | `{ id, runAt, sampleSize, failures: number, classBreakdown: Record<DataClass, number> }` |
| `RestoreTest` | `{ id, class, tier, runAt, passed: boolean, durationMs, failureReason? }` |
| `DRDrill` | `{ id, scenario: string, runAt, durationMs, rtoTargetMs, actualMs, customersAffected, passed: boolean, reportLocation: URL }` |
| `Runbook` | `{ id, scenario, ownerAgentId, lastReviewedAt, lastTestedAt, fileLocation: URL }` |
| `LegalHold` | `{ id, customerOrgId, source: string, startedAt, endsAt?, reasonHash, disclosurePermitted: boolean }` |
| `VersionHistoryEntry` | `{ projectId, savedAt, savedByUserId, backupRecordId, previewURL? }` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `BackupRun.byteSize` | `integer >= 0` |
| `BackupRecord.sha256` | 64-char hex |
| `BackupRecord.signature` | non-empty HMAC-SHA256 |
| `RestoreRequest.fromBackupAt` | ≥ data-class minimum retention (no restore from beyond-retained) |
| `DRDrill.actualMs` | `> 0`; comparison vs `rtoTargetMs` determines `passed` |
| `LegalHold.reasonHash` | 64-char SHA-256 (the reason itself stored in legal ops; hash here) |

### §2.3 — Cross-class retention matrix

The §1.2 table is the binding source. Compile-time constants in `packages/schemas/src/backup/retentionConstants.ts`. Changes require an ADR.

---

## §3 — Stores

### §3.1 — `BackupLedger` (`server/backup/BackupLedger.ts`)

Server-side, append-only. Records every `BackupRun` + `BackupRecord`. Per-class indexed for fast restore lookup.

### §3.2 — `RestoreQueue` (`server/backup/RestoreQueue.ts`)

Server-side. Holds in-progress `RestoreRequest` records. The restore worker pool consumes from this queue.

### §3.3 — `IntegrityCheckLedger` (`server/backup/IntegrityCheckLedger.ts`)

Server-side, append-only. Records every `IntegrityCheck` + `RestoreTest`.

### §3.4 — `DRDrillLog` (`server/backup/DRDrillLog.ts`)

Server-side, append-only. Records every `DRDrill`.

### §3.5 — `LegalHoldRegistry` (`server/backup/LegalHoldRegistry.ts`)

Server-side. Holds active `LegalHold` records. Consulted by the retention sweep — held data is NOT deleted regardless of retention window.

### §3.6 — Persistence

Server-side stores in PostgreSQL (small metadata) + S3 (the actual backup objects). The PG store is itself backed up under CLASS-2.

### §3.7 — Backup pipeline

```
schedule: continuous WAL streaming for CLASS-1 + CLASS-2
         + 5-min PG snapshot for CLASS-1
         + 15-min PG snapshot for CLASS-2
         + nightly snapshot for CLASS-3
   │
   ▼  for each scheduled tick:
   │     - take consistent snapshot (PG pg_dump or equivalent)
   │     - encrypt with per-region KMS key
   │     - upload to S3 hot tier
   │     - record BackupRecord with sha256 + signature
   │     - emit pryzm.backup.run
   │
   ▼  lifecycle policy:
   │     - hot tier → warm at age threshold
   │     - warm → cold at threshold
   │     - cold → deleted at total-retention exit (unless LegalHold)
   │
   ▼  nightly integrity check:
   │     - sample 0.1 % across all backups
   │     - verify sha256 + signature
   │     - emit pryzm.backup.integrityCheck
   │     - failure → SEV-1
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.12.

### §4.1 — Customer-facing

| Command | Effect |
|---|---|
| `backup.requestRestore` | Customer-initiated self-serve restore (within 90 days) |
| `backup.viewVersionHistory` | Open the version-history surface |
| `backup.restoreFromVersion` | Restore a project to a chosen prior version (non-destructive — creates a new project at that version) |
| `backup.requestOlderVersion` | For pre-90-day restores; routes through support |

### §4.2 — Admin / ops-facing

| Command | Effect |
|---|---|
| `backup.runFullBackup` | Manual ops trigger (typically not needed; cron handles it) |
| `backup.runIntegrityCheck` | Manual integrity check (cron handles it; manual for spot-investigation) |
| `backup.restoreOpsManaged` | Ops-initiated restore (customer ticket triggered) |
| `backup.declareLegalHold` | Add a legal hold for a customer (with reasonHash) |
| `backup.releaseLegalHold` | Release a legal hold |
| `backup.runDRDrill` | Trigger a DR drill (quarterly) |
| `backup.publishRunbookUpdate` | Update a runbook (per quarterly review) |
| `backup.queryRestoreQueue` | Read-only — current restore-queue depth |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `backup.runScheduledTick` | Cron — runs the scheduled backup per data class |
| `backup.runLifecycleTransition` | Cron — moves objects through hot → warm → cold per the policy |
| `backup.runRestoreTest` | Daily / weekly / quarterly per tier |
| `backup.notifyCustomerOfIncident` | Triggered during DR events (proactive email per §1.13) |
| `backup.recordRetentionExpiry` | Cron — deletes objects past total retention |

---

## §5 — UI

### §5.1 — Version history (customer)

`apps/editor/src/ui/version-history/` — per-project. Renders:

- A timeline of saves (last 90 days + a "older" CTA for pre-90-day requests)
- Per-save: timestamp, who-saved, a small preview thumbnail
- Click → opens a side-by-side compare view (current vs. selected version)
- "Restore this version" CTA — creates a new project at that version (non-destructive)
- "Download as `.pryzm`" CTA — exports the version as a file
- "Request restore" CTA — for ops-managed older restores (routes to support)

### §5.2 — Trash (customer)

`apps/editor/src/ui/trash/` — list of deleted projects within the 30-day window. Renders:

- Per-project: deleted at, deleted by, "Restore" CTA, "Delete permanently" CTA
- Filter by date range + by who-deleted-it

After 30 days, projects are hard-deleted; restoration requires ops-managed restore.

### §5.3 — DR-status page (public)

`pryzm.app/dr-status` — surfaced during DR events. Renders:

- Current restore-queue depth per class
- Active incident summary
- Expected resolution time per RTO targets
- "Subscribe to updates" CTA

### §5.4 — Ops backup dashboard

`apps/admin-tools/src/backup/` — ops-only. Renders:

- Backup run history (success rate, byte size trend)
- Integrity check results
- Restore queue + per-restore progress
- Runbook library + last-tested-at per runbook
- DR drill report archive

### §5.5 — Legal-hold badge

In the customer's account page, a "Legal hold" badge appears when a hold is active. Click → modal explaining (in plain language) that some data is held + the contact email for questions.

### §5.6 — Keyboard surface

Standard keyboard accessibility on all surfaces per [C43](C43-ACCESSIBILITY.md). Restore CTAs reachable + announced via screen reader (e.g. "Restore to version saved 2 days ago by [user]").

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-backup-retention-matrix` | runtime — schema validator | The §1.2 retention matrix is the binding source; runtime config must match |
| `check-restore-test-cadence` | scheduled job + alert | Hot-tier restore-test runs daily; weekly for warm; quarterly for cold; missed runs alert ops |
| `check-runbook-last-tested` | scheduled job + alert | Every runbook has `lastTestedAt` within 90 days; misses alert ops lead |
| `check-dr-drill-quarterly` | scheduled job + alert | A DR drill is run + reported within 90 days; misses alert head of engineering |
| `check-backup-spans` | extends `check-spans.ts` | Every public `packages/backup/` boundary function carries an OTel span (per §1.12) |
| `check-backup-schemas-pure` | extends schema-purity check | `packages/schemas/src/backup/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-rpo-rto-budget` | runtime — alert | Per-class RPO + RTO budgets monitored; sustained excess fires SEV-2 |
| `check-encryption-at-rest` | runtime — middleware | Every BackupRecord upload to S3 is encrypted with the per-region KMS key; non-encrypted writes rejected |
| `check-cross-region-sovereignty` | runtime — schema validator | A BackupRecord's secondary region matches the customer's sovereignty constraint per [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| `check-no-restore-test-failures-masked` | runtime — alert | A failed restore test halts the next backup run for that tier; cannot be silently ignored (per §1.4) |
| `check-plugin-data-backup-coverage` | `tools/ga-gate/check-plugin-data-backup-coverage.ts` | Plugin manifests with `backupable: false` for non-cache data flagged in curation |
| `check-legal-hold-retention-respected` | runtime — retention sweep | A LegalHold-flagged backup is NOT deleted regardless of retention age |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Backup integrity | `server/backup/__tests__/integrity.test.ts` | sha256 + signature round-trips correctly; tampering detection works |
| Restore-test cadence | `server/backup/__tests__/restore-test-cadence.test.ts` | Each tier's restore test fires on schedule |
| Per-class RTO | `server/backup/__tests__/rto-per-class.test.ts` | Synthetic restore for each class meets the documented RTO target |
| Lifecycle transitions | `server/backup/__tests__/lifecycle.test.ts` | Hot → warm → cold → deleted progression honoured + reversible (warm → hot for retrieved restores) |
| Plugin data preservation | `server/backup/__tests__/plugin-data.test.ts` | Plugin data survives the customer's plugin uninstall (retention preserved) |
| Legal hold respect | `server/backup/__tests__/legal-hold.test.ts` | Held data is NOT deleted; held data IS restorable; release of hold resumes retention countdown |
| Sovereignty preservation | `server/backup/__tests__/sovereignty.test.ts` | EU customer's secondary backup never goes to US region (per [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md)) |
| DR drill workflow | `server/backup/__tests__/dr-drill.test.ts` | A simulated regional outage triggers failover within RTO target |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| CLASS-1 5-min snapshot run | < 4 min (leaves margin) | `class1-snapshot.bench.ts` (new) |
| CLASS-2 15-min snapshot run | < 12 min | `class2-snapshot.bench.ts` (new) |
| Self-serve restore (single project, hot tier) | < 30 s | `self-restore-hot.bench.ts` (new) |
| Self-serve restore (single project, warm tier) | < 5 min | `self-restore-warm.bench.ts` (new) |
| Self-serve restore (single project, cold tier) | < 1 h | `self-restore-cold.bench.ts` (new) |
| Integrity check (0.1 % sample of ~10M backup objects) | < 8 h | `integrity-check.bench.ts` (new) |
| DR drill regional failover | < 4 h (per §1.5) | `dr-drill-failover.bench.ts` (new) |
| Version history cold-load (last 90 days, ~500 saves) | < 800 ms | `version-history-load.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — Server-side: `server/backup/`

```
server/backup/
  scheduler.ts                     — cron tick driver
  pgSnapshotter.ts                 — PG snapshot capture
  walStreamer.ts                   — continuous WAL streaming
  s3Uploader.ts                    — encrypted upload to S3
  lifecycleManager.ts              — tier transitions
  integrityChecker.ts              — sample-based verification
  restoreWorker.ts                 — restore queue consumer
  restoreTestRunner.ts             — daily / weekly / quarterly tests
  drDrillCoordinator.ts            — quarterly drill orchestration
  legalHoldRegistry.ts             — hold management
  notificationDispatcher.ts        — incident comm
```

The client side is thin — only the version-history + trash + DR-status surfaces.

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| BACKUP-α-1 | `packages/schemas/src/backup/` + zod | 0.3 wk |
| BACKUP-α-2 | Server-side scheduler + PG snapshotter + S3 uploader for CLASS-1 | 1 wk |
| BACKUP-α-3 | CLASS-2 + CLASS-3 backup paths | 0.5 wk |
| BACKUP-β-1 | Lifecycle manager (hot → warm → cold) + retention sweep | 0.5 wk |
| BACKUP-β-2 | Encryption at rest + KMS integration + BYOK | 1 wk |
| BACKUP-β-3 | Integrity checker + nightly verification | 0.5 wk |
| BACKUP-β-4 | Restore worker pool + restore queue | 1 wk |
| BACKUP-γ-1 | Version history UI + restore-from-version | 1 wk |
| BACKUP-γ-2 | Trash UI + 30-day delete-recover | 0.5 wk |
| BACKUP-γ-3 | Cross-region replication (per [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md) wiring) | 1 wk |
| BACKUP-γ-4 | Legal hold + retention sweep integration | 0.5 wk |
| BACKUP-δ-1 | Runbook authoring (9 scenarios) | 1 wk |
| BACKUP-δ-2 | DR drill coordinator + first drill | 1 wk |
| BACKUP-δ-3 | Restore-test runner + cadence enforcement | 0.5 wk |
| BACKUP-δ-4 | Ops backup dashboard | 1 wk |
| BACKUP-δ-5 | DR-status page + customer notification flow | 0.5 wk |
| BACKUP-δ-6 | CI gates (§6) all green | 0.5 wk |

**Total: ~11 wk** (Phase 6.4 longest).

### §8.3 — Backward compatibility

The product today has ad-hoc PG dumps + S3 storage. The C48 codification adds the systematic restore-testing + the customer-facing surfaces + the cross-region replication. No customer migration; existing backups roll into the new lifecycle.

### §8.4 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Each scenario + each runbook has a vitest suite. End-to-end: synthetic regional outage triggered in staging → drill workflow runs → restore verifies → RTO measured.

---

## §9 — What is NOT in this contract

- **Project version history beyond 90 days** — covered by warm + cold backup retrieval; the customer surface is "request via support".
- **Real-time replication of CRDT state** — handled by Yjs sync per [C08](C08-COLLABORATION-AND-SECURITY.md); the BackupLedger captures snapshots of CRDT state, not real-time replication.
- **Customer-managed off-PRYZM backup** — out of scope. Customers MAY export `.pryzm` files for their own off-platform backup; PRYZM does not orchestrate this.
- **Database vendor selection** — PostgreSQL is the operational DB; this is fixed at the architecture level + not under C48.
- **Backup-storage vendor selection** — S3 is the storage; vendor lock-in deliberate for the cost + reliability trade-off.
- **HIPAA / Pii-specific backup requirements** — not applicable today (PRYZM is not a healthcare product); reconsider if expansion into healthcare domains.
- **Cryptocurrency wallet backups** — out of scope (not a relevant data class).
- **Plugin author's own data backups** — plugins backed up as part of the customer's project; plugin-author-side analytics or monetization data is the marketplace's separate concern.
- **AI host conversation history** — backed up as part of CLASS-1 project data; the AI host doesn't have a separate backup track.

---

## §10 — Open questions (DRAFT-stage)

1. **WAL retention duration**. Continuous WAL with 5-min snapshot for CLASS-1: how long to keep the WAL stream itself? 30 days? 90 days? Trade-off: granular point-in-time-recovery (WAL gives second-level RPO) vs. storage cost.
2. **Per-customer backup-cost passthrough**. Heavy Solo customers (1000 projects, 100 MB each = 100 GB) cost more to back up than light Mid-firm customers. Should backup cost flow through to plan pricing? Currently no — included in plan flat. Reconsider at scale.
3. **Backup-time freeze for very active customers**. Customers with continuous CRDT updates may stress the 5-min snapshot. A consistent snapshot requires a transient write-lock (~100 ms). Acceptable for most customers; for the most active, consider snapshot-from-replica.
4. **Restore-test sample selection bias**. §1.4 picks a random project. Should the selection bias toward edge cases (very large, very small, plugin-heavy, recently-migrated)? Trade-off: coverage vs. simplicity.
5. **Plugin data integrity on restore**. A plugin update between save + restore could cause data-shape divergence on restore. Currently we restore plugin data verbatim; the plugin must handle the (rare) older-format-data case. Better answer?
6. **DR drill scope**. Quarterly drills are full-region-outage. Smaller drills (e.g. PG primary failure, single-AZ outage) might run monthly. Worth scheduling? Trade-off: practice frequency vs. ops fatigue.
7. **Customer-facing DR drill announcement**. §1.11 says drills are not announced to customers. But silent drills could surface customer alarm if any drill artifact leaks (e.g. a "we're testing failover" status-page-flicker). Worth pre-announcing low-impact drills?
8. **Legal hold disclosure default**. §1.15 defaults to "informed unless prohibited". US national-security letters explicitly prohibit; UK statutory holds vary. The decision matrix needs legal counsel review.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every backup mutation through commandBus; schemas L0-pure |
| [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) | The file-format being backed up |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Encryption at rest using shared KMS; BYOK boundaries |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for every backup operation; NFT dashboards |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Trash 30-day window + project retention windows aligned |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `backup.*` commands follow the protocol |
| [C22](C22-PRIVACY-AND-PII-TIER.md) | PII tier retention vs project tier retention; per-tier cold-tier policy |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | Cross-region replication opt-in by plan tier; BYOK enterprise gating |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | Telemetry retention tiers; CLASS-3 alignment |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Ops-managed restores route via support; DR incidents → SEV-1 |
| [C47](C47-FILE-FORMAT-VERSIONING.md) | Pre-migration originals preserved in backup tier |
| [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Cross-region replication sovereignty constraints |

---

*End — C48 Backup & Disaster Recovery, 2026-06-01 — DRAFT.*
