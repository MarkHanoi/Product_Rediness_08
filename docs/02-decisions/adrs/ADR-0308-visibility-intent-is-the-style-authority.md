# ADR-0308 — The Visibility Intent is the style authority; a legacy default is not an override

**Status:** ACCEPTED · **Date:** 2026-08-09 · **Supersedes:** nothing · **Amends:** [C09](../contracts/C09-AI-AND-VISIBILITY-INTENT.md) §4 (adds §4.7)

**Context tag:** `§FIX-VISIBILITY-INTENT-AUTHORITY` · **Issue log:** L-777 · **Commits:** `bc850c22`, `8226b166`

---

## 1. The report

Founder, 2026-08-08:

> "The Visibility Intent should govern each view's visibility. At the moment it is not
> working. It should COMPLETELY govern plan view, section and elevation views — ALL."

The `VISIBILITY INTENTS` panel is large and carefully built: five system intents, four
element states (`cut` / `beyond` / `hidden` / `projection`), and per element type a full
appearance record — visibility, line weight, colour, opacity, style, fill style (`poche`),
fill colour, fill opacity, symbolic rule, 3D surface. None of it reached the drawing.

## 2. What was actually wrong

**The intent was resolved correctly and then discarded.**

`PlanViewCanvas.render()` resolves a pen through the sanctioned chain —
`graphicsRulesEngine.resolveStyle()` (Contract-23 §7.1), which layers the bound intent
(priority 1000) beneath view (9000) and element (10000) overrides. It then overwrote the
answer, per line:

```js
ctx.strokeStyle = vgEdge ?? _pen.color;
ctx.lineWidth   = max(hairline, _penPx * (vgLineWeight / VG_BASE_LINE_WEIGHT));
```

`vgEdge` / `vgLineWeight` came from the legacy `vgGovernanceStore.resolveStyle()`, and
**that store never returns nothing**: `ensureModel()` stamps every model with
`templateId: 'pryzm-default'`, and the built-in template hard-codes an `edgeColor` and a
`lineWeight` for wall, slab, column, beam, door, window, roof, stair, furniture, plumbing
and grid.

So for every element in every plan, section and elevation:

- the intent's **line colour was unconditionally discarded** — drawings painted in the
  template's colours (wall `#000000`, door `#5a4010`, window `#336699`) whatever the
  panel said;
- the intent's **line weight was multiplied** by the template's relative weight
  (wall / column / beam = 2 ⇒ those lines drew at **double** the authored width, in all
  four zones).

The `??` reads like a fallback. It was not one: the left operand was never null, so the
right operand — the correct, intent-derived pen — was dead code at every call.

## 3. Decision

**A DEFAULT IS NOT AN OVERRIDE.** The legacy VG cascade may contribute to the drawn line
**only where a human explicitly set the property**, never where it is merely echoing a
built-in seed.

This is not a new rule; it is the existing one, enforced. C09 §4.3 places
`LocalViewOverrides` **last** in the precedence chain — it does not place a legacy
template's built-in seed **ahead** of the master intent. C09 §4.5 states that intents
**replace** Revit-style view templates. The code disagreed with the contract, so **the
code was wrong** (C01 governance order).

### 3.1 Mechanism

`packages/core-app-model/src/presentation/VgCanvasStyleResolver.ts` is now the single
place the legacy cascade may speak to the 2D canvas. It returns a contribution only when
`overriddenProps` — VG's own record of "a human decided this", maintained by
`SetVGCategoryStyleCommand` / `SetVGViewCategoryStyleCommand` — contains the property.

Where VG is echoing a default, `edgeColor` and `lineWeight` come back `null`, and
`vgEdge ?? _pen.color` becomes a no-op **by construction** rather than by convention.
Intent authority is restored **without** removing the user's ability to override a view.

### 3.2 One resolver, not two

The logic was a hand-copied closure in **both** `PlanViewManager._buildContext()` and
`SplitViewManager._setupContext()` — a 15-line zone-suffix parser that had already
drifted once (one copy passed the `viewId` where the other passed the `modelId`).
Divergent copies are how this repository's drift begins; there is now one.

