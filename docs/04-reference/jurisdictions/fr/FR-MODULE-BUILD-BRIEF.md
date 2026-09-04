# PRYZM — France Module Build Prompt (the founder's brief, captured verbatim)

> **Provenance:** pasted by the founder into the working session 2026-09-02; captured to the repo
> the same turn per the standing capture-founder-research-to-repo rule. Compiled 2 September 2026.
> Every factual claim is marked VERIFIED or UNVERIFIED — treat the distinction as binding.
> **Execution note (orchestrator):** Phase 0 (§2) was dispatched as lane FR-PHASE0 the same hour,
> under the brief's own stop-and-report gate. The existing FR machinery this brief lands beside:
> `countryAdapters/fr/` (zone-identity leg, GPU 3-rung ladder, committed `35baaabd`) and the Paris
> pack (`frParisPluBioclimatique.ts`, drawing under §PARIS-SIGN-OFF) — Phase 0 must read both
> first and extend, never rival.

---

## 0. Mission

Build the France jurisdiction module: given a coordinate or a cadastral reference anywhere in France, produce either a **buildable envelope with every parameter carrying the article it derives from**, or a **typed, cited refusal naming exactly what could not be resolved**.

Never a number without a source. Never "done" when it means "mostly".

---

## 1. Non-negotiables

Violating any of these is a failed implementation regardless of test results.

1. **Determinism.** Same input → byte-identical output. No LLM in the geometry path. No vector search, no semantic retrieval, no chunk ranking anywhere in rule resolution.
2. **No fabricated values.** A parameter with no article is not a parameter. If a value cannot be derived, the field is `unresolved` with a `refusal_reason`, never a default or an interpolation.
3. **Provenance per parameter, not per envelope.** Every value carries `value, unit, instrument, article, date_in_force, method, inputs, retrieved_at, confidence`.
4. **Partial output over blank output.** If one slot is unresolvable, emit what is resolvable and name the gap. See §8.
5. **Verify before trusting this document.** Every endpoint and field claim below must be confirmed by a live contract test in your environment before code depends on it. Report discrepancies rather than working around them.

---

## 2. Phase 0 — Measure before you build. Do this first and stop.

**Do not write the envelope solver until Phase 0 has run and reported.**

Download the national extract:

```
https://www.geoportail-urbanisme.gouv.fr/api/extraction/download-latest
```

GeoPackage per layer, CNIG schema. Load `ZONE_URBA`, `DOC_URBA`, `PRESCRIPTION_SURF`, `PRESCRIPTION_LIN` into PostGIS.

Report these numbers and then **stop and present them**:

| Metric | Query |
|---|---|
| **`NOMFIC` fill rate** | % non-null, by `TYPEDOC` and standard version. **This is the gate.** |
| `URLFIC` fill rate | % non-null; and of 500 sampled, % returning HTTP 200 |
| Zone-scoped vs shared règlement | distinct `URLFIC` per `IDURBA` ÷ zone count per `IDURBA` |
| `DESTOUI`/`DESTCDT`/`DESTNON` fill | % non-null each |
| `FORMDOMI` fill + value distribution | % non-null, frequency of every code |
| Drawn setbacks | count `TYPEPSC=15`, subtypes 00/01/02/03/98; distinct documents; zones intersecting |
| Plan-masse sectors | count `TYPEPSC=14`; total area; communes |
| Volume bonuses | count `TYPEPSC=30` (00–04) and `29` (00–02) |
| Provenance fill | % non-null `ETAT`, `DATAPPRO`, `DATEFIN`, `NOMREG`, `URLREG` |
| Standard version distribution | across all documents, including obsolete v2013/2014/2017 |
| Document inventory | parse `https://www.geoportail-urbanisme.gouv.fr/atom/download-feed/`, split by family and type |
| PLUi leverage | communes per PLUi × population; documents needed for 25/50/75% of national population |

**If `NOMFIC` fill is high, proceed as specified. If it is low, stop and report — the extraction strategy changes shape and the architecture below needs revising.**

---

## 3. Verified facts — the legal and structural picture

### 3.1 There is no regional layer (VERIFIED)
Régions produce SRADDET, SCoT is inter-communal — both strategic, neither sets envelope parameters. The envelope is set at commune or EPCI level. Do not model a regional tier.

### 3.2 Five regimes (VERIFIED)
| Regime | Envelope rules | Handling |
|---|---|---|
| **PLU / PLUi** | Full parameters | Main path |
| **POS** | Caduc since 27 March 2017 | Treat as dead; fall through to RNU unless replaced |
| **Carte Communale** | No own règlement — zoning only | RNU rules apply |
| **RNU** | Constructibilité limitée | **Permanent refusal** — see §3.3 |
| **PSMV** | Building-by-building | Recipe 1; requires the specific document |

