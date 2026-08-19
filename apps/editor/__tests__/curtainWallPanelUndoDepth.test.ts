// @vitest-environment happy-dom
//
// §CW-U-5n — C87 §7's NAMED-AND-MISSING CONTROL, now built (lane CW1, 2026-08-19).
//
// ─── WHAT C87 ASKED FOR, VERBATIM ─────────────────────────────────────────────
// C87 §7 CW-U-5n: "`curtainWallPanelUndoDepth.test.ts` (C84 §5, named and NOT YET
// EXISTING): feed the adapter `{op:'replace', path:[id,'panels','length'], value:0}`
// and assert `panels` is still an array. It MUST be watched failing against HEAD
// before the fix. Add the redo twin: `{op:'add', path:[id,'panels',3], value:{…}}`."
//
// ⚠ THE "WATCHED RED AGAINST HEAD" INSTRUCTION CANNOT BE OBEYED AS WRITTEN, AND
//    SAYING SO IS THE HONEST ANSWER RATHER THAN SILENTLY WEAKENING THE TEST.
//    The fix landed BEFORE the control did — `3689915d` ("undo wrote a NUMBER into
//    the panels array — a depth-3 patch was flattened to a top-level write") replaced
//    `const field = p.path[1]` / `store.update(id, {[field]: p.value})` with
//    `_resolveFieldValue` + `_applyAtPath` + an explicit §EI-7b refusal, and
//    `81e1e9c0` (L-977) then added the per-store merge-vs-replace declaration.
//    So HEAD is already green and there is no red to watch. What this file can
//    still do — and does — is pin the post-fix behaviour against the REAL store so
//    the defect cannot come back, and pin the working case C87's non-regression
//    note (L-955 discipline) says must not move.
//
// ─── WHAT IS REAL HERE ────────────────────────────────────────────────────────
//   REAL — `elementUndoStoreAdapter` (the shipping applyPatch surface) and
//          `CurtainWallStore` from `@pryzm/geometry-curtain-wall`: the class
//          `initBuilders.ts:328` constructs and assigns to `window.curtainWallStore`,
//          which `performUndoRedo.ts`'s `buildUndoStoreMap()` resolves `'curtainwall'`
//          to, and which `CurtainWallBuilder`, the plan projector, `ProjectSerializer`
//          and `CurtainWallReader` (IFC) all read. NOT a hand-written Map.
//          §FAKE-CANNOT-FALSIFY-THE-HEADER: the reason the original corruption
//          survived three years of green tests is that its siblings assert against
//          fakes whose `update` merges and validates nothing.
//   NOT RUN — a browser session. The patch shapes below are Immer's, quoted from
//          the handler that mints each one.
//
// ─── THE MEASUREMENT THIS FILE RECORDS (2026-08-19) ───────────────────────────
// The legacy `CurtainWallData` (`CurtainWallTypes.ts:18-64`) has NO `panels` field —
// panels live in `CurtainPanelStore`, keyed by cell. So the post-fix adapter does not
// merely "not corrupt" a `panels` patch: it REFUSES it, because there is no anchor in
// the legacy record to apply the sub-path inside. That is the C84 §1 answer
// ("a refusal is a correct answer; a silently-wrong record is not") and it is a
// STRICTLY DIFFERENT outcome from "the array survived" — which is what CW-U-5n's
// wording assumed. Recorded rather than glossed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import type { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import {
  elementUndoStoreAdapter,
  __resetUndoRestoreSnapshots,
  type UndoPatchOp,
} from '../src/engine/undo/elementUndoStoreAdapter';

const CW_ID = 'cw-under-test';

function seed(store: CurtainWallStore): void {
  store.add({
    id: CW_ID,
    type: 'curtain-wall',
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 3,
    baseOffset: 0,
    gridXSpacing: 1.5,
    gridYSpacing: 1.5,
    mullionSize: 0.05,
    panelThickness: 0.05,
  } as unknown as CurtainWallData);
}

function apply(store: CurtainWallStore, ...ops: UndoPatchOp[]): void {
  elementUndoStoreAdapter(store as never, 'curtainwall').applyPatch(ops);
}

