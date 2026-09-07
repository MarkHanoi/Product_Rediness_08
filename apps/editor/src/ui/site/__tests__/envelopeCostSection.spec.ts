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
//
// ⭐ AMENDED BY §COST-ONE-PLACE (lane COST-ONE-PLACE, 2026-09-07 · L-13145 · C115 §9.1). The
// block is no longer *"the indicative cost"* on the envelope card: it is the PERMITTED-MAXIMUM
// SECOND LINE under the Parcel Law tab's question 5, beneath the design's own cost. Three things
// changed and each is asserted below rather than assumed:
//
//   · the summaries are renamed *"Maximum potential — …"* (`C115-139` clause 1 / `C115-14`:
//     disambiguate by RENAMING, never by deleting). Two blocks called "Indicative cost" in one
//     question group is the founder's own complaint;
//   · the subject is said in words and marked machine-readably, so the two figures cannot be
//     read as one value rendered twice (C115 §2.3);
//   · *"Verify at"* is a REAL ANCHOR (L-13130 / C115 D-1 / `C115-25`), with the prose after the
//     URL kept — `C115-24` forbids BOTH a plain-text URL and a truncated citation.
//
// ⛔ EVERY PRESERVATION ASSERTION BELOW IS UNCHANGED, and that is the point of amending rather
// than rewriting this file: the four arms, their sentences, the estimator's statement, the study
// caveat, the provenance and the 8 exclusions are the C115 §3 register rows this move had to
// carry, and they are still checked by the same expectations.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    ES_BARCELONA_ICIO_2026,
    estimateBuildingCost,
    resolveBuildingCostModels,
    type ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import {
    buildIndicativeCostFold,
    buildEnvelopeCostRelocationStamp,
    buildSourceToChaseHtml,
    envelopeStudyBuiltArea,
    ENVELOPE_COST_SECTION_TESTID,
    ENVELOPE_COST_GROUP_SELECT_TESTID,
    ENVELOPE_COST_CORRECTION_SELECT_TESTID,
    ENVELOPE_COST_AMOUNT_TESTID,
    ENVELOPE_COST_ASSUMPTIONS_TESTID,
    ENVELOPE_COST_NOT_COVERED_TESTID,
    ENVELOPE_COST_RELOCATED_ATTR,
    ENVELOPE_COST_RELOCATED_TO,
    ENVELOPE_COST_SUBJECT_ATTR,
    ENVELOPE_COST_VERIFY_LINK_TESTID,
    ENVELOPE_STUDY_AREA_CAVEAT,
    PERMITTED_MAXIMUM_SUBJECT_TEXT,
} from '../envelopeCostSection';
import { resetEnvelopeCardFoldState } from '../envelopeCardSections';

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

beforeEach(() => { resetEnvelopeCardFoldState(); });

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
        expect(html).toMatch(/<summary[^>]*>Maximum potential — no permitted area to price yet/);
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

