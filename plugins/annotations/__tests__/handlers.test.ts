// Annotation handler smoke suite (S34 / ADR-0024 + post-2B closeout / ADR-0030).
//
// One test file covers all 8 handlers + the registration helper + error
// shapes.  Mirror of `plugins/dimensions/__tests__/handlers.test.ts`
// (same env-builder pattern, same undo-via-inverse pattern).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { AnnotationStore, type AnnotationData, type AnnotationsState } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  buildAnnotationHandlerSet,
  registerAnnotationHandlers,
  ANNOTATION_HANDLER_TYPES,
} from '../src/handlers/index.js';
import {
  AnnotationNotFoundError,
  AnnotationSchemaError,
  isAnnotationSystemError,
} from '../src/errors.js';

function buildEnv() {
  const annotation = new AnnotationStore();
  const stores = { annotation: annotation as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      annotation: Object.fromEntries(annotation.getState()) as AnnotationsState,
    }),
  });
  for (const h of buildAnnotationHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { annotation, bus, detach, undoStack };
}

function snap(s: AnnotationStore): Record<string, AnnotationData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: AnnotationStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('annotation handler registration', () => {
  it('registerAnnotationHandlers wires all 8 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ annotation: {} }),
    });
    const types = registerAnnotationHandlers(bus);
    expect([...types].sort()).toEqual([...ANNOTATION_HANDLER_TYPES].sort());
    expect(types).toHaveLength(8);
    env.detach();
  });

  it('buildAnnotationHandlerSet returns 8 handlers', () => {
    expect(buildAnnotationHandlerSet()).toHaveLength(8);
  });

  it('every handler has the expected type identifier', () => {
    const handlers = buildAnnotationHandlerSet() as readonly { readonly type: string }[];
    const typeSet = new Set(handlers.map((h) => h.type));
    for (const expected of ANNOTATION_HANDLER_TYPES) {
      expect(typeSet.has(expected)).toBe(true);
    }
  });
});

describe('annotation.create', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates an annotation with caller id and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('annotation');
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.create', {
      id,
      kind: 'text-note',
      anchor: { x: 1, y: 2, z: 3 },
      text: 'hello',
      rotation: 0,
      textHeightMm: 2.5,
    }) as EventRecord<unknown>;
    expect(env.annotation.get(id)).toBeDefined();
    expect(env.annotation.get(id)!.text).toBe('hello');
    expect(env.annotation.get(id)!.anchor).toEqual({ x: 1, y: 2, z: 3 });
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);
  });

  it('mints an id when caller omits one', async () => {
    env = buildEnv();
    const ev = await env.bus.executeCommand('annotation.create', {
      kind: 'text-note',
      anchor: { x: 0, y: 0, z: 0 },
      text: 'auto-id',
    }) as EventRecord<unknown>;
    expect(ev).toBeDefined();
    expect(env.annotation.ids()).toHaveLength(1);
  });

  it('rejects non-finite anchor at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('annotation.create', {
        anchor: { x: NaN, y: 0, z: 0 },
        text: 'bad',
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown kind at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('annotation.create', {
        kind: 'not-a-kind' as never,
        text: 'bad',
      }),
    ).rejects.toThrow();
  });

  it('rejects textHeightMm exceeding the unit-confusion guard (100 mm)', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('annotation.create', {
        textHeightMm: 1000,
        text: 'huge',
      }),
    ).rejects.toThrow();
  });
});

