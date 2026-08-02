# VERIFICATION — Murcia (es-mc, 30030) — the human sign-off ledger

## ✍ SIG-MU2 · **SIGNED 2026-08-02** · the ANCHO-DE-CALLE constructed street width (`RC` · base `RM` · `RN` · `RD1`+1)

| | |
|---|---|
| **Verifier** | **Founder (repo owner)** |
| **Date** | **2026-08-02** |

**THE DECISION, VERBATIM:**

> **Decision: Approve.** PRYZM may publish a computed envelope for RC, RM, RN and RD1 third-storey
> eligibility using a constructed street width, provided the output is classified as
> `estimated-ruleset` and cites Arts. 5.3.3, 5.5.3, 5.7.3 and 5.9.3.

**⭐ THE RATIONALE — CORRECTED 2026-08-02 (founder), AND THE CORRECTION IS THE RECORD.**

The original wording rested on a claim about the ordinance that turned out to be false. It is kept
visible below, struck through, because **a signature ledger that quietly edits its own reasoning is
not a ledger.**

> ~~*"The ordinance makes street width the legal criterion. **It does not prescribe a measurement
> methodology.** Computing that width from authoritative geometry is an implementation of the
> ordinance, not a modification of it. The legal rule remains unchanged; only the measurement is
> derived."*~~
> **← SUPERSEDED.** Art. 4.5.3 *does* prescribe a methodology (see below). Founder, on being shown
> the finding: *"The report changes SIG-MU2. Originally the reasoning was 'the ordinance does not
> prescribe a methodology.' **That is now false.** The better signature is stronger."*

**THE OPERATIVE RATIONALE, VERBATIM (founder, 2026-08-02):**

> *"The ordinance prescribes the governing measurement (mean width between parcel alignments over
> the block segment). PRYZM implements the same legal datum using published alignment geometry.
> Where implementation differs (median vs arithmetic mean, corner selection policy), PRYZM
> **intentionally under-grants** and records the deviation."*

**Why the corrected wording is STRONGER, not weaker:** the original claimed a gap in the ordinance
and filled it. The corrected one claims **we implement the ordinance's own stated datum** —
*«ancho entre alineaciones de parcela»*, Art. 4.5.3 — with every divergence named and provably
conservative. That is a claim about fidelity to the instrument, not about its silence.

#### The two recorded deviations — both UNDER-grant, neither over-states

| # | Art. 4.5.3 / 4.5.4 require | PRYZM computes | direction | where |
|---|---|---|---|---|
| **D1** | **arithmetic mean** of the width over the whole *tramo*, *«hasta completar la manzana»*, weighted **×1.50** toward the wider part where the width varies 25–50 % | **median of 5 rays across one block edge** | **UNDER-grant** — the ×1.50 weighting can only raise the governing width, and a per-edge median ignores wider parts of the same tramo | `geometry/streetWidth.ts` |
| **D2** | Art. 4.5.4: on a corner solar, *«se tomará la altura correspondiente a la calle de **mayor ancho**»* | `governingStreetWidth` takes the **narrowest** facing street | **UNDER-grant** — we apply the lower of the two heights the ordinance offers | `governingStreetWidth` |

⚠ **Neither deviation may be "fixed" by editing `governingStreetWidth` in place.** It is shared with
Barcelona, whose PGM Art. 327 resolves corners the *other* way. The founder's own architecture answer
is that **corner policy must be a PARAMETER, not embedded** — carried as `governingFrontage(…,
policy)` in [ADR-0289](../../../../../02-decisions/adrs/ADR-0289-geometry-derived-ordinance-variable-engine.md) §3.1.
Until that lands, D1 and D2 stand as declared, conservative deviations.

**THE SCOPE, VERBATIM:**

> *"This signature approves the methodology, not every individual parcel outcome. Individual results
> remain contingent on the quality of the underlying geometry and the resolver's conservative
> refusal policy."*

### THE FOUR BINDING CONDITIONS — each pinned by a named test

These are acceptance criteria, not advice. **If a block below goes red the signature's premise no
longer holds and the envelope must stop publishing.** Tests live in
`packages/site-parcel-data/__tests__/murciaStreetWidth.test.ts`, one `describe` per condition.

