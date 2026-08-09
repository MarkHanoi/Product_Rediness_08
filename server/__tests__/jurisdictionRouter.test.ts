/**
 * server/__tests__/jurisdictionRouter.test.ts
 * ============================================================================
 * THE REACHABILITY CONTRACT for the jurisdiction-proxy bounded context (L-799 /
 * audit finding CA-3).
 *
 * ~20 per-jurisdiction zoning/cadastre proxies were hand-wired one `app.get()`
 * at a time in the 6.4 k-line `server.js` monolith. They were moved into
 * `server/jurisdiction/` behind a single router. Every one of them is LIVE IN
 * PRODUCTION TODAY, so the acceptance test for that move is not "the code
 * compiles" — it is "the HTTP surface is byte-for-byte unchanged".
 *
 * This file is that test. It walks the router's real Express layer stack (not a
 * hand-maintained list) and asserts:
 *
 *   1. every expected path is registered, with the expected method;
 *   2. no EXTRA path snuck in (a proxy quietly widening the public surface);
 *   3. registration ORDER is preserved, because Express matches in order and a
 *      specific route registered after a `:param` route on the same prefix is
 *      dead code that silently 404s / mis-resolves;
 *   4. every route sits behind the injected `apiLimiter` — a missing limiter
 *      turns a keyless public gov endpoint into an open forwarder, and no
 *      "does it answer 200?" test would catch that.
 *
 * ⚠ If you add a jurisdiction proxy, this file MUST change in the same commit.
 * That is the point: the live route surface should never move silently.
 *
 * @see server/jurisdiction/index.js
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import type { RequestHandler } from 'express';

import { createJurisdictionRouter, JURISDICTION_ROUTES } from '../jurisdiction/index.js';

/**
 * The live production paths this router owns, in registration order.
 *
 * Written out LITERALLY rather than imported from the proxy modules on purpose:
 * importing the `*_PATH` constants would make the test tautological (a typo'd
 * constant would move the route AND the assertion together). These strings are
 * the contract the deployed clients call.
 */
const EXPECTED: ReadonlyArray<readonly [string, string]> = [
    ['get', '/api/catastro/parcel'],
    ['get', '/api/catastro/block'],
    ['get', '/api/muc/zoning'],
    ['get', '/api/muc/instrument'],
    ['get', '/api/bcn-refos/ov'],
    ['get', '/api/plandata/zoning'],
    ['get', '/api/plandata/byggefelt'],
    ['get', '/api/siu/classification'],
    ['get', '/api/madrid/condiciones'],
    ['get', '/api/madrid/normas-zonales'],
    ['get', '/api/nl/bestemmingsplan'],
    ['get', '/api/cordoba/ordenanzas'],
    ['get', '/api/cordoba/vcatastro'],
    ['get', '/api/cordoba/manzana'],
    ['get', '/api/zaragoza/calificaciones'],
    ['get', '/api/es/murcia-pgou'],
    ['get', '/api/es/balears-muib'],
    ['get', '/api/ch/grundnutzung'],
    ['get', '/api/ch/zurich-bzo'],
    ['get', '/api/paris/plu'],
    // ⚠ ORDER-CRITICAL. `/api/parcel/dk` MUST precede `/api/parcel/:cc`: Express
    // matches in registration order, so swapping these sends every Danish parcel
    // request into the keyless EU handler with cc="dk" and silently drops the
    // Datafordeler credential.
    ['get', '/api/parcel/dk'],
    ['get', '/api/parcel/:cc'],
];

/** A stand-in for the monolith's shared per-IP limiter. */
const apiLimiter: RequestHandler = (_req, _res, next) => next();

/** Flatten an Express router's layer stack into `[method, path, handlerCount]`. */
function routesOf(router: ReturnType<typeof createJurisdictionRouter>) {
    // `router.stack` is Express internals — not in the public types, but it is
    // the only way to read the ACTUAL registered surface rather than a list we
    // maintain by hand (which is exactly the thing that drifts).
    const stack = (router as unknown as { stack: any[] }).stack;
    return stack
        .filter((layer) => layer.route)
        .map((layer) => ({
            method: Object.keys(layer.route.methods)[0],
            path: layer.route.path as string,
            handlers: layer.route.stack.length as number,
        }));
}

describe('jurisdiction router — reachability contract', () => {
    it('registers exactly the expected routes, in the expected order', () => {
        const actual = routesOf(createJurisdictionRouter({ apiLimiter }));
        expect(actual.map((r) => [r.method, r.path])).toEqual(
            EXPECTED.map(([m, p]) => [m, p]),
        );
    });

    it('exports a JURISDICTION_ROUTES manifest that matches what it mounts', () => {
        // The manifest is what humans read; the stack is what Express serves.
        // They must not diverge.
        const actual = routesOf(createJurisdictionRouter({ apiLimiter }));
        expect(JURISDICTION_ROUTES.map(([m, p]) => [m, p])).toEqual(
            actual.map((r) => [r.method, r.path]),
        );
    });

    it('keeps every route behind the injected apiLimiter', () => {
        // limiter + handler = 2 entries in the route's own middleware stack.
        for (const route of routesOf(createJurisdictionRouter({ apiLimiter }))) {
            expect(route.handlers, `${route.path} lost its limiter`).toBeGreaterThanOrEqual(2);
        }
    });

    it('refuses to wire itself without a limiter', () => {
        // A silently-unlimited keyless gov proxy is an open forwarder.
        expect(() => createJurisdictionRouter({ apiLimiter: undefined as never })).toThrow(
            /apiLimiter/,
        );
    });
});
