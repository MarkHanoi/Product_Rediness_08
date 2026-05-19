// CeilingStore (S14-T8).  Pure DTO store.

import { Store } from '@pryzm/plugin-sdk';
import type { Ceiling as CeilingSchemaInfer } from '@pryzm/plugin-sdk';

export type CeilingData = CeilingSchemaInfer;
export type CeilingId = CeilingData['id'];
export type CeilingsState = Record<string, CeilingData>;

export class CeilingStore extends Store<CeilingData> {
  constructor() { super('ceiling'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly CeilingData[] {
    const out: CeilingData[] = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }
  get(id: string): Readonly<CeilingData> | undefined { return this.state.get(id); }
}
