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
 * So the shared definition lives here, with a TYPE-ONLY dependency and no runtime imports
 * at all. `CreateLightingCommand` re-exports it, so the public surface is unchanged.
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

import type { LightingData } from '@pryzm/geometry-lighting';

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
    const out: Record<string, unknown> = {};
    if (!src) return out as LightingAuthoredParams;
    for (const k of LIGHTING_AUTHORED_PARAM_KEYS) {
        const v = (src as Record<string, unknown>)[k];
        if (v !== undefined) out[k] = v;
    }
    return out as LightingAuthoredParams;
}
