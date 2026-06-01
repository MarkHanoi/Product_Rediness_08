# PHASE-3B PRE-WORK — Pryzm Family Creator: Full Rewrite Plan

| Field | Value |
|---|---|
| Status | Approved for execution — design-of-record |
| Version | 1.0 |
| Date | 2026-04-28 |
| Owner | Founder + Architecture lead |
| Predecessor | `PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` (closed) |
| Successor | `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` (kicks off after this rewrite lands at S52 close) |
| Related | `SPEC-FAMILY-EDITOR.md`, `SPEC-05-TYPE-CATALOG.md`, `SPEC-26-PRYZM-FILE-FORMAT.md`, `SPEC-48-CONSTRAINT-SOLVER.md`, `SPEC-09-PLUGIN-SDK.md`, `ADR-014`, `ADR-017`, `ADR-024`, `ADR-026`, `ADR-027`, `ADR-028`, `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` |
| Replaces | All of `src/component-editor/**` (8 files, 1,176 LoC) and `src/ui/component-editor/**` (8 files, ~547 LoC) — 1,723 LoC of prototype code is deleted before any rewrite work begins. |
| Cost posture | Expensive on purpose. No shortcuts. Build it once, build it right. |
| Post-S59 review | A deep, honest review of this plan AND the implementation it produced is recorded at [`audits/PHASE-3B-FAMILY-CREATOR-DEEP-REVIEW-2026-04-28.md`](../audits/PHASE-3B-FAMILY-CREATOR-DEEP-REVIEW-2026-04-28.md). The review supersedes the per-sprint audit blocks under §19 and reframes the §22.1 carry-forward list. **Read the deep review before starting S60.** |

---

## §0 One-line summary

Delete the existing weak prototype, then rebuild the Family Creator from the ground up as a standalone vanilla-TypeScript SPA living at `apps/component-editor/`, sitting on top of the same 8-layer architecture every other PRYZM 2 surface uses (Stores → Command Bus → Persistence → Kernel → Solver → Committer → Renderer → Chrome) and producing a deterministic, byte-stable `.pryzm-family` artefact that the main editor and the marketplace can both consume.

---

## §1 Why the existing prototype must go

### §1.1 Inventory of what exists today (M27)

```
src/component-editor/
├── ComponentEditor.ts             78 LoC   — bootstrap, mounts workspace, attaches tools
├── types.ts                      132 LoC   — local document types (duplicates SPEC-05)
├── tools/
│  ├── DimensionTool.ts            81 LoC
│  ├── ParameterBindingSystem.ts   77 LoC
│  ├── SketchTool.ts               67 LoC
│  ├── SketchToolEnhanced.ts      185 LoC
│  └── UndoManager.ts              28 LoC
└── workspace/
   └── EditorWorkspace.ts         528 LoC   — single class: scene, raycaster, render loop, tool dispatch, hardcoded extrude

src/ui/component-editor/
├── ApplicationMenu.ts
├── ElementTree.ts
├── ProjectBrowser.ts
├── PropertiesPalette.ts
├── StatusBar.ts
├── Ribbon/{Ribbon,CreateTab}.ts  165 + 209 LoC
└── ViewControls/ViewControls.ts  173 LoC
```

Total: **16 files, ~1,723 LoC**, all destined for deletion.

### §1.2 What is wrong with it (root-cause list, not symptoms)

| # | Defect | Evidence | Architectural rule violated |
|---|---|---|---|
| 1 | Uses `(window as any)` for cross-module state | `EditorWorkspace.ts:42, 188, 301`; `ComponentEditor.ts:55` | Rule P6 — no `window`-mounted globals |
| 2 | Workspace owns its own `requestAnimationFrame` loop instead of joining the global frame scheduler | `EditorWorkspace.ts:114-138` | Rule P3 — single `rafScheduler` per app |
| 3 | Tools mutate the document directly, bypassing the command bus | `SketchToolEnhanced.ts:88, 142`; `DimensionTool.ts:37` | Rule P4 — every mutation through `@pryzm/command-bus` |
| 4 | `UndoManager.ts` is a 28-line in-memory stack, **not** the project undo bus — undo here cannot be reconciled with main-editor undo | `UndoManager.ts` whole file | Rule P4 + ADR-014 (batch undo) |
| 5 | Geometry is a hardcoded `Box(width × depth × height)` — no real extrude / sweep / revolve, no profile concept | `EditorWorkspace.ts:367-401` | Spec-FAMILY-EDITOR §4.4 (the entire 3D op model) |
| 6 | No constraint solver wired in. The "MockSolver" import is commented out. Sketch points float free. | `SketchToolEnhanced.ts:11` (commented import) | SPEC-48, ADR-024 |
| 7 | Document types are duplicated locally (`types.ts:7-118`) instead of imported from `packages/file-format/` | `types.ts` whole file | DRY + SPEC-26 single source of truth |
| 8 | No persistence wiring — `Save` writes to `localStorage` as a single JSON blob, no event log, no migration story | `ComponentEditor.ts:62-71` | Rule P7 + SPEC-02 |
| 9 | THREE.js is imported by tools, ribbon code, and view controls — committer boundary is shattered | `ViewControls.ts:4`; `SketchToolEnhanced.ts:6`; `Ribbon.ts:9` | Rule P2 — only `*Committer.ts` may import THREE |
| 10 | No OTel spans anywhere in the editor | search `pryzm.component.*` returns 0 hits in this dir | Rule P8 + SPEC-10 |
| 11 | UI uses ad-hoc `innerHTML` strings with no escaping; `ElementTree.ts:34` interpolates user-typed names directly | `ElementTree.ts:30-38`; `PropertiesPalette.ts:62` | XSS class — security baseline ADR-021 |
| 12 | No keyboard shortcut layer; no focus management; no a11y at all | grep `aria-` returns 0 | SPEC-FAMILY-EDITOR §9 (a11y), GA gate |
| 13 | "Load into project" emits a raw DOM event the main editor listens for via `window.addEventListener`. No type-safe contract. | `ComponentEditor.ts:55` | Rule P4 + ADR-028 (authority unification) |
| 14 | No tests. Zero. | `find . -name '*component-editor*' -path '*test*'` → empty | SPEC-11 baseline |
| 15 | No code-splitting boundary — the editor's entire surface area, including THREE, is currently top-level imported by `src/main.ts` | `src/main.ts` lazy-import audit fails | K3-A enforcer (covers it next sprint) |
| 16 | Ribbon `CreateTab.ts` mixes panel layout with tool activation logic; ~50% of the file is ad-hoc DOM | `CreateTab.ts:30-180` | ADR-026 (vanilla-TS, but with the prescribed `bind()` helpers) |
| 17 | Application menu uses a hardcoded list of file paths in `~/Desktop/...` style — Linux-only assumption | `ApplicationMenu.ts:18-29` | Cross-platform baseline |
| 18 | Status bar polls `setInterval` every 250 ms instead of subscribing to store deltas | `StatusBar.ts:14-22` | Rule P3 + perf budget |

### §1.3 Why patching is not on the table

Every defect in the list above is **structural**, not cosmetic. Fixing them in place would touch every line of every file at least once, change the public surface of every class, rewrite the data model, change the directory location, and still leave a single 528-line god-class (`EditorWorkspace.ts`) at the centre. The cost of "fix in place" is bigger than the cost of a clean rebuild on the architecture we already have working for the wall, door, window, floor, roof, level, grid, room, schedule, sheet, and view-template surfaces. We rebuild.

---

## §2 Removal plan (Sprint 0, day 1 of S52)

### §2.1 Order of operations

1. Tag the current main with `pre-family-creator-rewrite-2026-04-28` so the prototype stays diff-able from the new code.
2. Open a single PR, **`feat(family-creator): remove prototype, scaffold apps/component-editor`**, that:
   - Deletes every file listed in §1.1.
   - Removes the `src/component-editor` and `src/ui/component-editor` lines from `src/main.ts`.
   - Strips the `window.addEventListener('component-editor-load', …)` listener in `src/main.ts`.
   - Adds an empty `apps/component-editor/` package with the layout in §4 and a "coming soon" splash screen so the `File → New Family…` menu does not regress to a broken link.
   - Updates `tsconfig.json`, `pnpm-workspace.yaml`, and the root `package.json` `scripts.dev` to include the new app.
   - Updates `replit.md` (project map).
3. Run the full CI matrix; merging requires green on `pryzm-vi-parity`, `pryzm-persistence`, `bake-worker-test-geometry`, `constraint-solver-snapshot`, `pdf-classification-accuracy`, `pdf-stage3-pure`, plus a new `family-editor-bundle-budget` gate (see §13).

### §2.2 Migration of anything worth saving

Audit result of `src/component-editor/` and `src/ui/component-editor/` for code worth porting:

| Asset | Verdict | Destination |
|---|---|---|
| Domain templates list (`Door`, `Window`, `Furniture`, …) hardcoded in `CreateTab.ts:40-78` | Salvage as a JSON catalogue | `apps/component-editor/src/domain-templates/index.ts` |
| Cursor SVGs in `ViewControls/cursors/` | Salvage as static assets | `apps/component-editor/public/cursors/` |
| Reference plane axis math (`EditorWorkspace.ts:202-260`) | Re-derive in `packages/geometry-kernel/src/sketch/reference-plane.ts` (pure, testable) | n/a — rewrite from scratch, smaller and tested |
| Anything else | Discard | n/a |

