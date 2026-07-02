// @vitest-environment happy-dom
//
// §G9-PERSIST — Annotation persistence lifecycle suite (V1 launch readiness, audit §3.6 / G9).
//
// Covers the PRYZM-native dimension/annotation path that the OBC annotation
// classes do NOT provide in this build:
//   1. persistAnnotation() writes a full element to the subsystem annotationStore
//      via the authoritative CreateAnnotationCommand path (window.commandManager).
//   2. create → render-store read (getByView) → update → delete lifecycle.
//   3. undo of create / update / delete restores prior state.
//   4. serialize / deserialize round-trip (persistence + plan re-projection source).
//
// The subsystem `annotationStore` singleton is the store AnnotationRenderLayer
// reads and ProjectSerializer persists, so writing to it == the annotation
// actually renders and survives save/load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '../src/subsystem/AnnotationStore.js';
import { makeAnnotationElement } from '../src/subsystem/AnnotationTypes.js';
import { makePointRef } from '../src/subsystem/AnnotationReference.js';
import { CreateAnnotationCommand } from '../src/commands/CreateAnnotationCommand.js';
import { UpdateAnnotationCommand } from '../src/commands/UpdateAnnotationCommand.js';
import { DeleteAnnotationCommand } from '../src/commands/DeleteAnnotationCommand.js';
import { persistAnnotation } from '../src/tools/persistAnnotation.js';

// A CommandContext-shaped bag pointing at our fresh store, plus a tiny
// command manager that runs canExecute + execute + tracks history for undo.
function makeEnv() {
  const store = new AnnotationStore();
  const ctx = { stores: { annotationStore: store } } as any;
  const history: any[] = [];
  const commandManager = {
    execute(cmd: any) {
      const v = cmd.canExecute(ctx);
      if (!v.ok) throw new Error(v.reason);
      const r = cmd.execute(ctx);
      history.push(cmd);
      return r;
    },
    undoLast() {
      const cmd = history.pop();
      return cmd ? cmd.undo(ctx) : null;
    },
  };
  return { store, ctx, commandManager };
}

function makeDim(viewId = 'view-1') {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 5, y: 0, z: 0 };
  return makeAnnotationElement(
    'dim-1',
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

describe('persistAnnotation — §G9-PERSIST helper', () => {
  const w = () => (globalThis as any).window as any;
  afterEach(() => { if (w()) delete w().commandManager; vi.restoreAllMocks(); });

  it('dispatches CreateAnnotationCommand through window.commandManager', () => {
    const { store, commandManager } = makeEnv();
    w().commandManager = commandManager;
    const ok = persistAnnotation(makeDim());
    expect(ok).toBe(true);
    expect(store.count).toBe(1);
    expect(store.getById('dim-1')?.type).toBe('linear-dim');
  });

  it('the persisted element carries full geometry (modelPoints + offset)', () => {
    const { store, commandManager } = makeEnv();
    w().commandManager = commandManager;
    persistAnnotation(makeDim());
    const geo = store.getById('dim-1')?.geometry2D as any;
    expect(geo.modelPoints).toHaveLength(2);
    expect(geo.offset).toBe(0.5);
  });

  it('no-ops safely (returns false) when window.commandManager is absent', () => {
    delete w().commandManager;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(persistAnnotation(makeDim())).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('the persisted dimension is visible in the view the render layer reads', () => {
    const { store, commandManager } = makeEnv();
    w().commandManager = commandManager;
    persistAnnotation(makeDim('plan-A'));
    // AnnotationRenderLayer draws store.getByView(activeViewId).
    expect(store.getByView('plan-A').map((a) => a.id)).toEqual(['dim-1']);
    expect(store.getByView('other')).toHaveLength(0);
  });
});

describe('annotation create / update / delete lifecycle (native path)', () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => { env = makeEnv(); });

  it('create then update patches the stored element', () => {
    env.commandManager.execute(new CreateAnnotationCommand(makeDim()));
    env.commandManager.execute(
      new UpdateAnnotationCommand('dim-1', { parameters: { unit: 'cm', textOverride: '5.0 m' } as any }),
    );
    const p = env.store.getById('dim-1')?.parameters as any;
    expect(p.unit).toBe('cm');
    expect(p.textOverride).toBe('5.0 m');
  });

  it('delete removes the element from the render store', () => {
    env.commandManager.execute(new CreateAnnotationCommand(makeDim()));
    env.commandManager.execute(new DeleteAnnotationCommand('dim-1'));
    expect(env.store.has('dim-1')).toBe(false);
  });

  it('undo of create removes it; undo of delete restores it', () => {
    env.commandManager.execute(new CreateAnnotationCommand(makeDim()));
    env.commandManager.execute(new DeleteAnnotationCommand('dim-1'));
    expect(env.store.has('dim-1')).toBe(false);
    env.commandManager.undoLast(); // undo delete
    expect(env.store.has('dim-1')).toBe(true);
    env.commandManager.undoLast(); // undo create
    expect(env.store.has('dim-1')).toBe(false);
  });

  it('undo of update restores the prior parameters', () => {
    env.commandManager.execute(new CreateAnnotationCommand(makeDim()));
    env.commandManager.execute(
      new UpdateAnnotationCommand('dim-1', { parameters: { unit: 'cm' } as any }),
    );
    env.commandManager.undoLast();
    expect((env.store.getById('dim-1')?.parameters as any).unit).toBe('mm');
  });
});

describe('annotation persistence round-trip (save / load)', () => {
  it('serialize → deserialize preserves the placed dimension', () => {
    const { store, commandManager } = makeEnv();
    const win = (globalThis as any).window as any;
    win.commandManager = commandManager;
    persistAnnotation(makeDim('plan-A'));
    const snap = store.serialize();
    expect(snap.annotations).toHaveLength(1);

    const restored = new AnnotationStore();
    restored.deserialize(snap);
    expect(restored.getByView('plan-A').map((a) => a.id)).toEqual(['dim-1']);
    delete win.commandManager;
  });
});
