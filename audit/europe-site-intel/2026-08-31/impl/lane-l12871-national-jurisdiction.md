# LANE L-12871 — the national-jurisdiction resolver (closing the registration blocker)

**Date:** 2026-09-01 · **Scope:** close L-12871 so the nine committed country adapters can be
registered · **Commits:** none (lane briefed `do NOT commit`) · **Authority:** E4-EXECUTION-CONTROL
controls 2/3/5/9/10.

---

## A. The verdict in one paragraph

L-12871 said three country bboxes overlap. **They do not — twenty-three national pairs do**, out of
42 interior overlaps across all 25 routing boxes in the package. Both fixes the brief offered were
tested and **both fail as stated**: a declared per-pair precedence table is *unsatisfiable* (every
contested pair has territory of both countries inside the other's box, so no ordering of the pair is
right for both members), and a coarse polygon set is *not* correct-by-construction (the shipped
public-domain coverage places Görlitz 398 m inside Poland, Tornio 255 m inside Sweden, and
København 140 m out to sea). What ships instead is the honest intersection of the two: **geometry
decides, but only outside the geometry's own MEASURED error band; inside it the resolver returns a
named refusal.** Result over 34 probed points: 25 claims, 9 refusals, **zero wrong answers**. Three
of the five named acceptance towns resolve; **Frankfurt (Oder) and Słubice refuse**, and §F explains
why that is the correct answer for the data we can legally ship, and exactly what converts them.

---

## B. The overlap matrix — measured, not assumed

All 25 routing boxes in `packages/site-parcel-data/src` (the 9 in `parcelProviders/countryBbox.ts`
+ `providers/denmarkBbox.ts`, the 11 provider-owned boxes, the 5 unregistered `countryAdapters/*`
boxes). Script: `matrix.mjs`, values transcribed from source with file:line.

```
BOXES=25  PAIRS=300  INTERIOR_OVERLAPS=42  EDGE_TOUCH=1  DISJOINT=257

NATIONAL x NATIONAL interior overlaps: 23
  NORWAY x SWEDEN        NORWAY x FINLAND       FINLAND x SWEDEN      SPAIN x FRANCE
  SPAIN x PORTUGAL       NORWAY x ESTONIA       DENMARK x SWEDEN      FRANCE x ITALY
  FRANCE x GERMANY       GERMANY x POLAND       SWITZERLAND x ITALY   ESTONIA x SWEDEN
  FRANCE x SWITZERLAND   GERMANY x DENMARK      NETHERLANDS x GERMANY LITHUANIA x SWEDEN
  GERMANY x SWITZERLAND  LITHUANIA x POLAND     FRANCE x NETHERLANDS  NORWAY x DENMARK
  FRANCE x LUXEMBOURG    GERMANY x LUXEMBOURG   DENMARK x POLAND
```

Two corrections to the record fall straight out of this:

- **L-12871 says "three country bboxes overlap (LT/PL/DE)". There is no DE×LT overlap at all**
  (`GERMANY_BBOX.maxLon 15.1 < LITHUANIA_BBOX.minLon 20.9`). The two real pairs it names are
  **LT×PL** `lat[53.85,54.84] × lon[20.9,24.15]` and **DE×PL** `lat[49,54.84] × lon[14.12,15.1]`.
- **`eeJurisdiction.ts` claimed "no registered box overlaps EE's interior". `NORWAY_BBOX`
  {57.8–71.4, 4.4–31.3} covers ESTONIA_BBOX entirely**, and `geonorge-no` is a LIVE registered
  cadastral row. That sentence was wrong on the day it was written, not merely stale.

**Smallest-box picks the wrong country in the two pairs that matter:** `POLAND_BBOX` is 58.6 deg²
against `GERMANY_BBOX` 73.5 deg², so the German bank of the Oder routes to Poland; `LITHUANIA_BBOX`
is 15.9 deg² against Poland's 58.6, so Polish Suwałki and Sejny route to Lithuania.

---

## C. Option (b), DECLARED PRECEDENCE, is unsatisfiable — falsified

A per-pair ordered table cannot express these borders, because **each contested pair has a mutual
witness**: real territory of *both* countries lies inside the *other's* box.

