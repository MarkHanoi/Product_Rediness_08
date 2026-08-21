/**
 * LinkedModelRef — the L0 record of ONE linked model (ADR-0346, L-2900).
 *
 * ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────
 *
 * A linked model is Revit's *linked model* / IFC reference-model concept: project
 * B's building displayed inside project A, anchored on the shared parcel datum,
 * so A's author can SEE it, measure to it and coordinate against it — WITHOUT
 * owning or editing it.
 *
 * **This record is a REFERENCE, never elements.** ADR-0346 D1: the linked
 * project's elements are never added to the host's element stores, ElementRegistry,
 * BimManager, semantic graph, undo stack, or `ProjectSerializer` element capture.
 * The only thing that persists in the host project file is the small, plain record
 * below. That is what keeps C13 (project isolation) intact — see C13 §3.13.
 *
 * ── WHY IT IS NOT AN ElementType ─────────────────────────────────────────────
 *
 * `types/Id.ts`'s `ElementType` union is the vocabulary of things C65/C84 govern —
 * families with geometry, parameters, integrity rules and a per-element contract
 * (C85–C99). A linked model has none of those *in the host*: it has no parameters
 * the host may set, no integrity the host may repair, and no family. Adding it to
 * `ElementType` would make every C84 element-integrity obligation apply to geometry
 * the host is contractually forbidden to touch. So it carries its own branded id
 * minted by {@link createLinkedModelId} and stays out of that union on purpose.
 *
 * ── WHY IT IS NOT A ContextBuilding (C19 §1.5) ───────────────────────────────
 *
 * ContextBuildings are *environment*: C19 §1.5 says they have "NO inner structure
 * (no levels, no rooms, no elements)" and forbids them from schedules and property
 * panels. A linked model is a *building* — it has levels, rooms and elements, it is
 * merely READ-ONLY here. Conflating the two would make "show me the linked model's
 * room schedule" contract-illegal forever. Recorded as L-2903.
 *
 * ── RELATIONSHIP TO C36 ──────────────────────────────────────────────────────
 *
 * C36 §2.3 already declares `FederationMember { memberId, source, contentHash,
 * discipline, importedAt }` with `source: 'pryzm-native' | 'ifc-import' |
 * 'revit-link' | 'dwg-link'`. Measured 2026-08-21: **zero implementations exist**
 * (L-2902). A PRYZM linked model IS `source: 'pryzm-native'`, so this record adopts
 * C36 §1.12's pinning semantics verbatim rather than minting a rival answer to the
 * same question (ADR-0331 — one answer per question).
 *
 * Contracts: C13 §3.13 (the governing one), C19 §1.3 (LTP-ENU origin),
 *            C36 §1.12/§2.3, C47 (format versioning), C83 (spatial validity),
 *            C05 (persistence). P5 — this file is pure: no I/O, no THREE, no DOM.
 */

import { z } from 'zod';
import { ulid as makeUlid } from 'ulid';

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Branded id for a link. Deliberately NOT in `types/Id.ts`'s `ElementType`
 * union — see the header. Format `lnk_<26-char ULID>`, mirroring `createId`'s
 * convention so ids sort and read the same way everywhere.
 */
export type LinkedModelId = string & { readonly __brand: 'linkedModel' };

/** The `lnk_` prefix, exported so callers never re-type the literal. */
export const LINKED_MODEL_ID_PREFIX = 'lnk' as const;

/**
 * Mint a fresh {@link LinkedModelId}. Mirrors `factory/createId.ts`'s
 * `<prefix>_<26-char ULID>` convention so link ids sort, read and validate like
 * every other id in the product — without joining the `ElementType` union, which
 * would drag the whole C84/C85-C99 element-integrity surface onto a reference.
 *
 * Pass `ulid` explicitly for deterministic tests / fixture replay (C73).
 */
export function createLinkedModelId(ulid?: string): LinkedModelId {
    return `${LINKED_MODEL_ID_PREFIX}_${ulid ?? makeUlid()}` as LinkedModelId;
}

/** True iff `value` has the shape of a {@link LinkedModelId}. */
export function isLinkedModelId(value: unknown): value is LinkedModelId {
    if (typeof value !== 'string') return false;
    if (!value.startsWith(`${LINKED_MODEL_ID_PREFIX}_`)) return false;
    const tail = value.slice(LINKED_MODEL_ID_PREFIX.length + 1);
    return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(tail);
}

// ── Version pinning (C36 §1.12, adopted verbatim) ────────────────────────────

/**
 * Which version of the source project this link shows.
 *
 * **`pinned` is the default and `latest` is an explicit opt-in** (ADR-0346 D5). A
 * linked model is a COORDINATION DATUM: if the source moves under the host without
 * the host's author knowing, every dimension drawn to it is silently wrong. C36
 * §1.12 already decided this shape — *"a missing hash MUST surface as a
 * `MISSING_FEDERATION_MEMBER` warning rather than silently re-running against the
 * latest model"* — and this is that rule for a PRYZM-native member.
 *
 * `latest` is offered because it is genuinely right for a same-author two-file
 * split (podium + tower), and the founder's standing rule is that an undeclared
 * choice is not defensible. It is a CHOICE the UI states in words, not a default.
 */
