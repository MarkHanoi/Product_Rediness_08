// ── València (INE 46250) — the CITED-REFUSAL jurisdiction. ────────────────────────────────
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A VALÈNCIA PARCEL TODAY (measured 2026-08-01)
// ---------------------------------------------------------------------------------
// CAN (VERIFIED live, via the national Catastro path that already routes here):
//   • the referencia catastral, by identifier join — not by a pin guess. Measured at
//     lon −0,3670 / lat 39,4640 → `6618617YJ2761H`, «CL ALMIRANTE CADARSO 33 VALENCIA»
//   • the INE municipality, composed from Catastro's own `<cp>46</cp>`+`<cm>250</cm>` = 46250,
//     through the EXISTING `composeIneCode()` — routed from the DATA, never from a name
//   • the zone identity, from the municipality's own ArcGIS service (`OPENDATA/
//     UrbanismoEInfraestructuras/MapServer/231`, 21 210 polygons: `califi`, `tipoca`, `origen`)
//   • independently, the municipal parcel layer 216 publishes `refcat` directly — so València
//     has TWO routes to a parcel and needs no licence for either
//
// CANNOT: publish a buildable number. For ONE reason, and it is not a coverage excuse —
// it is what the ordinance itself says.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE BLOCKER IS A GRAPHIC SHEET CALLED **PLANO C**, AND NO SIGNATURE MOVES IT
// ══════════════════════════════════════════════════════════════════════════════════════════
// The PGOU *Normas Urbanísticas* (mayo 1991) HAVE been sourced, read and transcribed — see
// `esValenciaPgou.ts`, with article and verbatim quote per parameter. The transcription is
// GOOD. It still yields no envelope, because every envelope-determining parameter in the
// residential zones is defined as a function of a number **graphed on Plano C**:
//
//   • Art. 6.19.1 (ENS): «La altura de cornisa máxima … se establece en función del número de
//     plantas **grafiado en el Plano C** … Hc = 4,80 + 2,90 Np»
//   • Art. 6.18.2 (ENS): «La profundidad edificable será la señalada **en el Plano C**.»
//   • Art. 6.25.1 (EDA): the same shape at a different intercept — «Hc = 5,30 + 2,90 Np»
//   • Art. 6.30.1 (UFA): «en función del número de plantas **grafiado en el Plano C**»
//
// PRYZM DOES NOT HOLD PLANO C. It is not published as a REST layer (checked: the 70-layer
// `UrbanismoEInfraestructuras` catalogue has no plantas / profundidad / altura layer).
//
// ⚠⚠ THEREFORE `Hc = 4,80 + 2,90·Np` WITH A GUESSED Np IS NOT A CONSERVATIVE ESTIMATE — IT IS
// A FABRICATED DETERMINATION. This is L-616 mechanism-A verbatim: a missing constraint
// OVERSTATES. The founder pre-committed to this before the text was read ("If PRYZM cannot read
// Plano C, ENS height is CONSTRUCTED-INPUT-MISSING and must REFUSE, not guess. Do not pack a
// representative Np."), and the primary source confirms the instruction exactly.
//
// ⚠ AND THE 20 m DEPTH FALLBACK DOES NOT RESCUE IT. Art. 6.18.2's «Caso de no indicarse ésta,
// no se podrá rebasar los 20 metros» is CONDITIONAL on Plano C not graphing a depth — a fact
// PRYZM cannot observe. Packing 20 m would silently assert "Plano C graphs no depth here",
// a claim about a document we have not read, and it can err in BOTH directions. The
// hypothesised "depth is STATED even without Plano C" asymmetry WAS TESTED AND DOES NOT EXIST
// (`sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` §2 F11).
//
// ⇒ THE HONEST OUTPUT IS A CITED REFUSAL, AND THAT IS A SHIPPABLE ANSWER, NOT A GAP.
// The ratified position is *"100 % of parcels get either a computed envelope or a legally-cited
// refusal"*. Barcelona ships refusals for clau 18; Murcia ships them for its delegated 67 %.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — C58 §1.2/§1.4/§1.7a · C63 · ADR-0270 · L-449 · L-616 · L-656 · L-661 ·
// docs/04-reference/jurisdictions/es/es-vc/46250-valencia/sources/.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id València records and registrations use. One constant, not a literal. */
export const VALENCIA_JURISDICTION_ID = 'es-46250-valencia';

