// PARIS (Ville de Paris, INSEE 75056) — the PLU bioclimatique rule pack: a zone-ID + hauteur
// DECLARATION with a cited envelope REFUSAL by default. Madrid/Switzerland shape (a registered
// jurisdiction that refuses the parts it cannot cite, honestly).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONEST SPLIT (PARIS-PLU-DATA probe, live 2026-07-25 — see `resolveParisPluZone.ts` header)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A Paris parcel has THREE fidelity tiers and this pack keeps them apart:
//   • ZONE IDENTITY  — structured (GPU `zone_urba`): code `UG`, label, the règlement doc.
//   • HAUTEUR PLAFOND — structured & NUMERIC (opendata `plub_hauteur`): 18 / 25 / 31 / 37 m.
//   • EMPRISE / GABARIT / rear-cour — PDF-BOUND: NO structured coverage field exists anywhere.
//
// So the honest buildable envelope for a UG parcel is a HYBRID: we hold a real hauteur but NOT a real
// emprise. Applying the hauteur to the FULL parcel footprint (emprise = the parcel, ordre continu /
// built-to-alignment fabric) is a defensible MASSING CAP, but the "emprise = whole parcel" step is an
// ASSUMPTION, not published data — so it is gated behind a human certification (`FR_PARIS_PLU_CERTIFIED`,
// default OFF). While closed, `parisPluEnvelopeRefusal` carries the REAL zone + REAL hauteur as
// knownFacts and names the règlement for the missing emprise/gabarit — a big upgrade over the bare
// estimated triple, and never a fabricated coverage (C58 §1.4, the §CONTEXT-DATA-HONESTY family:
// a REFUSAL and a FABRICATION must not collapse to the same value).
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context — C58 §1.2/§1.4/§1.5/§2.2, ADR-0270,
// the Switzerland Outcome-B precedent (`chZoning.ts`), and the Madrid `estimated-ruleset` discipline.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
    type EnvelopeConfidence,
    type Pt,
} from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import type {
    ParisZoneIdentification,
    ParisEnvelopeInputs,
    ParisLonLat,
} from '../providers/resolveParisPluZone.js';

/** The jurisdiction id the Paris pack + records use — equals the commune identity (INSEE 75056). */
export const PARIS_JURISDICTION_ID = 'fr-75056-paris';

/**
 * ⚠⚠ THE CERTIFICATION GATE. **NOW ON (2026-07-26).**
 *
 * ── SEMANTICS (the STRUCTURED-DATA-FIRST upgrade) ─────────────────────────────────────────────
 * The engine no longer fabricates an emprise. `computeParisEnvelope` (below) builds the envelope
 * from the PUBLISHED `plub_ecm` buildable-FOOTPRINT POLYGON — real geometry, extruded to the published
 * height ceiling — and refuses honestly per component where the data is absent (no ECM ⇒ footprint
 * refused; cour=X ⇒ a cited PARTIAL crown refusal, art. UG.3.2.4). So the "ONE assumption the data
 * cannot supply" (emprise = the parcel) is GONE — it was replaced by real published geometry, not
 * signed off. This gate therefore no longer guards a fabrication; it is the founder switch that
 * AUTHORISES drawing the structured ECM volume in the UI.
 *
 * FLIP CRITERION (met): (a) the test parcel reproduces the ECM footprint + height (proven live — see
 * the pack test), and (b) every remaining UG.3 component either resolves structurally or carries an
 * explicit citation — which `computeParisEnvelope` guarantees BY CONSTRUCTION (the couronnement is
 * always either resolved or a cited UG.3.2.4 refusal). Both criteria hold, so the gate is ON.
 *
 * ── WHY ON IS NOW SAFE ────────────────────────────────────────────────────────────────────────
 * The L5 editor dispatcher (`apps/editor/.../siteDispatch.ts`) has been repointed off the OLD
 * fabricated parcel×hauteur massing cap and onto `resolveParisEnvelope` + `computeParisEnvelope`: it
 * DRAWS the published ECM footprint extruded to the published height and REFUSES honestly (cited) where
 * no ECM polygon covers the point. There is no longer a fabrication for this flag to gate — turning it
 * ON ships REAL geometry, not the emprise=parcel assumption. Same discipline as `MADRID_NZ1_CERTIFIED`
 * / `NL_BESTEMMINGSPLAN_CERTIFIED` (both ON: the ordinance publishes the footprint as geometry).
 *
 * ⛔ SHUT 2026-08-02 — UNSIGNED, AND SPAIN IS THE FOCUS. §UNSIGNED-GATE-DEFAULTS-SHUT.
 *
 * This gate was ON with `signature: null` — it published numeric envelopes with NO human signature
 * behind them, in an ordinance corpus NOBODY ON THIS PROJECT HAS READ. That is the L-616 defect in
 * its purest form: a number carrying legal weight and no legal basis. Barcelona was withheld for
 * less, and Barcelona's corpus HAS been read.
 *
 * ⚠ THE HONEST FINDING, so reopening is not blocked by a false record: the numbers here are NOT
 * fabricated. The dispatcher draws the PUBLISHED ECM footprint extruded to the PUBLISHED hauteur
 * (`plub_hauteur`), and the emprise=parcel assumption this flag once gated is GONE. The defect is
 * the MISSING SIGNATURE, not the data.
 *
 * COVERAGE EFFECT — bounded, and it is not a coverage loss in the determination sense: while shut,
 * `parisPluEnvelopeRefusal` still carries the REAL zone + REAL hauteur as a CITED refusal. The
 * DETERMINATION survives; only the drawn ENVELOPE stops. Per ADR-0283 a cited refusal is a valid
 * output, so what is lost is envelope coverage over Ville de Paris (INSEE 75056, zone UG, which the
 * PLU-b covers over almost the whole commune) — coverage that was never legitimately publishable.
 *
 * TO REOPEN, a signature must assert THREE things, none of which is currently established:
 *   1. that zone UG's `ordre continu` reading is correct for the parcels we draw on;
 *   2. that the published ECM ring is the governing emprise and not an indicative one; and
 *   3. that `plub_hauteur` (UG.3.2.1) is the operative ceiling, unmodified by the HMC (UG.3.2.2),
 *      the `filet`, or a servitude the pack does not read.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (FR_PARIS_PLU_CERTIFIED)` draw
 * branch is not narrowed away as dead code while the gate is shut.)
 */
