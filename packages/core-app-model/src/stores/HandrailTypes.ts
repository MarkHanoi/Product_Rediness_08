import { CoreElement, ElementType } from '../CoreElement';

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

export type HandrailFillType = 'glass' | 'baluster' | 'panel' | 'open';
export type HandrailRailProfile = 'rectangular' | 'round';
export type HandrailBalusterShape = 'rectangular' | 'round';

export interface HandrailRailLayer {
    height: number;
    profile: HandrailRailProfile;
    thickness: number;
    diameter?: number;
    color?: string;
}

export interface HandrailData extends CoreElement {
    type: ElementType;
    baseLine: [Point3D, Point3D];
    height: number;
    thickness: number;
    baseOffset: number;
    materialId?: string;
    materialColor?: string;
    fillType?: HandrailFillType;
    railProfile?: HandrailRailProfile;
    railDiameter?: number;
    postSpacing?: number;
    balusterSpacing?: number;
    balusterShape?: HandrailBalusterShape;
    balusterWidth?: number;
    railStructure?: HandrailRailLayer[];
    parameters?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface HandrailFragment {
    id: string;
    mesh: import('three').Mesh;
    parentId: string;
    levelId: string;
}
