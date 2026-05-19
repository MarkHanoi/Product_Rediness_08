/**
 * GridModePicker — singleton state holder for the grid drawing mode.
 *
 * §40 §2 — Grids are ORTHOGONAL by default and switch to LINEAR (free angle)
 * on demand. Mirrors the WallModePicker pattern. Exposed on
 * `window.gridModePicker` so plan-view tool handlers can read the current
 * mode without re-activating the tool.
 */

export type GridDrawingMode = 'orthogonal' | 'linear';

type Listener = (mode: GridDrawingMode) => void;

export class GridModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    /** §40 §2.1 — Orthogonal is the default mode for every fresh tool activation. */
    private _mode: GridDrawingMode = 'orthogonal';
    private _listeners = new Set<Listener>();

    getMode(): GridDrawingMode {
        return this._mode;
    }

    setMode(mode: GridDrawingMode): void {
        if (this._mode === mode) return;
        this._mode = mode;
        this._listeners.forEach(l => l(mode));
    }

    toggleMode(): GridDrawingMode {
        this.setMode(this._mode === 'orthogonal' ? 'linear' : 'orthogonal');
        return this._mode;
    }

    onChange(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
}

/** Singleton instance — the only one allowed to drive the UI. */
export const gridModePicker = new GridModePicker();
