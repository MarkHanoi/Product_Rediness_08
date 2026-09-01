# LANE E7-NO — NORWAY: the NAP adapter, and the denominator that is not there

**Date:** 2026-09-01 · **Scope:** `packages/site-parcel-data/src/countryAdapters/no/` (8 files),
`__tests__/noAdapter.test.ts` (37 tests), `__tests__/fixtures/no-nap-matrikkel/` (7 recorded
response bodies + README).
**Shared files edited: NONE.** Everything shared is queued in `impl/barrel-additions-no.txt`.
**Nothing committed.**

---

## §0 — THE ONE-PARAGRAPH ANSWER

Norway has the strongest structural planning story in the Nordic set and it is **real**: a
national plan base (NAP) went live under Direktoratet for byggkvalitet, it is **keyless**, it
serves full SOSI attributes **with geometry** per point, and it carries a genuine **in-force
date** on 30 of 30 sampled plans — the first adapter in this wave that can say `validityBasis:
'legal'` on positive evidence for every rule it emits. And the one number an envelope actually
needs is **not obtainable**. `utnytting.utnyttingstall` is filled on **2 of 24** sampled
formålområder; both of those two, and **6 of 6** filled instances found by attribute search,
arrive as a **Java array identity string** in every machine format while only the HTML human
template renders the number; and the SOSI **denominator** that gives that number its meaning —
`utnyttingstype`, a closed **16-member** national codelist in which **two members are
prohibitions on building** — is **not a key on the modern feature type at all**. So the adapter
emits the geometry, the identity, the legal date and the document pointer at tier 1, and emits
the capacity as **tier-6 UNKNOWN with no `valueBasis`**, in a note that names one served number
against sixteen possible meanings, two of which mean you may not build. **That refusal is the
lane's product.** A capacity number is available for Norway only through the bestemmelser
documents, which is E8's work, behind its own gate battery.

---

## §1 — WHAT WAS BUILT

| File | Lines | Role |
|---|---|---|
| `noJurisdiction.ts` | 85 | **RE-EXPORTS** `NORWAY_BBOX`/`isInNorway` from `parcelProviders/countryBbox.ts` + the measured service extent + a dated overlap audit |
| `noMatrikkelClient.ts` | ~310 | impure seam 1: the Kartverket WFS (GML 3.2.1), `FetchOutcome`-classified, count-header trap encoded |
| `noNapClient.ts` | ~360 | impure seam 2: the NAP WMS `GetFeatureInfo` (JSON), the three silent-empty traps refused by name |
| `noParcelProvider.ts` | ~250 | `parseNoTeigElement` + the two `resolveNoTeiger…` entry points |
| `noPlanProvider.ts` | ~340 | typed NAP features; the five vertical levels, never merged |
| `noRuleMapper.ts` | ~560 | **PURE/TOTAL/DETERMINISTIC**; R1/R2/R3/R5, the three-way UNKNOWN guard, two named throws |
| `noSourceRefs.ts` | ~230 | resolves `sourceRegistry/no.ts` + 3 additive probed rows + DK's `assertEndpoint` drift guard |
| `index.ts` | ~330 | the ladder as data, both chain resolvers, `noCountryAdapter`, an explicit re-export list |

Follows the E7 family verdict §6 exactly: EE file layout, LT source-refs shape, DK drift guard,
the L0 refusal vocabulary (`endpoint-unreachable:` · `upstream-failed:` · `no-parcel:` ·
`no-feature:` · `mapper-refused:` **with a d**), the parenthesised `fetchedAtIso` form, `<cc>`
naming, and the explicit re-export list rather than DK's `export *`.

**⭐ IT ADOPTS AN EXISTING AUTHORITY INSTEAD OF MINTING ONE.** The Kartverket WFS is GML-only —
no JSON arm exists — so the parcel arm needed an XML reader. `parsers/appGml/xmlScan.ts` (lane
E2b) is a pure, total, namespace-aware scanner with named refusals; this adapter uses it, and is
its **first consumer outside the Polish parser**. No second scanner was written. That is the
family verdict's own finding — "every genuinely-shared piece already has an authority" — acted
on rather than restated. It also uncovered a defect in it (§3).

---

## §2 — THE CHANNEL, MEASURED

Full transcript: `lane-e7-no-transcripts/08-live-probes.txt` (19 probes, all keyless).