export const FR_PARIS_PLU_CERTIFIED: boolean = false;

/**
 * The govern­ing citation carried on the refusal — cites the DATA sources and the règlement DOCUMENT,
 * never a fabricated number. The doc name is filled per-parcel from the resolved zone when available.
 */
export const PARIS_PLU_ORDINANCE_REF =
    'Paris — PLU bioclimatique (Ville de Paris, INSEE 75056; règlement voted by the Conseil de ' +
    'Paris, living text 16-06-2026, idurba 75056_PLU_20260616). Zone identity is read from the ' +
    'Géoportail de l\'urbanisme national WFS (data.geopf.fr wfs_du:zone_urba); the hauteur plafond ' +
    '(UG.3.2.1) from Paris opendata plub_hauteur; the HMC (UG.3.2.2) from plub_hmc; and the filet / ' +
    'gabarit-enveloppe frontage from plub_filet — all verified live 2026-07-25. The LEGAL authority is ' +
    'the règlement PDF (75056_reglement_20260616.pdf); the Paris opendata layers are informational ' +
    'graphic annexes of it. The emprise au sol, the emprise géométrique, the gabarit-enveloppe taper ' +
    'and the rear-courtyard rule are NOT published as structured data; they live in the règlement, ' +
    'which is why the buildable footprint is not asserted from the sources alone.';

/**
 * The PLU zone this pack authors a massing rule for: `UG` (Zone urbaine générale) — the general urban
 * zone that, per the PLU-b, covers almost the whole commune and is ordre-continu fabric (façades on
 * the alignment, party walls on the sides). It is the ONLY zone for which "emprise = the parcel" is a
 * defensible massing cap; UV (urbaine verte), N, and the secteur sauvegardé (US, governed by a separate
 * PSMV) are NOT — they keep the cited refusal even when the gate is open.
 */
export const FR_PARIS_UG_ZONE_CODE = 'UG' as const;

/**
 * The zone entry. `maxHeight_m` is `null` in the pack — the hauteur is resolved LIVE per parcel from
 * `plub_hauteur` and injected by the dispatcher (like Madrid's per-manzana COEF_Z), never a constant.
 * `setbacks` are 0/0/0: for UG ordre-continu fabric the buildable footprint is the parcel itself (the
 * emprise cap the human certifies). Every other numeric field stays null — the règlement states them,
 * the data does not.
 */
function parisUgZone() {
    return {
        code: FR_PARIS_UG_ZONE_CODE,
        label: 'Zone urbaine générale (UG) — PLU bioclimatique de Paris',
        permittedUse: ['residential', 'mixed'] as const,
        maxHeight_m: null, // resolved live from plub_hauteur; NEVER a pack constant.
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null, // emprise is PDF-bound — NEVER a fabricated ratio.
        // 0/0/0 = the parcel footprint is the massing cap (ordre continu). Only USED behind the cert.
        setbacks: { front_m: 0, side_m: 0, rear_m: 0 },
        geometricRule: null, // legacy inset from the 0/0/0 setbacks = the full parcel.
        fieldProvenance: {
            // The hauteur is real published DATA; the 0/0/0 emprise is the CERTIFIED assumption, not a
            // cited number — flagged estimated so no chip ever reads it as an ordinance figure.
            maxHeight: 'published-structured' as const,
        },
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
    };
}

