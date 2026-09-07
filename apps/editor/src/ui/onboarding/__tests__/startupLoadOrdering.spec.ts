// §STARTUP-LOAD-ORDERING — THE LOAD STARTS ON THE GEOCODE, NOT ON A UI EVENT
// (L-13109 → re-pointed by L-13173, lane NAME-CARD-OUT, 2026-09-07).
//
// ⭐ WHY THIS FILE WAS RE-POINTED RATHER THAN DELETED, AND WHY THAT WAS A CHOICE.
// It shipped as `startupNameCardLoadOrdering.spec.ts` and pinned ONE claim: the context warm and
// the reveal are already running when the "Name your project" card goes up, so the card buys the
// wait instead of causing it. §STARTUP-NAME-FROM-LOCATION (L-13173) deleted that card at the
// founder's request. ⛔ Left as it was, every arm would still have printed PASS while asserting
// things about a module that no longer exists — and a spec that can no longer fail is worse than a
// deleted one (§COMMITTED-IS-NOT-REACHABLE, §L-851). The card was never the subject, though; it was
// the thing the subject had to survive. **The subject is: nothing between the geocode and the
// site.** That claim got STRONGER when the card went, so the file keeps its arms and changes what
// they observe:
//
//   was → the load runs WHILE a card is up and is not gated by it
//   is  → the load runs with NOTHING up at all, and no user event exists that could gate it
//
// ⭐ THE FALSIFYING ARM IS NOW A CENSUS OF THE BODY. `the split loads with an EMPTY screen` fails
// the moment anything is appended between the geocode and the reveal — which is exactly how the
// deleted card would come back, whatever it were called. That is the arm to keep honest.
//
// ARM B is a SOURCE-level read of `OnboardingStepController.ts`, because Arm A drives the ports
// through fakes and by construction cannot see a reorder — or a re-added card — in the PRODUCTION
// wiring. Two arms, two failure modes, neither redundant.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobeHeroSearch } from '../GlobeHeroSearch';
import { startupProjectName } from '../startupProjectName';

/** A promise whose settlement the test places in time — the whole point of the ordering arm. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; settled: () => boolean } {
    let done = false;
    let res!: (v: T) => void;
    const promise = new Promise<T>((r) => { res = r; });
    return { promise, resolve: (v: T) => { done = true; res(v); }, settled: () => done };
}

/** A camera host that records every flight the stage chain asks for. Flights resolve instantly —
 *  the DESCENT is pinned by its own arm below, not by making the test wait on it. */
function recordingCameraHost(): { host: { flyToGeographic: (t: unknown) => Promise<void> }; flights: unknown[] } {
    const flights: unknown[] = [];
    return { flights, host: { flyToGeographic: (t: unknown) => { flights.push(t); return Promise.resolve(); } } };
}

const PROJECT_ID = 'proj-1787554200066-a936f1ea8b34';

/**
 * The production wiring, reproduced port-for-port from `OnboardingStepController.renderLocationStep()`:
 *   `warmContextCache` → start the load, HOLD the promise (`this.contextWarm`), never await it here.
 *   `onParcelArrival`  → kick off the reveal (`this.revealInFlight = this.revealSplitAtParcel(...)`),
 *                        retire the location card, then write the name FIRE-AND-FORGET.
 * ⚠ The ORDER of those statements inside `onParcelArrival` is the production claim, and Arm B reads
 * it out of the real file rather than trusting this reconstruction.
 */