| pair | witness inside the other's box | witness inside the other's box |
|---|---|---|
| DE × PL | Frankfurt (Oder) 52.3412, 14.5506 — **DE** | Słubice 52.3506, 14.5701 — **PL** |
| LT × PL | Marijampolė 54.5589, 23.3542 — **LT** | Suwałki 54.1017, 22.9308 — **PL** |
| SE × NO | Røros 62.5744, 11.3842 — **NO** | Kiruna 67.8558, 20.2253 — **SE** |
| SE × DK | København 55.6761, 12.5683 — **DK** | Malmö 55.6050, 13.0038 — **SE** |
| SE × FI | Tornio 65.8482, 24.1467 — **FI** | Haparanda 65.8356, 24.1345 — **SE** |

No ordering of a pair is right for both rows. Any declaration fine enough to separate them is
already a description of the border — i.e. geometry. **Option (b) is closed on evidence.**

---

## D. Option (a) is NOT "correct by construction" — also falsified

### D.1 Natural Earth 10m — licence verified, accuracy measured

Licence fetched from the actual page (`https://www.naturalearthdata.com/about/terms-of-use/`),
verbatim: *"All versions of Natural Earth raster + vector map data found on this website are in the
public domain… No permission is needed to use Natural Earth. Crediting the authors is
unnecessary."* This is the only candidate with a single, unambiguous, commercial-safe licence.

Driving `ne_10m_admin_0_countries` point-in-polygon over 35 witnesses, **3 fail**:

```
Gorlitz    51.1548, 14.9884  is GERMAN   -> NE10m says [POL]      (398 m INSIDE Poland)
Tornio     65.8482, 24.1467  is FINNISH  -> NE10m says [SWE]      (255 m INSIDE Sweden)
Kobenhavn  55.6761, 12.5683  is DANISH   -> NE10m says [NONE]     (140 m OUTSIDE Denmark)
```

Two are **confident wrong answers on the very borders this lane exists to arbitrate**, and one puts
a national capital in the sea. A containment-only resolver would be *worse* than the bbox it
replaces, because it would attach a citation to the wrong answer.

### D.2 How wrong — the displacement measurement that sets the tolerance

Every `ne_10m` DEU boundary vertex in the Oder/Neisse corridor, distance to the **geoBoundaries
gbOpen DEU ADM0** boundary (64,811 vertices, official German source, Datenlizenz Deutschland
by-2.0) — and the same in the Torne corridor:

```
DEU, lon 14.0-15.2 / lat 50.8-53.0 (n=181): min 1  p50 674  p90 1365  p95 1501  max 2110  (m)
FIN, lon 23.0-24.5 / lat 65.5-68.5 (n=182): min 3  p50 416  p90  949  p95 1285  max 3361  (m)
```

Against the same reference, the true distances from town to border are: Görlitz **508 m**,
Frankfurt (Oder) **679 m**, Słubice **1442 m**, Tornio **469 m**. **Every one of them sits inside
ne_10m's own p95 error.** ne_10m getting Frankfurt (Oder) "right" is luck — it gets Görlitz, on the
same border and 170 m nearer to it, flatly wrong.

⭐ **`positionalToleranceM = 1500` is the p95 of the worse corridor. It is measured, not chosen, and
it is a property of the DATA, not of the resolver.**

### D.3 geoBoundaries gbOpen — rejected, with reasons

Locally more accurate, but not a coverage and not shippable:

| | licence | bytes | vertices |
|---|---|---|---|
| DEU | Datenlizenz Deutschland by-2.0 | 2.8 MB | 64,811 |
| POL | "Other - Humanitarian" (CC BY 2.0) | 52 KB | **1,195** |
| SWE | per-country | 34 KB | **1,420** |
| NOR | per-country | **56 MB** | 1,722,421 |
| EST / FIN | per-country | 16 MB / 12.7 MB | 439,484 / 352,159 |

- **It is a per-country stack, not a single coverage**, so the polygons contradict each other:
  Görlitz is claimed by **DEU *and* POL**, Tornio by **SWE *and* FIN**, and **Stockholm by nobody**.
- **Resolution varies by three orders of magnitude.** gbOpen POL (1,195 verts) and SWE (1,420) are
  *coarser than ne_10m*, so its accuracy advantage is real only for some countries — the DE/PL
  corridor measurement above leans on the German half, which is genuinely official.
- **16 heterogeneous licences** would each need verifying from its own page; "Other - Humanitarian"
  is not a licence one can stand behind for a commercial SaaS without a per-country audit.
