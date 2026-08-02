/**
 * E5 — ⛔ KNOWN-ANSWER CONTROL ON THE PARSER, BEFORE IT IS TRUSTED AT SCALE.
 *
 * ⭐ A GUESSED DICTIONARY ONCE REPORTED METRIC HEIGHT AS 0/80 ABSENT WHEN IT IS
 * 49/80. The lesson was not "derive the dictionary" alone — it was that a parser
 * failure and a data absence are INDISTINGUISHABLE in the output. So the parser
 * is pinned against fitxes whose values were read BY HAND and recorded in
 * docs/04-reference/jurisdictions/es/es-ib/BALEARS-MUIB-ASSESSMENT.md:
 *
 *   Manacor RE-NA (id 292430):  PM 200 m² · AM 7 m · NP 3 plantes · O 80 % ·
 *                               IRP 120 m²/hab · E 2.4 · T EM
 *                               Article 66 (on NP) and Article 56.3.j (on O)
 *
 * A SECOND, NEGATIVE control matters as much: the parser must NOT report a
 * geometric parameter where the fitxa only has a USE row. `AT` (Allotjament
 * turístic) and `RL` (Religiós) must come back ABSENT as parameters even though
 * both strings appear in the page.
 *
 * The captured HTML in the sibling probe's out/ is used when reachable;
 * otherwise the pages are re-fetched live from the same identitat.
 *
 * Run:  node tools/balears-envelope-max/e5-parser-control.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMuibArtefact } from './lib.mjs';
import { parseFitxa, classify, drawability } from './fitxa-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

const FIXTURES = [
  {
    id: '292430',
    file: 'out/p-test-292430.html',
    url: 'https://ideib.caib.es/visualitzador/normativa.jsp?identitat=292430',
    expect: {
      PM: 200, AM: 7, NP: 3, O: 80, IRP: 120, E: 2.4,
    },
    expectUnits: { PM: /m2/i, AM: /^m$/i, NP: /plantes/i, O: /%/ },
    expectAbsent: ['AT', 'RL', 'CO', 'UN', 'PL'],
    expectArticles: ['Article 66', 'Article 56.3.j'],
  },
  { id: '292441', file: 'out/p-test-292441.html', url: 'https://ideib.caib.es/visualitzador/normativa.jsp?identitat=292441' },
  {
    // ⭐ REGRESSION FIXTURE for the DENOMINACIÓ MUNICIPAL column.
    // Alcúdia RE_NA_VE publishes exactly one parameter row, and it carries a
    // populated municipal-denomination cell between the code and the `-->`:
    //   |T: Tipus d’ordenació |Tipologia |--> |VE: Volumetria específica |
    // The first version of this parser required `-->` to be the NEXT cell and
    // therefore returned ZERO parameters for this page — and for every other
    // page from a municipality that fills that column. It scored 46 % of
    // private-developable fitxes as "no parameters at all" before the miss was
    // caught. ⛔ A PARSE FAILURE AND A DATA ABSENCE ARE THE SAME VALUE.
    id: '280990',
    url: 'http://muib.caib.es/mapurbibfront/normativa.jsp?identitat=280990',
    expectPresentCodes: ['T'],
    expectNoUnparsedCodeCells: true,
  },
];

const R = { probe: 'e5-parser-control', runAt: new Date().toISOString(), fixtures: [], pass: true };

for (const fx of FIXTURES) {
  let html = null;
  let source;
  const local = fx.file ? findMuibArtefact(HERE, fx.file, path, fs) : null;
  if (local) { html = fs.readFileSync(local, 'utf8'); source = local; }
  else {
    const res = await fetch(fx.url, { headers: { 'User-Agent': 'PRYZM-balears-envelope-max/1.0' } });
    if (!res.ok) { R.fixtures.push({ id: fx.id, error: `HTTP ${res.status}` }); R.pass = false; continue; }
    html = await res.text();
    source = fx.url + ' (live)';
  }

  const parsed = parseFitxa(html);
  const P = {};
  for (const c of Object.keys(parsed.rows)) P[c] = classify(c, parsed.rows[c]);
  const rec = {
    id: fx.id,
    source,
    identitat: parsed.identitat,
    municipi: parsed.municipi,
    codiMuib: parsed.codiMuib,
    codesFound: Object.keys(parsed.rows),
    articleRefsAll: parsed.articleRefsAll,
    drawability: drawability(P),
    checks: [],
  };

  if (fx.expect) {
    for (const [code, want] of Object.entries(fx.expect)) {
      const got = P[code];
      const ok = got && got.status === 'PRESENT' && Math.abs((got.value ?? NaN) - want) < 1e-9;
      rec.checks.push({ check: `${code} === ${want}`, got: got ? `${got.status}/${got.verdict ?? ''}/${got.value}` : 'ABSENT', pass: !!ok });
      if (!ok) R.pass = false;
    }
    for (const [code, re] of Object.entries(fx.expectUnits || {})) {
      const got = P[code];
      const ok = got && re.test(String(got.units || ''));
      rec.checks.push({ check: `${code} units ~ ${re}`, got: got ? String(got.units) : 'ABSENT', pass: !!ok });
      if (!ok) R.pass = false;
    }
    for (const code of fx.expectAbsent || []) {
      const ok = !parsed.rows[code];
      rec.checks.push({ check: `${code} NOT parsed as a parameter (it is a USE)`, got: parsed.rows[code] ? JSON.stringify(parsed.rows[code].value) : 'ABSENT', pass: ok });
      if (!ok) R.pass = false;
    }
    for (const a of fx.expectArticles || []) {
      const ok = parsed.articleRefsAll.some((x) => x.replace(/\s+/g, ' ') === a);
      rec.checks.push({ check: `article "${a}" found`, got: parsed.articleRefsAll.join(' | '), pass: ok });
      if (!ok) R.pass = false;
    }
    // ⭐ the citation question in its strong form: is the article attached to
    // the parameter it governs, or merely somewhere on the page?
    rec.articleOnNP = (P.NP && P.NP.articleRefs) || [];
    rec.articleOnO = (P.O && P.O.articleRefs) || [];
    rec.checks.push({
      check: 'Article 66 attached to the NP row itself',
      got: rec.articleOnNP.join(' | '),
      pass: rec.articleOnNP.some((x) => /Article 66/.test(x)),
    });
    if (!rec.articleOnNP.some((x) => /Article 66/.test(x))) R.pass = false;
  }
  for (const code of fx.expectPresentCodes || []) {
    const ok = !!parsed.rows[code];
    rec.checks.push({ check: `${code} row parsed`, got: parsed.rows[code] ? JSON.stringify(parsed.rows[code].value).slice(0, 60) : 'ABSENT', pass: ok });
    if (!ok) R.pass = false;
  }
  // ⛔ SELF-DIAGNOSIS ON EVERY FIXTURE, not only the one it was written for.
  rec.codeCellsSeen = parsed.codeCellsSeen;
  rec.codeCellsUnparsed = parsed.codeCellsUnparsed;
  const noMiss = parsed.codeCellsUnparsed.length === 0;
  rec.checks.push({ check: 'no unparsed code cells', got: parsed.codeCellsUnparsed.join(' ; ') || '(none)', pass: noMiss });
  if (!noMiss && fx.expectNoUnparsedCodeCells !== false) R.pass = false;

  rec.parameters = P;
  R.fixtures.push(rec);
}

fs.writeFileSync(path.join(OUT, 'e5-parser-control.json'), JSON.stringify(R, null, 2));
for (const f of R.fixtures) {
  console.error(`--- fixture ${f.id} (${f.municipi} ${f.codiMuib}) from ${f.source}`);
  console.error(`    codes: ${(f.codesFound || []).join(', ')}`);
  for (const c of f.checks || []) console.error(`    ${c.pass ? 'PASS' : '⛔ FAIL'}  ${c.check}  -> ${c.got}`);
  console.error(`    drawability: ${JSON.stringify(f.drawability && { tier: f.drawability.tier, reasons: f.drawability.reasons })}`);
}
console.error(`\nPARSER CONTROL: ${R.pass ? 'PASS' : '⛔ FAIL — do not run the census'}`);
if (!R.pass) process.exitCode = 1;
