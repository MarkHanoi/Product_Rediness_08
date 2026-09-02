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
 * PURE READ: solves synthetic parcels in memory through pure L2 functions. No I/O
 * beyond module import, no network, no writes. Deterministic.
 */

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
    type BuildableEnvelopeMassingInput,
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

function main(): number {
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

    // ── 2b. §NL-BOUWVLAK-HOLES (L-12896) — the explicit-area COURTYARD arm. ───────────
    // A published footprint with an interior courtyard ("do not build here"), forwarded as
    // parts + holes — the shape the NL provider emits since L-12896 — on a parcel that CONTAINS
    // the courtyard. Honest outcomes: a refusal (a single-ring envelope cannot carve the hole —
    // `hole-intersects-parcel`, the engine's current answer) or a solved footprint whose area
    // EXCLUDES the hole (if the engine ever learns to carve exactly). A solved area that reaches
    // into the hole is the L-616 overstate this gate exists to catch — the exact defect the old
    // NL wiring shipped by dropping interior rings at the provider.
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
            `${packJurisdictions} jurisdiction(s) + estimated-default + the planted self-test pack.`,
    );
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error('[never-overstate] UNPROVEN: gate crashed —', err);
    process.exit(2);
}
