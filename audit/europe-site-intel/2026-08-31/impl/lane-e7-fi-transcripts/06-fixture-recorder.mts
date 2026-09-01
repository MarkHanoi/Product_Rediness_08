// E7-FI FIXTURE RECORDER — the verbatim copy of the script that produced
// packages/site-parcel-data/__tests__/fixtures/fi-ryhti-2026-09-01/recorded-live-2026-09-01.json
// on 2026-09-01 (sha256 5c5030c2b17c334c97ec5658d123361b47e98552b45b16e33a6d79a66de0d65b).
//
// TO RE-RECORD: copy this file to <repo-root>/.lane-tmp/record.mts and run
//     npx tsx .lane-tmp/record.mts
// then re-pin the sha256 in __tests__/fiRyhtiAdapter.test.ts and delete .lane-tmp.
//
// It drives the FI adapter's OWN URL builders, so the fixture keys are by construction the
// exact URLs the adapter emits — a builder change makes every replay go UNROUTED and fail by
// name rather than silently pass.
import { writeFileSync } from 'node:fs';
import {
    FI_RYHTI_COLLECTIONS,
    fiRyhtiBboxParams,
    fiRyhtiItemsUrl,
} from '../packages/site-parcel-data/src/countryAdapters/fi/fiRyhtiClient.js';

/** The three probe points, each chosen for the case it proves. */
const POINTS: Record<string, [number, number]> = {
    // Jamsa (kunta 182) — 6 OVERLAPPING valid detail plans, and the master-plan index is
    // EMPTY here: Jamsa is one of the three LD-only municipalities in the whole corpus.
    jamsa: [61.8645, 25.19],
    // Helsinki, Vartiosaari — the MIRROR case: no detail plan at all, 3 valid master plans
    // carrying oikeusvaik_YK legal effect and REAL approval dates. This is the HSY finding.
    helsinkiVartiosaari: [60.1842, 25.0737],
    // Vantaa — absent in BOTH indexes. The third HSY municipality; zero Ryhti coverage.
    vantaa: [60.29415, 25.03785],
};

const out: Record<string, unknown> = {
    __label__:
        'E7-FI — Ryhti plan-index bodies recorded LIVE 2026-09-01 by driving the FI adapter ' +
        "own URL builders against paikkatiedot.ymparisto.fi. Keys are the EXACT request URLs " +
        'fiRyhtiItemsUrl emits, so a change to the builder makes every replay go UNROUTED and ' +
        'fail by name rather than silently pass. Re-record: npx tsx .lane-tmp/record.mts',
};

for (const [label, [lat, lon]] of Object.entries(POINTS)) {
    for (const c of [
        FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
        FI_RYHTI_COLLECTIONS.validMasterPlanIndex,
    ]) {
        const url = fiRyhtiItemsUrl(c, { bboxCrs84: fiRyhtiBboxParams(lat, lon), limit: 50 });
        const res = await fetch(url);
        const body = await res.text();
        out[url] = JSON.parse(body);
        console.log(`${label} ${c} -> HTTP ${res.status} ${body.length} bytes`);
    }
}

writeFileSync(
    'packages/site-parcel-data/__tests__/fixtures/fi-ryhti-2026-09-01/recorded-live-2026-09-01.json',
    JSON.stringify(out),
);
console.log('recorded keys:', Object.keys(out).length - 1);

// ── THE RECORDING RUN, 2026-09-01 (verbatim stdout) ────────────────────────────────────────
// jamsa               pub_valid_ld_plan_ix_gs -> HTTP 200  24653 bytes
// jamsa               pub_valid_lm_plan_ix_gs -> HTTP 200    147 bytes
// helsinkiVartiosaari pub_valid_ld_plan_ix_gs -> HTTP 200    147 bytes
// helsinkiVartiosaari pub_valid_lm_plan_ix_gs -> HTTP 200 173052 bytes
// vantaa              pub_valid_ld_plan_ix_gs -> HTTP 200    147 bytes
// vantaa              pub_valid_lm_plan_ix_gs -> HTTP 200    147 bytes
// recorded keys: 6      (total on disk 222K)
