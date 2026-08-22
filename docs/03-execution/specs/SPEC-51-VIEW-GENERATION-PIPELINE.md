# SPEC-51 — VIEW GENERATION PIPELINE — the AS-BUILT map, and the RCP contract

| Field | Value |
|---|---|
| Status | **Active — normative for §4 (RCP). Descriptive-and-measured for §1–§3.** |
| Version | 1.0 |
| Date | 2026-08-22 |
| Lane | VIEWDOC20 |
| Issue-log | L-5500 … L-5514 |
| Governs | The pipeline that turns model elements into 2-D line work for `plan`, `rcp`, `section`, `elevation`, `detail`, `schedule`, `3d` |
| Contracts | C04 (rendering/scheduling), C09 §4 (visibility intent), C24 + C24.1 (sheets), C29 (PDF), C34 (print standards), C59 (panes), C101 (annotations), C102 (view/sheet integrity) |
| Related | SPEC-04 (the DESIGN-TIME spec — corrected in place the same day; read this file for what exists), SPEC-29, SPEC-30, ADR-0216, ADR-0215, ADR-0265, ADR-0339, ADR-0342, ADR-0104, ADR-0353 |

> **Why this document exists.** `grep -rlniE "edgeprojector|edge projection|hidden.?line|view scope"
> docs --include=*.md | wc -l` → **112** (measured 2026-08-22); **67** of those are live (not under
> `/archive/`, `/legacy/`, or `superseded`). **None of the 67 is an entry point.** SPEC-04 is the
> nearest thing to one, and it was written **2026-04-27 as a design brief** — §1 and §3 describe a
> six-package layout of which **one package exists**. This file is the measured map: for each view
> type and each pipeline stage, **which document is authoritative and where the gap is.**
>
> ⭐ **A gap you can name beats a survey you cannot act on.** Every cell below is either a citation
> or the word **GAP**. There are no reassuring blanks.

---

> ## §0 — ⛔ WHAT THIS SPEC DELIBERATELY DOES NOT OWN
>
> Views and sheets are already heavily governed, and [C102 §0.1](../../02-decisions/contracts/C102-VIEW-AND-SHEET-INTEGRITY.md)
> ratified a refusal table one day before this file was written. **Re-answering a governed question
> would be the exact defect the suite index records at C00 row 4** (C84 EI-9, *one answer per
> question*). This spec refuses the same seven questions C102 refuses, plus C102's own:
>
> | Question | Owner — go there, not here |
> |---|---|
> | What governs an element's appearance in a view? | **[C09 §4](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md)** |
> | How is a sheet composed; what is a viewport? | **[C24](../../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md)** + **[C24.1](../../02-decisions/contracts/C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md)** |
> | How does a sheet become a PDF? | **[C29](../../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md)** |
> | Drawing sets, revisions, transmittals | **[C30](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md)** |
> | Pens, weights, paper sizes | **[C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md)** |
> | How are view panes hosted on screen? | **[C59](../../02-decisions/contracts/C59-MULTI-PANE-VIEW-SYSTEM.md)** |
> | What is drawn ON a view (annotations)? | **[C101](../../02-decisions/contracts/C101-ELEMENT-ANNOTATION.md)** |
> | For a view/sheet ENTITY — representations, authority, undo, reachability? | **[C102](../../02-decisions/contracts/C102-VIEW-AND-SHEET-INTEGRITY.md)** |
>
> **SPEC-51 owns exactly one question none of those eight asks:** *by what stages, in which modules,
> is a view's LINE WORK produced — and what does each view type do differently at each stage?*
> C102 owns the view as an **entity**; this spec owns the view as a **computation**.

- **Evidence**: measured in the MAIN worktree on **2026-08-22** by `grep -n` / `ls` / line-numbered
  read. Every claim carries a path or a command. Unverifiable cells read **NOT MEASURED**.

---

## §1 — THE SEVEN STAGES, and the FOUR loci that implement them

