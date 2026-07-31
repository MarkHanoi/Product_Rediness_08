// §FEAT-SITE-ENTRY-GLOBE (L-593, C60) — the PURE core of the 3D globe ENTRY flow:
// `world → country → city → parcel`, its coverage verdicts, and the camera + panel
// projections derived from them.
//
// WHY A PURE MODULE (no DOM / no Cesium / no THREE / no I/O) — the same argument as
// `paneViewModel.ts` (C59 §1.2) and `globePlacementDecisions.ts`: the live surface is a
// Cesium viewer that cannot run headless, so the DECISION layer (which stage, what the
// camera should look at, what we may honestly claim at that stage, whether a descent to
// the parcel stage is permitted) is pinned HERE and unit-tested without a viewer.
// Pure decisions are P8 span-exempt (see the `globePlacementDecisions` header).
//
// ── WHY A REDUCER AND NOT A `camera.moveEnd` ALTITUDE LISTENER ──────────────────────
// The tempting implementation is: listen to `moveEnd`, read the camera height, swap the
// panel on threshold crossings. It is wrong for three independent reasons, and each one
// alone is disqualifying:
//
//   1. IT FLAPS. Altitude is continuous and the user's hand is not steady. A camera
//      hovering at a band edge re-enters and re-leaves the band on every inertial
//      settle, and the panel strobes. A reducer changes stage only when an INTENT says
//      so, so a stage is stable under camera jitter by construction.
//   2. IT HAS NOWHERE TO PUT THE COVERAGE ANSWER. "Which jurisdiction is the user
//      looking at, and can we answer there?" is state the camera does not carry. A
//      listener would have to re-derive it every frame from a position, and would have
//      no way to represent "the user explicitly chose Barcelona" versus "the camera
//      happens to be over it".
//   3. STAGE IS A CAUSE, NOT AN EFFECT. The camera is a PROJECTION of the stage
//      (`cameraForState`), not its input. Inverting that makes the camera the source of
//      truth for a decision that must also survive a re-parent, a pane swap, and a
//      re-mount — all of which move the camera without the user navigating anywhere.
//
// ── C12: NO ENU FRAME IS ASSUMED ────────────────────────────────────────────────────
// Every coordinate in this module is WGS84 degrees + an altitude in metres above the
// ellipsoid. The LTP-ENU frame is established when a SITE is chosen (C19 §1.3) — i.e.
// AFTER this flow ends — so globe-scale work here must never touch project metres.
//
// ── C19 §1.3/§1.4: THE PRE-SITE STAGES WRITE NO SITE STATE ──────────────────────────
// The parcel boundary is a ONE-SHOT IMMUTABLE polygon. A country or city stage that set
// a site origin "to help the camera" would burn that one shot before the user had picked
// anything. So the reducer emits a `site-handoff` effect from EXACTLY ONE intent —
// `site.entry.select-parcel` — and `SiteEntryModel.test.ts` pins that as a property over
// every other intent, not as a code-reading promise.

// §JURISDICTION-SPECIFICITY (L-652) — the resolution rule is IMPORTED, never restated. Two
// jurisdictions can claim one point (Barcelona's metropolitan proximity box fully contains
// L'Hospitalet's, Badalona's, Sant Boi's and Cornellà's municipal boxes), and this module used to
// answer that with FIRST MATCH over registration order — so every L'Hospitalet point resolved to
// `es-08019-barcelona`, i.e. one municipality's land answered with another's packed numbers and
// citations. The rule that decides it lives on the registration in `@pryzm/site-parcel-data`
// (L2), because that is where the extents and predicates live; a second copy of the ordering here
// is a second statement that can silently disagree — the same reason `siteEntryCoverage.ts` holds
// no data. This module stays pure: `resolveJurisdictionClaim` is a pure function over a list.
import {
    resolveJurisdictionClaim,
    type JurisdictionClaimResolution,
    type JurisdictionExtentResolution,
} from '@pryzm/site-parcel-data';
import type { PaneId } from './paneViewModel';

// ── Vocabulary ──────────────────────────────────────────────────────────────────────