function wireLikeTheController(opts?: { rename?: (n: string) => Promise<unknown> }): {
    hero: GlobeHeroSearch;
    marks: string[];
    warm: ReturnType<typeof deferred<string>>;
    reveal: ReturnType<typeof deferred<void>>;
    flights: unknown[];
    named: string[];
} {
    const marks: string[] = [];
    const warm = deferred<string>();
    const reveal = deferred<void>();
    const named: string[] = [];
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
            // ...and ONLY THEN the name — no card, no prompt, no readiness signal of any kind.
            const autoName = startupProjectName(picked.address, PROJECT_ID);
            marks.push('name:write');
            named.push(autoName);
            void (opts?.rename?.(autoName) ?? Promise.resolve())
                .then(() => { marks.push('name:written'); })
                .catch(() => { /* best-effort by contract */ });
        },
    });
    return { hero, marks, warm, reveal, flights, named };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('§STARTUP-LOAD-ORDERING — the load starts on the GEOCODE, not on any UI event', () => {
    it('the context warm has ALREADY STARTED by the time the flight reaches the parcel', async () => {
        const { hero, marks } = wireLikeTheController();
        await hero.search('Barcelona');

        // Observed from the real chain, not pushed by the test: `warmContextCache` fires at the
        // `city` stage, `onParcelArrival` at `parcel`.
        expect(marks).toContain('context-warm:start');
        expect(marks.indexOf('context-warm:start')).toBeLessThan(marks.indexOf('flight:parcel-arrival'));
        // ...and the reveal is kicked off BEFORE the name is written, never after it.
        expect(marks.indexOf('reveal:kicked-off')).toBeLessThan(marks.indexOf('name:write'));
    });

    it('⭐ THE FALSIFYING ARM — the whole load runs with an EMPTY SCREEN and no user event', async () => {
        // ⛔ THIS IS THE FOUNDER'S ASK, MADE FALSIFIABLE: *"Remove / Exclude the project name"*.
        // Between the geocode and the split there is now nothing to dismiss, nothing to type into
        // and nothing to press. Re-add a card — under any name — and this arm goes red on the very
        // first line, which is the point of asserting a census rather than the absence of one id.
        const { hero, marks, warm, reveal } = wireLikeTheController();
        await hero.search('Barcelona');

        expect(document.body.children.length).toBe(0);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector('input')).toBeNull();

        // Both halves of the load finish ON THEIR OWN. Nothing is touched, clicked or dismissed.
        warm.resolve('15775 footprints');
        reveal.resolve();
        await Promise.all([warm.promise, reveal.promise]);
        await Promise.resolve();

        expect(marks).toContain('context-warm:done');
        expect(marks).toContain('reveal:split-mounted');
        expect(document.body.children.length).toBe(0);
    });

    it('⭐ A RENAME THAT NEVER SETTLES DOES NOT HOLD THE REVEAL', async () => {
        // The name is still a REAL write (`persistence.client.rename`), and a real write can hang:
        // a slow server, a lost socket. ⛔ If a future edit awaits it inside `onParcelArrival` — the
        // single most plausible way to reintroduce a gate now that the card is gone — the split
        // mount waits on the network for a cosmetic rename. Here it does not.
        const neverSettles = new Promise<never>(() => {});
        const { hero, marks, warm, reveal } = wireLikeTheController({ rename: () => neverSettles });
        await hero.search('Barcelona');

        warm.resolve('15775 footprints');
        reveal.resolve();
        await Promise.all([warm.promise, reveal.promise]);
        await Promise.resolve();

        expect(marks).toContain('context-warm:done');
        expect(marks).toContain('reveal:split-mounted');
        // The write is still outstanding, and nothing waited for it.
        expect(marks).not.toContain('name:written');
    });

    it('a rename that REJECTS is swallowed — a failed write never reaches the arrival handler', async () => {
        const rejects = vi.fn(() => Promise.reject(new Error('rename rejected: 500')));
        const { hero, marks } = wireLikeTheController({ rename: rejects });
        await expect(hero.search('Barcelona')).resolves.toBeDefined();
        await Promise.resolve();
        await Promise.resolve();
        expect(rejects).toHaveBeenCalledTimes(1);
        expect(marks).toContain('name:write');
        expect(marks).not.toContain('name:written');
    });

    it('names the project from the PLACE plus the CODE, on the real geocoder answer', async () => {
        const { hero, named } = wireLikeTheController();
        await hero.search('Barcelona');
        // "Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España" + proj-…-a936f1ea8b34.
        expect(named).toEqual(['Barcelona — 8B34']);
    });
});

describe('§STARTUP-SLOW-DESCENT — the descent is unchanged by the naming write', () => {
    it('the whole world→parcel chain has already flown before the name is written', async () => {
        const { hero, flights, marks } = wireLikeTheController();
        await hero.search('Barcelona');

        // ⭐ The founder asked for the slow zoom specifically so he could WATCH it. Every camera
        // target the stage chain produces was issued BEFORE the name write; the naming path knows
        // nothing about the camera and cannot re-time it.
        expect(flights.length).toBeGreaterThan(0);
        expect(marks).toContain('name:write');
        const before = flights.length;
        await Promise.resolve();
        expect(flights.length).toBe(before);
    });

    it('paints NOTHING over the globe — not one node is appended to the body', async () => {
        // This arm read `children.length === 1` (the name card) until L-13173. It reads 0 now, and
        // that difference IS the founder's change.
        const { hero } = wireLikeTheController();
        await hero.search('Barcelona');
        expect(document.body.children.length).toBe(0);
    });
});

// ── ARM B — the PRODUCTION wiring, read out of the real file ──────────────────────────────────
//
// ⚠ WHY A SOURCE READ RATHER THAN AN IMPORT. `OnboardingStepController.ts` builds DOM at import
// time and pulls in the whole editor graph; the module's own header records that this is why
// `GlobeHeroSearch` was extracted DOM-free in the first place. Arm A therefore drives the ports
// through a faithful reconstruction — which by construction cannot see a reorder in the real file.
// This arm can.

