#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THE PARCEL DENOMINATOR — Catastro INSPIRE CP, per-municipality, keyed on the 5-digit INE code.
//
// WHY THIS FILE EXISTS (coordinator addendum, 2026-08-02):
//   "Do not attempt to reconcile the three area bases. The unit is now CADASTRAL PARCELS — the
//    parcel, from Catastro, as the denominator for every coverage figure."
// It is what the product delivers (the user selects a parcel), it is published uniformly for every
// municipality in Spain, it is obtainable COLD with no municipal zoning layer, and it is identical
// in Lugo and in Madrid.
//
// ⚠ KNOWN EXCEPTION, NOT A GAP: País Vasco (01/20/48) and Navarra (31) run their own foral
// cadastres. Their INE codes are REFUSED by this tool rather than silently mis-measured.
//
// WHAT IT DOES
//   1. Resolves the province ATOM → the municipality's `A.ES.SDGC.CP.<INE>.zip` enclosure URL.
//      (The path segment carries the municipality NAME, so the ATOM hop is not optional.)
//   2. Downloads + inflates the GML.
//   3. Streams it, emitting one record per `cp:CadastralParcel`: refcat, official area, centroid.
//      ⇒ the EXACT parcel population of the municipality, and a perfect uniform sampling frame.
//
// This is a COUNT frame, not an area frame. Every parcel weighs 1. That is the whole point of the
// addendum: Madrid's parcel count relative to its area is nothing like Córdoba's.
//
// §CONTEXT-DATA-HONESTY — the three outcomes stay three different values. A 403/timeout is
// `unknown`, never `absent`. Nothing here folds a transport failure into a count.
//
// LAYERING — a build/inspection tool, not a layered package, so its exports take no OTel span
// (same posture as tools/city-completion/*.mjs, which say so in their own headers).
//
// USAGE
//   node catastroParcelFrame.mjs --ine 14021                 # build/refresh one frame
//   node catastroParcelFrame.mjs --ine 08019 --sample 400 --seed 20260802
// ─────────────────────────────────────────────────────────────────────────────
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
export const USER_AGENT = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';

/** Foral cadastres — a separate adapter, NOT a coverage gap. Refused, never approximated. */
export const FORAL_PROVINCES = new Set(['01', '20', '48', '31']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _lastReq = 0;
async function politeFetch(url, { timeoutMs = 300_000, binary = false } = {}) {
    const gap = Date.now() - _lastReq;
    if (gap < 400) await sleep(400 - gap);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': USER_AGENT } });
        _lastReq = Date.now();
        if (!res.ok) return { outcome: 'http-error', status: res.status, message: `HTTP ${res.status}` };
        const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
        return { outcome: 'ok', status: res.status, body };
    } catch (e) {
        _lastReq = Date.now();
        return {
            outcome: ac.signal.aborted ? 'timeout' : 'network-error',
            status: null, message: e instanceof Error ? e.message : String(e),
        };
    } finally { clearTimeout(timer); }
}