/** A WGS84 point. Degrees. Never project metres (C12 — see the header). */
export interface GeoPoint {
    readonly lat: number;
    readonly lon: number;
}

/** A coarse WGS84 extent. Structurally identical to `JurisdictionExtent`. */
export interface GeoExtent {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * ONE jurisdiction PRYZM can answer in, as this model needs it.
 *
 * ⚠ THIS TYPE IS A SHAPE, NOT A SOURCE. The only legal way to obtain values of it in
 * production is `siteEntryCoverage.ts`, which projects them from the rule-pack registry.
 * It is declared structurally here so the reducer stays pure and testable with fixtures —
 * NOT so a caller can hand-write a coverage table. C60 §2 forbids the latter.
 */
export interface CoverageEntry {
    readonly jurisdictionId: string;
    readonly displayName: string;
    readonly countryCode: string;
    readonly countryName: string;
    readonly extent: GeoExtent;
    /** The dispatcher's own routing predicate for this jurisdiction. */
    readonly contains: (lat: number, lon: number) => boolean;
    /**
     * §JURISDICTION-SPECIFICITY — what `extent` IS (`district` ≺ `municipal` ≺ `metropolitan` ≺
     * `national`), declared by the registration. REQUIRED: a fixture that omitted it would be a
     * `tsc` error, not a synthetic city that silently wins or loses an overlap.
     */
    readonly extentResolution: JurisdictionExtentResolution;
    readonly answerSummary: string;
    readonly packZoneCodes: readonly string[];
}

/**
 * The founder's (A)-vs-(B) decision, as a CONFIGURATION VALUE rather than a code shape.
 *
 * - `'coverage-gated'` — **(A), the shipped default.** The globe is freely navigable at
 *   world/country/city, every stage states plainly whether PRYZM can answer there, and
 *   the ONE hard gate is the descent into the `parcel` stage: it requires the target to
 *   be inside a registered jurisdiction. A user is therefore told "not yet covered"
 *   BEFORE investing the zoom, never after.
 * - `'open'` — **(B).** Identical machine; the parcel-stage descent gate is lifted and
 *   the refusal happens downstream at the parcel step (where `siteDispatch` already
 *   refuses honestly). The panel still tells the truth on the way down.
 *
 * ⚠ Switching (A)→(B) is THIS FIELD and nothing else. There is no second code path, no
 * branch on mode anywhere except `descentGate()` and the panel copy that explains it.
 */
export type SiteEntryMode = 'coverage-gated' | 'open';

/** The four stages, ordered outermost → innermost. */
export type SiteEntryStage = 'world' | 'country' | 'city' | 'parcel';

/** Stage order, derived once so `descend`/`ascend` cannot disagree with it. */
export const SITE_ENTRY_STAGES: readonly SiteEntryStage[] = ['world', 'country', 'city', 'parcel'];

export function stageIndex(stage: SiteEntryStage): number {
    return SITE_ENTRY_STAGES.indexOf(stage);
}

/**
 * DECLARED camera altitude bands, metres above the ellipsoid.
 *
 * ⚠ These are OUTPUTS (what the camera is flown TO when a stage is entered), never
 * INPUTS (they are not compared against a live camera height to infer a stage — see the
 * header on why altitude-sniffing is disqualified). `parcel` matches the existing
 * site-framing altitude so the hand-off to `frameSiteLocation` is not a visible jump.
 */
export const SITE_ENTRY_ALTITUDE_M: Readonly<Record<SiteEntryStage, number>> = {
    world: 20_000_000,
    country: 1_200_000,
    city: 18_000,
    parcel: 600,
};

/** DECLARED camera pitch per stage, degrees (negative = looking down). */
export const SITE_ENTRY_PITCH_DEG: Readonly<Record<SiteEntryStage, number>> = {
    world: -90,
    country: -90,
    city: -75,
    parcel: -60,
};

/**
 * Where the `world` stage looks when nothing has been chosen. A neutral whole-globe
 * framing — deliberately NOT centred on Barcelona, which would pre-answer the question
 * the world stage exists to ask.
 */
export const WORLD_HOME: GeoPoint = { lat: 15, lon: 5 };

// ── State ───────────────────────────────────────────────────────────────────────────

/**
 * The entry flow's whole state. Immutable; every transition returns a new object.
 *
 * `countryCode` is set ONLY when we actually know it — i.e. the user picked a country
 * from the covered list, or the focus resolved into a registered jurisdiction. **We hold
 * no country-boundary data**, so a free camera move over an arbitrary landmass leaves it
 * `null` and the panel says "outside PRYZM's covered jurisdictions" WITHOUT naming a
 * country. Naming one would be the C58 §1.4 fabrication at the navigation layer — the
 * same class as the invented 9 m heights.
 */
export interface SiteEntryState {
    readonly stage: SiteEntryStage;
    /** What the camera is aimed at, WGS84. `null` only at the untouched world stage. */
    readonly focus: GeoPoint | null;
    /** Known ONLY when chosen or resolved — never inferred. See above. */
    readonly countryCode: string | null;
    /** Set iff `focus` falls inside a registered jurisdiction's routing predicate. */
    readonly jurisdictionId: string | null;
}

export const INITIAL_SITE_ENTRY_STATE: SiteEntryState = {
    stage: 'world',
    focus: null,
    countryCode: null,
    jurisdictionId: null,
};

// ── Intents (command-named, C59 §2 invariant 3 / P6) ────────────────────────────────

export type SiteEntryIntent =
    /** Back to the untouched whole-globe view. */
    | { readonly type: 'site.entry.reset' }
    /** Pick a country from the covered list (world → country). */
    | { readonly type: 'site.entry.focus-country'; readonly countryCode: string }
    /** Pick a covered jurisdiction by id (→ city). */
    | { readonly type: 'site.entry.focus-jurisdiction'; readonly jurisdictionId: string }
    /**
     * Descend ONE stage toward the point the user indicated (a globe click, a search
     * result). Stage-relative, not altitude-derived: the reducer decides where this
     * lands, so the same gesture cannot mean two things depending on camera jitter.
     */
    | { readonly type: 'site.entry.descend'; readonly lat: number; readonly lon: number }
    /** Rise one stage (the panel's "Back"). */
    | { readonly type: 'site.entry.ascend' }
    /**
     * THE hand-off. Legal ONLY at the `parcel` stage. This is the ONE intent that may
     * produce a `site-handoff` effect (C19 §1.3/§1.4 — see the header).
     */
    | {
          readonly type: 'site.entry.select-parcel';
          readonly lat: number;
          readonly lon: number;
          readonly address?: string | null;
      };

// ── Effects ─────────────────────────────────────────────────────────────────────────

export interface SiteEntryCameraTarget {
    readonly lat: number;
    readonly lon: number;
    readonly altitudeM: number;
    readonly pitchDeg: number;
    readonly stage: SiteEntryStage;
    /** True for the first framing after a mount — the port should `setView`, not glide. */
    readonly instant: boolean;
}

export type SiteEntryEffect =
    /** Fly the ONE Cesium camera. Executed by a port; never by a UI click handler. */
    | { readonly kind: 'camera'; readonly target: SiteEntryCameraTarget }
    /**
     * Leave the entry flow and enter the EXISTING site path (`dispatchSiteLocation` then
     * the boundary commit). The reducer does not perform it — it says it should happen.
     */
    | {
          readonly kind: 'site-handoff';
          readonly lat: number;
          readonly lon: number;
          readonly address: string | null;
          readonly jurisdictionId: string | null;
      };

export type SiteEntryReduction =
    | { readonly ok: true; readonly next: SiteEntryState; readonly effects: readonly SiteEntryEffect[] }
    /** Nothing changed. `rejected` is user-facing copy, not a debug string. */
    | { readonly ok: false; readonly rejected: string };

export interface SiteEntryContext {
    readonly entries: readonly CoverageEntry[];
    readonly mode: SiteEntryMode;
}

// ── Coverage lookup (pure) ──────────────────────────────────────────────────────────

/**
 * WHO GOVERNS A POINT — the full three-valued answer (`none` / `resolved` / `ambiguous`).
 *
 * A thin re-export of the L2 rule, bound to this module's `CoverageEntry` shape, so there is
 * exactly one place in the product where "two jurisdictions claim this point" is decided.
 * P8: span-exempt as a pure re-projection — the span is on `resolveJurisdictionClaim` itself
 * (`pryzm.zoning.resolveJurisdictionClaim`), which is where the decision is actually made.
 */
export function jurisdictionClaimAt(
    entries: readonly CoverageEntry[],
    lat: number,
    lon: number,
): JurisdictionClaimResolution<CoverageEntry> {
    return resolveJurisdictionClaim(entries, lat, lon);
}

/**
 * The registered jurisdiction governing a point, or `null`.
 *
 * Uses each entry's OWN `contains` predicate — the dispatcher's — rather than re-testing
 * the bbox here, so this lookup can never light a region the dispatcher would refuse to
 * route into. `extent` exists for framing maths only.
 *
 * ⚠ AN AMBIGUITY YIELDS `null`, DELIBERATELY. Where two equally-specific registrations claim the
 * same point there is no honest single answer, and returning either would be a confident answer
 * under possibly the wrong ordinance. `null` routes to the "PRYZM cannot answer here" path, and
 * `describeSiteEntryPanel` uses `jurisdictionClaimAt` to say WHY it cannot — an ambiguity refusal,
 * not a coverage gap. Callers that need to tell the two apart must use `jurisdictionClaimAt`.
 */
export function jurisdictionAt(
    entries: readonly CoverageEntry[],
    lat: number,
    lon: number,
): CoverageEntry | null {
    const r = jurisdictionClaimAt(entries, lat, lon);
    return r.kind === 'resolved' ? r.jurisdiction : null;
}

/** Distinct covered countries, in registry order. Derived — never a second list. */
export interface CoveredCountry {
    readonly countryCode: string;
    readonly countryName: string;
    readonly jurisdictions: readonly CoverageEntry[];
}

export function listCoveredCountries(entries: readonly CoverageEntry[]): readonly CoveredCountry[] {
    const byCode = new Map<string, CoverageEntry[]>();
    for (const e of entries) {
        const bucket = byCode.get(e.countryCode);
        if (bucket) bucket.push(e);
        else byCode.set(e.countryCode, [e]);
    }
    return [...byCode.entries()].map(([countryCode, jurisdictions]) => ({
        countryCode,
        countryName: jurisdictions[0]!.countryName,
        jurisdictions,
    }));
}

/** Centre of an extent. The framing anchor — no hand-typed city coordinates anywhere. */
export function extentCentre(extent: GeoExtent): GeoPoint {
    return {
        lat: (extent.minLat + extent.maxLat) / 2,
        lon: (extent.minLon + extent.maxLon) / 2,
    };
}

/**
 * Framing point for a country: the centre of the UNION of its jurisdictions' extents.
 * Derived, so a new registered city moves the country framing automatically and there is
 * no hand-drawn country geometry to drift (C60 §2).
 *
 * ⚠ This is the centre of WHAT WE COVER in that country, not the country's centroid — we
 * hold no country boundaries. The panel must say so rather than imply national coverage.
 */
export function countryFramingPoint(country: CoveredCountry): GeoPoint {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const j of country.jurisdictions) {
        minLat = Math.min(minLat, j.extent.minLat);
        maxLat = Math.max(maxLat, j.extent.maxLat);
        minLon = Math.min(minLon, j.extent.minLon);
        maxLon = Math.max(maxLon, j.extent.maxLon);
    }
    return extentCentre({ minLat, maxLat, minLon, maxLon });
}

