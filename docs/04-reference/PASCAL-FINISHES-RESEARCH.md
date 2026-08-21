# Pascal Editor — finishes, materials and render pipeline: measured research

> **Stamp**: 2026-08-21 · **Lane**: MAT-R (L-1680–L-1689) · **Status**: RESEARCH — not a contract,
> not a plan. The normative plan this feeds is
> **[C100 §10](../02-decisions/contracts/C100-MASTER-MATERIAL-DATABASE.md)**. Nothing here is binding.
> **Subject**: `https://github.com/pascalorg/editor` (the editor behind `https://editor.pascal.app`),
> measured at `main` on **2026-08-21** (`pushed_at` 2026-08-21T06:02:39Z — it moves; re-run the commands).
> **Founder request**: *"I want to be able to apply similar finishes than pascal have in walls
> interiors… check the graphics — our WebGPU… grab all the finishes — for roof — tiling — walls —
> parket… get all of them in the material library C100 and accessible all via UI / RAC."*
> **Extends, does not replace**: [`pascalorg-editor-research.md`](architecture-detail/pascalorg-editor-research.md)
> (2026-05-25), which covers **architecture** and says nothing about materials or render quality.
> ⚠ That note is **stale on one measured fact**: it records **3 packages**; there are now **10** (§A.0).

---

## ⛔ §0 — THE LICENCE CONSTRAINT, FIRST, BECAUSE IT BINDS EVERYTHING BELOW

### §0.1 — What was measured

| subject | measurement | source |
|---|---|---|
| **Repo licence** | **MIT** | `https://api.github.com/repos/pascalorg/editor` → `"license": {"key":"mit","spdx_id":"MIT"}` |
| LICENSE files in tree | **2** — `LICENSE` (1074 B), `packages/cli/LICENSE` (1074 B); 1074 B is MIT boilerplate length | tree walk |
| **CREDITS / ATTRIBUTION / NOTICE / THIRD-PARTY file** | ⛔ **ZERO — none exists anywhere in the repository** | tree walk, basenames matching `license\|licence\|credit\|attribut\|notice\|copyright\|third-party` |
| Texture asset files | **288 files, 16.9 MB**, under `apps/editor/public/material/**` | tree walk |
| GLB furniture models | **146 files, 13.7 MB** | tree walk |
| tree completeness | **2747 blobs, `"truncated": false`** — a complete walk, not a sample | git-tree API |

```
curl -sS -L "https://api.github.com/repos/pascalorg/editor/git/trees/main?recursive=1" -o tree.json
python -c "import json,collections; d=json.load(open('tree.json')); ..."
  -> truncated: False · total blobs: 2747
  -> material asset files: 288 · 17,705,371 bytes (16.9 MB)
  -> by ext: {'ktx2': 62, 'webp': 159, 'jpg': 65, 'png': 2}
  -> by family dir: {flooring:105, wood:84, concrete:29, fabric:26, roofing:20, metal:15, leather:9}
  -> attribution/licence files: LICENSE (1074), packages/cli/LICENSE (1074)   <- and nothing else
```

### §0.2 — The verdict, in two parts, because they are NOT the same answer

⭐ **The code and the taxonomy are one question; the texture bitmaps are a different one, and
conflating them is the mistake this section exists to prevent.**

**(a) THE CODE — MIT, genuinely permissive.** MIT permits reuse, modification and commercial use
provided the copyright notice and licence text are retained. So the honest answer to *"can we reuse
anything?"* is **legally yes, for the code**, subject to attribution. ⚠ **This lane still recommends
TAXONOMY-AND-PARAMETERS-ONLY — for architectural reasons, not legal ones:**

- C100 §1.1 fixes **one record shape** at **L0**, THREE-free. Pascal's `MaterialCatalogItem` is
  shaped for a **THREE/R3F node-material consumer** (`side: z.number()`, `flipY`, `wrapS`,
  `normalScaleX/Y`, `lightMapIntensity`). Importing that shape whole would drag renderer concerns
  into L0 and breach **P5 / C03 §1.2**.
- C100 §1.3 makes any THREE-typed view a **derived projection**. Pascal has no such split — its
  catalogue *is* the renderer payload.
- Taking the **facts** (which finishes a building editor needs; which PBR parameters each needs) is
  not a licensing question at all: **a taxonomy is an idea, not an expression.**

**(b) ⛔ THE TEXTURE BITMAPS — DO NOT COPY. Provenance is UNESTABLISHED, and MIT does not cure that.**

**A repository's MIT licence covers what its authors had the right to license.** It is not a warranty
that every binary committed into `public/` was theirs to relicense. Here the evidence that would
settle it is **absent**: no credits file, no attribution file, no NOTICE, no per-directory README —
**288 texture files and zero statements of origin.**

The filenames are affirmatively suggestive of third-party PBR libraries rather than original work —
`finewood_27`, `wood_parquet_99`, `hungarian_parquet_10`, `square_parquet_21`, `green_labradorite`,
`statuaretto`, `light_ceramic_grunge`, `tiles_checker`. Numbered-variant naming of that shape is the
house style of commercial and freemium PBR texture vendors. ⚠ **That is an inference from naming, not
a determination** — this lane did **not** identify a specific vendor and does **not** assert one. But
the correct handling of *"probably third-party, provenance unstated"* is identical to that of
*"known third-party, unknown terms"*: **treat as INSPIRATION ONLY.**

> ⛔ **RULE FOR EVERY DOWNSTREAM SLICE:** we take **the taxonomy** (which categories, which finishes a
> building editor must offer) and **the parameter set** (which PBR fields a record must carry). We
> author **our own values**, and we source **our own texture maps** under a licence we can name in
> writing. **No file under `apps/editor/public/material/**` is copied into this repository, and no
> record's numeric values are transcribed from `material-library.ts`.**

⚠ **This constraint costs us very little**, because §B.3 concludes our biggest visual gap is **not**
textures. The only axis with a licensing hazard is also the one we can defer longest.

---

## §A — THE INVENTORY

### §A.0 — Where their material system lives, and why "material" searches miss it

⚠ **Recorded because it cost this lane real time.** Pascal's *application* vocabulary is **`paint`**,
**`treatments`** and **`slots`** — not "material". A search for `material` finds the catalogue but
**none of the application path**.

