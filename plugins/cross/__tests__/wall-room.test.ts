// plugins/cross/__tests__/wall-room.test.ts — smoke tests for the
// wall→room cascade rule (S26 / ADR-0023).  Asserts the rule
// (a) fires for the documented trigger set, (b) skips material-only
// and topology-only wall commands, (c) extracts the wall id from
// either `payload.wallId` (most handlers) or `payload.id`
// (wall.create), and (d) synthesises a single, well-formed
// `room.recomputeBoundary` per affected room.

import { describe, expect, it } from 'vitest';
import type { CascadeContext } from '@pryzm/plugin-sdk';
import {
  buildWallRoomCascadeRule,
  WALL_ROOM_CASCADE_TRIGGERS,
} from '../src/wall-room.js';

const ctx: CascadeContext = { stores: {} };

describe('cross.wall-room', () => {
  it('appliesTo exactly the documented trigger set', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => [] });
    for (const t of WALL_ROOM_CASCADE_TRIGGERS) {
      expect(rule.appliesTo(t)).toBe(true);
    }
    // Material / topology / opening edits MUST NOT cascade.
    for (const t of [
      'wall.setColor',
      'wall.bulkSetVisuals',
      'wall.setLayers',
      'wall.setSystemType',
      'wall.cut',
      'wall.createOpening',
      'wall.join',
      'room.move',
      'slab.move',
    ]) {
      expect(rule.appliesTo(t)).toBe(false);
    }
  });

  it('exposes the documented rule key by default', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => [] });
    expect(rule.key).toBe('cross.wall-room');
  });

  it('honours a caller-supplied rule key for multi-tenant test harnesses', () => {
    const rule = buildWallRoomCascadeRule({
      roomsAffectedByWall: () => [],
      key: 'cross.wall-room#tenant-A',
    });
    expect(rule.key).toBe('cross.wall-room#tenant-A');
  });

  it('throws when roomsAffectedByWall is missing', () => {
    expect(() =>
      buildWallRoomCascadeRule({ roomsAffectedByWall: undefined as unknown as () => readonly string[] }),
    ).toThrow(/roomsAffectedByWall/);
  });

  it('extractEntityId reads payload.wallId for non-create triggers', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => [] });
    expect(
      rule.extractEntityId!({ type: 'wall.move', payload: { wallId: 'wall_X', delta: { x: 0, y: 0, z: 0 } } }),
    ).toBe('wall_X');
  });

  it('extractEntityId falls back to payload.id for wall.create', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => [] });
    expect(rule.extractEntityId!({ type: 'wall.create', payload: { id: 'wall_new' } })).toBe('wall_new');
  });

  it('throws when payload carries no wall id', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => [] });
    expect(() =>
      rule.extractEntityId!({ type: 'wall.move', payload: {} }),
    ).toThrow(/wall-room/);
  });

  it('resolveAffected delegates to roomsAffectedByWall, called once', () => {
    let calls = 0;
    const rule = buildWallRoomCascadeRule({
      roomsAffectedByWall: (id) => {
        calls += 1;
        return id === 'wall_A' ? ['room_1', 'room_2'] : [];
      },
    });
    expect(
      rule.resolveAffected({ type: 'wall.move', payload: { wallId: 'wall_A', delta: { x: 1, y: 0, z: 0 } } }, ctx),
    ).toEqual(['room_1', 'room_2']);
    expect(calls).toBe(1);
  });

  it('wall.move synthesises a room.recomputeBoundary per affected room', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => ['room_1', 'room_2'] });
    const cmd = { type: 'wall.move', payload: { wallId: 'wall_A', delta: { x: 1, y: 0, z: 0 } } };
    const synth = rule.synthesize('room_1', cmd, ctx);
    expect(synth.type).toBe('room.recomputeBoundary');
    expect(synth.payload).toMatchObject({
      roomId: 'room_1',
      cascadedFrom: 'wall.move',
      wallId: 'wall_A',
    });
  });

  it('wall.delete still synthesises a recompute (caller snapshots first)', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => ['room_42'] });
    const cmd = { type: 'wall.delete', payload: { wallId: 'wall_gone' } };
    const synth = rule.synthesize('room_42', cmd, ctx);
    expect(synth.payload).toMatchObject({
      roomId: 'room_42',
      cascadedFrom: 'wall.delete',
      wallId: 'wall_gone',
    });
  });

  it('wall.create reads its id from payload.id and synthesises correctly', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => ['room_7'] });
    const cmd = { type: 'wall.create', payload: { id: 'wall_new' } };
    const synth = rule.synthesize('room_7', cmd, ctx);
    expect(synth.payload).toMatchObject({
      roomId: 'room_7',
      cascadedFrom: 'wall.create',
      wallId: 'wall_new',
    });
  });

  it('wall.transform / setDimensions / changeLevel all synthesise the same shape', () => {
    const rule = buildWallRoomCascadeRule({ roomsAffectedByWall: () => ['room_3'] });
    for (const type of ['wall.transform', 'wall.setDimensions', 'wall.changeLevel']) {
      const cmd = { type, payload: { wallId: 'wall_X' } };
      const synth = rule.synthesize('room_3', cmd, ctx);
      expect(synth.type).toBe('room.recomputeBoundary');
      expect((synth.payload as { roomId: string }).roomId).toBe('room_3');
      expect((synth.payload as { cascadedFrom: string }).cascadedFrom).toBe(type);
    }
  });
});
