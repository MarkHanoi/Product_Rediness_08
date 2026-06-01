# Phases Update Plan — 2026-04-27

> **Purpose**: This document instructs the implementation agents on every change required to bring the `phases/PHASE-*` documents into alignment with the canonical normative artefacts authored or amended after the original phase docs were written:
>
> - `specs/SPEC-01..SPEC-12` (the 12 specs).
> - `adrs/ADR-001..ADR-024` (the 22 strategic ADRs in `00_NEW_ARCHITECTURE/adrs/`).
> - `CRITICAL-REVIEW-2026-04-27.md` (the architect's gap review).
> - `CONFLICT-ANALYSIS.md` (resolved here).
> - `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §17 (the amended decision table).
>
> Conflict order (strict): **SPEC > ADR > MASTER PLAN (10) > CRITICAL-REVIEW > 05-IMPLEMENTATION-PLAN > phase docs**. Where a phase doc disagrees with a higher-precedence document, the phase doc loses.
>
> **Audience**: agents executing the edits. Each edit is specified with the file, the location (sprint, section, or `rg` pattern), and the action.
>
> **Out of scope** for this plan: editing SPECs, ADRs, CRITICAL-REVIEW, or the master plan. Those are the source of truth and are not modified here.

---

## §0 Reading conventions for this plan

- `[FILE]` is the path under `docs/00_NEW_ARCHITECTURE/phases/`.
- `[LOC]` is one of: a sprint id (`S07 D2`), a section heading, or a `rg` pattern that uniquely matches.
- `[ACTION]` is one of: `REPLACE`, `INSERT_AFTER`, `INSERT_BEFORE`, `DELETE`, `RENUMBER`, `ANNOTATE`.
- `[NEW]` is the exact replacement text or a precise description.
- A change marked **[BLOCKING]** must land before the sprint it references opens. Other changes may roll in continuously.
- A change marked **[GLOBAL]** applies to every phase document.

---

## §1 The single most important fix: ADR namespace reconciliation

### §1.1 What broke

The phase docs were written with a **sprint-scoped ADR numbering series** that overlaps the strategic ADR numbering series in `00_NEW_ARCHITECTURE/adrs/`. Examples:

| Phase doc ADR ref | Phase doc intent | Strategic ADR (same number) | Collision? |
|---|---|---|---|
| `ADR-001` (PHASE-1A) | Typed-ID brand strategy | ADR-001 (strategic) = Pascal-B adoption | ✗ different topic |
| `ADR-002` (PHASE-1A, PHASE-2) | Command handler signature / "ADR-002 spike" | ADR-002 (strategic) = CRDT bridge | ✗ partial overlap |
| `ADR-003` (PHASE-1A) | Scheduler API | ADR-003 (strategic) = R2 / MinIO storage | ✗ |
| `ADR-004` (PHASE-1A) | MessagePack codec | ADR-004 (strategic) = msgpackr wire format | ✓ **same topic, finer scope** |
| `ADR-005` (PHASE-1A) | `PrimitiveCommitter` interface | ADR-005 (strategic) = worker-pool policy | ✗ |
| `ADR-006` (PHASE-1A, PHASE-1) | Idle-continuation N-frame budget | ADR-006 (strategic) = WebGPU/WebGL2 render mode | ✗ |
| `ADR-007` (PHASE-1A) | WebGPU/WebGL2 dual-mode | ADR-007 (strategic) = OTel/Tempo telemetry | ✗ — and the topic actually maps to **strategic ADR-006** |
| `ADR-008` (PHASE-1B) | Wall-tool sub-mode triage | ADR-008 (strategic) = IFC scope | ✗ |
| `ADR-010` (PHASE-1, PHASE-1D) | Bake worker coalescing window | ADR-010 (strategic) = 250 ms bake debounce | ✓ **same decision** |
| `ADR-016` (PHASE-1D) | Coalescing window (mentioned mid-text) | ADR-016 (strategic) = drawing engine architecture | ✗ |
| `ADR-017` (PHASE-1D) | `.pryzm` ZIP format v1 | ADR-017 (strategic) = type catalog scope | ✗ |
| `ADR-023` (PHASE-2B) | Plan view renderer architecture | (no strategic counterpart) | n/a — topic now subsumed by SPEC-04 + strategic ADR-016 |
| `ADR-024` (PHASE-2B) | Section view cut algorithm | ADR-024 (strategic) = constraint solver | ✗ — see ADR-024 strategic, "Naming note" |
| `ADR-025` (PHASE-2B) | Multi-view sync strategy | (no strategic counterpart) | n/a |

### §1.2 The reconciliation rule (canonical)

Going forward there are **two ADR series** and they must never be conflated:

1. **Strategic ADR series** — `docs/00_NEW_ARCHITECTURE/adrs/ADR-NNN-<slug>.md`. Cross-cutting, customer-visible, lifetime-of-product decisions. The 22 ADRs ratified at 2026-04-27. Cited as `[ADR-NNN]` (no prefix) **only** in `00_NEW_ARCHITECTURE/` documents; cited as `[strategic ADR-NNN]` if any ambiguity could arise elsewhere.
2. **Sprint-scoped / code-level ADR series** — `docs/architecture/adr/NNNN-<slug>.md` (4-digit zero-padded number). Each is local to a sprint and a code change. These are the ADRs that the phase docs were originally calling `ADR-001..ADR-025` inline.

**Every existing phase-doc ADR reference must be renumbered to the sprint-scoped series and re-pathed.** The renumbering map is in §1.3 below.

> Where a phase-doc ADR is "the same decision" as a strategic ADR (currently only `ADR-004 codec` and `ADR-010 coalescing`), the phase doc cites the **strategic** ADR as the source-of-truth and the sprint-scoped ADR is **deleted from the planning narrative** (it never needed to exist as a separate decision).

### §1.3 Renumbering map

The agent applies this map across every phase document by exact text replacement. Old → new.

| Old (phase-doc) ref | New citation | Rationale |
|---|---|---|
| `ADR-001` (typed-ID brand strategy) | `code-level ADR docs/architecture/adr/0001-typed-id-brand.md` | Sprint-scoped; not a cross-cutting decision. |
| `ADR-002` (command handler signature) | `code-level ADR docs/architecture/adr/0002-command-handler-signature.md` | Sprint-scoped. **Distinct from** strategic ADR-002 (CRDT bridge). |
| `ADR-002 spike` (the CRDT pre-S01 spike) | `[strategic ADR-002] CRDT spike per SPEC-03 §3` | This **is** strategic ADR-002 — the CRDT-event-log bridge — and stays as `[strategic ADR-002]`. |
| `ADR-003` (scheduler API) | `code-level ADR docs/architecture/adr/0003-scheduler-priority-vs-tickpriority.md` | Sprint-scoped. |
| `ADR-004` (MessagePack codec) | `[strategic ADR-004]` | Same decision; the phase-doc spike output goes into the existing strategic ADR-004. **The sprint-scoped ADR-004 is deleted.** |
| `ADR-005` (`PrimitiveCommitter` interface) | `code-level ADR docs/architecture/adr/0005-primitive-committer-interface.md` | Sprint-scoped. |
| `ADR-006` (idle-continuation budget) | `code-level ADR docs/architecture/adr/0006-idle-continuation-budget.md` | Sprint-scoped. |
| `ADR-007` (WebGPU/WebGL2 dual-mode) | `[strategic ADR-006]` | Same decision; **delete the sprint-scoped ADR-007**. The dual-mode strategy and parity gate are owned by strategic ADR-006. |
| `ADR-008` (wall-tool sub-mode triage) | `code-level ADR docs/architecture/adr/0008-wall-tool-submodes.md` | Sprint-scoped. |
| `ADR-010` (bake worker coalescing window) | `[strategic ADR-010]` | Same decision (250 ms). **Delete the sprint-scoped ADR-010.** |
| `ADR-016` (PHASE-1D mid-text "coalescing window") | `[strategic ADR-010]` | This was a misnumbering inside PHASE-1D; the coalescing decision is strategic ADR-010. |
| `ADR-017` (`.pryzm` ZIP format v1) | `code-level ADR docs/architecture/adr/0017-pryzm-zip-format-v1.md` | Sprint-scoped. (Note: strategic ADR-017 = type catalog scope, unrelated.) |
| `ADR-023` (plan view renderer architecture) | `code-level ADR docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` | Sprint-scoped. **Cite strategic ADR-016 (drawing engine architecture) as parent.** Plan-view renderer is one back-end of the SPEC-04 vector primitive model. |
| `ADR-024` (section view cut algorithm) | `code-level ADR docs/architecture/adr/0024-section-cut-algorithm.md` | Sprint-scoped. **Note** strategic ADR-024 = constraint solver; strategic ADR-024's "Naming note" already documents this collision. |
| `ADR-025` (multi-view sync strategy) | `code-level ADR docs/architecture/adr/0025-multi-view-sync.md` | Sprint-scoped. |

After application, every `ADR-NNN` reference inside `phases/` is **either** a `[strategic ADR-NNN]` reference (with the `strategic` prefix) **or** a fully-qualified `code-level ADR docs/architecture/adr/NNNN-<slug>.md` reference. **Bare `ADR-NNN` is forbidden inside phase docs.**

### §1.4 New strategic ADRs to cite (add inline to phase docs where relevant)

The following strategic ADRs did not exist when the phase docs were written and **must be cited inline** at the sprint where they activate. Per-doc instructions are in §3.

| Strategic ADR | Cite at sprint | What it constrains |
|---|---|---|
| **ADR-001** (Pascal-B adoption) | PHASE-1A §1 framing | Confirms "patterns yes, fork no". |
| **ADR-003** (R2 + MinIO behind a driver) | PHASE-1D S21 (bake worker), S22 (sync server) | All R2 calls go through the storage driver, not the SDK. |
| **ADR-005** (worker-pool policy) | PHASE-1D S21 (bake worker), PHASE-1A S03 (browser pool) | Browser pool capped at 4; server BullMQ + worker_threads. |
| **ADR-007** (OTel + Tempo + Honeycomb) | PHASE-1A S01 (OTel SDK lands) | P8 CI gate at warning S04, error S08. |
| **ADR-008** (IFC scope) | PHASE-1A S02 (IFC plan reconfirmed); PHASE-3 S55–S58 | IFC4 read+write Pset round-trip; IFC4.3 advanced post-GA. |
| **ADR-009** (Web Worker plugin sandbox) | PHASE-1A S01 (sandbox 5-day spike); PHASE-3 S62 (SDK 1.0) | Sandbox model decided pre-S01. |
| **ADR-011** (project / view / element-class permissions) | PHASE-2 S43 (role/permission matrix live) | No per-instance ACL in v1. |
| **ADR-012** (docker-compose self-host) | PHASE-3 S67 (self-host packaging) | docker-compose for v1; no Helm. |
| **ADR-013** (persistence operational) | PHASE-1D S19 (chunked binary), S20 (`.pryzm` v1) | Chunk format + cache invalidation rules. |
| **ADR-014** (AI L7.5 operational) | PHASE-2 S47 (AI decomposition); PHASE-3 S50–S54 | AI scope and approval queue. |
| **ADR-015** (visibility-intent placement) | PHASE-2 S46 (waves 1–5); PHASE-3 S49 (waves 6–11) | Where Visibility-Intent rules live. |
| **ADR-016** (drawing engine architecture) | PHASE-2A S30 (edge projection / poche); PHASE-2B S31 (plan view rebuild) | Vector primitives → 3 back-ends. **[BLOCKING]** for S29. |
| **ADR-017** (type catalog scope) | PHASE-1C S11 (first per-family type lands) | SPEC-05 supersedes legacy Contract 17. **[BLOCKING]** for S11. |
| **ADR-018** (capacity cut list) | PHASE-1 §6 (M12 gate); PHASE-2 §6 (M24 gate); PHASE-3 §6 (M36 gate) | The standing menu of cuts at slip thresholds. |
| **ADR-019** (soft-lock semantics) | PHASE-2 S45 (soft locks) | TTL, mid-edit lock loss, AI-batch semantics. **[BLOCKING]** for S48. |
| **ADR-020** (kernel robustness) | PHASE-1B S07 (wall producer) | Robustness budget + property-test PR-merge gate. **[BLOCKING]** for S07. |
| **ADR-021** (enterprise security & residency) | PHASE-2 S43 (RLS); PHASE-3 S55 (SAML/OIDC), S58 (SCIM), S64 (audit streaming), S70 (multi-region) | C3 sales gate. **[BLOCKING]** before S40. |
| **ADR-024** (constraint solver) | PHASE-2A (no solver, light expressions only); PHASE-3 S49–S54 (full solver in Component Editor) | planegcs MIT; Phase 3A only. **[BLOCKING]** for S49. |

---

## §2 Global edits — apply to every phase document

These edits are uniform across `PHASE-1-FOUNDATION`, `PHASE-1A`, `PHASE-1B`, `PHASE-1C`, `PHASE-1D`, `PHASE-2-MIGRATION`, `PHASE-2A`, `PHASE-2B`, `PHASE-2C`, `PHASE-3-COMPLETION`.

### G1 — Preamble (insert at top of every phase doc, immediately after the H1 title)

[ACTION] `INSERT_AFTER` the H1 title.

[NEW]
```markdown
> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/00_NEW_ARCHITECTURE/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/00_NEW_ARCHITECTURE/adrs/` (ADR-001..ADR-024 of the strategic series).
> 3. `docs/00_NEW_ARCHITECTURE/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/00_NEW_ARCHITECTURE/10-MASTER-IMPLEMENTATION-PLAN-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. Bare `ADR-NNN` references inside this phase document refer to the **sprint-scoped / code-level** ADR series at `docs/architecture/adr/NNNN-*.md` after the renumbering applied 2026-04-27 (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md` §1). References to the **strategic** ADR series are written explicitly as `[strategic ADR-NNN]`.
```

### G2 — Apply the renumbering map (§1.3)

[ACTION] For each row in §1.3, run the exact replacements across the file. The replacements are non-destructive (they add citations and disambiguation) — they do not change scope decisions except where the phase doc disagreed with the strategic ADR (only `coalescing window` was wrong: it must say 250 ms, never 500 ms).

Specific multi-replace check:

| `rg` pattern | Replacement | Notes |
|---|---|---|
| `ADR-002 spike` | `[strategic ADR-002] CRDT spike (per SPEC-03 §3)` | Disambiguates the CRDT spike from the sprint-scoped command-handler ADR. |
| `ADR-007 (WebGPU/WebGL2 dual-mode)` | `[strategic ADR-006] (WebGPU/WebGL2 dual-mode)` | Strategic ADR-006 = render mode. |
| `ADR-007 fallback path` | `[strategic ADR-006] fallback path` | Same. |
| `ADR-007 mandates two CI matrices` | `[strategic ADR-006] mandates two CI matrices (per SPEC-04 visual-diff parity gate)` | Strategic ADR-006 + SPEC-04 jointly. |
| `ADR-010 coalescing window` | `[strategic ADR-010] (250 ms bake debounce)` | Strategic ADR-010 is the coalescing decision; force 250 ms (not 500 ms). |
| `coalescing window = 500 ms` | `coalescing window = 250 ms ([strategic ADR-010])` | Several phase docs still cite 500 ms. Hard fix. |
| `ADR-016 draft (coalescing window)` | `[strategic ADR-010] (250 ms bake debounce)` | PHASE-1D mid-text misnumbering. |
| `ADR-017 — `.pryzm` v1 format` | `code-level ADR docs/architecture/adr/0017-pryzm-zip-format-v1.md (`.pryzm` v1 format)` | Sprint-scoped. |
| `ADR-009 (plugin sandbox)` | `[strategic ADR-009] (Web Worker plugin sandbox)` | Same decision. |

### G3 — Cut-list reference (insert into every phase doc's risk register)

[ACTION] In each phase doc's risk register section (§6 in PHASE-1, PHASE-2, PHASE-3), `INSERT_BEFORE` the first risk row:

[NEW]
```markdown
> **Velocity-slip cut list.** Every M-gate in this phase is governed by `[strategic ADR-018]` — the standing capacity cut list. The phase-specific risks below are *additional* to the cuts already enumerated in ADR-018 §Tier-1, §Tier-2, §Tier-3. If actual velocity at the gate is amber/red, cuts are applied in order from ADR-018 before phase-specific mitigations.
```

### G4 — SPEC pointer table (insert at the end of each phase doc, before the "closing thought" if any)

[ACTION] `INSERT_BEFORE` the last `## §` heading of each phase doc.

[NEW]
```markdown
## §X SPECs in force during this phase

| SPEC | Section relevant here | Sprints that exercise it |
|---|---|---|
| (filled in per phase — see PHASES-UPDATE-PLAN §3) | | |

This table is the canonical answer to "what spec covers this sprint?" If a sprint's exit criterion conflicts with the cited spec section, the spec wins.
```

§3 below populates this table per phase doc.

### G5 — Forbid bare `ADR-NNN` going forward

[ACTION] Add to every phase doc's reading conventions section (§0 if present, else create it after the preamble inserted in G1):

[NEW]
```markdown
- **ADR citations**: Bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `00_NEW_ARCHITECTURE/adrs/`, or fully-qualified `code-level ADR docs/architecture/adr/NNNN-<slug>.md` for sprint-scoped decisions.
```

---

## §3 Per-document update plans

Each subsection lists every required edit for one phase document. Edits not listed in §3 but covered by the global rules in §2 also apply.

---

### §3.1 `PHASE-1-FOUNDATION-M1-M12.md` (728 lines)

**Phase 1 SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 (geometry kernel) | §3 robustness budget; §6 determinism | S07–S22 |
| SPEC-02 (persistence) | §1–§3 event log + chunks; §5 bake debounce | S04, S19, S20, S21, S23 |
| SPEC-03 (sync CRDT) | §3 CRDT introduction (deferred to Phase 2D) | (referenced only) |
| SPEC-04 (drawing engine) | §1 architecture (deferred to Phase 2A) | (referenced only) |
| SPEC-05 (type catalog) | §1 family taxonomy; §2 type/instance | S07, S11–S18 |
| SPEC-09 (plugin SDK) | §3 sandbox spike pre-S01 | S01 |
| SPEC-10 (observability) | All | S01 onwards |

#### Sprint-by-sprint edits

**§1.1 (line 13–25, "What Phase 1 must deliver"):**

- [ACTION] `INSERT_AFTER` the L7.5 line:
  ```markdown
  - **Robustness budget — `[strategic ADR-020]`** (geometry-kernel robustness budget) gates S07 onward. The wall miter property test (`packages/geometry-kernel/__tests__/robustness/wall-join.spec.ts`) must pass at PR-merge from S08 onward.
  - **Type catalog — `[strategic ADR-017]`**: by S11 the `Wall` family schema must be complete in `packages/types-schema/`. The legacy 271-line Contract-17 is **DEPRECATED**.
  ```

**§1.2 (line 27–44, "What Phase 1 deliberately does NOT do"):**

- [ACTION] `INSERT` at the top of the deferred table:
  ```markdown
  | Constraint solver (loadable family parametric authoring) | Phase 3A — `[strategic ADR-024]` |
  | Per-element ACLs (per-instance permissions) | Out of v1 — `[strategic ADR-011]` |
  | Helm / single-binary self-host | Post-GA — `[strategic ADR-012]` |
  ```

**Line 462 ("TRAA jitter under idle-continuation"):**

- [ACTION] `REPLACE` `chosen in ADR-006 spike` with `chosen in code-level ADR docs/architecture/adr/0006-idle-continuation-budget.md`. (Distinct from strategic ADR-006 which is render mode.)

**Line 557 ("ADR-010 coalescing window (250 ms) implemented"):**

- [ACTION] `REPLACE` with `[strategic ADR-010] (250 ms bake debounce) implemented per SPEC-02 §5`. ✓ Already at 250 ms — no value change.

**Line 560 ("ADR-010 pricing audit"):**

- [ACTION] `REPLACE` `ADR-010 pricing audit` with `[strategic ADR-010] §pricing-audit (per SPEC-02 §5.3)`.

**Line 629 (R1-03 row):**

- [ACTION] `REPLACE` `Coalescing window in ADR-010` with `Coalescing window in [strategic ADR-010]`.

**Line 631 (R1-05 row):**

- [ACTION] `REPLACE` `idle-continuation budget chosen in ADR-006` with `idle-continuation budget chosen in code-level ADR docs/architecture/adr/0006-idle-continuation-budget.md`.

**§8 M12 alpha gate exit criteria (line 652+):**

- [ACTION] `INSERT` under "Architectural" subsection:
  ```markdown
  - `[strategic ADR-018]` cut-list reviewed at the M12 gate; if amber/red, Tier-1 cuts applied before declaring M12 green.
  - `[strategic ADR-020]` property-test suite green across the 12 element families (wall, slab, roof, column, beam, door, window, stair, railing, curtain wall + the 2 added in Phase 1C).
  - `[strategic ADR-007]` (OTel + Tempo + Honeycomb) — Tempo prod instance live in EU-W and US-E.
  ```

---

### §3.2 `PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` (756 lines)

**Phase 1A SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §6 determinism | S04 onward |
| SPEC-02 | §1–§2 event log | S04 |
| SPEC-09 | §3 sandbox spike pre-S01 | S01 |
| SPEC-10 | All | S01 onward |

#### Edits

**§ "ADR drafts" table (lines 177–183):**

- [ACTION] `REPLACE` the entire ADR-drafts table with:
  ```markdown
  | Decision | Drafted at | Owner | New series |
  |---|---|---|---|
  | Typed-ID brand strategy | S01 D3 | F (drafted by A) | code-level `0001-typed-id-brand.md` |
  | Command handler signature | S02 D1 | F (drafted by A) | code-level `0002-command-handler-signature.md` |
  | Scheduler API (`priority` queue-class vs `TickPriority` render-phase) | S03 D1 | F (drafted by B, A reviews) | code-level `0003-scheduler-priority-vs-tickpriority.md` |
  | MessagePack codec | S04 D2 | F (drafted by A) | **`[strategic ADR-004]` ratifies** — phase-doc ADR-004 deleted; bench numbers attached to the strategic ADR's "Phase rollout S04". |
  | `PrimitiveCommitter` interface | S05 D2 | F (drafted by B, A reviews) | code-level `0005-primitive-committer-interface.md` |
  | Idle-continuation N-frame budget | S03 D3 | F (drafted by B) | code-level `0006-idle-continuation-budget.md` |
  | WebGPU/WebGL2 dual-mode | S06 D1 | F (drafted by B) | **`[strategic ADR-006]` ratifies** — phase-doc ADR-007 deleted; CI matrix wiring documented in the strategic ADR's "Phase rollout S04/S08". |
  | Plugin sandbox model | **S01 D1–D5 spike** | F (drafted by A+B) | **`[strategic ADR-009]` ratifies** — 5-day spike output linked from ADR-009. |
  ```

**S01 [ACTION] `INSERT` a new task:**

- After the existing S01 task list, `INSERT`:
  ```markdown
  - **S01-T0 — Plugin sandbox spike (D1–D5, F + A + B paired)**: 5-day measurement of postMessage RPC cost on the target plugin shapes (per `[strategic ADR-009]` Phase rollout S01). Output: 1-page report linked from `00_NEW_ARCHITECTURE/adrs/ADR-009-plugin-sandbox.md`.
  - **S01-T1 — OTel SDK wrapper lands (D2–D8, Agent A)**: `packages/otel/` per `[strategic ADR-007]`. First spans emitted from `packages/wire/`. Honeycomb dev account wired in S02.
  ```

**S03 lint rule (line 366):**

- [ACTION] `INSERT_AFTER` the existing `IdleContinuation` description:
  ```markdown
  - **Browser worker pool capped at 4** per `[strategic ADR-005]`. The frame scheduler must refuse to spawn a 5th. Document the cap in `packages/frame-scheduler/README.md`.
  ```

**S06 (lines 574+):**

- [ACTION] `REPLACE` "ADR-007 fallback path" with "`[strategic ADR-006]` fallback path".
- [ACTION] `INSERT_AFTER` S06-T1:
  ```markdown
  - **S06-T2 — Visual-diff CI gate at warning level (D7, Agent B)**: per `[strategic ADR-006]` Phase rollout S08. The 24-scene corpus is **not** required at S06; warning-level on a 4-scene smoke set is.
  ```

**Line 626 (the WebGPU-Linux risk row):**

- [ACTION] `REPLACE` `ADR-007 mandates two CI matrices` with `[strategic ADR-006] mandates two CI matrices (per SPEC-04 visual-diff parity gate)`.

**Line 726 (K1A-3 kill switch):**

- [ACTION] `REPLACE` `ADR-007 is amended to make WebGL2 the default` with `[strategic ADR-006] is *not* amended (the dual-path is canonical); instead, the WebGPU CI matrix is moved to allowed-flake while the underlying issue is investigated. Per ADR-006 §Phase-rollout, the dual-path stays through GA.`

**§ "ADRs drafted/merged" final summary table (lines 659–665):**

- [ACTION] `REPLACE` the table entirely with the renumbered version per §1.3 above.

---

### §3.3 `PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` (1,976 lines)

**Phase 1B SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §3 robustness budget; §6 determinism | S07 onward |
| SPEC-02 | §1–§2 event log + chunks | S07 onward |
| SPEC-05 | §1 family taxonomy; §2 type/instance | S07 onward |
| SPEC-10 | All | S07 onward |

#### Edits

**§ §1.3 "wall-touching command surfaces" (line 93+):**

- [ACTION] `REPLACE` `(ADR-008 detail)` with `(code-level ADR docs/architecture/adr/0008-wall-tool-submodes.md)`.
- [ACTION] `INSERT_AFTER` the §1.3 introduction:
  ```markdown
  > **Type catalog dependency.** Wall types (`Wall.standard`, `Wall.shear`, `Wall.elemented`, `Wall.partitioning`) are declared in `packages/types-builtin/wall/` per SPEC-05 §7.1. Walls in S07–S12 must reference a type id; instance-only walls are forbidden. Per `[strategic ADR-017]` Phase rollout S11, the type-completeness lint becomes PR-blocking from S11 — but Phase 1B walls already comply by writing types into `packages/types-builtin/`.
  ```

**Line 53 (the `errors.ts` row):**

- [ACTION] `REPLACE` `mandatory in PRYZM 2 per ADR-002` with `mandatory in PRYZM 2 per code-level ADR docs/architecture/adr/0002-command-handler-signature.md`.

**Line 89 (the `WallTool.ts` row):**

- [ACTION] `REPLACE` `per ADR-008's wall-tool sub-mode triage` with `per code-level ADR docs/architecture/adr/0008-wall-tool-submodes.md`.

**S07 (the wall producer sprint):**

- [ACTION] `INSERT` a new task:
  ```markdown
  - **S07-T0 — Robustness property-test suite scaffold (D2, Agent A)** — `packages/geometry-kernel/__tests__/robustness/` lands per `[strategic ADR-020]` Phase rollout S07. The `wall-join.spec.ts` property test (two walls at angle θ ∈ [1°, 179°] with thickness t ∈ [50 mm, 600 mm]; assert miter joint manifold + area within 1% of analytic) MUST pass before S07 close. From S08, the suite is a PR-merge gate.
  ```

- [ACTION] `INSERT` to the S07 exit criteria:
  ```markdown
  - [ ] `wall-join.spec.ts` property test green; PR gate enabled in S08.
  - [ ] `Wall` family schema in `packages/types-schema/wall.ts` complete (per SPEC-05 §1.2).
  - [ ] At least 4 wall types declared in `packages/types-builtin/wall/` (per SPEC-05 §7.1 — `standard`, `shear`, `elemented`, `partitioning`).
  ```

**S08 (pure wall producer):**

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] `manifold-3d` pinned to exact SHA in `package.json` per `[strategic ADR-020]`.
  - [ ] `kernel.error` OTel span emitted on every `Result.err` per `[strategic ADR-020]` §OpenTelemetry.
  ```

**S11 (Roof + Door + Window):**

- [ACTION] `INSERT` to the goal description:
  ```markdown
  > **Type-catalog gate (`[strategic ADR-017]`)**: by S11 close, `packages/types-builtin/{door,window,roof}/` MUST contain at least the v1 starter types per SPEC-05 §7.3 (8 doors, 8 windows, 4 roofs). The type-completeness lint (`tools/lint-type-completeness.ts`) is PR-blocking from this sprint.
  ```

**S12 (Slab + Curtain Wall + Grid + Column + Beam):**

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] Layer composition implemented for slab/floor types per SPEC-05 §3 (`layers[]`, `isCore`, `wraps`).
  - [ ] Material library (`packages/material-library/`) reachable from all layer-bearing types per SPEC-05 §4.
  ```

---

### §3.4 `PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` (1,455 lines)

**Phase 1C SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §3 robustness; §6 determinism | All |
| SPEC-05 | §1–§4 type catalog and material library | All |
| SPEC-10 | All | All |

#### Edits

**Top-level scope clarification (after the existing §1):**

- [ACTION] `INSERT_AFTER` §1:
  ```markdown
  ### §1.x Type catalog hardening (`[strategic ADR-017]`)

  Phase 1C is the sprint block where SPEC-05 lands in earnest. By S18 close:

  - All system families (Wall, Floor, Roof, Ceiling, Stair, Railing, Curtain Wall, Curtain Grid) have full schemas in `packages/types-schema/`.
  - Built-in catalog populated to the M36 ship-with-product list per SPEC-05 §7 minus loadable families (which are Phase 3A): 12 walls, 8 floors/roofs, 4 stairs, 2 railings, 1 curtain wall sample, 40 materials.
  - The type-completeness lint (`tools/lint-type-completeness.ts`) is PR-blocking from S11.
  - "Reset to type" semantics implemented in the property panel (per SPEC-05 §2.4).
  ```

**For each element-family sprint (S13, S14, S15, S16, S17, S18) — INSERT to exit criteria:**

[ACTION] `INSERT` per sprint:
  ```markdown
  - [ ] Family schema complete in `packages/types-schema/<family>.ts` (per SPEC-05 §1.2).
  - [ ] Built-in types declared in `packages/types-builtin/<family>/` (count per SPEC-05 §7).
  - [ ] Property-test for the family in `packages/geometry-kernel/__tests__/robustness/<family>.spec.ts` green (per `[strategic ADR-020]`).
  - [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`).
  ```

**S15 (Renderer hardening — TRAA, SSGI):**

- [ACTION] `REPLACE` any reference to `ADR-006 spike` with `code-level ADR docs/architecture/adr/0006-idle-continuation-budget.md`.

---

### §3.5 `PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` (1,670 lines)

**Phase 1D SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-02 | §1–§3 chunk format; §5 bake debounce | S19, S20, S21, S23 |
| SPEC-10 | All | All |
| SPEC-09 | §3 sandbox (only as-of-S22 baseline) | S22 |

#### Edits

**S19 (chunked binary persistence):**

- [ACTION] `INSERT` at the top of the sprint description:
  ```markdown
  > **Storage abstraction (`[strategic ADR-003]`)**: every R2 call MUST go through `packages/storage-driver/` (with R2 and MinIO drivers behind the same interface). No direct `@aws-sdk/client-s3` import outside the driver. Lint: `tools/lint-storage-driver-isolation.ts` (PR-blocking).
  ```

**S20 (`.pryzm` ZIP format v1):**

- [ACTION] `REPLACE` every `ADR-017` in this sprint with `code-level ADR docs/architecture/adr/0017-pryzm-zip-format-v1.md` (ZIP-format ADR; sprint-scoped). Cite SPEC-02 §6 (file-format addendum) as the strategic anchor.

- Specific text fixes inside S20:
  - Line ~381 ("**ADR-017** defines the `.pryzm` v1 format"): `REPLACE` `**ADR-017**` with `**Code-level ADR `0017-pryzm-zip-format-v1.md`**`.
  - Line ~387 ("ADR-017 ZIP Layout"): same.
  - Line ~535–546 (`ADR-017 draft` paragraphs): same renumbering.
  - Line ~565 ("ADR-017 merged"): `REPLACE` with "Code-level `0017-pryzm-zip-format-v1.md` merged".

**S21 (bake worker server-side v0):**

- [ACTION] `REPLACE` every `ADR-016` (bake worker coalescing) reference with `[strategic ADR-010]` (250 ms bake debounce). Specific lines:
  - Line ~545 ("ADR-016 draft (coalescing window)"): `REPLACE` with `[strategic ADR-010] (250 ms bake debounce per SPEC-02 §5)`.
  - Line ~549 ("ADR-016 finalised draft — coalescing window = 250 ms"): `REPLACE` with `[strategic ADR-010] (250 ms bake debounce — already canonical at the strategic ADR; the sprint output is the implementation log)`.
  - Line ~554 ("ADR-016 walkthrough"): `REPLACE` with `[strategic ADR-010] walkthrough`.
  - Line ~582 ("the 250 ms coalescing window (ADR-016)"): `REPLACE` with `the 250 ms coalescing window ([strategic ADR-010])`.
  - Line ~795 ("B presents ADR-016 draft"): `REPLACE` with `B presents the implementation report against [strategic ADR-010]`.
  - Line ~826 ("ADR-016 merged"): `REPLACE` with `[strategic ADR-010] implementation log linked from the ADR appendix; no separate phase-doc ADR is created`.

- [ACTION] `INSERT` to the S21 sprint description:
  ```markdown
  > **Worker pool topology (`[strategic ADR-005]`)**: server-side bake worker uses BullMQ + `worker_threads` pool sized at `os.cpus().length - 1`. The pool sizing is canonical; per-job concurrency is a queue-level concern.
  > **Storage driver (`[strategic ADR-003]`)**: bake worker writes chunks via the storage driver. R2 in PRYZM-hosted; MinIO in self-host. The driver is the only abstraction the bake worker sees.
  ```

- [ACTION] `INSERT` to the S21 exit criteria:
  ```markdown
  - [ ] `[strategic ADR-005]` worker_threads pool sizing verified.
  - [ ] `[strategic ADR-003]` storage driver isolation lint green.
  - [ ] Per-event bake cost telemetry stream live (`bake.event.cost`); used to validate ADR-018 cut-list pricing assumptions.
  ```

**S22 (sync server skeleton):**

- [ACTION] `INSERT`:
  ```markdown
  > **Note on CRDT.** S22 ships the sync server *skeleton* (single-tab event durability) only. The full Yjs CRDT bridge (`[strategic ADR-002]`) lands in Phase 2D (S43). S22's wire-format is JSON; MessagePack (`[strategic ADR-004]`) is the wire format from S04 already, and the sync server adopts it for the event-log channel by S22 close.
  ```

---

### §3.6 `PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` (621 lines)

**Phase 2 SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §3 robustness; §4 constraint solver (light expressions only — see SPEC-01 §4.1 Phase 2A) | S25–S30 |
| SPEC-03 | §3 CRDT bridge; §4 soft locks | S43–S48 |
| SPEC-04 | §1 architecture; §2 vector primitives | S29–S36 |
| SPEC-05 | §1–§4 (rooms/spaces add at S25) | S25 |
| SPEC-06 | All (sheets, schedules) | S37–S42 |
| SPEC-07 | §3 AI L7.5 decomposition | S47–S48 |
| SPEC-08 | §3 permissions matrix; §4 RLS | S43, S46 |
| SPEC-10 | All | All |

#### Edits

**§1.2 ("What Phase 2 must deliver"):**

- [ACTION] `INSERT_AFTER` the existing list:
  ```markdown
  - **Drawing engine architecture lands (`[strategic ADR-016]`)** — vector primitives in `packages/drawing-primitives/` with Canvas2D backend (S29), SVG and PDF backends following (S31, S33). This is the single source of truth for plan/section/sheet output. **[BLOCKING]** for Phase 2B.
  - **Soft-lock semantics (`[strategic ADR-019]`)** — per-element TTL with role-aware lifetimes; mid-edit lock loss UX defined. **[BLOCKING]** for S48.
  - **Permission matrix (`[strategic ADR-011]`)** — role/view/element-class enforcement at L2 + L3 + edge + UI. **[BLOCKING]** for S43.
  ```

**§1.3 ("What Phase 2 deliberately does NOT do"):**

- [ACTION] `INSERT` to the table:
  ```markdown
  | Constraint solver (full 2D) | Phase 3A — `[strategic ADR-024]` |
  | SAML/OIDC SSO | Phase 3B — S55 (`[strategic ADR-021]`) |
  | SCIM 2.0 | Phase 3B — S58 |
  | Audit-log streaming to SIEM | Phase 3D — S64 |
  | Multi-region pinning (EU-W + US-E) | Phase 3D — S70 |
  ```

**§1.5 / line 70 ("ADR-002 spike pre-Sprint S01"):**

- [ACTION] `REPLACE` `ADR-002 spike pre-Sprint S01 was this risk's first mitigation` with `[strategic ADR-002] (CRDT + event log bridge) was the framing decision; the Yjs spike pre-S01 was its first mitigation`.

