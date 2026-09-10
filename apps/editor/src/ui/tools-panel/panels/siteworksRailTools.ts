// siteworksRailTools — the three siteworks entries on the Master planning rail.
// C116 · ADR-0384 D7 / D8 · C82 · C16 CA-2 · P6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ C82 IS THE ACCEPTANCE BAR: 267 OF 280 TOOLBAR PAIRS WERE MEASURED SILENTLY DEAD
// ═══════════════════════════════════════════════════════════════════════════════
//
// So these entries do not "activate a mode" that nothing implements. Each one
// DISPATCHES `siteworks.batch.create` through the composed runtime's bus and puts a
// real, selectable, undoable, persisted surface into `runtime.stores.siteworks`.
// `siteworksRailToolsReachStore.test.ts` presses each of them and reads the record
// back OUT of the store — an entry that rendered and did nothing would fail there.
//
// ⚠ WHAT THESE BUTTONS DO **NOT** DO, STATED PLAINLY RATHER THAN IMPLIED: they do not
// yet let you DRAW the centreline. The founder asked for *"linear design — like a
// wall"*, and that is interactive polyline authoring, which this commit does not
// ship. Pressing Road places a surface at the plan origin on the active level with
// the CITED default width, and everything after that — width, thickness, role,
// delete, undo — is live.
//
// ⛔ AND THE REASON IT IS NOT SHIPPED HERE IS A MEASUREMENT, NOT A SHRUG.
// `apps/editor/src/engine/views/plantools/BoundaryLinePlanToolHandler.ts` is 549
// lines and ALREADY draws an ortho/curved/looping polyline with snapping. Writing a
// `SiteworksPlanToolHandler` beside it would be a SECOND polyline-stroke
// implementation — [[same-rule-two-implementations]], this repository's most-repeated
// defect, and the guarding test would stay green on whichever copy it happened to
// measure. The correct move is to EXTRACT the stroke from that handler and have both
// call it, which is a refactor of another lane's live tool and belongs in its own
// commit. Recorded as C116 §11.
//
// ⭐ UPDATE 2026-09-10 (lane ARRAY-ALONG-PATH, ADR-0386 D6) — A SECOND, RENDERER-FREE
// STROKE DRIVER NOW EXISTS AND IS MULTI-CONSUMER, BUT IT IS **NOT** THE SEAM THIS
// NOTE IS WAITING FOR. `apps/editor/src/ui/site/siteEnvelopeDrawArming.ts` strokes
// ortho / curved / looping polylines with the same `@pryzm/geometry-slab` rules and
// now serves TWO finish targets from ONE driver (`armEnvelopeDraw('perimeter' |
// 'array-path')`) — so the "one stroke, N consumers" pattern is proven and worth
// copying. ⛔ But it binds through `EnvelopeDrawSurface`, a port whose own header
// records that *"no Cesium or MapLibre adapter could ever satisfy"* `PlanToolHandler`'s
// canvas-typed draw context — and the inverse holds too: a PLAN-VIEW tool cannot
// consume that port either. Siteworks lives on the plan view, so C116 §11 still names
// the RIGHT extraction (`BoundaryLinePlanToolHandler`'s stroke) and it is still open.
// The lesson to carry across is the shape: extract the FINISH TARGET, not the machine.

import { createId } from '@pryzm/schemas';
import {
    SITEWORKS_DEFAULT_WIDTH_M,
    SITEWORKS_DEFAULT_THICKNESS_M,
    type SiteworksRole,
} from '@pryzm/schemas';
import { registerMasterPlanningTool } from './masterPlanningRailRegistry.js';

type Bus = { executeCommand: (type: string, payload: unknown) => Promise<unknown> };
type RuntimeLike = { bus?: Bus } | undefined;

/**
 * ⚠ AN UNRESOLVED LEVEL YIELDS `''`, WHICH IS THE SCHEMA'S OWN DEFAULT — never a
 * fabricated id. §CONTEXT-DATA-HONESTY (L-581/L-616): "we could not tell which storey
 * is active" and "the ground storey" must not share a value, and inventing `'L0'`
 * here would seat a road on a level that may not exist.
 */