/**
 * Is a signed, transcribed València envelope rule pack available?
 *
 * ⛔ **`false`, and it is NOT the founder's signature that is missing — it is PLANO C.**
 *
 * This gate is deliberately DIFFERENT in kind from Murcia's. Murcia's `false` meant *"the
 * numbers are transcribed and a human has not yet signed the transcription"* — a signature
 * would have lifted it. **València's `false` cannot be lifted by a signature at all**, because
 * there is no number to sign: Arts. 6.18.2 / 6.19.1 / 6.25.1 / 6.30.1 define the envelope as a
 * function of a value graphed on a sheet PRYZM does not hold.
 *
 * ⚠ **DO NOT FLIP THIS TO SHIP A DEMO.** Flipping it authorises nothing, because
 * `ES_VALENCIA_PGOU_PACK.zones` is EMPTY — by construction, not by omission. A future author
 * who fills the pack with a "representative" Np and then flips this would be publishing the
 * L-616 failure with a founder's name on it.
 *
 * **WHAT WOULD ACTUALLY MOVE IT** (in order of leverage):
 * 1. **Plano C**, as data — the *número de plantas* + *profundidad edificable* per block. This
 *    is the whole city. See §R1 of the verification file.
 * 2. A **validated parse of layer 212's `altura` field** (§VALENCIA-ALTURA-LEAD below), which
 *    is a proxy for Plano C — ENGINEERING, and separately signable.
 * 3. Neither of the above is a transcription task, so neither is discharged by reading more of
 *    the ordinance.
 *
 * L-449: the flip is a legal act and it is the founder's. An implementer may not perform it.
 */
export const VALENCIA_ENVELOPE_VERIFIED = false as const;

/**
 * §VALENCIA-ALTURA-LEAD — the most promising route to a València envelope, recorded so it is
 * not lost, and fenced so it is not mistaken for a result.
 *
 * `OPENDATA/UrbanismoEInfraestructuras/MapServer/212` (*PGOU - Alineaciones*, 21 975 polygons)
 * carries a field **`altura`**. An earlier pass measured **65,5 % of ROWS** as a bare storey
 * count (`3`, `13`) and read that as the size of the lead.
 *
 * ⚠⚠ **RE-MEASURED BY AREA ON 2026-08-01, AND THE LEAD IS 2,4× SMALLER THAN THE ROW COUNT
 * SUGGESTED.** All 21 975 polygons downloaded with geometry in EPSG:25830 and shoelace-summed
 * (4 213,7 ha total):
 *
 * | `altura` value class | share of layer AREA |
 * |---|---|
 * | bare integer **in 1…30** — the only plausible storey counts | **27,13 %** |
 * | bare integer **`0`** — 4 195 polygons, the LARGEST single bucket | **34,13 %** |
 * | bare integer > 30 (`2000`, `538650`, `2650406`) | 0,28 % |
 * | `<=n` / `Max n` bounded | 6,63 % |
 * | protection-derived (`PROTEGIDO*`, `BIC`, `BRL`, `PROT_*`) | 6,07 % |
 * | absolute floorspace (`10235m2t`) · FAR (`0.8m2t/m2s`) · metres (`13m`) | 2,40 % |
 * | delegated / deferred (`PPARCIAL`, `DIFERIDO A5`, `ORD_DET`, `NORMATIVA`) | 1,49 % |
 * | true junk (`-+-`, `_`, `+-`) | 18,38 % |
 * | unrecognised (`S=39600.65m2s`, `EC`, `M15b`, `ET=1999210`) | 2,14 % |
 *
 * ⚠⚠⚠ **THE `0` BUCKET IS THE FINDING, AND IT IS A §CONTEXT-DATA-HONESTY TRAP IN ITS PUREST
 * FORM.** 4 195 polygons — **34,13 % of the layer's area, more than the entire plausible bucket**
 * — carry the literal value `0`. A parcel cannot be lawfully built to zero storeys, so `0` here
 * is a SENTINEL, not a measurement: it is "not applicable / not set", i.e. **UNKNOWN**. C58 §1.7a
 * and L-616 are explicit that `null` means unknown and **`0` never does**. A parser that trusted
 * `^\d+$` would publish either a zero-height envelope on a third of València or, worse, coerce
 * the sentinel to a default and publish a fabricated one.
 *
 * ⇒ **The honest size of this lead is 27,13 % of layer 212's area, not 65,5 %.** Every future
 * estimate must start from that number.
 *
 * ⚠ IT IS A LEAD, NOT AN UNLOCK, FOR THREE FURTHER INDEPENDENT REASONS — each sufficient on its own:
 * 1. **The field mixes at least FOUR units.** `13` (storeys), `13m` (metres), `0.8m2t/m2s`
 *    (FAR) and `10235m2t` (absolute floorspace) all live in the same `esriFieldTypeString`.
 *    Reading `13m` as 13 storeys gives `4,80 + 2,90·12 = 39,6 m` for a 13 m building — a
 *    THREEFOLD overstatement. A wrong unit is a wrong KIND (ADR-0270), not a wrong number.
 * 2. **That `altura` IS Art. 6.19.1's «número de plantas grafiado en el Plano C» is an
 *    INFERENCE.** Nothing in the service documents the field. Even granted it, the −1
 *    convention must be established for the FIELD, not merely for the article.
 * 3. **The layer is ALIGNMENTS, and its extent is not the extent that matters.** Layer 212 covers
 *    4 213,7 ha; the L-656 private-buildable denominator is 1 874,9 ha. **The overlap has NOT
 *    been measured** — it needs a spatial join, not an attribute query. So even the 27,13 % is a
 *    share of the WRONG denominator for a coverage claim, and is quoted here only as the size of
 *    the parsing problem.
 *
 * ⚠ Protection-derived rows are EXISTING-BUILDING-DERIVED, the same `not-the-rule-kind` shape as
 * Murcia's `RB`/`RU`, and a parser must not coerce them to a number.
 */
