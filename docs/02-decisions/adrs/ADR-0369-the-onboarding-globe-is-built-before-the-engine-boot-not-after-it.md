# ADR-0369 — The onboarding globe is BUILT before the engine boot, not after it

- **Status:** ACCEPTED (Stage 1, landed) · PROPOSED (Stages 2–3 in §7, costed, not built)
- **Date:** 2026-08-24
- **Lane:** EARTH31 · **Issue:** [L-10560](../../04-reference/ISSUE-LOG.md)
- **Supersedes / amends:** amends **§STARTUP-EAGER-GLOBE** (2026-08-10) in place — same seam,
  same file, the consumer moved. Supersedes nothing.
- **Governed by:** `C02` (composition root & boot) · `C13` (project lifecycle & isolation) ·
  `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md` §3 (the O-stage table this adds a row to)
- **Artefact:** `apps/editor/__tests__/globePrewarmBeforeEngineBoot.test.ts` (14 cases)

---

## 1. Context — the founder's mandate

> *"I want to make the **project start-up** as quick, reliable, fast, robust and architecturally
> sound as possible. **PRYZM Earth should come INSTANTLY — now I need to wait a few seconds — it
> should just pop up instantly.**"*

---

## 2. The measurement — from his own instrument, not from an opinion

`§STARTUP-BUDGET` (`apps/editor/src/engine/startupBudget.ts`) already existed. Its output on the
founder's run:

```
[§STARTUP-BUDGET] run started (t0).
[§STARTUP-BUDGET] onboarding:shown      +0ms     (t+0ms)
[§STARTUP-BUDGET] cesium:warm-start     +0ms     (t+0ms)
[cesiumWarmup] §STARTUP-CESIUM-CHUNK-WARM — Cesium viewport chunk pre-warmed in 122 ms
      … the ENTIRE BIM ENGINE BOOTS HERE …
[§STARTUP-BUDGET] globe:eager-init-start +2633ms (t+2634ms)
```

⭐ **The Cesium CHUNK is warm at ~122 ms. The VIEWER does not begin constructing until 2,633 ms.**

## 3. The root — a correct seam whose only consumer sat at the end of the boot

`§STARTUP-EAGER-GLOBE` (2026-08-10) had already diagnosed the serial-globe problem and shipped a
one-shot flag: `PlatformRouter.showOnboarding()` → `requestEagerGlobeStart()` →
`mountGISArea` → `ensureGisInitialized('eager')`. **The flag was right.** Its only consumer was in
the wrong place, and this is verified from source, not inferred from the log:

| step | file | line (2026-08-24) |
|---|---|---|
| the request | `PlatformRouter.showOnboarding` | `PlatformRouter.ts` |
| the consumer | `mountGISArea` | `GISAreaLayout.ts:~1445` |
| who calls it | `createMainLayout` | `Layout.ts:92` |
| who calls **that** | **`initUI`** | `engineLauncher.ts:~1060` |

`initUI` is the **LAST** stage of `engineLauncher.bootstrap()`. Everything in the founder's
2.5-second hole runs first:

```
initScene → initBuilders → initTools → initBusHandlers → registerAllStores → initDataPlatform → initUI
   O4          O5             O6            O9                O9                 O7            O8
```

(the O-numbers are `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md` §3.)

⛔ **So "eager" meant *eager relative to `toggleGIS(true)`*, and was still STRICTLY SERIAL after
the whole engine.** The onboarding globe uses **none** of `initBuilders` (≈23 element subsystems),
`initTools` (≈30 bridges), `initBusHandlers` (≈80 registrations) or the 37 stores.

⚠ **This is not a tuning miss; it is a structural one.** The globe's construction was reachable
only from a function whose caller is the boot's final stage, so no amount of "start it earlier
inside `mountGISArea`" could have helped.

## 4. Decision (Stage 1 — LANDED)

**The Cesium viewport is constructed and mounted by the onboarding seam itself, before the engine
boot begins; the boot ADOPTS it.**

⭐ **The shape is not new.** `apps/editor/src/rendering/rendererPrewarm.ts` already solved the
identical problem for the WebGPU renderer — `prewarmRenderer()` off the critical path,
`consumePrewarmedRenderer()` in `initScene` Phase 5, *"2,401 ms LONGTASK skipped"*. This ADR gives
the globe the **same two verbs, the same fallback doctrine, and the same singleton-consume rule**,
inside the file that already owns the seam:

```
apps/editor/src/engine/eagerGlobeStart.ts
  requestEagerGlobeStart()   ── UNCHANGED (round 1's flag)
  consumeEagerGlobeStart()   ── UNCHANGED
  prewarmGlobe(opts)         ── NEW: construct + enterWarmHiddenState() + await mount()
  consumePrewarmedGlobe()    ── NEW: hand it to mountGISArea, exactly once
```

⛔ **No rival seam was minted.** The alternative — a second "globe owner" module, or a window
global — was rejected: P4 forbids `(window as any)`, and a second owner is exactly the shape C13
§3.10 was written against.

### 4.1 What the adoption replaces — and, precisely, what it does not

The adoption in `ensureGisInitialized` replaces **two steps**: construction and `mount()`.
Everything after them — `_resolveCameraHostReady`, the `CesiumThreeBridge`, the geocode search
box, the `SiteBoundaryDrawTool`, the console hooks — runs on **BOTH** arms.

⛔ **An `if (prewarmed) { … }` wrapped around that wiring would be the "built but unreachable"
defect wearing a perf fix's name** — the shape this session met fourteen times. One test case
(`the adoption does NOT branch around the bridge / geocode / boundary wiring`) pins the source
order of all three, plus the readiness resolve.

## 5. Why this is safe — the four invariants, each with its guarantee

| Invariant | Guarantee |
|---|---|
| **Deferred ≠ optional; prewarmed ≠ required** | `consumePrewarmedGlobe()` returning `null` is a FIRST-CLASS answer meaning *"construct it cold"* — reached on a hub open, a deep link, a reopen-after-reload, a failed prewarm, and a second `mountGISArea`. That branch is byte-for-byte the pre-change code. **There is no path on which a globe fails to appear because the prewarm did not fire.** |
| **At most ONE viewport, ever** | `_prewarm` is a single promise and `_consumed` latches. A prewarm still in flight when the boot asks is **awaited**, never raced; `mountGISArea` additionally guards on `if (!cesiumViewport)`. |
| **C13 project isolation unchanged** | The prewarmed viewport becomes the **same `cesiumViewport` binding** every existing teardown, project-scope probe and §L-676 `forgetProject()` already targets. This module holds no project state and registers no scope: it is a constructor that ran early, not a new owner. `npm run check:isolation` **RC=0**, unchanged. |
| **Graphics uncompromised** | The viewer mounts **warm-hidden** (`display:block; visibility:hidden; pointer-events:none`) exactly as round 1 designed. Nothing about quality, imagery, terrain or the reveal changed — only *when the object is built*. |

### 5.1 The test double cannot be more capable than the subject

`eagerGlobeStart.ts` exports

```ts
export const REAL_GLOBE_SATISFIES_THE_SEAM:
    InstanceType<CesiumViewportCtor> extends PrewarmedGlobe ? true : never = true;
```

⭐ **MEASURED, not asserted:** injecting a method the real `CesiumViewport` does not have makes
`tsc` fail at that line with `TS2322: Type 'true' is not assignable to type 'never'`. So the narrow
four-method seam is a **proof about the real class**, not a hand-written approximation of it — the
failure recorded in `fake-more-capable-than-real` cannot happen here.

## 6. ⛔ WHAT THIS DOES **NOT** FIX — stated plainly

**Stage 1 removes the globe's CONSTRUCTION from the critical path. It does not remove the engine
boot from in front of the globe's REVEAL.**

The reveal chain is, and after this change remains:

```
engine boot + ProjectLoader.load  →  runtime event `pryzm-project-loaded`
     →  briefBootstrap.onLoaded   →  startOnboardingStepFlow()
     →  renderLocationStep()      →  markStartupPhase('location-step:open')
     →  window.pryzmToggleGIS(true)  →  finishFirstGisActivation()  →  setVisible(true)
```

`briefBootstrap` arms `pryzm-project-loaded` **before** issuing the create, and that event fires
only after the full bootstrap. So:

- **Improved by Stage 1:** at the moment the reveal happens, the globe is already **mounted, sized
  and streaming** — the flip is a visibility change, not a cold construction. Round 1 had moved
  that construction to the boot's *tail* (`+2633 ms`); Stage 1 moves it to `t≈0`, so it is
  genuinely *finished* by the time the boot ends rather than *starting* then.
- **NOT improved by Stage 1:** the *instant at which the user first sees PRYZM Earth* is still
  gated on `pryzm-project-loaded`.

⛔ **Anyone quoting this ADR as "the globe is now instant" is quoting it wrongly.** Stage 2 is the
half that moves the reveal.

