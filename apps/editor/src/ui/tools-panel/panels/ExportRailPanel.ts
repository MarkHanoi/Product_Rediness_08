/**
 * ExportRailPanel — Export & Import tools for the right tools rail.
 *
 * Created in Phase 2 (PRYZM-UI-GRAND-PLAN-2026) as part of separating
 * Export from the old EditRailPanel. The EDIT section was removed from
 * the right rail; edit actions moved to ContextualEditBar.
 *
 * Provides: Import PDF/Image, Export IFC, Export GLB (Cesium).
 * GLB export preserves the full H5-FIX server-side auth gate per §07 §3.
 *
 * Contract compliance:
 *   §05 §9     — New UI file under src/ui/
 *   §05 §6     — Zero bim-* elements; pure native HTML buttons
 *   §01 §2     — All mutations via service methods; no direct store writes
 *   §05 §7.6   — No independent <style> injection
 *   H5-FIX     — GLB export auth gate preserved verbatim from EditRailPanel
 */

import { apiFetch } from '@pryzm/core-app-model';
import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps } from '../ToolsPanelTypes';
import * as PryzmIcons from '../../icons/PryzmIcons';
import { getImportedIfcElementCount } from '@pryzm/file-format';

interface ExportAction {
    id:      string;
    label:   string;
    icon:    string;
    variant: 'default' | 'primary' | 'success';
    action:  () => void | Promise<void>;
}

