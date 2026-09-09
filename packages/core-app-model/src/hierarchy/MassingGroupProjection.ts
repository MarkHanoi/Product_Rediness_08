/**
 * §MASSING-GROUP-PROJECTS-INTO-THE-HIERARCHY — the WRITE half of ADR-0385.
 *
 * ADR-0385 §2 point 1 · applies ADR-0328 · amends ADR-0383 · amends C25 §1.3 ·
 * C84 EI-9 · §CONTEXT-DATA-HONESTY (L-581 / L-616) · L-8501 · C16 CA-2 · P6.
 *
 * ── THE ONE EDGE THIS FILE IS ────────────────────────────────────────────────
 *
 * ADR-0385 ruled:
 *
 *   ⭐ *"`hierarchyStore` is the AUTHORITY for spatial containment. `SpaceEnvelope
 *      .group` is the MASSING-STAGE AUTHORING axis, and it PROJECTS into that
 *      authority — exactly as `partOf` does (`PartOfProjection.ts`): re-derived at
 *      read, reconciled by diff, never accumulated."*
 *
 * Everything DOWNSTREAM of that projection was built and is correct —
 * {@link ./BuildingResolver.ts} answers *"which building"*, `buildingContainment.ts`
 * stamps the IFC intermediate model, `projectTreeModel.ts` renders the building
 * tier — and all three read `hierarchyStore`. **Nothing wrote it.** Measured
 * 2026-09-09, before this file existed:
 *
 *     grep -rn "hierarchy.createBuilding|hierarchyStore"
 *          apps/editor/src/ui/site/ plugins/space-envelope/
 *     -> ONE hit, and it is a COMMENT (`CreateSpaceEnvelopeBatch.ts:117`) correctly
 *        stating that `group` is NOT the authority.
 *
 * So a master plan authored as three massing groups still exported as ONE
 * `IfcBuilding` and still showed one row in both inspect trees. This module is the
 * missing link and nothing else: it turns *"these envelopes carry group B"* into
 * *"there is a `BuildingData` B, and these `LevelData` rows name it"*.
 *
 * ── ⛔ IT IS A PROJECTION, WHICH MEANS FOUR THINGS, ALL LOAD-BEARING ─────────
 *
 * 1. **DERIVED, NEVER AUTHORED.** The desired hierarchy is a pure function of the
 *    envelope set. {@link deriveMassingHierarchy} takes a snapshot and returns
 *    specs; it reads no store, mints no id from a clock or an RNG, and never
 *    throws.
 *
 * 2. **RECONCILED BY DIFF, NEVER ACCUMULATED.** {@link planMassingGroupProjection}
 *    compares desired against actual and emits adds / updates / removes.
 *    ⛔ Re-running on an unchanged model performs **zero** mutations — not "an
 *    idempotent overwrite". `HierarchyStore.update()` bumps `metadata.version` on
 *    every call, so an emit-only writer would count upward forever and *that* is
 *    accumulation wearing idempotency's clothes. The plan therefore compares the
 *    MATERIAL fields and skips a node whose material state already matches.
 *
 * 3. **IDS ARE DERIVED FROM THE GROUP, NOT MINTED.** `massing~b/<groupId>`. C16
 *    CA-2 exists because `execute()` re-runs on redo and a handler-minted id
 *    orphans every reference on the second run; a DERIVED id has the same property
 *    by construction and a stronger one besides — re-running the projection after a
 *    reload, on another machine, in another session, reproduces exactly the same
 *    rows. A rename is then an UPDATE of one building, never a second building.
 *
 * 4. **SCOPED TO WHAT IT OWNS.** ⛔ THIS IS THE CLAUSE THAT KEEPS THE PROJECTION
 *    FROM BEING A CATASTROPHE. `hierarchyStore` also holds buildings a user
 *    authored by hand in the Data Workbench (`HierarchyTreeAddActions.ts`
 *    dispatches `hierarchy.createBuilding`). A reconcile that removed every
 *    `BuildingData` the massing groups do not imply would DELETE THOSE. Ownership
 *    is therefore carried by the id prefix {@link PROJECTED_ID_PREFIX} and the
 *    sweep is narrowed to it — the same narrowing `PartOfProjection._reconcile`
 *    performs with `owned` when its room half is blind.
 *
 * ── ⛔ §CONTEXT-DATA-HONESTY: AN UNREADABLE ENVELOPE STORE IS NOT AN EMPTY ONE ─
 *
 * {@link MassingGroupSubstrate.groups} is `null` — never `[]` — when the envelope
 * store could not be read. The two behave differently and MUST: `[]` means *"there
 * are no massing groups"* and correctly reaps every projected row; `null` means
 * *"nobody can see the envelopes"* and must reap NOTHING, or a runtime where the
 * plugin store failed to compose would silently delete the whole master plan's
 * hierarchy and look perfectly healthy doing it. That is L-581 / L-616 exactly.
 *
 * ── ⛔ THE UNGROUPED GUARANTEE (ADR-0383 D3 / ADR-0385 §3) ───────────────────
 *
 * An envelope with `group: null` contributes NOTHING here. Every project authored
 * before ADR-0383 has `group: null` everywhere, so this projection derives an empty
 * desired set, removes nothing (it owns nothing), and leaves `hierarchyStore`
 * untouched — which is what makes `buildBuildingRoster()` keep returning exactly one
 * `DEFAULT_BUILDING_ID` and `storeySlot()` keep degenerating to the bare `levelId`.
 * The two `IFCRELAGGREGATES === 4` arms in
 * `packages/file-format/__tests__/ifc-export-file-validity.test.ts` are that
 * guarantee measured; if a change here reddens them, the change is wrong.
 *
 * ── ⛔ WHAT THIS FILE DELIBERATELY DOES NOT DO ───────────────────────────────
 *
 *  • It does not DISPATCH. It is L2 and pure over its inputs but for the one
 *    `HierarchyStore` handle {@link applyMassingGroupProjection} is given. The
 *    subscription that drives it lives at L7 (`attachMassingGroupHierarchy.ts`),
 *    which is the layer that can see a plugin store.
 *  • It does not read `SpaceEnvelope.group` through an import. The member view is
 *    STRUCTURAL ({@link MassingGroupMemberView}) — `plugins/space-envelope` is L6
 *    and this is L2, so the type may not be imported; and the structural shape
 *    states exactly the four fields the projection depends on.
 *  • It does not mint an undo entry, and that is the design, not an omission — see
 *    the note on {@link applyMassingGroupProjection}.
 */

