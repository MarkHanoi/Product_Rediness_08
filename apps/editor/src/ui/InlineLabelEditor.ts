/**
 * InlineLabelEditor — a small floating, multi-field inline text editor.
 *
 * The reusable primitive behind double-click-to-edit for ROOM LABELS first, and
 * — by design — every TAG and ANNOTATION afterwards (the architect's extension
 * goal). It is deliberately content-agnostic: a caller supplies N fields
 * (`{ key, label, value }`), an anchor position in CSS px, and a commit callback.
 * It owns nothing about rooms / tags / annotations, so each consumer maps the
 * committed `{ key: value }` map onto its own command (room.setName / room.setNumber,
 * annotation.update, tag.update, …) — keeping mutation on the command bus (C03 §P6).
 *
 * Interaction (matches the inline-rename convention of Revit / SketchUp / Figma):
 *   • Opens at the anchor, first field focused + text selected.
 *   • Enter           → commit all fields.
 *   • Tab / Shift+Tab → move between fields (does NOT commit).
 *   • Escape          → cancel.
 *   • Pointer-down outside the editor → commit (blur-to-save).
 *
 * Pure DOM (no THREE, no framework) so it works over any view. Self-contained:
 * only one editor is open at a time (a new open() closes the prior one).
 */

export interface InlineEditField {
    /** Stable key returned in the commit map (e.g. 'name', 'number', 'text'). */
    key: string;
    /** Visible label above the input (e.g. 'Name', 'Number'). */
    label: string;
    /** Initial value. */
    value: string;
    /** Optional placeholder when empty. */
    placeholder?: string;
    /** Optional maxlength. */
    maxLength?: number;
}

export interface InlineLabelEditorOptions {
    /** Anchor X in CSS px (viewport coords). */
    x: number;
    /** Anchor Y in CSS px (viewport coords). */
    y: number;
    /** One or more fields to edit. */
    fields: InlineEditField[];
    /** Called with the trimmed `{ key: value }` map on commit. */
    onCommit: (values: Record<string, string>) => void;
    /** Optional cancel hook. */
    onCancel?: () => void;
    /** Optional heading shown above the fields (e.g. 'Room'). */
    title?: string;
}

export class InlineLabelEditor {
    private _root: HTMLElement | null = null;
    private _inputs: HTMLInputElement[] = [];
    private _opts: InlineLabelEditorOptions | null = null;
    private _committed = false;
    private _onDocPointerDown: ((e: PointerEvent) => void) | null = null;

    /** True while an editor is on screen. */
    get isOpen(): boolean { return this._root !== null; }

    open(opts: InlineLabelEditorOptions): void {
        this.close(true); // silently dismiss any prior editor (no commit/cancel)
        this._opts = opts;
        this._committed = false;

        const root = document.createElement('div');
        root.className = 'pryzm-inline-label-editor';
        root.setAttribute('role', 'dialog');
        Object.assign(root.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            zIndex: '100000',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '10px',
            minWidth: '180px',
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(102,0,255,0.35)',
            borderRadius: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
            backdropFilter: 'blur(8px)',
            font: '12px system-ui, sans-serif',
            color: '#1a2035',
        } as Partial<CSSStyleDeclaration>);

        if (opts.title) {
            const h = document.createElement('div');
            h.textContent = opts.title;
            Object.assign(h.style, { fontSize: '10px', fontWeight: '800', letterSpacing: '.06em', textTransform: 'uppercase', color: '#6600ff' } as Partial<CSSStyleDeclaration>);
            root.appendChild(h);
        }

        this._inputs = [];
        opts.fields.forEach((f, i) => {
            const wrap = document.createElement('label');
            Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '2px' } as Partial<CSSStyleDeclaration>);
            const lab = document.createElement('span');
            lab.textContent = f.label;
            Object.assign(lab.style, { fontSize: '9px', color: '#7a8aaa', fontWeight: '700' } as Partial<CSSStyleDeclaration>);
            const input = document.createElement('input');
            input.type = 'text';
            input.value = f.value ?? '';
            if (f.placeholder) input.placeholder = f.placeholder;
            if (f.maxLength) input.maxLength = f.maxLength;
            input.dataset.fieldKey = f.key;
            Object.assign(input.style, {
                fontSize: '12px', padding: '5px 7px',
                border: '1px solid #e5e7eb', borderRadius: '6px',
                outline: 'none', color: '#1a2035', background: '#fff',
            } as Partial<CSSStyleDeclaration>);
            input.addEventListener('keydown', (e) => this._onKeyDown(e));
            wrap.appendChild(lab);
            wrap.appendChild(input);
            root.appendChild(wrap);
            this._inputs.push(input);
            if (i === 0) {
                // Focus + select the first field on the next tick (after attach).
                setTimeout(() => { input.focus(); input.select(); }, 0);
            }
        });

        document.body.appendChild(root);
        this._root = root;

        // Position after attach so we can measure + clamp to the viewport.
        this._position(opts.x, opts.y);

        // Commit on pointer-down outside the editor (deferred one tick so the
        // opening double-click doesn't immediately dismiss it).
        this._onDocPointerDown = (e: PointerEvent) => {
            if (this._root && !this._root.contains(e.target as Node)) {
                this.commit();
            }
        };
        setTimeout(() => {
            if (this._onDocPointerDown) document.addEventListener('pointerdown', this._onDocPointerDown, true);
        }, 0);
    }

    /** Commit current field values via onCommit, then close. Idempotent. */
    commit(): void {
        if (!this._opts || this._committed) { this.close(true); return; }
        this._committed = true;
        const values: Record<string, string> = {};
        for (const input of this._inputs) {
            const key = input.dataset.fieldKey;
            if (key) values[key] = input.value.trim();
        }
        const cb = this._opts.onCommit;
        this.close(true);
        try { cb(values); } catch (err) { console.warn('[InlineLabelEditor] onCommit threw:', err); }
    }

    /** Cancel without committing, then close. */
    cancel(): void {
        const cb = this._opts?.onCancel;
        this.close(true);
        try { cb?.(); } catch (err) { console.warn('[InlineLabelEditor] onCancel threw:', err); }
    }

    /** Remove the editor from the DOM. `silent` skips commit/cancel callbacks. */
    close(_silent = false): void {
        if (this._onDocPointerDown) {
            document.removeEventListener('pointerdown', this._onDocPointerDown, true);
            this._onDocPointerDown = null;
        }
        if (this._root) { this._root.remove(); this._root = null; }
        this._inputs = [];
        if (_silent) this._opts = null;
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Enter') { e.preventDefault(); this.commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
        // Tab is left to the browser for natural field-to-field movement.
    }

    private _position(x: number, y: number): void {
        if (!this._root) return;
        const r = this._root.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Centre horizontally on the anchor, sit just above it; clamp to viewport.
        let left = x - r.width / 2;
        let top = y - r.height - 12;
        if (top < 8) top = y + 16;            // flip below if no room above
        left = Math.max(8, Math.min(left, vw - r.width - 8));
        top = Math.max(8, Math.min(top, vh - r.height - 8));
        this._root.style.left = `${Math.round(left)}px`;
        this._root.style.top = `${Math.round(top)}px`;
    }
}

/** Process-wide singleton — only one inline editor visible at a time. */
export const inlineLabelEditor = new InlineLabelEditor();
