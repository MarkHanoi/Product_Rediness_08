/**
 * WallTypeEditorModal — §FEAT-ELEMENT-TYPE-AUTHORING
 * ===================================================
 *
 * The project-compliant replacement for what wall-type authoring actually was until
 * now: two `window.prompt()` calls and an `alert()`.
 *
 *     _handleNewType()  →  prompt('New wall type name:')
 *                          prompt('Total thickness (mm):')
 *                          typeStore.add({ layers: [ ONE layer, '#d4c5b0' ] })
 *                          alert('Re-select the wall to see it in the list.')
 *
 * That is the founder's complaint #1 — "the modal is not project-compliant, it falls
 * back to default". It was literal: a wall type is a LAYER STACK, and the only thing
 * the prompt flow could express was a single unnamed body layer in the default
 * colour. Every type it produced was a default with a custom name. It also wrote
 * `typeStore.add()` DIRECTLY from the UI (P6 violation — no command, therefore no
 * undo, no sync, no AI reachability) and could not refresh the dropdown it had just
 * added to, hence the alert telling the user to re-select the wall.
 *
 * This modal edits the thing itself: an ordered stack of named layers, each with a
 * thickness, a function and a material colour, drawn to scale in PLAN SECTION as the
 * user edits — which is how an architect reads a wall type.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *
 *  - **C03 / P6 / §01 §7.1** — NO store writes. The modal is a pure editing surface;
 *    it hands a finished draft to `onSave` and the caller dispatches the command.
 *  - **C18** — the section preview is a PREVIEW of committed state, drawn from the
 *    draft's own layer data; it invents no geometry the type does not describe.
 *  - **C43** — keyboard-complete: focus is trapped, Escape cancels, Enter saves from
 *    any field, every control is reachable by Tab and every icon button carries an
 *    `aria-label`. Colours are AA against their backgrounds. `role="dialog"` +
 *    `aria-modal` + `aria-labelledby`, and focus is restored to the invoker on close.
 *  - **§05-BIM-UI §2.1 — DEVIATION, DELIBERATE.** House style is CSS classes defined
 *    in `AppTheme.ts`. Styles here are inline because `AppTheme.ts` is held by a
 *    concurrent agent (`agent/c8-ui-density`) and editing it would collide. The class
 *    names below are already namespaced `wte-`; lifting these rules into AppTheme is
 *    a mechanical follow-up once that branch lands. Flagged rather than done quietly.
 */

import type { ElementTypeAuthoring } from './ElementTypeAuthoringRegistry';

// ── The draft being edited ───────────────────────────────────────────────────

/** One layer in the stack under edit. Mirrors `WallLayer`, kept structural so this
 *  module needs no runtime dependency on geometry-wall (it is a UI-layer file). */
export interface DraftLayer {
    name: string;
    /** METRES, as the store stores it. The UI edits millimetres and converts. */
    thickness: number;
    function: string;
    materialColor: string;
}

/** The finished value handed to `onSave`. Ids are minted by the command, not here. */
export interface WallTypeDraft {
    /** Present when EDITING an existing custom type; absent when creating/duplicating. */
    id?: string;
    name: string;
    description?: string;
    layers: DraftLayer[];
    /** L-285 — `undefined` is a real answer ("this type does not say"), never defaulted. */
    function?: 'interior' | 'exterior';
}

export interface WallTypeEditorOptions {
    /** 'create' | 'duplicate' | 'edit' — drives the title and the save verb only. */
    mode: 'create' | 'duplicate' | 'edit';
    /** The family's authoring declaration, for copy and the instance-linkage notice. */
    authoring: ElementTypeAuthoring;
    /** Starting value. For 'duplicate' the caller pre-names it "X (Copy)". */
    initial: WallTypeDraft;
    /** Names already taken in this project, for the collision check. Lower-cased. */
    existingNames: string[];
    /** How many placed walls currently use the type being edited ('edit' mode only). */
    placedInstanceCount?: number;
    /** Receives the validated draft. The CALLER dispatches the command (P6). */
    onSave: (draft: WallTypeDraft, applyToPlaced: boolean) => void;
    onCancel?: () => void;
}

// ── Layer function vocabulary (matches WallLayer.function) ───────────────────

