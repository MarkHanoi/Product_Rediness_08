export type RailingSide = 'left' | 'right';
export type BalusterShape = 'rectangular' | 'round';
export type RailingType = 'none' | 'flat-bar' | 'glass-panel' | 'circular';

export interface StairRailingConfig {
    id: string;
    stairId: string;
    side: RailingSide;
    topRailHeight: number;
    handrailHeight?: number;
    balusterSpacing: number;
    balusterShape: BalusterShape;
    balusterWidth: number;
    postAtStart: boolean;
    postAtEnd: boolean;
    material: string;
    railingType?: RailingType;
    ifcData?: {
        guid: string;
        ifcClass: 'IfcRailing';
        predefinedType: 'HANDRAIL' | 'GUARDRAIL' | 'BALUSTRADE';
    };
}
