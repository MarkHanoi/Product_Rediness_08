/**
 * @file elementYawRotate.ts
 *
 * §FIX-PLAN-ROTATE-PARITY (L-267, Gate G7) — the SINGLE canonical definition of
 * "what does it mean to ROTATE a placed element about world-Y".
 *
 * ## Why this module exists (C11 — one element type, one pipeline)
 *
 * The founder: *"wardrobe creation on 3D view + rotation working, but when creating
 * in plan view element not rotated — why is not implemented?"*
 *
 * The honest answer was worse than the question. PRE-placement rotation in plan
 * (SPACE = +90°, §FEAT-PLACEMENT-SPACEBAR-ROTATE / ADR-0105) has shipped. What had
 * NOT shipped — for ANY element type, not just wardrobes — is POST-placement
 * rotation from the plan view: select a placed element in plan, rotate it. In
 * `ContextualEditBar`, `move`/`align`/`copy` all route through `_activatePlanTool()`
 * (the view-context router, §FIX-PLAN-ELEMENT-TOOL-PARITY / L-95) and therefore work
 * on whichever surface is active; `rotate` alone jumped straight to
 * `transformControls.setMode('rotate')` — the 3-D gizmo — which is attached to the
 * 3-D canvas and is inert while a plan surface is up. So the Rotate button and the
 * `R` key were present, enabled, capability-gated ON... and silently did nothing.
 *
 * That is NOT a furniture bug. It is the plan view having no rotate at all.
 *
 * ## The rule this module enforces
 *
 * This project has a seven-times-repeated defect (L-239/240/243/246/251/255/260A):
 * *one element, TWO paths, and the plan path silently drops what the 3-D path
 * resolves*. A furniture-only plan rotate would have been instance number EIGHT.
 * So the plan rotate tool does NOT re-implement rotation — it calls THIS module,
 * and this module emits **the exact same command, with the exact same payload
 * shape, that the 3-D gizmo already dispatches on drag-end**
 * (`registerTransformDragHandler`):
 *
 *   • furniture → `furniture.updateParameters` { position, rotation: EulerDTO, … }
 *   • column    → `column.update`              { updates: { position, rotation: RADIANS } }
 *
 * NO NEW ROTATION REPRESENTATION IS INTRODUCED (C11 §7.0). Furniture already stores
 * an `EulerDTO`; column already stores a scalar radian yaw. We write the SAME fields
 * the gizmo writes, so a plan rotate and a 3-D rotate of the same element by the same
 * angle produce a byte-identical record mutation. That equivalence is pinned by
 * `__tests__/planRotateParity.spec.ts` and is the antidote to the disease.
 *
 * ## Scope: which types rotate (Gate G7)
 *
 * Exactly the types whose record carries an orientation degree of freedom AND whose
 * update command commits it today — i.e. the set `ElementCapabilities` ALREADY
 * declares `'rotate'` for. That the capability table needed no edit is the strongest
 * evidence the seam is right: the model always said these rotate; only the plan
 * surface could not do it.
 *
 * Deliberately EXCLUDED, with reasons (tracked under G7, not silently dropped):
 *   • wall / beam / curtain-wall / slab / floor / ceiling / roof / room — rotating
 *     these rewrites a baseline or a polygon, which cascades into WallJoinResolver
 *     corner re-detection, hosted door/window offsets and room re-detection. A naive
 *     vertex-rotate would tear joins apart and strand openings; `MovePlanToolHandler`
 *     needed §WALL-MOVE-CARRY-NEIGHBOURS for mere TRANSLATION, and rotation is
 *     strictly harder. It needs its own cascade design, not a copy-paste.
 *   • plumbing / lighting — their records DO carry a rotation, but their update
 *     commands (`plumbing.moveFixture` { id, to }) have no rotation field to commit
 *     it through. Adding one is a command-authoring change (C16), not a tool change.
 *     This is the same "add 'rotate' here only once their drag-commit lands" note
 *     that `ElementCapabilities` already carries.
 *
 * ## Sign convention (do not "fix" this without reading)
 *
 * Plan view maps +worldX → +screenX and +worldZ → +screenY (**down**) — see
 * `PlanViewCanvas.worldToScreen`, whose plan branch is `sy ∝ (worldV - camTarget.z)`.
 * A THREE Y-Euler of +θ maps local +X → world −Z (`Matrix4.makeRotationY`), i.e. it
 * carries a point from screen-RIGHT to screen-UP: **counter-clockwise on screen**.
 * Every function here uses that one convention, so the yaw we add to the record and
 * the orbit we apply to the position agree with each other and with the placed plan
 * symbol (which the *PlanSymbolBuilders render through a real THREE Y-Euler matrix).
 *
 * Layer: L5 (`apps/editor`). Like `furnitureCreatePayload`, this is an app-level
 * adapter from an editing gesture to the runtime CommandBus — a dispatch concern,
 * not geometry — so it lives in the app, not in an L2 geometry package. Pure: no
 * DOM, no `window`, no THREE. Spans are emitted by the bus at dispatch (P8), exactly
 * as for `buildFurnitureCreatePayload`.
 */

