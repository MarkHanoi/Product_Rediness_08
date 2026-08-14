// ─── HARNESS 2 — UNDO/REDO ROUND-TRIP (BIM 2.0 directive §11) ────────────────
//
// Per capability:   State A → operation → State B → undo → ≡ State A
//                                                 → redo → ≡ State B
// against AUTHORITATIVE state (whole-store deep capture), never UI, never
// CommandResult.success.
//
// UNDO PATH UNDER CERTIFICATION (declared honestly): every CASES verb in this
// file carries register column `undo: legacy-stack` — the LEGACY CommandManager
// history owns the undo step, and the per-case protocol drives `cm.undo()` /
// `cm.redo()` directly. The UNIFIED performUndoRedo path is certified by the
// CE-04 block at the end of this file (added 2026-08-14): two arms drive the
// REAL exported performUndo()/performRedo() against this same seeded world —
// one down the commandManager leg, one down the ring-buffer leg with a REAL
// RingBufferUndoStack and the production wall.updateBaseline PatchPair — and
// grade both with the SAME whole-store comparator as every row above.
//   ⚠ Header re-stamped 2026-08-13: this paragraph used to cite "the 250 ms
//   three-stack wall-clock reconciliation, pinned RED-BY-DESIGN by the 3
//   `it.fails` in undoGestureOrdering.test.ts" as the reason. That reason has
//   EXPIRED — §UNDO-GESTURE-ID (2026-08-12) deleted the 250 ms constant, the
//   twin predicate now compares gestureId, and all three `it.fails` markers are
//   gone; performUndoRedo.test.ts + undoGestureOrdering.test.ts run 26/26 green
//   at HEAD (executed 2026-08-13). Those are EXECUTED UNIT suites over the real
//   `performUndoRedo` routing with stub stores/cm — evidence, not certification
//   (C70 §0.1): no seeded world, no whole-store comparator, not enrolled in
//   certify.ts. 2026-08-14: the CE-04 block below closes that gap — the unified
//   path is now driven against the seeded world under the whole-store
//   comparator, inside a certify-enrolled suite.
//
// `performUndo()` returns void (C03 §4.6 U-4, pinned elsewhere) — nothing in
// this file reads an undo return value as evidence; state is re-captured after
// every step.
//
// TOLERANCE LEDGER (declared, not buried): the undo-vs-A and redo-vs-B
// comparators exclude exactly TWO fields, `metadata.createdAt` and
// `metadata.modifiedAt`, enumerated by name in `capture.ts` and ratified by
// ADR-0319 §3 (DERIVED-INCIDENTAL). Every verdict cell that excluded anything
// prints the count and the citation. `metadata.version` and `_renderVersion`
// are ADR-0319 class 2 and are NOT excluded — a counter that ratchets through an
// undo cycle stays a measured FAILURE, and the FALSIFIABILITY test below proves
// the predicate still catches both.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { World } from '../world';
import {
  captureState, diffState, isAdr0319Class3, ADR0319_CLASS3_CITATION,
  type StateCapture,
} from '../capture';
import { finishRow, writeResults, type CertRow } from '../report';
import { deserializeRoom } from '@pryzm/room-topology';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { slabSystemTypeStore } from '@pryzm/geometry-slab';

let world: World;
let reg: any;
const rows: CertRow[] = [];
const ROOM_ID = crypto.randomUUID();
const seedLog: string[] = [];

// The batch bridges report partial/refusal verdicts as window CustomEvents
// (§FIX-REPORT-PAYLOAD-DISCARD). Captured so a refusal-with-reason is graded
// REFUSES-CORRECTLY rather than mistaken for a silent success.
const BATCH_REPORT_EVENTS = [
  'pryzm-wall-type-batch-report', 'pryzm-door-type-batch-report',
  'pryzm-window-type-batch-report', 'pryzm-slab-type-batch-report',
  'pryzm-ceiling-type-batch-report',
];
let lastBatchReport: { event: string; detail: unknown } | null = null;

/**
 * Render the ADR-0319 class-3 exclusion COUNT into the verdict string.
 *
 * §0 rule 3 of the acceptance plan: no criterion may be scored by a tolerance
 * list written to make it pass. The list here is ratified by ADR-0319 §3 and
 * holds two named fields — and every cell it touches SAYS SO, with the count and
 * the citation, so a green row can never hide how many divergences were dropped
 * to make it green. A row that excluded nothing says nothing extra.
 */
function excl(n: number): string {
  return n === 0 ? '' : `; ${n} field(s) excluded — ${ADR0319_CLASS3_CITATION}`;
}

