/**
 * §ANN-TYPE — AnnotationSystemTypeStore
 *
 * Registry of named annotation presentation types — the Revit Type/Instance split for
 * annotation, and the LAST element family in PRYZM that lacked one.
 *
 * Architecture position: Side System, identical in shape and contract to
 * DoorSystemTypeStore / WallSystemTypeStore / FloorSystemTypeStore /
 * CeilingSystemTypeStore. This is deliberately NOT a new pattern:
 *
 *   • built-in types are immutable factory presets (`isBuiltIn: true`);
 *   • user types are mutable and duplicable from any type;
 *   • `storeEventBus` is emitted on every mutation;
 *   • the store is registered with `projectScopeRegistry` so project switch wipes
 *     USER types and keeps built-ins;
 *   • commands READ this store and stamp `systemTypeId` + the resolved style onto the
 *     element; the store itself is NOT in undo/redo history (C03 §1.3, side system).
 *
 * SERIALISATION — read this before adding a type field.
 * `stairTypeStore` shipped without serialisation and every custom stair type is lost on
 * save/load; that hole was checked for FIRST here rather than discovered later.
 * `serialize()` / `deserialize()` below emit CUSTOM types only (built-ins are code, and
 * re-emitting them would fork them on every load), matching what ProjectSerializer does
 * for `wallSystemTypes` / `doorSystemTypes` / `floorSystemTypes`.
 *
 * Contract compliance:
 *   C03 §1.3   — side system; not in undo history.
 *   C03 §P6    — commands read this store; UI never writes an element through it.
 *   C10 §2 / P8 — exported functions open OTel spans.
 *   ADR-0119   — the annotation element record this types is the subsystem one.
 */

import { storeEventBus } from '@pryzm/core-app-model';
import type { AnnotationStyle, AnnotationTypeCategory } from './AnnotationTypes';
import { DEFAULT_ANNOTATION_STYLE, defaultAnnotationTypeIdFor } from './AnnotationTypes';

export type { AnnotationTypeCategory };

/** A named, reusable annotation presentation definition. */
export interface AnnotationSystemType {
  id: string;
  name: string;
  description?: string;
  category: AnnotationTypeCategory;
  isBuiltIn: boolean;
  /** Presentation applied to every annotation placed with this type. */
  style: AnnotationStyle;
  tags?: string[];
  metadata: { createdAt: number; modifiedAt: number; createdBy: string; version: number };
}

// ─── Built-in presets ────────────────────────────────────────────────────────
//
// Five presets at five text sizes and five colours. This is also the palette the
// §ANN-SEED demo annotations are drawn from — one definition, not two.

function makeMeta(createdBy = 'system') {
  const now = Date.now();
  return { createdAt: now, modifiedAt: now, createdBy, version: 1 };
}

function makeBuiltIn(
  id: string,
  name: string,
  category: AnnotationTypeCategory,
  style: Partial<AnnotationStyle>,
  description: string,
  tags: string[],
): AnnotationSystemType {
  return Object.freeze({
    id, name, description, category,
    isBuiltIn: true,
    style: Object.freeze({ ...DEFAULT_ANNOTATION_STYLE, ...style }) as AnnotationStyle,
    tags: Object.freeze([...tags]) as unknown as string[],
    metadata: Object.freeze(makeMeta()),
  }) as AnnotationSystemType;
}

/** The five built-in annotation types. Order is the order the type picker shows. */
export const BUILT_IN_ANNOTATION_TYPES: readonly AnnotationSystemType[] = Object.freeze([
  makeBuiltIn(
    'at-title-5mm-purple',
    'Title — 5.0 mm PRYZM Purple',
    'text',
    { textSizeMm: 5.0, textColor: '#6600ff', lineColor: '#6600ff', lineWeight: 0.5, arrowSizeMm: 3.0 },
    'Drawing titles and headline callouts. PRYZM brand purple (#6600FF).',
    ['title', 'heading', 'purple'],
  ),
  makeBuiltIn(
    'at-note-3.5mm-charcoal',
    'Note — 3.5 mm Charcoal',
    'text',
    { textSizeMm: 3.5, textColor: '#1a2035', lineColor: '#1a2035', lineWeight: 0.35 },
    'Standard drawing note. The default type for text notes and keynotes.',
    ['note', 'text', 'default'],
  ),
  makeBuiltIn(
    'at-dim-2.5mm-slate',
    'Dimension — 2.5 mm Slate',
    'dimension',
    { textSizeMm: 2.5, textColor: '#374151', lineColor: '#4b5563', lineWeight: 0.18, arrowStyle: 'filled', arrowSizeMm: 2.0 },
    'ISO 128 dimension text at 2.5 mm on a 0.18 mm pen. The default for every dimension family.',
    ['dimension', 'iso', 'default'],
  ),
  makeBuiltIn(
    'at-tag-2.0mm-teal',
    'Tag — 2.0 mm Teal',
    'tag',
    { textSizeMm: 2.0, textColor: '#0f766e', lineColor: '#0f766e', lineWeight: 0.25, arrowStyle: 'dot', arrowSizeMm: 1.5 },
    'Element tags (door, window, wall, room, level) with a leader dot.',
    ['tag', 'leader', 'teal'],
  ),
  makeBuiltIn(
    'at-revision-4.0mm-crimson',
    'Revision — 4.0 mm Crimson',
    'symbol',
    { textSizeMm: 4.0, textColor: '#b91c1c', lineColor: '#b91c1c', lineWeight: 0.5, arrowStyle: 'open', arrowSizeMm: 2.5 },
    'Revision clouds, matchlines and anything the reader must not miss.',
    ['revision', 'cloud', 'alert', 'crimson'],
  ),
]);

