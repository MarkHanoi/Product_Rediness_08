// LightingStore — pure DTO store for fixture bodies (S26 / ADR-0023).

import { Store } from '@pryzm/plugin-sdk';
import type { Lighting as LightingSchemaInfer } from '@pryzm/plugin-sdk';

export type LightingData = LightingSchemaInfer;
export type LightingId = LightingData['id'];
export type LightingsState = Record<string, LightingData>;

export class LightingStore extends Store<LightingData> {
  constructor() { super('lighting'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly LightingData[] {
    const out: LightingData[] = [];
    for (const l of this.state.values()) if (l.levelId === levelId) out.push(l);
    return out;
  }
  emergency(): readonly LightingData[] {
    const out: LightingData[] = [];
    for (const l of this.state.values()) if (l.isEmergency) out.push(l);
    return out;
  }
  get(id: string): Readonly<LightingData> | undefined { return this.state.get(id); }
}
