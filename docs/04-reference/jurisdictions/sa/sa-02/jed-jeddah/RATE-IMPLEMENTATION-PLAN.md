# Rate Implementation Plan — Jeddah (`sa-jed-jeddah`)

**Current LEGISLATION rate:** ~53% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); composite master [`RATE.md`](./RATE.md) = ~19 %) · **Realistic ceiling (reachable from outside SA):**
~53% · **Ceiling with a geo-fence break (BLOCKED):** ~72% · **Gap to reachable ceiling:** ~0 pts (the work
is REALISING the 53, not raising it) · **Gap to Denmark (~96%):** ~43 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> Model references: **Denmark** [`../../dk/`](../../dk/RATE-IMPLEMENTATION-PLAN.md) (ceiling, ~96%) ·
> **Barcelona** [`../../es/es-ct/08019-barcelona/`](../../es/es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)
> (pilot climb). Jeddah inherits the national plan
> [`../../RATE-IMPLEMENTATION-PLAN.md`](../../RATE-IMPLEMENTATION-PLAN.md) unchanged, **plus** one
> city-specific layer: the **Al-Balad (Historic Jeddah) UNESCO heritage overlay**.

---

## 1 — The ceiling: what "maximum" means here

Jeddah is **geo-fence-bound like the nation**, with one city-specific subtraction: the **Al-Balad
(Historic Jeddah)** conservation regime (UNESCO World Heritage, inscribed 2014; Jeddah Historic District
Program GIS, 651 buildings). The national footprint is byte-identical to Riyadh/Dammam; the structural
fact that sets Jeddah's ceiling *below* the clean national ~55% is that **a fraction of central Jeddah's
most demo-worthy parcels sit inside Al-Balad**, where the honest answer is a *heritage refusal*, not the
national footprint — so those parcels leave the national-footprint denominator (−2 pts → ~53%).

**⇒ The realistic ceiling reachable from outside SA is ~53%.** As nationally, the footprint is exact and
already credited; every lever above it is geo-fenced. The ceiling **with a geo-fence break** (an in-SA
egress / Balady agreement, Jeddah bbox) is **~72%**, and a **JHD 651-building GIS agreement** would convert
Al-Balad from a refusal to an actual *fill* (a building-level conservation answer) — the one Jeddah-specific
lever no other city has. It stays below Denmark's 96% for the national reasons (per-Amana exact vertical;
GEOSA licensed) plus the heritage-governed core.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the rate only moves when `RATE.md` is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — confirm the national footprint applies (Section 4 binds all Amanas); identify Al-Balad + the Jeddah Development Authority as the local layers; write `RATE.md` | the honest baseline: national footprint −2 pt Al-Balad removal | — → ~53% | Done (master study §D.2) | **VERIFIED** | UNASSIGNED |
| **1** | **Ship the national FOOTPRINT pack (Jeddah bbox)** — reuse `saRiyadhDemo.ts` unchanged + a `JEDDAH_BBOX` provider; `resolveSaudiSetbacks` + per-class `maxCoverage`; vertical as a field-level BOUNDED cited-null refusal; human `VERIFICATION.md` sign-off (L-449) | the 66.7% national footprint as a **certified structured** answer on ordinary Jeddah fabric | ~53% (**realises**, holds) | Low — pack is city-agnostic; bbox + one human sign-off | **NOT STARTED** (pack authored for Riyadh; Jeddah reuses it) | UNASSIGNED |
| **1b** | **Al-Balad heritage refusal overlay** — wire the public UNESCO WHC property + buffer boundary as a refuse/flag layer | converts Al-Balad parcels from a *silent wrong-footprint risk* to a correct, cited heritage refusal (raises **trust**, not fill) | (honesty, not fill) | Low — UNESCO WHC boundary is public | **NOT STARTED** | UNASSIGNED |
| **1c** | **JHD 651-building GIS** — a data agreement with the Jeddah Historic District Program | a building-level conservation answer *inside* Al-Balad — a **fill**, not just a refusal (the Jeddah-only lever) | small +fill on the Al-Balad core | Medium (data agreement) | **BLOCKED** on a JHD agreement (GIS not confirmed open) | UNASSIGNED |
| **2** | **Exact vertical value** — read Amanat Jeddah approved plan + Jeddah Development Authority per-zone height from in-SA | converts height + floors from bounded-refusal to cited per-zone values | ~53% → ~61% | Medium (in-SA read) | **BLOCKED** — Amanat Jeddah / JDA geo-fenced (same wall as Riyadh) | UNASSIGNED |
| **3** | **Live per-parcel feed (Jeddah bbox)** — Balady `MapServer/28`: geometry + `MAINLANDUSE` + resolved setbacks + `NOOFFLOORS` | flips Jeddah from a constructed demo footprint to a **read** envelope | ~61% → ~72% | High — **business/legal** | **BLOCKED** on an in-SA egress / MOMRAH-Balady agreement | UNASSIGNED |
| **ctx** | **Context layers** — Copernicus GLO-30 DEM + Microsoft/Google ML footprints (Jeddah bbox) | the buildings + terrain axis | (separate axis) | Low (fallbacks) | **NOT STARTED** | UNASSIGNED |

