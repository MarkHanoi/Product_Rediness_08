// §STARTUP-NAME-WHILE-IT-LOADS — THE LOAD-BEARING ORDERING PROOF (L-13109, lane STARTUP-PROVE, 2026-09-07).
//
// ⭐ WHAT THIS FILE EXISTS FOR, AND WHY IT IS A SECOND FILE.
// `startupProjectNameCard.spec.ts` pins the CARD. It cannot pin the one claim the whole feature
// rests on, because that claim is about two things the card deliberately cannot see: the context
// warm and the reveal. The founder's ask was *"add straight after a new modal asking for the name
// of the project — like that gives you time — then you load barcelona split view straight away"*.
// The time is only bought if THE LOAD IS ALREADY RUNNING WHEN THE CARD GOES UP. If dismissing the
// card is what starts it, wall-clock gets WORSE and only the perception moves.
//
// ⛔ THE TEST THIS REPLACES COULD NOT HAVE FAILED, AND THAT IS THE DEFECT THIS FILE FIXES.
// `startupProjectNameCard.spec.ts` carried a case named *"the background load has ALREADY STARTED
// before the card can be committed"* whose body was:
//
//     const order: string[] = [];
//     order.push('context-warm:start');
//     order.push('reveal:kicked-off');
//     showStartupProjectNameCard({ ... onCommit: () => { order.push('name:commit'); } });
//     expect(order.indexOf('context-warm:start')).toBeLessThan(committedAt);
//
// The two strings it compares are pushed BY THE TEST, two lines apart, with no production code
// between them. It asserts that a literal pushed first has a lower index than a literal pushed
// third. It would print PASS with the card wired as a hard gate, with `warmContextCache` deleted,
// or with `GlobeHeroSearch` deleted — it is the "check that runs, passes, and could never have
// failed" shape (§COMMITTED-IS-NOT-REACHABLE, §L-851). It has been removed, not weakened.
//
// ⭐ WHAT REPLACES IT: the REAL `GlobeHeroSearch`, driving the REAL stage chain, with the ports
// wired in the SAME shape `OnboardingStepController.renderLocationStep()` wires them — a
// `warmContextCache` that starts a load and holds its promise, an `onParcelArrival` that kicks off
// the reveal and THEN raises the REAL card. Nothing about the ordering is stated by this file; it
// is OBSERVED, from a controllable warm whose settlement the test can place in time.
//
// ⭐ THE ARM THAT ACTUALLY FALSIFIES (`the warm SETTLES while the card is still open`): the test
// resolves the warm without touching the card, and requires that it settled with the card still
// mounted and uncommitted. A card that gated the load could not pass that: the warm would still be
// pending. Proven falsifiable by mutation before commit — see §MUTATION PROOF at the foot of this
// file.
//
// ARM B is a SOURCE-level read of `OnboardingStepController.ts`'s own `onParcelArrival` body,
// because Arm A drives the ports through fakes and therefore cannot see a reorder in the
// PRODUCTION wiring. Two arms, two failure modes, neither redundant.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobeHeroSearch } from '../GlobeHeroSearch';
import { showStartupProjectNameCard, dismissStartupProjectNameCard } from '../startupProjectNameCard';

const CARD = '#pryzm-startup-name-card';
const card = (): HTMLElement | null => document.querySelector(CARD);
const nameInput = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('[data-testid="startup-project-name-input"]');

/** A promise whose settlement the test places in time — the whole point of the ordering arm. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; settled: () => boolean } {
    let done = false;
    let res!: (v: T) => void;
    const promise = new Promise<T>((r) => { res = r; });
    return {
        promise,
        resolve: (v: T) => { done = true; res(v); },
        settled: () => done,
    };
}

/** A camera host that records every flight the stage chain asks for. Flights resolve instantly —
 *  the DESCENT is pinned by its own arm below, not by making the test wait on it. */
function recordingCameraHost(): { host: { flyToGeographic: (t: unknown) => Promise<void> }; flights: unknown[] } {
    const flights: unknown[] = [];
    return {
        flights,
        host: {
            flyToGeographic: (t: unknown) => { flights.push(t); return Promise.resolve(); },
        },
    };
}

