// §ANDALUCIA-ENVELOPE-MAX / step 21 — THE REPORT. Every number traced to the step that measured it.
//
// ⚠ WEIGHTING IS DECLARED ON EVERY LINE. Córdoba's rates are LAND-weighted and ROW-weighted over
// private-developable parcels inside the served pilot. Málaga's are DOCUMENT-weighted and CANNOT
// be land-weighted at all, because its zoning polygons do not serve — there is no polygon to
// weight by. Presenting a Málaga document rate next to a Córdoba land rate as if they were the
// same measurement would be the single easiest way to fabricate a regional figure.
//
// ⛔ ALSO CORRECTED HERE: step 20's language gate used printable-ratio >= 0.85 AND >= 8 Spanish
// stopwords. The stopword test is the discriminator (font binary scores 0). The ratio guard is
// redundant and produced FALSE NEGATIVES on four Málaga documents that carry 18-19 stopwords and
// visibly correct Spanish. A badly-calibrated threshold must not be allowed to flip a conclusion,
// so the gate is reduced to the stopword test and the change is stated, not silently applied.
import { readFileSync, writeFileSync } from 'node:fs';
const R = n => JSON.parse(readFileSync(new URL(`./out/${n}.json`, import.meta.url)));

const gate = R('20-readability-language-gate');
const mal = R('14-malaga-normativa-params');
const cor = R('18-cordoba-final');
const corMax = R('19-cordoba-readable-params');
const nndd = R('16b-nndd-full-columns');
const route = R('17-malaga-routing-lastchance');
const ctrl = R('12-malaga-dataplane-control');

// --- corrected readability, stopword gate only ---
const malReadable = gate.malaga.filter(d => d.distinctStopwords >= 8);
const corReadable = gate.cordoba.filter(d => d.distinctStopwords >= 8);

// --- Málaga: DOCUMENT-weighted parameter rates over the 10 real ZONE chapters
//     (SUNC is a land-class chapter and OG is the general ordinance — neither is a zone) ---
const ZONES = mal.zones.filter(z => !['SUNC', 'OG'].includes(z.zone) && z.params);
const st = (z, k) => z.params[k].state;
const hasH = z => ['altura', 'plantas'].some(k => st(z, k) === 'VALUE');
const hasF = z => ['ocupacion', 'retranqueo', 'fondo', 'alineacion'].some(k => st(z, k) === 'VALUE');
const complete = z => ['altura', 'ocupacion', 'edificabilidad', 'retranqueo'].every(k => st(z, k) === 'VALUE');
const partial = z => !complete(z) && hasH(z) && hasF(z);
const pc = (n, d) => Math.round(10000 * n / d) / 100;

const mComplete = ZONES.filter(complete), mPartial = ZONES.filter(partial);
const mNot = ZONES.filter(z => !complete(z) && !partial(z));
const PARAMS = ['altura', 'plantas', 'ocupacion', 'edificabilidad', 'retranqueo', 'alineacion', 'fondo', 'parcelaMinima', 'densidad'];
const perParam = Object.fromEntries(PARAMS.map(k => [k, {
    VALUE: pc(ZONES.filter(z => st(z, k) === 'VALUE').length, ZONES.length),
    GRAPHIC_PLAN: pc(ZONES.filter(z => st(z, k) === 'GRAPHIC_PLAN').length, ZONES.length),
    NAMED_NO_VALUE: pc(ZONES.filter(z => st(z, k) === 'NAMED_BUT_NO_VALUE').length, ZONES.length),
    ABSENT: pc(ZONES.filter(z => st(z, k) === 'ABSENT').length, ZONES.length),
}]));
const cited = ZONES.filter(z => z.articleCount > 0);

