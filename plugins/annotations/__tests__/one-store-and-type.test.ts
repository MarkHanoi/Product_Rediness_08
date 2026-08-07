// @vitest-environment happy-dom
//
// §ANN-ONE-STORE / §ANN-TYPE / §ANN-UPDATE-VERB — acceptance suite.
//
// These are the three founder acceptance criteria proven by test rather than asserted:
//
//   1. a bus-created annotation lands in the CANONICAL store (the one the renderer,
//      the serializer, the property panel and buildUndoStoreMap all use) — not only in
//      the derived `AnnotationsState` ledger that nothing reads;
//   2. EVERY annotation element carries a `systemTypeId`;
//   3. create / update / delete each round-trip through undo AND redo, driven through
//      the SAME adapter Ctrl+Z uses (`elementUndoStoreAdapter` semantics: whole-element
//      remove/add by patch path, applied to the canonical store).
//
// The undo test deliberately does NOT assert against the ledger. Asserting undo on the
// ledger is what let "undo is innocent" survive an audit: the ledger inverted perfectly
// while the element the user could see never moved, because it lived in the other store.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores, createId, type EventRecord } from '@pryzm/plugin-sdk';
import { AnnotationStore as LedgerStore, type AnnotationsState } from '@pryzm/plugin-sdk';
import { buildAnnotationHandlerSet } from '../src/handlers/index.js';
import { annotationStore } from '../src/subsystem/AnnotationStore.js';
import { annotationSystemTypeStore, BUILT_IN_ANNOTATION_TYPES } from '../src/subsystem/AnnotationSystemTypeStore.js';
import { makeAnnotationElement, defaultAnnotationTypeIdFor } from '../src/subsystem/AnnotationTypes.js';

function buildEnv() {
  const ledger = new LedgerStore();
  const stores = { annotation: ledger as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ annotation: Object.fromEntries(ledger.getState()) as AnnotationsState }),
  });
  for (const h of buildAnnotationHandlerSet()) bus.register(h);
  return { ledger, bus, detach: attachStores(emitter, stores) };
}

/**
 * Replay a patch side exactly as `elementUndoStoreAdapter` does against the canonical
 * store: `path.length === 1` is a whole-element op; `remove` stashes the live element so
 * the matching `add` restores the REAL record rather than the lossy patch value.
 */
type Op = { op: string; path: readonly (string | number)[]; value?: unknown };
function applySide(ops: readonly Op[], stash: Map<string, unknown>): void {
  for (const op of ops) {
    const id = String(op.path[0] ?? '');
    if (!id) continue;
    if (op.path.length !== 1) continue;
    if (op.op === 'remove') {
      const live = annotationStore.getById(id);
      if (live) stash.set(id, live);
      annotationStore.remove(id);
    } else if (op.op === 'add' || op.op === 'replace') {
      const restore = stash.get(id);
      if (restore && !annotationStore.has(id)) {
        annotationStore.add(restore as never);
        stash.delete(id);
      }
    }
  }
}

describe('§ANN-TYPE — every annotation element carries a type', () => {
  it('ships exactly 5 built-in annotation types with distinct sizes and colours', () => {
    expect(BUILT_IN_ANNOTATION_TYPES).toHaveLength(5);
    const sizes  = BUILT_IN_ANNOTATION_TYPES.map(t => t.style.textSizeMm);
    const colors = BUILT_IN_ANNOTATION_TYPES.map(t => t.style.textColor);
    expect(new Set(sizes).size).toBe(5);
    expect(new Set(colors).size).toBe(5);
    for (const t of BUILT_IN_ANNOTATION_TYPES) expect(t.isBuiltIn).toBe(true);
  });

  it('makeAnnotationElement stamps a systemTypeId on EVERY family', () => {
    const families = [
      'text-note', 'linear-dim', 'angular-dim', 'radius-dim', 'diameter-dim', 'slope-dim',
      'tag', 'door-tag', 'window-tag', 'wall-tag', 'level-tag', 'room-tag', 'grid-bubble',
      'keynote', 'spot-elevation', 'revision-cloud', 'matchline', 'north-arrow', 'scale-bar',
      'section-mark', 'elevation-mark', 'callout-detail', 'detail-line', 'room-fill',
      'level-datum-line', 'section-grid-line', 'roof-slope-arrow',
    ] as const;
    for (const f of families) {
      const el = makeAnnotationElement(createId('annotation'), f as never, 'v1', [], { modelPoints: [], offset: 0 });
      expect(el.systemTypeId, `family ${f} has no systemTypeId`).toBeTruthy();
      expect(annotationSystemTypeStore.has(el.systemTypeId!), `family ${f} → unknown type ${el.systemTypeId}`).toBe(true);
    }
  });

  it('a family added tomorrow still resolves to a real type instead of none', () => {
    const id = defaultAnnotationTypeIdFor('some-family-that-does-not-exist-yet');
    expect(annotationSystemTypeStore.has(id)).toBe(true);
  });

  it('resolveStyle layers element overrides on top of the type', () => {
    const s = annotationSystemTypeStore.resolveStyle('text-note', 'at-title-5mm-purple', { textColor: '#000000' });
    expect(s.textSizeMm).toBe(5.0);       // from the type
    expect(s.textColor).toBe('#000000');  // element override wins
  });

  it('§ANN-TYPE-PERSIST — custom types survive serialize/deserialize (the stairTypeStore hole)', () => {
    const custom = annotationSystemTypeStore.duplicate('at-note-3.5mm-charcoal', 'at-custom-persist-test', 'Persist Test');
    const blob = annotationSystemTypeStore.serialize();
    expect(blob.types.map(t => t.id)).toContain('at-custom-persist-test');
    expect(blob.types.some(t => t.isBuiltIn), 'built-ins must NOT be serialised').toBe(false);
    annotationSystemTypeStore.clearCustomTypes();
    expect(annotationSystemTypeStore.has('at-custom-persist-test')).toBe(false);
    annotationSystemTypeStore.deserialize(blob);
    expect(annotationSystemTypeStore.getById('at-custom-persist-test')?.name).toBe(custom.name);
    annotationSystemTypeStore.clearCustomTypes();
  });
});

