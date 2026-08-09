/**
 * UpdateElementParameterCommand
 *
 * Generic command for updating one or more parameters on any BIM element.
 * Routes to the correct element store based on elementType.
 * The store emits a change event → StoreEventBus → DependencyResolver → Builder. // TODO(TASK-08)
 *
 * Contract compliance:
 *  - §01 CORE: Mutations go through commands, not direct store access from UI
 *  - §01-5.1: Commands must be undoable
 *  - §01-4.2: Stores must not be mutated outside commands
 *
 * Usage:
 *   const cmd = new UpdateElementParameterCommand({
 *       elementId: 'abc',
 *       elementType: 'wall',
 *       parameters: { height: 3.5, materialColor: '#ff0000' }
 *   });
 *   commandManager.execute(cmd);
 */

import { Command, CommandResult, CommandValidationResult, CommandContext, SerializedCommand, CommandType } from '../types';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { resolveElementRebuildDescriptor, isGeometryAffectingChange } from './ElementRebuildRegistry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export const UPDATE_ELEMENT_PARAMETER_TYPE = CommandType.UPDATE_ELEMENT_PARAMETER;

export interface UpdateElementParameterInput {
    elementId: string;
    elementType: string;
    parameters: Record<string, any>;
}

export class UpdateElementParameterCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = UPDATE_ELEMENT_PARAMETER_TYPE;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    private previousValues: Record<string, any> = {};

    constructor(private input: UpdateElementParameterInput) {
        this.targetIds = [input.elementId];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.input.elementId) {
            return { ok: false, reason: '[UpdateElementParameterCommand] elementId is required' };
        }
        if (!this.input.elementType) {
            return { ok: false, reason: '[UpdateElementParameterCommand] elementType is required' };
        }
        if (!this.input.parameters || Object.keys(this.input.parameters).length === 0) {
            return { ok: false, reason: '[UpdateElementParameterCommand] parameters must not be empty' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { elementId, elementType, parameters } = this.input;
        const store = this.resolveStore(elementType, context);

        if (!store) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`[UpdateElementParameterCommand] No store for elementType: ${elementType}`]
            };
        }

        const element = this.getElement(store, elementType, elementId, context);
        if (!element) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`[UpdateElementParameterCommand] Element not found: ${elementId}`]
            };
        }

        this.previousValues = this.captureCurrentValues(element, parameters);

        const validated = this.validateParameters(parameters, elementType);
        if (!validated.ok) {
            return {
                success: false,
                affectedElementIds: [],
                info: [validated.reason ?? 'Parameter validation failed']
            };
        }

        this.applyUpdate(store, elementType, elementId, parameters, context);

        console.log(`[UpdateElementParameterCommand] Updated ${elementType}/${elementId}`, parameters);

        return { success: true, affectedElementIds: [elementId] };
    }

    undo(context: CommandContext): CommandResult {
        if (Object.keys(this.previousValues).length === 0) {
            return { success: true, affectedElementIds: [] };
        }

        const undoCmd = new UpdateElementParameterCommand({
            elementId: this.input.elementId,
            elementType: this.input.elementType,
            parameters: this.previousValues,
        });

        return undoCmd.execute(context);
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.input,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    private resolveStore(elementType: string, context: CommandContext): any {
        const t = elementType.toLowerCase().trim();

        switch (t) {
            case 'wall':           return context.stores.wallStore;
            case 'slab':           return context.stores.slabStore;
            case 'column':         return context.stores.columnStore;
            case 'beam':           return context.stores.beamStore;
            case 'stair':
            case 'stairs':         return context.stores.stairStore;
            case 'curtainwall':
            case 'curtain-wall':   return context.stores.curtainWallStore;
            case 'roof':           return (context.stores as any).roofStore;
            case 'furniture':
            case 'bed':
            case 'table':
            case 'chair':
            case 'sofa':
            case 'wardrobe':
            case 'wardrobe_glass_door':
            case 'corner_wardrobe': return (context.stores as any).furnitureStore ?? window.furnitureStore // TODO(TASK-07);
            case 'handrail':       return (context.stores as any).handrailStore ?? window.handrailStore // TODO(TASK-07);
            case 'window':
            case 'door':           return context.stores.wallStore;
            default:               return null;
        }
    }

    private getElement(store: any, elementType: string, elementId: string, _context: CommandContext): any {
        const t = elementType.toLowerCase();
        if (t === 'window') return store.getWindow?.(elementId);
        if (t === 'door')   return store.getDoor?.(elementId);
        return store.getById?.(elementId) ?? store.get?.(elementId);
    }

    private applyUpdate(store: any, elementType: string, elementId: string, parameters: Record<string, any>, context: CommandContext): void {
        const t = elementType.toLowerCase();

        if (t === 'window') {
            store.updateWindow?.(elementId, parameters);
            // Also sync rich WindowStore so WindowBuilder rebuilds the frame geometry
            if (windowStore.has(elementId)) {
                windowStore.update(elementId, parameters as any);
            }
        } else if (t === 'door') {
            store.updateDoor?.(elementId, parameters);
            // Also sync rich DoorStore so DoorBuilder rebuilds the frame geometry
            if (doorStore.has(elementId)) {
                doorStore.update(elementId, parameters as any);
            }
        } else if (t === 'stair' || t === 'stairs') {
            // Expand dot-notation keys (e.g. 'properties.material' → {properties: {material: ...}})
            // so that StairStore.update() can correctly merge nested objects.
            const expanded: Record<string, any> = {};
            for (const [key, val] of Object.entries(parameters)) {
                if (key.startsWith('properties.')) {
                    const subKey = key.slice('properties.'.length);
                    if (!expanded.properties) expanded.properties = {};
                    expanded.properties[subKey] = val;
                } else {
                    expanded[key] = val;
                }
            }
            store.update?.(elementId, expanded);
        } else if (['furniture', 'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe', 'bed', 'table', 'chair', 'sofa'].includes(t)) {
            // FurnitureStore.update() REPLACES the entry with the data passed
            // in (it expects the full FurnitureData record), so we must merge
            // the partial parameter set onto the existing record before calling
            // — otherwise furnitureType / width / position / etc. get wiped and
            // the rebuild produces an empty mesh.
            const existing = store.get?.(elementId);
            if (existing) {
                store.update?.(elementId, { ...existing, ...parameters });
            } else {
                store.update?.(elementId, parameters);
            }
        } else if (t === 'slab') {
            // §FIX-SLAB-PARAM-WIPE — SlabStore.update() does a FULL REPLACE (it expects a
            // complete SlabData record and structuredClones + freezes it, per C03 §01 §3.4),
            // NOT a partial merge like WallStore.update(). Passing the raw partial parameter
            // set (e.g. { materialColor }) therefore WIPED the whole slab record — id,
            // levelId, polygon, layers — leaving `{ materialColor }`. The store then emitted a
            // StoreChangeEvent with `elementId: undefined` (slab.id gone), which crashed the
            // downstream store-event listeners: ViewDependencyTracker._onStoreEvent
            // (`event.elementId.includes('::')`) and DependencyResolver's cascade dispatcher
            // (`triggerElementId.substring(0, 8)`) both assume a defined id — the founder's
            // per-frame rAF spam. Merge onto the existing record first (mirrors the furniture
            // branch above) so the record stays whole and the emit carries a real id.
            const existing = store.getById?.(elementId);
            if (existing) {
                store.update?.(elementId, { ...existing, ...parameters });
            } else {
                store.update?.(elementId, parameters);
            }
        } else {
            store.update?.(elementId, parameters);
        }

        this.triggerGeometryRebuild(elementType, elementId, context);
    }

    private triggerGeometryRebuild(elementType: string, elementId: string, context: CommandContext): void {
        const t = elementType.toLowerCase();

        // §FIX-STAIR-PARAM-NO-REGEN (L-215) — declarative rebuild path.
        // Element types that register an ElementRebuildDescriptor own their own
        // "regenerate geometry from parameters" command; the generic command
        // dispatches it instead of carrying a per-type branch below. This is how
        // stair now rebuilds (flight + landing + treads/risers + railing, with its
        // DERIVED fields reconciled first). New parametric elements register a
        // descriptor rather than growing the legacy if-ladder.
        const descriptor = resolveElementRebuildDescriptor(elementType);
        if (descriptor) {
            const changedKeys = Object.keys(this.input.parameters);
            if (isGeometryAffectingChange(descriptor, changedKeys)) {
                try {
                    const rebuildCmd = descriptor.createRebuildCommand(elementId);
                    const res = rebuildCmd.execute(context);
                    if (!res.success) {
                        console.warn('[UpdateElementParameterCommand] Rebuild command failed:', res.info);
                    }
                } catch (e) {
                    console.warn('[UpdateElementParameterCommand] Declarative rebuild error:', e);
                }
            }
            return;
        }

        try {
            if (t === 'wall') {
                // ── §FIX-PARAM-REBUILD-READS-STALE-STORE (L-813) ───────────
                //
                // Founder-reported 2026-08-09: "the vertical angle works, but the
                // wall only gets angled after another element is created or
                // modified."
                //
                // `applyParameters()` WRITES through `resolveStore()` →
                // `context.stores.wallStore`. This read used `window.wallStore`.
                // Those are not guaranteed to be the same instance — the editor
                // threads its stores in explicitly at `engineLauncher.ts:781`, and
                // the window globals are a separate legacy surface. When they
                // differ, the rebuild re-reads a wall WITHOUT the change that was
                // just written and faithfully rebuilds the OLD geometry. The edit
                // then appears only when some later event triggers a rebuild that
                // happens to read the right store — exactly "it applies after I
                // touch something else".
                //
                // Reading back from the SAME store we wrote to removes the class of
                // bug, not just the rake instance: every parameter edit routed
                // through this command had the same latent stale-read. It also
                // drops one `window.*` reach-through (P4).
                //
                // `context.stores.wallStore` is falsy-guarded rather than assumed —
                // some legacy call sites construct a context without it, and a
                // missing store must degrade to "no rebuild", never throw inside a
                // command that has already mutated state.
                const builder = window.wallFragmentBuilder;
                const store   = (context.stores as { wallStore?: { getById?: (id: string) => unknown } }).wallStore
                             ?? window.wallStore // TODO(TASK-07) — last-resort legacy fallback
                             ;
                const wall    = store?.getById?.(elementId);
                if (wall && builder?.buildWall) builder.buildWall(wall);

            } else if (t === 'window' || t === 'door') {
                const wallStore = window.wallStore // TODO(TASK-07);
                const walls     = wallStore?.getAll?.() ?? [];
                for (const wall of walls) {
                    const hasOpening = wall.openings?.some(
                        (o: any) => o.elementId === elementId || o.id === elementId
                    );
                    if (hasOpening) {
                        const builder = window.wallFragmentBuilder;
                        if (builder?.buildWall) builder.buildWall(wall);
                        break;
                    }
                }

            } else if (t === 'slab') {
                const builder = window.slabBuilder;
                const store   = window.slabStore // TODO(TASK-07);
                const slab    = store?.getById?.(elementId);
                if (slab && builder?.buildSlab) builder.buildSlab(slab);

            } else if (t === 'curtainwall' || t === 'curtain-wall') {
                const builder = window.curtainWallBuilder;
                const store   = window.curtainWallStore // TODO(TASK-07);
                const cw      = store?.get?.(elementId) ?? store?.getById?.(elementId);
                if (cw && builder?.buildCurtainWall) builder.buildCurtainWall(cw);

            } else if (t === 'column') {
                const builder = window.columnBuilder;
                const store   = window.columnStore // TODO(TASK-07);
                const col     = store?.get?.(elementId);
                if (col && builder?.buildColumn) builder.buildColumn(col);

            } else if (t === 'roof') {
                // Roof geometry rebuild is handled automatically via the bim-roof-updated
                // event emitted by RoofStore.update(). No direct builder call is needed.

            } else if (['furniture', 'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe', 'bed', 'table', 'chair', 'sofa'].includes(t)) {
                _bus.emit('bim-furniture-updated', { id: elementId }); // F.events.17

            } else if (t === 'handrail') {
                _bus.emit('bim-handrail-updated', { id: elementId }); // F.events.17

            }
            // NOTE: stair / stairs are handled above via the declarative
            // ElementRebuildRegistry (GenerateStairGeometryCommand) — including the
            // railing-type propagation that used to live here — so there is no
            // per-type stair branch in this legacy ladder any more.
        } catch (e) {
            console.warn('[UpdateElementParameterCommand] Geometry rebuild error:', e);
        }
    }

    /**
     * §FIX-STAIR-PROPS-UNDO — snapshot the PRE-EDIT value of every key being written,
     * so `undo()` can replay it as a normal parameter write.
     *
     * The flat `element[key]` read was wrong for DOTTED keys. The stair panel sends
     * `properties.stringerType` / `properties.nosingType` / `properties.riserVisible` /
     * `properties.material` / `properties.railingType`; `element['properties.nosingType']`
     * is `undefined`, so the snapshot recorded `undefined` and undo replayed
     * `{ 'properties.nosingType': undefined }` — which `applyUpdate` faithfully expands
     * to `{ properties: { nosingType: undefined } }` and StairStore merges, ERASING the
     * property instead of restoring it. `StairMeshBuilder` then fell back to the type /
     * DEFAULT_STAIR_PROPERTIES value, so undo produced a stair that matched neither the
     * before nor the after state. Resolve the path so undo restores the real prior value.
     */
    private captureCurrentValues(element: any, parameters: Record<string, any>): Record<string, any> {
        const snapshot: Record<string, any> = {};
        for (const key of Object.keys(parameters)) {
            if (key.includes('.')) {
                let cur: any = element;
                for (const seg of key.split('.')) {
                    if (cur === null || cur === undefined) { cur = undefined; break; }
                    cur = cur[seg];
                }
                snapshot[key] = cur;
            } else {
                snapshot[key] = element[key];
            }
        }
        return snapshot;
    }

    private validateParameters(parameters: Record<string, any>, _elementType: string): CommandValidationResult {
        for (const [key, val] of Object.entries(parameters)) {
            if (typeof val === 'number' && isNaN(val)) {
                return { ok: false, reason: `Parameter '${key}' is NaN` };
            }
            if (key === 'height' && typeof val === 'number' && val < 0) {
                return { ok: false, reason: `Height must be ≥ 0` };
            }
            if (key === 'thickness' && typeof val === 'number' && val <= 0) {
                return { ok: false, reason: `Thickness must be > 0` };
            }
            if ((key === 'width' || key === 'depth' || key === 'length') && typeof val === 'number' && val <= 0) {
                return { ok: false, reason: `${key} must be > 0` };
            }
        }
        return { ok: true };
    }
}
