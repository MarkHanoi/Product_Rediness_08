// DimensionStore — pure DTO store for measurement annotations (S29 / ADR-0028).

import { Store } from '@pryzm/plugin-sdk';
import type { Dimension as DimensionSchemaInfer } from '@pryzm/plugin-sdk';

export type DimensionData = DimensionSchemaInfer;
export type DimensionId = DimensionData['id'];
export type DimensionsState = Record<string, DimensionData>;

export class DimensionStore extends Store<DimensionData> {
  constructor() { super('dimension'); }

  ids(): readonly string[] { return [...this.state.keys()]; }

  byLevel(levelId: string): readonly DimensionData[] {
    const out: DimensionData[] = [];
    for (const d of this.state.values()) if (d.levelId === levelId) out.push(d);
    return out;
  }

  byView(viewId: string): readonly DimensionData[] {
    const out: DimensionData[] = [];
    for (const d of this.state.values()) if (d.viewId === viewId) out.push(d);
    return out;
  }

  get(id: string): Readonly<DimensionData> | undefined { return this.state.get(id); }
}
