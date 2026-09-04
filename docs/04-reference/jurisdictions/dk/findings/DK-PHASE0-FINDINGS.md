# DK PHASE 0 — D1–D6 MEASURED

> **Lane** ENVELOPE-NLDK · **measured** 2026-09-03 (samples) / 2026-09-04 (gates + reduction)
> **Spec** [`DK-ENVELOPE-MASTER-PROMPT.md`](../DK-ENVELOPE-MASTER-PROMPT.md) — the 20 determinations
> and 8 RULES. ⚠ That prompt is **TRUNCATED mid-Part-10**; nothing here reconstructs the missing tail.
> **Machine-readable** [`dk-phase0/dk-phase0-report.json`](dk-phase0/dk-phase0-report.json),
> [`dk-phase0-gates.json`](dk-phase0/dk-phase0-gates.json)

The DK prompt states no lettered M-list, so Phase 0 was framed as **D1–D6**: the subset that
decides the shape of the Danish product *and* is runnable **keyless** today.

---

## 0 · ⚠ SCOPE — read before quoting any figure

Every number below is scoped to **the adopted Plandata planning stack reachable without
credentials**, plus DAWA's Matriklen mirror. It contains **no BBR, no DHM terrain, no
environmental / heritage / road overlay, and no Datafordeler anything.**

**None of these figures is a statement about Danish data coverage in general.**

| stratum | n | note |
|---|---|---|
| land | 500 | tile-uniform over the DK land bbox |
| urban | 154 | dense oversample (≥ 12 parcels/tile); **96 of 250 requested skipped** — `no-dense-tile-after-40-tries`, i.e. Denmark simply has fewer dense tiles than the sampler's budget found |

**Commands:** `node dk-phase0-parcels.mjs --n=500 --seed=20260903 --out=dk-phase0-sample-land.json`
(and `--minTileParcels=12` for urban) · `node dk-phase0-gates.mjs` · `node dk-phase0-reduce.mjs`.

---

## 1 · The gate probe — R2 answered by measurement, not by reading the repo

`DK-DATA-GAP-AUDIT.md` §1.1 records a live contradiction between two repo files about the
Datafordeler gate. Neither could settle it; only a probe could.

**Credential-gated (recorded verbatim, never as a coverage verdict):**

| status | target |
|---|---|
| **401** | `datafordeler-MAT-wfs-anon` — **Matriklen, the parcel path** |
| **401** | `datafordeler-GeoDanmark-wfs-anon` |
| **403** | `datafordeler-BBR-anon` — *"(403) Unauthorized access"* |
| **404** | `datafordeler-DHM-wcs-anon` |

⚠ **The lane brief's warning that anonymous Datafordeler probes "return HTTP 404" holds only for
DHM.** MAT and GeoDanmark answer **401** and BBR **403** — the gate *saying so*. The product
conclusion is unchanged and unaffected: **the DK parcel path is credential-gated. That is a
BLOCKER, and it must never be reported as "no data."**

**Keyless and LIVE — the ground this sample stands on:**

| status | target |
|---|---|
| 200 | `plandata-wfs-capabilities` — 227,556 B, WFS 2.0.0 GetCapabilities |
| 200 | `dawa-jordstykker-point` — Matriklen mirror incl. `visueltcenter` |

**Newly measured, not previously recorded in any DK doc — four Part 5–10 sources are NOT reachable
at the URL this lane could derive:**

| status | target | master part |
|---|---|---|
| 404 | `miljoeportal-arealdata-wfs` | Part 6 — the **entire** environmental overlay stack |
| 404 | `slks-fbb-wfs` | Part 7 — heritage / FBB |
| ERR | `ler-openapi` (fetch failed) | Part 9 — utilities |
| 404 | `dawa-bbr-probe` | BBR-light |

⚠ Per **R2** these are **UNVERIFIED-ENDPOINT, not ABSENT-DATASET.** A 404 is a fact about the URL
this lane guessed, and guessing again is what R2 forbids. The correct next step is
GetCapabilities/OpenAPI discovery from the authority's own catalogue. Recorded so the next lane
does not re-derive the same four dead URLs.

---

## 2 · D1 — ladder coverage

| rung | land (n=500) | urban (n=154) |
|---|---|---|
| byggefelt | 2.0 % | 7.8 % |
| lokalplandelområde | 6.8 % | 33.1 % |
| lokalplan | 10.8 % | 43.5 % |
| kommuneplanramme | 18.4 % | 77.3 % |
| **any adopted instrument** | **18.8 %** | **78.6 %** |

---

## 3 · D2 — structured-field fill, per rung

| rung | maxbygnhjd | bebygpct | maxetager | eareal | m3_m2 |
|---|---|---|---|---|---|
| byggefelt | **6.7 % / 6.3 %** | 0 % / 0 % | 20.0 % / 12.5 % | 0 % | 0 % |
| delområde | 45.2 % / 44.8 % | 45.2 % / 44.8 % | 38.1 % / 53.7 % | 9.5 % / 3.0 % | 9.5 % / 1.5 % |
| lokalplan | 14.9 % / 13.6 % | 19.4 % / 13.6 % | 20.9 % / 11.1 % | 3.0 % / 1.2 % | 1.5 % / 2.5 % |
| **kommuneplanramme** | **60.7 % / 74.1 %** | 59.8 % / 60.7 % | 61.6 % / 71.9 % | 1.8 % / 1.5 % | 1.8 % / 0.7 % |

