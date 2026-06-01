# C47 — File-Format Versioning

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **lifecycle of the `.pryzm` file format** — schema versioning, breaking-change policy, forward + backward compatibility windows, migration runners, the deprecated-format-rejection deadline, third-party-tool import safety, file-signature provenance. Codifies the SemVer-tied schema version, the `formatVersion` field's binding semantics, the per-version migration registry, the writer-version-vs-feature-version distinction, the customer-facing communication for format upgrades, and the rollback safety net. **The `.pryzm` file is a long-lived customer artefact** — a project a customer authored in 2024 must remain readable in 2030 without manual surgery. This contract codifies how PRYZM keeps that promise while still evolving the schema for new capabilities.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas L0-pure; the `.pryzm` schema lives here), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (the file-format companion contract — C05 defines the FORMAT today; C47 defines the EVOLUTION POLICY), [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) (project open / save / migrate lifecycle), [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC export's version constraints — the IFC version we target evolves on its own cadence), [C26](C26-REVIT-ROUND-TRIP.md) (round-trip-with-Revit compatibility windows).
> **Sibling**: [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) — C05 owns the file-format CONTENT; C47 owns the file-format LIFECYCLE.
> **Downstream**: migration runner registry · per-release "what's new in the file format" customer communication · the legacy-file-rejection signpost · the third-party-tool reverse-compatibility surface · the import-safety wall (rejecting suspicious or out-of-window files).
> **Key principles**: **P5** (`.pryzm` schemas L0-pure), **P6** (every migration is a command — auditable, reversible where possible), **P8** (every migration run + every rejection emits a span), **P0.3** (plugin-defined element schemas have their own versioning track — see §1.10).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §14 (Phase 6.4 operational)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.5](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — The `.pryzm` file carries `formatVersion` as a top-level field

Every `.pryzm` file MUST carry `formatVersion: SemVer` at the top of the JSON payload (before the `project` or any element data). The format-version is the binding signal: a reader inspects it FIRST + dispatches to the appropriate parser / migrator. Files without `formatVersion` are pre-versioning legacy and treated as `formatVersion: 1.0.0` (the implicit baseline).

The format-version is SEPARATE from the application version. App version `5.3.2` may write `formatVersion: 2.4.0`; app version `5.3.3` (a bug-fix release) writes the same `formatVersion`.

### §1.2 — SemVer semantics: major = breaking, minor = additive, patch = clarifying

```
formatVersion = MAJOR.MINOR.PATCH

MAJOR bump  → a reader of MAJOR-1 cannot parse a MAJOR file without migration
MINOR bump  → a reader of MAJOR.MINOR-1 SHALL ignore unknown fields and parse the file
              (forward compatibility within a MAJOR)
PATCH bump  → no schema change; reserved for documentation/clarification updates
              (e.g. an enum value's meaning is clarified without changing its name)
```

A MAJOR bump is a deliberate, rare, customer-communicated event — typically every 18-24 months at most. A MINOR bump happens with normal feature development — every 2-4 weeks. A PATCH bump is announcement-only — no code change for readers.

### §1.3 — Migrations from formatVersion N to N+1 are codified, tested, and irreversible

For every MAJOR bump there exists a migration runner: `migrations/<from>-<to>.ts`. The migration is:

- **Codified** — a TypeScript function `(input: FormatNJson) => FormatNPlus1Json`
- **Tested** — at least 20 fixture files of varying complexity round-trip through the migration
- **Idempotent** — re-applying the migration to an already-migrated file is a no-op
- **Logged** — the migration records to a `MigrationLog[]` field in the file ("this file was migrated from 1.x.x to 2.0.0 at <timestamp> by app version <appVersion>")
- **Irreversible** — the migration does NOT need a reverse path; if customers need to revert, they restore from a backup ([C48](C48-BACKUP-AND-DR.md))

The migration runs at the OPEN time, not at SAVE time. A customer opening an old file sees a one-time "Updating file format..." UI for migrations that cross MAJOR boundaries; minor-version files open without ceremony.

### §1.4 — Forward compatibility within a MAJOR is guaranteed

A reader at `formatVersion: 2.3.0` MUST be able to open a file written at `formatVersion: 2.5.0`. The reader:

- Ignores unknown top-level fields (silently — they're new features)
- Ignores unknown enum values (silently for non-critical, errors for critical — explicit per-field policy)
- Records a `forwardCompatNote` in its session log noting the version gap

This is the binding promise that lets customers update PRYZM at their own pace. The reader still has to write the file back at its own writer-version (i.e. it MAY lose data in the round-trip — a `2.3.0` writer cannot serialise a `2.5.0`-only field).

### §1.5 — Backward compatibility is windowed at 24 months

PRYZM commits to opening files written within the last 24 months (rolling window). Files older than 24 months MAY still open + migrate but the path is NOT guaranteed; in practice every migration since the introduction of the format has been kept.

The 24-month commitment is the contractual minimum. The de-facto track record is longer. Customers with a > 24-month-old file see a banner during open: "This file is older than our forward-compatibility window — verify the result before relying on it" + a CTA to file a ticket if anomalies appear.

After 5 years from a MAJOR's introduction (e.g. `1.x.x` retires 5 years after `2.0.0` releases), the migration may be removed from the migration registry. Files at that age are still opened via a multi-step migration (1.x → 2.x → 3.x → 4.x → current) — but each intermediate step is run sequentially.

### §1.6 — Lost-on-downgrade fields are explicit

When a writer writes a file at version N, any field that a reader at version N-1 would not understand is annotated in the file's `forwardOnlyFields: string[]`:

```json
{
  "formatVersion": "2.5.0",
  "forwardOnlyFields": [
    "project.aiHistorySummary",
    "site.climateBindingRef"
  ],
  ...
}
```

A reader at version `2.4.0` opens the file, ignores the forward-only fields, but surfaces a banner: "This file was authored in a newer PRYZM version. Some fields will be discarded on save: aiHistorySummary, climateBindingRef." The customer can decide to (a) save anyway (losing those fields), (b) re-open in a newer PRYZM, or (c) cancel.

The `forwardOnlyFields` list is generated by the writer as it serialises — the writer knows which fields are new to its version + emits the list.

### §1.7 — Writer attribution is non-removable

Every `.pryzm` file carries:

```json
{
  "writerVersion": "5.3.2",
  "writerSource": "pryzm-editor" | "pryzm-cli" | "pryzm-api" | "<plugin-author-id>",
  "writtenAt": "2026-06-01T10:00:00Z",
  "writerSignature": "<hmac-sha256-of-canonical-content>"
}
```

The writer-signature is for tamper-detection (NOT cryptographic provenance — that's [C23](C23-PROVENANCE-AND-AI-AUDIT.md)). On open, the reader recomputes the signature; mismatch flags a "file has been edited outside PRYZM" banner. The signature is keyed by `writerVersion`'s public-key (PRYZM publishes per-major-version signing keys in the docs site).

This protects against (a) manual JSON edits that break schema constraints, (b) malicious payload injection via uploaded files, (c) accidental corruption during transmission.

### §1.8 — Per-element schema versioning

Each element type's schema may version independently of the overall file format. A `Wall` schema, for example, evolves with new layered-wall features:

```json
{
  "id": "wall-123",
  "type": "wall",
  "schemaVersion": "1.4.0",
  "data": { ... }
}
```

The per-element version allows fine-grained migration. The migration registry per element lives in `packages/schemas/src/<element>/migrations/`. Element-level migrations are run lazily as elements are read; not all elements migrate at file-open time (file-open migrates the file-level schema; element migrations run on access).

A file's element-level migrations MUST complete BEFORE the project is editable; the open-time progress bar covers both file-level + element-level migrations.

### §1.9 — Customer-facing format-upgrade notice

When a MAJOR bump ships:

- A blog post + a page in the docs site explain what changed
- A customer who opens a file authored in the old format sees a one-screen modal explaining the upgrade + a CTA to view the change log
- Existing customers' files migrate ON OPEN — no eager bulk migration

For a MINOR bump, no customer notice is needed (forward + backward compatibility ensures silent operation).

### §1.10 — Plugin-defined schemas use a parallel versioning track

Plugins (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) may define their own element schemas (e.g. a "skylight" element introduced by a marketplace plugin). These schemas live in `pluginData.<pluginId>.schemaVersion`. The plugin owns:

- Its schema's evolution (per its own SemVer)
- Migration runners for its data
- The plugin uninstall-but-keep-data path (when a plugin is uninstalled, its data lingers in `pluginData` with the plugin's last-known schemaVersion; re-install restores access)

PRYZM's responsibility is to preserve the `pluginData` blob across file-format migrations + provide a stable hook for the plugin's migrator to run when the plugin opens an old-version blob.

### §1.11 — Every migration run emits a span

Per P8:

- `pryzm.format.fileOpen` — `{ fileSize, fromVersion, toVersion, migrationCount, durationMs }`
- `pryzm.format.migration.run` — `{ from, to, elementCount, durationMs }`
- `pryzm.format.reject` — `{ fromVersion, reason: 'too_old' \| 'corrupt_signature' \| 'unknown_writer' \| 'malformed_json' }`
- `pryzm.format.forwardCompat` — `{ readerVersion, fileVersion, fieldsDiscarded }`
- `pryzm.format.bump.published` — `{ from, to, kind: 'MAJOR' \| 'MINOR' \| 'PATCH' }` (one per release that bumps formatVersion)

Spans MUST open at the public boundary of `packages/file-format/`.

### §1.12 — Files written by older majors auto-migrate on open

Files at `formatVersion: 1.x.x` opened on a reader at `formatVersion: 2.5.0` auto-migrate through the chain (`1.x → 2.0 → 2.5`). The migration produces a NEW file at the reader's current writer version. The customer is informed via a modal:

"This project was created in an older PRYZM version. We've updated it to the current format. The original is preserved in the cloud backup (see Backups → Version History)."

The original is preserved in `[C48](C48-BACKUP-AND-DR.md)` backup tier; the customer can restore if needed.

### §1.13 — File-import safety wall

When a customer imports a `.pryzm` file (drag-drop, "Open from disk"), the wall:

- Verifies the file is JSON-parseable
- Verifies `formatVersion` exists + is a valid SemVer
- Checks the signature (warning if invalid; not a hard reject)
- Verifies the schema validates against the appropriate version's zod schema
- Verifies the file size is within reasonable bounds (default 500 MB; configurable per plan tier)
- Sandboxes the open until validation passes — no element rendering until safe

A file failing any of these emits `pryzm.format.reject` + surfaces a customer-friendly error.

### §1.14 — Discipline-neutrality

The file-format versioning policy MUST NOT vary by customer discipline. Per the C00 governance discipline-neutrality bar.

### §1.15 — Critical-field versioning is explicit + announced

Some fields are "critical" — a reader that misunderstands them produces dangerous results (e.g. unit interpretation, structural-classification, fire-rating). Critical field changes:

- Require an explicit "deprecate" + "remove" cycle (12 months minimum between deprecate + remove)
- Are announced in the release notes
- Carry an `aliases` map in the schema (e.g. old field name → new field name) for at least 12 months
- Force a MAJOR bump on the removal release (per §1.2 semantics)

The critical-field list is published at `docs/02-decisions/contracts/C47-critical-fields.md` (a companion doc, updated each release).

---

## §2 — Schema (in `packages/schemas/src/file-format/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `FormatVersion` | branded SemVer string matching `^\d+\.\d+\.\d+$` |
| `FormatVersionDelta` | `{ from: FormatVersion, to: FormatVersion, kind: 'MAJOR' \| 'MINOR' \| 'PATCH' }` |
| `MigrationRegistry` | `Record<FormatVersion, Migration>` (compile-time constant) |
| `Migration` | `{ from: FormatVersion, to: FormatVersion, idempotent: true, migrator: (input: unknown) => unknown }` |
| `MigrationLogEntry` | `{ fromVersion, toVersion, runAt: ISOTimestamp, runByAppVersion, durationMs, elementCount }` |
| `WriterAttribution` | `{ writerVersion, writerSource, writtenAt, writerSignature }` |
| `ForwardOnlyFields` | `string[]` (JSON paths) |
| `FileEnvelope` | `{ formatVersion, writerAttribution, forwardOnlyFields, migrationLog: MigrationLogEntry[], project, elements, pluginData }` (top-level JSON shape) |
| `ElementVersion` | `{ id, type, schemaVersion, data }` |
| `CriticalField` | `{ path, introducedAt: FormatVersion, deprecatedAt?: FormatVersion, removedAt?: FormatVersion, aliases?: string[] }` |
| `ImportRejection` | `{ id, fileSize, attemptedFormatVersion, reason, occurredAt, customerOrgId }` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `FormatVersion` | matches `/^[0-9]+\.[0-9]+\.[0-9]+$/` |
| `FileEnvelope.formatVersion` | present + valid SemVer; reject otherwise |
| `WriterAttribution.writerSignature` | non-empty; HMAC-SHA256 of canonical-JSON-of-content; key per-MAJOR |
| `MigrationLogEntry.runAt` | ISO 8601 UTC |
| `CriticalField.deprecatedAt` | MUST exist before `removedAt`; `removedAt - deprecatedAt >= 12 months` |
| `ImportRejection.reason` | one of the §1.13 enum values |

### §2.3 — Reserved top-level fields

| Field | Semantics |
|---|---|
| `formatVersion` | binding; MUST be first |
| `writerAttribution` | required |
| `forwardOnlyFields` | optional (absent = no forward-only fields) |
| `migrationLog` | required (empty array if never migrated) |
| `project` | required (the C13 project record) |
| `elements` | required (the C03 element set) |
| `pluginData` | optional |
| `_reserved_*` | reserved namespace for future use; reader MUST preserve on write-back |

---

## §3 — Stores

### §3.1 — `FormatVersionStore` (`packages/file-format/src/store.ts`)

Client + server. Holds the current reader's max supported version + the migration registry. Read-only at runtime; updated at deploy time.

### §3.2 — `MigrationRegistry` (`packages/file-format/src/migrations/registry.ts`)

Client + server. Source-of-truth for every codified migration. A migration from N to N+1 lives in `migrations/<from>-<to>.ts`; the registry indexes them.

### §3.3 — `ImportRejectionLedger` (server-side, `server/file-format/ImportRejectionLedger.ts`)

Server-side append-only. Every import rejection (per §1.13) is recorded. Used for ops to detect suspicious upload patterns + format-distribution analytics.

### §3.4 — `CriticalFieldRegistry` (`packages/file-format/src/criticalFields.ts`)

Client + server. The §1.15 critical-field list. Schema validators consult this on read + write.

### §3.5 — Persistence

The registry + critical-field list are bundled at build time. The rejection ledger persists in PostgreSQL. Migrated files are saved in the customer's cloud project store; the original pre-migration file is preserved in [C48](C48-BACKUP-AND-DR.md) backup.

### §3.6 — Open pipeline

```
customer: opens a .pryzm file
   │
   ▼  JSON.parse (with size + depth limit)
   │     - parse error → import reject (reason: malformed_json)
   │
   ▼  read formatVersion
   │     - missing → assume 1.0.0; emit forwardCompatNote
   │     - newer than reader's max → load forwardCompat policy
   │     - within window → continue
   │     - too old (> 24 months OR < first-supported) → reject (reason: too_old) OR proceed with warning per §1.5
   │
   ▼  verify writerSignature
   │     - mismatch → banner + continue (not hard reject — per §1.7 + §1.13)
   │
   ▼  zod-validate against the file's claimed version's schema
   │     - validation error → import reject (reason: malformed_json)
   │
   ▼  if formatVersion < reader's max:
   │     - chain-apply migrations from formatVersion → reader's max
   │     - emit pryzm.format.migration.run per step
   │     - update migrationLog
   │     - persist original to backup tier (per §1.12)
   │
   ▼  for each element with schemaVersion < reader's max:
   │     - lazy-apply element migration on first access
   │
   ▼  open project for editing
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

### §4.1 — User-facing

| Command | Effect |
|---|---|
| `project.openFile` | Open a `.pryzm` file; runs the §3.6 pipeline |
| `project.saveFile` | Save the current project; writes the current writer version |
| `project.exportAsLegacy` | Save the project at a specified older format version (drops forward-only fields); used for collaborator-compat scenarios |
| `project.viewVersionHistory` | Read-only — see migration log + backup versions |
| `project.restoreOriginal` | Restore the pre-migration original from backup tier (per §1.12) |

### §4.2 — Admin / sales-ops-facing

| Command | Effect |
|---|---|
| `format.publishMajorBump` | Publish a new MAJOR formatVersion (with migration + blog post + critical-field updates) |
| `format.deprecateCriticalField` | Mark a critical field deprecated (12-month countdown to removal) |
| `format.removeCriticalField` | Remove a deprecated critical field (per §1.15 lifecycle) |
| `format.publishMigrationRegistry` | Publish updated MigrationRegistry to docs site (transparency for power users) |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `format.batchMigrateOnDeploy` | Optional — when a new MAJOR ships, customers' cloud-stored projects may opt-in to a server-side batch migration |
| `format.aggregateFormatDistribution` | Weekly — analytics over the customer base's formatVersion distribution; helps with cut-off planning |
| `format.recordRejection` | Telemetry — record import rejections per §3.3 |

---

## §5 — UI

### §5.1 — Migration modal

When a file opens that requires migration (older formatVersion → reader's max), a modal renders:

- Headline: "Updating file format"
- Progress (per-migration step)
- Estimated time (typically < 5 s for a typical project)
- "What's changed?" link to the version's changelog
- "Cancel" CTA (closes the file without migration)

Migration MAY be paused + resumed; customers can leave the modal up during a large migration without blocking the editor's main thread.

### §5.2 — Forward-compat banner

When a file opens that's newer than the reader (per §1.4 + §1.6), a banner reads:

"This file was created in a newer PRYZM version. Some features may be discarded if you save. [Discard list →]"

The link expands to show the `forwardOnlyFields` list. The customer can:

- Continue editing (changes will lose forward-only fields on save)
- Open the file in a fresh-version editor (link to upgrade)
- Read-only view (work continues but no save)

### §5.3 — Format-version display

In the editor's project settings, a small section shows:

- File format version (current)
- Writer version (the PRYZM that last saved)
- Migration log (one row per past migration, with dates)
- "Critical fields in this version" link → docs site

### §5.4 — Signature-mismatch banner

When a file's `writerSignature` mismatches (per §1.7), a banner reads:

"This file has been edited outside PRYZM. We can still open it, but verify the content before committing changes. [Learn more →]"

Dismissable per-session; resurfaces on every open of that file until a clean save restores signature consistency.

### §5.5 — Import-rejection landing

When `project.openFile` rejects (per §1.13), the customer sees a friendly page:

- Headline: "We couldn't open that file"
- Reason (in plain language — "the file format is older than we support" / "the file appears to be corrupt")
- Suggested next steps (re-export from the originating tool / contact support)
- "Try a different file" CTA + "Contact support" CTA

### §5.6 — Keyboard surface

Migration + format-related surfaces are primarily modal + banner interactions; standard keyboard support per [C43](C43-ACCESSIBILITY.md).

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-format-version-monotonic` | `tools/ga-gate/check-format-version-monotonic.ts` | Each release's `formatVersion` is ≥ the prior release's; MAJOR bumps documented in release notes |
| `check-migration-coverage` | `tools/ga-gate/check-migration-coverage.ts` | Every MAJOR boundary has a registered Migration entry |
| `check-migration-fixtures` | `tools/ga-gate/check-migration-fixtures.ts` | Each Migration has at least 20 fixture files in `__fixtures__/migration/<from>-<to>/` that round-trip without data loss |
| `check-migration-idempotency` | `tools/ga-gate/check-migration-idempotency.ts` | Applying a Migration to an already-migrated file is a no-op |
| `check-format-spans` | extends `check-spans.ts` | Every public `packages/file-format/` boundary function carries an OTel span (per §1.11) |
| `check-format-schemas-pure` | extends schema-purity check | `packages/schemas/src/file-format/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-writer-signature-keys` | `tools/ga-gate/check-writer-signature-keys.ts` | Each MAJOR has a published signing key in the docs site |
| `check-critical-field-deprecation-window` | runtime — schema validator | Every `CriticalField.removedAt - deprecatedAt >= 12 months` |
| `check-backward-compat-24mo` | scheduled job | Files from the past 24 months still open in the current reader (round-trip test against an archive) |
| `check-format-version-in-file` | runtime — file validator | Every `.pryzm` file written carries `formatVersion` at top |
| `check-forward-only-fields-tracked` | runtime — writer validator | Writer correctly enumerates `forwardOnlyFields` for each MINOR bump |
| `check-rejection-friendly-error` | `tools/ga-gate/check-rejection-friendly-error.ts` | Every rejection reason has a corresponding customer-friendly error message + suggested next step |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Round-trip per version | `packages/file-format/__tests__/round-trip/*.test.ts` | Writing a fixture at version N + reading at version N = identical |
| Migration chain | `packages/file-format/__tests__/migration-chain.test.ts` | Files from 1.0 → 2.0 → 3.0 (etc.) successively migrate; final result matches a directly-authored 3.0 file |
| Forward-compat | `packages/file-format/__tests__/forward-compat.test.ts` | A 2.4 reader opening a 2.5 file ignores unknown fields, surfaces forwardOnlyFields, writes back at 2.4 |
| Signature verify | `packages/file-format/__tests__/signature.test.ts` | Tampered files surface the signature-mismatch banner; clean files don't |
| Element-level migration | `packages/file-format/__tests__/element-migration.test.ts` | An element with schemaVersion < current migrates on read |
| Critical-field deprecation | `packages/file-format/__tests__/critical-field-lifecycle.test.ts` | A deprecated critical field's alias resolves; removed-after-12-months returns an error |
| Import rejection | `tests/e2e/import-reject.spec.ts` | Each rejection reason fires the appropriate landing page |
| Plugin data preserve | `packages/file-format/__tests__/plugin-data-preserve.test.ts` | Plugin data survives file-level migrations even when the plugin is uninstalled |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| File open + parse (10 MB) | < 500 ms | `file-open-10mb.bench.ts` (new) |
| Migration run (single MAJOR boundary, 10 MB) | < 2 s | `migration-1step.bench.ts` (new) |
| Multi-step migration (3 hops, 10 MB) | < 5 s | `migration-3step.bench.ts` (new) |
| Signature verify | < 100 ms for 10 MB | `signature-verify.bench.ts` (new) |
| Element lazy migration (first access) | < 50 ms | `element-lazy-migrate.bench.ts` (new) |
| Forward-only-fields detection | < 100 ms during write | `forward-only-detect.bench.ts` (new) |
| File save (10 MB) | < 800 ms | `file-save-10mb.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — Package shape

The file-format infrastructure is largely already in `packages/file-format/`; C47 codifies the policy. Light additions:

```
packages/file-format/
  src/
    versioning/
      formatVersion.ts             — SemVer parsing + delta classification
      migrationRegistry.ts         — codified Migration entries
      criticalFields.ts            — CriticalFieldRegistry
      writerAttribution.ts         — signature + writerVersion stamping
      forwardCompat.ts             — forward-only-fields tracker
    migrations/
      1-2.ts                       — 1.x → 2.x migration
      2-3.ts                       — 2.x → 3.x migration (future)
      __fixtures__/                — per-migration fixture files
    safety/
      importValidator.ts           — §1.13 wall
      rejectionLedger.ts           — server-side append-only
    schemas/                       — re-exports
```

The element-level migrations live in each element-schema package's `migrations/` directory.

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| FFM-α-1 | `packages/schemas/src/file-format/` + zod | 0.3 wk |
| FFM-α-2 | FormatVersionStore + MigrationRegistry skeleton | 0.5 wk |
| FFM-α-3 | Writer-signature + writer-attribution | 0.5 wk |
| FFM-β-1 | Import safety wall (§1.13) + rejection ledger | 0.5 wk |
| FFM-β-2 | Forward-compat: `forwardOnlyFields` enumeration + banner | 0.5 wk |
| FFM-β-3 | Migration runner + first 1-2 migration if appropriate | 1 wk |
| FFM-β-4 | Element-level lazy migration mechanism | 1 wk |
| FFM-γ-1 | Migration UI modal + progress + cancel | 0.5 wk |
| FFM-γ-2 | Critical-field lifecycle + alias resolver | 0.5 wk |
| FFM-γ-3 | Customer-facing changelog + critical-fields page | 0.5 wk |
| FFM-δ-1 | 20-fixture migration test suite per major boundary | 1 wk |
| FFM-δ-2 | CI gates (§6) all green | 0.5 wk |

**Total: ~7 wk**.

### §8.3 — Backward compatibility

The product today writes a `formatVersion` field but does not enforce the full §1 policy. The C47 codification doesn't break any existing file; it tightens the rules + adds the safety wall + the migration registry.

### §8.4 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every migration + every fixture + every rejection reason has a unit test. End-to-end: a fixture customer opens a 1.x file → migration runs → editor opens → save writes at current → close → re-open succeeds.

---

## §9 — What is NOT in this contract

- **The actual file format content (schemas)** — [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) owns the format; C47 owns the LIFECYCLE.
- **IFC version support** — IFC versions evolve on their own cadence (IFC4 → IFC4X3 → IFC5). [C25](C25-IFC-EXPORT-PRODUCTION.md) handles IFC's versioning.
- **Revit version support** — [C26](C26-REVIT-ROUND-TRIP.md) handles Revit's RVT format versions.
- **Cloud-stored project versioning** — version-history of a single project (saved snapshots over time) is owned by [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) + [C48](C48-BACKUP-AND-DR.md). C47 is about the file-format schema's evolution, not the per-project change-history.
- **Plugin SDK API versioning** — separate; [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) owns the SDK versioning.
- **REST API versioning** — separate; not yet codified (potential future contract).
- **Database schema versioning** — separate; not codified in C47.
- **Browser API versioning** — covered by [C45](C45-BROWSER-AND-DEVICE-MATRIX.md).
- **PRYZM application version (SemVer)** — `appVersion` is in package.json + release notes; not formally codified here.
- **Encryption-at-rest of `.pryzm` files** — out of scope. PRYZM-cloud-stored files are encrypted at the storage layer per [C08](C08-COLLABORATION-AND-SECURITY.md); on-disk customer copies are unencrypted.
- **Conflict-free merging of `.pryzm` files** — Yjs CRDT layer handles in-session conflict resolution; static file-merge is out of scope.

---

## §10 — Open questions (DRAFT-stage)

1. **Compression**. `.pryzm` files are currently uncompressed JSON. A 100 MB project compresses to ~15 MB with gzip. Should the format embed compression (e.g. `formatVersion` + gzipped payload), or rely on transport-layer compression (which only helps over the wire)?
2. **Binary container format**. JSON parsing for a 500 MB project is slow. Consider a binary container (e.g. msgpack, FlatBuffers) inside the `.pryzm` extension. Trade-off: parsing speed vs. human-readability + tooling.
3. **Migration-time budget**. §1.3 says migration runs at OPEN time. For a 500 MB project with 5 chain-hops, that could be a multi-minute wait. Background migration with a busy-but-functional editor a possibility?
4. **Critical-field list publication cadence**. §1.15 publishes per release. Should the published doc be append-only + sealed (per [C31](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md))?
5. **Plugin-data preservation when plugin is removed**. §1.10 says plugin data lingers on uninstall. For how long? Customer-facing UI to clean up "data from uninstalled plugins"?
6. **Multi-writer files**. Two PRYZM versions writing to the same file (manual export-then-share + re-import in a different version) creates writer-attribution churn. Currently the latest writer wins; the migration log preserves history. Is that enough?
7. **Pre-versioning legacy files**. Files written before `formatVersion` was added are treated as `1.0.0`. Should they instead be `0.x.x`? Trade-off: cleaner semantics vs. migration registry size.
8. **Major-bump cadence**. §1.2 says rare, 18-24 months. With the family-platform + cognition-stack roadmap, we may need to bump MAJOR more frequently in the first 2 years. The 24-month commitment in §1.5 still holds — but the customer-facing communication ramps up.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every migration through commandBus; schemas L0-pure |
| [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) | Sibling — C05 = file content; C47 = file lifecycle |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugin-defined schemas use parallel versioning track |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | Writer signature reuses signing infrastructure |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for every migration + rejection |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Project-level version history is separate from file-format version |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `project.*`, `format.*` commands follow the protocol |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | AI-generated artefacts' provenance is preserved across migrations |
| [C25](C25-IFC-EXPORT-PRODUCTION.md) | IFC export consumes the migrated file's data |
| [C26](C26-REVIT-ROUND-TRIP.md) | Revit-export round-trip is a known versioning interaction |
| [C29](C29-PDF-VECTOR-EXPORT.md) | PDF export's version may evolve independently |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Format-related issues route via support |
| [C48](C48-BACKUP-AND-DR.md) | Pre-migration originals preserved in backup tier |
| [C49](C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Migration runs in-region; cross-region propagation rules apply |

---

*End — C47 File-Format Versioning, 2026-06-01 — DRAFT.*
