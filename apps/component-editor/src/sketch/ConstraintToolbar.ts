// ConstraintToolbar — UI bar that dispatches the S52 constraint commands
// against the current `selectionStore` (S52 D2).
//
// One row of buttons:
//   • Coincident (needs 2 points)
//   • Distance   (needs 2 points + a prompt for mm value)
//   • Fixed      (needs 1 point — pins to its current x/z)
//   • Parallel   (needs 2 lines)
//   • Perpend.   (needs 2 lines)
//   • Tangent    (needs 1 spline + 1 line) — §CURVE-TANGENT-LEG, below
//
// ═══════════════════════════════════════════════════════════════════════════
// §CURVE-TANGENT-LEG — the button that makes a spline CONSTRAINABLE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ **THIS BUTTON CLOSES A LIVE `authored-but-unwired` GAP, and the gap is the
//   reason it exists.** `buildConstraintSet` registers two tangent LEGS per
//   spline in the solver's `lineEndpoints` table, and the solver executes them
//   correctly — but `splineTangentLegId` had **zero callers outside its own
//   module**, and `pickLines` below filters the selection through
//   `doc.lineById`, which a synthetic leg id is deliberately not in. So the
//   leg was reachable by the solver and reachable by NOTHING ELSE: a spline
//   that no constraint could touch, which is the decoy this lane exists to
//   remove. The command layer never needed changing — `constraint.addParallel`
//   takes opaque `EntityId`s and validates only `l1 !== l2`.
//
// ⭐ **Tangency is dispatched as `parallel`, NOT as a new `tangent` kind.**
//    `B′(0) = 3·(P1 − P0)`, so a cubic's tangent at an endpoint IS its first
//    control leg. C74 §4.1's MUST NOT ("no solver may be built because the
//    product category implies one") is therefore never approached: this is the
//    existing (b) ENFORCEMENT kind, closed-form, one line fixed.
//
// ⭐ **ARGUMENT ORDER IS LOAD-BEARING.** `engine.ts` rotates **`l2`** about its
//    START point, preserving its length. The leg is passed as `l2` and
//    oriented on-curve-endpoint FIRST, so the free HANDLE swings and the point
//    the curve actually passes through does not move. Passing the line as `l2`
//    would silently rotate the user's line instead of the curve.
//
// ⛔ **P6** — every button dispatches through the `CommandBus`. No button
//    writes a store directly, the Tangent button included.
//
// Each button reads the current selection ids + entity kinds, validates
// arity, and dispatches the verb through the supplied `CommandBus`.
// Errors are surfaced as a small status line under the bar.
//
// Pure DOM. No THREE. No `(window as any)`.

import type { CommandBus } from '../app/commandBus.js';
import {
  ADD_COINCIDENT_VERB,
  ADD_DISTANCE_VERB,
  ADD_FIXED_VERB,
  ADD_PARALLEL_VERB,
  ADD_PERPENDICULAR_VERB,
} from '../commands/constraint/index.js';
import type { EntityId } from './entities.js';
import { splineTangentLegId } from './buildConstraintSet.js';
import { pointToSegmentDistance } from './hitTest.js';
import type { SelectionStore } from '../stores/selectionStore.js';
import type { SketchDocStore } from '../stores/sketchDocStore.js';
import type { SketchViewKind } from '../views/viewProjection.js';

export interface ConstraintToolbarMount {
  readonly element: HTMLElement;
  destroy(): void;
}

export interface ConstraintToolbarOptions {
  readonly commandBus: CommandBus;
  readonly selectionStore: SelectionStore;
  readonly docStore: SketchDocStore;
  /**
   * §CONSTRAINT-IS-VIEW-SCOPED — the work plane `docStore` belongs to. Every
   * dispatch below carries it, so the constraint lands in THAT plane's store
   * and a recorded log replays onto the plane it was authored on rather than
   * onto whichever one happens to be active at replay time. This is what
   * retired the plan-only refusal in `views/SketchViewPanel.ts`.
   */
  readonly view: SketchViewKind;
  /** Optional value-prompt — defaults to a `window.prompt`. Tests inject
   *  a deterministic provider. */
  readonly promptValueMm?: (defaultMm: number) => number | null;
}

