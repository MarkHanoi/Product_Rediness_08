// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — the SINGLE SOURCE OF TRUTH for
// the shared analysis environment (Sun · Shadow · Wind · Climate · Population).
//
// WHY THIS EXISTS (the founder's de-dup ask, verbatim): "right now Site Analysis and
// VIEW PROPERTIES repeat Sun/Shadow/Wind; sometimes the information is even repeated
// across panels … Sun/Shadow/Wind must have a SINGLE SOURCE OF TRUTH, not repeated
// between the Site Analysis panel and the VIEW PROPERTIES panel."
//
// Before this store, each panel held its OWN private copy of the sun angle, the shadow
// toggles and the wind vector, each wired its own `pryzm-set-*` event, and the two could
// silently diverge — exactly the "several mutually-unaware owners" disease C59 §0 exists
// to cure, applied to environment state instead of pane layout. This module is the ONE
// owner: both panels read from it, write through it, and subscribe to it, so a sun change
// in the View Properties panel is the SAME value the Site Analysis panel shows, and vice
// versa. `viewPropertyModel.ts` marks precisely these properties `sharedEnvironment:true`.
//
// SHAPE (mirrors `PaneLayoutStore`): a typed state + typed setters (the only write path)
// + `subscribe`. Every setter (a) updates state, (b) emits the SAME runtime-bus event the
// panels emitted before (so `RealEnvironmentService` / the Cesium sun wiring are UNTOUCHED
// — this is a de-dup of OWNERSHIP, not a rewrite of the renderer path), (c) persists the
// overlapping fields into `sharedRenderingState` so a panel rebuild restores them, and
// (d) notifies subscribers.
//
// P3 (single rAF): nothing here schedules a frame. P4 (no `window as any`): the emit
// target is the typed `window.runtime?.events` bus, injectable for tests. P8: not a
// CommandBus handler (the OTel-span gate scopes to `plugins/*/src/handlers/`); it is a
// view-state store, same category as `PaneLayoutStore` and `sharedRenderingState`.

import { setSharedPostProcessing } from '@pryzm/core-app-model/rendering';

export type SunMode = 'real+offset' | 'manual';

export interface EnvironmentAnalysisState {
    readonly sun: {
        /** REAL ephemeris + offset, or MANUAL absolute (legacy studio key). */
        readonly mode: SunMode;
        /** Time-of-day the real sun is solved for (0–24, decimal hours). */
        readonly timeHours: number;
        /** Azimuth: OFFSET(°) in real+offset, ABSOLUTE(°) in manual. */
        readonly azimuthDeg: number;
        /** Elevation: OFFSET(°) in real+offset, ABSOLUTE(°) in manual. */
        readonly elevationDeg: number;
        /** Intensity: MULTIPLIER in real+offset, ABSOLUTE(0–2) in manual. */
        readonly intensity: number;
    };
    readonly shadows: {
        readonly cast: boolean;
        readonly ground: boolean;
    };
    readonly wind: {
        readonly directionDeg: number; // 0 = North
        readonly speedMs: number;
    };
    readonly climate: {
        readonly temperatureC: number;
        readonly humidityPct: number;
    };
    readonly population: {
        readonly densityPerHa: number;
    };
}

export const DEFAULT_ENVIRONMENT_STATE: EnvironmentAnalysisState = {
    sun: { mode: 'real+offset', timeHours: 12, azimuthDeg: 0, elevationDeg: 0, intensity: 1.0 },
    shadows: { cast: true, ground: true },
    wind: { directionDeg: 0, speedMs: 3 },
    climate: { temperatureC: 20, humidityPct: 50 },
    population: { densityPerHa: 0 },
};

/** The runtime event-bus emit signature (typed; the real one is `window.runtime.events`). */
export type EnvironmentEmit = (event: string, payload: unknown) => void;

export type EnvironmentListener = (state: EnvironmentAnalysisState) => void;

/** The origin of a change — lets a subscriber ignore its own writes if it wants to. */
export type EnvironmentChangeOrigin = 'view-properties' | 'site-analysis' | 'system';

export interface EnvironmentAnalysisStoreOptions {
    readonly initial?: EnvironmentAnalysisState;
    /** Override the emit target (tests). Defaults to the `window.runtime.events` bus. */
    readonly emit?: EnvironmentEmit | null;
    /** Skip the `sharedRenderingState` persistence side-effect (pure tests). */
    readonly persist?: boolean;
}

/** Default emit: the typed runtime event bus (same channel the panels used directly). */
function defaultEmit(event: string, payload: unknown): void {
    try {
        window.runtime?.events?.emit(event, payload as never);
    } catch {
        /* no runtime bus yet (early boot / headless) — the state still updates + notifies */
    }
}

/**
 * The single source of truth for the shared analysis environment. One app-wide instance
 * (`environmentAnalysisStore`); panels subscribe + dispatch. Nothing else may move these
 * values.
 */
export class EnvironmentAnalysisStore {
    private _state: EnvironmentAnalysisState;
    private readonly listeners = new Set<EnvironmentListener>();
    private readonly emit: EnvironmentEmit;
    private readonly persist: boolean;

    constructor(opts: EnvironmentAnalysisStoreOptions = {}) {
        this._state = opts.initial ?? DEFAULT_ENVIRONMENT_STATE;
        this.emit = opts.emit ?? defaultEmit;
        this.persist = opts.persist ?? true;
    }

    /** Immutable snapshot of the current shared environment. */
    getState(): EnvironmentAnalysisState {
        return this._state;
    }

    /** Subscribe to environment changes. Returns the disposer. */
    subscribe(listener: EnvironmentListener): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    // ── Setters (the ONLY write path) ─────────────────────────────────────────

