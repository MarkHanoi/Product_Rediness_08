// ─── GATE · check-undo-resume-flushes-topology ───────────────────────────────
//
// THE INVARIANT (C72 §4): releasing a suppression must DISCHARGE what it suppressed.
// A `resume()` that silently drops the notifications that arrived while paused is
// irreversible suppression — the channel reads as "back on" while the consequences of
// the paused window are gone for good.
//
// WHY THIS GATE EXISTS — the measured defect it pins closed (executed 2026-08-12).
// `RoomTopologyObserver.pause()/resume()` were bare flag writes, and
// `_onWallMutationCommitted` returned early while paused, DESTROYING the event:
//
//     event delivered while PAUSED   → resume() → 5000 ms of timers → 0 redetects
//     the IDENTICAL event UNPAUSED   →                                1 redetect
//
// The control is what makes that a defect rather than a broken harness: the same probe
// that saw zero could see one.
//
// WHY UNDO IS THE SHARP EDGE. `performUndoRedo._withPausedObservers`
// (apps/editor/src/engine/undo/performUndoRedo.ts:393-406) wraps EVERY Ctrl+Z in
// pause()/resume(). So the wall-baseline inverse patch lands, its
// `bim-wall-mutation-committed` fires INTO the paused window, and the rooms bounding
// that wall were refreshed only if some LATER unrelated edit happened to fire a
// redetect. Rooms disagreed with the walls, silently, for an unbounded time.
//
// WHAT THIS GATE IS *NOT*. It is NOT a second copy of
// `check-room-identity-survives-wall-move`. That gate asks: when a redetect DOES run,
// does the room keep its identity? This gate asks the prior question: does the redetect
// run at all after an undo? Both were needed — an identity check that never runs is
// vacuously green, which is exactly the state this repo was in.
//
// SCOPE — HONEST BOUNDS. This drives the REAL `RoomTopologyObserver` against a fake
// wall store and a recording commandManager. It therefore proves the observer emits the
// redetect COMMAND after resume; it does NOT prove the resulting room polygons are
// correct (that is RoomDetectionEngine's own gates) and it does NOT drive the browser
// undo stack. Stated so the green is not read as more than it is.
//
// CHECKS, each with a control that runs every time:
//   CHECK 1 · a commit arriving while paused is REPLAYED on resume (>=1 redetect).
//   CHECK 2 · ONE undo gesture yields ONE redetect for the level, not two — a flush that
//             double-fires is its own defect (it re-enters the work the pause avoided).
//   CHECK 3 · resume() with nothing suppressed fires NOTHING. Guards against a flush that
//             redetects unconditionally, which would double-redetect every project load
//             (ProjectLoader runs its OWN explicit post-load redetect).
//   CHECK 4 · the redetect does NOT run DURING the paused window — the reason for pausing
//             must still be honoured. Queue-and-flush, not pause-in-name-only.
//
//   POSITIVE CONTROL (a FLOOR, not a check): the pre-fix observer — a drop-on-pause
//   reimplementation — is run through CHECK 1's exact scenario. The checker MUST report
//   loss. If it reports "clean" over a resume known to drop events, the checker is BLIND
//   and this exits 2 MISCONFIGURED, never 0. This is the arm that makes CHECK 1 believable.
//
//   UNPAUSED-BASELINE CONTROL (a FLOOR): the same commit delivered with NO pause must
//   produce >=1 redetect. If the harness cannot produce a redetect at all, CHECK 1's
//   "it replayed" is unfalsifiable and every verdict here is meaningless.

import { reportGate, type GateResult, type Floor } from '../contract.js';
import { RoomTopologyObserver } from '../../../../packages/room-topology/src/RoomTopologyObserver.js';

const LEVEL = 'L1';
const SETTLE_MS = 1200; // > SOFT_COALESCE_MS (300) with wide margin

// ─── Minimal world ───────────────────────────────────────────────────────────
// `window` must exist before the observer reads `window.__wallDragInProgress`.
const g = globalThis as unknown as { window?: unknown };
if (typeof g.window === 'undefined') {
  g.window = { addEventListener() {}, removeEventListener() {} };
}

interface Harness {
  observer: { pause(): void; resume(): void; commit(levelId: string): void };
  redetects: string[];
}

/** The REAL observer, with only its inputs faked. */
function realHarness(): Harness {
  const redetects: string[] = [];
  const wallStore = {
    subscribe: () => () => {},
    // A non-empty, STABLE signature: the no-progress guard must not be the reason a
    // redetect does or does not fire, or this gate would be measuring that guard.
    getByLevel: () => [],
  };
  const commandManager = { execute: (c: { levelId?: string }) => { redetects.push(String(c?.levelId ?? LEVEL)); } };
  const bim = {
    getLevels: () => [{ id: LEVEL, elevation: 0, height: 3 }],
    getLevelById: (id: string) => ({ id, elevation: 0, height: 3 }),
  };
  const obs = new RoomTopologyObserver(
    wallStore as never, {} as never, commandManager as never, {} as never, bim as never,
  );
  return {
    observer: {
      pause: () => obs.pause(),
      resume: () => obs.resume(),
      commit: (levelId) => (obs as unknown as {
        _onWallMutationCommitted(p: { levelId: string }): void;
      })._onWallMutationCommitted({ levelId }),
    },
    redetects,
  };
}

