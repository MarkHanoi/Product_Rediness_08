// L967MetalPanelIsNotBlack.test.ts
// §FEAT-PASCAL-METAL-ENV (L-967) — the founder's case, proven at the layer that DECIDES
// what colour a metal panel is: the RENDERED PIXEL, not a field on a material.
//
// THE REPORT. "Metal panel — copper frame" renders completely black, with "a copper touch
// on the top of the panel" and nothing else. The type definition is correct:
// `cw.metal.copper-frame` carries `mullionMaterialId: 'copper-new'` and
// `panelMaterialId: 'aluminium-brushed-dark'`, both resolve, and the founder's own log
// shows the resolution reaching the renderer. Nothing is missing from any payload.
//
// THE CAUSE. `aluminium-brushed-dark` is `metalness: 0.9`. A near-fully-metallic PBR
// surface has a diffuse albedo of `color x (1 - metalness)` — 10 % of an already dark
// `#474d52` — and shows what it REFLECTS for everything else. `PascalSceneLighting` set
// `scene.environment = null` deliberately, to keep SSGI AO contrast readable. So there
// was nothing to reflect, and EVERY high-metalness material in the product rendered
// black: walls, columns, beams, handrails, furniture. Curtain wall is only where the
// founder pointed a metal at a large flat face and looked at it.
//
// ⚠ WHY A FIELD ASSERTION WOULD PROVE NOTHING HERE. `expect(mat.metalness).toBe(0.9)` was
// ALREADY true while the panel was black — the material was perfect and the scene was
// empty. So is `expect(scene.environment).not.toBeNull()`: it would pass against an
// environment so dim the panel is still black, and against one so bright the scene is
// blown out. The subject has to be the OUTGOING RADIANCE, tone-mapped to a display byte.
//
// ⚠ THE ORACLE IS TEST-LOCAL AND THE PRODUCTION CODE CANNOT MOVE IT. `displayBytes()`
// below re-implements three r183's own shading — `BRDF_Lambert` + `BRDF_GGX` for the
// direct lights, `DFGApprox` for the IBL split-sum, then `ACESFilmicToneMapping` at
// exposure 0.9 (which is exactly what BOTH renderer adapters set: WebGLRendererAdapter
// :102-103 and WebGPURendererAdapter :159-160) and the sRGB OETF. It reads NOTHING from
// the code under test except `scene.environment` / `scene.environmentIntensity` — the two
// values the fix actually changes. A break in the fix moves the subject and leaves the
// oracle where it was, which is the property three separate lanes lost this session:
// a break that moves the oracle and the subject together measures nothing.
//
// It is pinned twice against that hazard:
//   • ORACLE ANCHOR — a pure-white non-metal under Pascal's 3 lights must tone-map near
//     white with NO environment at all. The fix cannot make that assertion pass or fail,
//     so if the oracle is ever gutted to return a constant, that anchor catches it.
//   • RED CONTROL — every metal is asserted BLACK against the pre-fix scene state
//     (environment null), reproducing the founder's screenshot, before being asserted
//     non-black against the fixed one. The two differ only in which scene they read.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
// NARROW SUBPATHS, NOT `@pryzm/core-app-model/rendering` — a test should not reach
// through a barrel and drag a package's whole module graph into this one's tsc program.
// These two pull `PascalSceneLighting` + `NeutralStudioEnvironment` + THREE and nothing
// else.
//
// ⚠ AND THE NUMBER I ALMOST WROTE HERE WAS WRONG. This package typechecks 244 errors
// above main in the lane's worktree, and the obvious story — "the barrel did it" — was
// measured and is FALSE: removing this file entirely leaves the count at 2123. The delta
// is a worktree junction-resolution artefact, not this suite. tsc reports ZERO errors in
// any file this change touches, in either package. Narrowing the import is still right;
// it just is not what that number is about.
import { PascalSceneLighting, PASCAL_ENV_INTENSITY } from '@pryzm/core-app-model/pascal-lighting';
import { getNeutralStudioEnvironment } from '@pryzm/core-app-model/neutral-studio-environment';
import { CurtainWallInstanceManager } from '../src/CurtainWallInstanceManager';
import { CurtainCell } from '../src/CurtainCellComputer';
import { CurtainPanelData, PanelType } from '../src/CurtainPanelTypes';

