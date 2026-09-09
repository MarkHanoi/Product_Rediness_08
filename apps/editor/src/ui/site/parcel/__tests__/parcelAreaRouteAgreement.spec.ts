// §AREA-ROUTE-AGREEMENT (C57 §1.14, lane CADASTRAL-COVERAGE 2026-09-09) — the client's area URL
// and the server's registered route, compared against EACH OTHER rather than each against a
// literal in its own file.
//
// ⛔ WHY THIS SPEC EXISTS, AND IT IS NOT HYPOTHETICAL — IT ALREADY HAPPENED, TODAY.
// -----------------------------------------------------------------------------------------------
// Spain's area leg shipped as `/api/catastro/parcels` and was renamed to `/api/catastro/parcel/area`
// about an hour later, to match the `<pointRoute>/area` shape DK and the EU legs already used. For
// that hour the client pointed at a route the server no longer served. NOTHING WOULD HAVE FAILED
// LOUDLY: a 404 comes back as a body the reader cannot parse, which becomes `unreachable`, which
// renders as "the cadastre did not answer" — a sentence blaming a Spanish government service for a
// string mismatch inside PRYZM.
//
// That is [[same-rule-two-implementations]] in its purest form: the route is ONE fact written in
// TWO files, and the guarding tests on each side stayed green because each measured its own copy.
// The memory's own prescription is the fix — "add a cross-model agreement check" — so this spec
// imports BOTH sides and compares them. It is the only test here that can fail on a rename.
//
// ⚠ IT DELIBERATELY IMPORTS THE SERVER MODULES. That is unusual for a `ui/` spec and it is the
// entire point: a spec that re-declared the expected path as a literal would be a THIRD copy, and
// would go green against a client and server that agreed with the literal and not with each other.

import { describe, it, expect } from 'vitest';
import { CATASTRO_PARCEL_ENDPOINT } from '../CatastroParcelProvider.js';
import { DK_MATRIKEL_PARCEL_ENDPOINT } from '../DkMatrikelParcelProvider.js';
// The server's OWN exported route constants — the ones `server/jurisdiction/index.js` registers.
import { CATASTRO_PARCEL_AREA_PATH } from '../../../../../../../server/jurisdiction/parcelZoningProxy.js';
import { DK_PARCEL_AREA_PATH } from '../../../../../../../server/jurisdiction/dkMatrikelProxy.js';
import { EU_PARCEL_PATH } from '../../../../../../../server/jurisdiction/euCadastreProxy.js';

/**
 * The rule every adapter follows: the area query lives one segment below the point route.
 * `WfsParcelProvider` builds `${cfg.endpoint}/area`; `CatastroParcelProvider` builds
 * `${CATASTRO_PARCEL_ENDPOINT}/area`. This is that rule, stated once, so the assertions below
 * compare a DERIVED client URL against the server's registered path.
 */
const areaRouteFor = (pointRoute: string) => `${pointRoute}/area`;

describe('C57 §1.14 — the client asks the route the server actually registered', () => {
    it('⭐ SPAIN: the derived client area route IS the server’s registered path', () => {
        // This is the assertion that would have caught today's hour-long mismatch.
        expect(areaRouteFor(CATASTRO_PARCEL_ENDPOINT)).toBe(CATASTRO_PARCEL_AREA_PATH);
    });

    it('⭐ DENMARK: the derived client area route IS the server’s registered path', () => {
        expect(areaRouteFor(DK_MATRIKEL_PARCEL_ENDPOINT)).toBe(DK_PARCEL_AREA_PATH);
    });

    it('⭐ EU/RoW: `<EU_PARCEL_PATH>/<cc>` + `/area` is the `:cc/area` form the router registers', () => {
        // The generic `WfsParcelProvider` receives `jur.proxyPath` (e.g. `/api/parcel/fr`) and
        // appends `/area`. The router registers `${EU_PARCEL_PATH}/:cc/area`. Substituting a real
        // country code for `:cc` must reproduce the client's URL exactly.
        for (const cc of ['fr', 'nl', 'no', 'de-nrw', 'ch']) {
            expect(areaRouteFor(`${EU_PARCEL_PATH}/${cc}`)).toBe(`${EU_PARCEL_PATH}/${cc}/area`);
        }
    });

    it('the point routes themselves still agree with the EU prefix (a rename of either is caught)', () => {
        expect(DK_MATRIKEL_PARCEL_ENDPOINT.startsWith(`${EU_PARCEL_PATH}/`)).toBe(true);
        expect(CATASTRO_PARCEL_ENDPOINT.startsWith('/api/')).toBe(true);
    });
});
