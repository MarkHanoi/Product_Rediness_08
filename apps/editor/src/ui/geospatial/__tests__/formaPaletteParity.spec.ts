// §PALETTE-PARITY-2D-3D (L-12965) — the 2D map palette and the 3D Forma context layers are ONE
// palette, and this spec is what stops them becoming two again.
//
// FOUNDER, 2026-09-06, Córdoba: "I would like exactly the same colours in 2d plan view and 3d site
// view — buildings, streets, green — everything, for all the countries and all the assets."
//
// THE DEFECT THIS PINS. The same seven layers were coloured from two unrelated literals — parks
// #DDEBD4 (2D) vs #A9C77E (3D), water #D9E9E8 vs #AEC9DB, buildings #E8E1D4 vs #D9D8D3, rail
// #C9C4BA vs #6E6E76, trees #B9CDA8 vs #7FA25C, landuse #ECE9E3 vs #C4C1BB, streets #D2CEC5/#E6E2DA
// vs a single #C9C7C2 — plus an urban ground base (#F0EDE8) pinned to the SUPERSEDED v1 palette.
// Two literals authored to agree, drifted. Every one of those 3D values is now a REFERENCE.
//
// ⚠ WHAT ARM A CAN AND CANNOT PROVE — stated because the weaker reading is the tempting one.
// JavaScript compares strings BY VALUE, so `toBe` cannot distinguish "this is a reference into
// FORMA_PALETTE_V2" from "somebody re-typed the identical hex here". Arm A therefore proves the
// COLOURS AGREE TODAY; it does not by itself forbid a re-introduced literal. ARM C (the source-text
// arm over `formaPaletteV2.ts` and `CesiumViewport.ts`) is the arm that forbids the literal. Both
// are needed; neither is redundant.
//
// ⚠ AND WHAT NO SPEC HERE CAN PROVE: that the two views LOOK identical. The 3D site is
// DIRECTIONALLY LIT with shadows and the 2D map is flat-lit, so an identical albedo still renders
// darker on a shaded face. Same BASE colour is the claim; "pixel-identical" is not, and pretending
// otherwise by re-tuning a hex would recreate the drift this file exists to prevent.
//
// ⚠⚠ AMENDED 2026-09-06 — §RURAL-MATCHES-2D-PAGE (L-12987). The FIRST version of this spec carved
// RURAL out as an "honest gap" (ARM E) on the premise that 2D paints no rural tint, so there was
// nothing for #D6C7A6 / #CDB98C to equal. The premise was FALSE — 2D's context land-use layer
// filters kind === 'urban', so rural land in 2D shows the PAGE, and the page is a palette value.
// The carve-out is why the founder's next screenshot (Cordoba, 2D|3D split) showed dark brown
// between the buildings: §PALETTE-PARITY-2D-3D lightened the urban drape #C4C1BB → #ECE9E3 and the
// ground base #F0EDE8 → #F5F2EA while the two rural hexes stood still, so the composited step from
// urban drape to rural drape went from ΔL* 2.0 (invisible) to ΔL* 14.9 (a loud brown patch).
// "before the colour between buildings was matching the 2d view" is an accurate report of exactly
// that. ARM E is now the SUPERSESSION record + a ratchet against the three browns coming back.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    FORMA_PALETTE_V2,
    FORMA_CONTEXT_3D,
    FORMA_CONTEXT_3D_ROAD_MAJOR,
    formaContextRoadColour,
    FORMA_KEY_LIGHT_CSS,
    cssChromaSpread,
} from '../formaPaletteV2';
import {
    PASTEL_ROAD_CLASSES,
    PASTEL_LAYERS,
    buildPastelParkLayers,
    buildPastelWaterLayers,
    buildPastelRailLayer,
    buildPastelRoadLayers,
    buildPastelBuildingLayers,
    buildPastelTreeLayer,
    buildPastelLanduseLayers,
    buildPastelBackgroundLayer,
} from '../siteMap2DStyle';
import { FORMA_GROUND_URBAN, FORMA_GROUND_RURAL, shouldLoadFormaSea } from '../formaGroundColour';
import { FORMA_QUALITY, formaBackdropClearCss, FORMA_BACKDROP_RADIAL_LIFT_CSS } from '../formaSceneQuality';
import { SITE_SCOPE_SLAB_SIDE_CSS } from '../siteScope';

/**
 * §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — CIE L* from an sRGB hex, so the silhouette arms below
 * assert a MEASURED value step instead of a hand-waved one. sRGB inverse companding, then the D65
 * luminance row (0.2126729, 0.7151522, 0.0721750), then the CIE lightness transfer. Declared here
 * rather than imported because no product code needs it — this is the spec's own instrument, and a
 * helper only tests use belongs with the tests.
 *
 * ⚠ PURE WHITE IS NOT EXACTLY 100 HERE, AND THE FIRST DRAFT OF THIS SPEC WENT RED ON THAT. The
 * published D65 row sums to 1.0000001, not 1, so #FFFFFF lands at 100.0000039 — 3.9e-6 high. The
 * arm below therefore compares at 4 decimal places, which is four orders of magnitude tighter than
 * any assertion that follows it and still cannot be satisfied by a real colour change. Rounding the
 * coefficients to make the number come out flat would be tuning the instrument to the test.
 */
