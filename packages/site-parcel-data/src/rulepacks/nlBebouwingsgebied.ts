// §NL-BEBOUWINGSGEBIED (lane ENVELOPE-NLDK, round 3, 2026-09-04) — a DERIVED geometry: an algorithm,
// not a dataset. Deep audit Gap 3 (the bruidsschat is PROCEDURAL) and Gap 4 (`bebouwingsgebied` derives
// from BAG + BGT + BRK); founder review §4 (vergunningvrij re-scoped onto the bruidsschat).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFINITIONS, VERBATIM, FROM THE NATIONAL CATALOGUE (Stelselcatalogus, keyless HAL API, 2026-09-04)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// These are the Bbl bijlage I / bruidsschat bijlage I begrippen as the Stelselcatalogus serves them
// (`regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/…`) — a state source, not a paraphrase;
// `NL_BEBOUWINGSGEBIED_DEFINITIONS` below carries them with their URIs. The IPLO procedure for LAYING
// the line (iplo.nl/woordenlijst/uitleg-achtererfgebied/, read 2026-09-04) is the construction this
// module implements:
//   · the VOORKANT is "de gevel van de hoofdmassa van het hoofdgebouw die het dichtst is gelegen bij
//     openbaar toegankelijk gebied";
//   · the achtererfgebied begins "op 1 meter achter de voorkant van het hoofdgebouw" and the line
//     "loopt vanaf de zijkant van het hoofdgebouw parallel met het aangrenzend openbaar gebied";
//   · on a HOEKPERCEEL "de lijn mag hierbij het hoofdgebouw of het gebouwerf achter het hoofdgebouw niet
//     doorkruisen" — it then runs "langs de zijgevel van het hoofdgebouw en in het verlengde daarvan
//     naar achteren"; the land between the extended zijgevels behind the hoofdgebouw is ALWAYS
//     achtererfgebied.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONSTRUCTION, AS HALF-PLANES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every parcel edge classified `front` (A3 — it adjoins openbaar toegankelijk gebied per BGT) yields
// one half-plane, bounded by a line parallel to that edge:
//   · for the edge nearest the hoofdgebouw (the VOORKANT's street): 1 m BEHIND the building's nearest
//     face toward that street;
//   · for every other public-adjacent edge (the side street of a corner lot): AT the building's face
//     toward that street (the zijgevel and its extension), offset 0 — the IPLO corner rule.
// achtererfgebied = gebouwerf ∩ (∩ half-planes) ∖ hoofdgebouw.
// bebouwingsgebied = achtererfgebied ∪ (hoofdgebouw ∖ oorspronkelijk hoofdgebouw).
// The half-plane clip and the polygon difference are the package's EXISTING solvers
// (`geometry/polygonClip.ts`, `geometry/polygonDifference.ts`); nothing geometric is reinvented here.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE REFUSES TO KNOW (deep audit Gap 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The OORSPRONKELIJK hoofdgebouw is a LEGAL fact (the building as first lawfully completed), not a BAG
// fact. BAG gives the current pand and a bouwjaar, never the extension history. So the input is a
// three-state: a ring (with the evidence that established it), "same as current" (with evidence), or
// UNKNOWN — and unknown yields BOUNDS, never a number: the bebouwingsgebied lies in
// [achtererfgebied, achtererfgebied + hoofdgebouw) and the maximum oppervlakte follows monotonically.
// A consumer may DISPLAY the bounds; it may never bind the upper one as an entitlement.
//
// THE OPPERVLAKTE FORMULA is the bruidsschat's, art. 22.36 lid 1 onder a (fragment read via InView,
// 2026-09-04; distinction 22.27/22.36 confirmed by ABRvS ECLI:NL:RVS:2025:4539):
//   bebouwingsgebied ≤ 100 m²        → 50 % van dat bebouwingsgebied
//   100 m² < bebouwingsgebied ≤ 300 m² → 50 m², vermeerderd met 20 % van het deel > 100 m²
//   bebouwingsgebied > 300 m²        → 90 m², vermeerderd met 10 % van het deel > 300 m², tot een
//                                       maximum van in totaal 150 m²
// ⚠ It counts EXISTING bijbehorende bouwwerken against the maximum; `existingBijbehorendeBouwwerkenM2`
// is subtracted only when the caller supplies it, and the result says which.
//
// PURE (C58 §1.9). Deterministic. No I/O. Coordinates are scene-XZ / RD New METRES (Pt = {x, z}).
// Emits the shared `RuleState` vocabulary against **D3** (bonuses and increments — a permit-free addition
// is an increment on what the plan itself permits; the same key `nlVergunningvrij.ts` uses).

