# PRYZM 2 — Architectural File-Structure Breakdown (proposal)

> **Status**: PROPOSAL (live tree audited 2026-04-27).
> **Scope**: every directory the agent touches in PHASE 1A–1D, with a
> short description, owning layer (L0–L7), spec citation, and a
> conformance verdict.
> **Companion document**: `audits/PHASE-1-RE-AUDIT-2026-04-27.md`
> ratifies the live tree against this proposal.
> **Authority order** (per `CONFLICT-ANALYSIS.md`):
> `06-PRYZM-IDENTITY-AND-RECOUNT.md` > `08-VISION.md` >
> `10-MASTER-IMPLEMENTATION-PLAN-36M.md` > phase docs > this proposal.

---

## §0 Why this document exists

Multiple sub-phase docs (`PHASE-1A`, `PHASE-1B`, `PHASE-1C`,
`PHASE-1D`) each prescribe their own subset of the file tree. Read in
isolation, each is consistent. Read together, the *union* of every
prescribed path is large and there has never been a single-page map
that says **"here is the canonical PRYZM 2 layout, here is what each
folder is for, here is the spec line that motivated it."**

This document is that map. It is *descriptive* of the shipped 1C exit
state and *prescriptive* for 1D and 2A — anything that lands in the
tree from M10 onward should fit into one of the slots below or be
proposed as an addition with an ADR.

---

## §1 Top-level layout

```
/
├─ apps/                       L7  — runnable surfaces (editor, CLI, server, bench)
├─ packages/                   L0–L6 — pure, kernel-shaped libraries (no DOM)
├─ plugins/                    L7  — element-family plugins (one per family)
├─ tools/                      —    — build-time tooling (ESLint plugin, codegen)
├─ tests/                      —    — cross-package suites (parity, integration, ci)
├─ scripts/                    —    — Node scripts (CI, isolation guards)
├─ docs/
│   ├─ archive/pryzm3-internal/    —    — this proposal lives here
│   ├─ architecture/           —    — handover docs + ADRs
│   ├─ demos/                  —    — milestone demo scripts
│   ├─ sprints/                —    — sprint retros (S07-retro, S18-retro, ...)
│   └─ file-format/            —    — `.pryzm` v1 spec
├─ public/                     —    — static assets served by the dev/prod server
├─ .changeset/                 —    — semver changelogs (one per feature merge)
├─ .github/                    —    — GitHub Actions workflows
├─ .agents/                    —    — agent prompts (Replit Agent infra)
├─ replit.md                   —    — running operator log (latest at top)
├─ package.json                —    — npm workspaces root (apps/* packages/* plugins/* tools/*)
├─ vite.config.ts              —    — single Vite config; serves apps/editor on :5000
├─ server.js                   —    — Express host (auth, db, vite middleware)
└─ tsconfig.base.json          —    — shared compiler options
```

**Legacy roots still present** (PRYZM 1 surface, kept under the
`?pryzm2=0` URL switch — not part of this proposal):

```
client/    editor/    src/    public/    server/    screenshots/
```

These are **out of scope** for the new architecture and should remain
exactly where they are until 2A §S26 sunsets them per
`PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`. New code may
**not** import from them; the `eslint-plugin-pryzm` `no-three-in-kernel`
rule + the `@pryzm/legacy-shim` strangler boundary enforce this.

---

## §2 `apps/` — runnable surfaces (L7)

Each entry is a self-contained executable with its own `package.json`,
`tsconfig.json`, and `vitest.config.ts`. **No app may import from
another app**; cross-app sharing happens via `packages/`.