function lStar(hex: string): number {
    const n = parseInt(hex.replace('#', ''), 16);
    const chan = (c: number): number => {
        const u = c / 255;
        return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    const Y =
        0.2126729 * chan((n >> 16) & 255) +
        0.7151522 * chan((n >> 8) & 255) +
        0.0721750 * chan(n & 255);
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.2963 * Y;
}

const paintOf = (layer: Record<string, unknown>): Record<string, unknown> =>
    layer['paint'] as Record<string, unknown>;
const byId = (layers: Array<Record<string, unknown>>, id: string): Record<string, unknown> => {
    const found = layers.find((l) => l['id'] === id);
    if (!found) throw new Error(`layer '${id}' not found — the 2D style renamed a layer this parity spec keys on`);
    return found;
};

describe('§PALETTE-PARITY-2D-3D — ARM A: every 3D context colour equals its 2D palette entry', () => {
    it('buildings — fill + outline take the 2D building tones (were #D9D8D3 / #9A958C)', () => {
        expect(FORMA_CONTEXT_3D.buildingFill).toBe(FORMA_PALETTE_V2.buildingFill);
        expect(FORMA_CONTEXT_3D.buildingEdge).toBe(FORMA_PALETTE_V2.buildingStroke);
    });

    it('streets — major + minor + casing take the 2D road tones (was ONE #C9C7C2 for every class)', () => {
        expect(FORMA_CONTEXT_3D.roadMajor).toBe(FORMA_PALETTE_V2.roadMajor);
        expect(FORMA_CONTEXT_3D.roadMinor).toBe(FORMA_PALETTE_V2.roadMinor);
        expect(FORMA_CONTEXT_3D.roadEdge).toBe(FORMA_PALETTE_V2.roadMajorCasing);
        // The two street tones must stay DISTINCT, or the class split is decorative.
        expect(FORMA_CONTEXT_3D.roadMajor).not.toBe(FORMA_CONTEXT_3D.roadMinor);
    });

    it('green — park + park edge take the 2D sages (were #A9C77E / #8FB86B, the loudest mismatch)', () => {
        expect(FORMA_CONTEXT_3D.park).toBe(FORMA_PALETTE_V2.parks);
        expect(FORMA_CONTEXT_3D.parkEdge).toBe(FORMA_PALETTE_V2.woodland);
    });

    it('water — takes the 2D powder blue-green (was #AEC9DB)', () => {
        expect(FORMA_CONTEXT_3D.water).toBe(FORMA_PALETTE_V2.water);
    });

    it('landuse — urban drape takes the 2D urban tint, and its edge equals its fill (2D draws none)', () => {
        expect(FORMA_CONTEXT_3D.landuseUrban).toBe(FORMA_PALETTE_V2.landuseIndustrial);
        expect(FORMA_CONTEXT_3D.landuseUrbanEdge).toBe(FORMA_CONTEXT_3D.landuseUrban);
    });

    // §RURAL-MATCHES-2D-PAGE (L-12987, founder 2026-09-06 at Cordoba, 2D|3D split screenshot):
    // "colours needs to match — before the colour between buildings was matching the 2d view — 3d
    // site view needs to match ALL COLOURS to 2d maps view. DO IT!"
    it('landuse RURAL — drape + edge + ground base all take the 2D PAGE (were #CDB98C / #B8A374 / #D6C7A6)', () => {
        // NOT an invented colour: buildPastelLanduseLayers filters ['==',['get','kind'],'urban'], so a
        // rural polygon in 2D is painted by nothing and what shows is the background = land. Arm B
        // below proves that filter is really what the 2D style ships.
        expect(FORMA_CONTEXT_3D.landuseRural).toBe(FORMA_PALETTE_V2.land);
        expect(FORMA_CONTEXT_3D.landuseRuralEdge).toBe(FORMA_CONTEXT_3D.landuseRural);
        expect(FORMA_CONTEXT_3D.groundRural).toBe(FORMA_PALETTE_V2.land);
        expect(FORMA_GROUND_RURAL).toBe(FORMA_PALETTE_V2.land);
    });

    it('rail — takes the 2D hairline tone, and its edge equals its fill (2D draws no casing)', () => {
        expect(FORMA_CONTEXT_3D.rail).toBe(FORMA_PALETTE_V2.rail);
        expect(FORMA_CONTEXT_3D.railEdge).toBe(FORMA_CONTEXT_3D.rail);
    });

    it('trees — canopy + edge take the 2D tree tones (were #7FA25C / none)', () => {
        expect(FORMA_CONTEXT_3D.tree).toBe(FORMA_PALETTE_V2.treeFill);
        expect(FORMA_CONTEXT_3D.treeEdge).toBe(FORMA_PALETTE_V2.treeStroke);
    });

    it('urban ground base — takes the 2D page land (was #F0EDE8, the SUPERSEDED v1 palette)', () => {
        expect(FORMA_CONTEXT_3D.groundUrban).toBe(FORMA_PALETTE_V2.land);
        expect(FORMA_GROUND_URBAN).toBe(FORMA_PALETTE_V2.land);
        // The exact value is asserted once, here, so a reader can see WHICH colour moved.
        expect(FORMA_GROUND_URBAN).toBe('#F5F2EA');
    });

    it('EXHAUSTIVE: no value in FORMA_CONTEXT_3D is a colour the 2D palette has never heard of', () => {
        const known = new Set<string>(Object.values(FORMA_PALETTE_V2));
        const strays = Object.entries(FORMA_CONTEXT_3D).filter(([, v]) => !known.has(v));
        expect(strays).toEqual([]);
    });
});

describe('§PALETTE-PARITY-2D-3D — ARM B: the 2D map RENDERS those same values', () => {
    // Arm A proves the alias table agrees with the palette object. This arm closes the loop the
    // founder actually sees: the layers MapLibre paints carry the same values. A palette nobody
    // renders from would satisfy Arm A and change nothing on screen.

    it('parks + woodland', () => {
        const parksCtx = paintOf(byId(buildPastelParkLayers(), PASTEL_LAYERS.parksCtx));
        const match = parksCtx['fill-color'] as unknown[];
        expect(match).toContain(FORMA_CONTEXT_3D.park);      // the default arm of the `match`
        expect(match).toContain(FORMA_CONTEXT_3D.parkEdge);  // wood/forest = 2D woodland
    });

    it('water', () => {
        const waterCtx = paintOf(byId(buildPastelWaterLayers(), PASTEL_LAYERS.waterCtx));
        expect(waterCtx['fill-color']).toBe(FORMA_CONTEXT_3D.water);
    });

    it('rail', () => {
        expect(paintOf(buildPastelRailLayer())['line-color']).toBe(FORMA_CONTEXT_3D.rail);
    });

    it('streets — major fill, major casing, minor fill', () => {
        const roads = buildPastelRoadLayers();
        expect(paintOf(byId(roads, PASTEL_LAYERS.roadMajorCtx))['line-color']).toBe(FORMA_CONTEXT_3D.roadMajor);
        expect(paintOf(byId(roads, PASTEL_LAYERS.roadMajorCasingCtx))['line-color']).toBe(FORMA_CONTEXT_3D.roadEdge);
        expect(paintOf(byId(roads, PASTEL_LAYERS.roadMinorCtx))['line-color']).toBe(FORMA_CONTEXT_3D.roadMinor);
    });

    it('buildings', () => {
        const b = buildPastelBuildingLayers();
        expect(paintOf(byId(b, PASTEL_LAYERS.buildingsFill))['fill-color']).toBe(FORMA_CONTEXT_3D.buildingFill);
        expect(paintOf(byId(b, PASTEL_LAYERS.buildingsOutline))['line-color']).toBe(FORMA_CONTEXT_3D.buildingEdge);
    });

    it('trees', () => {
        const t = paintOf(buildPastelTreeLayer());
        expect(t['circle-color']).toBe(FORMA_CONTEXT_3D.tree);
        expect(t['circle-stroke-color']).toBe(FORMA_CONTEXT_3D.treeEdge);
    });

    it('urban landuse + the page land under it', () => {
        const lu = paintOf(byId(buildPastelLanduseLayers(), PASTEL_LAYERS.landuseCtx));
        expect(lu['fill-color']).toBe(FORMA_CONTEXT_3D.landuseUrban);
        expect(paintOf(buildPastelBackgroundLayer())['background-color']).toBe(FORMA_CONTEXT_3D.groundUrban);
    });

    it('RURAL landuse is painted by NOTHING in 2D — which is why its 2D value is the page', () => {
        // §RURAL-MATCHES-2D-PAGE (L-12987). The claim "rural's 2D colour is land" rests ENTIRELY on
        // this filter. If the 2D style ever starts painting rural, this fails and the 3D alias gets
        // re-decided deliberately instead of silently keeping a value 2D no longer implies.
        const ctx = byId(buildPastelLanduseLayers(), PASTEL_LAYERS.landuseCtx);
        expect(ctx['filter']).toEqual(['==', ['get', 'kind'], 'urban']);
        expect(paintOf(buildPastelBackgroundLayer())['background-color']).toBe(FORMA_CONTEXT_3D.landuseRural);
    });
});

describe('§PALETTE-PARITY-2D-3D — ARM C: no context colour may be re-typed as a literal', () => {
    // THE ARM THAT ACTUALLY FORBIDS DRIFT. String `toBe` above is value equality and would pass a
    // hand-copied hex; only the source text can tell a reference from a copy.

    it('every FORMA_CONTEXT_3D field is a FORMA_PALETTE_V2 reference — no hex in the block', () => {
        const src = readFileSync(resolve(__dirname, '..', 'formaPaletteV2.ts'), 'utf8');
        const start = src.indexOf('export const FORMA_CONTEXT_3D = {');
        expect(start).toBeGreaterThan(-1);
        const block = src.slice(start, src.indexOf('} as const;', start));
        // Strip doc comments — they legitimately quote the OLD hexes ("was #D9D8D3").
        const code = block.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
        // …and every non-comment assignment reads out of the palette.
        const assignments = [...code.matchAll(/^\s{4}(\w+):\s*(.+?),\s*$/gm)];
        expect(assignments.length).toBeGreaterThanOrEqual(15);
        for (const [, key, value] of assignments) {
            expect(`${key} = ${value}`).toMatch(/= FORMA_PALETTE_V2\.\w+$/);
        }
    });

    it("CesiumViewport's FORMA_PALETTE reads its context entries from FORMA_CONTEXT_3D", () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const start = src.indexOf('const FORMA_PALETTE = {');
        expect(start).toBeGreaterThan(-1);
        const block = src.slice(start, src.indexOf('} as const;', start));

        const CONTEXT_KEYS = [
            'contextFill', 'contextOutline',
            'road', 'roadMinor', 'roadEdge',
            'water', 'park', 'parkEdge',
            'urban', 'urbanEdge', 'rail', 'railEdge', 'tree',
            // §RURAL-MATCHES-2D-PAGE (L-12987) — the two keys that were EXEMPT from this arm and were
            // therefore the only ground-plane hexes left free to drift. They are references now, so
            // the literal that produced the founder's dark-brown Cordoba fails a test, not ships.
            'rural', 'ruralEdge',
        ] as const;
        for (const key of CONTEXT_KEYS) {
            expect(block).toMatch(new RegExp(`^\\s*${key}: FORMA_CONTEXT_3D\\.\\w+,\\s*$`, 'm'));
            // The same key must NOT also carry a hex literal anywhere in the block.
            expect(block).not.toMatch(new RegExp(`^\\s*${key}: '#`, 'm'));
        }
        // ⚠ §ILLUMINANT-IS-A-COLOUR-SOURCE (L-13190) — this asserted the WHOLE import statement
        // verbatim, so adding the key-light constant beside the alias table broke a test about a
        // completely different subject. Assert the SPECIFIERS, which is what the arm cares about.
        const importLine = src.match(/^import \{([^}]*)\} from '\.\/formaPaletteV2';$/m)?.[1];
        expect(importLine, "CesiumViewport must import from './formaPaletteV2'").toBeTruthy();
        const specifiers = (importLine as string).split(',').map((t) => t.trim());
        expect(specifiers).toContain('FORMA_CONTEXT_3D');
        expect(specifiers).toContain('formaContextRoadColour');
    });

    it('the 3D street ribbon paints per class, not one tone for every street', () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toContain('material: roadColorFor(way.highway),');
        // The pre-fix single-colour form must be gone, or the split is dead code.
        expect(src).not.toContain('material: roadColor,');
    });
});

