// Built-in handrail type catalogue (S14 — `[strategic ADR-017]` v1 starter).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// Three starter types covering the most common rail families
// (residential round, commercial round, industrial flat-bar).

import type { Handrail } from '@pryzm/protocol';

export type HandrailFamily = 'residential' | 'commercial' | 'industrial';

export interface HandrailType {
  readonly id: string;
  readonly name: string;
  readonly family: HandrailFamily;
  readonly shape: Handrail['shape'];
  readonly height: number;
  readonly diameter: number;
  readonly materialId: string;
}

export const BUILTIN_HANDRAIL_TYPES: readonly HandrailType[] = Object.freeze([
  {
    id: 'handrail.residential.round',
    name: 'Residential — Round timber',
    family: 'residential',
    shape: 'round',
    height: 0.9,
    diameter: 0.045,
    materialId: 'wood.oak',
  },
  {
    id: 'handrail.commercial.round',
    name: 'Commercial — Round steel',
    family: 'commercial',
    shape: 'round',
    height: 1.1,
    diameter: 0.05,
    materialId: 'steel.painted',
  },
  {
    id: 'handrail.industrial.flat',
    name: 'Industrial — Flat-bar steel',
    family: 'industrial',
    shape: 'flat',
    height: 1.1,
    diameter: 0.06,
    materialId: 'steel.galvanised',
  },
] as const);

export const DEFAULT_HANDRAIL_TYPE_ID = BUILTIN_HANDRAIL_TYPES[0]!.id;

export function getHandrailType(id: string): HandrailType | undefined {
  return BUILTIN_HANDRAIL_TYPES.find((t) => t.id === id);
}