### 3.3 RNU is a permanent refusal (VERIFIED)
Construction is permitted only within the *parties actuellement urbanisées*, which is a case-by-case determination by the instructing authority and exists in no dataset. As of published figures, 9,461 of 35,010 communes, 23.77% of national surface. **Re-derive from the current SuDocUH release before quoting.** Emit a cited refusal, never an envelope.

### 3.4 COS was abolished (VERIFIED)

> ⚠ **CORRECTED 2026-09-04 (lane ENVELOPE-FR) — the bolded sentence below was TOO BROAD and is
> withdrawn.** It read: ***"There is no floor-area quantum constraint in France."***
> The founder's transmission overturns the blanket form
> ([`FR-FOUNDER-REACHABILITY-BOUNDARY.md`](FR-FOUNDER-REACHABILITY-BOUNDARY.md) §6):
>
> > *"Otherwise we could accidentally throw away a legitimate constraint just because it isn't
> > called COS."*
>
> ```
> COS / old coefficient          = DISCARD (dead, Loi ALUR + the 2015 reform)
> surface de plancher definition = ACTIVE  (Légifrance LEGIARTI000029593965 repealed the COS, not SDP)
> floor-area-based rule          = potentially ACTIVE in a given PLU
> ```
>
> **What survives of the paragraph:** COS itself is dead, and a COS token found in a pre-2016
> règlement is discarded. **What does not:** the leap from "COS is dead" to "no floor-area rule can
> bind". `D1` is **NULLABLE per jurisdiction — never ABSENT from the vocabulary**
> (`EnvelopeParameterKey`, `packages/schemas/src/site/zoning/RuleState.ts`).
>
> ⛔ **Consequential spec fix for steps 6–7:** §7's *"detect and discard any COS found"* must not
> over-fire. The detector has to separate a genuine COS (pre-2016 Art. 14 / the COS token — discard,
> log) from an **SDP-expressed floor-area rule in a current règlement — KEEP, as a live D1**.
> Deleting the latter as "dead COS" is the L-942 refusing-half defect applied to yield.
>
> ⭐ **And this is why the correction is not cosmetic.** The 100-parcel audit
> ([`findings/fr-100-parcel-audit/`](findings/fr-100-parcel-audit/FR-100-PARCEL-VALUE-RECOVERY-AUDIT.md) §4)
> carries **D1 as a real measured row: 0 % recovered, 89 `unrecovered` states.** Under the withdrawn
> claim D1 would have been absent from the table entirely — a constraint class that binds real
> parcels, invisible instead of measured at zero. **"We recover 0 % of this" and "this does not
> exist" are different sentences, and only the first is true.**

Loi ALUR n° 2014-366 of 24 March 2014 removed the coefficient d'occupation des sols and minimum plot size. ~~**There is no floor-area quantum constraint in France.**~~ (See the correction box above.) Consequences:
- The envelope is **usually** the entitlement, and where no SDP rule binds, yield = volume × efficiency assumptions.
- No COS-style trimming policy is needed for the ordinary case; where a live SDP rule IS found, it binds as a D1 and must be carried.
- **If your schema requires a floor-area ratio to compute a yield, France is the bug** — a French parcel often has no D1. Fix the schema to permit its ABSENCE; do not delete the key, and do not special-case France.
- Exception: `L151-28` / `R151-37` majorations permit exceeding gabarit, hauteur and emprise in delimited sectors, capped at 20% per rule. Model as **conditional volumetric increments**, never as a resurrected COS.

### 3.5 Two règlement structures coexist (VERIFIED)
- **Pre-2016**: numbered articles per zone. Art. 6 = implantation vs voies; Art. 7 = limites séparatives; Art. 8 = between buildings on same plot; Art. 9 = emprise au sol; Art. 10 = hauteur; Art. 14 = COS (**dead — ignore any COS found**).
- **Post-2016**: décret n° 2015-1783 of 28 December 2015, three chapters; envelope parameters under *Volumétrie et implantation des constructions*, R151-39 to R151-41.

Detect by heading structure, **not by approval date** — the correlation is unreliable.

### 3.6 R151-12 — legally valid non-numeric rules (VERIFIED)
A PLU rule may be expressed qualitatively as a result to achieve, provided it is precise and verifiable. **No number exists in the source.** Detect, quote the rule verbatim, emit a range typed `discretionary`. Never interpolate. This is the reason 100% coverage is unavailable and it must be visible in the output.

