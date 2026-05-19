// @pryzm/scene-committer — global Window augmentation.
//
// SceneBoundsCache installs itself on window.__sceneBoundsCache so any
// command or builder can call window.__sceneBoundsCache?.invalidate()
// after mutating the scene graph without importing the class directly.

import type { SceneBoundsCache } from './SceneBoundsCache.js';

declare global {
  interface Window {
    __sceneBoundsCache?: SceneBoundsCache;
  }
}

export {};
