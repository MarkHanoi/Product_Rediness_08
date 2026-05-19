import type { BuildingData, LevelData, UnitData } from '@pryzm/core-app-model';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DialogOpts {
    title: string;
    fields: Array<{
        key: string;
        label: string;
        type: 'text' | 'select';
        required?: boolean;
        placeholder?: string;
        options?: Array<{ value: string; label: string }>;
    }>;
    onConfirm: (values: Record<string, string>) => void;
}

export interface HierarchyTreeActionHost {
    dialogEl: HTMLElement | null;
    expandAndRefresh(nodeId: string): void;
}

// ── Dialog helpers ─────────────────────────────────────────────────────────

export function closeDialog(host: HierarchyTreeActionHost): void {
    if (host.dialogEl) {
        host.dialogEl.remove();
        host.dialogEl = null;
    }
}

export function showDialog(host: HierarchyTreeActionHost, opts: DialogOpts): void {
    closeDialog(host);

    const overlay = document.createElement('div');
    overlay.className = 'dw-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dw-dialog';

    const title = document.createElement('div');
    title.className = 'dw-dialog-title';
    title.textContent = opts.title;
    dialog.appendChild(title);

    const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};

    for (const field of opts.fields) {
        const group = document.createElement('div');
        group.className = 'dw-dialog-group';

        const label = document.createElement('label');
        label.className = 'dw-dialog-label';
        label.textContent = field.label + (field.required ? ' *' : '');
        group.appendChild(label);

        if (field.type === 'select' && field.options) {
            const select = document.createElement('select');
            select.className = 'dw-dialog-select';
            for (const opt of field.options) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            }
            inputs[field.key] = select;
            group.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.className = 'dw-dialog-input';
            input.type = 'text';
            input.placeholder = field.placeholder ?? '';
            input.required = field.required ?? false;
            inputs[field.key] = input;
            group.appendChild(input);
        }

        dialog.appendChild(group);
    }

    const actions = document.createElement('div');
    actions.className = 'dw-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dw-dialog-btn dw-dialog-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeDialog(host));

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dw-dialog-btn dw-dialog-btn--primary';
    confirmBtn.textContent = 'Create';
    confirmBtn.addEventListener('click', () => {
        const values: Record<string, string> = {};
        for (const [key, el] of Object.entries(inputs)) {
            values[key] = el.value.trim();
        }

        for (const field of opts.fields) {
            if (field.required && !values[field.key]) {
                (inputs[field.key] as HTMLElement).style.borderColor = '#E24B4A';
                return;
            }
        }

        closeDialog(host);
        opts.onConfirm(values);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(host); });

    document.body.appendChild(overlay);
    host.dialogEl = overlay;

    const firstInput = dialog.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);

    dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn.click(); });
}

