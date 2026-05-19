/**
 * @file RadialMenu.ts
 *
 * Contextual radial (wheel) menu — shown on right-click inside the 3D scene.
 *
 * Items are arranged in a circle (radius 88px, 6 items at 60° spacing).
 * The menu slides-in with a scale + fade animation and closes on:
 *  - Click outside
 *  - Item selection
 *  - Escape key
 *
 * Architecture rules:
 *  - Pure UI layer — no store writes, no command dispatch (01-BIM §1.1).
 *    Actions are delegated via window.* references (same pattern as Layout.ts).
 *  - No @thatopen/ui (bim-*) elements (05-BIM-UI §7.8).
 *  - No new server endpoints (07-BIM-SECURITY §7.2).
 *  - CSS class prefix: rm-
 *
 * Public API:
 *   mount(canvasEl)   — attach contextmenu listener to the canvas (call once)
 *   unmount()         — remove listeners and DOM
 */


// ─── Item definitions ─────────────────────────────────────────────────────────

interface RadialItem {
    id:     string;
    icon:   string;
    label:  string;
    action: () => void;
}

function buildItems(): RadialItem[] {
    return [
        {
            id:     'furniture',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 11V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6H1v6h1l1 2h18l1-2h1v-6h-2zm-6 0H9V5h6v6zm-8 0H5V5h2v6zm10 0V5h2v6h-2z"/></svg>`,
            label:  'Furniture',
            action: () => {
                const carousel = window.furnitureCarousel; // TODO(D.4): replace with runtime.scene.furnitureCarousel — Phase D.4
                if (carousel) carousel.setVisible(true);
            },
        },
        {
            id:     'wall',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v4H3V3zm0 6h18v4H3V9zm0 6h18v6H3v-6z"/></svg>`,
            label:  'Wall',
            action: () => {
                const svc = window.bimService; // TODO(D.4): replace via EngineBootstrap split — bimService destroyed in D.4 — Phase D.4
                svc?.activateWallTool?.('single');
            },
        },
        {
            id:     'door',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 3C6.9 3 6 3.9 6 5v16h12V5c0-1.1-.9-2-2-2H8zm4 11a1 1 0 110-2 1 1 0 010 2z"/></svg>`,
            label:  'Door',
            action: () => {
                const tm = window.toolManager; // TODO(D.4): replace with runtime.tools.manager — Phase D.4
                tm?.activateDoor?.('single');
            },
        },
        {
            id:     'window',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v18h18V3H3zm8 16H5v-6h6v6zm0-8H5V5h6v6zm8 8h-6v-6h6v6zm0-8h-6V5h6v6z"/></svg>`,
            label:  'Window',
            action: () => {
                const tm = window.toolManager; // TODO(D.4): replace with runtime.tools.manager — Phase D.4
                tm?.activateWindow?.('single');
            },
        },
        {
            id:     'stair',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h4v-4h4v-4h4V6h6v-2H14v4h-4v4H6v4H3v2z"/></svg>`,
            label:  'Stair',
            action: () => {
                const svc = window.bimService; // TODO(D.4): replace via EngineBootstrap split — bimService destroyed in D.4 — Phase D.4
                svc?.createStair?.('I');
            },
        },
        {
            id:     'select',
            icon:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 0L0 14l4-2 2 6 3-1-2-6 4-1L4 0z"/></svg>`,
            label:  'Select',
            action: () => {
                const tm = window.toolManager; // TODO(D.4): replace with runtime.tools.manager — Phase D.4
                tm?.deactivateAll?.();
            },
        },
    ];
}

// ─── RadialMenu ───────────────────────────────────────────────────────────────

// Phase B.13 (S73-WIRE) — runtime threading per S72 §16.2 row B.13.
export class RadialMenu {

    private overlay:   HTMLElement | null = null;
    private menu:      HTMLElement | null = null;
    private elementMenu: HTMLElement | null = null;
    private canvasEl:  HTMLElement | null = null;
    private items:     RadialItem[]       = [];
    private isVisible: boolean            = false;

    private _onContextMenu: (e: MouseEvent) => void;
    private _onKeyDown:     (e: KeyboardEvent) => void;

