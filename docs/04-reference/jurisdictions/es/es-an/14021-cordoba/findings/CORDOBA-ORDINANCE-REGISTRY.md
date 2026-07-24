# Córdoba PGOU-2001 — typed, article-cited ordinance registry + machine cross-check

> **Stamp** 2026-07-24 · **Status** RESEARCH FINDINGS — machine cross-check of PRYZM's OCR'd pack
> against the **authoritative** PGOU-2001 normativa PDF. **Governs nothing.**
>
> ## ⚠ THIS DOES NOT CLEAR THE L-449 HUMAN GATE
> This registry is a **MACHINE** cross-check: PRYZM's OCR'd scalars (`esCordobaPGOU2001.ts`) checked
> line-by-line against the born-digital text of the authoritative ordinance PDF. It **raises confidence**
> and **catches OCR errors** — but every value stays `pipeline-extracted-unverified` until a
> **Spanish-planning-literate HUMAN** signs `sources/VERIFICATION.md` against this registry and the source
> crops. A machine reading the same document twice is still one source (`§CONTEXT-DATA-HONESTY`,
> "dual-source corroboration not run"). The pack's dispatcher gate (`CORDOBA_ENVELOPE_VERIFIED`) stays
> `false` and every Córdoba parcel renders a cited REFUSAL until that human sign-off.
>
> **What this registry adds over `OCR-EXTRACTION-RESULTS.md`:** (1) an **independent authoritative source**
> — the municipal/COACo *consolidated normativa* PDF, not the COACo per-subzone `O_*` link PDFs the OCR
> pass read; (2) every parameter modelled with its **TYPE** (FIXED / PERCENTAGE / RATIO / PIECEWISE /
> LOOKUP-TABLE / REFERENCE / CONDITIONAL / EXCEPTION), never a flattened scalar; (3) a per-value
> **cross-check verdict**; (4) a **material recovery** — the Unifamiliar Aislada (UAS) family the OCR pass
> marked "dead link, unextractable" is **fully present** in this authoritative source (see §6).

---

## 0 — Authoritative source used (fetched + parsed this session)

| item | value |
|---|---|
| **Document** | *PLAN GENERAL DE ORDENACION CORDOBA 2001 — TEXTO REFUNDIDO OCT. 2002 — INNOVACIONES APROBADAS A FECHA 1-2-2021 Y ACLARACIONES INCLUIDAS EN LA GUÍA PRÁCTICA 26-5-2021. NORMATIVA: USOS, ORDENANZAS Y URBANIZACIÓN* (Tomo II) |
| **URL fetched** | `https://coacordoba.org/wp-content/uploads/2021/06/2021-6-PGOU-CORDOBA-TOMO-II-USOS-ORDENANZAS_innovaciones_aclaraciones.pdf` |
| **Bytes / pages** | 1 662 388 B · 147 pp · PDF 1.4, **born-digital text layer** (extracted clean via PyMuPDF `get_text()`, no OCR, no mojibake on numerics) |
| **Title XIII bodies** | Cap. V (MC) p.76, Cap. VI (OA) p.81, Cap. VII (PAS) p.83, Cap. VIII (CTP) p.87, Cap. IX (UAD) p.96, Cap. X (UAS) p.100 |
| **Fetch failures (stated, not inferred)** | `www.cordoba.es/.../Usos_Ordenanzas_y_Urbanizacion.pdf` → **HTTP 404** (task-supplied URL is dead); `.../Refundido-PGOU-e-Innovaciones-Tomo-2.pdf` → fetched (1.5 MB) but a **scanned/compressed** variant WebFetch could not read. The COACo *innovaciones* Tomo II above is the same normativa, born-digital, and is what this registry cites. |

The article numbers cited below are the **document's own** article numbers, read directly from the text.

---

## 1 — Headline cross-check result

**Every scalar value in PRYZM's pack that this source states MATCHES it. Zero OCR errors found.**

