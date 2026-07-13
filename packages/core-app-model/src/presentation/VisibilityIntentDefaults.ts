import { resolvePen, type PenZone } from '../drawing/PenWeightTable';
// §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the DEFAULT cut poché tone is owned by
// the pen/graphics table (Contract-23 §3), not re-typed here. The intent seeds from
// it, so "light grey by default" is written down in exactly ONE place and any view /
// template / purpose modifier can still override it (C09 / P7).
import { defaultPocheFillForCategory } from '../drawing/PocheFillTable';
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

/**
 * The DEFAULT cut fill for an element type.
 *
 * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the tone comes from the pen/graphics table
 * (Contract-23 §3), not from a literal here. It used to be `#111111` — near-black — a
 * default nobody had ever SEEN, because `A-WALL:cut` was empty until L-246; the first
 * frame that ever painted a wall poché would have painted it black and swallowed every
 * symbol inside the wall body. The founder's requirement ("a filled light grey, by
 * DEFAULT, through the visibility intent settings") is therefore satisfied where it
 * belongs: as the SEED of the intent chain (C09/P7), fully overridable by any view,
 * template or purpose modifier — never as a hardcode in a builder.
 *
 * `structural` has no ISO layer of its own (it is a synonym category); it inherits the
 * column tone, which is the heaviest of the ladder.
 */
function fillFor(elementType: string, state: ElementState): FillAppearance {
    if (state !== 'cut') return { style: 'none', opacity: 0 };
    const category = elementType === 'structural' ? 'column' : elementType;
    const colour = defaultPocheFillForCategory(category);
    if (!colour) return { style: 'none', opacity: 0 };
    return { style: 'poche', colour, opacity: 1 };
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
