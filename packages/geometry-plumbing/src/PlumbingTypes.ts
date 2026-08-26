import * as THREE from '@pryzm/renderer-three/three';
import type { ToiletVariant } from './ToiletGeometry';
import type { ShowerVariant } from './ShowerGeometry';
import type { BathroomAccessoryVariant } from './BathroomAccessoryGeometry';
// §GRAPH115 / ADR-0374 — type-only import: erased at runtime, so the
// plumbing → command-registry → plumbing type cycle never loads a barrel.
import type { WallAnchor } from '@pryzm/command-registry';

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
     * PlumbingFragmentBuilder. See docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md.
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
    /**
     * §GRAPH115 / ADR-0374 — the wall this fixture was placed AGAINST, recorded at
     * placement from the tool's own snap target (the identity half of §PLUMBFRAME:
     * the origin already sits on the wall-contact edge, the yaw already comes from
     * the wall's room-side normal — this is WHICH wall). Additive-optional (C47);
     * absent = placed free. Read by WallAnchorDependencyTracker so a wall move
     * carries the fixture; cleared (kept in place) when the host is deleted.
     */
    wallAnchor?: WallAnchor;
}
