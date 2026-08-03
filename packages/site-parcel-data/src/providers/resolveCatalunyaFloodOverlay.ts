// CATALUNYA — `CatalunyaFloodOverlayProvider`: the LIVE ZFP/DPH reader and the ONE impure seam
// that the pure attribute parser (`catalunyaAiguaEspaiFluvial.ts`) sits behind.
//
// ⚠ DRAFT / SPEC STATUS — C62 §1.7: this file is a SCHEMA-EXTRACTION-DRIVEN DRAFT, not a wired
// provider. It is not registered in `registry.ts`, it has no proxy route counterpart in
// `server.js` yet, and no gate/certification treats its output as authoritative. It exists to
// prove the shape a real `CatalunyaFloodOverlayProvider` would take, against REAL extracted
// features, mirroring `resolveBalearsMuib.ts`'s discriminated-refusal pattern. Confidence: HIGH on
// the schema and the two live features (byte-verified, this session); MEDIUM on the legal-severity
// mapping (RD 638/2016 citations were supplied as already-established context, not re-derived
// here); LOW on the proxy contract (`CatalunyaFloodOverlayDeps`/`CATALUNYA_FLOOD_OVERLAY_PATH`) —
// no same-origin proxy exists yet, so its shape is a proposal, not a measured fact.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SOURCE IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ACA (Agència Catalana de l'Aigua) publishes `AIGUA_ZFP` (*Zona de Flux Preferent*) and
// `AIGUA_DPH` (*Domini Públic Hidràulic*) on a public, keyless WFS 2.0.0 at
//
//     https://sig.gencat.cat/ows/AIGUA/wfs
//
// Both confirmed LIVE (`GetCapabilities`, `DescribeFeatureType`, `GetFeature` all answered) and
// both publish the IDENTICAL attribute schema — see `catalunyaAiguaEspaiFluvial.ts` for the full
// field-by-field account and the live sample (Besòs river mouth, `ARPSI=ES100060`) committed at
// `__tests__/fixtures/catalunya-aigua-besos-zfp-dph.json`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE LEGAL SHAPE — RD 638/2016 (already established; not re-derived in this file)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// RD 638/2016 amends the RDPH (Reglamento del Dominio Público Hidráulico) and adds Art. 9bis /
// 9ter / 9quater / 14bis:
//   - `DPH` (Domini Públic Hidràulic — the historic riverbed / public hydraulic domain itself) is
//     the STRICTEST category: it is public domain, and private construction on it is prohibited as
//     a matter of ownership, not merely a use restriction. Modelled here as `severity: 'prohibits'`.
//   - `ZFP` (Zona de Flux Preferent) is the wider preferential-flow corridor. Art. 9quater bans
//     "vulnerable" uses/activities that significantly reduce drainage capacity outright; other
//     actions inside the ZFP require a *declaració responsable* to ACA before proceeding.
//     Modelled here as `severity: 'restricts'`.
//   - `ZI` (Zona Inundable — the general flood-hazard zone, wider again than ZFP, typically the
//     T=100/T=500 return-period extent) carries lighter Art. 14 restrictions. ⛔ NOT QUERIED BY
//     THIS PROVIDER — no ZI-named layer was found on the ZFP/DPH census, and per this task's scope
//     it is NOT hunted for as a separate service. `CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS`
//     carries that gap explicitly, and `CatalunyaFloodOverlayKind` still enumerates `'ZI'` so a
//     future wired provider extends this union rather than replacing it.
//
// ⭐ FIVE HONESTY PROPERTIES (mirrors `resolveBalearsMuib.ts` — read before changing this file)
//  1. NEVER THROWS. Every miss, unreachable proxy and malformed body is a typed refusal.
//  2. FAILURE ≠ EMPTY. `endpoint-unreachable` (an upstream did not answer) and
//     `no-flood-constraint-here` (both upstreams answered, completely, with nothing) are different
//     values and must never collapse (§CONTEXT-DATA-HONESTY).
//  3. OVERLAP IS NOT AMBIGUITY. Unlike a zoning polygon (where two different zone codes covering a
//     point is a boundary error), ZFP and DPH overlapping — DPH is normally nested INSIDE its
//     covering ZFP polygon — is the EXPECTED shape of this data. The resolver returns a LIST of
//     effects, one per layer that answered a hit, and never picks a "winner".
//  4. ⛔ NO SILENT AUTHORISATION. Resolving these effects is NOT the same question as whether PRYZM
//     may publish a citation of them — mirrors Balears' `envelopePublicationAuthorisation()` split.
//  5. UNKNOWN NEVER NO. `ZI` being unqueried is not evidence no ZI constraint applies here — it is
//     carried forward as a stated gap on every resolution, successful or not.
//
// PURITY: the fetch is INJECTED (C58 §1.9); given the same body the mapping is byte-deterministic.
// OTel spans per P8.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInCatalunya } from './catalunyaBbox.js';
import {
    readCatalunyaEspaiFluvialFeatureCollection,
    type CatalunyaEspaiFluvialFeature,
} from './catalunyaAiguaEspaiFluvial.js';

