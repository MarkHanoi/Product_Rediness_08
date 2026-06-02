// A.10.a (Phase A · Sprint 2) — SolarSample shape (C21 §2.4).
//
// Per [C21 §1.3] solar samples are COMPUTED AT QUERY TIME, never stored
// (cheap to recompute, would bloat the dataset, would drift if the
// algorithm version bumps). This schema validates the COMPUTED RESULT
// shape — used by the L2 SolarPathReader (A.10.c) for output validation
// in tests.

import { z } from 'zod';

/**
 * Per [C21 §2.4] fields.
 */
export const SolarSampleSchema = z.object({
    /** UTC ISO 8601 timestamp of the sample. */
    utcIso: z.string().datetime(),
    /** Altitude above horizon, in RADIANS. Negative = below horizon (night). */
    altitudeRad: z.number().min(-Math.PI / 2).max(Math.PI / 2),
    /** Azimuth in RADIANS, clockwise from N. */
    azimuthRad: z.number().min(-Math.PI).max(2 * Math.PI),
    /** Convenience flag — true iff the sun is above the horizon. */
    isAboveHorizon: z.boolean(),
    /** Closed-form estimate of direct normal irradiance (W/m²) from
     *  altitude alone (no cloud / aerosol model). Useful as a baseline
     *  for shading studies when no measured DNI is available. */
    approxDirectWm2: z.number().min(0).max(1500),
});
export type SolarSample = z.infer<typeof SolarSampleSchema>;
