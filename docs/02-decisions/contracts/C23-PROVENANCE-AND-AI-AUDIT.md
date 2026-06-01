# C23 — Provenance & AI Audit

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: every AI-generated artefact in PRYZM is auditable end-to-end. Records model, prompt, context-hash, timestamp, user, project, cost, workflow version, reproducibility status, lineage, and human-approval status. Append-only ProvenanceStore with ≥ 7-year retention surfaces a per-project audit export for customers + regulators.
> **Depends on**: [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) · [C05 Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md) · [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) · [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) · [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) · [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md)
> **Downstream**: every L2 AI workflow in `packages/ai-host/` · every server AI route in `server/aiPublicApiRoutes.js`, `server/aiUsageStore.js`, `server/aiResponseCache.js` · the future "AI provenance" UI panel + project-level audit export
> **Key principles**: P5 (schemas are pure) · P6 (commands are the only mutation path) · P8 (every exported function adds ≥ 1 OpenTelemetry span; every AI artefact is auditable)
> **Authority**: this contract is binding on every PR that touches an AI code path. Violations block merge per [C00 Index](./README.md).

---

## §1 — Invariants

The rules in this section are normative (RFC 2119). Each rule has a stable §N.M identifier so reviewers, ADRs, and CI gates can cite it precisely.

### §1.1 — Every AI call MUST write an AIArtefact before returning

Every code path that calls a model — whether through `packages/ai-host/src/AnthropicRelay.ts`, `CfWorkerRelay.ts`, the in-process `AiPlane` (`AiPlane.ts`), the public AI routes in `server/aiPublicApiRoutes.js`, or the deterministic offline engines that complete in the same workflow envelope (e.g. D-TGL, D-FLE, D-CE, D-LE per [C09 §3.4.1](./C09-AI-AND-VISIBILITY-INTENT.md)) — **MUST** write a fully populated `AIArtefact` record (§2.1) to the `ProvenanceStore` (§3.1) **before** the call's promise resolves to its caller.

The artefact-write is part of the call's critical path. If the write fails, the AI workflow MUST surface a `pryzm:toast` of severity `error` and MUST NOT silently swallow the failure. The artefact write is the audit hand-shake: no artefact = the call did not happen, from the audit log's point of view.

CI gate: `check-ai-records-artefact.ts` (§6.1).

### §1.2 — AIArtefact MUST carry the full audit tuple

Every `AIArtefact` row MUST include, at minimum:

| Field | Description |
|---|---|
| `id` | `aia_<uuid>` — append-only, never re-used |
| `model` | the exact upstream model id (`claude-haiku-4-5-20251014`, `claude-sonnet-4-6-20260201`, `gpt-5-2026-04-01`, …) — not the alias |
| `promptSha` | SHA-256 of the redacted prompt body (verbatim text after §1.6 redaction) |
| `promptPreviewRedacted` | the first 1,024 chars of the redacted prompt (storage cap; tail truncated with `…`) |
| `contextHash` | SHA-256 of the canonical-form `ContextSnapshot` (§2.3) |
| `contextSnapshotId` | foreign key into `ContextSnapshot` (§3.1) |
| `timestamp` | UTC ISO-8601 with ms precision |
| `sessionId` | the editor session id (uuid) |
| `userId` | the authenticated user id (or `'anonymous'` for unauthenticated public-API hits) |
| `projectId` | the project the call is scoped to (or `'unknown'` for non-project calls) |
| `workflowKind` | one of the workflows from [C09 §3](./C09-AI-AND-VISIBILITY-INTENT.md) (`plan-critique`, `generate-3-options`, `apartment-layout-generate`, …) — the same set as `VALID_WORKFLOWS` in `server/aiUsageStore.js` |
| `workflowVersion` | the workflow's semver string (e.g. `apartment-layout-v3.2`); MUST bump when the prompt, validator, or scorer changes |
| `inputTokens`, `outputTokens` | from the upstream response usage block |
| `costUsd` | computed at write-time by `packages/ai-cost/src/CostMeter.ts` |
| `durationMs` | wall-clock from call-start to artefact-write |
| `reproducibility` | `'deterministic'` (offline engines: D-TGL, D-FLE, D-CE, D-LE) or `'non-deterministic'` (every relay-based path) |
| `seed` | when `reproducibility === 'deterministic'`, the seed used; otherwise `null` |
| `approvalStatus` | one of `'auto-applied'`, `'user-approved'`, `'user-rejected'`, `'pending'`, `'never-applied'` (§1.7) |
| `parentArtefactIds` | array of `aia_*` ids this call depended on (§1.3, the lineage / DAG of provenance) |
| `producedElementIds` | array of element ids this call's downstream commands created (populated by §4.4 `provenance.linkElement`) |

A row MAY include additional optional fields per §2.1; the fields above are the MUST-have audit-tuple minimum.

CI gate: `check-ai-artefact-schema.ts` (§6.1).

### §1.3 — ProvenanceGraph edges MUST link artefacts to elements they produce

When an AI workflow's Phase B execute step (per [C09 §3.4](./C09-AI-AND-VISIBILITY-INTENT.md)) dispatches commands that create or mutate elements, every produced element id **MUST** be linked to the originating `AIArtefact.id` via a `ProvenanceEdge` (§2.2). This is the lineage DAG.

The edge MUST be written **inside the same `batchCoordinator.runBatch`** envelope that dispatches the commands, so the lineage write is atomic with the model mutation — either both land or neither does.

Inter-artefact edges (artefact A's output was fed into artefact B's prompt) are written when artefact B is recorded, via `parentArtefactIds` (§1.2). The graph MUST be a DAG; cyclic edges MUST be rejected by the store at write time.

CI gate: `check-provenance-edges-on-batch.ts` (§6.1).

### §1.4 — Reproducibility status MUST be `'deterministic'` (with seed) OR `'non-deterministic'` (flagged)

