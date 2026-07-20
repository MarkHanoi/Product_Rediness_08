// §L-432 — SiteContextSnapProvider tests.
//
// The geometry here is simple; the RANKING is the part that can be wrong in a way nobody
// notices, so most of these target priority and precedence rather than "does it find a point".
// A snap that fires but loses to the background grid is indistinguishable from no snap at all.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SiteContextSnapProvider, type SiteSnapContext } from '../src/providers/SiteContextSnapProvider';
import { SnapType, DEFAULT_SNAP_PRIORITIES } from '../src/types';

const ALL = new Set([SnapType.ENDPOINT, SnapType.MIDPOINT, SnapType.EDGE]);

/** 40 × 20 m parcel with a 3 m inset envelope (the setback line). */
const parcelRing = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -20 }, { x: 0, z: -20 },
];
const envelopeRing = [
    { x: 3, z: -3 }, { x: 37, z: -3 }, { x: 37, z: -17 }, { x: 3, z: -17 },
];

const ctx: SiteSnapContext = { parcelRing, envelopeRing };
const provider = (c: SiteSnapContext | null = ctx) => new SiteContextSnapProvider(() => c);
const at = (x: number, z: number) => new THREE.Vector3(x, 0, z);

describe('§L-432 SiteContextSnapProvider', () => {
    it('snaps to a parcel corner and an envelope corner', () => {
        const got = provider().getCandidates(at(0.2, -0.2), 1, ALL);
        const corner = got.find((c) => c.metadata?.label === 'parcelCorner');
        expect(corner).toBeDefined();
        expect(corner!.point.x).toBeCloseTo(0, 9);
        expect(corner!.point.z).toBeCloseTo(0, 9);

        const env = provider().getCandidates(at(3.2, -3.2), 1, ALL)
            .find((c) => c.metadata?.label === 'setbackCorner');
        expect(env).toBeDefined();
        expect(env!.point.x).toBeCloseTo(3, 9);
    });

    it('finds the PERPENDICULAR FOOT on the setback line — "build to the setback"', () => {
        // The highest-value interaction: dragging a wall toward the setback line should catch
        // the nearest point on it, not only its corners.
        const got = provider().getCandidates(at(20, -3.4), 1, ALL);
        const edge = got.find((c) => c.metadata?.label === 'setbackEdge');
        expect(edge).toBeDefined();
        expect(edge!.point.x).toBeCloseTo(20, 9);
        expect(edge!.point.z).toBeCloseTo(-3, 9);
    });

    it('RANKS the setback line above the background grid (else the snap is invisible)', () => {
        // A site snap that loses to the uniform math grid would fire and never win — the user
        // would see no snap at all. This is the ranking that makes the feature real.
        const edge = provider().getCandidates(at(20, -3.4), 1, ALL)
            .find((c) => c.metadata?.label === 'setbackEdge')!;
        expect(edge.priority).toBeGreaterThan(DEFAULT_SNAP_PRIORITIES[SnapType.GRID]);
    });

    it('RANKS below a real wall ENDPOINT — the user\'s own geometry wins ties', () => {
        // Site rings are reference geometry. When a wall corner and a parcel corner are both
        // in range, the authored model must take precedence.
        const corner = provider().getCandidates(at(0.1, -0.1), 1, ALL)
            .find((c) => c.metadata?.label === 'parcelCorner')!;
        expect(corner.priority).toBeLessThan(DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT]);
        expect(corner.type).toBe(SnapType.ENDPOINT);
    });

    it('the ENVELOPE outranks the PARCEL at the same class ("build to the setback")', () => {
        const all = provider().getCandidates(at(20, -10), 40, ALL);
        const envCorner = all.find((c) => c.metadata?.label === 'setbackCorner')!;
        const parCorner = all.find((c) => c.metadata?.label === 'parcelCorner')!;
        expect(envCorner.priority).toBeGreaterThan(parCorner.priority);
    });

    it('respects the snap RADIUS', () => {
        expect(provider().getCandidates(at(200, -200), 1, ALL)).toHaveLength(0);
        expect(provider().getCandidates(at(0.2, -0.2), 1, ALL).length).toBeGreaterThan(0);
    });

    it('honours enabledTypes — a disabled class emits nothing', () => {
        const onlyEdges = provider().getCandidates(at(20, -3.4), 2, new Set([SnapType.EDGE]));
        expect(onlyEdges.length).toBeGreaterThan(0);
        expect(onlyEdges.every((c) => c.type === SnapType.EDGE)).toBe(true);

        expect(provider().getCandidates(at(20, -3.4), 2, new Set())).toHaveLength(0);
    });

    it('does NOT emit an edge candidate at a vertex (no duplicate point, lower priority)', () => {
        // At a corner the vertex candidate already covers that position at higher priority.
        // A coincident EDGE candidate could win on a hair-shorter distance and silently
        // demote a corner snap to an edge snap.
        const got = provider().getCandidates(at(0.001, -0.001), 0.5, ALL);
        const edgeAtCorner = got.filter(
            (c) => c.type === SnapType.EDGE
                && Math.hypot(c.point.x - 0, c.point.z - 0) < 1e-6,
        );
        expect(edgeAtCorner).toHaveLength(0);
    });

    it('preserves the query Y — a ground-plane reference must not drag the point vertically', () => {
        const got = new SiteContextSnapProvider(() => ctx)
            .getCandidates(new THREE.Vector3(0.2, 7.5, -0.2), 1, ALL);
        expect(got.length).toBeGreaterThan(0);
        expect(got.every((c) => c.point.y === 7.5)).toBe(true);
    });

    it('is inert with no site, an empty context, or a throwing provider (never breaks drawing)', () => {
        expect(provider(null).getCandidates(at(0, 0), 5, ALL)).toHaveLength(0);
        expect(provider({ parcelRing: null, envelopeRing: null }).getCandidates(at(0, 0), 5, ALL)).toHaveLength(0);
        expect(provider({ parcelRing: [{ x: 1, z: 1 }], envelopeRing: null }).getCandidates(at(1, 1), 5, ALL)).toHaveLength(0);

        const throwing = new SiteContextSnapProvider(() => { throw new Error('site read failed'); });
        expect(() => throwing.getCandidates(at(0, 0), 5, ALL)).not.toThrow();
        expect(throwing.getCandidates(at(0, 0), 5, ALL)).toHaveLength(0);
    });

    it('can be toggled off wholesale (user setting)', () => {
        const p = provider();
        expect(p.getCandidates(at(0.2, -0.2), 1, ALL).length).toBeGreaterThan(0);
        p.setEnabled(false);
        expect(p.getCandidates(at(0.2, -0.2), 1, ALL)).toHaveLength(0);
    });

    it('tags every candidate with siteRef so the UI can draw a DISTINCT glyph', () => {
        // A setback snap must be legible AS a setback snap, not confused with a wall or grid.
        const got = provider().getCandidates(at(20, -10), 40, ALL);
        expect(got.length).toBeGreaterThan(0);
        expect(got.every((c) => c.metadata?.siteRef === 'parcel' || c.metadata?.siteRef === 'envelope')).toBe(true);
        expect(got.every((c) => c.sourceType === 'site-context')).toBe(true);
    });

    it('handles an explicitly CLOSED ring without emitting a degenerate edge', () => {
        const closed = [...parcelRing, { x: 0, z: 0 }];
        const got = new SiteContextSnapProvider(() => ({ parcelRing: closed, envelopeRing: null }))
            .getCandidates(at(0, 0), 60, ALL);
        // No candidate may be NaN, which is what a zero-length segment would produce.
        expect(got.every((c) => Number.isFinite(c.point.x) && Number.isFinite(c.point.z))).toBe(true);
    });
});