const tracer = trace.getTracer('pryzm.overlay.catalunyaFlood');

/** ⚠ PROPOSED — no proxy route exists yet. Same-origin-proxy shape, mirroring `BALEARS_MUIB_PATH`. */
export const CATALUNYA_FLOOD_OVERLAY_PATH = '/api/es/catalunya-aigua-flood';

/** Upstream, for the (not-yet-built) proxy and for Node-side tooling ONLY. */
export const CATALUNYA_AIGUA_WFS_SERVICE = 'https://sig.gencat.cat/ows/AIGUA/wfs';

export const CATALUNYA_ZFP_TYPENAME = 'AIGUA:AIGUA_ZFP';
export const CATALUNYA_DPH_TYPENAME = 'AIGUA:AIGUA_DPH';

/** The three flood-related categories RD 638/2016 recognises. `ZI` is enumerated but never queried. */
export type CatalunyaFloodOverlayKind = 'DPH' | 'ZFP' | 'ZI';

/**
 * ⛔ THE CONSTRAINT FAMILIES / GAPS THIS DRAFT DOES NOT CLOSE. Carried on every successful
 * resolution — mirrors `BALEARS_MISSING_CONSTRAINTS` (ADR-0293 posture): each entry can only ever
 * REDUCE what a real answer would say, never inflate it.
 */
export const CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS: readonly string[] = Object.freeze([
    'ZI (Zona Inundable, the general Art. 14 flood-hazard zone) is not queried by this provider — ' +
        'no ZI-named layer was found on the AIGUA service census; UNKNOWN NEVER NO',
    'HISTORIA (the per-delimitation-study PDF fitxa) is not fetched or parsed — only the WFS ' +
        'attributes are read',
    'DATA_MODIF is the only currency signal this schema publishes — there is no validity-interval ' +
        'pair like Balears DINIVIGEN/DFIVIGEN, so a superseded delimitation cannot be distinguished ' +
        'from a current one by this provider alone',
    'the proxy contract (CATALUNYA_FLOOD_OVERLAY_PATH) is PROPOSED, not measured — no same-origin ' +
        'route exists yet (C57 CSP requires one before this can run in the browser)',
]);

/** The rendering/legal effect one hit contributes. NEW type — no prior `OverlayEffect` exists in
 * this codebase; this is the shape proposed for it. */
export interface OverlayEffect {
    readonly kind: CatalunyaFloodOverlayKind;
    /** `'prohibits'` — DPH, public domain, construction excluded as ownership, not merely use.
     *  `'restricts'` — ZFP, vulnerable uses banned + declaració responsable required otherwise. */
    readonly severity: 'prohibits' | 'restricts';
    /** The legal citation this effect rests on (already-established basis, not re-derived here). */
    readonly citation: string;
    /** Human-readable statement of the effect, safe to render on a refusal/constraint card. */
    readonly description: string;
    /** The verbatim source feature this effect was built from — full provenance, never summarised away. */
    readonly sourceFeature: CatalunyaEspaiFluvialFeature;
}

