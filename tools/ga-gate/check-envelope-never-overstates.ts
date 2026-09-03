#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-envelope-never-overstates.ts
 *
 * GA Gate — THE NEVER-OVERSTATE INVARIANT (C58 §1.4 / §1.14.4; REPORT §M; lane E2a, 2026-09-01).
 *
 * ── WHAT IT PROTECTS ─────────────────────────────────────────────────────────
 * For EVERY rule pack registered in the shipping corpus (`rulepacks/registry.ts` —
 * read live via `listJurisdictionCoverage()` + `resolveZoneDisposition()`, never a
 * transcribed list), plus the estimated-default pack, this gate solves a canonical
 * parcel through the REAL `computeBuildableEnvelope` and rasterises it through the
 * REAL `envelopeToMassing` (STRUCTURAL-SEAM-1), then asserts that the computed
 * envelope never exceeds a legal maximum on ANY axis:
 *
 *   • HEIGHT   — no volume-claiming solid tops out above the height the envelope
 *                grants; a single-prism envelope never publishes a height above the
 *                pack zone's own stated `maxHeight_m`.
 *   • FAR      — when the zone's FAR binds below the height cap, `maxVolumeM3` and
 *                the summed drawn volume are both ≤ `footprint × farLimitedHeight`
 *                (the §L-616 arithmetic — mechanism B of REPORT §M, fixed by
 *                §NEVER-OVERSTATE-B; this arm is what fails if that fix is reverted).
 *   • COVERAGE — a tiered, coverage-capped envelope never publishes a study volume
 *                above `maxCoverage × parcelArea × height` (ADR-0272 §3.2).
 *   • SETBACK  — the buildable footprint never exceeds the parcel; and a zone with
 *                an UNRESOLVED setback axis (null in the pack, no footprint-shaping
 *                geometric rule) must carry `footprintIsUpperBound` — `unknown ≠ 0`
 *                (mechanism A of REPORT §M / §L-619, fixed by §NEVER-OVERSTATE-A;
 *                this arm is what fails if THAT fix is reverted).
 *   • VOLUME   — Σ volume(claimsVolume solids) ≤ the geometric cap the envelope
 *                grants (`maxVolumeM3` ?? Σ tier.area × tier.height) — §1.14.4.
 *
 * A zone that REFUSES (block-derived without a block ring, explicit-area without a
 * footprint, a gated jurisdiction) draws NOTHING (`envelopeToMassing` → []), which
 * can never overstate — refusal is a correct answer, and it is COUNTED, not skipped
 * silently.
 *
 * ── SELF-TEST (the planted overstating pack) ─────────────────────────────────
 * Two layers, run on every invocation:
 *   1. ENGINE TEETH — a planted, in-memory pack (never registered, never on disk;
 *      the rulepacks/ tree is not touched) with a partially-unknown setback AND a
 *      binding FAR is solved through the real engine. If either §NEVER-OVERSTATE
 *      fix is reverted, this planted zone produces a REAL finding → exit 1.
 *   2. CHECKER TEETH — the planted zone's HONEST output is then TAMPERED into the
 *      pre-fix shape (upper-bound flag cleared; volume restored to the full shell)
 *      and re-audited. If the audit does NOT flag every tampered axis, this gate
 *      can no longer see the defect class it polices → exit 2 (UNPROVEN), never 0.
 *
 * ── HONESTY FLOORS (exit 2, never a silent pass) ─────────────────────────────
 *   • zero pack-bearing jurisdictions walked, or fewer than MIN_ZONES zones, or
 *     fewer than MIN_SOLVED envelopes actually solving `ok` — "looked nowhere"
 *     and "found nothing wrong" are different verdicts (§CONTEXT-DATA-HONESTY);
 *   • the production modules fail to import/run under node;
 *   • the checker-teeth tamper is not flagged (see above).
 *
 * ── EXIT CODES (standard run-all.ts contract) ────────────────────────────────
 *   0 — PASS: every registered pack walked; no axis overstated; self-tests fired.
 *   1 — FAIL: a real overstatement on a registered (or planted-through-engine)
 *       pack — the finding names the pack, the zone and the AXIS.
 *   2 — UNPROVEN: an honesty floor breached — the gate could not measure what it
 *       polices. Never aliases with 1.
 *   3 — unused. This gate is hard-fail-at-zero from birth: no baseline, no
 *       ratchet, and it must never acquire one (raising a ceiling here would be
 *       licensing an overstatement — §RATCHET-EXCEEDED-IS-NEVER-DEBT).
 *
 * ── LIVE-RESOLVED ROUTE ARMS (LANE G1, 2026-09-02 — lane-b Q1: the corpus walk above
 *    exercises pack-declared zones; the LIVE-RESOLVED routes contributed ZERO solves) ──
 * Recorded-fixture arms mirroring the LIVE dispatchers' structured records, on the
 * NL-courtyard pattern (section 2b): each drives the REAL production chain on a fixture
 * RECORDED from the live probe (corpus/never-overstate/*.json — never re-fetched), audits
 * it against an INDEPENDENTLY transcribed published bound, and carries its own teeth (a
 * tampered pre-fix shape must be flagged, or the arm is declared blind → exit 2):
 *   2c PARIS   — resolveParisEnvelope (stub fetch replaying the recorded /api/paris/plu
 *                body) → computeParisEnvelope. Drawn ECM volume ≤ published st_area_shape
 *                × published plub_hauteur ceiling; the couronnement (cour=X) stays a
 *                PARTIAL refusal that never adds volume; a no-ECM point draws NOTHING
 *                (the Paris overstate direction is drawing where ECM is absent).
 *   2d DENMARK — mapPlandataToZoningRecord + computeBuildableEnvelope AND the
 *                mapDkFeatureToRules → deriveDkGfaFromBebygpctRule GFA consumer, on the
 *                live-probed Nørrebro (af=4, the valid multiply: GFA ≤ 150 % × 3776 m²)
 *                and Aarhus (af=1, the denominator REFUSAL stays a refusal; the naive
 *                14 927 m² product is grepped for as a tripwire and must appear NOWHERE).
 *   2e MADRID  — resolveMadridNZ1Ring (stub fetch replaying the recorded layer-6 body) →
 *                computeBuildableEnvelope explicit-area clip. Footprint ≤ parcel ∩
 *                published ring; COEF_Z semantics stay WITHHELD (no height/FAR/volume may
 *                ride on the envelope); zero claimed volume.
 *
 * PURE READ: solves synthetic parcels in memory through pure L2 functions. No I/O
 * beyond module import and reading the gate's OWN recorded-fixture corpus
 * (tools/ga-gate/corpus/never-overstate/ — deterministic, in-repo, never a network
 * fetch). No network, no writes. Deterministic.
 */

import { readFileSync } from 'node:fs';

import type { JurisdictionZoningContract, Pt, ZoningRecord, ParcelEdgeClassification } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    envelopeToMassing,
    massingSolidVolumeM3,
    totalMassingVolumeM3,
    computeFarLimitedHeight,
    listJurisdictionCoverage,
    registeredPackZoneCodes,
    resolveZoneDisposition,
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
    // §NL-BOUWVLAK-HOLES (L-12896) — the courtyard arm (section 2b) runs the NL explicit-area
    // pack with an injected parts+holes footprint, the shape the NL provider emits.
    NL_BESTEMMINGSPLAN_PACK,
    NL_ZONE_CODE,
    // §PARIS-LIVE-ROUTE (2c) — the recorded-fixture Paris chain (§PARIS-SIGN-OFF, gate ON).
    resolveParisEnvelope,
    computeParisEnvelope,
    PARIS_ECM_MISSING_COURONNEMENT,
    // §DK-DENOMINATOR-LIVE (2d) — the two live DK consumers of a bebygpct rule.
    mapPlandataToZoningRecord,
    mapDkFeatureToRules,
    deriveDkGfaFromBebygpctRule,
    // §MADRID-NZ1-LIVE (2e) — the explicit-ring route (SIG-M2, gate ON).
    resolveMadridNZ1Ring,
    MADRID_NZ1_RING_REF,
    ES_MADRID_NZ1_PACK,
    // §PT-PORTO-MODA (2f) — the certified FUC card (§PORTO-SIGN-OFF, gate ON; ADR-0379).
    resolvePtZoneIdentityAt,
    PT_PORTO_PDM_CERTIFIED,
    // §PL-POG-COMPILE (2h) — POLAND POG APP GML strefa → envelope-contribution scalars (LANE PL-POG).
    // HEIGHT binds; FAR + COVERAGE are compiled FACTS but WITHHELD (działka-budowlana denominator).
    plPogZoningRecord,
    resolvePlPogEnvelope,
    type PlPogFields,
    type PlPogCitation,
    // §LU-PAG-COMPILE (2i, LANE LU-ENVELOPE) — LUXEMBOURG PAG NQ-PAP coefficients. ⛔ NOTHING
    // BINDS (terrain-à-bâtir denominators + Art. 26 zone averages + no vertical axis served +
    // the shut L-449 gate): the compiled record must REFUSE, and the facts must stay faithful.
    luPagZoningRecord,
    resolveLuPagEnvelope,
    LU_PAG_CERTIFIED,
    type LuPagFields,
    type LuPagCitation,
    type LuPagEnvelopeResolution,
    // §FR-PLAN-MASSE-LIVE (2g, LANE FR-PRESCRIPTIONS) — the GPU drawn-envelope consumer + its
    // explicit-area seat. The plan-masse polygon feeds the SAME explicit-area clip as Madrid NZ-1.
    buildFrDrawnEnvelopeContribution,
    frFootprintToSceneParts,
    frPrescriptionGeoFeaturesAtPoint,
    FR_PLAN_MASSE_EXPLICIT_AREA_PACK,
    solveExplicitArea,
    type BuildableEnvelopeMassingInput,
    type ParisEnvelopeResult,
    type PlandataLayer,
} from '../../packages/site-parcel-data/src/index.js';

// ── Honesty floors — see header. Conservative: the corpus holds ~6 pack-bearing
// jurisdictions and ~80 pack zones today; these floors only catch "walked nowhere".
const MIN_PACK_JURISDICTIONS = 3;
const MIN_ZONES = 20;
const MIN_SOLVED = 5;

const EPS_REL = 1e-9;
const EPS_ABS = 1e-6;

function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
function polyArea(ring: ReadonlyArray<Pt>): number {
    if (ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

const PARCEL = rect(0, 0, 30, 24); // 720 m² canonical study parcel
const PARCEL_AREA = polyArea(PARCEL);
const CLASSIFIED: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
const UNCLASSIFIED: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];

/** Minimal synthetic provider record for a pack zone — no structured fields, so every
 *  number resolves from the PACK (which is the subject under audit). */
function packZoneRecord(jurisdictionId: string, zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: `never-overstate audit: ${zoneCode}`,
        jurisdictionId,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'never-overstate-gate',
            label: 'synthetic audit record',
            version: 'gate',
            license: null,
            crs: 'EPSG:4326',
        },
    } as unknown as ZoningRecord;
}

interface Finding {
    readonly axis: 'height' | 'far' | 'coverage' | 'setback' | 'volume';
    readonly pack: string;
    readonly zone: string;
    readonly detail: string;
}

