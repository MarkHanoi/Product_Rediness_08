import { iconFromName, iconEl as _iconEl } from './icons/PryzmIcons';
import type { IfcElementRecord, IfcModelData } from '@pryzm/file-format';

const EYE_ON  = iconFromName('material-symbols:visibility',     16);
const EYE_OFF = iconFromName('material-symbols:visibility-off', 16);

export function createSpatialTree(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime createSpatialTree */) {
    void runtime; /* B-runtime-void createSpatialTree — TODO(C.3.x): consume once runtime.persistence is wired — Phase C.3.x */
    const container = document.createElement('div');
    container.id = 'spatial-tree-container';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: var(--app-panel-bg);
        overflow-y: auto;
        padding: 10px;
        font-family: var(--app-font);
        pointer-events: auto;
        user-select: none;
        position: relative;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; margin-bottom: 15px; font-size: 14px; border-bottom: 1px solid var(--app-border-light); padding-bottom: 5px; color: var(--app-text); font-family: var(--app-font);';
    title.textContent = 'Spatial Structure';
    container.appendChild(title);

    const treeContent = document.createElement('div');
    container.appendChild(treeContent);

    // ✅ CORRECTED: Uses your system's actual key (obj.userData.id)
    function setElementVisibility(id: string, visible: boolean) {
        const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        if (!scene) return;

        scene.traverse((obj: any) => {
            if (obj.userData?.id === id) {
                obj.visible = visible;
            }
        });
    }

    function setGroupVisibilityByModel(modelId: string, visible: boolean) {
        const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (obj.userData?.modelId === modelId && obj.userData?.source === 'ifc-import') {
                obj.visible = visible;
            }
        });
    }

    function setGroupVisibilityByStorey(modelId: string, storeyName: string, visible: boolean) {
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (!store) return;
        const model: IfcModelData | undefined = store.getModel(modelId);
        if (!model) return;
        const ids = new Set(
            model.elements
                .filter((e: IfcElementRecord) => e.storeyName === storeyName)
                .map((e: IfcElementRecord) => e.id)
        );
        const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (ids.has(obj.userData?.id)) obj.visible = visible;
        });
    }

    function setGroupVisibilityByType(modelId: string, storeyName: string, typeName: string, visible: boolean) {
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (!store) return;
        const model: IfcModelData | undefined = store.getModel(modelId);
        if (!model) return;
        const ids = new Set(
            model.elements
                .filter((e: IfcElementRecord) => e.storeyName === storeyName && e.ifcTypeName === typeName)
                .map((e: IfcElementRecord) => e.id)
        );
        const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (ids.has(obj.userData?.id)) obj.visible = visible;
        });
    }

    const refreshTree = () => {
        console.log("Refreshing Spatial Tree...");
        treeContent.innerHTML = '';
        const bimManager = window.bimManager; // TODO(D.4): replace via EngineBootstrap split — bimManager destroyed in D.4 — Phase D.4
        if (!bimManager) {
            console.error("bimManager not found on window");
            return;
        }

        // Get wallStore reference once
        const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S

        const elementStores = [
            window.wallStore, // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            window.slabStore, // TODO(E.slab.S): replace with runtime.stores.slab — Phase E.slab.S
            window.columnStore, // TODO(E.column.S): replace with runtime.stores.column — Phase E.column.S
            window.beamStore, // TODO(E.beam.S): replace with runtime.stores.beam — Phase E.beam.S
            window.stairStore, // TODO(E.stair.S): replace with runtime.stores.stair — Phase E.stair.S
            window.curtainWallStore, // TODO(E.curtain-wall.S): replace with runtime.stores.curtainWall — Phase E.curtain-wall.S
            window.plumbingStore, // TODO(E.plumbing.S): replace with runtime.stores.plumbing — Phase E.plumbing.S
            window.furnitureStore // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
        ];

        const levels = bimManager.getLevels().sort((a: any, b: any) => b.elevation - a.elevation);

        const buildingNode = createTreeNode('Building', 'material-symbols:apartment');
        treeContent.appendChild(buildingNode.element);

        levels.forEach((level: any) => {
            const levelNode = createTreeNode(`Level: ${level.name} (${level.elevation}m)`, 'material-symbols:layers', buildingNode.childrenContainer);

            // Visibility toggle for level
            const toggle = document.createElement('button');
            toggle.innerHTML = EYE_ON;
            toggle.style.cssText = 'margin-left: auto; border: none; background: none; cursor: pointer; padding: 2px; display: flex; align-items: center;';

            let levelVisible = true;

            toggle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                levelVisible = !levelVisible;
                toggle.innerHTML = levelVisible ? EYE_ON : EYE_OFF;

                const scene = window.selectionManager?.world?.scene?.three; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                if (!scene) return;

                // ✅ REVERTED: Uses your working level matching
                scene.traverse((obj: any) => {
                    if (obj.userData?.levelId === level.id) {
                        obj.visible = levelVisible;
                    }
                });
            };

            levelNode.header.appendChild(toggle);

            // Group elements from all stores
            const allElements: any[] = [];

            elementStores.forEach(store => {
                if (store && store.getAll) {
                    // Keep string conversion for filtering (this is data layer, not scene)
                    allElements.push(
                        ...store.getAll().filter((el: any) => String(el.levelId) === String(level.id))
                    );
                }
            });

            const types = [...new Set(allElements.map((el: any) => el.type || el.elementType))];

            types.forEach(type => {
                if (!type) return;
                const typeElements = allElements.filter((el: any) => (el.type || el.elementType) === type);
                const typeNode = createTreeNode(`${type}s (${typeElements.length})`, 'material-symbols:category', levelNode.childrenContainer);

                typeElements.forEach((el: any) => {

                    // WALL NODE
                    const elNode = createTreeNode(
                        el.name || `${type} ${el.id.substring(0,4)}`,
                        'material-symbols:view_in_ar',
                        typeNode.childrenContainer
                    );

                    elNode.header.onclick = (e) => {
                        e.stopPropagation();
                        window.selectionManager?.selectByID(el.id); // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    };

                    // WALL VISIBILITY TOGGLE
                    const elToggle = document.createElement('button');
                    elToggle.innerHTML = EYE_ON;
                    elToggle.style.cssText =
                        'margin-left: auto; border: none; background: none; cursor: pointer; padding: 2px; display: flex; align-items: center;';

                    let elVisible = true;

                    elToggle.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        elVisible = !elVisible;
                        elToggle.innerHTML = elVisible ? EYE_ON : EYE_OFF;

                        setElementVisibility(el.id, elVisible);

                        // cascade to children
                        el.childrenIds?.forEach((childId: string) => {
                            setElementVisibility(childId, elVisible);
                        });
                    };

                    elNode.header.appendChild(elToggle);

                    // ADD HOSTED WINDOWS & DOORS
                    el.childrenIds?.forEach((childId: string) => {

                        const child =
                            wallStore?.getWindow(childId) ||
                            wallStore?.getDoor(childId);

                        if (!child) return;

                        const icon =
                            child.type === 'window'
                                ? 'material-symbols:window'
                                : 'material-symbols:door_front';

                        const childNode = createTreeNode(
                            `${child.type.toUpperCase()} ${child.properties?.mark || child.id.substring(0,4)}`,
                            icon,
                            elNode.childrenContainer
                        );

                        childNode.header.onclick = (e) => {
                            e.stopPropagation();
                            window.selectionManager?.selectByID(child.id); // TODO(D.13): replace with runtime.picking.select — Phase D.13
                        };

                        // CHILD VISIBILITY TOGGLE
                        const childToggle = document.createElement('button');
                        childToggle.innerHTML = EYE_ON;
                        childToggle.style.cssText =
                            'margin-left: auto; border: none; background: none; cursor: pointer; padding: 2px; display: flex; align-items: center;';

                        let childVisible = true;

                        childToggle.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            childVisible = !childVisible;
                            childToggle.innerHTML = childVisible ? EYE_ON : EYE_OFF;

                            setElementVisibility(child.id, childVisible);
                        };

                        childNode.header.appendChild(childToggle);
                    });
                });
            });
        });

        // ── IFC Imported Models Section ──────────────────────────────────────
        renderIfcSection();
    };

    function renderIfcSection() {
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (!store || store.size === 0) return;

        const models: IfcModelData[] = store.getAll();
        if (models.length === 0) return;

        const ifcSectionHeader = document.createElement('div');
        ifcSectionHeader.style.cssText = [
            'font-weight: bold', 'margin-top: 14px', 'margin-bottom: 6px',
            'font-size: 13px', 'padding: 4px 0',
            'border-top: 1px solid var(--app-border-light)',
            'color: var(--app-text)', 'font-family: var(--app-font)',
        ].join(';');
        ifcSectionHeader.textContent = 'IFC Models';
        treeContent.appendChild(ifcSectionHeader);

        for (const model of models) {
            renderIfcModel(model);
        }
    }

    function renderIfcModel(model: IfcModelData) {
        const modelNode = createTreeNode(model.modelName, 'material-symbols:archive');
        treeContent.appendChild(modelNode.element);

        // Model-level visibility toggle
        const modelToggle = makeEyeToggle(
            (visible) => setGroupVisibilityByModel(model.modelId, visible)
        );
        modelNode.header.appendChild(modelToggle);

        // Group by storey
        for (const storeyName of model.storeyOrder) {
            const storeyElements = model.elements.filter(e => e.storeyName === storeyName);
            if (storeyElements.length === 0) continue;

            const storeyNode = createTreeNode(
                `${storeyName} (${storeyElements.length})`,
                'material-symbols:layers',
                modelNode.childrenContainer
            );

            const storeyToggle = makeEyeToggle(
                (visible) => setGroupVisibilityByStorey(model.modelId, storeyName, visible)
            );
            storeyNode.header.appendChild(storeyToggle);

            // Group by IFC type within storey
            const typeNames = [...new Set(storeyElements.map(e => e.ifcTypeName))].sort();

            for (const typeName of typeNames) {
                const typeElements = storeyElements.filter(e => e.ifcTypeName === typeName);

                const icon = ifcTypeIcon(typeName);
                const typeNode = createTreeNode(
                    `${typeName}s (${typeElements.length})`,
                    icon,
                    storeyNode.childrenContainer
                );

                const typeToggle = makeEyeToggle(
                    (visible) => setGroupVisibilityByType(model.modelId, storeyName, typeName, visible)
                );
                typeNode.header.appendChild(typeToggle);

                // Individual elements
                for (const el of typeElements) {
                    const elNode = createTreeNode(
                        el.name,
                        'material-symbols:view_in_ar',
                        typeNode.childrenContainer
                    );

                    elNode.header.onclick = (e) => {
                        e.stopPropagation();
                        const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                        if (sm?.selectById) {
                            sm.selectById(el.id);
                        } else if (sm?.selectByID) {
                            sm.selectByID(el.id);
                        }
                    };

                    const elToggle = makeEyeToggle(
                        (visible) => setElementVisibility(el.id, visible)
                    );
                    elNode.header.appendChild(elToggle);
                }
            }
        }
    }

    function makeEyeToggle(onToggle: (visible: boolean) => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerHTML = EYE_ON;
        btn.style.cssText = 'margin-left: auto; border: none; background: none; cursor: pointer; padding: 2px; display: flex; align-items: center; flex-shrink: 0;';
        let visible = true;
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            visible = !visible;
            btn.innerHTML = visible ? EYE_ON : EYE_OFF;
            onToggle(visible);
        };
        return btn;
    }

    function ifcTypeIcon(typeName: string): string {
        const map: Record<string, string> = {
            'Wall':       'material-symbols:square',
            'Slab':       'material-symbols:layers',
            'Door':       'material-symbols:door_front',
            'Window':     'material-symbols:window',
            'Column':     'material-symbols:view_column',
            'Beam':       'material-symbols:horizontal_rule',
            'Stair':      'material-symbols:stairs',
            'Stair Flight': 'material-symbols:stairs',
            'Roof':       'material-symbols:roofing',
            'Furniture':  'material-symbols:chair',
            'Space':      'material-symbols:space_dashboard',
            'Member':     'material-symbols:anchor',
            'Plate':      'material-symbols:grid_on',
            'Railing':    'material-symbols:fence',
            'Covering':   'material-symbols:texture',
        };
        return map[typeName] ?? 'material-symbols:category';
    }

    function createTreeNode(label: string, icon: string, parent?: HTMLElement) {
        const item = document.createElement('div');
        item.style.cssText = 'margin-bottom: 2px;';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; padding: 4px; cursor: pointer; border-radius: 4px; font-size: 12px; transition: background 0.2s; color: var(--app-text); font-family: var(--app-font);';
        header.onmouseenter = () => header.style.background = '#f7f9ff';
        header.onmouseleave = () => header.style.background = 'transparent';

        const iconEl = _iconEl(icon, '', 14);
        iconEl.style.marginRight = '6px';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.flex = '1';
        labelEl.style.whiteSpace = 'nowrap';
        labelEl.style.overflow = 'hidden';
        labelEl.style.textOverflow = 'ellipsis';

        header.appendChild(iconEl);
        header.appendChild(labelEl);
        item.appendChild(header);

        const children = document.createElement('div');
        children.style.cssText = 'margin-left: 12px; display: block; border-left: 1px solid var(--app-border-light); padding-left: 4px;';
        item.appendChild(children);

        header.onclick = () => {
            children.style.display = children.style.display === 'none' ? 'block' : 'none';
        };

        if (parent) parent.appendChild(item);
        return { element: item, header, childrenContainer: children };
    }

    window.runtime?.events?.on('model-updated', () => refreshTree()); // F.events.8
    window.addEventListener('bim-level-added', refreshTree);
    window.addEventListener('bim-level-removed', refreshTree);

    // IFC model imported or removed → refresh the IFC section of the tree
    window.addEventListener('pryzm-ifc-tree-updated', refreshTree);
    window.runtime?.events?.on('pryzm-import-model-remove', (p: { modelId: string }) => { // F.events.13
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (store && p.modelId) store.remove(p.modelId);
        refreshTree();
    });

    setTimeout(refreshTree, 500);

    return container;
}
