/**
 * CeilingStore
 *
 * Contract compliance:
 * - §01 §3.5 / §2.1: Store is data-only. No window event listeners here.
 *   Level-removal cascading is handled externally (CeilingLevelCleanupHandler).
 * - §01 §3.4 FIX: update() takes Partial<CeilingData> and deep-merges.
 *   restoreSnapshot() accepts full CeilingData to preserve metadata on undo.
 * - §01 §2.6: IFC GUID generation is the Command's responsibility, not the store.
 * - §01 §3.4 (W2): All internal clone operations use structuredClone.
 * - §01 §3.7 (W3): getById() returns a structuredClone to prevent external mutation.
 * - FIX-4: Internal Map entries are deep-frozen via freezeCeilingData().
 * - FIX-3: storeEventBus.emit() called alongside every DOM CustomEvent.
 */

import { CeilingData, CeilingHoleElement } from './CeilingTypes';
import { validateCeilingData } from './CeilingDataSchema';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { computeArea, ensureCCW, validatePolygon } from './CeilingPolygonUtils';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

// §C73 §2.3 — was `LAYER_THICKNESS_TOLERANCE`; the unit lived only in the trailing
// comment. Both uses compare `|Σ layerThickness − boundary.thickness|`, metres, so
// `_M` states what the number already meant: 0.1 mm of accumulated float slop is
// allowed before a ceiling's layer stack is declared inconsistent with its total.
// NOT `COINCIDENT_M` (0.001 m): adopting the kernel role would WIDEN this 10×,
// admitting a 1 mm build-up mismatch as "consistent" — and it is a layer-sum
// reconciliation, not a "same point" test (C73 §2.1).
const LAYER_THICKNESS_TOLERANCE_M = 0.0001; // 0.1 mm

/** Deep-freeze a CeilingData and all nested mutable structures. */
function freezeCeilingData(ceiling: CeilingData): CeilingData {
  if (ceiling.boundary) {
    ceiling.boundary.polygon.forEach(v => Object.freeze(v));
    Object.freeze(ceiling.boundary.polygon);
    Object.freeze(ceiling.boundary);
  }
  if (ceiling.holeElements) {
    ceiling.holeElements.forEach(h => {
      if (h.polygon) {
        h.polygon.forEach(v => Object.freeze(v));
        Object.freeze(h.polygon);
      }
      Object.freeze(h);
    });
    Object.freeze(ceiling.holeElements);
  }
  if (ceiling.layers) {
    ceiling.layers.forEach(l => Object.freeze(l));
    Object.freeze(ceiling.layers);
  }
  if (ceiling.coveredRoomIds) Object.freeze(ceiling.coveredRoomIds);
  if (ceiling.boundingWallIds) Object.freeze(ceiling.boundingWallIds);
  if (ceiling.properties) Object.freeze(ceiling.properties);
  if (ceiling.ifcData) Object.freeze(ceiling.ifcData);
  if (ceiling.finishSpec) Object.freeze(ceiling.finishSpec);
  if (ceiling.metadata) Object.freeze(ceiling.metadata);
  return Object.freeze(ceiling) as CeilingData;
}

export class CeilingStore {
  private _ceilings = new Map<string, CeilingData>();
  /** Sub-map: holeElementId → ceilingId for fast hole lookup. */
  private _holeIndex = new Map<string, string>();

  // ── Internal event listeners (for Store-level observers) ─────────────────
  // §STEP7 (C72 §3.1, gap PR-03): 'update' emissions carry the frozen
  // PRE-MUTATION ceiling as an optional third argument, captured before the
  // clone/merge — never re-read after the write (C72 §3.5). Absent on 'add'
  // (no prior state exists) and on 'remove'.
  private _listeners = new Set<(event: string, ceiling: CeilingData | { id: string }, prevState?: CeilingData) => void>();