- 88 MB for 8 of the 16 countries needed.

Rejected as the shipped set; retained as the **measurement reference** for §D.2 and as the named
upgrade path in §F.

---

## E. What shipped

| file | what |
|---|---|
| `packages/site-parcel-data/src/jurisdiction/nationalJurisdictionResolver.ts` | the resolver |
| `packages/site-parcel-data/src/jurisdiction/data/nationalBoundaries.json` | 16 countries, 366 rings, 41,714 verts, 902 KB, Douglas–Peucker @ 100 m, source SHA-256 pinned |
| `packages/site-parcel-data/src/geometry/pointInRingsEvenOdd.ts` | the existing ray cast, **extracted not minted** |
| `packages/site-parcel-data/__tests__/nationalJurisdictionResolver.test.ts` | 52 tests |

**The algorithm.** bbox → candidate set (**pre-filter only, never the decider**) → point-in-polygon
per candidate + distance-to-edge in metres → verdict:

- exactly one polygon contains it **and** the nearest rival is farther than `positionalToleranceM`
  → **CLAIM**, basis `polygon-containment`, carrying dataset, source SHA-256, licence, the named
  nearest rival and the measured margin;
- contained but a rival is within tolerance → **REFUSE `within-dataset-tolerance-of-rival`**, naming
  the rival, the distance and the tolerance;
- outside every polygon but one candidate is within `coastalToleranceM` (2000 m) and decisively
  nearest → **CLAIM**, basis `nearest-polygon` (this is what rescues København);
- otherwise → **REFUSE**, one of `no-national-candidate` · `outside-every-candidate-polygon` ·
  `ambiguous-nearest-polygon` · `overlapping-boundary-claims` · `non-finite-point`.

**There is no smallest-box arithmetic anywhere in the file, and no code path returns a guess.**

**Reuse, not rivals.** The resolver declares **no bbox of its own** — it imports the 16 existing
`isIn*` predicates from the modules that already own them, so the E7 verdict's "recurrence six" of
the `CountryBbox`/`within()` drift does not happen. The ray cast was **moved** out of
`providers/resolveElSauzalZone.ts` into `geometry/pointInRingsEvenOdd.ts` and **re-exported** from
its old home, so `resolveTeldeZone.ts` (which imports the symbol from that file) is untouched — the
motive being that `resolveElSauzalZone.ts` statically bundles a 1.0 MB JSON, so importing it for a
12-line ray cast would drag the El Sauzal extract into every consumer.

**Stale reassurances deleted** (the mechanism L-12871 flags as how this recurs) — replaced with the
measured audit and a pointer to the resolver, not amended:

- `lt/ltJurisdiction.ts` — *"Latvia and Poland are unregistered, so no manual precedence is needed
  for LT today."*
- `ee/eeJurisdiction.ts` — *"no registered box overlaps EE's interior … the specificity resolver
  needs no manual precedence for EE."*
- `parcelProviders/mmlParcelProvider.ts` — *"FINLAND_BBOX does not overlap any existing cadastral
  box, so ordering is not load-bearing here."* (`se/seJurisdiction.ts` had already recorded this as
  falsified but could not edit the file.)

---

## F. Acceptance — executed, with the shortfall stated plainly

`npx vitest run __tests__/nationalJurisdictionResolver.test.ts` → **RC=0, 52 passed**.
Full package: `npx vitest run` → **RC=0, 168 files, 3613 passed / 3 skipped**.
`npx tsc -p tsconfig.json --noEmit` → **RC=0**.

Prototype sweep over 34 points — 5 named towns, 16 interior controls, 13 adversarial:
**25 claims, 9 refusals, `WRONG=0`.**

| point | verdict |
|---|---|
| Suwałki | **CLAIM POL** `polygon-containment`, rival LTU at 22,731 m |
| Sejny | **CLAIM POL** `polygon-containment`, rival LTU at 8,014 m |
| Marijampolė | **CLAIM LTU** `polygon-containment`, rival POL at 31,230 m |
| Frankfurt (Oder) | **REFUSE** `within-dataset-tolerance-of-rival` (DEU vs POL @ 1103 m ≤ 1500 m) |
| Słubice | **REFUSE** `within-dataset-tolerance-of-rival` (POL vs DEU @ 485 m ≤ 1500 m) |
| all 16 interior controls | **CLAIM**, correct country (København via `nearest-polygon`) |
| Görlitz, Tornio | **REFUSE** — the two ne_10m gets *wrong*; no wrong claim is made |
| Casablanca, Kaliningrad, Praha, Minsk | **REFUSE** — inside a national bbox, claimed by none |