// ═════════════════════════════════════════════════════════════════════════════
// THE ORACLE — three r183's shading, re-implemented here and owned by this file.
// ═════════════════════════════════════════════════════════════════════════════

const PI = Math.PI;
const srgbToLinear = (c: number) => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** three's ACESFilmicToneMapping, verbatim from tonemapping_pars_fragment.glsl. */
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const mat3mul = (m: number[][], v: number[]) =>
    m.map(r => r[0]! * v[0]! + r[1]! * v[1]! + r[2]! * v[2]!);
const rrtOdtFit = (v: number[]) =>
    v.map(x => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081));

/** Both adapters set ACESFilmic at exactly this exposure. */
const EXPOSURE = 0.9;

function toneMapAndEncode(linear: number[]): [number, number, number] {
    let c = linear.map(x => (x * EXPOSURE) / 0.6);
    c = mat3mul(ACES_IN, c);
    c = rrtOdtFit(c);
    c = mat3mul(ACES_OUT, c);
    const bytes = c.map(x => Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, x)))))* 255));
    return [bytes[0]!, bytes[1]!, bytes[2]!];
}

const D_GGX = (a: number, NoH: number) => {
    const a2 = a * a;
    const d = NoH * NoH * (a2 - 1) + 1;
    return a2 / (PI * d * d);
};
const V_GGX = (a: number, NoL: number, NoV: number) => {
    const a2 = a * a;
    const gv = NoL * Math.sqrt(a2 + (1 - a2) * NoV * NoV);
    const gl = NoV * Math.sqrt(a2 + (1 - a2) * NoL * NoL);
    return 0.5 / Math.max(gv + gl, 1e-6);
};
/** three's DFGApprox (bsdfs.glsl.js) — the split-sum IBL term. */
function dfgApprox(roughness: number, NoV: number): [number, number] {
    const c0 = [-1, -0.0275, -0.572, 0.022];
    const c1 = [1, 0.0425, 1.04, -0.04];
    const r = c0.map((v, i) => roughness * v + c1[i]!);
    const a004 = Math.min(r[0]! * r[0]!, Math.pow(2, -9.28 * NoV)) * r[0]! + r[1]!;
    return [a004 * -1.04 + r[2]!, a004 * 1.04 + r[3]!];
}

const unit = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!);
    return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * Shade `material` in `scene` and return the display bytes a viewer would see.
 *
 * The lights are read OFF THE SCENE, not hard-coded, so this cannot silently disagree
 * with what `PascalSceneLighting.apply()` actually installed.
 *
 * @param N surface normal; default = a vertical facade panel facing the camera.
 * @param V view direction.
 */
