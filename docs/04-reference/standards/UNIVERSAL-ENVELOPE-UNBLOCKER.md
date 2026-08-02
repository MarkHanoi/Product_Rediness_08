# THE UNIVERSAL ENVELOPE UNBLOCKER — capability-driven, not region-driven

**Status**: ⭐ **NORMATIVE**, founder-authored 2026-08-02.
**Related**: [ADR-0295 capability engine](../../02-decisions/adrs/ADR-0295-the-capability-engine-five-independent-providers.md) ·
[ADR-0294 container-agnostic resolver](../../02-decisions/adrs/ADR-0294-the-zone-resolver-is-container-agnostic-and-carries-confidence.md) ·
[ADR-0293 per-dimension tiering](../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[REGIONAL-INTAKE-LIST](./REGIONAL-INTAKE-LIST.md)

> ⛔ **YOUR OBJECTIVE IS NOT TO MAKE THE ENVELOPE DRAW. It is to ELIMINATE ONE BLOCKER, or PROVE WITH
> EVIDENCE that it cannot presently be eliminated.**

**These prompts are reusable across every autonomous community because they are CAPABILITY-driven.**
They adapt whether the blocker is routing, grammar, alignment, access, publication or constraints —
**without being rewritten per region.**

---

## ⛔ FOUR BLOCKER CLASSES — never report a bare `0%`

**A bare zero collapses four different situations into one, and they have completely different owners
and costs.**

| Class | Meaning | Owner | Measured examples |
|---|---|---|---|
| **A · ENGINEERING** | ships without new research | us | **Balears** (registration diff unapplied) · **Canarias** (`TELDE_BBOX` absent) · **Catalunya** (signature + height fix) |
| **B · ACCESS** | authoritative data EXISTS, unreachable | ⭐ **founder** | **Málaga** (`ORA-28000`, locked Oracle) · **Galicia** (286/286 behind reCAPTCHA) |
| **C · PUBLICATION** | the authority publishes something INSUFFICIENT | external | **València** (89.81 % scans) · **CyL** (FAR only, 2.5 %) |
| **D · STRUCTURAL** | the ENGINE needs a new capability | us | ⭐ **AlignmentProvider** · **constraint engine** |

⭐ **CLASS D OUTRANKS ANOTHER REGIONAL PARSER.** Alignment governs **~74 % of Córdoba's rows** and is a
national dependency; constraints are absent in **every** region measured, **including the two that
ship.**

---

## The six capabilities

**parcel geometry · zoning/routing · legal grammar · alignment geometry · constraint geometry ·
currency**

Each scored **AUTHORITATIVE / INFERRED / PARTIAL / ABSENT**. ⛔ **Report the MATRIX, not a percentage —
it explains WHY a region cannot produce a complete envelope.**

---

## 1 · UNIVERSAL UNBLOCKER

For the blocked capability **only**, enumerate every authoritative source: **WFS · WMS · REST ·
downloads · documents · HIDDEN SERVICES REFERENCED BY VIEWERS · documentation · schemas · field names ·
joins · document attachments · historical services.**

⛔ **NEVER STOP AT THE FIRST "NO".**

**Deliver exactly one:** `AUTHORITATIVE SOURCE FOUND` · `ALTERNATIVE SOURCE FOUND` · `ENGINEERING FIX` ·
`ACCESS BLOCKER` · `PUBLICATION GAP` · `GENUINE ABSENCE`.
⛔ **EVERY NEGATIVE MUST CARRY THE SEARCH PERFORMED.**

## 2 · CAPABILITY RECOVERY — assume the diagnosis is wrong

Search alternative services · **unpublished-but-referenced layers** · download packages · document
annexes · viewers · hidden APIs · GeoServer workspaces · ArcGIS REST folders · INSPIRE · historical
datasets · municipal mirrors.

⭐ *Precedent: Madrid's working endpoint was recovered from a viewer's `Config.js` **after nine hosts
returned 404/DNS**. CyL's own published SIUCyL endpoint (`geoserver/lu`) is a **hard 404** while
`urbanismo` serves fine. Galicia's real service was found in `controls.min.js`.*

## 3 · ⭐ ALIGNMENT RECOVERY

Search `alineación` · `alineaciones` · `alineació` · `aliñación` · `línea oficial` · `eje` · `eixos` ·
`LINALIN` · `building line` · ⚠ `rasante` *(a DIFFERENT thing — street grade, not façade line; report
separately)*.

⛔ **DISTINGUISH street centrelines from cadastral boundaries from PLANNING ALIGNMENTS.** ⭐ **The
decisive test is the perpendicular distance from the line to the parcel front** — clustering near zero
⇒ alignment; near half-carriageway ⇒ centreline. **Confusing them over-grants by half a street width.**

## 4 · DOCUMENT RECOVERY — assume the grammar exists somewhere

Consolidated texts · amendments · annexes · **diligenciado expedientes** · approval documents ·
technical reports · planning books · PDF attachments.

Classify: **TEXT · PAINTED · VECTOR · RASTER · SCAN.** ⛔ **NEVER CONCLUDE "SCAN ONLY" UNTIL EVERY CLASS
HAS BEEN INSPECTED.**

⭐ **`PAINTED-BUT-UNMAPPED` is a real fourth class** — Córdoba's *"1 of 13 machine-readable"* was an
**extractor artefact**: prior extractors harvested every `(...)` literal **including font programs**. A
painted-text extractor + `/ToUnicode` recovery unlocked **the current normativa for every zone**.
⛔ **CLASSIFY ON PAINTED TEXT (`Tj`/`TJ` in INFLATED streams), NOT ON FONT PRESENCE** — a classifier
calibrated only against scans **returns SCAN unconditionally and scores 100 %.**

## 5 · SCHEMA RECOVERY — search by CONCEPT, not lexeme

`MAX_HEIGHT · MAX_STOREYS · BUILDABLE_DEPTH · FRONT/SIDE/REAR_SETBACK · OCCUPATION · FAR ·
MINIMUM_PLOT · TYPOLOGY · ALIGNMENT_RULE`.

⛔ **DUMP THE FULL FIELD UNION FIRST. A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD.**
⚠ **Reject lexical false positives**: Spanish *alta* = registration, not *altura*; **`fondo` is also
"background"**; *árbore/antena* heights are trees and masts. ⚠ **Datums are not synonyms** —
`altura de cornisa` ≠ `altura total`; `AltMaxMV` (street) ≠ `AltMaxMP` (parcel).

## 6 · ROUTING RECOVERY — prove the failure

Spatial joins · identifiers · instrument IDs · municipality IDs · approval dates · **duplicate keys** ·
geometry validity · topology. **Deliver the minimal authoritative routing key.**

⚠ **A selector returning two instruments has not selected** (Madrid: 30.66 % non-unique).

## 7 · SENTINEL DISCOVERY — assume sentinels exist

⛔ **EXPLAIN SEMANTICS BEFORE PARSING.** Known: Aragón **`0`-as-null** (70/78 rows `shape_area>0` AND
`perimeter==0`) · Balears **`DFIVIGEN = 99999999`** · Canarias **`'I'`** (~75–80 % of every parameter
column, **meaning unresolved**) · CyL `v_ind_edif = 0` on 1,715 rows · ⭐ **Murcia `f_fin =
2999-12-30`.**

⛔ **THE MURCIA CASE IS THE NASTIEST AND EVERY TEAM SHOULD KNOW IT: `f_fin IS NULL` RETURNS ZERO
IN-FORCE ROWS. HTTP 200. Filter-applied proof PASSED. Decomposition SUMMED EXACTLY. And the answer is a
FALSE NEGATIVE that killed a live lead.** Caught only by contradiction with an **independently-sourced**
figure. **NO SELF-CONSISTENCY CHECK CAN SEE THIS.**

## 8 · ⭐ FALSE-NEGATIVE HUNTER — assume the absence is a PESSIMISTIC error

**Balears, Murcia, Córdoba, Madrid, Aragón and Canarias were ALL under-stated at some point.**

> ⭐ **Overclaims get caught because users notice them. UNDERCLAIMS SURVIVE INDEFINITELY BECAUSE THEY
> LOOK SAFE.**

Falsify via hidden services · historical services · document replay · painted text · OCR · annexes ·
mirrors · alternative portals. ⛔ **ONLY AFTER EXHAUSTING THOSE MAY A CAPABILITY BE CLASSIFIED
`ABSENT` — and `ABSENT` ≠ `UNKNOWN` ≠ `UNREACHABLE`. THREE STATES, NEVER TWO.**

## 9 · ENVELOPE IMPROVEMENT — where an envelope already exists

**Which capability is INFERRED? Can it become AUTHORITATIVE? Which geometry is approximated? Which
legal rule is approximated?** ⛔ **Improve the envelope WITHOUT CHANGING ITS LEGAL MEANING.**

## 10 · FOUNDER DECISION — exactly one action, binary outcome

It must **unblock the largest capability**, require **one human decision**, and **avoid speculative
engineering**. ⭐ **YES unlocks the capability; NO proves it unavailable.**

*Live examples: the Málaga Oracle request · the Córdoba GMU request · **one Galicia diligenciado ZIP by
hand** (reCAPTCHA is deliberate and must not be routed around) · the Catalunya signature.*

---

## ⚠ Reporting discipline

⛔ **A PERCENTAGE WITHOUT ITS DENOMINATOR IS NOT A MEASUREMENT.** Row-weighted and land-weighted have
disagreed by **7×** in this corpus. **State the weighting every time.**

⛔ **AND A PLANNING ENVELOPE IS NOT A LEGAL ENVELOPE.** Constraints — heritage, flood, airport,
environmental, infrastructure — are **absent in every region measured, INCLUDING the two in
production.** Every figure this programme publishes is an **UPPER BOUND WITH A MISSING CEILING** until
that layer exists.
