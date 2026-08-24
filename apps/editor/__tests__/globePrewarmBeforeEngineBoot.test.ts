/**
 * §STARTUP-GLOBE-PREWARM (L-10560) — **the globe is BUILT before the engine boot, and the boot
 * ADOPTS it.**
 *
 * ── The defect these cases pin ───────────────────────────────────────────────
 * §STARTUP-EAGER-GLOBE (2026-08-10) already asked the boot to start the Cesium viewer "eagerly".
 * The flag was right; its only CONSUMER was `mountGISArea`, which is reached from `initUI` — the
 * LAST stage of `engineLauncher.bootstrap()`. On the founder's own §STARTUP-BUDGET run that read:
 *
 *     cesium:warm-start        +0ms     (the CHUNK is warm at 122 ms)
 *     globe:eager-init-start   +2633ms  (the VIEWER has not been constructed yet)
 *
 * — 2.5 seconds of `initScene → initBuilders → initTools → initBusHandlers → initDataPlatform`
 * that the onboarding globe uses none of, sitting in SERIES in front of it.
 *
 * ── Why these cases, and not a timing assertion ──────────────────────────────
 * A wall-clock assertion in a node vitest process would measure this machine, not the defect.
 * What is actually falsifiable — and what actually broke — is the WIRING:
 *
 *   1. the prewarm constructs + mounts EXACTLY ONE viewport, warm-hidden, before anything else;
 *   2. the consumer gets THAT instance, not a second one, even when it asks mid-flight;
 *   3. a consumer that asks when no prewarm ran gets `null` — the COLD path, which must survive,
 *      because a prewarm that silently became mandatory is the "built but unreachable" shape
 *      this repo has paid for fourteen times in one session (C82 §5.4);
 *   4. production actually CALLS both halves. A behavioural test of a module cannot tell you
 *      that anything invokes it — so the last block is SOURCE evidence and says so.
 *
 * ⛔ Case 3 is the one that matters most. It is the test that fails if someone "simplifies" the
 * adoption into `if (prewarmed) { … }` around the bridge/geocode/boundary wiring.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    prewarmGlobe,
    consumePrewarmedGlobe,
    isGlobePrewarmPending,
    requestEagerGlobeStart,
    consumeEagerGlobeStart,
    __resetEagerGlobeStart,
    type PrewarmedGlobe,
} from '../src/engine/eagerGlobeStart';

const REPO = resolve(__dirname, '../../..');

/**
 * A stand-in for `CesiumViewport` that records the ORDER of the calls the prewarm makes.
 *
 * ⚠ It is deliberately NOT free-form: `eagerGlobeStart.ts` exports
 * `REAL_GLOBE_SATISFIES_THE_SEAM`, a compile-time proof that the real `CesiumViewport` is
 * assignable to `PrewarmedGlobe`. So this double cannot be more capable than the subject — if
 * the real class loses a method, `tsc` fails at the module, not here.
 */
class FakeGlobe implements PrewarmedGlobe {
    static constructed = 0;
    readonly calls: string[] = [];
    private _mounted = false;
    constructor(
        readonly parent: HTMLElement,
        readonly runtimeAtConstruction: unknown,
        private readonly mountDelayMs = 0,
    ) {
        FakeGlobe.constructed += 1;
    }
    enterWarmHiddenState(): void { this.calls.push('enterWarmHiddenState'); }
    async mount(): Promise<void> {
        this.calls.push('mount:start');
        if (this.mountDelayMs > 0) await new Promise((r) => setTimeout(r, this.mountDelayMs));
        this._mounted = true;
        this.calls.push('mount:done');
    }
    setRuntime(): void { this.calls.push('setRuntime'); }
    getViewer(): unknown { return this._mounted ? { fake: 'viewer' } : null; }
    dispose(): void { this.calls.push('dispose'); }
}

/** A `#container`-shaped element. The real one is static in index.html. */
function fakeContainer(): HTMLElement {
    return { id: 'container' } as unknown as HTMLElement;
}

let created: FakeGlobe[] = [];
function loaderFor(mountDelayMs = 0) {
    return async () =>
        class extends FakeGlobe {
            constructor(parent: HTMLElement, runtime: unknown) {
                super(parent, runtime, mountDelayMs);
                created.push(this);
            }
        } as unknown as new (parent: HTMLElement, runtime: never) => PrewarmedGlobe;
}

