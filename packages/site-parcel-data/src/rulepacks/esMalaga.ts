// ── MÁLAGA (INE 29067) — THE ORDINANCE-COMPLETE / GEOMETRY-BLOCKED JURISDICTION. ─────────────
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT A MÁLAGA PARCEL TODAY (measured 2026-08-05)
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CAN (VERIFIED this pass):
//   • the full NORMATIVE ZONE UNIVERSE and, for a real subset of it, article-cited numeric
//     envelope parameters — transcribed verbatim via `pdftotext` from Documento C ("Normas
//     urbanísticas y ordenanzas"), Título XII, **Actualización FEBRERO 2018** — the binding
//     consolidated text, fetched live this pass from `urbanismo.malaga.eu` (see `MALAGA_DOC_C_SRC`).
//
// CANNOT: attach ANY of it to a real parcel. There is no zone-identity resolver for Málaga and
// none can be built today — the ONLY municipal layer carrying calificación geometry
// (`muralPGOU:POLCALIF_T`) is behind an authority-side Oracle account lock. This is the INVERSE of
// Sevilla's opening position: Sevilla had live zone identity and zero transcribed parameters;
// Málaga now has richly transcribed parameters and zero zone identity.
//
// ⚠⚠ WHY THERE IS NO `resolveMalagaZone.ts` — AND WHY THAT IS A FINDING, NOT AN OMISSION.
// Three independent passes (2026-08-03, 2026-08-04, and THIS one) have each searched for a
// queryable zoning-geometry endpoint and each found none. This pass re-verified the block LIVE and
// additionally closed four founder-supplied leads that had not been tested before:
//   1. `sig.malaga.eu/geoserver/wfs` — `GetCapabilities` HTTP 200, 43 feature types, of which
//      exactly EIGHT are `muralPGOU:*` (`POLCALIF_T` calificación, `LINALIN_T` alineaciones,
//      `TEXTOPON_T`, `EXPTOPO_V`, `EXPCONSULTA_V`, `DENOMPGOUAPR_V`, `DENOMPGOUEXP_V`,
//      `DENOMPGOUTRM_V`). `GetFeature` on `POLCALIF_T` returns HTTP 200 carrying an
//      `ows:ExceptionReport`: "Cannot create PoolableConnectionFactory (ORA-28000: la cuenta está
//      bloqueada)". `DescribeFeatureType` returns a well-formed `xsd:schema` with ZERO element
//      declarations — GeoServer cannot introspect the table either, because the SAME database
//      connection is down. NO OTHER feature type in the 43 carries zoning.
//   2. Open data (`datosabiertos.malaga.eu`, CKAN API) — the founder's specifically-named "Sistema
//      de Información Cartográfica – Edificación" IS real, IS downloadable in GeoJSON/SHP/KML/GML/
//      CSV in both EPSG:25830 and EPSG:4326, exactly as described. It is NOT zoning. Its schema is
//      `FID, ID_EDIFICACION, SDOLINEA` — a LINESTRING and an id, nothing else. Its sibling
//      `…-Parcela` carries `ID_PARCELA, REFCATASTRAL, CATASTRAL, INSCRIPREGIS, ALTEDIFICA,
//      FECCONSTRUC, USO` — cadastral/topographic base cartography with a SURVEYED built-floor count
//      (`ALTEDIFICA`) and an actual-use code (`USO`), NEITHER of which is a planning calificación
//      (§GETCAPABILITIES-IS-NOT-AN-INVENTORY: surveyed ≠ normative — reading `ALTEDIFICA` as a
//      permitted height would be exactly the L-616 fabrication this pack exists to prevent). Live
//      CKAN `package_search` this pass: `planeamiento` → 0 results, `calificacion` → 0,
//      `pgou` → 0. There is no zoning dataset in the catalogue.
//   3. Geoportal / viewer surfaces — `geoportal.malaga.eu` 301-redirects to `callejero.malaga.eu`
//      (the street-directory viewer); its page bundles (`init.bundle.js`, `checks.bundle.js`) were
//      fetched and grepped and contain NO WMS/WFS/WMTS/ArcGIS-REST URL at all.
//      `sig.malaga.eu/arcgis/rest/services?f=json` → HTTP 404 (there is no ArcGIS REST instance —
//      so, unlike Sevilla, `providers/containers/arcgisRest.ts` has nothing to point at).
//   4. "Nuevo planeamiento" / PGOM (`urbanismo.malaga.eu/normativa-y-planeamiento/informacion-pgom/`)
//      and the wider planning tree — fetched live; documents only, no map service referenced.
// ⇒ The founder's working premise that Málaga's official planning GIS is "strong" does NOT hold:
//   the planning GIS EXISTS and is well-modelled (it even publishes the region's only municipal
//   ALIGNMENT layer by name) but it is not READABLE. That is an external, human-owned unlock.
//
// ⇒ THE HONEST OUTPUT REMAINS A CITED REFUSAL FOR EVERY MÁLAGA PARCEL — for TWO independent
// reasons, either one alone sufficient: (a) `MALAGA_ENVELOPE_VERIFIED` is `false` and must stay
// `false` until a human signs a transcribed pack (L-449 — the flip is a legal act, and it is the
// founder's; an implementer may not perform it), and (b) even were it signed, no resolver can say
// WHICH of the 38 zone codes below governs a given parcel. This pack is therefore authored
// DELIBERATELY BEHIND A CLOSED GATE AND AHEAD OF ITS OWN GEOMETRY — the same "packed first, signed
// later" order Sevilla's own history followed.
//
// ⚠⚠ HOW THE ZONE UNIVERSE WAS DERIVED — AND HOW IT DIFFERS FROM SEVILLA'S.
// Sevilla's `SEVILLA_PGOU_ZONE_CODES` came from the live `zona_orden` field of a working ArcGIS
// layer. That route is CLOSED here, so this pack derives the universe from the BINDING TEXT
// instead: Art. 12.1.1 ("Zonas") enumerates the twelve top-level zones of Suelo Urbano, and each
// zone's own chapter (Caps. III–XV) declares its subzones by article. This is a legitimate — and
// for a legal question arguably STRONGER — derivation than a GIS attribute, but it is a DIFFERENT
// one, and it carries a different risk: a code in force on the ground but absent from the
// ordinance text would be invisible to it, and no live-service cross-check is available to catch
// that. Stated plainly rather than papered over. Full record:
// docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/MALAGA-ENGINE-PROGRESS-2026-08-05.md
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md,
// findings/CAPABILITY-AUDIT-2026-08-04.md, findings/MALAGA-ENGINE-PROGRESS-2026-08-05.md,
// C58 §1.2/§1.4/§1.6/§1.7a, C63, L-449, L-616, §CONTEXT-DATA-HONESTY, ADR-0287/ADR-0288,
// `esSevilla.ts` (the structural-refusal ring precedent), `esCordobaPGOU2001.ts`
// (`kind:'alignment'` — the shape UAD/CTP below reuse verbatim).

import type { EnvelopeRefusal } from '@pryzm/schemas';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const MALAGA_JURISDICTION_ID = 'es-29067-malaga';

/**
 * ⛔ **`false`, and it MUST default `false`.** Founder-only act (L-449), the same discipline
 * `CORDOBA_ENVELOPE_VERIFIED` / `SEVILLA_ENVELOPE_VERIFIED` carry.
 *
 * ⚠ Málaga is additionally gated by PHYSICS, not just by policy: even a signature would publish
 * nothing today, because no resolver can map a parcel to a zone code (see the module header).
 * That makes this flag SAFE to leave alone but NOT safe to flip casually — flipping it would
 * silently authorise publication the moment a future resolver lands, without a second review.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (MALAGA_ENVELOPE_VERIFIED)`
 * compute branch stays a real runtime check rather than something a future edit narrows to dead
 * code — the same reasoning `esCordobaZoneClassification.ts` documents for its own gate.)
 */
export const MALAGA_ENVELOPE_VERIFIED: boolean = false;

const MALAGA_AUDIT_REF =
    'docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/' +
    'FORENSIC-BLOCKER-AUDIT-2026-08-03.md';

/** The instrument every Málaga citation below resolves to. */
export const MALAGA_PGOU_INSTRUMENT_REF =
    'PGOU de Málaga, Aprobación Definitiva julio 2011 (Texto Refundido), Gerencia Municipal de ' +
    'Urbanismo, Ayuntamiento de Málaga — Documento C "Normas urbanísticas y ordenanzas", ' +
    'Actualización FEBRERO 2018.';

/**
 * The exact document every `ordinanceRef` below cites, fetched LIVE this pass. ⚠ Note the version:
 * the 2011 `pgou_ap2/pgou_ad1/Documento C…` tree is still served, but `urbanismo.malaga.eu`
 * publishes a SEPARATE, LATER consolidation ("Documento C. 2018") whose Título XII pages are
 * footed "Normas Urbanísticas. Ordenanzas. Título XII. Febrero 2018". THIS pack reads the FEB-2018
 * consolidation, not the 2011 originals — using the older tree would risk transcribing superseded
 * figures. Both were downloaded; only the 2018 one was transcribed.
 */
export const MALAGA_DOC_C_SRC =
    'PGOU de Málaga (Texto Refundido), Documento C "Normas urbanísticas y ordenanzas", Título XII ' +
    '"Normas generales de edificación", Actualización FEBRERO 2018 — downloaded live 2026-08-05 ' +
    'from https://urbanismo.malaga.eu/export/sites/urbanismo/.galleries/Documento-C.-Ordenanzas/' +
    '12-TITULO-XII.pdf (natively text-extractable, read verbatim via pdftotext -enc UTF-8). Local ' +
    'copy: docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/corpus/' +
    'NormasUrbanisticas/AD-FEB2018/12-TITULO-XII.pdf.';

/**
 * The roadmap line, stated once — the same role as `SEVILLA_ROADMAP_LINE`: a refusal card must say
 * what would change the answer, or a coverage gap reads as a crash.
 */
export const MALAGA_ROADMAP_LINE =
    'Málaga (INE 29067) coverage today is the exact INVERSE of a normal coverage gap: the ' +
    'ORDINANCE half is done — PRYZM has transcribed the binding Documento C (Normas urbanísticas ' +
    'y ordenanzas, Título XII, Feb-2018 consolidation), covering all 38 zone/subzone codes the ' +
    'plan declares, with article-cited setbacks, buildable depth, coverage, floor-area ratio and ' +
    'height for the zones that state them flatly. The ZONE-IDENTITY half is blocked: the only ' +
    'municipal layer carrying calificación geometry (muralPGOU:POLCALIF_T on the city GeoServer) ' +
    'fails with an Oracle account-lock error on the authority\'s own server, and no alternative ' +
    'source exists — the city open-data catalogue publishes cadastral and street cartography but ' +
    'returns zero results for every zoning search term, and there is no ArcGIS REST instance. So ' +
    'PRYZM cannot yet say WHICH zone governs a given Málaga parcel, and will publish no buildable ' +
    'figure until it can — never an estimate, never a figure borrowed from a similar-sounding ' +
    'zone. Unblocking is external and human: the Ayuntamiento (or its GIS operator) restoring ' +
    'that database account, after which the transcribed pack below needs only a resolver and a ' +
    'founder signature.';

/** A cited "not yet dispatchable" refusal, naming the SPECIFIC authority-side access block. */
export function malagaResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Málaga',
        rootBlocker:
            'PRYZM HAS now transcribed the binding ordinance (Documento C, Normas urbanísticas y ' +
            'ordenanzas, Título XII, Feb-2018 consolidation) for all 38 zone codes the plan ' +
            'declares — but it still cannot tell you which of them governs THIS parcel. The only ' +
            'municipal layer carrying calificación geometry (`muralPGOU:POLCALIF_T`) is reachable ' +
            'at the service level yet every read fails with an Oracle database account-lock error ' +
            'on the authority\'s own server, confirmed again on 2026-08-05; the city open-data ' +
            'catalogue carries cadastral and street cartography but no zoning dataset; and there ' +
            'is no ArcGIS REST instance to fall back on. Zone identity, not ordinance text, is ' +
            'the blocker.',
        auditRef: MALAGA_AUDIT_REF,
    });
}

/** Every packed field below is `ordinance-pdf` (C58 §1.6) — read verbatim from Documento C. */
export const MALAGA_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/**
 * The pack's declared ceiling. `estimated-ruleset` — an agent read the ordinance text directly
 * (not a published-structured feed, which would be `structured`; not an unchecked OCR pipeline
 * read, which would be the weaker `pipeline-extracted-unverified`). Mirrors
 * `SEVILLA_PACK_DEFAULT_CONFIDENCE`.
 */