| verdict | count | meaning |
|---|---|---|
| ✅ **MATCH** | **~58 stated scalars** across 13 packed subzones (every non-null FAR, ocupación, altura, plantas, front retranqueo, parcela-mínima, uso) | OCR scalar == authoritative source, verbatim |
| ❌ **MISMATCH (OCR error)** | **0** | no packed value contradicts the source |
| 🔶 **DERIVED / lossy-shape** (OCR scalar or null is the right *safe* shape, but the true type is a formula/table/step) | **~18 cells** — 4× FAR-derived-null (CTP-1, MC-1/2/4), 4× MC height-table-null, 6× "½·h" linderos (PAS×3 evaluated at max-h, OA×2, + rule), 1× OA height band-top, 1× CTP-1 ocupación step-function, + MC/CTP alignment-nulls | source confirms the value **cannot honestly be a plain scalar**; the pack's null/approximation is correct |
| ❓ **NOT FOUND in this source** | **0** for packed families | (the refused families §7 are found here too — see the UAS recovery §6) |

**MC-3 FAR = 3,50** — the value that trips the pack's `[0.2, 3.0]` range gate — is **CONFIRMED CORRECT**, verbatim:
*"En MC-3 la edificabilidad neta será 3,50 m2/m2."* (Art. 13.5.2.2). It is a genuine high-density subzone, **not an OCR error**; the gate flag is correct to route it to a human, and the human answer is "accept 3.50".

**Rows still needing a HUMAN JUDGMENT call (REFERENCE / EXCEPTION clauses — can never be a number): 7** (§8).

**Material finding beyond the cross-check:** the **UAS (Unifamiliar Aislada, Art. 13.10, 6 subzones)** family is **fully specified in this authoritative source** — the OCR pass marked it NOT-EXTRACTABLE only because it relied on the COACo `O_UAS1` per-subzone link (a 69-byte dead HTML). The consolidated normativa has the whole chapter. **Recoverable → §6.**

---

## 2 — The parameter TYPE model (applied to every row below)

| type | meaning | example in Córdoba |
|---|---|---|
| **FIXED** | one stated scalar | UAD altura = 7 m (13.9.3.5) |
| **PERCENTAGE** | stated % of parcel | OA ocupación = 40 % (13.6.2.3) |
| **RATIO** | m²t/m²s | PAS-3 edificabilidad = 2,00 (13.7.2.1) |
| **PIECEWISE** | step-function of an input | CTP-1 ocupación: ≤100 m²→100 %, 100–125→cap 100 m², >125→80 % (13.8.2.5) |
| **LOOKUP-TABLE** | value ← a table keyed by another dim | MC altura ← street-width table (13.5.3.1) |
| **REFERENCE** | value = a cited external/contextual line, not a number | CTP-1 alineación = "la que predomine en el grupo" (13.8.2.1) |
| **CONDITIONAL** | applies only under a stated condition | corner-lot chaflán 3 m if street <10 m (Cap. II general) |
| **EXCEPTION** | a carve-out from the base rule | rear setback waived on corner parcels (13.9.3.4) |

⚠ REFERENCE / judgment clauses stay as cited references — **never** forced into a scalar. `null` in the
pack ≠ 0: it means "this edge is an alignment/derived line the containment must skip", per C58 §1.7a.

---

## 3 — Residential families FULLY specified (OA · PAS · UAD)

### 3.1 — Plurifamiliar Aislada (PAS) — Cap. VII, Art. 13.7 (source p.83–86)

