<!-- ─────────────────────────────────────────────────────────────────────────────
CITY `RATE.md` — THE MASTER COMPLETION SCORECARD (C63). This is the composite
"how complete is this city" face — the founder's "master RATE" (L-649). It is the
7-axis C63 scorecard; the per-axis `LEGISLATION-RATE.md` / `LOD-RATE.md` FEED it.
Naming rule: `RATE.md` is ALWAYS the composite master; `<AXIS>-RATE.md` is a
per-axis detail rate. See `../NAMING-CONVENTION.md`.

Copy this whole `_CITY/` folder into a municipality dossier and replace every
<PLACEHOLDER>. Delete these comments.

⚠ THE ONE RULE (C63 §1.1): every axis % is COMPUTED by the scorecard function from
inspectable state — NEVER hand-typed. Until the function has run for this city,
EVERY cell stays `not-assessed` + a typed C62 UnknownReason. `not-assessed ≠ 0 %`
(§1.2). A number you type by hand is the §CONTEXT-DATA-HONESTY violation this whole
scorecard exists to prevent.

The 7 axes + their definitions + inputs are FIXED and identical in every city —
see C63 §3. Do NOT redefine, add, or drop an axis.
────────────────────────────────────────────────────────────────────────────── -->
# City RATE — master completion scorecard — <PLACE> (<cc>-<subdiv>, <code>)

<!-- generated-by: MANUAL SCAFFOLD (scorecard function not yet run) — replace with
     `<!-- generated-by: scorecard vN <ISO-timestamp> -->` when computed (C63 §6). -->

**Overall completion: `not-assessed`** (`pending-implementation` — scorecard function not yet run for
this city). `partial: true`. **`honestyOk: true`** (renders no fabricated value; all unknowns are typed).

