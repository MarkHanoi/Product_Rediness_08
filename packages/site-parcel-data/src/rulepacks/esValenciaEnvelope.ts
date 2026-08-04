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
 * ⚠⚠ **THE ERROR IS TWO-SIDED, SO THERE IS NO CONSERVATIVE BRANCH.** Reading `altura` as the graphed
 * count on a typical Ensanche block — `altura` 5 against a 7-storey building — yields
 * `Hc = 4,80 + 2,90·4 = 16,4 m` for a building already standing at roughly 21 m; and in the 10 of 105
 * where `altura` EXCEEDS the built count the same parser over-states instead.
 *
 * **THE DOCTRINE IS SETTLED CORPUS-WIDE — cited, not re-argued here.** This exact case is the worked
 * example in **ADR-0287** (*resolvers refuse whenever uncertainty can change the legal outcome*;
 * "there is no 'conservative branch' escape when the error is two-sided"), resting on **ADR-0283**
 * (*authoritative publication defines the boundary of verified knowledge; UNKNOWN is a valid product
 * state*). Founder ruling, 2026-08-02: *"**Wait. Don't engineer around missing authority.** No
 * heuristic. No inferred semantics. No workaround… Do not substitute engineering for legal
 * interpretation."*
 *
 * ⇒ **València stays at 0 %, and WAITING IS THE CORRECT STATE.** Three readings survive the data —
 * Np with OSM counting planta baja plus ático; a different quantity entirely; or a noisier pairing —
 * and each implies a different envelope. ⭐ The ask is `VALENCIA_R5_ASK`; the routes are
 * `VALENCIA_R5_ROUTES`. **No further engineering route to `altura` may be attempted** (ADR-0287).
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

/**
 * ⭐ **FOUNDER DECISION R1, 2026-08-02 — THE BUILDABLE DEPTH IS CLOSED, AND THE GEOMETRY IS THE
 * LEGAL DATUM.**
 *
 * Author: **the founder.** Recorded here, in code, so that no later agent silently re-opens it and
 * so the reasoning travels with the data rather than living in a chat log.
 *
 * > *"The blocking assumption ('profundidad edificable is unpublished') is no longer supported.
 * > Layer 212 appears to publish the movement polygon itself. If the polygon already encodes the
 * > buildable movement area bounded by the exterior alignment and the buildable depth, then **the
 * > geometry is the legal datum**. There is no need to recover a separate depth attribute."*
 *
 * **THE DOCTRINAL FIT, and it is why this is implementation rather than inference.** The founder has
 * separately signed **Doctrine B** — *"Authoritative publication defines the boundary of knowledge…
 * Unknown is a valid product state."* Layer 212 IS authoritative published geometry from the
 * competent authority. Reading a boundary the municipality has drawn is therefore **using a
 * published datum**, not inferring an unpublished one. Same reasoning the founder applied to
 * Murcia's street width in the SIG-MU2 rationale. ⚠ Doctrine B is a founder ruling conveyed
 * 2026-08-02; it is not yet transcribed as a numbered doctrine document in this repo.
 *
 * **THE EVIDENCE IT RESTS ON** (measured 2026-08-02, `VALENCIA_ALTURA_SEMANTICS_2026_08_02`, n=54
 * ENS/EDA suelo urbano in EPSG:25830): the alineación polygon has a **median mean-width of 15,6 m**
 * — a *profundidad edificable* scale against Art. 6.18.2's 20 m default cap — it is **NEVER larger
 * than its own calificación polygon (0 of 54, median area ratio 0,75)**, and **10 of 54 carry
 * interior holes**, the *patio de manzana*. Art. 6.18.1 supplies the legal link: «La ocupación de la
 * parcela edificable se ajustará a las **alineaciones definidas en el Plano C**».
 *
 * ⚠ **WHAT THIS DOES NOT DO — and the distinction is load-bearing.** Closing R1 removes a blocker
 * from the PATH; **it does not raise the ENVELOPE axis by one basis point.** València remains at
 * **0 %** and no envelope ships. The axis moves when `altura` is answered AND land is packed, not
 * before. Any future edit that lifts the measurement record on the strength of THIS decision is
 * exactly the fabrication C63 §1.1 forbids.
 *
 * ⚠ **HOW TO RE-OPEN IT.** Only on CONTRARY EVIDENCE — e.g. the municipality stating the polygon is
 * a block outline rather than an *área de movimiento*, or a measurement showing it exceeding its
 * calificación polygon at scale. Re-opening it on argument alone would overturn a founder decision.
 */