import type { ParcelEdgeClassification, Pt, RuleState } from '@pryzm/schemas';
import { polygonSignedArea } from '@pryzm/site-validators';
import { inwardEdgeNormal, signedDepthAlongNormal } from '../geometry/buildingLineOffset.js';
import { pointInRingEvenOdd } from '../geometry/pointInRingsEvenOdd.js';
import { clipPolygonToConvex } from '../geometry/polygonClip.js';
import { differencePartsAreaM2, differenceRings2D, type PolygonDifferencePart } from '../geometry/polygonDifference.js';
import { describeRingDefect, normaliseRing, validateRing } from '../geometry/ringValidation.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The definitions and the article, as documented facts
// ──────────────────────────────────────────────────────────────────────────────────────────────

export const NL_BEBOUWINGSGEBIED_DEFINITIONS = Object.freeze({
    source:
        'Stelselcatalogus website API (stelselcatalogus.omgevingswet.overheid.nl/api/concepten?zoekTerm=…, ' +
        'Accept: application/hal+json, KEYLESS), read 2026-09-04; conceptschema "Regelgeving" = Bbl bijlage I / ' +
        'bruidsschat bijlage I begrippen. Artefact: findings/nl-phase0/nl-stelselcatalogus-probe.json',
    achtererfgebied: {
        uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Achtererfgebied',
        geldigVanaf: '2024-01-01',
        definitie:
            'Gebouwerf achter de lijn die het hoofdgebouw doorkruist op 1 m achter de voorkant en van daaruit ' +
            'evenwijdig loopt met het aangrenzend openbaar toegankelijk gebied, zonder het hoofdgebouw opnieuw te ' +
            'doorkruisen of in het gebouwerf achter het hoofdgebouw te komen, waarbij als op een perceel meer gebouwen ' +
            'aanwezig zijn die noodzakelijk zijn voor het verrichten van de op grond van het omgevingsplan of een ' +
            'omgevingsvergunning voor een omgevingsplanactiviteit op het perceel toegestane activiteiten of als het ' +
            'hoofdgebouw geen woning is, maar op het perceel wel een of meer op de grond staande woningen aanwezig zijn, ' +
            'voor het leggen van deze lijn bepalend is het hoofdgebouw, de woning of een van de a[…]',
        note: 'the multi-building clause after "bepalend is" is NOT implemented: this module takes ONE hoofdgebouw ring',
    },
    bebouwingsgebied: {
        uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Bebouwingsgebied',
        geldigVanaf: '2020-10-28',
        definitie: 'Achtererfgebied en de grond onder het hoofdgebouw, uitgezonderd de grond onder het oorspronkelijk hoofdgebouw.',
    },
    gebouwerf: {
        uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Gebouwerf_bbl',
        definitie:
            'Bebouwd of onbebouwd perceel, of een gedeelte daarvan, dat direct is gelegen bij een hoofdgebouw en in ' +
            'feitelijk opzicht is ingericht ten dienste van het gebruik van dat gebouw, waarbij het omgevingsplan die ' +
            'inrichting niet verbiedt.',
    },
    voorerfgebied: {
        uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Voorerfgebied',
        definitie: 'Gebouwerf dat geen onderdeel is van het achtererfgebied.',
    },
    openbaarToegankelijkGebied: {
        uri: 'http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/OpenbaarToegankelijkGebied',
        definitie:
            'Wegen als bedoeld in artikel 1, eerste lid, onder b, van de Wegenverkeerswet 1994, en pleinen, parken, ' +
            'plantsoenen, openbaar vaarwater en ander openbaar gebied dat voor publiek algemeen toegankelijk is, met ' +
            'uitzondering van wegen alleen bedoeld voor de ontsluiting van percelen door langzaam verkeer.',
        note: 'the A3 `front` classification must be built from BGT against THIS definition — a fietspad that only serves the parcels is NOT openbaar toegankelijk gebied',
    },
    procedureSource: 'iplo.nl/woordenlijst/uitleg-achtererfgebied/ (read 2026-09-04) — voorkant, 1 m line, corner-lot rule',
} as const);

