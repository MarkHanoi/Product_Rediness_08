# VERIFICATION — Telde (es-cn, 35026, INE) — the human sign-off ledger

> **The L-449 gate.** Transcribing an ordinance into a buildability engine is a **legal act**, not
> an engineering one. This file records **what has been checked, by what method, against which
> document** — and, just as importantly, **what a signature would and would NOT authorise**. Shape
> follows
> [`../../../es-an/14021-cordoba/sources/VERIFICATION.md`](../../../es-an/14021-cordoba/sources/VERIFICATION.md).
>
> ⛔ **This document does not sign anything.** It is evidence assembled for a human with actual
> planning-law authority to read and decide. No agent, model, or automated process may set
> `CANARIAS_ENVELOPE_VERIFIED = true`. The Madrid NZ-1 incident (a model self-certifying a gate,
> commit `3e571724`, reverted in `dc4f92ec`) is the standing reason this line is drawn where it is.

---

## Sign-off status: **NOT SIGNED — SIGNABLE**

| | |
|---|---|
| **Gate constant** | `CANARIAS_ENVELOPE_VERIFIED` (`packages/site-parcel-data/src/rulepacks/esCanariasSipu.ts:112`) |
| **Value in `main`** | **`false`**, `signature: null` — **DO NOT CHANGE FROM THIS DOCUMENT** |
| **Registered?** | **YES** — `packages/site-parcel-data/src/rulepacks/registry.ts` (Telde block, lines ≈1559–1615), jurisdiction id `es-35026-telde` |
| **What a user sees today** | a cited refusal on every Telde parcel (`canariasNoRulePackRefusal` for packed zones with the gate shut, `canariasGraphedRefusal` for the GRF zones, or — if the parcel never reaches the Telde-specific path at all, see §5 below — the generic `estimateSuppressedRefusal` card). **No number, in every case.** |
| **Pack** | `packages/site-parcel-data/src/rulepacks/esTeldePgo2003.ts` → `ES_TELDE_PGO2003_PACK` |
| **Codebook** | `packages/site-parcel-data/src/rulepacks/esCanariasSipu.ts` (`SIPU_SENTINELS`, `SIPU_HEIGHT_DATUM`) |
| **Validator/provider** | `packages/site-parcel-data/src/providers/canariasSipuProvider.ts` (`readSipuValue`, `readSipuZone`) |
| **Test evidence** | see §3 — re-run 2026-08-03, both suites green (see below) |

**This is a "registered-and-refusing" pack, the same posture as Córdoba pre-signature.**
Registration wires the C60 coverage globe and `resolveZoneDisposition` honestly (Telde shows as
*present, gated* rather than *absent*); it authorises nothing. The gate constant is the only thing
standing between the repo and a drawn envelope, and this document is the evidence a signer would
read before touching it — **it is not a request to touch it**.

---

## 1. Exact scope — which zones are packed, and why the rest are not

Telde's SIPU `EDIF` table (the *Archivo de Zonas de Edificación* inside the Gobierno de Canarias'
`030319-pgo-ad-itpu-150323-210504-sipu.zip` package) carries **46 rows**. The pack ships **31**
with a drawable geometric rule and **deliberately excludes 15**, each with a named reason baked
into the code as `TELDE_UNPACKED_ZONES` (not a TODO list — the comment at
`esTeldePgo2003.ts:538–544` states plainly that omitting these reasons would invite a future
reader to "complete" the pack with null setbacks, which the engine insets by 0 and draws the
**whole parcel** — the L-616 mechanism-A failure).

### 1a. The 31 packed zones, by geometric grammar

| Grammar | Zone codes |
|---|---|
| **Setback** (`kind:'setback'`) | E · E1P · F · H · K1 · CO-UN1 · CO-UN2 · CO-PA1 · CO-PA2 · CO-SI · CO-PL · CO-SER1 · CO-SER2 · IN · IS · ST · IM |
| **Alignment + buildable depth** (`kind:'alignment'`) | G (DispObl=`AV`, 14 m fondo) · R1 · R2 · R3 · R4 · AG (DispObl=`F` + a metric `DispOblm` façade line, 15 m fondo) |
| **Occupation / coverage only** | B1 · B2 · K2 |

Every packed zone carries an `ordinanceRef` citing the specific PGO article — supplied by the
publisher's own `Obs*` column, not authored by PRYZM (see §2). Several zones are explicitly flagged
**PARTIAL** in their own `ordinanceRef` comment when the source's `Obs*` field carries a real
qualification rather than a bare citation (H, R1, AG) — see `classifyObservation` in the provider,
which distinguishes a bare article citation ("Art.229. Ordenanzas Municipales.") from a genuine
condition, failing safe toward "conditional" for anything not recognisably a bare citation.

