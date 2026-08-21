// ═════════════════════════════════════════════════════════════════════════════
// §MATERIAL-MAPS-AND-TILING (L-1700) — C100 §10.2.c / §10.3.b: THE RECORD-SHAPE
// CEILING, LIFTED.
//
// C100 §10.3.b states the problem in one sentence: *"No number of new rows fixes
// a family that needs a map. Parquet, shingle and mosaic are PATTERN."* A parquet
// floor, a herringbone stave, a 600 mm porcelain tile and a slate course are not
// colours — they are geometry at texture scale, and `MaterialRecord` could not
// express them at all. Five finish families measured LITERALLY EMPTY in §10.3.a
// for exactly this reason.
//
// ⭐ WHY REAL-WORLD SIZE IN METRES, AND NOT A UV REPEAT COUNT.
// C100 §10.2.c proposed `tiling?: { repeatX, repeatY, rotation }`. That proposal
// is AMENDED here (C100 §10.9), and the reason is the whole point of the field:
//
//   A repeat count is meaningless without knowing the size of the surface it is
//   repeating across. `repeatX: 4` on a 3 m wall is a 750 mm tile; the same
//   `repeatX: 4` on a 12 m wall is a 3 m tile. The SAME MATERIAL would render as
//   two different products depending on which wall it landed on — which is the
//   §2.3 defect ("two elements both made of Oak rendering differently") re-created
//   inside one material.
//
//   A real-world size is an intrinsic property of the PRODUCT: a 600 x 600 porcelain
//   tile is 600 x 600 everywhere, a 70 mm oak stave is 70 mm everywhere. The repeat
//   is then DERIVED per surface by the adapter, which is exactly the §3 division of
//   labour — the master owns the material's identity, the adapter owns the renderer
//   state that expresses it.
//
// ⛔ WHAT IS DELIBERATELY NOT HERE (C100 §10.2.c's "DO NOT ADOPT"):
// `flipY`, `wrapS/wrapT`, `side`, `normalScaleX/Y`, `lightMapIntensity`,
// `anisotropy`. Those are RENDERER STATE, not material identity. Putting them at
// L0 would make `MATERIAL_CATALOG` a THREE payload and collapse the authority /
// projection split §1.3 exists to prevent. They belong in the adapter (§3).
//
// ⛔ AND NO `sheen` FIELD. C100 §10.2.c is explicit: sheen is *"expressed THROUGH
// `roughness`, NOT a new PBR lobe"*, and `roughness` is already on this record.
// A rival field for a value the record already carries is §1.1's "MUST NOT mint a
// second enumeration" in miniature. Verified before adding nothing.
//
// ⚠ STILL PURE (P5 / C03 §1.2). Every field below is a plain string, number or
// array of numbers. No THREE, no DOM, no I/O, no `Texture`, no URL object. The
// helpers are total functions over those values.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A LOGICAL asset path for one texture map — e.g.
 * `/items/textures/wood-parquet-plank-043/color.webp`.
 *
 * ⛔ THE `/items/` PREFIX IS MANDATORY, AND THIS EXAMPLE WAS WRONG UNTIL LANE
 * MAT-2 RAN IT. It read `/textures/…`, which `resolveCatalogAssetUrl` returns
 * UNCHANGED — the "not a catalogue path" branch — so in production it would never
 * reach the CDN and would 404 at fetch time, silently. `/items/` is the one
 * prefix the rewriter and the server-side proxy both mount. The resolver now
 * REFUSES a non-`/items/` path with a named reason rather than fetching it and
 * hoping (C84 EI-1b: a path that does not rewrite and a path that does must not
 * be the same value).
 *
 * ⛔ AND THE FORMAT IS `.webp`, NOT `.ktx2`. That was wrong too, and the same
 * lane measured it: `.ktx2` is on the proxy's `CATALOG_ALLOWED_EXT`, which reads
 * like end-to-end support, but there are ZERO `KTX2Loader` references in `src`
 * and `persistence-client/src/codec/ktx2.ts` is a stub that returns its input
 * unchanged. We can DELIVER a `.ktx2` and cannot DECODE one. KTX2 is the right
 * long-term container and is UNBUILT; the named blocker is the decoder, not the
 * bucket.
 *
 * ⛔ MUST NOT be an absolute CDN URL. The path stored here is what gets PERSISTED
 * on a project (a T2 user material) and what a T1 row carries in code; the bucket
 * it is served from is deployment configuration and has already moved once
 * (`docs/04-reference/architecture-detail/OBJECT-STORAGE-R2-DECISION.md`).
 * `resolveCatalogAssetUrl()` rewrites a logical path to the configured
 * object-storage base **at the point of fetch** — that seam exists precisely so a
 * persisted record survives a bucket move. Baking the host into the record
 * re-creates the defect that seam was built to close.
 *
 * ⛔ MUST NOT be a `data:` URL either. `MaterialRecord.textureUrl` is the existing
 * (T2-only, swatch-only) home for user uploads; see C100 §10.6 on why that path is
 * a decoy today. These maps are catalogue assets with a named licence.
 */
export type MaterialMapPath = string;

/**
 * The PBR map channels a material may carry. Every value is a
 * {@link MaterialMapPath}; every channel is independently optional, because real
 * products ship different subsets (a paint has none, a parquet has colour + normal
 * + roughness, a stone may add AO).
 *
 * ⚠ COLOUR SPACE IS NOT STORED HERE, AND THAT IS DELIBERATE. `color` is an sRGB
 * image and every other channel is linear DATA — that fact is a property of the
 * CHANNEL, not of the file, so it is a constant in the adapter rather than a field
 * a catalogue row could get wrong. (Mis-set colour space is the single most common
 * PBR defect; making it un-authorable is the cheapest way to never author it wrong.)
 */