describe('§COST-ONE-PLACE — the permitted-maximum SECOND LINE (C115 §9.1, PR-E-51)', () => {
    const area = envelopeStudyBuiltArea(800, 4, 200);
    const group = ES_BARCELONA_ICIO_2026.groups[0]!;
    const estimated = (): string => buildIndicativeCostFold(
        COVERED, area, { groupId: group.groupId, correctionId: null },
        estimateBuildingCost(ES_BARCELONA_ICIO_2026, group.groupId, area, null),
    );

    it('every arm names a DIFFERENT SUBJECT — the permitted envelope, not the design', () => {
        // `C115-139` clause 1. Without this, two figures stand in question 5 with no stated
        // difference and a reader takes the larger one for a correction of the smaller.
        const arms = [
            buildIndicativeCostFold(resolveBuildingCostModels(null), area, NO_CHOICE, null),
            buildIndicativeCostFold(COVERED, null, NO_CHOICE, null),
            buildIndicativeCostFold(COVERED, area, NO_CHOICE, null),
            estimated(),
        ];
        for (const html of arms) {
            expect(html).toContain(`${ENVELOPE_COST_SUBJECT_ATTR}="permitted-maximum"`);
            expect(html).toMatch(/<summary[^>]*>Maximum potential — /);
            // The subject is said in WORDS, not only in an attribute a user cannot read.
            expect(html).toContain('This prices the PERMITTED ENVELOPE, not the design above it');
            // ⛔ And the old name is gone from the summary, which is the duplication the founder
            // read: two blocks called "Indicative cost", one under question 2 and one under 5.
            expect(html).not.toMatch(/<summary[^>]*>Indicative cost/);
        }
    });

    it('the subject sentence is the exported constant, so a reword is a deliberate edit', () => {
        expect(estimated()).toContain(PERMITTED_MAXIMUM_SUBJECT_TEXT);
    });

    it('DE-WEIGHTED, NEVER HIDDEN — the figure is in the summary and is not typeset as the answer', () => {
        const html = estimated();
        // `C115-37`: de-weighting must not hide it. The number is readable with the fold shut.
        expect(html).toMatch(/<summary[^>]*>Maximum potential — ≈ [\d,.\s]+ EUR \(estimate\)</);
        // `C115-139` clause 2 / PR-E-51: a ceiling figure MUST NOT be typeset like the proposed
        // design's cost. The design's figure is 13 px purple; this one was 19 px and is now 12 px
        // amber. Asserting the 19 px is GONE is the half that catches a revert.
        expect(html).not.toMatch(/font-size:19px/);
        expect(html).toMatch(/data-testid="envelope-cost-amount"[^>]*font-size:12px/);
    });

    it('⭐ D-1 — "Verify at" is a real anchor, and the prose after the URL is NOT truncated', () => {
        const html = estimated();
        const src = ES_BARCELONA_ICIO_2026.provenance.sourceToChase;
        const url = src.split(/\s/)[0]!;
        expect(url.startsWith('https://')).toBe(true);
        // The founder's screenshot showed this URL as dead text. `C115-24` forbids both a
        // plain-text URL and a citation truncated into an unusable link, so BOTH halves are
        // asserted: the anchor exists with the exact href, and every word after it survives.
        expect(html).toContain(`<a data-testid="${ENVELOPE_COST_VERIFY_LINK_TESTID}" href="${url}"`);
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('Re-read Annex A each January');
        expect(html).toContain('CVE 202610021075');
    });

    it('D-1 — the three-way fallback survives: anchor · escaped plain text · nothing', () => {
        // PR-F-03. Most `ordinanceRef`-shaped citations are article references, and the rule is
        // read against `safeHttpUrl`, never against a wish that everything be a link.
        expect(buildSourceToChaseHtml('https://example.org/x.pdf — Annex A'))
            .toContain('<a data-testid=');
        const plain = buildSourceToChaseHtml('Ordenança fiscal núm. 2.1, Annex A §1');
        expect(plain).not.toContain('<a ');
        expect(plain).toContain('Ordenan');
        expect(buildSourceToChaseHtml('')).toBe('');
        expect(buildSourceToChaseHtml(null)).toBe('');
        // ⛔ A javascript: URL is never an href — it falls to the plain-text arm.
        const evil = buildSourceToChaseHtml('javascript:alert(1) — see the annex');
        expect(evil).not.toContain('<a ');
        expect(evil).not.toMatch(/href="javascript:/);
    });

    it('PR-F-10 stays reachable behind ONE named disclosure — "Cost assumptions & source"', () => {
        const html = estimated();
        // `C115-80` / `C115-84` / `C115-93`: the founder named this affordance, and every
        // provenance field plus all 8 exclusions must be behind it.
        expect(html).toContain(`data-testid="${ENVELOPE_COST_ASSUMPTIONS_TESTID}"`);
        expect(html).toMatch(/<summary[^>]*>Cost assumptions &amp; source/);
        expect(html).toContain(ES_BARCELONA_ICIO_2026.provenance.database);
        expect(html).toContain(ES_BARCELONA_ICIO_2026.provenance.edition);
        expect(html).toContain(ES_BARCELONA_ICIO_2026.provenance.itemCode!);
        expect(html).toContain('CLEARED FOR REDISTRIBUTION');
        expect(html).toContain('RDLeg 1/1996');
        expect(html).toContain(
            `What this €/m² does NOT include (${ES_BARCELONA_ICIO_2026.notCovered.length})`,
        );
    });

    it('D-3 — every <details> carries a data-testid, so the ONE memory can key it', () => {
        // PR-H-07 / C115 §11: fold state is keyed by `data-testid`; an untagged `<details>` is
        // skipped and therefore forgets on every repaint. This file used to emit one.
        const html = estimated();
        const opens = html.match(/<details[^>]*>/g) ?? [];
        expect(opens.length).toBeGreaterThanOrEqual(3);
        for (const tag of opens) expect(tag).toContain('data-testid=');
        expect(html).toContain(`data-testid="${ENVELOPE_COST_NOT_COVERED_TESTID}"`);
    });

    it('the two published selects survive on both arms that can offer them (PR-G-18 · PR-G-19)', () => {
        for (const html of [buildIndicativeCostFold(COVERED, area, NO_CHOICE, null), estimated()]) {
            expect(html).toContain(ENVELOPE_COST_GROUP_SELECT_TESTID);
            expect(html).toContain(ENVELOPE_COST_CORRECTION_SELECT_TESTID);
            expect(html).toContain('New build — no correction');
            // The published groups and corrections, plus the two un-chosen options. The count IS
            // the assertion (C115 §3.C) — a select that quietly ships nine rows has lost a rate.
            const options = html.match(/<option value="/g) ?? [];
            expect(options.length).toBe(
                ES_BARCELONA_ICIO_2026.groups.length + ES_BARCELONA_ICIO_2026.corrections.length + 2,
            );
        }
    });

    it('⭐ the CARD keeps a §2.5 relocation stamp — a move must not read as a deletion', () => {
        const stamp = buildEnvelopeCostRelocationStamp();
        expect(stamp).toContain(`${ENVELOPE_COST_RELOCATED_ATTR}="${ENVELOPE_COST_RELOCATED_TO}"`);
        // `C115-17`: the stamp NAMES the owning stage, so a reader can tell "moved" from "gone".
        expect(stamp).toContain('What does it cost?');
        expect(stamp).toContain('Nothing was dropped');
        // ⛔ It is a REFERENCE (C115 §2.1), never a second rendering: no figure, no control.
        expect(stamp).not.toContain(ENVELOPE_COST_AMOUNT_TESTID);
        expect(stamp).not.toContain(ENVELOPE_COST_GROUP_SELECT_TESTID);
        expect(stamp).not.toContain('<select');
    });
});
