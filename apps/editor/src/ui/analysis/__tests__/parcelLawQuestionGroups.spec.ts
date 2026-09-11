/**
 * §PL-IA-Q (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.2 / §26.3 / §26.5 · L-12998) —
 * THE PARCEL LAW TAB IS ORDERED BY THE PERSONA'S QUESTIONS, AND NOTHING WAS DROPPED TO ACHIEVE IT.
 *
 * ⚠ SIX AT MINT, SEVEN SINCE §STAGE-05-SECTION (2026-09-07 · C115 §8.1 · L-13237). The founder:
 * *"THE ROOMS SHOULD BE THE NEW SECTION 4."* `C115-06` requires that to be a SPLIT of question 3,
 * which had been carrying both his Stage 03 and his Stage 05; `C115-07` gives stage 05 the
 * question it never had. Every count in this file moved in the same commit as the code —
 * `C115-08` — because a spec asserting six against a ladder of seven is a spec that certifies the
 * defect it was written to catch.
 *
 * Founder 2026-09-06: *"honestly a lot is done — i can see most of the pieces working and i am
 * impressed — is just that is not well organize."*
 *
 * §26.5 refuses to accept *"better organised"* as a claim: *"a claim that the tab is 'better
 * organised' is not verifiable. A lane taking §26 must state what it is optimising and how it
 * knows it improved."* So this file measures the four things that were promised:
 *
 *   ARM A — the SEQUENCE is the persona's, not the model's (§26.3 + C115-06, seven groups, in order).
 *   ARM B — ⭐ NOTHING WAS SILENTLY DROPPED. Every section the flat tab rendered is still in the
 *           body, and each is asserted INSIDE the question it answers. This is the arm that
 *           matters most: a re-organisation that loses a determination has not tidied the tab,
 *           it has deleted evidence about someone's land.
 *   ARM C — ⛔ THE HONESTY APPARATUS SURVIVES THE DISCLOSURE. A collapsed group still states its
 *           headline AND its confidence (C58 §1.2), and the digest is a MIRROR of the body — it
 *           cannot invent a value, and it changes when the body changes.
 *   ARM D — PRYZM's palette: purple `#6600FF` on white, and never black.
 *
 * ⚠ A fake built from the header cannot falsify the header ([[fake-more-capable-than-real]]), so
 * ARM B mounts the tab with the PRODUCTION defaults for every section producer and asserts on
 * real rendered nodes, not on flags a fake set.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    mountParcelLawTab,
    PARCEL_LAW_TAB_TESTID,
    PARCEL_LAW_LADDER_TESTID,
    PARCEL_LAW_PANEL_SLOT_TESTID,
    PARCEL_LAW_FACTS_PLOT_SLOT_TESTID,
    PARCEL_LAW_FACTS_LAW_SLOT_TESTID,
    PARCEL_LAW_ENVELOPE_SUMMARY_HOST_TESTID,
    PARCEL_LAW_SETBACKS_MOVED_TESTID,
    PARCEL_LAW_AUTHORING_HOST_TESTID,
    PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID,
    PARCEL_LAW_ALLOWANCE_HOST_TESTID,
    PARCEL_LAW_QUANTITIES_HOST_TESTID,
    PARCEL_LAW_COST_HOST_TESTID,
    PARCEL_LAW_CREATE_HOUSE_HOST_TESTID,
    PARCEL_LAW_CHAT_HOST_TESTID,
    PARCEL_LAW_NOTE_TESTID,
    type ParcelLawTabDeps,
} from '../parcelLawTab';
import {
    buildQuestionGroup,
    resetQuestionGroupOpenState,
    PARCEL_LAW_QUESTION_GROUPS,
    QUESTION_GROUP_TESTID_PREFIX,
    QUESTION_GROUP_DIGEST_TESTID_PREFIX,
    QUESTION_GROUP_ORDINAL_ATTR,
    QUESTION_GROUP_CONFIDENCE_ATTR,
    PLAW_PURPLE,
} from '../parcelLawQuestionGroup';
import { AUTHORING_SLOT_TESTID, AUTHORING_LAWCHECK_TESTID } from '../parcelLawEnvelopeAuthoring';
import { PARCEL_LAW_QUANTITIES_SLOT_TESTID, PARCEL_LAW_COST_SLOT_TESTID } from '../parcelLawQuantities';
import { PARCEL_LAW_CHAT_TESTID } from '../parcelLawChat';
import { PARCEL_LAW_FACTS_TESTID } from '../parcelLawFacts';

/** The tab, mounted with the PRODUCTION section producers and only the two host seams faked. */
function mountReal(): { host: HTMLElement; handle: ReturnType<typeof mountParcelLawTab> } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const deps: ParcelLawTabDeps = {
        capabilityHost: {},
        runtime: null,
        buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { /* noop */ } }),
        mountSwitcher: () => ({
            element: document.createElement('div'),
            repaint: () => { /* noop */ },
            activeLabel: () => null, // §ONE-REGION-SWITCHER (L-13257) — the real handle reports this.
            dispose: () => { /* noop */ },
        }),
        wireStrip: () => 0,
        // ⛔ readParcelLawModel, renderParcelLawFacts, mountQuantities, mountAuthoring,
        // mountCreateHouse and mountChat are deliberately OMITTED — the whole point of ARM B is
        // that the PRODUCTION producers run and land in the right questions.
    };
    return { host, handle: mountParcelLawTab(host, deps) };
}

