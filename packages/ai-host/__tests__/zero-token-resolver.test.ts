// ADR-0313 — Zero-token chat command resolver: real utterances, hits AND refusals.
//
// §CONTEXT-DATA-HONESTY is load-bearing here: a refusal and a success must
// never look the same, and a recognized-but-underspecified intent must NOT
// fall through to `miss` (which would silently become an LLM call).

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';

let seq = 0;
const baseCtx = (overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `test-id-${++seq}`,
  ...overrides,
});

const wallSel = { selection: [{ elementId: 'wall-1', elementType: 'wall' }] };
const doorSel = { selection: [{ elementId: 'door-1', elementType: 'door' }] };
const windowSel = { selection: [{ elementId: 'win-1', elementType: 'window' }] };
const roomSel = { selection: [{ elementId: 'room-1', elementType: 'room' }] };

function expectCommands(r: ZeroTokenResolution): Extract<ZeroTokenResolution, { kind: 'commands' }> {
  expect(r.kind).toBe('commands');
  return r as Extract<ZeroTokenResolution, { kind: 'commands' }>;
}
function expectLocal(r: ZeroTokenResolution): Extract<ZeroTokenResolution, { kind: 'local' }> {
  expect(r.kind).toBe('local');
  return r as Extract<ZeroTokenResolution, { kind: 'local' }>;
}
function expectRefusal(r: ZeroTokenResolution): Extract<ZeroTokenResolution, { kind: 'refusal' }> {
  expect(r.kind).toBe('refusal');
  return r as Extract<ZeroTokenResolution, { kind: 'refusal' }>;
}

describe('tier 0 — hits', () => {
  it('undo / redo resolve to local actions (bus verbs have no handler)', () => {
    expect(expectLocal(resolveUtterance('undo', baseCtx())).action).toBe('undo');
    expect(expectLocal(resolveUtterance('Undo that', baseCtx())).action).toBe('undo');
    expect(expectLocal(resolveUtterance('redo', baseCtx())).action).toBe('redo');
  });

  it('zoom to fit dispatches the registered zoom-fit verb', () => {
    const r = expectCommands(resolveUtterance('zoom to fit', baseCtx()));
    expect(r.commands).toEqual([{ type: 'zoom-fit', payload: {} }]);
    expect(r.destructive).toBe(false);
  });

  it('frame selection dispatches zoom-selected when something is selected', () => {
    const r = expectCommands(resolveUtterance('zoom to selection', baseCtx(wallSel)));
    expect(r.commands[0]!.type).toBe('zoom-selected');
  });

  it('delete selected → element.delete for the selected wall, flagged destructive', () => {
    const r = expectCommands(resolveUtterance('delete selected', baseCtx(wallSel)));
    expect(r.destructive).toBe(true);
    expect(r.commands).toEqual([
      {
        type: 'element.delete',
        payload: { elementId: 'wall-1', elementType: 'wall', source: 'AI_CHAT_ZERO_TOKEN' },
      },
    ]);
  });

  it('"delete this wall" with a wall selected also resolves', () => {
    const r = expectCommands(resolveUtterance('delete this wall', baseCtx(wallSel)));
    expect(r.intent).toBe('delete-selected');
    expect(r.destructive).toBe(true);
  });

  it('"make this 3m tall" on a wall → wall.updateDimensions height 3', () => {
    const r = expectCommands(resolveUtterance('make this 3m tall', baseCtx(wallSel)));
    expect(r.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 3 } },
    ]);
  });

  it('"set height to 2700" applies the bare-number-is-mm rule → 2.7 m', () => {
    const r = expectCommands(resolveUtterance('set height to 2700', baseCtx(wallSel)));
    expect(r.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 2.7 });
  });

  it('height on a non-wall routes through element.updateParameters', () => {
    const r = expectCommands(resolveUtterance('set height to 2.1m', baseCtx(doorSel)));
    expect(r.commands).toEqual([
      {
        type: 'element.updateParameters',
        payload: { elementId: 'door-1', elementType: 'door', parameters: { height: 2.1 } },
      },
    ]);
  });

  it('"set thickness to 200mm" on a wall → wall.updateDimensions thickness 0.2', () => {
    const r = expectCommands(resolveUtterance('set thickness to 200mm', baseCtx(wallSel)));
    expect(r.commands[0]!.payload).toEqual({ wallId: 'wall-1', thickness: 0.2 });
  });

  // §FIX-CHAT-DEAD-ROUTES (ADR-0315): openings route through the LIVE generic
  // parameter command (→ wallStore + host rebuild) — door.setWidth /
  // window.setSillHeight write a detached plugin DTO store.
  it('"set door width to 900mm" with a door selected → element.updateParameters width 0.9', () => {
    const r = expectCommands(resolveUtterance('set door width to 900mm', baseCtx(doorSel)));
    expect(r.commands).toEqual([{
      type: 'element.updateParameters',
      payload: { elementId: 'door-1', elementType: 'door', parameters: { width: 0.9 } },
    }]);
  });

  it('"set sill height to 1m" with a window selected → element.updateParameters sillHeight 1', () => {
    const r = expectCommands(resolveUtterance('set sill height to 1m', baseCtx(windowSel)));
    expect(r.commands).toEqual([{
      type: 'element.updateParameters',
      payload: { elementId: 'win-1', elementType: 'window', parameters: { sillHeight: 1 } },
    }]);
  });

  it('"go to level 2" resolves the level by name → local setActiveLevel', () => {
    const r = expectLocal(resolveUtterance('go to level 2', baseCtx()));
    expect(r.action).toBe('setActiveLevel');
    expect(r.levelId).toBe('L2');
  });

  it('"add a level at 6m" → level.add with minted id and elevation 6', () => {
    const r = expectCommands(resolveUtterance('add a level at 6m', baseCtx()));
    expect(r.commands[0]!.type).toBe('level.add');
    const p = r.commands[0]!.payload as { levelId: string; name: string; elevation: number };
    expect(p.levelId).toMatch(/^test-id-/);
    expect(p.name).toBe('Level 3');
    expect(p.elevation).toBe(6);
  });

  it('"create a wall from (0,0) to (5,0) height 3m" → wall.create on the active level', () => {
    const r = expectCommands(
      resolveUtterance('create a wall from (0,0) to (5,0) height 3m', baseCtx()),
    );
    expect(r.commands).toEqual([
      {
        type: 'wall.create',
        payload: {
          start: { x: 0, z: 0 },
          end: { x: 5, z: 0 },
          levelId: 'L0',
          height: 3,
        },
      },
    ]);
  });

  it('"rename room to master bedroom" with a room selected → room.rename', () => {
    const r = expectCommands(resolveUtterance('rename room to master bedroom', baseCtx(roomSel)));
    expect(r.commands).toEqual([
      { type: 'room.rename', payload: { roomId: 'room-1', name: 'Master Bedroom' } },
    ]);
  });
});