Their 10 packages (was 3 in our 2026-05-25 note): `cli`, `core`, `editor`, `eslint-config`,
`ifc-converter`, `mcp`, `nodes`, `typescript-config`, `ui`, `viewer`.

| what | path |
|---|---|
| **the catalogue** | `packages/core/src/material-library.ts` — **4259 lines, 116,908 bytes** |
| the record + payload schemas | `packages/core/src/schema/material.ts` — 217 lines |
| wall paint application | `packages/nodes/src/wall/paint.ts`, `wall/treatments.tsx`, `wall/slots.ts` |
| generic slot painting | `packages/nodes/src/shared/slot-paint.ts`, `shared/surface-paint.ts` |
| THREE-side material build | `packages/viewer/src/lib/materials.ts` (25,772 B), `texture-reference.ts`, `ktx2-loader.ts` |
| the texture bitmaps | `apps/editor/public/material/**` — 288 files |

### §A.1 — The size of it: 114 records, 12 populated categories

⚠ **Measured twice by two different tokens, which agree.** A WebFetch summarisation of this file
estimated *"150–170 records"* and listed *16* categories; **both were wrong** — 16 is the length of
the `MATERIAL_CATEGORIES` const, not the number of categories used. C100 §0.3's rule (*cite the
command, not the number*) reproducing itself on a foreign codebase.

```
curl -sS -L .../packages/core/src/material-library.ts -o pascal-material-library.ts
grep -c "^    id: '"  pascal-material-library.ts   ->  114
grep -c "preset: {"   pascal-material-library.ts   ->  114     # independent token, agrees
grep -o "category: '[a-z]*'" pascal-material-library.ts | sort | uniq -c | sort -rn
```

| category | records | textured? | what it contains |
|---|---:|---|---|
| `colors` | **45** | ⭐ **no — `maps: {}`** | flat interior/exterior paint swatches |
| `wood` | 21 | yes | plank, fine-wood, **parquet** (11 of 21 are parquet) |
| `tile` | 12 | yes | ceramic, mosaic, **pool tiles**, terracotta, checker, wood-effect |
| `metal` | 7 | yes | copper, brass, chrome, brushed/polished steel, garage panel |
| `stone` | 6 | yes | labradorite, quartzite, statuaretto marble, terrazzo, stone tile/wall |
| `fabric` | 6 | yes | linen, cotton, velvet, wool, suede, bouclé |
| `concrete` | 6 | yes | polished, raw, plate, stucco, painted plaster, prepared drywall |
| **`roofing`** | **4** | yes | classic shingles, weathered shingles, clay tiles, terracotta tiles |
| `brick` | 3 | yes | rustic, aged, weathered |
| `leather` | 2 | yes | black, calf |
| `ground` | 1 | yes | earth ground |
| `glass` | 1 | no | single preset |
| **TOTAL** | **114** | | |

Declared but **empty**: `wallpaper`, `plastic`, `carpet`, `other`. ⭐ **Four of their sixteen
categories are aspirational.** Their roofing set is **four records**; carpet is **zero**. The
founder's impression of *"a lot of nice finishes"* is driven by the **45 paints** and the **21
woods** — that is where the depth genuinely is.

### §A.2 — ⭐ The textured / parametric split — THE MOST DECISION-RELEVANT NUMBER HERE

```
grep -c "maps: {},"  pascal-material-library.ts   ->  49    # parametric, ZERO assets
grep -c "maps: {$"   pascal-material-library.ts   ->  65    # texture-backed
                                                     ---
                                                     114   OK cross-checks against A.1
```

| | records | asset cost |
|---|---:|---|
| **parametric** (colour + roughness + metalness only) | **49** | ⭐ **ZERO files** |
| **texture-backed** | 65 | 249 `.ktx2` maps + 65 `.webp` thumbnails = **314 file loads** |

```
grep -oE "^ *(albedo|ao|normal|roughness|metalness|...)[A-Za-z]*Map:" | sort | uniq -c
  ->  65 albedoMap · 65 normalMap · 53 aoMap · 46 roughnessMap · 20 metalnessMap
grep -oE "_[0-9]+\.ktx2" | sort | uniq -c   ->  249 _512.ktx2   (every map is 512x512)
```

⭐ **Three consequences:**

1. **Their entire paint offering — the founder's first screenshot — is parametric.** 45 of the 49
   asset-free records are `colors`. A matte painted wall in Pascal is a **hex + a roughness**.
2. **Every texture is 512×512.** Not 2K, not 4K. Their fidelity comes from *having a normal + AO map
   at all*, not from resolution.
3. **KTX2** (GPU-compressed, transcoded via `packages/viewer/src/lib/ktx2-loader.ts`) is what makes
   249 maps affordable. If we ever ship textures, that is a real format decision, not PNG/JPG.

### §A.3 — Their record shape, verbatim

`packages/core/src/material-library.ts:9-25` — quoted for **factual comparison** under §0.2:

```ts
export type MaterialCatalogItem = {
  id: string
  label: string
  category: MaterialCategory
  /** Origin of the entry. Absent = 'pascal' (all static catalog entries). */
  source?: MaterialSource                      // 'pascal' | 'community' | 'mine' | 'workspace'
  /**
   * Where this finish is appropriate. Absent = universal (e.g. flat colors).
   * The paint picker may filter by the slot being painted; v1 shows everything.
   */
  surfaces?: MaterialSurface[]                 // floor | wall | ceiling | roof | furniture | outdoor
  description?: string
  previewThumbnailUrl?: string
  previewColor?: string
  preset: MaterialPresetPayload                // { maps, mapProperties }
}
```

`packages/core/src/schema/material.ts` — the payload, Zod, where the **20 PBR parameters** live:

```ts
export const MaterialMapsSchema = z.object({
  albedoMap, metalnessMap, roughnessMap, normalMap, displacementMap,
  aoMap, emissiveMap, bumpMap, alphaMap, lightMap,       // all AssetUrl.optional()
})

export const MaterialMapPropertiesSchema = z.object({
  color: z.string().default('#ffffff'),
  roughness: z.number().min(0).max(1).default(0.5),
  metalness: z.number().min(0).max(1).default(0),
  repeatX, repeatY, rotation,                            // tiling
  wrapS, wrapT,                                          // 'Repeat'|'ClampToEdge'|'MirroredRepeat'
  normalScaleX, normalScaleY, bumpScale, displacementScale,
  emissiveIntensity, emissiveColor, aoMapIntensity, lightMapIntensity,
  transparent, opacity, flipY, side,
})
```

