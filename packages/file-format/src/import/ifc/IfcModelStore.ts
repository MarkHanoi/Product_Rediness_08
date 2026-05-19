export interface IfcElementRecord {
    id: string;
    expressID: number;
    name: string;
    ifcTypeName: string;
    rawIfcType: string;
    storeyName: string;
    storeyExpressID: number;
    psets: Record<string, Record<string, string | number | boolean>>;
}

export interface IfcModelData {
    modelId: string;
    modelName: string;
    elements: IfcElementRecord[];
    storeyOrder: string[];
}

class IfcModelStoreClass {
    private readonly _models = new Map<string, IfcModelData>();

    register(data: IfcModelData): void {
        this._models.set(data.modelId, data);
    }

    remove(modelId: string): void {
        this._models.delete(modelId);
    }

    /**
     * Contract 45 — wipe ALL imported IFC models.
     *
     * Fires `bim-ifc-model-removed` per model BEFORE deleting so the
     * renderer / fragment cache / spatial tree dispose their per-model
     * resources exactly as they would for a single user-initiated remove.
     * Without this, switching projects would leave the previous project's
     * IFC geometry visible in WebGL/WebGPU buffers and selectable from
     * the UI panels (Spatial Tree, Property Panel, exports).
     */
    clear(): void {
        const modelIds = [...this._models.keys()];
        for (const modelId of modelIds) {
            try {
                if (typeof window !== 'undefined') {
                    _bus.emit('bim-ifc-model-removed', { modelId }); // F.events.18
                }
            } catch (err) {
                console.warn('[IfcModelStore] dispatch bim-ifc-model-removed failed:', err);
            }
            this._models.delete(modelId);
        }
    }

    removeElement(modelId: string, elementId: string): void {
        const model = this._models.get(modelId);
        if (!model) return;
        model.elements = model.elements.filter(e => e.id !== elementId);
    }

    getAll(): IfcModelData[] {
        return [...this._models.values()];
    }

    getModel(modelId: string): IfcModelData | undefined {
        return this._models.get(modelId);
    }

    getElementById(elementId: string): IfcElementRecord | undefined {
        for (const model of this._models.values()) {
            const found = model.elements.find(e => e.id === elementId);
            if (found) return found;
        }
        return undefined;
    }

    get size(): number {
        return this._models.size;
    }
}

export const ifcModelStore = new IfcModelStoreClass();

import { projectScopeRegistry } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
projectScopeRegistry.register({
    scopeName: 'ifcModelStore',
    clear: () => ifcModelStore.clear(),
});
