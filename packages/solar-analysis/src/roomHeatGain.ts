// §10.10 — Solar HEAT GAIN per-room thermal rollup ("real heat").
//
// The founder's "real heat" (not just sun POSITION / sun-HOURS): how much solar thermal load
// actually enters EACH ROOM. This is the C21 §10.10 derived rollup over §10.4 surface irradiance
// (or, on a fallback climate tier, §10.3 geometric sun-hours) × the room's glazing inventory:
//
//   Q_solar(R) = Σ_g [ I_inc(g) · A_g · SHGC_g ]                      (per glazing element g in room R)
//
// where SHGC is a glazing MATERIAL property read from the model (NOT a climate field), so climate
// ownership (C21) stays clean. PURE L2 (§10.6): THREE-free, DOM-free, I/O-free, deterministic — no
// GPU resource. Two tiers (§10.10.2):
//   • 'absolute-kwh'   — when a per-surface irradiance map (kWh/m² over the window) is injected
//                        (the §10.4 output); reports absolute kWh.
//   • 'relative-index' — the fallback when no irradiance is available: a per-room index from
//                        sun-hours × glazed area × SHGC, comparable ACROSS rooms but not absolute.

import type { SunHoursResult } from './types.js';

/** Conservative default SHGC when a glazing element carries none (§10.10.2 — visible defaulting:
 *  the result counts how many elements were defaulted). 0.5 sits between clear (~0.7) and low-E
 *  (~0.35) double glazing — a defensible mid value, never silently applied. */
export const DEFAULT_SHGC = 0.5;

/** One glazing element hosted in a room's exterior wall. `surfaceId` links to a `SolarSurface`
 *  (and thus a `SurfaceSunHours` / an injected irradiance entry). */
export interface RoomGlazingElement {
    readonly surfaceId: string;
    /** Glazed area, m². */
    readonly glazedAreaM2: number;
    /** Solar-heat-gain coefficient (0..1) — a glazing material property. Omitted ⇒ DEFAULT_SHGC. */
    readonly shgc?: number;
}

/** A room and the glazing elements that admit solar gain into it. */
export interface RoomGlazing {
    readonly roomId: string;
    readonly glazing: ReadonlyArray<RoomGlazingElement>;
}

export interface RoomHeatGain {
    readonly roomId: string;
    /** Tier of this room's figure ('absolute-kwh' or 'relative-index'). */
    readonly mode: 'absolute-kwh' | 'relative-index';
    /** Relative gain index (Σ sunHours·area·SHGC) — always present, comparable across rooms. */
    readonly gainIndex: number;
    /** Absolute solar heat gain over the analysis window, kWh — present ONLY in 'absolute-kwh' mode. */
    readonly absoluteKwh?: number;
    /** Number of glazing elements that contributed. */
    readonly glazingCount: number;
    /** How many of this room's glazing elements used DEFAULT_SHGC (visible defaulting, §10.10.2). */
    readonly defaultedShgcCount: number;
}

export interface RoomHeatGainResult {
    /** Per-room results, input order preserved. */
    readonly rooms: ReadonlyArray<RoomHeatGain>;
    /** The tier the run resolved to (absolute when an irradiance map was injected, else relative). */
    readonly mode: 'absolute-kwh' | 'relative-index';
    /** AVG / MAX / MIN of the per-room PRIMARY figure (absoluteKwh in absolute mode, else gainIndex). */
    readonly avgGain: number;
    readonly maxGain: number;
    readonly minGain: number;
    readonly maxRoomId?: string;
    readonly minRoomId?: string;
}

export interface RoomHeatGainOptions {
    /** §10.4 per-surface irradiance over the analysis window, kWh/m², keyed by surfaceId. When
     *  provided the run reports ABSOLUTE kWh; when absent it degrades to the RELATIVE index (§10.10.2). */
    readonly irradianceKwhPerM2BySurface?: ReadonlyMap<string, number>;
    /** Override the conservative DEFAULT_SHGC for elements that carry none. */
    readonly defaultShgc?: number;
}

/**
 * §10.10 — roll surface sun-hours (and optional irradiance) up into per-room solar heat gain.
 * Pure + deterministic: same inputs ⇒ byte-identical output. Surfaces named by a room's glazing
 * but absent from `sunHours` contribute 0 (a glazing with no sun-hours admits no gain). A room with
 * no glazing yields a 0 gain (e.g. an interior room) — still listed so the per-room readout is total.
 */
export function accumulateRoomHeatGain(
    sunHours: SunHoursResult,
    rooms: ReadonlyArray<RoomGlazing>,
    opts: RoomHeatGainOptions = {},
): RoomHeatGainResult {
    const defaultShgc = opts.defaultShgc ?? DEFAULT_SHGC;
    const irradiance = opts.irradianceKwhPerM2BySurface;
    const mode: 'absolute-kwh' | 'relative-index' = irradiance ? 'absolute-kwh' : 'relative-index';

    const sunHoursBySurface = new Map<string, number>();
    for (const s of sunHours.surfaces) sunHoursBySurface.set(s.surfaceId, s.sunHours);

    const out: RoomHeatGain[] = rooms.map(room => {
        let gainIndex = 0;
        let absoluteKwh = 0;
        let defaultedShgcCount = 0;
        for (const g of room.glazing) {
            const shgc = g.shgc ?? defaultShgc;
            if (g.shgc === undefined) defaultedShgcCount++;
            const sh = sunHoursBySurface.get(g.surfaceId) ?? 0;
            gainIndex += sh * g.glazedAreaM2 * shgc;
            if (irradiance) {
                const irr = irradiance.get(g.surfaceId) ?? 0;     // kWh/m² over the window
                absoluteKwh += irr * g.glazedAreaM2 * shgc;        // kWh
            }
        }
        return {
            roomId: room.roomId,
            mode,
            gainIndex,
            ...(irradiance ? { absoluteKwh } : {}),
            glazingCount: room.glazing.length,
            defaultedShgcCount,
        };
    });

    // AVG / MAX / MIN over the PRIMARY figure for this tier.
    const primary = (r: RoomHeatGain): number => (mode === 'absolute-kwh' ? (r.absoluteKwh ?? 0) : r.gainIndex);
    let avgGain = 0, maxGain = 0, minGain = 0;
    let maxRoomId: string | undefined, minRoomId: string | undefined;
    if (out.length > 0) {
        let sum = 0, mx = -Infinity, mn = Infinity;
        for (const r of out) {
            const v = primary(r);
            sum += v;
            if (v > mx) { mx = v; maxRoomId = r.roomId; }
            if (v < mn) { mn = v; minRoomId = r.roomId; }
        }
        avgGain = sum / out.length;
        maxGain = mx;
        minGain = mn;
    }

    return { rooms: out, mode, avgGain, maxGain, minGain, maxRoomId, minRoomId };
}
