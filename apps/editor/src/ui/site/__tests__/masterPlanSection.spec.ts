// §MASTER-PLAN-IS-REACHABLE (lane MP-WIRE, 2026-09-09) — the SECTION's own arms.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE PROVES, AND — MORE IMPORTANTLY — WHAT IT DOES NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It drives the real `mountMasterPlanSection` over the REAL session roster and the REAL draw-arming
// module (a fake surface is registered through the module's own port, so arming goes through the
// production path rather than a stub of it — [[fake-more-capable-than-real]]). What it establishes
// is that the SECTION reaches the planner and the bus.
//
// ⛔ IT DOES NOT ESTABLISH THAT THE SECTION IS MOUNTED ANYWHERE. That is the whole defect this lane
// exists to fix and it needs a different subject — `masterPlanWireReachability.spec.ts` mounts the
// REAL Parcel Law tab and the REAL tools rail and looks for this section inside them. A suite that
// calls `mountMasterPlanSection` directly would have been green on the morning the founder could
// not find the feature at all.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    mountMasterPlanSection,
    describeMasterPlanRoster,
    undrawnCopies,
    composeMasterPlanInput,
    MASTER_PLAN_ROOT_TESTID,
    MASTER_PLAN_VERDICT_TESTID,
    MASTER_PLAN_PROFILE_ROW_TESTID,
    MASTER_PLAN_EMPTY_TESTID,
    MASTER_PLAN_DRAW_BTN_TESTID,
    MASTER_PLAN_ADD_BTN_TESTID,
    MASTER_PLAN_CLEAR_BTN_TESTID,
    MASTER_PLAN_STOREYS_INPUT_TESTID,
    MASTER_PLAN_CREATE_BTN_TESTID,
    MASTER_PLAN_BUILT_ROW_TESTID,
    MASTER_PLAN_SKIPPED_ROW_TESTID,
    MASTER_PLAN_ADVISORY_TESTID,
    MASTER_PLAN_REFUSAL_TESTID,
    MASTER_PLAN_STATUS_TESTID,
    MASTER_PLAN_COPY_NOTE_TESTID,
    MASTER_PLAN_REMOVE_ATTR,
    type MasterPlanSectionDeps,
    type MasterPlanSectionHandle,
} from '../masterPlanSection';
import {
    __resetDrawnEnvelopeFootprintForTests,
    addDrawnEnvelopeProfile,
    clearDrawnEnvelopeProfiles,
    getDrawnEnvelopeProfiles,
    removeDrawnEnvelopeProfile,
    setDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
    type DrawnEnvelopeFootprint,
    type DrawnEnvelopeProfile,
} from '../drawnEnvelopeFootprintState';
import {
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    getEnvelopeDrawStatus,
    isEnvelopeDrawArmed,
    registerEnvelopeDrawSurface,
    subscribeEnvelopeDrawStatus,
} from '../siteEnvelopeDrawArming';
import type { EnvelopeDrawSurface } from '../envelopeDrawSurface';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { LevelEnvelopeReadResult } from '../levelEnvelopeSupersession';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════════════════════════════════════

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
    { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
];

/** A square of side `s` with its lower-left corner at (x0, z0). */
const square = (x0: number, z0: number, s: number) => [
    { x: x0, z: z0 },
    { x: x0 + s, z: z0 },
    { x: x0 + s, z: z0 + s },
    { x: x0, z: z0 + s },
];

const footprint = (x0: number, z0: number, s = 10): DrawnEnvelopeFootprint => ({
    ring: square(x0, z0, s),
    areaM2: s * s,
    surfaceId: 'site-map-2d',
    mode: 'linear',
});

/** A surface that arms through the module's REAL port — never a stub of `armEnvelopeDraw`. */
function fakeSurface(over: Partial<EnvelopeDrawSurface> = {}): EnvelopeDrawSurface {
    return {
        surfaceId: 'site-map-2d',
        groundPointFromPointer: () => null,
        drawPreview: () => {},
        clearPreview: () => {},
        arm: () => true,
        disarm: () => {},
        ...over,
    } as EnvelopeDrawSurface;
}