describe('annotation.delete / move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('deletes an annotation and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', {
      id, anchor: { x: 0, y: 0, z: 0 }, text: 'del me',
    });
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.delete', { annotationId: id }) as EventRecord<unknown>;
    expect(env.annotation.get(id)).toBeUndefined();
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);
  });

  it('move adds delta to anchor and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', {
      id, anchor: { x: 1, y: 2, z: 3 }, text: 'move me',
    });
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.move', {
      annotationId: id,
      delta: { x: 10, y: -5, z: 0.5 },
    }) as EventRecord<unknown>;
    expect(env.annotation.get(id)!.anchor).toEqual({ x: 11, y: -3, z: 3.5 });
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);
  });

  it('move rejects non-finite delta', async () => {
    env = buildEnv();
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', {
      id, anchor: { x: 0, y: 0, z: 0 }, text: 'x',
    });
    await expect(
      env.bus.executeCommand('annotation.move', {
        annotationId: id, delta: { x: Infinity, y: 0, z: 0 },
      }),
    ).rejects.toThrow();
  });

  it('move/delete reject missing annotationId', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('annotation.delete', { annotationId: 'nope' }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('annotation.move', { annotationId: 'nope', delta: { x: 1, y: 0, z: 0 } }),
    ).rejects.toThrow();
  });
});

describe('annotation setters (text / kind / rotation / textHeight / color)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  async function seed(): Promise<string> {
    const id = createId('annotation');
    await env.bus.executeCommand('annotation.create', {
      id, anchor: { x: 0, y: 0, z: 0 }, text: 'orig', kind: 'text-note',
    });
    return id;
  }

  it('setText round-trips', async () => {
    env = buildEnv();
    const id = await seed();
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.setText', { annotationId: id, text: 'changed' }) as EventRecord<unknown>;
    expect(env.annotation.get(id)!.text).toBe('changed');
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);
  });

  it('setKind round-trips and validates', async () => {
    env = buildEnv();
    const id = await seed();
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.setKind', { annotationId: id, kind: 'tag' }) as EventRecord<unknown>;
    expect(env.annotation.get(id)!.kind).toBe('tag');
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);

    await expect(
      env.bus.executeCommand('annotation.setKind', { annotationId: id, kind: 'whatever' as never }),
    ).rejects.toThrow();
  });

  it('setRotation round-trips and validates', async () => {
    env = buildEnv();
    const id = await seed();
    const before = snap(env.annotation);
    const ev = await env.bus.executeCommand('annotation.setRotation', { annotationId: id, rotation: Math.PI / 4 }) as EventRecord<unknown>;
    expect(env.annotation.get(id)!.rotation).toBeCloseTo(Math.PI / 4);
    undoLast(env.annotation, ev);
    expect(snap(env.annotation)).toEqual(before);

    await expect(
      env.bus.executeCommand('annotation.setRotation', { annotationId: id, rotation: NaN }),
    ).rejects.toThrow();
  });

  it('setTextHeight enforces positive + ≤100 mm bound', async () => {
    env = buildEnv();
    const id = await seed();
    await env.bus.executeCommand('annotation.setTextHeight', { annotationId: id, textHeightMm: 5 });
    expect(env.annotation.get(id)!.textHeightMm).toBe(5);

    await expect(
      env.bus.executeCommand('annotation.setTextHeight', { annotationId: id, textHeightMm: -1 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('annotation.setTextHeight', { annotationId: id, textHeightMm: 200 }),
    ).rejects.toThrow();
  });

  it('setColor accepts string AND null clear', async () => {
    env = buildEnv();
    const id = await seed();
    await env.bus.executeCommand('annotation.setColor', { annotationId: id, color: '#ff0000' });
    expect(env.annotation.get(id)!.color).toBe('#ff0000');

    await env.bus.executeCommand('annotation.setColor', { annotationId: id, color: null });
    expect(env.annotation.get(id)!.color).toBeUndefined();

    await expect(
      env.bus.executeCommand('annotation.setColor', { annotationId: id, color: 123 as never }),
    ).rejects.toThrow();
  });
});

describe('typed errors', () => {
  it('AnnotationNotFoundError is recognised by isAnnotationSystemError', () => {
    const e = new AnnotationNotFoundError('abc');
    expect(isAnnotationSystemError(e)).toBe(true);
    expect(e.annotationId).toBe('abc');
  });

  it('AnnotationSchemaError preserves cause', () => {
    const cause = new Error('zod boom');
    const e = new AnnotationSchemaError(cause);
    expect(e.cause).toBe(cause);
    expect(isAnnotationSystemError(e)).toBe(true);
  });
});
