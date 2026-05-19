// Built-in door type catalogue (S11 — `[strategic ADR-017]` v1 starter).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11 line 1187:
//   "by S11 close, packages/types-builtin/{door,window,roof}/ MUST contain
//    at least the v1 starter types per SPEC-05 §7.3 (8 doors, ...)".
//
// Pure data — no Zod parse here (the canonical Door schema lives in
// @pryzm/schemas; consumers bind a type id to a Door by setting the
// `systemTypeId` field at command time).
//
// Each entry mirrors the PRYZM 1 `DoorTypes.ts` defaults (interior /
// exterior / fire / accessible) but trimmed to the 8 most common
// industry families.

export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'sliding';

export interface DoorType {
  /** Stable id — referenced by `Door.systemTypeId`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Family bucket (interior / exterior / fire / accessible). */
  readonly family: 'interior' | 'exterior' | 'fire' | 'accessible';
  /** Default leaf width (m). */
  readonly width: number;
  /** Default leaf height (m). */
  readonly height: number;
  /** Default frame thickness (m). */
  readonly frameThickness: number;
  /** Default frame width (m). */
  readonly frameWidth: number;
  /** Default swing. */
  readonly swing: DoorSwing;
  /** Optional fire rating (e.g. "30/30/30"). */
  readonly fireRating?: string;
  /** Optional accessibility category (e.g. "DDA"). */
  readonly accessibility?: string;
  /** Default leaf colour. */
  readonly leafColor: string;
  /** Default frame colour. */
  readonly frameColor: string;
}

export const BUILTIN_DOOR_TYPES: readonly DoorType[] = Object.freeze([
  {
    id: 'door.interior.single.standard',
    name: 'Interior Single — Standard',
    family: 'interior',
    width: 0.9,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: 'right-in',
    leafColor: '#c2a684',
    frameColor: '#8b7058',
  },
  {
    id: 'door.interior.single.bedroom',
    name: 'Interior Single — Bedroom',
    family: 'interior',
    width: 0.82,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: 'right-in',
    leafColor: '#d3b78f',
    frameColor: '#8b7058',
  },
  {
    id: 'door.interior.double.standard',
    name: 'Interior Double — Standard',
    family: 'interior',
    width: 1.6,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: 'right-in',
    leafColor: '#c2a684',
    frameColor: '#8b7058',
  },
  {
    id: 'door.exterior.single.standard',
    name: 'Exterior Single — Standard',
    family: 'exterior',
    width: 0.92,
    height: 2.1,
    frameThickness: 0.07,
    frameWidth: 0.06,
    swing: 'right-out',
    leafColor: '#5d3a1a',
    frameColor: '#3d2510',
  },
  {
    id: 'door.exterior.double.entrance',
    name: 'Exterior Double — Entrance',
    family: 'exterior',
    width: 1.8,
    height: 2.4,
    frameThickness: 0.08,
    frameWidth: 0.07,
    swing: 'right-out',
    leafColor: '#3a2510',
    frameColor: '#241608',
  },
  {
    id: 'door.fire.single.fd30',
    name: 'Fire Door — FD30 Single',
    family: 'fire',
    width: 0.92,
    height: 2.1,
    frameThickness: 0.06,
    frameWidth: 0.06,
    swing: 'right-in',
    fireRating: 'FD30',
    leafColor: '#5e5e5e',
    frameColor: '#3a3a3a',
  },
  {
    id: 'door.accessible.single.dda',
    name: 'Accessible Single — DDA',
    family: 'accessible',
    width: 1.0,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: 'right-in',
    accessibility: 'DDA',
    leafColor: '#c2a684',
    frameColor: '#8b7058',
  },
  {
    id: 'door.interior.sliding.pocket',
    name: 'Interior Sliding — Pocket',
    family: 'interior',
    width: 0.85,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: 'sliding',
    leafColor: '#d3b78f',
    frameColor: '#8b7058',
  },
] satisfies readonly DoorType[]);

export function getDoorType(id: string): DoorType | undefined {
  return BUILTIN_DOOR_TYPES.find((t) => t.id === id);
}

export const DEFAULT_DOOR_TYPE_ID = 'door.interior.single.standard';
