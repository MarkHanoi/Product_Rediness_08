/**
 * §26.6.2 (L-13046, founder 2026-09-07) — THE SETBACK REGISTER: *"I WANT TO KNOW FOR EVERY VECTOR
 * OF THE PERIMETER THE SETBACK — AND WHY — AND IT SHOULD BE SELECTABLE AND HYPERLINK."*
 *
 * ⛔ THE ONE PROPERTY THESE ARMS DEFEND: WHERE AN EDGE'S CLASS IS UNKNOWN, THE ROW SAYS SO — PER
 * EDGE — AND NEVER INFERS ONE (C19 §10.1 pending). Every other arm is a different fact and gets a
 * different sentence; none of them ever collapses into a dash or a zero.
 */

import { describe, expect, it } from 'vitest';
import { buildParcelLawModel } from '../parcel/parcelLawModel';
import { buildSetbackRegister, SETBACK_REGISTER_LEDE } from '../setbackRegisterModel';

const RECT = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 20 }, { x: 0, z: 20 }];

/** A setback-governed determination: three per-class rows, the front one cited. */
function setbackEnvelope(over: Record<string, unknown> = {}): never {
    return {
        insetPolygon: [{ x: 3, z: 3 }, { x: 37, z: 3 }, { x: 37, z: 17 }, { x: 3, z: 17 }],
        insetAreaM2: 476, maxHeight_m: 18, farLimitedHeight_m: null, maxFloors: 6, maxFAR: null,
        maxCoverage: null, maxVolumeM3: 8568, footprintIsUpperBound: false, confidence: 'structured',
        granularity: 'parcel', status: 'ok', refusal: null, zoneCode: 'R1',
        derivation: [
            { constraint: 'setback.front', value: 5, source: 'pack', ordinanceRef: 'Art. 12.1', fieldProvenance: 'published-structured' },
            { constraint: 'setback.side', value: 3, source: 'pack', ordinanceRef: null, fieldProvenance: 'estimated' },
            { constraint: 'setback.rear', value: 6, source: 'pack', ordinanceRef: 'Art. 12.3', fieldProvenance: 'ordinance-pdf' },
        ],
        caveats: [], tiers: [], permittedUse: [], ...over,
    } as never;
}

/** Barcelona 13a: the DEPTH is the rule; no per-class setbacks exist. */
function alignmentEnvelope(over: Record<string, unknown> = {}): never {
    return setbackEnvelope({
        zoneCode: '13a',
        derivation: [
            { constraint: 'alignment.depth', value: 15, source: 'bcn-pgm', ordinanceRef: 'PGM Art. 242.2', fieldProvenance: 'published-structured' },
            { constraint: 'alignment.offset', value: 0, source: 'bcn-pgm', ordinanceRef: 'PGM Art. 242.2', fieldProvenance: 'published-structured' },
        ],
        ...over,
    });
}

const model = (edgeClassifications: readonly string[] | undefined, envelope: unknown) =>
    buildParcelLawModel({ parcelRing: RECT, edgeClassifications, identity: null, envelope: envelope as never });