### 1b. The 15 zones deliberately NOT packed, with the source-cited reason

Verbatim from `TELDE_UNPACKED_ZONES` (`esTeldePgo2003.ts:545–562`):

| Zone | Reason |
|---|---|
| **D1, D2** | `DispObl = GRF` — the building line is on a plan sheet PRYZM does not hold. |
| **C** | `FonMaxEdm` 21 m with NO alignment token at all — the datum EDGE is unknown, so the depth band cannot be placed. |
| **A1, A2, A3, A4, A5** | FAR + height only. No footprint rule ⇒ FAR alone does not draw (an envelope built from FAR with no setback/coverage/depth would silently occupy the entire plot). |
| **I** | `PMaxOcup` 100 % but `ObsPMO` carries a real qualification about sótanos (basements) — CONDITIONAL, not packed. |
| **J** | Equipamientos — no private envelope, every parameter is a sentinel. |
| **CO-H1, CO-H2** | Every parameter is a sentinel. |
| **CO** | Every parameter is a sentinel. |
| **SO** | Every parameter is a sentinel. |
| **INDEF** | "Indefinida" — the plan itself declares the zone undetermined. |

**Total: 31 packed + 15 unpacked = 46, matching the EDIF row count.** D1/D2's `GRF` (gráfico)
zones and the depth-without-datum `C` zone route through `canariasGraphedRefusal` /
`detectSipuGrammar`'s `depth-without-datum` branch — these are **structural** refusals that will
**keep refusing after any signature**, because the underlying determination is a drawing PRYZM
does not ingest, not a coverage gap a signature closes.

---

## 2. Evidence references

