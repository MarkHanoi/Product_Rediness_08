import { DeleteRoomCommand } from '@pryzm/command-registry';
import * as THREE from '@pryzm/renderer-three/three';
import * as PryzmIcons from '../icons/PryzmIcons';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { ActiveLevelHUD } from '../levels/ActiveLevelHUD';
import type { FloorPickerMode } from '../FloorModePicker';
import type { CeilingPickerMode } from '../CeilingModePicker';
import { floorPickerToToolMode, ceilingPickerToToolMode, type PickerInstances } from './ToolsAreaLayout';
import type { UIProps } from '../Layout';
import type { BimService } from '@app/engine/BimService';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
// C17 — Batch Creation Catalogue & Panel Binding. Single source of truth for the
// batch-creation prompts surfaced as `⚡ Batch` leaves (CB-1 additive; CB-8 shared
// prompt strings). Dispatch goes through the documented Path-A sink (C17 §10/§11).
import {
    groupCatalogue,
    dispatchBatchEntry,
    SHIPPED_PHASE,
    type BatchCatalogEntry,
    type BatchDeps,
} from '../create/batchCatalogue';

export function mountCreatePanel(
    props: UIProps,
    service: BimService,
    pickers: PickerInstances,
    runtime: PryzmRuntime | null,
): void {
    const { ceilingModePicker, floorModePicker } = pickers;

    const updateLevelsList = () => {
        // LevelManagerPanel and ActiveLevelHUD now own the level/grid UI.
        // This function retains only the create-panel enable/disable logic
        // so existing tools (wall, slab, column, etc.) continue to gate on hasLevels.
        const levels = props.bimManager.getLevels();

        // Disable/Enable creation tools
        const createContent = document.getElementById('create-content');
        if (createContent) {
            const hasLevels = levels.length > 0;
            const buttons = createContent.querySelectorAll('.create-item-grid-element');
            buttons.forEach((btn: any) => {
                if (hasLevels) {
                    btn.removeAttribute('disabled');
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                } else {
                    btn.setAttribute('disabled', 'true');
                    btn.style.opacity = '0.5';
                    btn.style.pointerEvents = 'none';
                }
            });
        }
    };

    // --- Create Panel Hierarchical Navigation ---
    let createNavigationStack: any[] = [];

    // Subscribe to selection changes to refresh the Create panel (specifically for Opening menu item)
    // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
    window.runtime?.events?.on('bim-selection-changed', () => {
        const createContent = document.getElementById('create-content');
        if (createContent && createContent.style.display !== 'none') {
            renderCreateContent();
        }
    });

    // Persisted type-ID selections — survive picker dismiss and re-open.
    let _selectedCeilingTypeId: string | undefined;
    let _selectedFloorTypeId:   string | undefined;

    const CREATE_CONFIG: any = {
        title: "Discipline",
        items: [
            {
                label: "Architecture",
                icon: PryzmIcons.pryzmArchitecture,
                children: {
                    title: "Architecture Systems",
                    items: [
                        {
                            label: "Wall",
                            icon: PryzmIcons.wall,
                            action: () => {
                                // Skip the large mode-picker panel — activate immediately in
                                // Orthogonal mode so the user can start drawing right away.
                                // The thin WallDrawingHUD bar (L / O / C / S) appears automatically.
                                service.activateWallTool(WallDrawingMode.POLYLINE_ORTHO);
                            }
                        },
                        {
                            label: "Curtain Wall",
                            icon: "material-symbols:grid-view",
                            action: () => {
                                props.toolManager.activateCurtainWall('SINGLE');
                            },
                        },
                        {
                            label: "Door",
                            icon: PryzmIcons.pryzmDoor,
                            action: () => {
                                props.toolManager.activateDoor('single');
                            },
                        },
                        {
                            label: "Window",
                            icon: PryzmIcons.pryzmWindow,
                            action: () => {
                                props.toolManager.activateWindow('single');
                            },
                        },
                        {
                            label: "Stair",
                            icon: PryzmIcons.pryzmStairI,
                            children: {
                                title: "Stair Shapes",
                                items: [
                                    { label: "Straight (I)", icon: "material-symbols:horizontal-rule", action: () => service.activateStairPathTool('I') },
                                    { label: "L-Shape", icon: "material-symbols:corner-left-up", action: () => service.activateStairPathTool('L') },
                                    { label: "U-Shape", icon: "material-symbols:u-turn-left", action: () => service.activateStairPathTool('U') }
                                ]
                            }
                        },
                        {
                            label: "Handrail",
                            icon: PryzmIcons.pryzmHandrail,
                            children: {
                                title: "Handrail Tools",
                                items: [
                                    { label: "Create Handrail", icon: "material-symbols:add", action: () => service.activateHandrailTool() }
                                ]
                            }
                        },
                        {
                            label: "Room",
                            icon: PryzmIcons.pryzmRoom,
                            children: {
                                title: "Room Tools",
                                items: [
                                    {
                                        label: "Detect All Rooms",
                                        icon: "material-symbols:auto-detect-voice",
                                        action: () => {
                                            const rt = window.roomTool; // TODO(E.18-R): legacy roomTool — replace with runtime.tools.activate('room') after rooms plugin scaffold
                                            if (rt) {
                                                rt.activate();
                                            } else {
                                                props.toolManager.activateRoom?.();
                                            }
                                        }
                                    },
                                    {
                                        label: "Detect on Level",
                                        icon: "material-symbols:layers",
                                        action: () => {
                                            const rt = window.roomTool; // TODO(E.18-R): legacy roomTool — replace with runtime.tools.activate('room') after rooms plugin scaffold
                                            const level = props.bimManager.getActiveLevel?.();
                                            if (rt && level) {
                                                rt.detectRoomsForLevel(level.id, level.elevation ?? 0, level.height ?? 3);
                                            } else if (rt) {
                                                rt.activate();
                                            } else {
                                                console.warn('[Room] No active level or roomTool not ready');
                                            }
                                        }
                                    },
                                    {
                                        label: "Clear All Rooms",
                                        icon: "material-symbols:delete-sweep",
                                        action: () => {
                                            const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
                                            if (!rs) return;
                                            const all = rs.getAll();
                                            if (all.length === 0) {
                                                console.log('[Room] No rooms to clear');
                                                return;
                                            }
                                            if (!confirm(`Delete all ${all.length} room(s)?`)) return;
                                            // P6 fix (Wave 14 FILE 3): route through runtime.commandBus.dispatch
                                            all.forEach((r: any) => window.commandManager?.execute(new DeleteRoomCommand(r.id))); // TODO(E.5.x): migrate to runtime.bus.executeCommand once command types registered
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            label: "Ceiling",
                            icon: PryzmIcons.pryzmCeiling,
                            action: () => {
                                const _activateCeiling = (mode: CeilingPickerMode) => {
                                    const tool = window.ceilingTool; // TODO(E.7.T): legacy ceilingTool — replace with runtime.tools.activate('ceiling')
                                    if (tool?.setDrawingMode) tool.setDrawingMode(ceilingPickerToToolMode(mode));
                                    ceilingModePicker.setActiveMode(mode);
                                    service.activateCeilingTool(_selectedCeilingTypeId);
                                };
                                ceilingModePicker.show({
                                    ceilingTypes: ceilingSystemTypeStore.getAll().map(t => ({ id: t.id, name: t.name, totalThickness: t.totalThickness })),
                                    currentTypeId: _selectedCeilingTypeId,
                                    onTypeChange: (id) => {
                                        _selectedCeilingTypeId = id;
                                        window.ceilingTool?.setSystemTypeId?.(id); // TODO(E.7.T): legacy ceilingTool.setSystemTypeId — replace with runtime.tools.configure('ceiling', { systemTypeId })
                                    },
                                    onSelectLinear:    () => _activateCeiling('linear'),
                                    onSelectOrtho:     () => _activateCeiling('ortho'),
                                    onSelectCurved:    () => _activateCeiling('curved'),
                                    onSelectRectangle: () => _activateCeiling('rectangle'),
                                    onSelectAutoRoom:  () => _activateCeiling('auto'),
                                });
                            },
                        },
                        {
                            label: "Floor",
                            icon: PryzmIcons.pryzmFloor,
                            action: () => {
                                const _activateFloor = (mode: FloorPickerMode) => {
                                    const tool = window.floorTool; // TODO(E.6.T): legacy floorTool — replace with runtime.tools.activate('floor')
                                    if (tool?.setDrawingMode) tool.setDrawingMode(floorPickerToToolMode(mode));
                                    floorModePicker.setActiveMode(mode);
                                    service.activateFloorTool(_selectedFloorTypeId);
                                };
                                floorModePicker.show({
                                    floorTypes: floorSystemTypeStore.getAll().map(t => ({ id: t.id, name: t.name, totalThickness: t.totalThickness })),
                                    currentTypeId: _selectedFloorTypeId,
                                    onTypeChange: (id) => {
                                        _selectedFloorTypeId = id;
                                        window.floorTool?.setSystemTypeId?.(id); // TODO(E.6.T): legacy floorTool.setSystemTypeId — replace with runtime.tools.configure('floor', { systemTypeId })
                                    },
                                    onSelectLinear:    () => _activateFloor('linear'),
                                    onSelectOrtho:     () => _activateFloor('ortho'),
                                    onSelectCurved:    () => _activateFloor('curved'),
                                    onSelectRectangle: () => _activateFloor('rectangle'),
                                    onSelectAutoRoom:  () => _activateFloor('auto'),
                                });
                            },
                        }
                    ]
                }
            },
            {
                label: "Structure",
                icon: PryzmIcons.pryzmStructure,
                children: {
                    title: "Structure Systems",
                    items: [
                        { label: "Column", icon: PryzmIcons.pryzmColumn, action: () => props.toolManager.activateColumn() },
                        { label: "Beam", icon: PryzmIcons.pryzmBeam, action: () => props.toolManager.activateBeam() },
                        {
                            label: "Slab",
                            icon: PryzmIcons.pryzmSlab,
                            children: {
                                title: "Slab Modes",
                                items: [
                                    { label: "2-Point", icon: "material-symbols:square", action: () => service.activateSlabTool('2point') },
                                    { label: "Hollow", icon: "material-symbols:tab-unselected", action: () => service.activateSlabTool('hollow') },
                                    { label: "Polyline", icon: "material-symbols:polyline", action: () => service.activateSlabTool('polyline') },
                                    { label: "By Region", icon: "material-symbols:select-all", action: () => service.activateSlabTool('region') },
                                    { label: "Pick Walls", icon: "material-symbols:wall", action: () => service.activateSlabTool('pickWalls') },
                                    {
                                        label: "Opening",
                                        icon: "material-symbols:tab-unselected",
                                        action: () => props.toolManager.activateOpening(),
                                        disabled: () => {
                                            const sel = props.selectionManager.selectedObject;
                                            if (!sel) return true;
                                            const elementType = sel.userData?.elementType;
                                            const isSlab =
                                                elementType === 'SLAB' ||
                                                elementType === 'Slab' ||
                                                elementType === 'slab';
                                            return !isSlab;
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            label: "Roof",
                            icon: PryzmIcons.pryzmRoof,
                            children: {
                                title: "Roof Modes",
                                items: [
                                    { label: "Footprint (2-Point)",         icon: "material-symbols:home",        action: () => service.activateRoofTool('2point') },
                                    { label: "Footprint (Polyline)",        icon: "material-symbols:polyline",    action: () => service.activateRoofTool('polyline') },
                                    { label: "By Region",                   icon: "material-symbols:select-all",  action: () => service.activateRoofTool('region') },
                                    { label: "By Region (Single Slope)",    icon: "material-symbols:trending-up", action: () => service.activateRoofTool('single_slope') }
                                ]
                            }
                        }
                    ]
                }
            },
            {
                label: "Plumbing",
                icon: PryzmIcons.pryzmServices,
                children: {
                    title: "Plumbing Fixtures",
                    items: [
                        { label: "Shower Glass Panel", icon: "material-symbols:Imagesearch-Roller", action: () => service.activateFurnitureTool('shower_glass_panel') },
                        { label: "Bath",   icon: "material-symbols:bathtub", action: () => service.activatePlumbingTool('bath') },
                        { label: "Toilet", icon: "material-symbols:wc",      action: () => service.activatePlumbingTool('toilet') },
                        { label: "Sink",   icon: "material-symbols:wash",    action: () => service.activatePlumbingTool('sink') }
                    ]
                }
            },
            {
                label: "Interior",
                icon: PryzmIcons.pryzmFurniture,
                children: {
                    title: "Interior Elements",
                    items: [
                        {
                            label: "Furniture",
                            icon: PryzmIcons.pryzmFurniture,
                            children: {
                                title: "Furniture Browser",
                                carouselMode: true,
                                items: []
                            }
                        },
                        {
                            label: "Generic Component",
                            icon: "material-symbols:category",
                            action: () => {
                                import('../familyCreatorPlaceholder').then(module => {
                                    module.openFamilyCreatorPlaceholder();
                                });
                            }
                        }
                    ]
                }
            },
            {
                label: "Outdoor",
                icon: "material-symbols:park",
                children: {
                    title: "Outdoor Elements",
                    items: [
                        {
                            label: "Plant",
                            icon: "material-symbols:potted-plant",
                            children: {
                                title: "Plant Types",
                                items: [
                                    { label: "Plant 01", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_01') },
                                    { label: "Plant 02", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_02') },
                                    { label: "Plant 03", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_03') },
                                    { label: "Plant 04", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_04') },
                                    { label: "Plant 05", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_05') },
                                    { label: "Plant 06", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_06') },
                                    { label: "Plant 07", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_07') },
                                    { label: "Plant 08", icon: "material-symbols:local-florist", action: () => service.activateFurnitureTool('plant_08') }
                                ]
                            }
                        }
                    ]
                }
            }
        ]
    };

    // ── C17 — Batch Creation Catalogue wiring ────────────────────────────────────
    // Dependencies the catalogue needs (C17 DI-3). The panel resolves these from
    // `props` + the documented legacy stores; the catalogue performs no window reads
    // of its own except the commandManager execution sink (C17 §10.1 / DI-1).
    const batchDeps: BatchDeps = {
        commandManager: (window.commandManager as unknown as BatchDeps['commandManager']) ?? null,
        getActiveLevelId: () => props.bimManager.getActiveLevel?.()?.id ?? null,
        getLevels: () => props.bimManager.getLevels(),
        getSelectedElementId: () =>
            (props.selectionManager.selectedObject?.userData?.elementId as string | undefined) ?? null,
        slabStore: (window.slabStore as unknown as BatchDeps['slabStore']) ?? null, // TODO(E.slab.S): runtime.stores.slab
    };

    // C17 DI-1 — dispatch through the documented path; surface success/failure as a
    // toast (CB-5: never a silent no-op).
    const runDispatch = (entry: BatchCatalogEntry, params?: Record<string, number>) => {
        const r = dispatchBatchEntry(entry, batchDeps, params);
        window.runtime?.events?.emit('pryzm:toast', {
            message: r.ok ? `Created: ${entry.label}` : (r.reason ?? 'Batch command failed'),
            severity: r.ok ? 'success' : 'error',
        });
        if (r.ok) {
            window.runtime?.events?.emit('update-view-browser', {}); // F.events.12
            window.runtime?.events?.emit('model-updated', {});       // F.events.8
        }
    };

    // Parameterised entries (C17 §6 PS-2) render a small inline form before dispatch.
    const renderBatchForm = (container: HTMLElement, entry: BatchCatalogEntry) => {
        const values: Record<string, number> = {};
        const form = document.createElement('div');
        form.className = 'ci-batch-form';
        form.style.cssText = 'padding:8px 4px;';

        const desc = document.createElement('div');
        desc.textContent = entry.prompt;
        desc.style.cssText = 'font-size:12px;color:var(--app-text-muted);margin-bottom:10px;';
        form.appendChild(desc);

        (entry.params ?? []).forEach((p) => {
            values[p.key] = p.default;
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;';
            const span = document.createElement('span');
            span.textContent = p.label;
            span.style.cssText = 'font-size:12px;color:var(--app-text);';
            const input = document.createElement('input');
            input.type = 'number';
            input.value = String(p.default);
            if (p.min != null) input.min = String(p.min);
            if (p.max != null) input.max = String(p.max);
            if (p.step != null) input.step = String(p.step);
            input.style.cssText = 'width:84px;padding:4px 6px;border-radius:4px;border:1px solid var(--app-border);background:var(--app-bg);color:var(--app-text);';
            input.oninput = () => { const v = parseFloat(input.value); if (!Number.isNaN(v)) values[p.key] = v; };
            row.appendChild(span);
            row.appendChild(input);
            form.appendChild(row);
        });

        const btn = document.createElement('button');
        btn.textContent = 'Create';
        // §41 unified action colour.
        btn.style.cssText = 'margin-top:12px;width:100%;padding:8px;border:none;border-radius:6px;background:#6600FF;color:#fff;font-weight:600;cursor:pointer;';
        btn.onclick = () => {
            runDispatch(entry, values);
            createNavigationStack.pop();
            renderCreateContent();
        };
        form.appendChild(btn);
        container.appendChild(form);
    };

    // Build a CREATE-panel leaf for a catalogue entry. Parameterised → opens a form
    // layer; parameterless → dispatches on click. Phase-gated / precondition-failing
    // entries render disabled with a reason tooltip (CB-4 / CB-5).
    const toBatchLeaf = (entry: BatchCatalogEntry): any => {
        const phaseGated = entry.phase > SHIPPED_PHASE;
        const disabledReason = () => {
            if (phaseGated) return `Coming in Phase ${entry.phase}`;
            const p = entry.precondition(batchDeps);
            return p.ok ? undefined : p.reason;
        };
        if (entry.params && entry.params.length > 0) {
            return {
                label: entry.label,
                icon: entry.icon,
                batch: true,
                disabled: () => phaseGated,
                disabledReason,
                children: { title: entry.label, batchForm: entry },
            };
        }
        return {
            label: entry.label,
            icon: entry.icon,
            batch: true,
            disabled: () =>
                props.bimManager.getLevels().length === 0 || phaseGated || !entry.precondition(batchDeps).ok,
            disabledReason,
            action: () => runDispatch(entry),
        };
    };

    // Inject `⚡ Batch` submenus into CREATE_CONFIG — additive (CB-1): existing
    // single-element tools are untouched. One `Batch` submenu per existing discipline
    // that has entries; new disciplines (e.g. Project) are appended as top-level items.
    {
        const grouped = groupCatalogue();
        const leavesFor = (discipline: string): any[] => {
            const sys = grouped.get(discipline);
            if (!sys) return [];
            const out: any[] = [];
            for (const entries of sys.values()) for (const e of entries) out.push(toBatchLeaf(e));
            return out;
        };
        const existing = new Set<string>(CREATE_CONFIG.items.map((i: any) => i.label));
        for (const item of CREATE_CONFIG.items as any[]) {
            const leaves = leavesFor(item.label);
            if (leaves.length > 0 && item.children?.items) {
                item.children.items.push({
                    label: 'Batch',
                    icon: 'material-symbols:bolt',
                    children: { title: `${item.label} — Batch`, items: leaves },
                });
            }
        }
        for (const [discipline, sys] of grouped) {
            if (existing.has(discipline)) continue;
            const out: any[] = [];
            for (const entries of sys.values()) for (const e of entries) out.push(toBatchLeaf(e));
            CREATE_CONFIG.items.push({
                label: discipline,
                icon: 'material-symbols:layers',
                children: { title: discipline, items: out },
            });
        }
    }

    const renderCreateContent = () => {
        const container = document.getElementById('create-navigation-container');
        if (!container) return;

        const currentLayer = createNavigationStack.length > 0
            ? createNavigationStack[createNavigationStack.length - 1]
            : CREATE_CONFIG;

        const hasLevels = props.bimManager.getLevels().length > 0;

        container.innerHTML = '';

        // Header with Back button if needed
        const header = document.createElement('div');
        header.className = 'ci-nav-header';

        if (createNavigationStack.length > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'ci-back-btn';
            backBtn.innerHTML = PryzmIcons.iconFromName('material-symbols:arrow-back', 18);
            backBtn.onclick = () => {
                if ((currentLayer as any).carouselMode) {
                    const carousel = window.furnitureCarousel; // TODO(E.15.T): legacy furnitureCarousel — replace with runtime.tools.activate('furniture') / runtime.stores.furniture
                    if (carousel) carousel.setVisible(false);
                }
                createNavigationStack.pop();
                renderCreateContent();
            };
            header.appendChild(backBtn);
        }

        const title = document.createElement('div');
        title.className = 'ci-nav-title';
        title.textContent = currentLayer.title;
        header.appendChild(title);
        container.appendChild(header);

        // ── Carousel mode: show bottom carousel, no icon grid in the panel ──
        if ((currentLayer as any).carouselMode) {
            const carousel = window.furnitureCarousel; // TODO(E.15.T): legacy furnitureCarousel — replace with runtime.tools.activate('furniture') / runtime.stores.furniture
            if (carousel) carousel.setVisible(true);

            const placeholder = document.createElement('div');
            placeholder.className = 'ci-carousel-placeholder';
            placeholder.innerHTML = `
                <span style="display:inline-flex;align-items:center;color:var(--app-text-muted);">${PryzmIcons.sized(PryzmIcons.pryzmFurniture, 32)}</span>
                <div>Browse &amp; drag furniture<br>from the carousel below</div>
            `;
            container.appendChild(placeholder);
            return;
        }

        // ── C17 — Batch parameter form layer (parameterised entries) ──────────────
        if ((currentLayer as any).batchForm) {
            renderBatchForm(container, (currentLayer as any).batchForm as BatchCatalogEntry);
            return;
        }

        // Grid of items
        const grid = document.createElement('div');
        grid.className = 'ci-grid';

        currentLayer.items.forEach((item: any) => {
            // Contract §03-1.3: items with customRender bypass the standard grid cell
            if (item.customRender) {
                const customEl = item.customRender();
                if (customEl) {
                    const panelContainer = grid.parentElement;
                    if (panelContainer) {
                        panelContainer.insertBefore(customEl, grid);
                    }
                }
                return;
            }

            const isDisabled = typeof item.disabled === 'function' ? item.disabled() : !hasLevels;
            const itemEl = document.createElement('div');
            itemEl.className = isDisabled
                ? 'create-item-grid-element create-item-grid-element--disabled'
                : 'create-item-grid-element';

            // C17 CB-4 / CB-5 — surface why a batch leaf is disabled (phase gate or
            // unmet precondition) as a hover tooltip; never hide it.
            if (isDisabled && typeof item.disabledReason === 'function') {
                const reason = item.disabledReason();
                if (reason) itemEl.title = reason;
            }

            if (!isDisabled) {
                itemEl.onclick = () => {
                    if (item.children) {
                        createNavigationStack.push(item.children);
                        renderCreateContent();
                    } else if (item.action) {
                        item.action();
                    }
                };
            }

            const iconStr = item.icon || 'material-symbols:construction';
            const icon = iconStr.startsWith('<svg')
                ? (() => { const d = document.createElement('div'); d.className = 'ci-item-icon ci-item-icon--svg'; d.innerHTML = PryzmIcons.sized(iconStr, 24); return d; })()
                : PryzmIcons.iconEl(iconStr, 'ci-item-icon', 24);

            const label = document.createElement('div');
            label.className = 'ci-item-label';
            label.textContent = item.label;

            itemEl.appendChild(icon);
            itemEl.appendChild(label);
            grid.appendChild(itemEl);
        });

        container.appendChild(grid);
    };

    // Initialize creation UI
    setTimeout(() => {
        renderCreateContent();
        updateLevelsList();
    }, 100);

    // When the furniture carousel is closed externally (X button / Escape),
    // pop the carousel-mode layer off the navigation stack so the panel resets.
    window.runtime?.events?.on('furniture-carousel-hidden', () => { // F.events.12
        if (createNavigationStack.length > 0) {
            const topLayer = createNavigationStack[createNavigationStack.length - 1];
            if ((topLayer as any).carouselMode) {
                createNavigationStack.pop();
                renderCreateContent();
            }
        }
    });

    // Kave Home GLB items dragged from the furniture carousel arrive here.
    window.runtime?.events?.on('fc-add-glb', (detail: { path: string; label?: string; position: { x: number; y: number; z: number } }) => { // F.events.12
        if (!detail?.path) {
            console.error('[Layout] fc-add-glb: missing path in event detail');
            return;
        }
        console.log(`[Layout] fc-add-glb: loading ${detail.path}`);
        const pos = new THREE.Vector3(detail.position.x, detail.position.y, detail.position.z);
        props.addFurniture(detail.path, pos);
    });

    window.addEventListener('bim-level-added', updateLevelsList);
    window.addEventListener('bim-level-removed', updateLevelsList);
    props.projectContext.subscribe((event: string) => {
        if (event === 'activeLevelChanged' || event === 'editorModeChanged') {
            updateLevelsList();
        }
    });
    setTimeout(updateLevelsList, 500);

    // ── Phase 3: Mount ActiveLevelHUD ────────────────────────────────────────────
    setTimeout(() => {
        const platToolbar = document.querySelector('.plat-toolbar') as HTMLElement | null;
        let hudMountEl: HTMLElement | null;
        if (platToolbar) {
            const sep = document.createElement('div');
            sep.className = 'plat-divider';
            platToolbar.appendChild(sep);
            const slot = document.createElement('div');
            slot.id = 'alh-toolbar-slot';
            platToolbar.appendChild(slot);
            hudMountEl = slot;
        } else {
            hudMountEl = document.getElementById('alh-hud-mount');
        }
        if (hudMountEl) {
            new ActiveLevelHUD({
                bimManager: props.bimManager,
                projectContext: props.projectContext,
                mountTarget: hudMountEl
            }, runtime ?? null);
        }
    }, 600);
}
