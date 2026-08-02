# Murcia PGOU — primary-source verification against founder-delivered documents

**Date:** 2026-08-01 · **Discharges (partly):** L-674 · **Bears on:** SIG-MU1
**Delivered by:** founder, in-conversation, 2026-08-01 ("HERE IS THE MURCIA DOS")

This document records what was checked, against what, and what did **not** check out.
It is written to the L-661 rule: *"not found" ≠ "does not exist"*, and every claim below
is either CONFIRMED against a delivered document or marked as still open.

---

## 1 · What was delivered

| # | File | What it actually is | Bearing |
|---|------|--------------------|---------|
| 1 | `normas_urbanisticas_adaptadas_legislacion_regional.pdf` | **NORMAS URBANÍSTICAS DEL PLAN GENERAL DE MURCIA — Documento adaptado al Decreto Legislativo 1/2005**, 196 pp | ★ the operative text |
| 2 | `orden_15_mayo_2006_toma_conocimiento.pdf` | BORM 124, 31-may-2006 — Orden 15-may-2006, toma de conocimiento + Normas amendment text | provenance |
| 3 | `orden_resolutoria_aprobacion_definitiva_ambitos_suspendidos.pdf` | BORM 242, 19-oct-2006 — Orden 20-jul-2006, ámbitos suspendidos | provenance |
| 4 | `orden_cumplimiento_orden_5-3-2002.pdf` | BORM 127, 4-jun-2009 — Orden 15-may-2009, subsanación deficiencia nº 2 | provenance |
| 5 | (duplicate of #4) | — | — |

✅ **UPDATE 2026-08-01 (L-676) — the binaries ARE now in `corpus/pdf/`.** Both the cited **2012 TR**
(retrieved from `urbanismo.murcia.es`, HTTP 200) and this delivered *"adaptado al DL 1/2005"* file
(retrieved from `www.murcia.es`, HTTP 200) are filed with their SHA-256s. See
[`../corpus/INDEX.md`](../corpus/INDEX.md) and [`../corpus/RETRIEVAL-LOG.md`](../corpus/RETRIEVAL-LOG.md).
Docs #2–#4 (the BORM órdenes) are still conversation-only and remain unfiled.

---

## 2 · ⚠ VERSION DISCREPANCY — the finding that matters most

The rule pack cites its source as:

> **"PGOU de Murcia — Normas Urbanísticas, Texto Refundido diciembre 2012, Volumen 11"**

The delivered document self-identifies as:

> **"NORMAS URBANISTICAS DEL PLAN GENERAL DE MURCIA — Documento adaptado al Decreto
> Legislativo 1/2005"**

**These are not the same instrument name.** They may or may not be the same *text*.
This is exactly the Badalona-discipline trap in a new coat: a document that is
unmistakably the right *subject* and the right *municipality*, but possibly the wrong
*version*. Verify the instrument, not the plausibility.

Evidence, from the delivered documents themselves, that a **later** consolidation was
legally required:

- Doc #3 (Orden 20-jul-2006) requires *"la presentación de un **Documento Refundido
  completo** de todos los documentos de ordenación del Plan General, con una refundición
  integrada de la totalidad de la Normativa urbanística del PGMO"*.
- Doc #4 (Orden 15-may-2009) directs that the subsanación *"deberá incorporarse **al texto
  refundido del PGMO de Murcia**"*.

So the **2012 Texto Refundido is the document these very orders mandated.** The delivered
file is its legal *antecedent*, not the TR itself.

Further, the delivered consolidation is **not purely the 2005 adaptation**: it carries
`Art. 6.4.2` referencing *Modificación nº 64 de Plan General*, an `Art. 6.2.3` ZA
"Residencial protegido de alta densidad", and a closing table of *Modificaciones de Plan
General aprobadas definitivamente* (MPG 10031, 10055, 10068, 10078). It therefore
post-dates 2006 by an **unstated** margin.

### Status of the discrepancy — ✅ **RESOLVED 2026-08-01 (later the same day), L-676**

~~`status: unverified · finding: version_mismatch_unresolved`~~
→ **`status: verified · finding: reading (a) CONFIRMED — the articles are unchanged`**

Two readings were open:

- **(a)** The 2012 TR reproduces these articles unchanged, and the pack's citation is
  merely imprecise about which printing it quotes. → fix the citation string.
- **(b)** The 2012 TR altered one or more of these articles. → every affected quote must
  be re-verified and SIG-MU1's scope re-examined.

**The 2012 TR was retrieved (HTTP 200 — the "403" was the directory index, never the file),
filed at `../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf`, and diffed
article-by-article against the delivered document. Reading (a) is CONFIRMED: all 22 cited
zone articles are BYTE-IDENTICAL.** Full table and method: [`../corpus/INDEX.md`](../corpus/INDEX.md) §2.

⭐ **And the direction was backwards.** This section reasoned that the delivered file is the 2012 TR's
*"legal antecedent, not the TR itself"* — **that is correct**, and four independent signals now
confirm it (the 2012 TR carries `Art. 2.1.10` and `Art. 6.2.7`/zone `ZE` which the delivered file
lacks; the delivered file's Art. 5.1.5 cross-references *"Capítulo 22"* while its own body heading
reads `CAPÍTULO 24`, a stale reference the 2012 TR corrects; the 2012 TR uses the post-2008
*aprovechamiento de referencia* vocabulary and cites TRLSRM; and its Art. 6.2.2 is the broader
*"planes parciales **o especiales**"*). The elsewhere-recorded worry that a *"2017 re-edition"*
might **supersede** the pack's source is therefore **refuted**: «act. 28_02_2017» is a file-upload
label on an EARLIER consolidation that `www.murcia.es` still links. **PRYZM cites the later of the
two published texts.** No citation string needs fixing.

---

## 3 · Article-by-article verification — what CONFIRMED

Checked verbatim against the delivered Normas Urbanísticas.

### 3.1 The load-bearing delegation clause — ✅ CONFIRMED, EXACT, IN BOTH ARTICLES

This is the single most important line in the Murcia pack: it is why roughly two thirds
of Murcia correctly refuses. The pack quotes it; the document states it — twice, in
identical terms.

**Art. 5.25.3.3** (Estudios de Detalle) and **Art. 5.26.3.3** (Planes Especiales):

> *"En los casos en que las fichas … expresan la edificabilidad mediante un índice
> relacionado con la superficie del ámbito, el alcance de los códigos de calificación
> zonal de los suelos edificables dentro del ámbito, reflejados en los planos, **se reduce
> a las condiciones de uso y tipología de las edificaciones, pero no a los parámetros
> definitorios de la altura o edificabilidad**."*

✅ The pack's quote is word-for-word. The refusal architecture rests on real text.

### 3.2 Packed zones — ✅ CONFIRMED

| Code | Article | Pack asserts | Document states | Verdict |
|------|---------|--------------|-----------------|---------|
| RM1 | 5.5.3 | 8 plantas / 25 m; fondo 15 m | *"RM1: Altura máxima 8 plantas, equivalente a 25 m."* | ✅ |
| RM2 | 5.5.3 | 5 plantas / 16 m | *"RM2: Altura máxima 5 plantas, equivalente a 16 m."* | ✅ |
| RD | 5.9.3 | FAR 1,3; 2 plantas / 7 m | *"índice de edificabilidad … 1,3 m2/m2"*; *"2 plantas … 7 metros de altura de cornisa"* | ✅ |
| IC / IX / IG | 5.18.3 / 5.19.3 / 5.20.3 | height **no limit**, not unknown | *"La altura será libre…"* / *"será libre, en función de los requerimientos…"* | ✅ |

The `MURCIA_NO_LIMIT_FINDINGS` distinction — *"no limit" is a real legal answer and is not
UNKNOWN* — is confirmed as a faithful reading, not an interpretation.

### 3.3 The founder's own parcel — ✅ CONFIRMED refusal

- **Art. 6.6.2:** *"…se identifican en los planos de ordenación con el código **TA** seguido
  del número del expediente del correspondiente instrumento de desarrollo del planeamiento
  anterior."* → `TA-379` is an expediente pointer, exactly as the pack states.
- **Art. 5.24.5.1:** RR = *"ordenación remitida al planeamiento anterior"*, conditions
  *"enteramente concordantes con las definidas en los anteriores instrumentos convalidados"*.

Live probe 2026-08-01, `3481104XH6038S` (38.0061, −1.138028) →
`calificacion: RR · sector: TA-379`. The refusal is correct **by the ordinance's own terms**.

### 3.4 ★ MZ — the zone the founder hit, and why refusing it is right

Live probe 2026-08-01, `3272601XH6037S` (37.99566, −1.14288) →
`calificacion: MZ · descripcion: "Bloque Conformando Manzana" · sector: U` — **urbano
directo, NOT delegated soil.** So this is not a delegation refusal.

**Art. 5.6.3** states, and the pack quotes verbatim:

> *"la edificabilidad no superará el índice de 2'66 m2/m2 de superficie de parcela **más
> semiancho de calles contiguas** limitadas a un ancho máximo de 10 metros"*
>
> *"**La ocupación, la separación a linderos públicos y privados y la ordenación
> volumétrica se determinarán mediante la redacción y aprobación del correspondiente
> Estudio de Detalle**."*

✅ CONFIRMED. The refusal is correct for two independent reasons:

1. The FAR is an **algorithm over street half-width** — a Murcia street-width source PRYZM
   does not hold (the same gap as RC / RM / RN / MX).
2. The **footprint is expressly delegated** to an Estudio de Detalle by the ordinance itself.

Height *is* stated (8 plantas / 25 m) — and that is precisely the trap. **A height with no
footprint is not an envelope**, and publishing one would be L-616 mechanism-A: a missing
constraint does not read as conservative, it *overstates*.

### 3.5 The ordinance ratifies our own conservative posture

**Art. 1.1.4 (Interpretación):**

> *"…si existiere duda o imprecisión se estimará condicionante **la interpretación más
> favorable a la menor edificabilidad**…"*

The plan's own rule of construction is to resolve doubt **downward**. Refusing rather than
estimating is not merely PRYZM policy here — it is the instrument's stated method.
This should be quoted on the Murcia refusal card.

---

## 4 · ⚠ NEW RISK FOUND — MC is subject to a Plan Especial override

**Art. 5.2.1 / 5.2.3** (Centro Histórico, code `MC` — which the pack **packs and publishes**):

> *"Esta regulación de altura sustituye al anterior callejero, y es de aplicación **excepto
> si el PECHA regula específicamente la misma**."*

The **PECHA** (Plan Especial del Conjunto Histórico-Artístico) *"mantiene su vigencia"* and
overrides Art. 5.2.3 where it regulates specifically. PRYZM does not hold the PECHA.

**Consequence:** for an MC parcel inside a PECHA zone of specific regulation, publishing
Art. 5.2.3's figure could **overstate**. This is structurally identical to the L-616 finding.

`status: open · severity: potential-overstatement · action: MC needs a PECHA-scope guard
before it keeps publishing, or MC must fall back to refusal inside PECHA ámbitos.`

This was found *because* the primary source arrived. It is an argument for filing sources,
not against.

---

## 5 · Zone-dictionary completeness — ✅ the pack is complete, and honest

`Art. 5.1.5` (Zonificación) enumerates the suelo-urbano calificaciones. Cross-checked
against `esMurciaPgou2012.ts`: **all are present** — 14 packed, 8 recorded-and-refused
(`RC`, `RM`, `RN`, `MZ`, `RB`, `RU`, `RT`, `MX`), each with its article and the reason.

There is **no missing-zone gap**. The 23.51%-of-buildable-land figure is not a transcription
shortfall — it is the honest measure of how much of Murcia the general plan orders directly
*and* states completely. The remainder splits into: delegated soil (Arts. 5.25.3.3 /
5.26.3.3), street-width-dependent height, and existing-building-derived regimes.

⚠ One internal inconsistency in the document itself, recorded not hidden: `Art. 5.1.5`'s
list omits `RL` (Agrupaciones Lineales Residenciales), yet Capítulo 14 defines it in full
and the municipal layer serves it. The pack follows Capítulo 14. Noted for the 2012-TR
re-check.

---

## 6 · What this changes

| Claim | Before | After |
|-------|--------|-------|
| Delegation clause is real | asserted, unverifiable | ✅ CONFIRMED verbatim, both articles |
| RM1/RM2/RD/IC/IX/IG figures | asserted | ✅ CONFIRMED verbatim |
| TA-379 / RR refusal | asserted | ✅ CONFIRMED by Arts. 6.6.2, 5.24.5.1 |
| MZ refusal | asserted | ✅ CONFIRMED by Art. 5.6.3 — two independent grounds |
| Source is the cited 2012 TR | assumed | ❌ **NOT established** — see §2 |
| MC publishes safely | assumed | ⚠ **NEW RISK** — PECHA override, see §4 |
| Zone dictionary complete | assumed | ✅ CONFIRMED against Art. 5.1.5 |

**SIG-MU1 is not weakened by this.** Every figure it authorises is confirmed against an
official Murcia PGOU text. What remains open is *which printing* of that text, and the
PECHA scope on MC.

**L-674 is downgraded, not closed:** Murcia now has verified primary-source content, but
the binaries are not filed and the cited edition is not the delivered edition.