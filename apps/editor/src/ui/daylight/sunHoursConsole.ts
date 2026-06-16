// ADR-0074 P1b (C21 §10) — read-only sun-hours console command
// (`window.pryzmComputeSunHours()` + `window.pryzmClearSunHours()`).
//
// The thin editor wiring for the renderer-three solar sun-hours analysis pass.
// Mirrors `pryzmComputeDaylight` (daylightConsole.ts): resolves the active level +
// the site latitude, reaches the live THREE.Scene, and calls INTO renderer-three
// (the P2 single-THREE owner) which gathers the building's roof/slab + wall
// meshes, builds a three-mesh-bvh occluder, runs @pryzm/solar-analysis
// (generateSunSamples + accumulateSunHours) with a CPU-raycast occlusion oracle,
// and paints a TOGGLEABLE per-vertex heatmap. ADDITIVE + ISOLATED — it never
// mutates the normal render path. It console.logs a §DIAG-SUN-HOURS table.
//
// All THREE / geometry / raycast / material code lives in renderer-three; this
// file only orchestrates (resolve level + lat, find scene, log) so P2 holds.

import {
    computeSunHoursOnModel,
    clearSunHoursOverlay,
    type ComputeSunHoursOnModelResult,
} from '@pryzm/renderer-three';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';

/** Options accepted by `pryzmComputeSunHours` (all optional). */
export interface SunHoursConsoleOptions {
    /** Analysis day-of-year (1..366). Default: today (UTC). */
    dayOfYear?: number;
    /** Convenience presets — overrides dayOfYear when set. */
    season?: 'summer' | 'winter' | 'spring' | 'autumn';
    /** Minutes between sun samples. Default 15. */
    stepMinutes?: number;
    /** Surface sample spacing, metres. Default 0.75. */
    sampleSpacing?: number;
    /** Apply the heatmap overlay. Default true. */
    paint?: boolean;
}

// Northern-hemisphere convention solstice/equinox day-of-year (matches
// @pryzm/solar-analysis helpers; replicated here to avoid a second import).
const SEASON_DOY: Record<NonNullable<SunHoursConsoleOptions['season']>, number> = {
    spring: 79,  // ≈ Mar 20
    summer: 172, // ≈ Jun 21
    autumn: 265, // ≈ Sep 22
    winter: 355, // ≈ Dec 21
};

/** The live THREE.Scene, resolved from the known runtime access paths (mirrors
 *  BottomActionMenu / WardrobeCabinetTool). Returns null when not ready. */
function resolveScene(): unknown | null {
    const w = window as unknown as {
        world?: { scene?: { three?: unknown } };
        bimWorld?: { scene?: { three?: unknown } };
        selectionManager?: { world?: { scene?: { three?: unknown } } };
    };
    return (
        w.world?.scene?.three ??
        w.bimWorld?.scene?.three ??
        w.selectionManager?.world?.scene?.three ??
        null
    );
}

/** Resolve the site latitude/longitude (decimal degrees) for the sun path, or a
 *  UK-ish fallback when no real site location is pinned (same rule as daylight). */
function resolveSiteLatLng(): { lat: number; lng: number; source: 'site' | 'default' } {
    try {
        const origin = getCurrentSiteOrigin();
        if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
            return { lat: origin.lat, lng: origin.lon, source: 'site' };
        }
    } catch { /* fall through */ }
    return { lat: 51.5, lng: -0.12, source: 'default' };
}

/**
 * Run the read-only sun-hours pass on the active level + log a §DIAG-SUN-HOURS
 * table, applying the heatmap overlay. Returns the result (or null when there's no
 * active level / scene / building meshes). Never dispatches a command.
 */
