/**
 * EngineContext — Typed shared state passed between all subsystem initializers.
 *
 * Phase F-1: EngineBootstrap decomposition.
 *
 * As each subsystem initializer runs it receives the context object; initializers
 * that produce new shared state mutate the context in-place so subsequent
 * initializers can consume those values.
 *
 * Contract:
 *   §01-BIM-ENGINE-CORE-CONTRACT §1 — engine-layer only; never imported by UI layer.
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — this file must not import heavy engine libs
 *   at module scope; it uses `import type` exclusively.
 */

import type * as THREE from '@pryzm/renderer-three/three';
import type * as OBC from '@thatopen/components';
import type * as OBCF from '@thatopen/components-front';
import type { SelectionManager } from '@pryzm/input-host';
import type { DataWorkbench } from '@app/ui/dataworkbench/DataWorkbench';

/**
 * Core context produced by initScene and consumed by every subsequent subsystem.
 */
export interface EngineContext {
    /** The @thatopen/components World (scene + camera + renderer). */
    world: OBC.World;
    /** OBC components container. */
    components: OBC.Components;
    /** PostproductionRenderer from @thatopen/components-front. */
    postproductionRenderer: OBCF.PostproductionRenderer;
    /**
     * The PRYZM-owned renderer canvas overlay.
     * null when Phase 5 WebGPU renderer did not activate.
     */
    pryzmCanvas: HTMLCanvasElement | null;
    /** The PRYZM-owned renderer (WebGPU preferred, OBC WebGL fallback). */
    pryzmRenderer: THREE.WebGLRenderer;
    /** true when Phase 5 WebGPU renderer is active. */
    isPhase5Active: boolean;
    /** SelectionManager instance (available after initTools runs). */
    selectionManager: SelectionManager;
    /**
     * Updates the right-side inspector panel and dispatches
     * `pryzm-element-selected` for DataWorkbench sync.
     */
    updateInspector: (obj: THREE.Object3D | OBC.View) => void;
    /** DataWorkbench instance (available after initDataPlatform runs). */
    dataWorkbench: DataWorkbench;
    /** The root container element for the 3D viewport. */
    container: HTMLElement;
}
