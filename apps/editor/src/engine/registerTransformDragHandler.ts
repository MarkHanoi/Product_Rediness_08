import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { dispatchTyped, type CommandRegistry } from '@pryzm/command-bus';
import type { TransformControllerSet } from './initTransformControllers';

/**
 * §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — typed drag-command dispatch that
 * closes the payload-mismatch class AND surfaces failures to the user.
 *
 * Routes through `dispatchTyped` so a wrong payload for a known command id is a
 * COMPILE error at the call site (the L-214 / L-218 / L-220 defect class:
 * `runtime.bus.executeCommand(type, unknown)` accepted anything and only caught
 * the mismatch at runtime as a swallowed `console.error`). And a rejected
 * `canExecute` on a user drag now SURFACES via the `pryzm:toast` channel (§P4) —
 * the founder clicked and nothing happened, with only a console line to show for
 * it. Best-effort: no runtime → silent no-op; toast bus optional.
 */
function dragDispatch<K extends keyof CommandRegistry>(type: K, payload: CommandRegistry[K]): void {
    const bus = window.runtime?.bus;
    if (!bus) return;
    dispatchTyped(bus, type, payload).catch((e: unknown) => {
        console.error(`[TransformDrag] ${type} failed:`, e);
        const noun = String(type).split('.')[0];
        window.runtime?.events?.emit('pryzm:toast', {
            message: `Couldn't update the ${noun} — ${e instanceof Error ? e.message : String(e)}`,
            severity: 'error',
        });
    });
}
// [F-1.2] R2/R3 dual-write — commandManager is the authoritative path for
// WallRebuildCoordinator; bus is PRYZM3 store parity only.

interface DragHandlerDeps extends TransformControllerSet {
    world: any;
    bimManager: { getLevelById(id: string): any };
    selectionManager: { selectedObject: THREE.Object3D | null; applyHighlight(obj: THREE.Object3D): void; unselectAll(): void };
    updateInspector: (obj: THREE.Object3D) => void;
}

/**
 * Registers the dragging-changed handler (drag-end for all supported BIM element
 * types), the camera maxDistance guard, and the bim-selection-changed listener.
 * Extracted from engineLauncher.ts Task 5.2.
 * Call AFTER initTools() so selectionManager is available.
 *
 * OI-038 / OI-039 — Phase 2 robustness audit:
 *   All element types that the 3D gizmo can select now commit their new
 *   position via the appropriate Update command through commandManager so
 *   that Ctrl+Z (which already falls back to commandManager.undo() per the
 *   OI-034 fix in initUI.ts) correctly reverts the move.
 *
 *   Stair and handrail have no positional payload in their Update commands
 *   (position is implicit in their flight/path geometry, not a top-level
 *   field). A drag attempt on those types is detected, a store-rebuild event
 *   is dispatched to snap the mesh back to its canonical position, and a
 *   console warning guides the user to the Plan View move tool.
 *
 * Contract compliance:
 *   §07-BIM-SECURITY-CONTRACT C03 — no direct mesh/Three.js state commits
 *     without a backing Command that updates the store.
 *   §07-BIM-SECURITY-CONTRACT C05 — all mutations via store methods only.
 *   §07-BIM-SECURITY-CONTRACT C08 — command layer stays headless; UI toasts
 *     are best-effort via window.showAppToast.
 */
