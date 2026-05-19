/**
 * @file src/rendering/pipeline/OutlinePass.ts
 *
 * Phase 4 — TSL Selection + Hover Outlines (replacing current GLSL outline shader).
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-4, Step 4.2):
 *  - Selected objects: soft violet visible edge + electric violet hidden (through-wall) edge.
 *  - Hovered objects:  electric violet visible edge + soft violet hidden edge,
 *                      pulsing at period 3 s (oscSine-driven).
 *  - `selectedObjects` and `hoveredObjects` are live mutable arrays owned by
 *    RenderPipelineManager.  Passed by reference so external push/pop is
 *    reflected each frame without rebuilding the pipeline.
 *  - Outline nodes are composited BEFORE TRAA (editor pattern, line 260–262).
 *  - Raw OutlineNode instances must be disposed when the pipeline is torn down
 *    to release GPU render targets.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 *
 * Colour palette (docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md):
 *  - --app-violet-1 (#8B5CF6): soft violet  — lighter brand stop.
 *  - --app-violet-3 (#6600FF): electric violet — deeper brand stop.
 */

import * as THREE from '../three-re-export';
import type { TSLNode } from '../tsl-types';

// ── Outline constants — PRYZM violet palette (contract §05 / §06) ──────────

/** Selected visible edge: soft violet (--app-violet-1 #8B5CF6). */
const SELECTED_VISIBLE_COLOR = 0x8B5CF6 as const;

/** Hidden through-wall edge (selected + hover): electric violet (--app-violet-3 #6600FF). */
const HIDDEN_EDGE_COLOR      = 0x6600FF as const;

/** Hover visible edge: electric violet (--app-violet-3 #6600FF). */
const HOVER_VISIBLE_COLOR    = 0x6600FF as const;

// ── OutlinePassResult ─────────────────────────────────────────────────────

export interface OutlinePassResult {
    /**
     * Outline colour node for selected objects.
     * Editor: `selectedOutlinePass` — add to composite before TRAA.
     */
    selectedOutlineNode: TSLNode;

    /**
     * Pulsing outline colour node for hovered objects.
     * Editor: `hoverOutlinePass` — add to composite before TRAA.
     */
    hoverOutlineNode: TSLNode;

    /**
     * Raw OutlineNode instances — call `.dispose()` on each when rebuilding
     * or tearing down the pipeline to release GPU render targets.
     */
    rawInstances: {
        selected: any;
        hover:    any;
    };
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates TSL outline passes for selected and hovered objects.
 *
 * The `selectedObjects` and `hoveredObjects` arrays are accepted by reference.
 * Mutate them externally (push/pop) to update which objects are outlined
 * without rebuilding the pipeline.
 *
 * Editor equivalent (post-processing.tsx):
 *   outline(scene, camera, { selectedObjects: useViewer.getState().outliner.selectedObjects })
 *
 * PRYZM equivalent:
 *   outline(scene, camera, { selectedObjects: rpm.selectedObjects })
 *   // rpm.selectedObjects is the live _selectedObjects array from RenderPipelineManager
 *
 * @param scene           — The shared Three.js scene.
 * @param camera          — The shared Three.js camera.
 * @param selectedObjects — Live array of currently-selected Object3D refs (owned by manager).
 * @param hoveredObjects  — Live array of currently-hovered Object3D refs (owned by manager).
 * @returns OutlinePassResult with TSL colour nodes and raw instances for disposal.
 */
export async function createOutlinePasses(
    scene: THREE.Scene,
    camera: THREE.Camera,
    selectedObjects: THREE.Object3D[],
    hoveredObjects: THREE.Object3D[],
): Promise<OutlinePassResult> {
    const tsl = (globalThis as any).__PRYZM_TSL__;
    if (!tsl) throw new Error('[OutlinePass] TSL not loaded. Call initTSL() before createOutlinePasses().');

    const { uniform, oscSine, time } = tsl;

    const { outline } = await import(
        /* @vite-ignore */
        'three/examples/jsm/tsl/display/OutlineNode.js'
    ) as { outline: (scene: unknown, camera: unknown, params?: Record<string, unknown>) => any };

    // ── Selected outline ──────────────────────────────────────────────────
    //   edgeStrength = 3, edgeGlow = 0, edgeThickness = 1
    //   visibleEdge → soft violet (#8B5CF6), hiddenEdge → electric violet (#6600FF)
    const selectedEdgeStrength  = uniform(3);
    const selectedEdgeGlow      = uniform(0);
    const selectedEdgeThickness = uniform(1);
    const selectedVisibleColor  = uniform(new THREE.Color(SELECTED_VISIBLE_COLOR));
    const selectedHiddenColor   = uniform(new THREE.Color(HIDDEN_EDGE_COLOR));

    const selectedOutlinePass = outline(scene, camera, {
        selectedObjects,           // live reference — mutate externally
        edgeGlow:      selectedEdgeGlow,
        edgeThickness: selectedEdgeThickness,
    });
    const { visibleEdge: selVisible, hiddenEdge: selHidden } = selectedOutlinePass;

    // outlineColor = (visibleEdge × white + hiddenEdge × yellow) × strength
    const selectedOutlineNode: TSLNode = selVisible
        .mul(selectedVisibleColor)
        .add(selHidden.mul(selectedHiddenColor))
        .mul(selectedEdgeStrength);

    // ── Hover outline ─────────────────────────────────────────────────────
    //   edgeStrength = 5, edgeGlow = 0.5, edgeThickness = 1.5, pulsePeriod = 3
    //   visibleEdge → electric violet (#6600FF), hiddenEdge → electric violet (#6600FF)
    //   osc = oscSine(time / pulsePeriod × 2) × 0.5 + 0.5  →  [0.5, 1.0]
    //   outlinePulse = pulsePeriod > 0 ? outlineColor × osc : outlineColor
    const hoverEdgeStrength  = uniform(5);
    const hoverEdgeGlow      = uniform(0.5);
    const hoverEdgeThickness = uniform(1.5);
    const hoverPulsePeriod   = uniform(3);
    const hoverVisibleColor  = uniform(new THREE.Color(HOVER_VISIBLE_COLOR));
    const hoverHiddenColor   = uniform(new THREE.Color(HIDDEN_EDGE_COLOR));

    const hoverOutlinePass = outline(scene, camera, {
        selectedObjects: hoveredObjects,   // live reference — mutate externally
        edgeGlow:        hoverEdgeGlow,
        edgeThickness:   hoverEdgeThickness,
    });
    const { visibleEdge: hovVisible, hiddenEdge: hovHidden } = hoverOutlinePass;

    // period = time / pulsePeriod × 2
    // osc    = oscSine(period) × 0.5 + 0.5   →  [0.5, 1.0]
    const period = time.div(hoverPulsePeriod).mul(2);
    const osc    = oscSine(period).mul(0.5).add(0.5);

    const hoverOutlineColor: TSLNode = hovVisible
        .mul(hoverVisibleColor)
        .add(hovHidden.mul(hoverHiddenColor))
        .mul(hoverEdgeStrength);

    // pulsePeriod > 0 → apply oscillator; otherwise static (no pulse)
    const hoverOutlineNode: TSLNode = hoverPulsePeriod
        .greaterThan(0)
        .select(hoverOutlineColor.mul(osc), hoverOutlineColor);

    return {
        selectedOutlineNode,
        hoverOutlineNode,
        rawInstances: {
            selected: selectedOutlinePass,
            hover:    hoverOutlinePass,
        },
    };
}