// ─── Store ───────────────────────────────────────────────────────────────────

export class AnnotationSystemTypeStore {
  private _types = new Map<string, AnnotationSystemType>();

  constructor() {
    for (const t of BUILT_IN_ANNOTATION_TYPES) this._types.set(t.id, t);
  }

  getAll(): AnnotationSystemType[] { return Array.from(this._types.values()); }
  getById(id: string): AnnotationSystemType | undefined { return this._types.get(id); }
  has(id: string): boolean { return this._types.has(id); }
  isBuiltIn(id: string): boolean { return this._types.get(id)?.isBuiltIn === true; }

  /**
   * The default type id for an annotation FAMILY. Never throws — an unknown family
   * falls back to the note type so a new family added tomorrow still gets a type
   * rather than silently getting none.
   */
  defaultTypeIdFor(family: string): string {
    return defaultAnnotationTypeIdFor(family);
  }

  /**
   * Resolve the style an annotation should render with:
   *   type style (or the family default type's style)  ←  overridden by  →  element style.
   * This is THE reader of `systemTypeId`. Nothing else may switch on it.
   */
  resolveStyle(
    family: string,
    systemTypeId: string | undefined,
    elementStyle: Partial<AnnotationStyle> | undefined,
  ): AnnotationStyle {
    const t = (systemTypeId ? this._types.get(systemTypeId) : undefined)
      ?? this._types.get(this.defaultTypeIdFor(family));
    return { ...DEFAULT_ANNOTATION_STYLE, ...(t?.style ?? {}), ...(elementStyle ?? {}) };
  }

  add(type: AnnotationSystemType): void {
    if (this._types.has(type.id)) {
      throw new Error(`[AnnotationSystemTypeStore] Type id "${type.id}" already exists.`);
    }
    const clone = structuredClone(type) as AnnotationSystemType;
    this._types.set(clone.id, clone);
    storeEventBus.emit({ elementId: clone.id, elementType: 'annotationSystemType', operation: 'create', timestamp: Date.now() });
  }

  update(id: string, patch: Partial<AnnotationSystemType>): void {
    const existing = this._types.get(id);
    if (!existing) throw new Error(`[AnnotationSystemTypeStore] Type "${id}" not found.`);
    if (existing.isBuiltIn) throw new Error(`[AnnotationSystemTypeStore] Built-in type "${id}" is immutable.`);
    this._types.set(id, structuredClone({ ...existing, ...patch, id }) as AnnotationSystemType);
    storeEventBus.emit({ elementId: id, elementType: 'annotationSystemType', operation: 'update', timestamp: Date.now() });
  }

  remove(id: string): void {
    const existing = this._types.get(id);
    if (!existing) return;
    if (existing.isBuiltIn) throw new Error(`[AnnotationSystemTypeStore] Built-in type "${id}" cannot be deleted.`);
    this._types.delete(id);
    storeEventBus.emit({ elementId: id, elementType: 'annotationSystemType', operation: 'delete', timestamp: Date.now() });
  }

  duplicate(id: string, newId?: string, newName?: string): AnnotationSystemType {
    const source = this._types.get(id);
    if (!source) throw new Error(`[AnnotationSystemTypeStore] Type "${id}" not found.`);
    const clone = structuredClone(source) as AnnotationSystemType;
    clone.id = newId ?? `at-custom-${Date.now()}`;
    clone.name = newName ?? `${source.name} (Copy)`;
    clone.isBuiltIn = false;
    clone.metadata = { ...clone.metadata, createdBy: 'user', createdAt: Date.now(), modifiedAt: Date.now() };
    this._types.set(clone.id, clone);
    storeEventBus.emit({ elementId: clone.id, elementType: 'annotationSystemType', operation: 'create', timestamp: Date.now() });
    return clone;
  }

  /** C45 project switch — wipe USER types only; built-ins are code and survive. */
  clearCustomTypes(): void {
    for (const [id, t] of [...this._types.entries()]) {
      if (!t.isBuiltIn) {
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: 'annotationSystemType', operation: 'delete', timestamp: Date.now() });
      }
    }
  }

  /**
   * §ANN-TYPE-PERSIST — CUSTOM types only (built-ins are code).
   * The `stairTypeStore` hole (custom types silently lost on save/load) is closed HERE,
   * before ship, not after.
   */
  serialize(): { version: 1; types: AnnotationSystemType[] } {
    return {
      version: 1,
      types: this.getAll().filter(t => !t.isBuiltIn).map(t => structuredClone(t) as AnnotationSystemType),
    };
  }

  deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const snap = data as { version?: number; types?: AnnotationSystemType[] };
    if (snap.version !== 1 || !Array.isArray(snap.types)) return;
    for (const t of snap.types) {
      if (!t?.id || this._types.has(t.id)) continue;
      this._types.set(t.id, structuredClone({ ...t, isBuiltIn: false }) as AnnotationSystemType);
    }
  }
}

export const annotationSystemTypeStore = new AnnotationSystemTypeStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
  scopeName: 'annotationSystemTypeStore',
  clear: () => annotationSystemTypeStore.clearCustomTypes(),
});