interface Harness {
    readonly host: HTMLElement;
    readonly deps: MasterPlanSectionDeps;
    readonly dispatched: { type: string; payload: unknown }[];
    section: MasterPlanSectionHandle | null;
}

function harness(over: Partial<MasterPlanSectionDeps> = {}): Harness {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispatched: { type: string; payload: unknown }[] = [];
    let idSeq = 0;
    let groupSeq = 0;
    const deps: MasterPlanSectionDeps = {
        // ⭐ THE REAL ROSTER AND THE REAL ARMING MODULE — a fake roster could not reproduce the
        // "add another seeds a COPY, the next draw replaces it" rule that this section renders.
        readProfiles: getDrawnEnvelopeProfiles,
        subscribeProfiles: subscribeDrawnEnvelopeFootprint,
        addProfile: (p: DrawnEnvelopeProfile) => { addDrawnEnvelopeProfile(p.footprint); },
        removeProfile: removeDrawnEnvelopeProfile,
        clearProfiles: clearDrawnEnvelopeProfiles,
        armDraw: armEnvelopeDraw,
        readDrawStatus: getEnvelopeDrawStatus,
        subscribeDrawStatus: subscribeEnvelopeDrawStatus,
        readLevels: () => LEVELS,
        readOrdinance: () => ({ maxHeightM: 20, maxFloors: 6 }),
        readExisting: (): LevelEnvelopeReadResult => ({ readable: true, rows: [] }),
        dispatch: (type, payload) => { dispatched.push({ type, payload }); },
        readRegisteredCommandTypes: () => ['spaceEnvelope.batch.create'],
        mintId: () => `se-${String(++idSeq).padStart(4, '0')}`,
        mintGroupId: () => `mg-${++groupSeq}`,
        ...over,
    };
    return { host, deps, dispatched, section: null };
}