Net code carried over: zero source files, ~30 lines of constants, ~6 SVGs.

---

## §3 Where the rewrite lives

### §3.1 Workspace position

```
pryzm/                              monorepo root
├─ apps/
│  ├─ editor/                       main 3D editor (existing)
│  ├─ bake-worker/                  geometry oven (existing)
│  ├─ ai-worker/                    AI inference + PDF stages (existing)
│  ├─ marketplace-web/              browse / publish (Phase 3C)
│  └─ component-editor/             ◄── NEW: the Family Creator SPA
│
├─ packages/
│  ├─ geometry-kernel/              pure descriptors — gains sketch + extrude/sweep/loft/revolve
│  ├─ constraint-solver/            mock today; gains real planegcs porter at S52 D1
│  ├─ command-bus/                  shared command/event bus
│  ├─ stores/                       shared store primitives (immer + patches)
│  ├─ persistence-client/           event-log writer
│  ├─ sync-crdt/                    Yjs binding (not used by family editor in v1)
│  ├─ file-format/                  ◄── gains `.pryzm-family` v1 schema, reader, writer
│  ├─ family-runtime/               ◄── NEW: shared between editor + bake-worker for resolving family params
│  ├─ types-builtin/                system families (existing)
│  ├─ schemas/                      Zod schemas for commands, events
│  └─ ui-primitives/                ◄── NEW: vanilla-TS form widgets shared by editor + family creator
│
├─ plugins/                         element-family plugins (existing)
└─ tools/                           build & ci scripts
```

### §3.2 `apps/component-editor/` skeleton

```
apps/component-editor/
├─ package.json                       — pnpm workspace member, depends on @pryzm/* packages
├─ vite.config.ts                    — Vite SPA build, treeshaken THREE, route-split
├─ tsconfig.json                    — extends root, strict mode, project references
├─ index.html                        — single page, mounts <main id="app"/>
├─ public/
│  ├─ cursors/                       — SVG cursors for sketch tools
│  └─ icons/                         — toolbar icons (SVG sprite)
├─ src/
│  ├─ index.ts                       — entry (≤ 30 LoC; constructs the app shell)
│  ├─ app/
│  │  ├─ AppShell.ts                 — layout host (no business logic)
│  │  ├─ routes.ts                   — `?file=…` deep-link, marketplace handoff
│  │  └─ hotkeys.ts                  — global shortcuts (`Ctrl+S`, `Esc`, etc.)
│  ├─ stores/
│  │  ├─ familyDocumentStore.ts      — single L1 store for the open family document
│  │  ├─ sketchSelectionStore.ts     — UI-only ephemeral selection
│  │  ├─ activeToolStore.ts          — current sketch tool id
│  │  └─ viewTabStore.ts             — Ref Level / 3D / Front / Side
│  ├─ commands/
│  │  ├─ profile/                    — addLine, addArc, deleteEntity, etc.
│  │  ├─ constraint/                 — addCoincident, addDistance, etc.
│  │  ├─ parameter/                  — addParameter, bindToConstraint, etc.
│  │  ├─ solid/                      — extrude, sweep, loft, revolve, boolean
│  │  ├─ type/                       — addType, renameType, deleteType
│  │  └─ index.ts                    — registry; binds to @pryzm/command-bus
│  ├─ tools/                         — sketch tool implementations (one file each)
│  │  ├─ ToolBase.ts
│  │  ├─ LineTool.ts
│  │  ├─ ArcTool.ts
│  │  ├─ RectangleTool.ts
│  │  ├─ CircleTool.ts
│  │  ├─ FilletTool.ts
│  │  ├─ TrimTool.ts
│  │  ├─ DimensionTool.ts            — emits a constraint-add command
│  │  └─ SelectTool.ts
│  ├─ committers/
│  │  ├─ SketchCanvasCommitter.ts    — sketch entities → 2D Canvas2D / SVG
│  │  ├─ PreviewCommitter.ts         — descriptor → THREE.BufferGeometry (3D preview)
│  │  └─ index.ts                    — registers with the global SceneCommitter
│  ├─ panels/
│  │  ├─ Ribbon.ts                   — top ribbon
│  │  ├─ ProjectBrowser.ts           — tree of profiles / solids / types
│  │  ├─ ParameterTable.ts           — full parametric table (S55)
│  │  ├─ TypeCatalog.ts              — list of types in this family
│  │  ├─ MaterialSlots.ts            — slot binding
│  │  ├─ IfcMapping.ts               — Pset / property mapping
│  │  ├─ Inspector.ts                — selection-driven property inspector
│  │  ├─ ViewTabs.ts                 — Ref Level / 3D / Front / Side
│  │  ├─ StatusBar.ts                — solver status, dirty flag, units
│  │  └─ ApplicationMenu.ts          — file / publish menus
│  ├─ ai/
│  │  ├─ aiHostBridge.ts             — connects to L7.5 AI host (ADR-014)
│  │  └─ approvalQueue.ts            — pending AI batches
│  ├─ persistence/
│  │  ├─ eventLogWriter.ts           — patch stream → event log
│  │  └─ familyFileSaver.ts          — event log → `.pryzm-family` artefact
│  ├─ marketplace/
│  │  ├─ publishFlow.ts              — S59 publish dialog
│  │  └─ signing.ts                  — HMAC author signing
│  └─ a11y/
│     ├─ focusRing.ts                — visible focus management
│     └─ liveRegion.ts               — solver status announcements
├─ __tests__/                         — Vitest, Node-only (DOM via jsdom where unavoidable)
│  ├─ commands/                       — every command: pre/post invariants
│  ├─ committers/                     — pure descriptor → expected mesh assertions
│  ├─ persistence/                    — round-trip determinism
│  ├─ a11y/                           — keyboard-only flow assertions
│  └─ snapshot/                       — sketch + extrude golden snapshots
└─ e2e/                                — Playwright, full author journey (≤ 6 specs)
```

Hard ceilings, enforced in CI:

- No file in `apps/component-editor/src/**` may exceed **300 LoC**.
- No file other than `committers/*Committer.ts` may import from `three`.
- No file may reference `window.<anything>` outside of `app/hotkeys.ts` and `app/AppShell.ts`.
- No file may import React, Vue, or Svelte. ESLint rule `pryzm/no-react-runtime` extended to this app at S52 close.

---

## §4 Architecture mapping (8 layers, applied here)

The Family Creator is not a special snowflake. It uses every PRYZM 2 layer the main editor uses:

| Layer | Component in the Family Creator | Owning code | Tested by |
|---|---|---|---|
| L0 — Schemas | `FamilyDocument`, `SketchEntity`, `Constraint`, `SolidFeature`, `FamilyParameter`, `FamilyType`, all command schemas | `packages/file-format/src/family-schema.ts`, `packages/schemas/src/commands/family.ts` | Zod parse/serialise tests |
| L1 — Stores | `familyDocumentStore` + 3 ephemeral UI stores | `apps/component-editor/src/stores/**` | `__tests__/stores/*` |
| L2 — Command bus | All mutations: ~40 commands across `commands/{profile,constraint,parameter,solid,type}/` | `apps/component-editor/src/commands/**` + `@pryzm/command-bus` | `__tests__/commands/*` |
| L3 — Persistence | Event-log writer + `.pryzm-family` packer/unpacker | `apps/component-editor/src/persistence/**`, `packages/file-format/src/family-{reader,writer}.ts` | `family-round-trip` gate |
| L4 — Geometry kernel | Pure sketch helpers + `produceExtrude / produceSweep / produceLoft / produceRevolve` | `packages/geometry-kernel/src/sketch/**`, `packages/geometry-kernel/src/producers/{extrude,sweep,loft,revolve}.ts` | `bake-worker-test-geometry` gate |
| L4.5 — Solver | Real `planegcs` WASM behind `SketchSolverPorter` | `packages/constraint-solver/src/{engine,planegcs-porter}.ts` | `constraint-solver-snapshot`, `constraint-solver-perf` |
| L5 — Committer | `SketchCanvasCommitter` (2D), `PreviewCommitter` (3D) | `apps/component-editor/src/committers/**` | committer parity tests |
| L6 — Renderer | Single global `rafScheduler` from `@pryzm/scheduler`; the family preview registers a frame producer | reuses `apps/editor/src/renderer/` | shared with main editor |
| L7 — Chrome | Ribbon, panels, dialogs | `apps/component-editor/src/panels/**` | a11y + e2e tests |
| L7.5 — AI | Bridge into the L7.5 AI host with the family editor's tool registry | `apps/component-editor/src/ai/aiHostBridge.ts` | replays from S54 batch-undo |
| L8 — OTel | Spans `pryzm.family.<verb>` for every command, plus `pryzm.solver.solve`, `pryzm.committer.preview-update` | `@pryzm/otel` decorators on every command handler | OTel smoke test |

### §4.1 Architectural rules — restated for this app

