// ─────────────────────────────────────────────────────────────────────────────
// §MAP2D-PASTEL Stage M1 (L-12938) — the pastel masterplan style, pinned.
//
// WHAT THIS SUITE IS FOR, in the founder's words (STR-2D-SITE-MAP-CARTOGRAPHY §0):
// "improve massively the graphics — pastel architectural masterplan quality — STILL
// KEEPING the architecture towards selecting parcels as we have now." Those are two
// obligations, and this file pins BOTH:
//
//   ARM 1 — CARTOGRAPHY. The palette hexes, the layer ORDER (the building shadow must sit
//     UNDER the fill and the hairline outline OVER it — the whole masterplan effect is that
//     ordering, and it is the thing a well-meaning refactor silently reorders), and the zoom
//     gates. Colours and z-order have no runtime error to fail on: they just look wrong, in
//     production, on a founder's screen. So they are asserted by value.
//
//   ARM 2 — SELECTION IS UNTOUCHED. Nine functions carry the parcel click ladder and the
//     boundary-draw/commit path in `SiteBoundaryMap2D.ts`. This lane is PRESENTATION ONLY,
//     so every one of them must be byte-identical to `git show HEAD:` — asserted by
//     extracting each function's source from the working tree and from HEAD and comparing
//     the bytes.
//     ⚠ WHAT THIS ARM DOES AND DOES NOT PROVE. It compares the WORKING TREE against HEAD,
//     so it proves "no UNCOMMITTED edit touches the selection path". It is deliberately NOT
//     a hard-coded hash: `SiteBoundaryMap2D.ts` is edited by several lanes at once (the
//     parcel-candidate work is one of them), and a frozen hash here would turn another
//     lane's LEGITIMATE, reviewed change to the click ladder into a red test in their tree —
//     a guard that cries wolf gets deleted, and then it guards nothing. The invariant this
//     arm actually enforces is the one it can enforce honestly: a cartography change must
//     never arrive carrying a selection-path change with it.
//     If `git` cannot be reached the arm FAILS LOUDLY rather than skipping — an unrunnable
//     guard that prints green is the "never ran and passed print the same value" defect
//     (§L-851), and this file exists to not commit it.
//
// The suite is discovered by the ROOT vitest config's
// `apps/editor/src/ui/geospatial/__tests__/**/*.spec.ts` pattern (already present), so it
// runs from the repo root: `npx vitest run apps/editor/src/ui/geospatial/__tests__/siteMap2DStyleV2.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    FORMA_PALETTE,
    FORMA_PALETTE_V2,
    PASTEL_ZOOM,
    PASTEL_SOURCES,
    PASTEL_LAYERS,
    PASTEL_SHADOW_OFFSET,
    PASTEL_GEOJSON_SOURCE_OPTS,
    PASTEL_FOOTWAY_DASH,
    PASTEL_LANDUSE_UNTINTED,
    buildFormaMap2DStyle,
    buildFormaMap2DStyleV2,
    buildPastelBuildingLayers,
    buildPastelTreeLayer,
    CONTEXT_BUILDINGS_SOURCE,
    CONTEXT_BUILDINGS_FILL_LAYER,
    CONTEXT_BUILDINGS_LINE_LAYER,
} from '../siteMap2DStyle';

type Layer = Record<string, unknown>;

const style = buildFormaMap2DStyleV2();
const layers = style.layers as ReadonlyArray<Layer>;
const ids = layers.map((l) => String(l['id']));
const byId = (id: string): Layer => {
    const l = layers.find((x) => x['id'] === id);
    if (!l) throw new Error(`layer '${id}' is missing from the pastel style`);
    return l;
};
const paintOf = (id: string): Record<string, unknown> => byId(id)['paint'] as Record<string, unknown>;

