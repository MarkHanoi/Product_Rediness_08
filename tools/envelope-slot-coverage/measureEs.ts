#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE SPAIN ARM. Runs the SHIPPED registry + engine over 2,000 REAL
// Catastro parcels (400 per city × 5 cities) and reports, per the shared classifier, how many of
// the eight envelope slots resolve — F1 counted separately from F2.
//
//   npx tsx tools/envelope-slot-coverage/measureEs.ts
//   npx tsx tools/envelope-slot-coverage/measureEs.ts --city barcelona
//
// OFFLINE BY CONSTRUCTION — it hits no network at all. The parcels come from the committed
// cold-start-probe samples, which ARE real-sampler output (uniform draws over the Catastro parcel
// population, `seed: 20260802`, each row a real `ref` + lat/lon + the zone code the live service
// returned). Fixtures built from the REAL sampler, never hand-written ideals.
//
// ⚠⚠ THE ONE DEVIATION, STATED UP FRONT — it is the same one `parcelDeterminationJoin.mjs`
// documents (R1), and it must be read before any number below is quoted.
//
//   `apps/editor/src/ui/site/siteDispatch.ts`'s `applyZoning` is NOT a call to
//   `resolveRegisteredJurisdictionAt` — it is a HAND-ORDERED CHAIN of `isInX(lat, lon)` bbox
//   predicates, and only TWO of its Spanish branches reach `resolveZoneDisposition` at all
//   (Barcelona/AMB; every other city builds its refusal inline). This harness measures the DATA
//   LAYER's answer — `resolveRegisteredJurisdictionAt` → `resolveZoneDisposition` →
//   `isEnvelopePublicationAuthorised` → `computeBuildableEnvelope` — which is the layer that
//   decides whether a NUMBER exists, not the layer that decides which `if` you fall into.
//
// ⛔⛔ THE FIRST VERSION OF THIS HEADER CALLED THE RESULT AN "UPPER BOUND" AND THAT WAS WRONG.
// The claim was: *"an inline branch that never asks the registry cannot resolve MORE slots than
// the registry holds."* The independent witness falsified it on the FIRST RUN — 169 of 400
// Barcelona parcels where the committed cold-start-probe says `envelope` and this harness said
// `f1-gap`. It is right and the harness was wrong: `13a`/`13b` carry
// `geometricRule: 'block-derived-alignment'` with EVERY scalar null, because the Eixample envelope
// is a *profunditat edificable* band CONSTRUCTED from the block ring and the *amplada de vial* —
// inputs the editor's live providers supply and this harness does not. So the editor resolves an
// envelope the data layer alone cannot express, in BOTH directions from this figure.
//   ⇒ The honest statement is: this harness measures SCALAR envelope-slot resolution FROM THE DATA
//     LAYER ALONE. A zone whose pack carries a footprint-shaping `geometricRule` is scored
//     `shape-rule-unmeasured` and left OUT of the denominator — never `f1-gap` (which would call a
//     working alignment envelope a coverage gap) and never `resolved` (which would claim a shape
//     this harness never constructed). The residual figure is a LOWER BOUND on what a user sees
//     wherever a live provider adds inputs beyond the zone code (Barcelona's `20a` subzone
//     resolution is the second such case — the sample carries `20a`, the pack keys `20a/9`).
// ⭐ The lesson is kept in the file rather than the commit message: the witness was the only thing
// that caught it, which is exactly why the disagreement table below is printed and not suppressed.
//
// ⚠ WHY THE COMMITTED `cat` IS NOT REUSED AS THE VERDICT. Those categories were computed by a
// different probe on a different date with its own deviations; adopting them would make this a
// re-print rather than a measurement, and two probes agreeing because one copied the other proves
// nothing (§probe-can-be-wrong-three-ways). Every verdict below is recomputed from the SHIPPED
// registry. The committed `cat` is carried as an INDEPENDENT WITNESS and disagreements are
// counted and printed.
//
// ⚠ THE ONE PLACE THE WITNESS IS USED AS EVIDENCE — `cat: 'nonBuildable'`. That is a CATASTRO
// fact about the parcel (public domain / not privately buildable land) which the shipped registry
// CANNOT see from a zone code alone. Treating those rows as F1 would inflate the gap with land
// nobody asked an envelope question about — the exact corruption the F1/F2 split exists to
// prevent — so they are classified `f2-correct-null` carrying the witness's own `why`. Every
// other row is classified from shipped code only.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    resolveRegisteredJurisdictionAt,
    resolveZoneDisposition,
} from '../../packages/site-parcel-data/src/rulepacks/registry.js';
import { isEnvelopePublicationAuthorised } from '../../packages/site-parcel-data/src/rulepacks/envelopeAuthorisation.js';
import { computeBuildableEnvelope } from '../../packages/site-parcel-data/src/ZoningRulesEngine.js';
import { GEOMETRIC_RULE_KIND_REGISTRY } from '@pryzm/schemas';
import {
    classifyRefusal,
    ENVELOPE_SLOTS,
    renderMarkdown,
    report,
    type PointResult,
} from './slots.js';
import { slotsFromEnvelope, squareRing, writeArtefact } from './shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.join(HERE, '..', 'cold-start-probe', 'out');

