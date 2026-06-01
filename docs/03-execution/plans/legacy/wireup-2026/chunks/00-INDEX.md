# PRYZM 2 Enterprise Wireup Plan — S72

> **The white UI, the real engine, no patches.**
>
> This folder is the chunked, navigable form of the binding S72 wireup plan.
> The original monolith (2,305 lines) lives at [`../PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`](../00-PLAN.md) and remains the single source of truth — these chunks are byte-identical slices of it (each file declares the source line range in its header), plus three new cross-reference deliverables (21–23) that close the operator's verification loop.
>
> **Operator constraint** (codified in §1, enforced in §6, gated in Phase H visual-diff CI): the white PRYZM 1 UI in `src/ui/` is **inviolate**. No pixel changes. All 36-month rebuild work in `packages/`, `plugins/`, `apps/` is wired **behind** the existing white landing → hub → editor flow.
>
> **Scope boundary** (added 2026-04-29): this plan finishes at **PRYZM 3 day 1 (S87, ~M40)** — the wireup endpoint defined in [`../../../PRYZM-3-CONVERGENCE-PLAN.md`](../../02_PLAN/03-CONVERGENCE.md). It is deliberately **not** the end-state product. The from-zero next-generation product — multi-shell, AI-as-substrate, designer-led, no patched-through-stages feel — is **PRYZM 4**, planned in [`PRYZM-4-NEXT-GEN-PLAN.md`](../../../../../04_PRYZM4/PRYZM-4-NEXT-GEN-PLAN.md) under [`docs/03-execution/plans/`](../../../../../04_PRYZM4/). PRYZM 4 starts after a 6-month Stage Σ production validation of PRYZM 3 (S88 → S99) and ships at S155 (~M77). The folder name `PRYZM2-WIREUP-PLAN-S72` is preserved as a historical artifact — the plan was originally drafted under the "PRYZM 2" label before the renumbering, and the chunk slice contract requires path stability.

---

## How to read this folder

The plan answers four questions, in order. Read in this order on first pass:

1. **Why are we doing this and what is wrong today?** → 01
2. **What is the contract `src/ui/` will bind to?** → 02
3. **In what order do we land it?** → 03 → 04 → 05 → 06 → 07
4. **Per UI gesture, what is the wire change?** → 08 → 09 → 10 → 11 → 12 → 13
5. **Per PR, what is the sub-phase ID, the bench, the deletion?** → 14 → 15 → 16 → 17 → 18 → 19 → 20
6. **How do I prove every architecture piece is wired and nothing was forgotten?** → **21 → 22 → 23** (new)

---

## Files in this folder

### Part 1 — Why and what

| # | File | Source §§ | What it answers |
|---|---|---|---|
| 01 | [`01-objective-and-audit.md`](./01-objective-and-audit.md) | §0 + §1 + §2 | v1 retraction; operator intent; cast-site count (769 in `src/ui/`); two-hub two-editor split |
| 02 | [`02-runtime-architecture.md`](./02-runtime-architecture.md) | §3 | `composeRuntime()`; `PryzmRuntime` typed handle (every L0–L7.5 leg); contribution model; threading; persistence in the bus; one rAF |

### Part 2 — In what order

| # | File | Source §§ | What it answers |
|---|---|---|---|
| 03 | [`03-phases-overview.md`](./03-phases-overview.md) | §4 | Phases A–H summarised; per-phase entry/exit gates |
| 04 | [`04-deletions.md`](./04-deletions.md) | §5 | The precise delete list (≈150K LOC) |
| 05 | [`05-white-ui-preservation.md`](./05-white-ui-preservation.md) | §6 | What stays unchanged (the white UI) and the rules around it |
| 06 | [`06-risks-issues-decisions.md`](./06-risks-issues-decisions.md) | §7 + §8 + §9 | Risk register, open issues at S72 D0, decision log |
| 07 | [`07-done-definition.md`](./07-done-definition.md) | §10 | The operator-visible + architecturally-honest GA "done" state |

