// Built-in stair type catalogue (S14 — `[strategic ADR-017]` v1 starter).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// Pure data — no Zod parse here.  Consumers bind a type id to a Stair
// by setting `materialId` (the stair schema does not currently carry a
// `systemTypeId` field; runs default to the type's tread/riser geometry).

import type { Stair } from '@pryzm/protocol';

export type StairFamily = 'residential' | 'commercial' | 'industrial' | 'spiral';

export interface StairType {
  readonly id: string;
  readonly name: string;
  readonly family: StairFamily;
  readonly shape: Stair['shape'];
  readonly numRisers: number;
  readonly treadDepth: number;
  readonly riserHeight: number;
  readonly width: number;
  readonly materialId: string;
}

export const BUILTIN_STAIR_TYPES: readonly StairType[] = Object.freeze([
  {
    id: 'stair.residential.straight',
    name: 'Residential — Straight',
    family: 'residential',
    shape: 'straight',
    numRisers: 15,
    treadDepth: 0.28,
    riserHeight: 0.18,
    width: 0.9,
    materialId: 'wood.oak',
  },
  {
    id: 'stair.residential.l-shape',
    name: 'Residential — L-shape',
    family: 'residential',
    shape: 'l-shape',
    numRisers: 16,
    treadDepth: 0.28,
    riserHeight: 0.18,
    width: 0.9,
    materialId: 'wood.oak',
  },
  {
    id: 'stair.commercial.u-shape',
    name: 'Commercial — U-shape',
    family: 'commercial',
    shape: 'u-shape',
    numRisers: 18,
    treadDepth: 0.30,
    riserHeight: 0.17,
    width: 1.2,
    materialId: 'concrete.precast',
  },
  {
    id: 'stair.industrial.straight',
    name: 'Industrial — Straight (Steel grating)',
    family: 'industrial',
    shape: 'straight',
    numRisers: 14,
    treadDepth: 0.25,
    riserHeight: 0.20,
    width: 0.8,
    materialId: 'steel.grate',
  },
] as const);

export const DEFAULT_STAIR_TYPE_ID = BUILTIN_STAIR_TYPES[0]!.id;

export function getStairType(id: string): StairType | undefined {
  return BUILTIN_STAIR_TYPES.find((t) => t.id === id);
}
