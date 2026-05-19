// Built-in roof type catalogue (S11 — `[strategic ADR-017]` v1 starter).
//
// Spec: 4 starter roof types per SPEC-05 §7.3.

import type { Roof } from '@pryzm/schemas';

export type RoofShape = Roof['shape'];

export interface RoofType {
  readonly id: string;
  readonly name: string;
  readonly shape: RoofShape;
  /** Pitch in radians (0 for flat). */
  readonly pitch: number;
  readonly thickness: number;
  readonly overhang: number;
  readonly materialColor: string;
}

export const BUILTIN_ROOF_TYPES: readonly RoofType[] = Object.freeze([
  {
    id: 'roof.flat.standard',
    name: 'Flat — Standard',
    shape: 'flat',
    pitch: 0,
    thickness: 0.2,
    overhang: 0.2,
    materialColor: '#5a5a5a',
  },
  {
    id: 'roof.gable.standard',
    name: 'Gable — Standard 6:12',
    shape: 'gable',
    pitch: Math.atan(6 / 12),
    thickness: 0.2,
    overhang: 0.4,
    materialColor: '#7a4a2a',
  },
  {
    id: 'roof.hip.standard',
    name: 'Hip — Standard 6:12',
    shape: 'hip',
    pitch: Math.atan(6 / 12),
    thickness: 0.2,
    overhang: 0.4,
    materialColor: '#7a4a2a',
  },
  {
    id: 'roof.mansard.standard',
    name: 'Mansard — Standard',
    shape: 'mansard',
    pitch: Math.atan(10 / 12),
    thickness: 0.22,
    overhang: 0.3,
    materialColor: '#3a2a1a',
  },
] satisfies readonly RoofType[]);

export function getRoofType(id: string): RoofType | undefined {
  return BUILTIN_ROOF_TYPES.find((t) => t.id === id);
}

export const DEFAULT_ROOF_TYPE_ID = 'roof.flat.standard';
