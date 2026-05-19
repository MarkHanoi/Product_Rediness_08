import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeDraggable } from './makeDraggable';
import type { ViewDefinition, ViewOutputSettings, ViewCropSettings, ViewUnderlaySettings } from '@pryzm/core-app-model';
import { getViewTypePanelSections } from './views/ViewTypePropertiesPanelConfig';
import type { UpdateViewDefinitionPatch } from '@pryzm/command-registry';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import type { SheetDefinition } from '@pryzm/core-app-model';
import type { ViewScheduleDefinition as ScheduleDefinition } from '@pryzm/core-app-model';

import { buildVisibilityIntentSection, buildOutputSection, buildViewRangeSection } from './ViewPropertiesPanelBuilders';
export interface ViewProperties {
    id: string;
    viewName: string;
    viewType: 'Floor Plan' | 'Ceiling Plan' | 'Elevation' | 'Section' | '3D View' | 'Schedule';
    viewRange: number;
    cutPlaneHeight: number;
    scale: string;
    visualStyle: 'Consistent' | 'Textures' | 'Realistic';
    showCutFill: boolean;
    detailLevel?: 'Coarse' | 'Medium' | 'Fine';
    discipline?: string;
    createdDate?: string;
}

export class ViewPropertiesPanel {
    element: HTMLDivElement;
    private selectedView: OBC.View | null = null;
    private onViewUpdate?: (view: OBC.View, properties: Partial<ViewProperties>) => void;
    private onSceneBgChange?: (colorHex: string) => void;

    // Phase II: tracks the currently displayed ViewDefinition id
    // (public getter used by ProjectBrowserPanel to check which definition is open)
    private _selectedViewDefinitionId: string | null = null;
    get selectedViewDefinitionId(): string | null { return this._selectedViewDefinitionId; }

    private _cutFillVisibility: Map<THREE.Mesh, boolean> = new Map();

    // Drag handle element — persists across show() rebuilds
    private _dragHandle!: HTMLDivElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options?: {
        onViewUpdate?: (view: OBC.View, properties: Partial<ViewProperties>) => void;
        onSceneBgChange?: (colorHex: string) => void;
    },
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.onViewUpdate    = options?.onViewUpdate;
        this.onSceneBgChange = options?.onSceneBgChange;
        this.element = document.createElement('div');
        this.element.id = 'view-properties-panel';
        this.setupBaseStyles();
        this.element.style.display = 'none';
        document.body.appendChild(this.element);
        // Enable dragging — handle class excludes the close button
        makeDraggable(this.element, '.vpp-drag-handle', ['.vpp-close-btn']);

