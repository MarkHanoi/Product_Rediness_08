/**
 * lightingAuthoredParams.ts
 *
 * §PERSIST-LIGHTING-PARAMS (F1, 2026-08-18) — the ONE list of `LightingData` keys that
 * carry AUTHORED state rather than identity or placement, plus the picker that moves them
 * between a serialised record and a create payload.
 *
 * ## Why this is its own module
 *
 * Both sides of the lighting round-trip need it: `CreateLightingCommand` (which writes the
 * fields onto the DTO) and `projectLoaderUtils` (which reads them off the snapshot). The
 * latter is deliberately a PURE helper module — its header at :13 forbids pulling "the
 * command's heavy geometry/barrel graph" in, because its unit tests run without standing
 * up the runtime. Importing the picker from `CreateLightingCommand` would have dragged
 * `@pryzm/geometry-lighting`, `@pryzm/core-app-model`, `@pryzm/event-bus` and the seating
 * resolver into that module graph and broken exactly that property.
 *
 * So the shared definition lives here, with a TYPE-ONLY dependency on `LightingData`.
 * `CreateLightingCommand` re-exports it, so the public surface is unchanged.
 *
 * ⚠ AMENDED 2026-08-30 (P8 / C10 §2). This paragraph used to end "and no runtime imports
 * at all"; there is now exactly ONE — `@opentelemetry/api`. It is the API-only package
 * (no SDK, no exporter, no transitive runtime graph) and is already a direct dependency
 * of `@pryzm/command-registry`. The property the paragraph exists to protect — that
 * `projectLoaderUtils`' unit tests do not have to stand up `@pryzm/geometry-lighting`,
 * `@pryzm/core-app-model`, `@pryzm/event-bus` and the seating resolver — is unchanged.
 * ⛔ Do not read this as licence to add a second runtime import; the ban on the heavy
 * geometry/barrel graph stands exactly as written.
 *
 * ## What was wrong
 *
 * `LightingData` holds the user's authored geometry in 12 mutually-exclusive parametric
 * blocks (one per `fixtureType`) plus an `emission` override. `ProjectSerializer` wrote all
 * 13 — it maps each fixture through `deepStrip`, which rebuilds plain objects key by key —
 * but `CreateLightingPayload` had no slot for any of them, so BOTH restore paths rebuilt
 * fixtures from 9 fields. The values sat in the file and were discarded on read: a 7-lamp
 * pendant cluster reopened as 3, a dimmed fixture reopened at full brightness.
 *
 * Keeping the list in one place means a 13th parametric family added to `LightingData`
 * is restored by construction rather than silently dropped — which is how this arose.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { LightingData } from '@pryzm/geometry-lighting';

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper).
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/**
 * Every `LightingData` key holding authored state. Identity (`id`, `type`), placement
 * (`position`, `rotation`, `levelId`) and bindings (`roomId`, `hostId`, `tags`,
 * `properties`) are deliberately NOT here — the payload already carries those explicitly.
 */
export const LIGHTING_AUTHORED_PARAM_KEYS = [
    'downlightParams', 'pendantParams', 'linearLedParams', 'pendantPebbleParams',
    'pendantCeramicBellParams', 'pendantConicalParams', 'floorWoodPostParams',
    'floorArcBrassParams', 'tableTerracottaParams', 'floorTripodBlackParams',
    'mirrorLightParams', 'pendantClusterParams', 'emission',
    // §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — ONE key for all TWENTY new
    // LOD-200 families, deliberately.
    //
    // The twelve named families each brought their own `*Params` block, which is
    // why this list is twelve entries long and why the load path could drop one.
    // Twenty more blocks would have been twenty more chances to repeat exactly the
    // defect this module was created to fix. At LOD 200 the catalogue row IS the
    // specification, so the only per-instance state is a generic size/drop/aim
    // override — one block, one key, and the round-trip through
    // `ImportProjectCommand` covers all twenty by construction.
    'lod200Params',
] as const;

/** The authored-state slice of `LightingData`; every member is optional there and here. */
export type LightingAuthoredParams =
    Pick<LightingData, (typeof LIGHTING_AUTHORED_PARAM_KEYS)[number]>;

/**
 * Copy across only the authored blocks the source actually has.
 *
 * Absent keys are OMITTED rather than copied as an explicit `undefined`, so a fixture that
 * authored nothing yields `{}` and can never write `emission: undefined` over a live value
 * when spread onto a DTO — absence stays absence (C03 §3.4, additive-optional).
 */
export function pickAuthoredLightingParams(
    src: Partial<LightingAuthoredParams> | null | undefined,
): LightingAuthoredParams {
    return _tracer().startActiveSpan('pryzm.lighting.pickAuthoredParams', (span) => {
        try {
            const out: Record<string, unknown> = {};
            // ABSENT SOURCE AND EMPTY SOURCE ARE DIFFERENT FACTS and are emitted
            // separately. This module exists because authored blocks were being
            // dropped on the round-trip; a trace that printed only "0 keys
            // carried" could not distinguish "this fixture authored nothing"
            // from "the snapshot never reached the picker".
            span.setAttribute('pryzm.lighting.srcPresent', Boolean(src));
            if (src) {
                for (const k of LIGHTING_AUTHORED_PARAM_KEYS) {
                    const v = (src as Record<string, unknown>)[k];
                    if (v !== undefined) out[k] = v;
                }
            }
            span.setAttribute('pryzm.lighting.authoredKeys', Object.keys(out).length);
            span.setAttribute('pryzm.lighting.knownKeys', LIGHTING_AUTHORED_PARAM_KEYS.length);
            return out as LightingAuthoredParams;
        } finally {
            span.end();
        }
    });
}
