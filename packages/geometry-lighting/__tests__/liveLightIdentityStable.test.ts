/**
 * ⭐ §FIX-LIGHT-PLACE-FREEZE (L-10080) — founder 2026-08-23: *"why does placing a
 * lighting FREEZE THE SCENE?"*
 *
 * ── THE HYPOTHESIS THIS SUITE FALSIFIED, AND THE ONE IT PINS ────────────────
 * The brief's hypothesis was that the §FIX-SHADOW-WALLCOMMIT-DESTROY freeze latch is
 * armed for a WALL commit and not for lighting. MEASURED, and it is FALSE:
 * `bim-lighting-added` / `bim-lighting-updated` are both members of
 * `GEOMETRY_CASTER_MUTATION_EVENTS`
 * (`apps/editor/src/engine/geometryMutationEvents.ts`), which IS `_pascalGeomEvents`
 * (`initScene.ts:4001`), whose listener `_debouncedGeomAdded` calls
 * `_armWallCommitShadowFreeze()` synchronously. Lighting has armed that latch since
 * §GEOM-CASTER-EVENT-CHOKEPOINT (L-1189). The shadow map is NOT the un-guarded cost.
 *
 * ── WHAT IS ACTUALLY UN-GUARDED: LIGHT-OBJECT CHURN ────────────────────────
 * At the `performance` tier the live-light budget is 3. Placing fixtures one at a
 * time, the PRE-FIX builder minted a brand-new `THREE.PointLight` on EVERY placement
 * — 8 placements produced 8 distinct light objects — because `_syncAllLights` ran a
 * single interleaved pass: it attached the newcomer (minting a light) BEFORE
 * detaching the fixture the budget displaced (discarding that fixture's light).
 *
 * `LiveLightBudget.ts` §PERF-LIGHT-COST-MODEL (2) states the consequence this repo
 * has already ratified: `numPointLights` is part of THREE's program cache key, and on
 * the WebGPU/TSL path **C04 §SHADOW rule 8 is normative that
 * `LightsNode.customCacheKey()` hashes per LIGHT** — per LIGHT, not per count. A
 * different light OBJECT therefore rebuilds every material program in the scene even
 * when the COUNT is unchanged. That is why the stall was not confined to the first
 * three fixtures: it fired on every placement.
 *
 * ⚠ MEASURED vs ASSUMED — stated, not blurred. What these tests measure is the
 * OBJECT CHURN. They do not, and cannot here, measure the millisecond cost of a
 * program rebuild (no GPU in Node — see `render-pass-cost.bench.ts`). The ms link
 * rests on the cost model cited above. Do not quote a ms figure from this file.
 *
 * ── WHY THE ASSERTIONS ARE ON IDENTITY, NOT ON COUNT ───────────────────────
 * A count-based assertion passes on the pre-fix tree: the live COUNT is already
 * correct (it pins at 3). The defect is invisible to it. Only object IDENTITY across
 * placements distinguishes the two trees, which is exactly the quantity the WebGPU
 * cache key is hashed from.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData } from '../src/LightingTypes';
import { LIVE_LIGHT_BUDGET_BY_TIER } from '@pryzm/core-app-model';

function fixture(i: number): LightingData {
    return {
        id: `light_${i}`,
        type: 'lighting',
        levelId: 'L0',
        fixtureType: 'downlight',
        // Ascending z walks each fixture NEARER the focus point below, so every
        // placement displaces the current farthest holder of a budget slot — the
        // founder's own gesture (place, place, place) and the churn's worst case.
        position: { x: 0, y: 2.7, z: i * 2 },
        properties: {},
    } as LightingData;
}

/** Every DISTINCT light object this scene has ever held. */
function scanLights(scene: THREE.Scene, seen: Set<THREE.Object3D>): void {
    scene.traverse((o) => { if ((o as THREE.Light).isLight) seen.add(o); });
}

function liveLightCount(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse((o) => { if ((o as THREE.Light).isLight) n++; });
    return n;
}

