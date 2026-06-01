# SPEC-27 — Migration & Rollback

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §11, §22.7, §27 (00_Contracts fate), §29 #5,#6,#9,#15` |
| Phases | 2A (Replit-PG → Supabase prep), 2D (production cutover), 3B (legacy delete), 3D (self-host migration) |
| Replaces / extends | scattered migration notes in PHASE-2A §6, PHASE-2D §3 |

> Migration is forward-only. Rollback is via PITR + event-log replay. This SPEC defines **every migration that ships**, who owns it, when it runs, and what the rollback path is.

---

## §1 Migration kinds

PRYZM 2 has **five migration kinds**, each with its own discipline:

| Kind | Domain | Versioning | Tooling |
|---|---|---|---|
| **Schema** | Postgres tables | numbered SQL files | `infra/db/migrations/` + Drizzle/Prisma migrate |
| **File format** | `.pryzm` archives | `formatVersion` integer | `packages/file-format/migrations/` (per SPEC-26 §6) |
| **Event** | per-event payload shapes | `event.type` discriminant + payload version | per-handler in `plugins/<family>/migrations/` |
| **Codebase** | legacy `src/` → `packages/` + `plugins/` | sprint-numbered | strangler-fig (per `09-AS-IS-VS-TO-BE` + this SPEC §4) |
| **Deployment** | Replit PG → Supabase, etc. | one-shot scripts | `infra/cutover/` |

Each is forward-only by default; rollback paths are defined per kind below.

---

## §2 Schema migrations

### §2.1 Tooling
- Drizzle Kit migrations under `infra/db/migrations/NNNN_<slug>.sql` (raw SQL with up + optional down).
- CI gate: every PR with a schema change must include a migration file; `pnpm db:check` asserts the schema matches the migration set.

### §2.2 Naming
`NNNN_YYYY-MM-DD_<verb>_<noun>.sql`, e.g. `0023_2026-09-15_add_ai_proposals.sql`.

### §2.3 Backward-compatibility window
- A migration that drops a column must keep the column for **one full release cycle** (≥4 sprints) with the new code reading both old and new shapes.
- Drop in a follow-up migration once production is fully on the new shape (via deploy-stage feature flags).

### §2.4 Forbidden
- No `DROP TABLE` in the same PR that introduces the replacement.
- No `ALTER COLUMN ... NOT NULL` on a populated column without a backfill migration first.
- No `RENAME COLUMN` on hot tables (write a migration that adds the new column + dual-write + read-from-new + drop old, across 4 sprints).

---

## §3 The Replit-PG → Supabase cutover (S43, the big one)

### §3.1 Pre-cutover (S38–S42)
1. Provision Supabase production project (EU-West first; US-East at S70 per ADR-018).
2. Run all schema migrations against Supabase.
3. Configure `SUPABASE_DB_URL` for staging; run staging on Supabase for ≥2 weeks (S40–S42).
4. Backup verification: nightly restore-into-fresh + checksum (S41).

### §3.2 Cutover day (S43 day 1)
1. Maintenance window announced 7 days in advance to all users (per ADR-021 customer-comms).
2. Read-only mode toggled in `apps/api-gateway` (gates writes; reads still served from Replit PG).
3. `pnpm migrate-pg --src=replit --dst=supabase --batch=10000 --resume` runs:
   - Tables migrated in dependency order: `pryzm_users` → `projects` → `project_versions` → `project_command_log` → `visibility_intents` → `template_registry` → `webhooks`.
   - Each table verified by `count(*)` + sampled deepEqual on 1% rows + checksum on `id` set.
4. Cutover flag `SUPABASE_PRIMARY=true` set; gateway flips writes to Supabase.
5. Read-only mode lifted.
6. Replit PG remains as **read-only fallback** for 14 days (S43–S45) for emergency rollback.
7. After 14 days clean, Replit PG production data deleted; auto-fallback in `server.js` becomes dev-only (gated by `NODE_ENV !== 'production'`).

### §3.3 Rollback path (within 14-day window)
1. Toggle `SUPABASE_PRIMARY=false` → reads/writes return to Replit PG.
2. Forward-replay any new Supabase events into Replit PG via `pnpm replay-pg --since-cutover`.
3. Investigate; re-attempt cutover.