export function showAlert(msg: string): void {
    const overlay = document.createElement('div');
    overlay.className = 'dw-dialog-overlay';
    overlay.innerHTML = `
        <div class="dw-dialog">
            <div class="dw-dialog-title">Notice</div>
            <div style="font-size:13px;color:var(--app-text,#1a2035);margin-bottom:16px;">${msg}</div>
            <div class="dw-dialog-actions">
                <button class="dw-dialog-btn dw-dialog-btn--primary" id="dw-alert-ok">OK</button>
            </div>
        </div>
    `;
    (overlay.querySelector('#dw-alert-ok') as HTMLButtonElement).addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ── Add actions ────────────────────────────────────────────────────────────

export function addSite(host: HierarchyTreeActionHost): void {
    showDialog(host, {
        title: 'New Site',
        fields: [
            { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Site A' },
            { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. SITE-A' },
            { key: 'address', label: 'Address', type: 'text', placeholder: 'Optional' },
        ],
        onConfirm: async (values) => {
            const id = crypto.randomUUID();
            await (window as any).runtime?.bus?.executeCommand('hierarchy.createSite', { id, name: values.name, code: values.code, address: values.address });
            host.expandAndRefresh(id);
        },
    });
}

export function addBuilding(host: HierarchyTreeActionHost): void {
    const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
    const sites = hs?.getSites() ?? [];
    if (sites.length === 0) {
        showAlert('Create a site first before adding a building.');
        return;
    }

    showDialog(host, {
        title: 'New Building',
        fields: [
            { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Building 1' },
            { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. BLD-A' },
            {
                key: 'siteId', label: 'Site', type: 'select', required: true,
                options: sites.map((s: any) => ({ value: s.id, label: s.name })),
            },
        ],
        onConfirm: async (values) => {
            const id = crypto.randomUUID();
            await (window as any).runtime?.bus?.executeCommand('hierarchy.createBuilding', { id, siteId: values.siteId, name: values.name, code: values.code });
            host.expandAndRefresh(id);
        },
    });
}

export function addLevel(host: HierarchyTreeActionHost): void {
    const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
    const bm = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
    const buildings: BuildingData[] = hs?.getBuildings() ?? [];
    const bimLevels: any[] = bm?.getLevels() ?? [];

    if (buildings.length === 0) {
        showAlert('Create a building first before adding a level.');
        return;
    }
    if (bimLevels.length === 0) {
        showAlert('No BIM levels found. Add levels using the Level Manager first.');
        return;
    }

    const allHierarchyLevels: LevelData[] = hs?.getLevels() ?? [];
    const usedBimIds = new Set(allHierarchyLevels.map((l: LevelData) => l.bimLevelId));
    const availableBimLevels = bimLevels.filter((l: any) => !usedBimIds.has(l.id));

    showDialog(host, {
        title: 'New Level',
        fields: [
            { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Ground Floor' },
            { key: 'code', label: 'Level No.', type: 'text', placeholder: 'e.g. G, 01, B1' },
            {
                key: 'buildingId', label: 'Building', type: 'select', required: true,
                options: buildings.map((b: BuildingData) => ({ value: b.id, label: b.name })),
            },
            {
                key: 'bimLevelId', label: 'BIM Level', type: 'select', required: true,
                options: availableBimLevels.length > 0
                    ? availableBimLevels.map((l: any) => ({ value: l.id, label: l.name ?? l.id }))
                    : bimLevels.map((l: any) => ({ value: l.id, label: l.name ?? l.id })),
            },
        ],
        onConfirm: async (values) => {
            const id = crypto.randomUUID();
            await (window as any).runtime?.bus?.executeCommand('hierarchy.createLevel', {
                id,
                buildingId: values.buildingId,
                bimLevelId: values.bimLevelId,
                name: values.name,
                levelNumber: values.code,
            });
            host.expandAndRefresh(id);
        },
    });
}

export function addUnit(host: HierarchyTreeActionHost): void {
    const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
    const levels: LevelData[] = hs?.getLevels() ?? [];

    if (levels.length === 0) {
        showAlert('Create a level first before adding a unit.');
        return;
    }

    showDialog(host, {
        title: 'New Unit',
        fields: [
            { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Unit 1A' },
            { key: 'unitNumber', label: 'Unit No.', type: 'text', placeholder: 'e.g. Apt 1A, Ward 4' },
            { key: 'unitType', label: 'Type', type: 'text', placeholder: 'e.g. apartment-1bed, ward' },
            {
                key: 'levelId', label: 'Level', type: 'select', required: true,
                options: levels.map((l: LevelData) => ({ value: l.id, label: l.name })),
            },
        ],
        onConfirm: async (values) => {
            const id = crypto.randomUUID();
            await (window as any).runtime?.bus?.executeCommand('hierarchy.createUnit', {
                id,
                levelId: values.levelId,
                name: values.name,
                unitNumber: values.unitNumber,
                unitType: values.unitType,
            });
            host.expandAndRefresh(id);
        },
    });
}

// ── Room helpers ────────────────────────────────────────────────────────────

export function getRoomsForUnit(unitId: string): any[] {
    const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    if (!rs) return [];
    try {
        return rs.getAll().filter((r: any) => r.unitId === unitId);
    } catch { return []; }
}

export function getUnassignedRooms(bimLevelId: string): any[] {
    const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    if (!rs) return [];
    try {
        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const levels: LevelData[] = hs?.getLevels() ?? [];
        const hierarchyLevel = levels.find((l: LevelData) => l.bimLevelId === bimLevelId || l.id === bimLevelId);
        if (!hierarchyLevel) {
            return rs.getAll().filter((r: any) => r.levelId === bimLevelId && !r.unitId);
        }
        const units: UnitData[] = hs?.getUnits(hierarchyLevel.id) ?? [];
        const unitIds = new Set(units.map((u: UnitData) => u.id));
        return rs.getAll().filter((r: any) =>
            r.levelId === hierarchyLevel.bimLevelId &&
            (!r.unitId || !unitIds.has(r.unitId))
        );
    } catch { return []; }
}
