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

const LAYER_THICKNESS_TOLERANCE = 0.0001; // 0.1 mm

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
  private _listeners = new Set<(event: string, ceiling: CeilingData | { id: string }) => void>();

  subscribe(listener: (event: string, ceiling: CeilingData | { id: string }) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _emit(event: string, payload: CeilingData | { id: string }): void {
    this._listeners.forEach(l => {
      try { l(event, payload); } catch (e) { console.error('[CeilingStore] Listener error:', e); }
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
      if (Math.abs(layerSum - clone.boundary.thickness) > LAYER_THICKNESS_TOLERANCE) {
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
        if (Math.abs(layerSum - clone.boundary.thickness) > LAYER_THICKNESS_TOLERANCE) {
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
    this._emit('update', clone);

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
    this._emit('update', clone);
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
    this._emit('update', clone);
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
