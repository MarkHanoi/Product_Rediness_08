import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { TransformControllerSet } from './initTransformControllers';
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
        hostedDragController, wallTransformController, wallEndpointController,
        world, bimManager, selectionManager, updateInspector,
    } = deps;

    transformControls.addEventListener('dragging-changed', (event) => {
        world.camera.controls.enabled = !event.value;

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
                        window.runtime?.bus?.executeCommand('roof.update', { id: roofId, updates: { footprint: { polygon: newPolygon, centroid: newCentroid } } })?.catch((e: unknown) => console.error('[TransformDrag] roof.update failed:', e));
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

                        // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
                        // Direct window.commandManager call removed; bus fires UpdateWallBaselineHandler
                        // which calls initBusHandlers bridge → commandManager.execute() so
                        // WallRebuildCoordinator receives bim-wall-updated and rebuilds with voids.
                        window.runtime?.bus?.executeCommand('wall.updateBaseline', {
                            wallId,
                            newBaseLine:  [newStart,  newEnd],
                            prevBaseLine: [prevStart, prevEnd],
                        })?.catch((e: unknown) => console.error('[TransformDrag] wall.updateBaseline failed:', e));
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
                    if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                        window.runtime?.bus?.executeCommand('furniture.updateParameters', {
                            id,
                            position: { x: prevX + dx, y: prevY, z: prevZ + dz },
                        })?.catch((e: unknown) => console.error('[TransformDrag] furniture.updateParameters failed:', e));
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
                    if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
                        window.runtime?.bus?.executeCommand('column.update', {
                            id,
                            updates: { position: { x: prevX + dx, y: prevY, z: prevZ + dz } },
                        })?.catch((e: unknown) => console.error('[TransformDrag] column.update failed:', e));
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
                            window.runtime?.bus?.executeCommand('beam.update', {
                                beamId: id,
                                updates: {
                                    startPoint: { x: sp.x + dx, y: sp.y, z: sp.z + dz },
                                    endPoint:   { x: ep.x + dx, y: ep.y, z: ep.z + dz },
                                },
                            })?.catch((e: unknown) => console.error('[TransformDrag] beam.update failed:', e));
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
                            window.runtime?.bus?.executeCommand('wall.updateCurtainWall', { id, updates: { baseLine: next } })?.catch((e: unknown) => console.error('[TransformDrag] wall.updateCurtainWall failed:', e));
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
                            window.runtime?.bus?.executeCommand('floor.update', {
                                floorId: id,
                                updates: { boundary: { ...floor.boundary, polygon: newPoly } },
                            })?.catch((e: unknown) => console.error('[TransformDrag] floor.update failed:', e));
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
                            window.runtime?.bus?.executeCommand('ceiling.update', {
                                ceilingId: id,
                                updates: { boundary: { ...ceiling.boundary, polygon: newPoly } },
                            })?.catch((e: unknown) => console.error('[TransformDrag] ceiling.update failed:', e));
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

            // ── Stair — graceful degradation ─────────────────────────────────
            // OI-039: UpdateStairParametersCommand has no positional payload —
            // stair geometry is defined by flight/landing data, not a top-level
            // position vector. Snapping the mesh back prevents a visual glitch
            // where the stair group stays at the dragged position until the
            // next full rebuild. Direct users to the Plan View move tool.
            if (elemType === 'stair' && obj.userData?.id) {
                const id = obj.userData.id as string;
                console.warn(
                    `[registerTransformDragHandler] 3D-gizmo move on stair "${id}" is not supported ` +
                    `— stair geometry is defined by flight data. Use the Plan View move tool instead. ` +
                    `Dispatching rebuild event to snap mesh back.`
                );
                window.runtime?.events?.emit('bim-stair-updated', { id }); // F.events.15
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
            wallEndpointController.activateFor(detail.object);
            hostedDragController.activateFor(detail.object); // ← LAST: wins over wall/endpoint deactivation
        } else {
            hostedDragController.deactivate();
            wallTransformController.deactivate();
            wallEndpointController.deactivate();
        }
    });
}
