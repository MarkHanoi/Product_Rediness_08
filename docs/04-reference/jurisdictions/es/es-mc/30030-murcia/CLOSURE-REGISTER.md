# Murcia — CLOSURE REGISTER (the complete blocker list)

> **Stamp 2026-08-01.** The single place that answers *"what is left before Murcia is CLOSED?"*
> Companion to [`RATE.md`](./RATE.md) (which scores axes) — **this file tracks BLOCKERS.**
> Every row must end in a **yes/no**, never an open question.
> Shape follows [Barcelona's register](../../es-ct/08019-barcelona/CLOSURE-REGISTER.md).

---

## The definition of CLOSED — ratified 2026-08-01 (founder)

> **A city is CLOSED when every parcel reaches a TERMINAL, EVIDENCE-BACKED state — either a
> constructed envelope, a cited delegation, or an explicit refusal with a documented reason.**

**It does NOT mean every parcel returns a numeric envelope.** For Murcia that distinction is not a
caveat — it is the *dominant fact of the city*. **67.0 % of Murcia's private buildable land is
legally delegated** by the PGOU's own articles (Arts. 5.24 / 5.25 / 5.26 / 6.2.2 / 6.5.1 / 6.6).
That land is **CLOSED today**: it carries a cited `derived-plan` refusal naming the governing
article, and **no signature, transcription or engineering can ever convert it into a number.**

## Murcia's arithmetic maximum — and how much of the gap is LAW

Denominator throughout: **private buildable land = 75.145 M m²** (L-656 — buildable land, *not* all
land, *not* clicks), measured by [`tools/murcia-coverage-crosstab/`](../../../../../../tools/murcia-coverage-crosstab/README.md).

| Slice | share of buildable | terminal state |
|---|---:|---|
| **Renders a computed envelope today** | **23.51 %** | ✅ constructed envelope |
| PGOU-direct but street-width-blocked | 8.81 % | 🟠 cited refusal (recoverable — row 3) |
| PGOU-direct, other residual | 0.68 % | cited refusal |
| **— PGOU-direct subtotal (the ENVELOPE ceiling)** | **33.00 %** | |
| **Legally delegated to a derived instrument** | **67.00 %** | ✅ cited delegation — **CLOSED, permanently** |

**The ENVELOPE ceiling is 33.00 % of buildable land, and 67.00 pp of the gap is LAW, not effort.**
Of the 9.49 pp between today's 23.51 % and that ceiling, **8.81 pp is a single missing data source**
(row 3) — so the entire remaining *effort* in Murcia's envelope is one resolver.

⚠ **On the C63 ENVELOPE AXIS the arithmetic maximum is ≈13.2 %, not 33 %,** because SIG-MU1
authorises publication at `estimated-ruleset` only (tier weight **0.4**) and states plainly that
`authoritative` is **UNREACHABLE** — a constructed determination is capped at 0.70. So
`0.3300 × 0.4 ≈ 0.132`. **A Murcia ENVELOPE axis reporting much above ~9–13 % would mean we had
stopped being honest**, either about the delegation or about the tier.

## The standard every blocker must meet before it closes

**Evidence → Findings → Decision → Alternatives rejected.**

⚠ **No blocker may rest at *"needs founder decision"* until it is PROVEN that no authoritative
evidence exists.** **Negative evidence closes a blocker** — *"no authoritative source exists, here is
where we looked"* is a valid, permanent closure.

## Taxonomy

| | Bucket | Unblocked by |
|---|---|---|
| **A** | **Evidence** | primary sources — BORM, `urbanismo.murcia.es`, municipal GeoServer |
| **B** | **Engineering** | implementation |
| **C** | **Contract** | architecture change |
| **D** | **Product policy** | a founder decision, *after* A is exhausted |

---

## The register

| # | Blocker | Bucket | Sev | Status | Closes when |
|---|---|:--:|:--:|---|---|
| **1** | **Transcription unsigned** | **D** | **P0** | ✅ **CLOSED — SIG-MU1 SIGNED 2026-08-01** | ✔ done. Authorises publication on the **23.51 %** where a transcribed calificación meets non-delegated soil, at `estimated-ruleset`, cited to the PGOU TR dic-2012. Explicitly does **NOT** authorise the 67 % delegated land, the 11 refusing calificaciones, the founder's own parcel `3481104XH6038S` (ámbito TA-379 → PP CR-5), or any tier promotion. |
| **2** | **🔴 The disposition's delegation test was NARROWER than the PGOU's, by 13.09 pp (R-7)** | **B** | **P0** | ✅ **CLOSED — §R-7-DELEGATION-PARITY, 2026-08-01** | ✔ done. `murciaEnvelopeDisposition` applied **1 of 4** grounds (the *ordenación remitida* prefixes `TA TM UA UH UM`). Added: ***clase de suelo* = Urbanizable** (Art. 6.2.2.3), **`UE`/`UD`** (Arts. 5.25.1/5.25.2), **`P*` Planes Especiales** (Art. 5.26.2) — all **above** the PGOU-direct block. ⚠ **SIGN: this was a genuine OVER-statement.** Rendering without it would have published a general-plan number on **13.09 pp** of delegated land, taking coverage to **36.59 % — ABOVE the 33.00 % the PGOU orders directly.** The gate that keeps it closed: `murciaCoverageCrosstab.test.ts` no longer asserts the asymmetry, it asserts **PARITY** with the crosstab's reviewed legal set, and fails if a ground is added to one side only. |
| **3** | **No Murcia street-width source — `RC` + `RM` + `RN`** | **A→B** | **P1** | 🟠 **open, and now correctly SIZED + SPLIT (2026-08-01)** | ⚠ **THIS ROW PREVIOUSLY CONFLATED THREE DIFFERENT PROBLEMS and is corrected here.** It read *"blocks RC, RM, RN, RD1's third storey, MZ's FAR and MX's frontage = 8.81 %"*. Measured against the crosstab: **the 8.81 % is EXACTLY `RC` + `RM` + `RN` (6.620 M m² of PGOU-direct land)**. `MZ` (0.18 %) and `MX` (0.06 %) are **NOT width-recoverable** and are now rows 13 and 14. `RD1` is **already packed and rendering** — only its bonus third storey is affected, so it is an under-statement inside a working envelope, not a blocked zone.<br><br>⭐ **THE ORDINANCE TABLE IS ALREADY HELD, VERBATIM.** Art. 5.3.3 (`RC`), 5.5.3 (`RM`), 5.7.3 (`RN`): *«2 plantas (7 m) en calles menores de 4 metros. 3 plantas (10 m) en calles de 4 a 8 metros. 4 plantas (13 m) en calles de 8 metros o mayor ancho»*. **Nothing legal is missing** — the only missing input is the WIDTH NUMBER. This row is therefore **A→B**, not pure A.<br><br>⚠ **BUT IT IS NOT A SIMPLE PORT, AND THIS IS THE FINDING.** `geometry/streetWidth.ts` (`measureStreetWidths` · `blockEdgesFacingParcel` · `governingStreetWidth`) is production-proven and **city-agnostic**. What is city-SPECIFIC is the **band-edge hazard**: Murcia's bands break at **4 m and 8 m**, and the L-537 probe measured its own p90 error at **0,63 m**. A parcel measured at 7,9 m vs 8,1 m flips **3 plantas (10 m) → 4 plantas (13 m)** — a 3 m height swing on measurement noise. **`SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md` covered Barcelona, Madrid, València, Córdoba and Sevilla — NOT Murcia**, and its own verdict is that *"the quantum SET is CITY-SPECIFIC, and it is NOT the obvious one"* (Barcelona has **no** 10/15/25 m quantum at all). **So the Murcia distribution is UNMEASURED and must not be assumed from a neighbour.**<br><br>**Closes when:** (i) run the L-537 probe against Murcia (one run, reuses the production parsers/dissolve/measurement — the tool exists); (ii) if widths cluster on 4/8 m, a band-edge guard MUST refuse near the edges and **the recoverable share will be less than 8.81 %** — size it from the probe, do not assume; (iii) then wire the table. ⚠ **Do NOT ship a snap set before the probe** — that is the L-529/L-581 failure class verbatim, and the probe exists precisely because the intuitive snap set was *false* for the city we ship. **SIGN: omitting it UNDER-states** (those parcels refuse), so there is no correctness urgency — only coverage. |
| **13** | **`MZ` — a height with no footprint** | **A** | P3 | ✅ **CLOSED — cited delegation, and a width resolver would NOT open it** | ✔ **0.18 % of buildable land.** Split out of row 3, where it was wrongly counted as width-recoverable. Art. 5.6.3 states the height (8 plantas / 25 m) and gives the FAR as an **algorithm over street width** (*«2'66 m2/m2 de superficie de parcela más semiancho de calles contiguas limitadas a un ancho máximo de 10 metros»*) — so a width WOULD yield a FAR. **But the footprint is expressly delegated in the same article:** *«La ocupación, la separación a linderos públicos y privados y la ordenación volumétrica se determinarán mediante la redacción y aprobación del correspondiente Estudio de Detalle.»* ⇒ **A height with no footprint is not an envelope.** Even with a perfect width source `MZ` cannot render, so it is a **cited delegation — terminal, and CLOSED under the ratified definition.** ⚠ Reopens only if an approved Estudio de Detalle becomes machine-readable per parcel. |
| **14** | **`MX` — needs a FRONTAGE CLASS, not a width** | **A** | P3 | 🟠 open — **but NOT on row 3's critical path** | **0.06 % of buildable land.** Art. 5.22.3 keys height on **which frontage the parcel presents** — 5 plantas/16 m to an *eje viario principal*, 3 plantas/10 m to a *vía secundaria* — which is a **classification of the street, not a measurement of it**. A width resolver does not close it. ⚠ Sub-case (b) *Enclaves Terciarios* gives its storey counts with **no metre equivalent**, so its height in metres is UNKNOWN from the source and would stay `null` even with a full frontage classification. **Closes when** a Murcia road-hierarchy layer is found, **or** it is proven none exists — **negative evidence closes it**. At 0.06 % this is correctly the lowest priority in the register. |
| **4** | **🔴 The SIGNATURE bypassed the disposition entirely** | **B** | **P0** | ✅ **CLOSED — §MURCIA-GATE-BYPASS-REGRESSION, 2026-08-01** | ✔ done, and it was **LIVE on `main`**. The L5 dispatcher guarded on `if (!MURCIA_ENVELOPE_VERIFIED && resolution.ok)`, so SIG-MU1 flipping the constant made the **entire disposition unreachable** — every parcel fell to the generic `no-rule-pack` coverage refusal. **The signature made the city strictly worse**: no envelope, *and* the 67 % delegated land lost its cited `derived-plan` article, replaced by an untrue statement about our own coverage. ⚠ **The transferable lesson:** the interlock meant to prevent this lived **inside** the disposition (the `reason` field on the `envelope` branch) while the guard that skipped the disposition lived **outside** it. **An interlock downstream of the branch that bypasses it is not an interlock.** The gate now governs what we may **publish**, never whether we may **read the law**. `murciaSiteDispatch.test.ts` was already RED on `main` and had caught it. |
| **5** | **L5 could not consume an `envelope` disposition** | **B** | **P0** | ✅ **CLOSED — §MURCIA-ENVELOPE-RENDER, 2026-08-01** | ✔ done. Maps `kind: 'envelope'` → `computeBuildableEnvelope` with `ES_MURCIA_PGOU2012_PACK`, keyed on the disposition's **`matchedCode`** (so the allow-listed variants `RF1`→`RF`, `IXT`→`IX` resolve to the zone whose article is cited, instead of finding no zone and silently answering whole-parcel). **Measured end-to-end through the real dispatcher:** `RL` on `Urbano` → inset **315.0 m²**, height **7 m**, 2 plantas, `estimated-ruleset`, every derived constraint carrying Art. 5.14.3 with its verbatim quote. ⚠ Delegation is **NOT** re-tested at the render site — a second test there would be a second, driftable statement of the safety property (the L-422/457/467/469 family). The disposition is the ONE decision point. |
| **6** | **🔴 The cited document is NOT in the repo (L-674)** | **A** | **P1** | 🔴 **open — accepted as a KNOWN LIMIT at signing** | `urbanismo.murcia.es/infourb/documentos/` returns **HTTP 403** to automated requests (measured 2026-08-01 — the BCNROC pattern; a human browser reaches it). So the per-parameter verbatim quotes **cannot be re-read from `corpus/pdf/`** the way Barcelona's DOGC 4893 can. ⚠ **SIGN: unknown — this is the one row whose direction cannot be established without the document.** The quotes may be perfect; nothing in the repo can currently prove it. **Closes when** Volumen 11 lands in `corpus/pdf/` and a spot-check confirms ≥5 zones. ⚠ **Misattribution guard (the Badalona lesson, which recurred three times): verify the MUNICIPALITY on the title page before trusting a single number.** Founder is fetching it by hand. |
| **7** | **BORM approval reference `not-located-in-source`** | **A** | P2 | 🟠 open — **honestly recorded, not guessed** | We hold the normative text, **not** the gazette act that enacted it. ⚠ That is *not located*, **not** *does not exist* — the two are different values and the pack says so (`MURCIA_PGOU_BORM_REFERENCE = 'not-located-in-source'`, pinned by a test). **SIGN: EXACT** — it affects citation completeness, no number. **Closes when** the BORM entry is found **or** a documented search proves it is not published in a retrievable form; **negative evidence closes this row.** |
| **8** | **2017 re-edition undiffed** | **A** | P2 | 🟠 open | «NORMAS URBANÍSTICAS REFUNDIDAS ADAPTADAS A LS REG. act. 28_02_2017» (196 pp) is the version the municipality links **publicly**; every quote in the pack came from the **2012 TR** (205 pp). Concordance **UNVERIFIED**. ⚠ **SIGN: unknown until diffed** — a re-edition could move a number in either direction, which is exactly why it is P2 and not P3. **Closes when** the 14 packed calificaciones' articles are diffed 2012 ↔ 2017 and either confirmed concordant or re-transcribed. Blocked behind row 6 (same 403). |
| **9** | **HEIGHTS axis — 0 measured** | **B** | **P1** | 🔵 **bake in flight (2026-08-01)** | ⚠ **Murcia is the WORST of the five Spanish cities: 96.1 % of context buildings render a fabricated 9 m.** Probed on the SHIPPED R2 tiles (`tools/context-height-probe/probe.mjs`, same bytes the browser reads): **0 measured-lidar of 3,012** footprints (tagged 86 · derived-levels 30 · assumed 2,896), verdict `unmeasured`. **Root cause found and fixed 2026-08-01:** Murcia was **absent from `MDS_CITY_BBOXES`**, which is BOTH the join's `priorityBboxes` AND its `retainBboxes` working set (L-659) — footprints outside the retain set stream through untouched, so Murcia could **never** have been stamped, and a national bake would have reported a green §MEASURED-HEIGHT-GATE for `spain` regardless. Row added (bbox = the canonical `terrain.mjs` REGIONS row, not re-invented). **Closes when** the buildings re-bake publishes and a re-probe returns verdict `measured`. ⚠ Expect **~40–60 %**, not 100 % — the live MDS probe measures 42.6 % footprint coverage. |
| **10** | **`baked: true` was a FALSE claim** | **B** | P2 | ✅ **CLOSED — §BAKED-FLAG-IS-NOT-EVIDENCE, 2026-08-01** | ✔ done. `MDS_CITY_BBOXES` marked Barcelona and Córdoba `baked: true` / *"reference — SHIPPED"* while the shipped tiles carried **zero** measured heights for either. The flag is **inert metadata no code reads** (`git grep '\.baked'` → no call sites), so it could only ever be a claim — and it was the claim that would have made someone skip the re-bake for the cities that most needed it. Every row set to `false` with the probe numbers inline, plus the rule: **flip to `true` only on a probe of the SHIPPED tiles, never on "the bake went green"** — a green bake is precisely what L-658 produced while shipping nothing (§SIZE-IS-NOT-PROVENANCE). |
| **11** | **PARCEL axis** | **B** | P3 | ✅ **CLOSED — 99 % measured** | ✔ National Catastro routing (`isInSpain`); `computeParcelConfidence` over the 30030 bbox scores **99 %**. No Murcia-specific parcel work is open. |
| **12** | **Dossier claimed "0 % renders" after the signature** | **A** | P2 | ✅ **CLOSED 2026-08-01** | ✔ Four docs still asserted `MURCIA_ENVELOPE_VERIFIED = false` **after** SIG-MU1 flipped it: `LEGISLATION-RATE.md`, `sources/VERIFICATION.md`'s lower half, `registry.ts`'s comment, and this dossier's `NEXT.md`. Each reconciled, with the superseded text kept for the audit trail rather than deleted. ⚠ **A stale doc that contradicts a signed act is a governance defect, not a typo** — it is how the next session re-derives a decision that was already made. |

---

## Effort, honestly

| Category | Remaining | Difficulty |
|---|---|---|
| **Legal / evidence** — retrieve Volumen 11 into the repo (row 6), diff the 2017 re-edition (row 8), locate the BORM act (row 7) | ~2–4 days, mostly **human-gated** (403 defeats automation) | Low–Medium |
| **Engineering** — the street-width resolver (row 3), ⭐ porting Barcelona's `streetWidth.ts` construction | ~2–4 days | Medium |
| **Infra** — the buildings re-bake + R2 publish + re-probe (row 9) | one cloud run | Low |
| **Structurally impossible** — the 67 % delegated land | **∞** | ⛔ **Correctly closed by a cited delegation. Do not spend effort here.** |

## Recommended order

**9 → 3 → 6 → 8 → 7**

**9 first** because it is already in flight and is the only row that changes what a user *sees* on
every Murcia click regardless of parcel — 96.1 % of the skyline is currently fabricated, which is
the most visible dishonesty left in the city.

**3 second** because it is the ONLY remaining lever on the envelope number (+8.81 pp, ~a third of
the way from 23.51 % to the 33.00 % ceiling), it is strictly additive, and the construction is
already written for Barcelona.

**6 before 8** because the 2017 diff is blocked behind the same 403 that blocks the document
retrieval — they are one errand, not two.

> ### ⚠ The transferable lesson from this register, worth reading before the next city
>
> **Three of Murcia's four P0s were created by the SIGNATURE, not by the law.** Rows 2, 4 and 5 all
> became live the moment `MURCIA_ENVELOPE_VERIFIED` flipped, and row 4 actively *regressed* the city.
> The pre-signature dossier had recorded a "guard today" resting on two conditions — the gate being
> shut, and an interlock in the disposition — and **both failed within a day**: the gate was opened
> without the delegation test being widened, and the interlock could not fire because the guard that
> skipped it lived one layer up.
>
> **⇒ For every future city: a signature is a CODE-PATH EVENT, not a document event.** Before the
> next `*_ENVELOPE_VERIFIED` flips, trace what changes in the dispatcher — and pin it with a test
> that runs in the post-signature world (`envelopeVerified: true` passed explicitly), not only in
> the pre-signature one. Murcia's suite asserted "no number" in every branch, which could not tell a
> working render path from a dead one.

---
*Authority: C58 · C63 · L-449 · L-656 · L-674. Signature: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-MU1.
Measurement: [`tools/murcia-coverage-crosstab/out-crosstab.json`](../../../../../../tools/murcia-coverage-crosstab/out-crosstab.json).
Maintainer: UNASSIGNED.*