        // Wave 3 / S4 — live refresh: when the bound Intent changes from any
        // surface (header picker, command undo, collaboration sync), re-render
        // the spine so the source pill, name, and override list stay in sync.
        // vi:instance-updated migrated to runtime.events (F.events.2b); DOM listener kept for vi:overrides-cleared only.
        this.runtime?.events?.on('vi:instance-updated', ({ viewId }) => this._onIntentInstanceUpdatedCore(viewId)); // F.events.2b
        window.addEventListener('vi:overrides-cleared', this._onIntentInstanceUpdated);
    }

    /** DOM adapter — used only for legacy `vi:overrides-cleared` (no viewId in detail). */
    private _onIntentInstanceUpdated = (ev: Event): void => {
        const detail = (ev as CustomEvent).detail as { viewId?: string } | undefined;
        this._onIntentInstanceUpdatedCore(detail?.viewId);
    };

    private _onIntentInstanceUpdatedCore(viewId?: string): void {
        const openId = this._selectedViewDefinitionId;
        if (!openId) return;
        if (this.element.style.display === 'none') return; // skip if hidden
        if (viewId && viewId !== openId) return;
        const def = window.viewDefinitionStore?.get?.(openId); // TODO(F.6.x): legacy viewDefinitionStore — replace with runtime.viewRegistry definitions
        if (!def) return;
        this._clearContent();
        this._renderDefinitionProperties(def);
    }

    private setupBaseStyles() {
        this.element.style.cssText = `
            position: fixed;
            right: 160px;
            top: 80px;
            width: 260px;
            max-height: 460px;
            overflow-y: auto;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            z-index: 1000;
            padding: 0;
        `;

        // Drag handle — sticky header, persists across show() rebuilds
        this._dragHandle = document.createElement('div');
        this._dragHandle.className = 'vpp-drag-handle';
        this._dragHandle.innerHTML = `<span class="vpp-drag-handle__title">View Properties</span>`;
        this.element.appendChild(this._dragHandle);

    }

    /** Clears all panel content while preserving the persistent drag handle. */
    private _clearContent(): void {
        Array.from(this.element.children).forEach(child => {
            if (!child.classList.contains('vpp-drag-handle')) child.remove();
        });
    }

    private detectViewType(view: OBC.View): ViewProperties['viewType'] {
        const id = view.id?.toLowerCase() || '';
        const direction = (view as any).direction;

        if (id.includes('floor') || id.includes('ground') || id === 'top') return 'Floor Plan';
        if (id.includes('ceiling') || id.includes('rcp')) return 'Ceiling Plan';
        if (id.includes('elevation') || id.includes('north') || id.includes('south') || id.includes('east') || id.includes('west') || id === 'front' || id === 'side' || id === 'left' || id === 'right' || id === 'back') return 'Elevation';
        if (id.includes('section')) return 'Section';
        if (id.includes('schedule')) return 'Schedule';
        if (id === '3d') return '3D View';

        if (direction) {
            if (Math.abs(direction.y) > 0.9) return 'Floor Plan';
            if (Math.abs(direction.z) > 0.5 || Math.abs(direction.x) > 0.5) return 'Elevation';
        }

        return 'Section';
    }

    private renderSection(title: string, content: HTMLElement, isCollapsed = false): HTMLElement {
        const section = document.createElement('div');
        section.className = 'vpp-section';

        const header = document.createElement('div');
        header.className = 'vpp-header';
        header.innerHTML = `<span>${title}</span><span class="toggle-icon">${isCollapsed ? '▼' : '▲'}</span>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'vpp-content';
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

    private addProperty(container: HTMLElement, label: string, value: string | number, readonly = false, dataKey?: string): void {
        const labelEl = document.createElement('div');
        labelEl.className = 'vpp-label';
        labelEl.textContent = label;
        container.appendChild(labelEl);

        if (readonly) {
            const valueEl = document.createElement('div');
            valueEl.className = 'vpp-value';
            valueEl.textContent = String(value);
            container.appendChild(valueEl);
        } else {
            const input = document.createElement('input');
            input.className = 'vpp-input';
            input.type = typeof value === 'number' ? 'number' : 'text';
            input.value = String(value);
            if (dataKey) input.setAttribute('data-key', dataKey);
            input.addEventListener('change', () => this.handlePropertyChange(dataKey || label, input.value));
            container.appendChild(input);
        }
    }

    private handlePropertyChange(key: string, value: string): void {
        if (!this.selectedView || !this.onViewUpdate) return;

        const updates: Partial<ViewProperties> = {};
        if (key === 'viewRange' || key === 'range') {
            (this.selectedView as any).range = parseFloat(value);
            updates.viewRange = parseFloat(value);
        } else if (key === 'viewName') {
            updates.viewName = value;
        } else if (key === 'cutPlaneHeight') {
            const height = parseFloat(value);
            // FIX 2: Validate before applying
            if (isNaN(height)) return;
            (this.selectedView as any).cutPlaneHeight = height;
            updates.cutPlaneHeight = height;

            const navManager = window.navManager; // TODO(D.4): legacy navManager — replace with runtime.scene.navigation manager
            if (navManager) {
                const viewType = this.detectViewType(this.selectedView);
                if (viewType === 'Floor Plan') {
                    const currentPos = navManager._camera.three.position;
                    const currentTarget = navManager._camera.controls.getTarget(new THREE.Vector3());
                    navManager._camera.controls.setLookAt(
                        currentPos.x, height + 50, currentPos.z,
                        currentTarget.x, height, currentTarget.z,
                        true
                    );
                }
            }

            this.updateCutFillStyle((this.selectedView as any).showCutFill || false);
        } else if (key === 'scale') {
            updates.scale = value;
            (this.selectedView as any).scale = value;

            const navManager = window.navManager; // TODO(D.4): legacy navManager — replace with runtime.scene.navigation manager
            if (navManager && navManager._camera.three.isOrthographicCamera) {
                // FIX 3: Guard against malformed scale string (e.g. "1:foo")
                const parts = value.split(':');
                const scaleValue = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
                if (!isNaN(scaleValue) && scaleValue > 0) {
                    const zoomFactor = 100 / scaleValue;
                    navManager._camera.controls.zoomTo(zoomFactor, true);
                }
            }
        } else if (key === 'visualStyle') {
            updates.visualStyle = value as any;
            (this.selectedView as any).visualStyle = value;
            const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
            if (bimManager && typeof bimManager.applyVisualStyle === 'function') {
                bimManager.applyVisualStyle(value.toLowerCase());
            }
        } else if (key === 'showCutFill') {
            const enabled = (value === 'true');
            updates.showCutFill = enabled;
            (this.selectedView as any).showCutFill = enabled;
            this.updateCutFillStyle(enabled);

            const applyBtn = this.element.querySelector('.vpp-apply-btn') as HTMLButtonElement;
            if (applyBtn) {
                applyBtn.textContent = 'Applied!';
                applyBtn.style.background = '#28a745';
                setTimeout(() => {
                    applyBtn.textContent = 'Apply Changes';
                    applyBtn.style.background = '#4a90d9';
                }, 1000);
            }
        }

        this.onViewUpdate(this.selectedView, updates);
    }

    private updateCutFillStyle(enabled: boolean) {
        // FIX 4: Use window.components set by createBimWorld, not a
        // disconnected local reference. Previously this returned early for
        // lack of a components reference even though components was available.
        const components = window.components; // TODO(D.4): legacy components — replace with runtime.scene.components (ThatOpen)
        if (!components) return;

        const views = components.get(OBC.Views);
        const navManager = window.navManager; // TODO(D.4): legacy navManager — replace with runtime.scene.navigation manager
        const world = navManager?._camera?.world ?? window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world) return;

        const cutHeight = (this.selectedView as any)?.cutPlaneHeight ?? 1.2;

        console.log(`[CutFill] Updating: enabled=${enabled}, height=${cutHeight}`);

        const clipper = components.get(OBC.Clipper);
        if (clipper) {
            clipper.deleteAll();
            clipper.enabled = false;
        }

        const threeRenderer = world.renderer?.three;
        if (threeRenderer) {
            threeRenderer.clippingPlanes = enabled
                ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), cutHeight)]
                : [];
            threeRenderer.localClippingEnabled = false;
        }

        const viewId = (this.selectedView as any)?.id;
        if (enabled && viewId && views.list.has(viewId)) {
            const v = views.list.get(viewId);
            if (v) v.range = (this.selectedView as any).viewRange || 100;
            views.open(viewId);
        } else if (!enabled) {
            views.close();
        }

        if (!enabled) {
            this._restoreCutFillVisibility();
        }

        world.scene.three.traverse((obj: any) => {
            if (!obj.isMesh) return;
            const mesh = obj as THREE.Mesh;

            const type = (obj.userData?.type || obj.parent?.userData?.type || "").toLowerCase();
            const name = (obj.name + (obj.parent?.name || "")).toLowerCase();

            const isBuildingElement = type.includes('wall') || type.includes('slab') ||
                type.includes('door') || type.includes('window') ||
                name.includes('wall') || name.includes('slab') ||
                name.includes('door') || name.includes('window');

            if (!isBuildingElement) return;

            if (enabled) {
                if (!this._cutFillVisibility.has(mesh)) {
                    this._cutFillVisibility.set(mesh, mesh.visible);
                }

                obj.updateWorldMatrix(true, false);
                const box = new THREE.Box3().setFromObject(obj);
                obj.visible = (box.min.y <= cutHeight);
            }
        });

        if (world.renderer && 'needsUpdate' in world.renderer) {
            (world.renderer as any).needsUpdate = true;
        }
    }

    show(view: OBC.View): void {
        this.selectedView = view;
        this._clearContent();
        this.element.style.display = 'block';

        // Close button — absolutely positioned in the drag-handle header area
        const closeBtn = document.createElement('button');
        closeBtn.className = 'vpp-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => this.hide();
        this.element.appendChild(closeBtn);

        // Body wrapper provides content padding
        const body = document.createElement('div');
        body.className = 'vpp-body';
        this.element.appendChild(body);

        const viewType    = this.detectViewType(view);
        const viewRange   = (view as any).range        || 0;
        const scale       = (view as any).scale        || '1:100';
        const visualStyle = (view as any).visualStyle  || 'Consistent';
        const showCutFill = (view as any).showCutFill  || false;

        const identityContent = document.createElement('div');
        identityContent.style.display = 'contents';
        this.addProperty(identityContent, 'View Name',  view.id || 'Unnamed View', true);
        this.addProperty(identityContent, 'View Type',  viewType, true);
        this.addProperty(identityContent, 'View Range', viewRange, false, 'viewRange');
        this.addProperty(identityContent, 'Scale',      scale,     false, 'scale');

        // Visual Style Dropdown
        const vsLabel = document.createElement('div');
        vsLabel.className = 'vpp-label';
        vsLabel.textContent = 'Visual Style';
        identityContent.appendChild(vsLabel);

        const vsSelect = document.createElement('select');
        vsSelect.className = 'vpp-input';
        vsSelect.setAttribute('data-key', 'visualStyle');
        const styles = ['Consistent', 'Textures', 'Realistic'];
        styles.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if (s === visualStyle) opt.selected = true;
            vsSelect.appendChild(opt);
        });
        vsSelect.addEventListener('change', () => this.handlePropertyChange('visualStyle', vsSelect.value));
        identityContent.appendChild(vsSelect);

        const cutHeight = (view as any).cutPlaneHeight || 1.2;
        this.addProperty(identityContent, 'Cut Plane Height', cutHeight, false, 'cutPlaneHeight');

        // Cut Fill checkbox
        const labelEl = document.createElement('div');
        labelEl.className = 'vpp-label';
        labelEl.textContent = 'Show Cut Fill';
        identityContent.appendChild(labelEl);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = showCutFill;
        checkbox.style.justifySelf = 'end';
        checkbox.addEventListener('change', () => {
            const isEnabled = checkbox.checked;
            (view as any).showCutFill = isEnabled;
            this.handlePropertyChange('showCutFill', isEnabled ? 'true' : 'false');
        });
        identityContent.appendChild(checkbox);

        // Apply Button
        const applyBtn = document.createElement('button');
        applyBtn.className = 'vpp-apply-btn';
        applyBtn.textContent = 'Apply Changes';
        applyBtn.style.cssText = `
            grid-column: span 2;
            margin-top: 10px;
            padding: 6px;
            background: #4a90d9;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: 600;
        `;
        applyBtn.onclick = () => {
            const inputs = this.element.querySelectorAll('.vpp-input');
            inputs.forEach((input: any) => {
                const key = input.getAttribute('data-key');
                if (key) this.handlePropertyChange(key, input.value);
            });
            applyBtn.textContent = 'Applied!';
            applyBtn.style.background = '#28a745';
            setTimeout(() => {
                applyBtn.textContent = 'Apply Changes';
                applyBtn.style.background = '#4a90d9';
            }, 2000);
        };
        identityContent.appendChild(applyBtn);

        body.appendChild(this.renderSection('Identity', identityContent));

        const displayContent = document.createElement('div');
        displayContent.style.display = 'contents';
        this.addProperty(displayContent, 'Detail Level', 'Medium', true);
        this.addProperty(displayContent, 'Discipline', 'Architectural', true);
        body.appendChild(this.renderSection('Display', displayContent, true));
    }

    hide(): void {
        this.updateCutFillStyle(false);
        this.selectedView = null;
        this.element.style.display = 'none';
    }

    isVisible(): boolean {
        return this.element.style.display !== 'none';
    }

    // ── Phase II: showFromDefinition ─────────────────────────────────────────
    // (13-PROJECT-BROWSER-REFACTOR §7.2)
    // Additive — existing show(OBC.View) is untouched.

    /**
     * Show properties for a semantic ViewDefinition entity.
     * Called by ProjectBrowserPanel._onEntitySelect() when a view is clicked.
     * Replaces the OBC.View path for views that live in ViewDefinitionStore.
     */
    showFromDefinition(def: ViewDefinition): void {
        this._selectedViewDefinitionId = def.id;
        this.selectedView             = null;
        this._clearContent();
        this.element.style.display    = 'block';
        this._renderDefinitionProperties(def);
    }

    /**
     * Renders ViewDefinition properties in the same panel shell.
     * Sections: Identity · V/G Settings · AI Intent · Metadata.
     */
    private _renderDefinitionProperties(def: ViewDefinition): void {
        // Update drag handle title to show view name
        const handleTitle = this._dragHandle?.querySelector<HTMLElement>('.vpp-drag-handle__title');
        if (handleTitle) handleTitle.textContent = def.name;

        // Close button — absolutely positioned in drag-handle header area
        const closeBtn = document.createElement('button');
        closeBtn.className   = 'vpp-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick     = () => { if (handleTitle) handleTitle.textContent = 'View Properties'; this.hide(); };
        this.element.appendChild(closeBtn);

        // Body wrapper for padded content
        const body = document.createElement('div');
        body.className = 'vpp-body';
        this.element.appendChild(body);

        // ── § Identity ─────────────────────────────────────────────────────
        const identityContent = document.createElement('div');
        identityContent.style.display = 'contents';

        // Name — editable, fires UpdateViewDefinitionCommand on Enter
        const nameLabel = document.createElement('div');
        nameLabel.className   = 'vpp-label';
        nameLabel.textContent = 'Name';
        identityContent.appendChild(nameLabel);

        const nameInput = document.createElement('input');
        nameInput.className = 'vpp-input';
        nameInput.type      = 'text';
        nameInput.value     = def.name;
        nameInput.style.gridColumn = 'span 1';
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const newName = nameInput.value.trim();
                if (newName && newName !== def.name) {
                    this._updateViewDef(def.id, { name: newName });
                    // Update drag-handle title to reflect rename
                    if (handleTitle) handleTitle.textContent = newName;
                    nameInput.blur();
                }
            }
        });
        identityContent.appendChild(nameInput);

        // View Type — read-only
        this._addDefProp(identityContent, 'View Type', def.viewType, true);

        // Discipline — editable dropdown
        const discLabel = document.createElement('div');
        discLabel.className   = 'vpp-label';
        discLabel.textContent = 'Discipline';
        identityContent.appendChild(discLabel);

        const discSelect = document.createElement('select');
        discSelect.className = 'vpp-input';
        const discOptions: Array<ViewDefinition['discipline']> = ['architecture', 'structure', 'mep', 'all'];
        discOptions.forEach(d => {
            const opt = document.createElement('option');
            opt.value       = d ?? '';
            opt.textContent = d ?? '(none)';
            if (d === def.discipline) opt.selected = true;
            discSelect.appendChild(opt);
        });
        // blank "none" option first
        const discNone = document.createElement('option');
        discNone.value = '';
        discNone.textContent = '(none)';
        if (!def.discipline) discNone.selected = true;
        discSelect.insertBefore(discNone, discSelect.firstChild);
        discSelect.addEventListener('change', () => {
            const val = (discSelect.value as ViewDefinition['discipline']) || undefined;
            this._updateViewDef(def.id, { discipline: val });
        });
        identityContent.appendChild(discSelect);

        // View Purpose — editable dropdown (P9-23)
        const purposeLabel = document.createElement('div');
        purposeLabel.className   = 'vpp-label';
        purposeLabel.textContent = 'Purpose';
        identityContent.appendChild(purposeLabel);

        const purposeSelect = document.createElement('select');
        purposeSelect.className = 'vpp-input';
        const purposeOptions: Array<{ value: string; label: string }> = [
            { value: '',                  label: '(none)'            },
            { value: 'construction-docs', label: 'Construction Docs' },
            { value: 'design-review',     label: 'Design Review'     },
            { value: 'coordination',      label: 'Coordination'      },
            { value: 'presentation',      label: 'Presentation'      },
        ];
        purposeOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value       = opt.value;
            el.textContent = opt.label;
            if ((def.purpose ?? '') === opt.value) el.selected = true;
            purposeSelect.appendChild(el);
        });
        purposeSelect.addEventListener('change', () => {
            const val = purposeSelect.value || undefined;
            this._updateViewDef(def.id, { purpose: val ?? null } as any);
        });
        identityContent.appendChild(purposeSelect);

        // Phase Filter — editable dropdown
        const pfLabel = document.createElement('div');
        pfLabel.className   = 'vpp-label';
        pfLabel.textContent = 'Phase Filter';
        identityContent.appendChild(pfLabel);

        const pfSelect = document.createElement('select');
        pfSelect.className = 'vpp-input';
        const pfOptions = ['', 'Existing', 'Demolition', 'New Construction', 'Future'];
        pfOptions.forEach(pf => {
            const opt = document.createElement('option');
            opt.value       = pf;
            opt.textContent = pf || '(none)';
            if ((pf || undefined) === def.temporal?.phaseFilter) opt.selected = true;
            pfSelect.appendChild(opt);
        });
        pfSelect.addEventListener('change', () => {
            const pf = pfSelect.value as ViewDefinition['temporal']['phaseFilter'] | undefined;
            this._updateViewDef(def.id, { temporal: { phaseFilter: pf || undefined } });
        });
        identityContent.appendChild(pfSelect);

        // ── § Visibility Intent SPINE (Wave 2 P1) ──────────────────────────
        // Promoted to render BEFORE Identity — the intent is the spine of every view.
        // Replaces the deprecated V/G Settings block and the View Template section.
        body.appendChild(this._buildVisibilityIntentSection(def));

        body.appendChild(this._vppSection('Identity', identityContent));

        // ── § Per-view-type sections (Wave 4 / Stage S3) ─────────────────────
        // Section visibility is now decided by the central matrix in
        // ViewTypePropertiesPanelConfig.ts. 3D views skip View Range / Crop /
        // Underlay entirely (their build helpers are never invoked); plan
        // views render all four. Section/elevation render Output / Crop /
        // Underlay; analysis renders Output / View Range / Crop.
        const sections = getViewTypePanelSections(def.viewType);

        // ── § Output (Phase VI) ──────────────────────────────────────────────
        if (sections.output) {
            const outputSection = this._buildOutputSection(def);
            if (outputSection) body.appendChild(outputSection);
        }

        // ── § View Range (Phase VI — plan-family + analysis) ─────────────────
        if (sections.viewRange) {
            const viewRangeSection = this._buildViewRangeSection(def);
            if (viewRangeSection) body.appendChild(viewRangeSection);
        }

        // ── § Crop (Phase VI — 2D views only) ────────────────────────────────
        if (sections.crop) {
            const cropSection = this._buildCropSection(def);
            if (cropSection) body.appendChild(cropSection);
        }

        // ── § Underlay (Phase VI — plan/ceiling-plan/section/elevation) ──────
        if (sections.underlay) {
            const underlaySection = this._buildUnderlaySection(def);
            if (underlaySection) body.appendChild(underlaySection);
        }

        // ── § View Description (Wave 2 P1 — renamed from "AI Intent") ─────
        // Free-text description of the view's purpose. Read by the AI assistant.
        // The visibility *intent* is now the spine block at the top; this field
        // describes the *view*, not the rules.
        const descContent = document.createElement('div');
        descContent.style.display = 'contents';

        const descLabel = document.createElement('div');
        descLabel.className   = 'vpp-label';
        descLabel.style.gridColumn = 'span 2';
        descLabel.textContent = 'Description (used by AI)';
        descContent.appendChild(descLabel);

        const descArea = document.createElement('textarea');
        descArea.className = 'vpp-input';
        descArea.style.cssText = 'grid-column:span 2;height:56px;resize:vertical;font-family:inherit;';
        descArea.placeholder  = 'Describe what this view is for so the AI assistant can reason about it…';
        descArea.value        = def.intent ?? '';
        descArea.addEventListener('blur', () => {
            const newDesc = descArea.value.trim();
            if (newDesc !== (def.intent ?? '')) {
                this._updateViewDef(def.id, { intent: newDesc });
            }
        });
        descArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                descArea.blur();
            }
        });
        descContent.appendChild(descArea);

        body.appendChild(this._vppSection('View Description', descContent));

        // ── § Metadata ──────────────────────────────────────────────────────
        const metaContent = document.createElement('div');
        metaContent.style.display = 'contents';

        // Intent provenance rows (Wave 2 P1) — read-only, sourced from spine state.
        const instanceForMeta = viewIntentInstanceStore.get(def.id);
        const boundIntent     = instanceForMeta ? visibilityIntentStore.get(instanceForMeta.intentId) : null;
        this._addDefProp(metaContent, 'Bound Intent',       boundIntent?.name ?? '— none —', true);
        this._addDefProp(metaContent, 'Intent Version',     boundIntent ? String(boundIntent.schemaVersion ?? 1) : '—', true);
        this._addDefProp(metaContent, 'Last Intent Change', instanceForMeta?.updatedAt ? new Date(instanceForMeta.updatedAt).toLocaleString() : '—', true);

        this._addDefProp(metaContent, 'Created By', def.metadata.createdBy,           true);
        this._addDefProp(metaContent, 'Created',    this._fmtDate(def.metadata.createdAt), true);
        this._addDefProp(metaContent, 'Modified',   this._fmtDate(def.metadata.modifiedAt), true);
        this._addDefProp(metaContent, 'Version',    String(def.metadata.version),      true);

        body.appendChild(this._vppSection('Metadata', metaContent, true));
    }

    // ── Visibility Intent SPINE (Wave 2 P1) ──────────────────────────────────
    /**
     * Builds the promoted Intent spine block that lives at the TOP of the
     * Properties panel (above Identity).
     *
     * Replaces three legacy sections at once:
     *   • V/G Settings        — gradient block, "Open Intent Settings" pseudo-button
     *   • Visibility Intent   — collapsible card with intent picker + status badge
     *   • View Template       — Phase 12 template picker + locked-field comparison
     *
     * Now expressed via `--vi-*` design tokens with monochrome icons (no gradients,
     * no coloured emojis). Embeds the unified per-target override list (A7) and
     * pipes mutations through CommandManager only.
     */
    private _buildVisibilityIntentSection(def: ViewDefinition): HTMLElement {
        return buildVisibilityIntentSection({
            runtime: this.runtime,
            selectedView: this.selectedView,
            show: (v: any) => this.show(v),
            _execAssignViewIntent: (id, intentId) => this._execAssignViewIntent(id, intentId),
            _clearContent: () => this._clearContent(),
            _renderDefinitionProperties: (d: any) => this._renderDefinitionProperties(d),
        }, def);
    }

    private _execAssignViewIntent(viewId: string, intentId: string): void {
        this.runtime?.bus?.executeCommand('vg.assignIntent', { viewId, intentId });
        const def = window.viewDefinitionStore?.get?.(viewId) ?? null; // TODO(F.6.x): legacy viewDefinitionStore — replace with runtime.viewRegistry definitions
        if (def) {
            this._clearContent();
            this._renderDefinitionProperties(def);
        }
    }

    // ── Phase VI Section Builders ─────────────────────────────────────────────

    /**
     * Builds the "Output" section (scale, detail level, visual style, display model, shadows).
     * Always shown for all view types — applies regardless of plan/section/3d distinction.
     * Fires SetViewOutputCommand on each field change.
     */
    private _buildOutputSection(def: ViewDefinition): HTMLElement {
        return buildOutputSection({
            _fireSetViewOutput: (id, output) => this._fireSetViewOutput(id, output),
            onSceneBgChange: this.onSceneBgChange,
            _vppSection: (t, c, col) => this._vppSection(t, c, col),
        }, def);
    }

    /**
     * Builds the "View Range" section (top/cut/bottom/depth bounds).
     * Only shown for plan-family views: 'plan', 'ceiling-plan', 'structural-plan'.
     * Fires SetViewRangeCommand on Save. Returns null for non-plan view types.
     *
     * Intelligent defaults (§VI-13):
     *   When def.viewRange is undefined, bounds are pre-populated from
     *   computeViewRangeDefaults(def.spatial.levelId, levels) using Revit-equivalent
     *   conventions. Level IDs are presented as a <select> dropdown fed from
     *   BimManager (§02 spatial authority — single source of truth).
     *   The "Reset to Level Defaults" button re-applies computed defaults at any time.
     */
    private _buildViewRangeSection(def: ViewDefinition): HTMLElement | null {
        return buildViewRangeSection({
            _fireSetViewRange: (id, range) => this._fireSetViewRange(id, range),
            _vppSection: (t, c, col) => this._vppSection(t, c, col),
        }, def);
    }

    /**
     * Builds the "Crop" section (enabled toggle, annotation crop).
     * Applies to all view types. Fires SetViewCropCommand on change.
     */
    private _buildCropSection(def: ViewDefinition): HTMLElement {
        const c = def.crop;
        const content = document.createElement('div');
        content.style.display = 'contents';

        // Enabled
        const enabledLabel = document.createElement('div');
        enabledLabel.className   = 'vpp-label';
        enabledLabel.textContent = 'Crop Active';
        content.appendChild(enabledLabel);

        const enabledCheck = document.createElement('input');
        enabledCheck.type  = 'checkbox';
        enabledCheck.style.justifySelf = 'end';
        enabledCheck.checked = c?.enabled ?? false;
        enabledCheck.addEventListener('change', () => {
            const patch: ViewCropSettings = { ...(c ?? {}), enabled: enabledCheck.checked };
            this._fireSetViewCrop(def.id, patch);
        });
        content.appendChild(enabledCheck);

        // Annotation crop
        const acLabel = document.createElement('div');
        acLabel.className   = 'vpp-label';
        acLabel.textContent = 'Annotation Crop';
        content.appendChild(acLabel);

        const acCheck = document.createElement('input');
        acCheck.type  = 'checkbox';
        acCheck.style.justifySelf = 'end';
        acCheck.checked = c?.annotationCrop ?? false;
        acCheck.addEventListener('change', () => {
            const patch: ViewCropSettings = { ...(c ?? { enabled: false }), annotationCrop: acCheck.checked };
            this._fireSetViewCrop(def.id, patch);
        });
        content.appendChild(acCheck);

        if (def.viewType === 'section' || def.viewType === 'elevation') {
            const depthLabel = document.createElement('div');
            depthLabel.className = 'vpp-label';
            depthLabel.textContent = 'View Depth (m)';
            content.appendChild(depthLabel);

            const depthInput = document.createElement('input');
            depthInput.className = 'vpp-input';
            depthInput.type = 'number';
            depthInput.min = '0.25';
            depthInput.step = '0.1';
            depthInput.placeholder = 'Unclipped';
            depthInput.value = c?.farClip?.offset != null ? String(c.farClip.offset) : '';
            depthInput.addEventListener('change', () => {
                const raw = depthInput.value.trim();
                const nextFarClip = raw === ''
                    ? undefined
                    : { ...(c?.farClip ?? {}), offset: Math.max(0.25, parseFloat(raw) || 0.25) };
                const patch: ViewCropSettings = { ...(c ?? { enabled: true }), enabled: true };
                if (nextFarClip) patch.farClip = nextFarClip;
                else delete patch.farClip;
                this._fireSetViewCrop(def.id, patch);
            });
            content.appendChild(depthInput);
        }

        return this._vppSection('Crop', content, true);
    }

    /**
     * Builds the "Underlay" section (orientation dropdown).
     * Only shown for 'plan' and 'ceiling-plan' view types.
     * Fires SetViewUnderlayCommand on change.
     * Returns null if view type does not support underlays.
     */
    private _buildUnderlaySection(def: ViewDefinition): HTMLElement | null {
        const underlayTypes = ['plan', 'ceiling-plan'] as const;
        if (!(underlayTypes as readonly string[]).includes(def.viewType)) return null;

        const u = def.underlay;
        const content = document.createElement('div');
        content.style.display = 'contents';

        // Base Level ID
        const baseLvlLabel = document.createElement('div');
        baseLvlLabel.className   = 'vpp-label';
        baseLvlLabel.textContent = 'Base Level ID';
        content.appendChild(baseLvlLabel);

        const baseLvlInput = document.createElement('input');
        baseLvlInput.className   = 'vpp-input';
        baseLvlInput.type        = 'text';
        baseLvlInput.placeholder = '(none)';
        baseLvlInput.value       = u?.baseLevelId ?? '';
        content.appendChild(baseLvlInput);

        // Top Level ID
        const topLvlLabel = document.createElement('div');
        topLvlLabel.className   = 'vpp-label';
        topLvlLabel.textContent = 'Top Level ID';
        content.appendChild(topLvlLabel);

        const topLvlInput = document.createElement('input');
        topLvlInput.className   = 'vpp-input';
        topLvlInput.type        = 'text';
        topLvlInput.placeholder = '(none)';
        topLvlInput.value       = u?.topLevelId ?? '';
        content.appendChild(topLvlInput);

        // Orientation
        const orientLabel = document.createElement('div');
        orientLabel.className   = 'vpp-label';
        orientLabel.textContent = 'Orientation';
        content.appendChild(orientLabel);

        const orientSelect = document.createElement('select');
        orientSelect.className = 'vpp-input';
        const orientOpts = [
            { value: 'lookingDown', label: 'Looking Down' },
            { value: 'lookingUp',   label: 'Looking Up (RCP)' },
        ];
        orientOpts.forEach(opt => {
            const el = document.createElement('option');
            el.value       = opt.value;
            el.textContent = opt.label;
            if ((u?.orientation ?? 'lookingDown') === opt.value) el.selected = true;
            orientSelect.appendChild(el);
        });
        content.appendChild(orientSelect);

        // Save button
        const divider2 = document.createElement('div');
        divider2.style.display = 'none';
        content.appendChild(divider2);

        const saveBtn = document.createElement('button');
        saveBtn.style.cssText = `
            grid-column:span 2;margin-top:6px;padding:5px;
            background:#4a90d9;color:#fff;border:none;
            border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;font-family:inherit;
        `;
        saveBtn.textContent = 'Save Underlay';
        saveBtn.onclick = () => {
            const newUnderlay = {
                baseLevelId: baseLvlInput.value.trim() || undefined,
                topLevelId:  topLvlInput.value.trim()  || undefined,
                orientation: orientSelect.value as 'lookingDown' | 'lookingUp',
            };
            this._fireSetViewUnderlay(def.id, newUnderlay);
            saveBtn.textContent = 'Saved ✓';
            saveBtn.style.background = '#28a745';
            setTimeout(() => { saveBtn.textContent = 'Save Underlay'; saveBtn.style.background = '#4a90d9'; }, 1800);
        };
        content.appendChild(saveBtn);

        return this._vppSection('Underlay', content, true);
    }

    // ── Phase VI Command Fire Helpers ─────────────────────────────────────────
    // §01 §2 — All mutations go through CommandManager; no direct store calls.

    private _fireSetViewOutput(viewId: string, output: ViewOutputSettings | null): void {
        // Phase F-1.1: SetViewOutputHandler is now a full state-mutating bus handler.
        // commandManager.execute() dual-write removed.
        window.runtime?.bus?.executeCommand('view.setOutput', { viewId, output: output as Record<string, unknown> | null }).catch(() => {});
    }

    private _fireSetViewRange(viewId: string, viewRange: import('@pryzm/core-app-model').ViewRangeSettings | null): void {
        // Phase F-1.1: SetViewRangeHandler is now a full state-mutating bus handler.
        // commandManager.execute() dual-write removed.
        window.runtime?.bus?.executeCommand('view.setRange', { viewId, viewRange: viewRange as Record<string, unknown> | null }).catch(() => {});
    }

    private _fireSetViewCrop(viewId: string, crop: ViewCropSettings | null): void {
        // Phase F-1.1: SetViewCropHandler is now a full state-mutating bus handler.
        // commandManager.execute() dual-write removed.
        window.runtime?.bus?.executeCommand('view.setCrop', { viewId, crop: crop as Record<string, unknown> | null }).catch(() => {});
    }

    private _fireSetViewUnderlay(viewId: string, underlay: ViewUnderlaySettings | null): void {
        // Phase F-1.1: SetViewUnderlayHandler is now a full state-mutating bus handler.
        // commandManager.execute() dual-write removed.
        window.runtime?.bus?.executeCommand('view.setUnderlay', { viewId, underlay: underlay as Record<string, unknown> | null }).catch(() => {});
    }

    /** Build a collapsible vpp-section (reuses existing renderSection logic inline) */
    private _vppSection(title: string, content: HTMLElement, collapsed = false): HTMLElement {
        const section = document.createElement('div');
        section.className = 'vpp-section';

        const header = document.createElement('div');
        header.className = 'vpp-header';
        header.innerHTML = `<span>${title}</span><span class="toggle-icon">${collapsed ? '▼' : '▲'}</span>`;

        const body = document.createElement('div');
        body.className = 'vpp-content';
        body.style.display = collapsed ? 'none' : 'grid';
        body.appendChild(content);

        header.onclick = () => {
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'grid' : 'none';
            header.querySelector('.toggle-icon')!.textContent = hidden ? '▲' : '▼';
        };

        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    /** Add a label+value row to a grid container */
    private _addDefProp(container: HTMLElement, label: string, value: string, _readonly = true): void {
        const l = document.createElement('div');
        l.className   = 'vpp-label';
        l.textContent = label;
        container.appendChild(l);

        const v = document.createElement('div');
        v.className   = 'vpp-value';
        v.textContent = value;
        container.appendChild(v);
    }

    /** Format a Unix-ms timestamp to a readable local date string */
    private _fmtDate(ms: number): string {
        return new Date(ms).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    /**
     * Fire view.updateDefinition via command bus.
     * Phase F-1.1: UpdateViewDefinitionHandler is now a full state-mutating bus handler.
     * §01 §2 — Command-first mutation; no direct store call from UI.
     */
    private _updateViewDef(viewId: string, patch: UpdateViewDefinitionPatch): void {
        window.runtime?.bus?.executeCommand('view.updateDefinition', { viewId, patch: patch as Record<string, unknown> }).catch(() => {});
    }

    // ── Phase III stubs (additive) ────────────────────────────────────────────
    // Will be implemented in Phase III when SheetStore and ScheduleStore land.

    /**
     * Show properties for a SheetDefinition entity (Phase III).
     * Called by ProjectBrowserPanel._onEntitySelect() when a sheet is clicked.
     */
    showSheet(sheet: SheetDefinition): void {
        this._selectedViewDefinitionId = null;
        this.selectedView              = null;
        this._clearContent();
        this.element.style.display     = 'block';
        this._renderSheetProperties(sheet);
    }

    /**
     * Show properties for a ScheduleDefinition entity (Phase III).
     * Called by ProjectBrowserPanel._onEntitySelect() when a schedule is clicked.
     */
    showSchedule(schedule: ScheduleDefinition): void {
        this._selectedViewDefinitionId = null;
        this.selectedView              = null;
        this._clearContent();
        this.element.style.display     = 'block';
        this._renderScheduleProperties(schedule);
    }

    private _renderSheetProperties(sheet: SheetDefinition): void {
        // Update drag handle title
        const handleTitle = this._dragHandle?.querySelector<HTMLElement>('.vpp-drag-handle__title');
        if (handleTitle) handleTitle.textContent = `${sheet.sheetNumber} — ${sheet.name}`;

        // Close button — absolutely positioned in drag-handle header area
        const closeBtn = document.createElement('button');
        closeBtn.className   = 'vpp-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick     = () => { if (handleTitle) handleTitle.textContent = 'View Properties'; this.hide(); };
        this.element.appendChild(closeBtn);

        // Body wrapper for padded content
        const body = document.createElement('div');
        body.className = 'vpp-body';
        this.element.appendChild(body);

        // ── § Sheet Identity ────────────────────────────────────────────────
        const identityContent = document.createElement('div');
        identityContent.style.display = 'contents';

        this._addDefProp(identityContent, 'Sheet Number', sheet.sheetNumber, true);
        this._addDefProp(identityContent, 'Name',         sheet.name,         true);
        this._addDefProp(identityContent, 'Revision',     sheet.revision || '—', true);
        this._addDefProp(identityContent, 'Title Block',  sheet.titleBlock || '—', true);
        this._addDefProp(identityContent, 'Views on Sheet', String(sheet.viewports.length), true);

        body.appendChild(this._vppSection('Sheet Identity', identityContent));

        // ── § Metadata ──────────────────────────────────────────────────────
        const metaContent = document.createElement('div');
        metaContent.style.display = 'contents';

        this._addDefProp(metaContent, 'Created By', sheet.metadata.createdBy,             true);
        this._addDefProp(metaContent, 'Created',    this._fmtDate(sheet.metadata.createdAt),  true);
        this._addDefProp(metaContent, 'Modified',   this._fmtDate(sheet.metadata.modifiedAt), true);

        body.appendChild(this._vppSection('Metadata', metaContent, true));
    }

    private _renderScheduleProperties(schedule: ScheduleDefinition): void {
        // Update drag handle title
        const handleTitle = this._dragHandle?.querySelector<HTMLElement>('.vpp-drag-handle__title');
        if (handleTitle) handleTitle.textContent = schedule.name;

        // Close button — absolutely positioned in drag-handle header area
        const closeBtn = document.createElement('button');
        closeBtn.className   = 'vpp-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick     = () => { if (handleTitle) handleTitle.textContent = 'View Properties'; this.hide(); };
        this.element.appendChild(closeBtn);

        // Body wrapper for padded content
        const body = document.createElement('div');
        body.className = 'vpp-body';
        this.element.appendChild(body);

        // ── § Schedule Identity ─────────────────────────────────────────────
        const identityContent = document.createElement('div');
        identityContent.style.display = 'contents';

        this._addDefProp(identityContent, 'Name',          schedule.name,                              true);
        this._addDefProp(identityContent, 'Category',      schedule.scheduleType,                      true);
        this._addDefProp(identityContent, 'Fields',        schedule.fields.length > 0
            ? schedule.fields.join(', ')
            : '—',                                                                                       true);

        body.appendChild(this._vppSection('Schedule Identity', identityContent));

        // ── § Metadata ──────────────────────────────────────────────────────
        const metaContent = document.createElement('div');
        metaContent.style.display = 'contents';

        this._addDefProp(metaContent, 'Created',  this._fmtDate(schedule.metadata.createdAt),  true);
        this._addDefProp(metaContent, 'Modified', this._fmtDate(schedule.metadata.modifiedAt), true);

        body.appendChild(this._vppSection('Metadata', metaContent, true));
    }

    private _restoreCutFillVisibility(): void {
        for (const [mesh, visible] of this._cutFillVisibility) {
            mesh.visible = visible;
        }
        this._cutFillVisibility.clear();
    }

    dispose(): void {
        this.updateCutFillStyle(false);
        this._restoreCutFillVisibility();
        this.element.remove();
    }
}
