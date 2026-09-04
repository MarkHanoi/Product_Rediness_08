// §NL-VOORRANGSREGELS — precedence applied BEFORE answering; `not-evaluated` blocks "none apply";
// pending besluiten are a forward view, never applied; same-day conflicts are named, never picked.

import { describe, it, expect } from 'vitest';
import type { RuleState } from '@pryzm/schemas';
import {
    applyNlVoorrang,
    applyNlVoorrangAll,
    nlVoorrangRegelingRef,
    nlVoorrangStamped,
    nlVoorrangToRuleState,
    type NlVoorrangsregel,
    type NlWijzigingsbesluitenRead,
} from '../src/rulepacks/nlVoorrangsregels.js';

const REF = {
    country: 'NL',
    authority: 'Gemeente Amsterdam',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.0363.GA2102PBPGST-VG02',
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

const LVBB_REF = { ...REF, dataset: 'omgevingsplan (LVBB / Presenteren v8)', plan_id: null } as const;

/** The tijdelijk-deel reading: maximum bouwhoogte 12 m above peil (a resolved C2). */
const TD_HEIGHT: RuleState = {
    rule: 'C2',
    status: 'resolved',
    reachability: 'source-complete',
    value: 12,
    unit: 'm',
    datum: 'peil',
    provenance: 'pipeline-extracted',
    ref: REF,
};

const override = (value: number, besluitId: string, inWerkingOp: string, applicability: NlVoorrangsregel['applicability'] = 'applies'): NlVoorrangsregel => ({
    besluitId,
    inWerkingOp,
    rule: 'C2',
    applicability,
    override: { ...TD_HEIGHT, value, ref: LVBB_REF },
    scopeVerbatim: 'bouwen van een hoofdgebouw',
});

const read = (regels: NlVoorrangsregel[], complete = true): NlWijzigingsbesluitenRead => ({
    source: 'dso-presenteren-v8',
    readAt: '2026-09-04T10:00:00Z',
    gemeenteCode: '0363',
    regelingWork: '/akn/nl/act/gm0363/2024/omgevingsplan',
    regels,
    complete,
});

describe('applyNlVoorrang — the honest state when nothing was read', () => {
    it('read === null → overrides-not-checked, the tijdelijk-deel state stands, why says so', () => {
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: null, targetDate: '2026-09-04' });
        expect(r.precedence).toBe('overrides-not-checked');
        expect(r.operative).toBe(TD_HEIGHT);
        expect(r.appliedBesluit).toBeNull();
        expect(r.why).toContain('overrides not checked');
    });

    it('a malformed target date cannot ask the temporal question → unchecked', () => {
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([]), targetDate: '04/09/2026' });
        expect(r.precedence).toBe('overrides-not-checked');
        expect(r.why).toContain('not an ISO');
    });
});

describe('applyNlVoorrang — applicability is the engine output, and not-evaluated blocks "none apply"', () => {
    it('an in-force besluit for this rule with applicability not-evaluated → unchecked, id named', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(15, '/akn/nl/act/gm0363/2025/omgevingsplan/nld@2025-03-01;3', '2025-03-01', 'not-evaluated')]),
            targetDate: '2026-09-04',
        });
        expect(r.precedence).toBe('overrides-not-checked');
        expect(r.unevaluated).toEqual(['/akn/nl/act/gm0363/2025/omgevingsplan/nld@2025-03-01;3']);
        expect(r.operative).toBe(TD_HEIGHT);
    });

    it('besluiten that do not apply here, complete read → checked-none-apply; the tijdelijk deel is operative', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(15, 'B1', '2025-03-01', 'does-not-apply')]),
            targetDate: '2026-09-04',
        });
        expect(r.precedence).toBe('overrides-checked-none-apply');
        expect(r.operative).toBe(TD_HEIGHT);
        expect(r.superseded).toEqual([]);
    });

    it('an INCOMPLETE read cannot declare "none apply" → stays unchecked', () => {
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([], false), targetDate: '2026-09-04' });
        expect(r.precedence).toBe('overrides-not-checked');
        expect(r.why).toContain('INCOMPLETE');
    });

    it('a besluit for ANOTHER rule is ignored for this one', () => {
        const other: NlVoorrangsregel = { ...override(3, 'B-storeys', '2025-01-01'), rule: 'C3' };
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([other]), targetDate: '2026-09-04' });
        expect(r.precedence).toBe('overrides-checked-none-apply');
    });
});

