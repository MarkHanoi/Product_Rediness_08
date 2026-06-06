# SPEC-FURNISHING-STYLES — Furnishing Style System (A.21.D19)

**Status:** SHIPPED 2026-06-06 · **Tracker:** A.21.D19 (extends A.21.D4, A.21.D-FLOOR)
**Owner surface:** `packages/ai-host/src/workflows/furnishLayout/styleFinish.ts` (furniture
finishes) + `packages/command-registry/src/floors/floorFinish.ts` (floor finishes) + the two
typology manifests' `style` brief field.

## 1. Motivation

The brief's **Style** chip previously offered four loosely-defined options
(`modern`/`classic`/`minimal`/`warm`) that mapped to a coarse three-slot palette
(upholstery → fabric, case-goods → wood, everything-else → neutral). Founder feedback
(2026-06-06): the styles should drive **different materials depending on the style** — a
real, architecturally-grounded look that differs visibly across furniture, floors and
(where a pipeline exists) walls.

A.21.D19 replaces the four chips with **four architecturally-grounded styles** —
**Nordic · Mediterranean · Minimalist · Classic** — each with a DISTINCT material + colour
per furniture **category**, plus a floor finish and a wall-accent hint. The old ids are kept
as **back-compat aliases** so existing briefs, saved projects and tests keep working.

This EXTENDS the A.21.D4 finish system; it does not rip it out. The
`styleFinishFor(style, kind) → { color, material }` return shape is **unchanged**, so
`buildFurnishCommands.ts` (owned by another agent) consumes it with no edit.

## 2. Design constraints (the v1 contract)

- **Finishes only.** Geometry stays style-agnostic — a style changes COLOUR + MATERIAL,
  never dimensions or placement.
- **Pure + deterministic.** `styleFinish.ts` has zero imports; `floorFinish.ts` imports only
  a type. No randomness, no I/O, no new deps.
- **Stable return shape.** `{ color: string (hex), material: 'fabric'|'wood'|'metal'|'glass' }`
  — the editor furniture builders read `data.color` + `data.material`.
- **Localised.** Only the `style` brief field + the two finish modules + their tests change.

## 3. The palette table (design of record)

The columns are the furniture **categories**; each cell is `{colour hex, material}`.

### 3.1 Furniture — `styleFinish.ts`

| Category (furniture kinds) | **Nordic** | **Mediterranean** | **Minimalist** | **Classic** |
|---|---|---|---|---|
| **upholstery** — sofa, chairs, beds, benches, stools | `#D9D6CE` linen grey-white · `fabric` | `#C7A36B` sand/ochre linen · `fabric` | `#C9C9C9` mid grey · `fabric` | `#6E2230` deep burgundy · `fabric` |
| **wood (case-goods)** — wardrobe, dresser, sideboard, bookshelf, tv_unit, pantry_cabinet | `#E2D6BE` pale ash/birch · `wood` | `#9C6B3C` honey wood/cane · `wood` | `#E8E8E8` white lacquer · `wood` | `#5A3A22` dark walnut/mahogany · `wood` |
| **table** — dining/coffee/console tables, desks, bedside | `#D8C9A8` light oak · `wood` | `#8A5A33` warm walnut-brown · `wood` | `#DADADA` glass/lacquer · `glass` | `#4E3320` mahogany · `wood` |
| **metal (hardware-forward)** | `#9FA4A8` brushed matte steel · `metal` | `#3B352E` wrought iron · `metal` | `#4A4A4A` matte black · `metal` | `#B08D3C` brass/bronze · `metal` |
| **soft** — rugs/cushions (future) | `#C7CCC9` cool wool grey · `fabric` | `#7A8450` olive textile · `fabric` | `#B5B5B5` low-contrast grey · `fabric` | `#1F3A5F` deep navy · `fabric` |
| **neutral** — appliances, fixtures, misc | `#ECEAE4` white-grey · `metal` | `#C97B4A` terracotta · `wood` | `#DFDFDF` light grey · `metal` | `#7D6A4A` aged brass-brown · `wood` |
| **floorColor (hint)** | `#E2D6BE` | `#C8794D` | `#DCDCDC` | `#5A3A22` |
| **wallAccent (hint)** | `#F3F1EC` off-white | `#EFE3CE` lime plaster | `#F4F4F4` near-white | `#E7E0D2` parchment/marble |

Category membership is data-driven in `styleFinish.ts` (`UPHOLSTERED`, `TABLE_KINDS`,
`WOOD_KINDS` sets; default → `neutral`).

### 3.2 Floors — `floorFinish.ts`

Floor finish is `{finishColor, finishPattern, materialName}` resolved by
`floorFinishFor(occupancyType, style)`. Room types map to three families
(timber / wet-tile / dry-tile) and each family has a per-style finish:

