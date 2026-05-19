/**
 * LandingPageScrollReveal — Scroll-triggered reveal utility for the Landing Page.
 *
 * Contract compliance:
 *   §05 §5   — CSS lives in AppTheme.ts (lp- prefix classes: lp-reveal, lp-reveal--visible)
 *   §06      — Zero BIM engine interaction; purely presentational DOM utility
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Usage:
 *   import { initLandingScrollReveal } from './LandingPageScrollReveal';
 *   // Call once after the shell element is mounted
 *   const cleanup = initLandingScrollReveal(shellEl);
 *   // Call cleanup() in destroy() to disconnect the observer
 */

/**
 * Initialises an IntersectionObserver that adds `.lp-reveal--visible` to any
 * `.lp-reveal` descendant of `shell` once it enters the viewport.
 *
 * @param shell - The root `.lp-shell` element
 * @returns cleanup function — call this in LandingPage.destroy()
 */
export function initLandingScrollReveal(shell: HTMLElement): () => void {
    const targets = Array.from(shell.querySelectorAll<HTMLElement>('.lp-reveal'));

    if (!targets.length || typeof IntersectionObserver === 'undefined') {
        // Fallback: just show everything immediately
        targets.forEach(t => t.classList.add('lp-reveal--visible'));
        return () => {};
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('lp-reveal--visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            root: shell,
            threshold: 0.15,
        }
    );

    targets.forEach(t => observer.observe(t));

    return () => observer.disconnect();
}