There is no third value. The `reproducibility` field is a binary discriminator:

- `'deterministic'` — the workflow can be re-run with the recorded `(contextHash, seed, workflowVersion)` triple and produce **byte-identical** output. Offline engines (D-TGL, D-FLE, D-CE, D-LE) qualify by construction (pure L2, no RNG, no THREE, no DOM per [C09 §3.4](./C09-AI-AND-VISIBILITY-INTENT.md)). The `seed` field MUST be populated.
- `'non-deterministic'` — every other path. Anthropic / OpenAI / any LLM relay is non-deterministic even with `temperature: 0`. The `seed` field MUST be `null`.

A workflow that mixes deterministic + non-deterministic phases (e.g. apartment-layout's `generate` phase falls back to D-TGL when the relay is unavailable) records **separate AIArtefacts per phase** with their own `reproducibility` value. The lineage edge connects them.

CI gate: `check-determinism-discriminator.ts` (§6.1).

### §1.5 — Retention MUST be ≥ 7 years

Every `AIArtefact` and every `ProvenanceEdge` MUST be retained for **at least 7 calendar years** from `AIArtefact.timestamp`. This satisfies:

- The default regulator audit window for AEC and SaaS (US: SOX-aligned 7 years; EU: GDPR Art 5 retention "no longer than necessary" with explicit regulatory carve-out for design-decision provenance).
- The architectural-licensing audit window in most jurisdictions for record-of-decision in design (5 years AIA, 6 years RIBA; 7 covers both with margin).

Deletion before this window MUST require a documented legal exception (court order, GDPR Art 17 erasure request — see §1.9 / §1.6) and MUST be logged in a separate immutable `RetentionExceptionLog`.

After 7 years, artefacts MAY be moved to cold-storage (S3 Glacier, Azure Archive) but MUST remain query-able within 5 business days. This is the [C22](./C22-PRIVACY-AND-PII-TIER.md) `archived` tier.

CI gate: `check-retention-period.ts` (§6.1) — checks no DELETE statement in the codebase targets `AIArtefact` rows younger than 7 years without going through the `RetentionExceptionLog` write.

### §1.6 — PII in prompts MUST be redacted before storage

Per [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md), any PII present in the prompt body — full names beyond the authenticated user's own, email addresses other than the user's own, phone numbers, street addresses, government IDs, customer identifiers — **MUST** be redacted by the `PiiRedactor` (§3.2) **before** the prompt is hashed (`promptSha`), previewed (`promptPreviewRedacted`), or stored.

Redaction is one-way: the original PII bytes never enter the `ProvenanceStore`. The `RedactionRecord` (§2.4) records the redaction event itself (what category was redacted, how many tokens were replaced, by what version of the redactor) — never the redacted content.

Redaction failures MUST fail-closed: a prompt that the redactor cannot classify reliably MUST be stored as `promptPreviewRedacted: '[REDACTION-FAILED]'` and the upstream call MUST proceed only if the originating workflow is on the `redaction-failure-tolerant` allowlist in `server/piiRedactor.config.js`. Workflows NOT on the allowlist MUST abort the AI call with HTTP 400 and surface a user-facing error.

CI gate: `check-redaction-completeness.ts` (§6.1) — scans stored prompt previews for known PII patterns (regex + ML classifier in CI).

### §1.7 — Provenance queries MUST emit an OTel span

Per P8 ([C10 §2](./C10-PERFORMANCE-AND-OBSERVABILITY.md)), every exported function in the `ProvenanceQueryAPI` (§3.3) MUST emit at least one OpenTelemetry span:

```ts
pryzm.provenance.queryByProject
pryzm.provenance.queryByElement
pryzm.provenance.queryByUser
pryzm.provenance.exportForAudit
pryzm.provenance.linkElement
pryzm.provenance.recordArtefact
```

Each span MUST set the standard attributes from [C10 §2.2](./C10-PERFORMANCE-AND-OBSERVABILITY.md) (`pryzm.project_id`, `pryzm.user_id`, `error`) and one C23-specific attribute `pryzm.provenance.row_count` for queries that return rows.

The audit-trail itself is auditable: the spans land in Honeycomb alongside `pryzm.ai.cost.usd`. An operator can answer "who asked for this project's AI provenance, when?" without leaving the observability stack.

CI gate: the existing `scripts/ci-check-spans.ts` ([C10 §2.3](./C10-PERFORMANCE-AND-OBSERVABILITY.md)) covers this — no new gate.

### §1.8 — Customer-facing export of provenance MUST be available per project

Per the **P8 audit principle** in [engineering-vision.md](../../01-strategy/engineering-vision.md) — every public function is observable — every project owner MUST be able to export their project's full AI provenance graph in two formats:

- **PDF audit report** — human-readable, signed by the project owner's account email, dated at export time, page-numbered. Suitable for handing to a regulator or external auditor.
- **JSON dump** — machine-readable `ProvenanceExport` (§2.5) bundle suitable for ingestion into customer-side compliance tooling.

The export MUST cover every `AIArtefact` and `ProvenanceEdge` scoped to the requesting `projectId`. Export latency MUST be < 60 s for projects with up to 10,000 artefacts (NFT §7.3).

The export MUST itself write an `AIArtefact` of `workflowKind: 'provenance-export'` so the export action is itself audited.

UI surface: [C06 UI Shell](./C06-UI-SHELL-AND-TOOLS.md) — project-level "Audit" panel exposes the export buttons. Server route: `POST /api/projects/:id/provenance/export` (returns the artefact id, async); fetch via `GET /api/provenance/exports/:artefactId`.

### §1.9 — Deletion of an AIArtefact is FORBIDDEN (append-only)

The `ProvenanceStore` (§3.1) is **append-only**. The following operations are FORBIDDEN against the `ai_artefacts` and `provenance_edges` tables:

- `DELETE FROM ai_artefacts WHERE …`
- `UPDATE ai_artefacts SET … WHERE id = …` for any column other than the controlled mutability set: `{ approvalStatus, producedElementIds }` (these are explicitly allowed to be filled-in post-write as the user approves/rejects the AI output)
- `TRUNCATE ai_artefacts`
- Any `ON DELETE CASCADE` constraint pointing into `ai_artefacts`

Exceptions are limited to:

1. **GDPR Art 17 erasure** — a verified right-to-be-forgotten request from an EU data subject. Triggers the `gdprErasure` server flow which writes a `RetentionExceptionLog` row, then redacts the artefact's `promptPreviewRedacted` and `userId` columns to `[GDPR-ERASED]`. The row itself is NOT deleted — the lineage graph remains intact; just the PII is gone. This satisfies both Art 17 and the audit-trail invariant.
2. **Court order** — same flow, with `RetentionExceptionLog.reason = 'court-order'` and a free-text justification field.

Both exceptions require server-side `role: 'compliance-officer'` authorisation per [C08 §3](./C08-COLLABORATION-AND-SECURITY.md).

CI gate: `check-provenance-append-only.ts` (§6.1) — static scan of `server/`, `packages/`, and `migrations/` for forbidden patterns above (excluding the two allowed exception code-paths which are annotated with `// PROVENANCE-EXCEPTION: gdpr|court-order`).

### §1.10 — Multi-tenant isolation is enforced at query time

Every `ProvenanceQueryAPI` call (§3.3) MUST scope its query by `projectId` AND the `projectId` MUST be authorised against the calling user's `role` per [C08 §3](./C08-COLLABORATION-AND-SECURITY.md). Cross-project enumeration is forbidden for non-`platform-admin` roles.

The store's row-level access policy (PostgreSQL RLS) MUST be enabled on `ai_artefacts` and `provenance_edges` — a query missing a `projectId` filter MUST return zero rows even if executed by an authenticated session, never the full table.

Platform-admin queries that legitimately span tenants (capacity reporting, abuse investigation) MUST go through a separate `crossTenantAdminQuery()` function which logs every invocation to the immutable `AdminAccessLog` with the admin's userId, timestamp, and SQL fingerprint.

CI gate: `check-provenance-tenant-isolation.ts` (§6.1).

### §1.11 — Idempotent artefact writes on retry

Network retries, especially against the upstream model, MUST NOT produce duplicate `AIArtefact` rows for the same logical call. Each call generates a client-side `idempotencyKey = sha256(workflowKind || sessionId || contextHash || requestTimestampSec)` that the store treats as a uniqueness constraint.

A retry that finds an existing artefact with the same `idempotencyKey` MUST return the existing artefact id rather than writing a new one. This avoids the "1 model call = 3 artefact rows" anti-pattern that pollutes cost dashboards and lineage graphs.

CI gate: indirectly via `check-provenance-no-duplicates.ts` (§6.1) which scans for sessions producing > 1 artefact within a 100 ms window of identical `contextHash`.

### §1.12 — Cache hits MUST still write a provenance row

When `packages/ai-host/src/AiResponseCache.ts` (or the server-side `server/aiResponseCache.js`) returns a cached `WorkflowRunResult`, the workflow STILL writes an `AIArtefact` row — flagged `cacheStatus: 'hit'` with `costUsd: 0` and `inputTokens: 0`, `outputTokens: 0`. The cached row's `parentArtefactIds` MUST include the original artefact that produced the cached payload.

This ensures the provenance graph is complete even for cache-served calls. A customer asking "which AI decision produced this wall layout?" gets the **original** generative call surfaced, not a black hole.

CI gate: `check-cache-hit-records-artefact.ts` (§6.1) — wrap-test around `AiResponseCache.get()`.

### §1.13 — Non-deterministic AI outputs MUST be deduplicated by semantic fingerprint, not byte-equality

Two non-deterministic AI calls with identical `(promptSha, contextHash, workflowVersion)` MAY produce semantically equivalent but byte-different outputs (e.g. JSON key order, whitespace, irrelevant phrasing). The store MUST NOT treat byte-equality as the deduplication signal — that produces false negatives.

Instead, generative workflows MUST compute a `outputSemanticFingerprint` via the workflow's per-kind canonicaliser (`canonicaliseForWorkflow(workflowKind, output)`) before storing. Two artefacts with identical semantic fingerprints share a `outputClusterId` for analytic deduplication, but each retains its own row (per §1.9 append-only).

This is a SHOULD-have for cost-optimisation analytics, but the rule is binding so that downstream dashboards don't double-count "the same answer" as different design alternatives.

---

## §2 — Schema

The schema below is the **wire format** for the ProvenanceStore. Field names follow the camelCase convention from [C03 §2](./C03-SCHEMAS-COMMANDS-AND-STATE.md). All schemas are pure (P5) — no I/O, no THREE, no DOM imports in `packages/schemas/`.

### §2.1 — `AIArtefact`

The append-only audit row.

```ts
// packages/schemas/src/provenance/AIArtefact.ts
import { z } from 'zod';

export const ApprovalStatus = z.enum([
  'auto-applied',
  'user-approved',
  'user-rejected',
  'pending',
  'never-applied',
]);

export const Reproducibility = z.enum(['deterministic', 'non-deterministic']);

export const CacheStatus = z.enum(['miss', 'hit', 'bypass']);

export const AIArtefactSchema = z.object({
  // Identity (immutable after write)
  id: z.string().regex(/^aia_[0-9a-f-]{36}$/),
  idempotencyKey: z.string().length(64), // sha256 hex
  timestamp: z.string().datetime({ offset: false }), // UTC ISO-8601 ms
  sessionId: z.string().uuid(),
  userId: z.string(),
  projectId: z.string(),

  // Model + workflow
  model: z.string(),
  workflowKind: z.string(),
  workflowVersion: z.string().regex(/^[a-z0-9-]+-v\d+\.\d+(\.\d+)?$/),

  // Prompt + context
  promptSha: z.string().length(64),
  promptPreviewRedacted: z.string().max(1024),
  contextHash: z.string().length(64),
  contextSnapshotId: z.string().regex(/^cs_[0-9a-f-]{36}$/),
  redactionRecordId: z.string().regex(/^rr_[0-9a-f-]{36}$/).nullable(),

  // Cost + perf
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  cacheStatus: CacheStatus,

  // Reproducibility
  reproducibility: Reproducibility,
  seed: z.number().int().nullable(),

  // Approval (mutable post-write — explicit exception per §1.9)
  approvalStatus: ApprovalStatus,

  // Lineage (parents are immutable post-write; children mutable post-write)
  parentArtefactIds: z.array(z.string().regex(/^aia_[0-9a-f-]{36}$/)),
  producedElementIds: z.array(z.string()),

  // Optional semantic fingerprint (§1.13)
  outputSemanticFingerprint: z.string().length(64).nullable(),
  outputClusterId: z.string().regex(/^oc_[0-9a-f-]{36}$/).nullable(),

  // Optional surface metadata (informational only)
  surface: z.string().optional(), // 'plan-view', 'cli', '/v1/ai/query', …
});

export type AIArtefact = z.infer<typeof AIArtefactSchema>;
```

### §2.2 — `ProvenanceEdge`

A directed edge in the lineage DAG.

```ts
// packages/schemas/src/provenance/ProvenanceEdge.ts
export const EdgeKind = z.enum([
  'artefact-to-element',  // an AI call produced an element
  'artefact-to-artefact', // an AI call fed another AI call (§1.3)
  'cache-derived-from',   // a cache hit derives from the original
  'fallback-from',        // a deterministic fallback derived from a failed relay call
]);

export const ProvenanceEdgeSchema = z.object({
  id: z.string().regex(/^pe_[0-9a-f-]{36}$/),
  fromArtefactId: z.string().regex(/^aia_[0-9a-f-]{36}$/),
  toArtefactId: z.string().regex(/^aia_[0-9a-f-]{36}$/).nullable(),
  toElementId: z.string().nullable(),
  edgeKind: EdgeKind,
  createdAt: z.string().datetime({ offset: false }),
  projectId: z.string(), // denormalised for RLS (§1.10)
});

export type ProvenanceEdge = z.infer<typeof ProvenanceEdgeSchema>;
```

Exactly one of `toArtefactId` / `toElementId` MUST be non-null (validated at insert).

### §2.3 — `ContextSnapshot`

The serialised context attached to a model call. Lets a future auditor reproduce a deterministic-flagged call.

```ts
// packages/schemas/src/provenance/ContextSnapshot.ts
export const ContextSnapshotSchema = z.object({
  id: z.string().regex(/^cs_[0-9a-f-]{36}$/),
  contextHash: z.string().length(64),
  projectId: z.string(),
  takenAt: z.string().datetime({ offset: false }),

  // What was attached to the prompt
  systemPromptVersion: z.string(), // e.g. 'apartment-layout-system-v3.2'
  selectedElementIds: z.array(z.string()),
  activeLevelId: z.string().nullable(),
  activeViewKind: z.enum(['plan', '3d', 'elevation', 'section', 'sheet']).nullable(),

  // Project-state hash — SHA-256 of canonical-form file-format payload
  // (per C05) at the moment of the call. Lets the auditor reload "what the
  // model saw" by checking out the project at this hash.
  projectStateSha: z.string().length(64),

  // Tool-use / function-calling surface
  toolsAvailable: z.array(z.string()),

  // Plan tier + feature flags active at call time
  planTier: z.string(),
  featureFlags: z.record(z.boolean()).optional(),
});

export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;
```

The `projectStateSha` is the bridge to [C05 Persistence](./C05-PERSISTENCE-AND-FILE-FORMAT.md): combined with the project's CRDT log, an auditor can wind the project back to its state at the call moment without storing a full snapshot per call (snapshots are de-duplicated by `contextHash`).

### §2.4 — `RedactionRecord`

The audit row for the redaction event itself (per §1.6). Never stores the redacted content.

```ts
// packages/schemas/src/provenance/RedactionRecord.ts
export const PiiCategory = z.enum([
  'personal-name',
  'email',
  'phone',
  'street-address',
  'government-id',
  'customer-id',
  'free-text-unclassified',
]);

export const RedactionRecordSchema = z.object({
  id: z.string().regex(/^rr_[0-9a-f-]{36}$/),
  artefactId: z.string().regex(/^aia_[0-9a-f-]{36}$/),
  redactorVersion: z.string(), // semver of packages/pii-redactor
  redactedAt: z.string().datetime({ offset: false }),

  // Counts only — never the content
  redactionsByCategory: z.record(PiiCategory, z.number().int().nonnegative()),
  totalTokensRedacted: z.number().int().nonnegative(),

  // Was the redactor confident?
  confidence: z.enum(['high', 'medium', 'low']),
  redactionFailed: z.boolean(), // §1.6 fail-closed signal
});

export type RedactionRecord = z.infer<typeof RedactionRecordSchema>;
```

### §2.5 — `ProvenanceExport`

The customer-facing audit bundle (§1.8).

```ts
// packages/schemas/src/provenance/ProvenanceExport.ts
export const ProvenanceExportSchema = z.object({
  exportArtefactId: z.string().regex(/^aia_[0-9a-f-]{36}$/),
  projectId: z.string(),
  requestedByUserId: z.string(),
  requestedAt: z.string().datetime({ offset: false }),
  format: z.enum(['pdf', 'json']),
  artefacts: z.array(AIArtefactSchema),
  edges: z.array(ProvenanceEdgeSchema),
  contextSnapshots: z.array(ContextSnapshotSchema),
  redactionRecords: z.array(RedactionRecordSchema),

  // Coverage metadata
  artefactsFrom: z.string().datetime({ offset: false }),
  artefactsTo: z.string().datetime({ offset: false }),
  totalArtefacts: z.number().int().nonnegative(),
  totalEdges: z.number().int().nonnegative(),

  // Signature so an external auditor can verify provenance origin
  pryzmSignatureEd25519: z.string(), // base64
  pryzmSigningKeyId: z.string(),
});
```

The Ed25519 signature uses the same key-management surface as the plugin marketplace per [C07 §5](./C07-PLUGIN-SDK-AND-MARKETPLACE.md). An external regulator can verify the dump is genuine without trusting the customer who exported it.

---

## §3 — Stores / API surface

### §3.1 — `ProvenanceStore` (append-only)

Implementation: `packages/provenance/src/ProvenanceStore.ts` (NEW L2 package, follows the L2 doctrine — pure domain logic, no I/O at construction, takes a `ProvenanceBackend` port for persistence).

```ts
export interface ProvenanceBackend {
  /** Insert one artefact row. MUST be idempotent on idempotencyKey (§1.11). */
  insertArtefact(row: AIArtefact): Promise<{ inserted: boolean; id: string }>;
  /** Insert one edge row. */
  insertEdge(row: ProvenanceEdge): Promise<void>;
  /** Insert one context snapshot (de-duplicates on contextHash). */
  insertContextSnapshot(row: ContextSnapshot): Promise<{ inserted: boolean; id: string }>;
  /** Insert one redaction record. */
  insertRedactionRecord(row: RedactionRecord): Promise<void>;
  /** Update controlled fields (§1.9 allowlist). */
  updateApprovalStatus(id: string, status: ApprovalStatus): Promise<void>;
  appendProducedElementIds(id: string, elementIds: string[]): Promise<void>;
  /** Queries. */
  queryByProject(projectId: string, opts?: QueryOpts): Promise<AIArtefact[]>;
  queryByElement(elementId: string): Promise<AIArtefact[]>;
  queryByUser(userId: string, opts?: QueryOpts): Promise<AIArtefact[]>;
  /** Lineage walk. */
  walkAncestors(artefactId: string, maxDepth: number): Promise<AIArtefact[]>;
  walkDescendants(artefactId: string, maxDepth: number): Promise<ProvenanceEdge[]>;
}

export interface ProvenanceStore {
  recordArtefact(input: RecordArtefactInput): Promise<AIArtefact>;
  linkElement(artefactId: string, elementIds: string[]): Promise<void>;
  setApproval(artefactId: string, status: ApprovalStatus): Promise<void>;
  query(): ProvenanceQueryAPI;
}
```

**Server backend**: `server/provenanceStore.js` — PostgreSQL implementation. Three tables: `ai_artefacts`, `provenance_edges`, `context_snapshots`, `redaction_records`. RLS enabled per §1.10. The `aiUsageStore.js` table `ai_usage` is the cost / spend dashboard surface and is RETAINED (per [C09 §5](./C09-AI-AND-VISIBILITY-INTENT.md)) — `ai_artefacts` is its audit-grade richer sibling and links to `ai_usage` rows via `aiUsageRowId`.

**Browser backend (offline mode)**: `packages/provenance/src/IndexedDBProvenanceBackend.ts` — buffers artefacts in IndexedDB while offline and flushes on reconnect. Buffered rows MUST flush within 60 s of reconnect or surface a `pryzm:toast` of severity `warn`.

### §3.2 — `PiiRedactor`

Implementation: `packages/pii-redactor/` (NEW L1 package, governed by [C22](./C22-PRIVACY-AND-PII-TIER.md)). Imported by both server and browser.

```ts
export interface PiiRedactor {
  redact(text: string): Promise<{
    redactedText: string;
    record: Omit<RedactionRecord, 'id' | 'artefactId' | 'redactedAt'>;
  }>;
}
```

The redactor is a deterministic regex + lightweight NER classifier. Its version (`redactorVersion`) is bumped on every change; old artefacts retain the version they were redacted under (per §1.9 append-only).

### §3.3 — `ProvenanceQueryAPI`

```ts
export interface ProvenanceQueryAPI {
  byProject(projectId: string, opts?: { from?: Date; to?: Date; workflowKinds?: string[] }): Promise<AIArtefact[]>;
  byElement(elementId: string): Promise<AIArtefact[]>;
  byUser(userId: string, opts?: { projectId?: string; from?: Date; to?: Date }): Promise<AIArtefact[]>;
  lineageOf(artefactId: string, opts?: { maxDepth?: number; direction?: 'ancestors' | 'descendants' | 'both' }): Promise<{ artefacts: AIArtefact[]; edges: ProvenanceEdge[] }>;
  exportForAudit(projectId: string, format: 'pdf' | 'json'): Promise<ProvenanceExport>;
}
```

Every method emits a `pryzm.provenance.<verb>` span (§1.7).

### §3.4 — Composition root wiring

Per [C02 Composition Root](./C02-COMPOSITION-ROOT-AND-BOOT.md), the `ProvenanceStore` is constructed once in `composeRuntime()` and exposed as `runtime.provenance`. The `AiPlane` (per [C09 §2.4](./C09-AI-AND-VISIBILITY-INTENT.md)) receives the store via DI and calls `runtime.provenance.recordArtefact(…)` inside its `plane.submit()` envelope (alongside the existing CostMeter call).

```ts
// packages/runtime-composer/src/composeRuntime.ts (sketch)
const provenance = createProvenanceStore({
  backend: opts.provenanceBackend ?? createDefaultBackend(),
  redactor: createPiiRedactor(),
  tracer,
});
const aiHost = getAiHost({ approvalQueue, costMeter, provenance });
return { …, ai: { …, provenance } };
```

---

## §4 — Commands

Provenance is **read-mostly**; the only mutation paths flow through the command bus (P6) per [C03 §4](./C03-SCHEMAS-COMMANDS-AND-STATE.md) and [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md).

### §4.1 — `ai.recordArtefact`

The command every AI workflow dispatches before resolving its outer promise (§1.1).

```ts
{
  type: 'ai.recordArtefact',
  source: 'ai',
  payload: RecordArtefactInput,  // every required field per §1.2
}
```

Handler in `packages/ai-host/src/handlers/recordArtefactHandler.ts`. Idempotent on `idempotencyKey` (§1.11). Returns the artefact id.

### §4.2 — `provenance.linkElement`

Dispatched inside the same `runBatch` as the element-creation commands (§1.3).

```ts
{
  type: 'provenance.linkElement',
  source: 'ai',
  payload: {
    artefactId: string,
    elementIds: string[],
  },
}
```

### §4.3 — `provenance.queryByProject`

```ts
{
  type: 'provenance.queryByProject',
  source: 'ui' | 'plugin' | 'ai',
  payload: {
    projectId: string,
    from?: string,  // ISO-8601
    to?: string,
    workflowKinds?: string[],
  },
}
```

Read-only; emits `pryzm.provenance.queryByProject` span.

### §4.4 — `provenance.exportForAudit`

```ts
{
  type: 'provenance.exportForAudit',
  source: 'ui',
  payload: {
    projectId: string,
    format: 'pdf' | 'json',
  },
}
```

The export-action itself writes an `AIArtefact` of `workflowKind: 'provenance-export'`, per §1.8. Returns the export-artefact id; the actual file is fetched via `GET /api/provenance/exports/:artefactId`.

### §4.5 — `provenance.setApproval`

Updates the mutable `approvalStatus` (§1.9 explicit exception).

```ts
{
  type: 'provenance.setApproval',
  source: 'ui',
  payload: {
    artefactId: string,
    status: 'user-approved' | 'user-rejected' | 'auto-applied',
  },
}
```

The UI's "Accept layout" / "Reject" buttons in the [C09 §3.4.2](./C09-AI-AND-VISIBILITY-INTENT.md) modal dispatch this.

---

## §5 — UI

Per [C06 UI Shell](./C06-UI-SHELL-AND-TOOLS.md). Two surfaces:

### §5.1 — Per-element "Show AI provenance" panel

Right-click any element → context-menu entry **"Show AI provenance"** (shown only when the element has at least one `producedElementIds` reverse-lookup hit).

Opens the **Provenance Panel** (right-rail tool, slot allocated alongside Property Inspector per [C27 BIM3 Inspect](./C27-BIM3-INSPECT-MODEL.md)). The panel renders:

- **Header** — the artefact id, model, workflow + version, timestamp, user, cost.
- **Lineage graph** — a D3-force directed graph of ancestor + descendant artefacts. Nodes are artefacts (colour-coded by `reproducibility`), edges are `ProvenanceEdge` rows. Selected node opens its detail view.
- **Prompt preview** — the redacted preview text. PII redaction badges visible.
- **Context snapshot** — links to "Open project state as of this call" (per §2.3 `projectStateSha` → loads the project at that hash into a read-only viewer).
- **Approval status** — current value + audit trail of `provenance.setApproval` dispatches.

The panel is **read-only** apart from the `setApproval` action.

### §5.2 — Project-level audit export

Under **Project Settings → Audit & Compliance**:

- **"Export AI provenance"** button — opens a small dialog: format (PDF / JSON), date range (optional). Dispatches `provenance.exportForAudit`. Surfaces a "preparing" toast; when the artefact resolves, surfaces a "download ready" toast with a link.
- **"Recent AI activity"** table — paginated list of artefacts for the current project, filterable by user / workflow / date. Click-through to the §5.1 panel.
- **"Provenance health"** badge — shows the count of `pending` approval rows older than 30 days (a stale-approval signal — the user generated AI output and never approved/rejected it).

The export action MUST surface a clear confirmation that the export is **append-only** and CANNOT be deleted — this protects users from thinking they can "redo" an export.

### §5.3 — Public AI API echo

For public-API consumers ([C09 §3](./C09-AI-AND-VISIBILITY-INTENT.md), routes in `server/aiPublicApiRoutes.js`), every response MUST echo the `artefactId` in the response header `X-PRYZM-Artefact-Id` so the consumer can correlate their downstream actions back to PRYZM's provenance graph.

---

## §6 — Tests / CI gates

Conformance is enforced by static + runtime gates. Each gate is merge-blocking per [C10 §4](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

### §6.1 — Static gates

| Gate | Checks | Invariant |
|---|---|---|
| `check-ai-records-artefact.ts` | Every call site of `relay.complete()`, `AiPlane.submit()`, or a deterministic engine's `run()` is followed (in the same function scope) by `provenance.recordArtefact()` | §1.1 |
| `check-ai-artefact-schema.ts` | Every `recordArtefact` call argument satisfies `AIArtefactSchema` (parsed at typecheck time via zod-to-ts test fixtures) | §1.2 |
| `check-provenance-edges-on-batch.ts` | Every `runBatch` envelope that creates elements includes a `provenance.linkElement` dispatch | §1.3 |
| `check-determinism-discriminator.ts` | Every artefact-write call site provides `reproducibility` AND `seed` is null iff `reproducibility === 'non-deterministic'` | §1.4 |
| `check-retention-period.ts` | No DELETE / TRUNCATE on `ai_artefacts` outside the GDPR-erasure code path | §1.5, §1.9 |
| `check-redaction-completeness.ts` | The stored `promptPreviewRedacted` of every artefact in a test fixture passes the PII scanner (no leaks) | §1.6 |
| `check-provenance-append-only.ts` | Static scan of `server/`, `migrations/`, `packages/` for forbidden DELETE/UPDATE statements on `ai_artefacts`, `provenance_edges` | §1.9 |
| `check-provenance-tenant-isolation.ts` | Every `ProvenanceQueryAPI` call path has a `projectId` filter; RLS policy is present in `dbMigrate.js` | §1.10 |
| `check-provenance-no-duplicates.ts` | A test that fires 5 retries of the same logical call produces exactly 1 artefact row | §1.11 |
| `check-cache-hit-records-artefact.ts` | A test that exercises `AiResponseCache.get()` and asserts an artefact row is written with `cacheStatus: 'hit'` | §1.12 |

### §6.2 — Runtime conformance suite

`packages/provenance/__tests__/`:

- **Append-only invariant** — attempt every forbidden mutation; assert it throws.
- **Lineage walk** — build a 5-deep DAG; assert ancestors + descendants resolve correctly + cycle rejection works.
- **Redaction** — feed every PII category through; assert no PII byte reaches the store.
- **Export round-trip** — generate → export JSON → re-import into a fixture store → assert signature verifies and row count matches.
- **Multi-tenant isolation** — query as `userA` for `projectB` → assert zero rows (RLS).
- **GDPR erasure** — full flow including `RetentionExceptionLog` row.

### §6.3 — End-to-end (Playwright)

`tests/e2e/provenance-export.spec.ts` — generate apartment layout → accept it → open Audit panel → export PDF + JSON → assert files non-empty + signature verifies.

---

## §7 — NFT targets

Per [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md). New NFT entries (proposed addition to the C10 §1 table on this contract's ratification):

| # | NFT | Target | Bench file |
|---|---|---|---|
| 20 | Artefact write latency | < 50 ms p95 (server backend) | `provenance-write.bench.ts` |
| 21 | Query by project (10k artefacts) | < 200 ms p95 | `provenance-query-by-project.bench.ts` |
| 22 | Query by element (lineage walk depth 5) | < 150 ms p95 | `provenance-lineage-walk.bench.ts` |
| 23 | Export to PDF (1k artefacts) | < 60 s p95 | `provenance-export-pdf.bench.ts` |
| 24 | Export to JSON (10k artefacts) | < 30 s p95 | `provenance-export-json.bench.ts` |
| 25 | 7-year archival capacity | Cold-storage tier query restores within 5 business days | `provenance-archive-restore.runbook.md` |

### §7.1 — Write latency budget

The 50 ms p95 budget is the headroom that lets the artefact write sit on the AI call's critical path (§1.1) without measurably affecting [C10 NFT 14](./C10-PERFORMANCE-AND-OBSERVABILITY.md) (AI plan-critique e2e < 8 s). The write is a single INSERT against `ai_artefacts` + at most three additional INSERTs (edges, context snapshot, redaction record) — all in a single transaction.

### §7.2 — Query latency budget

The 200 ms p95 for `byProject` covers the audit-panel render and the "recent AI activity" table. Indexes MUST exist on `(projectId, timestamp DESC)` and `(projectId, workflowKind)`.

### §7.3 — Export latency budget

PDF export is intentionally slower (60 s) because the render is layout-heavy (one page per artefact in the audit grade format). JSON export is the primary machine-consumption path; 30 s for 10k artefacts is the target.

### §7.4 — Archival capacity

Beyond 7 years, rows are MIGRATED to cold storage (S3 Glacier / Azure Archive Storage) by a nightly cron. Cold-storage rows MUST be restored on-request within 5 business days. The restore-job itself writes an artefact of `workflowKind: 'provenance-archive-restore'`.

---

## §8 — Migration plan

This contract codifies an audit layer that **partially exists today** in two server fragments. The migration is additive: existing tables retain their roles and gain a sibling `ai_artefacts` table.

### §8.1 — Current state (as of 2026-06-01)

- `server/aiUsageStore.js` (`ai_usage` table) — captures the **cost** projection: row per call with model · workflow · surface · tokens · USD · duration · status. Lacks: prompt hash, context hash, lineage, reproducibility, approval status, element linkage, redaction. ([C09 §5](./C09-AI-AND-VISIBILITY-INTENT.md)).
- `server/aiResponseCache.js` (`ai_response_cache` table) — captures the **cache** projection: response payload + TTL + hit-count, keyed by `(tenantId, contentHash, modelVersion)`. Lacks: prompt details, lineage, user/project identity, approval status.
- `packages/ai-cost/src/CostMeter.ts` — in-memory aggregator the in-process `AiPlane` uses pre-budget.
- `packages/ai-host/src/AiPlane.ts` — `plane.submit()` already opens a `pryzm.ai.workflow.{kind}` span; the artefact-write hooks into the same span.

What's missing:

1. The `ai_artefacts`, `provenance_edges`, `context_snapshots`, `redaction_records` tables.
2. The `packages/provenance/` package + `packages/pii-redactor/` package.
3. The `ProvenanceStore` wiring into `composeRuntime()`.
4. The handler / command surfaces in §4.
5. The UI panels in §5.
6. The 10 static gates in §6.1.

### §8.2 — Migration steps

Five steps. Each is one PR. Each gates on the previous landing.

| Step | What | Touches |
|---|---|---|
| 1 | Schemas + store package | `packages/schemas/src/provenance/`, `packages/provenance/`, `packages/pii-redactor/` |
| 2 | Server backend + tables + RLS | `server/dbMigrate.js` (new tables 16–19), `server/provenanceStore.js`, `server/piiRedactor.js` |
| 3 | Composition root + AiPlane wiring | `packages/runtime-composer/`, `packages/ai-host/src/AiPlane.ts` (add `provenance.recordArtefact` call), `packages/ai-host/src/handlers/recordArtefactHandler.ts` |
| 4 | UI panels + export route | `apps/editor/src/ui/provenance/`, `server/provenanceRoutes.js` |
| 5 | Static gates + bench + Playwright | `tools/ga-gate/check-*.ts`, `apps/bench/src/benches/provenance-*.bench.ts`, `tests/e2e/provenance-export.spec.ts` |

### §8.3 — Backfill policy

Historical `ai_usage` rows from before this contract's ratification CANNOT be backfilled to `ai_artefacts` — they lack the required tuple (prompt sha, context hash, redaction record). They retain their place in the cost dashboard but DO NOT contribute to the audit trail. The `ai_artefacts` table starts empty at migration step 2.

Existing artefacts in `ai_usage` MAY be referenced by future artefacts via a `legacyAiUsageId` optional field on `AIArtefact` (added in step 1's schema) for the period during which both surfaces are written (overlap budget: 30 days). After 30 days the migration is complete and the legacy reference field becomes informational only.

### §8.4 — Bridge to `ai_usage`

For the overlap period, the same `recordArtefact` handler ALSO writes the `ai_usage` row (preserving the spend dashboard). After 30 days, the spend dashboard query is migrated to derive from `ai_artefacts` directly and the dual-write is removed. The `ai_usage` table is retained for historical queries but is read-only.

---

## §9 — What is NOT in C23

This contract owns **provenance / audit trail**. Adjacent concerns belong to sister contracts:

- **AI cost governance + monthly budget enforcement** → [C09 §2.3](./C09-AI-AND-VISIBILITY-INTENT.md) (quota) + [C09 §5](./C09-AI-AND-VISIBILITY-INTENT.md) (cost) + the existing `enforceAIQuota` in `server/planStore.js`. C23 records the cost *per call* but does not enforce the *budget*; that's C09's job.
- **PII tier rules + per-tier retention** → [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md). C23 calls C22's redactor (§1.6); the data-classification rules belong to C22.
- **General observability spans + NFT benchmarks** → [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md). C23 emits provenance-specific spans (§1.7) under the same span contract C10 governs.
- **Visibility intent** → [C09 §4](./C09-AI-AND-VISIBILITY-INTENT.md). The Provenance Panel may visualise provenance via visibility intent (highlight all elements produced by artefact X), but the intent rules are C09's.
- **Human-approval UX** → [C09 §6](./C09-AI-AND-VISIBILITY-INTENT.md) (the AiApprovalQueueStore and the §11 modal). C23 records the approval *status* on the artefact, but the UX of the approve/reject flow lives in C09.
- **CRDT collaboration** → [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md). Provenance rows are NOT replicated via CRDT — they live in the server's PostgreSQL exclusively. The client buffers offline writes per §3.1 and flushes via REST, never via Yjs.
- **Plugin trust + revocation** → [C07 Plugin SDK](./C07-PLUGIN-SDK-AND-MARKETPLACE.md). Plugin-originated AI calls still write to `ai_artefacts` and the `surface` field carries the plugin id, but the trust model is C07's.
- **File-format versioning** → [C05 Persistence](./C05-PERSISTENCE-AND-FILE-FORMAT.md) + (future) C47. The `projectStateSha` in §2.3 references the file-format hash; the format itself belongs elsewhere.

---

## §10 — Open questions (to resolve before CANONICAL)

These are deferred to the C23 → CANONICAL ratification PR. They do not block DRAFT merge.

1. **Multi-tenant provenance leakage at the model layer.** If two different tenants on the same plan tier issue similar prompts within seconds, does the upstream model cache the response in a way that leaks? Anthropic + OpenAI both deny this contractually, but the audit story is "we never saw the cross-tenant context, so we can't certify." Open: do we need an extra `tenantSaltHash` field embedded in the prompt itself so we can detect cross-tenant carry-over after the fact?

2. **Non-deterministic AI deduplication semantics.** §1.13 specifies a per-workflow canonicaliser, but apartment-layout's output has 11 ranked options each of which is structurally similar — what's the canonicalisation rule that says "these two runs produced the same set of design alternatives"? Likely needs a sorted, normalised projection per workflow; the spec for that lives in each workflow's SPEC doc.

3. **Cold-storage restore cost-recovery model.** §7.4 says 5 business days for archive restore. Should the customer be billed for the restore (it's a real S3 Glacier egress cost) or is it amortised into the plan tier? Pricing decision — belongs to the (future) C39 contract.

4. **Provenance during partial CRDT replays.** If a peer joins a project mid-session and replays the CRDT log to catch up, does it need to also fetch the in-flight provenance rows? Today's answer: NO, provenance is server-authoritative and a peer queries by project on demand. But this means a peer that loses connectivity right after dispatching `provenance.linkElement` may have inconsistent local UI showing the element without its provenance. Mitigation: client-side optimistic local cache flushed to server-source on reconnect. Detailed flow: open ADR.

5. **Export signing key rotation.** §2.5's Ed25519 signature uses a PRYZM-controlled key. Rotation policy — yearly? on incident? — is unresolved. A rotated key MUST NOT invalidate previously signed exports; the signing-key-id field carries the version so external verifiers can pick the right pub key. Operational detail: open runbook.

6. **AI calls from server-side automation (no `userId`).** [C28 Data Panel](./C28-DATA-PANEL-AND-AUTOMATION.md) introduces cron-scheduled AI calls. The `userId` for those is the project owner at schedule-creation time, but ownership can transfer. Open: does the artefact carry the *original* owner or the *current* owner? Tentative answer: the original at write time (append-only), but the project Audit panel surfaces both for clarity.

7. **Worker-pool / horizontal-scaling write coordination.** The idempotency key (§1.11) prevents duplicates from the same client, but two different workers picking up retries for the same upstream call could race on the INSERT. PostgreSQL's `ON CONFLICT … DO NOTHING` on the `idempotencyKey` unique index covers this — but needs an explicit conformance test.