export const NL_BRUIDSSCHAT_22_36_BIJBEHOREND = Object.freeze({
    article: 'omgevingsplan (bruidsschat) art. 22.36 lid 1 onder a — bijbehorend bouwwerk in achtererfgebied',
    verifiedVia:
        'text fragment via Wolters Kluwer InView (read 2026-09-04) + ABRvS ECLI:NL:RVS:2025:4539 (24-09-2025) for the ' +
        '22.27/22.36 distinction; the full consolidated text was NOT fetched',
    oppervlakte: {
        upTo100: '50% van dat bebouwingsgebied',
        from100To300: '50 m2, vermeerderd met 20% van het deel van het bebouwingsgebied dat groter is dan 100 m2',
        above300: '90 m2, vermeerderd met 10% van het deel van het bebouwingsgebied dat groter is dan 300 m2, tot een maximum van in totaal 150 m2',
    },
    within4mOfOorspronkelijkHoofdgebouw: {
        caps: ['5 m', '0,3 m boven de bovenkant van de scheidingsconstructie met de tweede bouwlaag van het hoofdgebouw', 'het hoofdgebouw'],
    },
    beyond4m: {
        dakvoet: 'niet hoger dan 3 m',
        roof: 'de daknok gevormd door twee of meer schuine dakvlakken, met een hellingshoek van niet meer dan 55°',
        daknokFormula: 'maximale daknokhoogte [m] = (afstand daknok tot de perceelsgrens [m] x 0,47) + 3',
        daknokCap5m:
            'a 5 m daknok cap is founder-sourced (deep audit Gap 3) and matches the Bijlage II Bor art. 2 sub 3 lineage, ' +
            'but was NOT visible in the fragment read — applied CONSERVATIVELY (it can only lower the cap), status not-re-verified',
    },
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The oorspronkelijk hoofdgebouw — a LEGAL fact; three states, and `unknown` is honest. */
export type NlOorspronkelijkHoofdgebouw =
    | { readonly kind: 'ring'; readonly ring: readonly Pt[]; readonly evidence: string }
    | { readonly kind: 'same-as-current'; readonly evidence: string }
    | { readonly kind: 'unknown' };

export interface NlBebouwingsgebiedInputs {
    /** BRK perceel ring, metres. */
    readonly perceel: readonly Pt[];
    /** A3 — one classification per perceel edge (`edge i` = `perceel[i] → perceel[i+1]`); `front` = adjoins openbaar toegankelijk gebied (BGT). */
    readonly perceelEdges: readonly ParcelEdgeClassification[];
    /** BAG pand footprint of the hoofdgebouw (its hoofdmassa), metres, within the perceel. */
    readonly hoofdgebouw: readonly Pt[];
    readonly oorspronkelijkHoofdgebouw: NlOorspronkelijkHoofdgebouw;
    /** The gebouwerf when narrower than the perceel (the omgevingsplan may forbid the inrichting on part). Default: the perceel. */
    readonly erf?: readonly Pt[] | null;
    /** Existing bijbehorende bouwwerken already on the erf, m² — they count against the maximum. */
    readonly existingBijbehorendeBouwwerkenM2?: number | null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Outputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Honest bounds when the oorspronkelijk hoofdgebouw is unknown. The upper bound is EXCLUSIVE. */
export interface NlAreaBounds {
    readonly lowerM2: number;
    readonly upperExclusiveM2: number;
}

export interface NlAchtererfLine {
    readonly edgeIndex: number;
    /** A point on the line. */
    readonly point: Pt;
    /** Unit normal pointing INTO the achtererf side. */
    readonly inwardNormal: Pt;
    readonly offsetBehindFaceM: number;
}

export type NlBebouwingsgebiedResult =
    | {
          readonly kind: 'derived';
          readonly voorkant: NlAchtererfLine;
          readonly zijgevelLines: readonly NlAchtererfLine[];
          readonly achtererfgebied: { readonly parts: readonly PolygonDifferencePart[]; readonly areaM2: number };
          readonly hoofdgebouwM2: number;
          readonly oorspronkelijkStatus: NlOorspronkelijkHoofdgebouw['kind'];
          readonly bebouwingsgebiedM2: number | NlAreaBounds;
          readonly maxBijbehorendM2: number | NlAreaBounds;
          /** max − existing, when existing was supplied; null otherwise. Never below 0. */
          readonly remainingBijbehorendM2: number | NlAreaBounds | null;
          readonly caveats: readonly string[];
          readonly why: string;
      }
    | {
          readonly kind: 'refused';
          readonly reason:
              | 'perceel-invalid'
              | 'hoofdgebouw-invalid'
              | 'erf-invalid'
              | 'edge-classification-mismatch'
              | 'no-public-adjacent-edge'
              | 'hoofdgebouw-outside-perceel'
              | 'oorspronkelijk-invalid'
              | 'oorspronkelijk-not-within-hoofdgebouw'
              | 'geometry-unresolved';
          readonly detail: string;
      };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The formula and the height regime (art. 22.36 lid 1 onder a)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The bruidsschat oppervlakte formula over the bebouwingsgebied. Pure; total on finite non-negative input. */
export function nlBruidsschatMaxBijbehorendOppervlakM2(bebouwingsgebiedM2: number): number {
    const x = Number.isFinite(bebouwingsgebiedM2) && bebouwingsgebiedM2 > 0 ? bebouwingsgebiedM2 : 0;
    if (x <= 100) return 0.5 * x;
    if (x <= 300) return 50 + 0.2 * (x - 100);
    return Math.min(150, 90 + 0.1 * (x - 300));
}

export type NlBijbehorendHeightRegime =
    | {
          readonly kind: 'within-4m';
          /** 5 m — the one cap always known. */
          readonly upperBoundM: 5;
          /** min(5, scheiding + 0,3, hoofdgebouw) when all three are held; null when any is not. */
          readonly resolvedCapM: number | null;
          readonly unresolved: readonly string[];
      }
    | {
          readonly kind: 'beyond-4m';
          readonly dakvoetMaxM: 3;
          readonly roof: 'two-or-more-schuine-dakvlakken';
          readonly hellingMaxDeg: 55;
          readonly daknokFormula: 'maximale daknokhoogte [m] = (afstand daknok tot de perceelsgrens [m] x 0,47) + 3';
          /** min(5, 0,47 × afstand + 3) when the distance is held; null otherwise. */
          readonly daknokMaxM: number | null;
          readonly daknokCap5mStatus: 'applied-conservatively-not-re-verified';
      }
    | { readonly kind: 'distance-unknown'; readonly why: string };

/** The PROCEDURAL height regime of art. 22.36 lid 1 onder a — the 4 m switch. Pure and total. */
export function nlBruidsschatBijbehorendHeightRegime(opts: {
    readonly distanceToOorspronkelijkHoofdgebouwM: number | null;
    readonly distanceDaknokToPerceelsgrensM?: number | null;
    readonly tweedeBouwlaagScheidingTopM?: number | null;
    readonly hoofdgebouwHeightM?: number | null;
}): NlBijbehorendHeightRegime {
    const d = opts.distanceToOorspronkelijkHoofdgebouwM;
    if (d === null || !Number.isFinite(d) || d < 0) {
        return {
            kind: 'distance-unknown',
            why:
                'the height regime switches at 4 m from the OORSPRONKELIJK hoofdgebouw; without that distance neither ' +
                'regime can be named (and the original building is a legal fact, not a BAG fact — Gap 5)',
        };
    }
    if (d <= 4) {
        const sch = opts.tweedeBouwlaagScheidingTopM ?? null;
        const hg = opts.hoofdgebouwHeightM ?? null;
        const unresolved: string[] = [];
        if (sch === null || !Number.isFinite(sch)) unresolved.push('bovenkant scheidingsconstructie met de tweede bouwlaag (+0,3 m)');
        if (hg === null || !Number.isFinite(hg)) unresolved.push('hoogte van het hoofdgebouw');
        return {
            kind: 'within-4m',
            upperBoundM: 5,
            resolvedCapM: unresolved.length === 0 ? Math.min(5, (sch as number) + 0.3, hg as number) : null,
            unresolved: Object.freeze(unresolved),
        };
    }
    const dist = opts.distanceDaknokToPerceelsgrensM ?? null;
    return {
        kind: 'beyond-4m',
        dakvoetMaxM: 3,
        roof: 'two-or-more-schuine-dakvlakken',
        hellingMaxDeg: 55,
        daknokFormula: 'maximale daknokhoogte [m] = (afstand daknok tot de perceelsgrens [m] x 0,47) + 3',
        daknokMaxM: dist !== null && Number.isFinite(dist) && dist >= 0 ? Math.min(5, dist * 0.47 + 3) : null,
        daknokCap5mStatus: 'applied-conservatively-not-re-verified',
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Geometry helpers (thin; the solvers are the package's)
// ──────────────────────────────────────────────────────────────────────────────────────────────

const ON_BOUNDARY_TOL_M = 0.05;
const VOORKANT_OFFSET_M = 1;

const areaOf = (ring: readonly Pt[]): number => Math.abs(polygonSignedArea(ring));
const toTuples = (ring: readonly Pt[]): Array<readonly [number, number]> => ring.map((p) => [p.x, p.z] as const);

function distancePointToSegment(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}
function onRingBoundary(p: Pt, ring: readonly Pt[], tol: number): boolean {
    for (let i = 0; i < ring.length; i++) {
        if (distancePointToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!) <= tol) return true;
    }
    return false;
}
/** Inside-or-on-boundary, with the boundary tolerance shared walls need. */
function ringContains(outer: readonly Pt[], inner: readonly Pt[]): boolean {
    const tuples = toTuples(outer);
    return inner.every((p) => onRingBoundary(p, outer, ON_BOUNDARY_TOL_M) || pointInRingEvenOdd(p.x, p.z, tuples));
}

/** A convex rectangle standing in for the half-plane `{ p : (p − point)·n ≥ 0 }`, large enough to cover `extentM`. */
function halfPlaneRect(point: Pt, n: Pt, extentM: number): Pt[] {
    const d = { x: -n.z, z: n.x };
    const L = extentM;
    return [
        { x: point.x + d.x * L, z: point.z + d.z * L },
        { x: point.x - d.x * L, z: point.z - d.z * L },
        { x: point.x - d.x * L + n.x * L, z: point.z - d.z * L + n.z * L },
        { x: point.x + d.x * L + n.x * L, z: point.z + d.z * L + n.z * L },
    ];
}

function extentOf(ring: readonly Pt[]): number {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return 4 * Math.hypot(maxX - minX, maxZ - minZ) + 10;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The derivation
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Derive achtererfgebied, bebouwingsgebied and the art. 22.36 maximum for one parcel. Pure and total.
 *
 * REFUSALS ARE NAMED, NEVER REPAIRED: a defective ring, a hoofdgebouw that straddles the perceel (pre-clip
 * the pand to the parcel first), an oorspronkelijk ring not within the hoofdgebouw (a demolished original
 * needs a polygon intersection this module does not do), or a topology the difference solver cannot walk.
 */
export function deriveNlBebouwingsgebied(input: NlBebouwingsgebiedInputs): NlBebouwingsgebiedResult {
    const perceel = normaliseRing(input.perceel);
    const pd = validateRing(perceel);
    if (pd !== null) return { kind: 'refused', reason: 'perceel-invalid', detail: describeRingDefect(pd) };
    const hoofd = normaliseRing(input.hoofdgebouw);
    const hd = validateRing(hoofd);
    if (hd !== null) return { kind: 'refused', reason: 'hoofdgebouw-invalid', detail: describeRingDefect(hd) };
    let erf = perceel;
    if (input.erf !== undefined && input.erf !== null) {
        erf = normaliseRing(input.erf);
        const ed = validateRing(erf);
        if (ed !== null) return { kind: 'refused', reason: 'erf-invalid', detail: describeRingDefect(ed) };
    }
    if (input.perceelEdges.length !== input.perceel.length && input.perceelEdges.length !== perceel.length) {
        return {
            kind: 'refused',
            reason: 'edge-classification-mismatch',
            detail: `${input.perceelEdges.length} edge classifications for a perceel of ${perceel.length} edges (A3 must be per edge)`,
        };
    }
    if (!ringContains(perceel, hoofd)) {
        return {
            kind: 'refused',
            reason: 'hoofdgebouw-outside-perceel',
            detail:
                'the hoofdgebouw ring has a vertex outside the perceel by more than the shared-wall tolerance; a BAG pand ' +
                'spanning several parcels must be clipped to this perceel BEFORE derivation (the module does not guess which part is the hoofdgebouw here)',
        };
    }

    // ── the public-adjacent edges, and the building's depth behind each ──────────────────────────
    const candidates: Array<{ edgeIndex: number; a: Pt; n: Pt; faceDepthM: number }> = [];
    for (let i = 0; i < perceel.length; i++) {
        if (input.perceelEdges[i] !== 'front') continue;
        const n = inwardEdgeNormal(perceel, i);
        if (n === null) continue;
        const a = perceel[i]!;
        let faceDepth = Infinity;
        for (const v of hoofd) faceDepth = Math.min(faceDepth, signedDepthAlongNormal(v, a, n));
        candidates.push({ edgeIndex: i, a, n, faceDepthM: faceDepth });
    }
    if (candidates.length === 0) {
        return {
            kind: 'refused',
            reason: 'no-public-adjacent-edge',
            detail:
                'no perceel edge is classified `front` (adjoining openbaar toegankelijk gebied); the achtererfgebied is ' +
                'defined relative to that gebied, so A3 (from BGT) must be supplied before it can be laid',
        };
    }
    // The voorkant is the face nearest to openbaar toegankelijk gebied. Ties break on the lowest index, and say so.
    let vk = candidates[0]!;
    for (const c of candidates) if (c.faceDepthM < vk.faceDepthM - 1e-9) vk = c;
    const tied = candidates.filter((c) => c !== vk && Math.abs(c.faceDepthM - vk.faceDepthM) <= 1e-9);
    const caveats: string[] = [];
    if (tied.length > 0) {
        caveats.push(
            `the hoofdgebouw is equally near ${tied.length + 1} public-adjacent edges; edge ${vk.edgeIndex} was taken as the voorkant (lowest index) — a human should confirm which gevel is the voorkant`,
        );
    }

    const L = extentOf(erf);
    const mkLine = (c: (typeof candidates)[number], offset: number): NlAchtererfLine => ({
        edgeIndex: c.edgeIndex,
        point: { x: c.a.x + c.n.x * (c.faceDepthM + offset), z: c.a.z + c.n.z * (c.faceDepthM + offset) },
        inwardNormal: c.n,
        offsetBehindFaceM: offset,
    });
    const voorkant = mkLine(vk, VOORKANT_OFFSET_M);
    const zijgevelLines = candidates.filter((c) => c !== vk).map((c) => mkLine(c, 0));

    // ── region = erf ∩ half-planes ─────────────────────────────────────────────────────────────
    let region: Pt[] = erf.map((p) => ({ x: p.x, z: p.z }));
    for (const line of [voorkant, ...zijgevelLines]) {
        if (region.length < 3) break;
        region = clipPolygonToConvex(region, halfPlaneRect(line.point, line.inwardNormal, L));
    }

    // ── achtererfgebied = region ∖ hoofdgebouw ─────────────────────────────────────────────────
    let parts: readonly PolygonDifferencePart[] = [];
    let achtererfM2 = 0;
    if (region.length >= 3) {
        const diff = differenceRings2D(region, hoofd);
        if (!diff.ok) {
            return {
                kind: 'refused',
                reason: 'geometry-unresolved',
                detail: `region ∖ hoofdgebouw refused: ${diff.reason}${diff.detail ? ' — ' + diff.detail : ''}`,
            };
        }
        parts = diff.parts;
        achtererfM2 = round3(differencePartsAreaM2(diff.parts));
    }
    const hoofdM2 = round3(areaOf(hoofd));

    // ── bebouwingsgebied ────────────────────────────────────────────────────────────────────────
    const oo = input.oorspronkelijkHoofdgebouw;
    let bebouwingsgebiedM2: number | NlAreaBounds;
    if (oo.kind === 'same-as-current') {
        bebouwingsgebiedM2 = achtererfM2;
        caveats.push(`oorspronkelijk hoofdgebouw taken as the current pand — evidence: ${oo.evidence}`);
    } else if (oo.kind === 'ring') {
        const orig = normaliseRing(oo.ring);
        const od = validateRing(orig);
        if (od !== null) return { kind: 'refused', reason: 'oorspronkelijk-invalid', detail: describeRingDefect(od) };
        if (!ringContains(hoofd, orig) || areaOf(orig) > areaOf(hoofd) + 1e-6) {
            return {
                kind: 'refused',
                reason: 'oorspronkelijk-not-within-hoofdgebouw',
                detail:
                    'the oorspronkelijk hoofdgebouw ring is not contained in the current hoofdgebouw (part of the original was ' +
                    'demolished?); the exclusion then also bites inside the achtererfgebied and needs a polygon intersection this module does not perform',
            };
        }
        bebouwingsgebiedM2 = round3(achtererfM2 + hoofdM2 - areaOf(orig));
        caveats.push(`oorspronkelijk hoofdgebouw ${round3(areaOf(orig))} m² — evidence: ${oo.evidence}`);
    } else {
        bebouwingsgebiedM2 = { lowerM2: achtererfM2, upperExclusiveM2: round3(achtererfM2 + hoofdM2) };
        caveats.push(
            'the oorspronkelijk hoofdgebouw is UNKNOWN (a legal fact BAG does not carry — Gap 5): the bebouwingsgebied is ' +
            'bounded, not known; the upper bound assumes an original of vanishing area and is EXCLUSIVE',
        );
    }

    const f = nlBruidsschatMaxBijbehorendOppervlakM2;
    const maxBijbehorendM2: number | NlAreaBounds =
        typeof bebouwingsgebiedM2 === 'number'
            ? round3(f(bebouwingsgebiedM2))
            : { lowerM2: round3(f(bebouwingsgebiedM2.lowerM2)), upperExclusiveM2: round3(f(bebouwingsgebiedM2.upperExclusiveM2)) };

    const existing = input.existingBijbehorendeBouwwerkenM2 ?? null;
    let remaining: number | NlAreaBounds | null = null;
    if (existing !== null && Number.isFinite(existing) && existing >= 0) {
        remaining =
            typeof maxBijbehorendM2 === 'number'
                ? round3(Math.max(0, maxBijbehorendM2 - existing))
                : { lowerM2: round3(Math.max(0, maxBijbehorendM2.lowerM2 - existing)), upperExclusiveM2: round3(Math.max(0, maxBijbehorendM2.upperExclusiveM2 - existing)) };
    } else {
        caveats.push('existing bijbehorende bouwwerken were not supplied — the maximum is GROSS; they count against it');
    }

    const fmt = (v: number | NlAreaBounds): string => (typeof v === 'number' ? `${v} m²` : `[${v.lowerM2}, ${v.upperExclusiveM2}) m²`);
    return {
        kind: 'derived',
        voorkant,
        zijgevelLines: Object.freeze(zijgevelLines),
        achtererfgebied: { parts, areaM2: achtererfM2 },
        hoofdgebouwM2: hoofdM2,
        oorspronkelijkStatus: oo.kind,
        bebouwingsgebiedM2,
        maxBijbehorendM2,
        remainingBijbehorendM2: remaining,
        caveats: Object.freeze(caveats),
        why:
            `voorkant = the hoofdgebouw face nearest perceel edge ${vk.edgeIndex} (public-adjacent), ${round3(vk.faceDepthM)} m ` +
            `behind it; the achtererf line lies ${VOORKANT_OFFSET_M} m behind that face` +
            (zijgevelLines.length > 0 ? `, and ${zijgevelLines.length} zijgevel line(s) close the corner side(s)` : '') +
            `. achtererfgebied ${achtererfM2} m²; hoofdgebouw ${hoofdM2} m²; bebouwingsgebied ${fmt(bebouwingsgebiedM2)}; ` +
            `art. 22.36 maximum oppervlakte bijbehorende bouwwerken ${fmt(maxBijbehorendM2)}` +
            (remaining !== null ? ` (remaining after ${existing} m² existing: ${fmt(remaining)})` : '') +
            '.',
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RuleState projection — D3
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Project onto **D3** (bonuses and increments).
 *
 *   derived, number      → `resolved` / `derivable` (computed from BRK + BAG + BGT geometry), unit m2.
 *   derived, bounds      → `unrecovered` / `semantic` / mechanism `present`, with the bounds CARRIED in
 *                          `partial` (visible, never bound as a cap — §DATUM-DECISION's discipline).
 *   refused: input gaps  → `unrecovered` / `inaccessible` (supply the input and retry).
 *   refused: legal/topo  → `unrecovered` / `semantic`.
 */
export function nlBebouwingsgebiedToRuleState(r: NlBebouwingsgebiedResult, ref: RuleState['ref']): RuleState {
    if (r.kind === 'derived') {
        if (typeof r.maxBijbehorendM2 === 'number') {
            return {
                rule: 'D3',
                status: 'resolved',
                reachability: 'derivable',
                value: r.maxBijbehorendM2,
                unit: 'm2',
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        }
        return {
            rule: 'D3',
            status: 'unrecovered',
            reachability: 'derivable',
            failure: 'semantic',
            mechanism: 'present',
            stoppedAt: 'the oorspronkelijk hoofdgebouw is unknown (a legal fact BAG does not carry); the maximum is bounded, not known',
            partial: {
                value: `${r.maxBijbehorendM2.lowerM2}–${r.maxBijbehorendM2.upperExclusiveM2}`,
                unit: 'm2 (bounds; upper exclusive)',
                verbatim: NL_BRUIDSSCHAT_22_36_BIJBEHOREND.oppervlakte.above300,
            },
            ref,
        };
    }
    const inputGap =
        r.reason === 'perceel-invalid' ||
        r.reason === 'hoofdgebouw-invalid' ||
        r.reason === 'erf-invalid' ||
        r.reason === 'edge-classification-mismatch' ||
        r.reason === 'no-public-adjacent-edge' ||
        r.reason === 'hoofdgebouw-outside-perceel' ||
        r.reason === 'oorspronkelijk-invalid';
    return {
        rule: 'D3',
        status: 'unrecovered',
        reachability: 'derivable',
        failure: inputGap ? 'inaccessible' : 'semantic',
        mechanism: 'present',
        stoppedAt: `${r.reason}: ${r.detail}`,
        partial: null,
        ref,
    };
}
