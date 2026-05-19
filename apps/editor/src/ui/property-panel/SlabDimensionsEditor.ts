/**
 * DIMENSION-SYSTEM-AUDIT-2026 §A4 — explicit dependency injection.
 *
 * The audit flagged this panel as the "dirtiest dim UI module" because it
 * reached into `window.slabStore` and `window.commandManager` // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
 * at every show/apply call.  Both dependencies are now passed in via the
 * constructor; window fallbacks remain for legacy callers and are removed
 * once `SlabTool` has migrated.
 */
export interface SlabDimensionsEditorDeps {
    getSlabStore?:      () => any;
    getCommandManager?: () => any;
}

/**
 * Computes a 4-corner axis-aligned rectangle polygon centred at (cx, cz) with
 * the given half-dimensions.  All coordinates are in the polygon XZ space
 * (stored as { x, y } where y = world Z).
 *
 * §11 §4.4 — "Recomputing Rectangle Corners"
 */
function rectanglePolygonFromDimensions(
    cx: number,
    cz: number,
    width: number,
    depth: number
): { x: number; y: number }[] {
    const hw = width / 2;
    const hd = depth / 2;
    return [
        { x: cx - hw, y: cz - hd },
        { x: cx - hw, y: cz + hd },
        { x: cx + hw, y: cz + hd },
        { x: cx + hw, y: cz - hd },
    ];
}

/**
 * Floating dimension-edit panel for FLOOR_SKETCH slabs (Mode A).
 *
 * Triggered when the user double-clicks a slab with `width > 0 && depth > 0`.
 * Provides Width and Depth inputs and an Apply button that fires
 * `UpdateSlabPolygonCommand` with the recomputed 4-corner polygon.
 *
 * §11 §1.2  — Mode A: Rectangular Dimension Editor
 * §11 §4.4  — Property Panel — Dimension Edit
 * §01 §2.1  — Command-First: never calls slabStore directly
 */
export class SlabDimensionsEditor {
    private panelEl: HTMLElement | null = null;
    private currentSlabId: string | null = null;