export const VALENCIA_ALTURA_LEAD_MEASURED_AT = '2026-08-01' as const;

/**
 * The layer-212 `altura` measurement, as data so a test can pin it.
 *
 * ⚠ `plausibleStoreyPctOfLayerArea` is the ONLY figure here that could ever become coverage, and
 * it is a share of LAYER 212's area — **not** of the L-656 private-buildable denominator, which
 * would require a spatial join nobody has run. Do not promote it.
 */
export const VALENCIA_ALTURA_FIELD_MEASURE = {
    layerId: 212,
    polygons: 21975,
    layerAreaHa: 4213.7,
    /** Bare integer in 1…30 — the only values that could be a *número de plantas*. */
    plausibleStoreyPctOfLayerArea: 27.13,
    /** ⚠ The literal value `0`, on 4 195 polygons. A SENTINEL for unknown, never a storey count. */
    zeroSentinelPctOfLayerArea: 34.13,
    /**
     * Values that are not a storey count under ANY reading — junk 18,38 · protection 6,07 ·
     * floorspace/FAR/metres 2,40 · unrecognised 2,14 · delegated 1,49 · blank 1,24 · >30 0,28 ·
     * fuera de ordenación 0,01. ⚠ EXCLUDES the 6,63 % `<=n`/`Max n` bounded class, which IS a
     * storey statement but a BOUND rather than a value (the L-616 distinction).
     */
    notAStoreyCountPctOfLayerArea: 32.01,
    /** `<=n` / `Max n` — a real storey BOUND. A bound is not a determination. */
    boundedStoreyPctOfLayerArea: 6.63,
    /**
     * ⚠ Has the layer been spatially joined to the buildable denominator? **IT HAS, 2026-08-01.**
     * See `VALENCIA_ALTURA_ON_BUILDABLE_LAND` — and the answer inverts the size of the lead.
     */
    joinedToBuildableDenominator: true,
} as const;