/**
 * The Paris PLU bioclimatique pack. `defaultConfidence: 'estimated-ruleset'` — a pack cannot
 * self-certify (the zone-ID earns `structured` at the PROVIDER, not here), and the envelope is a
 * massing cap under an assumed emprise, so it never rises above the ruleset tier. Parsed at load so a
 * shape error fails fast (like every pack).
 */
export const FR_PARIS_PLU_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: PARIS_JURISDICTION_ID,
    displayName: 'Paris — PLU bioclimatique (zone UG massing cap)',
    source: 'manual', // curated from the GPU/opendata probe; not one of the named pipeline sources.
    crs: 'EPSG:4326', // the sources publish WGS84 (informational; the engine works scene-XZ).
    lastReviewed: '2026-07-25',
    defaultConfidence: 'estimated-ruleset',
    zones: [parisUgZone()],
});

/** True when this zone code is the one the pack authors a certified height massing for (UG only). */
export function parisUgHeightMassingSupported(zoneCode: string | null | undefined): boolean {
    return typeof zoneCode === 'string' && zoneCode.trim().toUpperCase() === FR_PARIS_UG_ZONE_CODE;
}

/** A non-empty zone code for the refusal envelope: the real PLU code, else a stable source tag. */
export function parisZoneCodeFor(zone: ParisZoneIdentification | null | undefined): string {
    const code = zone?.zoneCode?.trim();
    return code && code.length > 0 ? code : 'fr-paris-plu';
}

/** A human zone label for logs/derivation (e.g. `Zone urbaine générale (UG)`), or a stable fallback. */
export function parisZoneLabelFor(zone: ParisZoneIdentification | null | undefined): string {
    const label = zone?.zoneLabel?.trim();
    const code = zone?.zoneCode?.trim();
    if (label && code) return `${label} (${code})`;
    if (label) return label;
    if (code) return code;
    return 'Paris PLU zone';
}

/**
 * The structured facts an enriched refusal carries beyond the zone + height ceiling. Each is a real
 * published value the resolver read (or a null-honest withheld) — NEVER a fabricated figure.
 */
export interface ParisPluRefusalExtras {
    /** HMC (Hauteur Maximale Constructible, UG.3.2.2) in metres, or null (no overlay at the point). */
    readonly hmc_m?: number | null;
    /** The datum of `hmc_m` (e.g. `NGF` = absolute altitude, not a metres-above-ground height). */
    readonly hmcDatum?: string | null;
    /** The nearest filet frontage `haut` code (e.g. `N`), or null. */
    readonly filetCode?: string | null;
    /** The filet frontage height in metres mapped from the code, or null (`M`/unknown). */
    readonly filetFrontageHeight_m?: number | null;
    /** The PLU dataset version `YYYY-MM-DD` derived from the plan `idurba`, or null. */
    readonly sourceVersion?: string | null;
}

/**
 * The rules the PLU-b règlement states but does NOT publish as structured data — the cumulative UG.3
 * apparatus that (together, not a parcel×height product) yields the theoretical buildable volume. Named
 * on the refusal so the user sees precisely WHICH legal inputs are withheld, not a vague "unavailable".
 */
export const PARIS_PLU_MISSING_RULES = [
    'emprise_au_sol',
    'emprise_geometrique',
    'gabarit_enveloppe',
    'cumulative_UG3_rules',
] as const;

/** Build the `knownFacts` lines that make the identified zone + structured facts LEGIBLE on the card (L-553). */
function parisPluFacts(
    zone: ParisZoneIdentification | null | undefined,
    heightCeiling_m: number | null,
    extras: ParisPluRefusalExtras = {},
): string[] {
    const facts: string[] = [];
    if (zone) {
        facts.push(`Zone: ${parisZoneLabelFor(zone)}`);
        if (zone.typeZone) facts.push(`Zone type: ${zone.typeZone}`);
        if (zone.planId) facts.push(`Plan: ${zone.planId}`);
    }
    // The height CEILING is REAL published data (plub_hauteur) — carry it even though the envelope refuses.
    // ⚠ It is the plafond (UG.3.2.1), NOT a max building height.
    if (heightCeiling_m !== null) {
        facts.push(`Height ceiling (plafond): ${heightCeiling_m} m (opendata plub_hauteur, UG.3.2.1)`);
    }
    // HMC is a DISTINCT ceiling (UG.3.2.2) — carry its datum so an NGF altitude is not misread as a height.
    if (extras.hmc_m != null) {
        const datum = extras.hmcDatum ? ` ${extras.hmcDatum}` : '';
        facts.push(`HMC (hauteur max. constructible): ${extras.hmc_m} m${datum} (opendata plub_hmc, UG.3.2.2)`);
    }
    // Filet frontage gabarit — the nearest frontage marking (informational), raw code + mapped metres.
    if (extras.filetCode) {
        const metres =
            extras.filetFrontageHeight_m != null
                ? `${extras.filetFrontageHeight_m} m`
                : 'same as existing façade';
        facts.push(`Filet (frontage gabarit): code ${extras.filetCode} → ${metres} (opendata plub_filet)`);
    }
    if (extras.sourceVersion) {
        facts.push(`PLU version: ${extras.sourceVersion}`);
    }
    return facts;
}

