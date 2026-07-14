/**
 * @file src/ui/property-inspector/PropertyInspectorApply.ts
 *
 * Lifted from PropertyInspector.ts — Wave 14 god-file split.
 *
 * Contains the "save" path: applyChanges(), the per-type dispatcher
 * applyUpdatesByType(), and the Three.js rebuild trigger triggerThreeUpdate().
 *
 * All window.* reaches are preserved with their original TODO annotations;
 * the Phase E.5.x commandBus migration and Phase E.*.S store migrations are
 * tracked at those call sites exactly as before.
 *
 * External API: only `applyChanges` is exported. The other two helpers are
 * module-private and called from within applyChanges.
 */

import * as THREE from '@pryzm/renderer-three/three';

import { UpdateHandrailCommand }             from '@pryzm/command-registry';
// §FEAT-UNIFORM-MATERIAL-COMMAND (L-08) — one uniform material-set dispatch surface.
import { dispatchSetMaterial, materialUnsupportedReason } from './MaterialDispatch';

/**
 * §FIX-COMMAND-REJECTION-SURFACED (Gate G7, P8 / C11 §5) — a rejected command must SURFACE.
 *
 * Every dispatch in this file used to end in `.catch(e => console.error(...))`. That is how
 * `wall.setColor` stayed broken: it was rejected at `canExecute` (it sent `{ wallId }` while
 * the handler that claimed the type required `{ id }`), the rejection went to a console
 * nobody reads, and the inspector's live mesh repaint told the user it had worked. The
 * command system said NO and nobody heard it — the L-214 / L-218 / L-220 defect class.
 *
 * Now every failure reaches the user on the same `pryzm:toast` channel the 3-D drag path
 * uses. Best-effort: a missing toast bus must never mask the underlying error.
 */
function surfaceCommandFailure(noun: string, commandType: string, e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PropertyInspectorApply] ${commandType} failed:`, e);
    try {
        window.runtime?.events?.emit('pryzm:toast', {
            message: `Couldn't update the ${noun} — ${msg}`,
            severity: 'error',
        });
    } catch { /* toast bus optional */ }
}

/** Normalise a colour token to `#rrggbb`. Mirrors the inline colorMap used later
 *  in this file so the uniform material dispatch below emits a valid hex string. */
function normalizeHexColor(raw: string): string {
    const colorMap: Record<string, string> = {
        white: '#ffffff', black: '#000000', red: '#ff0000',
        green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
        gray: '#808080', grey: '#808080', cyan: '#00ffff', magenta: '#ff00ff',
    };
    const lower = raw.toLowerCase();
    if (colorMap[lower]) return colorMap[lower]!;
    if (!raw.startsWith('#')) return '#' + raw;
    return raw;
}

// ── Context interface ────────────────────────────────────────────────────────

/**
 * All dependencies that applyChanges() needs from PropertyInspector.
 * PropertyInspector builds this object in its private applyChanges() wrapper
 * and passes it here — keeps the extracted logic free of `this` references.
 */
export interface ApplyContext {
    readonly element: HTMLDivElement;
    readonly selectedObject: THREE.Object3D | null;
    /** this.wallStore (may be null pre-boot) */
    readonly wallStore: any;
    /** this._roofStore */
    readonly roofStore: { getById(id: string): any; update(id: string, data: any): any } | null;
    /** this._roofBuilder */
    readonly roofBuilder: { updateRoof(data: any): void } | null;
    /** staged visual changes — read-only; set by onColorInput / onMaterialChange */
    readonly pendingMaterialColor: string | undefined;
    readonly pendingMaterialId: string | null | undefined;
    readonly pendingFrameColor: string | undefined;
    readonly callbacks: { onUnselect(): void };
    /** delegates to PropertyInspector.execUpdate() */
    execUpdate(cmd: unknown, eventKey?: string): void;
}

// ── Module-private helpers ───────────────────────────────────────────────────

/**
 * Triggers a Three.js mesh rebuild after a property change.
 * @deprecated §01 §2.7 — direct builder calls. Remove per-type branch once the
 * corresponding Command triggers the rebuild via store→event-bus→builder pipeline.
 */
