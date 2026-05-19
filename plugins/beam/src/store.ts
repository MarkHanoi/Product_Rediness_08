// BeamStore — pure DTO store for the beam element family (S12-T3).

import { Store } from '@pryzm/plugin-sdk';
import type { Beam as BeamSchemaInfer } from '@pryzm/plugin-sdk';

export type BeamData = BeamSchemaInfer;
export type BeamId = BeamData['id'];
export type BeamsState = Record<string, BeamData>;

export class BeamStore extends Store<BeamData> {
  constructor() { super('beam'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly BeamData[] {
    const out: BeamData[] = [];
    for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
    return out;
  }
  get(id: string): Readonly<BeamData> | undefined { return this.state.get(id); }
}
