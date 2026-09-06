// §PARCEL-LAW-UNRESOLVED — the WORDS the "Why these numbers?" fold puts in a citation slot.
//
// These tests exist because the six cases in `complianceCitationSlots`' header were, before this
// slice, THREE renderings: a PUB pill, an EST pill and nothing. The three that collapsed into
// "nothing" are the ones that change what a reader believes about real land, so each is pinned
// here by the sentence it prints, not by the branch it takes.

import { describe, it, expect } from 'vitest';
import {
    citationFoldHasContent,
    describeCitationFoldCaveats,
    describeCitationSlot,
    describeUnresolvedSlot,
} from '../complianceCitationSlots';
import type { ComplianceReport, ComplianceReportRow, ComplianceUnresolvedRow } from '@pryzm/site-parcel-data';

const mkRow = (over: Partial<ComplianceReportRow> = {}): ComplianceReportRow => ({
    constraint: 'maxFAR',
    label: 'Max FAR',
    valueText: '2.00',
    zoneCode: 'P2',
    source: 'plandata-dk',
    provenance: 'published-structured',
    ordinanceRef: 'Plandata §4.3',
    isEstimate: false,
    hasStatedValue: true,
    ...over,
}) as ComplianceReportRow;

const mkReport = (over: Partial<ComplianceReport> = {}): ComplianceReport => ({
    confidence: 'estimated-ruleset',
    status: 'ok',
    rows: [],
    buildableFootprintM2: 355,
    maxHeightM: 12,
    maxFAR: null,
    maxGrossFloorAreaM2: null,
    estimatedRowCount: 0,
    hasAnyEstimate: false,
    unresolvedRows: [],
    unresolvedRowCount: 0,
    ...over,
}) as ComplianceReport;

const unresolved = (reason: ComplianceUnresolvedRow['reason'], id = 'maxFAR'): ComplianceUnresolvedRow =>
    ({ id, label: 'Max FAR', reason });

describe('§PARCEL-LAW-UNRESOLVED describeCitationSlot — the resolved ladder, order preserved', () => {
    it('a published figure keeps the strongest affordance', () => {
        const s = describeCitationSlot(mkRow());
        expect(s.pill).toBe('PUB');
        expect(s.tone).toBe('published');
        expect(s.note).toBeNull();
    });

    it('an estimate is badged EST and never reads as authority', () => {
        const s = describeCitationSlot(mkRow({ isEstimate: true, provenance: 'estimated' }));
        expect(s.pill).toBe('EST');
        expect(s.title).toContain('ESTIMATE');
    });

    it('§PACK-CONFIDENCE-CEILING (L-665): pipeline-extracted outranks isEstimate and NEVER shows PUB', () => {
        // `isEstimate` is `fieldProvenance === 'estimated'` ONLY, so a machine-read value is falsy
        // there and would otherwise fall to the green PUB pill — the strongest affordance the card
        // has, on the weakest real provenance there is.
        const s = describeCitationSlot(mkRow({ provenance: 'pipeline-extracted', isEstimate: false }));
        expect(s.pill).toBe('⚠ MACHINE');
        expect(s.tone).toBe('machine');
        expect(s.title).toContain('our error');
    });

    it('a row that resolved to NO VALUE is not badged "published" — that would assert a figure exists', () => {
        const s = describeCitationSlot(mkRow({ hasStatedValue: false, valueText: '—' }));
        expect(s.pill).toBe('STATES NONE');
        expect(s.tone).toBe('stated-empty');
        // It names WHO was consulted, because "Plandata states nothing" is a real finding...
        expect(s.title).toContain('plandata-dk was consulted');
        // ...and it still refuses the "therefore unlimited" completion.
        expect(s.title).toContain('not a finding that the constraint is unlimited');
    });

    it('a MACHINE-read source that states nothing names the pipeline, not the publisher', () => {
        const s = describeCitationSlot(mkRow({ hasStatedValue: false, provenance: 'pipeline-extracted' }));
        expect(s.tone).toBe('stated-empty');
        expect(s.title).toContain('extraction pipeline');
        expect(s.title).not.toContain('plandata-dk');
    });
});

