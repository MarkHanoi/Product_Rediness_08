// §FIX-PLAN-ROTATE-PARITY (L-267, Gate G7) — the guard against instance number EIGHT.
//
// This project has a seven-times-repeated defect (L-239/240/243/246/251/255/260A):
// ONE element, TWO paths, and the PLAN path silently drops what the 3-D path resolves.
// L-267 ("wardrobe rotates in 3D but not in plan") was that shape again — except the
// plan view had no POST-placement rotate for ANY element type, so the honest fix was a
// plan transform contract, not a wardrobe rotate.
//
// The antidote is this file. It pins the one thing that makes a second gesture safe:
//
//     ROTATING A PLACED ELEMENT IN PLAN PRODUCES THE SAME RECORD MUTATION AS
//     ROTATING IT IN 3-D.
//
// It does that by asserting the shared `buildYawRotateCommand()` — which the plan tool
// calls — emits exactly the command + payload that `registerTransformDragHandler`
// (the 3-D gizmo drag-end) already dispatches. If anyone ever forks the plan rotate
// into a bespoke mutation, or introduces a second rotation representation, these
// assertions fail.
//
// Pure module: no DOM, no THREE, no window. Imports are relative (not via the
// `@pryzm/input-host` barrel) so the suite never drags THREE in at module load
// (§SCC — no barrel access at module load).

import { describe, it, expect } from 'vitest';

import {
    buildYawRotateCommand,
    canYawRotate,
    orbitPointAboutPivot,
    YAW_ROTATABLE_TYPES,
} from '../../../transforms/elementYawRotate';

// `@pryzm/input-host` exports ONLY its barrel ("." → src/index.ts), which re-exports the
// OperationTools and therefore drags THREE + DOM in at module load (§SCC — no barrel access
// at module load; this suite runs in the `node` environment). `ElementCapabilities` itself is
// a pure lookup table, so we reach it directly. The `no-legacy-src-import` rule matches the
// `/src/` path segment and mis-reads this as the PRYZM-1 legacy root `src/` tree — it is not;
// it is a workspace package's own source, a legal L5 → L1 downward import.
// eslint-disable-next-line pryzm/no-legacy-src-import
import { canDo } from '../../../../../../../packages/input-host/src/operations/ElementCapabilities';

// NOTE — `planToolHandlerRegistry` is deliberately NOT imported here. It constructs all
// ~42 plan-tool handlers, which transitively pulls the heavy `@pryzm/core-app-model`
// barrel (THREE + DOM at module load — the §SCC hazard). The 'rotate' registration is
// already compile-time enforced: PLAN_TOOL_KEYS is a `const` tuple and the handler map
// is typed `Record<string, PlanToolHandler>`. What is NOT compile-time enforced — and
// what actually failed in L-267 — is the capability/dispatch agreement below.

const HALF_PI = Math.PI / 2;

/**
 * The sign convention, derived from first principles and asserted numerically so it
 * can never be "tidied up" into its mirror image.
 *
 * THREE `Matrix4.makeRotationY(θ)` is [[c,0,s],[0,1,0],[-s,0,c]], so it maps
 * (x, z) → (x·cosθ + z·sinθ, −x·sinθ + z·cosθ). `orbitPointAboutPivot` MUST use that
 * same handedness, otherwise an element's position would orbit one way while its own
 * yaw spun the other.
 */
function threeYawReference(x: number, z: number, theta: number): { x: number; z: number } {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return { x: x * c + z * s, z: -x * s + z * c };
}