- **P1** Geometry kernel stays pure (Node-runnable, no THREE, no DOM). The `bake-worker-test-geometry` gate already enforces this for walls/doors; we extend it to extrude, sweep, loft, revolve.
- **P2** Only `*Committer.ts` files may import from `three`. ESLint rule `pryzm/three-only-in-committers`.
- **P3** A single `rafScheduler` instance per app. The family editor uses the one in `@pryzm/scheduler`; no `requestAnimationFrame` calls anywhere in the source tree.
- **P4** Every state mutation goes through `@pryzm/command-bus.executeCommand(...)`. Direct `store.setState` calls are forbidden in `apps/component-editor/src/`.
- **P5** ESLint `pryzm/layer-boundaries` rule: a file in `panels/**` may import from `commands/**` (to dispatch) but not from `committers/**`; a file in `committers/**` may import from `geometry-kernel` and `three` only; etc.
- **P6** No `(window as any)`. No `globalThis`-mounted state. The dev-time inspect bridge lives behind `if (import.meta.env.DEV)` in one file.
- **P7** Persistence is event-log first; file format is a deterministic projection of the event log.
- **P8** Every command handler is wrapped in `withSpan('pryzm.family.<verb>', …)`.

---

## §5 Data model — `.pryzm-family` v1, complete

### §5.1 Top-level shape

The format combines two prior drafts (`SPEC-FAMILY-EDITOR §5` JSON sketch + `PHASE-3A §6.2` ZIP layout). The reconciled, **canonical** layout for v1:

```
foo.pryzm-family               (deflate-compressed ZIP, .zip-conformant)
├─ manifest.json               (FamilyManifestSchema — name, id, version, ifcEntity, hashes)
├─ document.json               (FamilyDocumentSchema — profiles, constraints, solids, parameters, types, materialSlots, refPlanes)
├─ event-log.ndjson            (ordered patch stream; reproduces document.json deterministically)
├─ ifc-mapping.json            (psets, quantities, predefined types — one logical block, separate file for diff-friendliness)
├─ thumbnail.webp              (256×256, generated on save)
├─ icon.svg                    (24×24 outline, generated on save)
└─ signing/
   ├─ schema-hash              (sha256 of canonicalised document.json + ifc-mapping.json)
   └─ signature                 (HMAC, present once published)
```

### §5.2 `FamilyManifestSchema` (Zod)

```ts
export const FamilyManifestSchema = z.object({
  formatVersion: z.literal('1.0'),
  id: z.string().regex(/^fam_[0-9A-HJKMNP-TV-Z]{26}$/),  // ULID
  name: z.string().min(1).max(120),
  semver: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  author: z.object({ id: z.string(), displayName: z.string() }),
  description: z.string().max(2_000).optional(),
  ifcEntity: z.enum([
    'IfcDoor','IfcWindow','IfcFurniture','IfcFurnishingElement',
    'IfcBuildingElementProxy','IfcPlate','IfcMember',
    'IfcDistributionElement','IfcFlowTerminal','IfcLightFixture',
    'IfcSanitaryTerminal',
  ]),
  category: z.enum(['Door','Window','Furniture','Casework','Fixture','Lighting','Plumbing','Generic']),
  tags: z.array(z.string()).max(32).default([]),
  minPRYZMVersion: z.string().default('2.0.0'),
  schemaHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  createdAt: z.string().datetime(),
  lastModifiedAt: z.string().datetime(),
});
```

### §5.3 `FamilyDocumentSchema` (Zod, abbreviated; full schema lives in `packages/file-format/src/family-schema.ts`)

```
{
  referencePlanes: ReferencePlane[]
  parameters:      FamilyParameter[]
  profiles:        Profile[]            // each with entities + constraints
  solids:          SolidFeature[]       // extrude/sweep/loft/revolve, references profile ids
  materialSlots:   MaterialSlot[]
  types:           FamilyType[]         // ≥ 1 required
  defaults:        Record<string, unknown>
}
```

Every id is a ULID. Every list field is order-stable. Every key in a record is sorted lexically by the canonical writer (so file diff output is stable).

### §5.4 Determinism contract

A round-trip is **byte-exact** if and only if every one of the following holds:

1. JSON is canonicalised (RFC 8785 JSON Canonicalization Scheme).
2. ZIP entry order is alphabetical and entry mtimes are zeroed.
3. DEFLATE compression level is fixed at 9 with the `nodebuffer` writer's deterministic dictionary state.
4. NDJSON line order matches the event log's logical ordering.

The `family-round-trip` gate writes a 50-document corpus, hashes the bytes, re-reads, re-writes, and asserts hash equality.

### §5.5 Versioning & migrations

- `formatVersion` is bumped only on a breaking schema change.
- For every breaking change, a migrator function in `packages/file-format/src/family-migrations/v<from>-to-v<to>.ts` lifts the old document into the new shape.
- The reader supports the current version + one prior. Older documents are migrated lazily on load and saved in the new format.
- The migrator suite is its own snapshot test (`__tests__/family-migrations/`).

---

## §6 Constraint solver — wiring real planegcs

### §6.1 Porter contract (already in `packages/constraint-solver/src/types.ts`, refined)

```ts
export interface SketchSolverPorter {
  solve(problem: SolverProblem): Promise<SolverResult>;
  diagnose(problem: SolverProblem): Promise<SolverDiagnosis>;
  dispose(): void;
}

export interface SolverProblem {
  entities: SketchEntity[];        // points, lines, arcs, circles, splines
  constraints: ResolvedConstraint[]; // dimensional exprs already evaluated to numbers
  parameters: Record<string, number>;// for diagnostic messages only
}

export type SolverResult =
  | { kind: 'solved';            positions: Map<string, [number, number]>; iterations: number; }
  | { kind: 'over-constrained';  conflicting: string[]; }    // constraint ids
  | { kind: 'under-constrained'; freeDof: number; };
```

### §6.2 Implementations

| Implementation | When used | Where |
|---|---|---|
| `MockSolver` | Tests, deterministic snapshots | `packages/constraint-solver/src/mock.ts` (exists today) |
| `PlanegcsSolverPorter` | Browser runtime | `packages/constraint-solver/src/planegcs-porter.ts` (NEW at S52 D1) |
| `PlanegcsNodePorter` | Bake-worker tests, AI worker | `packages/constraint-solver/src/planegcs-node-porter.ts` (NEW at S52 D2) |

The browser porter loads the WASM via `import('planegcs/dist/planegcs.wasm?url')` so Vite emits a hashed asset; the Node porter uses `fs.readFileSync` against the package-relative path. Both share the same `solve(problem)` adapter that flattens our `SolverProblem` into planegcs's API.

### §6.3 Solver loop in the editor

For every command in `commands/profile/**` and `commands/constraint/**`, the handler:

```
1. Apply optimistic patches to a draft store snapshot.
2. Build the SolverProblem from the new state.
3. Evaluate every dimensional expression against the current parameter values
   (uses the expression evaluator from §7.3).
4. Call porter.solve(problem).
5. Branch:
   solved             → commit patches + write resolved positions + emit OTel span.
   over-constrained   → reject command; bus surfaces typed CommandBusError;
                        chrome paints the conflicting constraints red.
   under-constrained  → commit patches; chrome paints free DOFs yellow.
6. Increment a per-edit "solver invocation" counter (visible in StatusBar).
```

Solver calls are debounced inside the command handler at 8 ms (≈ 60 fps headroom). Commands that arrive while a solve is in flight queue with last-write-wins semantics on identical entity sets.

### §6.4 Performance

The `constraint-solver-perf` gate (added at S52) enforces:

- 50-constraint sketch resolves in **< 16 ms** (warm WASM, P95 over 200 runs).
- 200-constraint sketch resolves in **< 100 ms**.
- 1,000-constraint adversarial sketch resolves or returns `over-constrained` in **< 1 s**.

Failure to meet a target blocks the gate; tuning is allowed (planegcs has parameters), rewriting the porter is not.

---

## §7 Geometry kernel — sketch + 3D ops

### §7.1 Pure-Node guarantee

Every new file added to `packages/geometry-kernel/src/` for this work runs in Node with **zero** DOM, BOM, or THREE dependencies. The `bake-worker-test-geometry` gate covers it. Outputs are descriptors (typed POJOs); converting a descriptor to `THREE.BufferGeometry` is the committer's job, never the kernel's.

### §7.2 Sketch primitives (NEW)

```
packages/geometry-kernel/src/sketch/
├─ reference-plane.ts       — plane construction, projection helpers
├─ entities.ts              — Point, Line, Arc, Circle, Spline data types
├─ topology.ts              — closed-loop detection, profile orientation
└─ tessellate.ts            — polyline approximation of arcs/splines
```

### §7.3 3D operations (NEW, all pure)

```
packages/geometry-kernel/src/producers/
├─ extrude.ts               — produceExtrude(profile, lengthMm, dir)
├─ sweep.ts                 — produceSweep(profile, pathProfile, options)
├─ loft.ts                  — produceLoft(profiles[], guides[], options)
├─ revolve.ts               — produceRevolve(profile, axis, sweepDeg)
└─ boolean.ts               — produceBoolean(a, b, op)        — manifold-3d port
```

All return a `BufferGeometryDescriptor` (`{ positions, normals, uvs, indices, materialBindings }`) — same shape `produceWall` already returns.

### §7.4 Boolean implementation

Booleans use `manifold-3d` (WASM) — already pinned in PRYZM 1; we reuse the package. Boolean correctness has its own snapshot suite of 30 adversarial pairs.

### §7.5 Expression DSL & evaluator (`@pryzm/family-runtime`)

```
packages/family-runtime/src/
├─ expression/
│  ├─ tokenizer.ts
│  ├─ parser.ts             — produces an AST; ADR-027
│  ├─ evaluator.ts          — pure, sandboxed; no global access, no I/O
│  ├─ functions.ts          — min, max, if, sin, cos, sqrt, abs, round
│  └─ unit-coercion.ts      — auto-coerce mm ↔ m where a length parameter is used
├─ resolution/
│  └─ resolveParameter.ts   — instance > type > family default > expression
└─ index.ts
```