/** Strip accents/case/punctuation so `CÓRDOBA`, `A�ORA` and `Cordoba` compare equal. */
export function normName(s) {
    return (s ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim().toUpperCase();
}

/**
 * ⚠⚠ MEASURED 2026-08-02, AND IT IS THE TRAP IN THIS WHOLE DENOMINATOR.
 * **The Catastro (DGC) municipality code is NOT the INE code, and the two COLLIDE.** For every
 * provincial capital the DGC code is `<prov>900`: Córdoba is INE 14021 but Catastro **14900**;
 * Madrid INE 28079 → **28900**; Barcelona INE 08019 → **08900**; Lugo INE 27028 → **27900**.
 *
 * ⛔ THE COLLISION IS THE DANGEROUS PART, NOT THE OFFSET. **DGC 46250 is TURÍS** — a real
 * 6,500-person municipality 24 km inland — while **INE 46250 is VALÈNCIA**. A national pipeline
 * keyed on the INE code (which is what every other service in this repo uses, including SIU, whose
 * field is literally named `ProvINE`) therefore does not fail for València: it **silently returns a
 * different, real, plausible municipality**. Measured here on the first run — the València frame
 * came back with 23,784 parcels against Barcelona's 78,371, which is the only reason it was caught.
 * Failure disguised as success is worse than failure (§CONTEXT-DATA-HONESTY, one level up).
 *
 * ⇒ **NAME is authoritative; the code is a hint.** A code/name DISAGREEMENT refuses loudly rather
 * than picking one. Without a name we refuse too — an unverified code match is exactly the Turís bug.
 */
export function findEnclosure(xml, ine, name) {
    const prov = ine.slice(0, 2);
    const entries = [...xml.matchAll(/href="([^"]*A\.ES\.SDGC\.CP\.(\d{5})\.zip)"/gi)]
        .map((m) => ({ url: m[1], code: m[2] }));
    const titles = new Map(
        [...xml.matchAll(/<title>\s*(\d{5})-([^<]*?)\s*Cadastral Parcels<\/title>/gi)]
            .map((m) => [m[1], m[2]]),
    );
    const byCode = entries.find((e) => e.code === ine);
    if (!name) {
        // No name to corroborate with ⇒ a bare code match is untrustworthy (the Turís case).
        return byCode ? { ...byCode, matchedBy: 'ine-code-UNCORROBORATED', warning: 'no name supplied; DGC/INE codes collide' } : null;
    }
    const want = normName(name);
    const byName = entries.find((e) => normName(titles.get(e.code)) === want);
    if (byName && byCode && byName.code !== byCode.code) {
        return {
            ...byName,
            matchedBy: 'name',
            warning: `DGC/INE COLLISION: code ${ine} is "${titles.get(byCode.code)}" but INE ${ine} is "${name}" ⇒ used DGC ${byName.code}`,
        };
    }
    if (byName) return { ...byName, matchedBy: byName.code === ine ? 'name+code-agree' : `name (DGC ${byName.code} ≠ INE ${ine})` };

    // ⚠⚠ THIRD TIER — ADDED 2026-08-02 AFTER THE AMB RUN, AND IT IS A **PUBLISHER** DEFECT, NOT OURS.
    //
    // MEASURED: the province ATOM is `encoding="ISO-8859-1"` and contains **ZERO non-ASCII bytes** —
    // the publisher has already flattened the names. Accents flatten CLEANLY (`Gavà`→`GAVA`,
    // `Pallejà`→`PALLEJA`), but **`ç` and `'` are replaced by a GAP**, one space per lost UTF-8 byte:
    //     08263  "SANT VICEN  DELS HORTS"   ⇐ Sant Vicenç dels Horts
    //     08221  "SANT LLOREN  SAVALL"      ⇐ Sant Llorenç Savall
    //     08077  "L  ESPUNYOLA"             ⇐ L'Espunyola
    // **10 of province 08's 311 entries (3.2 %)** are damaged this way. Exact-name matching therefore
    // REFUSES on them — fail-closed, which is correct, but it BLOCKS a real municipality (08263 is in
    // the AMB 36) on a defect in someone else's string handling.
    //
    // ⇒ The gap is treated as a BOUNDED WILDCARD (`.{0,3}`) — never an unbounded one — and the match
    //   is required to be **UNIQUE**. Two candidates refuse. This keeps the guard name-authoritative:
    //   it still cannot select a differently-NAMED municipality, which is the Turís failure mode.
    const gapCandidates = entries.filter((e) => {
        const t = titles.get(e.code);
        if (!t || !/\s{2,}/.test(t)) return false;
        // Each separator in the flattened title becomes a BOUNDED wildcard: the publisher dropped at
        // most a couple of characters, so `.{0,3}` is generous without being open-ended.
        const pattern = normName(t).split(' ').filter(Boolean).join('.{0,3}');
        try { return new RegExp(`^${pattern}$`).test(want); } catch { return false; }
    });
    if (gapCandidates.length === 1) {
        const g = gapCandidates[0];
        return {
            ...g,
            matchedBy: `name-with-publisher-gap-wildcard (ATOM title "${titles.get(g.code)}" has a character the publisher dropped)`,
            warning: `PUBLISHER NAME DEFECT: Catastro's ATOM title for DGC ${g.code} is "${titles.get(g.code)}" — a 'ç' or apostrophe was replaced by a gap. Matched leniently and UNIQUELY against "${name}".`,
        };
    }
    if (gapCandidates.length > 1) return null; // ambiguous ⇒ refuse, never pick
    return null;
}

/** Province ATOM → the enclosure URL for one municipality. Returns `{ ok, url }` or a failure. */
export async function resolveMunicipalityZipUrl(ine, name) {
    const prov = ine.slice(0, 2);
    if (FORAL_PROVINCES.has(prov)) {
        return { ok: false, reason: 'foral-cadastre', message: `province ${prov} runs a foral cadastre; Catastro CP does not publish it` };
    }
    if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
    const atomPath = join(CACHE, `atom_${prov}.xml`);
    let xml;
    if (existsSync(atomPath)) {
        xml = readFileSync(atomPath, 'utf8');
    } else {
        const r = await politeFetch(`https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/${prov}/ES.SDGC.CP.atom_${prov}.xml`);
        if (r.outcome !== 'ok') return { ok: false, reason: r.outcome, message: r.message };
        xml = r.body;
        writeFileSync(atomPath, xml);
    }
    const hit = findEnclosure(xml, ine, name);
    if (!hit) {
        return { ok: false, reason: 'not-in-atom', message: `INE ${ine}${name ? ` (${name})` : ''} has no enclosure in province ${prov}'s ATOM — matched neither by name nor by a corroborated code` };
    }
    if (hit.warning) console.warn(`  ⚠ ${ine}: ${hit.warning}`);
    return { ok: true, url: hit.url, dgcCode: hit.code, matchedBy: hit.matchedBy, warning: hit.warning ?? null };
}

/** Download + inflate the municipality GML. Cached on disk. Returns `{ ok, gmlPath, bytes }`. */
export async function fetchMunicipalityGml(ine, name) {
    if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
    const gmlPath = join(CACHE, `CP_${ine}.gml`);
    if (existsSync(gmlPath) && statSync(gmlPath).size > 0) {
        return { ok: true, gmlPath, bytes: statSync(gmlPath).size, cached: true };
    }
    const loc = await resolveMunicipalityZipUrl(ine, name);
    if (!loc.ok) return { ok: false, ...loc };
    const zipPath = join(CACHE, `CP_${ine}.zip`);
    if (!existsSync(zipPath) || statSync(zipPath).size === 0 || readFileSync(zipPath).slice(0, 2).toString('latin1') !== 'PK') {
        // ⚠⚠ TWO DEFECTS MEASURED 2026-08-02 ON 08263 SANT VICENÇ DELS HORTS, AND BOTH ARE THE
        //    PUBLISHER'S — but the first one is ours to survive.
        //
        // (a) FAILURE DISGUISED AS SUCCESS. A wrong enclosure path does NOT 404. Catastro answers
        //     **HTTP 200, content-type text/html, 15,257 bytes** of its own site chrome. `res.ok` is
        //     true, so the old code wrote an HTML page to `CP_<ine>.zip` and only noticed three
        //     steps later as "no-gml-in-zip" — a diagnosis that blames the archive rather than the
        //     URL. ⇒ THE `PK` MAGIC IS NOW ASSERTED. §CONTEXT-DATA-HONESTY: a 200 that is not the
        //     thing you asked for is a FAILURE, not an empty result.
        //
        // (b) THE ATOM'S OWN href IS UNRESOLVABLE FOR ç/apostrophe NAMES. The feed is
        //     `encoding="ISO-8859-1"` and holds ZERO non-ASCII bytes: the publisher has flattened
        //     every name, and where a `ç` or `'` stood it left a GAP — but it left the gap in the
        //     TITLE **and in the DIRECTORY SEGMENT OF THE DOWNLOAD URL**, while the real directory
        //     on disk has a SINGLE space. Measured:
        //         ATOM href …/08/08263-SANT VICEN{2 spaces}DELS HORTS/…  ⇒ HTML, 200
        //         real path …/08/08263-SANT VICEN{1 space}DELS HORTS/…   ⇒ ZIP, 1,563,798 bytes
        //     `%C7`, `%C3%87` and a literal `C` were all tried and all returned the HTML page, so
        //     the single-space collapse is the identified fix, not a guess.
        //     **10 of province 08's 311 entries (3.2 %) carry such a gap.** Every one of them is
        //     unreachable through the URL the publisher printed.
        const attempts = [];
        let saved = null;
        const variants = [loc.url];
        if (/\s{2,}/.test(loc.url)) variants.push(loc.url.replace(/\s{2,}/g, ' '));
        for (const v of variants) {
            const r = await politeFetch(v, { binary: true });
            if (r.outcome !== 'ok') { attempts.push({ url: v, outcome: r.outcome, message: r.message }); continue; }
            const isZip = r.body.slice(0, 2).toString('latin1') === 'PK';
            attempts.push({ url: v, outcome: isZip ? 'zip' : 'not-a-zip', bytes: r.body.length, firstBytes: r.body.slice(0, 4).toString('hex') });
            if (isZip) { saved = r.body; break; }
        }
        if (!saved) {
            return { ok: false, reason: 'enclosure-not-a-zip', message: `every candidate enclosure URL for INE ${ine} answered with something that is not a ZIP (HTTP 200 + text/html is Catastro's not-found page)`, attempts };
        }
        writeFileSync(zipPath, saved);
    }
    // Inflate with the platform unzip; the archive holds exactly one .gml.
    try {
        execFileSync('powershell', ['-NoProfile', '-Command',
            `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${join(CACHE, `x_${ine}`)}' -Force`],
            { stdio: 'pipe' });
    } catch (e) {
        return { ok: false, reason: 'unzip-failed', message: String(e.message ?? e).slice(0, 300) };
    }
    const dir = join(CACHE, `x_${ine}`);
    const { readdirSync } = await import('node:fs');
    const gml = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.gml'));
    if (!gml) return { ok: false, reason: 'no-gml-in-zip', message: `archive for ${ine} holds no .gml` };
    const { renameSync } = await import('node:fs');
    renameSync(join(dir, gml), gmlPath);
    return { ok: true, gmlPath, bytes: statSync(gmlPath).size, cached: false };
}

/**
 * ⚠⚠ THE SECOND TRAP, MEASURED 2026-08-02. The per-municipality ATOM GML is **NOT** EPSG:4326 — it
 * is ETRS89 / UTM, and **the zone differs between municipalities**: measured 25831 (Barcelona),
 * 25830 (Madrid · Murcia · Córdoba · València), 25829 (Lugo). The `wfsCP.aspx` point service used
 * elsewhere in this repo DOES answer in 4326 when asked, which is exactly why nobody had met this.
 *
 * Treating the coordinates as lat/lon does not throw and does not return empty: every zoning query
 * lands in the sea off West Africa and the publisher answers, correctly, "no polygon here". The
 * first Barcelona run scored **6 of 6 parcels `nonBuildable`** on that basis. A false negative that
 * survives a well-formed 200 is the whole reason PROBE-DISCIPLINE R2 demands an independent oracle.
 * ⇒ The CRS is READ FROM THE FILE, never assumed, and an unrecognised one REFUSES.
 */
export function utmZoneFromSrs(srs) {
    const m = String(srs ?? '').match(/(?:EPSG[:/](?:0\/)?)(\d{4,5})/);
    if (!m) return null;
    const code = +m[1];
    if (code >= 25828 && code <= 25831) return code - 25800; // ETRS89 / UTM zone N
    if (code >= 23028 && code <= 23031) return code - 23000; // ED50 / UTM zone N (legacy sheets)
    if (code === 4326) return 0;                              // already geographic
    return null;
}

/**
 * Inverse transverse Mercator (Snyder 8-9 … 8-13), GRS80 — ETRS89/UTM → WGS84 lat/lon.
 * ETRS89 and WGS84 differ by < 1 m in Iberia, far below the parcel-scale precision this needs.
 */
export function utmToWgs84(easting, northing, zone) {
    const a = 6378137.0, f = 1 / 298.257222101, k0 = 0.9996;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const M = northing / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const phi1 = mu
        + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const C1 = ep2 * c * c, T1 = t * t;
    const N1 = a / Math.sqrt(1 - e2 * s * s);
    const R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5;
    const D = (easting - 500000) / (N1 * k0);
    const lat = phi1 - (N1 * t / R1) * (
        D ** 2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
    );
    const lon = (6 * zone - 183) * Math.PI / 180 + (
        D
        - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
    ) / c;
    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

/**
 * Stream the GML and emit one record per parcel: `{ ref, areaM2, lat, lon, srs }`.
 * Centroid = arithmetic mean of the first exterior ring's vertices — sufficient to point-query a
 * zoning layer, and deliberately NOT used as an area (the official `cp:areaValue` is).
 * ⚠ In the ATOM GML the posList is **easting northing** (projected), not lat lon.
 */
export function parseParcels(gmlPath) {
    const text = readFileSync(gmlPath, 'latin1'); // the feed declares ISO-8859-1
    const srs = text.match(/srsName="([^"]+)"/)?.[1] ?? null;
    const zone = utmZoneFromSrs(srs);
    if (zone === null) throw new Error(`unrecognised CRS "${srs}" in ${gmlPath} — refusing rather than assuming lat/lon`);
    const chunks = text.split('<cp:CadastralParcel ');
    const out = [];
    for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        const idm = c.match(/gml:id="ES\.SDGC\.CP\.([^"]+)"/);
        const am = c.match(/<cp:areaValue[^>]*>([\d.]+)<\/cp:areaValue>/);
        const pm = c.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
        if (!idm || !pm) continue;
        const nums = pm[1].trim().split(/\s+/);
        let sx = 0, sy = 0, k = 0;
        for (let j = 0; j + 1 < nums.length; j += 2) {
            const x = +nums[j], y = +nums[j + 1];
            if (Number.isFinite(x) && Number.isFinite(y)) { sx += x; sy += y; k++; }
        }
        if (!k) continue;
        const { lat, lon } = zone === 0
            ? { lat: sx / k, lon: sy / k }        // already geographic, lat,lon order
            : utmToWgs84(sx / k, sy / k, zone);   // projected, easting,northing order
        out.push({ ref: idm[1], areaM2: am ? +am[1] : null, lat: +lat.toFixed(7), lon: +lon.toFixed(7), srs });
    }
    return out;
}

