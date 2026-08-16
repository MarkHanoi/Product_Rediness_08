// @vitest-environment happy-dom
//
// §MEASURED-HALF-EXECUTED (ISSUE-LOG L-921) — THE MEASUREMENT, BEFORE ANY FIX.
//
// FOUNDER-REPORTED, deploy `023d903a`, from their own console:
//
//   [WallMoveClashProposal] §C83-S1-MOVE-OFFER accepted: wall.updateBaseline
//   [CommandManager] EXECUTE: UPDATE_WALL_BASELINE
//   [WallMoveReweldService] move-reweld cascade refused for moved wall
//       wall_01M02TS7MA2K81NHTPCQ3X6QHQ: OPENING_DOES_NOT_FIT
//   [RoomDetectionEngine] §DIAG-ROOM-LOOP BREAK … endpoint 305mm from centreline
//       EXCEEDS hostSnap 200mm → loop will NOT close   (×3)
//
// The offer was ACCEPTED. The baseline move EXECUTED. The cascade that repairs
// the junctions REFUSED. **And the user was never told.** One gesture, half
// applied, the system measuring its own damage and staying quiet — the exact
// outcome C78/C70 forbid ("one gesture is one atomic unit"; a dependent cascade
// that refuses must either abort the gesture or REPORT what it left unrepaired).
//
// The irony worth recording: the FIRST refusal on this path
// (`OCC_CROSSES_HOSTED_OPENING`) is exemplary — it names the rule, both
// intervals, the overlap and two alternatives, and it reaches the chat. The
// SECOND refusal (`OPENING_DOES_NOT_FIT`, from the cascade) reaches a
// `console.warn` and stops there — and it even DROPS `validation.blockingIssues`,
// which is where the numbers live.
//
// ## WHAT THIS FILE IS
//
// A pinned MEASUREMENT of the defect, committed on its own before any fix, so
// the fix is judged against a number rather than a story (same discipline as
// L-912 / L-916 today). It drives the REAL accept path end to end:
//
//     gateWallMove (the one chokepoint the 3D gizmo and the plan drag share)
//       → presentWallMoveClash offers two pre-validated stations in the chat
//       → the user CONFIRMS one
//       → the REAL UpdateWallBaselineCommand executes against a LIVE store
//       → the store emits 'update' with prevState
//       → the REAL WallMoveReweldService computes the junction re-welds
//       → the REAL CascadeWallBaselineCommand.canExecute REFUSES
//
// Nothing on that chain is mocked except the chat surface (a real
// `registerChatPromptHost` double, the production accessor) and the bus, which
// executes the genuine command class rather than recording a call.
//
// ## THE FIXTURE, AND WHY EVERY NUMBER IN IT IS WHERE IT IS
//
//   HOST      (0,0)→(21,0), thickness 0.30, a 0.926 m door at offset 3.005.
//             The wall whose door the move clashes with.
//   MOVER     vertical at x = 5, z = -2 → 4, thickness 0.20. Parked CLEAR.
//   PARTNER   (5,4)→(2.55,4) — an L corner welded to the MOVER's z=4 endpoint,
//             carrying a 0.5 m door at offset 0.2 (world x 4.80 → 4.30).
//
// Dragging the MOVER to x = 3.5 puts its 3.400–3.600 body across the host's
// 3.005–3.931 door ⇒ refused, and the gate offers the nearest clear stations on
// either side. Accepting the FIRST ("0.60 m back along the host wall",
// x = 2.905) carries the L corner from x = 5 to x = 2.905, which would trim the
// PARTNER from 2.450 m to 0.355 m — and its 0.5 m door no longer fits on its own
// host AT ALL. That is `OPENING_DOES_NOT_FIT`, reached the same way the founder
// reached it: through a wall the user never touched.
//
// ⚠ THE WIDTH IS THE POINT, and the first fixture got it wrong in an instructive
// way. `planOpeningRebase` refuses only when the opening cannot fit ANYWHERE on
// the new baseline. A door that still FITS is silently SLID instead: the first
// run of this file trimmed the partner to 0.905 m and the cascade succeeded
// while re-seating its door `offset 0.200 → 0.000` — a neighbour's door moved
// 0.2 m by a gesture aimed at a different wall, with no refusal and no report.
// That is recorded here as a SECOND finding (§JOINT-AUTHORITY-IS-THE-INCUMBENT:
// a junction that was already correct must be adapted to, never rewritten), and
// it is why the door is now 0.5 m against a 0.355 m remainder — wide enough that
// the store must REFUSE rather than slide, which is the founder's arm.
//
// The door's world span was chosen to sit in the one sub-interval of the
// mover's travel corridor that NO position on this path occupies — parked body
// 4.900–5.100, drag body 3.400–3.600, offer bodies 2.805–3.005 and
// 3.931–4.131 — so the partner's door can never make the offer itself
// undefensible and confound the measurement.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeRegistry, semanticGraphManager } from '@pryzm/core-app-model';
import type { WallData } from '@pryzm/geometry-wall';
import { WallMoveReweldService } from '@pryzm/geometry-wall';
import {
  UpdateWallBaselineCommand,
  CascadeWallBaselineCommand,
} from '@pryzm/command-registry';
import { gateWallMove } from '@app/engine/consequence/wallPlacementGate';
import {
  registerChatPromptHost,
  __resetChatPromptHost,
} from '@app/ui/ai/chatPromptHost';
import { __resetWallMoveClashState } from '@app/ui/ai/WallMoveClashProposal';