```
apps/
├─ editor/                     Browser editor (entry: index.html → src/index.ts)
│  ├─ src/
│  │  ├─ bootstrap.ts                  L7 — minimal hello-cube boot (PHASE-1A §S06)
│  │  ├─ bootstrap.data.ts             L7 — bootstrapWithWalls() (PHASE-1B §S08)
│  │  ├─ bootstrap.render.ts           L7 — renderer wiring half (PHASE-1A §S06)
│  │  ├─ bootstrap.render.data.ts      L7 — wall + renderer (PHASE-1B §S09)
│  │  ├─ bootstrap.everything.ts       L7 — all-12-plugins boot (PHASE-1C §S13)
│  │  ├─ PluginRegistry.ts             L7 — plugin descriptor registry (ADR-0021)
│  │  └─ index.ts                      L7 — public re-exports
│  └─ __tests__/dual-mode-parity.test.ts  — hello-cube / pryzm2=1 round-trip
├─ headless/                   Node CLI (entry: bin/headless.js → src/cli.ts)
│  ├─ src/
│  │  ├─ cli.ts                        L7 — argv → command dispatch
│  │  ├─ commands/{newProject,addWall,addSlab,exportPryzm}.ts
│  │  └─ index.ts                      L7 — re-exports
│  ├─ .dependency-cruiser.cjs          — forbids THREE / DOM imports (K1-B static)
│  └─ __tests__/headless-node.test.ts  — K1-B dynamic guard (require.cache audit)
├─ bench/                      Node benchmark runner
│  ├─ src/
│  │  ├─ benches/{produce-wall,produce-slab,...,picking-latency,
│  │  │           idle-cpu,orbit-fps-walls,view-switch,
│  │  │           render-pass-cost,pack-unpack,...}.bench.ts
│  │  ├─ dashboard/{loader,coverage,render,build,index,types}.ts  PHASE-1C §S17
│  │  └─ demos/                        — runnable demo entry points
│  ├─ reports/                         — per-milestone baselines (S08, S09, S10,
│  │                                     M6-1B, M9-1C, M12-alpha, produce-*)
│  └─ __tests__/dashboard/             — coverage-audit unit tests
├─ cli/                        Stand-alone CLI helpers (separate from headless)
├─ sync-server/                Linearisation server (PHASE-2A §S22, ADR-0019)
│  └─ src/                             — read-only stub today
├─ bake-worker/                Tile bake worker (PHASE-1D §S20)
└─ (future) ml-svc/            ML inference service (PHASE-3, ADR-024)
```

**Why this shape**: `apps/editor` is the only browser surface; `apps/headless`
is the only Node surface that exercises the kernel; both *consume* the
same `packages/` and `plugins/` — no parallel implementations.

---

## §3 `packages/` — kernel libraries (L0 → L6)

Layered strictly — a lower-numbered layer may not import a
higher-numbered one. Enforced by `eslint-plugin-boundaries` config in
`eslint.config.js`.

```
packages/
├─ protocol/             L0 — re-exports schemas + branded ids (1 src file)
├─ schemas/              L1 — Zod schemas: 20 element types (Wall, Slab, ...,
│                            Project, Sheet, Schedule, Furniture, ...) +
│                            SCHEMA_REGISTRY (PHASE-1A §S03)
├─ types-builtin/        L1 — built-in type catalogues (window types, door types,
│                            wall layer functions, etc.)
├─ stores/               L2 — Store, SelectionStore, ActiveViewStore, CubeStore;
│                            single-channel mutation contract (ADR-0001/0002)
├─ command-bus/          L3 — CommandBus, UndoStack, PatchEmitter, CascadeRunner,
│                            produceCommand, otel surface (ADR-0012)
├─ frame-scheduler/      L4 — priority+dirty-bit scheduler + IdleContinuation
│                            + WorkerPool (ADR-0003, ADR-0006)
├─ scene-committer/      L5 — primitive committer interface + MaterialPool
│                            + GeometryPool (ADR-0005)
├─ geometry-kernel/      L5 — 12 element producers (wall, slab, door, window,
│                            roof, curtainwall, grid, column, beam, stair,
│                            handrail, ceiling) + _internal/ + _shared/
│                            + runners/ (ADR-0009)
├─ picking/              L6 — GpuPickStrategy + BvhPickStrategy +
│                            PickStrategyResolver (ADR-0015)
├─ view-state/           L6 — ViewDefinition + ViewRegistry + ViewController
│                            + defaults (ADR-0016)
├─ renderer/             L6 — Renderer + CameraController + IdleAccumulator
│                            + passes/{Bloom,TRAA,SSGI,ClearPass,MeshPass,Pipeline}
│                            (ADR-0014)
├─ render-runtime/       L6 — runtime glue between renderer and editor host
├─ file-format/          L6 — `.pryzm` v1 zip pack/unpack (ADR-0018)
├─ persistence-client/   L6 — event-log persistence + chunk loader
│                            (ADR-0020 tier-streamed loader)
├─ storage-driver/       L6 — pluggable storage backends (FS, IndexedDB, S3)
└─ legacy-shim/          —    — strangler boundary; one fixture file
                              `raf.bad.ts` for the no-raf lint rule
```

