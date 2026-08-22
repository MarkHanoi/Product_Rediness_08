# C60 — Site Entry & Jurisdiction Coverage

> **Stamp**: 2026-07-22 · **Status**: DRAFT (Phase 1 IMPLEMENTED — the pure stage machine, the
> registry-derived coverage lookup, the view-state store and the staged panel; **not yet wired into
> the shipping entry flow, and not yet founder-verified live**). L-593 stays OPEN until the founder
> confirms it in the browser.
> **Scope**: How a user ARRIVES at a site — the `world → country → city → parcel` entry navigation —
> and the honest, engine-derived answer to *"where can PRYZM actually answer?"*. Both halves are in
> one contract because they are one decision: a navigation surface that offers a place is a claim
> about that place.
> **Key principles**: P3 (single rAF), P4 (no `window as any`), P6 (commands only), P8 (spans).
> **Relates**: C59 (the view system this flow is a *state of*, not a peer to), C19 §1.3/§1.4 (the
> one-shot immutable parcel boundary), C57 §3.1 (the jurisdiction adapter registry), C58 §1.4 (never
> present a guess as an answer), C12 (LTP-ENU comes AFTER site selection), C06 §7/§233 (chrome
> z-layering).

---

## §0 — Why this exists

Two facts collided.

**First**, the shipped entry sequence — location → draw/select boundary → generate — lives in
`onboarding-bootstrap`, `PlatformRouter` and `siteDispatch`, **and in no contract at all**. It was
logged as a coverage gap in `MISSING-CONTRACTS-AUDIT-2026-06-01.md`. C59 §0 exists because three
uncontracted view mechanisms had accreted on one container; an uncontracted *entry* mechanism is the
same disease one layer up, and the L-593 globe would have been the fourth.

**Second**, and more seriously: **a globe that invites a user to pick any country advertises coverage
PRYZM does not have.** Exactly one city is live (`isInBarcelona()` — a metropolitan bbox — plus one
registered rule pack family). A per-country "data panel" would imply country-level data we hold
**none** of. That is the C58 §1.4 failure — presenting a guess where a user expects an answer —
relocated to the navigation layer, and it is the same failure class as the fabricated 9 m context
heights.

⇒ **The founder decided (A): the honest coverage globe.** Barcelona lit, everywhere else explicitly
*not yet covered*, and the country/city panels state **what PRYZM can actually answer there** rather
than inventing statistics about a place. (B) — the open globe that refuses only at the parcel step —
is preserved as a **configuration value**, not a fork (§5).

---

## §1 — The entry state machine

### §1.1 — It is a REDUCER, not a camera-altitude listener (normative)

The entry flow is a **pure, unit-tested reducer** over four stages —
`world → country → city → parcel` — modelled exactly as C59 §1.2 models pane layout, with the camera
and the panels as its **projections**. Implementation: `apps/editor/src/engine/views/siteEntryModel.ts`.

**A `camera.moveEnd` altitude sniffer is forbidden by this contract.** Three independent reasons,
each disqualifying on its own:

1. **It flaps.** Altitude is continuous and a hand on a globe is not steady. A camera resting near a
   band edge re-enters and re-leaves the band on every inertial settle, and the panel strobes. A
   reducer changes stage only when an intent says so — stability under camera jitter is a property of
   the shape, not of a tuned hysteresis constant.
2. **It has nowhere to put the coverage answer.** *"Which jurisdiction is the user in, and can we
   answer there?"* is state the camera does not carry, and it cannot distinguish "the user chose
   Barcelona" from "the camera happens to be over it".
3. **Stage is a cause, not an effect.** The camera is derived from the stage (`cameraForState`). A
   re-parent, a pane swap and a re-mount all move the camera without the user navigating anywhere; if
   the camera were the source of truth, each of those would silently change the stage.

**Altitude bands are DECLARED OUTPUTS** (`SITE_ENTRY_ALTITUDE_M`) — what the camera is flown *to* when
a stage is entered. They are never compared against a live camera height to infer a stage.

### §1.2 — Vocabulary

- **`SiteEntryStage`** — `'world' | 'country' | 'city' | 'parcel'`, ordered outermost → innermost.
- **`SiteEntryState`** — `{ stage, focus: GeoPoint | null, countryCode, jurisdictionId }`. Immutable.
- **`SiteEntryIntent`** — `site.entry.reset` · `focus-country` · `focus-jurisdiction` · `descend` ·
  `ascend` · `select-parcel`. Command-named, as C59 §2.3 requires.
