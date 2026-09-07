// §ENVELOPE-WALLS-FOLLOW — THE COMPOSITION ROOT. The only file that knows the real singletons.
// C80 · C114 §6a · P4 · P6 · P8.
//
// ⭐ IT IS SEPARATE FROM `spaceEnvelopeWallFollow.ts` FOR THE REASON THE `engine/consequence/`
// FAMILY IS: the behaviour must be drivable with no graph, no store and no runtime, or the C80
// decision cannot be tested at all. Every planner in that directory pairs with a `*Composition.ts`
// that reaches the singletons, and the services themselves are type-import-only and injectable
// (`wallDeletePlannerComposition.ts:56-73` is the pattern followed here). This file is that half.
//
// ⛔ THREE READS AND ONE DISPATCH — that is the entire surface:
//   1. `semanticGraphManager` → which walls came from this envelope, via the SAME reader
//      `designEnvelopeWallLink.ts` wrote them with. ⛔ Not a second query, not a re-derivation:
//      one producer and one reader, or the cascade moves walls the recorder never recorded
//      (C84 EI-9).
//   2. `wallStore` → each linked wall's CURRENT baseline, which is both the C80 evidence and the
//      `prevBaseLine` the cascade needs.
//   3. `runtime.events` → the one committed-face-move channel.
//   4. `runtime.bus` → `wall.cascadeBaseline`, the ONE mutation (P6).
//
// ⚠ EVERYTHING IS RESOLVED LAZILY, PER EVENT, AND NOTHING IS CAPTURED AT INSTALL TIME. A runtime
// reference threaded in at registration goes stale the moment the runtime is recomposed — project
// switch, backend swap, device-loss recovery — which is §L-545-SITE-CAPTURE, and §L-12916 is the
// same lesson learned again on a card that read a null runtime prop. `liveRuntime()` is a thunk
// for exactly that reason.
//
// P4 — no `(window as any)`: the runtime arrives as a thunk the CALLER supplies, and the two
// singletons are imported by name. P8 — a span per exported function.

import { trace } from '@opentelemetry/api';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { wallStore } from '@pryzm/geometry-wall';
import {
    readWallsDerivedFromEnvelope,
    type EnvelopeWallLinkGraph,
} from '../ui/site/designEnvelopeWallLink';
import {
    registerSpaceEnvelopeWallFollow,
    type SpaceEnvelopeWallFollowDeps,
    type SpaceEnvelopeWallFollowEvents,
} from './spaceEnvelopeWallFollow';
import type { WallFollowWallState } from './spaceEnvelopeWallFollowPlan';

const _tracer = trace.getTracer('pryzm.engine.spaceEnvelopeWallFollowComposition');

/** The narrowest runtime slice this needs. Structural — no runtime import, so no import cycle. */
export interface WallFollowRuntimeLike {
    readonly bus?: { executeCommand(name: string, payload: unknown): unknown } | undefined;
    readonly events?: SpaceEnvelopeWallFollowEvents | undefined;
}

/**
 * Build the production dependency bag.
 *
 * ⛔ `readLinks` PRESERVES `null`. `readWallsDerivedFromEnvelope` answers `null` for "the graph
 * could not be read" and `[]` for "this envelope produced no walls", and its own header explains
 * that collapsing the two is the §CONTEXT-DATA-HONESTY defect the product is written against. This
 * function passes the distinction through untouched rather than defaulting it away.
 */
export function createSpaceEnvelopeWallFollowDeps(
    liveRuntime: () => WallFollowRuntimeLike | null | undefined,
): SpaceEnvelopeWallFollowDeps {
    const span = _tracer.startSpan('pryzm.engine.createSpaceEnvelopeWallFollowDeps');
    try {
        return {
            readLinks: (spaceEnvelopeId: string) => readWallsDerivedFromEnvelope(
                semanticGraphManager as unknown as EnvelopeWallLinkGraph,
                spaceEnvelopeId,
            ),

            readWall: (wallId: string): WallFollowWallState | null => {
                // ⚠ A ROW IS NOT PROOF OF A WALL. `buildFromDesignExecutor.ts:26-33` measured that
                // undoing a wall batch leaves the link rows behind, pointing at ids the store no
                // longer holds — so `null` here is an ORDINARY outcome, not an error.
                const w = wallStore.getById(wallId);
                if (!w || !Array.isArray(w.baseLine) || w.baseLine.length !== 2) return null;
                const [a, b] = w.baseLine;
                if (!a || !b) return null;
                return {
                    wallId,
                    // Copied, never aliased: the planner must not be able to reach into the store's
                    // own record, and a frozen store object would make the copy mandatory anyway.
                    baseLine: [
                        { x: a.x, y: a.y, z: a.z },
                        { x: b.x, y: b.y, z: b.z },
                    ] as const,
                };
            },

            dispatch: (command: string, payload: unknown): unknown => {
                const bus = liveRuntime()?.bus;
                if (!bus || typeof bus.executeCommand !== 'function') {
                    // An admission about PRYZM's wiring, never a statement about the design.
                    console.error(
                        '[spaceEnvelopeWallFollow] no command bus — the walls were NOT moved. The '
                        + 'envelope face moved and the building did not follow it.',
                    );
                    return undefined;
                }
                return bus.executeCommand(command, payload);
            },

            notify: (message: string, severity: 'info' | 'warning' | 'error') => {
                const events = liveRuntime()?.events as
                    | { emit?: (name: string, payload: unknown) => void }
                    | undefined;
                try {
                    events?.emit?.('pryzm:toast', { message, severity });
                } catch (e) {
                    console.warn('[spaceEnvelopeWallFollow] could not surface a toast:', e);
                }
            },
        };
    } finally {
        span.end();
    }
}

/**
 * Install the cascade on the live runtime. Idempotent per process — a second call is refused, not
 * doubled.
 *
 * ⛔ A SECOND REGISTRATION WOULD DISPATCH THE CASCADE TWICE FOR ONE DRAG, which is two undo entries
 * for one gesture and, worse, a second cascade planned against a store the first one has already
 * moved: every wall would then read as `authored-since-generation` and STAY. The guard is here
 * rather than in the caller because `initTools` can run more than once across a project switch.
 */
let _installed = false;

export function installSpaceEnvelopeWallFollow(
    liveRuntime: () => WallFollowRuntimeLike | null | undefined,
): boolean {
    const span = _tracer.startSpan('pryzm.engine.installSpaceEnvelopeWallFollow');
    try {
        if (_installed) return false;
        const events = liveRuntime()?.events;
        if (!events || typeof events.on !== 'function') {
            // §AUTHORED-BUT-UNWIRED is the failure this log exists to prevent: without it, a
            // cascade that never installed is indistinguishable from one that never fires.
            console.warn(
                '[spaceEnvelopeWallFollow] the runtime has no event channel — walls will NOT follow '
                + 'the envelope this session.',
            );
            return false;
        }
        registerSpaceEnvelopeWallFollow(events, createSpaceEnvelopeWallFollowDeps(liveRuntime));
        _installed = true;
        console.log(
            '[spaceEnvelopeWallFollow] §ENVELOPE-WALLS-FOLLOW armed — a committed face drag now '
            + 'moves the walls PRYZM derived from that envelope, in ONE wall.cascadeBaseline.',
        );
        return true;
    } finally {
        span.end();
    }
}

/** Test-only reset of the idempotence latch. ⛔ Never called by production code. */
export function __resetSpaceEnvelopeWallFollowForTests(): void {
    _installed = false;
}