⭐ **The ladder inverts.** The *geometrically* strongest rung (byggefelt — the plan drew the
footprint) is the *numerically* weakest: a max height on 1 of 15 land and 1 of 16 urban features.
The weakest rung (kommuneplanramme, a coarse framework polygon) is the best filled. A naive
"walk down the ladder until something answers" therefore reaches its numbers at the least
specific tier — which is correct behaviour, but it must be *labelled* as coarse, not as a
lokalplan answer.

---

## 4 · D3 — `bebygpctaf`: ⭐ THE DENOMINATOR IS DENMARK'S BINDING CONSTRAINT

Master §4.3: *"resolve the area-basis codes — NEVER calculate volume/floor area before the
denominator is resolved."*

The codelist is **imported from the state register**, not invented
(`packages/schemas/src/siteintel/vocabularies/dk.ts`, `pdk:theme_pdk_codelist_bygberegnaf_v`), and
the code→scope mapping is already **signed under L-449**:

| code | Danish | scope | per-parcel multipliable? |
|---|---|---|---|
| 1 | Området som helhed | planningArea | ❌ shared budget |
| 2 | Den enkelte ejendom | property (BFE, may span several matrikler) | ❌ PRYZM lacks the boundary |
| 3 | Den enkelte grund | parcel | ✅ |
| 4 | Det enkelte jordstykke | parcel | ✅ |

**Parcel-scoped (3\|4), and therefore legally multipliable:**

| rung | land | urban |
|---|---|---|
| kommuneplanramme | 20/67 = **29.9 %** | 25/82 = **30.5 %** |
| lokalplan | 3/13 = 23.1 % | 3/11 = 27.3 % |
| delområde | 3/19 = 15.8 % | 2/30 = 6.7 % |

**Raw code distribution:** land `1`:32 `2`:41 `3`:15 `4`:11 · urban `1`:21 `2`:71 `3`:13 `4`:17.

⭐ **The single commonest code is 2 — "Den enkelte ejendom".** It is ~40 % of every populated
`bebygpct` in the country. Those are refused today because PRYZM does not hold the *ejendom*
boundary. **BFE → ejendom geometry is therefore the highest-value DK unlock available: it converts
~40 % of all populated building percentages from refusal to computation.** It sits behind the
Datafordeler 401. **That makes it a CREDENTIAL blocker, not an engineering one.**

> ⚠ **The first version of this reduction reported "0.0 % parcel-scoped" on every rung** — a clean,
> plausible, entirely false number meaning "Denmark publishes no usable denominator anywhere". The
> classifier pattern-matched Danish *prose*; `bebygpctaf` carries an *integer*. A wrong-PROPERTY
> probe error. The fix was not to guess what 1–4 mean — the repo already held the codelist and the
> signed mapping, and had not been grepped. *Grep for the existing solver first.*

---

## 5 · D4c — ⭐ `iomfangreg` IS AN EXCEPTIONLESS NEGATIVE PREDICTOR (183/183)

`iomfangreg = true` means *"the structured fields do NOT fully represent the regulation"*.
`DK-DATA-GAP-AUDIT.md` §1.2 ranks "the shipped mapper reads it NOWHERE" as gap **#2**, framed as an
**overstatement** exposure.

Measured across all 8 rung × stratum cells:

| | maxbygnhjd | bebygpct | maxetager |
|---|---|---|---|
| `iomfangreg = true` (n=183) | **0/183** | **0/183** | **0/183** |
| `iomfangreg = false` | 25–80 % | — | — |

**The feared overstatement does not occur.** Danish municipalities use the flag consistently: when
they say the fields do not represent the rule, they leave the fields empty. Reporting this as a
live vulnerability would have been **stale-pessimistic** — budget spent on a problem the data says
is not there.

⭐ **What the flag actually is, and why it is worth more than the audit thought.** It is the one
field Denmark publishes that **EXPLAINS AN ABSENCE**. Without it, a null `maxbygnhjd` has three
indistinguishable causes:

1. the plan regulates bulk, in prose, in the PDF → extraction failure, `mechanism: 'present'`
2. the plan genuinely does not regulate bulk here → **F1, a real gap**
3. our request failed, or we never asked → `mechanism: 'unknown'`

`iomfangreg = true` picks out **(1)**, on the register's own authority. **That is Denmark's F1
discriminator** — the separation the NL and NSW audits both name as their open gap, handed to us
as a published boolean — and it covers **61.2 % of lokalplan features** (41/67 land, 61/79 urban).

The product consequence is a **refusal-quality** upgrade: PRYZM stops saying *"no height
available"* (about us) and starts saying *"this lokalplan DOES regulate building extent — in the
plan document, not in the queryable fields"*, with the doklink. A user can act on the second.

