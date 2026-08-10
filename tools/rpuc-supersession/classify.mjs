// §RPUC-SUPERSESSION (L-676) — the committed, re-runnable enumerator + classifier that reduces
// Barcelona CLOSURE-REGISTER row 9 ("Supersession audit unexhausted") from *"147 candidates, 0
// opened"* to a NAMED, JUSTIFIED READING LIST.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Were PGM-1976 Arts. **239 · 320 · 327 · 328** amended after the 2 March 2007 MPGM (DOGC 4893)?
// Those four articles carry PRYZM's shipped Barcelona numbers: 239 (alçada reguladora under
// *ordenació segons alineació de vial*), 320 (clau 12, nucli antic), 327/328 (clau 13b, interior
// d'illa). L-660 recorded the answer as `NOT_VERIFIED / not_found` and walked the chain
// **1 755 → 773 → 147 → 9 flagged by title → 0 opened**. Every Barcelona citation carries an
// asterisk until that is discharged.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS TOOL DOES, AND — MORE IMPORTANTLY — WHAT IT REFUSES TO DO
// ─────────────────────────────────────────────────────────────────────────────────────────────
// It reproduces the funnel mechanically from the LIVE RPUC register (so the 147 is a re-derivable
// query, not a number in a document), then applies **two ORTHOGONAL screens** and reports the
// UNION of what survives either. It does **not** conclude "no amendment exists".
//
//   SCREEN 1 — INSTRUMENT SCOPE. A PGM modification is either **general-normative** (it edits the
//     *Normes urbanístiques*, i.e. the articulat, and applies city-wide) or **site-specific** (it
//     re-ordains a delimited àmbit). Only the first can amend an article's TEXT. The discriminator
//     is not a guess: Catalan planning practice titles the first
//     *«Modificació de les **Normes urbanístiques** del Pla general metropolità…»* and the second
//     *«Modificació … **a l'àmbit / al carrer / en els entorns de** …»*. Both are matched, and
//     anything matching NEITHER is `AMBIGUOUS` and joins the reading list — the screen fails OPEN.
//
//   SCREEN 2 — SUBJECT MATTER. Independently of scope, does the title name the subject matter of
//     239/320/327/328 (*alçada / alçària reguladora*, *profunditat edificable*, *interior d'illa*,
//     *nucli antic*, *ordenació segons alineació de vial*, *normes urbanístiques*)? A site-specific
//     instrument cannot rewrite an article, but it CAN disapply it inside its own àmbit — which
//     would make PRYZM's general number wrong *for parcels in that àmbit*, since PRYZM routes on the
//     MUC's clau and would never see the local override. So a subject hit lands on the reading list
//     **whatever its scope**.
//
// ⚠⚠ **A TITLE SCREEN IS NOT A TEXT CHECK, AND THIS TOOL SAYS SO IN ITS OWN OUTPUT.** It converts
// "147 unread" into "N must be read, and here is the deterministic reason each of the other
// (147 − N) was set aside". That is a REDUCTION of the audit, not a discharge of it. The tool
// therefore prints `supersession: NOT_VERIFIED` unconditionally and will not print `NONE`; only
// reading the surviving documents can do that, and reading is a human act on a primary source
// (the L-449 pattern). §CONTEXT-DATA-HONESTY: an unread instrument is UNKNOWN, never "clean".
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// SOURCE — live, and deliberately not cached into a fixture
// ─────────────────────────────────────────────────────────────────────────────────────────────
// RPUC (Registre de planejament urbanístic de Catalunya), the OFFICIAL register:
//   https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/basica?municipi=08019
// ⚠ The old host `rpucportal.territori.gencat.cat` NO LONGER RESOLVES (L-660 follow-up 5).
// Freezing the listing into a fixture would be the defect this audit exists to prevent: a NEW
// instrument approved tomorrow is exactly what the audit is looking for, so the enumeration must be
// re-run, not replayed. `--offline <file>` exists only to re-classify a saved payload.
//
// Run:
//   node tools/rpuc-supersession/classify.mjs                 # live fetch + classify
//   node tools/rpuc-supersession/classify.mjs --json
//   node tools/rpuc-supersession/classify.mjs --offline scratchpad/_rpuc-bcn.json
//
// Authority: C58 §1.1/§1.7a · L-449 (signing is a human act) · L-660
// (`findings/L-660-DOGC-4893-ANNEX-RETRIEVED.md` — the funnel this reproduces) ·
// `corpus/RETRIEVAL-LOG.md` §6 (the retrieval recipe).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FUNNEL'S PARAMETERS — each one named, with the reason it is that value.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Barcelona's INE code. The RPUC keys municipalities on it. */
const MUNICIPI_INE = '08019';