`ViewTypeSchema` (`packages/schemas/src/view/view-template.ts:200`) has **seven** members:
`plan · rcp · section · elevation · detail · schedule · 3d`.
The runtime union `ViewType` (`packages/core-app-model/src/views/ViewDefinitionTypes.ts:49-63`) has
**thirteen** and spells the third one differently — see §4.1, which is a finding, not a footnote.

### §1.1 The stages

| # | Stage | What it decides |
|---|---|---|
| S1 | **Scope resolution** | Which elements are candidates — level, crop, phase, intent |
| S2 | **Geometry gather** | Which analytic/mesh geometry is fetched per candidate |
| S3 | **Projection** | World → 2-D: direction, basis, clip near/far |
| S4 | **Occlusion / HLR** | Which projected edges are hidden by other geometry |
| S5 | **Line-type classification** | Cut / Beyond / Hidden / Symbolic |
| S6 | **Styling** | Pen weight, dash, colour, poché, halftone |
| S7 | **Output** | Canvas2D on screen · SVG · PDF · DXF |

### §1.2 The four loci — measured

There is **no single module** that implements this pipeline. There are four, at three layers:

| Locus | Path | Lines | Layer | Role |
|---|---|---|---|---|
| **A** | `packages/geometry-kernel/src/edge-projection.ts` | 273 | L2 | **Pure plan-only classifier.** Header: *"Role: CLASSIFIER only … does NOT emit primitives"* |
| **B** | `packages/geometry-kernel/src/hidden-line/` (`classifier.ts`, `types.ts`, `index.ts`) | 3 files | L2 | HLR vocabulary + pure classifier |
| **C** | `packages/core-app-model/src/drawing/**` | multi | L2 | `DrawingPipelineWorker`, `HiddenLineRemoval`, `PenWeightTable`, `DrawingZone`, `OpeningElevationSymbol` — **owned by lane HLR18** |
| **D** | `apps/editor/src/engine/views/EdgeProjectorService.ts` | **4106** | **L7** | The production projector for `plan`/`ceiling-plan`/`section`/`elevation` — **owned by lane EPS19** |

> ⭐ **The architectural finding of this audit is the LAYER of locus D.** SPEC-04 §1 draws the
> pipeline as *"L4 kernel ─ projection ─ classified primitives ─→ L5 drawing-primitives"*. The
> 4,106-line projector that actually runs is in **`apps/editor`**, which `CLAUDE.md`'s measured
> table places at **L7 — the top layer**. Projection is not an application concern; it is the
> kernel concern SPEC-04 said it was. **This is real architectural debt and it is recorded as
> L-5502, not silently re-drawn to match.** No layer-boundary violation is raised by
> `tools/ga-gate/check-layer-boundaries.ts` for it, because L7 importing L2 is *downward* and
> therefore legal — the debt is that the code lives at the wrong altitude, not that it imports
> illegally. **A legal import can still be a misplacement.**

---

## §2 — THE MAP — view type × stage, with the authoritative document

**Legend.** A cell names the document that GOVERNS that cell. **GAP** = measured absent; the
command that establishes it is in §2.2. **n/a** = the stage does not apply to that view type.

| | S1 scope | S2 gather | S3 projection | S4 occlusion | S5 line-type | S6 styling | S7 output |
|---|---|---|---|---|---|---|---|
| **plan** | C09 §4 · ADR-0336 | SPEC-04 §2 | SPEC-04 §6 | SPEC-04 §4.1 | SPEC-04 §4 | C34 · ADR-0265 | C24 · C29 |
| **rcp** | **GAP** | **GAP** | **§4 of THIS spec** (was GAP) | **GAP** | **GAP** | **GAP** | C24 |
| **section** | SPEC-04 §6 | ADR-0265 | SPEC-04 §6 | SPEC-04 §4.1 | SPEC-04 §4 | ADR-0265 (poché) | C24 · C29 |
| **elevation** | ADR-0339 | ADR-0342 | ADR-0339 · ADR-0342 | **GAP** | SPEC-04 §4 | ADR-0265 | C24 · C29 |
| **detail** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | C24 |
| **schedule** | n/a | n/a | n/a | n/a | n/a | C34 | C24 |
| **3d** | C09 §4 | C04 | C04 | n/a (GPU) | n/a | ADR-0206 | n/a |

