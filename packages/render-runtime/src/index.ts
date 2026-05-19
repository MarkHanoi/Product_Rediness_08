// @pryzm/render-runtime — public barrel.
//
// L5 helper module.  Owns shared selection-highlight building blocks:
// `buildEdgeOutline`, `disposeEdgeOutline`, `SelectionHighlightCommitter`,
// `HighlightProvider`, `HighlightProviderRegistry`.
//
// Element plugins import these in their bootstrap to register a
// `HighlightProvider` for their kind; the SelectionHighlightCommitter
// then draws outlines uniformly across all 12 element families
// (S16 D3 + M9 baseline).

export {
  buildEdgeOutline,
  disposeEdgeOutline,
  type HighlightOptions,
} from './highlight.js';

export {
  SelectionHighlightCommitter,
  type HighlightProvider,
  type HighlightProviderRegistry,
  type SelectionHighlightCommitterOptions,
} from './SelectionHighlightCommitter.js';
