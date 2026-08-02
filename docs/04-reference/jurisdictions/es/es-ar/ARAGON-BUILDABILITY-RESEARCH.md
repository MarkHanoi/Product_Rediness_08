# ARAGÓN — BUILDABILITY RESEARCH SUMMARY

**Status**: ⭐ **L1 — vector layer MEASURED**, with one promising but **UNVERIFIED** route to richer
planning parameters. **SEQUENCED, NOT PARKED** — Phase B, immediately after Catalunya's A2.
**Related**: [REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293 per-dimension tiering](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ES-ALL-REGIONS-STATUS](../ES-ALL-REGIONS-STATUS.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

> ⭐ **ARAGÓN IS NOT CLOSED AS IMPOSSIBLE. IT IS BLOCKED BY MISSING EVIDENCE, NOT BY EVIDENCE OF
> ABSENCE.** It has moved from *"likely impossible with available data"* to **"promising but
> unverified."**

⛔ **ORDER IS NOT NEGOTIABLE: CATALUNYA A2 BEFORE ARAGÓN B1.** Catalunya has **24 municipalities one
run away from being measured**; Aragón has **zero envelopes and three unrun tests.**

---

## Evidence ledger — ⛔ `MEASURED` / `READ` / `UNKNOWN`, never conflated

| MEASURED | READ | UNKNOWN |
|---|---|---|
| Parcel geometry · planning polygons · vector parameter coverage · classification coverage · `fiab_geom` population · **schema null behaviour** | NOTEPA definitions · the ficha URL pattern · archive endpoint patterns · `CMUNIINE` | ficha **contents** · height · FAR · occupation · setbacks · buildable depth · **article provenance** · governing instrument chain · **the legal meaning of `fiab_geom`** |

---

## 1 · Parcel geometry — ✅ MEASURED, complete

**Catastro INSPIRE**, national. **No Aragón-specific work required.**

## 2 · Planning polygons — ✅ MEASURED

**SIUa** serves regional planning polygons via **WMS `GetFeatureInfo`**. ⚠ **No WFS available.**
Sample: **78 records across 16 municipalities.**

## 3 · Vector audit — ⛔ the buildability fields are effectively EMPTY

| Field | Valid rate |
|---|---:|
| `edificab` | **1.3 %** |
| `aprove` | **0.0 %** |
| `densidad` | **1.3 %** |

**The fields EXIST. The values do not.** *Schema ≠ corpus* — report them separately, always.

## 4 · ⭐ THE METHODOLOGICAL DISCOVERY — and it is now a project-wide rule

The dataset reports **almost every numeric field as populated.** **That is misleading.**

> **70 of 78 records have `shape_area > 0` AND `perimeter == 0`.** ⛔ **Geometrically impossible.**

⇒ ⭐ **`0` IS THIS SCHEMA'S NULL SUBSTITUTE.**

> ⛔ **THE RULE, now standing across the programme: NEVER REPORT NON-NULL RATES WITHOUT SEMANTIC
> VALIDATION. Populated is not present. Validate for internal contradiction.**

## 5 · Classification — ✅ genuinely populated

| Field | Coverage |
|---|---:|
| `clase` | **100 %** |
| `notepa` | **97.4 %** |

⇒ **Aragón successfully serves CLASSIFICATION. It does NOT serve BUILDABILITY** in the measured
vector layer. *(Same shape as SIU nationally — L2-for-determinations, not envelopes.)*

## 6 · `fiab_geom` — ⛔ **UNKNOWN, and it is a CEILING**

**Present on 100 % of records. Reads `"Aprobada"` on 21.8 %.**

Candidate meanings — **legal approval status** · **geometry quality** · **digitisation confidence**.
⛔ **Completely different regions depending which it is.**

> ⚠ **IF IT MEANS APPROVAL STATUS, ARAGÓN CAPS AT 21.8 % REGARDLESS OF EVERYTHING ELSE IN THIS
> DOCUMENT.**

## 7 · NOTEPA — **Decreto 78/2017**

Standardises planning terminology and cartography; **Art. 7** defines *edificabilidad*, gross FAR, net
FAR, buildable floor area.

⚠ ⭐ **NOTEPA STANDARDISES DRAFTING, NOT PUBLICATION.** Standard definitions existing **does not mean
the values are published in SIUa.** *Mandated ≠ served* — the Galicia finding, third occurrence.

## 8 · ⭐ THE DISCOVERY — an official ficha URL pattern

Aragón Open Data's RDF for **Fraga, INE 22112** publishes:

```
https://idearagon.aragon.es/fichaDescarga/fichaDescarga_22112.html
```

⭐ **The pattern is `fichaDescarga_<CMUNIINE>.html` — an OFFICIALLY PUBLISHED pattern, not an
inference.**

⛔ **THE EARLIER 404s WERE A PATH-SHAPE ERROR:** `fichaDescarga/` was treated as a **directory** when
it is a **file prefix**. **Logged as a negative-proof condition** alongside *axis order*, *CRS
family*, *alternate parameterisation*, and *bbox-vs-attribute filter*.

⚠ **Contents NOT inspected. Status `READ`, not `MEASURED`.** ⚠ Host is **robots-disallowed to
crawlers** — fetch with a browser UA.

## 9 · Archive structure — READ, not exercised

```
Municipality (CMUNIINE) → Planning instrument → Expediente (CODEXP) → Document
```

## 10 · ⭐ THE HYPOTHESIS THAT DECIDES THE COST MODEL

**Aragón may need a SIMPLER envelope engine than Catalunya.** Catalunya depends on street alignment,
buildable depth, **block-ring reconstruction**, closed-block form. Much of Aragón may instead be
**parcel/setback-based** — front/rear/side setbacks, occupation, height, FAR.

⭐ **If true, Aragón needs LESS than Catalunya: no block ring, no dissolve, no Art. 242.2 equivalent,
no street-width ladder.** ✅ **PRYZM ALREADY HAS THAT PATH** — `esBarcelona20aAillada` is
`kind: 'setback'`, and `requiresBlockRing` routes such rules **away** from block construction
(**§L-591**).

⚠ **HYPOTHESIS until a representative municipal ordinance is examined.**

---

## Phase B — the three measurements, each cheap, each able to stop the chain

**B1 · Fetch the Fraga ficha** (browser UA). Report: **content or shell** · does it carry
`altura` / `plantas` / `edificabilidad` / `ocupación` · ⛔ **VALID rates, never non-null.** Then **two
more `CMUNIINE` codes** to confirm the pattern generalises.

**B2 · Read Fraga's PGOU Normas Urbanísticas, residential zones only. ONE question:**
> ⭐ **Setback-based (*edificación aislada*), or alignment-and-depth?**

**This single answer decides Aragón's cost model. One document — not a 20-municipality survey.**

**B3 · Resolve `fiab_geom`.** Take it from any data dictionary B1/B2 surfaces. Otherwise **record it as
the open blocker with its consequence stated.**

## Phase C — envelopes, only if B1 and B2 land

Full chain on **Fraga**: parcel → SIUa zone → instrument → ordinance → **article** → envelope with
citations. Then test generalisation on a **second, STRATIFIED municipality — not the capital.**

> ⛔ **STATE THE CEILING IN THE OUTPUT so nobody inherits an optimistic reading:** a ficha carries
> **FAR, height and occupation — a massing box.** **Depth, setbacks and alignment live in the Normas
> Urbanísticas.** And **there is NO article provenance across 731 corpora** — Barcelona's supersession
> audit ran **1,755 → 773 → 147** for **ONE municipality with ONE corpus**, one candidate an
> **image-only scan that failed the digit-integrity gate**.

⇒ ⭐ **Under [ADR-0293] the honest tier is INDICATIVE until article provenance exists.**

---

## Capability, stated as the evidence supports

| Question | Answer |
|---|---|
| **Indicative massing?** | ⚠ **UNKNOWN** — feasible *if* fichas expose height + FAR + occupation. **Not demonstrated.** |
| **Legally defensible envelopes?** | ⛔ **NO EVIDENCE YET.** Missing article-level citations, paragraph references, governing-instrument selection, verified current legal status. |

⭐ **The critical question is no longer whether Aragón HAS a planning information system — it clearly
does — but whether that system PUBLISHES the normative buildability parameters needed to move from
planning polygons to parcel-level envelopes.**