> **Weighting vector:** `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 ·
> ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).
> Overall = Σ(axis×weight) renormalised over the ASSESSED subset (C63 §1.5). With zero axes assessed,
> overall is honestly `not-assessed`, not 0 %. (Open: whether `derived-levels` earns partial HEIGHTS/LOD
> credit — a separate founder decision, C63 §3 Axis 6.)

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** — cadastre geometry quality | 15 % | `not-assessed` | `not-checked` | `not-queried` | run `computeParcelConfidence` over an N-parcel sample (C57 §2.4). |
| 2 | **LEGISLATION** — ordinance sourcing depth + VERIFY | 25 % | `not-assessed` | `not-checked` | `not-queried` | cited `SOURCES.md` rows ∩ signed `VERIFICATION.md` ÷ MUC clau inventory. |
| 3 | **DATA-SOURCES** — authoritative feeds wired | 15 % | `not-assessed` | `not-checked` | `not-queried` | `heightSources.mjs impl` + parcel `registry.ts` + zone-GIS + `bake.mjs REGIONS` + terrain DEM. |
| 4 | **ENVELOPE** — buildable-envelope solver coverage | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | `registry.ts packsByZone` × buildable-land share. |
| 5 | **TERRAIN** — baked quantized-mesh present + verified | 10 % | `not-assessed` | `not-checked` | `not-queried` | `terrain/<city>/layer.json` 200 + `terrain.verify.mjs` + white-mask flags. |
| 6 | **HEIGHTS/LOD** — measured vs estimated buildings | 10 % | `not-assessed` | `not-checked` | `not-queried` | baked PMTiles `heightProvenance` histogram at city bbox (`tagged` fraction). |
| 7 | **CONTEXT** — feature-layer checklist (of 9) | 5 % | `not-assessed` | `not-checked` | `not-queried` | probe `{buildings,roads,water,parks,landuse,rail,trees,pedestrian,sea}` at bbox. |

<!-- When an axis IS computed, replace `not-assessed` with the 0–100 % the function emitted, set the
     validation state (C63 §1.6 — `human-reviewed` for legislation/envelope needs a signed
     VERIFICATION.md), drop the unknown reason, and fill the derivation with the actual N / registry
     rows / probe result. The number must match the scorecard function output, byte for byte. -->

## §CLOSURE — how far is this city from CLOSED? (mandatory, trackable)

> **Ratified 2026-08-01 (L-662).** `RATE.md` answers *"how complete is this city?"*. It did **not**
> answer *"how close is it to DONE?"* — and those are different questions, because **100 % is not the
> target and never was**. Most cities have a **ceiling below 100 % fixed by law**, not by effort.

### The definition — a city is **CLOSED** when ALL FOUR hold

1. **Every axis is MEASURED** — no axis sitting at `not-assessed`. (`not-assessed ≠ 0 %`, and it also
   ≠ *done*: an unmeasured axis is an unknown, not an achievement.)
2. **Every axis is AT ITS CEILING** — the ceiling being the maximum the *law and the published data*
   permit, stated and cited per axis below.
3. **Every remaining gap is STRUCTURAL, not effort** — i.e. closing it would require a document that
   does not exist, a discretionary determination, or a legal act outside PRYZM. **No open gap of type
   `EFFORT` may remain.**
4. **`honestyOk: true`** — every refusal correctly cited and correctly *attributed*. A wrong-jurisdiction
   or wrong-reason refusal blocks closure even at a high score, because it is a **wrong answer**.

⚠ **A city may be CLOSED at 60 %.** Closure is *"we have taken this city as far as the law allows"*,
not *"we scored highly"*. Conversely a city at 90 % with one `EFFORT` gap is **NOT closed**.

### Gap-type vocabulary (use exactly these)

| Type | Meaning | Counts against closure? |
|---|---|---|
| `EFFORT` | we can close it — engineering or transcription we have not done | **YES** |
| `STRUCTURAL-LAW` | the instrument delegates / states nothing / is discretionary | no |
| `STRUCTURAL-DATA` | the authoritative data is not published, or is access-gated | no |
| `UNMEASURED` | nobody has run the probe — **an unknown, never a zero** | **YES** |
| `SIGNATURE` | built and verified; awaiting the founder's L-449 legal act | **YES** (until signed) |

### The closure table — keep this current

| Axis | W | Measured today | **Ceiling (cited)** | Gap | Gap type | What closes it |
|---|---:|---|---|---:|---|---|
| LEGISLATION | 25 | `<x>` | `<y>` — *why, cited* | `<y−x>` | `<type>` | `<the one named action>` |
| ENVELOPE | 20 | `<x>` | `<y>` — *why, cited* | | | |
| PARCEL | 15 | `<x>` | `<y>` | | | |
| DATA-SOURCES | 15 | `<x>` | `<y>` | | | |
| HEIGHTS/LOD | 10 | `<x>` | `<y>` | | | |
| TERRAIN | 10 | `<x>` | `<y>` | | | |
| CONTEXT | 5 | `<x>` | `<y>` | | | |
| **CITY** | 100 | **`<composite>`** | **`<ceiling>`** | | | |

**Closure verdict:** `OPEN` | `CLOSED` · **Blocking gaps:** `<count of EFFORT + UNMEASURED + SIGNATURE>`

⚠ **Every ceiling must be CITED, not estimated.** *"~70 % because 62.8 % of city land is `PD*`
(derived-plan governed), measured live 2026-07-31"* is a ceiling. *"~70 %"* alone is a guess, and a
guessed ceiling lets a city be declared closed while real work remains.

⚠ **The three L-656 metrics are DIFFERENT and must not be merged into this table**: *axis score*
(buildable-land denominator) · *click coverage* (all clicks) · *answer correctness* (all clicks). This
table scores the **first**. A city can be ~100 % on the third while its ENVELOPE axis sits at 56 % —
both true, neither a contradiction.

## §CONTEXT-DATA-HONESTY note (mandatory)

Completion (how much is done) and honesty (do we fabricate) are two different questions (C63 §3.1). This
city may score LOW on completion and remain 100 % honest — e.g. every buildable clau returns a **cited
refusal**. `honestyOk` flips `false` ONLY if a value is rendered where the state says unknown. State
here, in one line, what this city currently DOES vs REFUSES vs LEAVES-UNKNOWN: `<…>`.

## Dossier index — what each sibling file is about (C63 §5)

This `RATE.md` is the composite master; the files below are the evidence + the per-axis detail rates that
FEED it. (Naming rule: `RATE.md` = composite master · `<AXIS>-RATE.md` = per-axis detail rate · see
`../NAMING-CONVENTION.md`.)

| File | What it is about | Feeds axis |
|---|---|---|
| **`RATE.md`** (this file) | the 7-axis composite completion scorecard — the master "how complete is this city" | — (composes all 7) |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (the C58/L-449 comparable ruler — zone+density+height without a PDF) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | building/terrain LOD sub-rate (can we obtain a faithful physical model?) | HEIGHTS/LOD |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (ADR-0279 standard) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (BUILDING-HEIGHT-REPLICATION-STANDARD) | HEIGHTS/LOD |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · TRIP-WIRES · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | fail-safe risk log (the honesty guardrails) | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the phased plan to raise the master RATE toward 100 % | LEGISLATION (+ all) |
| `sources/` | per-field citations (`SOURCES.md`) + human sign-off (`VERIFICATION.md`, L-449 gate) | LEGISLATION · ENVELOPE |
| `findings/` | substantive L-NNN investigation records | — |

## What moves each axis (link, do not restate)

- PARCEL → `NEXT.md` §parcel · LEGISLATION → `LEGISLATION-RATE.md` + `RATE-IMPLEMENTATION-PLAN.md` + `sources/`
- DATA-SOURCES → `../../GEO-DATA-SOURCING-MASTER.md` · ENVELOPE → `ENVELOPE.md`
- TERRAIN → `../../../CONTEXT-DATA-TERRAIN.md` · HEIGHTS/LOD → `HEIGHT.md` + `LOD-RATE.md` + `../../../BUILDING-HEIGHT-REPLICATION-STANDARD.md`
- CONTEXT → `../../../CITY-REPLICATION-STANDARD.md` §3

<!-- Link-depth key (this file = docs/04-reference/jurisdictions/_TEMPLATE/_CITY/RATE.md):
     ../../ = jurisdictions/ · ../../../ = 04-reference/ · ../../../../ = docs/ -->

---
*Last updated: <YYYY-MM-DD>. Maintainer: <UNASSIGNED>. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) + [SPEC-CITY-COMPLETION-SCORECARD](../../../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md).*
