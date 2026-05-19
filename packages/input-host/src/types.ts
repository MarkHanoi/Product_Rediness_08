import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

export type ToolName = 
    | 'none' 
    | 'slab' 
    | 'wall' 
    | 'window' 
    | 'door' 
    | 'curtain-wall' 
    | 'column'
    | 'beam'
    | 'stair'
    | 'ceiling'
    | 'floor'
    | 'roof'
    | 'railing'
    | 'linear-dimension'
    // §ANN-B3/B4 — Annotation tools
    | 'text-note'
    | 'element-tag'
    // §ANN-Phase-IV — additional annotation tools
    | 'angular-dimension'
    | 'spot-elevation'
    | 'keynote'
    // §ROOM-Phase-6 — Room tool
    | 'room'
    // §DIM-IV-3 — New annotation-system linear dimension (Class A tool)
    | 'linear-dim'
    // DOC-1.12 — Detail view crop-region picker
    | 'detail-view'
    // DOC-2.4 — New dimension types
    | 'radius-dimension'
    | 'diameter-dimension'
    | 'slope-dimension'
    // DOC-2.5 — Specialised tags
    | 'door-tag'
    | 'window-tag'
    | 'level-tag'
    | 'grid-bubble'
    // DOC-2.8 — Revision cloud
    | 'revision-cloud'
    // Sprint 3 — Missing element types in plan view
    | 'furniture'
    | 'plumbing'
    | 'opening'
    | 'grid'
    | 'section-mark'
    | 'elevation-mark'
    // 2D polyline stair path tool (plan view)
    | 'stair-path';

export enum ToolState {
    IDLE = 'idle',
    DRAWING = 'drawing',
    AWAITING_CONFIRMATION = 'awaiting_confirmation'
}

export interface ToolContext {
    world: OBC.World;
    scene: THREE.Scene;
    camera: OBC.SimpleCamera;
    canvas: HTMLCanvasElement;
}

export interface ToolIntent {
    type: string;
    payload: Record<string, unknown>;
    timestamp: number;
}

export interface ToolCommand {
    type: string;
    execute(): void;
    undo(): void;
    canExecute(): boolean;
}

export interface ToolLifecycle {
    onActivate(): void | Promise<void>;
    onDeactivate(): void;
    onCancel(): void;
    cleanup(): void;
}

export interface ToolStateInfo {
    name: ToolName;
    state: ToolState;
    isActive: boolean;
    hasPreview: boolean;
    hasListeners: boolean;
}

export interface ITool extends ToolLifecycle {
    readonly name: ToolName;
    readonly isActive: boolean;
    readonly state: ToolState;
    
    activate(options?: Record<string, unknown>): void | Promise<void>;
    deactivate(): void;
    cancel(): void;
    
    getStateInfo(): ToolStateInfo;
    dispose(): void;
}

export interface ToolManagerEvents {
    'tool:activated': { tool: ToolName; previous: ToolName };
    'tool:deactivated': { tool: ToolName };
    'tool:state-changed': { tool: ToolName; state: ToolState };
    'tool:error': { tool: ToolName; error: Error };
}

export type ToolEventHandler<K extends keyof ToolManagerEvents> = 
    (event: ToolManagerEvents[K]) => void;

export class ToolEventEmitter {
    private handlers: Map<string, Set<Function>> = new Map();

    on<K extends keyof ToolManagerEvents>(
        event: K, 
        handler: ToolEventHandler<K>
    ): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
        return () => this.off(event, handler);
    }

    off<K extends keyof ToolManagerEvents>(
        event: K, 
        handler: ToolEventHandler<K>
    ): void {
        this.handlers.get(event)?.delete(handler);
    }

    emit<K extends keyof ToolManagerEvents>(
        event: K, 
        data: ToolManagerEvents[K]
    ): void {
        this.handlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (err) {
                console.error(`Error in tool event handler for ${event}:`, err);
            }
        });
    }

    clear(): void {
        this.handlers.clear();
    }
}
