/**
 * §COST-ONE-PLACE (lane COST-ONE-PLACE, 2026-09-07 · L-13145 · C115 §2 / §9 / §9.1) — COST HAS
 * ONE HOME, AND NOTHING WAS LOST ON THE WAY THERE.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS AT THE MOUNTED-DOM LEVEL AND NOT AT THE STRING LEVEL
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `envelopeCostSection.spec.ts` pins what the BUILDER emits. It cannot see the defect the founder
 * actually reported, because that defect is a property of the whole panel: *"Indicative cost is
 * still under point 2 — but there is a cost section specific for this … no duplication and all in
 * point 5."* Two blocks each correct on their own, mounted at once, is exactly the shape a
 * string-level suite is blind to ([[committed-is-not-reachable]] — prove it at the layer the user
 * experiences). So every assertion below counts occurrences in a MOUNTED tree.
 *
 * WHAT IT PINS:
 *
 *   1. ⛔ **EXACTLY ONE** of every moved element in the mounted DOM — the module select, the
 *      correction select, the estimate figure, the assumptions disclosure, the exclusions fold,
 *      the verify-at anchor and the section container. `C115-10` gives every rendered value ONE
 *      canonical home; "one" is a count, so the test counts.
 *   2. ⭐ The verify-at URL is an **anchor with a resolvable href** (L-13130 / C115 **D-1** /
 *      `C115-25`), and the prose after the URL is still there — `C115-24` forbids a plain-text
 *      URL AND a citation truncated into an unusable link, so both halves are asserted.
 *   3. ⛔ The **no-rate refusal still renders**, verbatim. It is the honest answer for every place
 *      PRYZM ships no published rate, and `C115-81` requires it to survive word for word. A cost
 *      section that silently invented a rate would be far worse than one that asks.
 *   4. ⭐ The permitted-maximum line sits **BENEATH** the design's own cost, inside question 5's
 *      body (`C115-138`), and carries the different-subject marking that makes the two figures two
 *      answers rather than one duplication (C115 §2.3).
 *   5. ⛔ The **relocation stamp** uses the SAME attribute name the tab already uses (`C115-17`:
 *      reuse the pattern, do not re-invent it). Two literals in two packages is how one name
 *      silently becomes two.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    ES_BARCELONA_ICIO_2026,
    type ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import type { BuildableEnvelope } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import {
    mountParcelLawQuantities,
    PARCEL_LAW_MAX_POTENTIAL_SLOT_TESTID,
    type LiveEnvelopeStore,
    type ParcelLawQuantitiesDeps,
} from '../parcelLawQuantities';
import {
    buildPermittedMaximumCostHtml,
    defaultPermittedMaximumCostDeps,
    type PermittedMaximumCostDeps,
} from '../parcelLawPermittedMaximumCost';
import {
    mountParcelLawTab,
    PARCEL_LAW_COST_HOST_TESTID,
    PARCEL_LAW_DUPLICATE_REMOVED_ATTR,
    type ParcelLawCapabilityHost,
    type ParcelLawTabDeps,
} from '../parcelLawTab';
import { QUESTION_GROUP_TESTID_PREFIX } from '../parcelLawQuestionGroup';
import {
    ENVELOPE_COST_AMOUNT_TESTID,
    ENVELOPE_COST_ASSUMPTIONS_TESTID,
    ENVELOPE_COST_CORRECTION_SELECT_TESTID,
    ENVELOPE_COST_GROUP_SELECT_TESTID,
    ENVELOPE_COST_NOT_COVERED_TESTID,
    ENVELOPE_COST_RELOCATED_ATTR,
    ENVELOPE_COST_SECTION_TESTID,
    ENVELOPE_COST_SUBJECT_ATTR,
    ENVELOPE_COST_VERIFY_LINK_TESTID,
} from '../../site/envelopeCostSection';
import {
    LIVE_QUANTITIES_COST_PART_TESTID,
    LIVE_QUANTITIES_COST_TESTID,
    LIVE_QUANTITIES_RATE_INPUT_TESTID,
} from '../../site/liveQuantitiesSection';
import { resetEnvelopeCardFoldState } from '../../site/envelopeCardSections';
import { resetIndicativeRateState } from '../../site/indicativeRateState';

// ─────────────────────────────────────────────────────────────────────────────
// Fakes. ⛔ Only the SEAMS are faked — the markup under test is the production
// builder, the production mount and the production `estimateBuildingCost`. A fake
// built from the header cannot falsify the header ([[fake-more-capable-than-real]]).
// ─────────────────────────────────────────────────────────────────────────────

/** A determination with a real inset ring and a derived storey count — the `estimated` arm. */
const DETERMINED = {
    status: 'determined',
    insetPolygon: [
        { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 19 }, { x: 0, z: 19 },
    ],
    insetAreaM2: 380,
    maxFloors: 7,
    derivation: [],
} as unknown as BuildableEnvelope;

