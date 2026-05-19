import * as THREE from '@pryzm/renderer-three/three';
import type { ToiletVariant } from './ToiletGeometry';
import type { ShowerVariant } from './ShowerGeometry';
import type { BathroomAccessoryVariant } from './BathroomAccessoryGeometry';

/**
 * Plumbing fixture families. The `accessory` family covers bathroom
 * interior items that share the Services placement / IFC pipeline but
 * are not themselves connected to wet plumbing (washing machine,
 * toilet brush, toilet paper holder, laundry hamper, iron, ironing
 * board). See docs/01_ELEMENTS/11_Bathroom_Contract.
 */
export type PlumbingFixtureType = 'toilet' | 'sink' | 'urinal' | 'bidet' | 'bath' | 'shower' | 'accessory';

export interface PlumbingFixtureData {
    id: string;
    type: 'plumbing_fixture';
    fixtureType: PlumbingFixtureType;
    /**
     * LOD400 sub-family. Only meaningful when fixtureType === 'toilet'.
     * Persisted in the DTO and rebuilt deterministically by
     * PlumbingFragmentBuilder. See docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md.
     */
    toiletVariant?: ToiletVariant;
    /**
     * LOD400 sub-family. Only meaningful when fixtureType === 'shower'.
     * Same type-as-data pattern as toiletVariant — Contract 39 §7.
     */
    showerVariant?: ShowerVariant;
    /**
     * LOD400 sub-family. Only meaningful when fixtureType === 'accessory'.
     * Same type-as-data pattern as toiletVariant — Contract 39 §7.
     */
    accessoryVariant?: BathroomAccessoryVariant;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    levelId: string;
    levelName: string;
    levelElevation: number;
    baseOffset: number;
    properties: Record<string, any>;
    width?: number;
    height?: number;
    length?: number;
    color?: string;
    startPoint?: { x: number, y: number, z: number };
    endPoint?: { x: number, y: number, z: number };
}
