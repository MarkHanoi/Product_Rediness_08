(function () {
    'use strict';

    const _ZONE_TO_PEN = Object.freeze({
      cut: "CUT",
      projection: "PROJECTION",
      beyond: "BEYOND",
      hidden: "HIDDEN"
    });
    function penZoneOf(zone) {
      return _ZONE_TO_PEN[zone];
    }
    function drawingZoneFromLayerName(layerTag) {
      if (!layerTag) return null;
      if (/[:-]cut\b/i.test(layerTag)) return "cut";
      if (/[:-]hidden\b/i.test(layerTag)) return "hidden";
      if (/[:-]beyond\b/i.test(layerTag)) return "beyond";
      if (/[:-]proj\b/i.test(layerTag)) return "projection";
      return null;
    }
    const HIDDEN_DASH_PX = Object.freeze([4, 3]);
    Object.freeze(
      // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7950, C106 §5) — `boundary-line` JOINS the
      // datums, and it belongs here more literally than the other three: it IS a
      // construction line. An architect draws it to set a scheme out, exactly as a grid
      // or a level line is drawn, and its dash is an ISO 128-24 category convention
      // rather than a hidden-line reading.
      //
      // ⚠ THE EXEMPTION IS NARROW AND CONDITIONAL, AND THAT IS WORTH SAYING OUT LOUD. A
      // boundary line with `hasVolume: true` DOES have building fabric — a real extruded
      // solid — and that solid's own edges obey the ladder like anything else. What is
      // exempted is the CENTRELINE, which is drafting notation whether or not a solid
      // stands on it. The two are different pieces of geometry from the same record; only
      // the first is a datum.
      /* @__PURE__ */ new Set(["grid", "level", "annotation", "boundary-line"])
    );

    const FUNCTION_WEIGHT_SCALE = Object.freeze({
      exterior: 1,
      interior: 0.7
    });
    function functionWeightScale(fn) {
      return fn ? FUNCTION_WEIGHT_SCALE[fn] : 1;
    }
    const FUNCTION_MODULATED_ZONES = Object.freeze(
      /* @__PURE__ */ new Set(["CUT", "PROJECTION"])
    );
    function penWidthScale(zone, fn) {
      return FUNCTION_MODULATED_ZONES.has(zone) ? functionWeightScale(fn) : 1;
    }

    function pen(widthMm, color, dashPx = null, opacity = 1) {
      return { widthMm, color, dashPx, opacity };
    }
    const SYSTEM_PEN_TABLE = {
      // ── CUT zone — heaviest weights; elements physically sliced by the cut plane ──
      //    SOLID by construction. A cut solid is a filled region (C09 §4.6.2), never a dash.
      CUT: {
        wall: pen(0.5, "#000000"),
        slab: pen(0.5, "#000000"),
        column: pen(0.7, "#000000"),
        structural: pen(0.7, "#000000"),
        beam: pen(0.7, "#000000"),
        door: pen(0.35, "#000000"),
        window: pen(0.35, "#000000"),
        stair: pen(0.35, "#000000"),
        roof: pen(0.5, "#000000"),
        ceiling: pen(0.35, "#000000")
      },
      // ── PROJECTION zone — directly VISIBLE, not cut. SOLID, thinner than CUT. ──
      //    *** DISTANCE FROM THE VIEWER DOES NOT MAKE AN EDGE HIDDEN. *** Projection stays
      //    solid however far away it is (C09 §4.6.4 / L-277).
      PROJECTION: {
        wall: pen(0.25, "#000000"),
        slab: pen(0.25, "#000000"),
        column: pen(0.25, "#1e293b"),
        structural: pen(0.25, "#1e293b"),
        beam: pen(0.25, "#1e293b"),
        door: pen(0.18, "#1f2937"),
        window: pen(0.18, "#1f2937"),
        stair: pen(0.18, "#334155"),
        roof: pen(0.18, "#475569"),
        // L-277: dash [3,2] DELETED — overhead ≠ hidden
        ceiling: pen(0.13, "#64748b"),
        // L-277: dash [2,2] DELETED — overhead ≠ hidden
        furniture: pen(0.13, "#303030"),
        lighting: pen(0.13, "#303030"),
        plumbing: pen(0.13, "#374151"),
        grid: pen(0.13, "#0000cc", [8, 4]),
        // DATUM — ISO 128-24 chain line, not a zone dash
        annotation: pen(0.18, "#000000"),
        level: pen(0.13, "#334155", [5, 3]),
        // DATUM — ISO 128-24 chain line, not a zone dash
        // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7950) — DATUM, in PROJECTION ONLY, exactly
        // as `grid` and `level` are. A construction line has no CUT (it is not sliced by
        // the cut plane — it IS the plane's own notation), no BEYOND and no HIDDEN: a
        // setting-out line that vanished behind a wall would be useless for setting out.
        // Absent zones fall to `FALLBACK_PEN`, which is the correct and stated behaviour
        // for a category the zone does not apply to.
        //
        //
        // ═══ ⭐ BLACK, AND THAT OVERTURNS THE PURPLE THIS ROW SHIPPED WITH (L-10503) ═══
        //
        // The founder, 2026-08-24, verbatim: *"please make the boundary construction
        // line DASHED BLACK by default."* This row previously read `#6600ff` with the
        // rationale *"the same colour `BoundaryLinePlanToolHandler` previews in — so
        // what the architect aims at and what lands are the same colour rather than
        // two."*
        //
        // That argument was sound and it is still REJECTED, because it optimised the
        // wrong pair. The PREVIEW is tool chrome — drawn on the overlay canvas, alive
        // for the two seconds a gesture lasts, and PRYZM purple is what EVERY plan tool
        // previews in (`STROKE = '#6600ff'` in all of them). The COMMITTED line is
        // DRAWING, and a drawing is printed, exported to DXF and read by a contractor.
        // Matching the committed line to the transient preview made the setting-out
        // line the ONE datum on the sheet that is not a drafting colour — `grid` is
        // `#0000cc`, `level` is `#334155`, `annotation` is `#000000`. It now joins them.
        //
        // ⚠ THE DASH IS UNCHANGED AND IS NOT A ZONE DASH. `[10, 4]` is an ISO 128-24
        // category convention for a DATUM — the same exemption `grid` `[8, 4]` and
        // `level` `[5, 3]` take from C09 §4.6.4's *"dashed ONLY for true hidden edges"*,
        // which is why `DATUM_CATEGORIES` exists and why the ladder guard skips these
        // four explicitly.
        //
        // ⛔ AND THIS DOES NOT TOUCH 3-D. `BoundaryLineMeshBuilder`'s
        // `BOUNDARY_LINE_PEN_HEX` is still `#6600ff` and is DELIBERATELY left so — see
        // that constant's own header, and §L-426. The pen table governs the 2-D
        // DRAWING; the 3-D scene has its own (C09-pen-shaped) authority, and they are
        // allowed to differ because a viewport is not a sheet. Collapsing them would be
        // a second bug wearing the first one's fix as a disguise.
        "boundary-line": pen(0.13, "#000000", [10, 4])
      },
      // ── BEYOND zone — past the cut plane, DELIBERATELY still shown. ──
      //    SOLID and LIGHTER than projection. This is NOT hidden geometry (C09 §4.6.4).
      //    The stair's lower run; the storey below in a plan's view range.
      BEYOND: {
        wall: pen(0.09, "#6b7280", null, 0.55),
        slab: pen(0.09, "#6b7280", null, 0.55),
        column: pen(0.09, "#6b7280", null, 0.55),
        structural: pen(0.09, "#6b7280", null, 0.55),
        beam: pen(0.09, "#6b7280", null, 0.55),
        door: pen(0.09, "#6b7280", null, 0.55),
        window: pen(0.09, "#6b7280", null, 0.55),
        stair: pen(0.09, "#6b7280", null, 0.55),
        roof: pen(0.09, "#6b7280", null, 0.55),
        ceiling: pen(0.09, "#6b7280", null, 0.55),
        furniture: pen(0.09, "#6b7280", null, 0.55),
        lighting: pen(0.09, "#6b7280", null, 0.55),
        plumbing: pen(0.09, "#6b7280", null, 0.55)
      },
      // ── HIDDEN zone — OCCLUDED by a solid, shown with hidden-line graphics. ──
      //    THE ONLY ZONE THAT DASHES BY DEFAULT. Thin, no fill. Produced ONLY by the
      //    occlusion engine (`applyOcclusion`), NEVER by a depth/distance test.
      HIDDEN: {
        wall: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        slab: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        column: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        structural: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        beam: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        door: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        window: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        stair: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        roof: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        ceiling: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        furniture: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        lighting: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55),
        plumbing: pen(0.09, "#6b7280", [...HIDDEN_DASH_PX], 0.55)
      }
    };
    (() => {
      let min = Infinity;
      for (const byCategory of Object.values(SYSTEM_PEN_TABLE)) {
        for (const style of Object.values(byCategory ?? {})) {
          if (style && style.widthMm > 0) min = Math.min(min, style.widthMm);
        }
      }
      return Number.isFinite(min) ? min : 0.13;
    })();
    const FALLBACK_PEN = pen(0.18, "#000000");
    function resolvePen(zone, category, elementFunction) {
      const base = SYSTEM_PEN_TABLE[zone]?.[category];
      if (!base) return FALLBACK_PEN;
      const scale = penWidthScale(zone, elementFunction);
      if (scale === 1) return base;
      return { ...base, widthMm: base.widthMm * scale };
    }

    const EDGE_LENGTH_EPSILON_M = 1e-6;
    const SNAP_TOLERANCE_M = 5e-3;
    function systemResolvePen(zone, category) {
      return resolvePen(zone, category);
    }
    function workerResolveStyle(zone, category, elementId, viewId, rules) {
      const matching = rules.filter((r) => {
        if (r.zone && r.zone !== zone) return false;
        if (r.category && r.category !== category) return false;
        if (r.viewId && r.viewId !== viewId) return false;
        if (r.elementId && r.elementId !== elementId) return false;
        if (r.priority === 9e3 && !viewId) return false;
        if (r.priority === 1e4 && !elementId) return false;
        return true;
      });
      if (matching.length === 0) return systemResolvePen(zone, category);
      matching.sort((a, b) => a.priority - b.priority);
      const resolved = { ...systemResolvePen(zone, category) };
      for (const rule of matching) {
        const s = rule.style;
        if (s.widthMm !== void 0) resolved.widthMm = s.widthMm;
        if (s.color !== void 0) resolved.color = s.color;
        if (s.dashPx !== void 0) resolved.dashPx = s.dashPx ?? null;
        if (s.opacity !== void 0) resolved.opacity = s.opacity;
      }
      return resolved;
    }
    function zoneFromLayerTag(layerTag) {
      const zone = drawingZoneFromLayerName(layerTag);
      return zone === null ? "PROJECTION" : penZoneOf(zone);
    }
    const ISO_LAYER_TO_CATEGORY = {
      "A-WALL": "wall",
      "A-FLOR": "slab",
      "A-COLS": "column",
      "A-BEAM": "beam",
      "A-DOOR": "door",
      "A-GLAZ": "window",
      "A-STRS": "stair",
      "A-ROOF": "roof",
      "A-FURN": "furniture",
      "A-LGHT": "lighting",
      "A-PLMB": "plumbing",
      "A-CEIL": "ceiling",
      "A-GRID": "grid",
      "A-LEVL": "level"
    };
    function categoryFromLayerTag(layerTag) {
      const tag = layerTag.trim();
      for (const [prefix, cat] of Object.entries(ISO_LAYER_TO_CATEGORY)) {
        if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) {
          return cat;
        }
      }
      return "wall";
    }
    const ISO_POCHE_PREFIXES = ["A-WALL", "A-COLS", "A-FLOR", "A-BEAM"];
    function baseIsoLayerForPoche(layerTag) {
      const tag = layerTag.trim();
      for (const prefix of ISO_POCHE_PREFIXES) {
        if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) {
          return prefix;
        }
      }
      return null;
    }
    function stage1_geometryProvider(batches) {
      const edges = [];
      for (const batch of batches) {
        const pos = batch.positions;
        const count = pos.length;
        if (count < 4) continue;
        const zone = zoneFromLayerTag(batch.layerTag);
        const category = categoryFromLayerTag(batch.layerTag);
        for (let i = 0; i + 3 < count; i += 4) {
          const h0 = pos[i];
          const v0 = pos[i + 1];
          const h1 = pos[i + 2];
          const v1 = pos[i + 3];
          if (!Number.isFinite(h0) || !Number.isFinite(v0) || !Number.isFinite(h1) || !Number.isFinite(v1)) continue;
          const dh = h1 - h0;
          const dv = v1 - v0;
          if (dh * dh + dv * dv < EDGE_LENGTH_EPSILON_M * EDGE_LENGTH_EPSILON_M) continue;
          edges.push({ h0, v0, h1, v1, elementId: batch.elementId, layerTag: batch.layerTag, zone, category });
        }
      }
      return edges;
    }
    function stage2_classify(edges) {
      const cut = [];
      const projection = [];
      const beyond = [];
      const hidden = [];
      for (const edge of edges) {
        switch (edge.zone) {
          case "CUT":
            cut.push(edge);
            break;
          case "PROJECTION":
            projection.push(edge);
            break;
          case "BEYOND":
            beyond.push(edge);
            break;
          case "HIDDEN":
            hidden.push(edge);
            break;
        }
      }
      return { cut, projection, beyond, hidden };
    }
    function snapKey(h, v) {
      return `${Math.round(h / SNAP_TOLERANCE_M)},${Math.round(v / SNAP_TOLERANCE_M)}`;
    }
    function stitchPolygon(edges) {
      const adj = /* @__PURE__ */ new Map();
      const usedEdges = /* @__PURE__ */ new Set();
      function addAdj(k, h, v, idx) {
        let list = adj.get(k);
        if (!list) {
          list = [];
          adj.set(k, list);
        }
        list.push({ h, v, edgeIdx: idx });
      }
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const ka = snapKey(e.h0, e.v0);
        const kb = snapKey(e.h1, e.v1);
        addAdj(ka, e.h1, e.v1, i);
        addAdj(kb, e.h0, e.v0, i);
      }
      const polygons = [];
      for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (usedEdges.has(startIdx)) continue;
        const startEdge = edges[startIdx];
        const chain = [
          { h: startEdge.h0, v: startEdge.v0 },
          { h: startEdge.h1, v: startEdge.v1 }
        ];
        usedEdges.add(startIdx);
        const originKey = snapKey(startEdge.h0, startEdge.v0);
        let closed = false;
        let maxSteps = edges.length;
        while (!closed && maxSteps-- > 0) {
          const last = chain[chain.length - 1];
          const lastKey = snapKey(last.h, last.v);
          const neighbours = adj.get(lastKey);
          if (!neighbours) break;
          let extended = false;
          for (const nb of neighbours) {
            if (usedEdges.has(nb.edgeIdx)) continue;
            usedEdges.add(nb.edgeIdx);
            const nbKey = snapKey(nb.h, nb.v);
            if (nbKey === originKey && chain.length >= 3) {
              closed = true;
              break;
            }
            chain.push({ h: nb.h, v: nb.v });
            extended = true;
            break;
          }
          if (!extended) break;
        }
        if (closed && chain.length >= 3) {
          const flat = [];
          for (const pt of chain) {
            flat.push(pt.h, pt.v);
          }
          polygons.push(flat);
        }
      }
      return polygons;
    }
    function stage3_cutIntersector(classified, pocheFills) {
      const groups = /* @__PURE__ */ new Map();
      for (const edge of classified.cut) {
        const key = `${edge.elementId}::${edge.layerTag}`;
        let g = groups.get(key);
        if (!g) {
          g = { elementId: edge.elementId, layerTag: edge.layerTag, edges: [] };
          groups.set(key, g);
        }
        g.edges.push(edge);
      }
      const polygons = [];
      for (const group of groups.values()) {
        if (group.edges.length < 3) continue;
        const isoPrefix = baseIsoLayerForPoche(group.layerTag);
        if (!isoPrefix) continue;
        const fillColor = pocheFills[isoPrefix];
        if (!fillColor) continue;
        const stitched = stitchPolygon(group.edges);
        for (const verts of stitched) {
          if (verts.length < 6) continue;
          polygons.push({
            vertices: verts,
            fillColor,
            opacity: 1,
            fillPattern: "solid",
            strokeColor: fillColor,
            elementId: group.elementId
          });
        }
      }
      return polygons;
    }
    function stage4_edgeExtractor(classified) {
      return [...classified.hidden, ...classified.beyond, ...classified.projection, ...classified.cut];
    }
    function buildOccluders(cutEdges) {
      const byElement = /* @__PURE__ */ new Map();
      for (const edge of cutEdges) {
        const id = edge.elementId || edge.layerTag;
        let list = byElement.get(id);
        if (!list) {
          list = [];
          byElement.set(id, list);
        }
        list.push(edge);
      }
      const occluders = [];
      for (const edges of byElement.values()) {
        let hMin = Infinity, hMax = -Infinity;
        let vMin = Infinity, vMax = -Infinity;
        for (const e of edges) {
          hMin = Math.min(hMin, e.h0, e.h1);
          hMax = Math.max(hMax, e.h0, e.h1);
          vMin = Math.min(vMin, e.v0, e.v1);
          vMax = Math.max(vMax, e.v0, e.v1);
        }
        if (hMin < hMax && vMin < vMax) {
          occluders.push({ hMin, hMax, vMin, vMax });
        }
      }
      return occluders;
    }
    function isPointInsideOccluder(h, v, o) {
      return h >= o.hMin && h <= o.hMax && v >= o.vMin && v <= o.vMax;
    }
    function isSegmentOccludedHlr(h0, v0, h1, v1, occluders) {
      for (const o of occluders) {
        if (isPointInsideOccluder(h0, v0, o) && isPointInsideOccluder(h1, v1, o)) {
          return true;
        }
      }
      return false;
    }
    function stage5_hlr(edges, cutEdges) {
      if (cutEdges.length === 0) return edges;
      const occluders = buildOccluders(cutEdges);
      if (occluders.length === 0) return edges;
      return edges.filter((edge) => {
        if (edge.zone === "CUT" || edge.zone === "HIDDEN") return true;
        return !isSegmentOccludedHlr(edge.h0, edge.v0, edge.h1, edge.v1, occluders);
      });
    }
    function stage6_styleResolver(edges, viewId, rules) {
      return edges.map((edge) => {
        const p = workerResolveStyle(edge.zone, edge.category, edge.elementId, viewId, rules);
        return {
          h0: edge.h0,
          v0: edge.v0,
          h1: edge.h1,
          v1: edge.v1,
          color: p.color,
          widthMm: p.widthMm,
          opacity: p.opacity,
          dashPx: p.dashPx ?? null,
          zone: edge.zone,
          elementId: edge.elementId,
          layerTag: edge.layerTag
        };
      });
    }
    function runPipeline(req) {
      const t0 = performance.now();
      const tGeo = performance.now();
      const rawEdges = stage1_geometryProvider(req.batches);
      const tGeoEnd = performance.now();
      const tClassify = performance.now();
      const classified = stage2_classify(rawEdges);
      const tClassifyEnd = performance.now();
      const tIntersect = performance.now();
      const polygons = stage3_cutIntersector(classified, req.pocheFills);
      const tIntersectEnd = performance.now();
      const tExtract = performance.now();
      const extracted = stage4_edgeExtractor(classified);
      const tExtractEnd = performance.now();
      const tHlr = performance.now();
      const visible = stage5_hlr(extracted, classified.cut);
      const tHlrEnd = performance.now();
      const tStyle = performance.now();
      const styledEdges = stage6_styleResolver(visible, req.viewId, req.rules);
      const tStyleEnd = performance.now();
      const totalMs = performance.now() - t0;
      return {
        type: "result",
        requestId: req.requestId,
        edges: styledEdges,
        polygons,
        durationMs: totalMs,
        stageTimes: {
          geometry: tGeoEnd - tGeo,
          classify: tClassifyEnd - tClassify,
          intersect: tIntersectEnd - tIntersect,
          extract: tExtractEnd - tExtract,
          hlr: tHlrEnd - tHlr,
          style: tStyleEnd - tStyle
        }
      };
    }
    self.onmessage = (event) => {
      const req = event.data;
      if (req.type !== "run") {
        console.warn("[DrawingPipelineWorker] Unknown message type:", req.type);
        return;
      }
      try {
        const result = runPipeline(req);
        self.postMessage(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : void 0;
        const error = {
          type: "error",
          requestId: req.requestId,
          message: msg,
          stack
        };
        self.postMessage(error);
      }
    };

})();
