/**
 * linkedModelController — the one place that turns LINK REFERENCES into geometry.
 *
 * Three collaborators, one direction of flow:
 *
 *     LinkedModelStore  ──(refs)──►  linkSourceGateway  ──(massing)──►
 *     LinkedModelSceneRenderer  ──(mount)──►  linkedModelScope (C13 owner)
 *
 * ── WHY A CONTROLLER AND NOT A SUBSCRIPTION ON THE RENDERER ─────────────────
 *
 * Resolving a link is ASYNCHRONOUS (a network read of another project's snapshot)
 * while mounting is synchronous. Putting the await inside the renderer would make
 * the renderer's own state depend on request ordering — two rapid display-mode
 * changes could land out of order and leave the older massing on screen. The
 * controller owns a per-link generation counter instead, so a superseded
 * resolution is DROPPED by name rather than racing.
 *
 * ── RESOLUTION STATUS IS A VALUE THE UI READS ───────────────────────────────
 *
 * `getStatus(linkId)` is the single authority for "what is this link doing" —
 * resolving / shown / refused-with-a-reason. The panel renders from it and never
 * infers state from the absence of geometry, because "nothing on screen" is
 * exactly the ambiguity between *hidden*, *empty* and *failed* that
 * §CONTEXT-DATA-HONESTY forbids collapsing.
 */

import type { LinkedModelRef, LinkedModelId } from '@pryzm/schemas';
import { linkedModelStore, LINKED_MODELS_CHANGED_EVENT } from './LinkedModelStore';
import { resolveLink, type LinkResolution } from './linkSourceGateway';
// §LINK-CONTROLLER-THREE-FREE (L-3159) — `import type`, not `import`.
//
// The renderer is only ever used HERE as a type: a field, a parameter, and calls
// to its instance methods. Importing it as a VALUE made this module — and every
// consumer of it, including the UI panel — carry a module edge to
// `LinkedModelSceneRenderer` and through it to `import * as THREE`, for a binding
// never evaluated at runtime. A UI panel is not a THREE consumer and should not
// become one by accident: the same shape as
// [[server-safe-entry-can-import-browser-ui]], where a barrel import dragged a
// browser UI dependency into the SERVER bundle.
//
// ⚠ HONEST ABOUT WHAT THIS DID AND DID NOT FIX. It was made while chasing a 10 s
// import timeout in the reachability suite, and IT DID NOT FIX THAT. Measured
// per-module, cold:
//
//     linkedModelController   17.7 s   ← after this change
//     ui/site/siteDispatch     9.0 s
//     LinkedModelStore         ~0 s
//     linkedModelsViewModel    ~0 s
//
// The controller's remaining weight is `@pryzm/core-app-model`, reached through
// `linkSourceGateway`'s `apiFetch` — not THREE. THREE was the first guess and it
// was WRONG; the actual fix was extracting `resolveActiveProjectId` out of
// `ui/site/siteDispatch` (§LINK-ACTIVE-PID-EXTRACT, L-3160), which took the panel's
// reachability suite from >120 s to 23 s. This edge is recorded as worth removing
// on its own merits — a UI panel should not carry a module edge to a THREE
// consumer — and NOT as the thing that fixed the timeout, because it was not.
//
// The renderer instance still arrives at `install()` from `initScene`, which IS
// the THREE owner. Nothing about the wiring changes; only the module edge does.
import type { LinkedModelSceneRenderer } from './LinkedModelSceneRenderer';
import { linkMassingCost } from './linkMassing';

export type LinkStatusKind = 'resolving' | 'shown' | 'hidden' | 'refused';

export interface LinkStatus {
    readonly kind: LinkStatusKind;
    /** Non-null for `refused` — a sentence naming what was refused and why. */
    readonly reason: string | null;
    /** Bands drawn. 0 for every non-`shown` state. */
    readonly bands: number;
    /** The measured structural draw-call cost of this link right now. */
    readonly drawCalls: number;
    /** Which version is on screen, for the "what am I looking at" readout. */
    readonly versionLabel: string | null;
    /** Source elements read to build the massing. Reported, never inferred. */
    readonly sourceElementCount: number;
}