### Part 3 — Per UI gesture, the wire change

| # | File | Source §§ | What it answers |
|---|---|---|---|
| 08 | [`08-click-trails.md`](./08-click-trails.md) | §11 | 17 end-to-end gestures from landing → hub → editor → wall → IFC → AI → marketplace, file:line accurate |
| 09 | [`09-ui-inventory-A-D.md`](./09-ui-inventory-A-D.md) | §12.0–§12.4 | UI inventory categories A (Platform 25 files) · B (Workspace top bar 6) · C (Left rail 16) · D (Right tools 11) |
| 10 | [`10-ui-inventory-E-H.md`](./10-ui-inventory-E-H.md) | §12.5–§12.8 | Categories E (Inspector 30) · F (Bottom strip 18) · G (Canvas overlays 8) · H (Drawing HUDs 24) |
| 11 | [`11-ui-inventory-I-L-coverage.md`](./11-ui-inventory-I-L-coverage.md) | §12.9–§12.13 | Categories I (AI 14) · J (Data Workbench 15) · K (Rendering 10) · L (Modals 23) + coverage proof (200/220 explicit, 20 sub-modules) |
| 12 | [`12-ui-perf-benches.md`](./12-ui-perf-benches.md) | §13 | 60 new UI benches in `apps/bench/src/benches/ui/`; harness; CI integration; visual-diff CI |
| 13 | [`13-vision-conformance.md`](./13-vision-conformance.md) | §14 | 8 principles · 17 NFTs · 9 layers · 10 differentiators · 8 non-goals · cross-doc conflicts — all ticked |

### Part 4 — Per PR, the sub-phase

| # | File | Source §§ | What it answers |
|---|---|---|---|
| 14 | [`14-subphases-A-D.md`](./14-subphases-A-D.md) | §16.0–§16.4 | Conventions; Phase A composition root; Phase B constructor widening; Phase C persistence; Phase D engine consolidation |
| 15 | [`15-subphases-E-families.md`](./15-subphases-E-families.md) | §16.5 | Phase E — 14 element families, each migrated + legacy directory deleted in the same PR |
| 16 | [`16-subphases-F1-toolbars.md`](./16-subphases-F1-toolbars.md) | §16.6.1 | Phase F1 — `toolbar.discipline` contributions: 65 sub-phases across 8 rails (Architecture, Annotation, Export, GIS, Grids+Levels, Navigate, Render, Visual) |
| 17 | [`17-subphases-F2-F5.md`](./17-subphases-F2-F5.md) | §16.6.2–§16.6.5 | Phase F2 (`inspector.element` per family) · F3 (`modal.creation`) · F4 (right-click + radial menu) · F5 (bottom strip 32 gestures) |
| 18 | [`18-subphases-F6-F12.md`](./18-subphases-F6-F12.md) | §16.6.6–§16.6.12 | Phase F6 (left-rail content) · F7 (AI 16) · F8 (Visibility-Intent 13) · F9 (Data Workbench 16) · F10 (rendering 14) · F11 (modals 12) · F12 (plugins/IFC/Rhino/BCF/DXF/CompEd 20) |
| 19 | [`19-subphases-G-H-catchall.md`](./19-subphases-G-H-catchall.md) | §16.7–§16.11 | Phase G mass deletions (9) · Phase H lock-in (7 lint+bench flips) · catch-all gesture sweep (H.8–H.10) · cadence summary (~386 sub-phases over 15 sprints S73–S87) |
| 20 | [`20-summary-and-amendments.md`](./20-summary-and-amendments.md) | §15 | What was added in S72 D-final; cross-document amendments |

### Part 5 — Verification (NEW — operator's proof loop)

> The operator asked: *"How do I know every single architecture piece is wired to every UI interaction?"*
> The plan answers in two directions: §12 maps every UI file → architecture path (forward), and §16 maps every UI gesture → sub-phase ID (per-PR). The two new files below close the loop: §21 maps every architecture leg → consuming UI surface (reverse), and §23 gives the runnable scripts that assert nothing slipped.

