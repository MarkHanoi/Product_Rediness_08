// §FIX-FACADE-WINDOWS-UNCOLOURED (L-10120, founder 2026-08-23) — "windows should NOT be coloured
// but all the rest of the surfaces yes, according to sun exposition."
//
// WHAT THIS SUITE IS AND IS NOT. The drape's mask now lives in TWO artefacts with DIFFERENT
// reach, and a test that only exercised one of them would reproduce the very defect being fixed
// (the CPU opening punch was already tested — `realModelSunDrape.test.ts` — and the founder still
// saw coloured windows, because the punch was never the whole mask). So:
//
//   ARM A — the SHADER. It is a GLSL string built inside `CesiumViewport`, a module that imports
//     cesium at module scope and therefore cannot be imported under this node config (the same
//     constraint `formaOpeningsDetermination.ts` records). The shader is therefore asserted
//     against the REAL source text on disk — the artefact that ships — not against a re-typed
//     copy. A hand-written GLSL evaluator would be a fake built from the header, and per
//     [[fake-more-capable-than-real]] it could not falsify the header.
//   ARM B — the CPU atlas. Real functions, real call.
//   ARM C — the NUMBER. The founder's picture and the study's numbers must agree, so the basis
//     of the one aggregate the study reports (`normalizeFacadeStudy`'s divisor) is PINNED here:
//     it is taken over the solid face rectangles, opening regions included, and the display mask
//     does not move it. If a later lane excludes opening nodes from the lattice, this fails —
//     which is correct: that is a basis change and C66 §1.1 says a changed basis must be declared.
//   ARM D — the cross-package coupling the glazing test rests on. The alpha threshold is only
//     meaningful because the forma-white GLB export paints glazing at a KNOWN opacity; that
//     number lives in another package and is asserted against ITS source, not restated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildRealModelSunDrape,
    facadeOpeningUvRects,
    normalizeFacadeStudy,
    FACADE_DRAPE_GLAZING_ALPHA_MAX,
    type FacadeDrapeFace,
} from '../src/ui/climate/siteMetricGrids';

const VIEWPORT_SRC = resolve(__dirname, '../src/ui/geospatial/CesiumViewport.ts');
const EXPORTER_SRC = resolve(
    __dirname, '../../../packages/file-format/src/export/glb/GLBExporter.ts',
);

/** The `fragmentShaderText: [ ... ].join('\n')` array literal of `applyRealModelSunDrape`, i.e.
 *  the GLSL that actually ships — sliced out of the real file, never re-typed here. */
function drapeFragmentShaderSource(): string {
    const body = readFileSync(VIEWPORT_SRC, 'utf8');
    const start = body.indexOf('private applyRealModelSunDrape(');
    expect(start, 'applyRealModelSunDrape must exist in CesiumViewport.ts').toBeGreaterThan(0);
    const fsStart = body.indexOf('fragmentShaderText:', start);
    expect(fsStart, 'applyRealModelSunDrape must build a fragmentShaderText').toBeGreaterThan(0);
    const fsEnd = body.indexOf(".join('\\n')", fsStart);
    expect(fsEnd).toBeGreaterThan(fsStart);
    // Keep ONLY the quoted GLSL lines — a `// …` rationale comment mentioning `discard` must not
    // be able to satisfy (or fail) an assertion about the emitted shader.
    return body.slice(fsStart, fsEnd)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith("'"))
        .map((l) => l.replace(/^'/, '').replace(/',?$/, ''))
        .join('\n');
}

