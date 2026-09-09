// The three massing-group verbs: setStoreys · rename · dissolve.
// ADR-0383 §4 / §4a / D2 / D7 · C114 §6 / §6e / §8 · C16 CA-2 / CA-3 / CA-14 · P6.
//
// Grouped in ONE file for the reason `MutateSpaceEnvelope.ts` gives: they share the store, the
// record shape and the membership rule. Each class is still its own handler with its own verb.
//
// ⛔ AND A NEW BARREL FILE WAS DELIBERATELY NOT CREATED. `check-otel-spans.ts` ZONE B (plugin
// barrels) reads 52 / 52 — a shrink-only ratchet with ZERO headroom, and a ratchet exceeded is
// never absorbable via `gate-debt.json` (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836). These
// register through the existing `handlers/index.ts`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY `setStoreys` IS ONE VERB IN BOTH DIRECTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder: *"decide ad-hoc if i want to reduce or increase the levels"* — one control, one
// intent, one undo. ⛔ `addStorey` + `removeStorey` would let a surface implement "go from 3 to 6"
// as three dispatches and spend THREE Ctrl+Zs on one gesture, which is RESI-ORCHESTRATOR-PLAN §6
// risk 7 and the trap C114 §6a exists to close: `batchCoordinator.runBatch` is undo-NEUTRAL, so the
// ONLY thing that buys one undo entry is one `produceCommand`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE SURFACE RESOLVES THE STOREYS; THIS HANDLER APPLIES THEM (ORCHESTRATOR RULING, ADR-0383 §4a)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0383 §4 first shaped the payload as `{ groupId, targetStoreys, mintedIds[], startStoreyId? }`.
// That is **not satisfiable by a single-store handler**: deciding WHICH storeys to add needs BIM
// level elevations, which the space-envelope store does not hold. Reading them here would make this
// handler multi-store and cost the one-`produceCommand`/one-Ctrl-Z property the family exists for —
// and INVENTING an elevation the level store never stated is the C58 §1.4 / L-616 fabrication.
//
// So `added: [{ spaceEnvelopeId, levelId, baseOffset, height }]` arrives resolved, from
// `apps/editor/src/ui/site/massingGroupStoreyPlan.ts`. Same division `buildEnvelopeAuthoringPlan`
// already uses: the planner decides, the verb executes. ⛔ `added` is EMPTY on a shrink — removing
// from the top needs no geometry.
//
// ⚠ WHAT THE HANDLER STILL DECIDES, AND IT IS EXACTLY ONE THING: the FOOTPRINT a grown storey gets.
// §4a(b) rules it the TOP-SEATED member's ring — you stack onto what is there, and copying the
// ground ring would silently undo a set-back the designer already drew. That ring is in THIS store,
// so reading it here costs nothing and inventing nothing. The DISCLOSURE when the top and ground
// rings differ is the surface's (`MassingGroupRingAssumption`), because only the surface can show it
// before the click.
//
// ⛔⛔ ONE RULE, TWO PLACES — RECORDED RATHER THAN ASSUMED AWAY. The surface NAMES which ring will be
// copied; this handler PERFORMS the copy. That is the shape this repository keeps failing, and it is
// tolerable only because one side is a SENTENCE and the other is the ACT. `massingGroupStoreyPlan.ts`
// records the same obligation from its end. **The cross-check test that pins them equal is OWED** and
// is named in the lane report; it cannot be written from inside this plugin, which may not import an
// L7 app module.

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import { SpaceEnvelope } from '@pryzm/plugin-sdk';
import { recomputeSpaceEnvelopeMetrics } from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';
import { SpaceEnvelopeGeometryError } from '../errors.js';
import { massingGroupMembers } from '../groupMembership.js';
import { removeEnvelopesFromDraft } from './removeEnvelopes.js';

type Stores = Readonly<{ spaceEnvelope: SpaceEnvelopesState } & Record<string, unknown>>;

/** The verb roster this file owns, so `index.ts` cannot list one it does not build. */
export const MASSING_GROUP_VERBS = [
    'spaceEnvelope.group.setStoreys',
    'spaceEnvelope.group.rename',
    'spaceEnvelope.group.dissolve',
] as const;

