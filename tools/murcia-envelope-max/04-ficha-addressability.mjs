// §MURCIA-ENVELOPE-MAX · STEP 4 — IS THE FICHA ADDRESSABLE, OR VIEWER-ONLY?
//
// ⭐ This decides whether the route AUTOMATES AT ALL. A ficha reachable only
// from inside its own viewer (session cookie + Referer) is a DIFFERENT
// CAPABILITY from an addressable URL, even though both render in a browser.
//
// The matrix is run COLD FROM A CLEAN CLIENT — no cookie jar, no prior request
// to the viewer — and then repeated with each affordance added, so that any
// dependence is attributable to a single variable.

import { politeFetch, wfsJson, writeOut, sha256 } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 4, measuredAt: new Date().toISOString(), notes: [] };

// ── 4a · harvest the link population (one representative per municipality) ───
console.log('\n== 4a · ficha link population ==');
const j = await wfsJson(
  'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
  { propertyName: 'Municipio,Ambito,Clasificacion,Uso_Especifico,Area_m2,Enlace_ficha', count: 200000 },
  O
);
const rows = j.features.map((f) => f.properties);
report.population = { rows: rows.length, withLink: rows.filter((r) => r.Enlace_ficha).length };

const byMuni = new Map();
for (const r of rows) {
  if (!r.Enlace_ficha) continue;
  if (!byMuni.has(r.Municipio)) byMuni.set(r.Municipio, r);
}
console.log(`  ${rows.length} rows, ${byMuni.size} municipalities with at least one ficha link`);

const probe = byMuni.get('Murcia') || [...byMuni.values()][0];
console.log(`  probe target: ${probe.Municipio} / ${probe.Ambito} → ${probe.Enlace_ficha}`);
report.probeTarget = probe;

// ── 4b · THE MATRIX. Cold, then each affordance added one at a time. ─────────
// NOTE: node's fetch keeps no cookie jar, so every call here is genuinely cold
// unless we set Cookie explicitly. That is the property we want.
console.log('\n== 4b · addressability matrix ==');
const VIEWER = 'http://opweb.carm.es/sitmurcia/';

async function attempt(tag, url, headers) {
  try {
    const r = await politeFetch(url, { ...O, tag: 'addr-' + tag, headers, timeout: 120_000, redirect: 'manual' });
    const ct = r.headers['content-type'] || '';
    const isPdf = r.buf.slice(0, 5).toString('latin1') === '%PDF-';
    const body = r.buf.toString('latin1');
    return {
      tag,
      status: r.status,
      contentType: ct,
      bytes: r.buf.length,
      isPdf,
      location: r.headers['location'] || null,
      sha256: sha256(r.buf),
      // a login wall / "sesión" error page is a 200. HTTP 200 IS NOT SUCCESS.
      looksLikeAuthWall: /sesi[oó]n|login|acceso denegado|no autorizado|caducad/i.test(body.slice(0, 4000)),
      head: body.replace(/\s+/g, ' ').slice(0, 300),
    };
  } catch (e) {
    return { tag, error: String(e.message).slice(0, 600) };
  }
}

const url = probe.Enlace_ficha;
report.matrix = [];
report.matrix.push(await attempt('cold-no-referer-no-cookie', url, {}));
report.matrix.push(await attempt('with-referer', url, { Referer: VIEWER }));
report.matrix.push(await attempt('with-referer-and-origin', url, { Referer: VIEWER, Origin: 'http://opweb.carm.es' }));

// obtain a real session cookie from the viewer, then replay
console.log('  acquiring a viewer session cookie…');
const viewer = await politeFetch(VIEWER, { ...O, tag: 'viewer-root', timeout: 120_000 });
const setCookie = viewer.headers['set-cookie'] || null;
report.viewerRoot = { status: viewer.status, setCookie, bytes: viewer.buf.length };
const cookie = setCookie ? setCookie.split(';')[0] : null;
console.log(`  viewer root HTTP ${viewer.status}, cookie=${cookie || '<<none issued>>'}`);
if (cookie) {
  report.matrix.push(await attempt('with-cookie-only', url, { Cookie: cookie }));
  report.matrix.push(await attempt('with-cookie-and-referer', url, { Cookie: cookie, Referer: VIEWER }));
} else {
  report.notes.push('viewer root issued NO Set-Cookie — a session-cookie arm could not be constructed; recorded as UNKNOWN, not as "cookie irrelevant"');
}
// a non-browser client — if this works, the route is fully addressable
report.matrix.push(await attempt('bare-curl-ua', url, { 'User-Agent': 'curl/8.5.0' }));

for (const m of report.matrix) {
  console.log(
    `  ${m.tag.padEnd(30)} → ${m.error ? 'ERROR ' + m.error.slice(0, 120) : `HTTP ${m.status} ${m.contentType} ${m.bytes}B pdf=${m.isPdf} authWall=${m.looksLikeAuthWall} sha=${String(m.sha256).slice(0, 12)}`}`
  );
}

// ⭐ THE VERDICT — identical bytes across arms means no affordance was needed.
const ok = report.matrix.filter((m) => !m.error && m.status === 200 && !m.looksLikeAuthWall);
const hashes = new Set(ok.map((m) => m.sha256));
report.verdict = {
  armsAttempted: report.matrix.length,
  armsServingContent: ok.length,
  distinctBodyHashes: hashes.size,
  coldArmWorks: !!report.matrix.find((m) => m.tag === 'cold-no-referer-no-cookie' && m.status === 200 && !m.looksLikeAuthWall),
  bareClientWorks: !!report.matrix.find((m) => m.tag === 'bare-curl-ua' && m.status === 200 && !m.looksLikeAuthWall),
};
report.verdict.classification = report.verdict.coldArmWorks && report.verdict.bareClientWorks
  ? 'ADDRESSABLE — no Referer, no cookie, no browser UA required'
  : report.verdict.coldArmWorks
    ? 'ADDRESSABLE-WITH-BROWSER-UA'
    : ok.length
      ? 'VIEWER-ONLY — content served only with a viewer affordance'
      : 'UNREACHABLE — no arm served content (UNKNOWN, not "absent")';
console.log(`\n  ⭐ VERDICT: ${report.verdict.classification}`);

// ── 4c · what IS the ficha? HTML shell or the document itself ───────────────
console.log('\n== 4c · ficha document shape ==');
{
  const r = await politeFetch(url, { ...O, tag: 'shape', timeout: 120_000 });
  const body = r.buf.toString('latin1');
  const isPdf = body.startsWith('%PDF-');
  const links = [...body.matchAll(/(?:href|src|action)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const frames = [...body.matchAll(/<i?frame[^>]*src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  report.shape = {
    isPdf,
    bytes: r.buf.length,
    contentType: r.headers['content-type'],
    linkCount: links.length,
    pdfLinks: links.filter((l) => /\.pdf/i.test(l)).slice(0, 20),
    frames: frames.slice(0, 20),
    allLinks: [...new Set(links)].slice(0, 40),
    text: body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000),
  };
  console.log(`  isPdf=${isPdf} bytes=${r.buf.length} ct=${r.headers['content-type']}`);
  console.log(`  frames: ${JSON.stringify(report.shape.frames)}`);
  console.log(`  pdf links: ${JSON.stringify(report.shape.pdfLinks)}`);
  console.log(`  links: ${JSON.stringify(report.shape.allLinks.slice(0, 25), null, 1)}`);
  console.log(`  --- text ---\n${report.shape.text.slice(0, 1800)}`);
}

writeOut('04-ficha-addressability.json', report);
console.log('\nSTEP 4 done.');
