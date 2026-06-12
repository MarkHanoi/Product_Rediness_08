# SPEC-INTERIOR-STYLE-SYSTEM — Platform-wide Interior Design Style System

**Status:** CORE SHIPPED (ST.1 · ST.2 · ST.3-furniture · ST.5 done 2026-06-12; ST.4/ST.6/ST.7 queued) · **Tracker:** §32 · **Supersedes scope of:** SPEC-FURNISHING-STYLES (A.21.D19, furniture+floor only)
**Future contract:** warrants a C-number when built (e.g. C5x — Interior Style / Material Authority). SPEC for now.

## 1. Motivation (founder brief)

A single **Style selector** must drive ALL materials and finishes across the building, not just furniture. The founder example: select **Nordic** and white materials + light wood follow everywhere — all furniture in light wood, cream-painted interior walls, light wooden doors and windows. Select **Mediterranean** and you get big windows, terracotta, deep blue, etc.

Today a partial version exists for **furniture + floors only** (4 styles): `styleFinish.ts` and `floorFinish.ts` (see SPEC-FURNISHING-STYLES). This SPEC is the **superset**: 6 founder-supplied styles, extended to **walls, doors, windows, lighting, and a window-size (glazing) bias**, with one Style descriptor and one StyleRegistry feeding every element material/finish system.

## 2. The Style descriptor

A `Style` is a pure data descriptor (no I/O, no THREE, no DOM — same purity as `styleFinish.ts`):

```
interface Style {
  id: StyleId;                 // 'nordic' | 'mediterranean' | 'classic' | 'farmhouse' | 'japanese' | 'industrial'
  label: string;              // human label for the picker
  mood: string;               // bright/calm/hygge, warm/sun-drenched, ...
  palette: StylePalette;
}

interface StylePalette {
  // Walls / paint
  wallPaint:        string;        // interior wall paint hex (drives wall.materialColor)
  wallAccent:       string;        // optional accent / feature-wall hex
  // Floors (delegates to floorFinish.ts families; this is the dominant tone)
  floorFinish:      FloorFinishHint;   // { timber, wet, dry } colour+material hints per family
  // Furniture (per category, mirrors styleFinish.ts slots)
  furniture: {
    upholstery:     Slot;        // { color, material: 'fabric' }
    wood:           Slot;        // case-goods { color, material: 'wood' }
    table:          Slot;        // { color, material: 'wood'|'glass'|'metal' }
    metal:          Slot;        // { color, material: 'metal' }
  };
  // Doors / windows finish (drives DoorSystemType frame/leaf + WindowSystemType frame)
  doorFinish:       { frameColor: string; leafColor: string; preferredDoorTypeId?: string };
  windowFinish:     { frameColor: string; preferredWindowTypeId?: string };
  // Lighting fixtures (key fixture family + warm/cool tone)
  lighting:         { fixtures: string[]; toneKelvin: number };
  // Architectural feature hints (descriptive; drive future feature emitters)
  features:         string[];
  // Glazing-size bias — multiplies window emission widths (see §6)
  glazingBias:      number;        // 1.0 = neutral; >1 bigger windows; <1 smaller
}
```

`Slot = { color: string (hex); material: 'fabric'|'wood'|'metal'|'glass' }` — identical to the slot the furniture builders already read via `data.color` + `data.material`.

## 3. The six styles (founder palettes, captured faithfully)

| Style | Mood | Wall paint | Floor (dominant) | Furniture wood / upholstery | Door/Window finish | Lighting | Key features | glazingBias |
|---|---|---|---|---|---|---|---|---|
| **Nordic / Scandinavian** | bright, calm, hygge | white / soft beige / pale (cream paint) | light oak / whitewashed plank | light oak / ash, organic; linen/wool/leather/felt upholstery | light wooden / whitewashed frames + leaves | layered, pendants, candles; warm | large windows, minimal clutter, cozy textiles | **1.20** (bigger) |
| **Mediterranean** | warm, sun-drenched | white/cream, lime-plaster, ochre | terracotta tile / travertine / natural stone | solid wood + wrought iron, large dining tables; natural-fabric sofas | warm/solid wood + iron; deep-blue accents | iron chandeliers, lanterns; warm ambient + lots of daylight | arches, exposed beams, indoor-outdoor, textured walls, BIG windows | **1.25** (biggest) |
| **Classic (Traditional European)** | elegant, timeless | cream / ivory / taupe; navy/burgundy/forest-green accents | herringbone hardwood / marble / parquet; Persian rugs | mahogany/walnut, tufted sofas, wingback, antique; velvet upholstery | mahogany/walnut frames + leaves; brass hardware | crystal chandeliers, sconces, table lamps; warm | crown moldings, trim, symmetry, detailed woodwork | 1.00 |
| **Countryside / Farmhouse** | comfortable, rustic | warm white / cream / sage / dusty blue | wide-plank / reclaimed wood / stone | solid wood tables, slipcovered + oversized seating, vintage cabinets; cotton/linen/wicker | reclaimed / natural wood frames + leaves | lanterns, rustic pendants, warm LED | exposed beams, open shelving | 1.05 |
| **Japanese** | peaceful, minimalist, nature | warm white / beige / taupe; charcoal accent | tatami / natural oak / bamboo | low-profile seating, platform beds, simple wood; linen | cedar/oak frames; paper-screen leaves | paper lanterns, soft indirect, hidden LED | clean lines, empty space (ma), sliding panels | 1.00 |
| **Industrial** | urban, raw, warehouse | charcoal / gray / exposed-brick / microcement | polished concrete / dark wood / microcement | metal-framed, leather sofas, reclaimed-wood tables, vintage factory; brown leather | black-metal / steel frames; dark leaves | exposed bulbs, black-metal pendants, track | exposed pipes, brick walls, open layouts | 0.95 (slightly smaller) |

