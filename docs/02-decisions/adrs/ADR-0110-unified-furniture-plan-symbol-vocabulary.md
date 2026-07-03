# ADR-0110 — Unified furniture plan-symbol vocabulary for library card previews

- **Status:** Accepted (2026-07-02); **Amended 2026-07-03** — see
  [Amendment (L-67): preview images are primary, plan symbol is fallback-only](#amendment-l-67-2026-07-03--preview-images-are-primary-the-plan-symbol-is-fallback-only).
- **Tag:** `§FIX-LIBRARY-DIAGRAM-ICONS` (original); `§FIX-CATALOG-THUMBNAIL-RESTORE` (amendment)
- **Layer:**
  - L7.5 UI — `apps/editor/src/ui/furniture-carousel/furniturePlanIcon.ts` (new, pure
    string→SVG symbol generator) + `apps/editor/src/ui/furniture-carousel/FurnitureSidePanel.ts`
    (card render) + `apps/editor/src/ui/styles/panels/furnitureCarousel.ts` (card CSS).
- **Governs:** C06 (UI shell & panels), C18 (element-preview visual standard). Relates to
  Contract §41 (Object Placement Preview Standard — unified PRYZM purple `#6600FF`).
- **Relates to:** the PLACED-drawing plan-symbol builders in `@pryzm/geometry-furniture`
  (`SofaPlanSymbolBuilder`, `ChairPlanSymbolBuilder`, `BedPlanSymbolBuilder`,
  `WardrobePlanSymbolBuilder`, `KitchenPlanSymbolBuilder`, `TreePlanSymbolBuilder`) which
  remain the source of truth for the drawing; tracker **OBJECT-STORAGE-GLB** (why the raster
  thumbnails 404 in prod); founder audit row **L-22**.

## Context

The furniture / interiors **library cards** (Create rail → Interiors → Wardrobes / Chairs /
Tables / Beds …, rendered by `FurnitureSidePanel`) previewed each item by loading
`/items/<Cat>/<item>/thumbnail.webp`. That catalog is deliberately **not** baked into the prod
image (~185 MB; tracker OBJECT-STORAGE-GLB), so every thumbnail **404s in prod**. On 404 the card
fell back to a grab-bag of Lucide-style **side-view / elevation** icons (a couch drawn in
elevation next to a wardrobe in elevation), and parametric items rendered a tiny **raster 3D
isometric** preview on a light-blue background. The result read as "tacky" and inconsistent — a
mix of metaphors, view directions, and colours (founder **L-22**).

Meanwhile PRYZM already draws crisp, **top-view architectural plan symbols** in the drawing via
the `*PlanSymbolBuilder` family: rounded-rect seat + back arc (chairs), frame + mattress inset +
pillows + duvet diagonal (beds), outline + arms + cushion seams (sofas), carcass + section
dividers + door-swing quarter-arcs (wardrobes), run + unit dividers + sink/hob glyphs +
countertop line (kitchen), bumpy canopy + trunk dot (trees). One clean, consistent visual
language — but only in the drawing, never on the cards.

## Decision

Establish **one furniture plan-symbol vocabulary** shared (by convention) between the drawing
and the library cards. Card previews are now clean, generated **diagrammatic top-view symbols**
drawn in the PRYZM plan-symbol style, not raster thumbnails.

1. **New pure generator** `furniturePlanIcon.ts` (L7.5 UI): deterministic `type + label → SVG`.
   - No THREE, no OBC, no DOM writes, no network — the card path stays dependency-free. (The
     heavy `*PlanSymbolBuilder` classes stay in `@pryzm/geometry-furniture`, where THREE/OBC
     live per P2. This module **mirrors their conventions**; it does not import them.)
   - **Top-view only**, origin-centred in a normalised [-1..1] box emitted at `viewBox 0 0 48 48`,
     longer axis vertical so every symbol reads consistently.
   - **Single ink**: `stroke="currentColor"` (the card sets it to PRYZM purple via
     `.fsp-thumb { color: var(--app-accent, #6600FF) }`), `fill="none"`, uniform round-joined
     1.6 px stroke. **No black, no second colour** (Contract §41 / brand white + `#6600FF`).
   - Generalises via ordered keyword rules over `type + label` (same generalisation the old
     fallback used), covering the founder-named families (wardrobe, chairs, tables, beds,
     kitchen) plus sofas, corner sofas, bedside, dining sets, trees/plants, lighting, rugs,
     bath/shower/toilet/sink, cabinets/appliances, decor — with a soft-footprint fallback so a
     card is never empty.

2. **Card render** (`FurnitureSidePanel._buildCard`): the plan symbol is the **default and the
   fallback** for every card. If a real raster `thumbnailPath` ever loads it progressively
   upgrades over the symbol (`img.onload`); on 404 the symbol stays (`img.onerror` no-ops).
   The old `_loadParametricThumbnail` (offscreen WebGL raster) and `_buildIconForItem` /
   `_iconMarkupForText` (side-view icons) paths are removed.

## Consequences

- All library cards read as **one symbol family** — same view direction, stroke, and PRYZM
  purple — matching the drawing's vocabulary. No more tacky raster/elevation mix.
- Zero network dependency for card previews: correct whether or not OBJECT-STORAGE-GLB is
  resolved. When the catalog IS hosted, real photos upgrade in automatically.
- The PLACED-drawing plan symbols are **untouched** (no regression): the builders remain the
  source of truth for the drawing; this ADR only governs the card-scale sibling and pins the
  shared style so the two stay aligned.
- `FurnitureThumbnailService` (offscreen WebGL thumbnail renderer) is left in place but is now
  **orphaned** in production code — a candidate for a later cleanup pass (out of scope here to
  avoid touching the renderer path).

## Amendment (L-67, 2026-07-03) — preview images are primary, the plan symbol is fallback-only

- **Tag:** `§FIX-CATALOG-THUMBNAIL-RESTORE` · **Founder row:** L-67 (REGRESSION→FIXED).

**Reversal of Decision §2.** The original decision made the plan symbol the *default* for every
card and deleted the offscreen 3D preview path (`_loadParametricThumbnail`). The founder rejected
the result (L-67): the cards read as "the same generic purple line-art icon" with no real preview.
Under the conflict-resolution order a direct founder directive outranks this ADR, so the card
render is amended to restore rich preview **images** as the primary visual.

**What the "rich preview image" actually is (and why it is prod-safe).** The restored preview is
`FurnitureThumbnailService.requestThumbnail(type, fabricHex)`, which rasterises **parametric**
geometry (`buildFurnitureGeometry`) to a WebP data-URL in an offscreen renderer. It does **not**
fetch a GLB, so it is unaffected by the un-hosted GLB catalog (tracker OBJECT-STORAGE-GLB →
`/items/**/*.glb` + `thumbnail.webp` 404 in prod). The earlier "raster thumbnail 404s" concern
(original Context) applies only to the pre-baked `thumbnailPath` rasters, *not* to this in-process
render. `FurnitureThumbnailService` is therefore **no longer orphaned**.

**Amended card render (`FurnitureSidePanel._buildCard`), resolution order:**
1. The plan symbol (`buildFurniturePlanIcon`) paints immediately as the **placeholder + fallback**
   so a card is never blank — it is no longer the default visual.
2. If a pre-baked raster `thumbnailPath` is present it upgrades over the symbol on `img.onload`
   (on 404 the symbol stays).
3. Else, for a **parametric** item (no `glbPath`, no raster) the offscreen 3D parametric preview
   upgrades over the symbol.
4. Else (a GLB item whose raster 404s) the clean plan symbol remains as the fallback.

**Unchanged.** The plan-symbol vocabulary (`furniturePlanIcon.ts`), its top-view / single-ink
PRYZM-purple style, and the PLACED-drawing `*PlanSymbolBuilder` family are all untouched — the
symbol is retained precisely as the brand-consistent fallback. Only its *role* changes: fallback,
not default. Tests: `apps/editor/__tests__/FurnitureSidePanelThumbnail.test.ts`.
