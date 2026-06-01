// A.7.d (Phase A · Sprint 2) — Footprint containment + FAR tests.

import { describe, expect, it } from 'vitest';
import {
    checkFootprintContainment,
    checkFAR,
    type EdgeClassification,
} from '../src/containment.js';

// ─────────────────────────────────────────────────────────────────────────────
// checkFootprintContainment
// ─────────────────────────────────────────────────────────────────────────────

describe('checkFootprintContainment', () => {
    const parcel = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ];
    const edges: EdgeClassification[] = ['front', 'side', 'rear', 'side'];

    it('passes when footprint is inside parcel and outside setbacks', () => {
        const footprint = [
            { x: 3, z: 3 },
            { x: 7, z: 3 },
            { x: 7, z: 5 },
            { x: 3, z: 5 },
        ];
        const report = checkFootprintContainment(footprint, parcel, edges, {
            front: 2,
            side: 2,
            rear: 2,
        });
        expect(report.ok).toBe(true);
        expect(report.violations).toEqual([]);
    });

    it('fails with outside-parcel for a vertex outside the parcel', () => {
        const footprint = [
            { x: 5, z: 3 },
            { x: 15, z: 3 },      // outside (X = 15 > 10)
            { x: 15, z: 5 },
            { x: 5, z: 5 },
        ];
        const report = checkFootprintContainment(footprint, parcel, edges, {
            front: 0,
            side: 0,
            rear: 0,
        });
        expect(report.ok).toBe(false);
        expect(report.violations).toHaveLength(2);
        expect(report.violations[0]!.kind).toBe('outside-parcel');
        expect(report.violations[0]!.vertexIndex).toBe(1);
    });

    it('fails with setback-front when vertex is too close to a front edge', () => {
        const footprint = [
            { x: 1, z: 1 },    // 1m from front edge (Z = 0); requires 3m
            { x: 9, z: 1 },
            { x: 9, z: 7 },
            { x: 1, z: 7 },
        ];
        const report = checkFootprintContainment(footprint, parcel, edges, {
            front: 3,
            side: 0,
            rear: 0,
        });
        expect(report.ok).toBe(false);
        // Vertices 0 and 1 violate front setback (z=1 < 3).
        const frontViolations = report.violations.filter(
            (v) => v.kind === 'setback-front',
        );
        expect(frontViolations.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores unclassified edges (treats setback as 0)', () => {
        // Edge 0 is 'unclassified'; vertex at (1, 1) would normally fail
        // the 3m front setback but the unclassified edge gets no check.
        const footprint = [
            { x: 1, z: 1 },
            { x: 9, z: 1 },
            { x: 9, z: 7 },
            { x: 1, z: 7 },
        ];
        const allUnclassified: EdgeClassification[] = [
            'unclassified',
            'unclassified',
            'unclassified',
            'unclassified',
        ];
        const report = checkFootprintContainment(
            footprint,
            parcel,
            allUnclassified,
            { front: 3, side: 3, rear: 3 },
        );
        expect(report.ok).toBe(true);
    });

    it('trivially passes for an empty footprint', () => {
        const report = checkFootprintContainment([], parcel, edges, {
            front: 0,
            side: 0,
            rear: 0,
        });
        expect(report.ok).toBe(true);
    });

    it('fails for a degenerate parcel (< 3 vertices)', () => {
        const footprint = [
            { x: 1, z: 1 },
            { x: 2, z: 1 },
        ];
        const report = checkFootprintContainment(
            footprint,
            [{ x: 0, z: 0 }],
            ['unclassified'],
            { front: 0, side: 0, rear: 0 },
        );
        expect(report.ok).toBe(false);
        expect(report.violations).toHaveLength(2);
        expect(report.violations[0]!.kind).toBe('outside-parcel');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkFAR
// ─────────────────────────────────────────────────────────────────────────────

describe('checkFAR', () => {
    const parcel = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ];        // 80 m² parcel

    it('passes when maxFAR is null (unrestricted)', () => {
        const report = checkFAR(parcel, 1000, null);
        expect(report.ok).toBe(true);
        expect(report.maxFAR).toBeNull();
    });

    it('passes when GFA / parcelArea ≤ maxFAR', () => {
        const report = checkFAR(parcel, 100, 1.5);    // 100/80 = 1.25 ≤ 1.5
        expect(report.ok).toBe(true);
        expect(report.ratio).toBeCloseTo(1.25);
    });

    it('fails when GFA / parcelArea > maxFAR', () => {
        const report = checkFAR(parcel, 200, 1.5);    // 200/80 = 2.5 > 1.5
        expect(report.ok).toBe(false);
        expect(report.ratio).toBeCloseTo(2.5);
        expect(report.message).toMatch(/FAR violation/i);
    });

    it('fails with Infinity ratio when parcelArea === 0', () => {
        const report = checkFAR([], 100, 1.5);
        expect(report.ok).toBe(false);
        expect(report.ratio).toBe(Number.POSITIVE_INFINITY);
        expect(report.message).toMatch(/zero area/i);
    });

    it('FAR exactly at the cap passes', () => {
        const report = checkFAR(parcel, 120, 1.5);    // 120/80 = 1.5 ≤ 1.5
        expect(report.ok).toBe(true);
    });
});
