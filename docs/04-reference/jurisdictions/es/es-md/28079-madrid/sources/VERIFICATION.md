# Madrid (INE 28079) — human verification / sign-off

**Status: DRAFT. NOTHING LEGALLY SIGNED. No Madrid pack may PUBLISH A NUMBER until this file records
a human sign-off (the L-449 gate), and none does.**

> ⚠ **Reconciled 2026-08-01.** This line previously read *"no pack may ship `confidence: 'structured'`
> **or be registered**"*. Registration is now done (§MADRID-PGOUM97-WIRING) and the line was WRONG to
> conflate the two — the same reconciliation Córdoba made. **Registering a pack wires the routing;
> it does not authorise an output.** `MADRID_ENVELOPE_VERIFIED` is `false`, so every parcel in the 23
> packed zones receives a cited *"machine-extracted, unverified"* refusal and no figure reaches the
> panel, the massing or `site.updateZoning`. The gate that matters is the FLAG, not the registry —
> and keeping it in the registry would have meant Madrid's parcels could not even be told *which*
> Norma Zonal governs them. See **SIG-M1** below for the signature this is waiting for.

> **Two different gates, deliberately separated.** §1 records *source-identity* verification — "is
> this the right document, at the right endpoint, of the right vintage?" — which an agent can
> perform from a response. §2 records the *legal* sign-off — "does Art. 8.4.7 apartado 2 really say
> 20 m?" — which **only a human reading the primary text can perform**. §1 being green does not
> advance §2 by one field. Conflating them would be the §CONTEXT-DATA-HONESTY defect at the
> verification layer itself.

---

## §1 — SOURCE-IDENTITY verification (agent-performable) — **PARTIALLY GREEN**

| # | What was verified | Method | Date | Result |
|---|---|---|---|---|
| V1 | Ordinance of record = **Compendio 2025 de las NNUU del PGOUM-97 (actualizado a 24.09.2025)** | WebFetch of the transparencia/madrid.es portal page; title quoted verbatim | 2026-07-31 | ✅ **VERIFIED** |
| V2 | The Compendio PDF resolves | `curl -I` → HTTP 200, `application/pdf`, ~24.5 MB, `Last-Modified: 2025-10-20` | 2026-07-31 | ✅ **VERIFIED** |
| V3 | The Compendio is **`carácter informativo`**; the official text is the **Boletín Oficial** publication | verbatim quote from the same portal page | 2026-07-31 | ✅ **VERIFIED** — reorders the source hierarchy (`SOURCES.md` §0.2) |
| V4 | The founder's cited Compendio URL | WebFetch | 2026-07-31 | ❌ **HTTP 404** — locator dead; the *claim* it carried is nonetheless correct |
| V5 | Zone-code inventory = **34** claus incl. the NZ 9 block | ArcGIS `returnCountOnly` + distinct-value read on `NORMAS_ZONALES/0` | 2026-07-24 | ✅ **VERIFIED-LIVE** — and shows the founder's vocabulary is missing NZ 9 |
| V6 | NZ 1 ring = `PG_CONDICIONES_EDIFICACION/6`; `COEF_Z` is a coded **String** | direct `?f=json` + `/query` | 2026-07-23 | ✅ **VERIFIED-LIVE** (shape only — see §2 for meaning) |
| V7 | No `ALTURA`/`PLANTAS`/`FONDO`/`RETRANQUEO` attribute or coded-value domain on **any** PGOUM-97 service | full field inventory across six services | 2026-07-24 | ✅ **VERIFIED-NEGATIVE** — the parametric numbers are genuinely not in GIS |
| V8 | `PG_ORDENACION` outage was transient | re-probe → HTTP 200, 17 layers | 2026-07-24 | ✅ **VERIFIED** — supersedes the "service is down" claim in older files |
| V9 | **Two distinct Compendio consolidations are live simultaneously** — July 2025 on `geoportal`, September 2025 on `transparencia` | `curl -I` on both; distinct sizes and `Last-Modified` | 2026-07-31 | ✅ **VERIFIED** — settles C-6/C-16 by fetching, not by counting mentions |
| V10 | 🔴 `geoportal.madrid.es` serves the **superseded** July edition with no on-page signal | ↑ same | 2026-07-31 | ✅ **VERIFIED HAZARD** — cite transparencia, never geoportal |
| V11 | `CODMANZANA` is **not** a Catastro refcat substring; the planning join is spatial | tested against three real refcats | 2026-07-24 | ✅ **VERIFIED-NEGATIVE** — confirms batch 3's negative claim, but does **not** settle whether a Catastro connector is needed (`SOURCES.md` §G2) |
| V12 | **`AMB_TX_DENOM` EXISTS and is populated for all 34 codes** (`"ZONA 3 GRADO 1º - NIVEL a"` …) | `groupByFieldsForStatistics=AMB_TX_ETIQ,AMB_TX_DENOM` on `NORMAS_ZONALES/0` | 2026-08-01 | ✅ **VERIFIED-LIVE — probe P1 CLOSED.** It was previously "REQUESTED by the proxy but never verified to exist" |
| V13 | **The 34-code inventory is EXHAUSTIVE** — unfiltered `returnCountOnly` = 34, groupBy = 34 groups × `n=1` | ↑ same query + `returnCountOnly` | 2026-08-01 | ✅ **VERIFIED-LIVE** — ⇒ zones 2/6/10/11 govern **0 m²** and **no parcel can route to them**; `SOURCES.md` §0.3 candidate **(c) is eliminated** |
| V14 | **Per-code LAND SHARE measured** — 149,577,170 m² of Norma-Zonal-governed land; NZ 3 = **60.458 %**, NZ 1 = 11.695 %, packed 23 = 27.847 % | server-side `sum(SHAPE.STArea())`, layer alias *"Superficie m²"*, EPSG:25830 | 2026-08-01 | ✅ **VERIFIED-LIVE** — ⚠ denominator is **NZ-governed land**, NOT the L-656 private-buildable set. `findings/L-676-*` |
| V15 | **The *alineación oficial* IS published as geometry** — `PG_ORDENACION/8 Alineaciones`, 22,584 `Alineación Oficial` polylines (+3,582 *Volumetría Específica*, +2,066 *Trazado Indicativo APR*) | `?f=json` + `groupBy ALIN_DESC` count | 2026-08-01 | ✅ **VERIFIED-LIVE — probe P6's layer question CLOSED.** Re-buckets the NZ-4 depth datum and the *ancho de calle* input from Evidence to **Engineering** |
| V16 | **`COEF_Z` is measurably NOT a FAR** — 15,907 polygons, 57 distinct values, **100 % integers 0–8**, **47.56 % compound** (`"0 / 5"`, `"0 / 6 / 7"`) | `groupBy COEF_Z` census on `PG_CONDICIONES_EDIFICACION/6` | 2026-08-01 | ✅ **VERIFIED-NEGATIVE** — the quarantine is now evidence-backed. ⚠ Says nothing about what `COEF_Z` **is**; §2's NZ-1 checklist is unchanged |
| V17 | **`Ficha Específica` holds 131 points**, and the SHIPPED NZ-1 resolver never reads it | `returnCountOnly` on `PG_CONDICIONES_EDIFICACION/1` + `grep -i ficha providers/resolveMadridNZ1Ring.ts` (0 hits) | 2026-08-01 | ✅ **VERIFIED — a live correctness gap**, `CLOSURE-REGISTER.md` row 3 |
| V18 | **`Ámbitos de Ordenación` cannot supply the derived-ámbito AREA** — `PG_ORDENACION/4` is polyline with `OBJECTID` only | `?f=json` | 2026-08-01 | ✅ **VERIFIED-NEGATIVE** — the cheapest route to the L-656 denominator is closed off |
| V19 | **THE PRIMARY DOCUMENT IS NOW IN THE REPO** — `corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf`, 25,735,355 bytes, **626 pp**, sha256 `1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5` | recovered from the extraction session's scratchpad (it was never downloaded again); identity taken from the document itself — PDF `title` metadata `COMPENDIO MPG NNUU (24-09-2025)`, `creationDate D:20251020`, cover page *«ACTUALIZADO A 24 DE SEPTIEMBRE 2025»* | 2026-08-01 | ✅ **VERIFIED — it is the transparencia 24-09-2025 edition, NOT the superseded 07-07-2025 geoportal one (V10).** Closes `CLOSURE-REGISTER` row 15(i). `corpus/RETRIEVAL-LOG.md` §R1 |
| V20 | 🔴 **`madrid.es` serves an Akamai ACCESS DENIED to automated GETs of the Compendio PDF** — the `compendio2025.pdf` committed in `40c2bdba` is **536 bytes of denial HTML**, not a document | `git cat-file -p` on the blob | 2026-08-01 | ✅ **VERIFIED-BLOCKED.** ⚠ **QUALIFIES V2:** the `curl -I` HEAD *is* allowed and the GET *is* denied, so a HEAD-only reachability check reports a document as retrievable that cannot be retrieved. UNKNOWN, never absence (L-422/457/467/469). `RETRIEVAL-LOG.md` §R2 |
| V21 | **§MADRID-QUOTE-CONCORDANCE — all 1,321 `verbatim` strings in `extracted/*.json` re-read against the V19 PDF: 992 on the cited page, 40 spanning from it, **0 mis-paged**, **0 fabricated**; 25 are synthesised table rows mislabelled `verbatim`; 216 carry **no page citation** and are uncheckable | `tools/madrid-extract/verify_quotes.py`; raw result `extracted/quote-concordance-2026-08-01.json` | 2026-08-01 | ✅ **VERIFIED-CONCORDANT.** ⚠⚠ **THIS MOVES THE LEGISLATION AXIS BY EXACTLY ZERO AND MUST NEVER BE QUOTED AS IF IT DID** — it proves a string was COPIED from the document; whether the extracted NUMBER correctly INTERPRETS that string is the reading L-449 reserves to a human. A second machine pass is not a human one. §2 is still entirely unsigned |