const COVERED: ResolvedBuildingCostModels = {
    tier: 'jurisdiction',
    models: [ES_BARCELONA_ICIO_2026],
    statement: 'Estimate from Barcelona ICIO 2026, matched at the jurisdiction level.',
};

const CHOSEN_GROUP = ES_BARCELONA_ICIO_2026.groups[0]!.groupId;

function costDeps(overrides: Partial<PermittedMaximumCostDeps> = {}): PermittedMaximumCostDeps {
    const written: { groupId: string | null; correctionId: string | null } =
        { groupId: CHOSEN_GROUP, correctionId: null };
    return {
        runtime: () => null,
        readEnvelope: () => DETERMINED,
        resolveModels: () => COVERED,
        readChoice: () => written,
        writeChoice: (_rt, c) => {
            written.groupId = c.groupId;
            written.correctionId = c.correctionId;
        },
        ...overrides,
    };
}

const emptyStore: LiveEnvelopeStore = { getState: () => new Map() };

function quantitiesDeps(cost: PermittedMaximumCostDeps): ParcelLawQuantitiesDeps {
    return {
        runtime: () => ({ stores: { spaceEnvelope: emptyStore } } as unknown as PryzmRuntime),
        readLevels: () => [],
        nowIso: () => '2026-09-07T10:00:00Z',
        permittedMaximumCost: cost,
    };
}

/** How many nodes in `root` carry this testid. The COUNT is the assertion (C115 §2.1). */
const countTestid = (root: ParentNode, testid: string): number =>
    root.querySelectorAll(`[data-testid="${testid}"]`).length;