export interface MaterialMaps {
    /** Base colour / albedo. sRGB. */
    readonly color?: MaterialMapPath;
    /** Tangent-space normal map. Linear data. */
    readonly normal?: MaterialMapPath;
    /** Per-texel roughness. Linear data. */
    readonly roughness?: MaterialMapPath;
    /** Per-texel metalness. Linear data. */
    readonly metalness?: MaterialMapPath;
    /** Ambient occlusion. Linear data. ⚠ THREE reads AO from the `uv1` attribute. */
    readonly ao?: MaterialMapPath;
    /** Height / displacement. Linear data. ⚠ Needs a tessellated surface to show. */
    readonly displacement?: MaterialMapPath;
}

/** Every channel name, in one place, so no consumer hand-lists them (C84 EI-8). */
export const MATERIAL_MAP_CHANNELS = [
    'color',
    'normal',
    'roughness',
    'metalness',
    'ao',
    'displacement',
] as const satisfies readonly (keyof MaterialMaps)[];

/** One of the six PBR map channels. */
export type MaterialMapChannel = (typeof MATERIAL_MAP_CHANNELS)[number];

/**
 * The channels whose texels are COLOUR (sRGB). Everything else is linear DATA.
 *
 * Stated once, at L0, so the adapter cannot disagree with the gate about it.
 */
export const SRGB_MAP_CHANNELS: readonly MaterialMapChannel[] = ['color'];

/**
 * The REAL-WORLD footprint of one repetition of a material's maps.
 *
 * ⭐ This is the field that makes {@link MaterialMaps} mean something. A texture
 * without a scale is wallpaper: it stretches to whatever surface it lands on and
 * the same product reads as a different product on every element. See the block
 * comment above for why metres beat a repeat count.
 *
 * ⛔ A record carrying `maps` MUST carry a usable `tiling`. This is not a
 * convention — it is checked by `tools/ga-gate/check-material-maps-tiling.ts`,
 * because a map with no scale is the exact defect this facet exists to prevent.
 */
export interface MaterialTiling {
    /**
     * `[width, height]` in METRES of ONE repetition of the map set.
     *
     * Examples: a 600 x 600 mm porcelain tile -> `[0.6, 0.6]`; a 4-plank oak
     * parquet panel photographed 1.2 m across -> `[1.2, 1.2]`; a brick-bond
     * texture covering 8 courses over 2 m -> `[2, 2]`.
     *
     * Both components MUST be finite and > 0. Zero or negative is not "no tiling",
     * it is a division by zero one layer down.
     */
    readonly realWorldSizeM: readonly [number, number];
    /**
     * Rotation of the pattern about the surface normal, in DEGREES,
     * counter-clockwise. Optional; absent means 0. This is how a herringbone
     * parquet is laid at 45 degrees without authoring a second map set — the
     * pattern is the same product laid differently, and a product laid differently
     * is not a different product.
     */
    readonly rotationDeg?: number;
}

/**
 * True iff `t` is a structurally usable tiling — both components finite and > 0.
 *
 * Pure, L0, and shared so the gate, the adapter and any future validator all ask
 * the question ONE way (C84 EI-8: one producer per question).
 */
export function isUsableTiling(t: MaterialTiling | undefined | null): t is MaterialTiling {
    if (!t || !Array.isArray(t.realWorldSizeM) || t.realWorldSizeM.length !== 2) return false;
    const [w, h] = t.realWorldSizeM;
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
}

/** True iff `m` declares at least one map channel. An empty object is NOT "has maps". */
export function hasAnyMap(m: MaterialMaps | undefined | null): boolean {
    if (!m) return false;
    return MATERIAL_MAP_CHANNELS.some((c) => typeof m[c] === 'string' && m[c] !== '');
}

/**
 * The §MATERIAL-MAPS-AND-TILING invariant, as a pure predicate so it can be
 * asserted from L0 tests, from the gate and from the adapter without three
 * spellings of one rule.
 *
 * Returns `null` when the record is well-formed on this axis, or a HUMAN-READABLE
 * reason when it is not. ⚠ It returns a reason rather than a boolean because a
 * silent `false` gives "no maps" and "broken maps" the same value — C100 §5 in
 * miniature, applied to the validator itself.
 */
export function materialMapsDefect(record: {
    readonly id: string;
    readonly maps?: MaterialMaps;
    readonly tiling?: MaterialTiling;
}): string | null {
    if (!hasAnyMap(record.maps)) {
        // A tiling with no maps is harmless but pointless; say so rather than
        // silently accepting a field nothing will ever read.
        if (record.tiling && !isUsableTiling(record.tiling)) {
            return `material '${record.id}' has a tiling but it is unusable (realWorldSizeM must be two finite values > 0)`;
        }
        return null;
    }
    const tiling = record.tiling;
    if (!tiling) {
        return `material '${record.id}' declares maps but no tiling — a texture with no real-world scale is wallpaper, not a material (C100 §10.2.c)`;
    }
    // ⚠ Read the size BEFORE the guard: inside the negative arm of a type
    // predicate over an already-narrowed value, TypeScript narrows to `never`.
    const size: readonly number[] = Array.isArray(tiling.realWorldSizeM)
        ? (tiling.realWorldSizeM as readonly number[])
        : [];
    if (!isUsableTiling(tiling)) {
        return `material '${record.id}' has an unusable tiling.realWorldSizeM [${size.map(String).join(', ')}] — both components must be finite and > 0`;
    }
    return null;
}
