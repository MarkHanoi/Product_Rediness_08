# Rate Implementation Plan — Riyadh (`sa-ruh-riyadh`) — THE DEMO CITY

**Current rate:** ~54% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling (reachable from outside SA):**
~54% · **Ceiling with a geo-fence break (BLOCKED):** ~72% · **Gap to reachable ceiling:** ~0 pts (the work
is REALISING the 54, not raising it) · **Gap to Denmark (~96%):** ~42 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> Model references: **Denmark** [`../../dk/`](../../dk/RATE-IMPLEMENTATION-PLAN.md) (ceiling, ~96%) ·
> **Barcelona** [`../../es/es-ct/08019-barcelona/`](../../es/es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)
> (pilot climb). Riyadh is the Saudi **demo city** — the furthest-along of the three (the national footprint
> pack is authored here, L-606) — but its climb SHAPE is the national one: reachable ceiling ≈ current rate,
> the real work is realising it + the BLOCKED geo-fence phases. See the national plan
> [`../../RATE-IMPLEMENTATION-PLAN.md`](../../RATE-IMPLEMENTATION-PLAN.md) — Riyadh inherits it, plus the
> RCRC/ROSHN/ADA density surface.

---

## 1 — The ceiling: what "maximum" means here

Riyadh is **geo-fence-bound, identically to the nation** (the national footprint is byte-identical), with
one city-specific twist: it is the Kingdom's densest concentration of §1 cl. 3 **development-authority
land** (RCRC, ROSHN, King Salman Park, Diriyah Gate, Qiddiya-adjacent corridors). The single structural
fact that sets the ceiling is the same as nationally — **the footprint rule is already exact and credited,
and every lever above it is geo-fenced** — but Riyadh's development-authority pervasiveness is *both* a
minor drag on the current rate (the −1 pt R1 surface, see `RATE.md`) *and* the specific in-SA source that
would unblock its exact vertical (the RCRC/ADA corridor tables that publish per-corridor FAR/height).

**⇒ The realistic ceiling reachable from outside SA is ~54%.** The footprint is exact and already credited;
nothing reachable raises it. The ceiling **with a geo-fence break** (an in-SA egress or a Balady/RCRC
agreement scoped to the Riyadh bbox) is **~72%** — Balady `MapServer/28` already carries geometry +
`MAINLANDUSE` + resolved setbacks + `NOOFFLOORS` per Riyadh parcel, so Riyadh would flip from a constructed
demo footprint to a **read** envelope. It stays below Denmark's 96% because the exact vertical remains
per-corridor (RCRC/ADA) rather than a single national number, and GEOSA's national products are licensed.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — read the primary decision live; author the Riyadh footprint pack; run the floor/height + Balady geo-fence probes (measured on shape); write `RATE.md` | the honest baseline: exact footprint + cited vertical ceiling; the RCRC/ADA R1 surface named | — → ~54% | Done (L-606) | **VERIFIED** | UNASSIGNED |
| **1** | **Ship + certify the footprint pack (the big shippable win)** — wire `saRiyadhDemo.ts`: `index.ts` export, `registry.ts` `JurisdictionRegistration`, `providers/riyadhBbox.ts` (`RIYADH_BBOX` ~24.4–25.1 N / 46.4–47.1 E), L5 class-dropdown dispatcher → `saRiyadhResolvedPack(width, class)` → `computeBuildableEnvelope`; human `VERIFICATION.md` sign-off (L-449) | the 66.7% national footprint as a **certified structured** answer, live in the demo; pack `estimated-ruleset` → `structured` | ~54% (**realises**, holds) | Low — pack authored (L-606); wiring TODO + one human sign-off | **IN PROGRESS** (WIRING TODO in `saRiyadhDemo.ts`; `VERIFICATION.md` unsigned) | UNASSIGNED |
| **2** | **Exact vertical value** — read RCRC/ADA per-corridor height/FAR tables + the Amanat Riyadh approved plan (the R1 development-authority surface) from in-SA | converts height + floors + the R1 override from bounded-refusal to cited per-corridor values | ~54% → ~62% | Medium (in-SA read; assert on content, not HTTP 200) | **BLOCKED** — `trc.alriyadh.gov.sa` ECONNREFUSED, `rcrc.gov.sa` WAF-rejected (L-606 §4) | UNASSIGNED |
| **3** | **Live per-parcel feed (Riyadh bbox)** — reach Balady `MapServer/28`: geometry + `MAINLANDUSE` + resolved setbacks + `NOOFFLOORS` per Riyadh parcel | flips Riyadh from a constructed demo footprint to a **read** envelope; drops the user-drawn-plot substitute | ~62% → ~72% | High — **business/legal, not engineering** | **BLOCKED** on an in-SA egress / MOMRAH-Balady data agreement (`umapsudp.momrah.gov.sa` NXDOMAIN; proxy WAF-200) | UNASSIGNED |
| **ovl** | **RCRC/ROSHN master-plan overlay** — wire the open giga-project boundaries as a §1 cl. 3 override/flag | converts the R1 zones from a silent wrong-footprint risk to a correct cited override refusal (raises *trust*, not fill) | (honesty, not fill) | Medium (boundary sourcing) | **NOT STARTED** | UNASSIGNED |
| **ctx** | **Context layers** — Copernicus GLO-30 DEM + Microsoft/Google ML footprints for the Riyadh bbox | the buildings + terrain axis (separate from the dimensional fill) | (separate axis) | Low (global fallbacks) | **NOT STARTED** (fallbacks available) | UNASSIGNED |

