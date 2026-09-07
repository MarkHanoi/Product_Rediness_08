// §BIM-FROM-THE-DESIGN — DELIVERABLE 2: RECORD THE LINK, so walls can follow the envelope later.
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEAN THE CONTEXT WALLS —
// PERIMETER WALLS SHALL FOLLOW AND THE INTERIOR PARTITIONS TOO — AS PER BIM 3.0 PRINCIPLES."*
//
// The cascade itself is later work. THE LINK IS NOT, because nothing downstream can maintain a
// relationship that was never recorded, and the only moment at which "this wall is edge 3 of that
// envelope" is known for certain is the moment the wall is created.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE LINK CANNOT LIVE ON THE WALL. MEASURED, NOT ASSUMED.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  · `packages/schemas/src/elements/Wall.ts` has NO `derivedFrom`, NO `sourceElementId` and no
//    free-form bag. `provenance` is `{origin, detail?}` — no element id — and `serializeWall`
//    (`ProjectSerializer.ts:830-905`) does not write it for walls AT ALL.
//  · `metadata` (`:903`) and the engine's `properties` (`:901`) ARE serialised — and are NEVER
//    restored (`ProjectLoader.ts:1092-1148`).
// ⇒ EVERY on-wall route dies on reload. A link that vanishes on the next save/open is worse than
//   no link: it makes the cascade work in the session it was authored in and fail silently later.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE PERSISTABLE ROUTE IS THE SEMANTIC GRAPH — and it round-trips VERBATIM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `ProjectSerializer.ts:1868` writes `semanticGraphManager.serialize()`, which returns the
// `Relationship` rows unchanged (`SemanticGraph.ts:2540-2545`) — `metadata` and `authoredBy`
// included. `ProjectLoader.ts:2575` deserialises with an explicit UNREADABLE refusal
// (`absent: 'no-slice' | 'relationships-not-an-array'`) and a per-row drop report, and
// `deserialize` re-indexes each admitted row VERBATIM (`SemanticGraph.ts:2620-2622`). So a
// `metadata.edgeIndex` written here is the same integer after a save and an open.
//
// ⛔ NO NEW `RelationshipType`. The union has 29 members and none of them is `derivedFrom`; adding
// a 30th is a C67/C68 change (a persisted wire identifier replayed out of `project_command_log`),
// and this lane does not have that authority. Two EXISTING members carry the fact exactly:
//
//    wall  —boundedBy→  envelope     "this wall's line is a boundary of that envelope"
//    envelope —contains→  wall       the inverse, for "which walls came out of this envelope?"
//
// ⛔ NOT `derivesFrom` FROM `packages/building-graph`. That graph is a DERIVED, non-persisted
// projection and is pinned as such by `ubgSnapshotIsDerivedNotAuthored.test.ts`. A link recorded
// there would be re-derived away.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ FACE IDENTITY — THE OPEN QUESTION, ANSWERED FROM THE ACCEPTED FIELDS RATHER THAN INVENTED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `boundedBy` carries no face index of its own. `addRelationship` accepts exactly five caller
// fields (`SemanticGraph.ts:1094`, `Omit<Relationship,'id'|'createdAt'>`): `type`, `sourceId`,
// `targetId`, `metadata?` (`Record<string, string | number | boolean>`) and `authoredBy?`. So the
// edge payload CAN carry the edge index, and it does: `metadata.edgeIndex`, an integer indexing
// the envelope's STORED OPEN `footprint` ring, where edge *i* runs
// `footprint[i] → footprint[(i+1) % n]` — the same walk `planBuildFromDesign` and
// `CreateWallBatchHandler` use. `metadata.ringWelded` says whether the ring had to be reconciled
// with the wall domain first, and `edgeIndex: -1` means the provenance of THAT edge could not be
// recovered — never index 0.
//
// ⛔ `authoredBy` IS DELIBERATELY NOT USED. Its membership test (`SemanticGraph.ts:262-267`) is
// *"does the (sourceId, targetId) pair identify the edge's SUBJECT?"* Here it does: one wall
// derives from at most one edge of any ONE envelope, so `(wall, envelope, boundedBy)` is already a
// unique fact. A wall shared by two rooms yields TWO edges with different targets, not one
// collapsed edge. Passing `authoredBy` would opt into a second identity axis this family does not
// need, which the field's own doc warns against.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ TWO WRITE-TIME SIDE EFFECTS OF THESE TWO FAMILIES, BOTH BENIGN HERE, BOTH STATED
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. `addRelationship` clears `_boundaryUndetermined` for a `boundedBy` edge's SOURCE
//     (`:1101`). Our source is a WALL id; that map is keyed by ROOM ids, so the delete is a no-op.
//  2. It adds a `contains` edge's SOURCE to `_containsCovered` (`:1115`). Our source is an
//     ENVELOPE id, and `getContainedElements` is only ever called with a room id — so nothing
//     reads the mark. It is recorded here so the next reader is not surprised by it.
//
// ⚠ AND ONE REAL HAZARD, WHICH IS WHY BOTH LEGS ARE WRITTEN RATHER THAN ONE.
// `invalidateRegionConclusionsForMovedElement(x)` (`:1702`) removes every `boundedBy` edge whose
// SOURCE is a source-of-x, and marks those sources boundary-undetermined. Today it is called only
// with WALL ids (`UpdateWallBaselineCommand.ts:481/538`, `WallRebuildCoordinator.ts:1899`), and
// our `boundedBy` edge has the wall as its SOURCE — so `getSources(wallId, 'boundedBy')` cannot
// return it and a wall move does NOT purge the link. ⛔ But a future face-drag cascade that called
// the same helper with an ENVELOPE id WOULD purge every `wall —boundedBy→ envelope` edge and mark
// WALLS boundary-undetermined, polluting a room reader with wall ids. `contains` is explicitly
// ID-KEYED and named among the families that helper leaves alone (`:1697-1700`), so the inverse
// leg survives that. The pair is redundancy against a live hazard, not decoration — and
// `designEnvelopeWallLink.spec.ts` pins it.
//
// P6 — this module writes no store and dispatches no command. The semantic graph is not an
// element store; it is the relationship index the loader restores. P8 — a span per exported
// function.

