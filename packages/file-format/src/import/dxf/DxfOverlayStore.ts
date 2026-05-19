/**
 * DxfOverlayStore.ts — Phase 2, §31
 *
 * Project-scoped store for DXF overlay records.
 * Used by ProjectSerializer/ProjectLoader for save-restore (§31 Phase 2).
 *
 * CONTRACT (§31 §7.1):
 *   - NOT an ElementStore. Not wired to StoreEventBus. // TODO(TASK-08)
 *   - Stores only plain serializable data — no THREE.js objects.
 *   - The live scene objects are owned by DxfUnderlayTool.
 */

export interface DxfOverlayRecord {
    overlayId: string;
    fileName: string;
    /** Full DXF source text — restored from this on project reload */
    sourceText: string;
    /** Metres-per-DXF-unit applied when geometry was built */
    metersPerUnit: number;
    /** World Y position of the group */
    elevation: number;
    /** World position offset applied to group (from drag) */
    positionOffset: { x: number; z: number };
    opacity: number;
    locked: boolean;
    /** Layer visibility/colour state serialized from DxfLayerStore */
    layers: Array<{ name: string; visible: boolean; color: string; linewidth: number }>;
}

class DxfOverlayStore {
    private _records = new Map<string, DxfOverlayRecord>();

    register(record: DxfOverlayRecord): void {
        this._records.set(record.overlayId, record);
    }

    update(overlayId: string, partial: Partial<DxfOverlayRecord>): void {
        const existing = this._records.get(overlayId);
        if (existing) Object.assign(existing, partial);
    }

    remove(overlayId: string): void {
        this._records.delete(overlayId);
    }

    get(overlayId: string): DxfOverlayRecord | undefined {
        return this._records.get(overlayId);
    }

    getAll(): DxfOverlayRecord[] {
        return Array.from(this._records.values());
    }

    clear(): void {
        this._records.clear();
    }

    size(): number { return this._records.size; }

    /** Serialize for project snapshot */
    serialize(): { version: 1; overlays: DxfOverlayRecord[] } {
        return { version: 1, overlays: this.getAll().map(r => structuredClone(r)) };
    }

    /** Restore from serialized snapshot data */
    restore(data: { version: 1; overlays: DxfOverlayRecord[] }): void {
        this.clear();
        if (!data?.overlays) return;
        for (const record of data.overlays) {
            this._records.set(record.overlayId, structuredClone(record));
        }
    }
}

export const dxfOverlayStore = new DxfOverlayStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'dxfOverlayStore',
    clear: () => dxfOverlayStore.clear(),
});
