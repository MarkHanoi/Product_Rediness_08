# ENVELOPE — Córdoba (INE 14021)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK AUTHORED · **REGISTERED** · **GATED SHUT** · ENVELOPE axis = **0.0 % (MEASURED, C63)** — refusing

> ⬆ **2026-08-01 — the axis is now scored through the ruler, not asserted.**
> [`tools/city-completion/measurements/cordoba.measurements.json`](../../../../../../tools/city-completion/measurements/cordoba.measurements.json)
> carries **seven non-overlapping slices summing to 1.000000** of the named denominator (Córdoba
> SUELO URBANO = 33 341 928.156 m², national SIU, in force), each with an `EnvelopeConfidence` tier.
> `computeScorecard.mjs --city cordoba` reads it and reports **ENVELOPE = 0.0 %**.
>
> ⚠ **THAT IS A MEASURED ZERO, NOT A MISSING MEASUREMENT, AND IT IS AN IMPROVEMENT.** Every slice
> weighs 0 for one of two reasons that must not be conflated: **2.962 pp is `not-determined`** — the
> PGOU delegates it or a preservation/overlay regime governs it, a *terminal, cited, correct answer*
> (C63 §1.5 / L-656) — and **97.038 pp is `no-pack`**, PRYZM's side. Until 2026-08-01 this axis would
> have scored **above** zero for the worst possible reason: a fabricated triple on 95.1 % of the city.
>
> **Arithmetic maximum, so 0.0 % is not mistaken for "one sprint from 30 %":** blockers 2 + 3 alone
> ⇒ **≈ 0.68 %**; plus blocker 8 (MC street-width) ⇒ **≈ 1.03 %**. `authoritative` is UNREACHABLE
> (blocker 19). Only blocker 22 changes the order of magnitude, and its size is **deliberately not
> predicted** — extrapolating the pilot's 52.87 % PGOU-direct-and-packed ratio across the
> un-vectorised 94.448 pp is exactly what produced the withdrawn "~19 % / ~89 %".

Córdoba is the **shape-B OCR city**: a modern consolidated plan (PGOU-2001) with clean scanned
ordinances. The extraction pipeline has run and the pack **is** registered — but nothing is
human-signed, so the dispatcher returns **no envelope**: a cited refusal, never a number.