export const LinkPinSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('pinned'),
        /** The source project version this link is pinned to. */
        versionId: z.string().min(1),
        /** Human label of that version, cached for display. May rot; never authoritative. */
        versionLabel: z.string().nullable().default(null),
        /** When the pin was taken. UTC ISO-8601. */
        pinnedAt: z.string().min(1),
    }),
    z.object({
        mode: z.literal('latest'),
        /**
         * The version id most recently resolved under `latest`. Diagnostics only —
         * it records WHAT WAS SHOWN, so "the link changed under me" is answerable
         * after the fact. Never used to decide what to fetch.
         */
        lastResolvedVersionId: z.string().nullable().default(null),
    }),
]);
export type LinkPin = z.infer<typeof LinkPinSchema>;

// ── Anchoring (ADR-0346 D4) ──────────────────────────────────────────────────

/**
 * A geographic origin, as C19 §1.3 / C12 LTP-ENU define it. Recorded on BOTH
 * sides of a link so a later divergence is DETECTABLE rather than silently wrong.
 *
 * This is the [[site-origin-on-parcel-regression]] lesson stated as a field: a
 * transform computed about a stale anchor looks entirely plausible. Keeping both
 * origins means the check "is this offset still the one we computed?" is a
 * comparison, not an act of faith.
 */
export const LinkGeoOriginSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    elevationAsl: z.number().default(0),
    /** Radians, C12 convention. */
    trueNorth: z.number().default(0),
});
export type LinkGeoOrigin = z.infer<typeof LinkGeoOriginSchema>;

/**
 * The rigid placement of the source model in the HOST's scene frame.
 *
 * Scene frame is LTP-ENU about the host site origin (C19 §1.3), and the existing
 * convention — `createSiteOverlayUnderlay.ts:124-125` — is
 * `x = east`, `z = -north`. This transform is expressed in the SAME frame so
 * there is one convention, not two.
 *
 * Only ONE rotation axis exists (`rotationY`, about world up) because a building
 * on a shared parcel is co-planar with the host by construction; a link that needs
 * pitch or roll is not a parcel-anchored link and is refused rather than fudged.
 */
export const LinkTransformSchema = z.object({
    /** Metres east of the host site origin. */
    east: z.number().default(0),
    /** Metres north of the host site origin. */
    north: z.number().default(0),
    /** Metres of vertical offset (host scene +Y). */
    elevation: z.number().default(0),
    /** Radians about world up. Positive = counter-clockwise seen from above. */
    rotationY: z.number().default(0),
});
export type LinkTransform = z.infer<typeof LinkTransformSchema>;

/**
 * How the transform above was arrived at. The MODE is recorded, not merely the
 * numbers, because "the app computed this from two geocodes" and "the user typed
 * this" have different failure modes and must be distinguishable forever.
 */
export const LinkAnchorModeSchema = z.enum([
    /** Derived from both projects' `SiteModel.location` (the normal, tractable case). */
    'shared-geo-origin',
    /** The user placed it by hand; no geo derivation was possible or wanted. */
    'explicit',
]);
export type LinkAnchorMode = z.infer<typeof LinkAnchorModeSchema>;

/**
 * The anchoring record: the mode, the resulting transform, and — when derived —
 * BOTH origins it was derived from plus the distance between them.
 *
 * `sourceOrigin === null` with `mode: 'explicit'` is the honest encoding of "the
 * source project has no site; the user placed this by hand". ADR-0346 D4: a
 * silent mis-alignment is strictly worse than a refusal (C83), so the *absence*
 * of a derivable origin is a recorded fact, never a zero.
 */
export const LinkAnchorSchema = z.object({
    mode: LinkAnchorModeSchema,
    transform: LinkTransformSchema,
    /** The host site origin at the moment the anchor was resolved. `null` when the host had no site. */
    hostOrigin: LinkGeoOriginSchema.nullable().default(null),
    /** The source site origin at the moment the anchor was resolved. `null` when the source had no site. */
    sourceOrigin: LinkGeoOriginSchema.nullable().default(null),
    /**
     * Great-circle metres between the two origins at resolve time. `null` when
     * either origin was absent — **not `0`**, because "they are in the same place"
     * and "I could not tell" must never share a value (§CONTEXT-DATA-HONESTY).
     */
    separationM: z.number().nullable().default(null),
    /** When the anchor was resolved. UTC ISO-8601. */
    resolvedAt: z.string().min(1),
});
export type LinkAnchor = z.infer<typeof LinkAnchorSchema>;

// ── Display (ADR-0346 D6) ────────────────────────────────────────────────────