function triggerThreeUpdate(ctx: ApplyContext, d: any): void {
    const type = d.type?.toLowerCase();
    if (type === 'wall') {
        const builder = window.wallFragmentBuilder; // TODO(E.wall.X): replace with runtime.bus.executeCommand(wall.build) — Phase E.wall.X
        const wall = ctx.wallStore?.getById?.(d.id);
        if (wall && builder?.updateWall) builder.updateWall(wall);
    } else if (type === 'window' || type === 'door') {
        const parentId = d.parentId || d.wallId;
        const builder = window.wallFragmentBuilder; // TODO(E.wall.X): replace with runtime.bus.executeCommand(wall.build) — Phase E.wall.X
        const wall = ctx.wallStore?.getById?.(parentId);
        if (wall && builder?.updateWall) builder.updateWall(wall);
    } else if (type === 'slab') {
        const builder = window.slabBuilder; // TODO(E.slab.X): replace with runtime.bus.executeCommand(slab.build) — Phase E.slab.X
        const store = window.slabStore; // TODO(E.slab.S): replace with runtime.stores.slab — Phase E.slab.S
        const slab = store?.getById?.(d.id);
        if (slab && builder?.updateSlab) {
            builder.updateSlab(slab);
            if (ctx.selectedObject instanceof THREE.Object3D) {
                ctx.selectedObject.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                        child.material.color.set(slab.materialColor || slab.color || 0xcccccc);
                    }
                });
            }
        }
    // §01 §2.7 CURTAIN WALL: no direct builder call here.
    // curtainwall updates flow through store→storeEventBus→subscriber in main.ts→builder.
    } else if (type === 'column') {
        const builder = window.columnBuilder; // TODO(E.column.X): replace with runtime.bus.executeCommand(column.build) — Phase E.column.X
        const store = window.columnStore; // TODO(E.column.S): replace with runtime.stores.column — Phase E.column.S
        const col = store?.get?.(d.id) || store?.getById?.(d.id);
        if (col && builder?.updateColumn) builder.updateColumn(col);
    } else if (type === 'roof') {
        const builder = ctx.roofBuilder;
        const store = ctx.roofStore;
        const roof = store?.getById?.(d.id);
        if (roof && builder?.updateRoof) builder.updateRoof(roof);
    }
}

/**
 * @deprecated §01 §2.7 — Direct builder calls / direct store writes are a
 * contract violation. Each branch here should be replaced by a dedicated
 * Command once Phase E.*.x lands for that element family.
 */