/**
 * §VALENCIA-ALTURA-BUILDABLE-JOIN — **the measurement that was missing, and it moves the lead the
 * OTHER WAY.**
 *
 * `VALENCIA_ALTURA_FIELD_MEASURE` above is LAYER-RELATIVE: it describes layer 212's own 4 213,7 ha,
 * which is 2,25× the 1 869,6 ha of private buildable land and includes streets, open space and
 * non-buildable ground. Its own docstring says so: *"even the 27,13 % is a share of the WRONG
 * denominator"*. **This constant is the same field measured on the RIGHT denominator.**
 *
 * ⚠⚠ **AND IT IS ~2× LARGER, NOT SMALLER.** The previous pass corrected a polygon-COUNT figure
 * (65,5 %) down to a layer-AREA figure (27,13 %) and recorded that as *"the honest size of the
 * lead"*. On the L-656 denominator the honest size is **52,6 %** — so the 27,13 % understated it
 * almost exactly as much as the 65,5 % overstated it. **Both errors had the same cause: quoting a
 * ratio without its denominator.**
 *
 * ⚠ **THE `0` SENTINEL SHRINKS BY 3,3×, AND THE REASON IS STRUCTURAL.** `0` is 34,13 % of layer 212's
 * area but only **10,3 %** of buildable land. Sampled geometry says why: the `altura='0'` features are
 * the NON-BUILDABLE complement — one probed feature is a single 29,4 ha polygon with **98 interior
 * holes**, i.e. the street space with the manzanas punched out of it; another coincides to the square
 * metre with a `GEL Espacios Libres` calificación polygon. ⇒ On the land that matters, `0` is largely
 * a **true zero on ground nobody may build on**, not the unknown-sentinel that the layer-relative
 * reading made it look like. ⚠ That is a REFRAMING, not an all-clear: 10,3 % of buildable land still
 * carries `0`, and C58 §1.7a / L-616 still forbid reading any `0` as a determination.
 *
 * **METHOD** (so it can be re-run and disputed). 1 400 points drawn uniformly at random over the
 * canonical `terrain.mjs` REGIONS `valencia` bbox, seed 20260801; each point resolved by ONE ArcGIS
 * `identify` against layers 7 (Alineaciones) and 14 (Calificaciones) of
 * `Tools/FichaUrbanismo/MapServer` **at the same coordinate**, so the two answers cannot drift.
 * **156 points landed on the L-656 denominator** (`clase='SU'` ∧ `califi` ∈ Art. 6.3.1's six); 1 244
 * fell outside it and 0 failed in transport. Uniform-over-area ⇒ the retained set is AREA-WEIGHTED by
 * construction, so these are land shares, not polygon counts. The UNFILTERED counts (`{"count":21210}`
 * / `{"count":21975}`) were asserted BEFORE any `where`, with a `califi='ZZZNOPE'` → `{"count":0}`
 * control of byte-identical shape.
 *
 * ⚠ **N=156. The 95 % Wilson interval travels with every figure** and is wide enough to matter; this
 * is a sample, not a census, and it is labelled as one.
 *
 * ⚠⚠ **IT IS STILL NOT AN UNLOCK, AND NOTHING HERE MAY BE PACKED.** The join closes condition (b) of
 * `CLOSURE-REGISTER` #2. Condition (a) — what the field MEANS — is untouched and remains the blocker:
 *   1. **Nothing in the service documents `altura`.** 696 layers across 67 public services were
 *      field-swept on 2026-08-01; the layer's only description is *"Muestra las alineaciones del Plan
 *      General de Ordenación Urbana"*. That the field is Art. 6.19.1's *número de plantas* is an
 *      INFERENCE — a suggestive one (the storey histogram is 1…9, exactly the domain of the article's
 *      own eight-row table) but an inference. The field is named *altura* (a HEIGHT); the article
 *      graphs a *número de plantas* (a COUNT). Reading a `4` as 4 storeys gives 13,5 m; as 4 metres it
 *      gives 4 m.
 *   2. **The `−1` convention is established for the ARTICLE, not for the FIELD.** Art. 6.19.1 defines
 *      Np as the graphed count minus one. Whether `altura` stores the graphed count or Np already is
 *      undocumented, and the two differ by 2,90 m on every ENS building.
 *   3. **`profundidad edificable` is still published NOWHERE.** ENS needs Art. 6.18.2's depth as well
 *      as 6.19.1's height, and no attribute in the entire public catalogue carries it. Sampled
 *      geometry hints that layer 212's POLYGON may itself be the *área de movimiento* (at Gran Via
 *      Marqués del Turia its 3 130 m² / ~17,6 m-wide ring nests inside a 4 902 m² / ~30,5 m-wide ENS
 *      calificación polygon, consistent with Art. 6.18.2's 20 m cap) — but that is FOUR POINTS, and
 *      layer 212's total area is 2,25× the buildable denominator, which is not the shape of a tight
 *      buildable-footprint layer. **Unmeasured; explicitly not relied on.**
 *   4. **A computed Hc is not a ceiling anyway** — Art. 6.19.3 can REQUIRE exceeding it (enrase de
 *      cornisas) and 6.19.3.c grants ENS-2 infill an extra storey.
 *
 * ⇒ **The verdict is unchanged and deliberate: València's ENVELOPE stays 0 %.** What changed is the
 * PRICE of the remaining question — one municipal confirmation (R5), not a data-acquisition project.
 */
export const VALENCIA_ALTURA_ON_BUILDABLE_LAND = {
    measuredAt: '2026-08-01',
    method: 'uniform-random points over the terrain.mjs `valencia` bbox, seed 20260801, one ArcGIS '
        + '`identify` per point against Tools/FichaUrbanismo/MapServer layers 7 + 14; retained where '
        + "clase='SU' ∧ califi ∈ Art. 6.3.1's six. Area-weighted by construction.",
    pointsDrawn: 1400,
    /** Points that landed on the L-656 private-buildable denominator. THE DENOMINATOR OF EVERY % BELOW. */
    sampleN: 156,
    /** Points outside the denominator — recorded, never folded in. */
    offDenominator: 1244,
    /** ⚠ Transport failures are EXCLUDED from the denominator entirely, never scored (L-422/457/467/469). */
    transportFailures: 0,
    /** Bare integer 1…30 — the only values that could be a *número de plantas*. 95 % CI 44.8–60.2. */
    bareStoreyPctOfBuildableLand: 52.6,
    /** ⚠ The literal `0`. 95 % CI 6.4–16.0 — vs 34,13 % of LAYER area. Mostly non-buildable ground. */
    zeroPctOfBuildableLand: 10.3,
    /** `<=n` / `Max n` — a real storey BOUND, and a bound is not a determination. CI 10.6–21.9. */
    boundedStoreyPctOfBuildableLand: 15.4,
    /** Junk, protection-derived, floorspace/FAR and delegated/deferred combined. */
    notAStoreyCountPctOfBuildableLand: 21.8,
    /** ⚠ ENS alone — the single largest zone (41,3 % of buildable land) — n=61, 47 bare storeys. */
    ensBareStoreyPctOfEnsLand: 77.0,
    /** The bare-integer values actually observed. ⚠ 1…9 is exactly Art. 6.19.1's own table domain. */
    observedStoreyValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 15],
    /** ⚠ STILL AN INFERENCE. The join sized the lead; it did not name the field. See R5. */
    fieldSemanticsConfirmedByMunicipality: false,
    /** ⚠ Art. 6.18.2's depth is published by NO layer in the public catalogue. Sufficient on its own. */
    profundidadEdificablePublished: false,
} as const;

