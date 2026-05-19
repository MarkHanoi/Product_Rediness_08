import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';

/**
 * Sets up the OBC Viewpoints component, BUI viewpoints table, BUI views table,
 * and registers the default viewpoint.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function initViewpointsPanel(params: { components: any; world: any }): {
    viewpoints: any;
    viewpointsTable: any;
    viewsTable: any;
    createViewpoint: () => Promise<void>;
    updateViewpointsTable: () => void;
    updateViewsTable: () => void;
} {
    const { components, world } = params;

    const viewpoints = components.get(OBC.Viewpoints);
    viewpoints.world = world;
    window.obcViewpoints = viewpoints;

    const updateViewpointsTable = () => window.runtime?.events?.emit('update-viewpoints', {}); // F.events.10
    const updateViewsTable      = () => window.runtime?.events?.emit('update-views', {}); // F.events.10

    const createViewpoint = async () => {
        const viewpoint = viewpoints.create();
        viewpoint.title = "New Viewpoint";
        await viewpoint.updateCamera();
        updateViewpointsTable();
    };

    const viewpointsTableTemplate = () => {
        const onCreated = (e: Element | undefined) => {
            if (!e) return;
            const table = e as BUI.Table<any>;
            table.headersHidden = true;
            table.noIndentation = true;
            table.columns = [
                { name: "Title", width: "1fr" },
                { name: "Actions", width: "80px" },
            ];
            const updateTable = () => {
                table.data = [...viewpoints.list.values()].map((vp: any) => ({
                    data: { Title: vp.title || "Untitled", Actions: vp.guid },
                }));
            };
            table.dataTransform = {
                Actions: (value) => {
                    const guid = value as string;
                    if (!guid) return BUI.html``;
                    const vp = viewpoints.list.get(guid);
                    if (!vp) return BUI.html``;
                    const onGo = async () => await vp.go();
                    const onRemove = () => { viewpoints.list.delete(guid); updateTable(); };
                    return BUI.html`
                        <div style="display: flex; gap: 8px; padding: 4px; pointer-events: auto; justify-content: flex-end;">
                            <bim-button label-hidden icon="solar:alt-arrow-right-bold" style="min-width: 32px; height: 32px;" @click=${onGo}></bim-button>
                            <bim-button label-hidden icon="material-symbols:delete" style="min-width: 32px; height: 32px;" @click=${onRemove}></bim-button>
                        </div>`;
                },
            };
            updateTable();
            window.runtime?.events?.on('update-viewpoints', updateTable); // F.events.10
            viewpoints.list.onItemSet.add(updateTable);
            viewpoints.list.onItemDeleted.add(updateTable);
        };
        return BUI.html`<bim-table ${BUI.ref(onCreated)} style="flex: 1; min-height: 100px; border: 1px solid #eee; border-radius: 4px; pointer-events: auto;"></bim-table>`;
    };

    const viewsTableTemplate = () => {
        const onCreated = (e: Element | undefined) => {
            if (!e) return;
            const table = e as BUI.Table<any>;
            table.headersHidden = true;
            table.noIndentation = true;
            table.columns = [
                { name: "Title", width: "1fr" },
                { name: "Actions", width: "60px" },
            ];
            const updateTable = () => {
                const viewsList = components.get(OBC.Views);
                table.data = [...viewsList.list.values()].map((v: any) => ({
                    data: { Title: v.id || "Untitled", Actions: v.id },
                }));
            };
            table.dataTransform = {
                Title: (value) => {
                    const id = value as string;
                    const onSelect = () => {
                        const viewsList = components.get(OBC.Views);
                        const view = viewsList.list.get(id);
                        if (view) window.runtime?.events?.emit('view-selected', { view, viewId: (id as string) ?? null }); // F.events.8
                    };
                    return BUI.html`<div style="cursor: pointer; padding: 4px; pointer-events: auto;" @click=${onSelect}>${id}</div>`;
                },
                Actions: (value) => {
                    const id = value as string;
                    if (!id) return BUI.html``;
                    const viewsList = components.get(OBC.Views);
                    const view = viewsList.list.get(id);
                    if (!view) return BUI.html``;
                    const onOpen = async () => {
                        const vc = window.viewController;
                        if (vc) { await vc.activate(id); }
                        else {
                            const nm = window.navManager;
                            if (nm) { await nm.setViewMode(id as any); }
                            else { await viewsList.open(id); }
                        }
                    };
                    const onRemove = () => { viewsList.list.delete(id); updateTable(); };
                    return BUI.html`
                        <div style="display: flex; gap: 4px; padding: 2px; pointer-events: auto; justify-content: flex-end;">
                            <bim-button label-hidden icon="solar:alt-arrow-right-bold" style="min-width: 24px; height: 24px;" @click=${onOpen}></bim-button>
                            <bim-button label-hidden icon="material-symbols:delete" style="min-width: 24px; height: 24px;" @click=${onRemove}></bim-button>
                        </div>`;
                },
            };
            updateTable();
            window.runtime?.events?.on('update-views', updateTable); // F.events.10
            const viewsComponent = components.get(OBC.Views);
            viewsComponent.list.onItemSet.add(updateTable);
            viewsComponent.list.onItemDeleted.add(updateTable);
        };
        return BUI.html`<bim-table ${BUI.ref(onCreated)} style="flex: 1; min-height: 60px; border: 1px solid #eee; border-radius: 4px; pointer-events: auto; font-size: 0.7rem;"></bim-table>`;
    };

    const viewpointsTable = viewpointsTableTemplate();
    const viewsTable      = viewsTableTemplate();

    // Register default viewpoint
    const defaultViewpoint = viewpoints.create();
    defaultViewpoint.title = "Default View";
    (async () => { await defaultViewpoint.updateCamera(); updateViewpointsTable(); })();

    return { viewpoints, viewpointsTable, viewsTable, createViewpoint, updateViewpointsTable, updateViewsTable };
}