| # | Condition (founder's wording) | How it is met | Pinned by |
|---|---|---|---|
| **1** | *computed reproducibly from authoritative geometry* | pure arithmetic on `Murcia:pgou_alineaciones`; the fetch is injected so a captured fixture reproduces a live answer | `describe('SIG-MU2 CONDITION 1 …')` — 4 tests, incl. 8 identical runs and a feature-order-independence check |
| **2** | *explicitly labelled constructed, not an official municipal measurement* | `provenance: 'measured-geometry'` + `MURCIA_STREET_WIDTH_AUTHORITY` carried as **data**, folded into the pack's `ordinanceRef` so it reaches the card (**ADR-0286**) | `describe('SIG-MU2 CONDITION 2 …')` — 3 tests |
| **3** | *the applicable article(s) accompany every result* | every band carries its article + verbatim quote; **refusals name their article too** | `describe('SIG-MU2 CONDITION 3 …')` — 2 tests |
| **4** | *refuse where measurement uncertainty could change the applicable band* | `effectiveBandEdgeGuard_m` (**ADR-0287**), widened by the measurement's own `spread_m`, never narrowed | `describe('SIG-MU2 CONDITION 4 …')` — 8 tests, incl. **both** ordinance quirks below |

⚠ **Condition 4 is tested across the two quirks the transcription found**, because those are exactly
where a lazy guard would leak: the **4 m boundary flips inclusivity** between Art. 5.3.3
(*«menores de 4»*) and Art. 5.7.3 (*«menores o iguales a 4»*), and the bands **overlap at 8.00 m**
with Art. 1.1.4 resolving *down*. A MEASURED 8.00 m must refuse; only an *ancho oficial* — which
Murcia does not publish — may take the resolve-down path.

### AUTHORISES

Publication for **`RC`, base `RM`, `RN`** at **`estimated-ruleset`**, cited to Arts. 5.3.3 / 5.5.3 /
5.7.3, where the calificación sits on **non-delegated** soil. Wired in
`applyMurciaZoningThenFallback` behind `refusal.legallyGrounded === false` — the flag that is
`true` on every delegation refusal, so the branch is **structurally incapable** of publishing on the
67 % the PGOU delegates.

### DOES NOT AUTHORISE — equally binding

- **`RD1`.** In scope of the signature, and the table + tests exist — but it is **NOT dispatch-wired**
  and `MURCIA_ANCHO_ZONE_CODES` excludes it. `RD1` already publishes 2 plantas / 7 m today, so
  wiring it means *intercepting working output* to raise it; that deserves its own pass and its own
  regression evidence. Until then the allowance is simply not granted. **Under-granting is the safe
  direction.**
- **the 67 % delegated land.** Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.3 are terminal; no signature reaches them.
- **`MZ` / `MX`.** `MZ`'s footprint is expressly delegated to an Estudio de Detalle (Art. 5.6.3) — a
  height with no footprint is not an envelope. `MX` needs a *frontage class*, not a width.
- **`RM1` / `RM2`**, which Art. 5.5.3 EXEMPTS from the table and which are packed at stated values.
- **any tier above `estimated-ruleset`.** **ADR-0285: a signature on METHODOLOGY does not promote the
  tier.** `authoritative` stays UNREACHABLE per SIG-MU1.
- **snapping a measured width to a quantum** — see the snap gate below.

### ⚠ WHAT ACTUALLY SHIPPED — MEASURED, and it is roughly half the gross

**Do not quote the 8.81 pp gross or the 32.32 % upper bound as delivered coverage.** Founder,
same day: *"Publish measured coverage only. Never publish theoretical maximums."*

Measured by `tools/murcia-street-width-probe/probe.mts` (area-weighted sample, n = 150 rings,
0.590 km² of the 7.845 km² RC/RM/RN population, seed 20260802, run against the live GeoServer
through the production resolvers):

| outcome | area share of sampled RC/RM/RN land |
|---|---:|
| **RESOLVES — an envelope publishes** | **51.3 %** |
| refused `band-edge` (condition 4 working) | 44.6 % |
| refused `no-opposing-frontage` | 3.4 % |
| refused `needs-eje-comercial` | 0.7 % |

⭐ **The 44.6 % is the headline finding, and it is a property of MURCIA, not of the code.** Art.
5.3.3's decisive threshold is **8 m**, and the median measured Casco street section is **8.78 m** —
the ordinance's band edge sits in the *middle* of the city's actual street-width distribution, the
worst possible place for it. Condition 4 therefore bites hard here and would bite far less in a city
whose streets cluster away from its thresholds.

### THE SNAP GATE (ADR-0275) — run for Murcia, verdict recorded below

*Cluster ⇒ ship the snap. No cluster ⇒ do not ship it, fall back to the raw measured width and say
so.* The quantum set is **city-specific** (Barcelona has no 10/15/25 m quantum; its nominal 50 m
arteries measure 48 m), so Barcelona's set may not be assumed. Result:
`tools/murcia-street-width-probe/snapGate.mts` — **see `../ENVELOPE.md` §3.3.3.**

### ⚠⚠ PREMISE DEFECT FOUND AFTER SIGNING (2026-08-02) — recorded here, not buried in a findings file

