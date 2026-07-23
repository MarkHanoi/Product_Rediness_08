# Saudi Arabia — market-entry effort assessment

**Created 2026-07-22 (seed). Converted from reported to measured 2026-07-22 (this pass).**
Founder-designated **demo market**. This file was seeded from an external research pass at that
pass's own confidence tiers; a PRYZM live-probe pass has since read the primary law and enumerated
the parcel backend directly. **Every claim below now carries a tier, and the load-bearing ones are
`VERIFIED-LIVE`.**

> ## HEADLINE — the MVP question is answered YES, with a bounded caveat, and Saudi Arabia is CHEAPER than Barcelona for a demo.
>
> **A first-pass buildable FOOTPRINT can be produced from `street width + plot classification`
> alone, with no parcel→zone portal lookup** — because Saudi setbacks and ground coverage are a
> **pure, nationally-published function of exactly those two inputs**, and I read that function in
> the primary ministerial decision (`SAUDI-PRIMARY-DECISION-EXTRACT.md`). The single most expensive
> thing built for Barcelona — **parcel→zone resolution** — drops off the critical path for the
> footprint. **The caveat:** floor count and max height are NOT national — they defer to the
> municipal plan and are overridden by development-authority regulations (§6, the Barcelona trap,
> and it is written into the primary law). So the FOOTPRINT is demo-ready cheaply; the VERTICAL
> EXTENT needs a per-zone source or a demo assumption.

---

## 0 — The one structural difference from Barcelona, now measured

Barcelona lands at a **~48 % PGM-only ceiling** because *edificabilitat* is an **envelope** that
cannot be reduced to a per-parcel FAR, and because **62.8 % of the city is governed by derived
planning the general plan does not contain**
(`../../spain/barcelona-catalonia/L-590c-PLA-PARCIAL-REGIME-RESOLVED.md`).

**What the seed asserted about Saudi Arabia, and what the probe found:**

| Seed claim | Verdict after live probe | Tier |
|---|---|---|
| Publishes explicit numeric tables (coverage, setbacks, height) | ✅ **TRUE** — read in the 2024 MOMRAH decision | `VERIFIED-LIVE` |
| Rules keyed to `classification + street width`, no per-location zoning lookup | ✅ **TRUE for setbacks + coverage** (the footprint) | `VERIFIED-LIVE` |
| …for the WHOLE envelope | ❌ **FALSE** — floors & height defer to the municipal plan; dev-authority regs override | `VERIFIED-LIVE` (§6) |
| Max FAR published (e.g. hotel 3) | ⚠ **MISLEADING** — the *residential* decision has **no FAR at all**; FAR 3 is a *commercial/hotel* document | `VERIFIED-LIVE` (§5 of extract) |
| Parcel geometry paid / surveyor-mediated, "no open API" | ⚠ **PARTLY WRONG** — a rich parcel API **exists** and already carries setbacks+use+floors, but is **geo-fenced / WAF-blocked** from outside SA | `VERIFIED-LIVE` (`SAUDI-UMAPS-API-ENUMERATION.md`) |
| U-Maps "soft-404, no backend" | ❌ **DEAD** — backend enumerated in the shell's own first 8 KB | `VERIFIED-LIVE` |
| `ROBOTS_DISALLOWED` on the decision PDF = unreachable | ❌ **DEAD** — one `curl`, HTTP 200, 5 MB PDF, read | `VERIFIED-LIVE` |

---

## 1 — 🔴 THE MVP QUESTION, ANSWERED

> **Can a first-pass buildable envelope be produced from `street width + plot classification` ALONE,
> without resolving the parcel to a zone through a municipal portal?**

**YES for the footprint (the geometrically hard, expensive part). PARTIALLY for the vertical extent.**

The evidence is the primary law, read directly (`SAUDI-PRIMARY-DECISION-EXTRACT.md` §4):

**Setbacks** — a closed-form function of `(streetWidth, class)`:
```
front  = max(streetWidth / 5, 3 m)          [both villa and apartment; ≥6 m where street ≥30 m]
side   = max(streetWidth / 5, 2 m)
rear   = max(streetWidth / 5, 2 m)
neighbour = 1.5 m (villa) | 3 m (apt >5 floors) | 2 m (apt ≤5 floors)
```
**Coverage** — a function of `class` alone:
```
villa:      ground 75%, upper 75%, annex 70%
apartment:  ground 65%, upper 75%, annex 70%   (same for commercial & administrative apt)
```

