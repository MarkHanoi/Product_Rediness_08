/**
 * PropertyPanelBodyRenderer
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE).
 * Renders the full element body (header + scrollable sections + footer) into
 * the panel container and returns the imperative DOM refs the panel class
 * needs to wire up Apply / validation / mark-change events.
 *
 * Dependencies:
 *  - PropertyPanelSections   — spatial, relationships, action-footer builders
 *  - PropertyPanelTypeSelector — type-swap widget per element type
 *  - All element-specific section helpers imported directly
 *
 * P4-compliant: all window.* accesses use typed Window extension declarations.
 * TODO(E.*) markers annotate Phase E migration targets.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    generateDescriptors,
    descriptorsForSection,
    normalizeType,
} from './PropertyDescriptorGenerator';
import { renderSection as renderPropSection } from './PropertyRenderer';
import { buildWallLayersEditor }    from './WallLayersEditor';
import { buildSlabLayersEditor }    from './SlabLayersEditor';
import { buildCurtainGridEditor }   from './CurtainGridEditor';
import { buildCurtainPanelEditor }  from './CurtainPanelEditor';
import { buildDoorSection }         from '@pryzm/geometry-door';
import { buildWindowSection }       from '@pryzm/geometry-window';
import { RoofPropertySheet }        from './RoofPropertySheet';
import {
    _buildSpatialSection,
    _buildRelationshipsSection,
    _buildSpatialSummary,
    _buildActionFooter,
} from './PropertyPanelSections';
import { _buildTypeSelector, TypeSelectorHost } from './PropertyPanelTypeSelector';

// ── Host interface ────────────────────────────────────────────────────────────

/**
 * Mutable panel state + callbacks required by the body renderer.
 * PropertyPanel provides this via `_asBodyRendererHost()`.
 */
export interface BodyRendererHost extends TypeSelectorHost {
    /** Live draft edits; passed into renderSection for two-way binding. */
    readonly draft: Map<string, any>;
    /** Per-field validation errors; passed into renderSection. */
    readonly validationErrors: Map<string, string>;
    /** Roof store slot; null if roofs module is not yet loaded. */
    readonly roofStore: { getById(id: string): Record<string, any> | null | undefined } | null;
    /** The legacy command manager reference. */
    readonly commandManager: any;
    /** Currently selected Three.js object; guards re-render after type swap. */
    readonly selectedObject: THREE.Object3D | null;
    /** Injects panel CSS once per render cycle. */
    injectStyles(): void;
    /** Wired to `PropertyPanel.onApply`. */
    onApply(elementData: Record<string, any>): void;
    /** Wired to `PropertyPanel.onDelete`. */
    onDelete(elementData: Record<string, any>): void;
    /** Returns the panel's close / collapse button. */
    buildCloseBtn(): HTMLElement;
}

// ── Return type ───────────────────────────────────────────────────────────────

/** DOM refs returned to PropertyPanel for imperative wiring. */
export interface ElementRenderRefs {
    markInput:        HTMLInputElement;
    applyBtn:         HTMLButtonElement;
    validationBanner: HTMLDivElement;
}

// ── Header builder (exported for showElement room-path) ───────────────────────