// ── ARM 1a — the palette, hex for hex (STR-2D-SITE-MAP-CARTOGRAPHY §2) ───────
describe('§MAP2D-PASTEL — FORMA_PALETTE_V2 (STR §2)', () => {
    it('carries the research note\'s low-saturation hexes exactly', () => {
        expect(FORMA_PALETTE_V2.land).toBe('#F5F2EA');
        expect(FORMA_PALETTE_V2.parks).toBe('#DDEBD4');
        expect(FORMA_PALETTE_V2.woodland).toBe('#C9DDBF');
        expect(FORMA_PALETTE_V2.water).toBe('#D9E9E8');
        expect(FORMA_PALETTE_V2.buildingFill).toBe('#E8E1D4');
        expect(FORMA_PALETTE_V2.buildingStroke).toBe('#D6CFC2');
        expect(FORMA_PALETTE_V2.roadMajor).toBe('#D2CEC5');
        expect(FORMA_PALETTE_V2.roadMajorCasing).toBe('#C8C3B9');
        expect(FORMA_PALETTE_V2.roadMinor).toBe('#E6E2DA');
        expect(FORMA_PALETTE_V2.footway).toBe('#CFCAC0');
        expect(FORMA_PALETTE_V2.rail).toBe('#C9C4BA');
        expect(FORMA_PALETTE_V2.landuseIndustrial).toBe('#ECE9E3');
        expect(FORMA_PALETTE_V2.landuseCommercial).toBe('#EEEAE2');
        expect(FORMA_PALETTE_V2.label).toBe('#77766F');
        expect(FORMA_PALETTE_V2.treeFill).toBe('#B9CDA8');
        expect(FORMA_PALETTE_V2.treeStroke).toBe('#9DB58C');
    });

    it('keeps the PRYZM purple as the parcel/selection accent — the one saturated colour', () => {
        // memory `preview-color-unified-pryzm-purple` / Contract §41: #6600FF, everywhere.
        expect(FORMA_PALETTE_V2.parcelAccent).toBe('#6600FF');
    });

    it('leaves residential land-use UNTINTED — it is the default ground of nearly every site', () => {
        expect([...PASTEL_LANDUSE_UNTINTED]).toEqual(['residential']);
    });

    it('does NOT disturb v1 — `FORMA_PALETTE` and `buildFormaMap2DStyle` are still the old style', () => {
        // v1 has other callers and its own pins (apps/editor/__tests__/siteMap2DStyle.test.ts).
        // A "v2" that mutated v1 in place would pass its own tests and break theirs.
        expect(FORMA_PALETTE.land).toBe('#F0EDE8');
        expect(FORMA_PALETTE.water).toBe('#C8DCE8');
        expect(buildFormaMap2DStyle().name).toBe('PRYZM Forma (OpenFreeMap minimal-vector)');
        expect(style.name).not.toBe(buildFormaMap2DStyle().name);
    });
});

