// @vitest-environment happy-dom
//
// §ANN-TAG-DEFAULT / §ANN-SEED — founder acceptance:
//   "THE TAG ELEMENT ASKS YOU WHAT YOU WANT TO ADD - THIS SHOULD BE DEFAULT - MAYBE CAN
//    ASK YOU WHICH PROPERTY YOU WANT TO DISPLAY (LIKE IN REVIT) - BY DEFAULT IN A WALL
//    SHOULD BE THE ID"
//   "IF THERE IS NO DATA CREATE 5 WITH DIFFERENT TEXT SIZES AND MAYBE DIFFERENT COLOURS"

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TAG_PROPERTY_CATALOGUE, tagPropertiesFor, defaultTagPropertyFor, resolveTagLabel,
} from '../src/subsystem/TagPropertyResolver.js';
import { annotationStore } from '../src/subsystem/AnnotationStore.js';
import { seedDemoAnnotations } from '../src/subsystem/seedDemoAnnotations.js';
import { BUILT_IN_ANNOTATION_TYPES } from '../src/subsystem/AnnotationSystemTypeStore.js';
import { CreateAnnotationHandler } from '../src/handlers/CreateAnnotation.js';

describe('§ANN-TAG-DEFAULT — a tag has a default, it does not ask', () => {
  it('a WALL tag defaults to its ID (the founder rule)', () => {
    expect(defaultTagPropertyFor('wall')).toBe('id');
    expect(defaultTagPropertyFor('Wall')).toBe('id');
    expect(defaultTagPropertyFor('wallStore')).toBe('id');
  });

  it('every catalogued host type has a non-empty, ordered property list', () => {
    for (const [host, props] of Object.entries(TAG_PROPERTY_CATALOGUE)) {
      expect(props.length, `${host} has no properties`).toBeGreaterThan(0);
      expect(new Set(props.map(p => p.key)).size, `${host} has duplicate keys`).toBe(props.length);
    }
  });

  it('an unknown host still gets a picker list and a default — never nothing', () => {
    const props = tagPropertiesFor('some-element-invented-next-month');
    expect(props.length).toBeGreaterThan(0);
    expect(defaultTagPropertyFor('some-element-invented-next-month')).toBe('id');
  });

  it('resolves a wall label from its id by default', () => {
    const wall = { id: 'wall_ABC123', properties: { mark: 'WA-00-007' }, systemTypeId: 'wt-generic' };
    expect(resolveTagLabel('wall', wall)).toBe('wall_ABC123');
  });

  it('the picker CHANGES what is displayed (Revit property picker)', () => {
    const wall = { id: 'wall_ABC123', properties: { mark: 'WA-00-007', thickness: 0.2 }, systemTypeId: 'wt-generic' };
    expect(resolveTagLabel('wall', wall, 'mark')).toBe('WA-00-007');
    expect(resolveTagLabel('wall', wall, 'type')).toBe('wt-generic');
    expect(resolveTagLabel('wall', wall, 'thickness')).toBe('0.2');
  });

  it('doors and windows still default to their MARK — the schedule join (C28)', () => {
    expect(defaultTagPropertyFor('door')).toBe('mark');
    expect(defaultTagPropertyFor('window')).toBe('mark');
    expect(resolveTagLabel('door', { id: 'd1', mark: 'D-01' })).toBe('D-01');
  });

  it('rooms default to their NAME', () => {
    expect(defaultTagPropertyFor('room')).toBe('name');
    expect(resolveTagLabel('room', { id: 'r1', name: 'Kitchen', properties: { number: '02' } })).toBe('Kitchen');
  });

  it('falls back along the catalogue rather than showing the requested key blank', () => {
    // A wall with no id but a mark tags by mark — order IS the priority.
    expect(resolveTagLabel('wall', { properties: { mark: 'WA-00-009' } })).toBe('WA-00-009');
  });

  it('ADR-0299 — an unnameable host returns null, never an invented placeholder', () => {
    expect(resolveTagLabel('wall', {})).toBeNull();
    expect(resolveTagLabel('wall', null)).toBeNull();
    expect(resolveTagLabel('wall', { id: '   ' })).toBeNull();
  });
});