Used by:
- The editor (when solving).
- The bake-worker (when baking instances).
- The AI worker (when validating AI-proposed parameter values).

This is the single source of truth — never reimplemented elsewhere.

---

## §8 Commands — the full surface

Forty commands, one file per command, ≤ 60 LoC each. Grouped:

### §8.1 `commands/profile/`
- `addLine`, `addArc`, `addCircle`, `addRectangle`, `addSpline`
- `movePoint`, `deleteEntity`, `splitAtPoint`, `joinEntities`
- `convertToReference` (turn a sketch entity into a reference)

### §8.2 `commands/constraint/`
- `addCoincident`, `addParallel`, `addPerpendicular`, `addEqualLength`
- `addHorizontal`, `addVertical`, `addTangent`
- `addDistance`, `addRadius`, `addAngle`, `addDiameter`, `addDistancePointLine`
- `bindParameterToConstraint`, `unbindParameter`, `deleteConstraint`

### §8.3 `commands/parameter/`
- `addParameter`, `deleteParameter`, `renameParameter`
- `setParameterDefault`, `setParameterExpression`, `setParameterIfcMapping`
- `markParameterExposed`

### §8.4 `commands/solid/`
- `extrudeProfile`, `sweepProfile`, `loftProfiles`, `revolveProfile`
- `booleanCombine`, `setSolidLodVisibility`, `setSolidMaterialSlot`
- `deleteSolid`

### §8.5 `commands/type/`
- `addType`, `cloneType`, `renameType`, `deleteType`
- `setTypeParameterValue`

### §8.6 `commands/material/`
- `addMaterialSlot`, `renameMaterialSlot`, `deleteMaterialSlot`
- `setMaterialSlotDefaultCategory`

### §8.7 Command contract template

```ts
export const addLineCommand = defineCommand({
  kind: 'family.profile.addLine',
  schema: z.object({
    profileId: z.string(),
    startPointId: z.string().optional(),  // if absent, also creates a Point
    endPointId:   z.string().optional(),
    startPosition: Vec2.optional(),
    endPosition:   Vec2.optional(),
  }),
  handler: withSpan('pryzm.family.addLine', async (input, ctx) => {
    // 1. validate
    // 2. produce immer patches
    // 3. solve (per §6.3)
    // 4. return patches + emitted events
  }),
});
```

Every command is round-trippable through the event log: re-applying the recorded input rebuilds the exact same document state. This is enforced by `__tests__/commands/replay.test.ts`.

---

## §9 Sketch canvas + tools

### §9.1 Canvas

A single `<canvas>` per profile view, drawn by `SketchCanvasCommitter`. Coordinates are in mm (sketch space), with a CSS-pixel viewport transform owned by the committer. Hit-testing is bucketed by a 4-level quadtree refreshed on patch.

### §9.2 Tool dispatch

`activeToolStore.activeToolId` selects which tool receives pointer events. Every tool implements:

```ts
interface SketchTool {
  readonly id: string;
  readonly cursor: string;                // CSS cursor name or URL
  onPointerDown(e: PointerEvent, ctx: ToolContext): void;
  onPointerMove(e: PointerEvent, ctx: ToolContext): void;
  onPointerUp  (e: PointerEvent, ctx: ToolContext): void;
  onKey        (e: KeyboardEvent, ctx: ToolContext): void;
  cancel(): void;
}
```

`ToolContext` exposes the command bus, the active profile id, the current snap targets, and the CSS-to-mm transform. Tools never touch the store directly.

### §9.3 Snapping

A `SnapEngine` (`apps/component-editor/src/tools/snap.ts`, ≤ 200 LoC) returns ranked snap candidates: endpoint, midpoint, perpendicular, intersection, on-curve, grid. The engine is pure and tested independently of any tool.

### §9.4 Inferences

When the user draws a line approximately horizontal, the LineTool emits an `addHorizontal` constraint on commit. Inferences are configurable in user prefs and visualised with a faint blue glyph at the inference site. The inference set for v1 is the smallest useful one: horizontal, vertical, perpendicular-to-existing, midpoint, equal-length-to-last.

---

## §10 Parameter table (S55)

### §10.1 UI

The table is a single panel with:
- Add / delete / reorder rows.
- Per-row editors: name, kind (type / instance), data type, default, expression, unit, exposed?, IFC mapping.
- A "bind to constraint" mode that highlights every dimension constraint in the active sketch and lets the user click to bind.
- A live evaluator strip beside each expression cell (red if invalid).

### §10.2 Validation

- Names are unique within the family and match `^[A-Za-z][A-Za-z0-9_ ]{0,63}$`.
- Expressions parse and evaluate against the current type's parameter map; cyclic references are caught at edit time, not save time.
- IFC mapping `psetName` + `propertyName` is validated against the IFC4 vocabulary embedded in `packages/file-format/src/ifc-vocab.ts`.

### §10.3 Performance

The table renders 1,000 rows without virtualization in a worst-case author corpus; in practice we cap warnings at 500 rows.

---

## §11 Types & instances

### §11.1 Types panel

A list with a "Duplicate" button (the most common user flow: create one type, duplicate, change a few parameter values). Every type carries a checksum so the writer can detect dirty types deterministically.

### §11.2 Instance contract

When the main editor places an instance of a family, it dispatches a normal command (`door.create`, `window.create`, `furniture.create`, etc.). The command handler:

1. Looks up the family by id.
2. Looks up the type within the family.
3. Resolves every parameter via `resolveParameter` (instance > type > default > expression).
4. Runs the solver to resolve the sketch with the resolved values.
5. Calls `produceExtrude / Sweep / …` to build descriptors.
6. Emits the descriptors as `BufferGeometryDescriptor`s for the bake-worker to cache.

This is the same path the wall plugin takes today — a placed family is just a parametric element with a non-built-in producer.

---

## §12 Material slots & LOD

### §12.1 Slots

Every solid declares one `materialSlot` (or null for a "raw" geometry pass). At placement time, the consumer can override which project material fills each slot — without re-authoring the family.

### §12.2 LOD bitmask

Every solid has `{ coarse, medium, fine }`. The committer asks the active view's LOD policy (already implemented for the main editor) which mask bit applies and culls solids that do not match. The default for a freshly created solid is `{ false, true, true }` — visible in medium and fine, hidden in coarse plan-from-far-away views.

---

## §13 CI gates added by this rewrite

| Gate | Owning sprint | Pass condition |
|---|---|---|
| `family-editor-bundle-budget` | S52 D1 | `apps/component-editor` first-paint chunk ≤ 180 KB gzip; THREE-using chunk loaded only after `viewTabStore.viewTab === '3d'` |
| `family-editor-no-react`     | S52 D2 | ESLint `pryzm/no-react-runtime` clean across `apps/component-editor/**` |
| `family-editor-no-three-leak`| S52 D2 | Only `*Committer.ts` files import `three` |
| `family-editor-no-window`    | S52 D3 | No `(window as any)` or `globalThis.<x>` outside `app/AppShell.ts` and `app/hotkeys.ts` |
| `family-editor-300-loc-cap`  | S52 D3 | No source file > 300 LoC |
| `constraint-solver-snapshot` | already exists; covers extrude/sweep/loft/revolve sketches at S52 close | 50 canonical sketches match SHA-pinned output |
| `constraint-solver-perf`     | S52 close | per §6.4 |
| `family-round-trip`          | S55 close | 50-document corpus byte-exact across pack→unpack→repack |
| `family-migration`           | S55 close | every migrator round-trips a fixture |
| `family-bake-pure-node`      | S55 close | `produceExtrude/Sweep/Loft/Revolve` and `resolveParameter` run in Node without DOM/THREE |
| `family-a11y`                | S58 close | axe-core scan: zero serious or critical issues across every panel |
| `family-e2e-author-flow`     | S58 close | Playwright: full door author journey green |
| `family-marketplace-publish` | S59 close | publish flow round-trips a signed file |
| `family-load-into-project`   | S58 close | place 200 instances of a 3-type family on a project, swap to v2, all re-bake |

The first six are blocking gates from the moment the rewrite scaffolds. The rest land sprint-by-sprint.

---

## §14 OTel spans

| Span | What it measures | Sprint |
|---|---|---|
| `pryzm.family.openDocument`           | Open + parse + zod | S52 |
| `pryzm.family.command.<verb>`         | Every command handler (auto-decorated) | S52 |
| `pryzm.family.solver.solve`           | Solve invocation incl. expression eval | S52 |
| `pryzm.family.solver.diagnose`        | Diagnostic invocation | S52 |
| `pryzm.family.preview-update`         | Descriptor → BufferGeometry on the 3D tab | S52 |
| `pryzm.family.sketch-canvas-update`   | 2D canvas redraw | S52 |
| `pryzm.family.parameter.evaluate`     | Single expression evaluation | S55 |
| `pryzm.family.persistence.save`       | Event log → `.pryzm-family` write | S55 |
| `pryzm.family.persistence.load`       | `.pryzm-family` read → store | S55 |
| `pryzm.family.bake.resolveType`       | Resolve a type at bake time | S55 |
| `pryzm.family.ai.batchExecute`        | AI batch issued from the family editor | S58 |
| `pryzm.family.marketplace.publish`    | Sign + upload | S59 |

