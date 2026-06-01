# C22 — Privacy & PII Tier

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: data classification (PII · PROJECT · TELEMETRY · DERIVED), tier-aware storage routing, retention, anonymisation, customer-managed encryption (BYOK), data-subject access requests (DSAR), and breach reporting. The binding rules for GDPR / CCPA / UK GDPR / SOC 2 compliance.
> **Depends on**: [C05 Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md) · [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) · [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) · [C13 Project Lifecycle & Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)
> **Downstream**: every server module that reads or writes user data (`server/authStore.js`, `server/projectStore.js`, `server/auditLogMiddleware.js`, `server/telemetry.js`, the persistence client, the AI host). Every UI surface that displays an email address or invites a user.
> **Key principles**: P8 (every public function emits a span — this contract extends P8 with `pryzm.pii.*` span requirements).

---

## §1 — Invariants

The binding rules. CI gates (§6) enforce each one.

### §1.1 — Tier-tag-at-write

Every piece of data written to durable storage MUST carry a `DataTier` tag at write time. The tag is an enum value of `'pii' | 'project' | 'telemetry' | 'derived'`. Writes without a tag MUST be rejected by the `StorageRouter` (§3.2) with `error: 'C22_MISSING_TIER_TAG'`.

The tag is set on:
- the row (`audit_log.tier`, `project_versions.tier`, etc.),
- the bucket key prefix (`s3://pryzm-pii-eu/...` vs `s3://pryzm-project-eu/...`),
- the OTel span attribute (`pryzm.data.tier`).

A row with two tags (e.g. a `pii` tag written to the `project` bucket) is a Sev-1 incident — the `check-data-tier-tag` CI gate (§6.1) refuses any code that allows it.

### §1.2 — Anonymisation on downcast

Cross-tier reads that lower the privacy level (PROJECT → TELEMETRY, PII → TELEMETRY, PROJECT → DERIVED) MUST pass through an anonymisation transform that strips re-identifiable PII fields. The transform is the only legal path; direct `SELECT pii.email FROM project_versions JOIN ...` is **FORBIDDEN**.

The transform is owned by `server/anonymise.js` (to be created) and registered with the `StorageRouter`. The route table:

| From | To | Transform |
|---|---|---|
| PII | TELEMETRY | hash email + name with HMAC-SHA256 keyed by `ANONYMISE_SALT`; drop IP last octet (v4) / last 80 bits (v6) |
| PROJECT | TELEMETRY | strip element labels matching `\b[A-Z][a-z]+ [A-Z][a-z]+\b` (person-name heuristic); strip any property whose value matches an email regex; aggregate to per-project counts |
| PROJECT | DERIVED | preserve element ids + geometry; strip user-authored text labels longer than 64 chars; strip `created_by` |
| PII | DERIVED | **FORBIDDEN** — DERIVED tier MUST NOT receive PII even hashed |

A downcast attempted without a registered transform MUST throw `C22_NO_TRANSFORM`.

### §1.3 — Region honoured for PROJECT + PII

Every customer record carries a `regionPreference: 'eu' | 'us' | 'ap' | 'self-hosted'` field on the `pryzm_users` table. The `StorageRouter` MUST honour this field for PII and PROJECT tier writes: an EU-region customer's project data MUST land in an EU bucket / EU database. TELEMETRY may aggregate cross-region (see §2.4). DERIVED follows the PROJECT region of its source project.

A write whose `customerRegion` does not match the bucket region MUST be rejected with `C22_REGION_MISMATCH`.

### §1.4 — BYOK deny-default

Customer-managed encryption keys (BYOK) MUST be supported for the PROJECT tier. When a customer enables BYOK (`pryzm_users.byok_enabled = true`), every PROJECT-tier read AND write MUST first resolve the customer's key from the configured KMS endpoint. If the key resolve fails (key revoked, KMS unreachable, key version mismatch), the operation MUST be **denied** — never silently fall back to the platform key.

Deny response: HTTP 503 with `error: 'C22_BYOK_KEY_UNAVAILABLE'` and a Retry-After header.

PII tier is encrypted with platform keys only — BYOK does NOT apply to PII (because the platform must always be able to decrypt PII for DSAR processing and law-enforcement requests). This boundary MUST be displayed to the customer in the BYOK setup UI (§5.3).

### §1.5 — DSAR resolution within 30 days

A `pii.dsar.export(userId)` or `pii.dsar.delete(userId)` command MUST resolve within 30 calendar days of the request being acknowledged (the GDPR Article 12(3) ceiling). The `RetentionScheduler` (§3.3) MUST surface any in-flight DSAR older than 25 days as a Sev-1 alert.