| # | File | What it adds |
|---|---|---|
| **21** | [`21-architecture-to-ui-coverage-matrix.md`](./21-architecture-to-ui-coverage-matrix.md) | **REVERSE map**: every package in `packages/`, every plugin in `plugins/`, every app worker — the UI surface(s) that consume it, the `runtime.<leg>` reach, the click-trail § that exercises it, the sub-phase ID that lands the wire, and the bench that gates it. Use this to verify *no architecture leg is orphaned*. |
| **22** | [`22-end-to-end-flows.md`](./22-end-to-end-flows.md) | The seven canonical flows the operator named (landing → signup → create project → open project → import PDF/DXF/IFC → views/3D/elevations/sections/schedules → all elements/annotations/dimensions/sheets → export IFC/PDF → AI), with each flow stitched across §11 click trails, §16 sub-phase IDs, and the §13 bench that gates it. Use this to walk through what the operator will demo at GA. |
| **23** | [`23-verification-scripts.md`](./23-verification-scripts.md) | Runnable shell + lint recipes that an engineer (or CI) executes to assert: no `(window as any)` in `src/ui/`; no unmapped event listeners; no duplicate rAF; no second canvas; every plugin contribution matches a UI surface; every UI surface matches a sub-phase ID. |
| **24** | [`24-pryzm1-src-coverage-audit.md`](./24-pryzm1-src-coverage-audit.md) | **Pryzm 1 `src/` coverage audit.** Walks every one of the 36 top-level `src/` folders against the §5 deletion list. Finds that the original list covered only 6 of the 23 UI-imported legacy directories — and adds **31 new sub-phases** (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) to close the gap. Bumps the realistic Phase G deletion total from ~150K LOC to ~173K LOC and pins three pending decisions to new ADRs (041–043). |
| **25** | [`25-architecture-docs-cross-alignment.md`](./25-architecture-docs-cross-alignment.md) | **NEW_ARCHITECTURE docs cross-alignment audit.** Where Chunk 24 walked every `src/` *folder*, Chunk 25 walks every *document* under `docs/archive/pryzm3-internal/` (17 root entries + 41 ADRs + 39 SPECs + the 24 chunks). Confirms 10/11 §6 contradictions in CONFLICT-ANALYSIS are owned, surfaces the 1 remaining gap (customer migration → **ADR-044**), 6 doc gaps (2 SUPERSEDED-without-banner, 1 STALE 11-GAP-CLOSURE, 1 DRIFTED 11-FILE-STRUCTURE, 1 DUPLICATE breakdown, 1 MISSING `13-AEC-WISHLIST`), and the post-S72 wireup vs post-GA roadmap **sprint-ID collision** (S73 means two different things). Adds 7 doc-PRs + 1 sub-phase (G.32 — PRYZM 1 lights-out) + 1 ADR (044) + a `§23.x cross-doc invariants` block to `pnpm ga-gate`. |
| **26** | [`26-plan-self-corrections.md`](./26-plan-self-corrections.md) | **Plan self-corrections — 11 amendments to make the plan executable.** Where Chunk 24 closed coverage gaps and Chunk 25 closed cross-doc gaps, Chunk 26 closes executability gaps: the §23 verification harness (5 ESLint rules, 2 bench scripts, 2 new packages) was promised but never built, the `rg --type=tsx` flag is silently broken, hard-coded baselines (769 / 44 / 36) have already drifted, the 33 sub-phases added by 24 + 25 are orphaned from chunks 14–19, Phase A opened on red CI, the re-slice script will undo chunk-level edits, `pnpm ga-gate` has no runtime smoke test, and the S73-WIRE convention has no lint enforcement. Adds **21 Z.* retro-fit sub-phases** in S77 D1–D9 (back half of Phase C), **G.33** (delete `src/persistence/`), **9 G.32.* sub-items** (PRYZM 1 lights-out checklist), **H.5.1** (sprint-ID commit hook), **§23.13** (runtime smoke test), parametric `wireup-floor.json` baselines, banner-style fold of 24 + 25 IDs into chunks 14–19, retirement of the re-slice script. Net: ~441 sub-phases (was 418). Chunk 25's "ADR-041–044 MISSING" rows are themselves stale — all four ADRs are now on disk. |
| **27** | [`27-phase-H-extraction-ledger.md`](./27-phase-H-extraction-ledger.md) | **Phase H per-package extraction ledger.** Tracks H.0 (shared `tsconfig.build.template.json`) + H.1 (`@pryzm/file-format` first extraction) — both LANDED. Living ledger that future H.2–H.14 PRs append to as each package flips. |
| **28** | [`28-commandManager-execute-migration.md`](./28-commandManager-execute-migration.md) | **`commandManager.execute(...)` → `runtime.bus.executeCommand(...)` caller-side migration.** Tracking-only; the Phase B handler-side swap landed but the 195 caller-side reaches across 121 files were deliberately scoped out as "next pass". Top-offender table + 3-pattern batching plan. No work scheduled yet; absorbs into the §II.C C.3.x sweep on its way through. |
| **29** | [`29-linear-execution-plan-2026-04-30.md`](../../02_PLAN/04-LINEAR-EXECUTION.md) | **Linear execution plan to PRYZM 2 wireup completion (S87 / M40).** BINDING sequence the team follows from 2026-04-30 forward. Decomposes the remaining ~390 sub-phases into **7 waves** (D.7 sweep + F-launch rollout + B.13 closeout · B.14–B.40 widenings · D.4 EngineBootstrap split · C.3.x persistence rewire · F.2–F.12 family rollout · G mass deletions + Z retro-fits · H per-package compile + GA gate) with **3 critical-path serializations** named, per-wave verifiers, and a 15-sprint cadence forecast (S73 → S87). Companion to `0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md`. Created 2026-04-30 after rows 18–24 (7 sub-phases) landed in one day, bringing `tsc --skipLibCheck` from 10 baseline errors to 0 and unlocking the mechanical phase of the wireup. |

