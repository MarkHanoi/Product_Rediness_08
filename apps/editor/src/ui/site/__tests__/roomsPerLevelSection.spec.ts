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
    type RoomsPerLevelDeps,
} from '../roomsPerLevelSection';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { ExistingLevelEnvelope } from '../levelEnvelopeSupersession';

afterEach(() => {
    document.body.innerHTML = '';
});

const L0: AdoptLevelCandidate = { id: 'L0', name: 'Ground', elevation: 0, height: 3 };
const L1: AdoptLevelCandidate = { id: 'L1', name: 'Level 1', elevation: 3, height: 3 };
const E0: ExistingLevelEnvelope = {
    id: 'e0', levelId: 'L0', name: 'Proposed ground floor · 301 m²', footprintAreaM2: 301,
    provenance: systemProvenance('computed', 'test'),
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
