# Murcia — land-class census and the derived-plan split

> **Measured 2026-08-01** by the orchestrator, directly against the live municipal WFS
> (`geoserver.murcia.es/geoserver/wfs`, layer `Murcia:pgou_sectores`) — **all 3,611 features
> enumerated, not sampled**. Feeds C63 **ENVELOPE** and the §CLOSURE ceiling in [`../RATE.md`](../RATE.md).
> **This is the number that decides whether Murcia is worth transcribing.**

## Why this measurement exists

Barcelona's envelope ceiling is **~70 %**, and the reason is structural: **62.8 % of its land is
`PD*`** — governed by derived plans the PGM does not contain. Before investing in a Murcia
transcription we needed the equivalent figure, because it **bounds the prize before any effort is
spent**. It is the same question C63 asks of every city: *how much of this municipality can an
ordinance answer at all?*

## 1 — Land class across the whole municipality

Total **902.4 M m²** (Murcia is 902 km²; Barcelona is 102 km²). In-force filter applied on `f_fin`
— **0 of 3,611 features were superseded**, so the whole set is current.

| `clase_suelo` | Area | Share | Can an envelope exist? |
|---|---:|---:|---|
| No Urbanizable | 400.4 M m² | **44.4 %** | ⛔ no — protected/rural |
| Urbanizable | 239.9 M m² | **26.6 %** | ⛔ not yet — **requires a Plan Parcial by definition** |
| Sistemas Generales | 206.1 M m² | **22.8 %** | ⛔ no — public systems, no private envelope |
| **Urbano** | **56.0 M m²** | **6.2 %** | ✅ **the L-656 denominator** |

⚠ **67.2 % of Murcia is land where a refusal is the ONLY correct answer** (No Urbanizable +
Sistemas Generales). That is not a coverage failure — it is the law, and it is exactly why land
class belongs on the parcel card: it turns *"PRYZM cannot answer"* into *"nothing may be built here."*

## 2 — Inside the urban land: the split that decides the ceiling

Of the **56.0 M m²** of *Urbano* (1,574 features):

| Sector code | Share of Urbano | Reading |
|---|---:|---|
| `U` — plain urban | **36.9 %** | no derived-plan marker |
| `US` — Urbano Especial | **22.2 %** | no derived-plan marker — ⚠ **but see caveat 2** |
| `UR` — núcleo rural | **2.7 %** | no derived-plan marker |
| `UA-*` · `PU-*` · `UM-*` · `PI-*` | **24.8 %** | **named derived-plan sectors** |

By `categoria`: Urbano Consolidado **55.8 %** · Urbano Especial **22.2 %** · *(null)* **19.3 %** ·
Urbano Núcleo Rural **2.7 %**.

### → **~75 % of Murcia's urban land carries no derived-plan sector marker.**

| | Barcelona | **Murcia** |
|---|---:|---:|
| Land delegated to derived plans | **62.8 %** | **24.8 %** |
| Envelope ceiling (projected) | ~70 % | **~75 %** |
| Buildable-land denominator | 31.8 M m² | **56.0 M m²** |

**Murcia has a better starting position than the flagship** — a higher reachable ceiling over a
*larger* absolute area.

## 3 — Three caveats. Do not quote the headline without them.

1. **`superficie` is a PUBLISHED ATTRIBUTE, not geometry measured here.** Barcelona's 62.8 % came
   from summing polygon areas. Same order of confidence, **different method** — do not present the
   two as like-for-like without saying so.
2. **The 24.8 % is a SECTOR-CODE HEURISTIC, not a legal reading.** `U` / `US` / `UR` *look* like
   direct-PGOU land. **`US` (Urbano Especial, 22.2 %) is the one to distrust** — an "especial"
   regime plausibly delegates, and if it does the ceiling drops from ~75 % to ~53 %. **This must be
   verified against the PGOU text, not inferred from the code.**
3. **This bounds the prize; it does not confirm it.** It says nothing about whether the PGOU
   actually *states* parameters for `U`/`US`/`UR` land. That needs the *Normas Urbanísticas*, which
   **the repo does not hold** — the one thing Barcelona had that Murcia does not.

## 4 — What this does and does not change

**Does:** Murcia is **worth the transcription effort**, and that is now an evidenced decision rather
than a guess.

**Does not:** unlock the founder's own parcel. `3481104XH6038S` resolves *ámbito* **TA-379 →
Plan Parcial CR-5** — it sits in the 24.8 % delegated slice, and PGOU Arts. 6.6.2 / 5.24.5.1
expressly hand its parameters to that partial plan. **Transcribing the PGOU will not reach it.**

## 5 — Open, in priority order

1. **Verify `US`** against the PGOU text — worth ~22 pp of the ceiling on its own.
2. **Source the PGOU *Normas Urbanísticas*** (municipal urbanismo portal / BORM), recording its
   authority status: binding text vs *"documento sin valor normativo"* re-edition.
3. **Re-measure by true polygon area** to make the Barcelona comparison method-identical.
4. Explain the **19.3 % null `categoria`** — unknown, not zero.

---
*Method: `GetFeature` paged 1,000 at a time, `propertyName=sector,clase_suelo,categoria,superficie,f_inicial,f_fin`,
3,611/3,611 retrieved, 0 page failures. A fetch failure and a genuine empty were kept distinct
throughout (§CONTEXT-DATA-HONESTY). Feeds [`../RATE.md`](../RATE.md) §CLOSURE and
[`../../../../../03-execution/plans/MASTER-ROI-TRACKER.md`](../../../../../03-execution/plans/MASTER-ROI-TRACKER.md).*