/** The geometric volume the envelope GRANTS (§1.14.4's right-hand side). */
function geometricCapM3(env: BuildableEnvelopeMassingInput): number {
    const tiers = env.tiers ?? [];
    if (tiers.length > 0) {
        let c = 0;
        for (const t of tiers) {
            const area = t.areaM2 > 0 ? t.areaM2 : polyArea(t.polygon);
            c += area * Math.max(0, t.maxHeight_m ?? 0);
        }
        return c;
    }
    const area = env.insetAreaM2 && env.insetAreaM2 > 0 ? env.insetAreaM2 : polyArea(env.insetPolygon);
    if (typeof env.maxVolumeM3 === 'number') return env.maxVolumeM3;
    return area * Math.max(0, env.maxHeight_m ?? 0);
}

/**
 * Audit ONE solved envelope + its zone declaration on every axis. Returns findings
 * ([] = clean). `zone` is null for the estimated-default / minimal cases.
 */
function auditEnvelope(
    env: ReturnType<typeof computeBuildableEnvelope>,
    zone: JurisdictionZoningContract['zones'][number] | null,
    packLabel: string,
    zoneLabel: string,
    parcelAreaM2: number,
): Finding[] {
    const findings: Finding[] = [];
    const f = (axis: Finding['axis'], detail: string): void => {
        findings.push({ axis, pack: packLabel, zone: zoneLabel, detail });
    };
    if (env.status !== 'ok') return findings; // refusal/degenerate draws nothing — cannot overstate

    const solids = envelopeToMassing(env);

    // ── SETBACK axis ──────────────────────────────────────────────────────────
    if (env.insetAreaM2 > parcelAreaM2 * (1 + EPS_REL) + EPS_ABS) {
        f('setback', `insetAreaM2 ${env.insetAreaM2.toFixed(2)} exceeds the parcel ${parcelAreaM2.toFixed(2)} m²`);
    }
    if (zone) {
        const shaping =
            zone.geometricRule != null &&
            ['alignment', 'block-derived-alignment', 'tiered-occupation', 'explicit-area', 'occupation-capped-alignment']
                .includes(zone.geometricRule.kind);
        const unknownAxes = (['front_m', 'side_m', 'rear_m'] as const).filter(
            (k) => zone.setbacks[k] === null,
        );
        if (unknownAxes.length > 0 && !shaping && env.footprintIsUpperBound !== true) {
            f(
                'setback',
                `setback axis/axes UNRESOLVED (${unknownAxes.join(', ')}) with no footprint-shaping ` +
                    'rule, yet footprintIsUpperBound is not set — the 0-inset is silent ' +
                    '(mechanism A, §NEVER-OVERSTATE-A / §L-619: unknown ≠ zero)',
            );
        }
    }

    // ── HEIGHT axis ───────────────────────────────────────────────────────────
    const tiers = env.tiers ?? [];
    const grantedTop =
        tiers.length > 0
            ? Math.max(...tiers.map((t) => (t.baseHeight_m ?? 0) + (t.maxHeight_m ?? 0)))
            : env.maxHeight_m ?? 0;
    for (const s of solids) {
        if (!s.claimsVolume) continue;
        if (s.topHeightM > grantedTop * (1 + EPS_REL) + EPS_ABS) {
            f('height', `solid ${s.id} tops at ${s.topHeightM.toFixed(2)} m above the granted ${grantedTop.toFixed(2)} m`);
        }
    }
    if (zone && tiers.length === 0 && zone.maxHeight_m !== null && env.maxHeight_m !== null) {
        if (env.maxHeight_m > zone.maxHeight_m * (1 + EPS_REL) + EPS_ABS) {
            f('height', `envelope maxHeight ${env.maxHeight_m} m exceeds the pack zone's stated ${zone.maxHeight_m} m`);
        }
    }

    // ── FAR axis (mechanism B) ────────────────────────────────────────────────
    const far = computeFarLimitedHeight({
        maxFAR: env.maxFAR,
        parcelAreaM2,
        footprintAreaM2: env.insetAreaM2,
        maxHeight_m: env.maxHeight_m,
        maxFloors: env.maxFloors,
    });
    if (far.binds && far.farLimitedHeight_m !== null) {
        const farVolume = env.insetAreaM2 * far.farLimitedHeight_m;
        if (env.maxVolumeM3 !== null && env.maxVolumeM3 > farVolume * (1 + EPS_REL) + EPS_ABS) {
            f(
                'far',
                `maxVolumeM3 ${env.maxVolumeM3.toFixed(1)} m³ exceeds the FAR-permitted ` +
                    `${farVolume.toFixed(1)} m³ (FAR ${env.maxFAR}) — mechanism B, §NEVER-OVERSTATE-B`,
            );
        }
        const claimed = totalMassingVolumeM3(solids);
        if (claimed > farVolume * (1 + EPS_REL) + EPS_ABS) {
            f('far', `drawn solids claim ${claimed.toFixed(1)} m³ above the FAR-permitted ${farVolume.toFixed(1)} m³`);
        }
    }

    // ── COVERAGE axis ─────────────────────────────────────────────────────────
    if (tiers.length > 0 && env.maxCoverage !== null && env.maxHeight_m !== null && env.maxVolumeM3 !== null) {
        const covCap = env.maxCoverage * parcelAreaM2 * env.maxHeight_m;
        if (env.maxVolumeM3 > covCap * (1 + EPS_REL) + EPS_ABS) {
            f('coverage', `maxVolumeM3 ${env.maxVolumeM3.toFixed(1)} m³ exceeds the coverage cap ${covCap.toFixed(1)} m³`);
        }
    }

    // ── VOLUME axis (§1.14.4 — the drawn solids vs the granted cap) ──────────
    const cap = geometricCapM3(env);
    const claimed = totalMassingVolumeM3(solids);
    if (claimed > cap * (1 + EPS_REL) + EPS_ABS) {
        f('volume', `Σ drawn volume ${claimed.toFixed(1)} m³ exceeds the granted cap ${cap.toFixed(1)} m³`);
    }
    for (const s of solids) {
        if (!s.claimsVolume && massingSolidVolumeM3(s) !== 0) {
            f('volume', `${s.role} solid ${s.id} claims volume but is declared claimsVolume:false`);
        }
    }
    return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// LANE G1 — the recorded-fixture corpus + per-route audit measures (sections 2c–2e).
// ═════════════════════════════════════════════════════════════════════════════

/** Read one recorded fixture from the gate's own corpus dir (deterministic, in-repo). */
function readCorpusFixture<T>(name: string): T {
    const url = new URL(`./corpus/never-overstate/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** A recorded fetch stub: replays ONE recorded body for every request — never the network. */
function recordedFetch(body: unknown): typeof fetch {
    return (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
}

/**
 * §PARIS-LIVE-ROUTE — audit ONE computeParisEnvelope result against the INDEPENDENTLY
 * transcribed published bounds (st_area_shape × plub_hauteur). The projection is stated
 * accurate to well under 1 % (projectParisRingToEnu), so the footprint/volume bounds carry
 * a 1 % tolerance; the height bound is exact (min of published candidates).
 * A refusal draws nothing and cannot overstate → [].
 */
const PARIS_PROJECTION_TOL = 1.01;
function auditParisSolve(
    r: ParisEnvelopeResult,
    publishedAreaM2: number,
    publishedCeilingM: number,
    zoneLabel: string,
): Finding[] {
    const findings: Finding[] = [];
    const f = (axis: Finding['axis'], detail: string): void => {
        findings.push({ axis, pack: 'fr-75056-paris/live-route', zone: zoneLabel, detail });
    };
    if (!r.ok) return findings;
    if (r.footprintAreaM2 > publishedAreaM2 * PARIS_PROJECTION_TOL + EPS_ABS) {
        f(
            'setback',
            `drawn ECM footprint ${r.footprintAreaM2.toFixed(2)} m² exceeds the published ` +
                `st_area_shape ${publishedAreaM2.toFixed(2)} m² beyond projection tolerance`,
        );
    }
    if (r.height_m > publishedCeilingM * (1 + EPS_REL) + EPS_ABS) {
        f('height', `drawn height ${r.height_m} m exceeds the published plub_hauteur ceiling ${publishedCeilingM} m`);
    }
    const volumeCap = publishedAreaM2 * publishedCeilingM * PARIS_PROJECTION_TOL;
    if (r.volumeM3 > volumeCap + EPS_ABS) {
        f(
            'volume',
            `drawn ECM volume ${r.volumeM3.toFixed(1)} m³ exceeds the published footprint × published ` +
                `ceiling = ${(publishedAreaM2 * publishedCeilingM).toFixed(1)} m³ ` +
                `(excess ${(r.volumeM3 - publishedAreaM2 * publishedCeilingM).toFixed(1)} m³)`,
        );
    }
    if (r.volumeM3 > r.footprintAreaM2 * r.height_m * (1 + EPS_REL) + EPS_ABS) {
        f('volume', `volumeM3 ${r.volumeM3.toFixed(1)} exceeds its own footprint × height product`);
    }
    return findings;
}

/**
 * §MADRID-NZ1-LIVE — audit the NZ-1 explicit-ring envelope. The ring is the WHOLE claim
 * (COEF_Z semantics are withheld behind L-449 — siteDispatch §MADRID-NZ1 asserts NO
 * height/FAR from it), so the never-overstate bounds are: footprint ≤ parcel ∩ published
 * ring (1 % projection tolerance) and ZERO claimed volume — a numeric height/FAR/volume
 * on this envelope is an unauthorised read of COEF_Z, not a stronger answer.
 */
function auditMadridNz1(
    env: ReturnType<typeof computeBuildableEnvelope>,
    honestCeilingM2: number,
    zoneLabel: string,
): Finding[] {
    const findings: Finding[] = [];
    const f = (axis: Finding['axis'], detail: string): void => {
        findings.push({ axis, pack: 'es-28079-madrid/nz1-live-route', zone: zoneLabel, detail });
    };
    if (env.status !== 'ok') return findings;
    if (env.insetAreaM2 > honestCeilingM2 * 1.01 + EPS_ABS) {
        f(
            'setback',
            `explicit-ring clip granted ${env.insetAreaM2.toFixed(1)} m² where parcel ∩ published ring ` +
                `is ${honestCeilingM2.toFixed(1)} m² — buildable area drawn outside the published footprint`,
        );
    }
    if (env.maxHeight_m !== null) {
        f('height', `envelope states maxHeight ${env.maxHeight_m} m — NZ-1 publishes no height; COEF_Z semantics are withheld (L-449)`);
    }
    if (env.maxFAR !== null) {
        f('far', `envelope states FAR ${env.maxFAR} — an unauthorised numeric read of COEF_Z (its use as edificabilidad is NOT authorised)`);
    }
    if (env.maxVolumeM3 !== null) {
        f('volume', `envelope states maxVolumeM3 ${env.maxVolumeM3} — NZ-1 grants a footprint, never a volume`);
    }
    const claimed = totalMassingVolumeM3(envelopeToMassing(env));
    if (claimed > 0 + EPS_ABS) {
        f('volume', `drawn solids claim ${claimed.toFixed(1)} m³ where the published ceiling is 0 m³ (the ring is the whole claim)`);
    }
    return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// The planted overstating pack — IN MEMORY ONLY (the rulepacks/ tree is E4-owned
// and is not touched). Partially-unknown setbacks + a binding FAR: the exact
// two-mechanism shape REPORT §M documents. Solved through the REAL engine.
// ═════════════════════════════════════════════════════════════════════════════
const PLANTED_PACK: JurisdictionZoningContract = {
    jurisdictionId: 'xx-planted-never-overstate',
    displayName: 'Planted self-test pack (never registered)',
    source: 'manual',
    crs: 'EPSG:4326',
    lastReviewed: '2026-09-01',
    defaultConfidence: 'estimated-ruleset',
    zones: [
        {
            code: 'PLANT-1',
            label: 'planted: partial-unknown setbacks + binding FAR',
            permittedUse: ['residential'],
            maxHeight_m: 24,
            maxFloors: null,
            plotRatioFAR: 1.5,
            maxCoverage: null,
            setbacks: { front_m: 3, side_m: null, rear_m: null },
            fieldProvenance: {},
            geometricRule: null,
            ordinanceRef: null,
        },
    ],
};

async function main(): Promise<number> {
    let packJurisdictions = 0;
    let zonesWalked = 0;
    let solved = 0;
    let refused = 0;
    const findings: Finding[] = [];
    // Declared here (not in section 4) so section 2b's courtyard-arm teeth can also set it.
    let checkerBlind: string | null = null;

    // ── 1. The registered corpus, read live from the shipping registry. ───────
    const coverage = listJurisdictionCoverage().filter((j) => j.packZoneCodes.length > 0);
    for (const jur of coverage) {
        packJurisdictions++;
        for (const code of registeredPackZoneCodes(jur.jurisdictionId)) {
            const disp = resolveZoneDisposition(jur.jurisdictionId, code);
            if (disp.kind !== 'pack') continue;
            const zone = disp.pack.zones.find((z) => z.code === code) ?? null;
            for (const edges of [CLASSIFIED, UNCLASSIFIED]) {
                zonesWalked++;
                const env = computeBuildableEnvelope({
                    parcelRing: PARCEL,
                    edgeClassifications: edges,
                    zoning: packZoneRecord(jur.jurisdictionId, code),
                    rulePack: disp.pack,
                });
                if (env.status === 'ok') solved++;
                else refused++;
                findings.push(
                    ...auditEnvelope(env, zone, jur.jurisdictionId, `${code}/${edges === CLASSIFIED ? 'classified' : 'unclassified'}`, PARCEL_AREA),
                );
            }
        }
    }

    // ── 2. The estimated-default pack (the fallback every unregistered plot gets). ──
    {
        zonesWalked++;
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: UNCLASSIFIED,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
        });
        if (env.status === 'ok') solved++;
        else refused++;
        const zone = ESTIMATED_DEFAULT_PACK.zones[0] ?? null;
        findings.push(...auditEnvelope(env, zone, 'estimated-default', zone?.code ?? '?', PARCEL_AREA));
    }

    // ── 2b. §NL-BOUWVLAK-HOLES (L-12896) + §K1-CARVE — the explicit-area COURTYARD arm. ─────
    // A published footprint with an interior courtyard ("do not build here"), forwarded as
    // parts + holes — the shape the NL provider emits since L-12896 — on a parcel that CONTAINS
    // the courtyard.
    //
    // ⚠ FLIPPED (lane K1): this arm used to accept EITHER the interim honest refusal
    // (`hole-intersects-parcel`) OR a solved area excluding the hole. The exact carve landed
    // (§K1-POLY-DIFFERENCE, `packages/site-parcel-data/src/geometry/polygonDifference.ts`), so
    // the arm now REQUIRES the carve: the solve must be `ok` with area = outer − courtyard,
    // short of no more than the inward-biased bridge slit (< 1 m² on this fixture, and always a
    // LOSS — the slit corridor is subtracted, never added). A solved area that reaches into the
    // hole is the L-616 overstate this gate exists to catch; a refusal or a gross under-carve is
    // a regression from the shipped carve and reads UNPROVEN.
    {
        const courtyardOuter = rect(0, 0, 100, 100);      // 10,000 m² published outer
        const courtyardHole = rect(35, 35, 65, 65);       //    900 m² published "do not build here"
        const courtyardParcel = rect(-10, -10, 110, 110); // the parcel CONTAINS the courtyard
        const honestCeiling = polyArea(courtyardOuter) - polyArea(courtyardHole); // 9,100 m²
        // Mirror the LIVE dispatcher's record: the NL route always ships the maatvoering in
        // `structuredFields` (a bare packZoneRecord refuses before the clip is ever reached,
        // which would make this arm vacuous — the teeth below prove it is not).
        const courtyardZoning = {
            ...packZoneRecord(NL_BESTEMMINGSPLAN_PACK.jurisdictionId, NL_ZONE_CODE),
            structuredFields: { maxHeight_m: 15 },
        } as unknown as ZoningRecord;
        const courtyardBase = {
            parcelRing: courtyardParcel,
            edgeClassifications: UNCLASSIFIED,
            zoning: courtyardZoning,
            rulePack: NL_BESTEMMINGSPLAN_PACK,
        } as const;
        zonesWalked++;
        const env = computeBuildableEnvelope({
            ...courtyardBase,
            explicitAreaFootprintParts: [{ outer: courtyardOuter, holes: [courtyardHole] }],
        });
        if (env.status === 'ok') solved++;
        else refused++;
        if (env.status === 'ok' && env.insetAreaM2 > honestCeiling + EPS_ABS) {
            findings.push({
                axis: 'setback',
                pack: NL_BESTEMMINGSPLAN_PACK.jurisdictionId,
                zone: `${NL_ZONE_CODE}/courtyard-hole`,
                detail:
                    `explicit-area solve granted ${env.insetAreaM2.toFixed(1)} m² where the honest ` +
                    `ceiling is ${honestCeiling.toFixed(1)} m² (outer minus courtyard) — the published ` +
                    'hole was dropped (L-12896 / the L-616 direction)',
            });
        }
        // §K1-CARVE — THE FLIPPED EXPECTATION: the exact carve is SHIPPED, so this arm now
        // REQUIRES it. A refusal (the pre-K1 interim answer) or an under-carve beyond the slit
        // budget means the carve path regressed — the fixture can no longer prove the shipped
        // behaviour, which is the UNPROVEN exit, not an overstatement finding.
        if (env.status !== 'ok') {
            checkerBlind ??=
                `courtyard arm (§K1-CARVE): the exact carve did not solve (status=${env.status}) — ` +
                'the arm requires the carve since lane K1; a refusal here is a regression from the ' +
                'shipped exact-carve behaviour';
        } else if (env.insetAreaM2 < honestCeiling - 1) {
            checkerBlind ??=
                `courtyard arm (§K1-CARVE): carved area ${env.insetAreaM2.toFixed(3)} m² under-shot ` +
                `the exact carve ${honestCeiling.toFixed(1)} m² by more than the 1 m² slit budget — ` +
                'not the shipped inward-biased bridge (bias is millimetre-scale, not metre-scale)';
        }
        // CHECKER TEETH for this arm: the PRE-FIX wiring (outer ring only, hole dropped) must
        // register as an overstatement under the same measure, or the arm is blind.
        const preFix = computeBuildableEnvelope({
            ...courtyardBase,
            explicitAreaFootprint: courtyardOuter,
        });
        if (!(preFix.status === 'ok' && preFix.insetAreaM2 > honestCeiling + EPS_ABS)) {
            checkerBlind ??=
                `courtyard-arm teeth: the outer-only (pre-fix) feed did not reproduce the ` +
                `overstatement (status=${preFix.status}) — the arm cannot see the defect it polices`;
        }
    }

    // ── 2c. §PARIS-LIVE-ROUTE (LANE G1) — the RECORDED live-probed Paris chain. ───────
    // resolveParisEnvelope on a stub fetch replaying the recorded /api/paris/plu body at the
    // signed route's live-probed parcel (19-DL-0002), then computeParisEnvelope — the exact
    // production chain siteDispatch drives. Bounds come from `published` (independently
    // transcribed from the same probe), NEVER from the solve itself.
    {
        interface ParisFixture {
            readonly point: { readonly lat: number; readonly lon: number };
            readonly body: unknown;
            readonly published: { readonly ecmAreaM2: number; readonly heightCeilingM: number; readonly cadastral: string };
        }
        const fix = readCorpusFixture<ParisFixture>('paris-plu-19-DL-0002.json');
        const resolved = await resolveParisEnvelope(fix.point.lat, fix.point.lon, {
            fetchImpl: recordedFetch(fix.body),
        });
        if (!resolved.ok || resolved.inputs.ecmGeometry === null || resolved.inputs.heightCeiling_m === null) {
            checkerBlind ??=
                `Paris arm: the recorded fixture did not resolve to ECM inputs ` +
                `(${resolved.ok ? 'ok but ECM/height missing' : `refused: ${resolved.reason}`}) — the arm walked no solve`;
        } else {
            const inputs = resolved.inputs;
            // (i) the base solve — must DRAW, and never above published footprint × published ceiling.
            zonesWalked++;
            const base = computeParisEnvelope(inputs, []);
            if (base.ok) solved++; else refused++;
            if (!base.ok || !(base.volumeM3 > 0)) {
                checkerBlind ??=
                    `Paris arm: the recorded ECM parcel did not solve to a positive volume ` +
                    `(${base.ok ? `volume ${base.volumeM3}` : `refused: ${base.refusedComponent}`}) — a vacuous arm, not a pass`;
            }
            findings.push(...auditParisSolve(base, fix.published.ecmAreaM2, fix.published.heightCeilingM, `${fix.published.cadastral}/base`));

            // (ii) the couronnement class (filet cour = X): the crown STAYS a cited PARTIAL
            // refusal and never adds volume beyond the straight prism. Same recorded inputs,
            // crown code X — the one field varied, the class the pack test pins.
            zonesWalked++;
            const crown = computeParisEnvelope({ ...inputs, courCode: 'X' }, []);
            if (crown.ok) solved++; else refused++;
            findings.push(...auditParisSolve(crown, fix.published.ecmAreaM2, fix.published.heightCeilingM, `${fix.published.cadastral}/cour-X`));
            if (crown.ok) {
                if (crown.couronnementRefusal === null || !crown.missingRules.includes(PARIS_ECM_MISSING_COURONNEMENT)) {
                    findings.push({
                        axis: 'height',
                        pack: 'fr-75056-paris/live-route',
                        zone: `${fix.published.cadastral}/cour-X`,
                        detail:
                            'cour=X solved WITHOUT the couronnement partial refusal — the PDF-bound crown ' +
                            '(art. UG.3.2.4) was claimed as structured; the straight prism is only honest ' +
                            'with the refusal riding on it',
                    });
                }
                if (base.ok && crown.volumeM3 > base.volumeM3 * (1 + EPS_REL) + EPS_ABS) {
                    findings.push({
                        axis: 'volume',
                        pack: 'fr-75056-paris/live-route',
                        zone: `${fix.published.cadastral}/cour-X`,
                        detail: `the crown refusal ADDED volume (${crown.volumeM3.toFixed(1)} > ${base.volumeM3.toFixed(1)} m³)`,
                    });
                }
            } else {
                checkerBlind ??= 'Paris arm: the cour=X variant refused outright — the partial-refusal class was not walked';
            }

            // (iii) the no-ECM point (the recorded body minus its ECM half — the exact shape a
            // point outside the ECM layer serves): draws NOTHING. The Paris overstate direction
            // is drawing where ECM is absent (the old fabricated parcel×hauteur massing).
            zonesWalked++;
            const noEcm = computeParisEnvelope({ ...inputs, ecmGeometry: null, ecmAreaM2: null }, []);
            if (noEcm.ok) {
                solved++;
                findings.push({
                    axis: 'setback',
                    pack: 'fr-75056-paris/live-route',
                    zone: `${fix.published.cadastral}/no-ecm`,
                    detail:
                        `a point with NO published ECM footprint drew ${noEcm.footprintAreaM2.toFixed(1)} m² — ` +
                        'the footprint must be honestly withheld, never fabricated (L-616 direction)',
                });
            } else {
                refused++;
                if (noEcm.refusedComponent !== 'footprint') {
                    checkerBlind ??=
                        `Paris arm: the no-ECM point refused on '${noEcm.refusedComponent}', not 'footprint' — ` +
                        'the arm did not exercise the footprint-absence class';
                }
            }

            // CHECKER TEETH — tamper the honest solve into the PRE-FIX fabricated shape
            // (emprise = whole parcel at the hauteur: the massing this route replaced). The
            // audit measure must flag it, or this arm cannot see the defect it polices.
            if (base.ok) {
                const tampered: ParisEnvelopeResult = {
                    ...base,
                    footprintAreaM2: PARCEL_AREA, // 720 m² — the parcel, not the 83 m² ECM
                    volumeM3: PARCEL_AREA * fix.published.heightCeilingM,
                };
                if (auditParisSolve(tampered, fix.published.ecmAreaM2, fix.published.heightCeilingM, 'teeth').length === 0) {
                    checkerBlind ??=
                        'Paris arm teeth: the pre-fix parcel×hauteur shape was not flagged — the arm cannot see the defect it polices';
                }
            }
            console.log(
                `[never-overstate] §PARIS-LIVE-ROUTE: recorded parcel ${fix.published.cadastral} — base ` +
                    `${base.ok ? `${base.footprintAreaM2.toFixed(1)} m² × ${base.height_m} m` : 'refused'}, ` +
                    `cour-X partial refusal ${crown.ok && crown.couronnementRefusal !== null ? 'HELD' : 'MISSING'}, ` +
                    `no-ECM ${noEcm.ok ? 'DREW (finding)' : 'drew nothing'}.`,
            );
        }
    }

    // ── 2d. §DK-DENOMINATOR-LIVE (LANE G1) — the RECORDED Nørrebro + Aarhus chains. ───
    // Both LIVE consumers of a bebygpct rule, on the verbatim 2026-09-01 features:
    // the C58 record route (mapPlandataToZoningRecord → computeBuildableEnvelope, the
    // dispatcher's §DK-HONEST-REFUSAL path incl. its §L-620 storey-derived height) and the
    // declarative GFA consumer (mapDkFeatureToRules → deriveDkGfaFromBebygpctRule).
    {
        interface DkFixture {
            readonly layer: string;
            readonly properties: Record<string, unknown>;
            readonly parcel: { readonly areaM2: number };
            readonly published: {
                readonly bebygpct: number;
                readonly bebygpctaf: number;
                readonly maxHeightM?: number;
                readonly gfaCeilingM2?: number;
                readonly maxEtager?: number;
                readonly naiveForbidden?: string;
                readonly expectedRefusalReason?: string;
            };
        }
        const FETCHED_AT = '2026-09-01';
        const DK_FLOOR_H_M = 3.0; // the dispatcher's §L-620 labelled storey→height derivation

        // (i) Nørrebro — af=4 (Det enkelte jordstykke): the VALID multiply. GFA and the
        // FAR-limited volume must never exceed the fixture's bebygpct × grundareal.
        {
            const fix = readCorpusFixture<DkFixture>('dk-cph-noerrebro-ramme.json');
            const rec = mapPlandataToZoningRecord(
                { layer: fix.layer as PlandataLayer, properties: fix.properties },
                { fetchDateISO: FETCHED_AT },
            );
            if (rec === null || rec.structuredFields.plotRatioFAR === null) {
                checkerBlind ??=
                    'DK Nørrebro arm: the parcel-scoped (af=4) FAR did not resolve — the valid-multiply branch walked no solve';
            } else {
                const areaM2 = fix.parcel.areaM2; // 3776 (DAWA, recorded)
                const parcelRing = rect(0, 0, 59, 64); // 59 × 64 = 3,776 m² exactly
                zonesWalked++;
                const env = computeBuildableEnvelope({
                    parcelRing,
                    edgeClassifications: CLASSIFIED,
                    zoning: rec,
                    rulePack: null, // structured fields only — the live dispatcher's shape
                });
                if (env.status === 'ok') solved++; else refused++;
                findings.push(...auditEnvelope(env, null, 'dk-plandata/live-route', 'noerrebro-R24.B.3.40/af4', areaM2));
                const gfaBound = fix.published.gfaCeilingM2 ?? (fix.published.bebygpct / 100) * areaM2;
                if (env.status === 'ok') {
                    if (env.maxHeight_m !== null && fix.published.maxHeightM !== undefined &&
                        env.maxHeight_m > fix.published.maxHeightM * (1 + EPS_REL) + EPS_ABS) {
                        findings.push({
                            axis: 'height', pack: 'dk-plandata/live-route', zone: 'noerrebro-R24.B.3.40/af4',
                            detail: `envelope height ${env.maxHeight_m} m exceeds the recorded maxbygnhjd ${fix.published.maxHeightM} m`,
                        });
                    }
                    const far = computeFarLimitedHeight({
                        maxFAR: env.maxFAR,
                        parcelAreaM2: areaM2,
                        footprintAreaM2: env.insetAreaM2,
                        maxHeight_m: env.maxHeight_m,
                        maxFloors: env.maxFloors,
                    });
                    if (far.maxGFA !== null && far.maxGFA > gfaBound * (1 + EPS_REL) + EPS_ABS) {
                        findings.push({
                            axis: 'far', pack: 'dk-plandata/live-route', zone: 'noerrebro-R24.B.3.40/af4',
                            detail:
                                `computed GFA ${far.maxGFA.toFixed(1)} m² exceeds the fixture's bebygpct × grundareal = ` +
                                `${gfaBound.toFixed(1)} m² (excess ${(far.maxGFA - gfaBound).toFixed(1)} m²)`,
                        });
                    }
                } else {
                    checkerBlind ??= `DK Nørrebro arm: envelope did not solve (status=${env.status}) — a vacuous arm, not a pass`;
                }
                // The declarative GFA consumer on the SAME recorded feature.
                const rule = mapDkFeatureToRules(fix.layer as PlandataLayer, fix.properties, FETCHED_AT)
                    .rules.find((r) => r.provenance.parameter === 'bebygpct');
                const gfa = rule ? deriveDkGfaFromBebygpctRule(rule, areaM2) : null;
                if (gfa === null || gfa.kind !== 'computed') {
                    checkerBlind ??= 'DK Nørrebro arm: the GFA consumer did not compute on the parcel-scoped feature — vacuous';
                } else if (gfa.gfaM2 > gfaBound * (1 + EPS_REL) + EPS_ABS) {
                    findings.push({
                        axis: 'far', pack: 'dk-plandata/live-route', zone: 'noerrebro-R24.B.3.40/af4',
                        detail: `deriveDkGfaFromBebygpctRule granted ${gfa.gfaM2.toFixed(1)} m² above the recorded ceiling ${gfaBound.toFixed(1)} m²`,
                    });
                }
                console.log(
                    `[never-overstate] §DK-DENOMINATOR-LIVE Nørrebro (af=4): env ${env.status}, ` +
                        `GFA ${gfa && gfa.kind === 'computed' ? `${gfa.gfaM2.toFixed(0)} m²` : 'n/a'} ≤ ceiling ${gfaBound.toFixed(0)} m².`,
                );
            }
        }

        // (ii) Aarhus — af=1 (Omraadet som helhed): the denominator REFUSAL stays a refusal.
        // The naive per-parcel product 180 % × 8293 m² = 14 927.4 m² must appear NOWHERE in
        // the serialised chain output (the tripwire), and no per-parcel FAR may ride the record.
        {
            const fix = readCorpusFixture<DkFixture>('dk-aarhus-midtby-ramme.json');
            const naive = fix.published.naiveForbidden ?? '14927';
            const rec = mapPlandataToZoningRecord(
                { layer: fix.layer as PlandataLayer, properties: fix.properties },
                { fetchDateISO: FETCHED_AT },
            );
            if (rec === null) {
                checkerBlind ??= 'DK Aarhus arm: the recorded feature mapped to NO record — the refusal branch walked nothing';
            } else {
                const areaM2 = fix.parcel.areaM2; // 8293 (DAWA, recorded)
                if (rec.structuredFields.plotRatioFAR !== null) {
                    findings.push({
                        axis: 'far', pack: 'dk-plandata/live-route', zone: 'aarhus-010109CY/af1',
                        detail:
                            `a planning-area bebygpct (af=1) rode into the record as per-parcel FAR ` +
                            `${rec.structuredFields.plotRatioFAR} — the §DK-DENOMINATOR-BRANCH withhold was bypassed`,
                    });
                }
                // Mirror the dispatcher's §L-620 storey-derived height (4 × 3 m), then solve.
                const sf = rec.structuredFields;
                const zoningForEnvelope =
                    sf.maxHeight_m === null && typeof sf.maxFloors === 'number' && sf.maxFloors > 0
                        ? { ...rec, structuredFields: { ...sf, maxHeight_m: sf.maxFloors * DK_FLOOR_H_M } }
                        : rec;
                zonesWalked++;
                const env = computeBuildableEnvelope({
                    parcelRing: rect(0, 0, 82.93, 100), // 8,293 m² exactly — the recorded DAWA area
                    edgeClassifications: CLASSIFIED,
                    zoning: zoningForEnvelope,
                    rulePack: null,
                });
                if (env.status === 'ok') solved++; else refused++;
                findings.push(...auditEnvelope(env, null, 'dk-plandata/live-route', 'aarhus-010109CY/af1', areaM2));
                // The declarative GFA consumer MUST refuse naming the basis.
                const rule = mapDkFeatureToRules(fix.layer as PlandataLayer, fix.properties, FETCHED_AT)
                    .rules.find((r) => r.provenance.parameter === 'bebygpct');
                const gfa = rule ? deriveDkGfaFromBebygpctRule(rule, areaM2) : null;
                zonesWalked++; // the refusal is COUNTED, not skipped
                if (gfa === null || gfa.kind !== 'refused') {
                    solved++;
                    findings.push({
                        axis: 'far', pack: 'dk-plandata/live-route', zone: 'aarhus-010109CY/af1',
                        detail:
                            `the af=1 denominator refusal DEGRADED to ${gfa === null ? 'no rule' : `a computed GFA`} — ` +
                            'a whole-plan-area percentage was read per-parcel',
                    });
                } else {
                    refused++;
                    if (fix.published.expectedRefusalReason && gfa.reason !== fix.published.expectedRefusalReason) {
                        findings.push({
                            axis: 'far', pack: 'dk-plandata/live-route', zone: 'aarhus-010109CY/af1',
                            detail: `refusal reason '${gfa.reason}' does not name the basis ('${fix.published.expectedRefusalReason}')`,
                        });
                    }
                }
                // THE TRIPWIRE — the naive product must be produced NOWHERE in the chain output.
                const serial = JSON.stringify({ rec, env, solids: envelopeToMassing(env), gfa });
                if (serial.includes(naive)) {
                    findings.push({
                        axis: 'far', pack: 'dk-plandata/live-route', zone: 'aarhus-010109CY/af1',
                        detail:
                            `the naive planning-area product (${fix.published.bebygpct} % × ${areaM2} m² ≈ ${naive}…) ` +
                            'surfaced in the serialised chain output — the wrong-number path is alive',
                    });
                }
                // TRIPWIRE TEETH — the pre-fix shape (af=1 read as parcel) MUST surface the naive
                // product under the same serialisation, or the grep can catch nothing.
                const naiveFar = computeFarLimitedHeight({
                    maxFAR: fix.published.bebygpct / 100,
                    parcelAreaM2: areaM2,
                    footprintAreaM2: areaM2,
                    maxHeight_m: (fix.published.maxEtager ?? 4) * DK_FLOOR_H_M,
                    maxFloors: null,
                });
                if (!JSON.stringify(naiveFar).includes(naive)) {
                    checkerBlind ??=
                        'DK Aarhus arm teeth: the pre-fix per-parcel multiply did not surface the naive product — the tripwire is blind';
                }
                console.log(
                    `[never-overstate] §DK-DENOMINATOR-LIVE Aarhus (af=1): FAR withheld=${rec.structuredFields.plotRatioFAR === null}, ` +
                        `GFA consumer ${gfa && gfa.kind === 'refused' ? `REFUSED (${gfa.reason})` : 'DID NOT REFUSE'}, ` +
                        `naive '${naive}' absent=${!serial.includes(naive)}.`,
                );
            }
        }
    }

    // ── 2e. §MADRID-NZ1-LIVE (LANE G1) — the RECORDED explicit-ring route (SIG-M2, gate ON). ──
    // resolveMadridNZ1Ring on a stub fetch replaying the recorded layer-6 body, the ring
    // projected into a local metre frame (θ=0, mirroring the dispatcher), then the engine's
    // explicit-area clip against a parcel that BITES the ring — so the clip provably ran.
    {
        interface MadridFixture {
            readonly point: { readonly lat: number; readonly lon: number };
            readonly body: unknown;
            readonly published: { readonly coefZ: string; readonly codManzana: string; readonly maxClaimedVolumeM3: number };
        }
        const fix = readCorpusFixture<MadridFixture>('madrid-nz1-manzana-0105104.json');
        const resolution = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, fix.point, {
            fetchImpl: recordedFetch(fix.body),
        });
        if (!resolution.ok || resolution.ringLatLon.length < 3) {
            checkerBlind ??=
                `Madrid NZ-1 arm: the recorded ring did not resolve ` +
                `(${resolution.ok ? 'degenerate ring' : resolution.reason}) — the arm walked no solve`;
        } else {
            // Equirectangular projection about the ring centroid (θ=0 — the dispatcher's frame
            // with an identity de-rotation). Shape + area are frame-invariant.
            const lat0 = resolution.ringLatLon.reduce((a, p) => a + p.lat, 0) / resolution.ringLatLon.length;
            const lon0 = resolution.ringLatLon.reduce((a, p) => a + p.lon, 0) / resolution.ringLatLon.length;
            const M_PER_DEG_LAT = 111_320;
            const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
            const ringXZ: Pt[] = resolution.ringLatLon.map((p) => ({
                x: (p.lon - lon0) * mPerDegLon,
                z: (p.lat - lat0) * M_PER_DEG_LAT,
            }));
            const ringArea = polyArea(ringXZ);
            const xs = ringXZ.map((p) => p.x);
            const zs = ringXZ.map((p) => p.z);
            const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
            const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
            // A parcel that BITES the ring: covers its left 60 % plus a 10 m apron — the clip
            // must cut on both sides (inset < parcel AND inset < ring), or the arm is vacuous.
            const parcelRing = rect(minX - 10, minZ - 10, minX + (maxX - minX) * 0.6, maxZ + 10);
            const parcelArea = polyArea(parcelRing);
            const xOverlap = Math.max(0, Math.min(minX + (maxX - minX) * 0.6, maxX) - Math.max(minX - 10, minX));
            const zOverlap = Math.max(0, Math.min(maxZ + 10, maxZ) - Math.max(minZ - 10, minZ));
            const honestCeilingM2 = xOverlap * zOverlap; // parcel ∩ published ring (both axis-aligned)
            zonesWalked++;
            const env = computeBuildableEnvelope({
                parcelRing,
                edgeClassifications: CLASSIFIED,
                zoning: packZoneRecord(ES_MADRID_NZ1_PACK.jurisdictionId, '1.1'),
                rulePack: ES_MADRID_NZ1_PACK,
                explicitAreaFootprint: ringXZ,
            });
            if (env.status === 'ok') solved++; else refused++;
            if (env.status !== 'ok' || !(env.insetAreaM2 > 0)) {
                checkerBlind ??= `Madrid NZ-1 arm: the explicit-ring clip did not solve (status=${env.status}) — a vacuous arm, not a pass`;
            } else if (env.insetAreaM2 >= Math.min(parcelArea, ringArea) - 1) {
                checkerBlind ??=
                    `Madrid NZ-1 arm: the clip did not BITE (inset ${env.insetAreaM2.toFixed(1)} m² vs parcel ` +
                    `${parcelArea.toFixed(1)} / ring ${ringArea.toFixed(1)} m²) — the clip provably did not run`;
            }
            findings.push(...auditMadridNz1(env, honestCeilingM2, `manzana-${fix.published.codManzana}`));
            findings.push(...auditEnvelope(env, ES_MADRID_NZ1_PACK.zones[0] ?? null, 'es-28079-madrid/nz1-live-route', '1.1/explicit-ring', parcelArea));
            // CHECKER TEETH — the unauthorised COEF_Z read (a height fabricated onto the ring)
            // must be flagged by the same measure, or the arm cannot see the defect it polices.
            if (env.status === 'ok') {
                const tampered = { ...env, maxHeight_m: 20 };
                if (auditMadridNz1(tampered, honestCeilingM2, 'teeth').length === 0) {
                    checkerBlind ??=
                        'Madrid NZ-1 arm teeth: a fabricated height on the explicit-ring envelope was not flagged — the arm is blind';
                }
            }
            console.log(
                `[never-overstate] §MADRID-NZ1-LIVE: recorded manzana ${fix.published.codManzana} — clip ` +
                    `${env.status === 'ok' ? `${env.insetAreaM2.toFixed(1)} m² of ring ${ringArea.toFixed(1)} m²` : env.status}, ` +
                    `COEF_Z "${resolution.coefZ ?? 'n/a'}" withheld=${env.status !== 'ok' || (env.maxFAR === null && env.maxHeight_m === null)}, ` +
                    `claimed volume 0 m³ required.`,
            );
        }
    }

    // ── 2f. §PT-PORTO-MODA (LANE PORTO-FLIP, 2026-09-02) — the certified Porto FUC card never
    //        substitutes a scalar for the moda. Porto's cércea regime is FABRIC-DERIVED
    //        (Art. 3.º o) moda da cércea; ADR-0379 `context-aggregate`), and Art. 27.º n.º 2 b)
    //        SUBORDINATES the 21 m cap to it — so on a runtime with NO frontage source wired,
    //        the card must carry the ADR-0379 `context-set-unavailable` refusal BY NAME and
    //        never a resolved numeric cércea (the silent-substitution overstate/understate
    //        `ptPortoPdmDraft.ts` was born naming). Drives the REAL resolvePtZoneIdentityAt
    //        chain over the recorded FUC-I zone (corpus fixture — properties verbatim from the
    //        live 2026-09-02 CRUS body; see its _provenance). No envelope solve exists for PT
    //        (the pack draws nothing), so this arm audits the CARD TEXT — the artefact the
    //        user reads.
    {
        interface PtPortoFixture {
            readonly point: { readonly lat: number; readonly lon: number };
            readonly properties: Record<string, unknown>;
        }
        const fix = readCorpusFixture<PtPortoFixture>('pt-porto-fuc1-aliados.json');
        const half = 0.01;
        const { lat, lon } = fix.point;
        const itemsBody = {
            type: 'FeatureCollection',
            numberReturned: 1,
            features: [
                {
                    type: 'Feature',
                    properties: fix.properties,
                    geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [lon - half, lat - half],
                                [lon + half, lat - half],
                                [lon + half, lat + half],
                                [lon - half, lat + half],
                                [lon - half, lat - half],
                            ],
                        ],
                    },
                },
            ],
        };
        const textFetch = (async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify(itemsBody),
        })) as unknown as typeof fetch;

        /** The substitution detector: a numeric cércea presented as RESOLVED on a card whose
         *  moda did not resolve. Flags (a) a resolved-format CÉRCEA line carrying a number,
         *  (b) a "cércea máxima … N m" statement outside a quoted article (no « before it),
         *  (c) any knownFact stating a cércea with a number (the knownFacts contract). */
        const substitutionFindings = (card: { detail: string; knownFacts: readonly string[] }, zone: string) => {
            const out: Finding[] = [];
            if (/CÉRCEA \(FUC tipo I[^)]*\): \d+(?:\.\d+)? m/u.test(card.detail)) {
                out.push({
                    axis: 'height', pack: 'pt-1312-porto', zone,
                    detail: 'a RESOLVED numeric cércea appears on a card whose context set did not resolve',
                });
            }
            if (/cércea máxima(?: admitida)?(?::| é de| de)? ?\d+ ?m/u.test(card.detail)) {
                out.push({
                    axis: 'height', pack: 'pt-1312-porto', zone,
                    detail: 'a bare "cércea máxima N m" statement appears — the Art. 27.º n.º 2 b) cap stated without its moda condition',
                });
            }
            for (const f of card.knownFacts) {
                if (/^Cércea.*\d+ ?m/u.test(f)) {
                    out.push({
                        axis: 'height', pack: 'pt-1312-porto', zone,
                        detail: `knownFacts carries a numeric cércea ("${f}") — never a number the user could mistake for an allowance`,
                    });
                }
            }
            return out;
        };

        const resolvedPt = await resolvePtZoneIdentityAt(lat, lon, { fetchImpl: textFetch });
        zonesWalked++;
        if (resolvedPt.status !== 'found') {
            checkerBlind ??= `PT Porto arm: the recorded FUC-I zone did not resolve (${resolvedPt.status}) — the arm walked no card`;
        } else {
            refused++; // the PT chain always refuses to draw — counted, never skipped
            const card = resolvedPt.value.refusal;
            const cardFindings = substitutionFindings(card, 'fuc-i/no-frontage-source');
            findings.push(...cardFindings);
            if (PT_PORTO_PDM_CERTIFIED) {
                // A card that SUBSTITUTED is a real finding (exit 1) and must not be re-read as
                // "unproven"; only a card that neither refuses NOR substitutes is one this arm
                // cannot certify anything about.
                if (cardFindings.length === 0 && !card.detail.includes('NOT RESOLVED — context-set-unavailable')) {
                    checkerBlind ??=
                        'PT Porto arm: the certified FUC-I card does not carry the ADR-0379 ' +
                        'context-set-unavailable refusal — the arm cannot certify the no-substitution property on it';
                }
            } else if (/CÉRCEA/u.test(card.detail)) {
                checkerBlind ??= 'PT Porto arm: gate shut yet a CÉRCEA line appears — the shut branch regressed';
            }
            // CHECKER TEETH — the pre-ADR-0379 substitution (the bare 21 m cap wearing the
            // article) must be flagged by the same detector, or the arm is blind.
            const tampered = {
                detail: card.detail.replace(
                    /⚠ CÉRCEA[^]*?$/u,
                    'CÉRCEA (FUC tipo II): cércea máxima admitida: 21 m (Art. 27.º n.º 2 b)).',
                ),
                knownFacts: [...card.knownFacts, 'Cércea máxima: 21 m'],
            };
            if (substitutionFindings(tampered, 'teeth').length === 0) {
                checkerBlind ??=
                    'PT Porto arm teeth: the tampered bare-21 m substitution was not flagged — the arm cannot see the defect it polices';
            }
            console.log(
                `[never-overstate] §PT-PORTO-MODA: recorded FUC-I card — gate ${PT_PORTO_PDM_CERTIFIED ? 'OPEN' : 'SHUT'}, ` +
                    `moda ${card.detail.includes('NOT RESOLVED — context-set-unavailable') ? 'refused context-set-unavailable (no frontage source)' : 'line absent'}, ` +
                    'no substituted cércea scalar required.',
            );
        }
    }

    // ── 2g. §FR-PLAN-MASSE-LIVE (LANE FR-PRESCRIPTIONS) — the RECORDED GPU drawn envelope. ──
    // The GPU PUBLISHES the buildable volume as a `typepsc=14` secteur de plan de masse polygon
    // (STR §9 P1). `frPrescriptionGeoFeaturesAtPoint` (a recordedFetch replaying the real
    // 2026-09-02 census body — never the network) → `buildFrDrawnEnvelopeContribution` → the SAME
    // explicit-area clip Madrid uses. NEVER-OVERSTATE bounds, transcribed INDEPENDENTLY from the
    // census:
    //   • footprint ≤ parcel ∩ published plan-masse ring (the drawn polygon is the whole claim);
    //   • ZERO height/FAR/volume rides on the envelope — the 39/02 height (9 m au faîtage) has an
    //     UNRESOLVED datum (ADR-0377), so it is a cited study bound, never applied as a cap;
    //   • the consumed height number EQUALS the verbatim libelle number (9 m) — a shrunk OR
    //     inflated consumed cap breaks fidelity, and an inflated one also overstates.
    {
        interface FrFixture {
            readonly point: { readonly lat: number; readonly lon: number };
            readonly body: unknown;
            readonly published: {
                readonly planMasseIdurba: string;
                readonly planMasseLibelle: string;
                readonly heightLabelMetres: number;
                readonly heightCitation: string;
            };
        }
        const fix = readCorpusFixture<FrFixture>('fr-plan-masse-17453.json');
        // The consumer's own fetch seam (`frGpuGetJson` reads `res.text()` then JSON.parse), driven
        // by the recorded body — the real 2026-09-02 census FeatureCollection carrying the
        // plan-masse AND the height feature. NEVER the network.
        const recordedTextFetch = (async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify(fix.body),
        })) as unknown as typeof fetch;
        const feats = await frPrescriptionGeoFeaturesAtPoint('prescription-surf', fix.point.lat, fix.point.lon, {
            fetchImpl: recordedTextFetch,
        });
        if (feats.status !== 'found') {
            checkerBlind ??= `FR plan-masse arm: the recorded prescription body did not parse (${feats.status}) — the arm walked no solve`;
        } else {
            const contribution = buildFrDrawnEnvelopeContribution({
                point: fix.point,
                fetchedAtIso: '2026-09-02T18:00:00.000Z',
                planMasseFeatures: feats.value,
                heightFeatures: feats.value,
            });
            const fp = contribution.footprint;
            const hc = contribution.heightCap;
            // The FR plan-masse pack DECLARES the explicit-area seat this footprint feeds (STR §9 P1).
            if (FR_PLAN_MASSE_EXPLICIT_AREA_PACK.zones[0]?.geometricRule?.kind !== 'explicit-area') {
                checkerBlind ??= 'FR plan-masse arm: the pack no longer declares the explicit-area seat — the drawn footprint has no engine path';
            }
            if (fp === null) {
                checkerBlind ??= 'FR plan-masse arm: the recorded plan-masse produced no drawn footprint — a vacuous arm';
            } else {
                // Project into a local metre frame about the footprint's first vertex (θ=0). Shape +
                // area are frame-invariant, so the origin does not change the clip answer.
                const origin = fp.parts[0]!.outer[0]!;
                const parts = frFootprintToSceneParts(fp, origin);
                const ringArea = parts.reduce((s, p) => s + polyArea(p.outer), 0);
                const xs = parts.flatMap((p) => p.outer.map((q) => q.x));
                const zs = parts.flatMap((p) => p.outer.map((q) => q.z));
                const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
                const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
                // A parcel biting the footprint: its left 50 % plus a 10 m apron — the clip MUST cut.
                const cutX = minX + (maxX - minX) * 0.5;
                const parcelRing = rect(minX - 10, minZ - 10, cutX, maxZ + 10);
                const parcelArea = polyArea(parcelRing);
                // parcel ∩ ring honest ceiling: bounded above by min(parcel, ring) — the clip ≤ both.
                const honestCeilingM2 = Math.min(parcelArea, ringArea);
                zonesWalked++;
                // THE ENGINE'S explicit-area primitive (`solveExplicitArea` = parcel ∩ footprint —
                // the exact clip `computeBuildableEnvelope`'s explicit-area branch calls). NOT a new
                // solver. It publishes a footprint RING + area, and NO height/FAR/volume — so a
                // datum-unresolved 39/02 height can ride on nothing here, structurally.
                const solve = solveExplicitArea({ parcelRing, footprintParts: parts });
                if (solve.ok) solved++; else refused++;

                /** Audit the drawn footprint clip: it never exceeds parcel ∩ published ring. */
                const auditFrFootprint = (
                    s: ReturnType<typeof solveExplicitArea>,
                    ceilingM2: number,
                    zoneLabel: string,
                ): Finding[] => {
                    const out: Finding[] = [];
                    if (!s.ok) return out; // a refusal draws nothing and cannot overstate
                    if (s.areaM2 > ceilingM2 * (1 + EPS_REL) + EPS_ABS) {
                        out.push({
                            axis: 'setback',
                            pack: 'fr-gpu-plan-masse/live-route',
                            zone: zoneLabel,
                            detail:
                                `plan-masse clip granted ${s.areaM2.toFixed(1)} m² where parcel ∩ published ring ` +
                                `is ${ceilingM2.toFixed(1)} m² — buildable area drawn outside the published footprint`,
                        });
                    }
                    return out;
                };

                /** Audit the consumed height cap vs the INDEPENDENTLY-transcribed libelle number. */
                const auditFrHeight = (
                    consumed: number | null,
                    bindsAsCap: boolean,
                    zoneLabel: string,
                ): Finding[] => {
                    const out: Finding[] = [];
                    const f = (detail: string): void => {
                        out.push({ axis: 'height', pack: 'fr-gpu-plan-masse/live-route', zone: zoneLabel, detail });
                    };
                    // ADR-0377 — the 39/02 datum is unresolved, so the number must NEVER bind as a cap.
                    if (bindsAsCap) {
                        f('the 39/02 height binds as a cap — its ground datum is unresolved (ADR-0377); a datum-unresolved height may never be applied');
                    }
                    if (consumed === null) {
                        f(`consumed height is null where the libelle states ${fix.published.heightLabelMetres} m ("${fix.published.heightCitation}") — the cited number was lost`);
                        return out;
                    }
                    // NEVER-OVERSTATE: the consumed cap may never exceed the published label.
                    if (consumed > fix.published.heightLabelMetres * (1 + EPS_REL) + EPS_ABS) {
                        f(`consumed height ${consumed} m exceeds the published libelle ${fix.published.heightLabelMetres} m — an overstated ceiling`);
                    }
                    // FIDELITY (the falsification hook): a SHRUNK consumed cap ≠ the published number.
                    if (Math.abs(consumed - fix.published.heightLabelMetres) > EPS_ABS) {
                        f(`consumed height ${consumed} m ≠ the published libelle ${fix.published.heightLabelMetres} m — a transcription defect (the cited number must be carried verbatim)`);
                    }
                    return out;
                };

                if (!solve.ok || !(solve.areaM2 > 0)) {
                    checkerBlind ??= `FR plan-masse arm: the explicit-area clip did not solve (${solve.ok ? 'zero area' : solve.reason}) — a vacuous arm, not a pass`;
                } else if (solve.areaM2 >= honestCeilingM2 - 1) {
                    checkerBlind ??= `FR plan-masse arm: the clip did not BITE (inset ${solve.areaM2.toFixed(1)} m² vs ceiling ${honestCeilingM2.toFixed(1)} m²) — the clip provably did not run`;
                }
                findings.push(...auditFrFootprint(solve, honestCeilingM2, `plan-masse-${fix.published.planMasseIdurba}`));
                findings.push(
                    ...auditFrHeight(hc?.maxHeight_m ?? null, hc?.appliesAsBindingCap ?? false, `plan-masse-${fix.published.planMasseIdurba}`),
                );

                // CHECKER TEETH #1 — a fabricated footprint drawn OUTSIDE the published ring must be
                // flagged, or the footprint arm is blind.
                if (solve.ok) {
                    const tampered = { ...solve, areaM2: honestCeilingM2 * 2 + 100 };
                    if (auditFrFootprint(tampered, honestCeilingM2, 'teeth').length === 0) {
                        checkerBlind ??= 'FR plan-masse arm teeth: an area drawn past the published ring was not flagged — the footprint arm is blind';
                    }
                }
                // CHECKER TEETH #2 — a 39/02 height APPLIED as a cap (datum-unresolved) must be flagged.
                if (auditFrHeight(fix.published.heightLabelMetres, true, 'teeth').length === 0) {
                    checkerBlind ??= 'FR plan-masse arm teeth: a datum-unresolved height applied as a cap was not flagged — the ADR-0377 arm is blind';
                }
                // CHECKER TEETH #3 — the falsification the brief names: a SHRUNK consumed cap must be
                // flagged by the fidelity check (and an INFLATED one by never-overstate).
                if (auditFrHeight(fix.published.heightLabelMetres - 3, false, 'teeth').length === 0) {
                    checkerBlind ??= 'FR plan-masse arm teeth: a shrunk consumed height cap was not flagged — the fidelity check is blind';
                }
                if (auditFrHeight(fix.published.heightLabelMetres + 5, false, 'teeth').length === 0) {
                    checkerBlind ??= 'FR plan-masse arm teeth: an inflated consumed height cap was not flagged — the never-overstate check is blind';
                }

                console.log(
                    `[never-overstate] §FR-PLAN-MASSE-LIVE: recorded ${fix.published.planMasseIdurba} — clip ` +
                        `${solve.ok ? `${solve.areaM2.toFixed(1)} m² of ring ${ringArea.toFixed(1)} m²` : solve.reason}, ` +
                        `height ${hc?.maxHeight_m ?? 'n/a'} m au ${hc?.measuredTo ?? 'n/a'} datum=${hc?.heightDatum.kind ?? 'n/a'} ` +
                        `binds=${hc?.appliesAsBindingCap ?? false} (cited, never applied), claimed volume 0 m³ required.`,
                );
            }
        }
    }

    // ── 2h. §PL-POG-COMPILE (LANE PL-POG, 2026-09-03) — the RECORDED official POG strefa 1SZ. ──
    // Poland's POG APP GML 2.0 serves FOUR published ceilings per strefa; this module COMPILES them
    // into the scalar-cap path. HEIGHT (an absolute metric cap) BINDS; FAR (intensywność) and
    // COVERAGE (udział) are ratios over the *działka budowlana* (buildable plot), NOT the cadastral
    // parcel — so they are WITHHELD from the engine numbers (feeding them would be the C63
    // denominator trap: FAR/coverage × cadastral parcel area over-states on real land). This arm
    // proves (i) the compiled envelope never overstates height; (ii) FAR/coverage never ride the
    // record; (iii) the WITHHOLD is load-bearing — inject FAR back and the trap provably reappears.
    {
        interface PlPogFixture {
            readonly fields: PlPogFields;
            readonly citation: PlPogCitation;
            readonly parcel: { readonly areaM2: number };
            readonly published: { readonly heightM: number; readonly farForbidden: string; readonly coverageForbidden: string };
        }
        const fix = readCorpusFixture<PlPogFixture>('pl-pog-official-sample-1sz.json');
        const { record, resolution } = plPogZoningRecord(fix.fields, fix.citation);

        // (i) THE WITHHOLD — neither ratio may ride the numbers the engine multiplies.
        if ((record.structuredFields.plotRatioFAR ?? null) !== null) {
            findings.push({
                axis: 'far', pack: 'pl-pog/compile', zone: '1SZ',
                detail: `a POG intensywność rode the record as per-parcel FAR ${record.structuredFields.plotRatioFAR} — ` +
                    'the działka-budowlana denominator withhold was bypassed (C63)',
            });
        }
        if ((record.structuredFields.maxCoverage ?? null) !== null) {
            findings.push({
                axis: 'coverage', pack: 'pl-pog/compile', zone: '1SZ',
                detail: `a POG udział rode the record as coverage ${record.structuredFields.maxCoverage} over the cadastral ` +
                    'parcel — the działka-budowlana denominator withhold was bypassed (C63)',
            });
        }

        // (ii) SOLVE through the real engine and audit every axis. HEIGHT binds; the unresolved
        // setback axis with no shaping rule must stamp footprintIsUpperBound (mechanism A).
        const areaM2 = fix.parcel.areaM2; // 1000 = 40 × 25 exactly
        const parcelRing = rect(0, 0, 40, 25);
        zonesWalked++;
        const env = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: CLASSIFIED,
            zoning: record,
            rulePack: null, // structured fields only — the DK-Plandata-shaped structured route
        });
        if (env.status === 'ok') solved++; else refused++;
        findings.push(...auditEnvelope(env, null, 'pl-pog/compile', '1SZ', areaM2));
        if (env.status === 'ok') {
            if (env.maxHeight_m !== null && env.maxHeight_m > fix.published.heightM * (1 + EPS_REL) + EPS_ABS) {
                findings.push({
                    axis: 'height', pack: 'pl-pog/compile', zone: '1SZ',
                    detail: `compiled height ${env.maxHeight_m} m exceeds the recorded maksWysokoscZabudowy ${fix.published.heightM} m`,
                });
            }
            if (env.maxFAR !== null || env.maxCoverage !== null) {
                findings.push({
                    axis: 'far', pack: 'pl-pog/compile', zone: '1SZ',
                    detail: `the solved envelope bound FAR=${env.maxFAR}/coverage=${env.maxCoverage} — a withheld ratio reached the engine`,
                });
            }
        } else {
            checkerBlind ??= `PL-POG arm: the compiled record did not solve (status=${env.status}) — a vacuous arm, not a pass`;
        }

        // THE COMPILE-VS-BIND SPLIT — the C63 trap for PL is a SEMANTIC overstatement (a ratio over
        // the wrong denominator) that the engine's never-overstate ARITHMETIC cannot see: FAR ×
        // cadastral is self-consistent. The only protection is the WITHHOLD, so the arm asserts it
        // DIRECTLY: each ratio is COMPILED as a fact (present in the resolution) yet reaches the
        // engine as null (never multiplied). A resolution that dropped the fact, or an engine that
        // bound it, is the defect.
        if (resolution.maxFar === null || resolution.maxCoverageFraction === null) {
            checkerBlind ??=
                'PL-POG arm: the recorded strefa 1SZ compiled no FAR/coverage FACT — the arm is vacuous ' +
                '(the sample DOES publish intensywność 0.8 and udział 50 %)';
        }
        // The naive działka-budowlana products (ratio × cadastral parcel area) must never be the
        // engine's bound FAR/coverage — asserted numerically, not by substring (a legitimate volume
        // like 15 000 m³ contains "500" and would false-match a whole-serial grep).
        const naiveFarGfa = resolution.maxFar! * areaM2; // 0.8 × 1000 = 800 (the forbidden GFA)
        const naiveCovFootprint = resolution.maxCoverageFraction! * areaM2; // 0.5 × 1000 = 500
        if (env.maxFAR === resolution.maxFar || env.maxCoverage === resolution.maxCoverageFraction) {
            findings.push({
                axis: 'far', pack: 'pl-pog/compile', zone: '1SZ',
                detail: `a withheld ratio bound the envelope (FAR ${env.maxFAR} / coverage ${env.maxCoverage}) — the ` +
                    `działka-budowlana products (${naiveFarGfa} m² GFA / ${naiveCovFootprint} m² footprint) become reachable`,
            });
        }

        // (iii) THE TEETH — the withhold is what protects us. Inject FAR + coverage back into the
        // structured numbers (the pre-fix bypass) and the engine MUST re-bind them; if it does not,
        // the withhold is not load-bearing and this arm cannot see the defect it polices.
        const tamperedRecord = {
            ...record,
            structuredFields: {
                ...record.structuredFields,
                plotRatioFAR: resolution.maxFar,
                maxCoverage: resolution.maxCoverageFraction,
            },
        };
        const tamperedEnv = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: CLASSIFIED,
            zoning: tamperedRecord,
            rulePack: null,
        });
        if (tamperedEnv.maxFAR === null && tamperedEnv.maxCoverage === null) {
            checkerBlind ??=
                'PL-POG arm teeth: injecting FAR + coverage into the structured numbers did NOT re-bind them — ' +
                'the withhold is not the thing preventing the C63 trap, so the arm is blind';
        }

        // RANGE-GATE TEETH — an out-of-range served height is WITHHELD, never compiled into a cap.
        const oor = resolvePlPogEnvelope({ ...fix.fields, maxHeightValue: fix.published.heightM * 100 }, fix.citation);
        if (oor.maxHeightM !== null || oor.heightWithheldReason !== 'height-out-of-range') {
            findings.push({
                axis: 'height', pack: 'pl-pog/compile', zone: '1SZ',
                detail: `an out-of-range height (${fix.published.heightM * 100} m) compiled to ${oor.maxHeightM} m instead of being withheld by the range gate`,
            });
        }

        console.log(
            `[never-overstate] §PL-POG-COMPILE strefa 1SZ: env ${env.status}, height ${env.maxHeight_m ?? 'n/a'} m (binds) ≤ ${fix.published.heightM} m, ` +
                `FAR/coverage withheld (env.maxFAR=${env.maxFAR}, env.maxCoverage=${env.maxCoverage}), ` +
                `naive '${fix.published.farForbidden}'/'${fix.published.coverageForbidden}' absent, tamper re-binds=${tamperedEnv.maxFAR !== null}.`,
        );
    }

    // ── 2i. §LU-PAG-COMPILE (LANE LU-ENVELOPE, 2026-09-03) — the RECORDED live Ville-de-
    // Luxembourg NQ-PAP zone ze.PAG_PAG_NQ_PAP_539 (INSPIRE WFS, sha-pinned raw body). ──
    // Luxembourg is the INVERSE of PL/DK: there is NO denominator-free axis at all. COS/CSS are
    // ratios over the terrain à bâtir NET and CUS/DL over the BRUT (RGD 08/03/2017 Annexe II) —
    // planning constructs the state serves NO area for (C63); Art. 26 makes every value a zone
    // AVERAGE lots may exceed; no height/setback/storey is served; LU_PAG_CERTIFIED is born shut.
    // So the arm proves the STRONGER property: (i) the compiled facts are FAITHFUL to the
    // independently transcribed published values; (ii) NOTHING reaches the engine numbers and the
    // record honestly REFUSES (status 'none' — draws nothing, cannot overstate); (iii) the
    // withhold is LOAD-BEARING — inject the ratios back and the engine provably re-binds them.
    {
        interface LuFixture {
            readonly fields: LuPagFields;
            readonly citation: LuPagCitation;
            readonly parcel: { readonly areaM2: number };
            readonly published: {
                readonly cosMax: number;
                readonly cusMax: number;
                readonly cssMax: number;
                readonly dlMax: number;
                readonly coverageForbiddenM2: number;
                readonly weightedGfaForbiddenM2: number;
                readonly sealedForbiddenM2: number;
            };
        }
        const fix = readCorpusFixture<LuFixture>('lu-pag-c026-zone-539.json');

        // FIDELITY audit — compiled fact ≡ the independently transcribed published value, per
        // coefficient, in BOTH directions (a shrunk fact under-serves the citation; an inflated
        // one is the overstatement-in-waiting the flip points would inherit). Reused by the teeth.
        const auditLuFidelity = (
            res: LuPagEnvelopeResolution,
            pub: LuFixture['published'],
            sink: Finding[],
        ): void => {
            const rows: ReadonlyArray<readonly [Finding['axis'], string, number | null, number]> = [
                ['coverage', 'COS_MAX', res.coverage.fact, pub.cosMax],
                ['far', 'CUS_MAX', res.weightedFar.fact, pub.cusMax],
                ['coverage', 'CSS_MAX', res.soilSealing.fact, pub.cssMax],
                ['far', 'DL_MAX', res.dwellingDensity.fact, pub.dlMax],
            ];
            for (const [axis, name, fact, published] of rows) {
                if (fact !== published) {
                    sink.push({
                        axis, pack: 'lu-pag/compile', zone: 'ze.PAG_PAG_NQ_PAP_539',
                        detail: `compiled ${name} ${String(fact)} ≠ the recorded published value ${published} — ` +
                            'the compiled fact drifted from the state-served number (fidelity)',
                    });
                }
            }
        };

        const { record, resolution } = luPagZoningRecord(fix.fields, fix.citation);
        auditLuFidelity(resolution, fix.published, findings);
        if (
            resolution.coverage.fact === null || resolution.weightedFar.fact === null ||
            resolution.soilSealing.fact === null || resolution.dwellingDensity.fact === null
        ) {
            checkerBlind ??=
                'LU-PAG arm: the recorded zone compiled a null fact — the arm is vacuous ' +
                '(zone 539 DOES publish COS 0.3 / CUS 0.3 / CSS 0.5 / DL 30)';
        }

        // (ii) THE WITHHOLD — no number of ANY kind may ride the engine record.
        const sf = record.structuredFields;
        for (const [key, value] of [
            ['maxHeight_m', sf.maxHeight_m ?? null],
            ['maxFloors', sf.maxFloors ?? null],
            ['plotRatioFAR', sf.plotRatioFAR ?? null],
            ['maxCoverage', sf.maxCoverage ?? null],
        ] as const) {
            if (value !== null) {
                findings.push({
                    axis: key === 'maxCoverage' ? 'coverage' : key === 'maxHeight_m' ? 'height' : 'far',
                    pack: 'lu-pag/compile', zone: 'ze.PAG_PAG_NQ_PAP_539',
                    detail: `structuredFields.${key} = ${String(value)} — a LU coefficient rode the engine ` +
                        'numbers (the terrain-à-bâtir denominator withhold was bypassed, C63)',
                });
            }
        }

        // (iii) SOLVE — the honest LU output is a REFUSAL. A solve means a scalar leaked.
        const areaM2 = fix.parcel.areaM2; // 1000 = 40 × 25 exactly
        const parcelRing = rect(0, 0, 40, 25);
        zonesWalked++;
        const env = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: CLASSIFIED,
            zoning: record,
            rulePack: null,
        });
        if (env.status === 'ok') {
            solved++;
            findings.push({
                axis: 'volume', pack: 'lu-pag/compile', zone: 'ze.PAG_PAG_NQ_PAP_539',
                detail: `the all-withheld LU record SOLVED (status ok, height ${String(env.maxHeight_m)}, ` +
                    `FAR ${String(env.maxFAR)}, coverage ${String(env.maxCoverage)}) — with every axis ` +
                    'unresolved the only honest envelope is NO envelope; the naive products ' +
                    `(${fix.published.coverageForbiddenM2} m² footprint / ` +
                    `${fix.published.weightedGfaForbiddenM2} m² weighted GFA on the ${areaM2} m² parcel) ` +
                    'become reachable',
            });
        } else {
            refused++; // a refusal draws nothing and cannot overstate — the CORRECT LU answer
        }
        findings.push(...auditEnvelope(env, null, 'lu-pag/compile', 'ze.PAG_PAG_NQ_PAP_539', areaM2));

        // (iv) TEETH #1 — the withhold is load-bearing: inject COS as coverage + CUS as FAR (the
        // pre-fix bypass) and the engine MUST solve and bind them; if it does not, the omission is
        // not what protects us and this arm cannot see the defect it polices.
        const tamperedRecord = {
            ...record,
            structuredFields: {
                ...record.structuredFields,
                plotRatioFAR: resolution.weightedFar.fact,
                maxCoverage: resolution.coverage.fact,
            },
        };
        const tamperedEnv = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: CLASSIFIED,
            zoning: tamperedRecord as typeof record,
            rulePack: null,
        });
        if (tamperedEnv.status !== 'ok' || tamperedEnv.maxFAR === null || tamperedEnv.maxCoverage === null) {
            checkerBlind ??=
                'LU-PAG arm teeth: injecting COS/CUS into the structured numbers did NOT re-bind them ' +
                `(status ${tamperedEnv.status}, FAR ${String(tamperedEnv.maxFAR)}, coverage ` +
                `${String(tamperedEnv.maxCoverage)}) — the withhold is not the thing preventing the ` +
                'C63 trap, so the arm is blind';
        }

        // (v) TEETH #2 — the fidelity check has teeth in BOTH directions: a resolution compiled
        // from a LOWERED served value must be flagged against the true published bound, and one
        // compiled from an INFLATED value must be flagged too.
        const loweredTeeth: Finding[] = [];
        auditLuFidelity(
            resolveLuPagEnvelope({ ...fix.fields, cosMax: fix.fields.cosMax! - 0.1 }, fix.citation),
            fix.published, loweredTeeth,
        );
        const inflatedTeeth: Finding[] = [];
        auditLuFidelity(
            resolveLuPagEnvelope({ ...fix.fields, cusMax: fix.fields.cusMax! + 0.5 }, fix.citation),
            fix.published, inflatedTeeth,
        );
        if (loweredTeeth.length === 0 || inflatedTeeth.length === 0) {
            checkerBlind ??=
                'LU-PAG arm teeth: a tampered compiled fact (lowered COS / inflated CUS) was not ' +
                'flagged against the published transcript — the fidelity check is blind';
        }

        // (vi) DOMAIN teeth — a served COS above 1 (a ratio of area over area) must classify
        // refused-domain with a null fact, never a compiled number.
        const domain = resolveLuPagEnvelope({ ...fix.fields, cosMax: 1.3 }, fix.citation);
        if (domain.coverage.fact !== null || domain.coverage.kind !== 'refused-domain') {
            findings.push({
                axis: 'coverage', pack: 'lu-pag/compile', zone: 'ze.PAG_PAG_NQ_PAP_539',
                detail: `a served COS_MAX 1.3 compiled to fact ${String(domain.coverage.fact)} ` +
                    `(kind ${domain.coverage.kind}) instead of a refused-domain null`,
            });
        }

        // (vii) CERTIFICATION honesty — the resolution mirrors the L-449 gate constant, and while
        // the gate is shut the refusal is NAMED on the resolution (never silent).
        if (resolution.certified !== LU_PAG_CERTIFIED) {
            checkerBlind ??= 'LU-PAG arm: resolution.certified drifted from the LU_PAG_CERTIFIED constant';
        }
        if (!LU_PAG_CERTIFIED && !resolution.caveats.some((c) => c.includes('LU_PAG_CERTIFIED'))) {
            checkerBlind ??=
                'LU-PAG arm: the gate is shut but no caveat names LU_PAG_CERTIFIED — the refusal is silent';
        }

        console.log(
            `[never-overstate] §LU-PAG-COMPILE zone 539 (C026): env ${env.status} (refusal IS the honest ` +
                `answer — nothing binds), facts COS ${resolution.coverage.fact} / CUS ${resolution.weightedFar.fact} / ` +
                `CSS ${resolution.soilSealing.fact} / DL ${resolution.dwellingDensity.fact} faithful to the transcript, ` +
                `engine numbers empty, tamper re-binds=${tamperedEnv.maxFAR !== null}, certified=${String(LU_PAG_CERTIFIED)}.`,
        );
    }

    // ── 3. SELF-TEST layer 1 — ENGINE TEETH: the planted pack through the real engine. ──
    const plantedEnv = computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: CLASSIFIED,
        zoning: packZoneRecord(PLANTED_PACK.jurisdictionId, 'PLANT-1'),
        rulePack: PLANTED_PACK,
    });
    const plantedFindings = auditEnvelope(
        plantedEnv, PLANTED_PACK.zones[0]!, 'PLANTED', 'PLANT-1', PARCEL_AREA,
    );
    findings.push(...plantedFindings); // a reverted mechanism fix surfaces HERE as a real finding

    // ── 4. SELF-TEST layer 2 — CHECKER TEETH: tamper the honest output into the
    //       pre-fix shape; the audit MUST flag both mechanisms or the gate is blind. ──
    if (plantedEnv.status === 'ok') {
        const tampered = {
            ...plantedEnv,
            footprintIsUpperBound: false, // mechanism A re-introduced
            maxVolumeM3: plantedEnv.insetAreaM2 * (plantedEnv.maxHeight_m ?? 24), // mechanism B re-introduced
        };
        const tamperedFindings = auditEnvelope(
            tampered, PLANTED_PACK.zones[0]!, 'TAMPERED', 'PLANT-1', PARCEL_AREA,
        );
        const sawSetback = tamperedFindings.some((x) => x.axis === 'setback');
        const sawFar = tamperedFindings.some((x) => x.axis === 'far');
        if (!sawSetback || !sawFar) {
            checkerBlind =
                `tampered pre-fix envelope not fully flagged (setback:${sawSetback} far:${sawFar}) — ` +
                'the checker cannot see the defect class it polices';
        }
    } else {
        checkerBlind = `planted zone did not solve (status=${plantedEnv.status}) — self-test could not run`;
    }

    // ── Verdict ───────────────────────────────────────────────────────────────
    console.log(
        `[never-overstate] corpus: ${packJurisdictions} pack-bearing jurisdiction(s) · ` +
            `${zonesWalked} zone-solve(s) walked · ${solved} solved ok · ${refused} refused ` +
            '(a refusal draws nothing and cannot overstate — counted, not skipped)',
    );
    console.log(
        '[never-overstate] axes: height · FAR · coverage · setback · volume — audited on every solved envelope, ' +
            'through the REAL computeBuildableEnvelope + envelopeToMassing (SEAM-1).',
    );
    console.log(
        '[never-overstate] NOT ESTABLISHED by this gate: jurisdiction-correct rule VALUES (a wrong ' +
            'transcribed number that stays self-consistent passes), live provider data, terrain, or the ' +
            'render pixels — it binds the ENGINE + SEAM arithmetic, not the pack curation (L-449 owns that).',
    );

    if (checkerBlind !== null) {
        console.error(`[never-overstate] UNPROVEN: ${checkerBlind}`);
        return 2;
    }
    if (packJurisdictions < MIN_PACK_JURISDICTIONS || zonesWalked < MIN_ZONES || solved < MIN_SOLVED) {
        console.error(
            `[never-overstate] UNPROVEN: honesty floor — walked ${packJurisdictions} jurisdiction(s) ` +
                `(floor ${MIN_PACK_JURISDICTIONS}), ${zonesWalked} zone-solve(s) (floor ${MIN_ZONES}), ` +
                `${solved} solved (floor ${MIN_SOLVED}). "Looked nowhere" is not a pass.`,
        );
        return 2;
    }
    if (findings.length > 0) {
        console.error(`[never-overstate] FAIL: ${findings.length} overstatement finding(s):`);
        for (const x of findings.slice(0, 40)) {
            console.error(`  · [${x.axis}] ${x.pack} / ${x.zone} — ${x.detail}`);
        }
        if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`);
        return 1;
    }
    console.log(
        `[never-overstate] OK: 0 overstatement(s) across ${zonesWalked} zone-solve(s) in ` +
            `${packJurisdictions} jurisdiction(s) + estimated-default + the recorded live-route arms ` +
            '(Paris · Denmark · Madrid NZ-1 · Porto FUC-I · PL POG · LU PAG) + the planted self-test pack.',
    );
    return 0;
}

main().then(
    (code) => process.exit(code),
    (err) => {
        console.error('[never-overstate] UNPROVEN: gate crashed —', err);
        process.exit(2);
    },
);
