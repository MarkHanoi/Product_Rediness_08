# Data Readiness Rate — Milan (015146)

**Headline rate: ~5%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (parcel geometry + zone identification + at least one
> numeric building parameter) without reading the PGT Piano delle Regole NTA PDF.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Turin | ~12% (contingent) |
| **Milan** | **~5%** |
| Rome | ~5% |
| Italy (national) | ~8% |

Milan's 5% reflects three compounding problems: (1) the Catasto WFS provides parcel geometry but
not zoning data; (2) there is no zone-letter key for the dominant TUC mechanism — the operative
question is parcel-and-ledger, not zone-and-table; (3) the perequation ledger (which parcels have
already transacted rights) is not evidently exposed as queryable GIS. The only data that is
structurally queryable today is the national floor (DM 1444 ceiling — useless as an operative
value) and SITAP/Vincoli in Rete heritage overlays (informational only).

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS `wfs.cartografia.agenziaentrate.gov.it` — CC BY 4.0. Not survey-grade. Not live-probed. | **~90%** (nationwide; precision caveat) |
| Heritage overlay (SITAP) | ⚠️ Informational | SITAP web-GIS — informational only; acknowledged incomplete. Milan contains many listed assets (Duomo zone, Liberty buildings). | **~35%** (Milan centro storico density likely high; SITAP incompleteness applies) |
| Heritage overlay (Vincoli in Rete) | ⚠️ Informational | Same caveat as SITAP. | **~30%** |
| **PGT zone identification (Piano delle Regole)** | ❌ Not confirmed | Lombardy Geoportale hosts PGT archive; whether WFS parcel-query returns zone polygon not confirmed. PGT portal `pgt.comune.milano.it` has tavole but as map service. | **~10%** (unconfirmed WFS; research-level only) |
| **TUC territorial index (base: 0.35 mq/mq)** | ❌ PDF (NTA) | In Piano delle Regole NTA — confirmed at research level but not live-sourced. Single citywide figure — but the perequation adjustment is parcel-and-ledger, not structurally queryable. | **~0%** (figure known at research level; operative value requires ledger lookup) |
| **TUC ceiling (0.70 mq/mq via perequation)** | ❌ PDF + ledger | Achievable only through transferable rights, bonuses, and social-housing quota — requires the perequation ledger, which is not confirmed as publicly queryable GIS. | **~0%** |
| **Perequation ledger** | ❌ Not found | Which Milan parcels have already transacted rights (and for what volume) is the critical operative unknown. Not confirmed as publicly queryable. | **~0%** |
| **ERS zone rules** | ❌ PDF | ERS (*Edilizia Residenziale Sociale*) zones are explicitly excluded from the TUC unified index; they follow a separate rule set from the PGT NTA. | **~0%** |
| DM 1444 Art. 7–8 density ceilings | ✅ Published ceiling | National published upper bounds only — **not operative for Milan**, which has superseded the DM 1444 zone-letter mechanism entirely for TUC parcels. | **100% (ceiling; not an operative value for any Milan TUC parcel)** |
| Existing building heights | ❌ Unconfirmed | Lombardy building-height GIS layer not confirmed. Milan's own SIT may carry building data; regional aggregation unknown. PST/SIM is terrain only. | **~0%** |
| Regolamento Edilizio-Tipo (RET) setbacks | ❌ Not read | Lombardy RET governs setbacks in Milan; multipliers and minimums not yet read. | **~0%** |

---

## Why Milan requires a new engine kind

The TUC territorial-index mechanism is the most structurally surprising finding in the Italy study.
The dominant operative mechanism for Milan's built-up area is:

1. **Not a zone table** — there is no list of zones with associated GRZ/GFZ-equivalent values.
2. **A single citywide index** (0.35 mq/mq base) applied to every TUC parcel via its
   *lotto funzionale* (functional lot construct).
3. **A cap-and-trade overlay** for the ceiling (0.70 mq/mq) that depends on the parcel's
   transacted perequation rights — a ledger that may not be publicly queryable.

This is not "different numbers in the same schema" — it is a different schema entirely. The closest
analogue from other cities studied is Paris's reference-surface-plus-gabarit finding (structurally
new, not a config change), except here the rights-trading layer adds a data-access problem that
Paris does not have.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Live-probe Lombardy Geoportale WFS for PGT Piano delle Regole zone polygon per parcel | Determines whether zone identification is an API call (raises to ~15%) or requires PDF navigation (~5%) | Low |
| Read PGT Piano delle Regole NTA — extract TUC mechanism articles, ERS zone rules, and agricultural rules | Confirms the 0.35/0.70 mq/mq figures as primary-source; scopes ERS and agricultural carve-outs | Medium |
| Sourcing check: is the perequation ledger exposed as queryable GIS (Milan SIT, PGT portal, commercial)? | If yes: Milan may be computable for TUC parcels without perequation burden; if no: TUC ceiling answers require administrative lookup | Medium |
| Check Lombardy Geoportale for 3D/Edifici layer (building heights) | Fills context-height gap for Milan | Low |

**Realistic ceiling:**
- If PGT Piano delle Regole WFS is queryable + NTA read + perequation ledger unavailable: **~15–20%** (zone + base index only; ceiling answer = "requires ledger lookup")
- If perequation ledger is publicly queryable: **~25–35%** (full TUC envelope computable)
- Without perequation ledger: TUC ceiling answer is always a reasoned partial (base confirmed; ceiling requires further lookup)

---

*Last updated: 2026-07-23. Research-level only — no live probes run. All rates are estimates from
the Italy master study. PGT NTA figures (0.35 / 0.70 mq/mq) confirmed at research level only.*