### 3.3 Scope — all three view families

`PlanViewCanvas` treats `section`, `elevation` and `building-elevation` as *vertical*
views through the same code path, and both production hosts inject the same resolver. So
plan, section and elevation are governed by one change.

⚠ `DefaultViewsManager` creates a 3D view, one plan and four elevations — and **no
section view**. Sections are *supported and governed*; none exists by default. That is a
separate gap, not a visibility-intent defect.

## 4. Consequences

- The panel now governs the drawn line for plan, section and elevation.
- An explicit per-view VG override still wins (C09 §4.3 intact) — verified by test.
- The legacy cascade is no longer a silent authority; it is an explicit, recorded one.
- Any future writer to `vgGovernanceStore` **must** register the property in
  `overriddenProps`, or its change will correctly be ignored as a default.

## 5. How this is proved — the positive control

Every "the intent governs" claim is proved by **planting a deliberately extreme rule**
(5 mm magenta walls) and showing the composed stroke moves to it, for `plan`, `section`
and `elevation`, each asserting that view type's own `lineWeightMultiplier`
(1 / 1.5 / 1.5).

Two properties make this a guard rather than a self-congratulating test:

1. **It asserts on the composed stroke, not the intent record.** A test asserting
   `intent.elementRules.wall.cut.line.colour === '#ff00ff'` scores 1.000 on the *broken*
   build. The test composes the exact two expressions `PlanViewCanvas.render()` evaluates,
   from the same two producers.
2. **It asserts VG contributes `null` first.** Otherwise the number could be the
   template's and the equality a coincidence rather than a proof.

Asserting the per-view-type multiplier is what makes it a reachability guard for all
three families at once: if the viewType tier stopped running for section or elevation,
plan would still pass.

## 6. ⚠ Two lessons that cost more than the bug

**6.1 The divergence was already measured, and never closed.**
`IntentAuthorityOracle.test.ts` — the "B0 oracle" — was written to size exactly this
change ("change the AUTHORITY, not the PIXELS"). B2a, the change itself, was never
landed. The measurement existed, was correct, and sat unused. This is the
*authored-but-unwired* pattern applied to a **finding** rather than to code.

**6.2 An agent worktree cannot typecheck a cross-package change.**
Root `tsc` inside the authoring worktree reported four errors, two of which were
phantoms (`resolveVgCanvasStyle is not exported`, `explainStyle does not exist`). Both
symbols existed — in that worktree. But every worktree symlinks
`node_modules/@pryzm/*` back to the **main** tree:

```
c6-worktree/node_modules/@pryzm/core-app-model
    -> /…/Product_Rediness_08/packages/core-app-model
```

so `apps/editor` typechecks against main's packages, not its own. New exports read as
missing; and — more dangerous — a **breaking** package change would read as clean.

**Verification of a cross-package change is only meaningful after merge.** Same shape as
L-774 (the ga-gate runner that could not spawn): the tool was broken, not the thing under
test. It nearly produced a second false "this is broken" report in one day.

## 7. Alternatives rejected

| Option | Why rejected |
|---|---|
| Delete the `vgEdge`/`vgLineWeight` override entirely | Removes the user's legitimate per-view override (C09 §4.3). The bug is that defaults outrank intent, not that overrides exist. |
| Reorder the `??` so the pen wins | Same defect inverted: an explicit override would then be discarded. Precedence must be decided by *whether a human set it*, not by operand order. |
| Fix it in both call sites | Two copies had already drifted once. The fix is one resolver. |
| Raise the intent's priority above the template | Priorities compare *tiers*; the template is not a tier, it is a seed. Encoding a seed as a high-priority tier would make it harder, not easier, to override. |

## 8. Follow-ups

- `DefaultViewsManager` creates no section view (§3.3).
- No browser end-to-end run: the test composes the same expressions the canvas evaluates,
  which is strong, but is not the canvas painting. **Unproven, and stated as such.**
- `VisibilityIntentPanel`: the element-type list does not scroll, and there is no
  *Apply changes* affordance (founder, 2026-08-09).
