// E6-LT live chain probe + fixture recorder. Run:
//   npx tsx audit/europe-site-intel/2026-08-31/impl/lane-e6-lt-transcripts/probe-lt-chain.mts
// It drives the REAL adapter (resolveLtParcelChain) against the LIVE services, prints the
// per-step transcript, and records every response body as a replayable fixture.
import { writeFileSync, mkdirSync } from 'node:fs';
import {
    resolveLtParcelChain,
    type LtParcelChain,
} from '../../../../../packages/site-parcel-data/src/countryAdapters/lt/index.js';
import type { FetchOutcome } from '../../../../../packages/schemas/src/index.js';

const PARCELS = ['0101/0054:0328', '0101/0054:0345'];
const recorded: Record<string, unknown> = {};

const recordingFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    const res = await (globalThis.fetch as typeof fetch)(input as never, init as never);
    const text = await res.text();
    const key = `${url}|${decodeURIComponent(body)}`;
    recorded[key] = JSON.parse(text);
    console.log(`  [fetch] ${url}\n          body=${decodeURIComponent(body).slice(0, 220)}\n          HTTP ${res.status} bytes=${text.length}`);
    return { ok: res.ok, status: res.status, text: async () => text } as unknown as Response;
}) as typeof fetch;

function show(o: FetchOutcome<unknown>): string {
    return o.status === 'found' ? 'found' : `${o.status}: ${o.reason}`;
}

for (const kad of PARCELS) {
    console.log(`\n================ PARCEL ${kad} ================`);
    const outcome = await resolveLtParcelChain(kad, { fetchImpl: recordingFetch }, '2026-09-01T00:00:00Z');
    console.log(`chain outcome: ${show(outcome)}`);
    if (outcome.status !== 'found') continue;
    const chain: LtParcelChain = outcome.value;
    const p = chain.parcel;
    console.log(`PARCEL: kadastro_nr=${p.kadastroNr} unikalus_nr=${p.unikalusNr} areaM2=${p.areaM2} (raw ${p.areaHaRaw} ha) crs=${p.crs} ringPts=${p.ring.length} buildings=${p.buildingCount} ntrDate=${p.ntrDataDate}`);
    console.log(`  overlaps: ${JSON.stringify(p.overlaps)}`);
    console.log(`ASGR: ${show(chain.regulationZones)}`);
    if (chain.regulationZones.status !== 'found') continue;
    for (const z of chain.regulationZones.value) {
        console.log(`\n  --- ASGR OBJECTID ${z.polygon.objectId} (ring ${z.polygon.ring.length} pts) ---`);
        console.log(`  classifications: ${z.polygon.classifications.map((c) => `${c.field}=${c.value ?? 'null'}[TP ${c.tpdSystemId ?? '-'} NR ${c.documentNumber ?? '-'} D ${c.approvalDate ?? '-'} TPR ${c.planningKind ?? '-'}]`).join(' | ')}`);
        console.log(`  numerics: ${z.polygon.numerics.map((n) => `${n.field}=${n.value ?? 'null'}`).join(' | ')}`);
        console.log(`  flags: PILN=${z.polygon.completenessFlag ?? 'null'} ATN_DOK=${z.polygon.nonSpatialUpdateFlag ?? 'null'} PRIORIT=${z.polygon.priority ?? 'null'}`);
        console.log(`  minted plans: ${z.plans.map((pl) => `${pl.id} kind=${pl.kind} status="${pl.status}" adopted=${pl.adoptedDate} inForce=${pl.inForceFrom}`).join(' ; ') || '(none)'}`);
        console.log(`  minted zone: ${z.zone ? `${z.zone.id} national=${z.zone.typology.national} planId=${z.zone.planId}` : '(none — inline-geometry leg)'}`);
        for (const r of z.rules) {
            const pr = r.provenance;
            console.log(
                `    RULE ${r.id}\n      param=${pr.parameter} value=${JSON.stringify(pr.value)} unit=${pr.unit ?? '-'} tier=${pr.confidence.tier} loc=${pr.valueLocation}` +
                    `\n      valueBasis=${pr.valueBasis ? `${pr.valueBasis.scheme}:${pr.valueBasis.code}` : '-'} force="${pr.normativeForce ?? '-'}"` +
                    `\n      validityBasis=${pr.validityBasis} valid_from=${pr.valid_from}` +
                    `\n      source.plan_id=${pr.source.plan_id ?? '-'} source.document=${pr.source.document ?? '-'} source.object_id=${pr.source.object_id ?? '-'}` +
                    `\n      basis=${JSON.stringify(r.applicability.basis)} inlineGeom=${r.applicability.geometry ? 'yes' : 'no'}` +
                    (pr.confidence.note ? `\n      note=${pr.confidence.note.slice(0, 400)}` : ''),
            );
        }
    }
}

const dir = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(dir, { recursive: true });
const out = { __label__: 'RECORDED LIVE 2026-09-01 from the Lithuanian national services (tpdr.planuojustatau.lt ASGR + ribos, osp-sdg.stat.gov.lt ntr_sklypai). Keys are `<url>|<decoded form body>`. Re-record with probe-lt-chain.mts.', ...recorded };
writeFileSync(`${dir}/recorded-live-2026-09-01.json`, JSON.stringify(out, null, 1));
console.log(`\nrecorded ${Object.keys(recorded).length} responses`);