import { trace } from '@opentelemetry/api';
import type { Relationship, RelationshipType } from '@pryzm/core-app-model';
import type { DerivedEdgeRef, PlannedWall } from './buildFromDesignPlan';

const _tracer = trace.getTracer('pryzm.site.designEnvelopeWallLink');

/**
 * Marks every edge this lane writes, so a reader can tell a design-envelope link from a
 * room-detection `boundedBy` edge without guessing from the id prefixes.
 */
export const DESIGN_ENVELOPE_LINK_TAG = 'design-envelope-wall';

/** The narrow slice of `SemanticGraphManager` this module needs. Injected, so specs stay headless. */
export interface EnvelopeWallLinkGraph {
    addRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): string;
    /** Sources of edges of `type` whose TARGET is `id`. */
    getSources(id: string, type?: RelationshipType): string[];
    /** Targets of edges of `type` whose SOURCE is `id`. */
    getTargets(id: string, type?: RelationshipType): string[];
    getAll(): Relationship[];
}

/** One wall, paired with the plan row that produced it. The caller mints the id. */
export interface WallLinkRow {
    readonly wallId: string;
    readonly kind: 'shell' | 'partition';
    readonly derivedFrom: DerivedEdgeRef;
    readonly alsoBounds: readonly DerivedEdgeRef[];
}

export interface EnvelopeWallLinkReport {
    /** How many walls got at least one edge pair. */
    readonly wallsLinked: number;
    /** How many `boundedBy` + `contains` edges were written in total. */
    readonly edgesWritten: number;
    /**
     * ⛔ NAMED, NEVER COUNTED AWAY. A wall whose plan row carried no recoverable envelope edge is
     * listed here with the reason — a link that silently did not happen is a cascade that silently
     * will not fire.
     */
    readonly unlinked: readonly { readonly wallId: string; readonly reason: string }[];
}

/**
 * PAIR the ids the caller minted with the plan rows that produced them. PURE — index-for-index,
 * which is exactly how `wall.batch.create` is dispatched (`walls[i]` carries `ids[i]`).
 *
 * ⛔ A LENGTH MISMATCH IS A REFUSAL, NOT A ZIP. Pairing the shorter of two arrays would attach the
 * wrong envelope edge to a real wall, and a wrong link is worse than a missing one: it would move
 * the wrong wall on the first cascade and there would be nothing in the model to say why.
 */
export function pairWallLinkRows(
    walls: readonly PlannedWall[],
    wallIds: readonly string[],
): { readonly ok: true; readonly rows: readonly WallLinkRow[] }
    | { readonly ok: false; readonly reason: string } {
    const span = _tracer.startSpan('pryzm.site.pairWallLinkRows');
    try {
        if (walls.length !== wallIds.length) {
            return {
                ok: false,
                reason: `the plan carries ${walls.length} wall${walls.length === 1 ? '' : 's'} but `
                    + `${wallIds.length} id${wallIds.length === 1 ? ' was' : 's were'} minted — PRYZM will `
                    + 'not pair them, because attaching the wrong envelope edge to a real wall would move '
                    + 'the wrong wall on the first cascade with nothing in the model to say why.',
            };
        }
        const rows: WallLinkRow[] = [];
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i]!;
            rows.push({
                wallId: wallIds[i]!,
                kind: w.kind,
                derivedFrom: w.derivedFrom,
                alsoBounds: w.alsoBounds,
            });
        }
        span.setAttribute('pryzm.envelopeWallLink.rows', rows.length);
        return { ok: true, rows: Object.freeze(rows) };
    } finally {
        span.end();
    }
}

function edgeMetadata(
    ref: DerivedEdgeRef,
    wallKind: 'shell' | 'partition',
    claim: 'primary' | 'also',
): Record<string, string | number | boolean> {
    return {
        pryzmLink: DESIGN_ENVELOPE_LINK_TAG,
        edgeIndex: ref.edgeIndex,
        envelopeRole: ref.envelopeRole,
        ringWelded: ref.ringWelded,
        wallKind,
        claim,
    };
}