| param | subzone | type | value / rule (authoritative) | citation | vs OCR |
|---|---|---|---|---|---|
| edificabilidad (FAR) | PAS-1 / 2 / 3 | RATIO | **1,2 / 1,66 / 2,00** m²t/m²s | 13.7.2.1 | ✅ ✅ ✅ |
| ocupación | PAS-1 / 2 / 3 | PERCENTAGE | **40 % / 50 % / 40 %** (hard cap 60 %, sótano garaje) | 13.7.2.4 / .5.d | ✅ ✅ ✅ |
| altura / plantas | PAS-1 / 2 | FIXED | **PB+3 / 12,75 m** | 13.7.3.3 | ✅ |
| altura / plantas | PAS-3 | FIXED | **PB+5 / 19,50 m** | 13.7.3.3 | ✅ |
| retranqueo fachada (front) | all | FIXED | **3 m** (where alignment not drawn on plans) | 13.7.3.1.a | ✅ |
| separación linderos privados (side/rear) | all | REFERENCE→½·h | **½ de la altura total**; pack stores it evaluated @ max-h (6,375 @ 12,75; 9,75 @ 19,50) | 13.7.3.1.b | 🔶 rule flattened to scalar-at-max-h (pack documents this; under-states at lower h = safe) |
| parcela mínima | PAS-1 / 2 / 3 | FIXED | **2.000 / 1.500 / 3.000** m² | 13.7.2.2 | ✅ (not stored in pack schema) |
| fachada mínima | PAS-1 / 2 / 3 | FIXED | **30 / 30 / 40** m | 13.7.2.3 | ✅ (not stored) |
| uso dominante | all | — | **Residencial Plurifamiliar** (+ compat. industria 1ª, terciario, equip., aparc.) | 13.7.4 | ✅ (`residential`+`mixed`) |

### 3.2 — Ordenación Abierta (OA) — Cap. VI, Art. 13.6 (source p.81–83)

| param | subzone | type | value / rule | citation | vs OCR |
|---|---|---|---|---|---|
| edificabilidad (FAR) | OA-1 / 2 | RATIO | **1,4 / 1,6** m²t/m²s | 13.6.2.2 | ✅ ✅ |
| ocupación | OA-1 / 2 | PERCENTAGE | **40 %** todas las plantas (cap 60 % sótano garaje) | 13.6.2.3 | ✅ ✅ |
| altura / plantas | OA-1 / 2 | PIECEWISE / band | **PB+3 (12,5 m) … PB+6 (21 m máx)**, "resultado de distribuir el techo" | 13.6.3.1 | 🔶 pack stores band-top 21 m as the ceiling — correct as envelope max |
| relación a vial (front) | OA-1 | REFERENCE | open block, **no retranqueo stated** → null (skip edge) | 13.6.3 | ✅ (front null) |
| relación a vial (front) | OA-2 | CONDITIONAL | parcelas a vial **deberán alinearse** → 0 | 13.6.3.2 | ✅ (front 0) |
| separación linderos privados (side/rear) | all | REFERENCE→½·h | **≥ ½ altura, mínimo 3 m** (10,5 @ 21 m) | 13.6.3.3 | 🔶 rule flattened to scalar-at-max-h |
| parcela mínima | OA-1 | FIXED | **600 m²** (círculo Ø 25 m) | 13.6.2.1.a | ✅ |
| parcela mínima | OA-2 | REFERENCE | **"expresadas en la Unidad de Actuación"** — external instrument | 13.6.2.1.b | ✅ (human/derived-planning) |
| uso dominante | all | — | **Residencial Plurifamiliar** (+ compat.) | 13.6.4 | ✅ |

### 3.3 — Unifamiliar Adosada (UAD) — Cap. IX, Art. 13.9 (source p.96–99)

> UAD-1's content **is present here** (all three subzones live in Art. 13.9). The dead COACo `O_UAD1`
> link is fully recovered — confirms `OCR-EXTRACTION-RESULTS §2.3`.

