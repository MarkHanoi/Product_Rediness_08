# madrid-envelope-engine — the network probes behind the rule adapter

> **⚠ THE ADAPTER HAS MOVED. THIS TOOL IS NOW THE PROBE HARNESS ONLY.**
>
> `schema.ts` · `validate.ts` · `grammar.ts` · `routingGuard.ts` · `ambitoJoin.ts` · `adapter.ts`
> were PORTED to **`packages/site-parcel-data/src/rulepacks/esMadridSpacm*.ts`** (§MADRID-SPACM-PORT,
> L-681) so the adapter is reachable from the app and obeys the layer rule. What stays here is what
> belongs here: the network probes, the committed fixtures, `proveParcel.ts`, `report.ts`, and the
> capital's floorspace measurement (`capitalAdapter.ts`, which yields no envelope). Every file in
> this directory now imports the PACKAGE — there is no second copy of the rules.
>
> The port is byte-identical: `proveParcel.ts` prints the same record before and after, and the 135
> tests in `__tests__/` run unchanged against the ported modules. §6 records what registration is
> still blocked, and why.
>
> **What this is.** A pure, total adapter from Madrid's published planning attributes to the common
> envelope schema, plus the routing guard that decides when PRYZM is **not entitled** to draw.
> **Nothing here publishes.** `CM_SPACM_ENVELOPE_VERIFIED` is `false`.
>
> Author: Madrid rule-adapter agent, 2026-08-02; ported 2026-08-03. Governance: C58 · C63 ·
> ADR-0270 · ADR-0283 · ADR-0287 · ADR-0293 · L-449 · L-526 · L-616 · L-656 ·
> §CONTEXT-DATA-HONESTY.

---

## 0 — TL;DR

| | |
|---|---|
| **Adapter** | ✅ PORTED to `@pryzm/site-parcel-data` (L2). 135 tool tests + 13 package tests green |
| **Reachable** | BY IMPORT yes; **BY CLICK no** — no `registry.ts` registration, see §6 |
| **Grammar classifier** | `setback` · `alignment` · `occupation` · `industrial` · `unknown` — never forced |
| **Municipality proven** | **BOADILLA DEL MONTE (28022)** — ⚠ a **labelled fallback** from the capital |
| **Parcel proven** | `4228504VK2742N`, CL Juan de Villanueva 10 — full chain, cited |
| **Drawable (gate open)** | Boadilla **39.38 %** of 1,958 ordinance polygons |
| **Drawable (today)** | **0 %** everywhere — L-449 unsigned, by design |
| **Capital envelope** | **0 %, and it is not a coverage gap** — see §2 |

---

## 1 — Run it

```bash
# probes (network; each writes to out/ and is deterministic)
node tools/madrid-envelope-engine/probe/00-capital-field-sweep.mjs      # 41 folders, 24,718 fields
node tools/madrid-envelope-engine/probe/01-planeamiento-vigente.mjs     # the capital's buildability layer
node tools/madrid-envelope-engine/probe/02-unit-and-routing-crosstab.mjs# the joint survivor count
node tools/madrid-envelope-engine/probe/03-capture-fixtures.mjs         # ORDENANZA fixtures
node tools/madrid-envelope-engine/probe/04-capture-ambitos.mjs          # ÁMBITO fixtures (routing)
node tools/madrid-envelope-engine/probe/05-prove-one-parcel.mjs         # the end-to-end parcel

# offline
npx vitest run --config tools/madrid-envelope-engine/vitest.config.ts
npx tsx tools/madrid-envelope-engine/report.ts        # per-municipality drawable + refusal rates
npx tsx tools/madrid-envelope-engine/proveParcel.ts   # the proven parcel, in full
```

---

## 2 — ⭐ THE CAPITAL: hypothesis (a) was tested, and it failed

The capital sits at **8.86 %** `NM_ALTURA` against a **79.42 %** regional median — nine-fold. Two
readings: **(a)** the parameters live in the city's own service, unprobed; **(b)** they are absent
everywhere. **(b) was not concluded until (a) was tested at census scale.**

`probe/00-capital-field-sweep.mjs` walked **41 folders · 447 services · 3,591 layers · 24,718
fields** of `sigma.madrid.es`, scoring every field name and alias against a lexeme set deliberately
wider than the obvious one — `profundidad` beside `fondo`, `retiro` beside `retranqueo`, because
Málaga defines *profundidad edificable* and every prior Spanish depth probe searched `fondo` alone.

> ⛔ **`depth: 0`. `setback: 0`.** Zero fields in 24,718. The 17 `height` and 77 `storeys` hits are
> trees, car-park levels, POI floor numbers and cartographic label heights — **not one is a planning
> parameter.** 10 services answered `499 Token Required` and are recorded as UNKNOWN, never absence.

