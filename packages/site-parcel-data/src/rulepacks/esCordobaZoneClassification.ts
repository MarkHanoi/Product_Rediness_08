// Córdoba (INE 14021) — PGOU-2001 REFUSAL VOCABULARY + the VERIFICATION GATE.
//
// This is the Córdoba analogue of `esBarcelonaZoneClassification.ts`: a LEGAL classification table
// + the coverage-gap card, PLUS one thing Barcelona does not need — the machine-extraction
// VERIFICATION GATE. It produces no numbers. Its whole job is to let a Córdoba parcel return an
// HONEST, CITED refusal instead of a fabricated envelope, in three distinct situations:
//
//   1. THE VERIFICATION GATE (the one that matters most here). Every number in
//      `ES_CORDOBA_PGOU2001_PACK` is MACHINE-OCR'd and `pipeline-extracted-unverified` — no human
//      has checked it against the source. Until `sources/VERIFICATION.md` is signed, PRYZM must not
//      render ANY of those numbers, not even for a covered subzone (PAS-1…MC-4). The honest output
//      is `cordobaUnverifiedRefusal`, and `CORDOBA_ENVELOPE_VERIFIED` is the single flag that lifts
//      it. ⚠ A wrong number here is OUR pipeline's error (we OCR'd it), which is exactly why the
//      default is refusal (ProvenanceFlags.ts `pipeline-extracted-unverified`; §CONTEXT-DATA-HONESTY).
//
//   2. THE LEGALLY-GROUNDED "no" families (`cordobaZoneRefusalFor`). Some calificación families are a
//      cited "no envelope by a zone rule": their buildability is fixed by ANOTHER document PRYZM does
//      not hold. These would refuse even AFTER verification, because verifying the OCR of the packed
//      subzones says nothing about them.
//
//   3. THE COVERAGE GAP (`cordobaNoRulePackRefusal`). A privately-buildable Córdoba parcel with no
//      authored pack — the unbindable families and the ≈ one-in-ten pilot parcels that carry no
//      calificación in the join — plus the C60 §3 statement of the 2-district pilot scope.
//
// PURITY: L2-pure. Data + string builders. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — esCordobaPGOU2001.ts (WIRING-TODO), findings/ORDENANZA-PACK-SPEC.md §3/§4,
// C58 §1.2/§1.3/§1.4/§1.7a, C60 §3, ORDINANCE-EXTRACTION-PIPELINE.md §3, §CONTEXT-DATA-HONESTY.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/**
 * ⚠⚠⚠ THE HONESTY GATE. **SIGNED 2026-08-03** — see `sources/VERIFICATION.md` §SIG-1 for the
 * certification statement and evidence basis (PGOU-2001 transcription, 5 subzone families, 13/13
 * subzones OCR-verified 2026-08-01 with zero digit errors; the CTP-1/MC depth-guard concern and the
 * UAD-3 depth-band gap were both independently re-audited 2026-08-03 and confirmed already closed,
 * `6dbad1f2` and `ef0e966b` respectively). Founder/authorized-signer sign-off, per L-449 — the
 * founder issued this certification directly; it was not self-attributed by this codebase.
 *
 * While this was `false`, `applyCordobaZoningThenFallback` dispatched `cordobaUnverifiedRefusal` for
 * EVERY Córdoba parcel. Now signed, the machine-extracted numbers in `ES_CORDOBA_PGOU2001_PACK`
 * render at their declared `pipeline-extracted-unverified` confidence tier — the louder-than-
 * estimated affordance stays on every value; nothing here promotes to a higher provenance tier.
 *
 * (Typed `boolean`, not the literal `true`, so a consumer's `if (CORDOBA_ENVELOPE_VERIFIED)`
 * compute branch stays a real runtime check, not something a future edit narrows away as dead code.)
 */
export const CORDOBA_ENVELOPE_VERIFIED: boolean = true;

/** The instrument every Córdoba refusal that makes a claim about the law cites. */
export const CORDOBA_PGOU_INSTRUMENT_REF =
    'PGOU-Córdoba-2001 (Plan General de Ordenación, Texto Refundido Oct. 2002), Gerencia de ' +
    'Urbanismo, Ayuntamiento de Córdoba. Calificación source: COACo GeoServer `coaco:ordenanzas`.';

/**
 * C60 §3 — the honest one-line statement of WHAT PRYZM covers in Córdoba and its limits, kept
 * beside the copy that cites it so the two cannot drift. Names the 2-district pilot scope AND the
 * machine-extracted-unverified status, because both bound the promise.
 */
export const CORDOBA_MUNICIPAL_JURISDICTION_ID = 'es-14021-cordoba-municipal';

