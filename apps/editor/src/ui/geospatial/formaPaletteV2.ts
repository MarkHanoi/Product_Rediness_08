// §PALETTE-PARITY-2D-3D (L-12965, founder 2026-09-06 at Córdoba: "I would like exactly the same
// colours in 2d plan view and 3d site view — buildings, streets, green — everything, for all the
// countries and all the assets").
//
// WHY THIS MODULE EXISTS — THE MEASURED DIVERGENCE IT ENDS
// -------------------------------------------------------
// Until today the same seven context layers were coloured TWICE, from two unrelated literals:
//
//   layer          2D (`FORMA_PALETTE_V2`, siteMap2DStyle)   3D (`FORMA_PALETTE`, CesiumViewport)
//   buildings      #E8E1D4 / stroke #D6CFC2                  #D9D8D3 / outline #9A958C
//   streets        #D2CEC5 major (casing #C8C3B9) ·          #C9C7C2 (ONE tone for every class)
//                  #E6E2DA minor                              edge #B4B1AB
//   parks/green    #DDEBD4 (wood/forest #C9DDBF)             #A9C77E   ← loudest mismatch
//   water          #D9E9E8                                   #AEC9DB   ← loudest mismatch
//   landuse urban  #ECE9E3 @0.55 (no outline)                #C4C1BB / edge #AEABA4
//   rail           #C9C4BA hairline                          #6E6E76 / edge #54545C
//   trees          #B9CDA8 / stroke #9DB58C                  #7FA25C
//   urban ground   #F5F2EA (`land`)                          #F0EDE8 (`FORMA_GROUND_URBAN`, which
//                                                             was pinned to the SUPERSEDED v1
//                                                             `FORMA_PALETTE.land`, not to v2)
//
// Two literals for one colour is the same defect shape as a hand-copied gate number: they were
// authored to agree and drifted apart the moment either side was tuned. The fix is not to re-tune
// the 3D hexes to match — it is to DELETE the second definition. `FORMA_PALETTE_V2` below is now
// the ONE place a context colour has a value, and `FORMA_CONTEXT_3D` is a pure ALIAS TABLE: every
// field is a REFERENCE into it, never a hex. `formaPaletteParity.spec.ts` asserts that by identity
// (`toBe`), plus a source-text arm over CesiumViewport.ts, so a re-introduced literal fails a test
// instead of shipping.
//
// ⚠ WHY THIS IS ITS OWN FILE. `siteMap2DStyle.ts` is a 59 KB MapLibre STYLE BUILDER; the 3D viewport
// must not import a style builder to learn a hex. The palette moved here and `siteMap2DStyle`
// re-exports it, so every existing 2D consumer and spec keeps its import path unchanged.
//
// ⚠ THE ONE HONEST CAVEAT — SAME ALBEDO, NOT PIXEL-IDENTICAL. The 3D site view is DIRECTIONALLY LIT
// with shadows and the 2D map is flat-lit. An identical hex therefore still renders DARKER on a
// shaded face and on ground in a building's shadow. "Same base colour" is what is achievable and is
// what ships here; "pixel-identical" is not achievable while the 3D view has a sun, and no hex is
// re-tuned to fake it — a silently re-tuned hex would recreate exactly the drift this file removes.
//
// PURE. No imports, no DOM, no THREE, no Cesium — testable anywhere.

/**
 * MAP2D-PASTEL palette (STR-2D-SITE-MAP-CARTOGRAPHY §2). Low saturation throughout;
 * the ONLY saturated colour on the page stays the PRYZM purple used for the parcel
 * highlight and the draw handles, so selection never competes with cartography.
 *
 * §PALETTE-PARITY-2D-3D — this is now the SINGLE SOURCE for the 3D Forma context layers too
 * (via `FORMA_CONTEXT_3D` below). A change here moves both views together, by construction.
 */