**The old channel is gone.** `wfs.geonorge.no/skwms1/wfs.reguleringsplaner` →
`*** UKJENT APPLIKASJON ***`; `wms.geonorge.no/skwms1/wms.reguleringsplaner` → HTTP 500
`msLoadMap()`. The Geonorge kartkatalog record for the national "Reguleringsplaner" dataset now
names exactly two distributions, both at **`nap.ft.dibk.no`**.

**The keyless channel is `GetFeatureInfo`, and that is not a shortcut — it is the only one.**
`.../services/wfs/reguleringsplaner` → 404. `WMS DescribeLayer` names an internal GeoServer WFS
(`http://ca-opr-nap-geoserver-prod/geoserver/…`) on a container hostname that does not resolve
publicly. The **bulk** arm is gated, and the gate is **machine-declared by the service itself**:
`capabilities/<uuid>` → `"accessConstraintRequiredRole": "nd.filnedlasting"`. The L5 sweep
predicted a Norge-digitalt agreement gate for the national copy; it is now measured, and it is
on the bulk arm only. The WMS answers keylessly, with `AccessConstraints`/`OtherConstraints`/
`UseConstraints` all null in the state's own catalogue record.

**⭐ GetCapabilities is not an inventory (again).** The WMS advertises 8 group layers per
vertical level; `DescribeLayer` expands the `_vn1` set to **22 real feature types** — the single
`hensynssoner_vn1` is eight hensynssone classes, `bestemmelsesomrader_vn1` is seven. The adapter
classifies on those 22, carried as data, and flags anything outside them.

**⚠ The host is the FT environment.** `nap.ft.dibk.no` is what Geonorge's own catalogue
publishes and it answers today; `nap.dibk.no` returned **HTTP 523** on three probes;
`DescribeLayer` names the backend `…-nap-geoserver-**prod**`. Recorded as a dated fact in the
source row's probe log, not smoothed over.

---

## §3 — ⛔ THE BLOCKER, AND IT IS OURS

**`parsers/appGml/xmlScan.ts` cannot read Norway's national cadastre.** EXECUTED against the
pinned fixture:

```
scanXml(matrikkel-teig-bergen-4601-167.xml) -> ok:false
  reason "malformed-tag"   detail  invalid element name "app:område"
  offset 2033              path    /wfs:FeatureCollection[1]/wfs:member[1]/app:Teig[1]
```

The document is well-formed. XML 1.0 §2.3 `NameStartChar` admits `[#xC0-#xD6] | [#xD8-#xF6] |
[#xF8-#x2FF]`, so `å ø æ` are legal XML names; the scanner's `NAME_RE` is ASCII-only.
`<app:område>` is the container of every teig's polygon, so the **whole** response refuses.

**No service-side workaround exists.** WFS `propertyName=` projection to the ASCII-named subset
was probed and is **ignored** — the response still carries `app:område`, same 3 members, same
~11 KB body. No output format changes element names.

**This is not a Norway problem.** It blocks any national GML with accented element names —
NO, DK, SE, IS, DE at minimum.

**What this lane did:** did **not** edit the shared file (barrel protocol), did **not** mint a
second scanner (the standing review rule), did **not** contort the adapter around it. Instead:
the client detects that exact refusal and re-labels it **self-namingly** so nobody reads a PRYZM
regex as a Kartverket outage; a test **pins the defect** and is written to go red when the fix
lands; and the one-line fix — **verified in node to be a strict superset of the old class on
every input tested**, so no PL regression is possible — is queued in `barrel-additions-no.txt`
[1] with the three deletions that must accompany it. `parseNoTeigElement` is complete; the
parcel arm is one shared-file line from live.

---

## §4 — ⛔ FOUR SILENT-EMPTY TRAPS, ALL HTTP 200

Each is indistinguishable from "no plan here" unless the client refuses first
(§CONTEXT-DATA-HONESTY; the L-716 shape — *ask whether the condition can ever be true*).

**T0 · Kartverket's own count header lies.** A GetFeature returning three real teiger reports
`numberMatched="unknown" numberReturned="0"`. Measured: 3 `wfs:member` elements carrying
167/714 (809.3 m²), 167/717 (165.6 m²), 167/718 (226.3 m²). **A client that trusts the header
reports "no parcel here" on three parcels that exist.** The client counts members and never
reads the header.

**T1 · An undocumented scale cliff.** On one feature that certainly exists, at 101 px:
400 m half-window → **1 feature** (1:28,289); 800 m → **0 features** (1:56,577), HTTP 200, no
exception. The advertised `MaxScaleDenominator` is **5,000,000** — two orders of magnitude off.
The client refuses a window wider than the measured band **by name**, and the chain queries at
40 m.