**What §1 does NOT establish:** any numeric rule value, any article number, `COEF_Z`'s meaning, the
cause of the 2/6/10/11 absence, NZ 9's identity, NZ 5's rule kind, any land-share figure, any licence
grant, or the contents of any of the four unprobed layers. Those are §2, §1a, and §3.

⚠ **V19–V21 do not change that sentence by one word, and the temptation to think they do is the whole
reason they are worded as they are.** Holding the document and proving the quotes were copied from it
makes a human verification POSSIBLE and CHEAP for the first time. It does not perform one.

---

## §1a — CHEAP PROBES still open (agent-performable, no ordinance read, none run)

These cost one query each and would each retire a documented unknown. **None has been run.** They are
listed here rather than in §2 because a human legal reader is *not* required.

| # | Probe | Retires | Status |
|---|---|---|---|
| P1 | Query `NORMAS_ZONALES/0` returning `AMB_TX_ETIQ` **and** `AMB_TX_DENOM` for all 34 codes | C-7 — the `officialDesignation` gap (⚠ does **not** move C63 Axis 2) | ✅ **RUN 2026-08-01 (V12)** |
| P2 | Unfiltered `returnCountOnly` on `NORMAS_ZONALES/0` + read the Compendio Título VIII table of contents | C-5/C-9 — whether zones 2/6/10/11 leave parcels routing nowhere | 🟡 **GIS half RUN (V13)**; the Compendio ToC half is **not** read |
| P3 | `?f=json` field inventory on `PG_ANALISIS_EDIFICACION` | C-17 — does the existing-building layer exist, and with what fields | 🔴 open |
| P4 | `?f=json` field inventory + a sample `query` on `PG_EDIFICIOS_PROTEGIDOS` | whether protection **replaces** or **modifies** the envelope (`SOURCES.md` §E) | 🔴 open |
| P5 | `?f=json` + legend read on `PG_USOS_Y_ACTIVIDADES` | the coded use matrix | 🔴 open |
| P6 | Retrieve an `Alineaciones` polyline near a known NZ-4 parcel | whether the official line is usable as the NZ-4 depth reference | 🟡 **layer VERIFIED (V15)**; no polyline fetched for a parcel |
| P7 | Re-check for any Compendio edition **later than 24-09-2025** | `readFrom` staleness (V9 residual) | 🔴 open |

⚠ A probe that returns **empty** must be recorded as `MEASURED-EMPTY`, not as absence — and never as
`0`. Run `returnCountOnly` unfiltered before believing any zero.

---

## §2 — LEGAL sign-off (human-only, L-449) — **NOTHING SIGNED**

Read from **Compendio 2025 (24-09-2025)** (`SOURCES.md` §0.1) — and record `readFrom` *and*
`effectiveDate` separately (`SOURCES.md` §0.4). ⚠ An article's `effectiveDate` comes from the BOE
publication of the PG97 article or of the modificación that set it — the Compendio's
modified-articles annex is the index for this. It is **not** the consolidation date.