The concrete hex values reuse and extend the existing `styleFinish.ts` PALETTE_TABLE (`packages/ai-host/src/workflows/furnishLayout/styleFinish.ts:66-115`) and `floorFinish.ts` tables (`packages/command-registry/src/floors/floorFinish.ts:48-69`) for the three already-shipped styles (Nordic, Mediterranean, Classic); Farmhouse / Japanese / Industrial are new rows authored from the founder palettes above. Implementation pins exact hexes during ST.1.

## 4. The StyleRegistry

A `StyleRegistry` (pure module, mirrors `CANONICAL_STYLES`/`PALETTE_TABLE` shape) is the single source of truth:

```
export const STYLE_REGISTRY: Readonly<Record<StyleId, Style>> = { nordic, mediterranean, classic, farmhouse, japanese, industrial };
export function resolveStyle(input: unknown): Style;   // normalises aliases -> Style; default 'nordic'
export const STYLE_IDS: readonly StyleId[];
```

`resolveStyle` absorbs the existing alias maps (`normaliseStyle` `styleFinish.ts:124-140`, `normaliseFloorStyle` `floorFinish.ts:77-84`) so legacy `modern/minimal/warm` briefs keep resolving (minimalist folds into nordic/japanese per a decision in ST.1; the founder list has no Minimalist, so we map the legacy `minimal/modern` aliases to **japanese** for the clean-line read, and keep `minimalist` working as an alias to avoid breaking saved briefs/tests).

## 5. How a selected style maps onto the EXISTING element material/finish systems (audit, file:line)

The style does NOT introduce new mutation paths — it selects values the existing systems already consume:

| Element | Where material/finish is set today (file:line) | Field the style writes | How the style flows |
|---|---|---|---|
| **Furniture** | `FurnitureFragmentBuilder` reads `data.color` (hex) + builders read material; `MaterialService.getMaterial(color, ...)` builds the `MeshStandardMaterial` — `packages/geometry-furniture/src/FurnitureFragmentBuilder.ts:155-159, 232`; `packages/geometry-furniture/src/MaterialService.ts:13-48`. The style->finish lookup already exists: `styleFinishFor(style, kind) -> {color, material}` `styleFinish.ts:187-195`. | `palette.furniture.{upholstery,wood,table,metal}` (Slot) | `buildFurnishCommands` already calls `styleFinishFor` (`packages/ai-host/src/workflows/furnishLayout/buildFurnishCommands.ts`). Style descriptor SUPPLIES those slots; no builder change. |
| **Walls / interior paint** | Wall body material is `wall.materialColor` (default `#e8e8e8` / `#d4c5b0`) -> `MeshStandardMaterial({ color })` — `packages/geometry-wall/src/WallFragmentBuilder.ts:887-888, 1135-1137, 1492-1494`. Mutated via `UpdateWallColorCommand` / set on `CreateWallCommand` payload `materialColor` (`CommandRegistry.ts:164`). **No wall-finish pipeline exists** (confirmed in SPEC-FURNISHING-STYLES §6). | `palette.wallPaint` (interior), `palette.wallAccent` | NEW thin wiring (ST.3): the apartment/house generator stamps `materialColor = palette.wallPaint` on interior `wall.batch.create` payloads (and optionally a per-room accent). Founder "cream paint interior walls" = Nordic wallPaint. |
| **Doors** | `DoorSystemType` carries `frameColor`/`leafColor`/glazing which drive DoorBuilder colour — `packages/geometry-door/src/DoorSystemTypeStore.ts:13-18, 150`. Per-room default type resolved by `defaultDoorSystemTypeId(a,b)` returning `dt-*` ids — `packages/ai-host/src/workflows/apartmentLayout/resolvers/defaultElementTypes.ts:36, 84-89`. | `palette.doorFinish.{frameColor,leafColor,preferredDoorTypeId}` | ST.4: the resolver picks the wet/kitchen/privacy door type AS TODAY, then the style overrides the finish colour (light wood for Nordic, dark walnut for Classic, black-metal for Industrial). Style biases the `dt-*` choice only where a style-specific type exists. |
| **Windows** | `WindowSystemType` (`wt-*`) frame finish; per-room default by `defaultWindowSystemTypeId(roomType)` — `defaultElementTypes.ts:39, 145-147`. | `palette.windowFinish.{frameColor,preferredWindowTypeId}` + `palette.glazingBias` (size) | ST.4 finish + ST.5 size bias (see §6). |
| **Floors** | `floorFinishFor(occupancy, style) -> {finishColor, finishPattern, materialName}` already per-style — `packages/command-registry/src/floors/floorFinish.ts:91-102`; fired by `CreateFloorsByRoomTypeCommand`. | `palette.floorFinish` (delegates) | Already wired for 3 styles; ST.2 adds Farmhouse/Japanese/Industrial rows to the timber/wet/dry tables. |
| **Lighting** | (D-CE/light engine — `apartment -> CEIL -> furnish -> light` chain) | `palette.lighting.{fixtures,toneKelvin}` | ST.6 (optional, later): the light emitter reads the style fixture family + tone. |