> ⚠ **CORRECTED 2026-08-01.** This section previously read *"UNREGISTERED · nothing is registered"* and
> the slot table scored S2 and S5 as ❌. **All three were stale.** The router predicate, the L5 dispatch
> branch and the registry entry (13 subzones) all ship. What holds the numbers back is one constant,
> `CORDOBA_ENVELOPE_VERIFIED = false` — and that was established by **driving the real dispatch**
> (`apps/editor/__tests__/cordobaSiteDispatch.test.ts`), not by reading the code.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) + COACo `coaco:vcatastro_urbanismo` (5,725 pilot parcels) | ✅ national provider wired; block-ring dissolve **0/3** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) |
| **S2 — router predicate** | `providers/cordobaBbox.ts` → `isInCordoba` / `CORDOBA_BBOX` | ✅ **wired**, and routed by L5 (`applyCordobaZoningThenFallback`). ⚠ The box is the **pilot extent**, not the city |
| **S3 — zone source** | COACo calificación WFS (`coaco:ordenanzas`, 453 polygons) | ⚠️ **live for 2 of ~10 districts only** (Sur + Noroeste pilot, ~1.63 km²); elsewhere SIU *clasificación* = land class, not an envelope. ⚠ **Subzone resolver AUTHORED but NOT CALLED** (`providers/resolveCordobaSubzone.ts` exists + is exported + has its `server/cordobaZoningProxy.js` proxy, but `applyCordobaZoningThenFallback` never invokes it — it uses a `cordoba-pgou-2001-pilot` placeholder). The Córdoba leg makes **no planning network call at all** today. ⚠ **Delegation ≈ 50 %** of pilot buildable land sits inside a Plan Parcial / Plan Especial / PERI / Estudio de Detalle ámbito (`coaco:actuaciones`) — the resolver's `derivedPlanningOverride` branch must be exercised for those, not merely present |
| **S4 — rule pack** | `esCordobaPGOU2001.ts` → `ES_CORDOBA_PGOU2001_PACK` | ✅ authored, 13 subzones; ⚠️ every value `pipeline-extracted-unverified` (scanned PDFs, single-pass vision) |
| **S5 — registration** | `rulepacks/registry.ts` | ✅ **REGISTERED** — `packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK, CORDOBA_PGOU2001_ZONE_CODES])` |
| **S6 — the honesty gate** | `CORDOBA_ENVELOPE_VERIFIED` + [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | ⛔ **`false` / UNSIGNED** — this, and only this, is why the axis measures 0 % |

## ⛔ "RAISE THE ENVELOPE BY PACKING MORE FAMILIES" — MEASURED, AND IT IS WORTH ≤ 0.09 pp

The standing instruction to every city is *raise the envelope by packing law, never by relaxing
anything*. For Córdoba that lever was measured on 2026-08-01 and **it is essentially empty, for a
reason that is a credit to the city rather than a gap**. All five unpacked COACo families were run
down to their governing article, and **not one of them grants a zone envelope that could be packed**:

| Unpacked family | Land (of ordenanzas) | Governing article | Why it can never be an envelope | Tier |
|---|---:|---|---|---|
| Uso Comercial | **2.278 %** | **Art. 13.12.2** | a USE overlay — commercial buildings *follow the underlying zone* (MC/CTP/UAD/UAS/IND), a specific set in PAS/OA, or a Plan Parcial. There is no single commercial envelope to encode. | `not-determined` |
| CTP1-Campo de la Verdad | **1.307 %** | **Art. 13.4.1** | the envelope is *"en la Memoria y Normativa correspondiente al Conjunto Histórico (**Tomo VI**)"* — a volume the publisher does not serve at all. | `not-determined` |
| Elemento protegido | **0.666 %** | **Art. 13.3** | a preservation regime: *"La sustitución no supondrá aumento de la superficie total ni del volumen construidos"* — the envelope **is** the existing building. | `not-determined` |
| Unifamiliar Aislada | **0.165 %** | — *(no article obtainable)* | `O_UAS1.pdf` is a **69-byte** "Server under construction" page (md5 `75a5f31…`, re-verified 2026-08-01) and no held document carries the UAS chapter. | `no-pack` |
| Uso Industrial | **0.118 %** | **Art. 13.11** | TWO independent stoppers: the map never names the IND-1/2/3/G/C/SC-C subzone (parcela 200–2 000 m², FAR 0,35–1,5), **and** ocupación is *"la resultante de la aplicación de los parámetros de edificación del presente artículo"* — an algorithm, not a number (ADR-0271). | `regime-undetermined` |
| **Total** | **4.534 %** of ordenanzas land = **0.221 %** of SUELO URBANO | | | |

⇒ **Even if all five could be packed at `estimated-ruleset` (0.4), the ENVELOPE axis would move by
0.221 % × 0.4 ≈ 0.09 pp.** They cannot be, and packing any of them would be fabrication of exactly
the kind this city spent the week removing. **All five are already closed as typed, article-citing,
land-identifying refusals** — which is the correct answer and scores correctly as ~0.

**The lever that actually exists is nothing to do with families:**

| Lever | Axis after | Nature |
|---|---:|---|
| today | **0.0 %** | gate shut **and** resolver never called |
| blockers 2 + 3 — the signature + calling the authored resolver | **≈ 0.68 %** | one legal act + ~2–3 eng-days |
| \+ blocker 8 — a Córdoba street-width resolver (MC height table) | **≈ 1.03 %** | ~1 week + a width source |
| \+ blocker 22 — vectorise the 69 remaining GMU CUS raster sheets | **the only order-of-magnitude move** | weeks; size deliberately **NOT predicted** |

⚠ **And one ceiling that was on this page is GONE.** Blocker 20 held that the cadastral dissolve
(`0/3` in Córdoba) might make the whole thing unrealisable, because CTP-1 + MC are alignment zones
needing a block ring. **`0/3` was a three-block sample.** Measured at scale in both lineages
(`tools/cordoba-dissolve-probe/`): **Catastro INSPIRE 20/26 = 76.9 %**, **COACo 354/400 = 88.5 %**
(MC 88.5 %, CTP 83.7 %). The dissolve costs about one block in four to an honest refusal. **It does
not cap Córdoba.**

## Why the answer is a refusal, not a number

Three cited facts hold Córdoba's shippable envelope at effectively 0 % municipality-wide — **all
documented, none a data-quality excuse** (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) +
`findings/OCR-EXTRACTION-RESULTS.md`):

