// @vitest-environment happy-dom
/**
 * §LIGHT121 (L-11904) — founder: "floor lighting" (uplighters, floor-recessed
 * spots, plinth/cove LED).
 *
 * ── THE GAP, MEASURED ─────────────────────────────────────────────────────────
 * Every pre-existing `mount: 'floor'` row (the five §OUTDOOR112 site fixtures
 * plus the legacy `bollard_light`) is `location: 'exterior'` — there was no
 * INDOOR floor-standing luminaire anywhere in the matrix. Four rows close it,
 * on the PRE-EXISTING `can` / `bar` archetypes (C84 EI-9: an uplighter is
 * optically a downlight pointed the other way, not a new mass):
 *
 *   floor_uplighter_recessed  — `can`, recessed, face 'up'  — in-ground wash
 *   floor_uplighter_surface   — `can`, surface,  face 'up'  — standing puck
 *   floor_recessed_spot       — `can`, recessed, face 'up'  — narrow in-ground spot
 *   plinth_cove_led           — `bar`, recessed, face 'up'  — linear skirting cove
 *
 * ── THE CODE GAP THIS SURFACED ────────────────────────────────────────────────
 * `_lod200Can` / `_lod200Bar` (and their `_lod200EmitterOffset` arms) hard-assumed
 * a CEILING mount: local +Y is "away from the room" there. For a FLOOR mount the
 * room is on the OPPOSITE side of the local origin, so reusing that geometry
 * unmodified would have built an uplighter with its lens buried in the floor
 * slab, facing the wrong way, or both. `LightingFragmentBuilder` gained an
 * explicit `mount === 'floor'` arm in both places, sign-mirrored from the
 * ceiling arm — exactly as `mount === 'wall'` already has its own arm there.
 * This suite is the measurement that the mirror is right: the EMITTER (not
 * merely the body) sits on the room side of the floor plane for all four.
 *
 * ── REACHABILITY ──────────────────────────────────────────────────────────────
 * Nothing here or in the create-rail panel was hand-edited to expose these:
 * `CreateRailPanelLighting.ts`'s "Floor Standing" (interior) mount group already
 * existed and already held the three legacy hand-authored floor LAMPS
 * (`floor_wood_post`, `floor_arc_brass`, `floor_tripod_black` — none of the
 * twelve pre-existing families author a `location`, which counts as interior).
 * What it held none of was a floor-mount ARCHITECTURAL luminaire — every
 * LOD-200 `mount: 'floor'` row is `location: 'exterior'` — so these four rows
 * are the section's first LOD-200 members, joining the lamps by construction.
 * See `apps/editor/src/ui/__tests__/floorLightingPaletteReachability.spec.ts`
 * for the DOM-level proof.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';
import { FLOOR_MOUNTED_FIXTURES } from '../src/LightingTypes';
import { BUILT_IN_LIGHTING_TYPES } from '../src/LightingTypeDefinitions';
import {
    LOD200_FIXTURE_ROWS, lod200Row, efficacyClassFor, efficacyLmPerW, EFFICACY_BANDS,
    minIpForLocation,
} from '@pryzm/core-app-model/lod200-fixtures';
import { LIVE_LIGHT_BUDGET_BY_TIER } from '@pryzm/core-app-model';

const g = globalThis as unknown as { window?: unknown };

const FOUR = {
    uplighterRecessed: { n: 1, id: 'floor_uplighter_recessed', archetype: 'can', recessed: true },
    uplighterSurface:  { n: 2, id: 'floor_uplighter_surface',  archetype: 'can', recessed: false },
    recessedSpot:      { n: 3, id: 'floor_recessed_spot',      archetype: 'can', recessed: true },
    plinthCove:        { n: 4, id: 'plinth_cove_led',          archetype: 'bar', recessed: true },
} as const;
const IDS = Object.values(FOUR).map((f) => f.id);

function build(type: string, id = `f-${type}`): { b: LightingFragmentBuilder; scene: THREE.Scene; root: THREE.Object3D } {
    const scene = new THREE.Scene();
    const b = new LightingFragmentBuilder();
    b.setScene(scene);
    const data: LightingData = {
        id, type: 'lighting', levelId: 'L0',
        fixtureType: type as LightingFixtureType,
        position: { x: 0, y: 0, z: 0 }, // floor-seated: base point ON the finished floor
    };
    b.add(data);
    b.syncLights();
    return { b, scene, root: scene.children.find((c) => c.userData?.id === id)! };
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    o.traverse((n) => { if ((n as THREE.Mesh).isMesh) out.push(n as THREE.Mesh); });
    return out;
}
function lightIn(o: THREE.Object3D): THREE.Light | undefined {
    let found: THREE.Light | undefined;
    o.traverse((n) => { if (!found && (n as THREE.Light).isLight) found = n as THREE.Light; });
    return found;
}
/** The fixture's own extent, in ITS frame (never world). */
function localBox(o: THREE.Object3D): THREE.Box3 {
    const box = new THREE.Box3().setFromObject(o);
    return box.translate(new THREE.Vector3(-o.position.x, -o.position.y, -o.position.z));
}