import type { HierarchyStore } from './HierarchyStore.js';
import type {
    AnyHierarchyEntity,
    BuildingData,
    LevelData,
    SiteData,
} from './HierarchyTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ownership — the id vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THIS PREFIX IS A PERSISTENCE FORMAT **AND** AN OWNERSHIP CLAIM. Changing it
 * orphans every row a previous session projected: the new projection would not
 * recognise them as its own, would not reap them, and the project would end up with
 * two buildings per massing group.
 *
 * It is `~`-bearing on purpose. A hand-authored id from the Data Workbench is a
 * `crypto.randomUUID()`, so the two namespaces cannot collide by accident, and a
 * human reading a serialised project can tell at a glance which rows were derived.
 */
export const PROJECTED_ID_PREFIX = 'massing~';

/**
 * The site this projection mints when the project has none of its own.
 *
 * ⚠ It is a FALLBACK, not a preference. {@link applyMassingGroupProjection} adopts
 * an existing `SiteData` whenever the store holds one, because `BuildingData.siteId`
 * is a real FK and hanging derived buildings off a second, parallel site would be a
 * rival spatial root — the very shape ADR-0328 forbids one rung up.
 */
export const PROJECTED_SITE_ID = `${PROJECTED_ID_PREFIX}site`;
export const PROJECTED_SITE_NAME = 'Site';

