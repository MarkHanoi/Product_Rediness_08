/**
 * ⭐ L-13139 / C115 §15 D-10 — QUESTION 1's COLLAPSED DIGEST TOLD A POSITIVE FALSEHOOD.
 *
 * Founder's screenshot, 2026-09-07: a full PARCEL card on screen, and directly above it, in the
 * collapsed summary of the very group that CONTAINS that card, the words **"no plot committed"**.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * THE MECHANISM, MEASURED — AND WHY THE BUG WAS INVISIBLE TO EVERY EXISTING ARM
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Since the §ONE-PARCEL-BLOCK merge (L-13005) the `plot`-scope fact renderer emits NO parcel rows
 * at all when geometry exists — it hands the figures to the cadastral card, which typesets them in
 * `pryzm-parcel-card-val`. Question 1's headline probe looked for `.anl-plaw-val` inside
 * `[data-testid="parcel-law-fact-parcel-area"]`. Both halves of that selector stopped resolving on
 * the same day, the digest fell through to `emptyDigest`, and no spec noticed because no spec
 * asserted the digest of a group whose body held a real CARD.
 *
 * ⛔ A BLANK WOULD HAVE BEEN BETTER THAN WHAT SHIPPED. *"no plot committed"* is not an absence of
 * information; it is a CLAIM, and it was false about the reader's land — the C84 EI-1b failure
 * where a failure to READ and a finding of emptiness become the same value. `C115-99`: a probe
 * MUST move with the rendering it mirrors, in the same PR.
 *
 * ⚠ WHY THIS FILE AND NOT `parcelLawQuestionGroups.spec.ts`. That file is being edited
 * concurrently by the lane splitting question 3 (`C115-06`); these arms are about ONE defect in
 * ONE group's probe list and stand on their own. The digest primitive's own arms stay there.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildQuestionGroup,
    resetQuestionGroupOpenState,
    questionGroupFoldIsOpen,
    setQuestionGroupFoldOpen,
    PARCEL_LAW_QUESTION_GROUPS,
    QUESTION_GROUP_DIGEST_TESTID_PREFIX,
} from '../parcelLawQuestionGroup';
import { PARCEL_CARD_AREA_ROW_TESTID } from '../../site/parcel/parcelCard';

const q1Spec = () => PARCEL_LAW_QUESTION_GROUPS.find((g) => g.id === 'plot')!;

/** The exact row shape `parcelCard.ts` builds for its primary area row. */
function cardAreaRow(value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pryzm-parcel-card-row';
    row.setAttribute('data-testid', PARCEL_CARD_AREA_ROW_TESTID);
    const key = document.createElement('span');
    key.className = 'pryzm-parcel-card-key';
    key.textContent = 'Area (registry)';
    const val = document.createElement('span');
    val.className = 'pryzm-parcel-card-val';
    val.textContent = value;
    row.appendChild(key);
    row.appendChild(val);
    return row;
}