export const VALENCIA_MOVEMENT_GEOMETRY_DECISION = {
    decidedAt: '2026-08-02',
    decidedBy: 'founder',
    /** The former blocker id this decision retires. Kept so the audit trail is greppable. */
    supersedesBlocker: 'profundidad-not-published',
    /** Layer 212's polygon is taken as the authoritative buildable-movement geometry. */
    layer212IsAuthoritativeMovementGeometry: true,
    /** ⚠ The search for a separate Plano C / profundidad dataset is CLOSED BY DECISION. */
    plano_C_searchClosedByDecision: true,
    doctrine: 'Doctrine B — authoritative publication defines the boundary of knowledge; '
        + 'unknown is a valid product state (founder, 2026-08-02; not yet transcribed in-repo)',
    reopenOnlyIf: 'contrary evidence — e.g. the municipality states the polygon is a block outline, '
        + 'or a measurement shows it exceeding its calificación polygon at scale',
    /** ⚠ Closing this blocker raises the ENVELOPE axis by ZERO. It clears the path, not the score. */
    raisesEnvelopeAxis: false,
} as const;

/** One reason the `altura` route cannot yet publish an envelope, and what became of it. */
export interface ValenciaAlturaBlocker {
    readonly id:
        | 'field-units-undocumented'
        | 'offset-convention-unknown'
        | 'hc-not-a-ceiling';
    /** `blocking` alone forbids publication. `retired`/`mitigated` are kept so nobody re-litigates. */
    readonly status: 'retired' | 'mitigated' | 'blocking';
    readonly evidence: string;
}