- **Primary source**: Gobierno de Canarias SIPU package
  `030319-pgo-ad-itpu-150323-210504-sipu.zip` (`EDIF.mdb`, table `EDIF`), served from
  `opendata.sitcan.es` — Telde's Aprobación Definitiva, adaptación PLENA (full adaptation), 2003.
  This is **structured published data** (the publisher's own typed columns), not an OCR pipeline
  and not a PDF transcription — a materially better starting provenance than Córdoba's
  `pipeline-extracted` tier, but still capped at `estimated-ruleset` because nobody has checked the
  columns against the *Normas Urbanísticas* they summarise (the SIPU package ships that PDF
  **unread**).
- **Article citations**: supplied by the publisher itself, verbatim, in each row's own `Obs*`
  column ("Art.225. Ordenanzas Municipales.", "Art.229. Ordenanzas Municipales.", "Art.141. Plan
  Estructural.", …) — so every packed zone names its governing article without PRYZM having read
  the plan text. This is unusual among the packs in this repo and is why `ordinanceRef` is
  populated on every Telde zone.
- **SIPU codebook citation**: `SIPU_SENTINELS` in `esCanariasSipu.ts` is validated against
  *"Manual de Sistematización de Planeamiento Vigente conforme a la ITPU-SIPU"*, Grupo de trabajo
  ITPU, Gobierno de Canarias, **Versión 02 (19-abr-2012), §10 "Tablas alfanuméricas"** — fetched and
  read directly from the primary source, not a secondary mirror. Confirmed 2026-08-03 (commit
  `8019d622`, `fix(es-cn): SIPU sentinel semantics corrected against VALIDATED primary codebook`):
  the sentinel `'I'` ("Indefinido") is defined verbatim as *"the plan does not establish direct
  substantive content"* — a real absence of determination, not a pointer elsewhere. The manual also
  corrected the file's prior citation: **"SIPU 2.6.A" does not appear anywhere in the primary
  document** — its only self-identified version string is *"N° versión: 02"*, and every prior
  citation of "SIPU 2.6.A" in the codebase was corrected to cite the manual as it names itself.
- **Sentinel-fix commit history** (`git log -- esCanariasSipu.ts`):
  - `f0cb6cf0` / `f29820db` / `0a0fd9b1` — `feat(es-cn/canarias): the SIPU adapter — Canarias
    publishes BOTH grammars as COLUMNS, and it still refuses` (initial adapter).
  - `797a5ce3` — `fix(es-cn/canarias): four height datums nobody had measured — RATED, and none of
    them moves the number` (added `AltMaxMt`/`AltMaxCornis`/`AltMaxCoron` to the height-datum
    dictionary; see `SIPU_RUSTIC_HEIGHT_NOTE` for the RUS/SRAR reallocation finding).
  - `a858e0ec` — `feat(es-cn/35026-telde): the bbox was SOURCED, not drawn — and Telde now reaches
    its adapter` (bbox provenance + registration reachability).
  - `8019d622` — `fix(es-cn): SIPU sentinel semantics corrected against VALIDATED primary codebook`
    (the codebook validation described above).
- **Validator plausibility/contradiction checks** (`canariasSipuProvider.ts`): `readSipuValue`
  enforces per-field numeric ranges (`RANGES`) and rejects out-of-range values by name
  (`zero-invalid`, `out-of-range`, `non-integer-floors`, `not-numeric`, `sentinel`, `absent`) rather
  than silently coercing them; `readSipuZone` additionally enforces a cross-field contradiction
  check — `PMaxOcup = 100` **alongside a published setback is rejected as `out-of-range`**, because
  the two are contradictory statements about the same footprint and the validator refuses to guess
  which one the publisher meant. Decimal-comma / thousands-separator parsing (`"7,5"` vs
  `"1.000"`) is handled explicitly, and `AltMaxPl` (a storeys column) rejects non-integer values —
  a documented real-world trap (a `7,5` in a storeys column is metres, not 7.5 floors).

---

## 3. Test evidence

Re-run live, this session (not trusted from the task brief — re-executed to get current numbers):

```
cd packages/site-parcel-data
npx vitest run __tests__/esCanariasTelde.test.ts __tests__/teldeRouting.test.ts
```

```
 RUN  v4.1.10 …/packages/site-parcel-data

 Test Files  2 passed (2)
      Tests  41 passed (41)
   Start at  21:11:29
   Duration  5.49s
```

**41/41 pass**, matching the number in the task brief. (Full-package `npx vitest run` — 2568/2568 —
was not re-run in this pass; §41/41 above is the number this document's claims rest on. A signer
should re-run the full suite themselves before relying on this ledger, per the standing "verify,
don't trust the last agent's number" discipline in this repo.)

---

## 4. Known limitations — including the one that is inconvenient

1. ⚠ **Single-source, unread against the Normas Urbanísticas.** The numbers come from the
   publisher's own typed `EDIF.mdb` columns — stronger than an OCR read — but nobody has opened the
   *Normas Urbanísticas* PDF the SIPU package ships alongside it and checked the columns against the
   article text. `defaultConfidence` is `estimated-ruleset`, not higher, for exactly this reason.
2. ⚠ **The dominant sentinel `'I'` is now confirmed, but the codebook validation is a second
   METHOD against the same document, not a second independent SOURCE.** It removes "nobody has
   checked what `I` means" as an open question; it does not promote the tier above
   `estimated-ruleset`.
3. ⚠ **Planes Insulares (island plans) sit above municipal determinations in the Canarian hierarchy
   and are UNMEASURED here.** They can only ever over-grant relative to what this pack computes, so
   under ADR-0283 a Canarias envelope must render as an OPEN TOP with a stated reason, never a
   closed maximum — even after signature. The same holds for unmodelled heritage / coastal (*Ley de
   Costas*) / airport-servitude / flood / environmental constraints.
4. ⚠ **Depth is genuinely near-absent across Canarias generally** (`FonMaxEdm` ≈3 % non-sentinel
   region-wide); Telde is one of the better-served municipalities on this axis (14–15 m fondo
   published for 6 of the 31 packed zones) but most packed zones draw from setback or coverage
   alone, with no depth band.
5. ⚠⚠ **THE MULTI-INSTRUMENT CLASSIFICATION INCONSISTENCY — surfaced here deliberately, not
   omitted.** `esCanariasSipu.ts` defines a conservative routing rule: a municipality is
   `CANARIAS_ROUTABLE_MUNICIPALITIES`-eligible only when the CKAN catalogue shows **exactly one**
   municipality-wide base planning instrument (PGO/Normas Subsidiarias) published for it, because
   Canarias publishes no vigencia (currency/validity) field anywhere and choosing among multiple
   candidate instruments would be a guess about which law applies. **Telde is NOT in that routable
   list.** The code's own comment at `esCanariasSipu.ts:422–435` states plainly that "Telde
   publishes several base-instrument resources, so by the conservative census rule above it is
   multi-instrument," and that it is routed anyway on a **different, separate argument**: the
   specific SIPU resource used (`030319-pgo-ad-itpu-…`) is labelled by SITCAN as the *adaptación
   PLENA* (fully adapted) plan, which supersedes the partially-adapted instruments it replaces.
   This is recorded in code as `TELDE_ROUTING_BASIS` and explicitly typed
   **`ASSERTED-UNVERIFIED`** — an argument, not a measurement.

   An independent verification pass this session found Telde's **live CKAN catalogue entry**
   currently shows **exactly ONE** base PGO resource — which, applying the code's own literal
   census rule ("exactly one municipality-wide base instrument ⇒ routable"), would make Telde
   **routable by the stated rule itself**, rather than needing the separate adaptación-PLENA
   argument at all. In other words: either (a) the catalogue has changed since the multi-instrument
   comment was written and Telde should now simply be added to
   `CANARIAS_ROUTABLE_MUNICIPALITIES` under the code's own rule, making the `ASSERTED-UNVERIFIED`
   argument moot, or (b) the current one-resource read is itself missing something the original
   multi-instrument finding saw (e.g. archived/superseded resources not surfaced in a default CKAN
   listing), in which case the multi-instrument classification stands but the `TELDE_ROUTING_BASIS`
   comment's framing ("routed anyway, on a different argument") is doing more work than it states —
   it reads as if the stated rule was checked and failed, when what actually happened does not
   match the current catalogue snapshot. **Neither (a) nor (b) has been resolved.** This is an
   inconsistency in the routing justification, not (necessarily) in the underlying instrument
   choice — but it is exactly the kind of "argument stands in for a measurement" gap this repo's own
   `Probe can be wrong three ways` discipline exists to catch, and it should be re-verified by
   the signer (or a dedicated follow-up check) before or alongside signing, not waved through.
6. ⚠ **The routing box spills beyond Telde.** `TELDE_BBOX` (`teldeBbox.ts`) is deliberately drawn
   wide and spills into neighbouring Valsequillo (INE 35031) per its own `§TELDE-BBOX-SPILL`
   comment; the INE code is what closes the citation to Telde specifically, not the bbox alone.

---

## 5. What signing would authorise / what it would NOT authorise

### What signing WOULD authorise

Flipping `CANARIAS_ENVELOPE_VERIFIED` to `true` would allow the **31 packed Telde zones** to
publish a computed envelope at `estimated-ruleset` confidence, **conditioned on the geometric
grammar actually resolving for the specific parcel** (setback / alignment+depth / occupation, per
§1a) — subject to every caveat in §4, most importantly the **open-top requirement** (Planes
Insulares + heritage/coastal/airport/flood/environmental constraints are unmodelled and can only
ever reduce, never validate, whatever this pack computes).

### What signing would NOT authorise

- **Anything on the 15 unpacked zones** (§1b) — these keep their cited refusal regardless of the
  gate, by construction (no pack entry exists for them to resolve against).
- **The D1/D2/C structural refusals** — `GRF` (graphed) zones and the datum-less `C` zone route
  through `canariasGraphedRefusal` / `depth-without-datum`, which are refusals about the *source*,
  not about PRYZM's coverage, and do not change when the gate opens.
- **A closed/maximum envelope anywhere in Telde** — every Telde determination must render
  open-top per §4 item 3; a signature does not license treating this pack's numbers as a ceiling.
- **Any municipality other than Telde.** The other 45 Canarias municipalities are unregistered
  (41 routable-by-rule, undetermined pending data work; 46 including Telde carry the
  `CANARIAS_MULTI_INSTRUMENT_BLOCKER` refusal or are simply absent from the registry). This
  signature is scoped to Telde alone.
- **A resolution of the §4 item 5 routing inconsistency.** Signing the envelope transcription is a
  distinct legal act from resolving whether Telde's routing justification is internally consistent
  with the code's own stated rule. A signer should treat that inconsistency as a separate, prior
  question worth closing (or explicitly accepting) — not something a signature on the *numbers*
  incidentally settles.
- **Any tier above `estimated-ruleset`.** The codebook validation was a second independent method
  against the same document, not a second independent source; `structured` or `authoritative` tiers
  are not reachable by this signature.

---

## 6. Activation steps after signature — signing ≠ rendering

⚠ **UPDATED 2026-08-04 — the dispatch-wiring gap this section originally recorded (2026-08-03,
"zero references... in siteDispatch.ts") is CLOSED.** `apps/editor/src/ui/site/siteDispatch.ts` now
carries `isInTelde(qLat, qLon)` routing to a dedicated `applyTeldeZoningThenFallback` function
(committed `a83ed14a`, prior to this session), mirroring `applyCordobaZoningThenFallback` /
`isInBalears`. A Telde parcel click today reaches `applyTeldeZoningThenFallback`, resolves a real
`EDIF` zone code, and dispatches a zone-named cited refusal (`canariasNoRulePackRefusal` /
`canariasGraphedRefusal`) — never the generic §L-663 `estimateSuppressedRefusal` card, and never a
number, per §5. Verified this session via `apps/editor/__tests__/teldeSiteDispatch.test.ts` (9/9
passing against real production data, not stubs).

⚠⚠ **SEPARATELY, 2026-08-04 — the resolver itself was rewritten, closing a second gap.** The
version of `resolveTeldeZone.ts` that shipped alongside the dispatch wiring called a same-origin
proxy (`/api/telde/edif`) that was **never wired server-side** (no `server/telde*.js` file existed,
and IDECanarias' live WFS — the service that proxy would ultimately call — is measured
administratively disabled). That made the dispatch wiring genuinely reachable but genuinely
NON-FUNCTIONAL end-to-end: every real call would return `endpoint-unreachable`.

This session found and closed that gap **without standing up a server proxy**: Telde's own SIPU
package — the exact zip already cited in `esTeldePgo2003.ts`
(`030319-pgo-ad-itpu-150323-210504-sipu.zip`, downloaded and verified live this session,
9 081 608 bytes) — ships `02SIST/EDIF.shp` + `02SIST/EDIF.dbf` (the zone-polygon geometry, ESRI
shapefile, 2 643 records / 46 distinct `ETIQUETA` codes, confirmed to match the 46-code vocabulary
`esTeldePgo2003.ts` already documents) in the SAME archive as `EDIF.mdb` (the numeric attributes
already transcribed). `resolveTeldeZone.ts` was rewritten onto the El Sauzal offline-shapefile
pattern (`resolveElSauzalZone.ts`): a committed extract
(`packages/site-parcel-data/src/providers/data/teldeEdif.json`, 2 643 records, coordinates rounded
to 0.1 m) is point-in-polygon joined at query time — no network call, no external dependency, no
IDECanarias reliance of any kind. `DispObl = GRF` (graphed) classification, which the shapefile's
DBF does not carry (that column lives only in `EDIF.mdb`), is supplied statically via a new
`TELDE_GRAPHED_ZONE_CODES` export, derived programmatically from the SAME `TELDE_UNPACKED_ZONES`
citations already in `esTeldePgo2003.ts` — not re-guessed.

**Consequence:** a Telde parcel click today resolves a REAL zone code from REAL geometry and
dispatches a REAL, zone-named cited refusal — entirely offline, entirely reproducible, no service
dependency to come back online. Verified against real coordinates independently derived (not
synthetic fixtures) for packed zone `E`, graphed-unpacked zone `D1`, and unpacked zone `INDEF`.

- **What is still true, unchanged by this session:** `CANARIAS_ENVELOPE_VERIFIED` is `false`, and
  nothing above the gate changes what a signature would authorise — §5 stands exactly as written.
  Flipping the gate remains the ONLY remaining step to render the 31 packed zones' numbers (subject
  to every §4 caveat, especially the open-top requirement). There is no remaining engineering
  blocker between "signed" and "rendering" for Telde — the property Córdoba/Zaragoza already had,
  now also true for Telde.
- **What this does NOT do:** it does not read `EDIF.mdb`'s numeric columns per-parcel (those are
  already folded into the pack, per code, as before); it does not change which 31 of 46 zones are
  packed (§1); it does not touch El Sauzal's own dispatch status, which remains unwired
  (deliberately out of scope this session — see El Sauzal's own header).
- **Recommendation for whoever signs:** unchanged from the prior revision of this section — the
  signature is a legal act about the ordinance transcription (§5), independent of the engineering
  state above. What has changed is that the engineering state is now fully closed, so a signature
  would take effect immediately rather than requiring further wiring.

---

## Standing caveat on this document

This ledger is evidence for a human decision, not the decision itself. It does not set
`CANARIAS_ENVELOPE_VERIFIED`. A signature here would authorise PRYZM to *publish* a number at a
*stated confidence*, on the 31 packed Telde zones only, subject to every caveat above — it would
never convert an estimate into an authoritative determination, and it would never make PRYZM's
output a permit.

*Maintainer: UNASSIGNED. Authority: C58 §1.1/§1.4/§1.6/§1.9/§1.11/§1.13 · ADR-0283 · ADR-0270/0271 ·
L-449 · L-616 · L-656 · L-677. Last updated 2026-08-04 — §6 corrected: dispatch wiring (landed
`a83ed14a`, prior to this session) and offline resolver rewrite (this session) both independently
verified against the current `siteDispatch.ts` / `resolveTeldeZone.ts` and against
`teldeSiteDispatch.test.ts` (9/9 passing on real production data). §1–§5 unchanged.*