### 3.7 SRU is not usable yet (VERIFIED)
CNIG SRU Level 1 (structured text) is official since 2022; Level 2 (extraction of rules and their parameters) is still a project. Structuring the règlement is **not obligatory and does not replace the PDF**, and the standard has no regulatory status. Adoption is voluntary and at pilot stage.

**Design for it anyway:** keep the rule model as `condition → constraint` so an SRU Level 2 ingest is a new adapter, not a refactor.

---

## 4. Verified endpoints and contracts

### 4.1 API Carto GPU (VERIFIED from `IGNF/apicarto` source and test suite)

Base: `https://apicarto.ign.fr/api/gpu/`
Backend: proxy over `https://data.geopf.fr/wfs/ows`, geometry field `the_geom`, `_limit = 5000` hard-coded (500 per layer on `/all`).

| Route | Params | Backing layer |
|---|---|---|
| `/municipality` | `geom` or `insee` | `wfs_du:municipality` |
| `/document` | `geom` or `partition` | `wfs_du:document` |
| `/zone-urba` | `geom` or `partition` | `wfs_du:zone_urba` |
| `/secteur-cc` | `geom` or `partition` | `wfs_du:secteur_cc` |
| `/prescription-surf` `-lin` `-pct` | `geom` or `partition` | `wfs_du:prescription_*` |
| `/info-surf` `-lin` `-pct` | `geom` or `partition` | `wfs_du:info_*` |
| `/acte-sup`, `/assiette-sup-{s,l,p}`, `/generateur-sup-{s,l,p}` | + `categorie` | `wfs_sup:*` |
| `/all` | `geom` | all of the above |

Both GET and POST. JSON/GeoJSON, WGS84. Open licence.

**Contract assertions from the test suite — implement these as your own regression tests:**
```
/municipality?insee=25349                     → properties.name === 'LORAY'
/municipality?geom={Point 1.654399,48.112235} → properties.is_rnu === false
/document?geom={same point}                   → du_type==='PLUi', partition==='DU_200070159'
/zone-urba?geom={same point}                  → MultiPolygon, properties.libelle === 'A'
```

**Architectural requirement:** API Carto is a proxy with no availability guarantee. **Mirror the weekly extract as your runtime source; use the API for freshness checks and cache misses only.** Implement a direct `data.geopf.fr/wfs/ows` fallback using the layer names above.

### 4.2 Document retrieval (VERIFIED)
```
https://www.geoportail-urbanisme.gouv.fr/document/info/?partition=<partition>
https://www.geoportail-urbanisme.gouv.fr/document/download-by-partition/<partition>
https://www.geoportail-urbanisme.gouv.fr/atom/download-feed/
```
Partition format: `DU_(<INSEE_COMMUNE>|<SIREN_EPCI>)`. A 404 means "fetch by another route", not "no document" — PLUi redirection was not guaranteed in GPU v2.

### 4.3 Other national sources
| Need | Source |
|---|---|
| Parcel geometry | API Carto cadastre module; `cadastre.data.gouv.fr` |
| Terrain (datum values) | RGE ALTI / Géoplateforme altimetry API — point elevation and profiles |
| Adjacent buildings | BD TOPO, LoD1 — heights are photogrammetric, quality varies by vintage |
| Address resolution | BAN / API Adresse |
| Risk | Géorisques |
| Heritage | Monuments historiques dataset; SUP AC1 via GPU |
| Comparables | DVF / DVF+ |
| Regime register | SuDocUH on data.gouv.fr |

---

## 5. Verified schema — CNIG, from `IGNF/validator-config-gpu`

Vendor these models into the repo and pin them. Do not fetch at runtime.

### `ZONE_URBA` (VERIFIED)
| Field | Required | Use |
|---|---|---|
| `WKT` | ✅ | Zone geometry (MultiPolygon) |
| `LIBELLE` | ✅ | Zone code as on the plan |
| `LIBELONG` | — | Full name as in the règlement chapter |
| `TYPEZONE` | ✅ | National list — PLU 2025: `U, AUc, AUs, A, N` |
| `IDURBA` | ✅ | Document identifier |
| **`NOMFIC`** | **✅** | **Filename of the règlement *for that zone*** |
| `URLFIC` | presence required, value optional | URL to that file, or to the indexed full règlement |
| `DESTOUI` / `DESTCDT` / `DESTNON` | — | Uses permitted / conditional / prohibited, regex-validated national code list |
| `FORMDOMI` | — | 4-digit code, FK to `ListeFormDomi` (~50 codes) |
| `DATVALID` | — | Last validation of zone or its règlement |

