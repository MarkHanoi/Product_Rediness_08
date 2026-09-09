// §GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — ON THE GLOBE, THE PHOTOREAL TILESET *IS* THE CONTEXT.
//
// Founder, 2026-09-07: *"3d globe (3d tiles renders sound) however, it renders with all the context
// from 3d site - check why and fix it sound"* — his screenshots show real Barcelona photoreal tiles
// with a large pale patch of PRYZM's own extruded context buildings sitting ON TOP of the real city.
//
// ⭐ THE CAUSE IS ONE WORD OF HIS OWN LOG:
//     §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) framing='world' **forma=on** → surface='global-earth'
// The surface row governs IMAGERY · PHOTOREAL · ATMOSPHERE · GLOBE SHOW · TERRAIN ATTACH. It governed
// the FORMA CONTEXT OVERLAY nowhere. `forma=on` was printed right there and nothing acted on it.
//
// ⭐ THE DISTINCTION THAT MAKES THE FIX SOUND, AND IT IS THE THING THESE TESTS PIN:
//     SYNTHESISED CONTEXT hides on 'global-earth'  ·  AUTHORED-OR-DERIVED DESIGN stays.
// `§PLOT-CLEAR-PHOTOREAL` cuts a parcel-shaped void into the photoreal tileset precisely so *"the
// proposed design now reads inside real context"*. A fix that hid the design along with the context
// would destroy that feature — so the second half is asserted as hard as the first.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    cesiumSurfaceKind,
    cesiumSurfaceWrites,
    describeCesiumSurface,
} from '../cesiumSurfaceFraming';

const PALETTE = {
    formaGroundCss: '#F5F2EA',
    globeLoadingCss: '#1B1D22',
    formaBackdropCss: '#FFFFFF',
} as const;

const SRC = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');

/** The body of a class method — same convention as `siteScopeSwapNeverBlank.spec.ts`. */
function methodBody(name: string): string {
    const decl = new RegExp(`\\n  (?:public|private|protected)[^\\n]*\\b${name}\\(`);
    const m = decl.exec(SRC);
    expect(m, `method ${name}() not found — it was renamed or removed`).not.toBeNull();
    const from = m!.index + 1;
    const rest = SRC.slice(from + 10);
    const nextDecl = /\n {2}(?:public|private|protected)[ \t]/.exec(rest);
    return rest.slice(0, nextDecl ? nextDecl.index : rest.length);
}

/** Source with comment lines stripped — a comment naming a collection is not a write to it. */
function codeOnly(src: string): string {
    return src
        .split('\n')
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join('\n');
}

describe('§GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — the axis is IN THE TABLE', () => {
    it("the founder's exact state — forma=on, framing='world' — hides the synthesised context", () => {
        // This is the line out of his console, read as a value rather than as prose.
        const kind = cesiumSurfaceKind({ formaMode: true, framing: 'world' });
        expect(kind).toBe('global-earth');
        expect(cesiumSurfaceWrites(kind, PALETTE).synthesisedContextShown).toBe(false);
    });

    it('the 3D Site keeps it — this is the surface the synthesised context was built for', () => {
        const kind = cesiumSurfaceKind({ formaMode: true, framing: 'site' });
        expect(kind).toBe('forma-site');
        expect(cesiumSurfaceWrites(kind, PALETTE).synthesisedContextShown).toBe(true);
    });

    it('the photoreal-at-site surface hides it too — one row, not a third', () => {
        // `!formaMode` at site framing already resolves to 'global-earth' (the table's own header
        // argues why that must be ONE row), and the photoreal tileset is the context there as well.
        expect(cesiumSurfaceWrites(cesiumSurfaceKind({ formaMode: false, framing: 'site' }), PALETTE)
            .synthesisedContextShown).toBe(false);
    });

    it('shows it on exactly ONE of the four (formaMode × framing) combinations', () => {
        const shown = ([true, false] as const).flatMap((formaMode) =>
            (['site', 'world'] as const).map((framing) => ({
                formaMode, framing,
                shown: cesiumSurfaceWrites(cesiumSurfaceKind({ formaMode, framing }), PALETTE)
                    .synthesisedContextShown,
            })),
        );
        expect(shown.filter((r) => r.shown)).toEqual([{ formaMode: true, framing: 'site', shown: true }]);
    });

    it('the console line STATES the context decision, so a future reader can tell which happened', () => {
        const world = describeCesiumSurface('world', true, 'global-earth');
        expect(world).toContain("framing='world'");
        expect(world).toContain('forma=on');
        expect(world).toMatch(/SYNTHESISED/);
        expect(world).toMatch(/HIDDEN/);
        // ⛔ And it must say the design survives — the half a reader would otherwise assume away.
        expect(world).toMatch(/DESIGN/);
        expect(describeCesiumSurface('site', true, 'forma-site')).toMatch(/synthesised context shown/);
    });
});

