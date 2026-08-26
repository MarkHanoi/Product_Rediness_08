// §WARD118 (founder, 2026-08-26) — "The wardrobes — ALL of them, I / L / U shapes —
// cannot be set lower than 1.6 or 1.8 m height. I want to decide the PRECISE
// height. If it is 1 metre — good — make it happen."
//
// This file pins the fix at four layers:
//   §1  THE ONE AUTHORITY — the physical floor is DERIVED from the carcass
//       constants, and a refusal names BOTH numbers with a stable code (C74 /
//       C16 CA-18). Nothing rounds silently.
//   §2  EVERY CLAMP SITE READS IT — source assertions over the two panels, the
//       engine, the glass builder, the two legacy commands and the two bus
//       handlers. Restore any of the old literals (`min: 1.80`, `height > 1.8`,
//       `const T = 0.018`) and this goes RED — fail-then-pass by construction.
//   §3  THE BUILDERS HONOUR THE HEIGHT — I / L / U at 0.6, 1.0, 2.6 m: bbox height
//       is the value ±1 mm, every mesh sits inside the carcass, arm returns are
//       height-independent; the rail DROPS OUT below its clear-drop threshold;
//       shelf count follows the constant pitch; handles stay reachable; drawers
//       never thin below the minimum front. The 2.40 m default renders
//       BYTE-IDENTICALLY to before (geometry signature + mesh/tri counts pinned
//       from a probe run against the pre-change engine).
//   §4  REACHABILITY — the height reaches the MESH through the production
//       dispatch (`FurnitureFactory.getBuilder` → engine), not just a store.

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WardrobeCabinetEngine } from '../src/engines/WardrobeCabinetEngine';
import { FurnitureFactory } from '../src/builders/FurnitureFactory';
import {
    buildDefaultWardrobeCabinetConfig,
    resolveWardrobeInteriorLayout,
    validateWardrobeCabinetHeight,
    wardrobeDrawerCount,
    wardrobeHandleGeometry,
    wardrobeHeightAdvisory,
    wardrobeShelfCount,
    WARDROBE_CABINET_DEFAULTS,
    WARDROBE_CARCASS_T,
    WARDROBE_DEFAULT_NUM_SHELVES,
    WARDROBE_DRAWER_MIN_H,
    WARDROBE_HANDLE_LEN_MIN,
    WARDROBE_HANDLE_Y_MAX,
    WARDROBE_HEIGHT_FLOOR,
    WARDROBE_HEIGHT_SLIDER,
    WARDROBE_RAIL_MIN_CLEAR,
    WARDROBE_RAIL_MIN_HEIGHT,
    WARDROBE_SHELF_PITCH,
    WARDROBE_SHELF_PITCH_MIN,
    type WardrobeCabinetConfig,
    type WardrobeLayoutType,
} from '../src/WardrobeCabinetTypes';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const MM   = 1e-3;

const SHAPES: readonly WardrobeLayoutType[] = ['wardrobe_straight', 'wardrobe_l_shape', 'wardrobe_u_shape'];

function cfgAt(layout: WardrobeLayoutType, height: number): WardrobeCabinetConfig {
    const cfg = buildDefaultWardrobeCabinetConfig(layout);
    cfg.height = height;
    return cfg;
}

function build(cfg: WardrobeCabinetConfig): THREE.Group {
    const g = new WardrobeCabinetEngine().create(cfg);
    g.updateMatrixWorld(true);
    return g;
}

function meshes(root: THREE.Object3D, pred: (m: THREE.Mesh) => boolean = () => true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    root.traverse(o => { if (o instanceof THREE.Mesh && pred(o)) out.push(o); });
    return out;
}

function bboxHeight(o: THREE.Object3D): number {
    const bb = new THREE.Box3().setFromObject(o);
    return bb.max.y - bb.min.y;
}

/** Mesh + triangle census and a per-mesh geometry signature — EXACTLY the probe
 *  that produced the pinned baseline (geometry type @ world position | height). */
