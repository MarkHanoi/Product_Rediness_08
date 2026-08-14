// @vitest-environment happy-dom
//
// §C83-S1-MOVE-OFFER (ISSUE-LOG L-904) — THE CHAT OFFER TEST.
//
// The refusal half (1e80e3a2) is pinned by WallPlacementGateSurfacing.test.ts.
// This file pins the founder's twice-repeated ask BEYOND the refusal: on a wall
// moved into a door clash the chat OPENS and offers the two nearest CLEAR
// stations — *"move the wall to the left or right, but NOT where it is planned
// to be moved"* — each candidate pre-validated before it may be offered, an
// accepted candidate executing as ONE undoable wall.updateBaseline, and NOTHING
// ever auto-applied (C83 §4.2/§4.3).
//
// The four arms the ISSUE-LOG names, each executed here:
//   · clash → the chat opens with 2 candidates (and the finding names the door,
//     the host wall and BOTH intervals);
//   · no clash → complete silence;
//   · no clear interval → the reason, ZERO candidates, no Confirm ever posed;
//   · accept → ONE command dispched → its undo restores the position verbatim.
//
// Every flow test drives the REAL seam — `gateWallMove`, the one chokepoint both
// the 3D gizmo (registerTransformDragHandler:192) and the plan drag
// (MovePlanToolHandler:485) funnel through — not the proposal function alone, so
// a broken wiring cannot pass on a working module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeRegistry } from '@pryzm/core-app-model';
import type { WallData } from '@pryzm/geometry-wall';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';
import { gateWallMove } from '@app/engine/consequence/wallPlacementGate';
import {
  registerChatPromptHost,
  __resetChatPromptHost,
} from '@app/ui/ai/chatPromptHost';
import { __resetWallMoveClashState } from '@app/ui/ai/WallMoveClashProposal';

// ── The founder's fixture (same as the surfacing suite) ───────────────────────
const HOST_ID = 'wall_01M0027RDCJAMTZRY3CFWZC2T8';
const DOOR_ELEMENT_ID = 'door_01M0027RDCJAMTZRY3CFWZC2TX';
const MOVER_ID = 'wall_01M0027RDCJAMTZRY3CFWZC2M1';
const LEVEL = 'level-0';

function hostWallWithDoor(): WallData {
  return {
    id: HOST_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 21, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.3,
    childrenIds: [DOOR_ELEMENT_ID],
    openings: [
      {
        id: '254e1386-f641-4bf9-9623-be3054d47b35',
        type: 'door',
        offset: 3.005,
        width: 0.926,
        height: 2.1,
        sillHeight: 0,
        elementId: DOOR_ELEMENT_ID,
      },
    ],
  } as unknown as WallData;
}

/** The mover, parked CLEAR of the door at x = 10 — the pre-drag truth. */
function interiorWallAtClearStation(): WallData {
  return {
    id: MOVER_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [
      { x: 10, y: 0, z: -2 },
      { x: 10, y: 0, z: 4 },
    ],
    height: 3,
    thickness: 0.2,
    childrenIds: [],
    openings: [],
  } as unknown as WallData;
}

