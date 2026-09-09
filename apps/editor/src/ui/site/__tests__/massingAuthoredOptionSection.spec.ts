/**
 * §CREATE-IT-MYSELF (L-13039, STR §25.3 / §26.6.3) — THE MASSING OPTION THAT IS NOT GENERATED.
 *
 * ⭐ THE FOUR PROPERTIES THIS SUITE EXISTS TO PIN, in the order they can hurt:
 *   1. **THE ENTRY IS FIRST-CLASS.** It renders on the IDLE arm (before Generate) and on the
 *      COMPUTED arm (beside the generated options) of the SHIPPED fold — not on a rival surface.
 *   2. **THE AXIS IS PROVENANCE, NEVER THE NAME.** An `authored` envelope on the ground storey
 *      makes the entry read *"Your own — N m² · chosen"*; a `predates-provenance` one is a THIRD
 *      state that blocks but is NOT presented as the user's own.
 *   3. **THE REFUSAL IS STATED BEFORE ANY CLICK.** Once the user's own envelope exists, every
 *      generated card carries the pre-click refusal with the blocker's number.
 *   4. **ONE ROUTE.** The button opens whatever `open` the caller wires — production passes
 *      `window.pryzmOpenSiteEnvelopeTool`; no draw gesture and no second panel live here.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../massingSitingContext', () => ({
    resolveLiveMassingSitingContext: () => null,
    resolveLiveTargetGroundFloorAreaM2: () => null,
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    authoredProvenance,
    provenancePredatingTheField,
    systemProvenance,
} from '@pryzm/schemas/provenance';
import {
    enumerateMassingOptions,
    resolveAuthoredMassingState,
    type MassingOptionInputs,
} from '../massingOptionModel';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from '../levelEnvelopeSupersession';
import {
    buildAuthoredMassingOptionHtml,
    buildAuthoredBlockLineHtml,
    wireAuthoredMassingOption,
    MASSING_AUTHOR_OPTION_TESTID,
    MASSING_AUTHOR_BTN_TESTID,
    MASSING_AUTHORED_BLOCK_ATTR,
} from '../massingAuthoredOptionSection';
import {
    buildMassingOptionsFold,
    MASSING_OPTIONS_GENERATE_BTN_TESTID,
    MASSING_PICK_ATTR,
} from '../envelopeCardSections';

afterEach(() => {
    document.body.innerHTML = '';
});

const OWN: ExistingLevelEnvelope = {
    id: 'spaceEnvelope_own',
    levelId: 'L0',
    name: 'My ground floor',
    footprintAreaM2: 210,
    provenance: authoredProvenance('drawn in the site envelope tool'),
};
const GENERATED: ExistingLevelEnvelope = {
    id: 'spaceEnvelope_gen',
    levelId: 'L0',
    name: 'Proposed ground floor · 301 m²',
    footprintAreaM2: 301,
    provenance: systemProvenance('computed', 'fitted by the massing solver'),
};
const PREDATES: ExistingLevelEnvelope = {
    id: 'spaceEnvelope_old',
    levelId: 'L0',
    name: 'Proposed ground floor · 431 m²',
    footprintAreaM2: 431,
    provenance: provenancePredatingTheField(),
};
const UPSTAIRS: ExistingLevelEnvelope = { ...OWN, id: 'spaceEnvelope_up', levelId: 'L1' };

const readable = (rows: readonly ExistingLevelEnvelope[]): LevelEnvelopeReadResult => ({ readable: true, rows });

describe('resolveAuthoredMassingState — provenance decides, the name never does', () => {
    it('OFFERS the route when the ground storey is clear', () => {
        expect(resolveAuthoredMassingState(readable([]), 'L0')).toEqual({ kind: 'offer' });
    });

    it('OFFERS the route when only PRYZM-generated envelopes are on the storey (they are replaceable)', () => {
        expect(resolveAuthoredMassingState(readable([GENERATED]), 'L0').kind).toBe('offer');
    });

    it('⭐ an AUTHORED envelope on the ground storey IS the chosen massing, with its number', () => {
        const s = resolveAuthoredMassingState(readable([OWN, GENERATED]), 'L0');
        expect(s.kind).toBe('chosen');
        if (s.kind !== 'chosen') return;
        expect(s.envelope.id).toBe(OWN.id);
        expect(s.label).toBe('Your own — 210 m²');
        expect(s.othersOnStorey).toBe(1);
        // The block sentence is the supersession rule's OWN — one producer for one refusal.
        expect(s.blockSentence).toContain('PRYZM will not delete');
    });

    it('⛔ a `predates-provenance` envelope is NOT presented as the user\'s own — a THIRD state', () => {
        const s = resolveAuthoredMassingState(readable([PREDATES]), 'L0');
        expect(s.kind).toBe('blocked-unknown');
        if (s.kind !== 'blocked-unknown') return;
        expect(s.envelopes.map((e) => e.id)).toEqual([PREDATES.id]);
        expect(s.blockSentence).toContain('cannot prove it generated');
    });

    it('looks at the GROUND storey only — an authored envelope upstairs does not claim the ground', () => {
        expect(resolveAuthoredMassingState(readable([UPSTAIRS]), 'L0').kind).toBe('offer');
        expect(resolveAuthoredMassingState(readable([UPSTAIRS]), 'L1').kind).toBe('chosen');
    });

    it('⛔ an unreadable store is UNREADABLE, never an empty storey', () => {
        const s = resolveAuthoredMassingState(
            { readable: false, reason: 'store-threw', text: 'Reading the space-envelope store failed' }, 'L0');
        expect(s.kind).toBe('unreadable');
        if (s.kind === 'unreadable') expect(s.text).toContain('failed');
    });

    it('no ground storey ⇒ says so, and still leaves the route open', () => {
        const s = resolveAuthoredMassingState(readable([OWN]), null);
        expect(s.kind).toBe('no-ground-level');
    });
});

describe('the card — one entry, present before and beside the generated options', () => {
    it('renders the OFFER with the button that opens the tool, and says it is not generated', () => {
        document.body.innerHTML = buildAuthoredMassingOptionHtml({ kind: 'offer' });
        const card = document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`)!;
        expect(card).not.toBeNull();
        expect(card.getAttribute('data-state')).toBe('offer');
        expect(card.textContent).toContain('Create it myself');
        expect(card.textContent).toContain('not generated');
        expect(document.querySelector(`[data-testid="${MASSING_AUTHOR_BTN_TESTID}"]`)).not.toBeNull();
    });

    it('⭐ renders "Your own — N m² · chosen" once the authored envelope exists, with the refusal in full', () => {
        const s = resolveAuthoredMassingState(readable([OWN, GENERATED]), 'L0');
        document.body.innerHTML = buildAuthoredMassingOptionHtml(s);
        const card = document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`)!;
        expect(card.getAttribute('data-state')).toBe('chosen');
        expect(card.textContent).toContain('Your own — 210 m² · chosen');
        expect(card.textContent).toContain('keeping any of them would be refused');
        expect(card.textContent).toContain('PRYZM will not delete');
        expect(card.textContent).toContain('1 other level envelope');
        // The button is still there: the user's own massing is EDITED through the same tool.
        expect(document.querySelector(`[data-testid="${MASSING_AUTHOR_BTN_TESTID}"]`)!.textContent).toContain('Edit');
    });

    it('renders the unknown-origin arm as exactly that — not as yours, not as PRYZM\'s', () => {
        document.body.innerHTML = buildAuthoredMassingOptionHtml(resolveAuthoredMassingState(readable([PREDATES]), 'L0'));
        const card = document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`)!;
        expect(card.getAttribute('data-state')).toBe('blocked-unknown');
        expect(card.textContent).toContain('cannot prove it generated');
        expect(card.textContent).toContain('431 m²');
        expect(card.textContent).not.toContain('Your own');
    });

    it('with NO resolved state the route is still offered — the tool is never gated', () => {
        document.body.innerHTML = buildAuthoredMassingOptionHtml(null);
        expect(document.querySelector(`[data-testid="${MASSING_AUTHOR_BTN_TESTID}"]`)).not.toBeNull();
    });

    it('the button calls the ONE route the caller wires — and nothing else', () => {
        document.body.innerHTML = buildAuthoredMassingOptionHtml({ kind: 'offer' });
        let opened = 0;
        wireAuthoredMassingOption(document.body, () => { opened++; });
        (document.querySelector(`[data-testid="${MASSING_AUTHOR_BTN_TESTID}"]`) as HTMLButtonElement).click();
        expect(opened).toBe(1);
    });

    it('escapes runtime strings (C08 §3.1)', () => {
        const hostile: ExistingLevelEnvelope = { ...OWN, name: '<img src=x onerror=alert(1)>' };
        document.body.innerHTML = buildAuthoredMassingOptionHtml(resolveAuthoredMassingState(readable([hostile]), 'L0'));
        expect(document.querySelector('img')).toBeNull();
        expect(document.body.textContent).toContain('<img');
    });
});

describe('the pre-click refusal on each GENERATED card', () => {
    it('is EMPTY when nothing on the storey would refuse', () => {
        expect(buildAuthoredBlockLineHtml({ kind: 'offer' })).toBe('');
        expect(buildAuthoredBlockLineHtml(null)).toBe('');
    });

    it('⭐ names the authored blocker with its number when the user\'s own envelope exists', () => {
        document.body.innerHTML = buildAuthoredBlockLineHtml(resolveAuthoredMassingState(readable([OWN]), 'L0'));
        const line = document.querySelector(`[${MASSING_AUTHORED_BLOCK_ATTR}="chosen"]`)!;
        expect(line).not.toBeNull();
        expect(line.textContent).toContain('will be refused');
        expect(line.textContent).toContain('210 m²');
        expect(line.textContent).toContain('will not delete');
    });

    it('names the unknown-origin blocker as unknown, with the count', () => {
        document.body.innerHTML = buildAuthoredBlockLineHtml(resolveAuthoredMassingState(readable([PREDATES, GENERATED]), 'L0'));
        const line = document.querySelector(`[${MASSING_AUTHORED_BLOCK_ATTR}="unknown"]`)!;
        expect(line).not.toBeNull();
        expect(line.textContent).toContain('1 level envelope PRYZM cannot prove it generated');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ REACHABILITY — the SHIPPED fold carries the entry on BOTH arms, and each generated card
// carries the refusal line. Not a rival surface: the same `buildMassingOptionsFold` the card calls.
// ─────────────────────────────────────────────────────────────────────────────

const RING = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 25 }, { x: 0, z: 25 }];
const INPUTS: MassingOptionInputs = {
    permittedRing: RING, permittedFootprintM2: 1000, permittedGfaM2: 3000, maxFloors: 3, maxHeightM: 10.5,
    parcelAreaM2: 1400, targetGroundFloorAreaM2: null, siting: null,
};

describe('the entry reaches the shipped fold', () => {
    it('IDLE arm: the entry sits beside the Generate button', () => {
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'idle' }, { kind: 'offer' });
        expect(document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`)).not.toBeNull();
        expect(document.querySelector(`[data-testid="${MASSING_OPTIONS_GENERATE_BTN_TESTID}"]`)).not.toBeNull();
    });

    it('⭐ REFUSED arm: the entry SURVIVES a refusal — §CREATE-IT-MYSELF-SURVIVES-A-REFUSAL (L-13280)', () => {
        // THE ARM THAT DID NOT EXIST, WHICH IS HOW THE DEFECT SHIPPED. This suite already
        // covered IDLE and COMPUTED, and the fold's own comment claimed the entry was "first on
        // BOTH arms" — so the prose asserted the invariant and nothing measured the third arm.
        //
        // THE FOUNDER-VISIBLE SEQUENCE it protects: on a `degenerate` envelope the card renders
        // on the FULL arm with the authored entry on screen; pressing Generate refuses; the
        // panel refreshes onto THIS arm; and the entry vanished — his own click deleting the
        // only route into the draw tool. *"the massing should be enabled anyways"*.
        const refused = enumerateMassingOptions({ ...INPUTS, permittedRing: [{ x: 0, z: 0 }, { x: 1, z: 0 }] });
        expect(refused.ok, 'fixture must actually refuse, or this arm proves nothing').toBe(false);
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set: refused }, { kind: 'offer' });

        const entry = document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`);
        expect(entry, 'the draw-my-own entry must survive a generation refusal').not.toBeNull();

        // ⛔ AND IT LEADS. A refusal banner above the entry reads as "unavailable, but here is
        // a consolation"; the authored route is an INDEPENDENT way in, not a fallback.
        const warning = [...document.querySelectorAll('div')]
            .find((d) => /\S/.test(d.textContent ?? '') && d.children.length === 0
                && (d.getAttribute('style') ?? '').includes('#fff6e8'));
        expect(warning, 'the refusal text must still be shown').toBeTruthy();
        expect(entry!.compareDocumentPosition(warning!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // ⚠ AND NO GENERATE BUTTON. `enumerateMassingOptions` refuses by construction here, so
        // a Generate control on this arm could only ever refuse again — a dead click.
        expect(document.querySelector(`[data-testid="${MASSING_OPTIONS_GENERATE_BTN_TESTID}"]`)).toBeNull();
    });

    it('COMPUTED arm: the entry leads, and with an authored envelope every generated card states the refusal', () => {
        const set = enumerateMassingOptions(INPUTS);
        if (!set.ok) throw new Error('expected options');
        const authored = resolveAuthoredMassingState(readable([OWN]), 'L0');
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set }, authored);
        const entry = document.querySelector(`[data-testid="${MASSING_AUTHOR_OPTION_TESTID}"]`)!;
        expect(entry).not.toBeNull();
        expect(entry.getAttribute('data-state')).toBe('chosen');
        const cards = document.querySelectorAll('[data-massing-option]');
        expect(cards.length).toBe(8);
        // The entry comes BEFORE the first generated card in document order.
        expect(entry.compareDocumentPosition(cards[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // Every generated card with a pick button carries the pre-click refusal beside it.
        const withButton = [...cards].filter((c) => c.querySelector(`[${MASSING_PICK_ATTR}]`) !== null);
        expect(withButton.length).toBeGreaterThan(0);
        for (const c of withButton) {
            expect(c.querySelector(`[${MASSING_AUTHORED_BLOCK_ATTR}="chosen"]`), c.getAttribute('data-massing-option') ?? '').not.toBeNull();
        }
    });

    it('COMPUTED arm, storey clear: no refusal lines — nothing is refused that would not be', () => {
        const set = enumerateMassingOptions(INPUTS);
        if (!set.ok) throw new Error('expected options');
        document.body.innerHTML = buildMassingOptionsFold({ kind: 'computed', set }, { kind: 'offer' });
        expect(document.querySelector(`[${MASSING_AUTHORED_BLOCK_ATTR}]`)).toBeNull();
    });

    it('⭐ SOURCE PIN — GISAreaLayout resolves the state, passes it to the fold, and wires the ONE route', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        expect(src).toContain('resolveAuthoredMassingState(');
        expect(src).toContain('wireAuthoredMassingOption(panel');
        expect(src).toContain('window.pryzmOpenSiteEnvelopeTool');
    });
});