The prior 6-service claim in `MADRID-DATA-RECON-SPIKE.md` §5 holds, and is now a census rather than
a sample of the six places we happened to look.

### 2.1 — But the sweep found a layer six prior Madrid passes never opened

`ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer/14` «Planeamiento Vigente» —
**19,833 polygons, 92.62 km²**, carrying `UUBV_NM_ED` (a buildability quantity, positive on
**96.17 %**) and — decisively — **`UNI_TX_DEN`, its unit, stated as a column.**

⭐ **A unit column is the thing València died for.** València's whole city is blocked because
`altura` has no published unit and no offset convention (ADR-0287). Madrid states it per row. That
does not make the number usable; it makes it **checkable**.

### 2.2 — Checking it disqualifies 57.7 %, and that is the point

The service describes itself as *«…la **edificabilidad disponible**»*. `UNI_TX_DEN` is a
**provenance** column, not a unit in the physics sense:

| `UNI_TX_DEN` | rows | share | what it is | verdict |
|---|---:|---:|---|---|
| `m² Cat` | 8,100 | **42.47 %** | CATASTRO-derived — floorspace that **exists** | ⛔ refuse |
| `m² Plan` | 5,591 | 29.31 % | absolute floorspace **from the plan** | ✅ accept |
| `m² Est` | 2,888 | 15.14 % | the publisher's own **estimate** | ⛔ refuse |
| `m²/m² Plan` | 2,321 | 12.17 % | a plot ratio **from the plan** | ✅ accept |
| `m² Rev` | 174 | 0.91 % | undocumented token | ⛔ refuse (unknown) |

`m² Cat` is the same **wrong-KIND** error as Murcia's `RB`/`RU` and València's protection-derived
`altura` (ADR-0270). `m² Est` carries no article, so it cannot be cited (C58 §1.3).

### 2.3 — The joint count, and the decisive limit

Server-side census over the 19,074 rows with `UUBV_NM_ED > 0`:

```
routing     norma-zonal 59.52 %  ·  development 40.29 %  ·  unrecognised 0.19 %
⭐ SURVIVORS (plan-sourced ∧ norma-zonal) = 2,005 rows · 10.51 % of rows · 18.85 % of AREA
   refused ROUTING 40.48 %   ·   refused PROVENANCE 49.00 %
```

⚠ The marginals must **not** be multiplied — the provenance classes are not evenly spread across
ámbitos. 10.51 % is a **joint** count.

> ⛔⛔ **AND A FLOORSPACE CAP IS NOT A SOLID.** With no height in 24,718 municipal fields and 8.86 %
> on the regional layer, an envelope cannot be drawn on **any** of these 2,005 parcels without
> inventing a storey height — the L-616 fabrication verbatim.
>
> ⇒ **The capital yields a cited buildable-FLOORSPACE determination and NO envelope.** Floorspace is
> the first number a developer asks for, so this is a real product answer — and it is honestly not
> what the C63 ENVELOPE axis scores. **The capital does not close, and the proving municipality
> falls back to the periphery. A labelled fallback is legitimate; a silent substitution is not.**

---

## 3 — The proven parcel

```
parcel        4228504VK2742N                (Catastro Consulta_RCCOOR, by identifier)
address       CL JUAN DE VILLANUEVA 10 BOADILLA DEL MONTE (MADRID)
municipality  CD_MUNICIPIO '022'  ⇒  INE-5 28022
zone          «RESIDENCIAL UNIFAMILIAR»  ·  Suelo Urbano Consolidado
instrument    NONE — the general plan orders this land directly (DS_NOM_AMB null, register 0 matches)
grammar       setback
rules         height 7 m · storeys 2 · occupation 70 % · setbacks 3/3/3 m · FAR 0.7 (NM_C_ED_MAZ)
              depth UNKNOWN · min-frontage UNKNOWN     ← never 0
envelope      { kind: 'setback', front_m: 3, side_m: 3, rear_m: 3 }      ← a SHIPPED kind
citation      idem.comunidad.madrid/geoserver3/wfs · sitcm:VPLA_V_ORDENANZA · record 253995
              PLAN GENERAL / MATRIZ · CM Ley 9/2001, E Ley 6/1998 · BOCM 2015-10-28
⛔ ships today drawable false — verification-gate-closed
```

⚠ **Two method errors were caught in getting here and are kept in the record**, because deleting
them would make the method look cleaner than it was:

1. **Five hand-picked lon/lat points landed on `SERVICIOS URBANOS`, `RED VIARIA` and three rustic
   parcels.** Guessing again until a residential plot appeared would be selecting a result, so the
   candidates are now taken from the ordinance layer's OWN residential polygons and verified against
   Catastro, which knows nothing about which ordinance we came from.