- **`SiteEntryEffect`** — `camera` (fly the ONE viewer) · `site-handoff` (leave the flow, enter the
  existing site path). The reducer *describes* effects; ports perform them.
- **`CoverageEntry`** — one jurisdiction as the model consumes it. **A shape, not a source** — §2.

### §1.3 — `countryCode` is set only when KNOWN (normative)

**PRYZM holds no country-boundary data.** Therefore a free camera move over an arbitrary landmass
leaves `countryCode` `null`, and the panel says *"not covered yet"* **without naming a country**.
`countryCode` is set only when the user picked a country from the covered list, or when the focus
resolved into a registered jurisdiction. Naming a country we merely guessed from a coordinate would
be a C58 §1.4 fabrication at the navigation layer — the exact defect this contract exists to prevent,
committed by the contract meant to prevent it.

---

## §2 — Coverage is DERIVED FROM THE ENGINE (normative — the core invariant)

> **The site-entry coverage layer MUST be derived from the shipping rule-pack registry. A
> hand-maintained coverage polygon, city list, or country table is a violation of this contract.**

A hand-drawn coverage layer drifts from what the engine can do, and **the drift is invisible** —
nothing compares the two, so the globe keeps lighting a city months after the pack was renamed, or
stays dark on one that shipped. This project has hit that failure class repeatedly (the fabricated
9 m heights; the empty-success cached as an answer; the probe that measured density instead of
identity). The remedy is structural, not procedural: **make the second statement unrepresentable.**

### §2.1 — What the registry could not express, and the smallest honest addition

`REGISTRATIONS` in `packages/site-parcel-data/src/rulepacks/registry.ts` knew **what** we answer
(`packsByZone`) but not **where**; `isInBarcelona()`/`BARCELONA_BBOX` in
`providers/barcelonaBbox.ts` knew **where** but was unreachable from the registry, and nothing
enumerated the registered jurisdictions at all. So the registry genuinely could not express a
coverage geometry.

**The addition made (deliberately the smallest that removes the drift):**

- `JurisdictionRegistration` gains **required** fields `displayName`, `countryCode`, `countryName`,
  `extent`, `contains`, `answerSummary`.
- `extent` and `contains` for Barcelona are **the imported `BARCELONA_BBOX` constant and the imported
  `isInBarcelona` predicate** — the very objects `siteDispatch.ts` routes on. Not copies. Identity is
  asserted by test (`expect(entry.extent).toBe(BARCELONA_BBOX)`).
- `listJurisdictionCoverage()` projects `REGISTRATIONS`, reading `packZoneCodes` **live** from
  `packsByZone` at call time.
- The fields are **required, not optional**. A future Madrid registration that omitted its extent is
  a `tsc` error, not a city silently missing from the globe.

**Consequences, which are the point:**
- The globe cannot light a place the dispatcher would refuse to route into, or stay dark where it
  would route — the same predicate decides both.
- Registering a pack updates the globe with **no second edit anywhere**.
- The editor-side adapter (`siteEntryCoverage.ts`) contains **no data, no coordinates, no city names
  and no conditionals**. Adding a literal to it re-creates the drift and is a review failure.

### §2.2 — A bbox is a coarse claim and must be labelled as one