const CITIES = ['barcelona', 'madrid', 'murcia', 'valencia', 'cordoba'] as const;

interface DeterminationRow {
    readonly ref: string;
    readonly lat: number;
    readonly lon: number;
    readonly code: string | null;
    readonly cat: string;
    readonly why: string;
}

/** One parcel through the SHIPPED data layer. Returns the point result + the witness's category. */
function probeEs(row: DeterminationRow): { result: PointResult; witness: string } {
    const base = { lat: row.lat, lon: row.lon, slots: [] as never[] };

    // The witness's one evidentiary use — see the header.
    if (row.cat === 'nonBuildable') {
        return {
            witness: row.cat,
            result: {
                ...base,
                cls: 'f2-correct-null',
                zoneLabel: row.code,
                area: null,
                why: `[catastro witness] ${row.why}`,
            },
        };
    }

    const claim = resolveRegisteredJurisdictionAt(row.lat, row.lon);
    if (claim.kind !== 'resolved') {
        // No registered jurisdiction claims this point. The land is still governed by a Spanish
        // plan — PRYZM simply has no registration. That is a COVERAGE statement ⇒ F1.
        return {
            witness: row.cat,
            result: {
                ...base,
                cls: 'f1-gap',
                zoneLabel: row.code,
                area: null,
                why: `no registered jurisdiction claims this point (${claim.kind})`,
            },
        };
    }
    const jid = claim.jurisdiction.jurisdictionId;

    if (row.code === null) {
        // The zoning service served NO zone code for a real parcel. Not "the ordinance says no" —
        // the machine-readable calificación does not exist. A coverage statement ⇒ F1.
        return {
            witness: row.cat,
            result: {
                ...base,
                cls: 'f1-gap',
                zoneLabel: null,
                area: jid,
                why: `no zone code served for this parcel — ${row.why}`,
            },
        };
    }

    const disp = resolveZoneDisposition(jid, row.code, { zoneLabel: row.code });
    if (disp.kind === 'refusal') {
        return {
            witness: row.cat,
            result: {
                ...base,
                cls: classifyRefusal(disp.refusal),
                zoneLabel: row.code,
                area: jid,
                why: `${disp.refusal.code}: ${(disp.refusal.summary ?? '').slice(0, 200)}`,
            },
        };
    }
    if (disp.kind === 'unregistered') {
        return {
            witness: row.cat,
            result: {
                ...base, cls: 'f1-gap', zoneLabel: row.code, area: jid,
                why: `zone "${row.code}" is unregistered in ${jid} — no pack, no classified refusal`,
            },
        };
    }

    // A pack answers. ⚠ The L-449 publication gate decides whether its numbers may REACH a user;
    // a shut gate is a statement about PRYZM's internal state, never about the ordinance ⇒ F1.
    if (!isEnvelopePublicationAuthorised(jid)) {
        return {
            witness: row.cat,
            result: {
                ...base, cls: 'f1-gap', zoneLabel: row.code, area: jid,
                why: `a pack answers for "${row.code}" but the L-449 publication gate for ${jid} is SHUT — no number reaches the panel`,
            },
        };
    }

    const env = computeBuildableEnvelope({
        parcelRing: squareRing(20),
        edgeClassifications: ['front', 'side', 'rear', 'side'],
        zoning: {
            zoneCode: row.code,
            provenance: { source: jid, fetchedAt: new Date().toISOString() },
        },
        rulePack: disp.pack,
    });
    const slots = slotsFromEnvelope(env);
    // ⛔ THE SHAPE TEST RUNS FIRST, AND IT ASKS ABOUT SCALARS ONLY (reordered 2026-09-04).
    // It used to run AFTER `slots.length > 0`, which was safe only while the classifier could never
    // resolve `permittedUse` (the `derivationTrace` typo — see `shared.ts`). The moment that was
    // fixed, `permittedUse` alone resolved on Barcelona's 171 `13a`/`13b` points and promoted every
    // one of them from `shape-rule-unmeasured` to `resolved` — re-burying the exact distinction the
    // 2026-09-03 correction established, and inflating the headline with a slot that says nothing
    // about the ENVELOPE. `permittedUse` is a USE, not a dimension: it cannot answer the question
    // "does a scalar exist for this shape rule?", so it is excluded from THIS test and from it only
    // (it still counts, correctly, in the slot tally for every zone that is not shape-ruled).
    const zone = disp.pack.zones.find((z) => z.code === row.code);
    const kind = zone?.geometricRule?.kind;
    const scalarSlots = slots.filter((s) => s !== 'permittedUse');
    if (scalarSlots.length === 0 && kind !== undefined && GEOMETRIC_RULE_KIND_REGISTRY[kind].footprintShaping) {
        return {
            witness: row.cat,
            result: {
                ...base, cls: 'shape-rule-unmeasured', zoneLabel: row.code, area: jid,
                why:
                    `pack ${disp.pack.jurisdictionId} answers for "${row.code}" with a ` +
                    `footprint-shaping rule (kind '${kind}') and no scalar constraint — its inputs ` +
                    '(block ring / street width) come from live providers this harness does not run',
            },
        };
    }
    if (slots.length > 0) {
        return {
            witness: row.cat,
            result: {
                lat: row.lat, lon: row.lon, cls: 'resolved',
                zoneLabel: row.code, area: jid, slots,
                why: `pack ${disp.pack.jurisdictionId} · confidence ${env.confidence} · status ${env.status}`,
            },
        };
    }
    return {
        witness: row.cat,
        result: {
            ...base, cls: 'f1-gap', zoneLabel: row.code, area: jid,
            why: `pack ${disp.pack.jurisdictionId} answers for "${row.code}" but resolved 0 slots and declares no shaping rule (status ${env.status})`,
        },
    };
}

