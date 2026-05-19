/**
 * ElementTypeRegistry — Contract 25a §3.1 (Phase 3)
 *
 * Canonical registry of all BIM element types the project can contain,
 * with their default ElementGraphicsRules.
 *
 * Implements element-type inheritance:
 *   specific-type → base-type → '__default__'
 * Example: 'structural-wall' → 'wall' → '__default__'
 *
 * Contract compliance:
 *   Contract 25 §4.2  — ElementGraphicsRules schema
 *   Contract 25a §3.1 — ELEMENT_TYPE_REGISTRY source of truth for defaults
 *   Contract 25a §3.1 — Adding new element type requires one entry here only
 */

import type { ElementGraphicsRules, FillAppearance, LineAppearance } from './VisibilityIntentTypes';
import { defaultRulesForElementType } from './VisibilityIntentDefaults';

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Complete default ElementGraphicsRules for every element type supported by PRYZM.
 *
 * Rules follow AEC drafting conventions:
 *   CUT       — heavy fill + medium/heavy line weight (element is physically sliced)
 *   PROJECTION — thin to medium solid line (element visible below cut plane)
 *   BEYOND    — very thin, reduced opacity (element below view depth limit)
 *   HIDDEN    — not visible by default; ghost=fade for inspection
 */
export const ELEMENT_TYPE_REGISTRY: Record<string, ElementGraphicsRules> = {
    __default__: defaultRulesForElementType('__default__'),

    // ── Structural ────────────────────────────────────────────────────────────

    wall: _makeRules('wall', {
        cutFill: { style: 'poche', colour: '#1a1a1a', opacity: 1 },
        cutLineWeight: 0.50,
        projLineWeight: 0.25,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.55,
    }),

    'structural-wall': _makeRules('structural-wall', {
        cutFill: { style: 'poche', colour: '#111111', opacity: 1 },
        cutLineWeight: 0.70,
        projLineWeight: 0.35,
        beyondLineWeight: 0.18,
        beyondOpacity: 0.45,
    }),

    'curtain-wall': _makeRules('curtain-wall', {
        cutFill: { style: 'none', opacity: 0 },
        cutLineWeight: 0.35,
        projLineWeight: 0.18,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.40,
    }),

    slab: _makeRules('slab', {
        cutFill: { style: 'poche', colour: '#2d2d2d', opacity: 1 },
        cutLineWeight: 0.50,
        projLineWeight: 0.25,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.45,
    }),

    column: _makeRules('column', {
        cutFill: { style: 'poche', colour: '#111111', opacity: 1 },
        cutLineWeight: 0.70,
        projLineWeight: 0.35,
        beyondLineWeight: 0.18,
        beyondOpacity: 0.45,
    }),

    structural: _makeRules('structural', {
        cutFill: { style: 'poche', colour: '#111111', opacity: 1 },
        cutLineWeight: 0.70,
        projLineWeight: 0.35,
        beyondLineWeight: 0.18,
        beyondOpacity: 0.45,
    }),

    beam: _makeRules('beam', {
        cutFill: { style: 'poche', colour: '#1a1a1a', opacity: 1 },
        cutLineWeight: 0.50,
        projLineWeight: 0.25,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.45,
    }),

    // ── Openings ──────────────────────────────────────────────────────────────

    door: {
        elementType: 'door',
        cut: _stateAppearance({ lineWeight: 0.35, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: {
            visible: true,
            line: { style: 'solid', weight: 0.25, colour: '#1a1a1a', opacity: 1 },
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
            symbolicRule: 'plan-door-swing',
        },
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.55, colour: '#6b7280' }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },

    window: {
        elementType: 'window',
        cut: _stateAppearance({ lineWeight: 0.25, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: {
            visible: true,
            line: { style: 'solid', weight: 0.18, colour: '#1a1a1a', opacity: 1 },
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
            symbolicRule: 'plan-window-cased',
        },
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.55, colour: '#6b7280' }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },

    'curtain-panel': {
        elementType: 'curtain-panel',
        cut: _stateAppearance({ lineWeight: 0.25, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: {
            visible: true,
            line: { style: 'solid', weight: 0.18, colour: '#1a1a1a', opacity: 1 },
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
            symbolicRule: 'plan-window-cased',
        },
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.55, colour: '#6b7280' }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },

    // ── Vertical Circulation ──────────────────────────────────────────────────

    stair: _makeRules('stair', {
        cutFill: { style: 'poche', colour: '#3a3a3a', opacity: 0.9 },
        cutLineWeight: 0.35,
        projLineWeight: 0.18,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.40,
    }),

    railing: _makeRules('railing', {
        cutFill: { style: 'none', opacity: 0 },
        cutLineWeight: 0.25,
        projLineWeight: 0.18,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.35,
    }),

    // ── Horizontal Planes ─────────────────────────────────────────────────────

    roof: _makeRules('roof', {
        cutFill: { style: 'poche', colour: '#4a4a4a', opacity: 0.9 },
        cutLineWeight: 0.50,
        projLineWeight: 0.25,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.40,
    }),

    ceiling: _makeRules('ceiling', {
        cutFill: { style: 'hatch', pattern: 'diagonal-45', colour: '#9ca3af', opacity: 0.6 },
        cutLineWeight: 0.25,
        projLineWeight: 0.18,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.35,
    }),

    // ── Furniture & Fittings ──────────────────────────────────────────────────

    furniture: _makeRules('furniture', {
        cutFill: { style: 'none', opacity: 0 },
        cutLineWeight: 0.18,
        projLineWeight: 0.13,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.30,
    }),

    plumbing: _makeRules('plumbing', {
        cutFill: { style: 'none', opacity: 0 },
        cutLineWeight: 0.25,
        projLineWeight: 0.18,
        beyondLineWeight: 0.13,
        beyondOpacity: 0.35,
    }),

    // ── Grid / Annotations ────────────────────────────────────────────────────

    grid: {
        elementType: 'grid',
        cut: _stateAppearance({ lineWeight: 0.13, lineStyle: 'chain', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: _stateAppearance({ lineWeight: 0.13, lineStyle: 'chain', fill: { style: 'none', opacity: 0 }, visible: true }),
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'chain', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.55 }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'chain', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },

    annotation: {
        elementType: 'annotation',
        cut: _stateAppearance({ lineWeight: 0.13, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: _stateAppearance({ lineWeight: 0.13, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true }),
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.5 }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'solid', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },

    level: {
        elementType: 'level',
        cut: _stateAppearance({ lineWeight: 0.18, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true }),
        projection: _stateAppearance({ lineWeight: 0.18, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true }),
        beyond: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: true, opacity: 0.5 }),
        hidden: _stateAppearance({ lineWeight: 0.13, lineStyle: 'dashed', fill: { style: 'none', opacity: 0 }, visible: false, opacity: 0 }),
    },
};

// ─── Alias map for inheritance lookups ────────────────────────────────────────

/** Maps derived type names to their parent base type. */
export const ELEMENT_TYPE_PARENT: Record<string, string> = {
    'structural-wall':   'wall',
    'curtain-wall':      'wall',
    'curtain-panel':     'window',
    'structural-column': 'column',
    'structural-beam':   'beam',
    'structural-slab':   'slab',
};

/**
 * Resolve ElementGraphicsRules for an element type using the registry.
 *
 * Inheritance chain (first match wins):
 *   1. exactType
 *   2. ELEMENT_TYPE_PARENT[exactType]  (e.g. structural-wall → wall)
 *   3. last segment of the type string (e.g. 'structural-wall' → 'wall')
 *   4. '__default__'
 */
export function getElementTypeRules(elementType: string): ElementGraphicsRules {
    if (ELEMENT_TYPE_REGISTRY[elementType]) return ELEMENT_TYPE_REGISTRY[elementType];
    const parent = ELEMENT_TYPE_PARENT[elementType];
    if (parent && ELEMENT_TYPE_REGISTRY[parent]) return ELEMENT_TYPE_REGISTRY[parent];
    const suffix = elementType.split('-').at(-1) ?? elementType;
    if (suffix !== elementType && ELEMENT_TYPE_REGISTRY[suffix]) return ELEMENT_TYPE_REGISTRY[suffix];
    return ELEMENT_TYPE_REGISTRY.__default__!;
}

// ─── Builder helpers (internal) ───────────────────────────────────────────────

interface RuleParams {
    cutFill: FillAppearance;
    cutLineWeight: number;
    projLineWeight: number;
    beyondLineWeight: number;
    beyondOpacity: number;
}

function _makeLine(weight: number, style: LineAppearance['style'] = 'solid', opacity = 1, colour = '#1a1a1a'): LineAppearance {
    return { style, weight, colour, opacity };
}

function _stateAppearance(opts: {
    lineWeight: number;
    lineStyle: LineAppearance['style'];
    fill: FillAppearance;
    visible: boolean;
    opacity?: number;
    colour?: string;
}): import('./VisibilityIntentTypes').ElementStateAppearance {
    return {
        visible: opts.visible,
        line: { style: opts.lineStyle, weight: opts.lineWeight, colour: opts.colour ?? '#1a1a1a', opacity: opts.opacity ?? 1 },
        fill: opts.fill,
        ghostStyle: 'fade',
        ghostOpacity: 0.35,
    };
}

function _makeRules(elementType: string, p: RuleParams): ElementGraphicsRules {
    return {
        elementType,
        cut: {
            visible: true,
            line: _makeLine(p.cutLineWeight),
            fill: p.cutFill,
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
        },
        projection: {
            visible: true,
            line: _makeLine(p.projLineWeight),
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
        },
        beyond: {
            visible: true,
            line: _makeLine(0.13, 'dashed', 0.55, '#6b7280'),
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
        },
        hidden: {
            visible: false,
            line: _makeLine(0.13, 'dashed', 0),
            fill: { style: 'none', opacity: 0 },
            ghostStyle: 'fade',
            ghostOpacity: 0.35,
        },
    };
}
