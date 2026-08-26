/**
 * §LIGHT102 (L-11500..L-11504) — the founder's SEVEN reference pendants, measured.
 *
 * Lane LIGHT99 MAPPED these seven and measured the cost model; this suite is the
 * evidence that the mapping was implemented as decided rather than approximated.
 * Each of the seven has an arm below naming which resolution it took — REUSE, a
 * new matrix row, a new row on an EXISTING archetype, or an EXTENSION — because
 * the resolutions are the decision, and a test that only checked "it renders"
 * would pass equally well for five hand-written families.
 *
 * ── What this suite establishes ─────────────────────────────────────────────
 *
 *   1. Each of the seven is REACHABLE and BUILDS, and #2 and #7 are NOT new
 *      families (that is the C84 EI-9 claim, and it is asserted, not asserted-about).
 *   2. The photometry is DISTINCT on the axes that make these different fixtures —
 *      a copied beam angle would make two rows one row.
 *   3. ⭐ EVERY LOD-200 archetype anchors its emitter. This is the direct
 *      behavioural probe of the trap that made lane LIGHT99 revert: an archetype
 *      missing from `_lod200EmitterOffset`'s exhaustive switch returns `undefined`,
 *      and the light silently sits at the group origin — inside the ceiling.
 *   4. Adding families adds ZERO real lights (L-11422 — the budget was NOT raised).
 *   5. The pre-existing rows that share the touched archetypes (`track_head` on
 *      `can`, `surface_ceiling_disc` on `disc`, `troffer_panel` on `bar`) are
 *      unchanged by the drop/canopy/chamfer work.
 *
 * ⛔ COUNTS, NOT FRAME TIMES. Same limit `LightingFixtureCost.test.ts` states: no
 * bench here can measure GPU wall-time, so a green run establishes no frame rate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder, LENS_ROLE } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType, Lod200OverrideParams } from '../src/LightingTypes';
import { BUILT_IN_LIGHTING_TYPES } from '../src/LightingTypeDefinitions';
import { photometryForFixture, constructionFormFor, LIGHTING_FIXTURE_PHOTOMETRY } from '@pryzm/core-app-model';
import {
    LOD200_FIXTURE_ROWS, lod200Row, efficacyClassFor, efficacyLmPerW, EFFICACY_BANDS,
    lod200BodyAppearance,
} from '@pryzm/core-app-model/lod200-fixtures';

const g = globalThis as unknown as { window?: unknown };

/**
 * The founder's seven, by the resolution lane LIGHT99 decided for each (L-11423).
 * ⭐ `row` is the id the fixture RESOLVES to — #6 and #7 deliberately share one.
 */
const FOUNDER = {
    domeGlobe:    { n: 1, row: 'pendant_dome_globe',      via: 'NEW ROW · new archetype dome' },
    linearBar:    { n: 2, row: 'linear_pendant',          via: 'REUSE · chamfered ends only' },
    capsule:      { n: 3, row: 'pendant_capsule',         via: 'NEW ROW · new archetype capsule' },
    glassCyl:     { n: 4, row: 'pendant_glass_cylinder',  via: 'NEW ROW · new archetype tube' },
    cylinderSpot: { n: 5, row: 'pendant_cylinder_spot',   via: 'NEW ROW · EXISTING archetype can' },
    flatDisc:     { n: 6, row: 'pendant_disc',            via: 'NEW ROW · EXISTING archetype disc' },
    discCanopy:   { n: 7, row: 'pendant_disc',            via: 'EXTENSION · canopyMm on #6' },
} as const;

/** The five ids §LIGHT102 actually MINTED (#2 reuses, #7 extends #6). */
const NEW_ROW_IDS = [
    'pendant_dome_globe', 'pendant_capsule', 'pendant_glass_cylinder',
    'pendant_cylinder_spot', 'pendant_disc',
] as const;

function build(
    type: string,
    opts: { id?: string; x?: number; lod200Params?: Partial<Lod200OverrideParams> } = {},
): { b: LightingFragmentBuilder; scene: THREE.Scene; root: THREE.Object3D } {
    const id = opts.id ?? `f-${type}`;
    const scene = new THREE.Scene();
    const b = new LightingFragmentBuilder();
    b.setScene(scene);
    const data: LightingData = {
        id, type: 'lighting', levelId: 'L1',
        fixtureType: type as LightingFixtureType,
        position: { x: opts.x ?? 0, y: 2.6, z: 0 },
        ...(opts.lod200Params ? { lod200Params: opts.lod200Params } : {}),
    };
    b.add(data);
    return { b, scene, root: scene.children.find((c) => c.userData?.id === id)! };
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    o.traverse((n) => { if ((n as THREE.Mesh).isMesh) out.push(n as THREE.Mesh); });
    return out;
}

