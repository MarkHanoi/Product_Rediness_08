// GRADE the sampled refusals. Every rule below is traceable to a VERBATIM article read from the
// committed corpus PDF (Madrid / Barcelona / Murcia) or, where no corpus exists in repo
// (València / Córdoba), to the live service attribute plus the measurement record's own quotation —
// which is WEAKER EVIDENCE and is labelled `evidence: 'weak'` on every such row.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./refusal-audit.raw.json', import.meta.url), 'utf8'));

const C = (why, ev = 'corpus') => ({ verdict: 'correct', why, evidence: ev });
const X = (why, ev = 'corpus') => ({ verdict: 'incorrect', why, evidence: ev });
const U = (why) => ({ verdict: 'unverifiable', why, evidence: 'none' });

// ── BARCELONA ────────────────────────────────────────────────────────────────
// Art. 306 read verbatim, PGM-NNUU-metropolitana.pdf: its ENTIRE body is «condicions d'ús»
// (1r Habitatge … 9è Industrial) plus §2 on uses under prior planning and §3 on Art. 304. It states
// nothing about the buildable volume. The zone-18 envelope article is Art. 334 «Ordenació del volum
// edificable» (Secció 5a, Arts. 333-336), whose §1.b reads «La superfície de sostre edificable ha de
// ser la que resulti de l'ordenació volumètrica establerta» and whose §3.a reads «L'edificabilitat de
// la zona ha de ser establerta pel pla especial». THAT article delegates; Art. 306 does not.
const bcnGrade = (s) => {
    if (s.zone === '18') {
        return X('Art. 306 is the USES article for clau 18 — its whole body is «condicions d\'ús». '
            + 'It states no envelope and delegates none. The article that terminates this parcel is '
            + 'Art. 334.1.b / 334.3.a (Secció 5a, Arts. 333-336). REFUSAL OUTCOME IS CORRECT; THE CITATION IS NOT.');
    }
    if (s.zone === '22a') {
        return X('Two independent grounds. (a) The SHIPPED code marks clau 22a `regime-undetermined` '
            + 'with `legallyGrounded: FALSE` (esBarcelonaZoneClassification.ts:798) — the product\'s own '
            + 'answer is that this is PRYZM\'s gap, not a legal refusal, so scoring it `not-determined` '
            + 'contradicts the code. (b) Art. 350.1 governs ONLY «la zona industrial que compti amb Pla '
            + 'Parcial definitivament aprovat»; Art. 350.2 opens «Per a la zona industrial que estigui '
            + 'mancada de Pla Parcial regiran les condicions següents» and then STATES a full direct '
            + 'ordinance (FAR 2 m²st/m²s, ocupació 90 %/70 %, the 350.2.b block band, the 350.2.c/e '
            + 'heights) which PRYZM has already implemented. On no-Pla-Parcial land Art. 350.1 does not govern.');
    }
    if (s.zone === '12b') {
        return C('Art. 320.2a verbatim, subzona II: «la profunditat edificable serà, com a màxim, la de '
            + 'les edificacions contigües existents, MENTRE ES REDACTI LA DETERMINACIÓ EN PARTICULAR I EN '
            + 'DETALL AL PLA ESPECIAL». An express delegation to a pla especial, and Art. 320.3a keys the '
            + 'height to the mean of existing buildings on an undefined tram de vial. Cited articles govern and refuse. '
            + 'Shipped code agrees: `derived-plan`, `legallyGrounded: true`.');
    }
    if (['15', '16', '17/5', '17/6', '17/7', '14a', '14b', '8a'].includes(s.zone)) {
        return U('The `tail` slice is cited only as "derived plan / verd privat protegit" — no article '
            + 'number is named in the measurement record for clau 15, so there is no citation to test. '
            + 'A refusal with no article is not a cited refusal; it cannot be graded correct.');
    }
    return U('unmapped clau');
};

