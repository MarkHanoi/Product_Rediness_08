import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { EditorMode } from '@pryzm/core-app-model';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { UpdateFurnitureParametersCommand } from '@pryzm/command-registry';

// ── Wave 14 extracted section modules ─────────────────────────────────────
import { appendWallLayerSection }       from './property-inspector/WallLayerSection';
import { appendSlabLayerSection }       from './property-inspector/SlabLayerSection';
import { appendFurnitureIdentitySection } from './property-inspector/FurniturePropertySection';
import { appendFloorIdentitySection }   from './property-inspector/FloorPropertySection';
import { appendCeilingIdentitySection } from './property-inspector/CeilingPropertySection';
import { applyChanges as _applyChanges, ApplyContext } from './property-inspector/PropertyInspectorApply';
// ── Wave 7 WS-B extracted helpers ─────────────────────────────────────────
import { appendRoomRelationships }         from './property-inspector/PropertyInspectorRoomRelationships';
import { createMaterialSelect as _createMaterialSelect, appendColumnOrientationControls } from './property-inspector/PropertyInspectorControls';

interface WindowData {
    frameColor?: string;
    type?: string;
    windowType?: string;
    width?: number;
    height?: number;
    sillHeight?: number;
    wallId?: string;
}

interface DoorData {
    frameColor?: string;
    type?: string;
    doorType?: string;
    width?: number;
    height?: number;
    sillHeight?: number;
    wallId?: string;
}

interface WallStore {
    getWindow(id: string): WindowData | undefined;
    updateWindow?(id: string, props: Partial<WindowData>): void;
    updateDoor?(id: string, props: Partial<DoorData>): void;
    update?(id: string, props: any): void;
    doors?: Map<string, DoorData>;
    getById?(id: string): any;
    walls?: Map<string, any>;
}

export class PropertyInspector {
    element: HTMLDivElement;
    private selectedObject: THREE.Object3D | null = null;
    private wallStore: WallStore | null;
    private _roofStore: { getById(id: string): any; update(id: string, data: any): any } | null = null;
    private _roofBuilder: { updateRoof(data: any): void } | null = null;

    setRoofStore(store: { getById(id: string): any; update(id: string, data: any): any }): void {
        this._roofStore = store;
    }
    setRoofBuilder(builder: { updateRoof(data: any): void }): void {
        this._roofBuilder = builder;
    }

    private matSelect: HTMLSelectElement | null = null;
    private colorInput: HTMLInputElement | null = null;
    private applyBtn: HTMLButtonElement | null = null;
    private translateBtn: HTMLButtonElement | null = null;
    private rotateBtn: HTMLButtonElement | null = null;
    private frameColorInput: HTMLInputElement | null = null;

    private sceneObjectCache: Map<string, string> = new Map();

    // §02 §3.5: Staging for pending visual changes — never written to userData.
    private pendingMaterialColor: string | undefined = undefined;
    private pendingMaterialId: string | null | undefined = undefined;
    private pendingFrameColor: string | undefined = undefined;

    private levelSelector: HTMLSelectElement | null = null;

    /** Phase B.5 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private callbacks: {
            onUnselect: () => void,
            onApplyHighlight: (obj: THREE.Object3D) => void,
            onUpdateShadows: () => Promise<void>,
            transformControls: any,
            materialMap: Map<string, any>,
            getCurrentVisualStyle: () => any
        },
        wallStore?: WallStore,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.element = document.createElement('div');
        // §FEAT-PROPERTY-PANEL-CARD-LAYOUT (L-276) — the hook the card stylesheet is
        // scoped to. Scoped deliberately: these rules must never leak into other panels.
        this.element.classList.add('property-inspector');
        this.wallStore = wallStore || window.wallStore || null; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
        this.setupStyles();
        this.createReusableElements();
        this.createLevelSelector();
    }

    /**
     * Phase B.5.2 (S73-WIRE) — Unified command dispatch helper.
     *
     * Centralises all `the legacy command manager` calls that were previously
     * scattered as `const cmdMgr = commandManager; bus.executeCommand(…)`
     * across per-element branches.  Consolidating them here:
     *   • Reduces the window-global surface to **one** guarded reach.
     *   • Provides the switch point for the Phase E.5.x runtime migration
     *     (`runtime.bus.executeCommand`), so Phase E only changes this method.
     *   • Mirrors the pattern used by LeftNavRail (B.3) and PropertyInspector
     *     sub-sections (B.6-a..d).
     *
     * Phase B.5.5 (S73-WIRE) — JSDoc contract note:
     *   Once Phase E.5.x lands, replace the `commandManager`
     *   fallback with `this.runtime!.bus.executeCommand(eventKey, payload)` and
     *   delete the legacy branch entirely.
     *
     * @param cmd       The legacy command object (e.g. `new UpdateWallSystemTypeCommand(…)`).
     *                  Passed as-is to the legacy commandManager; the runtime path
     *                  will receive a structured payload instead (Phase E.5.x rework).
     * @param eventKey  Semantic event key for `runtime.bus.executeCommand`
     *                  (e.g. `'wall.systemType.update'`).  Optional — ignored by the
     *                  legacy path; used by the runtime path once E.5.x lands.
     *
     * TODO(E.5.x): delete legacyCmd param and window-global fallback — Phase E.5.x
     *              (commandManager migration).  Replace body with:
     *                  this.runtime!.bus.executeCommand(eventKey!, payload);
     */
    private execUpdate(cmd: unknown, _eventKey?: string): void {
        // F.2.1-F.2.11 Wave 14 — runtime.bus.executeCommand dual-path (Phase B.5.2).
        // When runtime is wired AND a semantic eventKey is provided, route through
        // the runtime bus so Phase E.5.x can delete the window.commandManager path.
        if (this.runtime?.bus && _eventKey) {
            this.runtime.bus.executeCommand(_eventKey, cmd);
            return;
        }
        // Phase E.5.x: runtime.bus is not available or no eventKey provided.
        // Commands without an eventKey cannot be dispatched — log and drop.
        console.warn('[PropertyInspector] execUpdate: runtime.bus not available or no eventKey for command:', cmd);
    }

    private createLevelSelector() {
        const ctx = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
        if (!ctx) return;

        const container = document.createElement('div');
        container.className = 'pi-section';
        container.style.padding = '12px';
        container.style.marginBottom = '12px';
        container.style.background = 'var(--app-panel-bg,#f1f3f5)';

        const label = document.createElement('div');
        label.className = 'pi-label';
        label.style.marginBottom = '8px';
        label.style.fontWeight = 'bold';
        // §L-946 (RELABEL ONLY — the wiring below is deliberately untouched).
        // This control sets `ctx.activeLevelId` and never reads or writes the
        // SELECTION. In a properties panel that reads as "the selected element's
        // level", which is the neighbouring control (`PropertyPanelSections.ts`
        // "Change Level", the one the founder reported). Two dropdowns, both
        // saying "Level", one moving the element and one not, is a UI that
        // teaches the user the feature is broken even once it works. The name now
        // says what it does: it chooses where the NEXT element is drawn.
        label.textContent = 'Draw On Level (new elements)';

        this.levelSelector = document.createElement('select');
        this.levelSelector.className = 'pi-input';
        this.levelSelector.style.border = '2px solid var(--app-accent,#2196f3)';

        this.updateLevelSelectorOptions();

        this.levelSelector.value = ctx.activeLevelId;
        this.levelSelector.addEventListener('change', (e: any) => {
            const ctx = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
            if (ctx) ctx.activeLevelId = e.target.value;
        });

        // Subscribe to context changes to keep UI in sync
        ctx.subscribe((event: string, data: any) => {
            if (event === 'activeLevelChanged' && this.levelSelector) {
                this.levelSelector.value = data.levelId;
            } else if (event === 'levelAdded' || event === 'levelRemoved') {
                this.updateLevelSelectorOptions();
            }
        });

        container.appendChild(label);
        container.appendChild(this.levelSelector);

        // Insert at the top of the inspector
        if (this.element.firstChild) {
            this.element.insertBefore(container, this.element.firstChild);
        } else {
            this.element.appendChild(container);
        }

        // §P3.6-PI (B3.6-PI): Replace commandManager.onCommandExecuted with runtime.events.
        // 'model-updated' fires after any element mutation dispatched through the bus
        // handlers.  No payload — the inspector re-reads from stores on its own.
        // Contract 31.7.
        if (this.runtime?.events) {
            this.runtime.events.on('model-updated', () => {
                if (this.selectedObject) {
                    this.update(this.selectedObject);
                }
            });
        }
    }

