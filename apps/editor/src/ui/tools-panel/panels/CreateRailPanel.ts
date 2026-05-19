/**
 * CreateRailPanel — Five-discipline Accordion Create panel (Phase 5).
 *
 * Layout: 5 discipline accordion sections — ARCHITECTURE, STRUCTURE, SERVICES,
 * INTERIORS, LANDSCAPE. Sections toggle open/close on header click. A lock icon
 * prevents a section from being auto-closed. Maximum two sections may be open
 * simultaneously; opening a third closes the oldest unlocked one.
 *
 * Sub-panel mode (_navStack) is retained ONLY for:
 *   - Furniture carousel mode (replaces panel content with browse placeholder)
 *   - Plant sub-panel (8 plant types — too many for main list)
 *
 * CSS prefix: da-  (Discipline Accordion) — claimed in §05 §3
 *             ci-  (retained for back-nav header used in sub-panels)
 *             cr-  (legacy — grid cells in sub-panels)
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* layout elements
 *   §01 §2   — All mutations via service methods or toolManager; no direct store writes
 *   §05 §7.6 — No independent <style> injection
 *   §05 §7.8 — No @thatopen/ui (bim-*) elements in new code
 */

import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps, CreateLayer } from '../ToolsPanelTypes';
import { SlabModePicker } from '../../SlabModePicker';
import { HandrailModePicker } from '../../HandrailModePicker';
import { ColumnModePicker } from '../../ColumnModePicker';
import { BeamModePicker } from '../../BeamModePicker';
import { OpeningModePicker } from '../../OpeningModePicker';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import * as PryzmIcons from '../../icons/PryzmIcons';
import { FurnitureSidePanel } from '../../furniture-carousel/FurnitureSidePanel';
import { buildLightingPanel } from './CreateRailPanelLighting';

interface DisciplineTool {
    label:    string;
    icon:     string;
    action:   () => void;
    disabled?: () => boolean;
    subPanel?: CreateLayer;
    /**
     * Optional keyboard shortcut hint (e.g. 'Alt+W', 'Alt+Shift+T').
     * Shown in the hover tooltip and registered in the global Alt-prefix
     * shortcut handler installed by `_installShortcutListener()`.
     * Format spec: `{Alt}[+{Shift}][+{Ctrl}]+{LETTER}` — Alt is mandatory
     * to keep creation shortcuts off the contextual single-letter layer
     * (Contract 11). Documented in
     * docs/00_AI_COMMANDS_REFERENCE/PRYZM-CREATION-SHORTCUTS.md.
     */
    shortcut?: string;
}

interface DisciplineSection {
    id:    string;
    label: string;
    icon:  string;
    tools: DisciplineTool[];
}

interface SectionState {
    isOpen:   boolean;
    isLocked: boolean;
    openedAt: number;
}

const MAX_OPEN_SECTIONS = 2;

export class CreateRailPanel {
    private _navStack: CreateLayer[] = [];

    private readonly _slabModePicker     = new SlabModePicker();
    private readonly _handrailModePicker = new HandrailModePicker();
    private readonly _columnModePicker   = new ColumnModePicker();
    private readonly _beamModePicker     = new BeamModePicker();
    private readonly _openingModePicker  = new OpeningModePicker();

