/**
 * §ROOMS-PER-LEVEL (L-13039) — the SECTION: paints the model, re-paints on both live channels,
 * and is mounted by the Parcel Law tab (the SOURCE PIN at the end).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { systemProvenance } from '@pryzm/schemas/provenance';
import {
    mountRoomsPerLevelSection,
    ROOMS_PER_LEVEL_ROOT_TESTID,
    ROOMS_PER_LEVEL_GROUP_ATTR,
    ROOMS_PER_LEVEL_UNPLACED_TESTID,
    ROOMS_PER_LEVEL_ROOM_ATTR,
    ROOMS_PER_LEVEL_STATUS_TESTID,
    ROOMS_PER_LEVEL_WIRED_ATTR,
    ROOMS_PER_LEVEL_ARM_ATTR,
    type RoomsPerLevelDeps,
} from '../roomsPerLevelSection';
import {
    SITE_HIGHLIGHT_ATTR,
    getSiteHighlight,
    setSiteHighlight,
    __resetSiteHighlightForTests,
} from '../siteGeometryHighlight';
import { SITE_HIGHLIGHT_UNAVAILABLE_ATTR } from '../siteHighlightRowControl';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { ExistingLevelEnvelope } from '../levelEnvelopeSupersession';

afterEach(() => {
    document.body.innerHTML = '';
    __resetSiteHighlightForTests();
});

const L0: AdoptLevelCandidate = { id: 'L0', name: 'Ground', elevation: 0, height: 3 };
const L1: AdoptLevelCandidate = { id: 'L1', name: 'Level 1', elevation: 3, height: 3 };
const E0: ExistingLevelEnvelope = {
    id: 'e0', levelId: 'L0', name: 'Proposed ground floor · 301 m²', footprintAreaM2: 301,
    provenance: systemProvenance('computed', 'test'),
    // §MASSING-GROUPS (ADR-0383) — the UNGROUPED bucket: this fixture is the single-building flow.
    group: null,
};

function deps(over: Partial<RoomsPerLevelDeps> & { rooms?: unknown[]; envelopes?: ExistingLevelEnvelope[] } = {}) {
    const listeners: Array<() => void> = [];
    const state = {
        rooms: over.rooms ?? [
            { id: 'r1', name: 'Living', levelId: 'L0', occupancyType: 'living-room', computed: { area: 24 } },
            { id: 'r2', name: 'Bedroom 1', levelId: 'L1', occupancyType: 'bedroom', computed: { area: 14 } },
            { id: 'r3', name: 'Hall', occupancyType: 'hall', computed: { area: 6 } },
        ] as unknown[],
        envelopes: over.envelopes ?? [E0],
    };
    const d: RoomsPerLevelDeps = {
        readRooms: () => state.rooms as never,
        readLevels: () => [L0, L1],
        readLevelEnvelopes: () => ({ readable: true, rows: state.envelopes }),
        subscribeRooms: (fn) => { listeners.push(fn); return () => {}; },
        subscribeEnvelopes: (fn) => { listeners.push(fn); return () => {}; },
        ...over,
    };
    return { d, state, fire: () => listeners.forEach((fn) => fn()) };
}

describe('mountRoomsPerLevelSection', () => {
    it('paints one group per storey with rooms or an envelope, the envelope line, and the unplaced group', () => {
        const { d } = deps();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const root = host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_ROOT_TESTID}"]`)!;
            expect(root).not.toBeNull();
            expect(root.textContent).toContain('Rooms per level — 3 rooms · 1 without a known level');
            const groups = root.querySelectorAll(`[${ROOMS_PER_LEVEL_GROUP_ATTR}]`);
            expect([...groups].map((g) => g.getAttribute(ROOMS_PER_LEVEL_GROUP_ATTR))).toEqual(['L0', 'L1']);
            expect(groups[0]!.textContent).toContain('Ground');
            expect(groups[0]!.textContent).toContain('Living');
            expect(groups[0]!.textContent).toContain('24.0 m²');
            expect(groups[0]!.textContent).toContain('Level envelope: Proposed ground floor · 301 m² · 301 m²');
            expect(groups[1]!.textContent).toContain('No level envelope on this storey yet');
            const unplaced = root.querySelector(`[data-testid="${ROOMS_PER_LEVEL_UNPLACED_TESTID}"]`)!;
            expect(unplaced).not.toBeNull();
            expect(unplaced.textContent).toContain('Hall');
            expect(unplaced.textContent).toContain('carries no storey');
            expect(root.querySelectorAll(`[${ROOMS_PER_LEVEL_ROOM_ATTR}]`).length).toBe(3);
        } finally { h.dispose(); }
    });

    it('⛔ prints "area not recorded", never 0.0 m², for a room with no area', () => {
        const { d } = deps({ rooms: [{ id: 'r', name: 'WC', levelId: 'L0' }] });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            expect(host.textContent).toContain('area not recorded');
            expect(host.textContent).not.toContain('0.0 m²');
        } finally { h.dispose(); }
    });

    it('an empty project says so — honestly, and offers the two ways rooms arrive', () => {
        const { d } = deps({ rooms: [], envelopes: [] });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const status = host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_STATUS_TESTID}"]`)!;
            expect(status.getAttribute('data-state')).toBe('empty');
            expect(status.textContent).toContain('No rooms yet');
        } finally { h.dispose(); }
    });

    // ══════════════════════════════════════════════════════════════════════════════════════
    // §STAGE-05-DENSITY (C115 §8.1 `C115-175` · L-13237) — "MAKE THE 'ROOMS PER LEVEL' SECTION
    // SMALLER AND MORE DISCREET". The founder photographed five storeys, zero rooms, five
    // bordered three-line cards. Every one of those cards carries a REAL fact — the level
    // envelope and its area — so C115 §4.4 permits none of it to be withheld, only compressed.
    // ══════════════════════════════════════════════════════════════════════════════════════
    it('⭐ a storey with an envelope and NO rooms is ONE line — and still says all three things', () => {
        const E1: ExistingLevelEnvelope = {
            id: 'e1', levelId: 'L1', name: 'Level envelope - Level 1', footprintAreaM2: 366, group: null,
            provenance: systemProvenance('computed', 'test'),
        };
        const { d } = deps({ rooms: [], envelopes: [E0, E1] });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const groups = [...host.querySelectorAll(`[${ROOMS_PER_LEVEL_GROUP_ATTR}]`)];
            expect(groups.map((g) => g.getAttribute(ROOMS_PER_LEVEL_GROUP_ATTR))).toEqual(['L0', 'L1']);
            // ⭐ THE FALSIFIABLE HALF. happy-dom has no layout engine, so the compaction is proven
            // by the ARM that ran, not by a pixel. Restore the bordered card and this fails.
            expect(groups.every((g) => g.getAttribute(ROOMS_PER_LEVEL_ARM_ATTR) === 'compact')).toBe(true);
            // ⛔ AND NOT ONE DATUM WENT WITH THE CARD. C115 §4.4 clause 1 — a named absence has
            // something to say — and C115-40: withholding is at SECTION level, never at ROW level.
            const l1 = groups[1]!;
            expect(l1.textContent).toContain('Level 1');
            expect(l1.textContent).toContain('Level envelope: Level envelope - Level 1');
            expect(l1.textContent).toContain('366 m²');
            expect(l1.textContent).toContain('No rooms on this storey yet.');
        } finally { h.dispose(); host.remove(); }
    });

    it('⛔ a storey WITH rooms keeps the full card — the compaction is for empty storeys only', () => {
        const { d } = deps();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const l0 = host.querySelector(`[${ROOMS_PER_LEVEL_GROUP_ATTR}="L0"]`)!;
            expect(l0.getAttribute(ROOMS_PER_LEVEL_ARM_ATTR)).toBe('full');
            expect(l0.textContent).toContain('Living');
            expect(l0.textContent).toContain('24.0 m²');
        } finally { h.dispose(); host.remove(); }
    });

    it('⛔ RIVAL envelopes keep the FULL card even with no rooms — a warning is not made discreet', () => {
        // C115-39 clause 3 and C115-76: the four envelope arms all survive, and the two that
        // report a problem (`rival`, `unreadable`) may not be compressed into a one-liner.
        const A: ExistingLevelEnvelope = {
            id: 'a', levelId: 'L1', name: 'Generated massing', footprintAreaM2: 300, group: null,
            provenance: systemProvenance('computed', 'test'),
        };
        const B: ExistingLevelEnvelope = {
            id: 'b', levelId: 'L1', name: 'Drawn by hand', footprintAreaM2: 280, group: null,
            provenance: systemProvenance('computed', 'test'),
        };
        const { d } = deps({ rooms: [], envelopes: [A, B] });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const l1 = host.querySelector(`[${ROOMS_PER_LEVEL_GROUP_ATTR}="L1"]`)!;
            expect(l1.getAttribute(ROOMS_PER_LEVEL_ARM_ATTR)).toBe('full');
            expect(l1.textContent).toContain('2 level envelopes sit on this storey');
            expect(l1.textContent).toContain('PRYZM will not choose');
        } finally { h.dispose(); host.remove(); }
    });

    it('⛔ unreadable storeys are stated as unreadable, and every room is still listed', () => {
        const { d } = deps({ readLevels: () => null });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const status = host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_STATUS_TESTID}"]`)!;
            expect(status.getAttribute('data-state')).toBe('levels-unreadable');
            expect(host.querySelectorAll(`[${ROOMS_PER_LEVEL_ROOM_ATTR}]`).length).toBe(3);
        } finally { h.dispose(); }
    });

    it('⭐ LIVE — re-paints when either channel fires, and on the host\'s refresh()', () => {
        const { d, state, fire } = deps();
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            expect(host.textContent).toContain('3 rooms');
            state.rooms = [...state.rooms, { id: 'r4', name: 'Kitchen', levelId: 'L0', computed: { area: 10 } }];
            fire();
            expect(host.textContent).toContain('4 rooms');
            state.envelopes = [];
            h.refresh();
            expect(host.querySelector(`[${ROOMS_PER_LEVEL_GROUP_ATTR}="L0"]`)!.textContent)
                .toContain('No level envelope on this storey yet');
        } finally { h.dispose(); }
    });

    it('dispose removes the section and stops repainting', () => {
        const { d, state, fire } = deps();
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        h.dispose();
        expect(host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_ROOT_TESTID}"]`)).toBeNull();
        state.rooms = [];
        expect(() => fire()).not.toThrow();
    });

    it('⭐ SOURCE PIN — the Parcel Law tab mounts it, refreshes it, and disposes it', () => {
        const src = readFileSync(resolve(__dirname, '../../analysis/parcelLawTab.ts'), 'utf8');
        expect(src).toContain('mountRoomsPerLevelSection(');
        expect(src).toContain('roomsPerLevel?.refresh()');
        expect(src).toContain('roomsPerLevel?.dispose()');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §26.6.4 / §ROOMS-ON-THE-VIEWS (L-13046) — "AND SHALL RENDER ON THE VIEWS"
// ─────────────────────────────────────────────────────────────────────────────
//
// ⭐ THE HOP THESE ARMS CLOSE is [[committed-is-not-reachable]] at the exact place the founder
// experiences it: a store that toggles perfectly in a unit test and a room row nobody has ever
// proven flips it. So these mount the REAL section, find the REAL control and CLICK it, and assert
// the value that lands in the store the three renderers subscribe to — not a spy, not an intent.
//
// ⛔ AND THE THREE UN-CLICKABLE ARMS ARE ASSERTED SEPARATELY. A room with no detected outline, a
// room whose outline is not a polygon and a room with no id must each render as TEXT with its own
// reason — never as a control that swallows a click, and never as three copies of one sentence.
const SQ = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];

describe('§26.6.4 — a room row is the ONE highlight control', () => {
    it('⭐ a room WITH a detected outline is a real button, and CLICKING it writes the ONE store', () => {
        const { d } = deps({
            rooms: [{ id: 'r1', name: 'Living', levelId: 'L0', computed: { area: 24 }, boundary: { polygon: SQ } }],
        });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="room:r1"]`)!;
            expect(btn, 'the room row is not a control').not.toBeNull();
            expect(btn.textContent).toContain('Living');
            expect(btn.getAttribute('aria-pressed')).toBe('false');
            // ⭐ THE CLICK, on the real markup, through the real wire.
            btn.click();
            expect(getSiteHighlight()).toBe('room:r1');
            expect(btn.getAttribute('aria-pressed')).toBe('true');
            expect(btn.querySelector('[data-hl-glyph]')!.textContent).toContain('◉');
            // Clicking the same row again clears it — one emphasis at a time, by the store's rule.
            btn.click();
            expect(getSiteHighlight()).toBeNull();
        } finally { h.dispose(); }
    });

    it('⭐ the ◉ is repainted from the STORE, so another surface click cannot leave it stale', () => {
        const { d } = deps({
            rooms: [{ id: 'r1', name: 'Living', levelId: 'L0', boundary: { polygon: SQ } }],
        });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="room:r1"]`)!;
            btn.click();
            expect(btn.getAttribute('aria-pressed')).toBe('true');
            // Somebody else — question 1's `Area` row — takes the emphasis. This row must let go.
            setSiteHighlight('parcel');
            expect(btn.getAttribute('aria-pressed')).toBe('false');
            expect(btn.querySelector('[data-hl-glyph]')!.textContent).toContain('◎');
        } finally { h.dispose(); }
    });

    it('⛔ THREE un-clickable arms, three DIFFERENT reasons — never a dead click, never one sentence', () => {
        const { d } = deps({
            rooms: [
                // 1. no outline recorded at all
                { id: 'r1', name: 'Planned study', levelId: 'L0' },
                // 2. an outline WAS recorded and is not a polygon
                { id: 'r2', name: 'Broken', levelId: 'L0', boundary: { polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] } },
                // 3. no id — the record cannot be named to the views at all
                { name: 'Nameless', levelId: 'L0', boundary: { polygon: SQ } },
            ],
        });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            expect(host.querySelectorAll(`button[${SITE_HIGHLIGHT_ATTR}]`).length).toBe(0);
            const markers = [...host.querySelectorAll<HTMLElement>(`[${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}]`)];
            expect(markers.length).toBe(3);
            expect(markers.map((m) => m.getAttribute(SITE_HIGHLIGHT_UNAVAILABLE_ATTR)))
                .toEqual(['room:r1', 'room:r2', '']);
            const reasons = markers.map((m) => m.getAttribute('title') ?? '');
            expect(reasons[0]).toContain('missing measurement');
            expect(reasons[1]).toContain('finding about the model');
            expect(reasons[2]).toContain('no id');
            // ⛔ Three causes, three sentences.
            expect(new Set(reasons).size).toBe(3);
            // The rooms are still LISTED — an un-pointable room is not a dropped room.
            expect(host.textContent).toContain('Planned study');
            expect(host.textContent).toContain('Nameless');
        } finally { h.dispose(); }
    });

    it('⭐ an UNPLACED room is still pointable — its storey is unknown, its outline is not', () => {
        const { d } = deps({
            rooms: [{ id: 'r9', name: 'Hall', boundary: { polygon: SQ } }],
        });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const unplaced = host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_UNPLACED_TESTID}"]`)!;
            const btn = unplaced.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="room:r9"]`)!;
            expect(btn, 'an unplaced room lost its link for an unrelated missing field').not.toBeNull();
            btn.click();
            expect(getSiteHighlight()).toBe('room:r9');
        } finally { h.dispose(); }
    });

    it('⭐ RE-WIRED ON EVERY RENDER — a row rebuilt by a room event is still a live control', () => {
        const { d, state, fire } = deps({
            rooms: [{ id: 'r1', name: 'Living', levelId: 'L0', boundary: { polygon: SQ } }],
        });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        try {
            const root = host.querySelector(`[data-testid="${ROOMS_PER_LEVEL_ROOT_TESTID}"]`)!;
            expect(root.getAttribute(ROOMS_PER_LEVEL_WIRED_ATTR)).toBe('1');
            // A room is renamed / added: `replaceChildren` throws every handler away.
            state.rooms = [
                { id: 'r1', name: 'Living', levelId: 'L0', boundary: { polygon: SQ } },
                { id: 'r2', name: 'Kitchen', levelId: 'L0', boundary: { polygon: SQ } },
            ];
            fire();
            expect(root.getAttribute(ROOMS_PER_LEVEL_WIRED_ATTR)).toBe('2');
            const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="room:r2"]`)!;
            btn.click();
            expect(getSiteHighlight()).toBe('room:r2');
        } finally { h.dispose(); }
    });

    it('dispose drops the store subscription — a disposed section never repaints a detached row', () => {
        const { d } = deps({ rooms: [{ id: 'r1', name: 'Living', levelId: 'L0', boundary: { polygon: SQ } }] });
        const host = document.createElement('div');
        const h = mountRoomsPerLevelSection(host, d);
        const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="room:r1"]`)!;
        btn.click();
        h.dispose();
        expect(() => setSiteHighlight('parcel')).not.toThrow();
    });
});
