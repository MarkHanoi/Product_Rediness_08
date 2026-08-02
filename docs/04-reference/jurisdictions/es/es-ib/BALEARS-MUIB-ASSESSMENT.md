# ILLES BALEARS (MUIB) — ASSESSMENT

**Status**: ⭐ **MEASURED 2026-08-02. Q1–Q3 RUN, BY CENSUS.**
**Scored under**: [R/P REGIONAL SCORING](../../../standards/R-P-REGIONAL-SCORING.md) —
⭐ **`R` = `proven` · `P` = `proven` BUT PARTIAL.**

> ⭐ **THE HEADLINE, and every number is a census not a sample:** `R` resolves uniquely on **97.1 %**
> of all **2,210** GESTIO features; zoning is a **partition reconciling within 1 ppm on 62 of 67**
> municipalities. `P` is **proven but partial** — **height 81.7 % · occupation 56.7 % · FAR 48.3 % ·
> ALL THREE TOGETHER 36.7 %** on the buildable denominator.
>
> ⛔ **AND THE CEILING THAT OUTRANKS ALL OF IT: 67 OF 67 MUNICIPALITIES CARRY THE PTI-ABROGATION FLAG
> ON RUSTIC — 94.53 % OF THE LAND.** So the 97.1 % unique-resolution rate is a rate for **MUNICIPAL
> routing only.** The hierarchical PTI supersession is **INVISIBLE IN GESTIO** and **can only
> over-grant.**
>
> ⛔ **"BALEARS IS ENVELOPE-CAPABLE" REMAINS UNWRITTEN, AND THE AGENT THAT MEASURED IT REFUSED TO
> WRITE IT.**

### ⭐ The URL is the OPPOSITE of València — the trap did not fire

