// ADR-0383 S7 (lane MP-UI, 2026-09-09) — THE SITE-PANEL MASTER-PLANNING SECTION.
//
// ADR-0383 D1 / D4 / D5 / D6 · C58 §1.2 (a fold may not hide a warning) · C115 §11 `C115-91` ·
// C115 §2.2 / §6 (question 2 is where you ACT) · C16 CA-2 · C59 §2.10 · §CONTEXT-DATA-HONESTY.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    mountMassingGroupSection,
    describeMassingGroupRoster,
    leadSentenceOf,
    MASSING_GROUP_ROOT_TESTID,
    MASSING_GROUP_VERDICT_TESTID,
    MASSING_GROUP_ADVISORY_TESTID,
    MASSING_GROUP_GAP_TESTID,
    MASSING_GROUP_FOLD_ID,
    MASSING_GROUP_ROW_TESTID,
    MASSING_GROUP_SINGLE_TESTID,
    MASSING_GROUP_STOREY_INPUT_TESTID,
    MASSING_GROUP_APPLY_TESTID,
    MASSING_GROUP_STOREY_NOTE_TESTID,
    MASSING_GROUP_ID_ATTR,
    type MassingGroupSectionDeps,
} from '../massingGroupSection';
import { findMassingGroupOverlaps, readMassingGroups } from '../massingGroupRoster';
import {
    getMassingGroupSelection,
    setMassingGroupSelection,
    __resetMassingGroupSelectionForTests,
} from '../massingGroupSelectionState';
import { MASSING_GROUP_SET_STOREYS_VERB } from '../massingGroupStoreyPlan';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6, height: 3 },
];

type Ring = readonly (readonly [number, number])[];
const SQ_10: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
const SQ_SHIFT: Ring = [[5, 0], [15, 0], [15, 10], [5, 10]];
const BOWTIE: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];

function envRec(
    id: string, levelId: string,
    group: { id: string; label: string } | null,
    ring: Ring | null = SQ_10, areaM2: number | null = 100,
): Record<string, unknown> {
    const r: Record<string, unknown> = {
        id, role: 'level', levelId, provenance: { origin: 'authored' }, height: 3,
    };
    if (group !== null) r.group = group;
    if (areaM2 !== null) r.footprintAreaM2 = areaM2;
    if (ring !== null) r.footprint = ring.map(([x, z]) => ({ x, y: 0, z }));
    return r;
}

function storeOf(recs: readonly Record<string, unknown>[]) {
    const m = new Map<string, unknown>();
    for (const r of recs) m.set(r.id as string, r);
    return { getState: () => m as ReadonlyMap<string, unknown> };
}

const A = { id: 'g-a', label: 'Block A' };
const B = { id: 'g-b', label: 'Block B' };

let host: HTMLElement;
let mounted: { dispose(): void } | null = null;

function deps(over: Partial<MassingGroupSectionDeps> = {}): MassingGroupSectionDeps {
    return {
        readStore: () => storeOf([envRec('a0', 'L0', A)]),
        readLevels: () => LEVELS,
        readRegisteredCommandTypes: () => [],
        dispatch: () => {},
        mintId: (() => { let n = 0; return () => `minted-${n++}`; })(),
        ...over,
    };
}

function mount(over: Partial<MassingGroupSectionDeps> = {}) {
    const h = mountMassingGroupSection(host, deps(over));
    mounted = h;
    return h;
}

const q = (sel: string): HTMLElement | null => host.querySelector(sel);
const qa = (sel: string): HTMLElement[] => [...host.querySelectorAll(sel)] as HTMLElement[];
const byTid = (t: string): HTMLElement | null => q(`[data-testid="${t}"]`);
const allTid = (t: string): HTMLElement[] => qa(`[data-testid="${t}"]`);

