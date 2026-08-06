/**
 * ReseatLevelElementsCommand — §FIX-SEATING-DYNAMIC-REDATUM.
 *
 * ## The defect this closes
 *
 * `§FIX-INTERIOR-FFL-SEATING` made every CREATION path seat elements on the finished
 * floor level. But seating was resolved **once, at create time**, and baked into an
 * ABSOLUTE `position.y`. Nothing re-derived it afterwards. So:
 *
 *   1. Furnish a room (items seat on the bare slab — no finish yet).
 *   2. Add a 20 mm tile finish, or thicken an existing one.
 *   3. Every item stays at the OLD datum and is now buried in the finish.
 *
 * The founder-reported symptom is identical to the original bug; only the trigger
 * differs. A fix that only covers creation is a fix for a project nobody edits.
 *
 * ## Why a command and not a store subscriber
 *
 * The proven in-repo pattern for "dependent geometry follows its host" is
 * `DoorDependencyTracker`: subscribe to the host store, `touch()` the dependents,
 * let the builder rebuild. That works for doors because a door stores its position
 * RELATIVE to its host wall (`wallId` + offset) — only the derived mesh transform is
 * stale, so a no-op re-emit is enough and nothing enters the undo stack.
 *
 * Furniture, lighting and plumbing store an **absolute `position.y`**. Re-datuming
 * them therefore MUTATES persisted element state, and P6 makes commands the only
 * mutation path — a bare store subscriber would both bypass the command bus and
 * leave the change un-undoable. Hence a command, dispatched by the floor/ceiling
 * commands that changed the datum, joining THEIR undo unit so one Ctrl-Z restores
 * the finish and the seating together.
 *
 * ## Per-family datum conventions (NORMATIVE — these already differ, and this
 * command must not "harmonise" them; it must MATCH each family's create path)
 *
 * | family   | what `position.y` means                | re-seated to           |
 * |----------|----------------------------------------|------------------------|
 * | furniture| the FLOOR DATUM only; `FurnitureFragmentBuilder` adds `baseOffset` once (`furnitureWorldY`) | `floorDatum.y` |
 * | plumbing | ABSOLUTE world Y; `PlumbingFragmentBuilder` does `root.position.copy(data.position)` and adds nothing | `floorDatum.y + baseOffset` |
 * | lighting | ABSOLUTE world Y; no mount offset exists on the record | `floorDatum.y` (floor-mounted) or `ceilingDatum.y` (hung) |
 *
 * Getting this table wrong is the A.21.D15 double-application bug, so each row is
 * pinned by a test in `__tests__/SeatingDatum.test.ts`.
 *
 * ## Idempotence
 *
 * Re-seating computes an ABSOLUTE target from current datum state, never a delta.
 * Running it twice is a no-op, so it is safe to attach to every floor/ceiling
 * mutation without tracking whether a previous pass already ran. Elements whose Y is
 * already within `EPSILON_M` of the target are skipped entirely and never appear in
 * the undo record — so a colour-only floor edit produces an empty, harmless command.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { FLOOR_MOUNTED_FIXTURES } from '@pryzm/core-app-model';
import type { LightingFixtureType } from '@pryzm/core-app-model';
import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { resolveFloorSeatingDatum, resolveCeilingSeatingDatum } from './SeatingDatumResolver';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/** Sub-millimetre. Below this a "move" is noise, not a re-seat. */
const EPSILON_M = 1e-6;

/** Which datum family an element is re-seated against. */
export type ReseatFamily = 'furniture' | 'plumbing' | 'lighting';

/** One element's Y change, kept so `undo()` can restore it exactly. */
interface ReseatRecord {
    readonly family: ReseatFamily;
    readonly id: string;
    readonly oldY: number;
    readonly newY: number;
}

/** The minimum a store must offer to participate. */
interface ElementStoreLike<T> {
    getAll?: () => T[];
    get?: (id: string) => T | undefined;
    update?: (id: string, data: T) => void;
}

interface SeatedElement {
    readonly id: string;
    readonly levelId?: string;
    readonly baseOffset?: number;
    readonly fixtureType?: string;
    position?: { x: number; y: number; z: number; clone?: () => unknown };
}

function _store<T>(context: CommandContext, key: string): ElementStoreLike<T> | undefined {
    const s = (context.stores as unknown as Record<string, unknown> | undefined)?.[key];
    return (s ?? undefined) as ElementStoreLike<T> | undefined;
}

/**
 * Write `y` into an element's position without assuming its runtime class.
 *
 * `PlumbingFixtureData.position` is a `THREE.Vector3` while furniture/lighting use
 * plain objects; spreading a Vector3 would silently strip its prototype. Clone when
 * the value knows how to clone itself, otherwise copy the three components.
 */
function _withY<T extends SeatedElement>(data: T, y: number): T {
    const pos = data.position;
    if (!pos) return data;
    const next = (typeof pos.clone === 'function'
        ? pos.clone()
        : { x: pos.x, y: pos.y, z: pos.z }) as { x: number; y: number; z: number };
    next.y = y;
    return { ...data, position: next } as T;
}