**Line 407 ("ADR-002 spike artifacts"):**

- [ACTION] `REPLACE` with `[strategic ADR-002] spike artifacts (CRDT + event log bridge per SPEC-03 §3)`.

**Line 532 (R2-02 mitigation):**

- [ACTION] `REPLACE` `ADR-002 spike pre-S01` with `[strategic ADR-002] CRDT spike pre-S01 (per SPEC-03 §3 + §6)`.

---

### §3.7 `PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` (1,059 lines)

**Phase 2A SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §3 robustness; §4.1 light parametric expressions (no solver) | S25–S30 |
| SPEC-04 | §1 architecture; §2 vector primitives (foundations) | S30 |
| SPEC-05 | §1, §6 level association; rooms/spaces | S25 |
| SPEC-10 | All | All |

#### Edits

**§ Executive Summary:**

- [ACTION] `INSERT_AFTER` the existing summary:
  ```markdown
  > **Two new strategic gates land in 2A:**
  > 1. **Drawing engine foundation (`[strategic ADR-016]`)** — `packages/drawing-primitives/` lands at S30, ahead of Phase 2B. The `edge-projection.ts` and `poche.ts` modules referenced in 2A's track-A allocation are now subordinate to the SPEC-04 vector primitive model. Edge projection is **classifier** (Cut/Beyond/Hidden/Symbolic), not a primitive emitter; the primitive emission lives in `packages/drawing-primitives/`.
  > 2. **Light parametric expressions (`[strategic ADR-024]` §Phase-2A)** — the small expression evaluator (`length = a + b`, `angle = 90°`) lands at S25 onward as a SPEC-01 §4.1 deliverable. **No constraint solver** is introduced in 2A; the solver is Phase 3A.
  ```