/**
 * The production wiring, reproduced port-for-port from `OnboardingStepController.renderLocationStep()`:
 *   `warmContextCache` → start the load, HOLD the promise (`this.contextWarm`), never await it here.
 *   `onParcelArrival`  → kick off the reveal (`this.revealInFlight = this.revealSplitAtParcel(...)`),
 *                        THEN raise the card, fire-and-forget.
 * ⚠ The ORDER of those two statements inside `onParcelArrival` is the production claim, and Arm B
 * reads it out of the real file rather than trusting this reconstruction.
 */
function wireLikeTheController(opts?: { onCommit?: (n: string) => void }): {
    hero: GlobeHeroSearch;
    marks: string[];
    warm: ReturnType<typeof deferred<string>>;
    reveal: ReturnType<typeof deferred<void>>;
    flights: unknown[];
    committed: string[];
} {
    const marks: string[] = [];
    const warm = deferred<string>();
    const reveal = deferred<void>();
    const committed: string[] = [];
    const { host, flights } = recordingCameraHost();

    const hero = new GlobeHeroSearch({
        toggleGlobe: () => { marks.push('globe:toggle'); },
        getCameraHost: () => host,
        entries: [],
        geocode: async () => [{
            lat: 41.3874, lon: 2.1686,
            displayName: 'Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España',
            bbox: [2.05, 41.32, 2.23, 41.47] as [number, number, number, number],
        }],
        warmContextCache: () => {
            // `markStartupPhase('context-warm:start')` — then the read is STARTED and its promise
            // held, exactly as `this.contextWarm = fetchContextBuildingsNearAndFar(...)` does.
            marks.push('context-warm:start');
            void warm.promise.then(() => { marks.push('context-warm:done'); });
        },
        onParcelArrival: (picked) => {
            marks.push('flight:parcel-arrival');
            // `this.revealInFlight = this.revealSplitAtParcel({...})` — kicked off, not awaited.
            marks.push('reveal:kicked-off');
            void reveal.promise.then(() => { marks.push('reveal:split-mounted'); });
            // ...and ONLY THEN the card.
            marks.push('name-card:raised');
            showStartupProjectNameCard({
                defaultName: picked.address.split(',')[0]!.trim(),
                onCommit: (n) => { marks.push('name:commit'); committed.push(n); opts?.onCommit?.(n); },
            });
        },
    });
    return { hero, marks, warm, reveal, flights, committed };
}

beforeEach(() => {
    dismissStartupProjectNameCard();
    document.body.innerHTML = '';
});
afterEach(() => {
    dismissStartupProjectNameCard();
});

describe('§STARTUP-NAME-WHILE-IT-LOADS — the warm/load STARTS BEFORE the card resolves', () => {
    it('the context warm has ALREADY STARTED by the time the card is in the DOM', async () => {
        const { hero, marks } = wireLikeTheController();
        await hero.search('Barcelona');

        // Observed from the real chain, not pushed by the test: `warmContextCache` fires at the
        // `city` stage, `onParcelArrival` at `parcel`.
        expect(marks).toContain('context-warm:start');
        expect(card()).not.toBeNull();
        expect(marks.indexOf('context-warm:start')).toBeLessThan(marks.indexOf('name-card:raised'));
        // ...and the reveal too — the card is raised AFTER the split mount is already in flight.
        expect(marks.indexOf('reveal:kicked-off')).toBeLessThan(marks.indexOf('name-card:raised'));
    });

    it('⭐ THE FALSIFYING ARM — the warm SETTLES while the card is still open and uncommitted', async () => {
        const { hero, marks, warm } = wireLikeTheController();
        await hero.search('Barcelona');

        // The user is still typing. Nothing has been committed.
        expect(card()).not.toBeNull();
        expect(marks).not.toContain('name:commit');
        expect(warm.settled()).toBe(false);

        // The load finishes ON ITS OWN. Nothing touches the card.
        warm.resolve('15775 footprints');
        await warm.promise;
        await Promise.resolve();

        // ⛔ THIS IS THE INVARIANT. A card that GATED the load could not reach this line: the warm
        // would still be pending, because its resolution would be waiting on a commit that has not
        // happened. The card is still up, still uncommitted, and the load is DONE.
        expect(marks).toContain('context-warm:done');
        expect(marks.indexOf('context-warm:done')).toBeGreaterThan(marks.indexOf('name-card:raised'));
        expect(marks).not.toContain('name:commit');
        expect(card()).not.toBeNull();
    });

    it('the SPLIT MOUNT also completes while the card is open — the reveal is not gated either', async () => {
        const { hero, marks, reveal } = wireLikeTheController();
        await hero.search('Barcelona');

        reveal.resolve();
        await reveal.promise;
        await Promise.resolve();

        expect(marks).toContain('reveal:split-mounted');
        expect(marks).not.toContain('name:commit');
        expect(card()).not.toBeNull();
    });

    it('committing the card starts NOTHING — the load is already done by then', async () => {
        const { hero, marks, warm, reveal, committed } = wireLikeTheController();
        await hero.search('Barcelona');
        warm.resolve('15775 footprints');
        reveal.resolve();
        await Promise.all([warm.promise, reveal.promise]);
        await Promise.resolve();

        nameInput()!.value = 'Sagrada tower';
        nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(committed).toEqual(['Sagrada tower']);
        // Both halves of the load finished BEFORE the commit — the card bought the window, it did
        // not open it.
        expect(marks.indexOf('context-warm:done')).toBeLessThan(marks.indexOf('name:commit'));
        expect(marks.indexOf('reveal:split-mounted')).toBeLessThan(marks.indexOf('name:commit'));
    });
});