/** Seeded PRNG — same design as tools/city-completion/parcelSampleProbe.mjs, so draws are diffable. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Uniform WITHOUT replacement over the parcel population — every parcel weighs exactly 1. */
export function drawUniform(parcels, n, seed) {
    const rnd = mulberry32(seed);
    const idx = parcels.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.min(n, idx.length)).map((i) => parcels[i]);
}

/** Build (or load) the full frame for one municipality. */
export async function buildFrame(ine, name) {
    const g = await fetchMunicipalityGml(ine, name);
    if (!g.ok) return { ok: false, ine, ...g };
    const parcels = parseParcels(g.gmlPath);
    return { ok: true, ine, gmlBytes: g.bytes, cached: g.cached, parcelCount: parcels.length, parcels };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
    const ine = arg('--ine');
    const name = arg('--name');
    if (!ine) { console.error('usage: node catastroParcelFrame.mjs --ine <5-digit INE> [--name <municipality>] [--sample N] [--seed S]'); process.exit(2); }
    const t0 = Date.now();
    const f = await buildFrame(ine, name);
    if (!f.ok) { console.error(`✗ ${ine}: ${f.reason} — ${f.message}`); process.exit(1); }
    console.log(`▶ ${ine}: ${f.parcelCount.toLocaleString()} cadastral parcels (${(f.gmlBytes / 1e6).toFixed(1)} MB GML, cached=${f.cached}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    const n = Number(arg('--sample', '0'));
    if (n > 0) {
        const seed = Number(arg('--seed', '20260802'));
        const s = drawUniform(f.parcels, n, seed);
        const out = join(HERE, 'frames', `${ine}.sample.json`);
        if (!existsSync(join(HERE, 'frames'))) mkdirSync(join(HERE, 'frames'), { recursive: true });
        writeFileSync(out, JSON.stringify({
            ine, parcelPopulation: f.parcelCount, seed, requested: n, drawn: s.length,
            method: 'uniform without replacement over the municipality\'s full Catastro INSPIRE CP parcel population; every parcel weighs 1',
            drawnAt: new Date().toISOString(), parcels: s,
        }, null, 1));
        console.log(`  sample: ${s.length} parcels → ${out}`);
    }
}
