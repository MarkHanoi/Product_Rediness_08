/**
 * §USE-THIS-PLATE-KEEPS-THE-LOOP + §FOLD-MEMORY (L-13078) — THE COMPARE LOOP.
 *
 * Subjects:  apps/editor/src/ui/site/envelopeCardSections.ts
 *            apps/editor/src/ui/site/targetFootprintAreaState.ts
 *            apps/editor/src/ui/layout/GISAreaLayout.ts (source pins)
 * Strategy:  STR §26.6 (*"compare side by side"*)
 * Contracts: C58 §1.4 (a mark is a claim, and a claim needs its subject) · C43 (a11y)
 *
 * Founder 2026-09-07: *"when I click 'use this plate' I want to still be kept on the massing
 * options — so that I can select another one."* His trace shows four plates picked in a row at
 * 190.2 -> 275.8 -> 451.9 -> 150.7 m², which is the loop the massing feature exists for.
 *
 * ⭐ WHY THIS FILE EXISTS AT ALL: the fix shipped in `d128edee` with NO spec of its own. Three
 * separate mechanisms have to hold together for the loop to stay open, and each is individually
 * plausible-looking while broken:
 *   1. the chosen option is MARKED, and every option — including that one — stays pickable;
 *   2. the fold REMEMBERS it was open, across the `panel.innerHTML = …` swap the pick triggers;
 *   3. the card's scroll offset survives that swap, so the row does not leave the cursor.
 *
 * ⚠ WHAT IS NOT PROVEN HERE, SAID PLAINLY: this suite drives the BUILDERS and pins the call sites
 * in `GISAreaLayout.ts` by source. It does not mount the GIS card, so "the founder's click keeps
 * his place" is established from its parts, not end to end. Pixels are unverified.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../massingSitingContext', () => ({
    resolveLiveMassingSitingContext: () => null,
    resolveLiveTargetGroundFloorAreaM2: () => null,
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enumerateMassingOptions, type MassingOptionInputs } from '../massingOptionModel';
import {
    buildMassingOptionsFold,
    resetEnvelopeCardFoldState,
    wireEnvelopeCardFoldMemory,
    MASSING_CHOSEN_ATTR,
    MASSING_PICK_ATTR,
    MASSING_OPTIONS_SECTION_TESTID,
} from '../envelopeCardSections';
import {
    __resetTargetFootprintProposalForTests,
    getChosenMassingOptionId,
    getTargetFootprintProposal,
    setTargetFootprintProposal,
    clearTargetFootprintProposal,
} from '../targetFootprintAreaState';
import type { TargetFootprintProposal } from '../targetFootprintAreaSolver';

const RING = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 25 }, { x: 0, z: 25 }];
const INPUTS: MassingOptionInputs = {
    permittedRing: RING, permittedFootprintM2: 1000, permittedGfaM2: 3000, maxFloors: 3, maxHeightM: 10.5,
    parcelAreaM2: 1400, targetGroundFloorAreaM2: null, siting: null,
};

function options() {
    const set = enumerateMassingOptions(INPUTS);
    if (!set.ok) throw new Error('expected options');
    return set;
}

/** The first option that actually offers a plate — the only kind that can be chosen. */
function firstPickable(): string {
    const set = options();
    const o = set.options.find((x) => x.proposal !== null);
    if (!o) throw new Error('expected at least one option with a proposal');
    return o.id;
}

afterEach(() => {
    document.body.innerHTML = '';
    resetEnvelopeCardFoldState();
    __resetTargetFootprintProposalForTests();
});