### NZ 4 (`alignment`, Cap. 8.4) — highest ROI, everything document-gated
- [ ] ***Fondo edificable*** (`buildableDepth_m`) — the exact wording (*"El fondo máximo edificable
      será de X metros"* / *"La profundidad edificable será de X metros"*), the article, the
      apartado. **`.positive()` required; no pack without it.** Store `20 m`, never *"approximately 20 m"*.
- [ ] Confirm the depth is measured **from the official alignment line**, and record `measurement`.
      ⚠ It is **not** a parcel shrink (`SOURCES.md` §C).
- [ ] **Altura** — *cornisa* and *total* captured as **separate** fields, each with `measuredFrom` /
      `measuredTo`. Never merge them; never derive one from the other.
- [ ] **Plantas** — normalised (`B+5` → `{aboveGround:5, groundFloorIncluded:true}`), with *ático* /
      *bajo cubierta* recorded separately. ⚠ **Never convert floors to metres.**
- [ ] **Ocupación** — with its **denominator** (parcela vs manzana). A bare `70 %` is unusable.
- [ ] **Edificabilidad** — numerator (built / computable / total constructed) *and* denominator
      (parcela / propiedad / ámbito) both stated. `1.5 FAR` is not an acceptable record.
- [ ] Setbacks — `null` unless an article states one. *"Probably null"* is not a sign-off.
- [ ] **Grados** — confirm whether NZ 4 has grados in the ordinance at all (GIS says the code is a
      bare `"4"`). ⚠ **Do not create `4.1`/`4.2` unless official.**
- [ ] `permittedUse` — the exact *uso cualificado* / *uso compatible* table.

### NZ 8 (`setback`, Cap. 8.8) — 10 grado rows required
- [ ] Retranqueos front / side / rear **per grado**, all three separately, for
      `8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6`. A single scalar is a category error.
- [ ] ⚠ If *"se permite adosamiento"* appears → `side: null, condition: "party_wall_allowed"`.
      **Never `side: 0`.**
- [ ] Altura / plantas / ocupación (with denominator) / edificabilidad per grado.
- [ ] *Parcela mínima* if stated.

### NZ 5 (Cap. 8.5) — ⚠ **a MODEL decision before a data decision**
- [ ] Determine from the ordinance's **actual wording** whether NZ 5 regulates
      *retranqueo a linderos* (→ `SetbackRule` fits) or *distancia entre edificios* (→ needs a new
      `OpenBlockRule`; **raise an ADR before writing code**).
- [ ] Only then: the numeric fill per grado `5.1 5.2 5.3`.

### NZ 7 (`setback`, Cap. 8.7)
- [ ] Retranqueos / ocupación / altura / plantas per grado `7.1.a 7.1.b 7.2.e`; capture
      *parcela mínima* if the regime uses it instead of occupation.

### NZ 9 (Cap. 8.9 — chapter **inferred**, not confirmed)
- [ ] Confirm the zone **name**, the **chapter**, and the `geometricRule.kind` for
      `9.1 9.2 9.3 9.4.a 9.4.b 9.5`. Absent from the founder's material entirely; 6 of 34 claus.

### NZ 1 (`explicit-area`, Cap. 8.1)
- [ ] **`COEF_Z` legal meaning** — m²/m² edificabilidad? plantas? a catalogue coefficient? — with
      article + apartado. ⚠ **Quarantined until then** (`SOURCES.md` §B2); never bound to `farRatio`.
- [ ] **`COEF_Z` denominator** — manzana vs parcela vs catalogued area. It is keyed on `CODMANZANA`,
      so *manzana* is the leading candidate and applying it per-parcel would be wrong.
- [ ] If the legend is not in the ordinance, sign off the **negative**:
      `{ value: null, reason: "GIS publishes a coded value; ordinance interpretation not verified" }`.
- [ ] `permittedUse: residential` re-cited to Compendio 2025 Cap. 8.1/8.3 (currently SECONDARY/COAM).
- [ ] Any parametric NZ 1 conditions stated per grado `1.1 … 1.6`.

### NZ 3 (refusal, Cap. 8.3)
- [ ] Confirm the `derived-plan` refusal copy (`SOURCES.md` §D) against Cap. 8.3, and transcribe the
      **article**, not just the chapter.
- [ ] ⚠ Sign off (i) *the refusal is correct* and (ii) *the rules remain unknown* as **two separate
      statements**. Signing (i) must not be recorded as completing NZ 3.

### Structural questions (block the routing table, not a single field)
- [ ] **Zones 2 / 6 / 10 / 11** — establish which of the three causes applies (`SOURCES.md` §0.3).
      Cause (c) would mean parcels that route nowhere.
- [ ] **Override precedence** — does a protected-building entry *replace* the envelope or *modify*
      parameters? Does an NZ 1 *ficha* force a refusal? (`SOURCES.md` §E — currently unmodelled.)
- [ ] **Licence** — the actual licence text for the `sigma.madrid.es` services. "No auth observed" is
      not a grant.

---

## SIG-M1 · 🟡 **CONDITIONALLY APPROVED 2026-08-02 — three named preconditions, then SIGN**

> ⭐ **THE FOUNDER HAS MOVED THIS FROM "AWAITING AN OPEN-ENDED HUMAN READ" TO A CLOSED CHECKLIST.**
> It is no longer *"wait for someone to read 282 records"*; it is three preconditions, and clearing
> them is the whole job. **It is still NOT a signature — `MADRID_ENVELOPE_VERIFIED` is `false`.**

**The founder's conditional approval, verbatim:**

> *"The extraction methodology is now sufficiently evidenced. Before publication: complete the
> targeted human review; verify the four residual-risk classes; confirm end-to-end rendering under
> the **pipeline-extracted-unverified** confidence tier. If those pass: **Sign.** No further legal
> review required."*

And, raising the ceiling of what would be signed:

> *"If the oversampled review confirms the four residual-risk classes behave correctly, I would
> expect to sign **the transcription itself, not merely the extraction process**."*
> *"Proceed with the targeted review. If the four residual-risk classes pass: **SIGN THE
> TRANSCRIPTION. Not merely the process.** That becomes the human certification."*

**The narrower text they had already said they would sign** (kept, because it is the floor if the
review only supports the process claim):

> *The extraction methodology, provenance, and quality-control process provide sufficient evidence
> that `esMadridPgoum97.ts` is an accurate machine transcription suitable for publication as
> **pipeline-extracted-unverified**, provided it remains explicitly identified as a machine-generated
> derivative of the Compendio 2025 and not as a manually certified legal transcription.*

They assessed the evidence as **"unusually strong for a machine transcription"**.

### The three preconditions — status

| # | Precondition | Status |
|---|---|---|
| **1** | Complete the targeted human review | 🟡 **ARTEFACT READY, UNREAD** — [`../extracted/SIG-M1-REVIEW-SAMPLE.md`](../extracted/SIG-M1-REVIEW-SAMPLE.md): **121 records** across all **23** shipped zones = **52.4 %** of the 231 records they carry, and **100 % of every record bearing a sampleable residual risk** |
| **2** | Verify the four residual-risk classes | 🟡 **R1/R2/R3 enumerated exhaustively and tabulated; R4 has a MECHANISM** (see below) |
| **3** | End-to-end rendering at `pipeline-extracted-unverified` | ✅ **VERIFIED IN CODE** — `madridPgoum97Wiring.test.ts` §RED-CHIP-NZ7-NZ8 solves **every** NZ-7/NZ-8 grado and asserts the tier; `GISAreaLayout.ts:2596` badges it as the **first** arm (weakest-wins). **This is ADR-0286 in code form for Madrid.** |

⚠ **Precondition 3 was believed to BLOCK the signature until 2026-08-02.** Two code comments
(`siteDispatch.ts`, `esMadridPgoum97.ts`) asserted `ZoningRulesEngine` hard-codes `estimated-ruleset`
and never reads `defaultConfidence`. **Both were stale** — fixed in L-665 (§PACK-CONFIDENCE-CEILING)
— and were still being quoted as live blockers the day this approval was given. Corrected in place.

### The four residual risks — the founder's own words, recorded as OPEN and NAMED

They classified these as **structural rather than statistical**, i.e. invisible to aggregate QC:

| id | risk | how it is addressed |
|---|---|---|
| **R1** | *segmentation errors where legal meaning spans multiple paragraphs* | **47** records; **100 % tabulated** in the review, §3.1 — the highest-value class, because the digits are usually right and the *governing clause* is what goes missing |
| **R2** | *omission of text not represented in the structured model* | **56** records; 100 % tabulated, §3.2 — each carries a conditional (*salvo · siempre que · podrá · excepcional*) that `GeometricRule` has no field to hold |
| **R3** | *normalization of punctuation or formatting affecting interpretation* | **29** records; 100 % tabulated, §3.3 — includes 25 pipe-joined table reconstructions stored in a field named `verbatim`, which is a provenance mislabel |
| **R4** | *future divergence if the Compendio is updated* | ⚠ **NOT SAMPLEABLE — a TRIGGER, not a spot-check.** The corpus is pinned by sha256; **19 of the 33 cited articles already carry an amendment footnote** in this edition, recorded per article and pinned by `madridCorpusSupersession.test.ts`. Any change invalidates the signature **for that article only** |

### ⚠ What a signature would still NOT cover

- **The six zones excluded as unsignable IN PRINCIPLE** — `4`, `9.1`, `9.2` (the *ancho de calle*
  height table is unresolved, so the pack carries the ordinance FLOOR and **over-states** above
  9,00 m) and `5.1`, `5.2`, `5.3` (Art. 8.5.6.3 measures to the street **centreline**, which
  `GeometricRule` cannot express, so no front inset is applied and it **over-states** on a narrow
  street). **These are defects in the NUMBERS; no confidence label cures them.**
- The **BOCM** text. This is a signature on a consolidation (V3).
- **NZ 3** — Art. 8.3.1 governs; the refusal survives any signature (L-678).
- **NZ 1** — separately signed as SIG-M2.
- **Promotion above `pipeline-extracted-unverified`.** ⚠ That is a **separate, later** decision:
  it changes `MADRID_PGOUM97_DEFAULT_CONFIDENCE` in the pack itself, and
  `capEnvelopeConfidenceToPackDefault` is **demote-only** by design (ADR-0286), so a promotion is a
  deliberate, signed, reviewable edit — never a side effect of opening the gate.

---

## SIG-M1 (original request) — the signature `MADRID_ENVELOPE_VERIFIED` is waiting for

> Recorded 2026-08-01 in the shape of the signed `es-ct/08019-barcelona` SIG-2/SIG-3 exemplar, so the
> founder is asked one bounded question rather than an open-ended one. **This block is a REQUEST, not
> a signature.** Nothing below has been agreed by anyone.

| | |
|---|---|
| **Verifier** | *(unassigned — must be Spanish-planning-literate)* |
| **Date** | — |
| **Axis** | LEGISLATION / ENVELOPE |
| **Artefact** | `packages/site-parcel-data/src/rulepacks/esMadridPgoum97.ts` → `MADRID_ENVELOPE_VERIFIED` |
| **Source** | **Compendio 2025 de las NNUU del PGOUM-97, consolidated 24-09-2025** (V1/V2/V3 above). ⚠ `carácter informativo` — the **official** text is the Boletín Oficial publication (`SOURCES.md` §0.2). Cite **transparencia**, never `geoportal` (V10). |

**The question to be signed:** *does `esMadridPgoum97.ts` transcribe Título 8 correctly?* 282 cited
records were produced by `tools/madrid-extract/` reading the born-digital text layer; 23 zones are
shipped, each value carrying article + apartado + PDF page + verbatim quote. **A machine read it.
Transcribing an ordinance is a legal act and a pack cannot sign its own transcription.**

**WOULD AUTHORISE** — publishing a buildable envelope for a Madrid parcel in one of the 23 zones
`4 · 5.1 5.2 5.3 · 7.1.a 7.1.b 7.2.e · 8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6 ·
9.1 9.2 9.3 9.4.a 9.4.b 9.5`, at confidence **`pipeline-extracted-unverified`** (the red
machine-extracted chip), **never** `structured`.

**WOULD NOT AUTHORISE:**
- **Norma Zonal 1** (`1.*`) — a separate, settled `explicit-area` decision (`esMadridNZ1.ts`); its
  `COEF_Z` semantics stay quarantined (§2 below).
- **Norma Zonal 3** (`3.*`) — a legally-grounded refusal that survives any signature: Art. 8.3.1 says
  the *aprovechamiento* is already **exhausted**. There is nothing to promote.
- **Normas Zonales 2 / 6 / 10 / 11** — not transcribed, and their absence from `AMB_TX_ETIQ` is
  unexplained (`SOURCES.md` §0.3). They receive the coverage-gap card either way.
- Promoting the confidence tier above `pipeline-extracted-unverified`.
- Any *ancho de calle* height. ⚠ **Amended 2026-08-01 (V15):** the flat claim *"no Madrid
  street-width source exists"* is **too strong**. L-537's negative — that no Spanish municipality
  publishes a **declared** width — stands; but `PG_ORDENACION/8` publishes **22,584 `Alineación
  Oficial` polylines**, from which a width can be **CONSTRUCTED** between opposing lines. A
  constructed width is **not** an *ample oficial* and must ride as `measured-alignment`. Until such a
  resolver exists **and is separately signed**, this exclusion stands unchanged.

**⚠ SIX ZONES ARE NOT SIGN-OFF-READY EVEN IN PRINCIPLE — a signature must EXCLUDE them:**

| Zone(s) | Why not signable | Direction of the error |
|---|---|---|
| `4`, `9.1`, `9.2` | Height is the Art. 8.4.10 / 8.9.10.1 **street-width table**, unresolved, so the height-proportional *testero* separation cannot be resolved either and the pack carries the ordinance **FLOOR** (`MADRID_FLOOR_ONLY_SEPARATIONS`) | **OVER-states** — the floor under-insets above the break-even height (9,00 m for these three) |
| `5.1`, `5.2`, `5.3` | Front edge is `null` because Art. 8.5.6.3 measures to the **street centreline** (*«respecto al eje de la calle»*), a rule kind `GeometricRule` cannot express | **OVER-states** on a narrow street — no front inset is applied at all |

**✅ THE SECOND GATE IS NOW DISCHARGED — this no longer blocks the sign-off.** (L-665, 2026-08-01)

It read, until this date: *"`ZoningRulesEngine` hard-codes `let confidence: EnvelopeConfidence =
'estimated-ruleset'` and **never reads a pack's `defaultConfidence`**. Flipping
`MADRID_ENVELOPE_VERIFIED` **alone** would publish these machine-read numbers wearing the violet
"Estimated" chip instead of the red machine-extracted-unverified one the renderer already implements
— an over-statement of certainty, which is exactly what the gate exists to prevent. The C58
confidence fix and the flip must land in the same change."*

Both halves of that defect are fixed **ahead of any signature**, so the two changes no longer have to
land together:

1. **§PACK-CONFIDENCE-CEILING.** `ZoningRulesEngine` now clamps its solve to the pack's declared
   `defaultConfidence` (`capEnvelopeConfidenceToPackDefault`, an L0 primitive beside the one
   `ENVELOPE_CONFIDENCE_ORDER` ladder — a **ceiling**, so it can only demote; a pack can never
   certify itself upward). A solved PGOUM-97 zone now stamps **`pipeline-extracted-unverified`** and
   renders the **red "⚠ Unverified · machine-extracted"** chip, with its own louder caveat, and the
   per-row provenance badge reads **"⚠ MACHINE"** instead of the green "PUB".
2. **§ENVELOPE-PUBLICATION-AUTHORISATION.** `classifyAnswerability` now reads the verification gate,
   so the 23 packed codes classify **`pack-unverified`**, not `full-envelope`.

Pinned by `packages/site-parcel-data/__tests__/madridPgoum97Wiring.test.ts` §THE-ORDERING-PIN (both
preconditions asserted against a real solve), plus `packConfidenceCeiling.test.ts` and
`envelopeAuthorisation.test.ts`. ⚠ The tier remains **capped at `pipeline-extracted-unverified`**:
signing authorises PUBLISHING the machine read under the red chip, never promoting it. ⚠ The SIX
not-sign-off-ready zones above (`4`, `9.1`, `9.2`, `5.1`, `5.2`, `5.3`) are **unaffected** — those
are OVER-STATEMENT defects in the numbers themselves, which no confidence label cures.

**What is already wired and needs no signature** (§MADRID-PGOUM97-WIRING, 2026-08-01): the zone
router (`resolveMadridNormaZonal` → `NORMAS_ZONALES/0.AMB_TX_ETIQ` via `/api/madrid/normas-zonales`),
the registry entry, the public exports and the L5 dispatch. All of it **refuses**, citedly, today —
proven end to end by `apps/editor/__tests__/madridSiteDispatch.test.ts`.

---

## SIG-M2 · ✍ SIGNED 2026-08-02 — `MADRID_NZ1_CERTIFIED`, on **Doctrine B**

> ⭐ **THE FIRST L-449 SIGNATURE IN THE MADRID DOSSIER.** The founder answered as an **auditor**, not
> a reviewer — they were asked to choose between two doctrines and they chose, with reasons.

| | |
|---|---|
| **Verifier** | **the founder (repo owner)** |
| **Date** | **2026-08-02** |
| **Axis** | ENVELOPE |
| **Artefact** | `packages/site-parcel-data/src/providers/resolveMadridNZ1Ring.ts` → `MADRID_NZ1_CERTIFIED` |
| **Value** | **`true`** — flipped 2026-08-02 **on this signature** |
| **Doctrine** | **B — "Evidence-bounded publication"**, ratified corpus-wide as **[ADR-0283](../../../../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md)** |

### The signature, verbatim

> **PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is
> directly supported by authoritative published data. Partial publication does not authorize
> inference beyond its demonstrated spatial extent.**

**Operative rule as stated:** *inside published geometry → deterministic envelope permitted; outside
published geometry → status **unknown** unless another authoritative layer resolves it.*

### The reasoning — recorded because the verdict alone would be useless

The founder was offered two doctrines and rejected **Doctrine A ("completion by implication")** on
the ground that **a planning system must never infer zoning geometry merely because ADJACENT
geometry is published**, and that **"Unknown is a valid answer"** — producing an unknown result is
preferable to manufacturing certainty. Sharpened in the follow-up:

> **Authoritative publication defines the boundary of knowledge, not necessarily the boundary of
> reality. Unknown is a valid product state.**

> ⚠ **THAT SENTENCE IS THE WHOLE DOCTRINE, AND IT IS NOT MADRID'S.** It is why València's empty
> `zones`, Córdoba's gated pack and Murcia's delegated 67 % are all *correct outputs* rather than
> coverage failures — and why C63 scores a cited refusal as a terminal state (§1.5 / L-656). The
> founder: *"That principle should govern every city."*

### Why this mechanism qualifies — verified, not assumed

`resolveMadridNZ1Ring` point-intersects the **published** `PG_CONDICIONES_EDIFICACION/6` footprint
and dispatches an envelope **only** when a ring comes back. Everywhere else it returns a TYPED
refusal — `no-feature` / `degenerate-geometry` for a genuine absence, `endpoint-unreachable` for an
outage, held apart by STRUCTURAL-SEAM-4 — and the dispatcher serves `madridUnknownZoneRefusal`,
which names PRYZM's coverage gap rather than mis-citing NZ 1 on land that is not NZ 1. Nothing
infers beyond the demonstrated extent. **The architecture was already built to the doctrine; only
the signature was missing.**

### Scope — what this authorises, and what it does NOT

**AUTHORISES:** NZ 1 grados `1.1`…`1.6` publishing the **clipped published footprint** at
`estimated-ruleset`, inside the published geometry, and nothing else.

**DOES NOT AUTHORISE** (unchanged by this signature):
- Any use of `COEF_Z` as an *edificabilidad* / FAR. V16 measured it: 100 % integers 0–8, **47.56 %
  compound** — not a ratio, and its positive meaning is still unread.
- Any NZ-1 height, from `madridAnchoDeCalle.ts` or anywhere else.
- Promotion above `estimated-ruleset`.
- Any inference onto land where no NZ-1 footprint is published — that is the doctrine itself.

### ⚠ One defect is re-armed by this signature

`CLOSURE-REGISTER.md` row **3**: the resolver does not read `PG_CONDICIONES_EDIFICACION/1 Ficha
Específica` (**131 points**, V17), so a parcel governed by an individual *ficha* receives the
GENERAL manzana footprint. **Sign of the error is UNKNOWN** (a ficha may be more or less permissive)
and it is bounded to 131 points city-wide — but "directly supported by authoritative published data"
is exactly what it violates. **It should be closed next.**

---

## SIG-M2 (superseded header) · the request, and the machine flip that made it necessary

> ⚠⚠ **This block is STILL a REQUEST, not a signature. Nothing below has been agreed by anyone.**
> What changed on 2026-08-01 is that the gate it concerns is no longer OPEN while unanswered:
> `MADRID_NZ1_CERTIFIED` is now `false` (§MADRID-NZ1-DECERTIFIED, L-677).
> `CLOSURE-REGISTER.md` row **5**.

| | |
|---|---|
| **Verifier** | *(unassigned — must be Spanish-planning-literate, or the founder answering the doctrine question below)* |
| **Date** | — |
| **Axis** | ENVELOPE |
| **Artefact** | `packages/site-parcel-data/src/providers/resolveMadridNZ1Ring.ts` → `MADRID_NZ1_CERTIFIED` |
| **Value 2026-07-25 → 2026-08-01** | **`true`** — and it authorised **the only Madrid envelope that rendered at all** |
| **Value now** | **`false`** — every NZ-1 parcel receives the cited refusal the path was designed to give |

**THE PROBLEM, AS FIRST STATED.** `MADRID_NZ1_CERTIFIED = true` let `applyMadridNZ1ExplicitArea`
clip a parcel to the published NZ-1 footprint and dispatch a real envelope over **11.695 %** of
Madrid's Norma-Zonal-governed land (measured, V14). The code comments attributed this to *"the L-608
sign-off, 2026-07-25"* — but **§3 of this file is empty**, SIG-M1 covers a different flag and
**explicitly excludes** NZ 1, and there was **no recorded signatory, date or scope anywhere**.

**⚠ WHO OPENED IT — MEASURED 2026-08-01, and it is worse than "unattributed".**
`git log -S "MADRID_NZ1_CERTIFIED: boolean = true"` returns exactly one commit:

> `3e571724` — *"fix(madrid): ship the parcel ring on compound COEF_Z + flip NZ1 gate ON"*
> `Author: MarkHanoi` · `Sat Jul 25 08:32:39 2026` · **`Co-Authored-By: Claude Opus 4.8`**
> Body: *entirely about the COEF_Z parse.* The flip is four words in the subject line and is nowhere
> explained. Files touched: the resolver, its test, and `siteDispatch.ts`. **No document was read.**

So the attribution was **circular** — the gate cited as its authority the very commit that opened it
— and **the signatory was a machine**. L-449's entire content is that transcribing an ordinance is a
LEGAL act and *a pack cannot sign its own transcription*; **a model flipping its own publication
gate is that rule's limiting case.** The resolver's test then pinned it (`expect(MADRID_NZ1_CERTIFIED)
.toBe(true)`, *"the L-608 sign-off"*), so the repo asserted the signature as a fact in two places
while it existed in none.

**⇒ ACTION TAKEN, and it is deliberately the smaller of the two available.** An agent cannot produce
the missing signature (that is the point of L-449), so the gate was **shut** rather than
rationalised. Madrid's ENVELOPE axis therefore falls from a reported **≤4.7 % to a measured 0 %**.
That is a **correction, not a regression**: the 4.7 % was authorised by a machine signing its own
work, and a number that only exists because nobody checked its authority was never ours to report.

**⚠ THIS IS NOT A FINDING AGAINST THE FOOTPRINT.** Nothing here says NZ 1's geometry is wrong. The
case for re-opening (below) is strong and unrebutted; it simply has to be MADE by a person.

**THE QUESTION TO BE ANSWERED — and a reasoned NO is a complete answer.** *Does reading a buildable
footprint that the municipality PUBLISHES AS GEOMETRY require an L-449 signature at all?*

- **The case for NO** (and it is a real case): L-449 exists because **transcribing an ordinance is a
  legal act**. NZ 1 transcribes nothing — PRYZM fetches a polygon the municipality drew, clips the
  parcel to it, and asserts **no height, no FAR, no setback**. `structuredFields` is literally `{}`.
  There is no reading to get wrong.
- **The case for YES:** the choice of **which layer** is the buildable ring (layer 6 vs layer 10 vs
  closing the layer-2 polyline against *Alineaciones*) **is** an interpretation, and it was made by
  an agent from a `?f=json` shape. So is the decision to publish at `estimated-ruleset`.
- ⚠ **Either answer must be WRITTEN DOWN.** The unacceptable state is the present one: the flag
  claims a sign-off that does not exist.

**WOULD AUTHORISE** — NZ 1 grados `1.1`…`1.6` continuing to publish the **clipped published
footprint** at `estimated-ruleset`, and nothing else.

**WOULD NOT AUTHORISE:**
- Any use of `COEF_Z` as an *edificabilidad* / FAR. ⚠ V16 measured it: **100 % integers 0–8, 47.56 %
  compound values** — it is **not a ratio**, and its positive meaning is still unread.
- Any NZ-1 height, from `madridAnchoDeCalle.ts` or anywhere else.
- Promotion above `estimated-ruleset`.

**⚠ ONE DEFECT MUST BE FIXED BEFORE THIS IS SIGNED, NOT AFTER** — `CLOSURE-REGISTER.md` row 3: the
shipped resolver **never reads `Ficha Específica`** (131 points, V17), so parcels with
individually-defined conditions currently receive the **general manzana footprint**. Signing this
block while that is true would certify a footprint applied to parcels it was not drawn for.

**⚠ HOW TO RE-OPEN THIS GATE — the mechanics, so nobody flips a boolean again.**
1. Answer the doctrine question above in writing, in this block, with a **name and a date**.
2. Close row 3 (the *ficha* deferral), because §2's own precondition says *before, not after*.
3. Set `MADRID_NZ1_CERTIFIED = true` **and** register the signature reference in
   `packages/site-parcel-data/src/l449CertificationGates.ts` (`signature: { doc, anchor }`).
   `l449CertificationGates.test.ts` **opens the named document and fails if the anchor is not in
   it** — so a `true` with an imaginary signature is now a RED TEST, not a silent claim. That guard
   is repo-wide and scans `src/**` for both `*_CERTIFIED` and `*_ENVELOPE_VERIFIED`; the older
   `envelopeAuthorisation.test.ts §TOTALITY` scanned only `src/rulepacks/` for the latter, which is
   precisely why this gate was invisible for a week.

**⚠ THE SAME DEFECT EXISTS IN TWO OTHER JURISDICTIONS — found by that guard, not fixed here.**
`NL_BESTEMMINGSPLAN_CERTIFIED` and `FR_PARIS_PLU_CERTIFIED` are both `true` while their national
`sources/VERIFICATION.md` files read `Verifier: UNASSIGNED` / `Status: OPEN`. They are inventoried in
`UNSIGNED_OPEN_GATES` (a dated quarantine, not a permission) so a NEW instance is a red test.
⚠ Paris's own docstring justifies itself with *"Same discipline as `MADRID_NZ1_CERTIFIED` /
`NL_BESTEMMINGSPLAN_CERTIFIED` (both ON…)"* — **Madrid's unattributed flip was already being cited as
precedent by a third jurisdiction.** Neither is Madrid's to answer, and each may have the same
"published as geometry" defence; each needs it written down.

---

## §3 — Signed off (legal)

| Who | When | Which document version (`readFrom`) | Fields signed | What they could NOT confirm |
|---|---|---|---|---|
| **the founder (repo owner)** | **2026-08-02** | *n/a — no ordinance text was transcribed* | **SIG-M2 — the DOCTRINE governing `MADRID_NZ1_CERTIFIED`** (Doctrine B, ADR-0283): dispatch only inside authoritative published geometry; no inference beyond its demonstrated extent | ⚠ **No ordinance PARAMETER was signed.** `COEF_Z`'s meaning, any NZ-1 height, and every Título 8 value remain unverified. This is a signature on a PUBLICATION RULE, not on a reading of the law |

⚠ **READ THAT ROW PRECISELY.** It does **not** move the C63 LEGISLATION axis, and nobody should
report that it does. LEGISLATION counts `verified_cited_claus / total_claus_present` — **claus whose
NUMBERS a human has checked against the ordinance**. SIG-M2 signed a doctrine about *when geometry
may be published*; it verified **zero** claus.

**Axis-2 consequence, unchanged:** `verified_cited_claus = 0` over `total_claus_present = 34` ⇒ the
C63 LEGISLATION axis is a **measured 0 %**, not `not-assessed`. See [`../RATE.md`](../RATE.md).
The axis moves when **SIG-M1** is signed after its targeted review
([`../extracted/SIG-M1-REVIEW-SAMPLE.md`](../extracted/SIG-M1-REVIEW-SAMPLE.md)).

---

## §4 — Explicit non-confirmations recorded (each pass)

**2026-08-01 (L-677 §MADRID-NZ1-DECERTIFIED + §MADRID-QUOTE-CONCORDANCE — one gate SHUT, one
document CUSTODIED, nothing SIGNED)**
- **§3 is still empty and `verified_cited_claus` is still 0.** No article was read by a human, no
  parameter was signed, and the LEGISLATION axis did not move. It is now a MEASURED 0 % rather than
  an unmeasured one — a better statement of the same fact, not a better fact.
- **No gate was OPENED. One was CLOSED.** `MADRID_NZ1_CERTIFIED` `true → false`.
  `MADRID_ENVELOPE_VERIFIED` untouched (`false`). ⇒ **no Madrid parcel receives a numeric envelope
  from any path today.**
- **⚠ The Compendio WAS opened in this pass — mechanically, and only as a string index.** V21 checks
  that quotes are PRESENT; it does not read them for meaning, and **no numeric value in
  `extracted/*.json` or in `esMadridPgoum97.ts` was checked against its article's sense.** Whether
  *fondo edificable* was correctly identified, whether an *ocupación* denominator is *parcela* or
  *manzana*, whether NZ 5's rule KIND is *retranqueo a linderos* or *distancia entre edificios* — all
  exactly as open as before.
- **216 of the 1,321 quotes carry no page citation and were not checked at all** (V21). They are
  UNEXAMINED, which is a different value from clean.
- **25 strings in a field named `verbatim` are synthesised table rows, not quotes** (V21). Their
  cells are on the cited page; the string is a reconstruction. Recorded, not repaired at source.
- **Supersession is still unexamined** — but it is newly TRACTABLE: the in-repo PDF carries per-article
  amendment footnotes (MPG 00/343 → BOCM 27.11.2023 on Arts. 8.5.6/8.8.9; MPG 00/335 → BOCM
  19.05.2016 on Cap. 8.3). **No BOCM publication was retrieved.** `laterModifications: none` is still
  written nowhere and must not be.
- **The `carácter informativo` problem is unchanged** (V3): the repo now holds a CONSOLIDATION, not
  the binding text. Holding it makes a human check possible and cheap; it does not make the
  consolidation the law.
- **Row 3 (the `Ficha Específica` deferral) was NOT fixed** — it was made moot by shutting the gate,
  which is not the same thing. It re-arms the moment SIG-M2 is answered yes.
- **P3, P4, P5, P6-usability and P7 were not run.** No `Alineación Oficial` polyline was fetched.
- **No live sigma.madrid.es dispatch was performed.** Everything here is git, PDF and R2 bytes.

**2026-08-01 (L-676 land-share + `COEF_Z` probe pass — six things MEASURED, nothing SIGNED)**
- **No gate was flipped and no number was authorised.** `MADRID_ENVELOPE_VERIFIED` is still `false`;
  `MADRID_NZ1_CERTIFIED` was **not touched**. §3 below is still empty.
- **The Compendio was not opened in this pass either.** Every V12–V18 claim is an ArcGIS response
  shape, never a reading of the primary text. ⇒ `COEF_Z`'s **positive** meaning, its **denominator**
  (manzana vs parcela), NZ 9's chapter, NZ 5's rule KIND and the zones 2/6/10/11 **nomenclature**
  question all remain exactly as open as before.
- **`SHAPE.STArea()` was trusted as published.** No re-projection and **no overlap audit** was run,
  so the 34 zone polygons are ASSUMED non-overlapping. If any overlap, V14's shares shift.
- **The land-share denominator is NZ-governed land, not the L-656 private-buildable set** — so every
  ENVELOPE figure derived from it is an **UPPER BOUND**, and it is labelled as one everywhere.
  ⚠ `tools/city-completion/measurements/madrid.measurements.json` was **deliberately NOT written**:
  the scorecard prints *"of the PRIVATE-BUILDABLE denominator (L-656)"*, and feeding it these shares
  would generate a false derivation string.
- **No `Alineación Oficial` polyline was fetched for any parcel** (V15) — only the layer's existence,
  attribute schema and feature counts. P6's *usability* half is therefore still open.
- **P3, P4, P5 and P7 were not run.**
- **Supersession is still unexamined**, and no `effectiveDate` was established for any article.
- **The primary Compendio PDF is still not retrievable in-repo** (`799c3e49`), so no human verifier
  can check the 282 machine-extracted records offline.
- ⚠ **A live correctness gap was FOUND, not fixed** (V17): the shipped NZ-1 path applies the general
  manzana footprint to parcels the ordinance governs by an individual *ficha*. Its **direction is
  unknown** — a ficha may be more or less permissive. Recorded, not repaired.

**2026-08-01 (§MADRID-PGOUM97-WIRING pass — the pack was WIRED, nothing was VERIFIED)**
- **No number was verified, and none is published.** `MADRID_ENVELOPE_VERIFIED` remains `false`;
  every parcel in the 23 packed zones receives `madridPgoum97UnverifiedRefusal`.
- **The Compendio was not opened in this pass either.** The pack's 282 records come from
  `tools/madrid-extract/`'s machine read (2026-07-31); no human has re-read one line of them.
- **⚠ Supersession was NOT checked.** No search was made for a *modificación puntual* affecting any
  Título 8 article the pack cites, and no `effectiveDate` was established for any of them —
  `readFrom` (Compendio 24-09-2025) is all the pack carries. `laterModifications: none` is written
  nowhere and must not be. (This is the same open risk Barcelona's SIG-2 records as L-661.)
- **None of P1–P7 (§1a) was run in this pass.** In particular **P1 is still open**, so
  `AMB_TX_DENOM` is REQUESTED by the new proxy but never verified to exist; the resolver reports a
  missing label as `null` and never synthesises one.
- **The `NORMAS_ZONALES/0` layer was NOT re-probed live in this pass.** The routing vocabulary is
  carried from the 2026-07-24 read (V5). The new resolver and proxy were exercised against
  RECORDED-SHAPE fixtures, not against sigma.madrid.es — so *"the proxy works"* is **unverified in
  production**; what is verified is that the client parses the documented response shape correctly
  and refuses every other shape.
- **No Madrid parcel was dispatched against the live services.** The L5 reachability test stubs the
  three same-origin proxies.
- **The zones 2/6/10/11 question is untouched** — still three candidate causes, still undetermined.
- **No street width was resolved.** L-537's measured Madrid quantum set `{15, 30}` was NOT turned
  into a `StreetWidthQuantisation`; NZ 4 / 9.1 / 9.2 publish no height.
- The `ZoningRulesEngine` confidence defect was **diagnosed and pinned, NOT fixed** (out of scope).

**2026-07-31 (Phase-4 documentation pass)**
- No NZ 4/5/7/8/9 numeric value was sourced. All remain `null` / `not extracted`.
- **Neither Compendio PDF was opened.** Only identity, size, and reachability were verified (V9).
  Nothing in either document has been read, and no check was made for an edition later than
  24-09-2025.
- **None of P1–P7 (§1a) was run.** `AMB_TX_DENOM`, `PG_ANALISIS_EDIFICACION`,
  `PG_USOS_Y_ACTIVIDADES`, `PG_EDIFICIOS_PROTEGIDOS`, and `PG_GESTION/Alineaciones` remain
  **asserted, unqueried hypotheses** — every field name attributed to them is unverified.
- The Catastro-connector question (`SOURCES.md` §G2) was **not** settled; both positions stand.
- The NZ-1 sequencing question was **not** settled — it is recorded as the founder's open call
  (`../NEXT.md` §3).
- `COEF_Z` semantics and denominator remain unverified; the field stays quarantined.
- The cause of the zones 2/6/10/11 absence was **not** determined — three candidates stand.
- NZ 9's name, chapter, and rule kind were **not** determined.
- NZ 5's rule KIND was **not** determined (setback vs open-block separation).
- The PG97 approval/BOE date was **not** re-verified; it is carried, ASSERTED.
- No licence text was obtained for the `sigma.madrid.es` services.
- The land-share figures (~65 % / ~96 % / ~35 %) were **not** sourced and are not asserted.
- ⚠ The Compendio PDF was **not opened** — only its identity, size, and reachability were verified.
  Nothing in it has been read.

**2026-07-23 (prior pass)**
- The queryable Norma-Zonal calificación endpoint was not re-verified (`PG_ORDENACION` HTTP 500).
  *Superseded 2026-07-24: transient, and off the critical path (V8).*
- No NZ 4/8/5/7 numeric value was sourced citeably.
- The per-NZ land-share split is UNSOURCED; the ~60–62 % ceiling is a product of two prior-verified
  fractions, not a measured first-pack number.

---
*Last updated: 2026-08-01 (§MADRID-PGOUM97-WIRING). Maintainer: UNASSIGNED. Authority: L-449 (human-verification gate),
ADR-0269 (curate-then-serve), C63 §1.6 (`human-reviewed` validation state).*