type MemberLookup =
    | { readonly ok: true; readonly members: readonly SpaceEnvelopeData[] }
    | { readonly ok: false; readonly reason: string };

/**
 * ⛔ THE ONE REFUSAL ALL THREE VERBS SHARE: A GROUP WITH NO MEMBERS IS NOT ADDRESSABLE.
 *
 * ADR-0383 D2 / C114 §6e clause 6: *"an empty group is not representable, and that is correct, not
 * a limitation"* — a group exists because its envelopes carry its id. So a `groupId` nothing
 * carries is not an empty group; it is a group that does not exist, and every one of these verbs
 * would otherwise SUCCEED VACUOUSLY — writing nothing, minting an undo entry, and telling the user
 * their rename worked. §CONTEXT-DATA-HONESTY: "there is nothing to change" and "there is no such
 * building" are different answers and must not share an outcome.
 */
function _membersOrRefusal(stores: Stores, groupId: unknown): MemberLookup {
    if (typeof groupId !== 'string' || groupId.trim().length === 0) {
        return {
            ok: false,
            reason: 'groupId must be a non-empty string — the ungrouped bucket has no id, so no group verb can address it',
        };
    }
    const members = massingGroupMembers(Object.values(stores.spaceEnvelope), groupId);
    if (members.length === 0) {
        return {
            ok: false,
            reason:
                `no massing group "${groupId}" — no envelope carries that id. A group exists because `
                + 'its envelopes carry it; nothing was changed.',
        };
    }
    return { ok: true, members };
}