describe('§STARTUP-SLOW-DESCENT — the descent is NOT paused while the card is up', () => {
    it('the whole world→parcel chain has already flown before the card exists', async () => {
        const { hero, flights, marks } = wireLikeTheController();
        await hero.search('Barcelona');

        // ⭐ The founder asked for the slow zoom specifically so he could WATCH it. Every camera
        // target the stage chain produces was issued BEFORE the card was raised; the card knows
        // nothing about the camera and cannot re-time it.
        expect(flights.length).toBeGreaterThan(0);
        expect(marks).toContain('name-card:raised');
        const before = flights.length;

        // Dismissing the card must not move the camera either — no resume, no catch-up flight.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Promise.resolve();
        expect(flights.length).toBe(before);
    });

    it('paints no backdrop over the globe — the card is the ONLY node added to the body', async () => {
        const { hero } = wireLikeTheController();
        await hero.search('Barcelona');
        expect(document.body.children.length).toBe(1);
        expect(document.body.children[0]?.id).toBe('pryzm-startup-name-card');
    });
});

describe('§STARTUP-NAME-CARD — the load winning the race must NOT yank the field', () => {
    it('is still mounted, still focused-editable, with the typed text intact, after everything lands', async () => {
        const { hero, warm, reveal } = wireLikeTheController();
        await hero.search('Barcelona');

        nameInput()!.value = 'Half-typed nam';

        warm.resolve('15775 footprints');
        reveal.resolve();
        await Promise.all([warm.promise, reveal.promise]);
        await Promise.resolve();

        // ⚠ Yanking a focused text field out from under a cursor is worse than the wait it saves.
        expect(card()).not.toBeNull();
        expect(nameInput()!.value).toBe('Half-typed nam');
    });
});

describe('§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942) — on the REAL startup path', () => {
    it('Escape commits the geocoded default and closes, mid-load', async () => {
        const { hero, committed } = wireLikeTheController();
        await hero.search('Barcelona');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(committed).toEqual(['Barcelona']);
        expect(card()).toBeNull();
    });

    it('Enter commits what was typed and closes, mid-load', async () => {
        const { hero, committed } = wireLikeTheController();
        await hero.search('Barcelona');
        nameInput()!.value = '  Sagrada tower  ';
        nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(committed).toEqual(['Sagrada tower']);
        expect(card()).toBeNull();
    });

    it('a rename that THROWS still closes the card — a failed write never strands him on it', async () => {
        const { hero } = wireLikeTheController({
            onCommit: () => { throw new Error('rename failed: 500 from persistence.client.rename'); },
        });
        await hero.search('Barcelona');
        expect(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }).not.toThrow();
        expect(card()).toBeNull();
    });

    it('a rename that REJECTS ASYNCHRONOUSLY still closes the card', async () => {
        const rejected = vi.fn(() => Promise.reject(new Error('rename rejected')));
        const { hero } = wireLikeTheController({ onCommit: () => { void rejected().catch(() => {}); } });
        await hero.search('Barcelona');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Promise.resolve();
        expect(card()).toBeNull();
        expect(rejected).toHaveBeenCalledTimes(1);
    });
});

