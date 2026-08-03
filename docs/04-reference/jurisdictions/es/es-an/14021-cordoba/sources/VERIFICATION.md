# VERIFICATION — Córdoba (es-an, 14021) — the human sign-off ledger

> **The L-449 gate.** Transcribing an ordinance into a buildability engine is a **legal act**, not an
> engineering one. This file records **who signed what, when, against which document** — and, just as
> importantly, **what each signature does NOT authorise**. Shape follows
> [`../../../es-ct/08019-barcelona/sources/VERIFICATION.md`](../../../es-ct/08019-barcelona/sources/VERIFICATION.md)
> (SIG-2 / SIG-3).
>
> **Signing a SOURCE ≠ certifying its NUMBERS.** Keep the two gates separate.

---

## Sign-off status: **NOT SIGNED** — but, as of 2026-08-01, **SIGNABLE**

| | |
|---|---|
| **Gate constant** | `CORDOBA_ENVELOPE_VERIFIED` (`rulepacks/esCordobaZoneClassification.ts`) |
| **Value in `main`** | **`false`** |
| **Registered?** | **YES** — `rulepacks/registry.ts`, **13 subzones** (PAS-1…3 · OA-1…2 · UAD-1…3 · CTP-1 · MC-1…4) |
| **What a user sees today** | a cited **machine-extracted-unverified refusal** on every Córdoba parcel. **No number.** |
| **Proven by** | `apps/editor/__tests__/cordobaSiteDispatch.test.ts` — drives the **real** `dispatchParcelBoundary` |
| **OCR fidelity** | ⬆ **VERIFIED 2026-08-01, parameter by parameter, 13/13 subzones, ZERO wrong values** (§SIG-1 below) |
| **Measured ENVELOPE ceiling** | ⬆ **≈ 16 % full / ≈ 31 % any envelope of BUILDABLE land** in the published pilot — **not** the ≈ 19 % / ≈ 89 % previously quoted (§SIG-1 *what signing authorises*) |
| **Whole-municipality ceiling** | ⬆ **NO LONGER `not-composable` (2026-08-01)** — **≈ 1.7 % any / ≈ 0.9 % full of Córdoba's 33.342 km² of SUELO URBANO** (national SIU `OGC_Clases_Suelo`, INE 14021, in force). The published calificación is **4.88 %** of that land |
| **Closure** | ⬆ **≈ 95 % of Córdoba's urban land is now TERMINAL** — the ~8 districts outside the pilot get a cited `no-plan-at-point` refusal instead of the fabricated estimated triple they were getting until 2026-08-01. See [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) blocker 1 |

> ⚠ **The previous version of this file said the OCR "has never been checked against the source" and
> that a signature would unlock "≈ 19 % fully numeric / ≈ 89 % partial".** The first is now false — the
> check has been done. The second was **wrong by a factor of ~3** on the partial figure: it was a
> parcel-count census over ordenanza families that was **structurally blind to delegation** and never
> asked whether a subzone could bind. Both are corrected below, from measurement.

---

## SIG-1 · ⛔ **UNSIGNED** — the PGOU-2001 ordinance transcription (`CORDOBA_ENVELOPE_VERIFIED`)