---

## Status snapshot (mid-Phase-C — derived from `.local/state/replit/agent/wireup-floor.json` per Chunk 26 §26.3)

> **Live numbers**: every count below is the floor at the time of the most recent `scripts/wireup-baseline.sh` run. Use `≥` semantics for growers, `≤` semantics for shrinkers (Chunk 26 §26.3).

- White UI in `src/ui/` — **220 files, ~96.6K LOC, intact**.
- 36-month rebuild outputs:
  - `packages/` — **≥ 46 packages** (geometry-kernel, command-bus, frame-scheduler, renderer, scene-committer, persistence-client, sync-client, stores, schemas, plugin-sdk, visibility, picking, formula-library, expr-eval, ai-host, ai-cost, ai-spend, perf-budgets, file-format, view-state, ui, ui-base, … + Chunk 26 adds `release`, `eslint-plugin-pryzm`, `bench-visual-diff`).
  - `plugins/` — **≥ 38 plugins** (all 12 element families + ifc-import/export/inspector + rhino-import + bcf + 5 AI plugins + annotations + dimensions + furniture + lighting + multiplayer + plumbing + rooms + schedules + section-view + sheets + structural + plan-view + view + selection + cross + toy-cube + grid + handrail + ceiling). **Live count**: `ls plugins/ | wc -l`. (`plugins/floor` is the one missing scaffolding — Chunk 24 §24.2 adds **E.6.0** to create it.)
  - `apps/` — **≥ 12 apps** (editor, bench, cli, component-editor, headless, docs-site, sync-server, ai-worker, bake-worker, api-gateway, marketplace-api, marketplace-web).
