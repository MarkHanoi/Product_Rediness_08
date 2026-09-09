// §CADASTRAL-BOUNDARIES-ONE-OWNER (C57 §5.5, C59 §2.10, lane CADASTRAL-COVERAGE 2026-09-09)
//
// THE founder's request, in his words: *"i want to have the possibility with a toggle — to show the
// boundary lines in the 2d site map / 3d site map of each cadastral parcel."* Not just the selected
// parcel: the surrounding ones.
//
// ⛔⛔ WHY THIS FLAG DOES NOT LIVE ON A VIEWPORT, WHICH IS WHERE EVERY OTHER SITE TOGGLE LIVES
// -----------------------------------------------------------------------------------------------
// `setStreetLifeEnabled` / `setFormaTerrainEnabled` keep their state on the CesiumViewport instance,
// and for a Cesium-only layer that is correct. This layer is NOT Cesium-only, and that single fact
// changes the answer:
//
//   · the "3d site map" is `CesiumViewport` (Forma `plan` and `3d` modes)
//   · the "2d site map" is `SiteBoundaryMap2D` — MapLibre, a different renderer with no Cesium
//     viewport instance to hold anything
//   · `FormaSiteAnalysisControls` — the chrome that hosts every existing 3D toggle — is MOUNTED
//     ONLY WHEN `formaViewMode !== 'map2d'` (`GISAreaLayout.ts`, and `legacyViewSwitcherRetirement`
//     records the same). So in the very view the founder named first, that panel does not exist.
//
// Two chromes, two renderers, mutually exclusive mounts. A boolean on the viewport would therefore
// have to be MIRRORED by a second boolean in MapLibre, and the two would drift the first time one
// view was toggled while the other was unmounted — the user flips it on in 2D, switches to 3D, and
// it is off. That is [[view-region-one-owner]] / C59 §2.10 (six writers of one region, oscillating)
// recurring at a new site, and it is the specific defect this module exists to make impossible.
//
// ⛔ THIS MODULE DRAWS NOTHING. No THREE, no Cesium, no MapLibre, no DOM. It holds the flag and the
// verdict; every surface SUBSCRIBES and renders. Keeping it renderer-free is what lets a spec
// exercise the one-owner property with no viewport at all.
//
// ⭐ THE SHAPE IS COPIED, NOT INVENTED — `siteGeometryHighlight.ts` is the same store + surface
// registry + reach probe, already proven in this codebase, and its `unreported ≠ none` rule is
// reproduced here for the same reason (C84 EI-1b).

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site');

// ─────────────────────────────────────────────────────────────────────────────
// The verdict — what the LAST area query established, held beside the flag so
// both chips print the SAME sentence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ FIVE STATES, AND COLLAPSING ANY TWO OF THEM RE-CREATES THE DEFECT C57 §1.14 EXISTS TO PREVENT.
 *
 * On screen, four of these draw exactly the same nothing:
 *   · `idle`        — nobody has asked yet. Not a finding.
 *                    ⚠ THIS IS C57 §1.14.7's `unreported` VERDICT, UNDER A DIFFERENT NAME,
 *                    and the rename is deliberate. §1.14.7 requires that an absent verdict
 *                    read as *nobody has asked* and NEVER as `unsupported`; that is exactly
 *                    what this arm is and it is enforced by
 *                    `cadastralBoundariesChipEnabled` (only `unsupported` disables the
 *                    chip). The word `unreported` is reserved in this module for the
 *                    REACH axis (`CadastralBoundaryReach.status`), which answers a
 *                    DIFFERENT question — *which views draw it* — and one word meaning two
 *                    things inside one module is how the next reader gets it wrong.
 *   · `loading`     — asked, still waiting. Not a finding.
 *   · `ok` with 0   — the register answered: there are no parcels here. A REAL finding about land.
 *   · `unsupported` — this register cannot be asked at all. A fact about the SOURCE, permanent.
 *   · `unreachable` — it can, and it did not answer. Transient.
 * Only this discriminator tells them apart, which is why the flag and the verdict live together:
 * a chip that knows it is ON but not WHY the map is blank will invent an explanation
 * (§CONTEXT-DATA-HONESTY, L-581 / L-616).
 */