describe('§PALETTE-PARITY-2D-3D — ARM D: the road class split is ONE class set', () => {
    it('FORMA_CONTEXT_3D_ROAD_MAJOR equals the 2D PASTEL_ROAD_CLASSES.ctxMajor set', () => {
        // Declared twice by necessity (the 3D viewport must not import a MapLibre style builder), so
        // the equality is asserted rather than assumed. A class added to one and not the other would
        // paint a street the OTHER view's colour, silently.
        expect([...FORMA_CONTEXT_3D_ROAD_MAJOR].sort()).toEqual([...PASTEL_ROAD_CLASSES.ctxMajor].sort());
    });

    it('resolves a major street to the major tone and a residential street to the minor tone', () => {
        expect(formaContextRoadColour('primary')).toBe(FORMA_PALETTE_V2.roadMajor);
        expect(formaContextRoadColour('secondary_link')).toBe(FORMA_PALETTE_V2.roadMajor);
        expect(formaContextRoadColour('residential')).toBe(FORMA_PALETTE_V2.roadMinor);
        expect(formaContextRoadColour('service')).toBe(FORMA_PALETTE_V2.roadMinor);
    });

    it('an UNKNOWN highway tag falls to the minor tone rather than throwing or blanking', () => {
        expect(formaContextRoadColour('busway')).toBe(FORMA_PALETTE_V2.roadMinor);
        expect(formaContextRoadColour('')).toBe(FORMA_PALETTE_V2.roadMinor);
    });
});

