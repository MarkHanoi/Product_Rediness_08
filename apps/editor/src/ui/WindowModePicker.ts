/**
 * WindowModePicker — Persistent mode bar shown while window tool is active.
 *
 * Mirrors WallDrawingHUD / DoorModePicker exactly: the tool is already active
 * when show() is called.  Clicking S / D or pressing the keyboard shortcuts
 * switches windowTool.windowType on the already-running tool — it does NOT
 * re-activate it.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (wdh- prefix shared with wall HUD).
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to tool property.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   UI_UX_LAYOUT_REFERENCE §6     : Persistent mode bar, not a pre-draw picker.
 */

import {
    OPENING_PROFILE_KINDS,
    OPENING_PROFILE_LABELS,
    nextOpeningProfile,
    SEGMENTAL_RISE_RATIO,
    type OpeningProfileKind,
} from '@pryzm/geometry-wall';

export interface WindowModePickerCallbacks {
    onSwitchSingle: () => void;
    onSwitchDouble: () => void;
    /**
     * §OPENING-PROFILE (L-1250) — the SECOND axis. Optional so a caller that has not been
     * updated keeps the bar it had; the profile row simply does not render.
     */
    onSwitchProfile?: (profile: OpeningProfileKind) => void;
}

/**
 * §OPENING-PROFILE-TOOLTIP — what each pill promises, in the architect's words.
 *
 * ⚠ THE SEGMENTAL RISE IS QUOTED HERE ON PURPOSE. C86 §10.1 PR-8 forbids a dimension field
 * beside `width`/`height`, so a segmental arch's rise has no authored source and takes a DECLARED
 * default of 1/6 of the span. Whether that matches what an architect expects from a pill labelled
 * "Segmental" is recorded as NOT MEASURED — nobody has been asked. Putting the number in the
 * tooltip is what turns that blank into something the founder can correct in one sentence instead
 * of discovering months later in a drawing.
 */
const PROFILE_TITLES: Readonly<Record<OpeningProfileKind, string>> = Object.freeze({
    'rectangular':    'Rectangular opening (A cycles)',
    'round-arch':     'Semicircular arched head, radius = half the width (A cycles)',
    'segmental-arch': `Shallow segmental arch, rise = 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of the width (A cycles)`,
    'circular':       'Circular opening — the width IS the diameter, height follows it (A cycles)',
});

export class WindowModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    show(
        initialType: 'single' | 'double',
        callbacks: WindowModePickerCallbacks,
        initialProfile: OpeningProfileKind = 'rectangular',
    ): void {
        this.dismiss();

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-window-mode-picker', '1');

        const label = document.createElement('span');
        label.className = 'wdh-mode-lbl';
        label.textContent = 'Mode:';
        bar.appendChild(label);

        const setActive = (type: 'single' | 'double') => {
            bar.querySelectorAll<HTMLButtonElement>('[data-window-mode]').forEach(btn => {
                btn.classList.toggle('wdh-btn--active', btn.dataset.windowMode === type);
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
                title: 'Single Window (S)',
                action: () => { setActive('single'); callbacks.onSwitchSingle(); },
            },
            {
                key: 'D',
                type: 'double',
                label: 'Double',
                title: 'Double Window (D)',
                action: () => { setActive('double'); callbacks.onSwitchDouble(); },
            },
        ];

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (mode.type === initialType ? ' wdh-btn--active' : '');
            btn.dataset.windowMode = mode.type;
            btn.type = 'button';
            btn.title = mode.title;
            btn.innerHTML = `<span class="wdh-key">${mode.key}</span><span class="wdh-lbl">${mode.label}</span>`;
            btn.addEventListener('click', mode.action);
            bar.appendChild(btn);
        }

        // ── §OPENING-PROFILE (L-1250) — THE SECOND AXIS, IN THE SAME PLACE ────────────
        //
        // The founder asked to choose *"single / double / circular"* from ONE place. He gets one
        // place — and TWO axes in it, because they are not the same question:
        //   · Single / Double is a LEAF COUNT.
        //   · Rectangular / Arched / Segmental / Circular is a VOID SHAPE.
        // Flattening them into one pill list would make `Double × Arched` — an ordinary window —
        // UNEXPRESSIBLE, which is C82 §7.j and C86 §9 WO-Voc-4. Two rows, one bar, every product
        // of the two reachable.
        //
        // ⛔ AND NOT IN THE "Select Window Type" DROPDOWN EITHER. Those eight entries are frame
        // material and glazing build-up; a profile is geometry. Adding "Circular Timber Casement"
        // would multiply eight types by four profiles and re-spell the vocabulary.
        let profileSetActive: ((p: OpeningProfileKind) => void) | null = null;
        if (callbacks.onSwitchProfile) {
            const sep = document.createElement('span');
            sep.className = 'wdh-mode-lbl';
            sep.textContent = 'Shape:';
            bar.appendChild(sep);

            const setActiveProfile = (p: OpeningProfileKind) => {
                bar.querySelectorAll<HTMLButtonElement>('[data-window-profile]').forEach(btn => {
                    btn.classList.toggle('wdh-btn--active', btn.dataset.windowProfile === p);
                });
            };
            profileSetActive = setActiveProfile;

            for (const kind of OPENING_PROFILE_KINDS) {
                const btn = document.createElement('button');
                btn.className = 'wdh-btn' + (kind === initialProfile ? ' wdh-btn--active' : '');
                btn.dataset.windowProfile = kind;
                btn.type = 'button';
                btn.title = PROFILE_TITLES[kind];
                // Only the FIRST pill carries the key hint: `A` cycles the axis, it does not
                // select a specific member, and printing `A` on all four would say otherwise.
                const keySpan = kind === 'rectangular' ? '<span class="wdh-key">A</span>' : '';
                btn.innerHTML = `${keySpan}<span class="wdh-lbl">${OPENING_PROFILE_LABELS[kind]}</span>`;
                btn.addEventListener('click', () => {
                    setActiveProfile(kind);
                    callbacks.onSwitchProfile!(kind);
                });
                bar.appendChild(btn);
            }
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        let currentProfile: OpeningProfileKind = initialProfile;
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
            } else if (key === 'a' && callbacks.onSwitchProfile && profileSetActive) {
                // §OPENING-PROFILE — `A` CYCLES the shape axis (Rectangular → Arched → Segmental
                // → Circular → …). ONE letter for the whole axis, measured free on 2026-08-19 and
                // re-grepped before binding, because `S` already carries SIX meanings across the
                // shipped mode bars and that collision has bitten the founder once already.
                e.stopImmediatePropagation();
                const next = nextOpeningProfile(currentProfile);
                currentProfile = next;
                profileSetActive(next);
                callbacks.onSwitchProfile(next);
            }
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlighted active PROFILE pill without rebuilding the HUD. */
    setProfile(profile: OpeningProfileKind): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('[data-window-profile]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.windowProfile === profile);
        });
    }

    /** Update the highlighted active mode button without rebuilding the HUD. */
    setMode(type: 'single' | 'double'): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('[data-window-mode]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.windowMode === type);
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
