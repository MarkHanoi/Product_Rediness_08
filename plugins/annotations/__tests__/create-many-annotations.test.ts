// @vitest-environment happy-dom
//
// §FIX-AUTODIM-SUBSYSTEM-STORE-SINK (L-145, ADR-0119) — CreateManyAnnotationsCommand.
//
// The AutoDimension executor emits a whole SET of `'linear-dim'` AnnotationElements
// and must land ALL of them in the SUBSYSTEM `annotationStore` — the exact store
// `PlanViewAnnotationRenderer.getByView(viewId)` reads — as ONE undoable unit.
// These tests assert:
//   1. execute() adds every element to the render store (getByView returns them).
//   2. the full geometry (modelPoints + offset + references) survives (not dropped
//      as the bus `annotation.create` verb did).
//   3. a SINGLE undo removes the whole SET.
//   4. re-running (redo) never double-adds ids already present.

import { describe, expect, it } from 'vitest';
import { AnnotationStore } from '../src/subsystem/AnnotationStore.js';
import { makeAnnotationElement } from '../src/subsystem/AnnotationTypes.js';
import { makePointRef } from '../src/subsystem/AnnotationReference.js';
import { CreateManyAnnotationsCommand } from '../src/commands/CreateManyAnnotationsCommand.js';

function makeDim(id: string, viewId: string, ax: number, bx: number) {
  const a = { x: ax, y: 0, z: 0 };
  const b = { x: bx, y: 0, z: 0 };
  return makeAnnotationElement(
    id,
    'linear-dim',
    viewId,
    [
      { ...makePointRef(a), cachedPosition: a },
      { ...makePointRef(b), cachedPosition: b },
    ],
    { modelPoints: [a, b], offset: 0.5 },
    { unit: 'mm' },
  );
}

function makeEnv() {
  const store = new AnnotationStore();
  // viewDefinitionStore.has() → true so canExecute's view guard passes.
  const ctx = { stores: { annotationStore: store, viewDefinitionStore: { has: () => true } } } as any;
  return { store, ctx };
}

describe('CreateManyAnnotationsCommand — §FIX-AUTODIM-SUBSYSTEM-STORE-SINK', () => {
  it('adds every element to the render store the plan reads (getByView)', () => {
    const { store, ctx } = makeEnv();
    const set = [
      makeDim('annotation_A', 'plan-A', 0, 6),
      makeDim('annotation_B', 'plan-A', 0, 3),
      makeDim('annotation_C', 'plan-A', 3, 6),
    ];
    const cmd = new CreateManyAnnotationsCommand(set);
    expect(cmd.canExecute(ctx).ok).toBe(true);
    cmd.execute(ctx);

    // PlanViewAnnotationRenderer.render() reads exactly this query.
    const inView = store.getByView('plan-A');
    expect(inView.map((a) => a.id).sort()).toEqual(['annotation_A', 'annotation_B', 'annotation_C']);
    expect(inView.every((a) => a.type === 'linear-dim')).toBe(true);
  });

  it('preserves full dimension geometry (modelPoints + offset + 2 refs)', () => {
    const { store, ctx } = makeEnv();
    new CreateManyAnnotationsCommand([makeDim('annotation_A', 'plan-A', 0, 6)]).execute(ctx);
    const el = store.getById('annotation_A')!;
    expect(el.references).toHaveLength(2);
    expect(el.geometry2D.modelPoints).toHaveLength(2);
    expect(el.geometry2D.modelPoints[1]).toMatchObject({ x: 6, z: 0 });
    expect(el.geometry2D.offset).toBe(0.5);
  });

  it('is ONE undo — a single undo() removes the whole SET', () => {
    const { store, ctx } = makeEnv();
    const cmd = new CreateManyAnnotationsCommand([
      makeDim('annotation_A', 'plan-A', 0, 6),
      makeDim('annotation_B', 'plan-A', 0, 3),
    ]);
    cmd.execute(ctx);
    expect(store.count).toBe(2);
    cmd.undo(ctx);
    expect(store.count).toBe(0);
    expect(store.getByView('plan-A')).toHaveLength(0);
  });

  it('rejects an empty set and a view-less element', () => {
    const { ctx } = makeEnv();
    expect(new CreateManyAnnotationsCommand([]).canExecute(ctx).ok).toBe(false);
    const noView = makeDim('annotation_A', '', 0, 6);
    expect(new CreateManyAnnotationsCommand([noView]).canExecute(ctx).ok).toBe(false);
  });

  it('never double-adds ids already present (idempotent redo)', () => {
    const { store, ctx } = makeEnv();
    const cmd = new CreateManyAnnotationsCommand([makeDim('annotation_A', 'plan-A', 0, 6)]);
    cmd.execute(ctx);
    cmd.execute(ctx); // redo of the same command instance
    expect(store.count).toBe(1);
  });
});