// ── MADRID ───────────────────────────────────────────────────────────────────
// Art. 8.3.1 confirmed VERBATIM in the committed PDF (printed p. 395): «se ha agotado el
// aprovechamiento urbanístico» … «sin imponer un nuevo modelo». It is «Definición general» — it
// states no envelope AND delegates none; it describes the zone.
// Art. 8.3.2 confirmed: TWO grados. Grado 1º → Sección Primera (Art. 8.3.5). Grado 2º → Sección
// Segunda (Art. 8.3.10), whose (c) reads «Obras de nueva edificación: Se regulan por las condiciones
// específicas del planeamiento inmediatamente anterior al presente Plan General». THAT is the
// grado-2 delegation, and it is neither 8.3.1 nor 8.3.5.
const madGrade = (s) => {
    if (/^3\.2/.test(s.zone)) {
        return X('This parcel is Norma Zonal 3 GRADO 2º (`AMB_TX_ETIQ = "3.2"`, separately published '
            + 'by the live NORMAS_ZONALES layer). Art. 8.3.1 is «Definición general» and states no '
            + 'operative regime. Art. 8.3.5 — the article the record weighs it against — sits expressly '
            + 'under «Sección Primera: Condiciones de edificación del Grado 1º» and does not reach this '
            + 'land at all. The governing article is Art. 8.3.10.c) (Sección Segunda, Grado 2º). '
            + 'REFUSAL OUTCOME CORRECT (8.3.10.c) delegates to the antecedent planning); CITATION WRONG.');
    }
    return C('Norma Zonal 3 Grado 1º. Art. 8.3.1 verbatim-confirmed in the committed PDF and it does '
        + 'describe an exhausted-aprovechamiento zone, but the OPERATIVE article is Art. 8.3.5 '
        + '(Sección Primera), whose substitution route measures the envelope by «la envolvente exterior '
        + 'del edificio existente … y respetará la superficie total edificada del mismo» — a datum PRYZM '
        + 'measured as unobtainable (PG_ANALISIS_EDIFICACION carries no attributes). The refusal is '
        + 'CORRECT in outcome and correct in kind, and 8.3.1 is a defensible if imprecise anchor for it. '
        + 'GRADED CORRECT — but see the two named defects in the record\'s supporting argument (§3).');
};

