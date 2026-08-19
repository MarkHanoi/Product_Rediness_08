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
// §L-1032 — WHICH families may change storey, and the field spelling each verb
// uses, are READ from the one register rather than re-decided here. The line
// this replaced was `if (elType === 'wall' && ...)`: a hard-coded literal that
// left `roof.changeLevel` — live, undoable and correctly cascading since S11 —
// with no control anywhere dispatching it, and gave the founder a slab panel
// whose Level row was a value with no control. C84 EI-3: what the pipeline
// accepts, the UI must offer; C84 EI-9: one authority per question.
import { levelChangeSpecFor, levelChangeRefusalFor, buildLevelChangePayload } from '@pryzm/command-bus';

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

            // §L-1032 — the storey control, for EVERY family that may have one.
            bodyEl.appendChild(_buildLevelChangeRow(elType, elementData));
        }
    );
}

/**
 * §L-1032 — THE STOREY CONTROL. One row, table-driven, for every element family.
 *
 * ─── WHY THIS RETURNS AN ELEMENT EVEN WHEN THERE IS NO CONTROL ──────────────
 * Three outcomes are possible and they must look DIFFERENT to the user:
 *
 *   a. the family may move  → a dropdown that dispatches the family's verb;
 *   b. the family may NOT   → the declared reason, rendered as text;
 *   c. nobody has decided   → nothing, which is the only honest rendering of
 *                             "not measured".
 *
 * Collapsing (b) into (c) is the failure this whole issue is about. An absent
 * control and a deliberately withheld control are indistinguishable to a user —
 * the same shape as §context-data-honesty, where failure and emptiness are the
 * same value. A door SHOULD have no dropdown ([C15 §2] — a hosted element has no
 * independent level, and C86 §12 R-8 records that as CORRECT), but the user is
 * owed the sentence saying so, not silence.
 *
 * The refusal text and the clause that decides it are DATA in the register, not
 * prose here, so the panel cannot drift into offering something the pipeline
 * refuses — or into refusing something the pipeline now accepts, which is the
 * §FEAT-RAKE-LAYERED defect (a hand-copied gate went on greying out a control
 * after the feature behind it shipped).
 */
function _buildLevelChangeRow(
    elType: string,
    elementData: Record<string, any>,
): HTMLElement {
    const wrap = document.createElement('div');

    const spec = levelChangeSpecFor(elType);
    if (spec === null) {
        const refusal = levelChangeRefusalFor(elType);
        if (refusal === null) return wrap; // (c) — undecided; say nothing.
        // (b) — declared refusal. Rendered, with the reason, never omitted.
        const note = document.createElement('div');
        note.style.cssText = 'font-size:11px;color:#777;margin-top:8px;line-height:1.4;';
        note.textContent = refusal.reason;
        note.title = `${refusal.clause}
${refusal.evidence}`;
        wrap.appendChild(note);
        return wrap;
    }

    // (a) — the family may move. The element still needs a CURRENT storey to
    // move from; without one there is nothing to preselect and no previous level
    // for the mirror to dirty, so the control is withheld rather than guessing.
    if (!elementData.levelId) return wrap;

    const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
    const allLevels: any[] = bimManager?.getLevels?.() ?? [];
    if (allLevels.length <= 1) return wrap; // one storey — nowhere to move to.

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
        // The payload is BUILT from the register, never typed out here. Each
        // family spells the same two fields differently (`id`/`newLevelId`,
        // `roofId`/`levelId`, `slabId`/`levelId`), and a key the receiving
        // payload interface does not accept is not "extra" — it is a value
        // silently replaced by a schema default. That is L-978, where four wrong
        // field names minted every copied curtain wall at the origin with no
        // error at all.
        const payload = buildLevelChangePayload(
            spec,
            String(elementData.id),
            sel.value,
            typeof selectedLevel?.elevation === 'number' ? selectedLevel.elevation : undefined,
        );
        window.runtime?.bus?.executeCommand(spec.verb, payload)
            ?.catch((e: Error) => console.warn(`[PropertyPanel] ${spec.verb} failed:`, e));
    });

    row.appendChild(lbl);
    row.appendChild(sel);
    wrap.appendChild(row);
    return wrap;
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
