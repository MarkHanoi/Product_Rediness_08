/**
 * PropertyPanelAnnotations
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE, Wave 7 cleanup).
 *
 * Contains the annotation-element property panels:
 *   • showLinearDimension — dimension properties + drive-dimension
 *   • showGrid            — grid datum properties
 *
 * Contract compliance:
 *  - §01 CORE: mutations via commands only (UpdateAnnotationCommand,
 *    DeleteAnnotationCommand, UpdateWallBaselineCommand, UpdateGridCommand,
 *    RemoveGridCommand)
 *  - §01-1.1: Tool Layer
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AnnotationElement } from '@pryzm/plugin-annotations';
import { UpdateGridCommand } from '@pryzm/command-registry';
import { RemoveGridCommand } from '@pryzm/command-registry';
// §FIX-DIMENSION-DRIVES-MODEL (L-291b, ADR-122 = OPTION A) — the PURE rule that decides which
// element moves, by how much, and WHY IT CANNOT. Not a branch inside a click handler.
import { resolveDimensionDrive } from '@app/ui/documentation/driveDimension';
// §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — the tag panel renders from the RECORD, and
// its mark edit writes the MODEL (element.mark → the schedule, C28). See tagSelectionPanel.ts.
import { applyTagMarkEdit, type TagRecord } from '@app/ui/property-panel/tagSelectionPanel';

/**
 * Minimal interface that PropertyPanel exposes to the annotation renderers.
 */
export interface AnnotationPanelHost {
    readonly element: HTMLDivElement;
    /** Resets state for an annotation element and clears innerHTML + injects CSS. */
    prepareForAnnotation(opts: { elementId: string | null; elementType: string }): void;
    buildCloseBtn(): HTMLButtonElement;
    hide(): void;
    makeVisible(): void;
}

// ── Grid type helper ──────────────────────────────────────────────────────────

export type GridProperties = {
    id: string;
    name: string;
    axis: 'X' | 'Y';
    position: number;
    isVisible?: boolean;
    isPinned?: boolean;
    extentMin?: number;
    extentMax?: number;
    color?: string;
};

// ── Annotation renderers ──────────────────────────────────────────────────────