    /** REAL(ephemeris)+offset vs MANUAL(absolute). Re-emits sun so the engine re-solves. */
    setSunMode(mode: SunMode, origin: EnvironmentChangeOrigin = 'system'): void {
        this._state = { ...this._state, sun: { ...this._state.sun, mode } };
        this.emit('pryzm-set-sun-mode', { mode });
        if (this.persist) setSharedPostProcessing({ sunMode: mode });
        // Re-emit the current sun so the engine re-solves in the new mode (parity with
        // the old ViewPropertiesSection mode-toggle handler).
        this.emitSunDirection();
        this.emitSunIntensity();
        this.notify(origin);
    }

    /** Time-of-day (0–24) — drives the real-sun ephemeris. */
    setSunTime(timeHours: number, origin: EnvironmentChangeOrigin = 'system'): void {
        this._state = { ...this._state, sun: { ...this._state.sun, timeHours } };
        this.emit('pryzm-set-sun-time', { hours: timeHours });
        this.notify(origin);
    }

    /** Sun azimuth / elevation / intensity (offsets in real+offset, absolute in manual). */
    setSunOffsets(
        next: { azimuthDeg?: number; elevationDeg?: number; intensity?: number },
        origin: EnvironmentChangeOrigin = 'system',
    ): void {
        const sun = { ...this._state.sun };
        if (next.azimuthDeg !== undefined) sun.azimuthDeg = next.azimuthDeg;
        if (next.elevationDeg !== undefined) sun.elevationDeg = next.elevationDeg;
        if (next.intensity !== undefined) sun.intensity = next.intensity;
        this._state = { ...this._state, sun };
        if (next.azimuthDeg !== undefined || next.elevationDeg !== undefined) this.emitSunDirection();
        if (next.intensity !== undefined) this.emitSunIntensity();
        this.notify(origin);
    }

    setShadowCast(cast: boolean, origin: EnvironmentChangeOrigin = 'system'): void {
        this._state = { ...this._state, shadows: { ...this._state.shadows, cast } };
        this.emit('pryzm-toggle-shadows', { enabled: cast });
        this.notify(origin);
    }

    setGroundShadows(ground: boolean, origin: EnvironmentChangeOrigin = 'system'): void {
        this._state = { ...this._state, shadows: { ...this._state.shadows, ground } };
        this.emit('pryzm-toggle-ground-shadows', { enabled: ground });
        if (this.persist) setSharedPostProcessing({ groundShadows: ground });
        this.notify(origin);
    }

    setWind(
        next: { directionDeg?: number; speedMs?: number },
        origin: EnvironmentChangeOrigin = 'system',
    ): void {
        const wind = { ...this._state.wind };
        if (next.directionDeg !== undefined) wind.directionDeg = next.directionDeg;
        if (next.speedMs !== undefined) wind.speedMs = next.speedMs;
        this._state = { ...this._state, wind };
        this.emit('pryzm-set-wind', { direction: wind.directionDeg, speed: wind.speedMs });
        this.notify(origin);
    }

    setClimate(
        next: { temperatureC?: number; humidityPct?: number },
        origin: EnvironmentChangeOrigin = 'system',
    ): void {
        const climate = { ...this._state.climate };
        if (next.temperatureC !== undefined) climate.temperatureC = next.temperatureC;
        if (next.humidityPct !== undefined) climate.humidityPct = next.humidityPct;
        this._state = { ...this._state, climate };
        this.emit('pryzm-set-climate', { temperature: climate.temperatureC, humidity: climate.humidityPct });
        this.notify(origin);
    }

    setPopulation(densityPerHa: number, origin: EnvironmentChangeOrigin = 'system'): void {
        this._state = { ...this._state, population: { densityPerHa } };
        this.emit('pryzm-set-population-density', { density: densityPerHa });
        this.notify(origin);
    }

    // ── internals ──────────────────────────────────────────────────────────────

    /**
     * Emit the sun DIRECTION. Primary path: azimuth/elevation to `RealEnvironmentService`
     * as offsets (real+offset) or absolutes (manual). In MANUAL mode also nudge the legacy
     * OBC light with the resolved vector — the identical logic that used to live in
     * `ViewPropertiesSection._applySunDirection`, moved here so it has ONE home.
     */
    private emitSunDirection(): void {
        const { mode, azimuthDeg, elevationDeg } = this._state.sun;
        this.emit('pryzm-set-sun-offsets', { azimuthDeg, elevationDeg });
        if (mode === 'manual') {
            const azRad = (azimuthDeg * Math.PI) / 180;
            const elRad = (elevationDeg * Math.PI) / 180;
            const x = Math.sin(azRad) * Math.cos(elRad);
            const y = Math.sin(elRad);
            const z = Math.cos(azRad) * Math.cos(elRad);
            this.emit('pryzm-set-sun-direction', { x, y, z });
        }
    }

    private emitSunIntensity(): void {
        const { mode, intensity } = this._state.sun;
        this.emit('pryzm-set-sun-offsets', { intensity });
        if (mode === 'manual') this.emit('pryzm-set-sun-intensity', { intensity });
    }

    private notify(_origin: EnvironmentChangeOrigin): void {
        for (const l of [...this.listeners]) {
            try { l(this._state); } catch (e) { console.warn('[environment-analysis] listener threw:', e); }
        }
    }
}

/**
 * The ONE app-wide shared-environment store. Import this from both the View Properties
 * panel and the Site Analysis panel; never hold a second private copy of a value it owns.
 */
export const environmentAnalysisStore = new EnvironmentAnalysisStore();