/**
 * §CORDOBA-MUNICIPAL-CLOSURE — WHAT COACo PUBLISHES, MEASURED LIVE 2026-08-01, WITH ITS DENOMINATOR.
 *
 * Every figure here was re-queried against the publisher on 2026-08-01 (the reproduction commands
 * are in `findings/OCR-EXTRACTION-RESULTS.md §6`) rather than carried forward:
 *   • `coaco:distritos&resultType=hits` → `numberMatched="2"` — **Sur** (2 488 983 m²) and
 *     **Noroeste** (2 472 362 m²), Σ **4 961 344 m² ≈ 4.96 km²**. Still 2, not >2.
 *   • `coaco:ordenanzas` → **453** polygons, Σ `sup_m2` **1 628 616 m²** — i.e. the calificación
 *     layer covers **32.8 %** even of the two districts it is published for; the rest is viario and
 *     land the publisher attributes to no ordenanza polygon.
 *   • `coaco:usos_globales` → **108** features, Σ **678 436 m²** (Espacios Libres 51.83 %,
 *     Residencial 30.56 %, Equipamientos 15.37 %, Industrial/Terciario 2.24 %).
 *
 * ⚠⚠ THIS PARAGRAPH USED TO SAY "A **PUBLICATION** LIMIT, NOT A PRYZM ONE … nothing PRYZM can build
 * extends it", AND THAT WAS REFUTED BY EVIDENCE THE REPO ALREADY HELD. The Gerencia Municipal de
 * Urbanismo — the AUTHORITY, of which COACo is only a downstream vectoriser — publishes the
 * PGOU-2001 *Calificación, Usos y Sistemas* series MUNICIPALITY-WIDE as 77 georeferenceable raster
 * sheets (49 urban `CUS01W…CUS49W` + 28 peripheral). Re-verified live 2026-08-01:
 * `visor.pgou.coacordoba.org/doc/planos/cus/CUS41W.jpg` → HTTP 200, `image/jpeg`, 461 957 B; and
 * `coaco:hojas_cus` returns exactly **8** features — the sheets COACo vectorised, i.e. the pilot.
 * So the gap is a **raster→vector acquisition**, an in-house engineering task on already-published
 * public data (CLOSURE-REGISTER blocker 22), NOT an absence of published zoning and NOT a hole in
 * the law. "Nobody publishes it" and "nobody has vectorised it" are as different as failure and
 * empty (§CONTEXT-DATA-HONESTY), and the same discipline applies to our own prose.
 *
 * What is TRUE and unchanged: outside the pilot no MACHINE-READABLE calificación exists, so the
 * honest answer today is a refusal — a terminal, evidence-backed state. The exported string below
 * already says this correctly; only this comment was stale.
 */
export const CORDOBA_MUNICIPAL_ROADMAP_LINE =
    'Córdoba (INE 14021) coverage today: PRYZM publishes NO buildable figure anywhere in Córdoba, ' +
    'and outside the SUR and NOROESTE districts it cannot even name the ordenanza that governs a ' +
    'parcel. That is not a shortcut we took — the Colegio de Arquitectos (COACo) publishes its ' +
    'vectorised calificación for exactly those two districts (re-checked 2026-08-01: still 2, ' +
    'covering 4.96 km², of which 1.63 km² carries an ordenanza polygon). The Gerencia Municipal de ' +
    'Urbanismo DOES publish the zoning for the whole municipality — but as 77 scanned plan sheets, ' +
    'and only 8 of them have been turned into the machine-readable geometry a parcel can be tested ' +
    'against. Measured against the national land classification ' +
    'for INE 14021, that published area is about 4.9 % of Córdoba’s 33.3 km² of SUELO URBANO. ' +
    'PRYZM will not carry a pilot ordenanza across the city: the PGOU-2001 assigns different rules ' +
    'to different land, so a borrowed number would look exactly like a real determination and be ' +
    'wrong.';

// ⚠⚠ THE LAST SENTENCE OF THIS LINE USED TO BE A FALSE STATEMENT ABOUT OUR OWN COVERAGE, and it
// was shipping. It read: *"Outside the two districts, a click falls back to the national SIU land
// classification, never a borrowed pilot number."* PRYZM does NOT fall back to SIU. The proxy
// exists and is mounted (`server/siuClassificationProxy.js`, `server.js`), and **nothing in
// `packages/*/src` or `apps/*/src` calls it** — checked by grep, 2026-08-01, zero client callers.
// Promising a user an answer we do not render is the same defect class as refusing with "we hold no
// rule" on a zone we have packed (the Barcelona `13b`/`22a`/`20a` deletions), pointing the other
// way. The claim is REMOVED, not softened; wiring the SIU fallback is a register blocker, and the
// copy may promise it on the day it renders.
export const CORDOBA_ROADMAP_LINE =
    'Córdoba coverage today: the PGOU-2001 ordenanzas for the SUR and NOROESTE districts only — a ' +
    '2-district pilot (COACo `coaco:distritos` has exactly two features), NOT the whole ' +
    'municipality. And every value in it is machine-read (OCR) from the scanned ordinance PDFs and ' +
    'NOT yet human-verified, so PRYZM publishes no buildable figure for any Córdoba parcel until ' +
    'that verification is signed. Outside the two districts PRYZM shows no zoning answer at all ' +
    'rather than a borrowed pilot number.';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (2) THE LEGALLY-GROUNDED "no" FAMILIES — `refusalFor`
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠ THE FAMILY KEYS ARE A FORWARD CONTRACT, now set to the LIVE COACo tokens. The dispatcher
// resolves a `subzone` from `coaco:ordenanzas.link` basename + the `ordenanza` family name (pack
// WIRING-TODO 5, `resolveCordobaSubzone`). The tokens below were GUESSED in the first commit; they
// are now the values the CORDOBA-DATA-RECON-SPIKE §3a / CORDOBA-ORDINANCE-REGISTRY confirmed against
// the live layer — `Uso Comercial`/`O_COMERCIAL`, `Elemento protegido`/`O_EP` — plus the
// `subzoneCodeFromLink` parse of each so the classifier matches whichever form the resolver hands it.
// (`CTP1-Campo de la Verdad`/`O_PTC`→`PTC` used to be a third row here; it is now PACKED in
// `esCordobaPGOU2001.ts` — see that removal's own comment above.) Because the VERIFICATION GATE
// refuses the whole pilot today, nothing routes through here in production yet — but the
// classification is correct and permanent: these families refuse even AFTER the packed subzones are
// verified, because their envelope lives in a document PRYZM does not hold.