The signature's rationale states the ordinance *"does not prescribe a measurement methodology."*
**Art. 4.5.3 does prescribe one**, and it was not read before signing because it sits in Título 4
(general height rules), not in the Título 5 zone articles every quote came from:

> «el ancho de las vías públicas será el que conste en los planos de ordenación (**ancho entre
> alineaciones de parcela**) … **a)** Aplicación estricta de la **regla de media aritmética** …
> **hasta completar la manzana** … **ii)** … se le aplicará el **índice 1,50** …»

- ✅ **The INPUT is confirmed by the ordinance's own words** — *ancho entre alineaciones de parcela*
  is precisely what `resolveMurciaStreetWidth` measures, from the layer that publishes those
  alignments.
- ⚠ **The AGGREGATION diverges.** Art. 4.5.3 wants an arithmetic mean over the *tramo*; we take a
  per-edge median. **Art. 4.5.4** gives a corner solar *«la altura correspondiente a la calle de
  mayor ancho»*; `governingStreetWidth` takes the **narrowest**.
- **Both divergences UNDER-grant**, so nothing published is over-stated and no envelope must be
  withdrawn. But **SIG-MU2's stated rationale is not accurate for Murcia**, and a signature should
  rest on a true premise.

`status: open · severity: under-publication + premise-defect · owner: founder · exit: either restate
the rationale as "the ordinance prescribes a method we implement conservatively and divergently, and
the divergence is declared", or implement Art. 4.5.3's aggregation and Art. 4.5.4's corner rule.`

⚠ Do **not** fix the corner rule by flipping `governingStreetWidth` to widest — it is shared with
Barcelona, whose Art. 327 resolves corners the other way. It needs a per-jurisdiction policy
(ADR-0289 §3.1).

### Reversal

Flipping this back withdraws a published determination; route it through the founder exactly as the
signature came.

---

## ⛔ ~~SIG-MU2 (draft)~~ — superseded by the signed block above

| | |
|---|---|
| **Verifier** | — (~~awaiting the founder~~ — **SIGNED, see above**) |
| **Axis** | ENVELOPE (and, downstream, LEGISLATION) |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esMurciaAnchoDeCalle.ts` — 4 tables, 9 bands, each with its article and a verbatim quote |
| **Source** | the **filed** [`../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf`](../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf) (SHA-256 `ab71c651…`), Arts. **5.3.3 · 5.5.3 · 5.7.3 · 5.9.3** — all four **byte-identical** in both published consolidations ([`../corpus/INDEX.md`](../corpus/INDEX.md) §2) |
| **Tests** | `packages/site-parcel-data/__tests__/murciaAnchoDeCalle.test.ts` — 20, green |

**The question to be signed:** *may PRYZM publish a computed envelope for `RC`, base `RM`, `RN` and
`RD1`'s third storey, where the storey band is chosen by a **CONSTRUCTED** street width, at
`estimated-ruleset`, cited to these articles?*

**WHAT IT WOULD AUTHORISE — the arithmetic, and it is the largest single envelope win on the board:**
`RC` (1.650 km²) + base `RM` (4.790) + `RN` (0.180) = **6.620 km² = 8.81 pp of the 75.145 M m²
buildable denominator** — exactly the slice `ENVELOPE.md` §3.3 names. Added to today's 23.51 %:

| | share of buildable land | ENVELOPE axis (× 0.4 `estimated-ruleset`) |
|---|---:|---:|
| today (SIG-MU1 only) | 23.51 % | **9.40 %** |
| SIG-MU2 signed **and wired**, best case | **32.32 %** | **12.93 %** |
| the arithmetic ceiling (33.00 % PGOU-direct) | 33.00 % | 13.20 % |

⚠⚠ **32.32 % IS AN UPPER BOUND, NOT A FORECAST, AND IT WILL NOT ALL BE REALISED.** The resolver
REFUSES on `band-edge` (a measured width within the effective guard of a boundary) and
`measureStreetWidths` refuses on `inconsistent` / `no-opposing-frontage`. **The refusal rate on
Murcia geometry is UNMEASURED** — it has not been run live, because the fetch does not exist yet.
Quoting 32.32 % as achieved would be the §SIZE-IS-NOT-PROVENANCE error one field over. Measure the
realised share with the crosstab before publishing any figure.

**WHAT IT WOULD NOT AUTHORISE:**
- the **67 % delegated** land. No signature reaches it; Arts. 5.25.3.3 / 5.26.3.3 are terminal.
- `MZ` and `MX`. `MZ`'s footprint is **expressly delegated** to an Estudio de Detalle (Art. 5.6.3)
  and a height with no footprint is not an envelope; `MX` needs a *frontage class*, not a width.
- **`RM1` / `RM2`**, which the ordinance EXEMPTS from the table («Se exceptúan de esta regla las
  manzanas calificadas RM1 y RM2…») and which are already packed at stated values. Routing them
  through a constructed width would re-derive a STATED number from an ESTIMATED one.
- promotion above **`estimated-ruleset`**. The table is `ordinance-pdf`; **the width is not.**

**⚠ THE TWO PRECONDITIONS, NEITHER DISCHARGED — do not sign until both are:**
1. **THE FETCH DOES NOT EXIST.** `measureStreetWidths` needs our alineación ring *and the
   neighbouring rings across the street*. `/api/es/murcia-pgou` resolves a **point**; this needs a
   **bbox** query of `Murcia:pgou_alineaciones`. Until then the resolver has no input and signing
   would authorise something that cannot run. (Base `RM` above 12 m additionally needs
   `Murcia:pgou_eje_comercial`, which IS published — see [`../corpus/RETRIEVAL-LOG.md`](../corpus/RETRIEVAL-LOG.md) §3.)
2. **ADR-0275's SNAP GATE IS UNRUN FOR MURCIA.** *Cluster ⇒ ship the snap; no cluster ⇒ ship the raw
   measured width and say so.* The quantum set is **city-specific** and Murcia is not among the five
   cities probed in [`../../SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`](../../SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md).
   Assuming Barcelona's quanta would be the L-529 failure repeated.

**⚠ THE PROVENANCE SPLIT IS THE POINT OF THIS SIGNATURE.** The BANDS are `ordinance-pdf`; the WIDTH
is `estimated` (`measured-geometry`). `MurciaAnchoResolution` carries both separately and the card
must render both — a constructed input shown as a stated one is L-459, and ADR-0271 exists to keep
exactly this line. **Signing the TABLE does not certify the WIDTH.**

---


## ✍ SIG-MU1 · **SIGNED 2026-08-01** · PGOU TR dic-2012 envelope — `MURCIA_ENVELOPE_VERIFIED`

| | |
|---|---|
| **Verifier** | Founder (repo owner) |
| **Date** | 2026-08-01 |
| **Act** | *"I sign up all: now"* — given after the measured coverage, the delegation split and the badge precondition were put in front of the founder |
| **Axis** | ENVELOPE |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esMurciaEnvelope.ts` → `MURCIA_ENVELOPE_VERIFIED` (**now `true`**) |
| **Source** | *PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido, diciembre 2012*, **Volumen 11 — Normas Urbanísticas** (Ayuntamiento de Murcia; `urbanismo.murcia.es`) |

