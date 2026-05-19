// ColumnStore — pure DTO store for the column element family (S12-T3).

import { Store } from '@pryzm/plugin-sdk';
import type { Column as ColumnSchemaInfer } from '@pryzm/plugin-sdk';

export type ColumnData = ColumnSchemaInfer;
export type ColumnId = ColumnData['id'];
export type ColumnsState = Record<string, ColumnData>;

export class ColumnStore extends Store<ColumnData> {
  constructor() { super('column'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly ColumnData[] {
    const out: ColumnData[] = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }
  get(id: string): Readonly<ColumnData> | undefined { return this.state.get(id); }
}
