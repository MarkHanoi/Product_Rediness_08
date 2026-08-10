// §MURCIA-ENVELOPE-MAX · STEP 13 — PROVENANCE, AND THE §5 RANK AGAINST BALEARS
//
// The §5 question is "does Murcia CITE AN ARTICLE materially more often than Balears'
// 3-of-60?". Answering it needs care, because there are TWO citation channels in Murcia
// and they are not the same capability:
//
//   CHANNEL A — the BORM gazette citation on `sitmurcia_plu_sp`.
//               Per MUNICIPALITY, 44/45 populated, and the links RESOLVE.
//               This cites the INSTRUMENT (which plan is in force), not a PARAMETER.
//
//   CHANNEL B — article strings inside the ficha's "Documentación adicional".
//               e.g. "ART.5.14.2.1 DE LAS NORMAS", "artículo 3.7.3, apdo c)".
//               These cite MODIFICATIONS OF THE PLAN, not the article that GRANTS an
//               envelope parameter.
//
// ⭐ AND THE DECISIVE ASYMMETRY: Balears' 3-of-60 is an article cited FOR A PARAMETER,
//   because Balears' fitxa CARRIES PARAMETERS (PM 200 m² · NP 3 plantes · O 80 % · E 2.4).
//   Murcia's ficha carries NO such parameter. An article citation attached to no parameter
//   is not the same object, and reporting "Murcia cites more" would be comparing a
//   provenance rate for a thing Murcia does not publish.

import { writeOut, HERE } from './lib.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { classify } from './detect.mjs';
import { join } from 'node:path';

const REFRESH = process.argv.includes('--refresh');
const _O = { refresh: REFRESH };
const report = { step: 13, measuredAt: new Date().toISOString(), notes: [] };

// ── 13a · CHANNEL A — instrument provenance, per municipality ───────────────
console.log('\n== 13a · CHANNEL A: BORM instrument citation, per municipality ==');
const s3 = JSON.parse(readFileSync(join(HERE, 'out', '03-universes-and-currency.json'), 'utf8'));
const _s12 = JSON.parse(readFileSync(join(HERE, 'out', '12-currency-verdict.json'), 'utf8'));
const s9 = JSON.parse(readFileSync(join(HERE, 'out', '09-wfs-parameter-census.json'), 'utf8'));

const zoned = new Set(s9.perMunicipality.map((r) => r.municipio));
const rows = s3.corpus.records.map((r) => ({
  municipio: r.Municipio,
  zonedInService: zoned.has(r.Municipio),
  instrument: r.PlanTypeNameValue,
  lawAdaptedTo: r.Ley_aplicada,
  validFrom: r.validFrom,
  bormCitation: r.Enlace_BORM || null,
  hasInstrumentCitation: !!r.Enlace_BORM,
}));
const withCite = rows.filter((r) => r.hasInstrumentCitation).length;
const zonedWithCite = rows.filter((r) => r.zonedInService && r.hasInstrumentCitation).length;
const zonedCount = rows.filter((r) => r.zonedInService).length;
report.channelA = {
  what: 'BORM gazette citation of the governing instrument, on sitmurcia_plu_sp',
  granularity: 'per MUNICIPALITY',
  cites: 'WHICH PLAN IS IN FORCE — not a parameter',
  populatedOf45: withCite,
  pctOf45: +((100 * withCite) / rows.length).toFixed(2),
  populatedOfZoned33: zonedWithCite,
  pctOfZoned33: +((100 * zonedWithCite) / zonedCount).toFixed(2),
  linksResolve: 'YES — sampled 3/3 resolve HTTP 301 → live borm.es (step 5 §5f)',
};
console.log(`  ${withCite}/45 municipalities carry a BORM citation (${report.channelA.pctOf45} %)`);
console.log(`  ${zonedWithCite}/${zonedCount} of the ZONED municipalities (${report.channelA.pctOfZoned33} %)`);
console.log(`  ⚠ this cites the INSTRUMENT, not a parameter`);

// ── 13b · CHANNEL B — article strings inside harvested fichas ───────────────
console.log('\n== 13b · CHANNEL B: article strings inside the ficha ==');
const RAW = join(HERE, 'raw-fichas');
const ART = /\b(?:art[íi]?culo?s?\.?|art\.?|artº|arts?\.)\s*º?\s*\d+[\d.\-/]*/gi;
const fichas = [];
if (existsSync(RAW)) {
  for (const f of readdirSync(RAW)) {
    if (!f.endsWith('.html')) continue;
    const html = readFileSync(join(RAW, f), 'utf8');
    if (classify(html) !== 'ficha') continue; // ⛔ positive test only — see detect.mjs
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const cites = [...new Set((text.match(ART) || []).map((s) => s.trim()))];
    const addIdx = text.search(/Documentaci[oó]n adicional/i);
    fichas.push({
      file: f,
      wide: /ficha-(\d+)/.exec(f)?.[1],
      citations: cites,
      allInDocumentacionAdicional: cites.length > 0 && cites.every((c) => addIdx >= 0 && text.indexOf(c) > addIdx),
    });
  }
}
report.channelB = {
  fichasAvailable: fichas.length,
  withAnyArticleString: fichas.filter((f) => f.citations.length).length,
  allCitationsSitInDocumentacionAdicional: fichas.every((f) => !f.citations.length || f.allInDocumentacionAdicional),
  detail: fichas,
  caveat: 'n is far below the n>=100 the brief requires — see report.blocked',
};
console.log(`  fichas available: ${fichas.length}`);
for (const f of fichas) console.log(`    ${f.file}: ${f.citations.length} article strings, all in "Documentación adicional" = ${f.allInDocumentacionAdicional}`);

