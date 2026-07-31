// L-456 — capacity comparison (proposed vs permitted).
//
// The assertions that matter most here are the HONESTY ones. A comparison panel invites a green
// tick, and a green tick is a compliance claim about a real building — so the failure mode to
// guard is not "wrong arithmetic", it is "manufactured permission". Three rules, each pinned:
//   1. unknown is NOT compliant (a missing limit must never read as a pass);
//   2. a verdict inherits the weakest input (estimated basis ⇒ indicative only);
//   3. measure, never infer (an unmeasured value stays unknown, it is not reconstructed).

import { describe, it, expect } from 'vitest';
import { buildCapacityComparison, type MeasuredDesign } from '../src/capacityComparison.js';
import type { BuildableEnvelope } from '@pryzm/schemas';

function envelope(over: Partial<BuildableEnvelope> = {}): BuildableEnvelope {
    return {
        status: 'ok',
        confidence: 'estimated-ruleset',
        zoneCode: 'generic-urban',
        insetPolygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
        insetAreaM2: 100,
        maxHeight_m: 12,
        maxFAR: 2,
        maxVolumeM3: null,
        derivation: [],
        caveats: [],
        ...over,
    } as BuildableEnvelope;
}

const NOTHING: MeasuredDesign = {
    footprintM2: null, grossFloorAreaM2: null, netFloorAreaM2: null, heightM: null, floors: null,
};

const row = (c: ReturnType<typeof buildCapacityComparison>, m: string) =>
    c!.rows.find((r) => r.metric === m)!;

describe('L-456 buildCapacityComparison — arithmetic', () => {
    it('computes remaining and utilisation against the buildable footprint', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, footprintM2: 60 })!;
        const f = row(c, 'footprint');
        expect(f.permitted).toBe(100);
        expect(f.proposed).toBe(60);
        expect(f.remaining).toBe(40);
        expect(f.utilisationPct).toBeCloseTo(60, 6);
        expect(f.status).toBe('within');
    });

    it('derives the permitted GFA as buildable footprint × FAR (C58 §1.8)', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, grossFloorAreaM2: 150 })!;
        const g = row(c, 'grossFloorArea');
        expect(g.permitted).toBe(200);          // 100 m² × FAR 2
        expect(g.remaining).toBe(50);
        expect(g.status).toBe('within');
    });

    it('flags an over-limit design and reports a NEGATIVE remaining', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, grossFloorAreaM2: 260 })!;
        const g = row(c, 'grossFloorArea');
        expect(g.status).toBe('over');
        expect(g.remaining).toBe(-60);
        expect(c.overCount).toBe(1);
        expect(c.allJudgedWithin).toBe(false);
    });

    it('treats equality within epsilon as at-limit, not over', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, heightM: 12.01 })!;
        expect(row(c, 'height').status).toBe('at-limit');
    });
});

describe('L-456 — HONESTY RULE 1: unknown is not compliant', () => {
    // The single most dangerous defect this feature could ship: no published height limit,
    // so the panel shows a green "within" and the user believes the design was checked.
    it('reports UNKNOWN (never within) when the permitted value is missing', () => {
        const c = buildCapacityComparison(
            envelope({ maxHeight_m: null }), { ...NOTHING, heightM: 30 },
        )!;
        const h = row(c, 'height');
        expect(h.status).toBe('unknown');
        expect(h.status).not.toBe('within');
        expect(h.remaining).toBeNull();
        expect(h.utilisationPct).toBeNull();
        expect(c.unknownCount).toBeGreaterThan(0);
    });

    it('never claims allJudgedWithin when NOTHING could be judged', () => {
        const c = buildCapacityComparison(envelope({ maxHeight_m: null, maxFAR: null }), NOTHING)!;
        expect(c.allJudgedWithin).toBe(false);   // "we know nothing" ≠ "everything is fine"
    });

    it('distinguishes NO-LIMIT (the rule is silent) from UNKNOWN (we do not know)', () => {
        // FAR absent ⇒ the ordinance sets no floor-area ceiling by that mechanism — a finding.
        const c = buildCapacityComparison(
            envelope({ maxFAR: null }), { ...NOTHING, grossFloorAreaM2: 500 },
        )!;
        expect(row(c, 'grossFloorArea').status).toBe('no-limit');
        // But an unmeasured design against a real limit is genuinely unknown.
        const c2 = buildCapacityComparison(envelope(), NOTHING)!;
        expect(row(c2, 'grossFloorArea').status).toBe('unknown');
    });
});

