/**
 * CeilingSystemTypeStore — Registry of named ceiling assemblies.
 * Built-in types are immutable factory presets. Custom types are user-defined.
 * Contract: docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md (§3)
 */

import { CeilingSystemType, CeilingLayer, CeilingTypeCategory } from './CeilingTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

function makeBuiltIn(
  id: string,
  name: string,
  category: CeilingTypeCategory,
  layers: CeilingLayer[],
  description?: string,
  tags?: string[],
  ifcTypeName?: string
): CeilingSystemType {
  const totalThickness = layers.reduce((s, l) => s + l.thickness, 0);
  const now = Date.now();
  return Object.freeze({
    id,
    name,
    description,
    layers: Object.freeze(layers.map(l => Object.freeze({ ...l }))) as CeilingLayer[],
    totalThickness,
    isBuiltIn: true,
    category,
    tags,
    ifcTypeName,
    metadata: Object.freeze({ createdAt: now, modifiedAt: now, createdBy: 'system', version: 1 }),
  }) as CeilingSystemType;
}

// ── Built-in presets ───────────────────────────────────────────────────────
const BUILT_IN_TYPES: CeilingSystemType[] = [
  // Plasterboard systems
  makeBuiltIn(
    'pb-12.5-single',
    'Plasterboard 12.5mm',
    'plasterboard',
    [{ name: 'Plasterboard 12.5mm', function: 'finish', thickness: 0.0125, materialColor: '#F0EEE8' }],
    'Single-layer plasterboard 12.5mm',
    ['plasterboard', 'lightweight'],
    'Plasterboard Ceiling'
  ),
  makeBuiltIn(
    'pb-12.5-double',
    'Plasterboard 25mm (double-layer)',
    'plasterboard',
    [
      { name: 'Plasterboard 12.5mm (top)', function: 'substrate', thickness: 0.0125, materialColor: '#E8E6E0' },
      { name: 'Plasterboard 12.5mm (face)', function: 'finish', thickness: 0.0125, materialColor: '#F0EEE8' },
    ],
    'Double-layer plasterboard 25mm — acoustic/fire upgrade',
    ['plasterboard', 'acoustic', 'fire-rated'],
    'Double-Layer Plasterboard Ceiling'
  ),
  makeBuiltIn(
    'pb-suspended-100',
    'Suspended Plasterboard 100mm void',
    'plasterboard',
    [
      { name: 'Air Void 75mm', function: 'air-gap', thickness: 0.075, materialColor: '#D4EBF2' },
      { name: 'Plasterboard 12.5mm', function: 'finish', thickness: 0.0125, materialColor: '#F0EEE8' },
    ],
    'Suspended plasterboard system with 75mm plenum void',
    ['plasterboard', 'suspended', 'service-void'],
    'Suspended Plasterboard Ceiling'
  ),
  makeBuiltIn(
    'pb-insulated',
    'Insulated Plasterboard System',
    'plasterboard',
    [
      { name: 'Mineral Wool Insulation 50mm', function: 'insulation', thickness: 0.05, materialColor: '#E8D4A0' },
      { name: 'Plasterboard 12.5mm', function: 'finish', thickness: 0.0125, materialColor: '#F0EEE8' },
    ],
    'Acoustic insulation layer + plasterboard face',
    ['plasterboard', 'insulation', 'acoustic'],
    'Insulated Plasterboard Ceiling'
  ),
  // Suspended ACT systems
  makeBuiltIn(
    'act-600x600',
    'Suspended ACT 600×600',
    'suspended-act',
    [
      { name: 'Plenum Void 400mm', function: 'air-gap', thickness: 0.4, materialColor: '#D4EBF2' },
      { name: 'Suspended Grid T-Bar', function: 'suspended-grid', thickness: 0.02, materialColor: '#A0A0A0' },
      { name: 'ACT Tile 600×600×15mm', function: 'finish', thickness: 0.015, materialColor: '#F4F4F0' },
    ],
    'Standard 600×600 mm demountable acoustic ceiling tile on exposed T-bar grid',
    ['act', 'demountable', 'acoustic', '600x600'],
    'Suspended ACT Grid Ceiling'
  ),
  makeBuiltIn(
    'act-1200x600',
    'Suspended ACT 1200×600',
    'suspended-act',
    [
      { name: 'Plenum Void 300mm', function: 'air-gap', thickness: 0.3, materialColor: '#D4EBF2' },
      { name: 'Suspended Grid T-Bar', function: 'suspended-grid', thickness: 0.02, materialColor: '#A0A0A0' },
      { name: 'ACT Tile 1200×600×15mm', function: 'finish', thickness: 0.015, materialColor: '#F4F4F0' },
    ],
    '1200×600 mm linear ACT tile on T-bar grid',
    ['act', 'demountable', '1200x600'],
    'Suspended ACT 1200x600 Ceiling'
  ),
  // Timber
  makeBuiltIn(
    'timber-plank-19',
    'Timber Plank Ceiling 19mm',
    'timber',
    [
      { name: 'Timber Plank 19mm', function: 'finish', thickness: 0.019, materialColor: '#C8A878' },
    ],
    'Solid timber plank ceiling, V-groove or butt-joint',
    ['timber', 'natural', 'plank'],
    'Timber Plank Ceiling'
  ),
  makeBuiltIn(
    'timber-batten',
    'Timber Batten Ceiling',
    'timber',
    [
      { name: 'Air Void', function: 'air-gap', thickness: 0.05, materialColor: '#D4EBF2' },
      { name: 'Timber Batten 25mm', function: 'finish', thickness: 0.025, materialColor: '#C8A878' },
    ],
    'Suspended timber batten with open joint (linear strip)',
    ['timber', 'batten', 'linear'],
    'Timber Batten Ceiling'
  ),
  // Metal
  makeBuiltIn(
    'metal-cassette-0.7',
    'Metal Cassette Panel 0.7mm',
    'metal',
    [
      { name: 'Plenum Void 200mm', function: 'air-gap', thickness: 0.2, materialColor: '#D4EBF2' },
      { name: 'Aluminium Cassette 0.7mm', function: 'finish', thickness: 0.0007, materialColor: '#D8D8D8' },
    ],
    'Aluminium cassette panel system — concealed suspension',
    ['metal', 'aluminium', 'cassette'],
    'Metal Cassette Ceiling'
  ),
  // Specialist
  makeBuiltIn(
    'exposed-concrete',
    'Exposed Concrete Soffit',
    'exposed-concrete',
    [
      { name: 'Concrete Structure', function: 'structure', thickness: 0.2, materialColor: '#B8B8B0' },
    ],
    'Exposed raw concrete soffit — no applied ceiling',
    ['concrete', 'exposed', 'structural'],
    'Exposed Concrete Soffit'
  ),
];