beforeEach(() => {
    __resetMassingGroupSelectionForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
});
afterEach(() => {
    try { mounted?.dispose(); } catch { /* teardown */ }
    mounted = null;
    host.remove();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('the un-foldable verdict line is the summary’s FIRST SENTENCE, never a rival', () => {
    // `SiteScopeSlider.ts:546-549`: *"a rival sentence here is exactly the rival-solver shape"*, and
    // a biconditional test would not catch a rival that differs only in WORDING. So the arm is
    // IDENTITY against the one producer, not a string match on hand-written prose.

    it('the rendered verdict === leadSentenceOf(describeMassingGroupRoster(...)) — identity, not resemblance', () => {
        const recs = [envRec('a0', 'L0', A), envRec('a1', 'L1', A), envRec('b0', 'L0', B, SQ_SHIFT)];
        mount({ readStore: () => storeOf(recs) });
        const roster = readMassingGroups(storeOf(recs), LEVELS);
        const expected = leadSentenceOf(describeMassingGroupRoster(roster, findMassingGroupOverlaps(roster)));
        expect(byTid(MASSING_GROUP_VERDICT_TESTID)!.textContent).toBe(expected);
    });

    it('it is ONE sentence — the founder has twice called this panel too large', () => {
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]) });
        const text = byTid(MASSING_GROUP_VERDICT_TESTID)!.textContent ?? '';
        expect(text).toMatch(/^[^.]*\.$/);
        expect(text).toContain('1 block');
        expect(text).toContain('2 envelopes');
    });

    it('leadSentenceOf returns the WHOLE text when there is no sentence break', () => {
        expect(leadSentenceOf('One sentence only.')).toBe('One sentence only.');
        expect(leadSentenceOf('First. Second.')).toBe('First.');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ §CONTEXT-DATA-HONESTY — an unreadable store is not an empty parcel', () => {
    it('no store ⇒ the honest text on the FACE of the section, and NO roster rows', () => {
        mount({ readStore: () => null });
        expect(byTid(`${MASSING_GROUP_ROOT_TESTID}-unreadable`)!.textContent)
            .toMatch(/NOT a finding that this parcel holds no buildings/);
        expect(allTid(MASSING_GROUP_ROW_TESTID)).toHaveLength(0);
        // ⛔ AND NOT BEHIND A FOLD: PRYZM admitting it cannot see is not explanation (C58 §1.2).
        expect(byTid(MASSING_GROUP_FOLD_ID)).toBeNull();
    });

    it('a store that THROWS is reported as unreadable, not swallowed into an empty render', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mount({ readStore: () => { throw new Error('boom'); } });
        expect(byTid(`${MASSING_GROUP_ROOT_TESTID}-unreadable`)!.textContent)
            .toMatch(/failure to read/);
        warn.mockRestore();
    });

    it('a genuinely EMPTY project renders as empty, with a DIFFERENT sentence from a failure', () => {
        mount({ readStore: () => storeOf([]) });
        expect(byTid(`${MASSING_GROUP_ROOT_TESTID}-unreadable`)).toBeNull();
        const verdict = byTid(MASSING_GROUP_VERDICT_TESTID)!.textContent ?? '';
        expect(verdict).toMatch(/No massing envelopes on this parcel yet/);
    });

    it('⛔ AND THE SELECTION IS NOT RECONCILED AWAY ON A READ FAILURE', () => {
        // `liveMassingGroupIds` returns [] for a failure as well as for an empty project. If the
        // section reconciled against that, a transient store hiccup would silently deselect the
        // user's building — a failure and an emptiness sharing one CONSEQUENCE.
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        mount({ readStore: () => null });
        expect(getMassingGroupSelection()?.groupId).toBe('g-a');
    });

    it('a READABLE roster that no longer holds the group DOES drop it', () => {
        setMassingGroupSelection({ groupId: 'g-gone', label: 'Ghost', source: 'site-panel' });
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A)]) });
        expect(getMassingGroupSelection()).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ THE FOLD HIDES ROWS AND NEVER A WARNING (C58 §1.2 / panelFold’s own limit)', () => {
    const overlapping = [envRec('a0', 'L0', A, SQ_10), envRec('b0', 'L0', B, SQ_SHIFT)];

    it('the rows fold, and the fold is CLOSED by default — the panel is small on arrival', () => {
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A)]) });
        const fold = byTid(MASSING_GROUP_FOLD_ID) as HTMLDetailsElement | null;
        expect(fold).not.toBeNull();
        expect(fold!.open).toBe(false);
        // The count survives collapsing (panelFold's `summaryNote`).
        expect(byTid(`${MASSING_GROUP_FOLD_ID}-note`)!.textContent).toBe('1');
    });

    it('every row lives INSIDE the fold body', () => {
        mount({ readStore: () => storeOf(overlapping) });
        const body = byTid(`${MASSING_GROUP_FOLD_ID}-body`)!;
        const rows = allTid(MASSING_GROUP_ROW_TESTID);
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) expect(body.contains(r)).toBe(true);
    });

    it('⭐ the overlap ADVISORY is OUTSIDE the fold, with BOTH numbers, in advisory voice', () => {
        mount({ readStore: () => storeOf(overlapping) });
        const adv = byTid(MASSING_GROUP_ADVISORY_TESTID);
        expect(adv).not.toBeNull();
        const fold = byTid(MASSING_GROUP_FOLD_ID)!;
        expect(fold.contains(adv!)).toBe(false);           // ⛔ THE BINDING ARM
        const text = adv!.textContent ?? '';
        expect(text).toContain('50 m²');                    // the measured overlap
        expect(text).toContain('100 m²');                   // both footprints
        expect(text).toMatch(/NOTE, not a refusal/);
    });

    it('⭐ an UNMEASURABLE pair gets its OWN box, outside the fold, never merged with "no overlap"', () => {
        mount({ readStore: () => storeOf([
            envRec('a0', 'L0', A, SQ_10),
            envRec('b0', 'L0', B, BOWTIE),
        ]) });
        const gap = byTid(MASSING_GROUP_GAP_TESTID);
        expect(gap).not.toBeNull();
        expect(byTid(MASSING_GROUP_FOLD_ID)!.contains(gap!)).toBe(false);
        expect(gap!.textContent).toMatch(/NOT a finding that they are clear of each other/);
        // ⛔ AND IT IS NOT AN OVERLAP FINDING.
        expect(byTid(MASSING_GROUP_ADVISORY_TESTID)).toBeNull();
    });

    it('DIFFERENT storeys produce no advisory at all — a podium with a tower is not a defect', () => {
        mount({ readStore: () => storeOf([
            envRec('a0', 'L0', A, SQ_10),
            envRec('b1', 'L1', B, SQ_10),
        ]) });
        expect(byTid(MASSING_GROUP_ADVISORY_TESTID)).toBeNull();
        expect(byTid(MASSING_GROUP_GAP_TESTID)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('the row: the founder’s unit of selection is the BLOCK, across all its levels', () => {
    it('a row carries its group id and lists EVERY storey’s level data', () => {
        mount({ readStore: () => storeOf([
            envRec('a0', 'L0', A), envRec('a1', 'L1', A), envRec('a2', 'L2', A),
        ]) });
        const row = q(`[${MASSING_GROUP_ID_ATTR}="g-a"]`)!;
        expect(row.textContent).toContain('Block A');
        expect(row.textContent).toContain('3 storeys');
        // "get the level data" — every storey, named, with its area.
        expect(row.textContent).toContain('Ground');
        expect(row.textContent).toContain('Level 1');
        expect(row.textContent).toContain('Level 2');
        expect(row.textContent).toContain('300 m² intended');
    });

    it('pressing a row selects the WHOLE group through the ONE channel, tagged site-panel', () => {
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]) });
        (q(`[${MASSING_GROUP_ID_ATTR}="g-a"]`)!.firstElementChild as HTMLElement).click();
        expect(getMassingGroupSelection()).toEqual({
            groupId: 'g-a', label: 'Block A', source: 'site-panel',
        });
    });

    it('the selected row repaints as selected — and it reads the CHANNEL, not its own click state', () => {
        // ⛔ C59 §2.10 / D6: a surface that remembered its own click is the second writer. Driving
        // the channel from OUTSIDE (as the 2D map and 3D scene do) must light this row.
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A), envRec('b0', 'L0', B, SQ_SHIFT)]) });
        expect(q(`[${MASSING_GROUP_ID_ATTR}="g-a"]`)!.getAttribute('aria-selected')).toBe('false');
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(q(`[${MASSING_GROUP_ID_ATTR}="g-a"]`)!.getAttribute('aria-selected')).toBe('true');
        expect(q(`[${MASSING_GROUP_ID_ATTR}="g-b"]`)!.getAttribute('aria-selected')).toBe('false');
    });

    it('the UNGROUPED bucket is not clickable — there is no id to select', () => {
        mount({ readStore: () => storeOf([envRec('u0', 'L0', null)]) });
        const row = q(`[${MASSING_GROUP_ID_ATTR}=""]`)!;
        (row.firstElementChild as HTMLElement).click();
        expect(getMassingGroupSelection()).toBeNull();
    });

    it('a partial total carries its rider — a partial total shown as a total overstates (L-616)', () => {
        mount({ readStore: () => storeOf([
            envRec('a0', 'L0', A, SQ_10, 100),
            envRec('a1', 'L1', A, SQ_10, null),
        ]) });
        expect(q(`[${MASSING_GROUP_ID_ATTR}="g-a"]`)!.textContent)
            .toContain('some storeys carry no area');
    });

    it('a LABEL DRIFT is shown on the row rather than papered over (D1 point 3)', () => {
        mount({ readStore: () => storeOf([
            envRec('a0', 'L0', { id: 'g-a', label: 'Block A' }),
            envRec('a1', 'L1', { id: 'g-a', label: 'Tower A' }),
        ]) });
        const drift = byTid(`${MASSING_GROUP_ROW_TESTID}-label-drift`);
        expect(drift).not.toBeNull();
        expect(drift!.textContent).toContain('Block A');
        expect(drift!.textContent).toContain('Tower A');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ THE SINGLE-GROUP ADMISSION — an empty roster wearing a confident face is worse', () => {
    it('every envelope ungrouped ⇒ PRYZM names its OWN gap, not a reading of the parcel', () => {
        mount({ readStore: () => storeOf([envRec('u0', 'L0', null)]) });
        const note = byTid(MASSING_GROUP_SINGLE_TESTID);
        expect(note).not.toBeNull();
        expect(note!.textContent).toMatch(/gap in PRYZM, not a reading of your parcel/);
        expect(note!.textContent).toMatch(/ADR-0383 S3/);
    });

    it('as soon as ONE named block exists the admission goes away', () => {
        mount({ readStore: () => storeOf([envRec('a0', 'L0', A)]) });
        expect(byTid(MASSING_GROUP_SINGLE_TESTID)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('the storey control — UNAVAILABLE RENDERS WITH ITS REASON, never a click that does nothing', () => {
    // `siteGeometryHighlight.ts:32-38` states the rule. And the reasons are DIFFERENT facts, so
    // they are kept apart rather than collapsed into one grey button.

    it('the verb is NOT registered ⇒ disabled, and it says the VERB has not shipped', () => {
        mount({ readRegisteredCommandTypes: () => ['spaceEnvelope.batch.create'] });
        expect((byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).disabled).toBe(true);
        expect((byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement).disabled).toBe(true);
        const why = byTid(MASSING_GROUP_STOREY_NOTE_TESTID)!.textContent ?? '';
        expect(why).toContain(MASSING_GROUP_SET_STOREYS_VERB);
        expect(why).toMatch(/has not shipped yet/);
        // ⛔ An admission about PRYZM's wiring, never a statement about the user's design.
        expect(why).toMatch(/gap in PRYZM, not a refusal about your design/);
    });

    it('the BUS CANNOT BE SEEN ⇒ a DIFFERENT reason from "the verb has not shipped"', () => {
        mount({ readRegisteredCommandTypes: () => null });
        const why = byTid(MASSING_GROUP_STOREY_NOTE_TESTID)!.textContent ?? '';
        expect(why).toMatch(/cannot see the command bus/);
        expect(why).not.toMatch(/has not shipped yet/);
    });

    it('the UNGROUPED bucket ⇒ a THIRD reason — no group verb can address a null id', () => {
        mount({
            readStore: () => storeOf([envRec('u0', 'L0', null)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
        });
        expect((byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).disabled).toBe(true);
        expect(byTid(MASSING_GROUP_STOREY_NOTE_TESTID)!.textContent)
            .toMatch(/not part of a named block/);
    });

    it('the verb IS registered ⇒ enabled, and the intent line says what will happen BEFORE the click', () => {
        mount({
            readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
        });
        expect((byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).disabled).toBe(false);
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        expect(input.disabled).toBe(false);
        expect(input.value).toBe('2');                      // seeded from the block's real count
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('the storey control — ONE verb, ONE payload, ids minted by the CALLER', () => {
    function armed(over: Partial<MassingGroupSectionDeps> = {}) {
        const sent: { type: string; payload: unknown }[] = [];
        mount({
            readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
            dispatch: (type, payload) => { sent.push({ type, payload }); },
            ...over,
        });
        return sent;
    }

    it('typing 3 and pressing dispatches ONE setStoreys with §4a’s payload', () => {
        const sent = armed();
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        (byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).click();
        expect(sent).toHaveLength(1);                       // ⛔ ONE dispatch ⇒ one Ctrl+Z
        expect(sent[0]!.type).toBe(MASSING_GROUP_SET_STOREYS_VERB);
        const p = sent[0]!.payload as { groupId: string; targetStoreys: number; added: unknown[] };
        expect(p.groupId).toBe('g-a');
        expect(p.targetStoreys).toBe(3);
        expect(p.added).toHaveLength(1);
        expect((p.added[0] as { levelId: string; baseOffset: number }).levelId).toBe('L2');
        expect((p.added[0] as { baseOffset: number }).baseOffset).toBe(6);
    });

    it('⭐ the ids in the payload are the ones the CALLER minted (C16 CA-2)', () => {
        const sent = armed({ mintId: () => 'caller-minted-id' });
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        (byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).click();
        const p = sent[0]!.payload as { added: { spaceEnvelopeId: string }[] };
        expect(p.added[0]!.spaceEnvelopeId).toBe('caller-minted-id');
    });

    it('SHRINKING sends the same verb with an EMPTY added[]', () => {
        const sent = armed();
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '1';
        input.dispatchEvent(new Event('input'));
        (byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).click();
        expect(sent).toHaveLength(1);
        const p = sent[0]!.payload as { targetStoreys: number; added: unknown[] };
        expect(p.targetStoreys).toBe(1);
        expect(p.added).toEqual([]);
    });

    it('a REFUSED target dispatches NOTHING and prints the refusal', () => {
        const sent = armed();
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '9';                                  // only L2 is free above the top
        input.dispatchEvent(new Event('input'));
        (byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).click();
        expect(sent).toHaveLength(0);
        expect(byTid(`${MASSING_GROUP_ROOT_TESTID}-dispatch-note`)!.textContent)
            .toMatch(/Add the storeys to the project first/);
    });

    it('a dispatch that THROWS is reported, not swallowed — and nothing claims to have changed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mount({
            readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
            dispatch: () => { throw new Error('bus exploded'); },
        });
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        (byTid(MASSING_GROUP_APPLY_TESTID) as HTMLButtonElement).click();
        expect(byTid(`${MASSING_GROUP_ROOT_TESTID}-dispatch-note`)!.textContent)
            .toMatch(/Nothing was changed/);
        warn.mockRestore();
    });

    it('⭐ THE TYPED NUMBER SURVIVES A REPAINT — the whole reason this is not a card section', () => {
        const h = mount({
            readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
        });
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        h.refresh();
        expect((byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement).value).toBe('3');
    });

    it('⭐ §4a(b) — the ring disclosure appears on a SET-BACK block, and only then', () => {
        const SQ_8: Ring = [[0, 0], [8, 0], [8, 8], [0, 8]];
        mount({
            readStore: () => storeOf([
                envRec('a0', 'L0', A, SQ_10, 100),
                envRec('a1', 'L1', A, SQ_8, 64),
            ]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
        });
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        const notes = allTid(MASSING_GROUP_STOREY_NOTE_TESTID).map((n) => n.textContent ?? '').join(' ');
        expect(notes).toMatch(/set-back you have already drawn is kept rather than undone/);
    });

    it('a FLAT block never shows the ring disclosure — the ambiguity is not real', () => {
        mount({
            readStore: () => storeOf([envRec('a0', 'L0', A), envRec('a1', 'L1', A)]),
            readRegisteredCommandTypes: () => [MASSING_GROUP_SET_STOREYS_VERB],
        });
        const input = byTid(MASSING_GROUP_STOREY_INPUT_TESTID) as HTMLInputElement;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        const notes = allTid(MASSING_GROUP_STOREY_NOTE_TESTID).map((n) => n.textContent ?? '').join(' ');
        expect(notes).not.toMatch(/set-back/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('lifecycle', () => {
    it('dispose removes the element and releases BOTH channels', () => {
        let envOff = 0;
        const h = mount({ subscribeEnvelopes: () => () => { envOff += 1; } });
        expect(byTid(MASSING_GROUP_ROOT_TESTID)).not.toBeNull();
        h.dispose();
        expect(byTid(MASSING_GROUP_ROOT_TESTID)).toBeNull();
        expect(envOff).toBe(1);
        // ⛔ AND THE SELECTION CHANNEL TOO: a listener that outlived the body would repaint a
        // detached tree on every click in the 3D scene.
        expect(() => setMassingGroupSelection({ groupId: 'g-z', label: 'Z', source: 'site-3d' }))
            .not.toThrow();
        mounted = null;
    });

    it('the envelope channel repaints the section', () => {
        let fire: (() => void) | null = null;
        let recs = [envRec('a0', 'L0', A)];
        mount({
            readStore: () => storeOf(recs),
            subscribeEnvelopes: (fn) => { fire = fn; return () => {}; },
        });
        expect(byTid(MASSING_GROUP_VERDICT_TESTID)!.textContent).toContain('1 envelope');
        recs = [envRec('a0', 'L0', A), envRec('a1', 'L1', A)];
        fire!();
        expect(byTid(MASSING_GROUP_VERDICT_TESTID)!.textContent).toContain('2 envelopes');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('SOURCE PIN — the section is mounted into question 2, where the founder ruled ACTING lives', () => {
    // C115 §2.2 / §6, founder 2026-09-07: *"question 2 is where you ACT on the parcel; question 3
    // READS what you declared against what you are allowed."* Selecting a block and changing its
    // storeys is ACTING. This arm fails if a later edit re-parents it to another question.
    const tab = () => readFileSync(
        resolve(__dirname, '../../analysis/parcelLawTab.ts'), 'utf8');

    it('parcelLawTab mounts it, and into the LAW (question 2) body', () => {
        const src = tab();
        expect(src).toContain('mountMassingGroupSection');
        expect(src).toContain('massingGroupSlot');
        expect(src).toMatch(/bodyOf\('law'\)\.appendChild\(massingGroupSlot\)/);
    });

    it('and disposes it — a section holding two subscriptions must not outlive the body', () => {
        expect(tab()).toMatch(/massingGroups\?\.dispose\(\)/);
    });
});
