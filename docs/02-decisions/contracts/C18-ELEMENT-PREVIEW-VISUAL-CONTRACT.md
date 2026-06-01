# §41 — Element Preview Visual Contract

> **Status**: CANONICAL. **Created**: 2026-05-22 (records the 3D colour-unification).
> **Revised**: 2026-05-23 — extended the unification to the **2D plan/elevation**
> creation handlers + **snap markers** (via the new `PREVIEW_CSS`), recorded the
> out-of-scope colours (§2.4), and marked preview parity satisfied (§5). The 3D
> path (`PREVIEW_COLOR`) was already unified; the 2D `<canvas>` handlers still
> carried a legacy per-element rainbow until this revision.
> **Scope**: the visual appearance of every *creation / placement preview*
> ("ghost") shown while a user is drawing or placing an element, in **all**
> views (3D, plan, elevation/section, split). Companion: C04 (rendering),
> C06 (tools), C11 (element-creation pipeline), §43 (camera framing).

## §1 — Single source of truth

All preview visuals MUST be obtained from
`packages/core-app-model/src/preview/PreviewStyle.ts`:

- `PREVIEW_COLOR` — the numeric (THREE) colour palette, for **3D** previews (below).
- `PREVIEW_CSS` — the **CSS-string** mirror of the same palette
  (`PRIMARY: '#6600ff'`, `PRIMARY_FILL`, `PRIMARY_FILL_STRONG`, `MEP`), for the
  **2D `<canvas>` overlays** (plan-view + elevation/section creation handlers,
  which draw with `CanvasRenderingContext2D` and therefore cannot use a THREE
  numeric colour). Added 2026-05-23 so 2D handlers reference the same source.
- `createGhostBodyMaterial` / `createObjectPreviewMaterial` — translucent 3D body.
- `createFootprintLineMaterial` / `createFootprintLine` — floor/elevation path line.
- `createMarkerMaterial` — clicked-point markers.
- `tagPreview` — sets `userData.isPreview = true` (required by selection,
  plan-view extractor, thumbnail capture).
- `disposePreviewObject` — GPU-memory disposal.

A tool **MUST NOT** hard-code preview colours inline. Historic violations:
- 3D tools — SlabTool/SlabPickWallsController `0x007bff`, FloorTool `0x8fb4c8`,
  CeilingTool `0x818cf8` — migrated to the palette on 2026-05-22.
- 2D plan/elevation handlers — a legacy per-element *rainbow* (wall `#8B5CF6`,
  roof `#6366f1`, grid/furniture `#7c3aed`, column `#0891b2`, dimension `#4499ff`,
  violet accents `#4C1D95`, + indigo/violet `rgba` fills) plus per-type snap-marker
  colours — all migrated to `#6600ff` via `PREVIEW_CSS` on 2026-05-23 (the colour
  unification had previously only reached the 3D `PREVIEW_COLOR` path).

## §2 — Unified preview colour (NORMATIVE, 2026-05-22)

**Every user-facing creation/placement preview uses the single PRYZM brand
purple `#6600FF` (`0x6600ff`, rgb 102,0,255).** This is the app accent, also
used for the selection glow — so "ghost-before-create" feedback reads
identically and on-brand across every tool and every view.

This **supersedes** the previous per-category palette (blue building elements,
green door/window, etc.). The named `PREVIEW_COLOR` keys are retained for
call-site clarity but all resolve to the one colour:

| Key | Value | Applies to |
|-----|-------|-----------|
| `PRIMARY` | `0x6600ff` | wall, curtain-wall, handrail, slab, floor, ceiling, opening, roof |
| `HOSTED` | `0x6600ff` | door, window |
| `VOLUME` | `0x6600ff` | column (point-placed volumes) |
| `OBJECT` | `0x6600ff` | furniture / plumbing / lighting / carousel placements (§3) |

### §2.1 — Opacity (unchanged by the colour unification)

- Body ghost (extruded elements): **0.40**.
- Object placement ghost (§3): **0.55** (`OBJECT_PREVIEW_OPACITY`).

Opacity values < 1 only render on the pure-white background because
`RenderPipelineManager` outputs a presence-alpha (1 wherever geometry is drawn).
Do not drop opacity below the 0.0001 step threshold.

### §2.2 — 2D plan / elevation creation previews (NORMATIVE, 2026-05-23)