The paint in the founder's first screenshot, complete:

```ts
{ id: 'preset-white', label: 'White', category: 'colors',
  description: 'Clean painted finish', previewColor: '#e9e9e9',
  preset: { maps: {}, mapProperties: { color: '#e9e9e9', roughness: 0.9, metalness: 0, ... } } }
```

And a texture-backed one:

```ts
{ id: 'roof-classicshingles', label: 'Classic Shingles', category: 'roofing',
  surfaces: ['roof'],
  previewThumbnailUrl: '/material/roofing/roof_shingles_classic/..._thumb.webp',
  preset: { maps: { albedoMap: '..._basecolor_512.ktx2', aoMap: '..._ao_512.ktx2',
                    metalnessMap: '..._metallic_512.ktx2', normalMap: '..._normal_512.ktx2',
                    roughnessMap: '..._roughness_512.ktx2' },
            mapProperties: { color: '#ffffff', roughness: 1, metalness: 0.15, ... } } }
```

**Parameter distributions — flatter than the schema suggests:**

```
grep -o "metalness: [0-9.]*" | sort | uniq -c  ->  103x 0 · 4x 0.6 · 4x 0.1 · 1x 0.9 · 1x 0.82 · 1x 0.15
grep -o "roughness: [0-9.]*" | sort | uniq -c  ->  50x 0.9 · 30x 0.5 · 15x 0.45 · 4x 1 · 4x 0.35 · ...
grep -o "repeatX: [0-9.]*"   | sort | uniq -c  ->  91x 1 · 8x 0.5 · 4x 2 · 3x 1.5 · ...
```

⭐ 103 of 114 records are `metalness: 0`, and **all 45 paints sit at exactly `roughness: 0.9`**.
**There is no sheen model** — no matte/eggshell/satin/gloss distinction. Their paint library is a
*colour* library with one fixed matte finish. ⭐ **We are actually AHEAD here** — see §C.2.

### §A.4 — The 45 paints: palette structure (the part worth adopting)

The names are ordinary colour vocabulary; the **structure** is the transferable idea: **9 neutrals,
then 8 hue families of 3–6 steps**, every one at roughness 0.9.

| family | n | labels (verbatim, `grep "label:"`) |
|---|---:|---|
| neutrals | 9 | White · Soft White · Cream · Beige · Light grey · Greige · Mid grey · Charcoal · Near-black |
| reds | 4 | Blush · Tomato · Brick red · Oxblood |
| oranges | 4 | Peach · Terracotta · Burnt orange · Clay |
| yellows | 4 | Pale yellow · Mustard · Ochre · Gold |
| greens | 4 | Mint · Sage · Olive · Forest |
| teals | 3 | Pale teal · Teal · Deep teal |
| blues | 6 | Powder blue · Soft Blue · Sky · Slate Blue · Royal blue · Navy |
| purples | 3 | Lavender · Plum · Aubergine |
| pinks | 4 | Petal · Rose · Dusty Rose · Berry |
| browns | 4 | Sand · Tan · Taupe · Espresso |

⭐ **This is a designed architectural palette, not a colour picker** — muted, desaturated, tonally
consistent, with a deliberate light→dark ramp inside each family. That is why the screenshot reads as
*designed*. **Reproducible by us with zero assets and zero licensing exposure.**

### §A.5 — The non-colour inventory, in full (69 records)

**wood (21)** — `wood-finewood27` · `wood-floorplank1` · `wood-hungarianparquet10` ·
`wood-hungarianparquet2` · `wood-squareparquet21` · `wood-squareparquet23` ·
`wood-woodfine1/11/13/2/22/24` · `wood-woodparquet14` · `wood-woodenparquet11` ·
`wood-woodparquet121/56/65/99` · `wood-woodplank19` · `wood-woodplank48` · `flooring-woodparquet76`
→ ⭐ **11 are parquet.** This is the founder's *"parket"*, and their deepest category after paint.

**tile (12)** — Quarry Tile · **Pool Tiles** · Checker Tiles · Grid Tiles · Wooden Ceramic 2/3 ·
**Ceramic Mosaic** · Terracotta Tile · Dark Ceramic Grunge · Light Ceramic Grunge · **Mosaic Tile** ·
Pattern Tile

**stone (6)** — Green Labradorite · Stone Wall · **Terrazzo** · Stone Tile · Green Quartzite A ·
Statuaretto White

**roofing (4)** — Classic Shingles · Clay Tiles · Terracotta Tiles · Weathered Shingles

**concrete (6)** — Painted Plaster · Polished Concrete · Raw Concrete · Concrete Plate ·
White Stucco · Prepared Drywall

**brick (3)** — Rustic · Aged · Weathered · **metal (7)** — Copper · Polished · Brushed Steel ·
Brass · Chrome · Garage Panel · Metal preset

**fabric (6)** — Linen · Cotton · Velvet · Wool · Suede · Bouclé · **leather (2)** — Black · Calf ·
**ground (1)** — Earth Ground · **glass (1)** — Glass preset

⛔ **Categories the founder named that Pascal does NOT have as such**: **decking** (no record; outdoor
timber is a wood plank tagged `surfaces:[...,'outdoor']`), **carpet** (0), **wallpaper** (0),
**external cladding** (no category — brick/concrete/stone do the work), **worktops** (no category),
**landscape paving** (1 `ground` record). ⭐ **Their inventory is narrower than the screenshots
imply.** Six well-chosen textures under a good renderer beat a large catalogue under a poor one —
which is §B's whole argument.

### §A.6 — The applicability model: `surfaces` and `MaterialTarget`

Two distinct mechanisms:

- **`surfaces?: MaterialSurface[]`** on the record — a **soft filter** for the picker:
  `floor | wall | ceiling | roof | furniture | outdoor`. Their own comment: *"Absent = universal…
  The paint picker **may** filter by the slot being painted; **v1 shows everything.**"* ⚠ Declared,
  **not enforced** — an honest NOT-YET in their own source.
  Distribution: `['floor']` 20 · `['floor','wall']` 11 · `['furniture','wall']` 8 ·
  `['floor','wall','furniture']` 7 · `['furniture']` 6 · `['wall','floor','outdoor']` 5 ·
  `['roof']` 4 · `['wall','ceiling']` 2 · six singletons.
- **`MaterialTarget`** (Zod) — **23 node kinds** that can carry a material: `wall, roof,
  roof-segment, stair, stair-segment, fence, column, slab, ceiling, door, window, shelf, cabinet,
  chimney, skylight, dormer, box-vent, ridge-vent, turbine-vent, cupola, eyebrow-vent, gutter,
  downspout`. Grouped into `WALL_TARGETS`, `SLAB_TARGETS`, `ROOF_TARGETS`, `STAIR_TARGETS`,
  `CEILING_TARGETS`.

### §A.7 — ⭐ The application model: they paint **SLOTS**, not elements — **SIXTEEN per wall**

The most architecturally interesting finding, and the one that maps directly onto our own in-flight
`SET_WALL_SIDE_FINISH_BATCH` work.

A Pascal wall is not *one* painted thing. `packages/core/src/schema/nodes/wall.ts:100-129`, verbatim:

```ts
export const WALL_SURFACE_SLOT_DEFAULTS = {
  interior: 'library:concrete-drywall',
  exterior: 'library:concrete-drywall',
  lowerInterior: 'library:concrete-drywall',
  middleInterior: 'library:concrete-drywall',
  upperInterior: 'library:concrete-drywall',
  topInterior: 'library:concrete-drywall',
  lowerExterior: 'library:concrete-drywall',
  middleExterior: 'library:concrete-drywall',
  upperExterior: 'library:concrete-drywall',
  topExterior: 'library:concrete-drywall',
  skirtingInterior: WALL_SKIRTING_SLOT_DEFAULT,   // 'library:preset-softwhite'
  skirtingExterior: WALL_SKIRTING_SLOT_DEFAULT,
  crownInterior: WALL_CROWN_SLOT_DEFAULT,         // 'library:preset-white'
  crownExterior: WALL_CROWN_SLOT_DEFAULT,
  chairRailInterior: WALL_CHAIR_RAIL_SLOT_DEFAULT, // 'library:preset-cream'
  chairRailExterior: WALL_CHAIR_RAIL_SLOT_DEFAULT,
} as const
export type WallSurfaceSlotId = keyof typeof WALL_SURFACE_SLOT_DEFAULTS
```

⭐ **Sixteen paintable slots per wall** — both sides × (4 vertical bands + the whole face) **plus six
trim slots**: skirting, crown and chair-rail, interior and exterior. That is dado / wainscot /
picture-rail / skirting joinery as a **first-class data concept**, and it is why their interiors read
as *designed* rather than *coloured*. Band geometry is separately parametric —
`faceBands: { enabled, count 1..4, lowerHeight 0.84, middleHeight 0.61, upperHeight 0.61 }`.

⭐ **Every default is itself a `library:` ref into the catalogue** — not a hard-coded colour. So
"unpainted" is still a *named* material. **We should copy that**: it is C100 §2.1's ladder with the
bottom rung filled by a catalogue row rather than a literal.

`WALL_ARRAY_SLOT_INDEX` (`nodes/src/wall/paint.ts:29-40`) maps ten of the sixteen onto THREE
material-array indices (index 0 is the edge/cap). `resolveWallRole()` picks the slot from a
**four-tier fallback ladder** — `userData.slotId` → re-raycast the subtree → material-array index →
hit-normal + local-Z through the node's `frontSide`/`backSide` semantics, band-resolved by hit
height — and ⭐ **refuses to paint when the click is too oblique** (`Math.abs(normalZ) < 0.65`),
returning `null` rather than guessing. That refusal is good practice and matches our own doctrine.

### §A.7b — ⭐ Their storage model is a REFERENCE model, and it maps cleanly onto C100 §2

**A node persists REFS, never materialised properties.** `packages/core/src/schema/nodes/wall.ts:143-158`
— the live field is **one line**:

```ts
  // Per-slot material overrides on the unified slot model... Key = slot id,
  // value = a `MaterialRef` (`library:<id>` / `scene:<id>`). Absent = the
  // declared slot default (`WALL_SLOT_DEFAULT`). The legacy `*Material*` fields
  // above are read only by the load migration that moves them into `slots`.
  slots: z.record(z.string(), z.string()).optional(),
```

Two ref namespaces (`material-library.ts:4220-4253`):

| ref | resolves against | tier |
|---|---|---|
| `library:<catalogId>` | `MATERIAL_CATALOG` — global, immutable | ≈ our **T1 built-in** |
| `scene:mat_<id>` | `useScene().materials` — per-scene palette, persisted, mutable | ≈ our **T2 project** |

⭐ **This is C100 §1.1's two-tier model and C100 §2.1's REFERENCE rule, independently arrived at.**
And the one-off-colour path is instructive: rather than inlining a hex,
`resolveSlotPaintMaterialRef()` **mints a scene material** — and first runs
`findMatchingSceneMaterial()`, a **structural deep-equal dedupe**, so painting the same custom colour
twice reuses one palette entry. Editing that entry then repaints every element referencing it. That
is exactly C100 §2.2's *"editing a master row changes every element that references it"* property,
extended to user-authored colours.

⚠ **Their slot model is MID-MIGRATION, not universal.** `SlabNode` has it (2 slots: `surface`,
`side`). ⛔ **`RoofNode` does not** — it still carries eight discrete inline fields (`material`,
`topMaterial`, `edgeMaterial`, `wallMaterial` + presets) with a hand-written
`getEffectiveRoofSurfaceMaterial(node, role)` fallback walker. **Worth knowing before citing Pascal
as a finished reference: they are part-way through the same convergence C100 §9.6 describes.**

### §A.7c — `createSlotPaintCapability`: a generator, and it is our C67 pattern

`packages/nodes/src/shared/slot-paint.ts` is a **factory** returning a `PaintCapability`,
parameterised by only what genuinely differs per kind. Its own header:

> *"The commit / resolve / effective-material logic is identical across kinds; only the slot-resolution
> from a pointer hit and the mesh preview differ, so those are injected per kind."*

```ts
export type SlotPaintConfig = {
  materialTarget?: MaterialTarget
  resolveRole: (args: PaintResolveArgs) => string | null
  applyPreview: (args: PaintPreviewArgs) => (() => void) | null
  legacyEffective?: (node, role) => {...} | null
  roomScope?: boolean          // opt into the painter's 'room' scope (walls, slabs)
}
```

`PaintCapability` hangs off the node registry (`packages/core/src/registry/types.ts:1573`) beside
`slots?: (node) => SlotDeclaration[]`, where `SlotDeclaration = { slotId, label, default? }`.
**Adoption: 20 kinds ship a `paint.ts`, 13 ship a `slots.ts`.** The thinnest binding is **25 lines** —
`shared/surface-paint.ts` exports one shared capability with `resolveRole: () => 'surface'` for every
kind that is a single paintable surface.

⭐ **That is structurally our C67 §1.3 table-row generator pattern** (`CapabilityExecutionSpec` /
`CatalogueFamilies` / `PropertyVocabulary`), arrived at independently — a genuine validation of our
direction, and evidence the generator shape is the right one for finishes specifically.

Two further ideas worth recording:

- ⭐ **Slot ids can be DERIVED from glTF material names.** `packages/core/src/lib/slots.ts` (27 lines):
  a Blender material named `slot_bed_frame` becomes a paintable slot **with zero code**
  (`SLOT_MATERIAL_PREFIX = 'slot_'`, `.001` dedupe suffix stripped). Declared slots win; mesh-derived
  tags are the fallback. **This is how a furniture catalogue becomes recolourable without a table.**
- **Paint scope fans out from one click** (`paint-scope.ts:29-62`):
  `single | object | matching | room`, each offered only when the node supports it —
  `object` when >1 slot, `matching` when the node has an asset, `room` only for walls and slabs.

### §A.8 — ⛔ Where their model is WEAKER than our contract — do not import the weakness

Stated because it would be easy, in an admiring comparison, to copy a defect:

1. ⛔ **They silently fall back — at EVERY level, confirmed by reading the catalogue path too.**
   `resolveMaterial()` in `schema/material.ts` opens
   `if (!material) { return DEFAULT_MATERIALS.white }`, and the *catalogue* path is three chained
   silent nulls: `getCatalogMaterialById` → `undefined` for an unknown id (`material-library.ts:4215`)
   → `getMaterialPresetByRef` → `null` (`:4255`) → `createMaterialFromPresetRef` → `null`
   (`viewer/lib/materials.ts:540-546`) → absorbed by a caller's `?? baseMaterial(shading)`
   (`wall-materials.ts:99-103`). **No throw, no warning, no magenta.**
   ⭐ **A scene referencing `library:some-removed-id` renders as the untextured base material and is
   indistinguishable from a wall that was never painted.** `MaterialRef` is a bare
   `export type MaterialRef = string` — there is **no unresolved state anywhere in their type
   system**. And it is a *reachable* state, not theoretical: `registerLibraryMaterials` /
   **`unregisterLibraryMaterials`** let a host remove catalogue entries at runtime.
   ⭐ This is our own §CONTEXT-DATA-HONESTY family verbatim — *failure and empty are the same value* —
   and it is precisely what **C100 §5** forbids and what our beige default (C100 §1.2) already cost us.
2. **They silently coerce an unknown id.** `preset: MaterialPreset.catch('custom')`, commented
   *"Coerce unknown presets (legacy/AI-generated data) to 'custom' instead of throwing."* A drifted
   id becomes a valid-looking custom material — **C100 §9.5**'s drift, unnoticed *because nobody
   resolves it*.
3. ⛔ **`surfaces` is declared, authored, and DEAD** — see §A.9. 65 of 114 records carry it and
   **nothing reads it.**

⭐ **We are architecturally ahead on all three, and C100 §5 is why.** **Adopt their taxonomy, their
slot model and their generator; do NOT adopt their resolution ladder.**

### §A.9 — Their UI picker, and the one thing they authored but never wired

`packages/editor/src/components/ui/controls/material-picker.tsx` (206 lines). Its own docstring:
*"Catalog material picker: a fixed row of category tabs and a source filter row over a scrollable
grid of swatches."*

- **Category tabs**, filtered to non-empty —
  `MATERIAL_CATEGORIES.filter(c => getMaterialsForCategory(c).length > 0)` — so **12 of the 16 render**
  and the four empty ones never appear. ⭐ **A good pattern: the empty category is invisible rather
  than an empty shelf.**
- **Source filter**: `All / Pascal / Mine / Workspace / Community`. Only `pascal` has content in the
  OSS repo (all 114 omit `source`; `filterBySource` reads `item.source ?? 'pascal'`). Mine/Community
  are scaffolding for a hosted service.
- **Swatch grid** `repeat(auto-fill, minmax(72px, 1fr))`, aspect-square — `previewThumbnailUrl` as an
  `<img>`, else flat `previewColor`, else `#f3f4f6`.
- ⛔ **There is NO search box.** Category + source tabs only. **We already do better** — our
  `MaterialsBucket.ts` is searchable over 205 rows.
- Host panel `material-paint-panel.tsx` composes picker + scene-material list + an eraser and a
  reset-to-default; `createCustomMaterial` mints a blank scene material into **the same grid**, so
  user materials and shipped catalogue are distinguished only by ref namespace.

⛔ **THE FINDING: the picker does NOT filter by `surfaces`, and the prop to do it is accepted and
discarded.**

```ts
export type MaterialPickerProps = {
  ... nodeType?: MaterialTarget; hideSideControl?: boolean ...
}
export function MaterialPicker({
  selectedMaterialPreset, onSelectMaterialPreset, disabled = false, onCreateMaterialRequest,
}: MaterialPickerProps) {          // <- nodeType and hideSideControl are never destructured
```

⭐ **So you can paint roof shingles onto a worktop.** They paid the authoring cost on 65 records and
never wired the consumer — the *declared-but-unreachable* shape our own
§AUTHORED-BUT-UNWIRED memory names. **That is a cheap, real differentiator for us**: if we author an
applicability facet, we must ship its filter in the same slice, or not author it.

