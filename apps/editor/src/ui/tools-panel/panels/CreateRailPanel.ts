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
// §FEAT-PERSISTENT-MODE-BAR (2026-08-07) — the slab's pre-flight launcher menu is
// gone: every one of its entries re-activated the tool and wiped the in-progress
// polyline. The slab now activates immediately and carries the wall's persistent
// DrawingModeBar, from which every mode is reachable MID-DRAW.
// §FEAT-PERSISTENT-MODE-BAR — the slab's shared, surface-independent mode store.
import { resolveActiveSlabDrawMode } from '@app/engine/views/plantools/activeSlabDrawMode';
import { ColumnModePicker } from '../../ColumnModePicker';
import { BeamModePicker } from '../../BeamModePicker';
import { OpeningModePicker } from '../../OpeningModePicker';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import * as PryzmIcons from '../../icons/PryzmIcons';
import { masterPlanningTools } from './masterPlanningRailRegistry.js';
import { registerSiteworksRailTools } from './siteworksRailTools.js';
// ⭐ ADR-0383's half of the SAME category (lane MP-WIRE, 2026-09-09) — see
// `massingRailTools.ts` for why this is a registry row and not a second rail.
import { registerMassingRailTools } from './massingRailTools.js';
import { FurnitureSidePanel } from '../../furniture-carousel/FurnitureSidePanel';
import { buildLightingPanel } from './CreateRailPanelLighting';
import { shortcutForTool, formatTooltip } from './creationToolShortcuts';
// §AUTHORING-CONTEXT-GATE (L-5102) — the second live element-creation shortcut
// layer reads the SAME predicate as the first. Before this it gated on
// `getLevels().length > 0`, which answers a different question (see below).
import { refuseElementAuthoring } from '../../layout/elementAuthoringContext';
// LANDSCAPE-CATALOGUE (L-1380) - one derived source, both create surfaces.
import { buildTreeCreateItems, buildPottedPlantCreateItems } from '../../create/landscapeCreateItems';
// §FEAT-BALCONY-COMPOUND (L-5606) — PLAN-ONLY tools are armed by the plan OVERLAY,
// not by the 3-D ToolManager, and they refuse OUT LOUD when no plan surface is open.
import { activatePlanOnlyToolOrExplain } from '../../create/activatePlanOnlyTool';

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

    /**
     * ADR-0384 D7 - the siteworks entries are registered ONCE per process, not
     * once per panel. The rail is rebuilt on every discipline switch, and the
     * registry is idempotent on `key` anyway, but registering in the constructor
     * of a class that can be instantiated twice would still be a second writer.
     */
    private static _masterPlanningToolsRegistered = false;

    private _sectionState: Record<string, SectionState> = {
        architecture: { isOpen: true,  isLocked: false, openedAt: Date.now() },
        structure:    { isOpen: false, isLocked: false, openedAt: 0 },
        services:     { isOpen: false, isLocked: false, openedAt: 0 },
        interiors:    { isOpen: false, isLocked: false, openedAt: 0 },
        landscape:    { isOpen: false, isLocked: false, openedAt: 0 },
        // ADR-0384 D7 / C116.
        masterplanning: { isOpen: false, isLocked: false, openedAt: 0 },
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

        // ADR-0384 D7 / C116 — put THIS family's three entries into the shared
        // Master planning registry. `getRuntime` is a THUNK, not the value: the
        // runtime is threaded in at construction and can be null during early boot,
        // and a captured null would make every button silently dead forever, which
        // is the exact C82 shape the registry exists to prevent.
        if (!CreateRailPanel._masterPlanningToolsRegistered) {
            CreateRailPanel._masterPlanningToolsRegistered = true;
            registerSiteworksRailTools(
                () => (CreateRailPanel._activeInstance?.runtime ?? window.runtime) as never,
            );
            // ⭐ ADR-0383 — the BUILDINGS half of "Master planning", into the SAME
            // registry and under the SAME once-guard. `masterPlanningRailRegistry.ts`
            // measured this row as MISSING and named it as the orchestrator's call;
            // this is that row. ⛔ It takes no runtime thunk because neither entry
            // dispatches — the one master-planning mutation is the
            // `spaceEnvelope.batch.create` the Parcel Law section sends (P6).
            registerMassingRailTools();
        }

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
        // §AUTHORING-CONTEXT-GATE (L-5102) — ⭐ the same predicate the two-letter
        // layer asks. It is deliberately asked BESIDE the level check, not
        // instead of it: they are two different propositions and collapsing them
        // would lose one.
        //
        //   · `elementAuthoringAvailability()` — "is this a context where BIM
        //     elements can be authored at all?" (no, during guided setup).
        //   · `getLevels().length > 0` — "does this model have somewhere to put
        //     one?" A level-less canvas is a real, separate refusal.
        //
        // The level check ALONE was the gap: it is a PROXY for "a model exists",
        // and a proxy that another layer did not copy. That divergence — one
        // layer gating on levels, one gating on nothing — is exactly what the
        // founder's 'WA' report surfaced.
        if (refuseElementAuthoring('CreateRailPanel shortcut')) return;

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
            // §CREATE-SHORTCUT-SSOT — hover tooltip is "Name (Shortcut)", e.g.
            // "Wall (Alt+W)". The shortcut is read from the SAME `tool.shortcut`
            // field the key handler fires on (stamped from creationToolShortcuts),
            // so the label and the live binding can never disagree. A tool with
            // no shortcut shows just its name (no empty brackets).
            cell.title = formatTooltip(tool.label, tool.shortcut);

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
            // §CREATE-SHORTCUT-SSOT — the floating hover label shows the same
            // "Name (Shortcut)" text as the native tooltip (single source).
            lbl.textContent = formatTooltip(tool.label, tool.shortcut);

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
        for (const id of ['CREATE_ARCH', 'CREATE_STRUCT', 'CREATE_SERVICES', 'CREATE_INTERIORS', 'CREATE_LANDSCAPE', 'CREATE_MASTERPLAN']) {
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

        const sections: DisciplineSection[] = [
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
                            // ⭐ §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR (founder
                            // 2026-08-24) — this read `'polyline_ortho'`, LOWER-CASE,
                            // while the third line below already used the enum. The
                            // two branches of one button armed two different modes:
                            // a lower-case string is not a `WallDrawingMode` member,
                            // so it matched no `===` in `WallTool` and the ortho lock
                            // was inert. Pass the enum's own value on every branch.
                            if (!this._activateTool('wall', WallDrawingMode.POLYLINE_ORTHO)) {
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
                        // §FIX-STAIR-SHAPE-DESYNC — the CURVED shape has always been
                        // authorable in StairPathParamPanel but had no palette icon, so
                        // it was unreachable from the ARCHITECTURE panel. The shape set
                        // is now declared once in `STAIR_SHAPES` (@pryzm/geometry-stair);
                        // this row is its palette face.
                        label:    'Stair (C)',
                        shortcut: 'Alt+Shift+C',
                        icon:     PryzmIcons.pryzmStairC,
                        action: () => { if (!this._activateTool('stair', 'C')) service.activateStairPathTool('C'); },
                    },
                    {
                        label:    'Handrail',
                        shortcut: 'Alt+H',
                        icon:     PryzmIcons.pryzmHandrail,
                        // §FIX-HANDRAIL-PANEL-ORDER (L-1104, C95 §15.5) — ACTIVATE ON THE
                        // FIRST CLICK, exactly as the Wall tile above does.
                        //
                        // FOUNDER: *"The handrail today puts TYPE FIRST and MODE SECOND.
                        // That is wrong. Make the handrail match the wall exactly."*
                        //
                        // ⛔ THIS TILE USED TO OPEN A BLOCKING PRE-FLIGHT `HandrailModePicker`
                        // — a centred modal list of types at `top:54px; z-index:9999`, i.e.
                        // ON TOP OF and 14px ABOVE where the mode bar renders — and the tool
                        // activated only from its `onSelectType`. So the user saw TYPE alone,
                        // dismissed it, and only then got the mode bar: the exact inversion
                        // reported. The wall never had a pre-flight; it activates here and the
                        // mode bar + "NEW WALL" card appear together, side by side, in one
                        // frame (`PropertyPanel._positionWallPreDrawBesideModeBar` pins the
                        // card to `.wdh-bar`'s right edge at the same top).
                        //
                        // ⚠ NO CAPABILITY IS LOST. The picker's ONLY unique job was choosing a
                        // type before drawing, and the pre-draw card does that with the SAME
                        // catalogue through `buildRailingTypeSelectorWidget` — while the tool
                        // is live, so the type can be changed between segments instead of only
                        // before the first one. That is strictly more, not less.
                        action: () => {
                            if (!this._activateTool('handrail', this._selectedHandrailTypeId)) {
                                service.activateHandrailTool(this._selectedHandrailTypeId);
                            }
                        },
                    },
                    {
                        // §FEAT-BALCONY-COMPOUND (founder, 2026-08-22) — L-5606 · C103 · ADR-0333.
                        //
                        //   "Please create a 'balcony compound system'. Like swimming pool.
                        //    Should be under ARCHITECTURAL TAB."
                        //
                        // ⭐ THIS ROW IS AXIS 3, AND IT IS THE AXIS THE POOL STILL HAS OPEN.
                        // Measured 2026-08-22:
                        //   grep -rniE "'pool'|\"pool\"|swimming" apps/editor/src/ui/                         //     | grep -viE "pool_table|pool-table"   ->  0
                        // The swimming pool is fully dispatchable and has a plan handler in
                        // the shared registry, and there is NO palette row for it anywhere —
                        // so the founder's original "not able to access via UI" report is
                        // still live. The balcony does not repeat that: the row ships with
                        // the tool.
                        //
                        // ⛔ NOT `this._activateTool('balcony')`. That routes to
                        // `runtime.tools.activate()` — the 3-D ToolManager — and
                        // `TOOL_MANAGER_TOOL_KEYS` has no `balcony` key BY DESIGN (a hosted
                        // compound is placed against a facade in plan; the matrix row
                        // declares the 3-D gap rather than pretending). Calling it would
                        // report activation and activate nothing, which is the founder's
                        // "Create Stair" defect exactly.
                        label:    'Balcony',
                        shortcut: 'Alt+Shift+A',
                        // §FEAT-NEW-CATEGORY-ICONS (L-10500) — was `material-symbols:balcony`.
                        icon:     PryzmIcons.pryzmBalcony,
                        action: () => {
                            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
                        },
                    },
                    {
                        // §FIX-LIFT-UNREACHABLE (founder, 2026-08-22) — L-7020..L-7024 · C104.
                        //
                        //   "Lift — it should be under ARCHITECTURE, but could not see it!"
                        //
                        // ⛔ C01 §6 RULE 6, AND THE VERDICT DIFFERED PER SURFACE.
                        // Measured before this row existed:
                        //   rg -n "lift" apps/editor/src/ui/tools-panel/panels/CreateRailPanel.ts
                        //     ->  0 hits.  On THIS surface the lift was ABSENT.
                        //   CreatePanelLayout.ts:300  ->  a row existed, under STRUCTURE.
                        // So one surface had nothing and the other had it filed where the
                        // founder was not looking. That split is L-1380 exactly — two live
                        // create surfaces, a capability added to one — and it is why this row
                        // and the `CreatePanelLayout` one land in the SAME commit.
                        //
                        // ⭐ AND IT IS UNDER ARCHITECTURE, WHERE HE ASKED FOR IT. A lift is
                        // vertical circulation: it belongs beside the stair and the handrail,
                        // not beside the beam. The old Structure filing was not a typo — it
                        // was the massing-era lift, which is a different object (see below).
                        //
                        // ⛔ NOT `props.toolManager.activateLift()`. That drives the LEGACY
                        // MASSING command `CreateVerticalCirculationCommand`, NOT
                        // `lift.create` — `PluginRegistry.ts:465` records the divergence in
                        // as many words (L-5709). This row arms `LiftPlanToolHandler`, which
                        // dispatches the C104 COMPOUND: shaft enclosure, one landing door per
                        // served storey, five cabin parts, and a void in every slab it passes
                        // through, in ONE undo entry.
                        label:    'Lift',
                        shortcut: 'Alt+Shift+V',
                        // §FEAT-NEW-CATEGORY-ICONS (L-10500) — was `material-symbols:elevator-outline`.
                        icon:     PryzmIcons.pryzmLift,
                        action: () => {
                            activatePlanOnlyToolOrExplain('lift', 'Lift');
                        },
                    },
                    {
                        // §FEAT-CONSTRUCTION-BOUNDARY-LINE (founder, 2026-08-23) —
                        // L-7933 · C106 · ADR-0348.
                        //
                        //   "New feature - create a construction boundary line element
                        //    (under the ARCHITECTURE tab). We have the side-line boundary
                        //    from the parcel, but I want to be able to create the boundary
                        //    CONSTRUCTION line."
                        //
                        // ⭐ UNDER ARCHITECTURE, WHERE HE ASKED FOR IT, AND BESIDE THE
                        // WALL — because a setting-out line is what an architect draws
                        // BEFORE the walls, and because it offers the wall's own six
                        // creation modes.
                        //
                        // ⛔ IT IS NOT THE PARCEL BOUNDARY, and the founder's own sentence
                        // makes the distinction: "we HAVE the side-line boundary from the
                        // parcel". `Parcel.boundary` (C19 §1.4) is the LEGAL lot outline —
                        // surveyed, recorded, and ONE-SHOT IMMUTABLE; there is deliberately
                        // no `site.editParcelBoundary` command anywhere. This row creates a
                        // DIFFERENT element, in its own store, with its own contract.
                        //
                        // ⛔ NOT `this._activateTool('boundary-line')`. That routes to
                        // `runtime.tools.activate()` — the 3-D ToolManager — and
                        // `TOOL_MANAGER_TOOL_KEYS` has no `boundary-line` key BY DESIGN (a
                        // setting-out line is a PLAN gesture; the creation matrix declares
                        // the 3-D gap rather than pretending). Calling it would report
                        // activation and activate nothing — the founder's "Create Stair"
                        // defect exactly.
                        //
                        // ⭐ AND IT LANDS ON BOTH CREATE SURFACES IN THE SAME COMMIT.
                        // L-1380 is what happens when only one of them learns about a tool.
                        label:    'Boundary Line',
                        shortcut: 'Alt+Shift+N',
                        // §FEAT-NEW-CATEGORY-ICONS (L-10500) — was `material-symbols:polyline-outline`.
                        icon:     PryzmIcons.pryzmBoundaryLine,
                        action: () => {
                            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
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
                            // §FIX-FINISH-MODE-PLAN-UNREACHABLE — see 'Auto Floor'.
                            if (!this._activateTool('ceiling:auto')) {
                                service.activateCeilingTool(undefined, 'auto');
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
                            // §FIX-FINISH-MODE-PLAN-UNREACHABLE — pass the mode as an
                            // ACTIVATION argument. Setting `floorTool.setMode()` here
                            // put AUTO on the 3D tool instance only, so the plan
                            // handler (which reads floorModePicker) never saw it and
                            // AUTO was unreachable in plan view.
                            if (!this._activateTool('floor:auto')) {
                                service.activateFloorTool(undefined, 'auto');
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
                            // §FEAT-PERSISTENT-MODE-BAR (founder 2026-08-07) — activate
                            // immediately in the last-chosen mode and let the persistent
                            // bar carry every mode, exactly as the wall does. The old
                            // pre-flight menu re-activated the tool on every pick, which
                            // wiped any in-progress polyline.
                            const slabMode = resolveActiveSlabDrawMode();
                            if (!this._activateTool('slab', slabMode)) service.activateSlabTool(slabMode);
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
                    {
                        // §BATH102 (founder, 2026-08-25) — L-11480 · C109 · C109 R-11.
                        //
                        //   "I WANT YOU TO CREATE LOD 300 TOILET COMPOUNDS - MODULES -
                        //    PARAMETRIC - MEANS THAT I CAN ADAPT THE MODULE TO THE ROOM
                        //    DIMENSIONS: SINK (LOD200) + TOILET + SHOWER + PANEL ETC...
                        //    ADD THIS NEW CATEGORY IN SERVICES."
                        //
                        // ⭐ AXIS 3 OF C109 §9's SEVEN — *"is there a row a person can see,
                        // in the section they would look in?"* — and it is UNDER SERVICES,
                        // where he asked for it. ⛔ Axis 3 and axis 4 are DIFFERENT
                        // QUESTIONS and C109 R-9 forbids collapsing them: C104 R-10 exists
                        // because axis 3 was reported closed on the strength of a
                        // dispatch-layer suite while the founder's actual report — *"Lift —
                        // it should be under Architecture, but could not see it!"* — was
                        // about a palette SECTION, which no dispatch-layer test can see.
                        // The pointer proof is `bathroomPodPointerReach.spec.ts`.
                        //
                        // ⛔ C109 R-11 — THIS ROW NAMES ONE OBJECT AND SHADOWS NONE OF THE
                        // FOUR ABOVE. Bath / Toilet / Sink / Shower stay exactly as they
                        // are: they are how an architect places ONE fixture. This is a
                        // fifth, differently-named row that produces a COMPOUND.
                        //
                        // ⛔ NOT `this._activateTool('bathroom-pod')`. There is no
                        // `ToolManager` activator for it and there must not be: the pod is
                        // PLAN-ONLY (the gesture is a room rectangle, C109 §5.1), and
                        // `activatePlanOnlyToolOrExplain` is the ONE entry point that arms
                        // every attached plan surface, suppresses 3-D selection, and — when
                        // no plan view is open — REFUSES OUT LOUD in a toast naming the
                        // route back (C16 CA-18) instead of reporting an activation that
                        // activated nothing.
                        label:    'Bathroom Pod',
                        icon:     PryzmIcons.pryzmBath,
                        action: () => {
                            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
                        },
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
                        // §TVFURN114 (founder, 2026-08-26) — "TV & Media": TV
                        // lowboards + media consoles, the founder's own section.
                        label: 'TV & Media',
                        icon:  PryzmIcons.pryzmTvMediaIcon,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title:             'TV & Media',
                            furniturePanel:    true,
                            furnitureCategory: 'tv_media',
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
                        // §COMPONENT-BROWSER (lane U1, UIUX-PLAN §U1) — the REAL
                        // Components entry on the SECOND create surface (L-1380).
                        // This row routed to the `familyCreatorPlaceholder` "under
                        // construction" modal until 2026-09-02; the placeholder files
                        // are DELETED (both copies, plus their scaffold test — the
                        // retiring-assertion mechanism firing as designed).
                        label: 'Components',
                        icon:  'material-symbols:category',
                        action: () => {
                            import('../../component-browser/index').then(m => {
                                m.openComponentBrowser();
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
                // LANDSCAPE-CATALOGUE (L-1380) - these two lists are DERIVED from
                // LANDSCAPE_CATALOGUE (@pryzm/geometry-furniture), not typed here.
                // They previously read Plant 01..Plant 08 under one droplet icon
                // while the 25-species parametric outdoor tree library - real
                // species, mature heights, crown radii, architectural plan symbols -
                // was reachable only from the Interiors furniture carousel.
                // Trees and potted plants are SEPARATE tools on purpose: a 16 m
                // Podocarpus and a 0.5 m glass table vase are not one family, and
                // collapsing them is the vocabulary defect this replaces.
                tools: [
                    {
                        // §FIX-POOL-UNREACHABLE axis 3 (founder, 2026-08-22) — L-5690.
                        //
                        //   "there is an element called swimming pool that at least is not
                        //    able to access via UI"
                        //
                        // ⭐ THE FOUNDER'S ORIGINAL REPORT WAS STILL LIVE. L-5200 closed
                        // axes 1 + 2 (the PluginRegistry descriptor, so `pool.create` can
                        // be dispatched at all) and L-5210 added `PoolPlanToolHandler` to
                        // the shared plan registry — and then the lane ended. NOTHING
                        // OFFERED THE TOOL. Measured 2026-08-22, and the pattern AND the
                        // exclusions are stated because a bare substring reports the
                        // opposite of the truth here:
                        //   grep -rniE "'pool'|\"pool\"|swimming" apps/editor/src/ui/ \
                        //     | grep -viE "pool_table|pool-table"     ->  0
                        // (The unqualified `grep -rni "pool" apps/editor/src/ui/` returns
                        // 65 hits, EVERY one irrelevant — a local variable named `pool` in
                        // `boundaryGuard.ts` and a `kave_pool_table` furniture entry.
                        // `PluginRegistry.ts`'s comment claiming "the LANDSCAPE palette
                        // row" closed axis 3 is FALSE; this row is the first one.)
                        //
                        // ⛔ NOT `this._activateTool('pool')`. `TOOL_MANAGER_TOOL_KEYS`
                        // has no `pool` key — the creation matrix declares the pool
                        // plan-only rather than pretending otherwise — so the 3-D route
                        // would report activation and activate nothing.
                        label: 'Swimming Pool',
                        icon:  'material-symbols:pool',
                        action: () => {
                            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
                        },
                    },
                    {
                        label: 'Trees',
                        icon:  PryzmIcons.plant,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title: 'Trees & Planting',
                            items: buildTreeCreateItems(t => service.activateFurnitureTool(t)),
                        } as any,
                        disabled: () => false,
                    },
                    {
                        label: 'Potted Plants',
                        icon:  PryzmIcons.plant,
                        action: () => { /* handled by subPanel */ },
                        subPanel: {
                            title: 'Potted Plants',
                            items: buildPottedPlantCreateItems(t => service.activateFurnitureTool(t)),
                        } as any,
                        disabled: () => false,
                    },
                ],
            },
            // ── MASTER PLANNING (ADR-0384 D7 · C116) ──────────────────────
            //
            // ⭐ THE TOOLS COME OUT OF A REGISTRY, NOT OUT OF THIS FILE. ADR-0384 D7
            // rules that "Master planning" is ONE category CO-OWNED with ADR-0383
            // (massing groups) — laying out a site is placing BUILDINGS and placing
            // THE GROUND BETWEEN THEM — so the entries are DATA that either lane
            // registers into `masterPlanningRailRegistry`. Two rails both called
            // "Master planning" would be C82's 267-of-280 dead-pair census at its
            // first instant.
            //
            // ⚠ ADR-0383 carries NO reciprocal ruling today (measured: no "rail",
            // "category" or "registry" in that ADR, and its landed code adds no
            // entry). The registry is built so that lane can join it without
            // touching this file; the missing obligation is named in
            // `masterPlanningRailRegistry.ts` rather than assumed.
            {
                id:    'masterplanning',
                label: 'Master planning',
                icon:  PryzmIcons.pryzmMasterPlanning,
                tools: masterPlanningTools().map((e) => ({
                    label:    e.label,
                    icon:     e.icon,
                    action:   e.action,
                    disabled: e.disabled ?? (() => false),
                })),
            },
        ];

        // §CREATE-SHORTCUT-SSOT — stamp every tool's shortcut from the single
        // canonical map (creationToolShortcuts.ts) so the key handler and the
        // hover tooltip can never drift, and so a tool missing from the map is
        // caught by the completeness unit test. The map is authoritative: it
        // overrides any inline `shortcut` left on a tool above.
        for (const section of sections) {
            for (const tool of section.tools) {
                tool.shortcut = shortcutForTool(tool.label);
            }
        }
        return sections;
    }
}