### §2.1 The gaps, ranked by how much they cost

1. **`rcp` — six of seven stages ungoverned.** Closed for S3 by §4 of this spec; the other five
   are named in §4.6 as explicitly deferred, with the reason. → **L-5503**
2. **`detail` — seven of seven ungoverned.** `'detail'` is in both `ViewType` unions and in
   `ViewTypePropertiesPanelConfig`, and **no live document says what a callout crops, at what
   scale, or how it relates to its parent view.** → **L-5504**
3. **`elevation` S4 occlusion — GAP.** ADR-0339 governs *which façade an elevation shows* and
   ADR-0342 governs *reveal/splay projection*; **neither says what occludes what.** This is the
   stage most likely to produce visibly wrong drawings, and it is undocumented. → **L-5505**
4. **No document owns S7 for the primitive stream** — see §3.2, which is a correctness finding.

### §2.2 The commands that establish the GAP cells

```bash
# rcp — the ONLY normative sentence in the live doc set, before this spec:
grep -rniE "reflected ceiling|reflected-ceiling|\brcp\b" docs --include=*.md \
  | grep -v '/archive/' | grep -v '/legacy/'          # → 10 files
# of those 10, the ONLY one stating RCP SEMANTICS is:
#   docs/03-execution/specs/SPEC-04-DRAWING-ENGINE.md:212
#   "Default RCP: cut at Level + 2.4 m looking down, mirrored."
# (see §4.2 — that one sentence is wrong twice)

# detail:
grep -rniE "callout|detail view" docs --include=*.md | grep -v '/archive/' | grep -v '/legacy/'
```

⚠ **`grep` returning nothing is a hypothesis, not a finding** (C01 §6 rule 6). Each GAP above was
confirmed by *reading* the hits the grep DID return and establishing that none is normative — not
by an empty result. The `rcp` grep returns **10 live files**; nine of them mention RCP only as a
list member (`C59:47`, `auto-documentation-sheets-plan.md:87`, four `intent-analysis/*` files, the
master tracker, and a capabilities inventory). **Mentioned in a list is not specified.**

---

## §3 — TRUTH-CHECK: where these documents and the code disagree

Measured 2026-08-22 across 11 documents (SPEC-04, SPEC-29, SPEC-30, ADR-0216, ADR-0265, ADR-0339,
ADR-0342, ADR-0104, ADR-0336, ADR-0340, ADR-0215) by extracting every backticked repo path and
testing `os.path.exists`.

**57 real citations · 25 resolve · 32 do not.** 14 are **RELOCATED** (the code exists elsewhere —
a path edit fixes it). 11 are **ABSENT** (nothing on disk — a *status* correction is needed, not a
path correction). 3 are `<placeholder>` templates.

> ⭐ **ABSENT and RELOCATED have opposite fixes and must never be merged into one number.**
> Rewriting an ABSENT path to point at "the nearest real file" converts a visible gap into an
> invisible one. That distinction is the reason this section is a table and not a count.

| Document | cited | resolve | miss | Status line it carries |
|---|---|---|---|---|
| SPEC-04 | 6 | 1 | **5** | `Active — normative` |
| SPEC-29 | 6 | 1 | **5** | `Active — normative` |
| SPEC-30 | 7 | 0 | **7** | `Active — normative` |
| ADR-0216 | 7 | 1 | **6** | `Accepted` |
| ADR-0215 | 6 | 0 | **6** | `Accepted` |
| ADR-0265 · ADR-0342 · ADR-0104 · ADR-0336 · ADR-0340 | 26 | 26 | 0 | — |

**Every failure is in the 2026-04-27 drawing-engine cluster. Every clean document was written in
the last three weeks.** The defect is age, not authorship.

### §3.1 The relocations — corrected in place this session

