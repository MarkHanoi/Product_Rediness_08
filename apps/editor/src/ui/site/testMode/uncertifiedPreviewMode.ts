// §STAGING-UNCERTIFIED-PREVIEW (L-449) — the ONE place that may decide "may this browser draw an
// UNCERTIFIED envelope, for staging validation only?"
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Several rule packs (Telde today; Córdoba/Zaragoza already render for real once signed) are FULLY
// BUILT — real transcribed ordinance data, a real dispatch branch, a real `computeBuildableEnvelope`
// call — and are blocked on exactly one thing: a human has not yet signed
// `sources/VERIFICATION.md` (L-449). Before asking for that signature, the founder wants to SEE the
// compute path render correctly on a deployed environment. This module is the ONLY thing that may
// grant that, and it grants nothing to production.
//
// ⛔⛔ WHAT THIS MODULE MUST NEVER DO — enforced by construction, not convention:
//   1. It NEVER reads, writes or references `CANARIAS_ENVELOPE_VERIFIED` or any other
//      `*_ENVELOPE_VERIFIED` / `*_CERTIFIED` constant. Those stay exactly what L-449 requires: a
//      human signature, or `false`. This module answers a DIFFERENT, narrower question — "may a
//      non-production browser draw the SAME compute, loudly watermarked as uncertified?" — and a
//      caller that reached for this INSTEAD of the real gate would be the L-449 defect wearing a
//      test-mode label.
//   2. It NEVER activates in a production build. `import.meta.env.PROD` is Vite's own build-time
//      flag — statically resolved when the bundle is built, not read at runtime — so a real
//      production build (`vite build` with no override) cannot contain a code path where this
//      returns `true`, structurally, the same way `packages/schemas` cannot import THREE.
//   3. It NEVER activates on a bare truthy env var. `VITE_PRYZM_UNCERTIFIED_PREVIEW` must equal the
//      exact literal below — not `"1"`, not `"true"` — so a stray CI variable or a copy-pasted
//      `.env` can never flip it by accident.
//
// Every envelope this unlocks MUST carry `publicationPosture: 'uncertified-preview'`
// (`packages/schemas` → `BuildableEnvelope.ts`) — the classifier
// (`packages/site-parcel-data/src/envelopeToMassing.ts`) makes `complete` UNREACHABLE for that
// posture and stamps a loud, distinct reason string, so no renderer — including one written later —
// can paint an uncertified preview in the confident determination violet.
//
// PURITY: this is deliberately NOT L2-pure — env access is the one thing it exists to do — which is
// exactly why it lives in `apps/editor` (L5), not `packages/site-parcel-data` (L2). L2 purity forbids
// I/O; an env read is I/O.

/** The exact opt-in literal. Not a boolean — see reason 3 above. */
const ACTIVATION_LITERAL = 'i-understand-this-is-not-legally-certified';

/**
 * Is the staging-uncertified-preview override active in THIS running bundle?
 *
 * ⚠ Call this fresh at each dispatch, never cache the result — `import.meta.env` is a build-time
 * constant, so caching changes nothing at runtime, but a fresh call keeps this function the single
 * legible choke point a future reader greps for, rather than a value threaded through call sites.
 */
export function isUncertifiedPreviewModeActive(): boolean {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> })
        .env;
    if (!env) return false;
    // Reason 2 — Vite's own production flag. Hard no, before anything else is even read.
    if (env.PROD === true) return false;
    // Reason 3 — the exact literal, nothing weaker.
    return env.VITE_PRYZM_UNCERTIFIED_PREVIEW === ACTIVATION_LITERAL;
}

/**
 * The loud, unmistakable caveat every uncertified-preview envelope MUST carry as its FIRST caveat.
 * ⚠ Prepended, never appended — a caveats list is often truncated for display; this must survive that.
 */
export function uncertifiedPreviewCaveat(jurisdictionLabel: string): string {
    return (
        `⚠ TEST MODE — NOT LEGALLY CERTIFIED. ${jurisdictionLabel} has NO human sign-off ` +
        '(L-449 gate is shut). This number is shown for staging validation of the compute path only ' +
        '— it is never a buildable right and must never be published as a determination.'
    );
}
