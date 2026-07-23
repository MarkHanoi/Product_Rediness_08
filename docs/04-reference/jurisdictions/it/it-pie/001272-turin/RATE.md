# Data Readiness Rate — Turin (001272)

**Headline rate: ~12% (contingent)**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (parcel geometry + zone identification + at least one
> numeric building parameter) without reading the PRG NTA PDF.
>
> ⚠ **The ~12% figure is contingent on the unconfirmed assumption that Turin's current PRG NTA
> uses DM 1444-style zone letters with per-zone numeric tables.** If the NTA has been reformed
> toward a bespoke mechanism (as Milan and Rome have), the rate drops to ~5% and the dev-day
> estimate rises from ~10–15 to ~20–25+.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Turin** | **~12% (contingent)** |
| France (national) | ~22% |
| Germany (national) | ~28% |
| Milan | ~5% |
| Rome | ~5% |
| Italy (national) | ~8% |

Turin rates higher than Milan or Rome because: (1) Catasto WFS provides parcel geometry;
(2) the Piedmont PRG mosaic WFS/WMS *plausibly* covers Turin's zone letters at current-date
currency (provincial capital — better coverage than the regional average); (3) ARPA Piemonte
Edifici 3D provides building-height context data (unique among the three Italian cities studied);
(4) if the PRG NTA confirms zone letters, the numeric rules follow directly from the NTA PDF
with no new engine kind required. Every one of these factors is contingent on live probes that
have not yet been run.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS — CC BY 4.0. Not survey-grade. Not live-probed. | **~90%** |
| Heritage overlay (SITAP) | ⚠️ Informational | SITAP web-GIS — informational only; acknowledged incomplete. Turin's centro storico (Savoy royal buildings — UNESCO listed) is high-heritage density. | **~35%** |
| Heritage overlay (Vincoli in Rete) | ⚠️ Informational | Same caveat. | **~35%** |
| **Zone identification (Piedmont PRG mosaic WFS)** | ⚠️ Unconfirmed — plausible | Piedmont regional PRG mosaic WMS/WFS — Turin as provincial capital is likely among better-updated areas, but currency must be confirmed. Zone-letter field name TBD. | **~25%** (currency and field schema unconfirmed; plausible for Turin specifically) |
| **DM 1444 zone letter (A/B/C/D/E/F)** | ⚠️ Contingent | If PRG NTA confirms DM 1444 zone letters as operative mechanism: zone letter queryable from Piedmont mosaic WFS. If NTA uses bespoke mechanism: zone letter is wrong key. | **~20%** (contingent on NTA confirmation) |
| **Indice di fabbricabilità** (`mc/mq`) | ❌ PDF (NTA) | In PRG NTA per-zone article — no regional GIS layer for this attribute. DM 1444 Art. 7–8 ceilings are published upper bounds only. | **~0%** (NTA PDF required) |
| **Max height** | ❌ PDF (NTA) | In PRG NTA per-zone article. | **~0%** |
| **Coverage / footprint** | ❌ PDF (NTA) | In PRG NTA per-zone article. | **~0%** |
| DM 1444 Art. 7–8 density ceilings | ✅ Published ceiling | National published upper bounds. **Ceilings only, not operative values.** | **100% (ceiling only)** |
| Existing building heights | ✅ **Confirmed (research level)** | **ARPA Piemonte Edifici 3D** — per-building mean elevation, region-wide, including Turin. Reliability for urban core TBD on live probe. | **~60%** (dataset exists and confirmed; endpoint and urban-core reliability not yet probed) |
| Regolamento Edilizio setbacks | ❌ Not read | Turin RE governs setbacks; field names and multipliers not read. National floors (CC Art. 873: 3 m; DM 1444 Art. 9: 10 m) are the only confirmed values. | **~5%** (national floor only) |

---

## The contingency that matters most

**If NTA confirms DM 1444 zone letters:** Turin is a zone-letter config case. The Piedmont PRG
mosaic WFS (if current for Turin) provides zone identification; the NTA PDF provides the per-zone
numeric table. No new engine kind is needed. Realistic ceiling after NTA read + mosaic probe:
**~25–35%** (zone + national distance floors + ARPA Piemonte building height context).

**If NTA reveals a bespoke mechanism:** Turin becomes Tier 2. The dev-day estimate rises to
~20–25+ and a new engine kind must be scoped. The ARPA Piemonte building-height advantage remains,
but the numeric rule pipeline starts from scratch.

This single binary question — confirmed by reading ~20 pages of NTA — is the cheapest possible
research step and should be the first action before any Turin build decision.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read Turin PRG NTA — confirm zone-letter mechanism and first numeric table | Binary: either confirms Tier 1 (+15 pp potential) or reveals Tier 2 need (rate stays ~5%) | Medium — one PDF read (~20–40 pages) |
| Live-probe Piedmont PRG mosaic WFS — confirm zone-letter field and Turin currency | Confirms zone identification is API vs map search | Low |
| Live-probe ARPA Piemonte Edifici 3D — confirm endpoint, field schema, urban-core reliability | Confirms or adjusts building-height score; may raise to ~70–80% if urban-core data is reliable | Low |
| Read NTA per-zone articles — extract height, coverage, density for each zone type | +10–20 pp (NTA transcription, zone by zone) | High — full NTA read |

**Realistic ceiling after full NTA read + mosaic + ARPA probes (if Tier 1 confirmed):**
- Zone + one numeric field per zone: **~30–40%**
- Full NTA transcription for all zone types: **~45–55%** — approaching Barcelona levels
- ARPA Piemonte building-height context: adds context data, not envelope data; does not raise the
  fill rate but substantially improves the 3D context product quality

Turin is Italy's best near-term opportunity: if the NTA assumption holds, it could reach
Barcelona-comparable structured fill rates with moderate transcription investment.

---

*Last updated: 2026-07-23. Research-level only — no live probes run. ARPA Piemonte Edifici 3D
confirmed at research level (existence and method). PRG NTA zone-letter assumption unconfirmed.
All rates are contingent estimates.*