/**
 * The objections to the layer-212 `altura` route that REMAIN, with what the 2026-08-02 measurements
 * did to each. **Exported so the refusal is machine-readable and a test can pin it** — each row is
 * closed with its evidence rather than by a comment a future author can skim past.
 *
 * ⚠ **THE LIST IS THREE ROWS, NOT FOUR.** `profundidad-not-published` was removed by **founder
 * decision R1** (2026-08-02) — see `VALENCIA_MOVEMENT_GEOMETRY_DECISION`.
 *
 * ⭐ **EXACTLY ONE ROW IS `blocking`, AND IT IS NOW THE SINGLE RELEASE GATE FOR VALÈNCIA:**
 * `offset-convention-unknown`. Founder ruling R2, 2026-08-02:
 *
 * > *"The measured evidence demonstrates that the current interpretation produces envelopes that are
 * > both under- and over-permissive relative to the existing city. That is a semantic problem, not an
 * > implementation problem. **No heuristic should be adopted.** Await an authoritative definition of
 * > the field."* — **"Do not ship València envelopes."**
 *
 * ⚠ A future author who wants to pack ENS must retire that row **in evidence** — with the municipal
 * answer (`VALENCIA_R5_ASK`), not with a better parser and not by choosing a branch.
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
            // ⚠ `profundidad-not-published` USED TO BE A ROW HERE. It is not "retired" any more —
            // it is GONE, closed by FOUNDER DECISION R1 (2026-08-02). Its record, its evidence and
            // the conditions for re-opening it live in `VALENCIA_MOVEMENT_GEOMETRY_DECISION`. It is
            // deliberately absent rather than present-and-retired so that nobody reads the blocker
            // list as "still four things to solve".
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
                    '⛔ THE SINGLE RELEASE GATE. Art. 6.19.1 sets Np = graphed plantas − 1; whether '
                    + '`altura` stores the graphed count or Np is undocumented. Measured, altura sits '
                    + 'BELOW the built storey count on 81 % of buildings (n=105), modally by TWO, with '
                    + 'only 33 % within ±1 and a spread of −13…+7 — so the error is TWO-SIDED and '
                    + 'ADR-0287 applies directly (no conservative-branch escape). ADR-0283: UNKNOWN is '
                    + 'a valid product state. Category EXTERNAL AUTHORITY, owner the founder, exit = a '
                    + 'written municipal definition that also reconciles the −2 gap (VALENCIA_R5_ASK). '
                    + '⚠ It may NOT be retired by engineering — no heuristic, no inferred semantics.',
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
 * ⭐ **AFTER FOUNDER DECISION R1 THIS IS GATED BY EXACTLY ONE THING: R2, the `altura` offset.** The
 * depth question is closed and the units question is refuted; what remains is one semantic fact
 * about one field. **"Do not ship València envelopes"** until it is answered authoritatively.
 *
 * The single guard a future author must pass. It is **derived** from `valenciaAlturaRouteBlockers()`
 * and is never a hand-set boolean, so it cannot drift from the evidence that justifies it — and it
 * cannot be opened by adopting a heuristic, because a heuristic changes no row's `status`.
 *
 * ⚠ **PUBLISHABLE ≠ DEPLOYABLE.** Even once this returns `true`, `valenciaHeritageDisposition()`
 * still gates DEPLOYMENT: heritage is a legal overlay that constrains envelopes DOWNWARD, and while
 * its authoritative layers are token-gated PRYZM must refuse where heritage may apply. Never ignore
 * heritage (founder R3, 2026-08-02).
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
 * §VALENCIA-HERITAGE — **founder ruling R3, 2026-08-02: heritage is a DEPLOYMENT blocker, not an
 * envelope-model blocker — and it is never ignorable.**
 *
 * > *"Heritage is a legal overlay. It should constrain envelopes after the base ordinance is known…
 * > Once altura is resolved: heritage available → constrain; heritage unavailable → refuse where
 * > heritage may apply. **Never ignore heritage.**"*
 *
 * **WHAT THAT RE-CLASSIFICATION DOES AND DOES NOT MEAN.** It un-blocks *work*: `altura` can be
 * resolved and the envelope engine built and validated without heritage access. It does **not**
 * un-block *shipping*: heritage constrains envelopes DOWNWARD, so publishing a figure that ignores
 * it would OVER-state — L-616's ratified rule that a SOLID must intersect **all** derived
 * constraints, and the exact error Córdoba spent a day un-fabricating.
 *
 * ⚠⚠ **THE VOCABULARY HAS ONLY TWO MEMBERS, AND THE MISSING THIRD IS THE POINT.** There is no
 * `absent`. PRYZM cannot prove a parcel is heritage-free, because the authoritative layers —
 * `Patrimonio_Historico`, `Vivienda` and 15 other ArcGIS folders — answer
 * `{"error":{"code":499,"message":"Token Required"}}` (re-probed 2026-08-01 and 2026-08-02). An
 * access-gated source is **UNKNOWN, never empty** (L-422/457/467/469). Offering an `absent` value
 * would let a coverage gap be rendered as a legal clearance.
 *
 * ⇒ While `VALENCIA_HERITAGE_DATA_AVAILABLE` is `false`, *"where heritage may apply"* is **every
 * parcel we cannot positively clear — which is all of them.** That is why heritage blocks
 * DEPLOYMENT even though it blocks no engineering: the refusal is correct, and it is total.
 *
 * ⚠ **PARTIAL MITIGATION EXISTS AND IT ONLY WORKS ONE WAY.** BIC/BRL and *Catálogo* layers ARE
 * public inside `UrbanismoEInfraestructuras`, layer 212 carries `protec`, and 5,8 % of buildable
 * land carries a protection-derived `altura`. Those signals can prove heritage **applies**. Nothing
 * public can prove it **does not**.
 */
export const VALENCIA_HERITAGE_DATA_AVAILABLE = false as const;

/**
 * What PRYZM can say about heritage at a València parcel. ⚠ **Two members by construction** — see
 * `VALENCIA_HERITAGE_DATA_AVAILABLE`. There is deliberately no `absent`.
 */
export type ValenciaHeritageDisposition =
    /** Positive public evidence binds this parcel: a BIC/BRL/Catálogo feature, or `protec` set. */
    | 'applies'
    /** No positive evidence — and PRYZM cannot clear it, because the authority's layers are gated. */
    | 'may-apply-unknown';

