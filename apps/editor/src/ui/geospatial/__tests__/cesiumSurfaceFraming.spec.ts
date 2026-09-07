// §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991, founder 2026-09-06) — the surface table that stops the
// `3D Globe` framing from wearing the `3D Site` surface.
//
// ⭐ WHAT THESE PIN, AND WHY IT IS A TABLE RATHER THAN A LIST OF BUG FIXES. The founder's `3D Globe`
// pane rendered ONE BEIGE TRIANGULAR SHARD on white. §L-412 keeps exactly ONE Cesium viewer,
// re-targeted between panes (correct, unchanged, and re-affirmed by the founder in STR §26.1.1), so
// every write the site view made landed on the viewer the globe also used: a Córdoba-bounded
// terrain tileset, the imagery layers hidden, the photoreal tileset hidden, no sky, and a
// TRANSPARENT clear showing the white page through the canvas. Six symptoms, one mechanism.
//
// The regression these guard against is therefore not "the shard comes back" but the subtler one:
// a future edit fixing ONE of the six and leaving the other five, which is exactly the shape the
// defect had. Each case below asserts a FIELD, so half a fix fails.
import { describe, it, expect } from 'vitest';
import {
    cesiumSurfaceKind,
    cesiumSurfaceWrites,
    describeCesiumSurface,
    type CesiumViewFraming,
} from '../cesiumSurfaceFraming';

// §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — `formaBackdropCss` is the THIRD colour the table takes
// from its caller and never owns. `'#FFFFFF'` here mirrors what `formaBackdropClearCss()` returns
// for the shipped flat-white backdrop; the `null` case (a restored gradient) has its own arm below,
// because a table that only ever gets one of two inputs is a table with one untested row.
const PALETTE = {
    formaGroundCss: '#F5F2EA',
    globeLoadingCss: '#EDECF5',
    formaBackdropCss: '#FFFFFF' as string | null,
} as const;
const writes = (formaMode: boolean, framing: CesiumViewFraming) =>
    cesiumSurfaceWrites(cesiumSurfaceKind({ formaMode, framing }), PALETTE);

describe('cesiumSurfaceKind — the one predicate', () => {
    it('only "the massing study, seen from the site" wants the Forma ground', () => {
        expect(cesiumSurfaceKind({ formaMode: true, framing: 'site' })).toBe('forma-site');
    });

    // ⭐ THE DEFECT, AS ONE ASSERTION. `frameGlobe()` never changed `formaMode` — it only flew the
    // camera — so before this table the answer for (forma=true, framing='world') was, in effect,
    // 'forma-site'. That is the shard.
    it('the WORLD framing wins over Forma — a globe is never the flat site ground', () => {
        expect(cesiumSurfaceKind({ formaMode: true, framing: 'world' })).toBe('global-earth');
    });

    // No third row: the photoreal path already carries its own global ground (Google 3D tiles +
    // imagery) and `decideBakedTerrainAttach` already refuses to drape our mesh under it, so
    // "site + photoreal" and "world" want the SAME surface. One row, so they cannot drift apart.
    it('leaving Forma resolves to the same global surface from either framing', () => {
        expect(cesiumSurfaceKind({ formaMode: false, framing: 'site' })).toBe('global-earth');
        expect(cesiumSurfaceKind({ formaMode: false, framing: 'world' })).toBe('global-earth');
    });
});