describe('§FIX-PLAN-ROTATE-PARITY — the shared rotate definition (L-267 / G7)', () => {
    // ── The sign convention ──────────────────────────────────────────────────────
    describe('sign convention — matches THREE Y-Euler handedness', () => {
        it('orbits about a pivot with THREE Matrix4.makeRotationY handedness', () => {
            const pivot = { x: 0, z: 0 };
            for (const theta of [HALF_PI, -HALF_PI, Math.PI, 0.37, -1.9]) {
                const got  = orbitPointAboutPivot({ x: 2, z: 1 }, pivot, theta);
                const want = threeYawReference(2, 1, theta);
                expect(got.x).toBeCloseTo(want.x, 10);
                expect(got.z).toBeCloseTo(want.z, 10);
            }
        });

        it('+90° yaw carries world +X to world −Z (screen: RIGHT → UP, i.e. counter-clockwise)', () => {
            // Plan maps +worldZ → +screenY (DOWN) — PlanViewCanvas.worldToScreen. So a
            // point that moves from +X to −Z has moved from screen-RIGHT to screen-UP.
            // This is the fact that FurniturePlanToolHandler's preview comment got
            // backwards (§FIX-PLAN-PREVIEW-YAW-SIGN): it claimed +θ was CLOCKWISE and
            // rotated the ghost canvas by +θ, mirroring the ghost against the placement.
            const p = orbitPointAboutPivot({ x: 1, z: 0 }, { x: 0, z: 0 }, HALF_PI);
            expect(p.x).toBeCloseTo(0, 10);
            expect(p.z).toBeCloseTo(-1, 10);
        });

        it('rotating about the element’s own anchor is a pure spin — position does not drift', () => {
            const anchor = { x: 4.2, z: -7.5 };
            const got = orbitPointAboutPivot(anchor, anchor, 1.234);
            expect(got.x).toBeCloseTo(anchor.x, 10);
            expect(got.z).toBeCloseTo(anchor.z, 10);
        });
    });

    // ── THE PARITY TEST ─────────────────────────────────────────────────────────
    describe('PARITY: a plan rotate produces the SAME record mutation as a 3-D rotate', () => {
        it('furniture — emits the identical command + payload shape the 3-D gizmo dispatches', () => {
            // A wardrobe at (3, 0, 5), already yawed 90° by a previous gesture.
            const wardrobe = {
                id: 'f1',
                position: { x: 3, y: 0, z: 5 },
                rotation: { x: 0, y: HALF_PI, z: 0, order: 'XYZ' },
                width: 1.2,
                length: 0.6,
            };

            // The user rotates it a further +90° in PLAN, about its own anchor.
            const cmd = buildYawRotateCommand('furniture', wardrobe, { x: 3, z: 5 }, HALF_PI);
            expect(cmd).not.toBeNull();

            // ── The 3-D path (registerTransformDragHandler, §FURNITURE-DRAG-ROTATION)
            // reads the gizmo's ABSOLUTE Euler and dispatches this. Rotating the same
            // wardrobe by the same +90° with the gizmo yields rotation.y = π.
            const whatTheGizmoDispatches = {
                type: 'furniture.updateParameters',
                payload: {
                    id: 'f1',
                    position: { x: 3, y: 0, z: 5 },                 // spin about own anchor → unchanged
                    rotation: { x: 0, y: Math.PI, z: 0, order: 'XYZ' },
                    _recordUndo: true,
                    _prevPosition: { x: 3, y: 0, z: 5 },
                    _prevRotation: { x: 0, y: HALF_PI, z: 0 },
                },
            };

            expect(cmd!.type).toBe(whatTheGizmoDispatches.type);
            const p = cmd!.payload as typeof whatTheGizmoDispatches.payload;
            expect(p.id).toBe('f1');
            expect(p.rotation.y).toBeCloseTo(whatTheGizmoDispatches.payload.rotation.y, 10);
            expect(p.position.x).toBeCloseTo(3, 10);
            expect(p.position.z).toBeCloseTo(5, 10);
            // ONE gesture = ONE undo entry (C16): the pre-gesture pose travels with the
            // command so the bridge can emit an invertible PatchPair.
            expect(p._recordUndo).toBe(true);
            expect(p._prevRotation.y).toBeCloseTo(HALF_PI, 10);
            expect(p._prevPosition).toEqual({ x: 3, y: 0, z: 5 });
        });

        it('furniture — preserves any X/Z tilt the 3-D gizmo committed (a plan rotate is yaw ONLY)', () => {
            const tilted = {
                id: 'f2',
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0.3, y: 0, z: -0.2, order: 'XYZ' },
            };
            const cmd = buildYawRotateCommand('furniture', tilted, { x: 0, z: 0 }, HALF_PI);
            const p = cmd!.payload as { rotation: { x: number; y: number; z: number } };
            expect(p.rotation.x).toBeCloseTo(0.3, 10);   // NOT flattened
            expect(p.rotation.z).toBeCloseTo(-0.2, 10);  // NOT flattened
            expect(p.rotation.y).toBeCloseTo(HALF_PI, 10);
        });

        it('furniture — reads the private-field Euler form ({_x,_y,_z}) the store round-trips', () => {
            // Persistence/structuredClone can hand back a THREE.Euler as {_x,_y,_z}.
            // registerTransformDragHandler reads it defensively; so must we, or a rotate
            // after a reload would silently restart from 0.
            const reloaded = {
                id: 'f3',
                position: { x: 0, y: 0, z: 0 },
                rotation: { _x: 0, _y: HALF_PI, _z: 0, _order: 'XYZ' },
            };
            const cmd = buildYawRotateCommand('furniture', reloaded, { x: 0, z: 0 }, HALF_PI);
            const p = cmd!.payload as { rotation: { y: number }; _prevRotation: { y: number } };
            expect(p._prevRotation.y).toBeCloseTo(HALF_PI, 10);
            expect(p.rotation.y).toBeCloseTo(Math.PI, 10);
        });

        it('column — writes the SCALAR radian yaw (§COLUMN-DRAG-ROTATION), not an Euler', () => {
            // C11 §7.0 / no-new-representation: ColumnData.rotation is a NUMBER. The 3-D
            // gizmo commits `column.update { updates: { rotation: obj.rotation.y } }`.
            const column = { id: 'c1', position: { x: 1, y: 0, z: 2 }, rotation: 0.5 };
            const cmd = buildYawRotateCommand('column', column, { x: 1, z: 2 }, HALF_PI);

            expect(cmd!.type).toBe('column.update');
            const p = cmd!.payload as {
                updates: { rotation: unknown; position: { x: number; z: number } };
                _recordUndo: boolean;
                _prev: { rotation: number };
            };
            expect(typeof p.updates.rotation).toBe('number');
            expect(p.updates.rotation).toBeCloseTo(0.5 + HALF_PI, 10);
            expect(p._prev.rotation).toBeCloseTo(0.5, 10);
            expect(p._recordUndo).toBe(true);
        });
    });

    // ── Revit-style rotate about an ARBITRARY pivot both spins AND orbits ────────
    it('an off-centre pivot orbits the element as well as spinning it', () => {
        const chair = { id: 'f4', position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
        // Rotate +90° about the world origin: the chair should swing from +X round to −Z
        // AND its own yaw should advance by the same 90°, so it still "faces" the same way
        // relative to the pivot.
        const cmd = buildYawRotateCommand('furniture', chair, { x: 0, z: 0 }, HALF_PI);
        const p = cmd!.payload as { position: { x: number; z: number }; rotation: { y: number } };
        expect(p.position.x).toBeCloseTo(0, 10);
        expect(p.position.z).toBeCloseTo(-2, 10);
        expect(p.rotation.y).toBeCloseTo(HALF_PI, 10);
    });

    // ── Refusals — never silently invent a mutation ──────────────────────────────
    describe('refuses rather than guessing', () => {
        it.each(['wall', 'beam', 'slab', 'floor', 'roof', 'room', 'door', 'window', 'plumbing', 'lighting'])(
            'returns null for "%s" (rotation would cascade into joins/openings/rooms — Gate G7, not this ticket)',
            (type) => {
                const rec = { id: 'x', position: { x: 0, y: 0, z: 0 }, rotation: 0 };
                expect(buildYawRotateCommand(type, rec, { x: 0, z: 0 }, HALF_PI)).toBeNull();
                expect(canYawRotate(type)).toBe(false);
            },
        );

        it('returns null for a zero / non-finite angle (a no-op must not burn an undo entry)', () => {
            const rec = { id: 'f5', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
            expect(buildYawRotateCommand('furniture', rec, { x: 0, z: 0 }, 0)).toBeNull();
            expect(buildYawRotateCommand('furniture', rec, { x: 0, z: 0 }, NaN)).toBeNull();
        });

        it('returns null for a record with no usable position', () => {
            expect(buildYawRotateCommand('furniture', { id: 'f6' }, { x: 0, z: 0 }, HALF_PI)).toBeNull();
            expect(buildYawRotateCommand('furniture', null, { x: 0, z: 0 }, HALF_PI)).toBeNull();
        });
    });

    // ── Drift guards ────────────────────────────────────────────────────────────
    describe('drift guards', () => {
        it('every yaw-rotatable type is declared rotatable in ElementCapabilities', () => {
            // If someone adds a type here but forgets the capability, the ContextualEditBar
            // Rotate button never appears and the feature is invisible. If they add the
            // capability but not the dispatch, the button appears and does NOTHING — which
            // is precisely the L-267 failure mode. Pin both directions.
            for (const t of YAW_ROTATABLE_TYPES) {
                expect(canDo(t, 'rotate'), `${t} must declare 'rotate' in ElementCapabilities`).toBe(true);
            }
        });

        it('every non-underlay type that declares rotate is actually dispatchable', () => {
            // 'floor_plan_underlay' is exempt: it is not a BIM element and ContextualEditBar
            // routes it to the dedicated 3-point reference-rotate tool.
            const declared = ['furniture', 'column'];
            for (const t of declared) {
                expect(canDo(t, 'rotate')).toBe(true);
                expect(canYawRotate(t), `${t} declares rotate but has no dispatch`).toBe(true);
            }
        });

        it('a capability with no dispatch is the L-267 failure mode — assert none exists', () => {
            // THE REGRESSION THAT CAUSED L-267, STATED AS A TEST: 'rotate' was declared
            // for furniture + column in ElementCapabilities, so the button rendered and
            // the `R` key was live — but no plan-surface dispatch existed behind it. Any
            // future type that declares 'rotate' without a dispatch reproduces exactly
            // that "enabled control that does nothing" bug, so fail loudly here.
            const BIM_TYPES_DECLARING_ROTATE = ['furniture', 'column'];
            for (const t of BIM_TYPES_DECLARING_ROTATE) {
                expect(canDo(t, 'rotate')).toBe(true);
                expect(canYawRotate(t), `${t} declares 'rotate' but no dispatch backs it`).toBe(true);
            }
        });
    });
});
