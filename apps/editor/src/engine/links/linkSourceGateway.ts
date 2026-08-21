/**
 * linkSourceGateway — read another project's snapshot WITHOUT loading it.
 *
 * ── WHY THIS IS NOT `ProjectLoader` ──────────────────────────────────────────
 *
 * There is no read-only load path in this codebase, and the reasons are structural,
 * not incidental. `ProjectLoader.load()`:
 *
 *   · begins with `ClearProjectCommand` on BOTH of its paths
 *     (`packages/persistence-client/src/loader/ProjectLoader.ts:356` and `:381`) —
 *     there is no "load without clear" entry point;
 *   · wraps the whole load in ONE global `storeEventBus.beginBatch()` bracket
 *     (`:337` → `:1494`), so a nested load would nest the depth counter and the
 *     inner `endBatch()` would not flush;
 *   · calls `commandManager.clearHistory()` (`:1546`), so a second load would wipe
 *     the HOST project's undo stack;
 *   · overwrites the single scalar `__pryzmLoadedProjectExpectation`
 *     (`apps/editor/src/engine/persistence/ProjectLoader.ts:2706-2710`), which
 *     would make every element of the HOST project foreign to the isolation audit.
 *
 * Any one of those alone would be disqualifying. Together they are the clearest
 * possible statement that a linked model must NOT go through the loader — which is
 * exactly ADR-0346 D1: what crosses the boundary is a reference, never elements.
 *
 * So this module does one thing: it FETCHES the source project's snapshot as data
 * and hands it to `deriveLinkMassing()`. Nothing it returns ever reaches a store,
 * the ElementRegistry, BimManager, a builder, the semantic graph or undo.
 *
 * ── THE MEASURED PERMISSION LIMIT (L-2901) ───────────────────────────────────
 *
 * All three project read routes scope to `owner_id`:
 *   · `server.js:2891`  GET /api/projects              → .eq('owner_id', userId)
 *   · `server.js:3165`  GET /api/projects/:id          → .eq('owner_id', userId)
 *   · `server.js:3474`  GET /api/projects/:id/latest-version → .eq('owner_id', userId)
 *
 * A `project_members` table and its routes exist (`server.js:4412`, `:4433`) and
 * **none of the three consults it**. So today a user can only link projects they
 * personally own. That is reported to the user as `SOURCE_UNREACHABLE` with a
 * sentence naming the limit — never as an empty model, because a failure and an
 * empty result must not be the same value (§CONTEXT-DATA-HONESTY).
 *
 * ── C36 §1.12 PINNING, IMPLEMENTED ───────────────────────────────────────────
 *
 * A `pinned` ref fetches THAT version and refuses (`MISSING_LINK_VERSION`) if it
 * no longer resolves. It never silently falls back to latest — C36 §1.12 decided
 * that, and this is that decision in code.
 */

import { apiFetch } from '@pryzm/core-app-model';
import type { LinkedModelRef, LinkResolutionFailure, LinkGeoOrigin } from '@pryzm/schemas';
import { deriveLinkMassing, type LinkMassingResult, type LinkMassingSource } from './linkMassing';

/** A project the user can link, as the picker lists them. */
export interface LinkableProject {
    readonly id: string;
    readonly name: string;
    readonly updatedAt: string | null;
}

/** One resolvable version of a source project. */
export interface LinkableVersion {
    readonly id: string;
    readonly label: string;
    readonly createdAt: string | null;
    readonly elementCount: number;
}

/**
 * The outcome of resolving a link, as a VALUE.
 *
 * `failure` and an empty `massing` are deliberately different states. "I could not
 * read the source" and "the source has nothing in it" are different facts about the
 * world and the user needs to be able to tell them apart — the standing lesson of
 * [[context-data-honesty-family]].
 */
export interface LinkResolution {
    readonly ok: boolean;
    readonly failure: LinkResolutionFailure | null;
    /** A sentence the UI shows verbatim. Non-null whenever `failure` is. */
    readonly reason: string | null;
    readonly massing: LinkMassingResult;
    /** The version actually read, for the "what am I looking at" readout. */
    readonly resolvedVersionId: string | null;
    readonly resolvedVersionLabel: string | null;
    /** The source project's site origin, if it declared one. Needed for anchoring. */
    readonly sourceOrigin: LinkGeoOrigin | null;
    /** Source element count, straight from the snapshot. Diagnostics + the cost readout. */
    readonly sourceElementCount: number;
}