`packages/drawing-canvas2d/` → `packages/drawing-primitives/src/backends/canvas2d.ts` ·
`packages/drawing-svg/` → `…/backends/svg.ts` · `packages/drawing-pdf/` → `…/backends/pdf.ts` ·
`packages/drawing-dxf/` → `packages/file-format/src/export/sheets/DxfExportService.ts` ·
`packages/geometry-kernel/edge-projection/` → `packages/geometry-kernel/src/edge-projection.ts`
(**a file, not a directory**) · `packages/geometry-kernel/visibility/` →
`packages/geometry-kernel/src/hidden-line/`.

### §3.2 ⛔ THE FINDING UNDER THE RELOCATION — two of the "three back-ends" THROW

Correcting `packages/drawing-svg/` to `packages/drawing-primitives/src/backends/svg.ts` makes the
path resolve **and would ratify a false claim**, so it is recorded here instead of being quietly
fixed. Measured — the files are 966 and 688 bytes:

- `backends/svg.ts` — *"SVG backend — **TYPED STUB** … Until then this throws
  `BackendNotImplementedError` on `render()`"*, `sprintMarker = 'S55'`.
- `backends/pdf.ts` — *"PDF backend — **TYPED STUB** … throws on render()"*, `sprintMarker = 'S37'`.

SPEC-04 §1 states *"**Renderers are plug-replaceable; same primitives → three outputs**"* and §3
gives all three their own package. **Measured: ONE of the three back-ends renders. Two throw.**

**And the real exporters do not use this architecture at all.** Working SVG is
`packages/drawing-primitives/src/sheet/SheetToSvg.ts` (9,241 B) + `SheetWithContentToSvg.ts` +
`ViewportToSvg.ts`; working PDF is `packages/pdf-export/src/SheetToPdf.ts` (512 lines) and
`packages/file-format/src/export/sheets/PdfExportService.ts` (554 lines); working DXF is
`packages/file-format/src/export/sheets/DxfExportService.ts` (421 lines). **These are SHEET-level
renderers that consume a `Sheet`, not `PrimitiveBackend`s that consume a `PrimitiveStream`.**

⭐ **So the "single vector model → three outputs" invariant is not merely unbuilt — it is bypassed
by a second, working, parallel path.** Parity between screen, SVG, PDF and DXF is therefore not
guaranteed **by construction**, which is the property SPEC-04 §3 exists to provide. The
`backends/` registry is a fossil with a live rival. → **L-5506**

There is also a **fourth** backend SPEC-04 never mentions: `backends/print-canvas.ts`. → **L-5507**

### §3.3 ⛔ SPEC-04 §10 names six OpenTelemetry spans. ZERO exist.

```
rg "drawing\.(edge-projection\.run|classify\.hidden|canvas2d\.frame|export\.(svg|pdf|dxf))"
```
→ **7 hits, ALL of them in documentation** (SPEC-04:283-288 declaring them; ADR-0216:111 repeating
one). **Zero in `apps/`, `packages/`, `plugins/`, `src/`, `server/`, `tools/`.**
`rg "startSpan|withSpan|tracer\.|startActiveSpan" packages/core-app-model/src/drawing` → **1**
occurrence, in `DetailLevelResolver.ts`, not one of the six.

This is the **L-809 defect shape**: a normative document describing instrumentation that does not
exist. It also sits squarely inside P8's *"every new exported function must add ≥1 span"*, whose
own gate (`tools/ga-gate/check-otel-spans.ts`) is three-zone and whose **Zone C prints a census and
gates nothing** — which is precisely why six named spans could be absent for sixteen weeks without
any gate noticing. → **L-5508**

### §3.4 ⛔ ADR-0215 assigns style resolution to a layer the code did not honour

ADR-0215 (`Accepted`) places `style-resolver.ts` in `packages/geometry-kernel/visibility/` and
calls it *"L1 data + L4 evaluation"*. Measured:
`find packages plugins apps -name 'style-resolver*'` → **`plugins/plan-view/src/style-resolver.ts`
— the only one in the repo. That is L6.**

⭐ **This is NOT a path typo and must not be fixed as one.** Correcting the path alone would
silently ratify a layer assignment the ADR rejected. Per the conflict order, **the ADR is stronger
than the code, so the code is wrong** — but the code is `plugins/plan-view/`, which this lane does
not own. **Recorded as L-5509 and handed on; deliberately not moved.**

