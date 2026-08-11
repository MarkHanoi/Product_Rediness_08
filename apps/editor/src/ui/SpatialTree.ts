import { iconFromName, iconEl as _iconEl } from './icons/PryzmIcons';
import type { IfcElementRecord, IfcModelData } from '@pryzm/file-format';

const EYE_ON  = iconFromName('material-symbols:visibility',     16);
const EYE_OFF = iconFromName('material-symbols:visibility-off', 16);

export function createSpatialTree(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime createSpatialTree */) {
    // ── §P7-INTENT-IS-DOMAIN (2026-08-11) ────────────────────────────────────
    // `runtime` used to be `void`-ed on the next line. It is now CONSUMED: every
    // eye-toggle below states a visibility INTENT on `runtime.visibility.intent`
    // and then asks `runtime.visibility.applyToScene(...)` to project it onto the
    // scene. The panel no longer assigns `obj.visible` itself.
    //
    // What that fixes, beyond the gate:
    //   • The old toggles kept "is this hidden?" in a `let visible = true` inside
    //     a DOM click handler. `refreshTreeNow()` rebuilds every button (fired by
    //     `model-updated`, `bim-level-added/removed`, IFC import), so the button
    //     reset to EYE_ON while the scene node stayed hidden — icon and model
    //     silently disagreed. Intent survives the rebuild; the closure did not.
    //   • Hiding is now per-view. It was previously global to the session.
    //
    // ⚠ HONEST LIMITS — do not read more into this than it says:
    //   • Nothing persists this store to disk yet (`serialize()` has no caller),
    //     so a hide still does NOT survive save/load. The mechanism is now in
    //     place; the document-format wiring is separate, reviewed work.
    //   • These gestures go through the store directly rather than the command
    //     bus, so they are not undoable — identical to the previous behaviour,
    //     which was not undoable either. Nothing regressed; nothing was gained.
    //   • With no runtime (or no active view) the toggles fall back to the direct
    //     scene write, so the panel keeps working in the legacy boot path instead
    //     of silently doing nothing. A dead toggle would be a worse defect than
    //     an unrecorded one.
    const getScene = () => window.selectionManager?.world?.scene?.three ?? null; // TODO(D.13): replace with runtime.picking.select — Phase D.13

    /** Collect the element ids under `root` matching `pred`. READ-ONLY: this
     *  traverses to LEARN which elements a group gesture refers to, and writes
     *  nothing. Group toggles (a level, an IFC model) are expressed as the set of
     *  elements they contain, because element ids are the vocabulary the intent
     *  store speaks. */
    const idsMatching = (pred: (userData: any) => boolean): string[] => {
        const scene = getScene();
        if (!scene) return [];
        const out = new Set<string>();
        scene.traverse((obj: any) => {
            const id = obj.userData?.id;
            if (id === undefined || id === null) return;
            if (pred(obj.userData)) out.add(String(id));
        });
        return [...out];
    };

    /** Express "hide/show these element ids" as INTENT, then ask the runtime to
     *  project that intent onto the scene. The `.visible` write happens inside
     *  `runtime.visibility.applyToScene` — never here.
     *
     *  Returns the number of scene nodes actually re-projected, so a caller can
     *  distinguish "nothing was hidden" from "those ids matched nothing". */
    const setVisibilityByIds = (ids: readonly string[], visible: boolean): number => {
        const vis = runtime?.visibility;
        if (!vis || typeof vis.applyToScene !== 'function' || ids.length === 0) {
            // No runtime → the panel is running outside a composed runtime (legacy
            // boot / storybook). Say so once rather than pretending the click worked.
            if (ids.length) console.warn('[SpatialTree] no runtime.visibility slot — visibility gesture not applied');
            return 0;
        }
        const recorded = visible ? vis.unhide(ids) : vis.hide(ids);
        if (!recorded) {
            // `hide`/`unhide` return false only when there is no view to write to.
            console.warn('[SpatialTree] no active view — visibility gesture discarded');
            return 0;
        }
        return vis.applyToScene(getScene(), ids).matched;
    };

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

    // ── §P7-INTENT-IS-DOMAIN — the five toggles below ─────────────────────────
    // Each used to end in `obj.visible = visible` after a scene sweep. They now
    // state intent and let the runtime project it. The MATCHING logic (which
    // objects does "this storey" mean?) stays here — that is scene-shape
    // knowledge and belongs to the panel. Only the visibility DECISION moved.

    function setElementVisibility(id: string, visible: boolean) {
        setVisibilityByIds([id], visible);
    }

    function setGroupVisibilityByModel(modelId: string, visible: boolean) {
        // The old sweep matched the model's container group too (it carries
        // `modelId` but no `id`). Hiding each contained element by id reaches the
        // same pixels — a group is invisible when everything in it is.
        setVisibilityByIds(
            idsMatching((ud) => ud?.modelId === modelId && ud?.source === 'ifc-import'),
            visible,
        );
    }

    function setGroupVisibilityByStorey(modelId: string, storeyName: string, visible: boolean) {
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (!store) return;
        const model: IfcModelData | undefined = store.getModel(modelId);
        if (!model) return;
        setVisibilityByIds(
            model.elements
                .filter((e: IfcElementRecord) => e.storeyName === storeyName)
                .map((e: IfcElementRecord) => String(e.id)),
            visible,
        );
    }

    function setGroupVisibilityByType(modelId: string, storeyName: string, typeName: string, visible: boolean) {
        const store: any = window.ifcModelStore; // TODO(E.ifc.S): replace with runtime.stores.ifcModel — Phase E.ifc.S
        if (!store) return;
        const model: IfcModelData | undefined = store.getModel(modelId);
        if (!model) return;
        setVisibilityByIds(
            model.elements
                .filter((e: IfcElementRecord) => e.storeyName === storeyName && e.ifcTypeName === typeName)
                .map((e: IfcElementRecord) => String(e.id)),
            visible,
        );
    }

    const refreshTreeNow = () => {
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

                // Level matching is UNCHANGED — still `userData.levelId === level.id`.
                // What changed is that the match now produces an id LIST which is
                // recorded as intent, instead of an in-place `.visible` write.
                //
                // ⚠ One real narrowing, stated rather than hidden: objects that carry
                // `levelId` but NO `userData.id` (instanced aggregate groups) were
                // swept by the old code and are not addressable as element intent.
                // They are handled by ProjectVisibilitySection's §INSTANCED-ISOLATE-FIX
                // path, which still owns aggregates; this panel never had a coherent
                // story for them (it also reset them on every tree refresh).
                setVisibilityByIds(
                    idsMatching((ud) => ud?.levelId === level.id),
                    levelVisible,
                );
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

    // §CLEAR-PROJECT-BATCH (2026-07-02) — coalesce refreshTree calls to ONE per frame.
    // Switching projects runs ClearProjectCommand, which removes 40 levels ONE-BY-ONE;
    // each `bim-level-removed` synchronously fired a full refreshTreeNow() (rebuild the
    // entire tree DOM + `store.getAll()` scan across 8 stores per call) → 40× redundant
    // rebuilds + 40× "Refreshing Spatial Tree..." log lines on the clear path, a
    // measurable cost at 40-storey scale. Coalesce every burst of refresh requests into
    // a single rebuild scheduled on a microtask, so N synchronous store events during a
    // teardown/load collapse to ONE tree rebuild once the burst settles.
    // P3-safe: no rAF here — a microtask, not an animation frame.
    let _refreshScheduled = false;
    const refreshTree = () => {
        if (_refreshScheduled) return;
        _refreshScheduled = true;
        queueMicrotask(() => {
            _refreshScheduled = false;
            try { refreshTreeNow(); } catch (e) { console.warn('[SpatialTree] refresh failed:', e); }
        });
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
