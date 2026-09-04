// @command-gate: not-a-command-bus-handler
//
// This module is the PROJECTION the `annotation.*` handlers write THROUGH; it is not
// itself a bus handler and has no `canExecute`/`execute` pair. It lives in
// `src/handlers/` for co-location with the eight handlers that are its only callers —
// exactly the case `tests/commands/__tests__/affected-stores.test.ts:36-40` mints this
// marker for, and the same shape as `plugins/rooms/src/handlers/legacyCommands.ts` and
// `plugins/selection/src/handlers/selectionStoreAccess.ts`.
//
// ⛔ The marker MUST stay inside the first 600 bytes — the gate reads no further
// (`affected-stores.test.ts:71-72`). Do not push it below the block comment.
/**
 * §ANN-ONE-STORE — THE canonical annotation sink.
 *
 * THE DEFECT THIS CLOSES
 * ──────────────────────
 * PRYZM carried TWO disjoint annotation stores:
 *
 *   (1) `ctx.stores.annotation` — a flat `AnnotationsState` record map
 *       (`plugins/annotations/src/store.ts`, schema `packages/schemas/src/elements/Annotation.ts`),
 *       written by the eight `annotation.*` bus handlers.
 *   (2) the ADR-0119 SUBSYSTEM `annotationStore`
 *       (`plugins/annotations/src/subsystem/AnnotationStore.ts`).
 *
 * (2) is CANONICAL, and that is a finding, not a preference. It is the store that
 *   • `AnnotationRenderLayer` / `PlanViewAnnotationRenderer` read to draw,
 *   • `ProjectSerializer` serialises and `ProjectLoader` restores,
 *   • `PropertyPanelAnnotations` reads and edits,
 *   • `buildUndoStoreMap()` binds the key `'annotation'` to for Ctrl+Z.
 *
 * (1) is read by NOTHING. Every write to it was a write into a void. The last
 * `affectedStores: ['annotation']` patch produced over it was nevertheless APPLIED to
 * (2) by the undo map — i.e. the two stores were already fused on the undo path and
 * split on the write path, which is the worst of both.
 *
 * THE RESOLUTION
 * ──────────────
 * The `annotation.*` bus verbs stay — they are the P6 public mutation API and callers
 * outside this plugin use them. But they no longer terminate in (1). Every handler now
 * projects its mutation through this module into the CANONICAL store, so:
 *
 *   • a bus-created annotation renders, persists, exports and undoes;
 *   • the AnnotationsState patch pair (1) remains ONLY as the patch ledger the ring
 *     buffer needs — it is a DERIVED MIRROR, never a read source. `assertNotARead()`
 *     below states that boundary in code;
 *   • a sixteenth tool written against the bus verb lands in the right store by
 *     construction, instead of silently going nowhere.
 *
 * ADR-0299 §RECOVERY-MUST-REFUSE. Every entry point here returns an explicit
 * {ok,reason} — a projection that cannot reach the canonical store reports so. No
 * caller may treat a failed projection as a success.
 *
 * Contract compliance:
 *   C03 §P6      — the bus handler IS the command layer; the store write belongs to it.
 *   C03 §4.5-4.8 — the canonical store is the one Ctrl+Z drives (buildUndoStoreMap).
 *   C10 §2 / P8  — every exported function opens an OTel span.
 *   ADR-0119     — subsystem annotation model is the single element record.
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { annotationStore } from '../subsystem/AnnotationStore.js';
import {
  makeAnnotationElement,
  type AnnotationElement,
  type AnnotationType,
} from '../subsystem/AnnotationTypes.js';

/** Outcome of a projection. `ok:false` ALWAYS carries a human-readable reason. */
export interface SinkResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const OK: SinkResult = Object.freeze({ ok: true });
const fail = (reason: string): SinkResult => ({ ok: false, reason });

/**
 * A payload rich enough to BE an AnnotationElement — the shape `makeAnnotationElement`
 * produces. Callers that already built one (GridPlanToolHandler, RoofSlopeSymbolBuilder,
 * every plugins/annotations tool) must have it stored verbatim rather than flattened
 * into `{id, viewId, kind}` and losing geometry2D / references / parameters / style.
 */