### §3.5 The eleven ABSENT paths — an architecture accepted and not built

`packages/scene-cache/` (ADR-0216's stated cache — **no `scene-cache` and no `SceneCache` anywhere
in the repo**) · `packages/drawing-primitives/__tests__/snapshots/` (ADR-0216's own named mitigation
for its *"three back-ends to keep at parity"* risk — the `__tests__` directory exists with 9 test
files and **no snapshot suite**) · `tests/fixtures/drawing/` (SPEC-29) · `packages/stores/StyleStore.ts`
· `packages/renderer/dirty-flags.ts` · and the whole SPEC-30 trio `packages/visibility/resolver.ts`,
`legacy-adapter.ts`, `incremental.ts`.

⭐ **The SPEC-30 trio is the sharpest.** `packages/visibility/src/waves/` contains
`w01-level-scope.ts` … `w11-ghost-layer.ts` — **the legacy 11-wave system SPEC-30 promises to adapt
away is present and complete, while all three files of its named replacement are absent.** SPEC-30
is marked `Active — normative` and **0 of its 7 cited paths resolve.** → **L-5510**

### §3.6 ⚠ Why no gate caught any of this

`tools/ga-gate/check-contract-cited-paths.ts` asserts exactly this property — that every repo path
cited in a document resolves or is marked `PLANNED` — and its first reading was **1528 citations,
491 unresolved**. **It reads `contracts/**` only.** Every document in §3's table lives in `specs/`
or `adrs/`, outside its reach. **The 32 misses are concentrated in exactly the documents no gate
reads.** Extending that gate's glob to `adrs/**` and `specs/**` is the single highest-value
follow-up this audit produces, and it is **proposed, not built** — building it is a code change in
`tools/`, and the ratchet baseline must be set by whoever runs it. → **L-5511**

---

## §4 — THE RCP CONTRACT — **normative**

This section is the specification a test may assert against. It exists because §2.2 established
that **one sentence** in the entire live corpus states RCP semantics, and that sentence is wrong.

### §4.1 ⛔ FINDING FIRST — `rcp` is THREE unbridged vocabularies for one concept

| Spelling | Declared at | Consumed by |
|---|---|---|
| **`'rcp'`** | `packages/schemas/src/view/view-template.ts:200` (L0 `ViewTypeSchema`) | `plugins/sheets/src/view-renderer/view-source.ts:31,40` (`ViewKind`, a hand-copy) |
| **`'ceiling-plan'`** | `packages/core-app-model/src/views/ViewDefinitionTypes.ts:57` (runtime `ViewDefinition.viewType`) | ~40 sites — `EdgeProjectorService:3980,4045`, `SplitViewManager:932`, `ViewsRailPanel`, `LeftNavRail`, `SheetEditor*`, all `PLAN_VIEW_TYPES` sets, `CreateViewDefinitionCommand:75` |
| **`'Ceiling'` / `'Top'`** | `packages/views/src/types/ViewType.ts:33` (`ViewMode`, the OBC camera mode) | `ViewController:1484`, `underlayViewScope`, `stairSketchRouting` |

**The only translation in the repo is `apps/editor/src/ui/SheetEditor/activateViewForEditing.ts:71`
— `if (t === 'ceiling-plan') return 'Ceiling'`, bridging spellings 2→3.
There is NO bridge between `'rcp'` and `'ceiling-plan'`.**

Consequences, measured:
- `viewDefinitionStore` only ever stores `'ceiling-plan'` (`SplitViewManager.ts:932` calls
  `getByType('ceiling-plan')`). A sheet view-source whose `ViewKind` is `'rcp'` therefore
  **cannot match any view that exists.**
- `apps/editor/src/ui/ViewPropertiesPanel.ts:130` reads
  `if (id.includes('ceiling') || id.includes('rcp')) return 'Ceiling Plan'` — a **substring
  heuristic over an id**, which is the classic tell of an unbridged vocabulary: the code is
  guessing because no mapping exists.