- Composition root `composeRuntime()` — **shipped** (Phase A complete, S73). Constructor widening (Phase B, S74–S75) **complete**. Persistence rewire (Phase C, S76+) **in progress**.
- Cast sites in `src/ui/` — `≤ 764` (was 769 at S72 D0; → 0 by Phase G, S84). Parametric — read from `wireup-floor.json`.
- rAF callers outside `packages/frame-scheduler/` — `≤ 89` (→ 0 by Phase H.2).
- `document.createElement('canvas')` outside `packages/renderer/` — `≤ 47` (→ 0 by Phase H.3).
- Top-level `src/` directories — `≤ 35` (chunk 24 + 26 fold; chunk 24 table sums to 35; 00-INDEX previously said 36 — corrected).
- Sub-phase count — **~441** across S73–S87 (~28 PRs/sprint, 2 engineers). Original 386 + Chunk 24's +31 + Chunk 25's +1 (G.32) + Chunk 26's +23 (Z.0–Z.20 + G.33 + H.5.1 + 9 G.32.* sub-items).
- ADR count — **44 ratified on disk** (Chunk 25's "041–044 MISSING" rows are stale; all four are now on disk per Chunk 26 §26.11).
- SPEC count — **40 on disk** (39 numbered + `SPEC-FAMILY-EDITOR.md`).
- Workflow CI green-rate — **4/9 green** (5 red workflows blocking Phase D entry per Chunk 26 §26.6 — `ifc-export-tier1`, `ifc-import-tier2`, `ifc-inspector-pset-editor`, `pryzm-vi-parity`, `rhino-import-3dm`).

---

## Final synthesis (2026-04-29)

For a single-page reference that pulls everything in this folder + every root NEW_ARCHITECTURE doc + every ADR + every SPEC into one canonical "this is Pryzm 2 and this is how it runs" map (8-layer architecture diagram, full folder tree, composition root, per-flow orchestration, threading + deployment topology, boot/edit/sync/AI/bake sequences, white-UI binding contract, plugin contribution flow, verification gates, the 36-month plan in one line per quarter), see:

→ [`../../FINAL-ARCHITECTURE-AND-ORCHESTRATION.md`](../../01_ARCHITECTURE/03-FINAL-MAP.md) — the architecture map

→ [`../../SUMMARY-IMPLEMENTATION-PLAN.md`](../../02_PLAN/02-SUMMARY.md) — the 36-month + post-S72 wireup + post-GA roadmap on a single page

→ [`../../PROCESS-TRACKER.md`](../../03_STATUS/01-PROCESS-TRACKER.md) — the live status board (Now / Next / sub-phase tickbox / ADR queue / doc-PR queue / risk register / health snapshot). Founder reads daily.

→ [`../../../PRYZM-3-CONVERGENCE-PLAN.md`](../../02_PLAN/03-CONVERGENCE.md) — the one-way ratchet from today's PRYZM 1 + PRYZM 2 dual reality into a single clean product called PRYZM 3 (one composition root, one rAF, one corpus, no legacy, no flag, no dual identity). Includes the day-1 acceptance checklist and the single command (`pnpm pryzm-3-day-1`) that proves convergence.

All four are **synthesis, not authority** — they never override `06-PRYZM-IDENTITY`, the `.pryzm` spec, `08-VISION`, the master plan, or any ratified ADR. They are the single set a new engineer reads on day one and the single set the founder scans daily.

---

## Single source of truth

If a chunk file disagrees with the monolith, **the monolith wins** — the chunk is a slice. To regenerate any chunk after a monolith edit, see [`23-verification-scripts.md`](./23-verification-scripts.md) §3 ("Re-slice script").

If the monolith disagrees with `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `01-TARGET-ARCHITECTURE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, or `06-PRYZM-IDENTITY-AND-RECOUNT.md`, **the monolith wins for the post-S72 wireup phase only** — the sister documents define the long-range vision and are amended by Phase H D-last (see [`13-vision-conformance.md`](./13-vision-conformance.md) §14.6 cross-document conflicts).
