import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();
import { viewDefinitionStore } from '@pryzm/core-app-model';

export interface CreatePlanViewPayload {
    levelId: string;
    name: string;
}

export class CreatePlanViewCommand implements Command {
    readonly affectedStores = ["level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    constructor(private payload: CreatePlanViewPayload) {
        this.id = `cmd-planview-${Date.now()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.levelId];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) return { ok: false, reason: "Level ID is required" };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { components, world } = context.bimManager as any;

        // IFC-P1.3: When OBC BimManager components are not initialised (which is
        // always the case when IFC is imported via the PRYZM-native
        // IfcGeometryRenderer path — it bypasses OBC's ifcLoader, so OBC.Views
        // is never populated), fall back to creating a first-class ViewDefinition
        // in viewDefinitionStore.  viewDefinitionStore is the canonical source
        // read by SplitViewManager and ViewController — registering here means the
        // plan view appears in the view browser, storey-switch works, and the
        // AnnotationTools can resolve ownerViewId checks.  Audit finding: BUG-03.
        if (!components) {
            return this._createNativePlanView(context);
        }

        const views = components.get(window.OBC.Views) as any;
        if (!views) return { success: false, affectedElementIds: [], info: ["Views component not found"] };

        if (views.list.has(this.payload.levelId)) {
            console.log(`[CreatePlanViewCommand] View ${this.payload.levelId} already exists`);
            return { success: true, affectedElementIds: [this.payload.levelId], info: ["View already exists"] };
        }

        console.log(`[CreatePlanViewCommand] Creating view: ${this.payload.levelId} (${this.payload.name})`);

        const view = new window.OBC.View(components) as any;
        view.id = this.payload.levelId;
        view.label = this.payload.name;
        view.type = "Floor Plan";
        
        // Setup default plan view camera (top down)
        const wallStore = context.stores.wallStore;
        const levels = wallStore.getLevels();
        const level = levels.find((l: any) => l.id === this.payload.levelId);
        const elevation = level ? level.elevation : 0;
        
        view.position = new THREE.Vector3(0, elevation + 50, 0);
        view.direction = new THREE.Vector3(0, -1, 0);
        
        // Associate with world
        if (world) {
            view.world = world;
        } else if (window.bimWorld) {
            view.world = window.bimWorld;
        }

        views.list.set(view.id, view);

        // Also register in viewDefinitionStore so SplitViewManager / ViewController
        // can resolve this view by levelId without scanning OBC's internal list.
        this._registerInViewDefinitionStore(elevation);

        console.log(`[CreatePlanViewCommand] View registered in OBC.Views. Current list:`, [...views.list.keys()]);

        _bus.emit('plan-view-added', { viewId: view.id });
        _bus.emit('update-view-browser', {});

        return {
            success: true,
            affectedElementIds: [view.id],
            info: [`Plan view "${this.payload.name}" created`]
        };
    }

    // ── IFC-P1.3 native path ─────────────────────────────────────────────────

    /**
     * Create a PRYZM-native plan view when OBC components are absent.
     *
     * Stores the plan view in viewDefinitionStore (the canonical read source for
     * SplitViewManager, ViewController, and annotation tools) so the view
     * appears in the view browser and all downstream systems work correctly
     * without requiring OBC initialisation.
     */
    private _createNativePlanView(context: CommandContext): CommandResult {
        // Guard: skip if a view with this ID is already in the store.
        if (viewDefinitionStore.has(this.payload.levelId)) {
            console.log(`[CreatePlanViewCommand] Native view ${this.payload.levelId} already in viewDefinitionStore`);
            return { success: true, affectedElementIds: [this.payload.levelId], info: ["View already exists"] };
        }

        // Resolve elevation from the level store for the viewRange cutPlaneOffset.
        const wallStore = (context.stores as any).wallStore;
        const levels: Array<{ id: string; elevation: number }> = wallStore?.getLevels?.() ?? [];
        const level = levels.find(l => l.id === this.payload.levelId);
        const elevation = level?.elevation ?? 0;

        this._registerInViewDefinitionStore(elevation);

        console.log(`[CreatePlanViewCommand] Created native plan view "${this.payload.name}" for level ${this.payload.levelId} @ ${elevation.toFixed(3)} m`);

        _bus.emit('plan-view-added', { viewId: this.payload.levelId });
        _bus.emit('update-view-browser', {});

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Plan view "${this.payload.name}" created (native path, OBC not initialised)`]
        };
    }

    /**
     * Write a ViewDefinition record to viewDefinitionStore.
     * Called from both the OBC path (to keep the two stores in sync) and the
     * native path (as the sole storage). Idempotent — no-ops if the id exists.
     */
    private _registerInViewDefinitionStore(elevation: number): void {
        if (viewDefinitionStore.has(this.payload.levelId)) return;
        viewDefinitionStore.create({
            id:        this.payload.levelId,
            name:      this.payload.name,
            viewType:  'plan',
            createdBy: 'ifc-import',
            // spatial.levelId is the canonical reference — elevation is resolved
            // at render time via BimManager.getLevelById(levelId).elevation (§02).
            spatial: {
                levelId: this.payload.levelId,
            },
        });
        // Suppress unused-variable warning for elevation (used in OBC path).
        void elevation;
    }

    undo(context: CommandContext): CommandResult {
        // Remove from viewDefinitionStore (canonical store).
        if (viewDefinitionStore.has(this.payload.levelId)) {
            viewDefinitionStore.delete(this.payload.levelId);
        }

        // Also remove from OBC.Views if components are available.
        const { components } = context.bimManager as any;
        if (components) {
            const views = components.get(window.OBC.Views);
            if (views?.list?.has(this.payload.levelId)) {
                views.list.delete(this.payload.levelId);
            }
        }

        _bus.emit('update-view-browser', {});
        return { success: true, affectedElementIds: [this.payload.levelId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
