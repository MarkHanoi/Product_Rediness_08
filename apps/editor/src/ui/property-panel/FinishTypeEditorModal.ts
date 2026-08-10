/**
 * FinishTypeEditorModal — §FEAT-HOSTED-TYPE-AUTHORING (C65)
 * =========================================================
 *
 * The generic editor for `editorKind: 'finish-set'` families (door, window): a
 * type that is a set of NAMED FINISH SLOTS plus a glazing opacity, not a layer
 * stack. ONE modal serves every finish-set family — the slots it renders come
 * from the family's `ElementTypeAuthoring.finishEditor` declaration, so adding a
 * family is a declaration, never a branch here (C65 §3.5).
 *
 * The draft is the WHOLE record minus identity (id / isBuiltIn / metadata). The
 * modal edits only what it shows — name, description, per-slot finish name +
 * colour, glazing opacity — and every other field (dimensions, defaultSegments,
 * sidelight, tags…) rides along untouched, which is what makes Duplicate a true
 * deep copy (C65 §3.7) rather than a lossy re-entry form.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *  - **C03 / P6** — NO store writes. Pure editing surface; hands the finished
 *    draft to `onSave`, the CALLER dispatches `elementType.create|duplicate`.
 *  - **C18** — the preview strip is drawn from the draft's own finish data.
 *  - **C43** — keyboard-complete: focus trapped, Escape cancels, Enter saves,
 *    every control labelled, focus restored to the invoker on close.
 *  - **§05-BIM-UI §2.1 — DEVIATION, DELIBERATE.** Inline styles, same reason as
 *    `WallTypeEditorModal` (AppTheme.ts held by a concurrent agent); class names
 *    are namespaced `fte-` for the same mechanical lift later.
 */

import type { ElementTypeAuthoring } from './ElementTypeAuthoringRegistry';

/** The draft under edit — a family type record minus identity fields. */
export type FinishTypeDraft = Record<string, any> & {
    name: string;
    description?: string;
    glazingOpacity?: number;
};

export interface FinishTypeEditorOptions {
    mode: 'create' | 'duplicate';
    /** The family's declaration — MUST carry `finishEditor` (finish-set family). */
    authoring: ElementTypeAuthoring;
    initial: FinishTypeDraft;
    /** Names already taken in this project, lower-cased. */
    existingNames: string[];
    /** Receives the validated draft. The CALLER dispatches the command (P6). */
    onSave: (draft: FinishTypeDraft) => void;
    onCancel?: () => void;
}

const PURPLE = '#6600FF';          // §41 — the one PRYZM accent.
const INK    = '#1a1a1a';
const MUTED  = '#5b6472';          // AA on #ffffff
const LINE   = '#d8dce3';

const css = (el: HTMLElement, text: string) => { el.style.cssText = text; return el; };
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, style = ''): HTMLElementTagNameMap[K] =>
    css(document.createElement(tag), style) as HTMLElementTagNameMap[K];

/**
 * Opens the editor. Returns a disposer so the caller can force-close it
 * (C13: no modal may outlive the project it was opened against).
 */