/**
 * Re-seat every floor-resting and ceiling-hung element on a level onto the CURRENT
 * finished-floor / finished-ceiling datum.
 *
 * Dispatched by the floor and ceiling commands after they change a finish, so the
 * re-seat lands in the same undo unit as the change that caused it.
 */
export class ReseatLevelElementsCommand implements Command {
    readonly affectedStores = ['furniture', 'plumbing', 'lighting'] as const;
    readonly id: string;
    readonly type = CommandType.RESEAT_LEVEL_ELEMENTS;
    readonly timestamp: number;
    targetIds: string[] = [];

    /** Populated in execute(); replayed in reverse by undo(). */
    private _records: ReseatRecord[] = [];

    constructor(private readonly _levelId: string) {
        this.id = `cmd-reseat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this._levelId) return { ok: false, reason: 'levelId is required.' };
        // A level with no seatable stores is not an error — it is simply a no-op.
        // Returning ok keeps the caller's batch from failing on an empty project.
        void context;
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.seating.reseatLevel', (span) => {
            try {
                span.setAttribute('pryzm.seating.levelId', this._levelId);
                this._records = [];

                this._reseatFurniture(context);
                this._reseatPlumbing(context);
                this._reseatLighting(context);

                this.targetIds = this._records.map(r => r.id);
                span.setAttribute('pryzm.seating.reseatedCount', this._records.length);

                return {
                    success: true,
                    affectedElementIds: [...this.targetIds],
                    info: this._records.length
                        ? [`Re-seated ${this._records.length} element(s) on level ${this._levelId}.`]
                        : undefined,
                };
            } finally {
                span.end();
            }
        });
    }

    /** `position.y` is the FLOOR DATUM; the builder adds `baseOffset` exactly once. */
    private _reseatFurniture(context: CommandContext): void {
        const store = _store<SeatedElement>(context, 'furnitureStore');
        for (const item of this._onLevel(store)) {
            const p = item.position;
            if (!p) continue;
            const seat = resolveFloorSeatingDatum(context, this._levelId, { x: p.x, z: p.z });
            this._apply(store, 'furniture', item, seat.y);
        }
    }

    /** `position.y` is ABSOLUTE — the mount offset is baked in, so re-add it. */
    private _reseatPlumbing(context: CommandContext): void {
        const store = _store<SeatedElement>(context, 'plumbingStore');
        for (const item of this._onLevel(store)) {
            const p = item.position;
            if (!p) continue;
            const seat = resolveFloorSeatingDatum(context, this._levelId, { x: p.x, z: p.z });
            this._apply(store, 'plumbing', item, seat.y + (item.baseOffset ?? 0));
        }
    }

    /**
     * `position.y` is ABSOLUTE. The floor/ceiling split uses the SAME
     * `FLOOR_MOUNTED_FIXTURES` set as `CreateLightingCommand`, so a downlight
     * re-hangs from the finished soffit while a floor lamp re-stands on the FFL.
     */
    private _reseatLighting(context: CommandContext): void {
        const store = _store<SeatedElement>(context, 'lightingStore');
        for (const item of this._onLevel(store)) {
            const p = item.position;
            if (!p) continue;
            const kind = (item.fixtureType ?? 'downlight') as LightingFixtureType;
            const seat = FLOOR_MOUNTED_FIXTURES.has(kind)
                ? resolveFloorSeatingDatum(context, this._levelId, { x: p.x, z: p.z })
                : resolveCeilingSeatingDatum(context, this._levelId, { x: p.x, z: p.z });
            this._apply(store, 'lighting', item, seat.y);
        }
    }

    private _onLevel(store: ElementStoreLike<SeatedElement> | undefined): SeatedElement[] {
        try {
            return (store?.getAll?.() ?? []).filter(e => e && e.levelId === this._levelId);
        } catch {
            return [];
        }
    }

    private _apply(
        store: ElementStoreLike<SeatedElement> | undefined,
        family: ReseatFamily,
        item: SeatedElement,
        newY: number,
    ): void {
        const oldY = item.position?.y ?? 0;
        if (!Number.isFinite(newY) || Math.abs(newY - oldY) < EPSILON_M) return;
        try {
            store?.update?.(item.id, _withY(item, newY));
            this._records.push({ family, id: item.id, oldY, newY });
        } catch (err) {
            // A single un-updatable element must not abort the level's re-seat.
            console.warn('[ReseatLevelElementsCommand] failed to re-seat', item.id, err);
        }
    }

    undo(context: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.seating.reseatLevel.undo', (span) => {
            try {
                const ids: string[] = [];
                // Reverse order so the undo mirrors execute exactly.
                for (let i = this._records.length - 1; i >= 0; i--) {
                    const r = this._records[i];
                    const store = _store<SeatedElement>(context, `${r.family}Store`);
                    const current = store?.get?.(r.id);
                    if (!current) continue;
                    try {
                        store?.update?.(r.id, _withY(current, r.oldY));
                        ids.push(r.id);
                    } catch (err) {
                        console.warn('[ReseatLevelElementsCommand.undo] failed for', r.id, err);
                    }
                }
                span.setAttribute('pryzm.seating.restoredCount', ids.length);
                return { success: true, affectedElementIds: ids };
            } finally {
                span.end();
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { levelId: this._levelId },
            targetIds: [...this.targetIds],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
