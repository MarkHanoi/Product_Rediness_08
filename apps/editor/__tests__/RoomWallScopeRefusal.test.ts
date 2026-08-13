// GR-10 — ZeroTokenChatBridge room-scope differentiating tests.
//
// The bridge's room arm read `rooms.flatMap((r) => r.boundingWallIds ?? [])`
// to build a chat COMMAND SCOPE: a room whose bounding-wall relationship was
// never recorded silently contributed nothing, so the command acted on a
// SUBSET of the user's ask while presenting as a successful resolution. The
// resolver now REFUSES with both numbers (C80 §1.4 / RAC hard-stopper
// doctrine). The refusal assertions fail against the `?? []` shape, which
// returned a walls answer in every case.

import { describe, it, expect } from 'vitest';
import { resolveRoomWallScope } from '../src/ui/ai/roomWallScope';

describe('resolveRoomWallScope — unreadable rooms refuse, empty rooms answer', () => {
    it('all rooms recorded (one genuinely wall-less) → walls, deduped, NO refusal', () => {
        const r = resolveRoomWallScope([
            { id: 'r1', name: 'kitchen', boundingWallIds: ['w1', 'w2'] },
            { id: 'r2', name: 'kitchen', boundingWallIds: ['w2', 'w3'] },
            { id: 'r3', name: 'pantry', boundingWallIds: [] }, // determined-empty: a real answer
        ]);
        expect(r).toEqual({ kind: 'walls', ids: ['w1', 'w2', 'w3'] });
    });

    it('ONE unrecorded room refuses the WHOLE scope, with both numbers and the name', () => {
        const r = resolveRoomWallScope([
            { id: 'r1', name: 'kitchen', boundingWallIds: ['w1'] },
            { id: 'r2', name: 'kitchen-2' }, // boundingWallIds never recorded
        ]);
        expect(r.kind).toBe('refused'); // the old `?? []` shape answered { ids: ['w1'] } here
        if (r.kind === 'refused') {
            expect(r.error).toContain('1 of 2');
            expect(r.error).toContain('kitchen-2');
            expect(r.unrecordedRoomLabels).toEqual(['kitchen-2']);
        }
    });

    it('every room unrecorded → refused with the full count, never an empty walls answer', () => {
        const r = resolveRoomWallScope([{ id: 'r1' }, { id: 'r2' }]);
        expect(r.kind).toBe('refused');
        if (r.kind === 'refused') expect(r.error).toContain('2 of 2');
    });

    it('negative control: zero matched rooms is a DETERMINED empty scope, not a refusal', () => {
        expect(resolveRoomWallScope([])).toEqual({ kind: 'walls', ids: [] });
    });
});
