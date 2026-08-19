// @vitest-environment happy-dom
/**
 * §GEOM-CASTER-EVENT-CHOKEPOINT (L-1188) — the gate for
 * `apps/editor/src/engine/geometryMutationEvents.ts`.
 *
 * ═══ WHAT THIS PINS, AND WHY IT IS NOT A STUB TEST ═════════════════════════
 *
 * The founder's P0: changing a HANDRAIL TYPE drove the render pipeline into
 * `phase=error` with *"Destroyed texture [Texture \"ShadowDepthTexture\"] used in
 * a submit"*, the bounded auto-recovery spent 2/2, and the viewport froze.
 *
 * The bypass this file pins is structural: `initScene._pascalGeomEvents` — the
 * list that ARMS the §FIX-SHADOW-WALLCOMMIT-DESTROY freeze
 * (`_debouncedGeomAdded` → `setShadowReallocFrozen(true)`) — was a hand-written
 * literal of eleven families, and `bim-handrail-*` was in NEITHER it nor its
 * already-diverged sibling `_rpcGeomEvents`. So the single largest GPU churn in
 * the product ran with the live WebGPU shadow map unfrozen.
 *
 * ⛔ ARM A DRIVES THE REAL TYPE-CHANGE PATH. It uses the real
 * `handrailTypeStore` catalogue, the real `resolveHandrailTypeFields`
 * projection (the same one `element.changeType`'s railing branch calls) and the
 * real `HandrailFragmentBuilder` — no stub of the subject. It establishes the
 * load-bearing PREMISE (a retype replaces the element's whole mesh set, and
 * those meshes satisfy `PascalSceneLighting._enableShadowsOnScene`'s promotion
 * rule, i.e. they ARE shadow casters) and then asserts the event that carries
 * that change is a member of the freeze list. Only the last assertion fails
 * without the fix — which is the point: the premise must be true for the
 * assertion to mean anything.
 *
 * CONTRACTS: C04 §SHADOW · ADR-0111 · ADR-0297 (L2) · C84 EI-4a (an enforced
 * chokepoint beats an enumerated one) · C95 §15.5 (the 93-material census).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { handrailTypeStore } from '@pryzm/core-app-model';
import { HandrailFragmentBuilder, resolveHandrailTypeFields } from '@pryzm/geometry-handrail';
import {
    GEOMETRY_CASTER_MUTATION_EVENTS,
    NON_CASTER_BIM_EVENTS,
} from '../src/engine/geometryMutationEvents';

const REPO_ROOT = resolve(__dirname, '../../..');
const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

/**
 * `PascalSceneLighting._enableShadowsOnScene`'s promotion predicate, transcribed
 * from the source it governs (PascalSceneLighting.ts:466-528). A mesh that
 * satisfies it is flagged `castShadow = true` by the next full-scene pass — i.e.
 * it IS a member of the shadow caster set.
 */
function wouldBePromotedToCaster(obj: THREE.Object3D): boolean {
    if (!(obj as THREE.Mesh).isMesh) return false;
    const role = obj.userData?.role as string | undefined;
    const name = (obj.name ?? '').toLowerCase();
    if (role === 'edges' || role === 'edge-overlay') return false;
    if (name.includes('edge') || name.includes('grid') || name.includes('collision')) return false;
    if (obj.userData?.isRhinoProxy === true) return false;
    const mesh = obj as THREE.Mesh;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
        THREE.MeshStandardMaterial | undefined;
    if (role === 'ground-shadow-catcher' || mat?.type === 'ShadowMaterial') return false;
    if (mat?.transparent && (mat.opacity ?? 1) < 0.5) return false;
    return true;
}

function railRecord(over: Partial<HandrailData> = {}): HandrailData {
    return {
        id: 'caster-evt-rail',
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.1,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
        ...over,
    } as HandrailData;
}

function meshesOf(scene: THREE.Scene): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
}