**Layer-crossing convention**: every source file's docblock cites the
spec line that justified it (e.g. `bootstrap.render.ts` cites
`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S06-T7 (line 583)`). New
files should preserve this.

**No external 3D libs in L0–L5.** THREE.js may only be imported by L6
(`renderer`, `render-runtime`) and by L7 (`editor`); the
`no-three-in-kernel` ESLint rule blocks L0–L5 imports of `three` or
`three/*`.

---

## §4 `plugins/` — element-family plugins (L7)

Every element family follows the **same seven-file skeleton** the wall
plugin established in PHASE-1B, with a `PluginDescriptor` (ADR-0021)
exported as the canonical entry point:

```
plugins/<family>/
├─ src/
│  ├─ index.ts                    — PluginDescriptor + barrel exports
│  ├─ store.ts                    — <Family>Store (extends Store<Element>)
│  ├─ intent.ts                   — <Family>IntentResolver (priority table)
│  ├─ tool.ts                     — <Family>Tool (sketch/place gestures)
│  ├─ errors.ts                   — typed error subclasses
│  ├─ handlers/
│  │  ├─ Create<Family>.ts
│  │  ├─ Delete<Family>.ts
│  │  ├─ Move<Family>.ts          (or family-specific transforms)
│  │  ├─ Set<Family><Property>.ts (one per mutable property)
│  │  └─ index.ts                 — buildHandlerSet({stores, ...})
│  └─ committer/
│     ├─ <family>-committer.ts    — descriptor → THREE Mesh
│     ├─ geometry-bridge.ts       — producer-output → BufferGeometry
│     ├─ material-bridge.ts       — material descriptor → Material via MaterialPool
│     └─ index.ts                 — barrel
└─ __tests__/                     — Vitest unit + integration suites
```

| Plugin           | Handlers | Parity fixtures | Notes                                    |
|------------------|---------:|----------------:|------------------------------------------|
| `wall`           |       15 |              30 | Reference impl; 28 src files             |
| `door`           |        5 |              16 | Includes accessible-wide F16             |
| `window`         |        4 |              12 | Single + grid + bay variants             |
| `slab`           |        7 |              18 | Slab→wall coupling consumer              |
| `roof`           |       11 |              20 | AddSkylight / RemoveSkylight / JoinRoofs |
| `curtain-wall`   |       12 |              25 | Heaviest operator surface (panels+grid)  |
| `stair`          |        8 |              10 | Stair→handrail coupling consumer         |
| `handrail`       |        5 |               6 | Coupled cascade producer                 |
| `ceiling`        |        3 |               6 | Cascades from slab                       |
| `column`         |        4 |               6 | Structural elements                      |
| `beam`           |        4 |               6 | Structural elements                      |
| `grid`           |        3 |               8 | Layout / annotation grid                 |
| `view`           |        5 |             n/a | View state plugin (ADR-0016)             |
| `selection`      |        — |             n/a | Selection committers + dev handle        |
| `cross`          |        — |             n/a | Cross-element coupling rules             |
| `toy-cube`       |        2 |             n/a | Hello-cube demo (PHASE-1A §S05)          |
|                  |          |   **= 163**     | Total parity fixtures (1C exit budget)   |

**Adding a new family**: copy `plugins/wall/` → `plugins/<new>/`,
rename, register the descriptor in `PluginRegistry.ts`, and add a row
to `bootstrap.everything.ts`. ADR-0021 codifies this contract.

---

## §5 `tests/` — cross-package suites

