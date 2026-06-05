/*
 * app-shell-boot.js — externalized App-Shell boot script.
 *
 * WHY EXTERNAL (not inline in index.html):
 *   The production CSP (server/securityHeaders.js, SCRIPT_SRC_PROD =
 *   ["'self'", "'unsafe-eval'", 'blob:']) deliberately does NOT grant
 *   'unsafe-inline'. An inline <head> <script> is therefore BLOCKED in prod
 *   ("Executing inline script violates the following Content Security Policy
 *   directive 'script-src 'self' 'unsafe-eval' blob:'"). Dev grants
 *   'unsafe-inline' so the same inline script worked on localhost — masking
 *   the regression. Externalizing to a file under public/ (copied verbatim to
 *   dist/ by Vite, served from 'self' by express.static(dist/)) makes this
 *   CSP-clean with no inline hash to maintain. C51 §2/§3 strict-CSP aligned.
 *
 * LOADING CONTRACT (index.html):
 *   Referenced as a CLASSIC, SYNCHRONOUS script in <head> BEFORE the body
 *   skeleton markup and BEFORE the <script type="module" src="/src/main.ts">:
 *       <script src="/app-shell-boot.js"></script>
 *   It must NOT be marked type="module" or defer/async — it has to run before
 *   the body skeleton paints (so data-pryzm-auth hides the skeleton with no
 *   flash for logged-in users) and before the module graph boots.
 *
 * THREE JOBS (unchanged from the former inline version):
 *   1. Set <html data-pryzm-auth="in"> if a session exists, so the landing
 *      skeleton CSS rule in index.html hides itself for logged-in users.
 *   2. Capture pre-boot CTA clicks so users who tap the skeleton's
 *      "Get started" / "Log in" buttons before LandingPage.ts has loaded get
 *      their intent replayed once the real component mounts. The real
 *      LandingPage drains window.__pryzmPendingActions.
 *   3. Opportunistic /api/media-list mosaic image swap.
 *
 * NOTE: keep this a plain ES5-compatible IIFE (no imports, no modules) so it
 * runs synchronously as a classic script with the original timing.
 */
(function () {
  try {
    if (localStorage.getItem('bim-platform-user')) {
      document.documentElement.setAttribute('data-pryzm-auth', 'in');
    }
  } catch (_) { /* localStorage may be blocked */ }
  window.__pryzmPendingActions = [];
  window.__pryzmSkeletonClick = function (action) {
    window.__pryzmPendingActions.push(action);
  };

  // ── CSP: strict `script-src-attr 'none'` forbids inline DOM event
  //    handler attributes (onclick="…").  The skeleton CTAs are wired
  //    here via addEventListener instead.  Each button carries a
  //    `data-skel-action` attribute naming the intent to queue.  Runs
  //    on DOMContentLoaded because this <head> script executes before
  //    the <body> skeleton markup is parsed.
  document.addEventListener('DOMContentLoaded', function () {
    var btns = document.querySelectorAll('[data-skel-action]');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.__pryzmSkeletonClick(btn.getAttribute('data-skel-action'));
        // IMMEDIATE FEEDBACK — the queued action only replays once LandingPage.ts
        // (the SPA bundle) finishes loading, which on a cold/dev load can take a
        // few seconds; without a cue the click felt dead/static. Show a busy state
        // so the user knows it registered. The real LandingPage takes over on mount.
        try {
          btn.setAttribute('aria-busy', 'true');
          btn.style.opacity = '0.72';
          btn.style.cursor = 'progress';
          if (btn.classList.contains('lp-skel-hero-btn')) btn.textContent = 'Loading…';
        } catch (_) { /* styling is best-effort */ }
      });
    });
  });

  // ── Wave 1.5c — opportunistic skeleton-mosaic image swap ─────────
  // The skeleton renders 3 drifting rows of soft-tinted placeholder
  // tiles using pure CSS (paints on first byte).  Here we kick off a
  // /api/media-list fetch *before* any module script has been parsed.
  // When it resolves (typically <50 ms on Replit), we swap each tile's
  // background colour for the real building photo — so the user sees
  // the actual mosaic far earlier than the ~12 s LandingPage.ts boot
  // window.  If anything fails (offline, 404, slow), the coloured
  // placeholders simply remain — there is no broken state.
  try {
    fetch('/api/media-list', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { files: [] }; })
      .then(function (data) {
        var files = (data && data.files) || [];
        var imgs = files.filter(function (f) {
          var lower = f.toLowerCase();
          return !lower.endsWith('.mp4') && !lower.endsWith('.webm') && !lower.endsWith('.mov');
        });
        if (imgs.length === 0) return;
        var rows = document.querySelectorAll('[data-skel-row]');
        rows.forEach(function (row, rowIdx) {
          var tiles = row.querySelectorAll('.lp-skel-mosaic-tile');
          tiles.forEach(function (tile, tileIdx) {
            var src = imgs[(tileIdx + rowIdx * 2) % imgs.length];
            tile.style.backgroundImage = "url('" + src + "')";
            tile.style.backgroundSize = 'cover';
            tile.style.backgroundPosition = 'center';
          });
        });
      })
      .catch(function () { /* network failure — placeholders stay */ });
  } catch (_) { /* fetch unavailable — placeholders stay */ }
})();