function applyUpdatesByType(ctx: ApplyContext, d: any, updates: any): void {
    if (updates.mark !== undefined) {
        window.runtime?.bus?.executeCommand('element.updateMark', { elementId: d.id, elementType: d.type?.toLowerCase(), newMark: updates.mark })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] element.updateMark failed:', e));
    }

    const isOpening = (t: string) => {
        const n = t?.toLowerCase();
        return n === 'window' || n === 'door';
    };

    if (isOpening(d.type)) {
        if (d.type.toLowerCase() === 'window') {
            // F-1.1: bus-primary — plugin store is authoritative. Legacy wallStore kept in sync
            // for PRYZM-1 renderer compat until Phase F.wall.S retires it.
            if (updates.width !== undefined) {
                window.runtime?.bus?.executeCommand('window.setSize', { windowId: d.id, width: updates.width })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] window.setSize (width) failed:', err));
                ctx.wallStore?.updateWindow?.(d.id, { width: updates.width });
            }
            if (updates.height !== undefined) {
                window.runtime?.bus?.executeCommand('window.setSize', { windowId: d.id, height: updates.height })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] window.setSize (height) failed:', err));
                ctx.wallStore?.updateWindow?.(d.id, { height: updates.height });
            }
            if (updates.sillHeight !== undefined) {
                window.runtime?.bus?.executeCommand('window.setSillHeight', { windowId: d.id, sillHeight: updates.sillHeight })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] window.setSillHeight failed:', err));
                ctx.wallStore?.updateWindow?.(d.id, { sillHeight: updates.sillHeight });
            }
            if (updates.fireRating !== undefined) {
                window.runtime?.bus?.executeCommand('window.setFireRating', { windowId: d.id, fireRating: updates.fireRating })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] window.setFireRating failed:', err));
                ctx.wallStore?.updateWindow?.(d.id, { fireRating: updates.fireRating });
            }
        } else {
            // F-1.1: bus-primary — plugin store is authoritative. Legacy wallStore kept in sync
            // for PRYZM-1 renderer compat until Phase F.wall.S retires it.
            if (updates.width !== undefined) {
                window.runtime?.bus?.executeCommand('door.setWidth', { doorId: d.id, width: updates.width })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] door.setWidth failed:', err));
                ctx.wallStore?.updateDoor?.(d.id, { width: updates.width });
            }
            if (updates.height !== undefined) {
                window.runtime?.bus?.executeCommand('door.setHeight', { doorId: d.id, height: updates.height })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] door.setHeight failed:', err));
                ctx.wallStore?.updateDoor?.(d.id, { height: updates.height });
            }
            if (updates.fireRating !== undefined) {
                window.runtime?.bus?.executeCommand('door.setFireRating', { doorId: d.id, fireRating: updates.fireRating })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] door.setFireRating failed:', err));
                ctx.wallStore?.updateDoor?.(d.id, { fireRating: updates.fireRating });
            }
            if (updates.accessibilityType !== undefined) {
                window.runtime?.bus?.executeCommand('door.setAccessibility', { doorId: d.id, accessibilityType: updates.accessibilityType })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] door.setAccessibility failed:', err));
                ctx.wallStore?.updateDoor?.(d.id, { accessibilityType: updates.accessibilityType });
            }
            // TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): dispatch swing change through the bus.
            // SetDoorSwingHandler writes to the Immer door store → DoorCommitter.onUpdate()
            // detects 'swing' in GEOMETRY_FIELDS → triggers produceDoor() rebuild → updated mesh.
            // Legacy wallStore is also kept in sync (C15 §8.1) using swingDirection — the field
            // name used by the legacy DoorData shape (DoorPlanSymbolBuilder, DoorSection).
            if (updates.swing !== undefined) {
                window.runtime?.bus?.executeCommand('door.setSwing', { doorId: d.id, swing: updates.swing })
                    .catch((err: Error) => console.error('[PropertyInspectorApply] door.setSwing failed:', err));
                ctx.wallStore?.updateDoor?.(d.id, { swingDirection: updates.swing });
            }
        }
    } else if (d.type?.toLowerCase() === 'wall') {
        const wallH = Number(updates.height ?? d.height);
        const wallT = Number(updates.thickness ?? d.thickness);
        window.runtime?.bus?.executeCommand('wall.updateDimensions', { wallId: d.id, height: wallH, thickness: wallT })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] wall.updateDimensions failed:', e));
    } else if (d.type?.toLowerCase() === 'slab') {
        const payload: any = { id: d.id, ...updates };
        if (updates.thickness !== undefined) payload.thickness = parseFloat(updates.thickness as any);
        if (updates.width !== undefined) payload.width = parseFloat(updates.width as any);
        if (updates.depth !== undefined) payload.depth = parseFloat(updates.depth as any);
        window.runtime?.bus?.executeCommand('slab.update', { ...payload })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] slab.update failed:', e));
    } else if (d.type?.toLowerCase() === 'column') {
        window.runtime?.bus?.executeCommand('column.update', { id: d.id, updates })
            ?.catch((e: unknown) => console.error('[PropertyInspectorApply] column.update failed:', e));
    } else if (d.type?.toLowerCase() === 'stairs') {
        window.runtime?.bus?.executeCommand('stair.updateParameters', { stairId: d.id, updates })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] stair.updateParameters failed:', e));
    } else if (d.type?.toLowerCase() === 'curtainwall') {
        window.runtime?.bus?.executeCommand('wall.updateCurtainWall', { id: d.id, updates })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] wall.updateCurtainWall failed:', e));
    } else if (d.type?.toLowerCase() === 'roof') {
        const roofUpdates = { ...updates } as any;
        if (updates.slopePercent !== undefined) {
            roofUpdates.slope = updates.slopePercent / 100;
            delete roofUpdates.slopePercent;
        }
        window.runtime?.bus?.executeCommand('roof.update', { id: d.id, updates: roofUpdates })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] roof.update failed:', e));
    } else if (d.type?.toLowerCase() === 'furniture' || d.type?.toLowerCase() === 'bed' || d.type?.toLowerCase() === 'table' || d.type?.toLowerCase() === 'chair' || d.type?.toLowerCase() === 'sofa' || d.type?.toLowerCase() === 'wardrobe' || d.type?.toLowerCase() === 'wardrobe_glass_door' || d.type?.toLowerCase() === 'corner_wardrobe') {
        const sanitizedUpdates = { ...updates };
        if (updates.width !== undefined) sanitizedUpdates.width = parseFloat(updates.width as any);
        if (updates.length !== undefined) sanitizedUpdates.length = parseFloat(updates.length as any);
        if (updates.height !== undefined) sanitizedUpdates.height = parseFloat(updates.height as any);
        if (updates.baseOffset !== undefined) sanitizedUpdates.baseOffset = parseFloat(updates.baseOffset as any);
        window.runtime?.bus?.executeCommand('furniture.updateParameters', { id: d.id, ...sanitizedUpdates })
            ?.catch((e: Error) => console.error('[PropertyInspectorApply] furniture.updateParameters failed:', e));
    }
}

