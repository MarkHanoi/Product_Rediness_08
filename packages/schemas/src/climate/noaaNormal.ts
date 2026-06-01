// A.10.a (Phase A · Sprint 2) — NOAANormal schema (C21 §2.3).
//
// Monthly climate normal — 12 records per ClimateDataset (Jan..Dec).
// Present for BOTH `source: 'epw'` (derived from hourly) AND
// `source: 'noaa-normals'` (the primary payload for NOAA-sourced
// datasets). Per [C21 §1.8] unit conventions.

import { z } from 'zod';
import { MonthIndexSchema } from './types.js';

/**
 * Per [C21 §2.3] fields. Aggregates derived per month.
 */
export const NOAANormalSchema = z.object({
    /** 1..12, Jan..Dec. */
    month: MonthIndexSchema,
    /** Monthly mean dry-bulb (°C). */
    avgDryBulbC: z.number().min(-90).max(70),
    /** Mean daily min dry-bulb (°C). */
    avgMinDryBulbC: z.number().min(-90).max(70),
    /** Mean daily max dry-bulb (°C). */
    avgMaxDryBulbC: z.number().min(-90).max(70),
    /** Monthly mean relative humidity (%). */
    avgRelHumidityPct: z.number().min(0).max(110),
    /** Monthly total precipitation (mm). */
    avgPrecipMm: z.number().min(0).max(20000),
    /** Monthly mean wind speed (m/s). */
    avgWindSpeedMps: z.number().min(0).max(90),
    /** Prevailing wind direction (degrees, 0=N clockwise). */
    prevailingWindDirDeg: z.number().min(0).max(360),
    /** Monthly mean of daily global horizontal irradiance totals (W/m² mean). */
    avgGlobalHorizontalWm2: z.number().min(0).max(1500),
    /** Heating degree-days base 18°C (UK / ISO convention). */
    heatingDegreeDaysBase18: z.number().min(0).max(2000),
    /** Cooling degree-days base 18°C. */
    coolingDegreeDaysBase18: z.number().min(0).max(2000),
});
export type NOAANormal = z.infer<typeof NOAANormalSchema>;
