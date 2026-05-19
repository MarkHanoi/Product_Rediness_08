// RoofStore — pure DTO store for the roof element family (S11-T3).
//
// Mirrors `plugins/door/src/store.ts`: THREE-free, self-contained,
// validation-at-handler-boundary.

import { Store } from '@pryzm/plugin-sdk';
import type { Roof as RoofSchemaInfer } from '@pryzm/plugin-sdk';

export type RoofData = RoofSchemaInfer;
export type RoofId = RoofData['id'];
export type RoofsState = Record<string, RoofData>;

export class RoofStore extends Store<RoofData> {
  constructor() {
    super('roof');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  byLevel(levelId: string): readonly RoofData[] {
    const out: RoofData[] = [];
    for (const r of this.state.values()) {
      if (r.levelId === levelId) out.push(r);
    }
    return out;
  }

  get(id: string): Readonly<RoofData> | undefined {
    return this.state.get(id);
  }
}