  subscribe(listener: (event: string, ceiling: CeilingData | { id: string }, prevState?: CeilingData) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _emit(event: string, payload: CeilingData | { id: string }, prevState?: CeilingData): void {
    this._listeners.forEach(l => {
      try { l(event, payload, prevState); } catch (e) { console.error('[CeilingStore] Listener error:', e); }
    });
  }

  // ── Write API ─────────────────────────────────────────────────────────────

  add(ceiling: CeilingData): void {
    // Validate at store boundary — throws ZodError with descriptive issues.
    validateCeilingData(ceiling);

    const isRestore = !!ceiling.metadata?.createdAt;
    const clone = structuredClone(ceiling) as CeilingData;

    // Ensure correct levelId → parentId linkage.
    if (!clone.parentId) clone.parentId = clone.levelId;

    // Ensure defaults.
    if (!clone.properties) clone.properties = {};
    if (!clone.properties.mark) {
      const count = this._ceilings.size + 1;
      clone.properties.mark = `C${count.toString().padStart(3, '0')}`;
    }
    if (!clone.coveredRoomIds) (clone as any).coveredRoomIds = [];
    if (!clone.boundingWallIds) (clone as any).boundingWallIds = [];
    if (!clone.holeElements) (clone as any).holeElements = [];

    // Enforce CCW winding on boundary polygon.
    clone.boundary.polygon = ensureCCW(clone.boundary.polygon);

    // Thickness coherence — auto-correct from layer sum.
    if (clone.layers && clone.layers.length > 0) {
      const layerSum = clone.layers.reduce((s, l) => s + l.thickness, 0);
      if (Math.abs(layerSum - clone.boundary.thickness) > LAYER_THICKNESS_TOLERANCE_M) {
        console.warn(
          `[CeilingStore.add] §R-9: boundary.thickness (${clone.boundary.thickness}) ` +
          `differs from layer sum (${layerSum.toFixed(4)}). Auto-correcting.`
        );
        clone.boundary.thickness = layerSum;
      }
    }

    // Metadata stamping.
    const now = Date.now();
    if (!isRestore) {
      clone.metadata = {
        createdAt: now,
        modifiedAt: now,
        createdBy: clone.metadata?.createdBy ?? 'system',
        version: 1,
        tags: clone.metadata?.tags,
        description: clone.metadata?.description,
      };
    } else {
      // On undo restore: preserve original createdAt / version; refresh modifiedAt.
      clone.metadata = { ...clone.metadata, modifiedAt: now };
    }

    // IFC guard.
    if (!clone.ifcData) {
      console.warn(
        '[CeilingStore.add] §01 §2.6 VIOLATION: ifcData not provided. ' +
        'CreateCeilingCommand.execute() must inject ifcData with a stable GUID.'
      );
    }

    // Rebuild hole index entries.
    for (const hole of clone.holeElements) {
      this._holeIndex.set(hole.id, clone.id);
      this._holeIndex.set(hole.elementId, clone.id);
    }

    freezeCeilingData(clone);
    this._ceilings.set(clone.id, clone);

    _bus.emit('bim-ceiling-added', { id: clone.id });

    // Canonical bus — SemanticIndex / VisibilityRuleEngine subscribers.
    storeEventBus.emit({
      elementId: clone.id,
      elementType: 'ceiling',
      operation: 'create',
      timestamp: Date.now(),
    });

    this._emit('add', clone);
  }

  update(
    ceilingId: string,
    updates: Partial<CeilingData>,
    preserveMetadata = false
  ): CeilingData | undefined {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) {
      console.warn(`[CeilingStore.update] Ceiling "${ceilingId}" not found.`);
      return undefined;
    }

    // Guard: levelId cannot change.
    if (updates.levelId && updates.levelId !== existing.levelId) {
      console.warn('[CeilingStore.update] levelId cannot change after creation. Ignoring.');
      delete (updates as any).levelId;
    }

    // Guard: holeElements cannot be updated via update() — use hole API.
    if ('holeElements' in updates) {
      console.warn('[CeilingStore.update] holeElements cannot be updated via update(). Use hole API.');
      delete (updates as any).holeElements;
    }

    const clone = structuredClone(existing) as CeilingData;
    Object.assign(clone, updates);

    // If boundary is updated, re-validate polygon and re-enforce CCW.
    if (updates.boundary) {
      const validation = validatePolygon(clone.boundary.polygon);
      if (!validation.valid) {
        console.error('[CeilingStore.update] Invalid polygon:', validation.reasons);
        return undefined;
      }
      clone.boundary.polygon = ensureCCW(clone.boundary.polygon);

      // Re-check layer thickness coherence.
      if (clone.layers && clone.layers.length > 0) {
        const layerSum = clone.layers.reduce((s, l) => s + l.thickness, 0);
        if (Math.abs(layerSum - clone.boundary.thickness) > LAYER_THICKNESS_TOLERANCE_M) {
          clone.boundary.thickness = layerSum;
        }
      }
    }

    // Metadata update.
    if (!preserveMetadata) {
      clone.metadata = {
        ...clone.metadata,
        modifiedAt: Date.now(),
        version: clone.metadata.version + 1,
      };
    }

    freezeCeilingData(clone);
    this._ceilings.set(ceilingId, clone);

    _bus.emit('bim-ceiling-updated', { id: ceilingId });
    storeEventBus.emit({
      elementId: ceilingId,
      elementType: 'ceiling',
      operation: 'update',
      timestamp: Date.now(),
    });
    // §STEP7: `existing` is the frozen pre-mutation record, captured before the merge.
    this._emit('update', clone, existing);

    return clone;
  }

