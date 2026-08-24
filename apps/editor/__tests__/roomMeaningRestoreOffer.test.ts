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
    buildMergeSummary,
    presentRoomMeaningOffer,
    __resetRoomMeaningProposalState,
} from '../src/ui/ai/RoomMeaningRestoreProposal';
import { registerChatPromptHost, __resetChatPromptHost } from '../src/ui/ai/chatPromptHost';

const OFFER: RoomMeaningOffer = {
    levelId: 'L0',
    roomId: 'new-room-id-0002',
    candidates: [{
        census: {
            id: 'lost-room-id-0001', levelId: 'L0', name: 'Kitchen', roomNumber: 'G.101',
            areaM2: 48.04, occupancyType: 'kitchen',
            authored: true, authoredFields: ['name', 'roomNumber', 'occupancyType'],
        },
        meaning: { name: 'Kitchen', roomNumber: 'G.101', occupancyType: 'kitchen' },
        polygon: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }],
        levelId: 'L0',
        seq: 1,
    }],
};

function harness(answer: boolean | undefined) {
    const said: string[] = [];
    const asked: string[] = [];
    const executeCommand = vi.fn(async () => ({ success: true }));
    (globalThis as { window?: unknown }).window = {
        runtime: { bus: { executeCommand } },
        // The target room still exists — `applyMeaning` re-checks before dispatching.
        roomStore: { getById: (id: string) => (id === 'new-room-id-0002' ? { id } : undefined) },
    };
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
        (globalThis as { window?: unknown }).window = {
            roomStore: { getById: () => ({ id: 'new-room-id-0002' }) },
        };   // no runtime.bus
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

/**
 * §MERGE-AWARDS-NOBODY (L-10815) — C94 R-3, ruled 2026-08-24.
 *
 * The founder's condition on the copy: **it must say a MERGE happened, not that a room
 * was lost** — those are different events and the user needs to tell them apart — and
 * **"neither" must be a real, easy choice**, because a merged space genuinely often
 * wants a new name rather than either old one.
 */
const MERGE_OFFER: RoomMeaningOffer = {
    levelId: 'L0',
    roomId: 'merged-room-id-0003',
    candidates: [
        {
            census: {
                id: 'lost-living', levelId: 'L0', name: 'Living', roomNumber: '101',
                areaM2: 32.0, occupancyType: 'living-room',
                authored: true, authoredFields: ['name'],
            },
            meaning: { name: 'Living', roomNumber: '101', occupancyType: 'living-room' },
            polygon: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }],
            levelId: 'L0', seq: 2,
        },
        {
            census: {
                id: 'lost-kitchen', levelId: 'L0', name: 'Kitchen', roomNumber: '102',
                areaM2: 48.0, occupancyType: 'kitchen',
                authored: true, authoredFields: ['name'],
            },
            meaning: { name: 'Kitchen', roomNumber: '102', occupancyType: 'kitchen' },
            polygon: [{ x: 8, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 6 }, { x: 8, z: 6 }],
            levelId: 'L0', seq: 1,
        },
    ],
};

function mergeHarness(answers: Array<boolean | undefined>) {
    const said: string[] = [];
    const asked: string[] = [];
    const executeCommand = vi.fn(async () => ({ success: true }));
    (globalThis as { window?: unknown }).window = {
        runtime: { bus: { executeCommand } },
        roomStore: { getById: (id: string) => (id === 'merged-room-id-0003' ? { id } : undefined) },
    };
    let i = 0;
    registerChatPromptHost({
        say: t => { said.push(t); },
        confirm: async sm => { asked.push(sm); return answers[i++] ?? false; },
    });
    return { said, asked, executeCommand };
}

describe('§MERGE-AWARDS-NOBODY — the copy says a MERGE happened', () => {
    it('⭐ names BOTH rooms and calls it a merge, not a loss', () => {
        const s = buildMergeSummary(MERGE_OFFER);
        expect(s).toMatch(/merged/i);
        expect(s).toContain('Living');
        expect(s).toContain('Kitchen');
        expect(s).toContain('32.0 m²');
        expect(s).toContain('48.0 m²');
        // ⛔ It must NOT describe this as one room going missing.
        expect(s).not.toMatch(/was lost when its boundary/i);
    });

    it('⭐ says NEITHER name was applied, and that leaving it unnamed is a fine answer', () => {
        const s = buildMergeSummary(MERGE_OFFER);
        expect(s).toMatch(/neither/i);
        expect(s).toMatch(/Cancel to leave it unnamed/i);
        expect(s).toMatch(/often the right answer/i);
    });
});