/** Builds the panel header and returns it alongside the markInput ref. */
export function _buildElementHeader(
    host: BodyRendererHost,
    elementData: Record<string, any>,
): { el: HTMLElement; markInput: HTMLInputElement } {
    const header = document.createElement('div');
    header.className = 'gpp-header';

    const typeBadge = document.createElement('div');
    typeBadge.className = 'gpp-type-badge';
    typeBadge.textContent = (elementData.elementType || elementData.type || 'Element').toUpperCase();
    header.appendChild(typeBadge);

    const markRow = document.createElement('div');
    markRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const markInput = document.createElement('input');
    markInput.className   = 'gpp-mark-input';
    const existingMark    = elementData.properties?.mark ?? elementData.mark ?? '';
    markInput.value       = existingMark;
    markInput.placeholder = 'Mark / Name';
    markInput.addEventListener('input', () => {
        host.draft.set('mark', markInput.value);
    });
    markRow.appendChild(markInput);
    header.appendChild(markRow);

    const idRow = document.createElement('div');
    idRow.className = 'gpp-id-row';
    const idSpan = document.createElement('span');
    const id = elementData.id ?? '—';
    idSpan.textContent = id.length > 20 ? id.substring(0, 20) + '…' : id;
    idSpan.title = id;
    const copyBtn = document.createElement('button');
    copyBtn.className   = 'gpp-id-copy';
    copyBtn.textContent = 'Copy ID';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(id).catch(() => {});
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
    });
    idRow.appendChild(idSpan);
    idRow.appendChild(copyBtn);
    header.appendChild(idRow);

    // Phase 10 — Element Code (read-only)
    if (id) {
        const ec = window.elementCodeStore?.getCode?.(id); // TODO(C.3.x): legacy elementCodeStore — replace with runtime.projectContext element-code registry
        if (ec?.code) {
            const codeRow = document.createElement('div');
            codeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
            const codeLabel = document.createElement('span');
            codeLabel.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.5);min-width:80px;';
            codeLabel.textContent = 'Element Code';
            const codeValue = document.createElement('span');
            codeValue.style.cssText = 'font-size:11px;font-weight:600;color:rgba(255,255,255,0.9);'
                + 'font-family:monospace;background:rgba(255,255,255,0.08);'
                + 'padding:1px 6px;border-radius:3px;letter-spacing:0.04em;';
            codeValue.textContent = ec.code;
            codeRow.appendChild(codeLabel);
            codeRow.appendChild(codeValue);
            header.appendChild(codeRow);
        }
    }

    const spatialSummary = _buildSpatialSummary(elementData);
    if (spatialSummary) {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'gpp-spatial-summary';
        summaryEl.textContent = spatialSummary;
        header.appendChild(summaryEl);
    }

    const typeSelector = _buildTypeSelector(host, elementData);
    if (typeSelector) {
        header.appendChild(typeSelector);
    }

    header.appendChild(host.buildCloseBtn());
    return { el: header, markInput };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Clears `container`, injects styles, builds header + body, appends both.
 * Returns the three DOM refs that PropertyPanel must hold for event wiring.
 */
