// AI replay corpus — 10 hand-authored prompt fixtures (S54).
//
// Each fixture is a frozen end-to-end snapshot of an AI proposal:
//   • `id` / `prompt` — what the (stub) AI host returns to `submit`.
//   • `commands` — the exact `executeBatch` spec the bridge will commit.
//   • `expect` — the deterministic post-conditions the replay test
//     asserts against (undo depth, span name, store contents).
//
// The mix below covers every category at least once and sweeps
// single-verb (5) + multi-verb (5) proposals.  Verb-level argument
// validity has already been pinned by `toolRegistry.test.ts` — these
// fixtures focus on the END-TO-END pipeline (host → queue → bridge →
// command bus → store).
//
// IMPORTANT: do not include sketch / point ids in the expectations
// because the constraint store mints opaque ids; assert by `kind`.

import { AI_BATCH_SPAN_NAME } from '../../src/ai/aiHostBridge.js';
import type { ExecuteBatchSpec } from '../../src/app/commandBus.js';

export interface ReplayExpectation {
  /** Undo depth after `acceptNext` — always 1 for a successful batch. */
  readonly undoDepthAfter: number;
  /** Parent span the AI batch must emit. */
  readonly spanName: string;
  /** Optional: ordered names of reference planes that should exist
   *  in the store after the batch commits. */
  readonly finalReferencePlaneNames?: ReadonlyArray<string>;
  /** Optional: expected count of reference planes. */
  readonly finalReferencePlaneCount?: number;
  /** Optional: ordered names of solids that should exist. */
  readonly finalSolidNames?: ReadonlyArray<string>;
  /** Optional: expected count of constraints, by `kind`. */
  readonly finalConstraintKindCounts?: Readonly<Record<string, number>>;
  /** Optional: total constraint count. */
  readonly finalConstraintCount?: number;
}

export interface ReplayFixture {
  readonly id: string;
  readonly prompt: string;
  readonly commands: ReadonlyArray<ExecuteBatchSpec>;
  readonly expect: ReplayExpectation;
}

const Z_UP = Object.freeze({ x: 0, y: 0, z: 1 });
const Y_UP = Object.freeze({ x: 0, y: 1, z: 0 });
const X_UP = Object.freeze({ x: 1, y: 0, z: 0 });
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });

export const REPLAY_FIXTURES: ReadonlyArray<ReplayFixture> = Object.freeze([
  // ── 1. Single-verb: add one reference plane. ──────────────────────
  {
    id: 'fx-01-add-top-plane',
    prompt: 'Add a horizontal Top reference plane at the origin.',
    commands: Object.freeze([
      {
        verb: 'referencePlane.add',
        args: { name: 'Top', origin: ORIGIN, normal: Z_UP },
      },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalReferencePlaneCount: 1,
      finalReferencePlaneNames: ['Top'],
    },
  },

  // ── 2. Multi-verb: full triad of orthogonal reference planes. ─────
  {
    id: 'fx-02-orthogonal-triad',
    prompt: 'Set up the standard orthogonal reference plane triad.',
    commands: Object.freeze([
      { verb: 'referencePlane.add', args: { name: 'Top',   origin: ORIGIN, normal: Z_UP } },
      { verb: 'referencePlane.add', args: { name: 'Front', origin: ORIGIN, normal: Y_UP } },
      { verb: 'referencePlane.add', args: { name: 'Right', origin: ORIGIN, normal: X_UP } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalReferencePlaneCount: 3,
      finalReferencePlaneNames: ['Top', 'Front', 'Right'],
    },
  },

  // ── 3. Single-verb: add a single coincident constraint. ───────────
  {
    id: 'fx-03-single-coincident',
    prompt: 'Pin point P1 onto P2.',
    commands: Object.freeze([
      { verb: 'constraint.addCoincident', args: { p1: 'p1', p2: 'p2' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalConstraintCount: 1,
      finalConstraintKindCounts: { 'coincident-pp': 1 },
    },
  },

  // ── 4. Multi-verb: full rectangle constraint stack. ───────────────
  {
    id: 'fx-04-rectangle-constraints',
    prompt: 'Make the four sketch lines into a rectangle.',
    commands: Object.freeze([
      { verb: 'constraint.addParallel',      args: { l1: 'l-top',   l2: 'l-bot' } },
      { verb: 'constraint.addParallel',      args: { l1: 'l-left',  l2: 'l-right' } },
      { verb: 'constraint.addPerpendicular', args: { l1: 'l-top',   l2: 'l-left' } },
      { verb: 'constraint.addFixed',         args: { p: 'p-corner', x: 0, y: 0 } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalConstraintCount: 4,
      finalConstraintKindCounts: {
        parallel: 2,
        perpendicular: 1,
        fixed: 1,
      },
    },
  },

  // ── 5. Single-verb: add one extrude solid. ────────────────────────
  {
    id: 'fx-05-add-extrude',
    prompt: 'Add the main extrude body.',
    commands: Object.freeze([
      { verb: 'solid.add', args: { name: 'Body', kind: 'extrude' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalSolidNames: ['Body'],
    },
  },

  // ── 6. Multi-verb: build a small kit (3 solids, mixed kinds). ─────
  {
    id: 'fx-06-mixed-solids',
    prompt: 'Build the chair kit: seat (extrude), legs (sweep), back (revolve).',
    commands: Object.freeze([
      { verb: 'solid.add', args: { name: 'Seat',  kind: 'extrude' } },
      { verb: 'solid.add', args: { name: 'Legs',  kind: 'sweep'   } },
      { verb: 'solid.add', args: { name: 'Back',  kind: 'revolve' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalSolidNames: ['Seat', 'Legs', 'Back'],
    },
  },

  // ── 7. Multi-verb: parametric distance + fixed pin. ───────────────
  {
    id: 'fx-07-parametric-distance',
    prompt: 'Pin the origin and dimension width to the Width parameter.',
    commands: Object.freeze([
      { verb: 'constraint.addFixed',    args: { p: 'p-origin', x: 0, y: 0 } },
      { verb: 'constraint.addDistance', args: { p1: 'p-origin', p2: 'p-end', value: 'Width' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalConstraintCount: 2,
      finalConstraintKindCounts: {
        fixed: 1,
        'distance-pp': 1,
      },
    },
  },

  // ── 8. Multi-verb: cross-category combo (plane + solid). ──────────
  {
    id: 'fx-08-plane-and-solid',
    prompt: 'Drop a Top plane and create the body that extrudes from it.',
    commands: Object.freeze([
      { verb: 'referencePlane.add', args: { name: 'Top',  origin: ORIGIN, normal: Z_UP } },
      { verb: 'solid.add',          args: { name: 'Body', kind: 'extrude' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalReferencePlaneCount: 1,
      finalReferencePlaneNames: ['Top'],
      finalSolidNames: ['Body'],
    },
  },

  // ── 9. Single-verb: literal-mm distance. ──────────────────────────
  {
    id: 'fx-09-literal-distance',
    prompt: 'Set the distance between A and B to 250 mm.',
    commands: Object.freeze([
      { verb: 'constraint.addDistance', args: { p1: 'pA', p2: 'pB', value: 250 } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalConstraintCount: 1,
      finalConstraintKindCounts: { 'distance-pp': 1 },
    },
  },

  // ── 10. Multi-verb: full S54-shape — planes + sketch + solid. ────
  {
    id: 'fx-10-end-to-end-bracket',
    prompt: 'Build the full bracket: front plane, perpendicular sketch lines, two solids.',
    commands: Object.freeze([
      { verb: 'referencePlane.add',         args: { name: 'Front', origin: ORIGIN, normal: Y_UP } },
      { verb: 'constraint.addPerpendicular', args: { l1: 'l-vert', l2: 'l-horz' } },
      { verb: 'constraint.addCoincident',    args: { p1: 'p-end-vert', p2: 'p-start-horz' } },
      { verb: 'solid.add',                   args: { name: 'Plate', kind: 'extrude' } },
      { verb: 'solid.add',                   args: { name: 'Fillet', kind: 'sweep' } },
    ]),
    expect: {
      undoDepthAfter: 1,
      spanName: AI_BATCH_SPAN_NAME,
      finalReferencePlaneCount: 1,
      finalReferencePlaneNames: ['Front'],
      finalConstraintCount: 2,
      finalConstraintKindCounts: {
        perpendicular: 1,
        'coincident-pp': 1,
      },
      finalSolidNames: ['Plate', 'Fillet'],
    },
  },
] satisfies ReadonlyArray<ReplayFixture>);