**T2 · A wrong CRS is silent.** `CRS=EPSG:4326` with a metre bbox → HTTP 200,
`{"features":[]}`, no warning. The client sends only CRS tokens it has probed and refuses the
rest **before** the request.

**T3 · `LayerNotDefined` arrives as HTTP 200** with an XML body — `res.ok` is `true`. The body
is inspected for a `ServiceExceptionReport` before any JSON parse, and the refusal carries the
server's own text.

---

## §5 — ⭐ THE FINDING: ONE NUMBER, SIXTEEN MEANINGS, TWO OF THEM PROHIBITIONS

Norway measures utilisation as the SOSI compound `Utnytting = { utnyttingstype, utnyttingstall }`
— a **measurement-basis code** and a **number**. The basis code is a **closed national codelist**,
fetched live from Kartverket's own register: **16 members**.

| family | codes |
|---|---|
| % of **plot** area | 1 BYA-87 · 3 TU · 4 U · 5 F · 12 %-BYA-97 · 16 %-BYA |
| % of **floor** area | 14 %-TU · 18 %-BRA |
| **absolute m²** | 2 BRA-87 · 6 BGA · 7 BFA · 13 T-BRA · 15 BYA · 17 BRA |
| ⛔ **not numbers at all** | **10 "Ikke tillatt å bebygge"** · **11 "Ikke tillatt med ytterligere bebyggelse"** |

**And NAP does not serve the basis code.** On `rparealformalomrade` the key
`utnytting.utnyttingstype` **is not present at all**, while its legacy sibling
`rbformalomrade` **does** carry it (filled 0 of 7). Two layers of one service: one with the
measurement basis, one without.

So a served `utnyttingstall` is **one number against sixteen possible meanings, two of which
say you may not build.** Multiplying it by a parcel area could produce a capacity for a plot
where construction is forbidden — the C63 Aarhus trap in Norwegian. Per control 8 and §6-E R2,
the mapper emits **no `valueBasis`**, never infers one, and the rule's own note states the
refusal with **both numbers**, which is what C74 asks for.

**And the number is destroyed in transit anyway.** `utnytting.utnyttingstall` serialises as
`[Ljava.lang.Double;@<hex>` in `application/json`, `application/vnd.ogc.gml`,
`text/xml; subtype=gml/3.1.1` **and** `text/plain`. The hex differs between two requests for the
same feature (`@1997c7f1` / `@5faa3c69` / `@493a67bb`), proving it is `Object.toString()` on a
fresh array rather than data. **6 of 6** filled instances across 3 Bergen plans. Only
`text/html` renders the value (`2,540` for objid 3062) — a human presentation template with
locale-formatted decimals.

**The HTML is not adopted.** Scraping it would mint a rival transport for one field, it is not
a machine channel, and the number would **still** have no denominator. E8 owns document
extraction.

**So the guard is THREE-WAY, because these are three different facts** (control 9):

| state | emitted | why it must not collapse |
|---|---|---|
| key absent / null / `''` | tier 6, "NAP served no value" | the plan is silent through this channel |
| Java-array sentinel | tier 6, "**the transport destroyed the value**" | the state **has** a value and this channel cannot carry it — the E8 entry point |
| a finite number | tier 1, value emitted, still no `valueBasis` | authoritative, and still unmultipliable |

`Number('[Ljava…')` is `NaN`, so a naive parse collapses state 2 into state 1 and loses the fact
that a value exists. Falsification **F3** severs that branch and the named test goes red.

---

## §6 — ⭐ ONE PARCEL, TWO PLANS, FORTY YEARS APART, AT TWO VERTICAL LEVELS

SOSI publishes every reguleringsplan object at a `vertikalnivå` (NAP exposes `vertikalniva_1`…`_5`),
and NAP's own HTML decodes **level 1 as "Under grunnen (tunnel)"**. Measured at Bergen teig
4601-167/714, one point, one request each:

* **`_vn1`** → plan **4601/65800000** *"BERGENHUS. BYBANEN FRA SENTRUM TIL ÅSANE, DELSTREKNING 1"*,
  in force **2023-05-31**, with an arealformål 2022 field `o_STS3`, a RpSikringSone 190, a
  RpBåndleggingSone H730_2 and a RpBestemmelseOmråde — **all under ground**, a light-rail tunnel.
