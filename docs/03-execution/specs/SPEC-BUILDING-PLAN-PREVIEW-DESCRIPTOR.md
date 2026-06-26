# SPEC — Building-plan preview descriptor (typology-agnostic preview kit)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-06-26 |
| Owner | Editor onboarding/generate modals |
| ADR | [ADR-058](../../02-decisions/adrs/ADR-058-modular-building-plan-preview.md) |
| Contracts | [C50](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md), [C20](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md), [C18 §41](../../02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) |
| Module | `apps/editor/src/ui/preview-kit/` |

> The shared building-level plan-preview kit renders every typology's generate-modal floor plan
> from ONE descriptor via ONE pure renderer. This spec is the normative descriptor + renderer
> contract a new typology adapter writes against.

---

## §1 Scope

This spec governs the **building-level** plan preview shown in a typology's generate/onboarding
modal: the whole-plate top-down drawing of the footprint outline, the unit/room cells tiling it,
the circulation bands, and the vertical core. It does **not** govern the **room-level** unit
thumbnail (`apartment-layout/layoutThumbnail.ts`), which is a finer-granularity drawing of a
single unit/storey's rooms/walls/doors/windows and keeps its own renderer (ADR-058 §D3).

## §2 The descriptor — `BuildingPlanDescriptor`

A typology adapter produces exactly one descriptor (pure data; metres, plan-XZ `{x,z}`):

| Field | Type | Meaning |
|---|---|---|
| `footprint` | `PlanPt[]` (≥3) | **The REAL footprint outline** (drawn polygon / clip boundary). Drawn as the heavy shell. MUST NOT be a bounding-box rect when the true plot is non-rectangular. |
| `cells` | `PlanCell[]` | Unit/room footprints (see §2.1). |
| `corridors` | `PlanCorridor[]` | Circulation bands; drawn as a continuous fill under the cells. |
| `core` | `PlanCore \| null` | Vertical-core lift+stair glyph, or null when the typology has no core. |
| `palette` | `PlanPalette` | `fillKey → hex` for cell fills + a `defaultFill`. |
| `legend` | `PlanLegendEntry[]` | Swatch+label rows (typologies/room-types present + core/corridor). |
| `levelLabel` | `string` | Friendly plan label. |
| `northArrow` / `scaleBar` | `boolean?` | Default true. |

### §2.1 `PlanCell`

`{ rect, polygon?, fillKey, label?, subLabel?, muted?, mutedNote?, doorEdge? }` — `rect` is the
axis-aligned bbox (always present, used for the label anchor + bounds); `polygon` (optional) is
the real cell outline drawn **in preference to** the rect (non-rectilinear unit support);
`muted` renders a calm brand-tinted "no-fit" hatch (counted separately); `doorEdge` draws a door
tick on the circulation-facing edge.

## §3 The renderer — `buildBuildingPlanSvg(descriptor, { targetPx? })`

Pure; returns `{ svg, levelLabel, placed, muted }`. Normative behaviour:

- **§3.1 Footprint** — draw `footprint` as a `<polygon>`: a pale plate fill first, then the
  cells/corridors/core, then the footprint AGAIN as the **heaviest** stroke (the shell outline).
  An L / U / skew plot therefore renders as that polygon, **not** a rectangle.
- **§3.2 Corridor continuity** — every `corridor` is a fill-only shape (no stroke) so abutting
  bands merge seamlessly (preserves §RESI-PREVIEW-CORRIDOR-CONTINUOUS).
- **§3.3 Cells** — fill from `palette.fills[fillKey]` (fallback `defaultFill`); thin partition
  stroke; then a medium party-wall stroke pass for the graded-weight look; labels when the cell
  is large enough; a door tick when `doorEdge` is set. Muted cells hatch instead.
- **§3.4 Core** — a lift "X" + stair-tread glyph in the brand purple, labelled when large enough.
- **§3.5 Chrome** — a north arrow (unless `northArrow === false`) and a scale bar (unless
  `scaleBar === false`) that picks a round metre segment; a wrapping colour legend in the footer.
- **§3.6 Brand** — white + `#6600FF`, deep-indigo ink (`#2a1a52` / `#6b5f8c`); **NO pure black**
  (C18 §41). Output MUST contain no `NaN` / `undefined` / `Infinity`.
- **§3.7 Degenerate** — returns `svg: ''` when there is no drawable geometry.

## §4 Façade palette (`FACADE_PALETTE`)

The single source of the façade-skin tints every typology modal offers. Invariants:

- **§4.1** The original 7 swatches lead, **hex + order unchanged**, so any persisted pick
  resolves: `#f4f1ec, #f3dca0, #e9b7b0, #c97b6e, #a9c2d4, #aec7a8, #cfcdc8`. `DEFAULT_FACADE_HEX`
  is the head (`#f4f1ec`, warm white).
- **§4.2** ≥21 entries total; every `hex` is a valid `#rrggbb` (`isHexColor`); all unique;
  tasteful pastels only (no saturated/dark colours — these are façade tints, not chrome).

## §5 Adapter contract (how a new typology plugs in)

1. Write `buildXxxPlanDescriptor(result): BuildingPlanDescriptor | null` mapping the typology's
   result aggregate (C20/C53) to the descriptor; thread the **real footprint polygon** (clip /
   drawn boundary), de-rotating world→local if the result carries a rigid transform.
2. Call `buildBuildingPlanSvg(descriptor)` for the SVG. No renderer edits.
3. If the modal offers a façade colour, read `FACADE_PALETTE` (never re-declare swatches).
4. Unit-test the descriptor (footprint honoured incl. a non-rect plot; cells/legend derived).

## §6 Acceptance

- The residential modal renders an L-shaped plot as the L polygon (not a rect) — verified by
  `apps/editor/__tests__/residentialPlanThumbnail.test.ts` (L-shape + rotated-footprint cases).
- The kit renders a descriptor, an L footprint, a non-rectilinear cell, a muted cell, and a
  NON-residential (office) descriptor — `apps/editor/__tests__/buildingPlanPreview.test.ts`.
- `FACADE_PALETTE` preserves the original 7 + ≥21 valid unique hexes (same test file).
