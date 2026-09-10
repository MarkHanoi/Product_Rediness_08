// Live probe of the AREA capability, calling the SERVER RESOLVERS directly (not HTTP), so what is
// measured is the code that will run in production — the URL each leg builds, the parser it picks,
// and the outcome it returns. Lane CADASTRAL-COVERAGE, 2026-09-09.
import { resolveEuParcelsInArea } from '../../server/jurisdiction/euCadastreProxy.js';
import { fetchDawaParcelsInArea } from '../../server/jurisdiction/dkMatrikelProxy.js';

const POINTS = [
    ['FR Paris', 'fr', 2.3522, 48.8566, 150],
    ['NL Amsterdam', 'nl', 4.8952, 52.3702, 150],
    ['CH Zurich (point-only leg — expect unsupported)', 'ch', 8.5417, 47.3769, 150],
    ['FR sea (expect ok:[] — a fact about the land)', 'fr', -3.0, 46.0, 150],
];

function ringOk(p) {
    return Array.isArray(p.ring) && p.ring.length >= 3
        && p.ring.every((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon));
}

for (const [name, cc, lon, lat, r] of POINTS) {
    const t0 = Date.now();
    let out;
    try {
        out = await resolveEuParcelsInArea(cc, lon, lat, r);
    } catch (e) {
        console.log(`${name.padEnd(52)} THREW ${e?.message ?? e}`);
        continue;
    }
    const ms = Date.now() - t0;
    const n = out.parcels?.length ?? 0;
    const bad = (out.parcels ?? []).filter((p) => !ringOk(p)).length;
    const named = (out.parcels ?? []).filter((p) => p.refcat).length;
    console.log(
        `${name.padEnd(52)} outcome=${String(out.outcome).padEnd(12)} n=${String(n).padEnd(4)} `
        + `named=${String(named).padEnd(4)} badRings=${bad} trunc=${out.truncated} ${ms}ms`
        + (out.reason ? ` | ${out.reason.slice(0, 90)}` : ''),
    );
    if (n > 0) console.log(`${' '.repeat(52)} e.g. refcat=${out.parcels[0].refcat} pts=${out.parcels[0].ring.length} areaM2=${Math.round(out.parcels[0].areaM2)}`);
}

// Denmark — the keyless DAWA circle leg.
{
    const t0 = Date.now();
    let out;
    try {
        out = await fetchDawaParcelsInArea(12.5683, 55.6761, 150);
        const n = out.parcels?.length ?? 0;
        const bad = (out.parcels ?? []).filter((p) => !ringOk(p)).length;
        console.log(
            `${'DK Copenhagen (DAWA keyless)'.padEnd(52)} outcome=${String(out.outcome).padEnd(12)} `
            + `n=${String(n).padEnd(4)} badRings=${bad} trunc=${out.truncated} ${Date.now() - t0}ms`
            + (out.reason ? ` | ${out.reason.slice(0, 90)}` : ''),
        );
        if (n > 0) console.log(`${' '.repeat(52)} e.g. refcat=${out.parcels[0].refcat} pts=${out.parcels[0].ring.length}`);
    } catch (e) {
        console.log(`DK THREW ${e?.message ?? e}`);
    }
}

// §ONE-READ-PER-BBOX — two callers, same box, same tick: the second must share the first promise.
{
    const t0 = Date.now();
    const [a, b] = await Promise.all([
        resolveEuParcelsInArea('nl', 4.8952, 52.3702, 150),
        resolveEuParcelsInArea('nl', 4.8952, 52.3702, 150),
    ]);
    console.log(`\n[dedup] two simultaneous NL asks -> same object: ${a === b} `
        + `(n=${a.parcels?.length ?? 0}, ${Date.now() - t0}ms total)`);
}
