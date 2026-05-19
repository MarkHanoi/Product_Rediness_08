import * as THREE from '@pryzm/renderer-three/three';

export type DoorType =
    | 'none'
    | 'hinged-left'
    | 'hinged-right'
    | 'double-hinged'
    | 'sliding'
    | 'glass'
    | 'translucent-glass'
    | 'mirror';

export type InteriorComponentType = 
    | 'shelf'
    | 'drawer'
    | 'hanger-rod'
    | 'divider'
    | 'mirror-panel'
    | 'lighting-strip';

export interface InteriorComponent {
    type: InteriorComponentType;
    positionY: number; // 0 to 1 relative or absolute meters
    count?: number;
    properties?: Record<string, any>;
}

export interface WardrobeSection {
    width: number;
    doorType: DoorType;
    components: InteriorComponent[];

    // 🔥 Added optional flags for edge detection
    isFirst?: boolean;
    isLast?: boolean;
}

export type CornerBehavior = 'branch1-dominant' | 'branch2-dominant' | 'corner-module';

export interface WardrobeConfig {
    width: number;
    height: number;
    depth: number;
    sections: WardrobeSection[];
    showDoors?: boolean;

    // Corner Wardrobe Specific
    isCorner?: boolean;
    cornerPoint?: THREE.Vector3;
    sideSections?: WardrobeSection[]; // Sections for the second branch
    sideWidth?: number;
    widthBranchTwo?: number;
    lengthBranchTwo?: number;
    cornerBehavior?: CornerBehavior;
    showDebug?: boolean;
}