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

    if (type === 'slab' && (updates.width !== undefined || updates.depth !== undefined || updates.thickness !== undefined || updates.materialColor !== undefined || updates.materialId !== undefined)) {
        const payload: any = { id: d.id, ...updates };
        const colorInput = ctx.element.querySelector('[data-key="materialColor"]') as HTMLInputElement;
        if (colorInput) payload.materialColor = colorInput.value;
        console.log("COMMAND PAYLOAD:", payload);
        window.runtime?.bus?.executeCommand('slab.update', payload)
            ?.catch((e: unknown) => console.error('[PropertyInspectorApply] slab.update failed:', e));
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    }
    if (type === 'wall' && (updates.height !== undefined || updates.thickness !== undefined || updates.materialColor !== undefined || updates.materialId !== undefined)) {
        const hasDimensionChange = updates.height !== undefined || updates.thickness !== undefined;
        const hasColorChange = updates.materialColor !== undefined || updates.materialId !== undefined;
        if (hasColorChange) {
            window.runtime?.bus?.executeCommand('wall.setColor', { wallId: elementId, materialColor: updates.materialColor, materialId: updates.materialId ?? null })
                ?.catch((e: unknown) => console.error('[PropertyInspectorApply] wall.setColor failed:', e));
        }
        if (hasDimensionChange) {
            window.runtime?.bus?.executeCommand('wall.updateDimensions', { wallId: elementId, height: Number(updates.height ?? d.height), thickness: Number(updates.thickness ?? d.thickness) })
                ?.catch((e: unknown) => console.error('[PropertyInspectorApply] wall.updateDimensions failed:', e));
            ctx.callbacks.onUnselect();
            ctx.element.style.display = 'none';
            return;
        }
        ctx.callbacks.onUnselect();
        ctx.element.style.display = 'none';
        return;
    } else if (type === 'window') {
        if (updates.width !== undefined) window.runtime?.bus?.executeCommand('window.setSize', { windowId: elementId, width: updates.width })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSize (width) failed:', e));
        if (updates.height !== undefined) window.runtime?.bus?.executeCommand('window.setSize', { windowId: elementId, height: updates.height })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSize (height) failed:', e));
        if (updates.sillHeight !== undefined) window.runtime?.bus?.executeCommand('window.setSillHeight', { windowId: elementId, sillHeight: updates.sillHeight })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setSillHeight failed:', e));
        if (ctx.pendingFrameColor !== undefined) window.runtime?.bus?.executeCommand('window.setFrameColor', { windowId: elementId, frameColor: ctx.pendingFrameColor })?.catch((e: unknown) => console.error('[PropertyInspectorApply] window.setFrameColor failed:', e));
    } else if (type === 'door') {
        if (updates.width !== undefined) window.runtime?.bus?.executeCommand('door.setWidth', { doorId: elementId, width: updates.width })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setWidth failed:', e));
        if (updates.height !== undefined) window.runtime?.bus?.executeCommand('door.setHeight', { doorId: elementId, height: updates.height })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setHeight failed:', e));
        if (updates.sillHeight !== undefined) window.runtime?.bus?.executeCommand('door.setSillHeight', { doorId: elementId, sillHeight: updates.sillHeight })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setSillHeight failed:', e));
        if (ctx.pendingFrameColor !== undefined) window.runtime?.bus?.executeCommand('door.setFrameColor', { doorId: elementId, frameColor: ctx.pendingFrameColor })?.catch((e: unknown) => console.error('[PropertyInspectorApply] door.setFrameColor failed:', e));
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