/**
 * The cut date: the approval of the MPGM that set PRYZM's current 239/320/327/328 numbers
 * (expedient 2006/025790/B, approved 2007-03-02, DOGC 4893 of 2007-05-29). An instrument approved
 * ON OR BEFORE this date cannot supersede it, so the audit starts strictly after.
 */
const CUT_DATE = '2007-03-02';

/**
 * The instrument types capable of amending PGM NORMATIVE articles. Everything else in the register
 * (Pla especial urbanístic, Pla de millora urbana, Conveni, Pla director…) operates BELOW the
 * general plan: it develops or implements it, and cannot rewrite its articulat. Measured on the
 * live register 2026-08-01: 145 + 2 = **147**, reproducing L-660's 147 exactly.
 */
const PGM_LEVEL_INSTRUMENTS = [
    'Modificació de pla general d\'ordenació',
    'Modificació normes subsidiàries',
];

/**
 * SCREEN 1 — the general-normative marker. In Catalan practice an instrument that edits the
 * articulat says so on its face: it modifies the *Normes urbanístiques* (or the *normativa*) of the
 * plan, rather than an àmbit of it.
 */
const NORMATIVE_MARKERS = [/normes\s+urban/i, /normativa\s+del\s+pla/i, /articulat/i];

/**
 * SCREEN 1 — the site delimiter. A title carrying any of these names a PLACE, so the instrument
 * re-ordains that place. Deliberately generous: over-matching here only moves an instrument from
 * AMBIGUOUS to SITE-SPECIFIC, and Screen 2 still recovers it if the subject matter is ours.
 */
const SITE_MARKERS = [
    /\bcarrer|\bc\/|avinguda|passeig|pla[çc]a|rambla|ronda|travessera|cam[íi]\b|via\s+laietana|gran\s+via/i,
    /\b[àa]mbit\b|entorns?\s+de|sector\b|\billa\b|finca|parcel·la|parcela|solar\b/i,
    /barri\b|districte|bar[çc]a|poblenou|sant\s+|santa\s+|la\s+marina|zona\s+franca|port\b|estaci[óo]/i,
    /delimitat|situad[ae]s?\b|n[úu]m(ero)?\.?\s*\d|,\s*\d+/i,
];

/**
 * SCREEN 2 — the subject matter of Arts. 239 / 320 / 327 / 328, plus the umbrella term. A hit puts
 * the instrument on the reading list REGARDLESS of scope, because a site-specific plan can disapply
 * a general article inside its own àmbit and PRYZM would never see the override.
 */
const SUBJECT_MARKERS = [
    { re: /al[çc]a[dr]|al[çc][àa]ria|n(ombre|úmero)\s+de\s+plantes/i, article: '239 (alçada reguladora)' },
    { re: /profunditat\s+edificable/i, article: '327/328 (profunditat edificable)' },
    { re: /interior\s+d['’]?\s*illa|pati\s+d['’]?\s*illa/i, article: '327/328 (interior d\'illa)' },
    { re: /nucli\s+antic/i, article: '320 (clau 12, nucli antic)' },
    { re: /alineaci[óo]\s+de\s+vial/i, article: '239 (ordenació segons alineació de vial)' },
    { re: /normes\s+urban|normativa\s+del\s+pla|articulat/i, article: 'ANY (edits the articulat)' },
];

const RPUC_BASICA = (ine) =>
    `https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/basica`
    + `?municipi=${ine}&idioma=ca&rpp=3000&firstRecord=0&sortDirection=desc`;

/** The per-expedient document endpoint, for the reading list. `codi` is the RPUC `codiExpedient`. */
export const rpucDetallUrl = (codi) =>
    `https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/detall?codiExpedient=${codi}&idioma=ca`;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PURE CLASSIFIERS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `general-normative` (can rewrite an article) · `site-specific` · `AMBIGUOUS` (fails OPEN). */
export function classifyScope(title) {
    const t = String(title ?? '');
    if (NORMATIVE_MARKERS.some((re) => re.test(t))) return 'general-normative';
    if (SITE_MARKERS.some((re) => re.test(t))) return 'site-specific';
    return 'AMBIGUOUS';
}

/** Which of Arts. 239/320/327/328 the TITLE touches on. `[]` = no subject hit from the title. */
export function subjectHits(title) {
    const t = String(title ?? '');
    return SUBJECT_MARKERS.filter((m) => m.re.test(t)).map((m) => m.article);
}

/** The 1 755 → 773 → 147 funnel, as a pure function of the register listing. */
export function funnel(llistat) {
    const all = llistat ?? [];
    const postCut = all.filter((r) => typeof r.data === 'string' && r.data.slice(0, 10) > CUT_DATE);
    const pgmLevel = postCut.filter((r) => PGM_LEVEL_INSTRUMENTS.some((i) => String(r.instrumentca ?? '').trim() === i.trim()));
    return { all: all.length, postCut: postCut.length, candidates: pgmLevel };
}