function activeLevelId(): string {
    const ctx = (window as unknown as { projectContext?: { activeLevelId?: unknown } })
        .projectContext;
    const id = ctx?.activeLevelId;
    return typeof id === 'string' ? id : '';
}

function notify(message: string): void {
    const rt = (window as unknown as {
        runtime?: { toasts?: { show?: (m: string, k?: string, d?: number) => unknown } };
    }).runtime;
    try {
        if (typeof rt?.toasts?.show === 'function') { rt.toasts.show(message, 'error', 7000); return; }
    } catch { /* a toast that throws must never take the palette click with it */ }
    console.warn('[siteworks]', message);
}

/** The default LINEAR surface for a role: a 40 m run at the cited width. */
function linearSpec(role: SiteworksRole) {
    return {
        siteworksId: createId('siteworks'),
        levelId: activeLevelId(),
        role,
        form: 'linear' as const,
        centreline: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }],
        widthM: SITEWORKS_DEFAULT_WIDTH_M[role].valueM,
        boundary: [],
        holes: [],
        thickness: SITEWORKS_DEFAULT_THICKNESS_M.valueM,
    };
}

/** The default AREAL surface for a role: a 20 × 12 m rectangle. */
function arealSpec(role: SiteworksRole) {
    return {
        siteworksId: createId('siteworks'),
        levelId: activeLevelId(),
        role,
        form: 'areal' as const,
        centreline: [],
        boundary: [
            { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 },
            { x: 20, y: 0, z: 12 }, { x: 0, y: 0, z: 12 },
        ],
        holes: [],
        thickness: SITEWORKS_DEFAULT_THICKNESS_M.valueM,
    };
}

/**
 * ⭐ P6 — THE UI DISPATCHES, IT NEVER WRITES THE STORE. And the id is minted HERE, at
 * the tool entry, not inside the handler: `execute()` runs AGAIN on redo (C16 CA-2),
 * so an id minted in the handler would differ the second time and orphan every
 * reference that named the first.
 */
export async function placeSiteworks(
    runtime: RuntimeLike,
    spec: Record<string, unknown>,
    label: string,
): Promise<boolean> {
    const bus = runtime?.bus
        ?? (window as unknown as { runtime?: { bus?: Bus } }).runtime?.bus;
    if (!bus?.executeCommand) {
        // ⛔ LOUD, NEVER SILENT. A palette click that quietly does nothing is exactly
        // the C82 failure this file exists to avoid.
        notify(`${label} could not be created: the command bus is not available yet.`);
        return false;
    }
    try {
        await bus.executeCommand('siteworks.batch.create', { surfaces: [spec] });
        return true;
    } catch (e) {
        notify(`${label} could not be created: ${String((e as Error)?.message ?? e)}`);
        return false;
    }
}

/**
 * Register the three siteworks entries into the shared Master planning registry.
 *
 * ⭐ CALLED WITH THE RUNTIME, so the rail does not have to know how a siteworks
 * surface is made — the category stays a registry and this file stays the only place
 * that knows the family's verb, its defaults and its forms.
 */
export function registerSiteworksRailTools(getRuntime: () => RuntimeLike): void {
    registerMasterPlanningTool({
        key: 'siteworks.road',
        label: 'Road',
        icon: 'material-symbols:add-road-outline',
        action: () => { void placeSiteworks(getRuntime(), linearSpec('road'), 'Road'); },
    });
    registerMasterPlanningTool({
        key: 'siteworks.parking',
        label: 'Parking Area',
        icon: 'material-symbols:local-parking-outline',
        action: () => { void placeSiteworks(getRuntime(), arealSpec('parking'), 'Parking Area'); },
    });
    registerMasterPlanningTool({
        key: 'siteworks.pedestrian',
        label: 'Pedestrian Area',
        icon: 'material-symbols:directions-walk',
        action: () => {
            // ⭐ AREAL, not linear, and the choice is the founder's words rather than a
            // coin toss: *"pedestrian areas — working similar to Roads / slabs"*. An
            // AREA is the slab half. A footway drawn as a line is equally legal
            // (`form` is ORTHOGONAL to `role` — six combinations, all valid) and is
            // reached by changing the form, not by a fourth button.
            void placeSiteworks(getRuntime(), arealSpec('pedestrian'), 'Pedestrian Area');
        },
    });
}
