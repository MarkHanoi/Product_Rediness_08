/**
 * WindowOutlineEditorDialog — §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D7, C86 §10.6).
 *
 * The "Edit outline…" surface for a PLACED window: the SAME `ElevationOutlineSurface` the
 * wall profile modal and the type editor's outline section use (one surface, three callers —
 * C86 §10.6 rule 4), opened on the INSTANCE's own ring at the instance's `width × height`
 * (D2: true proportions). Modes Rectangle / Polyline / Arc / Presets / ⛔ absolute Ortho, all
 * fed from the L2 model.
 *
 * ⛔ NO STORE, NO COMMAND BUS. Apply hands the NORMALISED, predicate-accepted ring to
 * `onCommit`; the caller (`WindowSection`, via `setWindowOutlineEditorOpener`) dispatches the
 * one real command (P6). A ring the predicate refuses NEVER leaves this dialog — the refusal
 * is shown BY NAME (its own `reason`, C16 CA-18) and the dialog stays open.
 */

import type { WindowOutlineEditorRequest } from '@pryzm/geometry-window';
import { wallProfileEditorSnap } from '@pryzm/geometry-wall/profile-editor';
import {
    denormaliseOutline,
    normaliseOutlineToUnit,
    outlineRectangle,
} from '@pryzm/geometry-wall/outline-authoring';
import {
    openingOutlinePreset,
    OPENING_OUTLINE_PRESET_IDS,
    OPENING_OUTLINE_PRESET_LABELS,
    type OpeningOutlinePresetId,
} from '@pryzm/geometry-wall/opening-profile';
import { ElevationOutlineSurface } from './ElevationOutlineSurface';
import { makeDraggable } from './makeDraggable';

const PURPLE = '#6600FF';
const LINE = '#d8dce3';