// ── MURCIA ───────────────────────────────────────────────────────────────────
// classify.mjs `delegationGround` was IMPORTED, not re-implemented; its GROUND_ARTICLE map is what
// is graded. Article scopes read verbatim from the committed vol. 11 PDF.
const murGrade = (s) => {
    const { ground, sector, family, claseSuelo } = s.attrs;
    const prefix = (String(sector).match(/^[A-Z]+/) ?? [''])[0];
    if (ground === 'calificacion-generica') {
        // Art. 5.25.3.3 is scoped to «las fichas de los Estudios de Detalle» (UD ámbitos);
        // Art. 5.26.3.3 to «las fichas de los Planes Especiales»; Arts. 6.2.2.4 / 6.5.1 to SUELO
        // URBANIZABLE SECTORIZADO. A genérica code outside all four scopes is refused on no cited basis.
        const inScope = prefix === 'UD' || prefix === 'UE' || /^P[A-Z]*$/.test(prefix)
            || /urbanizable/i.test(String(claseSuelo ?? ''));
        return inScope
            ? C(`Genérica code ${family} inside a scope one of the cited articles actually reaches `
                + `(sector ${sector}, clase ${claseSuelo}). Art. 5.25.3.3 / 5.26.3.3 verbatim: «se reduce a `
                + `las condiciones de uso y tipología de las edificaciones, PERO NO A LOS PARÁMETROS `
                + `DEFINITORIOS DE LA ALTURA O EDIFICABILIDAD».`)
            : X(`Genérica code ${family} on sector ${sector} (clase ${claseSuelo}). NONE of the four cited `
                + `articles' stated scopes reaches this parcel: Art. 5.25.3.3 is scoped to «las fichas de los `
                + `Estudios de Detalle» (UD), Art. 5.26.3.3 to «las fichas de los Planes Especiales» (P*), `
                + `and Arts. 6.2.2.4 / 6.5.1 to suelo urbanizable sectorizado. This parcel is none of them.`);
    }
    if (ground === 'calificacion-remitida') {
        // Art. 5.24.5.1 verbatim opens «Dentro de los ámbitos UA, UH y UM…». Art. 5.24.6 covers TR/IR/GR.
        const inScope = ['UA', 'UH', 'UM'].includes(prefix) || ['TR', 'IR', 'GR'].includes(family);
        return inScope
            ? C(`Art. 5.24.5.1 verbatim: «Dentro de los ámbitos UA, UH y UM, los suelos … se califican `
                + `genéricamente … con el código RR, entendiéndose que sus condiciones de edificación son `
                + `enteramente concordantes con las definidas en los anteriores instrumentos convalidados.» `
                + `Sector ${sector} is in scope. Governs and refuses.`)
            : X(`Family ${family} on sector ${sector}. Art. 5.24.5.1's stated scope is «Dentro de los ámbitos `
                + `UA, UH y UM» — sector prefix ${prefix} is not one of them, and Art. 5.24.6 covers only `
                + `TR/IR/GR. The cited article does not reach this parcel.`);
    }
    if (ground === 'clase-urbanizable') {
        // Art. 6.2.2 is titled, in the PDF's own TOC and body, «Ordenación de los SECTORES RESIDENCIALES».
        const residential = /^R/.test(family);
        return residential
            ? C(`Art. 6.2.2.3 verbatim: «Los planes parciales o especiales desarrollarán la ordenación de `
                + `acuerdo con las determinaciones vinculantes asignadas a su sector en la ficha `
                + `correspondiente al mismo.» Residential family ${family} on ${claseSuelo} land — in scope.`)
            : X(`Family ${family} is INDUSTRIAL/TERCIARIO, but the sole cited article for the `
                + `clase-urbanizable ground is Art. 6.2.2.3, whose article heading in the committed PDF is `
                + `«Ordenación de los SECTORES RESIDENCIALES». Industrial/terciario urbanizable sectors are `
                + `Arts. 6.5.x / 6.6.x, which are not cited. Outcome right, citation out of scope.`);
    }
    if (ground === 'ambito-delegante') {
        return C(`Sector ${sector} carries a delegating prefix (${prefix}). Arts. 5.24 (UA/UH/UM) · `
            + `5.25.1 (UE) · 5.25.2 (UD) · 5.26.2 (P*) · 6.6.2 (TA/TM) are cited as a set and one of them `
            + `reaches this ámbito. Governs and refuses.`);
    }
    return U('no ground');
};

// ── VALÈNCIA (weak evidence — no in-repo corpus) ─────────────────────────────
const vlcGrade = (s) => {
    const o = String(s.attrs.origen ?? '');
    if (/^MP/i.test(o)) {
        return X(`\`origen = ${o}\` is a MODIFICACIÓN PUNTUAL of the PGOU itself. A modificación puntual `
            + `AMENDS the general plan; it is not a derived instrument the plan DELEGATES to. So this land `
            + `is still PGOU-ordered — the correct classification is a document-acquisition gap (\`no-pack\`), `
            + `not a cited legal delegation (\`not-determined\`). The city record already treats MP as a `
            + `SUPERSESSION problem under LEGISLATION («169 distinct instruments … 6.19 % of buildable land») `
            + `while counting the same land as a delegation here. The two treatments contradict.`, 'weak');
    }
    return C(`\`origen = ${o}\` names a genuine derived instrument (PE Plan Especial · PP Plan Parcial · `
        + `ED Estudio de Detalle · PRI/RI Plan de Reforma Interior). The plan expressly delegates this land, `
        + `so the refusal is a correct determination ABOUT THE LAND. ⚠ It is NOT what the product ships — `
        + `see the shipped-behaviour flag.`, 'weak');
};