function draggedTo(x: number) {
  return [
    { x, y: 0, z: -2 },
    { x, y: 0, z: 4 },
  ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}

function registerWalls(walls: readonly WallData[]): void {
  storeRegistry.register('wall', {
    getAll: () => walls as WallData[],
    getById: (id: string) => walls.find((w) => w.id === id),
  } as never);
}

// ── A chat host double — the transcript, as data ──────────────────────────────
// `registerChatPromptHost` is the REAL registration path AIPanel uses, so the
// proposal reaches this double through the production accessor, not a mock of it.
function installHostDouble(answers: readonly boolean[]) {
  const said: string[] = [];
  const asked: string[] = [];
  let i = 0;
  const unregister = registerChatPromptHost({
    say: (t) => { said.push(t); },
    confirm: (s) => {
      asked.push(s);
      const a = answers[Math.min(i, answers.length - 1)] ?? false;
      i += 1;
      return Promise.resolve(a);
    },
    isReady: () => true,
  });
  return { said, asked, unregister };
}

type BusCall = { type: string; payload: Record<string, unknown> };

function installBusDouble(result: { success?: boolean } = { success: true }) {
  const calls: BusCall[] = [];
  (window as never as { runtime?: unknown }).runtime = {
    bus: {
      executeCommand: (type: string, payload: Record<string, unknown>) => {
        calls.push({ type, payload });
        return Promise.resolve(result);
      },
    },
  };
  return calls;
}

beforeEach(() => {
  __resetChatPromptHost();
  __resetWallMoveClashState();
  registerWalls([hostWallWithDoor(), interiorWallAtClearStation()]);
  for (const n of Array.from(document.querySelectorAll('[data-pryzm-fallback-prompt]'))) n.remove();
});

afterEach(() => {
  delete (window as never as { runtime?: unknown }).runtime;
});

describe('§C83-S1-MOVE-OFFER (L-904) — clash → the chat opens with two clear candidates', () => {
  it('names the door, the host wall and BOTH intervals, then offers BOTH directions', async () => {
    const chat = installHostDouble([false, false]); // decline both — nothing may execute
    const calls = installBusDouble();

    const result = gateWallMove(MOVER_ID, draggedTo(3.5));
    expect(result.blocked).toBe(true);
    // The gate computed two defensible candidates for this fixture.
    expect(result.verdict?.offers).toHaveLength(2);

    // The flow is asynchronous by design (it asks a human). Wait for its close.
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('Left as it is'))).toBe(true);
    });

    // The FINDING, in the transcript: door element, host wall, both intervals.
    const finding = chat.said[0];
    expect(finding).toContain(MOVER_ID);
    expect(finding).toContain(DOOR_ELEMENT_ID);
    expect(finding).toContain(HOST_ID);
    expect(finding).toContain('3.005'); // door start
    expect(finding).toContain('3.931'); // door end
    expect(finding).toContain('3.400'); // crossing start
    expect(finding).toContain('3.600'); // crossing end

    // TWO candidates were posed, one per clear direction, and both were declined.
    expect(chat.asked).toHaveLength(2);
    expect(chat.asked[0]).toContain('back along the host wall');
    expect(chat.asked[1]).toContain('further along the host wall');

    // NEVER auto-apply: both declined ⇒ zero dispatches.
    expect(calls).toHaveLength(0);
    chat.unregister();
  });

  it('asks ONCE per distinct refused position — an identical re-drag does not stack a second ask', async () => {
    const chat = installHostDouble([false, false]);
    installBusDouble();

    gateWallMove(MOVER_ID, draggedTo(3.5));
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('Left as it is'))).toBe(true);
    });
    const askedAfterFirst = chat.asked.length;

    gateWallMove(MOVER_ID, draggedTo(3.5)); // the same clash again
    await new Promise((r) => setTimeout(r, 50));
    expect(chat.asked.length).toBe(askedAfterFirst); // no second round
    chat.unregister();
  });
});

describe('§C83-S1-MOVE-OFFER — SILENCE controls', () => {
  it('a legal move says NOTHING in the chat', async () => {
    const chat = installHostDouble([true]);
    const calls = installBusDouble();

    const result = gateWallMove(MOVER_ID, draggedTo(14));
    expect(result.blocked).toBe(false);

    await new Promise((r) => setTimeout(r, 50));
    expect(chat.said).toHaveLength(0);
    expect(chat.asked).toHaveLength(0);
    expect(calls).toHaveLength(0);
    chat.unregister();
  });

  it('no clear interval → the REASON reaches the chat with ZERO candidates and no Confirm', async () => {
    // A 1 m host almost fully occupied by its door: the clear scraps at each end
    // (0.05 m) cannot hold the mover's 0.2 m crossing, so nothing is defensible.
    const tightHost = {
      id: 'wall_TIGHT_HOST',
      type: 'wall',
      levelId: LEVEL,
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      height: 3,
      thickness: 0.3,
      childrenIds: ['door_TIGHT'],
      openings: [
        {
          id: 'opening_TIGHT',
          type: 'door',
          offset: 0.05,
          width: 0.9,
          height: 2.1,
          sillHeight: 0,
          elementId: 'door_TIGHT',
        },
      ],
    } as unknown as WallData;
    const mover = {
      id: 'wall_TIGHT_MOVER',
      type: 'wall',
      levelId: LEVEL,
      baseLine: [
        { x: 10, y: 0, z: -1 },
        { x: 10, y: 0, z: 1 },
      ],
      height: 3,
      thickness: 0.2,
      childrenIds: [],
      openings: [],
    } as unknown as WallData;
    registerWalls([tightHost, mover]);

    const chat = installHostDouble([true]); // would accept — but nothing may be posed
    const calls = installBusDouble();

    const result = gateWallMove('wall_TIGHT_MOVER', [
      { x: 0.5, y: 0, z: -1 },
      { x: 0.5, y: 0, z: 1 },
    ]);
    expect(result.blocked).toBe(true);
    expect(result.verdict?.offers).toHaveLength(0); // nothing defensible

    await vi.waitFor(() => {
      expect(chat.said.length).toBeGreaterThan(0);
    });
    // The reason reaches the transcript — naming the door — and NOTHING is offered.
    expect(chat.said[0]).toContain('door_TIGHT');
    expect(chat.said[0]).toContain('not proposing');
    expect(chat.asked).toHaveLength(0); // zero candidates ⇒ zero Confirm cards
    expect(calls).toHaveLength(0);
    chat.unregister();
  });
});