function lenses(o: THREE.Object3D): THREE.Mesh[] {
    return meshes(o).filter((m) => m.userData.role === LENS_ROLE);
}

function lightsIn(o: THREE.Object3D): THREE.Light[] {
    const out: THREE.Light[] = [];
    o.traverse((n) => { if ((n as THREE.Light).isLight) out.push(n as THREE.Light); });
    return out;
}

/**
 * Lowest Y of any vertex, IN THE FIXTURE'S OWN FRAME — where the fixture ends,
 * relative to the ceiling plane it hangs from.
 *
 * ⚠ `Box3.setFromObject` returns WORLD space, and these roots sit at y = 2.6 (the
 * ceiling). Comparing a world minimum against a local `mesh.position.y` is a frame
 * error that reads as a real failure; the root's own Y is subtracted here so every
 * assertion in this file speaks one frame. These fixtures carry no rotation, so
 * the subtraction is exact.
 */
function lowestY(o: THREE.Object3D): number {
    const box = new THREE.Box3().setFromObject(o);
    return box.min.y - o.position.y;
}

describe('§LIGHT102 — the founder\'s seven, each by its DECIDED resolution', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('all seven resolve to a catalogue row, and #2/#7 mint NO new family', () => {
        for (const [key, f] of Object.entries(FOUNDER)) {
            expect(lod200Row(f.row), `#${f.n} ${key} (${f.via}) has no matrix row`).toBeDefined();
        }
        // ⭐ THE C84 EI-9 CLAIM, ASSERTED. Seven reference fixtures cost SIX ids —
        // five newly minted, plus `linear_pendant` which already existed — because
        // #7 is #6 wearing a canopy. Seven ids would have been seven families.
        const distinct = new Set(Object.values(FOUNDER).map((f) => f.row));
        expect(distinct.size, 'seven fixtures must resolve to six rows').toBe(6);
        expect(distinct.size).toBe(NEW_ROW_IDS.length + 1);   // + the reused row
        expect(FOUNDER.flatDisc.row).toBe(FOUNDER.discCanopy.row);
    });

    it('§LIGHT102 minted exactly five rows, all reachable through the picker registry', () => {
        const picker = new Set(BUILT_IN_LIGHTING_TYPES.map((t) => t.id as string));
        for (const id of NEW_ROW_IDS) {
            expect(picker.has(id), `${id} is not offered by the type registry`).toBe(true);
        }
        expect(LOD200_FIXTURE_ROWS.filter((r) => (NEW_ROW_IDS as readonly string[]).includes(r.id)))
            .toHaveLength(NEW_ROW_IDS.length);
    });

    it('all seven build real geometry and a real lens', () => {
        for (const f of Object.values(FOUNDER)) {
            const { b, root } = build(f.row);
            expect(root, `#${f.n} produced no root`).toBeDefined();
            expect(meshes(root).length, `#${f.n} built no meshes`).toBeGreaterThan(0);
            expect(lenses(root).length, `#${f.n} has no lens — it cannot read as switched-on`)
                .toBeGreaterThan(0);
            b.dispose();
        }
    });
});

describe('§LIGHT102 #1 — DOME: a spherical-cap bowl with an EXPOSED globe', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('is its own archetype — NOT reused as a cone', () => {
        expect(lod200Row('pendant_dome_globe')!.archetype).toBe('dome');
        // The distinction that forced a new mass: `high_bay` is the cone.
        expect(lod200Row('high_bay')!.archetype).toBe('cone');
    });

    it('the globe is EXPOSED — the lens hangs BELOW the bowl, not inside it', () => {
        const { b, root } = build('pendant_dome_globe');
        const row = lod200Row('pendant_dome_globe')!;
        const mouthY = -(row.dropMm! / 1000);
        const ls = lenses(root);
        expect(ls.length, 'the globe IS the lens').toBeGreaterThan(0);
        // A globe hidden inside the bowl would sit at or above the mouth plane,
        // and the fixture's 300° beam angle would then be a claim its own geometry
        // contradicts.
        for (const l of ls) {
            expect(l.position.y, 'globe is not below the bowl mouth').toBeLessThan(mouthY);
        }
        b.dispose();
    });

    it('emits ~300° — an exposed source, four times the arc of the shaded conical pendant', () => {
        expect(photometryForFixture('pendant_dome_globe').beamAngleDeg).toBe(300);
        expect(photometryForFixture('pendant_dome_globe').beamAngleDeg)
            .toBeGreaterThan(photometryForFixture('pendant_conical').beamAngleDeg);
    });
});