beforeEach(() => {
    resetIndicativeRateState();
    resetEnvelopeCardFoldState();
    document.body.innerHTML = '';
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§COST-ONE-PLACE — ONE mounted rendering of every moved element', () => {
    function mount(cost = costDeps()): { host: HTMLElement; dispose: () => void } {
        const host = document.createElement('div');
        const costHost = document.createElement('div');
        host.appendChild(costHost);
        document.body.appendChild(host);
        const handle = mountParcelLawQuantities(host, quantitiesDeps(cost), { costHost });
        return { host, dispose: () => handle.dispose() };
    }

    it('⛔ every moved element appears EXACTLY ONCE in the mounted DOM', () => {
        const { host, dispose } = mount();
        // The whole inventory the founder's screenshot showed under point 2, counted where the
        // user actually looks. `1` is the claim; `2` is the defect he reported; `0` is the
        // deletion `C115-01` forbids.
        for (const testid of [
            ENVELOPE_COST_SECTION_TESTID,
            ENVELOPE_COST_GROUP_SELECT_TESTID,
            ENVELOPE_COST_CORRECTION_SELECT_TESTID,
            ENVELOPE_COST_AMOUNT_TESTID,
            ENVELOPE_COST_ASSUMPTIONS_TESTID,
            ENVELOPE_COST_NOT_COVERED_TESTID,
            ENVELOPE_COST_VERIFY_LINK_TESTID,
            PARCEL_LAW_MAX_POTENTIAL_SLOT_TESTID,
            // …and the design's own cost, which is the ANSWER this one sits beneath.
            LIVE_QUANTITIES_COST_PART_TESTID,
            LIVE_QUANTITIES_COST_TESTID,
            LIVE_QUANTITIES_RATE_INPUT_TESTID,
        ]) {
            expect(countTestid(host, testid), `${testid} must be mounted exactly once`).toBe(1);
        }
        dispose();
    });

    it('⛔ it stays ONE after a repaint — a re-render must not accumulate a second copy', () => {
        // The card is rebuilt whole by `innerHTML` on every store notification and this control
        // repaints on its own channel; an append-instead-of-replace bug shows up here and nowhere
        // else in the suite.
        const { host, dispose } = mount();
        (host.querySelector(
            `[data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}"]`,
        ) as HTMLSelectElement).dispatchEvent(new Event('change'));
        expect(countTestid(host, ENVELOPE_COST_SECTION_TESTID)).toBe(1);
        expect(countTestid(host, ENVELOPE_COST_AMOUNT_TESTID)).toBe(1);
        dispose();
    });

    it('⭐ the maximum sits BENEATH the design cost, and says it is a different subject', () => {
        const { host, dispose } = mount();
        const answer = host.querySelector(`[data-testid="${LIVE_QUANTITIES_COST_PART_TESTID}"]`)!;
        const maximum = host.querySelector(`[data-testid="${PARCEL_LAW_MAX_POTENTIAL_SLOT_TESTID}"]`)!;
        // `C115-138`: *"an optional second line BENEATH the proposed-design cost"*.
        expect(answer.compareDocumentPosition(maximum) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // `C115-139` clause 1 + C115 §2.3 — two questions, not one value rendered twice.
        expect(
            host.querySelector(`[${ENVELOPE_COST_SUBJECT_ATTR}="permitted-maximum"]`),
        ).not.toBeNull();
        expect(maximum.textContent).toContain('This prices the PERMITTED ENVELOPE');
        dispose();
    });

    it('⭐ D-1 — "Verify at" is an ANCHOR with a resolvable https href, prose intact', () => {
        const { host, dispose } = mount();
        const a = host.querySelector<HTMLAnchorElement>(
            `a[data-testid="${ENVELOPE_COST_VERIFY_LINK_TESTID}"]`,
        );
        expect(a, 'the verify-at citation must be a real <a>, not escaped text').not.toBeNull();
        const href = a!.getAttribute('href')!;
        expect(() => new URL(href)).not.toThrow();
        expect(new URL(href).protocol).toBe('https:');
        expect(href).toBe(ES_BARCELONA_ICIO_2026.provenance.sourceToChase.split(/\s/)[0]);
        expect(a!.getAttribute('rel')).toContain('noopener');
        // ⛔ NOT TRUNCATED (`C115-24`, second half): the annex, the BOPB reference and the
        // re-read instruction that follow the URL are still on the page.
        const evidence = host.querySelector(`[data-testid="${ENVELOPE_COST_ASSUMPTIONS_TESTID}"]`)!;
        expect(evidence.textContent).toContain('Re-read Annex A each January');
        expect(evidence.textContent).toContain('CVE 202610021075');
        dispose();
    });

    it('⛔ the NO-RATE refusal still renders — PRYZM asks, it never invents a rate', () => {
        // `C115-81` / `C115-82`. No rate has been set in this session, so question 5's own answer
        // is a refusal plus an ASK, and both must be on the page beside a permitted maximum that
        // DOES have a published figure. The two coexisting is the honest state, not a conflict.
        const { host, dispose } = mount();
        const cost = host.querySelector(`[data-testid="${LIVE_QUANTITIES_COST_TESTID}"]`)!;
        expect(cost.getAttribute('data-arm')).toBe('no-rate');
        expect(cost.textContent).toContain('No cost rate has been set');
        expect(cost.textContent).toContain('PRYZM ships no published rate for most places and will not invent one');
        expect(host.textContent).toContain('PRYZM ships a published, cited rate for one place only');
        // The control the refusal points at ("type a cost per m² ABOVE") is above it.
        const input = host.querySelector(`[data-testid="${LIVE_QUANTITIES_RATE_INPUT_TESTID}"]`)!;
        expect(input.compareDocumentPosition(cost) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        dispose();
    });

    it('the published-module select drives the figure and PERSISTS the choice, never a default', () => {
        const cost = costDeps();
        const { host, dispose } = mount(cost);
        const sel = host.querySelector<HTMLSelectElement>(
            `[data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}"]`,
        )!;
        const before = host.querySelector(`[data-testid="${ENVELOPE_COST_AMOUNT_TESTID}"]`)!.textContent;
        // ⛔ Clearing REMOVES the figure rather than falling back to a default group — Barcelona's
        // published table spans a factor of nine and a default would be a guess wearing a
        // BOPB citation (`C115-81`).
        sel.value = '';
        sel.dispatchEvent(new Event('change'));
        expect(cost.readChoice(null).groupId).toBeNull();
        expect(host.querySelector(`[data-testid="${ENVELOPE_COST_AMOUNT_TESTID}"]`)).toBeNull();
        expect(host.textContent).toContain('will not guess');
        // …and choosing again brings it back, with the same value it had.
        const sel2 = host.querySelector<HTMLSelectElement>(
            `[data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}"]`,
        )!;
        sel2.value = CHOSEN_GROUP;
        sel2.dispatchEvent(new Event('change'));
        expect(host.querySelector(`[data-testid="${ENVELOPE_COST_AMOUNT_TESTID}"]`)!.textContent)
            .toBe(before);
        dispose();
    });

    it('no determination ⇒ NOTHING is claimed here, because question 2 already said so', () => {
        // ⛔ NOT the `no-gfa` arm: that arm is about a determination with no derived storey count
        // and still has something specific to say. With no envelope at all the subject is absent,
        // and repeating question 2's absence under question 5 is the duplication `C115-10` forbids.
        const { host, dispose } = mount(costDeps({ readEnvelope: () => null }));
        expect(countTestid(host, PARCEL_LAW_MAX_POTENTIAL_SLOT_TESTID)).toBe(0);
        expect(countTestid(host, ENVELOPE_COST_SECTION_TESTID)).toBe(0);
        // ⭐ …and question 5's OWN answer is untouched. An optional second line must never take
        // the answer above it down with it.
        expect(countTestid(host, LIVE_QUANTITIES_COST_TESTID)).toBe(1);
        dispose();
    });

    it('a throwing read is logged and refused, never allowed to take question 5 down', () => {
        const html = buildPermittedMaximumCostHtml(costDeps({
            readEnvelope: () => { throw new Error('store unreachable'); },
        }));
        expect(html).toBe('');
    });

    it('every refusal arm still REACHES the DOM — a refusal is not an emptiness', () => {
        // `C115-81` / L-1650 root cause 2. Three arms, three distinct `data-state` values, each
        // mounted rather than skipped.
        const arms: Array<[Partial<PermittedMaximumCostDeps>, string, string]> = [
            [{ resolveModels: () => ({ tier: 'none', models: [], statement: 'No parcel location has been set.' }) },
                'no-module', 'wrong number, not an approximate one'],
            [{ readEnvelope: () => ({ ...DETERMINED, maxFloors: null } as unknown as BuildableEnvelope) },
                'no-gfa', 'did not derive a storey count'],
            [{ readChoice: () => ({ groupId: null, correctionId: null }) },
                'no-typology', 'will not guess'],
        ];
        for (const [override, state, sentence] of arms) {
            document.body.innerHTML = '';
            const { host, dispose } = mount(costDeps(override));
            const section = host.querySelector(`[data-testid="${ENVELOPE_COST_SECTION_TESTID}"]`);
            expect(section, `${state} must be mounted, not skipped`).not.toBeNull();
            expect(section!.getAttribute('data-state')).toBe(state);
            expect(section!.textContent).toContain(sentence);
            expect(countTestid(host, ENVELOPE_COST_AMOUNT_TESTID)).toBe(0);
            dispose();
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§COST-ONE-PLACE — reachability and the relocation stamp', () => {
    it('⭐ the tab puts the cost host in QUESTION 5 and this control mounts into it', () => {
        const capabilityHost: ParcelLawCapabilityHost = {
            pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
        };
        const deps: ParcelLawTabDeps = {
            capabilityHost,
            runtime: null,
            buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { /* noop */ } }),
            mountSwitcher: () => ({ element: document.createElement('div'), repaint: () => { /* noop */ }, dispose: () => { /* noop */ } }),
            wireStrip: () => 0,
            readParcelLawModel: () => ({ kind: 'absent' } as never),
            renderParcelLawFacts: () => document.createElement('div'),
            // ⛔ Only the COST SEAMS are injected. The mount, the placement and the markup are
            // production — the point of the test is that the founder's click reaches this.
            mountQuantities: (h, costHost) =>
                mountParcelLawQuantities(h, quantitiesDeps(costDeps()), { costHost }),
        };
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawTab(host, deps);

        const q5 = host.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}cost"]`);
        expect(q5, 'question 5 must exist').not.toBeNull();
        const costHost = host.querySelector(`[data-testid="${PARCEL_LAW_COST_HOST_TESTID}"]`)!;
        expect(q5!.contains(costHost)).toBe(true);
        // ⭐ THE WHOLE CLAIM, IN ONE LINE: the permitted-maximum block is inside question 5.
        const maximum = host.querySelector(`[data-testid="${PARCEL_LAW_MAX_POTENTIAL_SLOT_TESTID}"]`);
        expect(maximum, 'the permitted-maximum line must be mounted').not.toBeNull();
        expect(q5!.contains(maximum!)).toBe(true);
        expect(countTestid(host, ENVELOPE_COST_SECTION_TESTID)).toBe(1);
        h.dispose();
    });

    it('⛔ the stamp reuses the tab\'s OWN attribute name — one name, not two literals', () => {
        // `C115-17`: *"the pattern already exists and MUST be reused, not re-invented"*. The two
        // constants live in packages that must not import each other, so this equality is the
        // thing that keeps them one name; renaming either side fails here instead of silently
        // minting a second stamp nobody greps for.
        expect(ENVELOPE_COST_RELOCATED_ATTR).toBe(PARCEL_LAW_DUPLICATE_REMOVED_ATTR);
    });

    it('the production cost deps resolve with no window runtime and never throw', () => {
        const deps = defaultPermittedMaximumCostDeps();
        expect(deps.runtime()).toBeFalsy();
        expect(() => deps.readChoice(null)).not.toThrow();
        expect(() => deps.resolveModels()).not.toThrow();
        // With nothing pinned there is no envelope, so there is nothing to price and it says so
        // by rendering nothing at all rather than by inventing an area.
        expect(buildPermittedMaximumCostHtml(deps)).toBe('');
    });
});