// ── ARM 1b — layer ORDER: the masterplan effect IS the ordering ──────────────
describe('§MAP2D-PASTEL — layer order (bottom → top)', () => {
    it('is exactly the documented stack', () => {
        expect(ids).toEqual([
            PASTEL_LAYERS.background,
            // §MAP2D-WORLD-AT-LOW-ZOOM (L-12951) — the far-out tier, added AFTER this spec was
            // written. Zooming out used to reach a flat colour once the detailed layers gated
            // themselves off ("CANT ZOOM OUT AND SEE THE COUNTRIES FROM FAR … IT GOES GREY").
            // These four sit directly on the background, BELOW everything detailed, each stopping
            // at the zoom where its detailed counterpart begins so nothing double-draws.
            'pastel-world-water',
            'pastel-world-landuse',
            'pastel-world-roads',
            'pastel-world-places',
            PASTEL_LAYERS.landuseBase,
            PASTEL_LAYERS.landuseCtx,
            PASTEL_LAYERS.parksBase,
            PASTEL_LAYERS.parksCtx,
            PASTEL_LAYERS.waterBase,
            PASTEL_LAYERS.waterCtx,
            PASTEL_LAYERS.waterwayCtx,
            PASTEL_LAYERS.railCtx,
            PASTEL_LAYERS.roadMinorBase,
            PASTEL_LAYERS.roadMinorCtx,
            PASTEL_LAYERS.roadMajorCasingBase,
            PASTEL_LAYERS.roadMajorCasingCtx,
            PASTEL_LAYERS.roadMajorBase,
            PASTEL_LAYERS.roadMajorCtx,
            PASTEL_LAYERS.footwayBase,
            PASTEL_LAYERS.footwayCtx,
            PASTEL_LAYERS.cyclewayBase,
            PASTEL_LAYERS.cyclewayCtx,
            PASTEL_LAYERS.buildingsShadow,
            PASTEL_LAYERS.buildingsFill,
            PASTEL_LAYERS.buildingsOutline,
            PASTEL_LAYERS.contextBuildingsShadow,
            PASTEL_LAYERS.contextBuildingsFill,
            PASTEL_LAYERS.contextBuildingsLine,
            PASTEL_LAYERS.trees,
            PASTEL_LAYERS.roadLabel,
            PASTEL_LAYERS.placeLabel,
        ]);
    });

    it('draws SHADOW under FILL under OUTLINE, for BOTH building sources', () => {
        // This is the whole "warm-white mass floating over the page" read. Reordering it
        // throws the shadow on top of the building and the drawing dies — with no error.
        expect(ids.indexOf(PASTEL_LAYERS.buildingsShadow))
            .toBeLessThan(ids.indexOf(PASTEL_LAYERS.buildingsFill));
        expect(ids.indexOf(PASTEL_LAYERS.buildingsFill))
            .toBeLessThan(ids.indexOf(PASTEL_LAYERS.buildingsOutline));
        expect(ids.indexOf(PASTEL_LAYERS.contextBuildingsShadow))
            .toBeLessThan(ids.indexOf(PASTEL_LAYERS.contextBuildingsFill));
        expect(ids.indexOf(PASTEL_LAYERS.contextBuildingsFill))
            .toBeLessThan(ids.indexOf(PASTEL_LAYERS.contextBuildingsLine));
    });

    it('offsets the shadow 1.2 px SOUTH-EAST in VIEWPORT space, on a duplicate of the same geometry', () => {
        expect([...PASTEL_SHADOW_OFFSET]).toEqual([1.2, 1.2]); // +x right, +y DOWN ⇒ SE
        for (const id of [PASTEL_LAYERS.buildingsShadow, PASTEL_LAYERS.contextBuildingsShadow]) {
            const p = paintOf(id);
            expect(p['fill-translate']).toEqual([1.2, 1.2]);
            expect(p['fill-translate-anchor']).toBe('viewport');
            expect(p['fill-color']).toBe(FORMA_PALETTE_V2.buildingShadow);
        }
        // …and the shadow is a duplicate of the SAME source geometry, not a second dataset.
        expect(byId(PASTEL_LAYERS.buildingsShadow)['source-layer'])
            .toBe(byId(PASTEL_LAYERS.buildingsFill)['source-layer']);
        expect(byId(PASTEL_LAYERS.contextBuildingsShadow)['source'])
            .toBe(byId(PASTEL_LAYERS.contextBuildingsFill)['source']);
    });

    it('draws the major-road CASING under its FILL (a casing over a fill is a smear)', () => {
        expect(ids.indexOf(PASTEL_LAYERS.roadMajorCasingBase))
            .toBeLessThan(ids.indexOf(PASTEL_LAYERS.roadMajorBase));
        const casing = paintOf(PASTEL_LAYERS.roadMajorCasingBase);
        const fill = paintOf(PASTEL_LAYERS.roadMajorBase);
        expect(casing['line-color']).toBe(FORMA_PALETTE_V2.roadMajorCasing);
        expect(fill['line-color']).toBe(FORMA_PALETTE_V2.roadMajor);
    });

    it('dashes footways and paths so pedestrian circulation reads without labels (STR §0)', () => {
        expect([...PASTEL_FOOTWAY_DASH]).toEqual([3, 2]);
        for (const id of [PASTEL_LAYERS.footwayBase, PASTEL_LAYERS.footwayCtx]) {
            expect(paintOf(id)['line-dasharray']).toEqual([3, 2]);
            expect(paintOf(id)['line-color']).toBe(FORMA_PALETTE_V2.footway);
        }
        // The cycleway is pulled out of the pedestrian bucket and takes the faint accent.
        expect(paintOf(PASTEL_LAYERS.cyclewayBase)['line-color']).toBe(FORMA_PALETTE_V2.cycleway);
    });

    it('gives wood/forest the DARKER sage and everything else the lawn sage', () => {
        const expr = paintOf(PASTEL_LAYERS.parksCtx)['fill-color'] as unknown[];
        expect(expr[0]).toBe('match');
        expect(expr).toContain('wood');
        expect(expr).toContain('forest');
        expect(expr).toContain(FORMA_PALETTE_V2.woodland);
        // …and the fallback (last element of a `match`) is the lawn sage.
        expect(expr[expr.length - 1]).toBe(FORMA_PALETTE_V2.parks);
    });

    it('draws trees as round symbols, 2.5 → 4 px by zoom, in the canopy sage', () => {
        const p = buildPastelTreeLayer()['paint'] as Record<string, unknown>;
        expect(buildPastelTreeLayer()['type']).toBe('circle');
        expect(p['circle-color']).toBe(FORMA_PALETTE_V2.treeFill);
        expect(p['circle-stroke-color']).toBe(FORMA_PALETTE_V2.treeStroke);
        const radius = p['circle-radius'] as unknown[];
        expect(radius[0]).toBe('interpolate');
        expect(radius).toContain(2.5);
        expect(radius).toContain(4.0);
    });
});