export const FORMA_PALETTE_V2 = {
    /** Warm paper land / page background behind everything. */
    land: '#F5F2EA',
    /** Park / grass / recreation sage. */
    parks: '#DDEBD4',
    /** Wood + forest — a deeper sage than `parks`, so canopy reads as canopy. */
    woodland: '#C9DDBF',
    /** Powder blue-green water (lakes, basins, sea, rivers). */
    water: '#D9E9E8',
    /** Warm-white building mass. */
    buildingFill: '#E8E1D4',
    /** Hairline building outline. */
    buildingStroke: '#D6CFC2',
    /** Translucent duplicate-fill shadow, offset south-east under each footprint. */
    buildingShadow: 'rgba(126, 116, 100, 0.16)',
    /** Major-road fill (motorway…tertiary). */
    roadMajor: '#D2CEC5',
    /** Major-road casing — one step darker, drawn wider underneath the fill. */
    roadMajorCasing: '#C8C3B9',
    /** Minor-road fill (residential / service / unclassified). */
    roadMinor: '#E6E2DA',
    /** Footway / path / steps — drawn DASHED so pedestrian circulation reads without labels. */
    footway: '#CFCAC0',
    /** Cycleway — a faint green accent, distinguishable from a footway at a glance. */
    cycleway: '#C6D3C4',
    /** Rail hairline. */
    rail: '#C9C4BA',
    /** Industrial land-use tint (very faint). */
    landuseIndustrial: '#ECE9E3',
    /** Commercial / retail land-use tint (very faint). */
    landuseCommercial: '#EEEAE2',
    /** Muted label text. */
    label: '#77766F',
    /** Label halo against the warm paper land. */
    labelHalo: 'rgba(245, 242, 234, 0.9)',
    /** Tree / canopy symbol fill. */
    treeFill: '#B9CDA8',
    /** Tree / canopy symbol stroke. */
    treeStroke: '#9DB58C',
    /** Parcel + selection accent — the unified PRYZM purple, unchanged from today. */
    parcelAccent: '#6600FF',
} as const;

/**
 * §PALETTE-PARITY-2D-3D — the 3D Forma context layers, expressed ENTIRELY as references into
 * `FORMA_PALETTE_V2`. `CesiumViewport.FORMA_PALETTE` reads its context entries from here.
 *
 * ⛔ EVERY VALUE IN THIS OBJECT MUST BE A `FORMA_PALETTE_V2.*` REFERENCE. A hex literal here is the
 * defect this module exists to remove and `formaPaletteParity.spec.ts` fails on it.
 *
 * WHERE A 3D LAYER HAS NO EXACT 2D TWIN, the choice is stated rather than invented:
 *   • `roadMajor` / `roadMinor` — the 3D ribbons used ONE tone for every highway class while 2D
 *     draws two. They now split on the SAME class sets the 2D style uses, so a residential street
 *     is the paler tone in both views (the 3D ribbon WIDTH already split by class; only the colour
 *     did not).
 *   • `parkEdge` — 2D draws parks with NO outline. The 3D park polygon keeps its 1 px edge (it is
 *     what separates two adjoining parks on relief) and takes `woodland`, the 2D palette's own
 *     one-step-deeper green, so the edge can never be a colour 2D has never heard of.
 *   • `landuseUrbanEdge` — 2D draws NO landuse outline at all, so the 3D edge takes the SAME value
 *     as its fill: the rim disappears without touching the polygon's `outline` flag.
 *   • `railEdge` — 2D rail is a hairline with no casing; same reasoning, same value as the fill.
 *   • `roadEdge` — 2D's `roadMajorCasing` is exactly "the road tone, one step darker", which is
 *     what this casing is for. (Currently unreferenced by the ribbon renderer; aliased anyway so
 *     it cannot come back as a stray literal.)
 *
 * ⛔ NOT INCLUDED, DELIBERATELY, AND THIS IS AN HONEST GAP RATHER THAN AN OVERSIGHT:
 *   • RURAL ground + rural landuse (`FORMA_GROUND_RURAL` #D6C7A6, `FORMA_PALETTE.rural` #CDB98C).
 *     The 2D map paints NO rural tint — `PASTEL_LANDUSE_UNTINTED` leaves farmland as bare page —
 *     so there is no 2D value for these to equal. They stay 3D-only under the founder's standing
 *     §FORMA-CTX-LANDUSE-BASE ruling ("rustic - mountain - light brown"). Claiming parity for them
 *     would mean inventing a 2D colour that does not exist.
 *   • The PRYZM purple parcel/selection accent and the proposed-massing fill: brand + semantic, not
 *     context. Untouched.
 */