describe('§PARCEL-LAW-UNRESOLVED describeUnresolvedSlot — the two absences, said out loud', () => {
    it('a slot nothing addressed says MISSING LOOKUP and refuses the "unlimited" reading (L-616)', () => {
        const s = describeUnresolvedSlot(unresolved('no-value'));
        expect(s.pill).toBe('NOT DERIVED');
        expect(s.tone).toBe('unfilled');
        expect(s.note).toContain('MISSING LOOKUP');
        expect(s.note).toContain('NOT a finding that the zone sets no limit');
    });

    it('a figure with no derivation entry is the WORSE arm and is badged red (C58 §1.3)', () => {
        const s = describeUnresolvedSlot(unresolved('value-without-citation'));
        expect(s.pill).toBe('UNCITED');
        expect(s.tone).toBe('uncited');
        expect(s.note).toContain('no source behind it');
        expect(s.title).toContain('C58 §1.3');
    });

    it('the two arms never render the same pill — that collapse is the defect being closed', () => {
        expect(describeUnresolvedSlot(unresolved('no-value')).pill)
            .not.toBe(describeUnresolvedSlot(unresolved('value-without-citation')).pill);
    });

    it('an unresolved slot NEVER carries a value', () => {
        for (const reason of ['no-value', 'value-without-citation'] as const) {
            const s = describeUnresolvedSlot(unresolved(reason));
            expect(s.note).not.toMatch(/\d+(\.\d+)?\s*(m|m²|%)/);
        }
    });
});

describe('§PARCEL-LAW-UNRESOLVED citationFoldHasContent — the fold must appear when it is MOST needed', () => {
    it('a report with resolved rows shows the fold', () => {
        expect(citationFoldHasContent(mkReport({ rows: [mkRow()] }))).toBe(true);
    });

    it('a report with ONLY unresolved slots STILL shows the fold', () => {
        // The old guard was `rows.length === 0 -> render nothing`, which hid the fold in exactly
        // the case where the reader needs to be told the determination is a hole.
        expect(citationFoldHasContent(mkReport({
            unresolvedRows: [unresolved('no-value')],
            unresolvedRowCount: 1,
        }))).toBe(true);
    });

    it('no report and a genuinely empty report show nothing', () => {
        expect(citationFoldHasContent(null)).toBe(false);
        expect(citationFoldHasContent(mkReport())).toBe(false);
    });
});

describe('§PARCEL-LAW-UNRESOLVED describeCitationFoldCaveats — quantities stay their own shape', () => {
    it('the ESTIMATED fraction keeps rows.length as its denominator (L-526)', () => {
        const lines = describeCitationFoldCaveats(mkReport({
            rows: [mkRow({ isEstimate: true }), mkRow()],
            estimatedRowCount: 1,
            hasAnyEstimate: true,
            unresolvedRows: [unresolved('no-value'), unresolved('no-value', 'maxCoverage')],
            unresolvedRowCount: 2,
        }));
        // 2 unresolved slots exist and the fraction is still "1 of 2 RESOLVED".
        expect(lines[0]).toBe(
            '1 of 2 resolved value(s) are ESTIMATED — not an authoritative determination.',
        );
    });

    it('the missing-row sentence says an empty row is OUR gap, not the ordinance being silent', () => {
        const lines = describeCitationFoldCaveats(mkReport({
            unresolvedRows: [unresolved('no-value'), unresolved('no-value', 'maxCoverage')],
            unresolvedRowCount: 2,
        }));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('2 row(s)');
        expect(lines[0]).toContain('never that the rule is absent');
    });

    it('uncited figures get their OWN sentence, counted apart from the missing ones', () => {
        const lines = describeCitationFoldCaveats(mkReport({
            unresolvedRows: [unresolved('value-without-citation'), unresolved('no-value', 'maxCoverage')],
            unresolvedRowCount: 2,
        }));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('1 row(s) the card shows have NO value');
        expect(lines[1]).toContain('1 row(s) show a figure this determination cannot source');
    });

    it('a complete, fully published determination says nothing extra', () => {
        expect(describeCitationFoldCaveats(mkReport({ rows: [mkRow()] }))).toEqual([]);
    });
});