export function isFullElementPayload(p: unknown): p is AnnotationElement {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.type === 'string' &&
    typeof o.ownerViewId === 'string' &&
    typeof o.geometry2D === 'object' && o.geometry2D !== null &&
    Array.isArray(o.references)
  );
}

/** Flat schema-level payload accepted by the `annotation.create` bus verb. */
export interface FlatAnnotationPayload {
  readonly id: string;
  readonly viewId?: string;
  readonly kind?: string;
  readonly anchor?: { x: number; y: number; z: number };
  readonly text?: string;
  readonly rotation?: number;
  readonly textHeightMm?: number;
  readonly color?: string;
  readonly hostElementId?: string;
  readonly systemTypeId?: string;
}

/**
 * Lift a flat schema-level annotation payload into a full subsystem AnnotationElement.
 * Exported so the projection rule is testable in isolation and so no caller has to
 * re-derive the field mapping (which is exactly how the two stores drifted apart).
 *
 * P8: opens `annotation.sink.lift`.
 */
export function liftFlatToElement(p: FlatAnnotationPayload): AnnotationElement {
  return withHandlerSpan('annotation.sink.lift', { 'pryzm.annotation.id': p.id }, () => {
    const anchor = p.anchor ?? { x: 0, y: 0, z: 0 };
    const el = makeAnnotationElement(
      p.id,
      (p.kind ?? 'text-note') as AnnotationType,
      p.viewId ?? '',
      [],
      { modelPoints: [anchor], offset: 0 },
      {
        ...(p.text !== undefined ? { text: p.text } : {}),
        ...(p.hostElementId !== undefined ? { targetElementId: p.hostElementId } : {}),
        ...(p.rotation !== undefined ? { rotation: p.rotation } : {}),
      },
      {
        ...(p.textHeightMm !== undefined ? { textSizeMm: p.textHeightMm } : {}),
        ...(p.color !== undefined ? { textColor: p.color, lineColor: p.color } : {}),
      },
    );
    return p.systemTypeId !== undefined ? { ...el, systemTypeId: p.systemTypeId } : el;
  });
}

/**
 * Project a create into the canonical store.
 *
 * Idempotent by id: a caller that (legitimately) dispatches BOTH the bus verb and
 * `CreateAnnotationCommand` for the same element — RoofSlopeSymbolBuilder does — gets
 * ONE record, not two. That is reported as `ok:true` with a reason, because the
 * post-condition ("the element is in the canonical store") holds.
 *
 * P8: opens `annotation.sink.create`.
 */
export function sinkCreate(payload: unknown): SinkResult {
  return withHandlerSpan('annotation.sink.create', {}, () => {
    const el = isFullElementPayload(payload)
      ? payload
      : (payload && typeof (payload as FlatAnnotationPayload).id === 'string')
        ? liftFlatToElement(payload as FlatAnnotationPayload)
        : null;
    if (!el) return fail('payload carries no annotation id — nothing to store');
    if (annotationStore.has(el.id)) return { ok: true, reason: `already present — ${el.id}` };
    annotationStore.add(el);
    if (!annotationStore.has(el.id)) {
      return fail(`canonical store rejected ${el.id} (${el.type})`);
    }
    return OK;
  });
}

/**
 * Project a partial update into the canonical store.
 * P8: opens `annotation.sink.update`.
 */
export function sinkUpdate(id: string, patch: Partial<AnnotationElement>): SinkResult {
  return withHandlerSpan('annotation.sink.update', { 'pryzm.annotation.id': id }, () => {
    if (!annotationStore.has(id)) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ ...patch, id });
    return OK;
  });
}

/**
 * Project a delete into the canonical store.
 * P8: opens `annotation.sink.delete`.
 */
export function sinkDelete(id: string): SinkResult {
  return withHandlerSpan('annotation.sink.delete', { 'pryzm.annotation.id': id }, () => {
    if (!annotationStore.has(id)) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.remove(id);
    return annotationStore.has(id) ? fail(`canonical store refused to remove ${id}`) : OK;
  });
}

