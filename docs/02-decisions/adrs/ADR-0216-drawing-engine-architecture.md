# ADR-0216 — Drawing Engine Architecture

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.6`; `CRITICAL-REVIEW-2026-04-27.md §B4` |
| Required by | Sprint S29 (Phase 2B — plan view rebuild) |
| Owner | Architecture lead |
| Implementation | ⚠ **THREE OF THESE FOUR PATHS DO NOT EXIST — corrected 2026-08-22, see box below.** ~~`packages/drawing-primitives/` (vector model); `packages/drawing-canvas2d/`; `packages/drawing-svg/`; `packages/drawing-pdf/`~~ |
| Spec dependency | `SPEC-04-DRAWING-ENGINE.md` — **and [`SPEC-51-VIEW-GENERATION-PIPELINE.md`](../../03-execution/specs/SPEC-51-VIEW-GENERATION-PIPELINE.md), which carries the measured as-built map** |

> ## ⚠ CORRECTED 2026-08-22 (lane VIEWDOC20)
>
> **This ADR is `Accepted` and its header field named `Implementation` — the field whose whole
> purpose is to say where the code lives — is three-quarters wrong.** Measured: **7 paths cited,
> 1 resolves, 6 do not.**
>
> **(1) The back-end packages were consolidated, and two of the three THROW.**
> `packages/drawing-canvas2d|svg|pdf/` → all now `packages/drawing-primitives/src/backends/`.
> Only `canvas2d.ts` (5,636 B) renders. `svg.ts` (966 B) and `pdf.ts` (688 B) are headed
> `// TYPED STUB` and throw `BackendNotImplementedError`. **The Decision's sentence *"Three
> pluggable back-ends (Canvas2D / SVG / PDF) consume it"* is true of one.**
> Working SVG/PDF/DXF exist on a **separate sheet-level path** that never touches the primitive
> stream (`drawing-primitives/src/sheet/SheetToSvg.ts`, `packages/pdf-export/src/SheetToPdf.ts`,
> `packages/file-format/src/export/sheets/{PdfExportService,DxfExportService}.ts`).
>
> **(2) `packages/scene-cache/` (§:105) DOES NOT EXIST.** `ls -d packages/scene-cache` → absent;
> no `SceneCache` anywhere in the repo. The purity claim *"`(ViewDef, sceneRevision) → Primitive[]`
> is a pure function"* is untouched by this — **only the claim about where it is cached is false.**
>
> **(3) ⛔ §:126's MITIGATION FOR THIS ADR'S OWN HEADLINE RISK IS THE SHARPEST FINDING.**
> The risk is stated as *"Three back-ends to keep at parity"*, mitigated by *"the snapshot suite at
> `packages/drawing-primitives/__tests__/snapshots/` and a per-back-end visual-diff CI gate"*.
> Measured:
> - `packages/drawing-primitives/__tests__/` exists with **9 test files and NO `snapshots/`
>   directory**. The named suite is **ABSENT**.
> - A visual-diff corpus and CI job **do** exist (`tests/visual-diff/`, `ci.yml:306`) — ⚠ so this
>   is **not** an absent gate, and reporting it as one would be wrong. But its subject is
>   **`3d/` element renders and `plan-view/`**, not back-end parity. `ls tools/ga-gate/ | grep -iE
>   "visual|diff|parity|backend|drawing"` → **no match** across **68** gate scripts.
> - **The only test that touches the back-ends is `__tests__/backends.test.ts`, and it asserts
>   `SvgBackend.render()` THROWS.**
>
> ⭐ **So the mitigation named for the parity risk is a test that PINS THE NON-PARITY.** It is
> green, it is meaningful, and it measures the opposite of what this ADR cites it for. **A gate
> with the wrong subject is more dangerous than a missing one, because it reports success.**
>
> **The architecture below is NOT retracted** — it remains the ratified target, and the layer
> assignment is still right. What is corrected is every claim about where it lives and what
> defends it. See SPEC-51 §3.2, §3.5 (L-5506, L-5510, L-5511).