The unified colour applies to **every view**, including the 2D `<canvas>`
overlays used for plan-view and elevation/section creation. The per-element plan
tool handlers (`apps/editor/src/engine/views/plantools/*`) and the plan/elevation
overlays (`PlanViewToolOverlay`, `SvpPlanToolOverlay`) MUST draw their creation
ghost (footprint stroke + translucent fill + markers) using `PREVIEW_CSS`
(`#6600ff` / `rgba(102,0,255,…)`), NOT an inline per-element hex. A new element's
plan handler MUST reference `PREVIEW_CSS`, never invent its own colour.

### §2.3 — Snap markers (NORMATIVE, 2026-05-23)

Precision **snap markers** drawn during creation (endpoint, midpoint,
perpendicular, grid-line, grid-intersection, intersection, nearest) also use the
unified `#6600ff`. The snap **type** is conveyed by the marker **shape**
(diamond = endpoint, triangle = midpoint, square = grid, X = intersection,
circle = nearest) plus the snap tooltip — NOT by colour. (Both overlays'
`_drawSnapShape` / snap-`switch` were migrated off the old per-type green/cyan/
orange/yellow/violet/grey scheme on 2026-05-23.)

### §2.4 — What is NOT a creation preview (out of scope)

These are deliberately NOT recoloured to the preview purple, because they are not
"ghost-before-create" feedback:

- **Edit-operation state colours** — e.g. Align/Move tools use green / blue / red
  to signal *pick-source / valid-parallel / invalid* STATE. Functional, not a ghost.
- **Buttons / chrome** — e.g. the in-view "+ Grid" / "+ Level" contextual button.
- **Committed-element plan symbols** — `PlanViewSymbolRenderer` linework is the
  final 2D drawing (conventionally black/grey), not a creation preview.
- **Valid/invalid placement feedback** — red is retained for "no host wall" /
  out-of-bounds states so the user still gets a clear blocked-placement cue.

## §3 — Object placement preview standard

Every element placed via the Furniture carousel and its sister tools
(Furniture, Plumbing, Lighting, Kitchen, Decor, Outdoor, Bathroom, Soft
Furnishings) uses `createObjectPreviewMaterial` — colour `PREVIEW_COLOR.OBJECT`
(`#6600FF`), opacity `0.55`.

## §4 — The one exception: AI-suggested ghosts

`PREVIEW_COLOR.MEP` (`0xA855F7`, violet) is the **only** preview colour that is
intentionally NOT the unified purple. It is the AI-suggested ghost overlay — kept
distinct so a user can tell an AI *proposal* from their own in-progress preview.
If this exception is ever removed, update §2 and the `PreviewStyle.ts` comment
together.

## §5 — Preview parity (existence)

Separate from colour: every element type MUST present a live preview while being
created in **every** view where its tool is usable (3D, plan, elevation/section).
A missing preview is a defect, not a styling choice.

**Status (2026-05-23): satisfied.** All 13 plan-tool creation handlers (wall,
window, door, roof, slab, ceiling, column, beam, stair, room, grid, plumbing,
furniture) draw a plan/elevation ghost; the 3D tools (SlabTool, RoofTool,
WallTool, … via `PreviewStyle`) draw a 3D ghost — including the previously-missing
slab-3D and roof-3D gaps. Any NEW element type MUST ship a preview in both its
3D tool and its plan handler before merge.

## §6 — Verification gate

```
1. Start creating each element type (wall, slab, floor, ceiling, door, window,
   column, beam, stair, room, grid, curtain-wall, roof, furniture, plumbing,
   dimension…) in the 3D view AND in the plan view AND in an elevation/section.
   MUST: a live ghost appears while drawing/placing (§5 parity).
   MUST: the ghost is PRYZM purple #6600FF (AI-suggested ghosts excepted, §4).
   MUST: snap markers shown during creation are #6600FF, type read by shape (§2.3).
2. Grep the 3D tool packages for hex/0x colour literals on preview materials.
   MUST: none — all route through PREVIEW_COLOR / PreviewStyle factories.
3. Grep the 2D handlers + overlays
   (apps/editor/src/engine/views/{plantools/*,PlanViewToolOverlay,SvpPlanToolOverlay})
   for the legacy preview hexes (#8b5cf6, #6366f1, #7c3aed, #0891b2, #4c1d95,
   #4499ff) and per-type snap colours (#22c55e, #06b6d4, #f59e0b, #facc15, …).
   MUST: none on creation-preview / snap draws — all use PREVIEW_CSS (#6600ff).
   EXCEPT the §2.4 out-of-scope colours (edit-state, buttons, committed symbols,
   invalid-red).
```
