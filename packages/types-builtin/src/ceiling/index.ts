// Built-in ceiling type catalogue (S14 — `[strategic ADR-017]` v1 starter).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// Three starter types: residential plaster, commercial gypsum-tile,
// commercial acoustic-tile.

import type { Ceiling } from '@pryzm/protocol';

export type CeilingFamily = 'residential' | 'commercial' | 'industrial';

export interface CeilingType {
  readonly id: string;
  readonly name: string;
  readonly family: CeilingFamily;
  readonly thickness: number;
  readonly defaultHeight: number;
  readonly materialId: string;
  readonly materialColor: Ceiling['materialColor'];
}

export const BUILTIN_CEILING_TYPES: readonly CeilingType[] = Object.freeze([
  {
    id: 'ceiling.residential.plaster',
    name: 'Residential — Plaster',
    family: 'residential',
    thickness: 0.012,
    defaultHeight: 2.4,
    materialId: 'plaster.painted',
    materialColor: '#f5f5f5',
  },
  {
    id: 'ceiling.commercial.gypsum',
    name: 'Commercial — Gypsum',
    family: 'commercial',
    thickness: 0.015,
    defaultHeight: 2.7,
    materialId: 'gypsum.standard',
    materialColor: '#ebebe8',
  },
  {
    id: 'ceiling.commercial.acoustic-tile',
    name: 'Commercial — Acoustic tile (600×600)',
    family: 'commercial',
    thickness: 0.020,
    defaultHeight: 2.7,
    materialId: 'acoustic.tile',
    materialColor: '#e2e2dd',
  },
] as const);

export const DEFAULT_CEILING_TYPE_ID = BUILTIN_CEILING_TYPES[0]!.id;

export function getCeilingType(id: string): CeilingType | undefined {
  return BUILTIN_CEILING_TYPES.find((t) => t.id === id);
}