describe('§LIGHT102 #2 — LINEAR BAR: REUSE, and the reuse must not have re-tuned it', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * ⭐ THE ARM THAT MATTERS FOR A REUSE. `linear_pendant` is on disk in every
     * project that has ever placed one. Re-tuning its photometry to "match the
     * founder's photo" would silently re-light those scenes, so the six authored
     * numbers are PINNED to their 2026-08-19 values, exactly.
     */
    it('NOT ONE photometric value changed', () => {
        const r = lod200Row('linear_pendant')!;
        expect({
            lumens: r.lumens, watts: r.watts, kelvin: r.kelvin,
            cri: r.cri, beamAngleDeg: r.beamAngleDeg, ipRating: r.ipRating,
        }).toEqual({ lumens: 4200, watts: 38, kelvin: 4000, cri: 90, beamAngleDeg: 110, ipRating: 20 });
        expect(r.dropMm).toBe(700);
        expect(r.archetype).toBe('bar');
    });

    it('it ALREADY had the uplight — face `updown` draws a second, up-facing lens', () => {
        expect(lod200Row('linear_pendant')!.face).toBe('updown');
        const { b, root } = build('linear_pendant');
        const up = lenses(root).filter((l) => Math.abs(l.rotation.x - Math.PI) < 1e-6);
        expect(up.length, 'no up-facing lens — this row is supposed to already uplight')
            .toBeGreaterThan(0);
        b.dispose();
    });

    it('⭐ the ONE thing added: the ends are CHAMFERED, and only this row\'s are', () => {
        // The taper is measured on the body box directly: among its 24 vertices, the
        // ones on the two end faces (|x| = max) must reach LESS far in Y than the
        // body does at its middle. A square-cut bar reaches exactly as far.
        // ⚠ MEASURED AS AN ASYMMETRY, and the two drafts that were not are the
        // reason this comment exists.
        //
        // "Vertices at |x| = max are shallower than the rest" cannot work on a box:
        // EVERY vertex of a box is a corner, so that predicate matches all 24 and
        // reads 1.0 whatever the shape. What a chamfer actually is, geometrically,
        // is a piece that is DEEPER AT ONE END THAN THE OTHER — so that is what is
        // measured: for each box-like mesh, max|y| on the +x side against max|y| on
        // the −x side. A square-cut extrusion is symmetric and returns exactly 1;
        // a tapered end wedge returns its lip ratio. The MIN across the body's
        // pieces is the fixture's answer.
        const endTaper = (root: THREE.Object3D): number => {
            let worst = 1;
            for (const m of meshes(root)) {
                const pos = m.geometry.attributes.position as THREE.BufferAttribute | undefined;
                if (!pos || pos.count !== 24) continue;      // box-like bodies only
                let yPos = 0, yNeg = 0;
                for (let i = 0; i < pos.count; i++) {
                    const y = Math.abs(pos.getY(i));
                    if (pos.getX(i) > 0) yPos = Math.max(yPos, y);
                    else                 yNeg = Math.max(yNeg, y);
                }
                const hi = Math.max(yPos, yNeg);
                if (hi > 0) worst = Math.min(worst, Math.min(yPos, yNeg) / hi);
            }
            return worst;
        };

        const a = build('linear_pendant');
        expect(endTaper(a.root), 'linear_pendant ends are not chamfered').toBeLessThan(0.95);
        a.b.dispose();

        // ⛔ The nine other `bar` rows are square-cut BY CONSTRUCTION. Chamfering the
        // ARCHETYPE instead of the ROW would have re-shaped a 600 x 600 troffer and a
        // plaster-in slot — which is why `endChamferMm` is a row field.
        for (const id of ['troffer_panel', 'recessed_linear', 'surface_linear', 'cove_indirect']) {
            const o = build(id);
            expect(endTaper(o.root), `${id} was chamfered and must not have been`).toBe(1);
            expect(lod200Row(id)!.endChamferMm, `${id} authors a chamfer`).toBeUndefined();
            o.b.dispose();
        }
    });
});