beforeEach(() => {
    __resetEagerGlobeStart();
    FakeGlobe.constructed = 0;
    created = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    __resetEagerGlobeStart();
    vi.restoreAllMocks();
});

describe('§STARTUP-GLOBE-PREWARM — the prewarm builds the globe', () => {
    it('constructs, warm-hides, and mounts — in that order, exactly once', async () => {
        prewarmGlobe({ parent: fakeContainer(), runtime: null, loadViewportClass: loaderFor() });
        const globe = (await consumePrewarmedGlobe()) as FakeGlobe | null;

        expect(globe, 'the prewarm produced nothing').not.toBeNull();
        expect(FakeGlobe.constructed).toBe(1);
        // ⚠ Warm-hidden BEFORE mount is the whole reason this is faster than the old path: the
        // viewer must be created at real dimensions so base imagery streams during the boot. The
        // pre-§STARTUP-EAGER-GLOBE bug was a 0×0 (display:none) container at viewer creation.
        expect(globe!.calls).toEqual(['enterWarmHiddenState', 'mount:start', 'mount:done']);
    });

    it('is idempotent — a second call while one is in flight does NOT build a rival globe', async () => {
        const p = { parent: fakeContainer(), runtime: null, loadViewportClass: loaderFor(5) };
        prewarmGlobe(p);
        prewarmGlobe(p);
        prewarmGlobe(p);
        await consumePrewarmedGlobe();
        expect(FakeGlobe.constructed, 'more than one CesiumViewport in one #container').toBe(1);
    });

    it('AWAITS an in-flight prewarm rather than letting the consumer race it', async () => {
        prewarmGlobe({ parent: fakeContainer(), runtime: null, loadViewportClass: loaderFor(25) });
        // Consume immediately — the mount has certainly not finished yet.
        const globe = (await consumePrewarmedGlobe()) as FakeGlobe | null;
        expect(globe).not.toBeNull();
        // The point: what the boot receives is a FINISHED mount, not a half-built viewer.
        expect(globe!.calls).toContain('mount:done');
        expect(globe!.getViewer()).not.toBeNull();
    });

    it('hands the globe over exactly ONCE — a second consumer gets null, never a shared handoff', async () => {
        prewarmGlobe({ parent: fakeContainer(), runtime: null, loadViewportClass: loaderFor() });
        expect(await consumePrewarmedGlobe()).not.toBeNull();
        // A second `mountGISArea` in the same tab (or a second project open) must NOT be handed
        // the same instance a second time — that is how a viewport gets adopted twice.
        expect(await consumePrewarmedGlobe()).toBeNull();
        expect(isGlobePrewarmPending()).toBe(false);
    });
});

describe('§STARTUP-GLOBE-PREWARM — the COLD path survives, on every arm', () => {
    it('returns null when no prewarm was ever requested (a hub open / deep link)', async () => {
        // No `showOnboarding`, so no prewarm. `mountGISArea` must construct cold, exactly as
        // before this module existed. This is the case that keeps the change reversible.
        expect(await consumePrewarmedGlobe()).toBeNull();
        expect(isGlobePrewarmPending()).toBe(false);
    });

    it('returns null — and does NOT throw — when the viewport module fails to load', async () => {
        prewarmGlobe({
            parent: fakeContainer(),
            runtime: null,
            loadViewportClass: async () => { throw new Error('chunk 404'); },
        });
        expect(await consumePrewarmedGlobe()).toBeNull();
    });

    it('returns null — and does NOT throw — when mount() itself rejects', async () => {
        prewarmGlobe({
            parent: fakeContainer(),
            runtime: null,
            loadViewportClass: async () =>
                class implements PrewarmedGlobe {
                    enterWarmHiddenState(): void {}
                    async mount(): Promise<void> { throw new Error('WebGL context lost'); }
                    setRuntime(): void {}
                    getViewer(): unknown { return null; }
                    dispose(): void {}
                } as unknown as new (parent: HTMLElement, runtime: never) => PrewarmedGlobe,
        });
        expect(await consumePrewarmedGlobe()).toBeNull();
    });

    it('does nothing (and warns) when #container is not in the DOM yet', async () => {
        prewarmGlobe({ parent: null, runtime: null, loadViewportClass: loaderFor() });
        expect(FakeGlobe.constructed).toBe(0);
        expect(await consumePrewarmedGlobe()).toBeNull();
    });
});