/** WGS84 query point. */
export interface CatalunyaLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies — the resolver is unit-testable without the network. */
export interface CatalunyaFloodOverlayDeps {
    readonly fetchImpl?: typeof fetch;
    readonly pathBase?: string;
}

/**
 * Why a Catalunya flood-overlay resolution refused. CLOSED vocabulary, ⛔ none is `null`.
 */
export type CatalunyaFloodOverlayRefusalReason =
    /** Outside the loose Catalonia bbox, or not finite — nothing to query. */
    | 'out-of-catalunya'
    /** No `fetch`, the proxy could not be reached, or an upstream layer did not answer. */
    | 'endpoint-unreachable'
    /** Both ZFP and DPH answered, completely, with no polygon at this point — a real negative. */
    | 'no-flood-constraint-here';

/** Retryable ⇔ the source did not answer, mirrors `balearsRefusalIsTransient`. */
export function catalunyaFloodOverlayRefusalIsTransient(
    reason: CatalunyaFloodOverlayRefusalReason,
): boolean {
    return reason === 'endpoint-unreachable';
}

export type CatalunyaFloodOverlayResolution =
    | {
          readonly ok: true;
          /** One entry per DISTINCT feature hit, across both layers. Order: DPH first (strictest),
           * then ZFP — so a naive caller that only reads `effects[0]` gets the binding one. */
          readonly effects: readonly OverlayEffect[];
          readonly missingConstraints: readonly string[];
      }
    | {
          readonly ok: false;
          readonly reason: CatalunyaFloodOverlayRefusalReason;
          readonly detail?: string;
      };

/** The proxy payload shape this resolver expects. `null` ⇒ that layer's upstream did NOT answer;
 * `[]` ⇒ it answered, empty (property 2 — failure ≠ empty, applied per layer). */
interface CatalunyaFloodOverlayProxyBody {
    readonly zfp?: readonly unknown[] | null;
    readonly dph?: readonly unknown[] | null;
}

const DPH_CITATION =
    'RD 638/2016 (amending the RDPH), Domini Públic Hidràulic — public hydraulic domain; ' +
    'construction excluded as a matter of ownership (Ley de Aguas Art. 6 / RDPH)';
const ZFP_CITATION =
    'RD 638/2016 amending RDPH, Art. 9bis/9ter/9quater/14bis — Zona de Flux Preferent: ' +
    '"vulnerable" uses/activities significantly reducing drainage capacity are banned; other ' +
    'actions require a declaració responsable to ACA';

function describeReach(f: CatalunyaEspaiFluvialFeature, riverLabel: string): string {
    const bits: string[] = [];
    if (f.NOM_AA && f.NOM_AA.trim() !== '') bits.push(`upstream of ${f.NOM_AA.trim()}`);
    if (f.NOM_AV && f.NOM_AV.trim() !== '') bits.push(`downstream to ${f.NOM_AV.trim()}`);
    const reach = bits.length > 0 ? ` (${bits.join(', ')})` : '';
    return `${riverLabel}${reach}`;
}

function toEffect(
    f: CatalunyaEspaiFluvialFeature,
    kind: Exclude<CatalunyaFloodOverlayKind, 'ZI'>,
): OverlayEffect {
    const riverLabel = f.CODI ? `river reach ${f.CODI}` : 'an unlabelled river reach';
    const arpsi = f.ARPSI ? ` — ARPSI ${f.ARPSI} (EU Floods Directive SFRA)` : '';
    if (kind === 'DPH') {
        return {
            kind,
            severity: 'prohibits',
            citation: DPH_CITATION,
            description: `Point falls within the Domini Públic Hidràulic of ${describeReach(f, riverLabel)}${arpsi}.`,
            sourceFeature: f,
        };
    }
    return {
        kind,
        severity: 'restricts',
        citation: ZFP_CITATION,
        description: `Point falls within the Zona de Flux Preferent of ${describeReach(f, riverLabel)}${arpsi}.`,
        sourceFeature: f,
    };
}

