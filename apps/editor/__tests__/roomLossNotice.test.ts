/**
 * §ROOM-LOSS-NOTICE (L-12660) — the TELL half. C94 §TOBE.1.2 / RM-3 companion.
 *
 * `RoomMeaningRestoreProposal`'s offer only reaches the user once a later re-detection
 * reclaims the exact footprint. The founder's own session never got there — the loop
 * stayed broken — so the ONLY place his loss was ever recorded was a console line. These
 * arms pin that the chat now says so immediately, unconditionally, on the pass that
 * dropped the room.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RoomLossNotice } from '@pryzm/command-registry';
import {
    buildLossNoticeMessage,
    initRoomLossNotices,
    __resetRoomLossNoticeState,
} from '../src/ui/ai/RoomLossNotice';
import { roomLossNotifier } from '@pryzm/command-registry';
import { registerChatPromptHost, __resetChatPromptHost } from '../src/ui/ai/chatPromptHost';

const NOTICE: RoomLossNotice = {
    levelId: 'L0',
    tombstones: [{
        census: {
            id: 'lost-room-id-0001', levelId: 'L0', name: 'Dressing 01', roomNumber: '00-004',
            areaM2: 224.7, occupancyType: 'changing-room',
            authored: true, authoredFields: ['name', 'occupancyType', 'department'],
        },
        meaning: { name: 'Dressing 01', occupancyType: 'changing-room', department: 'Residential' },
        polygon: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 }, { x: 0, z: 6 }],
        levelId: 'L0',
        seq: 1,
    }],
};

beforeEach(() => {
    __resetRoomLossNoticeState();
    __resetChatPromptHost();
});

describe('§ROOM-LOSS-NOTICE — the message names the room, says why undo cannot help, and '
    + 'what happens next', () => {
    it('names the lost room and its area', () => {
        const s = buildLossNoticeMessage(NOTICE);
        expect(s).toContain('Dressing 01');
        expect(s).toContain('224.7 m²');
    });

    it('cites the undo limit — C94 §TOBE.1.2 — rather than staying silent about why', () => {
        const s = buildLossNoticeMessage(NOTICE);
        expect(s).toMatch(/undo cannot/i);
        expect(s).toContain('C94 §TOBE.1.2');
    });

    it('says what happens IF the space closes again, without promising it will', () => {
        const s = buildLossNoticeMessage(NOTICE);
        expect(s).toMatch(/if this space is enclosed again/i);
        expect(s).toMatch(/offer/i);
    });

    it('carries occupancy and department, not just the name — Confirm later is informed', () => {
        const s = buildLossNoticeMessage(NOTICE);
        expect(s).toContain('changing-room');
        expect(s).toContain('Residential');
    });

    it('pluralises correctly for a multi-room notice', () => {
        const multi: RoomLossNotice = {
            levelId: 'L0',
            tombstones: [
                NOTICE.tombstones[0]!,
                {
                    census: {
                        id: 'lost-room-id-0002', levelId: 'L0', name: 'Kitchen', roomNumber: '00-005',
                        areaM2: 18.2, occupancyType: 'kitchen',
                        authored: true, authoredFields: ['name'],
                    },
                    meaning: { name: 'Kitchen' },
                    polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
                    levelId: 'L0', seq: 2,
                },
            ],
        };
        const s = buildLossNoticeMessage(multi);
        expect(s).toContain('2 named rooms');
        expect(s).toContain('Dressing 01');
        expect(s).toContain('Kitchen');
    });
});

describe('§ROOM-LOSS-NOTICE — it reaches the chat, unconditionally, on subscribe', () => {
    it('⭐⭐ RED ON HEAD (pre-fix): publishing on roomLossNotifier puts a message in the '
        + 'chat via chatSay — no Confirm/Cancel, nothing withheld pending a later match', () => {
        const said: string[] = [];
        registerChatPromptHost({ say: t => { said.push(t); }, confirm: async () => true });
        const off = initRoomLossNotices();
        try {
            roomLossNotifier.publish(NOTICE);
            expect(said).toHaveLength(1);
            expect(said[0]).toContain('Dressing 01');
        } finally { off(); }
    });

    it('is idempotent — a second bootstrap does not double-announce', () => {
        const said: string[] = [];
        registerChatPromptHost({ say: t => { said.push(t); }, confirm: async () => true });
        const off1 = initRoomLossNotices();
        const off2 = initRoomLossNotices();
        try {
            roomLossNotifier.publish(NOTICE);
            expect(said).toHaveLength(1);
        } finally { off1(); off2(); }
    });

    it('an empty tombstone list is never announced', () => {
        const said: string[] = [];
        registerChatPromptHost({ say: t => { said.push(t); }, confirm: async () => true });
        const off = initRoomLossNotices();
        try {
            roomLossNotifier.publish({ levelId: 'L0', tombstones: [] });
            expect(said).toHaveLength(0);
        } finally { off(); }
    });

    it('a listener that throws inside chatSay cannot break the notifier', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // No chat host registered at all — chatSay queues rather than throwing, so this
        // also proves the "no surface yet" path does not crash the publish.
        const off = initRoomLossNotices();
        try {
            expect(() => roomLossNotifier.publish(NOTICE)).not.toThrow();
        } finally { off(); vi.restoreAllMocks(); }
    });
});