export type CadastralBoundariesVerdict =
    | { readonly kind: 'idle' }
    | { readonly kind: 'loading' }
    | {
        readonly kind: 'ok';
        readonly count: number;
        /** C57 §1.14.3 — "that is all of them" vs "that is all we asked for". */
        readonly truncated: boolean;
        /** The register that answered, for attribution (C57 §1.9). Null when unstated. */
        readonly sourceLabel: string | null;
    }
    | { readonly kind: 'unsupported'; readonly reason: string }
    | { readonly kind: 'unreachable'; readonly reason: string };

/**
 * THE one sentence, derived from the verdict. Pure; total; never throws.
 *
 * ⭐ IT LIVES HERE RATHER THAN IN EITHER CHIP so the 2D map and the 3D panel cannot describe the
 * same state in two different ways — which is the readable, user-visible form of the same
 * one-rule-two-implementations defect this module is built against.
 *
 * ⚠ No arm blames the plot. `unsupported` and `unreachable` both name the SOURCE or PRYZM's reach
 * into it; only the `ok`-with-zero arm makes a claim about the land, because it is the only one
 * entitled to.
 */
export function cadastralBoundariesSentence(v: CadastralBoundariesVerdict): string {
    switch (v.kind) {
        case 'idle':
            return 'Turn this on to draw the cadastral parcel boundaries around your plot.';
        case 'loading':
            return 'Looking up the surrounding parcel boundaries…';
        case 'ok': {
            if (v.count === 0) {
                return 'The cadastre answered and holds no parcels in this area, so there are no '
                    + 'boundaries to draw here.';
            }
            const src = v.sourceLabel ? ` from ${v.sourceLabel}` : '';
            return v.truncated
                ? `Showing ${v.count} parcel boundaries${src}. There are more than PRYZM asked for, `
                + 'so this is a partial picture — zoom the site scope in for a complete one.'
                : `Showing all ${v.count} parcel boundaries${src} within the site scope.`;
        }
        case 'unsupported':
            return v.reason;
        case 'unreachable':
            return v.reason;
    }
}

/**
 * ⛔ Whether the CHIP should be clickable. `unsupported` is the only verdict that disables it: it
 * is the only one that will not change on a retry. An `unreachable` register may answer in a
 * moment, and a chip the user cannot press is a chip that cannot recover.
 */
export function cadastralBoundariesChipEnabled(v: CadastralBoundariesVerdict): boolean {
    return v.kind !== 'unsupported';
}

// ─────────────────────────────────────────────────────────────────────────────
// The store — session-only, push-not-poll (the `siteGeometryHighlight.ts` contract)
// ─────────────────────────────────────────────────────────────────────────────

type Listener = () => void;

const listeners = new Set<Listener>();

/** OFF at rest: an overlay that costs a government round-trip is never on by default. */
let enabled = false;

let verdict: CadastralBoundariesVerdict = { kind: 'idle' };

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][cadastral-boundaries] listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ of the flag. */
export function getCadastralBoundariesEnabled(): boolean {
    return enabled;
}

/**
 * THE ONE WRITE. Both chips call this and nothing else — neither reaches into a scene, and neither
 * keeps a boolean of its own. No-ops when unchanged, so an idempotent re-assert costs no repaint.
 */
export function setCadastralBoundariesEnabled(on: boolean): void {
    if (enabled === on) return;
    enabled = on;
    // Turning it OFF returns the verdict to `idle`, not to a stale `ok`. A remembered "showing 43
    // boundaries" under an OFF chip is a claim about a drawing that is no longer on screen.
    if (!on) verdict = { kind: 'idle' };
    notify();
}

/** Click-the-chip-again turns it off. Returns the value now in force. */
export function toggleCadastralBoundaries(): boolean {
    setCadastralBoundariesEnabled(!enabled);
    return enabled;
}

/** THE ONE READ of the verdict. */
export function getCadastralBoundariesVerdict(): CadastralBoundariesVerdict {
    return verdict;
}

/**
 * THE ONE WRITE of the verdict — called by the fetcher, never by a chip. A chip that set its own
 * verdict would be describing its own view rather than the query, and the two chips would
 * disagree the moment only one of them was mounted.
 */
export function setCadastralBoundariesVerdict(next: CadastralBoundariesVerdict): void {
    verdict = next;
    notify();
}

