// §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — the plan-canvas underlay bridge.
//
// THE GOAL (founder): once a PDF/JPG is layered + calibrated on the site map, pressing
// "✓ Finished" should drop it into the PRYZM editor canvas as a live underlay — correctly
// GEOLOCATED (site origin / C19 §1.3 LTP-ENU), correctly SIZED (2-point calibration mpp),
// and rotated onto PROJECT NORTH so it shows ORTHOGONALLY in plan view (the map shows it at
// true/geographic north; the canvas removes that rotation so the user can trace walls along
// the plan's edges). ADR-0115 §Remaining #1.
//
// REUSE, DO NOT REBUILD: this hands the calibrated raster + its project-frame transform into
// the EXISTING floor-plan underlay pipeline — `FloorPlanUnderlayTool` (packages/input-host)
// renders the raster underlay in plan + 3D, and `CreateUnderlayCommand` (command-registry,
// dispatched via runtime.bus → the CREATE_UNDERLAY bridge in initBusHandlers, L-45) makes it
// a P6-compliant, undoable mutation. The raster is a data URL, already size-capped by the
// site-overlay rasteriser (the tool also downscales to the GPU cap defensively).
//
// P2: no `import * as THREE` here — the mesh is mutated via the tool's own state handle.
// P6: the mutation is dispatched as a Command. P8: one OpenTelemetry span (below).

import { FloorPlanUnderlayTool } from '@pryzm/input-host';
import { CreateUnderlayCommand, type UnderlayCreateSnapshot } from '@pryzm/command-registry';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/** Everything the plan-canvas underlay needs, pre-computed by the site-overlay controller
 *  (see computePlanUnderlayPlacement in projectTrueNorth.ts for the scale/rotation math). */
export interface SiteOverlayUnderlayInput {
    /** The calibrated plan raster as a data URL (image/png), already size-capped. */
    readonly dataUrl: string;
    /** Source raster width/height in pixels. */
    readonly widthPx: number;
    readonly heightPx: number;
    /** Metric scale = 1 / metresPerPixel (correct real-world size). */
    readonly pxPerMeter: number;
    /** Project-frame underlay centre, metres East/North of the site origin. */
    readonly positionEast: number;
    readonly positionNorth: number;
    /** Underlay rotation about world-Y (radians). 0 = axis-aligned / project north. */
    readonly rotationZ: number;
    /** Optional Y elevation; defaults to the active level's elevation (else 0). */
    readonly elevationY?: number;
    /** §FIX-IMPORT-MANAGER-SOUND (L-88) — display name for the Import Manager row +
     *  persistence label (the uploaded file's name). Defaults to "Site Plan". */
    readonly fileName?: string;
}

const _tracer = trace.getTracer('pryzm-engine');

/** Resolve the active level elevation the way the floor-plan import Step-3 does. */
function resolveElevationY(): number {
    try {
        const levelId = window.projectContext?.activeLevelId;
        const level = levelId ? window.bimManager?.getLevelById?.(levelId) : null;
        const y = level?.elevation;
        return typeof y === 'number' && Number.isFinite(y) ? y : 0;
    } catch {
        return 0;
    }
}

/**
 * Instantiate the calibrated site-plan raster as a plan-canvas underlay (plan + 3D), placed
 * at its project-frame position + size and AXIS-ALIGNED (project north). Reuses
 * FloorPlanUnderlayTool + CreateUnderlayCommand. Never throws — returns false on any failure
 * (scene not ready, decode error) so the "enter canvas" flow is never aborted by it.
 */
