// BoundaryLineDimensions — THE ONE PLACE A BOUNDARY-LINE DIMENSION COMES FROM.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7908) · C106 §4 · L-127 (no dimensional
// literals outside a resolver) · C100 (an element that renders a solid names a REAL
// material).
//
// The chain, strongest first:  record → systemType → documented default.
//
// ⛔ No builder, no symbol, no command and no tool handler may read a boundary-line
// dimension any other way, and none may carry a dimensional constant of its own. The
// pool family enforces exactly this with `poolNoLiterals.test.ts`; this family ships
// the same guard (`boundaryLineNoLiterals.test.ts`) in the same commit as the
// resolver, so the rule is never briefly unenforced.

import { trace, type Tracer } from '@opentelemetry/api';
import type { BoundaryLineData } from './BoundaryLineTypes';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/geometry-boundary-line', '0.1.0');
}

/**
 * Tier 3 — the DOCUMENTED defaults, and the only dimensional literals in this family.
 *
 * `height` 3.0 m — one storey, so a boundary line switched to VOLUME reads
 * immediately as the massing edge of a floor rather than as a kerb. It matches the
 * repo's own default storey height (`SetLevelHeightCommand`'s `level.height ?? 3.0`),
 * which is the number the rest of the product already means by "a floor".
 *
 * `thickness` 0.2 m — the default wall thickness the wall tool uses, because the
 * commonest thing a volumetric boundary line stands in for at early-stage design is
 * a wall that has not been drawn yet. Sharing the number means the massing does not
 * visibly jump when it is later replaced by real walls.
 *
 * `baseOffset` 0 — on the level's FFL. Not "near zero": exactly zero, so a line with
 * no authored offset sits where the storey sits.
 */
export const BOUNDARY_LINE_DEFAULTS = Object.freeze({
    height: 3.0,
    thickness: 0.2,
    baseOffset: 0,
});

/** Tier 2 — a named boundary-line system type. */
export interface BoundaryLineSystemType {
    readonly id: string;
    readonly name: string;
    readonly height?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly materialId?: string;
    readonly materialColor?: string;
}

export interface ResolvedBoundaryLineDimensions {
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    /** Which tier answered, per field — so a panel can show "from type" vs "authored". */
    readonly source: Readonly<Record<'height' | 'thickness' | 'baseOffset', 'record' | 'systemType' | 'default'>>;
}

/**
 * Resolve every dimension of a boundary line. Total: never throws, never returns
 * `undefined`, and always says WHICH tier answered.
 *
 * P8: emits `pryzm.boundary_line.resolve_dimensions`.
 */
export function resolveBoundaryLineDimensions(
    line: Pick<BoundaryLineData, 'height' | 'thickness' | 'baseOffset' | 'systemTypeId'>,
    systemType?: BoundaryLineSystemType | null,
): ResolvedBoundaryLineDimensions {
    return _tracer().startActiveSpan('pryzm.boundary_line.resolve_dimensions', (span) => {
        try {
            const pick = (
                record: number | undefined,
                type: number | undefined,
                fallback: number,
            ): [number, 'record' | 'systemType' | 'default'] => {
                if (typeof record === 'number' && Number.isFinite(record)) return [record, 'record'];
                if (typeof type === 'number' && Number.isFinite(type)) return [type, 'systemType'];
                return [fallback, 'default'];
            };

            const [height, hSrc] = pick(line.height, systemType?.height, BOUNDARY_LINE_DEFAULTS.height);
            const [thickness, tSrc] = pick(line.thickness, systemType?.thickness, BOUNDARY_LINE_DEFAULTS.thickness);
            const [baseOffset, bSrc] = pick(line.baseOffset, systemType?.baseOffset, BOUNDARY_LINE_DEFAULTS.baseOffset);

            span.setAttribute('pryzm.boundary_line.height', height);
            span.setAttribute('pryzm.boundary_line.thickness', thickness);
            return {
                height,
                thickness,
                baseOffset,
                source: { height: hSrc, thickness: tSrc, baseOffset: bSrc },
            };
        } finally {
            span.end();
        }
    });
}