* **`_vn2`** → plan **4601/5380000** *"BERGENHUS. STØLEN/LADEGÅRDEN/ROTHAUGEN"*, in force
  **1983-10-10**, and **no formålområde at all** — a pre-2009 plan whose outline is digitised and
  whose content is not.

**A chain that queried only `_vn1` would hand a consumer a tunnel and call it the zoning.** The
adapter walks all five declared levels, keeps each as its own typed outcome, never merges them,
carries `verticalLevel` as a tier-1 rule of its own, and encodes the level in every minted
entity's typology code (`rparealformalomrade_vn1`).

**And there is no projection or geometry math anywhere in this adapter.** Matrikkelen serves each
teig's own `representasjonspunkt` in EPSG:25833, and NAP accepts EPSG:25833. EE had to replace a
vertex-mean centroid with a server-side ring intersection because a computed centroid falls
outside a concave parcel and silently queries the neighbour; Norway never poses that problem —
the anchor is a point the **state** published, in the CRS both services already speak.

---

## §7 — ACCEPTANCE

**A real zone resolved end to end, from the state's own recorded bytes, at the CHAIN layer.**
Measured inventory for Bergen teig 4601-167/714 (asserted in the suite, not narrated):

```
19 rules · 14 tier-1 · 5 tier-6 · 19/19 validityBasis 'legal' · 19/19 carry a document
2 SiteIntelPlan · 1 SiteIntelZone · 3 SiteIntelPrescription · levels 3-5 honestly ABSENT
vn1 tier1  landUsePurpose "2022" · ownershipForm "1" · fieldDesignation "o_STS3" · verticalLevel "1"
vn1 tier6  degreeOfUtilisation · degreeOfUtilisationMinimum · outdoorAmenityArea ·
           structureProvisionCode · accessProvisionCode        (all value:null, all noted)
vn1 tier1  planType "35" · planStatus "3" · planProvisionsCode "4" · legalReference "6" · planName
vn2 tier1  planType "30" · planStatus "3" · planProvisionsCode "1" · legalReference "3" · planName
```

* **source + confidence tier on every rule** — yes, all 19, and every `basis` ref resolves to an
  entity returned in the same result (asserted).
* **tier-6 UNKNOWNs visible and counted against an INDEPENDENT census of the source** — the five
  tier-6 rows are emitted off the **DECLARED** vocabulary (5 entries), not off the served bag, so
  a server that omits null keys cannot silently delete a parameter. The independent census is
  §P14: `utnyttingstall` 2/24 · `uteoppholdsareal` 0/24 · `byggverkbestemmelse` 0/24 ·
  `avkjørselsbestemmelse` 0/24 across 5 kommuner.
* **refusals carrying both numbers (C74)** — the denominator note names **one** served value
  against **sixteen** codelist members, **two** of them prohibitions.
* **live where the service permits** — the whole channel was probed live and keylessly; the
  fixtures are the state's own bytes with the re-record commands and sha256 pins in their README.
  ⚠ **Three of seven hashes are deliberately not pinned**, because they are not reproducible: the
  leak fixture's value is an object identity that changes per request, and the GFI bodies carry a
  server `timeStamp`. The suite asserts those on **content**, and the changing hash is itself the
  evidence.

**R1/R2/R3/R5, each answered rather than defaulted:**

| seat | NO | why |
|---|---|---|
| **R1 basis** | zone → plan → inline geometry → **throw by name** | the full referent ladder; nothing dangles |
| **R1 rank** | `null` — *the ladder exists but is adapter DATA* | NAP serves no rank axis; `plantype` looks rankable but the national register publishes **no Plantype codelist**, and ranking on unresolved codes is a guess wearing a type |
| **R1 useScope** | the zone's own `arealformål` code, verbatim | every rule from a zone is a rule about that use |
| **R2 valueBasis** | **absent, deliberately** + the refusal note; **throws** on a 17th codelist value | §5 |
| **R3 validityBasis** | `'legal'` + `ikrafttredelsesdato` (30/30 filled); `'ingestion'` + fetch date when the plan does not resolve | the first adapter in this wave with positive in-force evidence on every rule |
| **R5 normativeForce** | `null` on every rule — **and this is the "say so"** | NAP serves no force flag on any measured type; not an assertion of non-bindingness |