describe('§GEOM-CASTER-EVENT-CHOKEPOINT — ARM A: the REAL handrail type change mutates the caster set', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    it('a real catalogue retype REPLACES every mesh of the element, and all of them are shadow casters', () => {
        // The two ends of the swap are real catalogue entries — the same records
        // `element.changeType`'s railing branch resolves via handrailTypeStore.
        const from = handrailTypeStore.getById('timber-picket');
        const to   = handrailTypeStore.getById('glass-frameless');
        expect(from, 'catalogue type "timber-picket" must exist').toBeTruthy();
        expect(to, 'catalogue type "glass-frameless" must exist').toBeTruthy();

        // Build at the FROM type, through the real projection.
        const before = resolveHandrailTypeFields(from!);
        builder.updateHandrail(railRecord(before as Partial<HandrailData>));

        const meshesBefore = meshesOf(scene);
        expect(meshesBefore.length).toBeGreaterThan(0);
        // PREMISE 1 — every mesh this builder emits satisfies the Pascal promotion
        // rule, so a handrail's meshes ARE in the shadow caster set. If this ever
        // stops being true the freeze argument below stops applying, and the test
        // says so instead of quietly passing.
        for (const m of meshesBefore) {
            expect(wouldBePromotedToCaster(m), `${m.userData?.member ?? m.name} must be a caster`).toBe(true);
        }
        const identitiesBefore = new Set<THREE.Mesh>(meshesBefore);

        // THE GESTURE — retype through the same projection the bus branch uses.
        const after = resolveHandrailTypeFields(to!);
        builder.updateHandrail(railRecord(after as Partial<HandrailData>));

        const meshesAfter = meshesOf(scene);
        expect(meshesAfter.length).toBeGreaterThan(0);
        // PREMISE 2 — not one mesh survives the retype: the caster set is fully
        // torn down and re-minted in a single synchronous tick.
        for (const m of meshesAfter) {
            expect(identitiesBefore.has(m), 'a retype must not reuse a pre-retype mesh').toBe(false);
        }
    });

    it('THE PIN — the event that carries that mutation arms the shadow freeze', () => {
        // `HandrailStore.emit` dispatches exactly this on an update
        // (HandrailStore.ts:203), and `initBuilders.ts:921` rebuilds from it.
        // Membership in this list is what makes `_debouncedGeomAdded` arm
        // §FIX-SHADOW-WALLCOMMIT-DESTROY across the rebuild + settle window.
        // ⛔ THIS IS THE ASSERTION THAT FAILS WITHOUT THE FIX.
        expect(GEOMETRY_CASTER_MUTATION_EVENTS).toContain('bim-handrail-updated');
        expect(GEOMETRY_CASTER_MUTATION_EVENTS).toContain('bim-handrail-added');
        // The stair's railing is a DIFFERENT element with its own store, builder
        // and event, so `bim-stair-*` never covered it — same defect, same tick.
        expect(GEOMETRY_CASTER_MUTATION_EVENTS).toContain('bim-stair-railing-updated');
        expect(GEOMETRY_CASTER_MUTATION_EVENTS).toContain('bim-stair-railing-added');
    });
});

describe('§GEOM-CASTER-EVENT-CHOKEPOINT — ARM B: the enumeration is GATED, not remembered', () => {
    it('every bim-*-added/updated event in the catalogue is classified exactly once', () => {
        const catalog = readFileSync(
            resolve(REPO_ROOT, 'packages/event-bus/src/catalog.ts'), 'utf8',
        );
        const declared = new Set<string>(
            [...catalog.matchAll(/'(bim-[a-z0-9-]+-(?:added|updated))'\s*:/g)].map((m) => m[1]),
        );
        expect(declared.size, 'the catalogue must declare BIM add/update events').toBeGreaterThan(20);

        const casters = new Set<string>(GEOMETRY_CASTER_MUTATION_EVENTS as readonly string[]);
        const denied  = new Set<string>(NON_CASTER_BIM_EVENTS.map(([e]) => e));

        // Disjoint — an event cannot be both a caster mutation and not one.
        for (const e of casters) {
            expect(denied.has(e), `${e} is in BOTH lists`).toBe(false);
        }

        // Complete — a NEW element family cannot be born outside the freeze
        // without a human classifying it here, in writing.
        const unclassified = [...declared].filter((e) => !casters.has(e) && !denied.has(e)).sort();
        expect(
            unclassified,
            'unclassified BIM geometry events — add each to GEOMETRY_CASTER_MUTATION_EVENTS ' +
            '(it changes the shadow caster set) or to NON_CASTER_BIM_EVENTS with a reason',
        ).toEqual([]);
    });

    it('every deny-list entry carries a non-trivial reason', () => {
        for (const [event, reason] of NON_CASTER_BIM_EVENTS) {
            expect(reason.length, `${event} needs a real reason, not a placeholder`).toBeGreaterThan(30);
        }
    });
});

describe('§GEOM-CASTER-EVENT-CHOKEPOINT — ARM C: initScene must not re-fork the list', () => {
    it('_pascalGeomEvents is the shared constant, not a second literal', () => {
        const src = readFileSync(
            resolve(REPO_ROOT, 'apps/editor/src/engine/initScene.ts'), 'utf8',
        );
        expect(src).toContain("from './geometryMutationEvents'");
        expect(src).toMatch(/const\s+_pascalGeomEvents\s*=\s*GEOMETRY_CASTER_MUTATION_EVENTS\s*;/);
        // A re-forked array literal is the regression this whole file exists to
        // prevent — it is how the list rotted the first time.
        expect(src).not.toMatch(/const\s+_pascalGeomEvents\s*=\s*\[/);
    });
});
