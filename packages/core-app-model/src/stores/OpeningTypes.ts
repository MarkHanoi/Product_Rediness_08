import { CoreElement } from '../CoreElement';

/**
 * OpeningData
 *
 * Type safety fix: profile is `{ x: number; y: number }[]` (plain objects), NOT
 * `THREE.Vector2[]`. structuredClone in OpeningStore.add() strips all class methods,
 * so storing or returning Vector2 instances is a type lie — callers that call any
 * Vector2 method on a retrieved profile point would throw at runtime.
 * Plain { x, y } objects correctly represent what is stored and retrieved.
 */
export interface OpeningData extends Omit<CoreElement, 'type'> {
    type: 'opening';
    hostId: string;
    profile: { x: number; y: number }[];
    depth?: number;
    baseOffset?: number;
}
