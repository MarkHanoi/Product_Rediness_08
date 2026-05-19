// HandrailStore (S14-T4).  Pure DTO store.

import { Store } from '@pryzm/plugin-sdk';
import type { Handrail as HandrailSchemaInfer } from '@pryzm/plugin-sdk';

export type HandrailData = HandrailSchemaInfer;
export type HandrailId = HandrailData['id'];
export type HandrailsState = Record<string, HandrailData>;

export class HandrailStore extends Store<HandrailData> {
  constructor() { super('handrail'); }

  ids(): readonly string[] { return [...this.state.keys()]; }

  byHost(hostId: string): readonly HandrailData[] {
    const out: HandrailData[] = [];
    for (const h of this.state.values()) if (h.hostId === hostId) out.push(h);
    return out;
  }

  get(id: string): Readonly<HandrailData> | undefined {
    return this.state.get(id);
  }
}