**The question signed:** *may PRYZM publish a computed envelope for a packed calificación that sits on
NON-delegated Murcia soil, at `estimated-ruleset`, cited to the PGOU Texto Refundido?*

**AUTHORISES:** publication on the **23.51 %** of Murcia's buildable land (denominator **75.145 M m²** —
L-656: buildable land, *not* all land, *not* clicks) where one of the 14 transcribed calificaciones
(`RL RD RD1 IX RF RG IC RH MC IG AJ RM1 RM2 MG`) meets non-delegated soil. Measured by the committed
`calificacion` × `clase-de-suelo` cross-tab (`tools/murcia-coverage-crosstab/`), **run BEFORE the
signature** so the number could not be flattered by it.

**DOES NOT AUTHORISE — equally binding:**
- the **~67 %** delegated to partial plans. Arts. **5.25.3.3 / 5.26.3.3**: a zonal code inside a
  delegating *ámbito* governs use and typology *«pero no a los parámetros definitorios de la altura o
  edificabilidad»*. Those keep their **legally-grounded `derived-plan` refusal**;
- ⚠ **the founder's own parcel `3481104XH6038S`** — *ámbito* **TA-379 → Plan Parcial CR-5** (Arts. 6.6.2
  / 5.24.5.1). **Signing does NOT unlock it**, and a test pins that it still refuses;
- the **11 calificaciones that refuse**, each already cited;
- promoting the tier above `estimated-ruleset`. ⚠ **`authoritative` is UNREACHABLE** — no production
  path assigns it; a constructed determination is capped at **0.70** on ENVELOPE.

**PRECONDITION DISCHARGED:** the C58 badge defect (`cf45531e`) is fixed — a pack's declared confidence
and its verification gate now **reach the user**. Signing before that landed would have made the screen
**less honest than refusing**.

✅ **THE L-674 LIMIT IS DISCHARGED (2026-08-01, later the same day).** The cited document **is now in
the repo**: [`../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf`](../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf)
(205 pp, 2 352 553 bytes, SHA-256 `ab71c651…`, embedded title `TR PG vol_11   NN UU.signed.pdf`).
Every per-parameter verbatim quote can now be re-read from `corpus/` exactly the way Barcelona's
DOGC 4893 can.

