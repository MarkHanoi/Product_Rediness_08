// spaceEnvelopeRecord — the ONE place a space-envelope RECORD is built from a spec.
//
// C114 §2b / §5 / §6d · C84 EI-9 · ADR-0383 S4.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS FILE EXISTS — IT WAS EXTRACTED THE MOMENT THERE WERE TWO OF IT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// This was `CreateSpaceEnvelopeBatchHandler._recordOf` — private, and correct while it had ONE
// caller. Then ADR-0383 S4's `spaceEnvelope.group.setStoreys` had to build a level envelope too:
// when a block GROWS, the new storey is a record of exactly this shape. A second copy of the
// builder duly appeared in `MassingGroupCommands.ts`.
//
// ⛔ THAT IS THIS REPOSITORY'S DOMINANT DEFECT, AND IT WAS CAUGHT BY COUNTING RATHER THAN BY
// NOTICING: `grep -n "type: 'spaceEnvelope'," src/handlers/*.ts` returned **2**. The two copies
// agreed on the day they were written and would have drifted on the first field either side
// gained — and the guarding suite would have stayed green, because it measured the other one.
//
// ⚠ THE FIELDS AT STAKE ARE NOT COSMETIC. `footprintAreaM2` and `volumeM3` are the two CACHE
// fields C114 §2b names exactly ONE writer for (`recomputeSpaceEnvelopeMetrics`); a second builder
// that forgot to recompute them would put an area in the store that the geometry disagrees with,
// which is the C84 EI-9 defect with a number attached to it.
//
// ⭐ AND THE UNIFICATION IS HONEST, NOT MERELY CONVENIENT: *"grow this block by one storey"* IS
// *"create one level envelope"*. They were always the same act; only the gesture around them
// differed. So `setStoreys` builds a `CreateSpaceEnvelopeSpec` and calls this, exactly as the
// batch create path does.
//
// PURE: no store, no DOM, no I/O, no clock, no RNG, and no span — it runs inside its callers'
// handler spans, and a span here would instrument the same work twice (the `removeEnvelopes.ts`
// precedent). It never throws: an invalid spec yields an invalid candidate and the SCHEMA refuses
// it at the caller, which is C16 CA-3 — refuse before mutating.

import { recomputeSpaceEnvelopeMetrics } from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData } from './store.js';
import type { SpaceEnvelopeRole, SpaceEnvelopeGroup } from '@pryzm/plugin-sdk';