**§1 Track A allocation table (room boundaries, structural, lighting, plumbing, furniture, dimensions, edge-projection, poche):**

- [ACTION] `INSERT_BEFORE` the table:
  ```markdown
  > **Family count revision (per `[strategic ADR-017]` and SPEC-05 §1.2):** Phase 2A's "six new families" (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions) are reaffirmed, but their *types* must conform to SPEC-05's family/type/instance hierarchy from S25 onward. Loadable-family authoring (the Component Editor) is Phase 3A and depends on `[strategic ADR-024]` (constraint solver).
  ```

**S25 (Rooms):**

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] `Room` / `Space` family schemas in `packages/types-schema/space.ts` per SPEC-05 §1.2.
  - [ ] Room types map to `IfcSpace` per SPEC-05 §5 + `[strategic ADR-008]`.
  - [ ] Light expression evaluator (`packages/expr-eval/`) lands per SPEC-01 §4.1; supports `length = a + b`, `angle = 90°`. **No constraint solver.**
  ```

**S29 (Dimensions + first plan-view foundation):**

- [ACTION] `INSERT` at the top:
  ```markdown
  > **Plan-view substrate (`[strategic ADR-016]`)** — S29 must produce the first `Primitive[]` stream from the kernel through `packages/drawing-primitives/` to a Canvas2D back-end. The `(ViewDef, sceneRevision) → Primitive[]` purity contract per SPEC-04 §6 begins here. Visual-diff harness extension required.
  ```

**S30 (edge projection + poche):**

- [ACTION] `INSERT` at the top:
  ```markdown
  > **Edge projection placement (`[strategic ADR-016]`)** — `packages/geometry-kernel/edge-projection/` is the **classifier** producing `ClassifiedPrimitive[]`. Primitive emission lives downstream in `packages/drawing-primitives/`. The "pure-and-headless-tested" requirement per the original sprint goal is preserved.
  > **WebGPU compute path (`[strategic ADR-006]`)** — projection has a WebGPU compute-shader fast path with a CPU fallback; both paths must produce byte-identical output. CPU fallback is the Node target; the WebGPU path is browser-only.
  ```

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] Visual-diff CI gate covers the `edge-projection` output for 12 reference scenes (warning-level at S30; error-level at S36 per [strategic ADR-006] Phase rollout).
  - [ ] Hatch alignment in poche fill follows the *element's local coordinate system*, never the view origin (per SPEC-04 §2.3).
  ```