---

## §B — THE GRAPHICS COMPARISON

### §B.1 — Side by side, measured on both sides

⭐ **The headline is not what anyone expected: on FOUR of the seven axes we are already identical.**

| axis | Pascal | PRYZM | verdict |
|---|---|---|---|
| renderer | WebGPU + WebGL2 fallback (`lib/renderer-capability.ts`) | WebGPU → WebGPU/WebGL2 → WebGL (`RendererHandleFactory.ts:145-270`) | ✅ **parity** (ours has 3 rungs) |
| tone mapping | `ACESFilmicToneMapping` (`index.tsx:541`) | `ACESFilmicToneMapping` (`WebGPURendererAdapter.ts:159`) | ✅ **identical** |
| exposure | 0.9 / 1.0 per theme (`scene-themes.ts:45,67`) | **0.9** (`WebGPURendererAdapter.ts:160`) | ✅ **identical** |
| colour space | sRGB out | `SRGBColorSpace` (`:158`) | ✅ **identical** |
| **environment / IBL** | 64×32 procedural gradient `DataTexture`, `environmentIntensity` 0.6 | **64×32 procedural gradient `DataTexture`**, intensity 1.0 (`NeutralStudioEnvironment.ts:64-79`) | ⚠ **same architecture, different COLOUR — see §B.2** |
| shadows | `PCFShadowMap`, single 1024² per directional light, **not cascaded** — frustum fit to *building* bounds (site excluded), refreshed every 0.4 s, margin ×1.15 | `PCFShadowMap` (`WebGPURendererAdapter.ts:157`), **one** casting light, 512²/r1 at ≥1200 meshes, off at ≥8000 | ≈ parity in kind; ⚠ **ours is coarser at scale**, and their building-fit frustum is a better answer than CSM for this scene class |
| **AO / GI** | ⭐ **SSGI `enabled: true` — ON by default**, AO-only (`giIntensity: 0`, `aoIntensity: 1.5`), cheap (`sliceCount 1`, `stepCount 4`, `radius 1`), denoised | ⛔ **SSGI `false` in ALL FOUR TIERS**; user-opt-in only | ⛔ **THE GAP** |
| **anti-aliasing** | ⛔ **NONE** — no MSAA/TAA/FXAA/SMAA anywhere, no AA pass in their `RenderPipeline` | ⛔ **NONE** — `antialias: false` (`:140`) + TRAA off in all tiers + **TRAA broken when on (L-1513)** | ≈ **parity — BOTH have none** (see correction below) |
| grade | `contrast 1.05`, `saturation 1.1` before tone map | none | ⛔ we have none |
| dpr / frameloop | capped **1.25** (coarse pointer) / **1.5**; `frameloop="never"` + explicit `FrameLimiter` | not measured here | ⚠ they are explicitly thermal-budgeted |
| textures | 65 texture-backed records, 288 files | ⛔ **ZERO** | ⛔ gap (floors/roofs) |

> ⚠ **CORRECTION, made against this lane's own first draft.** That draft ranked anti-aliasing as a
> gap where *"every edge in our viewport is aliased; none of theirs is."* **That is false.** Measured,
> **Pascal ships no anti-aliasing either** — no MSAA, no TAA, no FXAA, no SMAA, and no AA pass in
> their `RenderPipeline`. The honest statement is **parity at zero**. What remains true, and is
> smaller, is that **our TRAA toggle is present, advertised and broken** (L-1513) whereas they simply
> never offer one — a *user-trust* defect rather than an image-quality gap. ⭐ Recorded rather than
> quietly edited, because inventing an advantage for the subject you are admiring is exactly the
> failure mode this document is supposed to guard against.

### §B.2 — ⭐ The two findings that reframe the whole question

**(1) We already built their IBL trick — and then made it achromatic.**

Pascal's `scene-environment.tsx` and our `NeutralStudioEnvironment.ts` are **the same idea, the same
size (64×32), the same equirect mapping, both procedural, both zero-asset**. Pascal's own comment
records that they *deleted* `venice_sunset_1k.hdr` to get there. We have **zero `.hdr`/`.exr` in the
repo** and pin `storedHdri = 'none'` in Phase 5. **Convergent design, independently.**

The difference is **three numbers**:

| stop | Pascal (linear) | PRYZM (linear) |
|---|---|---|
| ZENITH | `[0.40, 0.56, 0.78]` — **cool blue** | `[0.92, 0.95, 1.00]` — near-white |
| HORIZON | `[0.95, 0.84, 0.66]` — **warm** | `[1.00, 0.99, 0.96]` — near-white |
| GROUND | `[0.38, 0.35, 0.30]` | `[0.34, 0.32, 0.30]` |

⭐ **Pascal's environment has real chromatic variation; ours is deliberately flat white.** Their
comment states the intent: *"the vertical color split means upward-facing surfaces read cooler than
vertical ones instead of everything getting the same directionless warm wash."* Ours states the
opposite intent, and it is **a defensible reason, not an oversight** (`NeutralStudioEnvironment.ts:73-75`):
*"It is NOT a sky: a saturated blue zenith would tint every metal in the product blue."*

⚠ **So this is a genuine TRADE, not a bug** — and it is worth re-opening, because a horizontal
surface and a vertical surface currently receive **the same colour of light**, which is precisely
what makes a form read as flat. **It is a three-line experiment.** ⛔ It is **not** this lane's to
change: it repaints every metal in the product, which is a C04 decision with a founder-visible
outcome.

**(2) They kept AO ON by making it CHEAP; we turned it OFF and it is user-opt-in.**

⛔ **Correcting the brief's own framing, which this lane was given and which the measurement
falsifies:** the brief says *"our high-quality path is currently DISABLED at scale."* **It is not
disabled at scale — it is disabled at EVERY scale.** `SceneQualityTierManager.ts:169-217`:

| tier | mesh bound | ssgi | traa | shadowLevel | decorativeShadows | fullScenePbr |
|---|---|---|---|---|---|---|
| cinematic | ≤1500 | **false** | **false** | high | true | true |
| balanced | ≤2500 | **false** | **false** | high | true | false |
| performance | ≤15000 | **false** | **false** | standard | false | false |
| survival | ∞ | **false** | **false** | standard | false | false |

