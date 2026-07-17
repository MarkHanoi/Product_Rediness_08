# SPEC — Buildable-Envelope UI/UX Integration (first testable slice)

> **Stamp**: 2026-07-18 · **Status**: DRAFT (UX plan — governs the L-398 + L-402b first-slice build)
> **Trigger**: Founder — *"think, plan and document carefully the next 'envelope' test via UI/UX — in which view is the envelope shown in 3D? study the existing steps and plan the integration before deploying."*
> **Governs**: [C58 — Zoning Rules & Buildable Envelope](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md), [C57 — Parcel Data Layer](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md), [C19 — Site Model & Parcel](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [SPEC-COMPLIANCE-REPORT](./SPEC-COMPLIANCE-REPORT.md), audit item **L-398 / L-402b**.

---

## §0 — TL;DR (the founder's questions, answered)

- **In which view is the envelope shown in 3D?** → the **3D Site (Forma) view** (`activeSegment === 'forma'`). That view already renders the parcel boundary + white site-massing via `renderFormaMassing()`; the buildable envelope is a massing/context volume, so it belongs there — **not** a new view, and **not** (this slice) the BIM `3D + plan` editor.
- **How does it work via UI/UX?** → the user selects a parcel exactly as today; on **"Use this parcel"** the envelope is computed automatically and appears as a **translucent PRYZM-purple volume** inset from the parcel, in the 3D Site view the app already switches to. An **"Estimated" badge** + a compact facts card are always shown (honesty). A **show/hide toggle** lets the user compare parcel vs. envelope.
- **What is NOT in this slice** → real DK/ES zoning numbers (parallel track L-399), the "generate inside envelope" authoring step (L-401), and the full explain-why report (L-402a). Those are deliberately deferred; this slice proves the loop end-to-end with an honest **estimated** default rule pack.

---

## §1 — The existing flow this plugs into (studied, cited)

1. **Site step** — user lands on the 2D map (`SiteBoundaryMap2D`), switches to **Select parcel** (the L-384/L-405 toggle, now visible), clicks a Barcelona plot → violet highlight + info card.
2. **Commit** — **"Use this parcel"** → `useSelectedParcel()` → `buildBoundaryFromLatLonRing` → `siteDispatch` → **`site.parcel-boundary-set`** (C19 §1.4 one-shot immutable commit). The 2D map stays alive (O.7.2.b) for the onboarding confirm.
3. **View transition** — after commit the result view renders the parcel; the site launcher's `renderFormaMassing()` ([GISAreaLayout.ts:1714](../../../apps/editor/src/ui/layout/GISAreaLayout.ts)) draws the parcel + massing and the app sets **`activeSegment = 'forma'`** ([:2388](../../../apps/editor/src/ui/layout/GISAreaLayout.ts)). The 3-segment switcher (`'2D' 3D+plan · '3D' globe · 'forma' 3D Site`) lets the user move between surfaces; **"Zoom to Site"** reframes.

**Integration seam:** the envelope hangs off the **same `site.parcel-boundary-set` event** and renders through the **same `renderFormaMassing` Cesium surface** — no new view, no new event, no new store. This is the C19 spine + the existing Forma render path, reused.

## §2 — The envelope UX flow (this slice)

| Step | User sees / does | Under the hood |
|---|---|---|
| 1 | Selects + commits a parcel (unchanged) | `site.parcel-boundary-set` fires with the ring + per-edge front/side/rear classification (C19) |
| 2 | *(no extra click)* the app is already in **3D Site (Forma)** view | on the commit event, `ZoningRulesEngine.solve(ring, edgeClass, estimatedPack)` → `BuildableEnvelope`; stored via `site.updateZoning` + `Parcel.setbacks/maxHeight` |
| 3 | A **translucent #6600FF envelope volume** appears, inset from the parcel by the setbacks and extruded to the max height; the **parcel boundary stays drawn on the ground** so the setback gap reads clearly | envelope ring + height rendered on the `renderFormaMassing` Cesium primitive layer, anchored to the C19 site origin (LTP-ENU) |
| 4 | A compact **facts card** (top-right, brand white + purple): front/side/rear setbacks · max height · max GFA/FAR · **"Estimated" badge** · source line ("default rule pack — real Denmark/Spain zoning coming") | facts + `DerivationTrace` read straight off the `BuildableEnvelope` (C58) |
| 5 | An **"Envelope ⟶ on/off"** toggle near the view controls to compare parcel vs. envelope | show/hide the envelope primitive; default ON immediately after commit |

## §3 — Deliberate UX decisions (with rationale)

- **View = 3D Site (Forma), not BIM `3D+plan` (this slice).** The Forma view is the site-context massing surface where the parcel already renders; the envelope is context massing, not authored BIM geometry. The BIM view is for authored elements — the envelope becomes a *guide* there only once "generate inside envelope" (L-401) exists. Documented as phasing, not omission.
- **Automatic on commit, no extra click.** The envelope is the payoff of selecting a parcel — it should just appear ("select a plot, see what you can build"). No hunt-for-a-button.
- **Parcel outline stays visible.** The setback inset only reads as *meaning* if the user can see the gap between the parcel edge and the envelope wall.
- **"Estimated" badge is mandatory and always visible** (C58 §2.2 two-fidelity honesty). We never show an estimated envelope as if it were authoritative zoning.
- **Purple (#6600FF), translucent.** Matches the unified PRYZM preview colour; translucency lets the site/context read through so it's clearly a *study volume*, not a solid building.
- **Lifecycle:** the envelope clears when the parcel is cleared/re-selected, and must not disturb the existing Forma massing render (idempotent re-render).

## §4 — Render placement & the "does it sit on the parcel right?" risk

The single biggest visual failure mode is the envelope floating off the parcel or at the wrong scale (the LTP-ENU origin is pinned to the first parcel vertex — see `§FORMA-ORIGIN-IS-SCENE-FRAME`). The build MUST:
- anchor the envelope ring in the **same LTP-ENU frame** as `renderFormaMassing` uses for the parcel (reuse its projection, do not re-derive), and
- verify visually that the envelope base is coincident with the (inset of the) drawn parcel, at the correct metric height.
This is the acceptance gate before deploy: **parcel outline on the ground + envelope volume inset inside it by the setbacks, same footprint origin.**

## §5 — Acceptance (what the founder tests on Fly)

On `pryzm.fly.dev`, hard-refresh → new project → Select parcel → Barcelona plot → **Use this parcel** →
1. lands in **3D Site** view,
2. a **purple translucent envelope volume** sits **inset inside** the parcel outline, at a sensible height,
3. a **facts card with an "Estimated" badge** shows setbacks + height,
4. the **on/off toggle** hides/shows it,
5. switching to `3D globe` / `3D + plan` and back does not corrupt the render, and clearing/re-selecting a parcel replaces the envelope cleanly.

## §6 — Out of scope (parallel/next tracks — do not build here)
Real DK Plandata / ES Catastro zoning ingestion (L-399) · generate-inside-envelope authoring bridge (L-401) · full explain-why report view (L-402a) · per-edge variable setback UI editing · CH/ES jurisdictions. This slice ships the **estimated default pack** only.