| | |
|---|---|
| **Verifier** | — (**awaiting the founder's legal act**) |
| **Date** | — |
| **Axis** | ENVELOPE (and, downstream, LEGISLATION) |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts` → `ES_CORDOBA_PGOU2001_PACK` |
| **Source** | PGOU-Córdoba-2001 (*Plan General de Ordenación*, Texto Refundido Oct. 2002), **"Normativa: Usos Ordenanzas y Urbanización"**, Gerencia de Urbanismo, Ayuntamiento de Córdoba — served by the publisher at `visor.pgou.coacordoba.org/doc/ordenanzas/`. Calificación geometry: COACo GeoServer `coaco:ordenanzas` |
| **Provenance tier now** | **`pipeline-extracted-unverified`** — the permanent bottom rung |
| **Tier a signature would authorise** | **`estimated-ruleset`** (one rung up, and no further — see *does not authorise*) |

### The question being signed

**Do the 13 subzone parameter sets shipped in `ES_CORDOBA_PGOU2001_PACK` faithfully transcribe the
PGOU-2001 articles they cite — and may PRYZM publish them, at `estimated-ruleset`, on the land those
subzones actually bind?**

### What the machine verification established (2026-08-01) — this is what a signature now rests on

The pack was **no longer** single-pass. Every cited article was re-read from the publisher's own PDFs by
an **independent second method**:

1. **All 15 ordinance PDFs re-fetched** from `visor.pgou.coacordoba.org` (HTTP 200 after a 301 → HTTPS).
   Byte sizes reproduce the 2026-07-23 profile exactly; `O_MC3.pdf` ≡ `O_MC4.pdf` are **md5-identical**;
   `O_UAD1.pdf` / `O_UAS1.pdf` are confirmed 69-byte "Server under construction" HTML.
   Document identity is pinned by md5 in `../findings/OCR-EXTRACTION-RESULTS.md` §1.
2. **The extraction traps were tested, not assumed.** `O_PAS2`, `O_OA1`, `O_CTP1`, `O_MC` carry a
   **zero-character text layer** — `extract_text()` returns nothing, so any text-pull reading of them
   would have been silent fabrication. `O_UAD3` *does* have text but through **subset CID fonts**
   (`CIDFont+F1…F4`) — the exact digit-dropping / glyph-shift trap.
3. **Therefore every cited page was RENDERED and read as a raster** (`get_pixmap`, 160 dpi; 380–400 dpi
   crops for the three contested clauses). No value below was taken from a text layer.

**Result: 13 of 13 subzones survived unchanged. Every shipped numeric value matches the source. Zero
wrong digits, zero glyph shifts, zero mis-transcribed decimals.** Full per-parameter table with
verbatim quotes and article numbers: [`../findings/OCR-EXTRACTION-RESULTS.md`](../findings/OCR-EXTRACTION-RESULTS.md) §2;
pinned in code by `packages/site-parcel-data/__tests__/esCordobaOcrVerification.test.ts`.

Notably confirmed rather than assumed:
- **MC-3 `plotRatioFAR: 3.5`** — the value that trips the FAR range gate `[0.2, 3.0]` — is **correct**,
  verbatim *«En MC-3 la edificabilidad neta será 3,50 m2/m2»* (Art. 13.5.2.2). The gate flag was a
  false alarm about a real number, not a bad read.
- **Every `null` is correct.** MC-1/2/4 and CTP-1 edificabilidad really are *"resultante de la
  aplicación de las Normas de Composición"* (Arts. 13.5.2.2 / 13.8.2.3) — an algorithm, not a number.
  MC height really is a **per-street-width table** (Art. 13.5.3.1); the table transcribed in the
  findings is **exact, band for band, for all four subzones**.

**✅ ENGINE PRECONDITION — DISCHARGED** (L-665, 2026-08-01). Until this date the *"at the
`pipeline-extracted-unverified` tier only"* line below **could not be honoured by the code**:
`ZoningRulesEngine` hard-coded `estimated-ruleset` and never read a pack's `defaultConfidence`, so a
signature would have published Córdoba's OCR-derived numbers under the same violet *"Estimated"* chip
as a hand-transcribed pack. Two fixes landed, ahead of the signature:

1. **§PACK-CONFIDENCE-CEILING** — the engine clamps its solve to the pack's declared ceiling
   (`capEnvelopeConfidenceToPackDefault`; a **ceiling**, never a promotion). A solved PGOU-2001
   subzone now stamps **`pipeline-extracted-unverified`** and renders the **red "⚠ Unverified ·
   machine-extracted"** chip, with a caveat naming the error as **ours, not the publisher's**; the
   per-row provenance badge reads **"⚠ MACHINE"**, not the green "PUB".
2. **§ENVELOPE-PUBLICATION-AUTHORISATION** — `classifyAnswerability` reads
   `CORDOBA_ENVELOPE_VERIFIED`, so the 13 packed subzones classify **`pack-unverified`**. They had
   claimed **`full-envelope`** — a real buildable volume — **since the day the pack was registered**.
   ⚠ Fixed in the classifier, deliberately **not** by de-registering the pack: registration wires
   routing, it does not authorise output, and de-registration would also put out the C60 coverage
   globe (Córdoba *does* answer — with an honest cited refusal).

Pinned by `packages/site-parcel-data/__tests__/packConfidenceCeiling.test.ts` and
`envelopeAuthorisation.test.ts`. This removes an engine blocker; it verifies **no ordinance value** —
every item in *"The open gate"* below still stands, unchanged.

### What signing WOULD authorise

Publishing an envelope, at **`estimated-ruleset`**, on the land the pack actually binds — **measured,
against the L-656 denominator (BUILDABLE land, not all land, not clicks)**:

| | |
|---|---|
| **Denominator — buildable land in the COACo published pilot** | **1,850,780 m² (1.851 km²)** = `coaco:ordenanzas` private-ordinance land **1,628,301 m²** + `usos_globales` lucrative (Residencial + Industrial/Terciario) **222,479 m²**. Espacios Libres and Equipamientos are excluded — they are public systems, not buildable land. Geometry self-checked: shoelace areas reproduce the publisher's own `sup_m2` to **−0.019 %** (worst feature 0.02 %) |
| **Full numeric envelope** | **≈ 16 %** of that buildable land (16.23 % under the shipped link key; 15.94 % under the independent `et` key) |
| **Any envelope (full + partial)** | **≈ 31 %** (31.20 % / 30.91 %) |
| **Correctly REFUSED** | **≈ 69 %** — and these are *correct answers*, not coverage gaps |

**Only 4 of the 13 registered subzones would ever render anything:**

| Subzone | Buildable land bound | Outcome if signed |
|---|---:|---|
| **OA-1** | 14.33 % | renders FULL |
| **CTP-1** | 14.97 % | renders PARTIAL (height + coverage + 16 m depth band; FAR derived-null) |
| **UAD-1** | 1.26 % | renders FULL |
| **PAS-2** | 0.64 % | renders FULL |
| MC-2 | 13.88 % | **REFUSES** — structural (height is an unresolved street-width table) |
| MC-4 | 2.98 % | **REFUSES** — structural |
| **PAS-1 · PAS-3 · OA-2 · UAD-2 · UAD-3 · MC-1 · MC-3** | **0.00 %** | **7 of 13 subzones bind NO land at all** in the published pilot |

A signature is therefore worth **≈ 31 % of 1.851 km²**, concentrated in **two** subzones (OA-1 + CTP-1
are 29.3 pp of the 31.2). It is **not** worth the ≈ 89 % this file previously advertised.

⚠ **A signature ALONE still renders nothing.** The COACo subzone resolver is **AUTHORED but NOT
CALLED** — the classic authored-but-unwired trap, checked here by grep rather than assumed:
`providers/resolveCordobaSubzone.ts` exists, is re-exported from the package index, and has its
server proxy (`server/cordobaZoningProxy.js`) — but **`applyCordobaZoningThenFallback` never invokes
it**, and says so in its own comment (*"no COACo subzone resolver is wired yet (WIRING-TODO 5)"*),
using a `cordoba-pgou-2001-pilot` placeholder zone code instead. So **no Córdoba parcel can bind a
subzone today**, and the signature and the resolver call site must land in the **same change**.
Its `derivedPlanningOverride` branch (non-empty `actuacion` ⇒ derived-planning refusal) is
**load-bearing** for the ≈ 50 % delegation refusal below and must be exercised, not merely present.

### ⬆ 2026-08-01 (second pass) — TWO MORE PRECONDITIONS DISCHARGED, and one FALSE CLAIM DELETED

Neither changes what a signature is worth; both change what surrounds it.

1. **§CORDOBA-MUNICIPAL-CLOSURE.** Outside the pilot PRYZM was **publishing a fabricated envelope** —
   the generic `estimated-default` triple (3,0 / 1,5 / 3,0 m, FAR 2,00, 50 % coverage) — on **95.1 %
   of Córdoba's SUELO URBANO**, because no registration claimed that land and the §L-663 chokepoint
   reads an unclaimed point as *"genuinely uncovered land, the estimate is honest here"*. A
   refusal-only municipal registration (`es-14021-cordoba-municipal`, no pack, ever) now returns a
   cited `no-plan-at-point` card there. ⚠ **This is not coverage and must never be reported as
   coverage** — it is the honest "no" that was missing.
2. **§CORDOBA-REFUSAL-SPLIT.** Four distinct absences shared two cards. Split into four
   (outside-pilot · no-polygon-at-point · unbindable-subzone-key · not-transcribed), so a publisher
   gap can no longer read as PRYZM's backlog.
3. ⛔ **A FALSE STATEMENT ABOUT OUR OWN COVERAGE WAS SHIPPING, IN EVERY CÓRDOBA REFUSAL.**
   `CORDOBA_ROADMAP_LINE` ended *"Outside the two districts, a click falls back to the national SIU
   land classification, never a borrowed pilot number."* **PRYZM does not fall back to SIU.** The
   proxy is mounted (`server/siuClassificationProxy.js`, `server.js:509`) and **no client code calls
   it** — grep over `packages/*/src` and `apps/*/src`, zero callers. Deleted, not softened. This is
   the same defect class that removed Barcelona's `13b` / `22a` / `22@` / bare-`20a` branches, with
   the sign reversed: there we claimed to lack what we held; here we claimed to hold what we lack.
4. ⚠ **A NEW BINDING GAP, MEASURED:** **14 of 453 `coaco:ordenanzas` polygons carry a bare
   `O_MC.pdf`** (18 539 m², **1.14 %** of ordenanzas land) — the Manzana Cerrada family chapter with
   **no subzone suffix**. `OCR-EXTRACTION-RESULTS.md §1`'s claim that *"the filename suffix routes the
   polygon to subzone MC-1/2/3/4"* is **false for these 14**, and is corrected. They cannot bind, and
   a signature does not make them bindable.

### What signing would **NOT** authorise

- **The ≈ 50 % of pilot buildable land that is DELEGATED to a later instrument.** Measured, not
  assumed: **169 of 453** `coaco:ordenanzas` polygons (**699,772 m² = 42.98 %** of direct-ordinance
  land) fall inside a delegating ámbito — **Plan Parcial 16.76 pp · Plan Especial 12.80 pp (incl. the
  PEPCH) · PERI 4.90 pp · Estudio de Detalle 3.34 pp** — plus the **222,479 m² (12.02 pp)** of
  `usos_globales` lucrative land, **100 %** of which carries an `actuacion`. Those parcels must take the
  **derived-planning refusal**, never the base ordenanza. ⚠ This is Córdoba's **Murcia moment**: the
  delegation lives in a *separate layer* (`coaco:actuaciones`), so the ordenanza-family census in
  `OCR-EXTRACTION-RESULTS.md §4` — the source of the "89 %" — was **structurally blind to it**, exactly
  as the 41.4 pp Murcia `calificacion` case was. **A cited refusal here is the correct answer.**
- **Anything outside the two pilot districts.** `coaco:distritos` has exactly **2** features of Córdoba's
  ~10 (re-queried 2026-08-01: still 2 — Sur 2 488 983 m² + Noroeste 2 472 362 m² = **4.96 km²**).
  Elsewhere a click gets the cited `no-plan-at-point` refusal, **never** a borrowed pilot number.
  ⬆ **CORRECTED:** the municipality-wide rate is **no longer `not-composable`.** The national SIU
  *clases de suelo* service composes it — **SUELO URBANO 33 341 928 m²**, municipal term 1 254.3 km²,
  all in force — giving a whole-city ceiling of **≈ 1.7 % any / ≈ 0.9 % full**, with the published
  calificación covering **4.88 %** of SUELO URBANO. ⚠ *Signing authorises nothing outside the pilot at
  any of those rates.*
- **The PEPCH casco histórico** — a separate Plan Especial with a dual regime, explicitly out of scope.
- **A scalar height for Manzana Cerrada (MC-1…4).** Art. 13.5.3.1 publishes height as a
  *per-street-width table*; there is no Córdoba street-width resolver, so those stay `null` and MC keeps
  its structural refusal. A signature does not create the resolver — and MC is **16.86 %** of buildable
  land, the single largest unlock still outstanding.
- **An edificabilidad for MC-1/2/4 or CTP-1.** Both are **DERIVED BY ALGORITHM** in the ordinance. The
  pipeline correctly emits `null`; signing cannot convert an algorithm into a scalar (the Barcelona
  Art. 242.2 lesson, ADR-0271).
- ~~**UAD-3 rendering at all** — see the blocking limit below.~~ **CLOSED 2026-08-02, `ef0e966b`** — see item 1 below, updated.
- **Any tier above `estimated-ruleset`.** The verification was a **second independent METHOD against
  the same document**, not a **second independent SOURCE**; it removes the "nobody has checked it"
  defect that justified the bottom rung, and nothing more. `structured` requires the publisher to serve
  the numbers as data (COACo does not). ⚠ **`authoritative` is UNREACHABLE and must not be proposed:**
  no production path assigns it, and a constructed determination is capped at **0.70** on ENVELOPE.
- **Promoting `fieldProvenance` to `ordinance-pdf`.** That tier means *a human* transcribed the PDF.
  The 2026-08-01 pass was machine vision. It stays `pipeline-extracted`.

### Known limits accepted at signing

1. ✅ **CLOSED 2026-08-02 (`ef0e966b`) — was BLOCKING.** Art. **13.9.3.3**'s real depth cap —
   **UAD-1 16 m · UAD-2 18 m · UAD-3 16 m** (verified at 380 dpi) — was stated in the source but
   absent from the pack. All three UAD subzones now carry an `alignment` geometricRule with the
   stated depth. UAD-3's L-616 mechanism-A exposure (`front_m: 0` + `side_m: 0` party-wall +
   `rear_m: 5`, no depth band ⇒ near-full-parcel draw) is closed the same way CTP-1's `alignment`
   rule and MC's unresolvable ring already guard their own families. UAD-3 still binds **0.00 %** of
   pilot land today, so this changed no live number — it removed a latent risk before it could ever
   fire. Independently re-verified (git-log cross-check against the live code) 2026-08-03 by a
   separate audit pass — see `docs/04-reference/jurisdictions/ENVELOPE-REALISM-MATRIX.md`'s
   corrected Córdoba row for the parallel finding on CTP-1/MC.
2. ⚠ **The CTP-1 ocupación step-function is mis-documented (the shipped number is right).** The source
   (Art. 13.8.2.5, verified at 400 dpi) reads: *«Parcelas de hasta 100 m2, el 100%. Parcela de más de
   100 m2 y menos de 125 m2, **100 m2**. Parcelas de más de 125 m2, el 80%.»* The middle band is an
   **absolute 100 m² cap, not 100 %** — `OCR-EXTRACTION-RESULTS.md` and the pack comment both said
   "100 %". The **shipped `maxCoverage: 0.8` is correct** (it is the >125 m² value, and conservative),
   so nothing user-visible is wrong; but anyone implementing the step-function hook (WIRING-TODO 6)
   from the old comment would over-state a 124 m² parcel by ~24 %. Corrected in both places.
3. ⚠ **The MC structural-refusal RATIONALE was wrong, though the refusal is right.** The pack asserts
   MC states no *profundidad edificable*. Art. **13.5.2.4** in fact states: *«Cuando este parámetro no
   venga expresamente fijado, se entenderá **libre**, con la única condición de que la ocupación del
   edificio en planta no podrá rebasar los límites que se establecen en el apartado 5»* — depth is
   **unconstrained**, bounded by coverage, which the pack **holds** (0.70 / 0.90). MC's real and only
   blocker is **height**. Consequence: WIRING-TODO 6's "MC block-fondo geometry source" is **not
   required by the ordinance** — MC needs the street-width height resolver alone, a materially cheaper
   unlock than recorded.
4. ⚠ **The subzone key is corroborated but not documented by the publisher.** COACo publishes no data
   dictionary. The shipped resolver parses the subzone from the `O_*` link basename; the layer also
   carries an `et` attribute. Tested against each other: **262 polygons populate both, they AGREE on
   262, and DISAGREE on 0** — and the two keys yield ceilings within **0.3 pp**. That is genuine dual
   -source corroboration for the *key*. ⚠ But note the link basename is **not** self-evidently a
   subzone marker: each PDF is a **whole family chapter** (`O_PAS2.pdf` contains PAS-1, PAS-2 *and*
   PAS-3; `O_MC*.pdf` are one 3-page MC chapter). It works because COACo assigns it per polygon, which
   the agreement test evidences — **not** because the filename encodes the subzone. Recorded as
   `status: corroborated-by-attribute, finding: publisher-undocumented` (L-661).
5. ⚠ **Single-source.** No second publisher states these parameters; dual-source corroboration of the
   *numbers* was not run and cannot be, from what Córdoba publishes.
6. ⛔ **Signing is CONDITIONAL on the confidence-badge fix landing.** A separate work-stream is
   repairing the defect where the engine **ignores a pack's declared confidence**. Until that lands, a
   signature would publish these values without the louder-than-estimated
   `pipeline-extracted-unverified` / `estimated-ruleset` affordance the whole posture depends on. **Do
   not flip `CORDOBA_ENVELOPE_VERIFIED` before that fix is merged.** (Not touched here:
   `ZoningRulesEngine.ts` and `answerabilityClass.ts` are out of scope for this ledger.)
7. ⚠ **The latent answerability over-claim, restated.** `registeredPackZoneCodes('es-14021-cordoba')`
   returns 13 codes, so `classifyAnswerability(CORDOBA_JURISDICTION_ID, 'PAS-1')` returns
   `'full-envelope'` — a claim **no** Córdoba parcel can honour, and now demonstrably false for the
   **7 of 13** subzones that bind zero land. `answerabilityClass.ts` is not re-exported and no shipping
   surface consumes it, so this is **latent, not live**. It must be fixed **in the classifier** before
   that classifier reaches a user surface. Same statement applies to Murcia.

### What was machine-verified earlier (agent, browser-UA curl, 2026-07-23) — reachability only

Endpoint discovery and reachability, reproduced and still true on 2026-08-01: WFS 2.0.0 + WMS 1.3.0
HTTP 200; `coaco:ordenanzas` = **453** polygons, Σ `sup_m2` ≈ **1.63 km²**; `coaco:distritos` = **2**;
`coaco:actuaciones` = 40–42 derived-planning ámbitos; national SIU live, **no national calificación
service exists**. See `../findings/CALIFICACION-ENDPOINT-PROBE.md` §7.

**None of that verifies a NUMBER. Reachability is not fidelity** — §SIG-1 above is the fidelity record.

---

## Why "registered but unsigned" is a deliberate posture, not an oversight

Registration wires the pack, its refusal families and its extent into ONE table so the C60 coverage
globe, `resolveZoneDisposition` and the subzone resolver cannot disagree about Córdoba. It is **not** an
authorisation to draw, and two independent facts hold that line:

- `applyCordobaZoningThenFallback` (L5) checks `CORDOBA_ENVELOPE_VERIFIED` **first** and refuses the
  whole pilot **before** the registry is consulted;
- the Córdoba leg makes **no planning network call whatsoever** while the gate is shut (pinned by
  `apps/editor/__tests__/cordobaSiteDispatch.test.ts`).

The line that must not be crossed is the **gate**, not the registration.

---

## Standing caveat on every signature in this file

**`honestyOk` is launch-blocking; a completion percentage is not.** A signature authorises PRYZM to
*publish* a number at a *stated confidence*; it never converts an estimate into an authoritative
determination, and it never makes PRYZM's output a permit.

*Maintainer: UNASSIGNED. Authority: C58 §1.2/§1.4/§1.6 · C60 §3 · C63 · L-449 · L-656 · L-661 ·
§CONTEXT-DATA-HONESTY. Last updated 2026-08-01 — OCR verified parameter-by-parameter against rendered
rasters of the publisher's PDFs; ENVELOPE ceiling measured against the buildable-land denominator;
delegation measured at ≈ 50 % of pilot buildable land.*