describe('§CW-U-5n — curtain-wall deep undo patches never flatten into a top-level write', () => {
  let store: CurtainWallStore;

  beforeEach(() => {
    __resetUndoRestoreSnapshots();
    store = new CurtainWallStore();
    seed(store);
  });

  // ── ARM 1: the UNDO direction C84 EI-7b names ───────────────────────────────
  // `AddPanel.ts:92-106` does `c.panels.push({…})` on a `Record<id, CurtainWallData>`,
  // so Immer's inverse for the append is ONE length patch. Pre-`3689915d` this
  // executed `update(CW_ID, { panels: 3 })` and the field became a NUMBER.
  it('ARM 1 — a [id,"panels","length"] inverse never writes a number onto the record', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(store, { op: 'replace', path: [CW_ID, 'panels', 'length'], value: 3 });

    const rec = store.get(CW_ID) as unknown as Record<string, unknown>;
    expect(rec).toBeDefined();
    expect(typeof rec.panels).not.toBe('number');
    // The legacy record has no `panels` anchor, so the correct outcome is a REFUSAL
    // with the record untouched — not a silently-invented array.
    expect(rec.panels).toBeUndefined();
    expect(err.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/§EI-7b REFUSED/);
    // …and nothing else on the record moved.
    expect(rec.gridXSpacing).toBe(1.5);
    expect(rec.height).toBe(3);
    err.mockRestore();
  });

  // ── ARM 2: the REDO twin, recorded in C87 §7 for the first time ─────────────
  it('ARM 2 — a [id,"panels",N] forward never writes an object onto the record', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(store, {
      op: 'add',
      path: [CW_ID, 'panels', 3],
      value: { id: 'p3', row: 0, col: 3, kind: 'door', rotation: 0 },
    });

    const rec = store.get(CW_ID) as unknown as Record<string, unknown>;
    expect(rec.panels).toBeUndefined();
    expect(err.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/§EI-7b REFUSED/);
    err.mockRestore();
  });

  // ── ARM 3: `curtain-wall.move` — the row C87 §7 says writes a SCALAR ────────
  // `MoveCurtainWall.ts:48-50` mutates `baseLine[i].x` in place, so the patch path
  // is FOUR segments. `baseLine` DOES exist on the legacy record, so unlike ARMs
  // 1-2 this one must APPLY — structurally, at the right leaf — not refuse.
  it('ARM 3 — a 4-segment [id,"baseLine",0,"x"] patch lands on the point, not on baseLine', () => {
    apply(store, { op: 'replace', path: [CW_ID, 'baseLine', 0, 'x'], value: -2 });

    const rec = store.get(CW_ID) as unknown as { baseLine: Array<{ x: number; y: number; z: number }> };
    expect(Array.isArray(rec.baseLine)).toBe(true);
    expect(rec.baseLine).toHaveLength(2);
    expect(rec.baseLine[0]).toEqual({ x: -2, y: 0, z: 0 });
    // The untouched endpoint must not have been rebuilt from a default.
    expect(rec.baseLine[1]).toEqual({ x: 6, y: 0, z: 0 });
  });

  // ── ARM 4: THE NON-REGRESSION PIN C87 §11 DEMANDS BEFORE ANY ADAPTER EDIT ───
  // "The 2-segment `gridSystem` path (addGridLine/removeGridLine) WORKS TODAY.
  //  Any change to elementUndoStoreAdapter MUST be proven not to move it."
  it('ARM 4 — the working 2-segment gridSystem revert still lands on the legacy field', () => {
    const grid = {
      uLines: [{ id: 'u0', t: 0 }, { id: 'u1', t: 0.5 }, { id: 'u2', t: 1 }],
      vLines: [{ id: 'v0', t: 0 }, { id: 'v1', t: 1 }],
    };
    apply(store, { op: 'replace', path: [CW_ID, 'gridSystem'], value: grid });

    const rec = store.get(CW_ID) as unknown as { gridSystem?: typeof grid };
    expect(rec.gridSystem?.uLines).toHaveLength(3);
    expect(rec.gridSystem?.uLines[1]).toEqual({ id: 'u1', t: 0.5 });

    // …and a 2-segment REMOVE clears it again without touching its siblings.
    apply(store, { op: 'remove', path: [CW_ID, 'gridSystem'] });
    const after = store.get(CW_ID) as unknown as Record<string, unknown>;
    expect(after.gridSystem).toBeUndefined();
    expect(after.gridXSpacing).toBe(1.5);
    expect(after.mullionSize).toBe(0.05);
  });

  // ── ARM 5: the declaration this family's write shape is chosen from ─────────
  // Re-derived from the REAL store, not read off `legacyStoreUpdateSemantics.ts`:
  // if `CurtainWallStore.update` ever became a REPLACE the way `SlabStore.update`
  // is (L-977), the one-key partial the adapter writes for a merge store would
  // annihilate the record — and this arm is what would catch it.
  it('ARM 5 — CurtainWallStore.update MERGES, which is what the adapter is declared against', () => {
    store.update(CW_ID, { height: 4.2 } as Partial<CurtainWallData>);
    const rec = store.get(CW_ID) as unknown as Record<string, unknown>;
    expect(rec.height).toBe(4.2);
    // A REPLACE store would have annihilated every key not in the partial.
    expect(rec.id).toBe(CW_ID);
    expect(rec.levelId).toBe('L0');
    expect(rec.gridXSpacing).toBe(1.5);
    expect(rec.baseLine).toEqual([{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }]);
  });
});
