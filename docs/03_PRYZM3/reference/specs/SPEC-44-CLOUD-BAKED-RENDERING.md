# SPEC-44 — Cloud-Baked Rendering (Cycles + Mitsuba 3)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Render lead (post-acquisition per Phase 5 §4.5) |
| Phase | Phase 5 (M43–M48) |
| Sprint | S91–S92 |
| References | `12-` §4; `[strategic ADR-040]` |

---

## §1 Why this SPEC exists

No web BIM tool ships true path-traced rendering. Pascal has SSGI (real-time approximation). Lumion ($3K/seat) and Enscape ($1K/seat) own the BIM-to-render market with Windows desktop apps. PRYZM 2 ships **server-side path-traced rendering** integrated into the model + sheet pipeline. Per `[strategic ADR-040]` first engine = Cycles (Blender), with Mitsuba 3 as research second.

## §2 The contract (binding)

### §2.1 Render request

```ts
interface RenderRequest {
  projectId: string;
  view: ViewRef;                       // existing view or saved render-camera
  resolution: { w: number; h: number };
  samples: number;                     // 64 / 128 / 256 / 512 / 1024
  preset: "interior" | "exterior" | "aerial" | "dawn" | "dusk" | "night" | "custom";
  outputFormat: "png" | "jpg" | "exr"; // exr = HDR
  cropAfter?: Region;                  // post-process crop
}
```

### §2.2 Per-frame R2 cache

Frame deduplication by content hash (project state + camera + render params). Cache hit returns existing R2 URL instantly. Cache miss queues a render job in dedicated `apps/render-worker` pod (separate from `apps/bake-worker`).

### §2.3 Engine selection per `[strategic ADR-040]`

ADR-040 ratifies: **Cycles only** at Phase 5 ship. Mitsuba 3 evaluated in S91 spike; if >2× quality at <2× cost, layer in. LuxCore explicitly out of scope.

### §2.4 Preset library

Each preset is a JSON file: lighting setup, sky model, exposure, post-process LUT. Marketplace can ship custom presets at S62.

### §2.5 Sheet integration

Sheet engine (S37–S38 GA) gains a `render-cell` shape that embeds the URL of a rendered frame; auto-re-renders on view edit.

## §3 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S91 D1 | SPEC-44 lands; ADR-040 ratified; `apps/render-worker/` skeleton; Cycles in headless Node via `bpy` Docker |
| S91 D3 | first photorealistic render < 2 min on M-instance |
| S91 D5 | per-frame R2 cache; content-hash dedup |
| S91 D7 | Mitsuba 3 spike; ADR-040 confirms or amends |
| S91 D9 | bench: 1920×1080 256 samples < 2 min |
| S92 D1 | preset library (interior / exterior / aerial / dawn / dusk / night) |
| S92 D3 | batch-render queue (overnight render of 50 views) |
| S92 D5 | render-history viewer; thumbnail grid |
| S92 D7 | sheet-engine `render-cell` shape; auto-re-render on view edit |
| S92 D9 | bench: full-sheet-set render (50 views) < 2 hours overnight |

## §4 NFT targets

| Workload | Target |
|---|---|
| 1920×1080 / 256 samples / interior preset | < 2 min on M-instance |
| 3840×2160 / 512 samples / exterior preset | < 8 min on M-instance |
| Cache-hit response | < 100 ms |
| Batch-render 50 views overnight | < 2 hours |
| Concurrent render jobs per worker pod | 4 (per ADR-005 worker-pool extension) |

## §5 Anti-patterns

- Real-time render loop in browser (out of scope at Phase 5; revisit at Phase 8 after rendering-co acquisition).
- Per-pixel cache (frame-level only).
- Render queue starvation by AI batch (composes with SPEC-31 §3 back-pressure).

## §6 Cross-references

- ADR-005 worker pool (extended for render-worker pod)
- ADR-010 bake debounce
- ADR-040 engine selection
- SPEC-31 §3 AI back-pressure (render queue inherits curve)
- SPEC-41 4D MP4 export (uses render-worker)
- SPEC-58 outcome pricing (per render metering)