> ⚠ Phases 1/1b **realise** ~53% and add trust; they do not raise the number. Phases 2–3 (and the fill part
> of 1c) are the rate-raising phases, and **all are BLOCKED on a geo-fence break or a JHD agreement**.

---

## 3 — The gap to Denmark (~96%)

Jeddah's ~43-pt gap is the national geo-fence gap (cases **(c)** geo-fenced live feed + licensed GEOSA and
**(b)** per-Amana fragmented vertical) **plus** the Al-Balad heritage core, where even a reachable national
footprint would be the *wrong* answer. Denmark digitised its dimensional values into national fields;
Jeddah's footprint rule is exact-but-must-be-constructed, its live data is geo-fenced, and its most iconic
central district is heritage-governed by a regime whose detailed GIS (JHD) is not confirmed open. The
Al-Balad delta is honest downward pressure — a refusal is not a fill — but the refusal is a *correct*
answer, not a blank (the national footprint would over-state on a protected parcel).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Depends on / already built (do not rebuild):**

- `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts` (authored for Riyadh, L-606) — **city-agnostic**;
  Jeddah reuses it unchanged with a `JEDDAH_BBOX`. `resolveSaudiSetbacks` + the field-level bounded-refusal
  for the vertical carry over identically.

**Blockers:**

- **Phase 1 — human `VERIFICATION.md` sign-off (L-449).** The one non-geo-fenced blocker.
- **Phase 1c — JHD 651-building GIS agreement.** The Al-Balad detailed conservation GIS is not confirmed
  open (the UNESCO WHC boundary *is* public, which is enough for the 1b refusal overlay).
- **Phase 2 — the exact vertical.** Amanat Jeddah (Etmam, `etmam.momrah.gov.sa`) + Jeddah Development
  Authority, geo-fenced.
- **Phase 3 — the live parcel feed.** Balady `MapServer/28` geo-fenced (NXDOMAIN + WAF-200).

**Cross-jurisdiction reuse:** Jeddah's only bespoke work is the **Al-Balad heritage overlay** — the
national footprint, the pack, the resolver, and the geo-fence discipline are all shared with Riyadh/Dammam.
The Al-Balad refuse/flag pattern (a public boundary as a correct-refusal overlay riding on an
otherwise-national mechanism) is itself the reusable template for any heritage-district city in the corpus.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (§1.2/§1.4 fidelity, §1.13 bounded
refusal), **ADR-0269**, **ADR-0270** (`setback` kind), **L-449** (human gate). Sources:
[`sources/SOURCES.md`](./sources/SOURCES.md), [`sources/VERIFICATION.md`](./sources/VERIFICATION.md);
national study [`../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §D.2.*
