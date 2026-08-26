/**
 * planToolHandlerRegistry — §FIX-PLAN-VIEW-PARITY (L-73) — C11 element-creation pipeline.
 *
 * SINGLE SOURCE OF TRUTH for the set of plan-view creation/edit tool handlers.
 *
 * Before this module the MAIN plan view (`PlanViewToolOverlay.PLAN_TOOL_HANDLERS`)
 * and the SPLIT-view plan pane (`SvpPlanToolOverlay.SVP_TOOL_HANDLERS`) each declared
 * their own hand-maintained handler map. They drifted: `north-arrow`, `scale-bar` and
 * `matchline` existed only in the main overlay, so those tools silently did nothing in
 * split view — a feature-parity break (the founder's L-73 report). Two parallel maps
 * are a standing hazard: every new tool has to be added in two places or parity rots.
 *
 * Both overlays now build their handler map from `createPlanToolHandlers()`, so the
 * capability set is identical BY CONSTRUCTION and can never drift again. Each overlay
 * still gets its OWN fresh instances (state isolation — the split pane's in-progress
 * stroke/drag state must never alias the main pane's), so the factory returns a NEW
 * map on every call rather than a shared singleton.
 *
 * NOTE on element MOVE/DRAG (walls, hosted doors/windows, annotations, levels, grids):
 * that path is NOT owned by these tool handlers — it lives in `PlanViewInteraction`
 * (which drives the shared `planElementDragController` singleton) and is attached to
 * BOTH the main canvas (PlanViewManager) and the SVP canvas (SplitViewManager), so it
 * is already at parity across both surfaces. This registry unifies the CREATION/annotation
 * tool set; the interaction/drag layer is unified by the shared class + singleton.
 */

import { trace } from '@opentelemetry/api';
import type { PlanToolHandler } from './PlanToolHandler';

import { WallPlanToolHandler }         from './WallPlanToolHandler';
import { RoomPlanToolHandler }         from './RoomPlanToolHandler';
import { ColumnPlanToolHandler }       from './ColumnPlanToolHandler';
import { LinearDimPlanToolHandler }    from './LinearDimPlanToolHandler';
import { DoorPlanToolHandler }         from './DoorPlanToolHandler';
import { WindowPlanToolHandler }       from './WindowPlanToolHandler';
import { SlabPlanToolHandler }         from './SlabPlanToolHandler';
// §FIX-POOL-UNREACHABLE (L-5210) — the plan route that makes a swimming pool
// reachable. Registered after slab because a pool is CUT INTO one.
import { PoolPlanToolHandler }         from './PoolPlanToolHandler';
// §FEAT-BALCONY-COMPOUND (L-5605) — the plan route that makes a balcony reachable.
// Registered after slab because a balcony's plate IS a slab; the tool itself hosts on
// a WALL (C15), which is why it sits beside the door/window pair conceptually.
import { BalconyPlanToolHandler }      from './BalconyPlanToolHandler';
// §FIX-LIFT-UNREACHABLE (L-7020) — the plan route that makes the C104 lift COMPOUND
// reachable. Registered beside the stair because both are vertical circulation, and a
// lift is a placed footprint the way a column is: plan is its natural surface, which is
// exactly what `elementCreationMatrix` named as the matrix's highest-value open hole.
import { LiftPlanToolHandler }         from './LiftPlanToolHandler';
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7931) — the plan route that makes the AUTHORED
// construction / setting-out line reachable (C106). Registered beside the grid because
// both are SETTING-OUT geometry: an architect lays a scheme out against them before
// deciding what stands on them. ⛔ NOT the cadastral `Parcel.boundary` (C19 §1.4 —
// legal, surveyed, ONE-SHOT IMMUTABLE) and NOT `RoomBoundingLine`.
import { BoundaryLinePlanToolHandler } from './BoundaryLinePlanToolHandler';
import { StairPlanToolHandler }        from './StairPlanToolHandler';
import { StairPathPlanToolHandler }    from './StairPathPlanToolHandler';
import { BeamPlanToolHandler }         from './BeamPlanToolHandler';
import { RoofPlanToolHandler }         from './RoofPlanToolHandler';
import { CurtainWallPlanToolHandler }  from './CurtainWallPlanToolHandler';
import { CeilingPlanToolHandler }      from './CeilingPlanToolHandler';
import { FloorPlanToolHandler }        from './FloorPlanToolHandler';
import { RailingPlanToolHandler }      from './RailingPlanToolHandler';
import { FurniturePlanToolHandler }    from './FurniturePlanToolHandler';
import { LightingPlanToolHandler }     from './LightingPlanToolHandler';
import { PlumbingPlanToolHandler }     from './PlumbingPlanToolHandler';
// §BATH102 (L-11480) — the plan route that makes the C109 BATHROOM POD compound
// reachable. Registered beside the plumbing fixture tool because every member of a pod
// IS a plumbing fixture (C109 §2); the pod is the COMPOUND that arranges them. Putting
// it in this shared factory is what gives BOTH plan surfaces the tool at once (the
// L-73 parity guarantee) rather than only the main overlay — the L-1380 defect the
// lift's palette row had already committed once.
import { BathroomPodPlanToolHandler }  from './BathroomPodPlanToolHandler';
import { OpeningPlanToolHandler }      from './OpeningPlanToolHandler';
import { GridPlanToolHandler }         from './GridPlanToolHandler';
import { SectionPlanToolHandler }      from './SectionPlanToolHandler';
import { ElevationPlanToolHandler }    from './ElevationPlanToolHandler';
import { MovePlanToolHandler }         from './MovePlanToolHandler';
import { RotatePlanToolHandler }       from './RotatePlanToolHandler';
import { AlignPlanToolHandler }        from './AlignPlanToolHandler';
import { CopyPlanToolHandler }         from './CopyPlanToolHandler';
import {
    TextNotePlanToolHandler,
    ElementTagPlanToolHandler,
    DoorTagPlanToolHandler,
    WindowTagPlanToolHandler,
    AngularDimPlanToolHandler,
    RadiusDimPlanToolHandler,
    DiameterDimPlanToolHandler,
    SlopeDimPlanToolHandler,
    SpotElevationPlanToolHandler,
    KeynotePlanToolHandler,
    LevelTagPlanToolHandler,
    GridBubblePlanToolHandler,
    RevisionCloudPlanToolHandler,
    CalloutDetailPlanToolHandler,
    NorthArrowPlanToolHandler,
    ScaleBarPlanToolHandler,
    MatchlinePlanToolHandler,
} from './AnnotationPlanToolHandlers';