export class CeilingSystemTypeStore {
  private _types = new Map<string, CeilingSystemType>();

  constructor() {
    for (const t of BUILT_IN_TYPES) {
      this._types.set(t.id, t);
    }
  }

  // ── Read API ───────────────────────────────────────────────────────────────
  getById(id: string): CeilingSystemType | undefined {
    const t = this._types.get(id);
    return t ? structuredClone(t) as CeilingSystemType : undefined;
  }

  getAll(): CeilingSystemType[] {
    return Array.from(this._types.values()).map(t => structuredClone(t) as CeilingSystemType);
  }

  getByCategory(category: CeilingTypeCategory): CeilingSystemType[] {
    return this.getAll().filter(t => t.category === category);
  }

  isBuiltIn(id: string): boolean {
    const t = this._types.get(id);
    return !!t?.isBuiltIn;
  }

  // ── Write API (custom types only) ──────────────────────────────────────────
  addCustomType(type: Omit<CeilingSystemType, 'isBuiltIn' | 'metadata'>): CeilingSystemType {
    const now = Date.now();
    const totalThickness = type.layers.reduce((s, l) => s + l.thickness, 0);
    const full: CeilingSystemType = {
      ...type,
      totalThickness,
      isBuiltIn: false,
      metadata: { createdAt: now, modifiedAt: now, createdBy: 'user', version: 1 },
    };
    const frozen = Object.freeze(full);
    this._types.set(frozen.id, frozen);
    storeEventBus.emit({ elementId: frozen.id, elementType: 'ceilingSystemType', operation: 'create', timestamp: Date.now() });
    return structuredClone(frozen) as CeilingSystemType;
  }

  updateCustomType(id: string, updates: Partial<Pick<CeilingSystemType, 'name' | 'description' | 'layers' | 'tags'>>): boolean {
    const existing = this._types.get(id);
    if (!existing) return false;
    if (existing.isBuiltIn) {
      console.warn(`[CeilingSystemTypeStore] Cannot update built-in type "${id}".`);
      return false;
    }
    const layers = updates.layers ?? existing.layers;
    const totalThickness = layers.reduce((s: number, l: CeilingLayer) => s + l.thickness, 0);
    const updated: CeilingSystemType = {
      ...existing,
      ...updates,
      layers,
      totalThickness,
      metadata: { ...existing.metadata, modifiedAt: Date.now(), version: existing.metadata.version + 1 },
    };
    this._types.set(id, Object.freeze(updated));
    storeEventBus.emit({ elementId: id, elementType: 'ceilingSystemType', operation: 'update', timestamp: Date.now() });
    return true;
  }

  deleteCustomType(id: string): boolean {
    const existing = this._types.get(id);
    if (!existing) return false;
    if (existing.isBuiltIn) {
      console.warn(`[CeilingSystemTypeStore] Cannot delete built-in type "${id}".`);
      return false;
    }
    this._types.delete(id);
    storeEventBus.emit({ elementId: id, elementType: 'ceilingSystemType', operation: 'delete', timestamp: Date.now() });
    return true;
  }

  /** Contract 45 — wipe USER-defined ceiling types only. Built-ins preserved. */
  clearCustomTypes(): void {
    for (const [id, t] of [...this._types.entries()]) {
      if (!t.isBuiltIn) {
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: 'ceilingSystemType', operation: 'delete', timestamp: Date.now() });
      }
    }
  }

  /** Clone a built-in type as a user-editable custom type (new UUID). */
  cloneType(id: string, newName: string): CeilingSystemType | undefined {
    const existing = this._types.get(id);
    if (!existing) return undefined;
    const clonedLayers = structuredClone(existing.layers) as CeilingLayer[];
    return this.addCustomType({
      id: crypto.randomUUID(),
      name: newName,
      description: existing.description,
      layers: clonedLayers,
      totalThickness: clonedLayers.reduce((s, l) => s + l.thickness, 0),
      category: 'custom',
      tags: existing.tags ? [...existing.tags] : undefined,
      ifcTypeName: existing.ifcTypeName,
    });
  }

  /** Restore from ProjectSnapshot — re-add custom types without overwriting built-ins. */
  restoreCustomTypes(types: CeilingSystemType[]): void {
    for (const t of types) {
      if (!t.isBuiltIn) {
        this._types.set(t.id, Object.freeze(structuredClone(t) as CeilingSystemType));
      }
    }
  }
}

/** Singleton — imported by EngineBootstrap and ProjectSerializer. */
export const ceilingSystemTypeStore = new CeilingSystemTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'ceilingSystemTypeStore',
    clear: () => ceilingSystemTypeStore.clearCustomTypes(),
});