    private updateLevelSelectorOptions() {
        if (!this.levelSelector) return;

        const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
        if (!wallStore) {
            console.warn('[PropertyInspector] updateLevelSelectorOptions: wallStore not yet available — skipping level selector update'); // TASK-10 T3
            return;
        }

        const levels = wallStore.getLevels();
        const currentValue = this.levelSelector.value;

        this.levelSelector.innerHTML = '';
        levels.forEach((l: any) => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.name} (${l.elevation}m)`;
            this.levelSelector?.appendChild(opt);
        });

        if (currentValue && levels.some((l: any) => l.id === currentValue)) {
            this.levelSelector.value = currentValue;
        }
    }

    public hide() {
        this.element.style.display = 'none';
        this.selectedObject = null;
        // Wave 6 Phase B real binding — panel unmount deactivation.
        // Symmetric to the activatePanel call in update(). Idempotent.
        this.runtime?.viewRegistry.deactivatePanel('property-inspector');
    }

    private setupStyles() {
        // ── §FEAT-PROPERTY-PANEL-CARD-LAYOUT (L-276) ─────────────────────────────
        //
        // THE FOUNDER, with the Autodesk Forma inspector as the reference:
        //   "Redesign the properties panel — more elegant, more simple and minimalist,
        //    yet more modern. Each SECTION is an individual component; BETWEEN them is
        //    TRANSPARENT; although everything as a whole is the panel."
        //
        // That sentence is the whole spec, and it INVERTS what we had. Before: ONE heavy
        // opaque slab (white card, 1px border, 24px shadow, 1rem padding) with grey-tinted
        // sections stamped INSIDE it — the container was the object and the sections were
        // decoration on it.
        //
        // Forma's model is the opposite, and it is why it reads as calm: THE PANEL IS NOT
        // A SURFACE. It is a transparent COLUMN — a layout, nothing more. Each section is
        // an autonomous card that floats on the scene, and the gaps between them are the
        // scene itself showing through. Depth comes from the CARDS, never from the frame.
        //
        // So the container loses everything that made it an object: no background, no
        // border, no shadow, no padding. It keeps only what a column needs — position,
        // width, scroll, and the GAP that separates its children. The chrome moves to
        // `.pi-section` (see the stylesheet below), where each card carries its own
        // surface, radius and shadow.
        //
        // Consequence worth stating, because it is the point rather than a side effect:
        // remove a section and nothing is left behind — no empty framed void, just scene.
        this.element.style.cssText = `
            position: fixed;
            top: 12px;
            right: 60px;
            width: 320px;
            max-height: calc(100vh - 24px);
            color: var(--app-text,#333);
            font-family: var(--app-font);
            display: none;
            flex-direction: column;
            gap: 10px;
            background: transparent;
            border: none;
            box-shadow: none;
            padding: 0;
            z-index: 1000;
            overflow-y: auto;
            overflow-x: hidden;
            pointer-events: auto;
            scrollbar-width: thin;
        `;

        this._injectCardStyles();
    }

    /**
     * §FEAT-PROPERTY-PANEL-CARD-LAYOUT (L-276) — the card chrome.
     *
     * Injected once, and deliberately scoped to `.property-inspector` so it cannot leak
     * into the rest of the app. Every rule here exists to move the "surface" from the
     * CONTAINER to the SECTION, which is the founder's entire brief.
     *
     * `!important` is used ONLY where a rule must beat a pre-existing INLINE style set by
     * the legacy section builders (e.g. `container.style.background = '#f1f3f5'`). That is
     * the one thing inline styles win by default, and rewriting ~15 call sites to remove
     * their inline chrome would be a far riskier change than overriding it in one place.
     * When those builders are migrated, the `!important`s here should go with them.
     */
    private _injectCardStyles(): void {
        const ID = 'pi-card-styles';
        if (document.getElementById(ID)) return;

        const style = document.createElement('style');
        style.id = ID;
        style.textContent = `
            /* Each section is an AUTONOMOUS CARD. The panel is only the column it sits in. */
            .property-inspector .pi-section {
                background: var(--app-card-bg, rgba(255,255,255,0.92)) !important;
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(0,0,0,0.06);
                border-radius: 14px;
                padding: 14px 14px 12px !important;
                margin: 0 !important;          /* the COLUMN owns the spacing, not the card */
                box-shadow: 0 1px 2px rgba(16,24,40,0.04),
                            0 6px 16px rgba(16,24,40,0.08);
                transition: box-shadow .18s ease, transform .18s ease;
            }

            /* A card lifts on hover — the only motion in the panel, and it is a hint that
               the card is the unit you interact with, not the frame around it. */
            .property-inspector .pi-section:hover {
                box-shadow: 0 1px 2px rgba(16,24,40,0.05),
                            0 10px 24px rgba(16,24,40,0.10);
            }

            /* Section titles: quiet. Minimalism here is not decoration — a loud label on
               every card would re-create the visual noise the founder is asking us to
               remove. Uppercase + tracking gives hierarchy WITHOUT weight or colour. */
            .property-inspector .pi-section > .pi-label:first-child,
            .property-inspector .pi-section-title {
                font-size: 10.5px;
                font-weight: 600 !important;
                letter-spacing: .07em;
                text-transform: uppercase;
                color: var(--app-text-muted, #667085);
                margin-bottom: 10px !important;
            }

            /* Inputs: flat, borderless until touched. The field IS the value; the box is
               only summoned when the user engages with it. */
            .property-inspector .pi-input,
            .property-inspector input[type="text"],
            .property-inspector input[type="number"],
            .property-inspector select {
                width: 100%;
                box-sizing: border-box;
                background: var(--app-input-bg, rgba(16,24,40,0.03));
                border: 1px solid transparent !important;
                border-radius: 8px;
                padding: 7px 9px;
                font: inherit;
                font-size: 12.5px;
                color: var(--app-text, #101828);
                transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
            }
            .property-inspector .pi-input:hover,
            .property-inspector select:hover {
                background: var(--app-input-bg-hover, rgba(16,24,40,0.055));
            }
            .property-inspector .pi-input:focus,
            .property-inspector input:focus,
            .property-inspector select:focus {
                outline: none;
                background: #fff;
                border-color: var(--pryzm-purple, #6600FF) !important;
                box-shadow: 0 0 0 3px rgba(102,0,255,0.12);
            }

            /* Rows: label left, value right. Reading a property should be one glance. */
            .property-inspector .pi-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 3px 0;
            }
            .property-inspector .pi-row > label,
            .property-inspector .pi-row > .pi-label {
                flex: 0 0 auto;
                font-size: 12px;
                color: var(--app-text-muted, #667085);
                text-transform: none;
                letter-spacing: 0;
                font-weight: 400;
            }

            /* THE HEADER IS A CARD TOO — but a QUIET one.
               It was a saturated purple gradient slab, and it dominated a panel whose job
               is to show the user their data. PRYZM's purple is a BRAND accent, not a
               background: it now appears as a 3px identity rail on the leading edge and in
               the type name, and nowhere else. The card carries the element's identity;
               it does not shout it. (Brand: white + #6600FF, never black.) */
            .property-inspector .pi-header {
                background: var(--app-card-bg, rgba(255,255,255,0.92)) !important;
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
                color: var(--app-text, #101828) !important;
                border: 1px solid rgba(0,0,0,0.06);
                border-left: 3px solid var(--pryzm-purple, #6600FF);
                border-radius: 14px;
                padding: 12px 14px !important;
                margin: 0 !important;
                box-shadow: 0 1px 2px rgba(16,24,40,0.04),
                            0 6px 16px rgba(16,24,40,0.08);
            }
            /* Anything the old header painted white-on-purple must now read on white. */
            .property-inspector .pi-header * { color: inherit !important; }

            /* Apply: the one deliberate accent in the panel. One action, one colour. */
            .property-inspector button.pi-apply,
            .property-inspector > button {
                background: var(--pryzm-purple, #6600FF) !important;
                color: #fff !important;
                border: none;
                border-radius: 10px;
                padding: 9px 14px;
                font: inherit;
                font-weight: 600;
                font-size: 12.5px;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(102,0,255,0.22);
                transition: filter .15s ease, transform .06s ease;
            }
            .property-inspector button.pi-apply:hover,
            .property-inspector > button:hover { filter: brightness(1.08); }
            .property-inspector button.pi-apply:active,
            .property-inspector > button:active { transform: translateY(1px); }

            /* The scene shows through the gaps — so the scrollbar must not draw a rail. */
            .property-inspector::-webkit-scrollbar { width: 6px; }
            .property-inspector::-webkit-scrollbar-track { background: transparent; }
            .property-inspector::-webkit-scrollbar-thumb {
                background: rgba(16,24,40,0.16);
                border-radius: 3px;
            }
            .property-inspector::-webkit-scrollbar-thumb:hover { background: rgba(16,24,40,0.28); }

            @media (prefers-color-scheme: dark) {
                .property-inspector .pi-section {
                    background: var(--app-card-bg, rgba(28,30,36,0.92)) !important;
                    border-color: rgba(255,255,255,0.07);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.30),
                                0 6px 16px rgba(0,0,0,0.34);
                }
                .property-inspector .pi-input,
                .property-inspector select {
                    background: rgba(255,255,255,0.05);
                    color: #e7e9ee;
                }
                .property-inspector .pi-input:focus,
                .property-inspector select:focus { background: rgba(255,255,255,0.09); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Populates the "Spatial Identity" section with element-type-specific fields.
     *
     * Wave 14 refactor: large per-type branches extracted to section modules in
     * src/ui/property-inspector/. This method is now a thin router (~80 LOC).
     * All window.* reads retain their original TODO annotations — store migration
     * is Wave E, not Wave 14.
     */
    private updateLevelIdentitySection(data: any) {
        const ctx_1 = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
        if (ctx_1 && ctx_1.editorMode === EditorMode.Component) {
            const section = this.element.querySelector('#level-identity-section') as HTMLElement;
            if (section) section.style.display = 'none';
            return;
        }

        let section = this.element.querySelector('#level-identity-section') as HTMLElement;
        if (!section) {
            const content = document.createElement('div');
            content.id = 'level-identity-content';
            section = this.renderSection('Spatial Identity', content, false);
            section.id = 'level-identity-section';
            this.element.appendChild(section);
        }

        const content = section.querySelector('#level-identity-content') as HTMLElement;
        content.innerHTML = '';
        content.style.display = 'grid';

        const bimManager = window.bimManager; // TODO(D.4): replace via EngineBootstrap split — Phase D.4
        const elementId = data.id;
        let levelId = data.levelId;

        // Semantic identity lookup
        if (!levelId && elementId) {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            const slabStore = window.slabStore; // TODO(E.slab.S): replace with runtime.stores.slab — Phase E.slab.S
            const curtainWallStore = window.curtainWallStore; // TODO(E.curtain-wall.S): replace with runtime.stores.curtainWall — Phase E.curtain-wall.S
            const element = wallStore?.getById(elementId) ||
                            slabStore?.getById(elementId) ||
                            curtainWallStore?.get(elementId);
            if (element) {
                levelId = element.levelId;
            } else if (this._roofStore) {
                // The roof lookup used to sit in an `else if (!levelId && elementId && …)`
                // branch on the SAME condition as the `if` above, so it could never execute
                // (no-dupe-else-if) and a selected roof never resolved its level. It belongs
                // here: one more fallback in the same semantic-identity chain.
                const roof = this._roofStore.getById(elementId);
                if (roof) levelId = roof.levelId;
            }
        }

        const resolvedLevel = bimManager?.getLevelById(levelId);

        const type = (data.elementType || data.type || '').toLowerCase();
        const normalizedType = type;

        this.addProperty(content, 'Element ID', elementId, true);
        this.addProperty(content, 'Level ID', levelId || 'None', true);

        if (resolvedLevel) {
            this.addProperty(content, 'Level Name', resolvedLevel.name, true);
            this.addProperty(content, 'Level Elevation', `${resolvedLevel.elevation}m`, true);
        } else {
            this.addProperty(content, 'Level Name', levelId ? `Level (${levelId.substring(0,8)})` : 'Unknown', true);
            this.addProperty(content, 'Level Elevation', '--', true);
        }

        this.addProperty(content, 'Base Offset', data.baseOffset !== undefined ? data.baseOffset : 0, true);

        // Computed World Z
        const worldZ = (resolvedLevel?.elevation || 0) + (data.baseOffset || 0);
        this.addProperty(content, 'Computed World Z', `${worldZ.toFixed(3)}m`, true);

        // Add Descriptor info for Stair and Generic Component
        if (normalizedType === 'stair' || normalizedType === 'stairs') {
            const stairData = data.stairDescriptor || data;
            if (stairData.riserCount !== undefined) this.addProperty(content, 'Risers', stairData.riserCount, true);
            if (stairData.treadCount !== undefined) this.addProperty(content, 'Treads', stairData.treadCount, true);
        } else if (normalizedType === 'genericcomponent') {
            const compData = data.componentDescriptor || data;
            const name = compData.componentName || 'Generic Component';
            this.addProperty(content, 'Component Name', name, true);
            if (compData.familyId) this.addProperty(content, 'Family ID', compData.familyId, true);
            if (compData.parameters) {
                const paramCount = Object.keys(compData.parameters).length;
                this.addProperty(content, 'Parameters', paramCount, true);
            }

        // ── Wall ────────────────────────────────────────────────────────────
        } else if (normalizedType === 'wall') {
            const wall = window.wallStore?.getById(elementId); // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            if (wall) {
                const _bl0 = wall.baseLine[0], _bl1 = wall.baseLine[1];
                const width = Math.sqrt((_bl1.x-_bl0.x)**2 + (_bl1.y-_bl0.y)**2 + (_bl1.z-_bl0.z)**2);
                this.addProperty(content, 'Width', width.toFixed(3), true);
                this.addProperty(content, 'Height', wall.height, false, 'height');
                this.addProperty(content, 'Thickness', wall.thickness, false, 'thickness');
                // §P3.6-PI: commandManager removed — WallLayerSection mutations are bus-routed.
                appendWallLayerSection(
                    content, wall,
                    window.wallStore, // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
                    (w: any) => this.update(w),
                    this.runtime,
                );
            }

        // ── Slab ────────────────────────────────────────────────────────────
        } else if (normalizedType === 'slab') {
            const slab = window.slabStore?.getById(elementId); // TODO(E.slab.S): replace with runtime.stores.slab — Phase E.slab.S
            if (slab) {
                // ── Edit Profile button (§11 Slab Profile Edit Mode) ─────────
                {
                    const editRow = document.createElement('div');
                    editRow.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';
                    const editBtn = document.createElement('button');
                    editBtn.textContent = 'Edit Profile';
                    editBtn.title = 'Open the slab boundary editor (or double-click the slab in the viewport)';
                    editBtn.style.cssText = [
                        'flex:1', 'font-size:11px', 'padding:5px 8px',
                        'background:var(--app-bg-deep,#1e3a5f)',
                        'color:var(--app-accent-light,#93c5fd)',
                        'border:1px solid rgba(147,197,253,0.3)',
                        'border-radius:5px', 'cursor:pointer',
                        'letter-spacing:0.02em',
                        'transition:background 0.15s,color 0.15s',
                    ].join(';');
                    editBtn.addEventListener('mouseenter', () => {
                        editBtn.style.background = 'var(--app-accent-dark,#1e40af)';
                        editBtn.style.color = 'var(--app-accent-light,#bfdbfe)';
                    });
                    editBtn.addEventListener('mouseleave', () => {
                        editBtn.style.background = 'var(--app-bg-deep,#1e3a5f)';
                        editBtn.style.color = 'var(--app-accent-light,#93c5fd)';
                    });
                    editBtn.addEventListener('click', () => {
                        const slabTool = window.slabTool; // TODO(E.slab.X): replace with runtime.tools.activate(slab) — Phase E.slab.X
                        if (slabTool?.enterProfileEditMode) {
                            slabTool.enterProfileEditMode(slab.id);
                        } else {
                            console.warn('[PropertyInspector] slabTool not available for profile edit');
                        }
                    });
                    const hint = document.createElement('span');
                    hint.textContent = 'or double-click';
                    hint.style.cssText = 'font-size:10px;color:var(--app-text-muted,#aaa);white-space:nowrap;flex-shrink:0;';
                    editRow.appendChild(editBtn);
                    editRow.appendChild(hint);
                    content.appendChild(editRow);
                }
                appendSlabLayerSection(content, slab, (obj: any) => this.update(obj), this.runtime);
            }

        // ── Roof ────────────────────────────────────────────────────────────
        } else if (normalizedType === 'roof') {
            const roof = this._roofStore?.getById(elementId);
            if (roof) {
                this.addProperty(content, 'Thickness', roof.thickness, false, 'thickness');
                this.addProperty(content, 'Base Offset', roof.baseOffset, false, 'baseOffset');
                if (roof.mode === 'single_slope' || roof.mode === 'hip_roof') {
                    this.addProperty(content, 'Slope (%)', (roof.slope || 0.05) * 100, false, 'slopePercent');
                }
            }

        // ── Window / Door ───────────────────────────────────────────────────
        } else if (normalizedType === 'window' || normalizedType === 'door') {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            let opening = wallStore?.getOpening?.(elementId);
            if (!opening && wallStore?.getAll) {
                for (const wall of wallStore.getAll()) {
                    opening = wall.openings?.find((o: any) => o.elementId === elementId || o.id === elementId);
                    if (opening) break;
                }
            }
            if (opening) {
                this.addProperty(content, 'Width', opening.width, false, 'width');
                this.addProperty(content, 'Height', opening.height, false, 'height');
                if (opening.sillHeight !== undefined) {
                    this.addProperty(content, 'Sill Height', opening.sillHeight, false, 'sillHeight');
                }
            }

        // ── Curtain Wall ────────────────────────────────────────────────────
        } else if (normalizedType === 'curtainwall' || normalizedType === 'curtain-wall') {
            const cw = window.curtainWallStore?.get(elementId); // TODO(E.curtain-wall.S): replace with runtime.stores.curtainWall — Phase E.curtain-wall.S
            if (cw) {
                this.addProperty(content, 'Height', cw.height, false, 'height');
                this.addProperty(content, 'Base Offset', cw.baseOffset, false, 'baseOffset');
                this.addProperty(content, 'Grid X Spacing', cw.gridXSpacing, false, 'gridXSpacing');
                this.addProperty(content, 'Grid Y Spacing', cw.gridYSpacing, false, 'gridYSpacing');
                this.addProperty(content, 'Mullion Size', cw.mullionSize, false, 'mullionSize');
                this.addProperty(content, 'Panel Thickness', cw.panelThickness, false, 'panelThickness');
            }

        // ── Furniture / Wardrobe / Kitchen / Plumbing ───────────────────────
        } else if (
            normalizedType === 'furniture' ||
            data.furnitureType?.startsWith('plant_') ||
            data.furnitureType === 'bed' ||
            data.furnitureType === 'table' ||
            data.furnitureType === 'chair' ||
            data.furnitureType === 'dining_table' ||
            data.furnitureType === 'dining_chair' ||
            data.furnitureType === 'wardrobe' ||
            data.furnitureType === 'corner_wardrobe' ||
            normalizedType === 'plumbing_fixture' ||
            normalizedType === 'toilet' ||
            normalizedType === 'sink' ||
            normalizedType === 'plumbingfixture' ||
            normalizedType === 'bath'
        ) {
            appendFurnitureIdentitySection(content, data, elementId, this.addProperty.bind(this));

        // ── Handrail ────────────────────────────────────────────────────────
        } else if (normalizedType === 'handrail') {
            const handrail = window.handrailStore?.getById(elementId); // TODO(E.handrail.S): replace with runtime.stores.handrail — Phase E.handrail.S
            if (handrail) {
                this.addProperty(content, 'Height', handrail.height, false, 'height');
                this.addProperty(content, 'Thickness', handrail.thickness, false, 'thickness');
                this.addProperty(content, 'Base Offset', handrail.baseOffset, false, 'baseOffset');
                this.addProperty(content, 'Color', handrail.materialColor || '#cccccc', false, 'materialColor');
            }

        // ── Floor ───────────────────────────────────────────────────────────
        } else if (normalizedType === 'floor') {
            appendFloorIdentitySection(content, data, elementId, this.addProperty.bind(this));

        // ── Ceiling ─────────────────────────────────────────────────────────
        } else if (normalizedType === 'ceiling') {
            appendCeilingIdentitySection(content, data, elementId, this.addProperty.bind(this));

        // ── Room ────────────────────────────────────────────────────────────
        } else if (normalizedType === 'room') {
            // elementId is room.id (set in RoomBoundaryBuilder.userData.id)
            const roomStore = window.roomStore; // TODO(E.rooms.S): replace with runtime.stores.rooms — Phase E.rooms.S
            const room = roomStore?.getById(elementId);
            if (room) {
                import('./property-inspector/RoomPropertySection').then(({ appendRoomPropertySection }) => {
                    // §P3.6-PI: commandManager removed — RoomPropertySection mutations are bus-routed.
                    appendRoomPropertySection(content, room, roomStore, null, (obj: any) => this.update(obj), this.runtime);
                });
            }
        }
    }

    private addProperty(parent: HTMLElement, label: string, value: any, readonly: boolean = false, key?: string) {
        const labelEl = document.createElement('div');
        labelEl.className = 'pi-label';
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.className = 'pi-input';
        input.value = value !== undefined ? value : '';
        input.disabled = readonly;
        if (key) input.setAttribute('data-key', key);

        if (typeof value === 'number') {
            input.type = 'number';
            input.step = '0.01';
        } else if (typeof value === 'boolean' || key === 'showDoors') {
            input.type = 'checkbox';
            input.checked = value === true || value === undefined;
            input.style.width = '20px';
        } else if (key === 'materialColor' || key === 'color' || key === 'frameColor') {
            input.type = 'color';
            input.style.height = '30px';
        } else if (key === 'cornerBehavior') {
            // Already handled in specialized logic above
            return;
        }

        parent.appendChild(labelEl);
        parent.appendChild(input);
    }

    private renderSection(title: string, content: HTMLElement, isCollapsed = false) {
        const section = document.createElement('div');
        section.className = 'pi-section';

        const header = document.createElement('div');
        header.className = 'pi-header';
        header.innerHTML = `<span>${title}</span><span class="toggle-icon">${isCollapsed ? '▼' : '▲'}</span>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'pi-content';
        contentWrapper.style.display = isCollapsed ? 'none' : 'grid';
        contentWrapper.appendChild(content);

        header.onclick = () => {
            const isHidden = contentWrapper.style.display === 'none';
            contentWrapper.style.display = isHidden ? 'grid' : 'none';
            header.querySelector('.toggle-icon')!.textContent = isHidden ? '▲' : '▼';
        };

        section.appendChild(header);
        section.appendChild(contentWrapper);
        return section;
    }

    private createReusableElements() {
        this.matSelect = document.createElement('select');
        this.matSelect.className = 'pi-input';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Custom Color';
        this.matSelect.appendChild(noneOpt);

        STANDARD_MATERIAL_LIBRARY.forEach(mat => {
            const opt = document.createElement('option');
            opt.value = mat.id;
            opt.textContent = mat.label;
            this.matSelect!.appendChild(opt);
        });

        this.colorInput = document.createElement('input');
        this.colorInput.type = 'color';
        this.colorInput.className = 'pi-input';
        this.colorInput.style.height = '30px';

        this.frameColorInput = document.createElement('input');
        this.frameColorInput.type = 'color';
        this.frameColorInput.className = 'pi-input';
        this.frameColorInput.style.height = '30px';

        this.translateBtn = document.createElement('button');
        this.translateBtn.className = 'pi-input';
        this.translateBtn.textContent = 'Move';

        this.rotateBtn = document.createElement('button');
        this.rotateBtn.className = 'pi-input';
        this.rotateBtn.textContent = 'Rotate';

        this.applyBtn = document.createElement('button');
        this.applyBtn.className = 'pi-input pi-full-width';
        this.applyBtn.style.background = 'var(--app-accent,#2196f3)';
        this.applyBtn.style.color = 'white';
        this.applyBtn.style.fontWeight = 'bold';
        this.applyBtn.textContent = 'Save Changes';

        this.setupEventListeners();
    }

    private setupEventListeners() {
        if (!this.matSelect || !this.colorInput || !this.frameColorInput ||
            !this.translateBtn || !this.rotateBtn || !this.applyBtn) return;

        this.matSelect.addEventListener('change', (e: any) => this.onMaterialChange(e));
        this.colorInput.addEventListener('input', (e: any) => this.onColorInput(e));
        this.frameColorInput.addEventListener('input', (e: any) => this.onFrameColorInput(e));
        this.translateBtn.addEventListener('click', () => this.callbacks.transformControls.setMode('translate'));
        this.rotateBtn.addEventListener('click', () => this.callbacks.transformControls.setMode('rotate'));
        this.applyBtn.addEventListener('click', () => this.applyChanges());
    }

    private onMaterialChange(e: any) {
        const matId = e.target.value;
        if (!matId) {
            if (this.colorInput) this.colorInput.style.display = 'block';
            return;
        }
        if (this.colorInput) this.colorInput.style.display = 'none';

        const matDef = this.callbacks.materialMap.get(matId);
        if (matDef && this.selectedObject) {
            // §02 §3.5: Stage in inspector — never write to userData.
            this.pendingMaterialId = matId;
            this.pendingMaterialColor = undefined;

            this.selectedObject.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.userData.materialId = matId;
                    const params = { ...matDef.params } as any;
                    if (this.callbacks.getCurrentVisualStyle() === 1) {
                        params.metalness = 0;
                        params.roughness = 1;
                    } else {
                        params.map = matDef.textures?.color;
                        params.normalMap = matDef.textures?.normal;
                        params.roughnessMap = matDef.textures?.roughness;
                    }
                    child.material = new THREE.MeshStandardMaterial(params);
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.callbacks.onUpdateShadows();
        }
    }

    private onColorInput(e: any) {
        const color = e.target.value;
        if (this.selectedObject instanceof THREE.Object3D) {
            // §02 §3.5: Stage in inspector — never write to userData.
            this.pendingMaterialColor = color;
            this.pendingMaterialId = null;

            this.selectedObject.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    (child.material as THREE.MeshStandardMaterial).color.set(color);
                }
            });
        }
    }

    private onFrameColorInput(e: any) {
        const color = e.target.value;
        if (this.selectedObject instanceof THREE.Object3D) {
            const data = this.selectedObject.userData;
            if (this.isOpeningType(data.type)) {
                // §02 §3.5: Stage the value — never write to userData.
                this.pendingFrameColor = color;

                // Live preview: update Three.js geometry colour only.
                this.selectedObject.traverse(child => {
                    if (child instanceof THREE.Mesh && this.isGeometryChild(child)) {
                        (child.material as THREE.MeshStandardMaterial).color.set(color);
                    }
                });
            }
        }
    }

    private isOpeningType(type: string): boolean {
        const normalizedType = type?.toLowerCase();
        return normalizedType === 'window' || normalizedType === 'door';
    }

    private isGeometryChild(obj: THREE.Object3D): boolean {
        return obj.userData.role === 'geometry' ||
               obj.userData.selectable === false ||
               obj.userData.type?.includes('-part');
    }

    private mapTypeToIFC(type: string): string {
        const mapping: { [key: string]: string } = {
            'wall': 'IfcWall',
            'column': 'IfcColumn',
            'slab': 'IfcSlab',
            'window': 'IfcWindow',
            'door': 'IfcDoor',
            'curtainwall': 'IfcCurtainWall',
            'stairs': 'IfcStair'
        };
        return mapping[type.toLowerCase()] || 'IfcBuildingElementProxy';
    }

    private calculateWallLength(data: any): number {
        if (data.baseLine && Array.isArray(data.baseLine) && data.baseLine.length === 2) {
            try {
                const start = new THREE.Vector3(data.baseLine[0].x, data.baseLine[0].y, data.baseLine[0].z);
                const end = new THREE.Vector3(data.baseLine[1].x, data.baseLine[1].y, data.baseLine[1].z);
                return start.distanceTo(end);
            } catch (e) {
                console.warn('Failed to calculate wall length from baseLine:', e);
            }
        }
        return parseFloat(data.length) || 0;
    }

    /**
     * Wave 14: thin forwarder — body extracted to PropertyInspectorApply.ts.
     * Builds the ApplyContext from instance fields and delegates.
     */
    private applyChanges() {
        _applyChanges({
            element: this.element,
            selectedObject: this.selectedObject,
            wallStore: this.wallStore,
            roofStore: this._roofStore,
            roofBuilder: this._roofBuilder,
            pendingMaterialColor: this.pendingMaterialColor,
            pendingMaterialId: this.pendingMaterialId,
            pendingFrameColor: this.pendingFrameColor,
            callbacks: this.callbacks,
            execUpdate: (cmd, key) => this.execUpdate(cmd, key),
        } satisfies ApplyContext);
    }

    private buildSceneCache(root: THREE.Object3D) {
        this.sceneObjectCache.clear();
        root.traverse(obj => {
            if (obj.userData?.id) {
                this.sceneObjectCache.set(obj.userData.id, obj.userData.type || 'Element');
                if (obj.userData.type?.toLowerCase() === 'wall') {
                    this.sceneObjectCache.set(obj.userData.id, 'Wall');
                }
            }
        });
    }

    private addLabel(container: HTMLElement, text: string) {
        const label = document.createElement('div');
        label.className = 'pi-label';
        label.textContent = text;
        container.appendChild(label);
    }

    private createColorInput(value: string, onChange: (val: string) => void, dataKey?: string) {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'pi-input';
        if (dataKey) input.setAttribute('data-key', dataKey);
        input.value = value || '#333333';
        input.oninput = (e: any) => onChange(e.target.value);
        return input;
    }

    update(obj: THREE.Object3D | OBC.View) {
        let targetObject: THREE.Object3D | null = null;
        if (obj instanceof THREE.Object3D) {
            targetObject = obj;
            if (obj.userData.role === 'geometry' && obj.userData.parentId) {
                let current = obj.parent;
                while (current) {
                    if (current.userData && current.userData.id === obj.userData.parentId) {
                        targetObject = current;
                        break;
                    }
                    current = current.parent;
                }
            }
        }

        this.selectedObject = targetObject;
        // Reset staging variables on every new selection (§02 §3.5).
        this.pendingMaterialColor = undefined;
        this.pendingMaterialId = undefined;
        this.pendingFrameColor = undefined;
        if (this.selectedObject) {
            const furnitureStore = window.furnitureStore; // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
            const elementFromStore = furnitureStore?.get(this.selectedObject.userData.id);

            console.group(`[WARDROBE TRACE] INSPECTOR`);
            console.log("Element From Store:", elementFromStore);
            console.log("Width Shown In UI:", elementFromStore?.wardrobeConfig?.width);
            console.groupEnd();

            let root: THREE.Object3D = this.selectedObject;
            while (root.parent) root = root.parent;
            this.buildSceneCache(root);
        }

        const data = this.selectedObject ? this.selectedObject.userData : (obj instanceof OBC.View ? {
            id: obj.id, type: 'View', name: (obj as any).id, range: (obj as any).range
        } : null);

        if (!data) {
            this.element.style.display = 'none';
            return;
        }

        const type = (data.type || '').toLowerCase();
        this.element.innerHTML = '';
        this.setupStyles();

        // 1. IDENTITY
        const identityContent = document.createElement('div');
        identityContent.style.display = 'contents';
        this.addProperty(identityContent, 'ID', data.id, true);

        // Mark parameter
        const markValue = data.properties?.mark || data.mark || (this.wallStore?.getById?.(data.id)?.properties?.mark) || (this.wallStore?.getById?.(data.id)?.mark) || '';
        this.addProperty(identityContent, 'Mark', markValue, false, 'mark');

        const displayType = (data.elementType || data.type || '').toLowerCase();
        this.addProperty(identityContent, 'Type', displayType, true);

        this.element.appendChild(this.renderSection('Identity', identityContent));

        // Level Identity Section
        this.updateLevelIdentitySection(data);

        // 2. GEOMETRY
        const geometryContent = document.createElement('div');
        geometryContent.style.display = 'contents';

        const normalizedType = type?.toLowerCase();
        if (normalizedType === 'wall') {
            const wall = window.wallStore?.getById(data.id); // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            const length = this.calculateWallLength(data);
            const height = wall?.height ?? data.height ?? '';
            const thickness = wall?.thickness ?? data.thickness ?? '';

            this.addProperty(geometryContent, 'Length', length.toFixed(2), true);
            this.addProperty(geometryContent, 'Height', height, false, 'height');
            this.addProperty(geometryContent, 'Thickness', thickness, false, 'thickness');
        } else if (normalizedType === 'slab') {
            const slab = window.slabStore?.getById(data.id); // TODO(E.slab.S): replace with runtime.stores.slab — Phase E.slab.S
            const thickness = slab?.thickness ?? data.thickness ?? '';
            this.addProperty(geometryContent, 'Width', data.width, false, 'width');
            this.addProperty(geometryContent, 'Depth', data.depth, false, 'depth');
            this.addProperty(geometryContent, 'Thickness', thickness, false, 'thickness');
            this.addProperty(geometryContent, 'Color', slab?.materialColor || '#808080', false, 'materialColor');
        } else if (normalizedType === 'window' || normalizedType === 'door') {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            let opening = wallStore?.getOpening?.(data.id);
            if (!opening && wallStore?.getAll) {
                for (const wall of wallStore.getAll()) {
                    opening = wall.openings?.find((o: any) => o.elementId === data.id || o.id === data.id);
                    if (opening) break;
                }
            }
            const width = opening?.width ?? data.width ?? '';
            const height = opening?.height ?? data.height ?? '';
            const sillHeight = opening?.sillHeight ?? data.sillHeight ?? '';

            this.addProperty(geometryContent, 'Width', width, false, 'width');
            this.addProperty(geometryContent, 'Height', height, false, 'height');
            this.addProperty(geometryContent, 'Depth', data.depth, false, 'depth');
            this.addProperty(geometryContent, 'Sill Height', sillHeight, false, 'sillHeight');
            this.addProperty(geometryContent, 'Fire Rating', data.fireRating || 'None', false, 'fireRating');
            if (normalizedType === 'door') {
                this.addProperty(geometryContent, 'Door Type', data.doorType || 'single', true);
                this.addProperty(geometryContent, 'Accessibility', data.accessibilityType || 'Standard', false, 'accessibilityType');
            } else {
                this.addProperty(geometryContent, 'Window Type', data.windowType || 'single', true);
            }
        } else if (normalizedType === 'column') {
            const column = window.columnStore?.get?.(data.id) || data; // TODO(E.column.S): replace with runtime.stores.column — Phase E.column.S
            this.addProperty(geometryContent, 'Width', column.width, false, 'width');
            this.addProperty(geometryContent, 'Depth', column.depth, false, 'depth');
            this.addProperty(geometryContent, 'Height', column.height, false, 'height');
            this.addProperty(geometryContent, 'Base Offset', column.baseOffset ?? 0, false, 'baseOffset');
            appendColumnOrientationControls(geometryContent, column);
        } else if (normalizedType === 'curtainwall') {
            const length = this.calculateWallLength(data);
            const cwStore = window.curtainWallStore; // TODO(E.curtain-wall.S): replace with runtime.stores.curtainWall — Phase E.curtain-wall.S
            const fullData = cwStore?.get?.(data.id) || data;

            this.addProperty(geometryContent, 'Length', length.toFixed(2), true);
            this.addProperty(geometryContent, 'Height', fullData.height, false, 'height');
            this.addProperty(geometryContent, 'Grid X', fullData.gridXSpacing, false, 'gridXSpacing');
            this.addProperty(geometryContent, 'Grid Y', fullData.gridYSpacing, false, 'gridYSpacing');
            this.addProperty(geometryContent, 'Mullion Size', fullData.mullionSize, false, 'mullionSize');
            this.addProperty(geometryContent, 'Panel Thick.', fullData.panelThickness, false, 'panelThickness');
            this.addProperty(geometryContent, 'Base Offset', fullData.baseOffset || 0, false, 'baseOffset');
        } else if (type === 'stairs') {
            const riserHeight = data.riserHeight || 0;
            const riserCount = data.riserCount || 0;
            const treadDepth = data.treadDepth || 0;
            const length = (riserCount - 1) * treadDepth;

            this.addProperty(geometryContent, 'Length', (length * 1000).toFixed(0) + 'mm', true);
            this.addProperty(geometryContent, 'Width', data.width, false, 'width');
            this.addProperty(geometryContent, 'Riser Count', data.riserCount, true);
            this.addProperty(geometryContent, 'Riser Height', riserHeight, false, 'riserHeight');
            this.addProperty(geometryContent, 'Tread Depth', treadDepth, false, 'treadDepth');
            this.addProperty(geometryContent, 'Base Level', data.baseLevelId, true);
            this.addProperty(geometryContent, 'Top Level', data.topLevelId, true);
        } else if (normalizedType === 'furniture' || normalizedType === 'bed' || normalizedType === 'table' || normalizedType === 'chair' || normalizedType === 'sofa' || normalizedType === 'wardrobe' || normalizedType === 'corner_wardrobe') {
            const furniture = window.furnitureStore?.get(data.id); // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
            if (furniture) {
                this.addProperty(geometryContent, 'Width', furniture.width, false, 'width');
                this.addProperty(geometryContent, 'Length', furniture.length, false, 'length');
                this.addProperty(geometryContent, 'Height', furniture.height, false, 'height');
                this.addProperty(geometryContent, 'Base Offset', furniture.baseOffset, false, 'baseOffset');

                if (furniture.lo3 !== undefined) {
                    this.addProperty(geometryContent, 'LO3', furniture.lo3, false, 'lo3');
                }

                if (furniture.furnitureType === 'wardrobe' || furniture.furnitureType === 'wardrobe_glass_door' || furniture.furnitureType === 'corner_wardrobe') {
                    // Wardrobe specific geometry mapping
                    this.addProperty(geometryContent, 'Thickness', furniture.length, false, 'length');
                    this.addProperty(geometryContent, 'Show Doors', furniture.wardrobeConfig?.showDoors !== false, false, 'showDoors');
                    this.addProperty(geometryContent, 'Show Debug', furniture.wardrobeConfig?.showDebug === true, false, 'showDebug');
                }
            }
        }
        this.element.appendChild(this.renderSection('Geometry', geometryContent));

        // 3. VISUALS
        const visualsContent = document.createElement('div');
        visualsContent.style.display = 'contents';
        if (type === 'window' || type === 'door') {
            this.addLabel(visualsContent, 'Frame Color');
            visualsContent.appendChild(this.createColorInput(data.frameColor, (val) => this.onFrameColorInput({ target: { value: val } })));
        } else {
            this.addLabel(visualsContent, 'Material');
            const select = _createMaterialSelect(data.materialId, (e) => this.onMaterialChange(e));
            visualsContent.appendChild(select);
            this.addLabel(visualsContent, 'Color Override');
            visualsContent.appendChild(this.createColorInput(data.materialColor || '#cccccc', (val) => this.onColorInput({ target: { value: val } }), 'materialColor'));
        }
        this.element.appendChild(this.renderSection('Visuals', visualsContent));

        // 4. RELATIONSHIPS
        const relContent = document.createElement('div');
        relContent.style.display = 'contents';
        if (data.parentId) this.addProperty(relContent, 'Parent ID', data.parentId, true);
        if (data.childrenIds && data.childrenIds.length > 0) {
            this.addProperty(relContent, 'Children', `${data.childrenIds.length} elements`, true);
        }
        // World Model: room relationship rows appended asynchronously
        appendRoomRelationships(relContent, type, data, this.selectedObject);
        this.element.appendChild(this.renderSection('Relationships', relContent, true));

        // 5. PHASE SECTION
        const phaseContent = document.createElement('div');
        phaseContent.style.display = 'contents';
        this.addLabel(phaseContent, 'Project Phase');
        const phaseSelect = document.createElement('select');
        phaseSelect.className = 'pi-input';
        phaseSelect.setAttribute('data-key', 'phase');
        const phases = ['Existing', 'Demolition', 'New Construction', 'Future'];
        phases.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (data.phase === p) opt.selected = true;
            phaseSelect.appendChild(opt);
        });
        phaseContent.appendChild(phaseSelect);
        this.element.appendChild(this.renderSection('Phase', phaseContent));

        // 7. IFC PROPERTIES SECTION
        const ifcContent = document.createElement('div');
        ifcContent.style.display = 'contents';

        // §02 §3.5: Inspector reads userData for display only — never writes back.
        const ifcData = data.ifcData || {
            guid: crypto.randomUUID(),
            ifcClass: this.mapTypeToIFC(type)
        };

        this.addProperty(ifcContent, 'IFC Class', ifcData.ifcClass, true);
        this.addProperty(ifcContent, 'GlobalId', ifcData.guid, true);

        // Add common Psets based on type
        if (type === 'wall') {
            this.addProperty(ifcContent, 'Pset', 'Pset_WallCommon', true);
            this.addProperty(ifcContent, 'Fire Rating', 'N/A', true);
        } else if (type === 'column') {
            this.addProperty(ifcContent, 'Pset', 'Pset_ColumnCommon', true);
        } else if (type === 'slab') {
            this.addProperty(ifcContent, 'Pset', 'Pset_SlabCommon', true);
        } else if (type === 'stairs') {
            this.addProperty(ifcContent, 'Pset', 'Pset_StairCommon', true);
            this.addProperty(ifcContent, 'Fire Rating', data.fireRating || 'N/A', true);
            this.addProperty(ifcContent, 'Accessibility', data.accessibilityType || 'standard', true);
        }

        this.element.appendChild(this.renderSection('IFC Standard Properties', ifcContent));

        // 8. CALCULATED DATA SECTION
        const calcContent = document.createElement('div');
        calcContent.style.display = 'contents';

        if (type === 'slab') {
            const length = parseFloat(data.width || data.length || 0);
            const width = parseFloat(data.depth || data.width || 0);
            const depth = parseFloat(data.depth || data.thickness || 0);
            const surface = length * width;
            const volume = surface * depth;
            this.addProperty(calcContent, 'Surface Area', `${surface.toFixed(2)} m²`, true);
            this.addProperty(calcContent, 'Volume', `${volume.toFixed(2)} m³`, true);
        } else if (type === 'wall') {
            const length = this.calculateWallLength(data);
            const height = parseFloat(data.height || 0);
            const thickness = parseFloat(data.thickness || 0);
            const surface = length * height;
            const volume = surface * thickness;
            this.addProperty(calcContent, 'Main Surface', `${surface.toFixed(2)} m²`, true);
            this.addProperty(calcContent, 'Volume', `${volume.toFixed(2)} m³`, true);
        } else if (type === 'window' || type === 'door') {
            const w = parseFloat(data.width || 0);
            const h = parseFloat(data.height || 0);
            const surface = w * h;
            this.addProperty(calcContent, 'Main Surface', `${surface.toFixed(2)} m²`, true);
        } else if (type === 'curtainwall') {
            // Curtain wall panel surface area
            const height = parseFloat(data.height || 0);
            // We use the length from its baseline or stored length
            const length = this.calculateWallLength(data);
            const surface = length * height;
            this.addProperty(calcContent, 'Panel Surface', `${surface.toFixed(2)} m²`, true);
        }

        if (calcContent.children.length > 0) {
            this.element.appendChild(this.renderSection('Calculated Data', calcContent));
        }

        // ACTIONS
        const actions = document.createElement('div');
        actions.className = 'pi-full-width';
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.marginTop = '12px';

        const moveBtn = document.createElement('button');
        moveBtn.className = 'pi-input';
        moveBtn.textContent = 'Move';
        moveBtn.onclick = () => this.callbacks.transformControls.setMode('translate');

        const rotateBtn = document.createElement('button');
        rotateBtn.className = 'pi-input';
        rotateBtn.textContent = 'Rotate';
        rotateBtn.onclick = () => this.callbacks.transformControls.setMode('rotate');

        actions.appendChild(moveBtn);
        actions.appendChild(rotateBtn);
        this.element.appendChild(actions);

        const applyBtn = document.createElement('button');
        applyBtn.className = 'pi-input pi-full-width';
        applyBtn.style.background = 'var(--app-accent,#2196f3)';
        applyBtn.style.color = 'white';
        applyBtn.style.marginTop = '8px';
        applyBtn.style.fontWeight = 'bold';
        applyBtn.textContent = 'Save Changes';
        applyBtn.onclick = () => {
            // Capture current scene transform before applying property changes.
            // §02 §3.5: Do NOT write back to userData — use a temporary staging object only.
            if (this.selectedObject) {
                this.selectedObject.updateMatrixWorld(true);
                const pos = { x: this.selectedObject.position.x, y: this.selectedObject.position.y, z: this.selectedObject.position.z };
                const rot = { x: this.selectedObject.rotation.x, y: this.selectedObject.rotation.y, z: this.selectedObject.rotation.z, order: this.selectedObject.rotation.order };

                if (!window.propertyUpdates) window.propertyUpdates = {}; // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                window.propertyUpdates.position = pos; // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                window.propertyUpdates.rotation = rot; // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x

                console.log("[INSPECTOR] Captured transform for save:", { pos, rot });
            }

            // Build the payload directly here to be 100% sure it has the transform
            const selected = this.selectedObject;
            if (!selected) return;

            const elementId = selected.userData.id;
            const furniture = window.furnitureStore?.get(elementId); // TODO(E.furniture.S): replace with runtime.stores.furniture — Phase E.furniture.S
            const type = (selected.userData.elementType || selected.userData.type || '').toLowerCase();

            if (type === 'furniture' || furniture) {
                const colorInput = this.element.querySelector('[data-key="color"]') as HTMLInputElement;
                const widthInput = this.element.querySelector('[data-key="width"]') as HTMLInputElement;
                const lengthInput = this.element.querySelector('[data-key="length"]') as HTMLInputElement;
                const heightInput = this.element.querySelector('[data-key="height"]') as HTMLInputElement;
                const offsetInput = this.element.querySelector('[data-key="baseOffset"]') as HTMLInputElement;
                const showDoorsInput = this.element.querySelector('[data-key="showDoors"]') as HTMLInputElement;

                const widthBranchTwoInput = this.element.querySelector('[data-key="widthBranchTwo"]') as HTMLInputElement;
                const lengthBranchTwoInput = this.element.querySelector('[data-key="lengthBranchTwo"]') as HTMLInputElement;
                const cornerBehaviorInput = this.element.querySelector('[data-key="cornerBehavior"]') as HTMLSelectElement;
                const lo3Input = this.element.querySelector('[data-key="lo3"]') as HTMLInputElement;

                const payload: any = {
                    id: elementId,
                    color: colorInput?.value,
                    width: widthInput ? parseFloat(widthInput.value) : undefined,
                    length: lengthInput ? parseFloat(lengthInput.value) : undefined,
                    height: heightInput ? parseFloat(heightInput.value) : undefined,
                    baseOffset: offsetInput ? parseFloat(offsetInput.value) : undefined,
                    position: window.propertyUpdates?.position ? { // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        x: window.propertyUpdates.position.x, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        y: window.propertyUpdates.position.y, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        z: window.propertyUpdates.position.z // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                    } : {
                        x: selected.position.x,
                        y: selected.position.y,
                        z: selected.position.z
                    },
                    rotation: window.propertyUpdates?.rotation ? { // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        x: window.propertyUpdates.rotation.x, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        y: window.propertyUpdates.rotation.y, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        z: window.propertyUpdates.rotation.z, // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                        order: window.propertyUpdates.rotation.order // TODO(E.5.x): replace with runtime scoped store — Phase E.5.x
                    } : {
                        x: selected.rotation.x,
                        y: selected.rotation.y,
                        z: selected.rotation.z,
                        order: selected.rotation.order
                    },
                    widthBranchTwo: widthBranchTwoInput ? parseFloat(widthBranchTwoInput.value) : undefined,
                    lengthBranchTwo: lengthBranchTwoInput ? parseFloat(lengthBranchTwoInput.value) : undefined,
                    cornerBehavior: cornerBehaviorInput ? cornerBehaviorInput.value : undefined,
                    lo3: lo3Input ? parseFloat(lo3Input.value) : undefined
                };

                if (furniture?.wardrobeConfig) {
                    payload.wardrobeConfig = {
                        ...furniture.wardrobeConfig,
                        width: payload.width ?? furniture.wardrobeConfig.width,
                        height: payload.height ?? furniture.wardrobeConfig.height,
                        depth: payload.length ?? furniture.wardrobeConfig.depth,
                        showDoors: showDoorsInput ? showDoorsInput.checked : furniture.wardrobeConfig.showDoors,
                        widthBranchTwo: payload.widthBranchTwo ?? furniture.wardrobeConfig.widthBranchTwo,
                        lengthBranchTwo: payload.lengthBranchTwo ?? furniture.wardrobeConfig.lengthBranchTwo,
                        cornerBehavior: payload.cornerBehavior ?? furniture.wardrobeConfig.cornerBehavior
                    };
                }

                console.log("[INSPECTOR] Executing update with payload:", payload);
                this.execUpdate(new UpdateFurnitureParametersCommand(payload), 'furniture.update'); // Phase B.5.2: consolidated via execUpdate
                this.callbacks.onUnselect();
                this.element.style.display = 'none';
            } else {
                this.applyChanges();
            }
        };
        this.element.appendChild(applyBtn);

        // §FEAT-PROPERTY-PANEL-CARD-LAYOUT (L-276) — FLEX, not BLOCK. The transparent
        // gap between the cards is the whole point of the founder's brief ("between them
        // is transparent"), and `display:block` would collapse it: the column's `gap`
        // only applies to a flex/grid container. A one-word regression here silently
        // returns the panel to a single stacked slab.
        this.element.style.display = 'flex';
        // Wave 6 Phase B real binding — panel mount activation.
        // Called at the end of update() so selectedObject is already set.
        // Idempotent — safe to call even if the inspector was already visible.
        if (this.runtime) {
            const type = (this.selectedObject?.userData?.type ||
                          this.selectedObject?.userData?.elementType || 'unknown') as string;
            this.runtime.viewRegistry.activatePanel('property-inspector', {
                label: 'Property Inspector',
                elementType: type,
            });
        }
    }

}