interface CaseSpec {
  capability: string;
  intent: string;
  verb: string;
  /** Build the payload at run time (may read live stores / catalogues).
   *  Return null with a reason to mark the case UNPROVEN. */
  payload: () => { payload: unknown } | { unprovable: string };
  /** Human path this case expects to move, e.g. 'roof.<id>.thickness'. */
  watched: string;
  /** Batch verbs must collapse to exactly ONE cm entry (C16 CA-12). */
  expectSingleEntry?: boolean;
}

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();
  reg = await import('@pryzm/command-registry');

  const cm = world.cm;
  const s = (name: string, fn: () => { success?: boolean; info?: string[] } | void): void => {
    try {
      const r = fn();
      seedLog.push(`${name}: ${r && r.success === false ? 'REFUSED ' + [...(r.info ?? []), (r as { error?: string }).error ?? ''].filter(Boolean).join('; ') : 'OK'}`);
    } catch (e) { seedLog.push(`${name}: THREW ${String(e).slice(0, 200)}`); }
  };

  s('level L1', () => cm.execute(new reg.AddLevelCommand({ levelId: 'L1', name: 'Level 1', elevation: 3, height: 3 })));
  s('wall u-wall-1', () => cm.execute(new reg.CreateWallCommand('u-wall-1', {
    start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0', materialColor: '#aaaaaa',
  })));
  s('wall u-wall-2', () => cm.execute(new reg.CreateWallCommand('u-wall-2', {
    start: { x: 0, z: 4 }, end: { x: 6, z: 4 }, height: 3, thickness: 0.2, levelId: 'L0',
  })));
  s('door', () => cm.execute(new reg.CreateWallOpeningCommand({
    wallId: 'u-wall-1',
    openingData: { type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' },
  })));
  s('window', () => cm.execute(new reg.CreateWallOpeningCommand({
    wallId: 'u-wall-2',
    openingData: { type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' },
  })));
  s('slab', () => cm.execute(new reg.CreateSlabCommand({
    id: 'u-slab-1', levelId: 'L0', position: { x: 3, y: 0, z: 2 },
    polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
    thickness: 0.25, width: 6, depth: 4,
  })));
  s('roof', () => cm.execute(new reg.CreateRoofCommand('u-roof-1', {
    levelId: 'L0',
    footprint: { polygon: [[-1, -1], [7, -1], [7, 5], [-1, 5]], centroid: [3, 2] },
    roofType: 'flat', overhang: 0.3, baseOffset: 3, thickness: 0.2,
  })));
  s('ceiling', () => cm.execute(new reg.CreateCeilingCommand({
    ceilingId: 'u-ce-1', ifcGuid: 'u-ce-1-guid', levelId: 'L0',
    polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    height: 2.7,
  })));
  s('room', () => cm.execute(new reg.BatchCreateRoomsCommand([deserializeRoom({
    id: ROOM_ID, type: 'room', name: 'Undo Room', levelId: 'L0',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
                height: 3, baseOffset: 0, detectionMethod: 'manual-boundary' },
  })])));

  // Capture the batch bridges' report CustomEvents (refusal ≠ silence).
  for (const evt of BATCH_REPORT_EVENTS) {
    window.addEventListener(evt, ((e: CustomEvent) => {
      lastBatchReport = { event: evt, detail: e.detail };
    }) as EventListener);
  }

  // The seeding itself armed the cm stack; the per-case protocol only ever pops
  // the entries the case's own dispatch pushed, so clear for a clean baseline.
  cm.clearHistory();
  console.log('[H2] seed: ' + seedLog.join(' | '));
}, 600_000);

const CASES: CaseSpec[] = [
  {
    capability: 'roof.update', intent: 'set roof thickness', verb: 'roof.update',
    watched: 'roof.u-roof-1.thickness',
    payload: () => ({ payload: { id: 'u-roof-1', updates: { thickness: 0.4 } } }),
  },
  {
    capability: 'wall.updateDimensions', intent: 'set wall height', verb: 'wall.updateDimensions',
    watched: 'wall.u-wall-1.height',
    payload: () => ({ payload: { wallId: 'u-wall-1', height: 4.2 } }),
  },
  {
    capability: 'wall.updateBaseline', intent: 'move a wall (baseline)', verb: 'wall.updateBaseline',
    watched: 'wall.u-wall-2.baseLine',
    payload: () => {
      const wall = world.stores.wallStore.getById('u-wall-2');
      if (!wall) return { unprovable: 'wall u-wall-2 absent' };
      const bl = JSON.parse(JSON.stringify(wall.baseLine));
      const moved = bl.map((p: { x: number; y?: number; z: number }) => ({ x: p.x, y: p.y ?? 0, z: p.z + 1 }));
      const prev = bl.map((p: { x: number; y?: number; z: number }) => ({ x: p.x, y: p.y ?? 0, z: p.z }));
      return { payload: { wallId: 'u-wall-2', newBaseLine: moved, prevBaseLine: prev } };
    },
  },
  {
    capability: 'element.updateParameters', intent: 'set wall colour via the generic parameter path',
    verb: 'element.updateParameters', watched: 'wall.u-wall-1.materialColor',
    payload: () => ({ payload: { elementId: 'u-wall-1', elementType: 'wall', parameters: { materialColor: '#123456' } } }),
  },
  {
    capability: 'wall.updateColor', intent: 'set wall colour', verb: 'wall.updateColor',
    watched: 'wall.u-wall-2.materialColor',
    payload: () => ({ payload: { wallId: 'u-wall-2', materialColor: '#654321' } }),
  },
  {
    capability: 'slab.updateDimensions', intent: 'set slab thickness', verb: 'slab.updateDimensions',
    watched: 'slab.u-slab-1.thickness',
    payload: () => ({ payload: { slabId: 'u-slab-1', thickness: 0.3 } }),
  },
  {
    capability: 'ceiling.update', intent: 'set ceiling height', verb: 'ceiling.update',
    watched: 'ceiling.u-ce-1.height',
    payload: () => ({ payload: { ceilingId: 'u-ce-1', updates: { height: 2.9 } } }),
  },
  {
    capability: 'door.setOffset', intent: 'move a door along its wall', verb: 'door.setOffset',
    watched: 'door.<id>.offset',
    payload: () => {
      const d = doorStore.getAll().find((x: any) => x.wallId === 'u-wall-1');
      if (!d) return { unprovable: 'no door record in the authoritative doorStore' };
      return { payload: { doorId: d.id, newOffset: 2.6, prevOffset: d.offset } };
    },
  },
  {
    capability: 'window.setOffset', intent: 'move a window along its wall', verb: 'window.setOffset',
    watched: 'window.<id>.offset',
    payload: () => {
      const wrec = windowStore.getAll().find((x: any) => x.wallId === 'u-wall-2');
      if (!wrec) return { unprovable: 'no window record in the authoritative windowStore' };
      return { payload: { windowId: wrec.id, newOffset: 1.1, prevOffset: wrec.offset } };
    },
  },
  {
    capability: 'door.setSillHeight', intent: 'set door sill height (generic parameter bridge)',
    verb: 'door.setSillHeight', watched: 'door.<id>.sillHeight',
    payload: () => {
      const d = doorStore.getAll()[0];
      if (!d) return { unprovable: 'no door record in the authoritative doorStore' };
      return { payload: { doorId: d.id, sillHeight: 0.1 } };
    },
  },
  {
    capability: 'room.setMaterial (colour)', intent: 'set room fill colour', verb: 'room.setMaterial',
    watched: 'room.<id>.colour',
    payload: () => ({ payload: { roomId: ROOM_ID, materialColor: '#00cc66' } }),
  },
  {
    capability: 'room.setName', intent: 'rename a room', verb: 'room.setName',
    watched: 'room.<id>.name',
    payload: () => ({ payload: { roomId: ROOM_ID, name: 'Renamed Room' } }),
  },
  {
    capability: 'wall.updateSystemTypeBatch', intent: 'change ALL walls to a named type (batch = ONE undo)',
    verb: 'wall.updateSystemTypeBatch', watched: 'wall.*.systemTypeId', expectSingleEntry: true,
    payload: () => {
      const types = wallSystemTypeStore?.getAll?.() ?? [];
      const current = world.stores.wallStore.getById('u-wall-1')?.systemTypeId;
      const t = types.find((x: any) => x.id !== current);
      if (!t) return { unprovable: 'wall system type catalogue empty — nothing to change to' };
      return { payload: { wallIds: 'all', systemType: t.id } };
    },
  },
  {
    capability: 'door.updateSystemTypeBatch', intent: 'change ALL doors to a named type (batch = ONE undo)',
    verb: 'door.updateSystemTypeBatch', watched: 'door.*.systemTypeId', expectSingleEntry: true,
    payload: () => {
      const types = doorSystemTypeStore?.getAll?.() ?? [];
      if (types.length === 0) return { unprovable: 'door system type catalogue empty' };
      return { payload: { doorIds: 'all', systemType: types[0].id } };
    },
  },
  {
    capability: 'window.updateSystemTypeBatch', intent: 'change ALL windows to a named type (batch = ONE undo)',
    verb: 'window.updateSystemTypeBatch', watched: 'window.*.systemTypeId', expectSingleEntry: true,
    payload: () => {
      const types = windowSystemTypeStore?.getAll?.() ?? [];
      if (types.length === 0) return { unprovable: 'window system type catalogue empty' };
      return { payload: { windowIds: 'all', systemType: types[0].id } };
    },
  },
  {
    capability: 'slab.updateSystemTypeBatch', intent: 'change ALL slabs to a named type (batch = ONE undo)',
    verb: 'slab.updateSystemTypeBatch', watched: 'slab.*.systemTypeId', expectSingleEntry: true,
    payload: () => {
      const types = slabSystemTypeStore?.getAll?.() ?? [];
      if (types.length === 0) return { unprovable: 'slab system type catalogue empty' };
      return { payload: { slabIds: 'all', systemType: types[0].id } };
    },
  },
];

