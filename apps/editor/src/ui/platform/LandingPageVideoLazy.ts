/**
 * LandingPageVideoLazy — viewport-driven play/pause for the landing page's
 * stacked full-viewport background videos (rounds 6, SpaceX reference).
 *
 * Contract compliance:
 *   §05 §5   — CSS lives in marketingPages.ts (lp- prefix classes)
 *   §06      — Zero BIM engine interaction; purely presentational DOM utility
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * WHY (founder brief §5): four ~24 MB MP4s must not stream eagerly on load.
 * The below-fold sections' <video> elements are emitted with preload="none"
 * and NO autoplay (see landingMarkup.ts 'app' mode) — the browser fetches
 * nothing for them until this observer calls .play() as a section approaches
 * the viewport. Videos are also PAUSED again when they leave, so at most ~two
 * sections decode at once. Same IntersectionObserver pattern (and the same
 * `root: shell` scroll container) as LandingPageScrollReveal.ts.
 *
 * The hero video keeps its own autoplay (it is above the fold and must move
 * on first paint); it is still observed so it pauses off-screen.
 *
 * prefers-reduced-motion: CSS already hides every landing <video>; this
 * module additionally never calls .play() so no bytes are fetched at all —
 * the one lever the zero-JS apex cannot pull (see landingMarkup.ts).
 */

export function initLandingVideoLazy(shell: HTMLElement): () => void {
    const videos = Array.from(
        shell.querySelectorAll<HTMLVideoElement>('video.lp-hero-video, video.lp-vsec-video'),
    );
    if (!videos.length) return () => {};

    if (typeof matchMedia !== 'undefined'
        && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // CSS hides the videos; do not fetch a single byte of them either.
        videos.forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
        return () => {};
    }

    if (typeof IntersectionObserver === 'undefined') {
        // Honest fallback (old engines, some test DOMs): behave like the apex —
        // let them all play. Correctness over thrift; this branch is vanishing.
        videos.forEach((v) => { void v.play().catch(() => { /* autoplay veto */ }); });
        return () => {};
    }

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const video = entry.target as HTMLVideoElement;
                if (entry.isIntersecting) {
                    // First intersection flips preload so the pipeline buffers
                    // ahead once the section is committed to.
                    if (video.preload === 'none') video.preload = 'auto';
                    void video.play().catch(() => { /* autoplay veto — poster/gradient stands */ });
                } else {
                    video.pause();
                }
            }
        },
        {
            // The lp-shell is the scroll container (same as ScrollReveal).
            root: shell,
            // Start fetching one quarter-viewport early so the video is moving
            // by the time the section's first pixel enters.
            rootMargin: '25% 0px 25% 0px',
            threshold: 0,
        },
    );

    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
}
