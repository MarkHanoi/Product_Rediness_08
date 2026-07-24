# SWEDEN — Master Data-Source Study

> **Stamp:** 2026-07-24 · **Status:** RESEARCH COMPLETE — structural characterisation; no live
> probes executed.
> **Governance posture:** research/reference doc — NOT a `*-AUDIT.md` contract derivative. References
> the playbook and C-contracts; authors none.
> **Comparison benchmark:** Italy (~8–10%), France (~22%), Germany (~28%), Denmark (87% byzone).

---

## PART A — THE STRUCTURAL BASELINE

### A.1 Legal framework — one national law, not 21 regional ones

Sweden's entire planning system runs under a **single national statute**, the **Plan- och bygglagen
(2010:900)** ("PBL"), applied uniformly across all **290 kommuner**. Municipalities hold
**planmonopol** (planning monopoly) — they decide their own *detaljplaner* (detailed development
plans) — but they do so entirely within one national legal framework, not 21 independently-drafted
regional instruments (as Italy's *governo del territorio* works). There is no "which regional law
applies here" question at all.

This alone puts Sweden in a structurally different category than Italy: PBL is what the German
BauGB/BauNVO and the French Code de l'urbanisme each aspire to be as a national framework, but
Sweden achieves it with one instrument that is both the plan-making law AND the source of the
national digital-format mandate.

The national planning regulation completing PBL is the **Plan- och byggförordningen (2011:338)**
(PBF). Boverket (the national board of housing, building and planning) issues detailed rules via
*Boverkets föreskrifter* (BFS series) — the most relevant being **BFS 2020:5**, which mandated
digital detaljplan format from 1 January 2022.

### A.2 Parcels / cadastre — single national authority, mostly free

**Lantmäteriet** is Sweden's sole national land-survey authority — no regional or provincial
exceptions (no Trento/Bolzano-style carve-out). Lantmäteriet provides vector-tile cadastral boundary
data, address registers, and building registers as INSPIRE-compliant open geodata, free of charge
and free to publish, licensed under CC0.

**Two active caveats:**

1. **"High-value dataset" account gate.** Not everything is unconditionally open. Datasets containing
   personal data — the "high value datasets" mandated free under the EU Open Data Directive — require
   users to create an account, state their intended use, and select a geographic scope before access
   is granted. This is a lighter-touch version of the gate seen elsewhere; not a commercial or
   legal barrier, but a registration step.

2. **"Akt" (deed/instrument) digital-access closure.** Lantmäteriet's digital services for
   accessing deed/instrument (*akt*) information remain closed following the authority's detailed
   analysis of a government inquiry into its information security. This is a **live, dated
   restriction** — worth a direct status check before assuming full cadastral-document access.
   Effect: the governing-document link for a detaljplan (the equivalent of the signed German Satzung)
   cannot be retrieved via Lantmäteriet's akt service until the restriction is lifted.

**Native CRS:** SWEREF99TM (EPSG:3006) — Sweden's national metric projection.

---

## PART B — ZONING: THE PART THAT SETS SWEDEN APART FROM EVERY COUNTRY STUDIED SO FAR

This is the structural finding that matters most. Unlike Italy (no national standard), Germany
(standard exists; coverage/currency uneven; fill rates near-zero even in compliant municipalities),
or France (GPU WFS; PDF-only rules), Sweden has **a mandatory, government-mandated, actively-used
national digital zoning standard** that is substantially adopted — with one critical caveat that
determines whether the coverage is Denmark-class or Germany-class.

### B.1 The legal mandate

Since **1 January 2022**, all new *detaljplaner* must be created in digital form, following a
national specification, and municipalities are legally required to make their digital detaljplaner
accessible. This obligation was created by amendments to PBL together with **Boverket's regulations
BFS 2020:5** on detaljplan format. The government tasked Lantmäteriet with developing the national
specification needed to satisfy INSPIRE-directive obligations under Sweden's
geographic-environmental-information law.

This mandate structure is legally firmer than Germany's XPlanung/IT-Planungsrat mandate in one
respect: it is embedded in PBL itself (primary statute), not solely in an inter-governmental IT
coordination decision. It also covers the *accessibility* obligation, not just the format — meaning
municipalities must make their digital plans available, not merely create them in the right format.

### B.2 The delivery platform — Nationella geodataplattformen (NGP)

Lantmäteriet operates and coordinates the **NGP**, the single national access point where
municipalities publish standardised detaljplan data, queryable via API.

As of the most recent data found (April 2025 conference presentation, confirmed growing into 2026):
- **284** of Sweden's **290** municipalities had signed producer agreements, alongside 8 government
  agencies, with **1,115 total registered consumers** (municipalities, agencies, companies, and
  private individuals).
- **236 municipalities (≈81%)** were actively delivering digital detaljplan data — the highest
  municipal-participation rate of any jurisdiction studied for a live mandatory standard.
- **Recent confirmation:** Vadstena became the first municipality in Östergötland to publish
  *detaljplaner* via NGP as of **2026-02-18**, confirming the rollout is still actively expanding
  into 2026, not a stalled 2022 initiative.

**Comparison to Germany's XPlanung:** Germany's mandate (IT-Planungsrat, Feb 2023) requires
compliance but only at Stufe 1 (boundary + basic metadata, raster/PDF for content). Sweden's
Planbestämmelsekatalog requirement — see §B.3 — goes further: it mandates structured provision
codes, not just georeferenced boundaries.

### B.3 The standardised rule vocabulary — Planbestämmelsekatalog

Underneath NGP sits Boverket's **Planbestämmelsekatalog** (Plan Provisions Catalog):
- **~3,700 standardised provision codes**, each carrying a unique code since 2015.
- Each provision links directly to Boverket's detaljplan regulations — machine-readable by design.
- Available as open data in three formats: **XML via API, JSON via API, and Excel**.
- This is the *semantic* layer, not just geometry — meaning Sweden has a structured, standardised
  answer to "what does this provision code mean" for the vast majority of modern plan content.

**Comparison:** Italy has no national equivalent. Germany's BauNVO is a fixed taxonomy (zone types
+ §17 ceilings) but not a provision-code vocabulary — specific B-Plan rules live in Textliche
Festsetzungen (PDF prose), not in structured codes. Sweden's Planbestämmelsekatalog is closer to a
machine-readable national code table for plan content, not just zone classification.