// ── Camera projection ───────────────────────────────────────────────────────────────

/**
 * The camera as a PROJECTION of the state (never the other way round — see the header).
 * Deterministic: the same state always frames the same way, which is what makes a
 * re-mount or a pane re-parent recoverable without remembering a camera.
 */
export function cameraForState(state: SiteEntryState, instant = false): SiteEntryCameraTarget {
    const point = state.focus ?? WORLD_HOME;
    return {
        lat: point.lat,
        lon: point.lon,
        altitudeM: SITE_ENTRY_ALTITUDE_M[state.stage],
        pitchDeg: SITE_ENTRY_PITCH_DEG[state.stage],
        stage: state.stage,
        instant,
    };
}

// ── The reducer ─────────────────────────────────────────────────────────────────────

function descended(stage: SiteEntryStage): SiteEntryStage {
    const i = stageIndex(stage);
    return SITE_ENTRY_STAGES[Math.min(i + 1, SITE_ENTRY_STAGES.length - 1)]!;
}

function ascended(stage: SiteEntryStage): SiteEntryStage {
    const i = stageIndex(stage);
    return SITE_ENTRY_STAGES[Math.max(i - 1, 0)]!;
}

/**
 * THE (A)/(B) SWITCH, in one function.
 *
 * In `coverage-gated` mode the ONLY blocked transition in the whole machine is a descent
 * INTO `parcel` at a point no registered jurisdiction claims. Everything shallower stays
 * freely navigable so the user can look, and is told the truth while looking. Returning
 * `null` means "allowed".
 */