/** The article-attributable part of a refusal — everything EXCEPT the per-parcel `knownFacts`. */
type ClassifiedRefusal = Omit<EnvelopeRefusal, 'knownFacts'>;

interface FamilyClassification {
    /** The COACo `ordenanza` / `O_*` tokens this row covers (forward contract; see note above). */
    readonly ordenanzas: readonly string[];
    readonly refusal: ClassifiedRefusal;
}

// ⚠⚠ CTP1-Campo de la Verdad (`O_PTC` → `PTC`) — REMOVED FROM THIS TABLE 2026-08-04. It used to
// classify PT-CV as a legally-grounded "no" because the Conjunto Histórico Tomo VI it defers to
// (Art. 13.4.1) was a document PRYZM did not hold. Tomo VI IS NOW HELD
// (`Normativa_del_conjunto_histórico.pdf` / `normativa_PEPCH_Revisado.pdf`, cross-verified verbatim)
// and its "PT" ordinance (Art. 43-55) is packed as zone `PTC` in `esCordobaPGOU2001.ts` — see that
// file's `CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING` header for the full record. Leaving this entry here
// would have asserted a now-FALSE fact ("which PRYZM does not hold") and would also have been
// unreachable in practice (`resolveZoneDisposition` checks `packsByZone` before `refusalFor` for the
// same zoneCode, §CORDOBA-UNPACKED-FAMILY-SPLIT precedence) — but a stale, false assertion left in
// source is a defect on its own even when dead code shadows it, so it is deleted, not just shadowed.
// PT-CV still resolves to NO buildable envelope today (a packed structural refusal, MC-shaped) — that
// is now stated IN THE PACK, not in this legal-classification table.