`QUALIFICACIONS.URL`: **100 % coverage AND 5,273 DISTINCT** values across 46,607 rows.
`GESTIO.URL`: **1,951 distinct / 2,210**. Per-feature `normativa.jsp?identitat=NNN` — **real
documents, not register homepages.** *(València's `UrlLink` was 99 % coverage / 20 distinct.)*

⭐ **AND THE URL RETURNS A STRUCTURED FITXA, NOT A PDF.** Manacor `RE-NA` yielded
**PM 200 m² · NP 3 plantes · O 80 % · E 2.4**, citing **Article 66** and **Article 56.3.j**.

⚠ **BUT ARTICLE CITATION IS RARE — 3 of 60 buildable fitxes.** The numbers usually arrive **without a
governing-article reference**, which is exactly the counsel-Q2 exposure.

### ⛔ CORRECTION — `CODIAJ` IS NOT A MUNICIPALITY CODE

It is the **municipal ZONE label** — 706 distinct in Palma alone. **The municipality key is
`CODIMUNI`**, and ⭐ **it is INE-5 WITH THE `07` PREFIX STRIPPED**: `'07040'` returns **0 on a clean
HTTP 200**; `'040'` returns **9,442**.

⇒ ⭐ **SECOND CCAA, DIFFERENT FIELD NAME, SAME CODE SPACE** (after Madrid's `CD_MUNICIPIO`).
**Province-stripped municipality codes are a PATTERN, not a Madrid quirk.**

### Populated is not present — three instances

- ⛔ **`DFIVIGEN` IS A NULL SUBSTITUTE** — **100 % non-null, ONE distinct value `99999999`.** **Zero
  validity information.** It was previously listed here as a validity field; it is not one.
- **`CLASSIFICACIO.DINIVIGEN` is contaminated** — a DATE field holding **OBS prose**; **0/916** carry
  any end date.
- Backend **rejects `TRIM()` / `LEN()` with an Esri 400 INSIDE HTTP 200**; `CHAR_LENGTH()` works.

### ⭐ Two probe defects caught BEFORE publication

1. ⛔ **The assumed parameter codes were WRONG *and collided with USE-CLASS codes*.** Height is
   **`HR`/`HT`, not `AR`/`AT` — `AT` is *Allotjament turístic*, a USE.** Setbacks are **"Reculada"
   (`RA`/`RF`/`RM`), not "Retranqueig" — `RL` is *Religiós*, a USE.** ⭐ **The retracted run reported
   metric height as 0/80 ABSENT; it is 49/80.** Dictionary now derived FROM THE DATA.
2. The filter-integrity check compared **counts** and raised a false alarm; corrected to compare
   feature **sets**.

### What the dispatched national findings did here

- ⭐ **The `CQL_FILTER` silent-ignore DOES NOT TRANSFER** — evidenced, not argued. All 4 layers pass
  all 4 conditions: **5 impossible codes → 0 features**, and per-municipality counts **SUM EXACTLY**
  to the unfiltered total. *(So the defect is MapServer-specific; blanket distrust would be as wrong
  as blanket trust.)*
- **Paging was never a blocker** — pages disjoint, `exceededTransferLimit=false` against a
  `maxRecordCount` of **60,000**.

### Validity and blockers

- **3 of 67 self-declare NOT-CURRENT** — Palma, Andratx, Eivissa. ⚠ **Palma alone is 9,442 of 46,607
  zoning polygons.** **7 of 67 have zero GESTIO polygons.**
- **GESTIO is an OVERLAY, not a territory-wide router** — 300.7 km² = **6.03 %** of classified land.
- The residual **2.9 %** non-unique is **a base plan plus its own modification**
  (`MD_UE6_PERI_CANMALLOL_2015` over `REV_PGOU_1998`) — **document-to-document supersession inside one
  corpus, the class PRYZM ALREADY HANDLES.**
- ⚠ **Zero coded-value domains on any layer.** The advertised *"single dictionary of urban concepts"*
  is **NOT in the service metadata** — it is real, but it lives in the fitxa.
- ⛔ **`blocked`: parcel-anchored Q2.** Named cause — Catastro INSPIRE WFS per-bbox latency against
  uniform draws over land that is **94.53 % rustic/sea**, so the reject rate dominated. Script
  committed, re-runnable at `seed=20260802`, needs a land-mask pre-filter. ⭐ **What ONLY it can
  measure: HOW OFTEN A REAL PARCEL STRADDLES TWO ZONES.** Both census methods measure MUIB's
  INTERNAL CONSISTENCY and cannot see that.
- ⚠ **PTI adaptation is NOT published per municipality.** MUIB asserts blanket non-adaptation for
  rustic, so *"N of 67 unadapted"* is answerable only as **67 of 67 flagged on rustic**. The agent
  **could not distinguish per-municipality adaptation and did not choose.**
**Related**: [REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

> ⛔ **DO NOT WRITE "BALEARS IS ENVELOPE-CAPABLE."** The prohibition STANDS, but as of 2026-08-02
> **THE REASON HAS CHANGED, and the new reason is the stronger one.**
>
> **It WAS:** four external passes converged on that phrasing and **none ran a query** — *convergence
> is not corroboration when every pass read the same documentation.*
>
> **It IS NOW:** `R` **has** been verified by census (97.1 %), and the phrase is still wrong — because
> ⛔ **THE PTI CEILING IS UNMEASURED AND CAN ONLY OVER-GRANT.** 67 of 67 municipalities carry the
> abrogation flag on rustic, covering **94.53 % of the land**, and that override is **invisible in
> GESTIO**. ⭐ **A VERIFIED ROUTING RATE IS NOT A PUBLICATION LICENCE.**

---

## ✅ MEASURED

- ⚠ ~~`CODIAJ` + per-feature normativa URL, rated L2–3~~ — ⛔ **SUPERSEDED. `CODIAJ` IS NOT A
  MUNICIPALITY CODE** (it is the municipal ZONE label; the key is `CODIMUNI`, province-prefix
  stripped) **and the rating is now `R` = `proven` / `P` = `proven`-but-partial by census.** See the
  measured header above. *Left visible rather than deleted, because the wrong key was load-bearing in
  an earlier plan.*
- ⭐ **THE REFERENCE CASE FOR CURRENCY.** Eivissa's `QUALIFICACIONS` rows carry `OBS`:
  > *"Del municipi d'Eivissa el MUIB NO mostra l'actual normativa vigent. Consultau la informació
  > proporcionada per l'Ajuntament."*

  **Vector present, explicitly NOT IN FORCE.** ⭐ **One publisher of seventeen exposes a validity flag
  at all** — which is why *absence of a flag is never evidence of currency.*

## 📖 DOCUMENTED — official, but **nothing fetched**

**Endpoint:** `ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer` — **ArcGIS REST,
public, keyless.**

⭐ **A four-layer model that maps onto the legal decision chain:**

| Layer | Role |
|---|---|
| **Àmbit** | instrument extent — ⚠ *may be discontinuous* |
| **Classificació** | three soil classes |
| **Qualificació** | zoning to minimum level |
| ⭐ **Gestió** | *unitats d'actuació* through to **the delimitation polygons of plans parcials and plans especials** |

> ⭐ **THAT MANAGEMENT LAYER IS CATALUNYA'S `PD*` PUBLISHED AS GEOMETRY.** **Catalunya reconstructed
> it. Madrid cannot.** **If it resolves uniquely, `R` is solved BY THE PUBLISHER.**

**Stated ontology:** MUIB involves systematisation and harmonisation, ⭐ **a wide parameter database
with a SINGLE DICTIONARY OF URBAN CONCEPTS**, georeferencing, digitisation, and *fitxes urbanístiques*.

⚠ **That is exactly what València's grammar hypothesis must PROVE — asserted here as the DESIGN.**
Design intent is `DOCUMENTED`, never `MEASURED`.

⚠ **Disclaimer:** *"El MUIB TÉ NOMÉS CARÀCTER INFORMATIU"* — **SIXTH REGION.** (Madrid ×2, CyL,
Balears, Aragón, València.) ⛔ **One counsel question, not six.**

---

## ⛔ THE WARNING NOT IN OUR CORPUS — a failure class PRYZM DOES NOT MODEL

> The cartography fuses municipal and territorial planning categories, but **the related attributes
> may not take into account the determinations of territorial planning — especially the ISLAND
> TERRITORIAL PLANS — so attribute information for NON-ADAPTED municipalities may be PARTIALLY OR
> TOTALLY ABROGATED.**

⭐ **THIS IS HIERARCHICAL SUPERSESSION: municipal PGOU under Island PTI, attributes superseded ACROSS
CORPORA.**

**PRYZM's supersession work is document→document WITHIN one corpus** — Barcelona ran
**1,755 → 773 → 147, 46 unread.** ⛔ **This is instrument-TIER → instrument-TIER. Different problem.**

**Record it as its own class**, alongside `f_fin`, `OBS`, `operacionbaja`, `fiab_geom` — ⭐ **and note
how it DIFFERS from all four: those flag a RECORD; this changes WHICH LAW APPLIES.**

⛔ **IT CAN ONLY OVER-GRANT** — the L-616 direction, reached through the instrument hierarchy.

⚠ **Consequence for `R`: it may NOT BE SINGLE-VALUED.** A parcel can route to a municipal instrument
**whose determinations an island plan has overridden.**

---

## The three queries

**Q1 · FULL SCHEMA, AND THE URL CHECK.** Layer descriptors on every `GOIB_MUIB` layer — fields, **VALID
rates (never non-null — populated is not present)**, domains.

⛔ **AND COUNT DISTINCT VALUES ON THE NORMATIVA URL.** ⚠ **València's `UrlLink` had 99 % coverage and
TWENTY distinct values** — per-CCAA register homepages, not per-feature documents, and treating it as
routing **fabricated a ~99 % tier estimate.** ⭐ **A per-feature URL with few distinct values is NOT
`R`.**

**Q2 · DOES `Gestió` RESOLVE A UNIQUE GOVERNING INSTRUMENT?** Parcels **seeded and stratified across
Mallorca, Menorca, Eivissa, Formentera.** Classify **unique · ambiguous · none**. ⭐ **The ambiguity
rate IS the `R` measurement.**

**Q3 · PTI ADAPTATION STATUS AND VALIDITY, ALL 67.** Which municipalities are **adapted to their
island territorial plan?** ⭐ **Unadapted ones carry attributes the publisher says may be abrogated —
THIS IS THE DEVIATION LIST** (intake item 8). Plus `OBS` prevalence — ⚠ **NOT `DFIVIGEN`, which was MEASURED as a NULL SUBSTITUTE (100 % non-null,
ONE distinct value `99999999`, zero information)**: **how many
self-declare not-in-force, as Eivissa does?**

**THEN, only if Q1–Q3 land — ONE ORDINANCE.** One municipality, one zone, follow the normativa URL,
and check whether **height, setbacks and occupation** are there **with an article reference.**
⭐ **That single read proves or refutes `P` — and the architecture only has to be proven once.**

---

## Method

**Zero-feature is not absence.** ⛔ **HTTP 200 IS NOT SUCCESS ON ArcGIS — a 200 can carry an Esri 400.**
Any count landing on **1000/2000/3000** is a **truncation suspect.** **Municipality attribute filter,
never bbox.** **Validate values for internal contradiction before quoting a rate.** ⛔ **UNKNOWN never
NO.** **State what you could not distinguish rather than choosing.**

## Verdict format

⛔ **In R/P terms, never a single Balears number:**

> ✅ *"`R` resolves uniquely on **X %** of sampled parcels; `P` unproven pending one ordinance read;
> **N of 67** municipalities unadapted to PTI."*

**Queue position:** ⛔ **YIELD TO A2.** Catalunya's 24 outrank this — **they are one run from the first
computed count this programme has had.**