describe('§LIGHT121 / L-11904 — the four floor rows resolve, reach the registry, seat correctly', () => {
    it('each has a matrix row on its stated archetype, floor-mounted, interior — the gap that had none', () => {
        for (const [key, f] of Object.entries(FOUR)) {
            const row = lod200Row(f.id);
            expect(row, `#${f.n} ${key} has no matrix row`).toBeDefined();
            expect(row!.archetype, `#${f.n} ${key} archetype`).toBe(f.archetype);
            expect(row!.mount, `#${f.n} ${key} mount`).toBe('floor');
            expect(row!.face, `#${f.n} ${key} face`).toBe('up');
            expect(row!.location, `#${f.n} ${key} must be the INTERIOR floor gap, not another exterior row`).toBe('interior');
            expect(row!.recessed ?? false, `#${f.n} ${key} recessed flag`).toBe(f.recessed);
            // DERIVED, never re-listed — the seating set reads the matrix.
            expect(FLOOR_MOUNTED_FIXTURES.has(f.id as never), `#${f.n} seats on the floor plane`).toBe(true);
            // Reachable — the registry the palette derives from carries it.
            expect(BUILT_IN_LIGHTING_TYPES.some((t) => t.id === f.id && t.mount === 'floor'), `#${f.n} in the registry as a floor mount`).toBe(true);
        }
    });

    it('is the FIRST interior floor mount in the whole matrix — every OTHER floor row is exterior', () => {
        const floorRows = LOD200_FIXTURE_ROWS.filter((r) => r.mount === 'floor');
        const interiorFloor = floorRows.filter((r) => r.location === 'interior');
        expect(interiorFloor.map((r) => r.id).sort()).toEqual([...IDS].sort());
        for (const r of floorRows) {
            if (IDS.includes(r.id as never)) continue;
            expect(r.location, `${r.id} — every pre-existing floor row is exterior`).toBe('exterior');
        }
    });
});

