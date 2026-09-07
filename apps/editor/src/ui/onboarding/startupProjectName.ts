/**
 * startupProjectName.ts — §STARTUP-NAME-FROM-LOCATION (founder 2026-09-07):
 * *"Remove / Exclude the project name — keep it as before — default name based on location — and
 * a code"*.
 *
 * ⭐ THIS MODULE IS WHAT IS LEFT OF `startupProjectNameCard.ts`, AND THE DELETION WAS DELIBERATE.
 * The card ("Name your project", raised over the live globe, Skip / Save name) was the founder's
 * OWN idea and was correct when he asked for it: *"Maybe add straight after a new modal asking for
 * the name of the project — like that gives you time — then you load barcelona split view straight
 * away!"*. At that moment `geocode:end → split-mounted` was **22.8 s**, because the reveal was
 * awaiting the context warm; a card spent that wait on something useful.
 * §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (`d1ecb2fe`) removed that gate — the split now mounts when
 * the flight settles. **The wait the card was hiding is largely gone, so the card became a step
 * between him and his site**, and a step is exactly what it was never supposed to be. Reversing it
 * is not an admission that the original was wrong; it is the same judgement applied to a changed
 * measurement. L-13173.
 *
 * ⛔ SO THERE IS NO DOM HERE AT ALL, AND THERE MUST NEVER BE AGAIN. This file is pure: two string
 * functions and a composer. If a future lane wants to ask the user for a name on the LOCATION path,
 * that is a product decision to re-open with the founder, not a helper to add here.
 *
 * ⚠ THE NAME IS STILL A REAL WRITE. `OnboardingStepController.applyProjectName` renames through
 * `runtime.persistence.client.rename(projectId, name)` — the same path the hub's rename modal uses.
 * This module owns NO persistence: it composes a string and hands it over, so there can never be a
 * second, divergent naming write. Renaming stays available from the hub; only the interruption went.
 *
 * ⭐ THE SKIP-LOCATION BRANCH KEEPS ITS OWN NAMING STEP, and that is not an inconsistency.
 * `OnboardingStepController.renderNameThenCanvasStep()` ("Step 2 of 2 · Name", *"No location, no
 * plot"*) still asks, because with no location there is no place to name the project after — the
 * rule below has no input on that branch. Deleting it would leave the project permanently called
 * `Untitled Site — <stamp>` with nothing better available.
 *
 * P3 — no `requestAnimationFrame`, no timer. P4 — no `(window as any)`; no `window` at all.
 * P8 — every exported function carries an OTel span.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.onboarding.startup-project-name');

/**
 * The separator between the place and the code. An em dash with spaces, matching
 * `projectAutoName.generateUntitledSiteName`'s `Untitled Site — 2026-09-07 18:31` so the hub's two
 * auto-name shapes read as one family rather than two conventions.
 */
export const STARTUP_NAME_SEPARATOR = ' — ';

/** How many characters of the project id become the code. See {@link startupProjectCode}. */
export const STARTUP_NAME_CODE_LENGTH = 4;

/**
 * The place half of the default name — the FIRST comma-segment of the provider's display name.
 *
 * ⚠ WHY NOT THE WHOLE STRING. Nominatim's `displayName` for the founder's own query is
 * *"Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España"*. Writing that as the project name
 * would be technically faithful and practically useless — it is a disambiguation path, not a name,
 * and it is what the user would immediately delete. The first segment is the place they typed.
 *
 * ⛔ IT NEVER INVENTS. An empty or unusable address yields `''`, and the caller treats an empty
 * name as a no-op rather than a write of `""` — so a project with no readable place keeps whatever
 * name it already had instead of gaining a fabricated one.
 */
export function startupProjectNameDefault(address: string | null | undefined): string {
    const span = _tracer.startSpan('pryzm.onboarding.startup-project-name.default');
    try {
        const raw = (address ?? '').trim();
        if (!raw) return '';
        return raw.split(',')[0]?.trim() ?? '';
    } finally {
        span.end();
    }
}

