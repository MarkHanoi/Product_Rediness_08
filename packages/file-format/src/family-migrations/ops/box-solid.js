// Op #9/#10: add-box-solid + set-box-dimensions (lane U8 · §U8-AUTHORED-SHAPE).
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE FIRST GEOMETRY-AUTHORING OPS. Until this file the family-migrations
//     surface could add a PARAMETER and nothing else: `ls ops/` was eight ops,
//     none of which touched `document.profiles` or `document.solids`, which is
//     why `ComponentDefinitionWorkspace` says, by name, that profile geometry
//     "cannot be persisted from this workspace" — and why "New Component"
//     minted a definition with ZERO SOLIDS and the preview answered
//     `no-solids: family has zero solids; cannot bake an instance`.
//     That refusal was CORRECT and stays correct; what was missing was any way
//     to give the definition a solid at all.
//
// ⛔ ONE SHAPE, DELIBERATELY: a rectangular EXTRUSION (a box). Not because a
//    box is interesting, but because `BAKEABLE_SOLID_KINDS` in
//    `../../family-schema.ts` is `['extrude']` and `bakeFamilyInstance` refuses
//    `sweep` / `loft` / `revolve` / `boolean` with a per-kind sentence naming
//    the persisted fields each is missing (§4D-SCHEMA-DELTA). Authoring a kind
//    the bake cannot evaluate would produce a definition that validates, packs,
//    loads — and shows a refusal instead of a shape. Spec §75: the UI author
//    only what the runtime can bake.
//
// ═══════════════════════════════════════════════════════════════════════════
// §U8-BOX-SPELLING — ONE canonical spelling, written and read in ONE file
// ═══════════════════════════════════════════════════════════════════════════
// A box's width and depth live in the profile as EXPRESSION-VALUED point
// coordinates (`ProfileEntitySchema.data` already admits `string`, and
// `profileToPolygon` already evaluates it through the ONE expression engine —
// this file mints no schema change and no second evaluator).  The four corners
// are written as, exactly:
//
//     x: `-(<W>) / 2`   |   `(<W>) / 2`        z: `-(<D>) / 2`   |   `(<D>) / 2`
//
// where `<W>` is a parameter NAME or a numeric literal, in RUNTIME length
// units (millimetres today — see `§4D-ONE-LENGTH-SEAM` in
// `@pryzm/family-instance/units.ts`; a `length` parameter's `defaultValue` is
// in those same units, which is why a binding and a literal can share one
// spelling).  The box is centred on the profile plane's origin in X/Z and runs
// 0 → H in Y, because `produceExtrude` builds along +Y and the extrude arm's
// `direction` field is REFUSED by the bake for any other value.
//
// ⭐ {@link readBoxSolid} — the READER — lives in this file with the writer, so
//    the spelling has exactly one authority.  A UI that hand-parsed these
//    strings elsewhere would be the second source of truth (§76 gate B) and
//    would drift the first time a corner expression changed.  A profile this
//    reader does not recognise returns `null`, and
//    {@link makeSetBoxDimensionsMigrator} REFUSES it rather than rewriting
//    geometry it cannot read.
//
// ⚠ DECLARED ABSENCES (C84 EI-6), each with the reason, none of them "later":
//   • VOIDS / CUTS. `SolidFeatureSchema` HAS a `boolean` kind and
//     `produceBoolean` works — but `bakeFamilyInstance` refuses the kind
//     pending ADR-0376 **D7** (the feature-graph evaluation order), and
//     `featureEdges[]` is persisted-and-inert by the same ruling. Minting a
//     void op here would author a solid that cannot bake, and would decide D7
//     by accident. OWED, not attempted.
//   • ROTATION / PLACEMENT. A box is centred on its plane's origin. There is
//     no per-solid transform in the schema and this lane mints no field.
//   • NON-RECTANGULAR PROFILES. The sketch surface that draws them already
//     exists (`apps/component-editor/src/sketch/**`, S52–S53) and is the
//     harvest for the next lane; a rectangle is what THIS op writes.
/* ------------------------------------------------------------------ */
/* §U8-BOX-SPELLING — the ONE writer + the ONE reader                   */
/* ------------------------------------------------------------------ */
/** The half-extent expression for one corner ordinate. */
function halfExpression(negative, source) {
    return `${negative ? '-' : ''}(${source}) / 2`;
}
const HALF_RE = /^(-?)\((.+)\) \/ 2$/;
/** Inverse of {@link halfExpression}: `{ negative, source }`, or null. */
function parseHalfExpression(raw) {
    if (typeof raw !== 'string')
        return null;
    const m = HALF_RE.exec(raw.trim());
    if (!m)
        return null;
    return { negative: m[1] === '-', source: m[2].trim() };
}
/**
 * A numeric literal exactly as `evalLengthExpression` recognises one.
 *
 * ⛔ The pattern is COPIED from `bakeFamilyInstance.evalLengthExpression`
 *    rather than loosened: a value this accepts and that one rejects is a
 *    solid that authors cleanly and refuses at bake.
 */
