// ─── room.create — the ENGINE-ABSENT arm answers as a VALUE (C80 §1.4) ───────
//
// ── WHAT THE P3 AXIS C AUDIT MEASURED, AND WHAT IT DID NOT ───────────────────
//
// The audit (audit/full-stack/2026-08-31/commands/room.json) classes this verb
// LIVE per the canonical register and carries a class-(c) EXECUTED negative:
//
//     "REFUSES BY NAME in a composed process - legacy command manager is not
//      available."  (composedBusElementReadback.test.ts:234-236)
//
// and named the inversion around it: 18 of the 22 verbs it PROVED work are
// classed UNKNOWN while room.create is classed LIVE and does not write. So the
// register was not trusted here — the two questions behind it were MEASURED:
//
//   Q1 · IS THE HANDLER EVEN REGISTERED IN PRODUCTION? YES, and twice:
//        `apps/editor/src/PluginRegistry.ts:694` contributes
//        `buildRoomHandlerSet()` through composeRuntime, and
//        `apps/editor/src/engine/engineLauncher.ts:658` calls
//        `registerRoomHandlers(_bus)` again at F-1.3 (the second throws
//        duplicate-register and is caught non-fatally).
//
//   Q2 · IS `window.commandManager` ACTUALLY ABSENT IN PRODUCTION? NO. It is
//        assigned at `apps/editor/src/engine/initTools.ts:3254`. In the browser
//        this handler reaches `CreateRoomCommand` and rooms are created.
//
// ⭐ SO THE "WIRING GAP" HORN IS REFUTED. The legacy manager is absent ONLY in a
// composed process that never boots the engine half — no BimManager level
// authority, no attached RoomStore. That absence is LEGITIMATE, and closing it
// from inside this plugin would mean writing rooms locally: a RIVAL of the one
// authoritative creation path, minting records without the unique room-number
// assignment, bimManager.registerElement spatial registration and
// elementRegistry.registerSemantic that CreateRoomCommand performs in the
// §R-3 order. That is the worse fix, so it was not made.
//
// ── WHAT WAS ACTUALLY WRONG, THEN ────────────────────────────────────────────
//
// Only the SHAPE of the answer. The engine-absent branch THREW. C80 §10.f names
// that defect: a throw is what a fire-and-forget catch-block swallows, and
// every one of this verb's live dispatchers is exactly that shape —
// RoomPlanToolHandler.ts:149 catches to console.error, while
// RoomAIAssistant.ts:165 and RoomTool.ts:224/387 both catch to an EMPTY block.
// Three of the four drop it on the floor without trace. The refusal now rides
// back as a VALUE on HandlerResult.refusal (CapabilityRefusal, C80 §1.4)
// beside an empty patch pair — the shape C16 CA-18 prescribes and the shape
// room.regenerate already uses in this same directory.
//
// ⚠ THIS IS A CONDITIONAL REFUSAL, NOT A DEAD VERB, and the distinction is the
// whole point of the last test in this file. room.create mutates whenever the
// engine half is present. Any reading of this file — or of a gate — that
// concludes "room.create refuses" flat is over-reporting, which
// check-verb-register.ts warns against by name in refusesInCanExecute's ⚠
// ("a gate that grades a working bridge 'refuses' is worse than the defect it
// was written to fix").

import { describe, expect, it, afterEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores } from '@pryzm/plugin-sdk';
import { RoomStore, type RoomsState } from '../src/store.js';
import { buildRoomHandlerSet } from '../src/handlers/index.js';

function buildEnv() {
  const room = new RoomStore();
  const stores = { room: room as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      room: Object.fromEntries(room.getState()) as RoomsState,
    }),
  });
  for (const h of buildRoomHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { room, bus, emitter, undoStack, detach };
}

/** A COMPLETE RoomData record — the shape RoomPlanToolHandler.ts:114 sends, so
 *  canExecute passes and the engine-absent branch in execute() is the thing
 *  under test rather than payload validation. */
