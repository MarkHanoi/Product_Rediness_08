/**
 * PropertyPanelSections
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE).
 * Pure DOM-building helpers for the property panel section cards:
 *  - Generic section scaffold (step-circle + chevron + collapsible body)
 *  - Spatial Context section
 *  - Relationships section
 *  - Spatial summary string
 *  - Action footer (Move / Rotate / Delete)
 *
 * All functions are free of `this` — they operate purely on their arguments.
 * window.* accesses use typed Window extension declarations (P4-compliant).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { normalizeType } from './PropertyDescriptorGenerator';
import { extractPlacementInfo, renderPlacementSection } from './PlacementEditor';
import { extractRelationships, renderRelationshipSection } from './RelationshipViewer';
import { SECTION_STEPS } from './PropertyPanelTheme';

// ── Host interface ────────────────────────────────────────────────────────────

/** Minimal callbacks required by the action footer builder. */
export interface SectionsHost {
    /** Invoked when the Delete button is clicked. */
    onDelete(elementData: Record<string, any>): void;
}

// ── Generic section scaffold ──────────────────────────────────────────────────

/**
 * Builds a themed section card: step-circle + title + chevron, collapsible body.
 * Shared base used by Spatial Context, Relationships, and any generic schema section.
 */
export function _buildGenericSection(
    title: string,
    sectionKey: string,
    collapsed: boolean,
    populateBody: (bodyEl: HTMLElement) => void,
): HTMLElement {
    const outer = document.createElement('div');
    outer.className = 'gpp-section';

    const headerEl = document.createElement('div');
    headerEl.className = 'gpp-section-header' + (collapsed ? '' : ' open');

    const stepNum = SECTION_STEPS[sectionKey] ?? '';
    const circle  = document.createElement('div');
    circle.className = 'gpp-step-circle';
    circle.textContent = String(stepNum);
    headerEl.appendChild(circle);

    const titleEl = document.createElement('span');
    titleEl.className = 'gpp-section-title';
    titleEl.textContent = title;
    headerEl.appendChild(titleEl);

    const chevron = document.createElement('span');
    chevron.className = 'gpp-chevron';
    chevron.textContent = collapsed ? '▶' : '▼';
    headerEl.appendChild(chevron);

    const body = document.createElement('div');
    populateBody(body);

    headerEl.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        chevron.textContent = isHidden ? '▼' : '▶';
        if (isHidden) {
            headerEl.classList.add('open');
        } else {
            headerEl.classList.remove('open');
        }
    });

    outer.appendChild(headerEl);
    outer.appendChild(body);
    return outer;
}

// ── Spatial Context section ───────────────────────────────────────────────────