The DSAR pipeline:
1. User submits via the account-settings panel (§5.1).
2. Request lands in `dsar_requests` table with `status: 'pending'`, `submittedAt`, and SLA `dueAt = submittedAt + 30d`.
3. Worker (`apps/dsar-worker/`, to be created) picks up the row, exports / deletes, sets `status: 'completed'`, emits `pryzm.dsar.completed` OTel span.
4. The customer receives an email (PII tier, audit-logged) with the export bundle or the deletion confirmation.

If the worker fails three times in a row on the same request, the row is escalated to `status: 'manual'` and the privacy team is paged.

### §1.6 — Right-to-delete cascade ≤ 90 days

A `pii.dsar.delete(userId)` MUST cascade through:
- PII tier (immediate — `pryzm_users` row redacted; `auth_sessions` rows hard-deleted),
- PROJECT tier (immediate — every project owned by `userId` and every project_member row referencing `userId`),
- TELEMETRY tier (already anonymised; the worker MUST verify that no re-identifiable trace remains using a sample audit),
- DERIVED tier (cascade via `derived_artefacts.source_project_id`),
- backups (delayed — the next backup run MUST exclude the deleted records; complete purge from all backup generations MUST complete within 90 days).

The `BackupRetentionScheduler` (§3.4) MUST not retain a backup older than 90 days that still contains deleted-user records. Backup generations beyond 90 days are forbidden; this caps the worst-case right-to-delete latency at 90 days.

A delete that fails to cascade is a Sev-1 compliance incident.

### §1.7 — PII read/write spans

Every PII read or write MUST emit an OpenTelemetry span named `pryzm.pii.<verb>` where `<verb>` is one of:
- `pryzm.pii.read` (a SELECT from a PII-tier table or bucket),
- `pryzm.pii.write` (an INSERT / UPDATE),
- `pryzm.pii.delete` (a hard-delete or soft-redact),
- `pryzm.pii.export` (DSAR export),
- `pryzm.pii.access-denied` (a denied attempt).

The span MUST carry:
- `pryzm.user.id` (the data subject, NOT the actor),
- `pryzm.actor.id` (who initiated the read/write),
- `pryzm.actor.role` (`'user' | 'service' | 'admin' | 'support'`),
- `pryzm.data.tier = 'pii'`,
- `pryzm.pii.field` (which column / which JSON path was touched),
- `pryzm.region` (the bucket / db region the data lives in).

This is the audit log. The `check-pii-otel-spans` CI gate (§6.2) refuses any new code path that touches a PII column without producing one of these spans.

### §1.8 — TELEMETRY tier no re-identifiable PII

The TELEMETRY tier MUST NOT contain re-identifiable PII. The test (§6.4) is **empirical**: a privacy auditor takes a 100-record sample from the TELEMETRY tier each release and attempts re-identification using public data sources + standard re-identification techniques (k-anonymity check at k≥5; l-diversity check at l≥2 on sensitive attributes). Any successful re-identification is a Sev-1 release blocker.

Specifically forbidden in TELEMETRY:
- email addresses (any form, hashed or otherwise),
- full names,
- IP addresses with > 24-bit precision (v4) / > 48-bit precision (v6),
- precise GPS coordinates (rounded to ±1 km grid maximum),
- birth dates (year-only allowed),
- any property-bag with a string longer than 64 chars (free-text exfil risk).

### §1.9 — Breach notification ≤ 72 h

A confirmed breach (any unauthorised disclosure of PII or PROJECT tier data) MUST be:
1. Logged in `breach_incidents` table with `confirmedAt` and severity within 1 hour of confirmation.
2. Notified to the lead supervisory authority within **72 hours** of `confirmedAt` (GDPR Article 33).
3. Notified to affected data subjects without undue delay if the breach is high-risk (GDPR Article 34).

The `BreachIncidentLog` (§3.5) MUST surface any `confirmedAt > 60h` incident as a Sev-1 alert so the 72 h ceiling is never breached by accident.

The "confirmed" threshold is set at: the security team has reproduced the disclosure OR the platform has logged evidence of unauthorised access AND the privacy team has signed off that it is a breach (not a near-miss). Near-misses are logged separately in `security_events` and do not trigger the 72 h clock.

### §1.10 — Retention ≤ tier policy

Every tier has a maximum retention. Data older than its tier's `maxRetentionDays` MUST be hard-deleted by the `RetentionScheduler` (§3.3). The defaults:

| Tier | Max retention | Notes |
|---|---|---|
| PII | until account-delete + 30 d (grace period for accidental delete reversal) | The 30 d window is the ONLY PII retention beyond account life. |
| PROJECT | until account-delete + 30 d, OR explicit per-project archive (max 7 years for IFC/RIBA compliance) | Customer may extend per-project. |
| TELEMETRY | 13 months (rolling) | Long enough for YoY trend analysis; short enough to limit exposure. |
| DERIVED | until source project is deleted | Cascades from PROJECT. |