const EMPTY_MASSING: LinkMassingResult = { bands: [], skippedLevels: [], elementsConsidered: 0 };

function fail(failure: LinkResolutionFailure, reason: string): LinkResolution {
    return {
        ok: false, failure, reason,
        massing: EMPTY_MASSING,
        resolvedVersionId: null, resolvedVersionLabel: null,
        sourceOrigin: null, sourceElementCount: 0,
    };
}

/** Projects this user could link. Excludes `excludeProjectId` (you cannot link yourself). */
export async function listLinkableProjects(excludeProjectId: string | null): Promise<LinkableProject[]> {
    try {
        const res = await apiFetch('/api/projects');
        if (!res.ok) return [];
        const body = await res.json() as { projects?: Array<Record<string, unknown>> };
        const rows = Array.isArray(body.projects) ? body.projects : [];
        return rows
            .map(r => ({
                id: String(r['id'] ?? ''),
                name: String(r['name'] ?? 'Untitled project'),
                updatedAt: typeof r['updated_at'] === 'string' ? (r['updated_at'] as string) : null,
            }))
            .filter(p => p.id.length > 0 && p.id !== excludeProjectId);
    } catch (e) {
        console.warn('[linkSourceGateway] listLinkableProjects failed (non-fatal):', e);
        return [];
    }
}

/** Saved versions of a source project, newest first — the pin picker's list. */
export async function listSourceVersions(sourceProjectId: string): Promise<LinkableVersion[]> {
    try {
        const res = await apiFetch(`/api/projects/${encodeURIComponent(sourceProjectId)}/versions`);
        if (!res.ok) return [];
        const body = await res.json() as { versions?: Array<Record<string, unknown>> };
        const rows = Array.isArray(body.versions) ? body.versions : [];
        return rows.map(r => ({
            id: String(r['id'] ?? ''),
            label: String(r['label'] ?? 'Untitled version'),
            createdAt: typeof r['created_at'] === 'string' ? (r['created_at'] as string) : null,
            elementCount: typeof r['element_count'] === 'number' ? (r['element_count'] as number) : 0,
        })).filter(v => v.id.length > 0);
    } catch (e) {
        console.warn('[linkSourceGateway] listSourceVersions failed (non-fatal):', e);
        return [];
    }
}

/** Pull a project's `SiteModel.location` out of a snapshot, or null if it has none. */
export function readSnapshotOrigin(snapshot: Record<string, unknown> | null): LinkGeoOrigin | null {
    if (snapshot == null) return null;
    const site = snapshot['site'] ?? snapshot['siteModel'];
    const loc = site != null && typeof site === 'object'
        ? (site as Record<string, unknown>)['location']
        : null;
    const src = (loc ?? snapshot['location']) as Record<string, unknown> | null | undefined;
    if (src == null || typeof src !== 'object') return null;
    const lat = src['latitude'];
    const lon = src['longitude'];
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
        latitude: lat,
        longitude: lon,
        elevationAsl: typeof src['elevationAsl'] === 'number' ? (src['elevationAsl'] as number) : 0,
        trueNorth: typeof src['trueNorth'] === 'number' ? (src['trueNorth'] as number) : 0,
    };
}

/**
 * Resolve a link: fetch its source snapshot per the ref's pin, derive massing.
 *
 * Never throws. Every failure path returns a NAMED {@link LinkResolutionFailure}
 * with a sentence, because a linked model that quietly shows nothing is the
 * silent-failure class this codebase has spent a day cataloguing (L-2600 family).
 */