```
tests/
├─ ci/                        — environment-level invariants (no-empty fixtures, etc.)
│  └─ parity-non-empty.test.ts        — blocks regression where a family empties
├─ fixtures/                  — shared fixtures across families (currently sparse)
├─ integration/               — full-stack scenarios crossing 2+ packages
│  ├─ all-12-elements.test.ts          — every plugin loads + commits
│  ├─ headless-vs-browser-parity.test.ts  — 12 fams × 3 fixtures = 36 cases
│  ├─ view-state-2a-readiness.test.ts  — view-switch + motion suppression
│  └─ vitest.config.ts                 — `*.test.ts` only (rename `.spec.ts` → `.test.ts`)
├─ parity/                    — disk-snapshotted producer parity (12 families)
│  ├─ <family>/
│  │  ├─ configs/                      — DTO inputs (one JSON per fixture)
│  │  ├─ snapshots/                    — expected descriptor hashes/buffers
│  │  └─ <family>-snapshot.test.ts     — driver (refresh via *_SNAPSHOT_REFRESH=1)
│  └─ wall/
│     ├─ wall-headless-node.test.ts    — K1-B kernel-purity for wall path
│     └─ wall-snapshot.test.ts         — driver + exporter
└─ <root>.spec.test.ts        — five regression-drift tests with double-suffix
                                naming (intentional — they predate the
                                vitest.config in tests/integration/ and
                                run via `npm test` at root). Candidate
                                for a follow-up rename round to drop the
                                `.spec.test.ts` double-suffix.
```

**Naming rule going forward** (proposed): use `*.test.ts` everywhere.
Reserve `*.spec.ts` for any future Playwright suites (none today).

---

## §6 `tools/` — build-time helpers

```
tools/
└─ eslint-plugin-pryzm/
   └─ src/
      ├─ index.js                 — plugin export (5 rules)
      └─ rules/
         ├─ no-raf.js                                  — fixture: raf.bad.ts
         ├─ no-three-in-kernel.js                      — L0–L5 guard
         ├─ no-three-outside-committer.js              — committer-only THREE
         ├─ affected-stores-required.js                — handler contract
         └─ pryzm-store-single-channel.js              — single-channel writes
```

All five rules from PHASE-1A §S04 are present. Future tooling
(codegen, lint plugins, schema-diff) lands here.

---

## §7 `scripts/` — Node scripts

```
scripts/
├─ check-project-isolation.mjs     — pre-build guard (no cross-project leak)
├─ check-storage-isolation.mjs     — pre-build guard (storage drivers)
├─ check-regression.mjs            — bench regression gate consumer
├─ scan-logs.js                    — log scanner
└─ <future runners>                — anything that needs a `node bin` entrypoint
```

Scripts are invoked from `package.json` `scripts:` and from
`.github/workflows/`. They do not import application code beyond
their declared CLI surface.

---

## §8 `docs/` — documentation