function census(root: THREE.Group): { meshes: number; tris: number; sig: string } {
    let count = 0, tris = 0;
    const sig: string[] = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        count++;
        const g = o.geometry as THREE.BufferGeometry;
        const idx = g.getIndex();
        tris += (idx ? idx.count : g.getAttribute('position').count) / 3;
        const p = new THREE.Vector3(); o.getWorldPosition(p);
        const bb = new THREE.Box3().setFromObject(o);
        sig.push(`${g.type}@${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}|${(bb.max.y - bb.min.y).toFixed(4)}`);
    });
    return { meshes: count, tris, sig: hash(sig.sort().join(';')) };
}
function hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §1 — THE ONE AUTHORITY: a derived physical floor that refuses by name with both numbers', () => {

    it('the floor is DERIVED from the carcass constants — two panels + one minimum shelf bay — not chosen', () => {
        expect(WARDROBE_HEIGHT_FLOOR).toBeCloseTo(2 * WARDROBE_CARCASS_T + WARDROBE_SHELF_PITCH_MIN, 9);
        expect(WARDROBE_HEIGHT_FLOOR).toBeCloseTo(0.236, 9);
        // The founder's number was never physical: the floor is far below 1.8 and 1.6.
        expect(WARDROBE_HEIGHT_FLOOR).toBeLessThan(1.0);
    });

    it('the shelf pitch is derived so the 2.40 m default keeps exactly its 3 shelves', () => {
        expect(WARDROBE_SHELF_PITCH).toBeCloseTo((WARDROBE_CABINET_DEFAULTS.height - 2 * WARDROBE_CARCASS_T) / (WARDROBE_DEFAULT_NUM_SHELVES + 1), 12);
        expect(wardrobeShelfCount(WARDROBE_CABINET_DEFAULTS.height)).toBe(WARDROBE_DEFAULT_NUM_SHELVES);
    });

    it('1.00 m is FINE — accepted exactly, as are 0.6 m, 2.6 m and the floor itself', () => {
        for (const h of [1.0, 0.6, 2.6, WARDROBE_HEIGHT_FLOOR]) {
            const v = validateWardrobeCabinetHeight(h);
            expect(v.ok, `height ${h} must be accepted`).toBe(true);
            if (v.ok) expect(v.height).toBe(h);
        }
    });

    it('below the floor: REFUSED with the value, the floor, a stable code and the route back — never rounded', () => {
        const v = validateWardrobeCabinetHeight(0.20);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.code).toBe('WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR');
        expect(v.reason).toContain('0.200 m');                 // the value the user gave
        expect(v.reason).toContain('0.236 m');                 // the floor
        expect(v.reason).toContain('[WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR]');
        expect(v.reason).toMatch(/Enter 0\.236 m or more/);   // the route back (CA-18)
        // The verdict carries NO substitute value — nothing to round to.
        expect((v as { height?: unknown }).height).toBeUndefined();
    });

    it('NaN / non-numbers are refused with their own code', () => {
        for (const bad of [NaN, Infinity, '1.0', undefined, null]) {
            const v = validateWardrobeCabinetHeight(bad);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.code).toBe('WARDROBE_HEIGHT_NOT_A_NUMBER');
        }
    });

    it('the slider range is a coarse UI range on the authority — min on the 0.10 grid so 1.00 m is reachable, never 1.8', () => {
        expect(WARDROBE_HEIGHT_SLIDER.min).toBeGreaterThanOrEqual(WARDROBE_HEIGHT_FLOOR);
        expect(WARDROBE_HEIGHT_SLIDER.min).toBeLessThan(WARDROBE_HEIGHT_FLOOR + WARDROBE_HEIGHT_SLIDER.step);
        const stepsToOne = (1.0 - WARDROBE_HEIGHT_SLIDER.min) / WARDROBE_HEIGHT_SLIDER.step;
        expect(Math.abs(stepsToOne - Math.round(stepsToOne))).toBeLessThan(1e-9);
        expect(WARDROBE_HEIGHT_SLIDER.min).toBeLessThan(1.6);
    });

    it('the rail threshold is ADVISORY (derived: clear drop + bottom panel over the rail ratio) — a hint, not a refusal', () => {
        expect(WARDROBE_RAIL_MIN_HEIGHT).toBeCloseTo((WARDROBE_RAIL_MIN_CLEAR + WARDROBE_CARCASS_T) / 0.85, 3);
        expect(validateWardrobeCabinetHeight(WARDROBE_RAIL_MIN_HEIGHT - 0.05).ok).toBe(true);
        expect(wardrobeHeightAdvisory(1.0)).toMatch(/no hanging rail fits/);
        expect(wardrobeHeightAdvisory(1.0)).toContain('1.080 m');
        expect(wardrobeHeightAdvisory(2.4)).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §2 — every clamp site reads the authority; the old literals are gone (fail-then-pass by construction)', () => {

    // Comments are stripped before any "the old literal is gone" check: a comment
    // documenting what a line USED TO say ("§WARD118 — was `min: 1.80`") is the
    // fix's own provenance note, not a survival of the defect. Positive
    // `.toContain` checks below all name real code (imports, assignments), so
    // stripping comments cannot make one of those pass falsely.
    const src = (rel: string) =>
        readFileSync(resolve(REPO, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const PANELS = [
        'apps/editor/src/ui/wardrobe/WardrobeConfigPanel.ts',
        'apps/editor/src/ui/wardrobe/WardrobeRunInspector.ts',
    ];

    it.each(PANELS)('%s — the height row reads WARDROBE_HEIGHT_SLIDER and validates via the authority; no `min: 1.80`', (rel) => {
        const s = src(rel);
        expect(s).not.toMatch(/min:\s*1\.80?\b/);
        expect(s).not.toMatch(/min:\s*1\.60?\b/);
        expect(s).toContain('WARDROBE_HEIGHT_SLIDER.min');
        expect(s).toContain('validateWardrobeCabinetHeight(');
        expect(s).toContain('wardrobeHeightAdvisory(');
        // The number field's floor is the authority's, not a literal.
        expect(s).toContain('String(WARDROBE_HEIGHT_FLOOR)');
    });

    it('WardrobeCabinetEngine — carcass constants and the interior / handle decisions come from the authority', () => {
        const s = src('packages/geometry-furniture/src/engines/WardrobeCabinetEngine.ts');
        expect(s).not.toMatch(/const T\s*=\s*0\.018/);
        expect(s).not.toMatch(/height \* 0\.85/);
        expect(s).not.toMatch(/numShelves \?\? 3/);
        expect(s).not.toMatch(/doorH \* 0\.22/);
        expect(s).toContain('const T   = WARDROBE_CARCASS_T');
        expect(s).toContain('resolveWardrobeInteriorLayout(');
        expect(s).toContain('wardrobeHandleGeometry(');
    });

    it('WardrobeGlassBuilder — the `height > 1.8` shelf literal is gone; the shelf rule is the authority\'s', () => {
        const s = src('packages/geometry-furniture/src/builders/WardrobeGlassBuilder.ts');
        expect(s).not.toMatch(/height\s*>\s*1\.8\b/);
        expect(s).toContain('wardrobeShelfCount(height)');
    });

    it('the two legacy commands validate through the authority (the command path is where the verdict binds — P6)', () => {
        for (const rel of [
            'packages/command-registry/src/furniture/UpdateFurnitureParametersCommand.ts',
            'packages/command-registry/src/furniture/CreateFurnitureCommand.ts',
        ]) {
            const s = src(rel);
            expect(s, rel).toContain('validateWardrobeCabinetHeight(');
            expect(s, rel).toContain('blockingIssues: [verdict.reason]');
        }
    });

    it('the two bus handlers refuse at the gate by asking the legacy command — no plugin → geometry-package import', () => {
        const upd = src('plugins/furniture/src/handlers/UpdateFurnitureParameters.ts');
        expect(upd).toContain('legacyCanExecuteRefusal(cmd)');
        expect(upd).not.toMatch(/from '@pryzm\/geometry-furniture'/);
        const cre = src('plugins/furniture/src/handlers/CreateFurniture.ts');
        expect(cre).toContain('new CreateFurnitureCommand(');
        expect(cre).not.toMatch(/from '@pryzm\/geometry-furniture'/);
    });

    it('no wardrobe height literal 1.6 / 1.8 survives anywhere in the wardrobe UI or the wardrobe engine files', () => {
        const files = [
            ...PANELS,
            'apps/editor/src/ui/wardrobe/WardrobeCabinetTool.ts',
            'apps/editor/src/ui/wardrobe/WardrobeSectionInspector.ts',
            'packages/geometry-furniture/src/engines/WardrobeCabinetEngine.ts',
            'packages/geometry-furniture/src/builders/WardrobeGlassBuilder.ts',
            'packages/geometry-furniture/src/WardrobeCabinetTypes.ts',
        ];
        for (const rel of files) {
            // Strip comments first: the corrective comments legitimately quote the old numbers.
            const code = src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            expect(code, rel).not.toMatch(/\b1\.[68]0?\b/);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §3 — I / L / U honour the height and re-proportion sanely', () => {

    describe.each([0.6, 1.0, 2.6])('at %s m', (H) => {
        it.each(SHAPES)('%s — bbox height is the value ±1 mm and every mesh sits inside the carcass', (layout) => {
            const root = build(cfgAt(layout, H));
            expect(Math.abs(bboxHeight(root) - H)).toBeLessThan(MM);
            for (const m of meshes(root)) {
                const bb = new THREE.Box3().setFromObject(m);
                expect(bb.min.y).toBeGreaterThanOrEqual(-MM);
                expect(bb.max.y).toBeLessThanOrEqual(H + MM);
            }
        });

        it.each(['wardrobe_l_shape', 'wardrobe_u_shape'] as const)('%s — each arm reaches the full height and the corner returns are height-independent', (layout) => {
            const root = build(cfgAt(layout, H));
            const ref  = build(cfgAt(layout, WARDROBE_CABINET_DEFAULTS.height));
            // Arms are the direct children (main arm + rotated left/right arms).
            expect(root.children.length).toBe(ref.children.length);
            root.children.forEach((arm, i) => {
                expect(Math.abs(bboxHeight(arm) - H)).toBeLessThan(MM);
                // Arm placement (x, z) and yaw do not depend on height.
                const r = ref.children[i];
                expect(arm.position.x).toBeCloseTo(r.position.x, 9);
                expect(arm.position.z).toBeCloseTo(r.position.z, 9);
                expect(arm.rotation.y).toBeCloseTo(r.rotation.y, 9);
            });
        });
    });

    it('tall layouts stack the top module on the new height — I/L/U at 1.0 m read 1.0 + module', () => {
        for (const layout of ['wardrobe_straight_tall', 'wardrobe_l_shape_tall', 'wardrobe_u_shape_tall'] as const) {
            const cfg = cfgAt(layout, 1.0);
            const root = build(cfg);
            expect(Math.abs(bboxHeight(root) - (1.0 + (cfg.topModuleHeight ?? 0)))).toBeLessThan(MM);
        }
    });

    it('the hanging rail DROPS OUT below its threshold — at 1.0 m no shape mints a rod; at 2.4 m the hanger sections do', () => {
        for (const layout of SHAPES) {
            expect(meshes(build(cfgAt(layout, 1.0)), m => m.userData.wardrobeRod === true).length, `${layout} @ 1.0`).toBe(0);
            expect(meshes(build(cfgAt(layout, 2.4)), m => m.userData.wardrobeRod === true).length, `${layout} @ 2.4`).toBeGreaterThan(0);
        }
        // Exactly at the threshold the rod fits; one centimetre below it does not.
        expect(meshes(build(cfgAt('wardrobe_straight', WARDROBE_RAIL_MIN_HEIGHT)), m => m.userData.wardrobeRod === true).length).toBeGreaterThan(0);
        expect(meshes(build(cfgAt('wardrobe_straight', WARDROBE_RAIL_MIN_HEIGHT - 0.01)), m => m.userData.wardrobeRod === true).length).toBe(0);
        // Pure decision: a hanger section at 1.0 m becomes shelves and says so.
        const at1 = resolveWardrobeInteriorLayout('hanger', 1.0);
        expect(at1.rodY).toBeNull();
        expect(at1.kind).toBe('shelves');
        expect(at1.fellBack).toBe(true);
        // A 0.85 m rail on a 1.0 m unit is exactly the nonsense that can no longer be minted.
        const at24 = resolveWardrobeInteriorLayout('hanger', 2.4);
        expect(at24.rodY).toBeCloseTo(2.4 * 0.85, 9);
        expect(at24.rodY! - WARDROBE_CARCASS_T).toBeGreaterThanOrEqual(WARDROBE_RAIL_MIN_CLEAR);
    });

    it('shelf count derives from height at the constant pitch — a resize adds/removes shelves, never stretches them', () => {
        const table: Array<[number, number]> = [[0.6, 0], [1.0, 1], [1.5, 1], [2.0, 2], [2.4, 3], [2.8, 4]];
        for (const [h, n] of table) expect(wardrobeShelfCount(h), `derived @ ${h}`).toBe(n);
        // In the mesh: a `shelves` section (index 1 of the main arm by default).
        const shelvesIn = (h: number) => {
            const root = build(cfgAt('wardrobe_straight', h));
            let sec: THREE.Object3D | null = null;
            root.traverse(o => { if (o.userData.wardrobeUnitIndex === 1 && o.userData.wardrobeArm === 'main') sec = o; });
            expect(sec).not.toBeNull();
            return meshes(sec!, m => m.userData.wardrobeShelf === true);
        };
        expect(shelvesIn(2.4).length).toBe(3);
        expect(shelvesIn(1.0).length).toBe(1);
        expect(shelvesIn(0.6).length).toBe(0);
        // The pitch is constant: shelf spacing at 2.4 m equals the authority's pitch.
        const ys = shelvesIn(2.4).map(m => m.position.y).sort((a, b) => a - b);
        expect(ys[1] - ys[0]).toBeCloseTo(WARDROBE_SHELF_PITCH, 9);
        // An explicit user count is honoured when it fits, capped at the minimum bay otherwise.
        expect(wardrobeShelfCount(2.4, 4)).toBe(4);
        expect(wardrobeShelfCount(1.0, 4)).toBe(3);   // floor(0.964 / 0.20) − 1
        expect(wardrobeShelfCount(0.4, 4)).toBe(0);
    });

    it('handles stay reachable — never above the reach cap, never shorter than a hand, always inside the door', () => {
        for (const h of [0.4, 0.6, 1.0, 2.4, 2.8, 3.2]) {
            const { length, centreY } = wardrobeHandleGeometry(h);
            expect(length, `len @ ${h}`).toBeGreaterThanOrEqual(WARDROBE_HANDLE_LEN_MIN - 1e-9);
            expect(centreY, `y @ ${h}`).toBeLessThanOrEqual(WARDROBE_HANDLE_Y_MAX + 1e-9);
            expect(centreY - length / 2).toBeGreaterThanOrEqual(WARDROBE_CARCASS_T);
            expect(centreY + length / 2).toBeLessThanOrEqual(h - WARDROBE_CARCASS_T);
        }
        expect(wardrobeHandleGeometry(1.0).centreY).toBeCloseTo(0.5, 9);
        expect(wardrobeHandleGeometry(2.8).centreY).toBeCloseTo(WARDROBE_HANDLE_Y_MAX, 9);
        // In the mesh at 2.8 m: no handle centre above the cap.
        for (const m of meshes(build(cfgAt('wardrobe_straight', 2.8)), m => m.userData.wardrobeHandle === true)) {
            expect(m.position.y).toBeLessThanOrEqual(WARDROBE_HANDLE_Y_MAX + 1e-9);
        }
    });

    it('drawers never thin below the minimum front — an explicit count is capped on a short carcass', () => {
        expect(wardrobeDrawerCount(2.4, 4)).toBe(4);
        expect(wardrobeDrawerCount(WARDROBE_HEIGHT_FLOOR, 4)).toBe(Math.floor((WARDROBE_HEIGHT_FLOOR - 2 * WARDROBE_CARCASS_T) / WARDROBE_DRAWER_MIN_H + 1e-9));
        const lay = resolveWardrobeInteriorLayout('drawers', WARDROBE_HEIGHT_FLOOR, { numDrawers: 4 });
        expect(lay.drawers!.height).toBeGreaterThanOrEqual(WARDROBE_DRAWER_MIN_H - 1e-9);
    });

    it('the carcass builds at the physical floor itself — one open bay, doors, nothing inside', () => {
        const root = build(cfgAt('wardrobe_straight', WARDROBE_HEIGHT_FLOOR));
        expect(Math.abs(bboxHeight(root) - WARDROBE_HEIGHT_FLOOR)).toBeLessThan(MM);
        expect(meshes(root, m => m.userData.wardrobeRod === true).length).toBe(0);
        expect(meshes(root, m => m.userData.wardrobeShelf === true).length).toBe(0);
    });

    it('the 2.40 m DEFAULT renders BYTE-IDENTICALLY to the pre-change engine (probe-pinned signature + counts)', () => {
        // Measured 2026-08-26 against the engine BEFORE §WARD118 touched it.
        const PINNED: Record<string, { meshes: number; tris: number; sig: string }> = {
            wardrobe_straight:      { meshes: 32, tris: 584,  sig: '6d579e2b' },
            wardrobe_l_shape:       { meshes: 49, tris: 888,  sig: '1c7577f8' },
            wardrobe_u_shape:       { meshes: 66, tris: 1192, sig: 'abba6668' },
            wardrobe_straight_tall: { meshes: 38, tris: 656,  sig: 'b78398b2' },
        };
        for (const [layout, pin] of Object.entries(PINNED)) {
            const c = census(build(cfgAt(layout as WardrobeLayoutType, WARDROBE_CABINET_DEFAULTS.height)));
            expect(c, layout).toEqual(pin);
        }
    });

    it('mesh + triangle budget at 1.0 m never exceeds 2.4 m (report)', () => {
        for (const layout of SHAPES) {
            const lo = census(build(cfgAt(layout, 1.0)));
            const hi = census(build(cfgAt(layout, 2.4)));
            console.log(`§WARD118 BUDGET ${layout}: 1.0 m → ${lo.meshes} meshes / ${lo.tris} tris · 2.4 m → ${hi.meshes} meshes / ${hi.tris} tris`);
            expect(lo.meshes).toBeLessThanOrEqual(hi.meshes);
            expect(lo.tris).toBeLessThanOrEqual(hi.tris);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §4 — reachability: the height reaches the MESH through the production dispatch', () => {

    it.each(SHAPES)('%s via FurnitureFactory.getBuilder → built group bbox height == 1.000 ± 1 mm', (layout) => {
        const cfg = cfgAt(layout, 1.0);
        const fragmentBuilderStub = {
            getMaterialService: () => ({ getMaterial: () => new THREE.MeshStandardMaterial() }),
        } as unknown as Parameters<typeof FurnitureFactory.getBuilder>[1];
        const builder = FurnitureFactory.getBuilder(layout, fragmentBuilderStub);
        const group = builder.build({
            id: `ward118-${layout}`, furnitureType: layout,
            width: cfg.length, length: cfg.depth, height: cfg.height,
            wardrobeCabinetConfig: cfg,
        } as never);
        group.updateMatrixWorld(true);
        expect(Math.abs(bboxHeight(group) - 1.0)).toBeLessThan(MM);
    });
});
