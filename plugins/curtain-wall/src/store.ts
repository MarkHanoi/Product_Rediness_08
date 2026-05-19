// CurtainWallStore — pure DTO store for the curtain-wall family (S12-T5).

import { Store } from '@pryzm/plugin-sdk';
import type { CurtainWall as CurtainWallSchemaInfer } from '@pryzm/plugin-sdk';

export type CurtainWallData = CurtainWallSchemaInfer;
export type CurtainWallId = CurtainWallData['id'];
export type CurtainWallsState = Record<string, CurtainWallData>;

export class CurtainWallStore extends Store<CurtainWallData> {
  constructor() { super('curtainwall'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly CurtainWallData[] {
    const out: CurtainWallData[] = [];
    for (const cw of this.state.values()) if (cw.levelId === levelId) out.push(cw);
    return out;
  }
  get(id: string): Readonly<CurtainWallData> | undefined { return this.state.get(id); }
}
