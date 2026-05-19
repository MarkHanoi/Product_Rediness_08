/**
 * GridToggleService
 *
 * Manages user-controlled grid visibility as a layer ON TOP of the
 * ViewController's internal state machine.
 *
 * ViewController owns the authority for fade / projection-mode changes.
 * GridToggleService owns the "user wants the grid visible" boolean.
 *
 * Integration contract:
 *  - ViewController sets grid.three.visible = true on every view activation.
 *  - GridToggleService listens to 'view-activated' and re-applies the user's
 *    toggle if they have turned the grid off, ensuring the user's choice
 *    survives view changes.
 *  - GridToggleService does NOT touch grid.fade, grid.material, or anything
 *    else controlled by ViewController. It only touches grid.three.visible.
 *
 * Contract compliance:
 *  §01-1.1  Tool Layer — no store mutations.
 *  §01      §3.5 — no spatial registration.
 *  §02      No geometry or coordinate changes.
 */

export class GridToggleService {
    private _grid: any;
    private _visible: boolean = false;
    /**
     * Optional secondary grid object that mirrors the toggle state.
     * Used by the custom InfiniteGrid3D shader plane so the 3D grid and
     * the 2D plan grid share a single user-facing on/off switch.
     */
    private _aux: { setVisible: (v: boolean) => void } | null = null;

    constructor(grid: any) {
        this._grid = grid;

        // Apply the initial off-state — the grid is hidden by default.
        // Users can enable it via the Grid button in the Camera panel.
        // ViewController sets visible=true on view activation, but our
        // 'view-activated' listener below will re-apply the user's choice.
        this._apply();

        // Re-apply whenever ViewController activates a view, because
        // ViewController always resets visible to true via _applyGridState.
        window.runtime?.events?.on('view-activated', () => { // F.events.8
            this._apply();
        });
    }

    /** Returns true if the grid is currently set to be visible by the user. */
    get isVisible(): boolean {
        return this._visible;
    }

    /** Show the grid. */
    show(): void {
        this._visible = true;
        this._apply();
    }

    /** Hide the grid. */
    hide(): void {
        this._visible = false;
        this._apply();
    }

    /** Toggle grid on/off. Returns the new state. */
    toggle(): boolean {
        this._visible = !this._visible;
        this._apply();
        return this._visible;
    }

    /**
     * Register a secondary grid object whose visibility tracks the toggle.
     * The object only needs a `setVisible(boolean)` method, which keeps this
     * service decoupled from the InfiniteGrid3D implementation.
     */
    attachAuxiliary(aux: { setVisible: (v: boolean) => void }): void {
        this._aux = aux;
        this._apply();
    }

    private _apply(): void {
        if (this._grid?.three) {
            // The OBC grid is hidden permanently in BimWorld (replaced by the
            // custom InfiniteGrid3D), but we still flip its flag so any code
            // that inspects `grid.three.visible` sees the user's intent.
            this._grid.three.visible = this._visible;
        }
        this._aux?.setVisible(this._visible);
    }
}