/** A pivot in the world XZ plane (metres). */
export interface PlanPivot {
    readonly x: number;
    readonly z: number;
}

/** A plain 3D point (world metres). */
export interface Vec3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * A THREE Euler read defensively: the furniture store round-trips through
 * `structuredClone`/persistence, so a rotation may arrive as `{x,y,z}` OR as the
 * private-field form `{_x,_y,_z}`. `registerTransformDragHandler` reads it the same
 * way — this is the identical defensive read, not a new one.
 */
export interface EulerLike {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
    readonly _x?: number;
    readonly _y?: number;
    readonly _z?: number;
    readonly order?: string;
    readonly _order?: string;
}

/**
 * The element types this module can yaw-rotate. Mirrors — and must stay in step
 * with — the types that declare `'rotate'` in `@pryzm/input-host`
 * `ElementCapabilities`. `assertYawRotateMatchesCapabilities()` in the test suite
 * pins the two together so they cannot drift.
 */
export const YAW_ROTATABLE_TYPES = ['furniture', 'column'] as const;

export type YawRotatableType = typeof YAW_ROTATABLE_TYPES[number];

/** True when `elementType` supports a plan-view yaw rotate. Case-insensitive. */
export function canYawRotate(elementType: string | null | undefined): boolean {
    if (!elementType) return false;
    const key = elementType.toLowerCase().trim();
    return (YAW_ROTATABLE_TYPES as readonly string[]).includes(key);
}

/**
 * The command a yaw rotation produces. A discriminated union so the caller cannot
 * mix a furniture payload into a column dispatch — the L-214/L-218/L-220
 * "wrong payload for a known command id" class is a COMPILE error here, not a
 * swallowed runtime `console.error`.
 */
export type YawRotateCommand =
    | {
          readonly type: 'furniture.updateParameters';
          readonly payload: {
              readonly id: string;
              readonly position: Vec3Like;
              readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly order?: string };
              readonly _recordUndo: true;
              readonly _prevPosition: Vec3Like;
              readonly _prevRotation: { readonly x: number; readonly y: number; readonly z: number };
          };
      }
    | {
          readonly type: 'column.update';
          readonly payload: {
              readonly id: string;
              readonly updates: { readonly position: Vec3Like; readonly rotation: number };
              readonly _recordUndo: true;
              readonly _prev: { readonly position: Vec3Like; readonly rotation: number };
          };
      };

/** Read a possibly `_`-prefixed Euler component. */
function eulerY(e: EulerLike | undefined | null): number {
    return e?.y ?? e?._y ?? 0;
}
function eulerX(e: EulerLike | undefined | null): number {
    return e?.x ?? e?._x ?? 0;
}
function eulerZ(e: EulerLike | undefined | null): number {
    return e?.z ?? e?._z ?? 0;
}

