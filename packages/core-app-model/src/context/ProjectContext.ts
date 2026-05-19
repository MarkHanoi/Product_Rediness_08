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
