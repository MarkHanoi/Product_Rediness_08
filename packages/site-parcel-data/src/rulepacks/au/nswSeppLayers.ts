// §NSW-SEPP-LAYERS — the SEPP service, classified, and the ONE structural fact that changes the
// engine: **most SEPP height control is not in the SEPP service at all. It is in Principal/14.**
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT (live 2026-09-04 — `phase0-transcripts/sepp-overlap2.json`, `p14-sepp-census.json`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder's acceptance criterion is *"a SEPP-covered parcel is never resolved LEP-alone"*, and
// the obvious implementation — "also query the SEPP service" — is **wrong twice over**. What the
// service actually does:
//
//   Principal/14 `EPI_TYPE` is a coded domain: `LEP` = 40,221 · `SEPP` = 743 · other = 0.
//   ⭐ **743 of 40,964 Height-of-Buildings polygons (1.81%) are SEPP-DRAWN and already live on the
//   principal layer.** An engine reading Principal/14 has been reading SEPP heights all along —
//   it simply could not SAY so, because it never read `EPI_TYPE`.
//
//   Sampling an interior point of every SEPP-service HOB polygon and asking Principal/14 what is
//   there (`sepp-overlap2.json` Q1, 94 polygons across ten layers):
//     SEPP/44 · 118 · 631 · 648 · 684 · 715 · 726 → **P14 returns exactly ONE polygon, and it is
//       the SEPP-drawn one, with the SAME value, on 100% of samples.** These SEPP layers are a
//       REPLICA of what Principal/14 already serves. Querying both double-counts one control.
//     SEPP/614 → 9 of 11 replica, 2 stacked.
//     SEPP/134 (State Significant Precincts) → **4 of 5 samples return TWO P14 polygons**:
//       `Parramatta LEP 2023` 20 m cl 4.3 **and** `SEPP (Precincts—Central River City) 2021` 6.
//       ⭐ **That is the real LEP+SEPP stack, and it arrives as two rows of ONE layer** — not as
//       an LEP layer plus a SEPP layer. A precedence engine partitioning by LAYER cannot see it.
//     SEPP/799 (Incentive HOB) → P14 returns 30 m / 24 m; the SEPP row says `"80-99.9"`.
//       **sameValue on 0 of 4.** This one is a genuinely ADDITIONAL control — an incentive.
//     SEPP/718 (Sydney Olympic Park Reduced Level) → **P14 returns NOTHING on 5 of 5.**
//       A SEPP control that exists ONLY in the SEPP service.
//
// ⛔ SO THE ACCEPTANCE CRITERION IS NOT SATISFIED BY ADDING A SERVICE. It is satisfied by reading
// `EPI_TYPE` on the layer already being read, and by adding only the SEPP layers that are NOT
// replicas. Adding all of them would have produced a second BASE control on ~1.8% of NSW parcels
// and driven them to a status-D refusal — a regression dressed as coverage.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ TWO SCHEMAS ON ONE SERVICE, AND THE SECOND ONE LIES ABOUT ITS DATUM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LEGACY schema (44, 118, 134, 614, 631, 648, 684, 278): **no `LAY_NAME` at all** (null on 100% of
//   features) — they carry `MAX_B_H` + `UNITS`, exactly like Principal/14.
// MODERN schema (713, 715, 718, 726, 798, 799, 800): `LAY_NAME` 100% populated, and `LAY_CLASS` is
//   **a SYMBOLOGY BAND, not a value** — `"80-99.9"`, `"30-34.9"`, `"5-5.99"`.
//
// ⛔ `nswNumber` already rejects a band (its regex admits only a plain decimal), so a band becomes
// `null` and the height becomes `uninterpretable`. That is SAFE and it is also a 16-metre loss:
// the fixture row carries `LAY_CLASS="80-99.9"` with `LABEL="96"`. **The precise value is in
// `LABEL` — sometimes.** On layer 718 the same field reads `"S"`. So `LABEL` is read only when it
// parses as a number AND falls inside its own band; anything else refuses. See `nswBandedValue`.
//
// P5-adjacent purity: pure data + pure total functions. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.4, C62, C63, C74 §0, C75.

/**
 * ⭐ THE FOUNDER'S CLASSIFICATION, applied to every SEPP layer this lane measured.
 *
 *  - `DIRECT`        — the polygon carries the control's own number for this parcel.
 *  - `APPLICABILITY` — the polygon says a control REACHES here; the number lives in the clause.
 *  - `GEOMETRIC`     — the polygon is a surface/solid the building must not pierce. Its numbers
 *                      are elevations of that surface, not a building height.
 *  - `TEXTUAL`       — the control is prose; no polygon attribute answers it.
 *  - `IRRELEVANT`    — the layer does not bear on the envelope at all.
 *  - `REPLICA`       — ⚠ the honest sixth. **Measured** to serve the identical value that
 *                      Principal/14 already serves at the same point. Reading it as well
 *                      double-counts one control into a false precedence conflict.
 */
export type NswSeppLayerClass =
    | 'DIRECT'
    | 'APPLICABILITY'
    | 'GEOMETRIC'
    | 'TEXTUAL'
    | 'IRRELEVANT'
    | 'REPLICA';

/** Which attribute schema a SEPP layer speaks. They do not share fields; see the header. */
export type NswSeppSchema = 'legacy-maxbh' | 'modern-layname';

export interface NswSeppLayerFacts {
    readonly layerId: number;
    readonly name: string;
    /** The SEPP chapter that drew it, as `EPI_NAME` serves it. */
    readonly instrument: string;
    readonly schema: NswSeppSchema;
    readonly classification: NswSeppLayerClass;
    /** Feature count measured 2026-09-04 (`sepp-inventory.json`). A census, not an invariant. */
    readonly features: number;
    /** `LEGIS_REF_CLAUSE` population, measured. */
    readonly citedFeatures: number;
    /**
     * For `REPLICA`: the measured overlap evidence, so the classification can be re-checked rather
     * than believed. `null` for every other class.
     */
    readonly replicaEvidence: string | null;
    /** Why this classification, in one sentence a reader can audit against the transcript. */
    readonly why: string;
}

/**
 * ⭐ THE MEASURED SEPP CATALOGUE. Every layer `m1-classified.json` found carrying features in the
 * vertical / floor-space / airspace family, re-probed live on 2026-09-04.
 *
 * ⛔ APPEND-ONLY, AND ONLY FROM A MEASUREMENT. A layer absent from this table is `UNCLASSIFIED`
 * and refuses — it is never assumed to be a height.
 */
export const NSW_SEPP_LAYER_FACTS: readonly NswSeppLayerFacts[] = Object.freeze([
    // ── REPLICAS. The same control, already on Principal/14. ──────────────────────────────────
    {
        layerId: 44,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (Gosford City Centre) 2018',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 156,
        citedFeatures: 156,
        replicaEvidence:
            'sepp-overlap2 Q1: 10/10 sampled polygons return exactly one Principal/14 hit, ' +
            'SEPP-drawn, same value, on 10/10. Cited "Clause 4.3" on 156/156 — the best-cited ' +
            'SEPP layer in the state.',
        why: 'Gosford City Centre HOB is served identically on Principal/14 with EPI_TYPE=SEPP.',
    },
    {
        layerId: 118,
        name: 'Height Of Building',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 184,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 12/12 one P14 hit, SEPP-drawn, same value on 12/12.',
        why: 'Growth Centres HOB is replicated onto Principal/14.',
    },
    {
        layerId: 614,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 76,
        citedFeatures: 0,
        replicaEvidence:
            'sepp-overlap2 Q1: 11 sampled · 9 one-hit (SEPP-drawn) · 2 two-hit · same value 11/11. ' +
            'The two-hit rows are a real LEP+SEPP stack and Principal/14 carries BOTH, so reading ' +
            'this layer as well would triple-count.',
        why: 'Replicated onto Principal/14, including on the stacked parcels.',
    },
    {
        layerId: 631,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 22,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 12/12 one P14 hit, SEPP-drawn, same value 12/12.',
        why: 'Replicated onto Principal/14.',
    },
    {
        layerId: 648,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 13,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 12/12 one P14 hit, SEPP-drawn, same value 12/12.',
        why: 'Replicated onto Principal/14.',
    },
    {
        layerId: 684,
        name: 'Height Of Building',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 208,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 12/12 one P14 hit, SEPP-drawn, same value 12/12.',
        why: 'Replicated onto Principal/14.',
    },
    {
        layerId: 715,
        name: 'Height Of Building',
        instrument: 'State Environmental Planning Policy (Precincts—Central River City) 2021',
        schema: 'modern-layname',
        classification: 'REPLICA',
        features: 68,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 10/10 one P14 hit, SEPP-drawn, same value 10/10.',
        why:
            'Replicated onto Principal/14, which serves the PRECISE metre value while this layer ' +
            'serves only the symbology band (LAY_CLASS "80-99.9"). ⚠ Preferring the SEPP row here ' +
            'would LOSE precision as well as double-count.',
    },
    {
        layerId: 726,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (Transport and Infrastructure) 2021',
        schema: 'modern-layname',
        classification: 'REPLICA',
        features: 4,
        citedFeatures: 0,
        replicaEvidence: 'sepp-overlap2 Q1: 4/4 one P14 hit, SEPP-drawn, same value 4/4.',
        why: 'Replicated onto Principal/14.',
    },
    {
        layerId: 134,
        name: 'Height of Building',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 7,
        citedFeatures: 0,
        replicaEvidence:
            'sepp-overlap2 Q1: 5 sampled · 4 return TWO Principal/14 polygons (Parramatta LEP 2023 ' +
            '20 m cl 4.3 + SEPP Central River City) · same value 5/5. ⭐ Principal/14 carries BOTH ' +
            'sides of the stack, so the stack is visible without this layer.',
        why: 'Replicated onto Principal/14, stack included.',
    },

    // ── NOT REPLICAS. These add something Principal/14 does not have. ─────────────────────────
    {
        layerId: 799,
        name: 'Incentive Height of Buildings Map',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'modern-layname',
        classification: 'DIRECT',
        features: 4,
        citedFeatures: 0,
        replicaEvidence: null,
        why:
            'sepp-overlap2 Q1: 4/4 sampled return a Principal/14 hit of 30 m or 24 m while this ' +
            'layer says "80-99.9" — same value on 0 of 4. ⭐ A genuinely ADDITIONAL control, and ' +
            'the clause says what it is: SEPP (Precincts—Western Parkland City) 2021 s 6.16(3), ' +
            '"Despite section 4.3, the maximum height of a building RESULTING FROM INCENTIVISED ' +
            'DEVELOPMENT … is the height shown on the Incentive Height of Buildings Map." ' +
            'CONDITIONAL, never an entitlement.',
    },
    {
        layerId: 718,
        name: 'Reduced Level',
        instrument: 'State Environmental Planning Policy (Precincts—Central River City) 2021',
        schema: 'modern-layname',
        classification: 'DIRECT',
        features: 5,
        citedFeatures: 0,
        replicaEvidence: null,
        why:
            '⭐ THE ONLY MEASURED SEPP HEIGHT CONTROL THAT PRINCIPAL/14 DOES NOT CARRY — p14-sepp-census ' +
            'rl718: 5 of 5 interior points return NO Principal/14 polygon. ⛔ AND ITS DATUM IS ' +
            'CONTESTED BY ITS OWN ATTRIBUTES: LAY_NAME "Maximum Building Height (m)" and UNITS "m" ' +
            'against MAP_TYPE "RDL" and MAP_NAME "…Sydney Olympic Park REDUCED LEVEL Map", where a ' +
            '"reduced level" is a surveying term for an AHD elevation. See `nswReducedLevelConflict`.',
    },
    {
        layerId: 278,
        name: 'Obstacle Limitation Surface',
        instrument: 'State Environmental Planning Policy (Western Sydney Aerotropolis) 2020',
        schema: 'legacy-maxbh',
        classification: 'GEOMETRIC',
        features: 113,
        citedFeatures: 0,
        replicaEvidence: null,
        why:
            'Serves MINIMUM_HEIGHT / MAXIMUM_HEIGHT (150–230.5) and COMMENTS "Horizontal" / ' +
            '"Conical" — the elevations of an aviation obstacle-limitation surface, not a building ' +
            'height. The clause is SEPP (Precincts—Western Parkland City) 2021 s 4.22, which does ' +
            'not state a height at all: it says consent "must not be granted … unless the consent ' +
            'authority is satisfied the development will not compromise" the surface. ' +
            '⛔ A discretionary prohibition, not a number to intersect.',
    },

    // ── FLOOR SPACE. Recorded so the FSR half is classified rather than assumed. ──────────────
    {
        layerId: 43,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (Gosford City Centre) 2018',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 131,
        citedFeatures: 131,
        replicaEvidence:
            'Principal/11 serves the Gosford FSR at the same points with EPI_TYPE=SEPP and the ' +
            'same "Clause 4.4" citation (fixture `gosford-regional-mrl-cited`).',
        why: 'Cited on 131/131 — the only fully cited SEPP FSR layer measured.',
    },
    {
        layerId: 713,
        name: 'Floor Space Ratio',
        instrument: 'State Environmental Planning Policy (Precincts—Central River City) 2021',
        schema: 'modern-layname',
        classification: 'REPLICA',
        features: 63,
        citedFeatures: 63,
        replicaEvidence: 'Principal/11 carries the Central River City FSR (fixture `parramatta-north-ssp-stack`).',
        why:
            'Cited "Clause 4.4" on 63/63, but LAY_CLASS is a BAND ("5-5.99", "1.2-1.29"). ' +
            '⛔ A banded FSR is not an FSR: 5-5.99 spans a fifth of the yield it purports to state.',
    },
    {
        layerId: 800,
        name: 'Incentive Floor Space Ratio Map',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'modern-layname',
        classification: 'DIRECT',
        features: 4,
        citedFeatures: 0,
        replicaEvidence: null,
        why:
            'The FSR twin of layer 799, under the same s 6.16 — s 6.16(4): "Despite section 4.4, the ' +
            'maximum floor space ratio of buildings resulting from incentivised development … is ' +
            'the floor space ratio shown on the Incentive Floor Space Ratio Map." CONDITIONAL.',
    },
    {
        layerId: 798,
        name: 'Minimum Non-Residential Floor Space Map',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'modern-layname',
        classification: 'IRRELEVANT',
        features: 10,
        citedFeatures: 0,
        replicaEvidence: null,
        why:
            'A MINIMUM non-residential FSR (LAY_CLASS 0.25 on 10/10). It compels a floor-space MIX; ' +
            'it does not cap the envelope. ⚠ IRRELEVANT to the envelope TOP is not irrelevant to ' +
            'the brief — it binds the programme, and belongs to whichever lane owns use mix.',
    },
    {
        layerId: 116,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 71,
        citedFeatures: 0,
        replicaEvidence: 'Same instrument and schema family as layer 118, which measured 12/12 replica.',
        why: 'Growth Centres FSR; Principal/11 carries the SEPP-drawn rows.',
    },
    {
        layerId: 611,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 23,
        citedFeatures: 0,
        replicaEvidence: 'Same instrument and schema family as layer 614, which measured 9/11 replica.',
        why: 'State Significant Precincts FSR.',
    },
    {
        layerId: 628,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 6,
        citedFeatures: 0,
        replicaEvidence: 'Same instrument and schema family as layer 631, which measured 12/12 replica.',
        why: 'State Significant Precincts FSR.',
    },
    {
        layerId: 645,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (State Significant Precincts) 2005',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 2,
        citedFeatures: 0,
        replicaEvidence: 'Same instrument and schema family as layer 648, which measured 12/12 replica.',
        why: 'State Significant Precincts FSR.',
    },
    {
        layerId: 682,
        name: 'Floor Space Ratio (n:1)',
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        schema: 'legacy-maxbh',
        classification: 'REPLICA',
        features: 63,
        citedFeatures: 0,
        replicaEvidence: 'Same instrument and schema family as layer 684, which measured 12/12 replica.',
        why: 'Growth Centres FSR.',
    },
]);

const BY_ID: ReadonlyMap<number, NswSeppLayerFacts> = new Map(
    NSW_SEPP_LAYER_FACTS.map((f) => [f.layerId, f]),
);

/** Look up one SEPP-service layer. `null` = unclassified, which is a REFUSAL, never a default. */
export function nswSeppLayer(layerId: number): NswSeppLayerFacts | null {
    return BY_ID.get(layerId) ?? null;
}

/**
 * ⛔ THE DE-DUPLICATION PREDICATE. `true` when this SEPP-service layer was MEASURED to serve a
 * control that Principal/14 (or /11) already serves at the same point.
 *
 * ⚠ Reading a replica alongside the principal layer manufactures a second BASE control, which the
 * resolver correctly refuses as a status-D precedence conflict — so the visible symptom of getting
 * this wrong is not a wrong number, it is a REFUSAL on ~1.8% of NSW parcels that were previously
 * answerable. A regression dressed as coverage is the hardest kind to notice.
 */
export function isNswSeppReplica(layerId: number): boolean {
    return nswSeppLayer(layerId)?.classification === 'REPLICA';
}

/** The SEPP-service layers that add a control Principal/14 does not carry. The ones to fetch. */
export const NSW_SEPP_NON_REPLICA_LAYERS: readonly number[] = Object.freeze(
    NSW_SEPP_LAYER_FACTS.filter((f) => f.classification !== 'REPLICA' && f.classification !== 'IRRELEVANT').map(
        (f) => f.layerId,
    ),
);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE BANDED `LAY_CLASS`, AND THE CROSS-CHECK THAT MAKES READING `LABEL` DEFENSIBLE
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A `LAY_CLASS` band, parsed. `"80-99.9"` → `{ lo: 80, hi: 99.9 }`. */
export interface NswValueBand {
    readonly lo: number;
    readonly hi: number;
    readonly raw: string;
}

/**
 * Parse a symbology band. Returns `null` for anything that is not `<num>-<num>` — including a
 * plain number, which is NOT a band and must take the ordinary numeric path.
 *
 * ⛔ `"9-9.9"` is a band and `"9"` is a value. One hyphen apart, and they are different facts.
 */
export function nswParseBand(layClass: string | null | undefined): NswValueBand | null {
    const t = layClass?.trim() ?? '';
    const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(t);
    const lo = m?.[1];
    const hi = m?.[2];
    if (lo === undefined || hi === undefined) return null;
    const l = Number(lo);
    const h = Number(hi);
    if (!Number.isFinite(l) || !Number.isFinite(h) || h < l) return null;
    return { lo: l, hi: h, raw: t };
}

/** What a banded modern-schema SEPP row resolved to. A closed result, never a bare number. */
export type NswBandedValue =
    | { readonly kind: 'exact'; readonly value: number; readonly band: NswValueBand; readonly from: 'LABEL' }
    | { readonly kind: 'band-only'; readonly band: NswValueBand; readonly reason: string }
    | { readonly kind: 'not-banded' };

/**
 * ⭐ RECOVER THE PRECISE VALUE FROM `LABEL`, BUT ONLY WHEN THE BAND CORROBORATES IT.
 *
 * Measured on the captured fixture row (`nsw-sepp-2026-09-04.json`, `growth-centres-incentive-hob`):
 * SEPP/799 serves `LAY_CLASS="80-99.9"`, `LABEL="96"`, `SYM_CODE="AB"`. The band is a 20-metre
 * range; the label is the number. Reading the band's low end understates by 16 m and its high end
 * overstates by 3.9 m — on a control that is already a conditional uplift.
 *
 * ⛔ AND `LABEL` IS NOT ALWAYS A NUMBER. On layer 718 the same field reads `"S"`. So `LABEL` is
 * accepted ONLY when it parses as a finite number **and falls inside its own band** — two
 * independent readings of one fact agreeing, which is the §PROBE-CAN-BE-WRONG-THREE-WAYS standard.
 * A label outside its band is a schema surprise and refuses: it means one of the two fields means
 * something other than what we think, and picking a winner would discard the warning.
 */
export function nswBandedValue(
    layClass: string | null | undefined,
    label: string | null | undefined,
): NswBandedValue {
    const band = nswParseBand(layClass);
    if (!band) return { kind: 'not-banded' };
    const raw = label?.trim() ?? '';
    if (raw === '') {
        return {
            kind: 'band-only',
            band,
            reason:
                `LAY_CLASS ${JSON.stringify(band.raw)} is a symbology BAND, not a value, and no LABEL ` +
                'was served to resolve it. The control spans ' +
                `${band.hi - band.lo} units and is reported, not applied.`,
        };
    }
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
        return {
            kind: 'band-only',
            band,
            reason:
                `LAY_CLASS ${JSON.stringify(band.raw)} is a symbology BAND and LABEL ` +
                `${JSON.stringify(raw)} is not a number (on layer 718 the same field reads "S"). ` +
                'The precise value is not recoverable from the served attributes.',
        };
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < band.lo || v > band.hi) {
        return {
            kind: 'band-only',
            band,
            reason:
                `LABEL ${JSON.stringify(raw)} falls OUTSIDE its own LAY_CLASS band ` +
                `${JSON.stringify(band.raw)}. Two served fields disagree about one number; one of ` +
                'them does not mean what this reader thinks. Reported, not applied — choosing a ' +
                'winner here would discard the warning.',
        };
    }
    return { kind: 'exact', value: v, band, from: 'LABEL' };
}

