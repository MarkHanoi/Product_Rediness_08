export interface BeamData {
    id: string;
    levelId: string;
    parentId?: string;

    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };

    width: number;
    depth: number;

    startSupportId?: string;
    endSupportId?: string;
    startSupportType?: 'column' | 'wall' | 'beam';
    endSupportType?: 'column' | 'wall' | 'beam';

    material?: string;
    loadBearing: boolean;
    fireRating?: string;

    /**
     * Steel profile name (e.g. "254x146x37") — used when sectionType is 'UB'.
     * Must match a name in SteelProfileLibrary.
     * When set, BeamFragmentBuilder uses parametric I-section geometry.
     */
    steelProfileName?: string;

    /**
     * Section type:
     *   'rectangular' = concrete/generic box
     *   'UB'          = steel Universal Beam I-section (parametric)
     *   'UC'          = steel Universal Column used as a beam (less common)
     */
    sectionType?: 'rectangular' | 'UB' | 'UC';

    properties: {
        mark?: string;
        [key: string]: any;
    };
    ifcData?: {
        guid: string;
        ifcClass: 'IfcBeam';
    };

    metadata?: Record<string, any>;
}

export interface BeamSupport {
    elementId: string;
    elementType: 'column' | 'wall' | 'beam';
    connectionPoint: { x: number; y: number; z: number };
}

export const BEAM_CONSTRAINTS = {
    MIN_WIDTH: 0.15,
    MAX_WIDTH: 1.0,
    MIN_DEPTH: 0.20,
    MAX_DEPTH: 2.0,

    MIN_SPAN: 0.5,
    MAX_SPAN: 20.0,

    MAX_SPAN_TO_DEPTH_RATIO: 20,
    RECOMMENDED_SPAN_TO_DEPTH_RATIO: 15,

    MIN_DEPTH_RATIO: 1 / 20,

    STANDARD_WIDTHS: [0.20, 0.25, 0.30, 0.35, 0.40],
    STANDARD_DEPTHS: [0.30, 0.40, 0.50, 0.60, 0.80, 1.0],
};

export type RiskLevel = 'low' | 'medium' | 'high';

export interface BeamPlanCheck {
    id: string;
    name: string;
    check: (context: any) => { passed: boolean; reason?: string };
}