function descentGate(
    mode: SiteEntryMode,
    target: SiteEntryStage,
    covering: CoverageEntry | null,
): string | null {
    if (mode === 'open') return null;
    if (target !== 'parcel') return null;
    if (covering) return null;
    return (
        'PRYZM cannot answer here yet — no zoning rule pack is registered for this ' +
        'location, so there is nothing to select a parcel against. Zoom back out to see ' +
        'where PRYZM does answer.'
    );
}

function withFocus(
    state: SiteEntryState,
    stage: SiteEntryStage,
    focus: GeoPoint,
    covering: CoverageEntry | null,
): SiteEntryState {
    return {
        stage,
        focus,
        // Known only when resolved into a registered jurisdiction, or already chosen and
        // still consistent with the new focus. Never guessed from a landmass.
        countryCode: covering ? covering.countryCode : state.countryCode,
        jurisdictionId: covering ? covering.jurisdictionId : null,
    };
}

/**
 * Reduce one intent. PURE: no camera is touched, no store is written, nothing is
 * scheduled. Returns the next state plus the effects a port should perform.
 */
export function reduceSiteEntry(
    state: SiteEntryState,
    intent: SiteEntryIntent,
    ctx: SiteEntryContext,
): SiteEntryReduction {
    switch (intent.type) {
        case 'site.entry.reset': {
            const next = INITIAL_SITE_ENTRY_STATE;
            return { ok: true, next, effects: [{ kind: 'camera', target: cameraForState(next) }] };
        }

        case 'site.entry.focus-country': {
            const country = listCoveredCountries(ctx.entries).find(
                (c) => c.countryCode === intent.countryCode,
            );
            if (!country) {
                return {
                    ok: false,
                    rejected:
                        `PRYZM has no registered jurisdiction in "${intent.countryCode}", so ` +
                        'there is nothing to show at country level there.',
                };
            }
            const next: SiteEntryState = {
                stage: 'country',
                focus: countryFramingPoint(country),
                countryCode: country.countryCode,
                jurisdictionId: null,
            };
            return { ok: true, next, effects: [{ kind: 'camera', target: cameraForState(next) }] };
        }

        case 'site.entry.focus-jurisdiction': {
            const entry = ctx.entries.find((e) => e.jurisdictionId === intent.jurisdictionId);
            if (!entry) {
                return {
                    ok: false,
                    rejected: `No registered jurisdiction "${intent.jurisdictionId}".`,
                };
            }
            const next: SiteEntryState = {
                stage: 'city',
                focus: extentCentre(entry.extent),
                countryCode: entry.countryCode,
                jurisdictionId: entry.jurisdictionId,
            };
            return { ok: true, next, effects: [{ kind: 'camera', target: cameraForState(next) }] };
        }

        case 'site.entry.descend': {
            if (!Number.isFinite(intent.lat) || !Number.isFinite(intent.lon)) {
                return { ok: false, rejected: 'That point is not a valid location.' };
            }
            const target = descended(state.stage);
            const covering = jurisdictionAt(ctx.entries, intent.lat, intent.lon);
            const blocked = descentGate(ctx.mode, target, covering);
            if (blocked) return { ok: false, rejected: blocked };
            const next = withFocus(state, target, { lat: intent.lat, lon: intent.lon }, covering);
            return { ok: true, next, effects: [{ kind: 'camera', target: cameraForState(next) }] };
        }

        case 'site.entry.ascend': {
            if (state.stage === 'world') return { ok: false, rejected: 'Already at the world view.' };
            const stage = ascended(state.stage);
            const next: SiteEntryState =
                stage === 'world'
                    ? INITIAL_SITE_ENTRY_STATE
                    : { ...state, stage };
            return { ok: true, next, effects: [{ kind: 'camera', target: cameraForState(next) }] };
        }

        case 'site.entry.select-parcel': {
            // C19 §1.4 — the ONE place a hand-off may be produced, and only from the
            // stage whose whole purpose is choosing a parcel.
            if (state.stage !== 'parcel') {
                return {
                    ok: false,
                    rejected:
                        'Zoom in to a parcel before selecting one — the country and city ' +
                        'views are for finding a place, not for choosing land.',
                };
            }
            if (!Number.isFinite(intent.lat) || !Number.isFinite(intent.lon)) {
                return { ok: false, rejected: 'That point is not a valid location.' };
            }
            const covering = jurisdictionAt(ctx.entries, intent.lat, intent.lon);
            const blocked = descentGate(ctx.mode, 'parcel', covering);
            if (blocked) return { ok: false, rejected: blocked };
            const next: SiteEntryState = {
                ...state,
                focus: { lat: intent.lat, lon: intent.lon },
                jurisdictionId: covering?.jurisdictionId ?? null,
                countryCode: covering?.countryCode ?? state.countryCode,
            };
            return {
                ok: true,
                next,
                effects: [
                    { kind: 'camera', target: cameraForState(next) },
                    {
                        kind: 'site-handoff',
                        lat: intent.lat,
                        lon: intent.lon,
                        address: intent.address ?? null,
                        jurisdictionId: covering?.jurisdictionId ?? null,
                    },
                ],
            };
        }
    }
}