  /**
   * §L-1032 — MOVE a ceiling to a different storey.
   *
   * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ────────
   * Because for THIS store `update(id, {levelId})` is a measured NO-OP.
   * `update()` above warns and DELETES the key before the merge:
   *
   *     if (updates.levelId && updates.levelId !== existing.levelId) {
   *       console.warn('[CeilingStore.update] levelId cannot change after creation. Ignoring.');
   *       delete (updates as any).levelId;
   *     }                                            // CeilingStore.ts:181-184
   *
   * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts` records exactly
   * that — `ceiling: { semantics: 'merge', … note: 'PRESENCE-KEYED — levelId and
   * holeElements are warned-and-deleted (:181-190)' }` — and it is re-derived
   * from the real class by `LegacyStoreUpdateSemantics.measured.test.ts`, not
   * transcribed. A caller doing `update(id, {levelId})` therefore gets a
   * successful return value, a bumped `version`, an 'update' fan-out, and a
   * ceiling that never moved: success reported over a change that did not
   * happen, which is the failure mode C03 §4.6 U-4 forbids.
   *
   * ⚠ THE GUARD IN `update()` IS CORRECT AND MUST STAY. It exists so a GENERIC
   * patch — an undo field write, a property-panel merge, an IFC round trip —
   * cannot re-storey a ceiling by accident. This method does not weaken it; it
   * writes the map entry itself, which is what makes "move" an explicit,
   * named, auditable gesture rather than a side effect of some other edit.
   *
   * The second reason is the undo leg: `elementUndoStoreAdapter`'s §L-946 arm
   * tests `typeof store.changeLevel === 'function'` before routing a `levelId`
   * inverse patch. Without this method Ctrl+Z after a storey move falls through
   * to the generic `update()` — which, per the guard above, silently declines to
   * revert, leaving the plugin store on the old storey and the geometry record
   * on the new one. That is the two-copy divergence L-946 closed, re-opened by
   * Ctrl+Z and pointing the other way.
   *
   * Symmetric with `SlabStore.changeLevel`
   * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
   * (`packages/geometry-roof/src/RoofStore.ts:153`).
   *
   * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ───────────────────────────
   * `restoreSnapshot()` delegates to `add()`, and `add()` re-mints
   * `properties.mark` from `this._ceilings.size` (`:100-103`) and warns about a
   * missing IFC GUID (`:140-145`); a remove+add round trip would renumber the
   * ceiling and drop its hole-index entries in between. A move is not a delete.
   * One 'update' is everything the renderer needs — the fragment builder
   * re-derives the soffit's world Y from `level.elevation` on every update.
   *
   * ─── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
   * Spatial-authority registration (bimManager `level.childrenIds`, the
   * view-dependency element→level map) is NOT updated here — identical to the
   * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state in
   * their own doc comments. `apps/editor/src/engine/elementLevelChangedMirror.ts`
   * owns that half for EVERY family, so the ordering rule (move the record
   * FIRST, re-register SECOND, dirty BOTH storeys THIRD) lives in one place
   * rather than in thirteen stores.
   *
   * `_holeIndex` is untouched on purpose: it maps holeId → ceilingId, and
   * neither id changes when the storey does.
   *
   * Returns the moved record, or `undefined` when there is nothing to move —
   * failure and emptiness must not be the same value (§context-data-honesty).
   */
  changeLevel(ceilingId: string, newLevelId: string): CeilingData | undefined {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) return undefined;
    // An empty destination is REFUSED, never defaulted to the active level —
    // the §DIAG-WALL-LEVEL trap that files elements on the ground floor.
    if (!newLevelId) return undefined;
    if (existing.levelId === newLevelId) return existing;

    const clone = structuredClone(existing) as CeilingData;
    clone.levelId = newLevelId;
    // `add()` sets `parentId = levelId` when it is absent (`:96`). A ceiling
    // parented to something ELSE than its storey keeps that parent.
    if (existing.parentId === existing.levelId) clone.parentId = newLevelId;
    // Same metadata stamp `update()` applies (`:214-220`) — a storey move is a
    // real modification and must advance the audit trail like any other.
    clone.metadata = {
      ...clone.metadata,
      modifiedAt: Date.now(),
      version: clone.metadata.version + 1,
    };

    freezeCeilingData(clone);
    this._ceilings.set(ceilingId, clone);

