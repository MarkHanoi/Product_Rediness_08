import { ToolsPanelController } from '../tools-panel/ToolsPanelController';
import { ContextualEditBar } from '../ContextualEditBar';
import { JoinTool }          from '@pryzm/input-host';
import { CutTool }           from '@pryzm/input-host';
import { MirrorTool }        from '@pryzm/input-host';
import { CopyPasteTool }     from '@pryzm/input-host';
import { ScaleTool }         from '@pryzm/input-host';
import { OffsetTool }        from '@pryzm/input-host';
import { ReferenceEditTool } from '@pryzm/input-host';
import { WorkspaceModeBar } from '../platform/WorkspaceModeBar';
import { SaveUndoRedoHUD } from '../SaveUndoRedoHUD';
import { BottomActionMenu } from '../bottom-menu/BottomActionMenu';
import type { UIProps } from '../Layout';
import type { BimService } from '@app/engine/BimService';
import type { GISCallbacks } from './GISAreaLayout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { triggerWindowResize } from '../../engine/triggerWindowResize'; // F.events.16

export interface DockResult {
    leftPlaceholder: HTMLElement;
    rightPlaceholder: HTMLElement;
}

export function mountDockingArea(
    props: UIProps,
    service: BimService,
    gis: GISCallbacks,
    runtime: PryzmRuntime | null,
    vbPanelWrapper: HTMLElement,
    _getCommandManager: () => any,
): DockResult {
    const { toggleShadows, toggleBimVisibility } = props;

    // ── ToolsPanelController ───────────────────────────────────────────────────
    const toolsPanelController = new ToolsPanelController({
        bimManager:       props.bimManager,
        toolManager:      props.toolManager,
        selectionManager: props.selectionManager,
        wallTool:         props.wallTool,
        slabTool:         props.slabTool,
        service,
        projectContext:   props.projectContext,
        toggleShadows,
        toggleBimVisibility,
        applyVisualStyle: props.applyVisualStyle,
        getCommandManager: () => props.toolManager?.commandManager ?? null,
        gisToggle:            (active) => gis.toggleGIS(active),
        gisFlyTo:             () => gis.flyToCremornePoint(),
        gisPlaceBim:          () => gis.placeBimOnEarth(),
        gisGizmoMode:         (mode) => gis.gizmoMode(String(mode)),
        gisResetGeoreference: () => {
            // §OI-054 (2026-05-24) — route through THE single unified undo path (C03 §4.6 U-5)
            // instead of a hand-rolled ring-buffer apply. Undoes the most recent action (the
            // just-placed georeference), with the same coverage/shadow-drop/fallback semantics.
            void import('@app/engine/undo/performUndoRedo').then(m => m.performUndo());
        },
        gisStartBoundaryDraw: () => gis.startBoundaryDraw(),
    });

    // ── Phase 1.1 — Docking Panel System ──────────────────────────────────────
    const DOCK_STORAGE_KEY = 'bim-layout-pinned';
    interface DockState { left: boolean; right: boolean; }

    let dockState: DockState = { left: false, right: false };
    try {
        const raw = localStorage.getItem(DOCK_STORAGE_KEY);
        if (raw) dockState = { ...dockState, ...JSON.parse(raw) };
    } catch { /* ignore storage errors */ }

    const saveDockState = () => {
        try { localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockState)); } catch { /* noop */ }
    };

    const PIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
    </svg>`;

    const pinBtnLeft = document.createElement('button');
    pinBtnLeft.type      = 'button';
    pinBtnLeft.className = 'dck-pin-btn';
    pinBtnLeft.title     = 'Pin / unpin panel';
    pinBtnLeft.innerHTML = PIN_ICON_SVG;

    const pinBtnRight = document.createElement('button');
    pinBtnRight.type      = 'button';
    pinBtnRight.className = 'dck-pin-btn';
    pinBtnRight.title     = 'Pin / unpin panel';
    pinBtnRight.innerHTML = PIN_ICON_SVG;

    const leftPlaceholder = document.createElement('div');
    leftPlaceholder.id             = 'dck-left-placeholder';
    leftPlaceholder.style.cssText  = 'display:contents;';
    leftPlaceholder.appendChild(vbPanelWrapper);

    const rightPlaceholder = document.createElement('div');
    rightPlaceholder.id            = 'dck-right-placeholder';
    rightPlaceholder.style.cssText = 'display:contents;';
    rightPlaceholder.appendChild(toolsPanelController.element);

    const applyDockLayout = () => {
        const leftDock  = document.getElementById('dck-left-dock');
        const rightDock = document.getElementById('dck-right-dock');
        if (!leftDock || !rightDock) return;

        if (dockState.left) {
            if (!leftDock.contains(vbPanelWrapper))
                leftDock.appendChild(vbPanelWrapper);
            leftDock.style.width = '52px';
            pinBtnLeft.classList.add('dck-pin-btn--active');
        } else {
            if (!leftPlaceholder.contains(vbPanelWrapper))
                leftPlaceholder.appendChild(vbPanelWrapper);
            leftDock.style.width = '0';
            pinBtnLeft.classList.remove('dck-pin-btn--active');
        }

        if (dockState.right) {
            if (!rightDock.contains(toolsPanelController.element))
                rightDock.appendChild(toolsPanelController.element);
            rightDock.style.width = '52px';
            pinBtnRight.classList.add('dck-pin-btn--active');
        } else {
            if (!rightPlaceholder.contains(toolsPanelController.element))
                rightPlaceholder.appendChild(toolsPanelController.element);
            rightDock.style.width = '0';
            pinBtnRight.classList.remove('dck-pin-btn--active');
        }

        triggerWindowResize(); // F.events.16
    };

    pinBtnLeft.addEventListener('click',  () => { dockState.left  = !dockState.left;  saveDockState(); applyDockLayout(); });
    pinBtnRight.addEventListener('click', () => { dockState.right = !dockState.right; saveDockState(); applyDockLayout(); });

    vbPanelWrapper.appendChild(pinBtnLeft);

    const tpHeader = toolsPanelController.element.querySelector('.tp-header');
    if (tpHeader) tpHeader.appendChild(pinBtnRight);

    const canvasEl = document.getElementById('container');
    if (canvasEl) {
        new ResizeObserver(() => triggerWindowResize()).observe(canvasEl); // F.events.16
    }

    setTimeout(() => applyDockLayout(), 0);

    // ── Phase 2 + Phase D: Contextual Edit Bar ────────────────────────────────
    const ceb = new ContextualEditBar(service, runtime);
    {
        const cmdMgr = props.toolManager?.commandManager ?? window.commandManager ?? null; // TODO(E.x.X): legacy commandManager (drawing-HUD fallback) — replace with runtime.bus.executeCommand
        if (cmdMgr) {
            ceb.injectOperationTools({
                joinTool:          new JoinTool(cmdMgr),
                cutTool:           new CutTool(cmdMgr),
                mirrorTool:        new MirrorTool(cmdMgr),
                copyPasteTool:     new CopyPasteTool(cmdMgr),
                scaleTool:         new ScaleTool(cmdMgr),
                offsetTool:        new OffsetTool(cmdMgr),
                referenceEditTool: new ReferenceEditTool(cmdMgr),
            });
        } else {
            window.addEventListener('bim-engine-ready', () => {
                const cm = window.commandManager; // TODO(E.x.X): legacy commandManager (drawing-HUD direct) — replace with runtime.bus.executeCommand
                if (cm) {
                    ceb.injectOperationTools({
                        joinTool:          new JoinTool(cm),
                        cutTool:           new CutTool(cm),
                        mirrorTool:        new MirrorTool(cm),
                        copyPasteTool:     new CopyPasteTool(cm),
                        scaleTool:         new ScaleTool(cm),
                        offsetTool:        new OffsetTool(cm),
                        referenceEditTool: new ReferenceEditTool(cm),
                    });
                }
            }, { once: true });
        }
    }

    // ── WorkspaceModeBar + SaveUndoRedoHUD ────────────────────────────────────
    const workspaceModeBar = new WorkspaceModeBar();
    const saveUndoRedoHUD  = new SaveUndoRedoHUD();

    const topBarWrapper = document.createElement('div');
    topBarWrapper.className = 'wmb-toplevel-wrapper';
    topBarWrapper.appendChild(saveUndoRedoHUD.element);
    topBarWrapper.appendChild(workspaceModeBar.element);

    // ── §LEVEL-PILL-FOLLOWS-THE-MODE-BAR (L-3500) ─────────────────────────────
    //
    // THE SLOT THE ACTIVE-LEVEL PILL MOUNTS INTO, and it is created HERE — in the
    // ONE place the mode bar is composed (§WORKSPACE-MODE-REGISTRY, L-3000, moved
    // the mode LIST into a table; this moves the mode bar's NEIGHBOURS into the
    // same composition) — rather than by hand-positioning a second floating
    // element somewhere else in the tree.
    //
    // ⛔ THE DEFECT THIS CLOSES, measured 2026-08-22. `ActiveLevelHUD` was mounted
    // by `CreatePanelLayout.ts` into `.plat-toolbar` (a `setTimeout(…, 600)` that
    // appends a `plat-divider` + `#alh-toolbar-slot`), i.e. into the PLATFORM
    // toolbar at the top-RIGHT of the shell, while `Author | Inspect | Analysis |
    // Data` live in this fixed, centred wrapper. The two controls are read
    // together and moved apart; worse, they obeyed different layout rules — this
    // wrapper is re-centred to `left: 25%` by
    // `body.pryzm-mode-inspect .wmb-toplevel-wrapper` (inspectModeShell.ts) when
    // the Inspect panel takes the right half, and the platform toolbar is not, so
    // the level pill did not follow the mode bar out of the panel's way.
    //
    // As a THIRD CHILD of this flex row the pill inherits, by construction: the
    // fixed top anchor, the 7px gap, the `pointer-events` discipline
    // (`.wmb-toplevel-wrapper > *`), the two mobile breakpoints, and the
    // inspect-mode re-centre. "Follows them" is then a property of the DOM, not a
    // second set of coordinates kept in sync by hand.
    //
    // The slot is created EMPTY and filled later by `CreatePanelLayout`, which is
    // where the HUD's `bimManager` / `projectContext` dependencies already live.
    // `CreatePanelLayout` still falls back to `.plat-toolbar` and then to
    // `#alh-hud-mount` when this slot is absent (headless / alternate shells) —
    // see `toolbar/__tests__/mountHost.spec.ts`, which requires a fallback chain.
    const levelSlot = document.createElement('div');
    levelSlot.id        = 'alh-modebar-slot';
    levelSlot.className = 'alh-slot';
    topBarWrapper.appendChild(levelSlot);

    document.body.appendChild(topBarWrapper);

    // ── Bottom Action Menu ────────────────────────────────────────────────────
    const bottomMenu = new BottomActionMenu({
        toolManager:      props.toolManager,
        selectionManager: props.selectionManager,
        navManager:       props.navManager,
        service,
        wallTool:         props.wallTool,
        deleteSelected:   props.deleteSelected,
        zoomToAll:        props.zoomToAll,
    }, runtime ?? null);
    document.body.appendChild(bottomMenu.element);

    return { leftPlaceholder, rightPlaceholder };
}