describe('§PALETTE-PARITY-2D-3D — ARM E: the gaps stay NAMED, and a SUPERSEDED gap stays readable', () => {
    // ⚠⚠ THIS TEST IS THE REVERSAL OF ITS OWN PREDECESSOR, AND IS STRICTLY STRONGER THAN IT WAS.
    // It used to read: "RURAL ground is 3D-only because the 2D map paints NO rural tint to equal …
    // expect(known.has(FORMA_GROUND_RURAL)).toBe(false); expect(FORMA_GROUND_RURAL).toBe('#D6C7A6')".
    // That test PASSED while shipping the thing the founder photographed, because its premise was
    // wrong: 2D DOES have a value for rural — the page. Superseded 2026-09-06 (§RURAL-MATCHES-2D-PAGE,
    // L-12987) by his "3d site view needs to match ALL COLOURS to 2d maps view. DO IT!", which
    // outranks the 2026-07-29 "rustic - mountain - light brown" ruling that minted #D6C7A6.
    it('SUPERSEDED GAP: rural ground is now IN the 2D palette, and the old brown is gone for good', () => {
        const known = new Set<string>(Object.values(FORMA_PALETTE_V2));
        expect(known.has(FORMA_GROUND_RURAL)).toBe(true);          // was .toBe(false)
        expect(FORMA_GROUND_RURAL).toBe(FORMA_PALETTE_V2.land);    // was .toBe('#D6C7A6')
        expect(FORMA_GROUND_RURAL).not.toBe('#D6C7A6');
    });

    it('THE RATCHET: no off-palette brown survives anywhere in the 3D ground-plane path', () => {
        // The three hexes the 2026-07-29 ruling minted. A future lane that "restores the rustic
        // brown" must reverse the SUPERSESSION deliberately (and move this test) rather than paste
        // a hex back — which is exactly how #CDB98C survived §PALETTE-PARITY-2D-3D and then became
        // the founder's dark brown once every colour around it got ~15 L* lighter.
        const OLD_BROWNS = ['#D6C7A6', '#CDB98C', '#B8A374'];
        const stripComments = (t: string): string =>
            t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        const palette = stripComments(readFileSync(resolve(__dirname, '..', 'formaPaletteV2.ts'), 'utf8'));
        const ground = stripComments(readFileSync(resolve(__dirname, '..', 'formaGroundColour.ts'), 'utf8'));
        const viewportSrc = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const from = viewportSrc.indexOf('const FORMA_PALETTE = {');
        const block = stripComments(viewportSrc.slice(from, viewportSrc.indexOf('} as const;', from)));
        for (const brown of OLD_BROWNS) {
            expect(palette).not.toContain(brown);
            expect(ground).not.toContain(brown);
            expect(block).not.toContain(brown);
        }
    });

    /**
     * ⛔⛔ CORRECTED 2026-09-07 (§ILLUMINANT-IS-A-COLOUR-SOURCE, L-13193) — THIS TEST'S PROSE WAS
     * FALSE, AND IT IS THE MOST EXPENSIVE KIND OF FALSE: A CONFIDENT, MEASURED-SOUNDING SENTENCE
     * INSIDE A GREEN TEST, ON EXACTLY THE SUBJECT THE FOUNDER KEPT RE-REPORTING.
     *
     * It read: *"the draped context entities … never set `shadows`, and Cesium's PolygonGraphics
     * default is ShadowMode.DISABLED — **so every draped layer is FLAT-LIT and renders its 2D hex
     * exactly, like the 2D map**."* The premise is true and the conclusion does not follow.
     * `ShadowMode.DISABLED` means the geometry neither CASTS nor RECEIVES a shadow. It says nothing
     * about whether the surface is LIT. An entity polygon with a plain `Color` material is batched by
     * `StaticGeometryColorBatch`, which builds `new AppearanceType({ translucent, closed })` and
     * never passes `flat` — and `PerInstanceColorAppearance`'s `flat` DEFAULTS TO FALSE
     * (`cesium/Build/CesiumUnminified/index.js`, `:179007` and `:38907`). So every drape ran
     * `czm_phong` and was multiplied by `czm_lightColor`, which carried the key light's chroma.
     *
     * ⭐ THE COST OF THE WRONG SENTENCE: it told every subsequent reader that the ONLY residual
     * 2D/3D difference was shadow DARKNESS, so three separate lanes fixed the ground's ALBEDO
     * (L-12922, L-12948, L-12987) and the founder reported *"light brown"* after every one of them,
     * because the amber illuminant was rendering `#F5F2EA` as `#F5DDBB` and no albedo edit could
     * reach it. Memory `confident-register-rows-are-the-wrong-ones`, exactly.
     *
     * The SHADOW half of the claim was always right and is kept. The FLAT-LIT half is deleted and
     * replaced by ARM F below, which measures the illuminant instead of asserting it away.
     */
    it('THE LIGHTING TERM IS NOT A PALETTE TERM — pinned here so nobody fixes it with a hex', () => {
        // The founder's screenshot ALSO shows dark bands north of the buildings, and NO colour change
        // touches those. The draped context entities (land-use, parks, water, roads, rail) never set
        // `shadows`, and Cesium's PolygonGraphics default is ShadowMode.DISABLED — so no drape CASTS
        // or RECEIVES a shadow. (It is NOT therefore unlit — see the correction note above.) The GLOBE
        // is ShadowMode.RECEIVE_ONLY by default, so terrain in a building's shadow renders at
        // `shadowDarkness` of its lit value: #F5F2EA (L* 95.5) becomes L* 34.9 at 0.34. That is a
        // LIGHTING deliverable (shadow strength / AO / ambient), not a colour one.
        expect(FORMA_QUALITY.shadowDarkness).toBe(0.34);
        expect(Object.values(FORMA_PALETTE_V2)).not.toContain('0.34');
        const viewportSrc = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(viewportSrc).toContain('sm.darkness = FORMA_QUALITY.shadowDarkness;');
        // The drape polygons must stay shadow-free, or their albedo stops equalling the 2D hex.
        expect(viewportSrc).toContain("name: 'pryzm-forma-context-landuse',");
        const luFrom = viewportSrc.indexOf("name: 'pryzm-forma-context-landuse',");
        expect(viewportSrc.slice(luFrom, luFrom + 900)).not.toContain('shadows:');
    });

    it('the PRYZM purple selection accent is untouched by the parity work', () => {
        expect(FORMA_PALETTE_V2.parcelAccent).toBe('#6600FF');
        expect(Object.values(FORMA_CONTEXT_3D)).not.toContain('#6600FF');
    });

    it('the 3D proposed-massing fill is NOT a context colour and is not aliased here', () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toMatch(/^\s*proposedFill: '#F4F4F2',\s*$/m);
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §PALETTE-PARITY-2D-3D — ARM F: THE ILLUMINANT (L-13190, founder 2026-09-07 at Barcelona).
 *
 * ⭐ THE THIRD VARIABLE, AND THE ONE ARMS A–E ARE STRUCTURALLY BLIND TO. 2D↔3D agreement is not one
 * claim, it is three — **PALETTE · ILLUMINANT · COVERAGE** — and every arm above measures only the
 * first. A renderer does not draw an albedo; it draws `albedo × illuminant`. The Forma key light was
 * `warm ? '#FFE9CC' : '#FFF6EC'`, i.e. a SECOND DEFINITION of every colour in `FORMA_PALETTE_V2`,
 * authored in `CesiumViewport.applyFormaSunLight`, one stage further down the pipeline than any
 * `toBe` over a hex string can reach. That is the identical defect shape the whole module exists to
 * remove — two literals for one colour — and it survived precisely because the spec compared strings.
 *
 * ⚠ WHY THIS COST FOUR FOUNDER REPORTS. `#F5F2EA` under that key rendered `#F5DDBB` — which IS
 * "light brown". L-12922 painted the urban base off-white, L-12948 made the write actually run,
 * L-12987 aliased rural to the same tone; he reported *"light brown"* after all three, because none
 * of them touched the number that made it brown.
 *
 * ⛔ THIS ARM IS A CALCULATION, NOT A SCREENSHOT, AND IT REIMPLEMENTS THE SHIPPED SHADERS RATHER
 * THAN A MODEL OF THEM. `czmLightColor`, `phongDrape` and `globeBase` below are transcriptions of
 * `UniformState` (`index.js:202591`), `czm_phong` (`:45305`) and the globe FS's
 * `ENABLE_VERTEX_LIGHTING` branch (`:207494`) in `node_modules/cesium`. Line references are in each
 * helper so a Cesium upgrade that changes the maths is re-checkable rather than silently stale.
 *
 * ⛔ AND IT IS NOT VACUOUS: every arm derives its expectation from `FORMA_KEY_LIGHT_CSS` itself and
 * ALSO asserts the OLD ambers fail the same test — so setting the constant back to `'#FFE9CC'` turns
 * this block red rather than merely changing a number nobody checks.
 */
describe('§PALETTE-PARITY-2D-3D — ARM F: the ILLUMINANT is achromatic, so an albedo is a pixel', () => {
    /** Cesium `UniformState.update` (index.js:202591): `czm_lightColor` = normalise-by-max(colour × intensity).
     *  ⭐ THE INTENSITY CANCELS — which is why `FORMA_LIGHT_INTENSITY` 2.3 is NOT what tinted the scene. */
    const czmLightColor = (css: string, intensity: number): [number, number, number] => {
        const n = parseInt(css.replace('#', ''), 16);
        const c: [number, number, number] = [
            (((n >> 16) & 255) / 255) * intensity,
            (((n >> 8) & 255) / 255) * intensity,
            ((n & 255) / 255) * intensity,
        ];
        const m = Math.max(...c);
        return m > 1 ? (c.map((v) => v / m) as [number, number, number]) : c;
    };
    /** `czm_phong` (index.js:45305): `0.5*C + 0.5*C*diffuse*czm_lightColor`. `diffuse` = 1 at nadir. */
    const phongDrape = (hex: string, light: [number, number, number], diffuse = 1): [number, number, number] => {
        const n = parseInt(hex.replace('#', ''), 16);
        const C: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        return C.map((c, i) => 0.5 * c + 0.5 * c * diffuse * light[i]!) as [number, number, number];
    };
    /** Globe FS, `ENABLE_VERTEX_LIGHTING` (index.js:207494): `color.rgb * czm_lightColor * diffuseIntensity`. */
    const globeBase = (hex: string, light: [number, number, number], diffuseIntensity = 1): [number, number, number] => {
        const n = parseInt(hex.replace('#', ''), 16);
        const C: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        return C.map((c, i) => c * light[i]! * diffuseIntensity) as [number, number, number];
    };
    const toHex = (c: [number, number, number]): string =>
        '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    /** CIE Lab from sRGB, D65 — the same companding `lStar` above uses. */
    const labOf = (c: [number, number, number]): [number, number, number] => {
        const lin = (u: number): number => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
        const [R, G, B] = c.map(lin) as [number, number, number];
        const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
        const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
        const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
        const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116);
        return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const hexRgb = (hex: string): [number, number, number] => {
        const n = parseInt(hex.replace('#', ''), 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const dE76 = (a: [number, number, number], b: [number, number, number]): number => {
        const A = labOf(a), B = labOf(b);
        return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    };

    /** The keys this replaced, kept ONLY here so every arm can prove they would fail it. */
    const OLD_WARM_KEY = '#FFE9CC';
    const OLD_COOL_KEY = '#FFF6EC';
    const INTENSITY = 2.3;

    const stripComments = (t: string): string =>
        t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    it('the key light is ACHROMATIC — and the instrument that says so can say no', () => {
        expect(cssChromaSpread(FORMA_KEY_LIGHT_CSS)).toBe(0);
        // ⛔ NOT VACUOUS: the same instrument reads the two hexes this replaced as coloured.
        expect(cssChromaSpread(OLD_WARM_KEY)).toBe(51);
        expect(cssChromaSpread(OLD_COOL_KEY)).toBe(19);
    });

    it('⭐ THE TERRAIN BASE: the founder’s "light brown" was the LIGHT, and it is measured here', () => {
        const base = FORMA_PALETTE_V2.land;                      // #F5F2EA, the 2D page
        const shipped = globeBase(base, czmLightColor(FORMA_KEY_LIGHT_CSS, INTENSITY));
        // Ships at ΔE76 0.00 — the globe renders the authored hex, byte for byte.
        expect(toHex(shipped)).toBe(base);
        expect(dE76(shipped, hexRgb(base))).toBeCloseTo(0, 6);
        // ⛔ AND THE DEFECT IS NAMED, so this arm cannot be satisfied by a tinted key.
        const warm = globeBase(base, czmLightColor(OLD_WARM_KEY, INTENSITY));
        expect(toHex(warm)).toBe('#F5DDBB');                     // ← what he photographed
        expect(dE76(warm, hexRgb(base))).toBeGreaterThan(16);     // measured 17.02
    });

    it('⭐ EVERY GROUND DRAPE renders its 2D hex exactly at nadir — none did under the amber key', () => {
        // A drape is an entity polygon → StaticGeometryColorBatch → PerInstanceColorAppearance with
        // `flat` DEFAULTING TO FALSE, so it runs czm_phong. At nadir `diffuse` = 1 and a WHITE key
        // collapses czm_phong to exactly `C` — identical to the `flat: true` path the slab side and
        // the canopies take. That identity is the whole reason a white key beats a re-tuned hex.
        const white = czmLightColor(FORMA_KEY_LIGHT_CSS, INTENSITY);
        const warm = czmLightColor(OLD_WARM_KEY, INTENSITY);
        const DRAPES = [
            FORMA_CONTEXT_3D.water, FORMA_CONTEXT_3D.park, FORMA_CONTEXT_3D.landuseUrban,
            FORMA_CONTEXT_3D.roadMajor, FORMA_CONTEXT_3D.roadMinor, FORMA_CONTEXT_3D.rail,
            FORMA_CONTEXT_3D.buildingFill, FORMA_CONTEXT_3D.tree, FORMA_PALETTE_V2.land,
        ];
        for (const hex of DRAPES) {
            expect(toHex(phongDrape(hex, white)), `${hex} under the shipped key`).toBe(hex);
            // …and the amber key moved every one of them well past the JND (measured 6.13–8.39).
            expect(dE76(phongDrape(hex, warm), hexRgb(hex)), `${hex} under the OLD amber key`)
                .toBeGreaterThan(5);
        }
    });

    it('⚠ WHAT IS **NOT** CLAIMED: exposure. At the fly-in pitch a drape is still ~15% brighter', () => {
        // czm_phong sums TWO hard-coded eye-space lambert terms, so at ~22° off nadir `diffuse`
        // ≈ 1.302 and the composite is ≈1.151·C under ANY key. It is a LUMINANCE term shared by every
        // layer — it cannot tint one layer against another — and it is logged as L-13196, not hidden
        // by darkening a hex. Pinned so a later reader does not mistake ARM F for a pixel guarantee.
        const white = czmLightColor(FORMA_KEY_LIGHT_CSS, INTENSITY);
        const oblique = phongDrape(FORMA_PALETTE_V2.water, white, 1.302);
        expect(dE76(oblique, hexRgb(FORMA_PALETTE_V2.water))).toBeGreaterThan(5);
        // …but it stays ACHROMATIC, which is the property this arm actually buys: the same drape
        // under the amber key is a further ΔE76 10.49 away, and ALL of that is hue.
        const obliqueWarm = phongDrape(FORMA_PALETTE_V2.water, czmLightColor(OLD_WARM_KEY, INTENSITY), 1.302);
        expect(dE76(oblique, obliqueWarm)).toBeGreaterThan(5);
    });

    it('REACHABILITY: CesiumViewport installs THIS constant, and no tinted key survives in the file', () => {
        // §AUTHORED-BUT-UNWIRED — a neutral constant nobody installs changes nothing on screen.
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toContain('color: Cesium.Color.fromCssColorString(FORMA_KEY_LIGHT_CSS),');
        const code = stripComments(src);
        // The ternary and both hexes are gone from CODE (the comments quote them deliberately).
        expect(code).not.toContain(OLD_WARM_KEY);
        expect(code).not.toContain(OLD_COOL_KEY);
        expect(code).not.toMatch(/warm \?/);
        // Exactly ONE illuminant is authored in the Forma path; the other write is the RESTORE.
        const assignments = [...code.matchAll(/^\s*scene\.light = /gm)];
        expect(assignments.length).toBe(2);
    });

    it('the INTENSITY half of §A.21.D-FORMA2 is untouched — this reversed the tint, not the look', () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toMatch(/^const FORMA_LIGHT_INTENSITY = 2\.3;$/m);
        // And because czm_lightColor normalises by its MAX component (red = 1.0 in all three
        // candidates), white raises green/blue and lowers nothing: never a darker scene.
        const white = czmLightColor(FORMA_KEY_LIGHT_CSS, INTENSITY);
        const warm = czmLightColor(OLD_WARM_KEY, INTENSITY);
        for (let i = 0; i < 3; i++) expect(white[i]!).toBeGreaterThanOrEqual(warm[i]!);
    });

    it('the applied console line NAMES the illuminant, so a screenshot is diagnosable', () => {
        // Three hexes were printed there already and he still could not tell why the ground read
        // brown — because the number that made it brown had no name in any line he could read.
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toContain("'; key light ' + FORMA_KEY_LIGHT_CSS +");
        expect(src).toContain('cssChromaSpread(FORMA_KEY_LIGHT_CSS)');
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §SEA-LOAD-GATE-STALE-FLAG (L-13191) — the 2D pane gets its ocean from a GLOBAL BASEMAP; the 3D
 * pane has no basemap at all and must derive one. That asymmetry is not a colour defect and no
 * palette arm can see it, which is why it is pinned in the parity spec: "the panes agree" is false
 * while one of them is missing a layer the other renders for free.
 */
describe('§SEA-LOAD-GATE-STALE-FLAG — the standing sea actually loads on the framing funnel', () => {
    it('the rule is Forma-mode, and the stale photoreal latch is IGNORED by construction', () => {
        // `photorealTilesActive` latches true on the first photoreal tile load and clears only on
        // dispose. The founder's onboarding flies the photoreal globe BEFORE the 3D Site, so on his
        // machine it is true for the whole session — and the old gate
        // `formaMode && !photorealTilesActive` meant the standing sea never loaded on the funnel.
        // Same defect, same shape, same file as L-12948; this was its last uncorrected copy.
        expect(shouldLoadFormaSea({ formaMode: true, photorealActive: true })).toBe(true);
        expect(shouldLoadFormaSea({ formaMode: true, photorealActive: false })).toBe(true);
        // …and it still refuses OFF the Forma path, where Google's tiles carry the water themselves.
        expect(shouldLoadFormaSea({ formaMode: false, photorealActive: true })).toBe(false);
        expect(shouldLoadFormaSea({ formaMode: false, photorealActive: false })).toBe(false);
    });

    it('REACHABILITY: the funnel calls the predicate, and the stale expression is gone', () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        expect(code).toContain('shouldLoadFormaSea({ formaMode: this.formaMode, photorealActive: this.photorealTilesActive })');
        // ⛔ THE RATCHET. This exact expression has now been wrong three times in this one file.
        expect(code).not.toMatch(/this\.formaMode && !this\.photorealTilesActive/);
    });

    it('the sea line LABELS its provenance and names WHICH of the three zero causes it hit', () => {
        // §CONTEXT-DATA-HONESTY: a live-Overpass sea must never read as baked data, and "inland" must
        // never be printed for a coastline that was found and then refused or cut away.
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toContain('SUPPLEMENT, never presented as baked data');
        expect(src).toContain('the coastline walk REFUSED');
        expect(src).toContain('cut removed all of them');
        // The old single-cause sentence must be gone, or the honest branch is dead code beside it.
        expect(src).not.toContain("'HONEST no-op (inland / no coastline)'");
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §SITE-SCOPE-CITYWEFT — WHAT THE VIEWER SEES *OUTSIDE* THE CUT (founder 2026-09-07:
 * *"white background clean cut"*).
 *
 * ⭐ THE BACKDROP CHANGED ROLE, WHICH IS WHY ITS OLD TONE STOPPED BEING RIGHT. Before the globe
 * cut, `FORMA_QUALITY.skyTop/skyHorizon` were a distant HORIZON that far terrain melted into, and
 * a slightly cool grey (#F2F3F6 → #E4E3E0) was the correct choice for that. With
 * `globe.cartographicLimitRectangle` applied, everything past the scope is a fragment `discard`
 * and the canvas clears TRANSPARENT (`cesiumSurfaceWrites().backgroundColourCss === null`), so the
 * same gradient is now THE GROUND THE CUT EDGE STANDS ON. A grey there reads as a model floating
 * in front of a sky; the founder's reference reads as a model standing on clean empty paper.
 */
describe('§SITE-SCOPE-CITYWEFT — the backdrop outside the cut', () => {
    it('BOTH stops are flat white — "make the background completely white", in his words', () => {
        // ⚠ An intermediate version of this arm asserted `skyHorizon === FORMA_PALETTE_V2.land`,
        // pinning the horizon to the ground paper so the cut edge stood on continuous ground. The
        // founder's NEXT sentence superseded it ("the 3d site view is better — make the background
        // completely white if you can"), and the reasoning is preserved in `skyHorizon`'s comment
        // rather than deleted, because it is still why the ORIGINAL grey was wrong.
        expect(FORMA_QUALITY.skyTop).toBe('#FFFFFF');
        expect(FORMA_QUALITY.skyHorizon).toBe('#FFFFFF');
    });

    /**
     * ⛔⛔ REWRITTEN 2026-09-07 (§SITE-SCOPE-CITYWEFT-CLEAR, L-13100) — THIS ARM WAS BOTH
     * MIS-TARGETED AND VACUOUS, which is the worst combination a guard can have.
     *
     *   · MIS-TARGETED. Its title says SLAB SIDE and its body read
     *     `const side = FORMA_PALETTE_V2.land` — which is the slab **TOP** (#F5F2EA, the ground
     *     paper), not the side (#E6E6E3, `SITE_SCOPE_SLAB_SIDE_CSS`, declared in `siteScope.ts`).
     *     The arm that exists to keep three surfaces distinct had itself confused two of them.
     *   · VACUOUS. `expect(parseInt(side.slice(1), 16)).toBeLessThan(0xffffff)` passes for
     *     **#FEFEFE** — ΔL* 0.35 from the backdrop, an edge no eye could find. The one edit the
     *     title forbids ("may not be whitened too") is the edit the body permitted.
     *
     * It now asserts the ARITHMETIC, in the same spirit as `cesiumSurfaceFraming.spec.ts`'s shading
     * band. MEASURED TODAY — backdrop #FFFFFF 100.00 · slab TOP #F5F2EA 95.52 · slab SIDE #E6E6E3
     * 91.22 · context buildings #E8E1D4 89.75 · proposed massing #F4F4F2 96.14.
     *
     * ⚠ THE FLOORS ARE A DESIGN COMMITMENT, NOT A PERCEPTUAL MEASUREMENT, and are stated as such
     * rather than dressed up: there is no dataset here to derive a threshold from, so each floor is
     * set BELOW what ships (headroom named per assertion) so the arm fires on a REGRESSION rather
     * than pinning an exact hex that nobody may then tune.
     */
    it('⛔ every surface that MEETS the white backdrop keeps a measured value step', () => {
        // The side is FLAT-shaded (PerInstanceColorAppearance flat:true), so it holds its value at
        // every sun angle — which is exactly why it, and not the lit top, is the silhouette.
        const viewportSrc = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(viewportSrc).toContain('flat: true');

        // The backdrop is the reference all four steps are measured from. See `lStar`'s note for
        // why this is 4 places and not an equality: the D65 row sums to 1.0000001.
        const backdrop = lStar(FORMA_QUALITY.skyTop);
        expect(backdrop).toBeCloseTo(100, 4);

        // THE CUT EDGE. The vertical face is what the silhouette is MADE of: ships at ΔL* 8.78,
        // floor 6.0, headroom 2.78. Whitening the side to #FEFEFE — which the old arm allowed —
        // gives 0.35 and fails here.
        const side = lStar(SITE_SCOPE_SLAB_SIDE_CSS);
        expect(backdrop - side, `slab SIDE ${SITE_SCOPE_SLAB_SIDE_CSS} vs backdrop`).toBeGreaterThanOrEqual(6.0);

        // THE GROUND PAPER. Seen least at the rim, so a thinner step is acceptable: ships at 4.48,
        // floor 3.0.
        const top = lStar(FORMA_PALETTE_V2.land);
        expect(backdrop - top, `slab TOP ${FORMA_PALETTE_V2.land} vs backdrop`).toBeGreaterThanOrEqual(3.0);

        // ⭐ AND THE ORDERING, WHICH IS WHAT THE MIS-TARGETED ARM MEANT TO SAY. Side darker than
        // top, top darker than backdrop — or the rim reads as one flat field from paper to void.
        expect(side, 'the SIDE must be darker than the TOP').toBeLessThan(top);
        expect(top, 'the TOP must be darker than the BACKDROP').toBeLessThan(backdrop);
    });

    /**
     * ⚠ THE RISK THAT IS NOT THE SLAB'S, NAMED BECAUSE IT IS THE THINNEST STEP IN THE SCENE AND IT
     * BELONGS TO THE ONE THING THE FOUNDER IS LOOKING AT. `FORMA_PALETTE.proposedFill` #F4F4F2 sits
     * ΔL* **3.86** below pure white — less than the slab's own top — and its edge is carried not by
     * a value step but by the graphite silhouette POST-PROCESS (#2B2B2B), which `applyFormaMode`
     * reports as possibly `silhouette=unavailable` on a GPU where the stage will not compile.
     *
     * ⛔ SO THIS SPEC CANNOT CLAIM THE SUBJECT SURVIVES A WHITE BACKDROP. It pins the two halves it
     * can reach — the fill keeps SOME step, and the graphite outline stays dark — and the third
     * fact (did the stage compile on THIS GPU) is printed into the applied console line instead,
     * because no headless arm can establish it. That split is deliberate: a fake post-process built
     * from these expectations could not falsify them (memory `fake-more-capable-than-real`).
     */
    it('⚠ the PROPOSED massing keeps a step, and its graphite outline stays dark', () => {
        const viewportSrc = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const fill = viewportSrc.match(/^\s*proposedFill: '(#[0-9A-F]{6})',\s*$/m)?.[1];
        const outline = viewportSrc.match(/^\s*silhouette: '(#[0-9A-F]{6})',\s*$/m)?.[1];
        expect(fill, 'proposedFill literal not found in CesiumViewport.ts').toBeTruthy();
        expect(outline, 'silhouette literal not found in CesiumViewport.ts').toBeTruthy();
        // Ships at 3.86, floor 2.5. Raising the fill to pure white would zero it.
        expect(lStar(FORMA_QUALITY.skyTop) - lStar(fill as string), `proposedFill ${fill} vs backdrop`)
            .toBeGreaterThanOrEqual(2.5);
        // The outline is the real carrier when it compiles — graphite, well clear of both.
        expect(lStar(outline as string), `silhouette ${outline} must stay graphite`).toBeLessThan(40);
    });

    /**
     * ⭐ §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — the backdrop is white in the SCENE, not only in a
     * DOM style. Transparency was the price of a GRADIENT; the founder's *"completely white"*
     * collapsed the gradient, and what transparency left behind was that
     * `container.style.background = "#000"` (CesiumViewport.ts) is what shows through the alpha
     * canvas in any frame the CSS backdrop has not been applied to.
     */
    describe('the flat backdrop is CLEARABLE, and the decision reverses itself', () => {
        it("flat white at both stops => an opaque clear in the founder's own tone", () => {
            expect(formaBackdropClearCss()).toBe('#FFFFFF');
            expect(formaBackdropClearCss()).toBe(FORMA_QUALITY.skyTop);
        });

        it('⛔ a genuine gradient => null, so the transparent clear comes back by itself', () => {
            expect(formaBackdropClearCss('#FFFFFF', '#E4E3E0')).toBeNull();
            expect(formaBackdropClearCss('#F2F3F6', '#FFFFFF')).toBeNull();
        });

        // ⚠ THE RADIAL IS WHY "BOTH STOPS AGREE" IS NOT SUFFICIENT ON ITS OWN. The gradient builder
        // layers a 35 % WHITE centre lift over the vertical stops; that lift is invisible only over
        // white. Two stops agreeing on #EEEEEE still leave a lit pool in the middle, so the backdrop
        // is not flat and must NOT be collapsed to a single clear colour.
        it('⛔ equal-but-not-white stops are still NOT flat — the white radial lift sits on top', () => {
            expect(formaBackdropClearCss('#EEEEEE', '#EEEEEE')).toBeNull();
            expect(formaBackdropClearCss(FORMA_BACKDROP_RADIAL_LIFT_CSS, FORMA_BACKDROP_RADIAL_LIFT_CSS))
                .toBe(FORMA_BACKDROP_RADIAL_LIFT_CSS);
        });

        // The applied console line is the ONLY place the founder can read which of the three
        // surfaces changed. It printed one hex (the ground) and called the backdrop "soft
        // sky-gradient backdrop" with no value, so a screenshot could not answer his own question.
        it('the applied line names all three surfaces separately', () => {
            const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
            expect(src).toContain("'; slab TOP (ground) ' + FORMA_PALETTE.ground");
            expect(src).toContain("'; slab SIDE/FLOOR ' + SITE_SCOPE_SLAB_SIDE_CSS");
            expect(src).toContain('const backdropClear = formaBackdropClearCss();');
        });
    });

    it('⛔ neither backdrop tone reintroduces COLOUR beyond the cut — grey/paper only, never a sky', () => {
        for (const css of [FORMA_QUALITY.skyTop, FORMA_QUALITY.skyHorizon, FORMA_QUALITY.fogColor]) {
            const n = parseInt(css.replace('#', ''), 16);
            const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            // Chroma proxy: the max-min channel spread. A blue sky or a tan skirt blows past this.
            expect(Math.max(r, g, b) - Math.min(r, g, b), `${css} carries colour`).toBeLessThanOrEqual(14);
            expect(Math.min(r, g, b), `${css} is too dark to read as empty ground`).toBeGreaterThan(220);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ §CAGE-IS-A-DRAWN-MARK (L-13270, founder 2026-09-10 at the Delaware demo site:
// *"buildings even if we don't have true heights should be wireframe — now they are more
// transparent than wireframe"*).
//
// WHAT THIS ARM BINDS, AND WHY IT IS A CONTRAST ARM RATHER THAN A `toBe` OVER A HEX. Every other
// arm in this file asks "is the 3D value equal to its 2D twin?" — the right question for a mass,
// which is what all of them are about. **The unknown-height cage has no 2D twin** (the 2D map draws
// a filled footprint whether or not the height is known), so equality has nothing to compare to
// and would pin nothing. The property that actually failed at Delaware is not equality, it is
// PERCEIVABILITY: a `fill:false` cage's only substance is its line, and that line was drawn in a
// colour authored to sit ON a fill. So the target here is the GROUND the cage stands on, and the
// instrument is WCAG 2.1 §1.4.11 non-text contrast — the published floor at which a drawn
// graphical object counts as perceivable at all.
//
// ⛔ THE POLICY IS NOT UNDER TEST AND MUST NOT DRIFT. An unknown-height footprint stays an OPEN
// CAGE to a stated nominal, never a solid at an invented height (§PLATE-FILLS PART B). These arms
// make the cage legible; the last arm forbids making it solid.
// ─────────────────────────────────────────────────────────────────────────────

/** WCAG 2.1 relative luminance (the SAME channel transfer as `lStar` above, stopped one step earlier). */
function relLuminance(hex: string): number {
    const n = parseInt(hex.replace('#', ''), 16);
    const chan = (c: number): number => {
        const u = c / 255;
        return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}
/** WCAG contrast ratio between two opaque hexes, always >= 1. */
function contrastRatio(a: string, b: string): number {
    const pair = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
    return ((pair[0] as number) + 0.05) / ((pair[1] as number) + 0.05);
}
/** The tier haze the fills use, replayed here so the arm can prove it is NOT applied to the cage. */
function hazedToward(hex: string, towardHex: string, t: number): string {
    const n = parseInt(hex.replace('#', ''), 16);
    const m = parseInt(towardHex.replace('#', ''), 16);
    const mix = (s: number): string => {
        const a = (n >> s) & 255;
        const b = (m >> s) & 255;
        return Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
    };
    return `#${mix(16)}${mix(8)}${mix(0)}`;
}

describe('§CAGE-IS-A-DRAWN-MARK — the unknown-height cage is legible against the ground it stands on', () => {
    /** The Forma ground the cage is drawn on — the slab TOP the founder sees behind it. */
    const GROUND = FORMA_PALETTE_V2.land;             // #F5F2EA
    const CAGE = FORMA_CONTEXT_3D.buildingCageEdge;   // the line
    /** WCAG 2.1 §1.4.11: a non-text graphical object needs 3:1 against what is adjacent to it. */
    const NON_TEXT_FLOOR = 3.0;

    it('the cage line clears the WCAG non-text floor against the Forma ground', () => {
        expect(contrastRatio(CAGE, GROUND)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });

    it('⛔ THE REGRESSION ARM — the borrowed `buildingStroke` did NOT clear it, by a factor of ~2', () => {
        // This is the shipped value the founder called "more transparent than wireframe". If a later
        // change re-points the cage at `buildingEdge`, the arm above goes red and this one says why.
        const borrowed = contrastRatio(FORMA_CONTEXT_3D.buildingEdge, GROUND);
        expect(borrowed).toBeLessThan(1.5);                    // measured 1.37 : 1
        expect(borrowed).toBeLessThan(NON_TEXT_FLOOR / 2);     // not marginal — half the floor
        expect(contrastRatio(CAGE, GROUND)).toBeGreaterThan(borrowed * 2.5);
    });

    it('⭐ hazing the cage pushed it FURTHER below the floor rather than receding it', () => {
        // The three tier hazes, replayed against the OLD cage colour. Every one lands below the
        // un-hazed value — which is the whole reason haze is the wrong instrument for a line: a
        // mass survives a contrast cut because it still owns an area of screen; a hairline has no
        // area, so contrast is not one of its channels, it is its only one.
        const FOG = '#E6E5E2';                     // FORMA_QUALITY.fogColor
        const unhazed = contrastRatio(FORMA_CONTEXT_3D.buildingEdge, GROUND);
        for (const haze of [0.10, 0.22]) {
            const hazed = contrastRatio(hazedToward(FORMA_CONTEXT_3D.buildingEdge, FOG, haze), GROUND);
            expect(hazed).toBeLessThan(unhazed);
            expect(hazed).toBeLessThan(NON_TEXT_FLOOR);
        }
    });

    it('the three PROVENANCE rungs stay separable, and the cage is the darkest mark in the plate', () => {
        // SOLID and ESTIMATED are shaded opaque MASSES; WIREFRAME is an unfilled LINE. The reading
        // that must survive is "what is known vs what is not", so the line must not be confusable
        // with either mass — and no mass may be as dark as the line.
        const solid = contrastRatio(FORMA_CONTEXT_3D.buildingFill, GROUND);       // ~1.4 : 1
        const estimated = contrastRatio('#B8B6B0', GROUND);                       // ~1.8 : 1
        const cage = contrastRatio(CAGE, GROUND);                                 // ~4.1 : 1
        expect(estimated).toBeGreaterThan(solid);          // estimated reads darker than measured
        expect(cage).toBeGreaterThan(estimated * 2);       // and the cage is in a different register
        expect(FORMA_CONTEXT_3D.buildingCageEdge).not.toBe(FORMA_CONTEXT_3D.buildingFill);
        expect(FORMA_CONTEXT_3D.buildingCageEdge).not.toBe(FORMA_CONTEXT_3D.buildingEdge);
    });

    it('⛔ the cage stays a NEUTRAL — it is not the founder-rejected amber, and not a hue at all', () => {
        // 2026-07-30: `contextUncertainHeight` #E8973A was rejected as "a weird orange". Making the
        // cage visible must never be done by making it colourful.
        expect(cssChromaSpread(CAGE)).toBeLessThanOrEqual(32);
        expect(cssChromaSpread('#E8973A')).toBeGreaterThan(120);   // the scale, so the bound reads
        expect(CAGE.toLowerCase()).not.toBe('#e8973a');
    });

    it("the cage colour is the BUILDING family's own dark neutral, not an invented hex", () => {
        // `buildingShadow` is authored as rgba(126, 116, 100, 0.16). The cage takes that exact RGB
        // at full opacity, so this is the family's existing dark end rather than a new colour.
        const m = FORMA_PALETTE_V2.buildingShadow.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        expect(m, 'buildingShadow is no longer an rgba() triple').toBeTruthy();
        const g = m as RegExpMatchArray;
        const hx = (i: number): string => Number(g[i]).toString(16).padStart(2, '0');
        expect(FORMA_PALETTE_V2.buildingCageEdge.toLowerCase()).toBe(`#${hx(1)}${hx(2)}${hx(3)}`);
    });

    it('ARM C parity — the 3D key is a reference, and CesiumViewport reads it from FORMA_CONTEXT_3D', () => {
        expect(FORMA_CONTEXT_3D.buildingCageEdge).toBe(FORMA_PALETTE_V2.buildingCageEdge);
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const start = src.indexOf('const FORMA_PALETTE = {');
        const block = src.slice(start, src.indexOf('} as const;', start));
        expect(block).toMatch(/^\s*contextCageEdge: FORMA_CONTEXT_3D\.buildingCageEdge,\s*$/m);
        expect(block).not.toMatch(/^\s*contextCageEdge: '#/m);
    });

    it('⛔ ALL THREE render tiers draw the cage from the ONE unhazed helper — no tier may re-haze it', () => {
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        // One helper, three call sites (near ring, demoted ring, instanced far tier).
        expect(src).toContain('function ctxCageEdgeColour(): Cesium.Color {');
        expect((src.match(/ctxCageEdgeColour\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
        // ⛔ And the pre-fix forms are GONE. Each is a cage drawn in the borrowed hairline, two of
        // them hazed on top of that — the exact three lines the founder was looking at.
        expect(src).not.toContain('fromCssColorString(FORMA_PALETTE.contextOutline).withAlpha(0.9)');
        expect(src).not.toContain('ctxTierColour(FORMA_PALETTE.contextOutline, CTX_TIER_HAZE.demoted)');
        expect(src).not.toContain('ctxTierColour(FORMA_PALETTE.contextOutline, CTX_TIER_HAZE.far)');
    });

    it('⛔ THE POLICY ARM — an unknown-height footprint is still a CAGE, never a solid at 9 m', () => {
        // §PLATE-FILLS PART B. Legibility was the defect; presenting an assumption as a measurement
        // would be a far worse one. `fill` must stay off for the wireframe rung in all three tiers.
        const src = readFileSync(resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        expect(src).toContain("fill: renderTier !== 'wireframe',");   // near ring
        expect(src).toContain('fill: !isWire,');                      // demoted ring
        // …and the far tier keeps its cages in the outline-geometry batch, never the solid batch.
        expect(src).toContain('geometry: new Cesium.PolygonOutlineGeometry({');
        expect(src).toContain('const CTX_UNKNOWN_HEIGHT_CAGE_M = 9;');
    });

    // ⭐ SCRAMBLE CONTROL (L-586) — the arms above must FAIL on a wrong colour, or they assert
    // nothing. Replay the load-bearing instrument against the value that actually shipped, against
    // every other neutral in the palette a future lane might reach for, and against a near-miss.
    it('SCRAMBLE CONTROL — the contrast instrument rejects the shipped colour and five near-misses', () => {
        const wrong = ['#D6CFC2', '#E8E1D4', '#C9C4BA', '#B8B6B0', '#CFCAC0'];
        for (const w of wrong) {
            expect(contrastRatio(w, GROUND), `${w} must NOT clear the non-text floor`).toBeLessThan(NON_TEXT_FLOOR);
        }
        // A colour markedly darker than the shipped one STILL fails — the fix is not marginal tuning
        // of a hairline, it is a different register.
        expect(contrastRatio('#A9A399', GROUND)).toBeLessThan(NON_TEXT_FLOOR);
        // And the chosen value passes the same instrument that rejected all six.
        expect(contrastRatio(CAGE, GROUND)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });
});
