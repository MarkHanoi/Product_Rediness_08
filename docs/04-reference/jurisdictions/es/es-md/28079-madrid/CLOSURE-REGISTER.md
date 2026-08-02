# Madrid (INE 28079) — CLOSURE REGISTER (the complete blocker list)

> **Stamp 2026-08-01.** The single place that answers *"what is left before Madrid is CLOSED?"*
> Companion to [`RATE.md`](./RATE.md) (which scores axes) — **this file tracks BLOCKERS.**
> Every row ends in a **yes/no**, never an open question.
> Modelled on [`../../es-ct/08019-barcelona/CLOSURE-REGISTER.md`](../../es-ct/08019-barcelona/CLOSURE-REGISTER.md).

---

## The definition of CLOSED — ratified 2026-08-01 (founder)

> **A city is CLOSED when every parcel reaches a TERMINAL, EVIDENCE-BACKED state — either a
> constructed envelope, a cited delegation, or an explicit refusal with a documented reason.**

**It does NOT mean every parcel returns a numeric envelope.** Legally-delegated and discretionary
land is CLOSED when it carries a cited delegation. Closure is about **exhausting the legal search
space and making every outcome explicit** — not forcing a number where the law provides none.

**Madrid is the city where that distinction stops being philosophical.** **60.46 %** of Madrid's
Norma-Zonal-governed land is **Norma Zonal 3, *Volumetría Específica*** — where the PGOUM-97's own
Art. 8.3.1 says the *aprovechamiento urbanístico* **is already exhausted** and the Plan
*"asume la consolidación de la ciudad resultante sin imponer un nuevo modelo"*. There is no number
to compute there, and there never will be. Madrid is therefore **majority-closed by delegation, not
by computation** — and any scorecard that reads that as failure is measuring the wrong thing.

## The standard every blocker must meet before it closes

**Evidence → Findings → Decision → Alternatives rejected.**

⚠ **No blocker may rest at *"needs founder decision"* until it is PROVEN that no authoritative
evidence exists.** A decision taken before the evidence is exhausted is a guess with a signature on
it. **Negative evidence closes a blocker** — *"no authoritative resolver exists, here is where we
looked"* is a valid, permanent closure. Row **2** in this register is exactly that.

## Taxonomy

| | Bucket | Unblocked by |
|---|---|---|
| **A** | **Evidence** | primary sources — BOE/BOCM, the Compendio 2025, municipal GIS |
| **B** | **Engineering** | implementation |
| **C** | **Contract** | architecture change |
| **D** | **Product policy** | a founder/qualified-human decision, *after* A is exhausted |

---

## Madrid's ARITHMETIC MAXIMUM RATE — and how much of the gap is LAW

⚠ **All land shares below are MEASURED** (L-676, 2026-08-01), by server-side `SHAPE.STArea()`
aggregation over all 34 `AMB_TX_ETIQ` codes — **149,577,170 m²** of Norma-Zonal-governed land.
**Denominator = land the PGOUM-97 zoning layer assigns a Norma Zonal to.** It is **not** the
municipal area (≈604 km²) and **not** the L-656 private-buildable denominator (row **9**), so every
ENVELOPE figure here is an **UPPER BOUND**.

### Where every square metre lands today

| State | Share | What the parcel gets |
|---|---:|---|
| **TERMINAL — cited delegation** (NZ 3) | **60.458 %** | legally-grounded `derived-plan` refusal, Art. 8.3.1 |
| **PENDING a signature — NZ 1** | **11.695 %** | ⚠ **CHANGED 2026-08-01**: was a constructed envelope; the gate that authorised it was **DE-CERTIFIED** (row 5), so it is now a cited refusal |
| **PENDING one signature** (NZ 4·5·7·8·9) | **27.847 %** | cited *"machine-extracted, unverified"* refusal |
| **TERMINAL TODAY** | **60.458 %** | ⚠ was 72.153 % |
| **…of which carries a HUMAN-SIGNED citation** | **0 %** | ⚠ nothing in Madrid is L-449 signed |
| **…receiving a NUMERIC ENVELOPE from any path** | **0 %** | ⚠ **as of 2026-08-01, no Madrid parcel does** |

### The ENVELOPE axis (weight 20)

```
today (2026-08-01) 0.11695×0.0 + 0.60458×0.0 + 0.27847×0.0     =  0.0 %   (0.00/20)  ← MEASURED
was, until today   0.11695×0.4 + 0.60458×0.0 + 0.27847×0.0     =  4.7 %   (≈0.94/20)
after SIG-M2 yes   0.11695×0.4 + 0.60458×0.0 + 0.27847×0.0     =  4.7 %   (≈0.94/20)
after SIG-M1 too   0.11695×0.4 + 0.60458×0.0 + 0.17248×0.1     =  6.4 %   (≈1.29/20)
                                        (SIG-M1 as scoped excludes six zones — row 1)
realistic          all 23 packed at pipeline-extracted-unverified =  7.5 %   (≈1.49/20)
ARITHMETIC MAX     0.11695×1.0 + 0.27847×0.9 + 0.60458×0.0     = 36.8 %   (≈7.35/20)
```