/**
 * Orbit a world XZ point about `pivot` by a yaw of `yaw` radians, using the SAME
 * handedness as a THREE Y-Euler (see the sign-convention note in the module header):
 *
 *     x' = pivot.x + dx·cosθ + dz·sinθ
 *     z' = pivot.z − dx·sinθ + dz·cosθ
 *
 * When `pivot` equals the point, this is the identity — so rotating an element about
 * its own anchor is a pure spin with no drift, and a Revit-style rotate about an
 * arbitrary pivot both spins AND orbits the element, as it must.
 */
export function orbitPointAboutPivot(
    point: { readonly x: number; readonly z: number },
    pivot: PlanPivot,
    yaw:   number,
): { x: number; z: number } {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const dx = point.x - pivot.x;
    const dz = point.z - pivot.z;
    return {
        x: pivot.x + dx * c + dz * s,
        z: pivot.z - dx * s + dz * c,
    };
}

/**
 * Build the canonical command for rotating `record` (an element of type
 * `elementType`) by `deltaYaw` radians about `pivot`.
 *
 * Returns `null` when the type does not rotate or the record is unusable — the
 * caller surfaces that, and NEVER falls back to a bespoke mutation.
 *
 * The emitted payloads are deliberately the SAME SHAPE the 3-D gizmo dispatches in
 * `registerTransformDragHandler` (including `_recordUndo` + the `_prev*` pre-gesture
 * pose, so the undo bridge emits an invertible PatchPair and ONE gesture = ONE undo
 * entry, C16). Position is carried through unchanged when the pivot is the element's
 * own anchor; it orbits when the pivot is elsewhere.
 */
export function buildYawRotateCommand(
    elementType: string,
    record:      unknown,
    pivot:       PlanPivot,
    deltaYaw:    number,
): YawRotateCommand | null {
    if (!Number.isFinite(deltaYaw) || deltaYaw === 0) return null;
    if (!record || typeof record !== 'object') return null;

    const type = elementType.toLowerCase().trim();
    const r = record as { id?: string; position?: Vec3Like; rotation?: EulerLike | number };

    const id = r.id;
    const pos = r.position;
    if (!id || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;

    const orbited = orbitPointAboutPivot(pos, pivot, deltaYaw);
    const prevPosition: Vec3Like = { x: pos.x, y: pos.y ?? 0, z: pos.z };
    const nextPosition: Vec3Like = { x: orbited.x, y: pos.y ?? 0, z: orbited.z };

    if (type === 'furniture') {
        // FurnitureData.rotation is an EulerDTO. Preserve any X/Z tilt the 3-D gizmo
        // may have committed and advance ONLY the yaw — a plan rotate is a rotation
        // about world-Y by definition, and must not flatten a tilted element.
        const rot = (typeof r.rotation === 'object' ? r.rotation : undefined) as EulerLike | undefined;
        const prevRx = eulerX(rot);
        const prevRy = eulerY(rot);
        const prevRz = eulerZ(rot);
        return {
            type: 'furniture.updateParameters',
            payload: {
                id,
                position: nextPosition,
                rotation: { x: prevRx, y: prevRy + deltaYaw, z: prevRz, order: rot?.order ?? rot?._order ?? 'XYZ' },
                _recordUndo: true,
                _prevPosition: prevPosition,
                _prevRotation: { x: prevRx, y: prevRy, z: prevRz },
            },
        };
    }

    if (type === 'column') {
        // ColumnData.rotation is a SCALAR yaw in radians (not an Euler) — the exact
        // field §COLUMN-DRAG-ROTATION commits from the 3-D gizmo.
        const prevRy = typeof r.rotation === 'number' ? r.rotation : 0;
        return {
            type: 'column.update',
            payload: {
                id,
                updates: { position: nextPosition, rotation: prevRy + deltaYaw },
                _recordUndo: true,
                _prev: { position: prevPosition, rotation: prevRy },
            },
        };
    }

    return null;
}