| param | subzone | type | value / rule | citation | vs OCR |
|---|---|---|---|---|---|
| edificabilidad (FAR) | UAD-1 / 2 / 3 | RATIO | **1,0 / 0,7 / 1,0** m²t/m²s | 13.9.2.3 | ✅ ✅ ✅ |
| ocupación | UAD-1 / 2 / 3 | PERCENTAGE | **60 % / 40 % / 60 %** | 13.9.2.2 | ✅ ✅ ✅ |
| altura / plantas | all | FIXED (+EXCEPTION) | **PB+1 / 7 m** (ático vividero within cumbrera 9,75 m) | 13.9.3.5 | ✅ |
| retranqueo fachada (front) | UAD-1 / 2 | FIXED | **4 m / 5 m** (separation valla↔fachada) | 13.9.3.2.b | ✅ ✅ |
| retranqueo fachada (front) | UAD-3 | REFERENCE | **sobre la alineación de vial (0)**, salvo retranqueo marcado en plano | 13.9.3.2 | ✅ (front 0) |
| lateral (side) | all | TYPE-implicit | **medianera / party-wall (0)** — "adosada" typology | 13.9.1 (adosada) | ✅ (side 0; typological, not a stated metre) |
| separación fondo (rear) | UAD-1 / 2 / 3 | FIXED (+EXCEPTION) | **5 / 6 / 5** m; **exceptuadas parcelas en esquina** | 13.9.3.4 | ✅ ✅ ✅ |
| profundidad máx edificable | UAD-1 / 2 / 3 | FIXED | **16 / 18 / 16** m | 13.9.3.3 | ✅ (not stored) |
| parcela mínima | UAD-1 / 2 / 3 | FIXED | **180 / 300 / 160** m² | 13.9.2.1.a | ✅ (not stored) |
| fachada mínima | UAD-1 / 2 / 3 | FIXED | **6,5 / 8 / 6** m | 13.9.2.1.b | ✅ (not stored) |
| uso dominante | all | — | **Residencial Unifamiliar** (+ compat.) | 13.9.5 | ✅ |

---

## 4 — Residential family with a DERIVED core: Colonia Tradicional Popular (CTP-1)

Cap. VIII, Art. 13.8 (source p.87–89). The most common family by parcel (~53 % of pilot).

| param | type | value / rule (authoritative) | citation | vs OCR |
|---|---|---|---|---|
| **edificabilidad (FAR)** | **DERIVED** | *"El techo edificable será el resultante de la aplicación de las Normas de Composición del edificio"* — **an algorithm, not a number** | 13.8.2.3 | ✅ pack = `null` (correct; a scalar would be confident-wrong) |
| **ocupación** | **PIECEWISE** | ≤100 m² → **100 %**; >100 & <125 m² → **cap 100 m²** (absolute); >125 m² → **80 %**. + EXCEPTION: 100 % on through-lots <10 m deep, lots <5 m deep, and qualifying corners | 13.8.2.5 | 🔶 pack stores **0,80** = the >125 m² branch. Correct *shape-loss*: it under-states small parcels (safe), and misses the middle absolute-100-m² cap. True type is PIECEWISE keyed on `sup_pc_m2` |
| altura / plantas | FIXED (+EXCEPTION) | **PB+1 / 7 m**; ático vividero within **cumbrera 9,75 m** | 13.8.3.1 | ✅ |
| profundidad máx edificable | FIXED (+REFERENCE) | **16 m** desde alineación de vial (from *alineación predominante* for front-garden groups) | 13.8.2.4 | ✅ (not stored) |
| alineación (front) | **REFERENCE** | fachada **on the vial line**, **salvo** grupos con patio/jardín delantero → **"la alineación que predomine en el citado grupo"** | 13.8.2.1 | ✅ pack = `null` (alignment; the exception is a human-judgment line — §8) |
| lateral / rear | REFERENCE | alignment zone — no stated private-lindero setback | 13.8 | ✅ (null) |
| parcela mínima | FIXED | **70 m²** | 13.8.2.2 | ✅ |
| uso dominante | — | **Residencial Unifamiliar** (+ compat.) | 13.8.5 | ✅ |

> Note: **CTP-C (Colonia Tradicional Popular Santa Cruz)** is a *separate* subzone (Art. 13.8.6–13.8.12),
> not packed and not the same as CTP-1. It exists in this source if ever needed.