2. **`INTERSECTS` in EPSG:4326 returned HTTP 200 with `features: []` in BOTH axis orders.** The
   layer is native EPSG:25830. A clean, successful, empty response is indistinguishable from *"there
   is no ordinance polygon here"* — §CONTEXT-DATA-HONESTY in its purest transport form. A probe that
   had stopped there would have concluded Boadilla publishes no ordinance geometry.

---

## 4 — Per-municipality result (gate open — the size of the prize behind L-449)

Denominator: **ordinance polygons**, never parcels — this corpus contains none.
⚠ Refusal shares sum to >100 %: the guard is not short-circuited, so one row can carry several.

| municipality | rows | drawable | grammar mix | leading refusals |
|---|---:|---:|---|---|
| **BOADILLA** (proving) | 1,958 | **39.38 %** | setback 54.5 · unknown 41.9 | public-system 57.4 · development 10.3 · key-ambiguous 2.0 · contradict 1.0 |
| MAJADAHONDA (adversarial) | 556 | 10.25 % | unknown 55.9 · occupation 17.8 | no-grammar 53.8 · required-param 21.2 · development 7.7 · contradict 2.0 |
| MADRID (head sample) | ~2,000 | 4.25 % | unknown 52.2 · occupation 36.1 | public-system 45.6 · development 45.2 · no-grammar 40.8 |
| VALDEMORILLO | 723 | 1.66 % | setback 76.8 | development 79.0 · class-unpublished 75.9 · key-ambiguous 25.5 |
| MORALZARZAL | 819 | **0 %** | setback 53.9 · occupation 30.2 | development **99.76 %** · class-unpublished 97.9 |

**Boadilla: 39.38 % drawable + 57.41 % public-system ≈ 96.8 %.** Essentially every private,
non-delegated Boadilla polygon is solvable. That is the adapter working.

**Moralzarzal at 0 % is the routing guard working**, not failing: a named development ámbito covers
99.76 % of its rows, and 97.92 % of those instruments have **no published class** (`DS_FIG_DES`
null). Its excellent parameters are real and PRYZM is not entitled to apply them.

---

## 5 — ⚠ Two of my own conclusions were overturned mid-pass

Recorded rather than quietly corrected, because both were confidently wrong and the mechanism
matters more than the outcome.

**(1) *"Moralzarzal's `Z24-P1` tokens are demonstrably NOT development instruments."*** Reasoned from
99.8 % of rows carrying a name against a **1.2 % measured override ratio**. **Refuted by the ámbito
join: 817 of 817 resolve.** The two figures are not comparable — the override ratio is measured **by
AREA over urban+urbanizable land**, so many small ámbitos give a high ROW share and a low AREA share
at once. Quoting a ratio without its denominator produced an exactly-backwards conclusion (L-656).
⇒ **The register, not the prefix, is the authority on whether an instrument exists.**

**(2) *"The join resolves 100 % of named ámbitos."*** True in four municipalities, and a test over
the fifth found **Majadahonda at 86.0 %** — inside the census's own region-wide 95.77 %, so
unremarkable as data and fatal as a universal. **Four-for-four is a pattern, not a proof.**

---

## 6 — Registration — ✅ PORTED, ⛔ STILL NOT ROUTED