---

### §3.8 `PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` (1,078 lines)

**Phase 2B SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §3, §6 | All |
| SPEC-04 | All | S31–S36 |
| SPEC-10 | All | All |

#### Edits

**§ ADR drafts table (lines 77–79):**

- [ACTION] `REPLACE` the entire table with:
  ```markdown
  | Decision | Drafted at | New series |
  |---|---|---|
  | Plan-view renderer architecture (Canvas2D, dirty flags, no THREE) | S31 D1 | code-level `0023-plan-view-canvas2d-renderer.md` — **subordinate to `[strategic ADR-016]`**. |
  | Section-view cut algorithm | S35 D1 | code-level `0024-section-cut-algorithm.md`. **Note**: `[strategic ADR-024]` is the *constraint solver*; the section-cut decision is the sprint-scoped 0024 file in `docs/architecture/adr/`. |
  | Multi-view sync strategy | S36 D1 | code-level `0025-multi-view-sync.md`. |
  ```

**S31 (line 328) "F finalises ADR-023":**

- [ACTION] `REPLACE` with `F finalises code-level `0023-plan-view-canvas2d-renderer.md` — "Plan view renderer: Canvas2D back-end of the SPEC-04 vector primitive model per [strategic ADR-016] (drawing engine architecture)…"`. The existing description body (Canvas2D, dirty-flag, world XZ → canvas xy) is preserved.