**Important caveat:** the ~3,700 codes exist and are open; what is unknown is what fraction of
real NGP-delivered detaljplaner actually use structured provision codes versus fall back to free-text
provisions. This needs a live sample of NGP features to determine.

### B.4 The critical caveat — the single most important number in this whole study

**None of this retroactively applies to plans adopted before 1 January 2022.**

There is currently **no requirement to digitise existing detaljplaner** — the analog plan remains
the legally authoritative original document. Plans begun before 2022-01-01 do not need to be made
digitally available and may therefore be entirely absent from the NGP dataset, even in the 236
municipalities actively participating.

Sweden has had a modern detaljplan system since PBL's 1987 predecessor (and legally-continuing
older instruments — *byggnadsplan*, *stadsplan*, *avstyckningsplan* — going back further still, per
PBL's transitional provisions). The **majority of currently-operative zoning by land area is very
likely still pre-2022, undigitised, and absent from NGP**, even in the 236 active municipalities.

**The key distinction:**
- **81% municipal participation** = a coverage-of-*process* metric (municipalities delivering new plans)
- **Unknown % of land area** = a coverage-of-*plans* metric (parcels that actually return an NGP hit)

These are not the same number. A municipality that adopted one 2022 plan and zero since while
holding 500 pre-2022 plans still counts as "participating." Exactly like the Italy study's
"live-probe the WFS" action items: the land-area fill rate is cheap to check and is the fact the
whole estimate hinges on.

**The correct analogy to Denmark:** Denmark's WFS is fully keyless and the municipal participation
question does not arise (all plans are delivered). Sweden's question is the opposite: high access
certainty (NGP exists, API open), unknown fill. The Denmark L-609 Monte-Carlo method — area-weighted
random points in the urban zone, count hits — applies directly.

### B.5 Legal weight of retro-digitised plans