Every span carries `family.id`, `family.semver`, `family.profileCount`, `family.solidCount`, `family.parameterCount`, `family.typeCount` as attributes.

---

## §15 Performance budgets

| Metric | Target | Owning sprint |
|---|---|---|
| First paint of `apps/component-editor` (cold) | < 1.5 s on a 4× CPU throttled M1-class device | S52 |
| Sketch interaction frame budget | < 8 ms per frame at 60 fps | S52 |
| Solver: 50-constraint sketch | < 16 ms warm, P95 over 200 runs | S52 |
| Solver: 200-constraint sketch | < 100 ms warm, P95 | S52 |
| `produceExtrude` for a 50-vertex profile | < 1 ms | S52 |
| `produceSweep` for a 50-vertex profile and a 30-segment path | < 5 ms | S52 |
| `produceLoft` (3 profiles × 50 vertices) | < 8 ms | S52 |
| `produceRevolve` (50-vertex profile, 64 segments) | < 4 ms | S52 |
| `.pryzm-family` save (small family) | < 250 ms | S55 |
| `.pryzm-family` load (small family) | < 200 ms cold; < 50 ms warm | S55 |
| Full bake of 200 instances of a family | < 8 s in bake-worker | S58 |
| Memory ceiling for the editor on a 100-profile family | < 250 MB resident | S58 |

Every budget is asserted in CI on a tracked benchmarking corpus; regressions fail the build.

---

## §16 AI integration (L7.5 host)

### §16.1 Tool registry

The Family Creator exposes its command surface to the AI host as a set of typed tools (Zod-derived). The AI may call:

- Any read tool (`getProfile`, `listParameters`, `getType`).
- Any write tool, but writes go through the normal command bus and inherit batch-undo (ADR-014, S54).
- The AI **cannot** mutate the open `.pryzm-family` directly; every mutation produces a command that the user can preview in the approval queue.

### §16.2 Approval queue

Same component the main editor uses (`apps/editor/src/ai/approval-queue.ts`). Mounted into the family editor's right rail; visible only when a batch is pending.

### §16.3 Use cases unlocked

- "Generate a 60-mm-thick aluminium frame around this leaf profile" → AI emits a sequence of profile + extrude commands.
- "Add IFC pset bindings for `Pset_DoorCommon` with sensible defaults for FireRating and AcousticRating" → AI emits parameter + IFC mapping commands.
- "Create three more types: 800 mm, 900 mm, and 1000 mm wide" → AI emits cloneType + setTypeParameterValue commands.

---

## §17 Marketplace publish (S59)

### §17.1 Publish dialog

A modal that:
1. Validates the document (no invalid expressions, ≥ 1 type, every parameter has a default, schema hash computed).
2. Captures the thumbnail (off-screen render of the `IsPrimary` view at 256×256, `medium` LOD).
3. Captures the icon (extracted from a 24×24 SVG silhouette of the primary profile).
4. Asks for tags + a release note.
5. Computes the schema hash and HMAC-signs it with the author's marketplace key (managed by the existing OAuth-tied key vault — no new auth surface).
6. Uploads to `POST /v1/families` (route exists from S59 tasks).
7. On success, writes the signature back into the local file and shows the marketplace URL.

### §17.2 Server-side checks

The server re-runs schema validation, the round-trip determinism test, and a virus scan before accepting the upload. Rejection reasons surface back to the dialog as actionable messages.

---

## §18 Test pyramid

```
        ┌─────────┐
        │  e2e    │  ≤ 6 Playwright specs (S58)
        └─────────┘
       ┌───────────┐
       │  a11y     │   axe-core, every panel (S58)
       └───────────┘
      ┌─────────────┐
      │ persistence │  family-round-trip, migration (S55)
      └─────────────┘
     ┌───────────────┐
     │ committer +   │  geometry parity vs golden snapshots (S52→S55)
     │   solver      │  constraint-solver-snapshot + perf (S52)
     └───────────────┘
   ┌───────────────────┐
   │   command bus     │  every command's invariants + replay (S52→S58)
   └───────────────────┘
 ┌───────────────────────┐
 │  pure functions       │  expression eval, snap engine, topology (S52)
 └───────────────────────┘
```

Tests run in this order locally and in CI. Snapshot updates require an explicit `*_SNAPSHOT_REFRESH=1` env var.

### §18.1 Test inventory targets

| Layer | Min count by S58 close |
|---|---|
| Pure functions | 120 unit tests |
| Command handlers | 1 happy + ≥ 2 invariant tests per command (≈ 120 tests) |
| Solver porter | 50-sketch snapshot suite + 4 perf benchmarks |
| Geometry producers | 30-shape snapshot suite, per producer |
| Persistence | 50-document round-trip suite + 8 migrators |
| A11y | 1 axe scan per panel (≈ 12) |
| E2E | 6 specs covering the §2 author journey |

---

## §19 Sprint-by-sprint plan

The rewrite spans **S52 → S59** (8 sprints, ≈ 16 weeks). Each sprint has a single demo-able outcome.

### §19.1 S52 (Weeks 1–2) — Removal + scaffolding + real solver

**Demo:** Open the new app from `File → New Family…`, draw a constrained rectangle on the front reference plane, watch the solver re-solve in real time, save a (mostly empty) `.pryzm-family` file, reload it.

Deliverables:
- §2 removal PR merged.
- `apps/component-editor/` skeleton with AppShell, viewTabStore, sketch canvas, line tool, rectangle tool, snap engine.
- `PlanegcsSolverPorter` + `PlanegcsNodePorter` shipped.
- 5 first-class constraints wired (coincident-pp, parallel, perpendicular, distance, fixed).
- `produceExtrude` shipped (sweep / loft / revolve stubs land later in the sprint).
- All §13 D1–D3 gates green.
- `pryzm.family.command.*`, `pryzm.family.solver.solve`, `pryzm.family.preview-update` spans live.

> **AUDIT 2026-04-28 — S52 status: ~60% complete.**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | §2 removal PR merged | ✅ Done | `src/component-editor/` and `src/ui/component-editor/` are absent from the tree. |
> | 2 | `apps/component-editor/` skeleton (AppShell, viewTabStore, sketch canvas, line tool, rectangle tool, snap engine) | ✅ Done | `apps/component-editor/src/{app/AppShell.ts, stores/{sketchDocStore,viewTabStore}.ts, sketch/{SketchCanvas,sketchRender,snap,transform,entities}.ts, sketch/tools/{LineTool,RectangleTool,types}.ts}` all present. 1,061 LoC across 10 files, all under the 300-LoC cap. |
> | 3 | `PlanegcsSolverPorter` + `PlanegcsNodePorter` shipped | ⚠️ Partial — D1 scaffold only | `packages/constraint-solver/src/PlanegcsAdapter.ts` exposes the porter shape and validates `wasmUrl`, but every `solve()`/`diagnose()` call **still delegates to `MockSolver`**. The dedicated `planegcs-porter.ts` (browser, S52 D1) and `planegcs-node-porter.ts` (Node, S52 D2) files named in §6.2 do not exist; the npm `planegcs` package is not in `packages/constraint-solver/package.json`. D2 work is required before this row flips green. |
> | 4 | 5 first-class constraints wired | ⚠️ Partial — solver-side only | `MockSolver` in `packages/constraint-solver/src/engine.ts` handles all 5 kinds (`coincident-pp`, `parallel`, `perpendicular`, `distance-pp`, `fixed`) and is covered by `__tests__/engine.test.ts`. **However the family editor itself (`apps/component-editor/`) has no dependency on `@pryzm/constraint-solver`**, no `commands/constraint/` directory, and no UI/keyboard path to add a constraint. The constraints are reachable from tests but not from the user. |
> | 5 | `produceExtrude` shipped | ✅ Done (kernel-side) | `packages/geometry-kernel/src/producers/extrude.ts` is 360 LoC, pure-Node, ear-clipping cap triangulation, single material group, deterministic descriptor output. ⚠️ **No test file** — the spec at §13 expects `constraint-solver-snapshot` to cover extrude sketches at S52 close; `find packages/geometry-kernel -name '*extrude*.test.ts'` returns zero matches. |
> | 6 | All §13 D1–D3 gates green | ✅ Done | `apps/component-editor/__tests__/quality-gates/` has `loc-cap`, `no-react`, `no-three`, `no-window`, `bundle-budget`. The `family-editor-quality-gates` workflow is configured and runs them. |
> | 7 | `pryzm.family.command.*`, `pryzm.family.solver.solve`, `pryzm.family.preview-update` spans live | ❌ Not started | `rg 'pryzm\.family\.'` across `apps/component-editor`, `packages/constraint-solver`, `packages/geometry-kernel` returns **zero matches**. There is no family-editor command bus (`apps/component-editor/src/commands/` does not exist) and no OTel emitter wiring. |
>
> **What still blocks closing S52:** (a) constraint UI in the editor + dependency on `@pryzm/constraint-solver`; (b) extrude snapshot tests; (c) family-editor command bus + the three OTel span families; (d) real planegcs WASM swap (D2). Items (a)–(c) are pure-code work doable inside this monorepo; (d) requires the upstream `planegcs` npm package decision and is the single largest remaining S52 risk.

### §19.2 S53 (Weeks 3–4) — Sketcher canvas hardening + extrude/sweep/revolve

**Demo:** Draw a closed L-profile, extrude it, switch to 3D tab, see the extrusion. Sweep a circle along a polyline; revolve a half-profile around a vertical axis.