**Style hint on the program -> per-element selection.** The selected style rides as a single string on the brief (`getActiveDesignMetadata().style`, same field SPEC-FURNISHING-STYLES §5 already threads). The generation pipeline resolves it once via `resolveStyle()` and passes the `Style` (or its id) into each emitter: furniture (existing), floors (existing), and the NEW wall-paint / door-finish / window-finish / glazing-bias stamps. No new mutation path — each emitter writes the existing field (`materialColor`, door `frameColor`/`leafColor`, window frame, floor finish) the element system already renders.

## 6. Window-size (glazing) bias feeding window emission

Window widths come from `WINDOW_SPECS[roomType].widthMm` and are already scaled per-window by a CLIMATE factor in the emission engine — `packages/ai-host/src/workflows/apartmentLayout/windowEmission/emitWindows.ts:433-443` (`climateGlazingFactor`), with the catalogue at `windowEmission/types.ts:66-75` (living 2000, dining 1800, bedroom/master 1500, kitchen 1200, wet 600 mm).

**ST.5 adds a STYLE glazing bias** that multiplies `chosenWidthMm` (and height) by `palette.glazingBias` at the same clamp site as the climate factor (`emitWindows.ts:433-443`), composing multiplicatively with climate: `widthMm = clamp(spec.widthMm * climateFactor * style.glazingBias, minWidthMm, wallHostable)`. The existing `maxWidth = wallLen - 2*clearance` clamp and the corner-setback (`endSetbackMm`) already guarantee the bigger window still hosts on the wall, so the bias can never overflow a façade.

**Styles that want BIGGER windows:** **Mediterranean** (glazingBias ~1.25 — founder "big windows", indoor-outdoor) and **Nordic** (~1.20 — founder "large windows", maximise daylight). Classic/Farmhouse/Japanese stay ~1.0-1.05; **Industrial** ~0.95 (smaller punched openings vs the raw shell, though feature steel-glazing can override). The bias is per-style data, so the founder's "Mediterranean = big windows" is a one-number change in the descriptor.

## 7. Design constraints (v1)

- **Finishes + glazing-size only.** A style changes colour, material, finish, and window SIZE bias — never room layout or element placement.
- **Pure + deterministic.** StyleRegistry has zero imports (like `styleFinish.ts`); resolvers import only types.
- **Reuse existing mutation paths.** No new command verbs for finishes; emitters write existing fields (`materialColor`, door/window finish, floor finish, window width).
- **Back-compat.** Legacy `modern/minimal/warm/minimalist` briefs keep resolving via `resolveStyle` aliases; saved projects unaffected.
- **Typology-agnostic.** Apartment OR house brief drives the same style (per the platform-spine north-star).

## 8. Phased plan ST.1–ST.7

