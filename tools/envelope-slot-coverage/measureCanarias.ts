#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE CANARIAS ARM (`es-cn`), on REAL Catastro parcels in TELDE.
//
//   npx tsx tools/envelope-slot-coverage/measureCanarias.ts              # 40 parcels
//   npx tsx tools/envelope-slot-coverage/measureCanarias.ts --n 80 --seed 20260904
//
// "DON'T MEASURE DATASETS. MEASURE ACTUAL PARCELS." — the coordinator's line, applied to the one
// Spanish region whose plans are published as STRUCTURED DATA rather than PDFs.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ READ THIS BEFORE READING A NUMBER: THIS IS THE BEST CASE, MEASURED, AND IT IS NOT CANARIAS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Canarias has **88 municipalities**. Exactly **ONE** — Telde (INE 35026) — has a transcribed pack
// (`esTeldePgo2003.ts`, 46 EDIF rows, 31 drawable, ~29 packed) and a committed zone geometry
// (`providers/data/teldeEdif.json`, 2,643 rings). `esCanariasSipu.ts` records that the other 87
// split into 40 routable-but-unpacked and 46 whose GOVERNING INSTRUMENT IS UNDETERMINABLE (2+ base
// instruments, no `vigencia` field in any SIPU family — `CANARIAS_MULTI_INSTRUMENT_BLOCKER`).
//
// ⇒ **Whatever this file reports is Telde's number, and Telde is the ceiling.** Multiplying it by
// 88 would be the exact error the founder's "measure parcels, not datasets" instruction exists to
// prevent, one level up: measuring the best municipality and reporting it as the region. The
// regional figure is stated at the foot as a SEPARATE, explicitly-derived line.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// REUSE, NEVER REINVENT — every leg is the repo's own code, imported
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  • PARCEL FRAME  `buildFrame` + `drawUniform` from `tools/cold-start-probe/catastroParcelFrame.mjs`
//    — the Catastro INSPIRE CP ATOM enclosure for the whole municipality, so the draw is UNIFORM
//    WITHOUT REPLACEMENT over the FULL parcel population (every parcel weighs 1), seeded. Identical
//    to the Balears and Madrid-region arms, so the three publish comparable figures.
//  • ZONE          `resolveTeldeZoneFromRecords` + `loadTeldeEdifRecords` — the SHIPPED offline
//    resolver over the SHIPPED committed extract, including its own WGS84→UTM28N projection and the
//    shipped even-odd PIP. ⛔ No rival geometry path is minted here.
//  • ENVELOPE      `ES_TELDE_PGO2003_PACK` → `computeBuildableEnvelope` → `slotsFromEnvelope`, on
//    the same neutral 40 m square ring the other arms use (the ring is not the subject; coverage is).
//  • REFUSALS      the pack's own `canariasGraphedRefusal` (DispObl='GRF' — the building line is on
//    a DRAWING; `legallyGrounded: true`) and `canariasNoRulePackRefusal` (`no-rule-pack`, a coverage
//    statement, `legallyGrounded: false`), classified through the ratified `classifyRefusal`.
//
// ⛔ NOTHING HERE IS SIGNED. `CANARIAS_ENVELOPE_VERIFIED` is `false` with `signature: null`, so the
// AS-SHIPPED arm publishes ZERO numbers: every pack answer is F1 by `measureEs.ts`'s own rule (a
// number behind a shut gate does not reach a user). The IF-SIGNED arm is a DEMONSTRATION of what an
// L-449 signature would open, and is neither an authorisation nor a request for one.
//
// ⭐ THE SECOND QUESTION THIS ARM ANSWERS — the founder's, from `ES-SIPU-PARAMETER-CROSSMAP.md`:
// *"Does the SIPU field mapping hold on real parcels?"* The cross-map answered it against the
// 135-table CENSUS (6 of 14 fields map exactly onto a C58 seat). This arm answers it against
// PARCELS: for every parcel that lands in a packed zone, WHICH of the mapped seats actually carry a
// value. A mapping that holds on a schema and fills nothing on the ground is not a shortcut.
//
// LAYERING — a measurement tool, not a layered package; its functions take no OTel span (same
// posture as every other file in this directory).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZoningRule } from '@pryzm/schemas';