export async function createPlanCanvasUnderlayFromSiteOverlay(
    input: SiteOverlayUnderlayInput,
): Promise<boolean> {
    const span = _tracer.startSpan('pryzm.siteOverlay.createPlanUnderlay', {
        attributes: {
            'pryzm.underlay.pxPerMeter': input.pxPerMeter,
            'pryzm.underlay.widthPx': input.widthPx,
            'pryzm.underlay.heightPx': input.heightPx,
            'pryzm.underlay.rotationZ': input.rotationZ,
        },
    });
    try {
        const scene = window.scene;       // TODO(D.4): runtime.scene.three
        const camera = window.camera;     // TODO(D.4): runtime.scene.camera
        const renderer = window.renderer; // TODO(D.4): runtime.scene.renderer
        if (!scene || !camera || !renderer) {
            console.warn('[site-overlay→canvas] scene/camera/renderer not ready — underlay skipped.');
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'scene-not-ready' });
            return false;
        }
        if (!input.dataUrl || input.pxPerMeter <= 0 || input.widthPx <= 0 || input.heightPx <= 0) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'bad-input' });
            return false;
        }

        const elevationY = input.elevationY ?? resolveElevationY();

        // Replace any existing underlay (a fresh import supersedes the previous plan).
        try { window.floorPlanUnderlayTool?.dispose?.(); } catch { /* ignore */ }

        const tool = new FloorPlanUnderlayTool(scene, camera, renderer.domElement);
        const creationParams: UnderlayCreateSnapshot = {
            blobUrl: input.dataUrl,
            pxPerMeter: input.pxPerMeter,
            widthPx: input.widthPx,
            heightPx: input.heightPx,
            elevationY,
        };
        await tool.create(creationParams); // async: decodes + uploads the texture

        // Apply the project-frame placement onto the freshly created mesh. Scene frame is
        // ENU: world X = East, world Z = −North. rotationZ = 0 keeps the plan axis-aligned
        // in the top-down plan view (project north). This runs BEFORE the command dispatch
        // so CreateUnderlayCommand's first-execute snapshot captures the placed transform
        // (→ a later redo reproduces it faithfully).
        const st = tool.getState?.();
        if (st?.mesh) {
            st.mesh.position.x = input.positionEast;
            st.mesh.position.z = -input.positionNorth;
            st.mesh.rotation.z = input.rotationZ;
            st.mesh.updateMatrixWorld?.(true);
        }

        // Register minimal recreate/remove hooks for undo/redo IF the floor-plan import panel
        // hasn't already (its hooks recreate from the passed creationParams, so they work for
        // our underlay too). Keeps CreateUnderlayCommand fully undoable (P6) on this path.
        if (typeof window.__pryzmRemoveUnderlayInternal !== 'function') {
            window.__pryzmRemoveUnderlayInternal = () => {
                try { window.floorPlanUnderlayTool?.dispose?.(); } catch { /* ignore */ }
                window.floorPlanUnderlayTool = null;
            };
        }
        if (typeof window.__pryzmRecreateUnderlayInternal !== 'function') {
            window.__pryzmRecreateUnderlayInternal = async (params: UnderlayCreateSnapshot) => {
                const s = window.scene, c = window.camera, r = window.renderer;
                if (!s || !c || !r) return;
                try { window.floorPlanUnderlayTool?.dispose?.(); } catch { /* ignore */ }
                const t = new FloorPlanUnderlayTool(s, c, r.domElement);
                await t.create(params);
            };
        }

        // P6 — record the placement as an undoable Command through the bus (the
        // CREATE_UNDERLAY bridge forwards it to the legacy commandManager stack).
        const cmd = new CreateUnderlayCommand(creationParams);
        try {
            await window.runtime?.bus?.executeCommand?.(cmd.type, cmd);
        } catch (err) {
            // The mesh is already live; a bus hiccup only costs the undo entry.
            console.warn('[site-overlay→canvas] CREATE_UNDERLAY dispatch failed (non-fatal):', err);
        }

        // §FIX-IMPORT-MANAGER-SOUND (L-88) — announce the placement on the SAME Contract-§32
        // event the floor-plan import + restore use, so this underlay (a) REGISTERS in the
        // Import Manager panel and (b) is PERSISTED per-project by UnderlayPersistence (which
        // saves on this event → localStorage metadata + IndexedDB raster) → it survives a
        // project close/re-open exactly like a normal PDF/image import. Reuses the proven
        // pipeline — no parallel persistence. Stamp the fileName so the panel/persistence label
        // it correctly.
        const fileName = input.fileName ?? 'Site Plan';
        try { if (st?.mesh) (st.mesh.userData as { fileName?: string }).fileName = fileName; } catch { /* ignore */ }
        try {
            window.runtime?.events?.emit('pryzm-floor-plan-underlay-placed', {
                underlayId: `floor-plan-${Date.now()}`,
                fileName,
            });
        } catch (err) {
            console.warn('[site-overlay→canvas] underlay-placed emit failed (non-fatal):', err);
        }

        // Nudge the plan-view canvas to repaint the underlay at its new transform.
        try { window.dispatchEvent(new CustomEvent('underlay:transform-changed')); } catch { /* ignore */ }

        span.setStatus({ code: SpanStatusCode.OK });
        console.log(
            `[site-overlay→canvas] plan underlay placed — size ${input.widthPx}×${input.heightPx}px @ ${input.pxPerMeter.toFixed(3)} px/m, ` +
            `centre (E ${input.positionEast.toFixed(2)}, N ${input.positionNorth.toFixed(2)}) m, rotation ${(input.rotationZ * 180 / Math.PI).toFixed(1)}° (project north).`,
        );
        return true;
    } catch (err) {
        console.error('[site-overlay→canvas] underlay creation failed:', err);
        try { span.recordException(err as Error); } catch { /* ignore */ }
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? 'unknown' });
        return false;
    } finally {
        span.end();
    }
}
