// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — unit tests for the SINGLE
// SOURCE OF TRUTH store. The founder's de-dup: two panels, ONE store, so Sun/Shadow/Wind
// can never diverge, and every setter emits the SAME runtime-bus event the panels emitted
// before (so the renderer wiring is untouched). We inject the emit target to pin payloads
// headlessly, and turn off the sharedRenderingState persistence side-effect.

import { describe, it, expect } from 'vitest';
import {
    EnvironmentAnalysisStore,
    DEFAULT_ENVIRONMENT_STATE,
} from '../src/engine/views/environmentAnalysisStore';

function makeStore() {
    const events: Array<{ event: string; payload: unknown }> = [];
    const store = new EnvironmentAnalysisStore({
        emit: (event, payload) => events.push({ event, payload }),
        persist: false,
    });
    return { store, events };
}

describe('§L-625 EnvironmentAnalysisStore — the shared environment single source of truth', () => {
    it('starts at the declared defaults', () => {
        const { store } = makeStore();
        expect(store.getState()).toEqual(DEFAULT_ENVIRONMENT_STATE);
    });

    it('setSunTime updates state AND emits the SAME event the panels emitted (pryzm-set-sun-time)', () => {
        const { store, events } = makeStore();
        store.setSunTime(9.5, 'view-properties');
        expect(store.getState().sun.timeHours).toBe(9.5);
        expect(events).toContainEqual({ event: 'pryzm-set-sun-time', payload: { hours: 9.5 } });
    });

    it('setSunOffsets(real+offset) emits offsets only — no legacy direction/intensity', () => {
        const { store, events } = makeStore();
        store.setSunOffsets({ azimuthDeg: 30, elevationDeg: 10 });
        expect(store.getState().sun.azimuthDeg).toBe(30);
        expect(events.some((e) => e.event === 'pryzm-set-sun-offsets')).toBe(true);
        // real+offset mode must NOT drive the legacy OBC light (would fight the key light).
        expect(events.some((e) => e.event === 'pryzm-set-sun-direction')).toBe(false);
    });

    it('setSunOffsets(manual) ALSO drives the legacy OBC direction + intensity', () => {
        const { store, events } = makeStore();
        store.setSunMode('manual');
        events.length = 0;
        store.setSunOffsets({ azimuthDeg: 90, elevationDeg: 0, intensity: 1.5 });
        expect(events.some((e) => e.event === 'pryzm-set-sun-direction')).toBe(true);
        expect(events.some((e) => e.event === 'pryzm-set-sun-intensity')).toBe(true);
    });

    it('setShadowCast / setGroundShadows emit the existing toggle events', () => {
        const { store, events } = makeStore();
        store.setShadowCast(false);
        store.setGroundShadows(false);
        expect(store.getState().shadows).toEqual({ cast: false, ground: false });
        expect(events).toContainEqual({ event: 'pryzm-toggle-shadows', payload: { enabled: false } });
        expect(events).toContainEqual({ event: 'pryzm-toggle-ground-shadows', payload: { enabled: false } });
    });

    it('setWind / setClimate / setPopulation emit the F.events.14 payload shapes', () => {
        const { store, events } = makeStore();
        store.setWind({ directionDeg: 180, speedMs: 7 });
        store.setClimate({ temperatureC: 28, humidityPct: 40 });
        store.setPopulation(55);
        expect(events).toContainEqual({ event: 'pryzm-set-wind', payload: { direction: 180, speed: 7 } });
        expect(events).toContainEqual({ event: 'pryzm-set-climate', payload: { temperature: 28, humidity: 40 } });
        expect(events).toContainEqual({ event: 'pryzm-set-population-density', payload: { density: 55 } });
    });

    it('notifies subscribers on every change — the cross-panel live sync', () => {
        const { store } = makeStore();
        const seen: number[] = [];
        const off = store.subscribe((s) => seen.push(s.wind.directionDeg));
        store.setWind({ directionDeg: 45 });
        store.setWind({ directionDeg: 90 });
        off();
        store.setWind({ directionDeg: 135 });
        expect(seen).toEqual([45, 90]); // stopped notifying after unsubscribe
    });

    it('partial setters do not clobber sibling fields (single-source integrity)', () => {
        const { store } = makeStore();
        store.setWind({ directionDeg: 200 });
        store.setWind({ speedMs: 12 });
        expect(store.getState().wind).toEqual({ directionDeg: 200, speedMs: 12 });
    });

    it('a value set by one origin is the SAME value every reader sees (no divergent copy)', () => {
        // Model the de-dup: "site-analysis" publishes the sun time; "view-properties" reads it.
        const { store } = makeStore();
        store.setSunTime(6.25, 'site-analysis');
        expect(store.getState().sun.timeHours).toBe(6.25);
    });
});