describe('cesiumSurfaceWrites — every field the two framings shared', () => {
    // ⛔ THE L-12991 FIELD. This is the one that produced the shard geometry: a bounded
    // quantized-mesh tileset declares availability only inside its own layer.json bbox, so at world
    // range Cesium draws one or two level-0 roots and nothing else.
    it('a CITY-BOUNDED terrain tileset is permitted on the site surface and REFUSED on the globe', () => {
        expect(writes(true, 'site').boundedTerrainPermitted).toBe(true);
        expect(writes(true, 'world').boundedTerrainPermitted).toBe(false);
        expect(writes(false, 'site').boundedTerrainPermitted).toBe(false);
    });

    // ⭐ FIXING THE TERRAIN ALONE WOULD NOT HAVE FIXED THE PICTURE. `applyFormaMode` hides every
    // imagery layer and every 3D tileset, so a globe with correct terrain and no imagery is a
    // featureless cream sphere. Both halves, or neither.
    it('the globe gets its imagery AND its photoreal tileset back; the site keeps them hidden', () => {
        const globe = writes(true, 'world');
        expect(globe.imageryLayersShown).toBe(true);
        expect(globe.tilesetsShown).toBe(true);
        const site = writes(true, 'site');
        expect(site.imageryLayersShown).toBe(false);
        expect(site.tilesetsShown).toBe(false);
    });

    // The white the shard floated on. On a globe a TRANSPARENT clear is the page showing through;
    // an Earth needs an opaque brand-safe clear (§GLOBE-FIRST-FRAME-COLOUR). Unchanged.
    it('the globe clears to an OPAQUE brand colour and never wears the Forma backdrop', () => {
        expect(writes(true, 'world').backgroundColourCss).toBe(PALETTE.globeLoadingCss);
        expect(writes(true, 'world').formaSkyBackdrop).toBe(false);
    });

    // ⭐ §SITE-SCOPE-CITYWEFT-CLEAR (L-13100). THIS ARM READ `.toBeNull()` UNCONDITIONALLY. The
    // site row cleared TRANSPARENT because a scene clear is one flat colour and the backdrop was a
    // GRADIENT — a real constraint while it lasted. The founder's *"make the background completely
    // white if you can"* collapsed the gradient, so the constraint lapsed, and what transparency
    // left behind was worse than it looked: the white became a property of `container.style`, whose
    // base underneath is `#000`.
    it('the SITE row clears OPAQUELY to the flat backdrop, and still wears the CSS backdrop too', () => {
        expect(writes(true, 'site').backgroundColourCss).toBe('#FFFFFF');
        // Belt-and-braces, not either/or: the container keeps the same tone, so the frames BEFORE
        // `applyCesiumSurface` runs are not the container's black.
        expect(writes(true, 'site').formaSkyBackdrop).toBe(true);
    });

    // ⛔ THE REVERSIBILITY ARM — the reason `formaBackdropClearCss` returns `string | null` rather
    // than a boolean. Restore a genuine gradient (either stop off white) and the site row must go
    // back to TRANSPARENT so the CSS gradient shows through the alpha canvas, WITHOUT anyone
    // remembering that it had to. Without this arm the opaque clear would be a one-way door.
    it('a restored GRADIENT puts the site row back to a transparent clear', () => {
        const gradient = { ...PALETTE, formaBackdropCss: null };
        expect(cesiumSurfaceWrites('forma-site', gradient).backgroundColourCss).toBeNull();
        expect(cesiumSurfaceWrites('forma-site', gradient).formaSkyBackdrop).toBe(true);
        // The globe row is unaffected by the backdrop decision in either direction.
        expect(cesiumSurfaceWrites('global-earth', gradient).backgroundColourCss).toBe(PALETTE.globeLoadingCss);
    });

    it('the globe reads as a planet: sky, atmosphere and lighting on, no Forma fog', () => {
        const globe = writes(true, 'world');
        expect(globe.skyShown).toBe(true);
        expect(globe.globeShowGroundAtmosphere).toBe(true);
        expect(globe.globeDynamicAtmosphereLighting).toBe(true);
        expect(globe.globeEnableLighting).toBe(true);
        expect(globe.fog).toBe('off');
        const site = writes(true, 'site');
        expect(site.skyShown).toBe(false);
        expect(site.globeShowGroundAtmosphere).toBe(false);
        expect(site.fog).toBe('forma-soft');
    });

    // A shown photoreal tileset IS the ground on the globe, so drawing the ellipsoid under it
    // double-grounds and z-fights; the Forma study has no tileset shown and the globe surface IS
    // its ground, so it is always drawn.
    it('globe.show is conditional on the globe surface and unconditional on the site surface', () => {
        expect(writes(true, 'world').globeShown).toBe('unless-tileset-shown');
        expect(writes(true, 'site').globeShown).toBe('always');
    });

    // ⛔ NO HEXES IN THE PURE MODULE. `FORMA_PALETTE.ground` and `GLOBE_LOADING_COLOUR` are declared
    // in `CesiumViewport.ts`, which names itself the single source of truth for the Forma palette;
    // a second copy here is the drift §PALETTE-PARITY-2D-3D (L-12965) spent a lane removing.
    it('takes both base colours from the caller rather than owning any', () => {
        const custom = { formaGroundCss: '#010203', globeLoadingCss: '#040506', formaBackdropCss: '#070809' };
        expect(cesiumSurfaceWrites('forma-site', custom).globeBaseColourCss).toBe('#010203');
        expect(cesiumSurfaceWrites('global-earth', custom).globeBaseColourCss).toBe('#040506');
        // §SITE-SCOPE-CITYWEFT-CLEAR (L-13100) — the third caller-owned colour, same rule: the
        // module must pass it through, never substitute a hex of its own.
        expect(cesiumSurfaceWrites('forma-site', custom).backgroundColourCss).toBe('#070809');
    });
});

