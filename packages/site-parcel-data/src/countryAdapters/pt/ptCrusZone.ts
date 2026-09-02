// LANE PT-ZONEID — CRUS zone identity → the ZONE-NAMED CITED REFUSAL (demo gap G4).
//
// WHAT THIS CLOSES. Before this module, a Portuguese parcel's envelope axis was a blind
// `estimated-default` triple naming no zone (DEMO-READINESS rows 7–9): the user saw an Estimated
// setback box on land whose state-served classification PRYZM never consulted — the L-616
// overstatement family on Portuguese soil. After it, the same click yields a typed
// `EnvelopeRefusal` that NAMES the zone (classe + categoria + the full verbatim designation),
// NAMES the instrument (the município's PDM, with its SNIT legal-deposit reference and in-force
// stamp), and SAYS WHY no envelope is drawn (PDM numeric parameters are PDF-only in Portugal —
// LEGISLATION-RATE ~0 % structured; no signed pack exists).
//
// WHAT THIS DOES **NOT** CLAIM. CRUS is the DGT's harmonised national transcription of each
// município's Planta de Ordenamento — geometry + category, NO numbers (recon §4.7: "geometry +
// category are structured and national; the numbers are not"). Nothing here computes, estimates
// or draws an envelope; every output is a refusal carrying identity. The refusal CODE is chosen
// from the served classification by `ptRefusalCodeForZone` below, and the choice is deliberately
// biased toward the WEAKEST claim (`no-rule-pack`, a statement about PRYZM's coverage) whenever
// the categoria is not one whose national semantics (Decreto Regulamentar n.º 15/2015 vocabulary)
// settle the matter — over-stating a RESTRICTION is the same defect as over-stating an allowance
// (the refusing-half-needs-its-escape-hatch lesson, L-942).
//
// PURITY: the resolver is orchestration over the one impure seam (`ptCrusClient.ts`); the parse,
// classification and refusal construction are PURE and fixture-tested. OTel spans (P8).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type EnvelopeRefusal,
    type FetchOutcome,
} from '@pryzm/schemas';
import { pointInRingsEvenOdd } from '../../geometry/pointInRingsEvenOdd.js';
import { isInPortugal } from '../../parcelProviders/dgtParcelProvider.js';
import {
    ptCrusFeaturesAtPoint,
    type PtCrusRawFeature,
    type PtFetchDeps,
} from './ptCrusClient.js';

const tracer = trace.getTracer('pryzm.siteintel.pt');

/** Stable jurisdiction id for the national CRUS zone-identity leg (the DK `'dk'` shape). */
export const PT_CRUS_JURISDICTION_ID = 'pt';

/* ────────────────────────────── the zone model ─────────────────────────── */

/**
 * One CRUS zone record, verbatim-normalised from the measured properties (client fact 1).
 * Field names are camelCased; VALUES are byte-verbatim from the service — including Porto's
 * en-dashes and doubled spaces in `classificacaoEQualificacao`. Never trim "cosmetic" oddities:
 * the verbatim string is what a human verifies against the Planta de Ordenamento legend.
 */