import { buildFrame, drawUniform } from '../cold-start-probe/catastroParcelFrame.mjs';
import { computeBuildableEnvelope } from '../../packages/site-parcel-data/src/ZoningRulesEngine.js';
import {
    ES_TELDE_PGO2003_PACK,
    TELDE_PGO2003_ZONE_CODES,
    TELDE_UNPACKED_ZONES,
    TELDE_GRAPHED_ZONE_CODES,
} from '../../packages/site-parcel-data/src/rulepacks/esTeldePgo2003.js';
import {
    CANARIAS_ENVELOPE_VERIFIED,
    CANARIAS_MULTI_INSTRUMENT_BLOCKER,
    CANARIAS_ROUTABLE_MUNICIPALITIES,
    TELDE_JURISDICTION_ID,
    canariasGraphedRefusal,
    canariasNoRulePackRefusal,
} from '../../packages/site-parcel-data/src/rulepacks/esCanariasSipu.js';
import {
    loadTeldeEdifRecords,
    resolveTeldeZoneFromRecords,
} from '../../packages/site-parcel-data/src/providers/resolveTeldeZone.js';
import { classifyRefusal, renderMarkdown, report, type PointResult } from './slots.js';
import { slotsFromEnvelope, squareRing, writeArtefact } from './shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Telde — INE 35026, Gran Canaria. The name is the Catastro ATOM's own spelling. */
const TELDE = { ine: '35026', name: 'TELDE' } as const;

/**
 * ⭐ THE FOUNDER'S 14 SIPU FIELDS → the C58 seat the cross-map found for each, or `null` where the
 * cross-map found NO SEAT ANYWHERE. Vendored from `docs/04-reference/jurisdictions/es/
 * ES-SIPU-PARAMETER-CROSSMAP.md` §2 — ⛔ the seats are the DOCUMENT'S findings, not this file's;
 * this arm only counts how often the seated ones carry a value on real parcels.
 */
const SIPU_14: ReadonlyArray<{ readonly field: string; readonly seat: keyof ZoningRule | 'setbacks.front_m' | 'setbacks.side_m' | 'setbacks.rear_m' | null; readonly note: string }> = [
    { field: 'SupMin', seat: null, note: 'superficie mínima de parcela — NO SEAT in ZoningRule' },
    { field: 'LongMin', seat: null, note: 'longitud mínima de fachada — NO SEAT' },
    { field: 'CircInsc', seat: null, note: 'círculo inscribible — NO SEAT, no rival anywhere' },
    { field: 'SepMinFr', seat: 'setbacks.front_m', note: 'EXACT' },
    { field: 'SepMinPs', seat: 'setbacks.rear_m', note: 'EXACT' },
    { field: 'SepMinLt', seat: 'setbacks.side_m', note: 'EXACT (⚠ A3 per-edge classification has no seat, so sides are not differentiated)' },
    { field: 'FondoMax', seat: null, note: 'AMBIGUOUS — and 1 non-sentinel cell in 8,415 rows, and that cell is the string "IDEM"' },
    { field: 'SepMnVol', seat: null, note: 'NO SEAT (RUS family)' },
    { field: 'PMaxOcup', seat: 'maxCoverage', note: 'EXACT' },
    { field: 'SupOcMax', seat: null, note: 'NO SEAT (RUS family)' },
    { field: 'EdifMax', seat: 'plotRatioFAR', note: 'EXACT' },
    { field: 'SupEdMax', seat: null, note: 'NO SEAT' },
    { field: 'AltMaxPl', seat: 'maxFloors', note: 'EXACT' },
    { field: 'AltMaxMt', seat: 'maxHeight_m', note: 'LOSSY — AltMaxMt states NO DATUM; 45/8,719 = 0.5 % valid corpus-wide, and 0/73 EDIF tables carry it at all' },
];

function seatValue(zone: ZoningRule, seat: NonNullable<(typeof SIPU_14)[number]['seat']>): unknown {
    if (seat === 'setbacks.front_m') return zone.setbacks?.front_m ?? null;
    if (seat === 'setbacks.side_m') return zone.setbacks?.side_m ?? null;
    if (seat === 'setbacks.rear_m') return zone.setbacks?.rear_m ?? null;
    return (zone as unknown as Record<string, unknown>)[seat] ?? null;
}

interface ParcelRow {
    readonly ref: string;
    readonly lat: number;
    readonly lon: number;
    readonly areaM2: number | null;
}

interface Outcome {
    readonly row: ParcelRow;
    readonly zoneCode: string | null;
    /** Why no zone, when the resolver refused. */
    readonly zoneRefusal: string | null;
    readonly shipped: PointResult;
    readonly ifSigned: PointResult;
    /** Which of the 14 founder fields have a value on this parcel's zone (seated ones only). */
    readonly sipuFilled: readonly string[];
}