describe('§USE-THIS-PLATE — the chosen option is MARKED, and nothing is locked', () => {
    it('⭐ marks the chosen row, and EVERY option that had a button still has one', () => {
        const set = options();
        const chosen = firstPickable();
        const before = buildMassingOptionsFold({ kind: 'computed', set }, null, null);
        document.body.innerHTML = before;
        const buttonsBefore = document.querySelectorAll(`[${MASSING_PICK_ATTR}]`).length;
        expect(buttonsBefore).toBeGreaterThan(1);

        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set }, null, chosen);
        // ⛔ THE COUNT IS THE ASSERTION. The founder's ask is *"so that I can select another
        // one"* — a chosen row that stopped being pickable, or that consumed the others, would
        // end the compare loop one step later than losing the fold did.
        expect(document.querySelectorAll(`[${MASSING_PICK_ATTR}]`)).toHaveLength(buttonsBefore);
        const row = document.querySelector(`[data-massing-option="${chosen}"]`)!;
        expect(row.getAttribute(MASSING_CHOSEN_ATTR)).toBe('1');
        expect(row.querySelector(`[${MASSING_PICK_ATTR}]`)).not.toBeNull();
    });

    it('aria-pressed is TRUE on the chosen one and FALSE on every other — one is in use, none are dead', () => {
        const set = options();
        const chosen = firstPickable();
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set }, null, chosen);
        for (const b of document.querySelectorAll(`[${MASSING_PICK_ATTR}]`)) {
            const id = b.getAttribute(MASSING_PICK_ATTR);
            expect(b.getAttribute('aria-pressed')).toBe(id === chosen ? 'true' : 'false');
            // ⛔ NEVER DISABLED. `aria-pressed` says "this is the one in use"; `disabled` would
            // say "you cannot go back to it", which is the opposite of what was asked for.
            expect(b.hasAttribute('disabled')).toBe(false);
        }
        // Exactly one row is marked — a second mark would make the card state two answers.
        expect(document.querySelectorAll(`[${MASSING_CHOSEN_ATTR}="1"]`)).toHaveLength(1);
    });

    it('the SUMMARY names the choice, so a collapsed fold is still an answer', () => {
        // Before this the only trace of a pick was prose inside a SECOND default-collapsed fold:
        // the user had to open two folds to learn what he had just clicked.
        const set = options();
        const chosen = firstPickable();
        const label = set.options.find((o) => o.id === chosen)!.label;
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set }, null, chosen);
        const summary = document.querySelector(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"] summary`,
        )!;
        expect(summary.textContent).toContain(label);
        expect(summary.textContent).toContain('using');
    });

    it('no chosen id ⇒ no mark anywhere — the card never states a choice nobody made', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null);
        expect(document.querySelector(`[${MASSING_CHOSEN_ATTR}="1"]`)).toBeNull();
        for (const b of document.querySelectorAll(`[${MASSING_PICK_ATTR}]`)) {
            expect(b.getAttribute('aria-pressed')).toBe('false');
        }
    });

    it('an id matching NO option marks nothing rather than marking the first', () => {
        // A stale id (options regenerated under it) must degrade to "unmarked", never to a
        // confident tick on an arbitrary row.
        document.body.innerHTML = buildMassingOptionsFold(
            { kind: 'computed', set: options() }, null, 'no-such-option',
        );
        expect(document.querySelector(`[${MASSING_CHOSEN_ATTR}="1"]`)).toBeNull();
    });
});