const HOST_ID = 'wall_HALFEXEC_HOST';
const DOOR_ELEMENT_ID = 'door_HALFEXEC_HOST_DOOR';
const MOVER_ID = 'wall_HALFEXEC_MOVER';
const PARTNER_ID = 'wall_HALFEXEC_PARTNER';
const PARTNER_DOOR_ID = 'door_HALFEXEC_PARTNER_DOOR';
const LEVEL = 'level-0';

/** Where the mover is parked — clear of the host's door. */
const PARKED_X = 5;
/** The refused drag: body 3.400–3.600 across the host door's 3.005–3.931. */
const DRAG_X = 3.5;

function hostWallWithDoor(): WallData {
  return {
    id: HOST_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 21, y: 0, z: 0 }],
    height: 3,
    thickness: 0.3,
    childrenIds: [DOOR_ELEMENT_ID],
    openings: [{
      id: 'opening_HALFEXEC_HOST',
      type: 'door',
      offset: 3.005,
      width: 0.926,
      height: 2.1,
      sillHeight: 0,
      elementId: DOOR_ELEMENT_ID,
    }],
  } as unknown as WallData;
}

function moverParked(): WallData {
  return {
    id: MOVER_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [{ x: PARKED_X, y: 0, z: -2 }, { x: PARKED_X, y: 0, z: 4 }],
    height: 3,
    thickness: 0.2,
    childrenIds: [],
    openings: [],
  } as unknown as WallData;
}

/**
 * The L partner, welded to the mover's z = 4 endpoint, carrying its own door.
 *
 * `farX` decides WHICH terminal state this fixture exercises, and it is the
 * only thing that differs between the two cases below:
 *
 *   farX = 2.55 → the new corner (x = 2.905) lands ON this wall's body, so the
 *                 SUBJECT can terminate against it and the incumbent never
 *                 moves. The gesture proceeds. (C83 §10.1 satisfied.)
 *   farX = 4.00 → the new corner lands 1.095 m PAST this wall's end, so closing
 *                 the joint would mean LENGTHENING an incumbent. Forbidden by
 *                 C83 §10.2.2 ⇒ the WHOLE gesture refuses.
 */
function partnerWall(farX = 2.55): WallData {
  return {
    id: PARTNER_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [{ x: 5, y: 0, z: 4 }, { x: farX, y: 0, z: 4 }],
    height: 3,
    thickness: 0.2,
    childrenIds: [PARTNER_DOOR_ID],
    openings: [{
      id: 'opening_HALFEXEC_PARTNER',
      type: 'door',
      offset: 0.2,
      width: 0.5,
      height: 2.1,
      sillHeight: 0,
      elementId: PARTNER_DOOR_ID,
    }],
  } as unknown as WallData;
}