beforeEach(() => {
    resetQuestionGroupOpenState();
    // ⛔ A test that fails mid-body never reaches its own `dispose()`, and the next test's
    // document-wide assertions would then be reading the PREVIOUS test's tab. Clearing here makes
    // each failure report its own cause instead of cascading into a second, misleading one.
    document.body.replaceChildren();
});

// ══════════════════════════════════════════════════════════════════════════════
describe('ARM A — the sequence is the PERSONA\'s (STR §26.3), not the model\'s', () => {
    it('renders exactly seven groups, in the founder\'s order, each with a question a human asks', () => {
        const { host, handle } = mountReal();
        const ladder = host.querySelector(`[data-testid="${PARCEL_LAW_LADDER_TESTID}"]`);
        expect(ladder, 'the tab has no ladder').not.toBeNull();

        // ⚠ `details[...]`, not a bare prefix match: the DIGEST testid is
        // `parcel-law-q-digest-<id>`, which also starts with the group prefix. A bare `^=` counts
        // twelve nodes and would have "passed" a tab with three groups and nine digests.
        const groups = [...ladder!.querySelectorAll(`details[data-testid^="${QUESTION_GROUP_TESTID_PREFIX}"]`)];
        expect(groups).toHaveLength(7);

        // ⭐ THE ORDER IS ASSERTED FROM THE DOM, not from the spec table — a table that agreed
        // with itself would prove nothing about what the reader sees.
        expect(groups.map((g) => g.getAttribute(QUESTION_GROUP_ORDINAL_ATTR)))
            .toEqual(['1', '2', '3', '4', '5', '6', '7']);

        const questions = groups.map((g) => g.querySelector('.anl-plaw-q-title')?.textContent ?? '');
        expect(questions).toEqual([
            // ⭐ §ENVELOPE-SUMMARY-IN-QUESTION-1 (founder ruling 2026-09-11, Site-panel restructure) —
            // his mockup's titles for 1 and 2, verbatim: 1 answers the plot AND what it permits, 2 is
            // where you act on it. History: 'What is this plot?' (2026-09-06) and 'What can I build
            // here?' (§26.6.2, L-13046, 2026-09-07) — each superseded by the founder's own words.
            'What is this plot — and what can I build here?',
            'What can I build — and build it',
            'What do I want to build?',
            // §STAGE-05-SECTION (C115-170) — the founder's "NEW SECTION 4". The title is
            // `C115-05`'s stage-05 question, transcribed verbatim rather than written to taste.
            'What can I fit inside it?',
            'How much of my allowance have I used?',
            'What does it cost?',
            'Take me into BIM.',
        ]);
        handle.dispose();
        host.remove();
    });

    it('opens the two questions that ALWAYS have an answer, and remembers what the reader opens', () => {
        const { host, handle } = mountReal();
        const openIds = [...host.querySelectorAll<HTMLDetailsElement>(`details[data-testid^="${QUESTION_GROUP_TESTID_PREFIX}"]`)]
            .filter((d) => d.open)
            .map((d) => d.getAttribute('data-testid'));
        // §26.5 asks WHAT IS ABOVE THE FOLD and why. A cold arrival has no envelope, so 3–7 have
        // nothing of their own to say yet — and their collapsed digests say exactly that.
        // ⭐ Question 4 (`rooms`) closed is the single biggest half of the founder's *"smaller and
        // more discreet"*: an entire stage folds to one row that still states what is inside it.
        expect(openIds).toEqual([
            `${QUESTION_GROUP_TESTID_PREFIX}plot`,
            `${QUESTION_GROUP_TESTID_PREFIX}law`,
        ]);

        // ⭐ A DISCLOSURE THE READER MUST RE-OPEN ON EVERY VISIT IS AN OBSTACLE, NOT A DISCLOSURE.
        // The tab body is torn out of the DOM on every tab change, so without a memory the reader
        // would lose their place each time they looked at the 3D view and came back.
        const intent = host.querySelector<HTMLDetailsElement>(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}intent"]`)!;
        intent.open = true;
        intent.dispatchEvent(new Event('toggle'));
        handle.dispose();
        host.remove();

        const again = mountReal();
        expect(
            again.host.querySelector<HTMLDetailsElement>(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}intent"]`)!.open,
            'the group the reader opened re-collapsed on the way back',
        ).toBe(true);
        again.handle.dispose();
        again.host.remove();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('ARM B — ⭐ NOTHING WAS DROPPED, and each section is in the question it answers', () => {
    /**
     * The ground-truth inventory of what the FLAT tab rendered, as [testid, owning question].
     * ⛔ Every row here was on the tab before this lane touched it. A row that cannot be found is
     * a section this re-organisation lost — which §26.2 forbids in terms
     * (*"⛔ Do not delete determinations to make the tab look tidier"*).
     */
    const INVENTORY: ReadonlyArray<readonly [string, string]> = [
        [PARCEL_LAW_PANEL_SLOT_TESTID, 'plot'],
        [PARCEL_LAW_FACTS_PLOT_SLOT_TESTID, 'plot'],
        // ⭐ §ENVELOPE-SUMMARY-IN-QUESTION-1 (founder ruling 2026-09-11 · L-13315) — the SETBACK
        // REGISTER's slot MOVED to question 1, beside the envelope it constrains, and the envelope's
        // summary has a question-1 slot of its own. ⛔ Both MOVED, neither was deleted — and the stamp
        // question 2 now carries where the register used to be is its own row, so "moved" is checkable
        // rather than inferred from an absence.
        [PARCEL_LAW_FACTS_LAW_SLOT_TESTID, 'plot'],
        [PARCEL_LAW_ENVELOPE_SUMMARY_HOST_TESTID, 'plot'],
        [PARCEL_LAW_SETBACKS_MOVED_TESTID, 'law'],
        // ⭐ §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202) — the create block's host, now in
        // question 2 rather than 3. Founder 2026-09-07: *"SECTION 3 SHALL HAVE ONLY THIS SCOPE"*
        // (the ledger), and of the create block *"THIS HAS BEEN DONE ALREADY ON SECTION 2."*
        // ⛔ THE ROW MOVED, IT WAS NOT DELETED. That is the whole discipline of this table: a
        // relocation that removes its inventory row stops being checkable, which is how a
        // "tidier" tab loses a control and every spec stays green.
        [PARCEL_LAW_AUTHORING_HOST_TESTID, 'law'],
        [AUTHORING_SLOT_TESTID, 'law'],
        // ⭐ §STAGE-05-SECTION — the room programme's host, now in question 4 rather than 3.
        // ⛔ THIS ROW IS THE POINT OF THE SPLIT. Without it, moving the slot to a group that does
        // not exist would fall through `bodyOf`'s ladder fallback and the programme would render
        // OUTSIDE every question with every other assertion still green.
        [PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID, 'rooms'],
        [PARCEL_LAW_ALLOWANCE_HOST_TESTID, 'allowance'],
        [AUTHORING_LAWCHECK_TESTID, 'allowance'],
        [PARCEL_LAW_QUANTITIES_HOST_TESTID, 'allowance'],
        [PARCEL_LAW_QUANTITIES_SLOT_TESTID, 'allowance'],
        [PARCEL_LAW_COST_HOST_TESTID, 'cost'],
        [PARCEL_LAW_COST_SLOT_TESTID, 'cost'],
        [PARCEL_LAW_CREATE_HOUSE_HOST_TESTID, 'bim'],
    ];

    it('every section from the flat tab is still rendered, INSIDE the question it answers', () => {
        const { host, handle } = mountReal();
        // ⭐ EVERY ROW IS REPORTED, NOT THE FIRST ONE THAT FAILS. This loop used to `expect`
        // inside the body, so the first bad row aborted the test and the remaining rows went
        // unmeasured — which is how a lane can "fix" one placement and never learn that its own
        // row was never reached. The failures are collected and asserted as a SET.
        const lost: string[] = [];
        for (const [testid, questionId] of INVENTORY) {
            const group = host.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}${questionId}"]`);
            if (group === null) { lost.push(`question "${questionId}" is not on the tab`); continue; }
            if (group.querySelector(`[data-testid="${testid}"]`) === null) {
                const elsewhere = host.querySelector(`[data-testid="${testid}"]`) !== null;
                lost.push(
                    `SILENT DROP: "${testid}" is not inside question "${questionId}"`
                    + (elsewhere ? ' (it IS on the tab — it moved to another question)' : ' (it is not on the tab at all)'),
                );
            }
        }
        expect(lost, lost.join(' | ')).toEqual([]);
        handle.dispose();
        host.remove();
    });

    it('the shared model is rendered TWICE from ONE read — never two derivations', () => {
        const reads: number[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        const handle = mountParcelLawTab(host, {
            capabilityHost: {},
            runtime: null,
            buildParcelPanel: () => ({ element: document.createElement('div'), dispose: () => { /* noop */ } }),
            mountSwitcher: () => ({
                element: document.createElement('div'),
                repaint: () => { /* noop */ },
                activeLabel: () => null, // §ONE-REGION-SWITCHER (L-13257) — the real handle reports this.
                dispose: () => { /* noop */ },
            }),
            wireStrip: () => 0,
            readParcelLawModel: () => {
                reads.push(1);
                return {
                    envelopeState: 'absent', identityAbsence: 'none', determinedAtIso: null,
                    geometry: null, geometryAbsence: 'ring-unreadable', refusal: null,
                    ordinance: null, massing: null, perStorey: null, capacity: null,
                } as never;
            },
        });
        // ⭐ ONE READ. Two reads would be two vintages of one parcel, which is the defect §25.11
        // extracted the shared model to prevent (C19 §5.6 clause 1).
        expect(reads).toHaveLength(1);
        // ⭐ AND NOW ONE RENDERING — §26.6 rule 1 (L-13046). This line used to read `2`: the law
        // half was a second rendering of the same model beneath the envelope card's own fold, and
        // the founder called it by name (*"IMAGE 6 SHOULD NOT BE DUPLICATED"*). The plot half is
        // the one that stays; the law slot is stamped with where its figures now live.
        expect(host.querySelectorAll(`[data-testid="${PARCEL_LAW_FACTS_TESTID}"]`)).toHaveLength(1);
        expect(
            host.querySelector(`[data-testid="${PARCEL_LAW_FACTS_LAW_SLOT_TESTID}"]`)!
                .getAttribute('data-duplicate-removed'),
        ).toBe('envelope-card-site-data-fold');
        handle.dispose();
        host.remove();
    });

    it('the chat is PINNED outside the ladder — it answers whichever question you ask', () => {
        const { host, handle } = mountReal();
        const ladder = host.querySelector(`[data-testid="${PARCEL_LAW_LADDER_TESTID}"]`)!;
        const chatSlot = host.querySelector(`[data-testid="${PARCEL_LAW_CHAT_HOST_TESTID}"]`);
        expect(chatSlot, 'the chat was dropped').not.toBeNull();
        // §26.3: *"any section that answers none of them is in the wrong place or belongs behind a
        // disclosure"*. The chat answers ALL six by driving the sections above it, so hiding it
        // behind a disclosure would bury the only control that spans the whole ladder.
        expect(ladder.contains(chatSlot!)).toBe(false);
        expect(chatSlot!.querySelector(`[data-testid="${PARCEL_LAW_CHAT_TESTID}"]`)).not.toBeNull();
        // The lede stays above the ladder — it explains the ladder, so it cannot be inside it.
        const note = host.querySelector(`[data-testid="${PARCEL_LAW_NOTE_TESTID}"]`)!;
        expect(ladder.contains(note)).toBe(false);
        handle.dispose();
        host.remove();
    });

    it('disposing the tab takes every group, its observer and both placed halves with it', () => {
        const { host, handle } = mountReal();
        handle.dispose();
        expect(host.querySelector(`[data-testid="${PARCEL_LAW_TAB_TESTID}"]`)).toBeNull();
        // ⛔ The two producers that place a half in another question must not leave it standing:
        // a live rate entry or allowance ledger surviving its own mount is stranded chrome whose
        // subscriptions have already been released.
        expect(document.querySelector(`[data-testid="${PARCEL_LAW_COST_SLOT_TESTID}"]`)).toBeNull();
        expect(document.querySelector(`[data-testid="${AUTHORING_LAWCHECK_TESTID}"]`)).toBeNull();
        host.remove();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('ARM C — ⛔ a COLLAPSED group still states its headline AND its confidence (C58 §1.2)', () => {
    it('mirrors a headline and a confidence out of the body — and invents neither', () => {
        const spec = {
            id: 'probe-test', ordinal: 1, question: 'Q?', hint: 'h', open: false,
            headlineProbes: [{ selector: '.head' }],
            confidenceProbes: [{ selector: '.head', attr: 'data-state' }],
            emptyDigest: 'nothing yet',
        } as const;
        const g = buildQuestionGroup(spec);
        const digest = g.element.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}probe-test"]`)!;

        // ⭐ AN EMPTY BODY YIELDS THE STATED ABSENCE, NEVER A ZERO AND NEVER A BLANK.
        expect(digest.textContent).toContain('nothing yet');
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('none');

        const row = document.createElement('div');
        row.className = 'head';
        row.setAttribute('data-state', 'estimated');
        row.textContent = '1,240 m²';
        g.body.appendChild(row);
        g.refreshDigest();

        // ⛔ BOTH HALVES, TOGETHER. A number whose confidence is hidden by a disclosure has broken
        // C58 §1.2 even though nothing was deleted — that is the whole risk of this lane.
        expect(digest.textContent).toContain('1,240 m²');
        expect(digest.textContent).toContain('estimated');
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('estimated');
        g.dispose();
    });

    it('says so out loud when a figure arrives WITHOUT a confidence', () => {
        const g = buildQuestionGroup({
            id: 'no-conf', ordinal: 2, question: 'Q?', hint: 'h', open: false,
            headlineProbes: [{ selector: '.head' }],
            confidenceProbes: [{ selector: '.nope' }],
            emptyDigest: 'nothing yet',
        });
        const row = document.createElement('div');
        row.className = 'head';
        row.textContent = '9.5 m';
        g.body.appendChild(row);
        g.refreshDigest();
        // ⭐ THE ABSENCE IS STATED, NOT LEFT BLANK. A blank reads as "no issue"; this reads as what
        // it is — a figure whose provenance this group could not find.
        expect(g.element.textContent).toContain('confidence not stated');
        g.dispose();
    });

    it('every one of the seven groups states something in its collapsed summary on a cold tab', () => {
        const { host, handle } = mountReal();
        for (const spec of PARCEL_LAW_QUESTION_GROUPS) {
            const digest = host.querySelector(
                `[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}${spec.id}"]`,
            );
            expect(digest, `question "${spec.id}" has no digest`).not.toBeNull();
            expect(
                (digest!.textContent ?? '').trim().length,
                `question "${spec.id}" collapses to a BLANK — a reader cannot tell absent from unread`,
            ).toBeGreaterThan(0);
        }
        handle.dispose();
        host.remove();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('ARM D — PRYZM\'s palette: purple on white, never black', () => {
    it('the ordinal chip is #6600FF and no group chrome is black', () => {
        const g = buildQuestionGroup(PARCEL_LAW_QUESTION_GROUPS[0]!);
        const chip = g.element.querySelector<HTMLElement>('.anl-plaw-q-chip')!;
        expect(chip.style.background.toLowerCase()).toContain(PLAW_PURPLE.toLowerCase());
        const css = g.element.outerHTML.toLowerCase();
        // ⛔ [[preview-color-unified-pryzm-purple]] / [[onboarding-site-generate-view-flow]] —
        // white + purple, NO black. `#2b2740` is the tab's ink and is a deep violet, not black.
        expect(css).not.toContain('#000');
        expect(css).not.toContain('black');
        g.dispose();
    });
});