| Family (occupancy) | **Nordic** | **Mediterranean** | **Minimalist** | **Classic** |
|---|---|---|---|---|
| **timber** — living, bedroom, dining, study, home-office | `#E2D6BE` plank-90 · Pale Ash/Birch | `#B07C44` plank-90 · Honey Oak | `#D8CDB6` plank-90 · Pale Oak Wide | `#5A3A22` plank-herringbone · Dark Walnut |
| **wet** — bathroom, wc, ensuite, shower-room | `#D9DCDD` tile-600x600 · Off-White Porcelain | `#C8794D` tile-300x300 · Terracotta | `#DCDCDC` tile-600x600 · Large-Format Pale | `#E7E0D2` tile-300x300 · Marble Veined |
| **dry/service** — kitchen, utility, hallway, corridor, entrance | `#E0DCD3` tile-600x600 · Chalk Porcelain | `#C8794D` tile-600x300 · Terracotta | `#DCDCDC` seamless · Polished Concrete | `#E7E0D2` tile-600x600 · Marble Polished |

Unmapped room types → `null` (the engine default is used).

## 4. Back-compat alias mapping

Both normalisers accept the canonical ids, the legacy A.21.D4 chips, and a few free-text
synonyms; unknown / absent → `nordic` (the light, broadly-liked default).

| Input | Canonical |
|---|---|
| `nordic`, `scandinavian`, `scandi` | **nordic** |
| `mediterranean`, `warm`, `rustic`, `cozy`, `cosy` | **mediterranean** |
| `minimalist`, `minimal`, `modern`, `contemporary` | **minimalist** |
| `classic`, `traditional` | **classic** |
| anything else / undefined / non-string | **nordic** (default) |

`styleFinish.normaliseStyle` and `floorFinish.normaliseFloorStyle` keep this mapping in
lock-step. An alias yields the SAME finish as its canonical target (e.g.
`styleFinishFor('warm', 'sofa') === styleFinishFor('mediterranean', 'sofa')`).

## 5. Runtime flow (no executor change)

The brief `style` rides through as a raw string and is normalised only at the finish
functions, so the four new ids flow with **no change** to the executors:

```
brief.metadata.style (string)
  ├─ furniture: FurnishLayoutExecutor → buildFurnishCommands(…, style)
  │             → normaliseStyle → styleFinishFor → {color, material} per piece
  └─ floors:    floorLayoutTrigger → CreateFloorsByRoomTypeCommand(levelId, style)
                → floorFinishFor(occupancy, style) → finishSpec per floor
```

`getActiveDesignMetadata().style` is typology-agnostic — an apartment OR a casa brief drives
the same style.

## 6. Walls — FLAGGED follow-up (not implemented)

There is **no wall-finish pipeline** today (`grep wallFinish|finishColor` in command-registry
hits only `floorFinish`/`CreateFloor*`). A.21.D19 therefore does NOT invent one. Instead
`styleAccentsFor(style).wallAccent` exposes the per-style wall accent colour as a ready hook.

**Follow-up:** when a wall-finish command/spec lands (analogous to `CreateFloorsByRoomTypeCommand`),
consume `styleAccentsFor().wallAccent` (Nordic off-white, Mediterranean lime plaster,
Minimalist near-white, Classic parchment/marble) so walls join the style system.

## 7. Brief options (both typologies)

`packages/typology-pack-apartment/src/manifest.ts` and
`packages/typology-pack-casa-unifamiliar/src/manifest.ts` — the `style` select:

```
options: [
  { value: 'nordic',        label: 'Nordic' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'minimalist',    label: 'Minimalist' },
  { value: 'classic',       label: 'Classic' },
]
default: 'nordic'
```

Only the `style` field changed in each manifest.

## 8. Tests

- `packages/ai-host/__tests__/furnishStyles.test.ts` (NEW, 18 tests): each of the four
  styles yields a distinct colour per category (upholstery / case-goods / table); correct
  category→material; architectural spot checks; valid hex; distinct floor/wall hints;
  alias resolution (incl. aliases == canonical finish); sane defaults; floorFinish
  lock-step (timber/wet/dry distinct per style; minimalist = polished concrete; classic =
  herringbone; mediterranean = terracotta); unmapped → null.
- `packages/ai-host/__tests__/furnishEmit.test.ts` (UPDATED): default is now `nordic`;
  material set includes `glass`.
- Full ai-host suite: **1608/1608 green**.

## 9. Files touched

| File | Change |
|---|---|
| `packages/ai-host/src/workflows/furnishLayout/styleFinish.ts` | Rewritten around the palette table; +`styleAccentsFor`, `CANONICAL_STYLES`; `glass` added to `FurnishFinish`. |
| `packages/command-registry/src/floors/floorFinish.ts` | Four canonical styles in timber/wet/dry tables + normaliser. |
| `packages/typology-pack-apartment/src/manifest.ts` | `style` select options + default. |
| `packages/typology-pack-casa-unifamiliar/src/manifest.ts` | `style` select options + default. |
| `packages/ai-host/__tests__/furnishStyles.test.ts` | NEW test file. |
| `packages/ai-host/__tests__/furnishEmit.test.ts` | Default/material assertions updated. |
| `docs/03-execution/plans/master-execution-tracker.md` | A.21.D19 row. |