describe('L-456 — HONESTY RULE 2: a verdict inherits the weakest input', () => {
    it('marks an ESTIMATED-basis comparison as indicative only', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, footprintM2: 10 })!;
        expect(c.basis).toBe('estimated-ruleset');
        expect(c.isIndicativeOnly).toBe(true);
    });

    // `structured` means the numbers were PUBLISHED, not that a determination was issued —
    // so it is still not grounds for an unqualified "compliant".
    it('keeps a STRUCTURED-basis comparison indicative too', () => {
        const c = buildCapacityComparison(
            envelope({ confidence: 'structured' }), { ...NOTHING, footprintM2: 10 },
        )!;
        expect(c.isIndicativeOnly).toBe(true);
    });

    it('only an AUTHORITATIVE envelope drops the indicative qualifier', () => {
        const c = buildCapacityComparison(
            envelope({ confidence: 'authoritative' }), { ...NOTHING, footprintM2: 10 },
        )!;
        expect(c.isIndicativeOnly).toBe(false);
    });
});

describe('L-456 — HONESTY RULE 3: measure, never infer', () => {
    it('leaves an unmeasured metric null rather than reconstructing it', () => {
        // footprint + floors are known and GFA is not; a "helpful" 60 × 3 = 180 would be a
        // plausible number, which is precisely the recurring failure mode.
        const c = buildCapacityComparison(
            envelope(), { ...NOTHING, footprintM2: 60, floors: 3 },
        )!;
        const g = row(c, 'grossFloorArea');
        expect(g.proposed).toBeNull();
        expect(g.status).toBe('unknown');
    });

    it('net floor area is REPORTED but never judged — zoning does not cap superficie útil', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, netFloorAreaM2: 180 })!;
        const n = row(c, 'netFloorArea');
        expect(n.proposed).toBe(180);
        expect(n.permitted).toBeNull();
        expect(n.status).toBe('no-limit');
    });
});

describe('L-456 — edges', () => {
    it('returns null without an envelope (nothing to compare against)', () => {
        expect(buildCapacityComparison(null, NOTHING)).toBeNull();
    });

    it('treats a degenerate envelope as having no permitted footprint', () => {
        const c = buildCapacityComparison(
            envelope({ status: 'degenerate', insetAreaM2: 0, insetPolygon: [] }),
            { ...NOTHING, footprintM2: 50 },
        )!;
        expect(row(c, 'footprint').status).toBe('unknown');
    });

    it('carries the local legal terms for the proyecto de ejecución schedule', () => {
        const c = buildCapacityComparison(envelope(), NOTHING)!;
        expect(row(c, 'grossFloorArea').localTerm).toBe('superficie construida');
        expect(row(c, 'netFloorArea').localTerm).toBe('superficie útil');
        expect(row(c, 'footprint').localTerm).toBe('ocupación');
    });

    it('judges storeys against an explicitly supplied maxFloors', () => {
        const c = buildCapacityComparison(envelope(), { ...NOTHING, floors: 9 }, { maxFloors: 6 })!;
        expect(row(c, 'floors').status).toBe('over');
        expect(row(c, 'floors').remaining).toBe(-3);
    });

    // §L-456 UI-WIRING — a storey cap we were never given must read as UNKNOWN, never as
    // `no-limit`. `no-limit` is a FINDING about the ordinance ("it sets no cap"), and the
    // envelope carries `maxFloors: null` both when a pack derived no cap and when the law
    // genuinely sets none. Claiming the stronger of the two would invent a permission — the
    // exact collapse honesty rule 1 forbids, in the direction that matters.
    it('reports UNKNOWN storeys — not no-limit — when no storey cap was supplied', () => {
        const measured = { ...NOTHING, floors: 9 };
        expect(row(buildCapacityComparison(envelope(), measured)!, 'floors').status).toBe('unknown');
        expect(row(buildCapacityComparison(envelope(), measured, {})!, 'floors').status).toBe('unknown');
        expect(row(buildCapacityComparison(envelope(), measured, { maxFloors: null })!, 'floors').status)
            .toBe('unknown');
    });
});