Both inputs are obtainable **without a portal lookup**:
- **`class`** — a 4-item national taxonomy (villa / apartment / apt-commercial / apt-administrative),
  chosen by the user in a demo dropdown. It is NOT a per-parcel portal field a demo must fetch.
- **`streetWidth`** — either measured from geometry (`streetWidth.ts`, see §7) or, in a demo,
  user-drawn / user-entered. Saudi's *definition* of عرض الشارع is frontage-to-frontage — identical
  to what `streetWidth.ts` computes.

⇒ **The buildable FOOTPRINT = `plot ⊖ setbacks`, capped by `coverage × plotArea`, is fully
determined by street width + class.** This is the `setback` rule kind — the **simplest** entry in
C58 §2.2's geometricRule table — plus a `maxCoverage`. No `block-derived-alignment`, no
`tiered-occupation`, no block dissolve, no zone portal.

**What the footprint alone does NOT give you:** the number of floors and the max height. Those are
`المخطط المعتمد` (approved-plan) fields per §4.1, overridable by development authorities per §1
(§6 below). For a demo, the honest options are (a) show the footprint + coverage and state height as
"per municipal plan — not resolved", or (b) let the user pick a floor count within the ≤ 23 m
apartment ceiling. Both are legitimate under C58 §1.13 (a cited refusal on the height while the
footprint is real).

---

## 2 — Field-by-field mapping (now measured)

| PRYZM field | Barcelona mechanism | Saudi equivalent | Tier |
|---|---|---|---|
| Classification | PGM clau via MUC (portal) | 4-class national taxonomy (villa/apt/apt-comm/apt-admin), **user-selected** | `VERIFIED-LIVE` |
| Parcel geometry | Catastro WFS (free) | Balady `MapServer/28` — **exists, geo-fenced**; demo = user-drawn | `VERIFIED-LIVE` |
| Setbacks | party-wall / Art. 242 | `max(streetWidth/5, {3,2})` — national closed form | `VERIFIED-LIVE` |
| Coverage | ❌ not derived (envelope) | ✅ 75%/65% national by class | `VERIFIED-LIVE` |
| Buildable depth | Art. 242.2 block construction | ❌ **no analog** — Saudi uses coverage%, not a depth | `VERIFIED-LIVE` |
| Max FAR | ❌ not derived | ❌ **not a residential parameter** (commercial only) | `VERIFIED-LIVE` |
| Floors | Art. 327.2 street-width bands | **municipal plan** (`المخطط`), not national | `VERIFIED-LIVE` |
| Max height | Art. 327.2 | **municipal plan**; 23 m = apt/high-rise class boundary, not a cap | `VERIFIED-LIVE` |
| Perimeter build-in-setback | — | ≤ 70 % of plot perimeter at ground floor | `VERIFIED-LIVE` |
| Real building heights | OSM + IGN LiDAR (sparse) | Microsoft ML Footprints (heights) | `CONVERGENT-SECONDARY` (not re-probed this pass) |

---

## 3 — The rules — now PRIMARY, not convergent-secondary

The seed §3 figures were `CONVERGENT-SECONDARY` (four news outlets + a legal page). **They are now
`VERIFIED-LIVE` from the ministerial decision itself** — see `SAUDI-PRIMARY-DECISION-EXTRACT.md` for
the full tables, page citations, and reproduction. One material correction surfaced: **villa ground
coverage is 75 % but apartment ground coverage is 65 %** (the seed's flat "75 % ground floor" was
the villa figure only), and **there is no residential FAR**.

### 3.1 — The neighbour-waiver mechanic (seed §3.1) — NOT confirmed in the primary text

The seed flagged side setbacks as *"waivable by mutual neighbour agreement"* — a provenance concept
with no Barcelona analog. **I did not find an explicit "waiver by mutual agreement" clause in the
residential decision.** What the decision *does* contain (p20–21) is a *"build-on-the-boundary"
(البناء على الصامت)* regime and Amana-approval gates. ⇒ **`COULD NOT VERIFY` the waiver as stated;**
the conservative (un-waived) envelope is the default under C58 §1.4 regardless, so this does not
change the estimate — but do not carry the waiver claim as fact.

---

## 4 — Cost estimate in PRYZM's own terms (C57 / C58)

The estimate is expressed as C57 adapter pieces and C58 rule-pack fields, split into
**ports-unchanged / constructs / constants / build-new**, exactly as the brief requires.

### 4.1 — C58 rule pack (`sa-momrah-residential`) — the cheap half