export function _buildSpatialSection(
    elementData: Record<string, any>,
    collapsed: boolean,
): HTMLElement {
    return _buildGenericSection(
        'Spatial Context', 'spatial', collapsed,
        (bodyEl) => {
            bodyEl.style.display = collapsed ? 'none' : 'block';
            bodyEl.style.padding = '8px 10px';
            const info = extractPlacementInfo(elementData);

            // Wall-only: onCommit handler for editable placement fields
            const elType = normalizeType(elementData.elementType || elementData.type || '');
            const placementOnCommit = elType === 'wall'
                ? (key: string, newValue: number) => {
                    if (key !== 'length') return;
                    const bl = elementData.baseLine;
                    if (!bl || !bl[0] || !bl[1]) return;

                    const startPt: THREE.Vector3 = bl[0] instanceof THREE.Vector3
                        ? bl[0]
                        : new THREE.Vector3(bl[0].x ?? 0, bl[0].y ?? 0, bl[0].z ?? 0);
                    const endPt: THREE.Vector3 = bl[1] instanceof THREE.Vector3
                        ? bl[1]
                        : new THREE.Vector3(bl[1].x ?? 0, bl[1].y ?? 0, bl[1].z ?? 0);

                    const dir = new THREE.Vector3().subVectors(endPt, startPt);
                    const currentLen = dir.length();
                    if (currentLen < 1e-6) return;

                    dir.normalize();
                    const newEnd = startPt.clone().addScaledVector(dir, newValue);

                    window.runtime?.bus?.executeCommand('wall.updateBaseline', {
                        wallId:       elementData.id,
                        newBaseLine:  [startPt.clone(), newEnd],
                        prevBaseLine: [{ x: startPt.x, y: startPt.y, z: startPt.z }, { x: endPt.x, y: endPt.y, z: endPt.z }],
                    })?.catch((e: Error) => console.warn('[PropertyPanel] wall.updateBaseline failed:', e));
                }
                : undefined;

            bodyEl.appendChild(renderPlacementSection(info, placementOnCommit));

            // Wall-only: editable Level dropdown
            if (elType === 'wall' && elementData.levelId) {
                const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
                const allLevels: any[] = bimManager?.getLevels?.() ?? [];

                if (allLevels.length > 1) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;';

                    const lbl = document.createElement('div');
                    lbl.style.cssText = 'font-size:11px;color:#555;min-width:110px;';
                    lbl.textContent = 'Change Level';

                    const sel = document.createElement('select');
                    sel.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;background:#fff;';

                    allLevels.forEach((lvl: any) => {
                        const opt = document.createElement('option');
                        opt.value = lvl.id;
                        opt.textContent = `${lvl.name} (${lvl.elevation}m)`;
                        if (lvl.id === elementData.levelId) opt.selected = true;
                        sel.appendChild(opt);
                    });

                    sel.addEventListener('change', () => {
                        const selectedLevel = allLevels.find((l: any) => l.id === sel.value);
                        const newElevationY: number = selectedLevel?.elevation ?? 0;
                        window.runtime?.bus?.executeCommand('wall.changeLevel', {
                            id:            elementData.id,
                            newLevelId:    sel.value,
                            newElevationY,
                        })?.catch((e: Error) => console.warn('[PropertyPanel] wall.changeLevel failed:', e));
                    });

                    row.appendChild(lbl);
                    row.appendChild(sel);
                    bodyEl.appendChild(row);
                }
            }
        }
    );
}

// ── Relationships section ─────────────────────────────────────────────────────

export function _buildRelationshipsSection(
    elementData: Record<string, any>,
    collapsed: boolean,
): HTMLElement {
    return _buildGenericSection(
        'Relationships', 'relationships', collapsed,
        (bodyEl) => {
            bodyEl.style.display = collapsed ? 'none' : 'block';
            bodyEl.style.padding = '8px 10px';
            const relationships = extractRelationships(elementData);
            bodyEl.appendChild(renderRelationshipSection(relationships));
        }
    );
}

// ── Spatial summary string ────────────────────────────────────────────────────

/**
 * Returns a one-line summary such as "Level: Ground Floor | Host: ab12ef34"
 * or an empty string if no spatial context is available.
 */
export function _buildSpatialSummary(elementData: Record<string, any>): string {
    const levelId = elementData.levelId;
    if (levelId) {
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const level      = bimManager?.getLevelById(levelId);
        const levelName  = level ? level.name : levelId.substring(0, 8);

        const hostId = elementData.wallId ?? elementData.hostId;
        if (hostId) {
            return `Level: ${levelName}  |  Host: ${hostId.substring(0, 8)}`;
        }
        return `Level: ${levelName}`;
    }

    const baseLevelId = elementData.baseLevelId;
    if (baseLevelId) {
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const level      = bimManager?.getLevelById(baseLevelId);
        return `Base: ${level ? level.name : baseLevelId.substring(0, 8)}`;
    }

    return '';
}

// ── Action footer ─────────────────────────────────────────────────────────────

/**
 * Builds the Move / Rotate / Delete footer bar.
 * `onDelete` is provided by the caller (PropertyPanel.onDelete).
 */
export function _buildActionFooter(
    elementData: Record<string, any>,
    host: SectionsHost,
): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'gpp-actions';

    const moveBtn = _makeActionBtn('Move', () => {
        const tc = window.transformControls; // TODO(D.10): legacy transformControls — replace with runtime.cameraController.gizmo
        if (tc?.setMode) tc.setMode('translate');
    });
    const rotateBtn = _makeActionBtn('Rotate', () => {
        const tc = window.transformControls; // TODO(D.10): legacy transformControls — replace with runtime.cameraController.gizmo
        if (tc?.setMode) tc.setMode('rotate');
    });
    const deleteBtn = _makeActionBtn('Delete', () => host.onDelete(elementData));
    deleteBtn.classList.add('danger');

    footer.appendChild(moveBtn);
    footer.appendChild(rotateBtn);
    footer.appendChild(deleteBtn);

    return footer;
}

export function _makeActionBtn(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'gpp-action-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}
