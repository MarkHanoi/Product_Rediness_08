# Norway — MASTER DATA-SOURCE & RULE-MECHANISM STUDY for the buildable-envelope engine

**Companion to the France and Germany studies, same method.** Three cities studied in depth:
**Oslo**, **Bergen**, **Trondheim**. Every source below was checked directly (endpoint, licence
page, current legal text) rather than assumed from general knowledge — flagged inline where a city-
specific endpoint still needs a direct confirmation call before you build against it.

**Headline finding:** Norway sits structurally *ahead* of both France and Germany on every axis
that matters for this engine, for one underlying reason — **Norway digitised its planning data
model, not just its map data, and made that model a legal requirement by national regulation in
2009**, not a voluntary standard adopted at whatever pace each municipality chooses (Germany's
XPlanung problem) or a two-commune pilot (France's SRU problem). The zone-taxonomy problem France
and Germany both have — "does this zone code mean the same thing next door" — barely exists in
Norway, because **hensynssone codes, plan-type codes, and the density-calculation method are all
defined in one national SOSI object catalogue**, used by all ~357 kommuner. What is *not* solved
nationally is the actual numeric value for a given zone (height, %-BYA) — that remains per-kommune,
per-plan, exactly as in Germany and France — and full per-parcel programmatic query still resolves
through **357 separate municipal delivery points**, not one national API, which is Norway's version
of Germany's per-Land fragmentation problem, just one administrative layer further down.

**Status:** research + scoping. No rule pack is implemented by this document.

---

## PART A — THE NATIONAL COMMON BASELINE

### A.1 Parcels and cadastre — Matrikkelen

**National baseline:** **Matrikkelen** is Norway's one official register of real property
(parcels, buildings, addresses), run by **Kartverket** (the national mapping authority) under the
**matrikkellova** (in force since 1.1.2010). Unlike Germany (16 Länder each operate their own ALKIS
instance) or France (IGN's PCI is one national feed but distinct from the ownership register),
Norway has **one system, one operator, nationwide**, for both geometry and the legal register
behind it.

**Access, in practice — a real two-tier split, not a simple "open/closed":**

| Layer | Content | Access | Cost |
|---|---|---|---|
| **Matrikkelen – Eiendomskart Teig** (parcel polygons) | parcel boundary geometry, GML, daily-updated extract | WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` | **Free, no login, open data** — confirmed live 2026-07-24 |
| **Matrikkelen – Bygningspunkt** (building points) | one point per building, linked to matrikkel building number | free download/WFS via Geonorge, no login | **Free, no login, open data** |
| **Matrikkelen full API** (ownership, unit numbers, full attribute set) | complete register incl. `grunnbok` links | `matrikkel.no`/`nd.matrikkel.no` API, requires a signed agreement with Kartverket | Free-of-charge in principle; requires an interface/agreement — not a self-serve download |

Access to the raw parcel geometry is genuinely open — this already clears the France/Germany
"which Land/EPCI licence applies" problem entirely for the geometry layer. The full ownership/
attribute API is free-of-charge but not self-serve: it needs a signed access agreement.

### A.2 Zoning/plan identification — the single biggest structural advantage over France and Germany

**National baseline:** since **forskrift av 26. juni 2009 nr. 861** ("Forskrift om kart, stedfestet
informasjon, arealformål og kommunalt planregister"), every kommune's **kommuneplan** (both the
overview-level *arealdel* and detailed *kommunedelplan*) and every **reguleringsplan** must be
produced according to **"Nasjonal produktspesifikasjon for arealplan og digitalt planregister"** — a
SOSI-based national object catalogue (SOSI Plan) that defines, nationwide:

- the plan-type code list (kommuneplan, kommunedelplan, reguleringsplan, områderegulering,
  detaljregulering, bebyggelsesplan, etc.),
- the **hensynssone** code list (e.g. `H570` = bevaring av kulturmiljø, under pbl. § 11-8 third
  ledd) — **these codes are national, not per-commune mnemonics.** This is a direct structural
  improvement over France's `UA`/`UB` (locally scoped, no shared meaning) and closer to Germany's
  BauNVO zone-type list, except Norway's version also covers overlay/hensynssone codes, which
  BauNVO does not,
- the arealformål (land-use purpose) code list applied inside a plan area,
- planstatus and plan-relationship codes (overstyrer/overstyres av, erstatter/blir erstattet av),
  which make plan supersession machine-resolvable rather than a manual PDF-reading exercise.

**What this buys you, concretely:** a `hensynssone=H570` or `arealformål=1110` (boligbebyggelse)
read off any kommune's plan data means the same thing everywhere in Norway, the same way `WA` does
in Germany's BauNVO — a one-time national lookup table, not a per-plan research task.

**§A.2.D Deviations — where it stops being national:** the **data holding and delivery** is still
per-kommune. There is no single confirmed national WFS that lets you query "which reguleringsplan
covers this parcel, with its full bestemmelser text" across all 357 kommuner in one call. In
practice:
- **Kartverket's SePlan** viewer surfaces plans that are out for public hearing, nationally, but is
  a viewer, not confirmed as a queryable per-parcel API for *adopted* plans.
- **Geonorge's "Plan2" catalogue page** aggregates kommunal og statlig plandata at the *catalogue*
  level — each kommune's own WFS/planregister is still the actual data source.
- Individual kommuner publish their own planregister WFS under the shared SOSI Plan schema — e.g.
  **Trondheim's "Planregister Trondheim kommune"** is confirmed open data, "no conditions apply to
  access and use," continuously updated, contact `kart.postmottak@trondheim.kommune.no`. Because
  the schema is shared, once you've built one kommune's WFS ingestion, the next kommune's feed
  parses against the *same* object model — the genuine Norway advantage: the integration work is
  schema-reusable even though the endpoint is not centralised.

### A.3 Density and floor-area metrics — "grad av utnytting": national method, local values

**National baseline:** unlike France (COS abolished, no FAR concept survives at all) and closer to
Germany's §17/§20 BauNVO convergence, Norway has a **genuinely national, currently-in-force
calculation methodology** set out in the **veileder H-2300 B "Grad av utnytting – Beregnings- og
måleregler"** and anchored in **TEK17 §§ 5-1 to 5-7** and **Norsk Standard NS 3940**:

| Method | Defined in | What it measures |
|---|---|---|
| **BYA** (bebygd areal) | TEK17 § 5-2, H-2300 | absolute building footprint area, m² |
| **%-BYA** | TEK17 § 5-3 | footprint as % of net tomt (parcel) area — most used for småhus/rekkehus |
| **BRA** (bruksareal) | TEK17 § 5-4 | total usable floor area, all storeys summed |
| **%-BRA** | TEK17 § 5-5 | BRA as % of tomt area — most used for apartment/commercial buildings, and **mandatory for kjøpesentre/forretninger** |
| **m²-BRA per tomt** | plan-specific | absolute cap in m², common for large single parcels/felt in detaljregulering |
| **MUA** (minste uteoppholdsareal) | TEK17 § 5-6 | minimum outdoor amenity area |
| Parking area | TEK17 § 5-7 | whether/how parking counts toward BYA/BRA |

**What is not national: the actual number** (e.g. `%-BYA = 24`) — that is set per plan, per zone.

**§A.3.D Deviation worth flagging — historic calculation-method switching, Oslo-documented:** a
parcel's grad av utnytting must be computed using the **calculation rules in force when its
governing plan was adopted**, not today's H-2300 rules — Oslo's own planning authority explicitly
tells applicants to identify which regime applies (pre-/post-1 July 1987 boundary is one break
point they name) and to consult the historical-methods appendix in the current veileder. The
current H-2300 B veileder itself **ships the historical rulebook as an appendix**, rather than
leaving it to a separate legacy-plan-reading exercise.

### A.4 Height — partly national by default, otherwise plan-specific

**National baseline — and a genuine structural advantage over Germany's §34:** **plan- og
bygningsloven § 29-4** sets a real, numeric, nationwide **default** governing height and
neighbour-distance wherever no plan overrides it:
- buildings with **gesimshøyde (eave height) over 8 m or mønehøyde (ridge height) over 9 m require
  an adopted plan** — they cannot be approved on the strength of § 29-4 alone,
- absent a different plan-set distance, the default neighbour-boundary setback is **the greater of
  half the building's height or 4 metres** (§ 29-4 second ledd),
- height for this purpose is measured as the **average eave height relative to the average level of
  graded/adjusted terrain along the whole façade** (clarified in Rundskriv H-8/15 and cross-
  referenced to the Grad av utnytting veileder) — a stated, citable measurement rule.

**This is the direct Norwegian analogue of Germany's §34 — except unlike §34, Norway's default has
actual numbers you can hard-code as a ceiling-and-setback rule.** Treat § 29-4 as your "no
reguleringsplan" fallback pack: it is genuinely shippable at `published` confidence.

**§A.4.D Deviations:** where a reguleringsplan or kommuneplan *does* set a height (via
mønehøyde/gesimshøyde/kotehøyde bestemmelser, or an absolute NN2000-referenced elevation cap), that
figure governs instead of § 29-4 and must be read per plan, per zone — exactly as in Germany/France.
Height expressed as an absolute elevation (kotehøyde) rather than a relative metre value is common
enough in Norwegian reguleringsplaner to budget for both representations.

### A.5 Buildings, height, and LOD — most complete national coverage of the three countries studied

**National baseline:** **Nasjonal detaljert høydemodell (NDH)** — laser-scanned **~230,000 km²** of
Norway at a minimum of 2 points/m² (2016–2022). **This project is complete — not "80% by 2025,
full by 2026" as in France, and not licence-gated as in Germany's cross-Land LoD2-DE product.** All
data is free, published via **`høydedata.no`**, with WMS/WFS/WCS APIs indexed on Geonorge, no
purchase decision anywhere in the pipeline.

**Building footprints:** **FKB-Bygning** — 2.5D building model (footprint + top-height value per
building/roof element), linked 1:1 to the matrikkel building number.

**§A.5.D Deviation — a genuine licence gate, structurally like Germany's ZSHH restriction:**
FKB-Bygning is **free only for "Norge digitalt" parties** (public bodies and Geovekst cooperation
agreement holders); **private/commercial actors must purchase access through a reseller** (e.g.
Geodata, Norkart) or via Kartverket directly. The lighter **Matrikkelen – Bygningspunkt** dataset
(a single point per building, no footprint) *is* fully open — useful for building presence/location,
not for a footprint-dependent massing engine. **Budget a licence/reseller step for FKB-Bygning
specifically.**

### A.6 Heritage and protective overlays — national single register, with a professional/public split

**National baseline:** **Askeladden**, run by **Riksantikvaren**, is the one official database of
all protected heritage sites and cultural environments in Norway — over 300,000 localities. **This is
a genuine single national register**, unlike Germany (per-Land Denkmalschutzgesetz, no federal
register) and France (ABF perimeters + PSMV, structurally invisible to the base zoning layer).

**§A.6.D Deviations — the practical access split:**
- **Askeladden itself requires a professional login** — not open to a general engine.
- The public-facing mirror, **Kulturminnesøk.no**, exposes roughly 220,000 of those objects with
  map geometry, free, no login — this is the actual integration point, with the caveat that
  Riksantikvaren warns many objects were geolocated decades ago and **should not be used as the
  basis for detailed planning** without a cross-check.
- **SEFRAK** (~515,000 pre-1900 buildings, nationwide survey 1975–1995) is a *separate* register,
  not merged into Askeladden, but exposed through Riksantikvaren's own WMS/WFS map services.
- **Local overlay layer, found at both Oslo and Bergen:** each city separately maintains a "**Gul
  liste**" (Yellow List, Oslo) / municipal-level verneverdig-building list, layered on top of the
  national hensynssone `H570` mechanism in that city's own kommuneplan/reguleringsplan. This is the
  Norwegian analogue of Berlin's Erhaltungsverordnung — a city-specific overlay riding on top of an
  otherwise-national mechanism, and needs separate per-city sourcing even though the hosting
  mechanism (hensynssone) is national.

---

## PART B — DEEP-DIVE RESOURCE STUDY PER MUNICIPALITY

### B.1 Oslo

**What's needed:**
- Oslo's own **Planinnsyn** (`https://od2.pbe.oslo.kommune.no/kart/`), run by **Plan- og
  bygningsetaten (PBE)**, is a click-in-map viewer that resolves, per point/parcel: gårds-/
  bruksnummer, all overlapping kommuneplan/kommunedelplan/reguleringsplan/områderegulering layers,
  and — on a further click — the actual **reguleringsbestemmelser** text for that plan. Areas-
  egulering and reguleringsplan layers are stated to update **nightly**.
- Oslo separately publishes a per-parcel **"Grad av utnytting" faktaark**
  (`od2.pbe.oslo.kommune.no/pages/faktaark/...`) that already resolves which historical calculation
  method applies (pre-/post-1 July 1987 boundary explicitly named) — this does real engineering
  work for you that Berlin's Baunutzungsplan case does not have an equivalent for.
- Heritage: Oslo's own **hensynssone H570** areas plus the municipal **Gul liste** — both need
  separate sourcing from the national Askeladden/Kulturminnesøk layer.
- Kart/geodata ordering: PBE runs a priced ordering service for certain derived products with a
  **new price list from 1 January 2026** — the interactive viewer and base plan lookup appear open,
  but *certified* derived documents are a paid product line.

**§B.1 Unverified / open — the next concrete checks:**

| Item | Why not verified | What would verify it |
|---|---|---|
| Machine-readable WFS/API behind Planinnsyn (vs. human click-viewer only) | Confirmed as an interactive map tool; not confirmed whether the underlying reguleringsplan geometry + bestemmelser text is exposed as a standalone WFS for programmatic per-parcel query | Check `data.oslo.kommune.no` / Oslo's open-data catalogue for a published planregister WFS matching the national SOSI Plan schema, the way Trondheim's is confirmed |
| Full list of which faktaark/derived products are free vs. priced under the Jan-2026 price list | Only the "Grad av utnytting" faktaark and the interactive kart were directly confirmed as accessible | PBE's own current gebyrforskrift/price list document |

**Estimate:** likely the **richest single-city tooling** of the three (dedicated grad-av-utnytting
resolution, nightly-updated plan layers), but the cheapest *engine* integration only if a genuine
WFS exists behind Planinnsyn — confirm before budgeting.

### B.2 Bergen

**What's needed:**
- Bergen's own heritage guidance page confirms the same national mechanism as Oslo: listing in
  Askeladden/Kulturminnesøk, plus the kommuneplan's own **hensynssone H570** as the operative local
  trigger — the national+local overlay pattern recurs identically to Oslo's.
- Bergen's own reguleringsplan/planinnsyn delivery point was **not directly confirmed in this
  pass** — this is the single highest-value next search for Bergen specifically.

**§B.2 Unverified / open:**

| Item | Why not verified | What would verify it |
|---|---|---|
| Bergen's own planregister WFS/API endpoint | Not directly located in this pass | Search Bergen kommune's open-data portal (`bergen.kommune.no` / Geonorge kartkatalog) |
| Bergen-specific heritage list equivalent to Oslo's Gul liste | Referenced generically; data format/access not confirmed | Bergen kommune's byantikvar office, or the guidance page's linked sources |

**Estimate:** structurally identical cost profile to Oslo/Trondheim once WFS endpoint is confirmed.
Norway's shared SOSI Plan schema means Bergen's ingestion code should be near-identical to
Trondheim's — **cheap once confirmed, not yet confirmed.**

### B.3 Trondheim

**What's needed:**
- **Confirmed, open, and the cleanest of the three studied:** "**Planregister Trondheim kommune**"
  is listed in the Geonorge kartkatalog as open data — "No conditions apply to access and use,"
  security level ugradert, continuously updated, contact `kart.postmottak@trondheim.kommune.no`.
- No city-specific mechanism deviation identified in this pass (no Baunutzungsplan-style legacy
  layer, no Marseille-style graphic-primacy rule) — Trondheim appears to be a straightforward
  application of the national model.

**Estimate:** **likely the cheapest of the three to integrate end-to-end**, precisely because its
planregister is confirmed open, confirmed machine-accessible, and requires no special-case
resolution logic beyond the shared national schema — the Norwegian analogue of Hamburg's role in
the Germany study.

### B.4 Cross-city comparison — the actual finding

| | Oslo | Bergen | Trondheim |
|---|---|---|---|
| Plan data delivery confirmed open/machine-readable | Interactive viewer confirmed; standalone WFS not yet confirmed | Not yet located | **Confirmed** — open planregister, no restrictions |
| City-specific overlay beyond national hensynssone | Gul liste (heritage) | Equivalent heritage list referenced, format unconfirmed | None identified |
| Distinctive local tooling | Per-parcel "Grad av utnytting" faktaark (handles historical-method switching) | — | — |
| Rough integration cost, once WFS confirmed | Low–moderate (richest tooling) | Low (pending confirmation) | **Lowest confirmed** |

**The finding that should drive sequencing:** unlike France (three genuinely different height
mechanisms) or Germany (Berlin's four-regime stack), **all three Norwegian cities studied appear to
be configurations of the same national mechanism**, not different software problems. The engineering
risk in Norway is not "will this city need a new rule kind" (very likely no, given § 29-4 and the
shared SOSI Plan schema) but **"which kommuner have actually published their planregister as a live
WFS versus only a human-facing map viewer or PDF"** — a coverage-measurement problem, not a
legal-regime existence problem.

---

## PART C — WHAT THIS MEANS FOR SCALE, AND THE HONEST PROJECT SHAPE

**~357 kommuner is a smaller number than either France's ~34,900 communes or a naive per-Land count
for Germany, and Norway's zone/hensynssone taxonomy is genuinely national — the strongest structural
position of the three countries studied.** Two things temper that:

1. **Data holding remains per-kommune.** Even with one shared schema, "Norway" is still ~357
   separate WFS endpoints to actually integrate — cheaper per-endpoint than Germany's per-Land
   licence questions (schema is identical everywhere, no re-learning), but still not a single API call.
2. **FKB-Bygning's licence gate is real and easy to miss**, since so much of the rest of Norway's
   open-data posture is genuinely free — budget a Norge digitalt agreement or a reseller purchase
   for building footprints specifically.

**Recommended framing, mirroring the France/Germany tiering:**

- **Tier 1 — confirmed open planregister WFS on the shared national schema:** Trondheim is the
  clearest example found in this pass; a scan of other Norwegian kommuners' Geonorge kartkatalog
  entries for "Planregister <kommune> kommune" would likely surface several more cheaply.
- **Tier 2 — rich human-facing tooling, WFS status to be confirmed:** Oslo (Planinnsyn + grad-av-
  utnytting faktaark) is very likely Tier 1 once its WFS status is confirmed.
- **Tier 3 — mechanism assumed shared, endpoint not yet located:** Bergen, and by extension most
  Norwegian cities not yet individually checked — treat as "probably Trondheim-shaped," but confirm
  before budgeting.

**Single highest-value next research task:** run the same "does kommune X publish an open WFS
planregister" check used for Trondheim across a sample of Norway's larger kommuner (Bergen,
Stavanger, Kristiansand, Tromsø) — this converts "which Norwegian city is cheapest" from a
reasonable assumption into a measured fact.

---

**Cross-refs:** `FRANCE-MASTER-IMPLEMENTATION-STUDY.md`, `GERMANY-MASTER-DATA-SOURCE-STUDY.md`
(parallel studies, same method). Key legal sources: matrikkellova, Forskrift 26.06.2009 nr. 861,
plan- og bygningsloven §§ 5-1, 11-8, 11-9, 12-6, 12-7, 29-4, TEK17 §§ 5-1–5-7, H-2300 B /
T-1459 / T-1530, Rundskriv H-8/15, NDH / høydedata.no, FKB-Bygning, Askeladden /
Kulturminnesøk / SEFRAK.
