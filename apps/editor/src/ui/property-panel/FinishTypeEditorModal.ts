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
// §OPENING-FINISH-IS-A-REFERENCE (L-7702) — THE fix for the founder's screenshot.
// The Frame / Sill rows were `<input type="text">` beside a colour chip, so a type
// authored here was born carrying the STRING "Steel Frame" and no material at all.
// The picker is imported from the one place it is defined; this modal mints no
// material vocabulary of its own (C100 SS1.1).
import {
    buildFinishMaterialSelect,
    finishMaterialHex,
    finishMaterialLabel,
} from '@pryzm/geometry-door';
// §OPENING-SHOWROOM-PREVIEW (L-7720) — the founder's second ask: *"a small
// preview — a 3D canvas scene of the window we are creating … like a 3D showroom
// of a library element."* The widget owns no WebGL context and starts no
// animation loop; see `ElementPreviewRenderer.ts` for both decisions.
import { mountElementPreview, type ElementPreviewHandle } from '../element-preview/ElementPreviewCanvas';
import {
    buildOpeningPreviewSubject,
    resolveInheritedOpeningDimensions,
} from '../element-preview/OpeningPreviewSubject';
// §OPENING-PANEL-CHAT (L-9630) — the founder's *"enable AI chat while in this new
// creation panel."* The strip owns no draft of its own; it drives THIS one through
// the port built below, so the chat and the controls cannot disagree about the type.
import { mountFinishTypeChat } from './FinishTypeChatStrip';
import { draftFieldsFor } from './FinishTypeDraftIntent';

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
            // §OPENING-FINISH-IS-A-REFERENCE (L-7702) — was `{ name: slot.label, ... }`,
            // which seeded the literal string "Frame" as if it were a finish NAME. An
            // empty slot must read as empty (C100 SS5): the picker then shows
            // "- select material -" rather than a plausible-looking value nobody chose.
            draft[slot.key] = { name: '', materialColor: '' };
        }
    }

    const overlay = mk('div',
        'position:fixed;inset:0;z-index:10000;background:rgba(16,18,24,0.55);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;');
    overlay.className = 'fte-overlay';

    // §OPENING-PANEL-DISTRIBUTION (L-9620) — the founder's words were *"the
    // distribution of the buttons and space needs to be better distributed … too much
    // space, something empty."* The measured cause: a 560 px column carrying a
    // 516 x 172 preview box, then EIGHTEEN full-width rows stacked one per line, each
    // using ~200 px of a 516 px row for its control and leaving the rest blank. The
    // dialog was tall, narrow and half-empty at the same time.
    //
    // ⭐ The fix is a two-column reading order, not a smaller font: the SHOWROOM (what
    // you are making) on the left, the CONTROLS (how you change it) on the right, and
    // the dimension run laid out as a wrapping grid so eight fields occupy four rows
    // of two rather than eight rows of one.
    const panel = mk('div',
        'background:#ffffff;color:' + INK + ';border-radius:12px;width:min(980px,100%);' +
        'max-height:min(90vh,860px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 24px 64px rgba(0,0,0,0.32);font:13px/1.45 system-ui,-apple-system,sans-serif;');
    panel.className = 'fte-panel';

    // ⚠ ONE stylesheet, for the two things inline styles cannot express: a media query
    // and a pseudo-class. Everything else stays inline, matching this file's stated
    // §05-BIM-UI §2.1 deviation. ⛔ NO BACKTICKS ANYWHERE IN THIS STRING — a backtick
    // inside a CSS comment inside a template literal terminates the literal, and that
    // has cost six lanes this session; the string is therefore plain-quoted.
    const styleEl = document.createElement('style');
    styleEl.textContent = [
        '.fte-layout{display:grid;grid-template-columns:minmax(0,330px) minmax(0,1fr);',
        'gap:24px;align-items:start;}',
        '@media (max-width:860px){.fte-layout{grid-template-columns:minmax(0,1fr);}',
        '.fte-showcase{position:static !important;}}',
        '.fte-dimgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(212px,1fr));',
        'gap:12px 16px;}',
        '.fte-idgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));',
        'gap:0 16px;}',
        '.fte-panel input[type=range]{width:100%;}',
        '.fte-auto-btn:hover{background:#f4efff;}',
    ].join('');
    panel.appendChild(styleEl);
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
    const body = mk('div', 'flex:1;min-height:0;overflow-y:auto;padding:18px 22px 22px;');

    // The two reading columns. `showcase` is what the user is MAKING and stays put
    // while the control column scrolls; `controls` is how they change it.
    const layout = mk('div', '');
    layout.className = 'fte-layout';
    const showcase = mk('div', 'position:sticky;top:0;');
    showcase.className = 'fte-showcase';
    const controls = mk('div', 'min-width:0;');
    controls.className = 'fte-controls';
    layout.append(showcase, controls);
    body.appendChild(layout);

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

    // §OPENING-PANEL-PARITY (L-7742) — the dialog's group rhythm, matching the
    // inspector's `.dw-group`. Once this dialog carries dimensions and subdivision as
    // well as finishes, a flat list of controls stops being readable.
    const groupHeading = (title: string, host: HTMLElement = controls): void => {
        const g = mk('div',
            'display:flex;align-items:center;gap:8px;margin:18px 0 8px;font-size:9.5px;' +
            'font-weight:800;letter-spacing:0.09em;text-transform:uppercase;color:' + PURPLE + ';');
        g.textContent = title;
        const rule = mk('span', 'flex:1 1 auto;height:1px;background:linear-gradient(90deg,rgba(102,0,255,.22),rgba(102,0,255,0));');
        g.appendChild(rule);
        host.appendChild(g);
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

    // §OPENING-PANEL-DISTRIBUTION (L-9620) — Name and Description were two full-width
    // rows on a 516 px column, each using a fraction of it. Side by side they take one
    // row and read as what they are: the type's identity.
    groupHeading('Identity');
    const idGrid = mk('div', '');
    idGrid.className = 'fte-idgrid';
    idGrid.append(field('Name', 'fte-name', nameInput), field('Description', 'fte-desc', descInput));
    controls.appendChild(idGrid);
    controls.appendChild(nameErr);

    // ── Preview strip — one band per finish slot, from the draft's own data ──
    const preview = mk('div',
        'display:flex;height:34px;border:1px solid ' + LINE + ';border-radius:6px;' +
        'overflow:hidden;margin-bottom:16px;');
    preview.setAttribute('role', 'img');

    // ── The showroom ─────────────────────────────────────────────────
    //
    // ⭐ IT SITS ABOVE THE COLOUR STRIP, AND THE STRIP STAYS. They answer different
    // questions: the strip is a swatch legend (which slot is which colour, readable
    // at a glance and by a screen reader); the canvas is the ASSEMBLY. Replacing the
    // strip with the canvas would have lost the legend, and a 3-D view is the worse
    // surface for "what colour is the sill".
    //
    // The subject is rebuilt from the DRAFT on every edit, so the preview is of the
    // thing being authored — not of the type it was duplicated from.
    let showroom: ElementPreviewHandle | null = null;
    const subjectFor = () => buildOpeningPreviewSubject(opts.authoring.family, draft);
    const initialSubject = subjectFor();
    if (initialSubject) {
        // §OPENING-PANEL-DISTRIBUTION (L-9620) — 172 px in a 516 px box letterboxed the
        // subject into a third of its own frame and left the other two thirds blank:
        // literally the "too much space, something empty" the founder pointed at. In a
        // 330 px column at 300 px tall the square blit fills almost the whole frame.
        showroom = mountElementPreview(showcase, { subject: initialSubject, heightPx: 300 });
    } else {
        // C65 §3.4 / §CONTEXT-DATA-HONESTY — a family with no showroom says so. It must
        // not read as a preview that failed.
        const noShow = mk('div',
            'border:1px dashed ' + LINE + ';border-radius:10px;padding:22px 16px;text-align:center;' +
            'font-size:11.5px;line-height:1.45;color:' + MUTED + ';margin-bottom:14px;');
        noShow.textContent =
            'No 3-D showroom for ' + opts.authoring.family + ' types yet. Every control below ' +
            'still authors the type exactly as it will be built.';
        showcase.appendChild(noShow);
    }

    function redraw(): void {
        // The showroom re-reads the draft. `setSubject` is cheap when nothing the
        // IMAGE depends on changed — `PreviewSubject.key` covers exactly those fields —
        // so typing in the Name box does not re-render the scene.
        if (showroom) {
            const next = subjectFor();
            if (next) showroom.setSubject(next);
        }
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

    showcase.appendChild(preview);

    // ── Finish slots ──────────────────────────────────────────────────────
    //
    // ⭐ THIS IS THE FOUNDER'S SCREENSHOT. Each row WAS `[label] [free-text] [colour]`.
    // It is now `[label] [library material] [colour]`, and the two halves have
    // different authority (C100 §2.1):
    //
    //   • the MATERIAL is the identity — `materialId`, resolved against the master;
    //   • the COLOUR is a CACHE of that material, written by the picker, never typed;
    //   • a colour the user changes BY HAND becomes an explicit OVERRIDE, and
    //     C100 §6.1's MUST is that the UI marks it as one. It is marked, and it is
    //     reversible — an invisible override is indistinguishable from a stale copy.
    //
    // No new field encodes "is override": the state IS `materialColor !== the master's
    // hex for materialId`, which is exactly how `doorFinishColour.ts` rung 1 already
    // infers an instance override. One spelling of one rule.
    groupHeading('Finishes');
    /** Per-slot repaint, so a chat-driven material change updates the same controls. */
    const slotRefreshers = new Map<string, () => void>();
    slots.forEach((slot, i) => {
        const row = mk('div', 'display:flex;gap:8px;align-items:center;margin-bottom:6px;');
        const lab = mk('div', 'flex:0 0 64px;font-weight:600;font-size:12px;');
        lab.textContent = slot.label;

        const applyPick = (id: string, color: string, label: string): void => {
            draft[slot.key] = {
                ...draft[slot.key],
                name: label,
                materialId: id || undefined,
                materialColor: color,
            };
            col.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#cccccc';
            refreshOverride();
            redraw();
        };

        // ⚠ `buildFinishMaterialSelect` reads its current value at BUILD time — it is a
        // pure builder, by design (C03/P6). So a change made anywhere other than the
        // select itself is reflected by rebuilding it, never by reaching into its DOM.
        // That keeps the picker the single owner of its own honest four-state head.
        const makePicker = (): HTMLElement => {
            const p = buildFinishMaterialSelect({
                currentId:  draft[slot.key]?.materialId,
                legacyName: draft[slot.key]?.name,
                onChange: applyPick,
            });
            p.style.flex = '1';
            p.style.minWidth = '0';
            return p;
        };
        let picker = makePicker();

        const col = mk('input',
            'width:38px;height:32px;padding:1px;border:1px solid ' + LINE + ';border-radius:5px;flex-shrink:0;');
        col.type = 'color';
        col.value = /^#[0-9a-fA-F]{6}$/.test(draft[slot.key]?.materialColor ?? '')
            ? draft[slot.key].materialColor : '#cccccc';
        col.setAttribute('aria-label', `${slot.label} finish colour — overrides the material's own colour`);
        col.id = `fte-slot-colour-${i}`;

        // The override notice: what it is, and the way back. Rendered under the row so
        // it never reflows the controls.
        const note = mk('div',
            'margin:0 0 12px 72px;font-size:11px;display:none;align-items:center;gap:8px;color:' + MUTED + ';');
        const noteText = mk('span', '');
        const resetBtn = mk('button',
            'font:inherit;font-size:11px;padding:1px 7px;border:1px solid ' + PURPLE + ';border-radius:999px;' +
            'background:#fff;color:' + PURPLE + ';cursor:pointer;font-weight:600;');
        resetBtn.type = 'button';
        resetBtn.textContent = 'Reset to material colour';
        note.append(noteText, resetBtn);

        function refreshOverride(): void {
            const id = draft[slot.key]?.materialId as string | undefined;
            const masterHex = finishMaterialHex(id);
            const current = String(draft[slot.key]?.materialColor ?? '').toLowerCase();
            const overridden = !!masterHex && !!current && current !== masterHex.toLowerCase();
            note.style.display = overridden ? 'flex' : 'none';
            if (overridden) {
                noteText.textContent =
                    `Colour overridden — ${finishMaterialLabel(id) ?? id} is ${masterHex}.`;
            }
        }

        resetBtn.addEventListener('click', () => {
            const masterHex = finishMaterialHex(draft[slot.key]?.materialId as string | undefined);
            if (!masterHex) return;
            draft[slot.key].materialColor = masterHex;
            col.value = masterHex;
            refreshOverride();
            redraw();
        });

        col.addEventListener('input', () => {
            draft[slot.key].materialColor = col.value;
            refreshOverride();
            redraw();
        });

        row.append(lab, picker, col);
        controls.appendChild(row);
        controls.appendChild(note);
        refreshOverride();

        slotRefreshers.set(slot.key, () => {
            const next = makePicker();
            row.replaceChild(next, picker);
            picker = next;
            const hex = draft[slot.key]?.materialColor;
            col.value = /^#[0-9a-fA-F]{6}$/.test(hex ?? '') ? hex : '#cccccc';
            refreshOverride();
        });
    });

    // ── Glazing opacity ──────────────────────────────────────────────────────
    let glazingRefresh: (() => void) | null = null;
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

        glazingRefresh = (): void => {
            const v = typeof draft.glazingOpacity === 'number' ? draft.glazingOpacity : 1;
            slider.value = String(v);
            val.textContent = describe(v);
        };
        slider.addEventListener('input', () => {
            draft.glazingOpacity = parseFloat(slider.value);
            glazingRefresh?.();
            redraw();
        });
        row.append(lab, slider, val);
        controls.appendChild(row);
    }

    // ── The TYPE's own dimensions ─────────────────────────────────────────
    //
    // ⭐⭐ THE ASYMMETRY THIS CLOSES (§OPENING-PANEL-PARITY, L-7746): the window
    // INSPECTOR carried sixteen attributes and this dialog offered FIVE — name,
    // description, two finishes and glazing. A user could interrogate sixteen
    // properties of a placed window and author five of them into a type.
    //
    // ⛔ THIS IS NOT "copy the inspector's fields into the dialog." Each field below
    // was tested against the STORE: it appears here only because
    // `WindowSystemType.dimensions` / `DoorSystemType.dimensions` already carries it,
    // i.e. because the type is genuinely where it lives. The instance-only attributes
    // (splay angles, reveal projection, sill height, per-window colour overrides) are
    // deliberately absent — promoting one of those would make every window on the
    // project move together the next time the type was edited, which is a worse defect
    // than the gap. The reasoning per field is in `ElementTypeNumericField`'s header.
    const dimFields = opts.authoring.finishEditor?.dimensions ?? [];
    /** Per-key repaint of the auto/authored state chip. Filled below; used by the chat too. */
    const dimRefreshers = new Map<string, () => void>();
    if (dimFields.length > 0) {
        groupHeading('Dimensions');
        if (!draft.dimensions || typeof draft.dimensions !== 'object') draft.dimensions = {};
        const dims = draft.dimensions as Record<string, number | undefined>;

        // ⭐ §OPENING-AUTO-IS-A-STATE (L-9610) — what each BLANK field resolves to,
        // from the placement resolvers themselves. Read ONCE per open: these depend on
        // the type id and the catalogue, neither of which changes while the modal is up.
        const inherited = resolveInheritedOpeningDimensions(opts.authoring.family, typeof draft.id === 'string' ? draft.id : undefined);

        const dimGrid = mk('div', '');
        dimGrid.className = 'fte-dimgrid';
        controls.appendChild(dimGrid);

        for (const f of dimFields) {
            // §OPENING-PANEL-DISTRIBUTION (L-9620) — a CARD, not a row. The label and its
            // state sit on one line and the slider spans the card's full width beneath,
            // so two fields fit where one row used to sprawl.
            const cell = mk('div',
                'min-width:0;border:1px solid #edeff3;border-radius:8px;padding:8px 10px 9px;' +
                'background:#fcfcfe;');

            const head = mk('div', 'display:flex;align-items:center;gap:6px;margin-bottom:5px;');
            const lab = mk('label', 'font-weight:600;font-size:11.5px;flex:1 1 auto;min-width:0;');
            lab.textContent = f.label;
            lab.htmlFor = `fte-dim-${f.key}`;

            // ⭐⭐ THE AUTHORED-VERSUS-DERIVED CHIP (E). C100 §2.2 states the rule for a
            // material override and it is the SAME rule here: a value the user did not
            // choose must never be indistinguishable from one they did. An "auto" field
            // that silently becomes a number is a lie about where the value came from.
            //
            // ⛔ SO THE CHIP IS NOT DECORATION. It is the only thing on screen that
            // separates "this type ASSERTS 1.20 m" from "this type INHERITS 1.20 m", and
            // those two types behave differently for every window ever placed from them.
            // It is also the way BACK: authored → click → auto, which the previous
            // dialog offered only by selecting the field and deleting its contents.
            const chip = mk('button',
                'font:inherit;font-size:10px;font-weight:700;letter-spacing:.02em;padding:1px 7px;' +
                'border-radius:999px;cursor:pointer;flex:0 0 auto;white-space:nowrap;');
            chip.type = 'button';
            chip.className = 'fte-auto-btn';

            const range = mk('input', 'width:100%;accent-color:' + PURPLE + ';margin:0;');
            range.type = 'range';
            range.min = String(f.min); range.max = String(f.max); range.step = String(f.step);

            const bottom = mk('div', 'display:flex;gap:8px;align-items:center;');
            const num = mk('input',
                'flex:0 0 74px;padding:4px 6px;border:1px solid ' + LINE + ';border-radius:5px;' +
                'font:inherit;font-size:12px;font-variant-numeric:tabular-nums;text-align:right;' +
                'background:#fff;');
            num.type = 'number';
            num.min = String(f.min); num.max = String(f.max); num.step = String(f.step);
            num.id = `fte-dim-${f.key}`;
            num.title = `${f.label} in metres. Leave blank to inherit the standard value.`;

            const unit = mk('span', 'font-size:11px;color:' + MUTED + ';flex:0 0 auto;');
            unit.textContent = 'm';

            const inh = inherited[f.key];
            const inhText = typeof inh === 'number' && Number.isFinite(inh) ? inh.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : null;

            /**
             * Repaint every part of the cell that depends on WHETHER the field is
             * authored. One function, called from the chip, the slider, the number box
             * and the chat — so the four surfaces cannot drift on the one question that
             * matters here.
             */
            function refresh(): void {
                const v = dims[f.key];
                const authored = typeof v === 'number' && Number.isFinite(v);
                if (authored) {
                    num.value = String(v);
                    range.value = String(v);
                    num.placeholder = '';
                    num.style.color = INK;
                    chip.textContent = 'authored ×';
                    chip.style.border = '1px solid ' + PURPLE;
                    chip.style.background = '#f4efff';
                    chip.style.color = PURPLE;
                    chip.disabled = false;
                    chip.style.cursor = 'pointer';
                    chip.title =
                        `This type SETS ${f.label} to ${v} m. Click to clear it back to auto, ` +
                        'and it will inherit the standard value again.';
                } else {
                    num.value = '';
                    // ⚠ The placeholder NAMES the inherited number rather than saying only
                    // "auto". "auto" alone tells the author the value is derived without
                    // telling them what it derives TO, so they cannot see the window they
                    // are about to make.
                    num.placeholder = inhText ? `auto ${inhText}` : 'auto';
                    num.style.color = MUTED;
                    range.value = inhText ? inhText : String((f.min + f.max) / 2);
                    chip.textContent = inhText ? `auto · ${inhText} m` : 'auto';
                    chip.style.border = '1px solid ' + LINE;
                    chip.style.background = '#fff';
                    chip.style.color = MUTED;
                    chip.disabled = true;
                    chip.style.cursor = 'default';
                    chip.title = inhText
                        ? `Not set on this type. Placed elements inherit ${inhText} m from the ` +
                          'standard value, and will follow it if that standard ever changes.'
                        : 'Not set on this type; the standard value is used.';
                }
            }
            dimRefreshers.set(f.key, refresh);

            const write = (raw: string): void => {
                const v = parseFloat(raw);
                if (!Number.isFinite(v)) { delete dims[f.key]; } else { dims[f.key] = v; }
                refresh();
                redraw();
            };
            // ⚠ Dragging the slider AUTHORS the value — that is the point of touching it —
            // but the chip says so the instant it happens, so the transition from inherited
            // to asserted is never silent.
            range.addEventListener('input', () => write(range.value));
            num.addEventListener('input', () => write(num.value));
            chip.addEventListener('click', () => {
                delete dims[f.key];
                refresh();
                redraw();
            });

            head.append(lab, chip);
            bottom.append(num, unit);
            cell.append(head, range, bottom);
            if (f.hint) {
                const h = mk('div', 'margin-top:5px;color:' + MUTED + ';font-size:10.5px;line-height:1.35;');
                h.textContent = f.hint;
                cell.appendChild(h);
            }
            refresh();
            dimGrid.appendChild(cell);
        }
    }

    // ── Subdivision ──────────────────────────────────────────────────
    //
    // Rendered only for a family that DECLARES a grid. Door declares none, and the
    // registry says why in full: its subdivision is an ordered list of typed bands and
    // two sliders would flatten a half-light door into equal panels.
    const grid = opts.authoring.finishEditor?.grid;
    /** Per-key repaint of a subdivision slider, so the chat can drive it too. */
    const gridRefreshers = new Map<string, () => void>();
    if (grid) {
        groupHeading('Subdivision');
        const gridHost = mk('div', '');
        gridHost.className = 'fte-dimgrid';
        controls.appendChild(gridHost);
        const gridRow = (label: string, key: string, max: number) => {
            const current = Array.isArray(draft[key]) ? (draft[key] as number[]).length : 1;
            const row = mk('div', 'display:flex;gap:8px;align-items:center;margin-bottom:10px;');
            const lab = mk('label', 'flex:0 0 118px;font-weight:600;font-size:12px;');
            lab.textContent = label;
            lab.htmlFor = `fte-grid-${key}`;
            const slider = mk('input', 'flex:1;min-width:0;accent-color:' + PURPLE + ';');
            slider.type = 'range';
            slider.min = '1'; slider.max = String(max); slider.step = '1';
            slider.value = String(Math.min(Math.max(current, 1), max));
            slider.id = `fte-grid-${key}`;
            const val = mk('div', 'flex:0 0 40px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:' + MUTED + ';');
            val.textContent = slider.value;
            // One repaint function, shared by the slider and the chat, so the two
            // authoring surfaces cannot disagree about what the draft says.
            const refresh = (): void => {
                const n = Array.isArray(draft[key]) ? (draft[key] as number[]).length : 1;
                const clamped = Math.min(Math.max(n, 1), max);
                slider.value = String(clamped);
                val.textContent = String(clamped);
            };
            gridRefreshers.set(key, refresh);
            slider.addEventListener('input', () => {
                const n = parseInt(slider.value, 10);
                // Equal shares. The ratios are the type's DEFAULT starting point; an
                // instance may be re-divided unevenly afterwards.
                draft[key] = Array(n).fill(1 / n);
                refresh();
                redraw();
            });
            row.append(lab, slider, val);
            gridHost.appendChild(row);
        };
        gridRow('Columns', grid.columnsKey, grid.maxColumns);
        gridRow('Rows', grid.rowsKey, grid.maxRows);
    }

    // §FEAT-ELEMENT-TYPE-AUTHORING — the instance-linkage decision, stated where the
    // user can act on it (mirrors the wall editor; see the registry's `instanceLinkage`).
    //
    // ⛔ THIS SENTENCE IS LOAD-BEARING AND STAYS VERBATIM. It is the only place the user
    // is told that editing a type later will NOT restyle what is already placed, and a
    // user who assumes the opposite will edit a type expecting a project-wide change.
    // It moves into the showcase column — where the bottom of a 300 px preview left real
    // empty space — and it is not shortened, softened or turned into a tooltip.
    const note = mk('div',
        'margin-top:12px;padding-top:12px;border-top:1px solid ' + LINE + ';' +
        'font-size:11.5px;line-height:1.45;color:' + MUTED + ';');
    note.textContent =
        `Placed ${opts.authoring.family}s keep the finishes they were created with; ` +
        'editing this type later will not restyle them automatically.';
    showcase.appendChild(note);

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

    // ── The chat (§OPENING-PANEL-CHAT, L-9630) ──────────────────────────────
    //
    // ⭐ TWO AUTHORING SURFACES, ONE DRAFT. The chat does not own a model of the
    // type, does not dispatch a command and does not decide whether a save
    // succeeded: it writes the SAME `draft` object the controls write, calls the
    // SAME per-control refreshers, and routes "create it" through the SAME
    // `commit()`. So the founder's *"either via UI or chat"* is one pipeline with
    // two mouths, not two pipelines that must be kept in agreement.
    //
    // It spans both columns because it is about the whole type, not about either
    // half of it — and because it is what fills the space the founder called empty.
    const chatFields = draftFieldsFor(opts.authoring);
    const chat = mountFinishTypeChat(body, {
        fields: chatFields,
        applyEdits(edits) {
            for (const e of edits) {
                const f = e.field;
                if (f.target === 'identity') {
                    if (f.id === '__name__') { nameInput.value = String(e.value ?? ''); nameErr.textContent = ''; }
                    else descInput.value = String(e.value ?? '');
                    continue;
                }
                if (f.target === 'finish') {
                    // C100 §2.1 — the id is the identity and the hex is its CACHE. Written
                    // exactly as the picker writes it, because it is the same shape or it
                    // is a second spelling of one rule.
                    draft[f.id] = {
                        ...draft[f.id],
                        name: e.materialLabel ?? '',
                        materialId: e.materialId,
                        materialColor: e.materialHex ?? '',
                    };
                    slotRefreshers.get(f.id)?.();
                    continue;
                }
                if (f.target === 'glazing') {
                    draft.glazingOpacity = typeof e.value === 'number' ? e.value : draft.glazingOpacity;
                    glazingRefresh?.();
                    continue;
                }
                if (f.target === 'grid') {
                    const n = typeof e.value === 'number' ? Math.max(1, Math.round(e.value)) : 1;
                    draft[f.id] = Array(n).fill(1 / n);
                    gridRefreshers.get(f.id)?.();
                    continue;
                }
                // dimension
                const dims = draft.dimensions as Record<string, number | undefined>;
                // ⛔ `clearsToAuto` is NOT "set it to zero". Deleting the key is what
                // returns the field to INHERITED, and the two are different types.
                if (e.clearsToAuto) delete dims[f.id];
                else if (typeof e.value === 'number') dims[f.id] = e.value;
                dimRefreshers.get(f.id)?.();
            }
            redraw();
        },
        commit(): string | null {
            // ⚠ `commitDraft` is this dialog's own save path, aliased so the call below
            // cannot be misread as this port method calling itself.
            const err = validate();
            nameErr.textContent = err ?? '';
            if (err) { nameInput.focus(); return err; }
            commitDraft();
            return null;
        },
        describe(): string {
            const dims = (draft.dimensions ?? {}) as Record<string, number | undefined>;
            const parts: string[] = [];
            for (const f of chatFields) {
                if (f.target === 'dimension') {
                    const v = dims[f.id];
                    // "authored" and "inherited" stay distinguishable in the chat's own
                    // answer too — the same rule the control chip enforces (§OPENING-AUTO-IS-A-STATE).
                    parts.push(`${f.label} ${typeof v === 'number' ? `${v} m` : 'auto'}`);
                } else if (f.target === 'finish') {
                    parts.push(`${f.label} ${draft[f.id]?.name || 'not set'}`);
                } else if (f.target === 'grid') {
                    parts.push(`${f.label} ${Array.isArray(draft[f.id]) ? (draft[f.id] as number[]).length : 1}`);
                } else if (f.target === 'glazing') {
                    parts.push(`Glazing ${Math.round((draft.glazingOpacity ?? 1) * 100)}% opaque`);
                }
            }
            return parts.join(' · ');
        },
    });

    panel.append(header, body, footer);
    overlay.appendChild(panel);

    // ── Validation + save ────────────────────────────────────────────────────
    function validate(): string | null {
        const name = nameInput.value.trim();
        if (!name) return 'Give the type a name.';
        if (opts.existingNames.includes(name.toLowerCase())) {
            return 'A type with that name already exists in this project.';
        }
        // ⭐ §OPENING-FINISH-IS-A-REFERENCE (L-7702) — REFUSES-WITH-REASON, and it is a
        // CORRECT state, not a defect. A finish with no library material cannot be
        // scheduled, cannot be exported to IFC and cannot carry a carbon factor
        // (C100 §2.1). Refusing here is cheap; discovering it in a take-off six
        // months later is not. The route back is named: pick one, they are listed.
        for (const slot of slots) {
            if (!draft[slot.key]?.materialId) {
                return `Pick a library material for ${slot.label}.`;
            }
        }
        return null;
    }

    function commitDraft(): void {
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
    saveBtn.addEventListener('click', commitDraft);
    cancelBtn.addEventListener('click', () => { onCloseInternal(); opts.onCancel?.(); });
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) { onCloseInternal(); opts.onCancel?.(); }
    });

    function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') { e.preventDefault(); onCloseInternal(); opts.onCancel?.(); return; }
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); commitDraft(); return; }
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
        // ⚠ BEFORE `overlay.remove()`. The handle releases the shared WebGL context
        // when it is the last mounted preview, and a retained context still counts
        // against the browser's live-context cap — whose eviction victim is the
        // OLDEST context, i.e. the main viewport.
        showroom?.dispose();
        showroom = null;
        chat.dispose();
        overlay.remove();
        invoker?.focus?.();
    }

    document.body.appendChild(overlay);
    redraw();
    nameInput.focus();
    nameInput.select();

    return onCloseInternal;
}