export async function resolveLink(ref: LinkedModelRef): Promise<LinkResolution> {
    const pid = encodeURIComponent(ref.sourceProjectId);

    let raw: Record<string, unknown> | null = null;
    let versionId: string | null = null;
    let versionLabel: string | null = null;

    try {
        if (ref.pin.mode === 'pinned') {
            const vid = encodeURIComponent(ref.pin.versionId);
            const res = await apiFetch(`/api/projects/${pid}/versions/${vid}`);
            if (res.status === 404) {
                // C36 §1.12, verbatim: a missing pin is a NAMED refusal, never a
                // silent re-resolve to latest. Falling back would change what the
                // user is coordinating against without telling them.
                return fail(
                    'MISSING_LINK_VERSION',
                    `The pinned version "${ref.pin.versionLabel ?? ref.pin.versionId}" of `
                    + `"${ref.sourceProjectName || ref.sourceProjectId}" no longer exists. `
                    + 'Nothing is shown, deliberately — re-pin this link to a version that does, '
                    + 'or switch it to follow the latest save.',
                );
            }
            if (!res.ok) {
                return fail('SOURCE_UNREACHABLE', unreachableReason(ref, res.status));
            }
            const body = await res.json() as { version?: Record<string, unknown> };
            raw = (body.version?.['snapshot'] ?? null) as Record<string, unknown> | null;
            versionId = typeof body.version?.['id'] === 'string' ? String(body.version['id']) : ref.pin.versionId;
            versionLabel = typeof body.version?.['label'] === 'string' ? String(body.version['label']) : null;
        } else {
            const res = await apiFetch(`/api/projects/${pid}/latest-version`);
            if (!res.ok) {
                return fail('SOURCE_UNREACHABLE', unreachableReason(ref, res.status));
            }
            const body = await res.json() as { version?: Record<string, unknown> | null };
            if (body.version == null) {
                return fail(
                    'SOURCE_EMPTY',
                    `"${ref.sourceProjectName || ref.sourceProjectId}" has no saved version yet, `
                    + 'so there is nothing to show. Save it once and this link will pick it up.',
                );
            }
            raw = (body.version['snapshot'] ?? null) as Record<string, unknown> | null;
            versionId = typeof body.version['id'] === 'string' ? String(body.version['id']) : null;
            versionLabel = typeof body.version['label'] === 'string' ? String(body.version['label']) : null;
        }
    } catch (e) {
        console.warn(`[linkSourceGateway] resolveLink(${ref.id}) fetch failed:`, e);
        return fail(
            'SOURCE_UNREACHABLE',
            `Could not read "${ref.sourceProjectName || ref.sourceProjectId}" — the request failed. `
            + 'The link is kept; it will resolve again when the project is reachable.',
        );
    }

    if (raw == null) {
        return fail(
            'SOURCE_EMPTY',
            `The saved version of "${ref.sourceProjectName || ref.sourceProjectId}" carries no model data.`,
        );
    }

    const massing = deriveLinkMassing(raw as unknown as LinkMassingSource);
    const elementCount = typeof raw['elementCount'] === 'number' ? (raw['elementCount'] as number) : 0;

    if (massing.bands.length === 0) {
        return {
            ok: false,
            failure: 'SOURCE_EMPTY',
            // Says WHY it is empty, with the numbers, rather than showing nothing.
            reason:
                `"${ref.sourceProjectName || ref.sourceProjectId}" resolved, but no level produced a `
                + `massing volume (${elementCount} element(s) read`
                + `${massing.skippedLevels.length > 0 ? `, levels skipped: ${massing.skippedLevels.join(', ')}` : ''}). `
                + 'A link shows a building’s bulk per level; a model with no levelled walls, slabs, '
                + 'columns or roofs has no bulk to show.',
            massing,
            resolvedVersionId: versionId,
            resolvedVersionLabel: versionLabel,
            sourceOrigin: readSnapshotOrigin(raw),
            sourceElementCount: elementCount,
        };
    }

    return {
        ok: true, failure: null, reason: null,
        massing,
        resolvedVersionId: versionId,
        resolvedVersionLabel: versionLabel,
        sourceOrigin: readSnapshotOrigin(raw),
        sourceElementCount: elementCount,
    };
}

/**
 * The sentence for an unreadable source. A 404 here is overwhelmingly likely to be
 * L-2901 (the read routes scope to `owner_id`), so it SAYS so rather than leaving
 * the user to conclude their colleague's project does not exist.
 */
function unreachableReason(ref: LinkedModelRef, status: number): string {
    const who = ref.sourceProjectName || ref.sourceProjectId;
    if (status === 404 || status === 403) {
        return `"${who}" could not be read (HTTP ${status}). Linking currently works only for `
            + 'projects YOU own: the server’s project read routes scope to the owner and do not '
            + 'yet consult project membership (L-2901). A colleague’s project cannot be linked yet.';
    }
    return `"${who}" could not be read (HTTP ${status}). The link is kept and will resolve again `
        + 'when the project is reachable.';
}
