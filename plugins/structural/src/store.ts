// StructuralStore — pure DTO store for the second-tier structural family
// (brace / footing / foundation-slab / connection).  S26 / ADR-0026.

import { Store } from '@pryzm/plugin-sdk';
import type { Structural as StructuralSchemaInfer } from '@pryzm/plugin-sdk';

export type StructuralData = StructuralSchemaInfer;
export type StructuralId = StructuralData['id'];
export type StructuralsState = Record<string, StructuralData>;

export class StructuralStore extends Store<StructuralData> {
  constructor() { super('structural'); }
  ids(): readonly string[] { return [...this.state.keys()]; }
  byLevel(levelId: string): readonly StructuralData[] {
    const out: StructuralData[] = [];
    for (const s of this.state.values()) if (s.levelId === levelId) out.push(s);
    return out;
  }
  byKind(kind: StructuralData['kind']): readonly StructuralData[] {
    const out: StructuralData[] = [];
    for (const s of this.state.values()) if (s.kind === kind) out.push(s);
    return out;
  }
  get(id: string): Readonly<StructuralData> | undefined { return this.state.get(id); }
}