⭐ **SSGI and TRAA are `false` in all four tiers**, with a stated reason
(`SceneQualityTierManager.ts:170-179`, §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH, founder L-59):
*"SSGINode's per-frame denoise temporal accumulation flickers ALL elements every frame, and the TRAA
colour-filter is applied via a pipeline REBUILD … that presents a ~1s BLACK frame."*

**Pascal hit the same instrument and answered differently.** They use **the very same
`three/addons/tsl/display/SSGINode.js`**, and their configuration is the answer to the flicker:
`giIntensity: 0` (no GI bounce at all — AO only), `sliceCount: 1`, `stepCount: 4`, `radius: 1`, then
**`DenoiseNode` at `radius 4`** over the AO channel. ⭐ **They did not accept SSGI's defaults and then
switch it off; they made it cheap and stable enough never to switch off.**

So the founder's `4751 meshes → tier=performance` line is real but is **not** why he has no AO. He
would have no AO at 100 meshes either.

### §B.3 — ⛔ THE HONEST VERDICT: why their images look better, ranked

| # | bucket | share | why | who fixes it |
|---|---|---|---|---|
| **1** | ⭐ **(b) RENDER PIPELINE — AO** | **the largest single share** | Their AO is **always on**; ours is **off in every tier**, and TRAA is broken when enabled (**L-1513 ⛔ OPEN**). Soft contact shading is what separates "CAD render" from "photo", and it is present in **both** founder screenshots. | a **RENDER lane — not this one** |
| **2** | **(c) ASSET QUALITY — textures** | large, **floors and roofs only** | Parquet and shingle are *pattern*, and pattern is a texture. With no albedo/normal map a wood floor is a brown rectangle. This is screenshot #2 (roof courses, plank joints, pool mosaic). | this lane's **later** slices — ⛔ blocked on asset hosting (§B.5) |
| **3** | **(b) RENDER PIPELINE — the GRADE** | small, and very cheap | They apply a scene-referred grade **before** tone mapping — `contrast 1.05`, `saturation 1.1` — with a stated reason: *"AgX/ACES rolls highlights off gently but reads flat on its own."* We apply none, so our frame is the flat version of the same tone curve. **Two numbers.** ⛔ **NOT anti-aliasing** — see the correction in §B.1; neither product has AA. | a RENDER lane |
| **4** | **(b) IBL chromaticity** | small but real | Three numbers (§B.2). A flat-white environment lights a wall and a floor identically. | C04 decision |
| **5** | ⭐ **(a) MATERIAL DEFINITION** | **smallest — but cheapest to fix, and the only BIM-correct one** | Their painted walls are `#e9e9e9 @ roughness 0.9` — **we can already express that exactly** (§C.2). Our real defect is not poverty of the record, it is that **a wall in a real project has no `materialId` assigned at all** (C100 §9.10.2) and that **five finish families are literally empty** (§C.3). | **this lane** |

> ⛔ **The claim this lane refuses to make:** *"a better material library will make our renders look
> like Pascal's."* **It will not.** Ranks 1, 3 and 4 are another lane's work and together they
> outweigh rank 5. Saying otherwise would be exactly the over-claim C100 §9 exists to correct.
>
> ⭐ **What a material library DOES buy, and it is worth buying:** an *authorable, nameable,
> schedulable, exportable* finish on every surface. That is a **BIM requirement**, independent of how
> pretty the frame is — an IFC export cannot classify a colour, and a schedule cannot count one.

⭐ **The most useful single sentence here:** *the founder's first screenshot — matte grey walls, plank
floor, white door — is mostly **AO + palette**, and only slightly texture.* **We can move a long way
toward it without solving asset hosting at all.**

### §B.4 — What our pipeline actually composites at the founder's 4751 meshes

Stated plainly because it is the honest baseline: **no AA, no AO, no GI, no reflection probes, no
PBR tuning pass, 512² single-light shadows at PCF radius 1, untextured flat-colour
`MeshStandardMaterial`, lit by a 64×32 achromatic gradient.**

The canonical wall material, complete (`plugins/wall/src/committer/material-bridge.ts:42-51`):

```ts
new THREE.MeshStandardMaterial({
  color: new THREE.Color(color),
  roughness: PRYZM1_WALL_ROUGHNESS,   // 0.85
  metalness: PRYZM1_WALL_METALNESS,   // 0.05
  side: THREE.DoubleSide,
});
```

⚠ **And a finding worth its own line, because it is the §COMMITTED-IS-NOT-REACHABLE shape:** the
texture plumbing **half exists**. `matDef.textures.normal` / `.roughness` are **read at seven sites**
(`WallFragmentBuilder.ts:4681`, `SlabFragmentBuilder.ts:1561`, `RoofFragmentBuilder.ts:179`,
`CurtainWallBuilder.ts:2172,2219`, `CurtainWallInstanceManager.ts:228`, `initUI.ts:2392`) — and
**`.textures` is never written by anything.** `materialLibrary.ts`'s `project()` returns
`{ id, label, category, params }` with no `textures` key, so **all seven reads resolve `undefined`
on every element, every frame.** The consumers for a texture already exist; the producer does not.

### §B.5 — ⛔ ASSET HOSTING IS A NAMED, UNSOLVED DEPENDENCY

This is why §10's first slice must be asset-free.

- `.dockerignore:139-148` — **`public/items` (~185 MB of GLB) is excluded from the prod image by
  design**: *"they belong on object storage (Supabase Storage / CDN). TEMP TRADE-OFF: the in-app
  furniture/items catalog GLBs 404 in prod until re-hosted. Tracker: OBJECT-STORAGE-GLB."*
- **There is no `public/textures/`**, zero `.ktx2`, zero `.basis`, **zero PBR maps** in the repo.
- `SPEC-MATERIALS-REPOSITORY §3.2` is the normative plan (a shared `MaterialResolver` + lazy
  `TextureLoader`, maps keyed into the MaterialPool) — **and it is unbuilt**.
- The one live texture-ingest path, `MaterialsBucket.ts:240`, writes a **base64 data-URL** into
  `UserMaterialStore` that is rendered only as a **CSS `background-image` swatch** — ⛔ **it never
  reaches a THREE material.**