export const MALAGA_PACK_DEFAULT_CONFIDENCE = 'estimated-ruleset' as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-616 STRUCTURAL-REFUSAL HANDLES — nine of them, one per unresolved MECHANISM (not per zone).
//
// Every ring below exists for the same reason `SEVILLA_SB_FONDO_UNRESOLVED_RING` /
// `CORDOBA_MC_FONDO_UNRESOLVED_RING` exist: with NO `geometricRule`, a `null` setback resolves to
// a 0 m inset (`ZoningRulesEngine.ts`'s `sideV = side.value ?? 0`), so a zone whose real
// constraint is unknown-but-positive would be DRAWN AS UNCONSTRAINED — overstating real,
// privately-owned land (ENVELOPE-REALISM-MATRIX mechanism A). A cited structural refusal is the
// correct answer; a full-parcel box is not, and neither is a fabricated metres figure.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * MC (Manzana Cerrada) — buildable DEPTH is explicitly declared FREE, bounded only by occupation.
 * Art. 12.5.2.4: interior alignments / profundidad máxima edificable are fixed case-by-case in
 * PERIs or Estudios de Detalle, and "en los demás casos, cuando este parámetro no venga
 * expresamente fijado, se entenderá LIBRE, con la única condición de que la ocupación del edificio
 * en planta no podrá rebasar los límites que se establecen en el apartado 5" — i.e. free depth by
 * default, capped only by Art. 12.5.2.5's percentages (planta baja 100 %, plantas altas 75 %),
 * with three further 100 %-in-all-floors exceptions (§5.1–5.3) keyed on individual parcel
 * dimensions. Front is 0 (Art. 12.5.2.3, mandatory street alignment) and side is 0 (Art. 12.5.2.6,
 * "la edificación es, en general, medianera"), so front=0 + side=0 + a free rear would draw the
 * WHOLE PARCEL. Height compounds it: Art. 12.5.3.1 fixes plantas on the Planos de Alineaciones,
 * falling back to a per-street-width table (≤7 m → PB+2/11,00 m; >7–10 → PB+3/14,60; >10–15 →
 * PB+4/18,20; >15–20 → PB+5/21,80; >20 → PB+6/25,40) — resolvable only with measured street
 * geometry PRYZM does not hold for Málaga (Córdoba solved the analogous table from Catastro block
 * geometry under ADR-0287; that machinery is NOT wired here and wiring it is a separate decision).
 */
export const MALAGA_MC_FONDO_UNRESOLVED_RING =
    'malaga-mc-fondo:UNRESOLVED/pgou2011-12.5.2.4-free-depth+12.5.2.5-occupation-only' as const;

/**
 * OA (Ordenación Abierta) — separations are measured from the ROAD AXIS and scale with HEIGHT.
 * Art. 12.6.3.4.1 tabulates the front constraint as a minimum distance to the *eje del vial* (road
 * CENTRELINE), not to the parcel boundary — 6 m for PB…PB+3, 7,50 m at PB+4, 10 m at PB+5, 12,50 m
 * at PB+6 — with a separate absolute floor of 3 m to the public vial. A centreline-referenced
 * figure cannot be converted to a boundary inset without the road's half-width, which this pack
 * does not carry (§MURCIA-PGOU-EJES: a road AXIS is not an alignment, and treating one as the
 * other is a catalogued defect in this repo). Art. 12.6.3.4.2 then sets side separation at 1/4 of
 * total building height (min 3 m if separated at all; ground floors may abut), and 12.6.3.4.3 sets
 * inter-block separation at 1/2 the taller building's height — both height-dependent, and height
 * is itself per-plano (Art. 12.6.4.4). OA-2 is weaker still: Art. 12.6.4.2 states NO edificabilidad
 * index at all ("no se establece para esta subzona índice de edificabilidad neta específica") and
 * Art. 12.6.4.3 bounds occupation against a footprint "delimitada por las alineaciones reflejadas
 * en los planos" — a graphic outline, not a metres figure.
 */
export const MALAGA_OA_SEPARACION_UNRESOLVED_RING =
    'malaga-oa-separacion:UNRESOLVED/pgou2011-12.6.3.4-axis-referenced+height-dependent' as const;

/**
 * CJ (Ciudad Jardín) — side/rear separation is HEIGHT-DEPENDENT, exactly Sevilla CJ's shape.
 * Art. 12.7.3.5: "la separación a linderos privados será como mínimo de 1/2 de la altura EN CADA
 * PUNTO del edificio, con un mínimo absoluto de 3 metros" — a sloping envelope keyed to the
 * building's own massing, not a flat inset. Unlike Sevilla's CJ the FRONT here IS resolvable
 * (Art. 12.7.3.4 tabulates it against the subzone's own known altura: PB+1/PB+2 → 3 m, PB+3 → 4 m,
 * PB+4 → 5 m) and is packed per-subzone below; the side/rear axes are not. Collapsing `h/2` to the
 * value at maximum height would be a PRYZM-CONSTRUCTED figure, not the ordinance's — and would
 * over-constrain every building shorter than the cap. `null`, not a guess.
 */
export const MALAGA_CJ_LINDEROS_UNRESOLVED_RING =
    'malaga-cj-linderos:UNRESOLVED/pgou2011-12.7.3.5-height-half-separation' as const;

/**
 * CH / Ciudad Histórica (subzonas C-1…C-4) — the PGOU expressly DELEGATES these to subordinate
 * instruments. Art. 12.4.1 declares each subzone's governing plan "expresamente vigente": C-1
 * Centro Histórico → PEPRI Centro; C-2 Perchel Alto → PERI-C.2 (PGOU 1983); C-3 Trinidad Perchel →
 * PERI Trinidad-Perchel; C-4 → PEPRI Perchel Sur. Título XII then only SUBSTITUTES named articles
 * of those plans (Art. 12.4.2 replaces PEPRI arts. 8/13/14 and PERI arts. 5/10/11; Art. 12.4.3
 * replaces PEPRI art. 7 "excepto listados de alturas por calles" and art. 22.bis; Art. 12.4.4
 * replaces the profundidad/ocupación articles). The operative per-parcel numbers therefore live in
 * FOUR separate instruments PRYZM does not hold, and Art. 12.4.3 explicitly leaves the per-street
 * height listings inside the PEPRI. Compounding this, the municipality's own PEPRI Centro GIS
 * viewer is independently offline ("visor cerrado temporalmente"), so even the delegated
 * instrument's geometry is unreachable through its intended channel.
 */
export const MALAGA_CH_PEPRI_UNRESOLVED_RING =
    'malaga-ch-pepri:UNRESOLVED/pgou2011-12.4.1-delegated-to-pepri-peri-instruments' as const;

/**
 * EP (Edificios Protegidos) — Capítulo Tercero is a PER-BUILDING protection regime, not a zone
 * ordinance. It grades individual catalogued buildings and governs what may be done TO each one;
 * it states no zone-wide setback, depth, coverage or height, because the answer for a protected
 * building is its own catalogue entry. There is no number here to pack and none to refuse a
 * geometry against — the honest output is a refusal that names the catalogue as the governing
 * instrument.
 */
export const MALAGA_EP_CATALOGO_UNRESOLVED_RING =
    'malaga-ep-catalogo:UNRESOLVED/pgou2011-cap-III-per-building-catalogue' as const;

/**
 * PROD (Uso Productivo, all eight subzones) — every subzone's footprint is conditional, each in a
 * different way, and NONE collapses to a flat triple:
 *  • PROD-1a (Art. 12.11.4.5): front retranqueo 12 m from the alineación oficial, BUT "en todo
 *    caso… el retranqueo mínimo efectivo deberá calcularse a partir del estándar mínimo de
 *    superficie destinada al aparcamiento" (Art. 12.2.41) — the stated 12 m is a floor that grows
 *    with the building's own parking demand. Laterals may abut. No rear rule is stated at all.
 *  • PROD-1b "minipolígonos" (Arts. 12.11.4.1.2/2/5): expressly "se regulará mediante Estudio de
 *    Detalle" — occupation may reach 100 %, separations deferred entirely.
 *  • PROD-2 (Art. 12.11.5.5.2): applies only to "parcelas no adosadas" (adosada is a permitted
 *    alternative), and its front is ROAD-CLASS-branched — "≥5 metros si es viario local y ≥10
 *    metros si es sistema general o viario estructurante" — a classification this pack cannot
 *    resolve without the municipal road hierarchy.
 *  • PROD-3.A (Art. 12.11.6): new building requires a prior Plan Especial; edificabilidad and
 *    ocupación are expressly "condicionadas" to requirements resolved in it.
 *  • PROD-3.B (Art. 12.11.7.5): laterals H/2 with a 5 m floor, public open space H/2 —
 *    height-dependent, and Art. 12.11.7.2 states occupation only as a functional requirement
 *    (parking/loading must fit) rather than a percentage.
 *  • PROD-4 (Art. 12.11.8.1.5): a CONTAINER for three different industry types with different
 *    numbers (IND-1 FAR 1,5 / ocupación PB 100 % PA 40 % / 12 m; IND-2 FAR 1,16 / 60 % / 15 m;
 *    IND-3 FAR 1,5 / PB 100 % PA 40 % / 15 m) — and each type's separations are themselves
 *    context-branched (IND-1: medianera-if-in-medianera-fabric else free; IND-2: 10 m to viario
 *    principal / 5 m to calles secundarias, 5 m private unless the fabric is medianera; IND-3:
 *    deferred to the polígono's own historic regime or to each Plan Parcial).
 *  • PROD-4.B / PROD-5 (Arts. 12.11.8/12.11.9): PROD-4.B borrows PROD-3.B's parameters for
 *    consolidated-enclave renewal; PROD-5 expressly borrows the massing of OTHER zone ordinances
 *    ("manzana cerrada, bloque abierto, ciudad jardín, reguladas por otras ordenanzas de zona"),
 *    so its footprint is whatever the borrowed ordinance says — which for MC/OA/CJ is itself
 *    unresolved above.
 */
export const MALAGA_PROD_SEPARACION_UNRESOLVED_RING =
    'malaga-prod-separacion:UNRESOLVED/pgou2011-12.11-parking-standard+road-class+ED-conditional' as const;

/**
 * CO (Comercial) and GSM (Gran Superficie Minorista) — both are LAND-CLASS-BRANCHED, and the
 * branch cannot be taken without knowing the parcel's suelo classification.
 * Arts. 12.12.2.1 / 12.15.2.1 (suelo urbano CONSOLIDADO): "los parámetros reguladores de la
 * edificación serán LOS MISMOS QUE LOS DE LAS ORDENANZAS DE LAS PARCELAS COLINDANTES" — the
 * parameters are literally the neighbours', with a most-restrictive rule when neighbours differ,
 * and heights overridden by the Planos de Alturas. A neighbour-derived rule is not a zone rule and
 * cannot be packed as one.
 * Arts. 12.12.2.2 / 12.15.2.2 (suelo urbanizable and urbano NO consolidado) DO state a complete
 * flat triple — CO: FAR 1 m²t/m²s, ocupación PB 70 % / PA 50 %, altura 9 m y dos plantas,
 * separación ≥5 m a linderos públicos y privados; GSM: FAR 0,85 (urbano) / 0,70 (urbanizable),
 * ocupación 80 % (urbano) / 60 % (urbanizable), altura 12 m y dos plantas, separación ≥5 m — but
 * packing those as THE zone answer would silently apply the urbanizable regime to consolidated
 * urban parcels, which is the majority case in the city core and the wrong answer there. Both
 * branches are cited in `ordinanceRef` below; neither is packed as a scalar.
 */
export const MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING =
    'malaga-terciario-clase-suelo:UNRESOLVED/pgou2011-12.12.2+12.15.2-land-class-branched' as const;

/**
 * H (Hotelera) — THE ORDINANCE ITSELF DECLINES TO STATE PARAMETERS. Art. 12.13.2, verbatim: "Dada
 * la diversidad tipológica de los hoteles existentes y los variados tamaños de parcelas sobre los
 * que se han desarrollado, NO ES POSIBLE UNA TIPIFICACIÓN de los diversos parámetros edificatorios
 * que los definen. Por ello en cada caso se respetará la parcela, uso y edificabilidad de la
 * edificación EXISTENTE a la aprobación inicial del presente Plan General." For new building it
 * defers to whichever ordinance governs the surrounding zone. This is the cleanest refusal in the
 * pack: PRYZM is not failing to find a number, the plan declines to set one.
 */