describe('§26.6.2 — one row per edge, in ring order, each with its own link', () => {
    it('lists every edge with its length, its class as recorded, and the edge:<n> subject', () => {
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], setbackEnvelope()));
        expect(r.kind).toBe('rows');
        if (r.kind !== 'rows') return;
        expect(r.rows.map((x) => x.label)).toEqual(['Edge 1', 'Edge 2', 'Edge 3', 'Edge 4']);
        expect(r.rows.map((x) => x.lengthM)).toEqual([40, 20, 40, 20]);
        expect(r.rows.map((x) => x.edgeClass)).toEqual(['front', 'side', 'rear', 'side']);
        expect(r.rows.map((x) => x.highlightSubject)).toEqual(['edge:0', 'edge:1', 'edge:2', 'edge:3']);
        expect(r.rows.every((x) => x.availability.available)).toBe(true);
        expect(r.lede).toBe(SETBACK_REGISTER_LEDE);
        expect(r.summary).toContain('4 edges');
        expect(r.summary).toContain('4 classified');
        expect(r.anyClassUnknown).toBe(false);
    });

    it('⭐ APPLIED — the class\'s value with ITS OWN citation (C58 §1.3 per constraint), and both numbers in the sentence', () => {
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], setbackEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        const [front, side, rear] = r.rows;
        expect(front!.verdict).toMatchObject({ kind: 'applied', constraint: 'setback.front', valueM: 5, ordinanceRef: 'Art. 12.1' });
        expect(front!.verdict.sentence).toContain('Edge 1 (front): 5.0 m setback applies');
        expect(front!.verdict.sentence).toContain('Art. 12.1');
        expect(front!.verdict.sentence).toContain('published-structured');
        // A value with no citation is STATED as uncited, never dressed with the front's citation.
        expect(side!.verdict).toMatchObject({ kind: 'applied', constraint: 'setback.side', valueM: 3, ordinanceRef: null });
        expect(side!.verdict.sentence).toContain('no citation held in the derivation trace');
        expect(rear!.verdict).toMatchObject({ kind: 'applied', constraint: 'setback.rear', valueM: 6, ordinanceRef: 'Art. 12.3' });
    });

    it('NOT DERIVED — the class is known but the pack produced no row for it; nothing is inferred', () => {
        const env = setbackEnvelope({
            derivation: [{ constraint: 'setback.front', value: 5, source: 'pack', ordinanceRef: 'Art. 12.1', fieldProvenance: 'published-structured' }],
        });
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], env));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows[0]!.verdict.kind).toBe('applied');
        expect(r.rows[1]!.verdict).toMatchObject({ kind: 'not-derived', constraint: 'setback.side' });
        expect(r.rows[1]!.verdict.sentence).toContain('not derived');
        expect(r.rows[1]!.verdict.sentence).toContain('does not infer');
        expect(r.rows[2]!.verdict).toMatchObject({ kind: 'not-derived', constraint: 'setback.rear' });
    });
});