- [ACTION] `INSERT` to the S31 sprint description:
  ```markdown
  > **Architectural anchor (`[strategic ADR-016]`)**: the plan-view renderer is one of three back-ends of the SPEC-04 vector primitive model. The other two (SVG, PDF) ship in S31 (SVG) and S33 (PDF). This sprint's deliverable is *only* the Canvas2D back-end; the SVG/PDF back-ends consume the same `Primitive[]` stream produced upstream. Per the parity contract, all three back-ends MUST agree pixel-for-pixel where it matters and dimensionally exact where it matters more (per SPEC-04 §1).
  ```

**S35 (line 832) "ADR-024 defines the section cut algorithm":**

- [ACTION] `REPLACE` `ADR-024 defines the section cut algorithm` with `Code-level ADR `0024-section-cut-algorithm.md` defines the section cut algorithm`.
- [ACTION] `INSERT_AFTER` the section description:
  ```markdown
  > **Naming clarification.** `[strategic ADR-024]` is the *constraint solver* (`docs/00_NEW_ARCHITECTURE/adrs/ADR-024-constraint-solver.md`). The section-cut decision documented in this sprint is the sprint-scoped `docs/architecture/adr/0024-section-cut-algorithm.md`. Both files exist; the strategic ADR-024's "Naming note" already documents the historical collision.
  ```

