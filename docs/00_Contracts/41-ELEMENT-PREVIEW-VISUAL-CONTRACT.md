# §41 — Element Preview Visual Contract

> **Status**: CANONICAL. **Created**: 2026-05-22 (the code referenced this file
> throughout — `packages/core-app-model/src/preview/PreviewStyle.ts`,
> tool packages, `SymbolicRuleRenderer` — but the document itself was missing;
> this fills that gap and records the colour-unification decision).
> **Scope**: the visual appearance of every *creation / placement preview*
> ("ghost") shown while a user is drawing or placing an element, in **all**
> views (3D, plan, split). Companion: C04 (rendering), C06 (tools), C11
> (element-creation pipeline), §43 (camera framing).

## §1 — Single source of truth

All preview visuals MUST be obtained from
`packages/core-app-model/src/preview/PreviewStyle.ts`:

- `PREVIEW_COLOR` — the colour palette (below).
- `createGhostBodyMaterial` / `createObjectPreviewMaterial` — translucent 3D body.
- `createFootprintLineMaterial` / `createFootprintLine` — floor/elevation path line.
- `createMarkerMaterial` — clicked-point markers.
- `tagPreview` — sets `userData.isPreview = true` (required by selection,
  plan-view extractor, thumbnail capture).
- `disposePreviewObject` — GPU-memory disposal.

A tool **MUST NOT** hard-code preview colours inline. (Historic violations —
SlabTool/SlabPickWallsController `0x007bff`, FloorTool `0x8fb4c8`, CeilingTool
`0x818cf8` — were migrated to the palette on 2026-05-22.)

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

Separate from colour: every element type SHOULD present a live preview while
being created in **every** view where its tool is usable (3D and plan). Gaps are
tracked under the PREVIEW-PARITY work item. A missing preview is a defect, not a
styling choice.

## §6 — Verification gate

```
1. Start creating each element type (wall, slab, floor, ceiling, door, window,
   column, curtain-wall, roof, furniture…) in the 3D view and in the plan view.
   MUST: a live ghost appears while drawing/placing.
   MUST: the ghost is PRYZM purple #6600FF (AI-suggested ghosts excepted, §4).
2. Grep the tool packages for hex colour literals on preview materials.
   MUST: none — all route through PREVIEW_COLOR / PreviewStyle factories.
```