export function registerTransformDragHandler(deps: DragHandlerDeps): void {
    const {
        transformControls, levelPlaneConstraint,
        hostedDragController, wallTransformController, stairTransformController, wallEndpointController,
        world, bimManager, selectionManager, updateInspector,
    } = deps;

    transformControls.addEventListener('dragging-changed', (event) => {
        world.camera.controls.enabled = !event.value;

        // §PERF-WALL-DRAG-DEFER (ADR-061) — mark a wall drag as in-progress so
        // WallRebuildCoordinator._scheduleFlush defers the heavy whole-level
        // wall-join resolve (+ room redetect + plan re-projection) until release.
        // The live mesh still follows the gizmo via WallTransformController
        // (visual-only). Set at drag-START (event.value=true) when the selected
        // element is a wall; the flag is cleared at drag-END below (after the
        // single authoritative commit is dispatched) so the deferred flush drains
        // exactly once. Guard on element type so non-wall drags are unaffected.
        if (event.value) {
            const sel = selectionManager.selectedObject;
            const selType = (sel?.userData?.elementType ?? '').toString().toLowerCase();
            if (selType === 'wall') {
                window.__wallDragInProgress = true;
            }
            return;
        }

        if (!event.value && selectionManager.selectedObject) {
            const obj = selectionManager.selectedObject;
            const elemType = (obj.userData?.elementType ?? '').toLowerCase();

            // ── Door / Window (hosted drag controller handles offset) ───────
            if (elemType === 'door' || elemType === 'window') {
                hostedDragController.handleDragEnd(obj);
                updateInspector(obj);
                return;
            }

            // ── Roof ────────────────────────────────────────────────────────
            if (elemType === 'roof' && obj.userData?.id) {
                const rs = window.roofStore; // TODO(TASK-08)
                const roofId = obj.userData.id as string;
                const roof = rs?.getById?.(roofId);
                if (roof) {
                    const fp = roof.footprint;
                    const cx = fp?.centroid?.[0] ?? 0;
                    const cz = fp?.centroid?.[1] ?? 0;
                    const dx = obj.position.x - cx;
                    const dz = obj.position.z - cz;
                    if ((Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) && fp?.polygon?.length) {
                        const newPolygon: [number, number][] = fp.polygon.map(
                            (pt: [number, number]) => [pt[0] + dx, pt[1] + dz] as [number, number]
                        );
                        const newCentroid: [number, number] = [cx + dx, cz + dz];
                        dragDispatch('roof.update', { id: roofId, updates: { footprint: { polygon: newPolygon, centroid: newCentroid } } });
                        const captured = obj;
                        const sched = getFrameScheduler();
                        sched.scheduleOnce('engine-bootstrap-roof-rehighlight-1', () => {
                            sched.scheduleOnce('engine-bootstrap-roof-rehighlight-2', () => {
                                if (selectionManager.selectedObject === captured) {
                                    selectionManager.applyHighlight(captured);
                                }
                            });
                        });
                    }
                }
            }

            // ── Wall ────────────────────────────────────────────────────────
            if ((obj.userData?.elementType ?? '').toString().toLowerCase() === 'wall' && obj.userData?.id) {
                const activeWallStore = window.wallStore; // TODO(TASK-08)
                const wallId = obj.userData.id as string;
                const wall = activeWallStore?.getById?.(wallId);

                if (wall) {
                    const oldStart = wall.baseLine[0];
                    const oldEnd   = wall.baseLine[1];
                    const dx = obj.position.x - oldStart.x;
                    const dz = obj.position.z - oldStart.z;
                    const level  = bimManager.getLevelById(wall.levelId);
                    const worldY = (level?.elevation ?? 0) + (wall.baseOffset ?? 0);

                    if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                        const newStart  = { x: oldStart.x + dx, y: worldY, z: oldStart.z + dz };
                        const newEnd    = { x: oldEnd.x   + dx, y: worldY, z: oldEnd.z   + dz };
                        const prevStart = { x: oldStart.x, y: oldStart.y, z: oldStart.z };
                        const prevEnd   = { x: oldEnd.x,   y: oldEnd.y,   z: oldEnd.z   };

                        // §R5-FIX (highlight at old position): patch userData.baseLine on
                        // the wallGroup IMMEDIATELY so the SelectionBoundsRegistry OBB builder
                        // reads the new world coordinates even if buildWall() is delayed or
                        // skipped by the cache guard.  Without this patch the 2-frame-delayed
                        // applyHighlight() may read the stale pre-drag baseLine and render the
                        // highlight box at the original position.
                        obj.userData.baseLine = [
                            { x: newStart.x, y: newStart.y, z: newStart.z },
                            { x: newEnd.x,   y: newEnd.y,   z: newEnd.z   },
                        ];

                        // §PERF-WALL-DRAG-DEFER (ADR-061) — the drag is ending and we
                        // are about to dispatch the SINGLE authoritative commit. Clear
                        // the in-progress flag FIRST so the synchronous store-subscriber
                        // → WallRebuildCoordinator._scheduleFlush triggered by this
                        // commit takes the normal (immediate) path and rebuilds the wall
                        // once. Any flushes that were deferred DURING the drag are drained
                        // by this same commit's flush.
                        window.__wallDragInProgress = false;

                        // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
                        // Direct window.commandManager call removed; bus fires UpdateWallBaselineHandler
                        // which calls initBusHandlers bridge → commandManager.execute() so
                        // WallRebuildCoordinator receives bim-wall-updated and rebuilds with voids.
                        //
                        // §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — `_recordUndo: true` opts this
                        // 3D-gizmo move into the unified ring-buffer undo timeline. Without it the
                        // move landed ONLY in the legacy commandManager, so the ring-buffer-FIRST
                        // performUndo() undid whatever covered `wall` entry was on the ring (the
                        // wall's own create, a generated batch, …) and the move — stranded on the
                        // independent cm cursor — was never reverted ("wall stays moved"). The
                        // handler now emits a baseLine forward/inverse PatchPair; the cm twin is
                        // shadow-dropped after the ring-buffer undo (dual-dispatch — like a CREATE).
                        dragDispatch('wall.updateBaseline', {
                            wallId,
                            newBaseLine:  [newStart,  newEnd],
                            prevBaseLine: [prevStart, prevEnd],
                            _recordUndo: true,
                        });
                    }

                    const capturedObj = obj;
                    const sched = getFrameScheduler();
                    sched.scheduleOnce('engine-bootstrap-wall-rehighlight-1', () => {
                        sched.scheduleOnce('engine-bootstrap-wall-rehighlight-2', () => {
                            if (selectionManager.selectedObject === capturedObj) {
                                selectionManager.applyHighlight(capturedObj);
                            }
                        });
                    });
                }
            }

            // ── Furniture ───────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            if (elemType === 'furniture' && obj.userData?.id) {
                const fs = window.furnitureStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const item = fs?.get?.(id) ?? (fs as any)?.getById?.(id);
                if (item) {
                    const pos = item.position as { x: number; y: number; z: number } | undefined;
                    const prevX = pos?.x ?? 0;
                    const prevZ = pos?.z ?? 0;
                    const prevY = pos?.y ?? 0;
                    const dx = obj.position.x - prevX;
                    const dz = obj.position.z - prevZ;
                    // §FURNITURE-DRAG-ROTATION (founder 2026-06-19) — also read and COMMIT the
                    // gizmo's rotation. The old code gated the commit on a POSITION delta and
                    // sent only `position`, so a ROTATE-only drag never committed (rotation lost
                    // on rebuild + the plan view never re-projected) and a move-after-rotate
                    // committed position with the STALE store rotation → the mesh snapped back to
                    // origin. THREE stores Euler as {x,y,z} or {_x,_y,_z}; read defensively.
                    const prevRot = item.rotation as { x?: number; y?: number; z?: number; _x?: number; _y?: number; _z?: number } | undefined;
                    const prevRx = prevRot?.x ?? prevRot?._x ?? 0;
                    const prevRy = prevRot?.y ?? prevRot?._y ?? 0;
                    const prevRz = prevRot?.z ?? prevRot?._z ?? 0;
                    const moved   = Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6;
                    const rotated = Math.abs(obj.rotation.x - prevRx) > 1e-4
                                 || Math.abs(obj.rotation.y - prevRy) > 1e-4
                                 || Math.abs(obj.rotation.z - prevRz) > 1e-4;
                    if (moved || rotated) {
                        // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — opt this 3D-gizmo move/rotate
                        // into the unified ring-buffer undo timeline (mirrors L-49 for walls).
                        // `_prevPosition`/`_prevRotation` are the pre-move pose so the handler's
                        // inverse PatchPair restores it exactly; without this the move landed
                        // ONLY in commandManager and the ring-buffer-first undo reverted some
                        // other element ("furniture stays moved").
                        dragDispatch('furniture.updateParameters', {
                            id,
                            position: { x: prevX + dx, y: prevY, z: prevZ + dz },
                            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z, order: obj.rotation.order },
                            _recordUndo: true,
                            _prevPosition: { x: prevX, y: prevY, z: prevZ },
                            _prevRotation: { x: prevRx, y: prevRy, z: prevRz },
                        });
                        const captured = obj;
                        const sched = getFrameScheduler();
                        sched.scheduleOnce('drag-furniture-rehighlight-1', () => {
                            sched.scheduleOnce('drag-furniture-rehighlight-2', () => {
                                if (selectionManager.selectedObject === captured) {
                                    selectionManager.applyHighlight(captured);
                                }
                            });
                        });
                    }
                }
            }

            // ── Plumbing fixture ────────────────────────────────────────────
            // §ELEMENT-SEMANTIC-AUDIT S4 (2026-06-20): plumbing fixtures had no drag
            // commit (and, before MovePlumbingCommand, no command to commit to). The
            // fragment builder tags the mesh elementType='PlumbingFixture' → lowercases
            // to 'plumbingfixture'; accept the bare 'plumbing' alias too. Position-
            // anchored, exactly like furniture, so it is anchor-safe.
            //
            // §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — the founder moved a toilet in
            // 3D and the 2D plan did not update. Root cause: this dispatched
            // `plumbing.move { id, to }`, but the plugin `MovePlumbingHandler`
            // (registered first) claims 'plumbing.move', wants { plumbingId, delta },
            // and rejected the payload at canExecute — so the store was never written
            // and the plan (which re-projects FROM the geometry store) kept drawing the
            // toilet where it was. Worse, that plugin handler mutates a DETACHED plugin
            // DTO store never bridged to the geometry store, so even a corrected payload
            // could not update the 2D plan. Fix: dispatch `plumbing.moveFixture` (the
            // un-shadowed legacy bridge → MovePlumbingCommand → geometry window.plumbingStore
            // → bim-plumbing-updated → 3D rebuild + 2D re-projection), the same proven
            // path furniture uses. `MovePlumbingCommand` also translates a bath's
            // start/end by the same delta so line-based fixtures stay consistent.
            if ((elemType === 'plumbingfixture' || elemType === 'plumbing') && obj.userData?.id) {
                const ps = window.plumbingStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const fixture = ps?.get?.(id) ?? (ps as any)?.getById?.(id);
                if (fixture?.position) {
                    const prevX = fixture.position.x ?? 0;
                    const prevY = fixture.position.y ?? 0;
                    const prevZ = fixture.position.z ?? 0;
                    const dx = obj.position.x - prevX;
                    const dz = obj.position.z - prevZ;
                    if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                        // y is level-locked (LevelPlaneConstraint) — keep the fixture's own y.
                        dragDispatch('plumbing.moveFixture', {
                            id,
                            to: { x: prevX + dx, y: prevY, z: prevZ + dz },
                        });
                        const captured = obj;
                        const sched = getFrameScheduler();
                        sched.scheduleOnce('drag-plumbing-rehighlight-1', () => {
                            sched.scheduleOnce('drag-plumbing-rehighlight-2', () => {
                                if (selectionManager.selectedObject === captured) {
                                    selectionManager.applyHighlight(captured);
                                }
                            });
                        });
                    }
                }
            }

            // ── Column ──────────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            if (elemType === 'column' && obj.userData?.id) {
                const cs = window.columnStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const col = cs?.get?.(id) ?? (cs as any)?.getById?.(id);
                if (col) {
                    const pos = col.position as { x: number; y: number; z: number } | undefined;
                    const prevX = pos?.x ?? 0;
                    const prevZ = pos?.z ?? 0;
                    const prevY = pos?.y ?? 0;
                    const dx = obj.position.x - prevX;
                    const dz = obj.position.z - prevZ;
                    // §COLUMN-DRAG-ROTATION (founder 2026-06-19) — commit the gizmo's Y-rotation
                    // too (ColumnData.rotation is RADIANS, applied directly as root.rotation.y).
                    // The old code only sent position, so a rotate-only drag was lost on rebuild
                    // and the plan never re-projected (same gap as furniture §FURNITURE-DRAG-ROTATION).
                    const prevRy = (typeof col.rotation === 'number' ? col.rotation : 0);
                    const moved   = Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6;
                    const rotated = Math.abs(obj.rotation.y - prevRy) > 1e-4;
                    if (moved || rotated) {
                        // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — ring-capture the move/rotate
                        // (declare `_recordUndo` + the pre-move `_prev` pose so the bridge
                        // emits an invertible PatchPair; see initBusHandlers column.update).
                        dragDispatch('column.update', {
                            id,
                            updates: { position: { x: prevX + dx, y: prevY, z: prevZ + dz }, rotation: obj.rotation.y },
                            _recordUndo: true,
                            _prev: { position: { x: prevX, y: prevY, z: prevZ }, rotation: prevRy },
                        });
                        const captured = obj;
                        const sched = getFrameScheduler();
                        sched.scheduleOnce('drag-column-rehighlight-1', () => {
                            sched.scheduleOnce('drag-column-rehighlight-2', () => {
                                if (selectionManager.selectedObject === captured) {
                                    selectionManager.applyHighlight(captured);
                                }
                            });
                        });
                    }
                }
            }

            // ── Beam ────────────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            if (elemType === 'beam' && obj.userData?.id) {
                const bs = window.beamStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const beam = bs?.get?.(id) ?? (bs as any)?.getById?.(id);
                if (beam) {
                    const sp = beam.startPoint as { x: number; y: number; z: number } | undefined;
                    const ep = beam.endPoint   as { x: number; y: number; z: number } | undefined;
                    if (sp && ep) {
                        // Beam Object3D is anchored at startPoint in world space.
                        const dx = obj.position.x - sp.x;
                        const dz = obj.position.z - sp.z;
                        if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                            // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — ring-capture the move
                            // (pre-move endpoints as `_prev` so the bridge emits an
                            // invertible PatchPair; see initBusHandlers beam.update).
                            dragDispatch('beam.update', {
                                beamId: id,
                                updates: {
                                    startPoint: { x: sp.x + dx, y: sp.y, z: sp.z + dz },
                                    endPoint:   { x: ep.x + dx, y: ep.y, z: ep.z + dz },
                                },
                                _recordUndo: true,
                                _prev: {
                                    startPoint: { x: sp.x, y: sp.y, z: sp.z },
                                    endPoint:   { x: ep.x, y: ep.y, z: ep.z },
                                },
                            });
                            const captured = obj;
                            const sched = getFrameScheduler();
                            sched.scheduleOnce('drag-beam-rehighlight-1', () => {
                                sched.scheduleOnce('drag-beam-rehighlight-2', () => {
                                    if (selectionManager.selectedObject === captured) {
                                        selectionManager.applyHighlight(captured);
                                    }
                                });
                            });
                        }
                    }
                }
            }

            // ── Curtain wall ────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            if (
                (elemType === 'curtainwall' || elemType === 'curtain-wall' || elemType === 'curtain_wall') &&
                obj.userData?.id
            ) {
                const cs = window.curtainWallStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                // CurtainWallStore exposes .get() per UpdateCurtainWallCommand contract.
                const cw = cs?.get?.(id) ?? (cs as any)?.getById?.(id);
                if (cw) {
                    const prev = cw.baseLine as
                        | [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]
                        | undefined;
                    if (prev?.[0] && prev?.[1]) {
                        // Curtain-wall Object3D is anchored at baseLine[0] (same convention as walls).
                        const dx = obj.position.x - prev[0].x;
                        const dz = obj.position.z - prev[0].z;
                        if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                            const next: [typeof prev[0], typeof prev[1]] = [
                                { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
                                { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
                            ];
                            dragDispatch('wall.updateCurtainWall', { id, updates: { baseLine: next } });
                            const captured = obj;
                            const sched = getFrameScheduler();
                            sched.scheduleOnce('drag-cw-rehighlight-1', () => {
                                sched.scheduleOnce('drag-cw-rehighlight-2', () => {
                                    if (selectionManager.selectedObject === captured) {
                                        selectionManager.applyHighlight(captured);
                                    }
                                });
                            });
                        }
                    }
                }
            }

            // ── Floor ───────────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            // Floor Object3D is anchored at the polygon centroid (xz-plane).
            if (elemType === 'floor' && obj.userData?.id) {
                const fs = window.floorStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const floor = (fs as any)?.getById?.(id) ?? fs?.get?.(id);
                if (floor) {
                    type PolyPt = { x: number; y?: number; z?: number };
                    const poly = (
                        floor.boundary?.polygon ?? floor.polygon ?? []
                    ) as PolyPt[];
                    if (poly.length >= 3) {
                        const n = poly.length;
                        const cx = poly.reduce((s, p) => s + p.x, 0) / n;
                        const cz = poly.reduce((s, p) => s + (p.z ?? p.y ?? 0), 0) / n;
                        const dx = obj.position.x - cx;
                        const dz = obj.position.z - cz;
                        if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                            const newPoly = poly.map((pt) =>
                                pt.z !== undefined
                                    ? { x: pt.x + dx, z: pt.z + dz }
                                    : { x: pt.x + dx, y: (pt.y ?? 0) + dz }
                            );
                            // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — ring-capture the move.
                            // Deep-clone the pre-move polygon (the store may mutate its
                            // boundary in place) so the inverse PatchPair restores the exact
                            // original vertices (see initBusHandlers floor.update).
                            const prevPoly = poly.map((p) => ({ ...p }));
                            dragDispatch('floor.update', {
                                floorId: id,
                                updates: { boundary: { ...floor.boundary, polygon: newPoly } },
                                _recordUndo: true,
                                _prev: { boundary: { ...floor.boundary, polygon: prevPoly } },
                            });
                            const captured = obj;
                            const sched = getFrameScheduler();
                            sched.scheduleOnce('drag-floor-rehighlight-1', () => {
                                sched.scheduleOnce('drag-floor-rehighlight-2', () => {
                                    if (selectionManager.selectedObject === captured) {
                                        selectionManager.applyHighlight(captured);
                                    }
                                });
                            });
                        }
                    }
                }
            }

            // ── Ceiling ─────────────────────────────────────────────────────
            // OI-039: Previously fell through silently — store was never updated.
            // Ceiling Object3D is anchored at the polygon centroid (xz-plane).
            if (elemType === 'ceiling' && obj.userData?.id) {
                const cs = window.ceilingStore; // TODO(TASK-08)
                const id = obj.userData.id as string;
                const ceiling = (cs as any)?.getById?.(id) ?? cs?.get?.(id);
                if (ceiling) {
                    type PolyPt = { x: number; y?: number; z?: number };
                    const poly = (
                        ceiling.boundary?.polygon ?? ceiling.polygon ?? []
                    ) as PolyPt[];
                    if (poly.length >= 3) {
                        const n = poly.length;
                        const cx = poly.reduce((s, p) => s + p.x, 0) / n;
                        const cz = poly.reduce((s, p) => s + (p.z ?? p.y ?? 0), 0) / n;
                        const dx = obj.position.x - cx;
                        const dz = obj.position.z - cz;
                        if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                            const newPoly = poly.map((pt) =>
                                pt.z !== undefined
                                    ? { x: pt.x + dx, z: pt.z + dz }
                                    : { x: pt.x + dx, y: (pt.y ?? 0) + dz }
                            );
                            dragDispatch('ceiling.update', {
                                ceilingId: id,
                                updates: { boundary: { ...ceiling.boundary, polygon: newPoly } },
                            });
                            const captured = obj;
                            const sched = getFrameScheduler();
                            sched.scheduleOnce('drag-ceiling-rehighlight-1', () => {
                                sched.scheduleOnce('drag-ceiling-rehighlight-2', () => {
                                    if (selectionManager.selectedObject === captured) {
                                        selectionManager.applyHighlight(captured);
                                    }
                                });
                            });
                        }
                    }
                }
            }

            // ── Stair — 3D-gizmo move (§STAIR-3D-MOVE 2026-06-11) ─────────────
            // The stair mesh bakes its geometry in WORLD coordinates with the
            // group at local origin (0,0,0). StairTransformController anchors the
            // gizmo at the stair (proxy at the bbox centre) and, during the drag,
            // translates the stair GROUP by the gizmo delta — so obj.position now
            // holds the live XZ offset. Mirror the wall path: compute the delta,
            // dispatch `stair.move` { stairId, delta } on the bus (→ MoveStairCommand
            // shifts startPosition + flight overrides + landing centres and the
            // StairMeshBuilder rebuilds the geometry at the new anchor at (0,0,0)).
            // Y is level-locked (LevelPlaneConstraint), so only XZ is persisted.
            if ((elemType === 'stair' || elemType === 'stairs') && obj.userData?.id) {
                const id = obj.userData.id as string;
                const dx = obj.position.x;
                const dz = obj.position.z;
                if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                    // Reset the group offset immediately — the rebuilt mesh from
                    // MoveStairCommand is authored at the new world anchor with the
                    // group back at (0,0,0); leaving the offset would double the move.
                    obj.position.set(0, obj.position.y, 0);
                    dragDispatch('stair.move', {
                        stairId: id,
                        delta: { x: dx, y: 0, z: dz },
                    });
                    const captured = obj;
                    const sched = getFrameScheduler();
                    sched.scheduleOnce('drag-stair-rehighlight-1', () => {
                        sched.scheduleOnce('drag-stair-rehighlight-2', () => {
                            if (selectionManager.selectedObject === captured) {
                                selectionManager.applyHighlight(captured);
                            }
                        });
                    });
                }
            }

            // ── Handrail / railing — graceful degradation ────────────────────
            // OI-039: UpdateHandrailCommand has no positional payload — handrail
            // geometry is defined by path points, not a top-level position vector.
            // Snapping the mesh back prevents a visual glitch. Direct users to
            // the Plan View move tool.
            if ((elemType === 'handrail' || elemType === 'railing') && obj.userData?.id) {
                const id = obj.userData.id as string;
                console.warn(
                    `[registerTransformDragHandler] 3D-gizmo move on handrail "${id}" is not supported ` +
                    `— handrail geometry is defined by path points. Use the Plan View move tool instead. ` +
                    `Dispatching rebuild event to snap mesh back.`
                );
                window.runtime?.events?.emit('bim-railing-updated', { id }); // F.events.15
            }

            levelPlaneConstraint.enforce();
            obj.userData.posX = Number(obj.position.x.toFixed(2));
            obj.userData.posZ = Number(obj.position.z.toFixed(2));
            updateInspector(obj);

            // §PERF-WALL-DRAG-DEFER (ADR-061) — safety net: clear the flag on ANY
            // wall drag-end (e.g. a sub-threshold move that dispatched no command,
            // so the in-branch clear above never ran) and drain any flush that was
            // deferred during the drag so the wall geometry settles immediately.
            if (window.__wallDragInProgress) {
                window.__wallDragInProgress = false;
                try { window.__wallRebuildControl?.resumeAndFlushDeferredDrag?.(); }
                catch { /* coordinator optional / not yet wired */ }
            }
        }
    });

    // ── Camera maxDistance guard ──────────────────────────────────────────────
    {
        const reEnforceConstraints = () => { (world as any)._reapplyCameraConstraints?.(); };
        const _maxDistEvents = [
            'bim-wall-added',       'bim-wall-removed',       'bim-wall-updated',
            'bim-slab-added',       'bim-slab-removed',       'bim-slab-updated',
            'bim-ceiling-added',    'bim-ceiling-removed',    'bim-ceiling-updated',
            'bim-floor-added',      'bim-floor-removed',      'bim-floor-updated',
            'bim-furniture-added',  'bim-furniture-removed',  'bim-furniture-updated',
            'bim-column-added',     'bim-column-removed',
            'bim-beam-added',       'bim-beam-removed',
            'bim-roof-added',       'bim-roof-removed',       'bim-roof-updated',
            'bim-curtainwall-added','bim-curtainwall-removed',
            'bim-stair-added',      'bim-stair-removed',
            'bim-railing-added',    'bim-railing-removed',
            'bim-door-added',       'bim-door-removed',
            'bim-window-added',     'bim-window-removed',
        ];
        for (const evt of _maxDistEvents) window.addEventListener(evt, reEnforceConstraints);
        window.runtime?.events?.on('pryzm-ifc-imported', () => reEnforceConstraints()); // F.events.13
    }

    // ── bim-selection-changed — F.events.16 migrated to runtime.events typed bus ──────
    // §R3-FIX: hostedDragController.activateFor() MUST run LAST in this chain.
    // WallTransformController.deactivate() (called when a non-wall is selected
    // after a wall was selected) calls TC.detach() + setSpace('world'), which
    // destroys the hosted-element axis constraint that hostedDragController just
    // configured.  Running hosted last ensures it always wins, and
    // HostedElementDragController.activateFor() re-attaches TC to the window/door
    // object after any prior detach.
    window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
        const detail = payload as { object?: THREE.Object3D | null };
        if (detail?.object) {
            wallTransformController.activateFor(detail.object);
            stairTransformController.activateFor(detail.object); // §STAIR-3D-MOVE — anchor gizmo at stair
            wallEndpointController.activateFor(detail.object);
            hostedDragController.activateFor(detail.object); // ← LAST: wins over wall/endpoint deactivation
        } else {
            hostedDragController.deactivate();
            wallTransformController.deactivate();
            stairTransformController.deactivate();
            wallEndpointController.deactivate();
        }
    });

    // ── §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — re-anchor gizmo proxies ────────
    // The wall/stair gizmos attach to an invisible PROXY positioned ONCE at
    // selection time (WallTransformController / StairTransformController). When the
    // Level STACKED/UNSTACKED (explode) view lifts the selected element's level
    // AFTER it was selected, the proxy stays at the old Y and the gizmo floats
    // away from the mesh. LevelExplodeController emits this once the lift settles;
    // we re-run activateFor so each proxy re-syncs to the mesh's exploded position.
    // Distinct from `bim-selection-changed` so property panels are NOT re-populated.
    window.runtime?.events?.on('pryzm-reanchor-transform', (payload: unknown) => {
        const obj = (payload as { object?: THREE.Object3D | null })?.object
            ?? selectionManager.selectedObject;
        if (!obj) return;
        wallTransformController.activateFor(obj);
        stairTransformController.activateFor(obj);
        wallEndpointController.activateFor(obj);
        hostedDragController.activateFor(obj);
    });
}
