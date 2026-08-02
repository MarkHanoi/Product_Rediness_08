# AMB LADDER DEFECT — THE RESTATEMENT PLAN, written BEFORE the delta lands

**Status**: ⭐ **PRE-COMMITTED 2026-08-02.** Written *before* the measurement so the restatement is
**DESIGNED, NOT DISCOVERED**.
**Related**: [ES-REGIONAL-RANKING](./ES-REGIONAL-RANKING.md) ·
[ENVELOPE-REACHABILITY-TRACKER](./ENVELOPE-REACHABILITY-TRACKER.md) ·
[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md)

---

## The defect, read from code

`heightFromFloorsAboveGround()` ([bcnAlcadaReguladora.ts:467](../../../packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.ts))
**takes no municipality parameter.** It reads `BCN_ALCADA_REGULADORA_TABLE` — **Barcelona's MPGM-2007
table** — for every municipality. The base metropolitan tables exist and ⭐ **nothing reads them**
(confirmed: declarations, two sibling comments, one test).

| storeys | Barcelona MPGM *(applied)* | base metropolitan *(should apply)* | Δ |
|---|---:|---:|---:|
| 1 | 9.00 m | 8.55 m | **+0.45** |
| 2 | 12.35 m | 11.60 m | **+0.75** |
| 3 | 15.70 m | 14.65 m | **+1.05** |

⛔ **Every value HIGHER, gap WIDENS with height — the OVER-GRANTING direction.**
⛔ **And it sits in the OV route** (38.01 % / 55.93 %), not the ladder route (3–6 %) — **~10× the share.**

## ⭐ The fix shape — select on MUNICIPALITY, never on FIGURES

```
Barcelona     -> BCN_ALCADA_REGULADORA_TABLE   (MPGM-2007, SIG-2)
Badalona      -> its own instrument, DOGC 5224
no footnote   -> BCN_ART327_BASE_METROPOLITAN_TABLE
unknown       -> REFUSE, cited
```

⚠ **Badalona's values are NUMERICALLY IDENTICAL to Barcelona's.** ⛔ **A VALUE CHECK PASSES WHILE THE
ATTRIBUTION STAYS WRONG** — the source file says so: *"a figures-only check cannot tell the two
municipalities apart."* **Attribution and value are separate verdicts and must be reported separately.**

---

# ⛔ IF THE DELTA MOVES — the artefacts that get restated

**Named in advance. Nothing on this list may be quietly left stale.**

## Tier 1 — figures computed FROM the defective table

| Artefact | What restates |
|---|---|
| `tools/cold-start-probe/out/task5-amb-all-municipalities.json` | **per-municipality envelope %, OV %, ladder %** for all 35 non-Barcelona rows |
| `tools/cold-start-probe/out/amb-tracker-rows.tsv` | the **envelope% / determination%** columns — ⚠ **the `grep -c` COUNT of `proven` does NOT change**; a wrong number is still a measured number |
| `tools/cold-start-probe/out/task2-pgm-cold-pipeline.json` | Sant Climent + Santa Coloma rows |

## Tier 2 — documents QUOTING those figures

| Document | Quoted figures at risk |
|---|---|
| **[ENVELOPE-REACHABILITY-TRACKER](./ENVELOPE-REACHABILITY-TRACKER.md) §8** | the whole per-municipality table · §8.3 `PLANTES` narrative |
| **[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md) §5** | ⛔ **NORMATIVE** — OV **3.22–59.73 %**, ladder **2.93–64.70 %**, and *"OV > ladder in 17 of 27"* |
| **[ES-REGIONAL-RANKING](./ES-REGIONAL-RANKING.md)** | Catalunya's row, and ⚠ **every cross-region maxima comparison** — Balears 74.1 % vs Catalunya was stated against these numbers |
| `docs/04-reference/jurisdictions/es/es-ct/…` | any per-municipality figure |

## Tier 3 — ⭐ the comparisons, which are the easiest to miss

- **Corbera 81.67 % · Castelldefels 73.70 % · L'Hospitalet 73.13 %** — quoted repeatedly as *"far above
  the one city you ship"*. ⚠ **L'Hospitalet carries NO FOOTNOTE, so it is in the SHOULD-MOVE set.**
- ⛔ **The Phase-4 reordering onto storeys→metres.** It rests on *"OV is ~10× the ladder in the cold
  cities"*. **A delta that shrinks OV shrinks the case for its own priority** — and the module being
  prioritised **IS** the defective one.
- **Balears 74.1 % vs Catalunya** — a cross-region ranking built on one side's uncorrected figures.

## ⭐ Tier 4 — what does NOT restate, stated so nobody over-corrects

- **`published` = 1.** Barcelona is unaffected; its table is signed law under SIG-2.
- **`proven` = 36.** ⭐ **`proven` means "computed from a seeded, re-runnable run", NOT "computed
  correctly".** The runs happened. The status vocabulary already distinguishes evidence from
  correctness — **do not silently demote 36 to hide a numeric error.**
- **Enumeration (36 / 27 / 26 / 25 / 22), the DGC/INE findings, the blank-`NOMMUNI` defect,
  `PLANTES` 100 % / 80.33 %.** None derive from the height table.
- **Barcelona byte-identical** — the Step 1 control stands.

---

## The rule this encodes

> ⭐ **A RESTATEMENT NAMED BEFORE THE MEASUREMENT IS A CORRECTION. ONE NAMED AFTER IT IS A CLEANUP.**

Six figures propagated wrongly through this corpus this week — the Córdoba 0/3 dissolve ceiling
propagated **six times**. **Each was found by accident.** This list exists so the next one is found by
design.

⚠ **AND THE DIRECTION MATTERS**: this error is **OPTIMISTIC** — it over-granted height. That is the
direction the programme has guarded all week, and it still got through, **because the wrong table was
read by a function that had no way to be told which municipality it was serving.**