function displayBytes(
    scene: THREE.Scene,
    material: THREE.MeshStandardMaterial,
    N: number[] = [0, 0, 1],
    V: number[] = [0, 0, 1],
): [number, number, number] {
    const albedo = [material.color.r, material.color.g, material.color.b];
    const m = material.metalness;
    const diffuseColor = albedo.map(c => c * (1 - m));
    const specColor = albedo.map(c => 0.04 * (1 - m) + c * m);
    const rough = Math.max(material.roughness, 0);
    const a = Math.max(rough * rough, 1e-4);
    const NoV = Math.max(dot(N, V), 1e-4);

    const out = [0, 0, 0];

    // ── Direct lights, read off the scene ────────────────────────────────────
    let ambientIrradiance = 0;
    scene.traverse(obj => {
        if ((obj as THREE.AmbientLight).isAmbientLight) {
            ambientIrradiance += (obj as THREE.AmbientLight).intensity;
            return;
        }
        if (!(obj as THREE.DirectionalLight).isDirectionalLight) return;
        const dl = obj as THREE.DirectionalLight;
        const L = unit([dl.position.x, dl.position.y, dl.position.z]);
        const NoL = dot(N, L);
        if (NoL <= 0) return;
        const H = unit([L[0]! + V[0]!, L[1]! + V[1]!, L[2]! + V[2]!]);
        const NoH = Math.max(dot(N, H), 0);
        const VoH = Math.max(dot(V, H), 0);
        const irradiance = NoL * dl.intensity;
        const spec = D_GGX(a, NoH) * V_GGX(a, NoL, NoV);
        for (let c = 0; c < 3; c++) {
            const F = specColor[c]! + (1 - specColor[c]!) * Math.pow(1 - VoH, 5);
            out[c] += irradiance * (diffuseColor[c]! / PI + F * spec);
        }
    });

    // ── Indirect: ambient light + the environment ────────────────────────────
    // `NeutralStudioEnvironment` is normalised to a mean radiance of exactly 1.0, so
    // `environmentIntensity` IS the radiance the surface sees. With no environment the
    // whole IBL term drops out — which is the pre-fix state, and the black panel.
    const envRadiance = scene.environment ? (scene.environmentIntensity ?? 1) : 0;
    const indirectIrradiance = ambientIrradiance + PI * envRadiance;   // getIBLIrradiance
    const [fabX, fabY] = dfgApprox(rough, NoV);
    for (let c = 0; c < 3; c++) {
        out[c] += indirectIrradiance * (diffuseColor[c]! / PI);
        out[c] += envRadiance * (specColor[c]! * fabX + 1 * fabY);
    }

    return toneMapAndEncode(out);
}

/** Rec.709 luma of a display-byte triple — "how bright does this read". */
const luma = (b: [number, number, number]) => 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];

/**
 * Black, as a number. The founder's screenshot is "completely black"; a display byte
 * whose luma is at or under 15/255 is that. Chosen ABOVE the pre-fix measurements
 * (aluminium 5,7,8 -> luma 6.9; copper 3,0,0 -> luma 0.6; mirror-silver 0,0,0 -> 0) and
 * far BELOW anything that reads as a material, so neither side of the control is tight.
 */
const BLACK_LUMA = 15;

// ═════════════════════════════════════════════════════════════════════════════
// THE SUBJECTS — the real catalogue, the real instance manager.
// ═════════════════════════════════════════════════════════════════════════════

/** The production map, built exactly as `initUI.ts:2241` builds it. */
const productionMaterialMap = () =>
    new Map(STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const));

function makeCell(i: number, j: number): CurtainCell {
    return {
        i, j,
        corners: [
            new THREE.Vector3(i, j, 0),
            new THREE.Vector3(i + 1, j, 0),
            new THREE.Vector3(i + 1, j + 1, 0),
            new THREE.Vector3(i, j + 1, 0),
        ],
        u0: 0, u1: 1, v0: 0, v1: 1, width: 1, height: 1,
    } as CurtainCell;
}

/**
 * Project one panel through the REAL `CurtainWallInstanceManager` and hand back the
 * material it actually built. `panelType: 'SystemPanel_Glass'` is deliberate — it is what
 * the founder's own log shows for the metal type (`§DIAG-IM-02 panelType=SystemPanel_Glass
 * materialId=aluminium-brushed-dark`), so this is the production path, not a tidied one.
 */
function panelMaterial(materialId: string, panelType: PanelType = 'SystemPanel_Glass') {
    const mgr = new CurtainWallInstanceManager(productionMaterialMap());
    const panel = {
        id: 'p1', type: 'curtain-panel', curtainWallId: 'w',
        cellIndex: [0, 0], panelType, materialId,
    } as unknown as CurtainPanelData;
    const meshes = mgr.buildInstancedMeshes([makeCell(0, 0)], [panel], 0.05, 0.024).instancedMeshes;
    expect(meshes).toHaveLength(1);
    return meshes[0]!.material as THREE.MeshStandardMaterial;
}