Deliverables:
- ArcTool, CircleTool, FilletTool, TrimTool, SelectTool with snapping + inference.
- `produceSweep`, `produceRevolve` shipped + snapshot tests.
- `produceLoft` shipped + snapshot tests (3-profile cases first; guides land at S55).
- `produceBoolean` (manifold-3d) shipped with 30-shape pair suite.
- Reference-plane creation + reorientation commands.
- Per-solid LOD bitmask wiring.
- Status bar shows live solver stats.

> **AUDIT 2026-04-28 — S53 status: ~5% complete (not started in earnest).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | ArcTool, CircleTool, FilletTool, TrimTool, SelectTool | ❌ Not started | `apps/component-editor/src/sketch/tools/` only contains `LineTool.ts`, `RectangleTool.ts`, `types.ts`. |
> | 2 | `produceSweep` + snapshot tests | ❌ Not started | No `packages/geometry-kernel/src/producers/sweep.ts`. |
> | 3 | `produceRevolve` + snapshot tests | ❌ Not started | No `packages/geometry-kernel/src/producers/revolve.ts`. |
> | 4 | `produceLoft` + snapshot tests | ❌ Not started | No `packages/geometry-kernel/src/producers/loft.ts`. |
> | 5 | `produceBoolean` (manifold-3d) + 30-shape pair suite | ⚠️ Partial pre-existing scaffold | `packages/geometry-kernel/src/csg/KernelCSG.ts` exists from S08 with the contract surface (`subtract`/`union`/`intersect`) and a documented intent to use `manifold-3d` lazily, but per its own header "the wall producer never imports this file" and the manifold-3d adapter has not been wired in. No `produceBoolean` named export, no 30-shape pair suite. |
> | 6 | Reference-plane creation + reorientation commands | ❌ Not started | `rg 'ReferencePlane\|reference-plane'` returns zero matches across `apps/component-editor` and `packages`. |
> | 7 | Per-solid LOD bitmask wiring | ❌ Not started | `rg 'lodBitmask\|LodBitmask\|LOD_'` returns zero matches in the family editor and kernel. |
> | 8 | Status bar shows live solver stats | ❌ Not started | No status-bar element in `apps/component-editor/src/app/AppShell.ts`; no status-bar source files. |
>
> **What still blocks closing S53:** essentially all of it. S53 cannot reasonably start until S52's editor-side integration (item 4 of §19.1, the constraints UI + command bus) is in place, because the new tools all depend on the same dispatch pattern the rectangle/line tools currently bypass.

### §19.3 S54 (Weeks 5–6) — AI integration + tool registry + batch undo

**Demo:** Issue an AI prompt "build a single-leaf flush door 900 × 2100 mm" and see the AI propose a batch of commands the user can preview, accept whole, reject whole, or accept-with-edits, with one undo button reverting the whole batch.

Deliverables:
- L7.5 AI host bridge + tool registry + approval queue mounted.
- ADR-014 batch-undo wired through the family editor's command bus.
- AI replay test corpus added (10 prompts → 10 expected command sequences).
- `pryzm.family.ai.batchExecute` span live.

> **AUDIT 2026-04-28 — S54 status: 0% complete (not started).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | L7.5 AI host bridge + tool registry + approval queue mounted in the family editor | ❌ Not started | `apps/component-editor/src/ai/` does not exist. The L7.5 host (`packages/ai-host/`) and `apps/ai-worker/` themselves exist from earlier phase work but have no consumer in the family editor. |
> | 2 | ADR-014 batch-undo wired through the family editor's command bus | ❌ Not started — and blocked | Depends on the family-editor command bus that S52 item 7 has not delivered. `rg 'batchExecute\|batch-undo\|BatchUndo'` returns zero matches in `apps/component-editor`. |
> | 3 | AI replay test corpus (10 prompts → 10 expected command sequences) | ❌ Not started | No `__tests__/ai-replay/` or equivalent fixture directory anywhere in the family editor or related packages. |
> | 4 | `pryzm.family.ai.batchExecute` span live | ❌ Not started | Subset of the same OTel gap noted under S52 item 7. |
>
> **What still blocks closing S54:** transitively blocked by the S52 command-bus deliverable. The L7.5 host is ready upstream, so the work here is a thin bridge once the command bus exists.

### §19.4 S55 (Weeks 7–8) — Parameter table + expression DSL + IFC binding

**Demo:** Author 6 parameters, bind 3 to sketch dimensions, give one a `Width / 2` expression, set IFC bindings to `Pset_DoorCommon`, define 3 types, save the file, reopen byte-identical.

Deliverables:
- `@pryzm/family-runtime` package shipped (expression DSL + resolver + unit coercion).
- `ParameterTable` panel, `TypeCatalog` panel, `IfcMapping` panel, `MaterialSlots` panel.
- `.pryzm-family` v1 reader + writer + Zod schema in `packages/file-format/`.
- `family-round-trip` gate green on a 50-document corpus.
- `family-migration` gate scaffolded (with the identity migrator).
- `family-bake-pure-node` gate green (covers `resolveParameter` and all 4 producers).
- `pryzm.family.parameter.evaluate`, `…persistence.save`, `…persistence.load`, `…bake.resolveType` spans live.

> **AUDIT 2026-04-28 — S55 status: 0% complete (not started). This is the single biggest remaining surface area in the rewrite.**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | `@pryzm/family-runtime` package shipped | ❌ Not started | `packages/family-runtime/` does not exist. The whole expression DSL, resolver, and SI/imperial unit-coercion table is missing. |
> | 2 | `ParameterTable`, `TypeCatalog`, `IfcMapping`, `MaterialSlots` panels | ❌ Not started | None of these strings appear in `apps/component-editor/src`. The 3D and Parameters tabs in `AppShell.ts` still render the labelled placeholder mentioned in its own header. |
> | 3 | `.pryzm-family` v1 reader + writer + Zod schema | ❌ Not started | `packages/file-format/src/` contains only the **project**-level `.pryzm` v1 plumbing (ADR-0018: `pack.ts`, `unpack.ts`, `migrations/index.ts`). There is no `family-schema.ts`, no `FamilyDocumentSchema`, and no family-level pack/unpack pair. The §5.2 `FamilyManifestSchema` Zod is documented in this plan but not realised in code. |
> | 4 | `family-round-trip` gate green on a 50-document corpus | ❌ Not started | No corpus directory; no workflow registered. |
> | 5 | `family-migration` gate scaffolded with the identity migrator | ❌ Not started | No `packages/file-format/src/family-migrations/` directory. |
> | 6 | `family-bake-pure-node` gate green (covers `resolveParameter` and all 4 producers) | ❌ Not started | `resolveParameter` does not exist (depends on @pryzm/family-runtime); only 1 of the 4 producers (`extrude`) is shipped. |
> | 7 | `pryzm.family.parameter.evaluate`, `…persistence.save`, `…persistence.load`, `…bake.resolveType` spans live | ❌ Not started | Same root cause as the S52 OTel gap. |
>
> **What still blocks closing S55:** the entire `@pryzm/family-runtime` package + the `.pryzm-family` v1 file-format work. Item 6 is also blocked by S53's missing producers. The plan flags `.pryzm-family` determinism as risk #2 (§20) — that risk is now active because the writer doesn't exist yet.

### §19.5 S56 (Weeks 9–10) — Main editor integration

**Demo:** In the main editor, `Insert → Family…`, pick the door file, place 50 instances on a level, override `Handing` per-instance, swap the type from "900 mm" to "1000 mm" on 12 of them, watch every instance re-bake.

Deliverables:
- `loadFamily(path)` in the main editor with caching by `(familyId, schemaHash)`.
- `door.create` / `window.create` / `furniture.create` etc. handlers updated to dispatch against loaded type ids.
- Bake-worker family-instance baking pipeline shipped (covered by the existing bake-worker test framework).
- `FamilyInstanceCommitter` in the main editor.
- Inspector shows exposed parameters per selected family instance.
- `family-load-into-project` gate green.

> **AUDIT 2026-04-28 — S56 status: 0% complete (not started, hard-blocked by S55).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | `loadFamily(path)` in the main editor with caching by `(familyId, schemaHash)` | ❌ Not started | `rg 'loadFamily'` across `apps` and `packages` returns zero matches. Cannot be implemented before S55 ships the `.pryzm-family` reader. |
> | 2 | `door.create` / `window.create` / `furniture.create` updated to dispatch against loaded type ids | ❌ Not started | Existing handlers in `plugins/wall`, `plugins/door`, `plugins/window` still use the legacy primitive-element pattern. |
> | 3 | Bake-worker family-instance baking pipeline | ❌ Not started — package missing | The `bake-worker-test-geometry` workflow exists but `apps/bake-worker/` has not been created yet (the workflow command itself prints "bake-worker tests not present (deferred)" when run). |
> | 4 | `FamilyInstanceCommitter` in the main editor | ❌ Not started | No matches. |
> | 5 | Inspector shows exposed parameters per selected family instance | ❌ Not started | No Inspector matches relevant to family parameters. |
> | 6 | `family-load-into-project` gate green | ❌ Not started | Gate not configured. |
>
> **What still blocks closing S56:** every item depends on S55's `.pryzm-family` v1 reader and `@pryzm/family-runtime` resolver. Item 3 also depends on the `apps/bake-worker/` package itself, which is still deferred.

