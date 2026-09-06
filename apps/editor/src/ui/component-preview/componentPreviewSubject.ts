/**
 * componentPreviewSubject — lane U5 (§COMPONENT-PREVIEW) · UIUX-PLAN §U3/§U1 ·
 * ADR-0376 D5/D10 · C84 EI-9 · C100 §5 · spec §75 · L-127.
 *
 * The THREE-free half of the component 3-D preview: given a component definition
 * (a `FamilyDocument` + manifest — saved OR an unsaved workspace draft) and a
 * parameter valuation (a type scope + optional instance overrides), produce the
 * {@link PreviewSubject} the shared element-preview rig draws.
 *
 * ─── ⭐ THE ONE EVALUATOR, NEVER A RIVAL (grep-for-the-existing-solver-first) ───
 * Every number here comes out of `bakeFamilyInstance` — the SAME call the placed
 * component's committer makes (`plugins/component`), riding the SAME resolver
 * (`resolveParameter`), the SAME profile evaluator (`profileToPolygon`), the SAME
 * unit seam (`runtimeLengthToMetres`) and the SAME kernel adapter. This module
 * computes NO dimension of its own: it forwards the bake's
 * `BufferGeometryDescriptor` buffers verbatim as {@link PreviewMeshPart}s and
 * derives only the CENTRING OFFSET (from the descriptors' own bounds) and the
 * subject key. That is L-127's rule — *"preview and placement MUST both call
 * this so preview ≡ placed"* — applied to components: a preview that re-derived
 * the geometry would be the second source of truth that rule exists to kill.
 *
 * ─── HONEST DEGRADATION (spec §75 · [[context-data-honesty-family]]) ───────────
 * A definition whose recipe cannot evaluate produces NO subject — the result is a
 * TYPED refusal carrying the bake's own diagnostics and per-solid refusal
 * sentences, for the mount to render. "Could not evaluate" and "evaluated to
 * nothing" and "evaluated" are three different values here, never one blank box.
 * A PARTIAL bake (some solids drawn, some refused) is `ok: true` with a non-empty
 * `unsupported` — the caption COUNTS what is shown against what the document
 * declares, so a partial render can never read as a complete one.
 *
 * ─── MATERIALS (declared limit, not a failure) ─────────────────────────────────
 * `MaterialSlotSchema` is `{id, name, defaultCategory}` — the document carries NO
 * material identity to resolve, so parts ship a neutral schematic hex via
 * `fallbackHex`. That is deliberately NOT the C100 §5 UNRESOLVED magenta: magenta
 * means "a named material was LOST", and a document that declares no material has
 * lost nothing. Recorded as OWED in lane-u5-preview.md for when slots gain ids.
 */

import type { FamilyDocument, FamilyManifest } from '@pryzm/file-format';
import type { ResolverDiagnostic } from '@pryzm/family-runtime';
import {
    bakeFamilyInstance,
    FamilyBakeError,
    type BakedSolid,
    type UnsupportedSolid,
} from '@pryzm/family-instance';
import type { PreviewMeshPart, PreviewSubject } from '../element-preview/OpeningPreviewSubject';

/** The family slice the bake consumes — structurally the loader's `LoadedFamily`,
 *  and equally the workspace's UNSAVED draft (whose `schemaHash` is the last
 *  saved one; the subject key hashes CONTENT below, so a draft edit always
 *  produces a new key even though its stored hash is stale). */
export interface ComponentPreviewFamily {
    readonly manifest: FamilyManifest;
    readonly document: FamilyDocument;
    readonly schemaHash: string;
}

export interface ComponentPreviewRequest {
    readonly family: ComponentPreviewFamily;
    /** The type scope to evaluate under. `null` refuses by name — the bake
     *  evaluates under a REAL type; inventing a scope would preview a document
     *  state that does not exist. */
    readonly typeId: string | null;
    readonly instanceOverrides?: Readonly<Record<string, number | string | boolean>>;
}

/** WHY there is no picture, as a NAMED value (the L-9600 lesson, one layer up). */
export type ComponentPreviewRefusalReason =
    | 'no-type'
    | 'unknown-type'
    | 'resolver-failed'
    | 'no-solids'
    | 'nothing-baked'
    | 'bake-threw';

export interface ComponentPreviewRefused {
    readonly ok: false;
    readonly reason: ComponentPreviewRefusalReason;
    /** The evaluator's own sentence(s), verbatim — never a paraphrase. */
    readonly message: string;
    readonly diagnostics: readonly ResolverDiagnostic[];
    readonly unsupported: readonly UnsupportedSolid[];
}

export interface ComponentPreviewBuilt {
    readonly ok: true;
    readonly subject: PreviewSubject;
    /** Resolver output keyed by parameter NAME — what the §64 demo reads. */
    readonly resolvedValues: Readonly<Record<string, number | string>>;
    /** Non-fatal resolver warnings. */
    readonly diagnostics: readonly ResolverDiagnostic[];
    /** Solids the bake REFUSED, each with its own sentence. Non-empty = PARTIAL —
     *  the caption already counts it; mounts should render these BY NAME. */
    readonly unsupported: readonly UnsupportedSolid[];
}

export type ComponentPreviewResult = ComponentPreviewBuilt | ComponentPreviewRefused;

/** Schematic hex for "this document declares no material" — see header. */
const UNASSIGNED_MATERIAL_HEX = '#aeb6c2';

/* ------------------------------------------------------------------ */
/* The subject key                                                     */
/* ------------------------------------------------------------------ */

/** djb2-xor over a string — a REBUILD key, not an identity: a collision costs one
 *  missed scene rebuild on the shared rig, never a wrong number (the parts are
 *  carried by value alongside the key). */