export interface PtCrusZone {
    readonly fid: number | null;
    /** DTCC — distrito+concelho município code (Lisboa `1106`, Porto `1312`, Évora `0705`). */
    readonly dtcc: string;
    /** Município name as served (uppercase, accented — e.g. `ÉVORA`). */
    readonly municipio: string;
    /** The full verbatim designation, e.g. `Solo Urbano - Espaços habitacionais`. */
    readonly classificacaoEQualificacao: string;
    /** DR 15/2015 harmonised classe — `Solo Urbano` | `Solo Rústico` (verbatim). */
    readonly classe2021: string;
    /** DR 15/2015 harmonised categoria — e.g. `Espaço Habitacional`, `Espaço Verde` (verbatim). */
    readonly categoria2021: string;
    readonly escalaOrigem: string | null;
    readonly fonte: string | null;
    readonly autor: string | null;
    /** ISO datetime of the source plan publication (`data_pub_origem`). */
    readonly dataPubOrigem: string | null;
    /** ⭐ The SNIT legal-deposit reference of the PDM (`registo_ou_deposito`) — the instrument key. */
    readonly registoOuDeposito: string | null;
    /** In-force stamp (`situacao_pdm`, observed `Vigente`). Carried verbatim; caveated if not vigente. */
    readonly situacaoPdm: string | null;
    readonly codigo: number | null;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * PURE: read one feature's attribute bag into a `PtCrusZone`, or null when a REQUIRED identity
 * field (dtcc / municipio / classe_2021 / categoria_2021 / classificacao_e_qualificacao) is
 * missing — a record that cannot name its zone cannot be the basis of a zone-named refusal.
 */
export function parsePtCrusZone(properties: Record<string, unknown>): PtCrusZone | null {
    const dtcc = str(properties['dtcc']);
    const municipio = str(properties['municipio']);
    const classificacao = str(properties['classificacao_e_qualificacao']);
    const classe = str(properties['classe_2021']);
    const categoria = str(properties['categoria_2021']);
    if (!dtcc || !municipio || !classificacao || !classe || !categoria) return null;
    return {
        fid: num(properties['fid']),
        dtcc,
        municipio,
        classificacaoEQualificacao: classificacao,
        classe2021: classe,
        categoria2021: categoria,
        escalaOrigem: str(properties['escala_origem']),
        fonte: str(properties['fonte']),
        autor: str(properties['autor']),
        dataPubOrigem: str(properties['data_pub_origem']),
        registoOuDeposito: str(properties['registo_ou_deposito']),
        situacaoPdm: str(properties['situacao_pdm']),
        codigo: num(properties['codigo']),
    };
}

/* ────────────────────────────── classification → refusal code ─────────── */

/** Accent-and-case-insensitive normalisation for matching served PT vocabulary. */
function normalisePt(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** The DR 15/2015 classe, recognised from the served string — never guessed. */
export type PtCrusClasse = 'solo-urbano' | 'solo-rustico' | 'unrecognised';

export function classifyPtCrusClasse(classe2021: string): PtCrusClasse {
    const n = normalisePt(classe2021);
    if (n === 'solo urbano') return 'solo-urbano';
    if (n === 'solo rustico') return 'solo-rustico';
    return 'unrecognised';
}

/**
 * Choose the refusal CODE + `legallyGrounded` from the served classification.
 *
 * The bias rule (header): a LEGAL code (`legallyGrounded: true`) is used ONLY where the DR
 * 15/2015 categoria semantics settle it from the state's own record —
 *   • Solo Urbano / `Espaço Verde` → `public-open-space` (green-space categoria: buildability is
 *     nil-to-incidental by national definition; the Porto probe point is exactly this);
 *   • Solo Urbano / categoria naming `equipamento` → `facility-plan` (per-facility instruments);
 *   • Solo Rústico, EXCEPT the categorias whose whole point is that ordinary edification exists
 *     under the rural regime (`aglomerado rural`, `área de edificação dispersa`, `ocupação
 *     turística`) → `protected-soil` (solo rústico is the land the RJIGT reserves from
 *     urbanisation — no URBAN envelope exists).
 * EVERYTHING else — all ordinary urbano categorias, the three edificável rústico categorias, and
 * any unrecognised classe — is `no-rule-pack` (`legallyGrounded: false`): a statement about
 * PRYZM's coverage, the weakest claim, never a fiction that "the ordinance refused".
 */
export function ptRefusalCodeForZone(zone: PtCrusZone): {
    readonly code: EnvelopeRefusal['code'];
    readonly legallyGrounded: boolean;
} {
    const classe = classifyPtCrusClasse(zone.classe2021);
    const categoria = normalisePt(zone.categoria2021);
    if (classe === 'solo-urbano') {
        if (categoria.includes('espaco verde')) {
            return { code: 'public-open-space', legallyGrounded: true };
        }
        if (categoria.includes('equipamento')) {
            return { code: 'facility-plan', legallyGrounded: true };
        }
        return { code: 'no-rule-pack', legallyGrounded: false };
    }
    if (classe === 'solo-rustico') {
        const edificavelRustico =
            categoria.includes('aglomerado rural') ||
            categoria.includes('edificacao dispersa') ||
            categoria.includes('ocupacao turistica');
        if (!edificavelRustico) {
            return { code: 'protected-soil', legallyGrounded: true };
        }
        return { code: 'no-rule-pack', legallyGrounded: false };
    }
    // Unrecognised classe (pre-2015 vocabulary, or a service change): NEVER guess a legal code.
    return { code: 'no-rule-pack', legallyGrounded: false };
}

/* ────────────────────────────── the cited refusal ──────────────────────── */

/** One line naming the governing instrument from the served record — used in detail + facts. */
function instrumentLine(zone: PtCrusZone): string {
    const parts: string[] = [`PDM de ${zone.municipio}`];
    if (zone.registoOuDeposito) parts.push(`registo/depósito n.º ${zone.registoOuDeposito}`);
    if (zone.situacaoPdm) parts.push(`situação ${zone.situacaoPdm}`);
    if (zone.dataPubOrigem) parts.push(`publicação ${zone.dataPubOrigem.slice(0, 10)}`);
    return parts.join(', ');
}

/**
 * PURE: the zone-named cited refusal for one resolved CRUS zone. Names the zone VERBATIM, names
 * the instrument with its legal-deposit reference, and states why no envelope is drawn. Numeric
 * fields do not exist on a refusal — nothing here can overstate an allowance.
 */
export function ptCrusZoneRefusal(zone: PtCrusZone): EnvelopeRefusal {
    const { code, legallyGrounded } = ptRefusalCodeForZone(zone);
    const instrument = instrumentLine(zone);
    const whyNoEnvelope =
        'Portuguese PDM numeric parameters (índice de edificação, cércea, afastamentos) are ' +
        'published only in the per-município Regulamento PDF, not as structured data ' +
        '(pt/LEGISLATION-RATE.md ~0 % structured), and no human-signed rule pack exists for ' +
        `${zone.municipio}. Drawing an envelope here would be an estimate wearing a citation — refused.`;

    let headline: string;
    let detail: string;
    switch (code) {
        case 'public-open-space':
            headline = `${zone.classificacaoEQualificacao} — green-space categoria; no private buildable envelope.`;
            detail =
                `The national CRUS (DGT) classifies this point as Classe "${zone.classe2021}", ` +
                `Categoria "${zone.categoria2021}" under the ${instrument}. Under the DR 15/2015 ` +
                'national vocabulary, espaços verdes exist for ecological balance and open-air ' +
                'recreation — buildability is nil-to-incidental and fixed by the município, never by ' +
                'a per-parcel zone parameter. ⚠ The PDM Regulamento was NOT read for this zone: any ' +
                'incidental edification regime it admits is not represented here. ' +
                whyNoEnvelope;
            break;
        case 'facility-plan':
            headline = `${zone.classificacaoEQualificacao} — equipamentos categoria; buildability is fixed per facility.`;
            detail =
                `The national CRUS (DGT) classifies this point as Classe "${zone.classe2021}", ` +
                `Categoria "${zone.categoria2021}" under the ${instrument}. Equipamentos/infra-` +
                'estruturas land carries no per-parcel private envelope rule — capacity is fixed per ' +
                'facility by the município. ⚠ The PDM Regulamento was NOT read for this zone. ' +
                whyNoEnvelope;
            break;
        case 'protected-soil':
            headline = `${zone.classificacaoEQualificacao} — Solo Rústico; no urban buildable envelope exists.`;
            detail =
                `The national CRUS (DGT) classifies this point as Classe "${zone.classe2021}", ` +
                `Categoria "${zone.categoria2021}" under the ${instrument}. Solo Rústico is the land ` +
                'the RJIGT (DL 80/2015) and DR 15/2015 reserve from urbanisation: no urban envelope ' +
                'exists to draw. ⚠ Exceptional non-urban edification regimes (agricultural support, ' +
                'pre-existing buildings) remain per-PDM and are NOT represented — this refusal is ' +
                'about an URBAN envelope, not a claim that nothing may ever be built. ' +
                whyNoEnvelope;
            break;
        default:
            headline = `${zone.classificacaoEQualificacao} — zone identified; PRYZM has not encoded the ${zone.municipio} PDM.`;
            detail =
                `The national CRUS (DGT) classifies this point as Classe "${zone.classe2021}", ` +
                `Categoria "${zone.categoria2021}" under the ${instrument}. This is a COVERAGE ` +
                'statement, not a legal refusal: the categoria admits (or may admit) private ' +
                'edification, and the numbers that would bound it live in the Regulamento. ' +
                whyNoEnvelope;
            break;
    }
    if (zone.situacaoPdm && zone.situacaoPdm !== 'Vigente') {
        detail += ` ⚠ situacao_pdm is "${zone.situacaoPdm}", not "Vigente" — the transcribed plan's own in-force status is qualified.`;
    }

    const knownFacts: string[] = [
        `Município: ${zone.municipio} (DTCC ${zone.dtcc})`,
        `Zona (CRUS, verbatim): ${zone.classificacaoEQualificacao}`,
        `Classe: ${zone.classe2021}`,
        `Categoria: ${zone.categoria2021}`,
        `Instrumento: ${instrument}`,
    ];
    if (zone.fonte || zone.escalaOrigem) {
        knownFacts.push(
            `Fonte: ${zone.fonte ?? 'not served'} · escala ${zone.escalaOrigem ?? 'not served'}`,
        );
    }

    return {
        code,
        headline,
        detail,
        ordinanceRef:
            "CRUS — Carta do Regime de Uso do Solo (DGT), national OGC API collection 'crus' " +
            '(ogcapi.dgterritorio.gov.pt; CC BY 4.0, SNIG record 517c5023-04cc-47a4-99f7-bb32814dd62f, ' +
            `licence text read 2026-09-02). Zone verbatim: "${zone.classificacaoEQualificacao}"; ` +
            `instrument: ${instrument}; harmonised classe/categoria per Decreto Regulamentar ` +
            'n.º 15/2015. ⚠ CRUS is the DGT\'s harmonised transcription of each município\'s Planta ' +
            'de Ordenamento — the LEGAL text is the município\'s Regulamento do PDM (PDF), which ' +
            'PRYZM has not read for this zone.',
        knownFacts,
        legallyGrounded,
    };
}

/* ────────────────────────────── the resolver (the chain leg) ───────────── */

/** The zone-identity result: the resolved zone + its ready-made cited refusal. */
export interface PtZoneIdentity {
    readonly zone: PtCrusZone;
    readonly refusal: EnvelopeRefusal;
}

/** Does any polygon of this feature CONTAIN the point (even-odd, holes honoured)? */
function featureContains(feature: PtCrusRawFeature, lat: number, lon: number): boolean {
    return feature.polygons.some((rings) => pointInRingsEvenOdd({ x: lon, y: lat }, rings));
}

/**
 * Resolve the CRUS zone CONTAINING a WGS84 point.
 *
 *   • found     → exactly one CRUS polygon contains the point; its verbatim zone record.
 *   • absent    → outside the mainland routing bbox (no fetch — CRUS is Continente-only), the
 *                 collection's own clean zero (sea / un-transcribed land), no candidate polygon
 *                 containing the point, or an ambiguous double-containment (named, never picked).
 *   • transient → the source did not answer / served something unreadable (client fact 2).
 */
export async function resolvePtCrusZoneAtPoint(
    lat: number,
    lon: number,
    deps: PtFetchDeps = {},
): Promise<FetchOutcome<PtCrusZone>> {
    return tracer.startActiveSpan('pryzm.siteintel.pt.resolveCrusZone', async (span): Promise<FetchOutcome<PtCrusZone>> => {
        try {
            span.setAttribute('pt.lat', lat);
            span.setAttribute('pt.lon', lon);
            if (!isInPortugal(lat, lon)) {
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(
                    `no-point: (${lat},${lon}) is outside the mainland-Portugal routing bbox — CRUS is Continente-only`,
                );
            }
            const candidates = await ptCrusFeaturesAtPoint(lat, lon, deps);
            if (candidates.status !== 'found') {
                span.setStatus(
                    candidates.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: candidates.reason }
                        : { code: SpanStatusCode.OK },
                );
                return candidates as FetchOutcome<PtCrusZone>;
            }
            const containing = candidates.value.filter((f) => featureContains(f, lat, lon));
            if (containing.length === 0) {
                // bbox INTERSECTION found neighbours, but no polygon holds the point (client fact 4).
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(
                    `no-feature: no CRUS polygon contains (${lat},${lon}) — ${candidates.value.length} nearby polygon(s) intersect the point bbox only`,
                );
            }
            if (containing.length > 1) {
                // Two zones claiming one point is a data anomaly (or an exact-boundary click):
                // picking either would be a wrong-zone citation. Refuse, naming both.
                const fids = containing
                    .map((f) => String((f.properties['fid'] as number | string | undefined) ?? '?'))
                    .join(', ');
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(
                    `degenerate-geometry: ${containing.length} CRUS polygons contain (${lat},${lon}) (fids ${fids}) — ambiguous zoning, refusing to pick`,
                );
            }
            const zone = parsePtCrusZone(containing[0]!.properties);
            if (zone === null) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'missing-identity-fields' });
                return fetchTransient(
                    `upstream-failed: CRUS feature at (${lat},${lon}) is missing required zone-identity attributes (dtcc/municipio/classe_2021/categoria_2021/classificacao_e_qualificacao)`,
                );
            }
            span.setAttribute('pt.dtcc', zone.dtcc);
            span.setAttribute('pt.classe', zone.classe2021);
            span.setStatus({ code: SpanStatusCode.OK });
            return fetchFound(zone);
        } finally {
            span.end();
        }
    });
}

/**
 * §E1d-shape chain leg — THE PT RULES CHAIN ARM (zone identity → cited refusal). The §J `rules`
 * arm of `ptCountryAdapter`: kind `zone-identity-refusal`, because Portugal's structured national
 * channel carries IDENTITY ONLY (recon §4.7) — the numeric arm arrives with an E8 Portuguese
 * reader + a human-signed pack (see `ptPortoPdmDraft.ts` for the drafted-but-shut first pack).
 */
export async function resolvePtZoneRefusalAtPoint(
    lat: number,
    lon: number,
    deps: PtFetchDeps = {},
): Promise<FetchOutcome<PtZoneIdentity>> {
    const zone = await resolvePtCrusZoneAtPoint(lat, lon, deps);
    if (zone.status !== 'found') return zone as FetchOutcome<PtZoneIdentity>;
    return fetchFound({ zone: zone.value, refusal: ptCrusZoneRefusal(zone.value) });
}