// ── Panel projection ────────────────────────────────────────────────────────────────

/** What a stage panel offers the user. Rendered by the DOM chrome; decided here. */
export interface SiteEntryPanelAction {
    readonly intent: SiteEntryIntent;
    readonly label: string;
    /** Present ⇒ the action is disabled and this is WHY (C59 Phase-2 disable-or-explain). */
    readonly unavailableReason?: string;
}

/**
 * `covered` — a registered pack answers here. `not-covered` — it does not, stated as a
 * fact about PRYZM. `unknown` — we have not resolved a location yet. There is
 * deliberately NO fourth value that could be read as a soft yes.
 */
export type SiteEntryCoverageVerdict = 'covered' | 'not-covered' | 'unknown';

export interface SiteEntryPanel {
    readonly stage: SiteEntryStage;
    readonly title: string;
    readonly verdict: SiteEntryCoverageVerdict;
    /**
     * The honest answer, as lines of plain copy. Every line is either a statement about
     * PRYZM's own registry or a restatement of the user's choice. **No line may contain a
     * statistic about a place** (population, land area, average height, …) — we hold none,
     * and inventing one is the C58 §1.4 failure this whole design exists to avoid.
     */
    readonly lines: readonly string[];
    readonly actions: readonly SiteEntryPanelAction[];
}

