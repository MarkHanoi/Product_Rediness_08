# Rate Implementation Plan — Dammam (`sa-dmm-dammam`)

**Current rate:** ~55% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling (reachable from outside SA):**
~55% · **Ceiling with a geo-fence break (BLOCKED):** ~72% · **Gap to reachable ceiling:** ~0 pts (the work
is REALISING the 55, not raising it) · **Gap to Denmark (~96%):** ~41 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> Model references: **Denmark** [`../../dk/`](../../dk/RATE-IMPLEMENTATION-PLAN.md) (ceiling, ~96%) ·
> **Barcelona** [`../../es/es-ct/08019-barcelona/`](../../es/es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)
> (pilot climb). Dammam inherits the national plan
> [`../../RATE-IMPLEMENTATION-PLAN.md`](../../RATE-IMPLEMENTATION-PLAN.md) with **no** city-specific
> subtraction — it is the **cleanest** of the three cities, so its rate equals the national ~55%.

---

## 1 — The ceiling: what "maximum" means here

Dammam is **geo-fence-bound, identically to the nation, with no local carve-out**. The national footprint
is byte-identical to Riyadh/Jeddah; Dammam's only local layer is the ordinary **Amanat Eastern Province**
approved plan for the exact vertical value — the same geo-fenced municipal value every Saudi city has.
Unlike Jeddah (Al-Balad removes central parcels, −2 pts) and Riyadh (pervasive RCRC/ROSHN density authority,
−1 pt), Dammam carries **no downward pressure**, so its rate *is* the national rate and its honest
denominator is the **widest of the three** — the most defensible ordinary-fabric demo.

**⇒ The realistic ceiling reachable from outside SA is ~55%.** The footprint is exact and already credited;
every lever above it is geo-fenced. The ceiling **with a geo-fence break** (an in-SA egress / Balady
agreement, Dammam bbox) is **~72%** — Balady already carries geometry + `MAINLANDUSE` + resolved setbacks +
`NOOFFLOORS` per parcel, so Dammam would flip from a constructed demo footprint to a **read** envelope. It
stays below Denmark's 96% for the national reasons (per-Amana exact vertical; GEOSA licensed).

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — confirm the national footprint applies (Section 4 binds all Amanas); confirm no UNESCO-scale heritage or giga-project density authority; write `RATE.md` | the honest baseline: national footprint, no local subtraction → = national ~55% | — → ~55% | Done (master study §D.3) | **VERIFIED** | UNASSIGNED |
| **1** | **Ship the national FOOTPRINT pack (Dammam bbox)** — reuse `saRiyadhDemo.ts` unchanged + a `DAMMAM_BBOX` provider; `resolveSaudiSetbacks` + per-class `maxCoverage`; vertical as a field-level BOUNDED cited-null refusal; human `VERIFICATION.md` sign-off (L-449) | the 66.7% national footprint as a **certified structured** answer on the widest ordinary-fabric denominator of the three | ~55% (**realises**, holds) | Low — pack is city-agnostic; bbox + one human sign-off | **NOT STARTED** (pack authored for Riyadh; Dammam reuses it) | UNASSIGNED |
| **2** | **Exact vertical value** — read the Amanat Eastern Province approved plan per-zone height/floors from in-SA | converts height + floors from bounded-refusal to cited per-zone values | ~55% → ~63% | Medium (in-SA read) | **BLOCKED** — Amanat Eastern Province geo-fenced (same wall as Riyadh) | UNASSIGNED |
| **3** | **Live per-parcel feed (Dammam bbox)** — Balady `MapServer/28`: geometry + `MAINLANDUSE` + resolved setbacks + `NOOFFLOORS` | flips Dammam from a constructed demo footprint to a **read** envelope | ~63% → ~72% | High — **business/legal** | **BLOCKED** on an in-SA egress / MOMRAH-Balady agreement | UNASSIGNED |
| **ctx** | **Context layers** — Copernicus GLO-30 DEM + Microsoft/Google ML footprints (Dammam bbox) | the buildings + terrain axis | (separate axis) | Low (fallbacks) | **NOT STARTED** | UNASSIGNED |

> ⚠ Phase 1 **realises** ~55% as a certified product; it does not raise the number. Phases 2–3 are the only
> rate-raising phases and **both are BLOCKED on a geo-fence break**.

---

## 3 — The gap to Denmark (~96%)

Dammam's ~41-pt gap is purely the national geo-fence gap — template cases **(c)** geo-fenced live feed +
licensed GEOSA, and **(b)** per-Amana fragmented exact vertical — with **no heritage or density carve-out**
on top. Denmark digitised its dimensional values into national fields; Dammam has an exact-but-constructed
footprint rule and a geo-fenced live feed. Because Dammam has the fewest local exceptions, it is the city
where the pure national geo-fence story is cleanest: everything above the exact footprint waits on a
business/legal unlock, not on engineering.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Depends on / already built (do not rebuild):**

- `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts` (authored for Riyadh, L-606) — **city-agnostic**;
  Dammam reuses it unchanged with a `DAMMAM_BBOX`. `resolveSaudiSetbacks` + the field-level bounded-refusal
  for the vertical carry over identically.

**Blockers:**

- **Phase 1 — human `VERIFICATION.md` sign-off (L-449).** The one non-geo-fenced blocker.
- **Phase 2 — the exact vertical.** Amanat Eastern Province approved plan, geo-fenced (same wall as Riyadh).
- **Phase 3 — the live parcel feed.** Balady `MapServer/28` geo-fenced (NXDOMAIN + WAF-200).
- ⚠ Any Eastern-Province development-authority zone that overrides the vertical (§1 cl. 3) is not enumerated
  this pass — treat as a possible R1-style surface; prefer ordinary-fabric demo plots.

**Cross-jurisdiction reuse:** Dammam has **no bespoke work at all** — it is the pure reuse case (national
footprint + pack + resolver + geo-fence discipline, plus a bbox). It is therefore the cheapest of the three
to bring to a certified footprint demo, and the best proof that the Saudi national pack is genuinely
country-wide, one formula.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (§1.2/§1.4 fidelity, §1.13 bounded
refusal), **ADR-0269**, **ADR-0270** (`setback` kind), **L-449** (human gate). Sources:
[`sources/SOURCES.md`](./sources/SOURCES.md), [`sources/VERIFICATION.md`](./sources/VERIFICATION.md);
national study [`../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §D.3.*