/**
 * ⛔ THE LAYER-718 DATUM CONFLICT, AS A NAMED FACT RATHER THAN A SILENT CHOICE.
 *
 * `null` when the row is not a Reduced Level row. Otherwise the sentence a reader is owed.
 *
 * Sydney Olympic Park sits on reclaimed land at roughly RL 5–10 m AHD. Reading `LAY_CLASS="23"`
 * as 23 m above existing ground where the clause means RL 23 AHD overstates by the whole ground
 * elevation; reading it the other way understates by the same amount. **The clause names the map
 * separately from the Height of Buildings Map** — SEPP (Precincts—Central River City) 2021,
 * Appendix (Sydney Olympic Park) s 18: *"The height of a building … is not to exceed the maximum
 * height shown for the land on the Height of Buildings Map **or the Reduced Level Map, whichever
 * is applicable**."* Two maps, two datums, and the attribute set claims only one of them.
 *
 * ⚠ THIS IS NOT RESOLVED HERE ON PURPOSE. Three readings say AHD (`MAP_TYPE`, `MAP_NAME`, the
 * clause's separate treatment) and two say metres (`LAY_NAME`, `UNITS`). A 3–2 vote is not a legal
 * determination; it is a reason to refuse and to say why.
 */
export function nswReducedLevelConflict(
    mapType: string | null | undefined,
    mapName: string | null | undefined,
    layName: string | null | undefined,
    units: string | null | undefined,
): string | null {
    const isRdl = (mapType?.trim() ?? '') === 'RDL' || /reduced level/i.test(mapName ?? '');
    if (!isRdl) return null;
    const claimsMetres = /\(m\)\s*$/.test(layName?.trim() ?? '') || (units?.trim() ?? '') === 'm';
    if (!claimsMetres) return null;
    return (
        'DATUM CONTESTED BY THE SERVICE ITSELF — this feature is on a REDUCED LEVEL map ' +
        `(MAP_TYPE=${JSON.stringify(mapType ?? null)}, MAP_NAME=${JSON.stringify(mapName ?? null)}), ` +
        'and a "reduced level" is an elevation in the Australian Height Datum, while ' +
        `LAY_NAME=${JSON.stringify(layName ?? null)} and UNITS=${JSON.stringify(units ?? null)} ` +
        'claim metres above ground. SEPP (Precincts—Central River City) 2021, Appendix (Sydney ' +
        'Olympic Park) s 18 names the Reduced Level Map SEPARATELY from the Height of Buildings ' +
        'Map, "whichever is applicable". Three readings say AHD and two say metres; that is a ' +
        'reason to refuse, not a majority to act on. The value is reported and NOT applied.'
    );
}