// ── ARM 1c — zoom gates ──────────────────────────────────────────────────────
describe('§MAP2D-PASTEL — zoom gates (STR §4 M1)', () => {
    it('pins the gate values', () => {
        expect(PASTEL_ZOOM.buildings).toBe(13);
        expect(PASTEL_ZOOM.trees).toBe(15);
        expect(PASTEL_ZOOM.footways).toBe(15);
        expect(PASTEL_ZOOM.labels).toBe(14);
    });

    it('applies them to every layer that declares one', () => {
        for (const id of [
            PASTEL_LAYERS.buildingsShadow, PASTEL_LAYERS.buildingsFill, PASTEL_LAYERS.buildingsOutline,
            PASTEL_LAYERS.contextBuildingsShadow, PASTEL_LAYERS.contextBuildingsFill,
            PASTEL_LAYERS.contextBuildingsLine,
        ]) {
            expect(byId(id)['minzoom']).toBe(PASTEL_ZOOM.buildings);
        }
        expect(byId(PASTEL_LAYERS.trees)['minzoom']).toBe(PASTEL_ZOOM.trees);
        for (const id of [
            PASTEL_LAYERS.footwayBase, PASTEL_LAYERS.footwayCtx,
            PASTEL_LAYERS.cyclewayBase, PASTEL_LAYERS.cyclewayCtx,
        ]) {
            expect(byId(id)['minzoom']).toBe(PASTEL_ZOOM.footways);
        }
        expect(byId(PASTEL_LAYERS.roadLabel)['minzoom']).toBe(PASTEL_ZOOM.labels);
        expect(byId(PASTEL_LAYERS.placeLabel)['minzoom']).toBe(PASTEL_ZOOM.labels);
    });

    it('leaves NO layer but the background and the WORLD tier ungated — an ungated detailed layer tiles at world zoom', () => {
        // §MAP2D-WORLD-AT-LOW-ZOOM (L-12951). The original rule — "everything except the background
        // carries a minzoom" — is what MADE the map go grey when the founder zoomed out: gate every
        // layer and there is nothing left to draw at z0–4 but the background fill. The world tier is
        // the deliberate exception and is ungated BY DESIGN; what bounds it is a MAXZOOM at the point
        // its detailed counterpart takes over. So the invariant is not "no ungated layer", it is
        // "every ungated layer is world-tier, and every world-tier layer is bounded above".
        const WORLD_TIER = ['pastel-world-water', 'pastel-world-landuse', 'pastel-world-roads', 'pastel-world-places'];
        const ungated = layers
            .filter((l) => l['type'] !== 'background' && l['minzoom'] === undefined)
            .map((l) => String(l['id']));
        expect([...ungated].sort()).toEqual([...WORLD_TIER].sort());

        // The other half of the bargain: an ungated layer with no ceiling WOULD double-draw under
        // the detailed stack at city zoom, which is the defect this exception could otherwise cause.
        for (const id of WORLD_TIER) {
            expect(typeof byId(id)['maxzoom']).toBe('number');
        }
    });
});