⭐ This is the **C101 §1 defect shape recurring** — *"FOUR VOCABULARIES over one family"* — and it
recurs here because **nothing compares the L0 enum to the runtime union.** → **L-5500**, **L-5501**

**V-RCP-1 (normative).** `'rcp'` and `'ceiling-plan'` denote ONE view type. Exactly one spelling
must be canonical at each layer, and a **total, explicit** mapping must exist between the L0 schema
enum and the runtime union. **A substring test on an id is not a mapping and does not satisfy
this.** The choice of which spelling wins is deferred to the owning lane; **that a bridge must
exist is not deferred.**

### §4.2 ⛔ The one existing normative sentence is wrong twice

> SPEC-04 §6:212 — *"Default RCP: cut at Level + 2.4 m **looking down, mirrored**."*

**Wrong 1 — direction.** The code projects **upward**:
`packages/core-app-model/src/views/ViewDefinitionTypes.ts:224` — `ceilingPlan: { x: 0, y: 1, z: 0 }`,
i.e. **+Y**; and `ViewDefinitionTypes.ts:57` documents the member as *"Reflected Ceiling Plan —
**looking upward**"*. `EdgeProjectorService.ts:3980` selects that preset.
**The code is architecturally correct and the SPEC is wrong.** An RCP looks up at the ceiling; that
is what makes it *reflected*.

**Wrong 2 — "mirrored" describes a transform that does not exist, and should not.**
`rg -i "\bmirror" apps/editor/src/engine/views/` → **189 hits, and every one is the English sense
("mirrors X", "a mirrored copy of the pen table"). There is no geometric reflection for RCP
anywhere in the pipeline.**

That absence is **correct**, and §4.3 states why — but it was correct *by accident*, because no
document said so. **A behaviour that is right and unwritten is one refactor from being wrong.**
→ **L-5512**

### §4.3 V-RCP-2 (normative) — an RCP is PLAN-HANDED, and needs no mirror transform

**The rule.** A reflected ceiling plan **must** be drawn in the **same handedness as the floor
plan of the same level**: for identical world coordinates, a point renders at the identical 2-D
position in both. North is up in both; a room on the east side of the plan is on the east side of
the RCP.

**Why no transform is needed.** For plan-family views the projector maps world `(X, Z)` → drawing
`(x, y)` **without consulting the projection direction** — the direction vector governs clip
ordering and face-facing, not the 2-D basis. The one place a `right`-vector basis is built is
`resolveSectionVolumeBox` (`EdgeProjectorService.ts:1147`), and its **first statement is an
explicit guard**:
```ts
if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return null;   // :1154
```
so that basis is unreachable for `'ceiling-plan'` by construction; the `forward` vector it builds
has its Y zeroed (`:1158`), which is meaningless for a vertical projection. Dropping Y is
handedness-preserving in both directions. **The reflection is therefore
already implicit in the coordinate mapping, and applying a further mirror would produce a
DOUBLE flip — an RCP with east on the left, which is the classic RCP bug.**

⭐ **This is a real decision, made in code, never recorded.** It is ratified as
**[ADR-0353](../../02-decisions/adrs/ADR-0353-a-reflected-ceiling-plan-is-plan-handed.md)**.

**Assertable form.** For a level containing one element at world `(x=+5, z=0)`:
```
projectPlan(level).find(el).x  ===  projectRcp(level).find(el).x     // +5, NOT -5
projectPlan(level).find(el).y  ===  projectRcp(level).find(el).y
```
and, repo-wide: **no `scale(-1, 1)`, `negate()` on the plan basis, or equivalent reflection may be
introduced on the `'ceiling-plan'` path.** A test asserting the sign of `x` is sufficient and is
the cheapest possible guard against the double flip.

### §4.4 V-RCP-3 (normative) — the clip window

**AS-IS, measured** — `EdgeProjectorService.ts:4045-4058`:
```
near = level.elevation + level.height        // the ceiling plane
far  = near + 0.5                            // a 0.5 m band above it
```
**SPEC-04 §6:212's "cut at Level + 2.4 m" is a hard-coded constant the code does not use** — the
code reads `level.height` and falls back to `DEFAULT_FAR_OFFSET`. A level whose height is not
2.4 m makes the SPEC's number wrong for that level, which is why the rule must be relative.

