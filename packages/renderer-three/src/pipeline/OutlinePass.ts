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
 * Colour palette (docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md):
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
    const hoverEdgeStrength  = uniform(6);
    const hoverEdgeGlow      = uniform(0.5);
    const hoverEdgeThickness = uniform(2);
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
    // osc    = oscSine(period) × 0.3 + 0.7   →  [0.7, 1.0]
    // §SELECT-HOVER-STRENGTH (DAILY-USE 2026-05-22) — raised the pulse FLOOR from
    // 0.5 to 0.7 so the hover outline never dims to a weak half-strength; combined
    // with edgeStrength 6 + thickness 2 it reads as a clear, strong violet hover.
    const period = time.div(hoverPulsePeriod).mul(2);
    const osc    = oscSine(period).mul(0.3).add(0.7);

    const hoverOutlineColor: TSLNode = hovVisible
        .mul(hoverVisibleColor)
        .add(hovHidden.mul(hoverHiddenColor))
        .mul(hoverEdgeStrength);

    // pulsePeriod > 0 → apply oscillator; otherwise static (no pulse)
    const hoverOutlineNode: TSLNode = hoverPulsePeriod
        .greaterThan(0)
        .select(hoverOutlineColor.mul(osc), hoverOutlineColor);

    // ── §OUTLINE-BAILS-ON-EMPTY-SELECTION (L-3320) ────────────────────────
    //
    // ⭐ THE FOUNDER'S OWN A/B IS THE EVIDENCE FOR THIS. 2026-08-22, same model,
    // same session: *"in AUTO is not flowing well — it moves framed, fragmented …
    // then in WebGL: it is much better, honestly good."* Outlines are activated on
    // WebGPU and are OFF on the WebGL path (§PERF-WEBGL2-NO-TSL), so the two
    // backends differ by exactly this pass, and he can feel the difference.
    //
    // MEASURED (ledger §1.1, the vendored OutlineNode driven with a counting stub):
    // ONE node with an EMPTY selection still submits every mesh in the scene —
    // 3898 of them at his scene size — because `updateBefore` runs two passes with
    // OPPOSITE predicates and pass 1 draws everything NOT selected. PRYZM wires
    // TWO nodes. Idle cost: 4 full scene-graph walks, 7796 wasted submissions,
    // 14 fullscreen quads and 20 render-target switches PER FRAME, to draw a
    // violet edge around nothing.
    //
    // ⛔ WHY THIS IS NOT THE 15 s RECOMPILE RISK (7dbc0685, localClippingEnabled):
    // returning `false` from `updateBefore` is a FIRST-CLASS SKIP in three's own
    // dispatcher — `NodeFrame.updateBeforeNode` rolls the frameId back when it sees
    // false. It touches no material, no shader, no pipeline layout and no render
    // target. It is a property read on the node instance. Nothing recompiles.
    //
    // ⛔ THE BAIL MUST BE ONE FRAME LATE. The composite samples the outline render
    // target every frame, so bailing on the very frame the selection empties would
    // freeze the PREVIOUS outline in the buffer as a ghost. Render one final,
    // now-empty pass, then skip from the second consecutive empty frame onward.
    installEmptySelectionBail(selectedOutlinePass, selectedObjects);
    installEmptySelectionBail(hoverOutlinePass, hoveredObjects);

    return {
        selectedOutlineNode,
        hoverOutlineNode,
        rawInstances: {
            selected: selectedOutlinePass,
            hover:    hoverOutlinePass,
        },
    };
}

/**
 * Wrap one OutlineNode's `updateBefore` so it skips while its selection is empty.
 *
 * @param node    the live OutlineNode instance
 * @param objects the SAME live array the node was constructed with — read at call
 *                time, never captured by value, because the manager mutates it in
 *                place and a snapshot would pin the bail to boot-time state.
 */
function installEmptySelectionBail(node: unknown, objects: THREE.Object3D[]): void {
    const n = node as { updateBefore?: (frame: unknown) => unknown } | null;
    if (!n || typeof n.updateBefore !== 'function') {
        // ⛔ Say so rather than silently shipping the un-bailed pass. A no-op that
        // reports nothing is how §1.6's view-switch guard went four months
        // suppressing nothing while its own comment asserted that it worked.
        console.warn(
            '[OutlinePass] §OUTLINE-BAILS-ON-EMPTY-SELECTION could not install: the node exposes no ' +
            'updateBefore(). The outline pass is running UNBAILED — every idle frame still submits ' +
            'the whole scene. This is a real cost, not a cosmetic warning.',
        );
        return;
    }
    const original = n.updateBefore.bind(n);
    let lastWasEmpty = false;
    n.updateBefore = function patchedUpdateBefore(frame: unknown): unknown {
        const empty = objects.length === 0;
        if (empty && lastWasEmpty) return false;   // second consecutive empty frame onward
        lastWasEmpty = empty;
        return original(frame);
    };
}

/** Test-only surface. Not part of the pipeline API. */
export const __testing = { installEmptySelectionBail };