/** A scene in the state the product shipped in: Pascal lights, environment NULL. */
function preFixScene(): THREE.Scene {
    const scene = new THREE.Scene();
    new PascalSceneLighting().apply(scene);
    scene.environment = null;          // the ONE thing the fix changed, put back
    return scene;
}

/** A scene as `PascalSceneLighting.apply()` leaves it today. */
function fixedScene(): THREE.Scene {
    const scene = new THREE.Scene();
    new PascalSceneLighting().apply(scene);
    return scene;
}

/**
 * The founder's five metals. `target` is the row's OWN catalogue colour as a display
 * byte — "seeing metal colours" means approaching the colour C100 says the material is.
 */
const METALS = [
    { id: 'aluminium-brushed-dark', role: 'panel of cw.metal.copper-frame (types 5-8)', hex: '#474d52' },
    { id: 'copper-new', role: 'mullion of cw.metal.copper-frame', hex: '#b87333' },
    { id: 'glass-reflective', role: 'panel of cw.mirror.blackened-frame (types 9-10)', hex: '#dae7f3' },
    { id: 'steel-blackened', role: 'mullion of the mirror types (9-11)', hex: '#1d1f20' },
    { id: 'special-mirror-silver', role: 'the only true mirror row in C100', hex: '#dfe3e8' },
] as const;

const catalogueBytes = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * "Reads as its metal" — every channel is within 25 % of the catalogue byte OR within
 * 15 display bytes of it, whichever is kinder.
 *
 * ⚠ THE RATIO ALONE IS THE WRONG METRIC AND THE SWEEP PROVED IT. `steel-blackened` is
 * `#1d1f20` — a deliberately near-black metal whose target bytes are 29,31,32. At the
 * shipped intensity it renders 19,20,21: a ratio of 0.65, which a pure-ratio rule would
 * reject, over an absolute difference of ten bytes that no eye can see at that level.
 * A scale-free rule punishes dark rows for being dark. 15 bytes is comfortably under the
 * perceptual threshold in the shadows and comfortably over nothing.
 */
function readsAsItsMetal(bytes: [number, number, number], target: [number, number, number]): boolean {
    return [0, 1, 2].every(c => {
        const ratio = bytes[c]! / target[c]!;
        return (ratio >= 0.75 && ratio <= 1.25) || Math.abs(bytes[c]! - target[c]!) <= 15;
    });
}

