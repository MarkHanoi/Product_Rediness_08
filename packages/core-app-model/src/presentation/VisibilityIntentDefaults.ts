import { resolvePen, type PenZone } from '../drawing/PenWeightTable';
import type {
    ElementGraphicsRules,
    ElementState,
    ElementStateAppearance,
    FillAppearance,
    LineAppearance,
} from './VisibilityIntentTypes';

const ELEMENT_TYPES = [
    '__default__',
    'wall',
    'slab',
    'column',
    'structural',
    'beam',
    'door',
    'window',
    'stair',
    'roof',
    'ceiling',
    'furniture',
    'plumbing',
    'grid',
    'annotation',
    'level',
    'ifc-element',
] as const;

const STATE_TO_ZONE: Record<ElementState, PenZone> = {
    cut: 'CUT',
    projection: 'PROJECTION',
    beyond: 'BEYOND',
    hidden: 'HIDDEN',
};

function dashStyle(dashPx: number[] | null): LineAppearance['style'] {
    if (!dashPx || dashPx.length === 0) return 'solid';
    if (dashPx.length === 2 && dashPx[0]! <= 2 && dashPx[1]! <= 2) return 'dotted';
    if (dashPx.length > 2) return 'chain';
    return 'dashed';
}

function fillFor(elementType: string, state: ElementState): FillAppearance {
    if (state !== 'cut') return { style: 'none', opacity: 0 };
    if (['wall', 'slab', 'column', 'structural', 'beam', 'roof'].includes(elementType)) {
        return { style: 'poche', colour: '#111111', opacity: 1 };
    }
    return { style: 'none', opacity: 0 };
}

export function defaultStateAppearance(elementType: string, state: ElementState): ElementStateAppearance {
    const visible = state !== 'hidden';
    const category = elementType === '__default__' ? 'wall' : elementType;
    const pen = resolvePen(STATE_TO_ZONE[state], category);
    const line: LineAppearance = {
        style: visible ? dashStyle(pen.dashPx) : 'solid',
        weight: visible ? pen.widthMm : 0,
        colour: visible ? pen.color : '#000000',
        opacity: visible ? pen.opacity : 0,
    };
    return {
        visible,
        line,
        fill: fillFor(category, state),
        ghostStyle: 'fade',
        ghostOpacity: 0.35,
    };
}

export function defaultRulesForElementType(elementType: string): ElementGraphicsRules {
    return {
        elementType,
        cut: defaultStateAppearance(elementType, 'cut'),
        projection: defaultStateAppearance(elementType, 'projection'),
        beyond: defaultStateAppearance(elementType, 'beyond'),
        hidden: defaultStateAppearance(elementType, 'hidden'),
    };
}

export const DEFAULT_ELEMENT_GRAPHICS_RULES: Record<string, ElementGraphicsRules> = Object.freeze(
    ELEMENT_TYPES.reduce<Record<string, ElementGraphicsRules>>((acc, elementType) => {
        acc[elementType] = defaultRulesForElementType(elementType);
        return acc;
    }, {}),
);

export function cloneDefaultElementGraphicsRules(): Record<string, ElementGraphicsRules> {
    return JSON.parse(JSON.stringify(DEFAULT_ELEMENT_GRAPHICS_RULES));
}