/**
 * How much of the linked model is drawn.
 *
 * **`massing` is the default**, and this is a performance decision taken with the
 * founder's own scene in view: it is draw-call bound today and a linked model at
 * least doubles it. The structural bound (ADR-0346 D6) is the argument —
 *
 *   · `massing`  → ONE InstancedMesh per link (one box instance per level band)
 *   · `detailed` → ≈ the source project's own mesh count
 *   · `hidden`   → nothing mounted at all
 *
 * — and it does not depend on any browser draw-call reading, which matters because
 * L-2502 measured that the figure this repo has been quoting (`info.render.calls`
 * on WebGPU) is cumulative-since-start, not per-frame.
 *
 * This field is DOMAIN INTENT, persisted and mutated only through the bus
 * (`link.setDisplay`). It is never a UI flag and no UI code writes THREE
 * `.visible` for it — P7 / C09.
 */
export const LinkDisplayModeSchema = z.enum(['massing', 'detailed', 'hidden']);
export type LinkDisplayMode = z.infer<typeof LinkDisplayModeSchema>;

// ── The record ───────────────────────────────────────────────────────────────

/** Current wire version of {@link LinkedModelRefSchema}. C47 — bump on any shape change. */
export const LINKED_MODEL_REF_VERSION = 1 as const;

/**
 * ONE linked model, as the HOST project persists it.
 *
 * Everything here is plain and serialisable — no THREE, no functions, no blobs.
 * The resolved source geometry is a CACHE beside the file, never the record of
 * truth (ADR-0346 D9), so a `.pryzm` moved to another machine carries its links;
 * whether they RESOLVE depends on access to the source project, which is surfaced
 * honestly rather than papered over.
 */
export const LinkedModelRefSchema = z.object({
    /** `lnk_<ULID>`. Unique within the host project. */
    id: z.string().refine(isLinkedModelId, { message: 'id must be a `lnk_<ULID>` LinkedModelId' }),

    /** The project this link POINTS AT. Never the host. */
    sourceProjectId: z.string().min(1),

    /**
     * The source project's name at link time, for display. **Cached and allowed to
     * rot** — it is refreshed opportunistically and is never used to resolve
     * anything. Named as a cache so nobody later treats it as identity.
     */
    sourceProjectName: z.string().default(''),

    /**
     * The project that OWNS this link. ADR-0346 D2: the host owns the act of
     * linking, so a ref carrying someone else's host id inside this project's file
     * is a C13 §3.13 violation and is detectable without any new machinery.
     */
    hostProjectId: z.string().min(1),

    pin: LinkPinSchema,
    anchor: LinkAnchorSchema,
    display: LinkDisplayModeSchema.default('massing'),

    /**
     * C36 §2.3 `FederationMember.discipline`. Free-form by design (C36 gives
     * "architectural | structural | mep | …" as examples, not an enum), so a
     * practice's own discipline vocabulary survives.
     */
    discipline: z.string().default('architectural'),

    /** When the link was created in the host. UTC ISO-8601. */
    linkedAt: z.string().min(1),
});
export type LinkedModelRef = z.infer<typeof LinkedModelRefSchema>;

/**
 * The `ProjectSnapshot.linkedModels` payload — the persisted collection.
 * Shaped exactly like `ProjectSnapshot.dxfOverlays` (version + array), because
 * that slot is the proven precedent for "N plain records beside the elements".
 */
export const LinkedModelSnapshotSchema = z.object({
    version: z.literal(LINKED_MODEL_REF_VERSION),
    links: z.array(LinkedModelRefSchema),
});
export type LinkedModelSnapshot = z.infer<typeof LinkedModelSnapshotSchema>;

// ── Resolution status — a value, never a thrown error ────────────────────────

/**
 * Why a link is not currently showing geometry. **Absence and failure are
 * different values** (§CONTEXT-DATA-HONESTY / [[context-data-honesty-family]]):
 * every one of these is reported to the user by name, and none of them is
 * silently equivalent to "the link is empty".
 *
 * `MISSING_LINK_VERSION` is deliberately named after C36 §1.12's
 * `MISSING_FEDERATION_MEMBER` — same condition, same refusal, one vocabulary.
 */
export const LinkResolutionFailureSchema = z.enum([
    /** The pinned version no longer resolves. C36 §1.12 — refuse, never silently re-resolve to latest. */
    'MISSING_LINK_VERSION',
    /** The source project could not be read at all (deleted, or not this user's). See L-2901. */
    'SOURCE_UNREACHABLE',
    /** The source resolved but holds no geometry to show. A real, clean, EMPTY answer. */
    'SOURCE_EMPTY',
    /** The source has no site location, so no geo-derived anchor is possible (C83 IMPOSSIBLE). */
    'NO_SOURCE_ORIGIN',
    /** The host has no site location, so there is no frame to place anything in. */
    'NO_HOST_ORIGIN',
    /** Origins are implausibly far apart; the user has not yet confirmed (C83 INADVISABLE). */
    'SEPARATION_UNCONFIRMED',
]);
export type LinkResolutionFailure = z.infer<typeof LinkResolutionFailureSchema>;
