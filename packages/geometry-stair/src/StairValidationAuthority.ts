/**
 * StairValidationAuthority — §STAIR-AUDIT-2026 Sprint R2 (FIXED 2026-04-25)
 *
 * Single authoritative validation surface for all stair rules.
 *
 * Closes:
 *   - F14 (validation triplicate): all rules previously duplicated across
 *     `StairStore.validateStairParameters`, `CreateStairCommand.canExecute`,
 *     and `StairConstraintEngine` are unified here.
 *   - F15 (dead `validateStairParameters`): the old store method is deleted;
 *     the lone caller (`ValidateStairCommand`) now routes through this
 *     authority.
 *   - F7 (region-locked constants, partial): the authority accepts an
 *     optional region parameter so per-region stair codes can override the
 *     defaults.  Default is the AS 1657 / European set already in use.
 *
 * The authority is purely functional — it never mutates a stair, never
 * touches a store, never dispatches an event.
 */

import {
    StairData,
    StairValidationResult,
    StairValidationError,
    StairValidationWarning,
    STAIR_CONSTRAINTS,
    StairValidationConstraints,
} from './StairTypes';
import { Level } from '@pryzm/geometry-wall';
import type { StairTypeStore } from './StairTypeStore';

/**
 * §F7 partial fix: region-aware constraint sets.  Code consumers can request
 * the IBC-USA set for an American project, etc.
 */
export const STAIR_CONSTRAINTS_REGIONS: Record<string, StairValidationConstraints> = {
    'AS-1657':   STAIR_CONSTRAINTS,
    'EUROPEAN':  STAIR_CONSTRAINTS,
    'IBC-USA':  {
        ...STAIR_CONSTRAINTS,
        MAX_RISER_HEIGHT: 0.200, // IBC allows 200 mm rise
        MIN_TREAD_DEPTH:  0.250,
    },
};

export type StairCodeRegion = keyof typeof STAIR_CONSTRAINTS_REGIONS;

export interface StairValidationContext {
    levels: Level[];
    typeStore?: StairTypeStore;
    region?: StairCodeRegion;
}

export class StairValidationAuthority {

