// §MURCIA-ENVELOPE-MAX · STEP 6 — THE LIVE FICHA, AND THE REAL ADDRESSABILITY VERDICT
//
// ⭐ STEP 5 RESULT, and it is the load-bearing one:
//     PUBLISHED  http://opweb.carm.es/sitmurcia/potgisfichacen.jsp?wide=N…  → HTTP 404 (DEAD)
//     SAME URL over https://                                                → HTTP 302
//                                                        → http://urbmurcia.carm.es/urbmurcia/sitmurcia/…
//
//   So `Enlace_ficha` is 100 % POPULATED and 0 % RESOLVABLE AS PUBLISHED.
//   POPULATED IS NOT PRESENT. The channel is real but reachable only through a
//   scheme-upgrade the attribute does not tell you to perform.
//
// This step re-runs the FULL addressability matrix against the LIVE endpoint —
// cold, no Referer, no cookie, bare UA — because "reachable after a redirect I
// discovered by hand" is not the same capability as "addressable".

import { politeFetch, wfsJson, writeOut, sha256 } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 6, measuredAt: new Date().toISOString(), notes: [] };

const LIVE = (wide) => `http://urbmurcia.carm.es/urbmurcia/sitmurcia/potgisfichacen.jsp?wide=${wide}&widi=es&x=0&y=0`;
const VIEWER = 'http://urbmurcia.carm.es/urbmurcia/sitmurcia/';
const WIDE = 4921;

async function arm(tag, url, headers = {}, redirect = 'follow') {
  try {
    const r = await politeFetch(url, { ...O, tag: 'live-' + tag, headers, timeout: 120_000, redirect });
    const raw = r.buf.toString('latin1');
    const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const rec = {
      tag,
      url,
      status: r.status,
      finalUrl: r.url,
      contentType: r.headers['content-type'] || null,
      bytes: r.buf.length,
      isPdf: raw.startsWith('%PDF-'),
      sha256: sha256(r.buf),
      // ⛔ HTTP 200 IS NOT SUCCESS. Detect an auth/session wall in the body.
      looksLikeAuthWall: /sesi[oó]n (?:caducad|expirad)|iniciar sesi|acceso denegado|no autorizado|debe identificarse/i.test(text),
      looksEmpty: text.length < 120,
      textLen: text.length,
      text: text.slice(0, 700),
    };
    report[tag] = rec;
    console.log(
      `  ${tag.padEnd(32)} ${String(r.status).padEnd(4)} ${String(r.buf.length).padStart(7)}B  pdf=${rec.isPdf ? 'Y' : 'n'} wall=${rec.looksLikeAuthWall ? 'Y' : 'n'} empty=${rec.looksEmpty ? 'Y' : 'n'} sha=${rec.sha256.slice(0, 10)}`
    );
    return rec;
  } catch (e) {
    report[tag] = { tag, url, error: String(e.message).slice(0, 500) };
    console.log(`  ${tag.padEnd(32)} ERROR ${String(e.message).slice(0, 160)}`);
    return report[tag];
  }
}

console.log('\n== 6a · the live matrix, cold first ==');
await arm('cold-bare-curl', LIVE(WIDE), { 'User-Agent': 'curl/8.5.0' });
await arm('cold-browser-ua', LIVE(WIDE), {});
await arm('with-referer', LIVE(WIDE), { Referer: VIEWER });
const viewer = await politeFetch(VIEWER, { ...O, tag: 'live-viewer-root', timeout: 120_000 });
const setCookie = viewer.headers['set-cookie'] || null;
report.viewerRoot = { status: viewer.status, bytes: viewer.buf.length, setCookie };
console.log(`  viewer root: HTTP ${viewer.status} ${viewer.buf.length}B cookie=${setCookie ? setCookie.split(';')[0] : '<<none>>'}`);
if (setCookie) {
  const c = setCookie.split(';')[0];
  await arm('with-cookie', LIVE(WIDE), { Cookie: c });
  await arm('with-cookie-and-referer', LIVE(WIDE), { Cookie: c, Referer: VIEWER });
} else {
  report.notes.push('live viewer root issued NO Set-Cookie — session-cookie arm not constructible; UNKNOWN, not "irrelevant"');
}

// ⭐ THE VERDICT
{
  const arms = ['cold-bare-curl', 'cold-browser-ua', 'with-referer', 'with-cookie', 'with-cookie-and-referer']
    .map((t) => report[t])
    .filter(Boolean);
  const served = arms.filter((a) => !a.error && a.status === 200 && !a.looksLikeAuthWall && !a.looksEmpty);
  const hashes = new Set(served.map((a) => a.sha256));
  const cold = report['cold-bare-curl'];
  report.verdict = {
    armsAttempted: arms.length,
    armsServingContent: served.length,
    distinctBodyHashesAcrossArms: hashes.size,
    coldBareClientServesContent: !!(cold && cold.status === 200 && !cold.looksLikeAuthWall && !cold.looksEmpty),
    classification: null,
    publishedUrlResolves: false,
    caveat:
      'the URL PUBLISHED in Enlace_ficha (http://opweb.carm.es/…) is HTTP 404. Reachability requires a ' +
      'scheme upgrade to https:// which then 302s to urbmurcia.carm.es. That rewrite is NOT published anywhere ' +
      'in the WFS attribute — it was discovered by probing.',
  };
  report.verdict.classification = report.verdict.coldBareClientServesContent
    ? 'ADDRESSABLE (after an UNPUBLISHED scheme-upgrade rewrite) — no Referer, no cookie, no browser UA'
    : served.length
      ? 'VIEWER-ONLY — an affordance is required'
      : 'UNREACHABLE';
  console.log(`\n  ⭐ VERDICT: ${report.verdict.classification}`);
  console.log(`     identical bytes across all ${served.length} serving arms: ${hashes.size === 1 ? 'YES → no affordance changes the answer' : 'NO (' + hashes.size + ' hashes) → an affordance DOES change the answer'}`);
}

// ── 6b · what does the ficha CONTAIN? ───────────────────────────────────────
console.log('\n== 6b · ficha content shape ==');
{
  const r = await politeFetch(LIVE(WIDE), { ...O, tag: 'shape2', timeout: 120_000 });
  const raw = r.buf.toString('latin1');
  const links = [...raw.matchAll(/(?:href|src|action)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim();
  report.shape = {
    bytes: r.buf.length,
    isPdf: raw.startsWith('%PDF-'),
    contentType: r.headers['content-type'],
    links: [...new Set(links)],
    pdfLinks: [...new Set(links.filter((l) => /\.pdf|pdf/i.test(l)))],
    frames: [...raw.matchAll(/<i?frame[^>]*src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
    text: text.slice(0, 6000),
  };
  console.log(`  bytes=${r.buf.length} ct=${r.headers['content-type']}`);
  console.log(`  links (${report.shape.links.length}): ${JSON.stringify(report.shape.links.slice(0, 30), null, 1)}`);
  console.log(`  frames: ${JSON.stringify(report.shape.frames)}`);
  console.log('  ---- TEXT ----');
  console.log(text.slice(0, 4000));
}

writeOut('06-ficha-live-matrix.json', report);
console.log('\nSTEP 6 done.');