> ⚠ Phase 1 **realises** ~54% as a certified product; it does not raise the number. Phases 2–3 are the only
> rate-raising phases and **both are BLOCKED on a geo-fence break**.

---

## 3 — The gap to Denmark (~96%)

Riyadh's ~42-pt gap is the national gap plus its R1 drag — template cases **(c) geo-fenced/licence-gated**
(the Balady live feed + the RCRC/ADA vertical, both measured geo-fences) and **(b) fragmented vertical**
(exact height per-corridor, not one national number). It is **not** the Barcelona OCR case: the footprint
is already an exact structured national formula. Denmark returns zone + density + height as digitised
national fields for ~96% of clicks; Riyadh returns an exact footprint *rule* but **no reachable per-parcel
feed** from here, and its densest, most demo-worthy land (the giga-project corridors) is exactly where a
development authority — not the national decision — governs. That inaccessibility of Riyadh's *best* data
(Balady, resolved per parcel) is the whole distance.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Depends on / already built (do not rebuild):**

- `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts` (authored, L-606) — two zones (`sa-villa`
  0.75, `sa-apartment` 0.65), `resolveSaudiSetbacks` (width→triple), height/floors as a field-level
  BOUNDED cited-null refusal (`SA_HEIGHT_PLAN_DEFERRED_REF` + `SA_MAX_HEIGHT_M`/`SA_MAX_FLOORS_VILLA`).
  Mapped onto the existing `setback` kind — **no new schema kind** (the `esBarcelona20aAillada` precedent,
  L-606 §2). Verified end-to-end against `computeBuildableEnvelope` (L-606 §1).
- **This pack is the reusable core for all three Saudi cities** — Jeddah and Dammam reuse it unchanged with
  their own bbox; do not fork it.

**Blockers:**

- **Phase 1 — human `VERIFICATION.md` sign-off (L-449).** The clause-transcription is done (L-606 §4b);
  only the human gate remains → the one non-geo-fenced blocker. This is the fastest win in the whole tree.
- **Phase 2 — the exact vertical (R1 surface).** RCRC/ADA corridor tables geo-fenced; BLOCKED on an in-SA
  read. Note these are development-authority instruments that *override* the national decision — the R1 trap.
- **Phase 3 — the live parcel feed.** Balady `MapServer/28` geo-fenced (NXDOMAIN + WAF-200); BLOCKED on an
  in-SA egress / MOMRAH-Balady agreement — the single highest-value unlock (geometry + class + width + exact
  floors in one step, L-606 §4 / master study §E).

**Cross-jurisdiction reuse:** Riyadh is the **template demo** for the Kingdom — its authored pack, its
`resolveSaudiSetbacks` resolver, its field-level bounded-refusal for the vertical, and its measured-geo-fence
discipline (assert on content, not HTTP 200) are all reused directly by Jeddah and Dammam. The only per-city
additions are Jeddah's Al-Balad heritage overlay and each city's local Amana/development-authority vertical.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (§1.2/§1.4 fidelity, §1.13 bounded
refusal), **ADR-0269**, **ADR-0270** (`setback` kind), **L-449** (human gate), **L-606** (the Riyadh pack +
geo-fence probes). Sources: [`sources/SOURCES.md`](./sources/SOURCES.md),
[`sources/VERIFICATION.md`](./sources/VERIFICATION.md),
[`findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`](./findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md).*