export function computeSunHoursForActiveLevel(
    opts: SunHoursConsoleOptions = {},
): ComputeSunHoursOnModelResult | null {
    const level = resolveActiveLevel();
    if (!level?.id) {
        console.warn('[sun-hours] §DIAG-SUN-HOURS no active level — open a project first.');
        return null;
    }
    const scene = resolveScene();
    if (!scene) {
        console.warn('[sun-hours] §DIAG-SUN-HOURS scene not ready — no live THREE.Scene found on window.');
        return null;
    }
    const { lat, lng, source } = resolveSiteLatLng();
    const dayOfYear = opts.season ? SEASON_DOY[opts.season] : opts.dayOfYear;

    let res: ComputeSunHoursOnModelResult | null;
    try {
        res = computeSunHoursOnModel(scene as never, level.id, {
            latDeg: lat,
            lngDeg: lng,
            ...(dayOfYear != null ? { dayOfYear } : {}),
            ...(opts.stepMinutes != null ? { stepMinutes: opts.stepMinutes } : {}),
            ...(opts.sampleSpacing != null ? { sampleSpacing: opts.sampleSpacing } : {}),
            ...(opts.paint != null ? { paint: opts.paint } : {}),
        });
    } catch (e) {
        console.error('[sun-hours] §DIAG-SUN-HOURS pass threw:', e);
        return null;
    }

    if (!res) {
        console.warn('[sun-hours] §DIAG-SUN-HOURS no roof/slab/wall meshes on the active level — generate or build first.');
        return null;
    }

    const r = res.result;
    console.log(
        `[sun-hours] §DIAG-SUN-HOURS level=${level.id} surfaces=${res.meshCount} ` +
        `lat=${lat.toFixed(2)}° (${source}) sunSamples=${res.sunSampleCount} ` +
        `points=${res.samplePointCount} stepH=${r.stepHours.toFixed(3)} ` +
        `AVG=${r.avgSunHours.toFixed(2)}h MAX=${r.maxSunHours.toFixed(2)}h MIN=${r.minSunHours.toFixed(2)}h ` +
        `sunniest=${r.maxSurfaceId ?? '—'} shadiest=${r.minSurfaceId ?? '—'} painted=${res.painted}`,
    );
    for (const s of r.surfaces) {
        console.log(
            `[sun-hours] §DIAG-SUN-HOURS surface=${s.surfaceId} sunHours=${s.sunHours.toFixed(2)}h ` +
            `min=${s.minPointSunHours.toFixed(2)} max=${s.maxPointSunHours.toFixed(2)} pts=${s.samplePointCount}`,
        );
    }
    try {
        const rows = r.surfaces.map((s) => ({
            surface: s.surfaceId,
            sunHours: Number(s.sunHours.toFixed(2)),
            minH: Number(s.minPointSunHours.toFixed(2)),
            maxH: Number(s.maxPointSunHours.toFixed(2)),
            points: s.samplePointCount,
        }));
        (console as unknown as { table?: (d: unknown) => void }).table?.(rows);
    } catch { /* ignore */ }

    return res;
}

/** Remove the sun-hours heatmap overlay (restore original materials). */
export function clearSunHoursForScene(): number {
    const scene = resolveScene();
    if (!scene) {
        console.warn('[sun-hours] §DIAG-SUN-HOURS no live scene to clear.');
        return 0;
    }
    const n = clearSunHoursOverlay(scene as never);
    console.log(`[sun-hours] §DIAG-SUN-HOURS cleared overlay on ${n} mesh(es).`);
    return n;
}

declare global {
    interface Window {
        pryzmComputeSunHours?: (opts?: SunHoursConsoleOptions) => ComputeSunHoursOnModelResult | null;
        pryzmClearSunHours?: () => number;
    }
}

/** Install the read-only `window.pryzmComputeSunHours()` + `pryzmClearSunHours()`
 *  console commands. Idempotent + side-effect-free until invoked. */
export function installSunHoursConsole(): void {
    if (typeof window === 'undefined') return;
    window.pryzmComputeSunHours = (opts?: SunHoursConsoleOptions) => computeSunHoursForActiveLevel(opts);
    window.pryzmClearSunHours = () => clearSunHoursForScene();
    console.log('[sun-hours] §DIAG-SUN-HOURS console command ready — run pryzmComputeSunHours() to paint sun-hours on the active level; pryzmClearSunHours() to remove it.');
}
