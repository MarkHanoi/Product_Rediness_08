# VERIFICATION — Córdoba (es-an, 14021) — the human sign-off ledger

> **The L-449 gate.** Transcribing an ordinance into a buildability engine is a **legal act**, not an
> engineering one. This file records **who signed what, when, against which document** — and, just as
> importantly, **what each signature does NOT authorise**. Shape follows
> [`../../../es-ct/08019-barcelona/sources/VERIFICATION.md`](../../../es-ct/08019-barcelona/sources/VERIFICATION.md).
>
> **Signing a SOURCE ≠ certifying its NUMBERS.** Keep the two gates separate.

---

## Sign-off status: **NOT SIGNED.** ⚠ The pack is nevertheless **REGISTERED** — read §SIG-1 before assuming that is a defect

| | |
|---|---|
| **Gate constant** | `CORDOBA_ENVELOPE_VERIFIED` (`rulepacks/esCordobaZoneClassification.ts`) |
| **Value in `main`** | **`false`** |
| **Registered?** | **YES** — `rulepacks/registry.ts`, `packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK, CORDOBA_PGOU2001_ZONE_CODES])`, **13 subzones** (PAS-1…3 · OA-1…2 · UAD-1…3 · CTP-1 · MC-1…4) |
| **What a user sees today** | a cited **machine-extracted-unverified refusal** on every Córdoba parcel. **No number.** |
| **Proven by** | `apps/editor/__tests__/cordobaSiteDispatch.test.ts` — drives the **real** `dispatchParcelBoundary` on a Sur-district point, and fails if the `isInCordoba` branch is removed |

> ⚠ **THIS FILE WAS STALE UNTIL 2026-08-01.** It said *"research draft — no pack"* while a 13-subzone
> OCR pack had been authored **and registered**, and it recorded *"No edits to `registry.ts`"* as a
> constraint honoured. A verification ledger that under-states what shipped is worse than none: it is
> the document a reviewer consults to decide whether numbers are live. Corrected here, and the live
> state re-established by **driving the dispatch**, not by reading either file.

---

## SIG-1 · ⛔ **UNSIGNED** — the PGOU-2001 OCR extraction (`CORDOBA_ENVELOPE_VERIFIED`)