function draggedTo(x: number) {
  return [{ x, y: 0, z: -2 }, { x, y: 0, z: 4 }] as
    [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}

// ── A LIVE wall store: it mutates, and it emits 'update' with prevState ───────
// `prevState` is the whole point — WallMoveReweldService reads the pre-move
// topology from it (§STEP7 / C72 §3.1). A store double that omits it cannot
// reproduce the defect at all.
type Sub = (event: 'add' | 'update' | 'remove', wall: WallData, prev?: WallData) => void;

function makeLiveWallStore(seed: readonly WallData[]) {
  const record: Record<string, WallData> = {};
  for (const w of seed) record[w.id] = w;
  const subs: Sub[] = [];
  const store = {
    getById: (id: string) => record[id],
    getAll: () => Object.values(record),
    getByLevel: (levelId: string) =>
      Object.values(record).filter((w) => w.levelId === levelId),
    update: (id: string, patch: Record<string, unknown>) => {
      const prev = record[id];
      if (!prev) return;
      const next = { ...prev, ...patch } as WallData;
      record[id] = next;
      for (const s of [...subs]) s('update', next, prev);
    },
    updateOpening: (wallId: string, opening: { id: string }) => {
      const w = record[wallId];
      if (!w) return;
      const openings = ((w as unknown as { openings?: { id: string }[] }).openings ?? [])
        .map((o) => (o.id === opening.id ? { ...o, ...opening } : o));
      record[wallId] = { ...w, openings } as unknown as WallData;
    },
    restoreSnapshot: (snap: WallData & { id: string }) => {
      const prev = record[snap.id];
      record[snap.id] = { ...prev, ...snap };
      for (const s of [...subs]) s('update', record[snap.id], prev);
    },
    subscribe: (cb: Sub) => {
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },
  };
  return store;
}

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

/**
 * The whole live rig: store + gate registration + the REAL reweld service on a
 * REAL cascade command + a bus that executes the REAL UpdateWallBaselineCommand.
 * Returns the console.warn transcript so the cascade's refusal is observable
 * exactly where it lands today — and nowhere else.
 */
function installLiveRig(partnerFarX = 2.55) {
  const store = makeLiveWallStore([hostWallWithDoor(), moverParked(), partnerWall(partnerFarX)]);
  storeRegistry.register('wall', store as never);

  // The `joinedTo` graph, seeded the way a WallRebuildCoordinator flush seeds it
  // (ADR-0321 §CONNECT-3). WITHOUT THIS the graph answers `{ok:true,
  // joinedWallIds:[]}` — a POSITIVE "joins nothing" — and the pre-flight
  // correctly concludes the move breaks no junction. That is right behaviour on
  // a wrong fixture, and it silently made the refusal arm untestable: the first
  // run of this suite passed the incumbent case and failed the refusal one for
  // exactly this reason. The L corner is declared here so the pre-flight is
  // asked the question the founder's model would ask it.
  semanticGraphManager.replaceJoinedToForLevelWalls(
    [HOST_ID, MOVER_ID, PARTNER_ID],
    [{ junctionType: 'L', junctionDegree: 2, wallIds: [MOVER_ID, PARTNER_ID] }],
  );

  const ctx = { stores: { wallStore: store } } as never;
  const cascadeAttempts: { entries: unknown[]; ok: boolean; reason?: string; blocking?: string[] }[] = [];

  const commandManagerRef = {
    current: {
      getContext: () => ctx,
      execute: (cmd: { execute?: (c: unknown) => unknown }) => cmd.execute?.(ctx),
      isReverting: () => false,
    },
  };

  const service = new WallMoveReweldService(store as never, {
    commandManagerRef: commandManagerRef as never,
    makeCascadeCommand: ({ entries, cause }) => {
      const cmd = new CascadeWallBaselineCommand({ entries: entries as never, cause });
      // Observe the verdict the service is about to act on — including the
      // `blockingIssues` the service itself discards.
      const wrapped = {
        canExecute: (c: unknown) => {
          const v = cmd.canExecute(c as never);
          cascadeAttempts.push({
            entries: entries as unknown[],
            ok: v.ok,
            reason: v.reason,
            blocking: (v as { blockingIssues?: string[] }).blockingIssues,
          });
          return v;
        },
        execute: (c: unknown) => cmd.execute(c as never),
      };
      return wrapped as never;
    },
    getJoinedWalls: (wallId: string) =>
      wallId === MOVER_ID
        ? { ok: true as const, wallId, joinedWallIds: [PARTNER_ID] }
        : { ok: true as const, wallId, joinedWallIds: [] },
  });

  const warned: string[] = [];
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    warned.push(a.map((x) => String(x)).join(' '));
  });

  const busCalls: { type: string; payload: Record<string, unknown> }[] = [];
  (window as never as { runtime?: unknown }).runtime = {
    bus: {
      executeCommand: (type: string, payload: Record<string, unknown>) => {
        busCalls.push({ type, payload });
        if (type !== 'wall.updateBaseline') return Promise.resolve({ success: false });
        const cmd = new UpdateWallBaselineCommand({
          wallId: payload.wallId as string,
          newBaseLine: payload.newBaseLine as never,
        });
        const v = cmd.canExecute(ctx);
        if (!v.ok) return Promise.resolve({ success: false, error: v.reason });
        return Promise.resolve(cmd.execute(ctx));
      },
    },
  };

  return { store, service, cascadeAttempts, warned, warnSpy, busCalls };
}

