import { mountAppShell } from './app/AppShell.js';
import { parseDeepLinkRequest } from './app/deepLink.js';

const root = document.getElementById('app');
if (!root) throw new Error('PRYZM Family Creator: #app root not found in index.html');

const handle = mountAppShell(root);

// Parse `?file=…` deep-link.  We only LOG the parsed request today;
// the actual `loadFamily` wiring lands when @pryzm/family-loader is
// pulled into the SPA boot path (deferred per S58 closure note).
const deepLink = parseDeepLinkRequest(window.location.search);
if (deepLink.ok) {
  handle.liveRegion.announce(`Deep-link request: ${deepLink.request.source} ${deepLink.request.target}`);
  // eslint-disable-next-line no-console -- deep-link visibility for early dogfooders.
  console.info('[component-editor] deep-link request:', deepLink.request);
} else if (deepLink.reason !== 'no-file-param') {
  console.warn('[component-editor] deep-link rejected:', deepLink.reason);
}