/**
 * Resolve the Catalunya flood-overlay effects (DPH + ZFP; ZI documented as ungueried) at a WGS84
 * point, through the (proposed) same-origin `CATALUNYA_FLOOD_OVERLAY_PATH` proxy. ⛔ NEVER throws.
 *
 * P8 — emits `pryzm.overlay.resolveCatalunyaFloodOverlay`.
 */
export async function resolveCatalunyaFloodOverlay(
    point: CatalunyaLatLon | null | undefined,
    deps: CatalunyaFloodOverlayDeps = {},
): Promise<CatalunyaFloodOverlayResolution> {
    const span = tracer.startSpan('pryzm.overlay.resolveCatalunyaFloodOverlay');
    span.setAttribute('provider', 'aca-aigua-wfs');
    const done = (r: CatalunyaFloodOverlayResolution): CatalunyaFloodOverlayResolution => {
        span.setAttribute('resultFields', r.ok ? `effects:${r.effects.length}` : r.reason);
        span.setStatus({ code: SpanStatusCode.OK });
        return r;
    };
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInCatalunya(point.lat, point.lon)
        ) {
            return done({ ok: false, reason: 'out-of-catalunya' });
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            return done({
                ok: false,
                reason: 'endpoint-unreachable',
                detail: 'no fetch implementation available',
            });
        }
        const base = deps.pathBase ?? CATALUNYA_FLOOD_OVERLAY_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: CatalunyaFloodOverlayProxyBody | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                return done({
                    ok: false,
                    reason: 'endpoint-unreachable',
                    detail: `upstream status ${res?.status ?? 'n/a'}`,
                });
            }
            body = (await res.json()) as CatalunyaFloodOverlayProxyBody | null;
        } catch (fetchErr) {
            console.warn(
                '[catalunya-flood-overlay] fetch failed (non-fatal):',
                (fetchErr as Error)?.message ?? fetchErr,
            );
            return done({ ok: false, reason: 'endpoint-unreachable', detail: 'fetch threw' });
        }

        const rawZfp = body?.zfp ?? null;
        const rawDph = body?.dph ?? null;
        // Property 2 — EITHER layer not answering is `endpoint-unreachable`, never silently treated
        // as "that layer has nothing here". Only BOTH answering (even empty) reaches the real negative.
        if (rawZfp === null || rawDph === null) {
            return done({
                ok: false,
                reason: 'endpoint-unreachable',
                detail:
                    rawZfp === null && rawDph === null
                        ? 'neither ZFP nor DPH answered'
                        : rawZfp === null
                          ? 'ZFP did not answer'
                          : 'DPH did not answer',
            });
        }

        const dphFeatures = readCatalunyaEspaiFluvialFeatureCollection(rawDph);
        const zfpFeatures = readCatalunyaEspaiFluvialFeatureCollection(rawZfp);

        if (dphFeatures.length === 0 && zfpFeatures.length === 0) {
            return done({ ok: false, reason: 'no-flood-constraint-here' });
        }

        // DPH first — it is the strictest category, so a caller reading only the head of the list
        // sees the binding constraint rather than the broader ZFP corridor.
        const effects: OverlayEffect[] = [
            ...dphFeatures.map((f) => toEffect(f, 'DPH')),
            ...zfpFeatures.map((f) => toEffect(f, 'ZFP')),
        ];

        span.setAttribute('dphHits', dphFeatures.length);
        span.setAttribute('zfpHits', zfpFeatures.length);
        return done({
            ok: true,
            effects,
            missingConstraints: CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS,
        });
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn(
            '[catalunya-flood-overlay] unexpected error (non-fatal):',
            (err as Error)?.message ?? err,
        );
        return { ok: false, reason: 'endpoint-unreachable', detail: 'unexpected error' };
    } finally {
        span.end();
    }
}