export function openWindowOutlineEditorDialog(req: WindowOutlineEditorRequest): void {
    const extents = {
        length: req.width > 0 ? req.width : 1.2,
        height: req.height > 0 ? req.height : 1.4,
    };

    const root = document.createElement('div');
    root.className = 'woe-panel';
    root.setAttribute('data-window-outline-editor', req.windowId);
    root.style.cssText =
        'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000001;' +
        'display:flex;flex-direction:column;min-width:380px;' +
        'background:#fff;color:#1a1a1a;border:1px solid #d8d8e0;border-radius:12px;' +
        'box-shadow:0 18px 60px rgba(0,0,0,.28);padding:16px 18px 14px;' +
        'font:13px/1.4 system-ui,sans-serif;';

    const title = document.createElement('div');
    title.className = 'woe-titlebar';
    title.style.cssText = 'font-weight:600;margin-bottom:8px;cursor:move;user-select:none;';
    title.textContent =
        `Edit Window Outline — ${extents.length.toFixed(3)} × ${extents.height.toFixed(3)} m`;
    root.appendChild(title);

    const status = document.createElement('div');
    status.className = 'woe-status';
    status.style.cssText = 'margin:6px 2px;color:#555;min-height:16px;font-size:12px;';
    const setStatus = (msg: string | null, refusal = false): void => {
        status.textContent = msg ?? `${surface.ring.length} vertices. Enter applies, Esc cancels.`;
        status.style.color = refusal ? '#b3261e' : '#555';
    };

    const surface = new ElevationOutlineSurface({
        extents,
        snap: wallProfileEditorSnap,
        minVertices: 3,
        onChanged: () => {
            if (surface.mode !== 'select') {
                const n = surface.draft?.length ?? 0;
                setStatus(`${surface.mode} — ${n} point${n === 1 ? '' : 's'} placed. Enter closes the ring, Esc abandons it.`);
            } else {
                setStatus(null);
            }
        },
        onDeleteRefused: () => setStatus('An outline needs at least 3 vertices.', true),
        attrPrefix: 'woe',
    });

    // Mode bar — identical vocabulary to the type editor's section.
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;';
    const modeBtn = (label: string, onClick: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-woe-mode', label);
        b.style.cssText =
            `padding:5px 10px;border:1px solid ${LINE};border-radius:6px;background:#fff;` +
            'color:#1a1a1a;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;';
        b.textContent = label;
        b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
        return b;
    };
    bar.appendChild(modeBtn('Rectangle', () => {
        surface.setMode('select');
        surface.setRing(outlineRectangle(extents));
    }));
    bar.appendChild(modeBtn('Polyline', () => surface.setMode('polyline')));
    bar.appendChild(modeBtn('Arc', () => surface.setMode('arc')));
    const presetSel = document.createElement('select');
    presetSel.className = 'woe-preset';
    presetSel.style.cssText =
        `padding:5px 8px;border:1px solid ${LINE};border-radius:6px;background:#fff;font:inherit;font-size:11.5px;`;
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Presets…';
    presetSel.appendChild(ph);
    for (const pid of OPENING_OUTLINE_PRESET_IDS) {
        const o = document.createElement('option');
        o.value = pid;
        o.textContent = OPENING_OUTLINE_PRESET_LABELS[pid];
        presetSel.appendChild(o);
    }
    presetSel.addEventListener('change', () => {
        const pid = presetSel.value as OpeningOutlinePresetId | '';
        if (!pid) return;
        surface.setMode('select');
        surface.setRing(denormaliseOutline(openingOutlinePreset(pid), extents));
        presetSel.value = '';
    });
    bar.appendChild(presetSel);
    const orthoWrap = document.createElement('label');
    orthoWrap.style.cssText = 'display:flex;gap:5px;align-items:center;font-size:11.5px;cursor:pointer;';
    const orthoBox = document.createElement('input');
    orthoBox.type = 'checkbox';
    orthoBox.className = 'woe-ortho';
    orthoBox.style.accentColor = PURPLE;
    orthoBox.addEventListener('change', () => {
        // ⛔ ABSOLUTE while on (founder ruling 2026-08-24) — enforced in the L2 helper.
        surface.orthoOn = orthoBox.checked;
    });
    orthoWrap.append(orthoBox, document.createTextNode('Ortho'));
    bar.appendChild(orthoWrap);
    root.appendChild(bar);

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'display:flex;justify-content:center;overflow:hidden;';
    canvasWrap.appendChild(surface.svg);
    root.appendChild(canvasWrap);
    root.appendChild(status);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:8px;';
    const btn = (label: string, bg: string, fg: string, onClick: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-woe-action', label);
        b.style.cssText =
            `background:${bg};color:${fg};border:1px solid rgba(0,0,0,.08);border-radius:7px;` +
            'padding:7px 13px;cursor:pointer;font:inherit;font-weight:600;';
        b.textContent = label;
        b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
        return b;
    };

    let disposeDrag: (() => void) | null = null;
    let onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    const close = (): void => {
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown, true);
        onKeyDown = null;
        try { disposeDrag?.(); } catch { /* chrome teardown must never block close */ }
        root.remove();
    };

    const apply = (): void => {
        if (surface.mode !== 'select') {
            // Enter mid-gesture closes the DRAFT, not the dialog — same rule as the section.
            if (!surface.closeDraft()) {
                setStatus('A ring needs at least 3 placed points before it can close.', true);
            }
            return;
        }
        const res = normaliseOutlineToUnit([...surface.ring]);
        if (!res.ok) { setStatus(res.refusal.reason, true); return; }
        close();
        req.onCommit(res.ring);
    };

    row.appendChild(btn('Cancel', '#f2f2f7', '#1a1a1a', close));
    row.appendChild(btn('Apply', PURPLE, '#fff', apply));
    root.appendChild(row);

    document.body.appendChild(root);
    disposeDrag = makeDraggable(root, '.woe-titlebar');

    surface.refitTo(360, 260);
    surface.setRing(req.ring ? denormaliseOutline(req.ring, extents) : outlineRectangle(extents));

    onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            if (surface.mode !== 'select') { surface.cancelDraft(); surface.setMode('select'); }
            else close();
        } else if (e.key === 'Enter') {
            e.stopPropagation();
            apply();
        }
    };
    window.addEventListener('keydown', onKeyDown, true);
}