describe('§LIGHT121 / L-11904 — photometry: authored per row, in the derived band', () => {
    it('every row sits inside the architectural lm/W band (can/bar are not decorative archetypes)', () => {
        for (const id of IDS) {
            const row = lod200Row(id)!;
            expect(efficacyClassFor(row), id).toBe('architectural');
            const [lo, hi] = EFFICACY_BANDS.architectural;
            const lmW = efficacyLmPerW(row);
            expect(lmW, `${id} ${lmW.toFixed(1)} lm/W outside [${lo},${hi}]`).toBeGreaterThanOrEqual(lo);
            expect(lmW, id).toBeLessThanOrEqual(hi);
            expect(row.ipRating, `${id} IP below the interior floor`).toBeGreaterThanOrEqual(minIpForLocation('interior'));
        }
    });

    it('the two in-ground (walk-over) fixtures carry a walk-over IP; the surface puck does not need one', () => {
        expect(lod200Row(FOUR.uplighterRecessed.id)!.ipRating).toBeGreaterThanOrEqual(65);
        expect(lod200Row(FOUR.recessedSpot.id)!.ipRating).toBeGreaterThanOrEqual(65);
    });

    it('the spot is genuinely narrower than the wash — the field that makes them two rows, not one', () => {
        expect(lod200Row(FOUR.recessedSpot.id)!.beamAngleDeg)
            .toBeLessThan(lod200Row(FOUR.uplighterRecessed.id)!.beamAngleDeg);
    });

    it('the plinth cove is NOT its ceiling sibling\'s numbers copied across', () => {
        const plinth = lod200Row('plinth_cove_led')!;
        const ceiling = lod200Row('cove_indirect')!;
        expect(plinth.lumens).not.toBe(ceiling.lumens);
        expect(plinth.watts).not.toBe(ceiling.watts);
        expect(plinth.lMm).not.toBe(ceiling.lMm);
        // Same LED-strip efficacy CLASS, independently derived, not the same absolute pair.
        expect(efficacyClassFor(plinth)).toBe(efficacyClassFor(ceiling));
    });

    it('adding four rows does not touch the live-light budget ladder (L-11422)', () => {
        expect(LIVE_LIGHT_BUDGET_BY_TIER).toEqual({ cinematic: 8, balanced: 6, performance: 3, survival: 1 });
    });
});

describe('§LIGHT121 / L-11904 — geometry: the emitter is on the ROOM side of the floor plane', () => {
    beforeEach(() => { g.window = g.window ?? {}; });

    it('every one builds with a body and at least one lens', () => {
        for (const id of IDS) {
            const { root } = build(id);
            expect(root, id).toBeDefined();
            expect(meshes(root).length, `${id} has meshes`).toBeGreaterThan(0);
        }
    });

    it('THE MIRROR-SIGN MEASUREMENT — the emitter (the real THREE light) sits at LOCAL Y ≥ 0: into the room, never buried in the slab', () => {
        for (const id of IDS) {
            const { root } = build(id);
            const light = lightIn(root);
            expect(light, `${id} has no live light`).toBeDefined();
            expect(light!.position.y, `${id} emitter is on the void side of the floor plane — the exact defect a naive ceiling-arm reuse would have produced`)
                .toBeGreaterThanOrEqual(0);
        }
    });

    it('the NON-recessed surface puck: its WHOLE body sits at y ≥ 0 — nothing below the floor it stands on', () => {
        const { root } = build(FOUR.uplighterSurface.id);
        const box = localBox(root);
        expect(box.min.y, 'a surface fixture has no part below its own base').toBeGreaterThanOrEqual(-0.001);
    });

    it('the RECESSED fixtures embed their body below the floor plane (−Y) — the ceiling-recessed pattern, mirrored, not a defect', () => {
        for (const f of [FOUR.uplighterRecessed, FOUR.recessedSpot, FOUR.plinthCove]) {
            const { root } = build(f.id);
            const box = localBox(root);
            expect(box.min.y, `${f.id} recessed body should embed below the floor`).toBeLessThan(0);
            // But the visible top (lens/trim) must not sink meaningfully into the void —
            // it reads flush with the floor, same tolerance the ceiling-recessed rows use.
            expect(box.max.y, `${f.id} nothing should protrude far above the floor`).toBeLessThan(0.05);
        }
    });

    it('deterministic — two builds of one row are mesh-for-mesh identical', () => {
        for (const id of IDS) {
            const a = build(id, `${id}-a`).root;
            const b = build(id, `${id}-b`).root;
            const ma = meshes(a), mb = meshes(b);
            expect(mb.length, id).toBe(ma.length);
            for (let i = 0; i < ma.length; i++) {
                expect(mb[i]!.position.toArray(), `${id} mesh ${i}`).toEqual(ma[i]!.position.toArray());
            }
        }
    });
});