describe('§USE-THIS-PLATE — the id travels with the plate, and cannot outlive it', () => {
    // ⛔ THE FIXTURE IS THE REAL TYPE, NOT `as never`. It was written as a three-field object cast
    // to `never`, and that cast did two bad things: it made `{ ...PLATE }` a type error (you
    // cannot spread `never`, which is what root tsc caught), and — worse — it meant the fixture
    // was not required to look like a `TargetFootprintProposal` at all. A stub that cannot fail to
    // match its interface cannot warn you when the interface moves; if a field is added to
    // `TargetFootprintProposal` tomorrow, THIS declaration goes red, which is the whole point of
    // having it typed. All seven fields are stated, and the three the assertions actually read
    // (`ring`, `achievedAreaM2`, `statement`) carry the founder's own 190.2 m² first plate.
    const PLATE: TargetFootprintProposal = {
        ok: true,
        ring: RING,
        achievedAreaM2: 190.2,
        targetAreaM2: 190,
        permittedAreaM2: 480,
        insetM: 2.4,
        statement: 'a plate',
    };

    it('the chosen id is written by the SAME call that writes the plate', () => {
        setTargetFootprintProposal(PLATE, 'opt-a');
        expect(getTargetFootprintProposal()).not.toBeNull();
        expect(getChosenMassingOptionId()).toBe('opt-a');
    });

    it('⛔ withdrawing the plate withdraws the mark — no surface can tick nothing', () => {
        setTargetFootprintProposal(PLATE, 'opt-a');
        setTargetFootprintProposal(null, 'opt-a');
        expect(getChosenMassingOptionId()).toBeNull();
        setTargetFootprintProposal(PLATE, 'opt-a');
        clearTargetFootprintProposal();
        expect(getChosenMassingOptionId()).toBeNull();
    });

    it('⭐ a caller that chooses no option CLEARS the mark rather than inheriting the last one', () => {
        // This is what makes the id impossible to stale: typing an area calls the same setter
        // with one argument, and the default null wipes the previous pick.
        setTargetFootprintProposal(PLATE, 'opt-a');
        setTargetFootprintProposal({ ...PLATE, achievedAreaM2: 275.8 });
        expect(getTargetFootprintProposal()).not.toBeNull();
        expect(getChosenMassingOptionId()).toBeNull();
    });

    it('picking a DIFFERENT option overwrites the same one slot — the loop is re-runnable', () => {
        // The founder's trace: four plates in a row. Each pick replaces, none accumulates.
        for (const [area, id] of [[190.2, 'a'], [275.8, 'b'], [451.9, 'c'], [150.7, 'd']] as const) {
            setTargetFootprintProposal({ ...PLATE, achievedAreaM2: area }, id);
            expect(getChosenMassingOptionId()).toBe(id);
        }
    });
});

describe('§FOLD-MEMORY — a fold the reader opened stays open across the card\'s own repaints', () => {
    /**
     * Rebuild the card the way `GISAreaLayout` does — destroy and re-emit — and re-attach the
     * memory. `scrollTop` is captured BEFORE the swap because the assignment zeroes it.
     */
    function repaint(host: HTMLElement, html: string): void {
        const before = host.scrollTop;
        host.innerHTML = html;
        wireEnvelopeCardFoldMemory(host, { scroller: host, scrollTop: before });
    }

    it('⛔ COLD ARRIVAL IS STILL COLLAPSED — the half of the old contract that was kept', () => {
        // `fold()`'s reversed comment says the DEFAULT did not change; only what happens after
        // the reader opens one did. A new session must get the designed defaults back.
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null);
        const d = document.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!;
        expect(d.hasAttribute('open')).toBe(false);
    });

    it('⭐ THE DEFECT: opening the fold, then repainting, brings it back OPEN', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));

        const d = host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!;
        expect(d.hasAttribute('open')).toBe(false);
        // ⚠ `toggle` IS DISPATCHED EXPLICITLY. Setting `.open` fires it natively in a browser;
        // the DOM stand-in does not guarantee that, and a test that relied on it would be
        // asserting the stand-in's behaviour rather than the panel's listener.
        d.open = true;
        d.dispatchEvent(new Event('toggle'));

        // The pick's repaint — the exact gesture that used to slam the list shut.
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, firstPickable()));
        const after = host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!;
        expect(after.hasAttribute('open')).toBe(true);
        // …and the pick is now visible in the reopened list, which is the point of keeping it open.
        expect(after.querySelector(`[${MASSING_CHOSEN_ATTR}="1"]`)).not.toBeNull();
    });

    it('closing it again is remembered too — the memory is the reader\'s, not a one-way latch', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        const d = host.querySelector<HTMLDetailsElement>(`[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`)!;
        d.open = true; d.dispatchEvent(new Event('toggle'));
        d.open = false; d.dispatchEvent(new Event('toggle'));
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        expect(host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!.hasAttribute('open')).toBe(false);
    });

    it('⛔ the memory is keyed by TESTID — one section\'s disclosure never lands on another', () => {
        // An INDEX key would silently move a reader's disclosure onto a different section the
        // moment the card's section plan changes, which is worse than not remembering it. The
        // observation: open a DIFFERENT fold that happens to sit at index 0, then build the
        // massing fold — which is also at index 0 in its own render — and it must be CLOSED.
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = '<details data-testid="some-other-section"><summary>a</summary><p>A</p></details>';
        wireEnvelopeCardFoldMemory(host);
        const other = host.querySelector<HTMLDetailsElement>('[data-testid="some-other-section"]')!;
        other.open = true; other.dispatchEvent(new Event('toggle'));

        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        expect(host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!.hasAttribute('open')).toBe(false);
    });

    it('a <details> with no testid is SKIPPED, not keyed by position, and never throws', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = '<details><summary>anonymous</summary><p>C</p></details>';
        expect(() => wireEnvelopeCardFoldMemory(host)).not.toThrow();
        const anon = host.querySelector<HTMLDetailsElement>('details')!;
        anon.open = true; anon.dispatchEvent(new Event('toggle'));
        // Nothing was recorded for it, so the massing fold — rendered next — is unaffected.
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        expect(host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!.hasAttribute('open')).toBe(false);
    });

    it('the scroll offset survives the swap — an open fold cannot push the row out of reach', () => {
        // ⚠ THE CONSEQUENCE THE FOUNDER WAS WARNED ABOUT when he ruled that every fold
        // remembers: with several open the card is tall inside its own `maxHeight`, and a swap
        // that reset `scrollTop` to 0 would throw him back to the top on every pick.
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = '<details data-testid="x"><summary>s</summary><p>b</p></details>';
        wireEnvelopeCardFoldMemory(host, { scroller: host, scrollTop: 148 });
        expect(host.scrollTop).toBe(148);
    });

    it('a zero or absent offset is left alone — a shorter card legitimately clamps it', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.scrollTop = 0;
        wireEnvelopeCardFoldMemory(host, { scroller: host, scrollTop: 0 });
        expect(host.scrollTop).toBe(0);
        expect(() => wireEnvelopeCardFoldMemory(host)).not.toThrow();
        expect(() => wireEnvelopeCardFoldMemory(host, { scroller: null })).not.toThrow();
    });

    it('resetEnvelopeCardFoldState forgets everything — a new session gets the defaults back', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        const d = host.querySelector<HTMLDetailsElement>(`[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`)!;
        d.open = true; d.dispatchEvent(new Event('toggle'));
        resetEnvelopeCardFoldState();
        repaint(host, buildMassingOptionsFold({ kind: 'computed', set: options() }, null, null));
        expect(host.querySelector<HTMLDetailsElement>(
            `[data-testid="${MASSING_OPTIONS_SECTION_TESTID}"]`,
        )!.hasAttribute('open')).toBe(false);
    });
});

