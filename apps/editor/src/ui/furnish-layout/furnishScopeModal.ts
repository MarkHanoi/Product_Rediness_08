// Furnish-scope chooser — small two-option modal (A.21.D28 #7).
//
// When the user triggers "Furnish all rooms (AI)" we ask WHICH floors to
// furnish: just the ACTIVE floor (the default, unchanged behaviour) or ALL
// floors (mirrors the multi-storey post-gen chain). Pure DOM glue — no engine
// imports, no store reads. Brand rule: white panel + #6600FF accent, NO black
// (the scrim reuses the shared `alm-overlay` token). Mounts a transient overlay
// directly to <body> and dismisses on choose / Cancel / overlay-click / Escape.

export type FurnishScope = 'active' | 'all';

export interface FurnishScopeModalCallbacks {
    /** User picked a scope ("Active floor" or "All floors"). */
    readonly onChoose: (scope: FurnishScope) => void;
    /** User cancelled (Cancel button / overlay click / Escape). */
    readonly onCancel?: () => void;
}

const PURPLE = '#6600FF';

export class FurnishScopeModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scope chooser. `floorCount` (when > 1) is shown on the
     *  "All floors" option so the choice is concrete. Replaces any open instance. */
    show(cb: FurnishScopeModalCallbacks, floorCount?: number): void {
        this.dismiss();

        const overlay = document.createElement('div');
        // Reuse the shared modal scrim (white-friendly backdrop + z-index 4000).
        overlay.className = 'alm-overlay';

        const panel = document.createElement('div');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Furnish scope');
        panel.style.cssText = [
            'background:#ffffff', 'color:#0f172a', 'border-radius:12px',
            'box-shadow:0 20px 60px rgba(102,0,255,0.25)',
            'width:min(420px,94vw)', 'overflow:hidden',
            'font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif',
            'border:1px solid #eadcff',
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = [
            'padding:16px 20px', 'font-size:16px', 'font-weight:650',
            'border-bottom:1px solid #f0e9ff', `color:${PURPLE}`,
        ].join(';');
        header.textContent = 'Furnish rooms';

        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px';

        const blurb = document.createElement('div');
        blurb.style.cssText = 'color:#475569;font-size:12.5px';
        blurb.textContent = 'Choose which floors to auto-furnish.';
        body.appendChild(blurb);

        const optWrap = document.createElement('div');
        optWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';

        const makeOption = (
            title: string, sub: string, scope: FurnishScope, primary: boolean,
        ): HTMLButtonElement => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = [
                'text-align:left', 'padding:12px 14px', 'border-radius:10px', 'cursor:pointer',
                'display:flex', 'flex-direction:column', 'gap:3px',
                primary ? `background:${PURPLE}` : 'background:#f8f5ff',
                primary ? 'color:#ffffff' : 'color:#0f172a',
                primary ? 'border:1px solid ' + PURPLE : 'border:1px solid #e4d8ff',
                'transition:filter .12s,box-shadow .12s,border-color .12s',
            ].join(';');
            const t = document.createElement('span');
            t.style.cssText = 'font-weight:650;font-size:14px';
            t.textContent = title;
            const s = document.createElement('span');
            s.style.cssText = 'font-size:11.5px;opacity:' + (primary ? '0.9' : '0.7');
            s.textContent = sub;
            btn.appendChild(t);
            btn.appendChild(s);
            btn.addEventListener('mouseenter', () => {
                btn.style.filter = 'brightness(0.97)';
                if (!primary) btn.style.borderColor = PURPLE;
                btn.style.boxShadow = '0 4px 16px rgba(102,0,255,0.14)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.filter = '';
                if (!primary) btn.style.borderColor = '#e4d8ff';
                btn.style.boxShadow = '';
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.dismiss();
                try { cb.onChoose(scope); } catch (err) { console.error('[furnish-scope] onChoose threw:', err); }
            });
            return btn;
        };

        const allSub = typeof floorCount === 'number' && floorCount > 1
            ? `Furnish every floor (${floorCount} floors), one at a time`
            : 'Furnish every floor, one at a time';

        optWrap.appendChild(makeOption('Active floor', 'Furnish only the floor you are on', 'active', true));
        optWrap.appendChild(makeOption('All floors', allSub, 'all', false));
        body.appendChild(optWrap);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #f0e9ff;display:flex;justify-content:flex-end;gap:8px';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.style.cssText = [
            'padding:8px 14px', 'border-radius:8px', 'cursor:pointer',
            'background:#ffffff', `color:${PURPLE}`, `border:1px solid #e4d8ff`,
            'font-weight:600',
        ].join(';');
        cancel.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.dismiss(); cb.onCancel?.();
        });
        footer.appendChild(cancel);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        overlay.appendChild(panel);

        overlay.addEventListener('click', (e: MouseEvent) => {
            if (e.target === overlay) { this.dismiss(); cb.onCancel?.(); }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel?.(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
    }

    dismiss(): void {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
            this._escHandler = null;
        }
        if (this._el) { this._el.remove(); this._el = null; }
    }
}