1. **Calificación geometry is published for 2 of ~10 districts** (COACo pilot). Everywhere else a click
   resolves to SIU *clasificación* (urbano / urbanizable / no urbanizable) — not an envelope.
2. **Every extracted density/height is `pipeline-extracted-unverified`** — single-pass vision, no L-449
   sign-off. `SOURCES.md §C` (the verified table) is empty; nothing ships `structured`.
3. **The two dominant families are not even scalars.** Manzana Cerrada states its height as a
   *per-street-width TABLE* (null scalar until a Córdoba street-width resolver exists — the same gap as
   Barcelona) and its edificabilidad **DERIVED by algorithm**; Colonia Tradicional Popular's
   edificabilidad is DERIVED too. The pipeline correctly emits `null` rather than manufacture a value.

## ⬆ The CEILING, MEASURED 2026-08-01 — and the old figure WITHDRAWN

> ⚠ **This section previously read "~19 % fully-numeric / ~89 % partial after human sign-off".**
> **That is WITHDRAWN.** It came from a parcel-count census over ordenanza families
> (`findings/OCR-EXTRACTION-RESULTS.md` §4) that never asked whether a subzone could **bind**, whether
> a later instrument **superseded** it, or whether the bound subzone actually **renders**. Measured
> properly against the **L-656 denominator — buildable land, not all land, not clicks**:

| | |
|---|---:|
| **Denominator: buildable land, COACo published pilot** | **1 850 780 m²** (`ordenanzas` 1 628 301 + `usos_globales` lucrative 222 479; Espacios Libres + Equipamientos excluded as public systems). Geometry self-checked: shoelace reproduces the publisher's own `sup_m2` to **−0.019 %** |
| **Full numeric envelope** | **≈ 16 %** (16.23 % link key · 15.94 % independent `et` key) |
| **Any envelope (full + partial)** | **≈ 31 %** (31.20 % · 30.91 %) |
| **Correctly REFUSED** | **≈ 69 %** |

**≈ 50 % of pilot buildable land is DELEGATED to a later instrument** — 169/453 ordenanza polygons
(42.98 % of direct-ordinance land: **Plan Parcial 16.76 pp · Plan Especial 12.80 pp** incl. the PEPCH
**· PERI 4.90 pp · Estudio de Detalle 3.34 pp**) plus the 12.02 pp of `usos_globales` lucrative land,
**100 %** of which carries an `actuacion`. ⚠ **Córdoba's Murcia moment**: this delegation lives in a
**separate layer** (`coaco:actuaciones`), so an `ordenanzas`-only census is structurally blind to it —
the same shape as Murcia's 41.4 pp `calificacion` case. **Those parcels must refuse, and the refusal
is a correct answer.**

> ⚠⚠ **CORRECTED 2026-08-01 (second pass).** This paragraph said **"7 of the 13 registered subzones
> bind ZERO pilot land (PAS-1 · PAS-3 · OA-2 · UAD-2 · UAD-3 · MC-1 · MC-3)"**. **It is FOUR.**
> Measured live against `coaco:ordenanzas` through the **shipped** `subzoneCodeFromLink` parse:
> **MC-2 38.819 % · OA-1 18.235 % · CTP-1 17.201 % · PAS-2 10.608 % · UAD-1 3.463 % · MC-4 3.386 % ·
> UAD-3 1.934 % · MC-3 0.620 % · MC-1 0.061 %** of ordenanzas land (Σ = 94.328 %, which is exactly the
> 94.33 % routing fraction the dossier already quoted — so the "7" was internally inconsistent with a
> number on the same page). **Bind zero: PAS-1 · PAS-3 · OA-2 · UAD-2.**
> ⚠ **Consequence for the D1 defect, and it is a severity change:** `CLOSURE-REGISTER.md` blocker 4
> called D1 *latent* because *"UAD-3 binds 0.00 %"*. **False.** UAD-3 binds 31 505.01 m². D1 is latent
> **only** because the gate is shut.