---

## 5 — Manzana Cerrada (MC): coverage clean, height is a TABLE, FAR derived

Cap. V, Art. 13.5 (source p.76–81). Largest family by area. Front on the vial line.

| param | MC-1 | MC-2 | MC-3 | MC-4 | type | citation | vs OCR |
|---|---|---|---|---|---|---|---|
| **edificabilidad (FAR)** | DERIVED | DERIVED | **3,50** | DERIVED | DERIVED / RATIO | 13.5.2.2 | ✅ null / null / **✅ 3,50 CONFIRMED** / null |
| **ocupación** (PB / plantas altas) | 100 % / **70 %** | 100 % / **70 %** | 100 % / **70 %** | 100 % / **90 %** | PERCENTAGE (+EXCEPTION corner/small-lot 100 %) | 13.5.2.5 | ✅ 0,7 / 0,7 / 0,7 / **0,9** (pack stores plantas-altas value) |
| **altura / plantas** | LOOKUP-TABLE ↓ | table | table | table | LOOKUP-TABLE (street width) | 13.5.3.1 | ✅ all `null` (a scalar = the L-526 failure) |
| alineación (front/side/rear) | vial line (0) | 0 | 0 | 0 | REFERENCE (+EXCEPTION soportal/retranqueo) | 13.5.2.3 | ✅ setbacks `null` |
| parcela mínima | **150 m²** | **150 m²** | **500 m²** | *(not stated)* | FIXED | 13.5.2.1 | ✅ ✅ ✅ / ❓ MC-4 genuinely not stated |
| uso dominante | Resid. Plurifamiliar | | | (+ compat.) | — | 13.5.4 | ✅ |

**MC altura LOOKUP-TABLE — transcribed verbatim from Art. 13.5.3.1 (this is the correct "value"; a scalar
must never be emitted):**

| street width (anchura del vial) | MC-1 | MC-2 & MC-4 | MC-3 |
|---|---|---|---|
| ≤ 8 m | PB+2 / **9,75 m** | — | — |
| ≤ 10 m | PB+3 / 12,75 m *(>8–10)* | PB+2 / **9,75 m** | PB+2 / **9,75 m** |
| ≤ 14 m | PB+4 / 16,75 m *(>10–14)* | PB+3 / 12,75 m *(>10)* | PB+3 / 12,75 m *(>10–15)* |
| ≤ 16 m | PB+5 / 19,50 m *(>14–16)* | " | PB+4 / 16,75 m *(>15–20)* |
| > 16 m | PB+6 / 22,50 m | " | PB+5 / 19,50 m *(>20)* |

✅ **This table matches the recon transcription in `OCR-EXTRACTION-RESULTS §2.5` exactly** (MC-1 5-band,
MC-2/4 2-band, MC-3 4-band). Independent cross-check passes. Also confirmed: each row carries an *altura
mínima obligatoria* one step below the max (e.g. MC-1 ≤8 m → min PB+1) — a floor, not part of the envelope
ceiling.

**MC height REFERENCE/EXCEPTION riders (human-judgment, not scalars):** (13.5.3.1.e) adjacent to a protected
building → cornice referenced to the protected neighbour (±4–5 m retranqueo); (13.5.3.1.g) certain MC areas
carry an explicit plantas count **on the Calificación plano** that overrides the table.

---

## 6 — RECOVERY: Unifamiliar Aislada (UAS) — Art. 13.10, fully specified in this source