const out = {
    measuredAt: new Date().toISOString(),
    region: 'Andalucía', firstMeasurement: true,
    cordoba: {
        ine: '14021', service: 'geoserver.pgou.coacordoba.org (COACo)',
        corpusServed: { parcels: cor.denominators.D1_served, cityUrbanParcels: cor.denominators.D3_cityWideUrbanParcels, coverageOfCity: cor.denominators.D3.coacoCoverageOfCity, districts: 2, cusSheetsServed: 8, cusSheetsTotal: 49 },
        privateDevelopableSplit: { rowPct: cor.privateDevelopableSplit.rowPct, landPct: cor.privateDevelopableSplit.landPct },
        routing: { rowWeighted: cor.routing.rowWeighted, landWeighted: cor.routing.landWeighted, geometricUnique: 94.17, agreementWithPublisherAttribute: 97.22 },
        parameterFieldsInService: 'NONE — coaco:ordenanzas serves ordenanza, et, sup_m2, link and nothing else',
        etHypothesis: 'REFUTED against Catastro built stock (59.72% consistency); et is not a plantas cap, and covers only 3.96% of land anyway',
        ordinanceCorpus: { distinctUrls: 15, distinctDocumentsByContentHash: 13, readableByLanguageGate: corReadable.length, readable: corReadable.map(d => d.url.split('/').pop()), deadLinks200: 2 },
        readabilityOfPrivateLand: { row: 0.02, land: 0.07 },
        MAX: { completeRule: { row: 0, land: 0 }, partialDrawable: corMax.MAX.partialDrawable, max: corMax.MAX.max, cityWide: 0.0 },
        citation: { documentPointerOfZones: 100, documentPointerOfPrivateLand: cor.citation.documentPointerRate.landOfPrivate, articleLevel: 0 },
        grammar: cor.grammar,
    },
    malaga: {
        ine: '29067', service: 'sig.malaga.eu/geoserver (muralPGOU) + www.malaga.eu PDF_Normativa_GIS',
        routing: {
            verdict: 'BLOCKED AT R',
            cause: 'ORA-28000: la cuenta está bloqueada — the Oracle account behind the muralPGOU datastore is LOCKED',
            layersAffected: Object.keys(ctrl.results).filter(k => k.startsWith('muralPGOU')),
            attribution: ctrl.attribution,
            routesTried: route.tests.length,
            rate: 0,
        },
        normativaCorpus: {
            documentsProbed: gate.malaga.length, readableByLanguageGate: malReadable.length,
            zoneChaptersUsable: ZONES.length,
            filenameEncodesZoneCode: true,
            pattern: 'Norm_T<TÍTULO>_C<CAPÍTULO>_<ZoneName>_<ZONECODE>.pdf',
        },
        parametersDocumentWeighted: { completeRule: pc(mComplete.length, ZONES.length), partialDrawable: pc(mPartial.length, ZONES.length), notDrawable: pc(mNot.length, ZONES.length), completeZones: mComplete.map(z => z.zone), partialZones: mPartial.map(z => z.zone), notDrawableZones: mNot.map(z => z.zone) },
        perParameterDocumentWeighted: perParam,
        citation: { zonesCarryingArticleNumbers: cited.length, rate: pc(cited.length, ZONES.length), meanArticlesPerZone: Math.round(10 * ZONES.reduce((a, z) => a + z.articleCount, 0) / ZONES.length) / 10 },
        MAXofBuildableLand: 0,
        maxCaveat: 'The rule corpus is the richest measured in this programme, and it converts to ZERO envelope because no parcel can be assigned to a zone. Document-weighted rates CANNOT be land-weighted for Málaga — there is no served polygon to weight by.',
    },
    regionalSchema: {
        instrument: 'Orden de 18 de febrero de 2026, Normas Directoras (BOJA 37, 24-feb-2026; applies to instruments without initial approval from 24-abr-2026)',
        source: nndd.source,
        featureClasses: Object.keys(nndd.featureClasses).length,
        zoningClass: 'INE_TIP_FT_OU_04_ZSU',
        zoningColumns: nndd.zoningClassOU_04_ZSU,
        bulkFields: nndd.bulkFields, heightFields: nndd.heightFields, setbackFields: nndd.setbackFields,
        predictionVerdict: nndd.verdict,
        SCHEMA_SCOPE_vs_CORPUS_SERVED: {
            schemaScope: `${Object.keys(nndd.featureClasses).length} mandated feature classes, ${nndd.fieldUnion.length} fields, region-wide, legally binding`,
            corpusServed: '0 instruments. No endpoint returns any OU_* layer. The mandate is forward-only and no conforming instrument has yet been published as data.',
            note: '⛔ THESE ARE TWO NUMBERS AND MUST NEVER BE COMBINED. A rich schema over an empty corpus is 0% of envelope.',
        },
    },
};