export function showLinearDimension(
    host: AnnotationPanelHost,
    cmdMgr: any,
    ann: AnnotationElement,
    selectedWallId?: string
): void {
    host.prepareForAnnotation({ elementId: ann.id, elementType: 'annotation-linear-dim' });

    // ── Header (violet gradient — same as all other panels) ───────────────
    const header = document.createElement('div');
    header.className = 'gpp-header';

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'DIMENSION';
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;';
    titleEl.textContent = 'Linear Dimension';
    header.appendChild(titleEl);

    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);

    // ── Compute measured distance ─────────────────────────────────────────
    const refs = ann.references;
    let measuredDistM = 0;
    let hasDist = false;
    // §FIX-DIMENSION-DRIVES-MODEL (L-291b) — the measurement AXIS is no longer computed here.
    // The drive's axis, its sign and its choice of element all live in the pure, unit-tested
    // `resolveDimensionDrive`; duplicating the axis maths in this click handler is how the two
    // would drift apart.
    if (refs.length >= 2) {
        const pA = refs[0].cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        const pB = refs[1].cachedPosition ?? ann.geometry2D.modelPoints?.[1];
        if (pA && pB) {
            const mn = ann.geometry2D.measurementNormal;
            if (mn && (Math.abs(mn.x) > 0.001 || Math.abs(mn.z) > 0.001)) {
                measuredDistM = Math.abs((pB.x - pA.x) * mn.x + (pB.z - pA.z) * mn.z);
            } else {
                const dx = pB.x - pA.x, dy = pB.y - pA.y, dz = pB.z - pA.z;
                measuredDistM = Math.hypot(dx, dy, dz);
            }
            hasDist = true;
        }
    }

    // ── §FIX-DIMENSION-DRIVES-MODEL (L-291b, ADR-122 = OPTION A) ──────────────
    //
    // AN EDITED DIMENSION MOVES THE BUILDING. The old gate required the user to ALSO have
    // the wall selected in 3D (`selectedWallId`), which is why almost nobody ever saw this
    // button — and which no AUTO-dimension could satisfy at all, because auto-dims carried
    // baked point refs until L-287. Both blockers are gone: the drive is offered whenever the
    // dimension REFERENCES a movable wall, and WHICH wall moves is decided by a stated rule
    // (`resolveDimensionDrive`), not by what happens to be selected.
    //
    // A dimension that cannot drive still says WHY, in the panel — it never falls back to
    // editing the text, because that is the option ADR-122 explicitly rejected.
    const canDriveWall = hasDist && refs.some(r => r.elementType === 'wall');

    // ── Shared helpers ────────────────────────────────────────────────────
    const mkSection = (stepNum: string, title: string): HTMLDivElement => {
        const sec = document.createElement('div');
        sec.className = 'gpp-section';

        const hdr = document.createElement('div');
        hdr.className = 'gpp-section-header open';

        const circle = document.createElement('div');
        circle.className = 'gpp-step-circle';
        circle.textContent = stepNum;
        hdr.appendChild(circle);

        const titleDiv = document.createElement('div');
        titleDiv.className = 'gpp-section-title';
        titleDiv.textContent = title;
        hdr.appendChild(titleDiv);

        sec.appendChild(hdr);
        return sec;
    };

    const mkBody = (sec: HTMLDivElement): HTMLDivElement => {
        const bd = document.createElement('div');
        bd.className = 'gpp-section-body';
        sec.appendChild(bd);
        return bd;
    };

    const mkLabel = (text: string): HTMLDivElement => {
        const el = document.createElement('div');
        el.className = 'gpp-prop-label';
        el.textContent = text;
        return el;
    };

    const mkSelect = (options: { value: string; label: string }[], current: string): HTMLSelectElement => {
        const sel = document.createElement('select');
        sel.className = 'gpp-select';
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === current) opt.selected = true;
            sel.appendChild(opt);
        });
        return sel;
    };

    const mkInput = (type: string, value: string, placeholder?: string): HTMLInputElement => {
        const inp = document.createElement('input');
        inp.type = type;
        inp.value = value;
        if (type !== 'color' && type !== 'checkbox') {
            inp.className = 'gpp-input';
        }
        if (placeholder) inp.placeholder = placeholder;
        return inp;
    };

    const toHex = (color: string): string => {
        if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
        if (/^#[0-9a-fA-F]{3}$/.test(color)) {
            const [, r, g, b] = color.match(/^#(.)(.)(.)$/)!;
            return `#${r}${r}${g}${g}${b}${b}`;
        }
        return '#1a2035';
    };

    const p = ann.parameters;
    const s = ann.style ?? {};

    // ── Body ──────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'gpp-body';

    // ── Section 1: Measurement ────────────────────────────────────────────
    const sec1 = mkSection('1', 'MEASUREMENT');
    const bd1 = mkBody(sec1);

    bd1.appendChild(mkLabel('Unit'));
    const unitSel = mkSelect(
        [{ value: 'mm', label: 'MM' }, { value: 'cm', label: 'CM' }, { value: 'm', label: 'M' }],
        (p.unit ?? 'mm') as string
    );
    bd1.appendChild(unitSel);

    if (hasDist) {
        const unit = (p.unit ?? 'mm') as string;
        const formatted = unit === 'cm' ? `${(measuredDistM * 100).toFixed(1)} cm`
            : unit === 'm' ? `${measuredDistM.toFixed(3)} m`
            : `${Math.round(measuredDistM * 1000)} mm`;

        if (canDriveWall) {
            bd1.appendChild(mkLabel('Move wall to'));
            const driveInp = mkInput('number', unit === 'cm'
                ? (measuredDistM * 100).toFixed(1)
                : unit === 'm'
                    ? measuredDistM.toFixed(3)
                    : String(Math.round(measuredDistM * 1000)));
            driveInp.placeholder = formatted;
            driveInp.title = 'Type a new distance to move the selected wall';
            driveInp.style.fontWeight = '700';
            bd1.appendChild(driveInp);

            const driveHint = document.createElement('div');
            driveHint.className = 'gpp-error-row';
            driveHint.style.cssText = 'grid-column:1/span 2;font-size:9px;color:#8B5CF6;margin-top:-4px;';
            driveHint.textContent = `Current: ${formatted}`;
            bd1.appendChild(driveHint);

            const applyDriveBtn = document.createElement('button');
            applyDriveBtn.className = 'gpp-apply-btn';
            applyDriveBtn.style.cssText += ';margin-top:8px;grid-column:1/span 2;font-size:10px;padding:7px;';
            applyDriveBtn.textContent = 'MOVE WALL';

            /** Surface a failure IN THE PANEL, and leave the model untouched. */
            const fail = (message: string): void => {
                driveHint.textContent = message;
                driveHint.style.color = '#e53935';
                // The panel STAYS OPEN. The old code called host.hide() unconditionally, so a
                // rejected drive looked exactly like a successful one — the L-214/218/220 class
                // (canExecute rejects, console.error eats it, the user believes it worked).
            };

            applyDriveBtn.addEventListener('click', () => {
                const rawVal = parseFloat(driveInp.value);
                const targetM = unit === 'cm' ? rawVal / 100
                    : unit === 'm' ? rawVal
                    : rawVal / 1000;

                // §FIX-DIMENSION-DRIVES-MODEL (L-291b) — the RULE decides which wall moves, and
                // it is a pure, unit-tested function (`resolveDimensionDrive`), not a branch
                // buried in a click handler. It also decides when the answer is "it cannot".
                const wallStore = window.wallStore; // TODO(E.wall.S): legacy wallStore
                const drive = resolveDimensionDrive(ann, targetM, {
                    selectedElementId: selectedWallId ?? null,
                    getWall: (id) => wallStore?.getById?.(id) as never,
                });

                if (!drive.ok) { fail(drive.message); return; }

                const bus = window.runtime?.bus;
                if (!bus) { fail('Command system not ready — try again.'); return; }

                // THE SAME COMMAND THE DRAG DISPATCHES (`wall.updateBaseline`): junction
                // re-solve, hosted-opening re-anchoring and rebuild-with-voids all behave
                // exactly as they do when the user drags this wall. Not a second mutation path.
                // `_recordUndo` + `prevBaseLine` mirror the drag-END, so the whole move is ONE
                // ring-buffer undo entry (C16) and Ctrl-Z puts the wall back.
                Promise.resolve(bus.executeCommand('wall.updateBaseline', {
                    wallId: drive.wallId,
                    newBaseLine: [
                        new THREE.Vector3(drive.newBaseLine[0].x, drive.newBaseLine[0].y, drive.newBaseLine[0].z),
                        new THREE.Vector3(drive.newBaseLine[1].x, drive.newBaseLine[1].y, drive.newBaseLine[1].z),
                    ],
                    prevBaseLine: [
                        new THREE.Vector3(drive.prevBaseLine[0].x, drive.prevBaseLine[0].y, drive.prevBaseLine[0].z),
                        new THREE.Vector3(drive.prevBaseLine[1].x, drive.prevBaseLine[1].y, drive.prevBaseLine[1].z),
                    ],
                    _recordUndo: true,
                }))
                    .then((res: unknown) => {
                        // A REJECTED command must reach the USER. It used to reach the console.
                        const r = res as { success?: boolean; error?: string; reason?: string } | undefined;
                        if (r && r.success === false) {
                            fail(r.error ?? r.reason ?? 'The model rejected this change.');
                            return;
                        }
                        console.log(
                            '[PropertyPanel] §FIX-DIMENSION-DRIVES-MODEL: moved wall', drive.wallId,
                            'by', drive.deltaM.toFixed(4), 'm — the dimension now reads',
                            targetM, 'because the MODEL says so.',
                        );
                        host.hide();
                    })
                    .catch((e: unknown) => {
                        fail(e instanceof Error ? e.message : 'The model rejected this change.');
                    });
            });
            bd1.appendChild(applyDriveBtn);
        } else {
            bd1.appendChild(mkLabel('Measured'));
            const measuredEl = document.createElement('div');
            measuredEl.className = 'gpp-prop-value-ro';
            measuredEl.textContent = formatted;
            bd1.appendChild(measuredEl);
        }
    }

    body.appendChild(sec1);

    // ── Section 2: Appearance ─────────────────────────────────────────────
    const sec2 = mkSection('2', 'APPEARANCE');
    const bd2 = mkBody(sec2);

    bd2.appendChild(mkLabel('Text size (mm)'));
    const textSizeInp = mkInput('number', String(s.textSizeMm ?? 2.5));
    textSizeInp.min = '1';
    textSizeInp.max = '20';
    textSizeInp.step = '0.5';
    bd2.appendChild(textSizeInp);

    bd2.appendChild(mkLabel('Arrow'));
    const arrowSel = mkSelect(
        [{ value: 'filled', label: 'Filled' }, { value: 'open', label: 'Open' }, { value: 'dot', label: 'Dot' }, { value: 'none', label: 'None' }],
        (s.arrowStyle ?? 'filled') as string
    );
    bd2.appendChild(arrowSel);

    bd2.appendChild(mkLabel('Line color'));
    const lineColorRow = document.createElement('div');
    lineColorRow.className = 'gpp-color-row';
    const lineColorInp = document.createElement('input');
    lineColorInp.type = 'color';
    lineColorInp.value = toHex(s.lineColor ?? '#1a2035');
    lineColorInp.className = 'gpp-color-input';
    const lineColorHex = document.createElement('span');
    lineColorHex.className = 'gpp-color-hex';
    lineColorHex.textContent = lineColorInp.value;
    lineColorInp.addEventListener('input', () => { lineColorHex.textContent = lineColorInp.value; });
    lineColorRow.appendChild(lineColorInp);
    lineColorRow.appendChild(lineColorHex);
    bd2.appendChild(lineColorRow);

    bd2.appendChild(mkLabel('Text color'));
    const textColorRow = document.createElement('div');
    textColorRow.className = 'gpp-color-row';
    const textColorInp = document.createElement('input');
    textColorInp.type = 'color';
    textColorInp.value = toHex(s.textColor ?? '#1a2035');
    textColorInp.className = 'gpp-color-input';
    const textColorHex = document.createElement('span');
    textColorHex.className = 'gpp-color-hex';
    textColorHex.textContent = textColorInp.value;
    textColorInp.addEventListener('input', () => { textColorHex.textContent = textColorInp.value; });
    textColorRow.appendChild(textColorInp);
    textColorRow.appendChild(textColorHex);
    bd2.appendChild(textColorRow);

    body.appendChild(sec2);

    // ── Section 3: Label ──────────────────────────────────────────────────
    const sec3 = mkSection('3', 'LABEL');
    const bd3 = mkBody(sec3);

    bd3.appendChild(mkLabel('Prefix'));
    const prefixInp = mkInput('text', (p.prefix ?? '') as string, '—');
    bd3.appendChild(prefixInp);

    bd3.appendChild(mkLabel('Suffix'));
    const suffixInp = mkInput('text', (p.suffix ?? '') as string, '—');
    bd3.appendChild(suffixInp);

    bd3.appendChild(mkLabel('Override'));
    const overrideInp = mkInput('text', (p.override ?? '') as string, 'Blank = measured value');
    bd3.appendChild(overrideInp);

    body.appendChild(sec3);

    // ── Section 4: Constraints ────────────────────────────────────────────
    const sec4 = mkSection('4', 'CONSTRAINTS');
    const bd4 = mkBody(sec4);

    bd4.appendChild(mkLabel('Lock'));
    const lockLabel = document.createElement('label');
    lockLabel.className = 'gpp-checkbox-label';
    const lockChk = document.createElement('input');
    lockChk.type = 'checkbox';
    lockChk.checked = Boolean(p.isLocked);
    const lockText = document.createElement('span');
    lockText.textContent = 'Lock constraint';
    lockLabel.appendChild(lockChk);
    lockLabel.appendChild(lockText);
    bd4.appendChild(lockLabel);

    const constraintLabelEl = mkLabel('Type');
    constraintLabelEl.style.display = lockChk.checked ? '' : 'none';
    bd4.appendChild(constraintLabelEl);

    const constraintSel = mkSelect(
        [{ value: 'soft', label: 'Soft' }, { value: 'hard', label: 'Hard' }],
        (p.constraintType ?? 'soft') as string
    );
    constraintSel.style.display = lockChk.checked ? '' : 'none';
    bd4.appendChild(constraintSel);

    lockChk.addEventListener('change', () => {
        const show = lockChk.checked;
        constraintLabelEl.style.display = show ? '' : 'none';
        constraintSel.style.display = show ? '' : 'none';
    });

    body.appendChild(sec4);

    // ── Apply button ──────────────────────────────────────────────────────
    const applyBtn = document.createElement('button');
    applyBtn.className = 'gpp-apply-btn';
    applyBtn.textContent = 'APPLY CHANGES';
    applyBtn.addEventListener('click', () => {
        if (!cmdMgr) {
            console.warn('[PropertyPanel.showLinearDimension] No commandManager — cannot apply');
            return;
        }
        const patch: Partial<AnnotationElement> = {
            parameters: {
                ...ann.parameters,
                unit:           unitSel.value,
                prefix:         prefixInp.value || undefined,
                suffix:         suffixInp.value || undefined,
                override:       overrideInp.value || undefined,
                isLocked:       lockChk.checked,
                constraintType: constraintSel.value,
            },
            style: {
                ...ann.style,
                textSizeMm: parseFloat(textSizeInp.value) || 2.5,
                arrowStyle: arrowSel.value as 'filled' | 'open' | 'dot' | 'none',
                lineColor:  lineColorInp.value,
                textColor:  textColorInp.value,
            },
        };
        const bus = window.runtime?.bus;
        if (bus) {
            if (patch.style?.textSizeMm !== undefined) {
                bus.executeCommand('annotation.setTextHeight', { annotationId: ann.id, textHeightMm: patch.style.textSizeMm }).catch(() => {});
            }
            if (patch.style && (patch.style.lineColor !== undefined || patch.style.textColor !== undefined)) {
                bus.executeCommand('annotation.setColor', { annotationId: ann.id, lineColor: patch.style.lineColor, textColor: patch.style.textColor }).catch(() => {});
            }
            bus.executeCommand('annotation.update', { annotationId: ann.id, patch })
               .catch((e: unknown) => console.warn('[PropertyPanel] annotation.update failed:', e));
        } else {
            console.warn('[PropertyPanel] No runtime bus — annotation update skipped');
        }
        applyBtn.textContent = '✓ APPLIED';
        applyBtn.disabled = true;
        setTimeout(() => {
            applyBtn.textContent = 'APPLY CHANGES';
            applyBtn.disabled = false;
        }, 1800);
        console.log('[PropertyPanel] Applied changes to dimension:', ann.id);
    });
    body.appendChild(applyBtn);

    // ── Actions row ───────────────────────────────────────────────────────
    const actionsRow = document.createElement('div');
    actionsRow.className = 'gpp-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'gpp-action-btn danger';
    deleteBtn.textContent = 'Delete Dimension';
    deleteBtn.addEventListener('click', () => {
        // Phase B (Task 3.2): annotation.delete routed via runtime.bus.
        // DeleteAnnotationHandler (plugins/annotations/src/handlers/DeleteAnnotation.ts,
        // type='annotation.delete') is a real handler — safe to drop cmdMgr.
        // Falls back to cmdMgr only when bus is not yet initialised (very early boot).
        if (window.runtime?.bus) {
            window.runtime.bus.executeCommand('annotation.delete', { annotationId: ann.id }).catch(console.error);
        } else {
            console.warn('[PropertyPanel.showLinearDimension] No runtime bus — annotation delete skipped');
            return;
        }
        console.log('[PropertyPanel] Deleted dimension:', ann.id);
        host.hide();
    });
    actionsRow.appendChild(deleteBtn);
    body.appendChild(actionsRow);

    host.element.appendChild(body);
    host.makeVisible();
}