| | |
|---|---|
| **Verifier** | — (**no human has reviewed the ordinance documents**) |
| **Date** | — |
| **Axis** | ENVELOPE (and, downstream, LEGISLATION) |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts` → `ES_CORDOBA_PGOU2001_PACK` |
| **Source** | PGOU-Córdoba-2001 (*Plan General de Ordenación*, Texto Refundido Oct. 2002), Gerencia de Urbanismo, Ayuntamiento de Córdoba. Calificación geometry: COACo GeoServer `coaco:ordenanzas` |
| **Provenance tier** | **`pipeline-extracted-unverified`** — the permanent bottom rung of `RulePackDefaultConfidenceSchema`. The 15 ordinance PDFs are **scanned images** (`pdftotext` → 3 chars); every value is single-pass machine vision |

### What signing WOULD authorise

- Rendering a buildable envelope for the **13 packed subzones** inside the **COACo Sur + Noroeste
  pilot** — `CORDOBA_BBOX`, ≈ 3.4 × 4.8 km, Σ `sup_m2` ≈ **1.63 km²** over **453** calificación
  polygons, `coaco:distritos` = exactly **2** features.
- At the **`pipeline-extracted-unverified` tier only**, with the louder-than-estimated affordance —
  **never** `estimated-ruleset`, and never `structured`.
- Expected reach *inside the pilot*, as measured by the extraction run
  (`../findings/OCR-EXTRACTION-RESULTS.md`, quoted in `../ENVELOPE.md`): **≈ 19 % of pilot parcels
  fully numeric**, **≈ 89 % partial**.
- It would ALSO require, in the same change, the COACo subzone resolver (pack WIRING-TODO 5) — without
  it a signature renders nothing, because no parcel can bind a subzone.

### What signing would **NOT** authorise

- **Anything outside the two pilot districts.** Córdoba has ~10; a click elsewhere must keep degrading
  to the national SIU *clasificación* (land class), **never** a borrowed pilot number.
- **The PEPCH casco histórico** — a separate Plan Especial with a dual regime, explicitly out of scope
  and not to be silently mis-qualified by an adjacent ordenanza.
- **A scalar height for Manzana Cerrada (MC-1…4).** The ordinance publishes height as a
  *per-street-width table*; there is no Córdoba street-width resolver, so those stay `null`. A
  signature does not create the resolver.
- **An edificabilidad for MC or CTP-1.** Both are **DERIVED BY ALGORITHM** in the ordinance, not
  stated as a number. The pipeline correctly emits `null`; signing an OCR run cannot convert an
  algorithm into a scalar (the Barcelona Art. 242.2 lesson, ADR-0271).
- **Promotion of the confidence tier.** OCR-derived stays `pipeline-extracted-unverified` however
  carefully it is checked; a *second, independent* source would be required to move it.
- **Any claim about the municipality-wide rate.** That is `UNMEASURED` — no municipal buildable-land
  denominator has been computed for Córdoba (contrast Murcia, where 75.145 km² was measured).

### The open gate — what a human must confirm, item by item

1. **OCR fidelity of the 15 ordinance PDFs** — that extracted edificabilidad / nº plantas / ocupación /
   retranqueos / parcela mínima match the scanned source, **per ordenanza**. No interpolation, no
   cross-ordinance borrowing. (`../findings/OCR-EXTRACTION-RESULTS.md` §2 against the source crops.)
2. **Geometric-rule kind (C58 §2.2)** — confirm each ordenanza is coverage-and-FAR vs alignment vs
   setback. Do not assume; **the wrong kind is worse than a wrong number.**
3. **Coverage honesty** — that the pack labels itself as covering **only** Sur + Noroeste
   (`CORDOBA_ROADMAP_LINE` does), and that clicks elsewhere degrade to SIU clasificación.
4. **Positional agreement** — a sample Catastro parcel classified by `coaco:ordenanzas` agrees with the
   municipal viewer for that same plot.
5. **PEPCH exclusion** — that the casco histórico is explicitly out of scope, not silently
   mis-qualified by an adjacent ordenanza.

### What WAS machine-verified (agent, browser-UA curl, 2026-07-23)

Endpoint discovery + reachability only — see `../findings/CALIFICACION-ENDPOINT-PROBE.md` §7 for
copy-paste reproduction:

1. `geoserver.pgou.coacordoba.org/geoserver` WFS 2.0.0 + WMS 1.3.0 return HTTP 200; provider = COACo.
2. `coaco:ordenanzas` = **453** calificación polygons; schema `{geom, ordenanza, et, sup_m2, link}`;
   10 distinct calificación families; 15 distinct ordinance-PDF links.
3. `coaco:distritos` = **2** features (Sur, Noroeste) → pilot coverage, not the municipality;
   ordenanzas bbox ≈ 3.4 × 4.8 km, Σ `sup_m2` ≈ 1.63 km².
4. `coaco:actuaciones` = 42 derived-planning ámbitos; direct-ordenanza polygons (453) ≫ derived (42).
5. National SIU is live (`mapas.fomento.gob.es/arcgis`); clasificación for INE 14021 = 6 classes, in
   force; Planeamiento_Vigente = Plan General 2002. **No national calificación service exists.**
6. One ordinance PDF (`O_PAS2.pdf`) fetched: 762 KB, `%PDF-1.7`, HTTP 200; `pdftotext` → 3 chars ⇒
   **scanned**.
7. `coaco:vcatastro_urbanismo` refcat key-join VERIFIED-LIVE for `3834946UG4933S` → ordenanza
   *Colonia Tradicional Popular*, `zona_nom = Sur`, `sup_pc_m2 = 165`
   (`../findings/CORDOBA-DATA-RECON-SPIKE.md` §4 step 2).

**None of the above verifies a NUMBER.** Reachability is not fidelity.

---

## Why "registered but unsigned" is a deliberate posture, not an oversight

Registration wires the pack, its refusal families and its extent into ONE table so the C60 coverage
globe, `resolveZoneDisposition` and the future subzone resolver cannot disagree about Córdoba. It is
**not** an authorisation to draw, and three independent facts hold that line:

- `applyCordobaZoningThenFallback` (L5) checks `CORDOBA_ENVELOPE_VERIFIED` **first** and refuses the
  whole pilot **before** the registry is consulted;
- the COACo subzone resolver (pack WIRING-TODO 5) is **not wired**, so no Córdoba parcel can bind a
  PAS/OA/UAD/CTP/MC code at all — the refusal names the *pilot*, not a subzone;
- the Córdoba leg makes **no planning network call whatsoever** (pinned by the dispatch test).

⚠ **The residual risk this posture leaves, recorded so it is not discovered later.**
`registeredPackZoneCodes('es-14021-cordoba')` returns 13 codes, so
`classifyAnswerability(CORDOBA_JURISDICTION_ID, 'PAS-1')` returns **`'full-envelope'`** — a claim no
Córdoba parcel can currently honour. `answerabilityClass.ts` is not yet re-exported from the package
index and no shipping surface consumes it (its own header sequences it behind L-600), so this is
**latent, not live**. It must be resolved *before* that classifier reaches a user surface — and the
fix belongs with the classifier (teach it the verification gate), not by de-registering the pack.
The same statement applies to Murcia (`es-mc/30030-murcia/sources/VERIFICATION.md`).

---

## Standing caveat on every signature in this file

**`honestyOk` is launch-blocking; a completion percentage is not.** A signature authorises PRYZM to
*publish* a number at a *stated confidence*; it never converts an estimate into an authoritative
determination, and it never makes PRYZM's output a permit.

*Maintainer: UNASSIGNED. Authority: C58 §1.2/§1.4/§1.6 · C60 §3 · C63 · L-449 · §CONTEXT-DATA-HONESTY.
Last updated 2026-08-01 — status re-established by driving the real dispatch, not by reading the code.*
