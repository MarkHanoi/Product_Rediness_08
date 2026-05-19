// GridStore — pure DTO store for the structural-grid family (S12-T4).

import { Store } from '@pryzm/plugin-sdk';
import type { Grid as GridSchemaInfer } from '@pryzm/plugin-sdk';

export type GridData = GridSchemaInfer;
export type GridId = GridData['id'];
export type GridsState = Record<string, GridData>;

export class GridStore extends Store<GridData> {
  constructor() { super('grid'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  get(id: string): Readonly<GridData> | undefined { return this.state.get(id); }
}