    _bus.emit('bim-ceiling-updated', { id: ceilingId });
    storeEventBus.emit({
      elementId: ceilingId,
      elementType: 'ceiling',
      operation: 'update',
      timestamp: Date.now(),
    });
    // §STEP7: `existing` is the frozen pre-mutation record, captured before the
    // clone, so diff-based subscribers can dirty the storey being VACATED.
    this._emit('update', clone, existing);

    return clone;
  }

  remove(ceilingId: string): boolean {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) return false;

    // Clean up hole index.
    for (const hole of existing.holeElements) {
      this._holeIndex.delete(hole.id);
      this._holeIndex.delete(hole.elementId);
    }

    this._ceilings.delete(ceilingId);

    _bus.emit('bim-ceiling-removed', { id: ceilingId });
    storeEventBus.emit({
      elementId: ceilingId,
      elementType: 'ceiling',
      operation: 'delete',
      timestamp: Date.now(),
    });
    this._emit('remove', { id: ceilingId });

    return true;
  }

  /**
   * Undo path — restores a full snapshot. Preserves original metadata (createdAt, version).
   * Does NOT re-validate — caller (command) already validated before storing the snapshot.
   */
  restoreSnapshot(ceiling: CeilingData): void {
    this.add(ceiling);
  }

  /**
   * Triggers a rebuild of the scene geometry without changing semantic state.
   * Used by EngineBootstrap when level elevations change.
   */
  triggerRebuild(ceilingId: string): void {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) return;
    _bus.emit('bim-ceiling-updated', { id: ceilingId });
  }

  // ── Hole API ──────────────────────────────────────────────────────────────

  addHoleElement(ceilingId: string, hole: CeilingHoleElement): boolean {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) return false;
    const clone = structuredClone(existing) as CeilingData;
    (clone as any).holeElements = [...clone.holeElements, structuredClone(hole)];
    clone.metadata = { ...clone.metadata, modifiedAt: Date.now(), version: clone.metadata.version + 1 };
    this._holeIndex.set(hole.id, ceilingId);
    this._holeIndex.set(hole.elementId, ceilingId);
    freezeCeilingData(clone);
    this._ceilings.set(ceilingId, clone);
    _bus.emit('bim-ceiling-updated', { id: ceilingId });
    storeEventBus.emit({ elementId: ceilingId, elementType: 'ceiling', operation: 'update', timestamp: Date.now() });
    this._emit('update', clone, existing); // §STEP7: pre-mutation record
    return true;
  }

  removeHoleElement(ceilingId: string, holeId: string): boolean {
    const existing = this._ceilings.get(ceilingId);
    if (!existing) return false;
    const hole = existing.holeElements.find(h => h.id === holeId);
    if (!hole) return false;
    const clone = structuredClone(existing) as CeilingData;
    (clone as any).holeElements = clone.holeElements.filter(h => h.id !== holeId);
    clone.metadata = { ...clone.metadata, modifiedAt: Date.now(), version: clone.metadata.version + 1 };
    this._holeIndex.delete(hole.id);
    this._holeIndex.delete(hole.elementId);
    freezeCeilingData(clone);
    this._ceilings.set(ceilingId, clone);
    _bus.emit('bim-ceiling-updated', { id: ceilingId });
    storeEventBus.emit({ elementId: ceilingId, elementType: 'ceiling', operation: 'update', timestamp: Date.now() });
    this._emit('update', clone, existing); // §STEP7: pre-mutation record
    return true;
  }

  // ── Read API ──────────────────────────────────────────────────────────────

  getById(ceilingId: string): CeilingData | undefined {
    const ceiling = this._ceilings.get(ceilingId);
    if (!ceiling) return undefined;
    return structuredClone(ceiling) as CeilingData;
  }

  getAll(): CeilingData[] {
    return Array.from(this._ceilings.values()).map(c => structuredClone(c) as CeilingData);
  }

  getByLevel(levelId: string): CeilingData[] {
    return this.getAll().filter(c => c.levelId === levelId);
  }

  getHoleElement(holeId: string): CeilingHoleElement | undefined {
    const ceilingId = this._holeIndex.get(holeId);
    if (!ceilingId) return undefined;
    const ceiling = this._ceilings.get(ceilingId);
    if (!ceiling) return undefined;
    const hole = ceiling.holeElements.find(h => h.id === holeId || h.elementId === holeId);
    return hole ? structuredClone(hole) as CeilingHoleElement : undefined;
  }

  has(ceilingId: string): boolean {
    return this._ceilings.has(ceilingId);
  }

  /** Compute area from stored polygon — delegates to CeilingPolygonUtils. */
  computeArea(ceilingId: string): number {
    const ceiling = this._ceilings.get(ceilingId);
    if (!ceiling) return 0;
    return computeArea(ceiling.boundary.polygon);
  }
}