export function mountConstraintToolbar(opts: ConstraintToolbarOptions): ConstraintToolbarMount {
  const bar = document.createElement('div');
  bar.dataset.role = 'constraint-toolbar';
  bar.style.cssText = [
    'display:flex',
    'gap:6px',
    'padding:6px 12px',
    'align-items:center',
    'background:rgba(0,0,0,0.18)',
    'border-bottom:1px solid rgba(255,255,255,0.06)',
  ].join(';');

  const status = document.createElement('span');
  status.dataset.role = 'constraint-status';
  status.style.cssText = 'margin-left:auto;color:#9090a8;font:12px/1.4 system-ui;min-height:14px';

  /** Every constraint dispatch, with this toolbar's work plane attached. */
  const exec = (verb: string, args: Record<string, unknown>): Promise<unknown> =>
    opts.commandBus.execute(verb, { ...args, view: opts.view });

  const handlers: Array<() => void> = [];
  function makeButton(label: string, onClick: () => Promise<void>): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = constraintButtonStyle();
    const click = (): void => {
      onClick().catch((err: unknown) => setStatus(status, errMessage(err), true));
    };
    btn.addEventListener('click', click);
    handlers.push(() => btn.removeEventListener('click', click));
    return btn;
  }

  const promptFn =
    opts.promptValueMm ??
    ((d: number): number | null => {
      const raw = typeof prompt === 'function' ? prompt('Distance (mm)', String(d)) : null;
      if (raw === null || raw.trim() === '') return null;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : null;
    });

  bar.append(
    makeButton('Coincident', async () => {
      const pts = pickPoints(opts, 2);
      await exec(ADD_COINCIDENT_VERB, { p1: pts[0]!, p2: pts[1]! });
      setStatus(status, `Coincident: ${pts[0]} ↔ ${pts[1]}`, false);
    }),
    makeButton('Distance', async () => {
      const pts = pickPoints(opts, 2);
      const a = opts.docStore.get().pointById[pts[0]!]!;
      const b = opts.docStore.get().pointById[pts[1]!]!;
      const current = Math.hypot(a.x - b.x, a.z - b.z);
      const v = promptFn(Math.round(current * 100) / 100);
      if (v === null) {
        setStatus(status, 'Distance cancelled.', false);
        return;
      }
      await exec(ADD_DISTANCE_VERB, { p1: pts[0]!, p2: pts[1]!, value: v });
      setStatus(status, `Distance ${v.toFixed(2)} mm: ${pts[0]} → ${pts[1]}`, false);
    }),
    makeButton('Fixed', async () => {
      const pts = pickPoints(opts, 1);
      const p = opts.docStore.get().pointById[pts[0]!]!;
      await exec(ADD_FIXED_VERB, { p: pts[0]!, x: p.x, y: p.z });
      setStatus(status, `Fixed ${pts[0]} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`, false);
    }),
    makeButton('Parallel', async () => {
      const lns = pickLines(opts, 2);
      await exec(ADD_PARALLEL_VERB, { l1: lns[0]!, l2: lns[1]! });
      setStatus(status, `Parallel: ${lns[0]} ∥ ${lns[1]}`, false);
    }),
    makeButton('Perpend.', async () => {
      const lns = pickLines(opts, 2);
      await exec(ADD_PERPENDICULAR_VERB, { l1: lns[0]!, l2: lns[1]! });
      setStatus(status, `Perpendicular: ${lns[0]} ⟂ ${lns[1]}`, false);
    }),
    makeButton('Tangent', async () => {
      const t = pickSplineAndLine(opts);
      // The LEG is `l2` so the handle swings and the on-curve point holds.
      await exec(ADD_PARALLEL_VERB, {
        l1: t.lineId,
        l2: splineTangentLegId(t.splineId, t.which) as EntityId,
      });
      setStatus(status, `Tangent: ${t.splineId} (${t.which}) ∥ ${t.lineId}`, false);
    }),
    status,
  );

  return {
    element: bar,
    destroy() {
      for (const off of handlers) off();
      bar.remove();
    },
  };
}

/**
 * §CURVE-NO-POINT-ON-CURVE — the refusal C111 §9.3-a REQUIRES, at the exact
 * gesture that asks for it.
 *
 * ⛔ **C111 §9.3-a: "the editor MUST REFUSE TO AUTHOR A CONSTRAINT IT CANNOT
 *    EVALUATE, AND MUST NOT PERSIST ONE."** §9.3-b: the refusal "names both
 *    sides — the kind requested, and the classification it lacks."
 *
 * Selecting a point and a spline and pressing Coincident is how a person asks
 * for **point-on-curve**. Without this, the arity check below answers *"Select
 * 2 points (1 selected)"* — an arithmetic complaint that hides the real reason
 * and invites the user to try again forever. That is the
 * `[[context-data-honesty-family]]` shape: a refusal indistinguishable from a
 * miscount.
 *
 * `point-on-curve` is in NEITHER vocabulary — not one of `ConstraintKind`'s 5
 * members, not one of `ProfileConstraintSchema.kind`'s 12 — so there is
 * nothing to spell it with and nothing to evaluate it. It is genuinely
 * simultaneous (the curve parameter `t` is a second unknown that moves with
 * the point), which makes it a C74 §4.2 **(c) SOLVING** question, and (c) is
 * unauthorised until §4.2's record is written for it.
 */
