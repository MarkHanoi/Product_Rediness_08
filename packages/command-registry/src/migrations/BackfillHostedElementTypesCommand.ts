/**
 * BackfillHostedElementTypesCommand — §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274).
 *
 * ── THE LESSON THIS COMMAND EXISTS TO INSTITUTIONALISE ────────────────────────
 *
 * EIGHT creation-path defects have now been cured by CONVERGING the paths (L-239 / 240 /
 * 243 / 246 / 251 / 255 / 260 A / 266). EVERY ONE OF THEM LEFT BEHIND THE RECORDS THE
 * BROKEN PATH HAD ALREADY WRITTEN — and those records are still in the founder's
 * project, still rendering as different elements. A CREATION-PATH FIX IS ONLY HALF A FIX
 * WITHOUT A BACKFILL.
 *
 * `doorCreationParity.test.ts` (D-2) pins the divergence: a hosted-element record with
 * NO `systemTypeId` is not broken — it is a DIFFERENT ELEMENT, drawn correctly, forever.
 * The type is what the builders read for the frame section, the leaf thickness (= the
 * plan swing-arc clear half), the glazing / panel segments, the window's `columnRatios`
 * (i.e. WHETHER THERE IS A MULLION AT ALL) and every finish field that makes a schedule
 * row non-blank.
 *
 * ── WHY IT IS A COMMAND, AND WHY IT IS USER-INVOKED ───────────────────────────
 *
 *   • A BACKFILL IS A MIGRATION, AND MIGRATIONS ARE COMMANDS (C03 §1 — the command bus
 *     is the only mutation path; C16 — ONE batch = ONE undo entry). Ctrl-Z restores the
 *     ORIGINAL untyped records EXACTLY, via `doorStore.replace()` / `windowStore.replace()`
 *     (a merge-patch `update()` cannot UNSET a field, so it cannot reverse a stamp).
 *
 *   • IT MUST NEVER RUN AUTOMATICALLY AT LOAD. Assigning the catalogue type CHANGES WHAT
 *     THE FOUNDER'S DRAWING LOOKS LIKE — frame 0.050 → 0.058, leaf 0.040 → 0.044, grey →
 *     timber, a mullion appears in a window that had none. That may well be CORRECT (they
 *     become real, schedulable elements) but IT MUST BE HIS DECISION, taken deliberately,
 *     with a report of what changed and one Ctrl-Z to take it back. A silent migration
 *     that moves geometry on load is exactly the "helpful" shortcut this project punishes.
 *     It is surfaced in the CREATE panel's batch catalogue (C17), where the other batch
 *     executors live.
 *
 * ── WHAT IT DOES AND DOES NOT TOUCH ───────────────────────────────────────────
 *
 * The patch is DERIVED (never hand-rolled) by re-running each record through
 * `buildDoorStoreRecord()` / `buildWindowStoreRecord()` — the SAME chokepoints both
 * creation paths call — and keeping only the TYPE-DERIVED keys. Instance truth (offset /
 * width / height / sillHeight / frame + leaf sections / mark / hinge + swing) is NEVER
 * moved: the record's void dims must keep agreeing with the flat `WallData.openings[]`
 * entry that cuts the wall (C15). See `DoorTypeBackfill.INSTANCE_FIELDS`.
 *
 * P8 — the execute/undo pair emits spans; the planners emit their own.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { batchCoordinator } from '@pryzm/core-app-model';
import { doorStore, planDoorTypeBackfill, type DoorOpening } from '@pryzm/geometry-door';
import { windowStore, planWindowTypeBackfill, type WindowOpening } from '@pryzm/geometry-window';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** What the migration reports back to the architect (surfaced in the panel toast). */
export interface HostedTypeBackfillReport {
    readonly doorsMigrated: number;
    readonly windowsMigrated: number;
    readonly doorTypeId: string;
    readonly doorTypeName: string;
    readonly windowTypeId: string;
    readonly windowTypeName: string;
    readonly blockedReasons: readonly string[];
}

export class BackfillHostedElementTypesCommand implements Command {
    /** Doors + windows are hosted ON walls; the wall snapshot scope covers both. */
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type = CommandType.BACKFILL_HOSTED_ELEMENT_TYPES;
    readonly timestamp: number;
    targetIds: string[] = [];

    /** EXACT pre-migration snapshots — the undo restores these verbatim. */
    private doorSnapshots: DoorOpening[] = [];
    private windowSnapshots: WindowOpening[] = [];
    private report: HostedTypeBackfillReport | null = null;

    constructor() {
        this.id = `cmd-backfill-hosted-types-${Date.now()}`;
        this.timestamp = Date.now();
    }

    /** The report of the last successful execute (null before it runs). */
    getReport(): HostedTypeBackfillReport | null {
        return this.report;
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const doors = doorStore.getAll();
        const windows = windowStore.getAll();

        const doorPlan = planDoorTypeBackfill(doors);
        const windowPlan = planWindowTypeBackfill(windows);

        // A FINDING, not a silent fallback: if the catalogue cannot resolve a default,
        // we refuse rather than invent one.
        if (doorPlan.blockedReason && windowPlan.blockedReason) {
            return { ok: false, reason: `${doorPlan.blockedReason} ${windowPlan.blockedReason}` };
        }

        const pending = doorPlan.entries.length + windowPlan.entries.length;
        if (pending === 0) {
            // IDEMPOTENCE, surfaced. Running it twice is a no-op, and the architect is
            // told so rather than handed an empty undo entry.
            return {
                ok: false,
                reason: 'Every door and window already carries a system type — nothing to migrate.',
            };
        }
        return { ok: true };
    }