function main(): void {
    const argv = process.argv.slice(2);
    const only = argv.indexOf('--city') >= 0 ? argv[argv.indexOf('--city') + 1] : null;
    const cities = only ? CITIES.filter((c) => c === only) : CITIES;
    if (cities.length === 0) throw new Error(`--city must be one of ${CITIES.join('|')}`);

    const frames: Record<string, { frame: string; points: PointResult[] }> = {};
    const all: PointResult[] = [];
    const disagreements: Array<{ city: string; ref: string; witness: string; ours: string }> = [];

    for (const city of cities) {
        const p = path.join(SAMPLE_DIR, `${city}.determination.json`);
        if (!fs.existsSync(p)) {
            process.stderr.write(`[es] MISSING SAMPLE ${p} — skipping ${city}\n`);
            continue;
        }
        const sample = JSON.parse(fs.readFileSync(p, 'utf8')) as {
            rows: DeterminationRow[];
            seed: number;
            measuredAt: string;
        };
        const points: PointResult[] = [];
        for (const row of sample.rows) {
            const { result, witness } = probeEs(row);
            points.push(result);
            all.push(result);
            const witnessSaysEnvelope = witness === 'envelope';
            const weSayResolved = result.cls === 'resolved';
            if (witnessSaysEnvelope !== weSayResolved) {
                disagreements.push({ city, ref: row.ref, witness, ours: result.cls });
            }
        }
        frames[city] = {
            frame:
                `${sample.rows.length} REAL Catastro parcels drawn uniformly over ${city}'s parcel ` +
                `population by tools/cold-start-probe (seed ${sample.seed}, measured ` +
                `${sample.measuredAt}). Verdicts recomputed here from the SHIPPED registry + engine; ` +
                'the committed `cat` is used as evidence for `nonBuildable` ONLY (see header).',
            points,
        };
    }

    frames['ALL'] = {
        frame: `every city above pooled — ${all.length} real Catastro parcels across ${cities.length} cities.`,
        points: all,
    };

    const md: string[] = [
        `# Spain — envelope slot coverage, MEASURED ${new Date().toISOString().slice(0, 10)}`,
        '',
        '> Command: `npx tsx tools/envelope-slot-coverage/measureEs.ts` (OFFLINE — no network) · ' +
            `slots: ${ENVELOPE_SLOTS.join(', ')}`,
        '',
        '> ⛔ **NOT AN UPPER BOUND — AND NOT A LOWER BOUND EITHER. It is a DIFFERENT ' +
            'QUANTITY, and the difference is COUNTED at the foot of this file rather than ' +
            'asserted here.** What is measured is SCALAR envelope-slot resolution FROM THE ' +
            'DATA LAYER ALONE (`resolveRegisteredJurisdictionAt` → `resolveZoneDisposition` ' +
            '→ `isEnvelopePublicationAuthorised` → `computeBuildableEnvelope`). It runs ' +
            'BELOW what a user sees wherever a live provider supplies inputs beyond the zone ' +
            'code (Barcelona `13a`/`13b`: a *profunditat edificable* band this harness cannot ' +
            'construct, scored `shape-rule-unmeasured` and never `f1-gap`), and ABOVE it ' +
            'wherever the editor never reaches this layer at all — ' +
            '`apps/editor/src/ui/site/siteDispatch.ts` `applyZoning` is a hand-ordered ' +
            '`isInX(lat, lon)` bbox chain and only the Barcelona/AMB branches call ' +
            '`resolveZoneDisposition`. An earlier revision of this banner said “upper ' +
            'bound”; the independent witness falsified it on the first run. See this ' +
            "file's header.",
        '',
    ];
    for (const [k, v] of Object.entries(frames)) {
        md.push(renderMarkdown(`Frame \`${k}\``, report(v.points), v.frame), '');
    }
    md.push(
        '### Cross-check against the independent witness',
        '',
        'The committed `cold-start-probe` category (`cat`) was computed by a different probe on a ' +
            'different date. Rows where its `envelope`/not-`envelope` verdict disagrees with this ' +
            "harness's `resolved`/not-`resolved`:",
        '',
        `**${disagreements.length} of ${all.length} rows disagree.**`,
        '',
    );
    const byPair = new Map<string, number>();
    for (const d of disagreements) {
        const k = `${d.city}: witness=${d.witness} · ours=${d.ours}`;
        byPair.set(k, (byPair.get(k) ?? 0) + 1);
    }
    md.push('| disagreement | n |', '|---|---:|');
    for (const [k, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1])) {
        md.push(`| ${k} | ${n} |`);
    }

    writeArtefact('es', { cities }, frames, md.join('\n'));
    process.stdout.write(`${md.join('\n')}\n`);
}

try {
    main();
} catch (e) {
    process.stderr.write(`[envelope-slot-coverage/es] FAILED: ${String(e)}\n`);
    process.exit(2);
}
