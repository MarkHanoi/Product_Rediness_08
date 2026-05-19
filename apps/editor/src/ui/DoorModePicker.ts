/**
 * DoorModePicker — Persistent mode bar shown while door tool is active.
 *
 * Mirrors WallDrawingHUD exactly: the tool is already active when show() is
 * called.  Clicking S / D or pressing the keyboard shortcuts switches
 * doorTool.doorType on the already-running tool — it does NOT re-activate it.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (wdh- prefix shared with wall HUD).
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to tool property.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   UI_UX_LAYOUT_REFERENCE §6     : Persistent mode bar, not a pre-draw picker.
 */

export interface DoorModePickerCallbacks {
    onSwitchSingle: () => void;
    onSwitchDouble: () => void;
}

export class DoorModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    show(initialType: 'single' | 'double', callbacks: DoorModePickerCallbacks): void {
        this.dismiss();

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-door-mode-picker', '1');

        const label = document.createElement('span');
        label.className = 'wdh-mode-lbl';
        label.textContent = 'Mode:';
        bar.appendChild(label);

        const setActive = (type: 'single' | 'double') => {
            bar.querySelectorAll<HTMLButtonElement>('[data-door-mode]').forEach(btn => {
                btn.classList.toggle('wdh-btn--active', btn.dataset.doorMode === type);
            });
        };

        const modes: Array<{
            key: string;
            type: 'single' | 'double';
            label: string;
            title: string;
            action: () => void;
        }> = [
            {
                key: 'S',
                type: 'single',
                label: 'Single',
                title: 'Single Door (S)',
                action: () => { setActive('single'); callbacks.onSwitchSingle(); },
            },
            {
                key: 'D',
                type: 'double',
                label: 'Double',
                title: 'Double Door (D)',
                action: () => { setActive('double'); callbacks.onSwitchDouble(); },
            },
        ];

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (mode.type === initialType ? ' wdh-btn--active' : '');
            btn.dataset.doorMode = mode.type;
            btn.type = 'button';
            btn.title = mode.title;
            btn.innerHTML = `<span class="wdh-key">${mode.key}</span><span class="wdh-lbl">${mode.label}</span>`;
            btn.addEventListener('click', mode.action);
            bar.appendChild(btn);
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        this.keyHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
            const key = e.key.toLowerCase();
            if (key === 's') {
                e.stopImmediatePropagation();
                setActive('single');
                callbacks.onSwitchSingle();
            } else if (key === 'd') {
                e.stopImmediatePropagation();
                setActive('double');
                callbacks.onSwitchDouble();
            }
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlighted active mode button without rebuilding the HUD. */
    setMode(type: 'single' | 'double'): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('[data-door-mode]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.doorMode === type);
        });
    }

    dismiss(): void {
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }

    isVisible(): boolean {
        return this.el !== null;
    }
}