### `DOC_URBA` (VERIFIED)
`TYPEDOC`, `ETAT`, `DATAPPRO`, `DATEFIN`, `IDURBA`, `SIREN`, `NOMREG`/`URLREG`, `NOMPLAN`/`URLPLAN`, `NOMRAPP`/`URLRAPP`, `SITEWEB`, `DATEREF`, `TYPEREF`, `NOMPROC`.

**`DATAPPRO`, `DATEFIN` and `ETAT` satisfy the provenance requirement directly.** Use them; do not infer.

### Prescriptions — envelope-relevant codes (VERIFIED)
| Code | Meaning | Use in solver |
|---|---|---|
| **14,00** | Secteur de plan de masse (R151-40) | **Drawn volume → Recipe 1 / footprint path F-A** |
| **15,00–15,03, 15,98** | Règles d'implantation (R151-39) | **Setback lines as geometry** — 01 voies, 02 limites latérales, 03 fonds de parcelles, 98 alternative |
| 29,00–29,02 | Densité minimale | Minimum constraint |
| 30,00–30,04 | Majorations de volume constructible | Conditional increment to height/emprise |
| 01,xx | Espaces boisés classés | Negative overlay |
| 02,01 / 02,02 | Interdiction / conditions spéciales de constructibilité | Hard negative / conditional |
| 05,xx | Emplacements réservés | Removes land from buildable area |
| 07,xx | Patrimoine bâti / paysager | Negative overlay + discretionary flag |

`PRESCRIPTION_SURF` also carries `NOMFIC` and `URLFIC` — a document per prescription.

### Version handling (VERIFIED)
CNIG supports PLU/CC **v2022-10** and **v2025-06** (latter strongly recommended); **v2013, v2014, v2017 are obsolete but still present in the live database** as historic documents. Standard version is **not a clean field** — infer from document metadata or schema shape, and log the inference.

---

## 6. Solver architecture

Implement the three-slot model. Do not model the envelope as fields on a zone record.

```
Envelope = ⋂(volumetric constraints), evaluated against a datum, over a parcel with typed frontages
```

Two constraint kinds only: **volumetric** (planes, half-spaces, offsets — composable by intersection, order-independent) and **quantum** (scalar caps — absent in France, see §3.4).

### Slot fill order