⚠⚠ **AND THE REASON IT WAS "UNREACHABLE" WAS WRONG, WHICH MATTERS MORE THAN THE FIX.** This block
previously read: *"`urbanismo.murcia.es/infourb/documentos/` returns **HTTP 403** to automated
requests (the BCNROC pattern; a human browser reaches it)"*, and that sentence propagated verbatim
into `PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`, `murcia.measurements.json` and the L-674 audit row.
**The 403 is on the DIRECTORY INDEX. The PDF itself returns HTTP 200 to `curl`.** No new route, no
human browser, no founder hand-fetch was ever required — one correctly-formed request. The
contradiction was already sitting in the repo: `esMurciaPgou2012.ts:12` records *"(2026-08-01, HTTP
200, 2 352 553 bytes)"*, the exact byte count now filed. **Probe the ARTEFACT, not its container** —
*"the directory 403s"* ≠ *"the file 403s"*, the sibling of L-661's *"not found" ≠ "does not exist"*.
Full route table: [`../corpus/RETRIEVAL-LOG.md`](../corpus/RETRIEVAL-LOG.md) §0.

⚠ **Misattribution guard (the Badalona lesson, which recurred three times):** *always verify the
MUNICIPALITY, never the numbers.* When Volumen 11 arrives, confirm the title page says **Murcia** before
trusting a single band.

**Reversal is also a founder act.** Flipping `MURCIA_ENVELOPE_VERIFIED` back withdraws a published
determination; route it through the founder exactly as the flip was.

---



> **The L-449 gate.** Transcribing an ordinance into a buildability engine is a **legal act**, not an
> engineering one. This file records **who signed what, when, against which document** — and, just as
> importantly, **what each signature does NOT authorise**. Shape follows
> [`../../../es-ct/08019-barcelona/sources/VERIFICATION.md`](../../../es-ct/08019-barcelona/sources/VERIFICATION.md)
> (SIG-2 / SIG-3).
>
> **Signing a SOURCE ≠ certifying its NUMBERS.** Keep the two gates separate.

---

> ⚠⚠ **STALE FROM HERE DOWN — SUPERSEDED BY SIG-MU1 ABOVE (2026-08-01).** Everything below was
> written before the signature and still says the gate is `false`. It is kept for the audit trail,
> because the *reasoning* about the two refusal shapes remains correct and load-bearing. **The
> sign-off status line immediately below is NO LONGER TRUE:** `MURCIA_ENVELOPE_VERIFIED` is `true`
> in `main`, and **Murcia now RENDERS** on the 23.51 % this signature authorises
> (§MURCIA-ENVELOPE-RENDER; R-7 delegation parity closed first). The "publishes nothing" framing
> below describes the pre-signature world only. Do not quote this section as current state.

## ~~Sign-off status: **NOT SIGNED.**~~ (superseded) The pack is **REGISTERED and REACHABLE — and publishes nothing**

| | |
|---|---|
| **Gate constant** | `MURCIA_ENVELOPE_VERIFIED` (`rulepacks/esMurciaEnvelope.ts`) |
| **Value in `main`** | ~~**`false`**~~ → **`true`** since SIG-MU1 (2026-08-01). Only the founder flips it. |
| **Registered?** | **YES, as of 2026-08-01** — `rulepacks/registry.ts` §MURCIA-PACK-REGISTERED, `packsByZone: packMap([ES_MURCIA_PGOU2012_PACK, MURCIA_PGOU2012_ZONE_CODES], [ES_MURCIA_PGOU2012_PACK, MURCIA_PGOU2012_VARIANT_ZONE_CODES])` — **14** calificaciones + **2** published sub-variants (`RF1`→RF, `IXT`→IX) |
| **What a user sees today** | a **cited refusal on every Murcia parcel**, in one of two structurally different shapes (below). **No number, anywhere.** |
| **Proven by** | `apps/editor/__tests__/murciaSiteDispatch.test.ts` (real `dispatchParcelBoundary`, fails if the `isInMurcia` branch is removed) + `packages/site-parcel-data/__tests__/murciaWiring.test.ts` §"REGISTRATION IS NOT AUTHORISATION" |

### The two refusals, and why they must never be merged

| | `derived-plan` (67.0 % of buildable land) | `no-rule-pack` (the packed slice, today) |
|---|---|---|
| **Claim** | about **the LAW** | about **PRYZM** |
| `legallyGrounded` | **`true`** | **`false`** |
| **Says** | the PGOU expressly hands this parcel's conditions to a prior/derived instrument (Arts. 6.6.2 · 5.24.5.1 · 5.25.3.3 · 5.26.3.3 · 6.2.2.3) | the PGOU *does* set the conditions, PRYZM *has* transcribed them, and the transcription is **unsigned** |
| **A signature…** | **cannot lift it.** Ever. | lifts it. |

