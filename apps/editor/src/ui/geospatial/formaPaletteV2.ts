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
 * ⚠⚠ SUPERSEDED 2026-09-06 — §RURAL-MATCHES-2D-PAGE (L-12987). THIS BLOCK USED TO EXCLUDE RURAL AS
 * AN HONEST GAP. THE EXCLUSION IS REVERSED BY A LATER FOUNDER INSTRUCTION. Both of his sentences are
 * kept here in full so the reversal is DELIBERATE AND REVERSIBLE rather than lost:
 *
 *   • THE EARLIER RULING — founder 2026-07-29, §FORMA-CTX-LANDUSE-BASE: "rustic - mountain - light
 *     brown". Raised against the defect he named in the same breath, recorded at CesiumViewport's
 *     `FORMA_PALETTE.ground`: "mountain rural is the same colour than the city urban areas". That
 *     ruling minted `FORMA_GROUND_RURAL` #D6C7A6 and `FORMA_PALETTE.rural` #CDB98C, and this block
 *     excluded both from parity.
 *   • THE LATER INSTRUCTION — founder 2026-09-06, Córdoba, with a 2D|3D split screenshot showing the
 *     3D pane dark brown between the buildings while the 2D pane is warm cream: "colours needs to
 *     match — before the colour between buildings was matching the 2d view — 3d site view needs to
 *     match ALL COLOURS to 2d maps view. DO IT!"
 *
 * ⭐ THE LATER INSTRUCTION WINS — and the exclusion's PREMISE was wrong anyway. This block asserted
 * "there is no 2D value for these to equal". There IS one, and it is measurable rather than a matter
 * of taste: `buildPastelLanduseLayers()` filters its context land-use layer with
 * `['==', ['get','kind'], 'urban']`, so a RURAL polygon in the 2D map is painted by NOTHING and what
 * shows through is the page — `FORMA_PALETTE_V2.land`. Rural's 2D value IS `land`. Aliasing rural to
 * `land` is therefore parity BY MEASUREMENT, not an invented colour, and it stays a reference like
 * every other field here.
 *
 * ⚠ WHY IT LOOKED LIKE A REGRESSION TO HIM, MEASURED (CIE L* over the composited ground plane, rural
 * drape at its α 0.9 over the urban base): BEFORE §PALETTE-PARITY-2D-3D the urban drape was #C4C1BB
 * and the rural drape #CDB98C — ΔL* 79.6 vs 77.6 = **2.0**, invisible. AFTER it, the urban drape is
 * #ECE9E3 over a #F5F2EA base — ΔL* 92.8 vs 77.9 = **14.9**. The rural hex never moved; everything
 * around it got ~15 L* lighter, which is what turned a hidden classification into a loud brown patch.
 * "Before … was matching" is an accurate report of exactly that.
 *
 * ⚠ THE CONSEQUENCE, STATED RATHER THAN DISCOVERED: matching 2D RE-OPENS the 2026-07-29 defect by
 * construction — the 2D map itself does not distinguish farmland from a city block (ΔL* land 95.5 vs
 * urban tint 92.4 ≈ 3), so a 3D view that matches it cannot either. If the founder wants them
 * distinguishable again, the smallest move that stays INSIDE the 2D palette's own values is to give
 * rural `landuseCommercial` (#EEEAE2, the nearest unused neutral; `parks`/`woodland` would read
 * farmland as parkland, which the 2D map does not claim) — NOT a re-introduced off-palette brown,
 * which is the exact drift this module exists to remove.
 *
 * ⛔ STILL NOT INCLUDED, DELIBERATELY: the PRYZM purple parcel/selection accent and the
 * proposed-massing fill — brand + semantic, not context. Untouched.
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
    /** §RURAL-MATCHES-2D-PAGE (L-12987) — terrain base under open country / mountains; was #D6C7A6.
     *  The 2D map paints rural with nothing, so the page IS its 2D value. Equal to `groundUrban` by
     *  construction now, which is what 2D does; see the SUPERSEDED block above for the consequence. */
    groundRural: FORMA_PALETTE_V2.land,
    /** §RURAL-MATCHES-2D-PAGE (L-12987) — rural land-use drape (farmland/meadow/orchard/vineyard/
     *  farmyard/allotments/greenhouse_horticulture/plant_nursery/animal_keeping); was #CDB98C. 2D
     *  filters `kind === 'rural'` OUT of its land-use layer, so the drape's 2D value is the page it
     *  would otherwise have covered. */
    landuseRural: FORMA_PALETTE_V2.land,
    /** §RURAL-MATCHES-2D-PAGE (L-12987) — rural land-use edge; was #B8A374. 2D draws no rural polygon
     *  at all, so there is no edge to equal and this takes the fill, as `landuseUrbanEdge` does. */
    landuseRuralEdge: FORMA_PALETTE_V2.land,
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