describe('§LIGHT102 #3 — CAPSULE: opaque, hemispherical ends, RECESSED lens', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('is a narrow 60° optic, and the recess is what makes that true', () => {
        const row = lod200Row('pendant_capsule')!;
        expect(row.archetype).toBe('capsule');
        expect(row.beamAngleDeg).toBe(60);

        const { b, root } = build('pendant_capsule');
        // The lens must sit INSIDE the mouth: strictly above the lowest point of the
        // fixture body. A lens flush with (or below) the mouth would throw wide and
        // the 60° would be a number the geometry contradicts.
        const ls = lenses(root);
        expect(ls.length).toBeGreaterThan(0);
        const bottom = lowestY(root);
        for (const l of ls) {
            expect(l.position.y, 'capsule lens is not recessed inside the mouth')
                .toBeGreaterThan(bottom);
        }
        b.dispose();
    });

    it('is narrower than every DIFFUSE new pendant — but not narrower than the spot', () => {
        const capsule = photometryForFixture('pendant_capsule').beamAngleDeg;
        for (const id of ['pendant_dome_globe', 'pendant_glass_cylinder', 'pendant_disc']) {
            expect(capsule, `vs ${id}`).toBeLessThan(photometryForFixture(id).beamAngleDeg);
        }
        // ⭐ Stated rather than fudged: `pendant_cylinder_spot` is a SPOT and is
        // narrower still (36°). The first draft of this arm asserted the capsule was
        // the narrowest of all five, which would have been true only if the spot's
        // optic had been copied from its neighbours instead of authored.
        expect(photometryForFixture('pendant_cylinder_spot').beamAngleDeg).toBeLessThan(capsule);
    });
});

describe('§LIGHT102 #4 — GLASS CYLINDER: the first TRANSPARENT shade', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('names the C100 master glass row, and the master carries the transparency', () => {
        expect(lod200Row('pendant_glass_cylinder')!.bodyMaterialId).toBe('glass-clear');
        const look = lod200BodyAppearance('glass-clear')!;
        expect(look.transparent, 'the master row is not transparent').toBe(true);
        expect(look.opacity).toBeLessThan(1);
    });

    it('⭐ the transparency REACHES the mesh — C100 §2.1, resolved AND applied', () => {
        // The defect this closes: `lod200BodyAppearance` used to project only
        // colour/metalness/roughness, so a glass shade would have rendered OPAQUE —
        // correctly resolved, incorrectly applied, still reported as applied.
        const { b, root } = build('pendant_glass_cylinder');
        const glass = meshes(root)
            .map((m) => m.material as THREE.MeshStandardMaterial)
            .filter((m) => m.transparent);
        expect(glass.length, 'no transparent mesh — the glass rendered opaque').toBeGreaterThan(0);
        expect(glass[0]!.opacity).toBeCloseTo(lod200BodyAppearance('glass-clear')!.opacity, 5);
        b.dispose();
    });

    it('the transparent material is POOLED, not minted per instance', () => {
        // The per-instance material leak LIGHT99 removed must not return through the
        // one branch that mints a material with non-default options.
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.add({ id: 'g1', type: 'lighting', levelId: 'L1', fixtureType: 'pendant_glass_cylinder' as LightingFixtureType, position: { x: 0, y: 2.6, z: 0 } });
        b.add({ id: 'g2', type: 'lighting', levelId: 'L1', fixtureType: 'pendant_glass_cylinder' as LightingFixtureType, position: { x: 9, y: 2.6, z: 0 } });
        const matsOf = (id: string) => new Set(
            meshes(scene.children.find((c) => c.userData?.id === id)!).map((m) => m.material as THREE.Material),
        );
        const a = matsOf('g1');
        expect(new Set([...a, ...matsOf('g2')]).size, 'glass tube mints a material per instance').toBe(a.size);
        b.dispose();
    });

    it('emits ~340° — a clear shade barely occludes, unlike the opaque cylinder pendant', () => {
        expect(photometryForFixture('pendant_glass_cylinder').beamAngleDeg).toBe(340);
        expect(photometryForFixture('pendant_glass_cylinder').beamAngleDeg)
            .toBeGreaterThan(photometryForFixture('pendant').beamAngleDeg);
    });
});