**The rule.** The RCP cut plane is **derived from the level's own height, never from a constant**:
`cut = level.elevation + level.height`. The visible band extends **upward** from the cut. The
0.5 m depth is a **default**, and must be overridable per view via `spatial.viewRange`, exactly as
the plan's `farOffset` is. → the override is **NOT MEASURED** for the RCP path; see §4.6.

### §4.5 V-RCP-4 (normative) — the element set is NOT the plan's element set

An RCP shows what is **on and above** the ceiling plane, looking up. It is a different drawing from
a plan of the same level, not a re-clipped one. **Normatively:**

| Family | In an RCP |
|---|---|
| Ceiling surfaces, soffits, bulkheads | **SHOWN — cut/primary.** They are the subject. |
| Light fittings, diffusers, grilles, sprinklers, smoke detectors | **SHOWN — this is what an RCP is FOR.** |
| Walls | **SHOWN as cut**, at the RCP cut plane — they bound the ceiling. |
| Doors | **Frame/head opening only. ⛔ NO SWING ARC.** A swing is a floor-plane symbol; it is meaningless looking up and is the single most common wrong mark on an RCP. |
| Windows | Head only. |
| Floor-mounted furniture, fixtures, stairs below the cut | **NOT SHOWN.** |
| Room tags / dimensions | Per C101; an RCP carries its own annotation set. |

**Measured against this table: `apps/editor/src/engine/views/plan-canvas/PlanViewSymbolRenderer.ts:16`
admits `'plan'`, `'ceiling-plan'` and `'structural-plan'` through ONE gate**, so plan symbols are
emitted for an RCP by the same path as for a plan. **Whether a door swing is among them on the RCP
path is NOT MEASURED by this lane — it is `apps/editor/src/engine/views/**`, owned by EPS19, and is
handed to them with this table as the assertion target.** → **L-5513**

### §4.6 What this spec deliberately does NOT specify for RCP, and why

Declaring an omission is mandatory; omitting it silently is the defect (C84 §6).

- **S1 scope / S2 gather / S4 occlusion / S6 styling for RCP** — deferred. Specifying them
  requires measuring what the shared plan path already does for `'ceiling-plan'`, and that
  measurement is EPS19's, in progress, in a file this lane does not own. **Writing a normative
  rule ahead of that measurement would be specifying against a guess.**
- **Whether `spatial.viewRange` overrides reach the RCP branch** — **NOT MEASURED.** The branch at
  `:4045` returns before the `nearOffset`/`farOffset` block at `:4064`, which *suggests* overrides
  are ignored for RCP, but "suggests" is not measured and is not written here as fact.
- **Which spelling of the view type wins** (§4.1) — a cross-package rename with a schema
  migration; it needs its own ADR and its own lane.

---

## §5 — WHAT WAS CHANGED IN PLACE, AND WHAT WAS DELIBERATELY LEFT

**Corrected in place this session** (never a new `*-AUDIT.md` derivative — `CLAUDE.md` forbids it):
SPEC-04 (§1, §3, §6, §10, §13 + a correction box), SPEC-29, SPEC-30, ADR-0216 (`Implementation`
row), ADR-0215 (style-resolver layer note).

**Deliberately left, with the reason:**
- **All source code.** This is a documentation lane. The three code-side findings (§3.4 L-5509,
  §4.1 L-5500/5501, §4.5 L-5513) are handed to the lanes that own the files.
- **The `check-contract-cited-paths.ts` glob extension** (L-5511) — proposed, not built. Its
  baseline must be set by whoever runs it, and setting a ratchet from a lane that cannot re-run it
  would pin a number nobody verified.
- **`CLAUDE.md`'s ADR count.** It reads **268**; `ls docs/02-decisions/adrs/ADR-*.md | wc -l` →
  **284** (2026-08-22). Not this lane's file, and the correction boxes there already say to
  re-measure rather than trust the line. Named so the next reader knows it is stale. → **L-5514**