| C58 field | Value | Kind | Source |
|---|---|---|---|
| `geometricRule.kind` | **`setback`** (the simplest kind — §2.2) | — | national |
| `setbacks.{front,side,rear}` | `max(w/5, {3,2,2})`, front ≥6 @ w≥30 | **constant + tiny formula** | `ordinance-pdf` |
| `maxCoverage` | 0.75 (villa) / 0.65 (apt) | **constant** | `ordinance-pdf` |
| annex coverage | 0.70 of floor beneath | **constant** | `ordinance-pdf` |
| `permittedUse` | per the 4 classes | **constant** | `ordinance-pdf` |
| `maxHeight_m` / `maxFloors` | **`null`** | **refusal / plan-deferred** (C58 §1.13) | — |
| `plotRatioFAR` | **`null`** (not a residential parameter) | — | — |
| `ordinanceRef` | قرار وزاري 1/4500943139-1446, MOMRAH 2024 | citation | `VERIFIED-LIVE` |

⇒ **One rule pack, ~4 constants + one `w/5` formula, one `setback` geometricRule variant that
already exists.** No new C58 rule *kind* is needed. This is the cheapest possible pack shape in the
contract.

### 4.2 — The setback formula needs ONE small engine extension

C58's `setback` kind erodes each edge by a **fixed** classified distance. Saudi's setback is
`max(streetWidth/5, floor)` — a distance that **depends on the street width of the fronting edge.**
This is a **new variant** (`street-proportional-setback`) or a parameterisation of `setback` where
the per-edge distance is `max(edgeStreetWidth/divisor, minimum)`. Small, additive, and it does not
touch any shipped pack (C58 §1.5). **Estimate: S (one geometricRule variant + its solver branch +
tests).**

### 4.3 — C57 parcel-data adapter — the demo path is cheap, the production path is gated

| Piece | Demo | Production |
|---|---|---|
| Parcel geometry | **user-drawn** (onboarding already supports it) — **£0** | Balady `MapServer/28` behind a Saudi-only WAF ⇒ needs a data agreement / SA egress. **Blocked** (`SAUDI-UMAPS-API-ENUMERATION.md` §4) |
| Classification | **user dropdown** (4 national classes) — **£0** | `MAINLANDUSE` field on the same gated service |
| Street width | user-entered OR `streetWidth.ts` measured (§7) | needs opposing parcel rings ⇒ same gated geometry |
| Jurisdiction router | one `isInSaudiArabia(bbox)` branch — **S** | same |

### 4.4 — Rough sizing (T-shirt, honest)

| Work item | Size | Note |
|---|---|---|
| `sa-momrah-residential` rule pack (4 constants) | **S** | data, not code (C58 §1.5) |
| `street-proportional-setback` geometricRule variant + solver + tests | **S–M** | the only real engine work |
| Jurisdiction router branch + registry entry | **S** | mirror `es-08019-barcelona` |
| Demo onboarding: class dropdown + street-width entry | **S** | UI, reuses existing draw-plot |
| Confidence/refusal wiring for the null height (C58 §1.13) | **S** | the pattern is shipped |
| **TOTAL for a demo** | **~M** | vs Barcelona's measured **multi-week, still-at-48 %** |

**This is a fraction of Barcelona's cost** — because the two most expensive Barcelona line items
(parcel→zone resolution, and the Art. 242 / Art. 327 / Art. 350 block-construction machinery) are
**not on the Saudi footprint path at all.**

---

## 5 — Comparison table vs Barcelona, per pipeline stage

| Stage | Barcelona | Saudi Arabia (demo) | Cheaper? |
|---|---|---|---|
| **Parcel geometry** | Catastro WFS, free, `parcel` granularity | user-drawn (gated API exists but geo-fenced) | ≈ (BCN better data; SA demo-fine) |
| **Parcel → zone** | MUC WMS + block dissolve (91.4 % nat’l) — **the expensive core** | **none needed** — class is user-picked | ✅ **SA far cheaper** |
| **Setbacks** | party-wall / alignment, per-clau | `max(w/5, {3,2})` — one national formula | ✅ SA cheaper |
| **Coverage** | ❌ not derivable (envelope doctrine) | ✅ national constant by class | ✅ SA cheaper |
| **Buildable depth** | Art. 242.2 block construction (built, hard) | not a Saudi concept — coverage replaces it | ✅ SA cheaper (absent) |
| **Height / floors** | Art. 327.2 constructed from measured street width | **municipal plan** — not national ⇒ a source gap | ≈ (both need a per-zone source; BCN constructs it, SA must fetch it) |
| **Multi-tier envelope** | Art. 350.2 tiered-occupation (ADR-0273) | none | ✅ SA cheaper (absent) |
| **Rule pack** | curated, ceiling ~48 %, 62.8 % derived-planning | 4 constants + 1 formula, national | ✅ SA cheaper |
| **Ceiling of the cheap path** | ~48 % of city, and that is the *whole* envelope | **footprint on ~100 % of standard residential plots**, height deferred | ✅ SA’s cheap path covers more of what it promises |