describe('§26.6.2 — ⛔ an UNKNOWN class is said PER EDGE and never inferred (C19 §10.1 pending)', () => {
    it('NOT RECORDED — every row says nobody classified it, and the register flags the §10.1 note', () => {
        const r = buildSetbackRegister(model(undefined, setbackEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        for (const row of r.rows) {
            expect(row.edgeClass).toBe('not-recorded');
            expect(row.classText).toContain('not recorded');
            expect(row.verdict.kind).toBe('class-unknown');
            expect(row.verdict.sentence).toContain('not recorded');
            expect(row.verdict.sentence).toContain('will not infer');
            // ⛔ No number reaches an unknown edge — not even the front setback the pack holds.
            expect(row.verdict.sentence).not.toContain('5.0 m');
        }
        expect(r.anyClassUnknown).toBe(true);
        expect(r.summary).toContain('4 class unknown');
    });

    it('RECORDED AS UNCLASSIFIED is a DIFFERENT fact from never recorded — and says so', () => {
        const r = buildSetbackRegister(model(['front', 'unclassified', 'rear', 'unclassified'], setbackEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows[0]!.verdict.kind).toBe('applied');
        expect(r.rows[1]!.edgeClass).toBe('unclassified');
        expect(r.rows[1]!.classText).toContain('recorded as unclassified');
        expect(r.rows[1]!.verdict.kind).toBe('class-unknown');
        expect(r.rows[1]!.verdict.sentence).toContain('recorded as undecided');
        expect(r.rows[1]!.verdict.sentence).not.toContain('not recorded');
        expect(r.summary).toContain('2 classified');
        expect(r.summary).toContain('2 class unknown');
    });

    it('a WRONG-LENGTH array is "nobody classified" for every edge — the schema `[]` default', () => {
        const r = buildSetbackRegister(model(['front'], setbackEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows.every((x) => x.edgeClass === 'not-recorded')).toBe(true);
    });
});

describe('§26.6.2 — an ALIGNMENT-GOVERNED zone (Barcelona 13a): the depth is the rule, and the register says so per edge', () => {
    it('the FRONT edge states the depth measured FROM it and the offset; every other edge states that NO setback is derived from it', () => {
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], alignmentEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        const [front, side, rear] = r.rows;
        expect(front!.verdict).toMatchObject({ kind: 'alignment-governed', depthM: 15, offsetM: 0, ordinanceRef: 'PGM Art. 242.2' });
        expect(front!.verdict.sentence).toContain('measured from this edge');
        expect(front!.verdict.sentence).toContain('15.0 m');
        expect(front!.verdict.sentence).toContain('alignment offset of 0.0 m');
        expect(front!.verdict.sentence).toContain('PGM Art. 242.2');
        expect(side!.verdict.kind).toBe('alignment-governed');
        expect(side!.verdict.sentence).toContain('no setback is derived from this edge');
        expect(side!.verdict.sentence).toContain('measured from the front alignment, not from here');
        expect(rear!.verdict.sentence).toContain('no setback is derived from this edge');
        expect(r.summary).toContain('alignment-governed zone');
    });

    it('with NO offset row the front edge says no numeric offset was derived — never 0 by default', () => {
        const env = alignmentEnvelope({
            derivation: [{ constraint: 'alignment.depth', value: 15, source: 'bcn-pgm', ordinanceRef: 'PGM Art. 242.2', fieldProvenance: 'published-structured' }],
        });
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], env));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows[0]!.verdict).toMatchObject({ kind: 'alignment-governed', offsetM: null });
        expect(r.rows[0]!.verdict.sentence).toContain('no numeric offset was derived');
    });

    it('an unknown-class edge in an alignment zone is STILL class-unknown — PRYZM does not decide which edge is the alignment', () => {
        const r = buildSetbackRegister(model(undefined, alignmentEnvelope()));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows.every((x) => x.verdict.kind === 'class-unknown')).toBe(true);
    });
});

describe('§26.6.2 — the determination\'s own states reach every row (C58 §1.13 / §1.20)', () => {
    it('NO DETERMINATION — the edges are still listed with what IS known, and each row says it is an absence, not a zero', () => {
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], null));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows).toHaveLength(4);
        expect(r.rows[0]!.edgeClass).toBe('front');
        expect(r.rows.every((x) => x.verdict.kind === 'no-determination')).toBe(true);
        expect(r.rows[0]!.verdict.sentence).toContain('an absence, not a zero');
        expect(r.summary).toContain('no determination yet');
    });

    it('REFUSED — every row carries the refusal headline and no number', () => {
        const env = setbackEnvelope({
            status: 'not-applicable',
            refusal: { code: 'no-rule-pack', headline: 'PRYZM has not encoded this zone', detail: 'd', ordinanceRef: null, legallyGrounded: false },
            insetPolygon: [], insetAreaM2: 0, maxHeight_m: null, maxFloors: null, derivation: [],
        });
        const r = buildSetbackRegister(model(['front', 'side', 'rear', 'side'], env));
        if (r.kind !== 'rows') throw new Error('rows expected');
        expect(r.rows.every((x) => x.verdict.kind === 'refused')).toBe(true);
        expect(r.rows[0]!.verdict.sentence).toContain('PRYZM has not encoded this zone');
        expect(r.rows[0]!.verdict.sentence).toContain('C58 §1.13');
        expect(r.summary).toContain('determination refused');
    });

    it('NO PARCEL — no rows, and a sentence that says it is a missing READ', () => {
        const r = buildSetbackRegister(buildParcelLawModel({ parcelRing: null, edgeClassifications: undefined, identity: null, envelope: setbackEnvelope() }));
        expect(r.kind).toBe('no-parcel');
        expect(r.rows).toHaveLength(0);
        if (r.kind === 'no-parcel') expect(r.sentence).toContain('missing READ');
    });
});