**⭐ The suite caught a real R1 violation before a human did.** `NoResolvedLevel` originally
carried minted entities only under `zones`; a level whose plan has **no** formålområde — exactly
Bergen's 1983 surface plan — emitted plan-level rules citing `plan:no-plan-4601-5380000` while
the result carried no such entity. The "every basis ref resolves in the same result" test failed
**by name** on it. `planEntities` was added in response.

**Falsification, executed in the foreground, restored byte-identically (sha256
`88c8451a…0326de` before and after all three):**

| target | severance | seen failing |
|---|---|---|
| **F1** provenance leg | `noSourceRef.document` → `null` | *"F1 · every rule carries the plan's bestemmelser document…"* — `expected null to be 'https://www.arealplaner.no/…'` |
| **F2** R3 legal arm | `noValidity` always `'ingestion'` | *"F2 · R3 validityBasis is 'legal'…"* — `expected 'ingestion' to be 'legal'`, **+2 more** |
| **F3** UNKNOWN guard | drop the sentinel branch | *"F3 · the Java-array leak is UNKNOWN-DESTROYED…"* — `expected 'unreadable' to be 'transport-destroyed'`, **+1 more** |

**Scramble controls (§6-G.5, mandatory — 2 of them):** perturbing `arealformål` /
`ikrafttredelsesdato` / `feltbetegnelse` makes the same end-to-end assertion function go red;
severing only the plan's `planidentifikasjon` collapses R3 from `legal` to `ingestion`, nulls
the document, nulls `plan_id`, and drops the R1 basis to the inline-geometry leg — all asserted.