describe('§GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — the context/design SPLIT, at the render site', () => {
    const BODY = codeOnly(methodBody('applySynthesisedContextVisibility'));

    it('hides every SYNTHESISED context holder', () => {
        // The same set `restorePhotorealMode` already clears on the photoreal axis — that precedent
        // is what settles the membership, including the §SITE-SCOPE slab.
        for (const holder of [
            'this.contextRoadEntities',
            'this.contextRailEntities',
            'this.contextWaterEntities',
            'this.contextSeaEntities',
            'this.contextParkEntities',
            'this.contextLanduseEntities',
            'this.contextFarTierPrimitive',
            'this.contextFarTierWirePrimitive',
            'this.contextTreesPrimitive',
            'this.siteScopeSlabPrimitive',
            'this.streetLife.setShown',
        ]) {
            expect(BODY, `${holder} is no longer suppressed on the globe`).toContain(holder);
        }
        // The buildings are composed through their ONE writer rather than overwritten here.
        expect(BODY).toContain('this.reapplyPlotClearToContext()');
    });

    it('⛔ TOUCHES NO DESIGN COLLECTION — the user\'s own work must survive the globe', () => {
        // §PLOT-CLEAR-PHOTOREAL cuts a parcel void so "the proposed design now reads inside real
        // context". Hiding the design here would delete the reason that void exists.
        for (const design of [
            'formaMassingEntities',
            'formaSiteOverlayEntities',
            'spaceEnvelopeEntities',
            'siteMetricEntities',
            'facadeAnalysisEntities',
            'photorealVoidCapEntity',
        ]) {
            expect(BODY, `${design} is DESIGN, not context — it must not be hidden on the globe`)
                .not.toContain(design);
        }
    });

    it('⛔ IS A FLIP, NOT A TEARDOWN — nothing is cleared, aborted, disposed or re-fetched', () => {
        // The founder reparents the panes constantly; a hide that forced a rebuild would hand him
        // back the multi-second reload this whole area has been fighting.
        expect(BODY).not.toMatch(/this\.clearContext[A-Za-z]*\(/);
        expect(BODY).not.toMatch(/\.dispose\(/);
        expect(BODY).not.toMatch(/Abort\?\.abort\(\)/);
        expect(BODY).not.toMatch(/this\.loadContext[A-Za-z]*\(/);
        // …and the way back re-arms the scope cut through the path that early-outs UNCHANGED.
        expect(BODY).toContain('this.applySiteScopeClip(');
    });

    it('the globe cut is SUSPENDED in place, never torn down', () => {
        const cut = codeOnly(methodBody('applySiteScopeGlobeCutSuspended'));
        // `ClippingPolygonCollection.enabled` and a cached rectangle — so `applySiteScopeClip`'s
        // "UNCHANGED: already cut … nothing rebuilt" early-out still holds on the return trip.
        expect(cut).toContain('enabled = !suspended');
        expect(cut).toContain('siteScopeLimitRectCached');
        expect(cut).toContain('Rectangle.MAX_VALUE');
        expect(cut).not.toMatch(/clearContextEarthSlab/);
    });
});

describe('§GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — ONE writer for a context building show flag', () => {
    const BODY = codeOnly(methodBody('reapplyPlotClearToContext'));

    it('ANDs the plot-clear verdict with the surface flag, in one place', () => {
        // Two methods each writing `entity.show` would fight and the loser would be whichever ran
        // first — so a parcel commit made on the globe would have resurrected the whole city.
        expect(BODY).toContain('&& this.synthesisedContextShown');
    });
});

describe('§GLOBE-IS-ITS-OWN-CONTEXT (L-13144) — the surface owns the scope cut', () => {
    const BODY = codeOnly(methodBody('applySiteScopeClip'));

    it('refuses to cut the Earth while the globe is framed', () => {
        // `formaMode` is TRUE on the 3D Globe (the founder's own log: framing='world' forma=on), so
        // the pre-existing "not in Forma mode" guard does NOT cover this case, and a scope change
        // made from the globe would re-bound the planet to a 2 km rectangle under the tiles.
        expect(BODY).toContain('if (!this.synthesisedContextShown)');
    });
});