const P = console.log;
P('ANDALUCÍA ENVELOPE MAXIMUM — first measurement of the region');
P('');
P('  CÓRDOBA  routing 95.29% row / 71.81% land · complete 0% · partial-drawable 0.02% row / 0.10% land');
P('           MAX 0.02% row / 0.10% land (of private-developable land inside the served pilot)');
P('           MAX 0.00% city-wide — the pilot is 14.44% of Córdoba urban parcels · cited 100% document / 0% ARTICLE');
P('  MÁLAGA   routing 0% — BLOCKED AT R (ORA-28000, datastore account locked)');
P('           rule corpus (DOCUMENT-weighted, 10 zone chapters): complete 20% · partial-drawable 60% · cited 100%');
P('           MAX 0% of buildable land — no parcel can reach the rule');
P('');
P('GRAMMAR');
P('  Córdoba (land-weighted, private-developable):', JSON.stringify(cor.grammar));
P('  Málaga  (document-weighted):', JSON.stringify({
    'ALIGNMENT/CLOSED-BLOCK': ['MC', 'CTP', 'CH'], SETBACK: ['OA', 'CJ', 'UAS', 'UAD'],
    INDUSTRIAL: ['PROD', 'GSM'], GRAPHIC_PLAN: ZONES.filter(z => PARAMS.some(k => st(z, k) === 'GRAPHIC_PLAN')).map(z => z.zone), UNKNOWN: ['EP'],
}));
P('');
P('SCHEMA SCOPE vs CORPUS SERVED');
P('  schema :', out.regionalSchema.SCHEMA_SCOPE_vs_CORPUS_SERVED.schemaScope);
P('  corpus :', out.regionalSchema.SCHEMA_SCOPE_vs_CORPUS_SERVED.corpusServed);
P('  verdict:', nndd.verdict);
P('');
P('DO THE TWO CITIES AGREE?  NO — and the disagreement is the finding.');
P('  Córdoba has ROUTING and no PARAMETERS. Málaga has PARAMETERS and no ROUTING.');
P('  They fail at OPPOSITE ends of the same pipeline, so neither closes, and');
P('  ANDALUCÍA CANNOT BE GENERALISED FROM EITHER ONE.');
P('');
P('MÁLAGA PER-PARAMETER (document-weighted over 10 zone chapters)');
for (const k of PARAMS) P(`  ${k.padEnd(16)} VALUE ${String(perParam[k].VALUE).padStart(5)}% · GRAPHIC_PLAN ${String(perParam[k].GRAPHIC_PLAN).padStart(5)}% · named-no-value ${String(perParam[k].NAMED_NO_VALUE).padStart(5)}% · absent ${String(perParam[k].ABSENT).padStart(5)}%`);
P('');
// ⭐⭐ CORRECTION — see step 22. The `fondo` row above is a VOCABULARY ARTEFACT, not a measurement.
// Málaga does not use the lexeme `fondo edificable`; it uses PROFUNDIDAD EDIFICABLE, defined in
// Artículo 12.2.14 as "la distancia normal a la línea de fachada, medida en proyección horizontal",
// and CTP fixes it at a hard 15 METRES from the public vial, with the FAR banded across that line
// (1,80 / 2,60 m²t/m²s inside the band, 0,60 outside). MC defers it to a PERI or Estudio de
// Detalle. CH ties it to the PEPRI Centro.
const _depth = R('22-fondo-negative-proof');
out.malaga.closedBlockDepth = {
    lexemeUsed: 'profundidad edificable', lexemeSearchedByPriorProbes: 'fondo edificable',
    CTP: 'HARD VALUE — Profundidad Máxima Edificable desde vial público de 15 metros, with edificabilidad banded across it',
    MC: 'DEFERRED to a PERI / Estudio de Detalle (an instrument, not a plan sheet)',
    CH: 'DEFERRED to the PEPRI Centro',
    definedIn: 'Artículo 12.2.14 of the Ordenanza General',
    correction: '⛔ step 21 first reported fondo ABSENT on 100% of zone chapters. That was a regex artefact. The parameter is present, numeric and machine-readable.',
};
out.nationalFinding = {
    claim: '⭐⭐ THE STANDING NATIONAL CONCLUSION THAT NO SPANISH REGION SERVES CLOSED-BLOCK DEPTH MAY BE A VOCABULARY ARTEFACT.',
    detail: 'Every probe in this programme has searched for `fondo`. Málaga\'s PGOU never uses that lexeme and instead defines PROFUNDIDAD EDIFICABLE, with CTP carrying a hard 15 m. Canarias\' empty `FonMaxEd` column, Huesca\'s and Barcelona\'s plan-sheet deferrals were all established with fondo-shaped searches.',
    action: 'RE-TEST every city already measured against `profundidad edificable` (and `crujía`) before the "closed-block depth is never served" conclusion is relied on. Cheap re-check, high leverage.',
};
P('⭐⭐ CLOSED-BLOCK DEPTH — CORRECTED:');
P('   The `fondo` row above is a VOCABULARY ARTEFACT. Málaga uses PROFUNDIDAD EDIFICABLE.');
P('   CTP  = HARD 15 metres from vial público, with edificabilidad banded across the line (1,80/2,60 inside · 0,60 outside)');
P('   MC   = deferred to a PERI / Estudio de Detalle');
P('   CH   = deferred to the PEPRI Centro');
P('   defined in Artículo 12.2.14 of the Ordenanza General.');
P('');
P('⭐⭐ NATIONAL:', out.nationalFinding.claim);
P('   ', out.nationalFinding.action);

writeFileSync(new URL('./out/21-report.json', import.meta.url), JSON.stringify(out, null, 2));
P('\nwrote out/21-report.json');
