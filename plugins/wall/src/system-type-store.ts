// WallSystemTypeStore — catalogue of named wall system-types (S07-T8 sibling).
//
// Mirrors `src/elements/walls/WallSystemTypeStore.ts:263` (8 built-ins +
// project-scoped user types).  As in PRYZM 1, this store is NOT part of
// the undo/redo history — wall types are project-level configuration,
// not element mutations.  Commands READ from this store (to validate
// `systemTypeId` references) but never WRITE to it; type management is
// a separate UI concern that lands in 1C.
//
// No THREE.  No DOM.  Lives in the same plugin as the wall data store
// so the catalogue can be looked up via plain object reference inside
// handlers (no global lookup, no `(window as any)` antipattern).

/** Layer-function vocabulary — mirrors `Wall.layers[i].function` in
 *  the schema.  Identical strings so a layer in the catalogue can be
 *  copied verbatim into a `WallData.layers[]` slot. */
export type WallLayerFunction =
  | 'finish-exterior'
  | 'substrate'
  | 'insulation'
  | 'air-barrier'
  | 'structure'
  | 'finish-interior';

export interface WallLayer {
  readonly name: string;
  readonly function: WallLayerFunction;
  /** Layer thickness in metres. */
  readonly thickness: number;
  readonly materialId?: string;
  readonly materialColor?: string;
}

export interface WallSystemType {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly layers: readonly WallLayer[];
  /** Sum of layer thicknesses in metres — denormalised for inspector
   *  use; recomputed when layers change. */
  readonly totalThickness: number;
  readonly createdAt: number;
  readonly modifiedAt: number;
}

function makeBuiltIn(
  id: string,
  name: string,
  description: string,
  layers: WallLayer[],
): WallSystemType {
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  return {
    id,
    name,
    description,
    layers,
    // 6dp round to keep equality tests stable across floating-point ops.
    totalThickness: Math.round(total * 1_000_000) / 1_000_000,
    createdAt: 0,
    modifiedAt: 0,
  };
}

export const BUILTIN_WALL_TYPES: readonly WallSystemType[] = [
  makeBuiltIn(
    'wt-monolithic',
    'Monolithic (Default)',
    'Single-material wall — identical to pre-type-system walls.',
    [
      { name: 'Wall Body', thickness: 0.1, function: 'structure', materialColor: '#d4c5b0' },
    ],
  ),
  makeBuiltIn(
    'wt-interior-partition',
    'Interior – Partition 100mm',
    'Lightweight interior partition: plaster / stud / plaster.',
    [
      { name: 'Plaster (Inner)', thickness: 0.012, function: 'finish-interior', materialColor: '#f0ece4' },
      { name: 'Stud / Cavity',  thickness: 0.076, function: 'structure',       materialColor: '#d4b896' },
      { name: 'Plaster (Outer)', thickness: 0.012, function: 'finish-exterior', materialColor: '#f0ece4' },
    ],
  ),
  makeBuiltIn(
    'wt-exterior-brick',
    'Exterior – Brick 300mm',
    'Cavity brick wall: brick / cavity / insulation / blockwork / plaster.',
    [
      { name: 'Face Brick',     thickness: 0.110, function: 'finish-exterior', materialColor: '#c0674a' },
      { name: 'Air Cavity',     thickness: 0.050, function: 'air-barrier',     materialColor: '#e8e8e8' },
      { name: 'Insulation',     thickness: 0.060, function: 'insulation',      materialColor: '#f5e07a' },
      { name: 'Concrete Block', thickness: 0.140, function: 'structure',       materialColor: '#a0a0a0' },
      { name: 'Internal Render', thickness: 0.015, function: 'finish-interior', materialColor: '#f0ece4' },
    ],
  ),
  makeBuiltIn(
    'wt-exterior-concrete',
    'Exterior – Concrete 250mm',
    'Insulated concrete wall: render / insulation / concrete / plaster.',
    [
      { name: 'External Render', thickness: 0.015, function: 'finish-exterior', materialColor: '#c8bfa8' },
      { name: 'Insulation',      thickness: 0.080, function: 'insulation',      materialColor: '#f5e07a' },
      { name: 'Concrete',        thickness: 0.200, function: 'structure',       materialColor: '#909090' },
      { name: 'Plaster',         thickness: 0.012, function: 'finish-interior', materialColor: '#f0ece4' },
    ],
  ),
  makeBuiltIn(
    'wt-cmu-200',
    'CMU – 200mm Block',
    'Concrete masonry unit wall, painted both faces.',
    [
      { name: 'Paint (Exterior)', thickness: 0.001, function: 'finish-exterior', materialColor: '#dddddd' },
      { name: 'CMU Block',        thickness: 0.200, function: 'structure',       materialColor: '#a0a0a0' },
      { name: 'Paint (Interior)', thickness: 0.001, function: 'finish-interior', materialColor: '#f5f5f5' },
    ],
  ),
  makeBuiltIn(
    'wt-glazed-curtain-stub',
    'Glazed – Curtain Stub 50mm',
    'Single-pane stub used by tools that need a thin glazed wall placeholder.',
    [{ name: 'Glazing', thickness: 0.05, function: 'finish-exterior', materialColor: '#7ec8e3' }],
  ),
  makeBuiltIn(
    'wt-stud-150',
    'Stud Wall – 150mm',
    'Timber stud wall with insulation core and gypsum facings.',
    [
      { name: 'Gypsum (Outer)', thickness: 0.0125, function: 'finish-exterior', materialColor: '#efe9da' },
      { name: 'Insulation',     thickness: 0.125,  function: 'insulation',      materialColor: '#f5e07a' },
      { name: 'Gypsum (Inner)', thickness: 0.0125, function: 'finish-interior', materialColor: '#efe9da' },
    ],
  ),
  makeBuiltIn(
    'wt-foundation-300',
    'Foundation – Concrete 300mm',
    'Below-grade foundation wall, no finishes by default.',
    [{ name: 'Concrete', thickness: 0.300, function: 'structure', materialColor: '#7d7d7d' }],
  ),
];

/** Read-only catalogue of wall system types.  Project-scoped user types
 *  are added via `add()` and are reachable via `get()` / `list()` —
 *  but mutations DO NOT route through the CommandBus (per the PRYZM 1
 *  contract carried forward into PRYZM 2). */
export class WallSystemTypeStore {
  private readonly types = new Map<string, WallSystemType>();

  constructor(seed: readonly WallSystemType[] = BUILTIN_WALL_TYPES) {
    for (const t of seed) this.types.set(t.id, t);
  }

  get(id: string): Readonly<WallSystemType> | undefined {
    return this.types.get(id);
  }

  has(id: string): boolean {
    return this.types.has(id);
  }

  list(): readonly Readonly<WallSystemType>[] {
    return [...this.types.values()];
  }

  /** Register a project-scoped user type.  Throws on duplicate id. */
  add(type: WallSystemType): void {
    if (this.types.has(type.id)) {
      throw new Error(`[WallSystemTypeStore] duplicate type id: ${type.id}`);
    }
    this.types.set(type.id, type);
  }

  size(): number {
    return this.types.size;
  }
}