const LAYER_FUNCTIONS: ReadonlyArray<{ id: string; label: string; colour: string }> = [
    { id: 'finish-exterior', label: 'Finish (Exterior)', colour: '#c0674a' },
    { id: 'air-barrier',     label: 'Air / Cavity',      colour: '#e8e8e8' },
    { id: 'insulation',      label: 'Insulation',        colour: '#f5e07a' },
    { id: 'structure',       label: 'Structure',         colour: '#a0a0a0' },
    { id: 'substrate',       label: 'Substrate',         colour: '#c89d5f' },
    { id: 'finish-interior', label: 'Finish (Interior)', colour: '#f0ece4' },
];

const MM = (metres: number) => Math.round(metres * 1000);
const totalOf = (layers: DraftLayer[]) =>
    parseFloat(layers.reduce((s, l) => s + l.thickness, 0).toFixed(6));

// ── Minimal inline style helpers (see the §05 deviation note in the header) ──

const PURPLE = '#6600FF';          // §41 — the one PRYZM accent.
const INK    = '#1a1a1a';
const MUTED  = '#5b6472';          // AA on #ffffff (contrast 7.0:1)
const LINE   = '#d8dce3';

const css = (el: HTMLElement, text: string) => { el.style.cssText = text; return el; };
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, style = ''): HTMLElementTagNameMap[K] =>
    css(document.createElement(tag), style) as HTMLElementTagNameMap[K];

/**
 * Opens the editor. Returns a disposer so the caller can force-close it (e.g. on
 * project switch — C13: no modal may outlive the project it was opened against).
 */
