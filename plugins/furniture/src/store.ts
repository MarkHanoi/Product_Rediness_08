// FurnitureStore — pure DTO store for catalog instances (S27 / ADR-0027).

import { Store } from '@pryzm/plugin-sdk';
import type { Furniture as FurnitureSchemaInfer } from '@pryzm/plugin-sdk';

export type FurnitureData = FurnitureSchemaInfer;
export type FurnitureId = FurnitureData['id'];
export type FurnituresState = Record<string, FurnitureData>;

export class FurnitureStore extends Store<FurnitureData> {
  constructor() { super('furniture'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly FurnitureData[] {
    const out: FurnitureData[] = [];
    for (const f of this.state.values()) if (f.levelId === levelId) out.push(f);
    return out;
  }
  byCatalogId(catalogId: string): readonly FurnitureData[] {
    const out: FurnitureData[] = [];
    for (const f of this.state.values()) if (f.catalogId === catalogId) out.push(f);
    return out;
  }
  get(id: string): Readonly<FurnitureData> | undefined { return this.state.get(id); }
}
