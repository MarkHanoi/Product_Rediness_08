# ADR-0365 — A regional cost estimate is BUILDING-LEVEL, and it comes from an official bulletin, not a price book

- **Status:** Accepted
- **Date:** 2026-08-23
- **Lane:** RATE53
- **Amends:** [ADR-0350 §5D](ADR-0350-mediciones-is-the-floor-4d-5d-6d-stand-on.md). ⭐ **It also
  SUPPLIES A NUMBER THAT LANE MEDI14'S AMENDMENT NEVER GOT** — see §6.
- **Supersedes:** nothing. **Deletes:** nothing.
- **Contracts:** C66 §1.1 (a price that has not been sourced is a CLAIM), C100 §5 (a miss is a miss,
  never a substitute), C03 (pure read model), C68 §5.d (one ladder)
- **Issue-log:** L-9100 … L-9107

---

## 1 · Context — the founder asked twice, and the second time he said the data exists

On 2026-08-22 the founder reversed a stated prohibition: 5D Cost said on its own face *"There is no
default and there is no estimate"*, and he ruled that a geolocated project should be able to say
roughly what it comes to. Lane MEDI14 built the mechanism — `RegionalRates.ts`, a `RegionalRate`
type distinct from a user's `RateEntry`, a jurisdiction ladder, a licence gate — and seeded
**zero numbers**. `SHIPPED_REGIONAL_RATE_COUNT` was `0`.

On 2026-08-23 he asked again, in stronger terms: *"I requested in 5D cost to have an average cost
depending on the region/location — **this information can be found — do it**"*.

He was right, and the module had named its own blocker in one line: *"has anyone read the
licence?"* Every candidate sat at `NOT_ESTABLISHED` because **no licence text had been opened.**

## 2 · The decision

**A regional cost estimate in PRYZM is a BUILDING-LEVEL €/m², sourced from an instrument published
in an official bulletin, resolved by the parcel's jurisdiction, and rendered as a figure that can
never be confused with — or added to — a priced total.**

It ships as `packages/core-app-model/src/quantities/RegionalBuildingCost.ts`, a **separate table
from `REGIONAL_RATE_BOOKS`**, resolved through the **same** ladder.

## 3 · Why the old candidate list found nothing — the refusal was about the wrong product

`RATE_SOURCE_CANDIDATES` named four sources: **BEDEC/ITeC**, a generic *"Banco de Precios"*,
**SPON'S**, **RSMeans**. All four are **unit-price books**, and the honest conclusion from that list
is the one MEDI14 reached: regional construction cost data is licensed.

**That conclusion is false, and the list is why.** It contained no member of the class that actually
publishes regional building costs openly: **official-bulletin reference modules** — the €/m² a
municipality publishes in its fiscal ordinance so a building-licence tax can be assessed.

This is `§BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS` for the tenth time in this repository: **9 of 14
"blockers" were once refusals about a product nobody needed, and a different endpoint served the
need.** The question that must be asked of every row is *"is the thing I am refusing actually the
thing I need?"* — and `RateSourceCandidate` now carries a `granularity` field precisely so the
question cannot be skipped.

## 4 · ⛔ The prohibition this ADR exists to encode — no bridge between the two granularities

The take-off has **42 per-trade unit lines** (`FIN.WALL.plaster-inner` per m², `RAIL.baluster` per
m). The cleared source publishes **one €/m² for the whole building**.

It is trivial to bridge them: assume trade percentages, divide, and emit 42 per-line rates that each
carry a real BOPB citation. **Every one of those numbers would be invented by this repository and
would be wearing somebody else's name.** This take-off's output ends up in tenders.

**Therefore:**

| Rule | Where it is enforced |
|---|---|
| A building-level figure is **one** figure for the whole building | `estimateBuildingCost()` returns a scalar `amount`; there is no per-line shape on `BuildingCostEstimate`, and a test asserts the absence |
| It is **never** in `pricedTotal` or `estimatedTotal` | `applyRates()` does not take a building model and has no field for one; a test asserts the summary's JSON does not contain the amount |
| A cleared source may still not populate `REGIONAL_RATE_BOOKS` | `RateSourceCandidate.granularity`; `SHIPPED_REGIONAL_RATE_COUNT` remains **0** |
| A derived number is visibly not a sourced one | the panel renders the estimate in its own section, in the amber estimate colour, with "Estimate — not a price" adjacent to the figure |

**If a trade split is ever wanted, its source must be cited SEPARATELY from the total's.** No such
split ships and none is derivable from anything in this module.

## 5 · The licence work — read, with the sentence that decided each

`RateSourceCandidate` gained `licenceNote: string | null`, and
`candidatesWithAVerdictButNoLicenceSentence()` fails CI on a verdict with no sentence behind it.
*Cited is not checked.*