/**
 * The reading list: an instrument survives if EITHER screen keeps it. Sorted so the strongest
 * reasons come first — a general-normative instrument with a subject hit is the top of the list.
 */
export function buildReadingList(candidates) {
    const rows = candidates.map((r) => {
        const scope = classifyScope(r.tema);
        const subjects = subjectHits(r.tema);
        return {
            codi: r.codi,
            expedient: r.nomComplet,
            date: String(r.data ?? '').slice(0, 10),
            vigencia: r.vigencia ?? null,
            instrument: r.instrumentca,
            title: r.tema,
            scope,
            subjects,
            mustRead: scope !== 'site-specific' || subjects.length > 0,
            detallUrl: rpucDetallUrl(r.codi),
        };
    });
    const rank = (x) => (x.scope === 'general-normative' ? 0 : x.scope === 'AMBIGUOUS' ? 1 : 2);
    return rows.sort((a, b) => rank(a) - rank(b) || b.subjects.length - a.subjects.length || a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────────────────────

async function loadListing(argv) {
    const i = argv.indexOf('--offline');
    if (i >= 0 && argv[i + 1]) return JSON.parse(readFileSync(argv[i + 1], 'utf8'));
    const res = await fetch(RPUC_BASICA(MUNICIPI_INE), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`RPUC basica HTTP ${res.status} — the register was not reached. This is a FETCH failure, NOT an empty result (C58 §1.7a).`);
    return res.json();
}

async function main(argv) {
    const payload = await loadListing(argv);
    const f = funnel(payload.llistat);
    const list = buildReadingList(f.candidates);
    const mustRead = list.filter((r) => r.mustRead);

    if (argv.includes('--json')) {
        console.log(JSON.stringify({
            municipi: MUNICIPI_INE, cutDate: CUT_DATE, targetArticles: ['239', '320', '327', '328'],
            funnel: { enumerated: f.all, postCut: f.postCut, pgmLevelCandidates: f.candidates.length, mustRead: mustRead.length },
            supersession: 'NOT_VERIFIED',
            supersessionNote: 'A TITLE screen, not a text check. Reading the surviving documents is the only thing that can change this value, and it is a human act on a primary source (L-449).',
            readingList: mustRead, setAside: list.filter((r) => !r.mustRead),
        }, null, 2));
        return;
    }

    console.log(`\n§RPUC-SUPERSESSION — Barcelona ${MUNICIPI_INE}, target Arts. 239 · 320 · 327 · 328, cut ${CUT_DATE}`);
    console.log(`\n  THE FUNNEL (re-derived live from the RPUC, not read from a document)`);
    console.log(`    enumerated in the register        : ${f.all}`);
    console.log(`    approved after ${CUT_DATE}         : ${f.postCut}`);
    console.log(`    PGM-LEVEL (can amend the articulat): ${f.candidates.length}   [${PGM_LEVEL_INSTRUMENTS.join(' + ')}]`);
    console.log(`    → MUST BE READ (either screen)     : ${mustRead.length}   set aside: ${list.length - mustRead.length}`);

    const byScope = new Map();
    for (const r of list) byScope.set(r.scope, (byScope.get(r.scope) ?? 0) + 1);
    console.log(`\n  SCREEN 1 — instrument scope`);
    for (const [k, v] of [...byScope].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(20)} ${v}`);

    console.log(`\n  THE READING LIST — ${mustRead.length} of ${f.candidates.length}, strongest reason first`);
    for (const r of mustRead) {
        console.log(`\n    [${r.scope}] ${r.expedient}  (${r.date}, vigència=${r.vigencia}, codi ${r.codi})`);
        if (r.subjects.length) console.log(`      subject hits: ${r.subjects.join(' · ')}`);
        console.log(`      ${String(r.title).replace(/\s+/g, ' ').slice(0, 170)}`);
        console.log(`      ${r.detallUrl}`);
    }

    console.log(`\n  ⚠ supersession: NOT_VERIFIED — and this tool will never print anything else.`);
    console.log(`    It screened TITLES. A title screen sets a reading order; it does not read.`);
    console.log(`    The ${list.length - mustRead.length} set aside are site-specific instruments with no subject hit: they`);
    console.log(`    re-ordain a delimited àmbit and cannot rewrite an article's TEXT — but any of them`);
    console.log(`    could still DISAPPLY one inside its own àmbit, which PRYZM (routing on the MUC clau)`);
    console.log(`    would not see. That residual is a KNOWN, NAMED limit of this screen, not a clean bill.\n`);
}

// ENTRYPOINT GUARD — the CLI must run ONLY when this file is invoked directly. Without it, merely
// IMPORTING the pure classifiers (as `__tests__/classify.spec.ts` does) fires a live RPUC fetch:
// a test suite that silently hits a government register on every run, and fails when it is offline.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 1; });
}
