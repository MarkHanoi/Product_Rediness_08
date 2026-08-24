/**
 * §ROOM-TOMBSTONE (L-10814) — the ASK half. C94 §TOBE.6 **RM-3**.
 *
 * The founder's ruling (2026-08-24) was **DERIVATION + TOMBSTONE**, and he attached an
 * honesty condition to it: **the offer must say what it CANNOT restore.** These arms pin
 * that condition, and pin that nothing is applied without a Confirm.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RoomMeaningOffer } from '@pryzm/command-registry';
import {
    buildRestoreSummary,
    presentRoomMeaningOffer,
    __resetRoomMeaningProposalState,
} from '../src/ui/ai/RoomMeaningRestoreProposal';
import { registerChatPromptHost, __resetChatPromptHost } from '../src/ui/ai/chatPromptHost';

const OFFER: RoomMeaningOffer = {
    levelId: 'L0',
    roomId: 'new-room-id-0002',
    tombstone: {
        census: {
            id: 'lost-room-id-0001', levelId: 'L0', name: 'Kitchen', roomNumber: 'G.101',
            areaM2: 48.04, occupancyType: 'kitchen',
            authored: true, authoredFields: ['name', 'roomNumber', 'occupancyType'],
        },
        meaning: { name: 'Kitchen', roomNumber: 'G.101', occupancyType: 'kitchen' },
        polygon: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }],
        levelId: 'L0',
        seq: 1,
    },
};

function harness(answer: boolean | undefined) {
    const said: string[] = [];
    const asked: string[] = [];
    const executeCommand = vi.fn(async () => ({ success: true }));
    (globalThis as { window?: unknown }).window = { runtime: { bus: { executeCommand } } };
    if (answer !== undefined) {
        registerChatPromptHost({
            say: t => { said.push(t); },
            confirm: async s => { asked.push(s); return answer; },
        });
    }
    return { said, asked, executeCommand };
}

beforeEach(() => {
    __resetRoomMeaningProposalState();
    __resetChatPromptHost();
    delete (globalThis as { window?: unknown }).window;
});

describe('§ROOM-TOMBSTONE — the question names the room and lists exactly what it offers', () => {
    it('names the lost room and its area, so the user knows WHICH room this is about', () => {
        const s = buildRestoreSummary(OFFER);
        expect(s).toContain('Kitchen');
        expect(s).toContain('48.0 m²');
    });

    it('lists what is on offer rather than a generic "details" — Confirm must be informed', () => {
        const s = buildRestoreSummary(OFFER);
        expect(s).toContain('Kitchen');
        expect(s).toContain('G.101');
        expect(s).toContain('kitchen');
    });

    it('⭐ THE FOUNDER’S CONDITION: it says what it CANNOT restore', () => {
        const s = buildRestoreSummary(OFFER);
        // Meaning, not identity — the room tag / schedule row stays orphaned.
        expect(s).toMatch(/new room/i);
        expect(s).toMatch(/room tag|schedule/i);
        // ⛔ It must never imply the room itself is back.
        expect(s).not.toMatch(/restored the room|the same room|as it was before/i);
    });
});

describe('§ROOM-TOMBSTONE — it ASKS, and never edits without an answer', () => {
    it('⛔ dispatches NOTHING until Confirm', async () => {
        const h = harness(false);
        await presentRoomMeaningOffer(OFFER);
        expect(h.asked).toHaveLength(1);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toContain('Left as it is');
    });

    it('⭐ on Confirm dispatches ONE room.restoreMeaning — one command, one Ctrl+Z', async () => {
        const h = harness(true);
        await presentRoomMeaningOffer(OFFER);

        expect(h.executeCommand).toHaveBeenCalledTimes(1);
        const [verb, payload] = h.executeCommand.mock.calls[0] as [string, Record<string, unknown>];
        expect(verb).toBe('room.restoreMeaning');
        expect(payload.roomId).toBe('new-room-id-0002');
        expect(payload.name).toBe('Kitchen');
        expect(payload.roomNumber).toBe('G.101');
        expect(payload.occupancyType).toBe('kitchen');
    });

    it('⛔ the payload carries NO id and NO geometry — the ruling granted meaning, not identity', async () => {
        const h = harness(true);
        await presentRoomMeaningOffer(OFFER);
        const [, payload] = h.executeCommand.mock.calls[0] as [string, Record<string, unknown>];
        expect(payload.id).toBeUndefined();
        expect(payload.boundary).toBeUndefined();
        expect(payload.polygon).toBeUndefined();
        // ...and it must not smuggle the LOST room's id back in under any key.
        expect(JSON.stringify(payload)).not.toContain('lost-room-id-0001');
    });

    it('says nothing changed when the bus cannot be reached', async () => {
        const h = harness(true);
        (globalThis as { window?: unknown }).window = {};   // no runtime.bus
        await presentRoomMeaningOffer(OFFER);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toContain('nothing was changed');
    });

    it('§PROMPT-REACHES-A-HUMAN — no surface at all is NOT a decline, and dispatches nothing', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const h = harness(undefined);   // no chat host registered
        await presentRoomMeaningOffer(OFFER);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(err.mock.calls.flat().join(' ')).toContain('§PROMPT-REACHES-A-HUMAN');
        vi.restoreAllMocks();
    });
});
