/**
 * FloorSystemTypeStore — Named floor assembly type registry.
 *
 * Built-in types are pre-loaded at construction and cannot be removed.
 * Users can add, edit, and remove custom types.
 * Exported singleton: floorSystemTypeStore
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/04-FLOOR-TYPE-SYSTEM-CONTRACT.md
 */

import { FloorSystemType, FloorTypeCategory, FloorZoneType } from './FloorTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

// ── Built-in type definitions ─────────────────────────────────────────────

function makeMeta(): FloorSystemType['metadata'] {
  return { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'system', version: 1 };
}

const BUILT_IN_TYPES: Omit<FloorSystemType, 'isBuiltIn'>[] = [
  {
    id: 'floor-type-porcelain-tile',
    name: 'Porcelain Tile (600×600)',
    description: 'Standard commercial porcelain tile on bed mortar over screed.',
    category: 'tile-stone',
    zoneTypes: ['dry', 'wet'],
    totalThickness: 0.075,
    layers: [
      { name: 'Porcelain Tile', function: 'finish', thickness: 0.010, materialColor: '#C8C0B8' },
      { name: 'Tile Adhesive', function: 'adhesive', thickness: 0.005, materialColor: '#A8A8A8' },
      { name: 'Sand-Cement Screed', function: 'screed', thickness: 0.060, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-marble-tile',
    name: 'Marble Tile (600×600)',
    description: 'Natural marble on thin-bed adhesive over screed.',
    category: 'tile-stone',
    zoneTypes: ['dry'],
    totalThickness: 0.080,
    layers: [
      { name: 'Marble Tile', function: 'finish', thickness: 0.020, materialColor: '#E8E0D0' },
      { name: 'Tile Adhesive', function: 'adhesive', thickness: 0.005, materialColor: '#A8A8A8' },
      { name: 'Sand-Cement Screed', function: 'screed', thickness: 0.055, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-carpet-tile',
    name: 'Carpet Tile (500×500)',
    description: 'Self-adhesive carpet tile on existing substrate.',
    category: 'carpet',
    zoneTypes: ['dry'],
    totalThickness: 0.010,
    layers: [
      { name: 'Carpet Tile', function: 'finish', thickness: 0.010, materialColor: '#8B7D7B' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-broadloom-carpet',
    name: 'Broadloom Carpet on Underlay',
    description: 'Woven broadloom carpet on foam underlay.',
    category: 'carpet',
    zoneTypes: ['dry'],
    totalThickness: 0.014,
    layers: [
      { name: 'Broadloom Carpet', function: 'finish', thickness: 0.010, materialColor: '#9B8B89' },
      { name: 'Foam Underlay', function: 'insulation', thickness: 0.004, materialColor: '#D0C8C0' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-engineered-timber',
    name: 'Engineered Timber Board',
    description: 'Engineered timber board on acoustic underlay.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.020,
    layers: [
      { name: 'Engineered Timber', function: 'finish', thickness: 0.014, materialColor: '#A0784A' },
      { name: 'Acoustic Underlay', function: 'insulation', thickness: 0.006, materialColor: '#D8D0C8' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-solid-oak',
    name: 'Solid Oak Board',
    description: 'Solid oak tongue & groove board, secret nailed to timber battens.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.075,
    layers: [
      { name: 'Solid Oak Board', function: 'finish', thickness: 0.020, materialColor: '#C09060' },
      { name: 'Timber Batten', function: 'substrate', thickness: 0.045, materialColor: '#C8B090' },
      { name: 'Vapour Barrier', function: 'tanking', thickness: 0.001, materialColor: '#C8D8E8' },
      { name: 'Acoustic Underlay', function: 'insulation', thickness: 0.009, materialColor: '#D8D0C8' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-luxury-vinyl',
    name: 'Luxury Vinyl Tile (LVT)',
    description: 'LVT on cushion or direct-glue to screed.',
    category: 'vinyl-resilient',
    zoneTypes: ['dry', 'wet'],
    totalThickness: 0.008,
    layers: [
      { name: 'LVT Plank', function: 'finish', thickness: 0.005, materialColor: '#B0A898' },
      { name: 'Acoustic Underlay', function: 'insulation', thickness: 0.003, materialColor: '#D8D0C8' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-rubber-sports',
    name: 'Rubber Sports Flooring',
    description: 'Rubber sports floor on impact-absorbing sub-layer.',
    category: 'vinyl-resilient',
    zoneTypes: ['dry'],
    totalThickness: 0.015,
    layers: [
      { name: 'Rubber Finish Layer', function: 'finish', thickness: 0.008, materialColor: '#6B7A6B' },
      { name: 'Shock Pad', function: 'insulation', thickness: 0.007, materialColor: '#A0A8A0' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-epoxy-resin',
    name: 'Epoxy Resin (Self-Levelling)',
    description: 'Multi-coat epoxy resin on power-floated concrete/screed.',
    category: 'resin-concrete',
    zoneTypes: ['dry', 'wet', 'cleanroom', 'food-safe'],
    totalThickness: 0.005,
    layers: [
      { name: 'Epoxy Finish Coat', function: 'finish', thickness: 0.002, materialColor: '#D8C8B0' },
      { name: 'Epoxy Body Coat', function: 'screed', thickness: 0.003, materialColor: '#C8C0B0' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-ufh-screed',
    name: 'Underfloor Heating in Screed',
    description: 'Wet UFH pipe matrix in flow screed on thermal insulation.',
    category: 'screed',
    zoneTypes: ['dry'],
    totalThickness: 0.115,
    layers: [
      { name: 'Floor Finish (TBA)', function: 'finish', thickness: 0.010, materialColor: '#D4C4A8' },
      { name: 'UFH Flow Screed', function: 'underfloor-heating', thickness: 0.065, materialColor: '#FF8C42' },
      { name: 'Thermal Insulation (PIR)', function: 'insulation', thickness: 0.040, materialColor: '#FFD580' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-raised-access',
    name: 'Raised Access Floor',
    description: 'Raised access floor on adjustable pedestals.',
    category: 'raised-access',
    zoneTypes: ['dry', 'cleanroom'],
    totalThickness: 0.150,
    layers: [
      { name: 'Access Floor Tile', function: 'finish', thickness: 0.032, materialColor: '#909090' },
      { name: 'Pedestal + Air Gap', function: 'substrate', thickness: 0.118, materialColor: '#C0C0C0' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-type-wet-area-tanked',
    name: 'Wet Area — Tanked (Tile)',
    description: 'Porcelain tile on screed with full waterproof membrane below.',
    category: 'tile-stone',
    zoneTypes: ['wet'],
    totalThickness: 0.085,
    layers: [
      { name: 'Porcelain Tile', function: 'finish', thickness: 0.010, materialColor: '#C8C0B8' },
      { name: 'Tile Adhesive', function: 'adhesive', thickness: 0.005, materialColor: '#A8A8A8' },
      { name: 'Sand-Cement Screed', function: 'screed', thickness: 0.050, materialColor: '#D0CABC' },
      { name: 'Waterproof Membrane', function: 'tanking', thickness: 0.005, materialColor: '#6BAED6', wetAreaCompliant: true },
      { name: 'Screed Bed', function: 'substrate', thickness: 0.015, materialColor: '#C8C0B0' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },

  // ── Premium Floor Finishes ─────────────────────────────────────────────────

  {
    id: 'floor-finish-oak-herringbone',
    name: 'Oak Herringbone Parquet',
    description: 'Classic herringbone solid oak parquet planks (22×220×50mm) direct-glued on acoustic underlay. Colour variation and subtle grain rotation per plank give a luxury, non-repetitive appearance.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.031,
    tags: ['parquet', 'herringbone', 'premium', 'residential'],
    layers: [
      { name: 'Solid Oak Parquet (Herringbone)', function: 'finish',     thickness: 0.022, materialId: 'wood-oak',             materialColor: '#C49A54', roughness: 0.55 },
      { name: 'Parquet Adhesive',                function: 'adhesive',   thickness: 0.003, materialColor: '#B8B0A0' },
      { name: 'Acoustic Rubber Underlay',         function: 'insulation', thickness: 0.006, materialColor: '#D4CCB8', acousticImpactRating: 19 },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-oak-smoked-chevron',
    name: 'Smoked Oak Chevron Parquet',
    description: 'Luxury chevron parquet in thermally smoked oak (20×200×45mm). Deep espresso tones with grain microvariation. Glued on resilient acoustic underlay.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.029,
    tags: ['parquet', 'chevron', 'smoked', 'luxury'],
    layers: [
      { name: 'Smoked Oak Parquet (Chevron)', function: 'finish',     thickness: 0.020, materialId: 'wood-oak-smoked',     materialColor: '#6B523A', roughness: 0.50 },
      { name: 'Parquet Adhesive',              function: 'adhesive',   thickness: 0.003, materialColor: '#A8A098' },
      { name: 'Acoustic Rubber Underlay',      function: 'insulation', thickness: 0.006, materialColor: '#D0C8B8', acousticImpactRating: 19 },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-walnut-herringbone',
    name: 'Walnut Herringbone Parquet',
    description: 'Premium American walnut herringbone parquet (22×220×50mm). Rich chocolate grain with UV-oil satin finish. Each plank has subtle colour and roughness variation.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.033,
    tags: ['parquet', 'herringbone', 'walnut', 'premium'],
    layers: [
      { name: 'Walnut Parquet (Herringbone)', function: 'finish',     thickness: 0.022, materialId: 'wood-walnut',         materialColor: '#5C3D22', roughness: 0.45 },
      { name: 'Parquet Adhesive',             function: 'adhesive',   thickness: 0.003, materialColor: '#A09080' },
      { name: 'Acoustic Rubber Underlay',     function: 'insulation', thickness: 0.008, materialColor: '#D0C8B8', acousticImpactRating: 21 },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-scandi-blonde-oak',
    name: 'Scandinavian Blonde Oak (Wide Plank)',
    description: 'Pale whitewashed engineered oak in wide planks (15mm, 220mm wide). Light, airy Scandi aesthetic with low-sheen lacquer. On foam acoustic underlay.',
    category: 'timber',
    zoneTypes: ['dry'],
    totalThickness: 0.025,
    tags: ['engineered', 'scandi', 'wide-plank', 'whitewash'],
    layers: [
      { name: 'Whitewashed Engineered Oak', function: 'finish',     thickness: 0.020, materialId: 'wood-oak-whitewashed', materialColor: '#D8CDB8', roughness: 0.62 },
      { name: 'Foam Acoustic Underlay',     function: 'insulation', thickness: 0.005, materialColor: '#E0D8C8', acousticImpactRating: 15 },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-carrara-marble',
    name: 'Carrara Marble — Polished Slab',
    description: 'Polished Carrara marble slabs (20mm thick, large format 900×1800mm). White ground with soft grey veining. Laid on thin-bed adhesive over semi-dry screed. Roughness 0.20 (mirror-adjacent).',
    category: 'tile-stone',
    zoneTypes: ['dry'],
    totalThickness: 0.080,
    tags: ['marble', 'carrara', 'polished', 'luxury', 'italian'],
    layers: [
      { name: 'Carrara Marble Slab (Polished)', function: 'finish',  thickness: 0.020, materialId: 'stone-marble-white',  materialColor: '#F0EDE8', roughness: 0.20 },
      { name: 'Large-Format Tile Adhesive',     function: 'adhesive', thickness: 0.005, materialColor: '#C0B8B0' },
      { name: 'Semi-Dry Sand-Cement Screed',    function: 'screed',   thickness: 0.055, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-calacatta-gold',
    name: 'Calacatta Gold Marble — Polished',
    description: 'Calacatta Gold marble (20mm slabs). Brilliant white ground with bold gold and grey veins — among the most prized Italian marbles. Bookmatched layout, 0.15 roughness.',
    category: 'tile-stone',
    zoneTypes: ['dry'],
    totalThickness: 0.085,
    tags: ['marble', 'calacatta', 'gold', 'polished', 'luxury', 'italian'],
    layers: [
      { name: 'Calacatta Gold Marble (Polished)', function: 'finish',  thickness: 0.020, materialId: 'stone-marble-white',  materialColor: '#EDE4D0', roughness: 0.15 },
      { name: 'Epoxy-Modified Tile Adhesive',     function: 'adhesive', thickness: 0.005, materialColor: '#C0B8A8' },
      { name: 'Semi-Dry Screed',                  function: 'screed',   thickness: 0.060, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-black-marquina',
    name: 'Black Marquina Marble — Honed',
    description: 'Nero Marquina marble (20mm) in honed (matt-smooth) finish. Jet black with dramatic white veining. Thin-bed adhesive over screed. Roughness 0.30 (honed, not polished).',
    category: 'tile-stone',
    zoneTypes: ['dry'],
    totalThickness: 0.085,
    tags: ['marble', 'black', 'marquina', 'honed', 'luxury'],
    layers: [
      { name: 'Black Marquina Marble (Honed)', function: 'finish',  thickness: 0.020, materialId: 'stone-granite-black',  materialColor: '#2A2422', roughness: 0.30 },
      { name: 'Epoxy-Modified Tile Adhesive',  function: 'adhesive', thickness: 0.005, materialColor: '#808078' },
      { name: 'Semi-Dry Screed',               function: 'screed',   thickness: 0.060, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-granite-polished',
    name: 'Light Grey Granite — Polished',
    description: 'Polished light grey granite (20mm slabs, 600×600mm). Speckled crystalline surface, metalness ~0.05. Highly durable for commercial lobbies and heavy-traffic areas.',
    category: 'tile-stone',
    zoneTypes: ['dry', 'wet'],
    totalThickness: 0.080,
    tags: ['granite', 'polished', 'grey', 'commercial'],
    layers: [
      { name: 'Polished Grey Granite',      function: 'finish',  thickness: 0.020, materialId: 'stone-granite-grey',  materialColor: '#979EA6', roughness: 0.15 },
      { name: 'Thin-Bed Tile Adhesive',     function: 'adhesive', thickness: 0.005, materialColor: '#B0A8A0' },
      { name: 'Sand-Cement Screed',         function: 'screed',   thickness: 0.055, materialColor: '#D0CABC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-polished-concrete',
    name: 'Polished Burnished Concrete',
    description: 'Power-floated and diamond-burnished concrete slab. No topping — the structural slab is ground smooth (1200-grit). Hardener sealer applied. Minimal roughness (0.22) gives architectural sheen.',
    category: 'resin-concrete',
    zoneTypes: ['dry', 'wet'],
    totalThickness: 0.076,
    tags: ['concrete', 'polished', 'industrial', 'minimalist', 'burnished'],
    layers: [
      { name: 'Burnished Concrete Surface',    function: 'finish',  thickness: 0.010, materialId: 'concrete-polished-light', materialColor: '#D7D5CF', roughness: 0.22 },
      { name: 'Power-Float Structural Slab',   function: 'screed',   thickness: 0.065, materialColor: '#C8C6C0' },
      { name: 'DPM (Damp-Proof Membrane)',     function: 'tanking',  thickness: 0.001, materialColor: '#7BC8D4', wetAreaCompliant: true },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
  {
    id: 'floor-finish-terrazzo-fine',
    name: 'Terrazzo — Fine Aggregate (Modern)',
    description: 'Poured-in-place terrazzo topping (15mm) with fine marble chip aggregate set in white cement matrix. Brass divider strips at 600mm centres. Ground and polished to satin. Timeless premium material.',
    category: 'resin-concrete',
    zoneTypes: ['dry', 'wet'],
    totalThickness: 0.067,
    tags: ['terrazzo', 'marble-chip', 'premium', 'polished', 'brass'],
    layers: [
      { name: 'Terrazzo Topping (Marble Chip)', function: 'finish',   thickness: 0.015, materialId: 'concrete-terrazzo-fine', materialColor: '#D8D2C4', roughness: 0.28 },
      { name: 'Brass Divider Strips + Bond',    function: 'adhesive',  thickness: 0.002, materialColor: '#C8A040' },
      { name: 'Levelling Screed',               function: 'screed',    thickness: 0.050, materialColor: '#D4CEBC' },
    ],
    ifcTypeName: 'FLOORING',
    metadata: makeMeta(),
  },
];

// ── Store implementation ──────────────────────────────────────────────────

type FloorSystemTypeListener = (
  event: 'add' | 'update' | 'remove',
  type: FloorSystemType
) => void;

export class FloorSystemTypeStore {
  private _types = new Map<string, FloorSystemType>();
  private _listeners: FloorSystemTypeListener[] = [];

  constructor() {
    for (const raw of BUILT_IN_TYPES) {
      const t: FloorSystemType = { ...raw, isBuiltIn: true };
      this._types.set(t.id, Object.freeze(t) as FloorSystemType);
    }
  }

  // ── Write API ─────────────────────────────────────────────────────────────

  /**
   * Add a custom system type.
   * Built-in IDs are rejected.
   */
  addCustomType(
    params: Omit<FloorSystemType, 'id' | 'isBuiltIn' | 'totalThickness' | 'metadata'>
    & { id?: string }
  ): FloorSystemType {
    const id = params.id ?? crypto.randomUUID();

    if (BUILT_IN_TYPES.find(b => b.id === id)) {
      throw new Error(`[FloorSystemTypeStore] Cannot overwrite built-in type "${id}".`);
    }

    const totalThickness = params.layers.reduce((s, l) => s + l.thickness, 0);
    const type: FloorSystemType = {
      id,
      name: params.name,
      description: params.description,
      layers: [...params.layers],
      totalThickness,
      isBuiltIn: false,
      category: params.category,
      zoneTypes: [...params.zoneTypes],
      tags: params.tags ? [...params.tags] : undefined,
      ifcTypeName: params.ifcTypeName,
      metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'user', version: 1 },
    };

    this._types.set(id, Object.freeze(type) as FloorSystemType);
    storeEventBus.emit({ elementId: id, elementType: 'floorSystemType', operation: 'create', timestamp: Date.now() });
    this._emit('add', type);
    return type;
  }

  add(
    params: Omit<FloorSystemType, 'id' | 'isBuiltIn' | 'totalThickness' | 'metadata'>
    & { id?: string }
  ): FloorSystemType {
    return this.addCustomType(params);
  }

  updateCustomType(id: string, updates: Partial<Omit<FloorSystemType, 'id' | 'isBuiltIn'>>): FloorSystemType | undefined {
    const existing = this._types.get(id);
    if (!existing) return undefined;
    if (existing.isBuiltIn) {
      console.warn(`[FloorSystemTypeStore] Cannot update built-in type "${id}".`);
      return existing;
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      isBuiltIn: false,
      totalThickness: updates.layers
        ? updates.layers.reduce((s, l) => s + l.thickness, 0)
        : existing.totalThickness,
      metadata: { ...existing.metadata, modifiedAt: Date.now(), version: (existing.metadata.version ?? 0) + 1 },
    } as FloorSystemType;

    this._types.set(id, Object.freeze(updated) as FloorSystemType);
    storeEventBus.emit({ elementId: id, elementType: 'floorSystemType', operation: 'update', timestamp: Date.now() });
    this._emit('update', updated);
    return updated;
  }

  /** Contract 45 — wipe USER-defined floor types only. Built-ins preserved. */
  clearCustomTypes(): void {
    for (const [id, t] of [...this._types.entries()]) {
      if (!t.isBuiltIn) {
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: 'floorSystemType', operation: 'delete', timestamp: Date.now() });
        this._emit('remove', t);
      }
    }
  }

  removeCustomType(id: string): boolean {
    const existing = this._types.get(id);
    if (!existing) return false;
    if (existing.isBuiltIn) {
      console.warn(`[FloorSystemTypeStore] Cannot remove built-in type "${id}".`);
      return false;
    }
    this._types.delete(id);
    storeEventBus.emit({ elementId: id, elementType: 'floorSystemType', operation: 'delete', timestamp: Date.now() });
    this._emit('remove', existing);
    return true;
  }

  // ── Read API ──────────────────────────────────────────────────────────────

  getById(id: string): FloorSystemType | undefined {
    return this._types.get(id);
  }

  getAll(): FloorSystemType[] {
    return Array.from(this._types.values());
  }

  getBuiltIns(): FloorSystemType[] {
    return this.getAll().filter(t => t.isBuiltIn);
  }

  getCustom(): FloorSystemType[] {
    return this.getAll().filter(t => !t.isBuiltIn);
  }

  isBuiltIn(id: string): boolean {
    return this._types.get(id)?.isBuiltIn ?? false;
  }

  getByCategory(category: FloorTypeCategory): FloorSystemType[] {
    return this.getAll().filter(t => t.category === category);
  }

  getByZone(zone: FloorZoneType): FloorSystemType[] {
    return this.getAll().filter(t => t.zoneTypes.includes(zone));
  }

  subscribe(listener: FloorSystemTypeListener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  }

  private _emit(event: 'add' | 'update' | 'remove', type: FloorSystemType): void {
    for (const l of this._listeners) {
      try { l(event, type); } catch (e) { console.error('[FloorSystemTypeStore] Listener error:', e); }
    }
  }
}

/** Singleton — imported by EngineBootstrap and ProjectSerializer. */
export const floorSystemTypeStore = new FloorSystemTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'floorSystemTypeStore',
    clear: () => floorSystemTypeStore.clearCustomTypes(),
});