**S36 (line 1022) "ADR-025 multi-view sync":**

- [ACTION] `REPLACE` with `Code-level ADR `0025-multi-view-sync.md`: ViewSync subscribes all views to all element stores; FrameScheduler.requestFrame is the propagation mechanism…` (preserve the body).

**Line 1056 (R2B-03 mitigation):**

- [ACTION] `REPLACE` `ADR-024 defines fallback` with `Code-level `0024-section-cut-algorithm.md` defines fallback`.

**Final ADR summary table (lines 1020–1022):**

- [ACTION] `REPLACE` with the renumbered map per the §3.3.7 instructions above.

---

### §3.9 `PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` (1,093 lines)

**Phase 2C SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-04 | §1 architecture; SVG and PDF back-ends | All |
| SPEC-06 | All (sheets, schedules) | All |
| SPEC-10 | All | All |

#### Edits

**§ Phase preamble:**

- [ACTION] `INSERT_AFTER` the existing preamble:
  ```markdown
  > **Drawing engine subordination (`[strategic ADR-016]`)**: every sheet, schedule, and PDF export in Phase 2C reads `Primitive[]` from `packages/drawing-primitives/`. The PDF back-end (`packages/drawing-pdf/`) lands at S40 — built on `pdf-lib` for in-browser; on `node-canvas`-backed `pdf-lib` for server-side. The SVG back-end (`packages/drawing-svg/`) lands at S40 alongside the PDF back-end (originally Phase 2B but ratified for 2C scheduling). Server-side PDF is mandatory; in-browser PDF is **Tier-1 cuttable** per `[strategic ADR-018]` T1.5.
  ```

**S40 (PDF export):**

- [ACTION] `INSERT`:
  ```markdown
  > **In-browser PDF cut policy.** Per `[strategic ADR-018]` T1.5, in-browser PDF is the first deferable item if M24 velocity is amber. Server-side PDF is the floor and is non-cuttable. The S40 sprint plans for **both**; if the M24 velocity report at S48 marks amber, the in-browser back-end is held in `feature/in-browser-pdf` and not shipped to GA.
  ```

**S41 / S42 (schedules):**

- [ACTION] `INSERT` to the exit criteria of S41:
  ```markdown
  - [ ] Schedule formula library covers the SPEC-06 §3 fixed-formula set. **No DSL evaluator** in v1 per `[strategic ADR-018]` T1.3.
  ```

---

### §3.10 `PHASE-3-COMPLETION-GA-M25-M36.md` (660 lines)

**Phase 3 SPECs in force (for G4):**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 | §4 constraint solver (full) | S49–S54 |
| SPEC-03 | §4 soft locks (full TTL) | S49+ |
| SPEC-04 | All (full back-end set) | S55–S60 |
| SPEC-07 | All (AI L7.5) | S49–S54 |
| SPEC-08 | All (Enterprise) | S55, S58, S64, S70 |
| SPEC-09 | All (plugin SDK 1.0) | S62–S64 |
| SPEC-11 | All (IFC) | S55–S58 |
| SPEC-12 | All (self-host operations) | S67 |

#### Edits

**§1.2 ("What Phase 3 must deliver"):**

- [ACTION] `REPLACE` the bullet "Self-host packaging — `docker-compose up`…" with:
  ```markdown
  - **Self-host packaging (`[strategic ADR-012]`)** — `docker-compose up -d` deploys editor + sync-server + bake-worker + ai-worker + Postgres + Redis + MinIO + Caddy + observability stack on a fresh Linux VM in < 10 minutes. Helm chart and single-binary are post-GA.
  ```

- [ACTION] `INSERT_AFTER` the "Self-host packaging" bullet:
  ```markdown
  - **Enterprise security & residency (`[strategic ADR-021]`)** — SAML 2.0 + OIDC SSO (S55), SCIM 2.0 provisioning (S58), TOTP MFA (mandatory for Enterprise admin), audit-log streaming to webhook/SIEM (S64), per-tenant region pinning across EU-W and US-E (S70). WebAuthn/passkeys deferred to v2 (Tier-1 cut). AP-Southeast deferred to Phase 4 (Tier-1 cut). SCIM is Tier-2 cut candidate.
  - **Constraint solver (`[strategic ADR-024]`)** — `planegcs` integrated for the Component Editor at S49–S54. SolveSpace WASM reserved as backup; license incompatible with default SaaS.
  - **Type catalog freeze (`[strategic ADR-017]`)** — at S70 the M36 ship-with-product catalog (12 walls, 8 floors/roofs, 8 doors, 8 windows, 40 materials, plus loadable-family starter set) is frozen.
  - **Marketplace v1 fallback (`[strategic ADR-018]` T1.1)** — if launch partners aren't signed by S60, marketplace ships first-party-only at GA.
  ```

**§1.3 (Phase 3 sub-phase shape):**

- [ACTION] `INSERT_AFTER` the diagram:
  ```markdown
  > **Per-sub-phase ADR anchoring:**
  > - **3A** anchors `[strategic ADR-014]` (AI L7.5 ops) and `[strategic ADR-024]` (constraint solver). The AI sub-phase is **Tier-3 cuttable** to "critic-only at GA" per `[strategic ADR-018]` T3.1.
  > - **3B** anchors `[strategic ADR-008]` (IFC scope), SPEC-11 (full IFC pipeline), and the loadable-family authoring per SPEC-05 §8.
  > - **3C** anchors `[strategic ADR-009]` (sandbox) and SPEC-09 (plugin SDK 1.0).
  > - **3D** anchors `[strategic ADR-012]` (self-host) + `[strategic ADR-021]` (enterprise security).
  ```

**S49 (Visibility-Intent waves 6–11):**

- [ACTION] `INSERT_AFTER` the goal description:
  ```markdown
  > **Constraint-solver kickoff (`[strategic ADR-024]` Phase rollout S49)**: in parallel with VI waves, `packages/constraint-solver/` lands with `planegcs` integrated. First 5 constraint types (distance, angle, parallel, perpendicular, equal-length) working by S49 close. **No production usage** until S52; this sprint is foundation.
  ```

**S50 (AI floor-plan import):**

- [ACTION] `INSERT_AFTER` the goal description:
  ```markdown
  > **AI scope per `[strategic ADR-014]`**: this sprint is generator-pattern. If `[strategic ADR-018]` T3.1 fires (40–60% velocity slip), generator features ship as preview-only at GA and the critic-pattern is the only L7.5 capability marketed.
  ```

**S55 (IFC import):**

- [ACTION] `INSERT_AFTER` the goal description:
  ```markdown
  > **IFC scope per `[strategic ADR-008]` + SPEC-11**: v1 ships IFC4 read+write Pset round-trip for the 14-family entity table in ADR-008. IFC4.3 advanced (alignment, road, rail) is post-GA. MEP and structural-analytical are Phase 3+ marketplace plugins. The S55–S58 entity coverage MUST match ADR-008's table; if the M30 velocity check trips T3.3 (40–60% slip), drop stairs/railings/curtain-wall/furniture from IFC export — keep the core 6 (walls, slabs, columns, beams, doors, windows, spaces).
  ```

  Also `INSERT` to S55 exit criteria:
  ```markdown
  - [ ] Type round-trip preserved via `IfcRelDefinesByType` per SPEC-05 §5.
  - [ ] Round-trip CI corpus passes for the entity table in `[strategic ADR-008]`.
  ```

**S58 (Component editor):**

- [ACTION] `INSERT`:
  ```markdown
  > **Constraint solver dependency (`[strategic ADR-024]`)**: the Component Editor consumes `packages/constraint-solver/` for sketch-level constraints. Family parameters expose solver variables as user-editable inputs. Solver runs reactively on every constraint addition/edit, debounced via the same 250 ms policy as bake (`[strategic ADR-010]`).
  > **Type-catalog dependency (`[strategic ADR-017]`)**: family/type/instance schemas authored in this editor land in `packages/types-schema/loadable/` and ship in the M36 catalog freeze at S70.
  > **Tier-2 cut warning (`[strategic ADR-018]` T2.2)**: if M30 velocity is 20–40% slipping, the Component Editor (D10) is the largest Tier-2 cut. Its deferral defers the full constraint solver with it; the light expression evaluator (Phase 2A) remains.
  ```