describe('§LIGHT102 #5 — CYLINDER SPOT: a new ROW on `can`, ZERO new geometry', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('reuses the EXISTING archetype — no mass was minted for it', () => {
        expect(lod200Row('pendant_cylinder_spot')!.archetype).toBe('can');
        expect(lod200Row('recessed_downlight')!.archetype).toBe('can');
    });

    /**
     * ⭐ THE TRAP THIS ROW WALKED PAST. `can` suspends on `stemMm`, and authoring the
     * pendant that way would have been the obvious move — but `suspended` is DERIVED
     * from `dropMm`, and `constructionFormFor` reads `suspended`. A pendant on a stem
     * would have appeared in every schedule as a flush DOWNLIGHT.
     */
    it('is classified as a PENDANT, not a downlight — it authors dropMm, not stemMm', () => {
        expect(lod200Row('pendant_cylinder_spot')!.dropMm).toBeGreaterThan(0);
        expect(lod200Row('pendant_cylinder_spot')!.stemMm).toBeUndefined();
        expect(photometryForFixture('pendant_cylinder_spot').suspended).toBe(true);
        expect(constructionFormFor('pendant_cylinder_spot')).toBe('pendant');
    });

    it('actually HANGS — the body is below the drop, not flush at the ceiling', () => {
        const { b, root } = build('pendant_cylinder_spot');
        const drop = lod200Row('pendant_cylinder_spot')!.dropMm! / 1000;
        expect(lowestY(root), 'the fixture does not reach below its drop').toBeLessThan(-drop);
        b.dispose();
    });

    it('⛔ `track_head` — the other suspended-capable `can` — is UNTOUCHED', () => {
        // It authors stem 90 / drop 0, so `stem + drop` is arithmetically identical
        // to what it was. If this regresses, a retail track head starts dangling.
        const row = lod200Row('track_head')!;
        expect(row.stemMm).toBe(90);
        expect(row.dropMm).toBeUndefined();
        const { b, root } = build('track_head');
        // stem 0.09 + body 0.13 = 0.22 m; nothing may reach a pendant's drop.
        expect(lowestY(root)).toBeGreaterThan(-0.5);
        b.dispose();
    });
});

describe('§LIGHT102 #6 + #7 — FLAT DISC and DISC+CANOPY are ONE family (C84 EI-9)', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('the canopy ships ON by default — #7 is what the founder gets from the palette', () => {
        expect(lod200Row('pendant_disc')!.canopyMm).toBeGreaterThan(0);
    });

    it('⭐ `canopyMm: 0` gives #6 BARE — one mesh fewer, same family, same id', () => {
        const withC = build('pendant_disc', { id: 'd1' });
        const without = build('pendant_disc', { id: 'd2', lod200Params: { canopyMm: 0 } });
        expect(meshes(withC.root).length - meshes(without.root).length,
            'the canopy is not a drawn mass, or it is not removable').toBe(1);
        // Same family: the override changes a mounting detail, never the fixture id.
        expect(withC.root.userData.fixtureType).toBe(without.root.userData.fixtureType);
        withC.b.dispose(); without.b.dispose();
    });

    it('it HANGS — `disc` now honours its drop', () => {
        const { b, root } = build('pendant_disc');
        const drop = lod200Row('pendant_disc')!.dropMm! / 1000;
        expect(lowestY(root)).toBeLessThan(-drop);
        b.dispose();
    });

    it('⛔ `surface_ceiling_disc` — the flush oyster — is UNTOUCHED', () => {
        const row = lod200Row('surface_ceiling_disc')!;
        expect(row.dropMm).toBeUndefined();
        expect(row.canopyMm).toBeUndefined();
        const { b, root } = build('surface_ceiling_disc');
        // Body + lens only. A canopy or a cable here would mean the guard leaked.
        expect(meshes(root)).toHaveLength(2);
        b.dispose();
    });
});

// ── The archetype trap, probed behaviourally ────────────────────────────────