    /**
     * Validate a stair (full or partial) against the unified ruleset.
     *
     * Used by:
     *   - ValidateStairCommand (run-on-demand from the property panel)
     *   - CreateStairCommand.canExecute (delegates the field-level subset
     *     so the rules cannot drift)
     *   - StairConstraintEngine (consults the same rules)
     *
     * @returns full validation result with errors + warnings.
     */
    static validate(
        stair: Partial<StairData>,
        ctx: StairValidationContext,
    ): StairValidationResult {
        const errors: StairValidationError[] = [];
        const warnings: StairValidationWarning[] = [];
        const C = this._resolveConstraints(ctx);

        // ── Per-type rule overrides (F14: only the command consulted these) ──
        let maxRiser = C.MAX_RISER_HEIGHT;
        let minTread = C.MIN_TREAD_DEPTH;
        if (stair.typeId && ctx.typeStore) {
            const rules = ctx.typeStore.resolveRules(stair.typeId);
            if (rules) {
                if (rules.maxRiserHeight) maxRiser = rules.maxRiserHeight;
                if (rules.minTreadDepth)  minTread = rules.minTreadDepth;
            }
        }

        // ── Level identity ─────────────────────────────────────────────────
        if (stair.baseLevelId && stair.topLevelId && stair.baseLevelId === stair.topLevelId) {
            errors.push({
                code: 'STAIR-SAME-LEVEL',
                message: 'Base level and top level cannot be the same',
                field: 'baseLevelId/topLevelId',
                currentValue: stair.baseLevelId,
            });
        }

        const baseLevel = ctx.levels.find(l => l.id === stair.baseLevelId);
        const topLevel  = ctx.levels.find(l => l.id === stair.topLevelId);
        if (stair.baseLevelId && !baseLevel) {
            errors.push({ code: 'STAIR-INVALID-BASE-LEVEL', message: 'Base level does not exist', field: 'baseLevelId', currentValue: stair.baseLevelId });
        }
        if (stair.topLevelId && !topLevel) {
            errors.push({ code: 'STAIR-INVALID-TOP-LEVEL', message: 'Top level does not exist', field: 'topLevelId', currentValue: stair.topLevelId });
        }

        // ── Riser height ───────────────────────────────────────────────────
        if (stair.riserHeight !== undefined) {
            if (stair.riserHeight < C.MIN_RISER_HEIGHT) {
                errors.push({
                    code: 'STAIR-RISER-TOO-LOW',
                    message: `Riser height ${(stair.riserHeight * 1000).toFixed(0)}mm below minimum ${(C.MIN_RISER_HEIGHT * 1000).toFixed(0)}mm`,
                    field: 'riserHeight',
                    currentValue: stair.riserHeight,
                    requiredValue: C.MIN_RISER_HEIGHT,
                });
            }
            if (stair.riserHeight > maxRiser) {
                errors.push({
                    code: 'STAIR-RISER-TOO-HIGH',
                    message: `Riser height ${(stair.riserHeight * 1000).toFixed(0)}mm exceeds maximum ${(maxRiser * 1000).toFixed(0)}mm`,
                    field: 'riserHeight',
                    currentValue: stair.riserHeight,
                    requiredValue: maxRiser,
                });
            }
        }

        // ── Tread depth ────────────────────────────────────────────────────
        if (stair.treadDepth !== undefined && stair.treadDepth < minTread) {
            errors.push({
                code: 'STAIR-TREAD-TOO-SHALLOW',
                message: `Tread depth ${(stair.treadDepth * 1000).toFixed(0)}mm below minimum ${(minTread * 1000).toFixed(0)}mm`,
                field: 'treadDepth',
                currentValue: stair.treadDepth,
                requiredValue: minTread,
            });
        }

        // ── Width ──────────────────────────────────────────────────────────
        if (stair.width !== undefined) {
            if (stair.width < C.MIN_WIDTH) {
                errors.push({
                    code: 'STAIR-WIDTH-TOO-NARROW',
                    message: `Width ${(stair.width * 1000).toFixed(0)}mm below minimum ${(C.MIN_WIDTH * 1000).toFixed(0)}mm`,
                    field: 'width',
                    currentValue: stair.width,
                    requiredValue: C.MIN_WIDTH,
                });
            }
            if (stair.accessibilityType === 'accessible' && stair.width < C.MIN_ACCESSIBLE_WIDTH) {
                errors.push({
                    code: 'STAIR-ACCESSIBLE-WIDTH-TOO-NARROW',
                    message: `Accessible stair width ${(stair.width * 1000).toFixed(0)}mm below minimum ${(C.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`,
                    field: 'width',
                    currentValue: stair.width,
                    requiredValue: C.MIN_ACCESSIBLE_WIDTH,
                });
            }
            if (stair.width < C.MIN_ACCESSIBLE_WIDTH && stair.accessibilityType !== 'accessible') {
                warnings.push({
                    code: 'STAIR-ACCESSIBILITY-WARNING',
                    message: 'Stair width below accessibility minimum',
                    field: 'width',
                    recommendation: `Consider increasing width to ${(C.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`,
                });
            }
        }

        // ── Total riser count ──────────────────────────────────────────────
        if (stair.flights && stair.flights.length > 0) {
            const totalRisers = stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
            if (totalRisers < C.MIN_RISER_COUNT) {
                errors.push({
                    code: 'STAIR-TOO-FEW-RISERS',
                    message: `Total riser count ${totalRisers} is below minimum ${C.MIN_RISER_COUNT}`,
                    field: 'flights',
                    currentValue: totalRisers,
                    requiredValue: C.MIN_RISER_COUNT,
                });
            }
            stair.flights.forEach((flight, idx) => {
                const d = flight.direction;
                if (d.x === 0 && d.y === 0 && d.z === 0) {
                    errors.push({
                        code: 'STAIR-ZERO-DIRECTION',
                        message: `Flight ${idx + 1} direction cannot be zero vector`,
                        field: `flights[${idx}].direction`,
                        currentValue: '0,0,0',
                    });
                }
            });

            // Total height matches level height (HEIGHT_TOLERANCE).
            if (baseLevel && topLevel && stair.riserHeight !== undefined) {
                const levelHeight = topLevel.elevation - baseLevel.elevation;
                const calculated  = stair.riserHeight * totalRisers;
                if (Math.abs(calculated - levelHeight) > C.HEIGHT_TOLERANCE) {
                    errors.push({
                        code: 'STAIR-HEIGHT-MISMATCH',
                        message: `Total stair height ${(calculated * 1000).toFixed(0)}mm does not match level height ${(levelHeight * 1000).toFixed(0)}mm (tolerance: ${(C.HEIGHT_TOLERANCE * 1000).toFixed(0)}mm)`,
                        field: 'riserHeight',
                        currentValue: calculated,
                        requiredValue: levelHeight,
                    });
                }
            }
        }

        // ── Fire rating ────────────────────────────────────────────────────
        if (!stair.fireRating) {
            warnings.push({
                code: 'STAIR-NO-FIRE-RATING',
                message: 'No fire rating specified',
                field: 'fireRating',
                recommendation: 'Assign fire rating for building code compliance',
            });
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    private static _resolveConstraints(ctx: StairValidationContext): StairValidationConstraints {
        if (ctx.region && STAIR_CONSTRAINTS_REGIONS[ctx.region]) {
            return STAIR_CONSTRAINTS_REGIONS[ctx.region];
        }
        return STAIR_CONSTRAINTS;
    }
}