**S62 (Plugin SDK 1.0):**

- [ACTION] `REPLACE` "ADR-009 (plugin sandbox) re-validated" with `[strategic ADR-009] (Web Worker plugin sandbox) re-validated against final implementation; Tier-3 cut T3.4 (substitute internal pen-test) is rejected unless explicit sign-off from F.`

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] First-party fast-path tier verified working (`@pryzm/*` namespace + signed; main-thread; throughput < 0.5 ms per element commit at LOD 0 per SPEC-09 §4.3).
  - [ ] Resource limits enforced per `[strategic ADR-009]` §resource-limits (256 MiB heap, 4 ms per-frame CPU, 50 req/min/plugin/actor network).
  ```

**S64 (Marketplace v1):**

- [ACTION] `INSERT_AFTER` the goal description:
  ```markdown
  > **First-party-only fallback (`[strategic ADR-018]` T1.1)**: if launch partners (≥ 5 third-party plugin developers committed to GA) are not signed by S60, marketplace ships first-party-only at GA. The full revenue-share infra still lands; only the third-party listing surface is held back.
  ```

**S67 (Self-host packaging):**

- [ACTION] `REPLACE` the entire goal/why-now block with:
  ```markdown
  **Goal**: per `[strategic ADR-012]` and SPEC-12, ship a single `docker-compose.yml` that brings up the full stack (editor + sync-server + bake-worker + ai-worker + Postgres 16 + Redis 7 + MinIO + Caddy + Grafana/Tempo/Prom/Loki) on one Linux VM with `docker compose up -d` in < 10 minutes. Air-gap install via tarball (Tier-2 cut candidate).

  **Why now**: D7 (open self-host) is a binding GA requirement (`08-VISION.md` D7 + Ask 04 confirmation). C3 (large enterprise) cannot adopt without this. `[strategic ADR-021]` (Enterprise security) requirements (RLS, MFA, audit log) must ship in the same image set.
  ```

- [ACTION] `INSERT` to the exit criteria:
  ```markdown
  - [ ] Air-gap install tested on a network-isolated VM (Tier-2 cut candidate per `[strategic ADR-018]` T2.5; must pass unless cut applied).
  - [ ] Caddy TLS termination + reverse proxy live in compose stack per `[strategic ADR-012]`.
  - [ ] License-key check is offline (signed JWT bundled in install) per `[strategic ADR-012]` §air-gap.
  ```

**S68 (Security hardening):**

- [ACTION] `INSERT`:
  ```markdown
  > **Pen test scope per `[strategic ADR-021]` + SPEC-08 §9**: external pen test (third-party). Tier-3 cut T3.4 (internal pen test substitute) is **rejected unless explicit sign-off from F**.
  > **CI gate per `[strategic ADR-021]`**: service-role-key isolation lint (only `apps/sync-server/`, `apps/bake-worker/`, `apps/ai-worker/`, edge functions allowed) MUST be green at this sprint and forever after.
  ```

**S70 (Browser matrix + accessibility):**

- [ACTION] `INSERT`:
  ```markdown
  > **Multi-region delivery per `[strategic ADR-021]`**: EU-West (Frankfurt) and US-East (Virginia) regions live by S70 close. AP-Southeast deferred to Phase 4 (Tier-1 cut per `[strategic ADR-018]` T1.2).
  > **Browser parity per `[strategic ADR-006]`**: visual-diff CI gate at error level across the 24-scene corpus AND across Chrome/Firefox/Safari/Edge.
  ```

**S72 (M36 GA Launch Gate):**

- [ACTION] `REPLACE` the GA gate exit criteria block with the union of:
  - Existing block.
  - `[strategic ADR-018]` final cut accounting written to `docs/operations/cut-list-log.md`.
  - `[strategic ADR-020]` property-test suite green across all element families on Node 20 + Chrome + Safari + Firefox.
  - `[strategic ADR-021]` SOC 2 Type 1 audit kicked off (M30) and on track for Type 1 by GA.
  - `[strategic ADR-007]` Tempo prod live in EU-W + US-E with on-call dashboard.
  - `[strategic ADR-008]` IFC round-trip CI corpus 100% green for the 14-family table.
  - `[strategic ADR-017]` ship-with-product catalog frozen and shipping.
  - `[strategic ADR-024]` snapshot suite green across Node 20 + Chrome + Safari + Firefox.

**§9 ("What Phase 3 explicitly did NOT do — post-GA roadmap seeds"):**

- [ACTION] `REPLACE` line 618 (`IFC 4.3 advanced features (per ADR-008)`) with:
  ```markdown
  - **IFC4.3 advanced features** (alignment, road, rail) — per `[strategic ADR-008]`.
  - **Per-instance ACL overrides** — per `[strategic ADR-011]`.
  - **WebAuthn / passkeys** — per `[strategic ADR-021]`.
  - **AP-Southeast region** — per `[strategic ADR-021]` + `[strategic ADR-018]` T1.2.
  - **Helm chart, single-binary, BYOC** — per `[strategic ADR-012]`.
  - **MEP / structural-analytical / civil-infra IFC** — per `[strategic ADR-008]`.
  - **Schedule formula DSL** — per `[strategic ADR-018]` T1.3.
  - **3D constraints, NURBS constraints** — per `[strategic ADR-024]`.
  - **FedRAMP, ISO 27001, HIPAA BAA** — per `[strategic ADR-021]` Compliance posture.
  ```

---

## §4 New cross-cutting items (must land in the corresponding sprint)

These are **new deliverables** not present in the original phase docs. They derive from the SPECs/ADRs/CRITICAL-REVIEW and have no existing home.

| Item | Phase doc | Sprint | Owner-track |
|---|---|---|---|
| `packages/otel/` SDK wrapper + first spans | PHASE-1A | S01 | A |
| Sandbox 5-day spike + 1-page report | PHASE-1A | S01 | F + A + B |
| OTel collector deployed in dev; Honeycomb dev account wired | PHASE-1A | S02 | A |
| P8 OTel coverage lint at warning | PHASE-1A | S04 | A |
| P8 OTel coverage lint at error | PHASE-1A | S08 | A |
| `packages/types-schema/` Zod schemas + family taxonomy frozen | PHASE-1B | S07 | A |
| `packages/material-library/` ships with v1 40-material set | PHASE-1B | S09 | A |
| Type-completeness lint PR-blocking | PHASE-1B | S11 | A |
| `packages/geometry-kernel/__tests__/robustness/` PR-merge gate | PHASE-1B | S08 | A |
| `manifold-3d` pinned to exact SHA | PHASE-1B | S07 | A |
| `packages/storage-driver/` (R2 + MinIO behind interface) + isolation lint | PHASE-1D | S19 | A |
| Tempo prod instance live in EU-W + US-E | PHASE-1D / PHASE-2 | S22 / S43 | A |
| `packages/expr-eval/` light expression evaluator (per SPEC-01 §4.1) | PHASE-2A | S25 | A |
| `packages/drawing-primitives/` skeleton + tests for hatch alignment + dash-phase preservation | PHASE-2A | S25 (per `[strategic ADR-016]` Phase rollout) | B |
| `packages/drawing-canvas2d/` first frame | PHASE-2A | S27 | B |
| Full plan-view rebuild on the new primitive model; old plan-view code removed | PHASE-2B | S29 | B |
| `packages/drawing-svg/` back-end | PHASE-2B / 2C | S31 | B |
| `packages/drawing-pdf/` back-end | PHASE-2C | S33 | B |
| `packages/permissions/` skeleton + role enum | PHASE-2 | S08 (early) | A |
| Base role enforcement at L2 + UI for Solo/Team plans | PHASE-2 | S22 | A |
| Full role/permission matrix per SPEC-08 §3 enforced at all four points | PHASE-2 | S43 | A |
| `audit_log` table + per-tenant view | PHASE-2 | S46 | A |
| `packages/sync/locks.ts` + lock API stable | PHASE-2 | S43 | A |
| First tools acquire locks (`wall.move`, `wall.modify-properties`) | PHASE-2 | S46 | B |
| Mid-edit lock loss UX + janitor cron | PHASE-2 | S48 | A + B |
| AI-batch lock integration | PHASE-3 | S55 | A |
| `packages/constraint-solver/` lands with `planegcs` integrated | PHASE-3 | S49 | A |
| Component Editor uses solver end-to-end | PHASE-3 | S54 | A + B |
| SAML/OIDC SSO live | PHASE-3 | S55 | A |
| SCIM live | PHASE-3 | S58 | A |
| SOC 2 Type 1 audit kicks off | PHASE-3 | S60 | F |
| Audit-log streaming live | PHASE-3 | S64 | A |
| External pen test | PHASE-3 | S68 | F (coordinator) + A + B |
| Multi-region pinning (EU-W + US-E) live | PHASE-3 | S70 | A |
| `[strategic ADR-018]` final cut accounting written to `docs/operations/cut-list-log.md` | PHASE-3 | S72 | F |

---

## §5 Cuts that may be exercised at each phase gate

For agent reference during velocity check-ins. From `[strategic ADR-018]`. **No agent applies cuts unilaterally** — cuts are F's call at the gate.

### M12 gate (PHASE-1 §6)
- 0–10% slip: no cut.
- 10–20% slip: T1.5 (PDF server-only) early-flagged for S40.
- 20–40% slip: T2.6 (multi-region → single region) flagged for S70.
- 40–60% slip: T3.5 (M36 → M40 slip) considered; F escalates.

### M24 gate (PHASE-2 §6)
- 0–10%: no cut.
- 10–20%: T1.4 (flat view templates), T1.6 (defer WebAuthn).
- 20–40%: **T2.2 (defer Component Editor + constraint solver to v2)** — the largest single Tier-2 reclaim. T2.4 (defer SCIM).
- 40–60%: T3.1 (AI critic-only at GA) + T3.3 (IFC reduced to core 6).

### M36 gate (PHASE-3 §6)
- Final accounting only. Cuts already locked by S70.

---

## §6 Verification checklist (run after edits)

Agent runs this sequence to confirm the update plan is fully applied. Each item is a `rg` or shell command + expected result.

| Check | Command | Expected |
|---|---|---|
| No bare `ADR-NNN` in phase docs | `rg -n '\bADR-[0-9]+\b' docs/00_NEW_ARCHITECTURE/phases/ \| rg -v 'strategic ADR-\|code-level ADR\|0[0-9]{3}-'` | Empty (or only inside the §1.3 renumbering map of this update plan). |
| All phase docs have the 2026-04-27 preamble | `rg -L 'Authority note (added 2026-04-27)' docs/00_NEW_ARCHITECTURE/phases/PHASE-*` | Empty (every file matches). |
| All phase docs have an `[strategic ADR-018]` reference in their risk register | `for f in docs/00_NEW_ARCHITECTURE/phases/PHASE-*; do rg -L 'strategic ADR-018' "$f" \|\| true; done` | No paths printed. |
| No `coalescing window = 500 ms` remains | `rg -n '500 ms' docs/00_NEW_ARCHITECTURE/phases/ \| rg -i 'coalesc'` | Empty. |
| `[strategic ADR-016]` cited at S29 | `rg -n 'strategic ADR-016' docs/00_NEW_ARCHITECTURE/phases/PHASE-2A-*` | At least one match in/near S29-S30. |
| `[strategic ADR-017]` cited at S11 | `rg -n 'strategic ADR-017' docs/00_NEW_ARCHITECTURE/phases/PHASE-1B-*` | At least one match in/near S11. |
| `[strategic ADR-019]` cited at S43–S48 | `rg -n 'strategic ADR-019' docs/00_NEW_ARCHITECTURE/phases/PHASE-2-*` | At least one match. |
| `[strategic ADR-020]` cited at S07–S08 | `rg -n 'strategic ADR-020' docs/00_NEW_ARCHITECTURE/phases/PHASE-1B-*` | At least one match. |
| `[strategic ADR-021]` cited in PHASE-3 sprints S55, S58, S64, S70 | `rg -n 'strategic ADR-021' docs/00_NEW_ARCHITECTURE/phases/PHASE-3-*` | ≥ 4 matches. |
| `[strategic ADR-024]` cited in PHASE-2A (light expr) and PHASE-3 S49–S58 | `rg -n 'strategic ADR-024' docs/00_NEW_ARCHITECTURE/phases/` | ≥ 3 matches. |
| Sprint-scoped ADRs all live under `docs/architecture/adr/` | `ls docs/architecture/adr/0001-*.md docs/architecture/adr/0002-*.md docs/architecture/adr/0003-*.md docs/architecture/adr/0005-*.md docs/architecture/adr/0006-*.md docs/architecture/adr/0008-*.md docs/architecture/adr/0017-*.md docs/architecture/adr/0023-*.md docs/architecture/adr/0024-*.md docs/architecture/adr/0025-*.md` | All 10 files exist (creating the missing files is part of applying this plan; see §7). |

---

## §7 Files to create when applying this plan

The renumbering produces a small set of sprint-scoped ADR files in `docs/architecture/adr/`. Each file is a stub redirect to the relevant sprint section in the phase doc, plus the technical decision body that previously lived inline. Agent creates each file once with the existing prose pulled from the phase doc.

| File | Source (phase-doc section to extract from) |
|---|---|
| `docs/architecture/adr/0001-typed-id-brand.md` | PHASE-1A S01 D3 + the ULID/UUID coexistence rules in S07 risk row R1A-10 + S02-T4 emitter spec. |
| `docs/architecture/adr/0002-command-handler-signature.md` | PHASE-1A S02-T1 + the `CommandManager.ts` audit notes. |
| `docs/architecture/adr/0003-scheduler-priority-vs-tickpriority.md` | PHASE-1A S02-T7 + S03 + UnifiedFrameLoop absorption notes. |
| `docs/architecture/adr/0005-primitive-committer-interface.md` | PHASE-1A S04-T6. |
| `docs/architecture/adr/0006-idle-continuation-budget.md` | PHASE-1A S03-T2 + 30-frame justification. |
| `docs/architecture/adr/0008-wall-tool-submodes.md` | PHASE-1B §1.3 wall-touching command surfaces table. |
| `docs/architecture/adr/0017-pryzm-zip-format-v1.md` | PHASE-1D S20 implementation detail blocks (ZIP layout, manifest schema, batch format, signature scheme, migration contract). |
| `docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` | PHASE-2B S31. Note this is a *back-end* of the SPEC-04 vector primitive model, not a free-standing renderer architecture. |
| `docs/architecture/adr/0024-section-cut-algorithm.md` | PHASE-2B S35. Cut-vs-projection distinction; convex-hull fallback. |
| `docs/architecture/adr/0025-multi-view-sync.md` | PHASE-2B S36. ViewSync pattern. |

Each file uses the same template as existing files in `docs/architecture/adr/0001..0007`. The header table includes:
- `Status`, `Date`, `Owner`.
- `Sprint`: the originating sprint id.
- `Strategic ADR parent` (where applicable): e.g. `0023` cites `[strategic ADR-016]`; `0017` is independent of any strategic ADR; `0008` cites `[strategic ADR-020]` (kernel robustness) as its *constraint context*.

---

## §8 Order of operations

To minimise rework, agents apply edits in this order:

1. **Create the 10 sprint-scoped ADR files** in `docs/architecture/adr/` per §7. These are pure copy/extract from existing phase-doc text.
2. **Apply the §2 global edits** to every phase doc (preamble, renumbering map, cut-list reference, SPEC table, reading-conventions note).
3. **Apply the §3 per-doc edits** in phase order (1A → 1B → 1C → 1D → 2 → 2A → 2B → 2C → 3).
4. **Apply the §4 new-deliverables list** by inserting the named deliverables into the named sprints' goal/exit-criteria blocks.
5. **Run §6 verification checklist.** Every item must pass before declaring the update complete.
6. **Update `PROCESS-TRACKER.md`** with: "Phase docs aligned to SPEC/ADR/CRITICAL-REVIEW corpus on 2026-04-27 per `phases/PHASES-UPDATE-PLAN-2026-04-27.md`."

---

## §9 What this plan deliberately does NOT change

- **The sprint structure** (S01 → S72). No sprint is renumbered, added, or deleted.
- **Sprint exit criteria that already match the SPECs/ADRs** (e.g. PHASE-1's `[strategic ADR-010]` 250 ms reference at line 557 already aligned).
- **Track A vs Track B allocations.** Agents A and B keep their existing assignments; new deliverables in §4 inherit the existing track based on subject matter.
- **The `08-VISION` differentiator commitments** (D1–D10). Cuts in `[strategic ADR-018]` are scope reductions within commitments, not commitment reversals.
- **The 36-month total budget.** `[strategic ADR-018]` T3.5 (M36 → M40 slip) is a last-resort lever, not a default.

---

## §10 Rollback

If a phase-doc edit per this plan breaks something downstream (e.g. a test fixture references `ADR-NNN` by an old number), the rollback is per-doc:

1. Restore the phase doc from the pre-2026-04-27 commit.
2. Re-apply only the §2 G1 preamble (the authority note) — that's the one always-safe insertion.
3. File a follow-up issue capturing what went wrong + propose a per-issue fix.

The renumbering itself is reversible by inverting the §1.3 map.

---

*This plan is the source of truth for phase-doc alignment until merged. Once merged, phase docs and the strategic corpus are mutually consistent; this plan can be archived alongside `CRITICAL-REVIEW-2026-04-27.md` for historical record.*