/**
 * ⭐ THE CODE HALF — **the last four alphanumeric characters of the project id, uppercased.**
 * `proj-1787554200066-a936f1ea8b34` → `8B34`.
 *
 * ── WHY FOUR CHARACTERS OF THE ID AND NOT THE INCUMBENT DATE-TIME ──────────────────────────────
 * The pre-location default is `Untitled Site — 2026-09-07 18:31`, so a date-time stamp is the
 * incumbent pattern and was the obvious candidate. It was rejected on THREE measurements of the
 * surface the founder actually reads these on — the project hub grid
 * (`ProjectHubTemplates.renderCard`):
 *
 *   1. **THE HUB ALREADY PRINTS A DATE, DIRECTLY UNDER THE NAME.** `.ph-card-meta` renders
 *      `formatDate(p.updatedAt)` — *"Just now" / "3h ago" / "Sep 7"*. A stamp in the name spends
 *      the name's width on information already on the card one line lower.
 *   2. **AND THE TWO DATES WOULD DISAGREE.** The meta line tracks `updatedAt` and MOVES every time
 *      he opens the project; a name is frozen at creation. Two dates on one card that drift apart
 *      is worse than one, and the frozen one is the one that looks wrong.
 *   3. **THE STAMP IS THE PART THAT GETS CUT.** `.ph-card-name` is
 *      `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` at 13px in a grid cell — a
 *      long name is truncated FROM THE END, i.e. exactly where the disambiguator sits. Four
 *      characters survive; nineteen do not.
 *
 * ⭐ AND THE ID IS A REAL HANDLE, NOT A DECORATION. The code is a literal substring of the project
 * id, so *"open the 8B34 one"* narrows a log line, a URL and a database row — it is derivable by
 * eye and needs no lookup table. A random or hashed code would disambiguate equally well and mean
 * nothing. Two projects collide only if their ids share a 4-character tail (ids end in random hex
 * or base36), which for one user's project list is not a practical concern — and readability at a
 * glance is what was being optimised, not global uniqueness.
 *
 * ⛔ IT NEVER INVENTS EITHER. No id ⇒ `''` ⇒ {@link startupProjectName} emits the bare place name.
 * That branch is unreachable in practice and honest by construction: with no project id there is
 * also no `persistence.client.rename` target, so a codeless name is never written anywhere.
 */
export function startupProjectCode(projectId: string | null | undefined): string {
    const span = _tracer.startSpan('pryzm.onboarding.startup-project-name.code');
    try {
        // Punctuation is dropped rather than kept, so the id's own shape (`proj-<epoch>-<hex>`,
        // `proj-<uuid>`, `proj-<epoch>-<base36>` — all three are minted by this stack) cannot put a
        // dash or a hyphen into a four-character code.
        const alnum = (projectId ?? '').replace(/[^0-9A-Za-z]/g, '');
        if (!alnum) return '';
        return alnum.slice(-STARTUP_NAME_CODE_LENGTH).toUpperCase();
    } finally {
        span.end();
    }
}

/**
 * The default project name for a geocoded place: `"Barcelona — 8B34"`.
 *
 * ⛔ THE PLACE IS LOAD-BEARING AND THE CODE IS NOT. No place ⇒ `''` (write nothing; the project
 * keeps the name it has). A place with no code ⇒ the bare place name, never a dangling separator.
 */
export function startupProjectName(
    address: string | null | undefined,
    projectId: string | null | undefined,
): string {
    const span = _tracer.startSpan('pryzm.onboarding.startup-project-name.compose');
    try {
        const place = startupProjectNameDefault(address);
        if (!place) return '';
        const code = startupProjectCode(projectId);
        return code ? `${place}${STARTUP_NAME_SEPARATOR}${code}` : place;
    } finally {
        span.end();
    }
}