describe('describeCesiumSurface — the log names BOTH facts', () => {
    // A line that said only "surface=global-earth" would leave the next reader unable to tell a
    // globe-that-kept-the-city-terrain from a genuinely flat site — which is how L-12987 came to
    // blame pane routing for this defect twice. Same discipline as `describeTerrainTransition`.
    it('prints the framing and the Forma state, not just the outcome', () => {
        const line = describeCesiumSurface('world', true, cesiumSurfaceKind({ formaMode: true, framing: 'world' }));
        expect(line).toContain("framing='world'");
        expect(line).toContain('forma=on');
        expect(line).toContain("surface='global-earth'");
        expect(line).toContain('L-12991');
    });

    it('says out loud, on the globe line, that no bounded tileset may be attached', () => {
        const line = describeCesiumSurface('world', true, 'global-earth');
        expect(line).toContain('bounded');
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §SITE-SCOPE-CITYWEFT — THE SHADING BAND (founder 2026-09-07, on build `2c12b8d5`:
 * *"the cut is not correct… it should look like cityweft — white background clean cut — ALSO FOR
 * THE TERRAIN"*).
 *
 * ⭐ THESE ARE ARITHMETIC, NOT TASTE, WHICH IS WHY THEY ARE TESTABLE. Cesium's globe fragment
 * shader under `ENABLE_VERTEX_LIGHTING` (`CesiumUnminified/index.js:207493`) is:
 *
 *     diffuseIntensity = clamp(lambert * u_lambertDiffuseMultiplier + u_vertexShadowDarkness, 0, 1)
 *     finalColor.rgb   = color.rgb * czm_lightColor * diffuseIntensity
 *
 * with `lambert = max(dot(l, n), 0) ∈ [0, 1]`. So the intensity band is exactly
 * `[vertexShadowDarkness, multiplier + vertexShadowDarkness]`, and the DARKEST the ground can ever
 * paint is `baseColour × vertexShadowDarkness`. At Cesium's defaults (0.9 / 0.3, `index.js:214856`
 * and `:214880`) that is #F5F2EA × 0.3 = #4A4946 — the founder's brown hillside, computed.
 */
describe('§SITE-SCOPE-CITYWEFT — the terrain shading band', () => {
    /** The darkest colour the shader can paint a ground of `css`, given the band's floor. */
    function darkest(css: string, floor: number): { r: number; g: number; b: number } {
        const n = parseInt(css.replace('#', ''), 16);
        return {
            r: Math.round(((n >> 16) & 255) * floor),
            g: Math.round(((n >> 8) & 255) * floor),
            b: Math.round((n & 255) * floor),
        };
    }

    it('⛔ the SITE never lets a shaded slope drop below a pale grey — the brown is arithmetic', () => {
        const site = writes(true, 'site');
        const d = darkest(PALETTE.formaGroundCss, site.globeVertexShadowDarkness);
        // Every channel stays well inside the top third of the range. At Cesium's default floor of
        // 0.3 this same assertion reads (74, 73, 70) and fails, which is the point of the number.
        expect(Math.min(d.r, d.g, d.b)).toBeGreaterThan(180);
    });

    it('the band is used END TO END — the sunlit face reaches the full paper, and the clamp never clips', () => {
        const site = writes(true, 'site');
        expect(site.globeLambertDiffuseMultiplier + site.globeVertexShadowDarkness).toBeCloseTo(1, 6);
    });

    it('⛔ it is a NARROWED band, not a killed light — a zero multiplier is L-636\u2019s white mask', () => {
        // enableLighting stays available (the terrain attach raises it on relief). What must never
        // happen is the multiplier going to 0: every slope would then paint the identical flat
        // baseColor and the relief would lose its form entirely — the defect L-636 fixed.
        const site = writes(true, 'site');
        expect(site.globeLambertDiffuseMultiplier).toBeGreaterThan(0.1);
    });

    it('the EARTH keeps Cesium\u2019s own defaults — a planet with an 18 % band has no terminator', () => {
        const globe = writes(false, 'world');
        expect(globe.globeLambertDiffuseMultiplier).toBe(0.9);
        expect(globe.globeVertexShadowDarkness).toBe(0.3);
    });

    it('⛔ the two rows really DIFFER — otherwise this whole block passes vacuously', () => {
        expect(writes(true, 'site').globeVertexShadowDarkness).not.toBe(
            writes(false, 'world').globeVertexShadowDarkness,
        );
    });
});
