// §FURNISH-PERF (L-1398) — one typed-global read when disarmed; see PerfCounters.ts.
import { bumpPerf, PERF_KEYS } from '@pryzm/frame-scheduler';

export type ProjectEventType = 'activeLevelChanged' | 'levelAdded' | 'levelRemoved' | 'editorModeChanged';
export type ProjectEventListener = (event: ProjectEventType, data: any) => void;

export enum EditorMode {
    Project = 'Project',
    Component = 'Component'
}

export class ProjectContext {
    private _activeLevelId: string = 'L0';
    private _editorMode: EditorMode = EditorMode.Project;
    private listeners: ProjectEventListener[] = [];

    get activeLevelId(): string {
        return this._activeLevelId;
    }

    set activeLevelId(id: string) {
        if (this._activeLevelId !== id) {
            this._activeLevelId = id;
            // ⭐ §FURNISH-PERF (L-1398) — THIS IS THE MOST EXPENSIVE ASSIGNMENT IN THE
            // EDITOR AND IT LOOKED LIKE A FIELD WRITE. `emit` below fans out
            // SYNCHRONOUSLY into a subscriber list AND a `window.dispatchEvent`, and
            // between them they drive a plan-view teardown + rebuild + cold projection,
            // ~5 full `scene.traverse` from the `view-activated` visibility gates, a
            // room-tag pass and a camera animation. Counting the switches is the first
            // thing a reader needs, because an orchestration that switches N times has
            // multiplied all of that by N before doing any work of its own (L-1395).
            bumpPerf(PERF_KEYS.LEVEL_SWITCH);
            this.emit('activeLevelChanged', { levelId: id });
        }
    }

    get editorMode(): EditorMode {
        return this._editorMode;
    }

    set editorMode(mode: EditorMode) {
        if (this._editorMode !== mode) {
            this._editorMode = mode;
            this.emit('editorModeChanged', { mode });
        }
    }

    subscribe(listener: ProjectEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: ProjectEventType, data: any) {
        this.listeners.forEach(l => l(event, data));
        // Also dispatch on window so global event listeners (e.g. UnifiedBrowserPanel,
        // Layout, PropertyInspector) stay in sync regardless of which system changed the level.
        window.dispatchEvent(new CustomEvent(event, { detail: data })); // TODO(TASK-15)
    }
}

// Singleton for easy access if needed, but DI is preferred
export const projectContext = new ProjectContext();