const CONTROLLER_SRC = resolve(__dirname, '..', 'OnboardingStepController.ts');

function braceBody(src: string, from: number): string {
    const open = src.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    throw new Error('unbalanced body');
}

/**
 * ⚠ COMMENTS STRIPPED, DELIBERATELY, for the arms that assert an ABSENCE. The comment explaining
 * why the card was removed necessarily NAMES it, so matching the raw body would fail on its own
 * rationale and pressure a future author into deleting the explanation to make the test pass. That
 * is a worse outcome than the test not existing.
 */
function codeOnly(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

describe('ARM B — the production wiring in OnboardingStepController.onParcelArrival', () => {
    const src = readFileSync(CONTROLLER_SRC, 'utf8');
    const arrivalStart = src.indexOf('onParcelArrival: (picked) => {');
    const arrival = braceBody(src, arrivalStart);

    it('kicks off revealSplitAtParcel BEFORE writing the name', () => {
        const reveal = arrival.indexOf('this.revealSplitAtParcel(');
        const write = arrival.indexOf('this.applyProjectName(autoName)');
        expect(reveal).toBeGreaterThan(-1);
        expect(write).toBeGreaterThan(-1);
        // ⛔ If these ever swap, a cosmetic rename is issued before the load the founder is waiting
        // on is even started.
        expect(reveal).toBeLessThan(write);
    });

    it('never awaits the name write — no loader can be made to wait on it', () => {
        expect(arrival).not.toMatch(/await\s+this\.applyProjectName/);
        // Best-effort BY CONTRACT: `void`-ed with a `.catch`, so a failed rename cannot reject into
        // the arrival handler.
        expect(arrival).toMatch(/void this\.applyProjectName\(autoName\)[\s\S]{0,200}?\.catch\(/);
        expect(src).toMatch(/private async applyProjectName\([\s\S]{0,1200}?client\.rename\(projectId, name\)/);
    });

    it('the warm is started in warmContextCache, one stage EARLIER than the arrival handler', () => {
        const warmStart = src.indexOf("markStartupPhase('context-warm:start')");
        expect(warmStart).toBeGreaterThan(-1);
        // `warmContextCache` fires at the `city` stage, `onParcelArrival` at `parcel`
        // (GlobeHeroSearch.descendAndHandOff) — Arm A observes that at runtime; this pins that the
        // warm is still wired to a port that fires earlier, not folded into the arrival handler.
        expect(src).toMatch(/warmContextCache:\s*\(lat, lon\)\s*=>\s*\{/);
        expect(warmStart).toBeLessThan(arrivalStart);
    });

    it('⛔ THE NAME CARD IS GONE, AND STAYS GONE — no modal is raised on the location path', () => {
        // §STARTUP-NAME-FROM-LOCATION (L-13173): *"Remove / Exclude the project name"*. Named as an
        // assertion so re-adding it is a deliberate act with a red test in front of it, not a
        // convenience that slips back in.
        // ⚠ READ OVER `codeOnly`, AND THAT IS NOT A WEAKENING — it is the same reason the arrival
        // body is stripped below. `retireLocationCard`'s doc comment has to NAME the deleted slot
        // module to explain which half of L-13130 survived and which went; matching the raw file
        // would fail on that explanation and pressure a future author into deleting the history to
        // make the test pass. The assertion is about CODE.
        const srcCode = codeOnly(src);
        expect(srcCode).not.toMatch(/showStartupProjectNameCard|startupProjectNameCard/);
        expect(srcCode).not.toMatch(/onboardingCardSlot|handOffOnboardingModalCard/);
        // ...and the arrival handler builds no DOM of its own to stand in for it.
        const code = codeOnly(arrival);
        expect(code).not.toMatch(/createElement|appendChild|showModal/);
        expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    });

    it('names from the place AND the code, through the ONE project-id read', () => {
        expect(arrival).toMatch(/startupProjectName\(picked\.address,\s*this\.resolveProjectId\(\)\)/);
        // `startupProjectCode` takes the last four alphanumerics of exactly this string, so the two
        // consumers must not read the id from two places.
        expect(src).toMatch(/private resolveProjectId\(\): string \| null \{[\s\S]{0,300}?currentProjectId/);
    });

    it('retires the location card at parcel arrival — it empties the body AND hides the shell', () => {
        expect(arrival).toMatch(/this\.retireLocationCard\('parcel-arrival'\)/);
        const body = braceBody(src, src.indexOf('private retireLocationCard(why: string): void'));
        expect(body).toMatch(/this\.clearBody\(\)/);
        expect(body).toMatch(/this\.overlay\.hidden\s*=\s*true/);
        expect(body).toMatch(/this\.locationCardRetired\s*=\s*true/);
    });

    it('⛔ `leaveLocationStep` still owns the GLOBE ONLY — the two halves stay separate', () => {
        // The reveal re-parents the globe's viewport into the split, so releasing it early is the
        // §22 black-3D-pane hazard. Folding the card teardown INTO this method would look like a
        // tidy-up and would re-open that one.
        const body = braceBody(src, src.indexOf('private leaveLocationStep(): void'));
        expect(body).toMatch(/this\.globeHero/);
        expect(body).not.toMatch(/hidden|clearBody|retireLocationCard/);
    });

    it('the location card\'s skip and submit refuse to fire once it is retired', () => {
        expect(src).toMatch(/if\s*\(this\.locationCardRetired\)\s*\{[\s\S]{0,400}?Skip — no location/);
        expect(src).toMatch(/this\.locationCardRetired\s*=\s*false;/); // re-armed on a fresh card
    });
});

// ── ARM C — the two things the removal must NOT have broken ───────────────────────────────────

describe('ARM C — the SKIP-LOCATION naming step survives, and the step labels stay true', () => {
    const src = readFileSync(CONTROLLER_SRC, 'utf8');

    it('⛔ THE SKIP BRANCH KEEPS ITS OWN "Name your project" STEP', () => {
        // ⭐ NOT AN INCONSISTENCY. With no location there is no place to name the project after, so
        // this branch is the only way it ever gets a real name; deleting it would leave the project
        // permanently called `Untitled Site — <stamp>`. The two steps share `applyProjectName`,
        // which is exactly why deleting the wrong one was the live risk in this change.
        const body = braceBody(src, src.indexOf('private renderNameThenCanvasStep(): void'));
        expect(body).toMatch(/'onboarding-project-name'/);
        expect(body).toMatch(/this\.applyProjectName\(name\)/);
        expect(body).toMatch(/this\.landInCanvasWithUnderlay\(\)/);
        expect(body).toMatch(/No location, no plot/);
    });

    it('the skip branch still claims TWO steps, because it has two', () => {
        const body = braceBody(src, src.indexOf('private renderNameThenCanvasStep(): void'));
        expect(body).toMatch(/'Step 2 of 2 \\u00b7 Name'/);
    });

    it('⭐ THE LOCATION BRANCH STILL HAS FOUR STEPS, AND STILL SAYS FOUR', () => {
        // ⚠ The removed card was a FLOATING card over the globe — it never carried a step chip and
        // was never one of the four (Location → plot → Confirm → Generating), so removing it did
        // not change the denominator. Asserted rather than assumed: this arm goes red if a step is
        // ever added or removed without the "of N" moving with it. *"Claiming four steps when two
        // remain is the same class of untruth as a progress bar that never reaches the end."*
        const template = braceBody(src, src.indexOf('private setStepIndicator(n: number, label: string): void'));
        const claimed = /Step \$\{n\} of (\d+)/.exec(template);
        expect(claimed, 'setStepIndicator must still render a "Step N of M" chip').not.toBeNull();

        const used = new Set<number>();
        for (const m of src.matchAll(/this\.setStepIndicator\((\d+),/g)) used.add(Number(m[1]));
        expect([...used].sort()).toEqual([1, 2, 3, 4]);
        expect(Number(claimed![1])).toBe(Math.max(...used));
    });
});

// ── §MUTATION PROOF (lane NAME-CARD-OUT, 2026-09-07) ──────────────────────────────────────────
//
// A spec that pins an ordering is worth exactly as much as the evidence that it CAN go red. Three
// mutations were RUN after this file was re-pointed and before it was committed. All three failed,
// and these are the readings, not a description of them:
//
//   1. `wireLikeTheController`'s `onParcelArrival` made to append one `<div>` to `document.body` —
//      the shape a re-added card takes, whatever it is called →
//      **2 failed | 16 passed**. `⭐ THE FALSIFYING ARM` and `paints NOTHING over the globe` both
//      *AssertionError: expected 1 to be +0*.
//   2. The reveal's completion mark chained BEHIND the rename promise (`the split mounts once the
//      name is written` — the gate this whole file exists to forbid, in the one form still
//      reachable now the card is gone) →
//      **2 failed | 16 passed**. `⭐ A RENAME THAT NEVER SETTLES DOES NOT HOLD THE REVEAL`
//      *expected [ 'context-warm:start', …(4) ] to include 'reveal:split-mounted'*.
//   3. `setStepIndicator`'s template changed to `Step ${n} of 5` in the REAL controller →
//      **1 failed | 17 passed**. `⭐ THE LOCATION BRANCH STILL HAS FOUR STEPS`
//      *expected 5 to be 4*.
//
// All three mutations were reverted (`Test Files 2 passed · Tests 35 passed`). ⛔ Do not "simplify"
// any arm into a comparison between two strings the test itself pushed — that is precisely the
// shape the file this file replaced was written to replace.