    execute(_context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.migration.backfillHostedElementTypes', (span) => {
            try {
                const doorPlan = planDoorTypeBackfill(doorStore.getAll());
                const windowPlan = planWindowTypeBackfill(windowStore.getAll());

                const blockedReasons = [doorPlan.blockedReason, windowPlan.blockedReason]
                    .filter((r): r is string => r !== null);

                // Snapshot BEFORE mutating — the undo contract is "the original record,
                // byte-for-byte", and only a pre-image can honour that.
                this.doorSnapshots = doorPlan.entries
                    .map(e => doorStore.getById(e.id))
                    .filter((d): d is DoorOpening => d !== undefined)
                    .map(d => structuredClone(d));
                this.windowSnapshots = windowPlan.entries
                    .map(e => windowStore.getById(e.id))
                    .filter((w): w is WindowOpening => w !== undefined)
                    .map(w => structuredClone(w));

                const levelIds = this._levelIdsFor(_context, [
                    ...doorPlan.entries.map(e => e.wallId),
                    ...windowPlan.entries.map(e => e.wallId),
                ]);

                const affectedIds: string[] = [];
                const _apply = (): void => {
                    for (const entry of doorPlan.entries) {
                        try {
                            doorStore.update(entry.id, entry.patch as Partial<DoorOpening>);
                            affectedIds.push(entry.id);
                        } catch (err) {
                            console.warn(`[BackfillHostedElementTypes] door ${entry.id} migration failed (skipped):`, err);
                        }
                    }
                    for (const entry of windowPlan.entries) {
                        try {
                            windowStore.update(entry.id, entry.patch as Partial<WindowOpening>);
                            affectedIds.push(entry.id);
                        } catch (err) {
                            console.warn(`[BackfillHostedElementTypes] window ${entry.id} migration failed (skipped):`, err);
                        }
                    }
                };

                // C16 §8 — ONE coalesced rebuild for the whole migration, not one per
                // record. Doors/windows do not bound rooms, so redetect is skipped.
                batchCoordinator.runBatch(_apply, {
                    levelIds: levelIds.length ? levelIds : [''],
                    totalElementCount: doorPlan.entries.length + windowPlan.entries.length,
                    skipRedetectRooms: true,
                });

                this.report = {
                    doorsMigrated:   doorPlan.entries.length,
                    windowsMigrated: windowPlan.entries.length,
                    doorTypeId:      doorPlan.defaultTypeId,
                    doorTypeName:    doorPlan.defaultTypeName,
                    windowTypeId:    windowPlan.defaultTypeId,
                    windowTypeName:  windowPlan.defaultTypeName,
                    blockedReasons,
                };
                this.targetIds = affectedIds;

                span.setAttribute('pryzm.migration.doorsMigrated', this.report.doorsMigrated);
                span.setAttribute('pryzm.migration.windowsMigrated', this.report.windowsMigrated);
                span.setAttribute('pryzm.migration.doorTypeId', this.report.doorTypeId);
                span.setAttribute('pryzm.migration.windowTypeId', this.report.windowTypeId);
                span.end();

                return {
                    success: true,
                    affectedElementIds: affectedIds,
                    info: [
                        `Migrated ${this.report.doorsMigrated} untyped door(s) → ` +
                        `${this.report.doorTypeName} (${this.report.doorTypeId}) and ` +
                        `${this.report.windowsMigrated} untyped window(s) → ` +
                        `${this.report.windowTypeName} (${this.report.windowTypeId}). ` +
                        `Dimensions were preserved; frame/leaf sections, finishes and pane ` +
                        `divisions now come from the type. Ctrl-Z reverts the whole migration.`,
                        ...blockedReasons,
                    ],
                };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    undo(_context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.migration.backfillHostedElementTypes.undo', (span) => {
            try {
                const affectedIds: string[] = [];
                const _restore = (): void => {
                    for (const snap of this.doorSnapshots) {
                        if (!doorStore.has(snap.id)) continue;   // deleted since — nothing to restore
                        doorStore.replace(snap);
                        affectedIds.push(snap.id);
                    }
                    for (const snap of this.windowSnapshots) {
                        if (!windowStore.has(snap.id)) continue;
                        windowStore.replace(snap);
                        affectedIds.push(snap.id);
                    }
                };

                const levelIds = this._levelIdsFor(_context, [
                    ...this.doorSnapshots.map(d => d.wallId),
                    ...this.windowSnapshots.map(w => w.wallId),
                ]);

                batchCoordinator.runBatch(_restore, {
                    levelIds: levelIds.length ? levelIds : [''],
                    totalElementCount: this.doorSnapshots.length + this.windowSnapshots.length,
                    skipRedetectRooms: true,
                });

                span.setAttribute('pryzm.migration.restored', affectedIds.length);
                span.end();
                return { success: true, affectedElementIds: affectedIds };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {} as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    /** CA-DOCTRINE-L — the levels the rebuild must be coalesced over. */
    private _levelIdsFor(context: CommandContext, wallIds: readonly string[]): string[] {
        const wallStore = context?.stores?.wallStore as
            | { getById(id: string): { levelId?: string } | undefined }
            | undefined;
        if (!wallStore) return [];
        const out = new Set<string>();
        for (const wallId of wallIds) {
            const levelId = wallStore.getById(wallId)?.levelId;
            if (levelId) out.add(levelId);
        }
        return [...out];
    }
}