**PARCEL** — always: parcel polygon, height datum (from RGE ALTI + the règlement's datum *definition*), frontage typing per edge, terrain surface, adjacent building heights.

**FOOTPRINT** — first available path:
- `F-A` drawn — prescription `14,00`, or a `15,xx` set that closes the figure
- `F-B` depth-driven — bande de constructibilité from the règlement
- `F-C` ratio + setbacks — emprise au sol × parcel area, inset by recul and retrait. **Normal case.**

**TOP** — compute every available path, take the lowest:
- `T-A` metric — `max_height_m` + datum
- `T-B` storey-driven — storeys × floor-to-floor + ground-floor height + datum
- `T-C` both — **the normal European case; the tighter governs**

### The France fixed point (VERIFIED)
The classic Art. 7 rule is `L ≥ H/2, minimum 3 m`. Variants: `H/3`, `2H/3`, fixed minimum taken as the greater. **Retrait depends on the building's own height. This is circular.**

```
H = max_height_cap
repeat:
    d = retrait_rule(H)          # e.g. max(0.5 * H, 3.0)
    footprint = inset(parcel, d)
    if viable(footprint): break
    H -= step
```
**Declare the step size and convergence tolerance in config and log them with the output.** Two runs of the same input must agree, or determinism is broken.

Three sub-traps:
- The `H` in `H/2` is usually **hauteur à l'égout**, not au faîtage. You need both heights to solve one constraint.
- The retrait applies **"en tout point"** — against the projected envelope including balconies and roof overhangs, not the wall plane.
- Many PLUs permit building **on** the boundary below a stated height (commonly 3.20–3.50 m à l'égout). The constraint is **piecewise**.

### Multi-frontage
Corner and through plots face streets of differing widths. Segment the façade, solve per segment, reconcile at the step. Two reculs on a small corner plot can leave almost nothing — that result is correct and will be challenged; make the derivation inspectable.

---

## 7. Extraction — the only remaining gap

Target: **`hauteur` and `emprise au sol`**, per zone. Plus numeric setbacks where not drawn.

**Retrieval is already solved by the schema. Do not add semantic search.**
```
zone → LIBELLE (zone code) + NOMFIC/URLFIC (that zone's règlement file)
     → fetch → locate the zone's chapter by LIBELLE/LIBELONG
     → structured extraction → value + article + confidence
```

Requirements:
- Emit `article` alongside every value. No article → `unresolved`.
- Emit `method`: `direct | table-lookup | computed | interpolated | inferred`.
- **Detect R151-12 qualitative rules** and route to a `discretionary` range with the rule quoted verbatim. This detector is a hard gate — a qualitative rule silently converted to a number is the worst failure the system can produce.
- Detect and **discard any COS found**. Log it; do not use it.
- Record which height is regulated (égout / faîtage / acrotère) and the datum definition (terrain naturel avant travaux / finished grade / voie). **On slope, many PLUs require the most unfavourable point.**
- Do not assume OCR is needed. Measure what fraction of sampled règlements lack a text layer before building an OCR path.

---

## 8. Degradation ladder — output when a slot fails

| Missing | Emit | Label |
|---|---|---|
| TOP only | Footprint as unbounded prism | *Footprint derived. Height unresolved.* |
| FOOTPRINT only | Height limit alone | *Height derived. Footprint unresolved.* |
| Street width (F-B path) | Footprint + height **range** across plausible bands | *Height indeterminate pending street width.* |
| Datum value | Volume, vertically unplaced | *Volume derived. Absolute level unresolved.* |
| Qualitative rule (R151-12) | Range + rule quoted | *Discretionary. Non-prescriptive.* |
| RNU commune | Nothing | *Refused: RNU. Buildability depends on PAU determination by the authority.* |
| Site-specific plan, document absent | Nothing | *Refused: [ref] governs; parameters unpublished.* |
| No parcel geometry | Nothing | *Refused: no parcel geometry.* |

---

## 9. Never claim these (VERIFIED as undeterminable)

Build into the refusal vocabulary, not the backlog.

- Whether an RNU parcel lies within the *parties actuellement urbanisées*
- The numeric value behind a qualitative R151-12 rule
- The ABF's opinion within a monument historique perimeter
- Whether an envelope would receive consent
- Party-wall status — BD TOPO shows touching footprints; mitoyenneté is a fact about title

---

## 10. UNVERIFIED — flag, do not assume

1. **`FORMDOMI` semantics.** ~50 codes, FK to `ListeFormDomi`, **labels not read**. If it encodes dominant built form it is a free machine-readable ordering type. **Read CNIG Standard PLU v2025-06 and report before using it.** Do not infer meaning from numbering.
2. **Fill rates.** Every field marked required is required *by the standard*; the GPU acknowledges incompleteness in the live database. Phase 0 measures this.
3. **Live API field exposure.** GPU docs say the database is "très proche" of CNIG with a `partition` column added. Run `DescribeFeatureType` and diff against the vendored models.
4. **The contract assertions in §4.1** are from the current `master` of `IGNF/apicarto`. Re-run them.
5. **GPU v3** is in specification with maintainers warning of breaking changes. Pin, monitor the ATOM feed, own your contract tests.
6. **Paris** operates its own PLU and has been through a recent revision. Verify separately.
7. **Absence of a prescription in the GPU is not evidence it does not exist.** This must appear in the scope statement.

---

## 11. Build order

1. **Phase 0 measurement. Stop and report.** (§2)
2. Contract tests against §4.1. Stop and report discrepancies.
3. Ingest the weekly extract into PostGIS. Vendor and pin the CNIG models.
4. **Ship the no-extraction product**: regime, derivability, zone, permitted uses, prescriptions, SUP, terrain, neighbours, governing document with approval date and a link to the law. **This is shippable before any PDF is parsed.**
5. Frontage typing, datum resolution from RGE ALTI, drawn-setback ingestion (`15,xx`), plan-masse detection (`14,00`).
6. Solver: three slots, intersection semantics, the `H/2` fixed point.
7. Extraction: hauteur + emprise, with the R151-12 detector as a gate.
8. Degradation ladder and refusal vocabulary.

**Step 4 is a product. Do not defer shipping it until step 7 works.**

---

## 12. Acceptance criteria

- Same input → byte-identical output, verified by running every fixture twice and diffing.
- No envelope emits a value without an `article`. Assert in CI.
- A known RNU parcel returns a refusal, not an envelope.
- A parcel with a `14,00` plan-masse takes the F-A path, not F-C.
- An `H/2` case converges and logs its tolerance.
- A règlement with a qualitative height rule returns a range, never a number. **Include a hand-built fixture for this.**
- A COS present in an old règlement is discarded and logged.
- Zone code, `NOMFIC` and article are reproducible from the output alone.
