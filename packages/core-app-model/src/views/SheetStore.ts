/**
 * SheetStore — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2) + Phase S1 (Sheet Integration)
 *
 * Authoritative Map<sheetId, SheetDefinition> store.
 * Follows the exact ViewDefinitionStore pattern.
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed (commands call store methods)
 *   §01 §3.3   — Implements the ElementStore pattern: getAll, get, set, delete, serialize
 *   §03 §1.1   — SheetDefinition is a schema-stable first-class entity; all S1 additions are additive
 *   §04        — Read-only access via AIReadModel only; this store is NOT imported by AI layer
 *   §05        — Pure data module; no DOM, no Three.js, no rendering
 *   §07        — No server routes; client-side only
 *
 * Phase S1 additions:
 *   - create() accepts viewports, revisions, issueDate, issuedBy, status
 *   - update() accepts viewports, revisions, issueDate, issuedBy, status
 *   - addViewport() / removeViewport() / moveViewport() / updateViewportScale()
 *   - addRevision() / deleteRevision()
 *   - deserialize() migrates legacy viewIds → viewports with zero positions
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type {
    SheetDefinition,
    SheetDefinitionStoreSnapshot,
    SheetViewport,
    RevisionEntry,
    SheetStatus,
    PaperSize,
    OutputConfig,
} from './SheetDefinitionTypes';
import type { LayoutRule } from '@pryzm/core-app-model';
import type { DataPanel, AnnotationLayer } from '@pryzm/core-app-model';

class SheetStoreImpl {
    private _sheets: Map<string, SheetDefinition> = new Map();

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getAll(): SheetDefinition[] {
        return [...this._sheets.values()].map(s => JSON.parse(JSON.stringify(s)));
    }

    get(sheetId: string): SheetDefinition | undefined {
        const s = this._sheets.get(sheetId);
        return s ? JSON.parse(JSON.stringify(s)) : undefined;
    }

    has(sheetId: string): boolean {
        return this._sheets.has(sheetId);
    }

    getByViewId(viewId: string): SheetDefinition[] {
        return this.getAll().filter(s => s.viewports.some(vp => vp.viewId === viewId));
    }

    // ── Write API (called only by Commands) ───────────────────────────────────

    create(params: {
        id:          string;
        sheetNumber: string;
        name:        string;
        revision?:   string;
        viewports?:  SheetViewport[];
        viewIds?:    string[];
        titleBlock?: string;
        createdBy?:  string;
        revisions?:  RevisionEntry[];
        issueDate?:  string;
        issuedBy?:   string;
        status?:     SheetStatus;
    }): SheetDefinition | null {
        if (this._sheets.has(params.id)) return null;

        // Accept either viewports[] (new) or viewIds[] (legacy → convert)
        let viewports: SheetViewport[] = params.viewports ?? [];
        if (viewports.length === 0 && params.viewIds && params.viewIds.length > 0) {
            viewports = params.viewIds.map(viewId => ({
                id:       `vp-${crypto.randomUUID()}`,
                viewId,
                position: { x: 0, y: 0 },
            }));
        }

        const now = Date.now();
        const sheet: SheetDefinition = {
            id:          params.id,
            sheetNumber: params.sheetNumber,
            name:        params.name,
            revision:    params.revision ?? '',
            viewports,
            titleBlock:  params.titleBlock,
            revisions:   params.revisions,
            issueDate:   params.issueDate,
            issuedBy:    params.issuedBy,
            status:      params.status,
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  params.createdBy ?? 'user',
            },
        };

        this._sheets.set(sheet.id, sheet);
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheet.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('sd:sheet-created', { sheetId: sheet.id });
        return JSON.parse(JSON.stringify(sheet));
    }

    update(sheetId: string, patch: {
        sheetNumber?: string;
        name?:        string;
        revision?:    string;
        viewports?:   SheetViewport[];
        viewIds?:     string[];
        titleBlock?:  string;
        revisions?:   RevisionEntry[];
        issueDate?:   string;
        issuedBy?:    string;
        status?:      SheetStatus;
    }): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;

        if (patch.sheetNumber !== undefined) sheet.sheetNumber = patch.sheetNumber;
        if (patch.name        !== undefined) sheet.name        = patch.name;
        if (patch.revision    !== undefined) sheet.revision    = patch.revision;
        if (patch.viewports   !== undefined) sheet.viewports   = patch.viewports;
        if (patch.titleBlock  !== undefined) sheet.titleBlock  = patch.titleBlock;
        if (patch.revisions   !== undefined) sheet.revisions   = patch.revisions;
        if (patch.issueDate   !== undefined) sheet.issueDate   = patch.issueDate;
        if (patch.issuedBy    !== undefined) sheet.issuedBy    = patch.issuedBy;
        if (patch.status      !== undefined) sheet.status      = patch.status;

        // Legacy: if viewIds patch provided and no viewports patch, convert
        if (patch.viewIds !== undefined && patch.viewports === undefined) {
            sheet.viewports = patch.viewIds.map(viewId => {
                const existing = sheet.viewports.find(vp => vp.viewId === viewId);
                return existing ?? { id: `vp-${crypto.randomUUID()}`, viewId, position: { x: 0, y: 0 } };
            });
        }

        sheet.metadata.modifiedAt = Date.now();

        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    delete(sheetId: string): boolean {
        if (!this._sheets.has(sheetId)) return false;
        this._sheets.delete(sheetId);
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'delete', timestamp: Date.now() });
        this.dispatch('sd:sheet-deleted', { sheetId });
        return true;
    }

    restore(sheet: SheetDefinition): void {
        if (this._sheets.has(sheet.id)) return;
        this._sheets.set(sheet.id, JSON.parse(JSON.stringify(sheet)));
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheet.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('sd:sheet-created', { sheetId: sheet.id });
    }

    // ── Viewport operations (called only by Commands) ─────────────────────────

    addViewport(sheetId: string, viewport: SheetViewport): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        if (sheet.viewports.some(vp => vp.id === viewport.id)) return false;
        sheet.viewports.push(JSON.parse(JSON.stringify(viewport)));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    removeViewport(sheetId: string, viewportId: string): SheetViewport | null {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return null;
        const idx = sheet.viewports.findIndex(vp => vp.id === viewportId);
        if (idx === -1) return null;
        const [removed] = sheet.viewports.splice(idx, 1);
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return JSON.parse(JSON.stringify(removed));
    }

    moveViewport(sheetId: string, viewportId: string, position: { x: number; y: number }): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        const vp = sheet.viewports.find(v => v.id === viewportId);
        if (!vp) return false;
        vp.position = { ...position };
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    updateViewportScale(sheetId: string, viewportId: string, scale: number): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        const vp = sheet.viewports.find(v => v.id === viewportId);
        if (!vp) return false;
        vp.scale = scale;
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    // ── Revision operations (called only by Commands) ─────────────────────────

    addRevision(sheetId: string, entry: RevisionEntry): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        if (!sheet.revisions) sheet.revisions = [];
        sheet.revisions.push(JSON.parse(JSON.stringify(entry)));
        // Keep the legacy `revision` string in sync with the latest entry code
        sheet.revision = entry.code;
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    removeRevision(sheetId: string, revisionId: string): RevisionEntry | null {
        const sheet = this._sheets.get(sheetId);
        if (!sheet || !sheet.revisions) return null;
        const idx = sheet.revisions.findIndex(r => r.id === revisionId);
        if (idx === -1) return null;
        const [removed] = sheet.revisions.splice(idx, 1);
        // Re-sync the legacy string to the new last revision
        const last = sheet.revisions[sheet.revisions.length - 1];
        sheet.revision = last?.code ?? '';
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return JSON.parse(JSON.stringify(removed));
    }

    // ── SC-4: Layout Rule operations (called only by Commands) ────────────────

    setLayoutRules(sheetId: string, rules: LayoutRule[]): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        sheet.layoutRules = JSON.parse(JSON.stringify(rules));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    setPaperSize(sheetId: string, paperSize: PaperSize): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        sheet.paperSize = paperSize;
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    // ── SC-5: Data Panel operations (called only by Commands) ─────────────────

    addDataPanel(sheetId: string, panel: DataPanel): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        if (!sheet.dataPanels) sheet.dataPanels = [];
        if (sheet.dataPanels.some(p => p.id === panel.id)) return false;
        sheet.dataPanels.push(JSON.parse(JSON.stringify(panel)));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    updateDataPanel(sheetId: string, panelId: string, patch: Partial<Omit<DataPanel, 'id'>>): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet || !sheet.dataPanels) return false;
        const panel = sheet.dataPanels.find(p => p.id === panelId);
        if (!panel) return false;
        Object.assign(panel, JSON.parse(JSON.stringify(patch)));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    removeDataPanel(sheetId: string, panelId: string): DataPanel | null {
        const sheet = this._sheets.get(sheetId);
        if (!sheet || !sheet.dataPanels) return null;
        const idx = sheet.dataPanels.findIndex(p => p.id === panelId);
        if (idx === -1) return null;
        const [removed] = sheet.dataPanels.splice(idx, 1);
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return JSON.parse(JSON.stringify(removed));
    }

    setAnnotationLayers(sheetId: string, layers: AnnotationLayer[]): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        sheet.annotationLayers = JSON.parse(JSON.stringify(layers));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    // ── SC-6: Output Config operations (called only by Commands) ──────────────

    setOutputConfigs(sheetId: string, configs: OutputConfig[]): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        sheet.outputConfigs = JSON.parse(JSON.stringify(configs));
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    // ── SC-7: Composition Intent (called only by Commands) ────────────────────

    setCompositionIntent(sheetId: string, intent: string): boolean {
        const sheet = this._sheets.get(sheetId);
        if (!sheet) return false;
        sheet.compositionIntent = intent;
        sheet.metadata.modifiedAt = Date.now();
        storeEventBus.emit({ elementType: 'sheet-definition', elementId: sheetId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sd:sheet-updated', { sheetId });
        return true;
    }

    // ── Persistence API ───────────────────────────────────────────────────────

    serialize(): SheetDefinitionStoreSnapshot {
        return {
            version: 1,
            sheets:  [...this._sheets.values()].map(s => JSON.parse(JSON.stringify(s))),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as SheetDefinitionStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.sheets)) return;

        this._sheets.clear();
        for (const raw of snapshot.sheets) {
            if (!raw?.id || !raw?.name) continue;

            // Phase S1 migration: if raw data has no viewports[], derive from viewIds[]
            if (!raw.viewports) {
                raw.viewports = Array.isArray((raw as any).viewIds)
                    ? ((raw as any).viewIds as string[]).map((viewId: string) => ({
                          id:       `vp-${crypto.randomUUID()}`,
                          viewId,
                          position: { x: 0, y: 0 },
                      }))
                    : [];
            }

            this._sheets.set(raw.id, raw);
        }
        this.dispatch('sd:store-loaded', {});
    }

    reset(): void {
        this._sheets.clear();
        this.dispatch('sd:store-reset', {});
    }
}

export const sheetStore = new SheetStoreImpl();
export type { SheetStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'sheetStore',
    clear: () => sheetStore.reset(),
});

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry.
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('sheet', sheetStore as unknown as import('../StoreRegistry').BimStore);
