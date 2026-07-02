// §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — pure-helper tests for the dual-north transform
// (node env, no DOM/MapLibre/THREE). Covers the three load-bearing guarantees the
// L-38 brief calls out:
//   (a) θ round-trips — a project-north point maps to the correct true-north/world
//       position and back; θ derivation from the overlay placement is exact.
//   (b) the underlay geolocation + scale persist + restore (incl. the project-north θ).
//   (c) the plan view is AXIS-ALIGNED to the underlay (project frame, rotation 0) while
//       the globe APPLIES θ to sit the model on the earth.

import { describe, it, expect } from 'vitest';
import {
    normalizeAngle,
    deriveProjectNorthAngle,
    projectToTrueNorth,
    trueToProjectNorth,
    projectVectorToTrueNorth,
    overlayInProjectFrame,
    captureUnderlayGeolocation,
} from '../src/ui/site/overlay/projectTrueNorth';
import type { SitePlanOverlayTransform } from '../src/ui/site/overlay/sitePlanOverlayGeometry';
import {
    serializeOverlay,
    deserializeOverlay,
} from '../src/ui/site/overlay/sitePlanOverlayPersistence';

const baseTransform = (rotationRad: number): SitePlanOverlayTransform => ({
    centre: { east: 25, north: -40 },
    metresPerPixel: 0.05,
    rotationRad,
    widthPx: 1000,
    heightPx: 800,
});

// ── (a) θ round-trip + derivation ────────────────────────────────────────────
describe('project ↔ true-north round-trip', () => {
    it('90° clockwise maps project-East to true-South about the base', () => {
        const base = { east: 0, north: 0 };
        const p = projectToTrueNorth({ east: 10, north: 0 }, Math.PI / 2, base);
        expect(p.east).toBeCloseTo(0, 9);
        expect(p.north).toBeCloseTo(-10, 9); // clockwise 90°: East → South
    });

    it('project → true → project returns the original point (any θ, any base)', () => {
        const base = { east: 25, north: -40 };
        for (const theta of [0, 0.3, -1.1, Math.PI / 2, 2.9]) {
            for (const pt of [{ east: 12, north: 7 }, { east: -3, north: 18 }, { east: 25, north: -40 }]) {
                const world = projectToTrueNorth(pt, theta, base);
                const back = trueToProjectNorth(world, theta, base);
                expect(back.east).toBeCloseTo(pt.east, 9);
                expect(back.north).toBeCloseTo(pt.north, 9);
            }
        }
    });

    it('θ = 0 is the identity (byte-identical to an unrotated site)', () => {
        const base = { east: 5, north: 5 };
        const pt = { east: 9, north: -2 };
        expect(projectToTrueNorth(pt, 0, base)).toEqual(pt);
        expect(trueToProjectNorth(pt, 0, base)).toEqual(pt);
    });

    it('deriveProjectNorthAngle = normalised overlay rotation', () => {
        expect(deriveProjectNorthAngle(baseTransform(0.4))).toBeCloseTo(0.4, 12);
        // normalises past π
        expect(deriveProjectNorthAngle(baseTransform(Math.PI + 0.1))).toBeCloseTo(-Math.PI + 0.1, 9);
    });

    it('normalizeAngle folds into (−π, π] and guards non-finite', () => {
        expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
        expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 9);
        expect(normalizeAngle(NaN)).toBe(0);
    });
});

// ── (c) plan axis-aligned vs globe applies θ ─────────────────────────────────
describe('plan is project-north; globe applies θ', () => {
    it('overlayInProjectFrame removes the rotation (plan renders axis-aligned)', () => {
        const t = baseTransform(0.7);
        const inPlan = overlayInProjectFrame(t);
        expect(inPlan.rotationRad).toBe(0);
        // everything else preserved — the underlay stays put, just un-rotated in plan.
        expect(inPlan.centre).toEqual(t.centre);
        expect(inPlan.metresPerPixel).toBe(t.metresPerPixel);
        expect(inPlan.widthPx).toBe(t.widthPx);
    });

    it('a wall drawn axis-aligned in the plan frame sits at true-north angle θ on the globe', () => {
        const theta = Math.PI / 2; // 90° clockwise site
        // In the plan (project) frame the wall runs along +East (axis-aligned).
        const planWallDir = { east: 1, north: 0 };
        const worldDir = projectVectorToTrueNorth(planWallDir, theta);
        // On the globe it must run along true -North (South) — rotated by exactly θ.
        expect(worldDir.east).toBeCloseTo(0, 9);
        expect(worldDir.north).toBeCloseTo(-1, 9);
    });
});

// ── (b) geolocation + scale persist / restore ────────────────────────────────
describe('underlay geolocation capture + persistence round-trip', () => {
    it('captureUnderlayGeolocation keeps the two angles DISTINCT', () => {
        const t = baseTransform(0.35);
        // The globe θ can differ from the underlay's own on-canvas rotation.
        const geo = captureUnderlayGeolocation(t, 51.5, -0.12, 0.9);
        expect(geo.underlayRotationRad).toBeCloseTo(0.35, 9);
        expect(geo.projectNorthRad).toBeCloseTo(0.9, 9);
        expect(geo.base).toEqual({ east: 25, north: -40 });
        expect(geo.metresPerPixel).toBe(0.05);
        expect(geo.originLat).toBe(51.5);
        expect(geo.originLon).toBe(-0.12);
    });

    it('θ + scale + geolocation persist and restore', () => {
        const t = baseTransform(0.42);
        const rec = serializeOverlay({
            fileName: 'survey.pdf',
            sourceKind: 'pdf',
            imageDataUrl: 'data:image/png;base64,AAAA',
            page: 1,
            originLat: 51.5,
            originLon: -0.12,
            transform: t,
            opacity: 0.6,
            locked: false,
            visible: true,
            calibrated: true,
            projectNorthRad: deriveProjectNorthAngle(t),
            projectNorthSet: true,
        });
        const round = deserializeOverlay(JSON.stringify(rec));
        expect(round).not.toBeNull();
        expect(round!.projectNorthSet).toBe(true);
        expect(round!.projectNorthRad).toBeCloseTo(0.42, 9);
        expect(round!.transform.metresPerPixel).toBe(0.05);
        expect(round!.transform.rotationRad).toBeCloseTo(0.42, 9); // underlay on-canvas rot
        expect(round!.originLat).toBe(51.5);
    });

    it('an OLD record without project-north fields still restores (back-compat)', () => {
        const legacy = {
            schemaVersion: 1,
            fileName: 'old.png',
            sourceKind: 'image',
            imageDataUrl: 'data:image/png;base64,AAAA',
            page: 1,
            originLat: 40,
            originLon: -3,
            transform: baseTransform(0),
            opacity: 0.7,
            locked: false,
            visible: true,
            calibrated: false,
            savedAt: new Date(0).toISOString(),
        };
        const round = deserializeOverlay(JSON.stringify(legacy));
        expect(round).not.toBeNull();
        expect(round!.projectNorthSet).toBe(false);
        expect(round!.projectNorthRad).toBeUndefined();
    });
});
