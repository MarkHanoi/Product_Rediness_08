// LANE AU-OPEN — AUSTRALIA (open states) · the routing predicates + bboxes for the parcel registry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY BBOX PREDICATES HERE, NOT `claimsNation` (the EE/LT/PL idiom) — and why that is CORRECT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The five L-12871 national rows (EE/LT/PL/LU/SE) route on `claimsNation(cc)` because their coarse
// routing rectangles OVERLAP each other's SOVEREIGN territory (LITHUANIA_BBOX contains Polish
// Suwałki, SWEDEN_BBOX contains København …), so a rectangle is not a safe claim to nationality and
// the click must be decided on real boundary geometry by `nationalJurisdictionResolver`.
//
// Australia is the OPPOSITE case, and it is measured, not assumed:
//   • The whole continent sits at lon 112.9–153.7°E. EVERY national/Saudi routing bbox in this
//     package tops out at lon ≤ 55.7°E (Saudi), and every US city box is Western-hemisphere
//     (negative lon). So NO existing prefilter or row can ever match an Australian point, and
//     `resolveNationalJurisdiction` returns `no-national-candidate` for every AU click (there is no
//     AUS prefilter and no AUS polygon in the bundled 16-country boundary set). On that refusal the
//     registry keeps the full bbox-matched set — exactly the "a refusal is not a dead click" path —
//     so these bbox rows route normally without any change to the national resolver.
//   • Widening `nationalJurisdictionResolver` to SUB-national routing is a DEFERRED separate lane it
//     names in its own header ("E4 control 10 — recorded, not actioned"); doing it here would need
//     an AUS ADM0 polygon we have not sourced or probed. So AU is wired the way the US cities are
//     (`isInSF`/`isInNYC`/`isInChicago`): a bbox pre-filter + the service's own empty answer as the
//     real "no parcel here", never a rectangle asserting sovereignty.
//
// The SIBLING-STATE overlap that DOES exist (adjacent state rectangles touch along shared borders,
// and ACT is fully enclaved in NSW) is handled by the SAME machinery the pre-L-12871 European
// cadastral rows used, with no new mechanism:
//   • SPECIFICITY — the registry sorts candidates smallest-box-first, so a Canberra click ranks
//     AU-ACT (≈0.53 deg²) ahead of AU-NSW (≈118 deg²), exactly as Brussels ranks ahead of Flanders.
//   • SERVICE-NULL FALL-THROUGH — each state cadastre holds ONLY its own state's parcels, so a
//     border-band point that also falls in a neighbour's rectangle returns 0 features from the
//     wrong-state service and `resolveParcelWithFallback` walks on to the right one. No AU state
//     service can return a confident wrong parcel for another state's point.
//
// ⛔ REGION-CODE COLLISION (the lane's central warning): Australian SOUTH AUSTRALIA is `AU-SA`,
// NEVER `SA` — `SA` is already SAUDI ARABIA in the registry + REGION_BBOX. Every code here is
// ISO 3166-2:AU (`AU-NSW`, `AU-VIC`, `AU-QLD`, `AU-SA`, `AU-TAS`, `AU-ACT`, `AU-WA`, `AU-NT`).
//
// PURE — data + point-in-rectangle. No I/O. Never throws.

/** A WGS84 routing rectangle (the specificity metric's shape; mirrors REGION_BBOX). */
export interface AuBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/** True when a finite WGS84 point falls inside `b`. Non-finite input → false. */
function within(b: AuBbox, lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

// ── THE EIGHT STATE / TERRITORY BOXES ───────────────────────────────────────────────────────────
// Coarse mainland+island rectangles (a router, not a boundary). Offshore outliers deliberately
// EXCLUDED (Lord Howe 159°E, Macquarie 159°E, the Territory's Ashmore reef) — an ocean/outlier
// click self-corrects to the universal footprint. Boxes touch along shared land borders by design;
// the specificity + service-null machinery above resolves those bands.

/** New South Wales (mainland; Lord Howe excluded). */
export const AU_NSW_BBOX: AuBbox = { minLat: -37.51, maxLat: -28.15, minLon: 140.99, maxLon: 153.64 };
/** Victoria. */
export const AU_VIC_BBOX: AuBbox = { minLat: -39.2, maxLat: -33.98, minLon: 140.96, maxLon: 150.04 };
/** Queensland (Cape York to the NSW border; Torres Strait + coastal islands included). */
export const AU_QLD_BBOX: AuBbox = { minLat: -29.2, maxLat: -9.09, minLon: 137.99, maxLon: 153.56 };
/** South Australia (`AU-SA`, NOT `SA` = Saudi). */
export const AU_SA_BBOX: AuBbox = { minLat: -38.07, maxLat: -25.99, minLon: 128.99, maxLon: 141.01 };
/** Tasmania (main island + King/Flinders; Macquarie Island excluded). */
export const AU_TAS_BBOX: AuBbox = { minLat: -43.75, maxLat: -39.18, minLon: 143.79, maxLon: 148.53 };
/** Australian Capital Territory (fully enclaved in NSW — smallest box, wins Canberra by specificity). */
export const AU_ACT_BBOX: AuBbox = { minLat: -35.93, maxLat: -35.12, minLon: 148.75, maxLon: 149.41 };
/** Western Australia (declared deferral — geometry keyless, identifiers Landgate-gated). */
export const AU_WA_BBOX: AuBbox = { minLat: -35.2, maxLat: -13.68, minLon: 112.9, maxLon: 129.02 };
/** Northern Territory (declared deferral — viewer/JS-app + Cloudflare mediated). */
export const AU_NT_BBOX: AuBbox = { minLat: -26.01, maxLat: -10.96, minLon: 128.99, maxLon: 138.02 };

/** True when a WGS84 point routes to New South Wales. */
export const isInNsw = (lat: number, lon: number): boolean => within(AU_NSW_BBOX, lat, lon);
/** True when a WGS84 point routes to Victoria. */
export const isInVic = (lat: number, lon: number): boolean => within(AU_VIC_BBOX, lat, lon);
/** True when a WGS84 point routes to Queensland. */
export const isInQld = (lat: number, lon: number): boolean => within(AU_QLD_BBOX, lat, lon);
/** True when a WGS84 point routes to South Australia (`AU-SA`). */
export const isInSaAu = (lat: number, lon: number): boolean => within(AU_SA_BBOX, lat, lon);
/** True when a WGS84 point routes to Tasmania. */
export const isInTas = (lat: number, lon: number): boolean => within(AU_TAS_BBOX, lat, lon);
/** True when a WGS84 point routes to the ACT. */
export const isInAct = (lat: number, lon: number): boolean => within(AU_ACT_BBOX, lat, lon);
/** True when a WGS84 point routes to Western Australia (deferral). */
export const isInWa = (lat: number, lon: number): boolean => within(AU_WA_BBOX, lat, lon);
/** True when a WGS84 point routes to the Northern Territory (deferral). */
export const isInNt = (lat: number, lon: number): boolean => within(AU_NT_BBOX, lat, lon);

/** The eight ISO 3166-2:AU region codes this lane registers. */
export type AuRegionCode =
    | 'AU-NSW'
    | 'AU-VIC'
    | 'AU-QLD'
    | 'AU-SA'
    | 'AU-TAS'
    | 'AU-ACT'
    | 'AU-WA'
    | 'AU-NT';