/**
 * §ALTURA-SEMANTICS-SETTLED (2026-08-02) — **the four blockers were attacked one by one. Three fell.
 * The fourth held, and it is the one that decides the city.**
 *
 * The founder directive was *"get the ENVELOPE number as high as it will honestly go"*. This is the
 * work that answers it, and the answer is **0 %** — reached by refuting three of the four objections
 * rather than by repeating them, which is why it can now be trusted.
 *
 * ── WHAT WAS RETIRED ─────────────────────────────────────────────────────────────────────────────
 *
 * **(1) "The field is undocumented and might be METRES" — RETIRED, two independent ways.**
 *
 * *Documentary.* The publisher's OWN data dictionary was located — not in the ArcGIS catalogue (which
 * documents nothing) but in the **national federated catalogue `datos.gob.es`**, publisher
 * `L01462508` (Ajuntament de València), dataset *PGOU - Alineaciones*:
 *   «Alineacions del Pla General d'Ordenació Urbana · **Altura: Altura del PGOU** · Protec: Nivel de
 *   protección.»
 * ⚠ It is a **tautological** definition — *the PGOU's altura* — so it does NOT give units. But it is
 * decisive on one thing, and the proof is a SIBLING dataset: *Textos de los portales de las calles*
 * documents its own `Altura` field as **«Altura de representació en plans»** — a CARTOGRAPHIC TEXT
 * HEIGHT. So this municipality's vocabulary does use `altura` for a rendering artefact, and it
 * **documents that case differently.** `PGOU_AL.altura` is attributed to *the PGOU*, not to the map.
 *
 * *Empirical, and stronger.* `altura` was paired against OSM `building:levels` for the SAME building
 * (n = 105 in the Ensanche core, 0 transport failures). **Median ratio `altura / levels` = 0.78, mean
 * 0.91, p90 = 1.00.** The METRES hypothesis predicts ≈3.0. **It is refuted by a factor of four.**
 * `altura` is a storey-scale count.
 *
 * **(3) "`profundidad edificable` is published nowhere, so even a proven height yields no envelope"
 * — RETIRED: THE DEPTH IS IN THE GEOMETRY, NOT IN AN ATTRIBUTE.**
 *
 * This was the objection that looked decisive, and measuring it inverted it. Art. 6.18.1 reads
 * «La ocupación de la parcela edificable se ajustará a las **alineaciones definidas en el Plano C**»
 * — so the *ocupación* is defined by the ALIGNMENTS, and layer 212 IS the digitised alignments. If
 * its polygon is the *área de movimiento*, the depth is already drawn and needs no field.
 * Measured on ENS/EDA suelo urbano carrying a bare storey count (n = 54, EPSG:25830, metres):
 *   • mean width (2A/P) **median 15,6 m** (p10 10,2 · p90 27,1) — squarely a *profundidad edificable*,
 *     against Art. 6.18.2's 20 m default cap;
 *   • **NEVER larger than its own calificación polygon — 0 of 54** — median area ratio 0,75;
 *   • 10 of 54 carry interior HOLES, the *patio de manzana*.
 * ⚠ 31 % exceed 20 m, which does **not** refute it: Art. 6.18.2's 20 m applies only *«Caso de no
 * indicarse ésta»*, so a graphed 27 m is lawful. ⚠ n = 54, and this is EVIDENCE, not proof.
 *
 * **(4) "Art. 6.19.3 means a computed Hc is not even a ceiling" — MITIGATED, not fatal.** The
 * *enrase de cornisas* and the ENS-2 infill storey both push a building ABOVE the computed Hc. Under
 * the never-overstates invariant (C58 §1.14.4) an omitted upward exception UNDER-states, which is the
 * safe direction. It is a caveat on the number, not a bar to publishing one.
 *
 * ── ⛔ WHAT HELD, AND WHY IT IS DECISIVE ─────────────────────────────────────────────────────────
 *
 * **(2) The offset convention is unknown — and the measurement made it WORSE, not better.**
 *
 * Art. 6.19.1 defines `Hc = 4,80 + 2,90·Np` with Np = *«el señalado en los planos menos uno»*. Whether
 * `altura` stores the graphed count or Np already is undocumented. The empirical test was expected to
 * settle it. **It refuted the simplest reading instead:**
 *
 * | `altura − building:levels` | −3 or less | −2 | −1 | 0 | +1 | +2 or more |
 * |---|---:|---:|---:|---:|---:|---:|
 * | buildings | 20 | **34** | 21 | 10 | 4 | 6 |
 *
 * **`altura` is BELOW the built storey count in 85 of 105 buildings (81 %), modally by TWO.** A plan
 * MAXIMUM should sit at or above what was built almost everywhere. Only 33 % of pairs fall within ±1
 * of each other, and the spread runs −13 … +7.
 *
 * ⚠⚠ **THIS IS NOT A CONSERVATIVE AMBIGUITY THAT never-overstates CAN ABSORB.** Reading `altura` as
 * the graphed count on a typical Ensanche block — `altura` 5 against a 7-storey building — yields
 * `Hc = 4,80 + 2,90·4 = 16,4 m` for a building that already stands at roughly 21 m. **PRYZM would
 * publish a buildable envelope LOWER THAN THE BUILDING ALREADY ON THE PLOT.** For a feasibility tool
 * that is not caution, it is a wrong answer — and in the 10 of 105 where `altura` EXCEEDS the built
 * count, the same parser over-states instead. **A rule that is wrong in both directions has no safe
 * branch to choose.**
 *
 * Three readings survive the data and PRYZM cannot distinguish them: `altura` is Np and OSM counts
 * planta baja plus ático; or `altura` is a different quantity altogether (a height BAND, say); or the
 * point-in-polygon pairing is noisier than it looks. **Each implies a different envelope.** C58 §1.4
 * forbids presenting any of them as the fact.
 *
 * ⇒ **València stays at 0 %.** ⭐ **But the ask has changed shape entirely: it is no longer "obtain
 * Plano C", a data-acquisition project. It is ONE WRITTEN ANSWER — see `VALENCIA_R5_ASK`.**
 */