---

## SIG-1 · ⛔ **UNSIGNED** — the PGOU TR-2012 transcription (`MURCIA_ENVELOPE_VERIFIED`)

| | |
|---|---|
| **Verifier** | — (**awaiting the founder**) |
| **Date** | — |
| **Axis** | ENVELOPE (and, downstream, LEGISLATION) |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esMurciaPgou2012.ts` → `ES_MURCIA_PGOU2012_PACK` (14 zones) |
| **Source** | **PGOU de Murcia — *Normas Urbanísticas*, Texto Refundido diciembre 2012, Volumen 11** (205 pp), Ayuntamiento de Murcia, Concejalía de Urbanismo y Vivienda; `urbanismo.murcia.es`, file `TR PG vol_11 NN UU.signed.pdf` |
| **Source status** | the **municipality's own signed consolidation**, born-digital, carrying **no *«sin valor normativo»* disclaimer** — materially stronger than a third-party compendium |
| **Field provenance** | `ordinance-pdf` — a human read the article in the municipality's own normative PDF and quoted it **verbatim** into `ordinanceRef`. Strictly ABOVE Córdoba's machine-extracted `pipeline-extracted`; strictly BELOW an official determination |
| **Pack `defaultConfidence`** | `estimated-ruleset` |

**✅ ENGINE PRECONDITION — DISCHARGED** (L-665, 2026-08-01). Two ontology defects that would have
made a signature here *less* honest than the current refusal are fixed, ahead of the signature:

1. **§PACK-CONFIDENCE-CEILING** — `ZoningRulesEngine` hard-coded `estimated-ruleset` and never read a
   pack's `defaultConfidence`, so Murcia's **hand-transcribed, article-cited** pack and Córdoba's
   **OCR-derived, machine-extracted** one were indistinguishable on screen: both violet *"Estimated"*.
   The engine now clamps to the declared ceiling, so the two are **visibly and semantically
   different** — Murcia keeps the violet **"Estimated"** chip (correct: `defaultConfidence` is
   `estimated-ruleset`, `ordinance-pdf` field provenance, a human read the municipality's own signed
   PDF), while a machine-extracted pack drops to the red **"⚠ Unverified · machine-extracted"** chip
   one rung BELOW it. That separation is the thing SIG-1's *"Field provenance"* row above asserts;
   until now the code could not express it.
2. **§ENVELOPE-PUBLICATION-AUTHORISATION** — `classifyAnswerability(<murcia>, 'RM1')` returned
   **`full-envelope`**, a claim no Murcia parcel can honour while `MURCIA_ENVELOPE_VERIFIED` is
   `false`. It now reads the gate and returns **`pack-unverified`**. ⚠ Fixed in the classifier, never
   by de-registering the pack — consistent with *"registered but unsigned is a deliberate posture"*
   below: registration wires routing, it does not authorise output.

Pinned by `packages/site-parcel-data/__tests__/packConfidenceCeiling.test.ts` and
`envelopeAuthorisation.test.ts`. ⚠ This discharges an ENGINE precondition only. It verifies **no
article and no quote**, and it does not touch the **33.0 % ceiling** or the delegation arithmetic
below — every item in *"The open gate"* still stands.

### What signing WOULD authorise

- Rendering a buildable envelope for the **14 transcribed calificaciones** —
  `RL RD RD1 IX RF RG IC RH MC IG AJ RM1 RM2 MG` — **and only where the delegation tests do not fire
  first** (see the ceiling arithmetic below).
- At the **`estimated-ruleset`** tier, caveated to the TR-2012 consolidation.
- Each parameter is already carried with its **article and a verbatim quote**; the signature asserts
  that those quotes match the source, article by article.
- It would ALSO require, in the same change, teaching the L5 dispatch the disposition's
  `kind: 'envelope'` branch. That branch carries a `reason` field **as a deliberate interlock**: if the
  gate opens before L5 learns the branch, Murcia degrades to a cited refusal and logs why, rather than
  rendering nothing on a compliance surface.

### What signing would **NOT** authorise — the ceiling, arithmetic and cited

**Measured ceiling: 33.0 % of Murcia's private buildable land.** Measured over **23 066** in-force
`Murcia:pgou_alineaciones` polygons, shoelace areas in the layer's native **EPSG:25830**, joined to
`pgou_sectores` for `clase_suelo` (join rate 99.74 %); denominator **75.145 M m²**; snapshot
2026-08-01. PGOU-DIRECT **24.800 M m² = 33.0 %**; DELEGATED **50.345 M m² = 67.0 %**
(`../findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md` §3b).

⚠ **Do not read "14 packed calificaciones" as "33.0 % covered".** The two numbers are measured on
different tests and the smaller one wins:

| | share of the 75.145 M m² denominator | source |
|---|---:|---|
| Σ of the 14 packed calificaciones, **by calificación code** | **38.7 %** (RM1 + RM2 excluded — unmeasured inside the 7.77 % `RM` family) | Σ `../ENVELOPE.md` §3.1 |
| PGOU-DIRECT after the **clase-de-suelo / ámbito** delegation tests | **33.0 %** | §3b above |
| **What a signature could actually render** | **≤ 33.0 %** — and the exact intersection is **UNMEASURED** | — |

The 38.7 % exceeds the 33.0 % ceiling and that is **not** over-coverage: `murciaEnvelopeDisposition`
applies the delegation test **first**, so a packed code sitting inside *urbanizable* land or inside a
delegating ámbito still refuses. Arts. **5.25.3.3 / 5.26.3.3**, verbatim and identical, are why:

> «…el alcance de los códigos de calificación zonal de los suelos edificables dentro del ámbito … **se
> reduce a las condiciones de uso y tipología de las edificaciones, pero no a los parámetros
> definitorios de la altura o edificabilidad**.»

⚠ **The 33.0 % has a soft half.** **16.53 pp of it is calificación `RL`**, whose Art. 5.14.3 regime is
expressly *«antes de la aprobación de Planes Especiales»* — an **interim** regime PRYZM cannot check
the expiry of, because whether a Plan Especial has been approved over a given ámbito is not published.
**The firm floor excluding `RL` is 16.5 %.** The honest range for this city is therefore **16.5 %–33.0 %**.

Also **NOT** authorised:

- **The delegated 67.0 %.** No signature reaches it. Those parcels keep the `derived-plan` refusal,
  which is the ordinance's own answer.
- **⚠ The founder's own parcel `3481104XH6038S`.** It is ámbito **TA-379 → Plan Parcial CR-5**, inside
  the delegated slice; PGOU **Arts. 6.6.2 / 5.24.5.1** hand its parameters to that partial plan. It
  **keeps its `derived-plan` refusal after signing**, and a test pins that. A competitor published
  ~262 m² of edificabilidad here as a "proxy PGOU"; under Art. 6.6.2 a general-plan zone table is the
  **wrong instrument** for this land, so that figure cites a document which expressly declines the
  question. PRYZM must not reproduce it, before or after any signature.
- **Any number for the 11 classified-but-REFUSED calificaciones** (`RC RM RN MZ RB RU RT MX GP/RX/RJ/…`
  families). Each refusal is a *correct answer* with a stated reason — street-width table, existing-
  building-derived, delegated footprint, or scope-reduced generic code (`../ENVELOPE.md` §3.2).
- **Resolving the street-width blocker.** `RC`, base `RM`, `RN`, `RD1`'s third storey, `MZ`'s FAR and
  `MX`'s frontage rule all reduce to **one missing input**: a Murcia street-width / frontage-class
  source. Packing one width would publish one street's answer for a whole zone — the L-526 failure
  verbatim. That is engineering, not a signature.
- **A BORM approval reference.** `MURCIA_PGOU_BORM_REFERENCE = 'not-located-in-source'`. ⚠ *Not
  located* is **not** *does not exist*.
- ~~**Concordance of the 2017 re-edition with the 2012 TR** — unverified.~~ ✅ **CHECKED 2026-08-01
  (L-676): all 22 cited zone articles are BYTE-IDENTICAL across both published consolidations**, and
  the four cited articles that do differ (1.1.1, 5.1.5, 5.26.3, 6.2.2) move no published value. The
  evidence also runs the OPPOSITE way to the worry: the murcia.es *"2017"* file is an **earlier**
  consolidation the municipality still hosts — its «act. 28_02_2017» is a file-upload label, not an
  edition date. PRYZM cites the LATER of the two. Method + article table:
  [`../corpus/INDEX.md`](../corpus/INDEX.md) §2–§3.
- **Promotion above `estimated-ruleset`.** A verbatim quote from a consolidation is not an official
  determination.

### The open gate — what the founder must confirm

1. **Quote fidelity, article by article** — that each `ordinanceRef` quote in
   `ES_MURCIA_PGOU2012_PACK` matches Volumen 11 of the TR-2012 at the cited article.
2. **Rule KIND per zone (ADR-0270 / C58 §2.2)** — alignment (MC · MG · RM1 · RM2 · RD1) vs
   setback+FAR (the other nine). **The wrong KIND is a wrong SHAPE, not a wrong number.**
3. **The four-state readings hold** — in particular that `IC` / `IX` / `IG` height is a **NO-LIMIT
   FINDING** (*«La altura será libre…»*), encoded `null`, never a large number and never 0; and that
   `RF` / `RG` FAR is **CONSTRUCTED** (*«La que resulte de los parámetros de ocupación y altura»*),
   left `null` for the engine to derive rather than transcribed as a figure.
4. **The `RL` interim caveat is surfaced to the user**, not just recorded here — 16.5 pp of the
   ceiling rests on a regime the plan itself labels provisional.
5. **The order inside `murciaEnvelopeDisposition` is unchanged** — the delegation gate must stay
   ABOVE the PGOU-direct branch. Moving it would publish a general-plan number for land the general
   plan expressly declines to order.
6. **`PACKED_VARIANTS` remains an explicit allow-list**, never a prefix heuristic. The live layer
   carries ~120 distinct calificación strings; a regex that stripped suffixes would assert that
   `RB-Ch6` carries `RB`'s numbers — a claim the ordinance nowhere makes.

---

## What WAS machine-verified (agent, 2026-07-31 / 2026-08-01)

Reachability and schema only — **none of it verifies a NUMBER**:

1. `https://geoserver.murcia.es/geoserver/wfs` live. ⚠ **https** — the http host 301-redirects and
   `curl` without `-L` returns the redirect page, not GeoJSON.