// ── Public export ────────────────────────────────────────────────────────────

/**
 * Reads all `.pi-input` values, diffs them against the selected element's
 * userData, and dispatches the appropriate Update*Command(s).
 *
 * Lifted verbatim from PropertyInspector.applyChanges() — logic unchanged.
 * All window.* reaches carry their original TODO annotations.
 */
export function applyChanges(ctx: ApplyContext): void {
    if (!ctx.selectedObject) return;
    const d = ctx.selectedObject.userData;
    const elementId = d.id;
    const normalizedType = (d.elementType || d.type || '').toString().toLowerCase();
    const inputs = ctx.element.querySelectorAll('.pi-input');
    const updates: any = {};
    let hasChanges = false;

    inputs.forEach((input: any) => {
        const k = input.getAttribute('data-key');
        if (!k) return;

        let value: any;
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number') {
            value = parseFloat(input.value);
        } else if (input.tagName === 'SELECT' && k === 'cornerBehavior') {
            value = input.value;
        } else {
            value = input.value;
        }

        if (value !== d[k]) {
            updates[k] = value;
            hasChanges = true;
        }
    });

    // §02 §3.5: Read pending visual changes from inspector staging variables,
    // not from userData (Inspector must never read staged writes back from userData).
    const liveColor = ctx.pendingMaterialColor;
    const liveMaterialId = ctx.pendingMaterialId;
    if (liveMaterialId !== undefined && liveMaterialId !== d.materialId) {
        updates.materialId = liveMaterialId ?? null;
        hasChanges = true;
    }
    if (!liveMaterialId && liveColor && liveColor !== d.materialColor) {
        updates.materialColor = liveColor;
        hasChanges = true;
    }

    // §FEAT-UNIFORM-MATERIAL-COMMAND (L-08 / L-57): single uniform material-set path.
    // Any family with a `<family>.setMaterial` command (slab, ceiling, roof, floor,
    // column, beam, stair, handrail, furniture, plumbing, lighting, curtain-wall,
    // structural) has its material/finish change dispatched here — one source of
    // truth — reaching parity with walls/doors/windows. On success the material
    // fields are stripped from `updates` so the per-type dimension branches below
    // never double-handle them. dispatchSetMaterial returns false for families
    // without a route (wall/door/window keep their own path) or when there is
    // nothing this family can apply (e.g. a colour-only change on a materialId-only
    // family) — the legacy per-type path (furniture colour) then still runs.
    {
        const rawColor = updates.materialColor;
        const normColor = typeof rawColor === 'string' ? normalizeHexColor(rawColor) : undefined;
        const matId = updates.materialId as string | null | undefined;
        if (normColor !== undefined || matId !== undefined) {
            const dispatched = dispatchSetMaterial(window.runtime as any, normalizedType, elementId, {
                materialId: matId,
                materialColor: normColor,
            });
            if (!dispatched) {
                // §FIX-MATERIAL-DEAD-DISPATCH (G7) — the families whose material CANNOT be
                // committed to the geometry record today (their only command writes a
                // detached plugin DTO store, or no command exists at all) must SAY SO. The
                // inspector has already repainted the THREE mesh live, so without this the
                // user sees the new material, saves, reloads — and it is gone.
                const reason = materialUnsupportedReason(normalizedType);
                if (reason) {
                    console.warn(`[PropertyInspectorApply] material not applied to ${normalizedType}: ${reason}`);
                    window.runtime?.events?.emit('pryzm:toast', {
                        message: `Material changes aren't saved for ${normalizedType} yet.`,
                        severity: 'info',
                    });
                }
            }
            if (dispatched) {
                delete updates.materialColor;
                delete updates.materialId;
                // If material was the ONLY change, close out now — but keep going for
                // furniture (needs its position/rotation flush) and handrail (colour
                // travels via its dedicated UpdateHandrailCommand DOM-read branch).
                const noOtherChanges = Object.keys(updates).length === 0;
                const needsLegacyBranch =
                    normalizedType === 'furniture' || !!d.furnitureType || normalizedType === 'handrail';
                if (noOtherChanges && !needsLegacyBranch) {
                    ctx.callbacks.onUnselect();
                    ctx.element.style.display = 'none';
                    return;
                }
            }
        }
    }

    if (normalizedType === 'column') {
        const rotationInput = ctx.element.querySelector('#column-rotation-deg') as HTMLInputElement | null;
        if (rotationInput) {
            const value = parseFloat(rotationInput.value);
            if (!Number.isNaN(value)) {
                const nextRotation = THREE.MathUtils.degToRad(value);
                const storeRotation = window.columnStore?.get?.(elementId)?.rotation; // TODO(E.column.S): replace with runtime.stores.column — Phase E.column.S
                const currentRotation = typeof storeRotation === 'number' ? storeRotation : (d.rotation ?? 0);
                if (Math.abs(nextRotation - currentRotation) > 0.0001) {
                    updates.rotation = nextRotation;
                    hasChanges = true;
                }
            }
        }
    }

    if (normalizedType === 'furniture' || d.furnitureType) {
        const colorInput = ctx.element.querySelector('[data-key="color"]') as HTMLInputElement;
        const materialColorInput = ctx.element.querySelector('[data-key="materialColor"]') as HTMLInputElement;
        const widthInput = ctx.element.querySelector('[data-key="width"]') as HTMLInputElement;
        const lengthInput = ctx.element.querySelector('[data-key="length"]') as HTMLInputElement;
        const heightInput = ctx.element.querySelector('[data-key="height"]') as HTMLInputElement;
        const offsetInput = ctx.element.querySelector('[data-key="baseOffset"]') as HTMLInputElement;
        const showDoorsInput = ctx.element.querySelector('[data-key="showDoors"]') as HTMLInputElement;

        const finalColor = colorInput?.value || materialColorInput?.value;

        {
            const furniture = window.furnitureStore?.get(elementId); // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
            const widthBranchTwoInput = ctx.element.querySelector('[data-key="widthBranchTwo"]') as HTMLInputElement;
            const lengthBranchTwoInput = ctx.element.querySelector('[data-key="lengthBranchTwo"]') as HTMLInputElement;
            const cornerBehaviorInput = ctx.element.querySelector('[data-key="cornerBehavior"]') as HTMLSelectElement;

            const payload: any = {
                id: elementId,
                color: finalColor,
                width: widthInput ? parseFloat(widthInput.value) : undefined,
                length: lengthInput ? parseFloat(lengthInput.value) : undefined,
                height: heightInput ? parseFloat(heightInput.value) : undefined,
                baseOffset: offsetInput ? parseFloat(offsetInput.value) : undefined,
                widthBranchTwo: widthBranchTwoInput ? parseFloat(widthBranchTwoInput.value) : undefined,
                lengthBranchTwo: lengthBranchTwoInput ? parseFloat(lengthBranchTwoInput.value) : undefined,
                cornerBehavior: cornerBehaviorInput ? cornerBehaviorInput.value : undefined,
                position: window.propertyUpdates?.position, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                rotation: window.propertyUpdates?.rotation, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                wardrobeConfig: furniture?.wardrobeConfig ? {
                    ...furniture.wardrobeConfig,
                    width: widthInput ? parseFloat(widthInput.value) : furniture.wardrobeConfig.width,
                    height: heightInput ? parseFloat(heightInput.value) : furniture.wardrobeConfig.height,
                    depth: lengthInput ? parseFloat(lengthInput.value) : furniture.wardrobeConfig.depth,
                    showDoors: showDoorsInput ? showDoorsInput.checked : furniture.wardrobeConfig.showDoors,
                    widthBranchTwo: widthBranchTwoInput ? parseFloat(widthBranchTwoInput.value) : furniture.wardrobeConfig.widthBranchTwo,
                    lengthBranchTwo: lengthBranchTwoInput ? parseFloat(lengthBranchTwoInput.value) : furniture.wardrobeConfig.lengthBranchTwo,
                    cornerBehavior: cornerBehaviorInput ? cornerBehaviorInput.value : furniture.wardrobeConfig.cornerBehavior
                } : undefined
            };

            if (showDoorsInput && !payload.wardrobeConfig && (d.furnitureType === 'wardrobe' || d.furnitureType === 'wardrobe_glass_door' || d.furnitureType === 'corner_wardrobe')) {
                payload.wardrobeConfig = {
                    showDoors: showDoorsInput.checked,
                    width: payload.width,
                    height: payload.height,
                    depth: payload.length
                };
            }

            window.runtime?.bus?.executeCommand('furniture.updateParameters', payload)
                ?.catch((e: unknown) => console.error('[PropertyInspectorApply] furniture.updateParameters failed:', e));
            ctx.callbacks.onUnselect();
            ctx.element.style.display = 'none';
            return;
        }
    }

    inputs.forEach((input: any) => {
        const k = input.getAttribute('data-key');
        if (!k) return;

        const rawValue = input.value;
        if (input.type !== 'color' && input.tagName !== 'SELECT' && (rawValue === '' || rawValue === undefined || rawValue === null)) return;

        const value = input.type === 'number' ? parseFloat(rawValue) : rawValue;
        if (input.type === 'number' && isNaN(value)) return;

        if (value !== d[k]) {
            updates[k] = value;
            hasChanges = true;
        }
    });

    if (normalizedType === 'handrail') {
        const heightInput = ctx.element.querySelector('[data-key="height"]') as HTMLInputElement;
        const thicknessInput = ctx.element.querySelector('[data-key="thickness"]') as HTMLInputElement;
        const offsetInput = ctx.element.querySelector('[data-key="baseOffset"]') as HTMLInputElement;
        const colorInput = ctx.element.querySelector('[data-key="materialColor"]') as HTMLInputElement;

        const cmd = new UpdateHandrailCommand({
            id: elementId,
            height: heightInput ? parseFloat(heightInput.value) : undefined,
            thickness: thicknessInput ? parseFloat(thicknessInput.value) : undefined,
            baseOffset: offsetInput ? parseFloat(offsetInput.value) : undefined,
            materialColor: colorInput ? colorInput.value : undefined
        });
        ctx.execUpdate(cmd, 'handrail.update');
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    }

    if (!hasChanges) {
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    }

    if (normalizedType === 'curtainwall' || normalizedType === 'curtain-wall') {
        console.log('PropertyInspector: Applying curtain wall updates', updates);
        window.runtime?.bus?.executeCommand('wall.updateCurtainWall', { id: elementId, updates })
            ?.then(() => {
                triggerThreeUpdate(ctx, d);
                ctx.callbacks.onUnselect();
                ctx.element.style.display = 'none';
            })
            ?.catch((e: unknown) => console.error('[PropertyInspectorApply] wall.updateCurtainWall failed:', e));
        return;
    }

    const isSlab = d?.type?.toLowerCase() === 'slab';
    const isActuallyTemporary = isSlab && (d?.isPreview === true || !elementId || d?.__isToolPreview === true);

    if (isActuallyTemporary) {
        const slabTool = window.slabTool; // TODO(E.slab.X): replace with runtime.tools.activate(slab) — Phase E.slab.X
        if (slabTool && (slabTool.isActive || slabTool.toolMode !== 'NONE')) {
            slabTool.confirmSlabCreation();
            return;
        }
    }

    const allowedTypes = ['wall', 'window', 'door', 'slab', 'curtainWall', 'column'];

    if ((d?.isPreview === true || d?.__isToolPreview === true) && !allowedTypes.includes(d?.type?.toLowerCase())) {
        return;
    }

    const type = normalizedType;

    if (updates.materialColor && typeof updates.materialColor === 'string') {
        const colorMap: Record<string, string> = {
            white: '#ffffff', black: '#000000', red: '#ff0000',
            green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
            gray: '#808080', grey: '#808080', cyan: '#00ffff', magenta: '#ff00ff'
        };
        const lowerColor = updates.materialColor.toLowerCase();
        if (colorMap[lowerColor]) {
            updates.materialColor = colorMap[lowerColor];
        } else if (!updates.materialColor.startsWith('#')) {
            updates.materialColor = '#' + updates.materialColor;
        }
    }

    console.log("SAVE PAYLOAD:", updates);

    if (updates.width !== undefined && (type === 'furniture' || d.furnitureType === 'wardrobe' || d.furnitureType === 'wardrobe_glass_door' || d.furnitureType === 'corner_wardrobe')) {
        console.log("[WARDROBE TRACE] INSPECTOR DISPATCH:", { id: d.id, ...updates });
    }

    // §FIX-MATERIAL-REACHES-RECORD (Gate G7) — slab DIMENSIONS.
    //
    // The material fields are already gone by here: dispatchSetMaterial above now has a live
    // slab route (`slab.updateDimensions` → UpdateSlabDimensionsCommand → geometry slabStore)
    // and strips them on success. What remains is width/depth/thickness — which used to ride
    // the SAME dead command. `slab.update` is claimed by the plugin UpdateSlabHandler, which
    // `produceCommand`s against the DETACHED plugin DTO store (a fresh `new SlabStore()` from
    // PluginRegistry): nothing in production reads it and no committer bridges it back. So
    // slab dimensions were dead for exactly the same reason slab material was. Same bridge,
    // same command — UpdateSlabDimensionsCommand owns width/depth/thickness AND the material
    // fields (UpdateSlabCommand deliberately THROWS on them).
    if (type === 'slab' && (updates.width !== undefined || updates.depth !== undefined || updates.thickness !== undefined || updates.materialColor !== undefined || updates.materialId !== undefined)) {
        const payload: any = { slabId: elementId };
        if (updates.width     !== undefined) payload.width     = Number(updates.width);
        if (updates.depth     !== undefined) payload.depth     = Number(updates.depth);
        if (updates.thickness !== undefined) payload.thickness = Number(updates.thickness);
        // Only present if dispatchSetMaterial did NOT already claim them (it returns false
        // when there is nothing to apply) — never dispatch the same field twice (C16).
        if (updates.materialColor !== undefined) payload.materialColor = updates.materialColor;
        if (updates.materialId    !== undefined) payload.materialId    = updates.materialId;
        window.runtime?.bus?.executeCommand('slab.updateDimensions', payload)
            ?.catch((e: unknown) => surfaceCommandFailure('slab', 'slab.updateDimensions', e));
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    }
    if (type === 'wall' && (updates.height !== undefined || updates.thickness !== undefined)) {
        // §FIX-MATERIAL-REACHES-RECORD (Gate G7) — the `wall.setColor` dispatch that used to
        // live here is GONE. It sent `{ wallId }` while the plugin SetWallColor handler it
        // resolved to requires `{ id }`, so it was REJECTED at canExecute — and the rejection
        // was eaten by a `.catch(console.error)`. Even had the payload matched, that handler
        // writes the DETACHED plugin wall store, which no builder, plan projector or
        // persistence path reads. Wall material now goes through dispatchSetMaterial above →
        // `wall.updateColor` → UpdateWallColorCommand → geometry wallStore.updateWall().
        // ONE path, and it reaches the record.
        window.runtime?.bus?.executeCommand('wall.updateDimensions', { wallId: elementId, height: Number(updates.height ?? d.height), thickness: Number(updates.thickness ?? d.thickness) })
            ?.catch((e: unknown) => surfaceCommandFailure('wall', 'wall.updateDimensions', e));
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    } else if (type === 'wall') {
        // Material-only change: dispatchSetMaterial already committed it.
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    } else if (type === 'window') {
        if (updates.width !== undefined) window.runtime?.bus?.executeCommand('window.setSize', { windowId: elementId, width: updates.width })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSize (width) failed:', e));
        if (updates.height !== undefined) window.runtime?.bus?.executeCommand('window.setSize', { windowId: elementId, height: updates.height })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSize (height) failed:', e));
        if (updates.sillHeight !== undefined) window.runtime?.bus?.executeCommand('window.setSillHeight', { windowId: elementId, sillHeight: updates.sillHeight })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSillHeight failed:', e));
        if (ctx.pendingFrameColor !== undefined) window.runtime?.bus?.executeCommand('window.setFrameColor', { windowId: elementId, frameColor: ctx.pendingFrameColor })?.catch((e: unknown) => surfaceCommandFailure('window', 'window.setFrameColor', e));
    } else if (type === 'door') {
        if (updates.width !== undefined) window.runtime?.bus?.executeCommand('door.setWidth', { doorId: elementId, width: updates.width })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setWidth failed:', e));
        if (updates.height !== undefined) window.runtime?.bus?.executeCommand('door.setHeight', { doorId: elementId, height: updates.height })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setHeight failed:', e));
        if (updates.sillHeight !== undefined) window.runtime?.bus?.executeCommand('door.setSillHeight', { doorId: elementId, sillHeight: updates.sillHeight })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setSillHeight failed:', e));
        if (ctx.pendingFrameColor !== undefined) window.runtime?.bus?.executeCommand('door.setFrameColor', { doorId: elementId, frameColor: ctx.pendingFrameColor })?.catch((e: unknown) => surfaceCommandFailure('door', 'door.setFrameColor', e));
        // TASK-04: swing via the same bus-primary pattern (C15 §8.1 — no legacy wallStore
        // update needed from this code path; the committer handles geometry rebuild).
        if (updates.swing !== undefined) window.runtime?.bus?.executeCommand('door.setSwing', { doorId: elementId, swing: updates.swing })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setSwing failed:', e));
    } else if (type === 'curtainwall') {
        window.runtime?.bus?.executeCommand('wall.updateCurtainWall', { id: elementId, updates })
            ?.catch((e: unknown) => console.error('[PropertyInspectorApply] wall.updateCurtainWall failed:', e));
    } else if (type === 'column') {
        window.runtime?.bus?.executeCommand('column.update', { id: elementId, updates })
            ?.catch((e: unknown) => console.error('[PropertyInspectorApply] column.update failed:', e));
    } else {
        applyUpdatesByType(ctx, d, updates);
        triggerThreeUpdate(ctx, d);
    }

    ctx.callbacks.onUnselect();
    ctx.element.style.display = 'none';

    // [P6-E.5.1] No-op subscription removed — re-inspection is handled by PropertyInspector
    // itself via the commandBus subscription in createLevelSelector(). The commandManager
    // onCommandExecuted hook was a dead callback; the bus-native path is already wired.
}