/**
 * The Paris buildable-envelope REFUSAL — the current shipping output for a Paris parcel while the cert
 * gate is closed (and the honest output, even open, for any zone but UG or any parcel with no height).
 *
 * ⚠ THIS, NOT A NUMBER, IS WHAT A PARIS PARCEL GETS BY DEFAULT. The zone is identified and the hauteur
 * plafond is READ (both carried in `knownFacts` so the user sees them), but the emprise au sol / gabarit
 * that would close the buildable footprint are PDF-bound, so PRYZM declines to draw a volume rather than
 * fabricate a coverage. It is NOT a bare estimate: it names the user's real zone AND their real height
 * ceiling, and cites the règlement for the one thing it withholds.
 *
 * `code: 'source-data-unavailable'` — the precise class: the zone (and the law) is known and the
 * height is read; what is missing is a STRUCTURED emprise/gabarit for this parcel, a statement about
 * the available data path (the sources publish zone + height but not coverage), not about the ordinance.
 * Hence `legallyGrounded: false`. `ordinanceRef` cites the PLU-b for the claims we DO make (the zone,
 * the height, the fact that emprise is PDF-bound), never for a coverage number.
 *
 * @param zone            the identified PLU zone (its fields become facts); null on a WFS miss.
 * @param heightCeiling_m the real published height ceiling (plafond, UG.3.2.1) in metres, or null.
 * @param extraFacts      additional per-parcel facts the caller holds (address, area, coordinates).
 * @param extras          the further structured facts the resolver read — HMC, filet, source version.
 */