2. `Murcia:pgou_alineaciones` — ⚠ misleadingly named: a MultiSurface **polygon** layer carrying the
   **calificación** (`calificacion`, `descripcion`, `uso_global`, `sector`, `url`, `f_inicial`, `f_fin`).
3. `Murcia:pgou_sectores` — the ámbito (`sector`, `clase_suelo`, `categoria`, `uso_global`, `pedania`,
   `superficie`, validity interval).
4. **`DescribeFeatureType` confirms NO numeric buildable attribute exists** — checked against the
   **schema**, not against one response. No altura, no edificabilidad, no ocupación, no retranqueo.
5. `f_inicial` / `f_fin` are the legal-status attributes; in-force records carry `f_fin = 2999-12-30`.
   A record whose `f_fin` has passed is superseded and must not be quoted (`isInForce` is
   **three-valued**: `null` ≠ in force).
6. The founder's parcel resolves live end-to-end: Catastro `3481104XH6038S` → calificación `RR`,
   ámbito `TA-379`, *Urbanizable Transitorio*, pedanía EL PUNTAL.

⚠ **These are live services.** Every figure in this file is a **2026-08-01 snapshot**; re-run before
quoting externally.

---

## Why "registered but unsigned" is a deliberate posture

Registration makes the pack **reachable** — so the C60 coverage probe (`registeredPackZoneCodes`) reads
the shipping registry rather than a restated list, and so the pack is **signable in one act** instead of
requiring a code change at signing time. It is **not** an authorisation to draw, and two independent
facts hold that line:

- `MURCIA_ENVELOPE_VERIFIED === false`; the packed branch of `murciaEnvelopeDisposition` returns a
  cited `no-rule-pack` refusal that **names the governing article** and deliberately does **not**
  interpolate the transcribed scalars into its prose (a gate you can read around is not a gate — a test
  pins this);
- the L5 Murcia dispatch answers from that disposition and **never consults `resolveZoneDisposition`**,
  so the registry entry cannot reach a user surface at all.

⚠ **The residual risk this leaves, recorded so it is not discovered later.** With `packsByZone`
non-empty, `classifyAnswerability(MURCIA_JURISDICTION_ID, 'RM1')` returns **`'full-envelope'`** — a
claim no Murcia parcel can currently honour. `answerabilityClass.ts` is not re-exported from the
package index and no shipping surface consumes it (its own header sequences it behind L-600), so this
is **latent, not live**. It must be resolved *before* that classifier reaches a user surface, and the
fix belongs with the classifier (teach it the verification gate), not by de-registering the pack. The
identical statement applies to Córdoba (`es-an/14021-cordoba/sources/VERIFICATION.md`).

---

## Standing caveat on every signature in this file

**`honestyOk` is launch-blocking; a completion percentage is not.** A signature authorises PRYZM to
*publish* a number at a *stated confidence*; it never converts an estimate into an authoritative
determination, and it never makes PRYZM's output a permit.

*Maintainer: UNASSIGNED. Authority: C58 §1.2/§1.4/§1.6 · C60 §3 · C63 · ADR-0270 · L-449 · L-656 ·
§CONTEXT-DATA-HONESTY. Created 2026-08-01.*