    private _globalEscHandler: ((e: KeyboardEvent) => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _deps: SlabDimensionsEditorDeps = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    /**
     * Show (or replace) the dimension edit panel for the given slab.
     * Reads the current polygon to derive the slab centre so the shape stays
     * centred at the same world position after resizing.
     */
    public show(slabId: string): void {
        this.hide();

        // DIMENSION-SYSTEM-AUDIT-2026 §A4 — read injected slabStore first.
        const slabStore = this._deps.getSlabStore?.() ?? window.slabStore; // TODO(E.slab.S): legacy slabStore — replace with runtime.stores.slab
        const slab = slabStore?.getById(slabId);
        if (!slab) {
            console.warn('[SlabDimensionsEditor] slab not found in store:', slabId);
            return;
        }

        this.currentSlabId = slabId;

        const polygon: { x: number; y: number }[] = slab.polygon ?? [];
        const xs = polygon.map((p: { x: number }) => p.x);
        const zs = polygon.map((p: { y: number }) => p.y);

        const cx = xs.length > 0 ? (Math.max(...xs) + Math.min(...xs)) / 2 : 0;
        const cz = zs.length > 0 ? (Math.max(...zs) + Math.min(...zs)) / 2 : 0;

        const initW = +(slab.width ?? 0).toFixed(2);
        const initD = +(slab.depth ?? 0).toFixed(2);

        const panel = document.createElement('div');
        panel.id = 'slab-dimensions-editor';
        panel.style.cssText = [
            'position:fixed',
            'bottom:80px',
            'right:20px',
            'z-index:999999',
            'background:#1e1e2e',
            'border:1px solid rgba(255,255,255,0.12)',
            'border-radius:10px',
            'padding:16px 18px',
            'min-width:240px',
            'box-shadow:0 4px 24px rgba(0,0,0,0.55)',
            'font-family:system-ui,sans-serif',
            'color:#e2e8f0',
            'user-select:none',
        ].join(';');

        panel.innerHTML = `
            <div style="font-weight:700;font-size:13px;margin-bottom:12px;
                        letter-spacing:.3px;display:flex;align-items:center;gap:7px;">
                <span style="color:#60a5fa;font-size:15px;">▭</span> Edit Slab Dimensions
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr;
                        gap:8px 12px;align-items:center;margin-bottom:14px;">
                <label for="dim-width" style="font-size:12px;color:#94a3b8;">Width (m)</label>
                <input id="dim-width" type="number" step="0.01" min="0.1" max="200"
                    value="${initW}"
                    style="background:#0f172a;border:1px solid rgba(255,255,255,0.15);
                           border-radius:5px;color:#e2e8f0;padding:5px 8px;
                           font-size:12px;width:88px;outline:none;">
                <label for="dim-depth" style="font-size:12px;color:#94a3b8;">Depth (m)</label>
                <input id="dim-depth" type="number" step="0.01" min="0.1" max="200"
                    value="${initD}"
                    style="background:#0f172a;border:1px solid rgba(255,255,255,0.15);
                           border-radius:5px;color:#e2e8f0;padding:5px 8px;
                           font-size:12px;width:88px;outline:none;">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="dim-cancel"
                    style="background:transparent;border:1px solid rgba(255,255,255,0.15);
                           border-radius:5px;color:#94a3b8;padding:5px 13px;
                           font-size:12px;cursor:pointer;transition:background .15s;">
                    Cancel
                </button>
                <button id="dim-apply"
                    style="background:#3b82f6;border:none;border-radius:5px;color:#fff;
                           padding:5px 15px;font-size:12px;cursor:pointer;font-weight:600;
                           transition:background .15s;">
                    ✓ Apply
                </button>
            </div>
            <div style="margin-top:10px;font-size:10px;color:#475569;line-height:1.7;">
                <kbd style="background:#334155;border-radius:3px;padding:1px 5px;">Enter</kbd>&nbsp;= apply &nbsp;
                <kbd style="background:#334155;border-radius:3px;padding:1px 5px;">Esc</kbd>&nbsp;= cancel
            </div>
        `;

        document.body.appendChild(panel);
        this.panelEl = panel;

        const applyBtn  = panel.querySelector('#dim-apply')  as HTMLButtonElement;
        const cancelBtn = panel.querySelector('#dim-cancel') as HTMLButtonElement;
        const widthInput = panel.querySelector('#dim-width') as HTMLInputElement;
        const depthInput = panel.querySelector('#dim-depth') as HTMLInputElement;

        const doApply = () => this._applyDimensions(slabId, cx, cz, widthInput, depthInput);

        applyBtn.addEventListener('click', doApply);
        cancelBtn.addEventListener('click', () => this.hide());

        [widthInput, depthInput].forEach(input => {
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.stopImmediatePropagation();
                    doApply();
                } else if (e.key === 'Escape') {
                    e.stopImmediatePropagation();
                    this.hide();
                }
            });

            input.addEventListener('focus', () => {
                input.style.borderColor = 'rgba(96,165,250,0.7)';
            });
            input.addEventListener('blur', () => {
                input.style.borderColor = 'rgba(255,255,255,0.15)';
            });
        });

        this._globalEscHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.panelEl) {
                e.stopImmediatePropagation();
                this.hide();
            }
        };
        window.addEventListener('keydown', this._globalEscHandler, { capture: true });

        widthInput.focus();
        widthInput.select();

        console.log(`[SlabDimensionsEditor] §11 Mode A panel shown — slab: ${slabId}, ` +
                    `centre: (${cx.toFixed(2)}, ${cz.toFixed(2)}), ` +
                    `current: ${initW}m × ${initD}m`);
    }

    private _applyDimensions(
        slabId: string,
        cx: number,
        cz: number,
        widthInput: HTMLInputElement,
        depthInput: HTMLInputElement
    ): void {
        const newWidth = parseFloat(widthInput.value);
        const newDepth = parseFloat(depthInput.value);

        if (!isFinite(newWidth) || newWidth < 0.01) {
            widthInput.style.borderColor = '#ef4444';
            widthInput.focus();
            return;
        }
        if (!isFinite(newDepth) || newDepth < 0.01) {
            depthInput.style.borderColor = '#ef4444';
            depthInput.focus();
            return;
        }

        const newPolygon = rectanglePolygonFromDimensions(cx, cz, newWidth, newDepth);

        // DIMENSION-SYSTEM-AUDIT-2026 §A4 — read injected commandManager first.
        // [P6-E.5.1] Migrated: guard on runtime.bus; dispatch is via window.runtime?.bus below.
        // (01-BIM-ENGINE-CORE-CONTRACT §1 — mutations via commandBus only).
        if (!window.runtime?.bus) {
            console.error('[SlabDimensionsEditor] runtime.bus not available');
            return;
        }

        // [F-1.3] Bus-primary: commandManager exfiltrated to UpdateSlabPolygonHandler (plugins/slab).
        window.runtime?.bus?.executeCommand('slab.updatePolygon', { slabId, polygon: newPolygon })
            .catch((e: Error) => console.error('[SlabDimensionsEditor] slab.updatePolygon failed:', e));

        this.hide();
        console.log(`[SlabDimensionsEditor] §11 Applied — ${newWidth.toFixed(2)}m × ${newDepth.toFixed(2)}m → slab: ${slabId}`);
    }

    /**
     * Remove the panel from the DOM and detach the global ESC listener.
     * Safe to call when the panel is not present (idempotent).
     */
    public hide(): void {
        if (this._globalEscHandler) {
            window.removeEventListener('keydown', this._globalEscHandler, { capture: true });
            this._globalEscHandler = null;
        }
        const el = document.getElementById('slab-dimensions-editor');
        if (el) el.remove();
        this.panelEl = null;
        this.currentSlabId = null;
    }

    /** True if a panel is currently showing. */
    get isVisible(): boolean {
        return this.panelEl !== null;
    }

    /** The slab ID currently being edited, or null if not visible. */
    get editingSlabId(): string | null {
        return this.currentSlabId;
    }
}