⚠ **THE `today` LINE FELL 4.7 → 0.0 ON 2026-08-01, AND NOT BECAUSE ANY LAND CHANGED.** The NZ-1
0.4 was authorised by `MADRID_NZ1_CERTIFIED = true`, a gate opened by an AI-co-authored commit
(`3e571724`) that cited itself as its own sign-off while `sources/VERIFICATION.md §3` was empty
(row **5**). The 4.7 % was never ours to report. **A single human answer to SIG-M2 restores it** —
this is the cheapest 4.7 points in the dossier, and it costs a paragraph, not a survey.

**ENVELOPE caps at ≈36.8 %. Of the ≈12.65 missing points, ≈12.09 — that is 96 % of the gap — are
LAW**: NZ 3's 60.458 % can never carry a computed envelope under any amount of engineering, because
the plan declines to state one. The remaining ≈0.56 points are tier headroom (re-sourcing
machine-extracted values into per-field cited ones).

⚠ **Madrid's ENVELOPE ceiling (~37 %) is roughly HALF Barcelona's (~68 %), and that is a fact about
Spanish planning law, not about our effort.** Barcelona's delegated land is 2.06 % (clau 22@);
Madrid's is 60.46 %.

### The whole RATE

| Axis | Weight | Today | Arithmetic max | Capped by |
|---|---:|---|---|---|
| LEGISLATION | 25 | **0 %** (0/34 signed) | **100 %** | **effort** — all 34 claus have a Título 8 chapter to cite, and since 2026-08-01 the chapter is **in the repo** (row 15) |
| ENVELOPE | 20 | **0 %** ⚠ *was ≤4.7 % until 2026-08-01* — row **5** | **36.8 %** | **LAW** (NZ 3) + one missing signature |
| PARCEL | 15 | 99.6 % | 100 % | — |
| DATA-SOURCES | 15 | 100 % | 100 % | — |
| HEIGHTS/LOD | 10 | **0.2 %** (269 tagged / 121,158 footprints, MEASURED — row 17) | 100 % | effort (national bake in flight) |
| TERRAIN | 10 | 50 % | 100 % | effort |
| CONTEXT | 5 | **89 %** ⚠ *reported 0 % by the tool until 2026-08-01 — a PARSE FAILURE, not a bake gap* | 100 % | effort |

⚠ **ALL SEVEN AXES ARE NOW MEASURED** (`tools/city-completion/measurements/madrid.measurements.json`,
written 2026-08-01 once the tool stopped hard-coding the L-656 denominator string — row 9). The board
reads **39.4 % over 100 % of the ratified weight**, where the same tool on the same day read
**87.5 % over 45 %**.

**The composite fell 48 points because the EXPENSIVE axes were finally measured, not because Madrid
got worse.** LEGISLATION (25), ENVELOPE (20) and HEIGHTS (10) are 55 % of the ratified weight and all
three were `not-assessed`, so the renormalisation was quietly reporting *"Madrid, judged only on the
axes that were cheap to judge"* as *"Madrid"*. That is not a smaller truth than 39.4 %; it is the
answer to a different question, and it flattered the city by 48 points.

⚠ **Do not read 87.5 → 39.4 as this pass DAMAGING anything.** Exactly one real capability changed
hands — row **5**, NZ-1's de-certification, worth 4.7 points of the ENVELOPE axis (~0.94 of 100).
The other ~47 points were never measured in the first place.

**Madrid's arithmetic maximum RATE ≈ 87 %** (≈87.3/100); **measured today it is 39.4 %.** **≈12.7 of
the 13 points missing from that maximum are the ENVELOPE axis, and ≈12.1 of those are LAW.** A Madrid reporting 100 % would mean we had stopped
being honest about what the PGOUM-97 does not say.