export function openFinishTypeEditor(opts: FinishTypeEditorOptions): () => void {
    const invoker = document.activeElement as HTMLElement | null;
    const slots = opts.authoring.finishEditor?.slots ?? [];
    const hasOpacity = opts.authoring.finishEditor?.glazingOpacity === true;

    // Deep copy — Cancel must be a true cancel.
    const draft: FinishTypeDraft = structuredClone(opts.initial);
    for (const slot of slots) {
        // A draft missing a slot gets an editable empty finish rather than a crash;
        // the adapter's validateDraft still refuses a save without a colour.
        if (!draft[slot.key] || typeof draft[slot.key] !== 'object') {
            draft[slot.key] = { name: slot.label, materialColor: '#cccccc' };
        }
    }

    const overlay = mk('div',
        'position:fixed;inset:0;z-index:10000;background:rgba(16,18,24,0.55);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;');
    overlay.className = 'fte-overlay';

    const panel = mk('div',
        'background:#ffffff;color:' + INK + ';border-radius:12px;width:min(560px,100%);' +
        'max-height:min(86vh,720px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.32);font:13px/1.45 system-ui,-apple-system,sans-serif;');
    panel.className = 'fte-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'fte-title');

    // ── Header ───────────────────────────────────────────────────────────────
    const header = mk('div', 'padding:18px 22px 14px;border-bottom:1px solid ' + LINE + ';');
    const title = mk('h2', 'margin:0;font-size:16px;font-weight:650;letter-spacing:-0.01em;');
    title.id = 'fte-title';
    title.textContent = opts.mode === 'create'
        ? `New ${opts.authoring.noun}`
        : `Duplicate ${opts.authoring.noun}`;
    const subtitle = mk('p', 'margin:4px 0 0;color:' + MUTED + ';font-size:12px;');
    subtitle.textContent = 'Saved with this project. Available to every ' +
        opts.authoring.family + ' in it.';
    header.append(title, subtitle);

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = mk('div', 'flex:1;min-height:0;overflow-y:auto;padding:18px 22px;');

    const field = (labelText: string, forId: string, control: HTMLElement, hint?: string) => {
        const wrap = mk('div', 'margin-bottom:14px;');
        const lab = mk('label', 'display:block;font-weight:600;font-size:12px;margin-bottom:5px;');
        lab.htmlFor = forId;
        lab.textContent = labelText;
        wrap.append(lab, control);
        if (hint) {
            const h = mk('div', 'color:' + MUTED + ';font-size:11.5px;margin-top:4px;');
            h.textContent = hint;
            wrap.appendChild(h);
        }
        return wrap;
    };

    const nameInput = mk('input',
        'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + LINE + ';' +
        'border-radius:6px;font:inherit;color:' + INK + ';background:#fff;');
    nameInput.type = 'text';
    nameInput.value = draft.name;
    nameInput.id = 'fte-name';

    const nameErr = mk('div', 'color:#b42318;font-size:11.5px;min-height:15px;margin-top:3px;');
    nameErr.setAttribute('role', 'alert');

    const descInput = mk('input',
        'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + LINE + ';' +
        'border-radius:6px;font:inherit;color:' + INK + ';background:#fff;');
    descInput.type = 'text';
    descInput.value = draft.description ?? '';
    descInput.id = 'fte-desc';
    descInput.placeholder = 'Optional — what this type is for';

    body.append(field('Name', 'fte-name', nameInput));
    body.appendChild(nameErr);
    body.append(field('Description', 'fte-desc', descInput));

    // ── Preview strip — one band per finish slot, from the draft's own data ──
    const preview = mk('div',
        'display:flex;height:34px;border:1px solid ' + LINE + ';border-radius:6px;' +
        'overflow:hidden;margin-bottom:16px;');
    preview.setAttribute('role', 'img');

    function redraw(): void {
        preview.innerHTML = '';
        for (const slot of slots) {
            const band = mk('div', 'flex:1;');
            band.style.background = draft[slot.key]?.materialColor ?? '#cccccc';
            band.title = `${slot.label}: ${draft[slot.key]?.name ?? ''}`;
            preview.appendChild(band);
        }
        if (hasOpacity) {
            const glass = mk('div', 'flex:1;background:#bcd9ea;');
            const op = typeof draft.glazingOpacity === 'number' ? draft.glazingOpacity : 1;
            glass.style.opacity = String(Math.max(0.15, op));
            glass.title = `Glazing opacity ${Math.round(op * 100)}%`;
            preview.appendChild(glass);
        }
        preview.setAttribute('aria-label',
            'Finish preview: ' +
            slots.map(s => `${s.label} ${draft[s.key]?.materialColor ?? ''}`).join(', ') +
            (hasOpacity ? `, glazing opacity ${Math.round((draft.glazingOpacity ?? 1) * 100)} percent` : ''));
    }

    body.appendChild(preview);

    // ── Finish slots ─────────────────────────────────────────────────────────
    slots.forEach((slot, i) => {
        const row = mk('div', 'display:flex;gap:8px;align-items:center;margin-bottom:12px;');
        const lab = mk('div', 'flex:0 0 64px;font-weight:600;font-size:12px;');
        lab.textContent = slot.label;

        const nm = mk('input',
            'flex:1;min-width:0;padding:7px 9px;border:1px solid ' + LINE + ';border-radius:5px;font:inherit;');
        nm.type = 'text';
        nm.value = draft[slot.key]?.name ?? '';
        nm.setAttribute('aria-label', `${slot.label} finish name`);
        nm.id = `fte-slot-name-${i}`;
        nm.addEventListener('input', () => { draft[slot.key].name = nm.value; });

        const col = mk('input',
            'width:38px;height:32px;padding:1px;border:1px solid ' + LINE + ';border-radius:5px;');
        col.type = 'color';
        col.value = /^#[0-9a-fA-F]{6}$/.test(draft[slot.key]?.materialColor ?? '')
            ? draft[slot.key].materialColor : '#cccccc';
        col.setAttribute('aria-label', `${slot.label} finish colour`);
        col.addEventListener('input', () => { draft[slot.key].materialColor = col.value; redraw(); });

        row.append(lab, nm, col);
        body.appendChild(row);
    });

    // ── Glazing opacity ──────────────────────────────────────────────────────
    if (hasOpacity) {
        const op = typeof draft.glazingOpacity === 'number' ? draft.glazingOpacity : 1;
        const row = mk('div', 'display:flex;gap:8px;align-items:center;margin-bottom:12px;');
        const lab = mk('label', 'flex:0 0 64px;font-weight:600;font-size:12px;');
        lab.textContent = 'Glazing';
        lab.htmlFor = 'fte-opacity';

        const slider = mk('input', 'flex:1;');
        slider.type = 'range';
        slider.min = '0'; slider.max = '1'; slider.step = '0.05';
        slider.value = String(op);
        slider.id = 'fte-opacity';
        slider.setAttribute('aria-label', 'Glazing opacity — 0 is clear glass, 100 is opaque');

        const val = mk('div',
            'flex:0 0 92px;color:' + MUTED + ';font-size:11.5px;font-variant-numeric:tabular-nums;');
        const describe = (v: number) =>
            v <= 0.05 ? 'clear glass' : v >= 0.95 ? 'opaque' : `${Math.round(v * 100)}% opaque`;
        val.textContent = describe(op);

        slider.addEventListener('input', () => {
            draft.glazingOpacity = parseFloat(slider.value);
            val.textContent = describe(draft.glazingOpacity);
            redraw();
        });
        row.append(lab, slider, val);
        body.appendChild(row);
    }

    // §FEAT-ELEMENT-TYPE-AUTHORING — the instance-linkage decision, stated where the
    // user can act on it (mirrors the wall editor; see the registry's `instanceLinkage`).
    const note = mk('div',
        'margin-top:6px;padding-top:12px;border-top:1px solid ' + LINE + ';' +
        'font-size:11.5px;color:' + MUTED + ';');
    note.textContent =
        `Placed ${opts.authoring.family}s keep the finishes they were created with; ` +
        'editing this type later will not restyle them automatically.';
    body.appendChild(note);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = mk('div',
        'padding:14px 22px;border-top:1px solid ' + LINE + ';display:flex;' +
        'justify-content:flex-end;gap:8px;background:#fafbfc;');
    const cancelBtn = mk('button',
        'padding:8px 16px;border:1px solid ' + LINE + ';border-radius:6px;background:#fff;' +
        'color:' + INK + ';font:inherit;font-weight:600;cursor:pointer;');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = mk('button',
        'padding:8px 18px;border:1px solid ' + PURPLE + ';border-radius:6px;background:' + PURPLE + ';' +
        'color:#fff;font:inherit;font-weight:650;cursor:pointer;');
    saveBtn.type = 'button';
    saveBtn.textContent = `Create ${opts.authoring.noun}`;
    footer.append(cancelBtn, saveBtn);

    panel.append(header, body, footer);
    overlay.appendChild(panel);

    // ── Validation + save ────────────────────────────────────────────────────
    function validate(): string | null {
        const name = nameInput.value.trim();
        if (!name) return 'Give the type a name.';
        if (opts.existingNames.includes(name.toLowerCase())) {
            return 'A type with that name already exists in this project.';
        }
        return null;
    }

    function commit(): void {
        const err = validate();
        nameErr.textContent = err ?? '';
        if (err) { nameInput.focus(); return; }
        onCloseInternal();
        const out: FinishTypeDraft = structuredClone(draft);
        out.name = nameInput.value.trim();
        const desc = descInput.value.trim();
        if (desc) out.description = desc; else delete out.description;
        opts.onSave(out);
    }

    // ── Wiring (C43) ─────────────────────────────────────────────────────────
    nameInput.addEventListener('input', () => { nameErr.textContent = ''; });
    saveBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', () => { onCloseInternal(); opts.onCancel?.(); });
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) { onCloseInternal(); opts.onCancel?.(); }
    });

    function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') { e.preventDefault(); onCloseInternal(); opts.onCancel?.(); return; }
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); commit(); return; }
        if (e.key !== 'Tab') return;
        const focusable = panel.querySelectorAll<HTMLElement>(
            'input:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    panel.addEventListener('keydown', onKey);

    let closed = false;
    function onCloseInternal(): void {
        if (closed) return;
        closed = true;
        panel.removeEventListener('keydown', onKey);
        overlay.remove();
        invoker?.focus?.();
    }

    document.body.appendChild(overlay);
    redraw();
    nameInput.focus();
    nameInput.select();

    return onCloseInternal;
}