// ── CÓRDOBA (weak evidence — no in-repo corpus) ──────────────────────────────
const corGrade = (s) => {
    const a = s.attrs.joinedActuacion ?? null;
    const instr = String(a?.instrumento ?? '');
    if (/plan parcial|plan especial|peri|estudio de detalle|reforma interior/i.test(instr)) {
        return C(`The point falls inside published \`coaco:actuaciones\` polygon «${a.actuacion}», `
            + `\`instrumento = "${instr}"\`, \`clase_suelo = "${a.clase_suelo}"\`, tramitado=${a.tramitado}. `
            + `A named, published derived instrument governs this land, so the delegation refusal is a `
            + `correct determination.`, 'weak');
    }
    // ⚠ THIS PROBE'S OWN DEFECT, REPORTED NOT HIDDEN (PROBE-DISCIPLINE: the probe is part of the
    // system). The draw captured three points whose `ordenanza` is «Colonia Tradicional Popular»
    // (the 17.201 % family, PGOU-DIRECT, NOT a cited refusal) because the publisher serves them the
    // SAME document link `O_CTP1.pdf` as «CTP1-Campo de la Verdad» (the 1.307 % refusal family).
    // The link field does NOT disambiguate the two. Those samples are outside the refusal population
    // and are graded UNVERIFIABLE, never correct.
    if (/^Colonia Tradicional Popular$/i.test(String(s.zone).trim())) {
        return U(`OUT OF POPULATION — this probe mis-captured it. \`ordenanza = "Colonia Tradicional `
            + `Popular"\` is the 17.201 % PGOU-DIRECT family, not «CTP1-Campo de la Verdad» (1.307 %). `
            + `The classifier matched on the shared publisher link \`O_CTP1.pdf\`, which COACo serves for `
            + `BOTH ordenanzas — a real finding in its own right: the routing key the Campo-de-la-Verdad `
            + `refusal binds on cannot distinguish the two families.`);
    }
    if (/protegid|comercial|campo de la verdad/i.test(String(s.zone))) {
        return C(`Ordenanza «${s.zone}» is one of the three families the PGOU-2001 grounds a refusal on `
            + `(Art. 13.4.1 Campo de la Verdad → Tomo VI · Art. 13.3 Elemento protegido · Art. 13.12.2 Uso `
            + `Comercial). ⚠ WEAK: Córdoba has no in-repo corpus, so the article text could not be re-read.`, 'weak');
    }
    return U(`No delegating instrument and no grounded family: instrumento="${instr}".`);
};

const GRADERS = { barcelona: bcnGrade, madrid: madGrade, murcia: murGrade, valencia: vlcGrade, cordoba: corGrade };

const out = {
    _what: 'REFUSAL AUDIT — per-sample verdicts. correct/incorrect/unverifiable kept strictly apart.',
    _method: 'Seeded uniform-over-area draw + live municipal zoning service + article re-read from the committed corpus PDF where one exists.',
    seedBase: 20260802,
    ranAt: new Date().toISOString(),
    cities: {},
};
for (const [city, r] of Object.entries(raw)) {
    const g = GRADERS[city];
    const samples = r.samples.map((s) => ({ ...s, ...g(s) }));
    const tally = { correct: 0, incorrect: 0, unverifiable: 0 };
    for (const s of samples) tally[s.verdict]++;
    out.cities[city] = {
        seed: r.seed, bbox: r.bbox, draws: r.draws,
        sampleSize: samples.length, ...tally,
        upstreamFailures: r.failures.length,
        rejectedDraws: r.skipped.length,
        samples,
        rejectionReasons: r.skipped.reduce((a, x) => { const k = x.reason.split(':')[0]; a[k] = (a[k] || 0) + 1; return a; }, {}),
    };
}
writeFileSync(new URL('./refusal-audit.result.json', import.meta.url), JSON.stringify(out, null, 2));
for (const [c, v] of Object.entries(out.cities)) {
    console.log(`${c.padEnd(10)} n=${String(v.sampleSize).padStart(2)}  correct=${String(v.correct).padStart(2)}  incorrect=${String(v.incorrect).padStart(2)}  unverifiable=${String(v.unverifiable).padStart(2)}  upstreamFailures=${v.upstreamFailures}  draws=${v.draws}`);
}