export const MALAGA_HOTEL_SIN_TIPIFICACION_RING =
    'malaga-hotel:UNRESOLVED/pgou2011-12.13.2-ordinance-declines-typification' as const;

/**
 * E / S / D / SC (Equipamiento) — parameters are the SURROUNDING zone's, and the only figures the
 * chapter does state are MINIMA, not maxima. Art. 12.14.2.2: parcels so qualified in suelo urbano
 * "tendrán las condiciones edificatorias de la ZONA EN QUE SE ENCUENTREN, en lo que a
 * edificabilidad, alturas y separación a linderos se refiere"; the 0,50 m²t/m²s (educativo y
 * deportivo) and 1 m²t/m²s (resto de usos) figures are expressly floors that "prevalecerán COMO
 * MÍNIMOS sobre aquellos". Packing a stated MINIMUM into `plotRatioFAR` — a MAXIMUM slot — would
 * invert the constraint's direction, a strictly worse error than leaving it null. Art. 12.14.2.2
 * also allows any parameter to be varied by Estudio de Detalle "por razones de interés público".
 */
export const MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING =
    'malaga-equip-entorno:UNRESOLVED/pgou2011-12.14.2-surrounding-zone+minima-not-maxima' as const;

/**
 * The Málaga rule pack. THIRTY-EIGHT zone/subzone codes — the complete universe Documento C
 * declares (Art. 12.1.1 plus each chapter's own subzone article), of which NINE ship a REAL,
 * article-cited buildable footprint and TWENTY-NINE ship a cited STRUCTURAL REFUSAL.
 *
 * REAL FOOTPRINTS (9): `UAS-1`…`UAS-5` (Cap. VIII, Arts. 12.8.1–12.8.5 — flat per-subzone
 * separations to BOTH public and private linderos, flat FAR, flat occupation, one zone-wide
 * height); `UAD-1`/`UAD-2` (Cap. IX, Arts. 12.9.1–12.9.6 — flat front retranqueo, party-wall
 * laterals, flat rear separation AND an explicit "profundidad máxima edificable" in metres);
 * `CTP-1`/`CTP-2` (Cap. X, Arts. 12.10.1–12.10.6 — mandatory street alignment, medianera laterals,
 * and a flat 15 m profundidad máxima edificable). The last two families carry
 * `geometricRule.kind:'alignment'` — Córdoba's UAD/CTP-1 shape, reused verbatim, because the
 * ordinance measures depth FROM THE ALIGNMENT and a rear setback is not an interchangeable
 * substitute (see `esCordobaPGOU2001.ts`'s note on `depthBandClip.ts`).
 *
 * STRUCTURAL REFUSALS (29): `EP`; `C-1`…`C-4`; `MC`; `OA-1`/`OA-2`; `CJ-1`…`CJ-4` (6 incl. the
 * `-1A`/`-2A` variants the ordinance itself names); `PROD-1A`…`PROD-5` (8); `CO`; `H`;
 * `E`/`S`/`D`/`SC`; `GSM` — each against one of the nine mechanism rings above.
 *
 * ⚠ NOTHING IN THIS PACK IS REACHABLE TODAY. There is no `resolveMalagaZone.ts` and none can be
 * written until the municipal calificación layer is readable (module header). The pack is authored
 * ahead of its geometry deliberately, so that the day the lock clears the remaining work is a
 * resolver and a signature — not a fresh ordinance read.
 *
 * `source:'manual'` — a curated artefact (agent-transcribed PDF read), not a pipeline output.
 * `crs:'EPSG:25830'` — the CONFIRMED native CRS of the municipal planning layers (36 of the 43
 * advertised feature types, including all 8 `muralPGOU:*`, declare EPSG:25830).
 * `defaultConfidence: MALAGA_PACK_DEFAULT_CONFIDENCE` (`estimated-ruleset`) — the honest ceiling
 * for an agent-read, ordinance-cited pack. `MALAGA_ENVELOPE_VERIFIED` is the separate,
 * permanently-`false`-until-signed publication gate; this tier says nothing about whether a number
 * may ever reach a consumer.
 */
