// A.10.a (Phase A · Sprint 2) — DesignTemperatures + DegreeDayAggregates (C21 §2.6).
//
// The design-point summary every HVAC / energy workflow consumes
// without scanning the full 8760-hour EPW record. Per ASHRAE 99 % / 1 %
// convention; degree-days at both ISO (18°C) and US (65°F) bases.

import { z } from 'zod';

/**
 * Per [C21 §2.6] — the ASHRAE design-point dry-bulb temperatures plus
 * coincident wet-bulb.
 */
export const DesignTemperaturesSchema = z.object({
    /** ASHRAE 99.6 % heating design dry-bulb (the coldest typical design point, °C). */
    heating99_6C: z.number().min(-90).max(40),
    /** ASHRAE 0.4 % cooling design dry-bulb (the hottest typical design point, °C). */
    cooling0_4C: z.number().min(-20).max(70),
    /** Mean coincident wet-bulb at the 0.4 % cooling point (°C). */
    cooling0_4MwbC: z.number().min(-20).max(50),
});
export type DesignTemperatures = z.infer<typeof DesignTemperaturesSchema>;

/**
 * Annual heating + cooling degree-day aggregates. Both ISO (base 18°C)
 * and US (base 65°F ≈ 18.3°C) bases are retained so consumers in either
 * regulatory regime have a ready value.
 */
export const DegreeDayAggregatesSchema = z.object({
    /** Heating degree-days base 18 °C (UK / ISO convention). */
    hddBase18: z.number().min(0).max(20000),
    /** Cooling degree-days base 18 °C. */
    cddBase18: z.number().min(0).max(20000),
    /** Heating degree-days base 65 °F (≈ 18.3 °C) for US-convention consumers. */
    hddBase65F: z.number().min(0).max(20000),
    /** Cooling degree-days base 65 °F. */
    cddBase65F: z.number().min(0).max(20000),
});
export type DegreeDayAggregates = z.infer<typeof DegreeDayAggregatesSchema>;