**4 of the 13 registered subzones bind ZERO pilot land** (PAS-1 · PAS-3 · OA-2 · UAD-2). Nine bind
land; **none of them renders today**, because the gate is shut *and* the resolver is never called.

**OCR fidelity is no longer the blocker.** All 13 subzones were re-read 2026-08-01 from the publisher's
own PDFs via raster render (4 of 5 documents have a **zero-character text layer**; `O_UAD3` uses subset
CID fonts) — **13/13 clean, zero wrong values**, pinned by
`packages/site-parcel-data/__tests__/esCordobaOcrVerification.test.ts`. Three defects were found, **none
a wrong shipped digit**: ⛔ **D1** the stated UAD *profundidad* (Art. 13.9.3.3, 16/18/16 m) is **missing
from the pack** — unguarded on UAD-3; **D2** the CTP-1 ocupación step was mis-documented (middle band is
an absolute **100 m²** cap, not 100 % — shipped 0.80 unaffected); **D3** the MC "no fondo stated"
rationale is false (Art. 13.5.2.4: depth is *libre*, bounded by ocupación) — the refusal stands on
**height alone**, so MC needs **no** block-fondo source.

**Do NOT flip `CORDOBA_ENVELOPE_VERIFIED` or reuse another municipality's numbers to make a demo
work** — an absent envelope costs nothing; a confident wrong one costs credibility (C58 §1.2,
§CONTEXT-DATA-HONESTY). Signing is additionally **conditional on the confidence-badge fix landing**.
Full ledger: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-1.

> ⚠ This paragraph used to say *"do not register the pack"*. Registration **has since happened**, on
> purpose and safely: it wires the pack, its refusal families and its extent into one table so the C60
> globe and the future subzone resolver cannot disagree, while the **dispatcher's gate refuses the
> whole pilot before the registry is consulted**. The line that must not be crossed is the **gate**,
> not the registration. Full posture, the residual latent risk it leaves, and exactly what a signature
> would and would not authorise: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).

## The human legal work to flip the gate

1. ⬆ **The machine half is DONE (2026-08-01): 13/13 subzones verified, zero wrong values.** What remains
   is the **legal act** — the founder signing `sources/VERIFICATION.md` §SIG-1 (L-449), which moves the
   tier `pipeline-extracted-unverified` → `estimated-ruleset` and unlocks **≈ 16 % full / ≈ 31 % any
   envelope of pilot buildable land** (NOT the withdrawn ~19 %/~89 %). ⚠ Conditional on the
   confidence-badge fix landing, and on **D1** (missing UAD depth) being closed before UAD-3 may bind.
2. Extend the COACo calificación pilot beyond 2/10 districts (external / curation) — the only lever that
   raises the *municipality-wide* rate off ~0 %.
3. Build a Córdoba street-width resolver (Manzana Cerrada height table → parcel answer).
4. ✅ **DONE** — `esCordobaPGOU2001.ts` is registered. ⚠ It renders **only** after sign-off, and even
   then **only** at the `pipeline-extracted-unverified` amber tier, never `estimated-ruleset`.
5. ⚠ Steps 1 and the WIRING-TODO-5 subzone resolver must land **together**: a signature without the
   resolver renders nothing (no parcel can bind a subzone), and the resolver without a signature is
   inert. Sequencing them apart wastes the legal act.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `findings/OCR-EXTRACTION-RESULTS.md`,
`findings/CALIFICACION-ENDPOINT-PROBE.md`, `findings/ORDENANZA-PACK-SPEC.md`. Sibling:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).*