function _validated(candidate: unknown): SpaceEnvelopeData {
    const parsed = SpaceEnvelope.safeParse(candidate);
    if (!parsed.success) {
        throw new SpaceEnvelopeGeometryError(
            parsed.error.issues[0]?.message ?? 'invalid space envelope',
        );
    }
    return parsed.data as SpaceEnvelopeData;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RENAME
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface RenameMassingGroupPayload {
    readonly groupId: string;
    /** The new building name. ⛔ Blank is REFUSED — the schema's `label: z.string().min(1)`. */
    readonly label: string;
}

/**
 * Rewrite one massing group's label on EVERY member, in ONE `produceCommand`.
 *
 * ⭐ THIS VERB IS THE FIRST OF THE THREE THINGS THAT PAY FOR `label` BEING DENORMALISED.
 * `SpaceEnvelopeGroupSchema`'s doc names the cost — N copies of one string can drift — and names
 * this verb as *"the ONLY writer"*, atomic and one undo. Renaming a twelve-storey block is ONE ring
 * entry, not twelve.
 *
 * ⛔ NO ROLE FILTER. A `role: 'room'` envelope that carries the group is rewritten too. Filtering to
 * `role: 'level'` would leave a room holding the OLD label — a drift this verb exists to prevent,
 * created by the verb itself, and invisible until `readMassingGroups` reported a `labelDisagreement`
 * nobody could explain.
 */
export class RenameMassingGroupHandler
implements CommandHandler<RenameMassingGroupPayload, Stores> {
    readonly type = 'spaceEnvelope.group.rename';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: RenameMassingGroupPayload): ValidationResult {
        const found = _membersOrRefusal(ctx.stores, cmd.groupId);
        if (!found.ok) return { valid: false, reason: found.reason };
        if (typeof cmd.label !== 'string' || cmd.label.trim().length === 0) {
            // The schema refuses it too (`label: z.string().min(1)`); refusing here as well is
            // C16 CA-3 — refuse before mutating, rather than throwing mid-`produceCommand`.
            return { valid: false, reason: 'label must be a non-empty building name' };
        }
        const label = cmd.label.trim();
        // ⛔ A NO-OP IS REFUSED, the rule `setParameter` already keeps (C113 §6.4): it would mint a
        // ring-buffer entry and spend the user's next Ctrl+Z on an edit that never happened.
        // ⚠ "No-op" means EVERY member already reads exactly this. When members DISAGREE (the
        // denormalisation drift this verb repairs), renaming to the label some of them already
        // carry is NOT a no-op — it is the fix.
        if (found.members.every((e) => e.group?.label === label)) {
            return { valid: false, reason: `every envelope in this group is already named "${label}" — nothing to change` };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: RenameMassingGroupPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.massingGroup.id': cmd.groupId },
            (span) => {
                const found = _membersOrRefusal(ctx.stores, cmd.groupId);
                if (!found.ok) throw new SpaceEnvelopeGeometryError(found.reason);
                const label = cmd.label.trim();
                const updated = found.members.map((e) => _validated({
                    ...e,
                    group: { id: cmd.groupId, label },
                }));
                span.setAttribute('pryzm.massingGroup.members', updated.length);
                const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                    ctx.stores.spaceEnvelope,
                    (draft) => {
                        // ONE producer for N members — one Immer patch pair, one Ctrl+Z.
                        for (const e of updated) (draft as Record<string, unknown>)[e.id] = e;
                    },
                );
                return { forward, inverse, nextStates: { spaceEnvelope: next } };
            },
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DISSOLVE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface DissolveMassingGroupPayload {
    readonly groupId: string;
}

/**
 * Clear `group` on every member. ⛔ **THIS DOES NOT DELETE ANYTHING.**
 *
 * ADR-0383 §4: *"a verb whose name says 'ungroup' and whose effect is 'destroy three buildings' is
 * the worst kind of irreversible surprise."* Deleting is `spaceEnvelope.delete`, which already
 * exists. Every envelope survives; it simply returns to the UNGROUPED BUCKET, which is where every
 * envelope written before ADR-0383 already lives — so a dissolved group leaves a project in a state
 * the product has always been able to represent.
 */
export class DissolveMassingGroupHandler
implements CommandHandler<DissolveMassingGroupPayload, Stores> {
    readonly type = 'spaceEnvelope.group.dissolve';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: DissolveMassingGroupPayload): ValidationResult {
        const found = _membersOrRefusal(ctx.stores, cmd.groupId);
        if (!found.ok) return { valid: false, reason: found.reason };
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: DissolveMassingGroupPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.massingGroup.id': cmd.groupId },
            (span) => {
                const found = _membersOrRefusal(ctx.stores, cmd.groupId);
                if (!found.ok) throw new SpaceEnvelopeGeometryError(found.reason);
                const updated = found.members.map((e) => _validated({ ...e, group: null }));
                span.setAttribute('pryzm.massingGroup.members', updated.length);
                const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                    ctx.stores.spaceEnvelope,
                    (draft) => {
                        for (const e of updated) (draft as Record<string, unknown>)[e.id] = e;
                    },
                );
                return { forward, inverse, nextStates: { spaceEnvelope: next } };
            },
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SET STOREYS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** One storey the verb will ADD. ⛔ Resolved by the SURFACE — see the header. */
export interface MassingGroupAddedStorey {
    /** Minted by the CALLER (C16 CA-2): `execute()` runs again on redo. */
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    /**
     * Metres above the **PROJECT datum** — an ABSOLUTE seat, taken from the storey's elevation.
     * ⛔ §BASE-OFFSET-IS-ABSOLUTE (L-13286): adding the storey elevation to a relative offset counts
     * it twice, and produced a false *"your building is too tall"* refusal.
     */
    readonly baseOffset: number;
    readonly height: number;
}

export interface SetMassingGroupStoreysPayload {
    readonly groupId: string;
    readonly targetStoreys: number;
    /** ⛔ EMPTY on a shrink. Length is CROSS-CHECKED against the target — see `canExecute`. */
    readonly added: readonly MassingGroupAddedStorey[];
}

/** The group's storeys, lowest seat first. ⛔ `role: 'level'` only — a room is not a storey. */
function _storeysOf(members: readonly SpaceEnvelopeData[]): readonly SpaceEnvelopeData[] {
    return [...members]
        .filter((e) => e.role === 'level')
        .sort((a, b) => (a.baseOffset - b.baseOffset) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Grow or shrink one massing group's storey stack. ONE verb, both directions, ONE undo.
 *
 * ⛔ A TARGET OF ZERO IS REFUSED, and that is not pedantry. It would remove every storey of the
 * building — a DELETE wearing a resize's name, and ADR-0383 §4 rejects exactly that shape for
 * `dissolve`. An empty group is not representable (D2), so "take this block to 0 storeys" has no
 * result that can be written; the verb that destroys a building is `spaceEnvelope.delete`.
 */
export class SetMassingGroupStoreysHandler
implements CommandHandler<SetMassingGroupStoreysPayload, Stores> {
    readonly type = 'spaceEnvelope.group.setStoreys';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: SetMassingGroupStoreysPayload): ValidationResult {
        const found = _membersOrRefusal(ctx.stores, cmd.groupId);
        if (!found.ok) return { valid: false, reason: found.reason };
        const target = cmd.targetStoreys;
        if (typeof target !== 'number' || !Number.isFinite(target) || !Number.isInteger(target)) {
            return { valid: false, reason: `targetStoreys must be a whole number of storeys (got ${String(target)})` };
        }
        if (target < 1) {
            return {
                valid: false,
                reason:
                    `a building has at least one storey — ${target} would remove every storey of this `
                    + 'block, which is a delete wearing a resize\'s name. Use spaceEnvelope.delete.',
            };
        }
        const storeys = _storeysOf(found.members);
        if (storeys.length === 0) {
            return {
                valid: false,
                reason:
                    `this group carries ${found.members.length} envelope(s) but no level envelopes, so `
                    + 'it has no storey stack to resize. Nothing was changed.',
            };
        }
        const added = Array.isArray(cmd.added) ? cmd.added : null;
        if (added === null) return { valid: false, reason: 'added must be an array of resolved storeys' };
        const current = storeys.length;
        if (current === target) {
            // C113 §6.4 again — a no-op still costs the user a Ctrl+Z.
            return { valid: false, reason: `this block already has ${current} storey${current === 1 ? '' : 's'} — nothing to change` };
        }
        const wanted = Math.max(0, target - current);
        // ⛔⛔ THE CROSS-CHECK. The surface resolved `added` and the surface named `targetStoreys`;
        // if those two disagree the handler is being asked to produce a stack of a size nobody
        // decided. Refusing with BOTH numbers is the only honest outcome — silently trusting either
        // one would make the button's label and the store's contents two different answers.
        if (added.length !== wanted) {
            return {
                valid: false,
                reason:
                    `this block has ${current} storey${current === 1 ? '' : 's'} and was asked for `
                    + `${target}, which needs ${wanted} new storey${wanted === 1 ? '' : 's'} — but `
                    + `${added.length} ${added.length === 1 ? 'was' : 'were'} supplied. Nothing was changed.`,
            };
        }
        const seen = new Set<string>();
        for (const a of added) {
            if (typeof a?.spaceEnvelopeId !== 'string' || a.spaceEnvelopeId.length === 0) {
                return { valid: false, reason: 'each added storey needs a caller-minted spaceEnvelopeId' };
            }
            if (seen.has(a.spaceEnvelopeId)) {
                return { valid: false, reason: `duplicate id within the added storeys: ${a.spaceEnvelopeId}` };
            }
            seen.add(a.spaceEnvelopeId);
            if (ctx.stores.spaceEnvelope[a.spaceEnvelopeId]) {
                return { valid: false, reason: `duplicate space envelope id: ${a.spaceEnvelopeId}` };
            }
            if (typeof a.levelId !== 'string' || a.levelId.length === 0) {
                return { valid: false, reason: 'each added storey is seated on a level — levelId is required' };
            }
            if (!(typeof a.height === 'number' && a.height > 0)) {
                return { valid: false, reason: `height must be greater than 0 (got ${String(a.height)})` };
            }
            if (typeof a.baseOffset !== 'number' || !Number.isFinite(a.baseOffset)) {
                return { valid: false, reason: `baseOffset must be a finite number (got ${String(a.baseOffset)})` };
            }
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: SetMassingGroupStoreysPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            {
                'pryzm.command.type': this.type,
                'pryzm.massingGroup.id': cmd.groupId,
                'pryzm.massingGroup.targetStoreys': cmd.targetStoreys,
            },
            (span) => {
                const found = _membersOrRefusal(ctx.stores, cmd.groupId);
                if (!found.ok) throw new SpaceEnvelopeGeometryError(found.reason);
                const storeys = _storeysOf(found.members);
                const current = storeys.length;
                const target = cmd.targetStoreys;
                span.setAttribute('pryzm.massingGroup.currentStoreys', current);
                span.setAttribute('pryzm.massingGroup.direction', target > current ? 'grow' : 'shrink');

                if (target < current) {
                    // ── SHRINK: remove from the TOP, through the ONE implementation of C114 §8.
                    // ⛔ `removeEnvelopesFromDraft` is shared with `spaceEnvelope.delete` and the
                    // `supersedes` half of the create verb, so a room that named a removed storey
                    // has its `withinId` CLEARED, never cascaded — and that half is in the SAME
                    // patch pair, so one Ctrl+Z restores the storeys AND re-points their rooms.
                    const doomed = storeys.slice(target).map((e) => e.id);
                    span.setAttribute('pryzm.massingGroup.removed', doomed.length);
                    const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                        ctx.stores.spaceEnvelope,
                        (draft) => { removeEnvelopesFromDraft(draft as SpaceEnvelopesState, doomed); },
                    );
                    return { forward, inverse, nextStates: { spaceEnvelope: next } };
                }

                // ── GROW: the TOP-seated member's ring, per ADR-0383 §4a(b). `_storeysOf` sorts by
                // seat ascending, so the last entry is the top. ⛔ NOT the ground ring: copying that
                // would silently undo a set-back the designer already drew.
                const top = storeys[storeys.length - 1]!;
                span.setAttribute('pryzm.massingGroup.ringFrom', top.id);
                const group = top.group ?? null;
                const fresh = cmd.added.map((a) => {
                    // ⛔ THE VERTICES ARE COPIED, not the array. A `slice()` of shared point objects
                    // is a second array over the SAME points, and anything that later mutates one
                    // vertex in place would move every storey at once (§ENVELOPE-PER-LEVEL).
                    const footprint = top.footprint.map((p) => ({ x: p.x, y: 0, z: p.z }));
                    const metrics = recomputeSpaceEnvelopeMetrics({
                        id: a.spaceEnvelopeId,
                        footprint,
                        baseOffset: a.baseOffset,
                        height: a.height,
                    });
                    return _validated({
                        id: a.spaceEnvelopeId,
                        type: 'spaceEnvelope',
                        levelId: a.levelId,
                        footprint,
                        baseOffset: a.baseOffset,
                        height: a.height,
                        role: 'level',
                        withinId: null,
                        // ⭐ THE GROUP IS COPIED FROM THE BLOCK ITSELF, never taken from the payload.
                        // A caller that could name the group of a storey it is adding to a group
                        // could add it to a DIFFERENT one, which is a second answer to "which
                        // building is this".
                        group,
                        // ⭐ The provenance of the storey being extended, carried forward: the user
                        // grew a block they authored, so the new storey is theirs (C75 §2.2 —
                        // `authored` is unrepresentable to a system pass, so it is never stamped
                        // here; it is INHERITED from the record that already carried it).
                        ...(top.provenance !== undefined ? { provenance: top.provenance } : {}),
                        name: top.name === undefined
                            ? undefined
                            : `${String(top.name).replace(/ · \d+ m²$/u, '')} · storey added`,
                        footprintAreaM2: metrics.footprintAreaM2,
                        volumeM3: metrics.volumeM3,
                    });
                });
                span.setAttribute('pryzm.massingGroup.added', fresh.length);
                const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                    ctx.stores.spaceEnvelope,
                    (draft) => {
                        for (const e of fresh) (draft as Record<string, unknown>)[e.id] = e;
                    },
                );
                return { forward, inverse, nextStates: { spaceEnvelope: next } };
            },
        );
    }
}