`barcelonaBbox.ts` is explicit that its box is a **proximity gate, never an authorisation**. The
entry UI therefore states the resolution it has ("coverage is recorded at metropolitan-area
resolution here") and keeps the real answer at the parcel step, where the clau lookup and the block
source decide. **A lit region on the globe is not a promise about a specific plot.**

---

## §3 — The staged panels: the honest answer at each altitude

Panel content is a **pure projection** (`describeSiteEntryPanel`), so what the user sees is a unit
test rather than a screenshot review. The DOM chrome (`SiteEntryPanel.ts`) holds **no copy of its
own**.

**Verdict is three-valued and there is deliberately no soft fourth:** `covered` · `not-covered` ·
`unknown`.

| Stage | Covered | **Not covered** |
|---|---|---|
| `world` | Lists the covered **countries only**, derived from the registry, with the number of covered areas in each. States that everywhere else is not covered yet. | With an empty registry: *"PRYZM has no jurisdiction registered yet… The globe is dark on purpose."* An honest dark globe is a correct rendering, not a bug to paper over. |
| `country` | Names the country and states **"it does not cover the country as a whole — coverage is registered per jurisdiction, one ordinance at a time"**, plus *"PRYZM holds no national statistics and shows none here."* Lists its covered jurisdictions. | Title **"Not covered yet"**; *"PRYZM has no zoning rule pack registered for this location… **This is a statement about PRYZM, not about the law.**"* **The country is not named** (§1.3). Offers "Zoom back out". |
| `city` | Names the jurisdiction, its `answerSummary` (what the ordinance path actually holds), the **count of zone codes with a curated pack**, and that the rest is answered with a cited refusal. | "Not covered yet" + the mode-specific consequence: in **(A)** *"You can look, but you cannot select a parcel here — PRYZM would have nothing to answer with."*; in **(B)** *"You may still zoom in and select a parcel; PRYZM will tell you at that point that it cannot produce an envelope here."* |
| `parcel` | "Select a plot — «city»", and that selecting is the point at which PRYZM commits to a site. | Reachable **only in (B)**. States that a plot may still be selected but **no buildable envelope will be produced — PRYZM will say so rather than estimate one**. |

**Normative copy rules.**
1. **No line of panel copy may contain a statistic about a place** — population, land area, average
   height, GDP, anything. PRYZM holds none. Every line is either a statement about PRYZM's own
   registry or a restatement of the user's own choice. Pinned by test.
2. **"Not covered" is always framed as a fact about PRYZM, never about the law.** *"No rule pack is
   registered"* — never *"you cannot build here"*, which we have no standing to say and which is the
   inverse error to the fabricated envelope.
3. **Disable-or-explain** (inherited from C59 Phase 2): a disabled action renders its reason in the
   row, not in a `title=`. A refusal is rendered **in the panel**; it is the coverage answer, not an
   error to swallow.
4. Panels are **pane-scoped chrome** (C06 §7): a child of their own pane element, above that pane's
   surface only, with **no hand-picked `z-index`** (C06 §233).

---

## §4 — Command-driven transitions (P6) and the ports

`SiteEntryStore` (`siteEntryStore.ts`) is the view-state store, shaped exactly like C59's
`PaneLayoutStore` — a second store with a different discipline would be the fifth ad-hoc mechanism.

```
intent ──dispatch──▶ PURE REDUCER ──effects──▶ ports (camera | site) ──commit + notify──▶ panel
```

- **A rejected intent changes nothing** — not the state, **not the camera**, no subscriber, no site
  write. A user told "not covered" must still be looking at what they were looking at, or the refusal
  reads as a crash.
- **The camera port is structural, not an import.** `GlobeCameraHost` is `{ flyToGeographic(...) }`.
  The store does **not** import `CesiumViewport`, so there is no import edge along which a second
  viewer could be constructed. `cesiumSiteEntryCameraPort(resolveHost)` takes a **resolver**, not a
  reference, so a viewport re-created by a backend swap or device-loss recovery is picked up without
  a stale handle.
- **The one required renderer addition** is `CesiumViewport.flyToGeographic()` — the same primitive
  as the private `frameSiteLocation()`, with the framing supplied by the caller's pure model instead
  of hard-coded site altitude/pitch (`flyToFormaSite()` is anchored to a placed massing, which is
  meaningless at globe scale). It performs **no** stage logic, **no** coverage test and **no** site
  write. It is a camera, not a decision.
- **UI handlers dispatch intents and do nothing else.** A click that reaches `viewer.camera`, a
  renderer, or a DOM style is a violation of this section (and of C59 §2.3).

### §4.1 — The pre-site stages write NO site state (normative — C19 §1.3/§1.4)

The parcel boundary is a **one-shot immutable** polygon. A country or city stage that set a site
origin "to help the camera" would **burn that one shot before the user picked anything**.

⇒ The reducer emits a `site-handoff` effect from **exactly one intent**, `site.entry.select-parcel`,
and only from the `parcel` stage. Every other intent, from every stage, in both modes, is pinned by a
**property test** — not a code-reading promise — to emit no hand-off. The store's site port is
reachable from that one effect kind alone, so the pre-site stages cannot write site state because
they cannot reach the writer.

**The hand-off enters the EXISTING path and does not fork it**: `dispatchSiteLocation(...)` then the
existing `site.parcel-boundary-set` commit. This flow changes how a user *arrives* at a parcel, never
what happens once they do.

### §4.2 — C12: no ENU frame is assumed

Every coordinate in the entry flow is WGS84 degrees plus an altitude in metres above the ellipsoid.
The LTP-ENU frame is established when a **site** is chosen (C19 §1.3) — i.e. *after* this flow ends —
so globe-scale work must never touch project metres. Pinned by the absence of any metre-space type in
`siteEntryModel.ts`.

---

## §5 — (A) vs (B) is a configuration value, not a fork (normative)

`SiteEntryMode = 'coverage-gated' | 'open'`.

- **(A) `'coverage-gated'` — the shipped default**, and the default *because the founder chose it*,
  not as a fallback. World, country and city are **freely navigable** — the user may always look, and
  is told the truth while looking. The **single** hard gate is the descent **into** the `parcel`
  stage at a point no registered jurisdiction claims, plus the same check on `select-parcel` so there
  is no back door. A user is therefore told "not yet covered" **before** investing the zoom.
- **(B) `'open'`** — the identical machine with that one gate lifted; the refusal happens downstream
  at the parcel step, where `siteDispatch` already refuses honestly.

**The mode is branched on in exactly two places**: `descentGate()` (one early return) and the one
line of city/parcel panel copy that explains the consequence. There is no second code path, no second
component and no second store. Switching (A)→(B) is one option field. Pinned by a test that runs the
same transition under both modes.

---

## §6 — Invariants (normative)

1. **The stage machine is a pure reducer.** No DOM, no Cesium, no THREE, no I/O in
   `siteEntryModel.ts`. Camera and panels are projections of state. **An altitude listener that
   assigns stage is a violation** (§1.1).
2. **Coverage is derived from the rule-pack registry.** No hand-maintained coverage geometry, city
   list or country table anywhere (§2). The editor-side adapter carries no literals.
3. **No pre-site stage writes site state** (§4.1, C19 §1.3/§1.4). Exactly one intent may hand off.
4. **No invented facts about places** (§3, C58 §1.4). "Not covered" is a statement about PRYZM.
5. **ONE Cesium instance** (C59 §2.1). The globe and the 3D Site are the **same viewer at different
   camera altitudes**. The entry flow constructs no viewer and holds no viewer reference — it holds a
   structural port.
6. **Single rAF** (C59 §2.2, P3). No per-stage animation loop. Stage transitions use Cesium's own
   camera tween on the existing viewer loop; a one-shot self-cancelling settle is permitted, a
   persistent loop is not.
7. **Command-driven transitions** (C59 §2.3, P6). `dispatch(intent)` is the only write path; a
   rejection mutates nothing, including the camera.
8. **Perf: the entry flow holds no live BIM pane behind it** (C59 §2.5). The founder's box runs the
   **WebGL fallback**, and a photoreal globe plus a live BIM surface is exactly the
   two-heavyweight-surface case that invariant warns about — with no upside, since no model exists
   yet. The flow requests the 3D Site **solo** via `siteEntryPaneIntent()`, expressed as C59
   `view.pane.*` intents so the one Cesium keeps being moved by the one mechanism allowed to move it.
9. **No `window as any`** (P4). Both ports are injected.
10. **The entry flow is a STATE of the `site-3d` view, not a new view mechanism** (C59 §0/§2.6). It
    adds no `ViewType`, no renderer and no pane framework.
11. **The world FRAMING may be reached without the entry FLOW — and a mid-project control MUST take
    that route** (§GLOBE-QUICK-TOGGLE, L-6800..L-6808, [ADR-0357](../adrs/ADR-0357-the-globe-is-a-camera-framing-not-a-view-type.md)).
    §6.5 says the globe *is* the `site-3d` viewer at world altitude, so *"take me to the 3D globe"*
    from inside a live project is a **camera** request, and the whole of it is
    `cameraForState(INITIAL_SITE_ENTRY_STATE)` — exported as `worldFramingTarget()`.
    ⛔ **A mid-project surface MUST NOT construct a `SiteEntryStore`.** That store's terminal intent
    emits `site-handoff`, and the parcel boundary is a **ONE-SHOT IMMUTABLE polygon** (§4.1, C19
    §1.3/§1.4) — so re-opening the machine in a project that already has a site puts the user on a
    path toward re-committing it. **Reuse the PROJECTION; refuse the REDUCER.** The distinction is
    testable and must be pinned as a property (no `site.entry.*` intent producible), never as a
    code-reading promise. `worldFramingTarget()` is safe by construction: it returns a value and has
    no state, no effects list, no port and no intent.

---

## §7 — Relationship to C59 (why this is a separate contract)

C59 owns **which view is hosted in which pane**. C60 owns **where the user is in the arrival
sequence, and whether PRYZM can answer there**. Those are different questions with different failure
modes: C59's is a double-mounted GPU singleton; C60's is a fabricated claim of coverage. Folding the
jurisdiction-honesty invariant into the pane-hosting contract would have buried the one thing this
work exists to guarantee inside a document about DOM re-parenting, and would have left the
`MISSING-CONTRACTS-AUDIT` gap ("no contract owns SITE-ENTRY") formally unfilled.

C60 **depends on** C59 and never competes with it: the globe is the `site-3d` view, moved by C59's
`PaneLayoutStore`, and C60 adds no view mechanism of its own (§6.10).

---

## §8 — Delivery status and what is NOT done

**Phase 1 — IMPLEMENTED (this pass), tsc + unit-test gated, NOT founder-verified live:**
- `packages/site-parcel-data/src/rulepacks/registry.ts` — required coverage fields +
  `listJurisdictionCoverage()` (§2.1).
- `apps/editor/src/engine/views/siteEntryModel.ts` — the pure stage machine, coverage lookup, camera
  and panel projections.
- `apps/editor/src/engine/views/siteEntryCoverage.ts` — the one registry adapter.
- `apps/editor/src/engine/views/siteEntryStore.ts` — the view-state store, ports, Cesium camera port.
- `apps/editor/src/engine/views/SiteEntryPanel.ts` — the staged panel chrome.
- `apps/editor/src/ui/geospatial/CesiumViewport.ts` — `flyToGeographic()` (the one renderer addition).
- Pinned by `apps/editor/__tests__/SiteEntryModel.test.ts` (30) +
  `apps/editor/__tests__/SiteEntryStore.test.ts` (9).

**Phase 2 — NOT DONE, deliberately, and it is the honest sequencing:**
- ~~**Wiring into the shipping onboarding entry.** The flow is not yet reachable in the product.~~
  > ⚠ **CORRECTED 2026-08-22 (lane GLOBE32) — this bullet was STALE, and it was stale in the
  > direction that matters: it under-reported what shipped.** The flow **IS** wired into the
  > onboarding `location` step. **MEASURED:** `grep -rn "new SiteEntryStore" apps/ --include=*.ts`
  > → **exactly one production call site**, `apps/editor/src/ui/onboarding/GlobeHeroSearch.ts:144`
  > (plus three in `apps/editor/__tests__/SiteEntryStore.test.ts`). It runs the real reducer, the
  > real camera port and the real `world → country → city → parcel` descent chain, at
  > `mode: 'open'` — see that file's header for why `'open'` and not the shipped
  > `'coverage-gated'` default.
  >
  > **What is STILL true, and is the part worth keeping:** that one call site is the flow's
  > **only** reachable entrance. **The globe is UNREACHABLE outside onboarding.** Nothing in the
  > live editor constructs a `SiteEntryStore`, and §6.11 now forbids a mid-project surface from
  > doing so until the question *"what happens to the boundary this project already committed?"*
  > has an answer. The top-centre `⊕ 3D Globe` control (L-6800..L-6808) surfaces the world
  > **framing** mid-project; it deliberately does **not** re-host the **flow**.
  >
  > ⛔ **The two are different facts with opposite fixes.** "The globe control is missing" was
  > **ABSENT** in the pane bar (structurally — see C59 §2.9) and **UNREACHABLE** in the editor
  > (built, not surfaced). Reading one as the other sends the fix to the wrong layer.
- **The lit coverage layer ON the globe** (a rendered rectangle/extrusion per `CoverageEntry`). The
  data is ready and derived; the Cesium drawing is a `CesiumViewport` change and that file is under
  concurrent edit. It must be drawn from `siteEntryCoverageEntries()` and from nothing else (§2).
- **Globe-click → `descend`.** Requires a branch in the existing `ScreenSpaceEventHandler` inside the
  **§FORMA-CLICK-NO-NAV** guard — the same surface, and the same guard, as L-592.
- **Sub-jurisdiction coverage resolution.** A bbox is coarse (§2.2). Lighting the actual pack
  footprint needs a zone-geometry source we do not hold; until then the panel states its resolution
  rather than implying precision.

---

## §9 — Cross-refs

- **L-593** (audit) — the founder spike and the (A)/(B) decision.
- `docs/03-execution/spikes/SPIKE-L592-L593-GLOBE-ENTRY-AND-CONTEXT-SELECTION.md` — the
  architectural check this contract implements.
- `MISSING-CONTRACTS-AUDIT-2026-06-01.md` §"no contract owns the SITE-ENTRY flow" — the gap C60 fills.
- **C59** §0/§1.2/§2 · **C19** §1.3/§1.4 · **C57** §3.1 · **C58** §1.4/§1.5 · **C12** · **C06** §7/§233.