### §19.6 S57 (Weeks 11–12) — Versioning, migration UX, performance hardening

**Demo:** Author publishes v1.0.0 → v1.1.0 of the door (renames `FrameThickness` → `Frame Depth` and adds a `HasGlazing` parameter). The main editor on next open prompts "12 instances reference an older version. Migrate?" → all instances migrate, all re-bake, no data lost.

Deliverables:
- Migration framework in `packages/file-format/src/family-migrations/`.
- Migration UX in the main editor.
- All §15 performance budgets met on the tracked benchmark corpus.
- Memory ceiling enforced.
- `family-migration` gate green on 8 migrators (rename, add, delete, type-change, expression-introduction, ifc-rebind, slot-merge, type-split).

> **AUDIT 2026-04-28 — S57 status: 0% complete (not started, hard-blocked by S55).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | Migration framework in `packages/file-format/src/family-migrations/` | ❌ Not started | Directory does not exist. The existing `packages/file-format/src/migrations/` is for the project-level `.pryzm` format only. |
> | 2 | Migration UX in the main editor | ❌ Not started | No "12 instances reference an older version" prompt or its container component. |
> | 3 | All §15 performance budgets met | ❌ Not measured | The §15 budgets (open ≤ 350 ms, solver ≤ 16 ms, preview ≤ 50 ms, save ≤ 250 ms, bake ≤ 80 ms p95, instance commit ≤ 8 ms p95) have no bench harness wired into CI. |
> | 4 | Memory ceiling enforced | ❌ Not measured | No memory-cap workflow or runtime guard. |
> | 5 | `family-migration` gate green on 8 migrators | ❌ Not started | Depends on item 1. |
>
> **What still blocks closing S57:** S55 must close first (file format + schema must exist before migrations have anything to migrate). Performance hardening (item 3) requires every producer + the family-runtime resolver to be in place to be measurable.

### §19.7 S58 (Weeks 13–14) — Standalone SPA + a11y + e2e

**Demo:** Open `apps/component-editor` directly (not from the main editor), pass a `?file=…` deep link, complete the entire author journey using only the keyboard, scan with axe-core → zero serious issues.

Deliverables:
- Vite SPA build of `apps/component-editor` deployed under its own subdomain `component.pryzm.app`.
- Deep-link route handler.
- Full keyboard nav across every panel (focus rings, skip-links, screen-reader live region for solver status).
- 6 Playwright specs green.
- `family-a11y` and `family-e2e-author-flow` gates green.
- Bundle-budget gate revisited: editor first-paint ≤ 180 KB gzip held.

> **AUDIT 2026-04-28 — S58 status: ~10% complete (only the bundle-budget gate exists in advance).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | Vite SPA build of `apps/component-editor` deployed under `component.pryzm.app` | ⚠️ Partial — builds, not deployed | `apps/component-editor/vite.config.ts` exists and `pnpm --filter @pryzm/component-editor build` produces `dist-gate/`. There is no separate deployment configuration or CNAME for the standalone subdomain. |
> | 2 | Deep-link route handler (`?file=…`) | ❌ Not started | No matches for `?file=` or `deepLink` in `apps/component-editor/src`. |
> | 3 | Full keyboard nav (focus rings, skip-links, screen-reader live region) | ❌ Not started | The current AppShell renders only tab buttons + a sketch canvas; no skip-links, no live regions, no focus-ring CSS. |
> | 4 | 6 Playwright specs green | ❌ Not started | `apps/component-editor/e2e/` does not exist; Playwright is not in `devDependencies`. |
> | 5 | `family-a11y` and `family-e2e-author-flow` gates green | ❌ Not started | Neither workflow registered. `axe-core` is not in `devDependencies`. |
> | 6 | Bundle-budget gate held at ≤ 180 KB gzip first-paint | ✅ Already enforced (D1) | The `family-editor-bundle-budget` gate has been live since S52 D1 (`apps/component-editor/__tests__/quality-gates/bundle-budget.test.ts`). |
>
> **What still blocks closing S58:** transitively blocked by S52–S57. The a11y + Playwright + deploy work is shallow once the panels actually exist.

### §19.8 S59 (Weeks 15–16) — Marketplace publish + Phase 3B exit

**Demo:** Author hits "Publish to marketplace", file is signed, uploaded, indexed, and visible at `marketplace.pryzm.app/families/<id>`. A consumer downloads it from the marketplace, places instances, and the round-trip works end-to-end.

Deliverables:
- Publish dialog + signing.
- `POST /v1/families` route + storage backend.
- Server-side validation (schema, round-trip, virus scan).
- Marketplace landing page (browse / search / detail / download). Lives in `apps/marketplace-web/`.
- `family-marketplace-publish` gate green.
- All Phase-3B exit criteria from `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` met.

> **AUDIT 2026-04-28 — S59 status: 0% complete (not started, hard-blocked by S52–S58).**
>
> | # | Deliverable | Status | Evidence |
> |---|---|---|---|
> | 1 | Publish dialog + signing | ❌ Not started | No `apps/component-editor/src/marketplace/publishFlow.ts`; no signing primitives. |
> | 2 | `POST /v1/families` route + storage backend | ❌ Not started | No marketplace server routes. |
> | 3 | Server-side validation (schema, round-trip, virus scan) | ❌ Not started | Depends on S55 schema. |
> | 4 | Marketplace landing page in `apps/marketplace-web/` | ❌ Not started | `apps/marketplace-web/` does not exist. |
> | 5 | `family-marketplace-publish` gate green | ❌ Not started | Gate not configured. |
> | 6 | All Phase-3B exit criteria met (per `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`) | ❌ Not started | The successor phase doc itself has not been worked yet (it assumes the family creator is shipped). |
>
> **What still blocks closing S59:** every prior sprint. Per the plan §20 risk #10, dropping the marketplace UI to "Phase 3C" is the documented descope path if S52–S58 overrun.
>
> ---
>
> ### Audit 2026-04-28 — overall rewrite status
>
> | Sprint | Topic | Status | Approx % |
> |---|---|---|---|
> | S52 | Removal + scaffolding + real solver | 🟡 Partial | ~60% |
> | S53 | Sketcher hardening + extrude/sweep/revolve | 🔴 Not started | ~5% |
> | S54 | AI integration + tool registry + batch undo | 🔴 Not started | 0% |
> | S55 | Parameter table + expression DSL + IFC binding + `.pryzm-family` v1 | 🔴 Not started | 0% |
> | S56 | Main editor integration | 🔴 Not started | 0% |
> | S57 | Versioning, migration UX, perf hardening | 🔴 Not started | 0% |
> | S58 | Standalone SPA + a11y + e2e | 🔴 Not started | ~10% (bundle gate only) |
> | S59 | Marketplace publish + Phase 3B exit | 🔴 Not started | 0% |
>
> **Bottom line.** Of the 8 sprints in this rewrite, S52 is meaningfully underway and the other 7 are essentially un-started. The fastest unblocking move is to finish S52's command-bus + constraint-UI items (§19.1 rows 4 and 7), because S54, S55, S57, and S58 all sit downstream of that one piece.

---

## §20 Risks & mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | planegcs WASM is heavier or slower than budgeted | Solver perf gate fails | Pre-test in S52 D1 with the 200-constraint reference sketch; if it fails, fall back to sympy-style numeric solver via `casadi-wasm` (already audited as backup at SPEC-48 §6). Decision is reversible via the porter contract. |
| 2 | `.pryzm-family` determinism is harder than expected (Node ZIP libs differ) | round-trip gate flakes | Ship a tiny custom DEFLATE-safe ZIP writer (`packages/file-format/src/zip-deterministic.ts`). The PRYZM 1 codebase already has a draft we can lift. |
| 3 | Booleans (manifold-3d) introduce non-determinism on different CPUs | snapshot tests flake | Pin manifold-3d via package-lock + capture a CPU-feature manifest; if flake persists, switch to a topological (non-floating) representation for boolean snapshots only. |
| 4 | Bundle budget for the editor is missed once Three is in scope | first-paint > 180 KB | Three loads only when the user clicks the 3D tab; verified by a route-split gate (see §13). |
| 5 | The expression DSL is too restrictive for real authors | Author dissatisfaction at S55 demo | Track the exact expressions authors try and bounce — the parser will log unsupported tokens behind `import.meta.env.DEV` and we add them at S57 if they show up. |
| 6 | Migration framework underestimates real schema churn | Files stop loading after v1 → v2 | Force every PR that touches `family-schema.ts` to include a migrator + a fixture in CI; gate enforces it. |
| 7 | Author keys (signing) leak | Marketplace integrity broken | Keys are server-issued, scoped, and revocable; never stored in the editor's localStorage. The signing payload is just the schema hash, so even a leaked key cannot impersonate a different family. |
| 8 | A11y debt accumulates during S52–S57 | S58 a11y gate too big to fix in one sprint | Lint rule enforces `aria-` attributes on every interactive element from S52; axe scan runs nightly from S52, not from S58. |
| 9 | Main editor regression when removing the prototype | `File → New Family…` breaks | The §2 PR ships a "coming soon" splash; e2e smoke test on the menu item runs from PR-1 onward. |
| 10 | Phase 3B sprint overruns by > 1 week | Schedule slip into Phase 3C | We descope §19.8 marketplace polish (browse/search) into Phase 3C — publishing is in scope, the marketplace UI is partially in scope, the full marketplace experience is not the gate for Phase 3B exit. |

---

## §21 Out of scope (v1 guardrails)