    /** Phase B.13 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.items          = buildItems();
        this._onContextMenu = this._handleContextMenu.bind(this);
        this._onKeyDown     = this._handleKeyDown.bind(this);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    mount(canvasEl: HTMLElement): void {
        if (this.overlay) return;
        this.canvasEl = canvasEl;
        this._buildDOM();
        canvasEl.addEventListener('contextmenu', this._onContextMenu);
        window.addEventListener('keydown', this._onKeyDown);
    }

    unmount(): void {
        this.canvasEl?.removeEventListener('contextmenu', this._onContextMenu);
        window.removeEventListener('keydown', this._onKeyDown);
        this.overlay?.remove();
        this.elementMenu?.remove();
        this.overlay  = null;
        this.menu     = null;
        this.elementMenu = null;
        this.canvasEl = null;
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _buildDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'rm-overlay';
        overlay.addEventListener('pointerdown', (e) => {
            if (e.target === overlay) this._hide();
        });

        const menu = document.createElement('div');
        menu.className = 'rm-container';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Contextual actions');

        // Centre pulse dot
        const dot = document.createElement('div');
        dot.className = 'rm-dot';
        menu.appendChild(dot);

        // Items arranged radially
        const N      = this.items.length;
        const RADIUS = 88; // px

        this.items.forEach((item, i) => {
            // Start at top (-90°), go clockwise
            const angleDeg = (i / N) * 360 - 90;
            const angleRad = angleDeg * Math.PI / 180;
            const x = Math.round(RADIUS * Math.cos(angleRad));
            const y = Math.round(RADIUS * Math.sin(angleRad));

            const el = document.createElement('button');
            el.className = 'rm-item';
            el.setAttribute('role', 'menuitem');
            el.setAttribute('aria-label', item.label);
            el.dataset['id'] = item.id;
            el.style.setProperty('--rm-tx', `${x}px`);
            el.style.setProperty('--rm-ty', `${y}px`);

            const iconEl = document.createElement('div');
            iconEl.className  = 'rm-icon';
            iconEl.innerHTML  = item.icon;

            const labelEl = document.createElement('div');
            labelEl.className  = 'rm-label';
            labelEl.textContent = item.label;

            el.appendChild(iconEl);
            el.appendChild(labelEl);

            el.addEventListener('click', () => {
                this._hide();
                item.action();
            });

            menu.appendChild(el);
        });

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.menu    = menu;
    }

    // ── Show / Hide ───────────────────────────────────────────────────────────

    private _show(x: number, y: number): void {
        if (!this.overlay || !this.menu) return;

        // Clamp so the menu stays inside the viewport
        const R   = 88 + 40; // radius + item half-width
        const vw  = window.innerWidth;
        const vh  = window.innerHeight;
        const cx  = Math.max(R, Math.min(vw - R, x));
        const cy  = Math.max(R, Math.min(vh - R, y));

        this.menu.style.left = `${cx}px`;
        this.menu.style.top  = `${cy}px`;

        this.overlay.classList.add('rm-visible');
        this.isVisible = true;

        // Focus the menu for keyboard navigation
        this.menu.focus?.();
    }

    private _hide(): void {
        if (!this.overlay) return;
        this.overlay.classList.remove('rm-visible');
        this.elementMenu?.remove();
        this.elementMenu = null;
        this.isVisible = false;
    }

    private _activeElementContext(): { viewId: string; elementId: string } | null {
        const selected = window.selectionManager?.selectedObject; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        const elementId = selected?.userData?.id as string | undefined;
        const viewId = window.viewDefinitionStore?.getActiveId?.() ?? window.viewController?.currentViewDefinitionId; // TODO(F.6.x): replace with runtime.stores.viewDefinition — Phase F.6.x — Phase F.6.x
        if (!elementId || !viewId) return null;
        return { viewId, elementId };
    }

    private _showElementMenu(x: number, y: number, viewId: string, elementId: string): void {
        this.elementMenu?.remove();
        const menu = document.createElement('div');
        menu.className = 'rm-element-menu';
        menu.style.cssText = [
            'position:fixed',
            `left:${Math.min(x + 4, window.innerWidth - 190)}px`,
            `top:${Math.min(y + 4, window.innerHeight - 180)}px`,
            'z-index:10000',
            'display:flex',
            'flex-direction:column',
            'gap:4px',
            'min-width:168px',
            'padding:8px',
            'border-radius:10px',
            'background:rgba(18,24,38,0.96)',
            'border:1px solid rgba(255,255,255,0.14)',
            'box-shadow:0 14px 38px rgba(0,0,0,0.38)',
            'font-family:system-ui,sans-serif',
        ].join(';');
        const executeBus = (busType: string, payload: Record<string, unknown>) => {
            (this.runtime ?? (window as any).runtime)?.bus
                ?.executeCommand(busType, payload)
                ?.catch((e: Error) => console.error(`[RadialMenu] ${busType} failed`, e));
            this._hide();
        };
        const items = [
            ['Hide in View',    () => executeBus('view.hideElement',     { viewId, elementId })],
            ['Isolate in View', () => executeBus('view.isolateElement',   { viewId, elementId })],
            ['Ghost in View',   () => executeBus('view.setGraphicOverride', {
                viewId, targetKind: 'element', targetId: elementId, state: 'projection',
                patch: { visible: true, line: { opacity: 0.35 }, fill: { opacity: 0.15 }, ghostStyle: 'fade', ghostOpacity: 0.25 },
            })],
            ['Clear Overrides', () => executeBus('view.clearOverride',    { viewId, targetKind: 'element', targetId: elementId })],
        ] as Array<[string, () => void]>;
        for (const [label, action] of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = [
                'border:0',
                'border-radius:7px',
                'background:transparent',
                'color:#f7f9fc',
                'padding:8px 10px',
                'text-align:left',
                'cursor:pointer',
                'font-size:12px',
                'font-weight:600',
            ].join(';');
            btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(102,0,255,0.28)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            btn.addEventListener('click', action);
            menu.appendChild(btn);
        }
        document.body.appendChild(menu);
        this.elementMenu = menu;
        this.isVisible = true;
        const dismiss = (event: MouseEvent) => {
            if (!menu.contains(event.target as Node)) {
                this._hide();
                document.removeEventListener('mousedown', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private _handleContextMenu(e: MouseEvent): void {
        e.preventDefault();
        e.stopPropagation();

        if (this.isVisible) {
            this._hide();
            return;
        }

        const context = this._activeElementContext();
        if (context) {
            this._showElementMenu(e.clientX, e.clientY, context.viewId, context.elementId);
            return;
        }

        this._show(e.clientX, e.clientY);
    }

    private _handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && this.isVisible) {
            this._hide();
        }
    }
}
