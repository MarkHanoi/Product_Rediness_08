/**
 * DoorOpeningFactory — §FIX-DOOR-CREATION-PARITY (L-260 A). THE `door.create` CHOKEPOINT.
 *
 * C11 §3: the plan tool, the 3D tool, the batch generators and the AI planes MUST
 * converge on ONE resolution of "what door is this". Before this module they did not:
 *
 *   FIELD-BY-FIELD DIFF of the two stored records for the SAME ribbon selection
 *   (this is the bug, verbatim):
 *
 *   | field            | 3D (`DoorTool` → `CreateWallOpeningCommand`) | PLAN (`DoorPlanToolHandler` → bus) |
 *   |------------------|----------------------------------------------|------------------------------------|
 *   | `doorType`       | the ribbon choice (single **or double**)     | **ALWAYS `'single'`** — it read    |
 *   |                  |                                              | `activeOpeningTool.doorType`, and  |
 *   |                  |                                              | `activeOpeningTool` resolves to    |
 *   |                  |                                              | `window.windowTool` (always set),  |
 *   |                  |                                              | which has NO `doorType`.           |
 *   | `systemTypeId`   | `DoorTool.systemTypeId`, which                | `window.doorTool?.systemTypeId`    |
 *   |                  | `ToolManager.activateDoor()` sets to          | `?? 'dt-solid-timber'` (a P4       |
 *   |                  | `undefined` whenever the caller omits it     | global read that could never be    |
 *   |                  | (bottom menu / create panel) → **typeless    | undefined) → **always typed**.     |
 *   |                  | door → schema-default grey frame + leaf,     |                                    |
 *   |                  | no glazing/sidelight, default hardware**     |                                    |
 *   | `width`/`height` | derived from `systemTypeId` → default dims   | derived from a DIFFERENT           |
 *   | frame/leaf dims  | when typeless                                 | `systemTypeId` → the type's dims   |
 *   | `frameDepth`     | `wall.thickness` (the reveal)                | `dims.frameDepth` (0.07 default)   |
 *   | `mark`           | `generateMark('door', …)` → `D-…`            | **absent** → blank door schedule   |
 *   | `finishMaterial` | `leafFinish.name`                            | **absent** → blank room schedule   |
 *
 * The two doors in the founder's screenshot are therefore literally different
 * objects: different leaf treatment (single vs double / typed vs typeless leaf
 * segments), different frame + hardware (typed finish vs schema-default).
 *
 * ── The cure ──────────────────────────────────────────────────────────────────
 *
 * `buildDoorOpening()` resolves the door ONCE from the ONE config
 * (`DoorToolConfigStore`) + the host wall. Both tools call it. `buildDoorStoreRecord()`
 * resolves the rich `DoorStore` record ONCE from that opening. Both commit paths
 * (`CreateWallOpeningCommand` for 3D, the `wall.opening.created` bridge for the bus /
 * plan path) call it. Same choice + same wall ⇒ BYTE-IDENTICAL records, by construction.
 *
 * Pure: no DOM, no THREE, no I/O. P8 — every exported function emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { resolveDoorDimensions } from './DoorDimensions';
import { doorSystemTypeStore } from './DoorSystemTypeStore';
import {
    getDoorToolConfig,
    type DoorToolConfig,
    type DoorTypeChoice,
} from './DoorToolConfigStore';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-door', '0.1.0');
    return _cachedTracer;
}

/** The flat wall-opening record persisted on `WallData.openings[]` (C15 §2). */
export interface DoorOpeningData {
    readonly id: string;
    readonly elementId: string;
    readonly type: 'door';
    readonly doorType: DoorTypeChoice;
    readonly systemTypeId: string;
    /** LEFT EDGE of the opening span (§OPENING-OFFSET-LEFTEDGE-UNIFY). */
    readonly offset: number;
    readonly width: number;
    readonly height: number;
    readonly sillHeight: number;
    readonly frameThickness: number;
    readonly frameDepth: number;
    readonly leafThickness: number;
    readonly hingesSide: 'left' | 'right';
    readonly swingDirection: 'inward' | 'outward';
}

export interface BuildDoorOpeningInput {
    /**
     * The architect's resolved choice. Plan tools pass the DI'd
     * `PlanToolDrawContext.doorConfig`; when omitted the chokepoint reads the
     * single `DoorToolConfigStore` itself, so no caller can drift.
     */
    readonly config?: Partial<DoorToolConfig>;
    /** Host wall thickness (m) — the frame spans the full reveal. */
    readonly wallThickness: number;
    /** LEFT EDGE of the opening span along the wall baseline (m). */
    readonly offset: number;
    readonly hingesSide?: 'left' | 'right';
    readonly swingDirection?: 'inward' | 'outward';
    /** Pre-generated ids so PRYZM3 + legacy stores share stable keys. */
    readonly id?: string;
    readonly elementId?: string;
}

/** Fallback reveal depth when the host wall thickness is unknown/degenerate. */
const FALLBACK_WALL_THICKNESS = 0.2;

/**
 * THE CHOKEPOINT. Resolve a complete, canonical door opening record from the
 * architect's ONE config + the host wall. Every door creation path calls this.
 */