/**
 * Populates and shows the property panel for a BimGrid datum.
 * Called when the user clicks a grid line in plan view.
 */
export function showGrid(
    host: AnnotationPanelHost,
    cmdMgr: any,
    grid: GridProperties
): void {
    host.hide();

    const body = document.createElement('div');
    body.className = 'gpp-panel-body';

    // ── Header ───────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'gpp-header';
    header.textContent = 'Grid Properties';
    body.appendChild(header);

    const typeRow = document.createElement('div');
    typeRow.className = 'gpp-type-row';
    typeRow.textContent = `Grid Datum (${grid.axis === 'X' ? 'Vertical' : 'Horizontal'})`;
    body.appendChild(typeRow);

    const buildRow = (label: string, value: string, editable: boolean, onCommit?: (v: string) => void): HTMLElement => {
        const row = document.createElement('div');
        row.className = 'gpp-row';
        const lbl = document.createElement('div');
        lbl.className = 'gpp-label';
        lbl.textContent = label;
        row.appendChild(lbl);
        const val = document.createElement(editable ? 'input' : 'div') as HTMLInputElement | HTMLDivElement;
        val.className = 'gpp-value';
        if (val instanceof HTMLInputElement) {
            val.type = label === 'Position' || label === 'Extent Min' || label === 'Extent Max' ? 'number' : 'text';
            val.value = value;
            val.addEventListener('change', () => onCommit?.(val.value));
        } else {
            val.textContent = value;
        }
        row.appendChild(val);
        return row;
    };

    body.appendChild(buildRow('Name', grid.name, true, (v) => {
        cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { name: v } }));
    }));

    body.appendChild(buildRow('Axis', grid.axis === 'X' ? 'X (Vertical in plan)' : 'Y (Horizontal in plan)', false));

    body.appendChild(buildRow('Position', String(grid.position), true, (v) => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { position: n } }));
    }));

    body.appendChild(buildRow('Extent Min', String(grid.extentMin ?? -100), true, (v) => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { extentMin: n } }));
    }));

    body.appendChild(buildRow('Extent Max', String(grid.extentMax ?? 100), true, (v) => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { extentMax: n } }));
    }));

    // Visibility
    const visRow = document.createElement('div');
    visRow.className = 'gpp-row';
    const visLbl = document.createElement('div');
    visLbl.className = 'gpp-label';
    visLbl.textContent = 'Visible';
    visRow.appendChild(visLbl);
    const visCheck = document.createElement('input');
    visCheck.type = 'checkbox';
    visCheck.checked = grid.isVisible !== false;
    visCheck.style.marginTop = '2px';
    visCheck.addEventListener('change', () => {
        cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { isVisible: visCheck.checked } }));
    });
    visRow.appendChild(visCheck);
    body.appendChild(visRow);

    // Pinned
    const pinRow = document.createElement('div');
    pinRow.className = 'gpp-row';
    const pinLbl = document.createElement('div');
    pinLbl.className = 'gpp-label';
    pinLbl.textContent = 'Pinned';
    pinRow.appendChild(pinLbl);
    const pinCheck = document.createElement('input');
    pinCheck.type = 'checkbox';
    pinCheck.checked = !!grid.isPinned;
    pinCheck.style.marginTop = '2px';
    pinCheck.addEventListener('change', () => {
        cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { isPinned: pinCheck.checked } }));
    });
    pinRow.appendChild(pinCheck);
    body.appendChild(pinRow);

    // ── Actions ───────────────────────────────────────────────────────────
    const actionsRow = document.createElement('div');
    actionsRow.className = 'gpp-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'gpp-action-btn danger';
    deleteBtn.textContent = 'Delete Grid';
    deleteBtn.addEventListener('click', () => {
        if (grid.isPinned) {
            alert('This grid is pinned. Unpin it first before deleting.');
            return;
        }
        cmdMgr?.execute?.(new RemoveGridCommand({ gridId: grid.id }));
        host.hide();
    });
    actionsRow.appendChild(deleteBtn);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'gpp-action-btn';
    pinBtn.textContent = grid.isPinned ? 'Unpin Grid' : 'Pin Grid';
    pinBtn.style.marginLeft = '6px';
    pinBtn.addEventListener('click', () => {
        const newPinned = !grid.isPinned;
        cmdMgr?.execute?.(new UpdateGridCommand({ gridId: grid.id, updates: { isPinned: newPinned } }));
        pinCheck.checked = newPinned;
        pinBtn.textContent = newPinned ? 'Unpin Grid' : 'Pin Grid';
        grid.isPinned = newPinned;
    });
    actionsRow.appendChild(pinBtn);

    body.appendChild(actionsRow);
    host.element.appendChild(body);
    host.makeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — THE TAG PROPERTIES PANEL