```
docs/
├─ archive/pryzm3-internal/               — strategic & architectural truth
│  ├─ 00-AUDIT.md                     — entry-point audit
│  ├─ 01-TARGET-ARCHITECTURE.md       — target diagram + invariants
│  ├─ 02-ORCHESTRATION.md             — agent / sprint orchestration
│  ├─ 03-PASCAL-EDITOR-ANALYSIS.md    — editor design rationale
│  ├─ 04-PRODUCTION-PARITY.md         — PRYZM 1 ↔ PRYZM 2 parity table
│  ├─ 05-IMPLEMENTATION-PLAN.md       — superseded by 10-MASTER + phases/
│  ├─ 06-PRYZM-IDENTITY-AND-RECOUNT.md — authority-order rules
│  ├─ 07-EXECUTION-PLAYBOOK.md        — sprint-cycle playbook
│  ├─ 08-VISION.md                    — north-star vision
│  ├─ 09-AS-IS-VS-TO-BE.md            — gap analysis
│  ├─ 10-MASTER-IMPLEMENTATION-PLAN-36M.md  — 36-month plan (M1–M36)
│  ├─ ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md   ← this file
│  ├─ CONFLICT-ANALYSIS.md            — authority order when sources disagree
│  ├─ Context.md                      — running context for new contributors
│  ├─ CRITICAL-REVIEW-2026-04-27.md   — peer review snapshot
│  ├─ PROCESS-TRACKER.md              — per-sprint tracker
│  ├─ README.md                       — entry-point
│  ├─ adrs/                           — strategic ADRs (ADR-001..ADR-024)
│  ├─ phases/                         — phase docs (1A, 1B, 1C, 1D, 2A, 2B, 2C, 3)
│  ├─ audits/                         — phase audits (1B, 1-FULL, 1-COMPLETION-PLAN, 1-RE-AUDIT)
│  └─ specs/                          — file-format / wire-format specs
├─ architecture/                      — handover docs (one per concern)
│  ├─ adr/                            — code-level ADRs (0001..0021)
│  ├─ camera.md                       — camera model + controls
│  ├─ command-bus.md                  — bus contract
│  ├─ element-coupling.md             — cross-element coupling rules
│  ├─ element-recipe.md               — copy-paste recipe for a new family
│  ├─ frame-scheduler.md              — priority + idle continuation
│  ├─ headless.md                     — K1-B contract + CLI surface
│  ├─ parity-fixtures.md              — fixture authoring guide
│  ├─ persistence.md / persistence-design.md  — event log design
│  ├─ picking.md                      — pick strategy resolver
│  ├─ renderer.md                     — pass pipeline + idle budget
│  ├─ scene-committer.md              — committer contract
│  ├─ schemas.md                      — schema registry
│  ├─ selection.md                    — SelectionStore contract
│  ├─ bench-harness.md                — bench harness usage
│  └─ <other handover docs>
├─ demos/                             — milestone demo scripts
│  ├─ README.md                       — index + recording status
│  ├─ M9-1C-headless.script.md        — Phase 1C exit demo
│  └─ M12-alpha.script.md             — Phase 1D alpha gate demo
├─ sprints/                           — sprint retros (S07-retro, S18-retro, ...)
└─ file-format/                       — `.pryzm` v1 spec + samples
```

**Authority order** when two docs disagree (codified in
`CONFLICT-ANALYSIS.md`):

`06-PRYZM-IDENTITY-AND-RECOUNT.md` > `08-VISION.md` >
`10-MASTER-IMPLEMENTATION-PLAN-36M.md` > phase docs > everything else.

---

## §9 `apps/bench/reports/` — bench baselines

| Report                          | Owner                | Purpose                                |
|---------------------------------|----------------------|----------------------------------------|
| `S08-baseline.md`               | PHASE-1B §S08        | Wall handler baselines                 |
| `S09-baseline.md`               | PHASE-1B §S09        | Wall renderer baselines                |
| `S10-baseline.md`               | PHASE-1B §S10        | Wall S10 handler set baselines         |
| `M6-1B-baseline.md`             | PHASE-1B §M6 exit    | 1B exit baseline                       |
| `M9-1C-baseline.md`             | PHASE-1C §M9 exit    | 1C exit dashboard (18 prim + 5 orch)   |
| `M12-alpha.md`                  | PHASE-1D §M12 exit   | Alpha-gate dashboard (table-row mode)  |
| `produce-<family>-baseline.md`  | per family           | Per-family producer baseline           |

The dashboard at `apps/bench/src/dashboard/` parses both the table-row
mode (`M12-alpha.md`) and the section-block mode (`## bench: <name>`,
all others), tolerates the "Bench file" column with backtick-wrapped
paths, and normalises stems via `toStem()`.

---

## §10 `docs/02-decisions/adrs/` — code-level ADRs