    private _selectedHandrailTypeId: string | undefined;

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * F-launch.1 (S81 F.1.01) — look up a `toolbar.discipline` contribution
     * by id.  Returns `null` when the contribution is absent (legacy path)
     * or when the runtime is not wired (test environments / very early boot).
     *
     * Used by `_buildSections()` to route the architecture-rail Wall button
     * through `wallToolbarContribution.activate(runtime)` — making the
     * registered contribution the source of truth for "what does the Wall
     * button do" without yet deleting the surrounding hard-coded array
     * (that's F.1.14 once all 12 element families have landed).
     */
    private _findToolbarContribution(
        id: string,
    ): { activate: (rt: import('@pryzm/runtime-composer/types').PryzmRuntime) => void } | null {
        const slot = this.runtime?.plugins;
        if (!slot) return null;
        const all = slot.contributions('toolbar.discipline');
        return all.find((c) => c.id === id) ?? null;
    }

    // Phase E (S78-WIRE) — runtime.tools bridge
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Route a tool activation through `runtime.tools.activate(family, mode?)`.
     * If `runtime` is not wired (test environments, very early boot) the caller
     * should fall through to its own legacy path.
     * @returns `true` — runtime call dispatched; caller must NOT double-fire.
     *          `false` — runtime unavailable; caller should use legacy path.
     */
    private _activateTool(family: string, mode?: string): boolean {
        if (!this.runtime?.tools) return false;
        this.runtime.tools.activate(family, mode);
        return true;
    }

    private _activeDisciplineId: string = 'architecture';

    private _sectionState: Record<string, SectionState> = {
        architecture: { isOpen: true,  isLocked: false, openedAt: Date.now() },
        structure:    { isOpen: false, isLocked: false, openedAt: 0 },
        services:     { isOpen: false, isLocked: false, openedAt: 0 },
        interiors:    { isOpen: false, isLocked: false, openedAt: 0 },
        landscape:    { isOpen: false, isLocked: false, openedAt: 0 },
    };

    private static _shortcutListenerInstalled = false;
    private static _activeInstance: CreateRailPanel | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ToolsPanelProps,
        private readonly _rail:  ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', () => {
            this._refreshAll();
        });
        window.addEventListener('bim-level-added', () => {
            this._refreshAll();
        });
        window.addEventListener('bim-level-removed', () => {
            this._refreshAll();
        });
        // (furniture-carousel-hidden no longer used — FurnitureSidePanel is inline)

        // Track the most recent CreateRailPanel instance — the global Alt-letter
        // shortcut handler (installed once below) routes keypresses to it.
        CreateRailPanel._activeInstance = this;
        this._installShortcutListener();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Element-creation keyboard shortcuts (Alt+letter layer)
    // Documented in docs/00_AI_COMMANDS_REFERENCE/PRYZM-CREATION-SHORTCUTS.md
    // ─────────────────────────────────────────────────────────────────────────

    private _installShortcutListener(): void {
        if (CreateRailPanel._shortcutListenerInstalled) return;
        CreateRailPanel._shortcutListenerInstalled = true;

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            // Alt is the mandatory modifier — bail early if not held.
            if (!e.altKey) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const inst = CreateRailPanel._activeInstance;
            if (!inst) return;
            inst._tryFireShortcut(e);
        });
    }

    private _tryFireShortcut(e: KeyboardEvent): void {
        const hasLevels = this._props.bimManager.getLevels().length > 0;
        if (!hasLevels) return;

        const sections = this._buildSections();
        for (const section of sections) {
            for (const tool of section.tools) {
                if (!tool.shortcut) continue;
                if (!this._matchShortcut(tool.shortcut, e)) continue;
                if (typeof tool.disabled === 'function' && tool.disabled()) return;

                e.preventDefault();
                console.log(`[CreateRailPanel] Shortcut ${tool.shortcut} → ${tool.label}`);

                if (tool.subPanel) {
                    this._navStack.push(tool.subPanel);
                    this._refreshAll();
                } else {
                    tool.action();
                }
                return;
            }
        }
    }

    /**
     * Match a shortcut spec like `'Alt+W'` / `'Alt+Shift+T'` / `'Alt+Ctrl+O'`
     * against a KeyboardEvent. Alt is mandatory; Shift / Ctrl modifiers are
     * matched exactly (presence required, absence required).
     *
     * Letter keys are matched against `e.code` (e.g. `'KeyW'`) instead of
     * `e.key`, because when Alt is held many browsers (notably macOS Safari /
     * Chrome) report `e.key` as the alternate character (e.g. `'∑'` for
     * Alt+W, `'ß'` for Alt+S). `e.code` is layout-independent so the
     * shortcuts fire correctly on Mac and non-US keyboards too.
     */
    private _matchShortcut(spec: string, e: KeyboardEvent): boolean {
        const parts     = spec.split('+').map(p => p.trim());
        const wantAlt   = parts.includes('Alt');
        const wantShift = parts.includes('Shift');
        const wantCtrl  = parts.includes('Ctrl');
        const keyTok    = parts[parts.length - 1].toUpperCase();

        if (e.altKey   !== wantAlt)                 return false;
        if (e.shiftKey !== wantShift)               return false;
        if ((e.ctrlKey || e.metaKey) !== wantCtrl)  return false;

        // Single letter A–Z → match e.code (layout-independent: "KeyA" … "KeyZ").
        if (keyTok.length === 1 && keyTok >= 'A' && keyTok <= 'Z') {
            return e.code === `Key${keyTok}`;
        }
        // Fallback for any future non-letter keys (digits, function keys, etc.).
        return e.key.toUpperCase() === keyTok;
    }

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tpr-create-root';
        this._render(container);
        return container;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────────────────────

    private _render(container: HTMLElement): void {
        container.innerHTML = '';

        // Clear any transient width override; sub-panels re-apply it as needed.
        this._rail.setWidthOverride(null);

        if (this._navStack.length > 0) {
            container.classList.add('tpr-create-root--subpanel');
            this._renderSubPanel(container);
            return;
        }

        this._renderAccordion(container);
    }

    private _renderAccordion(container: HTMLElement): void {
        const hasLevels = this._props.bimManager.getLevels().length > 0;
        const sections  = this._buildSections();

        if (!hasLevels) {
            const notice = document.createElement('div');
            notice.className = 'da-no-levels-notice';
            notice.innerHTML = `
                <span>⚠</span>
                <span>Add a level to start creating elements.</span>
            `;
            container.appendChild(notice);
        }

        // Only show the active discipline — filter to just that section
        const activeSection = sections.find(s => s.id === this._activeDisciplineId) ?? sections[0];
        if (!activeSection) return;

        const state = this._sectionState[activeSection.id] ?? { isOpen: true, isLocked: false, openedAt: 0 };

        container.appendChild(this._buildSingleSection(activeSection, state, hasLevels));
    }

    private _buildSingleSection(
        section:   DisciplineSection,
        state:     SectionState,
        hasLevels: boolean,
    ): HTMLElement {
        const root = document.createElement('div');
        root.className = 'da-single-mode';

        // ── Discipline header row ──
        const hdr = document.createElement('div');
        hdr.className = 'da-single-hdr';

        const disciplineIcon = document.createElement('span');
        disciplineIcon.className = 'da-single-hdr-icon';
        disciplineIcon.innerHTML = PryzmIcons.sized(section.icon, 16);

        const labelEl = document.createElement('span');
        labelEl.className   = 'da-single-hdr-label';
        labelEl.textContent = section.label;

        const pinBtn = document.createElement('button');
        pinBtn.className = state.isLocked ? 'da-lock-btn da-lock-btn--locked' : 'da-lock-btn';
        pinBtn.type  = 'button';
        pinBtn.title = state.isLocked ? 'Unpin (auto-close enabled)' : 'Pin panel open';
        pinBtn.innerHTML = PryzmIcons.pin;

        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleLock(section.id);
            this._refreshAll();
        });

        hdr.appendChild(disciplineIcon);
        hdr.appendChild(labelEl);
        hdr.appendChild(pinBtn);
        root.appendChild(hdr);

        // ── Icon grid of tools ──
        const grid = document.createElement('div');
        grid.className = 'da-icon-grid';

        for (const tool of section.tools) {
            const isDisabled = !hasLevels ||
                (typeof tool.disabled === 'function' ? tool.disabled() : false);

            const cell = document.createElement('button');
            cell.className = isDisabled
                ? 'da-icon-cell da-icon-cell--disabled'
                : 'da-icon-cell';
            cell.type  = 'button';
            // Native tooltip — first line is the tool name, second line is the
            // keyboard shortcut hint (when one is registered for this tool).
            cell.title = tool.shortcut
                ? `${tool.label}\nShortcut: ${tool.shortcut}`
                : tool.label;

            if (!isDisabled) {
                cell.addEventListener('click', () => {
                    if (tool.subPanel) {
                        this._navStack.push(tool.subPanel);
                        this._refreshAll();
                    } else {
                        tool.action();
                    }
                });
            }

            const iconEl = document.createElement('span');
            iconEl.className = 'da-icon-cell-icon';
            if (tool.icon.startsWith('<svg')) {
                iconEl.innerHTML = PryzmIcons.sized(tool.icon, 28);
            } else {
                iconEl.innerHTML = PryzmIcons.iconFromName(tool.icon, 28);
            }

            const lbl = document.createElement('span');
            lbl.className   = 'da-icon-cell-label';
            lbl.textContent = tool.label;

            cell.appendChild(iconEl);
            cell.appendChild(lbl);
            grid.appendChild(cell);
        }

        root.appendChild(grid);
        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Accordion state management
    // ─────────────────────────────────────────────────────────────────────────

    private _toggleSection(id: string): void {
        const state = this._sectionState[id];
        if (!state) return;

        if (state.isOpen) {
            if (!state.isLocked) {
                state.isOpen   = false;
                state.openedAt = 0;
            }
            return;
        }

        // Opening: enforce max-2 rule
        const openSections = Object.entries(this._sectionState)
            .filter(([, s]) => s.isOpen)
            .sort(([, a], [, b]) => a.openedAt - b.openedAt);

        if (openSections.length >= MAX_OPEN_SECTIONS) {
            // Close the oldest unlocked open section
            const oldest = openSections.find(([, s]) => !s.isLocked);
            if (oldest) {
                oldest[1].isOpen   = false;
                oldest[1].openedAt = 0;
            }
            // If all open sections are locked, still open (the third lock overrides
            // the "oldest" — UI still honours the action).
        }

        state.isOpen   = true;
        state.openedAt = Date.now();
    }

    private _toggleLock(id: string): void {
        const state = this._sectionState[id];
        if (!state) return;
        state.isLocked = !state.isLocked;

        // If locking while closed, also open the section
        if (state.isLocked && !state.isOpen) {
            this._toggleSection(id);
        }
    }

    /**
     * Pre-selects a discipline accordion section so the next build() call
     * renders it open. Called by ToolsPanelController when a discipline spine
     * icon is clicked (Phase 2.1).
     *
     * Rules:
     *  - Opens the target section (forced, ignores MAX_OPEN_SECTIONS).
     *  - Closes all other unlocked sections so only one is open on entry.
     *  - Clears the nav stack (sub-panels) so the top-level accordion renders.
     */
    public setActiveDiscipline(disciplineId: string): void {
        const changedDiscipline = this._activeDisciplineId !== disciplineId;
        this._activeDisciplineId = disciplineId;
        for (const [key, state] of Object.entries(this._sectionState)) {
            if (key === disciplineId) {
                state.isOpen   = true;
                state.openedAt = Date.now();
            } else if (!state.isLocked) {
                state.isOpen   = false;
                state.openedAt = 0;
            }
        }
        if (changedDiscipline) {
            this._navStack = [];
        }
    }

    /**
     * Triggers a refresh of the rail panel for any of the 5 discipline section
     * IDs (Phase 2.1). Called by event listeners that previously used the
     * single 'CREATE' id.
     */
    private _refreshAll(): void {
        for (const id of ['CREATE_ARCH', 'CREATE_STRUCT', 'CREATE_SERVICES', 'CREATE_INTERIORS', 'CREATE_LANDSCAPE']) {
            this._rail.refreshIfActive(id);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-panel rendering (carousel / plant picker)
    // ─────────────────────────────────────────────────────────────────────────

    private _renderSubPanel(container: HTMLElement): void {
        const currentLayer = this._navStack[this._navStack.length - 1];

        const header = document.createElement('div');
        header.className = 'ci-nav-header';

        const backBtn = document.createElement('button');
        backBtn.className = 'ci-back-btn';
        backBtn.type = 'button';
        backBtn.innerHTML = PryzmIcons.iconFromName('material-symbols:arrow-back', 18);
        backBtn.addEventListener('click', () => {
            this._navStack.pop();
            this._refreshAll();
        });
        header.appendChild(backBtn);

        const titleEl = document.createElement('div');
        titleEl.className   = 'ci-nav-title';
        titleEl.textContent = currentLayer.title;
        header.appendChild(titleEl);
        container.appendChild(header);

        // ── Furniture inline browser ──────────────────────────────────────
        if ((currentLayer as any).furniturePanel) {
            // Furniture libraries need a bit of extra room for the 2-column
            // thumbnail grid — bump the rail panel width modestly.
            this._rail.setWidthOverride(260);

            // Phase B.40 (S73-WIRE) — thread composed runtime to FurnitureSidePanel.
            const sidePanel = new FurnitureSidePanel({
                initialCategory: (currentLayer as any).furnitureCategory,
            }, this.runtime ?? null /* B-runtime-thread FurnitureSidePanel */);
            const panelEl = sidePanel.build();
            panelEl.style.flex = '0 0 auto';
            panelEl.style.minHeight = '0';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.appendChild(panelEl);
            return;
        }

        // Any non-furniture sub-panel — restore the user's preferred width.
        this._rail.setWidthOverride(null);

        // ── Lighting fixture picker ───────────────────────────────────────
        if ((currentLayer as any).lightingPanel) {
            container.appendChild(this._buildLightingPanel());
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'ci-grid';

        const hasLevels = this._props.bimManager.getLevels().length > 0;

        for (const item of currentLayer.items) {
            const isDisabled =
                typeof (item as any).disabled === 'function'
                    ? (item as any).disabled()
                    : !hasLevels;

            const cell = document.createElement('div');
            cell.className = isDisabled
                ? 'create-item-grid-element create-item-grid-element--disabled'
                : 'create-item-grid-element';

            if (!isDisabled && item.action) {
                cell.addEventListener('click', () => item.action!());
            }

            const iconWrap = document.createElement('div');
            iconWrap.className = 'ci-item-icon ci-item-icon--svg';
            iconWrap.innerHTML = item.icon.startsWith('<svg')
                ? PryzmIcons.sized(item.icon, 24)
                : PryzmIcons.iconFromName(item.icon, 24);

            const lbl = document.createElement('div');
            lbl.className   = 'ci-item-label';
            lbl.textContent = item.label;

            cell.appendChild(iconWrap);
            cell.appendChild(lbl);
            grid.appendChild(cell);
        }

        container.appendChild(grid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lighting fixture picker sub-panel
    // ─────────────────────────────────────────────────────────────────────────

    private _buildLightingPanel(): HTMLElement {
        return buildLightingPanel();
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Discipline section definitions (unchanged tool actions)
    // ─────────────────────────────────────────────────────────────────────────

    private _buildSections(): DisciplineSection[] {
        const { service, toolManager } = this._props;

        return [
            // ── ARCHITECTURE ──────────────────────────────────────────────
            {
                id:    'architecture',
                label: 'Architecture',
                icon:  PryzmIcons.wall,
                tools: [
                    {
                        label:    'Wall',
                        shortcut: 'Alt+W',
                        icon:     PryzmIcons.wall,
                        action: () => {
                            // F-launch.1 (S81 F.1.01) — prefer the registered
                            // `wallToolbarContribution` so the contribution code
                            // path is exercised on every Wall click.  Falls
                            // through to the legacy Phase-E runtime.tools route
                            // (and ultimately the service shim) when the
                            // contribution is absent (test envs, very early boot).
                            const contrib = this._findToolbarContribution('wall.tool');
                            if (contrib && this.runtime) {
                                contrib.activate(this.runtime);
                                return;
                            }
                            if (!this._activateTool('wall', 'polyline_ortho')) {
                                service.activateWallTool(WallDrawingMode.POLYLINE_ORTHO);
                            }
                        },
                    },
                    {
                        label:    'Curtain Wall',
                        shortcut: 'Alt+Q',
                        icon:     PryzmIcons.curtainWall,
                        action: () => {
                            if (!this._activateTool('curtain-wall', 'SINGLE')) {
                                toolManager.activateCurtainWall('SINGLE');
                            }
                        },
                    },
                    {
                        label:    'Door',
                        shortcut: 'Alt+D',
                        icon:     PryzmIcons.pryzmDoor,
                        action: () => {
                            if (!this._activateTool('door', 'single')) {
                                toolManager.activateDoor('single');
                            }
                        },
                    },
                    {
                        label:    'Window',
                        shortcut: 'Alt+I',
                        icon:     PryzmIcons.pryzmWindow,
                        action: () => {
                            if (!this._activateTool('window', 'single')) {
                                toolManager.activateWindow('single');
                            }
                        },
                    },
                    {
                        label:    'Stair (I)',
                        shortcut: 'Alt+T',
                        icon:     PryzmIcons.pryzmStairI,
                        action: () => { if (!this._activateTool('stair', 'I')) service.activateStairPathTool('I'); },
                    },
                    {
                        label:    'Stair (L)',
                        shortcut: 'Alt+Shift+T',
                        icon:     PryzmIcons.pryzmStairL,
                        action: () => { if (!this._activateTool('stair', 'L')) service.activateStairPathTool('L'); },
                    },
                    {
                        label:    'Stair (U)',
                        shortcut: 'Alt+Ctrl+T',
                        icon:     PryzmIcons.pryzmStairU,
                        action: () => { if (!this._activateTool('stair', 'U')) service.activateStairPathTool('U'); },
                    },
                    {
                        label:    'Handrail',
                        shortcut: 'Alt+H',
                        icon:     PryzmIcons.pryzmHandrail,
                        action: () => {
                            this._handrailModePicker.show({
                                handrailTypes: handrailTypeStore.getAll().map(t => ({
                                    id:            t.id,
                                    name:          t.name,
                                    description:   t.description,
                                    height:        t.height,
                                    fillType:      t.fillType,
                                    materialColor: t.materialColor,
                                })),
                                currentHandrailTypeId: this._selectedHandrailTypeId,
                                onHandrailTypeChange:  (id) => { this._selectedHandrailTypeId = id; },
                                onSelectType: (id) => {
                                    this._selectedHandrailTypeId = id;
                                    if (!this._activateTool('handrail', id)) {
                                        service.activateHandrailTool(id);
                                    }
                                },
                            });
                        },
                    },
                    {
                        label:    'Ramp',
                        shortcut: 'Alt+P',
                        icon:     PryzmIcons.pryzmRamp,
                        action: () => {
                            if (!this._activateTool('ramp')) {
                                const t = window.rampTool; // TODO(E.6): legacy rampTool — replace with runtime.tools.activate('ramp') after plugins/ramp lands
                                if (t) t.activate();
                                else   console.warn('[Ramp] rampTool not ready');
                            }
                        },
                    },
                    {
                        label:    'Ceiling',
                        shortcut: 'Alt+C',
                        icon:     PryzmIcons.pryzmCeiling,
                        action: () => {
                            if (!this._activateTool('ceiling')) {
                                service.activateCeilingTool();
                            }
                        },
                    },
                    {
                        label:    'Auto Ceiling',
                        shortcut: 'Alt+Shift+C',
                        icon:     PryzmIcons.pryzmCeiling,
                        action: () => {
                            if (!this._activateTool('ceiling:auto')) {
                                const t = window.ceilingTool; // TODO(E.ceiling.T): legacy ceilingTool — replace with runtime.tools.activate('ceiling', mode)
                                if (t?.setMode) t.setMode('AUTO_FROM_ROOM');
                                service.activateCeilingTool();
                            }
                        },
                    },
                    {
                        label:    'Floor',
                        shortcut: 'Alt+F',
                        icon:     PryzmIcons.pryzmFloor,
                        action: () => {
                            if (!this._activateTool('floor')) {
                                service.activateFloorTool();
                            }
                        },
                    },
                    {
                        label:    'Auto Floor',
                        shortcut: 'Alt+Shift+F',
                        icon:     PryzmIcons.pryzmFloor,
                        action: () => {
                            if (!this._activateTool('floor:auto')) {
                                const t = window.floorTool; // TODO(E.floor.T): legacy floorTool — replace with runtime.tools.activate('floor', mode)
                                if (t?.setMode) t.setMode('AUTO_FROM_ROOM');
                                service.activateFloorTool();
                            }
                        },
                    },
                    {
                        label:    'Room',
                        shortcut: 'Alt+R',
                        icon:     PryzmIcons.pryzmRoom,
                        action: () => {
                            if (!this._activateTool('room')) {
                                const rt = window.roomTool; // TODO(E.18-R): legacy roomTool — replace with runtime.tools.activate('room')
                                if (rt) rt.activate();
                                else    toolManager.activateRoom?.();
                            }
                        },
                    },
                    {
                        label:    'Room (level)',
                        shortcut: 'Alt+Shift+R',
                        icon:     PryzmIcons.pryzmRoom,
                        action: () => {
                            if (!this._activateTool('room:level')) {
                                // Legacy fallback (also used when no activator is registered).
                                const rt    = window.roomTool; // TODO(E.18-R): legacy roomTool — replace with runtime.tools.activate('room')
                                const level = this._props.bimManager?.getActiveLevel?.();
                                if (rt && level) {
                                    rt.detectRoomsForLevel(level.id, level.elevation ?? 0, level.height ?? 3);
                                } else if (rt) {
                                    rt.activate();
                                }
                            }
                        },
                    },
                    {
                        label:    'Room Bounding',
                        shortcut: 'Alt+B',
                        icon:     PryzmIcons.pryzmRoomBounding,
                        action: () => {
                            if (!this._activateTool('room-bounding')) {
                                const tool = window.roomBoundingLineTool; // TODO(E.18-RBL): legacy roomBoundingLineTool — replace with runtime.tools.activate('roomBoundingLine')
                                if (tool) {
                                    tool.activate();
                                    console.log('[CreateRailPanel] Room Bounding Line tool activated');
                                } else {
                                    console.warn('[CreateRailPanel] roomBoundingLineTool not ready');
                                }
                            }
                        },
                    },
                ],
            },

            // ── STRUCTURE ─────────────────────────────────────────────────
            {
                id:    'structure',
                label: 'Structure',
                icon:  PryzmIcons.pryzmColumn,
                tools: [
                    {
                        label:    'Column',
                        shortcut: 'Alt+K',
                        icon:     PryzmIcons.pryzmColumn,
                        action: () => {
                            this._columnModePicker.show({
                                onSelectType: (config) => {
                                    const modeStr = JSON.stringify({
                                        profile:          config.profile,
                                        width:            config.width,
                                        depth:            config.depth,
                                        steelProfileName: config.steelProfileName,
                                    });
                                    if (!this._activateTool('column', modeStr)) {
                                        toolManager.activateColumn({
                                            profile:          config.profile,
                                            width:            config.width,
                                            depth:            config.depth,
                                            steelProfileName: config.steelProfileName,
                                        });
                                    }
                                },
                            });
                        },
                    },
                    {
                        label:    'Beam',
                        shortcut: 'Alt+E',
                        icon:     PryzmIcons.pryzmBeam,
                        action: () => {
                            this._beamModePicker.show({
                                onSelectType: (config) => {
                                    const modeStr = JSON.stringify({
                                        profile:          config.profile,
                                        width:            config.width,
                                        depth:            config.depth,
                                        steelProfileName: config.steelProfileName,
                                    });
                                    if (!this._activateTool('beam', modeStr)) {
                                        toolManager.activateBeam({
                                            profile:          config.profile,
                                            width:            config.width,
                                            depth:            config.depth,
                                            steelProfileName: config.steelProfileName,
                                        });
                                    }
                                },
                            });
                        },
                    },
                    {
                        label:    'Slab',
                        shortcut: 'Alt+S',
                        icon:     PryzmIcons.pryzmSlab,
                        action: () => {
                            this._slabModePicker.show({
                                on2Point:    () => { if (!this._activateTool('slab', '2point'))    service.activateSlabTool('2point'); },
                                onPolyline:  () => { if (!this._activateTool('slab', 'polyline'))  service.activateSlabTool('polyline'); },
                                onRegion:    () => { if (!this._activateTool('slab', 'region'))    service.activateSlabTool('region'); },
                                onHollow:    () => { if (!this._activateTool('slab', 'hollow'))    service.activateSlabTool('hollow'); },
                                onPickWalls: () => { if (!this._activateTool('slab', 'pickWalls')) service.activateSlabTool('pickWalls'); },
                            });
                        },
                    },
                    {
                        label:    'Roof (2pt)',
                        shortcut: 'Alt+O',
                        icon:     PryzmIcons.pryzmRoof,
                        action: () => { if (!this._activateTool('roof', '2point'))       service.activateRoofTool('2point'); },
                    },
                    {
                        label:    'Roof (poly)',
                        shortcut: 'Alt+Shift+O',
                        icon:     PryzmIcons.pryzmRoof,
                        action: () => { if (!this._activateTool('roof', 'polyline'))     service.activateRoofTool('polyline'); },
                    },
                    {
                        label:    'Roof (region)',
                        shortcut: 'Alt+Ctrl+O',
                        icon:     PryzmIcons.pryzmRoof,
                        action: () => { if (!this._activateTool('roof', 'region'))       service.activateRoofTool('region'); },
                    },
                    {
                        label:    'Roof (single slope)',
                        shortcut: 'Alt+Shift+Ctrl+O',
                        icon:     PryzmIcons.pryzmRoof,
                        action: () => { if (!this._activateTool('roof', 'single_slope')) service.activateRoofTool('single_slope'); },
                    },
                    {
                        label:    'Slab Opening',
                        shortcut: 'Alt+N',
                        icon:     PryzmIcons.pryzmSlabOpening,
                        action: () => {
                            this._openingModePicker.show({
                                on2Point:   () => { if (!this._activateTool('opening', '2point'))   toolManager.activateOpeningTool('2point'); },
                                onPolyline: () => { if (!this._activateTool('opening', 'polyline')) toolManager.activateOpeningTool('polyline'); },
                            });
                        },
                        disabled: () => false,
                    },
                ],
            },

            // ── SERVICES ──────────────────────────────────────────────────
            {
                id:    'services',
                label: 'Services',
                icon:  PryzmIcons.pryzmServices,
                tools: [
                    {
                        label:    'Bath',
                        shortcut: 'Alt+J',
                        icon:     PryzmIcons.pryzmBath,
                        action: () => { if (!this._activateTool('plumbing', 'bath'))   service.activatePlumbingTool('bath'); },
                        disabled: () => false,
                    },
                    {
                        label:    'Toilet',
                        shortcut: 'Alt+L',
                        icon:     PryzmIcons.pryzmToilet,
                        action: () => { if (!this._activateTool('plumbing', 'toilet')) service.activatePlumbingTool('toilet'); },
                        disabled: () => false,
                    },
                    {
                        label:    'Sink',
                        shortcut: 'Alt+Y',
                        icon:     PryzmIcons.pryzmSink,
                        action: () => { if (!this._activateTool('plumbing', 'sink'))    service.activatePlumbingTool('sink'); },
                        disabled: () => false,
                    },
                    {
                        label:    'Shower',
                        shortcut: 'Alt+G',
                        icon:     PryzmIcons.pryzmShower,
                        // Routes through the standardized plumbing pipeline
                        // (Contract 39 §2 — type-as-data) so the variant picker,
                        // wall-snap preview and PRYZM-purple/red feedback all
                        // come from PropertyPanel.showPlumbingPreDraw.
                        action: () => { if (!this._activateTool('plumbing', 'shower')) service.activatePlumbingTool('shower'); },
                        disabled: () => false,
                    },
                ],
            },

            // ── INTERIORS ─────────────────────────────────────────────────
            {
                id:    'interiors',
                label: 'Interiors',
                icon:  PryzmIcons.pryzmInteriors,
                tools: [
                    {
                        label: 'Sofas',
                        icon:  PryzmIcons.pryzmSofas,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Sofas',
                            furniturePanel:    true,
                            furnitureCategory: 'sofas',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Chairs',
                        icon:  PryzmIcons.pryzmChairsIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Chairs',
                            furniturePanel:    true,
                            furnitureCategory: 'chairs',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Tables',
                        icon:  PryzmIcons.pryzmTablesIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Tables',
                            furniturePanel:    true,
                            furnitureCategory: 'tables',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Beds',
                        icon:  PryzmIcons.pryzmBedsIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Beds',
                            furniturePanel:    true,
                            furnitureCategory: 'beds',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Wardrobes',
                        icon:  PryzmIcons.pryzmWardrobesIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Wardrobes',
                            furniturePanel:    true,
                            furnitureCategory: 'wardrobes',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Outdoor',
                        icon:  PryzmIcons.pryzmOutdoorIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Outdoor',
                            furniturePanel:    true,
                            furnitureCategory: 'outdoor',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Kitchen',
                        icon:  PryzmIcons.pryzmKitchenIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Kitchen',
                            furniturePanel:    true,
                            furnitureCategory: 'kitchen',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Decor',
                        icon:  PryzmIcons.pryzmDecorIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Decor',
                            furniturePanel:    true,
                            furnitureCategory: 'decor',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Soft Furnishings',
                        icon:  PryzmIcons.pryzmSoftFurnishingsIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Soft Furnishings',
                            furniturePanel:    true,
                            furnitureCategory: 'soft_furnishings',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Bathroom',
                        icon:  PryzmIcons.pryzmBathroomIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Bathroom',
                            furniturePanel:    true,
                            furnitureCategory: 'bathroom',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Storage',
                        icon:  PryzmIcons.pryzmStorageIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Storage',
                            furniturePanel:    true,
                            furnitureCategory: 'storage',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Kids',
                        icon:  PryzmIcons.pryzmKidsIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Kids',
                            furniturePanel:    true,
                            furnitureCategory: 'kids',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Teens',
                        icon:  PryzmIcons.pryzmTeensIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'Teens',
                            furniturePanel:    true,
                            furnitureCategory: 'teens',
                            items:             [],
                        } as any,
                    },
                    {
                        label: 'Lighting',
                        icon:  PryzmIcons.pryzmLightingIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:         'Lighting Fixtures',
                            lightingPanel: true,
                            items:         [],
                        } as any,
                    },
                    {
                        label: 'Component',
                        icon:  'material-symbols:category',
                        action: () => {
                            // Family Creator under reconstruction — see
                            // docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md
                            import('../../../familyCreatorPlaceholder').then(m => {
                                m.openFamilyCreatorPlaceholder();
                            });
                        },
                        disabled: () => false,
                    },
                ],
            },

            // ── LANDSCAPE ─────────────────────────────────────────────────
            {
                id:    'landscape',
                label: 'Landscape',
                icon:  PryzmIcons.plant,
                tools: [
                    {
                        label: 'Plants',
                        icon:  PryzmIcons.plant,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title: 'Plant Types',
                            items: [
                                { label: 'Plant 01', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_01') },
                                { label: 'Plant 02', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_02') },
                                { label: 'Plant 03', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_03') },
                                { label: 'Plant 04', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_04') },
                                { label: 'Plant 05', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_05') },
                                { label: 'Plant 06', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_06') },
                                { label: 'Plant 07', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_07') },
                                { label: 'Plant 08', icon: 'material-symbols:local-florist', action: () => service.activateFurnitureTool('plant_08') },
                            ],
                        } as any,
                        disabled: () => false,
                    },
                ],
            },
        ];
    }
}
