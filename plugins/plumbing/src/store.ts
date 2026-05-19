// PlumbingStore — pure DTO store for pipe runs (S26 / ADR-0026).

import { Store } from '@pryzm/plugin-sdk';
import type { Plumbing as PlumbingSchemaInfer } from '@pryzm/plugin-sdk';

export type PlumbingData = PlumbingSchemaInfer;
export type PlumbingId = PlumbingData['id'];
export type PlumbingsState = Record<string, PlumbingData>;

export class PlumbingStore extends Store<PlumbingData> {
  constructor() { super('plumbing'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly PlumbingData[] {
    const out: PlumbingData[] = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }
  bySystem(tag: string): readonly PlumbingData[] {
    const out: PlumbingData[] = [];
    for (const p of this.state.values()) if (p.systemTag === tag) out.push(p);
    return out;
  }
  get(id: string): Readonly<PlumbingData> | undefined { return this.state.get(id); }
}
