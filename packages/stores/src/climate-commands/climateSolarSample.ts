// A.10.e (Phase A · Sprint 2) — `climate.solarSample` command handler.
//
// Per [C21 §4.1] + §1.3: solar samples are computed at query time, never
// stored. Pure compute via `solarSample` from @pryzm/climate-host.

import { solarSample as computeSolarSample } from '@pryzm/climate-host';
import type { ClimateStore } from '../ClimateStore.js';
import {
    ClimateSolarSamplePayloadSchema,
    type ClimateCommandResult,
    type ClimateSolarSampledEvent,
} from './types.js';

/**
 * Compute a solar sample. The `store` parameter is accepted for
 * signature consistency with the other climate commands but unused —
 * solar samples are derived solely from (lat, lon, utcIso) per §1.3.
 */
export function climateSolarSample(
    rawPayload: unknown,
    _store: ClimateStore,
): ClimateCommandResult<ClimateSolarSampledEvent> {
    let payload;
    try {
        payload = ClimateSolarSamplePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.solarSample payload invalid: ${(err as Error).message}`,
        };
    }
    try {
        const sample = computeSolarSample(
            payload.lat,
            payload.lon,
            payload.utcIso,
        );
        return {
            ok: true,
            event: { type: 'climate.solar-sampled', sample },
        };
    } catch (err) {
        // RangeError from solarSample (out-of-range lat/lon/utcIso) —
        // wrap as invalid-payload so the UI surfaces it uniformly.
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `climate.solarSample compute failed: ${(err as Error).message}`,
        };
    }
}
