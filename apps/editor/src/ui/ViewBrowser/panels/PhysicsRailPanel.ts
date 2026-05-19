/**
 * PhysicsRailPanel — Physics / simulation mode selector
 *
 * CSS prefix: phys-   (claimed in §05 §3)
 *
 * Opened from the left-rail lightning icon. Lets the user switch between:
 *   - Physics: Off (default)
 *   - Thermal
 *   - Acoustic
 *   - Daylight
 *
 * Selection dispatches a 'pryzm-physics-mode' CustomEvent on window so other
 * subsystems can react without importing this panel directly.
 *
 * Contract compliance:
 *   §01 §2  — zero direct store mutations; fires CustomEvent only
 *   §05 §6  — zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §2  — CSS defined in AppTheme pipeline (projectBrowser.ts PHYS_RAIL_PANEL_STYLES)
 *   §05 §3  — phys- prefix claimed here
 */

export type PhysicsMode = 'off' | 'thermal' | 'acoustic' | 'daylight';

const PHYSICS_MODES: Array<{ id: PhysicsMode; label: string; icon: string }> = [
    {
        id: 'off',
        label: 'Physics: Off',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>`,
    },
    {
        id: 'thermal',
        label: 'Thermal',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
        </svg>`,
    },
    {
        id: 'acoustic',
        label: 'Acoustic',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>
        </svg>`,
    },
    {
        id: 'daylight',
        label: 'Daylight',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>`,
    },
];

export class PhysicsRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // F.12.2 Wave 14 — runtime.physics.metrics wiring (dev-only overlay).
        // Phase F stub returns zeroed PhysicsDevMetrics; Phase D wires real physics-step stats.
        if (runtime?.physics) {
            const _phys = runtime.physics.metrics();
            console.debug('[PhysicsRailPanel] Wave 14 runtime.physics wired —', 'bodies:', _phys.rigidBodies, 'ms:', _phys.ms);
        }
    }

    private _activeMode: PhysicsMode = 'off';

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'phys-root';

        const rows: HTMLElement[] = [];

        for (const mode of PHYSICS_MODES) {
            const row = document.createElement('button');
            row.type      = 'button';
            row.className = 'phys-row' + (this._activeMode === mode.id ? ' phys-row--active' : '');
            row.setAttribute('data-mode', mode.id);
            row.innerHTML = `
                <span class="phys-row-icon">${mode.icon}</span>
                <span class="phys-row-label">${mode.label}</span>
                ${this._activeMode === mode.id ? `<span class="phys-row-check">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </span>` : ''}
            `;

            row.addEventListener('click', () => {
                this._activeMode = mode.id;
                rows.forEach(r => {
                    const rMode = r.getAttribute('data-mode') as PhysicsMode;
                    const isActive = rMode === mode.id;
                    r.classList.toggle('phys-row--active', isActive);
                    const check = r.querySelector('.phys-row-check');
                    if (isActive && !check) {
                        const checkEl = document.createElement('span');
                        checkEl.className   = 'phys-row-check';
                        checkEl.innerHTML   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
                        r.appendChild(checkEl);
                    } else if (!isActive && check) {
                        check.remove();
                    }
                });
                window.runtime?.events?.emit('pryzm-physics-mode-changed', { mode: mode.id }); // F.events.15 — fixes dispatch name to match listeners
                console.log(`[PhysicsRailPanel] Mode → ${mode.id}`);
            });

            rows.push(row);
            root.appendChild(row);
        }

        return root;
    }
}
