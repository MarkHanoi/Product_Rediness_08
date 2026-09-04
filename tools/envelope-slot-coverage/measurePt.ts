#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE PORTUGAL ARM. Runs the SHIPPED PT chain over a seeded sample of
// real points and reports, per the shared classifier, how many of the eight envelope slots
// resolve — F1 (a plan governs, no mechanism served: a GAP) counted separately from F2 (the
// ordinance's own "no private buildable envelope here": a CORRECT NULL).
//
//   npx tsx tools/envelope-slot-coverage/measurePt.ts --frame land   --n 120
//   npx tsx tools/envelope-slot-coverage/measurePt.ts --frame fabric --n 120
//   npx tsx tools/envelope-slot-coverage/measurePt.ts --frame both   --n 120 --seed 20260903
//
// ⚠ IT MEASURES THE SHIPPED CODE, NOT A REIMPLEMENTATION. `resolvePtZoneIdentityAt` is the exact
// production entry point (`countryAdapters/pt/index.ts`, the §J `rules` arm), and the disposition
// question is put to the shipping `resolveZoneDisposition` in `rulepacks/registry.ts`. A probe
// that reimplemented either could disagree with the card the user sees, which is the whole
// failure this file exists to avoid (§probe-can-be-wrong-three-ways).
//
// THE TWO FRAMES, AND WHY BOTH (never blended — the C63 PARCEL-axis discipline, L-656):
//   • `land`   — points drawn UNIFORMLY AT RANDOM over `PORTUGAL_BBOX` (the shipped mainland
//                routing constant, imported not copied). Answers *"what does a random click on
//                mainland Portugal get?"* Sea and un-transcribed land land on `no-plan-served`,
//                which is a real, reportable outcome and not a failure.
//   • `fabric` — points drawn by the PROVEN two-stage sampler in
//                `tools/city-completion/parcelSampleProbe.mjs` (equal-probability tile draw ×
//                area-proportional footprint draw ⇒ unbiased FOR AREA), over OSM NON-PUBLIC
//                building footprints in Lisboa + Porto. An INDEPENDENT, conservative proxy for
//                private buildable land — it is NOT the legal denominator and must never be
//                reported as one.
// The sampler is REUSED, not reinvented (standing rule: grep for the existing solver first).
//
// ⚠ NO FRENTE-URBANA DEP IS INJECTED. `PtChainDeps.resolveFrenteUrbanaAt` and
// `resolvePdmObjectsAt` are deliberately left absent, because NO public channel serves either
// today (measured 2026-09-02, `ptPdmObjectGates.ts`). Injecting a stub would measure a runtime
// that does not exist — the §fake-more-capable-than-real failure. The Porto card therefore
// reports `context-set-unavailable` here exactly as it does in production.

import {
    PORTUGAL_BBOX,
} from '../../packages/site-parcel-data/src/parcelProviders/dgtParcelProvider.js';
import { resolvePtZoneIdentityAt } from '../../packages/site-parcel-data/src/countryAdapters/pt/index.js';
import { resolveRegisteredJurisdictionAt, resolveZoneDisposition } from '../../packages/site-parcel-data/src/rulepacks/registry.js';
import { computeBuildableEnvelope } from '../../packages/site-parcel-data/src/ZoningRulesEngine.js';
import {
    classifyRefusal,
    ENVELOPE_SLOTS,
    renderMarkdown,
    report,
    type EnvelopeSlot,
    type PointResult,
} from './slots.js';
import { slotsFromEnvelope, squareRing, writeArtefact } from './shared.js';
// The PROVEN sampler — imported, never re-derived.
import {
    drawTiles,
    fetchBuildings,
    mulberry32,
    samplePointsByArea,
    sampleUniform,
} from '../city-completion/parcelSampleProbe.mjs';

/** The two built-fabric bboxes, from `tools/city-completion` CITY_BOARD's own shape. */
const FABRIC_CITIES = [
    { city: 'lisboa', bbox: [-9.23, 38.69, -9.09, 38.79] as const },
    { city: 'porto', bbox: [-8.69, 41.13, -8.55, 41.19] as const },
];