A row whose `createdAt + tier.maxRetentionDays < now()` MUST be deleted on the next sweep. A row that misses three sweeps in a row is a Sev-2 incident.

### §1.11 — PII fields enumerated

The set of fields classified as PII MUST be enumerated in `packages/schemas/src/pii-registry.ts` and is the single source of truth. Code adding a new column to any user-facing table MUST classify it in this registry; the `check-pii-classification` CI gate (§6.6) refuses any DB migration that adds a column without registry coverage.

The minimum PII set (immutable floor):
- `pryzm_users.email`, `pryzm_users.display_name`, `pryzm_users.given_name`, `pryzm_users.family_name`,
- `auth_sessions.ip_address`, `auth_sessions.user_agent`,
- `project_members.invited_email`,
- OAuth subject identifiers (`oauth_providers.subject`),
- any free-text field a user can type that could contain personal data (e.g. project description, BCF comment author identity).

A field that is "PII-derived" (e.g. user initials computed from `display_name`) inherits the PII tier.

### §1.12 — Consent stored explicitly

Every non-essential data-processing purpose (analytics, marketing email, AI training opt-in, third-party sharing) MUST be recorded as an explicit consent row in `consents` table, keyed by `(userId, purpose, version)` with `grantedAt` and an optional `revokedAt`. The schema is owned by C22; the consent UX is owned by [C41 Telemetry & Analytics](./C41-...) (proposed).

The default for every new consent purpose is **deny**. A user who has not granted consent for purpose `X` MUST NOT have data processed for purpose `X`. The `check-consent-required` CI gate (§6.7) wraps every annotated entry point with a consent check.

---

## §2 — Schema

### §2.1 — `DataTier` enum

```typescript
// packages/schemas/src/data-tier.ts
export const DataTier = {
  PII: 'pii',
  PROJECT: 'project',
  TELEMETRY: 'telemetry',
  DERIVED: 'derived',
} as const;
export type DataTier = typeof DataTier[keyof typeof DataTier];
```

The enum is closed. Adding a new tier requires an ADR.

### §2.2 — `StorageRoutingPolicy`

```typescript
// packages/schemas/src/storage-routing-policy.ts
export interface StorageRoutingPolicy {
  /** The tier this policy governs. */
  tier: DataTier;
  /** Per-region bucket / database endpoints. */
  endpoints: {
    eu: { bucket: string; db: string };
    us: { bucket: string; db: string };
    ap: { bucket: string; db: string };
    selfHosted?: { bucket: string; db: string };
  };
  /** Encryption requirement. */
  encryption: {
    atRest: 'aes-256-gcm';
    inTransit: 'tls-1.3-min';
    keyMode: 'platform' | 'byok' | 'either';
  };
  /** Maximum retention before forced purge. */
  maxRetentionDays: number;
  /** Allowed downcast transforms out of this tier. */
  allowedDowncasts: Array<{ to: DataTier; transformId: string }>;
}
```

### §2.3 — `RetentionPolicy`

```typescript
// packages/schemas/src/retention-policy.ts
export interface RetentionPolicy {
  tier: DataTier;
  /** Forced-purge ceiling. */
  maxDays: number;
  /** Backup-purge ceiling (must be ≤ 90 for PII per §1.6). */
  maxBackupDays: number;
  /** What triggers an early purge before maxDays. */
  earlyPurgeTriggers: Array<
    | 'account-delete'
    | 'project-delete'
    | 'consent-revoke'
    | 'dsar-delete'
    | 'parent-delete'
  >;
  /** Sweep cadence (minutes). */
  sweepIntervalMinutes: number;
}
```

### §2.4 — `DSARRequest`

```typescript
// packages/schemas/src/dsar.ts
export type DSARType = 'export' | 'delete' | 'rectify';
export type DSARStatus =
  | 'pending'      // freshly submitted
  | 'in-progress'  // worker has picked up
  | 'completed'
  | 'manual'       // escalated to privacy team
  | 'rejected';    // identity not verified

export interface DSARRequest {
  id: string;
  userId: string;
  type: DSARType;
  status: DSARStatus;
  submittedAt: string;  // ISO-8601
  acknowledgedAt: string | null;
  dueAt: string;        // submittedAt + 30d (§1.5)
  completedAt: string | null;
  /** Identity-verification token (proves the user owns the email). */
  verificationToken: string;
  verifiedAt: string | null;
  /** Worker that picked this up. */
  workerId: string | null;
  attempts: number;
  /** Where the export bundle landed. PII bucket, expires in 30 d. */
  exportBundleUrl: string | null;
  /** For rectify: the fields the user wants changed + the new values. */
  rectifyPatch: Record<string, unknown> | null;
}
```

