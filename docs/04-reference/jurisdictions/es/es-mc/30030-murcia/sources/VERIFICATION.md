# VERIFICATION — Murcia (es-mc, 30030) — the human sign-off ledger

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

⚠ **KNOWN LIMIT ACCEPTED AT SIGNING — L-674, and it is real.** The cited document is **NOT yet in the
repo**. `urbanismo.murcia.es/infourb/documentos/` returns **HTTP 403** to automated requests (measured
2026-08-01 — the BCNROC pattern; a human browser reaches it). The per-parameter verbatim quotes
therefore **cannot be re-read from `corpus/pdf/`** the way Barcelona's DOGC 4893 can. The quotes may be
perfect; nothing in the repo can currently prove it. **Founder is fetching Volumen 11 by hand.** Until
it lands, this signature rests on a transcription that cannot be independently re-verified here.

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

## Sign-off status: **NOT SIGNED.** The pack is **REGISTERED and REACHABLE — and publishes nothing**

| | |
|---|---|
| **Gate constant** | `MURCIA_ENVELOPE_VERIFIED` (`rulepacks/esMurciaEnvelope.ts`) |
| **Value in `main`** | **`false`** — and it **stays** `false`. Only the founder flips it. |
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
- **Concordance of the 2017 re-edition with the 2012 TR** — unverified.
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