export interface Pt {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface CreateSpaceEnvelopeSpec {
    /**
     * ⚠ CA-2 — MINTED BY THE CALLER, NEVER HERE. `execute()` runs again on REDO, so
     * minting inside the handler would produce a DIFFERENT envelope the second time
     * and orphan every `withinId` that pointed at the first.
     */
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly Pt[];
    readonly baseOffset?: number;
    readonly height?: number;
    readonly role?: SpaceEnvelopeRole;
    readonly withinId?: string | null;
    readonly name?: string;
    readonly occupancy?: string;
    readonly materialColor?: string;
    /**
     * §L-13038 — WHO produced this envelope (C75 §1.1 / §2.2), carried into the
     * record so it survives save/load and so a later gesture can tell a plate PRYZM
     * COMPUTED from a volume the user AUTHORED.
     *
     * ⛔ Typed off the schema (`SpaceEnvelopeData['provenance']`) rather than
     * re-imported: the provenance vocabulary lives at `@pryzm/schemas/provenance`,
     * which is deliberately NOT on the root barrel this plugin reaches through, and
     * a hand-written structural copy of it here would be C84 EI-8. Omitted ⇒ the
     * schema's own retrofit default (`predates-provenance`), which is honest: a
     * caller that says nothing has told us nothing.
     */
    readonly provenance?: SpaceEnvelopeData['provenance'];
    /**
     * ⭐ WHICH BUILDING (massing group) this envelope belongs to — ADR-0383 D1 / C114 §6d
     * clause 6 / §6e. A parcel may hold several independent buildings; this is what makes one
     * distinguishable from another, and it is the field
     * `resolveLevelEnvelopeSupersession` buckets on so that creating Block B cannot delete
     * Block A (D3).
     *
     * ⛔ IT IS `?`, NOT `| null` ALONE, AND THAT IS THE WHOLE POINT OF THE SHAPE.
     * "The caller said nothing" and "the caller said explicitly ungrouped" reach the SAME
     * stored value today — `null`, the ungrouped bucket — but they must reach it by
     * DIFFERENT ROUTES: omitted lets the schema's own `.default(null)` apply, explicit
     * `null` is a statement this caller made. §CONTEXT-DATA-HONESTY (L-581 / L-616) is that a
     * failure-to-state and an emptiness must never share a code path, because the day they
     * need to differ the distinction has to still exist. Same shape as `provenance` above,
     * for the same reason.
     *
     * ⛔ IT IS NOT `withinId`. `withinId` is CONTAINMENT (a room inside a level envelope) and
     * is refined to `null` for `role: 'level'`; `group` is IDENTITY, and a `role: 'level'`
     * record is exactly the one that carries it. Conflating them would make "Block A" mean
     * "inside Block A's ground floor" (C114 §6e clause 1).
     *
     * ⛔ AND IT IS NOT THE CONTAINMENT AUTHORITY. ADR-0385 / ADR-0328: `hierarchyStore`
     * answers *"which building is this element in"* for the exporter and both trees; `group`
     * is the massing-stage AUTHORING axis and PROJECTS into it, as `partOf` does. Nothing
     * downstream may read this field to answer that question.
     */
    readonly group?: SpaceEnvelopeGroup | null;
}

/**
 * The record as the schema sees it — used by BOTH `canExecute` and `execute`, so
 * the gate and the mutation can never disagree about what is being written.
 *
 * ⭐ `footprintAreaM2` AND `volumeM3` ARE RECOMPUTED, NEVER READ FROM THE PAYLOAD
 * (C114 §5). A caller who could supply the area of their own polygon could make
 * the intended-area channel disagree with the geometry it is drawn from — and the
 * ONE writer of those two fields is `recomputeSpaceEnvelopeMetrics` (C114 §2b).
 */
export function spaceEnvelopeRecordOf(spec: CreateSpaceEnvelopeSpec): Record<string, unknown> {
    const footprint = (spec.footprint ?? []).map((p) => ({ x: p.x, y: 0, z: p.z }));
    const height = spec.height ?? 3;
    const baseOffset = spec.baseOffset ?? 0;
    const metrics = recomputeSpaceEnvelopeMetrics({
        id: spec.spaceEnvelopeId,
        footprint,
        baseOffset,
        height,
    });
    return {
        id: spec.spaceEnvelopeId,
        type: 'spaceEnvelope',
        levelId: spec.levelId,
        footprint,
        baseOffset,
        height,
        role: spec.role ?? 'room',
        withinId: spec.withinId ?? null,
        ...(spec.name !== undefined ? { name: spec.name } : {}),
        ...(spec.occupancy !== undefined ? { occupancy: spec.occupancy } : {}),
        ...(spec.materialColor !== undefined ? { materialColor: spec.materialColor } : {}),
        // §L-13038 — carried through UNTOUCHED, and absent when the caller said nothing, so
        // the schema's retrofit default (`predates-provenance`) applies rather than an
        // origin this handler would have had to invent. ⛔ The handler never upgrades,
        // downgrades or defaults an origin: C75 §2.2 makes `authored` unrepresentable to a
        // system pass, and a create verb that stamped one would defeat that by hand.
        ...(spec.provenance !== undefined ? { provenance: spec.provenance } : {}),
        // ⭐ ADR-0383 / C114 §6d clause 6 — carried through UNTOUCHED, and ABSENT when the caller
        // said nothing, so the schema's own `.default(null)` applies rather than a group this
        // handler would have had to invent. ⛔ The handler never mints, defaults, upgrades or
        // INFERS a group: a create verb that guessed which building an envelope belongs to would
        // be deciding the master plan on the user's behalf, and the supersession rule buckets on
        // this exact field — a wrong guess here DELETES another block (§6e clause 3).
        ...(spec.group !== undefined ? { group: spec.group } : {}),
        footprintAreaM2: metrics.footprintAreaM2,
        volumeM3: metrics.volumeM3,
    };
}