export function openWallTypeEditor(opts: WallTypeEditorOptions): () => void {
    const invoker = document.activeElement as HTMLElement | null;

    // Deep copy: the modal must never mutate the caller's object, so Cancel is a
    // true cancel rather than "we already changed it and did not save".
    const draft: WallTypeDraft = {
        ...opts.initial,
        layers: opts.initial.layers.map(l => ({ ...l })),
    };

    // ── Shell ────────────────────────────────────────────────────────────────
    const overlay = mk('div',
        'position:fixed;inset:0;z-index:10000;background:rgba(16,18,24,0.55);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;');
    overlay.className = 'wte-overlay';

    const panel = mk('div',
        'background:#ffffff;color:' + INK + ';border-radius:12px;width:min(920px,100%);' +
        'max-height:min(86vh,780px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.32);font:13px/1.45 system-ui,-apple-system,sans-serif;');
    panel.className = 'wte-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'wte-title');

    // ── Header ───────────────────────────────────────────────────────────────
    const header = mk('div', 'padding:18px 22px 14px;border-bottom:1px solid ' + LINE + ';');
    const title = mk('h2',
        'margin:0;font-size:16px;font-weight:650;letter-spacing:-0.01em;');
    title.id = 'wte-title';
    title.textContent =
        opts.mode === 'create'    ? `New ${opts.authoring.noun}` :
        opts.mode === 'duplicate' ? `Duplicate ${opts.authoring.noun}` :
                                    `Edit ${opts.authoring.noun}`;
    const subtitle = mk('p', 'margin:4px 0 0;color:' + MUTED + ';font-size:12px;');
    subtitle.textContent = 'Saved with this project. Available to every wall in it.';
    header.append(title, subtitle);

    // ── Body: two columns — form on the left, section preview on the right ───
    const body = mk('div', 'display:flex;gap:0;flex:1;min-height:0;');
    const left = mk('div', 'flex:1 1 auto;min-width:0;overflow-y:auto;padding:18px 22px;');
    const right = mk('div',
        'flex:0 0 268px;border-left:1px solid ' + LINE + ';padding:18px;background:#fafbfc;' +
        'display:flex;flex-direction:column;gap:12px;overflow-y:auto;');

    // ── Name + description ───────────────────────────────────────────────────
    const nameInput = mk('input',
        'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + LINE + ';' +
        'border-radius:6px;font:inherit;color:' + INK + ';background:#fff;');
    nameInput.type = 'text';
    nameInput.value = draft.name;
    nameInput.id = 'wte-name';

    const nameErr = mk('div', 'color:#b42318;font-size:11.5px;min-height:15px;margin-top:3px;');
    nameErr.setAttribute('role', 'alert');

    const descInput = mk('input',
        'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + LINE + ';' +
        'border-radius:6px;font:inherit;color:' + INK + ';background:#fff;');
    descInput.type = 'text';
    descInput.value = draft.description ?? '';
    descInput.id = 'wte-desc';
    descInput.placeholder = 'Optional — what this assembly is for';

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

    left.append(field('Name', 'wte-name', nameInput));
    left.appendChild(nameErr);
    left.append(field('Description', 'wte-desc', descInput));

    // ── Envelope function (L-285) — "does not say" is a real, selectable answer ──
    const fnSelect = mk('select',
        'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ' + LINE + ';' +
        'border-radius:6px;font:inherit;color:' + INK + ';background:#fff;');
    fnSelect.id = 'wte-fn';
    ([
        ['',         'Not declared — leave the drawing pen unmodulated'],
        ['exterior', 'Exterior — part of the building envelope'],
        ['interior', 'Interior — subdivides the inside'],
    ] as const).forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        if ((draft.function ?? '') === v) o.selected = true;
        fnSelect.appendChild(o);
    });
    left.append(field(
        'Wall function', 'wte-fn', fnSelect,
        'Declared, never guessed from thickness: a 300 mm acoustic partition is interior, ' +
        'a thin infill panel is exterior. Drives plan and elevation pen weight.',
    ));

    // ── Layer table ──────────────────────────────────────────────────────────
    const layersHead = mk('div',
        'display:flex;align-items:baseline;justify-content:space-between;margin:20px 0 8px;');
    const layersLabel = mk('div', 'font-weight:600;font-size:12px;');
    layersLabel.textContent = 'Layers (exterior face first)';
    const totalLabel = mk('div', 'color:' + MUTED + ';font-size:12px;font-variant-numeric:tabular-nums;');
    layersHead.append(layersLabel, totalLabel);
    left.appendChild(layersHead);

    const layerList = mk('div', 'display:flex;flex-direction:column;gap:6px;');
    left.appendChild(layerList);

    const addBtn = mk('button',
        'margin-top:10px;padding:7px 12px;border:1px dashed ' + LINE + ';border-radius:6px;' +
        'background:#fff;color:' + PURPLE + ';font:inherit;font-weight:600;cursor:pointer;');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add layer';
    left.appendChild(addBtn);

    // ── Section preview (right column) ───────────────────────────────────────
    const previewLabel = mk('div', 'font-weight:600;font-size:12px;');
    previewLabel.textContent = 'Plan section';
    const canvas = mk('canvas',
        'width:100%;height:220px;border:1px solid ' + LINE + ';border-radius:8px;background:#fff;');
    canvas.setAttribute('role', 'img');
    const legend = mk('div', 'display:flex;flex-direction:column;gap:5px;font-size:11.5px;');
    right.append(previewLabel, canvas, legend);

    // §FEAT-ELEMENT-TYPE-AUTHORING — the instance-linkage decision, stated where the
    // user can act on it rather than discovered after the fact. See the registry's
    // `instanceLinkage` field for why wall is instance-owned (ADR-0299).
    const applyWrap = mk('div',
        'margin-top:auto;padding-top:12px;border-top:1px solid ' + LINE + ';font-size:11.5px;color:' + MUTED + ';');
    const applyCheck = mk('input', 'margin:0 6px 0 0;vertical-align:-1px;');
    applyCheck.type = 'checkbox';
    applyCheck.id = 'wte-apply';
    if (opts.mode === 'edit' && (opts.placedInstanceCount ?? 0) > 0) {
        const lab = mk('label', 'display:block;cursor:pointer;color:' + INK + ';');
        lab.htmlFor = 'wte-apply';
        lab.append(applyCheck, document.createTextNode(
            `Also re-apply to the ${opts.placedInstanceCount} wall(s) already using this type`));
        const note = mk('div', 'margin-top:5px;');
        note.textContent =
            'Placed walls keep their own layer stack, so editing this type does not change ' +
            'them unless you ask. Re-applying discards per-wall layer edits.';
        applyWrap.append(lab, note);
    } else {
        applyWrap.textContent =
            'Walls placed with this type keep their own copy of the layer stack; editing the ' +
            'type later will not restyle them automatically.';
    }
    right.appendChild(applyWrap);

    body.append(left, right);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = mk('div',
        'padding:14px 22px;border-top:1px solid ' + LINE + ';display:flex;justify-content:flex-end;' +
        'gap:8px;background:#fafbfc;');
    const cancelBtn = mk('button',
        'padding:8px 16px;border:1px solid ' + LINE + ';border-radius:6px;background:#fff;' +
        'color:' + INK + ';font:inherit;font-weight:600;cursor:pointer;');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = mk('button',
        'padding:8px 18px;border:1px solid ' + PURPLE + ';border-radius:6px;background:' + PURPLE + ';' +
        'color:#fff;font:inherit;font-weight:650;cursor:pointer;');
    saveBtn.type = 'button';
    saveBtn.textContent = opts.mode === 'edit' ? 'Save changes' : `Create ${opts.authoring.noun}`;
    footer.append(cancelBtn, saveBtn);

    panel.append(header, body, footer);
    overlay.appendChild(panel);

    // ── Rendering ────────────────────────────────────────────────────────────

    function renderLayers(): void {
        layerList.innerHTML = '';
        draft.layers.forEach((layer, i) => {
            const row = mk('div',
                'display:grid;grid-template-columns:1fr 92px 132px 34px 30px 30px 30px;gap:6px;' +
                'align-items:center;');

            const nm = mk('input',
                'padding:6px 8px;border:1px solid ' + LINE + ';border-radius:5px;font:inherit;min-width:0;');
            nm.type = 'text'; nm.value = layer.name;
            nm.setAttribute('aria-label', `Layer ${i + 1} name`);
            nm.addEventListener('input', () => { layer.name = nm.value; });

            const th = mk('input',
                'padding:6px 8px;border:1px solid ' + LINE + ';border-radius:5px;font:inherit;' +
                'text-align:right;font-variant-numeric:tabular-nums;min-width:0;');
            th.type = 'number'; th.min = '1'; th.step = '1'; th.value = String(MM(layer.thickness));
            th.setAttribute('aria-label', `Layer ${i + 1} thickness in millimetres`);
            th.addEventListener('input', () => {
                const mm = parseFloat(th.value);
                // Invalid input leaves the model UNCHANGED rather than writing NaN or a
                // silent 0 — a zero-thickness layer renders as nothing and reads as a bug.
                if (!isNaN(mm) && mm > 0) { layer.thickness = mm / 1000; redraw(); }
            });

            const fn = mk('select',
                'padding:6px 6px;border:1px solid ' + LINE + ';border-radius:5px;font:inherit;min-width:0;');
            fn.setAttribute('aria-label', `Layer ${i + 1} function`);
            LAYER_FUNCTIONS.forEach(f => {
                const o = document.createElement('option');
                o.value = f.id; o.textContent = f.label;
                if (f.id === layer.function) o.selected = true;
                fn.appendChild(o);
            });
            fn.addEventListener('change', () => { layer.function = fn.value; redraw(); });

            const col = mk('input', 'width:34px;height:30px;padding:1px;border:1px solid ' + LINE + ';border-radius:5px;');
            col.type = 'color'; col.value = layer.materialColor;
            col.setAttribute('aria-label', `Layer ${i + 1} material colour`);
            col.addEventListener('input', () => { layer.materialColor = col.value; redraw(); });

            const iconBtn = (label: string, glyph: string, disabled: boolean, fnc: () => void) => {
                const b = mk('button',
                    'height:30px;border:1px solid ' + LINE + ';border-radius:5px;background:#fff;' +
                    'font:inherit;cursor:' + (disabled ? 'default' : 'pointer') + ';' +
                    'color:' + (disabled ? '#b9c0ca' : MUTED) + ';');
                b.type = 'button'; b.textContent = glyph;
                b.setAttribute('aria-label', label);
                b.disabled = disabled;
                if (!disabled) b.addEventListener('click', fnc);
                return b;
            };

            row.append(
                nm, th, fn, col,
                iconBtn(`Move layer ${i + 1} up`, '↑', i === 0, () => {
                    [draft.layers[i - 1], draft.layers[i]] = [draft.layers[i], draft.layers[i - 1]];
                    renderLayers();
                }),
                iconBtn(`Move layer ${i + 1} down`, '↓', i === draft.layers.length - 1, () => {
                    [draft.layers[i + 1], draft.layers[i]] = [draft.layers[i], draft.layers[i + 1]];
                    renderLayers();
                }),
                // A type with no layers has no thickness and no assembly — it is not a
                // wall type. The last layer is therefore not deletable.
                iconBtn(`Remove layer ${i + 1}`, '×', draft.layers.length === 1, () => {
                    draft.layers.splice(i, 1);
                    renderLayers();
                }),
            );
            layerList.appendChild(row);
        });
        redraw();
    }

    /** Draws the stack to scale in section, plus the legend. */
    function redraw(): void {
        const total = totalOf(draft.layers);
        totalLabel.textContent = `Total ${MM(total)} mm`;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 232, h = canvas.clientHeight || 220;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const padX = 22, padY = 26;
        const bandW = w - padX * 2, bandH = h - padY * 2;
        let y = padY;
        draft.layers.forEach(l => {
            // Height proportional to real thickness — this is a SECTION, so a 12 mm skim
            // must read as a hairline next to a 200 mm structural core, not as an equal band.
            const lh = total > 0 ? (l.thickness / total) * bandH : bandH / draft.layers.length;
            ctx.fillStyle = l.materialColor;
            ctx.fillRect(padX, y, bandW, lh);
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = 1;
            ctx.strokeRect(padX + 0.5, y + 0.5, bandW - 1, Math.max(lh - 1, 0));
            y += lh;
        });

        // Outer face lines heavier than the layer separations — the plan convention.
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.strokeRect(padX, padY, bandW, bandH);

        ctx.fillStyle = MUTED;
        ctx.font = '11px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('exterior face', w / 2, padY - 9);
        ctx.fillText('interior face', w / 2, padY + bandH + 16);

        canvas.setAttribute('aria-label',
            `Section through the wall type: ${draft.layers.length} layer(s), ` +
            draft.layers.map(l => `${l.name || 'unnamed'} ${MM(l.thickness)} millimetres`).join(', ') +
            `. Total ${MM(total)} millimetres.`);

        legend.innerHTML = '';
        draft.layers.forEach(l => {
            const rowEl = mk('div', 'display:flex;align-items:center;gap:7px;');
            const sw = mk('span',
                'width:11px;height:11px;border-radius:2px;flex:0 0 auto;border:1px solid rgba(0,0,0,0.2);' +
                'background:' + l.materialColor + ';');
            const tx = mk('span', 'color:' + INK + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
            tx.textContent = `${l.name || 'Unnamed'} · ${MM(l.thickness)} mm`;
            rowEl.append(sw, tx);
            legend.appendChild(rowEl);
        });
    }

    // ── Validation + save ────────────────────────────────────────────────────

    function validate(): string | null {
        const name = nameInput.value.trim();
        if (!name) return 'Give the type a name.';
        const taken = opts.existingNames.includes(name.toLowerCase());
        if (taken) return 'A type with that name already exists in this project.';
        if (draft.layers.length === 0) return 'A wall type needs at least one layer.';
        if (totalOf(draft.layers) <= 0) return 'The layer stack has no thickness.';
        return null;
    }

    function commit(): void {
        const err = validate();
        nameErr.textContent = err ?? '';
        if (err) { nameInput.focus(); return; }

        const fnValue = fnSelect.value;
        onCloseInternal();
        opts.onSave(
            {
                ...(draft.id ? { id: draft.id } : {}),
                name: nameInput.value.trim(),
                ...(descInput.value.trim() ? { description: descInput.value.trim() } : {}),
                layers: draft.layers.map(l => ({ ...l })),
                // '' means NOT DECLARED, and undefined is how the store spells that.
                // It is never coerced to 'interior' (L-285).
                ...(fnValue ? { function: fnValue as 'interior' | 'exterior' } : {}),
            },
            applyCheck.checked,
        );
    }

    // ── Wiring ───────────────────────────────────────────────────────────────

    addBtn.addEventListener('click', () => {
        draft.layers.push({ name: 'New Layer', thickness: 0.05, function: 'structure', materialColor: '#cfd4da' });
        renderLayers();
        // Focus the new row's name so the keyboard user carries straight on.
        (layerList.lastElementChild?.firstElementChild as HTMLElement | null)?.focus();
    });
    nameInput.addEventListener('input', () => { nameErr.textContent = ''; });
    saveBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', () => { onCloseInternal(); opts.onCancel?.(); });
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) { onCloseInternal(); opts.onCancel?.(); }
    });

    // C43 — Escape cancels, Enter commits, Tab is trapped inside the dialog.
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
        // C43 — return focus where the user left it.
        invoker?.focus?.();
    }

    document.body.appendChild(overlay);
    renderLayers();
    nameInput.focus();
    nameInput.select();

    return onCloseInternal;
}