### §2.5 — `BreachIncident`

```typescript
// packages/schemas/src/breach-incident.ts
export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BreachStatus =
  | 'suspected'
  | 'confirmed'
  | 'notified-authority'
  | 'notified-subjects'
  | 'closed';

export interface BreachIncident {
  id: string;
  detectedAt: string;
  confirmedAt: string | null;  // starts the 72 h clock (§1.9)
  status: BreachStatus;
  severity: BreachSeverity;
  /** Tiers affected. */
  tiersAffected: DataTier[];
  /** Approximate number of records exposed. */
  recordsAffected: number;
  /** Approximate number of unique data subjects exposed. */
  subjectsAffected: number;
  /** Regions whose customers are affected. */
  regionsAffected: Array<'eu' | 'us' | 'ap'>;
  /** Free-text incident narrative. */
  description: string;
  /** Lead supervisory authority notification. */
  authorityNotification: {
    authority: string;     // e.g. 'ICO' for UK, 'CNIL' for FR
    sentAt: string;
    referenceNumber: string | null;
  } | null;
  /** Data-subject notification (if Article 34 high-risk). */
  subjectNotification: {
    sentAt: string;
    method: 'email' | 'in-app' | 'postal';
    template: string;
  } | null;
  closedAt: string | null;
  rootCause: string | null;
  remediation: string | null;
}
```

### §2.6 — `Consent` row

```typescript
// packages/schemas/src/consent.ts
export type ConsentPurpose =
  | 'analytics'
  | 'marketing-email'
  | 'ai-training'
  | 'third-party-sharing'
  | 'product-research-interview';

export interface Consent {
  userId: string;
  purpose: ConsentPurpose;
  /** The version of the consent text the user agreed to. */
  version: string;
  grantedAt: string;
  revokedAt: string | null;
  /** Source of the consent click (account settings, signup, in-app modal). */
  source: 'signup' | 'settings' | 'modal' | 'api';
}
```

### §2.7 — `pii_access_log` (the audit table)

```sql
-- server/dbMigrate.js — added in §8.1 migration
CREATE TABLE pii_access_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,        -- 'user' | 'service' | 'admin' | 'support'
  subject_user_id TEXT NOT NULL,   -- whose PII was touched
  verb TEXT NOT NULL,              -- 'read' | 'write' | 'delete' | 'export' | 'access-denied'
  fields TEXT[] NOT NULL,          -- PII columns touched
  region TEXT NOT NULL,
  trace_id TEXT,                   -- OTel trace id of the request
  span_id TEXT,                    -- the pryzm.pii.* span id
  reason TEXT                      -- for service/admin reads, why
);
CREATE INDEX ix_pii_access_subject_ts ON pii_access_log(subject_user_id, ts DESC);
```

The table itself is PII-tier (the rows contain user ids); retention 13 months (long enough for a customer to challenge a read; short enough to limit exposure).

---

## §3 — Stores / API

### §3.1 — `ConsentStore`

Path: `server/consentStore.js` (to be created).

```typescript
export interface ConsentStore {
  /** Returns the user's grants. */
  list(userId: string): Promise<Consent[]>;
  /** Records a grant. Forbidden if user already granted same (purpose, version). */
  grant(userId: string, purpose: ConsentPurpose, version: string, source: Consent['source']): Promise<void>;
  /** Records a revoke. */
  revoke(userId: string, purpose: ConsentPurpose): Promise<void>;
  /** Returns true iff the user has an active (granted & not revoked) row for that purpose at the current version. */
  has(userId: string, purpose: ConsentPurpose): Promise<boolean>;
}
```

`has()` is the gate every consent-checked path uses. Caching is permitted with a 60 s TTL maximum.

### §3.2 — `StorageRouter`

Path: `server/storageRouter.js` (to be created).

```typescript
export interface StorageRouter {
  /** Route a write to the correct bucket / database for the tier + region. */
  resolveWriteTarget(tier: DataTier, region: 'eu' | 'us' | 'ap'): { bucket: string; db: string };
  /** Returns the registered transform for a downcast, or throws C22_NO_TRANSFORM. */
  resolveDowncast(from: DataTier, to: DataTier): (input: unknown) => unknown;
  /** Returns the BYOK key for a customer, or throws C22_BYOK_KEY_UNAVAILABLE. */
  resolveByokKey(userId: string): Promise<{ keyId: string; cipher: 'aes-256-gcm' }>;
  /** Returns the current StorageRoutingPolicy for a tier. */
  policy(tier: DataTier): StorageRoutingPolicy;
}
```