**The honest asymmetry:** Barcelona's cheap path (PGM-only) tops out at ~48 % because the *envelope
itself* is derived-planning. Saudi's cheap path delivers a **complete footprint** on essentially all
standard residential land, and defers only the **height** — a smaller, better-bounded gap.

---

## 6 — 🔴 THE BARCELONA TRAP — evaluated explicitly, and it IS present

The brief's decisive architectural question: *does Saudi Arabia have the same layered structure —
national code → municipal plans → site-specific instruments that override — or is it genuinely flat?*

**It is layered, and the primary law says so in its own text** (`SAUDI-PRIMARY-DECISION-EXTRACT.md`
§6):
- **National decision** — minimum requirements, footprint constants (this pass's source).
- **Amana / municipal `المخطط المعتمد`** — overrides permitted uses, ratios, setbacks (on commercial
  streets), floors, and max height **per planning zone** (§4.1 cl.1).
- **Region/city development authorities** (RCRC, ROSHN, NEOM, Diriyah Gate, Qiddiya…) — their
  regulations **prevail on any conflict** (§1 cl.3).

⇒ **A plot inside a development-authority master-planned zone can be governed by an instrument the
national tables do not contain — exactly the Barcelona trap.** A demo that reads the national tables
and ignores this will confidently state a wrong height/floor count on every giga-project plot, and
those plots are precisely where high-value Saudi demand concentrates.

**BUT — the trap bites a different, smaller surface than in Barcelona:**
- Barcelona: the derived instrument sets the **entire envelope** on 62.8 % of the city.
- Saudi: the national decision sets the **footprint** as an enforceable nationwide floor; the
  override surface is **height + floors + special-area ratios.** The footprint stays nationally
  grounded even inside an override zone (the override raises/relaxes, it doesn't erase the setback
  logic).

⇒ **Saudi Arabia hits a Barcelona-style ceiling only on the VERTICAL question, not the footprint.**
That is a genuinely better position — but it is **not flat**, and presenting it as flat would be the
trap. `COULD NOT VERIFY` per-city: whether Riyadh/Jeddah publish machine-readable per-zone floor/height
plans (the municipal-modification pattern). The Riyadh guide `trc.alriyadh.gov.sa` and the national
consultation platform `istitlaa.ncc.gov.sa` were located but not read this pass.

---

## 7 — Does `streetWidth.ts` port? Honestly: the ALGORITHM yes, the INPUTS no (for the gated path)

I read `packages/site-parcel-data/src/geometry/streetWidth.ts` and `blockDerivedDepth.ts` before
claiming anything.

**Ports conceptually — the definition matches exactly.** Saudi عرض الشارع = *"horizontal distance
between the property boundaries on the two sides of the street"* = frontage-to-frontage. That is
literally what `measureStreetWidths` computes (ray from our block edge across the carriageway to the
opposing parcel ring). And Saudi's setback formula uses the width **directly** (`÷5`), which is
*simpler* than Barcelona's banded height table — the whole `§AMPLADA-ART-238` min-vs-median
subtlety (over-stating a band edge) largely does not bind, because a metre of width error moves the
setback by only 0.2 m, not a whole storey.

**Does NOT port as-is — it needs cadastral geometry Saudi does not freely provide.**
`measureStreetWidths` requires **(a)** our block's dissolved ring and **(b)** the opposing parcel
rings — both from a parcel dataset. Barcelona has Catastro for free; Saudi's equivalent
(`MapServer/28`) is geo-fenced (`SAUDI-UMAPS-API-ENUMERATION.md`). So on the **gated production
path** the module has no inputs. On the **demo path** the user draws the plot and can draw or type
the street width, so the module is **not needed** for the demo — the width comes from the user, and
the `÷5` formula turns it into setbacks directly.

**`blockDerivedDepth.ts` does NOT port at all** — deliberately. It solves Art. 242.2's *"leave 30 %
of the block free"* construction. **Saudi has no such mechanism**; it uses a flat coverage % and
setbacks. Feeding a Saudi parcel to `solveBlockDerivedDepth` would be a category error. This is a
clean "it does not port because Saudi measures buildability differently" — and that is *good* news:
Saudi skips the single hardest solver PRYZM built.

---

## 8 — Risk register — the top things that could make this 5× more expensive

| # | Risk | Why it could 5× the cost | Mitigation / current read |
|---|---|---|---|
| **R1** | **The development-authority override (the Barcelona trap, §6).** | If most *demo-worthy* Riyadh/Jeddah plots sit in RCRC/ROSHN/NEOM master-plan zones, the national height/floors are wrong there, and each authority is a separate, possibly unpublished, rule source — the 512-page-scan cost, per authority. | **Measured to exist in primary law.** Mitigate by demoing footprint-only (height deferred, cited) and choosing demo plots in ordinary municipal fabric, not giga-project zones. Per-city override extent: `COULD NOT VERIFY`. |
| **R2** | **No reachable parcel data.** The gated API means no live classification/geometry/street-width without a Saudi egress or data agreement. | A production (non-demo) product needs a MOMRAH data agreement; that is a business/legal timeline, not an engineering one, and it gates classification, geometry AND street width at once. | Demo is unaffected (user-drawn + dropdown). Flag the production dependency early. |
| **R3** | **The height gap is the whole vertical answer.** Coverage + setbacks give a footprint; a user seeing a flat slab may read it as "the building". | If the demo over-promises "what can I build" and can only answer the plan area, the value story is thin without a floor count. | The ≤ 23 m apartment ceiling + a user floor-count picker is a legitimate demo bound (C58 §1.13). But it is a *bounded* answer, and must be labelled as such — not "the envelope". |

**A well-evidenced negative is a success:** even in the worst case (R2 blocks all live data), Saudi
Arabia is a *cheaper* demo than Barcelona, because the footprint math is national and the user
supplies the two inputs. The expensive Barcelona machinery is simply absent.

---

## 9 — Recommendation

**Saudi Arabia is a GOOD demo market — the best-value second jurisdiction probed — provided the demo
is scoped to the FOOTPRINT and is honest about the height.**

**The smallest honest demo we could ship:**
1. User draws the plot (existing onboarding) and picks a class (villa / apartment) from a dropdown.
2. User enters or draws the fronting street width.
3. Engine produces `plot ⊖ max(w/5, {3,2}) setbacks`, capped at `coverage × plotArea`, rendered as
   the buildable footprint in PRYZM purple — `confidence: block-constructed` on the footprint,
   `ordinanceRef` = the 2024 decision.
4. Height/floors shown as a **cited refusal** (C58 §1.13): *"floors & max height are set by the
   municipal approved plan and, in development-authority zones, by that authority — not resolved
   here"*, with an optional user floor-count within the ≤ 23 m apartment ceiling.

That demo is **~M effort**, cites a **primary government source**, and cannot over-state (it
under-builds by deferring height — the only direction C58 §1.4 permits).

**Say plainly what it is NOT yet:** it is **not** a production answer for giga-project / development-
authority land (R1), and it has **no live parcel/classification data** (R2) until a MOMRAH data
agreement or SA egress exists. Neither blocks the demo; both block a real product. **Do not present
the national tables as flat law** — the override layer is real and written into the primary decision.

---

## 10 — Status

| | |
|---|---|
| Folder | created 2026-07-22 |
| Primary source | ✅ **read** — `SAUDI-PRIMARY-DECISION-EXTRACT.md` (`VERIFIED-LIVE`) |
| Parcel backend | ✅ **enumerated** — `SAUDI-UMAPS-API-ENUMERATION.md` (exists, geo-fenced) |
| Rule pack | **none** — an estimate is the deliverable; none authored |
| Registered in the engine | **no** |
| MVP question (§4.4) | ✅ **ANSWERED — yes for footprint, height deferred (§1)** |
| Effort estimate | ✅ **~M for a demo; a fraction of Barcelona** (§4) |
| Top risk | **R1 — development-authority override (the Barcelona trap, present but smaller)** |

**Related:** `SAUDI-PRIMARY-DECISION-EXTRACT.md` · `SAUDI-UMAPS-API-ENUMERATION.md` ·
`../../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (§5 Saudi row) · `../../V1-LAUNCH-READINESS-AUDIT.md` (L-606) ·
`../../spain/barcelona-catalonia/L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` ·
`../../spain/barcelona-catalonia/PROBE-DISCIPLINE.md` ·
C58 §1.13 / §2.2 · C57 · `packages/site-parcel-data/src/geometry/streetWidth.ts`.