### §3.4 After 14 days
- Rollback is via PITR + event-log replay only. Replit PG snapshot retained as cold backup for 90 days, then deleted.

---

## §4 Codebase migration (strangler-fig)

### §4.1 The five legacy zones (per `GAP-REVIEW-2026-04-27.md §23`)

| Zone | LOC | Phase 1 status | Phase 2/3 plan |
|---|---|---|---|
| `src/core/` | 76,188 | sources Phase 1 packages | split into 5 packages by S35 |
| `src/commands/` | 34,023 | 169 PORTed; 47 MERGEd; 13 DROPped; 35 LIFTed | complete by S37 |
| `src/styles/` | 30,977 | UI behemoth | refactored into `packages/ui/` + per-plugin panels per ADR-026 |
| `src/ai/` | 15,104 | scaffolded `/api/ai/*` | full L7.5 lift by S52 |
| `src/engine/` | 11,960 | `EngineBootstrap` retained | deleted at S61 |

### §4.2 Zone-by-zone deletion gates

A zone is deleted only when **all** of:
1. Replacement code green-tested (CI + parity fixtures).
2. No `import` from any active code references the zone (`pnpm boundary-check` clean).
3. Two consecutive sprints with zero `git blame` activity on the zone.
4. ADR-018 hasn't fired Tier-3 T3.5 (date slip) in the meantime.

### §4.3 Sprint schedule
- S31 — `src/collaboration/` deleted (replaced by Yjs in S43; pre-deletion via dead-code gate at S31).
- S31 — service-role-key removal from `server.js` (per SPEC-08 §6).
- S35 — `src/history/` deleted (patch-based undo lives in `packages/command-bus/`).
- S37 — `src/commands/` MERGE-class regression suite green; legacy classes deleted.
- S43 — `src/persistence/` deleted (replaced by `packages/persistence-client/`).
- S45 — `src/snapping/` deleted (lives in `packages/picking/`).
- S55 — OBC removed from editor bundle; `src/import/ifc/` migrated to `plugins/ifc-import/`.
- S58 — `src/visibility/` + 11-wave VG migrated to `plugins/visibility-intent/`.
- S61 — **`src/engine/EngineBootstrap.ts` deleted**; `apps/editor/src/main.ts` is the new composition root.
- S65 — `src/styles/panels/` migrated to `packages/ui/` panels.
- S70 — `src/lifecycle/` either ported to `plugins/lifecycle/` or deleted (per ADR-030).

### §4.4 Strangler-fig discipline
- Both old and new code paths present until the deletion gate passes.
- A feature flag (`featureFlags.<zone>_v2`) routes between them.
- A weekly metric (`pryzm.legacy.zone.<zone>.import_count`) tracks remaining importers.
- ADR-018 cut list T2.x can defer a deletion to v2 if velocity slips, but the path stays strangler-fig (no big-bang deletes).

---

## §5 The `02-decisions/contracts/` folder fate

Per gap review §27, the legacy `02-decisions/contracts/` folder is referenced by PHASE-2A but contains documents largely superseded by SPEC-01..30.

### §5.1 Per-contract decision

| Contract | Action | Target |
|---|---|---|
| `01-EVENT-LOG-CONTRACT.md` | merge into SPEC-02 | DELETE |
| `02-COMMAND-PROTOCOL.md` | merge into SPEC-03 §3 + ADR-002 | DELETE |
| `03-BIM-SEMANTIC-MODEL-CONTRACT.md` | merge into SPEC-05 + SPEC-06 | DELETE |
| `04-AI-CONTRACT.md` | already declared dead in SPEC-07:13 | DELETE |
| `05-MULTI-USER-CONTRACT.md` | merge into SPEC-03 + ADR-019 | DELETE |
| `06-PLUGIN-SDK-CONTRACT.md` | merge into SPEC-09 | DELETE |
| `07-OBSERVABILITY-CONTRACT.md` | merge into SPEC-10 | DELETE |
| `08-PERSISTENCE-CONTRACT.md` | merge into SPEC-02 | DELETE |
| `09-RENDERER-CONTRACT.md` | merge into ADR-022 + SPEC-12 | DELETE |
| `10-DRAWING-CONTRACT.md` | merge into SPEC-04 + SPEC-29 | DELETE |
| `18-BUNDLE-CHUNK-SPLITTING-CONTRACT.md` | already extended by SPEC-12 | DELETE |
| (any others) | review case-by-case | move to `archive/02-decisions/contracts/` |