// ── ARM B — the PRODUCTION wiring, read out of the real file ──────────────────────────────────
//
// ⚠ WHY A SOURCE READ RATHER THAN AN IMPORT. `OnboardingStepController.ts` builds DOM at import
// time and pulls in the whole editor graph; the module's own header records that this is why
// `GlobeHeroSearch` was extracted DOM-free in the first place. Arm A therefore drives the ports
// through a faithful reconstruction — which by construction cannot see a reorder in the real file.
// This arm can. It is narrow on purpose: it reads ONE function body and asserts the ORDER of two
// statements and the absence of an `await`.

const CONTROLLER_SRC = resolve(__dirname, '..', 'OnboardingStepController.ts');

/** The body of the `onParcelArrival: (picked) => { … }` arrow in the real controller. */
function onParcelArrivalBody(src: string): string {
    const start = src.indexOf('onParcelArrival: (picked) => {');
    expect(start, 'onParcelArrival must still be wired in OnboardingStepController').toBeGreaterThan(-1);
    // Brace-match from the arrow's opening `{` so a nested block cannot truncate the body.
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    throw new Error('unbalanced onParcelArrival body');
}

describe('ARM B — the production statement order in OnboardingStepController.onParcelArrival', () => {
    const src = readFileSync(CONTROLLER_SRC, 'utf8');
    const body = onParcelArrivalBody(src);

    it('kicks off revealSplitAtParcel BEFORE raising the name card', () => {
        const reveal = body.indexOf('this.revealSplitAtParcel(');
        const cardCall = body.indexOf('showStartupProjectNameCard(');
        expect(reveal).toBeGreaterThan(-1);
        expect(cardCall).toBeGreaterThan(-1);
        // ⛔ If these ever swap, the card is raised before the load is kicked off and the founder's
        // "that gives you time" is a lie in the one direction that costs him wall-clock.
        expect(reveal).toBeLessThan(cardCall);
    });

    it('never awaits the card — no loader can be made to wait on it', () => {
        expect(body).not.toMatch(/await\s+showStartupProjectNameCard/);
        // `onParcelArrival` itself is declared `=> void` and GlobeHeroSearch does not await it.
        expect(body).not.toMatch(/return\s+showStartupProjectNameCard/);
    });

    it('the warm is started in warmContextCache, one stage EARLIER than the card', () => {
        const warmStart = src.indexOf("markStartupPhase('context-warm:start')");
        const cardCall = src.indexOf('showStartupProjectNameCard(', src.indexOf('onParcelArrival: (picked) => {'));
        expect(warmStart).toBeGreaterThan(-1);
        expect(cardCall).toBeGreaterThan(-1);
        // `warmContextCache` fires at the `city` stage, `onParcelArrival` at `parcel`
        // (GlobeHeroSearch.descendAndHandOff) — Arm A observes that at runtime; this pins that the
        // warm is still wired to a port that fires earlier, not folded into the arrival handler.
        expect(src).toMatch(/warmContextCache:\s*\(lat, lon\)\s*=>\s*\{/);
        expect(warmStart).toBeLessThan(cardCall);
    });

    it('commits the name through applyProjectName — the REAL persistence.client.rename write', () => {
        expect(body).toMatch(/this\.applyProjectName\(name\)/);
        // Best-effort BY CONTRACT: `void`-ed with a `.catch`, so a failed rename cannot reject into
        // the arrival handler, and cannot strand him on the card.
        expect(body).toMatch(/void this\.applyProjectName\(name\)[\s\S]{0,200}?\.catch\(/);
        expect(src).toMatch(/private async applyProjectName\([\s\S]{0,900}?client\.rename\(projectId, name\)/);
    });
});

// ── §MUTATION PROOF (lane STARTUP-PROVE, 2026-09-07) ──────────────────────────────────────────
//
// A spec that pins an ordering is worth exactly as much as the evidence that it CAN go red. Both
// falsifying arms were mutated before this file was committed, and both failed:
//
//   1. `wireLikeTheController` changed so `onParcelArrival` raised the card and resolved the warm
//      from `onCommit` (the "card gates the load" shape the founder's design is arranged against)
//      → `⭐ THE FALSIFYING ARM` FAILED on `expect(marks).toContain('context-warm:done')`.
//   2. The two statements in the REAL `OnboardingStepController.onParcelArrival` swapped
//      (card raised before `this.revealSplitAtParcel(...)`)
//      → ARM B `kicks off revealSplitAtParcel BEFORE raising the name card` FAILED.
//
// Both mutations were reverted. ⛔ Do not "simplify" either arm into a comparison between two
// strings the test itself pushed — that is precisely the shape this file replaced.