---

## Context

D8 (desktop-CAD documentation parity) is a v1 differentiator. Three drawing surfaces must agree pixel-for-pixel where it matters and produce dimensionally exact output where it matters more:

- **Screen** (plan/section/elevation viewports — interactive, hit-testable, anti-aliased).
- **In-browser export** (SVG — copy/pasteable, dimensionally exact).
- **High-fidelity print** (PDF — embedded fonts, true colour, layer fidelity).

`CONFLICT-ANALYSIS.md §6.6` flagged the absence of a unified drawing-engine architecture. `SPEC-04` proposed: a single vector primitive layer feeding three back-ends. This ADR ratifies that architecture before S29 (Phase 2B kickoff).

---

## Decision

**Single vector primitive model in `packages/drawing-primitives/`. Three pluggable back-ends (Canvas2D / SVG / PDF) consume it. Edge projection runs in the kernel and produces classified primitives.**

### Architecture

```
View Templates ──┐
View Filters   ──┤   (data — L1 stores)
VG Overrides   ──┤
                 │
L4 kernel ─── projection ──── classified primitives ─┴─→ L5 drawing-primitives ──┬─→ Canvas2D back-end (screen)
(analytic geometry)         (Cut/Beyond/Hidden/Sym)    (vector model)            ├─→ SVG back-end (in-browser export)
                                                                                 └─→ PDF back-end (high-fidelity print)
```

### The vector primitive model
The single shape over which all three back-ends operate (per SPEC-04 §2):

```ts
type Primitive =
  | Line     { from, to, style: StrokeStyle }
  | Polyline { points, style, closed }
  | Arc      { center, radius, startAngle, endAngle, style }
  | Polygon  { outer, holes, fill: HatchStyle | SolidFillStyle | null, stroke }
  | Text     { anchor, content, style: TextStyle, rotation }
  | Symbol   { anchor, kind, scale, rotation, style };
```

- `StrokeStyle` carries an ISO-13567 `layer`, physical `weightMm`, `color`, `dash`, `dashPhase` (preserved across edits and exports), `zOrder`.
- `HatchStyle` is canonical: predefined (concrete/brick/insulation/…), lines/crosshatch with arbitrary spacing/angle, or solid. Hatches MUST align to the *element's local coordinate system*, never the view origin (per SPEC-04 §2.3).
- `TextStyle` carries family/sizeMm/weight/italic/align/baseline.
- Symbols are vector paths stored once and instanced.

### Back-ends

#### Canvas2D (`packages/drawing-canvas2d/`) — screen
- Anti-aliased via device-pixel-ratio scaling.
- Draws in `(zOrder, layer, insertionOrder)`.
- Hairline minimum: 0.25 px after AA.
- Hit-test index built per draw; cursor picking returns `elementId`.
- Cost target: < 16 ms for a 5,000-element view at 1920×1080.

#### SVG (`packages/drawing-svg/`) — in-browser export
- One `<g>` per ISO-13567 layer; one `<path>` per primitive.
- `<pattern>`-based hatches.
- Real `<text>` (selectable, copy/pasteable in viewers).
- Dimensionally exact (mm units, `viewBox` to drawing extent).
- No raster fallback; if a back-end can't render a primitive natively, it's a bug.

#### PDF (`packages/drawing-pdf/`) — high-fidelity print
- Built on `pdf-lib` for in-browser; on `node-canvas`-backed `pdf-lib` for server-side export jobs.
- Embeds fonts (subset).
- True colour (DeviceRGB + ICC profile when set).
- One layer per ISO-13567 layer (PDF Optional Content Groups).
- Vector hatches (PDF tiling patterns).
- Server-side export jobs run via the BullMQ pipeline (per ADR-0205).