const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?$/;
/** The source text a dimension contributes to an expression. */
function dimensionSource(dim, document, label) {
    if (dim.kind === 'literal') {
        if (!Number.isFinite(dim.value) || dim.value <= 0) {
            throw new Error(`${label} literal must be a finite positive length in runtime units (got ${String(dim.value)}); ` +
                'a zero or negative extent produces a degenerate solid the bake refuses.');
        }
        const text = String(dim.value);
        if (!NUMERIC_LITERAL_RE.test(text)) {
            throw new Error(`${label} literal ${String(dim.value)} does not serialise to the numeric spelling the ` +
                'bake accepts (`-?digits[.digits]`); use a plain decimal.');
        }
        return text;
    }
    const parameter = document.parameters.find((p) => p.id === dim.parameterId);
    if (!parameter) {
        throw new Error(`${label} is bound to parameter ${dim.parameterId}, which this definition does not carry`);
    }
    if (parameter.dataType !== 'length') {
        throw new Error(`${label} is bound to parameter "${parameter.name}", whose dataType is ` +
            `'${parameter.dataType}'; a box dimension must be bound to a 'length' parameter so the ` +
            'one length seam (runtime units → metres) applies to it.');
    }
    if (/\s/.test(parameter.name)) {
        throw new Error(`${label} is bound to parameter "${parameter.name}", whose name contains a space; the ` +
            'expression grammar reads that as two identifiers, so the profile coordinate would not ' +
            'evaluate. Rename the parameter first.');
    }
    return parameter.name;
}
/** Resolve a source string back to a {@link BoxDimension}, or null. */
function dimensionFromSource(source, document) {
    if (NUMERIC_LITERAL_RE.test(source)) {
        const value = Number.parseFloat(source);
        return Number.isFinite(value) ? { kind: 'literal', value } : null;
    }
    const parameter = document.parameters.find((p) => p.name === source);
    return parameter ? { kind: 'parameter', parameterId: parameter.id } : null;
}
/** The `lengthExpression` an extrude carries for a height dimension. */
function heightExpression(dim, document) {
    return dimensionSource(dim, document, 'Height');
}
/** The four corner entities of a box profile, in winding order. */
function boxEntities(entityIds, widthSource, depthSource) {
    const nx = halfExpression(true, widthSource);
    const px = halfExpression(false, widthSource);
    const nz = halfExpression(true, depthSource);
    const pz = halfExpression(false, depthSource);
    const corners = [
        [nx, nz],
        [px, nz],
        [px, pz],
        [nx, pz],
    ];
    return corners.map(([x, z], i) => ({
        id: entityIds[i],
        kind: 'point',
        data: { x, z },
    }));
}
/**
 * Recover the authored dimensions of a box solid, or `null` when the solid's
 * profile was not authored by {@link makeAddBoxSolidMigrator} (a sketched
 * profile, an imported one, a rectangle written by hand in another spelling).
 *
 * ⭐ `null` is an ANSWER, not a failure: it is how a UI knows to show "this
 *    shape's profile is not a box this editor can edit" instead of a set of
 *    dimension fields that would silently rewrite something else.
 */
export function readBoxSolid(document, solidId) {
    const solid = document.solids.find((s) => s.id === solidId);
    if (!solid || solid.kind !== 'extrude')
        return null;
    const profile = document.profiles.find((p) => p.id === solid.profileId);
    if (!profile || profile.entities.length !== 4)
        return null;
    if (!profile.entities.every((e) => e.kind === 'point'))
        return null;
    const xs = profile.entities.map((e) => parseHalfExpression(e.data['x']));
    const zs = profile.entities.map((e) => parseHalfExpression(e.data['z']));
    if (xs.some((v) => v === null) || zs.some((v) => v === null))
        return null;
    const widthSource = xs[0].source;
    const depthSource = zs[0].source;
    if (!xs.every((v) => v.source === widthSource))
        return null;
    if (!zs.every((v) => v.source === depthSource))
        return null;
    // The winding this op writes: (−,−) (+,−) (+,+) (−,+).
    const signs = [
        [true, true],
        [false, true],
        [false, false],
        [true, false],
    ];
    for (let i = 0; i < 4; i++) {
        if (xs[i].negative !== signs[i][0] || zs[i].negative !== signs[i][1])
            return null;
    }
    const width = dimensionFromSource(widthSource, document);
    const depth = dimensionFromSource(depthSource, document);
    const height = dimensionFromSource(solid.lengthExpression.trim(), document);
    if (!width || !depth || !height)
        return null;
    return { solidId, profileId: profile.id, width, depth, height };
}
/**
 * Append ONE parametric box: a rectangular profile plus the extrude that
 * builds it. Both land in the same op because a profile with no solid is
 * geometry nothing evaluates, and a solid with no profile does not validate —
 * splitting them would make a half-applied box a persistable state.
 */