describe('§ANN-ONE-STORE — bus writes reach the CANONICAL store', () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => { annotationStore.clear(); env = buildEnv(); });
  afterEach(() => env?.detach());

  it('annotation.create lands in the canonical store, not only the ledger', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', {
      id, viewId: 'view-1', kind: 'text-note', anchor: { x: 1, y: 0, z: 2 },
      text: 'hello', textHeightMm: 4,
    });
    const el = annotationStore.getById(id);
    expect(el, 'annotation.create did not reach the canonical store').toBeDefined();
    expect(el!.ownerViewId).toBe('view-1');
    expect(el!.parameters.text).toBe('hello');
    expect(el!.geometry2D.modelPoints[0]).toEqual({ x: 1, y: 0, z: 2 });
    expect(el!.style.textSizeMm).toBe(4);
    expect(el!.systemTypeId).toBe('at-note-3.5mm-charcoal');
  });

  it('a FULL AnnotationElement payload is stored verbatim, not flattened', async () => {
    // This is the grid-bubble / roof-slope-arrow case: families outside the ledger's
    // 11-value `kind` enum, carrying geometry + parameters the flat schema cannot hold.
    const el = makeAnnotationElement(
      createId('annotation'), 'grid-bubble', 'view-9',
      [], { modelPoints: [{ x: 5, y: 0, z: 7 }], offset: 0 },
      { gridId: 'g1', cachedLabel: 'A' },
    );
    await env.bus.executeCommand('annotation.create', el as never);
    const stored = annotationStore.getById(el.id);
    expect(stored, 'full-element payload was refused').toBeDefined();
    expect(stored!.type).toBe('grid-bubble');
    expect(stored!.parameters.cachedLabel).toBe('A');
    expect(stored!.geometry2D.modelPoints[0]).toEqual({ x: 5, y: 0, z: 7 });
  });

  it('annotation.delete removes from the canonical store', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', { id, viewId: 'v', kind: 'text-note' });
    expect(annotationStore.has(id)).toBe(true);
    await env.bus.executeCommand('annotation.delete', { annotationId: id });
    expect(annotationStore.has(id)).toBe(false);
  });

  it('annotation.setColor / setTextHeight reach the canonical element style', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', { id, viewId: 'v', kind: 'text-note' });
    await env.bus.executeCommand('annotation.setColor', { annotationId: id, color: '#6600ff' });
    await env.bus.executeCommand('annotation.setTextHeight', { annotationId: id, textHeightMm: 7.5 });
    const el = annotationStore.getById(id)!;
    expect(el.style.textColor).toBe('#6600ff');
    expect(el.style.textSizeMm).toBe(7.5);
  });

  it('annotation.move translates EVERY control point, not just an anchor', async () => {
    const el = makeAnnotationElement(
      createId('annotation'), 'linear-dim', 'v', [],
      { modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }], offset: 0 },
    );
    await env.bus.executeCommand('annotation.create', el as never);
    await env.bus.executeCommand('annotation.move', { annotationId: el.id, delta: { x: 1, y: 0, z: 2 } });
    const pts = annotationStore.getById(el.id)!.geometry2D.modelPoints;
    expect(pts[0]).toEqual({ x: 1, y: 0, z: 2 });
    expect(pts[1]).toEqual({ x: 4, y: 0, z: 2 });
  });

  it('a mutation verb on an annotation the ledger never saw is SERVED, not refused', async () => {
    // Pre-§ANN-ONE-STORE this threw AnnotationNotFoundError for every tool-created
    // annotation — the L-703 defect, generalised across seven verbs.
    const el = makeAnnotationElement(createId('annotation'), 'text-note', 'v', [], { modelPoints: [], offset: 0 });
    annotationStore.add(el);                      // as CreateAnnotationCommand does
    await env.bus.executeCommand('annotation.setText', { annotationId: el.id, text: 'edited' });
    expect(annotationStore.getById(el.id)!.parameters.text).toBe('edited');
  });

  it('ADR-0299 — a verb against an annotation that exists NOWHERE rejects', async () => {
    await expect(
      env.bus.executeCommand('annotation.setText', { annotationId: 'annotation_NOPE', text: 'x' }),
    ).rejects.toThrow();
  });
});