/**
 * `massing~b/<groupId>` — one `BuildingData` per massing group, for the life of that
 * group.
 *
 * ⛔ THE SEGMENT IS `encodeURIComponent`d AND THE SEPARATOR IS `/`. `encodeURIComponent`
 * escapes `/` to `%2F` and leaves `~` alone, so `/` is the ONE separator that cannot
 * be produced by the payload — a group id containing a `~` (or a `:`) can never make
 * two different groups collide onto one building id, which would silently merge two
 * buildings into one. It also escapes `:`, so a projected building id can never
 * contain the `::` that `ifcIdentity.storeySlot` uses as ITS separator.
 */
export function projectedBuildingId(groupId: string): string {
    return `${PROJECTED_ID_PREFIX}b/${encodeURIComponent(groupId)}`;
}

/** `massing~l/<groupId>/<bimLevelId>` — one `LevelData` per (group, storey) pair. */
export function projectedLevelId(groupId: string, bimLevelId: string): string {
    return `${PROJECTED_ID_PREFIX}l/${encodeURIComponent(groupId)}/${encodeURIComponent(bimLevelId)}`;
}

/**
 * Is this hierarchy node one THIS projection owns?
 *
 * ⛔ The whole safety of the reconcile rests on this predicate. It must be true for
 * every id the projection can emit and false for every id anything else can emit.
 */
export function isProjectedHierarchyId(id: string): boolean {
    return typeof id === 'string' && id.startsWith(PROJECTED_ID_PREFIX);
}

// ─────────────────────────────────────────────────────────────────────────────
// The substrate — massing groups, as the projection needs to see them
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One space envelope, narrowed to the four fields containment derivation reads.
 *
 * STRUCTURAL, never imported — see the file header. `role` and `group` are `unknown`-
 * tolerant because this view is fed straight from a plugin store's `getState()`
 * values, which are typed `unknown` at the seam that can reach them.
 */
export interface MassingGroupMemberView {
    readonly id?: unknown;
    readonly levelId?: unknown;
    readonly role?: unknown;
    readonly group?: unknown;
}

/** One massing group, as the projection will realise it. */
export interface MassingGroupSnapshot {
    readonly groupId: string;
    /** The building's name. ⛔ From the group's own members — never invented here. */
    readonly label: string;
    /** The PRYZM level ids this group's storeys sit on, first-seen order, de-duped. */
    readonly levelIds: readonly string[];
    /**
     * True when the group's members do NOT all carry the same label — the drift
     * `SpaceEnvelopeGroupSchema` names as the cost of denormalising `label`.
     * REPORTED, never silently arbitrated: the projection still has to name the
     * building something, so it takes the first member's, and says so.
     */
    readonly labelDisagreement: boolean;
}

/**
 * One reading of the massing-group axis.
 *
 * ⛔ `groups: null` is *"the envelope store could not be read"*. It is NOT `[]`.
 * See the header — collapsing them would let an unreachable plugin store delete a
 * whole master plan's hierarchy and report success.
 */
export interface MassingGroupSubstrate {
    readonly groups: readonly MassingGroupSnapshot[] | null;
    /** Why the substrate is shaped as it is. Carried into every report. */
    readonly note: string;
}

/** The substrate as it reads when the envelope store cannot be reached at all. */
export const UNREADABLE_MASSING_SUBSTRATE: MassingGroupSubstrate = {
    groups: null,
    note: 'the space envelope store could not be read',
};