/**
 * Write the envelope → wall link into the semantic graph. Never throws; a graph that rejects one
 * edge does not stop the rest.
 *
 * Two edges per claim, and the pair is the point — see the header's hazard note.
 */
export function recordEnvelopeWallLinks(
    graph: EnvelopeWallLinkGraph,
    rows: readonly WallLinkRow[],
    createdBy = 'system',
): EnvelopeWallLinkReport {
    const span = _tracer.startSpan('pryzm.site.recordEnvelopeWallLinks');
    try {
        let edgesWritten = 0;
        let wallsLinked = 0;
        const unlinked: { wallId: string; reason: string }[] = [];

        for (const row of rows) {
            const claims: { ref: DerivedEdgeRef; claim: 'primary' | 'also' }[] = [
                { ref: row.derivedFrom, claim: 'primary' },
                ...row.alsoBounds.map((r) => ({ ref: r, claim: 'also' as const })),
            ];
            let wrote = 0;
            for (const { ref, claim } of claims) {
                if (!ref.envelopeId) {
                    continue;
                }
                const metadata = edgeMetadata(ref, row.kind, claim);
                try {
                    graph.addRelationship({
                        type: 'boundedBy',
                        sourceId: row.wallId,
                        targetId: ref.envelopeId,
                        metadata,
                        createdBy,
                    });
                    graph.addRelationship({
                        type: 'contains',
                        sourceId: ref.envelopeId,
                        targetId: row.wallId,
                        metadata,
                        createdBy,
                    });
                    edgesWritten += 2;
                    wrote++;
                } catch (e) {
                    unlinked.push({
                        wallId: row.wallId,
                        reason: `the graph refused the edge to envelope ${ref.envelopeId}: ${String(e)}`,
                    });
                }
            }
            if (wrote > 0) wallsLinked++;
            else {
                unlinked.push({
                    wallId: row.wallId,
                    reason: row.derivedFrom.edgeIndex < 0
                        ? 'the envelope edge this wall came from could not be recovered after the ring was '
                          + 'reconciled with the wall domain, so no face is named — this wall will NOT follow '
                          + 'the envelope.'
                        : 'no envelope id was carried on this wall\'s plan row.',
                });
            }
        }

        span.setAttribute('pryzm.envelopeWallLink.edges', edgesWritten);
        span.setAttribute('pryzm.envelopeWallLink.unlinked', unlinked.length);
        return { wallsLinked, edgesWritten, unlinked: Object.freeze(unlinked) };
    } finally {
        span.end();
    }
}

/** One recovered link — which wall came from which envelope edge. */
export interface RecoveredEnvelopeWallLink {
    readonly wallId: string;
    readonly envelopeId: string;
    readonly edgeIndex: number;
    readonly envelopeRole: string;
    readonly wallKind: string;
    readonly claim: string;
    readonly ringWelded: boolean;
}

/**
 * Read back every wall this lane derived from `envelopeId`.
 *
 * ⛔ RETURNS `null` — NOT `[]` — WHEN THE GRAPH CANNOT BE READ. "the graph is not available" and
 * "this envelope produced no walls" are the same value under an empty array, and that is the
 * §CONTEXT-DATA-HONESTY defect the whole product is written against. A cascade that read `[]` from
 * an unreadable graph would report "0 walls follow this face" about a building full of them.
 */
export function readWallsDerivedFromEnvelope(
    graph: EnvelopeWallLinkGraph | null | undefined,
    envelopeId: string,
): readonly RecoveredEnvelopeWallLink[] | null {
    const span = _tracer.startSpan('pryzm.site.readWallsDerivedFromEnvelope');
    try {
        if (!graph || typeof graph.getAll !== 'function') return null;
        let all: Relationship[];
        try {
            all = graph.getAll();
        } catch {
            return null;
        }
        const out: RecoveredEnvelopeWallLink[] = [];
        for (const rel of all) {
            if (rel.type !== 'boundedBy') continue;
            if (rel.targetId !== envelopeId) continue;
            const md = rel.metadata;
            if (!md || md.pryzmLink !== DESIGN_ENVELOPE_LINK_TAG) continue;
            out.push({
                wallId: rel.sourceId,
                envelopeId: rel.targetId,
                edgeIndex: typeof md.edgeIndex === 'number' ? md.edgeIndex : -1,
                envelopeRole: typeof md.envelopeRole === 'string' ? md.envelopeRole : 'unknown',
                wallKind: typeof md.wallKind === 'string' ? md.wallKind : 'unknown',
                claim: typeof md.claim === 'string' ? md.claim : 'unknown',
                ringWelded: md.ringWelded === true,
            });
        }
        out.sort((a, b) => (a.edgeIndex !== b.edgeIndex
            ? a.edgeIndex - b.edgeIndex
            : (a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : 0)));
        span.setAttribute('pryzm.envelopeWallLink.recovered', out.length);
        return Object.freeze(out);
    } finally {
        span.end();
    }
}