const _registryTracer = trace.getTracer('@pryzm/editor.plan-tool-registry', '0.1.0');

/** The canonical, ordered list of every plan-view tool key. */
export const PLAN_TOOL_KEYS = [
    'wall', 'room', 'column', 'linear-dim', 'door', 'window', 'slab', 'pool',
    'balcony', 'lift', 'boundary-line', 'stair',
    'stair-path', 'beam', 'roof', 'curtain-wall', 'ceiling', 'floor', 'railing',
    'furniture', 'lighting', 'plumbing', 'bathroom-pod', 'opening', 'grid', 'section-mark',
    'elevation-mark', 'move', 'rotate', 'align', 'copy-place', 'text-note', 'element-tag',
    'door-tag', 'window-tag', 'angular-dimension', 'radius-dimension',
    'diameter-dimension', 'slope-dimension', 'spot-elevation', 'keynote',
    'level-tag', 'grid-bubble', 'revision-cloud', 'callout-detail', 'north-arrow',
    'scale-bar', 'matchline',
] as const;

export type PlanToolKey = typeof PLAN_TOOL_KEYS[number];

/**
 * Build a fresh, complete map of plan-view tool handlers — the SAME capability set
 * for the main plan overlay and the split-view plan overlay (L-73 parity). Returns
 * new handler instances every call so the two surfaces never alias tool state.
 *
 * P8: emits `pryzm.plan_tools.create_handler_set` with the tool count.
 */
