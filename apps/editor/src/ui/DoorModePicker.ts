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

import {
    OPENING_PROFILE_LABELS,
    openingProfilesFor,
    nextOpeningProfileFor,
    SEGMENTAL_RISE_RATIO,
    type OpeningProfileKind,
} from '@pryzm/geometry-wall';
import { setKeyLabelPills } from './hudPills.js';

/**
 * §OPENING-PROFILE-TOOLTIP (L-1251) — the door half of the shape axis.
 *
 * ⚠ THE SEGMENTAL RISE IS QUOTED, exactly as on the window bar. C86 §10.1 PR-8 forbids a
 * dimension field beside `width`/`height`, so the rise takes a DECLARED default of 1/6 of the
 * span, and whether that matches an architect's expectation of a pill labelled "Segmental" is
 * recorded as NOT MEASURED. Printing the number is what lets the founder correct it in one
 * sentence rather than discover it in a drawing months later.
 *
 * ⛔ THERE IS NO `circular` ENTRY, and its absence is the point: a door is a FLOOR-REACHING
 * opening and a circle has no feet to notch between. `openingProfilesFor('door')` is the one
 * declaration of that, so this bar cannot offer what the pipeline would refuse (C84 EI-3).
 */
const DOOR_PROFILE_TITLES: Readonly<Record<string, string>> = Object.freeze({
    'rectangular':    'Square-headed doorway (A cycles)',
    'round-arch':     'Semicircular arched head, radius = half the width (A cycles)',
    'segmental-arch': `Shallow segmental arch, rise = 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of the width (A cycles)`,
});

export interface DoorModePickerCallbacks {
    onSwitchSingle: () => void;
    onSwitchDouble: () => void;
    /**
     * §OPENING-PROFILE (L-1251) — the SECOND axis. Optional so an un-updated caller keeps the
     * bar it had and the shape row simply does not render.
     */
    onSwitchProfile?: (profile: OpeningProfileKind) => void;
}

export class DoorModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    show(
        initialType: 'single' | 'double',
        callbacks: DoorModePickerCallbacks,
        initialProfile: OpeningProfileKind = 'rectangular',
    ): void {
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
            setKeyLabelPills(btn, mode.key, mode.label);
            btn.addEventListener('click', mode.action);
            bar.appendChild(btn);
        }

        // ── §OPENING-PROFILE (L-1251) — THE SECOND AXIS, MIRRORING THE WINDOW BAR ──────
        //
        // The founder asked for the arched door in the SAME breath as the circular window, and
        // one `openingProfile` on the wall opening is the whole reason both nouns can read ONE
        // axis. Leaf count stays where it is; shape joins it in the same bar.
        //
        // ⛔ THREE VALUES, NOT FOUR. `openingProfilesFor('door')` excludes `circular` because a
        // door is a FLOOR-REACHING opening — `sillHeight` 0, cut as a NOTCH in the wall's outer
        // profile — and a circle has no jamb feet to notch between. Offering it and refusing it
        // later would be C84 EI-3; not offering it is the honest form.
        let profileSetActive: ((p: OpeningProfileKind) => void) | null = null;
        if (callbacks.onSwitchProfile) {
            const sep = document.createElement('span');
            sep.className = 'wdh-mode-lbl';
            sep.textContent = 'Head:';
            bar.appendChild(sep);

            const setActiveProfile = (p: OpeningProfileKind) => {
                bar.querySelectorAll<HTMLButtonElement>('[data-door-profile]').forEach(btn => {
                    btn.classList.toggle('wdh-btn--active', btn.dataset.doorProfile === p);
                });
            };
            profileSetActive = setActiveProfile;

            for (const kind of openingProfilesFor('door')) {
                const btn = document.createElement('button');
                btn.className = 'wdh-btn' + (kind === initialProfile ? ' wdh-btn--active' : '');
                btn.dataset.doorProfile = kind;
                btn.type = 'button';
                btn.title = DOOR_PROFILE_TITLES[kind] ?? OPENING_PROFILE_LABELS[kind];
                // Only the FIRST pill prints the key: `A` CYCLES the axis rather than selecting a
                // member, and stamping A on all three would say otherwise.
                const pillKey = kind === 'rectangular' ? 'A' : null;
                setKeyLabelPills(btn, pillKey, OPENING_PROFILE_LABELS[kind]);
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
                // §OPENING-PROFILE — `A` cycles the head shape. FAMILY-AWARE: the door cycles
                // through three values, the window through four, so a keypress can never land on
                // a value the family cannot hold while the pills refuse it.
                e.stopImmediatePropagation();
                const next = nextOpeningProfileFor('door', currentProfile);
                currentProfile = next;
                profileSetActive(next);
                callbacks.onSwitchProfile(next);
            }
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlighted active HEAD-SHAPE pill without rebuilding the HUD. */
    setProfile(profile: OpeningProfileKind): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('[data-door-profile]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.doorProfile === profile);
        });
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
