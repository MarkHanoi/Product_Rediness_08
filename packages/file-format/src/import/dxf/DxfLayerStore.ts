/**
 * DxfLayerStore.ts — Phase 1, §31
 *
 * In-memory store for DXF layer visibility and rendering state.
 *
 * CONTRACT (§31 §7.1):
 *   - NOT an ElementStore — never registered in StoreRegistry.
 *   - Not wired to StoreEventBus. // TODO(TASK-08)
 *   - Managed exclusively by DxfUnderlayTool and DxfImportPanel.
 */

export interface DxfLayerState {
    name: string;
    visible: boolean;
    /** Hex colour string e.g. '#ff0000'. Derived from DXF layer colour; can be overridden by user */
    color: string;
    linewidth: number;
}

function rgbToHex(rgb: [number, number, number]): string {
    return '#' + rgb.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

export class DxfLayerStore {
    private _layers = new Map<string, DxfLayerState>();
    private _overlayId: string = '';

    /** Initialise from parsed DXF layer table */
    init(
        layers: Record<string, { name: string; rgb: [number, number, number] }>,
        overlayId: string,
    ): void {
        this._layers.clear();
        this._overlayId = overlayId;
        for (const [name, info] of Object.entries(layers)) {
            this._layers.set(name, {
                name,
                visible: true,
                color: rgbToHex(info.rgb),
                linewidth: 1,
            });
        }
        // Ensure layer "0" always present
        if (!this._layers.has('0')) {
            this._layers.set('0', { name: '0', visible: true, color: '#ffffff', linewidth: 1 });
        }
    }

    get overlayId(): string { return this._overlayId; }

    getAll(): DxfLayerState[] {
        return Array.from(this._layers.values());
    }

    get(name: string): DxfLayerState | undefined {
        return this._layers.get(name);
    }

    setVisible(name: string, visible: boolean): void {
        const layer = this._layers.get(name);
        if (layer) layer.visible = visible;
    }

    setAllVisible(visible: boolean): void {
        for (const layer of this._layers.values()) {
            layer.visible = visible;
        }
    }

    setColor(name: string, color: string): void {
        const layer = this._layers.get(name);
        if (layer) layer.color = color;
    }

    size(): number { return this._layers.size; }

    clear(): void { this._layers.clear(); }

    /** Serialize for project persistence (§31 Phase 2) */
    serialize(): Array<{ name: string; visible: boolean; color: string; linewidth: number }> {
        return this.getAll().map(l => ({ name: l.name, visible: l.visible, color: l.color, linewidth: l.linewidth }));
    }

    /** Restore from serialized data */
    restore(data: Array<{ name: string; visible: boolean; color: string; linewidth: number }>): void {
        for (const item of data) {
            if (this._layers.has(item.name)) {
                const layer = this._layers.get(item.name)!;
                layer.visible = item.visible;
                layer.color = item.color;
                layer.linewidth = item.linewidth;
            }
        }
    }
}

/** Singleton layer store — one active DXF overlay at a time in Phase 1 */
export const dxfLayerStore = new DxfLayerStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'dxfLayerStore',
    clear: () => dxfLayerStore.clear(),
});
