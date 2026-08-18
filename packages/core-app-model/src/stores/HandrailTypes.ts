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
    /**
     * §FEAT-HANDRAIL-INFILL-MAX-GAP (C95 §9, D5) — the maximum CLEAR opening
     * permitted between adjacent balusters, in metres.
     *
     * This is a CODE value, not a styling one: most guarding standards state the
     * rule as "a sphere of D mm must not pass through" (0.099 m under the common
     * 100 mm sphere rule; 0.089 m where a 90 mm rule applies). `balusterSpacing`
     * is a CENTRE-TO-CENTRE pitch, which is a different quantity — a 0.11 m pitch
     * with 0.02 m balusters leaves a 0.09 m gap, and the two numbers are only
     * equal when the baluster has zero width.
     *
     * ⚠ EI-8: this does NOT duplicate `balusterSpacing`. It is the CONSTRAINT;
     * the pitch is the RESULT. `HandrailFragmentBuilder` derives
     * `pitch = infillMaxGap + balusterWidth` only when no explicit
     * `balusterSpacing` / `postSpacing` is present, so an authored pitch always
     * wins and no existing handrail changes shape.
     */
    infillMaxGap?: number;
    /**
     * §FEAT-HANDRAIL-RUN-JOIN (C95 §D4) — suppress THIS segment's START post.
     *
     * A multi-segment run (an L-shaped rail, or a closed square / circular /
     * elliptical guard) is stored as N two-point handrails that share their
     * interior vertices. `HandrailFragmentBuilder` emits an end post at BOTH ends
     * of every segment, so a shared vertex would receive TWO coincident posts —
     * visible as a thickened, z-fighting stub at every corner and at the closure
     * point of a loop.
     *
     * The run generator therefore makes each vertex the responsibility of exactly
     * ONE segment: every segment after the first suppresses its start post, and in
     * a CLOSED loop the first segment suppresses its too (the last segment's END
     * post already stands on that vertex). Absent / false → previous behaviour,
     * bit-identical, so every existing handrail is unaffected.
     */
    suppressStartPost?: boolean;
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
