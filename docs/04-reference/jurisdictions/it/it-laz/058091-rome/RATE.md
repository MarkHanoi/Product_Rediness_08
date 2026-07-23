# Data Readiness Rate — Rome (058091)

**Headline rate: ~5%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (parcel geometry + tessuto classification + at least
> one numeric building parameter) without reading the PRG NTA PDF.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Turin | ~12% (contingent) |
| **Rome** | **~5%** |
| Milan | ~5% |
| Italy (national) | ~8% |

Rome's 5% reflects: (1) Catasto WFS provides parcel geometry; (2) SITAP/Vincoli in Rete cover
heritage overlays (informational only); (3) no machine-readable tessuto-classification layer has
been confirmed as WFS-queryable per parcel; (4) the direct/indirect intervention classifier must
run before any numeric rule can be attempted; (5) the Carta per la Qualità precedence question is
legally contested and unresolved. Every numeric building parameter requires the PRG NTA PDF.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS — CC BY 4.0. Not survey-grade. Not live-probed. | **~90%** |
| Heritage overlay (SITAP) | ⚠️ Informational | SITAP web-GIS — informational only; acknowledged incomplete. Rome has very high heritage density (historic centre, archaeological areas). | **~30%** (Rome's density may mean more gaps than average) |
| Heritage overlay (Vincoli in Rete) | ⚠️ Informational | Same caveat. Rome has many listed buildings and archaeological zones. | **~25%** |
| **PRG tessuto type identification** | ❌ Not confirmed | Roma Capitale SIT or geoportal (`sit.comune.roma.it`) — whether tessuto classification is WFS-queryable per parcel is unconfirmed. May require map-viewer navigation. | **~10%** (unconfirmed WFS; research-level only) |
| **Direct/indirect intervention classifier** | ❌ Not built | Prerequisite: must classify each parcel as direct (Città Storica/Consolidata ordinary) vs indirect (Consolidata valorizzazione/Ristrutturare/Trasformazione) before any numeric lookup. | **~0%** (classifier not built) |
| **Città Storica NTA rules (per tessuto)** | ❌ PDF | PRG 2008 NTA — point-by-point transformation rules per tessuto at 1:5,000. Not read. | **~0%** |
| **Città Consolidata T1/T2/T3 rules** | ❌ PDF | PRG 2008 NTA — fabric-density typology rules for T1 (medium density), T2 (high density), T3 (free typology). Not read. | **~0%** |
| **Carta per la Qualità overlay** | ❌ Machine-readability unknown | Carta catalogues archaeological, monumental, and fabric elements — whether exposed as GIS layer or only web viewer is unconfirmed. Precedence over tessuto rules is legally contested. | **~0%** |
| **Città da Ristrutturare / Trasformazione** | ✅ Refusal (correct answer) | Indirect intervention = no numeric envelope until executive plan adopted. Correct answer: "refusal — indirect intervention regime, no numeric building envelope." | **100% (refusal answer only)** |
| DM 1444 ceiling | ✅ Published ceiling | National upper bounds — NOT operative for Rome (tessuto mechanism supersedes zone-letter system). | **100% (ceiling; not operative)** |
| Existing building heights (Lazio) | ❌ Unconfirmed | No Lazio-wide building-height GIS layer identified. Rome's SIT may carry building data; unknown. | **~0%** |

---

## Why Rome requires a new engine kind

Rome's tessuto-typology mechanism is not a variant of the DM 1444 zone-letter system — it is a
structurally different classification approach:

1. **Land is classified by historic-fabric type** (early-20th-c. expansion, defined typology,
   free typology) — a survey-based classification, not a density-indexed zone letter.
2. **A direct/indirect intervention gate** must be resolved for each parcel before any numeric
   rule can be attempted — Rome's structural analogue of Germany's §30/§34/§35 regime classifier.
3. **The Carta per la Qualità precedence question** is a live legal risk with uncertain direction —
   contested amendments may mean the tessuto rule subordinates the heritage overlay, or vice versa.
4. **Città da Ristrutturare and Città della Trasformazione** are correctly handled as reasoned
   refusals — the same posture as Barcelona's volumetria-específica cases.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe Roma Capitale SIT for PRG tessuto WFS queryability (`sit.comune.roma.it`) | Determines whether tessuto classification is API or PDF navigation | Low |
| Read current PRG NTA consolidated text — confirm Carta per la Qualità precedence direction | Resolves the single largest legal-currency risk | Medium |
| Read PRG NTA Città Consolidata T1/T2/T3 articles — extract numeric rules | +10–15 pp for Consolidata parcels under direct intervention | Medium |
| Measure fraction of Rome parcels in each sistema (Storica/Consolidata/Ristrutturare/Trasformazione) | Quantifies the denominator and the refusal floor | Medium |
| Check `dati.lazio.it` or `geoportale.regione.lazio.it` for building-height GIS layer | Fills context-height gap for Rome | Low |

**Realistic ceiling:**
- If tessuto WFS queryable + NTA read (Consolidata T1/T2/T3): **~20–25%** (Consolidata under direct intervention only)
- Città Storica NTA read as well: **~30–35%** (adds the dense central fabric)
- Città da Ristrutturare / Trasformazione remain refusals regardless — correct answers, not gaps

---

*Last updated: 2026-07-23. Research-level only — no live probes run. PRG 2008 tessuto mechanism
confirmed in research; NTA primary text not read; tessuto WFS queryability unconfirmed.*
