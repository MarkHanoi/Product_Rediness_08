/**
 * server/__tests__/contextDeliveryRouter.test.ts
 * ============================================================================
 * THE REACHABILITY CONTRACT for the context/asset-delivery bounded context
 * (L-799 / audit finding CA-3), the sibling of `jurisdictionRouter.test.ts`.
 *
 * These four routes were hand-wired in `server.js` and are live in production.
 * Two properties here are load-bearing beyond "the path exists":
 *
 *   • ORDER — `${CONTEXT_TILES_PATH}/terrain/*` MUST precede the single-segment
 *     `:layer` route. Terrain tiles live at multi-segment `terrain/<city>/…`
 *     paths that `:layer` cannot match; registered the other way round they
 *     fall through to the SPA catch-all and return index.html, which renders as
 *     SILENT FLAT GROUND rather than an error.
 *
 *   • THE ABSENCE OF `apiLimiter` on the two static-byte routes. That is a
 *     measured decision, not an oversight: one 3D-Site load issues ~30-35 tile
 *     reads and the furniture carousel fetches many thumbnails at once, so a
 *     60 req/min/IP cap presents as "context randomly doesn't render". A
 *     well-meaning future edit adding the limiter is exactly the regression
 *     this asserts against.
 *
 * @see server/context-delivery/index.js
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
    createContextDeliveryRouter,
    CONTEXT_DELIVERY_ROUTES,
} from '../context-delivery/index.js';

/** The live production surface, written literally — these are what clients call. */
const EXPECTED: ReadonlyArray<readonly [string, string, number]> = [
    // [method, path, expected middleware count on the route]
    ['get', '/api/context-tiles/terrain/*', 1], // handler ONLY — no limiter, by design
    ['get', '/api/context-tiles/:layer', 1], // handler ONLY — no limiter, by design
    ['get', '/api/catalog/items/*', 1], // handler ONLY — no limiter, by design
];

function routesOf(router: ReturnType<typeof createContextDeliveryRouter>) {
    const stack = (router as unknown as { stack: any[] }).stack;
    return stack
        .filter((layer) => layer.route)
        .map((layer) => ({
            method: Object.keys(layer.route.methods)[0],
            path: layer.route.path as string,
            handlers: layer.route.stack.length as number,
        }));
}

describe('context-delivery router — reachability contract', () => {
    it('registers exactly the expected routes, in the order Express needs', () => {
        const actual = routesOf(createContextDeliveryRouter());
        expect(actual.map((r) => [r.method, r.path])).toEqual(
            EXPECTED.map(([m, p]) => [m, p]),
        );
    });

    it('exports a CONTEXT_DELIVERY_ROUTES manifest that matches what it mounts', () => {
        const actual = routesOf(createContextDeliveryRouter());
        expect(CONTEXT_DELIVERY_ROUTES.map(([m, p]) => [m, p])).toEqual(
            actual.map((r) => [r.method, r.path]),
        );
    });

    it('keeps every route UNLIMITED — the measured decision, not an oversight', () => {
        const actual = routesOf(createContextDeliveryRouter());
        for (const [, path, handlers] of EXPECTED) {
            const found = actual.find((r) => r.path === path);
            expect(found, `${path} is not mounted`).toBeDefined();
            expect(
                found!.handlers,
                `${path} middleware count changed — if a limiter was added to a tile/asset ` +
                    'route, read the §CTX-TILES-PROXY note before "fixing" this test',
            ).toBe(handlers);
        }
    });

});
