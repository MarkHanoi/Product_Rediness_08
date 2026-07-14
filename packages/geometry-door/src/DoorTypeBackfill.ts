/**
 * DoorTypeBackfill — §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274). The DOOR half.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * SEVEN creation-path defects have been cured by CONVERGING the paths (L-239 / 240 /
 * 243 / 246 / 251 / 255 / 260 A / 266). Every one of them left behind THE RECORDS THE
 * BROKEN PATH HAD ALREADY WRITTEN. `doorCreationParity.test.ts` (D-2) pins the
 * consequence: a `DoorOpening` with NO `systemTypeId` is not a broken door — it is a
 * DIFFERENT door, drawn correctly, forever:
 *
 *   • `DoorBuilder.buildVisuals`      reads `resolveDoorDimensions(door.systemTypeId, …)`
 *     for frame + leaf thickness, and `doorSystemTypeStore.getById(door.systemTypeId)`
 *     for glazing / `defaultSegments` / sidelight;
 *   • `DoorPlanSymbolBuilder`         resolves frame + leaf thickness the same way (the
 *     leaf thickness IS the swing-arc clear half);
 *   • the finish fields (`frameFinish` / `leafFinish` / `frameColor` / `leafColor` /
 *     `finishMaterial`) are STAMPED FROM THE TYPE at creation — so a typeless record
 *     renders schema-default grey and reads BLANK in every schedule.
 *
 * A creation-path fix is only HALF a fix without a backfill. This module is the other
 * half: a MIGRATION (C03 / C16 — migrations are commands), dispatched by
 * `BackfillHostedElementTypesCommand` as ONE undoable operation.
 *
 * ── THE DESIGN RULE THAT MAKES IT SAFE (C15) ──────────────────────────────────
 *
 * THE INSTANCE IS THE STRONGEST AUTHORITY. `buildDoorStoreRecord()` already says so
 * ("prefer what the opening persisted"), and the builders agree: they read `door.width`
 * / `door.height` / `door.offset` FROM THE RECORD (they must match the wall's CSG void,
 * which lives on the flat `WallData.openings[]` entry and is NOT part of this
 * migration). Therefore the backfill NEVER moves the founder's geometry — it stamps the
 * TYPE and the fields DERIVED from the type, and nothing else. `INSTANCE_FIELDS` below
 * is that boundary, written down.
 *
 * REFUTES THE BRIEF, DELIBERATELY: the brief expected existing doors to change width
 * (0.900 → 0.926). They do not — width is persisted ON THE RECORD and the builders read
 * it from there; only the pre-creation resolver falls back to `DEFAULT_DOOR_DIMENSIONS`.
 * What DOES change is what the type owns: frame section (0.050 → 0.058), leaf (0.040 →
 * 0.044), the swing-arc clear half, panel/glazing segments and the finish colours (grey
 * → timber). Still a visible change to a drawing, so the migration stays USER-INVOKED —
 * never automatic on load.
 *
 * ── PARITY BY CONSTRUCTION (C11 §3) ───────────────────────────────────────────
 *
 * The patch is not hand-rolled: it is DERIVED by running the existing record back
 * through `buildDoorStoreRecord()` — the SAME chokepoint both creation paths call — and
 * keeping only the non-instance keys. A migrated door and a newly-created door of the
 * same type therefore agree by construction, and they cannot drift apart later without
 * the chokepoint itself changing.
 *
 * Pure: no DOM, no THREE, no I/O, no `window.*` (P4). P8 — every exported function
 * emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { buildDoorStoreRecord } from './DoorOpeningFactory';
import { doorSystemTypeStore } from './DoorSystemTypeStore';
import { DEFAULT_DOOR_TOOL_CONFIG } from './DoorToolConfigStore';
import type { DoorOpening } from './DoorTypes';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-door', '0.1.0');
    return _cachedTracer;
}

/**
 * THE BOUNDARY. Fields the record OWNS as an instance — the migration must never
 * touch them (C15: the instance overrides the type; the void on the host wall must
 * keep agreeing with the leaf). Everything else `buildDoorStoreRecord()` produces is
 * TYPE-DERIVED and is what the backfill stamps.
 */
const INSTANCE_FIELDS: ReadonlySet<string> = new Set([
    'id', 'openingId', 'wallId',
    'offset', 'width', 'height', 'sillHeight',
    'frameThickness', 'frameDepth', 'leafThickness',
    'doorType', 'hingesSide', 'swingDirection',
    'mark',
]);

/** One record's migration: which door, from what (nothing), to which catalogue type. */
export interface HostedTypeBackfillEntry {
    readonly id: string;
    readonly wallId: string;
    /** Always `undefined` today — an untyped record is precisely what we migrate. */
    readonly from: string | undefined;
    readonly to: string;
    /** The type-derived fields to merge onto the record (never instance geometry). */
    readonly patch: Readonly<Record<string, unknown>>;
}