| #   | File                                                | Owner phase |
|-----|-----------------------------------------------------|-------------|
| 0001 | typed-id-brand-strategy.md                         | 1A          |
| 0002 | command-handler-signature.md                       | 1A          |
| 0003 | frame-scheduler-priority-vs-deadline.md            | 1A          |
| 0004 | messagepack-codec-choice.md                        | 1A          |
| 0005 | primitive-committer-interface.md                   | 1A          |
| 0006 | idle-continuation-budget.md                        | 1A          |
| 0007 | webgpu-webgl2-dual-mode.md                         | 1A          |
| 0008 | wall-handler-triage.md                             | 1B          |
| 0009 | producer-pure-function-signature.md                | 1B          |
| 0010 | slab-handler-triage.md                             | 1B          |
| 0011 | curtain-wall-triage-and-producer-split.md          | 1B          |
| 0012 | cross-element-cascade-rule-registration.md         | 1B          |
| 0013 | intent-resolver.md                                 | 1B          |
| 0014 | traa-ssgi-idle-budget.md                           | 1C          |
| 0015 | picking-strategy.md                                | 1C          |
| 0016 | view-state-command-driven.md                       | 1C          |
| 0017 | headless-package-surface.md                        | 1C          |
| 0018 | pryzm-zip-format-v1.md                             | 1D          |
| 0019 | sync-server-linearisation.md                       | 1D / 2A     |
| 0020 | tier-streamed-loader.md                            | 1D          |
| 0021 | plugin-descriptor-bootstrap-everything.md          | 1C-closure  |

**Numbering rule**: monotonic, never reused. The 1B spec referenced an
ADR-0014 ("persistence-snapshot threshold") that was folded elsewhere
before the file was written; 1C re-used the slot for
`traa-ssgi-idle-budget.md`. Both decisions stand; the dropped ADR is
informational only.

---

## §11 What is **not** in this proposal

The following live tree entries are PRYZM 1 surface (legacy) or
infrastructure (Replit / db) and are out of scope for the architecture
breakdown:

- `client/`, `editor/`, `src/`, `public/`, `screenshots/`,
  `server.js`, `server/`, `Canvas2D` — PRYZM 1; ring-fenced behind
  `?pryzm2=0`.
- `node_modules/`, `dist/`, `.cache/`, `.git/`, `tsconfig.tsbuildinfo`,
  `package-lock.json` — build / VCS artefacts.
- `replit.md`, `.replit`, `.upm/`, `.config/`, `.local/`, `.canvas/`,
  `.agents/` — Replit infra.
- `attached_assets/` — user uploads; never imported by app code.

If a future PR needs to add a new top-level directory, it must (a) cite
the spec line that motivated it and (b) add a row to this document.

---

## §12 Conformance verdict (live tree, 2026-04-27)

| Layer / area                               | Live tree       | Proposal | Verdict    |
|--------------------------------------------|-----------------|---------:|------------|
| `apps/` (editor + headless + bench + cli + sync-server + bake-worker) | 6 apps | 6      | ✅ |
| `packages/` (16 kernel libraries L0–L6)    | 16              |     16   | ✅ |
| `plugins/` (12 element families + cross + selection + view + toy-cube) | 16 | 16      | ✅ |
| `tools/eslint-plugin-pryzm` (5 rules)      | 5               |      5   | ✅ |
| `tests/parity/` (12 families, 163 fixtures total) | 163       |    163   | ✅ |
| `tests/integration/` (3 suites)            | 3               |      3   | ✅ |
| `tests/ci/` (parity-non-empty)             | 1               |      1   | ✅ |
| `apps/bench/reports/` (7 milestone reports + 12 producer baselines) | 19 | 19  | ✅ |
| `apps/bench/src/dashboard/` (6 modules)    | 6               |      6   | ✅ |
| `docs/02-decisions/adrs/` (21 code-level ADRs) | 21           |     21   | ✅ |
| `docs/03-execution/plans/legacy/phases/` (8 phase docs + audits) | 9+5  |  9+5   | ✅ |
| `docs/05-guides/developer/demos/` (script + README, no .mp4)   | script + README |  script  | ✅ (link-out) |
| Legacy PRYZM 1 roots (`client/`, `editor/`, `src/`, `server.js`, ...) | present | ring-fenced | ⚠ deferred to 2A §S26 |
| `tests/*.spec.test.ts` double-suffix       | 5 files         | rename to `*.test.ts` | ⚠ housekeeping |

**Verdict overall**: GREEN for everything in §1–§11. Two housekeeping
items (legacy ring-fence sunset, double-suffix rename) are tracked but
non-blocking for the 1C → 1D handoff.

---

*End of file-structure breakdown.*