function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + s.length.toString(36);
}

/** Everything the bake's answer can depend on, and nothing else. */
function subjectKey(req: ComponentPreviewRequest): string {
    const d = req.family.document;
    const type = d.types.find((t) => t.id === req.typeId);
    return (
        'component:' + req.family.manifest.id + ':' +
        djb2(JSON.stringify({
            p: d.parameters,
            pr: d.profiles,
            s: d.solids,
            // ⭐ §82.1-PARAMETRIC-DATUM — ADDED, and the omission was a real defect,
            //    not a tidy-up. The bake reads `ReferencePlane.offsetExpression`
            //    (`bakeFamilyInstance`'s `resolvePlaneOffsetM`), so a plane's
            //    dimension IS something "the bake's answer can depend on". While it
            //    was absent, dimensioning a plane produced a NEW bake whose subject
            //    carried the OLD key — and `ElementPreviewRenderer` rebuilds content
            //    only when `subject.key` changed, so the numbers moved and the
            //    picture did not. [[three-invalidation-gates-in-series]]: the gate
            //    furthest upstream hides every fix downstream of it.
            rp: d.referencePlanes,
            t: req.typeId,
            tv: type?.values ?? null,
            o: req.instanceOverrides ?? null,
        }))
    );
}

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

function refusal(
    reason: ComponentPreviewRefusalReason,
    message: string,
    diagnostics: readonly ResolverDiagnostic[] = [],
    unsupported: readonly UnsupportedSolid[] = [],
): ComponentPreviewRefused {
    return { ok: false, reason, message, diagnostics, unsupported };
}

function partName(baked: BakedSolid, document: FamilyDocument, i: number): string {
    const solid = document.solids.find((s) => s.id === baked.solidId);
    const slotId = solid && 'materialSlotId' in solid ? solid.materialSlotId : null;
    const slot = slotId ? document.materialSlots.find((m) => m.id === slotId) : undefined;
    return slot?.name ?? `${baked.kind} ${i + 1}`;
}

/**
 * Evaluate the definition under the given valuation and build the drawable
 * subject. Async because the bake is async; pure otherwise — no store reads, no
 * DOM, no THREE (P2: typed arrays are ECMAScript).
 */
export async function buildComponentPreviewSubject(
    req: ComponentPreviewRequest,
): Promise<ComponentPreviewResult> {
    const { family, typeId } = req;
    const doc = family.document;

    if (typeId === null) {
        return refusal(
            'no-type',
            `${family.manifest.name} has ${doc.types.length} type(s) and the preview evaluates ` +
            'under a type — select one. Evaluating under an invented scope would preview a ' +
            'document state that does not exist.',
        );
    }

    let baked: readonly BakedSolid[];
    let unsupported: readonly UnsupportedSolid[];
    let resolvedValues: Readonly<Record<string, number | string>>;
    let diagnostics: readonly ResolverDiagnostic[];
    try {
        const res = await bakeFamilyInstance({
            family: { manifest: family.manifest, document: doc, schemaHash: family.schemaHash },
            typeId,
            ...(req.instanceOverrides ? { instanceOverrides: req.instanceOverrides } : {}),
        });
        baked = res.baked;
        unsupported = res.unsupported;
        resolvedValues = res.resolvedValues;
        diagnostics = res.diagnostics;
        if (!res.ok) {
            // Every solid refused. The message is the bake's own per-solid sentences.
            return refusal(
                'nothing-baked',
                unsupported.map((u) => u.message).join('\n') ||
                    `No solid of ${family.manifest.name} could be evaluated.`,
                diagnostics,
                unsupported,
            );
        }
    } catch (err) {
        if (err instanceof FamilyBakeError) {
            return refusal(err.code, err.message, err.diagnostics);
        }
        return refusal('bake-threw', err instanceof Error ? err.message : String(err));
    }

    /* ── union bounds over the descriptors' OWN bounds (computed by the producer
     *    over the same vertices — never re-measured here) ── */
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of baked) {
        const { min, max } = b.descriptor.bounds;
        if (min.x < minX) minX = min.x;
        if (min.y < minY) minY = min.y;
        if (min.z < minZ) minZ = min.z;
        if (max.x > maxX) maxX = max.x;
        if (max.y > maxY) maxY = max.y;
        if (max.z > maxZ) maxZ = max.z;
    }
    const ex = maxX - minX;
    const ey = maxY - minY;
    const ez = maxZ - minZ;
    // The renderer places a part at `center - [0, extentY/2, 0]`; solving for a
    // final position of -(union centre) gives ONE shared offset per part, so the
    // parts keep their relative placement and the whole subject orbits about its
    // own middle.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const center: readonly [number, number, number] = [-cx, -cy + ey / 2, -cz];

    const parts: PreviewMeshPart[] = baked.map((b, i) => ({
        kind: 'mesh' as const,
        name: partName(b, doc, i),
        position: b.descriptor.position,
        normal: b.descriptor.normal,
        index: b.descriptor.index,
        center,
        fallbackHex: UNASSIGNED_MATERIAL_HEX,
    }));

    const typeName = doc.types.find((t) => t.id === typeId)?.name ?? typeId;
    const declared = doc.solids.length;
    const caption =
        unsupported.length === 0
            ? `${family.manifest.name} · ${typeName} · ${baked.length} solid(s)`
            : `${family.manifest.name} · ${typeName} · ${baked.length} of ${declared} solid(s) shown — ` +
              `${unsupported.length} refused`;

    return {
        ok: true,
        subject: {
            key: subjectKey(req),
            parts,
            extent: [ex, ey, ez],
            caption,
        },
        resolvedValues,
        diagnostics,
        unsupported,
    };
}