describe('§FIX-LIGHT-PLACE-FREEZE — live-light OBJECT identity is stable across placements', () => {
    let scene: THREE.Scene;
    let builder: LightingFragmentBuilder;
    const BUDGET = LIVE_LIGHT_BUDGET_BY_TIER.performance; // 3

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new LightingFragmentBuilder();
        builder.setScene(scene);
        builder.setFocusProvider(() => ({ x: 0, y: 1.6, z: 20 }));
        builder.setQualityTier('performance');
        // No store is wired: `_synthesizeData` covers every root from its stamped
        // userData, which is the production fallback path and keeps this suite off
        // `window.lightingStore`.
    });

    it('mints at most BUDGET light objects across 8 sequential placements (pre-fix: 8)', () => {
        const seen = new Set<THREE.Object3D>();
        for (let i = 0; i < 8; i++) {
            builder.add(fixture(i));
            builder.syncLights();      // flush the coalesced microtask pass
            scanLights(scene, seen);
        }

        // The NEGATIVE first, so the test cannot pass vacuously: the gesture really
        // did drive the budget past its cap.
        expect(builder.liveLightCount).toBe(BUDGET);
        expect(liveLightCount(scene)).toBe(BUDGET);

        // THE ASSERTION. Pre-fix this was 8 — one fresh PointLight per placement.
        expect(seen.size).toBeLessThanOrEqual(BUDGET);
    });

    it('the light that leaves a budget slot is the SAME object the next winner receives', () => {
        for (let i = 0; i < BUDGET; i++) builder.add(fixture(i));
        builder.syncLights();

        const before = new Set<THREE.Object3D>();
        scanLights(scene, before);
        expect(before.size).toBe(BUDGET);

        // One more fixture, nearer the focus — it must displace the farthest holder.
        builder.add(fixture(BUDGET));
        builder.syncLights();

        const after = new Set<THREE.Object3D>();
        scanLights(scene, after);
        expect(after.size).toBe(BUDGET);
        // Set equality both ways: no light object was created and none was retired.
        for (const l of after) expect(before.has(l)).toBe(true);
        for (const l of before) expect(after.has(l)).toBe(true);
    });

    it('a recycled light carries the NEW fixture\'s identity, photometry and anchor — not the old one\'s', () => {
        for (let i = 0; i <= BUDGET; i++) { builder.add(fixture(i)); }
        builder.syncLights();

        // The winners are the BUDGET nearest fixtures — ids 1..BUDGET for this layout.
        const lights: THREE.PointLight[] = [];
        scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight); });
        expect(lights).toHaveLength(BUDGET);

        for (const l of lights) {
            const owner = l.parent?.userData?.id as string | undefined;
            expect(owner).toBeDefined();
            // ⛔ The recycling must not leave a light claiming a fixture it no longer
            // belongs to — a stale `elementId` would make every downstream consumer
            // (day/night dimmer skip, schedules, the emergency sweep) address the
            // wrong fixture.
            expect(l.userData.elementId).toBe(owner);
            // Photometry is re-derived, not inherited: a downlight's emitter anchor is
            // below the canister, never the group origin a parked light was left at.
            expect(l.intensity).toBeGreaterThan(0);
            expect(l.distance).toBeGreaterThan(0);
            expect(l.position.y).toBeLessThan(0);
            // §NIGHT-ALL-LIGHTS-ON — fixture lights never cast shadows, recycled or not.
            expect(l.castShadow).toBe(false);
        }
    });

    it('removing a fixture returns its light to the pool and the freed slot is reclaimed without a new object', () => {
        for (let i = 0; i < BUDGET; i++) builder.add(fixture(i));
        builder.syncLights();
        const before = new Set<THREE.Object3D>();
        scanLights(scene, before);

        builder.remove('light_0');
        builder.syncLights();
        expect(liveLightCount(scene)).toBe(BUDGET - 1);

        builder.add(fixture(99));
        builder.syncLights();
        expect(liveLightCount(scene)).toBe(BUDGET);

        const after = new Set<THREE.Object3D>();
        scanLights(scene, after);
        for (const l of after) expect(before.has(l)).toBe(true);
    });
});