The router is the **only** legal way to obtain a bucket / db handle for tiered data. Direct `s3.putObject({ Bucket: 'pryzm-pii-eu', ... })` is forbidden — code MUST go through `router.resolveWriteTarget()`.

### §3.3 — `RetentionScheduler`

Path: `apps/retention-worker/` (to be created).

A long-running worker that wakes per `RetentionPolicy.sweepIntervalMinutes`, scans each tier for rows older than `maxDays`, hard-deletes them, and emits a `pryzm.retention.sweep` span per tier.

```typescript
export interface RetentionScheduler {
  /** Run one sweep now (for tests + ad-hoc). */
  sweep(tier: DataTier): Promise<{ deletedRows: number; durationMs: number }>;
  /** Return rows that missed their delete deadline (the §1.10 Sev-2 incidents). */
  listOverdue(): Promise<Array<{ tier: DataTier; rowId: string; overdueDays: number }>>;
}
```

### §3.4 — `BackupRetentionScheduler`

Path: `apps/backup-worker/` (to be created).

Tracks every backup generation, ages out backups beyond 90 days, and verifies that deleted-user records have been purged from the surviving generations before each release.

### §3.5 — `BreachIncidentLog`

Path: `server/breachIncidentLog.js` (to be created).

```typescript
export interface BreachIncidentLog {
  /** Insert a suspected breach. */
  open(incident: Omit<BreachIncident, 'id' | 'detectedAt' | 'status'>): Promise<string>;
  /** Transition: suspected → confirmed (starts the 72 h clock). */
  confirm(id: string, confirmedAt: string): Promise<void>;
  /** Record an Article 33 authority notification. */
  recordAuthorityNotification(id: string, notification: BreachIncident['authorityNotification']): Promise<void>;
  /** Record an Article 34 subject notification. */
  recordSubjectNotification(id: string, notification: BreachIncident['subjectNotification']): Promise<void>;
  /** Close the incident. */
  close(id: string, rootCause: string, remediation: string): Promise<void>;
  /** Surface incidents approaching the 72 h ceiling. */
  listApproachingDeadline(): Promise<BreachIncident[]>;
}
```

### §3.6 — `DSARStore`

Path: `server/dsarStore.js` (to be created).

```typescript
export interface DSARStore {
  submit(req: Omit<DSARRequest, 'id' | 'status' | 'submittedAt' | 'dueAt' | 'verifiedAt' | 'workerId' | 'attempts' | 'exportBundleUrl' | 'completedAt'>): Promise<DSARRequest>;
  verify(id: string, token: string): Promise<boolean>;
  claim(workerId: string): Promise<DSARRequest | null>;   // worker picks up next pending
  complete(id: string, exportBundleUrl?: string): Promise<void>;
  escalate(id: string, reason: string): Promise<void>;
  listOverdue(): Promise<DSARRequest[]>;                   // dueAt - now() < 5d, status != completed
}
```

---

## §4 — Commands

Every command-bus command is per [C03 Schemas, Commands, and State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) and [C16 Command Authoring](./C16-COMMAND-AUTHORING-PROTOCOL.md).

### §4.1 — `pii.dsar.export(userId)`

**Input**: `{ userId: string, format: 'json' | 'csv' | 'pdf' }`
**Output**: `{ requestId: string, dueAt: string }`