/** The public signals that can prove heritage APPLIES. None of them can prove it does not. */
export interface ValenciaHeritageSignals {
    /** `MapServer/212.protec` — non-blank means a protection level is recorded. */
    readonly protec?: string | null;
    /** The parcel intersects a public BIC / BRL / Catálogo feature. */
    readonly intersectsCatalogueFeature?: boolean;
    /** `altura` is protection-derived (`PROTEGIDO*`, `BIC`, `BRL`, `PROT_*`) rather than a count. */
    readonly alturaIsProtectionDerived?: boolean;
}

/**
 * Resolve the heritage disposition for a València parcel from the PUBLIC signals.
 *
 * ⚠ **IT CAN RETURN `applies`; IT CAN NEVER RETURN "absent".** With the authoritative folders
 * token-gated, the honest floor is `may-apply-unknown` — and that is what makes shipping without
 * heritage access legitimate rather than negligent: the parcel gets a cited refusal naming the
 * uncertainty, instead of an envelope that silently assumes no heritage binds it.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaHeritageDisposition` (P8 / C58 §1.10).
 */
export function valenciaHeritageDisposition(
    signals: ValenciaHeritageSignals = {},
): ValenciaHeritageDisposition {
    const span = tracer.startSpan('pryzm.zoning.valenciaHeritageDisposition');
    try {
        const protecSet = typeof signals.protec === 'string' && signals.protec.trim() !== '';
        const applies = protecSet
            || signals.intersectsCatalogueFeature === true
            || signals.alturaIsProtectionDerived === true;
        // ⚠ NO `else → absent` BRANCH, AND THAT ABSENCE IS THE DESIGN. Falling through to
        // `may-apply-unknown` is what keeps a gated source from reading as a clearance.
        const disposition: ValenciaHeritageDisposition = applies ? 'applies' : 'may-apply-unknown';
        span.setAttribute('heritageDataAvailable', VALENCIA_HERITAGE_DATA_AVAILABLE);
        span.setAttribute('disposition', disposition);
        span.setAttribute('resultFields', 'disposition');
        span.setStatus({ code: SpanStatusCode.OK });
        return disposition;
    } finally {
        span.end();
    }
}

/**
 * The heritage refusal — *"refuse where heritage may apply"* (founder R3) made real in code.
 *
 * `code: 'overlay-uncertain'` is the CONTRACT'S OWN vocabulary for exactly this, not a new one:
 * C58 / `EnvelopeRefusalCodeSchema` defines it as *«a heritage catalogue / protection special plan
 * MAY bind and our data path cannot see it, so any computed figure would silently over-state
 * buildability»*. Reusing it keeps València inside the shared engine rather than special-casing the
 * city (P1). `legallyGrounded: false` — the uncertainty is about PRYZM's ACCESS, not about the law.
 *
 * ⚠ Deliberately NOT `source-data-unavailable`: that code is defined as TRANSIENT and is the only
 * one that earns a RETRY affordance. A 499 token-gate does not clear on a retry, so offering one
 * would send the user round a loop for ever (the L-574 / §L-590c reasoning).
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaHeritageRefusal` (P8 / C58 §1.10).
 */