/** Subscribe a surface (or a chip). Returns its own unsubscribe. */
export function subscribeCadastralBoundaries(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Test-only reset — clears the flag, the verdict and every subscriber. */
export function __resetCadastralBoundariesForTests(): void {
    enabled = false;
    verdict = { kind: 'idle' };
    listeners.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// §CADASTRAL-BOUNDARY-REACH — WHICH views actually draw it, MEASURED not asserted
// ─────────────────────────────────────────────────────────────────────────────
//
// The same registry `siteGeometryHighlight.ts` carries, for the same reason and with the same
// `unreported ≠ none` rule. It matters more here, not less: this overlay is explicitly a
// TWO-SURFACE feature, so "is the other one actually wired?" is the question most likely to be
// answered wrong — and answering it from a hard-coded sentence would keep reading "shown in the 2D
// and 3D site views" for as long as it took someone to notice neither was subscribed.
//
// ⛔ NOT A SECOND SUBSCRIBER LIST. `listeners` is the notification channel and stays anonymous — a
// chip repainting its own pressed state subscribes too, and it is not a surface that draws
// boundaries. Counting listeners to answer "where will this show?" would report the panel as a
// viewport, which is the [[fake-more-capable-than-real]] shape.

const drawSurfaces = new Map<string, string>();

/**
 * A renderer DECLARES that it subscribes AND draws the boundary lines. Call it beside the
 * `subscribeCadastralBoundaries` call it describes, and dispose the returned function with it — a
 * registration outliving its subscription would name a view that no longer repaints.
 *
 * @param id        stable per renderer (last registration wins, so a hot-reloaded renderer
 *                  replaces its own row instead of duplicating it)
 * @param viewLabel THE USER'S word for the view, matching the view switcher's own label.
 */
export function registerCadastralBoundarySurface(id: string, viewLabel: string): () => void {
    drawSurfaces.set(id, viewLabel);
    return () => {
        drawSurfaces.delete(id);
    };
}

/** The view labels that can currently draw the boundaries, in registration order. */
export function getCadastralBoundarySurfaces(): readonly string[] {
    return Object.freeze([...drawSurfaces.values()]);
}

export interface CadastralBoundaryReach {
    readonly surfaces: readonly string[];
    /**
     * ⛔ `unreported` IS NOT `none`. An empty registry means no renderer has DECLARED itself in this
     * session; it does NOT establish that nothing draws the overlay. A renderer can subscribe
     * without registering, and the scene may simply not have initialised yet. Printing "nothing
     * will happen" from an absence of reporting asserts a fact about the product the registry
     * cannot support — the rule `viewSegmentSwitcher.ts` and `siteGeometryHighlight.ts` both state,
     * copied rather than re-derived (C84 EI-1b).
     */
    readonly status: 'named' | 'unreported';
    readonly sentence: string;
}

/** Where the overlay will be visible, and the sentence that says so. Pure over the registry. */
export function describeCadastralBoundaryReach(): CadastralBoundaryReach {
    const span = _tracer.startSpan('pryzm.site.describeCadastralBoundaryReach');
    try {
        const surfaces = getCadastralBoundarySurfaces();
        span.setAttribute('pryzm.cadastralBoundaries.drawSurfaces', surfaces.length);
        if (surfaces.length === 0) {
            return Object.freeze({
                surfaces,
                status: 'unreported' as const,
                sentence:
                    'No view has declared that it draws parcel boundaries in this session, so PRYZM '
                    + 'cannot tell you where to look. That is a gap in PRYZM’s own reporting — not a '
                    + 'finding about this plot.',
            });
        }
        const named = surfaces.length === 1
            ? surfaces[0]!
            : `${surfaces.slice(0, -1).join(', ')} and ${surfaces[surfaces.length - 1]!}`;
        return Object.freeze({
            surfaces,
            status: 'named' as const,
            sentence: `Drawn in the ${named} view${surfaces.length > 1 ? 's' : ''}.`,
        });
    } finally {
        span.end();
    }
}

/** Test-only reset for the surface registry, separate from the flag reset on purpose. */
export function __resetCadastralBoundarySurfacesForTests(): void {
    drawSurfaces.clear();
}