⚠ **Do not compare this headline with Barcelona's ≈77 % without reading both rows.** Madrid's
LEGISLATION axis is *not* law-capped (Barcelona's is, at ~48 %) while Madrid's ENVELOPE axis is
capped far harder. The two cities are limited by opposite things.

---

## The register

| # | Blocker | Bucket | Sev | Sign if omitted | Status | Closes when |
|---|---|:--:|:--:|:--:|---|---|
| **1** | **SIG-M1 unsigned — the 23 PGOUM-97 zones publish nothing** | **D** | **P0** | EXACT *(no number ships)* | 🟠 **PREPARED, UNSIGNED — everything up to the signature is done** | ✔ Evidence is **exhausted**: `tools/madrid-extract/` produced **282 cited records** from the Compendio 2025 born-digital text, each carrying article + apartado + PDF page + verbatim quote; the pack, the registry entry, the router, the proxies, the confidence ceiling (§PACK-CONFIDENCE-CEILING) and the authorisation gate (§ENVELOPE-PUBLICATION-AUTHORISATION) are all landed and test-pinned. **A machine read it, and a pack cannot sign its own transcription (L-449).** Closes when a Spanish-planning-literate human signs `sources/VERIFICATION.md` SIG-M1. ⚠ **As currently scoped it EXCLUDES six zones** (`4`, `9.1`, `9.2`, `5.1`, `5.2`, `5.3` — rows 7/8/10), so it moves **17.248 %**, not 27.847 %, of NZ-governed land. ⚠ Authorises the **red `pipeline-extracted-unverified`** chip only, never `structured`. |
| **2** | **`COEF_Z` bound to `farRatio` (the L-616 failure mode)** | ~~A~~ → **B** | ~~P0~~ **P3** | EXACT *today* | ✅ **CLOSED ON NEGATIVE EVIDENCE — `COEF_Z` is measurably NOT a FAR (L-676, 2026-08-01)** | ✔ done. **Census of all 15,907 `PG_CONDICIONES_EDIFICACION/6` polygons, 57 distinct values: 100 % are INTEGERS in 0–8, and 47.56 % carry a COMPOUND value** (`"0 / 5"` ×1,498, `"0 / 6 / 7"` ×409, `"0 / 4 / 5 / 7"`). **A single polygon cannot hold three simultaneous plot ratios**, and a real *edificabilidad* is continuous (`1,20`, `2,75`) — the observed field is neither. ⇒ The "it is a FAR" hypothesis is **eliminated on measured data**, permanently, with no ordinance read. ⚠ **This is a NEGATIVE closure and it does not say what `COEF_Z` IS** (storeys? grados? a catalogue coefficient?) — Compendio Cap. 8.1 is still the only source for that, and it stays **`null`** until then. **The trap, quantified:** `parseFloat("0 / 5") === 0` would publish a **zero-buildability** envelope on 47.56 % of polygons, and `parseFloat("8")` would publish **FAR 8.0** on the numeric 44.87 % — an ~8× over-statement. **Verified safe today, not assumed:** `resolveMadridNZ1Ring.ts` populates `edificabilidad` only from a single clean positive number, and `siteDispatch.ts` builds its `ZoningRecord` with **`structuredFields: {}`** — nothing binds it. **Residual (B, P3):** the parsed value is still exposed on the resolver's return type, so the ban is enforced by call-site convention, not by the type system. Closes fully when the resolver returns `COEF_Z` as an opaque branded token that *cannot* be assigned to a ratio field. |
| **3** | **The live NZ-1 path never reads the *Ficha Específica*** | **B** | **P1** | ⚠ **WRONG-AUTHORITY — sign genuinely UNKNOWN** | 🔴 **OPEN — and it is the only Madrid path that publishes a number** | `PG_CONDICIONES_EDIFICACION/1 Ficha Específica` (point, `NNUMORD` + `FESPECIFICA`) marks parcels whose conditions are **individually defined**, so the general manzana footprint does **not** govern them. **131 points city-wide** (measured, L-676). The shipped resolver `providers/resolveMadridNZ1Ring.ts` **contains no reference to it** (`grep -i ficha` ⇒ zero hits) — so such a parcel today receives the **general** footprint, clipped and rendered, at `estimated-ruleset`. ⚠ **Do not rank this by magnitude — the sign is unknown and that is the point:** an individual *ficha* may be more or less permissive than the general footprint, so this is a **wrong-authority** claim, not a size error. The correct output is a **deferral** (`parcel-override` → refuse), which is exactly what the *unwired* `rulepacks/esMadridNZ1Provider.ts` already implements and tests (`hasParcelOverride` → `resolveExplicitAreaRing` → `{ok:false, reason:'parcel-override'}`). **Closes when** the `/api/madrid/condiciones` proxy also queries layer 1 and `resolveMadridNZ1Ring` refuses on a hit. Coupled to row **4**. |
| **4** | **TWO rival NZ-1 providers; the better one is unreachable dead code** | **B** | P2 | EXACT *(dead code publishes nothing)* | 🔴 **OPEN — measured by reachability, not by existence** | `rulepacks/esMadridNZ1Provider.ts` (the L-608 adapter: `parseCoefZ`, the ficha override, `mapMadridConditionsToExplicitAreaSource`) is imported by **nothing but its own test** — verified by `grep` across `apps/ packages/ server/ tools/ src/`. It declares proxy routes **`/api/madrid/pgoum97/{condiciones,ficha}`** which are **not mounted in `server.js`**. The path that actually ships is `providers/resolveMadridNZ1Ring.ts` behind `/api/madrid/condiciones` (mounted, `server.js:514`). ⇒ Madrid has two implementations of one job; the shipped one is the weaker one, and the ficha logic (row 3) lives in the dead one. **This is the `authored-but-unwired` pattern: audit REACHABILITY, not existence.** **Closes when** one of the two is deleted and the survivor carries the ficha check. ⚠ Do **not** simply wire the L-608 provider — its proxy routes do not exist; the cheaper fix is to port `parseCoefZ` + the ficha check into the live resolver and delete the adapter. |
| **5** | **`MADRID_NZ1_CERTIFIED = true` had no signature row — a MACHINE opened its own publication gate** | **D** | **P1** | ⚠ **OVER-STATED our own authority** *(the geometry was real; the AUTHORITY to publish it was not)* | ✅ **CLOSED 2026-08-01 — GATE DE-CERTIFIED (§MADRID-NZ1-DECERTIFIED, L-677)** | ✔ done, and the evidence is worse than this row originally alleged. It said the gate stood on *"an attribution with no artefact behind it"*. **MEASURED:** `git log -S "MADRID_NZ1_CERTIFIED: boolean = true"` returns **exactly one commit** — `3e571724`, *"fix(madrid): ship the parcel ring on compound COEF_Z + flip NZ1 gate ON"*, **`Co-Authored-By: Claude Opus 4.8`** — whose entire message concerns the COEF_Z parse; the flip is four unexplained words in the subject line. ⇒ the docstring's *"L-608 sign-off, 2026-07-25"* **cited as its authority the very commit that opened it**, and **the signatory was a machine**. `sources/VERIFICATION.md §3` is empty; `resolveMadridNZ1Ring.test.ts` then PINNED it (`expect(…).toBe(true)`, *"the L-608 sign-off"*), so the repo asserted the signature as a fact in two places while it existed in none. **L-449's content is that a pack cannot sign its own transcription; a model flipping its own publication gate is that rule's limiting case.** **ACTION — deliberately the smaller of the two available.** An agent cannot supply the missing signature (that is what L-449 is *for*), so the gate was **SHUT**, not rationalised: `MADRID_NZ1_CERTIFIED = false`. Every NZ-1 parcel now receives the cited refusal the path was always designed to give. ⇒ **ENVELOPE falls from a reported ≤4.7 % to a measured 0 %, and NO Madrid parcel receives a numeric envelope from any path today.** ⚠ **A correction, not a regression** — the 4.7 % was authorised by a machine signing its own work. ⚠ **Nothing here says NZ 1's footprint is wrong**; the case for re-opening is strong and unrebutted, it simply has to be made by a person. **GUARD (the actual ask — make reintroduction impossible):** `packages/site-parcel-data/src/l449CertificationGates.ts` + `__tests__/l449CertificationGates.test.ts`. It scans `src/` **recursively**, for **BOTH** `*_CERTIFIED` and `*_ENVELOPE_VERIFIED` — the pre-existing `envelopeAuthorisation.test.ts §TOTALITY` scanned only `src/rulepacks/` for the latter, so this gate was invisible on **both** the directory and the naming axis — and it **DEREFERENCES** every claimed signature: it opens the named `VERIFICATION.md` and fails if the anchor is not in it. A `true` resting on an imaginary sign-off is now a RED TEST. ⚠⚠ **THE GUARD FOUND TWO MORE ON ITS FIRST RUN:** `NL_BESTEMMINGSPLAN_CERTIFIED` and `FR_PARIS_PLU_CERTIFIED` are both `true` while their national `sources/VERIFICATION.md` read `Verifier: UNASSIGNED` / `Status: OPEN`. Inventoried in `UNSIGNED_OPEN_GATES` (a dated quarantine, **not** a permission — a NEW instance is a red test). **Paris's own docstring justifies itself with *"Same discipline as `MADRID_NZ1_CERTIFIED` / `NL_BESTEMMINGSPLAN_CERTIFIED` (both ON…)"* — Madrid's unattributed flip was ALREADY being cited as precedent by a third jurisdiction.** Neither is Madrid's to answer; both are logged for their owners. **Re-opening this gate** requires SIG-M2 answered in writing with a name and a date, row **3** closed FIRST (§2's own precondition), and the signature REGISTERED — mechanics in `sources/VERIFICATION.md` SIG-M2. |
| **6** | **The ENVELOPE tier ladder has no `legally-delegated` tier** | **C** | **P0** | ⚠ **UNDER-states — badly** | 🔴 **OPEN — and Madrid is what makes it structural** | `ENVELOPE_AXIS_TIER_WEIGHT` (C63 §3.2 / L-664) maps `authoritative 1.0 · structured 0.9 · block-constructed 0.7 · estimated-ruleset 0.4 · pipeline-extracted-unverified 0.1 · not-determined 0.0 · no-pack 0.0`. **There is no tier for *"the ordinance was read, it delegates, and we cite the delegation"*** — the state the founder's own definition calls CLOSED. So Madrid's **60.458 %** NZ-3 land, which returns a **correct, terminal, legally-grounded** answer, scores **0.0**, indistinguishable from land we never looked at. Barcelona hit this at **2.06 %** (clau 22@) and could absorb it; **Madrid at 60.46 % cannot** — it is the difference between reporting Madrid as ~5 % complete and reporting it as ~72 % closed. ⚠ **The fix must NOT inflate:** a delegation tier must never be worth as much as a constructed envelope, and it must be reachable **only** with a cited instrument. **Closes when** C63 gains an explicit delegation tier (or CLOSURE is scored separately from ENVELOPE) and the schema, the L0 map and `computeScorecard.mjs` mirror agree. **Blocks an honest headline for every city, not just Madrid.** |
| **7** | **NZ 4's *fondo edificable* is measured from the CADASTRAL edge, not the *alineación oficial*** | ~~A~~ → **B** | P2 *(P1 the day SIG-M1 signs)* | ⚠ **OVER-states** where the official line lies inside the cadastral boundary; **EXACT** where they coincide | 🟡 **RE-BUCKETED A → B — the datum is PUBLISHED GEOMETRY (L-676, 2026-08-01)** | `MADRID_NZ4_RULE` ships `alignTo: 'street'`, which the engine measures from the **C19-classified cadastral front edge**; Art. 8.4.9.1 fixes the datum as the ***alineación oficial***. The pack discloses the substitution honestly rather than mislabelling it. **What changed:** `PGOUM97/PG_ORDENACION/MapServer/8 Alineaciones` is **live and published as geometry — 22,584 `Alineación Oficial` polylines** (+3,582 *en Volumetría Específica*, +2,066 *Trazado Indicativo APR*). So this is no longer *"a datum nothing resolves"*; it is a fetch and a projection. ⚠⚠ **AND THE TRAP SURVIVES THE FIX:** *fondo edificable* is a **band measured inward from the alignment line**. It is **NOT a parcel shrink.** Insetting the parcel ring by the depth is a plausible-looking model that is **wrong** — the error class that burned the Barcelona inset-collapse saga (L-529/L-581). **Closes when** the alignment line is resolved per parcel and the depth band is measured from it, with a **cited refusal** when no `Alineación Oficial` is found within tolerance. |
| **8** | **No *ancho de calle* ⇒ zones `4`, `9.1`, `9.2` publish NO height and carry FLOOR-only separations** | ~~A~~ → **B** | P2 *(P1 the day SIG-M1 signs)* | ⚠ **OVER-states** — the ordinance FLOOR under-insets above the break-even height (9,00 m for these three) | 🟡 **RE-BUCKETED A → B, same evidence as row 7** | The height tables **already exist, transcribed and cited**: `rulepacks/madridAnchoDeCalle.ts` holds the NZ 1/4/9 *cuadros de relación ancho de calle / altura* from the Compendio 2025, each with its own article and `appliesToZoneCodes`, and each **refusing near a band edge** rather than letting measurement noise pick a storey. What is missing is the **width to key them on** — and `MADRID_FLOOR_ONLY_SEPARATIONS` currently carries the ordinance *floor* for the height-proportional *testero* separations, which **over-states**. ⚠ L-537's national probe found **no Spanish municipality publishing a declared street width**, and that negative **stands** — but a width **CONSTRUCTED** by measuring between opposing `Alineación Oficial` lines is now possible. ⚠ **It must be labelled `measured-alignment`, NEVER *ample oficial*** (Barcelona's `measured-cadastral` precedent). **Closes when** either (i) a constructed width feeds the existing tables with band-edge refusals intact, or (ii) a signed **negative** records that no admissible width can be constructed and the three zones publish no height permanently. |
| **9** | **The L-656 private-buildable denominator is unmeasured for Madrid** | **A+B** | **P1** | ⚠ every ENVELOPE figure here is an **UPPER BOUND** | 🔴 **OPEN — and the cheapest source was measured and rejected this pass** | L-676 measured **149,577,170 m²** of *Norma-Zonal-governed* land. The C63 ENVELOPE axis requires shares of **private buildable land** (L-656) — a different, larger set that also includes land in derived ámbitos (APR/APE/API). Since the missing land is **overwhelmingly derived-plan land whose tier is 0.0**, the true ENVELOPE score is **≤** every figure above, so the bound is sound but not tight. ⚠ **MEASURED NEGATIVE:** `PG_ORDENACION/4 Ámbitos de Ordenación` is **polyline with `OBJECTID` only** — the derived-ámbito area **cannot** be measured from that service. Barcelona's 31.8 M m² AMB census has no Madrid twin. **Closes when** either a Madrid buildable-land census is found/constructed, or a signed statement records that none exists and fixes NZ-governed land as Madrid's stated denominator **with the substitution named in every published figure**. Until then `tools/city-completion/measurements/madrid.measurements.json` is deliberately **NOT written** — supplying these shares to a tool that prints *"of the PRIVATE-BUILDABLE denominator (L-656)"* would generate a false derivation string. |
| **10** | **NZ 5's front edge is `null` — Art. 8.5.6.3 measures to the STREET CENTRELINE** | **C** | P2 | ⚠ **OVER-states** on a narrow street — no front inset is applied at all | 🔴 **OPEN — a rule KIND `GeometricRule` cannot express** | Art. 8.5.6.3 measures *«respecto al eje de la calle»*. `SetbackRule`'s front is a distance from the **parcel boundary**; a distance from the street **centreline** is a different geometric predicate, and encoding it as a boundary setback would be silently wrong. So NZ 5 ships `front: null` and SIG-M1 excludes `5.1/5.2/5.3`. **1.025 %** of NZ-governed land (measured). **Closes when** either a `centreline-referenced` setback kind is added (ADR required — the same class of decision as NZ 5's open *retranqueo a linderos* vs *distancia entre edificios* question) or a signed negative records that NZ 5 publishes no front inset permanently. ⚠ **Raise the ADR before writing code.** |
| **11** | **The Madrid router's catch-all stamps zone `1.1` and the NZ-1 card on ANY exception** | **B** | P2 | **EXACT** on the envelope *(it is a refusal)* — **FALSE** about zone identity and about our own coverage | 🔴 **OPEN — Barcelona's deleted-branch defect class, alive in Madrid** | `siteDispatch.ts` `applyMadridZoningThenFallback`'s `catch` dispatches `buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridNZ1Refusal(), 'none')` — i.e. it stamps the parcel **`1.1`** and serves a card that explains **NZ 1's *Fondo de la Edificación*** and claims *"the municipal source was temporarily unreachable"*, for a parcel whose zone was **never resolved** and where **no NZ-1 fetch was attempted**. Two false statements in one card. The same registry-level branch (`noRulePackRefusal` → `madridNZ1Refusal` for any `1.*`) serves the **transient** card in contexts where nothing was fetched. ⚠ This is precisely the failure Barcelona had to delete three branches for: **a refusal whose copy asserts something untrue about our own coverage.** **Closes when** the catch-all serves a zone-agnostic *"we could not determine your Norma Zonal"* refusal carrying **no zone code and no NZ-1 citation**. One small function; **it touches `siteDispatch.ts` (L5, shared)**, which is why it was recorded here rather than changed in this pass. |
| **12** | **`RATE.md` reports ENVELOPE as a *measured 0 %* on a derivation that is now FALSE** | **B** | P2 | ⚠ **UNDER-states** our own coverage | ✅ **CORRECTED IN THIS PASS** | ✔ done. `RATE.md` Axis 4 read: *"`rulepacks/registry.ts` registers Madrid with an **EMPTY `packsByZone`** and `noRulePackRefusal → madridNZ1Refusal` for every zone code."* **Both halves are false as of `40c80164` (§MADRID-PGOUM97-WIRING):** `packsByZone` carries **23 codes**, and `1.*` routes to the **explicit-area path**, which — with `MADRID_NZ1_CERTIFIED = true` — **renders a constructed envelope** on 11.695 % of NZ-governed land. ⇒ Madrid's ENVELOPE axis is **≤4.7 %, not 0 %**, and its overall RATE ≈ **43.0 %**, not 41.9 %. Corrected in place with the derivation named. ⚠ **A stale derivation that reports a LOWER number is still a fabrication** — honesty is not the same as pessimism. |
| **13** | **NZ 3's refusal — 60.46 % of the city — rests on an UNSIGNED machine read** | **A→D** | **P1** | EXACT *(a refusal publishes no number)* | 🟠 **TERMINAL BUT UNVERIFIED — the highest verified-land-per-reading-hour item in the dossier** | `madridNZ3Refusal` is served **today**, gate-independent, and it is **legally grounded** (`legallyGrounded: true`): eleven cited quotes (`extracted/nz3-refusal.json`), four decisive — Art. 8.3.1 *«se ha agotado el aprovechamiento urbanístico»*, Art. 8.3.1 *«sin imponer un nuevo modelo»*, Art. 8.3.3.1.b)/2, Art. 8.3.5.3.a)i). **But every one of those quotes is a machine read that no human has checked**, and `VERIFICATION.md §3` is empty. ⚠ **Closure and verification are different properties**: this land is CLOSED and UNVERIFIED at the same time, and the register must say both. **Closes when** a human reads **one chapter — Cap. 8.3** — and signs (i) *the refusal is correct* and (ii) *the rules remain unknown* as **two separate statements**. ⭐ **60.458 % of Madrid's zoned land for one chapter.** Nothing else in Spain has that ratio. |
| **14** | **Supersession unexamined for every article Madrid cites** | **A** | **P1** | ⚠ **UNKNOWN sign** — a repealed article can cut either way | 🔴 **OPEN — nothing has been checked** | No search has been made for a *modificación puntual* affecting any Título 8 article the pack cites, and **no `effectiveDate` has been established for any of them**; the pack carries only `readFrom` (Compendio 24-09-2025). ⚠ **`laterModifications: none` is written nowhere and must not be.** The Compendio's own modified-articles annex is the index for this. Same open risk as Barcelona's L-661. **Closes when** every cited article carries `effectiveDate` separate from `readFrom`, or a signed statement records which were checked and which were not. **Until then every Madrid citation carries an asterisk — including row 13's.** |
| **15** | **The primary document is not in the repo, and the cited edition is `carácter informativo`** | **A** | ~~P1~~ **P2** | EXACT | 🟡 **HALF CLOSED 2026-08-01 — (i) THE DOCUMENT IS NOW IN THE REPO; (ii)+(iii) stand** | ✔ **(i) CLOSED.** `corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf` — **25,735,355 bytes, 626 pp**, sha256 `1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5`, verified to be the **transparencia 24-09-2025** edition from the document's OWN PDF `title` metadata and cover page — **not** the superseded `07_07_2025` geoportal one (V19). **Madrid is now the second Spanish city after Barcelona whose cited quotes can be re-read offline; Córdoba and Murcia still cannot.** ⚠ **AND IT WAS NEVER A SOURCING PROBLEM — IT WAS A CUSTODY ONE.** The file was not re-downloaded. It was recovered from a PREVIOUS SESSION'S SCRATCHPAD, where `tools/madrid-extract/index_pdf.py` had been pointing at it **by absolute path** (`…/85d1d1c6-…/scratchpad/compendio.pdf`). The 282 cited records were extracted from a file living outside the repo, on one machine, one process cleanup from deletion, while this register recorded the source as *"not retrievable"*. Both statements were true; neither was the whole truth. `index_pdf.py` now resolves the PDF **relative to the repo**, so the extraction is reproducible from a checkout. ⚠ **A SECOND `compendio2025.pdf` IN GIT HISTORY (`40c2bdba`) IS 536 BYTES OF AKAMAI *ACCESS DENIED* HTML** (V20) — `madrid.es` blocks automated **GET**s of the Compendio. This **qualifies V2**: the `curl -I` HEAD is allowed and the GET is denied, so a HEAD-only reachability check reports a document as retrievable that cannot be retrieved. UNKNOWN, never absence. **(ii)+(iii) OPEN, unchanged:** what we hold is a **consolidation** — *«Documento de carácter informativo. La versión oficial … se ha publicado en el BOCM»*, printed on every page — so a signature on it is a signature on a consolidation, not on the law; and no BOCM text has been retrieved for PG97 or any *modificación puntual*, including **MPG 00/343** (BOCM 27.11.2023, footnoted on live Arts. 8.5.6/8.8.9) and **MPG 00/335** (BOCM 19.05.2016, the amendment to Cap. 8.3 — 60.458 % of the city). **Closes fully when** those BOCM texts are held. See `corpus/INDEX.md` + `corpus/RETRIEVAL-LOG.md`. |
| **16** | **Normas Zonales 2 / 6 / 10 / 11 are absent from `AMB_TX_ETIQ`** | **A** | ~~P1~~ **P3** | **EXACT** — they govern 0 m² | 🟡 **COVERAGE HALF CLOSED (L-676, 2026-08-01); nomenclature half open** | ✔ **The read is EXHAUSTIVE, and that is what closes the part that mattered**: unfiltered `returnCountOnly` = **34**, and the groupBy returns **34 groups, `n=1` each** ⇒ one multipart feature per code, no pagination artefact, no client-side filter. No code begins `2`, `6`, `10` or `11`. ⇒ **Those names govern 0 m² of the published layer, so NO parcel can route to them** from `resolveMadridNormaZonal`, and candidate cause **(c)** — *"parcels exist that route nowhere"* — **cannot arise from this layer's vocabulary.** ⚠ **What survives, narrowed:** whether those Normas Zonales exist in Título 8 at all is a **nomenclature** question answerable only from the Compendio's table of contents. It changes no parcel's answer. `madridUnknownZoneRefusal` remains the correct card and its copy — which says the discrepancy *"is recorded as open and unresolved"* — remains **accurate**. |
| **17** | **HEIGHTS/LOD axis unmeasured** | **B** | P2 | n/a | ✅ **MEASURED 2026-08-01 — and the verdict is `unmeasured` heights, which is a different sentence** | ✔ done. `tools/context-height-probe/probe.mjs` against the **SHIPPED R2 tiles** (`buildings.pmtiles?v=L659a` — the same bytes the browser reads, the same provenance ladder), ±0.06° about Puerta del Sol: **121,158 footprints — `measured-lidar` 0 · `tagged` 269 · `derived-levels` 28,281 · `assumed` 92,608 (76.4 %)**, median height **9.0 m** (which IS the fabricated default). ⇒ axis = `tagged/total` = **269/121,158 = 0.22 %**. ⚠ **The zero is a MEASURED ABSENCE, not an unreachable source** — tiles: 900 covering, 832 read, 68 absent, **0 FAILED**. That distinction is the whole of §CONTEXT-DATA-HONESTY (L-422/457/467/469): with failures > 0 this would have been a claim about our network, not about Madrid. ⚠ **PRE-BAKE BASELINE, DELIBERATELY** — a national buildings bake was IN FLIGHT on this SHA and `tools/context-bake/` was NOT touched. Re-probe after it publishes; do **not** edit these counts to predict it (§SIZE-IS-NOT-PROVENANCE — a green bake is exactly what L-658 produced while shipping nothing). **Closes fully when** the post-bake re-probe lands. |
| **18** | **TERRAIN at 50 %, and the rasant datum is a LEGAL defect in Madrid too** | **B** | P2 | ⚠ **UNKNOWN sign** — depends which way the ground falls | 🔴 open | Terrain is `baked-but-unverified` (no `terrain.verify.mjs` round-trip). ⚠ **And it is not only a data axis here:** Madrid's *altura de cornisa* is measured **from the rasante at the FAÇADE**, so sampling one point at a block centroid reproduces **L-584** exactly. Barcelona resolved the legal half (PGM Art. 240) and found the **DATA half binding** — served posts at 57.34 m against a ≤10 m requirement. Madrid's equivalent article has **not** been read. **Closes when** (i) the Compendio's height-measurement article is transcribed and (ii) the terrain posting is verified fine enough to sample at a façade — **or a refusal ships instead**. |

---

## The hidden blocker — recorded, not numbered

**Madrid's ordinance pipeline is `PDF → machine → TypeScript`, and the machine is the only reader.**
Barcelona's hidden blocker was that a *human* re-derived legislation per clau; Madrid's is the
opposite and arguably worse: **282 cited records exist that no human has ever checked**, and the
whole city's LEGISLATION axis is a single signature away from 0 % or from a large number — with no
graduated middle. The pipeline produced *volume* without producing *confidence*, and the honesty
machinery (the confidence ceiling, the authorisation gate) exists precisely to stop that volume
leaking out. **The structural answer is the same as Barcelona's** — an article → paragraph →
parameter → classification → rule-KIND → applicability → source → BOCM → effective-date knowledge
base that packs **compile from** — plus, for Madrid specifically, **sampled human audit** rather
than all-or-nothing signature, so LEGISLATION can move in increments instead of one leap.

## Effort, honestly

| Category | Remaining | Difficulty |
|---|---|---|
| **Legal reading — Cap. 8.3 only** (row 13; unlocks 60.458 % as *verified* closed) | ~1 session | **Low** — the quotes are already extracted; this is verification, not discovery |
| **Legal reading — Título 8 audit for SIG-M1** (row 1; 23 zones, 282 records) | ~1–2 weeks | Medium |
| **Engineering — NZ-1 correctness** (rows 3 + 4: ficha override, one provider not two) | ~2–3 days | Low |
| **Engineering — alignment datum + constructed street width** (rows 7 + 8) | ~1–2 weeks | Medium — geometry, and the *fondo ≠ parcel shrink* trap |
| **Contract — delegation tier** (row 6) | ~2–3 days | Low to build, **high to agree** |
| **Data — L-656 denominator** (row 9) | ~1–3 weeks | **High** — the cheapest source is already measured and rejected |
| **Supersession + primary-source custody** (rows 14 + 15) | ~1 week | Medium, one-time |
| **Axes: heights, terrain, context** (rows 17 + 18) | ~1 week | Low–Medium |

**The only structurally impossible category is NZ 3** — 60.458 % of Madrid's zoned land, where the
correct output is a machine-readable reference to the antecedent instrument. That is a **complete
and legally correct result**, just not a number.

## Recommended order

**6 → 13 → 3 → 1 → 9 → 4 → 7/8 → 11 → 14/15 → 17/18 → 10 → 2-residual**

**6 first**, for Barcelona's reason: the ruler cannot express the state we are trying to declare.
Madrid makes this urgent rather than academic — **60.46 %** of the city is a *correct terminal
answer* that today scores **zero**, so every Madrid headline is wrong in the same direction until
the tier ladder can say "delegated".

**13 second, and this is the ordering decision that matters.** Every prior Madrid document ranks
**NZ 4** as the highest-value read (*"NZ 4 ≈ 30–40 % of Madrid residential, 2–3 weeks"*). Measured,
**NZ 4 is 8.83 %** of NZ-governed land and **NZ 3 is 60.46 %** — and NZ 3 needs **one chapter,
already extracted, to VERIFY rather than to discover**. It is the largest single object in the
dossier by a factor of seven and the cheapest to close. **The whole corpus ranked it nowhere because
nobody had measured the land.**

**3 third** — it is the only item that can make an **already-published** Madrid number wrong. Rows
7, 8 and 10 are graver in principle but **moot while the gate is shut**; they become P1 the day
row 1 signs, and must be closed *before* it, not after.

> ### ⚠ TWO ORDERING LESSONS CARRIED FROM BARCELONA, BOTH EARNED AGAIN HERE
>
> **1. Establish the SIGN before ranking severity.** `COEF_Z` (row 2) was Madrid's loudest P0 — the
> named L-616 failure mode. Measured, **nothing binds it**, so its live sign is **EXACT**, and the
> genuinely open item (row 3, the *ficha*) had never been ranked at all because its sign is
> **unknown** rather than alarming. **Ranking by how alarming a gap sounds inverts the queue** — for
> the fourth time across the two registers.
>
> **2. A refusal that misstates our own coverage is a false statement.** Barcelona deleted three
> such branches. Madrid's audit found **one live** (row **11**: the catch-all asserts an NZ-1 fetch
> failure that never happened, and stamps zone `1.1`) — and, importantly, found the other Madrid
> refusals **clean**: `madridUnknownZoneRefusal` accurately names which Normas Zonales PRYZM has
> read, `madridPgoum97UnverifiedRefusal` correctly says *we hold the figures but not the signature*,
> and `madridNZ1AbsentRefusal` correctly distinguishes an empty answer from a failed fetch.

---
*Authority: C58 · C63 · L-449 · L-608 · L-616 · L-656 · L-664 · L-676. Land shares measured
2026-08-01, raw data in [`extracted/nz-land-share-and-coefz-probe.json`](./extracted/nz-land-share-and-coefz-probe.json),
method in [`findings/L-676-MADRID-LAND-SHARE-AND-COEFZ-MEASURED.md`](./findings/L-676-MADRID-LAND-SHARE-AND-COEFZ-MEASURED.md).
Signatures: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) — **none**. Maintainer: UNASSIGNED.*