interface Args {
    readonly frame: 'land' | 'fabric' | 'both';
    readonly n: number;
    readonly seed: number;
    readonly gapMs: number;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const get = (k: string, d: string): string => {
        const i = argv.indexOf(k);
        return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
    };
    const frame = get('--frame', 'both');
    if (frame !== 'land' && frame !== 'fabric' && frame !== 'both') {
        throw new Error(`--frame must be land|fabric|both, got "${frame}"`);
    }
    return {
        frame,
        n: Number(get('--n', '120')),
        seed: Number(get('--seed', '20260903')),
        gapMs: Number(get('--gap', '340')),
    };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * One point through the SHIPPED chain. The classification ladder, in order:
 *   transient/aborted  → `service-failure`  (EXCLUDED from every denominator)
 *   absent             → `no-plan-served`   (the collection's own honest zero)
 *   found + refusal    → F1/F2 by the ratified `legallyGrounded` seam
 *   found + a pack     → `resolved`, with the slots the engine actually filled
 */
async function probePt(lat: number, lon: number): Promise<PointResult> {
    const outcome = await resolvePtZoneIdentityAt(lat, lon);
    if (outcome.status === 'transient' || outcome.status === 'aborted') {
        return {
            lat, lon, cls: 'service-failure', zoneLabel: null, area: null, slots: [],
            why: outcome.status === 'transient' ? outcome.reason : 'aborted',
        };
    }
    if (outcome.status === 'absent') {
        return { lat, lon, cls: 'no-plan-served', zoneLabel: null, area: null, slots: [], why: outcome.reason };
    }
    const { zone, refusal } = outcome.value;
    const zoneLabel = zone.classificacaoEQualificacao;
    const area = `${zone.dtcc} ${zone.municipio}`;

    // Does a REGISTERED pack answer for this point? The production question, put to the
    // production resolver — never to a hand-kept list of "cities we think we did".
    const claim = resolveRegisteredJurisdictionAt(lat, lon);
    if (claim.kind === 'resolved') {
        const disp = resolveZoneDisposition(claim.jurisdiction.jurisdictionId, zoneLabel, {
            zoneLabel,
        });
        if (disp.kind === 'pack') {
            const env = computeBuildableEnvelope({
                parcelRing: squareRing(20),
                edgeClassifications: ['front', 'side', 'rear', 'side'],
                zoning: {
                    zoneCode: zoneLabel,
                    provenance: { source: claim.jurisdiction.jurisdictionId, fetchedAt: new Date().toISOString() },
                },
                rulePack: disp.pack,
            });
            const slots = slotsFromEnvelope(env);
            if (slots.length > 0) {
                return { lat, lon, cls: 'resolved', zoneLabel, area, slots, why: `pack ${disp.pack.jurisdictionId}` };
            }
        }
    }
    return {
        lat, lon,
        cls: classifyRefusal(refusal),
        zoneLabel, area, slots: [],
        why: `${refusal.code}: ${refusal.summary ?? ''}`.slice(0, 300),
    };
}

async function runFrame(
    label: string,
    points: ReadonlyArray<readonly [number, number]>,
    gapMs: number,
): Promise<PointResult[]> {
    const out: PointResult[] = [];
    for (let i = 0; i < points.length; i += 1) {
        const [lat, lon] = points[i]!;
        out.push(await probePt(lat, lon));
        if (i % 10 === 9) process.stderr.write(`  ${label} ${i + 1}/${points.length}\n`);
        await sleep(gapMs);
    }
    return out;
}

async function main(): Promise<void> {
    const args = parseArgs();
    const rnd = mulberry32(args.seed);
    const frames: Record<string, { frame: string; points: PointResult[] }> = {};

    if (args.frame === 'land' || args.frame === 'both') {
        const bbox: [number, number, number, number] = [
            PORTUGAL_BBOX.minLon, PORTUGAL_BBOX.minLat, PORTUGAL_BBOX.maxLon, PORTUGAL_BBOX.maxLat,
        ];
        const pts = sampleUniform(bbox, args.n, rnd).map(
            (p: { lat: number; lon: number }) => [p.lat, p.lon] as const,
        );
        process.stderr.write(`[pt] frame=land — ${pts.length} uniform points over PORTUGAL_BBOX\n`);
        frames['land'] = {
            frame:
                'points drawn UNIFORMLY AT RANDOM over the shipped `PORTUGAL_BBOX` mainland routing ' +
                'constant. Answers "what does a random click on mainland Portugal get?" — sea and ' +
                'un-transcribed land are REAL outcomes here (`no-plan-served`), not failures.',
            points: await runFrame('land', pts, args.gapMs),
        };
    }

    if (args.frame === 'fabric' || args.frame === 'both') {
        const pts: Array<readonly [number, number]> = [];
        for (const c of FABRIC_CITIES) {
            const tiles = drawTiles(c.bbox, 30, 0.003, rnd);
            const buildings = await fetchBuildings(tiles);
            if (!buildings.ok) {
                process.stderr.write(`[pt] fabric ${c.city}: OVERPASS FAILED — ${buildings.message}\n`);
                continue;
            }
            const drawn = samplePointsByArea(buildings.buildings, Math.ceil(args.n / FABRIC_CITIES.length), rnd);
            process.stderr.write(
                `[pt] fabric ${c.city}: ${buildings.buildings.length} footprints → ${drawn.length} points\n`,
            );
            for (const p of drawn) pts.push([p.lat, p.lon] as const);
        }
        frames['fabric'] = {
            frame:
                'points drawn by the proven two-stage sampler in `tools/city-completion/' +
                'parcelSampleProbe.mjs` (equal-probability tile draw × footprint-area-proportional ' +
                'point draw ⇒ unbiased FOR AREA) over OSM NON-PUBLIC building footprints in Lisboa ' +
                '+ Porto. An INDEPENDENT, conservative proxy for private buildable land — NOT the ' +
                'legal denominator (L-656).',
            points: await runFrame('fabric', pts, args.gapMs),
        };
    }

    const md: string[] = [
        `# Portugal — envelope slot coverage, MEASURED ${new Date().toISOString().slice(0, 10)}`,
        '',
        '> Command: `npx tsx tools/envelope-slot-coverage/measurePt.ts --frame both --n ' +
            `${args.n} --seed ${args.seed}\`  · slots: ${ENVELOPE_SLOTS.join(', ')}`,
        '',
    ];
    for (const [k, v] of Object.entries(frames)) {
        md.push(renderMarkdown(`Frame \`${k}\``, report(v.points), v.frame), '');
    }
    writeArtefact('pt', args, frames, md.join('\n'));
    process.stdout.write(`${md.join('\n')}\n`);
}

void main().catch((e: unknown) => {
    process.stderr.write(`[envelope-slot-coverage/pt] FAILED: ${String(e)}\n`);
    // Exit 2 on a harness failure — a service outage must NEVER render as "0 % coverage".
    process.exit(2);
});

export type { EnvelopeSlot };