export const VALENCIA_ALTURA_SEMANTICS_2026_08_02 = {
    measuredAt: '2026-08-02',
    /** Publisher's own dictionary, `datos.gob.es` publisher `L01462508`, *PGOU - Alineaciones*. */
    publishedFieldDefinition: 'Altura: Altura del PGOU',
    /** ⚠ Tautological — it attributes the field to the PGOU but states NO unit and NO convention. */
    publishedDefinitionGivesUnits: false,
    /** The sibling dataset that proves the contrast is deliberate. */
    contrastingSiblingDefinition:
        'Textos de los portales de las calles → «Altura: Altura de representació en plans» '
        + '(a CARTOGRAPHIC text height — documented differently, so PGOU_AL.altura is not that)',
    /** TEST A — paired against OSM `building:levels` on the same building. */
    pairedSampleN: 105,
    /** ⭐ METRES would predict ≈3.0. Measured 0.78 ⇒ REFUTED by ~4×. `altura` is storey-scale. */
    medianAlturaOverOsmLevels: 0.778,
    /** ⛔ THE BLOCKER: `altura` sits BELOW the built storey count on 81 % of buildings, modally by 2. */
    pctAlturaBelowBuiltLevels: 81,
    /** Modal `altura − levels`. A plan MAXIMUM should not be systematically two storeys short. */
    modalAlturaMinusLevels: -2,
    /** Only a third of pairs agree to within one storey. The spread runs −13 … +7. */
    pctWithinOneStorey: 33,
    /** TEST B — ENS/EDA suelo urbano carrying a bare storey count, EPSG:25830. */
    geometrySampleN: 54,
    /** ⭐ Median mean-width of the alineación polygon, metres — a *profundidad edificable* scale. */
    medianAlineacionWidthM: 15.6,
    /** ⭐ 0 of 54. The alignment polygon is always inside its zone polygon ⇒ it is a FOOTPRINT. */
    alineacionLargerThanCalificacionCount: 0,
    /** Median area(alineación)/area(calificación). */
    medianAreaRatio: 0.75,
} as const;

/** One reason the `altura` route cannot yet publish an envelope, and what became of it. */
export interface ValenciaAlturaBlocker {
    readonly id:
        | 'field-units-undocumented'
        | 'offset-convention-unknown'
        | 'profundidad-not-published'
        | 'hc-not-a-ceiling';
    /** `blocking` alone forbids publication. `retired`/`mitigated` are kept so nobody re-litigates. */
    readonly status: 'retired' | 'mitigated' | 'blocking';
    readonly evidence: string;
}

/**
 * The four objections to the layer-212 `altura` route, with what the 2026-08-02 measurements did to
 * each. **Exported so the refusal is machine-readable and a test can pin it** — the row is closed
 * with its evidence rather than by a comment a future author can skim past.
 *
 * ⚠ A future author who wants to pack ENS must flip `offset-convention-unknown` to `retired`, and
 * that requires the municipal answer (`VALENCIA_R5_ASK`) — not a better parser.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaAlturaRouteBlockers` (P8 / C58 §1.10).
 */