| Source | Verdict | The sentence that decided it |
|---|---|---|
| **Ordenança fiscal ICIO, Annex A** — Ajuntament de Barcelona | ✅ **CLEARED** | **LPI (RDLeg 1/1996) Art. 13:** *"No son objeto de propiedad intelectual las disposiciones legales o reglamentarias y sus correspondientes proyectos…"* A municipal fiscal ordinance **is** a *disposición reglamentaria*, so there is no copyright to license. Independently, **datos.gob.es catalogues the BOPB under CC BY 4.0.** |
| **BEDEC** — ITeC | ⛔ **LICENSED, NOT REDISTRIBUTABLE** | ITeC: *"La llicència d'accés al banc funciona mitjançant períodes de subscripció que es poden contractar per mesos o anys"*, and *"La quantitat d'usuaris que poden fer servir simultàniament el Banc BEDEC depèn de la quantitat de llicències contractades."* A time-boxed, per-seat **access** licence grants no redistribution right. **The absence of a grant is the answer.** |
| **SPON'S** / **RSMeans** | ⛔ **LICENSED, NOT REDISTRIBUTABLE** | Commercial publications sold per copy / per subscription. Unchanged. |
| **Autonomous-community price bases** (BCCA Andalucía, Madrid, Galicia) | ⚠ **NOT_ESTABLISHED — deliberately** | Not pursued, and §7 says why. |

### ⚠ The refusal that nearly stopped this, and was about the wrong object

`bop.diba.cat/avis-legal` states: *"Queda totalment prohibit distribuir, copiar, modificar o trametre
tant **el contingut com el codi de les pàgines**, llevat que es compti amb autorització expressa i
per escrit"*.

Read at a glance that kills the source. Read carefully, **its object is *les pàgines*** — the BOPB
web portal — and a portal's terms of use cannot create a property right in a municipal regulation
that Art. 13 places outside intellectual property in the first place. Two different objects; one
refusal that does not reach the thing needed.

## 6 · ⚠ The citation defect this lane also found — the THIRD ADR-0353 collision

`RegionalRates.ts` cited *"ADR-0350 §5D, AMENDED by **ADR-0353** §2"*. **ADR-0353 is "A reflected
ceiling plan is PLAN-HANDED"** (lane VIEWDOC20, same day) and contains nothing about cost —
measured: `grep -ciE "regional rate|price base|5D|cost estimate" ADR-0353-*.md` → **0**.

`quantities/index.ts` already records the SAME defect for lane SEQ27 (L-6301, corrected to
ADR-0355). **Three lanes shipped on 2026-08-22 and two of them reached for the same free ADR
number.** MEDI14's estimate-arm amendment never got a number at all; **this ADR is that missing
amendment**, and the citation in `RegionalRates.ts` is corrected in place.

## 7 · What was deliberately NOT done, and why each is not a guess

1. **No per-line rates ship, for anywhere.** BEDEC is the source that would have given per-trade
   Catalan unit rates and it is refused. `SHIPPED_REGIONAL_RATE_COUNT` is still `0`, and every
   take-off line still reads **NO RATE**. That is the honest state, not a shortfall of effort.
2. **The freely downloadable autonomous-community price bases were not pursued.** BCCA (Andalucía),
   Comunidad de Madrid and Galicia publish per-trade bases openly and several would probably clear.
   They are **Andalusian, Madrilenian and Galician prices.** Shipping them could only help a
   Barcelona project by substituting another region's market, which `resolveRegionalRates()` refuses
   by design. Pursue them when a project in *those* regions needs them, keyed to *those*
   jurisdictions.
3. **The module is `extent: 'municipal'` and does NOT fall through to the country rung.** A
   `country: 'es'` fallthrough would silently price every Spanish project at Barcelona rates and
   would look like coverage. A test asserts the fallthrough does not happen.
4. **The typology has no default.** Barcelona's table spans a factor of nine — 259,81 to 2.381,61
   €/m². PRYZM does not know whether the model is a school, a garage or a 4-star hotel, and a
   default would be a guess with a legal citation attached. Unset ⇒ no figure, and the published
   table is shown instead, which is itself a real cited answer.
5. **The area is a named PROXY, not a claim.** The ordinance multiplies *superfície construïda*.
   PRYZM computes slab plan area (closest), floor plan area, or room finish area (*superfície útil*,
   smallest). The one used, the lines it came from, and how it differs from what the source asks for
   travel with every figure. `measuredBuiltArea()` returns `null` rather than deriving an area from
   the wall footprint.

## 8 · Consequences

- **Positive.** A Barcelona project answers "roughly what does this come to?" with a figure whose
  instrument, edition, price date, bulletin CVE, licence sentence and exclusion list are all on
  screen. The licence ledger changed from an apology into a record of what was read.
- **Cost.** One more table to keep current. The ordinance is **re-approved annually** and the basic
  module moves; `sourceToChase` says so, and a stale `priceDate` is visible on the panel rather than
  hidden.
- **Open.** RAC reachability. The 5D panel is done; the chat path is not — see L-9106, which names
  the exact wired seam and its cost rather than leaving it as a research question.
- **Open.** Rates and the typology choice live in **browser localStorage** — not in the project
  file, not synced, not undoable. See L-9107; it is a real limitation the founder will hit and it
  belongs to persistence, not to this lane.