### §5.2 Sprint schedule
- S31 — port still-relevant content into target SPECs; move whole folder to `archive/02-decisions/contracts/`; PHASE-2A reference replaced with SPEC-05/SPEC-06 citations.
- S32 — README updated; "read in order" deletes the contract pointers.

---

## §6 Event-payload migrations

### §6.1 Discipline
- Each `event.type` carries an implicit **payload version** equal to the count of breaking changes since v1.
- A handler that introduces a breaking payload change ships:
  1. The new handler that reads the new payload.
  2. A migration in `plugins/<family>/migrations/<type>-vN-to-vN+1.ts`.
  3. The handler version pin in `packages/protocol/event-types.json`.
- The reader (event-log replay or `.pryzm` open) automatically applies migrations top-down.

### §6.2 Forbidden
- Silently changing a payload shape without a migrator.
- Removing a field without a migrator that defaults it.
- Renaming `event.type` (always create a new type + migrator).

### §6.3 CI gate
- `pnpm test packages/protocol/migrations` fuzzes a corpus of 10k random events through each migrator.
- Every type + every version covered.

---

## §7 Self-host migration (Phase 3D)

### §7.1 Customer flows
- Customer downloads `pryzm-self-host` tarball (compose + binaries).
- Customer runs `pnpm pryzm install` (creates Postgres, MinIO, Redis containers).
- Customer imports a `.pryzm` they downloaded from PRYZM Cloud (per SPEC-26 §1).

### §7.2 Customer upgrades
- `pnpm pryzm upgrade --to=2.4.0` runs:
  - Schema migrations (Drizzle).
  - File-format migrations on stored projects.
  - Verifies post-migration with bench `apps/bench/self-host-smoke.ts`.

### §7.3 Customer rollbacks
- `pnpm pryzm rollback --to=2.3.0` is **best-effort** and only goes one minor version back.
- Forward-only is the default; rollbacks beyond one minor require restore from backup.

---

## §8 Rollback playbook (per kind)

| Failure | Recovery |
|---|---|
| Bad schema migration in production | PITR to before the migration; replay events since; re-deploy without the migration |
| Bad file-format migration | reload the prior `.pryzm` from R2 (versioned); reader-side migration disabled via flag |
| Bad event-payload migration | route events through a "freeze" handler; deploy fix; replay events |
| Bad codebase deletion | revert PR; re-enable `featureFlags.<zone>_v2=false` |
| Bad cutover | within 14-day window — toggle `SUPABASE_PRIMARY=false`; outside window — PITR + replay |

---

## §9 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | SPEC-27 land; `infra/db/migrations/` discipline lit; `02-decisions/contracts/` deletion plan ratified; service-role-key removal; `02-decisions/contracts/` archived. |
| S32–S37 | strangler-fig gates active across `src/commands/`. |
| S38–S42 | Supabase staging; backup verification. |
| S43 | production cutover; 14-day rollback window. |
| S45 | Replit PG production deleted; `project_command_log` deleted. |
| S55–S70 | per-zone deletions per §4.3. |
| S70 | self-host migration tooling published. |
| S72 (M36 GA) | all migrations green; rollback runbook tested in last DR drill. |

---

## §10 Cross-references
- ADR-002 sync; ADR-013 persistence ops; ADR-018 cut list (codebase deletion deferrals); ADR-021 enterprise (rollback windows).
- SPEC-02 persistence; SPEC-08 security; SPEC-15 deployment; SPEC-24 data store map; SPEC-26 file format.
- Phase docs: PHASE-2A §6 strangler-fig; PHASE-2D §3 cutover; PHASE-3B §4 OBC removal; PHASE-3D §6 self-host.
