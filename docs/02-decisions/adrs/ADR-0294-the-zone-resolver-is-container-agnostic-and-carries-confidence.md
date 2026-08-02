# ADR-0294 — The zone resolver is CONTAINER-AGNOSTIC and carries CONFIDENCE

**Status**: **ACCEPTED** 2026-08-02 · founder-authored · **refines**
[ADR-0293](./ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md)
**Related**: [C64](../contracts/C64-ENVELOPE-COMPILER.md) ·
[R/P REGIONAL SCORING](../../04-reference/standards/R-P-REGIONAL-SCORING.md) ·
[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md) ·
[ES-REGIONAL-RANKING](../../03-execution/plans/ES-REGIONAL-RANKING.md)

---

## Context — seven regions, seven containers, one engine

**Spain does not lack planning parameters. Spain publishes planning truth in DIFFERENT CONTAINERS**,
and the pipeline was built assuming one of them.

| Container | Region where it is the primary source |
|---|---|
| **GIS polygon** (WFS/REST) | Catalunya AMB · Málaga *(locked)* |
| **MDB schema** | Canarias — `EDIF.mdb` |
| **Structured fitxa (HTML)** | Balears — `normativa.jsp?identitat=NNN` |
| **Vector PDF** *(outlined text)* | Córdoba — 11 of 13 ordinances |
| **Scanned PDF** | València — 476 of 530 registers |
| **Municipal GeoServer** | Murcia city *(distinct from regional CARM)* |
| **Detailed PGOU plan sheets** | Aragón — Huesca *plano nº5* |

⛔ **THE RULE THAT WAS WRONG:** *"no WFS ⇒ blocked."*
⭐ **THE RULE THAT IS RIGHT:** **"NO ZONE RESOLVER ⇒ BLOCKED."**

⚠ **This was not theoretical — it produced two real misjudgements.** Aragón was recorded **CLOSED** on
a **1:15,000 scale ceiling** that is a property of the **REGIONAL** layer; municipal *ordenación
detallada* is drawn at **1:500–1:2,000** and was never probed. Murcia was recorded as unable to draw
after measuring a ficha that **was never an envelope source**, while `geoserver.murcia.es` — a
different corpus, already proven to carry fields the regional service lacks — sat unenumerated.
**Both errors were PESSIMISTIC, and pessimistic errors are invisible because nobody re-tests a
negative.**

---

## Decision

### 1 · One interface, N providers

```ts
interface ZoneResolver {
  parcelToZone(parcel): { zone, source, confidence, evidence } | Refusal
}
```

Providers: `GISProvider` · `WMSGetFeatureInfoProvider` · `ShapefileProvider` · `CADProvider` ·
`VectorPdfProvider` · `OcrPdfProvider`.

⭐ **THE GEOMETRY ENGINE DOES NOT CARE WHICH ONE ANSWERED.** `requiresBlockRing` dispatches on the
zone's own rule; `kind:'setback'` is already implemented (§L-591). **The back end is common; the
regions are FRONT ENDS.**

### 2 · ⭐ CONFIDENCE IS A FIRST-CLASS FIELD, AND IT PROPAGATES

| Source | Confidence |
|---|---|
| GIS polygon · WMS `GetFeatureInfo` · SHP/GPKG | **HIGH** |
| CAD plan | **MEDIUM–HIGH** |
| Vector PDF | **MEDIUM** |
| OCR PDF | **LOW–MEDIUM** |

⛔ **CONFIDENCE MUST REACH THE CERTIFICATE. A MEDIUM-CONFIDENCE ZONE MAY NOT PRODUCE A
HIGH-CONFIDENCE ENVELOPE.** Discarding it after routing would reproduce the exact defect this ADR
exists to prevent — a number whose provenance was known and then thrown away.

### 3 · Prefer the MUNICIPAL container, fall back to the REGIONAL

```
municipal detailed plan  ->  regional layer  ->  REFUSE
```

⭐ **Spain is organised `parcel → municipality → instrument → detailed zoning → rule`, NOT by
autonomous community.** The CCAA is the unit of *legal corpus and signature*; it is **not** the unit
of *geometry publication*.

### 4 · ⛔ Degraded is not the same as invented

**A degraded route is acceptable. A guessed one is not.** Every resolution carries its `source` and
`evidence`; where no container answers, the output is a **CITED REFUSAL**, never a default.

⚠ **AND A LOW-CONFIDENCE ZONE STILL CANNOT CARRY AN UNKNOWN CONSTRAINT.** ADR-0293 still binds:
uncertain *provenance* is symmetric and a caveat can hold it; a missing *downward constraint* is
asymmetric and **can only over-grant**.

---

## Consequences

⭐ **Every region becomes an adapter supplying two functions** — `parcelToZone()` and `zoneToRule()`.
Everything below is already built. **That is why Balears is days rather than months.**

⛔ **AND THE MILESTONE CHANGES.** It is no longer *"support Andalucía"*. It is:

> **ONE SUCCESSFUL ENVELOPE FROM EACH PUBLICATION CONTAINER.**

Four containers proving out — **GIS polygon, MDB schema, structured fitxa, vector PDF** — demonstrates
the engine is container-agnostic. **After that, every remaining region is an adapter, not a research
programme.**

### Three PDF facts this ADR depends on, all measured 2026-08-02

- ⛔ **NO TEXT LAYER ≠ NO DATA.** Córdoba's ordinances are **outlined-text vector** — Print-To-PDF, no
  fonts, no images, ~250k path ops. **They render perfectly and extract zero characters**, and a
  pipeline logs them as *empty* rather than *unreadable*. **Vector extraction is a real route.**
- ⛔ **A CHARACTER COUNT IS NOT A TEXT LAYER** — 1,120,388 characters proved to be an embedded
  TrueType **font program**.
- ⛔ **CLASSIFY ON PAINTED TEXT (`Tj`/`TJ` in INFLATED content streams), NOT ON FONT PRESENCE.** A
  classifier calibrated only against scans **returns SCAN unconditionally and scores 100%**.