beforeEach(() => {
  __resetChatPromptHost();
  __resetWallMoveClashState();
  for (const n of Array.from(document.querySelectorAll('[data-pryzm-fallback-prompt]'))) n.remove();
});

afterEach(() => {
  delete (window as never as { runtime?: unknown }).runtime;
  vi.restoreAllMocks();
});

describe('§MEASURED-HALF-EXECUTED (L-921) — the accepted offer is now ONE ATOMIC GESTURE', () => {
  // ── THE PRE-FIX MEASUREMENT, for the record ─────────────────────────────────
  //
  // Committed on its own at `b20eb437`, before any fix, this file asserted the
  // DEFECT: the move EXECUTED, the cascade REFUSED `OPENING_DOES_NOT_FIT`, the
  // transcript closed with an unqualified "Done — wall … moved", and the L
  // junction was left **open by 2096 mm**. Those numbers are the baseline this
  // suite now measures the fix against; they live in git, not in a comment
  // pretending to be evidence.
  //
  // Two contract changes closed it, and this suite pins BOTH terminal states:
  //   · C83 §10.2.2 — a re-weld may not close a joint by moving a NON-SUBJECT
  //     wall's baseline. So the incumbent is never dragged (L-922).
  //   · C78 U-INV-8 / C83 §10.3 — one gesture is one atomic unit. A dependent
  //     cascade that refuses aborts the gesture; it may not half-apply.

  it('§C83-10.1: the incumbent is NOT moved, the subject adapts, and ONE gesture completes cleanly', async () => {
    // farX = 2.55 ⇒ the new corner (x = 2.905) lands ON the partner's body.
    const rig = installLiveRig(2.55);
    const chat = installHostDouble([true]); // accept the FIRST offer

    // §C83 §10.4 — capture the incumbent BEFORE the gesture.
    const partnerBefore = JSON.stringify(rig.store.getById(PARTNER_ID)!.baseLine);

    const gate = gateWallMove(MOVER_ID, draggedTo(DRAG_X));
    expect(gate.blocked).toBe(true);
    expect(gate.verdict!.offers.length).toBeGreaterThan(0);
    const accepted = gate.verdict!.offers[0];

    await vi.waitFor(() => { expect(rig.busCalls.length).toBeGreaterThan(0); });
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('Done — wall'))).toBe(true);
    });

    // The subject moved to the offered station.
    const moverAfter = rig.store.getById(MOVER_ID)!;
    expect(moverAfter.baseLine[0].x).toBeCloseTo(accepted.baseLine[0].x, 9);
    expect(moverAfter.baseLine[0].x).not.toBeCloseTo(PARKED_X, 6);

    // §C83 §10.4 — THE INCUMBENT-UNCHANGED ASSERTION. Byte-identical.
    expect(JSON.stringify(rig.store.getById(PARTNER_ID)!.baseLine)).toBe(partnerBefore);

    // NO GAP. The subject's endpoint terminates on the incumbent's body, so the
    // corner the pre-fix run left open by 2096 mm is closed — and closed
    // WITHOUT touching the wall that was already correctly joined.
    const partnerAfter = rig.store.getById(PARTNER_ID)!;
    const onBody =
      moverAfter.baseLine[1].z === partnerAfter.baseLine[0].z &&
      moverAfter.baseLine[1].x <= partnerAfter.baseLine[0].x &&
      moverAfter.baseLine[1].x >= partnerAfter.baseLine[1].x;
    expect(onBody).toBe(true);

    // No cascade was ever proposed against the incumbent.
    expect(rig.cascadeAttempts.every((a) => a.ok)).toBe(true);
    chat.unregister();
  }, 20000);

  it('§C83-10.2.2 + C78 U-INV-8: when the joint needs the incumbent LENGTHENED, the WHOLE gesture refuses and NOTHING moves', async () => {
    // farX = 4.0 ⇒ the new corner (x = 2.905) falls 1.095 m PAST the partner's
    // end, so closing the joint would mean lengthening a wall the user never
    // touched. Forbidden — and therefore the move must not happen either.
    const rig = installLiveRig(4.0);
    // ⚠ `[true, false]`, and the second value is load-bearing. MEASURED: with
    // `[true]` the double answers `true` to EVERY question, so after the first
    // offer is refused by the pre-flight the loop `continue`s — by design, "the
    // other direction may weld perfectly well" — and the SECOND offer (x =
    // 4.032) welds cleanly and moves the wall. The suite then failed its own
    // "NOTHING MOVED" line while the code was behaving correctly. The user here
    // accepts the offer under test and declines the other, so the assertion is
    // about the C83 §10.2.2 arm and not about how many offers were on the table.
    const chat = installHostDouble([true, false]);

    const partnerBefore = JSON.stringify(rig.store.getById(PARTNER_ID)!.baseLine);
    const moverBefore = JSON.stringify(rig.store.getById(MOVER_ID)!.baseLine);

    const gate = gateWallMove(MOVER_ID, draggedTo(DRAG_X));
    expect(gate.blocked).toBe(true);

    // …and the chat comes back having done NOTHING.
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('§10.2.2'))).toBe(true);
    });

    // ── NOTHING MOVED. Not the subject, not the incumbent. ───────────────────
    expect(JSON.stringify(rig.store.getById(MOVER_ID)!.baseLine)).toBe(moverBefore);
    expect(JSON.stringify(rig.store.getById(PARTNER_ID)!.baseLine)).toBe(partnerBefore);
    // The bus was never asked to move anything.
    expect(rig.busCalls).toHaveLength(0);

    // ── AND THE USER WAS TOLD, WITH THE NUMBERS AND THE RULE ─────────────────
    // Silence is the one forbidden outcome (C83 §10.3). The transcript names
    // the rule, the incumbent, and how far it would have been shifted.
    const transcript = chat.said.join('\n');
    expect(transcript).toContain('C83 §10.2.2');
    expect(transcript).toContain('JOINT-AUTHORITY-IS-THE-INCUMBENT');
    expect(transcript).toContain(PARTNER_ID);
    expect(transcript).toContain('mm');
    expect(transcript).toContain('Nothing has changed');
    // It never claims success.
    expect(transcript).not.toContain('Done — wall');
    chat.unregister();
  }, 20000);

  it('§L-921-ONE-CHANNEL: a MOVE refusal reaches the chat and NO card or toast', async () => {
    // THE FOUNDER'S ASK 1 — *"I WANT THE MESSAGE ONLY ON THE AI CHAT — THE OTHER
    // PANEL INFORMATION SHOULD BE IN THE AI CHAT."* A blocked move used to light
    // up three surfaces: the ConfirmationCard, a toast, and then the chat.
    const rig = installLiveRig(2.55);
    const chat = installHostDouble([false, false]); // decline both offers

    const gate = gateWallMove(MOVER_ID, draggedTo(DRAG_X));
    expect(gate.blocked).toBe(true);
    await vi.waitFor(() => {
      expect(chat.said.some((t) => t.includes('Left as it is'))).toBe(true);
    });

    // The CARD's own sentence is now IN THE CHAT — through the shared renderer,
    // so the refusal's IDENTITY survives the consolidation and no number is
    // re-typed on the way (§REFUSAL-IDENTITY).
    const finding = chat.said[0];
    expect(finding).toContain('[OCC_CROSSES_HOSTED_OPENING]');
    expect(finding).toContain(MOVER_ID);
    expect(finding).toContain(DOOR_ELEMENT_ID);
    expect(finding).toContain(HOST_ID);
    expect(finding).toContain('3.005');   // door interval
    expect(finding).toContain('3.931');
    expect(finding).toContain('3.400');   // crossing interval
    expect(finding).toContain('3.600');

    // …and the panel surfaces are silent: no ConfirmationCard rendered.
    expect(document.querySelector('.confirmation-card')).toBeNull();
    expect(rig.busCalls).toHaveLength(0);
    chat.unregister();
  }, 20000);
});