function classifyParcel(row: ParcelRow, records: ReturnType<typeof loadTeldeEdifRecords>): Outcome {
    const base = { lat: row.lat, lon: row.lon, slots: [] as never[] };
    const z = resolveTeldeZoneFromRecords({ lat: row.lat, lon: row.lon }, records);
    if (!z.ok) {
        // ⚠ `no-zone` is the EDIF layer's own served zero at this point (the layer covers the
        // planned urban/rustic zones, not every cadastral parcel in the term). That is
        // `no-plan-served`, NOT a gap and NOT a service failure — nothing failed and nothing is
        // owed. `data-unavailable` would be a service failure; it is reported apart.
        const cls = z.reason === 'data-unavailable' ? 'service-failure' : 'no-plan-served';
        const p: PointResult = { ...base, cls, zoneLabel: null, area: TELDE.ine, why: `resolveTeldeZone: ${z.reason}` };
        return { row, zoneCode: null, zoneRefusal: z.reason, shipped: p, ifSigned: p, sipuFilled: [] };
    }
    const code = z.resolution.zoneCode;
    const zone = ES_TELDE_PGO2003_PACK.zones.find((x) => x.code === code) ?? null;

    // ── NOT PACKED. Two DIFFERENT refusals, and the difference is the whole point. ────────────
    if (zone === null) {
        const graphed = TELDE_GRAPHED_ZONE_CODES.has(code);
        const refusal = graphed
            ? canariasGraphedRefusal(code, TELDE_UNPACKED_ZONES[code] ?? null, [])
            : canariasNoRulePackRefusal(code, TELDE_UNPACKED_ZONES[code] ?? null, []);
        const cls = classifyRefusal(refusal);
        const p: PointResult = {
            ...base,
            cls,
            zoneLabel: code,
            area: TELDE.ine,
            why: `${refusal.code}: ${refusal.headline}`,
        };
        // ⭐ A GRF zone refuses on stronger terms and KEEPS REFUSING after any signature: the plan
        // puts the building line on a drawing PRYZM does not hold. Same value on both arms.
        return { row, zoneCode: code, zoneRefusal: refusal.code, shipped: p, ifSigned: p, sipuFilled: [] };
    }

    // ── PACKED. Solve on the neutral ring; the GATE decides whether the answer reaches a user. ──
    const env = computeBuildableEnvelope({
        parcelRing: squareRing(20),
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        zoning: {
            zoneCode: code,
            zoneLabel: zone.label,
            jurisdictionId: TELDE_JURISDICTION_ID,
            provenance: { source: TELDE_JURISDICTION_ID, fetchedAt: new Date().toISOString() },
        },
        rulePack: ES_TELDE_PGO2003_PACK,
    });
    const slots = slotsFromEnvelope(env);
    const filled = SIPU_14.filter((f) => f.seat !== null && seatValue(zone, f.seat) !== null).map((f) => f.field);

    // ⚠ PARITY WITH `measureEs.ts`: a footprint-shaping zone with NO scalar answers with a SHAPE,
    // which this harness cannot score — `shape-rule-unmeasured`, not a gap. Telde's `alignment`
    // zones (G · R1–R4 · AG) are that family. `permittedUse` is excluded from the scalar test: a
    // USE cannot answer "does a scalar exist for this shape rule?", and letting it do so is what
    // silently collapsed Barcelona's 171 shape-ruled points into `resolved`.
    const scalarSlots = slots.filter((s) => s !== 'permittedUse');
    const shapeRuled = scalarSlots.length === 0 && zone.geometricRule !== undefined && zone.geometricRule !== null && zone.geometricRule.kind !== 'setback';

    const ifSigned: PointResult = shapeRuled
        ? { ...base, cls: 'shape-rule-unmeasured', zoneLabel: code, area: TELDE.ine, why: `pack answers for "${code}" with a footprint-shaping rule (kind '${zone.geometricRule?.kind}') and no scalar constraint` }
        : slots.length > 0
            ? { lat: row.lat, lon: row.lon, cls: 'resolved', zoneLabel: code, area: TELDE.ine, slots, why: `pack ${ES_TELDE_PGO2003_PACK.jurisdictionId} · confidence ${env.confidence} · status ${env.status}` }
            : { ...base, cls: 'f1-gap', zoneLabel: code, area: TELDE.ine, why: `pack answers for "${code}" but resolved 0 slots (status ${env.status})` };

    // ⛔ AS SHIPPED: the gate is SHUT. A pack answer behind a shut gate is F1 — no number reaches
    // the user as a determination — and saying otherwise would be the overstatement L-449 exists
    // to stop. This is `measureBalears.ts`'s rule, applied unchanged.
    const shipped: PointResult = {
        ...base,
        cls: 'f1-gap',
        zoneLabel: code,
        area: TELDE.ine,
        why: `CANARIAS_ENVELOPE_VERIFIED=${String(CANARIAS_ENVELOPE_VERIFIED)} — the pack answers ${slots.length} slot(s) but the verification gate is SHUT, so 0 numbers reach a user`,
    };
    return { row, zoneCode: code, zoneRefusal: null, shipped, ifSigned, sipuFilled: filled };
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const arg = (k: string, d: number): number => {
        const i = argv.indexOf(k);
        return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d;
    };
    const n = arg('--n', 40);
    const seed = arg('--seed', 20260904);
    const t0 = Date.now();

    console.log(`[canarias] building the Catastro INSPIRE CP frame for TELDE (${TELDE.ine})…`);
    const frame = await buildFrame(TELDE.ine, TELDE.name);
    const drawn = drawUniform(frame.parcels, n, seed);
    console.log(`[canarias] population ${frame.parcels.length}, drew ${drawn.length} (seed ${seed})`);

    const records = loadTeldeEdifRecords();
    const rows: ParcelRow[] = drawn.map((p: { ref: string; lat: number; lon: number; areaM2?: number }) => ({
        ref: p.ref,
        lat: p.lat,
        lon: p.lon,
        areaM2: typeof p.areaM2 === 'number' ? p.areaM2 : null,
    }));
    const outcomes = rows.map((r) => classifyParcel(r, records));

    const frameLine =
        `${drawn.length} REAL Catastro parcels drawn UNIFORMLY WITHOUT REPLACEMENT (seed ${seed}) over TELDE's ` +
        `FULL INSPIRE CP parcel population of ${frame.parcels.length}; each centroid resolved through the SHIPPED ` +
        `offline \`resolveTeldeZoneFromRecords\` over the committed EDIF extract (${records.length} rings), then ` +
        'through `ES_TELDE_PGO2003_PACK` + `computeBuildableEnvelope` on a neutral 40 m square ring.';

    const shippedRep = report(outcomes.map((o) => o.shipped));
    const signedRep = report(outcomes.map((o) => o.ifSigned));

    // ── the SIPU field-mapping half, on parcels ──────────────────────────────────────────────
    const packedOutcomes = outcomes.filter((o) => o.zoneCode !== null && ES_TELDE_PGO2003_PACK.zones.some((z) => z.code === o.zoneCode));
    const perField = SIPU_14.map((f) => ({
        ...f,
        onParcels: f.seat === null ? null : packedOutcomes.filter((o) => o.sipuFilled.includes(f.field)).length,
    }));
    const zonesSeen = [...new Set(outcomes.map((o) => o.zoneCode).filter((c): c is string => c !== null))].sort();

    const md = [
        `# Canarias — TELDE (INE 35026) envelope slot coverage on REAL parcels, MEASURED ${new Date().toISOString().slice(0, 10)}`,
        '',
        `> Command: \`npx tsx tools/envelope-slot-coverage/measureCanarias.ts --n ${n} --seed ${seed}\` (ONLINE — Catastro INSPIRE CP ATOM; the zone layer and the pack are OFFLINE and committed)`,
        '',
        `> ⛔⛔ **THIS IS TELDE, AND TELDE IS THE CEILING.** Canarias has **88 municipalities**; exactly **ONE** has a transcribed pack. ${CANARIAS_ROUTABLE_MUNICIPALITIES.length} are routable-but-unpacked, and the rest are blocked by \`CANARIAS_MULTI_INSTRUMENT_BLOCKER\`: *${CANARIAS_MULTI_INSTRUMENT_BLOCKER.slice(0, 200)}…* Multiplying Telde's figure by 88 is the error "measure parcels, not datasets" exists to prevent, one level up.`,
        '',
        `> ⛔ **NOTHING IS SIGNED.** \`CANARIAS_ENVELOPE_VERIFIED\` = **${String(CANARIAS_ENVELOPE_VERIFIED)}** ⇒ **AS SHIPPED, 0 numbers reach a user as a determination**; every pack answer is F1. The IF-SIGNED arm below demonstrates what an L-449 signature would open — it is not an authorisation and not a request for one.`,
        '',
        `**Frame:** ${frameLine}`,
        '',
        '## Zone resolution over the drawn parcels',
        '',
        '| outcome | n | of |',
        '|---|---:|---:|',
        `| centroid landed in an EDIF zone polygon | ${outcomes.filter((o) => o.zoneCode !== null).length} | ${outcomes.length} |`,
        `| … in a PACKED zone (${TELDE_PGO2003_ZONE_CODES.length} of Telde's 46 EDIF codes are packed) | ${packedOutcomes.length} | ${outcomes.length} |`,
        `| … in a GRF (drawn building line) zone — refuses on LEGAL terms, and keeps refusing after any signature | ${outcomes.filter((o) => o.zoneCode !== null && TELDE_GRAPHED_ZONE_CODES.has(o.zoneCode)).length} | ${outcomes.length} |`,
        `| … in an UNPACKED, non-GRF zone — a PRYZM coverage gap | ${outcomes.filter((o) => o.zoneCode !== null && !TELDE_GRAPHED_ZONE_CODES.has(o.zoneCode) && !ES_TELDE_PGO2003_PACK.zones.some((z) => z.code === o.zoneCode)).length} | ${outcomes.length} |`,
        `| no EDIF polygon at the centroid (the layer's own served zero — NOT a gap) | ${outcomes.filter((o) => o.zoneRefusal === 'no-zone').length} | ${outcomes.length} |`,
        `| \`data-unavailable\` (a SERVICE FAILURE — excluded from every denominator) | ${outcomes.filter((o) => o.zoneRefusal === 'data-unavailable').length} | ${outcomes.length} |`,
        '',
        `**Distinct zone codes seen:** ${zonesSeen.length === 0 ? '(none)' : zonesSeen.map((c) => `\`${c}\``).join(' · ')}`,
        '',
        '## ⭐ The founder\'s 14 SIPU fields, ON REAL PARCELS',
        '',
        '> The cross-map (`ES-SIPU-PARAMETER-CROSSMAP.md` §2) answered *"does the mapping hold?"* against the 135-table CENSUS: **6 of 14 map exactly onto a C58 seat, 6 have no seat anywhere, 1 is ambiguous, 1 is lossy.** This table answers it against PARCELS — of the parcels that landed in a PACKED zone, how many have a VALUE in that seat. ⛔ A mapping that holds on a schema and fills nothing on the ground is not a shortcut.',
        '',
        `| SIPU field | C58 seat | filled on n of ${packedOutcomes.length} packed parcels | note |`,
        '|---|---|---:|---|',
        ...perField.map((f) => `| \`${f.field}\` | ${f.seat === null ? '**none**' : `\`${String(f.seat)}\``} | ${f.onParcels === null ? '— (no seat to fill)' : String(f.onParcels)} | ${f.note} |`),
        '',
        '## Slot-coverage frames (the shared classifier — `slots.ts`)',
        '',
        renderMarkdown('TELDE · AS SHIPPED (gate SHUT)', shippedRep, `${frameLine} Gate SHUT — the shipped state.`),
        '',
        renderMarkdown('TELDE · IF SIGNED (demonstration)', signedRep, `${frameLine} Gate treated as OPEN — a demonstration of what an L-449 signature would open, not an authorisation.`),
        '',
        '## Per parcel',
        '',
        '| # | ref | zone | packed | AS SHIPPED | IF SIGNED |',
        '|---:|---|---|:-:|---|---|',
        ...outcomes.map((o, i) => {
            const packed = o.zoneCode !== null && ES_TELDE_PGO2003_PACK.zones.some((z) => z.code === o.zoneCode);
            return `| ${i + 1} | ${o.row.ref} | ${o.zoneCode ?? '—'} | ${packed ? '✓' : ''} | ${o.shipped.cls} | ${o.ifSigned.cls}${o.ifSigned.slots.length > 0 ? ` [${o.ifSigned.slots.join(', ')}]` : ''} |`;
        }),
        '',
        `> Wall time ${Math.round((Date.now() - t0) / 1000)} s.`,
    ].join('\n');

    writeArtefact(
        'es-cn',
        { n, seed, ine: TELDE.ine },
        {
            'telde · AS SHIPPED': { frame: frameLine, points: outcomes.map((o) => o.shipped) },
            'telde · IF SIGNED': { frame: frameLine, points: outcomes.map((o) => o.ifSigned) },
        },
        md,
    );
    fs.writeFileSync(
        path.join(HERE, 'out', 'es-cn.parcels.json'),
        `${JSON.stringify({ ine: TELDE.ine, population: frame.parcels.length, seed, outcomes: outcomes.map((o) => ({ ref: o.row.ref, lat: o.row.lat, lon: o.row.lon, zoneCode: o.zoneCode, zoneRefusal: o.zoneRefusal, shipped: o.shipped.cls, ifSigned: o.ifSigned.cls, slots: o.ifSigned.slots, sipuFilled: o.sipuFilled })) }, null, 2)}\n`,
        'utf8',
    );
    console.log(md);
}

main().catch((e: unknown) => {
    console.error('[canarias] FAILED:', e);
    process.exitCode = 1;
});