⭐ **So "ship textures" is not a material-library task; it is a bucket, a resolver and a loader, and
the same bucket that would fix the GLB 404s.** Naming it as a dependency is the honest move; treating
it as a detail is how a plan ships a catalogue that cannot load.

---

## §C — HOW OUR CATALOGUE COMPARES (summary; the full census is C100 §10)

### §C.1 — We have MORE records than they do

**205 rows / 205 unique ids / 17 categories**, every category populated
(`packages/schemas/src/materials/materialCatalog.ts`, agreed by five independent commands and two GA
gates). Pascal has **114 / 12**. ⭐ **The founder's impression that they have "a lot of nice finishes"
is not about count — we have 80% more rows.** It is about *which* finishes, and about the renderer.

### §C.2 — On paint, our record shape is BETTER and our coverage is WORSE

Our 7 `Paint & Coating` rows, verbatim:

```
paint-matte-white          #f7f5ef  roughness 0.88
paint-eggshell-warm        #eee4d2  roughness 0.42
paint-satin-charcoal       #303236  roughness 0.36
paint-limewash-cream       #e9ddc8  roughness 0.96
paint-microcement-warm-grey #bcb5aa roughness 0.64
coating-epoxy-white        #f1f2ee  roughness 0.18
coating-epoxy-grey-flake   #8a8c88  roughness 0.28
```

⭐ **We model sheen and they do not** — matte 0.88 / eggshell 0.42 / satin 0.36 / limewash 0.96,
against Pascal's flat 0.9 for all 45. **But our two axes are FUSED:** each sheen exists at exactly
one colour. There is no gloss row at all. **A user cannot ask for "satin white" or "matte charcoal".**

Pascal: **45 colours × 1 sheen.** PRYZM: **5 colours × 5 sheens, but only 5 of the 25 pairs exist.**
⭐ **The fix is a combinatorial paint model, and it needs zero assets** — that is §10's first slice.

### §C.3 — Five finish families are LITERALLY EMPTY

Measured against the live `MATERIAL_CATALOG`: **shingle 0 · parquet 0 · carpet 0 · external
render/stucco 0 · fibre-cement cladding 0.**

⭐ **Two of these are commercially damaging.** **External render/stucco = 0** while we carry 13
masonry + 8 gypsum rows — the single most common external finish in the Spanish/Mediterranean
markets our geo stack targets has **no record**. And **parquet = 0** is the founder's *"parket"*,
where Pascal has **eleven**.

Thin, with actual ids: roof tile **2** · roof slate **2** · standing-seam **2** · terrazzo **2** ·
mosaic **1** (⛔ **no pool tile at all**) · decking **1** · timber cladding ≈**1** · hardwood floor
**0 floor-designated rows** (our 26 wood/timber rows are *species and sheet goods*, not floor
products) · ceramic floor tile **4**, none floor-vs-wall designated. **Roofing is 6 rows for an
entire building system.**

### §C.4 — ⭐ The record SHAPE is the real ceiling, not the row count

`packages/schemas/src/materials/materialRecord.ts:54-72` — `MaterialRecord` is **six scalars** plus
an unused optional:

`id · label · category · color · metalness · roughness · opacity · transparent · textureUrl? · source`

**ABSENT:** `map` · `normalMap` · `roughnessMap` · `aoMap` · `repeat`/`tiling`/`scale` · `anisotropy`
· `clearcoat` · `emissive` · `transmission` · `ior` · `sheen` · `acoustic{}` · `density` · `thermal`
· `ifcClass` — **all measured at zero occurrences.** `textureUrl` exists and is **used by zero of the
205 rows**.

⛔ **No number of new rows fixes a finish family that needs a map.** Parquet, shingle and mosaic are
*pattern*; a pattern cannot be expressed as one hex. **That is the shape question §10 must sequence,
and it is why the first slice is deliberately the one that does NOT need it.**

---

## §D — WHAT COULD NOT BE VERIFIED

Listed so nothing here is read as more certain than it is.

- ⛔ **The provenance of the 288 texture bitmaps.** No attribution file exists; the vendor inference
  in §0.2 is from **naming convention only** and is explicitly **not** a determination. **This is the
  one unresolved item that actually constrains a decision.**
- ⛔ **GitHub code search was unavailable** — `api.github.com/search/code` returns **HTTP 401**
  unauthenticated, and `gh` is **not installed** here (`which gh` → not found). All enumeration was
  done by walking the git-tree API and reading raw files, which is why §A.0's vocabulary trap cost time.
- ⚠ **Nothing here was verified by running their application.** The founder's two screenshots are
  evidence of **output**, not of implementation, and were not used as evidence for any claim above.
- ⚠ **Our own render facts are code reads, not frame captures.** *"No AO composites"* follows from
  the tier table and the pipeline branch, not from a pixel diff. Per C70 §7.1 that axis is
  **UNPROVEN**, never green.
- ⚠ **Counts are of `main` on 2026-08-21**, on an actively-pushed repo. **Re-run the commands.**

### §D.1 — Three things this document asserted and then had to correct

Recorded rather than silently edited, because the corrections are the evidence that the method
worked:

1. ⛔ **"Ten wall slots"** → **sixteen** (§A.7). The first pass read `WALL_ARRAY_SLOT_INDEX` — the
   *render* index — and mistook it for the *vocabulary*. Six trim slots have no material-array index
   and were therefore invisible to that token. ⭐ **A gate that checks one spelling of a thing does not
   check the thing** — C100 §9.7's own rule, reproducing itself here.
2. ⛔ **"Their edges are anti-aliased and ours are not"** → **neither product ships AA** (§B.1). An
   invented advantage for the subject under admiration.
3. ✅ **The AgX / ACESFilmic inconsistency is RESOLVED, and it was a stale comment, not a second code
   path.** `AgX` appears **nowhere else in their codebase**; `index.tsx:541` sets
   `ACESFilmicToneMapping` and that is what ships. ⭐ **So our tone mapping is not merely similar to
   theirs — it is identical**, which is what makes §B.3's ranking possible at all.
- ✅ Also since resolved: Pascal's slot persistence model, `SceneMaterialId`, and their UI picker —
  all measured and now in §A.7b, §A.7c and §A.9.