export const FORMA_CONTEXT_3D = {
    /** Context-building mass — was #D9D8D3. */
    buildingFill: FORMA_PALETTE_V2.buildingFill,
    /** Context-building outline — was #9A958C. */
    buildingEdge: FORMA_PALETTE_V2.buildingStroke,
    /** Street ribbon, motorway…tertiary (+ links) — was #C9C7C2 for every class. */
    roadMajor: FORMA_PALETTE_V2.roadMajor,
    /** Street ribbon, residential / service / unclassified / living_street — was #C9C7C2. */
    roadMinor: FORMA_PALETTE_V2.roadMinor,
    /** Street ribbon casing — was #B4B1AB. */
    roadEdge: FORMA_PALETTE_V2.roadMajorCasing,
    /** Lakes / rivers / basins / sea — was #AEC9DB. */
    water: FORMA_PALETTE_V2.water,
    /** Park / grass / recreation — was #A9C77E. */
    park: FORMA_PALETTE_V2.parks,
    /** Park polygon edge — was #8FB86B. */
    parkEdge: FORMA_PALETTE_V2.woodland,
    /** Urban land-use drape — was #C4C1BB. */
    landuseUrban: FORMA_PALETTE_V2.landuseIndustrial,
    /** Urban land-use edge — was #AEABA4; 2D draws none, so this equals the fill. */
    landuseUrbanEdge: FORMA_PALETTE_V2.landuseIndustrial,
    /** Rail / tram ribbon — was #6E6E76. */
    rail: FORMA_PALETTE_V2.rail,
    /** Rail edge — was #54545C; 2D rail is a hairline, so this equals the fill. */
    railEdge: FORMA_PALETTE_V2.rail,
    /** Instanced canopy blobs — was #7FA25C. */
    tree: FORMA_PALETTE_V2.treeFill,
    /** Canopy edge, for any future outlined canopy — the 2D tree stroke. */
    treeEdge: FORMA_PALETTE_V2.treeStroke,
    /** Terrain base under urban land — was #F0EDE8 (the SUPERSEDED v1 `FORMA_PALETTE.land`). */
    groundUrban: FORMA_PALETTE_V2.land,
} as const;

/**
 * §PALETTE-PARITY-2D-3D — the OSM `highway` classes the 3D street ribbon paints with
 * `FORMA_CONTEXT_3D.roadMajor`. Anything not listed takes `roadMinor`.
 *
 * These are `PASTEL_ROAD_CLASSES.ctxMajor` from `siteMap2DStyle.ts`, and they are declared HERE
 * rather than imported from there for the same reason the palette moved: the 3D viewport must not
 * import a MapLibre style builder. The parity spec asserts the two sets are equal, so a class added
 * to one and not the other fails a test rather than silently painting one view's street the other
 * view's colour.
 */
export const FORMA_CONTEXT_3D_ROAD_MAJOR: readonly string[] = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
];

/** The 3D street-ribbon colour for an OSM `highway` value. Pure; unknown ⇒ the minor tone. */
export function formaContextRoadColour(highway: string): string {
    return FORMA_CONTEXT_3D_ROAD_MAJOR.includes(highway)
        ? FORMA_CONTEXT_3D.roadMajor
        : FORMA_CONTEXT_3D.roadMinor;
}