export class ExportRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ToolsPanelProps,
        _rail: ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'tpr-edit-root';

        const actions = this._getActions();
        const groups = [
            {
                label: 'Import',
                items: actions.filter(a => ['import-revit-guided', 'import-rhino', 'import-ifc', 'import-pdf-image', 'import-dxf-dwg', 'import-manager'].includes(a.id)),
            },
            {
                label: 'Export',
                items: actions.filter(a => ['export-ifc-revit', 'export-ifc-native', 'export-ifc-with-imported', 'export-dxf', 'export-glb'].includes(a.id)),
            },
        ];

        for (const { label, items } of groups) {
            const group = document.createElement('div');
            group.className = 'tpr-edit-group';

            const groupLabel = document.createElement('div');
            groupLabel.className = 'tpr-edit-group-label';
            groupLabel.textContent = label;
            group.appendChild(groupLabel);

            for (const action of items) {
                group.appendChild(this._buildBtn(action));
            }

            root.appendChild(group);
        }

        return root;
    }

    private _getActions(): ExportAction[] {
        const { service } = this._props;

        return [
            {
                id:      'import-revit-guided',
                label:   'Import from Revit',
                icon:    'material-symbols:upload-file',
                variant: 'primary',
                action:  () => window.runtime?.events?.emit('import-revit-guided', {}),
            },
            {
                id:      'import-rhino',
                label:   'Import Rhino (.3DM)',
                icon:    'material-symbols:upload-file',
                variant: 'default',
                action:  () => window.runtime?.events?.emit('import-rhino', {}),
            },
            {
                id:      'import-pdf-image',
                label:   'Import PDF / Image',
                icon:    'material-symbols:upload-file',
                variant: 'default',
                action:  () => this._openImportPanel(),
            },
            {
                id:      'import-dxf-dwg',
                label:   'Import DXF / DWG',
                icon:    'material-symbols:upload-file',
                variant: 'default',
                action:  () => window.runtime?.events?.emit('import-dxf', {}),
            },
            {
                id:      'import-ifc',
                label:   'Import IFC',
                icon:    'material-symbols:upload-file',
                variant: 'default',
                action:  () => service.importIfc(),
            },
            {
                id:      'import-manager',
                label:   'Import Manager',
                icon:    'material-symbols:folder-managed',
                variant: 'primary',
                action:  () => window.runtime?.events?.emit('pryzm-import-manager-toggle', {}), // F.events.13
            },
            {
                id:      'export-ifc-revit',
                label:   'Export for Revit',
                icon:    'material-symbols:export-notes',
                variant: 'primary',
                action:  () => window.runtime?.events?.emit('export-ifc-revit', {}), // F.events.15
            },
            {
                id:      'export-ifc-native',
                label:   'Export IFC (Native)',
                icon:    'material-symbols:export-notes',
                variant: 'primary',
                action:  () => this._exportIfc('native-only'),
            },
            {
                id:      'export-ifc-with-imported',
                label:   'Export IFC (+ Imported)',
                icon:    'material-symbols:export-notes',
                variant: 'default',
                action:  () => this._exportIfc('native-and-imported'),
            },
            {
                id:      'export-dxf',
                label:   'Export DXF',
                icon:    'material-symbols:draft',
                variant: 'default',
                action:  () => this._exportDxf(),
            },
            {
                id:      'export-glb',
                label:   'Export GLB (Cesium)',
                icon:    'material-symbols:file-download',
                // Phase 11: default variant — secondary export, no green
                variant: 'default',
                action:  () => this._exportGlb(),
            },
        ];
    }

    private _exportDxf(): void {
        const dxfService = window.dxfExportService; // TODO(C.3.x): legacy dxfExportService — replace with runtime.exports.dxf service
        if (!dxfService) {
            alert('DXF export service is not ready. Please wait for the application to fully load.');
            return;
        }

        // Try to find the active sheet from the sheet store
        const sheetStore = window.sheetStore; // TODO(F.6.x): legacy sheetStore — replace with runtime.sheets store
        const activeSheetId = window.activeSheetId as string | undefined; // TODO(F.6.x): legacy activeSheetId — replace with runtime.sheets.activeId

        if (activeSheetId) {
            console.log(`[ExportRailPanel] Exporting active sheet as DXF: ${activeSheetId}`);
            dxfService.exportSheet(activeSheetId);
            return;
        }

        // Fall back to listing all sheets and picking the first
        const allSheets: any[] = sheetStore
            ? (typeof sheetStore.getAll === 'function' ? sheetStore.getAll() : [])
            : [];

        if (allSheets.length === 0) {
            alert('No sheets found. Please create a sheet in Views & Sheets before exporting DXF.');
            return;
        }

        if (allSheets.length === 1) {
            console.log(`[ExportRailPanel] Exporting only sheet as DXF: ${allSheets[0].id}`);
            dxfService.exportSheet(allSheets[0].id);
            return;
        }

        // Multiple sheets — show a simple picker via a custom event so the Sheet Editor can handle it
        window.runtime?.events?.emit('pryzm-export-dxf-pick', { sheets: allSheets }); // F.events.15
        // As a fallback, export the first sheet
        console.log(`[ExportRailPanel] Multiple sheets found — exporting first: ${allSheets[0].id}`);
        dxfService.exportSheet(allSheets[0].id);
    }

    private _openImportPanel(): void {
        const toggle = window.toggleFloorPlanPanel; // TODO(F.6.5): legacy toggleFloorPlanPanel — replace with runtime.plugins.contributions('panel.toggle')
        if (typeof toggle === 'function') {
            toggle();
        } else {
            console.warn('[ExportRailPanel] toggleFloorPlanPanel not available yet — Layout not fully initialised.');
        }
    }

    private _exportIfc(exportScope: 'native-only' | 'native-and-imported'): void {
        if (exportScope === 'native-and-imported' && getImportedIfcElementCount() === 0) {
            alert('No imported IFC elements are currently loaded. Exporting native elements only.');
            this._props.service.exportIfc({ exportScope: 'native-only' });
            return;
        }
        this._props.service.exportIfc({ exportScope });
    }

    private _buildBtn(action: ExportAction): HTMLElement {
        const btn = document.createElement('button');
        btn.className = `tpr-edit-btn tpr-edit-btn--${action.variant}`;
        btn.type = 'button';
        btn.title = action.label;

        const iconEl = PryzmIcons.iconEl(action.icon, 'tpr-edit-btn-icon', 16);

        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-edit-btn-label';
        labelEl.textContent = action.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);

        btn.addEventListener('click', () => {
            console.log(`[ExportRailPanel] Action: ${action.id}`);
            action.action();
        });

        return btn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GLB export — H5-FIX: server-side auth gate (07-BIM-SECURITY-CONTRACT §3)
    // ─────────────────────────────────────────────────────────────────────────

    private async _exportGlb(): Promise<void> {
        try {
            const authRes = await apiFetch('/api/export/authorize?type=glb');

            if (authRes.status === 403) {
                const body = await authRes.json().catch(() => ({}));
                console.warn('[ExportRailPanel] Server denied GLB export:', (body as any).reason ?? 'plan not authorized');
                window.runtime?.events?.emit('pryzm-upgrade-required', { // F.events.12
                    feature: 'GLB_EXPORT',
                    reason:  (body as any).reason,
                    plan:    (body as any).plan,
                });
                return;
            }

            if (!authRes.ok && import.meta.env.PROD) {
                console.warn('[ExportRailPanel] Auth endpoint error in production — export blocked.');
                return;
            }
        } catch (err) {
            if (import.meta.env.PROD) {
                console.warn('[ExportRailPanel] Auth endpoint unreachable in production — export blocked:', err);
                return;
            }
            console.warn('[ExportRailPanel] Auth endpoint unreachable (dev mode), proceeding:', err);
        }

        const { exportFragmentsToGLB } = await import('@pryzm/file-format');
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        if (bimManager?.scene) {
            exportFragmentsToGLB(bimManager.scene);
        }
    }
}