describe('§USE-THIS-PLATE — SOURCE PINS: the card actually does these three things', () => {
    const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

    it('the pick carries the option id into the ONE proposal channel', () => {
        expect(src).toContain('setTargetFootprintProposal(option.proposal, option.id)');
        // ⛔ ONE CHANNEL. A sibling store gaining a write on the same click is the defect this
        // whole section is built to avoid.
        expect(src.match(/setTargetFootprintProposal\(option\./g) ?? []).toHaveLength(1);
    });

    it('the STALENESS GATE is asked BEFORE the mark is rendered', () => {
        // A tick beside a plate the gate has withdrawn is a verification artefact outliving its
        // subject. The id is read only on the live arm.
        expect(src).toContain('const liveForMark = resolveLiveTargetFootprintProposal(');
        expect(src).toContain('liveForMark === null ? null : getChosenMassingOptionId()');
    });

    it('EVERY innerHTML swap of the card captures the scroll offset and re-attaches the memory', () => {
        // ⛔ COUNTED, NOT SPOT-CHECKED. The card has more than one builder; a swap that forgot
        // to re-wire would silently lose the memory on exactly one arm — the hardest kind of
        // half-fix to notice, because the other arm keeps working.
        const captures = src.match(/const envScrollBefore = panel\.scrollTop;/g) ?? [];
        const restores = src.match(/restoreEnvelopeCardDisclosure\(panel, envScrollBefore\)/g) ?? [];
        expect(captures.length).toBeGreaterThanOrEqual(2);
        expect(restores).toHaveLength(captures.length);
    });
});
