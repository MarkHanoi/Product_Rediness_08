# ADR-0337 — The app PHASE is DECLARED at the open gesture, not latched by whatever view the user happens to click

- **Status**: ACCEPTED
- **Date**: 2026-08-19
- **Issue**: [L-1186](../../04-reference/ISSUE-LOG.md) — *"why when opening a project in a new session am I OFTEN missing buttons — the PRYZM Earth, the Split View… etc."*
- **Contract**: [C06 §10](../contracts/C06-UI-SHELL-AND-TOOLS.md#10--app-phase-and-phase-gated-chrome) (minted by this ADR)
- **Supersedes**: nothing. **Amends** the phase model introduced by `§UX1-PANEL-DEFAULTS` / `§UX1-PHASE-CHROME` (2026-08-18/19).
- **Principles**: P6 (the decision has one owner), P8 (the failure is surfaced, not inferred)

---

## Context

`apps/editor/src/ui/layout/panelDefaults.ts` gained a PHASE axis on 2026-08-19 so that
model chrome would not float over the onboarding globe. The table it introduced is
correct and is not in question here. What was missing is the other half: **who tells the
table which phase the application is in.**

Measured at `638cdf33`, `currentPhase` initialised to `'onboarding-globe'` and exactly
two production call sites ever moved it to `'canvas'`:

| Site | Reached when |
|---|---|
| `enterCanvasWithSitePlan.ts:101` | the guided flow lands the user with a committed site plan |
| `GISAreaLayout.ts:811` (`activateView`) | the user clicks a BIM view-mode button (3D / Top / Front / …) |

Neither is on the path a user takes to open a project that already exists. A hub card
click, a deep link and the reopen-after-reload path all run
`PlatformRouter.launchWorkspace()`, and **nothing on that path spoke**. The phase
therefore read `'onboarding-globe'` for the whole session,
`panelAbsent('launcher-rail')` stayed TRUE, and `GISAreaLayout.mountSiteViewLauncher()`
returned early — SKIP-MOUNT, so the six floating pills (Buildable Envelope · Site
Analysis · Living Graph · Graph · Plan + Site · PRYZM Earth), the Split View toggle, the
reset control and the View-Properties launcher were **never created at all**.

Two consequences worth naming separately, because they explain the report's shape:

- **"OFTEN, not always" was the diagnosis, not a complication.** The chrome came back for
  any session in which the user later happened to click a view-mode button, and never for
  one in which they did not.
- **It was invisible rather than ugly.** A wrong phase did not mis-style the rail; it
  meant the rail had no DOM node to inspect. That is what SKIP-MOUNT buys and what it
  costs.

A second, independent instance of the same shape was found while proving the first: the
guided flow declares its START (`OnboardingStepController.start()`) but only ONE of its
four EXITS declared the end. A user who skipped the site draw finished onboarding with
the same chrome missing.

### The class of defect

The phase was **state that had to be REMEMBERED by whoever happened to pass through the
right code**, rather than DERIVED from the fact that determines it. That is this repo's
signature failure — the same shape as an invalidation keyed on the wrong thing
(C85 §10.5 / L-1159) and a hand-written event list with zero emitters (L-1189), both
closed the same week.

## Decision

**The phase is declared at the seam that knows the fact, before any chrome mounts. It is
never left to be latched by an unrelated later interaction.**

1. **`'canvas'` is the resting state; `'onboarding-globe'` is the exceptional one**, and
   the exceptional state is **bracketed by its owner** — `start()` opens the bracket,
   `dispose()` closes it, so every exit of the guided flow declares the end.
2. **The project-open gesture declares the phase.** `PlatformRouter.launchWorkspace()` —
   the one seam every open passes through — calls the new
   `panelDefaults.declarePhaseForProjectOpen(gesture)`. Opening a project that already
   exists IS arriving at the canvas.
3. **The guided create hop marks itself** (`{ guidedOnboarding: true }`) so the open seam
   does not pre-empt the flow and the rail does not flash on for a frame during
   onboarding. It is keyed on the GESTURE, explicitly **not** on `isNewProject`: the
   hub's *"Skip — blank canvas"* create is also a new project and runs no guided flow.
4. **The module-load default stays `'onboarding-globe'`.** Defaulting to `'canvas'` would
   put model chrome over a globe with no model — the original report. A silent path must
   degrade to *quiet*, never to *wrong*. Point 2 is what makes that safe: no path that
   matters is silent any more, so the default is genuinely unreachable in normal
   operation instead of being the value half the application accidentally ran in.

C06 §10.3 carries the complete declare-register and the MUST that a new project-entry
path joins it in the PR that mints it.

## Alternatives considered

- **Mirror the active view (globe view ⇒ globe phase).** Rejected, and it was rejected in
  the original design for the right reason: a canvas user who opens PRYZM Earth to look
  at their site would lose the launcher rail — including the pills that bring them back.
  A capability becoming unreachable by being clever about phases is worse than the bug.
- **Default the module to `'canvas'`.** Rejected: the guided flow starts on
  `pryzm-project-loaded`, i.e. AFTER the editor chrome mounts, so this reintroduces the
  UX1 report as a visible flash and makes the safe direction the unsafe one.
- **Derive the phase by sniffing the DOM** (is the onboarding overlay mounted?).
  Rejected: fragile, and wrong during the RAC conversation, when the guided session is
  live but its overlay does not exist yet.
- **Add `setAppPhase('canvas')` to `ViewController.activate()`** instead of the router.
  Rejected as the primary fix: it is still a latch waiting for an interaction, just a
  slightly more likely one. It would have narrowed "often" without closing it.

## Consequences

**Positive.** The direct-open path mounts its chrome the first time, with no user
interaction required. The skip-the-draw onboarding exit is closed by the same model. The
three lanes that shipped phase-gated chrome in the last 24 hours (the launcher rail,
default-closed panels + the View-Properties launcher, and the `hiddenWhileLoading` gate)
all inherit the fix without changes — **none of them was the cause**; nothing was
declaring the phase they key on.

**Negative / owed.**

- No CI gate counts the C06 §10.3 register against the production call sites. The
  reachability assertions in `projectOpenPhase.spec.ts` are source string matches and
  catch the rename/deletion class only. Named in C06 §10.7.
- `'canvas'` remains a one-way latch within a session. Every guided exit now declares it,
  so the latch is no longer *how* the canvas is reached — but a future third phase would
  need the derivation completed, not another exception added.
- The HIDE rows of `phaseChrome.ts` still run their subscriptions while hidden (L-1025),
  unchanged by this ADR.

## Verification

- `apps/editor/src/ui/__tests__/projectOpenPhase.spec.ts` — 11 cases walking the
  DIRECT-OPEN path through the production declaration (never `setAppPhase`, which would
  be stubbing the thing under test and would have passed on the bug), plus labelled
  source-evidence reachability cases.
- `npx vitest run` over `projectOpenPhase` + `phaseChrome` + `panelDefaults`: 3 files,
  59 passed.
- Root `tsc --skipLibCheck --noEmit`: `COMPILER_RC=0`, 0 errors.