describe('§MERGE-AWARDS-NOBODY — "neither" is one click, and nothing is applied', () => {
    it('⭐ a single Cancel ends it — no second question, no dispatch', async () => {
        const h = mergeHarness([false]);
        await presentRoomMeaningOffer(MERGE_OFFER);
        expect(h.asked).toHaveLength(1);              // ONE click to keep a fresh name
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toMatch(/Left unnamed/i);
    });

    it('Confirm then declining EVERY room still lands on "neither" — never trapped into picking', async () => {
        const h = mergeHarness([true, false, false]);
        await presentRoomMeaningOffer(MERGE_OFFER);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toMatch(/neither room/i);
    });

    it('⭐ picking the FIRST room dispatches exactly one command with THAT room details', async () => {
        const h = mergeHarness([true, true]);
        await presentRoomMeaningOffer(MERGE_OFFER);
        expect(h.executeCommand).toHaveBeenCalledTimes(1);
        const [verb, payload] = h.executeCommand.mock.calls[0] as [string, Record<string, unknown>];
        expect(verb).toBe('room.restoreMeaning');
        expect(payload.roomId).toBe('merged-room-id-0003');
        expect(payload.name).toBe('Living');
    });

    it('⭐ declining the first and taking the SECOND applies the second, and stops', async () => {
        const h = mergeHarness([true, false, true]);
        await presentRoomMeaningOffer(MERGE_OFFER);
        expect(h.executeCommand).toHaveBeenCalledTimes(1);
        const [, payload] = h.executeCommand.mock.calls[0] as [string, Record<string, unknown>];
        expect(payload.name).toBe('Kitchen');
    });

    it('⛔ no id and no geometry travel with a merge choice either', async () => {
        const h = mergeHarness([true, true]);
        await presentRoomMeaningOffer(MERGE_OFFER);
        const [, payload] = h.executeCommand.mock.calls[0] as [string, Record<string, unknown>];
        expect(payload.id).toBeUndefined();
        expect(payload.boundary).toBeUndefined();
        expect(JSON.stringify(payload)).not.toContain('lost-living');
        expect(JSON.stringify(payload)).not.toContain('lost-kitchen');
    });
});

describe('§MERGE-AWARDS-NOBODY — Ctrl+Z before answering (C94 R-3 condition 5)', () => {
    it('⭐ refuses to write onto a room that no longer exists, and says why', async () => {
        // The user merges, is asked, presses Ctrl+Z, THEN confirms. The room the offer
        // names has been replaced by the re-detect that the undo triggered.
        const said: string[] = [];
        const executeCommand = vi.fn(async () => ({ success: true }));
        (globalThis as { window?: unknown }).window = {
            runtime: { bus: { executeCommand } },
            roomStore: { getById: () => undefined },     // it is gone
        };
        registerChatPromptHost({
            say: t => { said.push(t); },
            confirm: async () => true,
        });

        await presentRoomMeaningOffer(MERGE_OFFER);

        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.join(' ')).toMatch(/changed again before you answered/i);
    });

    it('⚠ an UNREACHABLE store is not treated as "gone" — an unknown is not a no', async () => {
        // Same three-valued discipline as §WD32-B: with no store to ask, the dispatch
        // proceeds and the command layer decides, rather than this surface inventing a
        // refusal it did not measure.
        const executeCommand = vi.fn(async () => ({ success: true }));
        (globalThis as { window?: unknown }).window = { runtime: { bus: { executeCommand } } };
        registerChatPromptHost({ say: () => {}, confirm: async () => true });

        await presentRoomMeaningOffer(MERGE_OFFER);
        expect(executeCommand).toHaveBeenCalledTimes(1);
    });
});