describe('§C83-S1-MOVE-OFFER — accept → ONE undoable command', () => {
  it('an accepted candidate dispatches exactly ONE wall.updateBaseline, at a position the predicate calls CLEAR', async () => {
    const chat = installHostDouble([true]); // accept the first (nearest) candidate
    const calls = installBusDouble({ success: true });

    const result = gateWallMove(MOVER_ID, draggedTo(3.5));
    expect(result.blocked).toBe(true);
    const offered = result.verdict!.offers[0];

    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThan(0);
    });

    // ONE command. The ordinary verb. The gesture's own payload shape.
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('wall.updateBaseline');
    const payload = calls[0].payload as {
      wallId: string;
      newBaseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
      prevBaseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
      _recordUndo: boolean;
    };
    expect(payload.wallId).toBe(MOVER_ID);
    expect(payload._recordUndo).toBe(true); // ONE ring-buffer undo entry (L-49)

    // The dispatched position IS the offered one — not the refused one.
    expect(payload.newBaseLine[0].x).toBeCloseTo(offered.baseLine[0].x, 9);
    expect(payload.newBaseLine[0].z).toBeCloseTo(offered.baseLine[0].z, 9);
    expect(payload.newBaseLine[1].x).toBeCloseTo(offered.baseLine[1].x, 9);
    // …and prevBaseLine is the store's PRE-drag truth, so undo has its target.
    expect(payload.prevBaseLine[0].x).toBeCloseTo(10, 9);
    expect(payload.prevBaseLine[1].x).toBeCloseTo(10, 9);

    // The candidate keeps its promise: re-gating the DISPATCHED position is silent.
    const recheck = gateWallMove(MOVER_ID, payload.newBaseLine);
    expect(recheck.blocked).toBe(false);

    // The transcript closes honestly, stating the one-step undo.
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('Ctrl+Z undoes it in one step'))).toBe(true);
    });
    chat.unregister();
  });

  it('EXECUTED undo proof — the accepted command moves the wall, ONE undo restores it verbatim', () => {
    // The exact command the accepted offer dispatches, run against a live fake
    // store: execute lands the wall at the offered position, undo() restores the
    // pre-move baseline exactly. One command, one undo, position verbatim.
    const record: Record<string, WallData> = {
      [MOVER_ID]: interiorWallAtClearStation(),
      [HOST_ID]: hostWallWithDoor(),
    };
    const fakeWallStore = {
      getById: (id: string) => record[id],
      getAll: () => Object.values(record),
      update: (id: string, patch: Record<string, unknown>) => {
        record[id] = { ...record[id], ...patch } as WallData;
      },
      restoreSnapshot: (snap: WallData & { id: string }) => {
        record[snap.id] = { ...snap };
      },
      updateOpening: () => { /* no openings on the mover */ },
    };
    const ctx = { stores: { wallStore: fakeWallStore } } as never;

    const offeredX = 2.2; // a clear station (door sits at 3.005–3.931)
    const cmd = new UpdateWallBaselineCommand({
      wallId: MOVER_ID,
      newBaseLine: [
        { x: offeredX, y: 0, z: -2 },
        { x: offeredX, y: 0, z: 4 },
      ],
    });

    expect(cmd.canExecute(ctx).ok).toBe(true);
    expect(cmd.execute(ctx).success).toBe(true);
    expect(record[MOVER_ID].baseLine[0].x).toBeCloseTo(offeredX, 9);
    expect(record[MOVER_ID].baseLine[1].x).toBeCloseTo(offeredX, 9);

    expect(cmd.undo(ctx).success).toBe(true);
    expect(record[MOVER_ID].baseLine[0].x).toBeCloseTo(10, 9); // verbatim pre-move
    expect(record[MOVER_ID].baseLine[1].x).toBeCloseTo(10, 9);
  });

  it('a stale acceptance (command refused on re-check) is reported honestly, not claimed as done', async () => {
    const chat = installHostDouble([true]);
    installBusDouble({ success: false }); // the model changed under the offer

    gateWallMove(MOVER_ID, draggedTo(3.5));
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('refused on re-check'))).toBe(true);
    });
    expect(chat.said.some((t) => t.includes('Ctrl+Z undoes it'))).toBe(false);
    chat.unregister();
  });
});

describe('§C83-S1-MOVE-OFFER — §PROMPT-REACHES-A-HUMAN (DOM reach with NO chat host)', () => {
  it('with no host registered the question still reaches the DOM as the visible fallback card, and Confirm there dispatches', async () => {
    // The founder's a75e8e1e failure state: no chat host at all. The guarantee
    // layer must render a VISIBLE card rather than degrade to a console line.
    const calls = installBusDouble({ success: true });

    gateWallMove(MOVER_ID, draggedTo(3.5));

    // chatConfirm waits its 4 s surface deadline before falling back — real time.
    const card = await vi.waitFor(
      () => {
        const el = document.querySelector('[data-pryzm-fallback-prompt]');
        expect(el).not.toBeNull();
        return el as HTMLElement;
      },
      { timeout: 8000, interval: 100 },
    );
    expect(card.textContent).toContain('Move wall');
    expect(card.textContent).toContain(MOVER_ID);

    // Accepting on the fallback surface executes the same ONE command.
    const confirmBtn = Array.from(card.querySelectorAll('button')).find(
      (b) => b.textContent === 'Confirm',
    ) as HTMLElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();

    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0].type).toBe('wall.updateBaseline');
  }, 15000);
});