export function valenciaHeritageRefusal(
    disposition: ValenciaHeritageDisposition,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.valenciaHeritageRefusal');
    try {
        const applies = disposition === 'applies';
        span.setAttribute('disposition', disposition);
        span.setAttribute('resultFields', 'overlay-uncertain');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            code: 'overlay-uncertain',
            headline: applies
                ? 'This València parcel carries a recorded heritage protection, and PRYZM will not '
                  + 'publish a buildable figure that ignores it.'
                : 'PRYZM cannot rule out a heritage protection on this València parcel, so it will '
                  + 'not publish a buildable figure.',
            detail:
                (applies
                    ? 'The city\'s own published data records a protection on this land — a BIC or '
                      + 'BRL listing, a Catálogo entry, or a protection level on the alignment '
                      + 'record. A heritage regime sets what may be built here, and it is stricter '
                      + 'than the general plan. '
                    : 'No public record shows a protection here — but that is not the same as there '
                      + 'being none. The municipality\'s authoritative heritage layers '
                      + '(Patrimonio Histórico among them) require a credential PRYZM does not '
                      + 'hold, and answer "Token Required" to an open request. An access barrier is '
                      + 'an unknown, never an all-clear. ')
                + 'Heritage only ever REDUCES what may be built, so publishing a figure without it '
                + 'would overstate this parcel — which is the one error PRYZM will not make. '
                + VALENCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

/**
 * ⭐ **HOW TO ACTUALLY GET R5 ANSWERED — three routes, each VERIFIED live 2026-08-02**, so nobody is
 * sent to a dead link. Ordered cheapest-first; **route 3 is the one with a legal clock on it.**
 *
 * 1. **`datosabiertos@valencia.es`** — the open-data contact carried in layer 212's OWN ISO metadata
 *    (`…/MapServer/212/metadata`, HTTP **200**). The right first ask: the question is a field
 *    definition in a dataset this address publishes.
 * 2. **Servicio de Planeamiento — `https://www.valencia.es/cas/urbanismo/inicio` (HTTP 200).** The
 *    Urbanismo area publishes a *Planeamiento → Plan General de Ordenación Urbana* section; this is
 *    the technical office that authors the PGOU graphics, and the right escalation if (1) answers on
 *    the dataset but not on Art. 6.19.1.
 * 3. ⭐ **`https://www.valencia.es/cas/transparencia/solicitud-de-acceso-a-la-informacion`
 *    (HTTP 200, verified — it is a live SUBMIT FORM,** *«Solicitud de acceso a la información
 *    (Transparencia) — Introduzca los datos… DATOS SOLICITANTE»*). This is the statutory
 *    access-to-information channel under **Ley 19/2013**, which obliges an answer within **one
 *    month**. **It converts a courtesy email into an obligation with a deadline, and it is a
 *    one-action send.** Use it if (1) and (2) go unanswered — or immediately, in parallel.
 *
 * ⚠ **MEASURED DEAD — deliberately listed so nobody re-finds them hopefully.**
 * `valencia.opendatasoft.com` (the open-data portal named in the city's OWN metadata) answers **404**
 * behind a 188 KB parked-domain page; the `PGOU_AL.dwg` / `.gml` / `.shz` distributions advertised by
 * `datos.gob.es` are **404**; and `https://www.valencia.es/portal-transparencia` is **404** — the
 * working transparency path is `/cas/transparencia`. The live documentation surface is `datos.gob.es`
 * publisher `L01462508`.
 */
export const VALENCIA_R5_ROUTES = [
    {
        route: 'datosabiertos@valencia.es',
        kind: 'email',
        verified: 'carried in layer 212 ISO metadata (…/MapServer/212/metadata, HTTP 200, 2026-08-02)',
    },
    {
        route: 'https://www.valencia.es/cas/urbanismo/inicio',
        kind: 'technical-office',
        verified: 'HTTP 200 2026-08-02; publishes a Planeamiento → PGOU section (Servicio de Planeamiento)',
    },
    {
        route: 'https://www.valencia.es/cas/transparencia/solicitud-de-acceso-a-la-informacion',
        kind: 'statutory-foi',
        verified: 'HTTP 200 2026-08-02, a live submit form; Ley 19/2013 obliges an answer within one month',
    },
] as const;

/**
 * ⭐ **THE ONE ASK — a question about a published field, not a dataset to acquire.**
 *
 * Before 2026-08-02 the register said València needed **Plano C as data**: a 1991 drawing set, an
 * institution, possibly a fee, timeline unknown. **Superseded on both halves.** The alignments are
 * published (layer 212); the depth is in their geometry (founder decision R1); the field is
 * storey-scale, not metres (measured). What is missing is **one written definition**.
 *
 * ⚠⚠ **QUESTION 4 IS THE RELEASE GATE. QUESTIONS 1–3 ARE USEFUL METADATA.** Founder ruling R2,
 * 2026-08-02: Q4 gates *"because it addresses a measured systematic discrepancy rather than a
 * documentation gap"*. An answer that defines the field perfectly and leaves the −2 gap unexplained
 * does **not** authorise publication — it would mean shipping a systematic error we had already
 * measured and chosen to ignore. Q1–3 make the answer usable; **Q4 makes it sufficient.**
 *
 * Routes, verified: `VALENCIA_R5_ROUTES`.
 */
export const VALENCIA_R5_ASK =
    'In the published dataset «PGOU - Alineaciones» (PGOU_AL, geoportal.valencia.es MapServer/212), '
    + 'the field `altura` is documented only as «Altura del PGOU». (1) Does it record the *número de '
    + 'plantas grafiado en el Plano C* of Art. 6.19.1 — and if so, does it store the graphed count, '
    + 'or Np (the graphed count minus one)? (2) What are the units of the non-integer values (`13m`, '
    + '`0.8m2t/m2s`, `10235m2t`, `<=5`)? (3) Does the polygon delimit the *área de movimiento* — the '
    + 'ocupación bounded by the alineación exterior and the profundidad edificable of Art. 6.18 — or '
    + 'something else? ⚠⚠ (4) THE ONE THAT DECIDES IT — please reconcile a measurement: `altura` is '
    + 'LOWER than the built storey count on 81 % of sampled Ensanche buildings, modally by TWO '
    + '(n=105, against OpenStreetMap `building:levels`). A plan maximum should sit at or above what '
    + 'was built. Questions 1-3 are metadata; an answer that does not explain question 4 does not '
    + 'unblock publication, because we would be shipping a systematic discrepancy we had already '
    + 'measured.';

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
    'The ENVELOPE half is where the limit sits, and for València the limit is unusually sharp — ' +
    'and unusually narrow. The general plan\'s Normas Urbanísticas have been sourced and ' +
    'transcribed article by article, quoted verbatim. The buildable DEPTH is resolved: the city ' +
    'publishes the alignment polygons, and Art. 6.18 sets the buildable area by those alignments, ' +
    'so the depth is drawn rather than tabulated. What remains is ONE definition. Art. 6.19 sets ' +
    'the cornice height from a storey count, the city publishes a storey-like field beside those ' +
    'alignments, and it has never published what that field means — and measured against the ' +
    'buildings actually standing, it does not behave like a simple maximum. PRYZM has asked the ' +
    'municipality in writing. Until that answer arrives, publishing a height here would be a ' +
    'guess wearing the clothes of a determination, and PRYZM will not do that. ' +
    'THIS IS A KNOWN BOUNDARY, NOT A FAULT: nothing failed, nothing is loading, and retrying ' +
    'will not change it. PRYZM will publish a València envelope on the day that one definition ' +
    'is answered, and not one day earlier.';

/**
 * §VALENCIA-ORIGEN-DERIVED-PLAN (2026-08-03) — closes CLOSURE-REGISTER #3.
 *
 * `esValenciaPgou.ts` §DELEGATION-MEASURED and this file's registry entry both name the same open
 * item: 36,40 % of València's private buildable land (L-656 denominator) is ordered by a DERIVED
 * instrument (`origen` not `PGOU*`), measured over the whole `MapServer/231.origen` column — but a
 * land SHARE cannot license the stronger `derived-plan` refusal on any ONE parcel; that needs the
 * LIVE `origen` value read AT the parcel, which `resolveValenciaOrigen.ts` (providers/) now does.
 *
 * ⚠ THIS DOES NOT TOUCH THE ENVELOPE GATE. `VALENCIA_ENVELOPE_VERIFIED` stays `false` — nothing
 * here computes a height, a depth, a FAR or a coverage. It upgrades the REFUSAL's legal grounding
 * on the measured 36,40 % share, from `no-rule-pack` (`legallyGrounded: false` — a statement about
 * PRYZM's coverage) to `derived-plan` (`legallyGrounded: true` — a statement about the LAW: a
 * document other than the PGOU governs this specific site, and PRYZM does not hold it). Everywhere
 * else — including every point `resolveValenciaOrigen` cannot reach — the weaker, always-true
 * `no-rule-pack` refusal below still applies. Never the reverse: `derived-plan` may ONLY be
 * returned once a live, non-`PGOU*` `origen` value has actually been read for that parcel.
 */

/**
 * Is a live `origen` value the PGOU itself, or a derived instrument? PURE; never throws.
 *
 * ⚠ `null`/blank is NOT `PGOU*` — an unread field must never default to "the general plan
 * governs", which would be a fabricated legal claim in the OPTIMISTIC direction (§CONTEXT-DATA-
 * HONESTY: an unknown must never be coerced into the more convenient of two answers).
 */
export function valenciaOrigenIsPgouOrdered(origen: string | null | undefined): boolean {
    const s = typeof origen === 'string' ? origen.trim().toUpperCase() : '';
    return s.length > 0 && s.startsWith('PGOU');
}

/**
 * The STRONGER, legally-grounded refusal for a parcel whose LIVE `origen` names a document other
 * than the PGOU. `code: 'derived-plan'` is the contract's own vocabulary for exactly this case
 * (`EnvelopeRefusalCodeSchema`: *"the general plan POINTS AT ANOTHER DOCUMENT … the rule is not
 * absent — it is elsewhere, and PRYZM does not hold it"*) — reusing it keeps València inside the
 * shared engine rather than inventing a city-specific code (P1).
 *
 * `legallyGrounded: true` — the classification itself (which document governs) is a fact of the
 * municipal record, read live, not a coverage gap.
 *
 * ⚠ `ordinanceRef` stays `null`, DELIBERATELY. Murcia's equivalent refusal cites Arts. 5.25.3.3 /
 * 5.26.3.3 because those articles were transcribed and verified as saying, in terms, that a
 * delegating ámbito's own zonal code governs use/typology but NOT height or edificabilidad.
 * València's PGOU text has NOT been read for an equivalent article, and citing one that has not
 * been verified would be exactly the fabrication this whole file exists to refuse. The citation
 * this refusal rests on is the live municipal record itself — named in `detail` and `knownFacts`,
 * never invented as an `ordinanceRef` this file cannot back.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaDerivedPlanRefusal` (P8 / C58 §1.10).
 *
 * @param origen the live, non-blank `origen` value from `MapServer/231` (already confirmed by the
 *   caller not to start with `PGOU`, via `valenciaOrigenIsPgouOrdered`).
 */
export function valenciaDerivedPlanRefusal(
    origen: string,
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.valenciaDerivedPlanRefusal');
    try {
        const zone =
            zoneLabel && zoneLabel.trim()
                ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
                : zoneCode && zoneCode.trim()
                  ? `Zone ${zoneCode}`
                  : 'This València parcel';

        span.setAttribute('jurisdictionId', VALENCIA_JURISDICTION_ID);
        span.setAttribute('origen', origen);
        span.setAttribute('resultFields', 'derived-plan');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'derived-plan',
            headline:
                `${zone} is governed by a separate planning instrument, not directly by the PGOU ` +
                '— and PRYZM does not hold that document.',
            detail:
                `València's own zoning service records this parcel's governing instrument as ` +
                `"${origen}" — not the PGOU itself. The general plan's Título VI Normas ` +
                'Urbanísticas do apply to this land, but a derived instrument governs the specific ' +
                'buildable parameters here; that document is a separate publication PRYZM does not ' +
                'hold. This is a stronger, legally-grounded refusal than a generic coverage gap: ' +
                'PRYZM has identified WHICH document governs your parcel, live, from the ' +
                "municipality's own planning register — it is simply not one PRYZM has transcribed " +
                '(measured 2026-08-01: derived instruments order 36,40 % of the city\'s private ' +
                'buildable land). ' + VALENCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: true,
            knownFacts: [...knownFacts, `Governing instrument (live): ${origen}`],
        };
    } finally {
        span.end();
    }
}

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
                'ordinance. One municipal definition is still missing, and until it arrives PRYZM ' +
                'will not publish a buildable figure for València.',
            detail:
                'The parcel itself is fully established from the Spanish Dirección General del ' +
                'Catastro: its referencia catastral and its official boundary are read live from the ' +
                'national INSPIRE services, by identifier — not inferred from a map pin. The zone is ' +
                'established too, from the city\'s own planning service. The buildable DEPTH is ' +
                'settled as well: the city publishes the alignment polygons, and Art. 6.18 of the ' +
                'PGOU sets the buildable area by those alignments, so the depth is drawn rather than ' +
                'written down. What is missing is one thing only. Art. 6.19 sets the maximum cornice ' +
                'height from a storey count; the city publishes a storey-like value beside those ' +
                'alignments; and it has never published what that value means. Measured against the ' +
                'buildings actually standing in the Ensanche, it does not behave like a simple ' +
                'maximum — so reading it one way would understate this plot and reading it the other ' +
                'would overstate it. There is no cautious choice available, only a guess. PRYZM has ' +
                'asked the municipality in writing and is waiting for the answer. ' +
                VALENCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}