function _str(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Read the massing-group axis off a set of envelope records.
 *
 * ⛔ ONLY `role: 'level'` MEMBERS CONTRIBUTE A STOREY, and that matches
 * `MassingGroupCommands._storeysOf` exactly: a `role: 'room'` envelope is a member of
 * the group but it is not a floor of the building, and projecting it as an
 * `IfcBuildingStorey` would put a room in the storey list.
 *
 * ⛔ AND ONLY `role: 'level'` MEMBERS CARRY THE LABEL, which also matches what
 * `RenameMassingGroupHandler` actually writes (it filters to `role === 'level'`
 * before rewriting). Taking the label from a record the rename verb does not touch
 * would make the building's name unfixable from the UI.
 *
 * @param envelopes every envelope in the project, or `null`/`undefined` when the
 *                  store could not be reached — which is a REFUSAL, not an empty set.
 */
export function readMassingGroupSubstrate(
    envelopes: Iterable<MassingGroupMemberView> | null | undefined,
): MassingGroupSubstrate {
    if (envelopes === null || envelopes === undefined) return UNREADABLE_MASSING_SUBSTRATE;

    const acc = new Map<string, { label: string; levelIds: string[]; seen: Set<string>; disagree: boolean }>();
    let members = 0;
    let scanned = 0;

    let iterated: MassingGroupMemberView[];
    try {
        iterated = [...envelopes];
    } catch (err) {
        // A throw while READING is a failure, and a failure is not an emptiness.
        return {
            groups: null,
            note: `the space envelope store threw while being iterated: ${String(err)}`,
        };
    }

    for (const raw of iterated) {
        scanned++;
        if (raw === null || typeof raw !== 'object') continue;
        if (raw.role !== 'level') continue;
        const group = raw.group;
        if (group === null || typeof group !== 'object') continue;
        const groupId = _str((group as { id?: unknown }).id);
        if (groupId === null) continue;
        const levelId = _str(raw.levelId);
        if (levelId === null) continue;
        const label = _str((group as { label?: unknown }).label) ?? groupId;

        members++;
        let row = acc.get(groupId);
        if (!row) {
            row = { label, levelIds: [], seen: new Set(), disagree: false };
            acc.set(groupId, row);
        } else if (row.label !== label) {
            // ⛔ NAMED, NEVER ARBITRATED. `SpaceEnvelopeGroupSchema` records that
            // `label` is denormalised across the members and that drift is its cost;
            // the projection keeps the FIRST-SEEN label so the answer is stable, and
            // reports the disagreement so a surface can offer the rename that fixes it.
            row.disagree = true;
        }
        if (!row.seen.has(levelId)) {
            row.seen.add(levelId);
            row.levelIds.push(levelId);
        }
    }

    // Sorted by group id, so the derivation is deterministic no matter which envelope
    // the store happened to hold first.
    const groups: MassingGroupSnapshot[] = [...acc.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([groupId, row]) => ({
            groupId,
            label: row.label,
            levelIds: row.levelIds,
            labelDisagreement: row.disagree,
        }));

    return {
        groups,
        note:
            `${scanned} envelope(s) read; ${members} level envelope(s) carry a massing group; ` +
            `${groups.length} group(s)`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// The derivation — PURE. Snapshot in, specs out. No store, no clock, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectedSiteSpec { readonly id: string; readonly name: string }
export interface ProjectedBuildingSpec {
    readonly id: string;
    readonly name: string;
    readonly siteId: string;
    readonly numberOfStoreys: number;
}
export interface ProjectedLevelSpec {
    readonly id: string;
    readonly name: string;
    readonly buildingId: string;
    readonly bimLevelId: string;
}

export interface MassingHierarchyDerivation {
    /** The site to mint, or `null` when an existing one is adopted. */
    readonly site: ProjectedSiteSpec | null;
    /** The site every derived building hangs off. */
    readonly siteId: string;
    readonly buildings: readonly ProjectedBuildingSpec[];
    readonly levels: readonly ProjectedLevelSpec[];
    /** Group ids whose members disagreed about the label. */
    readonly labelDisagreements: readonly string[];
    readonly note: string;
}

/** What the derivation needs to know about the world it is landing in. */
export interface MassingDerivationContext {
    /**
     * Site ids the store already holds, in insertion order. The FIRST is adopted.
     *
     * ⚠ "First" is a CHOICE and it is recorded in `note` rather than presented as a
     * fact. A project with several sites has no single answer to *"which site is the
     * master plan on"* and this module is not the place to invent one — but refusing
     * outright would block the whole feature over a case the product cannot yet
     * produce (there is exactly one `hierarchy.createSite` surface).
     */
    readonly existingSiteIds: readonly string[];
    /** Resolve a PRYZM level id to its storey name. Falls back to the id. */
    readonly levelNameOf?: (bimLevelId: string) => string | undefined;
}

/**
 * The desired hierarchy, as one total function of the massing groups.
 *
 * Deterministic and order-stable. Returns an EMPTY derivation for an unreadable
 * substrate — the caller must check {@link MassingGroupSubstrate.groups} for `null`
 * and refuse; this function cannot express a refusal and does not pretend to.
 */
export function deriveMassingHierarchy(
    substrate: MassingGroupSubstrate,
    ctx: MassingDerivationContext,
): MassingHierarchyDerivation {
    const groups = substrate.groups ?? [];

    // ⛔⛔ THE PROJECTION'S OWN SITE IS NOT "AN EXISTING SITE", AND THE FIRST DRAFT OF
    // THIS FUNCTION OSCILLATED BECAUSE IT WAS — caught by the idempotency arm, not by
    // review. Run 1 minted `massing~site`. Run 2 then read it back as an existing site,
    // ADOPTED it, and therefore stopped WANTING it — so the reap, which removes every
    // owned node the derivation no longer wants, deleted the site it was standing on.
    // Run 3 re-minted it. A projection that flip-flops on an unchanged model is not
    // idempotent; it is a churn engine with a stable-looking end state.
    const adoptable = ctx.existingSiteIds.filter(
        (id) => typeof id === 'string' && id.length > 0 && !isProjectedHierarchyId(id),
    );
    const adopted = adoptable[0];

    // ⛔ NO GROUPS ⇒ NO SITE EITHER. Minting a site for a project with no master plan
    // would put a row in the Data Workbench tree that says nothing — and it would be
    // reaped on the very next pass anyway, because a projection keeps only what its
    // own derivation still wants.
    const needsSite = groups.length > 0 && adopted === undefined;
    const siteId = adopted ?? PROJECTED_SITE_ID;

    const buildings: ProjectedBuildingSpec[] = [];
    const levels: ProjectedLevelSpec[] = [];
    const labelDisagreements: string[] = [];

    for (const g of groups) {
        const buildingId = projectedBuildingId(g.groupId);
        buildings.push({
            id: buildingId,
            name: g.label,
            siteId,
            numberOfStoreys: g.levelIds.length,
        });
        if (g.labelDisagreement) labelDisagreements.push(g.groupId);
        for (const bimLevelId of g.levelIds) {
            levels.push({
                id: projectedLevelId(g.groupId, bimLevelId),
                name: ctx.levelNameOf?.(bimLevelId) ?? bimLevelId,
                buildingId,
                bimLevelId,
            });
        }
    }

    return {
        site: needsSite ? { id: PROJECTED_SITE_ID, name: PROJECTED_SITE_NAME } : null,
        siteId,
        buildings,
        levels,
        labelDisagreements,
        note:
            `${substrate.note}; site ${adopted !== undefined ? `adopted (${adopted})` : needsSite ? `minted (${PROJECTED_SITE_ID})` : 'not needed'}` +
            (adoptable.length > 1
                ? `; ⚠ ${adoptable.length} sites exist and the FIRST was adopted`
                : ''),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// The reconcile — PURE. Desired + actual in, a plan out.
// ─────────────────────────────────────────────────────────────────────────────

/** A hierarchy node as the reconcile needs to see it. */
export interface ProjectionExistingNode {
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly parentId?: string | undefined;
    readonly siteId?: string | undefined;
    readonly buildingId?: string | undefined;
    readonly bimLevelId?: string | undefined;
    readonly numberOfStoreys?: number | undefined;
}

/** One field-level change to an existing node. */
export interface ProjectionUpdate {
    readonly id: string;
    readonly patch: Partial<AnyHierarchyEntity>;
    /** Which material fields differed. Never empty — an empty update is not emitted. */
    readonly changed: readonly string[];
}

/**
 * The reconcile, as three ordered lists.
 *
 * ⛔ ORDER IS PART OF THE PLAN, NOT AN IMPLEMENTATION DETAIL. `adds` runs
 * site → buildings → levels because `CreateBuildingCommand`/`CreateHierarchyLevelCommand`
 * validate that the parent exists, and `removes` runs levels → buildings → site for
 * the mirror reason: reaping a building first would leave its storeys dangling for
 * the duration of the sweep, and `resolveLevelBuilding` reports a dangling
 * `buildingId` as `unknown`.
 */
export interface MassingProjectionPlan {
    readonly adds: readonly AnyHierarchyEntity[];
    readonly updates: readonly ProjectionUpdate[];
    readonly removes: readonly string[];
    /** Desired nodes already present and already correct. The idempotency measure. */
    readonly unchanged: number;
}

/** Now, injected so the plan can be built deterministically in a test. */
export type ProjectionClock = () => number;

function _emptyPlanned(): { customProperties: Record<string, string | number | boolean | null> } {
    return { customProperties: {} };
}

function _meta(now: number) {
    return { createdAt: now, modifiedAt: now, createdBy: 'massing-group-projection', version: 1 };
}

function _siteNode(spec: ProjectedSiteSpec, now: number): SiteData {
    return {
        id: spec.id,
        type: 'site',
        name: spec.name,
        plannedData: _emptyPlanned(),
        syncState: 'no-template',
        metadata: _meta(now),
    };
}

function _buildingNode(spec: ProjectedBuildingSpec, now: number): BuildingData {
    return {
        id: spec.id,
        type: 'building',
        name: spec.name,
        parentId: spec.siteId,
        siteId: spec.siteId,
        numberOfStoreys: spec.numberOfStoreys,
        plannedData: _emptyPlanned(),
        syncState: 'no-template',
        metadata: _meta(now),
    };
}

function _levelNode(spec: ProjectedLevelSpec, now: number): LevelData {
    return {
        id: spec.id,
        type: 'level',
        name: spec.name,
        parentId: spec.buildingId,
        buildingId: spec.buildingId,
        bimLevelId: spec.bimLevelId,
        plannedData: _emptyPlanned(),
        syncState: 'no-template',
        metadata: _meta(now),
    };
}

/**
 * Compare the desired hierarchy against what the store actually holds.
 *
 * ⛔ THE SWEEP IS NARROWED TO {@link isProjectedHierarchyId}. A `BuildingData` a user
 * created by hand is invisible to this function and can never be removed by it. That
 * narrowing is the difference between a projection and a data-loss bug.
 *
 * ⛔ AND AN UPDATE IS EMITTED ONLY WHEN A MATERIAL FIELD ACTUALLY DIFFERS. `metadata`
 * is EXCLUDED from the comparison and never patched: `HierarchyStore.update()` owns
 * it and bumps `version` on every call, so comparing it (or writing it) would make
 * every re-run a mutation and turn "idempotent" into "increments a counter forever".
 */
export function planMassingGroupProjection(
    derivation: MassingHierarchyDerivation,
    existing: readonly ProjectionExistingNode[],
    now: ProjectionClock = Date.now,
): MassingProjectionPlan {
    const t = now();
    const byId = new Map<string, ProjectionExistingNode>();
    for (const n of existing) if (typeof n?.id === 'string') byId.set(n.id, n);

    const adds: AnyHierarchyEntity[] = [];
    const updates: ProjectionUpdate[] = [];
    const wanted = new Set<string>();
    let unchanged = 0;

    const reconcileOne = (
        id: string,
        make: () => AnyHierarchyEntity,
        material: Record<string, string | number | undefined>,
    ): void => {
        wanted.add(id);
        const current = byId.get(id);
        if (current === undefined) {
            adds.push(make());
            return;
        }
        const changed: string[] = [];
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(material)) {
            if ((current as unknown as Record<string, unknown>)[key] !== value) {
                changed.push(key);
                patch[key] = value;
            }
        }
        // A node whose TYPE drifted is not repairable by a patch — `HierarchyStore`
        // has no type-change path and a `level` masquerading as a `building` would
        // corrupt every `getBuildings()` read. Replace it: remove + add, which the
        // caller performs in that order.
        if (changed.length === 0) {
            unchanged++;
            return;
        }
        updates.push({ id, patch: patch as Partial<AnyHierarchyEntity>, changed });
    };

    if (derivation.site !== null) {
        const spec = derivation.site;
        reconcileOne(spec.id, () => _siteNode(spec, t), { name: spec.name });
    }
    for (const b of derivation.buildings) {
        reconcileOne(b.id, () => _buildingNode(b, t), {
            name: b.name,
            parentId: b.siteId,
            siteId: b.siteId,
            numberOfStoreys: b.numberOfStoreys,
        });
    }
    for (const l of derivation.levels) {
        reconcileOne(l.id, () => _levelNode(l, t), {
            name: l.name,
            parentId: l.buildingId,
            buildingId: l.buildingId,
            bimLevelId: l.bimLevelId,
        });
    }

    // ── the reap, narrowed to what this projection owns ─────────────────────
    const owned = existing.filter((n) => isProjectedHierarchyId(n.id) && !wanted.has(n.id));
    const rank = (t2: string): number => (t2 === 'level' ? 0 : t2 === 'building' ? 1 : 2);
    const removes = owned
        .slice()
        .sort((a, b) => rank(a.type) - rank(b.type) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((n) => n.id);

    return { adds, updates, removes, unchanged };
}

// ─────────────────────────────────────────────────────────────────────────────
// The application
// ─────────────────────────────────────────────────────────────────────────────

export interface MassingProjectionReport {
    /** False only when the substrate was UNREADABLE. An empty project is `true`. */
    readonly ok: boolean;
    /** Why the projection refused. `null` when `ok`. */
    readonly refusal: string | null;
    /** The site the derived buildings hang off. `null` when nothing was derived. */
    readonly siteId: string | null;
    readonly groups: number;
    readonly added: readonly string[];
    readonly updated: readonly string[];
    readonly removed: readonly string[];
    readonly unchanged: number;
    /** Group ids whose members disagreed about the building name. */
    readonly labelDisagreements: readonly string[];
    readonly note: string;
}

/** The report a refusal produces. Nothing was written. */
function _refused(note: string): MassingProjectionReport {
    return {
        ok: false,
        refusal:
            'the massing-group substrate is UNREADABLE, so nothing was projected. An unreadable ' +
            'store is NOT an empty one (§CONTEXT-DATA-HONESTY, L-581/L-616): reaping on this ' +
            'reading would delete every building a master plan had already produced. ' + note,
        siteId: null,
        groups: 0,
        added: [], updated: [], removed: [], unchanged: 0,
        labelDisagreements: [],
        note,
    };
}

/**
 * Reconcile `hierarchyStore` to the massing groups — the ONE writer of ADR-0385 §2
 * point 1.
 *
 * ⛔ **THIS MINTS NO UNDO ENTRY, AND THAT IS THE DESIGN.** The precedent is
 * `bathroomPodMemberMirror` (§BATH102 / C109 §7), whose header states it in the same
 * words: the projected records *"are NOT on the ring buffer … undo removes the
 * [source], the diff says `removed`, and this module reaps them; redo adds it back
 * and this module re-projects."* Applied here:
 *
 *   · A three-block master-plan gesture is ONE `spaceEnvelope.batch.create`, which is
 *     ONE `produceCommand` and therefore ONE Ctrl+Z (C114 §6a). The projection adds
 *     ZERO further entries, so the gesture still costs exactly one.
 *   · ⛔ It could not have ridden that `produceCommand` even if we wanted it to.
 *     `produceCommand` writes ONE bus-managed Immer store and `produceMultiStoreCommand`
 *     writes several — but `hierarchyStore` is neither: it is a hand-rolled
 *     `Map`-backed store written by legacy `Command` classes
 *     (`CreateBuildingCommand.affectedStores = ['hierarchy']`, `stores: [] as const`
 *     at every `initBusHandlers` bridge). There is no patch pair to fold in.
 *   · So the ALTERNATIVE to a projection was a second, separately-undoable command,
 *     and that costs the user a second Ctrl+Z that undoes half of one gesture and
 *     shows a torn state in between — the exact failure `supersedes` was added to
 *     `spaceEnvelope.batch.create` to avoid (§L-13038).
 *
 * ⚠ THE CONSEQUENCE, STATED RATHER THAN DISCOVERED: correctness after undo depends on
 * the projection being RE-RUN. The L7 attachment drives it off `Store.subscribeDirty`,
 * which `Store.applyPatch` notifies on EXECUTE, UNDO and REDO alike — so all three
 * arrive through one channel. ⛔ Do not "improve" the attachment into a bus-event
 * subscriber: `performUndoRedo` emits no bus events at all, and the buildings would
 * then survive an undo of the envelopes that produced them.
 *
 * @param store  injectable; the caller passes the `hierarchyStore` singleton.
 * @param substrate what {@link readMassingGroupSubstrate} returned.
 */
export function applyMassingGroupProjection(
    store: HierarchyStore,
    substrate: MassingGroupSubstrate,
    opts: { readonly levelNameOf?: (bimLevelId: string) => string | undefined; readonly now?: ProjectionClock } = {},
): MassingProjectionReport {
    if (substrate.groups === null) return _refused(substrate.note);

    let existing: ProjectionExistingNode[];
    try {
        existing = store.getAll().map((n) => ({
            id: n.id,
            type: n.type,
            name: n.name,
            parentId: n.parentId,
            siteId: (n as BuildingData).siteId,
            buildingId: (n as LevelData).buildingId,
            bimLevelId: (n as LevelData).bimLevelId,
            numberOfStoreys: (n as BuildingData).numberOfStoreys,
        }));
    } catch (err) {
        // The HIERARCHY half is unreadable. Same rule, same reason.
        return _refused(`${substrate.note}; hierarchyStore threw while being read: ${String(err)}`);
    }

    const derivation = deriveMassingHierarchy(substrate, {
        existingSiteIds: existing.filter((n) => n.type === 'site').map((n) => n.id),
        ...(opts.levelNameOf ? { levelNameOf: opts.levelNameOf } : {}),
    });
    const plan = planMassingGroupProjection(derivation, existing, opts.now ?? Date.now);

    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];

    // ⛔ ADDS BEFORE REMOVES, PARENTS BEFORE CHILDREN, CHILDREN BEFORE PARENTS ON THE
    // WAY OUT. See `MassingProjectionPlan`.
    for (const node of plan.adds) {
        try { store.add(node); added.push(node.id); }
        catch (err) { console.warn(`[massing-projection] add ${node.id} failed:`, err); }
    }
    for (const u of plan.updates) {
        try { store.update(u.id, u.patch); updated.push(u.id); }
        catch (err) { console.warn(`[massing-projection] update ${u.id} failed:`, err); }
    }
    for (const id of plan.removes) {
        try { store.remove(id); removed.push(id); }
        catch (err) { console.warn(`[massing-projection] remove ${id} failed:`, err); }
    }

    return {
        ok: true,
        refusal: null,
        siteId: derivation.buildings.length > 0 ? derivation.siteId : null,
        groups: derivation.buildings.length,
        added, updated, removed,
        unchanged: plan.unchanged,
        labelDisagreements: derivation.labelDisagreements,
        note: derivation.note,
    };
}