### ⛔ The shortfall, stated rather than engineered around

**The brief requires exactly one country to claim all five named towns. Three do; Frankfurt (Oder)
and Słubice refuse.** No honest tolerance fixes this: Słubice would need `T < 485 m`, i.e. accepting
that ~35th-percentile boundary error is trustworthy on a border measured at p50 674 m. Tuning `T`
down to pass the test is the one move that would reintroduce the defect — it is what makes Görlitz
a confident wrong answer again.

**This is a DATA limit, not a resolver limit, and it is quantified.** The tolerance is per-dataset;
substituting a per-country official boundary drops it with no code change. At an official-geometry
tolerance of ~100 m, Frankfurt (Oder) (679 m from the true border) and Słubice (1442 m) both convert
to `polygon-containment` claims, **and so does Görlitz (508 m)** — which the current data cannot
claim under any tolerance because it places it in the wrong country outright.

### Falsification (executed, both directions)

Removed the precedence data (all `rings` emptied) → **RC=1, 22 failed / 30 passed**, and the
contested towns went ambiguous again by name, verbatim:

```
AssertionError: Suwalki: REFUSED (outside-every-candidate-polygon): Inside LTU/POL bbox(es)
but outside every candidate polygon; nearest is LTU at Infinity m, beyond the 2000 m coastal
tolerance. The bbox was a pre-filter, not a claim.
```

Note it refuses **naming both candidates** — it does not silently fall back to a box-area pick.
Restored and verified byte-identical:

```
BEFORE: 0b19cd0a628e4127ffe8cbe4f3e8ed266549ae4acee3b0fc8a71002e9f63923a
AFTER : 0b19cd0a628e4127ffe8cbe4f3e8ed266549ae4acee3b0fc8a71002e9f63923a
```

Re-run after restore → **RC=0, 52 passed.** The suite also carries the control internally
(`describe('falsification …')`) so it cannot rot.

---

## G. What this unblocks, and what it does not

**A refusal does not block registration.** L-12871's danger is a *silent wrong pick* — smallest-box
*asserting* that German territory is Polish. The resolver removes the assertion. Where it CLAIMS,
route to that country's provider alone. Where it REFUSES, the caller may still try each candidate
cadastre and let the **service's own null** decide — the established `resolveParcelWithFallback`
behaviour. For Frankfurt (Oder)/Słubice that fall-through resolves correctly in practice, because
ULDK and ALKIS each answer only for their own territory. **No point is decided by box area any more.**

**Not done in this lane (deliberately, control 10 — recorded, not actioned):**

1. **`parcelProviders/registry.ts` is not edited.** It is the shared registration seat and belongs
   to the registration lane; the consumption shape is `resolveNationalJurisdiction(lat, lon)` →
   gate the candidate walk on `ok`/`iso3`, and on a refusal carry `reason` through rather than
   labelling the result with a nationality.
2. **`src/index.ts` barrel is not edited** (another lane holds it modified). Additions needed:
   `resolveNationalJurisdiction`, `describeNationalJurisdiction`, `NATIONAL_BOUNDARY_SET`, the
   verdict/basis/refusal types.
3. **Sub-national routing is out of scope.** The resolver answers *which sovereign state*; NRW,
   Flanders, Brussels, Wallonia, England, Scotland and the US city boxes keep the registry's
   existing specificity walk *underneath* that answer. 19 of the 42 measured overlaps are
   national×sub-national and are unaffected.
4. **The Norway box is wider than the Kartverket service** (`no/noJurisdiction.ts` measured this and
   could not act on it). Independent of L-12871; still open.

**Recommended follow-on, in priority order:** (i) register the adapters behind this resolver;
(ii) upgrade DEU + POL to official boundaries with their own measured tolerances — that is the whole
of the Frankfurt (Oder)/Słubice shortfall, and the per-country tolerance field already exists to
carry it; (iii) extend the same treatment to the FI/SE/NO/DK/EE/LT northern cluster, which holds 9
of the 23 national pairs.