### Edge-projection module (`packages/geometry-kernel/edge-projection/`)
- Owns Cut / Beyond / Hidden / Symbolic classification.
- Classification rules consume the Visibility-Intent rule matrix (per ADR-0215 placement).
- WebGPU compute-shader fast path; CPU fallback (per ADR-0206 §feature-parity-matrix).
- Output: `ClassifiedPrimitive[]` flowing into the drawing-primitive layer.

### View definition
A `ViewDef` is the input that selects what's drawn:
```ts
type ViewDef = {
  camera: OrthoCamera | PerspCamera;
  clip:   ClipBox | null;
  scale:  Scale;          // 1:50, 1:100, …
  template: ViewTemplateId;
  filters:  ViewFilterId[];
  overrides: VGOverride[];
};
```
The kernel + drawing engine produce the same primitive stream for the same `ViewDef` regardless of the back-end (deterministic per `ViewDef` hash; cacheable).

### Determinism and caching
- `(ViewDef, sceneRevision) → Primitive[]` is a pure function; cached in `packages/scene-cache/`.
- The cache key includes the kernel WASM SHA (per SPEC-01 §6) so cache invalidates on kernel bumps.
- Cache hits make plan-view pan/zoom free of kernel cost.

### OpenTelemetry
- `drawing.primitive.classify { viewId, primitiveCount, durationMs }`
- `drawing.canvas2d.frame { viewId, primitiveCount, durationMs }`
- `drawing.svg.export { viewId, sizeBytes, durationMs }`
- `drawing.pdf.export { viewId, pageCount, sizeBytes, durationMs }`

---

## Consequences

**Positive:**
- Single source of truth for drawing semantics; bugs fixed once apply to all three back-ends.
- Pluggable: a future EPS, DWG, or canvas3D back-end is a new package, not a rewrite.
- View output is cacheable per `ViewDef` hash → fast pan/zoom and consistent print.
- Primitive layer is easy to test (data-in / data-out, no GPU).

**Negative:**
- Three back-ends to keep at parity; mitigated by the snapshot suite at `packages/drawing-primitives/__tests__/snapshots/` and a per-back-end visual-diff CI gate (P10 alongside renderer parity per ADR-0206).
- PDF embedded fonts blow up bundle size on the export worker; mitigated by font subsetting per export job.
- Compute-shader projection is WebGPU-only; CPU fallback is ~3× slower (per ADR-0206).

---

## Alternatives considered

### THREE.js LineMaterial / SVGRenderer
- Rejected: doesn't model hatches, ISO-13567 layers, or PDF fidelity; we'd end up writing the primitive layer above it anyway.

### Per-back-end primitives (no shared model)
- Rejected: parity drift; bug fixed in one back-end won't propagate.

### Render to high-resolution raster, then trace to vector
- Rejected: loses dimensional precision and selectability; defeats the purpose of vector primitives.

### Use an existing CAD library (e.g. dxf-writer / ezdxf wasm)
- Considered for DXF export only. Used internally where convenient (DXF export); not a substitute for the in-product drawing engine.

### Server-only PDF
- Rejected: D2 (offline-first authoring) requires PDF export from the browser without a network round-trip.

---

## Phase rollout
- S25 — `packages/drawing-primitives/` lands; tests for hatch alignment + dash-phase preservation.
- S27 — Canvas2D back-end renders first plan-view frame (legacy primitives wrapper).
- S29 — full plan-view rebuild on the new primitive model; old plan-view code removed.
- S31 — SVG back-end ships; in-browser SVG export viable.
- S33 — PDF back-end ships; in-browser PDF export viable; server-side PDF export job lives in bake-worker.
- S35 — view-template / view-filter system live end-to-end.
- S43 — primitive cache (per `(ViewDef, sceneRevision)`) live.
- S55 — DXF back-end as a separate package consuming the same primitives.
- S72 (M36 GA) — three back-ends at full parity; visual-diff CI green.