function completeRoomPayload(): Record<string, unknown> {
  return {
    id: 'room-1',
    type: 'room',
    name: 'Living',
    roomNumber: '',
    levelId: 'L1',
    parentId: 'L1',
    boundary: {
      polygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 3 },
        { x: 0, z: 3 },
      ],
      baseOffset: 0,
      height: 2.7,
      detectionMethod: 'manual-boundary',
    },
    computed: {
      area: 12,
      grossArea: 12,
      perimeter: 14,
      volume: 32.4,
      centroid: { x: 2, z: 1.5 },
      boundingBox: { min: { x: 0, z: 0 }, max: { x: 4, z: 3 } },
    },
    metadata: {},
  };
}

const w = globalThis as unknown as { window?: Record<string, unknown> };

afterEach(() => {
  if (w.window) delete w.window.commandManager;
});

describe('room.create — engine absent answers as a VALUE, not a throw (C80 §1.4)', () => {
  it('does NOT throw when the legacy command manager is absent', async () => {
    const env = buildEnv();
    // If this rejected, the test fails here — which is the point. C80 §10.f:
    // a refusal delivered as an exception is one an empty catch-block erases,
    // and three of this verb's four live dispatchers are exactly that.
    const record = await env.bus.executeCommand('room.create', completeRoomPayload());
    expect(record).toBeDefined();
    env.detach();
  });

  it('returns a TYPED refusal naming the verb, with the closed-union reason ENGINE_NOT_AVAILABLE', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.create', completeRoomPayload());
    expect(record.refusal).toBeDefined();
    expect(record.refusal!.kind).toBe('refused');
    expect(record.refusal!.commandType).toBe('room.create');
    // The C78 §8.1 member for "the half of the system that performs this is not
    // in this process" — the same one clashCapability.ts uses for its engine.
    expect(record.refusal!.reason).toBe('ENGINE_NOT_AVAILABLE');
    env.detach();
  });

  it('carries BOTH NUMBERS (C80 §1.4) — one room asked for, one unaccounted for', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.create', completeRoomPayload());
    const r = record.refusal!;
    expect(r.asked).toBe(1);
    expect(r.unaccountedFor).toBe(1);
    // Both must be in the SENTENCE too — a number only a typed consumer can
    // reach is not a number the user was told.
    expect(r.detail).toContain('1 room');
    env.detach();
  });

  it('NAMES what it protects (C80 §3.2) and both the ASK and the BLOCKER', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.create', completeRoomPayload());
    const r = record.refusal!;
    expect(r.protects.length).toBeGreaterThan(0);
    // The protected subject is the registration work CreateRoomCommand does and
    // a local write would skip — that is WHY this refuses instead of writing.
    expect(r.protects).toContain('CreateRoomCommand');
    expect(r.detail).toContain('THE ASK:');
    expect(r.detail).toContain('THE BLOCKER:');
    // It must name the boot site a reader can go and check, not just "missing".
    expect(r.detail).toContain('initTools.ts');
    env.detach();
  });

  it('writes NOTHING when it refuses — the empty patch pair is a determination, not a no-op', async () => {
    const env = buildEnv();
    const before = JSON.stringify(Object.fromEntries(env.room.getState()));
    const record = await env.bus.executeCommand('room.create', completeRoomPayload());
    expect(record.refusal).toBeDefined();
    expect(JSON.stringify(Object.fromEntries(env.room.getState()))).toBe(before);
    env.detach();
  });

  it('⭐ CONDITIONAL, NOT DEAD — with a command manager present it DELEGATES and does not refuse', async () => {
    const env = buildEnv();
    const seen: unknown[] = [];
    if (!w.window) w.window = {};
    w.window.commandManager = {
      execute: (c: unknown) => { seen.push(c); return { success: true }; },
    };

    const record = await env.bus.executeCommand('room.create', completeRoomPayload());

    // This is the reading that makes "room.create REFUSES" an over-report: the
    // same payload that refused above now reaches CreateRoomCommand.
    expect(seen).toHaveLength(1);
    expect(record.refusal).toBeUndefined();
    env.detach();
  });
});