export function createPlanToolHandlers(): Record<string, PlanToolHandler> {
    return _registryTracer.startActiveSpan('pryzm.plan_tools.create_handler_set', (span) => {
        try {
            const handlers: Record<string, PlanToolHandler> = {
                'wall':               new WallPlanToolHandler(),
                'room':               new RoomPlanToolHandler(),
                'column':             new ColumnPlanToolHandler(),
                'linear-dim':         new LinearDimPlanToolHandler(),
                'door':               new DoorPlanToolHandler(),
                'window':             new WindowPlanToolHandler(),
                'slab':               new SlabPlanToolHandler(),
                // §FIX-POOL-UNREACHABLE (L-5210) — a pool is an ASSEMBLY cut INTO a
                // slab, so it sits next to the slab here. Registering it in this
                // shared factory is what gives BOTH plan surfaces the tool at once
                // (the L-73 parity guarantee) rather than only the main overlay.
                'pool':               new PoolPlanToolHandler(),
                // §FEAT-BALCONY-COMPOUND (L-5605) — a balcony is a COMPOUND hosted
                // on a wall, so it sits next to the slab it is built from. Registering
                // it in this shared factory is what gives BOTH plan surfaces the tool
                // at once (the L-73 parity guarantee) rather than only the main overlay.
                'balcony':            new BalconyPlanToolHandler(),
                // §FIX-LIFT-UNREACHABLE (L-7020) — a lift is VERTICAL CIRCULATION,
                // so it sits next to the stair. Registering it in this shared factory
                // is what gives BOTH plan surfaces the tool at once (the L-73 parity
                // guarantee) rather than only the main overlay — the L-1380 defect the
                // lift's palette row had already committed once, by landing on
                // `CreatePanelLayout` and not on `CreateRailPanel`.
                'lift':               new LiftPlanToolHandler(),
                // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7931) — the AUTHORED
                // setting-out line. Registering it in this shared factory is what
                // gives BOTH plan surfaces the tool at once (the L-73 parity
                // guarantee) rather than only the main overlay — the L-1380 defect
                // the lift's palette row had already committed once by landing on
                // `CreatePanelLayout` and not on `CreateRailPanel`.
                'boundary-line':      new BoundaryLinePlanToolHandler(),
                'stair':              new StairPlanToolHandler(),
                'stair-path':         new StairPathPlanToolHandler(),
                'beam':               new BeamPlanToolHandler(),
                'roof':               new RoofPlanToolHandler(),
                'curtain-wall':       new CurtainWallPlanToolHandler(),
                'ceiling':            new CeilingPlanToolHandler(),
                'floor':              new FloorPlanToolHandler(),
                'railing':            new RailingPlanToolHandler(),
                'furniture':          new FurniturePlanToolHandler(),
                'lighting':           new LightingPlanToolHandler(),
                'plumbing':           new PlumbingPlanToolHandler(),
                // §BATH102 (L-11480) — the C109 LOD-300 parametric bathroom module.
                // Beside the fixture tool because every member IS a plumbing fixture
                // (C109 §2); the pod is the compound that arranges them to the room.
                'bathroom-pod':       new BathroomPodPlanToolHandler(),
                'opening':            new OpeningPlanToolHandler(),
                'grid':               new GridPlanToolHandler(),
                'section-mark':       new SectionPlanToolHandler(),
                'elevation-mark':     new ElevationPlanToolHandler(),
                // ── Edit-in-place tools (Contracts 34 / 35) ──────────────────────────
                'move':               new MovePlanToolHandler(),
                // §FIX-PLAN-ROTATE-PARITY (L-267, Gate G7) — the plan view had a MOVE
                // tool but no ROTATE tool, for ANY element type. ContextualEditBar's
                // Rotate button and `R` key jumped straight to the 3-D gizmo, which is
                // inert while a plan surface is up: the control looked enabled and did
                // nothing. Registering it HERE (rather than teaching one element's tool
                // to rotate itself) means both the main plan overlay and the split-view
                // pane get it by construction — the L-73 parity guarantee.
                'rotate':             new RotatePlanToolHandler(),
                'align':              new AlignPlanToolHandler(),
                'copy-place':         new CopyPlanToolHandler(),
                // ── Annotation tools ─────────────────────────────────────────────────
                'text-note':          new TextNotePlanToolHandler(),
                'element-tag':        new ElementTagPlanToolHandler(),
                'door-tag':           new DoorTagPlanToolHandler(),
                'window-tag':         new WindowTagPlanToolHandler(),
                'angular-dimension':  new AngularDimPlanToolHandler(),
                'radius-dimension':   new RadiusDimPlanToolHandler(),
                'diameter-dimension': new DiameterDimPlanToolHandler(),
                'slope-dimension':    new SlopeDimPlanToolHandler(),
                'spot-elevation':     new SpotElevationPlanToolHandler(),
                'keynote':            new KeynotePlanToolHandler(),
                'level-tag':          new LevelTagPlanToolHandler(),
                'grid-bubble':        new GridBubblePlanToolHandler(),
                'revision-cloud':     new RevisionCloudPlanToolHandler(),
                'callout-detail':     new CalloutDetailPlanToolHandler(),
                // ── Sheet/annotation tools that used to be MAIN-only (L-73 gap) ───────
                'north-arrow':        new NorthArrowPlanToolHandler(),
                'scale-bar':          new ScaleBarPlanToolHandler(),
                'matchline':          new MatchlinePlanToolHandler(),
            };
            span.setAttribute('pryzm.plan_tools.count', Object.keys(handlers).length);
            return handlers;
        } catch (err) {
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}
