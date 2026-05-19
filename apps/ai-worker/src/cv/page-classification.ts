// @pryzm/ai-worker — PDF page classification (S50 D2).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S50
//     line 252-255 ("Page classification: is this a floor plan vs
//     elevation vs section vs detail? ADR-029 Part A: only floor-
//     plan pages enter the wall-extraction stage.").
//   • `SPEC-45 §2.1` — kinds + threshold (≥ 0.7).
//   • ADR-029 Part A — page kinds catalog.
//
// At S50 the implementation is a deterministic mock: it reads the
// page's `meta.title` / `meta.drawingType` strings and matches them
// against a small keyword catalog. The mock matches the production
// surface (input → `PageClassification`), so the real Vision call
// at S52 swaps in without source changes elsewhere.

import type {
  ModelRuntime,
  PageClassification,
  PageKind,
  PdfPage,
} from './types.js';

interface KeywordRule {
  readonly kind: PageKind;
  readonly patterns: ReadonlyArray<RegExp>;
  /** Confidence emitted on a positive match. */
  readonly confidence: number;
}

// Keyword catalog. Tuned against ADR-029 Part A's 7-kind taxonomy.
// Order matters — first match wins, with `plan` ahead of `section` so
// a page titled "Floor Plan — Section A" classifies as `plan`.
const RULES: ReadonlyArray<KeywordRule> = [
  {
    kind: 'plan',
    patterns: [
      /\bfloor[\s-]?plan\b/i,
      /\bplan[\s-]?view\b/i,
      /\bfloor\s+plan\b/i,
      /\broof\s+plan\b/i,
      /\bsite\s+plan\b/i,
      /\bplan\b/i,
    ],
    confidence: 0.92,
  },
  {
    kind: 'section',
    patterns: [/\bsection\b/i, /\bcross[\s-]?section\b/i],
    confidence: 0.88,
  },
  {
    kind: 'elevation',
    patterns: [/\belevation\b/i, /\b(north|south|east|west)\s+facade\b/i],
    confidence: 0.88,
  },
  {
    kind: 'detail',
    patterns: [/\bdetail\b/i, /\bcallout\b/i, /\benlarged\s+plan\b/i],
    confidence: 0.85,
  },
  {
    kind: 'schedule',
    patterns: [/\bschedule\b/i, /\bquantity\s+takeoff\b/i, /\btakeoff\b/i],
    confidence: 0.9,
  },
  {
    kind: 'titleblock',
    patterns: [/\btitle\s*block\b/i, /\bcover\s+sheet\b/i, /\bsheet\s+index\b/i],
    confidence: 0.9,
  },
];

/** Per SPEC-45 §2.1 the routing threshold for §2.2 is 0.7. Exposed
 *  as a constant so the handler / tests share the source of truth. */
export const PLAN_ROUTING_THRESHOLD = 0.7;

/** Classify one PDF page. The runtime parameter selects the
 *  underlying model; the mock runtime uses the keyword catalog
 *  above, the real ONNX/Vision adapter consumes the page raster.
 *  Both paths share this single entrypoint. */
export async function classifyPage(
  page: PdfPage,
  runtime: ModelRuntime,
): Promise<PageClassification> {
  if (!runtime.mock) {
    // Real runtime branch — the porter's `classify` adapter runs the
    // model. The adapter is loaded inside `runtime.ts` and exposed
    // via the runtime object (S52 wiring); at S50 the mock branch
    // below is the only live path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realRuntime = runtime as any;
    if (typeof realRuntime.classify === 'function') {
      return realRuntime.classify(page) as Promise<PageClassification>;
    }
  }

  // Mock branch — deterministic keyword match against the page's
  // metadata. Returns 'other' with confidence 0.5 when nothing
  // matches so handlers can route the page to the human review queue.
  const haystack = [
    page.meta?.title ?? '',
    page.meta?.drawingType ?? '',
  ]
    .filter((s) => s.length > 0)
    .join(' | ');

  if (haystack.length === 0) {
    return {
      kind: 'other',
      confidence: 0.5,
      rationale: 'No page metadata available to mock classifier; needs Vision call (S52).',
    };
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(haystack)) {
        return {
          kind: rule.kind,
          confidence: rule.confidence,
          rationale: `Mock classifier matched /${pattern.source}/ in metadata.`,
        };
      }
    }
  }

  return {
    kind: 'other',
    confidence: 0.5,
    rationale: 'No mock keyword matched; defer to Vision call (S52).',
  };
}
