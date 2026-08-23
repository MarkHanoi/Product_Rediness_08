/**
 * SetLevelHeightCommand — edit a level's FLOOR-TO-FLOOR HEIGHT and carry the
 * whole stack above it, as ONE undo unit.
 *
 * Lane LEVEL36 · ISSUE-LOG L-7201 · ADR-0345 (cascade semantics) ·
 * C11 (element creation pipeline) · C16 (command authoring) · C03 §2.1 (one
 * mutation path) · C72 (propagation & prevState) · C81 (a cascade is ONE undo) ·
 * C84 §EI-PROP (element integrity — dependents adapt or refuse) · C05 (persistence).
 *
 * ## Why this exists, and why `UpdateLevelCommand` could not do it
 *
 * The Level & Grid panel showed floor-to-floor height as a READ-ONLY TAG
 * ("3.0m") next to an editable ELEVATION input. The founder asked to change
 * Ground from 3.0 to 2.9 and see Level 1 follow. Those are different edits:
 *
 *   · ELEVATION is where a level sits. `UpdateLevelCommand({elevation})` sets it,
 *     and `BimKernel.updateLevel()` fires `spatial-authority-reconcile` for THAT
 *     ONE LEVEL. Nothing else moves — change Ground's elevation and Level 1 stays
 *     exactly where it was, so the storey height silently changes instead.
 *   · HEIGHT is the GAP between a level and the one above. Editing it is not a
 *     property write at all; it is a RIGID TRANSLATION of every level above by
 *     the delta. `UpdateLevelCommand({height})` writes the number and fires
 *     NOTHING (`BimKernel.updateLevel` dispatches only on an elevation change),
 *     so before this command the height tag was decorative in the strongest
 *     sense: writing it changed no geometry anywhere.
 *
 * So this is a distinct command, not a flag on the old one. `UpdateLevelCommand`
 * keeps its single-level semantics and stays the right call for name / colour /
 * visibility / an explicit elevation set.
 *
 * ## The cascade rule (ADR-0345 §3) — NORMATIVE
 *
 * Let δ = newHeight − oldHeight.
 *
 *   · Every level STRICTLY ABOVE the edited level moves by exactly δ.
 *   · The edited level and everything BELOW it do not move.
 *   · Every other level's OWN height is therefore preserved exactly — the stack
 *     above rides up or down rigidly. Changing Ground 3.0 → 2.9 lowers Level 1
 *     from 3.000 to 2.900 and Level 2 from 6.000 to 5.900; both keep their 3.0 m
 *     storey heights. This is the behaviour every BIM tool has, and it is the
 *     only rule under which one edit does not silently re-proportion the tower.
 *
 * ⭐ ON "BELOW LEVELS SHALL ADAPT" (the founder's words). Under this rule a
 * basement does NOT move when Ground's height changes, and that is correct, not
 * a shortfall: Ground's floor-to-floor governs the gap ABOVE Ground, so nothing
 * below it is a function of that number. What DOES adapt below the change is the
 * edited level's own ceiling-hung content — the ceiling datum is
 * `elevation + height`, so pendants and downlights on the edited level re-hang.
 * Recorded explicitly because "nothing moved" and "nothing should have moved"
 * are different facts and the UI must not leave the user guessing which happened.
 *
 * ## Ordering can invert, so it is CHECKED, never clamped
 *
 * On a consistent stack a rigid translation can never cross two levels. On an
 * INCONSISTENT one it can: if Level 1 sits at 2.0 while Ground claims height
 * 3.0, then δ = −2.5 puts Level 1 at −0.5, BELOW Ground. `canExecute` refuses
 * with both numbers named. Clamping would silently invent a stack the user never
 * drew (C74 — an honest refusal is an answer).
 *
 * ## ONE undo — and NOT via CompositeCommand
 *
 * ⛔ `CompositeCommand` (L-2401) returns `success: true` UNCONDITIONALLY in both
 * directions and counts children ATTEMPTED, not landed. Inheriting it would mean
 * telling the user a 40-level cascade undid cleanly when half of it did not. So
 * this command owns its own snapshot and its own reverse:
 *
 *   · `_movedLevels` records (id, prevElevation) for every level it shifted.
 *   · `_reseats` holds the executed `ReseatLevelElementsCommand`s, which carry
 *     per-element old-Y records of their own.
 *   · `undo()` reverses reseats, then elevations, then the height — and COUNTS
 *     what actually landed, re-reading each level back out of `BimManager`
 *     rather than trusting the write. `success` is `landed === attempted`.
 *
 * ## What follows the level, and what refuses BY NAME (ADR-0344)
 *
 * | family                        | follows? | mechanism                                   |
 * |-------------------------------|----------|---------------------------------------------|
 * | Wall                          | ✅       | reconcile → `builder.updateWall`            |
 * | Slab                          | ✅       | reconcile → `slabStore.triggerRebuild`      |
 * | Column                        | ✅       | reconcile → `columnBuilder.updateColumn`    |
 * | Roof                          | ✅       | reconcile → `roofBuilder.updateRoof`        |
 * | Door / Window                 | ✅       | hosted (C15) — ride their host wall         |
 * | Furniture / Plumbing / Lighting| ✅      | `ReseatLevelElementsCommand`, this undo unit|
 * | Beam                          | ❌       | builder never reads `level.elevation`       |
 * | Stair                         | ❌       | spans levels — must RE-SOLVE, not translate |
 * | CurtainWall                   | ❌       | builder unavailable at the wiring seam      |
 *
 * The last three are COUNTED and REPORTED in the result `info` so the UI can
 * tell the user which of their elements did not move. A model that half-moves
 * in silence is worse than one that refuses.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { Level } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';

const _bus = new DOMEventBus();

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/**
 * Below this a "storey" is not a storey. Chosen as the smallest dimension that
 * can still admit a person-height opening plus structure; anything less is a
 * data-entry slip, not a design. Named so the refusal can quote it.
 */