const RESOLVING: LinkStatus = {
    kind: 'resolving', reason: null, bands: 0, drawCalls: 0,
    versionLabel: null, sourceElementCount: 0,
};

const HIDDEN: LinkStatus = {
    kind: 'hidden', reason: null, bands: 0, drawCalls: 0,
    versionLabel: null, sourceElementCount: 0,
};

class LinkedModelController {
    private renderer: LinkedModelSceneRenderer | null = null;
    // Keyed by the BRANDED id, not `string`. `syncAll()` compares these keys
    // against a Set built from `LinkedModelRef.id`, and an unbranded key makes
    // that comparison a type error at best and a silent miss at worst.
    private readonly status = new Map<LinkedModelId, LinkStatus>();
    /** Per-link generation — a resolution whose generation is stale is discarded. */
    private readonly generation = new Map<LinkedModelId, number>();
    private readonly listeners = new Set<() => void>();
    private installed = false;

    /**
     * Wire the controller to a live scene. Called once from `initScene` after the
     * world exists. Idempotent — a second call replaces the renderer and re-syncs,
     * which is what an HMR reload needs.
     */
    install(renderer: LinkedModelSceneRenderer): void {
        this.renderer?.dispose();
        this.renderer = renderer;
        if (!this.installed) {
            this.installed = true;
            if (typeof window !== 'undefined') {
                window.addEventListener(LINKED_MODELS_CHANGED_EVENT, () => { void this.syncAll(); });
            }
        }
        void this.syncAll();
    }

    /** Drop the renderer and every status. Used on engine teardown / HMR. */
    uninstall(): void {
        this.renderer?.dispose();
        this.renderer = null;
        this.status.clear();
        this.generation.clear();
        this.announce();
    }

    /** Subscribe to status changes. Returns the unsubscribe. */
    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    /**
     * What this link is doing right now. `null` when the link is unknown.
     *
     * Takes a plain `string` deliberately: a UI panel holds an id it read from a
     * DOM attribute, and forcing the brand here would push a cast into every
     * caller. The widening is safe because this is a READ — `Map.get` on a key
     * that was never branded returns `undefined`, which is the same answer as
     * "no such link". Writes stay branded, which is where the brand earns its
     * keep.
     */
    getStatus(linkId: string): LinkStatus | null {
        return this.status.get(linkId as LinkedModelId) ?? null;
    }

    /**
     * The total structural draw-call cost of every link on screen.
     *
     * This is the number ADR-0346 D6 argues from, computed rather than read off
     * `renderer.info` — L-2502 measured that `info.render.calls` on WebGPU is
     * cumulative-since-start, so a per-frame claim built on it would be wrong.
     */
    totalDrawCalls(): number {
        let total = 0;
        for (const s of this.status.values()) total += s.drawCalls;
        return total;
    }

    /**
     * Re-read ONE link from its source and redraw it. Safe to call repeatedly.
     *
     * ── §LINK-LATEST-IS-NOT-LIVE (L-3161) — THE DECISION ADR-0346 D5 LEFT OPEN ──
     *
     * D5 decided PINNED-vs-LATEST. It did NOT decide what `latest` means in time,
     * and the honest reading of the code as inherited was: a `latest` link
     * re-resolves when the project opens, when any link changes, and never again.
     * It does not poll. That was true but nowhere stated, which is the worst of the
     * three options — a user reading "Following latest save" would reasonably expect
     * their colleague's save to appear, and it would not.
     *
     * **DECIDED: `latest` re-resolves on project open and on an EXPLICIT refresh.
     * It does not poll, and it never mutates under the user's hands mid-session.**
     * Three reasons, in order of weight:
     *
     *   1. A linked model is a COORDINATION DATUM. D5's own argument — if the source
     *      moves without the host's author knowing, every dimension drawn to it is
     *      silently wrong — does not stop applying because the user chose `latest`.
     *      `latest` should mean "I will take the newest when I ask", not "rewrite my
     *      reference plane while I am dimensioning to it".
     *   2. Polling costs a timer per link and an API read per interval, on a scene
     *      the founder already reports as heavy. The frame budget has ONE owner
     *      (P3) and this would not be it.
     *   3. A refresh the user performs is a refresh the user can attribute. A
     *      background one turns "the linked model moved" into an unanswerable
     *      question.
     *
     * This is also the retry path for a link that refused: `SOURCE_UNREACHABLE` and
     * `MISSING_LINK_VERSION` both keep the link and both become resolvable again
     * without unlinking and relinking.
     *
     * Not a bus verb, deliberately: it mutates no persisted state (P6 governs
     * mutations, and this changes no `LinkedModelRef`). It re-reads a cache and
     * redraws — the same category as a repaint.
     */
    async refreshLink(linkId: string): Promise<void> {
        const ref = linkedModelStore.get(linkId);
        if (ref === undefined) return;
        await this.syncOne(ref);
    }