describe('tier 1 — synonyms and typos (still 0 tokens)', () => {
  it('"remove the selectd wall" (synonym + typo) resolves to delete-selected at tier 1', () => {
    const r = expectCommands(resolveUtterance('remove the selectd wall', baseCtx(wallSel)));
    expect(r.intent).toBe('delete-selected');
    expect(r.tier).toBe(1);
    expect(r.destructive).toBe(true);
  });

  it('"switch to level 1" (switch→go) resolves the level', () => {
    const r = expectLocal(resolveUtterance('switch to level 1', baseCtx()));
    expect(r.levelId).toBe('L1');
  });

  it('"set hieght to 3m" (typo) resolves set-height', () => {
    const r = expectCommands(resolveUtterance('set hieght to 3m', baseCtx(wallSel)));
    expect(r.intent).toBe('set-height');
    expect(r.tier).toBe(1);
  });

  it('"go to floor 2" (floor→level) resolves', () => {
    const r = expectLocal(resolveUtterance('go to floor 2', baseCtx()));
    expect(r.levelId).toBe('L2');
  });
});

describe('refusals — recognized but not safely completable (never silent, never a guess)', () => {
  it('delete with nothing selected refuses with a concrete reason', () => {
    const r = expectRefusal(resolveUtterance('delete selected', baseCtx()));
    expect(r.reason).toContain('Nothing is selected');
  });

  it('delete noun/selection mismatch refuses instead of deleting the wrong thing', () => {
    const r = expectRefusal(resolveUtterance('delete this door', baseCtx(wallSel)));
    expect(r.reason).toContain('selected element is a wall');
    expect(r.reason).toContain('Nothing was deleted');
  });

  it('"go to level 9" refuses and lists the levels that DO exist', () => {
    const r = expectRefusal(resolveUtterance('go to level 9', baseCtx()));
    expect(r.reason).toContain('Level 0');
    expect(r.reason).toContain('Level 2');
  });

  it('"create a wall here" refuses and shows the coordinate syntax', () => {
    const r = expectRefusal(resolveUtterance('create a wall here', baseCtx()));
    expect(r.suggestions.some((s) => s.includes('(0,0) to (5,0)'))).toBe(true);
  });

  it('sill height on a non-window refuses', () => {
    const r = expectRefusal(resolveUtterance('set sill height to 1m', baseCtx(wallSel)));
    expect(r.reason).toContain('windows');
  });

  it('height with nothing selected refuses', () => {
    const r = expectRefusal(resolveUtterance('make this 3m tall', baseCtx()));
    expect(r.reason).toContain('Nothing is selected');
  });

  it('rename room with a wall selected refuses', () => {
    const r = expectRefusal(resolveUtterance('rename room to Kitchen', baseCtx(wallSel)));
    expect(r.reason).toContain('selected element is a wall');
  });
});

describe('misses — not command-shaped, falls through to the LLM tier', () => {
  it.each([
    'make it cozier',
    'what walls are on this level?',
    'hello',
  ])('"%s" is a miss', (utterance) => {
    expect(resolveUtterance(utterance, baseCtx(wallSel)).kind).toBe('miss');
  });

  // "generate an apartment layout" LEFT this list at §GEN-CHAT-APARTMENT (RAC
  // U5b.2): the apartment-layout engine is now chat-reachable, so treating the
  // sentence as unrecognised would be the very "capability exists, chat has
  // never heard of it" defect the coverage gate was built for. Pinned here
  // positively so the move is a decision, not a silent deletion.
  it('"generate an apartment layout" is now a COMMAND (§GEN-CHAT-APARTMENT)', () => {
    const r = resolveUtterance('generate an apartment layout', baseCtx(wallSel));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]?.type).toBe('generation.apartment');
    // Consequential enough to confirm first — a whole plan is generated.
    expect(r.destructive).toBe(true);
  });

  it('"show walls" is NOT misread as a level switch', () => {
    expect(resolveUtterance('show walls', baseCtx()).kind).toBe('miss');
  });
});