/**
 * C60 §2.2 — a bbox is a COARSE claim and must be labelled as one, at the resolution it actually
 * has. DERIVED from the registration's declared `extentResolution` rather than hard-coded: the
 * line used to read "metropolitan-area resolution" for every jurisdiction, which is simply false
 * for the three NATIONAL registrations (NL/DK/CH) and overstated the precision of their claim.
 */
const EXTENT_RESOLUTION_COPY: Readonly<Record<JurisdictionExtentResolution, string>> = {
    district: 'district resolution',
    municipal: 'municipal resolution',
    metropolitan: 'metropolitan-area resolution',
    national: 'national resolution — a point near a border may fall outside the country',
};

function coveredLines(entry: CoverageEntry): string[] {
    return [
        `PRYZM can answer in ${entry.displayName}, ${entry.countryName}.`,
        entry.answerSummary,
        `${entry.packZoneCodes.length} zone code${entry.packZoneCodes.length === 1 ? '' : 's'} ` +
            'have a curated rule pack; the rest of the city is answered with a cited refusal.',
        `Coverage is recorded at ${EXTENT_RESOLUTION_COPY[entry.extentResolution]} — the exact ` +
            'answer is resolved from the parcel itself once you select one.',
    ];
}

const NOT_COVERED_LINE =
    'PRYZM has no zoning rule pack registered for this location, so it cannot tell you ' +
    'what may be built here. This is a statement about PRYZM, not about the law.';

