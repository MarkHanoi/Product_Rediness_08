# SPAIN — REGIONAL RANKING, evidence-backed

**Status**: live. **2026-08-02.** Every row traces to a committed artefact or is marked `UNKNOWN`.
**Scored under**: [R/P REGIONAL SCORING](../../04-reference/standards/R-P-REGIONAL-SCORING.md) ·
[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293](../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md)

> ⛔ **THE QUESTION HAS CHANGED.** It is no longer *"can we find rules?"* — it is
> ⭐ **"can we attach the RIGHT rule to a parcel and generate geometry WITHOUT INVENTING ANYTHING?"**
> That is a much smaller problem, and it is the one every proof run below is testing.

| Region | `R` routing | `P` parameters | Status | The one thing that decides it |
|---|---|---|---|---|
| **Catalunya** | ✅ | ✅ | ⭐ **PROVEN PIPELINE** — 1 published, **36 proven** | ships behind Step 1 + a gate |
| **Canarias** | ⚠ 45/88 settled | ❓ measuring | **potentially 2nd strongest** | ⭐ does `EDIF.mdb` carry populated numerics — **and is `FonMaxEd` real** |
| **Murcia** | ✅ registered | ⚠ 28.09 % + ficha | **likely easiest next** | does the ficha **join** survive its negative control |
| **Balears** | ⭐ **97.1 % census** | ⚠ partial (36.7 % all-features) | promising, **PTI ceiling** | **PTI reach into BUILDABLE land** |
| **Málaga** | ❓ proving | ❓ proving | municipality proof live | does `PDF_Normativa_GIS` map **code → article** |
| **València** | ✅ 542/542 registers | ⛔ grammar not extracted | routing good, **grammar hard** | can one ordinance be **read and parsed** |
| **Madrid** | ⛔ **broken** | ✅ **proven** | **partial** — 61 municipalities indicative | **polygon-level** override vs municipality-level |
| **Aragón** | ⛔ | ⛔ | ⛔ **CLOSED — the answer is no** | four independent caps, each sufficient |

---

## The pattern the week established

⭐ **REGIONAL LAYERS RESOLVE CLASSIFICATION, NOT GRAMMAR.** València proved it hardest: one ontology,
23 codes, 542/542 municipalities, **harmonisation real** — and its capital's 1,967 `ZUR-RE` polygons
span **both closed-block and detached fabric with no attribute separating them.**

⇒ **If that generalises, the unit of cost stays MUNICIPAL.** ⭐ **Canarias is the counter-case**: its
`EDIF.mdb` is specified to carry setbacks, depth and height **per zone** — grammar AND parameters, not
just classification. **Its result decides whether the pattern holds nationally.**

## ⭐ `FonMaxEd` may be the most important field in Spain

**Closed-block depth is Spain's recurring envelope failure, and every region fails it differently:**

| Region | How depth fails |
|---|---|
| **Barcelona** | `fondo edificable` exists — but the operative value is **ON A PLAN SHEET** |
| **Huesca** | same — *"definido gráficamente en el plano nº5"* |
| **València** | **no regional dataset carrying depth identified across 696 swept layers** |
| **Madrid** | `NM_FDO_MX_ED` exists but is **12.9 % in the capital** |
| ⛔ **Canarias** | **`FonMaxEd` IS SCHEMA-ONLY AND EMPTY — 0.0 % valid, 7,870 sentinel rows.** Its metric twin `FonMaxEdm` carries **2.3 %** (182 rows). *Canarias serves depth where nobody else does — on 1 row in 44.* |

⛔ **MEASURED 2026-08-02: IT IS NOT POPULATED.** The prediction that `FonMaxEd` might be the most
important field in Spain was **WRONG, and wrong in the OPTIMISTIC direction.** The column exists in the
SIPU 2.6.A schema and carries **7,870 sentinel values and zero valid ones.**

⭐ **SO THE CONCLUSION INVERTS: NO SPANISH REGION SERVES CLOSED-BLOCK DEPTH AS A POPULATED COLUMN.**
Barcelona and Huesca put it on a plan sheet, València has none across 696 layers, Madrid has 12.9 % in
the capital, and Canarias specifies it and leaves it empty. **Depth is a national gap, not a regional one.**

## The ceilings, and none of them are data problems

- ⛔ **CONSTRAINTS ARE ABSENT IN EVERY REGION INCLUDING THE PUBLISHED ONE.** Heritage, airport, flood,
  environmental **only REDUCE**, so their absence **can only OVER-GRANT**. Every envelope anywhere is
  currently an **upper bound with missing ceilings** — the defect Madrid capital was withheld for.
- **Hierarchical supersession** — Balears **PTI**, Canarias **Planes Insulares**. Instrument-tier over
  instrument-tier, **invisible in the routing layer**, reduce-only, **unmodelled**.
- **Citation** — Balears' fitxa carries real parameters and **3 of 60 cite an article.** Barcelona's
  own `NORMATIV` is the bare string `"Barcelona"`. ⭐ **The reference city is the worst-cited of its
  27.**

> ⛔ **THE STANDING RULE, because every good number reads as permission:**
> ⭐ **A VERIFIED ROUTING RATE IS NOT A PUBLICATION LICENCE.**
> Balears hit **97.1 % routing** and the correct conclusion was still **does not publish.**

**All of it lands on counsel Q4** — *what liability attaches to a clearly-labelled indicative envelope
where a known constraint category is unmodelled?* **It gates every region in this table.**