    /** Re-resolve and redraw every link. Safe to call repeatedly. */
    async syncAll(): Promise<void> {
        const refs = linkedModelStore.getAll();
        const live = new Set(refs.map(r => r.id));

        // Drop anything the store no longer holds — including its status, so a
        // removed link cannot leave a stale "refused" row in the panel forever.
        for (const id of [...this.status.keys()]) {
            if (!live.has(id)) {
                this.renderer?.unmountLink(id);
                this.status.delete(id);
                this.generation.delete(id);
            }
        }

        await Promise.all(refs.map(ref => this.syncOne(ref)));
        this.announce();
    }

    /** Re-resolve and redraw ONE link. */
    async syncOne(ref: LinkedModelRef): Promise<void> {
        const gen = (this.generation.get(ref.id) ?? 0) + 1;
        this.generation.set(ref.id, gen);

        if (ref.display === 'hidden') {
            this.renderer?.unmountLink(ref.id);
            this.status.set(ref.id, HIDDEN);
            this.announce();
            return;
        }

        this.status.set(ref.id, RESOLVING);
        this.announce();

        let resolution: LinkResolution;
        try {
            resolution = await resolveLink(ref);
        } catch (e) {
            // `resolveLink` is documented never to throw; if it ever does, the link
            // still gets a NAMED status rather than sitting on 'resolving' forever.
            console.error(`[linkedModelController] resolveLink(${ref.id}) threw:`, e);
            this.status.set(ref.id, {
                kind: 'refused',
                reason: 'The link could not be resolved because of an unexpected error. '
                    + 'It is kept; try refreshing it.',
                bands: 0, drawCalls: 0, versionLabel: null, sourceElementCount: 0,
            });
            this.announce();
            return;
        }

        // §SUPERSEDED — a newer sync started while this one was in flight. Drop it
        // silently: the newer one owns the outcome, and applying this would repaint
        // the OLD answer over the new one.
        if (this.generation.get(ref.id) !== gen) return;

        if (!resolution.ok) {
            this.renderer?.unmountLink(ref.id);
            this.status.set(ref.id, {
                kind: 'refused',
                reason: resolution.reason,
                bands: 0, drawCalls: 0,
                versionLabel: resolution.resolvedVersionLabel,
                sourceElementCount: resolution.sourceElementCount,
            });
            this.announce();
            return;
        }

        this.renderer?.mountLink(ref, resolution.massing);
        const cost = linkMassingCost(resolution.massing);
        this.status.set(ref.id, {
            kind: 'shown',
            reason: null,
            bands: resolution.massing.bands.length,
            drawCalls: cost.drawCalls,
            versionLabel: resolution.resolvedVersionLabel,
            sourceElementCount: resolution.sourceElementCount,
        });
        this.announce();
    }

    private announce(): void {
        for (const fn of this.listeners) {
            try { fn(); } catch (e) {
                console.warn('[linkedModelController] listener threw (non-fatal):', e);
            }
        }
    }
}

export const linkedModelController = new LinkedModelController();
