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
import { FORMA_GROUND_URBAN, FORMA_GROUND_RURAL } from '../formaGroundColour';
import { FORMA_QUALITY } from '../formaSceneQuality';

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
        expect(src).toContain("import { FORMA_CONTEXT_3D, formaContextRoadColour } from './formaPaletteV2';");
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

    it('THE LIGHTING TERM IS NOT A PALETTE TERM — pinned here so nobody fixes it with a hex', () => {
        // The founder's screenshot ALSO shows dark bands north of the buildings, and NO colour change
        // touches those. Measured: the draped context entities (land-use, parks, water, roads, rail)
        // never set `shadows`, and Cesium's PolygonGraphics default is ShadowMode.DISABLED — so every
        // draped layer is FLAT-LIT and renders its 2D hex exactly, like the 2D map. The GLOBE is
        // ShadowMode.RECEIVE_ONLY by default, so terrain in a building's shadow renders at
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