const FAMILY_CLASSIFICATIONS: readonly FamilyClassification[] = [
    // Uso Comercial — a USE overlay, not a form zone: it defers to the underlying calificación or a
    // Plan Parcial for the envelope. There is no single commercial envelope to state.
    {
        // Live COACo tokens (recon §3a): family `Uso Comercial`, link `O_COMERCIAL.pdf` → `COMERCIAL`.
        ordenanzas: ['Uso Comercial', 'O_COMERCIAL', 'COMERCIAL'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Uso Comercial — a use overlay with no envelope of its own; it defers to the ' +
                'underlying zone or a Plan Parcial.',
            detail:
                'The commercial qualification governs USE, not building form: the PGOU sets the ' +
                'buildable envelope from the underlying calificación or from an approved Plan ' +
                'Parcial for the sector, a different document per site. PRYZM holds no single ' +
                'commercial envelope to encode and refuses rather than borrow one from a ' +
                'neighbouring zone.',
            // Art. 13.12.2, transcribed in `findings/OCR-EXTRACTION-RESULTS.md` §3: commercial
            // buildings in MC/CTP/UAD/UAS/IND follow the UNDERLYING zone, in PAS/OA a specific set,
            // and standalone parcels defer to a Plan Parcial. ⚠ The suelo-urbanizable commercial set
            // (parcela 400 m², FAR 1,5, ocupación PB 100 / PA 50, altura 12 m, separación 6 m) DOES
            // exist and is deliberately NOT quoted as an answer here — it is wrong to apply to an
            // urban parcel, and quoting it would read as the determination.
            ordinanceRef:
                'PGOU-Córdoba-2001, Art. 13.12.2 — Uso Comercial (overlay → underlying zone / Plan ' +
                'Parcial). ' + CORDOBA_PGOU_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // Elemento protegido — a preservation regime. The "envelope" is the EXISTING building fixed by
    // the Catálogo de protección, not a new development entitlement. A refusal, never a pack.
    {
        // Live COACo tokens (recon §3a): family `Elemento protegido`, link `O_EP.pdf` → `EP`.
        ordenanzas: ['Elemento protegido', 'O_EP', 'EP'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Elemento protegido — a preservation regime; the buildable envelope is the ' +
                'existing protected building, fixed by the Catálogo, not a new entitlement.',
            detail:
                'This parcel carries a protected element (Catálogo de protección). Its allowable ' +
                'building form is the existing structure under the preservation ordination, not a ' +
                'zone-parameter envelope, so there is no new buildable volume to compute. PRYZM ' +
                'declines rather than draw a development envelope the preservation regime forbids.',
            // Art. 13.3, transcribed in `findings/OCR-EXTRACTION-RESULTS.md` §3 (grados 1–6 of
            // mejora / reforma / obra nueva), verbatim: *"La sustitución no supondrá aumento de la
            // superficie total ni del volumen construidos"*.
            ordinanceRef:
                'PGOU-Córdoba-2001, Art. 13.3 — Catálogo, Elemento protegido (régimen de ' +
                'protección; "La sustitución no supondrá aumento de la superficie total ni del ' +
                'volumen construidos"). ' + CORDOBA_PGOU_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
];

/** ordenanza-token → refusal. Built once; asserts disjointness at module load. */
const FAMILY_REFUSALS_BY_ORDENANZA: ReadonlyMap<string, ClassifiedRefusal> = (() => {
    const m = new Map<string, ClassifiedRefusal>();
    for (const c of FAMILY_CLASSIFICATIONS) {
        for (const o of c.ordenanzas) {
            if (m.has(o)) {
                throw new Error(
                    `[site-parcel-data] Córdoba ordenanza "${o}" is classified twice — two legal ` +
                        'reasons for the same family is a transcription error.',
                );
            }
            m.set(o, c.refusal);
        }
    }
    return m;
})();

/** The ordenanza tokens this table refuses on legal grounds. Exported for tests + the future resolver. */
export const CORDOBA_LEGALLY_REFUSED_ORDENANZAS: readonly string[] = [
    ...FAMILY_REFUSALS_BY_ORDENANZA.keys(),
];

/**
 * The registry `refusalFor`: the refusal for a Córdoba subzone whose family has a cited LEGAL reason
 * for having no zone envelope, or `null` if this table makes no such claim (then the coverage-gap
 * `noRulePackRefusal` answers). `null` never means "buildable" — it means this table is silent.
 *
 * ⚠ Uso Industrial (`O_INDUSTRIAL`; subzone-unbindable, ocupación DERIVED) and Unifamiliar Aislada
 * (`O_UAS1`; its ordinance content is RECOVERED — CORDOBA-ORDINANCE-REGISTRY §6 — but a pilot parcel
 * still cannot be bound to a UAS-1..6 subzone: the calificación gives the family name only) are
 * deliberately NOT here: those are COVERAGE gaps, not legal "no"s, so they fall through to
 * `noRulePackRefusal` — filing them as legal classifications would assert the ordinance refuses an
 * envelope on land that is in fact buildable (the false-negative-about-someone's-land error).
 */
export function cordobaZoneRefusalFor(
    subzone: string,
    _harmonisedCode?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal | null {
    const row = FAMILY_REFUSALS_BY_ORDENANZA.get(subzone);
    if (!row) return null;
    return { ...row, knownFacts: [...knownFacts] };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (3) THE COVERAGE-GAP CARD — `noRulePackRefusal`
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The registry `noRulePackRefusal`: the card shown on a privately-buildable Córdoba parcel inside
 * the pilot whose FAMILY PRYZM deliberately does not pack — **Uso Industrial** (the calificación
 * names the family but never the IND-1/2/3/G/C subzone, and its ocupación is DERIVED) and
 * **Unifamiliar Aislada** (the `O_UAS1` document link is dead and no held document carries the UAS
 * chapter). It states the 2-district pilot scope (C60 §3).
 *
 * ⚠⚠ IT NO LONGER SAYS "or the parcel carries no calificación". §CORDOBA-REFUSAL-SPLIT (L-422 /
 * L-457 / L-467 / L-469, the honesty family): *"the publisher maps no ordenanza onto this land"*
 * and *"PRYZM has not packed the ordenanza the publisher DID map"* are **different values with
 * different owners** — the first is a fact about COACo's data, the second a fact about us, and only
 * the second is closed by engineering. One card that said "either… or…" made them unreadable and
 * made every one of them look like our backlog. They are now three distinct cards:
 * `cordobaNoCalificacionAtPointRefusal`, `cordobaUnbindableSubzoneRefusal` and this one.
 *
 * ⚠ AND IT MUST NOT BE USED FOR A PACKED SUBZONE. PRYZM holds 13 transcribed subzone parameter sets
 * (PAS-1…MC-4). Telling a user we hold no rule for one of them would be a FALSE STATEMENT ABOUT OUR
 * OWN COVERAGE — the defect that deleted three Barcelona branches (`13b`, `22a`, `22@`) and the bare
 * `20a` branch. `resolveZoneDisposition` reaches this hook only when `packsByZone` has no entry.
 *
 * ⚠ `legallyGrounded: false` and `ordinanceRef: null` — a statement about PRYZM's coverage, never
 * about the law. Rendering it as a legal "no envelope" would tell an owner their buildable plot
 * cannot be built on (the worst error in the set — a false negative about their land).
 */
export function cordobaNoRulePackRefusal(
    subzone: string,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    // §CORDOBA-UNPACKED-FAMILY-SPLIT (L-677) — ROUTE TO THE FAMILY'S OWN CARD FIRST.
    // The two families that reach here are unpacked for DIFFERENT, INDEPENDENTLY-CITED reasons, and
    // a single card that recited both forced every reader to work out which sentence was about
    // their land — the same "either… or…" defect §CORDOBA-REFUSAL-SPLIT closed one level up. Each
    // now names its OWN governing article (or the measured absence of one) and its own land.
    const industrial = cordobaIndustrialUnbindableRefusal(subzone, subzoneLabel, knownFacts);
    if (industrial) return industrial;
    const uas = cordobaUasChapterUnobtainableRefusal(subzone, subzoneLabel, knownFacts);
    if (uas) return uas;

    const named =
        subzoneLabel && subzoneLabel.trim()
            ? `${subzoneLabel.trim()} (${subzone})`
            : subzone && subzone.trim()
              ? subzone
              : 'this parcel';
    return {
        code: 'no-rule-pack',
        headline: `${named} — PRYZM has not transcribed this Córdoba ordenanza's buildable rules.`,
        detail:
            'This is a coverage gap on PRYZM\'s side, not a limit on the land and not an error. ' +
            'The COACo calificación DOES name an ordenanza for this parcel; what PRYZM has not ' +
            'encoded is that ordenanza\'s numeric envelope. A generic setback estimate would be a ' +
            'number the ordinance does not contain, so PRYZM shows none rather than something ' +
            'wrong. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CORDOBA-UNPACKED-FAMILY-SPLIT (L-677) — THE TWO UNPACKED FAMILIES, EACH WITH ITS OWN ARTICLE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// COACo publishes TEN `ordenanza` families (measured live 2026-08-01: 453 polygons, Σ `sup_m2`
// 1 628 615.63 m², ten distinct `ordenanza` values). PRYZM holds transcribed rules for SIX as of
// 2026-08-04 (the original five plus `PTC`/Campo de la Verdad, see `esCordobaPGOU2001.ts`). Of the
// remaining four, TWO are legally-grounded "no"s and live in `FAMILY_CLASSIFICATIONS` above
// (Uso Comercial · Elemento protegido, each citing its article). The other TWO are COVERAGE
// statements — and they shared one card until an earlier pass.
//
// ⚠ WHY THEY MUST NOT SHARE A CARD. Their causes are not the same VALUE (L-422/457/467/469):
//   • Uso Industrial — PRYZM HAS READ the chapter (Art. 13.11, born-digital text, 23 620 chars,
//     `findings/OCR-EXTRACTION-RESULTS.md` §2.6). It is unpackable because the publisher never says
//     WHICH IND subzone applies AND because the ordinance derives ocupación by algorithm. Telling
//     this owner "PRYZM has not transcribed this ordenanza" would be a FALSE STATEMENT ABOUT OUR
//     OWN COVERAGE — the defect class that deleted Barcelona's `13b`/`22a`/`22@`/`20a` branches.
//   • Unifamiliar Aislada — PRYZM has NOT read the chapter, and cannot: `O_UAS1.pdf` is a 69-byte
//     "Server under construction" HTML (md5 `75a5f31…`), and no held document carries the UAS
//     chapter. That is a PUBLISHER absence, closed by negative evidence, not a backlog item.
// One says "we read it and it does not resolve"; the other says "we could not read it". Collapsing
// them makes a publisher's dead link look like PRYZM's queue, which is exactly what the old copy did.
//
// Both return `legallyGrounded: false`: neither is a statement about what the PGOU PERMITS.
// Measured land, live COACo 2026-08-01: Uso Industrial 1 polygon / 1 920.35 m² / 0.118 % of
// ordenanzas land; Unifamiliar Aislada 1 polygon / 2 687.97 m² / 0.165 %.

/** The COACo tokens (family name, `O_*` link basename, and its `subzoneCodeFromLink` parse). */
const CORDOBA_INDUSTRIAL_TOKENS = ['uso industrial', 'o_industrial', 'industrial'];
const CORDOBA_UAS_TOKENS = ['unifamiliar aislada', 'o_uas1', 'uas-1', 'uas1', 'uas'];

const matchesToken = (
    subzone: string,
    subzoneLabel: string | null | undefined,
    tokens: readonly string[],
): boolean => {
    const hay = [subzone, subzoneLabel ?? '']
        .map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
        .filter((s) => s !== '');
    return hay.some((s) => tokens.includes(s));
};

/**
 * **Uso Industrial** (Art. 13.11) — the chapter IS read; the parcel cannot be bound to a subzone
 * AND the ordinance derives its ocupación. `null` when this parcel is not Industrial.
 *
 * ⚠ `regime-undetermined`, NOT `no-rule-pack`, and the difference is the honesty of the sentence.
 * `no-rule-pack` asserts PRYZM has not read the ordinance. PRYZM HAS: `O_INDUSTRIAL.pdf` is
 * born-digital text and its values are recorded in `findings/OCR-EXTRACTION-RESULTS.md` §2.6. What
 * is missing is which of IND-1/2/3/G/C/SC-C governs — the publisher's `ordenanza` says only
 * `Uso Industrial` — and those subzones span parcela mínima 200–2 000 m² and edificabilidad
 * 0,35–1,5, so picking one is a guess presented as a determination. This is the SAME SHAPE as the
 * bare-`O_MC` key (`cordobaUnbindableSubzoneRefusal`) and Barcelona's bare-`20a`: a SELECTOR is
 * missing. ⚠ AND A SECOND, INDEPENDENT REASON stands even if the selector arrives: Art. 13.11
 * states IND-1/2/3 ocupación as *"la resultante de la aplicación de los parámetros de edificación
 * del presente artículo"* — an ALGORITHM, not a number (the Barcelona Art. 242.2 lesson, ADR-0271),
 * so a pack MUST leave it null. Naming only one of the two reasons would imply the other is closed.
 */
export function cordobaIndustrialUnbindableRefusal(
    subzone: string,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal | null {
    if (!matchesToken(subzone, subzoneLabel, CORDOBA_INDUSTRIAL_TOKENS)) return null;
    return {
        code: 'regime-undetermined',
        headline:
            'Uso Industrial — the published map names the industrial ordenanza but not which of ' +
            'its subzones applies, and the ordinance derives the coverage rather than stating it.',
        detail:
            'PRYZM has read this ordinance chapter (PGOU-2001 Art. 13.11) in full. Two separate ' +
            'things still stop a number, and closing either one alone would not produce one. ' +
            'First, the zoning map records only "Uso Industrial" and never the subzone: ' +
            'IND-1/2/3/G/C/SC-C set a minimum plot anywhere from 200 to 2 000 m² and a floor-area ' +
            'ratio from 0,35 to 1,5, so choosing one would be a guess presented as a ' +
            'determination. Second, for IND-1/2/3 the ordinance does not state a site-coverage ' +
            'figure at all — it says the coverage is "la resultante de la aplicación de los ' +
            'parámetros de edificación del presente artículo" — an algorithm to be worked through ' +
            'for the specific building, not a value that can be tabulated. PRYZM records those ' +
            'parameters and publishes no envelope rather than manufacture one. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef:
            'PGOU-Córdoba-2001, Art. 13.11 — Uso Industrial (IND-1/2/3/G/C/SC-C; ocupación ' +
            '"la resultante de la aplicación de los parámetros de edificación del presente ' +
            'artículo"). ' + CORDOBA_PGOU_INSTRUMENT_REF,
        // The LAW is read; WHICH subzone applies is not, and one parameter is an algorithm. Neither
        // is a claim that the PGOU forbids building here.
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * **Unifamiliar Aislada** — the ordinance document is UNOBTAINABLE, and that is a closed question,
 * not a backlog item. `null` when this parcel is not UAS.
 *
 * ⚠ `no-rule-pack`, deliberately, and explicitly NOT `derived-plan` or any legally-grounded code:
 * filing a publisher's dead link as a legal classification would assert the ordinance refuses an
 * envelope on land that is in fact buildable — the false-negative-about-someone's-land error C58
 * ranks worst. ⚠ AND NOT `source-data-unavailable`, which is DEFINED as transient and is the only
 * code carrying a retry affordance: `O_UAS1.pdf` has returned the same 69-byte "Server under
 * construction" HTML (md5 `75a5f31…`) on every fetch since the recon, so a retry badge would send
 * the user round a loop for ever.
 *
 * The negative evidence is complete: all 15 `link` documents COACo references were enumerated, and
 * unlike `O_UAD1` — whose dead link was RECOVERED because `O_UAD3` carries all three UAD subzones —
 * no held document contains the UAS chapter (`findings/OCR-EXTRACTION-RESULTS.md` §1/§3). It reopens
 * the day the publisher fixes the link, and on no other event.
 */
export function cordobaUasChapterUnobtainableRefusal(
    subzone: string,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal | null {
    if (!matchesToken(subzone, subzoneLabel, CORDOBA_UAS_TOKENS)) return null;
    return {
        code: 'no-rule-pack',
        headline:
            'Unifamiliar Aislada — the ordinance document for this zone is not served by the ' +
            'publisher, so PRYZM has never been able to read its rules.',
        detail:
            'The zoning map assigns this parcel to the Unifamiliar Aislada ordenanza, and nothing ' +
            'here says the plot is unbuildable — the PGOU-2001 does give it a buildable regime. ' +
            'PRYZM cannot state that regime because the document that contains it is not ' +
            'available: the publisher\'s own link for this chapter returns a 69-byte "Server under ' +
            'construction" page rather than the ordinance, and it has done so on every attempt. ' +
            'Every one of the fifteen ordinance documents the zoning map references has been ' +
            'checked, and none of the readable ones contains the Unifamiliar Aislada chapter — ' +
            'unlike the Unifamiliar Adosada chapter, whose own broken link was recoverable from a ' +
            'sibling document. This is not a queue PRYZM can work through and retrying will not ' +
            'change it; it resolves when the publisher restores the file. ' +
            CORDOBA_ROADMAP_LINE,
        // A statement about a DOCUMENT we cannot retrieve, never about what the plan permits.
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CORDOBA-REFUSAL-SPLIT — THE THREE "NO NUMBER" VALUES THAT ARE NOT THE SAME VALUE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// L-422 / L-457 / L-467 / L-469: a failure and an empty are the same VALUE unless the code keeps
// them apart. Córdoba has FOUR distinct absences and they had two cards between them. Split:
//
//   (a) `cordobaOutsidePilotRefusal`        — the point is in Córdoba but OUTSIDE the 2 published
//                                             districts. COACo publishes no calificación geometry
//                                             there AT ALL. Durable; no engineering clears it.
//   (b) `cordobaNoCalificacionAtPointRefusal` — the point is INSIDE the pilot and the publisher's
//                                             own layer returns no ordenanza polygon for it (the
//                                             `resolveCordobaSubzone` `'no-subzone'` outcome).
//                                             Measured 2026-08-01: the layer covers 1 628 616 m² of
//                                             the districts' 4 961 344 m², so this is common and is
//                                             mostly public street — but PRYZM cannot prove that,
//                                             and must not assert it.
//   (c) `cordobaUnbindableSubzoneRefusal`   — the publisher DOES map an ordenanza, PRYZM DOES hold
//                                             that family's rules, and the two cannot be joined
//                                             because the polygon's `link` names the family chapter
//                                             without a subzone suffix. Measured, not theorised:
//                                             **14 of 453 polygons (18 539 m², 1.14 % of ordenanzas
//                                             land) carry a bare `O_MC.pdf`**, which
//                                             `subzoneCodeFromLink` parses to `MC` — a code the pack
//                                             does not and must not contain, because MC-1…MC-4
//                                             differ materially (coverage 0.70 vs 0.90; four
//                                             different street-width height tables).
//   (d) `cordobaNoRulePackRefusal`          — above: the family is mapped and PRYZM has not packed it.
//
// Each is `legallyGrounded: false`: all four are statements about DATA (the publisher's or ours),
// never about what the PGOU permits. The legally-grounded "no"s live in `FAMILY_CLASSIFICATIONS`.

/**
 * (a) §CORDOBA-MUNICIPAL-CLOSURE — the parcel is in Córdoba, OUTSIDE the Sur + Noroeste pilot.
 *
 * This is the card that converts ~92 % of Córdoba's urban fabric from a **fabricated estimated
 * envelope** into a **terminal, evidence-backed refusal**. It is dispatched via the municipal
 * registration (`CORDOBA_MUNICIPAL_JURISDICTION_ID`), which exists solely to make the generic
 * estimate unreachable here.
 *
 * ⚠ `code: 'no-plan-at-point'`, and each alternative would be a different false statement:
 *   • `source-data-unavailable` is DEFINED as transient and is the only code carrying a retry
 *     affordance. Nothing about this clears on a retry — COACo has published two districts since
 *     the pilot began. Wearing a retry badge would send the user round a loop for ever (the exact
 *     conflation `no-plan-at-point` was added to end).
 *   • `no-rule-pack` would claim the gap is PRYZM's transcription backlog. It is not: there is no
 *     published calificación here to transcribe.
 *   • any legally-grounded code would assert an ordinance fact about someone's land that we have
 *     NOT established. The PGOU-2001 governs the whole municipality; only its VECTORISATION stops
 *     at the district line. Saying otherwise would be a false negative about their land.
 *
 * ⚠ THE COPY MUST NOT SAY "THERE IS NO PLAN FOR YOUR LAND". There is one. What there is no
 * published GEOMETRY for is the zone assignment.
 */
export function cordobaOutsidePilotRefusal(
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    return {
        code: 'no-plan-at-point',
        headline:
            'Córdoba — this parcel is outside the two districts whose zoning map is published, so ' +
            'PRYZM cannot say which ordenanza governs it.',
        detail:
            'A general plan DOES govern this land — the PGOU-Córdoba-2001 covers the whole ' +
            'municipality — and nothing here says your plot is unbuildable. A zoning map for it ' +
            'exists too, as a scanned plan sheet. What does NOT exist is a MACHINE-READABLE version ' +
            'of that map: the only digitised calificación for Córdoba is the one the Colegio ' +
            'Oficial de Arquitectos (COACo) serves, and it covers the SUR and NOROESTE districts ' +
            'only — re-checked on 2026-08-01, still 2 districts, 4.96 km². PRYZM therefore refuses ' +
            'rather than carry a pilot ordenanza across the city: the PGOU assigns different rules ' +
            'to different land, so a borrowed number would look exactly like a real determination ' +
            'and be wrong. ' +
            CORDOBA_MUNICIPAL_ROADMAP_LINE,
        // NOT an ordinance citation: nothing in the law failed, and the PGOU is not what is absent.
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * (b) The point is INSIDE the published pilot and the publisher's own `coaco:ordenanzas` layer
 * returns no polygon for it — `resolveCordobaSubzone`'s `'no-subzone'` outcome.
 *
 * ⚠ IT MUST NOT CLAIM THE LAND IS A STREET, even though most of it is. Measured 2026-08-01 the
 * ordenanzas layer covers 1 628 616 m² of the two districts' 4 961 344 m² (32.8 %) and
 * `usos_globales` a further 678 436 m²; the residue is viario plus land the publisher attributes to
 * nothing. PRYZM cannot tell "public street" (a legally-grounded no-private-envelope answer) from
 * "not attributed" (an unknown), so it states the fact it has and stops — asserting the legal
 * reading would be the L-526 error.
 */
export function cordobaNoCalificacionAtPointRefusal(
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    return {
        code: 'no-plan-at-point',
        headline:
            'Córdoba — the published zoning map covers this district but assigns no ordenanza ' +
            'polygon to this point.',
        detail:
            'This parcel is inside the SUR/NOROESTE area whose calificación COACo publishes, and ' +
            'the lookup SUCCEEDED — it simply returned no ordenanza polygon covering this point. ' +
            'That is a real answer from the publisher, not a failed request, so retrying will not ' +
            'change it. Much of the un-mapped area is public street and other land the plan does ' +
            'not give a private buildable rule; PRYZM will not assert that about YOUR parcel ' +
            'without evidence, so it reports what it knows — no ordenanza is mapped here — and ' +
            'publishes no envelope. Selecting the cadastral parcel rather than drawing the ' +
            'boundary by hand puts the query point inside the plot, which sometimes resolves it. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * (c) The publisher maps an ordenanza FAMILY, PRYZM holds that family's transcribed rules, and the
 * polygon's `link` does not say WHICH subzone — so no parameter set can be bound.
 *
 * ⚠ THE SHIPPED, MEASURED CASE IS BARE `O_MC.pdf`: **14 of 453 polygons, 18 539 m², 1.14 % of the
 * ordenanzas land** (live COACo query, 2026-08-01). `subzoneCodeFromLink('O_MC.pdf')` → `'MC'`,
 * which is deliberately NOT in `CORDOBA_PGOU2001_ZONE_CODES`. Picking the biggest MC subzone would
 * be the confident-wrong answer the recon warned about: MC-4 allows 0.90 upper-floor coverage where
 * MC-1/2/3 allow 0.70, and each subzone reads a different street-width height band.
 *
 * ⚠ IT IS *NOT* `cordobaNoRulePackRefusal`. Saying "PRYZM has not transcribed this ordenanza" on
 * Manzana Cerrada land would be false — all four MC subzones are packed. What is missing is the
 * publisher's subzone KEY, which is the same shape as Barcelona's bare-`20a` closure: a SELECTOR is
 * missing, not a rule, and no further reading of the ordinance can supply it.
 */
export function cordobaUnbindableSubzoneRefusal(
    family: string,
    linkBasename?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const fam = family.trim() || 'this ordenanza';
    const link = linkBasename && linkBasename.trim() ? linkBasename.trim() : null;
    return {
        code: 'regime-undetermined',
        headline:
            `${fam} — PRYZM holds this ordenanza's rules, but the published map does not say which ` +
            'of its subzones applies here.',
        detail:
            'The zoning map assigns this parcel to the ' + fam + ' ordenanza, and PRYZM has ' +
            'transcribed every one of that ordenanza\'s subzones from the PGOU-2001. The subzone ' +
            'is what carries the numbers, and the published polygon does not identify it' +
            (link ? ` — its document link is \`${link}\`, the family chapter rather than a subzone` : '') +
            '. The subzones are materially different (for Manzana Cerrada, upper-floor coverage is ' +
            '70 % in MC-1/2/3 and 90 % in MC-4, and each reads a different maximum height from the ' +
            'street-width table), so choosing one would be a guess presented as a determination. ' +
            'PRYZM publishes nothing instead. This is a gap in the published KEY, not in the ' +
            'ordinance and not in PRYZM\'s transcription. ' +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: CORDOBA_PGOU_INSTRUMENT_REF,
        // The LAW is fully known and transcribed; what is missing is which half of it applies to
        // this parcel — the `regime-undetermined` definition verbatim (C58 §1.13.7).
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// (1) THE VERIFICATION GATE — `cordobaUnverifiedRefusal` (the honesty gate the dispatcher enforces)
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE HONESTY-GATE refusal: shown for EVERY Córdoba parcel — including one in a fully-PACKED subzone
 * (PAS-1…MC-4) — while `CORDOBA_ENVELOPE_VERIFIED` is false. It is what makes "the pack is registered
 * but renders no number" TRUE.
 *
 * ⚠ Distinct from the coverage gap on purpose: here PRYZM DOES hold machine-read rules for the
 * subzone, so "we have not encoded this zone" would be false. What it lacks is a HUMAN who has
 * verified the OCR against the source — a wrong number would be OUR pipeline's error. So it states
 * exactly that, and withholds the number until sign-off.
 *
 * `code: 'no-rule-pack'`, `legallyGrounded: false`, `ordinanceRef: null` — a statement about PRYZM's
 * verification status, never about the law. (The enum carries no dedicated `unverified` code; this
 * is the honest fit and the copy carries the precise meaning.)
 */
export function cordobaUnverifiedRefusal(
    subzone?: string | null,
    subzoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    // ⚠ §CORDOBA-UNVERIFIED-SCOPE — THE COPY IS CONDITIONAL BECAUSE OUR KNOWLEDGE IS.
    // The dispatcher calls this with `subzone = null` for EVERY pilot parcel: the gate fires
    // BEFORE the COACo subzone resolver runs, so at that moment PRYZM does not know which zone the
    // parcel is in. The previous copy asserted, unconditionally, that PRYZM had "machine-read THIS
    // zone's rules" — false on the ~5.7 % of pilot ordenanzas land whose family is deliberately not
    // packed (Uso Comercial, Elemento protegido, Campo de la Verdad, Unifamiliar Aislada, Uso
    // Industrial) and misleading on the ≈43 % delegated to a Plan Parcial / PERI / Estudio de
    // Detalle, where the base ordenanza does not govern at all. A refusal that overstates our
    // holdings is the same defect class as one that understates them (the Barcelona `20a` / `22a` /
    // `13b` deletions), just pointing the other way.
    const known = Boolean((subzone && subzone.trim()) || (subzoneLabel && subzoneLabel.trim()));
    const zone =
        subzoneLabel && subzoneLabel.trim()
            ? `${subzoneLabel.trim()}${subzone ? ` (${subzone})` : ''}`
            : subzone && subzone.trim()
              ? subzone
              : 'this Córdoba parcel';
    return {
        code: 'no-rule-pack',
        headline: known
            ? `${zone} — PRYZM has machine-read this zone's rules from the ordinance, but no human ` +
              'has verified them yet, so it will not publish a figure.'
            : `${zone} — PRYZM will not publish a buildable figure anywhere in this pilot until its ` +
              'machine-read ordinance values have been verified by a human.',
        detail:
            (known
                ? 'PRYZM extracted the PGOU-2001 parameters for this zone by OCR from the ordinance ' +
                  'PDFs. '
                : 'PRYZM extracted the PGOU-2001 parameters for the ordenanzas of this pilot area ' +
                  'by OCR from the ordinance PDFs, and it has not yet identified which ordenanza ' +
                  'covers this particular parcel — the zone lookup runs only once the values below ' +
                  'are cleared for publication. ') +
            'Those values are MACHINE-EXTRACTED and UNVERIFIED ' +
            '(pipeline-extracted-unverified): no Spanish-planning-literate reviewer has yet checked ' +
            'them against the source. Because a wrong number here would be PRYZM’s own extraction ' +
            'error — not the publisher’s — PRYZM withholds the figure until that human verification ' +
            'is signed off, rather than render an unchecked buildable envelope. ' +
            (known
                ? ''
                : 'Note that even after sign-off some Córdoba parcels will still get a "no" rather ' +
                  'than a number, for reasons that are about the plan and not about PRYZM: roughly ' +
                  'half of this pilot area is delegated by the PGOU to a later instrument (Plan ' +
                  'Parcial, Plan Especial, PERI, Estudio de Detalle), and several ordenanzas define ' +
                  'no envelope of their own. ') +
            CORDOBA_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