export interface DoorTypeBackfillPlan {
    /** The catalogue type every untyped door is migrated to. */
    readonly defaultTypeId: string;
    readonly defaultTypeName: string;
    readonly scanned: number;
    readonly entries: readonly HostedTypeBackfillEntry[];
    /**
     * Non-null when the plan could NOT be formed — e.g. the catalogue carries no
     * resolvable default. A finding to REPORT, never a type to invent.
     */
    readonly blockedReason: string | null;
}

/** A door record is untyped when it carries no non-empty `systemTypeId`. */
export function isDoorUntyped(door: Pick<DoorOpening, 'systemTypeId'>): boolean {
    return typeof door.systemTypeId !== 'string' || door.systemTypeId.length === 0;
}

/**
 * THE DEFAULT TYPE — resolved from the CATALOGUE, never invented.
 *
 * It is `DEFAULT_DOOR_TOOL_CONFIG.systemTypeId`, VALIDATED against
 * `doorSystemTypeStore`. That choice is deliberate and it is the whole point of the
 * ticket: the default MUST be the type a door created TODAY through the chokepoint
 * would carry (`buildDoorOpening` → `getDoorToolConfig()` → this same default), so a
 * backfilled legacy door and a freshly-drawn door are THE SAME DOOR. Any other choice
 * would re-create the divergence the migration exists to remove.
 *
 * NOT `getDoorToolConfig()` (the LIVE config): that is the architect's current ribbon
 * pick, so a session in which he last chose FD60 would stamp FD60 onto every legacy
 * door. A migration must be deterministic and idempotent, not a function of tool state.
 *
 * Returns `null` when the catalogue cannot resolve it — a FINDING, reported by the
 * command, never papered over.
 */
export function resolveDefaultDoorSystemTypeId(): string | null {
    return _tracer().startActiveSpan('pryzm.door.resolveDefaultSystemTypeId', (span) => {
        try {
            const id = DEFAULT_DOOR_TOOL_CONFIG.systemTypeId;
            const type = doorSystemTypeStore.getById(id);
            span.setAttribute('pryzm.door.defaultSystemTypeId', id);
            span.setAttribute('pryzm.door.defaultResolved', type !== undefined);
            span.end();
            return type ? id : null;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}

/**
 * Plan the door backfill. PURE — reads the catalogue, mutates nothing. The command
 * applies it (C03 §1: mutation only through commands).
 */
export function planDoorTypeBackfill(doors: readonly DoorOpening[]): DoorTypeBackfillPlan {
    return _tracer().startActiveSpan('pryzm.door.planTypeBackfill', (span) => {
        try {
            const defaultTypeId = resolveDefaultDoorSystemTypeId();
            if (!defaultTypeId) {
                const reason =
                    `[DoorTypeBackfill] The door catalogue has no resolvable default type ` +
                    `("${DEFAULT_DOOR_TOOL_CONFIG.systemTypeId}" is not in doorSystemTypeStore). ` +
                    `Refusing to invent one — no doors migrated.`;
                span.setAttribute('pryzm.door.backfill.blocked', true);
                span.end();
                return {
                    defaultTypeId: DEFAULT_DOOR_TOOL_CONFIG.systemTypeId,
                    defaultTypeName: '',
                    scanned: doors.length,
                    entries: [],
                    blockedReason: reason,
                };
            }

            const defaultType = doorSystemTypeStore.getById(defaultTypeId)!;
            const entries: HostedTypeBackfillEntry[] = [];

            for (const door of doors) {
                if (!isDoorUntyped(door)) continue;

                // PARITY BY CONSTRUCTION — re-run the record through the ONE record
                // chokepoint both creation paths use, with the type supplied.
                const canonical = buildDoorStoreRecord({
                    opening: {
                        ...door,
                        id:           door.openingId,   // the chokepoint's `opening.id` IS the openingId
                        elementId:    door.id,          // … and `opening.elementId` IS the door id
                        systemTypeId: defaultTypeId,
                    },
                    wallId: door.wallId,
                    mark:   door.mark,
                });

                const patch: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(canonical)) {
                    if (INSTANCE_FIELDS.has(k)) continue;   // never move the founder's geometry
                    if (v === undefined) continue;
                    patch[k] = v;
                }

                entries.push({
                    id:     door.id,
                    wallId: door.wallId,
                    from:   undefined,
                    to:     defaultTypeId,
                    patch,
                });
            }

            span.setAttribute('pryzm.door.backfill.scanned', doors.length);
            span.setAttribute('pryzm.door.backfill.untyped', entries.length);
            span.setAttribute('pryzm.door.backfill.defaultTypeId', defaultTypeId);
            span.end();
            return {
                defaultTypeId,
                defaultTypeName: defaultType.name,
                scanned: doors.length,
                entries,
                blockedReason: null,
            };
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
