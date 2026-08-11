// @vitest-environment happy-dom
/**
 * §P6-LINEARDIM-PROBE — is `LinearDimPlanToolHandler`'s `commandManager.execute(
 * new CreateAnnotationCommand(...))` safely migratable to the bus verb
 * `annotation.create`?
 *
 * The gate `tools/ga-gate/check-no-commandmanager.ts` counts that line as one of
 * 14 literal P6 breaches. The obvious fix is to dispatch `annotation.create`
 * instead. This probe exists to decide that BEFORE the edit, not after.
 *
 * WHAT IS ACTUALLY BEING ASSERTED
 * ──────────────────────────────
 * NOT "the command succeeded". NOT a call count. The invariant is:
 *
 *   a linear dimension survives create → undo → REDO with its `geometry2D`
 *   and `references` intact,
 *
 * because those two fields ARE the dimension — `geometry2D.modelPoints` is the
 * A–B line it measures and `offset` is where the user dragged it. A dimension
 * that redoes without them is a blank text note sitting at the origin.
 *
 * WHY REDO IS THE LOAD-BEARING STEP. `annotation.create`'s full-element branch
 * (plugins/annotations/src/handlers/CreateAnnotation.ts) writes the canonical
 * subsystem store as a SIDE EFFECT via `sinkCreate`, then produces its
 * forward/inverse patch pair over `mirrorRecordFor(id)` — the deliberately
 * LOSSY flat mirror (see canonicalAnnotationSink.ts §ANN-MIRROR-BACKFILL).
 * Meanwhile `apps/editor/src/engine/undo/performUndoRedo.ts:294` binds the undo
 * store key `annotation` to `window.annotationStore` — the CANONICAL store. So
 * the ring buffer replays a mirror-shaped patch INTO the canonical store. This
 * probe runs the REAL handler and inspects the REAL forward patch, so the answer
 * does not depend on reading the mirror helper correctly.
 *
 * READ THIS TEST'S RESULT CORRECTLY: it PASSES by demonstrating the loss. That
 * is the answer "no, this site is not mechanically migratable" — the migration
 * must stop here and authoring the dimension-carrying verb is C16 work.
 */
import { describe, expect, it } from 'vitest';
import {
  makeAnnotationElement,
  annotationStore,
  isAnnotationKind,
  ANNOTATION_KINDS,
  type AnnotationElement,
} from '@pryzm/plugin-annotations';
import { buildAnnotationHandlerSet } from '@pryzm/plugin-annotations/handlers';

const PROBE_ID = 'annotation_01JPROBE0000000000000000';

/** The exact element shape LinearDimPlanToolHandler builds at line ~254. */
function buildLinearDim(): AnnotationElement {
  return makeAnnotationElement(
    PROBE_ID,
    'linear-dim',
    'view-plan-1',
    [
      { elementId: 'wall_A', kind: 'wall' } as never,
      { elementId: 'wall_B', kind: 'wall' } as never,
    ],
    {
      modelPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
      offset: 1.25, // the standoff the user dragged to — §FIX-DIM-3RD-CLICK-OFFSET
    },
    { unit: 'm' },
  );
}

function createHandler() {
  const h = buildAnnotationHandlerSet().find((x) => x.type === 'annotation.create');
  // Emptiness and failure are not the same value: if the verb is gone, say so
  // loudly rather than silently skipping the assertions below.
  if (!h) throw new Error('§P6-LINEARDIM-PROBE: annotation.create handler not found');
  return h;
}

describe('§P6-LINEARDIM-PROBE — bus annotation.create as a CreateAnnotationCommand replacement', () => {
  it('the element the tool builds carries the two fields that ARE the dimension', () => {
    const el = buildLinearDim();
    // Guard the probe itself: if this drifts, everything below measures nothing.
    expect(el.type).toBe('linear-dim');
    expect(el.geometry2D?.modelPoints).toHaveLength(2);
    expect(el.geometry2D?.offset).toBe(1.25);
    expect(el.references).toHaveLength(2);
  });

  it("'linear-dim' is NOT in the bus verb's schema-level kind enum", () => {
    // The full-element branch survives only because a full AnnotationElement
    // carries `type`, not `kind`, so `canExecute`'s kind guard is skipped by
    // ABSENCE rather than by acceptance. That is load-bearing and undeclared.
    expect(isAnnotationKind('linear-dim')).toBe(false);
    expect(ANNOTATION_KINDS as readonly string[]).not.toContain('linear-dim');
  });

  it('the bus verb DOES reach the canonical store (so the loss below is not a no-op)', () => {
    const el = buildLinearDim();
    annotationStore.remove(el.id);
    const ctx = { stores: { annotation: {} } } as never;
    createHandler().execute(ctx, el as never);

    const stored = annotationStore.getById(el.id);
    expect(stored).toBeTruthy();
    expect(stored?.geometry2D?.offset).toBe(1.25);
    expect(stored?.references).toHaveLength(2);
    annotationStore.remove(el.id);
  });

  it('THE FINDING — the forward patch the ring buffer REDOES drops geometry2D + references', () => {
    const el = buildLinearDim();
    annotationStore.remove(el.id);
    const ctx = { stores: { annotation: {} } } as never;
    const res = createHandler().execute(ctx, el as never) as {
      forward: readonly { op: string; path: string; value?: unknown }[];
    };

    expect(res.forward.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(res.forward);
    // performUndoRedo routes this patch into the CANONICAL annotationStore. If
    // it carries no geometry2D, redo restores a dimension that measures nothing.
    expect(serialized).not.toContain('modelPoints');
    expect(serialized).not.toContain('references');
    expect(serialized).not.toContain('1.25');

    annotationStore.remove(el.id);
  });
});
