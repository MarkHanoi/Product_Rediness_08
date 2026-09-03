// LANE US-EXPAND — THE US COUNTRY ADAPTER (parcel-only), the sibling of ee/ and dk/ for the US.
//
// UNLIKE ee/dk THIS IS PARCEL-ONLY BY DESIGN. The EE/DK adapters assemble the full §J site-intel
// chain (parcel → buildings → plan → rules → vocabulary) because those countries have a national
// plan register with a machine-readable rule taxonomy. The US has NEITHER a national cadastre NOR a
// national zone taxonomy (`jurisdictions/us/USA.md`), and bulk/height are governed by per-municipal
// zoning ordinances that no open point service serves — so the honest US deliverable is GEOMETRY +
// IDENTITY, exactly the SF/Chicago/NYC shape. Zoning/FAR/height are NEVER inferred here (C58 §1.4).
//
// The whole adapter is ONE shared ArcGIS client (`usArcgisParcelClient.ts`) parameterised by four
// per-jurisdiction configs (`usJurisdiction.ts`): MassGIS statewide (US-MA), FDOR statewide (US-FL),
// King County (US-WA-KING), Harris County / HCAD (US-TX-HARRIS). DRY without hiding provenance — each
// jurisdiction's endpoint, CRS, id field and live-probe verdict is a legible DATA row.

export * from './usArcgisParcelClient.js';
export * from './usJurisdiction.js';