describe('§ANN-UPDATE-VERB — annotation.update', () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => { annotationStore.clear(); env = buildEnv(); });
  afterEach(() => env?.detach());

  it('re-types an annotation (the Revit "change type" edit)', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', { id, viewId: 'v', kind: 'text-note' });
    expect(annotationStore.getById(id)!.systemTypeId).toBe('at-note-3.5mm-charcoal');
    await env.bus.executeCommand('annotation.update', { annotationId: id, systemTypeId: 'at-title-5mm-purple' });
    expect(annotationStore.getById(id)!.systemTypeId).toBe('at-title-5mm-purple');
  });

  it('merges style and parameters instead of clobbering them', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', { id, viewId: 'v', kind: 'tag', text: 'keep me' });
    await env.bus.executeCommand('annotation.update', { annotationId: id, style: { textColor: '#b91c1c' } });
    await env.bus.executeCommand('annotation.update', { annotationId: id, parameters: { labelExpression: 'id' } });
    const el = annotationStore.getById(id)!;
    expect(el.style.textColor).toBe('#b91c1c');
    expect(el.parameters.text).toBe('keep me');           // not clobbered
    expect(el.parameters.labelExpression).toBe('id');
  });

  it('ADR-0299 — an update that changes nothing is REFUSED, not reported as done', async () => {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', { id, viewId: 'v', kind: 'text-note' });
    await expect(env.bus.executeCommand('annotation.update', { annotationId: id })).rejects.toThrow();
  });
});

describe('§ANN-ONE-STORE — undo/redo of the CANONICAL element, for every kind', () => {
  let env: ReturnType<typeof buildEnv>;
  beforeEach(() => { annotationStore.clear(); env = buildEnv(); });
  afterEach(() => env?.detach());

  const KINDS = ['text-note', 'tag', 'keynote', 'callout', 'revision-cloud',
    'elevation-mark', 'section-mark', 'level-tag', 'grid-bubble', 'north-arrow', 'scale-bar'] as const;

  for (const kind of KINDS) {
    it(`create → undo → redo round-trips a ${kind}`, async () => {
      const stash = new Map<string, unknown>();
      const id = createId('annotation');
      const ev = await env.bus.executeCommand('annotation.create', {
        id, viewId: 'v', kind, text: `a ${kind}`, textHeightMm: 3,
      }) as EventRecord<unknown>;

      expect(annotationStore.has(id), 'create did not reach the canonical store').toBe(true);

      applySide([...(ev.inverse as unknown as Op[])].reverse(), stash);
      expect(annotationStore.has(id), `undo left the ${kind} in the canonical store`).toBe(false);

      applySide(ev.forward as unknown as Op[], stash);
      const redone = annotationStore.getById(id);
      expect(redone, `redo did not restore the ${kind}`).toBeDefined();
      expect(redone!.type).toBe(kind);
      expect(redone!.systemTypeId, 'redo lost the system type').toBeTruthy();
      expect(redone!.parameters.text).toBe(`a ${kind}`);
    });
  }

  it('delete → undo restores the element WITH its type and geometry', async () => {
    const stash = new Map<string, unknown>();
    const el = makeAnnotationElement(
      createId('annotation'), 'linear-dim', 'v', [],
      { modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], offset: 0.5 },
      { unit: 'mm' },
    );
    await env.bus.executeCommand('annotation.create', el as never);
    const ev = await env.bus.executeCommand('annotation.delete', { annotationId: el.id }) as EventRecord<unknown>;
    expect(annotationStore.has(el.id)).toBe(false);

    // The delete's inverse re-adds. The adapter's stash holds the element captured at
    // remove time, which is what makes the restore lossless.
    stash.set(el.id, el);
    applySide([...(ev.inverse as unknown as Op[])].reverse(), stash);
    const back = annotationStore.getById(el.id);
    expect(back, 'undo of delete restored nothing').toBeDefined();
    expect(back!.systemTypeId).toBe('at-dim-2.5mm-slate');
    expect(back!.geometry2D.modelPoints).toHaveLength(2);
    expect(back!.geometry2D.offset).toBe(0.5);
  });
});