export const ES_MALAGA_PGOU_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: MALAGA_JURISDICTION_ID,
    displayName: 'Málaga — PGOU 2011 (Texto Refundido, Normas urbanísticas Feb-2018)',
    source: 'manual',
    crs: 'EPSG:25830',
    lastReviewed: '2026-08-05',
    defaultConfidence: MALAGA_PACK_DEFAULT_CONFIDENCE,
    zones: [
        // ══════════════════════════════════════════════════════════════════════════════════════
        // REAL FOOTPRINTS — UAS (Cap. VIII), UAD (Cap. IX), CTP (Cap. X).
        // ══════════════════════════════════════════════════════════════════════════════════════

        // ── UAS (Vivienda Unifamiliar Aislada) — Cap. VIII, Arts. 12.8.1–12.8.5 ───────────────
        //
        // WHY UAS IS A REAL FOOTPRINT AND CJ IS NOT, despite both being detached-housing zones:
        // Art. 12.8.4.1 tabulates the separation to the PUBLIC lindero as a flat metres figure per
        // subzone, and Art. 12.8.4.2 then states — in one sentence, with no branch — that "la
        // separación mínima a LOS DEMÁS LINDEROS se regulará EN LOS MISMOS TÉRMINOS que el
        // apartado anterior", i.e. side and rear take the SAME flat figure. Nothing is
        // height-dependent, occupation-driven or graphic. CJ's Art. 12.7.3.5, by contrast, makes
        // side/rear `h/2`.
        //
        // ⚠ THE `(1)` ARCO SOLAR FOOTNOTES IN THIS CHAPTER ARE NOT PACKED, AND THAT IS CORRECT.
        // Arts. 12.8.4.1/12.8.4.2 carry footnoted solar-access variants (≥6 m to a private lindero
        // in ARCOS SOLARES I/III, ≥12 m between facing facades, a 1,7×-height rule). Every one of
        // them is marked with the chapter's standing footnote: "Disposición derivada de la
        // aplicación del título VIII 'Medidas de Ahorro Energético y Calidad Medioambiental' DE
        // APLICACIÓN EN SUELO URBANIZABLE Y CON CARÁCTER DE RECOMENDACIÓN EN SUELO URBANO." They
        // are RECOMMENDATIONS on urban land, not binding minima, and they are orientation-dependent
        // (which facade sits in which solar arc) — packing them would both overstate their legal
        // force and require per-building orientation this pack does not hold.
        //
        // ⚠ THE SMALL-PARCEL AND MUTUAL-AGREEMENT EXCEPTIONS ARE ALSO NOT PACKED. Art. 12.8.3.2.3
        // (UAS-1 parcels <200 m² predating the 1997 plan: 100 m² minimum, 60 % occupation, party-
        // wall by neighbour agreement), 12.8.3.2.4 (pre-1983 parcels exempt from minimum
        // dimensions) and 12.8.4.2.1/2.2 (two dwellings may abut by notarised agreement; abutment
        // permitted against a durable pre-existing party wall) all RELAX the base rule for
        // individually-qualifying parcels. Packing the base rule under-states those parcels — the
        // safe direction (Córdoba CTP-1's convention) — whereas packing an exception would
        // over-state every parcel that does not qualify.
        {
            code: 'UAS-1',
            label: 'Vivienda Unifamiliar Aislada, Subzona UAS-1 (PGOU Málaga, Cap. VIII, Arts. 12.8.1–12.8.5)',
            // Art. 12.8.5.1: "Uso pormenorizado: Residencial, en sus variantes unifamiliar y
            // bifamiliar." Compatible/alternative uses (empresarial, terciario, equipamiento) are
            // cited in ordinanceRef but not packed as the zone's own use.
            permittedUse: ['residential'],
            // Art. 12.8.4.3: "Para TODAS las Subzonas, la altura máxima permitida será PB+1, con
            // un total de 7 metros" — one flat figure for the whole zone, measured per Arts.
            // 12.2.24/12.2.25.2. PB+1 = 2 habitable floors above ground.
            maxHeight_m: 7,
            maxFloors: 2,
            // Art. 12.8.3.1 — edificabilidad neta sobre parcela neta, per subzone.
            plotRatioFAR: 0.6,
            // Art. 12.8.3.3 — porcentaje de ocupación máxima de la parcela, per subzone.
            maxCoverage: 0.5,
            setbacks: {
                // Art. 12.8.4.1 — separación mínima al lindero que da frente al vial.
                front_m: 2,
                // Art. 12.8.4.2 — "los demás linderos… en los mismos términos que el apartado
                // anterior", so side and rear both take the front's figure.
                side_m: 2,
                rear_m: 2,
            },
            // No `geometricRule`: UAS states no profundidad edificable, and it does not need one —
            // all three edges carry a POSITIVE inset, so the legacy `kind:'setback'` path yields a
            // bounded footprint with no full-parcel risk (the L-616 mechanism-A hazard requires a
            // 0/0/unbounded combination, which UAS never has).
            geometricRule: null,
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.8.3.1 (edificabilidad neta UAS-1 0,60 m²t/m²s), Art. 12.8.3.3 ' +
                '(ocupación máxima UAS-1 50 %), Art. 12.8.4.1 (separación mínima al lindero ' +
                'público 2 m), Art. 12.8.4.2 (separación a los demás linderos "en los mismos ' +
                'términos" → 2 m), Art. 12.8.4.3 (altura máxima PB+1, 7 m, todas las subzonas), ' +
                'Art. 12.8.5 (usos: pormenorizado residencial unifamiliar/bifamiliar; compatibles ' +
                'empresarial, servicios terciarios, equipamiento comunitario, aparcamientos, ' +
                'servicios técnicos). NOT packed: Art. 12.8.3.2.1 (parcela mínima 200 m²), ' +
                'Art. 12.8.3.2.3 (régimen excepcional para parcelas <200 m² anteriores al PGOU ' +
                '1997: 100 m², ocupación 60 %, medianería por acuerdo), Art. 12.8.4.2.1/2.2 ' +
                '(adosamiento por acuerdo notarial), y las variantes ARCO SOLAR de los apartados ' +
                '12.8.4.1/12.8.4.2 (recomendación en suelo urbano, no vinculante). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'UAS-2',
            label: 'Vivienda Unifamiliar Aislada, Subzona UAS-2 (PGOU Málaga, Cap. VIII, Arts. 12.8.1–12.8.5)',
            permittedUse: ['residential'],
            maxHeight_m: 7,
            maxFloors: 2,
            plotRatioFAR: 0.37,
            maxCoverage: 0.4,
            setbacks: { front_m: 3, side_m: 3, rear_m: 3 },
            geometricRule: null,
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.8.3.1 (edificabilidad neta UAS-2 0,37 m²t/m²s), Art. 12.8.3.3 ' +
                '(ocupación máxima UAS-2 40 %), Art. 12.8.4.1 (separación mínima al lindero ' +
                'público 3 m), Art. 12.8.4.2 (demás linderos "en los mismos términos" → 3 m), ' +
                'Art. 12.8.4.3 (altura máxima PB+1, 7 m). NOT packed: Art. 12.8.3.2.1 (parcela ' +
                'mínima 350 m², fachada mínima 10 m), Art. 12.8.3.2.4 (exención dimensional para ' +
                'parcelas anteriores al PGOU 1983), variantes ARCO SOLAR (recomendación en suelo ' +
                'urbano). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'UAS-3',
            label: 'Vivienda Unifamiliar Aislada, Subzona UAS-3 (PGOU Málaga, Cap. VIII, Arts. 12.8.1–12.8.5)',
            permittedUse: ['residential'],
            maxHeight_m: 7,
            maxFloors: 2,
            plotRatioFAR: 0.3,
            maxCoverage: 0.3,
            setbacks: { front_m: 3, side_m: 3, rear_m: 3 },
            geometricRule: null,
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.8.3.1 (edificabilidad neta UAS-3 0,30 m²t/m²s), Art. 12.8.3.3 ' +
                '(ocupación máxima UAS-3 30 %), Art. 12.8.4.1 (separación mínima al lindero ' +
                'público 3 m), Art. 12.8.4.2 (demás linderos → 3 m), Art. 12.8.4.3 (altura máxima ' +
                'PB+1, 7 m). NOT packed: Art. 12.8.3.2.1 (parcela mínima 600 m², fachada mínima ' +
                '10 m), variantes ARCO SOLAR (recomendación en suelo urbano). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'UAS-4',
            label: 'Vivienda Unifamiliar Aislada, Subzona UAS-4 (PGOU Málaga, Cap. VIII, Arts. 12.8.1–12.8.5)',
            permittedUse: ['residential'],
            maxHeight_m: 7,
            maxFloors: 2,
            plotRatioFAR: 0.25,
            maxCoverage: 0.25,
            setbacks: { front_m: 4, side_m: 4, rear_m: 4 },
            geometricRule: null,
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.8.3.1 (edificabilidad neta UAS-4 0,25 m²t/m²s), Art. 12.8.3.3 ' +
                '(ocupación máxima UAS-4 25 %), Art. 12.8.4.1 (separación mínima al lindero ' +
                'público 4 m), Art. 12.8.4.2 (demás linderos → 4 m), Art. 12.8.4.3 (altura máxima ' +
                'PB+1, 7 m). NOT packed: Art. 12.8.3.2.1 (parcela mínima 800 m², fachada mínima ' +
                '15 m), variantes ARCO SOLAR (recomendación en suelo urbano). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'UAS-5',
            label: 'Vivienda Unifamiliar Aislada, Subzona UAS-5 (PGOU Málaga, Cap. VIII, Arts. 12.8.1–12.8.5)',
            permittedUse: ['residential'],
            maxHeight_m: 7,
            maxFloors: 2,
            plotRatioFAR: 0.2,
            maxCoverage: 0.2,
            setbacks: { front_m: 6, side_m: 6, rear_m: 6 },
            geometricRule: null,
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.8.3.1 (edificabilidad neta UAS-5 0,20 m²t/m²s), Art. 12.8.3.3 ' +
                '(ocupación máxima UAS-5 20 %), Art. 12.8.4.1 (separación mínima al lindero ' +
                'público 6 m), Art. 12.8.4.2 (demás linderos → 6 m), Art. 12.8.4.3 (altura máxima ' +
                'PB+1, 7 m). NOT packed: Art. 12.8.3.2.1 (parcela mínima 1.500 m², fachada mínima ' +
                '15 m), variantes ARCO SOLAR (recomendación en suelo urbano). ' + MALAGA_DOC_C_SRC,
        },

        // ── UAD (Vivienda Unifamiliar Adosada) — Cap. IX, Arts. 12.9.1–12.9.6 ─────────────────
        //
        // WHY `kind:'alignment'` AND NOT A DEEPER REAR SETBACK — Art. 12.9.4.3 states a
        // "profundidad máxima edificable, MEDIDA DESDE LA ALINEACIÓN DE LA VALLA A VIAL" (the
        // fence line, which Art. 12.9.4.1.2.b aligns to the vial). A depth measured from the
        // STREET is not interchangeable with a rear setback measured from the REAR boundary: on a
        // deep parcel a rear setback leaves depth unconstrained, on a shallow one it
        // over-constrains; they coincide only when parcel depth happens to equal depth + rear_m.
        // Both are packed — the rear inset because Art. 12.9.4.4 independently states one, and the
        // depth band because Art. 12.9.4.3 independently states that. This is Córdoba UAD-1/UAD-2's
        // exact shape (`esCordobaPGOU2001.ts`), reused, not reinvented.
        //
        // ⚠ SIDE = 0 IS A TYPOLOGY STATEMENT, NOT AN ABSENT RULE. Art. 12.9.1 defines the zone as
        // "ordenación ADOSADA", and Art. 12.9.4.8 regulates the CONSEQUENCE of abutment — capping
        // continuous runs at 50 m and requiring a gap of twice the public-lindero separation
        // between runs. A zone that legislates the length of its party-wall terraces is a zone
        // whose party walls are at zero separation. (The `(1)` ARCO SOLAR footnote to Art.
        // 12.9.4.4 does contemplate lateral separations, but only "siempre que la parcela linde
        // lateralmente con otros terrenos con una calificación que EXIJA separación a linderos" —
        // a neighbouring-zone condition — and carries the same non-binding-in-suelo-urbano
        // footnote as UAS's. Not packed.)
        {
            code: 'UAD-1',
            label: 'Vivienda Unifamiliar Adosada, Subzona UAD-1 (PGOU Málaga, Cap. IX, Arts. 12.9.1–12.9.6)',
            // Art. 12.9.6.1: "Uso pormenorizado: Residencial, en sus variantes Unifamiliar y
            // Bifamiliar."
            permittedUse: ['residential'],
            // Art. 12.9.4.5: "Para todas las Subzonas, la altura máxima permitida será de PB+1,
            // con un total de 7 metros" — measured per Arts. 12.2.24/12.2.25.2.
            maxHeight_m: 7,
            maxFloors: 2,
            // Art. 12.9.3.3 — edificabilidad neta.
            plotRatioFAR: 1.16,
            // Art. 12.9.3.2 — ocupación máxima de parcela.
            maxCoverage: 0.6,
            setbacks: {
                // Art. 12.9.4.2.2 — "la alineación de la fachada principal estará separada de la
                // alineación de la calle" 3 m en UAD-1, y es OBLIGATORIO mantenerla a lo largo del
                // tramo (no es un mínimo laxo).
                front_m: 3,
                // Art. 12.9.1 / 12.9.4.8 — ordenación adosada: party-wall laterals.
                side_m: 0,
                // Art. 12.9.4.4 — "la línea de fachada posterior deberá estar separada del lindero
                // medianero del fondo de parcela" 3 m en UAD-1.
                rear_m: 3,
            },
            // Art. 12.9.4.3 — profundidad máxima edificable 15 m desde la alineación de la valla a
            // vial. The `alignmentOffset_m` records the 12.9.4.2.2 retranqueo; it is NOT re-applied
            // by the solver (the `setbacks.front_m` above is the inset input — C58 §1.7a).
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 3,
                sideTreatment: 'party-wall',
                buildableDepth_m: 15,
            },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.9.2 (definición de subzonas UAD-1/UAD-2), Art. 12.9.3.2 ' +
                '(ocupación máxima UAD-1 60 %), Art. 12.9.3.3 (edificabilidad neta UAD-1 1,16 ' +
                'm²t/m²s), Art. 12.9.4.2.2 (retranqueo obligatorio de fachada principal 3 m desde ' +
                'la alineación de la calle), Art. 12.9.4.3 (profundidad máxima edificable 15 m ' +
                'medida desde la alineación de la valla a vial), Art. 12.9.4.4 (separación al ' +
                'lindero de fondo de parcela 3 m), Art. 12.9.4.5 (altura máxima PB+1, 7 m, todas ' +
                'las subzonas), Art. 12.9.1/12.9.4.8 (ordenación adosada; conjuntos máx. 50 m de ' +
                'longitud), Art. 12.9.6 (usos). NOT packed: Art. 12.9.3.1.1 (parcela mínima 100 ' +
                'm², fachada mínima 5,50 m), Art. 12.9.3.1.3 (exención para parcelas anteriores al ' +
                'PGOU 1983), Art. 12.9.4.2.3 y 12.9.4.6 (edificación en ladera >50 % pendiente), ' +
                'Art. 12.9.5 (régimen excepcional de edificación conjunta de parcelas >3.000 m² ' +
                'vía Estudio de Detalle, que EXCEPCIONA edificabilidad y ocupación por parcela y ' +
                'fija separación a linderos privados de 4 m), y las variantes ARCO SOLAR del ' +
                'apartado 12.9.4.4 (recomendación en suelo urbano, no vinculante). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'UAD-2',
            label: 'Vivienda Unifamiliar Adosada, Subzona UAD-2 (PGOU Málaga, Cap. IX, Arts. 12.9.1–12.9.6)',
            permittedUse: ['residential'],
            maxHeight_m: 7,
            maxFloors: 2,
            plotRatioFAR: 0.52,
            maxCoverage: 0.45,
            setbacks: { front_m: 4, side_m: 0, rear_m: 5 },
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 4,
                sideTreatment: 'party-wall',
                buildableDepth_m: 20,
            },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
                'setback.rear': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.9.3.2 (ocupación máxima UAD-2 45 %), Art. 12.9.3.3 ' +
                '(edificabilidad neta UAD-2 0,52 m²t/m²s), Art. 12.9.4.2.2 (retranqueo obligatorio ' +
                'de fachada principal 4 m), Art. 12.9.4.3 (profundidad máxima edificable 20 m ' +
                'desde la alineación de la valla a vial), Art. 12.9.4.4 (separación al lindero de ' +
                'fondo 5 m), Art. 12.9.4.5 (altura máxima PB+1, 7 m), Art. 12.9.1/12.9.4.8 ' +
                '(ordenación adosada). NOT packed: Art. 12.9.3.1.1 (parcela mínima 210 m², fachada ' +
                'mínima 7,0 m), Art. 12.9.5 (edificación conjunta vía Estudio de Detalle), ' +
                'variantes ARCO SOLAR (recomendación en suelo urbano). ' + MALAGA_DOC_C_SRC,
        },

        // ── CTP (Colonia y Edificación Tradicional Popular) — Cap. X, Arts. 12.10.1–12.10.6 ───
        //
        // The cleanest alignment zone in the pack: Art. 12.10.3.3 makes street alignment MANDATORY
        // ("la fachada del edificio DEBERÁ coincidir con la alineación del vial" — front 0),
        // Art. 12.10.3.6 makes the fabric medianera (side 0), and Art. 12.10.3.4 states a flat
        // "profundidad máxima edificable… 15 metros" — so the depth band, not a rear inset, is what
        // bounds the footprint. `rear_m` is left `null` deliberately: the chapter states no rear
        // separation, and inventing one would over-constrain, while the depth band already prevents
        // the full-parcel draw that would otherwise make front=0 + side=0 dangerous (L-616
        // mechanism A). This is Córdoba UAD-3's exact configuration.
        {
            code: 'CTP-1',
            label: 'Colonia y Edificación Tradicional Popular, Subzona CTP-1 (PGOU Málaga, Cap. X, Arts. 12.10.1–12.10.6)',
            // Art. 12.10.6.1: "Uso pormenorizado: Residencial."
            permittedUse: ['residential'],
            // Art. 12.10.4.1 — CTP-1: PB+1, altura máxima edificable 7,50 m (medida per Art.
            // 12.2.25.1). PB+1 = 2 habitable floors.
            maxHeight_m: 7.5,
            maxFloors: 2,
            // Art. 12.10.3.2 — índice de edificabilidad máxima CTP-1.
            plotRatioFAR: 1.8,
            // Art. 12.10.3.5 — ocupación máxima: planta baja 100 %, PLANTAS ALTAS 80 %. The 80 %
            // upper-floor cap is packed (the binding constraint on the building as a whole, and the
            // UNDER-stating direction — Córdoba CTP-1's convention); the 100 % ground-floor figure
            // is cited but not packed. The three 100 %-in-all-floors exceptions (§5, for parcels
            // with opposing street frontages and depth <10 m; parcels <70 m² whose frontage exceeds
            // their mean depth; corner parcels below minimum size or with a mean buildable depth
            // <8 m) are parcel-dimension-conditional and are NOT packed.
            maxCoverage: 0.8,
            setbacks: {
                // Art. 12.10.3.3 — alineación obligatoria a vial.
                front_m: 0,
                // Art. 12.10.3.6 — "la edificación es, en general, medianera".
                side_m: 0,
                // No rear separation is stated by this chapter; the 15 m depth band below is the
                // operative rear constraint. null = unknown, never a guessed metres figure.
                rear_m: null,
            },
            // Art. 12.10.3.4 — profundidad máxima edificable 15 m, medida desde la fachada de la
            // edificación (que por Art. 12.10.3.3 coincide con la alineación del vial), por lo que
            // `alignmentOffset_m` es 0.
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
                buildableDepth_m: 15,
            },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.10.2 (subzonas CTP-1/CTP-2 por altura edificable), Art. ' +
                '12.10.3.2 (índice de edificabilidad CTP-1 1,80 m²t/m²s), Art. 12.10.3.3 ' +
                '(alineación obligatoria a vial → front 0; doble alineación en colonias de ' +
                '"casas-mata"), Art. 12.10.3.4 (profundidad máxima edificable 15 m desde la ' +
                'fachada), Art. 12.10.3.5 (ocupación máxima PB 100 % / plantas altas 80 %), Art. ' +
                '12.10.3.6 (edificación medianera → side 0; separación mínima 2 m si se separa), ' +
                'Art. 12.10.4.1 (CTP-1: PB+1, altura máxima 7,50 m, medida per Art. 12.2.25.1), ' +
                'Art. 12.10.6 (usos: pormenorizado residencial). NOT packed: Art. 12.10.3.1 ' +
                '(parcela mínima 70 m², fachada mínima 4 m; Estudio de Detalle obligatorio en ' +
                'parcelas >800 m²), Art. 12.10.3.2 párr. 3 (índice reducido de 0,6 m²t/m²s más ' +
                'allá de la franja de 15 m en parcelas con Estudio de Detalle), las tres ' +
                'excepciones de ocupación al 100 % del Art. 12.10.3.5, y la excepción de ' +
                'profundidad >15 m por medianería preexistente del Art. 12.10.3.4 (resuelta caso ' +
                'por caso por el Ayuntamiento). ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CTP-2',
            label: 'Colonia y Edificación Tradicional Popular, Subzona CTP-2 (PGOU Málaga, Cap. X, Arts. 12.10.1–12.10.6)',
            permittedUse: ['residential'],
            // Art. 12.10.4.1 — CTP-2: PB+2, altura máxima edificable 11,00 m. PB+2 = 3 floors.
            maxHeight_m: 11,
            maxFloors: 3,
            plotRatioFAR: 2.6,
            maxCoverage: 0.8,
            setbacks: { front_m: 0, side_m: 0, rear_m: null },
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
                buildableDepth_m: 15,
            },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.10.3.2 (índice de edificabilidad CTP-2 2,60 m²t/m²s), Art. ' +
                '12.10.3.3 (alineación obligatoria a vial → front 0), Art. 12.10.3.4 (profundidad ' +
                'máxima edificable 15 m), Art. 12.10.3.5 (ocupación PB 100 % / plantas altas ' +
                '80 %), Art. 12.10.3.6 (edificación medianera → side 0), Art. 12.10.4.1 (CTP-2: ' +
                'PB+2, altura máxima 11,00 m). NOT packed: Art. 12.10.3.1 (parcela mínima 100 m², ' +
                'fachada mínima 4 m), excepciones de ocupación al 100 % y de profundidad por ' +
                'medianería preexistente. ' + MALAGA_DOC_C_SRC,
        },

        // ══════════════════════════════════════════════════════════════════════════════════════
        // STRUCTURAL REFUSALS — every zone whose footprint the ordinance does not state flatly.
        // Each carries whatever REAL, unconditional scalars its chapter DOES state (so the refusal
        // is as informative as the law allows) plus an `explicit-area` handle naming the specific
        // unresolved mechanism. None of them can draw a full-parcel box.
        // ══════════════════════════════════════════════════════════════════════════════════════

        // ── EP (Edificios Protegidos) — Cap. III ──────────────────────────────────────────────
        {
            code: 'EP',
            label: 'Edificios Protegidos (PGOU Málaga, Cap. III)',
            // A protection regime spans whatever use the catalogued building already has; asserting
            // one would be an invention. Empty, not guessed.
            permittedUse: [],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_EP_CATALOGO_UNRESOLVED_RING },
            fieldProvenance: {},
            ordinanceRef:
                'PGOU Málaga, Título XII, Capítulo Tercero "Edificios Protegidos" — régimen de ' +
                'protección POR EDIFICIO (grados de protección y obras admisibles según el ' +
                'Catálogo), no una ordenanza de zona: no establece retranqueo, profundidad, ' +
                'ocupación ni altura de ámbito zonal, porque la determinación aplicable es la ' +
                'ficha de catálogo del inmueble concreto. Art. 12.1.1 lo enumera como la primera ' +
                'de las Zonas del Suelo Urbano. Ver MALAGA_EP_CATALOGO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── CH / Ciudad Histórica (C-1…C-4) — Cap. IV, Arts. 12.4.1–12.4.7 ────────────────────
        {
            code: 'C-1',
            label: 'Ciudad Histórica, Subzona C-1 "Centro Histórico" / ámbito PEPRI Centro (PGOU Málaga, Cap. IV, Art. 12.4.1)',
            permittedUse: ['mixed'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CH_PEPRI_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.4.1.1 — Subzona C-1 "Centro Histórico": "Con ámbito idéntico ' +
                'al del PEPRI Centro, QUE SE DECLARA EXPRESAMENTE VIGENTE, salvo en lo dispuesto ' +
                'en los siguientes artículos." Los parámetros operativos (profundidad edificable, ' +
                'ocupación, alturas por calle) residen en el PEPRI Centro, instrumento que PRYZM ' +
                'no ha transcrito; Art. 12.4.3 sustituye el art. 7 del PEPRI "EXCEPTO LISTADOS DE ' +
                'ALTURAS POR CALLES", dejando expresamente la altura por vía en el PEPRI. Art. ' +
                '12.4.4 sustituye el art. 6 del PEPRI en materia de profundidad edificable, ' +
                'ocupación y patios. Art. 12.4.7 regula usos (uso pormenorizado mixto: residencial ' +
                'con comercial/terciario en planta baja). Ver ' +
                'MALAGA_CH_PEPRI_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'C-2',
            label: 'Ciudad Histórica, Subzona C-2 "Perchel Alto" / ámbito PERI-C.2 (PGOU Málaga, Cap. IV, Art. 12.4.1)',
            permittedUse: ['mixed'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CH_PEPRI_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.4.1.2 — Subzona C2 "Perchel Alto": "Proveniente del ámbito ' +
                'del PERI-C.2 del PGOU de 1983, PERI que se declara expresamente vigente, salvo ' +
                'en lo dispuesto en los siguientes artículos." Instrumento subordinado no ' +
                'transcrito por PRYZM. Ver MALAGA_CH_PEPRI_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'C-3',
            label: 'Ciudad Histórica, Subzona C-3 "Trinidad Perchel" / ámbito PERI Trinidad-Perchel (PGOU Málaga, Cap. IV, Art. 12.4.1)',
            permittedUse: ['mixed'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CH_PEPRI_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.4.1.3 — Subzona C3 "Trinidad Perchel": "Con ámbito y ' +
                'determinaciones las del PERI Trinidad-Perchel, que se declara expresamente ' +
                'vigente, salvo lo dispuesto en los siguientes artículos." Art. 12.4.2 sustituye ' +
                'sus arts. 5, 10 y 11; Art. 12.4.3 sustituye su art. 4. Instrumento subordinado no ' +
                'transcrito por PRYZM. Ver MALAGA_CH_PEPRI_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'C-4',
            label: 'Ciudad Histórica, Subzona C-4 / ámbito PEPRI Perchel Sur (PGOU Málaga, Cap. IV, Art. 12.4.1)',
            permittedUse: ['mixed'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CH_PEPRI_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.4.1.4 — "Subzona C4 - PEPRI Perchel Sur, que se declara ' +
                'expresamente vigente, salvo en lo dispuesto en los siguientes artículos." Art. ' +
                '12.4.4 sustituye el apartado 5.5º del PERI Perchel Sur en materia de profundidad ' +
                'edificable y ocupación. Instrumento subordinado no transcrito por PRYZM. Ver ' +
                'MALAGA_CH_PEPRI_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── MC (Manzana Cerrada) — Cap. V, Arts. 12.5.1–12.5.4 ────────────────────────────────
        {
            code: 'MC',
            label: 'Ordenación en Manzana Cerrada (PGOU Málaga, Cap. V, Arts. 12.5.1–12.5.4)',
            // Art. 12.5.4.1: "Uso pormenorizado: Residencial."
            permittedUse: ['residential'],
            // Art. 12.5.3.1 — number of floors is fixed on the Plano de Alineaciones, falling back
            // to a street-width table. Neither is a zone-wide scalar. null, not a guess.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.5.2.2 — edificabilidad is a TABLE keyed on the (per-parcel, per-plano) number
            // of floors: PB+2 2,50 / PB+3 3,25 / PB+4 4,00 / PB+5 4,75 / PB+6 5,50 m²t/m²s. Packing
            // one cell would publish one row's answer for the whole zone (the L-526 failure).
            plotRatioFAR: null,
            // Art. 12.5.2.5 — ocupación máxima: planta baja 100 %, PLANTAS ALTAS 75 %. The
            // upper-floor cap is flat and unconditional in the general case, so it IS packed; the
            // three 100 %-in-all-floors exceptions (§5.1–5.3) are parcel-dimension-conditional and
            // are not.
            maxCoverage: 0.75,
            setbacks: {
                // Art. 12.5.2.3 — "la fachada de edificación DEBERÁ coincidir con la alineación
                // del vial" (the permitted retranqueos of §3.1–3.4 are composition allowances, not
                // a different base rule).
                front_m: 0,
                // Art. 12.5.2.6 — "la edificación es, en general, medianera".
                side_m: 0,
                // Art. 12.5.2.4 — depth is expressly FREE where no interior alignment is drawn.
                // Not 0, not a number: unknown. See MALAGA_MC_FONDO_UNRESOLVED_RING.
                rear_m: null,
            },
            // ⚠ L-616 GUARD — front 0 + side 0 + expressly-free depth would draw the WHOLE PARCEL.
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_MC_FONDO_UNRESOLVED_RING },
            fieldProvenance: {
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
                'setback.side': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.5.1 (subzona única MC; "la altura se regula en función del ' +
                'ancho de calle, salvo cuando se especifique numéricamente en los planos"), Art. ' +
                '12.5.2.2 (edificabilidad máxima por nº de plantas: PB+2 2,50 / PB+3 3,25 / PB+4 ' +
                '4,00 / PB+5 4,75 / PB+6 5,50 m²t/m²s — NOT packed as escalar, L-526), Art. ' +
                '12.5.2.3 (alineación obligatoria a vial → front 0), Art. 12.5.2.4 (profundidad ' +
                'máxima edificable fijada en PERI/Estudio de Detalle; en los demás casos "se ' +
                'entenderá LIBRE" — NOT packed), Art. 12.5.2.5 (ocupación PB 100 % / plantas altas ' +
                '75 %, con tres excepciones al 100 % en §5.1-5.3 por dimensiones de parcela — NOT ' +
                'packed), Art. 12.5.2.6 (edificación medianera → side 0; 2 m si se separa), Art. ' +
                '12.5.3.1 (nº de plantas según Plano de Alineaciones; en su defecto tabla por ' +
                'ancho de vial: hasta 7 m PB+2/11,00 m; >7-10 m PB+3/14,60 m; >10-15 m ' +
                'PB+4/18,20 m; >15-20 m PB+5/21,80 m; >20 m PB+6/25,40 m — NOT packed, requiere ' +
                'geometría viaria medida), Art. 12.5.4 (usos). Ver ' +
                'MALAGA_MC_FONDO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── OA (Ordenación Abierta) — Cap. VI, Arts. 12.6.1–12.6.5 ────────────────────────────
        {
            code: 'OA-1',
            label: 'Ordenación Abierta, Subzona OA-1 (PGOU Málaga, Cap. VI, Arts. 12.6.1–12.6.3)',
            // Art. 12.6.5.1: "Uso pormenorizado: Residencial."
            permittedUse: ['residential'],
            // Art. 12.6.3.4 — height is the RESULT of distributing the floor area under the
            // occupation and separation rules, or is predetermined on planos/fichas. Not a scalar.
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.6.3.2 — "será de 2,20 m²t/m²s". Flat and unconditional.
            plotRatioFAR: 2.2,
            // Art. 12.6.3.3 — "65 % de su superficie EN TODAS LAS PLANTAS del edificio", for
            // occupations not predetermined by the plan itself.
            maxCoverage: 0.65,
            setbacks: {
                // Art. 12.6.3.4.1 — the table is keyed to the ROAD AXIS, not the boundary; only
                // the absolute floor ("distancia mínima a vial público de 3 metros") is a
                // boundary-referenced figure, and it is a floor beneath an axis-referenced rule,
                // not the operative constraint. Packing 3 would understate every parcel on a wide
                // road. null, not a guess. See MALAGA_OA_SEPARACION_UNRESOLVED_RING.
                front_m: null,
                // Art. 12.6.3.4.2 — "1/4 de la altura total del edificio".
                side_m: null,
                rear_m: null,
            },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_OA_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: {
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.6.2 (subzonas OA-1/OA-2), Art. 12.6.3.1 (parcela mínima ' +
                '400 m², círculo inscrito 15 m; Estudio de Detalle obligatorio >5.000 m²), Art. ' +
                '12.6.3.2 (edificabilidad neta 2,20 m²t/m²s), Art. 12.6.3.3 (ocupación máxima 65 % ' +
                'en todas las plantas; "no se permitirán viviendas interiores"), Art. 12.6.3.4.1 ' +
                '(nº máximo de plantas según distancia AL EJE DEL VIAL: PB a PB+3 6 m; PB+4 ' +
                '7,50 m; PB+5 10 m; PB+6 12,50 m; alturas 4,20/8,00/11,50/14,60/18,20/21,80/25,40 ' +
                'm; mínimo absoluto 3 m a vial público — referida al EJE, NOT packed como inset de ' +
                'lindero), Art. 12.6.3.4.2 (separación a linderos privados 1/4 de la altura total; ' +
                'plantas bajas pueden adosarse; 3 m mínimo si se separan — dependiente de altura, ' +
                'NOT packed), Art. 12.6.3.4.3 (separación entre unidades de edificación 1/2 de la ' +
                'altura del edificio más alto), Art. 12.6.5 (usos). Ver ' +
                'MALAGA_OA_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'OA-2',
            label: 'Ordenación Abierta, Subzona OA-2 (PGOU Málaga, Cap. VI, Art. 12.6.4)',
            permittedUse: ['residential'],
            maxHeight_m: null,
            maxFloors: null,
            // Art. 12.6.4.2 — expressly NO index: "No se establece para esta subzona índice de
            // edificabilidad neta específica, de forma que la superficie de techo edificable será
            // la resultante de la aplicación de las normas de composición del edificio."
            plotRatioFAR: null,
            // Art. 12.6.4.3 — ocupación máxima: planta baja 100 %, plantas altas 90 %. ⚠ Note the
            // denominator differs from OA-1's: here the percentage applies to "la HUELLA delimitada
            // por las alineaciones reflejadas en los planos", a graphic footprint, NOT to the
            // parcel. Packing 0.90 into a parcel-relative `maxCoverage` slot would therefore be a
            // DENOMINATOR SUBSTITUTION (§C63 — the denominator is the whole question), so it is
            // cited and left null.
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_OA_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.6.4.1 (parcela resultante del trazado de alineaciones; ' +
                'superficie mínima 300 m², fachada mínima 7 m, fondo mínimo 9 m), Art. 12.6.4.2 ' +
                '("NO SE ESTABLECE para esta subzona índice de edificabilidad neta específica"), ' +
                'Art. 12.6.4.3 (ocupación PB 100 % / plantas altas 90 %, aplicada sobre la HUELLA ' +
                'delimitada por las alineaciones de los planos, no sobre la parcela — NOT packed, ' +
                'denominador distinto), Art. 12.6.4.4 (nº de plantas según plano de alineaciones; ' +
                'en su defecto la tabla del Art. 12.6.3.4 referida al eje del vial), Art. 12.6.4.5 ' +
                '(separaciones a linderos y entre unidades: remite a los apartados 4.2/4.3/4.4 del ' +
                'Art. 12.6.3, dependientes de altura). Ver ' +
                'MALAGA_OA_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── CJ (Ciudad Jardín) — Cap. VII, Arts. 12.7.1–12.7.5 ────────────────────────────────
        //
        // Unlike Sevilla's CJ, the FRONT here IS resolvable per subzone: Art. 12.7.3.4 tabulates
        // the separation to the public lindero against the building's height (PB+1 3 m, PB+2 3 m,
        // PB+3 4 m, PB+4 5 m), and Art. 12.7.3.3 fixes each subzone's own altura máxima — so the
        // two tables COMPOSE to one flat front figure per subzone. That composition is a lookup,
        // not a construction: both inputs are stated numerically by the same article pair, and the
        // subzone code alone selects the row. Side/rear remain `h/2` and stay null.
        {
            code: 'CJ-1',
            label: 'Ciudad Jardín, Subzona CJ-1 (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            // Art. 12.7.4.1: "Uso pormenorizado: Residencial."
            permittedUse: ['residential'],
            // Art. 12.7.3.3 — CJ-1: altura máxima PB+2; the same article's metric table maps
            // PB+2 → "hasta 10,50" m. PB+2 = 3 habitable floors. (§3 also allows the municipality
            // to REDUCE CJ-1 to PB+1 in blocks already consolidated at that height — a discretionary
            // reduction, not packed; packing the un-reduced figure is the over-stating direction on
            // that minority of blocks, which is why CJ refuses at the footprint level regardless.)
            maxHeight_m: 10.5,
            maxFloors: 3,
            // Art. 12.7.3.1 — índice de edificabilidad neto.
            plotRatioFAR: 0.66,
            // Art. 12.7.3.3 — ocupación máxima.
            maxCoverage: 0.45,
            setbacks: {
                // Art. 12.7.3.4 — tabla de separación a linderos públicos por altura; CJ-1 es
                // PB+2 (Art. 12.7.3.3) → 3 m.
                front_m: 3,
                // Art. 12.7.3.5 — "1/2 de la altura EN CADA PUNTO del edificio, con un mínimo
                // absoluto de 3 metros". Height-dependent. See MALAGA_CJ_LINDEROS_UNRESOLVED_RING.
                side_m: null,
                rear_m: null,
            },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.2 (subzonas CJ-1, CJ-2, CJ-3, CJ-4, con variantes CJ-1a y ' +
                'CJ-2a), Art. 12.7.3.1 (edificabilidad neta CJ-1 0,66 m²t/m²s), Art. 12.7.3.2 ' +
                '(parcela mínima 300 m²), Art. 12.7.3.3 (altura máxima CJ-1 PB+2, ocupación 45 %; ' +
                'tabla plantas→metros PB 4,20 / PB+1 7,50 / PB+2 10,50 / PB+3 13,60 / PB+4 16,70 ' +
                'm; "no se permitirán viviendas interiores"; reducción municipal discrecional a ' +
                'PB+1 en zonas consolidadas — NOT packed), Art. 12.7.3.4 (separación a linderos ' +
                'públicos por altura: PB+1 3 m, PB+2 3 m, PB+3 4 m, PB+4 5 m, con excepciones para ' +
                'viales estructurantes de Planes Parciales, manzanas edificadas >50 % con ' +
                'anterioridad al Plan de 1997, y edificación en ladera del Art. 12.2.26), Art. ' +
                '12.7.3.5 (separación a linderos privados 1/2 de la altura en cada punto, mínimo ' +
                '3 m — NOT packed), Art. 12.7.3.8 (separación entre unidades de edificación igual ' +
                'a la altura de la mayor), Art. 12.7.4 (usos), Art. 12.7.5 (20 % de la parcela ' +
                'como área libre ajardinada). Ver MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CJ-1A',
            label: 'Ciudad Jardín, Subzona CJ-1a (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            permittedUse: ['residential'],
            // Art. 12.7.3.3 — CJ-1a: PB+1 → "hasta 7,50" m. PB+1 = 2 floors.
            maxHeight_m: 7.5,
            maxFloors: 2,
            // Art. 12.7.3.1 — CJ-1 and CJ-1a share the 0,66 m²t/m²s row.
            plotRatioFAR: 0.66,
            maxCoverage: 0.45,
            // Art. 12.7.3.4 — PB+1 → 3 m.
            setbacks: { front_m: 3, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.3.1 (edificabilidad neta CJ-1a 0,66 m²t/m²s, misma fila que ' +
                'CJ-1), Art. 12.7.3.2 (parcela mínima CJ-1a 500 m²), Art. 12.7.3.3 (altura máxima ' +
                'CJ-1a PB+1 → 7,50 m; ocupación 45 %), Art. 12.7.3.4 (separación a lindero público ' +
                'para PB+1: 3 m), Art. 12.7.3.5 (linderos privados 1/2 altura, mínimo 3 m — NOT ' +
                'packed). Ver MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CJ-2',
            label: 'Ciudad Jardín, Subzona CJ-2 (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            permittedUse: ['residential'],
            // Art. 12.7.3.3 — CJ-2: PB+3 → "hasta 13,60" m. PB+3 = 4 floors.
            maxHeight_m: 13.6,
            maxFloors: 4,
            plotRatioFAR: 0.83,
            maxCoverage: 0.45,
            // Art. 12.7.3.4 — PB+3 → 4 m.
            setbacks: { front_m: 4, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.3.1 (edificabilidad neta CJ-2 0,83 m²t/m²s), Art. 12.7.3.2 ' +
                '(parcela mínima 300 m²), Art. 12.7.3.3 (altura máxima CJ-2 PB+3 → 13,60 m; ' +
                'ocupación 45 %), Art. 12.7.3.4 (separación a lindero público para PB+3: 4 m), ' +
                'Art. 12.7.3.5 (linderos privados 1/2 altura, mínimo 3 m — NOT packed). Ver ' +
                'MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CJ-2A',
            label: 'Ciudad Jardín, Subzona CJ-2a (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            permittedUse: ['residential'],
            // Art. 12.7.3.3 — CJ-2a: PB+2 → "hasta 10,50" m.
            maxHeight_m: 10.5,
            maxFloors: 3,
            plotRatioFAR: 0.83,
            maxCoverage: 0.45,
            setbacks: { front_m: 3, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.3.1 (edificabilidad neta CJ-2a 0,83 m²t/m²s, misma fila que ' +
                'CJ-2), Art. 12.7.3.2 (parcela mínima CJ-2a 500 m²), Art. 12.7.3.3 (altura máxima ' +
                'CJ-2a PB+2 → 10,50 m; ocupación 45 %), Art. 12.7.3.4 (separación a lindero ' +
                'público para PB+2: 3 m), Art. 12.7.3.5 (linderos privados 1/2 altura — NOT ' +
                'packed). Ver MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CJ-3',
            label: 'Ciudad Jardín, Subzona CJ-3 (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            permittedUse: ['residential'],
            maxHeight_m: 13.6,
            maxFloors: 4,
            plotRatioFAR: 1.16,
            maxCoverage: 0.5,
            setbacks: { front_m: 4, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.3.1 (edificabilidad neta CJ-3 1,16 m²t/m²s), Art. 12.7.3.2 ' +
                '(parcela mínima 300 m²), Art. 12.7.3.3 (altura máxima CJ-3 PB+3 → 13,60 m; ' +
                'ocupación 50 %), Art. 12.7.3.4 (separación a lindero público para PB+3: 4 m), ' +
                'Art. 12.7.3.5 (linderos privados 1/2 altura — NOT packed). Ver ' +
                'MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'CJ-4',
            label: 'Ciudad Jardín, Subzona CJ-4 (PGOU Málaga, Cap. VII, Arts. 12.7.1–12.7.5)',
            permittedUse: ['residential'],
            // Art. 12.7.3.3 — CJ-4: PB+4 → "hasta 16,70" m. PB+4 = 5 floors.
            maxHeight_m: 16.7,
            maxFloors: 5,
            plotRatioFAR: 1.5,
            maxCoverage: 0.5,
            // Art. 12.7.3.4 — PB+4 → 5 m.
            setbacks: { front_m: 5, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_CJ_LINDEROS_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
                'setback.front': MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.7.3.1 (edificabilidad neta CJ-4 1,50 m²t/m²s), Art. 12.7.3.2 ' +
                '(parcela mínima 500 m²), Art. 12.7.3.3 (altura máxima CJ-4 PB+4 → 16,70 m; ' +
                'ocupación 50 %), Art. 12.7.3.4 (separación a lindero público para PB+4: 5 m), ' +
                'Art. 12.7.3.5 (linderos privados 1/2 altura — NOT packed). Ver ' +
                'MALAGA_CJ_LINDEROS_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── PROD (Uso Productivo) — Cap. XI, Arts. 12.11.3–12.11.9 ────────────────────────────
        {
            code: 'PROD-1A',
            label: 'Uso Productivo, Subzona Productivo 1 grado 1a (PGOU Málaga, Cap. XI, Art. 12.11.4)',
            // Art. 12.11.3.1 — usos pormenorizados: Industriales y Logísticos.
            permittedUse: ['industrial'],
            // Art. 12.11.4.4 — "la altura de edificación podrá alcanzar un máximo de 9 metros a
            // cornisa o arranque de cubierta y 12 metros a coronación". The 9 m cornisa figure is
            // the habitable-envelope ceiling and is packed; the 12 m coronación figure covers roof
            // form and is cited only.
            maxHeight_m: 9,
            maxFloors: 2,
            // Art. 12.11.4.3 — "Productivo 1a la edificabilidad neta de parcelas no rebasará 0.85
            // m²t/m²s". Flat.
            plotRatioFAR: 0.85,
            // Art. 12.11.4.2 — "En grado 1a será de 70% de la parcela edificable". Flat.
            maxCoverage: 0.7,
            setbacks: {
                // Art. 12.11.4.5 states 12 m "respecto a la alineación oficial" BUT immediately
                // subordinates it: "en todo caso… el retranqueo mínimo efectivo deberá calcularse a
                // partir del estándar mínimo de superficie destinada al aparcamiento" (Art.
                // 12.2.41), which scales with the building's own floor area. A stated figure that
                // the same sentence makes a floor beneath a computed one is not a flat inset.
                front_m: null,
                // Art. 12.11.4.5 — "la edificación PODRÁ adosarse a linderos laterales" (permissive,
                // conditioned on fire/impact assessment), not a mandatory party wall. Neither 0 nor
                // a number. null.
                side_m: null,
                // No rear separation is stated by this article at all.
                rear_m: null,
            },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.1 (usos Productivo 1: industriales y logísticos; ' +
                'compatibles empresariales, hostelería en planta baja, aparcamientos), Art. ' +
                '12.11.4.1.1 (parcela mínima grado 1a: ≥500 m², frente 10 m, círculo inscrito ' +
                '10 m), Art. 12.11.4.2 (ocupación máxima grado 1a 70 %), Art. 12.11.4.3 ' +
                '(edificabilidad neta 0,85 m²t/m²s), Art. 12.11.4.4 (máx. 2 plantas habitables ' +
                'incluida la baja; 9 m a cornisa, 12 m a coronación), Art. 12.11.4.5 (retranqueo ' +
                'mínimo 12 m a la alineación oficial PERO "el retranqueo mínimo efectivo deberá ' +
                'calcularse a partir del estándar mínimo de aparcamiento" del Art. 12.2.41 — NOT ' +
                'packed; adosamiento lateral POTESTATIVO sujeto a riesgo de incendio), Art. ' +
                '12.11.4.6 (separación entre edificios de la misma parcela ≥1/2 de la altura del ' +
                'más alto). Ver MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-1B',
            label: 'Uso Productivo, Subzona Productivo 1 grado 1b — minipolígonos (PGOU Málaga, Cap. XI, Art. 12.11.4)',
            permittedUse: ['industrial'],
            maxHeight_m: 9,
            maxFloors: 2,
            // Art. 12.11.4.3 — "Productivo 1b la edificabilidad neta de parcelas no rebasará 1,20
            // m²t/m²s".
            plotRatioFAR: 1.2,
            // Art. 12.11.4.2 — "En grado 1b se regulará en Estudio de Detalle y PODRÁ ALCANZAR EL
            // 100% de la parcela edificable" — an ED-set ceiling, not a zone rule. null.
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.4.1.2 (grado 1b minipolígonos: "SE REGULARÁ MEDIANTE ' +
                'ESTUDIO DE DETALLE"; parcela ≥250 m², frente 10 m), Art. 12.11.4.2 (ocupación en ' +
                'grado 1b fijada en Estudio de Detalle, hasta el 100 % — NOT packed), Art. ' +
                '12.11.4.3 (edificabilidad neta 1,20 m²t/m²s), Art. 12.11.4.4 (2 plantas, 9 m a ' +
                'cornisa / 12 m a coronación, común al Productivo 1), Art. 12.11.4.5 (separaciones ' +
                'reguladas en Estudio de Detalle conforme al Art. 12.2.41). Ver ' +
                'MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-2',
            label: 'Uso Productivo, Subzona Productivo 2 (PGOU Málaga, Cap. XI, Art. 12.11.5)',
            permittedUse: ['industrial'],
            // Art. 12.11.5.4 — 3 plantas habitables incluida la baja; 12 m a cornisa, 15 m a
            // coronación.
            maxHeight_m: 12,
            maxFloors: 3,
            // Art. 12.11.5.3 — "la edificabilidad neta de parcelas no rebasará 0.70 m²t/m²s".
            plotRatioFAR: 0.7,
            // Art. 12.11.5.2 — "Será de 60%".
            maxCoverage: 0.6,
            setbacks: {
                // Art. 12.11.5.5.2.b — "≥5 metros SI ES VIARIO LOCAL y ≥10 metros SI ES SISTEMA
                // GENERAL O VIARIO ESTRUCTURANTE" — road-class-branched, and the whole clause
                // applies only "en las parcelas NO ADOSADAS". null, not a guessed branch.
                front_m: null,
                // Art. 12.11.5.5.2.a — "A linderos laterales ≥ 3 metros", again only for parcelas
                // no adosadas (Art. 12.11.5.5 first paragraph refers adosada layouts back to Art.
                // 12.11.4). Conditional on a typology choice this pack cannot resolve. null.
                side_m: null,
                rear_m: null,
            },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                maxCoverage: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.2 (usos Productivo 2), Art. 12.11.5.1 (parcela mínima ' +
                '≥1.000 m², frente 15 m, círculo inscrito 15 m), Art. 12.11.5.2 (ocupación máxima ' +
                '60 %), Art. 12.11.5.3 (edificabilidad neta 0,70 m²t/m²s), Art. 12.11.5.4 (3 ' +
                'plantas habitables; 12 m a cornisa, 15 m a coronación), Art. 12.11.5.5.2 ' +
                '(retranqueos mínimos SÓLO en parcelas no adosadas: laterales ≥3 m; alineación ' +
                'oficial ≥5 m si viario local y ≥10 m si sistema general o viario estructurante — ' +
                'NOT packed, ramificado por clase de viario), Art. 12.11.5.6 (separación entre ' +
                'edificios ≥1/2 de la altura del más alto). Ver ' +
                'MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-3A',
            label: 'Uso Productivo, Subzona Productivo 3.a — Usos Especiales (PGOU Málaga, Cap. XI, Art. 12.11.6)',
            permittedUse: ['industrial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.3 (usos pormenorizados especiales A.4.1 y A.4.2), Art. ' +
                '12.11.6 — "la edificación o las instalaciones de nueva planta… ESTARÁN SUJETAS A ' +
                'LA PREVIA TRAMITACIÓN DE PLAN ESPECIAL", y "la edificabilidad y la ocupación de ' +
                'la parcela QUEDARÁN CONDICIONADAS al cumplimiento de los siguientes requisitos ' +
                'básicos" (estándar de aparcamiento del Art. 12.2.41, entre otros). El PGOU no ' +
                'fija parámetro numérico alguno de ámbito zonal para esta subzona. Art. ' +
                '12.11.3.10 (modificación de uso en parcelas >5.000 m² construidos implica ' +
                'modificación del Plan General). Ver ' +
                'MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-3B',
            label: 'Uso Productivo, Subzona Productivo 3.b — edificios multiuso (PGOU Málaga, Cap. XI, Art. 12.11.7)',
            // Art. 12.11.3.4 — industriales, logísticos Y empresariales coexistiendo en un mismo
            // edificio; comercio minorista y hostelería como compatibles.
            permittedUse: ['industrial', 'commercial'],
            // Art. 12.11.7.4 — 3 plantas habitables; 12 m a cornisa, 15 m a coronación. (An
            // Estudio de Detalle may reach PB+3 without extra edificabilidad — not packed.)
            maxHeight_m: 12,
            maxFloors: 3,
            // Art. 12.11.7.3 — "la edificabilidad no podrá superar los 2 m²t/m²s sobre la parcela".
            plotRatioFAR: 2,
            // Art. 12.11.7.2 states occupation only FUNCTIONALLY (parking/loading must be resolved
            // inside the parcel), never as a percentage. null.
            maxCoverage: null,
            setbacks: {
                front_m: null,
                // Art. 12.11.7.5 — "a linderos laterales: H/2, y como mínimo 5 metros; a espacio
                // libre público, H/2" — height-dependent.
                side_m: null,
                rear_m: null,
            },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: {
                maxHeight: MALAGA_FIELD_PROVENANCE,
                maxFloors: MALAGA_FIELD_PROVENANCE,
                plotRatioFAR: MALAGA_FIELD_PROVENANCE,
                permittedUse: MALAGA_FIELD_PROVENANCE,
            },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.4 (usos Productivo 3.B: industriales, logísticos y ' +
                'empresariales en coexistencia; comercio minorista y hostelería compatibles), Art. ' +
                '12.11.7.1 (parcela mínima 2.000 m², frente 20 m, círculo inscrito 20 m; 1.000 m² ' +
                'en los supuestos de PROD-4.B o de ámbitos sometidos a Estudio de Detalle), Art. ' +
                '12.11.7.2 (ocupación enunciada SÓLO funcionalmente — aparcamiento y carga/' +
                'descarga han de resolverse en el interior de la parcela — sin porcentaje: NOT ' +
                'packed), Art. 12.11.7.3 (edificabilidad máxima 2 m²t/m²s), Art. 12.11.7.4 (3 ' +
                'plantas; 12 m a cornisa, 15 m a coronación; PB+3 alcanzable vía Estudio de ' +
                'Detalle sin aumento de edificabilidad), Art. 12.11.7.5 (separación a linderos ' +
                'laterales H/2 con mínimo 5 m; a espacio libre público H/2 — dependiente de ' +
                'altura, NOT packed). Ver MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-4',
            label: 'Uso Productivo, Subzona Productivo 4 — tipos IND-1 / IND-2 / IND-3 (PGOU Málaga, Cap. XI, Art. 12.11.8)',
            permittedUse: ['industrial'],
            // PROD-4 is a CONTAINER for three industry types with DIFFERENT heights (IND-1 12 m,
            // IND-2 15 m, IND-3 15 m), FARs (1,5 / 1,16 / 1,5) and occupations. A single scalar
            // would publish one type's answer for all three (the L-526 failure). All null; every
            // per-type figure is cited in `ordinanceRef` instead.
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.5 (usos Productivo 4 y 4.B), Art. 12.11.8.1.5 (tipos de ' +
                'industria IND-1 "Industria en Suelo Residencial", IND-2 "Industria Escaparate", ' +
                'IND-3 "Industria" — polígonos específicamente industriales). Parámetros POR TIPO, ' +
                'no de subzona: IND-1 (parcela mín. 250 m², fachada 10 m; edificabilidad neta 1,5 ' +
                'm²t/m²s; ocupación PB 100 % / PA 40 %; altura 12 m, excepcionalmente 20 m en el ' +
                '15 % de la planta; alineación a vial NO obligatoria salvo en tejido medianero ' +
                'consolidado, en cuyo caso el edificio será medianero con alineación obligatoria); ' +
                'IND-2 (parcela mín. 1.000 m², fachada 20 m; edificabilidad 1,16 m²t/m²s; ' +
                'ocupación 60 %; altura 15 m, excepcionalmente 20 m; separación ≥10 m al viario ' +
                'principal y ≥5 m a calles secundarias; ≥5 m a linderos privados salvo estructura ' +
                'parcelaria medianera); IND-3 (parcela mín. 250 m², fachada 10 m; edificabilidad ' +
                'bruta 0,60 y neta 1,5 m²t/m²s; ocupación PB 100 % / PA 40 %; altura 15 m, ' +
                'excepcionalmente 20 m; separaciones según el régimen histórico del polígono o, en ' +
                'Suelo Urbanizable Programado, las que fije cada Plan Parcial, con 5 m en ' +
                'ordenación abierta). NINGUNO packed como escalar de subzona (L-526) y las ' +
                'separaciones son en todos los casos context-branched. Ver ' +
                'MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-4B',
            label: 'Uso Productivo, Subzona Productivo 4.B — renovación de enclaves consolidados (PGOU Málaga, Cap. XI, Arts. 12.11.7–12.11.8)',
            permittedUse: ['industrial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.5 (usos Productivo 4 y 4.B: industriales y logísticos), ' +
                'Art. 12.11.7.1 (PROD-4.B se rige por los parámetros de la ordenanza PROD-3.B ' +
                '"para renovación de enclaves consolidados", con parcela mínima edificable de ' +
                '1.000 m²) — subzona DERIVADA cuyos parámetros son los de PROD-3.B, que a su vez ' +
                'refusa estructuralmente (separación a linderos H/2, ocupación sólo funcional). ' +
                'Ver MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'PROD-5',
            label: 'Uso Productivo, Subzona Productivo 5 (PGOU Málaga, Cap. XI, Art. 12.11.9)',
            // Art. 12.11.3.6 — uso pormenorizado: Empresariales.
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_PROD_SEPARACION_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.11.3.6 (uso pormenorizado empresarial; compatibles ' +
                'industriales, logísticos, hostelería en planta baja, comercio minorista), Art. ' +
                '12.11.9.2 — "los tipos edificatorios correspondientes al productivo 5 se refieren ' +
                'a las formas de MANZANA CERRADA, BLOQUE ABIERTO, CIUDAD JARDÍN, REGULADAS POR ' +
                'OTRAS ORDENANZAS DE ZONA en la Normativa del Plan… debiendo cumplir… las ' +
                'referidas a la posición de los edificios en la parcela (alineaciones y separación ' +
                'a linderos), a las alturas máximas y con el resto de condiciones paramétricas ' +
                'establecidas para dichas ordenanzas." La huella de PROD-5 es, por tanto, la de la ' +
                'ordenanza prestada (MC / OA / CJ), todas ellas a su vez irresueltas en este pack. ' +
                'Ver MALAGA_PROD_SEPARACION_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── CO (Comercial) — Cap. XII, Arts. 12.12.1–12.12.4 ──────────────────────────────────
        {
            code: 'CO',
            label: 'Zona Comercial (PGOU Málaga, Cap. XII, Arts. 12.12.1–12.12.4)',
            // Art. 12.12.3.1 — uso pormenorizado: Comercial.
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: {
                kind: 'explicit-area',
                ringRef: MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING,
            },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.12.2.1 (EN SUELO URBANO CONSOLIDADO: "los parámetros ' +
                'reguladores de la edificación serán LOS MISMOS QUE LOS DE LAS ORDENANZAS DE LAS ' +
                'PARCELAS COLINDANTES en la zona donde estuviera enclavada"; prevalecen las ' +
                'alturas de los Planos de Alturas; si la parcela está rodeada por ordenanzas ' +
                'diferentes "se adoptará la más restrictiva". Régimen especial §1.1-1.3 para ' +
                'parcelas comerciales enclavadas en zona de vivienda unifamiliar o Ciudad Jardín: ' +
                'edificabilidad 1 m²t/m²s, altura PB+1 y 8 m, ocupación 70 % — sin retranqueos ' +
                'declarados, por lo que no compone una huella), Art. 12.12.2.2 (EN SUELO ' +
                'URBANIZABLE Y URBANO NO CONSOLIDADO: parcela mínima 400 m², fachada 10 m, círculo ' +
                'inscrito 15 m; edificabilidad 1 m²t/m²s; ocupación PB 70 % / PA 50 %; altura 9 m ' +
                'y dos plantas, admitiéndose una tercera de 3,5 m con ocupación ≤10 % de la planta ' +
                'baja para oficinas del propio centro; separación ≥5 m a linderos públicos Y ' +
                'privados). AMBAS RAMAS CITADAS, NINGUNA PACKED: la rama aplicable depende de la ' +
                'clase de suelo de la parcela, que PRYZM no puede resolver sin geometría de ' +
                'planeamiento. Art. 12.12.4 (una plaza de aparcamiento por cada 50 m² de techo ' +
                'comercial). Ver MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── H (Hotelera) — Cap. XIII, Arts. 12.13.1–12.13.4 ───────────────────────────────────
        {
            code: 'H',
            label: 'Zona Hotelera (PGOU Málaga, Cap. XIII, Arts. 12.13.1–12.13.4)',
            // Art. 12.13.3.1 — uso pormenorizado: Hospedaje (terciario).
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_HOTEL_SIN_TIPIFICACION_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.13.2 — "Dada la diversidad tipológica de los hoteles ' +
                'existentes y los variados tamaños de parcelas sobre los que se han desarrollado, ' +
                'NO ES POSIBLE UNA TIPIFICACIÓN de los diversos parámetros edificatorios que los ' +
                'definen. Por ello en cada caso se respetará la parcela, uso y edificabilidad de ' +
                'la edificación EXISTENTE a la aprobación inicial del presente Plan General. En ' +
                'los casos de nueva edificación… se aplicarán los parámetros de LA ORDENANZA QUE ' +
                'SEA DE APLICACIÓN EN LA ZONA, MANZANA O ENTORNO donde se sitúe la parcela." Es ' +
                'el propio Plan el que declina fijar parámetros: no hay cifra que transcribir. ' +
                'Art. 12.13.1 (remisión al Decreto 47/2004 de Establecimientos Hoteleros), Art. ' +
                '12.13.3 (usos compatibles hasta el 20 % del techo construido), Art. 12.13.4 ' +
                '(calificación provisional autonómica preceptiva). Ver ' +
                'MALAGA_HOTEL_SIN_TIPIFICACION_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── E / S / D / SC (Equipamiento) — Cap. XIV, Arts. 12.14.1–12.14.3 ───────────────────
        {
            code: 'E',
            label: 'Equipamiento — Educativo (PGOU Málaga, Cap. XIV, Arts. 12.14.1–12.14.3)',
            permittedUse: ['civic'],
            maxHeight_m: null,
            maxFloors: null,
            // ⚠ 0,50 m²t/m²s IS A MINIMUM, NOT A MAXIMUM (Art. 12.14.2.2: "prevalecerán COMO
            // MÍNIMOS sobre aquellos"). `plotRatioFAR` is a maximum slot; packing a floor into it
            // would invert the constraint. null, and the figure is cited instead.
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.14.3.2 (uso pormenorizado E = Educativo), Art. 12.14.2.2 — ' +
                'las parcelas de equipamiento en suelo urbano "tendrán las CONDICIONES ' +
                'EDIFICATORIAS DE LA ZONA EN QUE SE ENCUENTREN, en lo que a edificabilidad, ' +
                'alturas y separación a linderos se refiere", prevaleciendo COMO MÍNIMOS ' +
                '(no como máximos) los índices de 0,50 m²t/m²s para educativo y deportivo y 1 ' +
                'm²t/m²s para el resto de usos; "por razones de interés público se podrán variar ' +
                'alguno de estos parámetros… mediante la redacción de un Estudio de Detalle". Art. ' +
                '12.14.2.1 (en planes parciales de suelo urbanizable sectorizado rigen las mismas ' +
                'edificabilidades con carácter obligatorio, adaptándose el resto de parámetros a ' +
                'las calificaciones del entorno). Ninguna cifra es un máximo zonal transcribible. ' +
                'Ver MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'S',
            label: 'Equipamiento — Servicio de Interés Público y Social (PGOU Málaga, Cap. XIV, Arts. 12.14.1–12.14.3)',
            permittedUse: ['civic'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.14.3.2 (uso pormenorizado S = Servicio de Interés Público y ' +
                'Social, excepto cementerios, tanatorios y crematorios), Art. 12.14.2.2 ' +
                '(condiciones edificatorias las de la zona en que se encuentre; índice de 1 ' +
                'm²t/m²s para "resto de usos" prevaleciendo COMO MÍNIMO, no como máximo — NOT ' +
                'packed), Art. 12.14.3.3/3.4 (compatibilidad y alternancia S↔Sc, esta última ' +
                'mediante Plan Especial ex Art. 6.8.4). Ver ' +
                'MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'D',
            label: 'Equipamiento — Deportivo (PGOU Málaga, Cap. XIV, Arts. 12.14.1–12.14.3)',
            permittedUse: ['civic'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.14.3.2 (uso pormenorizado D = Deportivo), Art. 12.14.2.2 ' +
                '(condiciones edificatorias las de la zona en que se encuentre; índice de 0,50 ' +
                'm²t/m²s para educativo y deportivo prevaleciendo COMO MÍNIMO — NOT packed; las ' +
                'vallas de parcela de equipamientos deportivos "podrán adaptarse a las necesidades ' +
                'de funcionamiento"). Ver MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
        {
            code: 'SC',
            label: 'Equipamiento — Servicio de Interés Público Comercial (PGOU Málaga, Cap. XIV, Arts. 12.14.1–12.14.3)',
            permittedUse: ['civic'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: { kind: 'explicit-area', ringRef: MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.14.3.2 (uso pormenorizado SC = Servicio de Interés Público ' +
                'Comercial), Art. 12.14.2.2 (condiciones edificatorias las de la zona en que se ' +
                'encuentre; índice de 1 m²t/m²s prevaleciendo COMO MÍNIMO — NOT packed), Art. ' +
                '12.14.3.3 (el uso S es compatible con la calificación Sc; el uso Sc lo es con S ' +
                'mediante Plan Especial ex Art. 6.8.4). Ver ' +
                'MALAGA_EQUIP_ENTORNO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },

        // ── GSM (Gran Superficie Minorista) — Cap. XV, Arts. 12.15.1–12.15.4 ──────────────────
        {
            code: 'GSM',
            label: 'Zona de Gran Superficie Minorista (PGOU Málaga, Cap. XV, Arts. 12.15.1–12.15.4)',
            permittedUse: ['commercial'],
            maxHeight_m: null,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: {
                kind: 'explicit-area',
                ringRef: MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING,
            },
            fieldProvenance: { permittedUse: MALAGA_FIELD_PROVENANCE },
            ordinanceRef:
                'PGOU Málaga Art. 12.15.1 (la calificación específica de Gran Superficie Minorista ' +
                'es constitutiva: ninguna otra calificación habilita el uso; se otorga mediante ' +
                'planeamiento de desarrollo, Plan Especial o modificación del PGOU según el caso), ' +
                'Art. 12.15.2.1 (EN SUELO URBANO CONSOLIDADO: "los parámetros reguladores de la ' +
                'edificación serán LOS MISMOS QUE LOS DE LAS ORDENANZAS DE LAS PARCELAS ' +
                'COLINDANTES"; prevalecen las alturas de los Planos de Alturas; la más restrictiva ' +
                'si el entorno es heterogéneo. Régimen especial §1.1-1.3 para parcelas enclavadas ' +
                'en zona de vivienda unifamiliar o Ciudad Jardín: edificabilidad 0,85 m²t/m²s, ' +
                'altura PB+1 y 8 m, ocupación 80 % — sin retranqueos declarados), Art. 12.15.2.2 ' +
                '(EN SUELO URBANIZABLE Y URBANO NO CONSOLIDADO: parcela mínima 3.000 m², fachada ' +
                '10 m, círculo inscrito 15 m; edificabilidad 0,85 m²t/m²s EN SUELO URBANO y 0,70 ' +
                'm²t/m²s EN SUELO URBANIZABLE; ocupación 80 % en suelo urbano y 60 % en ' +
                'urbanizable, 100 % en sótano; altura 12 m y dos plantas, más una tercera de 3,5 m ' +
                'con ocupación ≤10 % para oficinas; separación ≥5 m a linderos públicos y ' +
                'privados). AMBAS RAMAS CITADAS, NINGUNA PACKED: incluso dentro del Art. 12.15.2.2 ' +
                'la edificabilidad y la ocupación se bifurcan por clase de suelo. Art. 12.15.4 ' +
                '(estándar de aparcamiento). Ver ' +
                'MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING. ' + MALAGA_DOC_C_SRC,
        },
    ],
});

/**
 * The zone codes this pack answers for. ⚠ DERIVED from `ES_MALAGA_PGOU_PACK.zones`, never
 * re-typed — an unread zone can never silently appear registered.
 *
 * All 38 codes Documento C declares (Art. 12.1.1 plus each chapter's subzone article). NINE ship a
 * real footprint (`UAS-1`…`UAS-5`, `UAD-1`/`UAD-2`, `CTP-1`/`CTP-2`); the other 29 ship a cited
 * structural refusal.
 *
 * ⚠ THIS LIST IS NOT CROSS-CHECKED AGAINST A LIVE SERVICE, unlike `SEVILLA_PGOU_ZONE_CODES`. It is
 * derived from the BINDING TEXT because the municipal calificación layer is unreadable (module
 * header). A code in force on the ground but absent from Documento C would be invisible to it.
 */
export const MALAGA_PGOU_ZONE_CODES: readonly string[] = ES_MALAGA_PGOU_PACK.zones
    .map((z) => z.code.toUpperCase())
    .sort();

/**
 * The zone codes that ship a REAL, computable buildable footprint (no `explicit-area` structural
 * refusal handle). DERIVED, never hand-typed — so a future edit that downgrades a zone to a
 * refusal, or lifts one out of refusal, updates this automatically and its pinned test fails loudly.
 */
export const MALAGA_REAL_FOOTPRINT_ZONE_CODES: readonly string[] = ES_MALAGA_PGOU_PACK.zones
    .filter((z) => z.geometricRule?.kind !== 'explicit-area')
    .map((z) => z.code.toUpperCase())
    .sort();