## 7. The staged plan (Stages 2–3 — PROPOSED, costed, NOT built)

### Stage 2 — the location step must not wait for the BIM engine · ⭐ highest remaining value

**Claim:** the location step needs a project record and a globe. It does **not** need builders,
tools, bus bridges, the 37 stores, or a hydrated model. `composeRuntime()` (O2) — which owns the
bus and stores — already runs **before** `engineLauncher.bootstrap()`, so the geocode dispatch path
plausibly exists well before `pryzm-project-loaded`.

**Change:** split `briefBootstrap`'s single gate into two:
- `location` (and its geocode/fly) opens on **`project-created` + `globe:prewarm-done`**;
- `draw-commit` → `generate` continue to await `pryzm-project-loaded`, because those DO need the
  engine.

**Acceptance (must be written first, or this is not done):** a spec proving the location step
renders and geocodes with `pryzm-project-loaded` **never fired**, and that the generate step
**still blocks** until it does. Plus a §STARTUP-BUDGET reading showing `location-step:open` before
`boot:ui-done`.

**Risk:** MEDIUM-HIGH. Two ordering assumptions must be proven, not assumed: (a) that
`site.updateLocation` dispatches correctly pre-boot, and (b) that
`OnboardingStepController.start()`'s `resetAppPhaseForNewProject()` bracket (§L-1186) still opens
and closes exactly once. **Cost:** one lane, browser verification mandatory.

### Stage 3 — phase-gate the engine boot on `AppPhase` · ⭐ largest, and correctly LAST

`panelDefaults.ts` already carries the phase (`'onboarding-globe' | 'canvas'`), it is already
declared at the open gesture (§L-1186), and it already gates panel defaults and element authoring.
It does **not** gate the engine boot. Gating `initBuilders` / `initTools` / `initBusHandlers` on
`phase === 'canvas'` (with a guaranteed `ensureEngineReady()` before the first authoring command)
is the change that would make the boot itself short.

⛔ **Deliberately not attempted in this lane, and the reason is a measurement gap, not nerve:**
until this commit, **nothing named which stage owns the 2.5 seconds.** Deferring the wrong stage
buys nothing and risks the whole authoring path. That gap is now closed — see §8 — so Stage 3
should begin by *reading* `boot:*`, not by guessing.

**Risk:** HIGH (every authoring path depends on those three). **Precondition:** one founder-run
`boot:*` table. **Cost:** one lane per subsystem deferred, each with its own "guaranteed before
first use" test, per the O-INV-5 rule already in the spec.

## 8. Also landed — the boot names its own stages

Seven marks were added to the **existing** instrument (⛔ no rival instrument):

`boot:engine-start` · `boot:scene-done` · `boot:builders-done` · `boot:tools-done` ·
`boot:bus-handlers-done` · `boot:data-platform-done` · `boot:ui-done`

They map **1:1** onto `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md` §3's O4 / O5 / O6 / O9 / O7 / O8, so a
reading is quotable against that spec. They are passive: no phase is gated, delayed or skipped
because of a mark — the "passive mark recorder" clause is the whole contract of `startupBudget.ts`.

⭐ Read `globe:prewarm-done` against `globe:eager-init-start`: **the gap between them is boot time
the globe no longer spends waiting.** On the prewarmed path `globe:eager-init-start/-done` now
bracket an **adoption**, so a near-zero delta there is the success signal, not a missing
measurement.

## 9. Consequences

- ✅ The globe's construction+mount overlaps the engine boot instead of following it.
- ✅ The cold path is preserved on every arm and is what a hub open still takes — so **the second
  project open is untouched**: `showOnboarding` is not on that path, no prewarm is requested, and
  `mountGISArea` runs once per tab regardless.
- ✅ `check:isolation` RC=0; root `tsc` RC=0; 14 new cases; zero new test failures.
- ⚠ On the onboarding path a Cesium WebGL context now exists earlier in the tab's life, alongside
  the BIM renderer. Both existed before — the ordering changed, not the count. `mount()`'s
  `_awaitRendererLive()` device-loss gate is a no-op before any renderer exists and is unaffected.
- ⚠ If a user abandons onboarding at the auth step, a warm-hidden globe has been built that the
  session may not use. Bounded (it is the same one viewport the tab would build anyway) and
  recorded rather than hidden; if it ever matters, the request moves inside the authed branch.
- ⛔ **The reveal is still engine-gated (§6).** Stage 2 owns that, and until it lands the founder's
  "instantly" is only partly answered.