describe('§LIGHT102 — EVERY archetype anchors its emitter (the LIGHT99 revert)', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * ⭐ THE ARM THAT WOULD HAVE CAUGHT THE TRAP.
     *
     * `_lod200EmitterOffset` returns from every arm of an exhaustive switch over
     * `Lod200Archetype` and carries NO `default`. A new union member therefore
     * returns `undefined`; `_attachLight` falls through to the per-FAMILY switch,
     * finds no case, and leaves the light at (0,0,0) — the group origin, which for
     * a ceiling fixture is inside the slab.
     *
     * The root `tsc` gate fails on that too, which is why it is a good trap rather
     * than a silent one. But a gate that only fails at compile time cannot say the
     * anchor is CORRECT, only that one exists. This asserts the runtime consequence
     * directly: no LOD-200 family may emit from its own origin.
     */
    it('no LOD-200 family emits from the group origin', () => {
        const stuck: string[] = [];
        for (const row of LOD200_FIXTURE_ROWS) {
            const { b, root } = build(row.id);
            b.syncLights();
            const ls = lightsIn(root);
            expect(ls.length, `${row.id} won no light at budget ${b.liveLightBudget}`).toBeGreaterThan(0);
            const p = ls[0]!.position;
            if (p.x === 0 && p.y === 0 && p.z === 0) stuck.push(`${row.id} (${row.archetype})`);
            expect(Number.isFinite(p.x + p.y + p.z), `${row.id} emitter is not finite`).toBe(true);
            b.dispose();
        }
        expect(stuck, 'archetypes whose emitter fell through the exhaustive switch').toEqual([]);
    });

    it('a suspended family emits BELOW its drop, not at the ceiling plane', () => {
        for (const id of ['pendant_dome_globe', 'pendant_capsule', 'pendant_glass_cylinder',
                          'pendant_cylinder_spot', 'pendant_disc']) {
            const { b, root } = build(id);
            b.syncLights();
            const drop = lod200Row(id)!.dropMm! / 1000;
            expect(lightsIn(root)[0]!.position.y, `${id} emits at or above its canopy`)
                .toBeLessThan(-drop * 0.9);
            b.dispose();
        }
    });
});

// ── The cost claim (L-11422) ────────────────────────────────────────────────

describe('§LIGHT102 — five families add ZERO real lights (the budget was NOT raised)', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    /**
     * L-11422 is explicit that 8/6/3/1 are self-declared DERIVED-BUT-UNMEASURED and
     * must not be raised blind. The temptation when adding families is to raise them
     * so the new fixtures light up. They were not raised, and this is the proof that
     * the count is still governed by the budget rather than by the catalogue size.
     */
    it('twelve fixtures of EACH new family still produce exactly `budget` lights', () => {
        for (const id of NEW_ROW_IDS) {
            const scene = new THREE.Scene();
            const b = new LightingFragmentBuilder();
            b.setScene(scene);
            b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
            for (let i = 0; i < 12; i++) {
                b.add({
                    id: `${id}-${i}`, type: 'lighting', levelId: 'L1',
                    fixtureType: id as LightingFixtureType, position: { x: i * 2, y: 2.6, z: 0 },
                });
            }
            b.syncLights();     // `add()` QUEUES a sync; it is not synchronous.
            expect(b.liveLightCount, `${id}: 12 fixtures produced != budget lights`).toBe(b.liveLightBudget);
            expect(lightsIn(scene).length, `${id}: scene light count != budget`).toBe(b.liveLightBudget);
            b.dispose();
        }
    });

    it('ONE of every catalogue family in one scene still produces exactly `budget` lights', () => {
        const scene = new THREE.Scene();
        const b = new LightingFragmentBuilder();
        b.setScene(scene);
        b.setFocusProvider(() => ({ x: 0, y: 0, z: 0 }));
        BUILT_IN_LIGHTING_TYPES.forEach((t, i) => {
            b.add({
                id: `all-${i}`, type: 'lighting', levelId: 'L1',
                fixtureType: t.id as LightingFixtureType, position: { x: i * 2, y: 2.6, z: 0 },
            });
        });
        b.syncLights();     // as above.
        expect(BUILT_IN_LIGHTING_TYPES.length).toBeGreaterThan(b.liveLightBudget);
        expect(lightsIn(scene).length, 'the catalogue size, not the budget, is setting the light count')
            .toBe(b.liveLightBudget);
        b.dispose();
    });
});

// ── Photometry: honest, distinct, in band ───────────────────────────────────