describe('HARNESS 2 — undo/redo round-trip vs authoritative state (§11)', () => {
  it('the world is not silently empty (MISCONFIGURED guard)', () => {
    const a = captureState(world);
    const total = Object.values(a).reduce((n, k) => n + Object.keys(k.records).length, 0);
    console.log('[H2] baseline records=' + total + '; registrationFailures=' + JSON.stringify(world.registrationFailures));
    expect(total, 'no records seeded — harness MISCONFIGURED, refusing to certify').toBeGreaterThan(0);
  });

  for (const spec of CASES) {
    it(`${spec.capability}`, async () => {
      const built = spec.payload();
      if ('unprovable' in built) {
        rows.push(finishRow({
          capability: spec.capability, intent: spec.intent, command: spec.verb,
          authoritativeState: `UNPROVEN — ${built.unprovable}`,
          geometry: 'UNPROVEN — no fragment builders headless',
          persistence: 'n/a — measured by Harness 1',
          undo: `UNPROVEN — ${built.unprovable}`,
          redo: `UNPROVEN — ${built.unprovable}`,
          collaboration: 'UNPROVEN — no transport exists (L-391 leg C)',
          report: 'UNPROVEN — case never dispatched',
          evidence: [built.unprovable],
        }));
        console.log(`[H2 ${spec.capability}] UNPROVEN — ${built.unprovable}`);
        return;
      }

      const cm = world.cm;
      const A = captureState(world);
      const historyBefore = cm.getHistory().length;
      lastBatchReport = null;

      const d = await world.dispatch(spec.verb, built.payload);
      const B = captureState(world);
      const entriesAdded = cm.getHistory().length - historyBefore;
      const abDiff = diffState(A, B);

      let stateVerdict: string;
      let undoVerdict: string;
      let redoVerdict: string;

      if (!d.ok) {
        stateVerdict = abDiff.divergences.length === 0
          ? `REFUSES-CORRECTLY — dispatch threw (${d.err}) and authoritative state is unchanged`
          : `FAIL — dispatch threw (${d.err}) yet authoritative state CHANGED: ${abDiff.divergences[0]?.path}`;
        undoVerdict = 'UNPROVEN — nothing to undo (dispatch refused)';
        redoVerdict = 'UNPROVEN — nothing to redo';
      } else if (abDiff.divergences.length === 0) {
        // A batch bridge that changed nothing may still have SAID SO out loud
        // (§FIX-REPORT-PAYLOAD-DISCARD CustomEvent). A spoken refusal is not a
        // silent success — it is the honest refusal shape.
        const rpt = lastBatchReport?.detail as { success?: boolean; info?: string[]; outcome?: string } | undefined;
        if (rpt && rpt.success === false && (rpt.info?.length ?? 0) > 0) {
          stateVerdict = `REFUSES-CORRECTLY — no store changed and the bridge broadcast its refusal: ${(rpt.info ?? []).join('; ').slice(0, 240)}`;
        } else {
          stateVerdict = `SILENT SUCCESS (FAIL) — '${spec.verb}' resolved successfully but no authoritative store changed` +
            (rpt ? ` (report event said success=${String(rpt.success)})` : ' (and no report event was broadcast)') +
            '. The user would be told it worked.';
        }
        undoVerdict = 'UNPROVEN — no state change to undo';
        redoVerdict = 'UNPROVEN — no state change to redo';
      } else {
        const changedPaths = abDiff.divergences.slice(0, 6).map((x) => x.path);
        stateVerdict = `PROVEN — authoritative state moved: ${changedPaths.join(', ')}` +
          (abDiff.divergences.length > 6 ? ` … +${abDiff.divergences.length - 6}` : '');

        if (entriesAdded <= 0) {
          undoVerdict = `FAIL — the mutation reached authoritative state but armed NO commandManager undo entry (entriesAdded=${entriesAdded}); Ctrl+Z cannot revert it on the stack that owns this verb`;
          redoVerdict = 'UNPROVEN — undo never possible';
        } else {
          if (spec.expectSingleEntry && entriesAdded !== 1) {
            undoVerdict = `FAIL — batch armed ${entriesAdded} undo entries; C16 CA-12 requires ONE`;
          }
          // Undo exactly the entries this dispatch armed — one at a time, in order.
          for (let i = 0; i < entriesAdded; i++) cm.undo();
          const afterUndo = captureState(world);
          const undoDiff = diffState(A, afterUndo, isAdr0319Class3);
          const undoClean = undoDiff.divergences.length === 0 && undoDiff.misconfigured.length === 0;
          const baseUndoVerdict = undoClean
            ? `PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, ${entriesAdded} entr${entriesAdded === 1 ? 'y' : 'ies'}${excl(undoDiff.toleratedCount)})`
            : `FAIL — after undo, ${undoDiff.divergences.length} divergence(s) from State A: ` +
              undoDiff.divergences.slice(0, 6).map((x) => `${x.path}: expected ${JSON.stringify(x.expected)} got ${JSON.stringify(x.actual)}`).join(' | ');
          undoVerdict = spec.expectSingleEntry && entriesAdded !== 1
            ? `${undoVerdict} · ${baseUndoVerdict}`
            : baseUndoVerdict;

          for (let i = 0; i < entriesAdded; i++) cm.redo();
          const afterRedo = captureState(world);
          const redoDiff = diffState(B, afterRedo, isAdr0319Class3);
          redoVerdict = redoDiff.divergences.length === 0 && redoDiff.misconfigured.length === 0
            ? `PROVEN — after redo, authoritative state ≡ State B (deep, whole-store${excl(redoDiff.toleratedCount)})`
            : `FAIL — after redo, ${redoDiff.divergences.length} divergence(s) from State B: ` +
              redoDiff.divergences.slice(0, 6).map((x) => `${x.path}: expected ${JSON.stringify(x.expected)} got ${JSON.stringify(x.actual)}`).join(' | ');
        }
      }

      const row = finishRow({
        capability: spec.capability, intent: spec.intent, command: spec.verb,
        authoritativeState: stateVerdict,
        geometry: 'UNPROVEN — no fragment builders headless; meshes never built',
        persistence: 'n/a — measured by Harness 1',
        undo: undoVerdict,
        redo: redoVerdict,
        collaboration: 'UNPROVEN — no transport exists (L-391 leg C)',
        report: d.ok
          ? 'PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately)'
          : `PROVEN — refusal carried its reason verbatim: ${d.err.slice(0, 160)}`,
        evidence: [
          `dispatch=${d.ok ? 'OK' : 'THREW'}`,
          `entriesAdded=${entriesAdded}`,
          `watched=${spec.watched}`,
          `A→B divergences=${abDiff.divergences.length}`,
        ],
      });
      rows.push(row);
      console.log(`[H2 ${spec.capability}] ${row.status}\n  state: ${stateVerdict}\n  undo:  ${undoVerdict}\n  redo:  ${redoVerdict}`);

      expect.soft(stateVerdict, spec.capability).not.toMatch(/^SILENT SUCCESS/);
      expect.soft(undoVerdict, spec.capability + ' undo').not.toMatch(/^FAIL/);
      expect.soft(redoVerdict, spec.capability + ' redo').not.toMatch(/^FAIL/);
    });
  }

  it('FALSIFIABILITY — the ADR-0319 exclusion is NARROW: class-2 counters still go RED', () => {
    // The class-3 list is the only thing this harness normalises away, and the
    // risk it carries is over-reach: an exclusion broad enough to swallow
    // `metadata.version` or `_renderVersion` would silently turn the class-2
    // defect this criterion exists to catch into a green cell. So the predicate
    // is asserted against a tampered capture on BOTH sides — the two enumerated
    // class-3 fields must be dropped, and every class-2 counter must survive.
    const A = captureState(world);
    const tampered: StateCapture = JSON.parse(JSON.stringify(A));
    const w = tampered['wall'].records['u-wall-1'] as {
      _renderVersion?: number;
      metadata?: { version?: number; modifiedAt?: number; createdAt?: number };
    };
    w._renderVersion = (w._renderVersion ?? 0) + 99;
    if (w.metadata) {
      w.metadata.version = (w.metadata.version ?? 0) + 99;
      w.metadata.modifiedAt = (w.metadata.modifiedAt ?? 0) + 99;
      w.metadata.createdAt = (w.metadata.createdAt ?? 0) + 99;
    }
    const d = diffState(A, tampered, isAdr0319Class3);
    const paths = d.divergences.map((x) => x.path);
    console.log('[FALSIFY H2 class-3] kept=' + JSON.stringify(paths) +
      ' excluded=' + d.toleratedCount + ' (' + ADR0319_CLASS3_CITATION + ')');

    // class 2 — MUST still be reported.
    expect(paths, 'wall._renderVersion is ADR-0319 class 2 and must never be excluded')
      .toContain('wall.u-wall-1._renderVersion');
    expect(paths, 'metadata.version is ADR-0319 class 2 and must never be excluded')
      .toContain('wall.u-wall-1.metadata.version');
    // class 3 — MUST be excluded, by name, and counted.
    expect(paths).not.toContain('wall.u-wall-1.metadata.modifiedAt');
    expect(paths).not.toContain('wall.u-wall-1.metadata.createdAt');
    expect(d.toleratedCount, 'the excluded count must be reported, never silent').toBe(2);
  });

  it('FALSIFIABILITY — the round-trip comparator goes RED when the expected state is wrong', async () => {
    // Real change, real undo, then a MUTATED expectation must be rejected.
    const A = captureState(world);
    const d = await world.dispatch('roof.update', { id: 'u-roof-1', updates: { thickness: 0.55 } });
    expect(d.ok).toBe(true);
    const B = captureState(world);
    world.cm.undo();
    const afterUndo = captureState(world);
    const clean = diffState(A, afterUndo);

    const tamperedA: StateCapture = JSON.parse(JSON.stringify(A));
    (tamperedA['roof'].records['u-roof-1'] as { thickness?: unknown }).thickness = 9.99; // never true
    const red = diffState(tamperedA, afterUndo);

    console.log('[FALSIFY H2] undo-vs-A divergences=' + clean.divergences.length +
      ' | undo-vs-TAMPERED-A divergences=' + red.divergences.length +
      ' first=' + JSON.stringify(red.divergences[0]));
    expect(red.divergences.length).toBeGreaterThan(0);
    expect(JSON.stringify(red.divergences)).toContain('thickness');
    // restore B; byte-identity after redo is already reported per-case above
    // (redo re-stamps metadata.modifiedAt), so here it is logged, not asserted.
    world.cm.redo();
    console.log('[FALSIFY H2] redo-vs-B divergences=' + diffState(B, captureState(world)).divergences.length);
  });

  // ─── CE-04 — the UNIFIED undo path (performUndo/performRedo) ───────────────
  //
  // Every CASES row above drives `cm.undo()` DIRECTLY — the legacy stack. The
  // production entry point since C03 §4.6 U-5 is `performUndo()` /
  // `performRedo()` in apps/editor/src/engine/undo/performUndoRedo.ts (HUD
  // button, Ctrl+Z, BimService, ContextualEditBar all route through it), and
  // until this block NOTHING certification-grade executed it: the 26/26
  // performUndoRedo/undoGestureOrdering unit suites run against stub stores
  // (evidence, not certification — C70 §0.1). These two arms drive the REAL
  // exported functions against THIS seeded world and grade the result with the
  // SAME whole-store comparator (diffState + isAdr0319Class3) as every row
  // above — no second, softer comparator.
  //
  //   arm 1 — the COMMANDMANAGER leg of the unified router: a legacy-owned verb
  //           (roof.update) undone/redone through performUndo()/performRedo().
  //   arm 2 — the RING-BUFFER leg: a REAL RingBufferUndoStack is installed on
  //           the bus (production wiring — CommandBus.setRingBuffer), the REAL
  //           wall.updateBaseline handler emits its production PatchPair
  //           (_recordUndo: true, §FIX-WALL-MOVE-UNDO-CAPTURE L-49), and
  //           performUndo() must route it to the ring applicator, apply the
  //           inverse patch to the AUTHORITATIVE wallStore, and shadow-drop the
  //           dual-dispatch cm twin (U-8).
  //
  // CONTROLS, EXECUTED EVERY RUN (C70 §7, both directions):
  //   • POSITIVE per arm: diffState(A, B) must show ≥1 divergence — a comparator
  //     that cannot see the forward mutation certifies nothing.
  //   • NEGATIVE (outcome honesty): with BOTH stacks detached, performUndo()
  //     must answer 'nothing-to-undo' — never 'undone' — proving the U-4 outcome
  //     value the arms assert on is load-bearing, not a constant.
  //   • RING-ARMED control: the same verb WITHOUT _recordUndo must leave the
  //     real ring buffer empty (empty-patch records are skipped, §U-B2/§U-B5),
  //     proving the "ring armed" floor in arm 2 can tell the two apart.
  //
  // NOT MEASURED HERE, NAMED: cross-stack chronological ordering and the
  // gesture-twin predicate (§UNDO-CROSS-STACK-ORDER / §UNDO-GESTURE-ID) are
  // pinned by the 26/26 unit suites, not re-certified by these arms; the
  // stranded-entry path is asserted only via the negative control.
  //
  // FIRST READING (2026-08-14): arm 1 PROVEN both directions. Arm 2 routes
  // correctly and restores authored geometry byte-exactly, but its first
  // execution MEASURED a real ADR-0319 §2 defect — the ring-leg apply ratchets
  // class-2 counters and drops _sourceBaseLine — declared and pinned as
  // §CE04-RING-PIN inside the arm (exact values, owner, exit condition), NOT
  // normalised into the comparator's tolerance lists, which are untouched.
  describe('CE-04 — UNIFIED path: performUndo()/performRedo() vs authoritative state', () => {
    let performUndo: () => { status: string; path?: string; ids?: readonly string[] };
    let performRedo: () => { status: string; path?: string };

    beforeAll(async () => {
      const mod = await import('../../../../apps/editor/src/engine/undo/performUndoRedo');
      performUndo = mod.performUndo as never;
      performRedo = mod.performRedo as never;
      // performUndoRedo reads globalThis.commandManager (initUI parity) and
      // window.runtime.bus.ringBuffer. The world set window.commandManager;
      // vitest's happy-dom global is NOT the window object, so mirror it.
      (globalThis as Record<string, unknown>).commandManager = world.cm;
    });

    it('arm 1 — legacy-owned verb (roof.update) through the UNIFIED entry point', async () => {
      const A = captureState(world);
      const d = await world.dispatch('roof.update', { id: 'u-roof-1', updates: { thickness: 0.61 } });
      const B = captureState(world);
      const forward = diffState(A, B);

      // POSITIVE control — the comparator must see the forward mutation.
      const stateVerdict = d.ok && forward.divergences.length > 0
        ? `PROVEN — authoritative state moved: ${forward.divergences.slice(0, 4).map((x) => x.path).join(', ')}`
        : `FAIL — dispatch ok=${d.ok} yet forward divergences=${forward.divergences.length} — the arm cannot see its own mutation and refuses to grade the undo`;

      // Watched RED before this green was accepted (C70 §5.6): with this call
      // replaced by a spoofed {status:'undone'} outcome (an undo that never
      // ran), the comparator reported roof.u-roof-1.thickness expected 0.55 got
      // 0.61 on 2026-08-14 — the arm cannot be satisfied by the outcome value
      // alone.
      const out = performUndo();
      const afterUndo = captureState(world);
      const undoDiff = diffState(A, afterUndo, isAdr0319Class3);
      const undoVerdict = out.status === 'undone' && undoDiff.divergences.length === 0 && undoDiff.misconfigured.length === 0
        ? `PROVEN — performUndo() answered {status:'undone', path:'${out.path}'} and authoritative state ≡ State A (deep, whole-store${excl(undoDiff.toleratedCount)}) — the UNIFIED entry point, not cm.undo()`
        : `FAIL — performUndo() answered {status:'${out.status}', path:'${String(out.path)}'} with ${undoDiff.divergences.length} divergence(s) from State A: ` +
          undoDiff.divergences.slice(0, 4).map((x) => `${x.path}: expected ${JSON.stringify(x.expected)} got ${JSON.stringify(x.actual)}`).join(' | ');

      const rout = performRedo();
      const afterRedo = captureState(world);
      const redoDiff = diffState(B, afterRedo, isAdr0319Class3);
      const redoVerdict = rout.status === 'redone' && redoDiff.divergences.length === 0 && redoDiff.misconfigured.length === 0
        ? `PROVEN — performRedo() answered {status:'redone', path:'${rout.path}'} and authoritative state ≡ State B (deep, whole-store${excl(redoDiff.toleratedCount)})`
        : `FAIL — performRedo() answered {status:'${rout.status}'} with ${redoDiff.divergences.length} divergence(s) from State B`;

      // NEGATIVE control (outcome honesty) — detach BOTH stacks; the answer must
      // be 'nothing-to-undo', never 'undone'. Restored in finally.
      let negativeOk = false;
      const savedCm = (globalThis as Record<string, unknown>).commandManager;
      const savedRuntime = (window as unknown as Record<string, unknown>).runtime;
      try {
        (globalThis as Record<string, unknown>).commandManager = undefined;
        (window as unknown as Record<string, unknown>).runtime = undefined;
        negativeOk = performUndo().status === 'nothing-to-undo';
      } finally {
        (globalThis as Record<string, unknown>).commandManager = savedCm;
        (window as unknown as Record<string, unknown>).runtime = savedRuntime;
      }
      const controlNote = negativeOk
        ? 'NEGATIVE CONTROL fired: with both stacks detached performUndo() answered nothing-to-undo, so the undone answer above is a measurement, not a constant'
        : 'NEGATIVE CONTROL FAILED: performUndo() with both stacks detached did NOT answer nothing-to-undo';

      const row = finishRow({
        capability: 'unified.performUndo (commandManager leg)',
        intent: 'a legacy-owned mutation is undone/redone through the UNIFIED performUndo()/performRedo() entry point (CE-04)',
        command: 'roof.update → performUndo() → performRedo()',
        authoritativeState: stateVerdict,
        geometry: 'UNPROVEN — no fragment builders headless; meshes never built',
        persistence: 'n/a — measured by Harness 1',
        undo: negativeOk ? undoVerdict : `FAIL — ${controlNote}`,
        redo: redoVerdict,
        collaboration: 'UNPROVEN — no transport exists (L-391 leg C)',
        report: `PROVEN — performUndo/performRedo returned typed U-4 outcomes read by this arm (C03 §4.6); ${controlNote}`,
        evidence: ['dispatch=OK', `undoOutcome=${out.status}:${String(out.path)}`, `redoOutcome=${rout.status}:${String(rout.path)}`, `negativeControlFired=${negativeOk}`, `A→B divergences=${forward.divergences.length}`],
      });
      rows.push(row);
      console.log(`[H2 CE-04 arm1] ${row.status}\n  state: ${stateVerdict}\n  undo:  ${undoVerdict}\n  redo:  ${redoVerdict}\n  ${controlNote}`);
      expect.soft(stateVerdict, 'CE-04 arm 1 state').toMatch(/^PROVEN/);
      expect.soft(undoVerdict, 'CE-04 arm 1 undo').toMatch(/^PROVEN/);
      expect.soft(redoVerdict, 'CE-04 arm 1 redo').toMatch(/^PROVEN/);
      expect.soft(negativeOk, 'CE-04 negative control').toBe(true);
    });

    it('arm 2 — RING-BUFFER leg: real RingBufferUndoStack + real wall.updateBaseline PatchPair', async () => {
      const { RingBufferUndoStack } = await import('@pryzm/runtime-undo-stack');
      const standIn = world.bus.ringBuffer; // the recording {push} stand-in — restored below
      const realRing = new RingBufferUndoStack();
      (world.bus as unknown as { setRingBuffer(rb: unknown): void }).setRingBuffer(realRing);
      try {
        const wall = world.stores.wallStore.getById('u-wall-1');
        expect(wall, 'u-wall-1 absent — arm MISCONFIGURED').toBeTruthy();
        const bl = JSON.parse(JSON.stringify(wall.baseLine)) as Array<{ x: number; y?: number; z: number }>;
        const prev = bl.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z }));
        const moved = bl.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z + 1 }));

        // RING-ARMED control — the SAME verb WITHOUT _recordUndo must not arm
        // the ring (empty-patch records are skipped, §U-B2/§U-B5): proves the
        // "ring armed" floor below distinguishes the two shapes. Undone via the
        // unified entry (commandManager leg) to restore state.
        const d0 = await world.dispatch('wall.updateBaseline', { wallId: 'u-wall-1', newBaseLine: moved, prevBaseLine: prev });
        const ringAfterPlain = realRing.canUndo();
        const undoPlain = performUndo();
        const controlOk = d0.ok && ringAfterPlain === false && undoPlain.status === 'undone';

        const A = captureState(world);
        const historyBefore = world.cm.getHistory().length;
        const d1 = await world.dispatch('wall.updateBaseline', {
          wallId: 'u-wall-1', newBaseLine: moved, prevBaseLine: prev, _recordUndo: true,
        });
        const B = captureState(world);
        const forward = diffState(A, B);
        const ringArmed = realRing.canUndo(); // FLOOR — without this the arm would certify the cm leg twice and call it the ring
        const cmArmed = world.cm.getHistory().length - historyBefore;

        // Watched RED before this green was accepted (C70 §5.6): with this call
        // replaced by a spoofed {status:'undone', path:'ring-buffer'} outcome,
        // the comparator reported wall.u-wall-1.baseLine.0.z expected 0 got 1
        // (+4 more) on 2026-08-14 — the path assertion alone cannot green this
        // arm; the whole-store comparator must also read ≡ State A.
        const out = performUndo();
        const afterUndo = captureState(world);
        const undoDiff = diffState(A, afterUndo, isAdr0319Class3);
        const droppedTwin = world.cm.getHistory().length; // informational (shadow-drop U-8)

        const rout = performRedo();
        const afterRedo = captureState(world);
        const redoDiff = diffState(B, afterRedo, isAdr0319Class3);

        const floorsMet = d1.ok && forward.divergences.length > 0 && ringArmed && controlOk;
        const stateVerdict = floorsMet
          ? `PROVEN — authoritative state moved (${forward.divergences.slice(0, 3).map((x) => x.path).join(', ')}); REAL ring buffer armed by the production PatchPair (affectedStores=['wall']); control: the same verb without _recordUndo armed NOTHING on the ring`
          : `FAIL — subject not established: dispatch ok=${d1.ok}, forward divergences=${forward.divergences.length}, ringArmed=${ringArmed}, plainDispatchControl=${controlOk} — a ring-leg verdict without an armed ring is the cm leg wearing a costume; refused`;

        // §CE04-RING-PIN — MEASURED 2026-08-14, the FIRST execution of this arm.
        // The ring leg ROUTES correctly and restores the authored geometry
        // byte-exactly (baseLine is never in the divergence set), but the
        // inverse-patch apply goes through `wallStore.update`, which RATCHETS
        // the ADR-0319 class-2 counters and drops `_sourceBaseLine` — three
        // divergences the LEGACY leg does not produce (its command undo
        // restores the whole prior record). ADR-0319 §2 is explicit that a
        // counter moved across an undo is a REAL DEFECT ("may NOT differ
        // across an undo"), so this is a FINDING, pinned here with its exact
        // measured values rather than normalised away:
        //   undo vs A: wall.u-wall-1._renderVersion 6→7 (+1)
        //              wall.u-wall-1.metadata.version 4→6 (+2: forward+undo)
        //   redo vs B: wall.u-wall-1.metadata.version (+2 again)
        //              wall.u-wall-1._sourceBaseLine (cleared by
        //              WallStore.update when baseLine changes without it)
        // OWNER: apps/editor elementUndoStoreAdapter / WallStore.update —
        // another track's territory; the harness measures, it does not fix.
        // EXIT CONDITION: the ring-leg apply restores class-2 counters and
        // _sourceBaseLine; the measured sets below read EMPTY, this arm prints
        // "PIN EXPIRED", and the pin is STRUCK in the commit that earns it.
        // FALSIFIABLE BOTH WAYS: any divergence OUTSIDE the pinned tails —
        // including any authored-geometry path — is a FAIL (regression beyond
        // the pin); an EMPTY set turns the cell PROVEN and demands the strike.
        const PINNED_UNDO_TAILS = ['_renderVersion', 'metadata.version'];
        const PINNED_REDO_TAILS = ['metadata.version', '_sourceBaseLine'];
        const tailOf = (path: string): string => path.replace(/^wall\.[^.]+\./, '');
        const classify = (
          divs: Array<{ path: string; expected: unknown; actual: unknown }>,
          pinnedTails: string[],
          which: 'undo' | 'redo',
        ): { kind: 'clean' | 'declared' | 'beyond'; text: string } => {
          const beyond = divs.filter((d) => !pinnedTails.includes(tailOf(d.path)));
          const detail = divs.map((d) => `${d.path}: expected ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`).join(' | ');
          if (divs.length === 0) {
            return { kind: 'clean', text: `PIN EXPIRED for ${which} — the ring leg now round-trips clean; STRIKE §CE04-RING-PIN's ${which} set in this commit` };
          }
          if (beyond.length > 0) {
            return { kind: 'beyond', text: `${beyond.length} divergence(s) BEYOND the §CE04-RING-PIN declared set: ${detail}` };
          }
          return { kind: 'declared', text: `authored geometry restored byte-exactly; ${divs.length} declared class-2/internal divergence(s), exactly the §CE04-RING-PIN set: ${detail}` };
        };

        const routedUndo = out.status === 'undone' && out.path === 'ring-buffer' && undoDiff.misconfigured.length === 0;
        const routedRedo = rout.status === 'redone' && rout.path === 'ring-buffer' && redoDiff.misconfigured.length === 0;
        const uc = classify(undoDiff.divergences as never, PINNED_UNDO_TAILS, 'undo');
        const rc = classify(redoDiff.divergences as never, PINNED_REDO_TAILS, 'redo');

        const undoVerdict = !routedUndo
          ? `FAIL — performUndo() answered {status:'${out.status}', path:'${String(out.path)}'} (expected ring-buffer${undoDiff.misconfigured.length > 0 ? `; misconfigured kinds [${undoDiff.misconfigured.join(',')}]` : ''})`
          : uc.kind === 'clean'
            ? `PROVEN — performUndo() routed to the RING BUFFER, applied the inverse patch to the AUTHORITATIVE wallStore, and state ≡ State A (deep, whole-store${excl(undoDiff.toleratedCount)}); cm twin shadow-dropped (U-8, history ${historyBefore + cmArmed}→${droppedTwin}); ${uc.text}`
            : uc.kind === 'beyond'
              ? `FAIL — ring-buffer undo: ${uc.text}`
              : `MEASURED-DIVERGENCE (declared §CE04-RING-PIN, ADR-0319 §2 defect, NOT a pass) — performUndo() routed to the RING BUFFER and ${uc.text}; cm twin shadow-dropped (U-8, history ${historyBefore + cmArmed}→${droppedTwin}); owner: elementUndoStoreAdapter/WallStore.update; exit condition: counters restored, pin struck`;
        const redoVerdict = !routedRedo
          ? `FAIL — performRedo() answered {status:'${rout.status}', path:'${String(rout.path)}'} (expected ring-buffer)`
          : rc.kind === 'clean'
            ? `PROVEN — performRedo() routed to the RING BUFFER and state ≡ State B (deep, whole-store${excl(redoDiff.toleratedCount)}); ${rc.text}`
            : rc.kind === 'beyond'
              ? `FAIL — ring-buffer redo: ${rc.text}`
              : `MEASURED-DIVERGENCE (declared §CE04-RING-PIN, ADR-0319 §2 defect, NOT a pass) — performRedo() routed to the RING BUFFER and ${rc.text}`;

        const row = finishRow({
          capability: 'unified.performUndo (ring-buffer leg)',
          intent: 'a bus-recorded mutation (production PatchPair) is undone/redone by the UNIFIED router via the ring applicator against the authoritative store (CE-04)',
          command: 'wall.updateBaseline{_recordUndo} → RingBufferUndoStack → performUndo() → performRedo()',
          authoritativeState: stateVerdict,
          geometry: 'UNPROVEN — no fragment builders headless; meshes never built',
          persistence: 'n/a — measured by Harness 1',
          undo: undoVerdict,
          redo: redoVerdict,
          collaboration: 'UNPROVEN — no transport exists (L-391 leg C)',
          report: `PROVEN — typed U-4 outcomes read (undo=${out.status}:${String(out.path)}, redo=${rout.status}:${String(rout.path)}); ring-armed control executed (plain dispatch armed nothing)`,
          evidence: ['dispatch=OK', `entriesAdded=${cmArmed}`, `ringArmed=${ringArmed}`, `undoOutcome=${out.status}:${String(out.path)}`, `redoOutcome=${rout.status}:${String(rout.path)}`, `plainDispatchRingStayedEmpty=${ringAfterPlain === false}`, `ringUndoDivergences=${undoDiff.divergences.length}`, `ringRedoDivergences=${redoDiff.divergences.length}`, `pinState=${uc.kind}/${rc.kind}`],
        });
        rows.push(row);
        console.log(`[H2 CE-04 arm2] ${row.status}\n  state: ${stateVerdict}\n  undo:  ${undoVerdict}\n  redo:  ${redoVerdict}`);
        // PROVEN or the DECLARED §CE04-RING-PIN divergence are the two honest
        // states; anything else — wrong routing, geometry loss, divergence
        // beyond the pin — is a failure. A fixed defect flips uc/rc to 'clean',
        // which is PROVEN plus a loud instruction to strike the pin.
        expect.soft(stateVerdict, 'CE-04 arm 2 state').toMatch(/^PROVEN/);
        expect.soft(undoVerdict, 'CE-04 arm 2 undo').not.toMatch(/^FAIL/);
        expect.soft(redoVerdict, 'CE-04 arm 2 redo').not.toMatch(/^FAIL/);
      } finally {
        (world.bus as unknown as { setRingBuffer(rb: unknown): void }).setRingBuffer(standIn as never);
      }
    });
  });
});

afterAll(() => {
  const p = writeResults('undoredo.json', {
    harness: 'H2-undoredo', generatedAt: new Date().toISOString(),
    seedLog, registrationFailures: world?.registrationFailures ?? [],
    rows,
  });
  console.log('[H2] results written: ' + p);
});