export function makeAddBoxSolidMigrator(from, to, params) {
    return {
        id: `add-box-solid:${params.solidId}`,
        from,
        to,
        description: `add box solid ${params.solidId} (profile ${params.profileId})`,
        apply(input) {
            const doc = input.document;
            if (doc.solids.some((s) => s.id === params.solidId)) {
                throw new Error(`solid ${params.solidId} already present`);
            }
            if (doc.profiles.some((p) => p.id === params.profileId)) {
                throw new Error(`profile ${params.profileId} already present`);
            }
            if (!doc.referencePlanes.some((pl) => pl.id === params.planeId)) {
                throw new Error(`reference plane ${params.planeId} is not carried by this definition; a profile ` +
                    'cannot be drawn on a plane that is not there');
            }
            if (params.entityIds.length !== 4 || new Set(params.entityIds).size !== 4) {
                throw new Error(`a box profile needs exactly 4 distinct corner entity ids (got ${params.entityIds.length})`);
            }
            const widthSource = dimensionSource(params.width, doc, 'Width');
            const depthSource = dimensionSource(params.depth, doc, 'Depth');
            const lengthExpression = heightExpression(params.height, doc);
            const profile = {
                id: params.profileId,
                name: params.profileName,
                planeId: params.planeId,
                entities: boxEntities(params.entityIds, widthSource, depthSource),
                constraints: [],
            };
            const solid = {
                id: params.solidId,
                kind: 'extrude',
                profileId: params.profileId,
                materialSlotId: params.materialSlotId ?? null,
                lod: { coarse: false, medium: true, fine: true },
                lengthExpression,
                // ⛔ +Y, and only +Y: `bakeFamilyInstance` REFUSES any other direction
                // rather than silently building a vertical extrusion (§4D-DIRECTION-IS-
                // NOT-READ). Writing anything else here would author a refusal.
                direction: { x: 0, y: 1, z: 0 },
            };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    profiles: [...doc.profiles, profile],
                    solids: [...doc.solids, solid],
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
/**
 * Re-dimension (or re-BIND) an existing box: literal → parameter is the §64
 * move, and it is the same op as parameter → literal.
 *
 * REFUSES a solid whose profile {@link readBoxSolid} does not recognise —
 * rewriting four corner points of a profile this op cannot read would destroy
 * authored geometry to satisfy a form.
 */
export function makeSetBoxDimensionsMigrator(from, to, params) {
    return {
        id: `set-box-dimensions:${params.solidId}`,
        from,
        to,
        description: `set box dimensions on ${params.solidId}`,
        apply(input) {
            const doc = input.document;
            const solid = doc.solids.find((s) => s.id === params.solidId);
            if (!solid)
                throw new Error(`solid ${params.solidId} not found`);
            const current = readBoxSolid(doc, params.solidId);
            if (!current) {
                throw new Error(`solid ${params.solidId} is not a box authored by add-box-solid (its profile does not ` +
                    'carry the four corner expressions this op writes, or one of them names a parameter ' +
                    'this definition no longer has); its geometry is not editable through this form');
            }
            if (params.width === undefined && params.depth === undefined && params.height === undefined) {
                throw new Error(`set-box-dimensions on ${params.solidId} was given no dimension to change`);
            }
            const next = {
                width: params.width ?? current.width,
                depth: params.depth ?? current.depth,
                height: params.height ?? current.height,
            };
            const widthSource = dimensionSource(next.width, doc, 'Width');
            const depthSource = dimensionSource(next.depth, doc, 'Depth');
            const lengthExpression = heightExpression(next.height, doc);
            const profiles = doc.profiles.map((pr) => pr.id === current.profileId
                ? {
                    ...pr,
                    // The entity IDS are preserved — a re-dimension is not a new
                    // profile, and a constraint or a representation naming an entity
                    // must keep naming the same one.
                    entities: boxEntities(pr.entities.map((e) => e.id), widthSource, depthSource),
                }
                : pr);
            const solids = doc.solids.map((s) => s.id === params.solidId && s.kind === 'extrude' ? { ...s, lengthExpression } : s);
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    profiles,
                    solids,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=box-solid.js.map