/** The PRE-FIX observer, reimplemented: drop-on-pause, bare resume. The positive control. */
function preFixHarness(): Harness {
  const redetects: string[] = [];
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    observer: {
      pause: () => { paused = true; },
      resume: () => { paused = false; },          // drops whatever arrived — the defect
      commit: (levelId) => {
        if (paused) return;                        // destroyed, not queued
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => redetects.push(levelId), 300);
      },
    },
    redetects,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * THE CHECKER, applied identically to the real and the pre-fix observer — the only way
 * the positive control proves anything is if the SAME code judges both.
 * Returns the redetect count observed after a paused commit + resume.
 */
async function replayCount(h: Harness): Promise<{ duringPause: number; afterResume: number }> {
  h.observer.pause();
  h.observer.commit(LEVEL);
  await sleep(SETTLE_MS);
  const duringPause = h.redetects.length;
  h.observer.resume();
  await sleep(SETTLE_MS);
  return { duringPause, afterResume: h.redetects.length };
}

const lines: string[] = [];
const findingNames: string[] = [];
const floors: Floor[] = [];

// ─── UNPAUSED-BASELINE CONTROL (floor) ───────────────────────────────────────
const baseline = realHarness();
baseline.observer.commit(LEVEL);
await sleep(SETTLE_MS);
const baselineCount = baseline.redetects.length;
floors.push({
  what: 'UNPAUSED-BASELINE control — redetects from one unpaused commit (0 = harness cannot ' +
        'produce a redetect at all, so "it replayed" would be unfalsifiable)',
  measured: baselineCount,
  min: 1,
});
lines.push(`control · unpaused commit → ${baselineCount} redetect(s) — the harness CAN see a redetect.`);

// ─── POSITIVE CONTROL (floor) — the checker must SEE the pre-fix loss ────────
const pre = await replayCount(preFixHarness());
const checkerSawLoss = pre.afterResume === 0 ? 1 : 0;
floors.push({
  what: 'POSITIVE control — checker reports LOSS against the known drop-on-pause observer ' +
        '(0 = BLIND checker, verdict impossible)',
  measured: checkerSawLoss,
  min: 1,
});
lines.push(
  `control · PRE-FIX observer (drop-on-pause) → ${pre.afterResume} redetect(s) after resume — ` +
  `checker ${checkerSawLoss ? 'SAW the loss ✓' : 'was BLIND ✗'}.`,
);

// ─── CHECK 1 · paused commit is replayed on resume ───────────────────────────
const real = await replayCount(realHarness());
if (real.afterResume < 1) {
  findingNames.push('CHECK 1: a commit arriving while paused was NOT replayed on resume');
  lines.push(
    `❌ CHECK 1 · REPLAY: a commit delivered while paused produced ${real.afterResume} redetect(s) after ` +
    `resume. The pre-fix observer scores 0 here too — suppression is irreversible and the rooms bounding ` +
    `an undone wall move stay stale until an unrelated later edit happens to fire a redetect (C72 §4).`,
  );
} else {
  lines.push(`✓  CHECK 1 · REPLAY: paused commit → ${real.afterResume} redetect(s) after resume — discharged, not dropped.`);
}

// ─── CHECK 4 · but NOT during the pause (same run, so it cannot disagree) ────
if (real.duringPause !== 0) {
  findingNames.push('CHECK 4: a redetect ran DURING the paused window');
  lines.push(
    `❌ CHECK 4 · PAUSE HONOURED: ${real.duringPause} redetect(s) ran while paused. The fix must QUEUE, ` +
    `not merely re-enable — a pause that does not suppress is a pause in name only, and undo/load would ` +
    `redetect mid-apply again.`,
  );
} else {
  lines.push('✓  CHECK 4 · PAUSE HONOURED: 0 redetects during the paused window — queue-and-flush, not pause-in-name-only.');
}

// ─── CHECK 2 · ONE gesture → ONE redetect ────────────────────────────────────
if (real.afterResume >= 1 && real.afterResume !== 1) {
  findingNames.push(`CHECK 2: one undo gesture produced ${real.afterResume} redetects, not one`);
  lines.push(
    `❌ CHECK 2 · ONE STEP: one paused commit + one resume produced ${real.afterResume} redetects. A flush ` +
    `that fires more than once re-enters the very work the pause existed to avoid.`,
  );
} else if (real.afterResume === 1) {
  lines.push('✓  CHECK 2 · ONE STEP: one paused commit + one resume → exactly 1 redetect.');
}

// ─── CHECK 3 · resume with nothing suppressed fires nothing ──────────────────
const idle = realHarness();
idle.observer.pause();
idle.observer.resume();
await sleep(SETTLE_MS);
if (idle.redetects.length !== 0) {
  findingNames.push(`CHECK 3: resume() with nothing suppressed fired ${idle.redetects.length} redetect(s)`);
  lines.push(
    `❌ CHECK 3 · NO SPURIOUS FLUSH: an empty pause/resume produced ${idle.redetects.length} redetect(s). ` +
    `ProjectLoader pauses around every load and runs its OWN explicit post-load redetect — an ` +
    `unconditional flush would double-redetect every project open.`,
  );
} else {
  lines.push('✓  CHECK 3 · NO SPURIOUS FLUSH: pause()/resume() with nothing suppressed → 0 redetects.');
}

const result: GateResult = {
  gate: 'check-undo-resume-flushes-topology',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, NO BASELINE. C72 §4 admits no tolerated level of irreversible suppression:
  // a dropped notification is not a smaller version of a delivered one, and the state it
  // would have refreshed stays wrong for an unbounded time with everything looking fine.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