/**
 * §JURISDICTION-SPECIFICITY — the copy for a point TWO equally-specific registrations claim.
 *
 * ⚠ It is deliberately NOT `NOT_COVERED_LINE`. "No rule pack is registered here" would be FALSE —
 * two are — and a false explanation of a refusal is the same class of defect as a false answer.
 * The verdict stays `not-covered` (PRYZM cannot answer) because C60 §3's three-valued vocabulary
 * has no soft fourth value, but the reason given is the true one.
 */
function ambiguousLines(candidates: readonly CoverageEntry[]): string[] {
    return [
        'Two registered jurisdictions claim this point at the same level of detail — ' +
            `${candidates.map((c) => c.displayName).join(' and ')} — and PRYZM will not guess ` +
            'which ordinance governs it. This is a statement about PRYZM, not about the law.',
        'A wrong answer here would be a real number cited to the wrong ordinance, which is worse ' +
            'than no answer, so PRYZM gives none until the overlap is resolved.',
    ];
}

/**
 * Project the state (plus the registry-derived coverage) into the panel for its stage.
 * PURE — the DOM chrome renders this and holds no copy of its own, so "what does the
 * user see when the answer is *not covered*" is a unit test, not a screenshot review.
 */
export function describeSiteEntryPanel(
    state: SiteEntryState,
    ctx: SiteEntryContext,
): SiteEntryPanel {
    const countries = listCoveredCountries(ctx.entries);
    // §JURISDICTION-SPECIFICITY — the FULL resolution, so an ambiguity can be explained truthfully
    // instead of being reported as an absence of coverage (see `ambiguousLines`).
    const claim: JurisdictionClaimResolution<CoverageEntry> | null = state.focus
        ? jurisdictionClaimAt(ctx.entries, state.focus.lat, state.focus.lon)
        : null;
    const covering =
        state.jurisdictionId != null
            ? (ctx.entries.find((e) => e.jurisdictionId === state.jurisdictionId) ?? null)
            : claim?.kind === 'resolved'
              ? claim.jurisdiction
              : null;
    const ambiguous = covering == null && claim?.kind === 'ambiguous' ? claim.candidates : null;

    const back: SiteEntryPanelAction = {
        intent: { type: 'site.entry.ascend' },
        label: 'Zoom back out',
        ...(state.stage === 'world' ? { unavailableReason: 'You are at the world view.' } : {}),
    };

    if (state.stage === 'world') {
        const total = ctx.entries.length;
        return {
            stage: 'world',
            title: 'Where do you want to build?',
            verdict: 'unknown',
            lines:
                total === 0
                    ? [
                          'PRYZM has no jurisdiction registered yet, so there is nowhere it can ' +
                              'currently answer. The globe is dark on purpose.',
                      ]
                    : [
                          `PRYZM can answer in ${total} jurisdiction${total === 1 ? '' : 's'}, ` +
                              `across ${countries.length} countr${countries.length === 1 ? 'y' : 'ies'}. ` +
                              'They are lit below; everywhere else is not covered yet.',
                          'You can look anywhere. Selecting land is only possible where PRYZM ' +
                              'holds the ordinance.',
                      ],
            actions: countries.map((c) => ({
                intent: { type: 'site.entry.focus-country', countryCode: c.countryCode },
                label: `${c.countryName} — ${c.jurisdictions.length} covered area${
                    c.jurisdictions.length === 1 ? '' : 's'
                }`,
            })),
        };
    }

    if (state.stage === 'country') {
        const country = countries.find((c) => c.countryCode === state.countryCode) ?? null;
        if (!country) {
            // Navigated somewhere we hold nothing. We do NOT name the country — we have
            // no country-boundary data and will not guess one (see `SiteEntryState`).
            return {
                stage: 'country',
                title: 'Not covered yet',
                verdict: 'not-covered',
                lines: [
                    NOT_COVERED_LINE,
                    'Zoom back out to see the areas PRYZM does cover, or keep looking around — ' +
                        'the globe itself is free to explore.',
                ],
                actions: [back],
            };
        }
        return {
            stage: 'country',
            title: country.countryName,
            verdict: 'covered',
            lines: [
                `PRYZM covers ${country.jurisdictions.length} area${
                    country.jurisdictions.length === 1 ? '' : 's'
                } in ${country.countryName}. It does not cover the country as a whole — ` +
                    'coverage is registered per jurisdiction, one ordinance at a time.',
                'PRYZM holds no national statistics and shows none here.',
            ],
            actions: [
                ...country.jurisdictions.map((j) => ({
                    intent: {
                        type: 'site.entry.focus-jurisdiction' as const,
                        jurisdictionId: j.jurisdictionId,
                    },
                    label: j.displayName,
                })),
                back,
            ],
        };
    }

    if (state.stage === 'city') {
        if (!covering) {
            return {
                stage: 'city',
                title: ambiguous ? 'Overlapping jurisdictions' : 'Not covered yet',
                verdict: 'not-covered',
                lines: [
                    ...(ambiguous ? ambiguousLines(ambiguous) : [NOT_COVERED_LINE]),
                    ctx.mode === 'coverage-gated'
                        ? 'You can look, but you cannot select a parcel here — PRYZM would have ' +
                          'nothing to answer with.'
                        : 'You may still zoom in and select a parcel; PRYZM will tell you at that ' +
                          'point that it cannot produce an envelope here.',
                    'Zoom back out to see the areas PRYZM does cover.',
                ],
                actions: [back],
            };
        }
        return {
            stage: 'city',
            title: covering.displayName,
            verdict: 'covered',
            lines: [...coveredLines(covering), 'Zoom in to a plot to select it.'],
            actions: [back],
        };
    }

    // parcel
    if (!covering) {
        // Reachable only in `open` mode — the gate blocks it in `coverage-gated`.
        return {
            stage: 'parcel',
            title: ambiguous ? 'Overlapping jurisdictions' : 'Not covered yet',
            verdict: 'not-covered',
            lines: [
                ...(ambiguous ? ambiguousLines(ambiguous) : [NOT_COVERED_LINE]),
                'You can still select a plot and draw on it, but PRYZM will not produce a ' +
                    'buildable envelope here — it will say so rather than estimate one.',
            ],
            actions: [back],
        };
    }
    return {
        stage: 'parcel',
        title: `Select a plot — ${covering.displayName}`,
        verdict: 'covered',
        lines: [
            ...coveredLines(covering),
            'Click a plot to select it. Selecting is the point at which PRYZM commits to a ' +
                'site — everything up to here is just looking.',
        ],
        actions: [back],
    };
}

// ── Pane placement ──────────────────────────────────────────────────────────────────

/**
 * C59 §2 invariant 5 (perf) — the entry flow must NOT hold a live BIM pane behind it.
 *
 * The founder's box runs the WebGL fallback; a photoreal globe plus a live BIM surface is
 * exactly the two-heavyweight-surface case the invariant warns about, and the entry flow
 * has no use for a BIM pane (there is no model yet — the user has not chosen land).
 *
 * So the entry flow requests the 3D Site SOLO. Returned as an INTENT for the C59
 * `PaneLayoutStore`, not applied here: this module touches no store and no renderer, and
 * the one Cesium instance keeps being moved by the one mechanism that is allowed to move
 * it (C59 §2 invariant 1 + 3).
 */
export function siteEntryPaneIntent(paneId: PaneId): {
    readonly assign: { readonly type: 'view.pane.assign'; readonly paneId: PaneId; readonly viewType: 'site-3d' };
    readonly solo: { readonly type: 'view.pane.solo'; readonly paneId: PaneId };
} {
    return {
        assign: { type: 'view.pane.assign', paneId, viewType: 'site-3d' },
        solo: { type: 'view.pane.solo', paneId },
    };
}