export const MIN_LEVEL_HEIGHT_M = 0.2;

/** Above this the number is almost certainly a unit error (mm typed as m). */
export const MAX_LEVEL_HEIGHT_M = 500;

/** Sub-millimetre. Below this a height "change" is float noise, not an edit. */
const EPSILON_M = 1e-6;

/** Families the level reconcile does NOT carry — see the table in the header. */
const STRANDED_STORE_KEYS: ReadonlyArray<readonly [string, string]> = [
    ['beamStore', 'beam'],
    ['stairStore', 'stair'],
    ['curtainWallStore', 'curtain wall'],
];

export interface SetLevelHeightPayload {
    /** The level whose FLOOR-TO-FLOOR height is being edited. */
    levelId: string;
    /** New floor-to-floor height in metres. */
    height: number;
}

/** One level this command translated, with enough to put it back exactly. */
interface MovedLevel {
    readonly id: string;
    readonly prevElevation: number;
    readonly nextElevation: number;
}

export class SetLevelHeightCommand implements Command {
    /**
     * The reconcile itself writes to no store — it re-invokes builders. The
     * declared footprint is the LEVEL plus the three families whose absolute
     * `position.y` the composed re-seat genuinely mutates.
     */
    readonly affectedStores = ['level', 'furniture', 'plumbing', 'lighting'] as const;
    readonly id: string;
    readonly type = CommandType.SET_LEVEL_HEIGHT;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly payload: SetLevelHeightPayload;

    /** Snapshot — §01 §2.2. Captured in execute(), consumed by undo(). */
    private _prevHeight: number | null = null;
    private _movedLevels: MovedLevel[] = [];
    private _reseats: ReseatLevelElementsCommand[] = [];