describe('§STARTUP-EAGER-GLOBE — the round-1 flag is UNCHANGED by round 2', () => {
    it('still one-shot: requested once, consumed once, then false', () => {
        expect(consumeEagerGlobeStart()).toBe(false);
        requestEagerGlobeStart();
        expect(consumeEagerGlobeStart()).toBe(true);
        expect(consumeEagerGlobeStart()).toBe(false);
    });

    it('the flag and the prewarm are INDEPENDENT — consuming one does not consume the other', async () => {
        requestEagerGlobeStart();
        prewarmGlobe({ parent: fakeContainer(), runtime: null, loadViewportClass: loaderFor() });
        // `mountGISArea` reads the flag at wiring time and the prewarm inside
        // `ensureGisInitialized`; neither may cancel the other.
        expect(consumeEagerGlobeStart()).toBe(true);
        expect(await consumePrewarmedGlobe()).not.toBeNull();
    });
});

describe('§STARTUP-GLOBE-PREWARM — production REACHES both halves (source evidence)', () => {
    /** Reads a repo file, failing loudly if the path has rotted. */
    function read(rel: string): string {
        const abs = resolve(REPO, rel);
        expect(existsSync(abs), `${rel} not found — fix the path, do not delete the check`).toBe(true);
        return readFileSync(abs, 'utf8');
    }

    it('PlatformRouter.showOnboarding starts the prewarm', () => {
        const src = read('apps/editor/src/ui/platform/PlatformRouter.ts');
        const at = src.indexOf('showOnboarding(seed?:');
        expect(at, 'showOnboarding was renamed — repoint this check').toBeGreaterThan(-1);
        const body = src.slice(at, at + 4000);
        expect(
            body.includes('prewarmGlobe('),
            'prewarmGlobe is imported but not CALLED from showOnboarding — the globe is back ' +
            'behind the engine boot (L-10560 has regressed)',
        ).toBe(true);
        // It must be handed the real container, not a placeholder.
        expect(body.includes("document.getElementById('container')")).toBe(true);
    });

    it('GISAreaLayout.ensureGisInitialized adopts the prewarmed viewport', () => {
        const src = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
        const at = src.indexOf('const ensureGisInitialized =');
        expect(at, 'ensureGisInitialized was renamed — repoint this check').toBeGreaterThan(-1);
        const body = src.slice(at, at + 6000);
        expect(
            body.includes('await consumePrewarmedGlobe()'),
            'the boot no longer adopts the prewarmed globe — it will construct a SECOND one',
        ).toBe(true);
    });

    it('⛔ the adoption does NOT branch around the bridge / geocode / boundary wiring', () => {
        // THE regression this whole change could plausibly cause. `bridge`, `geocodeBox` and
        // `boundaryTool` are created AFTER the mount, inside the same block. If a future edit
        // returns early on the prewarmed arm, the globe appears and every site-authoring surface
        // is silently missing — "deferred ≠ optional", the exact shape this session met fourteen
        // times. Pin that all three still follow the adoption in source order.
        const src = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
        const adopt = src.indexOf('await consumePrewarmedGlobe()');
        expect(adopt).toBeGreaterThan(-1);
        for (const wire of ['new CesiumThreeBridge(', 'mountSiteGeocodeSearchBox({', 'new SiteBoundaryDrawTool({']) {
            const at = src.indexOf(wire, adopt);
            expect(at, `${wire} no longer follows the adoption — is it still reached?`).toBeGreaterThan(adopt);
        }
        // And the readiness gate every caller of `pryzmGetSiteEntryCameraHostReady` awaits.
        expect(src.indexOf('_resolveCameraHostReady?.();', adopt)).toBeGreaterThan(adopt);
    });

    it('the engine boot names its own stages, so the next 2.5-second hole is not a guess', () => {
        const src = read('apps/editor/src/engine/engineLauncher.ts');
        for (const phase of [
            'boot:engine-start',
            'boot:scene-done',
            'boot:builders-done',
            'boot:tools-done',
            'boot:bus-handlers-done',
            'boot:data-platform-done',
            'boot:ui-done',
        ]) {
            expect(src.includes(`markStartupPhase('${phase}')`), `${phase} mark is missing`).toBe(true);
        }
    });
});