/**
 * ⭐ C100 — WHAT COLOUR IS THIS THING, AND IS THAT COLOUR ACTUALLY ITS MATERIAL?
 *
 * `HandrailFragmentBuilder` reports, for every balcony shipped this week:
 *   *"3 handrails have NO RESOLVABLE MATERIAL … the colour on screen is NOT these
 *    elements' material"* — a surface painted a fallback tint that no schedule, no
 *    IFC export and no material editor can see. This family does not repeat it.
 *
 * The rule, stated once:
 *   · `hasVolume: false` → the element renders NO SURFACE. It legitimately has no
 *     material, and this returns `{ kind: 'linework' }`. ⛔ That is NOT a failure and
 *     a caller must not log it as one — linework is styled by the visibility intent's
 *     pen (C09), which is a different authority from a material and must not be
 *     collapsed into one.
 *   · `hasVolume: true` → a material is REQUIRED. Record, then systemType. If neither
 *     names one, this returns `{ kind: 'unresolved' }` **with the reason**, and the
 *     builder's contract is to REFUSE TO PAINT A COLOUR rather than invent a tint
 *     that lies about the record.
 */
export type BoundaryLineMaterialResolution =
    | { readonly kind: 'linework' }
    | { readonly kind: 'resolved'; readonly materialId: string; readonly materialColor?: string; readonly source: 'record' | 'systemType' }
    | { readonly kind: 'unresolved'; readonly reason: string };

export function resolveBoundaryLineMaterial(
    line: Pick<BoundaryLineData, 'hasVolume' | 'materialId' | 'materialColor' | 'systemTypeId'>,
    systemType?: BoundaryLineSystemType | null,
): BoundaryLineMaterialResolution {
    if (!line.hasVolume) return { kind: 'linework' };
    if (line.materialId) {
        return {
            kind: 'resolved',
            materialId: line.materialId,
            materialColor: line.materialColor,
            source: 'record',
        };
    }
    if (systemType?.materialId) {
        return {
            kind: 'resolved',
            materialId: systemType.materialId,
            materialColor: systemType.materialColor,
            source: 'systemType',
        };
    }
    return {
        kind: 'unresolved',
        reason:
            'This boundary line has VOLUME switched on but names no material, and no boundary-line '
            + 'system type supplies one. C100 requires a solid to name a real material — pick one in '
            + 'the property panel, or switch volume off to keep it as linework.',
    };
}

/**
 * ⭐ THE FOUNDER'S BOOL, AND WHO WINS WHEN TWO AUTHORITIES DISAGREE.
 *
 *   *"The line could have volume also, via a bool setting on Visibility Intent."*
 *
 * There are TWO inputs and ONE answer, and the precedence is written down here so it
 * is never decided twice:
 *
 *   1. **The VIEW's visibility intent** (`ElementGraphicsRules.solid`, C09 / P7) wins
 *      where it expresses an opinion. That is what makes "show the boundary lines as
 *      massing in the 3-D view and as linework in the 1:100 plan" one model with two
 *      views, rather than two models.
 *   2. **The record's `hasVolume`** is the fallback — the element's own authored
 *      intent, used by every view whose intent says nothing.
 *
 * ⚠ `undefined` and `false` are DIFFERENT VALUES on the intent side and must not be
 * collapsed: `undefined` means *this view has no opinion*, `false` means *this view
 * says linework*. Reading `intentSolid ?? record` would be correct; reading
 * `intentSolid || record` would silently turn every "this view says linework" into
 * "ask the record", which is the emptiness/failure collapse in one operator.
 */
export function resolveBoundaryLineSolidity(
    line: Pick<BoundaryLineData, 'hasVolume'>,
    intentSolid?: boolean,
): { readonly solid: boolean; readonly source: 'intent' | 'record' } {
    if (typeof intentSolid === 'boolean') return { solid: intentSolid, source: 'intent' };
    return { solid: line.hasVolume, source: 'record' };
}