//
// RECORD → PICK → PANEL. The record was fixed in L-287, the pick corridor in L-291; this is
// the last leg. Everything below is rendered FROM THE RECORD — the element it names, its
// instance mark, its type mark. Nothing is read back out of the label, because the label is
// a readout, not a source.
//
// THE MARK IS EDITABLE, AND IT WRITES THE MODEL (ADR-0123 + ADR-122 = Option A):
//     AN EDITED ANNOTATION WRITES TO THE MODEL. NEVER TO THE DRAWING.
// Editing it dispatches `element.updateParameters` — the ELEMENT command path — so
// `element.mark` changes, and the door/window SCHEDULE (which joins on exactly that field,
// C28) changes with it. The tag's own label is NOT written: it re-derives on the next
// reconcile (L-265/L-286). If this code ever writes `cachedLabel`, the coherence rule is
// broken and the drawing has become a second source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export function showTag(
    host: AnnotationPanelHost,
    record: TagRecord,
    ann: AnnotationElement,
): void {
    host.prepareForAnnotation({ elementId: ann.id, elementType: `annotation-${ann.type}` });

    const header = document.createElement('div');
    header.className = 'gpp-header';
    const badge = document.createElement('div');
    badge.className = 'gpp-badge';
    badge.textContent = `${record.category.toUpperCase()} TAG`;
    header.appendChild(badge);
    header.appendChild(host.buildCloseBtn());
    host.element.appendChild(header);

    const body = document.createElement('div');
    body.className = 'gpp-body';

    const row = (label: string, node: HTMLElement): void => {
        const l = document.createElement('div');
        l.className = 'gpp-prop-label';
        l.textContent = label;
        body.appendChild(l);
        body.appendChild(node);
    };
    const ro = (text: string): HTMLDivElement => {
        const el = document.createElement('div');
        el.className = 'gpp-prop-value-ro';
        el.textContent = text || '—';
        return el;
    };

    // ── What this tag NAMES (from the record — the join, C28).
    row('Element', ro(record.targetElementId.slice(0, 12)));
    row('Type', ro(record.typeMark ?? '—'));

    // ── The MARK — editable. This writes element.mark, and therefore the schedule.
    const markInp = document.createElement('input');
    markInp.type = 'text';
    markInp.className = 'gpp-input';
    markInp.value = record.mark ?? '';
    markInp.placeholder = 'e.g. D-01';
    markInp.title = 'Editing this changes the ELEMENT\'s mark — and the schedule with it.';
    row('Mark', markInp);

    const hint = document.createElement('div');
    hint.className = 'gpp-error-row';
    hint.style.cssText = 'grid-column:1/span 2;font-size:9px;color:#8B5CF6;margin-top:-4px;';
    hint.textContent = 'The mark is the key the schedule joins on. Editing it updates the model.';
    body.appendChild(hint);

    const fail = (message: string): void => {
        hint.textContent = message;
        hint.style.color = '#e53935';
    };

    const applyBtn = document.createElement('button');
    applyBtn.className = 'gpp-apply-btn';
    applyBtn.style.cssText += ';margin-top:8px;grid-column:1/span 2;font-size:10px;padding:7px;';
    applyBtn.textContent = 'APPLY MARK';
    applyBtn.addEventListener('click', () => {
        void applyTagMarkEdit(record, markInp.value, {
            updateElementMark: (elementId, mark) => {
                const bus = window.runtime?.bus;
                if (!bus) throw new Error('Command system not ready — try again.');
                // A WALL carries its mark under `properties` (Contract §03-1.7); a door/window
                // carries it at the top level (DW-12). Resolved from the RECORD's category, not
                // guessed from the shape of whatever the store happens to return.
                const parameters = record.category === 'wall'
                    ? { properties: { ...(window.wallStore?.getById?.(elementId)?.properties ?? {}), mark } }
                    : { mark };
                return Promise.resolve(bus.executeCommand('element.updateParameters', {
                    elementId,
                    elementType: record.category,
                    parameters,
                }));
            },
        }).then((res) => {
            if (!res.ok) { fail(res.message ?? 'The model rejected this mark.'); return; }
            hint.textContent = 'Mark updated — the schedule now reads it too.';
            hint.style.color = '#8B5CF6';
        });
    });
    body.appendChild(applyBtn);

    host.element.appendChild(body);
    host.makeVisible();
}