- **ST.1 — Style descriptor + StyleRegistry. ✅ DONE (2026-06-12).** `packages/ai-host/src/workflows/furnishLayout/style/StyleRegistry.ts` — pure LEAF module (zero imports). Exports `STYLE_REGISTRY` (6 `StyleDescriptor`), `STYLE_IDS`, `DEFAULT_STYLE_ID`, `resolveStyleId`/`resolveStyle` (absorbs BOTH legacy alias maps — `styleFinish.ts` ALIASES + `floorFinish.ts` synonyms; `minimal`/`modern`/`minimalist`/`contemporary` fold onto **japanese** per §4), and `glazingBiasFor`. The 3 shipped styles reuse the exact `styleFinish.ts` hexes; Farmhouse/Japanese/Industrial authored fresh. Tests: `__tests__/interiorStyleSystem.test.ts`.
- **ST.2 — Floors to 6 styles. ✅ DONE (2026-06-12).** `packages/command-registry/src/floors/floorFinish.ts` — `FloorStyle` extended to the 6 ids (legacy `minimalist` key retained for back-compat but folded to japanese in `normaliseFloorStyle`); Farmhouse/Japanese/Industrial rows added to the timber/wet/dry tables; `normaliseFloorStyle` kept LOCK-STEP with `resolveStyleId` (asserted in the new test). Floor authority stays in floorFinish.ts (no ai-host import → no package cycle).
- **ST.3 — Furniture to 6 styles. ✅ DONE (2026-06-12).** `styleFinish.ts` extended: the 3 NEW styles + their unique synonyms resolve furniture slots from the StyleRegistry; the legacy 4 styles + EVERY legacy alias keep the unchanged `normaliseStyle`/PALETTE_TABLE path → BYTE-IDENTICAL. (The **wall-paint wiring** portion of ST.3 — stamping `materialColor = palette.wallPaint` on interior wall payloads — is the cross-package follow-on and remains QUEUED.)
- **ST.4 — Door/window finish. QUEUED.** Style overrides DoorSystemType `frameColor`/`leafColor` + WindowSystemType frame after the per-room TYPE is resolved by `defaultElementTypes.ts` (light wood Nordic, dark walnut Classic, black-metal Industrial). Descriptor fields (`doorFinish`/`windowFinish`) authored in ST.1; wiring deferred.
- **ST.5 — Glazing-size bias. ✅ DONE (2026-06-12).** `emitWindowsForRoom` takes an optional `glazingBias` (default 1 → byte-identical) that multiplies window width/height, composing MULTIPLICATIVELY with the climate factor (`width = spec × climate × bias`). Still respects §WINDOW-SPAN-FIT (band/corner-pier clamp) + §WINDOW-HEAD-FIT (head capped at `MAX_WINDOW_HEAD_MM`). Threaded `EmitGeometryOpts.glazingBias` → `emitGeometry` → `generateDeterministicLayouts(style)` (resolves via `glazingBiasFor`) → `GenerateLayoutInput.style`, the SAME seam as the climate `siteLatitudeDeg`. The editor populating `input.style` is the (small) remaining wiring step.
- **ST.6 — Lighting fixtures (optional/later). QUEUED.** Light emitter reads `palette.lighting` fixture family + tone (authored in ST.1).
- **ST.7 — Picker + brief. QUEUED.** Replace the 4-option `style` select in both typology manifests (apartment + casa) with the 6 styles; default `nordic`. Wire the modal preview swatch.

## 9. Contract note

This is a SPEC. When built it crosses furniture + walls + doors + windows + floors + lighting + the brief, and centralises a material authority — that warrants a future **C-number** (Interior Style / Material Authority contract) governing the StyleRegistry as the single source of finish truth, analogous to how C17 governs the batch catalogue. Until then, this SPEC + the existing SPEC-FURNISHING-STYLES (which it supersedes in scope for furniture+floor) govern.

## 10. Files (existing, audited) and new surfaces

| File | Role | This SPEC |
|---|---|---|
| `packages/ai-host/src/workflows/furnishLayout/styleFinish.ts` | furniture per-style {color,material} | reused; descriptor supplies slots (ST.1) |
| `packages/command-registry/src/floors/floorFinish.ts` | per-style floor finish | extend to 6 styles (ST.2) |
| `packages/geometry-wall/src/WallFragmentBuilder.ts:887,1135,1492` | wall `materialColor` render | target of ST.3 wall-paint stamp |
| `packages/geometry-door/src/DoorSystemTypeStore.ts:13-18,150` | door frame/leaf finish | target of ST.4 |
| `packages/ai-host/.../resolvers/defaultElementTypes.ts:84-89,145-147` | per-room door/window TYPE | finish overridden by ST.4 after type pick |
| `packages/ai-host/.../windowEmission/emitWindows.ts:433-443` + `types.ts:66-75` | window width + climate factor | glazing bias site (ST.5) |
| NEW `packages/.../style/StyleRegistry.ts` | the descriptor + registry + resolveStyle | ST.1 |
| `packages/typology-pack-apartment/src/manifest.ts`, `...casa-unifamiliar/src/manifest.ts` | `style` brief select | 6 options (ST.7) |