// ── 13c · ⭐ THE RANK — and why the comparison does not run as posed ────────
console.log('\n== 13c · the §5 rank against Balears ==');
report.rank = {
  balears: {
    fitxa: 'structured, carries REAL envelope parameters — PM 200 m² · NP 3 plantes · O 80 % · E 2.4',
    articleCitationRate: '3 of 60',
    capability: 'PARAMETERS WITHOUT PROVENANCE',
  },
  murcia: {
    ficha: 'server-generated by an Oracle stored procedure `PROCEDURE FICHA(WIde IN Number)`. Its ' +
      'FIXED label set is: Municipio · Superficie · Denominación · Nombre · Clasificación del Suelo · ' +
      'Uso global · Aprovechamiento de referencia · Otros usos · Superficie total del ámbito de ordenación · ' +
      'Superficie neta del ámbito · Aprovechamiento resultante · SSGG vinculados/adscritos · Densidad(viv/Ha) · ' +
      'Habitantes estimados por planeamiento · Nº de viviendas máximo · Viviendas estimadas · Observaciones · ' +
      'Documentación adicional.',
    envelopeParametersCarried: 'NONE. No altura, no plantas, no ocupación, no retranqueos, no fondo edificable, ' +
      'no parcela mínima. The ficha is a DEVELOPMENT-QUANTUM sheet (aprovechamiento · densidad · viviendas), ' +
      'the same class of quantity as the WFS `Edificabilidad` attribute — floor area, no shape.',
    instrumentProvenance: `${report.channelA.pctOf45} % of municipalities carry a resolving BORM citation`,
    capability: 'PROVENANCE WITHOUT PARAMETERS — the exact mirror image of Balears',
  },
  verdict:
    'THE POSED COMPARISON DOES NOT RUN. It asks whether Murcia cites an article FOR A PARAMETER more ' +
    'often than Balears\' 3/60. Murcia publishes NO envelope parameter in the ficha, so there is nothing ' +
    'for an article to be cited FOR. Murcia is not "ahead of Balears" and not "matching Balears" — it is ' +
    'on the OTHER AXIS. Balears = parameters without provenance. Murcia = provenance without parameters.',
  consequenceForRank:
    'Murcia is NOT the strongest P in Spain. On the parameter axis that decides whether an envelope DRAWS, ' +
    'Balears strictly dominates Murcia: Balears publishes PM/NP/O/E and Murcia publishes none of them. ' +
    'Murcia\'s advantage is provenance and CURRENCY EVIDENCE, which is a different and lesser lever for ' +
    'this product because provenance cannot draw a solid.',
};
console.log(`  ⭐ ${report.rank.verdict}`);
console.log(`  ⭐ ${report.rank.consequenceForRank}`);

// ── 13d · what the ficha DOES add, stated positively ───────────────────────
console.log('\n== 13d · what the ficha DOES add ==');
report.whatTheFichaAdds = {
  addsOverWFS: [
    'Nombre — the ámbito\'s proper name (the WFS carries only the code in `Ambito`)',
    'Aprovechamiento de referencia / resultante — the aprovechamiento pair, distinct from `Edificabilidad`',
    'Superficie total vs Superficie NETA del ámbito — the gross/net split the WFS does not publish',
    'Densidad (viv/Ha) · Habitantes estimados · Nº de viviendas máximo — a DWELLING-COUNT ceiling',
    'SSGG vinculados/adscritos — which general systems are charged to the ámbito',
    'Documentación adicional — the list of plan modifications affecting the ámbito, with article strings',
  ],
  doesNotAdd: ['altura', 'plantas', 'ocupación', 'retranqueos', 'fondo edificable', 'parcela mínima'],
  drawabilityConsequence:
    'A dwelling-count ceiling and an aprovechamiento are BOTH quanta. Neither is a footprint rule and ' +
    'neither is a height. Per §4 the ficha therefore moves NOTHING from not-drawable to partial-drawable. ' +
    'Tier (b) adds 0 pp of DRAWABLE coverage over tier (a) — on the schema-level evidence available.',
};
report.whatTheFichaAdds.addsOverWFS.forEach((x) => console.log(`   + ${x}`));
console.log(`   ⛔ does NOT add: ${report.whatTheFichaAdds.doesNotAdd.join(', ')}`);
console.log(`   ⭐ ${report.whatTheFichaAdds.drawabilityConsequence}`);

writeOut('13-provenance-and-rank.json', report);
console.log('\nSTEP 13 done.');