Even where municipalities retro-digitise older detaljplaner (some do this voluntarily), the
retro-digitised versions are **informational only, not certifying**. The analog original remains
legally authoritative. This is the same "informational, not certifying" caveat found throughout
Italy research, but appearing here only for the *older* stock rather than as a system-wide property.

### B.6 Comprehensive plans (översiktsplan) — also has a national API

Beyond detaljplan, Boverket runs the **ÖP-katalogen** (Comprehensive Plan Catalog), a service
supporting municipalities' work on digital *översiktsplan* (comprehensive/strategic plan), with a
published API. This is the strategic plan layer — analogous to Denmark's *kommuneplanramme* — also
nationally standardised. Coverage figures are not confirmed in this research pass.

---

## PART C — HEIGHT AND BUILDING DATA

### C.1 Terrain / surface — complete, free, national, done

Unlike Italy (still mid-rollout on national LiDAR as of 2026) or Germany's per-Land patchiness,
Sweden's national elevation dataset is **complete**: after eleven years of airborne laser scanning,
Lantmäteriet has finished a height model covering the whole of Sweden:
- **Point density:** 0.5–1 pts/m² (0.25 pts/m² in alpine areas)
- **Collection period:** 2009–2019
- **Derived products:** DTM and DSM at regular grid
- **Licence:** free download, commercial use allowed
- A newer, denser forest-focused LiDAR product has continued collection since 2018.

**This is the strongest terrain layer in any European jurisdiction studied.** Denmark's DHM is
comparable; neither Italy nor Germany nor France has a complete national LiDAR equivalent at free
commercial licence as of 2026.

### C.2 Building height / LOD2 — free national point cloud, but LOD2 is often a paid municipal product

This distinction is important:

- **Terrain/surface point cloud:** free and complete nationally — a real asset. This can be used
  for DSM-derived building heights with some processing, but it is NOT a semantically-modelled
  per-building dataset.
- **Finished, semantically-modelled building volumes (LOD2):** handled at the municipal level;
  sometimes charged.
  - **Stockholm (confirmed):** Stockholm's own city geodata portal sells 3D-LOD2 building models
    generated from laser data, priced according to the city planning department's fee schedule.
  - **Gothenburg:** noted as the first city to deliver a building record into NGP — this may signal
    that Gothenburg offers LOD2 via NGP, potentially free. Not confirmed.
  - **Malmö and other cities:** not individually checked.

This mirrors Italy's Piedmont-ARPA pattern — raw terrain is free and national, but a finished
per-building height product is a separate, municipally-controlled asset requiring per-city
confirmation.

**Sweden vs. Germany on LOD2:** Germany has LoD2-DE, a nationally coordinated product with
~58 million buildings and height as a native attribute, confirmed free in 5+ Länder (~70–80%
revised estimate). Sweden has no equivalent national product; its terrain LiDAR is actually denser
and better-qualified, but has not been processed into a national LOD2 building model. The processing
gap is the difference.

---

## PART D — HERITAGE OVERLAY

**Riksantikvarieämbetet (RAÄ)**, the national heritage authority, runs a genuine open-data programme:
its Öppna-dataportal covers:
- Ancient monuments and archaeological sites
- Culturally historic buildings
- Archaeological commissions/digs
- World Heritage sites

Available as **downloadable datasets or WMS**; direct API access for some datasets. Licence: **CC0
for at least some content.**

**The structural advance:** Starting autumn 2022, work began to bring information on ancient
monuments and national-interest cultural-heritage areas into the National Geodata Platform (NGP),
explicitly so municipalities can access and use the latest RAÄ information in the same standardised
environment as their detaljplan and building data. Where Italy has Catasto, SITAP, and municipal
NTAs as three structurally disconnected systems, Sweden is deliberately building **one integrated
platform for zoning, buildings, and heritage data.**

This is a genuine structural advantage over every country studied so far, including Italy's SITAP.

---

## PART E — READINESS ESTIMATE

