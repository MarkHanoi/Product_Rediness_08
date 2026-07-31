# Madrid (INE 28079) — human verification / sign-off

**Status: DRAFT. NOTHING LEGALLY SIGNED. No pack may ship `confidence: 'structured'` (or be
registered) until this file records a human sign-off (the L-449 gate).**

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

**What §1 does NOT establish:** any numeric rule value, any article number, `COEF_Z`'s meaning, the
cause of the 2/6/10/11 absence, NZ 9's identity, NZ 5's rule kind, any land-share figure, or any
licence grant. Those are §2 and §3.

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

## §3 — Signed off (legal)

| Who | When | Which document version (`readFrom`) | Fields signed | What they could NOT confirm |
|---|---|---|---|---|
| — | — | — | — | *(nothing signed yet)* |

**Axis-2 consequence:** `verified_cited_claus = 0` over `total_claus_present = 34` ⇒ the C63
LEGISLATION axis is a **measured 0 %**, not `not-assessed`. See [`../RATE.md`](../RATE.md).

---

## §4 — Explicit non-confirmations recorded (each pass)

**2026-07-31 (Phase-4 documentation pass, this pass)**
- No NZ 4/5/7/8/9 numeric value was sourced. All remain `null` / `not extracted`.
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
*Last updated: 2026-07-31. Maintainer: UNASSIGNED. Authority: L-449 (human-verification gate),
ADR-0269 (curate-then-serve), C63 §1.6 (`human-reviewed` validation state).*