export function buildDoorOpening(input: BuildDoorOpeningInput): DoorOpeningData {
    return _tracer().startActiveSpan('pryzm.door.buildOpening', (span) => {
        try {
            const stored = getDoorToolConfig();
            const doorType: DoorTypeChoice = input.config?.doorType ?? stored.doorType;
            const systemTypeId: string =
                (input.config?.systemTypeId && input.config.systemTypeId.length > 0)
                    ? input.config.systemTypeId
                    : stored.systemTypeId;

            const dims = resolveDoorDimensions(systemTypeId, doorType);

            // The frame spans the FULL wall reveal — this is what DoorBuilder actually
            // renders (`wall.thickness + 0.02`) and what DoorPlanSymbolBuilder draws the
            // frame faces at, so the stored record must agree with both. The type's own
            // `frameDepth` is only a fallback for a wall with no resolvable thickness.
            const wallThickness = Number.isFinite(input.wallThickness) && input.wallThickness > 0
                ? input.wallThickness
                : FALLBACK_WALL_THICKNESS;

            const opening: DoorOpeningData = {
                id:             input.id ?? crypto.randomUUID(),
                elementId:      input.elementId ?? crypto.randomUUID(),
                type:           'door',
                doorType,
                systemTypeId,
                offset:         input.offset,
                width:          dims.width,
                height:         dims.height,
                sillHeight:     0,
                frameThickness: dims.frameThickness,
                frameDepth:     wallThickness,
                leafThickness:  dims.leafThickness,
                hingesSide:     input.hingesSide     ?? 'left',
                swingDirection: input.swingDirection ?? 'inward',
            };

            span.setAttribute('pryzm.door.systemTypeId', systemTypeId);
            span.setAttribute('pryzm.door.doorType', doorType);
            span.setAttribute('pryzm.door.width', opening.width);
            span.end();
            return opening;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}

export interface BuildDoorStoreRecordInput {
    /** The canonical opening (from `buildDoorOpening`, or a persisted one on replay). */
    readonly opening: Readonly<Record<string, unknown>>;
    readonly wallId: string;
    /** Pre-assigned canonical mark, or a resolver to generate one (C03 §1.7). */
    readonly mark?: string;
    readonly resolveMark?: () => string;
}

/**
 * THE CHOKEPOINT (store side). Build the rich `DoorStore` record from a canonical
 * opening. Both commit paths call this so a plan-created door and a 3D-created door
 * are byte-identical in the store: same finishes, same mark, same dims.
 */
export function buildDoorStoreRecord(input: BuildDoorStoreRecordInput): Record<string, unknown> {
    return _tracer().startActiveSpan('pryzm.door.buildStoreRecord', (span) => {
        try {
            const o = input.opening;
            const elementId = String(o.elementId ?? '');
            const openingId = String(o.id ?? '');

            const doorType: DoorTypeChoice = o.doorType === 'double' ? 'double' : 'single';
            const systemTypeId = (typeof o.systemTypeId === 'string' && o.systemTypeId.length > 0)
                ? o.systemTypeId
                : getDoorToolConfig().systemTypeId;

            const sysType = doorSystemTypeStore.getById(systemTypeId);
            if (!sysType) {
                // §DOOR-SYSTYPE-RESOLVE-WARN — a supplied id that resolves to nothing means
                // the door ships with NO finish (blank schedule + schema-default grey). Loud,
                // never silent; the door is still created.
                console.warn(
                    `[DoorOpeningFactory] door systemTypeId "${systemTypeId}" did not resolve to a ` +
                    `built-in door type — door created WITHOUT frame/leaf finish (blank schedule).`,
                );
            }

            // Dims: prefer what the opening persisted; otherwise re-resolve from the type,
            // so a legacy/replayed opening still lands on the canonical dimensions.
            const dims = resolveDoorDimensions(systemTypeId, doorType);
            const num = (v: unknown, fallback: number): number =>
                (typeof v === 'number' && Number.isFinite(v)) ? v : fallback;

            const record: Record<string, unknown> = {
                id:             elementId,
                openingId,
                wallId:         input.wallId,
                offset:         num(o.offset, 0),
                width:          num(o.width, dims.width),
                height:         num(o.height, dims.height),
                sillHeight:     num(o.sillHeight, 0),
                frameThickness: num(o.frameThickness, dims.frameThickness),
                frameDepth:     num(o.frameDepth, dims.frameDepth),
                leafThickness:  num(o.leafThickness, dims.leafThickness),
                doorType,
                hingesSide:     o.hingesSide === 'right' ? 'right' : 'left',
                swingDirection: o.swingDirection === 'outward' ? 'outward' : 'inward',
                systemTypeId,
            };

            const mark = (input.mark && String(input.mark).trim())
                ? String(input.mark)
                : input.resolveMark?.();
            if (mark) record.mark = mark;

            if (sysType) {
                record.frameFinish    = { ...sysType.frameFinish };
                record.leafFinish     = { ...sysType.leafFinish };
                record.frameColor     = sysType.frameFinish.materialColor;
                record.leafColor      = sysType.leafFinish.materialColor;
                record.finishMaterial = sysType.leafFinish.name;
            }

            span.setAttribute('pryzm.door.systemTypeId', systemTypeId);
            span.setAttribute('pryzm.door.doorType', doorType);
            span.setAttribute('pryzm.door.resolvedType', sysType !== undefined);
            span.end();
            return record;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