export function valenciaAlturaRouteBlockers(): readonly ValenciaAlturaBlocker[] {
    const span = tracer.startSpan('pryzm.zoning.valenciaAlturaRouteBlockers');
    try {
        const blockers: readonly ValenciaAlturaBlocker[] = [
            {
                id: 'field-units-undocumented',
                status: 'retired',
                evidence:
                    'datos.gob.es publisher L01462508 documents «Altura: Altura del PGOU» (a PGOU '
                    + 'attribute, not the cartographic «Altura de representació en plans» its sibling '
                    + 'Portales dataset declares); and altura/OSM building:levels = 0.78 median over '
                    + 'n=105, refuting the METRES reading (which predicts ≈3.0) by ~4×.',
            },
            {
                id: 'profundidad-not-published',
                status: 'retired',
                evidence:
                    'Art. 6.18.1 sets the ocupación by the ALINEACIONES, and layer 212 is those '
                    + 'alineaciones: on ENS/EDA (n=54) its polygon has median mean-width 15.6 m, is '
                    + 'NEVER larger than its calificación polygon (0/54, median area ratio 0.75), and '
                    + 'carries patio-de-manzana holes. The depth is drawn, not tabulated.',
            },
            {
                id: 'hc-not-a-ceiling',
                status: 'mitigated',
                evidence:
                    'Art. 6.19.3 enrase de cornisas and 6.19.3.c ENS-2 infill both push ABOVE the '
                    + 'computed Hc, so omitting them UNDER-states — the safe direction under the '
                    + 'never-overstates invariant (C58 §1.14.4). A caveat, not a bar.',
            },
            {
                id: 'offset-convention-unknown',
                status: 'blocking',
                evidence:
                    '⛔ DECISIVE. Art. 6.19.1 sets Np = graphed plantas − 1; whether `altura` stores '
                    + 'the graphed count or Np is undocumented. Measured, altura sits BELOW the built '
                    + 'storey count on 81 % of buildings (n=105), modally by TWO, with only 33 % '
                    + 'within ±1 and a spread of −13…+7. Reading it as the graphed count would publish '
                    + 'an envelope LOWER than the building already standing; the 10/105 where it '
                    + 'exceeds would OVER-state. Wrong in both directions ⇒ no safe branch, and C58 '
                    + '§1.4 forbids presenting one reading as the fact. Needs VALENCIA_R5_ASK.',
            },
        ];
        span.setAttribute('blockingCount', blockers.filter((b) => b.status === 'blocking').length);
        span.setAttribute('resultFields', 'blockers');
        span.setStatus({ code: SpanStatusCode.OK });
        return blockers;
    } finally {
        span.end();
    }
}

/**
 * May PRYZM publish a València envelope from the layer-212 `altura` route today? **`false`.**
 *
 * The single guard a future author must pass. It is derived from `valenciaAlturaRouteBlockers()` and
 * is never a hand-set boolean, so it cannot drift from the evidence that justifies it.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaAlturaRouteIsPublishable` (P8 / C58 §1.10).
 */
export function valenciaAlturaRouteIsPublishable(): boolean {
    const span = tracer.startSpan('pryzm.zoning.valenciaAlturaRouteIsPublishable');
    try {
        const publishable = !valenciaAlturaRouteBlockers().some((b) => b.status === 'blocking');
        span.setAttribute('publishable', publishable);
        span.setAttribute('resultFields', 'publishable');
        span.setStatus({ code: SpanStatusCode.OK });
        return publishable;
    } finally {
        span.end();
    }
}

/**
 * ⭐ **THE ONE ASK — and it is now a question, not a dataset.**
 *
 * Before 2026-08-02 the register said València needed **Plano C as data**: a 1991 drawing set, an
 * institution, possibly a fee, timeline unknown. That framing is **superseded**. The alignments are
 * already published (layer 212), the depth is already in their geometry, and the storey field is
 * already there. What is missing is **one written definition** of a field the city already publishes.
 *
 * Contact: `datosabiertos@valencia.es` — the address in the layer's OWN ISO metadata
 * (`…/MapServer/212/metadata`, HTTP 200) — and/or the Servicio de Planeamiento.
 */
export const VALENCIA_R5_ASK =
    'In the published dataset «PGOU - Alineaciones» (PGOU_AL, geoportal.valencia.es MapServer/212), '
    + 'the field `altura` is documented only as «Altura del PGOU». (1) Does it record the *número de '
    + 'plantas grafiado en el Plano C* of Art. 6.19.1 — and if so, does it store the graphed count, '
    + 'or Np (the graphed count minus one)? (2) What are the units of the non-integer values (`13m`, '
    + '`0.8m2t/m2s`, `10235m2t`, `<=5`)? (3) Does the polygon delimit the *área de movimiento* — the '
    + 'ocupación bounded by the alineación exterior and the profundidad edificable of Art. 6.18 — or '
    + 'something else? ⚠ Please also reconcile one measurement: `altura` is LOWER than the built '
    + 'storey count on 81 % of sampled Ensanche buildings, modally by two. An answer that does not '
    + 'explain that gap does not unblock publication.';