function refusePointOnCurve(splineId: string): never {
  throw new Error(
    `Cannot constrain a point onto spline ${splineId}: "point-on-curve" is not an ` +
      'authorable kind — it is absent from ConstraintKind (5 members: distance-pp, ' +
      'parallel, perpendicular, coincident-pp, fixed) AND from ' +
      'ProfileConstraintSchema.kind (12 members), and it classifies as C74 §4.2 (c) ' +
      'SOLVING, which is unauthorised. Live alternatives: pin a control point with ' +
      'Fixed, or constrain an endpoint direction with Tangent.',
  );
}

function pickPoints(opts: ConstraintToolbarOptions, n: number): EntityId[] {
  const sel = opts.selectionStore.get().ids;
  const doc = opts.docStore.get();
  const pts = sel.filter((id) => Boolean(doc.pointById[id]));
  if (pts.length < n) {
    // Name the real reason BEFORE the arity complaint (C111 §9.3-b).
    const spline = sel.find((id) => Boolean(doc.splineById[id]));
    if (spline !== undefined && pts.length > 0) refusePointOnCurve(spline);
    throw new Error(`Select ${n} point${n === 1 ? '' : 's'} (${pts.length} selected).`);
  }
  return pts.slice(0, n) as EntityId[];
}

/**
 * §CURVE-TANGENT-LEG — resolve "this spline leaves tangent to that line" from
 * a selection of one spline + one line.
 *
 * WHICH END: the endpoint whose ON-CURVE control point is nearest the selected
 * SEGMENT, measured with the sketcher's existing `pointToSegmentDistance` —
 * not a second distance routine written here. A tie resolves to `'start'`
 * deterministically, so the same selection always yields the same constraint.
 */
function pickSplineAndLine(
  opts: ConstraintToolbarOptions,
): { splineId: EntityId; lineId: EntityId; which: 'start' | 'end' } {
  const sel = opts.selectionStore.get().ids;
  const doc = opts.docStore.get();
  const splineId = sel.find((id) => Boolean(doc.splineById[id]));
  const lineId = sel.find((id) => Boolean(doc.lineById[id]));
  if (splineId === undefined || lineId === undefined) {
    throw new Error(
      `Select 1 spline and 1 line (spline: ${splineId ? 'yes' : 'no'}, line: ${lineId ? 'yes' : 'no'}).`,
    );
  }
  const spline = doc.splineById[splineId]!;
  const cps = spline.controlPoints;
  const first = doc.pointById[cps[0]!];
  const last = doc.pointById[cps[cps.length - 1]!];
  if (!first || !last) {
    throw new Error(`Spline ${splineId} has no resolvable endpoints.`);
  }
  const line = doc.lineById[lineId]!;
  const a = doc.pointById[line.p1]!;
  const b = doc.pointById[line.p2]!;
  const dStart = pointToSegmentDistance(first.x, first.z, a.x, a.z, b.x, b.z);
  const dEnd = pointToSegmentDistance(last.x, last.z, a.x, a.z, b.x, b.z);
  return { splineId, lineId, which: dEnd < dStart ? 'end' : 'start' };
}

function pickLines(opts: ConstraintToolbarOptions, n: number): EntityId[] {
  const sel = opts.selectionStore.get().ids;
  const doc = opts.docStore.get();
  const lns = sel.filter((id) => Boolean(doc.lineById[id]));
  if (lns.length < n) {
    throw new Error(`Select ${n} line${n === 1 ? '' : 's'} (${lns.length} selected).`);
  }
  return lns.slice(0, n) as EntityId[];
}

function setStatus(el: HTMLElement, text: string, isError: boolean): void {
  el.textContent = text;
  el.style.color = isError ? '#ff8888' : '#9090a8';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

function constraintButtonStyle(): string {
  return [
    'background:rgba(102,0,255,0.18)',
    'color:#e8e8f0',
    'border:1px solid rgba(102,0,255,0.45)',
    'padding:4px 10px',
    'border-radius:4px',
    'font:12px/1.4 system-ui',
    'cursor:pointer',
  ].join(';');
}