describe('§FIX-FACADE-WINDOWS-UNCOLOURED ARM A — the shader withholds colour, and removes nothing', () => {
    it('tests the fragment’s OWN base-colour alpha for glazing', () => {
        const glsl = drapeFragmentShaderSource();
        expect(glsl).toContain('u_pryzmGlazeAlphaMax');
        expect(glsl).toMatch(/material\.alpha\s*<\s*u_pryzmGlazeAlphaMax/);
    });

    it('runs the glazing test FIRST — before the roof/wall split and before any material write', () => {
        const glsl = drapeFragmentShaderSource();
        const guard = glsl.indexOf('u_pryzmGlazeAlphaMax');
        const firstWrite = glsl.indexOf('material.diffuse =');
        const readsPosition = glsl.indexOf('positionMC');
        const roofBranch = glsl.indexOf('u_pryzmRoofBand');
        expect(guard).toBeGreaterThan(-1);
        expect(firstWrite).toBeGreaterThan(guard);   // a window is never repainted
        expect(readsPosition).toBeGreaterThan(guard); // …nor re-read as a wall or a roof texel
        expect(roofBranch).toBeGreaterThan(guard);    // …nor as a skylight-shaped roof fragment
    });

    it('a masked fragment RETURNS (keeps the model’s own material) and is never DISCARDED', () => {
        const glsl = drapeFragmentShaderSource();
        // The whole point of the L-10120 fix: "no analysis value here" is not "delete this
        // surface". A discard would take the window's glass, the opening's reveals and every
        // roof eave outside the footprint ring with it.
        expect(glsl).not.toContain('discard');
        // Every exit path is a bare `return;` out of the void fragmentMain.
        expect(glsl.match(/return;/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });

    it('wires the threshold from FACADE_DRAPE_GLAZING_ALPHA_MAX, and 0 disables the test', () => {
        const body = readFileSync(VIEWPORT_SRC, 'utf8');
        expect(body).toContain('glazingAlphaMax = FACADE_DRAPE_GLAZING_ALPHA_MAX');
        expect(body).toMatch(/u_pryzmGlazeAlphaMax:[\s\S]{0,120}Math\.max\(0, glazingAlphaMax\)/);
        expect(drapeFragmentShaderSource()).toMatch(/u_pryzmGlazeAlphaMax\s*>\s*0\.0/);
    });
});

describe('§FIX-FACADE-WINDOWS-UNCOLOURED ARM B — the authored-opening mask still shapes the atlas', () => {
    // One 10 m face on the line z = -5 running west→east, building height 10 m, carrying one
    // authored window: 2 m wide at 4 m along, sill 1 m, height 1.5 m.
    const FACE = { ax: -5, az: -5, ux: 1, uz: 0, segLen: 10 } as const;
    const WINDOW = {
        a: { x: -1, z: -5 }, b: { x: 1, z: -5 },
        baseElevation: 0, sill: 1, height: 1.5, kind: 'window' as const,
    };

    it('projects the authored window onto its own face and nowhere else', () => {
        const onFace = facadeOpeningUvRects(FACE, 10, [WINDOW]);
        expect(onFace).toHaveLength(1);
        expect(onFace[0]!.u0).toBeCloseTo(0.4, 6);
        expect(onFace[0]!.u1).toBeCloseTo(0.6, 6);
        expect(onFace[0]!.v0).toBeCloseTo(0.1, 6);
        expect(onFace[0]!.v1).toBeCloseTo(0.25, 6);
        // The PARALLEL face 10 m north is not this window's face — the on-face tolerance is
        // sub-metre, so an opening never leaks onto the wall opposite it.
        const other = facadeOpeningUvRects({ ...FACE, az: 5 }, 10, [WINDOW]);
        expect(other).toHaveLength(0);
    });

    it('zeroes alpha inside the opening and keeps colour on the wall around it', () => {
        const openings = facadeOpeningUvRects(FACE, 10, [WINDOW]);
        const face: FacadeDrapeFace = {
            ax: FACE.ax, az: FACE.az, bx: 5, bz: -5,
            nU: 2, nV: 2, intensities: [0.8, 0.8, 0.8, 0.8], openings,
        };
        const drape = buildRealModelSunDrape({
            faces: [face], centroidE: 0, centroidN: 0, heightM: 10,
            roofIntensities: [1, 1, 1, 1], roofNU: 2, roofNV: 2,
            roofMinE: -5, roofMinN: -5, roofSpanE: 10, roofSpanN: 10,
            cellWidth: 100, cellHeight: 100, roofSize: 8, vivid: false,
        });
        const alphaAt = (uFrac: number, vFrac: number): number => {
            const tx = Math.min(drape.cellW - 1, Math.floor(uFrac * drape.cellW));
            const ty = Math.min(drape.cellH - 1, Math.floor(vFrac * drape.cellH));
            return drape.wallRgba[(ty * drape.wallW + tx) * 4 + 3]!;
        };
        expect(alphaAt(0.50, 0.175)).toBe(0);   // dead centre of the window
        expect(alphaAt(0.50, 0.60)).toBeGreaterThan(0);  // wall above it
        expect(alphaAt(0.20, 0.175)).toBeGreaterThan(0); // wall beside it
        expect(alphaAt(0.50, 0.02)).toBeGreaterThan(0);  // wall below the sill
    });
});

describe('§FIX-FACADE-WINDOWS-UNCOLOURED ARM C — the display mask does NOT move the divisor', () => {
    it('normalizeFacadeStudy divides by the max over ALL nodes, opening regions included', () => {
        // Node index 1 is the brightest node of the study AND sits inside a window opening.
        // The picture withholds colour there; the NUMBER still counts it. That asymmetry is
        // deliberate and is what keeps this fix display-only — assert it so it cannot drift
        // silently in either direction.
        const brightestIsInsideAnOpening = [0.2, 0.9, 0.3, 0.4];
        const normed = normalizeFacadeStudy([brightestIsInsideAnOpening], [0.95]);
        expect(normed.max).toBeCloseTo(0.9, 9);
        expect(normed.walls[0]![1]).toBeCloseTo(1, 9);
        expect(normed.walls[0]![0]).toBeCloseTo(0.2 / 0.9, 9);
        // The roof shares the SAME divisor and clamps at the warm end.
        expect(normed.roof[0]).toBeCloseTo(1, 9);
    });

    it('is a per-point ratio, not an area integral — dropping nodes would change the answer', () => {
        // The counter-factual, stated as a test so the reason for NOT excluding opening nodes is
        // measured rather than asserted in prose: remove the in-opening node and every remaining
        // colour rescales. That is a basis change, and C66 §1.1 requires it be declared.
        const withOpeningNodes = normalizeFacadeStudy([[0.2, 0.9, 0.3, 0.4]]);
        const withoutOpeningNodes = normalizeFacadeStudy([[0.2, 0.3, 0.4]]);
        expect(withoutOpeningNodes.max).not.toBeCloseTo(withOpeningNodes.max, 3);
        expect(withoutOpeningNodes.walls[0]![0]).toBeGreaterThan(withOpeningNodes.walls[0]![0]!);
    });
});

describe('§FIX-FACADE-WINDOWS-UNCOLOURED ARM D — the threshold matches the export it reads', () => {
    it('sits strictly between the forma-white GLASS opacity and fully opaque', () => {
        // The glazing test is only sound because the 3D-Site GLB is exported `formaWhite: true`,
        // which gives glazing ONE known opacity and every opaque element alpha 1.0. That opacity
        // lives in another package; read it from THERE so a change over there fails HERE instead
        // of silently un-masking every window.
        const exporter = readFileSync(EXPORTER_SRC, 'utf8');
        const m = /FORMA_WHITE_DEFAULT_GLASS_OPACITY\s*=\s*([0-9.]+)/.exec(exporter);
        expect(m, 'GLBExporter must still declare FORMA_WHITE_DEFAULT_GLASS_OPACITY').not.toBeNull();
        const glassOpacity = Number(m![1]);
        expect(glassOpacity).toBeGreaterThan(0);
        expect(glassOpacity).toBeLessThan(FACADE_DRAPE_GLAZING_ALPHA_MAX);
        expect(FACADE_DRAPE_GLAZING_ALPHA_MAX).toBeLessThan(1);
        // …and the opaque half must stay opaque: a `transparent`/`opacity` on the white material
        // would drag every wall under the threshold and un-colour the entire building.
        expect(exporter).toMatch(
            /whiteMat = new THREE\.MeshStandardMaterial\(\{ color: opaqueHex, roughness: [0-9.]+, metalness: [0-9.]+ \}\)/,
        );
    });

    it('the glass role covers the whole window element (frame included), not just the pane', () => {
        // `classifyFormaWhiteRole` resolves the element type by walking UP from the mesh, so a
        // window's frame meshes take the glass material too. That is why the alpha test masks a
        // window WHOLE rather than leaving a coloured frame around clear glass.
        const exporter = readFileSync(EXPORTER_SRC, 'utf8');
        for (const t of ['window', 'curtainwall', 'curtain-wall', 'curtainpanel', 'glazing', 'skylight']) {
            expect(exporter).toContain(`'${t}'`);
        }
        expect(exporter).toMatch(/while \(p\) \{[\s\S]{0,200}userData\?\.elementType/);
    });
});
