// Op #20: set-plane-offset — §82.1-PARAMETRIC-DATUM.
//
// ⚠ HAND-EMITTED, deliberately, and this note is the reason. The package's
//    `tsconfig.build.json` emits to `./dist`, yet the `.js` files sitting beside
//    the sources in `src/family-migrations/**` are what actually LOAD at runtime
//    (`index.ts` imports `'./ops/<name>.js'`, and a real file with that name
//    wins over the `.ts`). So an op added only in TypeScript is exported by a
//    module nobody executes. ⭐ MEASURED, not assumed: a probe importing the
//    barrel three ways reported `viaJs: undefined · viaTs: function ·
//    leaf: function` — the stale committed `index.js` shadowed the `.ts` and
//    every consumer of `@pryzm/file-format` (whose package `exports` resolves
//    `.` → `src/index.ts`, which imports `./family-migrations/index.js`) got
//    `undefined`. Keep the two in step; see `rename-reference-plane.js`.
//
// The doc comment lives in `set-plane-offset.ts`; it is the authority.

/** Below this a plane origin counts as the model origin. Metres: 1 µm. */
const ORIGIN_EPS = 1e-6;
/** Same scale the kernel and the bake use for "does this vector have length". */
const ZERO_EPS = 1e-9;

export function makeSetPlaneOffsetMigrator(from, to, params) {
    return {
        id: `set-plane-offset:${params.planeId}`,
        from,
        to,
        description: params.offsetExpression === null
            ? `clear the parametric offset of plane ${params.planeId}`
            : `dimension plane ${params.planeId} to "${params.offsetExpression}"`,
        apply(input) {
            const doc = input.document;
            const plane = doc.referencePlanes.find((pl) => pl.id === params.planeId);
            if (!plane) {
                throw new Error(`reference plane ${params.planeId} is not carried by this definition; a datum that is not ` +
                    'there cannot be dimensioned');
            }
            const expr = params.offsetExpression;
            if (expr !== null) {
                if (expr.trim() === '') {
                    throw new Error(`the offset for plane ${plane.name} (${plane.id}) is blank. A blank expression is not a ` +
                        'dimension of zero — pass null to CLEAR the dimension and say so.');
                }
                const { x, y, z } = plane.normal;
                if (![x, y, z].every((c) => Number.isFinite(c))) {
                    throw new Error(`reference plane ${plane.name} (${plane.id}) has a non-finite normal (${x}, ${y}, ${z}); ` +
                        'it names no direction to measure the offset along');
                }
                if (Math.hypot(x, y, z) < ZERO_EPS) {
                    throw new Error(`reference plane ${plane.name} (${plane.id}) has a zero-length normal, so it names no ` +
                        'direction to offset along. Refused rather than defaulting to +Y (spec §75) — a plane ' +
                        'whose orientation is unstated is not a plane that happens to be horizontal.');
                }
                if (Math.abs(plane.origin.x) > ORIGIN_EPS ||
                    Math.abs(plane.origin.y) > ORIGIN_EPS ||
                    Math.abs(plane.origin.z) > ORIGIN_EPS) {
                    throw new Error(`reference plane ${plane.name} (${plane.id}) already carries a literal origin ` +
                        `(${plane.origin.x}, ${plane.origin.y}, ${plane.origin.z}), and a parametric offset ` +
                        'would be a SECOND statement of where the plane is. The literal origin is applied by no ' +
                        'evaluator (there is no per-solid transform in the schema) while the offset IS applied, ' +
                        'so accepting both would make the document mean one thing and the geometry another. ' +
                        'Return the origin to (0, 0, 0) and dimension the plane instead.');
                }
            }
            const next = expr === null ? stripOffset(plane) : { ...plane, offsetExpression: expr };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    referencePlanes: doc.referencePlanes.map((pl) => (pl.id === next.id ? next : pl)),
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}

function stripOffset(plane) {
    const { offsetExpression: _dropped, ...rest } = plane;
    return rest;
}