// ── ARM 1d — performance shape (STR §4 M1 gate; M2 replaces these with PMTiles) ──
describe('§MAP2D-PASTEL — GeoJSON source performance options', () => {
    it('sets `tolerance` + `buffer` (and a maxzoom) on EVERY pushed source', () => {
        expect(PASTEL_GEOJSON_SOURCE_OPTS.tolerance).toBe(0.5);
        expect(PASTEL_GEOJSON_SOURCE_OPTS.buffer).toBe(64);
        const sources = style.sources as Record<string, Record<string, unknown>>;
        const geojsonIds = [...Object.values(PASTEL_SOURCES), CONTEXT_BUILDINGS_SOURCE];
        for (const id of geojsonIds) {
            const s = sources[id];
            expect(s, `source '${id}' is missing`).toBeDefined();
            expect(s!['type']).toBe('geojson');
            expect(s!['tolerance']).toBe(0.5);
            expect(s!['buffer']).toBe(64);
            expect(s!['maxzoom']).toBe(16);
        }
    });

    it('starts every pushed source EMPTY — an unbaked region degrades to the base map, not a hole', () => {
        const sources = style.sources as Record<string, Record<string, unknown>>;
        for (const id of Object.values(PASTEL_SOURCES)) {
            expect(sources[id]!['data']).toEqual({ type: 'FeatureCollection', features: [] });
        }
    });
});

// ── ARM 1e — the snap/query contract the draw tool depends on ────────────────
describe('§MAP2D-PASTEL — the layer ids SiteBoundaryMap2D queries are unchanged', () => {
    it('keeps `buildings-fill` / `buildings-3d` / the context fill+line ids', () => {
        // `SiteBoundaryMap2D.BUILDING_QUERY_LAYERS` names these three for edge snapping.
        // Renaming one would kill the snap silently — queryRenderedFeatures on a missing
        // layer id returns [], which is indistinguishable from "no building under the
        // cursor". A rename must fail HERE, loudly, not there, quietly.
        expect(ids).toContain('buildings-fill');
        expect(ids).toContain(CONTEXT_BUILDINGS_FILL_LAYER);
        expect(ids).toContain(CONTEXT_BUILDINGS_LINE_LAYER);
        const extruded = buildPastelBuildingLayers({ extrude: true }).map((l) => String(l['id']));
        expect(extruded).toContain('buildings-3d');
    });
});

// ── ARM 2 — the selection + boundary-draw path is byte-identical to HEAD ─────
const SBM2D = 'apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts';

/**
 * The nine functions that carry the parcel click ladder and the boundary draw/commit.
 * `handleParcelSelectClick` → `showParcelCard` → `useSelectedParcel` is the selection
 * ladder; `onClick` / `onDblClick` / `attachDrawHandlers` / `commit` is the draw path;
 * `installRingLayers` / `refreshParcelHighlight` render both.
 */
const PINNED_FUNCTIONS = [
    'handleParcelSelectClick',
    'useSelectedParcel',
    'showParcelCard',
    'onClick',
    'onDblClick',
    'attachDrawHandlers',
    'commit',
    'installRingLayers',
    'refreshParcelHighlight',
] as const;

