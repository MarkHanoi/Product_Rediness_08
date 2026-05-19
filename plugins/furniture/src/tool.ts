// FurniturePlacementTool — single-click placement of the catalogue's
// currently-selected entry (S27 / ADR-0027 §5).
//
// THREE-free.  The wrapping renderer projects the click to a Vec3 via
// `screenToWorld`, then this tool resolves the catalogue entry, copies
// its representations + size into a `furniture.create` payload, and
// dispatches it.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { isFiniteVec3 } from './intent.js';
import type { FurnitureData } from './store.js';
import type { FurnitureCatalogue, FurnitureCatalogueEntry } from './catalogue/index.js';

export const FURNITURE_TOOL_ID = 'furniture.placement';

export interface FurnitureToolPoint3D { x: number; y: number; z: number }

export type FurnitureScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => FurnitureToolPoint3D | undefined;

export interface FurniturePlacementToolDeps {
  readonly commandBus: CommandBus;
  readonly screenToWorld: FurnitureScreenToWorld;
  readonly catalogue: FurnitureCatalogue;
  readonly levelId?: () => string;
  /** Default `activeLod` for new placements (0..4); falls back to 2. */
  readonly activeLod?: () => FurnitureData['activeLod'];
  /** Default Y-rotation for placements (radians); falls back to 0. */
  readonly rotation?: () => number;
  /** Override the catalogue's `current()` entry (used by tests). */
  readonly entryProvider?: () => FurnitureCatalogueEntry | undefined;
}

export class FurniturePlacementTool {
  private readonly bus: CommandBus;
  private readonly screenToWorld: FurnitureScreenToWorld;
  private readonly catalogue: FurnitureCatalogue;
  private readonly levelId: () => string;
  private readonly activeLod: () => FurnitureData['activeLod'];
  private readonly rotation: () => number;
  private readonly entryProvider: () => FurnitureCatalogueEntry | undefined;

  constructor(deps: FurniturePlacementToolDeps) {
    if (!deps.commandBus) throw new Error('[FurniturePlacementTool] commandBus is required');
    if (!deps.screenToWorld) throw new Error('[FurniturePlacementTool] screenToWorld is required');
    if (!deps.catalogue) throw new Error('[FurniturePlacementTool] catalogue is required');
    this.bus = deps.commandBus;
    this.screenToWorld = deps.screenToWorld;
    this.catalogue = deps.catalogue;
    this.levelId = deps.levelId ?? (() => '');
    this.activeLod = deps.activeLod ?? (() => 2);
    this.rotation = deps.rotation ?? (() => 0);
    this.entryProvider = deps.entryProvider ?? (() => this.catalogue.current());
  }

  async onPointerDown(ev: {
    clientX: number; clientY: number; pointerId: number;
  }): Promise<string | undefined> {
    const p = this.screenToWorld(ev);
    if (!isFiniteVec3(p)) return undefined;
    const entry = this.entryProvider();
    if (!entry) return undefined;

    const id = createId('furniture');
    await this.bus.executeCommand('furniture.create', {
      id,
      origin: p,
      catalogId: entry.id,
      rotation: this.rotation(),
      scale: 1,
      size: entry.size,
      activeLod: this.activeLod(),
      representations: entry.representations,
      materialSlots: entry.materialSlots ?? {},
      materialId: entry.materialId,
      levelId: this.levelId(),
    });
    return id;
  }
}