describe('§ANN-SEED — five demo annotations when a project has none', () => {
  // ⭐ THE PATH MOVED (C14 §3, 2026-09-04) AND THE ASSERTIONS DID NOT WEAKEN.
  // The double used to be a `window.commandManager` that ran the legacy
  // CreateAnnotationCommand. It is now a `window.runtime.bus` that runs the REAL
  // `CreateAnnotationHandler` — the same store, the same five records — and it
  // REFUSES every verb other than `annotation.create`, so a seed that dispatched
  // the wrong thing fails here instead of quietly passing.
  const executed: { type: string; payload: unknown }[] = [];
  beforeEach(() => {
    annotationStore.clear();
    executed.length = 0;
    const handler = new CreateAnnotationHandler();
    const ledger: Record<string, unknown> = {};
    (window as unknown as { runtime?: unknown }).runtime = {
      bus: {
        executeCommand(type: string, payload: unknown): Promise<unknown> {
          executed.push({ type, payload });
          if (type !== 'annotation.create') {
            return Promise.reject(new Error('no handler registered for: ' + type));
          }
          const ctx = { stores: { annotation: ledger } } as never;
          const v = handler.canExecute(ctx, payload as never);
          if (!v.valid) return Promise.reject(new Error(v.reason));
          handler.execute(ctx, payload as never);
          return Promise.resolve({ type, payload });
        },
      },
    };
  });
  afterEach(() => {
    annotationStore.clear();
    (window as unknown as { runtime?: unknown }).runtime = undefined;
    vi.restoreAllMocks();
  });

  it('creates exactly 5, at 5 different text sizes and 5 different colours', () => {
    const outcome = seedDemoAnnotations('view-1');
    expect(outcome.created).toBe(5);
    expect(outcome.reason).toBeUndefined();

    const all = annotationStore.getAll();
    expect(all).toHaveLength(5);
    expect(new Set(all.map(a => a.style.textSizeMm)).size).toBe(5);
    expect(new Set(all.map(a => a.style.textColor)).size).toBe(5);
    for (const a of all) {
      expect(a.ownerViewId).toBe('view-1');
      expect(a.systemTypeId, 'a seeded annotation has no type').toBeTruthy();
      expect(String(a.parameters.text).length).toBeGreaterThan(0);
    }
    // The five sizes/colours ARE the five built-in types — one definition, two uses.
    expect(new Set(all.map(a => a.systemTypeId)))
      .toEqual(new Set(BUILT_IN_ANNOTATION_TYPES.map(t => t.id)));
  });

  it('every seeded annotation went through the annotation.create VERB (P6)', () => {
    seedDemoAnnotations('view-1');
    expect(executed).toHaveLength(5);
    // One verb, five times — not a direct store write, and not some other verb.
    expect(new Set(executed.map(e => e.type))).toEqual(new Set(['annotation.create']));
    // Each payload is the FULL element, which is what makes it renderable and
    // undoable rather than a lossy {id, viewId, kind} stub (§ANN-ONE-STORE).
    for (const { payload } of executed) {
      const p = payload as { id?: string; geometry2D?: unknown; style?: unknown };
      expect(typeof p.id).toBe('string');
      expect(p.geometry2D, 'a seeded annotation lost its geometry').toBeTruthy();
      expect(p.style, 'a seeded annotation lost its style').toBeTruthy();
    }
  });

  it('does NOT seed a project that already has annotations', () => {
    seedDemoAnnotations('view-1');
    const outcome = seedDemoAnnotations('view-1');
    expect(outcome.created).toBe(0);
    expect(outcome.reason).toMatch(/already has 5/);
    expect(annotationStore.count).toBe(5);
  });

  it('ADR-0299 — a skipped seed says WHY instead of reporting a silent success', () => {
    expect(seedDemoAnnotations('').reason).toMatch(/no owning view/);
    (window as unknown as { runtime?: unknown }).runtime = undefined;
    const outcome = seedDemoAnnotations('view-1');
    expect(outcome.created).toBe(0);
    expect(outcome.reason).toMatch(/command system not ready/);
  });
});

describe('§ANN-UNDO-ARITY — the canonical store speaks the undo adapter\'s dialect', () => {
  beforeEach(() => annotationStore.clear());
  afterEach(() => annotationStore.clear());

  const el = () => ({
    id: 'annotation_UNDO1', type: 'text-note' as const, systemTypeId: 'at-note-3.5mm-charcoal',
    ownerViewId: 'v', references: [], geometry2D: { modelPoints: [{ x: 0, y: 0, z: 0 }], offset: 0 },
    style: { textSizeMm: 3.5 }, parameters: { text: 'before' }, isDriving: false,
    createdAt: 1, updatedAt: 1,
  });

  it('update(id, patch) — the TWO-ARG shape elementUndoStoreAdapter calls — applies', () => {
    annotationStore.add(el());
    // This is verbatim what `elementUndoStoreAdapter` does for a field-level patch.
    (annotationStore.update as unknown as (id: string, p: Record<string, unknown>) => void)(
      'annotation_UNDO1', { parameters: { text: 'after' } },
    );
    expect(annotationStore.getById('annotation_UNDO1')!.parameters.text,
      'field-level undo silently did nothing — the arity defect').toBe('after');
  });

  it('update({id, ...patch}) — the ONE-ARG shape — still applies', () => {
    annotationStore.add(el());
    annotationStore.update({ id: 'annotation_UNDO1', parameters: { text: 'after' } });
    expect(annotationStore.getById('annotation_UNDO1')!.parameters.text).toBe('after');
  });

  it('update() with no resolvable id refuses instead of corrupting a record', () => {
    annotationStore.add(el());
    (annotationStore.update as unknown as (p: unknown) => void)({ parameters: { text: 'x' } });
    expect(annotationStore.getById('annotation_UNDO1')!.parameters.text).toBe('before');
  });

  it('add() lifts a FLAT ledger record so a redo restores something that renders', () => {
    annotationStore.add({
      id: 'annotation_FLAT1', viewId: 'v2', kind: 'keynote',
      anchor: { x: 3, y: 0, z: 4 }, text: 'flat', textHeightMm: 5, color: '#6600ff',
    } as never);
    const back = annotationStore.getById('annotation_FLAT1')!;
    expect(back.type).toBe('keynote');
    expect(back.ownerViewId).toBe('v2');
    expect(back.geometry2D.modelPoints[0]).toEqual({ x: 3, y: 0, z: 4 });
    expect(back.style.textSizeMm).toBe(5);
    expect(back.parameters.text).toBe('flat');
  });
});