| Field | Structured? | Basis | Estimated score |
|---|---|---|---|
| Parcel geometry (Lantmäteriet) | ✅ Full | National, CC0, API + bulk download | ~95% |
| Zone (post-2022 detaljplan) | ✅ Full, structured | NGP, ~236/290 municipalities live | ~81% of municipalities; **unknown % of total zoned land area** |
| Zone (pre-2022 / transitional) | ❌ Not required to be digital | Analog original authoritative; no digitisation mandate | Likely low; needs direct measurement |
| Provision meaning (numeric/rule content) | ✅ Structured | Planbestämmelsekatalog, ~3,700 codes, API (XML/JSON) | High, for provisions using standard codes; adoption rate unknown |
| Comprehensive plan (översiktsplan) | ✅ Structured | Boverket ÖP-katalogen API | Coverage not confirmed |
| Heritage overlay | ✅ Structured, improving | RAÄ open data + ongoing NGP integration | Moderate-high; some CC0/API, some WMS-only |
| Terrain/surface height | ✅ Full, free, complete | National LiDAR 2009–2019 | ~95%+ |
| Building height (LOD2) | ⚠️ Partial, often paid | Free terrain point cloud nationally; finished LOD2 models often municipal/fee-based | Needs per-city check |

**Headline estimate:** materially higher than Italy (~8–10%), and very plausibly higher than Germany
(~28%) and France (~22%) for the post-2022 plan stock. The single biggest open question is
**what fraction of Sweden's total currently-operative zoned land area (not municipalities) is
actually in NGP**. That one number would need a direct measurement before finalising a percentage.

---

## PART F — COMPARISON TO OTHER JURISDICTIONS IN THIS SERIES

| Aspect | Italy | Germany | France | Denmark | Sweden |
|---|---|---|---|---|---|
| Planning law | 21 regional laws | Federal (BauGB/BauNVO) + 16 Länder LBOs | Code de l'urbanisme (national) | Planloven (national) | PBL (national) |
| National zoning standard | ❌ None | ✅ XPlanung (Stufe 1 = boundary only; Stufe 2 = full numeric) | ❌ None (GPU WFS = boundary; rules in PDF) | ✅ Plandata.dk (structured dimensions) | ✅ NGP + Planbestämmelsekatalog (structured codes) |
| Parcel / cadastre | Regional (Catasto, varied quality) | Per-Land (ALKIS, standardised) | National (PCI, free) | National (Matriklen, open-with-key) | National (Lantmäteriet, CC0) |
| Terrain | Mid-rollout (national LiDAR 2026) | Per-Land, mostly good | Complete (IGN LiDAR HD) | Complete (DHM, 0.4 m, free-with-key) | ✅ Complete (0.5–1 pts/m², free) |
| LOD2 buildings | Partial, paid | LoD2-DE ~70–80% free | IGN LOD2, national | ✅ Danmark i 3D (national, free-with-key) | ❌ Municipal, often paid |
| Heritage | SITAP (national, siloed) | Per-Land (no national register) | Mérimée/Palissy (national WMS) | GeoDanmark / CPR (national) | RAÄ + NGP integration (✅ improving) |
| Key blocker | Fragmentation | XPlanung Stufe 1 / §34 / GRZ not always populated | PDF-only rules | Pre-2022 plans (none — law is new) | Pre-2022 plans (majority of land area) |

---

## PART G — ACTION ITEMS (ordered by information value per hour)

1. **Live-probe the NGP WFS endpoint** for one or two mid-size participating municipalities
   (Gothenburg recommended). Measure what fraction of their total mapped urban-zone area returns an
   NGP hit. This is the single highest-value unknown — the Sweden equivalent of the Italy study's
   "live-probe the WFS" action items.

2. **Fetch the Planbestämmelsekatalog API** to confirm the join key between NGP provision codes and
   the katalog, and to verify whether provision codes in a real NGP feature resolve to structured
   numeric values or to text labels.

3. **Check current status of Lantmäteriet "akt" access closure** — if still in effect, this is a
   live, dated caveat worth carrying forward exactly as noted.

4. **Confirm LOD2 status for Gothenburg and Malmö** — Gothenburg was the first city to deliver a
   building record to NGP, suggesting it may offer LOD2 free or via the NGP platform. One portal
   check converts this from "noted" to "measured."

5. **Sample the ÖP-katalogen API** for a municipality that has also delivered a detaljplan to NGP
   — to understand whether the comprehensive-plan layer fills meaningful numeric gaps when the
   detaljplan is silent.