const q = (h: Harness, testid: string): HTMLElement | null =>
    h.host.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const all = (h: Harness, testid: string): HTMLElement[] =>
    Array.from(h.host.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
const press = (elm: HTMLElement | null): void => {
    expect(elm, 'the control this arm presses does not exist').not.toBeNull();
    (elm as HTMLButtonElement).click();
};
const typeStoreys = (h: Harness, n: string): void => {
    const input = q(h, MASTER_PLAN_STOREYS_INPUT_TESTID) as HTMLInputElement;
    input.value = n;
    input.dispatchEvent(new Event('input'));
};

let live: Harness | null = null;
const mount = (over: Partial<MasterPlanSectionDeps> = {}): Harness => {
    const h = harness(over);
    h.section = mountMasterPlanSection(h.host, h.deps);
    live = h;
    return h;
};

beforeEach(() => {
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    try { live?.section?.dispose(); } catch { /* teardown */ }
    live?.host.remove();
    live = null;
    __resetDrawnEnvelopeFootprintForTests();
    __resetEnvelopeDrawArmingForTests();
    vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('W2 — the roster is DRAWABLE, readable and undoable', () => {
    it('an empty roster says so, and says it as an EMPTINESS rather than a failure', () => {
        const h = mount();
        expect(q(h, MASTER_PLAN_ROOT_TESTID)).not.toBeNull();
        expect(q(h, MASTER_PLAN_EMPTY_TESTID)?.textContent ?? '').toContain('Nothing is drawn yet');
        expect(q(h, MASTER_PLAN_VERDICT_TESTID)?.textContent ?? '').toContain('No profiles drawn');
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(0);
    });

    it('⭐ THE DRAW BUTTON ARMS THE REAL GESTURE — not a flag this section owns', () => {
        registerEnvelopeDrawSurface(fakeSurface());
        const h = mount();
        expect(isEnvelopeDrawArmed()).toBe(false);
        press(q(h, MASTER_PLAN_DRAW_BTN_TESTID));
        // ⛔ Read off the ARMING MODULE, never off this section's own DOM: a section that painted
        // itself "armed" while nothing was listening is precisely the defect this lane is about.
        expect(isEnvelopeDrawArmed()).toBe(true);
        expect(q(h, MASTER_PLAN_DRAW_BTN_TESTID)?.getAttribute('aria-pressed')).toBe('true');
    });

    it('⛔ an arm nobody accepted is REPORTED with the arming module\'s own reason', () => {
        // No surface registered — the production refusal names the route back.
        const h = mount();
        press(q(h, MASTER_PLAN_DRAW_BTN_TESTID));
        const status = q(h, MASTER_PLAN_STATUS_TESTID);
        expect(status?.getAttribute('data-state')).toBe('refused');
        expect(status?.textContent ?? '').toContain('site view');
    });

    it('⭐⭐ N PROFILES: draw → add → draw → add → draw leaves THREE rows, oldest first', () => {
        registerEnvelopeDrawSurface(fakeSurface());
        const h = mount();
        // The gesture's own write — "the most recent profile", the roster's unchanged rule.
        setDrawnEnvelopeFootprint(footprint(0, 0));
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(1);

        press(q(h, MASTER_PLAN_ADD_BTN_TESTID));      // seeds Profile 2 as a copy, arms the draw
        setDrawnEnvelopeFootprint(footprint(40, 0));  // the next draw REPLACES that copy
        press(q(h, MASTER_PLAN_ADD_BTN_TESTID));
        setDrawnEnvelopeFootprint(footprint(80, 0));

        const rows = all(h, MASTER_PLAN_PROFILE_ROW_TESTID);
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.textContent)).toEqual([
            expect.stringContaining('Profile 1'),
            expect.stringContaining('Profile 2'),
            expect.stringContaining('Profile 3'),
        ]);
        expect(q(h, MASTER_PLAN_VERDICT_TESTID)?.textContent ?? '').toContain('3 profiles');
    });

    it('⛔ `getDrawnEnvelopeFootprint()` STILL MEANS "the most recent" — every old caller survives', async () => {
        const { getDrawnEnvelopeFootprint } = await import('../drawnEnvelopeFootprintState');
        registerEnvelopeDrawSurface(fakeSurface());
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        press(q(h, MASTER_PLAN_ADD_BTN_TESTID));
        const third = footprint(80, 0);
        setDrawnEnvelopeFootprint(third);
        expect(getDrawnEnvelopeFootprint()).toBe(third);
    });

    it('⭐ a seeded copy that has NOT been drawn over SAYS SO, on the row that carries it', () => {
        registerEnvelopeDrawSurface(fakeSurface());
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        press(q(h, MASTER_PLAN_ADD_BTN_TESTID));
        const note = q(h, MASTER_PLAN_COPY_NOTE_TESTID);
        expect(note?.textContent ?? '').toContain('Profile 1');
        expect(note?.textContent ?? '').toContain('draw');
        // …and drawing clears the note, because the footprint object is no longer shared.
        setDrawnEnvelopeFootprint(footprint(40, 0));
        expect(q(h, MASTER_PLAN_COPY_NOTE_TESTID)).toBeNull();
    });

    it('one profile can be REMOVED, and the others are untouched', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        addDrawnEnvelopeProfile(footprint(40, 0));
        addDrawnEnvelopeProfile(footprint(80, 0));
        const target = getDrawnEnvelopeProfiles()[1]!;
        const btn = h.host.querySelector<HTMLElement>(`[${MASTER_PLAN_REMOVE_ATTR}="${target.profileId}"]`);
        press(btn);
        expect(getDrawnEnvelopeProfiles().map((p) => p.label)).toEqual(['Profile 1', 'Profile 3']);
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(2);
    });

    it('Clear all drops the whole exploration — and the section repaints itself, unprompted', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        addDrawnEnvelopeProfile(footprint(40, 0));
        press(q(h, MASTER_PLAN_CLEAR_BTN_TESTID));
        expect(getDrawnEnvelopeProfiles()).toHaveLength(0);
        expect(q(h, MASTER_PLAN_EMPTY_TESTID)).not.toBeNull();
    });

    it('⛔ the roster channel repaints this section even when the write came from ELSEWHERE', () => {
        const h = mount();
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(0);
        // No control on this section was touched — the site view's gesture wrote the slot.
        setDrawnEnvelopeFootprint(footprint(0, 0));
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('W3 — one button, one command, one Ctrl+Z', () => {
    const threeProfiles = (): void => {
        setDrawnEnvelopeFootprint(footprint(0, 0));
        addDrawnEnvelopeProfile(footprint(40, 0));
        addDrawnEnvelopeProfile(footprint(80, 0));
    };

    it('⭐⭐ THE HEADLINE: three profiles + a storey count → ONE `spaceEnvelope.batch.create`', () => {
        const h = mount();
        threeProfiles();
        typeStoreys(h, '2');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));

        // ⛔ EXACTLY ONE dispatch. Three would spend three Ctrl+Zs on one gesture (C114 §6a).
        expect(h.dispatched).toHaveLength(1);
        expect(h.dispatched[0]!.type).toBe('spaceEnvelope.batch.create');
        const payload = h.dispatched[0]!.payload as { envelopes: { group: { id: string } | null }[] };
        // 3 blocks × 2 storeys.
        expect(payload.envelopes).toHaveLength(6);
        // ⛔ THREE DISTINCT GROUPS — three buildings, not one building with six floors.
        const groups = new Set(payload.envelopes.map((e) => e.group?.id ?? null));
        expect(groups.size).toBe(3);
        expect(groups.has(null)).toBe(false);
    });

    it('⭐ the group LABEL is the profile\'s own label — the roster and the scene agree', () => {
        const h = mount();
        threeProfiles();
        typeStoreys(h, '1');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        const payload = h.dispatched[0]!.payload as { envelopes: { group: { label: string } | null }[] };
        expect(payload.envelopes.map((e) => e.group?.label)).toEqual(['Profile 1', 'Profile 2', 'Profile 3']);
    });

    it('⭐ THE VERDICTS ARE RENDERED BEFORE THE CLICK, and the click dispatches what they described', () => {
        const h = mount();
        threeProfiles();
        typeStoreys(h, '2');
        // Rendered with NO dispatch — the preview mints placeholder ids that are never sent.
        expect(all(h, MASTER_PLAN_BUILT_ROW_TESTID)).toHaveLength(3);
        expect(h.dispatched).toHaveLength(0);
        expect(q(h, MASTER_PLAN_CREATE_BTN_TESTID)?.textContent).toBe('Create 3 blocks');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        const payload = h.dispatched[0]!.payload as { envelopes: unknown[] };
        expect(payload.envelopes).toHaveLength(6);
    });

    it('⛔ a preview id NEVER reaches the bus (C16 CA-2 — the click mints its own)', () => {
        const h = mount();
        threeProfiles();
        typeStoreys(h, '1');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        const payload = h.dispatched[0]!.payload as { envelopes: { spaceEnvelopeId: string }[] };
        for (const e of payload.envelopes) {
            expect(e.spaceEnvelopeId.startsWith('preview')).toBe(false);
            expect(e.spaceEnvelopeId.startsWith('se-')).toBe(true);
        }
    });

    it('⭐ A SKIPPED PROFILE IS NAMED and the others are still built (ADR-0383 D5)', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        addDrawnEnvelopeProfile(footprint(40, 0));
        // A degenerate ring cannot enter the roster, so the skip is provoked at the PLANNER seam,
        // where D5 lives: one profile whose ring the planner refuses.
        const profiles = getDrawnEnvelopeProfiles();
        const doomed: DrawnEnvelopeProfile = {
            profileId: 'p-bad',
            label: 'Profile bad',
            footprint: { ring: [], areaM2: 0, surfaceId: 'site-map-2d', mode: 'linear' },
        };
        const h2 = mount({ readProfiles: () => [...profiles, doomed] });
        typeStoreys(h2, '1');
        expect(all(h2, MASTER_PLAN_SKIPPED_ROW_TESTID)).toHaveLength(1);
        expect(all(h2, MASTER_PLAN_BUILT_ROW_TESTID)).toHaveLength(2);
        press(q(h2, MASTER_PLAN_CREATE_BTN_TESTID));
        const payload = h2.dispatched[0]!.payload as { envelopes: unknown[] };
        expect(payload.envelopes).toHaveLength(2);
        expect(q(h2, MASTER_PLAN_STATUS_TESTID)?.textContent ?? '').toContain('skipped');
        h.section?.dispose();
    });

    it('⛔⛔ AN OVERLAP IS AN ADVISORY AND NEVER A REFUSAL — the button stays LIVE', () => {
        const h = mount();
        // Two blocks on the SAME storey, deliberately on top of each other.
        setDrawnEnvelopeFootprint(footprint(0, 0));
        addDrawnEnvelopeProfile(footprint(2, 2));
        typeStoreys(h, '1');
        const advisories = all(h, MASTER_PLAN_ADVISORY_TESTID);
        expect(advisories.length).toBeGreaterThan(0);
        // ⭐ BOTH NUMBERS, in the measurer's own sentence.
        expect(advisories[0]!.textContent ?? '').toMatch(/m²/);
        expect(q(h, MASTER_PLAN_REFUSAL_TESTID)).toBeNull();
        const btn = q(h, MASTER_PLAN_CREATE_BTN_TESTID) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        press(btn);
        expect(h.dispatched).toHaveLength(1);
    });

    it('a whole-gesture refusal is rendered VERBATIM and nothing is dispatched', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        typeStoreys(h, 'banana');
        const refusal = q(h, MASTER_PLAN_REFUSAL_TESTID);
        expect(refusal).not.toBeNull();
        expect((q(h, MASTER_PLAN_CREATE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(true);
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        expect(h.dispatched).toHaveLength(0);
    });

    it('⛔ UNREADABLE STOREYS is a failure to READ, never "this project has no storeys"', () => {
        const h = mount({ readLevels: () => null });
        setDrawnEnvelopeFootprint(footprint(0, 0));
        typeStoreys(h, '2');
        const text = q(h, MASTER_PLAN_REFUSAL_TESTID)?.textContent ?? '';
        expect(text).toContain('cannot read');
        expect(text).toContain('NOT a finding');
        expect((q(h, MASTER_PLAN_CREATE_BTN_TESTID) as HTMLButtonElement).disabled).toBe(true);
    });

    it('⛔ a bus with NO handler for the verb disables the button WITH ITS REASON — never a dead click', () => {
        const h = mount({ readRegisteredCommandTypes: () => ['spaceEnvelope.create'] });
        setDrawnEnvelopeFootprint(footprint(0, 0));
        typeStoreys(h, '1');
        const btn = q(h, MASTER_PLAN_CREATE_BTN_TESTID) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.title).toContain('batch.create');
        expect(btn.title).toContain('wiring');
    });

    it('a dispatch that THROWS is reported — nothing is swallowed', () => {
        const h = mount({ dispatch: () => { throw new Error('no command bus'); } });
        setDrawnEnvelopeFootprint(footprint(0, 0));
        typeStoreys(h, '1');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        const status = q(h, MASTER_PLAN_STATUS_TESTID);
        expect(status?.getAttribute('data-state')).toBe('refused');
        expect(status?.textContent ?? '').toContain('no command bus');
        expect(status?.textContent ?? '').toContain('Nothing was created');
    });

    it('⛔ the typed storey count SURVIVES a repaint driven by another surface', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        // ⚠ 3, NOT 7 — the fixture project has THREE storeys, and asking for seven is a correct
        // planner refusal (`not-enough-storeys`), not a repaint bug. The first draft of this arm
        // asked for 7 and failed on the planner's refusal; that is the code being right.
        typeStoreys(h, '3');
        // A gesture on a site view fires the roster channel mid-typing.
        addDrawnEnvelopeProfile(footprint(40, 0));
        expect((q(h, MASTER_PLAN_STOREYS_INPUT_TESTID) as HTMLInputElement).value).toBe('3');
        press(q(h, MASTER_PLAN_CREATE_BTN_TESTID));
        const payload = h.dispatched[0]!.payload as { envelopes: unknown[] };
        expect(payload.envelopes).toHaveLength(6);   // 2 blocks × 3 storeys
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('the pure halves — one producer each', () => {
    it('describeMasterPlanRoster distinguishes 0 / 1 / N, and never invents a permission', () => {
        expect(describeMasterPlanRoster([])).toContain('No profiles');
        const one = [{ profileId: 'a', label: 'Profile 1', footprint: footprint(0, 0) }];
        expect(describeMasterPlanRoster(one)).toContain('1 profile');
        const two = [...one, { profileId: 'b', label: 'Profile 2', footprint: footprint(40, 0) }];
        expect(describeMasterPlanRoster(two)).toContain('2 profiles');
        for (const s of [describeMasterPlanRoster([]), describeMasterPlanRoster(one), describeMasterPlanRoster(two)]) {
            expect(s.toLowerCase()).not.toContain('permitted');
            expect(s.toLowerCase()).not.toContain('allowed');
        }
    });

    it('undrawnCopies is REFERENCE equality — two rings drawn on the same spot are NOT flagged', () => {
        const shared = footprint(0, 0);
        const flagged = undrawnCopies([
            { profileId: 'a', label: 'Profile 1', footprint: shared },
            { profileId: 'b', label: 'Profile 2', footprint: shared },
        ]);
        expect(flagged.get('b')).toBe('Profile 1');
        // Same geometry, different objects — the user drew both, so the COPY note is silent and the
        // measured overlap advisory is what speaks to them.
        const separate = undrawnCopies([
            { profileId: 'a', label: 'Profile 1', footprint: footprint(0, 0) },
            { profileId: 'b', label: 'Profile 2', footprint: footprint(0, 0) },
        ]);
        expect(separate.size).toBe(0);
    });

    it('composeMasterPlanInput partitions ids PER PROFILE — an id never appears in two blocks', () => {
        let seq = 0;
        const input = composeMasterPlanInput({
            profiles: [
                { profileId: 'a', label: 'A', footprint: footprint(0, 0) },
                { profileId: 'b', label: 'B', footprint: footprint(40, 0) },
            ],
            requestedStoreys: '3',
            levels: LEVELS,
            ordinance: { maxHeightM: null, maxFloors: null },
            existing: { readable: true, rows: [] },
            mintId: () => `id-${++seq}`,
            mintGroupId: () => `g-${seq}`,
        });
        expect(input.profiles).toHaveLength(2);
        expect(input.profiles[0]!.mintedIds).toHaveLength(3);
        const union = new Set([...input.profiles[0]!.mintedIds, ...input.profiles[1]!.mintedIds]);
        expect(union.size).toBe(6);
        // ⛔ The area is CARRIED from the gesture, never recomputed here.
        expect(input.profiles[0]!.ringAreaM2).toBe(100);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('teardown', () => {
    it('dispose drops BOTH subscriptions — a detached section never repaints again', () => {
        const h = mount();
        setDrawnEnvelopeFootprint(footprint(0, 0));
        expect(all(h, MASTER_PLAN_PROFILE_ROW_TESTID)).toHaveLength(1);
        h.section!.dispose();
        h.section = null;
        // The roster changes; the detached tree must NOT have grown a row.
        addDrawnEnvelopeProfile(footprint(40, 0));
        expect(h.host.querySelectorAll(`[data-testid="${MASTER_PLAN_PROFILE_ROW_TESTID}"]`)).toHaveLength(0);
        expect(h.host.querySelector(`[data-testid="${MASTER_PLAN_ROOT_TESTID}"]`)).toBeNull();
    });
});