Submits an export DSAR. The actor MUST be the user themselves (the gateway enforces this — admins cannot self-serve another user's DSAR; admin-initiated DSAR is a separate ticket flow). Emits `pryzm.pii.export` span.

### §4.2 — `pii.dsar.delete(userId)`

**Input**: `{ userId: string, hardDelete: boolean }` (soft-delete = redact, hard-delete = remove). Default `hardDelete: true`.
**Output**: `{ requestId: string, dueAt: string }`

Submits a delete DSAR. Idempotent — submitting twice within the verification window returns the same `requestId`. Emits `pryzm.pii.delete` span when worker runs.

### §4.3 — `pii.dsar.rectify(userId, patch)`

**Input**: `{ userId: string, patch: Record<string, unknown> }`
**Output**: `{ requestId: string }`

Submits a rectification DSAR. The patch MUST contain only PII-classified fields (per the registry §1.11). The worker applies the patch + writes a `pryzm.pii.write` audit row per field.

### §4.4 — `pii.breach.log`

**Input**: `Omit<BreachIncident, 'id' | 'detectedAt' | 'status'>`
**Output**: `{ incidentId: string }`

Server-side only — never callable from the browser. The security team uses this from an admin console + alerting integrations call it directly.

### §4.5 — `pii.consent.update`

**Input**: `{ purpose: ConsentPurpose, grant: boolean, version: string }`
**Output**: `{ ok: true }`

Records a grant or revoke. The user MUST be authenticated and the `userId` is implicit from the session — there is no way to update another user's consent. Emits `pryzm.pii.write` with `fields: ['consents.' + purpose]`.

### §4.6 — `pii.byok.configure`

**Input**: `{ provider: 'aws-kms' | 'gcp-kms' | 'azure-keyvault' | 'hashicorp-vault', endpoint: string, keyId: string }`
**Output**: `{ ok: true }`

Account-owner-only. Records the BYOK configuration. On success, the next PROJECT-tier write for this customer uses the customer key. A subsequent `pii.byok.revoke` denies all future PROJECT reads (existing data becomes unreadable to the platform until a key is reconfigured — the platform CANNOT recover this; the customer MUST keep the key safe).

---

## §5 — UI

### §5.1 — Account-settings → Privacy panel

Lives at `apps/editor/src/ui/account/PrivacyPanel.tsx` (to be created).

Sections:
- **Your data** — "Export my data" button (fires `pii.dsar.export`).
- **Delete account** — "Delete my account and all my data" button + confirmation modal (fires `pii.dsar.delete`).
- **Rectify** — inline editable PII fields (display name, email-on-file). Each edit fires `pii.dsar.rectify`.
- **Consents** — a list of consent purposes with toggle switches.
- **Region** — the customer's configured region (read-only post-signup; changing requires support ticket per §1.3).
- **BYOK** — for plan tier ≥ Enterprise: KMS configuration form.

The DSAR buttons MUST NOT fire the action directly — they MUST first prompt the user to verify their identity via the email-based verification flow (so a compromised session can't trigger a deletion).

### §5.2 — Privacy notice on signup

Per GDPR Article 13 + CCPA, the signup form MUST display the privacy notice link + record affirmative consent for processing (`consent.purpose: 'analytics'` is opt-in, not opt-out, in EU regions). The text is owned by Legal; the wiring is owned by C22.

### §5.3 — BYOK setup explainer

Inline copy in the BYOK panel MUST display: "BYOK protects your PROJECT data. PII (account email + name) is always encrypted with platform keys so we can process data-subject requests and respond to legal orders." This is the §1.4 PII boundary made visible.

### §5.4 — Breach disclosure surface

When `pryzm_users.affected_by_incident_id` is set, on next login the user MUST see a modal explaining the breach, what data was affected, what the company is doing, and the contact for the privacy team. This satisfies GDPR Article 34 in-app delivery.

---

## §6 — Tests / CI gates

### §6.1 — `check-data-tier-tag`

Static analysis over `server/` and `packages/persistence-client/`. Every call to `db.query('INSERT INTO ...')` or `s3.putObject()` MUST be lexically reachable from a `StorageRouter.resolveWriteTarget()` call OR carry a `// @data-tier-untagged: <reason>` comment that a code reviewer signed off.

Refuses any new untagged write. Refuses any `@data-tier-untagged` comment whose `<reason>` doesn't reference an ADR.

### §6.2 — `check-pii-otel-spans`

Static analysis: every function that reads or writes a column listed in `packages/schemas/src/pii-registry.ts` MUST emit a `pryzm.pii.*` span on the same code path. Implementation: AST walk over `server/**/*.js` + `packages/**/*.ts`; matches column-name string literals against the PII registry; checks that an `otel.trace.startSpan('pryzm.pii.')` call dominates the touch.

Hard-fail at GA. Soft-warn pre-GA.

### §6.3 — `check-region-routing`

Conformance test: spin up an EU-region test customer, write a project, verify the bucket name returned by `StorageRouter.resolveWriteTarget('project', 'eu')` is an EU bucket and the underlying `s3.putObject` landed in eu-west-1 (or configured EU region).

### §6.4 — `check-anonymisation-completeness`

The 100-record sample audit per §1.8. Runs nightly on a TELEMETRY tier sample; flags any candidate-PII (email regex, name-shaped strings, IP, GPS-precise) and pages the privacy team.

### §6.5 — `check-byok-deny-default`

Conformance test: a customer with `byok_enabled = true` + missing key MUST receive HTTP 503 from every PROJECT-tier read endpoint. The test mocks the KMS endpoint to fail and asserts deny — NOT fall-back.

### §6.6 — `check-pii-classification`

DB migration linter. Any migration that adds a column to a user-data table (`pryzm_users`, `project_members`, `auth_sessions`, `oauth_providers`, etc. — the table set is enumerated in the linter) MUST simultaneously update `packages/schemas/src/pii-registry.ts` to classify the new column. Refuses any migration that adds a column without registry coverage.

### §6.7 — `check-consent-required`

Static analysis: any function annotated `@requires-consent('analytics')` (the marker comment) MUST call `consentStore.has(userId, 'analytics')` before its first side effect. CI fails if the call is missing.

### §6.8 — `check-dsar-sla`

Runtime check: any `DSARRequest` whose `dueAt - now() < 5d` and `status != 'completed'` pages the privacy team. Fails CI in test mode if the synthetic DSAR submitted during the suite is not completed within the test-configured SLA (5 minutes in test, 30 days in prod).

### §6.9 — `check-breach-sla`

Runtime check: any `BreachIncident` whose `confirmedAt + 72h - now() < 12h` and `status not in ['notified-authority', 'notified-subjects', 'closed']` pages the privacy team.

### §6.10 — `check-retention-purge`

Conformance test: insert a synthetic row with backdated `createdAt` into each tier; run the `RetentionScheduler` sweep; assert the row is gone. Repeat for backup-purge with backdated backup generations.

---

## §7 — NFT targets

Per [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md), these are budgets.

| Target | Budget | Rationale |
|---|---|---|
| DSAR export delivered | < 24 h (p50), 30 d (hard ceiling per §1.5) | Most DSARs are simple; 30 d is the legal ceiling. Aim for 24 h to absorb worker queue spikes. |
| DSAR delete cascade | < 90 d full purge from all backup generations | §1.6. The 90 d cap is the backup-retention ceiling. |
| Per-PII-write span overhead | < 1 ms p99 | Audit overhead must not noticeably slow user actions. |
| `pii_access_log` insert | < 5 ms p99 (async; non-fatal on failure per §1.7) | Mirrors `auditLogMiddleware` pattern — non-blocking write with warn-on-failure. |
| `StorageRouter.resolveWriteTarget` | < 0.1 ms p99 | Hot path; in-memory lookup. |
| `StorageRouter.resolveByokKey` | < 50 ms p50, < 200 ms p99 | KMS round-trip + cache hit; cache TTL 5 min. |
| `RetentionScheduler` sweep | < 5 min per tier per region | Sweep cadence is per-tier; bigger tiers need bigger budgets. |
| Breach-incident notification path | < 1 h from `breach.confirm` → outbound email | The 72 h ceiling is the legal cap; aim for hours not days. |
| Anonymisation transform throughput | > 1000 records / sec per worker | TELEMETRY downcast must keep up with PROJECT-tier ingest. |

---

## §8 — Migration plan

The current `server/` modules write data without a tier tag. The migration brings every write under tier-routing without breaking running customers.

### §8.1 — Phase 1 — schema (2 weeks)

1. Add a `tier` column to every user-data table, default `'pii' | 'project' | 'telemetry' | 'derived'` per the table's logical purpose. Backfill via `server/dbMigrate.js` migration `2026-06-NN-add-data-tier`.
2. Add `pii_access_log`, `dsar_requests`, `breach_incidents`, `consents` tables.
3. Create `packages/schemas/src/pii-registry.ts` with the §1.11 floor enumerated.
4. Create `packages/schemas/src/data-tier.ts`, `storage-routing-policy.ts`, `retention-policy.ts`, `dsar.ts`, `breach-incident.ts`, `consent.ts`.

### §8.2 — Phase 2 — router (3 weeks)

5. Build `server/storageRouter.js` with single-region (existing) endpoint set. Wrap `server/projectStore.js`, `server/authStore.js`, `server/projectMembers.js` writes through `router.resolveWriteTarget()`.
6. Build `server/consentStore.js`. Plumb through to existing signup + settings paths.
7. Emit `pryzm.pii.*` spans on every PII column read/write across server modules.

### §8.3 — Phase 3 — DSAR + retention workers (3 weeks)

8. Build `apps/dsar-worker/`. Wire `pii.dsar.*` commands. End-to-end test on a sandbox customer.
9. Build `apps/retention-worker/`. Sweep cadence per §3.3 defaults.
10. Build `apps/backup-worker/`. Verify 90 d ceiling.

### §8.4 — Phase 4 — UI (2 weeks)

11. Build `apps/editor/src/ui/account/PrivacyPanel.tsx`.
12. Wire signup-time consent capture per §5.2.
13. Build breach-disclosure modal per §5.4.

### §8.5 — Phase 5 — multi-region + BYOK (4 weeks)

14. Provision EU + US + AP bucket / db endpoints. Update `StorageRouter` endpoint table.
15. Build `pii.byok.configure` + KMS integration. Start with AWS KMS; GCP + Azure follow in a later phase.
16. Wire `byok_enabled` deny-default per §1.4.

### §8.6 — Phase 6 — CI gates ratchet (1 week)

17. Land `check-data-tier-tag`, `check-pii-otel-spans`, `check-region-routing`, `check-anonymisation-completeness`, `check-byok-deny-default`, `check-pii-classification`, `check-consent-required`, `check-dsar-sla`, `check-breach-sla`, `check-retention-purge` — initially soft-warn; ratchet to hard-fail per the staging table below.

| Gate | Soft-warn from | Hard-fail from |
|---|---|---|
| `check-pii-classification` | Phase 1 | Phase 1 |
| `check-data-tier-tag` | Phase 2 | Phase 3 |
| `check-pii-otel-spans` | Phase 2 | Phase 4 |
| `check-region-routing` | Phase 5 | Phase 5 |
| `check-anonymisation-completeness` | Phase 3 | Phase 4 |
| `check-byok-deny-default` | Phase 5 | Phase 5 |
| `check-consent-required` | Phase 2 | Phase 3 |
| `check-dsar-sla` | Phase 3 | Phase 4 |
| `check-breach-sla` | Phase 3 | Phase 3 |
| `check-retention-purge` | Phase 3 | Phase 4 |

Total: ~15 weeks single-contributor, ~10 weeks at two parallel with one shared reviewer.

### §8.7 — Customer-impact playbook

- **Existing data without tier tag**: backfilled in §8.1. No customer-visible change.
- **Existing customers without consent rows**: a one-time "we updated our privacy controls" modal at next login captures missing consents. Per GDPR-compliant transition, default is **deny** for non-essential purposes; users opt back in.
- **Existing customers without region preference**: defaulted to the region of their primary data centre (per `auth_sessions.ip_address` rough geo); EU IPs default to `eu`. Users may change in settings.

---

## §9 — What is NOT in C22

- **Authentication, sessions, OAuth, roles, ISO 19650 phases** → [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md). C22 sits beside C08 and adds the data-tier surface; C08 owns who can act, C22 owns what data exists and where.
- **Persistence mechanics (which backend, how snapshots are stored, the `.pryzm` file format)** → [C05 Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md). C22 routes through tiers; C05 owns the wire format inside each tier.
- **AI artefact provenance — which prompt produced which output, the cost ledger** → [C23 Provenance & AI Audit](./C23-...) (proposed). C22 classifies the DERIVED tier; C23 owns the chain-of-custody inside it.
- **Telemetry-consent UX (how the cookie banner looks, opt-in copy)** → [C41 Telemetry & Analytics](./C41-...) (proposed). C22 owns the TELEMETRY tier definition + `Consent` schema; C41 owns the user experience that captures the consent.
- **Multi-region routing operational concerns (cross-region replication, failover)** → [C49 Multi-Region & Sovereignty](./C49-...) (proposed). C22 establishes the region-honour invariant (§1.3); C49 owns the infrastructure.
- **Backup & DR cadence (RPO, RTO, restore procedure)** → [C48 Backup & Disaster Recovery](./C48-...) (proposed). C22 caps backup retention at 90 d for compliance; C48 owns the cadence.
- **Plugin trust + revocation (which plugins can touch which tiers)** → [C07 Plugin SDK & Marketplace](./C07-PLUGIN-SDK-AND-MARKETPLACE.md). A future amendment may add a tier-permission column to the plugin manifest.
- **Performance budget enforcement** → [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md). §7 lists the C22 budgets; C10 owns the framework that enforces them.
- **Privacy law text & customer-facing notices** → owned by Legal; C22 owns the engineering surface that implements them.

---

## §10 — Open questions

These are flagged for resolution before C22 → CANONICAL.

1. **Data-residency region → AWS region mapping**: which exact regions back each `regionPreference` (`eu` = `eu-west-1` + `eu-central-1`? `ap` = `ap-southeast-1` + `ap-northeast-1`?). Affects PG0.x infrastructure provisioning.
2. **Key-management vendor for BYOK**: AWS KMS (managed; easier, less sovereignty) vs hardware HSM (CloudHSM / Azure dedicated HSM; harder, real key sovereignty). The §5.3 explainer copy depends on which we ship first.
3. **Verification flow for DSAR**: email-link click only (lower friction, weaker proof), or email + re-authenticate (higher friction, stronger). GDPR allows either; SOC 2 auditors prefer the latter.
4. **DSAR export format default**: JSON (machine-readable, our preference), CSV (legal-team preferred for portability), or PDF (customer-preferred for archival). Probably ship JSON + CSV; PDF later.
5. **Cross-tier downcast for plugin output**: where does plugin-generated data land — DERIVED (treated like AI output) or PROJECT (treated like user-authored)? C07 amendment + C22 §1.11 floor may need to add a plugin-output classifier.
6. **Backup encryption keys**: backups inherit the source tier's BYOK config OR are encrypted with a separate backup-tier platform key? The latter is easier operationally; the former is stricter sovereignty. Likely platform-key backups with the caveat documented to enterprise customers.
