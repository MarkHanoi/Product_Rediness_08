// §RESI-ORCH-COST (lane RESI-ORCHESTRATOR, 2026-09-03) — the envelope-stage
// indicative-cost fold, pinned at the RENDER-OUTPUT level.
//
// WHAT THESE PIN, AND WHY EACH ONE IS A DEFECT SOMEBODY ALREADY SHIPPED SOMEWHERE:
//
//   1. A refusal and an emptiness are DIFFERENT `data-state` values. The fold is
//      never silently absent for a state that has something to say (L-1650 root
//      cause 2), and the <summary> carries the fact so a collapsed card cannot be
//      misread as a clean figure (§UX1-PROSE-ALTITUDE).
//   2. A missing GFA produces WORDS, never a zero. The card's GFA is already null
//      when the storey count was not derived; a cost of 0 against a real €/m²
//      would render as "this is cheap" rather than "we do not know".
//   3. A missing typology produces WORDS, never a default group. Barcelona's own
//      table spans a factor of nine.
//   4. The estimator's mandatory statement and the study caveat are BOTH present
//      whenever a figure is. A number without its provenance is the thing this
//      whole section exists to avoid.
//   5. The study area is the NAMED fourth proxy and contributes NO take-off lines
//      — an empty `lineCodes` is the fact "nothing was measured", asserted.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_ICIO_2026,
    estimateBuildingCost,
    resolveBuildingCostModels,
    type ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import {
    buildIndicativeCostFold,
    envelopeStudyBuiltArea,
    ENVELOPE_COST_SECTION_TESTID,
    ENVELOPE_COST_GROUP_SELECT_TESTID,
    ENVELOPE_COST_AMOUNT_TESTID,
    ENVELOPE_STUDY_AREA_CAVEAT,
} from '../envelopeCostSection';

const COVERED: ResolvedBuildingCostModels = {
    tier: 'jurisdiction',
    models: [ES_BARCELONA_ICIO_2026],
    statement: 'Estimate from Barcelona ICIO 2026, matched at the jurisdiction level.',
};

const NO_CHOICE = { groupId: null, correctionId: null } as const;

function stateOf(html: string): string | null {
    const m = /data-state="([^"]*)"/.exec(html);
    return m ? (m[1] ?? null) : null;
}

describe('envelopeStudyBuiltArea', () => {
    it('refuses a null / zero / negative GFA rather than manufacturing an area', () => {
        expect(envelopeStudyBuiltArea(null, 4, 200)).toBeNull();
        expect(envelopeStudyBuiltArea(undefined, 4, 200)).toBeNull();
        expect(envelopeStudyBuiltArea(0, 4, 200)).toBeNull();
        expect(envelopeStudyBuiltArea(-10, 4, 200)).toBeNull();
        expect(envelopeStudyBuiltArea(Number.NaN, 4, 200)).toBeNull();
    });

    it('names itself as the study proxy, carries the caveat, and claims no take-off lines', () => {
        const a = envelopeStudyBuiltArea(800, 4, 200);
        expect(a).not.toBeNull();
        expect(a!.proxy).toBe('envelope-study-gfa');
        expect(a!.areaM2).toBe(800);
        // The multiplication the reader can check.
        expect(a!.basis).toContain('200 m²');
        expect(a!.basis).toContain('4 derived storeys');
        expect(a!.caveat).toBe(ENVELOPE_STUDY_AREA_CAVEAT);
        // Nothing was measured — and the empty list is that fact, asserted.
        expect(a!.lineCodes).toEqual([]);
    });

    it('still produces an area when the storey/footprint detail is unavailable, without inventing one', () => {
        const a = envelopeStudyBuiltArea(500, null, null);
        expect(a).not.toBeNull();
        expect(a!.basis).toBe('buildable-envelope study GFA');
        expect(a!.basis).not.toMatch(/storey/);
    });

    it('singularises one storey', () => {
        expect(envelopeStudyBuiltArea(200, 1, 200)!.basis).toContain('1 derived storey');
    });
});