/**
 * Extract one closure-scoped function's source. Every function in this file is indented
 * four spaces, so its body ends at the first subsequent line that is EXACTLY `    }` —
 * a brace counter would have to understand template literals and regex literals (both
 * present in the pinned bodies) to do better, and would be wrong in more ways.
 */
function extractFunction(source: string, name: string): string {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const head = lines.findIndex(
        (l) => l.startsWith(`    function ${name}(`) || l.startsWith(`    async function ${name}(`),
    );
    if (head < 0) throw new Error(`function ${name}() not found in ${SBM2D}`);
    for (let i = head + 1; i < lines.length; i++) {
        if (lines[i] === '    }') return lines.slice(head, i + 1).join('\n');
    }
    throw new Error(`function ${name}() has no closing brace at indent 4 in ${SBM2D}`);
}

describe('§MAP2D-PASTEL — ARM 2: the parcel + boundary path is untouched', () => {
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const headSource = execFileSync('git', ['show', `HEAD:${SBM2D}`], {
        cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const workingSource = readFileSync(join(repoRoot, SBM2D), 'utf8');

    it('actually read both revisions — an unrunnable guard must fail, never skip (§L-851)', () => {
        expect(repoRoot.length).toBeGreaterThan(0);
        expect(headSource.length).toBeGreaterThan(50_000);
        expect(workingSource.length).toBeGreaterThan(50_000);
    });

    for (const name of PINNED_FUNCTIONS) {
        it(`${name}() is byte-identical to HEAD`, () => {
            expect(extractFunction(workingSource, name)).toBe(extractFunction(headSource, name));
        });
    }

    /**
     * ⛔ THE BYTE PIN ABOVE COMPARES THE WORKING TREE TO HEAD, SO IT GOES GREEN THE MOMENT A
     * DELIBERATE CHANGE IS COMMITTED. That is by design — it is a mid-flight gate that makes a
     * cartography lane STOP and justify a touch of the parcel ladder — but it means the thing it
     * was protecting has no guard left afterwards. This arm is that guard, and it exists because
     * the pin fired for real: §PANE-CENTRED-REDRAW migrated `handleParcelSelectClick`'s three
     * `chip.textContent = …` writes to `setChip(…)`.
     *
     * ⭐ THE MIGRATION WAS NOT COSMETIC, WHICH IS WHY IT IS WORTH A PERMANENT ARM. `setChip` is not
     * a wrapper around an assignment: it also hides the pill in overlay-only mode and calls
     * `refreshTopStack()`, because the column's box reads the banner's visibility. A direct
     * `chip.textContent =` therefore leaves the top stack measured against the WRONG banner state
     * and the pill off-centre — exactly the defect §PANE-CENTRED-REDRAW removed.
     */
    it('⛔ every chip write goes through setChip() — only the constructor may assign directly', () => {
        const writes = workingSource.match(/chip\.textContent\s*=/g) ?? [];
        // Two, and only two: the element's initial text at construction, and setChip's own line.
        expect(writes.length).toBe(2);
        expect(extractFunction(workingSource, 'handleParcelSelectClick'))
            .not.toMatch(/chip\.textContent\s*=/);
    });

    it('adds exactly ONE map click binding and ONE boundary dispatch — no rival path', () => {
        const clicks = workingSource.match(/map\.on\('click',/g) ?? [];
        expect(clicks.length).toBe(1);
        const dispatches = workingSource.match(/dispatchParcelBoundary\(/g) ?? [];
        // One import binding + one call site. A cartography lane must not mint a second.
        expect(dispatches.length).toBe(1);
    });

    it('leaves BUILDING_QUERY_LAYERS — the snap contract — exactly as HEAD has it', () => {
        const line = (src: string): string =>
            src.replace(/\r\n/g, '\n').split('\n').find((l) => l.startsWith('const BUILDING_QUERY_LAYERS')) ?? '';
        expect(line(workingSource)).toBe(line(headSource));
        expect(line(workingSource)).toContain('buildings-fill');
    });
});