describe('applyNlVoorrang — lex posterior, pending changes, conflicts', () => {
    it('one applicable in-force besluit → applied; its override is operative; the tijdelijk deel is superseded', () => {
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([override(15, 'B1', '2025-03-01')]), targetDate: '2026-09-04' });
        expect(r.precedence).toBe('overrides-checked-applied');
        expect(r.appliedBesluit).toBe('B1');
        expect(r.operative.status === 'resolved' && r.operative.value).toBe(15);
        expect(r.superseded).toEqual([TD_HEIGHT]);
        expect(r.conflict).toBeNull();
    });

    it('two applicable besluiten on different dates → the LATER wins; the earlier is superseded too', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(15, 'B1', '2025-03-01'), override(18, 'B2', '2026-01-15')]),
            targetDate: '2026-09-04',
        });
        expect(r.appliedBesluit).toBe('B2');
        expect(r.operative.status === 'resolved' && r.operative.value).toBe(18);
        expect(r.superseded.length).toBe(2);
    });

    it('a besluit in force AFTER the target date is PENDING — returned, never applied', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(18, 'B-future', '2027-01-01')]),
            targetDate: '2026-09-04',
        });
        expect(r.precedence).toBe('overrides-checked-none-apply');
        expect(r.operative).toBe(TD_HEIGHT);
        expect(r.pending.map((p) => p.besluitId)).toEqual(['B-future']);
        expect(r.why).toContain('pending change');
    });

    it('the temporal question is answered for the TARGET date: the same besluit is applied on a later date', () => {
        const rd = read([override(18, 'B-future', '2027-01-01')]);
        const before = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: rd, targetDate: '2026-12-31' });
        const after = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: rd, targetDate: '2027-01-01' });
        expect(before.appliedBesluit).toBeNull();
        expect(after.appliedBesluit).toBe('B-future');
    });

    it('two applicable besluiten on the SAME day with DIFFERENT content → a named conflict, unrecovered/semantic', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(15, 'B-a', '2025-03-01'), override(16, 'B-b', '2025-03-01')]),
            targetDate: '2026-09-04',
        });
        expect(r.conflict).toEqual(['B-a', 'B-b']);
        expect(r.appliedBesluit).toBeNull();
        expect(r.operative.status).toBe('unrecovered');
        if (r.operative.status === 'unrecovered') {
            expect(r.operative.failure).toBe('semantic');
            expect(r.operative.mechanism).toBe('present');
            expect(r.operative.stoppedAt).toContain('B-a vs B-b');
        }
    });

    it('two applicable besluiten on the same day with IDENTICAL content are not a conflict', () => {
        const r = applyNlVoorrang({
            tijdelijkDeel: TD_HEIGHT,
            read: read([override(15, 'B-a', '2025-03-01'), override(15, 'B-b', '2025-03-01')]),
            targetDate: '2026-09-04',
        });
        expect(r.conflict).toBeNull();
        expect(r.precedence).toBe('overrides-checked-applied');
    });

    it('a besluit with a malformed date cannot be placed on the time axis → treated as unevaluated', () => {
        const r = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([override(15, 'B-bad', '1 maart 2025')]), targetDate: '2026-09-04' });
        expect(r.precedence).toBe('overrides-not-checked');
        expect(r.unevaluated).toEqual(['B-bad']);
    });
});

describe('composition — regeling ref, stamp, B5 projection', () => {
    it('applyNlVoorrangAll preserves order and length', () => {
        const rs = applyNlVoorrangAll({ tijdelijkDeel: [TD_HEIGHT, { ...TD_HEIGHT, rule: 'C3', value: 4, unit: 'storeys' }], read: null, targetDate: '2026-09-04' });
        expect(rs.length).toBe(2);
        expect(rs[1]!.operative.rule).toBe('C3');
    });

    it('the regeling ref lists EVERY besluit read, parses the AKN work, and reads from the LVBB layer when applied', () => {
        const rd = read([override(15, 'B1', '2025-03-01'), override(3, 'B2', '2025-06-01', 'does-not-apply')]);
        const res = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: rd, targetDate: '2026-09-04' });
        const ref = nlVoorrangRegelingRef({ read: rd, planId: REF.plan_id, resolution: res });
        expect(ref.wijzigingsbesluitenConsulted).toEqual(['B1', 'B2']);
        expect(ref.akn?.gemeenteCode).toBe('0363');
        expect(ref.readFrom).toBe('dso-lvbb-omgevingsplan');
        expect(ref.precedence).toBe('overrides-checked-applied');
    });

    it('stamped: an unchecked legally-grounded answer carries correctnessRisk; a checked one does not', () => {
        const unchecked = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: null, targetDate: '2026-09-04' });
        const checked = applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([]), targetDate: '2026-09-04' });
        expect(nlVoorrangStamped({ read: null, planId: REF.plan_id, resolution: unchecked }).correctnessRisk).toBe(true);
        expect(nlVoorrangStamped({ read: read([]), planId: REF.plan_id, resolution: checked }).correctnessRisk).toBe(false);
    });

    it('B5: unchecked → unrecovered/inaccessible (the ONE retryable label); none-apply → resolved; applied → resolved with the id; conflict → semantic', () => {
        const unchecked = nlVoorrangToRuleState(applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: null, targetDate: '2026-09-04' }), REF);
        expect(unchecked.rule).toBe('B5');
        expect(unchecked.status === 'unrecovered' && unchecked.failure).toBe('inaccessible');

        const none = nlVoorrangToRuleState(applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([]), targetDate: '2026-09-04' }), REF);
        expect(none.status).toBe('resolved');
        expect(none.status === 'resolved' && String(none.value)).toContain('no site-specific override');

        const applied = nlVoorrangToRuleState(applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([override(15, 'B1', '2025-03-01')]), targetDate: '2026-09-04' }), REF);
        expect(applied.status === 'resolved' && applied.value).toBe('B1');

        const conflict = nlVoorrangToRuleState(
            applyNlVoorrang({ tijdelijkDeel: TD_HEIGHT, read: read([override(15, 'B-a', '2025-03-01'), override(16, 'B-b', '2025-03-01')]), targetDate: '2026-09-04' }),
            REF,
        );
        expect(conflict.status === 'unrecovered' && conflict.failure).toBe('semantic');
    });
});