describe('L-13139 — question 1 mirrors the CARD\'s area row, not a class the card never emits', () => {
    beforeEach(() => { resetQuestionGroupOpenState(); });

    it('⭐ a committed plot whose area is typeset BY THE CARD no longer reads "no plot committed"', () => {
        const g = buildQuestionGroup(q1Spec());
        const digest = g.element.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}plot"]`)!;

        // Cold, with nothing in the body, the empty digest is the HONEST answer and stays.
        expect(digest.textContent).toContain('no plot committed');

        g.body.appendChild(cardAreaRow('801 m²'));
        g.refreshDigest();

        expect(digest.textContent).toContain('801 m²');
        expect(
            digest.textContent,
            'a committed plot summarised as "no plot committed" is a FALSE CLAIM, not a blank',
        ).not.toContain('no plot committed');
        g.dispose();
    });

    it('⛔ mirrors the HONEST arm too — "not determinable from this ring" is an answer', () => {
        // C84 EI-1b: "we cannot state an area for this ring" and "no plot is committed" are
        // opposite facts and must not collapse into one sentence. The card carries the handle on
        // that arm as well, precisely so the digest can tell them apart.
        const g = buildQuestionGroup(q1Spec());
        const digest = g.element.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}plot"]`)!;
        g.body.appendChild(cardAreaRow('not determinable from this ring'));
        g.refreshDigest();
        expect(digest.textContent).toContain('not determinable');
        expect(digest.textContent).not.toContain('no plot committed');
        g.dispose();
    });

    it('the `all`-scope selector is probed FIRST and still wins where it renders', () => {
        // The analysis fact renderer still emits `parcel-law-fact-parcel-area` in `all` scope — the
        // rendering a host with no card beside it gets — and in `plot` scope for the
        // scene-measured row when the committed ring disagrees with the published one. Re-pointing
        // the probe must not cost those surfaces their digest, so the old selector is KEPT, and
        // kept first. A "fix" that replaced it would trade one blanked digest for another.
        const g = buildQuestionGroup(q1Spec());
        const digest = g.element.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}plot"]`)!;
        const own = document.createElement('div');
        own.setAttribute('data-testid', 'parcel-law-fact-parcel-area');
        const v = document.createElement('span');
        v.className = 'anl-plaw-val';
        v.textContent = '803 m²';
        own.appendChild(v);
        g.body.appendChild(own);
        // …and the card's row too, so the ORDER is what is under test, not mere resolution.
        g.body.appendChild(cardAreaRow('801 m²'));
        g.refreshDigest();
        expect(digest.textContent).toContain('803 m²');
        g.dispose();
    });

    it('⛔ the geometry-absent sentence still wins over nothing — the absence arm is not lost', () => {
        // `PARCEL_LAW_GEOMETRY_ABSENT_TEXT` is a missing READ, not a missing constraint, and it is
        // the one thing a card row cannot say. Inserting a third probe ahead of it would have been
        // the easy way to break it.
        const g = buildQuestionGroup(q1Spec());
        const digest = g.element.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}plot"]`)!;
        const miss = document.createElement('div');
        miss.setAttribute('data-testid', 'parcel-law-geometry-absent');
        miss.setAttribute('data-absence', 'ring-unreadable');
        miss.textContent = 'Parcel outline unavailable.';
        g.body.appendChild(miss);
        g.refreshDigest();
        expect(digest.textContent).toContain('Parcel outline unavailable');
        expect(digest.textContent).not.toContain('no plot committed');
        g.dispose();
    });
});

describe('§STAGE-01-DENSITY — the fold accessors are the ONE map, not a sixth (C115 §11 `C115-91`)', () => {
    beforeEach(() => { resetQuestionGroupOpenState(); });

    it('remembers a disclosure the reader opened, and forgets it on the test-only reset', () => {
        // ⭐ THE PROPERTY THAT MATTERS: the cadastral card is rebuilt WHOLE on every site-store
        // notification, so a fold that remembered nothing would snap shut under the reader's
        // cursor several times a minute — `C115-92`, *"an obstacle, not a dropdown"*.
        expect(questionGroupFoldIsOpen('parcel-full-technical-detail')).toBe(false);
        expect(questionGroupFoldIsOpen('parcel-full-technical-detail', true)).toBe(true);
        setQuestionGroupFoldOpen('parcel-full-technical-detail', true);
        expect(questionGroupFoldIsOpen('parcel-full-technical-detail')).toBe(true);
        resetQuestionGroupOpenState();
        expect(questionGroupFoldIsOpen('parcel-full-technical-detail')).toBe(false);
    });

    it('⛔ shares ONE key space with the question groups — a collision would be a real bug, and is visible', () => {
        // The two live in one map ON PURPOSE (`C115-91` forbids a third), so the keys must not
        // collide. A group id is a bare word (`plot`); a fold key is a `data-testid`. This arm
        // exists so that a future fold keyed `plot` fails here rather than silently opening a
        // question group the reader never touched.
        setQuestionGroupFoldOpen('parcel-full-technical-detail', true);
        expect(PARCEL_LAW_QUESTION_GROUPS.some((g) => g.id === 'parcel-full-technical-detail')).toBe(false);
    });
});