export function parisPluEnvelopeRefusal(
    zone: ParisZoneIdentification | null | undefined = null,
    heightCeiling_m: number | null = null,
    extraFacts: readonly string[] = [],
    extras: ParisPluRefusalExtras = {},
): EnvelopeRefusal {
    const identified = zone != null;
    const doc = zone?.reglementDoc ? ` (règlement ${zone.reglementDoc})` : '';
    // Legible summary of the structured facts found, for the headline.
    const found: string[] = [];
    if (heightCeiling_m !== null) found.push(`a ${heightCeiling_m} m height ceiling`);
    if (extras.hmc_m != null) found.push(`HMC ${extras.hmc_m} m${extras.hmcDatum ? ` ${extras.hmcDatum}` : ''}`);
    if (extras.filetCode) {
        const m = extras.filetFrontageHeight_m != null ? `${extras.filetFrontageHeight_m} m` : 'façade-matched';
        found.push(`filet ${extras.filetCode} (${m})`);
    }
    const foundClause = found.length > 0 ? ` with ${found.join(', ')}` : '';
    return {
        code: 'source-data-unavailable',
        headline: identified
            ? `Zone identified (${parisZoneLabelFor(zone)})${foundClause} — but the buildable volume is ` +
              'not computed: the PLU requires cumulative implantation/emprise/gabarit rules.'
            : 'Paris — the buildable envelope could not be resolved for this parcel.',
        detail:
            'PRYZM reads the Paris PLU zone from the Géoportail de l\'urbanisme WFS and, from Paris ' +
            'opendata, the hauteur plafond (plub_hauteur, UG.3.2.1), the HMC (plub_hmc, UG.3.2.2) and the ' +
            'nearest filet frontage gabarit (plub_filet) — all shown above where present. What is NOT ' +
            'published as structured data is the emprise au sol, the emprise géométrique, the gabarit-' +
            'enveloppe taper and the rear-courtyard rule — those live only in the PLU bioclimatique ' +
            'règlement' + doc + ', article UG.3/UG.4 (missing: ' + PARIS_PLU_MISSING_RULES.join(', ') + '). ' +
            'The règlement is explicit that the theoretical maximum volume results from the CUMULATIVE ' +
            'application of the UG.3 implantation/emprise/gabarit rules — a parcel-footprint × height ' +
            'product is NOT equivalent and PRYZM will not ship it as if it were. So rather than fabricate ' +
            'a ground-coverage ratio to close the footprint, PRYZM declines to draw a volume: the zone and ' +
            'the height facts are shown, but the envelope is withheld because its footprint cannot be cited yet.',
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...parisPluFacts(zone, heightCeiling_m, extras), ...extraFacts],
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE STRUCTURED-DATA-FIRST ENVELOPE ENGINE — `computeParisEnvelope`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This REPLACES the old "cited refusal, no volume" (and the fabricated parcel×hauteur massing cap)
// with a REAL computed envelope built from the published `plub_ecm` FOOTPRINT POLYGON:
//
//   footprint = the ECM polygon  (geometry — NEVER parcel×emprise%, NEVER parcel×height)
//   height    = min(published height ceiling, ECM graphic height, HMC-as-height where derivable)
//   volume    = extrude(footprint) → height,  minus any EAL liberation strips
//
// It is honest PER COMPONENT (§CONTEXT-DATA-HONESTY): where the ECM polygon is absent it REFUSES the
// footprint (never a guess); where the crown code is `X` (continuous, art. UG.3.2.4, PDF-bound) it
// ships the straight extrusion AND carries a cited PARTIAL refusal for the couronnement — it does NOT
// invent the taper. PURE + deterministic (C58 §1.1/§1.9): all I/O is upstream in `resolveParisEnvelope`.

/** The `couronnement` (crown) component id named on `missingRules` when the crown is PDF-bound (cour=X). */
export const PARIS_ECM_MISSING_COURONNEMENT = 'couronnement_UG324' as const;

/** The article that governs the continuous-crown geometry — the ONE genuinely PDF-bound component. */
export const PARIS_UG324_CROWN_REF =
    'Paris PLU bioclimatique règlement, article UG.3.2.4 (couronnement / crown geometry for ordre ' +
    'continu — filet cour code X). The continuous-crown taper is stated only in the règlement PDF and ' +
    'is NOT published as structured data, so PRYZM ships the straight extrusion to the height ceiling ' +
    'and declines to invent the crown geometry.';

/** Per-component fidelity of a computed Paris envelope — each is `structured` (real data) or `refused`. */
export type ParisEnvelopeComponentStatus = 'structured' | 'refused';

export interface ParisEnvelopeComponents {
    /** The buildable footprint — `structured` (ECM polygon resolved) or `refused` (no ECM here). */
    readonly footprint: ParisEnvelopeComponentStatus;
    /** The vertical extent — `structured` (a published height resolved) or `refused` (none). */
    readonly height: ParisEnvelopeComponentStatus;
    /** The crown — `structured` (pitched/known crown, or none) or `refused` (cour=X → art. UG.3.2.4). */
    readonly couronnement: ParisEnvelopeComponentStatus;
}

/** Which published field bound the extrusion height, for the derivation/explain-why. */
export type ParisHeightBinding = 'height-ceiling' | 'ecm-graphic' | 'hmc-relative';

export type ParisEnvelopeResult =
    | {
          readonly ok: true;
          /**
           * The buildable-footprint polygon in LOCAL ENU metres about its own centroid (equirectangular
           * projection of the ECM ring). The L5 dispatcher re-anchors it to the parcel scene frame; the
           * SHAPE + AREA are frame-invariant and reproduce the source `st_area_shape`.
           */
          readonly footprintPolygon: Pt[];
          /** `area(footprintPolygon)` before any EAL subtraction, in m². */
          readonly grossFootprintAreaM2: number;
          /** The net buildable footprint (gross − EAL) in m² — what the volume is computed on. */
          readonly footprintAreaM2: number;
          /** The extrusion height in m (min of the resolved published candidates). */
          readonly height_m: number;
          /** Which published field bound `height_m`. */
          readonly heightBinding: ParisHeightBinding;
          /** `footprintAreaM2 × height_m` — the theoretical maximum study volume, in m³. */
          readonly volumeM3: number;
          /** `structured` when the ECM polygon AND the published height ceiling both resolve; else `estimated-ruleset`. */
          readonly confidence: EnvelopeConfidence;
          /** Per-component structured-vs-refused breakdown. */
          readonly components: ParisEnvelopeComponents;
          /** The cited PARTIAL refusal for the crown component when cour=X, else null. */
          readonly couronnementRefusal: EnvelopeRefusal | null;
          /** Legible "label: value" facts (zone, footprint, height, volume, filet, HMC, version). */
          readonly knownFacts: string[];
          /** Genuinely-PDF components withheld (only `couronnement_UG324` when cour=X). */
          readonly missingRules: string[];
          /** Honest caveats (crown omitted, HMC-NGF not applied, EAL subtracted, projection frame). */
          readonly caveats: string[];
      }
    | {
          readonly ok: false;
          /** A CITED refusal — the footprint (no ECM here) or the height (no published height) is withheld. */
          readonly refusal: EnvelopeRefusal;
          /** Which component forced the refusal. */
          readonly refusedComponent: 'footprint' | 'height';
      };

/**
 * Equirectangular projection of a WGS84 `[lon,lat]` ring into LOCAL ENU metres about the ring's
 * centroid. Accurate to well under 1 % for the small (≈ 100 m²) ECM footprints at Paris' latitude —
 * verified against the source `st_area_shape`. The closing duplicate vertex (if present) is dropped.
 */
export function projectParisRingToEnu(ring: ReadonlyArray<ParisLonLat>): Pt[] {
    // Drop a trailing closing vertex (== first) so the polygon is simple.
    let pts = ring;
    if (pts.length >= 2) {
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        if (first[0] === last[0] && first[1] === last[1]) pts = pts.slice(0, -1);
    }
    if (pts.length < 3) return [];
    let lon0 = 0;
    let lat0 = 0;
    for (const [lon, lat] of pts) {
        lon0 += lon;
        lat0 += lat;
    }
    lon0 /= pts.length;
    lat0 /= pts.length;
    const M_PER_DEG_LAT = 111_320;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
    return pts.map(([lon, lat]) => ({
        x: (lon - lon0) * mPerDegLon,
        z: (lat - lat0) * M_PER_DEG_LAT,
    }));
}

/** Build the cited PARTIAL refusal for the couronnement (crown) component when cour=X. */
export function parisCouronnementRefusal(): EnvelopeRefusal {
    return {
        code: 'source-data-unavailable',
        headline:
            'Crown (couronnement) geometry not applied — the continuous crown (filet cour = X) is ' +
            'governed by art. UG.3.2.4, which is not published as structured data.',
        detail:
            'The ECM buildable footprint and the straight extrusion to the height ceiling ARE computed ' +
            'and shown. What is withheld is only the couronnement (crown) taper at the top of the ' +
            'volume: the filet layer flags a continuous crown (cour = X) and defers its geometry to ' +
            'article UG.3.2.4 of the PLU bioclimatique règlement, a PDF rule PRYZM does not transcribe ' +
            '(inventing the taper would fabricate geometry — §CONTEXT-DATA-HONESTY). The volume shown is ' +
            'therefore a straight prism to the ceiling; the true envelope is at most this, reduced by the ' +
            'crown. This is a PARTIAL refusal of one component, not of the envelope.',
        ordinanceRef: PARIS_UG324_CROWN_REF,
        legallyGrounded: false,
        knownFacts: [],
    };
}

/** A CITED refusal for the FOOTPRINT component when no ECM polygon covers the point. */
function parisEcmAbsentRefusal(inputs: ParisEnvelopeInputs, extraFacts: readonly string[]): EnvelopeRefusal {
    const doc = inputs.zone?.reglementDoc ? ` (règlement ${inputs.zone.reglementDoc})` : '';
    return {
        code: 'source-data-unavailable',
        headline: inputs.zone
            ? `Zone identified (${parisZoneLabelFor(inputs.zone)}) — but no ECM buildable footprint ` +
              'is published at this point, so the volume is not computed.'
            : 'Paris — no ECM buildable footprint is published at this point.',
        detail:
            'PRYZM computes the Paris buildable envelope from the published *emprise constructible ' +
            'maximale* polygon (Paris opendata plub_ecm) — the real buildable footprint — extruded to ' +
            'the height ceiling. That ECM layer does NOT cover the whole commune, and no ECM polygon ' +
            'intersects this parcel point' + doc + '. Rather than fabricate a footprint from the parcel ' +
            'outline × a coverage ratio (which the règlement forbids treating as equivalent to the ' +
            'cumulative UG.3 rules), PRYZM declines to draw a volume here. The zone and any height facts ' +
            'resolved are shown; the footprint is honestly withheld.',
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [
            ...parisPluFacts(inputs.zone, inputs.heightCeiling_m, {
                hmc_m: inputs.hmc_m,
                hmcDatum: inputs.hmcDatum,
                filetCode: inputs.filetCode,
                filetFrontageHeight_m: inputs.filetHeight_m,
                sourceVersion: inputs.sourceVersion,
            }),
            ...extraFacts,
        ],
    };
}

/** A CITED refusal for the HEIGHT component when an ECM footprint resolved but no published height did. */
function parisHeightAbsentRefusal(inputs: ParisEnvelopeInputs, extraFacts: readonly string[]): EnvelopeRefusal {
    return {
        code: 'source-data-unavailable',
        headline:
            `ECM footprint resolved (${inputs.ecmAreaM2 != null ? `${inputs.ecmAreaM2.toFixed(1)} m²` : 'geometry present'}` +
            ') — but no published height covers this point, so the volume is not computed.',
        detail:
            'The buildable footprint is the published ECM polygon (plub_ecm). No published height ' +
            'resolved here, though: neither the height ceiling (plub_hauteur, UG.3.2.1) nor a relative ' +
            'HMC (plub_hmc, UG.3.2.2) nor the ECM graphic height is available at this point (a secteur ' +
            'sauvegardé / PSMV parcel legitimately has no PLU height sector). PRYZM will not invent a ' +
            'height to extrude, so the footprint is shown and the volume is honestly withheld.',
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [
            ...parisPluFacts(inputs.zone, inputs.heightCeiling_m, {
                filetCode: inputs.filetCode,
                filetFrontageHeight_m: inputs.filetHeight_m,
                sourceVersion: inputs.sourceVersion,
            }),
            ...extraFacts,
        ],
    };
}

/**
 * COMPUTE THE PARIS BUILDABLE ENVELOPE from structured data — the whole point of the upgrade.
 *
 * footprint = the ECM polygon (geometry, never parcel×%); height = min of the resolved published
 * candidates (ceiling, ECM graphic, relative-HMC); volume = extrude(footprint − EAL) → height. When
 * cour=X the couronnement is a cited PARTIAL refusal (art. UG.3.2.4) but the footprint + straight
 * extrusion still ship. Refuses the FOOTPRINT (no ECM) or the HEIGHT (no published height) honestly.
 *
 * @param inputs    the structured facts from `resolveParisEnvelope`.
 * @param extraFacts per-parcel facts the caller holds (address, coordinates), appended to knownFacts.
 */
export function computeParisEnvelope(
    inputs: ParisEnvelopeInputs,
    extraFacts: readonly string[] = [],
): ParisEnvelopeResult {
    // 1 — FOOTPRINT. The ECM polygon IS the footprint; no ECM ⇒ honest footprint refusal.
    if (!inputs.ecmGeometry) {
        return { ok: false, refusal: parisEcmAbsentRefusal(inputs, extraFacts), refusedComponent: 'footprint' };
    }
    const footprintPolygon = projectParisRingToEnu(inputs.ecmGeometry);
    if (footprintPolygon.length < 3) {
        return { ok: false, refusal: parisEcmAbsentRefusal(inputs, extraFacts), refusedComponent: 'footprint' };
    }
    const grossFootprintAreaM2 = polygonArea(footprintPolygon);

    // 2 — HEIGHT. min(published ceiling, ECM graphic height, HMC-as-height where derivable). HMC with
    // a NGF datum is an ABSOLUTE altitude — converting it to a height above ground needs the façade
    // rasant (terrain), not available here — so it does NOT contribute a height cap (honest).
    const hmcRelative =
        inputs.hmc_m != null && inputs.hmcDatum != null && inputs.hmcDatum.toUpperCase() !== 'NGF'
            ? inputs.hmc_m
            : null;
    const candidates: Array<{ h: number; binding: ParisHeightBinding }> = [];
    if (inputs.heightCeiling_m != null) candidates.push({ h: inputs.heightCeiling_m, binding: 'height-ceiling' });
    if (inputs.ecmHeight != null) candidates.push({ h: inputs.ecmHeight, binding: 'ecm-graphic' });
    if (hmcRelative != null) candidates.push({ h: hmcRelative, binding: 'hmc-relative' });
    if (candidates.length === 0) {
        return { ok: false, refusal: parisHeightAbsentRefusal(inputs, extraFacts), refusedComponent: 'height' };
    }
    const governing = candidates.reduce((a, b) => (b.h < a.h ? b : a));
    const height_m = governing.h;

    // 3 — EAL subtraction (conservative: reduce, never inflate, the buildable footprint).
    const caveats: string[] = [];
    let ealAreaSub = 0;
    if (inputs.ealGeometry) {
        ealAreaSub = polygonArea(projectParisRingToEnu(inputs.ealGeometry));
    } else if (inputs.ealAreaM2 != null) {
        ealAreaSub = inputs.ealAreaM2;
    }
    const footprintAreaM2 = Math.max(0, grossFootprintAreaM2 - ealAreaSub);
    if (ealAreaSub > 0) {
        caveats.push(
            `EAL (espace à libérer) of ${ealAreaSub.toFixed(1)} m² subtracted from the footprint as a ` +
                'whole-area deduction (conservative — the strip is removed in full).',
        );
    }

    const volumeM3 = footprintAreaM2 * height_m;

    // 4 — CONFIDENCE. `structured` only when the footprint AND the primary published height ceiling
    // both resolve; otherwise the height came from a weaker published field → `estimated-ruleset`.
    const confidence: EnvelopeConfidence =
        inputs.heightCeiling_m != null ? 'structured' : 'estimated-ruleset';

    // 5 — CROWN. cour=X ⇒ the continuous crown is PDF-bound (art. UG.3.2.4): partial refusal, and the
    // shipped volume is a straight prism to the ceiling (never an invented taper).
    const crownContinuous = inputs.courCode === 'X';
    const components: ParisEnvelopeComponents = {
        footprint: 'structured',
        height: 'structured',
        couronnement: crownContinuous ? 'refused' : 'structured',
    };
    const couronnementRefusal = crownContinuous ? parisCouronnementRefusal() : null;
    const missingRules = crownContinuous ? [PARIS_ECM_MISSING_COURONNEMENT] : [];
    if (crownContinuous) {
        caveats.push(
            'Continuous crown (filet cour = X): the volume shown is a STRAIGHT extrusion to the height ' +
                'ceiling; the couronnement taper of art. UG.3.2.4 (PDF-bound) is not applied, so the true ' +
                'envelope is at most this.',
        );
    }
    if (inputs.hmc_m != null && (inputs.hmcDatum == null || inputs.hmcDatum.toUpperCase() === 'NGF')) {
        caveats.push(
            `HMC ${inputs.hmc_m} m${inputs.hmcDatum ? ` ${inputs.hmcDatum}` : ''} is an absolute altitude, not a ` +
                'height above ground — converting it needs the façade rasant (terrain), so it is not applied as a cap.',
        );
    }
    if (inputs.ecmAreaM2 != null) {
        const drift = Math.abs(grossFootprintAreaM2 - inputs.ecmAreaM2) / inputs.ecmAreaM2;
        if (drift > 0.05) {
            caveats.push(
                `Projected footprint area (${grossFootprintAreaM2.toFixed(1)} m²) differs from the source ` +
                    `st_area_shape (${inputs.ecmAreaM2.toFixed(1)} m²) by ${(drift * 100).toFixed(1)} %.`,
            );
        }
    }
    caveats.push(
        'Footprint polygon is in local ENU metres about its centroid; the L5 dispatcher re-anchors it to ' +
            'the parcel scene frame (shape + area are frame-invariant).',
    );

    // 6 — FACTS.
    const knownFacts: string[] = [];
    if (inputs.zone) {
        knownFacts.push(`Zone: ${parisZoneLabelFor(inputs.zone)}`);
        if (inputs.zone.typeZone) knownFacts.push(`Zone type: ${inputs.zone.typeZone}`);
        if (inputs.zone.planId) knownFacts.push(`Plan: ${inputs.zone.planId}`);
    }
    if (inputs.ecmCadastral) knownFacts.push(`Cadastral (ECM): ${inputs.ecmCadastral}`);
    knownFacts.push(`Buildable footprint (ECM): ${footprintAreaM2.toFixed(1)} m² (opendata plub_ecm)`);
    const bindingLabel =
        governing.binding === 'height-ceiling'
            ? 'plub_hauteur, UG.3.2.1'
            : governing.binding === 'ecm-graphic'
              ? 'plub_ecm graphic height'
              : 'plub_hmc (relative)';
    knownFacts.push(`Height: ${height_m} m (${bindingLabel})`);
    knownFacts.push(`Theoretical max volume: ${Math.round(volumeM3).toLocaleString('en-US')} m³ (footprint × height)`);
    if (inputs.filetCode) {
        const m = inputs.filetHeight_m != null ? `${inputs.filetHeight_m} m` : 'same as existing façade';
        knownFacts.push(`Filet (frontage gabarit): code ${inputs.filetCode} → ${m} (opendata plub_filet)`);
    }
    if (inputs.courCode) {
        knownFacts.push(
            `Crown (couronnement) code: ${inputs.courCode}` +
                (crownContinuous ? ' (X = continuous → art. UG.3.2.4, PDF-bound)' : ' (pitched)'),
        );
    }
    if (inputs.hmc_m != null) {
        knownFacts.push(`HMC (hauteur max. constructible): ${inputs.hmc_m} m${inputs.hmcDatum ? ` ${inputs.hmcDatum}` : ''} (opendata plub_hmc, UG.3.2.2)`);
    }
    if (inputs.sourceVersion) knownFacts.push(`PLU version: ${inputs.sourceVersion}`);
    knownFacts.push(...extraFacts);

    return {
        ok: true,
        footprintPolygon,
        grossFootprintAreaM2,
        footprintAreaM2,
        height_m,
        heightBinding: governing.binding,
        volumeM3,
        confidence,
        components,
        couronnementRefusal,
        knownFacts,
        missingRules,
        caveats,
    };
}
