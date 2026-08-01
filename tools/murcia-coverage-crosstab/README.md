# §MURCIA-CROSSTAB — calificación × clase-de-suelo

Turns Murcia's **"≤ 33.0 %"** coverage *bound* into a **point value**, by intersecting the two
shares that had been measured on two different tests and never crossed:

| | share of the **75.145 M m²** private-buildable denominator |
|---|---:|
| PGOU-DIRECT (clase-de-suelo / *ámbito* delegation test) | 33.00 % |
| the 14 packed calificaciones, **by code** | 38.95 % |
| **⭐ the intersection — packed AND not delegated** | **23.51 %** |

## Run it

```bash
node tools/murcia-coverage-crosstab/crosstab.mjs               # uses ./.cache (free, offline)
node tools/murcia-coverage-crosstab/crosstab.mjs --refresh     # re-hit the municipal WFS
node tools/murcia-coverage-crosstab/crosstab.mjs --asof 2027-01-01
```

Writes `out-crosstab.json` (committed — it is the audit trail behind
[`RATE.md` §CLOSURE](../../docs/04-reference/jurisdictions/es/es-mc/30030-murcia/RATE.md)) and prints
a markdown summary. Raw WFS pages cache to `.cache/` (gitignored), so a re-run is free and polite.

Exit code **2** on a fetch failure, and it prints no share at all — ⚠ a service outage must never
render as "0 % coverage" (§CONTEXT-DATA-HONESTY, L-422/457/467/469).

## Why it is trustworthy

It **reproduces the entire previously-published baseline from the live layers** before it computes
anything new — the 75.145 M m² denominator, the 33.00 % / 67.00 % split, all four delegation grounds
(30.16 / 20.54 / 11.22 / 5.08), the 99.74 % join rate and every per-family share in `ENVELOPE.md`
§3.1 to two decimals. `packages/site-parcel-data/__tests__/murciaCoverageCrosstab.test.ts` pins that.

## ⚠ Two things it deliberately measures separately

1. **The LEGAL cross-tab** — packed calificación **family** ∧ not delegated = **23.51 %**.
2. **What the SHIPPING code would render** if `MURCIA_ENVELOPE_VERIFIED` flipped = **36.59 %**, of
   which **13.09 pp sits on land the PGOU delegates**. `murciaEnvelopeDisposition` tests only
   `REMITTED_AMBITO_PREFIXES` (`TA TM UA UH UM`); it applies no *clase de suelo* test and does not
   know `UE` / `UD` / `P*`. That gap is a pre-signature blocker, not a rounding difference.

## Files

| File | Role |
|---|---|
| `crosstab.mjs` | the runner — fetch, classify, measure, emit |
| `classify.mjs` | the LEGAL classification; every set carries its PGOU article |
| `lib.mjs` | paged WFS fetch + cache, shoelace area in native EPSG:25830 |
| `out-crosstab.json` | the committed measurement (carries its own `snapshot` timestamp) |

⚠ **It authorises nothing.** `MURCIA_ENVELOPE_VERIFIED` stays `false`. Measuring what a signature
*would* render is a different act from signing.