**Gates:** NO suite **37/37**; package suite **167 files / 3,560 tests, RC=0** (baseline, with
the sibling FI/LU/SE lanes' new suites in it); package `tsc` **RC=0**; root
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` **RC=0, 0 errors**
(`$?` read immediately, no pipe). No ceiling raised, no gate disabled, no `gate-debt.json` entry,
no rival built, nothing committed.

---

## §8 — PROPOSED ISSUE-LOG ROWS (highest existing L-12875)

**L-12876 — ⛔ OPEN (P1) · `parsers/appGml/xmlScan.ts` REJECTS LEGAL XML NAMES, AND IT BLOCKS
EVERY NORDIC/GERMANIC NATIONAL GML, NOT JUST NORWAY.** `NAME_RE` is ASCII-only; XML 1.0 §2.3
admits `[#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF]`. EXECUTED: Kartverket's `app:område` refuses
the whole document at offset 2033. No service-side workaround (`propertyName=` is ignored,
measured). **Disposition: FIX — the one-line replacement in `barrel-additions-no.txt` [1],
verified in node as a strict superset of the current class.** **Acceptance:**
`scanXml(matrikkel-teig-bergen-4601-167.xml).ok === true`, the PL suite unchanged, and the
NO defect-pin test deleted with its two siblings.

**L-12877 — ⛔ OPEN (P1) · NAP DESTROYS `utnyttingstall` IN EVERY MACHINE FORMAT WHILE RENDERING
IT CORRECTLY FOR HUMANS.** `[Ljava.lang.Double;@<hex>` in JSON / GML 3.1.1 (×2) / text-plain;
`2,540` in HTML; hex changes per request; 6 of 6 filled instances. **This is an upstream defect
in a national service and PRYZM cannot fix it.** **Disposition: REPORT UPSTREAM to DiBK, and
keep the tier-6 `transport-destroyed` arm until it is fixed.** **Acceptance:** a NAP
GetFeatureInfo JSON response carries a numeric `utnytting.utnyttingstall`, and the NO suite's
transport-destroyed test flips to the `value` arm.

**L-12878 — ⚠ OPEN (P2) · NAP SERVES NO `utnyttingstype` ON `rparealformalomrade`, SO EVERY
NORWEGIAN CAPACITY NUMBER ARRIVES WITHOUT ITS DENOMINATOR.** The key is absent from the modern
feature type and present (empty) on the legacy one; the national codelist has 16 members, 2 of
them prohibitions on building. **Disposition: REPORT UPSTREAM; meanwhile the adapter emits no
`valueBasis` and refuses the per-parcel multiply by name.** **Acceptance:** the key appears in a
NAP GetFeatureInfo answer, and `readUtnyttingstype` returns a code instead of `undefined`.

**L-12879 — ⚠ OPEN (P2) · THE NAP GetFeatureInfo SCALE CLIFF IS UNDOCUMENTED AND RETURNS A FALSE
EMPTY.** Answers at 1:28,289, returns 0 features at 1:56,577, against an advertised
`MaxScaleDenominator` of 5,000,000. **Disposition: encoded as a named refusal in
`noNapClient.ts`; report upstream so the advertised scale matches the served one.**
**Acceptance:** a GetFeatureInfo at 1:100,000 either answers or returns a `ServiceException`.

**L-12880 — ⚠ OPEN (P3) · KARTVERKET'S WFS REPORTS `numberReturned="0"` OVER REAL FEATURES.**
Measured over 3 teiger. **Disposition: the NO client counts members and never reads the header;
report upstream.** **Acceptance:** `numberReturned` equals the member count.

**L-12881 — ⚠ OPEN (P3) · `NORWAY_BBOX` IS WIDER THAN THE SERVICE IT ROUTES TO, AND SWEDEN LIES
ENTIRELY INSIDE IT.** `countryBbox.ts:54` says `{57.8..71.4 N, 4.4..31.3 E}`; Kartverket
declares `{58.024832..70.665014 N, 5.114669..23.692099 E}`. A Stockholm point routes to the
Norwegian proxy today (pre-existing; FI is already ordered before NO for the same reason).
**Disposition: L-12871's precedence lane — the E7-SE lane must land ahead of NO, exactly as FI
does.** The NO adapter already carries `NO_MATRIKKEL_SERVICE_BBOX` +
`isInNoMatrikkelServiceExtent` so a caller can distinguish "outside Norway" from "inside Norway,
outside the served extent". **Acceptance:** a Stockholm point does not route to `/api/parcel/no`.

---

## §9 — RECORDED, NOT ACTIONED (control 10)

* **NAP `kommuneplaner` WMS is live and keyless** (HTTP 200, WMS 1.3.0) and is the fallback where
  no reguleringsplan exists. Its vocabulary and fill were **not** measured, so it is not consumed
  — adding it unmeasured is exactly the scope expansion control 10 forbids. The endpoint is
  pinned in `noNapClient.ts` so the next lane starts from a probe, not a search.
* **`rpregulerthoyde` (Regulert høyde) returned 0 features** across all 110 query points and a
  25-window fine-scale sweep inside its own 1:5,000 limit. The height axis is not measurable
  through this channel today. **No `maxHeight` row is emitted** — inventing a parameter the
  declared vocabulary does not carry would be the opposite error to the one this lane is guarding
  against.
* **`informasjon` carries the plan's VERTICAL DATUM as prose** — *"Høydereferanse NN2000"* and
  *"Høydereferanse Trondheim lokal"* both observed (6/30). Any absolute height from such a plan
  is measured against a datum that is sometimes **local**. Emitted verbatim as a tier-2
  `in-document-text` rule; parsing it is E8's.
* **CQL_FILTER works on the NAP WMS** (GeoServer extension; dotted names must be double-quoted).
  It was used to *find* fixtures. The adapter does not send it — it is not a WMS capability and
  depending on an unadvertised implementation detail would be a rival access path.
* **The WMS feature `id` is not stable** across requests for the same object. Durable identity is
  `identifikasjon.lokalId` + `arealplanId`; no minted id derives from the `fid`.
* **`SiteIntelPlan.status` had to mirror a bare SOSI code (`'3'`)** because NAP serves no
  `planstatus_navn` column. Mirroring is right (a PRYZM translation table would be the invented
  harmonisation the schema forbids), but it means one country's `status` string is not comparable
  with another's. Worth a canonical-model conversation **after** the freeze, not during it.
* **Two kommune planregister portal families** carry the bestemmelser: `arealplaner.no` (Norkart)
  and `plandialog.isy.no` (Norconsult ISY). E8 will need both.
* **Svalbard** is outside both the router box and the service extent; its arealplaner are a
  separate Geonorge dataset whose distribution is `GEONORGE:OFFLINE` — not served online at all.

**No schema change was needed.** `packages/schemas/**` is untouched (control 3). R1/R2/R3/R5 +
tier 6 carried every Norwegian fact, including the two with no sibling precedent: a served
in-force date distinct from the adoption date, and a value **destroyed in transport** rather than
absent.

---

## §10 — THE ONE-SENTENCE HANDOFF

**Norway's national plan base is real, keyless and legally dated, and it will still not tell you
how much you may build — so the adapter ships the geometry, the identity, the in-force date and
the document pointer at tier 1, ships the capacity as a tier-6 refusal that names one number
against sixteen meanings including two prohibitions, and hands E8 the bestemmelser link; fix the
one-line XML scanner and the cadastre arm turns on with no other change.**