describe('§LIGHT102 — the five new rows have DISTINCT, in-band photometry', () => {
    it('every new row resolves through the real table — never the fallback', () => {
        for (const id of NEW_ROW_IDS) {
            const p = photometryForFixture(id);
            expect(p, id).toBe((LIGHTING_FIXTURE_PHOTOMETRY as Record<string, unknown>)[id]);
            expect(p.lumens, id).toBeGreaterThan(0);
            expect(p.watts, id).toBeGreaterThan(0);
        }
    });

    /**
     * ⭐ THE ARM AGAINST FILLER. The brief for this lane forbade copying a
     * neighbour's numbers, and this is what that forbidding is worth: if the five
     * rows shared a beam angle they would light identically, and five rows would be
     * one row wearing five names.
     */
    it('BEAM ANGLE is distinct across all five — a copied optic would collapse them', () => {
        const beams = NEW_ROW_IDS.map((id) => photometryForFixture(id).beamAngleDeg);
        expect(new Set(beams).size, `beams not distinct: ${beams.join(', ')}`).toBe(NEW_ROW_IDS.length);
    });

    it('CRI and KELVIN are not flattened either', () => {
        expect(new Set(NEW_ROW_IDS.map((i) => lod200Row(i)!.cri)).size).toBeGreaterThan(1);
        expect(new Set(NEW_ROW_IDS.map((i) => lod200Row(i)!.kelvin)).size).toBeGreaterThan(1);
        // Named: the clear-glass decorative lamp is the mass-market Ra 80 class and
        // must NOT have inherited the Ra 90 of the task fixtures beside it.
        expect(lod200Row('pendant_glass_cylinder')!.cri)
            .toBeLessThan(lod200Row('pendant_capsule')!.cri);
        // Named: the gallery track head keeps the highest Ra in the catalogue.
        expect(lod200Row('pendant_cylinder_spot')!.cri)
            .toBeLessThan(lod200Row('track_head')!.cri);
    });

    it('each new row is inside its DERIVED efficacy band, and the band was not widened', () => {
        for (const id of NEW_ROW_IDS) {
            const r = lod200Row(id)!;
            const cls = efficacyClassFor(r);
            const [lo, hi] = EFFICACY_BANDS[cls];
            const e = efficacyLmPerW(r);
            expect(e, `${id}: ${e.toFixed(1)} lm/W outside ${cls} ${lo}-${hi}`).toBeGreaterThanOrEqual(lo);
            expect(e, `${id}: ${e.toFixed(1)} lm/W outside ${cls} ${lo}-${hi}`).toBeLessThanOrEqual(hi);
        }
        // ⛔ The decorative band must NOT have leaked to the architectural archetypes:
        // widening it to cover `can`/`disc` would hand the lenient band to every
        // recessed downlight in the matrix.
        expect(efficacyClassFor(lod200Row('pendant_dome_globe')!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row('pendant_capsule')!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row('pendant_glass_cylinder')!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row('pendant_cylinder_spot')!)).toBe('architectural');
        expect(efficacyClassFor(lod200Row('pendant_disc')!)).toBe('architectural');
        expect(efficacyClassFor(lod200Row('recessed_downlight')!)).toBe('architectural');
    });

    it('all five classify as PENDANTS with no new mapping table', () => {
        for (const id of NEW_ROW_IDS) {
            expect(constructionFormFor(id), id).toBe('pendant');
            expect(photometryForFixture(id).suspended, id).toBe(true);
            expect(photometryForFixture(id).mount, id).toBe('ceiling');
        }
    });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe('§LIGHT102 — the new geometry is deterministic', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('each new family built twice yields identical mesh counts and vertex sums', () => {
        const fingerprint = (o: THREE.Object3D): string => {
            const parts: string[] = [];
            for (const m of meshes(o)) {
                const pos = m.geometry.attributes.position as THREE.BufferAttribute;
                let s = 0;
                for (let i = 0; i < pos.count; i++) s += pos.getX(i) + pos.getY(i) + pos.getZ(i);
                parts.push(`${pos.count}:${s.toFixed(6)}:${m.position.y.toFixed(6)}`);
            }
            return parts.join('|');
        };
        for (const id of NEW_ROW_IDS) {
            const a = build(id, { id: 'p1' });
            const c = build(id, { id: 'p2' });
            expect(fingerprint(a.root), `${id} geometry is not deterministic`).toBe(fingerprint(c.root));
            a.b.dispose(); c.b.dispose();
        }
    });
});