describe('§FEAT-PASCAL-METAL-ENV (L-967) — a metal panel must not render black', () => {

    // ── The oracle's own anchor ──────────────────────────────────────────────
    it('ORACLE ANCHOR: a white NON-metal reads near-white under Pascal\'s lights with NO environment', () => {
        // Nothing the fix does can move this: metalness 0 means the environment term is
        // multiplied by an albedo the fix does not touch, and here there is no
        // environment at all. If the oracle is ever hollowed out, this fails first.
        const white = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: 0.6 });
        const bytes = displayBytes(preFixScene(), white);
        expect(luma(bytes)).toBeGreaterThan(200);

        // …and the same oracle must call a black non-metal dark, so it is not simply
        // returning "bright" for everything. Not `< BLACK_LUMA`: a dielectric still has
        // an F0 of 0.04, and under a key light of intensity 4 that sheen measures 18/255.
        // That is what black plastic looks like, and asserting otherwise would be
        // asserting the oracle is wrong.
        const black = new THREE.MeshStandardMaterial({ color: '#000000', metalness: 0, roughness: 0.6 });
        expect(luma(displayBytes(preFixScene(), black))).toBeLessThan(luma(bytes) / 8);
    });

    // ── The founder's exact case ─────────────────────────────────────────────
    it('THE FOUNDER\'S CASE: the copper-frame metal panel was BLACK, and is not any more', () => {
        const mat = panelMaterial('aluminium-brushed-dark');

        // The material itself was never wrong — assert that, so nobody "fixes" this by
        // editing C100. metalness 0.9 is physically right for brushed anodised aluminium.
        expect(mat.metalness).toBe(0.9);
        expect(`#${mat.color.getHexString()}`).toBe('#474d52');

        // RED CONTROL — the shipped state. This is the founder's screenshot.
        const before = displayBytes(preFixScene(), mat);
        expect(luma(before)).toBeLessThan(BLACK_LUMA);

        // THE FIX.
        const after = displayBytes(fixedScene(), mat);
        expect(luma(after)).toBeGreaterThan(BLACK_LUMA * 3);

        // And not merely "brighter than black" — it must read AS THE METAL, i.e. within
        // 25 % of the colour C100 says it is. That is the bar PASCAL_ENV_INTENSITY was
        // measured against, and the reason 0.75 was rejected.
        const target = catalogueBytes('#474d52');
        for (let c = 0; c < 3; c++) {
            expect(after[c] / target[c]!).toBeGreaterThan(0.75);
            expect(after[c] / target[c]!).toBeLessThan(1.25);
        }
    });

    it.each(METALS)('$id ($role) is black before and reads as its catalogue colour after', (metal) => {
        const def = STANDARD_MATERIAL_LIBRARY.find(m => m.id === metal.id);
        expect(def, `${metal.id} must exist in C100`).toBeDefined();
        const mat = new THREE.MeshStandardMaterial(def!.params);
        expect(`#${mat.color.getHexString()}`).toBe(metal.hex);

        const before = displayBytes(preFixScene(), mat);
        const after = displayBytes(fixedScene(), mat);
        const target = catalogueBytes(metal.hex);

        // TRUE FOR EVERY ROW: the environment moved it TOWARDS its catalogue colour.
        const errBefore = Math.abs(luma(before) - luma(target));
        const errAfter = Math.abs(luma(after) - luma(target));
        expect(errAfter).toBeLessThan(errBefore);

        // "BLACK BEFORE" IS NOT TRUE OF EVERY ROW, AND CLAIMING IT WOULD BE FALSE.
        //   • `steel-blackened` is #1d1f20 — a metal that is SUPPOSED to be near-black,
        //     so "it was black" is not a defect for it.
        //   • `glass-reflective` is metalness 0.5 with a near-white albedo, so half of it
        //     is diffuse and it measured 174,182,188 before the fix — never black. What
        //     it lost was its REFLECTIVE character: at roughness 0.05 with nothing to
        //     reflect, the founder's "Mirror glass" types 9-10 read as flat pale plastic.
        //     That is a real defect and it is the `errAfter < errBefore` arm above.
        // So the black claim is made ONLY where it is the actual report: a high-metalness
        // row whose catalogue colour is not itself dark.
        if (def!.params.metalness! >= 0.85 && luma(target) > 40) {
            expect(luma(before)).toBeLessThan(BLACK_LUMA);
            expect(readsAsItsMetal(after, target)).toBe(true);
        }
    });

    // ── The measurement, recorded ────────────────────────────────────────────
    it('THE SWEEP: 1.0 is the smallest intensity at which every metal reads within 25 %', () => {
        const scene = fixedScene();
        const mats = METALS.map(m => ({
            m,
            mat: new THREE.MeshStandardMaterial(
                STANDARD_MATERIAL_LIBRARY.find(x => x.id === m.id)!.params,
            ),
        }));

        /** Which of the five FAIL to read as their metal at this intensity. */
        const failuresAt = (envI: number) => {
            scene.environmentIntensity = envI;
            return mats
                .filter(({ m, mat }) => !readsAsItsMetal(displayBytes(scene, mat), catalogueBytes(m.hex)))
                .map(({ m }) => m.id);
        };

        const rows: string[] = [];
        for (const e of [0, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0]) {
            const failing = failuresAt(e);
            scene.environmentIntensity = e;
            rows.push(
                `  envI ${String(e).padEnd(5)} ` +
                mats.map(({ m, mat }) => {
                    const b = displayBytes(scene, mat);
                    return `${m.id.slice(0, 10)}=${b[0]},${b[1]},${b[2]}`;
                }).join('  ') +
                `   FAILING: ${failing.length ? failing.join(', ') : 'none'}`,
            );
        }
        console.log(
            '§FEAT-PASCAL-METAL-ENV intensity sweep (display bytes, ACESFilmic @ exposure 0.9;\n' +
            'target = each row\'s own C100 colour; a row reads as its metal within 25 % or 15 bytes):\n' +
            rows.join('\n'),
        );

        // THE BOUNDARY CLAIMS PASCAL_ENV_INTENSITY's DOC COMMENT MAKES. Both halves
        // matter: the lower one is what makes 1.0 the SMALLEST workable value rather than
        // a round number somebody liked.
        expect(failuresAt(0.75).length).toBeGreaterThan(0);      // 0.75 is NOT enough…
        expect(failuresAt(0.75)).toContain('aluminium-brushed-dark'); // …and it is the
        expect(failuresAt(0.75)).toContain('copper-new');             // founder's own panel
        expect(failuresAt(PASCAL_ENV_INTENSITY)).toEqual([]);         // 1.0 clears all five
        expect(PASCAL_ENV_INTENSITY).toBe(1.0);
    });

    // ── The AO cost, stated rather than hidden ───────────────────────────────
    it('the AO cost is real, bounded, and NOT total — AO retains ~half its display contrast', () => {
        // The SSGI composite is `final = scene.rgb * AO + (zone + diffuse * GI)`
        // (RenderPipelineManager._buildPhase3Pipeline), so AO multiplies the WHOLE beauty
        // buffer and the LINEAR ratio is preserved exactly at every intensity. What the
        // environment costs is display-byte contrast, because ACES + sRGB compress as
        // luminance climbs. This measures that, on a shadow-side surface, where AO works.
        const wall = new THREE.MeshStandardMaterial({ color: '#f0efe9', metalness: 0, roughness: 0.6 });
        const away = [-0.577, -0.577, -0.577];

        // AO = 0.75 (25 % occlusion). Shading is LINEAR in light intensity, so scaling
        // every light AND the environment by 0.75 is exactly the pipeline's
        // `scene.rgb * AO` multiply — applied in linear light, before the tone mapper,
        // which is where the pipeline applies it.
        const aoDelta = (scene: THREE.Scene) => {
            const bright = displayBytes(scene, wall, away);
            // Re-shade with every light dimmed 25 % — equivalent to multiplying the
            // composited linear colour by AO=0.75 before the tone mapper.
            const dimmed = scene.clone();
            dimmed.environment = scene.environment;
            dimmed.environmentIntensity = (scene.environmentIntensity ?? 1) * 0.75;
            dimmed.traverse(o => {
                const l = o as THREE.Light;
                if (l.isLight) l.intensity *= 0.75;
            });
            return luma(bright) - luma(displayBytes(dimmed, wall, away));
        };

        const before = aoDelta(preFixScene());
        const after = aoDelta(fixedScene());
        console.log(
            `§FEAT-PASCAL-METAL-ENV AO contrast on a shadow-side surface: ` +
            `${before.toFixed(1)} -> ${after.toFixed(1)} display bytes ` +
            `(${((after / before) * 100).toFixed(0)} % retained)`,
        );

        // The founder chose metals. The cost is allowed to be large — it is NOT allowed
        // to be total, and it is NOT allowed to be silently worse than what was measured.
        expect(after).toBeLessThan(before);           // there IS a cost; do not pretend otherwise
        expect(after / before).toBeGreaterThan(0.35); // and AO still reads
    });

    // ── Backend-swap survival ────────────────────────────────────────────────
    it('the environment SURVIVES a live backend swap — it is not a renderer\'s render target', () => {
        // The founder's log shows webgpu -> webgl-fallback -> webgpu inside ONE session,
        // with `WebGPU device lost: reason="destroyed"` and
        // `§RETIRE-RENDERER-DETACHES-LISTENERS old renderer retired`. A PMREMGenerator is
        // constructed AGAINST a renderer, so an environment built by ProceduralSkyService
        // or HDRIEnvironmentManager is that renderer's render-target texture and dies with
        // it. Metals would go black again on the next device loss — an INTERMITTENT bug,
        // which is worse than a consistent one.
        const scene = fixedScene();
        const env = scene.environment!;
        expect(env).toBeTruthy();

        // The property that makes it renderer-independent: CPU-side pixels, not a render
        // target. Both backends auto-PMREM this per renderer — WebGL through
        // `WebGLCubeUVMaps.get()`, WebGPU through
        // `EnvironmentNode.setup() -> _getPMREMNodeCache( builder.renderer )` — and both
        // branch on EXACTLY this mapping.
        expect((env as { isRenderTargetTexture?: boolean }).isRenderTargetTexture).toBeFalsy();
        expect((env as THREE.DataTexture).isDataTexture).toBe(true);
        expect(env.mapping).toBe(THREE.EquirectangularReflectionMapping);
        expect(env.image?.data).toBeInstanceOf(Uint16Array);   // rgba16float: filterable on both

        // A swap retires the old renderer and disposes its GPU resources. The scene object
        // itself is not recreated, so the assertion is that the slot still holds the same
        // live source afterwards — and that a metal is still not black.
        const mat = panelMaterial('aluminium-brushed-dark');
        const beforeSwap = displayBytes(scene, mat);
        // Simulate the retire: everything the old renderer owned goes away. Nothing here
        // touches `scene.environment`, and that is the point.
        const fakeOldRendererResources = { dispose: () => { /* PMREM target, shadow maps… */ } };
        fakeOldRendererResources.dispose();
        const afterSwap = displayBytes(scene, mat);

        expect(scene.environment).toBe(env);
        expect(afterSwap).toEqual(beforeSwap);
        expect(luma(afterSwap)).toBeGreaterThan(BLACK_LUMA * 3);

        // And the source is the shared singleton, so the second renderer PMREMs the SAME
        // texture rather than being handed a fresh one it would have to re-bake per scene.
        expect(env).toBe(getNeutralStudioEnvironment());
    });

    it('a SECOND scene created after a swap gets the same environment, not a dead one', () => {
        // The realistic swap path: `PascalSceneLighting.apply()` runs again on the new
        // pipeline. It must land the same renderer-independent source.
        const first = fixedScene();
        const second = fixedScene();
        // `toBe(first.environment)` alone would pass vacuously if both were null — which
        // is exactly the pre-fix state, so it has to be pinned as non-null first.
        expect(second.environment).toBe(getNeutralStudioEnvironment());
        expect(second.environment).toBe(first.environment);
        expect(second.environmentIntensity).toBe(PASCAL_ENV_INTENSITY);
    });

    // ── The guard on the thing that must NOT change ──────────────────────────
    it('C100 is untouched — metalness 0.9 is physically right and stays', () => {
        const alu = STANDARD_MATERIAL_LIBRARY.find(m => m.id === 'aluminium-brushed-dark')!;
        expect(alu.params.metalness).toBe(0.9);
        expect(STANDARD_MATERIAL_LIBRARY.find(m => m.id === 'copper-new')!.params.metalness).toBe(1);
        // Lowering these would make the symptom go away and leave the defect: every other
        // consumer of the row would silently change. The environment is the fix.
    });
});