    constructor(payload: SetLevelHeightPayload) {
        this.id = `cmd-set-level-height-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.levelId];
    }

    // ── Validation ──────────────────────────────────────────────────────────

    canExecute(context: CommandContext): CommandValidationResult {
        const { bimManager } = context;
        const { levelId, height } = this.payload;

        const level = bimManager.getLevelById(levelId);
        if (!level) return { ok: false, reason: `Level "${levelId}" not found.` };

        if (typeof height !== 'number' || !Number.isFinite(height)) {
            return { ok: false, reason: `Level height must be a finite number — received ${String(height)}.` };
        }
        if (height <= 0) {
            return {
                ok: false,
                reason: `Level height must be greater than 0 m — received ${height.toFixed(3)} m.`,
            };
        }
        if (height < MIN_LEVEL_HEIGHT_M) {
            return {
                ok: false,
                reason:
                    `Level height ${height.toFixed(3)} m is below the ${MIN_LEVEL_HEIGHT_M.toFixed(2)} m minimum ` +
                    `for a storey. Enter ${MIN_LEVEL_HEIGHT_M.toFixed(2)} m or more.`,
            };
        }
        if (height > MAX_LEVEL_HEIGHT_M) {
            return {
                ok: false,
                reason:
                    `Level height ${height.toFixed(3)} m exceeds the ${MAX_LEVEL_HEIGHT_M} m maximum — ` +
                    `did you mean ${(height / 1000).toFixed(3)} m? Heights are in METRES.`,
            };
        }

        const prevHeight = level.height ?? 3.0;
        const delta = height - prevHeight;

        // ── Ordering check — refuse with BOTH numbers, never clamp (C74) ─────
        // Only reachable on an already-inconsistent stack; see the header.
        const below = this._levelsBelowOrAt(context, level);
        const highestBelow = below.reduce<Level | null>(
            (max, l) => (!max || l.elevation > max.elevation ? l : max),
            null,
        );
        for (const above of this._levelsAbove(context, level)) {
            const next = above.elevation + delta;
            if (next < level.elevation - EPSILON_M) {
                return {
                    ok: false,
                    reason:
                        `A height of ${height.toFixed(3)} m would place "${above.name}" at ` +
                        `${next.toFixed(3)} m, below "${level.name}" at ${level.elevation.toFixed(3)} m. ` +
                        `Levels may not cross.`,
                };
            }
            if (highestBelow && next < highestBelow.elevation - EPSILON_M) {
                return {
                    ok: false,
                    reason:
                        `A height of ${height.toFixed(3)} m would place "${above.name}" at ` +
                        `${next.toFixed(3)} m, below "${highestBelow.name}" at ` +
                        `${highestBelow.elevation.toFixed(3)} m. Levels may not cross.`,
                };
            }
        }

        return { ok: true };
    }

    // ── Execute ─────────────────────────────────────────────────────────────

    execute(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.levels.setLevelHeight', (span) => {
            try {
                const { bimManager } = context;
                const { levelId, height } = this.payload;

                const level = bimManager.getLevelById(levelId);
                if (!level) {
                    return { success: false, affectedElementIds: [], error: `Level "${levelId}" not found.` };
                }

                span.setAttribute('pryzm.level.id', levelId);
                span.setAttribute('pryzm.level.height.next', height);

                const prevHeight = level.height ?? 3.0;
                const delta = height - prevHeight;
                span.setAttribute('pryzm.level.height.deltaM', delta);

                if (Math.abs(delta) < EPSILON_M) {
                    // Not an error — an idempotent no-op. Reporting success with no
                    // affected ids keeps a blur-triggered re-commit from minting an
                    // empty undo entry the user would have to press Ctrl+Z through.
                    return {
                        success: true,
                        affectedElementIds: [],
                        info: [`Level "${level.name}" height already ${height.toFixed(3)} m — no change.`],
                    };
                }

                // §01 §2.2 — snapshot BEFORE any mutation.
                this._prevHeight = prevHeight;
                const above = this._levelsAbove(context, level);
                this._movedLevels = above.map((l) => ({
                    id: l.id,
                    prevElevation: l.elevation,
                    nextElevation: l.elevation + delta,
                }));
                this._reseats = [];

                // ── 1 · the height itself ────────────────────────────────────
                // Fires no reconcile (BimKernel dispatches only on elevation), which
                // is why step 3 re-seats the EDITED level too: its ceiling datum
                // (`elevation + height`) just moved even though its floor did not.
                bimManager.updateLevel(levelId, { height });

                // ── 2 · translate the stack above ────────────────────────────
                // Each write fires `spatial-authority-reconcile` for that level,
                // which rebuilds its walls, slabs, columns and roofs. Ascending
                // order is chosen for determinism only — each level's target is a
                // function of its OWN snapshot, so no ordering can change the result.
                let landed = 0;
                const failed: string[] = [];
                for (const m of this._movedLevels) {
                    bimManager.updateLevel(m.id, { elevation: m.nextElevation });
                    // ⭐ Verify by RE-READING, never by trusting the write — the
                    // L-2401 defect in one line. `updateLevel` returns void and
                    // silently no-ops on an unknown id.
                    const now = bimManager.getLevelById(m.id)?.elevation;
                    if (typeof now === 'number' && Math.abs(now - m.nextElevation) < EPSILON_M) landed++;
                    else failed.push(m.id);
                }

                // ── 3 · re-seat the families whose Y is persisted absolute ───
                // Idempotent and absolute-targeted (it recomputes from the CURRENT
                // datum), so it is safe to run over the edited level as well.
                const reseatIds: string[] = [];
                for (const id of [levelId, ...this._movedLevels.map((m) => m.id)]) {
                    const reseat = new ReseatLevelElementsCommand(id);
                    if (!reseat.canExecute(context).ok) continue;
                    const r = reseat.execute(context);
                    if (r.success) {
                        this._reseats.push(reseat);
                        reseatIds.push(...r.affectedElementIds);
                    }
                }

                // ── 4 · census the families that did NOT follow ──────────────
                const stranded = this._censusStranded(context, [levelId, ...this._movedLevels.map((m) => m.id)]);

                _bus.emit('update-project-ui', {});
                _bus.emit('bim-level-updated', { id: levelId });
                _bus.emit('ai-model-update', { model: '' });

                span.setAttribute('pryzm.level.movedCount', landed);
                span.setAttribute('pryzm.level.reseatedCount', reseatIds.length);

                const info: string[] = [
                    `Level "${level.name}" height ${prevHeight.toFixed(3)} → ${height.toFixed(3)} m ` +
                    `(${delta >= 0 ? '+' : ''}${delta.toFixed(3)} m).`,
                ];
                if (this._movedLevels.length > 0) {
                    info.push(`Moved ${landed} of ${this._movedLevels.length} level(s) above.`);
                }
                if (reseatIds.length > 0) {
                    info.push(`Re-seated ${reseatIds.length} furniture / plumbing / lighting element(s).`);
                }
                if (stranded) info.push(stranded);

                return {
                    success: failed.length === 0,
                    affectedElementIds: [levelId, ...this._movedLevels.map((m) => m.id), ...reseatIds],
                    info,
                    ...(failed.length > 0
                        ? { error: `Failed to move ${failed.length} level(s): ${failed.join(', ')}.` }
                        : {}),
                };
            } finally {
                span.end();
            }
        });
    }

    // ── Undo ────────────────────────────────────────────────────────────────

    undo(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.levels.setLevelHeight.undo', (span) => {
            try {
                if (this._prevHeight === null) {
                    return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
                }

                const { bimManager } = context;
                const ids: string[] = [];
                let attempted = 0;
                let landed = 0;

                // Exact reverse of execute: re-seats, then elevations, then height.
                for (let i = this._reseats.length - 1; i >= 0; i--) {
                    const r = this._reseats[i]!.undo(context);
                    if (r.success) ids.push(...r.affectedElementIds);
                }

                for (let i = this._movedLevels.length - 1; i >= 0; i--) {
                    const m = this._movedLevels[i]!;
                    attempted++;
                    bimManager.updateLevel(m.id, { elevation: m.prevElevation });
                    const now = bimManager.getLevelById(m.id)?.elevation;
                    if (typeof now === 'number' && Math.abs(now - m.prevElevation) < EPSILON_M) {
                        landed++;
                        ids.push(m.id);
                    }
                }

                attempted++;
                bimManager.updateLevel(this.payload.levelId, { height: this._prevHeight });
                const h = bimManager.getLevelById(this.payload.levelId)?.height;
                if (typeof h === 'number' && Math.abs(h - this._prevHeight) < EPSILON_M) {
                    landed++;
                    ids.push(this.payload.levelId);
                }

                _bus.emit('update-project-ui', {});
                _bus.emit('bim-level-updated', { id: this.payload.levelId });

                span.setAttribute('pryzm.level.undo.landed', landed);
                span.setAttribute('pryzm.level.undo.attempted', attempted);

                // ⭐ L-2401: report what LANDED against what was ATTEMPTED. A composite
                // that always says "true" is how a half-undone building gets called done.
                return {
                    success: landed === attempted,
                    affectedElementIds: ids,
                    info: [`Restored level height and ${landed} of ${attempted} level position(s).`],
                    ...(landed === attempted
                        ? {}
                        : { error: `Only ${landed} of ${attempted} level restore(s) landed.` }),
                };
            } finally {
                span.end();
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this.payload },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    /** Levels strictly above `level`, ascending. Ties do not move. */
    private _levelsAbove(context: CommandContext, level: Level): Level[] {
        return context.bimManager
            .getLevels()
            .filter((l) => l.id !== level.id && l.elevation > level.elevation + EPSILON_M)
            .sort((a, b) => a.elevation - b.elevation);
    }

    /** Levels at or below `level`, excluding itself. Used by the crossing check. */
    private _levelsBelowOrAt(context: CommandContext, level: Level): Level[] {
        return context.bimManager
            .getLevels()
            .filter((l) => l.id !== level.id && l.elevation <= level.elevation + EPSILON_M);
    }

    /**
     * ADR-0344 — name what did NOT move, at the moment it does not move.
     *
     * Returns a user-facing sentence, or `null` when every family on every
     * affected level is one the cascade carries. Never throws: a store that is
     * absent from the context contributes nothing rather than aborting the edit.
     */
    private _censusStranded(context: CommandContext, levelIds: readonly string[]): string | null {
        const ids = new Set(levelIds);
        const parts: string[] = [];

        for (const [storeKey, label] of STRANDED_STORE_KEYS) {
            const store = (context.stores as unknown as Record<string, any> | undefined)?.[storeKey];
            if (!store?.getAll) continue;
            let n = 0;
            try {
                for (const el of store.getAll()) {
                    if (el && typeof el.levelId === 'string' && ids.has(el.levelId)) n++;
                }
            } catch {
                // An unreadable store is UNKNOWN, not zero (C78 §1.4). Skipping it
                // under-reports rather than inventing a clean bill of health.
                continue;
            }
            if (n > 0) parts.push(`${n} ${label}${n === 1 ? '' : 's'}`);
        }

        if (parts.length === 0) return null;
        return (
            `⚠ ${parts.join(', ')} did NOT move — these families do not yet follow a level ` +
            `elevation change and keep their previous position. Reposition them manually ` +
            `(ADR-0345 §6).`
        );
    }
}
