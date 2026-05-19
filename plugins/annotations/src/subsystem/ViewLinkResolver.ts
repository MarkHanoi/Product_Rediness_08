/**
 * DOC-2.6 — ViewLinkResolver
 *
 * Read-only utility: viewDefinitionId → { sheetNumber, detailNumber, sheetName }.
 *
 * Moved from src/engine/subsystems/core/views/ViewLinkResolver.ts
 * during Sprint C (S5.1-P2 2026-05-10). Original path now a re-export shim.
 *
 * Contract compliance:
 *   §01 §5  — Read-only; never mutates any store
 *   §03 §1  — Reads from SheetStore (authoritative sheet entity)
 *   §05 §7  — No THREE.js or bim-* objects created here
 */

import { storeEventBus } from '@pryzm/core-app-model';

export interface ViewLinkInfo {
    sheetNumber: string;
    detailNumber: string;
    sheetName: string;
}

export class ViewLinkResolver {
    private _listeners: Set<() => void> = new Set();
    private _unsubscribe: (() => void) | null = null;

    constructor() {
        this._unsubscribe = storeEventBus.subscribe((event) => {
            if (event.elementType === 'sheet-definition') {
                this._notify();
            }
        });
    }

    resolve(viewDefId: string): ViewLinkInfo | null {
        const sheetStore: any = typeof window !== 'undefined' ? (window as any).sheetStore : null;
        if (!sheetStore) return null;
        const sheets = sheetStore.getAll();
        for (const sheet of sheets) {
            const idx = sheet.viewports.findIndex((vp: any) => vp.viewId === viewDefId);
            if (idx !== -1) {
                return {
                    sheetNumber:  sheet.sheetNumber,
                    detailNumber: String(idx + 1),
                    sheetName:    sheet.name,
                };
            }
        }
        return null;
    }

    subscribe(callback: () => void): () => void {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    dispose(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._listeners.clear();
    }

    private _notify(): void {
        for (const cb of this._listeners) {
            try { cb(); } catch { /* subscriber errors must not affect others */ }
        }
    }
}

export const viewLinkResolver = new ViewLinkResolver();