```
✅ DONE  packages/site-parcel-data/src/rulepacks/esMadridSpacm{Schema,Validate,Grammar,
         RoutingGuard,AmbitoJoin,Adapter}.ts
         Verbatim port. Additions: OTel spans (P8) on every deciding export, `.js` relative
         imports, and ONE strictness fix (`figures[0] ?? null` under noUncheckedIndexedAccess,
         provably value-identical). Boadilla is byte-identical before/after.

✅ DONE  packages/site-parcel-data/src/rulepacks/esMadridSpacm.ts
         Jurisdiction surface: id, CM_SPACM_ENVELOPE_VERIFIED (false), the §6.1 refusal-code map,
         the cited coverage refusal, and §CM-REGISTRATION-BLOCKED.

✅ DONE  packages/site-parcel-data/src/providers/comunidadMadridBbox.ts
         Regional gate from the PUBLISHER'S OWN declared WGS84BoundingBox for
         sitcm:VPLA_V_ORDENANZA, rounded outward + the exact INE-28 citation gate.

✅ DONE  l449CertificationGates.ts + envelopeAuthorisation.ts
         CM_SPACM_ENVELOPE_VERIFIED registered in BOTH totality tables, so the gate is auditable
         and the authorisation classifier fails closed for this corpus. ⛔ STAYS false — flipping
         it is the founder's act and an implementer may not perform it.

⛔ BLOCKED  packages/site-parcel-data/src/rulepacks/registry.ts — NO registration added.
         A RECTANGLE CANNOT ROUTE BETWEEN THE CAPITAL AND BOADILLA. Measured 2026-08-03 from the
         authority's own boundary layer (Callejero:SIGI_V_MUNICIPIOS, keyless):
              MADRID   28079  lon [-3.888963, -3.518126]  lat [40.312065, 40.643280]
              BOADILLA 28022  lon [-3.952589, -3.837814]  lat [40.377684, 40.456197]
         ⇒ 4.35 km of LONGITUDINAL BBOX OVERLAP — the terms interleave (Casa de Campo → El Pardo).
         ⚠ An earlier draft of this file claimed MADRID_BBOX was "~6 km too loose, tighten it".
           REFUTED by the measurement above: the shipped -3.90 is 938 m outside a real -3.888963,
           which is the deliberate outward-rounding discipline every *Bbox.ts states. Tightening
           would reverse a correct decision to make a new row fit.
         ⚠ Second, independent blocker: jurisdictionSpecificity.test.ts asserts "each
           registration's extent CENTRE resolves to that registration". The CM centre
           (40.585, -3.810) is inside Madrid's REAL extent, so that invariant is unsatisfiable by
           ANY rectangle for a region whose capital sits at its centre. Catalonia passes only
           because Barcelona is coastal. The guard was left alone rather than weakened.
         ⭐ THE UNBLOCKER, and it is now known to EXIST: Callejero:SIGI_V_MUNICIPIOS publishes all
           179 municipal boundary POLYGONS, keyless, on the same endpoint as the ordinance corpus.
           registry.ts §EXTENT-SPILLS-A-BORDER rejected polygon extents because "PRYZM holds no
           municipal boundary geometry" — THAT PREMISE IS FALSE for this community. Nothing needs
           inventing; a polygon `contains` predicate can be SOURCED.

⛔ NOT DONE  providers/resolveMadridSpacmRow.ts + server.js GET /api/madrid/ordenanza
         The live lon/lat → ordinance-row seam. Deliberately out of scope for the PORT pass, and
         pointless before routing exists. ⚠ Two transport traps are already recorded and must
         survive into it: the geometry column is GEOMETRY1, and a 4326 INTERSECTS against this
         25830 layer returns HTTP 200 with an EMPTY feature list in BOTH axis orders — a clean,
         successful, empty response that is indistinguishable from "no ordinance polygon here".
         The proxy must return 502 on upstream failure and 200-empty only on a genuine miss
         (STRUCTURAL-SEAM-4: source-data-unavailable vs no-plan-at-point).
```

### 6.1 — `RefusalReason` → `EnvelopeRefusalCode`

Every mapping below is to an EXISTING C58 code; **no new code is proposed.**

| adapter `RefusalReason` | `EnvelopeRefusalCode` | `legallyGrounded` |
|---|---|---|
| `development-ambito-governs` | `derived-plan` | **true** |
| `instrument-class-unpublished` | `regime-undetermined` | false |
| `instrument-key-ambiguous` | `regime-undetermined` | false |
| `routing-token-unrecognised` | `regime-undetermined` | false |
| `public-system` | `public-system` | **true** |
| `not-urban-land` | `protected-soil` | **true** |
| `parameters-contradict` | `regime-undetermined` | false |
| `no-grammar-determined` | `no-rule-pack` | false |
| `required-parameter-unknown` | `no-rule-pack` | false |
| `value-is-existing-derived` | `no-rule-pack` | false |
| `value-is-publisher-estimate` | `no-rule-pack` | false |
| `value-unit-undocumented` | `no-rule-pack` | false |
| `verification-gate-closed` | `no-rule-pack` | false |

⚠ **`source-data-unavailable` is deliberately unused.** It is the only TRANSIENT code and the only
one that earns a retry affordance. Not one adapter refusal clears on a retry — a delegation, an
ambiguity and a contradiction are all durable — so offering one would send the user round a loop for
ever (L-574 / §L-590c).

---

## 7 — What this pass did NOT establish

- **No number was published and no gate was flipped.** `MADRID_ENVELOPE_VERIFIED` is still `false`.
- **Every rate is per ORDINANCE POLYGON.** The regional corpus contains **no parcels**; a
  parcel-weighted figure needs a Catastro join that has not been run at scale.
- **The C63 ENVELOPE axis is untouched.** These shares are of ordinance polygons, not of the L-656
  private-buildable-land denominator, which remains unmeasured for the region.
- **The capital's `UUBV_NM_ED` was not validated against any second source.** Its provenance column
  was read and trusted as the publisher's own statement; nothing cross-checks the figures.
- **No constraint layer was intersected.** AESA / heritage / flood are named, not applied — every
  envelope is an open top (ADR-0293).
- **The `Visor_Edificabilidad` layer's vintage is *enero 2026* and its relationship to the PGOUM-97
  compendium was not established.** It is a municipal publication, read as such.
- **`m² Rev` and `m² Libre` were not chased.** They are 1.2 % of rows and are refused as unknown; a
  municipal answer would convert them, and nobody has asked.