describe('buildIndicativeCostFold — the four arms', () => {
    it('no-module: prints the RESOLVER\'s own sentence, and refuses to substitute a neighbour', () => {
        const none = resolveBuildingCostModels({
            jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'not-asked',
        });
        const html = buildIndicativeCostFold(none, envelopeStudyBuiltArea(800, 4, 200), NO_CHOICE, null);
        expect(stateOf(html)).toBe('no-module');
        expect(html).toContain(ENVELOPE_COST_SECTION_TESTID);
        // The resolver's sentence, not a re-write of it.
        expect(html).toContain('No parcel location has been set');
        expect(html).toMatch(/wrong number, not an approximate one/);
        // No figure, no select, no currency anywhere.
        expect(html).not.toContain(ENVELOPE_COST_AMOUNT_TESTID);
        expect(html).not.toContain(ENVELOPE_COST_GROUP_SELECT_TESTID);
    });

    it('no-module: an AMBIGUOUS binding is a different sentence from an unset one', () => {
        const ambiguous = resolveBuildingCostModels({
            jurisdictionId: null, countryCode: 'es', regionKey: null, resolution: 'ambiguous',
        });
        const html = buildIndicativeCostFold(ambiguous, envelopeStudyBuiltArea(800, 4, 200), NO_CHOICE, null);
        expect(stateOf(html)).toBe('no-module');
        expect(html).toContain('Two jurisdiction registrations claim this parcel');
    });

    it('no-gfa: says WHY in words — never a zero, never a blank section', () => {
        const html = buildIndicativeCostFold(COVERED, null, NO_CHOICE, null);
        expect(stateOf(html)).toBe('no-gfa');
        // The summary carries the fact for a user who never unfolds.
        expect(html).toMatch(/<summary[^>]*>Indicative cost — no buildable area to price yet/);
        expect(html).toMatch(/did not derive a storey count/);
        // It states that a module DOES cover this place — the two facts are separate.
        expect(html).toContain(ES_BARCELONA_ICIO_2026.displayName);
        // ⛔ No fabricated figure of any kind.
        expect(html).not.toContain(ENVELOPE_COST_AMOUNT_TESTID);
        expect(html).not.toMatch(/\b0 EUR\b/);
    });

    it('no-typology: offers the published table and refuses to pick a group', () => {
        const area = envelopeStudyBuiltArea(800, 4, 200);
        const est = estimateBuildingCost(ES_BARCELONA_ICIO_2026, null, area, null);
        expect(est).toBeNull(); // the engine's own refusal, restated here for the record
        const html = buildIndicativeCostFold(COVERED, area, NO_CHOICE, est);
        expect(stateOf(html)).toBe('no-typology');
        expect(html).toContain(ENVELOPE_COST_GROUP_SELECT_TESTID);
        expect(html).toMatch(/will not guess/);
        // The un-chosen option is the selected one — no silent default typology.
        expect(html).toMatch(/<option value=""\s+selected>— not chosen —<\/option>/);
        expect(html).not.toContain(ENVELOPE_COST_AMOUNT_TESTID);
    });

    it('estimated: renders the figure WITH the estimator\'s mandatory statement and the study caveat', () => {
        const area = envelopeStudyBuiltArea(800, 4, 200);
        const group = ES_BARCELONA_ICIO_2026.groups[0]!;
        const est = estimateBuildingCost(ES_BARCELONA_ICIO_2026, group.groupId, area, null);
        expect(est).not.toBeNull();
        const html = buildIndicativeCostFold(
            COVERED, area, { groupId: group.groupId, correctionId: null }, est,
        );
        expect(stateOf(html)).toBe('estimated');
        expect(html).toContain(ENVELOPE_COST_AMOUNT_TESTID);
        // The word ESTIMATE is spelled out beside the figure, not in a footnote.
        expect(html).toMatch(/Estimate — not a quotation, not a price/);
        // The engine's statement travels with the number, and it carries the caveat
        // because the caveat is built into the area the engine multiplied.
        expect(html).toContain('THIS IS AN ESTIMATE');
        expect(html).toContain('nothing has been drawn and nothing has been measured');
        // Provenance and exclusions are present, not truncated away.
        expect(html).toContain(ES_BARCELONA_ICIO_2026.provenance.publisher);
        expect(html).toContain(ES_BARCELONA_ICIO_2026.provenance.priceDate);
        expect(html).toContain(`What this €/m² does NOT include (${ES_BARCELONA_ICIO_2026.notCovered.length})`);
    });

    it('estimated: the group choice, not a default, drives the rate — and it moves the answer', () => {
        const area = envelopeStudyBuiltArea(1000, 5, 200);
        const dearest = ES_BARCELONA_ICIO_2026.groups[0]!;
        const cheapest = ES_BARCELONA_ICIO_2026.groups[ES_BARCELONA_ICIO_2026.groups.length - 1]!;
        const a = estimateBuildingCost(ES_BARCELONA_ICIO_2026, dearest.groupId, area, null)!;
        const b = estimateBuildingCost(ES_BARCELONA_ICIO_2026, cheapest.groupId, area, null)!;
        expect(a.amount).not.toBe(b.amount);
        // The spread is the whole reason there is no default. Assert it is large,
        // without hard-coding the published ratio (that belongs to the module's
        // own suite, which would then be the one place that fails if it changes).
        expect(Math.max(a.amount, b.amount) / Math.min(a.amount, b.amount)).toBeGreaterThan(2);
    });

    it('every arm renders exactly one fold with the section testid', () => {
        const area = envelopeStudyBuiltArea(800, 4, 200);
        const group = ES_BARCELONA_ICIO_2026.groups[0]!;
        const arms = [
            buildIndicativeCostFold(
                resolveBuildingCostModels(null), area, NO_CHOICE, null,
            ),
            buildIndicativeCostFold(COVERED, null, NO_CHOICE, null),
            buildIndicativeCostFold(COVERED, area, NO_CHOICE, null),
            buildIndicativeCostFold(
                COVERED, area, { groupId: group.groupId, correctionId: null },
                estimateBuildingCost(ES_BARCELONA_ICIO_2026, group.groupId, area, null),
            ),
        ];
        const states = new Set<string | null>();
        for (const html of arms) {
            expect(html.split(ENVELOPE_COST_SECTION_TESTID).length - 1).toBe(1);
            states.add(stateOf(html));
        }
        // Four arms, four DISTINCT states — the point of the whole file.
        expect(states.size).toBe(4);
    });
});
