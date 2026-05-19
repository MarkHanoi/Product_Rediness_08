/**
 * Boot-shell global type declarations (Wave 1.5b — App-Shell pattern).
 *
 * These globals are set up by the inline <script> in `index.html` BEFORE any
 * module script runs.  They exist to bridge the App-Shell first-paint stage
 * (Stage 0 in `docs/03_PRYZM3/02-ARCHITECTURE.md §6`) with the runtime stage
 * (Stage 1) once `LandingPage.ts` mounts:
 *
 *   • `__pryzmPendingActions` — a queue of pre-boot CTA clicks the user made
 *     on the App-Shell skeleton before LandingPage's JS finished loading.
 *     Drained by `LandingPage.ts` on construction.
 *   • `__pryzmSkeletonClick(action)` — pushes the action string into the queue.
 *     Bound as the `onclick` handler on the skeleton's three CTA buttons in
 *     `index.html`.
 *
 * Declaring them here (rather than untyped window casts) keeps the boot-shell
 * carve-out fully P4-compliant (`01-VISION.md §2 P4`: untyped window escape
 * hatches forbidden).  The cast tripwire (`tools/ga-gate/check-cast-count.ts`)
 * greps for the literal untyped-cast pattern; this declaration removes the
 * need for any cast at all.
 *
 * The declarations are scoped to the boot-shell handshake only — adding new
 * globals here for runtime services would defeat the purpose of P1 (single
 * composition root) and is forbidden.  Anything beyond first-paint goes
 * through `composeRuntime()` and the typed `PryzmRuntime` handle.
 */
declare global {
    interface Window {
        /**
         * Queue of CTA actions ('login' / 'getStarted' / 'contactSales') the user
         * clicked on the App-Shell skeleton before `LandingPage.ts` finished
         * loading.  Initialized to `[]` by the inline boot <script> in
         * `index.html`; drained by `LandingPage`'s constructor (first item only,
         * so 3 rapid pre-boot clicks don't open 3 modals).
         */
        __pryzmPendingActions?: string[];

        /**
         * Inline-bound onclick handler for the App-Shell skeleton's CTA buttons.
         * Pushes the action name into `__pryzmPendingActions`.
         */
        __pryzmSkeletonClick?: (action: string) => void;
    }
}

export {};