/**
 * Merge a style patch into an annotation's `style` (the canonical store replaces the
 * whole field on update, so colour/size edits must be merged here or they clobber).
 * P8: opens `annotation.sink.style`.
 */
export function sinkStyle(id: string, style: Record<string, unknown>): SinkResult {
  return withHandlerSpan('annotation.sink.style', { 'pryzm.annotation.id': id }, () => {
    const existing = annotationStore.getById(id);
    if (!existing) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ id, style: { ...existing.style, ...style } as AnnotationElement['style'] });
    return OK;
  });
}

/**
 * Merge a parameters patch into an annotation's `parameters`.
 * P8: opens `annotation.sink.params`.
 */
export function sinkParameters(id: string, parameters: Record<string, unknown>): SinkResult {
  return withHandlerSpan('annotation.sink.params', { 'pryzm.annotation.id': id }, () => {
    const existing = annotationStore.getById(id);
    if (!existing) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ id, parameters: { ...existing.parameters, ...parameters } });
    return OK;
  });
}

/**
 * §ANN-MIRROR-BACKFILL — flatten the canonical element into the shape the derived
 * `AnnotationsState` ledger holds.
 *
 * WHY THIS EXISTS. The seven mutating `annotation.*` handlers each begin
 * `if (!ctx.stores.annotation[id]) throw AnnotationNotFoundError` and then produce their
 * patch pair over that ledger. For an annotation created by a TOOL (i.e. all of them —
 * tools go through CreateAnnotationCommand into the canonical store), the ledger holds
 * nothing, so the guard threw "not found" for an annotation that plainly exists, and a
 * patch produced over an absent record is empty — undo would revert nothing. That is
 * exactly the L-703 defect, generalised across seven verbs.
 *
 * Back-filling the ledger from the canonical element makes it a true derived projection:
 * the guard passes, and the forward/inverse pair describes a real before/after.
 *
 * P8: opens `annotation.sink.mirror`.
 */
export function mirrorRecordFor(id: string): Record<string, unknown> | null {
  return withHandlerSpan('annotation.sink.mirror', { 'pryzm.annotation.id': id }, () => {
    const el = annotationStore.getById(id);
    if (!el) return null;
    const anchor = el.geometry2D?.modelPoints?.[0] ?? { x: 0, y: 0, z: 0 };
    return {
      id: el.id,
      viewId: el.ownerViewId,
      kind: el.type,
      systemTypeId: el.systemTypeId,
      anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
      hostElementId: (el.parameters as Record<string, unknown> | undefined)?.targetElementId,
      text: String((el.parameters as Record<string, unknown> | undefined)?.text ?? ''),
      rotation: Number((el.parameters as Record<string, unknown> | undefined)?.rotation ?? 0),
      textHeightMm: el.style?.textSizeMm ?? 2.5,
      color: el.style?.textColor,
    };
  });
}

/**
 * THE BOUNDARY, stated in code. `ctx.stores.annotation` (`AnnotationsState`) is a
 * DERIVED PATCH LEDGER: the ring buffer needs an immutable before/after pair per
 * mutation, and `produceCommand` supplies it. It is NOT an element source. Any code
 * that reads it to render, persist, export, tag, schedule or select is reading a
 * lossy shadow of the canonical store and is wrong.
 *
 * Call this from a would-be reader to get a loud, attributable refusal instead of a
 * plausible-looking empty/partial answer (ADR-0299 §RECOVERY-MUST-REFUSE).
 *
 * P8: opens `annotation.sink.assertNotARead`.
 */
export function assertNotARead(caller: string): never {
  return withHandlerSpan('annotation.sink.assertNotARead', { 'pryzm.caller': caller }, () => {
    throw new Error(
      `[§ANN-ONE-STORE] ${caller} read ctx.stores.annotation (AnnotationsState). ` +
      'That store is a derived patch ledger, not an element source — it is lossy and ' +
      'carries no geometry2D/references/parameters/style. Read the canonical subsystem ' +
      "`annotationStore` (import { annotationStore } from '@pryzm/plugin-annotations').",
    );
  });
}