**The OCR pass marked UAS NOT-EXTRACTABLE** (`OCR-EXTRACTION-RESULTS §2.7`: dead `O_UAS1` link, "no held
document contains the UAS chapter"). **That is now false against the authoritative source** — Cap. X,
Art. 13.10 (source p.100–103) carries the whole family, six subzones, every field a clean stated scalar:

| param | UAS-1 | UAS-2 | UAS-3 | UAS-4 | UAS-5 | UAS-6 | type | citation |
|---|---|---|---|---|---|---|---|---|
| edificabilidad (FAR) | **0,40** | 0,35 | 0,30 | 0,25 | 0,21 | **0,18** | RATIO | 13.10.2.1 |
| parcela mínima (m²) | 600 | 750 | 950 | 1.200 | 1.450 | 1.700 | FIXED | 13.10.2.2.a |
| fachada mínima (m) | 16 | 16 | 18 | 20 | 20 | 25 | FIXED | 13.10.2.2.b |
| ocupación | **40 %** | 35 % | 30 % | 25 % | 21 % | **18 %** | PERCENTAGE | 13.10.2.3 |
| separación lindero frontal (front) | **6 m** (all subzones) | | | | | | FIXED | 13.10.3.1 |
| separación linderos privados (side/rear) | **3 m** (all subzones) | | | | | | FIXED | 13.10.3.2 |
| altura / plantas | **PB+1 / 7 m** (all; ático within cumbrera 9,75 m) | | | | | | FIXED (+EXCEPTION) | 13.10.3.3 |
| uso dominante | **Residencial Unifamiliar** (+ compat.) | | | | | | — | 13.10.4 |

⚠ **This is a recovery finding, NOT a green light to pack.** (a) It is **still machine-read** (one source)
→ `pipeline-extracted-unverified`, human-verify before ship. (b) **The COVERAGE blocker is unchanged**:
only **1 UAS parcel / 4** exists in the pilot and the calificación gives the family name only (no UAS-1..6
subzone), so a pilot parcel **still cannot be bound** to one of these six rows — the same subzone-unbindable
trap as Industrial. So: the *ordinance content* is recovered (the KNOWLEDGE gap closes), but the *parcel
binding* gap (COVERAGE) remains. Record the numbers for the SPEC; do not auto-pack until binding is solved.
The lesson: **the OCR "dead link" verdict was an artifact of reading the COACo per-subzone `O_*` PDFs; the
consolidated municipal normativa holds every family.** A production fetcher should prefer the consolidated
Tomo II over the per-subzone links.

---

## 7 — Families the pack refuses on — checked against this source

| family | pack status | authoritative check | verdict |
|---|---|---|---|
| **Unifamiliar Aislada (UAS)** | refused (dead link) | **FOUND** — Art. 13.10, 6 subzones (§6) | 🔶 content recovered; **binding** gap remains (1 parcel, subzone-unbindable) |
| **Uso Industrial** | refused (subzone-unbindable, ocupación derived) | not re-fetched this session; OCR record stands (IND-1/2/3 ocupación *"resultante de la aplicación de los parámetros"* = DERIVED) | ❓ not re-verified here — refusal remains correct (1 parcel, unbindable) |
| **Uso Comercial** | refused (context overlay) | Art. 13.12 is a use overlay (follows underlying zone) — consistent with OCR record | refusal remains correct |
| **Elemento Protegido** | refused (preservation regime) | Art. 13.3 — no new private envelope | refusal remains correct |
| **CTP1-Campo de la Verdad** | refused (Conjunto Histórico Tomo VI) | Art. 13.4 defers to Tomo VI (not in this Tomo II) | ❓ envelope genuinely not in this document — refusal remains correct |

> Industrial / Comercial / Elemento Protegido / Campo de la Verdad were **not re-fetched** this session
> (scope was the residential envelope families the pack asserts values for). Their OCR-era verdicts are
> unchanged and remain correct refusals. Re-running the cross-check on Art. 13.11 (Industrial) and Art. 13.12
> (Comercial) against this same PDF is a cheap follow-up.

---

## 8 — Rows needing a HUMAN JUDGMENT call (REFERENCE / EXCEPTION — never a scalar)

These are **not** OCR errors and **not** derivable to a number by any engine — they are cited references to
context or discretion. The human reviewer must confirm the pack's `null`/skip-edge handling is right; they
can never become a scalar.

1. **CTP-1 alineación (front)** — 13.8.2.1: for front-garden groups, alignment = *"la que predomine en el
   citado grupo"* (the prevailing alignment). REFERENCE to built context. Pack `null` = correct.
2. **OA-1 relación a vial (front)** — 13.6.3: open block, **no retranqueo stated**. Pack `null` (skip edge).
   Human must confirm null vs a default.
3. **OA-2 / CTP-1 profundidad & alineación from *alineación predominante*** — the front-garden and consolidated
   cases both defer to the prevailing built line, not a number.
4. **OA-2 parcela mínima** — 13.6.2.1.b: *"expresadas en la Unidad de Actuación"* — an external instrument.
5. **MC height — protected-neighbour cornice** — 13.5.3.1.e: cornice referenced to an adjacent protected
   building (±4–5 m retranqueo), discretionary. REFERENCE.
6. **MC height — plano override** — 13.5.3.1.g: explicit plantas on the Calificación plano override the
   street-width table for certain MC areas. LOOKUP shifts to the drawing.
7. **Corner-lot chaflán** — Cap. II general norm (source p.43): corner lots on streets <10 m must cut a 3 m
   chamfer *"en ambas fachadas … En casos excepcionales, el Ayuntamiento determinará la solución"*.
   CONDITIONAL + discretionary. Applies across MC/OA/PAS/UAS/Industrial/Comercial/Equip.

Plus the **derived/tabular** values that are engine-computable but still human-confirm-the-shape: CTP-1 +
MC-1/2/4 edificabilidad (DERIVED); MC altura (street-width TABLE); the PAS/OA "½·h" linderos (formula);
CTP-1 ocupación (PIECEWISE on `sup_pc_m2`).

---

## 9 — Verdict roll-up (what the human signs against)

- **13 packed subzones** (PAS-1/2/3, OA-1/2, UAD-1/2/3, CTP-1, MC-1/2/3/4): **every stated scalar MATCHES**
  the authoritative source. **Zero mismatches / zero OCR errors.**
- **MC-3 = 3,50** confirmed genuine (accept despite the range-gate flag).
- **~18 cells are DERIVED / TABLE / REFERENCE / PIECEWISE** and correctly modelled as `null` or a documented
  safe approximation — the pack's honesty design is validated.
- **7 rows are REFERENCE/EXCEPTION** needing a human judgment call (§8) — none can ever be a scalar.
- **UAS family recovered** in this source (§6) — closes the ordinance-KNOWLEDGE gap; the parcel-BINDING gap
  stays.
- **This machine cross-check RAISES confidence but does NOT clear L-449.** The values remain
  `pipeline-extracted-unverified` until a Spanish-planning-literate human signs `sources/VERIFICATION.md`
  against this registry and the source article text quoted above.

---

## 10 — Reproduction

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
# authoritative born-digital normativa (Tomo II) — the source this registry cross-checks against:
curl -A "$UA" -o TomoII.pdf \
  "https://coacordoba.org/wp-content/uploads/2021/06/2021-6-PGOU-CORDOBA-TOMO-II-USOS-ORDENANZAS_innovaciones_aclaraciones.pdf"
# extract the text layer (no OCR needed — born-digital):
python -c "import fitz; d=fitz.open('TomoII.pdf'); open('TomoII.txt','w',encoding='utf-8').write('\n'.join(p.get_text() for p in d))"
# jump to each family body:
grep -n 'ORDENANZA DE LA ZONA' TomoII.txt   # Cap V MC / VI OA / VII PAS / VIII CTP / IX UAD / X UAS
```

**Related:** `OCR-EXTRACTION-RESULTS.md` (the OCR pass this cross-checks) · `CORDOBA-DATA-RECON-SPIKE.md`
(access/geometry/provenance) · `sources/VERIFICATION.md` (the L-449 human sign-off, still unsigned) ·
`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts` (the pack under check).