export function _renderElementToContainer(
    container: HTMLElement,
    host: BodyRendererHost,
    elementData: Record<string, any>,
): ElementRenderRefs {
    container.innerHTML = '';
    host.injectStyles();

    const { el: header, markInput } = _buildElementHeader(host, elementData);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'gpp-body';

    const descriptors   = generateDescriptors(elementData);
    const elType        = normalizeType(elementData.elementType || elementData.type || '');

    const sectionsConfig: { title: string; section: typeof descriptors[0]['section']; collapsed: boolean }[] = [
        { title: 'Identity',              section: 'identity',      collapsed: false },
        { title: 'Spatial Context',       section: 'spatial',       collapsed: false },
        { title: 'Definition Properties', section: 'definition',    collapsed: false },
        { title: 'Instance Properties',   section: 'instance',      collapsed: false },
        { title: 'Relationships',         section: 'relationships', collapsed: true  },
        { title: 'Metadata / System',     section: 'metadata',      collapsed: true  },
    ];

    sectionsConfig.forEach(({ title, section, collapsed }) => {
        if (section === 'spatial') {
            body.appendChild(_buildSpatialSection(elementData, collapsed));
            return;
        }
        if (section === 'relationships') {
            body.appendChild(_buildRelationshipsSection(elementData, collapsed));
            return;
        }

        const sectionDescriptors = descriptorsForSection(descriptors, section);
        const isLayeredElement   = elType === 'wall' || elType === 'slab';
        if (sectionDescriptors.length === 0 && !(section === 'definition' && isLayeredElement)) return;

        const sectionEl = renderPropSection(
            title, section, sectionDescriptors, elementData, host.draft, host.validationErrors, collapsed
        );

        // Wall Definition: inject editable layers editor
        if (section === 'definition' && elType === 'wall') {
            const sectionBody = sectionEl.children[1] as HTMLElement | undefined;
            if (sectionBody) {
                const fullWidthWrap = document.createElement('div');
                fullWidthWrap.style.cssText = 'grid-column: 1 / -1;';
                const layersEditor = buildWallLayersEditor(elementData, (layers) => {
                    const thickness = parseFloat(
                        layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0).toFixed(6)
                    );
                    window.runtime?.bus?.executeCommand('wall.setLayers', {
                        id:           elementData.id,
                        layers,
                        thickness,
                        systemTypeId: elementData.systemTypeId ?? null,
                    })?.catch((e: Error) => console.error('[PropertyPanel] wall.setLayers failed:', e));
                });
                if (layersEditor) {
                    fullWidthWrap.appendChild(layersEditor);
                    sectionBody.appendChild(fullWidthWrap);
                }
            }
        }

        // Slab Definition: inject editable slab layers editor
        if (section === 'definition' && elType === 'slab') {
            const sectionBody = sectionEl.children[1] as HTMLElement | undefined;
            if (sectionBody) {
                const fullWidthWrap = document.createElement('div');
                fullWidthWrap.style.cssText = 'grid-column: 1 / -1;';
                const layersEditor = buildSlabLayersEditor(elementData, (layers) => {
                    const thickness = parseFloat(
                        layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0).toFixed(6)
                    );
                    window.runtime?.bus?.executeCommand('slab.update', {
                        id:           elementData.id,
                        systemTypeId: elementData.systemTypeId ?? null,
                        layers,
                        thickness,
                    })?.catch((e: Error) => console.error('[PropertyPanel] slab.update (layers) failed:', e));
                });
                if (layersEditor) {
                    fullWidthWrap.appendChild(layersEditor);
                    sectionBody.appendChild(fullWidthWrap);
                }
            }
        }

        // Curtain wall Definition: inject Grid + Panel editors + sub-element hint
        if (section === 'definition' && elType === 'curtainwall') {
            const sectionBody = sectionEl.children[1] as HTMLElement | undefined;
            if (sectionBody) {
                const cwWrap = document.createElement('div');
                cwWrap.style.cssText = 'grid-column: 1 / -1;';

                const gridEditor  = buildCurtainGridEditor(elementData);
                if (gridEditor)  cwWrap.appendChild(gridEditor);
                const panelEditor = buildCurtainPanelEditor(elementData);
                if (panelEditor) cwWrap.appendChild(panelEditor);

                const subElHint = document.createElement('div');
                subElHint.style.cssText = [
                    'grid-column:1/-1',
                    'margin-top:10px',
                    'padding:7px 10px',
                    'border-radius:5px',
                    'background:rgba(255,140,0,0.08)',
                    'border:1px solid rgba(255,140,0,0.30)',
                    'font-size:11px',
                    'color:#c87700',
                    'line-height:1.5',
                ].join(';');
                subElHint.innerHTML =
                    '<strong style="display:block;margin-bottom:3px">Sub-element selection</strong>' +
                    'Click a panel or mullion in the 3D view to inspect it.<br>' +
                    'Press <kbd style="' +
                    'background:#2a2a2a;color:#eee;border-radius:3px;padding:1px 5px;' +
                    'font-size:10px;font-family:monospace">Tab</kbd> to cycle through all sub-elements &nbsp;|&nbsp; ' +
                    '<kbd style="' +
                    'background:#2a2a2a;color:#eee;border-radius:3px;padding:1px 5px;' +
                    'font-size:10px;font-family:monospace">Esc</kbd> to return here.';
                cwWrap.appendChild(subElHint);

                if (cwWrap.children.length > 0) {
                    sectionBody.appendChild(cwWrap);
                }
            }
        }

        body.appendChild(sectionEl);
    });

    // Phase D: Door / Window / Roof parametric sections
    if (elType === 'door') {
        const doorSec = buildDoorSection(elementData.id);
        if (doorSec) body.appendChild(doorSec);
    } else if (elType === 'window') {
        const winSec = buildWindowSection(elementData.id);
        if (winSec) body.appendChild(winSec);
    } else if (elType === 'roof') {
        const roofData = host.roofStore?.getById?.(elementData.id);
        if (roofData) {
            const roofSheet = new RoofPropertySheet(host.commandManager);
            roofSheet.render(body, roofData as any);
        }
    }

    const validationBanner = document.createElement('div');
    validationBanner.className = 'gpp-validation-banner';
    body.appendChild(validationBanner);

    const applyBtn = document.createElement('button');
    applyBtn.className   = 'gpp-apply-btn';
    applyBtn.textContent = 'Apply Changes';
    applyBtn.addEventListener('click', () => host.onApply(elementData));
    body.appendChild(applyBtn);

    body.appendChild(_buildActionFooter(elementData, { onDelete: (d) => host.onDelete(d) }));

    container.appendChild(body);

    return { markInput, applyBtn, validationBanner };
}