Restated for clarity, with the same rationale as `SPEC-FAMILY-EDITOR §8`:

- Scripted families (Python / JS in the family file). Phase 4.
- Nesting depth > 2. Phase 4.
- Structural-analytical model authoring. Phase 5+.
- MEP fittings with flow direction. Phase 4.
- Site / planting families. Phase 4.
- Real-time collaborative family editing. Never in v1.
- Custom unit systems beyond the SI/imperial pair shipped in `@pryzm/family-runtime/unit-coercion.ts`. Phase 4.
- Family validation rules with custom error messages (the equivalent of Revit's "shared parameter" validation). Phase 3D, Q4.

If a feature isn't in §19 explicitly, it isn't shipping in this rewrite. Scope creep here costs Phase 3C directly.

---

## §22 Done means

The rewrite is complete (and Phase 3B is unblocked) when **every** statement below is true:

1. `src/component-editor/**` and `src/ui/component-editor/**` no longer exist; `git log` shows the deletion in the §2 PR.
2. `apps/component-editor/` is a stand-alone Vite SPA, builds, runs, deploys.
3. Every CI gate in §13 is green and is part of the protected branch policy.
4. Every performance budget in §15 is met on the tracked corpus.
5. A user can complete the §2 author journey end-to-end in ≤ 10 minutes.
6. Save → reload yields a byte-identical `.pryzm-family` for every document in the 50-document corpus.
7. 200 instances of a 3-type family place, override, swap-type, and re-bake without errors.
8. The main editor's first-paint bundle does not contain any code from `apps/component-editor/` (K3-A enforcer extended).
9. `axe-core` shows zero serious or critical accessibility issues across every panel.
10. `marketplace.pryzm.app/families/<id>` serves a published file end-to-end.
11. `replit.md`, `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md`, and `SPEC-FAMILY-EDITOR.md` are updated to reflect the as-built state.
12. A 3-paragraph "what shipped" note is appended to `PROCESS-TRACKER.md` per the project convention.

---

## §22.1 Phase 3-B exit audit (S52 → S59)

*Authored 2026-04-28 at S59 close. Status legend: ✅ = met, ◐ = met-with-deferred-followup carried into S60, ⏳ = deferred to S60 hardening sprint.*

> **REVIEWED 2026-04-28 (post-S59).** A deep review supersedes this table's framing. See [`audits/PHASE-3B-FAMILY-CREATOR-DEEP-REVIEW-2026-04-28.md`](../audits/PHASE-3B-FAMILY-CREATOR-DEEP-REVIEW-2026-04-28.md) for the honest UI-reachability gap, the Revit family-level capability matrix, and the revised S60 priority list. The review's bottom line: 4 ✅ / 7 ◐ / 1 ⏳ is correct at the file-existence level but the wired-into-UI surface is roughly 5 % of a Revit family editor. **Read the review before planning S60.**

| # | Done-means clause | Status | Evidence in repo | Carry-forward owner |
|---|---|---|---|---|
| 1 | `src/component-editor/**` and `src/ui/component-editor/**` deleted | ✅ | S52 §2 removal PR — confirmed by `git log` and the absence of those paths in HEAD; PROCESS-TRACKER §11 S52 row | — |
| 2 | `apps/component-editor/` is a stand-alone Vite SPA, builds, runs, deploys | ◐ | `apps/component-editor/{vite.config.ts, src/index.ts, src/app/AppShell.ts}` — dev build green via the editor's vitest harness; production deploy hand-off (custom domain + Cloudflare Pages wiring) deferred to S60 because the Replit workflow ceiling at 14/10 prevents adding the SPA dev-server workflow | S60 deploy-hardening |
| 3 | Every CI gate in §13 is green and on the protected branch | ◐ | Gates LANDED + green: `family-editor-quality-gates` (LoC ≤300 / no-three / no-react / no-window / a11y / bundle-budget = 17/17 tests), `family-migration` (20/20 from S57), `family-a11y` (7/7 from S58), `family-marketplace-publish` (7/7 from S59 — workflow row deferred per 14/10 ceiling, runnable manually via `cd tests/family-marketplace-publish && npx vitest run`) | S60 — register gate in workflows after consolidation |
| 4 | Every performance budget in §15 is met on the tracked corpus | ◐ | `family-editor-bundle-budget` test confirms first-paint chunk ≤ 180 KB gzip and excludes the THREE chunk (S52 D1 gate, still green at S59); `tests/family-load-into-project` proves 200-instance bake stays under the 256 MB heap ceiling (S56 carry); 50-document fixture-corpus expansion of `family-round-trip` deferred from S56→S57→S58→S59 | S60 — corpus expansion |
| 5 | A user can complete the §2 author journey end-to-end in ≤ 10 minutes | ⏳ | Sketch + Constraint + Inspector + Type/Parameter + Pack/Sign + Publish surfaces all in code at S59; full scripted author-journey timing study with real users deferred | S60 — UX timing study |
| 6 | Save → reload byte-identical for every doc in the 50-document corpus | ◐ | Byte-determinism property verified for both unsigned and signed packs by `family-round-trip.test.ts` (5/5) + new `family-signature.test.ts` (5/5) including byte-stable manifest+document+event-log across two signed packs of identical input; corpus currently 5 fixtures, expansion to 50 deferred | S60 — corpus expansion |
| 7 | 200 instances of a 3-type family place, override, swap-type, re-bake | ✅ | `tests/family-load-into-project/__tests__/family-load-into-project.test.ts` (S56) — 200 instances × 3 types × 3 override sets = 9 unique chunk hashes, no errors thrown, descriptor count = 200, heap stays under 256 MB | — |
| 8 | Main editor's first-paint bundle contains zero code from `apps/component-editor/` | ✅ | `family-editor-bundle-budget` quality gate enforces and is green at S59; K3-A enforcer extended in S52 D1 to flag any cross-bundle import attempt | — |
| 9 | `axe-core` shows zero serious or critical accessibility issues across every panel | ◐ | `family-a11y` gate (S58) — skip-link + live region + tab announce + landmark structure all green (7/7); full axe-core sweep across every Inspector / Sketch / Marketplace panel deferred | S60 — full axe sweep |
| 10 | `marketplace.pryzm.app/families/<id>` serves a published file end-to-end | ◐ | `server/familyMarketplaceRoutes.js` — POST publish + GET browse + GET detail + GET download all green via `tests/family-marketplace-publish` 7/7 integration suite; download response sets `Content-Type: application/x-pryzm-family` and immutable cache headers; in-memory store ships at S59 with Postgres + R2 driver wiring deferred; SPA scaffold under `apps/marketplace-web/` ready for prod build hand-off | S60 — Postgres + R2 + SPA deploy |
| 11 | `replit.md`, `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md`, `SPEC-FAMILY-EDITOR.md` updated to as-built | ✅ | `replit.md` §PRYZM-2-PHASE-3B-S59 entry added this commit; `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` reflects S58 boundary unchanged for marketplace surface (no new top-level package — server route + editor sub-tree + new test workspace are all under documented prefixes); `SPEC-FAMILY-EDITOR.md` previously updated through S57 migration framework, marketplace surface inherits documented signing contract from §17 of this plan | — |
| 12 | A 3-paragraph "what shipped" note is appended to `PROCESS-TRACKER.md` | ✅ | PROCESS-TRACKER §11 row S59 added this commit — boundary statement, deliverables list, deferred-bindings list per project convention | — |

**Audit summary**: 4/12 ✅ outright met, 7/12 ◐ met-with-S60-followup, 1/12 ⏳ deferred. Phase 3-B's hard-blocking goals (the §2 deletion, the standalone SPA scaffold, the gates infrastructure, the determinism contract, the 200-instance bake proof, the bundle isolation, the marketplace publish wire-up, and the docs trail) are all green. The remaining ◐/⏳ items are all *productisation polish* (corpus expansion, prod deploy wiring, full UX timing study, full axe sweep, persistent storage swap) — each is a discrete S60 line-item, not a structural rework. Phase 3-B exits unblocked for Phase 3-C.

---

## §23 Cost & timing — no shortcuts, on purpose

This plan deliberately spends sprints on things a smaller plan would skip, because each one of them buys long-term leverage:

- A real constraint solver instead of a stub (S52) buys every future authoring story that needs sketches.
- Pure-Node geometry kernel (S52→S55) buys bake-worker reuse, AI worker reuse, and deterministic snapshot tests forever.
- A canonical, deterministic file format (S55) buys diff-friendly version control of families, a real marketplace, and AI-friendly round-trips.
- A migration framework (S57) buys schema evolution without breaking authors' existing libraries.
- A dedicated standalone SPA + bundle-budget gate (S58) buys an authoring experience that does not regress the main editor's load time.
- Marketplace publish (S59) buys network effects.

Estimated calendar: **16 weeks** (8 sprints), with two AI-assisted engineers + one designer at full allocation. Estimated effort: **≈ 1,800 engineering hours** + **≈ 300 design / a11y hours** + **≈ 200 hours QA / testing**. Estimated infra spend over the same window: **≈ $4k** (planegcs WASM hosting, marketplace storage, additional CI minutes for the new gates).

This is the price for replacing 1,723 lines of weak prototype with a production family editor that carries PRYZM 2 for the next decade. It is the right price.

---

*Last updated: 2026-04-28. Owner: Founder + Architecture lead. Status: approved for execution. Begin S52 on §2 removal PR.*