**Other flags** (land / urban, % true): `izonereg` 100 % / — on byggefelt · `iudstykreg` 100 % ·
`bygvejledende` 73.3 % · `bygkunifelt` 13.3 % · **`kompleks` 0 % on every rung** — so the
"route to legal interpretation" branch is **untested against live positives**, and that is stated
rather than hidden.

---

## 6 · D5 — zone, and the composite codes that break R8

`zone` is an integer **and** the register serves the verbatim Danish label in `zonestatus`, so the
meaning is **evidenced, never guessed**:

| code | zonestatus | observed |
|---|---|---|
| 1 | Byzone | 51 land / 62 urban |
| 2 | **Landzone** | 1 / 3 |
| 3 | Sommerhusområde | 6 / 9 |
| 4 | **Byzone og landzone** | — / 2 |
| 7 | **Byzone, landzone og sommerhusområde** | 1 / — |

⚠ **Codes 4 and 7 are COMPOSITE** — a single feature spanning several zone regimes. Collapsing
either to "byzone" would silently convert a landzone parcel — where a *landzonetilladelse* is
**required** — into an unconditional one. That is exactly **R8 (CONDITIONAL ≠ ALLOWED)**, and
**landzone is not automatic no-build**: it is CONDITIONAL. Codes 5 and 6 were not observed.

---

## 7 · D6 — the deterministic / conditional / unresolved partition (determinations 16–18)

| class | land (n=500) | urban (n=154) |
|---|---|---|
| no plan at the point (F1 **or** F2 — not yet separated) | 406 | 33 |
| plan present, **no usable number** | 52 | 56 |
| partial — height only, **pct denominator unusable** | 16 | 35 |
| partial — height only | 15 | 20 |
| **DETERMINISTIC — height AND parcel-scoped pct** | **10 (2.0 %)** | **9 (5.8 %)** |
| partial — pct only | 1 | 1 |

⚠ **"No plan at the point" is not yet split into F1 and F2**, and the brief requires that split.
Doing it needs a land-cover/《use》 join this keyless sample does not carry. **Named as owed, not faked.**

---

## 8 · The eight non-negotiables — status

| rule | status |
|---|---|
| **R1** authoritative sources first | ✅ Plandata + DAWA only; no OSM/Google as legal geometry |
| **R2** never invent an endpoint | ✅ every probe recorded verbatim with its URL; 4 dead URLs marked **UNVERIFIED-ENDPOINT**, not absent |
| **R3** current vs legacy | ⚠ **OPEN** — this lane used the legacy keyless WFS deliberately for Phase 0. Long-term build must target GraphQL + file download. Not resolved. |
| **R4** DATA ≠ LEGAL EFFECT | ✅ `bebygpct = 40` measured as "field populated", never as "40 % buildable"; D3 measures the denominator that decides usability |
| **R5** PHYSICAL ≠ LEGAL | ⚠ **NOT EXERCISED** — DHM is 404/credential-gated, so no terrain was read and `physical_terrain_reference` vs `legal_height_reference` was not tested against data |
| **R6** EXISTING ≠ PERMITTED FUTURE | ⚠ **NOT EXERCISED** — BBR is 403 |
| **R7** INDICATIVE ≠ BINDING | ✅ `bygvejledende` measured (73.3 % of byggefelt); the shipped `dkByggefeltBinding.ts` already draws the binding/maximum distinction |
| **R8** CONDITIONAL ≠ ALLOWED | ✅ composite zone codes kept as pairs (§6); landzone treated as CONDITIONAL |

---

## 9 · What was BUILT

| module | drives | tests |
|---|---|---|
| `rulepacks/dkOmfangRegulation.ts` | D4c — the F1 discriminator. Three-valued flag read (absence is **never** `false`); `iomfangreg=true` → `unrecovered`/`pdf`/**`mechanism:'present'`**; `kompleks=true` → legally grounded refusal; `iomfangreg=false` **with no numbers** → a **named ambiguity** PRYZM refuses to resolve, because it is consistent both with a correct null and with a data-entry omission. | `__tests__/dkOmfangRegulation.test.ts` (15) |

Projects onto the shared `RuleState` vocabulary — adopted from ENVELOPE-FR, not re-minted.

## 10 · NOT built, and the blockers

- **F1/F2 split of the 406 + 33 "no plan at the point" parcels** — needs a land-cover join. Owed.
- **Overlay classification EXCLUSION | CONDITIONAL | SCREENING | INFORMATIONAL** (Part 6). **Blocked:**
  the Miljøportal Arealdata WFS 404s at the derived URL, and R2 forbids guessing another.
- **`bebygpctaf = 2` (ejendom) computation** — **blocked on the Datafordeler credential (401)**, and
  it is the highest-value unlock in the country (~40 % of populated `bebygpct`).
- **Terrain / niveauplan (R5)** — blocked on DHM (404 anonymous).
- **BBR existing-state (R6)** — blocked (403).