/**
 * The roadmap line, stated once. Same role as `MURCIA_ROADMAP_LINE`: the refusal card must say
 * what would change the answer, or the user cannot tell a coverage gap from a crash.
 */
export const VALENCIA_ROADMAP_LINE =
    'València coverage today: the PARCEL half is live and keyless — the national Catastro path ' +
    'resolves the referencia catastral and the official boundary, and the municipality ' +
    'independently publishes the cadastral reference on its own parcel layer, so there are two ' +
    'routes and neither needs a licence. The ZONING half is live too: the city\'s own ArcGIS ' +
    'service returns the calificación, its grade and — unusually — the governing plan instrument ' +
    'as a column, so PRYZM can name the document that orders a parcel without a second query. ' +
    'The ENVELOPE half is where the limit sits, and for València the limit is unusually sharp. ' +
    'The general plan\'s Normas Urbanísticas have been sourced and transcribed article by ' +
    'article; the transcription is complete and quoted verbatim. It still yields no number, ' +
    'because the plan does not put the numbers in its text: Arts. 6.18 and 6.19 define the ' +
    'buildable depth and the cornice height as functions of a storey count and a depth GRAPHED ' +
    'ON A DRAWING — the Plano C sheets — and that drawing is not published as data. So this is ' +
    'not a transcription gap and no amount of further reading closes it. What closes it is ' +
    'Plano C itself, as data; PRYZM will publish a València envelope on the day it holds that ' +
    'sheet, and not one day earlier.';

/**
 * THE HONESTY-GATE refusal: returned for EVERY València parcel.
 *
 * `code: 'no-rule-pack'` + `legallyGrounded: false` + `ordinanceRef: null` — a statement about
 * PRYZM's COVERAGE, not about the law. The distinction is load-bearing: the PGOU certainly DOES
 * grant an envelope on this urban land, so a legal "no" would tell the owner of a perfectly
 * buildable plot that the law forbids building on it. That is the opposite error and it is worse.
 *
 * ⚠ It is NOT `source-data-unavailable`: nothing failed to fetch. Catastro answered, the
 * municipal service answered, and the ordinance was read. Stamping a transient code here would
 * offer a RETRY affordance that could never succeed, because no number of retries digitises a
 * 1991 drawing (the L-574 / §L-590c reasoning).
 *
 * ⚠ It is NOT `derived-plan` either — that code is a claim about the LAW (`legallyGrounded:
 * true`), and it is reserved for parcels whose `origen` names a non-`PGOU*` instrument. Whether
 * a given València parcel is in that class is knowable from the GIS but is NOT decided here;
 * conflating the two would overstate what this refusal establishes. See the note in
 * `esValenciaPgou.ts` §DELEGATION-UNMEASURED.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaNoRulePackRefusal` (P8 / C58 §1.10).
 *
 * @param zoneCode  the live `califi` value, if the municipal service was reached.
 * @param zoneLabel a human designation, if one is held.
 * @param knownFacts L-553 — short "label: value" facts, so the card is never a blank panel.
 */
export function valenciaNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.valenciaNoRulePackRefusal');
    try {
        const zone =
            zoneLabel && zoneLabel.trim()
                ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
                : zoneCode && zoneCode.trim()
                  ? `Zone ${zoneCode}`
                  : 'This València parcel';

        span.setAttribute('jurisdictionId', VALENCIA_JURISDICTION_ID);
        span.setAttribute('zoneCode', (zoneCode ?? '').trim());
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'no-rule-pack',
            headline:
                `${zone} — PRYZM has identified your land precisely and has read the governing ` +
                'ordinance, but the ordinance sets this parcel\'s limits on a drawing PRYZM does ' +
                'not hold, so it will not publish a buildable figure.',
            detail:
                'The parcel itself is fully established from the Spanish Dirección General del ' +
                'Catastro: its referencia catastral and its official boundary are read live from the ' +
                'national INSPIRE services, by identifier — not inferred from a map pin. The zone is ' +
                'established too, from the city\'s own planning service. What is missing is neither ' +
                'the parcel nor the zone nor the ordinance: the PGOU\'s Normas Urbanísticas have been ' +
                'read and transcribed, and they state that the maximum cornice height and the ' +
                'buildable depth are set by a storey count and a depth GRAPHED ON THE PLANO C SHEETS, ' +
                'which the city does not publish as data. Every route to a number from here runs ' +
                'through a value PRYZM would have to invent. Rather than show an estimated or proxied ' +
                'figure that would look like a determination, PRYZM shows none. ' +
                VALENCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}