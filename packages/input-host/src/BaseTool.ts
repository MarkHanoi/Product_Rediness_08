import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ITool, ToolName, ToolState, ToolStateInfo, ToolContext } from './types.js';

export abstract class BaseTool implements ITool {
    abstract readonly name: ToolName;
    
    protected _isActive = false;
    protected _state: ToolState = ToolState.IDLE;
    protected _hasPreview = false;
    protected _boundHandlers: Map<string, EventListener> = new Map();
    
    protected world: OBC.World;
    protected scene: THREE.Scene;
    protected canvas: HTMLCanvasElement;
    
    constructor(context: ToolContext) {
        this.world = context.world;
        this.scene = context.scene;
        this.canvas = context.canvas;
    }
    
    get isActive(): boolean {
        return this._isActive;
    }
    
    get state(): ToolState {
        return this._state;
    }
    
    protected setState(newState: ToolState): void {
        const oldState = this._state;
        this._state = newState;
        if (oldState !== newState) {
            this.onStateChanged(oldState, newState);
        }
    }
    
    protected onStateChanged(_oldState: ToolState, _newState: ToolState): void {
    }
    
    abstract activate(options?: Record<string, unknown>): void | Promise<void>;
    abstract deactivate(): void;
    abstract cancel(): void;
    
    onActivate(): void | Promise<void> {
        this._isActive = true;
        this.setState(ToolState.IDLE);
    }
    
    onDeactivate(): void {
        this._isActive = false;
        this.setState(ToolState.IDLE);
        this.detachAllListeners();
        this.clearAllPreviews();
    }
    
    onCancel(): void {
        this.setState(ToolState.IDLE);
        this.clearAllPreviews();
    }
    
    cleanup(): void {
        this.detachAllListeners();
        this.clearAllPreviews();
        this._isActive = false;
        this._state = ToolState.IDLE;
    }
    
    getStateInfo(): ToolStateInfo {
        return {
            name: this.name,
            state: this._state,
            isActive: this._isActive,
            hasPreview: this._hasPreview,
            hasListeners: this._boundHandlers.size > 0
        };
    }
    
    dispose(): void {
        this.cleanup();
        this._boundHandlers.clear();
    }
    
    protected attachListener(
        target: EventTarget,
        event: string,
        handler: EventListener,
        options?: AddEventListenerOptions
    ): void {
        const key = `${event}-${Date.now()}`;
        this._boundHandlers.set(key, handler);
        target.addEventListener(event, handler, options);
    }
    
    protected detachAllListeners(): void {
        this._boundHandlers.clear();
    }
    
    protected abstract clearAllPreviews(): void;
    
    protected enableCameraControls(enabled: boolean): void {
        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = enabled;
        }
    }
    
    protected getWorldPoint(event: PointerEvent, planeY = 0): THREE.Vector3 | null {
        const rect = this.canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const intersection = new THREE.Vector3();
        
        if (raycaster.ray.intersectPlane(plane, intersection)) {
            return intersection;
        }
        return null;
    }
}
