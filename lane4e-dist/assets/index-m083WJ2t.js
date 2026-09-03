const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/AiHost.impl-Bt5JNw6e.js","assets/CfWorkerRelay-DzqGT6yO.js","assets/index-CtIMEkHY.js","assets/preload-helper-CJHylW7d.js","assets/trace-api-BIfvUk_c.js","assets/ElementStore-CQe7ZDFd.js","assets/LODManager-DHqndFcX.js","assets/SteelProfileLibrary-NgbfwhrM.js","assets/three.core-Bv4ks8y-.js","assets/three.module-zvZFyv9V.js","assets/CreatePlumbingFixtureCommand-DUwQtpaf.js","assets/VoiceCommand.impl-CVJocPvd.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from './preload-helper-CJHylW7d.js';
import { t as trace } from './trace-api-BIfvUk_c.js';
import { v as v4, n as nonImperativeReason, l as ladderGateReason, a as applySemanticIntent, f as findLevel, b as lengthToMeters, p as parseDimensionScopedIntent, c as parseDuplicateLevelIntent, d as parseCurtainWallParameterIntent, e as parseWallSideFinishIntent, r as resolveFinishRef, g as parseFloorFinishIntent, h as parseWallColorIntent, i as parseWallRakeIntent, k as parseWindowTypeIntent, m as parseDoorTypeIntent, o as parseAddWallLayerIntent, q as parseGenerateBuildingIntent, s as parseApartmentLayoutIntent, t as parseFinishChainIntent, u as parseRoomFinishIntent, w as parseWindowsParametricIntent, x as parseWallTypeIntent, y as isProtectedFunctionWord, z as boundedLevenshtein, A as isCanonicalFinishAlias, B as finishRefCandidates, C as descriptiveReportReason, D as resolveUtteranceIntent, E as resolveUtterance, F as allChatCapabilities, G as resolveChatCapability, H as windowDesiredFor, I as windowMandatoryFor, J as roomRingEdges, K as pointToSegment, L as dimensionsFor, M as rotatePt, N as scaleProgramToShell, O as principalAxisAngle, P as generateDeterministicLayouts, Q as equatorFacingDir, R as KITCHEN_ONTOLOGY, S as kitchenModule, T as STYLE_REGISTRY, U as archetypeForCeiling, V as constraintEngine, W as AIIntentType, X as aiApprovalStore, Y as boundingWallCountOrUnknown, Z as countOrUnknown, _ as sumOrUnknown, $ as renderCount, a0 as determineStoreRead } from './index-CtIMEkHY.js';
export { a1 as AIApprovalStore, a2 as AIReadModel, a3 as AIService, a4 as APARTMENT_LAYOUT_COST_USD_ESTIMATE, a5 as APARTMENT_LAYOUT_WORKFLOW_ID, a6 as APARTMENT_STATED_DEFAULT, a7 as BALCONY_COVERAGE_THRESHOLD, a8 as CEILING_ARCHETYPES, a9 as CHAT_UNAVAILABLE, aa as CLEARANCES, ab as DEFAULT_CRITIQUE_FIXTURE, ac as DEFAULT_LAYOUT_FIXTURE, ad as FACADE_PHOTO_CONFIDENCE_FLOOR, ae as FILTER_PROPERTY_NOUN, af as FILTER_SUPERLATIVE, ag as GENERIC_PARAMETER_TARGETS, ah as GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS, ai as GRAPH_QUERY_SUPPORTED_RELATIONSHIPS, aj as GROUND_ARCH_THRESHOLD, ak as GraphQueryService, al as HABITABILITY_STANDARDS, am as LAYOUT_MAX_TOKENS, an as LAYOUT_MODEL, ao as LAYOUT_SYSTEM_PROMPT, ap as LEVEL_NOUN_SRC, aq as MockAnthropicRelay, ar as PHOTO_NOT_USED_COLOUR_PREFIX, as as PROBE_ELEMENT_KINDS, at as PROFILE_CANONICAL_ARCHNESS, au as PROPERTY_QUERY_ROWS, av as PRYZM_BASELINE, aw as QUALIFIER_AXES, ax as QueryEngine, ay as RESI_APARTMENT_CONSTRAINTS, az as RESI_LAYOUT_COUNT, aA as RESI_SCORING_WEIGHTS, aB as RuleEngine, aC as SPATIAL_PREPOSITION_SRC, aD as SPATIAL_TAIL_SRC, aE as SemanticQueryEngine, aF as WallRegionExtractor, aG as aiReadModel, aH as aiService, aI as allPropertyQueryRows, aJ as ambientIntelligence, aK as analyseRoomRing, aL as analyseShell, aM as apartmentLayoutDescriptor, aN as applyActivatePlacement, aO as applyPropertyQuery, aP as asPropertyQueryIntent, aQ as authorityLabel, aR as axesFor, aS as axesSearched, aT as bandIsArched, aU as benchWorkstation, aV as breakoutBlock, aW as buildLayoutPrompt, aX as capabilitiesForElement, aY as capabilityAppliesTo, aZ as capabilityBusCommands, a_ as capabilityGapRefusal, a$ as chatUnavailableReason, b0 as classifyOfficeFloor, b1 as classifyPerimeter, b2 as collaborativeBlock, b3 as computeGroundFloor, b4 as configureAmbientIntelligence, b5 as coreFractionForRise, b6 as createApartmentLayoutImpl, b7 as createApartmentLayoutRegistration, b8 as createStoreShellReader, b9 as deriveCoreSizing, ba as describeCapabilitiesFor, bb as describeConfidence, bc as describeFilter, bd as describeFilters, be as describePhotoBrief, bf as describeRoomRow, bg as estimateOccupancy, bh as executiveOffice, bi as extractFacadeOpeningProgram, bj as filterRefusalCopy, bk as formatAutoLabelName, bl as formatFilterValue, bm as generateLayoutOptions, bn as generateOfficeFloorPlate, bo as generateProceduralLayout, bp as isAutoDefaultRoomName, bq as isScopeError, br as itemsBBox, bs as joinTailPhrase, bt as kitchenBlock, bu as linearWorkstation, bv as loadRelay, bw as mapFacadeIRToPhotoBrief, bx as mapStoreyToBand, by as matchPropertyQuery, bz as matchRoomsByNumber, bA as maxFeasibleStoriesForRadius, bB as meetingRoomBlock, bC as moduleDeskCount, bD as moduleDesks, bE as nearestProfileByArchness, bF as nextAutoLabelIndex, bG as normalizeElementKind, bH as orchestrateOfficeBuilding, bI as orchestrateResidentialBuilding, bJ as packApartments, bK as parseFilterClauses, bL as parseLayoutOption, bM as parseLayoutOptions, bN as parsePlacementRef, bO as parseTrailingSpatialScope, bP as partitionLevelPlate, bQ as phoneBooth, bR as planFacadeOpenings, bS as planFloorFurnish, bT as planModuleMix, bU as polygonAreaM2, bV as probeQualifierAxes, bW as propertyQueryRow, bX as provenanceSentence, bY as queryableKinds, bZ as readSpatialTail, b_ as recomputeImpact, b$ as registerApartmentLayoutWorkflow, c0 as resolveOpeningProfileFromArchness, c1 as resolveRoomMinimum, c2 as resolveSingleRoomRef, c3 as riseZoneLabel, c4 as roomMinima, c5 as runApartmentCellLayout, c6 as scoreLayout, c7 as semanticQueryEngine, c8 as shellFromCell, c9 as singleWorkstation, ca as stripTrailingLevelNoun, cb as unconnectedTopicCommands, cc as unconnectedTopicLabels, cd as unmatchedQualifierTail, ce as validateFurnish, cf as validateLayout, cg as voiceSpatialInterface, ch as wallsToPolygon, ci as withChatDispatchSpan } from './index-CtIMEkHY.js';
import { C as CreatePlumbingFixtureCommand, a as CreateFurnitureCommand } from './CreatePlumbingFixtureCommand-DUwQtpaf.js';
export { h as hostIdOf, i as isHostDerivedKind, r as resolveLevelScopeByHost, b as resolveOrientationScopeByHost } from './CreatePlumbingFixtureCommand-DUwQtpaf.js';
export { D as DEFAULT_RELAY_ENDPOINT, c as createCfWorkerRelay, a as createResilientRelay, m as modelClassOf } from './CfWorkerRelay-DzqGT6yO.js';
import { i as intersectSegments2D, p as polygonSignedAreaOrdinates, C as COINCIDENT_M, E as EPSILON_ZERO } from './SteelProfileLibrary-NgbfwhrM.js';
import { C as CommandType, aB as resolveFloorSeatingDatum, aC as pointInPolygonXY, ae as pointInPolygonXZ, aD as CreateWallCommand, aE as CreateSlabCommand, l as CreateWallOpeningCommand, s as semanticGraphManager, i as elementRegistry, ah as decisionRecordStore, aF as STAIR_CONSTRAINTS } from './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import { V as Vector3 } from './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

const DEFAULT_CORNER_THRESHOLD_M = 0.1;
const DEFAULT_T_JUNCTION_THRESHOLD_M = 0.25;
const MIN_JUNCTION_ANGLE_DEG = 20;
const T_INTERIOR_MARGIN = 0.05;
const NODE_GRID_MM = 20;
function closestOnSegmentXZ(point, segStart, segEnd) {
  const dx = segEnd.x - segStart.x;
  const dz = segEnd.z - segStart.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) {
    const ex2 = point.x - segStart.x;
    const ez2 = point.z - segStart.z;
    return { t: 0, closest: segStart.clone(), distanceSq: ex2 * ex2 + ez2 * ez2 };
  }
  const t = Math.max(0, Math.min(
    1,
    ((point.x - segStart.x) * dx + (point.z - segStart.z) * dz) / len2
  ));
  const cx = segStart.x + t * dx;
  const cz = segStart.z + t * dz;
  const ex = point.x - cx;
  const ez = point.z - cz;
  return { t, closest: new Vector3(cx, 0, cz), distanceSq: ex * ex + ez * ez };
}
function wallAngleDeg(aStart, aEnd, bStart, bEnd) {
  const ax = aEnd.x - aStart.x;
  const az = aEnd.z - aStart.z;
  const bx = bEnd.x - bStart.x;
  const bz = bEnd.z - bStart.z;
  const aLen = Math.sqrt(ax * ax + az * az);
  const bLen = Math.sqrt(bx * bx + bz * bz);
  if (aLen < 1e-8 || bLen < 1e-8) return 90;
  const dot = ax / aLen * (bx / bLen) + az / aLen * (bz / bLen);
  return Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
}
function segSegIntersectXZ(aStart, aEnd, bStart, bEnd) {
  const hit = intersectSegments2D(
    aStart.x,
    aStart.z,
    aEnd.x,
    aEnd.z,
    bStart.x,
    bStart.z,
    bEnd.x,
    bEnd.z
  );
  if (!hit) return null;
  return { tA: hit.t, tB: hit.u, point: new Vector3(hit.x, 0, hit.y) };
}
function nodeId(x, z) {
  const qx = Math.round(x * 1e3 / NODE_GRID_MM);
  const qz = Math.round(z * 1e3 / NODE_GRID_MM);
  return `n_${qx}_${qz}`;
}
function resolveWallJunctions(walls, cornerThreshold = DEFAULT_CORNER_THRESHOLD_M, tJunctionThreshold = DEFAULT_T_JUNCTION_THRESHOLD_M) {
  let tSnaps = 0;
  let cornerSnaps = 0;
  for (let i = 0; i < walls.length; i++) {
    for (const key of ["start", "end"]) {
      const ep = walls[i][key];
      const threshSq2 = tJunctionThreshold * tJunctionThreshold;
      let bestDistSq = threshSq2;
      let bestClosest = null;
      for (let j = 0; j < walls.length; j++) {
        if (j === i) continue;
        const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j].start, walls[j].end);
        if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
          bestDistSq = distanceSq;
          bestClosest = closest;
        }
      }
      if (bestClosest) {
        ep.copy(bestClosest);
        tSnaps++;
      }
    }
  }
  const eps = [];
  for (let i = 0; i < walls.length; i++) {
    eps.push({ vec: walls[i].start, wallIdx: i });
    eps.push({ vec: walls[i].end, wallIdx: i });
  }
  const threshSq = cornerThreshold * cornerThreshold;
  for (let i = 0; i < eps.length; i++) {
    for (let j = i + 1; j < eps.length; j++) {
      const a = eps[i];
      const b = eps[j];
      if (a.wallIdx === b.wallIdx) continue;
      const dx = a.vec.x - b.vec.x;
      const dz = a.vec.z - b.vec.z;
      if (dx * dx + dz * dz >= threshSq) continue;
      const angle = wallAngleDeg(
        walls[a.wallIdx].start,
        walls[a.wallIdx].end,
        walls[b.wallIdx].start,
        walls[b.wallIdx].end
      );
      if (angle < MIN_JUNCTION_ANGLE_DEG) continue;
      const midX = (a.vec.x + b.vec.x) / 2;
      const midZ = (a.vec.z + b.vec.z) / 2;
      a.vec.set(midX, 0, midZ);
      b.vec.set(midX, 0, midZ);
      cornerSnaps++;
    }
  }
  const extendedThreshSq = tJunctionThreshold * 2 * (tJunctionThreshold * 2);
  const connectedThreshSq = tJunctionThreshold * tJunctionThreshold;
  for (let i = 0; i < walls.length; i++) {
    for (const key of ["start", "end"]) {
      const ep = walls[i][key];
      let alreadyConnected = false;
      for (let k = 0; k < walls.length; k++) {
        if (k === i) continue;
        for (const pt of [walls[k].start, walls[k].end]) {
          const ddx = ep.x - pt.x;
          const ddz = ep.z - pt.z;
          if (ddx * ddx + ddz * ddz < connectedThreshSq) {
            alreadyConnected = true;
            break;
          }
        }
        if (alreadyConnected) break;
      }
      if (alreadyConnected) continue;
      let bestDistSq = extendedThreshSq;
      let bestClosest = null;
      for (let j = 0; j < walls.length; j++) {
        if (j === i) continue;
        const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j].start, walls[j].end);
        if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
          bestDistSq = distanceSq;
          bestClosest = closest;
        }
      }
      if (bestClosest) {
        ep.copy(bestClosest);
        tSnaps++;
      }
    }
  }
  return { tSnaps, cornerSnaps };
}
function splitWallsAtCrossings(walls) {
  const splitPoints = /* @__PURE__ */ new Map();
  let splitCount = 0;
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const ix = segSegIntersectXZ(walls[i].start, walls[i].end, walls[j].start, walls[j].end);
      if (!ix) continue;
      if (ix.tA > T_INTERIOR_MARGIN && ix.tA < 1 - T_INTERIOR_MARGIN && ix.tB > T_INTERIOR_MARGIN && ix.tB < 1 - T_INTERIOR_MARGIN) {
        if (!splitPoints.has(i)) splitPoints.set(i, []);
        if (!splitPoints.has(j)) splitPoints.set(j, []);
        splitPoints.get(i).push({ t: ix.tA, point: ix.point.clone() });
        splitPoints.get(j).push({ t: ix.tB, point: ix.point.clone() });
        splitCount++;
      }
    }
  }
  if (splitCount === 0) {
    return { result: walls.map((w, i) => ({ start: w.start, end: w.end, parentIdx: i })), splitCount: 0 };
  }
  const result = [];
  for (let i = 0; i < walls.length; i++) {
    const points = splitPoints.get(i);
    if (!points || points.length === 0) {
      result.push({ start: walls[i].start.clone(), end: walls[i].end.clone(), parentIdx: i });
      continue;
    }
    points.sort((a, b) => a.t - b.t);
    let prev = walls[i].start.clone();
    for (const sp of points) {
      result.push({ start: prev, end: sp.point.clone(), parentIdx: i });
      prev = sp.point.clone();
    }
    result.push({ start: prev, end: walls[i].end.clone(), parentIdx: i });
  }
  return { result, splitCount };
}
function buildWallGraph(walls) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  function getOrCreate(x, z) {
    const id = nodeId(x, z);
    if (!nodes.has(id)) nodes.set(id, { id, position: { x, z }, connectedWallIds: [] });
    return id;
  }
  for (const wall of walls) {
    const snId = getOrCreate(wall.start.x, wall.start.z);
    const enId = getOrCreate(wall.end.x, wall.end.z);
    if (snId === enId) continue;
    nodes.get(snId).connectedWallIds.push(wall.wallUUID);
    nodes.get(enId).connectedWallIds.push(wall.wallUUID);
    edges.set(v4(), { startNodeId: snId, endNodeId: enId, wallId: wall.wallUUID });
  }
  return { nodes, edges };
}

const PLANAR_FACE_MAX_ITER_MULTIPLIER = 4;
const PLANAR_FACE_MAX_ITER_SLACK = 16;
function byCodepoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function planarRingSignedAreaXZ(nodeIds, positions) {
  const pts = [];
  for (const id of nodeIds) {
    const p = positions.get(id);
    if (p) pts.push(p);
  }
  return polygonSignedAreaOrdinates(pts.length, (i) => pts[i].x, (i) => pts[i].z);
}
function tracePlanarFacesXZ(graph, options = {}) {
  const minAbsFaceAreaM2 = options.minAbsFaceAreaM2 ?? 0;
  const minRingNodes = options.minRingNodes ?? 3;
  const { positions } = graph;
  const usable = graph.edges.filter(
    (e) => e.startNodeId !== e.endNodeId && positions.has(e.startNodeId) && positions.has(e.endNodeId)
  );
  if (usable.length === 0) return [];
  const seedEdges = [...usable].sort(
    (a, b) => byCodepoint(a.id, b.id) || byCodepoint(a.startNodeId, b.startNodeId) || byCodepoint(a.endNodeId, b.endNodeId)
  );
  const adj = /* @__PURE__ */ new Map();
  const halfEdgeId = /* @__PURE__ */ new Map();
  const link = (from, to, edgeId) => {
    let list = adj.get(from);
    if (!list) {
      list = [];
      adj.set(from, list);
    }
    list.push({ neighborId: to, edgeId });
  };
  for (const e of seedEdges) {
    const { id, startNodeId: s, endNodeId: t } = e;
    link(s, t, id);
    link(t, s, id);
    if (!halfEdgeId.has(`${s}→${t}`)) halfEdgeId.set(`${s}→${t}`, id);
    if (!halfEdgeId.has(`${t}→${s}`)) halfEdgeId.set(`${t}→${s}`, id);
  }
  const adjSorted = /* @__PURE__ */ new Map();
  for (const [nodeId, neighbours] of adj) {
    const v = positions.get(nodeId);
    const sorted = [...neighbours].sort((a, b) => {
      const ap = positions.get(a.neighborId);
      const bp = positions.get(b.neighborId);
      const aA = Math.atan2(ap.z - v.z, ap.x - v.x);
      const bA = Math.atan2(bp.z - v.z, bp.x - v.x);
      if (aA !== bA) return aA - bA;
      return byCodepoint(a.neighborId, b.neighborId) || byCodepoint(a.edgeId, b.edgeId);
    });
    adjSorted.set(nodeId, sorted);
  }
  function nextHalfEdge(uId, vId) {
    const neighbours = adjSorted.get(vId) ?? [];
    const n = neighbours.length;
    if (n === 0) return null;
    if (n === 1) {
      const only = neighbours[0];
      return only.neighborId === uId ? { nextU: vId, nextV: uId } : null;
    }
    const uIdx = neighbours.findIndex((nb) => nb.neighborId === uId);
    if (uIdx === -1) {
      const fb = neighbours.find((nb) => nb.neighborId !== uId);
      return fb ? { nextU: vId, nextV: fb.neighborId } : null;
    }
    const chosen = neighbours[(uIdx - 1 + n) % n];
    return { nextU: vId, nextV: chosen.neighborId };
  }
  const visited = /* @__PURE__ */ new Set();
  const maxIter = seedEdges.length * PLANAR_FACE_MAX_ITER_MULTIPLIER + PLANAR_FACE_MAX_ITER_SLACK;
  const faces = [];
  for (const e of seedEdges) {
    const directions = [
      [e.startNodeId, e.endNodeId],
      [e.endNodeId, e.startNodeId]
    ];
    for (const [sId, tId] of directions) {
      if (visited.has(`${sId}→${tId}`)) continue;
      const nodeIds = [];
      const edgeIds = [];
      let curU = sId;
      let curV = tId;
      let iter = 0;
      while (iter < maxIter) {
        const key = `${curU}→${curV}`;
        if (visited.has(key)) break;
        visited.add(key);
        nodeIds.push(curU);
        edgeIds.push(halfEdgeId.get(key) ?? "");
        const next = nextHalfEdge(curU, curV);
        if (!next) break;
        curU = next.nextU;
        curV = next.nextV;
        iter++;
      }
      if (nodeIds.length < minRingNodes) continue;
      const signedAreaM2 = planarRingSignedAreaXZ(nodeIds, positions);
      if (Math.abs(signedAreaM2) < minAbsFaceAreaM2) continue;
      faces.push({ nodeIds, edgeIds, signedAreaM2 });
    }
  }
  return faces;
}
function smallestNodeId(face) {
  let best = null;
  for (const id of face.nodeIds) if (best === null || id < best) best = id;
  return best ?? "";
}
function beatsAsOuter(candidate, incumbent) {
  if (candidate.signedAreaM2 !== incumbent.signedAreaM2) {
    return candidate.signedAreaM2 < incumbent.signedAreaM2;
  }
  return smallestNodeId(candidate) < smallestNodeId(incumbent);
}
function selectOuterFaceXZ(faces) {
  let best = null;
  for (const f of faces) {
    if (best === null || beatsAsOuter(f, best)) best = f;
  }
  return best;
}

const MIN_ROOM_AREA_M2$1 = 0.5;
const MIN_FACE_AREA_M2 = 0.1;
const EXTERIOR_HALF_THICKNESS = 0.1;
const MAX_OPENING_WALL_DIST_M = 0.2;
function centroidXZ(nodeIds, positions) {
  let sx = 0;
  let sz = 0;
  let count = 0;
  for (const id of nodeIds) {
    const p = positions.get(id);
    if (!p) continue;
    sx += p.x;
    sz += p.z;
    count++;
  }
  return count > 0 ? { x: sx / count, z: sz / count } : { x: 0, z: 0 };
}
function expandPolygonFromCentroid(polygon, amount) {
  if (polygon.length === 0) return [];
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
  return polygon.map((p) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-8) return { ...p };
    return { x: p.x + dx / len * amount, z: p.z + dz / len * amount };
  });
}
function pointToSegDistXZ(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) {
    const ex2 = px - ax;
    const ez2 = pz - az;
    return Math.sqrt(ex2 * ex2 + ez2 * ez2);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ex = px - cx;
  const ez = pz - cz;
  return Math.sqrt(ex * ex + ez * ez);
}
function computeTopology(wallGraph) {
  const empty = { rooms: [], outerFacePolygon: null, hasValidTopology: false };
  if (wallGraph.nodes.size === 0 || wallGraph.edges.size === 0) return empty;
  const positions = new Map(
    [...wallGraph.nodes.entries()].map(([id, node]) => [id, node.position])
  );
  const edges = [...wallGraph.edges.values()].map((edge) => ({
    id: edge.wallId,
    startNodeId: edge.startNodeId,
    endNodeId: edge.endNodeId
  }));
  const rawFaces = tracePlanarFacesXZ({ positions, edges }, { minAbsFaceAreaM2: MIN_FACE_AREA_M2 });
  if (rawFaces.length === 0) return { ...empty };
  const outerFace = selectOuterFaceXZ(rawFaces);
  const roomFaces = rawFaces.filter((f) => f !== outerFace && f.signedAreaM2 > MIN_ROOM_AREA_M2$1);
  const rooms = roomFaces.map((face, idx) => {
    const uniqueWalls = [...new Set(face.edgeIds.filter(Boolean))];
    const centroid = centroidXZ(face.nodeIds, positions);
    const rawVerts = face.nodeIds.map((id) => positions.get(id)).filter(Boolean);
    const polygonVertices = [];
    for (const v of rawVerts) {
      const prev = polygonVertices.at(-1);
      if (!prev || Math.abs(v.x - prev.x) > 1e-4 || Math.abs(v.z - prev.z) > 1e-4) polygonVertices.push({ x: v.x, z: v.z });
    }
    return { id: `room_${idx}_${Date.now()}`, boundaryWallIds: uniqueWalls, areaM2: Math.abs(face.signedAreaM2), centroid, polygonVertices };
  });
  let outerFacePolygon = null;
  if (outerFace && outerFace.nodeIds.length >= 3) {
    const rawPolygon = outerFace.nodeIds.map((id) => positions.get(id)).filter(Boolean);
    const deduped = [];
    for (const p of rawPolygon) {
      const prev = deduped.at(-1);
      if (!prev || Math.abs(p.x - prev.x) > 1e-4 || Math.abs(p.z - prev.z) > 1e-4) deduped.push({ x: p.x, z: p.z });
    }
    if (deduped.length >= 3) outerFacePolygon = expandPolygonFromCentroid(deduped, EXTERIOR_HALF_THICKNESS);
  }
  return { rooms, outerFacePolygon, hasValidTopology: rawFaces.length > 0 };
}
function assignOpeningsToWalls(openings, wallGraph, maxDistanceM = MAX_OPENING_WALL_DIST_M) {
  const result = /* @__PURE__ */ new Map();
  if (openings.length === 0 || wallGraph.edges.size === 0) return result;
  for (const opening of openings) {
    const { x: ox, z: oz } = opening.centre;
    let bestDist = maxDistanceM;
    let bestWallId = null;
    for (const [, edge] of wallGraph.edges) {
      const sNode = wallGraph.nodes.get(edge.startNodeId);
      const eNode = wallGraph.nodes.get(edge.endNodeId);
      if (!sNode || !eNode) continue;
      const dist = pointToSegDistXZ(ox, oz, sNode.position.x, sNode.position.z, eNode.position.x, eNode.position.z);
      if (dist < bestDist) {
        bestDist = dist;
        bestWallId = edge.wallId;
      }
    }
    if (bestWallId) result.set(opening.id, bestWallId);
  }
  return result;
}

function isValidShapeType(s) {
  return ["box", "cylinder", "sphere", "cone", "torus"].includes(s);
}
function isValidParamType(s) {
  return ["number", "boolean", "color"].includes(s);
}
function isValidHexColor(s) {
  return /^#[0-9a-fA-F]{3,8}$/.test(s);
}

class AIElementValidator {
  /** Full validation pass — runs all rules. */
  static validate(config) {
    const errors = [];
    if (typeof config !== "object" || config === null) {
      return { ok: false, errors: [{ field: "root", message: "Config must be a non-null object" }] };
    }
    const c = config;
    if (c["version"] !== "1.0") {
      errors.push({ field: "version", message: `Expected "1.0", got "${c["version"]}"` });
    }
    if (typeof c["elementType"] !== "string" || c["elementType"].trim() === "") {
      errors.push({ field: "elementType", message: "Must be a non-empty string" });
    }
    if (typeof c["displayName"] !== "string" || c["displayName"].trim() === "") {
      errors.push({ field: "displayName", message: "Must be a non-empty string" });
    }
    errors.push(...AIElementValidator.validateBoundingBox(c["boundingBox"]));
    if (c["baseOffset"] !== void 0 && typeof c["baseOffset"] !== "number") {
      errors.push({ field: "baseOffset", message: "Must be a number when present" });
    }
    if (!Array.isArray(c["components"]) || c["components"].length === 0) {
      errors.push({ field: "components", message: "Must be a non-empty array" });
    } else {
      c["components"].forEach((comp, idx) => {
        errors.push(...AIElementValidator.validateComponent(comp, `components[${idx}]`));
      });
    }
    if (c["parameters"] !== void 0) {
      if (!Array.isArray(c["parameters"])) {
        errors.push({ field: "parameters", message: "Must be an array when present" });
      } else {
        c["parameters"].forEach((param, idx) => {
          errors.push(...AIElementValidator.validateParameter(param, `parameters[${idx}]`));
        });
      }
    }
    errors.push(...AIElementValidator.validateMetadata(c["metadata"]));
    return { ok: errors.length === 0, errors };
  }
  // ── Private validators ────────────────────────────────────────────────────
  static validateBoundingBox(bb) {
    const errors = [];
    if (typeof bb !== "object" || bb === null) {
      return [{ field: "boundingBox", message: "Must be an object with w, h, d" }];
    }
    const b = bb;
    ["w", "h", "d"].forEach((axis) => {
      if (typeof b[axis] !== "number" || b[axis] <= 0) {
        errors.push({ field: `boundingBox.${axis}`, message: "Must be a positive number" });
      }
    });
    return errors;
  }
  static validateComponent(comp, path) {
    const errors = [];
    if (typeof comp !== "object" || comp === null) {
      return [{ field: path, message: "Component must be an object" }];
    }
    const c = comp;
    if (typeof c["id"] !== "string" || c["id"].trim() === "") {
      errors.push({ field: `${path}.id`, message: "Must be a non-empty string" });
    }
    const shape = c["shape"];
    if (!isValidShapeType(shape)) {
      errors.push({
        field: `${path}.shape`,
        message: `Invalid shape "${shape}". Must be one of: box, cylinder, sphere, cone, torus`
      });
    } else {
      errors.push(...AIElementValidator.validateDimensions(c["dimensions"], shape, `${path}.dimensions`));
    }
    errors.push(...AIElementValidator.validateVec3(c["position"], `${path}.position`));
    if (c["rotation"] !== void 0) {
      errors.push(...AIElementValidator.validateVec3(c["rotation"], `${path}.rotation`));
    }
    errors.push(...AIElementValidator.validateMaterial(c["material"], `${path}.material`));
    return errors;
  }
  static validateVec3(v, path) {
    const errors = [];
    if (typeof v !== "object" || v === null) {
      return [{ field: path, message: "Must be an object with x, y, z" }];
    }
    const o = v;
    ["x", "y", "z"].forEach((ax) => {
      if (typeof o[ax] !== "number") {
        errors.push({ field: `${path}.${ax}`, message: "Must be a number" });
      }
    });
    return errors;
  }
  static validateDimensions(dims, shape, path) {
    const errors = [];
    if (typeof dims !== "object" || dims === null) {
      return [{ field: path, message: "Must be an object" }];
    }
    const d = dims;
    const requirePos = (field) => {
      if (typeof d[field] !== "number" || d[field] <= 0) {
        errors.push({ field: `${path}.${field}`, message: `Required positive number for shape "${shape}"` });
      }
    };
    switch (shape) {
      case "box":
        requirePos("width");
        requirePos("height");
        requirePos("depth");
        break;
      case "cylinder":
        requirePos("radiusBottom");
        requirePos("height");
        break;
      case "sphere":
        requirePos("radius");
        break;
      case "cone":
        requirePos("radiusBottom");
        requirePos("height");
        break;
      case "torus":
        requirePos("radius");
        requirePos("tube");
        break;
    }
    return errors;
  }
  static validateMaterial(mat, path) {
    const errors = [];
    if (typeof mat !== "object" || mat === null) {
      return [{ field: path, message: "Must be an object" }];
    }
    const m = mat;
    if (typeof m["color"] !== "string" || !isValidHexColor(m["color"])) {
      errors.push({ field: `${path}.color`, message: `Must be a valid hex color, got "${m["color"]}"` });
    }
    ["metalness", "roughness"].forEach((field) => {
      const v = m[field];
      if (typeof v !== "number" || v < 0 || v > 1) {
        errors.push({ field: `${path}.${field}`, message: "Must be 0–1" });
      }
    });
    if (m["transparent"] !== void 0 && typeof m["transparent"] !== "boolean") {
      errors.push({ field: `${path}.transparent`, message: "Must be boolean" });
    }
    if (m["opacity"] !== void 0) {
      const op = m["opacity"];
      if (typeof op !== "number" || op < 0 || op > 1) {
        errors.push({ field: `${path}.opacity`, message: "Must be 0–1" });
      }
    }
    return errors;
  }
  static validateParameter(param, path) {
    const errors = [];
    if (typeof param !== "object" || param === null) {
      return [{ field: path, message: "Must be an object" }];
    }
    const p = param;
    if (typeof p["id"] !== "string" || p["id"].trim() === "") {
      errors.push({ field: `${path}.id`, message: "Must be a non-empty string" });
    }
    if (typeof p["label"] !== "string" || p["label"].trim() === "") {
      errors.push({ field: `${path}.label`, message: "Must be a non-empty string" });
    }
    if (typeof p["target"] !== "string" || !p["target"].includes(".")) {
      errors.push({ field: `${path}.target`, message: 'Must be dot-path like "pole.dimensions.height"' });
    }
    if (!isValidParamType(p["type"])) {
      errors.push({ field: `${path}.type`, message: `Must be: number | boolean | color` });
    }
    if (p["default"] === void 0) {
      errors.push({ field: `${path}.default`, message: "Required" });
    }
    return errors;
  }
  static validateMetadata(meta) {
    if (typeof meta !== "object" || meta === null) {
      return [{ field: "metadata", message: "Must be an object" }];
    }
    const m = meta;
    if (typeof m["generatedAt"] !== "string" || m["generatedAt"].trim() === "") {
      return [{ field: "metadata.generatedAt", message: "Must be a non-empty ISO 8601 string" }];
    }
    return [];
  }
}

class CreateAIElementCommand {
  constructor(payload) {
    this.payload = payload;
    this.id = `cmd-ai-element-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }
  payload;
  affectedStores = ["furniture", "level"];
  id;
  type = CommandType.CREATE_FURNITURE;
  timestamp;
  targetIds;
  canExecute(context) {
    if (!this.payload.levelId) {
      return { ok: false, reason: "CreateAIElementCommand: Missing levelId" };
    }
    const level = context.bimManager.getLevelById(this.payload.levelId);
    if (!level) {
      return {
        ok: false,
        reason: `CreateAIElementCommand: Level "${this.payload.levelId}" not found in BimManager`
      };
    }
    if (!this.payload.aiElementConfig) {
      return { ok: false, reason: "CreateAIElementCommand: aiElementConfig is required" };
    }
    const validation = AIElementValidator.validate(this.payload.aiElementConfig);
    if (!validation.ok) {
      const summary = validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      return { ok: false, reason: `CreateAIElementCommand: Invalid config — ${summary}` };
    }
    return { ok: true };
  }
  execute(context) {
    const level = context.bimManager.getLevelById(this.payload.levelId);
    if (!level) {
      throw new Error(`CreateAIElementCommand: Level "${this.payload.levelId}" not found`);
    }
    context.bimManager.registerElement(this.payload.id, this.payload.levelId);
    const config = this.payload.aiElementConfig;
    const seat = resolveFloorSeatingDatum(
      context,
      this.payload.levelId,
      { x: this.payload.position.x, z: this.payload.position.z }
    );
    const data = {
      id: this.payload.id,
      type: "furniture",
      furnitureType: "ai_element",
      position: {
        x: this.payload.position.x,
        y: seat.y + this.payload.baseOffset,
        z: this.payload.position.z
      },
      rotation: {
        x: this.payload.rotation.x,
        y: this.payload.rotation.y,
        z: this.payload.rotation.z
      },
      levelId: this.payload.levelId,
      levelName: level.name,
      levelElevation: level.elevation,
      baseOffset: this.payload.baseOffset,
      // Mirror bounding box into generic dimensions for Inspector / schedules
      width: config.boundingBox.w,
      length: config.boundingBox.d,
      height: config.boundingBox.h,
      material: this.payload.material,
      color: this.payload.color,
      properties: {},
      // Pure JSON — structuredClone-safe, undo-safe
      aiElementConfig: structuredClone(config)
    };
    const store = context.stores.furnitureStore;
    if (!store) throw new Error("CreateAIElementCommand: furnitureStore not in context");
    store.add(data);
    return { success: true, affectedElementIds: [this.payload.id] };
  }
  undo(context) {
    context.bimManager.unregisterElement(this.payload.id);
    const store = context.stores.furnitureStore;
    if (store) store.remove(this.payload.id);
    return { success: true, affectedElementIds: [this.payload.id] };
  }
  serialize() {
    return {
      type: this.type,
      payload: {
        id: this.payload.id,
        levelId: this.payload.levelId,
        baseOffset: this.payload.baseOffset,
        position: { ...this.payload.position },
        rotation: { ...this.payload.rotation },
        material: this.payload.material,
        color: this.payload.color,
        aiElementConfig: structuredClone(this.payload.aiElementConfig)
      },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

const AUTH_TOKEN_KEY = "bim-platform-token";
function getStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}
function apiFetch(input, init = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

var Feature = /* @__PURE__ */ ((Feature2) => {
  Feature2["IFC_EXPORT"] = "IFC_EXPORT";
  Feature2["GLB_EXPORT"] = "GLB_EXPORT";
  Feature2["AI_DESIGN_ADVISOR"] = "AI_DESIGN_ADVISOR";
  Feature2["AI_FLOOR_PLAN"] = "AI_FLOOR_PLAN";
  Feature2["AI_ELEMENT_CREATOR"] = "AI_ELEMENT_CREATOR";
  Feature2["AI_WARDROBE"] = "AI_WARDROBE";
  Feature2["CESIUM_GIS"] = "CESIUM_GIS";
  Feature2["COLLABORATION"] = "COLLABORATION";
  Feature2["VERSION_HISTORY"] = "VERSION_HISTORY";
  Feature2["UNLIMITED_PROJECTS"] = "UNLIMITED_PROJECTS";
  Feature2["PDF_EXPORT"] = "PDF_EXPORT";
  Feature2["ADDITIONAL_SEATS"] = "ADDITIONAL_SEATS";
  Feature2["API_ACCESS"] = "API_ACCESS";
  Feature2["SSO"] = "SSO";
  Feature2["AI_ACTIONS"] = "AI_ACTIONS";
  return Feature2;
})(Feature || {});
const PLAN_LIMITS = {
  owner: {
    maxProjects: -1,
    aiActionsPerMonth: -1,
    maxVersionsPerProject: -1,
    maxSeats: -1,
    hasIFCExport: true,
    hasGLBExport: true,
    hasCesium: true,
    hasCollaboration: true,
    hasVersionHistory: true,
    hasAllAITools: true,
    hasPDFExport: true,
    hasAPIAccess: true,
    hasSSO: true
  },
  free: {
    maxProjects: 3,
    aiActionsPerMonth: 5,
    maxVersionsPerProject: 1,
    maxSeats: 1,
    hasIFCExport: false,
    hasGLBExport: false,
    hasCesium: false,
    hasCollaboration: false,
    hasVersionHistory: true,
    hasAllAITools: false,
    hasPDFExport: false,
    hasAPIAccess: false,
    hasSSO: false
  },
  architect: {
    maxProjects: -1,
    aiActionsPerMonth: 50,
    maxVersionsPerProject: 15,
    maxSeats: 1,
    hasIFCExport: true,
    hasGLBExport: true,
    hasCesium: true,
    hasCollaboration: false,
    hasVersionHistory: true,
    hasAllAITools: true,
    hasPDFExport: true,
    hasAPIAccess: false,
    hasSSO: false
  },
  studio: {
    maxProjects: -1,
    aiActionsPerMonth: 200,
    maxVersionsPerProject: -1,
    maxSeats: 8,
    hasIFCExport: true,
    hasGLBExport: true,
    hasCesium: true,
    hasCollaboration: true,
    hasVersionHistory: true,
    hasAllAITools: true,
    hasPDFExport: true,
    hasAPIAccess: false,
    hasSSO: false
  },
  firm: {
    maxProjects: -1,
    aiActionsPerMonth: 500,
    maxVersionsPerProject: -1,
    maxSeats: 25,
    hasIFCExport: true,
    hasGLBExport: true,
    hasCesium: true,
    hasCollaboration: true,
    hasVersionHistory: true,
    hasAllAITools: true,
    hasPDFExport: true,
    hasAPIAccess: true,
    hasSSO: true
  },
  enterprise: {
    maxProjects: -1,
    aiActionsPerMonth: -1,
    maxVersionsPerProject: -1,
    maxSeats: -1,
    hasIFCExport: true,
    hasGLBExport: true,
    hasCesium: true,
    hasCollaboration: true,
    hasVersionHistory: true,
    hasAllAITools: true,
    hasPDFExport: true,
    hasAPIAccess: true,
    hasSSO: true
  }
};
const FEATURE_REQUIRED_PLAN = {
  ["AI_ACTIONS" /* AI_ACTIONS */]: "free",
  // free gets 5, paid gets more
  ["AI_DESIGN_ADVISOR" /* AI_DESIGN_ADVISOR */]: "free",
  // Design Advisor teaser on free
  ["AI_FLOOR_PLAN" /* AI_FLOOR_PLAN */]: "architect",
  ["AI_ELEMENT_CREATOR" /* AI_ELEMENT_CREATOR */]: "architect",
  ["AI_WARDROBE" /* AI_WARDROBE */]: "architect",
  ["IFC_EXPORT" /* IFC_EXPORT */]: "architect",
  ["GLB_EXPORT" /* GLB_EXPORT */]: "architect",
  ["PDF_EXPORT" /* PDF_EXPORT */]: "architect",
  ["CESIUM_GIS" /* CESIUM_GIS */]: "architect",
  ["VERSION_HISTORY" /* VERSION_HISTORY */]: "architect",
  ["UNLIMITED_PROJECTS" /* UNLIMITED_PROJECTS */]: "architect",
  ["COLLABORATION" /* COLLABORATION */]: "studio",
  ["ADDITIONAL_SEATS" /* ADDITIONAL_SEATS */]: "studio",
  ["API_ACCESS" /* API_ACCESS */]: "firm",
  ["SSO" /* SSO */]: "firm"
};
const PLAN_ORDER = ["free", "architect", "studio", "firm", "enterprise", "owner"];
function isPlanAtLeast(userPlan, requiredPlan) {
  if (userPlan === "owner") return true;
  const userIdx = PLAN_ORDER.indexOf(userPlan);
  const reqIdx = PLAN_ORDER.indexOf(requiredPlan === "owner" ? "enterprise" : requiredPlan);
  return userIdx >= reqIdx;
}
function suggestedUpgradePlan(currentPlan, feature) {
  const required = FEATURE_REQUIRED_PLAN[feature];
  if (isPlanAtLeast(currentPlan, required)) return currentPlan;
  return required;
}

const KEY_PREFIX = "bim-ai-usage";
function currentPeriod() {
  const d = /* @__PURE__ */ new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function storageKey(userId) {
  return `${KEY_PREFIX}-${userId}-${currentPeriod()}`;
}
class AIUsageTrackerImpl {
  /** Returns the number of AI actions used in the current billing period */
  getUsedThisPeriod(userId) {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return 0;
      const record = JSON.parse(raw);
      if (record.period !== currentPeriod()) return 0;
      return record.count || 0;
    } catch {
      return 0;
    }
  }
  /** Increments the AI usage count by 1 (call after a successful AI request) */
  increment(userId) {
    try {
      const key = storageKey(userId);
      const current = this.getUsedThisPeriod(userId);
      const record = {
        count: current + 1,
        period: currentPeriod(),
        lastUpdated: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(record));
    } catch {
    }
  }
  /** Resets usage for the current period (for testing / admin) */
  reset(userId) {
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
    }
  }
  /** Returns usage summary for display */
  getSummary(userId, limitPerMonth) {
    return {
      used: this.getUsedThisPeriod(userId),
      limit: limitPerMonth,
      period: currentPeriod()
    };
  }
}
const AIUsageTracker = new AIUsageTrackerImpl();

const AUTH_STORAGE_KEY = "bim-platform-user";
function loadUserPlanContext() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { plan: "free", planStatus: "active" };
    const parsed = JSON.parse(raw);
    return {
      plan: parsed.plan || "free",
      planStatus: parsed.planStatus || "active"
    };
  } catch {
    return { plan: "free", planStatus: "active" };
  }
}
let _planCache = null;
const PLAN_CACHE_TTL_MS = 5 * 60 * 1e3;
class EntitlementStoreImpl {
  // ── Plan access ───────────────────────────────────────────────────────────
  getUserPlan() {
    return loadUserPlanContext().plan;
  }
  getPlanStatus() {
    return loadUserPlanContext().planStatus;
  }
  isActive() {
    const status = this.getPlanStatus();
    return status === "active" || status === "trialing";
  }
  // ── Project limits ────────────────────────────────────────────────────────
  getMaxProjects() {
    return PLAN_LIMITS[this.getUserPlan()].maxProjects;
  }
  canCreateProject(currentProjectCount) {
    const max = this.getMaxProjects();
    if (max === -1) return true;
    return currentProjectCount < max;
  }
  // ── Version limits ────────────────────────────────────────────────────────
  getMaxVersions() {
    return PLAN_LIMITS[this.getUserPlan()].maxVersionsPerProject;
  }
  canSaveVersion(currentVersionCount) {
    const max = this.getMaxVersions();
    if (max === -1) return true;
    if (max === 0) return false;
    return currentVersionCount < max;
  }
  hasVersionHistory() {
    return PLAN_LIMITS[this.getUserPlan()].hasVersionHistory;
  }
  // ── AI limits ─────────────────────────────────────────────────────────────
  getAIActionsLimit() {
    return PLAN_LIMITS[this.getUserPlan()].aiActionsPerMonth;
  }
  getAIActionsUsed() {
    const user = this.getUserId();
    return AIUsageTracker.getUsedThisPeriod(user);
  }
  getAIActionsRemaining() {
    const limit = this.getAIActionsLimit();
    if (limit === -1) return Infinity;
    return Math.max(0, limit - this.getAIActionsUsed());
  }
  canUseAI() {
    return this.getAIActionsRemaining() > 0;
  }
  canUseAllAITools() {
    return PLAN_LIMITS[this.getUserPlan()].hasAllAITools;
  }
  // ── Export limits ─────────────────────────────────────────────────────────
  canExportIFC() {
    return PLAN_LIMITS[this.getUserPlan()].hasIFCExport;
  }
  canExportGLB() {
    return PLAN_LIMITS[this.getUserPlan()].hasGLBExport;
  }
  canExportPDF() {
    return PLAN_LIMITS[this.getUserPlan()].hasPDFExport;
  }
  // ── Geospatial ────────────────────────────────────────────────────────────
  canUseCesium() {
    return PLAN_LIMITS[this.getUserPlan()].hasCesium;
  }
  // ── Collaboration ─────────────────────────────────────────────────────────
  canInviteMembers() {
    return PLAN_LIMITS[this.getUserPlan()].hasCollaboration;
  }
  getMaxSeats() {
    return PLAN_LIMITS[this.getUserPlan()].maxSeats;
  }
  // ── Gate checks ───────────────────────────────────────────────────────────
  /** Returns true when the user does NOT have access to the feature */
  needsUpgrade(feature) {
    const plan = this.getUserPlan();
    const required = FEATURE_REQUIRED_PLAN[feature];
    if (!isPlanAtLeast(plan, required)) return true;
    if (feature === Feature.AI_ACTIONS || feature === Feature.AI_ELEMENT_CREATOR || feature === Feature.AI_FLOOR_PLAN || feature === Feature.AI_WARDROBE || feature === Feature.AI_DESIGN_ADVISOR) {
      return !this.canUseAI();
    }
    return false;
  }
  suggestedPlan(feature) {
    return suggestedUpgradePlan(this.getUserPlan(), feature);
  }
  // ── Phase 4 — Server plan synchronisation ────────────────────────────────
  /**
   * Fetches the authenticated user's plan from GET /api/me/plan and
   * persists it to localStorage so all subsequent local plan checks reflect
   * the server-authoritative value.
   *
   * Results are cached in-memory for PLAN_CACHE_TTL_MS (5 minutes) to
   * prevent a stampede of requests when multiple components mount quickly.
   *
   * Silently no-ops when:
   *   • The cache is still fresh.
   *   • The user is not authenticated (no auth token available).
   *   • The network request fails (local plan remains unchanged).
   *
   * Usage:
   *   Call fire-and-forget at app boot after the user is signed in:
   *   EntitlementStore.fetchPlanFromServer().catch(() => {});
   */
  async fetchPlanFromServer() {
    if (_planCache && Date.now() - _planCache.fetchedAt < PLAN_CACHE_TTL_MS) {
      return;
    }
    try {
      const res = await apiFetch("/api/me/plan");
      if (!res.ok) {
        console.warn(`[EntitlementStore] /api/me/plan returned ${res.status} — local plan unchanged`);
        return;
      }
      const body = await res.json();
      const plan = body.plan || "free";
      const planStatus = body.planStatus || "active";
      _planCache = { plan, planStatus, fetchedAt: Date.now() };
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        ...existing,
        plan,
        planStatus
      }));
      console.log(`[EntitlementStore] Plan synced from server: ${plan} (${planStatus})`);
    } catch (err) {
      console.warn("[EntitlementStore] fetchPlanFromServer failed — local plan unchanged:", err);
    }
  }
  /**
   * Invalidate the in-memory plan cache (e.g. after a successful purchase
   * webhook is received so the next call gets a fresh server value).
   */
  invalidatePlanCache() {
    _planCache = null;
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  getUserId() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return "anonymous";
      return JSON.parse(raw).id || "anonymous";
    } catch {
      return "anonymous";
    }
  }
}
const EntitlementStore = new EntitlementStoreImpl();

let _host = null;
let _pending = null;
async function getAiHost(opts) {
  if (_host) return _host;
  if (_pending) return _pending;
  _pending = (async () => {
    const mod = await __vitePreload(() => import('./AiHost.impl-Bt5JNw6e.js'),true              ?__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10]):void 0);
    _host = mod.createAiHost(opts ?? {});
    _pending = null;
    return _host;
  })();
  return _pending;
}
function isAiHostLoaded() {
  return _host !== null;
}

async function hashWorkflowRequest(workflow, input) {
  const canonical = JSON.stringify({ workflow, input: input ?? null });
  const encoded = new TextEncoder().encode(canonical);
  const hashBuf = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
class AiResponseCacheFetchAdapter {
  base;
  fetchImpl;
  constructor(base = "/api/ai/cache", fetchImpl) {
    this.base = base;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }
  async get(key) {
    try {
      const r = await this.fetchImpl(`${this.base}/lookup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(key)
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.hit && data.result != null ? data.result : null;
    } catch {
      return null;
    }
  }
  async set(key, value, ttlDays = 7) {
    try {
      await this.fetchImpl(`${this.base}/store`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...key, result: value, ttlDays })
      });
    } catch {
    }
  }
}
class MockAiResponseCache {
  store = /* @__PURE__ */ new Map();
  getCalls = [];
  setCalls = [];
  static makeKey(k) {
    return `${k.tenantId}::${k.modelVersion}::${k.contentHash}`;
  }
  /** Seed the cache with a pre-existing entry (test helper). */
  prime(key, value) {
    this.store.set(MockAiResponseCache.makeKey(key), value);
  }
  async get(key) {
    this.getCalls.push(key);
    return this.store.get(MockAiResponseCache.makeKey(key)) ?? null;
  }
  async set(key, value, ttlDays = 7) {
    this.setCalls.push({ key, value, ttlDays });
    this.store.set(MockAiResponseCache.makeKey(key), value);
  }
  /** Snapshot of currently stored keys (for assertions). */
  keys() {
    return [...this.store.keys()];
  }
}

const TRACER_NAME$2 = "@pryzm/ai-host";
const TRACER_VERSION$1 = "0.1.0";
let cachedTracer$1 = null;
function tracer$1() {
  cachedTracer$1 ??= trace.getTracer(TRACER_NAME$2, TRACER_VERSION$1);
  return cachedTracer$1;
}
function withWorkflowSpan(kind, fn, attrs) {
  const name = `pryzm.ai.workflow.${kind}`;
  const spanOpts = attrs !== void 0 ? { attributes: attrs } : {};
  return tracer$1().startActiveSpan(name, spanOpts, async (span) => {
    try {
      const result = await fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function withWorkflowSpanSync(kind, fn, attrs) {
  const name = `pryzm.ai.workflow.${kind}`;
  const spanOpts = attrs !== void 0 ? { attributes: attrs } : {};
  return tracer$1().startActiveSpan(name, spanOpts, (span) => {
    try {
      const result = fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

const CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence to resolve a non-destructive intent. */
  resolve: 0.75,
  /** Destructive intents (delete) need more evidence to even REACH the
   *  Confirm/Cancel card — below this they become a clarifying question. */
  resolveDestructive: 0.85,
  /** Below this the utterance is a miss and falls through to the LLM. */
  clarify: 0.45
};
const TRACER_NAME$1 = "@pryzm/ai-host";
let cachedTracer = null;
function tracer() {
  cachedTracer ??= trace.getTracer(TRACER_NAME$1, "0.1.0");
  return cachedTracer;
}
const SMALL_NUMBERS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
};
const TENS_NUMBERS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};
const ORDINALS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10
};
const NL_SYNONYMS = {
  // level words
  floor: "level",
  floors: "level",
  storey: "level",
  storeys: "level",
  story: "level",
  stories: "level",
  // deletion verbs
  remove: "delete",
  removes: "delete",
  removing: "delete",
  erase: "delete",
  trash: "delete",
  discard: "delete",
  eliminate: "delete",
  del: "delete",
  deleting: "delete",
  // change verbs
  modify: "change",
  adjust: "change",
  alter: "change",
  update: "change",
  changing: "change",
  setting: "set",
  making: "make",
  resize: "change",
  // navigation verbs
  navigate: "go",
  jump: "go",
  head: "go",
  going: "go",
  "switch": "go",
  switching: "go",
  // creation verbs
  creating: "create",
  adding: "add",
  drawing: "draw",
  building: "build",
  renaming: "rename",
  // selection words
  selection: "selected",
  chosen: "selected",
  highlighted: "selected",
  picked: "selected"
};
const NL_VOCAB = [
  "delete",
  "remove",
  "erase",
  "selected",
  "selection",
  "this",
  "that",
  "these",
  "those",
  "wall",
  "walls",
  "door",
  "doors",
  "window",
  "windows",
  "room",
  "rooms",
  "slab",
  "slabs",
  "roof",
  "stair",
  "stairs",
  "column",
  "columns",
  "level",
  "levels",
  "floor",
  "floors",
  "storey",
  "height",
  "width",
  "thickness",
  "sill",
  "create",
  "draw",
  "build",
  "add",
  "make",
  "set",
  "change",
  "increase",
  "raise",
  "decrease",
  "reduce",
  "lower",
  "rename",
  "call",
  "go",
  "tall",
  "taller",
  "high",
  "higher",
  "short",
  "shorter",
  "thick",
  "thicker",
  "thin",
  "thinner",
  "wide",
  "wider",
  "narrow",
  "narrower",
  "pitch",
  "degree",
  "degrees",
  "number",
  "ceiling",
  "riser",
  "tread",
  "depth",
  "offset",
  "undo",
  "redo",
  "zoom",
  "fit",
  "frame",
  "meter",
  "meters",
  "metre",
  "metres",
  "millimeter",
  "millimeters",
  "millimetre",
  "millimetres",
  "centimeter",
  "centimeters",
  "centimetre",
  "centimetres",
  "upstairs",
  "downstairs",
  "ground",
  "everything",
  "ordinal",
  "element",
  "elements"
];
const NL_ELEMENT_NOUNS = /* @__PURE__ */ new Set([
  "wall",
  "walls",
  "door",
  "doors",
  "window",
  "windows",
  "room",
  "rooms",
  "slab",
  "slabs",
  "roof",
  "roofs",
  "stair",
  "stairs",
  "column",
  "columns",
  "beam",
  "beams",
  "ceiling",
  "ceilings",
  "element",
  "elements",
  "item",
  "items",
  "object",
  "objects"
]);
const SELECTION_REF_WORDS = /* @__PURE__ */ new Set([
  "this",
  "that",
  "it",
  "these",
  "those",
  "selected",
  "my",
  "mine",
  "current"
]);
const SET_VERBS = /* @__PURE__ */ new Set([
  "set",
  "make",
  "change",
  "increase",
  "raise",
  "decrease",
  "reduce",
  "lower",
  "extend",
  "shrink",
  "bump"
]);
const SET_INTENTS = /* @__PURE__ */ new Set([
  "set-height",
  "set-thickness",
  "set-width",
  "set-sill-height"
]);
function isSetIntent(x) {
  return SET_INTENTS.has(x);
}
const AFFIRMATIVE_RE = /^(?:yes|yep|yeah|yup|sure|ok|okay|go ahead|do it|do that|please do|go for it|sounds good|lets do (?:it|that)|absolutely|definitely)\b/;
const INTERROGATIVES = /* @__PURE__ */ new Set([
  "what",
  "whats",
  "how",
  "why",
  "where",
  "which",
  "who",
  "whose",
  "when",
  "is",
  "are",
  "was",
  "were",
  "does",
  "did",
  "tell",
  "explain",
  "describe",
  "list",
  "count"
]);
const CONTRACTIONS = [
  [/\bi've\b/g, "i have"],
  [/\bi'd\b/g, "i would"],
  [/\bi'm\b/g, "i am"],
  [/\byou've\b/g, "you have"],
  [/\bit's\b/g, "it is"],
  [/\bthat's\b/g, "that is"],
  [/\blet's\b/g, "lets"],
  [/\bdon't\b/g, "do not"],
  [/\bcan't\b/g, "can not"],
  [/\bwon't\b/g, "will not"]
];
const LEADING_FILLER = [
  /^(?:please|pls|plz|hey|hi|hello|ok|okay|so|well|now|kindly|thanks|thank you|actually|instead|wait|just|maybe|perhaps|also|then|next|and|um|umm|uh)\s+/,
  /^(?:can|could|would|will) (?:you|we)(?: please| kindly| just| maybe)?\s+/,
  /^(?:would|do) you mind\s+/,
  /^(?:i would (?:like|love|prefer)(?: you)?(?: to)?|i want(?: you)?(?: to)?|i need(?: you)?(?: to)?|i wish to|is it possible to|it would be (?:great|nice) if you(?: could)?|lets|do me a favou?r and|go ahead and|be so kind and)\s+/,
  /^(?:you (?:should|could|can))\s+/
];
const TRAILING_FILLER = /\s+(?:please|pls|thanks|thank you|for me|for us|if you can|if possible|now|too|as well|ok|okay)$/;
const PHRASE_MAP = [
  [/\bget rid of\b/g, "delete"],
  [/\bthrow away\b/g, "delete"],
  [/\btake away\b/g, "delete"],
  [/\btake (?:me|us) (?:back )?to\b/g, "go to"],
  [/\bbring (?:me|us) to\b/g, "go to"],
  [/\bmove (?:me|us) to\b/g, "go to"],
  [/\bgo (?:back|up|down) to\b/g, "go to"],
  [/\bgo back(?:wards)?\b/g, "undo"],
  [/\btake (?:that|it) back\b/g, "undo"],
  [/\breverse (?:that|it|this)\b/g, "undo"],
  [/\brevert(?: that| it| this)?\b/g, "undo"],
  [/\bdo (?:that|it) again\b/g, "redo"]
];
function convertNumberWords(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    let value = null;
    let next = i + 1;
    if (t in TENS_NUMBERS) {
      value = TENS_NUMBERS[t];
      const u = tokens[next];
      if (u !== void 0 && u in SMALL_NUMBERS && SMALL_NUMBERS[u] < 10) {
        value += SMALL_NUMBERS[u];
        next += 1;
      }
    } else if (t in SMALL_NUMBERS) {
      value = SMALL_NUMBERS[t];
    }
    if (value !== null) {
      const scale = tokens[next];
      if (scale === "hundred") {
        value *= 100;
        next += 1;
      } else if (scale === "thousand") {
        value *= 1e3;
        next += 1;
      }
      out.push(String(value));
      i = next;
      continue;
    }
    out.push(t);
    i += 1;
  }
  const merged = [];
  for (let j = 0; j < out.length; j++) {
    const a = out[j];
    if (/^\d+$/.test(a) && out[j + 1] === "point" && /^\d+$/.test(out[j + 2] ?? "")) {
      merged.push(`${a}.${out[j + 2]}`);
      j += 2;
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(a) && out[j + 1] === "and" && out[j + 2] === "a" && out[j + 3] === "half") {
      merged.push(String(parseFloat(a) + 0.5));
      j += 3;
      continue;
    }
    if (a === "half" && out[j + 1] === "a") {
      merged.push("0.5");
      j += 1;
      continue;
    }
    merged.push(a);
  }
  return merged;
}
function typoCorrect(tok) {
  if (tok.length < 4 || /[\d(),.]/.test(tok)) return null;
  if (isProtectedFunctionWord(tok)) return null;
  const budget = tok.length > 5 ? 2 : 1;
  let best = null;
  let bestD = budget + 1;
  for (const v of NL_VOCAB) {
    const d = boundedLevenshtein(tok, v, budget);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return bestD <= budget && bestD > 0 && best !== null ? best : null;
}
function normalizeNatural(raw) {
  const evidence = [];
  let text = raw.toLowerCase().replace(/[‘’]/g, "'").replace(/[!?]/g, " ").replace(/\.(?!\d)/g, " ").replace(/,(?!\d)/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, sub] of CONTRACTIONS) text = text.replace(re, sub);
  const revision = /^(?:actually|instead|no wait|wait|on second thought)\b/.test(text);
  if (revision) evidence.push("revision-marker");
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of LEADING_FILLER) {
      if (re.test(text)) {
        text = text.replace(re, "").trim();
        changed = true;
        if (!evidence.includes("filler-stripped")) evidence.push("filler-stripped");
      }
    }
    if (TRAILING_FILLER.test(text)) {
      text = text.replace(TRAILING_FILLER, "").trim();
      changed = true;
      if (!evidence.includes("filler-stripped")) evidence.push("filler-stripped");
    }
  }
  for (const [re, sub] of PHRASE_MAP) {
    if (re.test(text)) {
      re.lastIndex = 0;
      text = text.replace(re, sub);
      evidence.push(`phrase:${sub}`);
    }
    re.lastIndex = 0;
  }
  const plain = text;
  let typoCount = 0;
  const corrected = /* @__PURE__ */ new Set();
  const tokens = convertNumberWords(text.split(" ").filter((t) => t.length > 0)).map((tok, i) => {
    const syn = NL_SYNONYMS[tok];
    if (syn !== void 0) return syn;
    if (NL_VOCAB.includes(tok) || NL_ELEMENT_NOUNS.has(tok) || SELECTION_REF_WORDS.has(tok) || tok in ORDINALS) return tok;
    const fixed = typoCorrect(tok);
    if (fixed !== null) {
      typoCount += 1;
      corrected.add(i);
      return NL_SYNONYMS[fixed] ?? fixed;
    }
    return tok;
  });
  if (typoCount > 0) evidence.push(`typo-corrected:${typoCount}`);
  return { text: tokens.join(" "), plain, tokens, evidence, typoCount, revision, corrected };
}
const MEASURE_RE = /(-?\d+(?:\.\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?(?![\w.])/g;
const COORDS_RE = /\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*(?:to|->|-)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/;
const HEIGHT_WORDS = /* @__PURE__ */ new Set(["height", "heights", "tall", "high"]);
const HEIGHT_REL = /* @__PURE__ */ new Set(["taller", "higher", "shorter", "lower"]);
const THICK_WORDS = /* @__PURE__ */ new Set(["thickness", "thick"]);
const THICK_REL = /* @__PURE__ */ new Set(["thicker", "thinner"]);
const WIDTH_WORDS = /* @__PURE__ */ new Set(["width", "wide"]);
const WIDTH_REL = /* @__PURE__ */ new Set(["wider", "narrower"]);
function findGroundLevel(levels) {
  return levels.find((l) => l.name.toLowerCase().includes("ground")) ?? levels.find((l) => l.elevation === 0) ?? [...levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))[0];
}
function extractEntities(n, ctx) {
  const { text, tokens } = n;
  const coordMatch = COORDS_RE.exec(text);
  const coordSpan = coordMatch !== null ? [coordMatch.index, coordMatch.index + coordMatch[0].length] : null;
  const coords = coordMatch !== null ? {
    start: { x: parseFloat(coordMatch[1]), z: parseFloat(coordMatch[2]) },
    end: { x: parseFloat(coordMatch[3]), z: parseFloat(coordMatch[4]) }
  } : null;
  let levelQuery = null;
  let upDown = null;
  const levelMentioned = tokens.includes("level") || tokens.includes("levels");
  const li = tokens.findIndex((t) => t === "level" || t === "levels");
  if (li >= 0) {
    const before = li > 0 ? tokens[li - 1] : "";
    const after = tokens[li + 1];
    const ordBefore = ORDINALS[before] ?? (/^(\d+)(?:st|nd|rd|th)$/.exec(before)?.[1] ?? null);
    if (after !== void 0 && /^\d+$/.test(after)) {
      levelQuery = after;
    } else if (ordBefore !== null) {
      levelQuery = String(ordBefore);
    } else if (before === "ground" || after === "ground") {
      const ground = findGroundLevel(ctx.levels);
      levelQuery = ground !== void 0 ? ground.name : "ground";
    } else if (after !== void 0 && !NL_VOCAB.includes(after) && !SELECTION_REF_WORDS.has(after)) {
      const joined2 = tokens[li + 2] !== void 0 ? `${after} ${tokens[li + 2]}` : void 0;
      if (joined2 !== void 0 && findLevel(joined2, ctx.levels) !== void 0) levelQuery = joined2;
      else levelQuery = after;
    }
  }
  if (tokens.includes("upstairs")) upDown = "up";
  else if (tokens.includes("downstairs")) upDown = "down";
  if (levelQuery === null && upDown !== null) {
    const sorted = [...ctx.levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
    const idx = sorted.findIndex((l) => l.id === ctx.activeLevelId);
    if (idx >= 0) {
      const target = sorted[idx + (upDown === "up" ? 1 : -1)];
      if (target !== void 0) levelQuery = target.name;
    }
  }
  const measurements = [];
  let relativeBy = false;
  MEASURE_RE.lastIndex = 0;
  let m;
  while ((m = MEASURE_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (coordSpan !== null && start >= coordSpan[0] && end <= coordSpan[1]) continue;
    const beforeText = text.slice(0, start);
    const prevWord = /([a-z]+)\s*$/.exec(beforeText)?.[1] ?? "";
    if (prevWord === "level" || prevWord === "levels") continue;
    const hasUnit = m[2] !== void 0 && m[2] !== "";
    if (!hasUnit) {
      const nextWord = /^\s*([a-z]+)/.exec(text.slice(end))?.[1] ?? "";
      if (NL_ELEMENT_NOUNS.has(nextWord)) continue;
      if (levelQuery !== null && m[1] === levelQuery) continue;
    }
    if (prevWord === "by") relativeBy = true;
    measurements.push(lengthToMeters(m[1], m[2]));
  }
  let dimension = null;
  let relativeDim = false;
  if (tokens.includes("sill")) dimension = "sill";
  else if (tokens.some((t) => THICK_WORDS.has(t))) dimension = "thickness";
  else if (tokens.some((t) => THICK_REL.has(t))) {
    dimension = "thickness";
    relativeDim = true;
  } else if (tokens.some((t) => WIDTH_WORDS.has(t))) dimension = "width";
  else if (tokens.some((t) => WIDTH_REL.has(t))) {
    dimension = "width";
    relativeDim = true;
  } else if (tokens.some((t) => HEIGHT_WORDS.has(t))) dimension = "height";
  else if (tokens.some((t) => HEIGHT_REL.has(t))) {
    dimension = "height";
    relativeDim = true;
  }
  const DIM_WORD = String.raw`(sill height|sill|height|tall|high|width|wide|thickness|thick)`;
  const UNIT = String.raw`(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?`;
  const toDim = (w) => w.startsWith("sill") ? "sill" : w === "width" || w === "wide" ? "width" : w === "thickness" || w === "thick" ? "thickness" : "height";
  const bindings = [];
  const bound = /* @__PURE__ */ new Set();
  const addBinding = (dimWord, num, unit) => {
    const dim = toDim(dimWord);
    if (bound.has(dim)) return;
    bound.add(dim);
    bindings.push({ dim, value: lengthToMeters(num, unit) });
  };
  const VALUE_THEN_DIM = new RegExp(String.raw`(-?\d+(?:\.\d+)?)\s*${UNIT}\s+(?:in\s+|of\s+)?${DIM_WORD}\b`, "g");
  const DIM_THEN_VALUE = new RegExp(String.raw`\b${DIM_WORD}\s*(?:of|to|at|=|:)?\s*(-?\d+(?:\.\d+)?)\s*${UNIT}(?![\w.])`, "g");
  for (const m2 of text.matchAll(VALUE_THEN_DIM)) addBinding(m2[3], m2[1], m2[2]);
  for (const m2 of text.matchAll(DIM_THEN_VALUE)) addBinding(m2[1], m2[2], m2[3]);
  const angleMatch = /(-?\d+(?:\.\d+)?)\s*(?:°|degrees?|degs?)(?![a-z])/.exec(text);
  const angleDeg = angleMatch !== null ? parseFloat(angleMatch[1]) : null;
  const nounTok = tokens.find((t) => NL_ELEMENT_NOUNS.has(t)) ?? null;
  const elementNoun = nounTok !== null ? nounTok.endsWith("s") ? nounTok.slice(0, -1) : nounTok : null;
  const selectionRef = tokens.some((t) => SELECTION_REF_WORDS.has(t)) || / i (?:have )?(?:selected|chosen|picked)/.test(` ${text}`);
  const nounIdx = nounTok !== null ? tokens.indexOf(nounTok) : -1;
  const determinerNew = nounIdx > 0 && (["a", "another", "new"].includes(tokens[nounIdx - 1]) || nounIdx > 1 && tokens[nounIdx - 2] === "a" && tokens[nounIdx - 1] === "new");
  return {
    measurements,
    relativeBy,
    dimension,
    relativeDim,
    elementNoun,
    selectionRef,
    levelQuery,
    levelMentioned,
    upDown,
    coords,
    angleDeg,
    bindings,
    hasDeleteVerb: tokens.includes("delete"),
    hasNavVerb: tokens.includes("go") || tokens.includes("open"),
    hasSetVerb: tokens.some((t) => SET_VERBS.has(t)),
    determinerNew
  };
}
const DIMENSION_INTENT = {
  height: "set-height",
  thickness: "set-thickness",
  width: "set-width",
  sill: "set-sill-height"
};
const CLARIFY_QUESTIONS = {
  "set-height": 'What height should I set it to? For example "3m" or "2700mm".',
  "set-thickness": 'How thick should it be? For example "200mm" or "0.2m".',
  "set-width": 'What width should I set? For example "900mm".',
  "set-sill-height": 'What sill height should I set? For example "1m".',
  "set-roof-pitch": 'What pitch should I set? For example "30 degrees".',
  "set-room-number": 'What room number should I set? For example "101".'
};
const DIMENSION_LABEL = {
  "set-height": "height",
  "set-thickness": "thickness",
  "set-width": "width",
  "set-sill-height": "sill height"
};
function classify(n, e, ctx) {
  const { tokens } = n;
  const conversation = ctx.conversation ?? {};
  const candidates = [];
  const push = (c) => {
    candidates.push(c);
  };
  const short = tokens.length <= 3;
  if (conversation.pendingOffer === "finish-chain" && AFFIRMATIVE_RE.test(n.plain)) {
    push({
      intent: "finish-apartment-chain",
      confidence: 0.95,
      evidence: ["offer:accepted"],
      si: { intent: "finish-apartment-chain", withLayout: false, scope: "active-level" }
    });
  }
  if (tokens.includes("undo")) {
    push({ intent: "undo", confidence: short ? 0.95 : 0.85, evidence: ["verb:undo"], si: { intent: "undo" } });
  } else if (tokens.includes("redo")) {
    push({ intent: "redo", confidence: short ? 0.95 : 0.85, evidence: ["verb:redo"], si: { intent: "redo" } });
  }
  if (tokens.includes("zoom") || tokens.includes("frame") || tokens.includes("fit")) {
    if (tokens.some((t) => t === "selected" || t === "this" || t === "that" || t === "it")) {
      push({ intent: "zoom-selected", confidence: 0.9, evidence: ["verb:zoom", "target:selection"], si: { intent: "zoom-selected" } });
    } else if (tokens.some((t) => ["fit", "all", "everything", "extents", "model", "view"].includes(t))) {
      push({ intent: "zoom-fit", confidence: 0.9, evidence: ["verb:zoom", "target:everything"], si: { intent: "zoom-fit" } });
    }
  }
  if (e.hasDeleteVerb && !tokens.includes("level")) {
    const ev = ["verb:delete"];
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (e.selectionRef) ev.push("target:selection");
    if (e.elementNoun !== null && e.selectionRef) {
      push({ intent: "delete-selected", confidence: 0.95, evidence: ev, si: { intent: "delete-selected", noun: e.elementNoun } });
    } else if (e.elementNoun !== null) {
      push({ intent: "delete-selected", confidence: 0.88, evidence: ev, si: { intent: "delete-selected", noun: e.elementNoun } });
    } else if (e.selectionRef) {
      push({ intent: "delete-selected", confidence: 0.88, evidence: ev, si: { intent: "delete-selected" } });
    } else {
      push({
        intent: "delete-selected",
        confidence: 0.5,
        evidence: ev,
        question: 'What should I delete? For example: "delete the selected wall".'
      });
    }
  }
  const bulkDims = parseDimensionScopedIntent(n.plain, ctx, lengthToMeters);
  if (bulkDims !== null) {
    push({
      intent: bulkDims.intent,
      confidence: 0.96,
      evidence: ["verb:resize", "bulk-dimensions", `scope:${scopeTag(bulkDims.scope)}`],
      si: bulkDims
    });
  }
  const creationShape = e.determinerNew && (tokens.includes("create") || tokens.includes("draw") || tokens.includes("build") || tokens.includes("add") || tokens.includes("make"));
  const compound = e.bindings.length >= 2 && !creationShape && e.coords === null;
  if (compound) {
    const si = { intent: "set-dimensions" };
    const fields = {};
    for (const b of e.bindings) {
      const key = b.dim === "sill" ? "sillHeight" : b.dim;
      fields[key] = b.value;
    }
    push({
      intent: "set-dimensions",
      confidence: 0.95,
      evidence: ["compound", ...e.bindings.map((b) => `bind:${b.dim}`)],
      si: { ...si, ...fields }
    });
  }
  const allScopeWord = tokens.some((t) => t === "all" || t === "every" || t === "each");
  if (e.dimension !== null && !creationShape && !compound && !allScopeWord) {
    const intent = DIMENSION_INTENT[e.dimension];
    const value = e.measurements[0];
    const ev = [`dimension:${e.dimension}`];
    if (e.selectionRef) ev.push("target:selection");
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (value !== void 0 && !e.relativeBy) {
      ev.push("value:absolute");
      const conf = 0.9 + (e.selectionRef || e.elementNoun !== null ? 0.05 : 0);
      const si = intent === "set-height" ? { intent, value } : intent === "set-thickness" ? { intent, value } : intent === "set-width" ? { intent, value } : { intent, value };
      push({ intent, confidence: conf, evidence: ev, si });
    } else if (value !== void 0 && e.relativeBy) {
      ev.push("value:relative-delta");
      push({
        intent,
        confidence: 0.6,
        evidence: ev,
        question: `I can set an absolute ${DIMENSION_LABEL[intent]}, but I don't know the current one from here — what should the new ${DIMENSION_LABEL[intent]} be?`
      });
    } else if (e.hasSetVerb || e.relativeDim) {
      ev.push("value:missing");
      push({ intent, confidence: 0.62, evidence: ev, question: CLARIFY_QUESTIONS[intent] });
    }
  }
  if (tokens.includes("riser") && !creationShape) {
    const value = e.measurements[0];
    if (value !== void 0 && !e.relativeBy) {
      push({
        intent: "set-riser-height",
        confidence: 0.96,
        evidence: ["dimension:riser-height", "value:absolute"],
        si: { intent: "set-riser-height", value }
      });
    } else if (e.hasSetVerb) {
      push({
        intent: "set-riser-height",
        confidence: 0.62,
        evidence: ["dimension:riser-height", "value:missing"],
        question: 'What riser height should I set? For example "180mm".'
      });
    }
  }
  if (tokens.includes("tread") && !creationShape) {
    const value = e.measurements[0];
    if (value !== void 0 && !e.relativeBy) {
      push({
        intent: "set-tread-depth",
        confidence: 0.96,
        evidence: ["dimension:tread-depth", "value:absolute"],
        si: { intent: "set-tread-depth", value }
      });
    } else if (e.hasSetVerb) {
      push({
        intent: "set-tread-depth",
        confidence: 0.62,
        evidence: ["dimension:tread-depth", "value:missing"],
        question: 'What tread depth should I set? For example "250mm".'
      });
    }
  }
  if (tokens.includes("offset") && tokens.includes("height") && !tokens.includes("base") && !creationShape) {
    const value = e.measurements[0];
    if (value !== void 0 && !e.relativeBy) {
      push({
        intent: "set-room-height-offset",
        confidence: 0.96,
        evidence: ["dimension:height-offset", "value:absolute"],
        si: { intent: "set-room-height-offset", value }
      });
    } else if (e.hasSetVerb) {
      push({
        intent: "set-room-height-offset",
        confidence: 0.62,
        evidence: ["dimension:height-offset", "value:missing"],
        question: 'What height offset should I set? For example "0.5m" or "-0.2m".'
      });
    }
  }
  if (tokens.includes("pitch") && !creationShape) {
    const numTok = tokens.find((t) => /^-?\d+(?:\.\d+)?$/.test(t));
    const deg = e.angleDeg ?? (numTok !== void 0 ? parseFloat(numTok) : null);
    const ev = ["dimension:pitch"];
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (deg !== null) {
      push({
        intent: "set-roof-pitch",
        confidence: 0.9 + (e.selectionRef || e.elementNoun === "roof" ? 0.05 : 0),
        evidence: [...ev, "value:absolute"],
        si: { intent: "set-roof-pitch", degrees: deg }
      });
    } else if (e.hasSetVerb) {
      push({ intent: "set-roof-pitch", confidence: 0.62, evidence: [...ev, "value:missing"], question: CLARIFY_QUESTIONS["set-roof-pitch"] });
    }
  }
  if (tokens.includes("number") && (tokens.includes("room") || e.selectionRef)) {
    const m = /\bnumber\b(?:\s+(?:to|as))?\s+["']?([\w.-]+)["']?\s*$/.exec(n.plain);
    const num = m?.[1];
    if (num !== void 0 && num.length > 0) {
      push({
        intent: "set-room-number",
        confidence: 0.9,
        evidence: ["noun:room-number", "value:present"],
        si: { intent: "set-room-number", number: num }
      });
    } else if (e.hasSetVerb) {
      push({ intent: "set-room-number", confidence: 0.6, evidence: ["noun:room-number", "value:missing"], question: CLARIFY_QUESTIONS["set-room-number"] });
    }
  }
  if (e.dimension === null && e.measurements.length > 0 && e.coords === null && !tokens.includes("pitch") && !tokens.includes("number")) {
    const prior = conversation.pendingIntent ?? conversation.lastIntent;
    const value = e.measurements[0];
    if (prior !== void 0 && isSetIntent(prior)) {
      const conf = Math.min(0.9, 0.85 + (n.revision ? 0.05 : 0));
      const si = prior === "set-height" ? { intent: prior, value } : prior === "set-thickness" ? { intent: prior, value } : prior === "set-width" ? { intent: prior, value } : { intent: prior, value };
      push({
        intent: prior,
        confidence: conf,
        evidence: [`follow-up:${prior}`, "value:absolute"],
        si
      });
    } else if (e.hasSetVerb && e.selectionRef) {
      push({
        intent: "set-height",
        confidence: 0.5,
        evidence: ["value:absolute", "dimension:unknown"],
        question: `Should I set the height, the thickness, or the width to ${value} m? Tell me which.`
      });
    }
  }
  if (conversation.lastIntent === "go-to-level" && e.dimension === null && e.coords === null && tokens.length <= 3 && (conversation.pendingIntent === void 0 || !isSetIntent(conversation.pendingIntent))) {
    const numTok = tokens.find((t) => /^\d+$/.test(t));
    if (numTok !== void 0) {
      push({
        intent: "go-to-level",
        confidence: n.revision ? 0.85 : 0.78,
        evidence: ["follow-up:go-to-level"],
        si: { intent: "go-to-level", levelQuery: numTok }
      });
    }
  }
  if (conversation.lastIntent === "set-wall-type") {
    const m = /^(?:use|try|go with|make (?:it|them)|change (?:it|them) to|switch (?:it|them) to)\s+(.+)$/.exec(n.plain);
    const typeRef = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (typeRef !== void 0 && typeRef.length > 0) {
      push({
        intent: "set-wall-type",
        confidence: n.revision ? 0.9 : 0.8,
        evidence: ["follow-up:set-wall-type", `scope:${conversation.lastWallTypeScope ?? "all"}`],
        si: { intent: "set-wall-type", typeRef, scope: conversation.lastWallTypeScope ?? "all" }
      });
    }
  }
  const dupLevel = parseDuplicateLevelIntent(n.plain);
  if (dupLevel !== null) {
    push({
      intent: "duplicate-level",
      confidence: 0.9,
      evidence: ["verb:duplicate", `targets:${dupLevel.targetQueries.length}`],
      si: dupLevel
    });
  }
  if (e.levelQuery !== null && (e.hasNavVerb || short)) {
    const ev = [`level:${e.upDown ?? "explicit"}`];
    push({
      intent: "go-to-level",
      confidence: e.hasNavVerb ? 0.9 : 0.8,
      evidence: ev,
      si: { intent: "go-to-level", levelQuery: e.levelQuery }
    });
  } else if (e.levelQuery === null && (e.levelMentioned || e.upDown !== null) && e.hasNavVerb && !tokens.includes("add") && !tokens.includes("create")) {
    const names = ctx.levels.map((l) => l.name).join(", ");
    push({
      intent: "go-to-level",
      confidence: 0.55,
      evidence: ["level:unresolved"],
      question: ctx.levels.length === 0 ? 'No levels exist in this project yet — say "add a level" first.' : `Which level should I switch to? The levels here are: ${names}.`
    });
  }
  const imperativeVerbAt = (words) => tokens.some((t, i) => i <= 1 && words.includes(t) && !n.corrected.has(i));
  const levelIsTheObject = (() => {
    const noun = e.elementNoun ?? null;
    if (noun !== null && noun !== "level" && noun !== "floor") return false;
    if (tokens.some((t) => [
      "view",
      "views",
      "sheet",
      "sheets",
      "plan",
      "plans",
      "schedule",
      "schedules",
      "drawing",
      "drawings",
      "elevation",
      "section"
    ].includes(t))) {
      return false;
    }
    const li = tokens.findIndex((t) => t === "level" || t === "levels");
    if (li <= 0) return li === 0;
    const before = tokens[li - 1];
    return !["between", "in", "on", "across", "all", "every", "each", "both"].includes(before);
  })();
  const LEVEL_NOUNS = ["level", "levels", "floor", "floors", "storey", "storeys", "story", "stories"];
  const countedPlural = tokens.some(
    (t, i) => /^\d+$/.test(t) && i + 1 < tokens.length && LEVEL_NOUNS.includes(tokens[i + 1])
  );
  if ((tokens.includes("level") || tokens.includes("levels")) && levelIsTheObject && !countedPlural && (imperativeVerbAt(["add", "create"]) || (tokens.includes("new") || tokens.includes("another")) && e.hasSetVerb && imperativeVerbAt(["make", "set", "change", "build", "add", "create"])) && !e.hasNavVerb) {
    const elevation = e.measurements[0];
    push({
      intent: "add-level",
      confidence: 0.9,
      evidence: ["verb:add", "noun:level"],
      si: { intent: "add-level", ...elevation !== void 0 && !e.relativeBy ? { elevation } : {} }
    });
  }
  if (e.elementNoun === "wall" && (tokens.includes("create") || tokens.includes("draw") || tokens.includes("build") || (tokens.includes("add") || tokens.includes("make")) && e.determinerNew)) {
    const heightVal = e.dimension === "height" ? e.measurements[0] : void 0;
    push({
      intent: "create-wall",
      confidence: e.coords !== null ? 0.92 : 0.82,
      evidence: ["verb:create", "noun:wall", e.coords !== null ? "coords:present" : "coords:missing"],
      si: {
        intent: "create-wall",
        ...e.coords !== null ? { start: e.coords.start, end: e.coords.end } : {},
        ...heightVal !== void 0 ? { height: heightVal } : {}
      }
    });
  }
  const curtainWallParameter = parseCurtainWallParameterIntent(n.plain, ctx);
  if (curtainWallParameter !== null) {
    push({
      intent: "set-curtain-wall-parameter",
      confidence: 0.97,
      evidence: [
        "noun:curtain-wall",
        `parameter:${curtainWallParameter.parameter}`,
        `scope:${scopeTag(curtainWallParameter.scope)}`
      ],
      si: { intent: "set-curtain-wall-parameter", ...curtainWallParameter }
    });
  }
  const wallSideFinish = parseWallSideFinishIntent(
    n.plain,
    (r) => resolveFinishRef(r) !== null,
    ctx.resolveWallSystemType,
    ctx,
    // §RACSIDE144 (L-12365) — same ambiguity-aware scan as the tier-0 matcher.
    (r) => finishRefCandidates(r).length > 0,
    // §OVERCLAIM158 (L-12583) — same CURATED-alias gate as the tier-0 matcher,
    // through the SAME shared parser; see its own comment for why.
    isCanonicalFinishAlias
  );
  if (wallSideFinish !== null) {
    push({
      intent: "set-wall-side-finish",
      confidence: 0.96,
      evidence: ["verb:finish", "noun:wall", `side:${wallSideFinish.side}`, `scope:${scopeTag(wallSideFinish.scope)}`],
      si: wallSideFinish
    });
  }
  const floorFinish = parseFloorFinishIntent(
    n.plain,
    (r) => resolveFinishRef(r) !== null,
    (r) => finishRefCandidates(r).length > 0,
    ctx
  );
  if (floorFinish !== null) {
    push({
      intent: "set-floor-finish",
      confidence: 0.96,
      evidence: ["verb:finish", "noun:floor", `scope:${scopeTag(floorFinish.scope)}`],
      si: floorFinish
    });
  }
  const wallColor = parseWallColorIntent(n.plain, ctx);
  if (wallColor !== null) {
    push({
      intent: "set-wall-color",
      confidence: 0.95,
      evidence: ["verb:paint", "noun:wall", `scope:${scopeTag(wallColor.scope)}`],
      si: wallColor
    });
  }
  const wallRake = parseWallRakeIntent(n.plain, ctx);
  if (wallRake !== null) {
    push({
      intent: "set-wall-rake",
      confidence: 0.95,
      evidence: ["verb:rake", "noun:wall", `scope:${scopeTag(wallRake.scope)}`],
      si: wallRake
    });
  }
  const windowType = parseWindowTypeIntent(n.plain, ctx);
  if (windowType !== null) {
    push({
      intent: "set-window-type",
      confidence: 0.95,
      evidence: ["verb:change", "noun:window", `scope:${scopeTag(windowType.scope)}`],
      si: windowType
    });
  }
  const doorType = parseDoorTypeIntent(n.plain, ctx);
  if (doorType !== null) {
    push({
      intent: "set-door-type",
      confidence: 0.95,
      evidence: ["verb:change", "noun:door", `scope:${scopeTag(doorType.scope)}`],
      si: doorType
    });
  }
  const wallLayer = parseAddWallLayerIntent(n.plain, ctx);
  if (wallLayer !== null) {
    push({
      intent: "add-wall-layer",
      confidence: 0.95,
      evidence: ["noun:layer", `side:${wallLayer.side}`, `scope:${scopeTag(wallLayer.scope)}`],
      si: wallLayer
    });
  }
  const genBuilding = parseGenerateBuildingIntent(n.plain);
  if (genBuilding !== null) {
    push({
      intent: "generate-building",
      confidence: 0.95,
      evidence: ["verb:generate", `typology:${genBuilding.typology}`, `floors:${genBuilding.floors ?? "default"}`],
      si: genBuilding
    });
  }
  const aptLayout = parseApartmentLayoutIntent(n.plain, ctx);
  if (aptLayout !== null) {
    push({
      intent: "generate-apartment-layout",
      confidence: 0.95,
      evidence: ["verb:generate", "noun:apartment", `bedrooms:${aptLayout.bedrooms ?? "default"}`],
      si: aptLayout
    });
  }
  const finishChain = parseFinishChainIntent(n.plain);
  if (finishChain !== null) {
    push({
      intent: "finish-apartment-chain",
      confidence: 0.96,
      evidence: ["verb:finish", `layout:${finishChain.withLayout}`],
      si: finishChain
    });
  }
  const roomFinish = parseRoomFinishIntent(n.plain);
  if (roomFinish !== null) {
    push({
      intent: "generate-room-finishes",
      confidence: 0.95,
      evidence: [
        `steps:${roomFinish.steps.join("+")}`,
        `scope:${scopeTag(roomFinish.scope)}`
      ],
      si: roomFinish
    });
  }
  const winParam = parseWindowsParametricIntent(n.plain);
  if (winParam !== null) {
    push({
      intent: "create-windows-parametric",
      confidence: 0.95,
      evidence: ["verb:create", "noun:window", `scope:${scopeTag(winParam.scope)}`],
      si: winParam
    });
  }
  const wallType = parseWallTypeIntent(n.plain, ctx);
  if (wallType !== null && wallColor === null) {
    push({
      intent: "set-wall-type",
      confidence: 0.92,
      evidence: ["verb:retype", "noun:wall", `scope:${scopeTag(wallType.scope)}`],
      si: wallType
    });
  }
  if (tokens.includes("rename") || tokens.includes("call") && tokens.includes("room")) {
    const nameMatch = /(?:\bto\b|\bas\b)\s+(.+)$/.exec(n.text) ?? /\broom\b\s+(?:the\s+)?(.+)$/.exec(n.text);
    const name = nameMatch?.[1]?.trim();
    push({
      intent: "rename-room",
      confidence: name !== void 0 && name.length > 0 ? 0.9 : 0.8,
      evidence: ["verb:rename"],
      si: { intent: "rename-room", ...name !== void 0 && name.length > 0 ? { name } : {} }
    });
  }
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.confidence > best.confidence) best = c;
  return best;
}
const PAYLOAD_MEASUREMENT_KEYS = ["height", "thickness", "width", "sillHeight"];
function noteResolution(prev, resolution) {
  switch (resolution.kind) {
    case "commands": {
      let measurement;
      const payload = resolution.commands[0]?.payload;
      if (payload !== void 0) {
        for (const key of PAYLOAD_MEASUREMENT_KEYS) {
          const v = payload[key];
          if (typeof v === "number") {
            measurement = v;
            break;
          }
        }
        const params = payload["parameters"];
        if (measurement === void 0 && typeof params === "object" && params !== null) {
          const h = params["height"];
          if (typeof h === "number") measurement = h;
        }
      }
      let wallTypeScope;
      if (resolution.intent === "set-wall-type" && payload !== void 0) {
        wallTypeScope = payload["wallIds"] === "all" ? "all" : "selection";
      }
      return {
        lastIntent: resolution.intent,
        ...measurement !== void 0 ? { lastMeasurement: measurement } : {},
        ...wallTypeScope !== void 0 ? { lastWallTypeScope: wallTypeScope } : {},
        ...prev.lastLevelId !== void 0 ? { lastLevelId: prev.lastLevelId } : {}
      };
    }
    case "local":
      return {
        lastIntent: resolution.intent,
        ...resolution.action === "setActiveLevel" && resolution.levelId !== void 0 ? { lastLevelId: resolution.levelId } : prev.lastLevelId !== void 0 ? { lastLevelId: prev.lastLevelId } : {},
        ...prev.lastMeasurement !== void 0 ? { lastMeasurement: prev.lastMeasurement } : {}
      };
    case "refusal":
      return { ...prev, lastIntent: resolution.intent };
    case "miss":
      return prev;
  }
}
function scopeTag(scope) {
  if (typeof scope === "string") return scope;
  if (typeof scope === "object" && scope !== null && "kind" in scope) {
    return String(scope.kind);
  }
  return "unknown";
}
function resolveNaturalLanguage(utterance, ctx) {
  return tracer().startActiveSpan("pryzm.ai.chat.resolve", (span) => {
    try {
      span.setAttribute("pryzm.ai.chat.mode", "local-natural-language");
      const conversation = ctx.conversation ?? {};
      const n = normalizeNatural(utterance);
      const miss = (extraEvidence, confidence = 0) => ({
        kind: "miss",
        confidence,
        evidence: [...n.evidence, ...extraEvidence],
        conversation
      });
      let result;
      const first = n.tokens[0];
      const nonImperative = nonImperativeReason(utterance);
      if (n.text.length === 0) {
        result = miss(["empty"]);
      } else if (nonImperative !== null) {
        result = miss([nonImperative]);
      } else if (first !== void 0 && INTERROGATIVES.has(first)) {
        result = miss(["interrogative"]);
      } else {
        const entities = extractEntities(n, ctx);
        const best = classify(n, entities, ctx);
        if (best === null) {
          result = miss(["no-intent-evidence"]);
        } else {
          const confidence = Math.max(0, Math.min(1, best.confidence - n.typoCount * 0.04));
          const evidence = [...n.evidence, ...best.evidence];
          const resolveFloor = best.si?.intent === "delete-selected" ? CONFIDENCE_THRESHOLDS.resolveDestructive : CONFIDENCE_THRESHOLDS.resolve;
          const gate = best.si !== void 0 ? ladderGateReason(utterance, best.si.intent) : null;
          if (gate !== null) {
            result = miss([gate === "visibility" ? "visibility-query" : "property-not-element"]);
          } else if (best.si !== void 0 && confidence >= resolveFloor) {
            const applied = applySemanticIntent(best.si, ctx);
            const resolution = applied.kind === "refusal" ? applied : { ...applied, tier: "nl" };
            const si = best.si;
            const nextConversation = {
              lastIntent: si.intent,
              ...ctx.selection.length > 0 ? { lastReferencedElements: [...ctx.selection] } : {},
              // RAC U8.1 — the scope union widened to IntentScope, but this
              // memory exists for the bare follow-up ("and the ones on level
              // 2?" is a NEW scope, not a remembered one). Only the two
              // scope-WORD forms are carried forward; a spatial or filtered
              // scope is deliberately not re-applied to the next sentence,
              // which would silently widen or narrow what the user asked.
              ...si.intent === "set-wall-type" && typeof si.scope === "string" ? { lastWallTypeScope: si.scope } : {},
              // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3416) — `si.value` may now be a WORD, and a
              // word is NOT a measurement. `lastMeasurement` exists so a bare follow-up
              // ("and 200?") can reuse the last NUMBER; carrying "outdoor" into it would
              // make the next bare numeric follow-up read a string, which is precisely the
              // "failure and a legitimate value share one slot" shape
              // ([[context-data-honesty-family]]). An enum intent therefore leaves the
              // remembered measurement ALONE rather than overwriting it with something the
              // follow-up grammar cannot use.
              ..."value" in si && typeof si.value === "number" ? { lastMeasurement: si.value } : conversation.lastMeasurement !== void 0 ? { lastMeasurement: conversation.lastMeasurement } : {},
              ...applied.kind === "local" && applied.action === "setActiveLevel" && applied.levelId !== void 0 ? { lastLevelId: applied.levelId } : conversation.lastLevelId !== void 0 ? { lastLevelId: conversation.lastLevelId } : {}
            };
            result = {
              kind: "resolved",
              intent: si.intent,
              resolution,
              semanticIntent: si,
              confidence,
              evidence,
              conversation: nextConversation
            };
          } else if (confidence >= CONFIDENCE_THRESHOLDS.clarify) {
            const question = best.question ?? (best.si?.intent === "delete-selected" ? 'Do you want me to delete the current selection? Say "delete selected" to confirm.' : CLARIFY_QUESTIONS[best.intent] ?? "Can you give me a bit more detail?");
            result = {
              kind: "clarification",
              intent: best.intent,
              question,
              confidence,
              evidence: [...evidence, "clarify"],
              conversation: { ...conversation, lastIntent: best.intent, pendingIntent: best.intent }
            };
          } else {
            result = miss(["low-confidence", ...best.evidence], confidence);
          }
        }
      }
      span.setAttribute("pryzm.ai.chat.kind", result.kind);
      span.setAttribute("pryzm.ai.chat.confidence", result.confidence);
      if (result.kind !== "miss") span.setAttribute("pryzm.ai.chat.intent", result.intent);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

const PLAN_CONNECTIVE = /(?:\s*[,;.]\s*(?:and\s+)?then\b|\s+and\s+then\b|\s*[,;.]\s*after\s+that\b,?|\s+after\s+that\b,?|\s+then\b|\s*;\s*)/i;
const PLAN_CONNECTIVE_G = new RegExp(PLAN_CONNECTIVE.source, "gi");
const CLAUSE_LEAD = /^(?:and\s+|then\s+|next[,]?\s+|after\s+that[,]?\s+|first[,]?\s+|finally[,]?\s+|also[,]?\s+)+/i;
const CLAUSE_PRONOUN = /\b(?:it|them|that one|those)\b/i;
function splitPlanClauses(utterance) {
  const text = utterance.trim().replace(/[.!?]+$/, "");
  PLAN_CONNECTIVE_G.lastIndex = 0;
  if (!PLAN_CONNECTIVE_G.test(text)) return [];
  return text.split(new RegExp(PLAN_CONNECTIVE.source, "i")).map((c) => c.replace(/^[\s,;.]+/, "").replace(/[\s,;.]+$/, "").replace(CLAUSE_LEAD, "").trim()).filter((c) => c.length > 0);
}
function stepHandover(si, ctx, levels) {
  const none = { subject: null, addedLevel: null };
  if (si.intent === "duplicate-level") {
    const last = si.targetQueries[si.targetQueries.length - 1];
    if (last === void 0) return none;
    const hit = findLevel(last, levels);
    return { subject: hit !== void 0 ? hit.name : `level ${last}`, addedLevel: null };
  }
  if (si.intent === "add-level") {
    const applied = applySemanticIntent(si, { ...ctx, levels });
    if (applied.kind !== "commands") return none;
    const p = applied.commands.find((c) => c.type === "level.add")?.payload;
    const id = p?.["levelId"];
    const name = p?.["name"];
    if (typeof id !== "string" || typeof name !== "string") return none;
    const elevation = p?.["elevation"];
    return {
      subject: name,
      addedLevel: { id, name, ...typeof elevation === "number" ? { elevation } : {} }
    };
  }
  return none;
}
function clauseIntent(clause, ctx) {
  const tier01 = resolveUtteranceIntent(clause, ctx);
  if (tier01 !== null) return tier01;
  const nl = resolveNaturalLanguage(clause, ctx);
  return nl.kind === "resolved" ? nl.semanticIntent : null;
}
function singleLadderClaimsWhole(utterance, ctx) {
  if (resolveUtterance(utterance, ctx).kind !== "miss") return true;
  return resolveNaturalLanguage(utterance, ctx).kind === "resolved";
}
function parsePlanIntent(utterance, ctx) {
  const clauses = splitPlanClauses(utterance);
  if (clauses.length < 2) return { kind: "not-a-plan" };
  const steps = [];
  const kept = [];
  let levels = ctx.levels;
  let subject = null;
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const where = `Step ${i + 1} — "${clause}"`;
    if (descriptiveReportReason(clause) !== null) {
      return {
        kind: "refusal",
        reason: `${where} reads like a report of something that already happened, not an instruction — so I will not act on it, and I did not run any of the other steps either.`,
        suggestions: []
      };
    }
    const nonImperative = nonImperativeReason(clause);
    if (nonImperative !== null) {
      return {
        kind: "refusal",
        reason: `${where} is ${nonImperative === "interrogative" ? "a question" : `${nonImperative}`}, not an instruction — nothing in the plan was run.`,
        suggestions: []
      };
    }
    const clauseCtx = { ...ctx, levels };
    const readings = [clause];
    if (i > 0 && subject !== null && CLAUSE_PRONOUN.test(clause)) {
      readings.push(clause.replace(CLAUSE_PRONOUN, subject));
    }
    let si = null;
    let fallback = null;
    for (const reading of readings) {
      const candidate = clauseIntent(reading, clauseCtx);
      if (candidate === null) continue;
      fallback ??= candidate;
      if (applySemanticIntent(candidate, clauseCtx).kind !== "refusal") {
        si = candidate;
        break;
      }
    }
    si ??= fallback;
    if (si === null) {
      if (singleLadderClaimsWhole(utterance, ctx)) return { kind: "not-a-plan" };
      return {
        kind: "refusal",
        reason: `${where} is not something I know how to do${CLAUSE_PRONOUN.test(clause) && subject === null ? ` — and I could not tell what "it" refers to` : ""}. Nothing in the plan was run.`,
        suggestions: []
      };
    }
    if (si.intent === "execute-plan") {
      return { kind: "refusal", reason: `${where} is itself a plan — I run one plan at a time.`, suggestions: [] };
    }
    steps.push(si);
    kept.push(clause);
    const handover = stepHandover(si, ctx, levels);
    subject = handover.subject;
    if (handover.addedLevel !== null) levels = [...levels, handover.addedLevel];
  }
  return { kind: "plan", intent: { intent: "execute-plan", steps, clauses: kept } };
}
function resolveCompoundUtterance(utterance, ctx) {
  const parsed = parsePlanIntent(utterance, ctx);
  if (parsed.kind === "not-a-plan") return null;
  if (parsed.kind === "refusal") {
    return {
      kind: "refusal",
      intent: "execute-plan",
      reason: parsed.reason,
      suggestions: parsed.suggestions
    };
  }
  const applied = applySemanticIntent(parsed.intent, ctx);
  return applied.kind === "refusal" ? applied : { ...applied, tier: 0 };
}

function shapeOf(value) {
  if (value === null) return { k: "prim", t: "null" };
  if (Array.isArray(value)) return { k: "array", of: value.map(shapeOf) };
  if (typeof value === "object") {
    const fields = /* @__PURE__ */ new Map();
    for (const [k, v] of Object.entries(value)) {
      fields.set(k, [shapeOf(v)]);
    }
    return { k: "object", fields };
  }
  if (typeof value === "number") return { k: "prim", t: "number" };
  if (typeof value === "boolean") return { k: "prim", t: "boolean" };
  return { k: "prim", t: "string" };
}
function unionShapes(a, b) {
  const out = [...a];
  for (const s of b) {
    const existing = out.findIndex((o) => o.k === s.k);
    if (existing < 0) {
      out.push(s);
      continue;
    }
    const cur = out[existing];
    if (cur.k === "prim" && s.k === "prim") {
      if (cur.t !== s.t) out.push(s);
      continue;
    }
    if (cur.k === "array" && s.k === "array") {
      out[existing] = { k: "array", of: unionShapes(cur.of, s.of) };
      continue;
    }
    if (cur.k === "object" && s.k === "object") {
      const fields = new Map(cur.fields);
      for (const [key, shapes] of s.fields) {
        fields.set(key, unionShapes(fields.get(key) ?? [], shapes));
      }
      out[existing] = { k: "object", fields };
    }
  }
  return out;
}
function matchesShape(value, accepted) {
  return accepted.some((s) => matchesOne(value, s));
}
function matchesOne(value, s) {
  if (s.k === "prim") {
    if (s.t === "null") return value === null;
    return value !== null && typeof value === s.t;
  }
  if (s.k === "array") {
    if (!Array.isArray(value)) return false;
    return value.every((v) => s.of.length === 0 || matchesShape(v, s.of));
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [k, v] of Object.entries(value)) {
    const accepted = s.fields.get(k);
    if (accepted === void 0) return false;
    if (!matchesShape(v, accepted)) return false;
  }
  return true;
}
const shapeCache = /* @__PURE__ */ new Map();
function resetPlannerShapeCache() {
  shapeCache.clear();
}
function ladderIntent(utterance, ctx) {
  try {
    const tier01 = resolveUtteranceIntent(utterance, ctx);
    if (tier01 !== null) return tier01;
    const nl = resolveNaturalLanguage(utterance, ctx);
    return nl.kind === "resolved" ? nl.semanticIntent : null;
  } catch {
    return null;
  }
}
function allFieldShapes(ctx) {
  if (shapeCache.size > 0) return shapeCache;
  const acc = /* @__PURE__ */ new Map();
  const note = (si) => {
    const rec = acc.get(si.intent) ?? /* @__PURE__ */ new Map();
    for (const [k, v] of Object.entries(si)) {
      if (k === "intent") continue;
      rec.set(k, unionShapes(rec.get(k) ?? [], [shapeOf(v)]));
    }
    acc.set(si.intent, rec);
  };
  for (const cap of allChatCapabilities()) {
    acc.set(cap.id, acc.get(cap.id) ?? /* @__PURE__ */ new Map());
    note(cap.probe);
    for (const example of cap.examples) {
      const si = ladderIntent(example, ctx);
      if (si !== null) note(si);
    }
  }
  for (const cap of allChatCapabilities()) {
    const rec = acc.get(cap.id);
    if (rec === void 0 || !rec.has("scope")) continue;
    rec.set("scope", unionShapes(rec.get("scope") ?? [], declaredScopeShapes(cap)));
  }
  for (const [id, rec] of acc) shapeCache.set(id, rec);
  return shapeCache;
}
function declaredScopeShapes(cap) {
  const out = [];
  for (const mode of scopeModesOf(cap)) {
    switch (mode) {
      case "all":
      case "selection":
      case "global":
        out.push(shapeOf(mode));
        out.push(shapeOf({ kind: mode }));
        break;
      case "level":
        out.push(shapeOf({ kind: "level", levelQuery: "2", elementKind: "wall" }));
        break;
      case "room":
        out.push(shapeOf({ kind: "room", roomRef: "kitchen", elementKind: "wall" }));
        break;
      case "orientation":
        out.push(shapeOf({ kind: "orientation", orientation: "S" }));
        break;
    }
  }
  const base = out.filter((s) => s.k === "object");
  if (base.length > 0) {
    out.push(shapeOf({
      kind: "filter",
      base: { kind: "all" },
      filters: [{ kind: "property", property: "thickness", op: ">", value: 0.3, spokenUnit: "mm" }]
    }));
    const filter = out[out.length - 1];
    if (filter.k === "object") {
      const fields = new Map(filter.fields);
      fields.set("base", unionShapes(fields.get("base") ?? [], out.slice(0, -1)));
      out[out.length - 1] = { k: "object", fields };
    }
  }
  return out;
}
function capabilityFieldShapes(id, ctx) {
  return allFieldShapes(ctx).get(id) ?? /* @__PURE__ */ new Map();
}
const VALUE_SOURCE_PHRASE = {
  measurement: "a length in METRES (SI), converted from whatever unit the user said",
  angle: "an angle in DEGREES",
  // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — a CLOSED SET OF WORDS, not a quantity. The
  // phrase deliberately tells the model the value is one of a fixed list WITHOUT naming the
  // list: the members live on the property vocabulary's own `enumSpoken` table, and a
  // second copy in a prompt string is a second place a spelling can be accepted and then
  // refused downstream. The registry's per-parameter `example` carries a concrete one.
  enumeration: "ONE WORD from a fixed set — copy the word the user said through verbatim; do not convert it or add a unit",
  "wall-system-types": "a wall type NAME from the project's wall catalogue, as the user said it",
  "window-system-types": "a window type NAME from the project's window catalogue",
  "door-system-types": "a door type NAME from the project's door catalogue",
  "slab-system-types": "a slab assembly NAME from the project's slab catalogue",
  "ceiling-system-types": "a ceiling assembly NAME from the project's ceiling catalogue",
  // §FEAT-CHAT-STAIR-TYPES (L-1441). ⭐ The wording differs from the five above
  // ON PURPOSE — it says BUILT-IN, not "the project's", because that is what
  // the source is until the editor bridge grows a stair row. A prompt that
  // over-promised here would teach the model to offer a project type the
  // resolver cannot reach.
  "stair-types": 'a BUILT-IN stair type NAME ("Monolithic Concrete", "Steel Open Riser")',
  "handrail-types": `a railing type NAME from the project's railing catalogue ("Frameless Glass Balustrade")`,
  // ⭐ §CHAT-OPENING-SHAPE (L-10945) — the phrase NAMES ITS FOUR MEMBERS, and the
  // difference from `enumeration` above (which deliberately does NOT name its list) is
  // the reason this is a source of its own: the profile axis is a CLOSED enum shipped in
  // @pryzm/geometry-wall, identical in every project, so naming it in the prompt cannot
  // drift from a project catalogue — there is no project catalogue. ⚠ The per-family
  // legality (a door may not be circular) is deliberately NOT in the phrase: it is
  // enforced in the value stage with its geometric reason, and a prompt hint would be a
  // second, weaker copy of a rule that must refuse rather than merely discourage.
  "opening-shapes": "ONE of the four opening shapes — Rectangular, Arched, Segmental or Circular — copy the word the user said through verbatim",
  // §FEAT-CHAT-LIGHTING-TYPES (L-10220). ⭐ "the catalogue" and not "the
  // project's": BUILT_IN_LIGHTING_TYPES is the WHOLE accepted set here, because
  // element.changeType's lighting branch validates against that same table. The
  // stair wording above hedges because its source is a SUBSET; this one must not,
  // or the model learns to hedge about a catalogue with nothing outside it.
  "lighting-types": 'a lighting fixture type NAME from the fixture catalogue ("Recessed Downlight", "Linear Pendant", "Brass Arc Floor Lamp")',
  // §CW90 item 5 — the curtain-wall type catalogue (live store + customs).
  "curtain-wall-types": "a curtain wall type, by catalogue name, a uniquely-matching few words of it, or id",
  finish: 'a finish name ("plaster", "limewash")',
  "project-levels": 'a level reference — a name ("Level 2") or a number ("2")',
  color: 'a colour name ("white", "light grey") or a #hex string',
  "project-rooms": 'a room reference — its name or its occupancy ("the kitchen")',
  orientation: "a compass orientation: N, E, S or W",
  "level-range": "a level range, as the two bound references",
  "user-text": "free user text (e.g. a room name), copied from the sentence",
  coordinates: "a pair of plan coordinates {x, z} in metres"
};
function scopeModesOf(cap) {
  return cap.scopeModes ?? [cap.scope];
}
function renderShape(shapes) {
  const parts = shapes.map((s) => s.k === "prim" ? s.t : s.k === "array" ? `array<${s.of.length > 0 ? renderShape(s.of) : "any"}>` : `{${[...s.fields.keys()].join(", ")}}`);
  return [...new Set(parts)].join(" | ");
}
function renderCapability(cap, ctx) {
  const shapes = capabilityFieldShapes(cap.id, ctx);
  const fields = [...shapes.entries()].map(([name, s]) => `${name}: ${renderShape(s)}`).join("; ");
  const lines = [
    `- "${cap.id}" — ${cap.description}${cap.destructive ? " [DESTRUCTIVE: the user is shown a Confirm card first]" : ""}`,
    `  applies to: ${cap.targets === "global" ? "the whole view/document" : cap.targets.join(", ")}`,
    `  fields: ${fields.length > 0 ? `{ ${fields} }` : '{ } (no fields beyond "intent")'}`
  ];
  if (cap.parameters.length > 0) {
    lines.push(`  values: ${cap.parameters.map((p) => `${p.name} (${p.required ? "required" : "optional"}) = ${VALUE_SOURCE_PHRASE[p.valueSource]}, e.g. "${p.example}"`).join(" · ")}`);
  }
  lines.push(`  scope may be: ${scopeModesOf(cap).join(", ")}`);
  lines.push(`  examples: ${cap.examples.map((e) => `"${e}"`).join(" · ")}`);
  return lines.join("\n");
}
function buildPlannerVocabulary(ctx) {
  return allChatCapabilities().filter((c) => c.composite !== true).map((c) => renderCapability(c, ctx)).join("\n");
}
function buildPlannerFacts(ctx) {
  const sel = ctx.selection.length === 0 ? "nothing is selected" : `${ctx.selection.length} selected: ${ctx.selection.map((s) => s.elementType).join(", ")}`;
  const levels = ctx.levels.length === 0 ? "no levels" : ctx.levels.map((l) => `${l.name}${l.elevation === void 0 ? "" : ` @ ${l.elevation}m`}`).join(", ");
  const active = ctx.levels.find((l) => l.id === ctx.activeLevelId)?.name ?? "unknown";
  const cats = [];
  if (ctx.wallSystemTypeNames?.length) cats.push(`wall types: ${ctx.wallSystemTypeNames.join(" | ")}`);
  return [
    `Selection: ${sel}`,
    `Levels: ${levels} (active: ${active})`,
    ...cats
  ].join("\n");
}
const RESPONSE_CONTRACT = `Reply with ONE JSON object and nothing else. Two forms only:

  {"steps":[{"intent":"<id>", ...fields}, ...], "clauses":["<the user's own words for step 1>", ...]}
  {"cannot":"<one short sentence saying what the user seems to want>"}

Rules, all of them hard:
  • "intent" MUST be one of the ids listed above. Never invent an id, a verb, a
    field name or a command string. There is no free-text command form.
  • Use ONLY the field names shown for that id, with the shown value types.
  • "scope" may only be a mode the capability lists.
  • Emit ONE step per thing the user asked for, in the order they asked. Do not
    add a step they did not ask for, and never "helpfully" finish a job.
  • "clauses" must have one entry per step: the user's OWN words for that step,
    so the confirmation can quote them back.
  • If the request does not map cleanly onto these ids, return the "cannot"
    form. A wrong-but-plausible intent is far worse than an honest miss — the
    user is shown your reading and told it is not something the editor can do.
  • You do not execute anything. Every step is re-validated and may still be
    refused, and destructive steps still require the user's confirmation.`;
function buildPlannerPrompt(utterance, ctx) {
  return {
    system: "You translate a BIM editor user's sentence into the editor's OWN validated intent structures.\nYou are the LAST resort: the deterministic grammar already tried and did not recognise this sentence.\n\nCAPABILITIES (this is your complete vocabulary — nothing outside it exists):\n" + buildPlannerVocabulary(ctx) + "\n\n" + RESPONSE_CONTRACT,
    user: `Current project state:
${buildPlannerFacts(ctx)}

User said: ${utterance}`
  };
}
function stripFence(raw) {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m?.[1] ?? raw).trim();
}
function describeStep(step) {
  const id = typeof step["intent"] === "string" ? step["intent"] : "(no intent)";
  const rest = Object.entries(step).filter(([k]) => k !== "intent").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  return rest.length > 0 ? `${id}(${rest})` : id;
}
function validatePlannerOutput(raw, ctx) {
  let parsed;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return {
      kind: "rejected",
      reason: "the planner did not return a usable answer",
      understoodAs: null
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "rejected", reason: "the planner did not return a usable answer", understoodAs: null };
  }
  const obj = parsed;
  if (typeof obj["cannot"] === "string") {
    return { kind: "cannot", understoodAs: obj["cannot"] };
  }
  const rawSteps = obj["steps"];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { kind: "rejected", reason: "the planner did not return a usable answer", understoodAs: null };
  }
  const clauses = Array.isArray(obj["clauses"]) ? obj["clauses"].filter((c) => typeof c === "string") : [];
  const intents = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const where = rawSteps.length > 1 ? `step ${i + 1}` : "that";
    if (step === null || typeof step !== "object" || Array.isArray(step)) {
      return { kind: "rejected", reason: `${where} is not a valid instruction`, understoodAs: null };
    }
    const rec = step;
    const reading = describeStep(rec);
    const id = rec["intent"];
    if (typeof id !== "string") {
      return { kind: "rejected", reason: `${where} named no capability`, understoodAs: reading };
    }
    const cap = resolveChatCapability(id);
    if (cap === null) {
      return {
        kind: "rejected",
        reason: `"${id}" is not something this editor can do`,
        understoodAs: reading
      };
    }
    if (cap.composite === true) {
      return {
        kind: "rejected",
        reason: `"${id}" cannot be asked for directly — a sequence is expressed as separate steps`,
        understoodAs: reading
      };
    }
    const shapes = capabilityFieldShapes(id, ctx);
    for (const [key, value] of Object.entries(rec)) {
      if (key === "intent") continue;
      const accepted = shapes.get(key);
      if (accepted === void 0) {
        return {
          kind: "rejected",
          reason: `"${id}" has no "${key}" setting`,
          understoodAs: reading
        };
      }
      if (!matchesShape(value, accepted)) {
        return {
          kind: "rejected",
          reason: `"${key}" on "${id}" cannot be ${JSON.stringify(value)} — it must be ${renderShape(accepted)}`,
          understoodAs: reading
        };
      }
      if (key === "scope") {
        const mode = scopeModeOfValue(value);
        const declared = scopeModesOf(cap);
        if (mode !== null && !declared.includes(mode)) {
          return {
            kind: "rejected",
            reason: `"${cap.description}" does not work ${scopeModeWords(mode)} — it works on: ${declared.join(", ")}`,
            understoodAs: reading
          };
        }
      }
    }
    intents.push(rec);
  }
  return { kind: "intents", intents, clauses };
}
function scopeModeOfValue(value) {
  if (value === "all" || value === "selection" || value === "global") return value;
  if (value === null || typeof value !== "object") return null;
  const rec = value;
  const kind = rec["kind"];
  if (kind === "filter") return scopeModeOfValue(rec["base"]);
  if (kind === "level" || kind === "room" || kind === "orientation" || kind === "all" || kind === "selection") {
    return kind;
  }
  return null;
}
function scopeModeWords(mode) {
  switch (mode) {
    case "level":
      return "across a whole level";
    case "room":
      return "on the contents of a room";
    case "orientation":
      return "by façade orientation";
    case "all":
      return "across the whole project";
    case "selection":
      return "on the selection";
    case "global":
      return "on the whole document";
  }
}
async function planUtterance(utterance, ctx, deps) {
  let configured = false;
  try {
    configured = await deps.isConfigured();
  } catch {
    configured = false;
  }
  if (!configured) return { kind: "unavailable", reason: "not-configured" };
  let raw;
  try {
    raw = await deps.complete(buildPlannerPrompt(utterance, ctx));
  } catch {
    return { kind: "unavailable", reason: "relay-failed" };
  }
  const validated = validatePlannerOutput(raw, ctx);
  if (validated.kind === "rejected") {
    return { kind: "rejected", reason: validated.reason, understoodAs: validated.understoodAs };
  }
  if (validated.kind === "cannot") return { kind: "cannot", understoodAs: validated.understoodAs };
  const { intents, clauses } = validated;
  if (intents.length === 1) {
    return { kind: "intent", intent: intents[0], clauses: clauses.slice(0, 1) };
  }
  const kept = intents.map((_, i) => clauses[i] ?? utterance);
  return {
    kind: "intent",
    intent: { intent: "execute-plan", steps: intents, clauses: kept },
    clauses: kept
  };
}

const TRACER_NAME = "@pryzm/ai-host/AiBus";
const TRACER_VERSION = "0.1.0";
class AiBus {
  otelPrefix;
  now;
  listeners = /* @__PURE__ */ new Map();
  anyListeners = /* @__PURE__ */ new Set();
  cachedTracer = null;
  constructor(opts = {}) {
    this.otelPrefix = opts.otelPrefix ?? "pryzm.ai";
    this.now = opts.now ?? Date.now;
  }
  /** Subscribe to events of a specific kind. Returns a disposer. */
  on(kind, listener) {
    let set = this.listeners.get(kind);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(kind, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
  /** Subscribe to all events on the bus. Returns a disposer.
   *  Used by the public AI API forwarder (S53) to mirror events to
   *  WebSocket clients. */
  onAny(listener) {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }
  /** Emit an event. The bus stamps `atMs` from the injected clock if
   *  the caller has not. */
  emit(event) {
    const stamped = {
      kind: event.kind,
      workflow: event.workflow,
      projectId: event.projectId,
      runId: event.runId,
      payload: event.payload,
      atMs: event.atMs ?? this.now()
    };
    const set = this.listeners.get(stamped.kind);
    if (set) {
      for (const l of [...set]) {
        try {
          l(stamped);
        } catch (err) {
          this.recordListenerError(err, stamped);
        }
      }
    }
    for (const l of [...this.anyListeners]) {
      try {
        l(stamped);
      } catch (err) {
        this.recordListenerError(err, stamped);
      }
    }
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(`${this.otelPrefix}.bus.${stamped.kind}`, {
        "pryzm.ai.workflow": stamped.workflow,
        "pryzm.project.id": stamped.projectId,
        "pryzm.ai.run_id": stamped.runId
      });
    } else {
      this.tracer().startActiveSpan(
        `${this.otelPrefix}.bus.${stamped.kind}`,
        { attributes: {
          "pryzm.ai.workflow": stamped.workflow,
          "pryzm.project.id": stamped.projectId,
          "pryzm.ai.run_id": stamped.runId
        } },
        (span) => {
          span.end();
        }
      );
    }
    return stamped;
  }
  /** Drop every listener. Test-only. */
  _clear() {
    this.listeners.clear();
    this.anyListeners.clear();
  }
  /** Diagnostic — total registered listeners (per-kind + any). */
  listenerCount() {
    let n = this.anyListeners.size;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
  tracer() {
    this.cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
    return this.cachedTracer;
  }
  recordListenerError(err, ev) {
    if (typeof console !== "undefined") {
      console.error(
        `[ai-host/AiBus] listener for '${ev.kind}' (workflow=${ev.workflow} run=${ev.runId}) threw:`,
        err
      );
    }
  }
}

class WorkflowRegistry {
  map = /* @__PURE__ */ new Map();
  /** Register a workflow. Throws if `descriptor.id` is already taken
   *  (collision is loud, not silent). */
  register(descriptor, impl) {
    if (this.map.has(descriptor.id)) {
      throw new Error(`[ai-host/WorkflowRegistry] '${descriptor.id}' is already registered.`);
    }
    if (!isValidDescriptor(descriptor)) {
      throw new Error(`[ai-host/WorkflowRegistry] descriptor for '${descriptor.id}' is invalid.`);
    }
    this.map.set(descriptor.id, Object.freeze({ descriptor, impl }));
  }
  /** Get a workflow entry by id. */
  get(id) {
    return this.map.get(id);
  }
  /** True iff a workflow with this id is registered. */
  has(id) {
    return this.map.has(id);
  }
  /** Snapshot of all registered descriptors, in registration order.
   *  Excludes the impl so the snapshot is safe to serialise to the
   *  public AI API. */
  list() {
    const out = [];
    for (const entry of this.map.values()) out.push(entry.descriptor);
    return out;
  }
  /** Total registered workflows — diagnostic. */
  size() {
    return this.map.size;
  }
  /** Test-only — clears the registry. */
  _clear() {
    this.map.clear();
  }
}
function isValidDescriptor(d) {
  if (typeof d.id !== "string" || d.id.length === 0) return false;
  if (typeof d.title !== "string" || d.title.length === 0) return false;
  if (typeof d.kind !== "string" || d.kind.length === 0) return false;
  if (typeof d.estimatedCostUsd !== "number" || d.estimatedCostUsd < 0) return false;
  if (d.estimatedCostUsd > 0.18) return false;
  return true;
}

class AiPlane {
  bus;
  approvalQueue;
  costMeter;
  workflowRegistry;
  deps;
  _runSeq = 0;
  _batchSeq = 0;
  constructor(deps) {
    this.deps = deps;
    this.bus = deps.bus ?? new AiBus({ otelPrefix: "pryzm.ai" });
    this.approvalQueue = deps.approvalQueue;
    this.costMeter = deps.costMeter;
    this.workflowRegistry = deps.workflowRegistry ?? new WorkflowRegistry();
  }
  /** Register a workflow with the plane. Convenience pass-through to
   *  the workflow registry; matches the spec API on §S49 line 129. */
  registerWorkflow(descriptor, impl) {
    this.workflowRegistry.register(descriptor, impl);
  }
  /** Submit a workflow run. Returns the resulting AiPendingAction
   *  (which may have `status: 'rejected'` if the budget gate denied
   *  the call pre-flight).
   *
   *  ADR-050 cache path (inserted BEFORE step 1 — budget check):
   *  1. Compute SHA-256 of `{workflow, input}` → contentHash.
   *  2. Check `deps.responseCache` for a matching entry.
   *  3. Cache HIT → emit `workflow.cacheHit`, build synthetic pending
   *     action, enqueue, return.  No budget check; no impl call;
   *     no `CostMeter.recordCall`; no `ai_usage` row (C09 §2.3).
   *  4. Cache MISS → run normal pipeline; store result after success.
   *
   *  The entire budget→impl→record→enqueue pipeline runs inside a
   *  `withWorkflowSpan` span so every `AiBus.emit()` call during the
   *  pipeline annotates the SAME span via `addEvent` (correct OTel
   *  semantics — bus events are sub-ms and belong as span events, not
   *  zero-duration child spans). */
  async submit(opts) {
    const entry = this.workflowRegistry.get(opts.workflow);
    if (!entry) {
      throw new Error(`[ai-host/AiPlane] workflow '${opts.workflow}' is not registered.`);
    }
    return withWorkflowSpan(entry.descriptor.kind, async () => {
      const runId = opts.runId ?? this.nextRunId();
      const projectId = opts.projectId;
      const actorId = opts.actorId;
      const plan = opts.plan ?? "personal";
      let cacheHash = null;
      if (this.deps.responseCache) {
        try {
          cacheHash = await hashWorkflowRequest(opts.workflow, opts.input);
          const cacheKey = {
            tenantId: projectId,
            contentHash: cacheHash,
            modelVersion: entry.descriptor.id
          };
          const cached = await this.deps.responseCache.get(cacheKey);
          if (cached !== null) {
            this.bus.emit({
              kind: "workflow.cacheHit",
              workflow: opts.workflow,
              projectId,
              runId,
              payload: { contentHash: cacheHash, modelVersion: entry.descriptor.id }
            });
            const cachedAction = {
              id: `${runId}-pending`,
              runId,
              workflow: entry.descriptor.kind,
              proposedCommands: cached.proposedCommands,
              estimatedCostUsd: 0,
              ...cached.preview ? { preview: cached.preview } : {},
              createdAt: this.now(),
              status: "pending",
              ...opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {}
            };
            this.approvalQueue.enqueue(cachedAction);
            return cachedAction;
          }
        } catch (cacheErr) {
          if (typeof console !== "undefined") {
            console.warn("[ai-host/AiPlane] cache lookup failed (non-fatal):", cacheErr);
          }
          cacheHash = null;
        }
      }
      const estimated = opts.estimatedCostUsd ?? entry.descriptor.estimatedCostUsd;
      const budget = await this.costMeter.preCheckBudget(projectId, estimated);
      if (!budget.ok) {
        this.bus.emit({
          kind: "workflow.reject",
          workflow: opts.workflow,
          projectId,
          runId,
          payload: { reason: budget.reason ?? "budget exceeded", estimatedCostUsd: estimated }
        });
        const rejected = {
          id: `rej-${runId}`,
          runId,
          workflow: entry.descriptor.kind,
          proposedCommands: [],
          estimatedCostUsd: estimated,
          createdAt: this.now(),
          status: "rejected"
        };
        this.approvalQueue.enqueue(rejected);
        return rejected;
      }
      this.bus.emit({
        kind: "workflow.start",
        workflow: opts.workflow,
        projectId,
        runId,
        payload: { input: opts.input ?? null, plan, actorId }
      });
      const ctx = {
        runId,
        projectId,
        actorId,
        plan,
        input: opts.input ?? null,
        bus: this.bus,
        now: () => this.now()
      };
      let result;
      const t0 = this.now();
      try {
        result = await entry.impl(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.bus.emit({
          kind: "workflow.error",
          workflow: opts.workflow,
          projectId,
          runId,
          // S54 D1 — when the run is part of a batch, propagate the
          // `aiBatchId` so subscribers can correlate the failure with
          // the rest of the batch.
          payload: { error: message, ...opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {} }
        });
        throw err;
      }
      const latencyMs = this.now() - t0;
      try {
        await this.costMeter.recordCall(
          opts.workflow,
          projectId,
          result.actualCostUsd ?? estimated,
          latencyMs,
          {
            actorId,
            plan,
            surface: entry.descriptor.surface ?? `ai.workflow.${entry.descriptor.kind}`
          }
        );
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[ai-host/AiPlane] CostMeter.recordCall failed (non-fatal):", err);
        }
      }
      if (cacheHash && this.deps.responseCache) {
        this.deps.responseCache.set(
          { tenantId: projectId, contentHash: cacheHash, modelVersion: entry.descriptor.id },
          result,
          7
        ).catch((storeErr) => {
          if (typeof console !== "undefined") {
            console.warn("[ai-host/AiPlane] cache store failed (non-fatal):", storeErr);
          }
        });
      }
      const action = {
        id: `${runId}-pending`,
        runId,
        workflow: entry.descriptor.kind,
        proposedCommands: result.proposedCommands,
        estimatedCostUsd: result.actualCostUsd ?? estimated,
        ...result.preview ? { preview: result.preview } : {},
        createdAt: this.now(),
        status: "pending",
        ...opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {}
      };
      this.bus.emit({
        kind: "workflow.propose",
        workflow: opts.workflow,
        projectId,
        runId,
        payload: { actionId: action.id, latencyMs, costUsd: action.estimatedCostUsd }
      });
      this.approvalQueue.enqueue(action);
      return action;
    });
  }
  /** Helper for the host integration — exposes the bus for `getAiHost()`
   *  callers wiring approval-queue committers. */
  emitCommit(workflow, projectId, runId, payload) {
    this.bus.emit({ kind: "workflow.commit", workflow, projectId, runId, payload });
  }
  /** S54 D1 — submit multiple workflow runs as one undo batch.
   *
   *  Every resulting `AiPendingAction` carries the same `aiBatchId`
   *  so the editor's command-bus history can collapse them into a
   *  single undo entry on commit.  Runs execute serially to preserve
   *  cost-meter ordering + bus event order; if one run throws, prior
   *  pending actions are still returned (partial-success — the caller
   *  decides whether to commit or discard them).
   *
   *  The plane emits `workflow.batchStart` before the first submit
   *  and `workflow.batchEnd` after the last (with a `succeeded` /
   *  `failed` count summary).  Both events carry `aiBatchId` in their
   *  payload so subscribers can correlate per-workflow events that
   *  share the id.
   *
   *  Spec source: `docs/00_NEW_ARCHITECTURE/10-MASTER-IMPLEMENTATION-PLAN-36M.md`
   *  §6.1 row S54 — "All AI mutations are command batches; appear as
   *  one undo entry; audit trail complete". */
  async executeBatch(batch, opts = {}) {
    if (batch.length === 0) return [];
    const aiBatchId = opts.aiBatchId ?? this.nextBatchId();
    const batchProjectId = opts.projectId ?? batch[0].projectId;
    const batchRunId = `batch-${aiBatchId}`;
    this.bus.emit({
      kind: "workflow.batchStart",
      workflow: "ai.batch",
      projectId: batchProjectId,
      runId: batchRunId,
      payload: { aiBatchId, runCount: batch.length }
    });
    const out = [];
    let succeeded = 0;
    let failed = 0;
    for (const submitOpts of batch) {
      try {
        const action = await this.submit({ ...submitOpts, aiBatchId });
        out.push(action);
        succeeded += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (typeof console !== "undefined") {
          console.warn(
            `[ai-host/AiPlane] executeBatch: submit('${submitOpts.workflow}') threw (partial-batch failure):`,
            msg
          );
        }
        failed += 1;
      }
    }
    this.bus.emit({
      kind: "workflow.batchEnd",
      workflow: "ai.batch",
      projectId: batchProjectId,
      runId: batchRunId,
      payload: { aiBatchId, succeeded, failed, runCount: batch.length }
    });
    return out;
  }
  now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }
  nextRunId() {
    return `run-${Date.now().toString(36)}-${(++this._runSeq).toString(36)}`;
  }
  nextBatchId() {
    return `batch-${Date.now().toString(36)}-${(++this._batchSeq).toString(36)}`;
  }
}

const PLAN_CRITIQUE_COST_USD_ESTIMATE = 0.05;
const PLAN_CRITIQUE_MAX_ITEMS = 20;

const planCritiqueDescriptor = {
  id: "plan-critique",
  title: "Critique this plan",
  // 'rules' kind because critique is diagnostic — shares the
  //  zero-mutation-on-approval contract with rule-engine outputs.
  kind: "rules",
  estimatedCostUsd: PLAN_CRITIQUE_COST_USD_ESTIMATE,
  surface: "ai.plan.critique",
  description: "Examines visible plan elements + visibility state and surfaces design-issue critiques (door clearance, corridor width, visibility flags) as zero-command proposals in the approval queue."
};
const PLAN_CRITIQUE_MODEL = "claude-haiku-4-5-20251014";
const PLAN_CRITIQUE_MAX_TOKENS = 1500;
const PLAN_CRITIQUE_SYSTEM_PROMPT = [
  "You are an architectural review assistant.",
  "Examine the supplied plan-view snapshot and visibility state, and surface design issues as a JSON array of critique items.",
  "",
  "Each item has the shape:",
  "{",
  '  "id": string,',
  '  "severity": "info" | "warning" | "error",',
  '  "category": string,',
  '  "message": string,',
  '  "locationRef": { "kind": "element", "elementId": string } | { "kind": "point", "x": number, "y": number },',
  '  "confidence": number  // 0..1',
  "}",
  "",
  "Categories you SHOULD use when applicable:",
  '  - "door-clearance"     — door swing arcs intersecting other elements.',
  '  - "corridor-width"     — circulation paths narrower than 1200 mm.',
  '  - "egress"             — reachability / dead-end issues.',
  '  - "visibility"         — elements hidden by visibility flags that probably should be visible.',
  '  - "structural"         — wall / column alignment issues.',
  "",
  "Surface every plausible issue, even at lower confidence — the user reviews each one.",
  "Cap your response at 20 items.",
  "Respond with ONLY the JSON array — no preamble, no markdown fences."
].join("\n");
function buildCritiquePrompt(snapshot, visibility) {
  const summarisedElements = snapshot.elements.map(summariseElement);
  return JSON.stringify(
    {
      viewId: snapshot.viewId,
      viewportBounds: snapshot.viewportBounds,
      pixelSize: snapshot.pixelSize,
      capturedAt: snapshot.capturedAt,
      visibility: { intent: visibility.intent, tags: visibility.tags },
      elements: summarisedElements,
      request: "Critique this plan and return a JSON array of issues."
    },
    null,
    0
  );
}
function summariseElement(el) {
  const out = {
    id: el.id,
    kind: el.kind,
    bbox: el.bbox
  };
  if (el.label !== void 0) out.label = el.label;
  if (el.centroid !== void 0) out.centroid = el.centroid;
  if (el.attrs !== void 0) out.attrs = el.attrs;
  return out;
}
function parseCritiqueItems(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (typeof console !== "undefined") {
      console.warn("[ai-host/PlanCritique] relay returned non-JSON text — dropping critique payload.");
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    if (typeof console !== "undefined") {
      console.warn("[ai-host/PlanCritique] relay returned non-array JSON — dropping critique payload.");
    }
    return [];
  }
  const out = [];
  for (const raw of parsed) {
    const item = coerceItem(raw);
    if (item) out.push(item);
    if (out.length >= PLAN_CRITIQUE_MAX_ITEMS) break;
  }
  return out;
}
function coerceItem(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw;
  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (!isSeverity(r.severity)) return null;
  if (typeof r.category !== "string" || r.category.length === 0) return null;
  if (typeof r.message !== "string" || r.message.length === 0) return null;
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) return null;
  const loc = coerceLocation(r.locationRef);
  if (!loc) return null;
  return {
    id: r.id,
    severity: r.severity,
    category: r.category,
    message: r.message,
    locationRef: loc,
    confidence: r.confidence
  };
}
function isSeverity(v) {
  return v === "info" || v === "warning" || v === "error";
}
function coerceLocation(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw;
  if (r.kind === "element" && typeof r.elementId === "string" && r.elementId.length > 0) {
    return { kind: "element", elementId: r.elementId };
  }
  if (r.kind === "point" && typeof r.x === "number" && typeof r.y === "number") {
    return { kind: "point", x: r.x, y: r.y };
  }
  return null;
}
function createPlanCritiqueImpl(deps) {
  const now = deps.now ?? (() => Date.now());
  const model = deps.model ?? PLAN_CRITIQUE_MODEL;
  return async function planCritiqueImpl(ctx) {
    const input = ctx.input ?? null;
    if (!input || !input.snapshot || !input.visibility) {
      const result2 = {
        status: "rejected",
        reason: "PlanCritique requires { snapshot, visibility } in workflow input."
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: "json", data: result2 }
      };
    }
    const userPrompt = buildCritiquePrompt(input.snapshot, input.visibility);
    const relayResp = await deps.relay.complete({
      model,
      system: PLAN_CRITIQUE_SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: PLAN_CRITIQUE_MAX_TOKENS
    });
    const items = parseCritiqueItems(relayResp.text);
    let seq = 0;
    for (const item of items) {
      const action = {
        id: `${ctx.runId}-item-${(++seq).toString(36)}`,
        runId: ctx.runId,
        workflow: planCritiqueDescriptor.kind,
        proposedCommands: [],
        // diagnostic-only per spec line 379
        estimatedCostUsd: 0,
        // per-item action carries no incremental cost
        preview: { kind: "json", data: item },
        createdAt: now(),
        status: "pending"
      };
      deps.approvalQueue.enqueue(action);
      deps.onItemEnqueued?.(action, item);
    }
    const result = {
      status: "ok",
      itemCount: items.length,
      items
    };
    return {
      proposedCommands: [],
      // parent action also zero-command
      actualCostUsd: relayResp.costUsd,
      preview: { kind: "json", data: result }
    };
  };
}

const OPTION_STYLES = [
  "minimal",
  "efficient",
  "generous"
];
const OPTION_STYLE_LABELS = {
  minimal: "Minimal",
  efficient: "Efficient",
  generous: "Generous"
};
const GENERATE_3_OPTIONS_COST_USD_ESTIMATE = 0.15;
const PER_OPTION_BUDGET_USD = 0.05;
const GENERATE_3_OPTIONS_HARD_CEILING_USD = 0.18;

const generate3OptionsDescriptor = {
  id: "generate-3-options",
  title: "Generate three options",
  // 'generative' kind — turns AI from advisor into co-author per
  // spec line 414. Approval flows commands to the command bus.
  kind: "generative",
  estimatedCostUsd: GENERATE_3_OPTIONS_COST_USD_ESTIMATE,
  surface: "ai.generate.3-options",
  description: "Fans out three parallel LLM calls (Minimal / Efficient / Generous) for a user-selected plan region; each option lands in the approval queue as a separate pending action — the user picks one (or none) to commit."
};
const GENERATE_3_OPTIONS_MODEL = "claude-haiku-4-5-20251014";
const GENERATE_3_OPTIONS_MAX_TOKENS = 1200;
const GENERATE_3_OPTIONS_SYSTEM_PROMPT = [
  "You are an architectural co-design assistant.",
  "A region of a floor plan has been selected. Propose ONE arrangement of elements that fits the requested style.",
  "",
  "Respond with a JSON object of the shape:",
  "{",
  '  "summary": string,                         // one sentence, max 80 chars',
  '  "commands": [                              // 1..20 entries',
  '    { "command": string, "payload": object } // dispatched verbatim through the command bus',
  "  ]",
  "}",
  "",
  "No preamble, no markdown fences. ONLY the JSON object.",
  'If you cannot generate a viable arrangement, respond with {"summary":"","commands":[]}.'
].join("\n");
function buildOptionPrompt(region, style) {
  const [minX, minY, maxX, maxY] = region.bounds;
  return JSON.stringify(
    {
      regionId: region.id,
      regionBoundsMm: { minX, minY, maxX, maxY },
      regionIntent: region.intent,
      visibleElementIds: region.visibleElementIds ?? [],
      requestedStyle: style,
      styleNotes: STYLE_GUIDANCE[style],
      request: `Propose a single ${style} arrangement of elements for this region.`
    },
    null,
    0
  );
}
const STYLE_GUIDANCE = {
  minimal: "Use the fewest elements possible. Prefer multi-function pieces. Maximise unobstructed floor area.",
  efficient: "Optimise for everyday use. Hit ergonomic clearances exactly. Balance furniture density with circulation.",
  generous: "Use the full region. Add comfort + storage where the budget allows. Prefer wider clearances."
};
function parseOption(text, style, costUsd) {
  if (typeof text !== "string" || text.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (typeof console !== "undefined") {
      console.warn(`[ai-host/Generate3Options] relay returned non-JSON for style '${style}' — dropping option.`);
    }
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const r = parsed;
  const summaryRaw = r.summary;
  const summary = typeof summaryRaw === "string" ? summaryRaw : "";
  const commands = parseOptionCommands(r.commands);
  const opt = {
    style,
    proposedCommands: commands,
    costUsd,
    ...summary ? { summary } : {}
  };
  return opt;
}
function parseOptionCommands(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const cmd of raw) {
    if (cmd === null || typeof cmd !== "object") continue;
    const c = cmd;
    if (typeof c.command !== "string" || c.command.length === 0) continue;
    out.push({ command: c.command, payload: c.payload });
    if (out.length >= 20) break;
  }
  return out;
}
function defaultRenderPreview(option, region) {
  const label = `${OPTION_STYLE_LABELS[option.style]}/${region.id}`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(label)}`;
}
function createGenerate3OptionsImpl(deps) {
  const now = deps.now ?? (() => Date.now());
  const model = deps.model ?? GENERATE_3_OPTIONS_MODEL;
  const renderPreview = deps.renderPreview ?? defaultRenderPreview;
  return async function generate3OptionsImpl(ctx) {
    const input = ctx.input ?? null;
    if (!input || !input.region) {
      const result2 = {
        status: "rejected",
        reason: "Generate3Options requires { region } in workflow input."
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: "json", data: result2 }
      };
    }
    const region = input.region;
    const settled = await Promise.allSettled(
      OPTION_STYLES.map(async (style) => {
        const userPrompt = buildOptionPrompt(region, style);
        const resp = await deps.relay.complete({
          model,
          system: GENERATE_3_OPTIONS_SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: GENERATE_3_OPTIONS_MAX_TOKENS
        });
        const opt = parseOption(resp.text, style, resp.costUsd);
        return { style, costUsd: resp.costUsd, option: opt };
      })
    );
    let totalCostUsd = 0;
    const validOptions = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        totalCostUsd += r.value.costUsd;
        if (r.value.option) validOptions.push(r.value.option);
      }
    }
    if (totalCostUsd > GENERATE_3_OPTIONS_HARD_CEILING_USD) {
      const refundedUsd = await deps.costMeter.refund(ctx.projectId, totalCostUsd);
      const result2 = {
        status: "rejected",
        reason: `Fan-out cost $${totalCostUsd.toFixed(4)} exceeded per-call ceiling $${GENERATE_3_OPTIONS_HARD_CEILING_USD.toFixed(2)} — refunded.`,
        refundedUsd
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        // refunded — net cost was zero
        preview: { kind: "json", data: result2 }
      };
    }
    const optionsWithPreviews = [];
    let seq = 0;
    for (const option of validOptions) {
      const previewUrl = await Promise.resolve(renderPreview(option, region));
      const optWithPreview = { ...option, previewUrl };
      const action = {
        id: `${ctx.runId}-opt-${(++seq).toString(36)}`,
        runId: ctx.runId,
        workflow: generate3OptionsDescriptor.kind,
        // 'generative'
        proposedCommands: option.proposedCommands,
        estimatedCostUsd: option.costUsd,
        preview: { kind: "image", url: previewUrl },
        createdAt: now(),
        status: "pending"
      };
      optionsWithPreviews.push(optWithPreview);
      deps.approvalQueue.enqueue(action);
      deps.onOptionEnqueued?.(action, optWithPreview);
    }
    const result = {
      status: "ok",
      totalCostUsd,
      options: optionsWithPreviews
    };
    return {
      proposedCommands: [],
      // parent action zero-command — picking happens at per-option approval
      actualCostUsd: totalCostUsd,
      preview: { kind: "json", data: result }
    };
  };
}

var define_process_env_default = {};
class MockVoiceTranscriber {
  kind = "mock";
  async transcribe(req) {
    if (!req.audio || req.audio.byteLength === 0) {
      throw new Error("[ai-host/VoiceCommand] MockVoiceTranscriber: audio buffer is empty.");
    }
    const len = req.audio.byteLength;
    let text;
    let confidence;
    if (len === 1024) {
      text = "create a wall here";
      confidence = 0.95;
    } else if (len === 2048) {
      text = "delete this column";
      confidence = 0.92;
    } else if (len === 4096) {
      text = "";
      confidence = 0.1;
    } else {
      text = "select all";
      confidence = 0.78;
    }
    return { text, confidence, costUsd: 1e-3 };
  }
}
async function loadTranscriber(opts = {}) {
  const env = opts.env ?? (typeof process !== "undefined" ? define_process_env_default : {});
  const url = env.WHISPER_TRANSCRIBER_URL;
  if (!url) return new MockVoiceTranscriber();
  try {
    const dynImport = new Function("s", "return import(s)");
    const specifier = "./WhisperTranscriber.js";
    const mod = await dynImport(specifier);
    if (mod && typeof mod.createWhisperTranscriber === "function") {
      return mod.createWhisperTranscriber(url);
    }
  } catch {
  }
  return new MockVoiceTranscriber();
}
const voiceCommandDescriptor = {
  id: "voice-command",
  title: "Voice command",
  kind: "voice",
  // Whisper-tiny on-device for first pass + ~$0.01 LLM intent
  // fallback when confidence < 0.6 = $0.02 ceiling per call.
  estimatedCostUsd: 0.02,
  surface: "ai.voice.command",
  description: "Captures a short audio clip from the mic, transcribes it (Whisper-tiny on-device), matches the resulting text against the command palette, and enqueues a confirm action so the user can approve before any state mutates."
};
let _voiceModule = null;
function getVoiceCommand() {
  if (!_voiceModule) {
    _voiceModule = __vitePreload(() => import('./VoiceCommand.impl-CVJocPvd.js'),true              ?__vite__mapDeps([11,3,4,2,5,6,7,8,9,10,1]):void 0);
  }
  return _voiceModule;
}
function _resetVoiceCommandLoaderForTesting() {
  _voiceModule = null;
}

const HABITABILITY_COVERAGE = [
  {
    countryCode: "be",
    countryName: "Belgium",
    form: "absent",
    standardIds: [],
    namedSourceToChase: `REGIONAL, not federal — three separate instruments: Flanders, Vlaamse Codex Wonen (2021) woningkwaliteitsnormen; Wallonia, Code wallon de l'Habitation durable — critères de salubrité; Brussels, Code bruxellois du Logement + the arrêté of 4 September 2003 on sécurité/salubrité/équipement. Chasing "Belgium" as one jurisdiction would be the same error as chasing "Spain" as one.`,
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/be/ holds 47 files, all planning/envelope/LOD. No legal text of any kind."
  },
  {
    countryCode: "ch",
    countryName: "Switzerland",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "CANTONAL, and partly communal — e.g. Kanton Zürich Allgemeine Bauverordnung (ABV) and the Planungs- und Baugesetz (PBG) for Wohnraum/Aufenthaltsraum requirements; SIA norms are technical, not legal. There is no federal Swiss habitability minimum to fetch.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "PRYZM already routes Swiss ZONING two ways (ch-national-grundnutzung, ch-zh-zurich-bzo). Neither says anything about rooms — envelope and habitability are different corpora from different authorities."
  },
  {
    countryCode: "de",
    countryName: "Germany",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "LÄNDER-level: the 16 Landesbauordnungen, tracking Musterbauordnung §48 (Aufenthaltsräume). ⚠ Expect a SHAPE mismatch: German law principally regulates Aufenthaltsraum HEIGHT and window area, not a per-room floor area, so several of PRYZM's rows may legitimately stay UNKNOWN for Germany even after the instrument is read. That is a correct outcome, not a failed extraction.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/de/ holds 100 files — the largest folder in the tree, and none of it is habitability."
  },
  {
    countryCode: "dk",
    countryName: "Denmark",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Bygningsreglement BR18 (Bolig- og bygningsindretning) — national, published by Bolig- og Planstyrelsen at br18.dk in machine-readable HTML, which makes this one of the cheapest rows to close.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "Denmark is PRYZM's most complete ZONING jurisdiction (dk Plandata, national extent, real dispatch). It is nonetheless at zero for habitability — the clearest single demonstration that envelope maturity does not carry over."
  },
  {
    countryCode: "es",
    countryName: "Spain",
    form: "structured",
    standardIds: ["es-29067-malaga-pgou-2018", "es-ct-decret-141-2012"],
    namedSourceToChase: `AUTONOMIC + MUNICIPAL, never national. Catalonia: Decret 141/2012 (DOGC 6245) — NAMED and seeded as CANDIDATE values, primary text still to fetch. Andalucía: the autonomic habitability regime behind the municipal PGOUs. Madrid, València, Murcia, Canarias, Balears, Aragón: one instrument each. Sevilla's own NNUU (in repo) DELEGATES its room dimensions to "la normativa de aplicación", so extracting Sevilla means chasing the instrument it defers to, not re-reading Sevilla.`,
    gapKind: "partially-extracted",
    evidencePath: "docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/corpus/NormasUrbanisticas/AD-FEB2018/12-TITULO-XII.txt",
    note: "The ONLY country with a habitability figure read from primary text held in this repo (Málaga, Art. 12.2.35, 7 room types). Sevilla's NNUU corpus is present but delegates. ⚠ 19 Spanish sub-jurisdictions are registered for ZONING and 1 has habitability — the gap between the two corpora, inside the single best-covered country, is 18."
  },
  {
    countryCode: "fi",
    countryName: "Finland",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Ympäristöministeriön asetus asuin-, majoitus- ja työtiloista (Ministry of the Environment decree on residential, accommodation and work spaces), under the Maankäyttö- ja rakennuslaki. National; published on finlex.fi.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/fi/ holds 24 files, the joint-smallest folder in the tree. No legal text."
  },
  {
    countryCode: "fr",
    countryName: "France",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Décret n° 2002-120 relatif aux caractéristiques du logement décent, and the Code de la construction et de l'habitation. National, consolidated on legifrance.gouv.fr. ⚠ Note the French floor is a DWELLING-level surface habitable + hauteur sous plafond rule, not a per-room table, so expect the same shape mismatch as Germany.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "PRYZM routes Paris zoning (fr-75056-paris, PLU bioclimatique). Habitability: nothing."
  },
  {
    countryCode: "gb",
    countryName: "United Kingdom",
    form: "structured",
    standardIds: ["gb-eng-ndss-2015"],
    namedSourceToChase: 'ENGLAND ONLY is seeded, and only as `instrument-cited`. Fetch: GOV.UK "Technical housing standards — nationally described space standard" (2015) into jurisdictions/gb/gb-eng/. Then SEPARATELY: Scotland (Building (Scotland) Regulations / Housing for Varying Needs) and Wales (Development Quality Requirements) — different regimes, neither covered by NDSS.',
    gapKind: "not-fetched",
    evidencePath: null,
    note: '⚠ THE COUNTRY WHOSE NUMBERS WERE ALREADY IN THE PRODUCT is also a country whose instrument this repo does not hold. The 11.5 / 7.5 figures shipped for a year with the label "Building Regs mandatory"; they are NDSS, and NDSS is a planning standard that binds only where adopted (L-4402).'
  },
  {
    countryCode: "it",
    countryName: "Italy",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Decreto Ministeriale Sanità 5 luglio 1975 (altezza minima interna e requisiti igienico-sanitari dei locali di abitazione), as amended, plus the per-comune Regolamento Edilizio. National floor with municipal variation — the same two-tier shape as Spain.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/it/ holds 46 files, all planning. No legal text."
  },
  {
    countryCode: "nl",
    countryName: "Netherlands",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Besluit bouwwerken leefomgeving (Bbl), which replaced Bouwbesluit 2012 — afdeling verblijfsgebied en verblijfsruimte. National; consolidated on wetten.overheid.nl.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "PRYZM routes NL zoning nationally (nl-bestemmingsplan). Habitability: nothing."
  },
  {
    countryCode: "no",
    countryName: "Norway",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Byggteknisk forskrift (TEK17), kapittel 12 — planløsning og bygningsdeler i byggverk. National; published with commentary by Direktoratet for byggkvalitet at dibk.no.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/no/ holds 37 files, all planning. No legal text."
  },
  {
    countryCode: "pt",
    countryName: "Portugal",
    form: "absent",
    standardIds: [],
    namedSourceToChase: `RGEU — Regulamento Geral das Edificações Urbanas (DL 38382/1951, partially in force), the chapters on condições de habitabilidade. Named — but NOT held — by this repo's own Portugal study, which flags it "ASSERTED-UNVERIFIED this session". Fetch from dre.pt.`,
    gapKind: "not-fetched",
    evidencePath: "docs/04-reference/jurisdictions/pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md",
    note: "THE ONLY COUNTRY OUTSIDE SPAIN WHERE THIS REPO EVEN NAMES A HABITABILITY INSTRUMENT — and it names it in one sentence of a data-sourcing study, with the instrument's own content unread. A named instrument is a work item, not coverage."
  },
  {
    countryCode: "sa",
    countryName: "Saudi Arabia",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Saudi Building Code (SBC 201 general / SBC 801 residential) and the Ministry of Municipality and Housing building requirements (اشتراطات البناء). ⚠ Access caveat carried over from L-606: Saudi planning services are IP geo-fenced, so expect an ACCESS problem on top of the sourcing one.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "PRYZM ships a Riyadh DEMO zoning pack (sa-ruh-riyadh). Habitability: nothing."
  },
  {
    countryCode: "se",
    countryName: "Sweden",
    form: "absent",
    standardIds: [],
    namedSourceToChase: "Boverkets byggregler (BBR, BFS 2011:6) avsnitt 3 — bostadsutformning, referencing SS 91 42 21. ⚠ Boverket has been replacing BBR with a new rule structure; check which edition is in force before extracting, and record the edition on the provenance.",
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/se/ holds 25 files. No legal text. (SE cadastre is separately access-gated.)"
  },
  {
    countryCode: "us",
    countryName: "United States",
    form: "absent",
    standardIds: [],
    namedSourceToChase: 'International Residential Code (IRC) R304 "Minimum Room Areas" and IBC ch. 12, AS ADOPTED AND AMENDED by each state and many cities. ⚠ There is NO national US figure to fetch: the model code is not law until adopted, and adoption edition varies by state and by city. A US row therefore needs a per-jurisdiction adoption lookup, not one document.',
    gapKind: "not-fetched",
    evidencePath: null,
    note: "jurisdictions/us/ holds 68 files. PRYZM has US PARCEL providers (NYC PLUTO, Chicago) and no US habitability data."
  }
];
function coverageFor(countryCode) {
  const cc = countryCode.trim().toLowerCase();
  return HABITABILITY_COVERAGE.find((r) => r.countryCode === cc);
}
function structuredCountryCount() {
  return HABITABILITY_COVERAGE.filter((r) => r.form === "structured").length;
}

const DEFAULT_DESIGN_PARAMS = {
  daylight: 0.5,
  privacy: 0.5,
  kitchen: 0.5,
  compactness: 0.5,
  adjacency: 0.5,
  accessibility: 0.5,
  climate: 0.5,
  space: 0.5
};
const clamp01$3 = (v) => !Number.isFinite(v) ? 0.5 : v < 0 ? 0 : v > 1 ? 1 : v;
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 3;
const NEUTRAL_WEIGHT = 1;
function sliderToWeight(v) {
  const t = clamp01$3(v);
  const w = t <= 0.5 ? MIN_WEIGHT + (NEUTRAL_WEIGHT - MIN_WEIGHT) * (t / 0.5) : NEUTRAL_WEIGHT + (MAX_WEIGHT - NEUTRAL_WEIGHT) * ((t - 0.5) / 0.5);
  return Math.round(w * 1e3) / 1e3;
}
function designParamsToScoringWeights(params) {
  const p = { ...DEFAULT_DESIGN_PARAMS, ...params };
  return {
    naturalLight: sliderToWeight(p.daylight),
    privacy: sliderToWeight(p.privacy),
    kitchenWorkflow: sliderToWeight(p.kitchen),
    corridorEfficiency: sliderToWeight(p.compactness)
  };
}
const NEUTRAL_SOLAR_WEIGHT = 0.6;
const NEUTRAL_CORRIDOR_WIDTH_M = 1.2;
const MAX_CORRIDOR_WIDTH_M = 1.8;
const MIN_CORRIDOR_WIDTH_M = 1;
function sliderToRange(v, lo, mid, hi) {
  const t = clamp01$3(v);
  const r = t <= 0.5 ? lo + (mid - lo) * (t / 0.5) : mid + (hi - mid) * ((t - 0.5) / 0.5);
  return Math.round(r * 1e3) / 1e3;
}
function designParamsToEngineTuning(params) {
  const p = { ...DEFAULT_DESIGN_PARAMS, ...params };
  const NEUTRAL_EPS = 1e-6;
  const isNeutral = Math.abs(clamp01$3(p.adjacency) - 0.5) < NEUTRAL_EPS && Math.abs(clamp01$3(p.accessibility) - 0.5) < NEUTRAL_EPS && Math.abs(clamp01$3(p.climate) - 0.5) < NEUTRAL_EPS && Math.abs(clamp01$3(p.space) - 0.5) < NEUTRAL_EPS;
  if (isNeutral) return null;
  return {
    // 0 → 0.5 (relax), 0.5 → 1.0 (neutral), 1 → 2.0 (strict).
    adjacencyStrictness: sliderToRange(p.adjacency, 0.5, 1, 2),
    // 0 → 1.0 m, 0.5 → 1.2 m (engine default), 1 → 1.8 m.
    corridorWidthM: sliderToRange(p.accessibility, MIN_CORRIDOR_WIDTH_M, NEUTRAL_CORRIDOR_WIDTH_M, MAX_CORRIDOR_WIDTH_M),
    // 0 → 0.0 (no solar bias), 0.5 → 0.6 (D6 default), 1 → 1.0 (max bias).
    solarWeight: sliderToRange(p.climate, 0, NEUTRAL_SOLAR_WEIGHT, 1),
    // 0 → 0.6 (mean rooms), 0.5 → 1.0 (neutral), 1 → 1.6 (generous habitable rooms).
    spaceGenerosity: sliderToRange(p.space, 0.6, 1, 1.6)
  };
}

const DEFAULT_DOOR_TYPE_ID = "dt-solid-timber";
const DEFAULT_WINDOW_TYPE_ID = "wt-timber-casement";
const ENTRANCE_DOOR_TYPE_ID = "dt-modern-entrance-glazed";
const DOOR_DEFAULTS_BY_TYPE = [
  // 1. Wet-room privacy — flush white-primed door for easy clean + visual
  //    distinction from the timber leaves in the living spaces.
  {
    types: /* @__PURE__ */ new Set(["bathroom", "ensuite", "wc"]),
    doorTypeId: "dt-white-primed",
    reason: "wet-room privacy (flush white-primed)"
  },
  // 2. Utility — same flush primed door as wet rooms; a workshop reading.
  {
    types: /* @__PURE__ */ new Set(["utility"]),
    doorTypeId: "dt-white-primed",
    reason: "utility flush primed"
  },
  // 3. Kitchen → living/dining — half-light glazed timber so the cook
  //    keeps sight to the social space.
  {
    types: /* @__PURE__ */ new Set(["kitchen"]),
    doorTypeId: "dt-glazed-timber",
    reason: "kitchen half-light glazed"
  }
  // (Remaining pairs fall through to the canonical solid-timber default.)
];
function defaultDoorSystemTypeId(a, b) {
  for (const rule of DOOR_DEFAULTS_BY_TYPE) {
    if (rule.types.has(a) || rule.types.has(b)) return rule.doorTypeId;
  }
  return DEFAULT_DOOR_TYPE_ID;
}
function defaultEntranceDoorSystemTypeId() {
  return ENTRANCE_DOOR_TYPE_ID;
}
const WINDOW_DEFAULTS_BY_TYPE = {
  // §WINDOWS-ALWAYS-TIMBER (founder 2026-06-16: "always windows should be timber").
  // Every window's FRAME is timber — the residential material the founder wants
  // throughout. The catalogue carries only two timber products (wt-timber-casement,
  // wt-timber-double-hung) — no timber tilt-turn / sliding / uPVC-grade variant — so
  // every room resolves to `wt-timber-casement` (the versatile timber default). The
  // per-room INTENT that used to pick a non-timber frame is preserved as a separate
  // spec, NOT a frame material: wet-room obscure GLAZING, kitchen over-sink
  // VENTILATION, and the living full-height PATIO sizing are glazing/operation/size
  // properties layered on the timber frame, not a reason to ship uPVC/aluminium.
  // (When the catalogue gains timber tilt-turn / sliding-patio products, re-map those
  // two rooms to them; the frame stays timber regardless.)
  bathroom: { windowTypeId: "wt-timber-casement", reason: "wet-room timber casement (obscure glazing in spec)" },
  ensuite: { windowTypeId: "wt-timber-casement", reason: "wet-room timber casement (obscure glazing in spec)" },
  wc: { windowTypeId: "wt-timber-casement", reason: "wet-room timber casement (obscure glazing in spec)" },
  utility: { windowTypeId: "wt-timber-casement", reason: "utility timber casement (durable timber frame)" },
  // Kitchen — timber casement (over-sink ventilation is an operation/glazing spec;
  // no timber tilt-turn product in the catalogue yet → timber casement).
  kitchen: { windowTypeId: "wt-timber-casement", reason: "kitchen timber casement (over-sink ventilation in spec)" },
  // §LIVING-PATIO-TYPE — living = full-height glazed PATIO sizing (v159: sill 10 mm,
  // ~2.19 m tall, a glazed wall). The SIZE/geometry stays a glazed wall; the FRAME is
  // timber per the founder directive (no timber sliding-patio product yet → the timber
  // casement type carries the full-height glazed unit on its patio dims).
  living: { windowTypeId: "wt-timber-casement", reason: "living full-height glazed timber (patio sizing in spec)" },
  // Dining + bedrooms + study — heritage timber casement, the residential default.
  dining: { windowTypeId: "wt-timber-casement", reason: "dining timber casement" },
  bedroom: { windowTypeId: "wt-timber-casement", reason: "bedroom timber casement" },
  master: { windowTypeId: "wt-timber-casement", reason: "master timber casement" },
  study: { windowTypeId: "wt-timber-casement", reason: "study timber casement" },
  // Hall + corridor — timber casement (timber frame throughout; rarely on a façade).
  hall: { windowTypeId: "wt-timber-casement", reason: "hall timber casement" },
  corridor: { windowTypeId: "wt-timber-casement", reason: "corridor timber casement" }
};
function defaultWindowSystemTypeId(roomType) {
  return WINDOW_DEFAULTS_BY_TYPE[roomType]?.windowTypeId ?? DEFAULT_WINDOW_TYPE_ID;
}

const _layoutDiagOn$1 = () => globalThis.__pryzmLayoutDiag === true;
const ENDPOINT_TOL_M = 0.01;
const defaultPlanToWorld$2 = (p) => ({ x: p.x / 1e3, z: p.y / 1e3 });
const dist$4 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ANGLE_TOL_RAD = 30 * Math.PI / 180;
const PERP_TOL_M = 1;
const RESCUE_ANGLE_TOL_RAD = 45 * Math.PI / 180;
const RESCUE_PERP_TOL_M = 1.6;
const OVERLAP_TOL_M = 0.05;
const MIN_CORNER_SETBACK_M = 0.5;
const MAX_CORNER_SETBACK_M = 1.2;
const CORNER_SETBACK_WALL_FRACTION = 0.1;
const MIN_WINDOW_M = 0.4;
const RESCUE_CORNER_SETBACK_M = 0.1;
function cornerSetbackForWall(shellLenM) {
  if (!Number.isFinite(shellLenM) || shellLenM <= 0) return MIN_CORNER_SETBACK_M;
  const scaled = Math.min(
    MAX_CORNER_SETBACK_M,
    Math.max(MIN_CORNER_SETBACK_M, CORNER_SETBACK_WALL_FRACTION * shellLenM)
  );
  const maxAffordable = Math.max(0, (shellLenM - MIN_WINDOW_M) / 2);
  return Math.min(scaled, maxAffordable);
}
const JUNCTION_PERP_TOL_M = 0.2;
const JUNCTION_ALONG_TOL_M = 0.06;
const JUNCTION_MIN_TJOIN_SIN = Math.sin(20 * Math.PI / 180);
const JUNCTION_CLEARANCE_M = 0.1;
const JUNCTION_MERGE_M = 0.08;
function shellJunctionsFromOptionWalls(shell, optionWalls, planToWorld = defaultPlanToWorld$2) {
  const sd = segDir$1(shell.start, shell.end);
  if (sd.len < 1e-6) return [];
  const out = [];
  for (const w of optionWalls) {
    if (w.isExternal === true) continue;
    const a = planToWorld(w.start);
    const b = planToWorld(w.end);
    const wd = segDir$1(a, b);
    if (wd.len < 1e-9) continue;
    const sinToShell = Math.abs(wd.x * sd.z - wd.z * sd.x);
    if (sinToShell < JUNCTION_MIN_TJOIN_SIN) continue;
    const halfBandM = JUNCTION_CLEARANCE_M;
    for (const ep of [a, b]) {
      const along = projParam$1(ep, shell.start, sd);
      const perp = perpDist$1(ep, shell.start, sd);
      if (perp > JUNCTION_PERP_TOL_M) continue;
      if (along < -JUNCTION_ALONG_TOL_M || along > sd.len + JUNCTION_ALONG_TOL_M) continue;
      out.push({ atM: Math.min(Math.max(along, 0), sd.len), halfBandM });
    }
  }
  return out;
}
function roomIntervalOnShell(shellLenM, junctions, centreParam) {
  const raw = junctions.map((j) => j.atM).filter((c2) => c2 > 1e-6 && c2 < shellLenM - 1e-6).sort((a, b) => a - b);
  const cuts = [];
  for (const c2 of raw) {
    const prev = cuts[cuts.length - 1];
    if (prev === void 0 || c2 - prev > JUNCTION_MERGE_M) cuts.push(c2);
  }
  if (cuts.length === 0) return { lo: 0, hi: shellLenM };
  const bounds = [0, ...cuts, shellLenM];
  const intervals = [];
  for (let i = 1; i < bounds.length; i++) intervals.push({ lo: bounds[i - 1], hi: bounds[i] });
  const c = Math.min(Math.max(centreParam, 0), shellLenM);
  const owned = intervals.find((iv) => c >= iv.lo - 1e-6 && c <= iv.hi + 1e-6);
  if (owned) return owned;
  let nearest = intervals[0];
  let nearestDist = Infinity;
  for (const iv of intervals) {
    const d = c < iv.lo ? iv.lo - c : c > iv.hi ? c - iv.hi : 0;
    if (d < nearestDist - 1e-6) {
      nearest = iv;
      nearestDist = d;
    }
  }
  return nearest;
}
const segDir$1 = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return len > 1e-9 ? { x: dx / len, z: dz / len, len } : { x: 1, z: 0, len: 0 };
};
const projParam$1 = (p, a, d) => (p.x - a.x) * d.x + (p.z - a.z) * d.z;
const perpDist$1 = (p, a, d) => Math.abs((p.x - a.x) * d.z - (p.z - a.z) * d.x);
function matchShellHost(optionWall, shellWalls, planToWorld = defaultPlanToWorld$2, tol) {
  const angleTol = tol?.angleTolRad ?? ANGLE_TOL_RAD;
  const perpTol = tol?.perpTolM ?? PERP_TOL_M;
  const a = planToWorld(optionWall.start);
  const b = planToWorld(optionWall.end);
  for (const s of shellWalls) {
    if (dist$4(s.start, a) <= ENDPOINT_TOL_M && dist$4(s.end, b) <= ENDPOINT_TOL_M) {
      return { shell: s, reversed: false, exact: true };
    }
    if (dist$4(s.start, b) <= ENDPOINT_TOL_M && dist$4(s.end, a) <= ENDPOINT_TOL_M) {
      return { shell: s, reversed: true, exact: true };
    }
  }
  const od = segDir$1(a, b);
  if (od.len < 1e-6) return null;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  let best = null;
  let bestScore = Infinity;
  for (const s of shellWalls) {
    const sd = segDir$1(s.start, s.end);
    if (sd.len < 1e-6) continue;
    const cos = Math.abs(od.x * sd.x + od.z * sd.z);
    const ang = Math.acos(Math.min(1, cos));
    if (ang > angleTol) continue;
    const perp = perpDist$1(mid, s.start, sd);
    if (perp > perpTol) continue;
    const t0 = projParam$1(a, s.start, sd);
    const t1 = projParam$1(b, s.start, sd);
    if (Math.max(t0, t1) < 0 || Math.min(t0, t1) > sd.len) continue;
    const tMid = projParam$1(mid, s.start, sd);
    if (tMid < -OVERLAP_TOL_M || tMid > sd.len + OVERLAP_TOL_M) continue;
    const score = ang * 2 + perp;
    if (score < bestScore) {
      bestScore = score;
      best = { shell: s, reversed: od.x * sd.x + od.z * sd.z < 0, exact: false };
    }
  }
  return best;
}
function resolveShellWindow(win, optionWalls, shellWalls, planToWorld = defaultPlanToWorld$2, reasonTally, relax, junctionsByShell) {
  const fail = (reason) => {
    if (reasonTally) reasonTally[reason] = (reasonTally[reason] ?? 0) + 1;
    return null;
  };
  if (win.wallRef < 0 || win.wallRef >= optionWalls.length) return fail("wallRefOutOfRange");
  const host = optionWalls[win.wallRef];
  if (host.isExternal !== true) return fail("hostNotExternal");
  const match = matchShellHost(
    host,
    shellWalls,
    planToWorld,
    relax?.widenMatch ? { angleTolRad: RESCUE_ANGLE_TOL_RAD, perpTolM: RESCUE_PERP_TOL_M } : void 0
  );
  if (!match) return fail("noShellMatch");
  const shellJunctionsM = junctionsByShell?.get(match.shell.id);
  const hostStartW = planToWorld(host.start);
  const hostEndW = planToWorld(host.end);
  const hostDir = segDir$1(hostStartW, hostEndW);
  const offsetM_local = win.offset / 1e3;
  const shellDir = segDir$1(match.shell.start, match.shell.end);
  const END_CLEAR_M = relax?.relaxCorner ? Math.min(cornerSetbackForWall(shellDir.len), RESCUE_CORNER_SETBACK_M) : cornerSetbackForWall(shellDir.len);
  const maxWidthM = shellDir.len - 2 * END_CLEAR_M;
  if (maxWidthM < MIN_WINDOW_M) return fail("shellWallTooShort");
  const requestedWidthM = relax?.shrinkWidth ? Math.max(MIN_WINDOW_M, Math.min(win.width / 1e3, maxWidthM)) : win.width / 1e3;
  const widthM = Math.min(requestedWidthM, maxWidthM);
  const centreW = {
    x: hostStartW.x + hostDir.x * (offsetM_local + win.width / 1e3 / 2),
    z: hostStartW.z + hostDir.z * (offsetM_local + win.width / 1e3 / 2)
  };
  const centreParam = projParam$1(centreW, match.shell.start, shellDir);
  const offsetM = centreParam - widthM / 2;
  if (centreParam < -OVERLAP_TOL_M || centreParam > shellDir.len + OVERLAP_TOL_M) return fail("centreOutOfShellSpan");
  const wasWidthClamped = widthM < win.width / 1e3 - COINCIDENT_M;
  if (!wasWidthClamped && !match.exact) {
    const minCentre = widthM / 2 + END_CLEAR_M;
    if (centreParam < minCentre - COINCIDENT_M || centreParam > shellDir.len - minCentre + COINCIDENT_M) return fail("cornerFitDrop");
  }
  let minOffsetM = END_CLEAR_M;
  let maxOffsetClearedM = shellDir.len - widthM - END_CLEAR_M;
  if (maxOffsetClearedM < minOffsetM - COINCIDENT_M) return fail("cornerClearanceUnfittable");
  if (shellJunctionsM && shellJunctionsM.length > 0) {
    const owned = roomIntervalOnShell(shellDir.len, shellJunctionsM, centreParam);
    const halfAtCut = (cut) => {
      let h = 0;
      for (const j of shellJunctionsM) if (Math.abs(j.atM - cut) <= JUNCTION_MERGE_M) h = Math.max(h, j.halfBandM);
      return h;
    };
    const loIsCorner = owned.lo <= COINCIDENT_M;
    const hiIsCorner = owned.hi >= shellDir.len - COINCIDENT_M;
    const ivLo = owned.lo + (loIsCorner ? END_CLEAR_M : halfAtCut(owned.lo) + JUNCTION_CLEARANCE_M);
    const ivHi = owned.hi - (hiIsCorner ? END_CLEAR_M : halfAtCut(owned.hi) + JUNCTION_CLEARANCE_M);
    const ivMin = ivLo;
    const ivMax = ivHi - widthM;
    minOffsetM = Math.max(minOffsetM, ivMin);
    maxOffsetClearedM = Math.min(maxOffsetClearedM, ivMax);
    if (maxOffsetClearedM < minOffsetM - COINCIDENT_M) {
      return fail("roomIntervalUnfittable");
    }
  }
  const finalOffsetM = Math.min(Math.max(minOffsetM, offsetM), maxOffsetClearedM);
  if (finalOffsetM < END_CLEAR_M - COINCIDENT_M || finalOffsetM + widthM > shellDir.len - END_CLEAR_M + COINCIDENT_M) return fail("finalInvariantDrop");
  if (shellJunctionsM && shellJunctionsM.length > 0) {
    const lo = finalOffsetM, hi = finalOffsetM + widthM;
    for (const j of shellJunctionsM) {
      if (j.atM > lo + COINCIDENT_M && j.atM < hi - COINCIDENT_M) return fail("crossesJunction");
    }
  }
  return {
    shellWallId: match.shell.id,
    offsetM: finalOffsetM,
    widthM,
    heightM: win.height / 1e3,
    sillM: win.sillHeight / 1e3,
    ...win.roomType ? { roomType: win.roomType } : {},
    ...win.name ? { name: win.name } : {}
  };
}
const WINDOW_GAP_M = 0.1;
const HABITABLE_WIN = /* @__PURE__ */ new Set(["living", "kitchen", "dining", "master", "bedroom", "study"]);
function deOverlapShellWindowItems(items, overlapStats) {
  const byWall = /* @__PURE__ */ new Map();
  for (const e of items) {
    (byWall.get(e.r.shellWallId) ?? byWall.set(e.r.shellWallId, []).get(e.r.shellWallId)).push(e);
  }
  const winPriority = (e) => e.rescued ? HABITABLE_WIN.has(e.r.roomType ?? "") ? 0 : 2 : HABITABLE_WIN.has(e.r.roomType ?? "") ? 1 : 2;
  const keptIdx = /* @__PURE__ */ new Set();
  for (const [wallId, group] of byWall.entries()) {
    const sorted = group.slice().sort((a, b) => winPriority(a) - winPriority(b) || // rescued, then habitable, claim first
    a.r.offsetM - b.r.offsetM || b.r.widthM - a.r.widthM || a.i - b.i);
    const keptSpans = [];
    let droppedHere = 0;
    for (const e of sorted) {
      const s = e.r.offsetM, end = e.r.offsetM + e.r.widthM;
      const overlaps = keptSpans.some(([ks, ke]) => s < ke + WINDOW_GAP_M - 1e-9 && ks < end + WINDOW_GAP_M - 1e-9);
      if (!overlaps) {
        keptIdx.add(e.i);
        keptSpans.push([s, end]);
      } else droppedHere++;
    }
    if (overlapStats) overlapStats.set(wallId, { received: group.length, dropped: droppedHere });
  }
  return items.filter((e) => keptIdx.has(e.i)).slice().sort((a, b) => a.i - b.i);
}
const roomKeyOf = (w) => w.name ?? `${w.roomType ?? "?"}@${w.wallRef}`;
const RESCUE_LADDER = [
  { label: "relaxCorner", relax: { relaxCorner: true, widenMatch: false, shrinkWidth: false } },
  { label: "relaxCorner+shrinkWidth", relax: { relaxCorner: true, widenMatch: false, shrinkWidth: true } },
  { label: "relaxCorner+widenMatch", relax: { relaxCorner: true, widenMatch: true, shrinkWidth: false } },
  { label: "relaxCorner+widenMatch+shrinkWidth", relax: { relaxCorner: true, widenMatch: true, shrinkWidth: true } }
];
function resolveAllShellWindows(windows, optionWalls, shellWalls, planToWorld = defaultPlanToWorld$2, blindFacadeWallIds, perimeterRoomKeys) {
  const blind = blindFacadeWallIds instanceof Set ? blindFacadeWallIds : new Set(blindFacadeWallIds ?? []);
  const perimeterRooms = perimeterRoomKeys instanceof Map ? perimeterRoomKeys : new Map(perimeterRoomKeys ?? []);
  const junctionsByShell = /* @__PURE__ */ new Map();
  for (const s of shellWalls) {
    const js = shellJunctionsFromOptionWalls(s, optionWalls, planToWorld);
    if (js.length > 0) junctionsByShell.set(s.id, js);
  }
  const out = [];
  let unmatched = 0;
  let blindSuppressed = 0;
  const reasonTally = {};
  let idx = 0;
  for (const w of windows) {
    const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld, reasonTally, void 0, junctionsByShell);
    if (r && blind.size > 0 && blind.has(r.shellWallId)) {
      blindSuppressed++;
      continue;
    }
    if (r) {
      out.push({
        r,
        i: idx++,
        roomKey: roomKeyOf(w),
        // `mandatory` here drives the de-overlap collateral protection +
        // the "already keeps a window" short-circuit. §WINDOW-DESIRED widens
        // it to every window-DESIRED room (incl. wet rooms) so a bathroom that
        // already kept a window is not re-rescued, and a kept desired window is
        // protected from rescue collateral exactly like a mandatory one.
        mandatory: windowDesiredFor(w.roomType ?? ""),
        rescued: false
      });
    } else unmatched++;
  }
  const overlapStats = /* @__PURE__ */ new Map();
  let keptItems = deOverlapShellWindowItems(out, overlapStats);
  const mandatoryRooms = /* @__PURE__ */ new Map();
  const orderedWindows = [...windows].sort((a, b) => {
    const ma = windowMandatoryFor(a.roomType ?? "") ? 0 : 1;
    const mb = windowMandatoryFor(b.roomType ?? "") ? 0 : 1;
    return ma - mb;
  });
  for (const w of orderedWindows) {
    if (!windowDesiredFor(w.roomType ?? "")) continue;
    const key = roomKeyOf(w);
    (mandatoryRooms.get(key) ?? mandatoryRooms.set(key, []).get(key)).push(w);
  }
  const protectedKeys = (its) => new Set(its.filter((e) => !e.rescued && HABITABLE_WIN.has(e.r.roomType ?? "")).map((e) => e.roomKey));
  const keptKeys = new Set(keptItems.filter((e) => e.mandatory).map((e) => e.roomKey));
  const rescueLog = [];
  for (const [key, roomWindows] of mandatoryRooms) {
    if (keptKeys.has(key)) continue;
    const protectedBefore = protectedKeys(keptItems);
    let chosen = null;
    outer: for (const step of RESCUE_LADDER) {
      for (const w of roomWindows) {
        const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld, void 0, step.relax, junctionsByShell);
        if (!r) continue;
        if (blind.size > 0 && blind.has(r.shellWallId)) {
          blindSuppressed++;
          continue;
        }
        const candidate = { r, i: idx, roomKey: key, mandatory: true, rescued: true };
        const after = deOverlapShellWindowItems([...keptItems, candidate]);
        const survived = after.some((e) => e.i === candidate.i);
        const protectedAfter = new Set(after.filter((e) => !e.rescued).map((e) => e.roomKey));
        const noCollateral = [...protectedBefore].every((k) => protectedAfter.has(k));
        if (survived && noCollateral) {
          chosen = { items: after, label: step.label };
          idx++;
          break outer;
        }
      }
    }
    if (!chosen) {
      rescueLog.push(`${key}:NO-FRONTAGE`);
      continue;
    }
    keptItems = chosen.items;
    rescueLog.push(`${key}:${chosen.label}`);
  }
  const kept = keptItems.map((e) => e.r);
  const shellById = new Map(shellWalls.map((s) => [s.id, s]));
  const compassOf = (id) => {
    const s = shellById.get(id);
    if (!s) return "?";
    const dx = s.end.x - s.start.x, dz = s.end.z - s.start.z;
    return Math.abs(dx) >= Math.abs(dz) ? "N/S" : "E/W";
  };
  const buckets = {};
  for (const k of kept) buckets[compassOf(k.shellWallId)] = (buckets[compassOf(k.shellWallId)] ?? 0) + 1;
  const dist2 = Object.entries(buckets).map(([f, n]) => `${f}:${n}`).join(" ") || "none";
  const rescuedKept = keptItems.filter((e) => e.rescued).length;
  if (_layoutDiagOn$1()) console.log(
    `[D-TGL] §DIAG-WIN-DIST resolved=${out.length} kept=${kept.length} droppedByDeOverlap=${out.length - (kept.length - rescuedKept)} unmatchedToShell=${unmatched} rescued=${rescuedKept} façadeAxisDist={${dist2}}`
  );
  const finalByWall = /* @__PURE__ */ new Map();
  for (const k of kept) (finalByWall.get(k.shellWallId) ?? finalByWall.set(k.shellWallId, []).get(k.shellWallId)).push(k);
  let totalRemovedByOverlap = 0;
  let residualOverlaps = 0;
  for (const [wallId, ws] of finalByWall.entries()) {
    const removed = overlapStats.get(wallId)?.dropped ?? 0;
    totalRemovedByOverlap += removed;
    const spans = ws.map((w) => [w.offsetM, w.offsetM + w.widthM]).sort((a, b) => a[0] - b[0]);
    let wallResidual = 0;
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] < spans[i - 1][1] + WINDOW_GAP_M - 1e-9) wallResidual++;
    }
    residualOverlaps += wallResidual;
    if (removed > 0 || wallResidual > 0) {
      if (_layoutDiagOn$1()) console.log(
        `[D-TGL] §DIAG-WINDOW-OVERLAP wall=${wallId} windows=${ws.length} overlapsRemoved=${removed}${wallResidual > 0 ? ` ⚠ RESIDUAL-OVERLAP=${wallResidual}` : ""}`
      );
    }
  }
  if (_layoutDiagOn$1()) console.log(
    `[D-TGL] §DIAG-WINDOW-OVERLAP wallsWithWindows=${finalByWall.size} overlapsRemoved=${totalRemovedByOverlap} residualOverlaps=${residualOverlaps}${residualOverlaps > 0 ? " ⚠ DE-OVERLAP INVARIANT VIOLATED" : " ✓ all disjoint"}`
  );
  if (blind.size > 0) {
    if (_layoutDiagOn$1()) console.log(
      `[D-TGL] §DIAG-PARTY-WALL blindFacades=${blind.size} [${[...blind].join(",")}] windowsSuppressed=${blindSuppressed}`
    );
  }
  if (unmatched > 0) {
    const breakdown = Object.entries(reasonTally).map(([r, n]) => `${r}:${n}`).join(" ") || "none";
    if (_layoutDiagOn$1()) console.log(`[D-TGL] §DIAG-WIN-UNMATCHED total=${unmatched} → ${breakdown}`);
  }
  if (rescueLog.length > 0) {
    console.log(`[D-TGL] §WINDOW-MANDATORY-RESCUE fired for ${rescueLog.length} room(s) → ${rescueLog.join(" ")}`);
  }
  const keptKeysFinal = new Set(keptItems.map((e) => e.roomKey));
  const desiredRoomKeys = /* @__PURE__ */ new Map();
  for (const w of windows) {
    if (!windowDesiredFor(w.roomType ?? "")) continue;
    desiredRoomKeys.set(roomKeyOf(w), w.roomType ?? "?");
  }
  for (const [key, type] of perimeterRooms) {
    if (!windowDesiredFor(type)) continue;
    desiredRoomKeys.set(key, type);
  }
  const rescueByKey = new Map(rescueLog.map((s) => {
    const i = s.lastIndexOf(":");
    return [s.slice(0, i), s.slice(i + 1)];
  }));
  let winYes = 0;
  const winNo = [];
  for (const [key, type] of [...desiredRoomKeys.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const has = keptKeysFinal.has(key);
    const isPerimeter = perimeterRooms.has(key);
    if (has) {
      winYes++;
      if (_layoutDiagOn$1()) console.log(`[D-TGL] §DIAG-WINDOW-RULE ${key}(${type}) → window ✓`);
    } else {
      const reason = rescueByKey.get(key) === "NO-FRONTAGE" ? "NO-FRONTAGE (no external wall)" : "all candidates dropped (see §DIAG-WIN-UNMATCHED)";
      winNo.push(`${key}(${type})`);
      const flag = isPerimeter ? "⚠ PERIMETER-ROOM WINDOWLESS — RULE VIOLATION" : "window ✗";
      if (_layoutDiagOn$1()) console.log(`[D-TGL] §DIAG-WINDOW-RULE ${key}(${type}) → ${flag} — ${reason}`);
    }
  }
  const perimViolations = winNo.filter((k) => perimeterRooms.has(k.slice(0, k.lastIndexOf("("))));
  if (_layoutDiagOn$1()) console.log(
    `[D-TGL] §DIAG-WINDOW-RULE roomsWithWindow=${winYes}/${desiredRoomKeys.size} roomsWithoutWindow=[${winNo.join(",") || "none"}] perimeterRoomViolations=${perimViolations.length}${perimViolations.length > 0 ? ` ⚠ [${perimViolations.join(",")}]` : " ✓"}`
  );
  return kept;
}

const MM_PER_M$1 = 1e3;
const MIN_WALL_LENGTH_M$2 = 0.05;
const DEFAULT_WALL_HEIGHT_M = 2.7;
const DEFAULT_WALL_THICKNESS_M = 0.1;
const DEFAULT_DOOR_HEIGHT_M = 2.1;
const DEFAULT_DOOR_WIDTH_M = 0.9;
const DEFAULT_DOOR_SYSTEM_TYPE_ID = "solid-timber";
function defaultPlanToWorld$1(p) {
  return { x: p.x / MM_PER_M$1, z: p.y / MM_PER_M$1 };
}
function lengthXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
const round6m = (n) => Math.round(n * 1e6) / 1e6;
function classifyAxisWall(idx, w) {
  const [a, b] = w.baseLine;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) < COINCIDENT_M && Math.abs(dz) > COINCIDENT_M) {
    const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
    return {
      originalIdx: idx,
      axis: "v",
      constCoord: round6m(a.x),
      lo,
      hi,
      reversed: a.z > b.z,
      origBaseLine: [a, b]
    };
  }
  if (Math.abs(dz) < COINCIDENT_M && Math.abs(dx) > COINCIDENT_M) {
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return {
      originalIdx: idx,
      axis: "h",
      constCoord: round6m(a.z),
      lo,
      hi,
      reversed: a.x > b.x,
      origBaseLine: [a, b]
    };
  }
  return null;
}
function mergeCollinearWalls(walls) {
  const remap = /* @__PURE__ */ new Map();
  const shift = /* @__PURE__ */ new Map();
  const reversedVsMerged = /* @__PURE__ */ new Map();
  const out = [];
  const axisWalls = [];
  const passthroughIndices = [];
  walls.forEach((w, i) => {
    const cls = classifyAxisWall(i, w);
    if (cls) axisWalls.push(cls);
    else passthroughIndices.push(i);
  });
  const groups = /* @__PURE__ */ new Map();
  for (const aw of axisWalls) {
    const key = `${aw.axis}@${aw.constCoord}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(aw);
  }
  for (const [, g] of groups) g.sort((a, b) => a.lo - b.lo);
  const orderedKeys = [...groups.keys()].sort();
  for (const key of orderedKeys) {
    const group = groups.get(key);
    let runIdx = [];
    const flush = () => {
      if (runIdx.length === 0) return;
      const first = runIdx[0];
      const last = runIdx[runIdx.length - 1];
      const sample = walls[first.originalIdx];
      const newStart = first.axis === "v" ? { x: first.constCoord, y: first.origBaseLine[0].y, z: first.lo } : { x: first.lo, y: first.origBaseLine[0].y, z: first.constCoord };
      const newEnd = first.axis === "v" ? { x: first.constCoord, y: last.origBaseLine[0].y, z: last.hi } : { x: last.hi, y: last.origBaseLine[0].y, z: first.constCoord };
      const newIdx = out.length;
      out.push({
        baseLine: [newStart, newEnd],
        height: sample.height,
        thickness: sample.thickness,
        ...sample.systemTypeId ? { systemTypeId: sample.systemTypeId } : {}
      });
      for (const aw of runIdx) {
        remap.set(aw.originalIdx, newIdx);
        shift.set(aw.originalIdx, aw.lo - first.lo);
        reversedVsMerged.set(aw.originalIdx, aw.reversed);
      }
      runIdx = [];
    };
    for (const aw of group) {
      if (runIdx.length === 0) {
        runIdx.push(aw);
        continue;
      }
      const prev = runIdx[runIdx.length - 1];
      if (Math.abs(aw.lo - prev.hi) < COINCIDENT_M) runIdx.push(aw);
      else {
        flush();
        runIdx.push(aw);
      }
    }
    flush();
  }
  for (const i of passthroughIndices) {
    const newIdx = out.length;
    out.push(walls[i]);
    remap.set(i, newIdx);
    shift.set(i, 0);
    reversedVsMerged.set(i, false);
  }
  return { walls: out, remap, shift, reversedVsMerged };
}
function buildLayoutPlan(option, opts) {
  const baseElevationM = opts.baseElevationM ?? 0;
  const wallHeightM = opts.wallHeightM ?? DEFAULT_WALL_HEIGHT_M;
  const wallThicknessM = opts.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;
  const doorHeightM = opts.doorHeightM ?? DEFAULT_DOOR_HEIGHT_M;
  const toWorld = opts.planToWorldXZ ?? defaultPlanToWorld$1;
  const warnings = [];
  const rawWalls = [];
  const dropRemap = new Array(option.walls.length).fill(-1);
  option.walls.forEach((w, i) => {
    if (opts.skipExteriorWalls && w.isExternal) return;
    const s = toWorld(w.start);
    const e = toWorld(w.end);
    const a = { x: s.x, y: baseElevationM, z: s.z };
    const b = { x: e.x, y: baseElevationM, z: e.z };
    if (lengthXZ(a, b) < MIN_WALL_LENGTH_M$2) {
      warnings.push(`wall[${i}] dropped — length ${lengthXZ(a, b).toFixed(3)} m < ${MIN_WALL_LENGTH_M$2} m minimum`);
      return;
    }
    dropRemap[i] = rawWalls.length;
    rawWalls.push({
      baseLine: [a, b],
      height: wallHeightM,
      thickness: wallThicknessM,
      // Only set systemTypeId when a real type id was supplied — an unknown
      // id is rejected by wall.batch.create; omitting → the handler default.
      ...opts.wallTypeId ? { systemTypeId: opts.wallTypeId } : {}
    });
  });
  const merge = mergeCollinearWalls(rawWalls);
  const walls = merge.walls;
  if (rawWalls.length !== walls.length) {
    warnings.push(`§COLLINEAR-MERGE: ${rawWalls.length} segments → ${walls.length} walls (${rawWalls.length - walls.length} merged into passthroughs)`);
  }
  const doorPlan = [];
  option.doors.forEach((d, i) => {
    if (d.wallRef < 0 || d.wallRef >= option.walls.length) {
      warnings.push(`door[${i}] dropped — wallRef ${d.wallRef} out of range [0, ${option.walls.length})`);
      return;
    }
    const rawRef = dropRemap[d.wallRef];
    if (rawRef === -1) {
      warnings.push(`door[${i}] dropped — host wall[${d.wallRef}] was dropped`);
      return;
    }
    const mergedRef = merge.remap.get(rawRef);
    if (mergedRef === void 0) {
      warnings.push(`door[${i}] dropped — host wall[${rawRef}] missing from merge remap`);
      return;
    }
    const shift = merge.shift.get(rawRef) ?? 0;
    const reversed = merge.reversedVsMerged.get(rawRef) ?? false;
    const offsetM_local = d.offset / MM_PER_M$1;
    const widthM = (d.width || DEFAULT_DOOR_WIDTH_M * MM_PER_M$1) / MM_PER_M$1;
    const raw = rawWalls[rawRef];
    const rawLenM = lengthXZ(raw.baseLine[0], raw.baseLine[1]);
    const localOnRaw = reversed ? rawLenM - offsetM_local - widthM : offsetM_local;
    const offsetM = shift + localOnRaw;
    const host = walls[mergedRef];
    const wallLenM = lengthXZ(host.baseLine[0], host.baseLine[1]);
    if (offsetM < 0 || offsetM + widthM > wallLenM + 1e-3) {
      warnings.push(`door[${i}] dropped — span [${offsetM.toFixed(2)}, ${(offsetM + widthM).toFixed(2)}] m does not fit merged host wall (${wallLenM.toFixed(2)} m)`);
      return;
    }
    doorPlan.push({
      wallRef: mergedRef,
      offset: offsetM,
      width: widthM,
      height: doorHeightM,
      sillHeight: 0,
      doorType: "single",
      ...d.name ? { name: d.name } : {},
      // T1.D — carry the room types so the per-pair finish resolver can
      // pick a privacy door for wet rooms / glazed door for kitchens.
      ...d.roomTypeA ? { roomTypeA: d.roomTypeA } : {},
      ...d.roomTypeB ? { roomTypeB: d.roomTypeB } : {}
    });
  });
  const windowPlan = [];
  (option.windows ?? []).forEach((w, i) => {
    if (w.wallRef < 0 || w.wallRef >= option.walls.length) {
      warnings.push(`window[${i}] dropped — wallRef ${w.wallRef} out of range`);
      return;
    }
    const rawRef = dropRemap[w.wallRef];
    if (rawRef === -1) return;
    const mergedRef = merge.remap.get(rawRef);
    if (mergedRef === void 0) return;
    const shiftM = merge.shift.get(rawRef) ?? 0;
    const reversedW = merge.reversedVsMerged.get(rawRef) ?? false;
    const offsetM_local = w.offset / MM_PER_M$1;
    const widthM = w.width / MM_PER_M$1;
    const raw = rawWalls[rawRef];
    const rawLenM = lengthXZ(raw.baseLine[0], raw.baseLine[1]);
    const localOnRaw = reversedW ? rawLenM - offsetM_local - widthM : offsetM_local;
    const offsetM = shiftM + localOnRaw;
    const host = walls[mergedRef];
    const wallLenM = lengthXZ(host.baseLine[0], host.baseLine[1]);
    if (offsetM < 0 || offsetM + widthM > wallLenM + 1e-3) {
      warnings.push(`window[${i}] dropped — span does not fit merged host wall`);
      return;
    }
    windowPlan.push({
      wallRef: mergedRef,
      offset: offsetM,
      width: widthM,
      height: w.height / MM_PER_M$1,
      sillHeight: w.sillHeight / MM_PER_M$1,
      ...w.name ? { name: w.name } : {},
      ...w.roomType ? { roomType: w.roomType } : {}
    });
  });
  const wallCommand = {
    command: "wall.batch.create",
    payload: { walls, levelId: opts.levelId }
  };
  return {
    wallCommand,
    walls,
    doorPlan,
    windowPlan,
    totalElementCount: walls.length + doorPlan.length + windowPlan.length,
    warnings
  };
}
function buildLayoutCommands(option, opts, mintId) {
  const plan = buildLayoutPlan(option, opts);
  const wallIds = plan.walls.map(() => mintId("wall"));
  const wallsWithIds = plan.walls.map((w, i) => ({ ...w, id: wallIds[i], levelId: opts.levelId }));
  const wallBatch = {
    command: "wall.batch.create",
    payload: { walls: wallsWithIds, levelId: opts.levelId }
  };
  const resolvedDoorSysType = opts.doorSystemTypeId !== void 0 ? opts.doorSystemTypeId : DEFAULT_DOOR_SYSTEM_TYPE_ID;
  const stampDoorSysType = resolvedDoorSysType ? { systemTypeId: resolvedDoorSysType } : {};
  const openingCommands = [];
  const doors = [];
  const doorIds = [];
  for (const d of plan.doorPlan) {
    const wallId = wallIds[d.wallRef];
    const openingId = mintId("opening");
    const doorId = mintId("door");
    doorIds.push(doorId);
    const perPairSysType = d.roomTypeA && d.roomTypeB ? { systemTypeId: defaultDoorSystemTypeId(d.roomTypeA, d.roomTypeB) } : stampDoorSysType;
    const openingSysType = d.roomTypeA && d.roomTypeB ? { systemTypeId: defaultDoorSystemTypeId(d.roomTypeA, d.roomTypeB) } : resolvedDoorSysType === DEFAULT_DOOR_SYSTEM_TYPE_ID ? { systemTypeId: DEFAULT_DOOR_TYPE_ID } : stampDoorSysType;
    openingCommands.push({
      command: "wall.createOpening",
      payload: {
        wallId,
        opening: {
          id: openingId,
          type: "door",
          offset: d.offset,
          width: d.width,
          height: d.height,
          sillHeight: d.sillHeight,
          elementId: doorId,
          // === door id (C15 cascade)
          doorType: d.doorType,
          ...openingSysType
        }
      }
    });
    doors.push({
      id: doorId,
      wallId,
      openingId,
      offset: d.offset,
      width: d.width,
      height: d.height,
      sillHeight: d.sillHeight,
      doorType: d.doorType,
      ...perPairSysType,
      ...d.name ? { name: d.name } : {}
    });
  }
  const doorBatch = doors.length > 0 ? { command: "door.batch.create", payload: { doors } } : null;
  const windowOpeningCommands = [];
  const windowPayloads = [];
  const windowIds = [];
  for (const w of plan.windowPlan) {
    const wallId = wallIds[w.wallRef];
    const openingId = mintId("opening");
    const windowId = mintId("window");
    windowIds.push(windowId);
    const perRoomWindowSysType = w.roomType ? { systemTypeId: defaultWindowSystemTypeId(w.roomType) } : {};
    windowOpeningCommands.push({
      command: "wall.createOpening",
      payload: {
        wallId,
        opening: {
          id: openingId,
          type: "window",
          // §A.21.D12 — the OPENING is what CreateWallOpeningCommand reads to
          // write windowStore (→ WindowBuilder frame + glazing). Carry the SAME
          // rich fields the manual WindowTool puts on its opening (windowType +
          // systemTypeId) so the generated window resolves its glazing finish /
          // glassOpacity / frame material from the catalogue and renders as a
          // real see-through window — not the schema-default panel that read as
          // a "blind recess". `systemTypeId` on the opening is the load-bearing
          // bit; the unused window.batch.create payload had it but is never
          // dispatched by the executors (they punch openings only).
          windowType: "single",
          offset: w.offset,
          width: w.width,
          height: w.height,
          sillHeight: w.sillHeight,
          elementId: windowId,
          // === window id (C15 cascade)
          ...perRoomWindowSysType
        }
      }
    });
    windowPayloads.push({
      id: windowId,
      wallId,
      openingId,
      width: w.width,
      height: w.height,
      sillHeight: w.sillHeight,
      offset: w.offset,
      ...perRoomWindowSysType,
      ...w.name ? { name: w.name } : {}
    });
  }
  const windowBatch = windowPayloads.length > 0 ? { command: "window.batch.create", payload: { windows: windowPayloads } } : null;
  const shellWindowOpeningCommands = [];
  const shellWindowPayloads = [];
  const shellWindowIds = [];
  if (opts.shellWalls && opts.shellWalls.length > 0 && option.windows && option.windows.length > 0) {
    const resolved = resolveAllShellWindows(
      option.windows,
      option.walls,
      opts.shellWalls,
      opts.planToWorldXZ,
      // §DIAG-PARTY-WALL (PW.1) — suppress every window that would resolve onto a
      // blind/party shell wall. Omitted / empty ⇒ no suppression (byte-identical).
      opts.blindFacadeWallIds,
      // §DIAG-WINDOW-RULE (founder rule #1 GENERAL) — every glazable room that fronts
      // a façade, so the resolver flags any perimeter room left windowless as a ⚠
      // violation even when its candidates were all dropped. Omitted ⇒ falls back to
      // the emitted-window set (byte-identical).
      option.perimeterWindowRooms
    );
    for (const r of resolved) {
      const openingId = mintId("opening");
      const windowId = mintId("window");
      shellWindowIds.push(windowId);
      const perRoomWindowSysType = r.roomType ? { systemTypeId: defaultWindowSystemTypeId(r.roomType) } : {};
      shellWindowOpeningCommands.push({
        command: "wall.createOpening",
        payload: {
          wallId: r.shellWallId,
          opening: {
            id: openingId,
            type: "window",
            // §A.21.D12 — carry the rich window fields on the OPENING (the
            // input CreateWallOpeningCommand uses to populate windowStore →
            // WindowBuilder glazing). This is the DOMINANT case: apartment +
            // house windows host on the existing shell perimeter. Matching the
            // manual WindowTool's opening (windowType + systemTypeId) makes the
            // generated window resolve a real glazing finish instead of the
            // untyped schema default that read as a blind recessed panel.
            windowType: "single",
            offset: r.offsetM,
            width: r.widthM,
            height: r.heightM,
            sillHeight: r.sillM,
            elementId: windowId,
            ...perRoomWindowSysType
          }
        }
      });
      shellWindowPayloads.push({
        id: windowId,
        wallId: r.shellWallId,
        openingId,
        width: r.widthM,
        height: r.heightM,
        sillHeight: r.sillM,
        offset: r.offsetM,
        ...perRoomWindowSysType,
        ...r.name ? { name: r.name } : {}
      });
    }
  }
  const shellWindowBatch = shellWindowPayloads.length > 0 ? { command: "window.batch.create", payload: { windows: shellWindowPayloads } } : null;
  const boundaryCommands = [];
  const boundaryWarnings = [];
  let droppedBoundaries = 0;
  const finitePt = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  for (let i = 0; i < (option.boundaries ?? []).length; i++) {
    const b = option.boundaries[i];
    if (!finitePt(b.start) || !finitePt(b.end) || Math.hypot((b.end.x - b.start.x) / MM_PER_M$1, (b.end.y - b.start.y) / MM_PER_M$1) < 0.01) {
      droppedBoundaries++;
      continue;
    }
    boundaryCommands.push({
      command: "roomBoundingLine.create",
      // legacy-sync path; no bus verb yet
      payload: {
        id: `rbl_${opts.levelId}_${i}_${Math.random().toString(36).slice(2, 10)}`,
        levelId: opts.levelId,
        start: { x: b.start.x / MM_PER_M$1, z: b.start.y / MM_PER_M$1 },
        end: { x: b.end.x / MM_PER_M$1, z: b.end.y / MM_PER_M$1 }
      }
    });
  }
  if (droppedBoundaries > 0) {
    boundaryWarnings.push(
      `[buildLayoutCommands] §RBL-PLACEMENT-AT-SOURCE dropped ${droppedBoundaries} degenerate room-bounding line(s) (missing/non-finite endpoint or < 10 mm) before emit — not minting placement-less RoomBoundingLine records.`
    );
  }
  const toWorldRoom = opts.planToWorldXZ ?? defaultPlanToWorld$1;
  const roomWarnings = [];
  const roomCommands = [];
  for (const r of option.rooms ?? []) {
    const poly = r.polygon;
    if (!poly || poly.length < 3) {
      roomWarnings.push(
        `[buildLayoutCommands] room "${r.name}" (${r.type}) has no usable polygon (${poly?.length ?? 0} verts) — skipped graph-room creation; falls back to detection.`
      );
      continue;
    }
    roomCommands.push({
      command: "room.create",
      payload: {
        levelId: opts.levelId,
        // World METRES, same frame as wallBatch — the house executor re-applies its
        // weld/project-north transform to these alongside the walls (ADR-0069 GR3).
        polygon: poly.map((p) => toWorldRoom(p)),
        type: r.type,
        name: r.name,
        // `option.rooms[*].occupancy` is already a RoomOccupancyType string
        // (occupancyOf in emitGeometry); the executor validates + falls back to
        // 'unclassified' when absent.
        ...r.occupancy ? { occupancyType: r.occupancy } : {},
        ...typeof r.area === "number" ? { areaM2: r.area } : {}
      }
    });
  }
  return {
    levelId: opts.levelId,
    wallBatch,
    openingCommands,
    doorBatch,
    windowOpeningCommands,
    windowBatch,
    shellWindowOpeningCommands,
    shellWindowBatch,
    shellWindowIds,
    boundaryCommands,
    roomCommands,
    wallIds,
    doorIds,
    windowIds,
    totalElementCount: plan.totalElementCount + shellWindowIds.length + roomCommands.length,
    warnings: [...plan.warnings, ...boundaryWarnings, ...roomWarnings]
  };
}

const SPAN_ON_RING_M = 0.6;
function buildRoomScopedLayoutPayload(input) {
  const ring = input.roomPolygon.map((p) => ({ x: p.x, z: p.z }));
  const edges = roomRingEdges(ring);
  if (edges.length < 3) {
    return {
      kind: "refusal",
      reason: `this room's boundary yields only ${edges.length} usable edge(s) after dropping degenerate segments — the layout engine needs a closed polygon of at least 3. Nothing was changed.`
    };
  }
  const onRing = (p) => edges.some((e) => pointToSegment(p, e.baseLine[0], e.baseLine[1]) <= SPAN_ON_RING_M);
  const windowIds = [];
  const doorIds = [];
  const windowSpansWorld = [];
  const doorSpansWorld = [];
  for (const w of input.boundingWalls) {
    for (const o of w.openings) {
      if (!w.baseLine || typeof o.offset !== "number" || typeof o.width !== "number") continue;
      const [s, e] = w.baseLine;
      const dx = e.x - s.x;
      const dz = e.z - s.z;
      const L = Math.hypot(dx, dz);
      if (L <= 1e-6) continue;
      const ux = dx / L, uz = dz / L;
      const a = { x: s.x + ux * o.offset, z: s.z + uz * o.offset };
      const b = { x: s.x + ux * (o.offset + o.width), z: s.z + uz * (o.offset + o.width) };
      const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (!onRing(midpoint)) continue;
      if (o.type === "window") {
        windowSpansWorld.push({ a, b });
        if (o.elementId) windowIds.push(o.elementId);
      } else if (o.type === "door") {
        doorSpansWorld.push({ a, b });
        if (o.elementId) doorIds.push(o.elementId);
      }
    }
  }
  return {
    kind: "payload",
    payload: {
      levelId: input.levelId,
      // Synthetic ids — the ring reader derives the same set from the SAME
      // helper, so the ≥3-shell-walls validations hold without weakening.
      shellWallIds: edges.map((e) => e.id),
      entranceDoorId: doorIds[0] ?? "",
      windowIds,
      ...windowSpansWorld.length > 0 ? { windowSpansWorld } : {},
      ...doorSpansWorld.length > 0 ? { doorSpansWorld } : {},
      shellRingWorld: ring,
      ...input.lockBedroomCount === true ? { lockBedroomCount: true } : {},
      program: input.program,
      constraints: input.constraints,
      options: { count: input.count, scoringWeights: input.scoringWeights }
    }
  };
}

const _layoutDiagOn = () => globalThis.__pryzmLayoutDiag === true;
const ENTRANCE_DOOR_WIDTH_M = 1;
const ENTRANCE_DOOR_HEIGHT_M = 2.1;
const MIN_DOOR_M = 0.7;
const END_CLEAR_M = 0.15;
const OPENING_GAP_M = 0.1;
function findClearDoorOffset(wallLen, occupied) {
  const lo = END_CLEAR_M;
  const hi = wallLen - END_CLEAR_M;
  if (hi - lo < MIN_DOOR_M) return null;
  const blocked = occupied.map(([s, e]) => [Math.min(s, e) - OPENING_GAP_M, Math.max(s, e) + OPENING_GAP_M]).map(([s, e]) => [Math.max(lo, s), Math.min(hi, e)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push([b[0], b[1]]);
  }
  const free = [];
  let cursor = lo;
  for (const [s, e] of merged) {
    if (s > cursor) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < hi) free.push([cursor, hi]);
  const centre = wallLen / 2;
  let best = null;
  let bestDist = Infinity;
  for (const iv of free) {
    if (iv[1] - iv[0] < MIN_DOOR_M) continue;
    const dist = Math.abs((iv[0] + iv[1]) / 2 - centre);
    if (dist < bestDist) {
      bestDist = dist;
      best = iv;
    }
  }
  if (!best) return null;
  const ivLen = best[1] - best[0];
  const widthM = Math.min(ENTRANCE_DOOR_WIDTH_M, ivLen);
  const offsetM = best[0] + (ivLen - widthM) / 2;
  return { offsetM, widthM };
}
const defaultPlanToWorld = (p) => ({ x: p.x / 1e3, z: p.y / 1e3 });
const segDir = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return len > 1e-9 ? { x: dx / len, z: dz / len, len } : { x: 1, z: 0, len: 0 };
};
const projParam = (p, a, d) => (p.x - a.x) * d.x + (p.z - a.z) * d.z;
const perpDist = (p, a, d) => Math.abs((p.x - a.x) * d.z - (p.z - a.z) * d.x);
function findEntranceHall(rooms) {
  const hall = rooms.find((r) => r.type === "hall");
  if (hall) return hall;
  const corridor = rooms.find((r) => r.type === "corridor");
  return corridor ?? null;
}
function roomCentreWorld(room, planToWorld) {
  if (room.centroid) return planToWorld(room.centroid);
  const poly = room.polygon;
  if (poly && poly.length >= 3) {
    let cx = 0, cz = 0;
    for (const p of poly) {
      const w = planToWorld(p);
      cx += w.x;
      cz += w.z;
    }
    return { x: cx / poly.length, z: cz / poly.length };
  }
  return null;
}
function wallBoundsRoom(wall, polygon, planToWorld, tolM = 0.2) {
  const d = segDir(wall.start, wall.end);
  if (d.len < 1e-6) return false;
  for (const pm of polygon) {
    const p = planToWorld(pm);
    const t = projParam(p, wall.start, d);
    if (t < -tolM || t > d.len + tolM) continue;
    if (perpDist(p, wall.start, d) <= tolM) return true;
  }
  return false;
}
function resolveEntranceDoor(option, shellWalls, planToWorld = defaultPlanToWorld, occupiedSpansByWall, blindFacadeWallIds) {
  if (!shellWalls || shellWalls.length === 0) return null;
  const blind = blindFacadeWallIds instanceof Set ? blindFacadeWallIds : new Set(blindFacadeWallIds ?? []);
  if (blind.size > 0) {
    const nonBlind = shellWalls.filter((w) => !blind.has(w.id));
    if (nonBlind.length === 0) {
      if (_layoutDiagOn()) console.log("[D-TGL] §DIAG-PARTY-WALL entrance: ALL shell walls are blind — no entrance placed");
      return null;
    }
    if (nonBlind.length !== shellWalls.length) {
      if (_layoutDiagOn()) console.log(
        `[D-TGL] §DIAG-PARTY-WALL entrance: excluded ${shellWalls.length - nonBlind.length} blind façade(s) from the entrance candidate set`
      );
    }
    shellWalls = nonBlind;
  }
  const hall = findEntranceHall(option.rooms ?? []);
  const hallBoundsWallIds = hall && hall.polygon && hall.polygon.length >= 3 ? new Set(shellWalls.filter((w) => wallBoundsRoom(w, hall.polygon, planToWorld)).map((w) => w.id)) : /* @__PURE__ */ new Set();
  const finish = (d) => {
    if (d) {
      const onHall = hallBoundsWallIds.size > 0 && hallBoundsWallIds.has(d.shellWallId);
      if (_layoutDiagOn()) console.log(
        `[D-TGL] §DIAG-ENTRANCE door wall=${d.shellWallId} boundsHall=${onHall ? "✓" : "⚠"} hall=${hall ? hall.name ?? hall.type : "none"} ground=✓ offset=${d.offsetM.toFixed(2)}m width=${d.widthM.toFixed(2)}m`
      );
    } else {
      if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-ENTRANCE door=NONE hall=${hall ? hall.name ?? hall.type : "none"} (no hall-bounding shell wall fit a door)`);
    }
    return d;
  };
  let target = hall ? roomCentreWorld(hall, planToWorld) : null;
  if (!target) {
    const centres = (option.rooms ?? []).map((r) => roomCentreWorld(r, planToWorld)).filter((c) => c !== null);
    if (centres.length > 0) {
      const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
      const cz = centres.reduce((s, c) => s + c.z, 0) / centres.length;
      target = { x: cx, z: cz };
    }
  }
  if (!target) {
    const longest = [...shellWalls].sort(
      (a, b) => segDir(b.start, b.end).len - segDir(a.start, a.end).len || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )[0];
    return finish(makeDoorOnWall(longest, hall?.type));
  }
  let candidateWalls = shellWalls;
  if (hallBoundsWallIds.size > 0) {
    candidateWalls = shellWalls.filter((w) => hallBoundsWallIds.has(w.id));
  }
  const cands = [];
  for (const w of candidateWalls) {
    const d = segDir(w.start, w.end);
    if (d.len < MIN_DOOR_M) continue;
    const t = projParam(target, w.start, d);
    const tc = Math.max(0, Math.min(d.len, t));
    const foot = { x: w.start.x + d.x * tc, z: w.start.z + d.z * tc };
    const segDistVal = Math.hypot(target.x - foot.x, target.z - foot.z);
    const perpVal = perpDist(target, w.start, d);
    const score = Math.max(perpVal, segDistVal);
    cands.push({ wall: w, perp: score, len: d.len });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.perp - b.perp);
  const best = cands[0];
  const TIE_M = 0.1;
  const tied = cands.filter((c) => c.perp <= best.perp + TIE_M);
  tied.sort((a, b) => b.len - a.len || (a.wall.id < b.wall.id ? -1 : a.wall.id > b.wall.id ? 1 : 0));
  const chosen = tied[0].wall;
  if (!occupiedSpansByWall || occupiedSpansByWall.size === 0) {
    return finish(makeDoorOnWall(chosen, hall?.type));
  }
  const fallbackOrder = [...cands].sort(
    (a, b) => a.perp - b.perp || b.len - a.len || (a.wall.id < b.wall.id ? -1 : a.wall.id > b.wall.id ? 1 : 0)
  ).map((c) => c.wall);
  const tryOrder = [chosen, ...fallbackOrder.filter((w) => w.id !== chosen.id)];
  const seen = /* @__PURE__ */ new Set();
  for (const w of tryOrder) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const door = makeDoorOnWall(w, hall?.type, occupiedSpansByWall.get(w.id));
    if (door) return finish(door);
  }
  return finish(null);
}
function makeDoorOnWall(wall, hallType, occupiedSpans) {
  const d = segDir(wall.start, wall.end);
  const maxWidthM = d.len - 2 * END_CLEAR_M;
  if (maxWidthM < MIN_DOOR_M) return null;
  let widthM;
  let offsetM;
  if (occupiedSpans && occupiedSpans.length > 0) {
    const clear = findClearDoorOffset(d.len, occupiedSpans);
    if (!clear) return null;
    widthM = clear.widthM;
    offsetM = clear.offsetM;
  } else {
    widthM = Math.min(ENTRANCE_DOOR_WIDTH_M, maxWidthM);
    const centreOffset = (d.len - widthM) / 2;
    const maxOffsetM = Math.max(END_CLEAR_M, d.len - widthM - END_CLEAR_M);
    offsetM = Math.min(Math.max(END_CLEAR_M, centreOffset), maxOffsetM);
  }
  const sysType = defaultEntranceDoorSystemTypeId();
  return {
    shellWallId: wall.id,
    offsetM,
    widthM,
    heightM: ENTRANCE_DOOR_HEIGHT_M,
    ...{ systemTypeId: sysType } ,
    name: "Main Entrance Door"
  };
}

const HOUSE_CIRCULATION_FACTOR = 1.15;
const HOUSE_GROSS_MIN_BAND = 0.55;
const HOUSE_GROSS_MAX_BAND = 2.4;
function storeyRoomTypes(p) {
  const types = [];
  if (p.entranceHall) types.push("hall");
  if (p.livingRoom) types.push("living");
  types.push("kitchen");
  if (p.openPlanKitchenDining) types.push("dining");
  if (p.includeStudy === true) types.push("study");
  if (p.includeUtility === true) types.push("utility");
  const beds = Math.max(0, Math.floor(p.bedrooms));
  const baths = Math.max(0, Math.floor(p.bathrooms));
  if (beds + baths > 0) types.push("corridor");
  for (let i = 0; i < beds; i++) {
    types.push(i === 0 && p.masterEnSuite ? "master" : "bedroom");
  }
  if (p.masterEnSuite && beds > 0) types.push("ensuite");
  for (let i = 0; i < baths; i++) types.push("bathroom");
  return types;
}
function targetAreaForType(type, program) {
  const override = program.roomAreas?.[type];
  if (typeof override === "number" && override > 0) return override;
  const d = dimensionsFor(type);
  return (d.areaComfortableMin + d.areaComfortableMax) / 2;
}
function houseStoreyBand(input) {
  const types = storeyRoomTypes(input.program);
  const programAreaM2 = types.reduce((s, t) => s + targetAreaForType(t, input.program), 0);
  const grossTargetM2 = programAreaM2 * HOUSE_CIRCULATION_FACTOR;
  return {
    programAreaM2,
    grossTargetM2,
    grossMinM2: grossTargetM2 * HOUSE_GROSS_MIN_BAND,
    grossMaxM2: grossTargetM2 * HOUSE_GROSS_MAX_BAND
  };
}
function validateHouseStorey(input) {
  const beds = Math.max(0, Math.floor(input.program.bedrooms));
  const storeyId = `house-storey-${beds}bed`;
  if (!(input.grossAreaM2 > 0)) {
    return {
      admissible: false,
      hardFindings: [{
        roomId: storeyId,
        severity: "hard",
        metric: "grossDegenerate",
        reason: `house storey has non-positive gross area`,
        delta: 1
      }],
      softFindings: []
    };
  }
  const band = houseStoreyBand(input);
  const hard = [];
  const soft = [];
  if (input.grossAreaM2 < band.grossMinM2 - 1e-6) {
    hard.push({
      roomId: storeyId,
      severity: "hard",
      metric: "grossMin",
      delta: 1,
      reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² < hard min ${band.grossMinM2.toFixed(1)} m² for its programme (~${band.programAreaM2.toFixed(0)} m² of rooms — too small to host them)`
    });
  }
  if (input.grossAreaM2 > band.grossMaxM2 + 1e-6) {
    hard.push({
      roomId: storeyId,
      severity: "hard",
      metric: "grossMax",
      delta: 1,
      reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² > hard max ${band.grossMaxM2.toFixed(1)} m² for its programme (~${band.programAreaM2.toFixed(0)} m² of rooms — add more rooms or reduce the plate)`
    });
  }
  if (hard.length === 0) {
    const targetLow = band.grossTargetM2 * 0.75;
    const targetHigh = band.grossTargetM2 * 1.25;
    if (input.grossAreaM2 < targetLow) {
      const range = Math.max(1e-6, targetLow - band.grossMinM2);
      const delta = Math.min(1, (targetLow - input.grossAreaM2) / range);
      soft.push({
        roomId: storeyId,
        severity: "soft",
        metric: "grossTarget",
        delta,
        reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² is tight (target ~${band.grossTargetM2.toFixed(0)} m²)`
      });
    } else if (input.grossAreaM2 > targetHigh) {
      const range = Math.max(1e-6, band.grossMaxM2 - targetHigh);
      const delta = Math.min(1, (input.grossAreaM2 - targetHigh) / range);
      soft.push({
        roomId: storeyId,
        severity: "soft",
        metric: "grossTarget",
        delta,
        reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² is generous (target ~${band.grossTargetM2.toFixed(0)} m²)`
      });
    }
  }
  return {
    admissible: hard.length === 0,
    hardFindings: hard,
    softFindings: soft
  };
}

function wallOutwardNormal(kind) {
  switch (kind) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "back":
      return { x: 0, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}
function aspectScore(kind, bias) {
  if (kind === "central") return 0;
  if (bias?.goodViewKinds?.includes(kind)) return 0;
  const sun = bias?.sunDir;
  if (!sun) return 0.5;
  const n = wallOutwardNormal(kind);
  const dot = n.x * sun.x + n.y * sun.y;
  return (1 - dot) / 2;
}
const WALL_LANDING_MM = 900;
const PERIMETER_MIN_OPEN_MM = 2400;
const TIE_EPS = 1e-6;
const clamp$1 = (v, lo, hi) => hi < lo ? lo : Math.min(hi, Math.max(lo, v));
const r3$2 = (n) => Math.round(n * 1e3) / 1e3;
const EPS_MM = 1e-6;
const SHELL_JITTER_MM = 150;
const SHELL_TIGHT_JITTER_MM = 30;
function pointInPoly$2(px, py, poly, tolMm = 1e-3) {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const L2 = ex * ex + ey * ey;
    if (L2 < EPS_MM * EPS_MM) continue;
    const t = ((px - a.x) * ex + (py - a.y) * ey) / L2;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const qx = a.x + t * ex, qy = a.y + t * ey;
    if (Math.hypot(px - qx, py - qy) <= tolMm) return true;
  }
  return pointInPolygonXY(px, py, poly);
}
function rectInsidePoly(x, y, coreW, coreH, poly, tolMm = SHELL_JITTER_MM) {
  if (poly.length < 3) return true;
  const xs = [x, x + coreW / 2, x + coreW];
  const ys = [y, y + coreH / 2, y + coreH];
  for (const sx of xs) for (const sy of ys) {
    if (!pointInPoly$2(sx, sy, poly, tolMm)) return false;
  }
  return true;
}
function snapRectInsidePoly(x, y, coreW, coreH, plateW, plateH, poly) {
  if (poly.length < 3) return { x, y };
  if (rectInsidePoly(x, y, coreW, coreH, poly, SHELL_TIGHT_JITTER_MM)) return { x, y };
  const cx = plateW / 2 - coreW / 2;
  const cy = plateH / 2 - coreH / 2;
  const ladder = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const f of ladder) {
    const nx = clamp$1(x + (cx - x) * f, 0, Math.max(0, plateW - coreW));
    const ny = clamp$1(y + (cy - y) * f, 0, Math.max(0, plateH - coreH));
    if (rectInsidePoly(nx, ny, coreW, coreH, poly, SHELL_TIGHT_JITTER_MM)) return { x: nx, y: ny };
  }
  for (const f of ladder) {
    const nx = clamp$1(x + (cx - x) * f, 0, Math.max(0, plateW - coreW));
    const ny = clamp$1(y + (cy - y) * f, 0, Math.max(0, plateH - coreH));
    if (rectInsidePoly(nx, ny, coreW, coreH, poly, SHELL_JITTER_MM)) return { x: nx, y: ny };
  }
  return { x, y };
}
function stairCoreWaste(plateW, plateH, coreW, coreH, x, y) {
  if (plateW <= 0 || plateH <= 0) return 0;
  const plateArea = plateW * plateH;
  const gapLeft = Math.max(0, x);
  const gapRight = Math.max(0, plateW - (x + coreW));
  const gapFront = Math.max(0, y);
  const gapBack = Math.max(0, plateH - (y + coreH));
  const USABLE = 2400;
  const sliverCost = (gap) => {
    if (gap <= 1) return 0;
    if (gap >= USABLE) return 0;
    const t = gap / USABLE;
    return (t < 0.5 ? t : 1 - t) * 2;
  };
  const wasteArea = sliverCost(gapLeft) * coreH + sliverCost(gapRight) * coreH + sliverCost(gapFront) * coreW + sliverCost(gapBack) * coreW;
  const flush = (g) => g <= 1 ? 1 : 0;
  const flushSides = flush(gapLeft) + flush(gapRight) + flush(gapBack);
  const flushBonus = flushSides * 0.04 * plateArea;
  return (wasteArea - flushBonus) / plateArea;
}
function stairCorePositionCandidates(plateW, plateH, coreW, coreH, shellPoly) {
  const out = [];
  const cx = clamp$1(plateW / 2 - coreW / 2, 0, Math.max(0, plateW - coreW));
  const backThirdY = clamp$1(plateH / 3, WALL_LANDING_MM, Math.max(WALL_LANDING_MM, plateH - coreH));
  const central = shellPoly && shellPoly.length >= 3 && !rectInsidePoly(cx, backThirdY, coreW, coreH, shellPoly) ? containedCentral(cx, backThirdY, plateW, plateH, coreW, coreH, shellPoly) : { x: cx, y: backThirdY };
  out.push({ x: r3$2(central.x), y: r3$2(central.y), kind: "central" });
  const fitsX = plateW - coreW >= PERIMETER_MIN_OPEN_MM;
  const fitsY = plateH - coreH >= PERIMETER_MIN_OPEN_MM;
  const cornerY = Math.max(WALL_LANDING_MM, plateH - coreH);
  const containedAt = (x, y, tolMm) => !shellPoly || shellPoly.length < 3 || rectInsidePoly(x, y, coreW, coreH, shellPoly, tolMm);
  const PERIM_NUDGE_MM = WALL_LANDING_MM;
  const NUDGE_LADDER = [0, 25, 50, 100, 150, 250, 400, 600, PERIM_NUDGE_MM];
  const containedNudged = (flushX, flushY, normX, normY, secX, secY) => {
    if (!shellPoly || shellPoly.length < 3) return { x: flushX, y: flushY };
    const at = (dx, dy) => ({
      x: clamp$1(flushX + dx, 0, Math.max(0, plateW - coreW)),
      y: clamp$1(flushY + dy, 0, Math.max(0, plateH - coreH))
    });
    const candidatesInward = [];
    for (const a of NUDGE_LADDER) {
      candidatesInward.push(at(normX * a, normY * a));
    }
    for (const a of NUDGE_LADDER) {
      for (const b of NUDGE_LADDER) {
        if (a === 0 && b === 0) continue;
        candidatesInward.push(at(normX * a + secX * b, normY * a + secY * b));
      }
    }
    for (const p of candidatesInward) {
      if (containedAt(p.x, p.y, SHELL_TIGHT_JITTER_MM)) return p;
    }
    for (const p of candidatesInward) {
      if (containedAt(p.x, p.y, SHELL_JITTER_MM)) return p;
    }
    return null;
  };
  if (fitsX) {
    const l = containedNudged(0, cornerY, 1, 0, 0, -1);
    if (l) out.push({ x: r3$2(l.x), y: r3$2(l.y), kind: "left" });
    const r = containedNudged(plateW - coreW, cornerY, -1, 0, 0, -1);
    if (r) out.push({ x: r3$2(r.x), y: r3$2(r.y), kind: "right" });
  }
  if (fitsY) {
    const by = Math.max(WALL_LANDING_MM, plateH - coreH);
    const b = containedNudged(cx, by, 0, -1, -1, 0);
    if (b) out.push({ x: r3$2(b.x), y: r3$2(b.y), kind: "back" });
  }
  return out;
}
function containedCentral(cx, cy, plateW, plateH, coreW, coreH, poly) {
  const plateCx = plateW / 2 - coreW / 2;
  const plateCy = plateH / 2 - coreH / 2;
  for (const f of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const x = clamp$1(cx + (plateCx - cx) * f, 0, Math.max(0, plateW - coreW));
    const y = clamp$1(cy + (plateCy - cy) * f, 0, Math.max(0, plateH - coreH));
    if (rectInsidePoly(x, y, coreW, coreH, poly)) return { x, y };
  }
  return { x: cx, y: cy };
}
function isConcavePlate(poly) {
  if (!poly || poly.length < 4) return false;
  const n = poly.length;
  let sawPos = false, sawNeg = false;
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const norm = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    if (norm < 1e-6) continue;
    const turn = cross / norm;
    if (turn > 0.05) sawPos = true;
    else if (turn < -0.05) sawNeg = true;
    if (sawPos && sawNeg) return true;
  }
  return false;
}
function chooseStairCorePosition(plateW, plateH, coreW, coreH, shellPoly, aspect) {
  const candidates = stairCorePositionCandidates(plateW, plateH, coreW, coreH, shellPoly);
  const PERIMETER_PREFERENCE = 1;
  const ASPECT_WEIGHT = 0.25;
  const FRAGMENT_PENALTY = 0.5;
  const CORNER_FLUSH_TOL_MM = SHELL_JITTER_MM;
  const MID_EDGE_NO_CORNER_PENALTY = 2;
  const LOOSE_CONTAIN_PENALTY = 0.6;
  const tightlyContained = (c) => {
    if (c.kind === "central") return true;
    if (!shellPoly || shellPoly.length < 3) return true;
    return rectInsidePoly(c.x, c.y, coreW, coreH, shellPoly, SHELL_TIGHT_JITTER_MM);
  };
  const flushS = (g) => g <= CORNER_FLUSH_TOL_MM ? 1 : 0;
  const isCornerCarve = (c) => {
    if (c.kind === "central") return false;
    const flushSide = flushS(c.x) + flushS(plateW - (c.x + coreW));
    const flushBack = flushS(plateH - (c.y + coreH));
    return flushSide >= 1 && flushBack >= 1;
  };
  const CENTRAL_SPINE_BANK_MIN = PERIMETER_MIN_OPEN_MM;
  const flankL = Math.max(0, plateW / 2 - coreW / 2);
  const flankR = flankL;
  const frontDepth = Math.max(0, plateH / 3);
  const backDepth = Math.max(0, plateH - (plateH / 3 + coreH));
  const centralSpineViable = flankL >= CENTRAL_SPINE_BANK_MIN && flankR >= CENTRAL_SPINE_BANK_MIN && frontDepth >= CENTRAL_SPINE_BANK_MIN && backDepth >= WALL_LANDING_MM;
  const hasPerimeterCandidate = candidates.some((c) => c.kind !== "central");
  const preferCentralSpine = centralSpineViable && !hasPerimeterCandidate;
  const hasCornerCandidate = candidates.some((c) => c.kind !== "central" && isCornerCarve(c));
  const plateIsConcave = isConcavePlate(shellPoly);
  const cost = (c) => {
    const waste = stairCoreWaste(plateW, plateH, coreW, coreH, c.x, c.y);
    if (!aspect) return waste;
    const centralPenalty = c.kind === "central" ? preferCentralSpine ? 0 : PERIMETER_PREFERENCE : 0;
    const fragPenalty = c.kind !== "central" && !isCornerCarve(c) ? plateIsConcave && !hasCornerCandidate ? MID_EDGE_NO_CORNER_PENALTY : FRAGMENT_PENALTY : 0;
    const loosePenalty = c.kind !== "central" && !tightlyContained(c) ? LOOSE_CONTAIN_PENALTY : 0;
    return waste + centralPenalty + fragPenalty + loosePenalty - ASPECT_WEIGHT * aspectScore(c.kind, aspect);
  };
  let best = candidates[0];
  let bestCost = cost(best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const w = cost(c);
    if (w < bestCost - TIE_EPS) {
      best = c;
      bestCost = w;
    }
  }
  const bestWaste = stairCoreWaste(plateW, plateH, coreW, coreH, best.x, best.y);
  const flushOf = (g) => g <= CORNER_FLUSH_TOL_MM ? 1 : 0;
  const classify = (c) => {
    if (c.kind === "central") return "CENTRAL";
    const flushX = flushOf(c.x) + flushOf(plateW - (c.x + coreW));
    const flushBack = flushOf(plateH - (c.y + coreH));
    return flushX >= 1 && flushBack >= 1 ? "CORNER" : "MID-EDGE";
  };
  for (const c of candidates) {
    console.log(
      `[D-TGL] §DIAG-STAIR cand kind=${c.kind} pos=${classify(c)} x=${Math.round(c.x)} y=${Math.round(c.y)} waste=${stairCoreWaste(plateW, plateH, coreW, coreH, c.x, c.y).toFixed(4)} aspect=${aspect ? aspectScore(c.kind, aspect).toFixed(2) : "n/a"}${c === best ? " <-- WINNER" : ""}`
    );
  }
  console.log(
    `[D-TGL] §DIAG-STAIR winner kind=${best.kind} pos=${classify(best)} waste=${r3$2(bestWaste)} plate=${Math.round(plateW)}x${Math.round(plateH)} core=${Math.round(coreW)}x${Math.round(coreH)} aspectBias=${aspect ? "on" : "off"} ${classify(best) === "CENTRAL" || classify(best) === "MID-EDGE" ? "(predicts plate fragmentation — rooms may merge)" : "(clean corner carve — one dominant rect)"}`
  );
  return { x: best.x, y: best.y, waste: r3$2(bestWaste), kind: best.kind };
}
function aspectFromSunDir(latDeg) {
  if (latDeg === void 0 || !Number.isFinite(latDeg) || Math.abs(latDeg) < 10) return null;
  return latDeg >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

function aspectBiasFor(solar) {
  if (!solar) return void 0;
  const sunDir = solar.sunDirLayout !== void 0 ? solar.sunDirLayout : aspectFromSunDir(solar.latDeg);
  return { sunDir };
}
const STAIR_W_MM = 1e3;
const STAIR_H_MM = 3e3;
const STAIR_TREAD_MM = 270;
const STAIR_RUN_MARGIN_MM = 300;
const MAX_FRACTION = 0.45;
const MIN_DIM_MM = 600;
function bboxOf(footprint) {
  if (footprint.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, minZ, maxX, maxZ };
}
const r3$1 = (n) => Math.round(n * 1e3) / 1e3;
function plateLocalPolyMm(footprint, bb) {
  return footprint.map((p) => ({ x: (p.x - bb.minX) * 1e3, y: (p.z - bb.minZ) * 1e3 }));
}
function reserveStairCore(footprint, _storeyCount, solar, totalRisers) {
  const bb = bboxOf(footprint);
  const plateWmm = Math.max(0, (bb.maxX - bb.minX) * 1e3);
  const plateHmm = Math.max(0, (bb.maxZ - bb.minZ) * 1e3);
  const runDepthMm = totalRisers && totalRisers > 0 ? Math.round(totalRisers) * STAIR_TREAD_MM + STAIR_RUN_MARGIN_MM : STAIR_H_MM;
  const maxW = plateWmm * MAX_FRACTION;
  const maxH = plateHmm * MAX_FRACTION;
  let w = Math.min(STAIR_W_MM, maxW > 0 ? maxW : STAIR_W_MM);
  let h = Math.min(runDepthMm, maxH > 0 ? maxH : runDepthMm);
  w = Math.max(Math.min(MIN_DIM_MM, plateWmm > 0 ? plateWmm : MIN_DIM_MM), w);
  h = Math.max(Math.min(MIN_DIM_MM, plateHmm > 0 ? plateHmm : MIN_DIM_MM), h);
  const minXmm = bb.minX * 1e3;
  const minZmm = bb.minZ * 1e3;
  const poly = plateLocalPolyMm(footprint, bb);
  const pos = chooseStairCorePosition(
    plateWmm,
    plateHmm,
    w,
    h,
    poly,
    aspectBiasFor(solar)
  );
  let lx = clamp(pos.x, 0, Math.max(0, plateWmm - w));
  let ly = clamp(pos.y, 0, Math.max(0, plateHmm - h));
  ({ x: lx, y: ly } = snapRectInsidePoly(lx, ly, w, h, plateWmm, plateHmm, poly));
  return { x: r3$1(minXmm + lx), y: r3$1(minZmm + ly), w: r3$1(w), h: r3$1(h) };
}
function clamp(v, lo, hi) {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, v));
}
const L_W_MM = 1600;
const L_H_MM = 1600;
const U_W_MM = 2e3;
const U_H_MM = 2800;
const MIN_SHAPED_W_MM = L_W_MM;
const MIN_SHAPED_H_MM = L_H_MM;
const I_ASPECT_MIN = 2.2;
function chooseStairShape(availWmm, availHmm) {
  if (availWmm < MIN_SHAPED_W_MM || availHmm < MIN_SHAPED_H_MM) return "I";
  const longer = Math.max(availWmm, availHmm);
  const shorter = Math.max(1, Math.min(availWmm, availHmm));
  const aspect = longer / shorter;
  if (aspect >= I_ASPECT_MIN) return "I";
  if (availWmm >= U_W_MM && availHmm >= U_H_MM) return "U";
  if (availWmm >= L_W_MM && availHmm >= L_H_MM) return "L";
  return "I";
}
function splitRisersForShape(shape, totalRisers) {
  if (shape === "I" || totalRisers < 3) return { before: 0, after: totalRisers };
  const before = Math.max(1, Math.floor(totalRisers / 2));
  const after = Math.max(1, totalRisers - before);
  return { before, after };
}
function reserveStairCoreShaped(footprint, storeyCount, totalRisers, solar) {
  const bb = bboxOf(footprint);
  const plateWmm = Math.max(0, (bb.maxX - bb.minX) * 1e3);
  const plateHmm = Math.max(0, (bb.maxZ - bb.minZ) * 1e3);
  const availW = plateWmm * MAX_FRACTION;
  const availH = plateHmm * MAX_FRACTION;
  const shape = chooseStairShape(
    availW > 0 ? availW : Infinity,
    availH > 0 ? availH : Infinity
  );
  if (shape === "I") {
    const rect = reserveStairCore(footprint, storeyCount, solar, totalRisers);
    const iPoly = plateLocalPolyMm(footprint, bb);
    const iPos = chooseStairCorePosition(
      plateWmm,
      plateHmm,
      rect.w,
      rect.h,
      iPoly,
      aspectBiasFor(solar)
    );
    return { rectMm: rect, shape: "I", risersBeforeLanding: 0, landingDepthM: 0, interiorSide: iPos.kind };
  }
  const targetW = shape === "U" ? U_W_MM : L_W_MM;
  const targetH = shape === "U" ? U_H_MM : L_H_MM;
  let w = Math.min(targetW, availW > 0 ? availW : targetW);
  let h = Math.min(targetH, availH > 0 ? availH : targetH);
  w = Math.max(Math.min(MIN_DIM_MM, plateWmm > 0 ? plateWmm : MIN_DIM_MM), w);
  h = Math.max(Math.min(MIN_DIM_MM, plateHmm > 0 ? plateHmm : MIN_DIM_MM), h);
  const minXmm = bb.minX * 1e3;
  const minZmm = bb.minZ * 1e3;
  const poly = plateLocalPolyMm(footprint, bb);
  const pos = chooseStairCorePosition(
    plateWmm,
    plateHmm,
    w,
    h,
    poly,
    aspectBiasFor(solar)
  );
  let lx = clamp(pos.x, 0, Math.max(0, plateWmm - w));
  let ly = clamp(pos.y, 0, Math.max(0, plateHmm - h));
  ({ x: lx, y: ly } = snapRectInsidePoly(lx, ly, w, h, plateWmm, plateHmm, poly));
  const x = minXmm + lx;
  const y = minZmm + ly;
  const { before } = splitRisersForShape(shape, Math.max(2, Math.round(totalRisers)));
  const landingDepthM = shape === "U" ? 2 : 1;
  return {
    rectMm: { x: r3$1(x), y: r3$1(y), w: r3$1(w), h: r3$1(h) },
    shape,
    risersBeforeLanding: before,
    landingDepthM,
    // §STAIR-HALF-LANDING-INWARD — the winning placement kind tells the executor
    // which side of the plate the interior lies on, so a U-stair's half-landing +
    // return flight fold INWARD (not out past the flush perimeter wall).
    interiorSide: pos.kind
  };
}

const STAIR_RISER_TARGET_M$1 = 0.18;
const STAIR_RISER_MIN_M = 0.15;
const STAIR_RISER_MAX_M = 0.19;
const STAIR_TREAD_M = 0.27;
const STAIR_WIDTH_M = 1;
const MM_PER_M = 1e3;
function resolveTotalRisers(floorToFloorM) {
  let totalRisers = Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M$1));
  let riserHeight = floorToFloorM / totalRisers;
  while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) {
    totalRisers++;
    riserHeight = floorToFloorM / totalRisers;
  }
  while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) {
    totalRisers--;
    riserHeight = floorToFloorM / totalRisers;
  }
  return totalRisers;
}
function normaliseSplit(shape, totalRisers, before) {
  if (shape === "I" || totalRisers < 3) return { before: totalRisers, after: 0 };
  let b = Math.max(1, Math.min(totalRisers - 1, Math.round(before || Math.floor(totalRisers / 2))));
  if (totalRisers - b < 1) b = totalRisers - 1;
  return { before: b, after: totalRisers - b };
}
function unit(d) {
  const len = Math.hypot(d.x, d.z) || 1;
  return { x: d.x / len, y: 0, z: d.z / len };
}
function rotateXZ(p, angleRad, pivot) {
  if (angleRad === 0) return { x: p.x, y: p.y, z: p.z };
  const r = rotatePt({ x: p.x, z: p.z }, angleRad, pivot);
  return { x: r.x, y: p.y, z: r.z };
}
function rotateXZDir(d, angleRad) {
  if (angleRad === 0) return { x: d.x, y: d.y, z: d.z };
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
}
function buildFlightsLayout(shape, start, dir1, split, width, tread, interiorSide) {
  const d1 = unit(dir1);
  if (shape === "I") {
    return { flights: [{ direction: d1, riserCount: split.before }], landings: [], secondRunSide: "left" };
  }
  const d2raw = shape === "L" ? { x: -d1.z, z: d1.x } : { x: -d1.x, z: -d1.z };
  const d2 = unit(d2raw);
  if (shape === "L") {
    return {
      flights: [
        { direction: d1, riserCount: split.before },
        { direction: d2, riserCount: split.after }
      ],
      landings: [{ depth: width }],
      secondRunSide: "left"
    };
  }
  const firstLen = split.before * tread;
  const legacyPerp = unit({ x: -d1.z, z: d1.x });
  const interiorDir = interiorSide === "left" ? { x: 1, z: 0 } : interiorSide === "right" ? { x: -1, z: 0 } : interiorSide === "back" ? { x: 0, z: -1 } : null;
  const interiorDot = interiorDir ? interiorDir.x * legacyPerp.x + interiorDir.z * legacyPerp.z : 0;
  const perp = Math.abs(interiorDot) > 1e-6 ? unit({ x: legacyPerp.x * Math.sign(interiorDot), z: legacyPerp.z * Math.sign(interiorDot) }) : legacyPerp;
  const secondStart = {
    x: start.x + d1.x * (firstLen + tread) + perp.x * width,
    y: start.y,
    z: start.z + d1.z * (firstLen + tread) + perp.z * width
  };
  const secondRunSide = Math.abs(interiorDot) > 1e-6 && Math.sign(interiorDot) < 0 ? "right" : "left";
  return {
    flights: [
      { direction: d1, riserCount: split.before },
      { direction: d2, riserCount: split.after, startOverride: secondStart }
    ],
    landings: [{ depth: 2 * width }],
    secondRunSide
  };
}
function computeStairWorldFootprint(input, containOffset = { x: 0, z: 0 }) {
  const x0 = input.rectMm.x / MM_PER_M;
  const z0 = input.rectMm.y / MM_PER_M;
  const wM = input.rectMm.w / MM_PER_M;
  const hM = input.rectMm.h / MM_PER_M;
  const runAlongZ = hM >= wM;
  const shape = input.shape;
  const width = STAIR_WIDTH_M;
  const tread = STAIR_TREAD_M;
  const startY = input.startY ?? 0;
  const principalAxisRad = input.principalAxisRad ?? 0;
  const pivot = input.pivot ?? { x: 0, z: 0 };
  const totalRisers = resolveTotalRisers(input.floorToFloorM);
  const engFlights = input.flights && input.flights.length > 0 ? input.flights : null;
  const dir1Layout = runAlongZ ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const before = engFlights && engFlights.length === 2 ? engFlights[0].riserCount : shape === "I" ? totalRisers : Math.max(1, input.risersBeforeLanding ?? Math.floor(totalRisers / 2));
  const split = normaliseSplit(shape, totalRisers, before);
  const startLayout = runAlongZ ? { x: x0 + wM / 2, y: startY, z: z0 } : { x: x0, y: startY, z: z0 + hM / 2 };
  const built = buildFlightsLayout(shape, startLayout, dir1Layout, split, width, tread, input.interiorSide);
  const startPosition0 = rotateXZ(startLayout, principalAxisRad, pivot);
  const worldFlights0 = built.flights.map((f, idx) => ({
    ...f,
    direction: engFlights?.[idx] ? engFlights[idx].direction : unit(rotateXZDir(f.direction, principalAxisRad)),
    ...f.startOverride ? { startOverride: rotateXZ(f.startOverride, principalAxisRad, pivot) } : {}
  }));
  const dx = containOffset.x, dz = containOffset.z;
  const startPosition = dx || dz ? { x: startPosition0.x + dx, y: startPosition0.y, z: startPosition0.z + dz } : startPosition0;
  const worldFlights = dx || dz ? worldFlights0.map((f) => ({
    ...f,
    ...f.startOverride ? { startOverride: { x: f.startOverride.x + dx, y: f.startOverride.y, z: f.startOverride.z + dz } } : {}
  })) : worldFlights0;
  const footprintWorld = computeStairFootprintRectPure({
    width,
    treadDepth: tread,
    startPosition,
    flights: worldFlights,
    landings: built.landings
  });
  return {
    startPosition,
    flights: worldFlights,
    landings: built.landings,
    secondRunSide: built.secondRunSide,
    totalRisers,
    split,
    footprintWorld
  };
}
function computeStairFootprintRectPure(input) {
  if (!input.flights.length) return null;
  const dir1 = input.flights[0].direction;
  const dirLen = Math.hypot(dir1.x, dir1.z);
  if (dirLen < 1e-6) return null;
  const u = { x: dir1.x / dirLen, z: dir1.z / dirLen };
  const v = { x: -u.z, z: u.x };
  const origin = input.startPosition;
  const halfW = input.width / 2;
  const toLocal = (p) => {
    const dx = p.x - origin.x, dz = p.z - origin.z;
    return { u: dx * u.x + dz * u.z, v: dx * v.x + dz * v.z };
  };
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  const accumulate = (p) => {
    const lp = toLocal(p);
    if (lp.u < minU) minU = lp.u;
    if (lp.u > maxU) maxU = lp.u;
    if (lp.v < minV) minV = lp.v;
    if (lp.v > maxV) maxV = lp.v;
  };
  const addFlightRect = (start, dirN, length) => {
    const perpN = { x: -dirN.z, z: dirN.x };
    const end = { x: start.x + dirN.x * length, z: start.z + dirN.z * length };
    const hw = { x: perpN.x * halfW, z: perpN.z * halfW };
    accumulate({ x: start.x - hw.x, z: start.z - hw.z });
    accumulate({ x: start.x + hw.x, z: start.z + hw.z });
    accumulate({ x: end.x - hw.x, z: end.z - hw.z });
    accumulate({ x: end.x + hw.x, z: end.z + hw.z });
    return end;
  };
  let cursor = { x: origin.x, z: origin.z };
  let prevDir = u;
  for (let i = 0; i < input.flights.length; i++) {
    const f = input.flights[i];
    const dLen = Math.hypot(f.direction.x, f.direction.z);
    if (dLen < 1e-6) continue;
    const dN = { x: f.direction.x / dLen, z: f.direction.z / dLen };
    let start;
    if (f.startOverride) {
      start = { x: f.startOverride.x, z: f.startOverride.z };
    } else if (i === 0) {
      start = { x: origin.x, z: origin.z };
    } else {
      const landing = input.landings?.[i - 1];
      const landingDepth = landing?.depth ?? input.width;
      start = { x: cursor.x + prevDir.x * landingDepth, z: cursor.z + prevDir.z * landingDepth };
    }
    const flightTread = f.treadDepth ?? input.treadDepth;
    const length = f.riserCount * flightTread;
    const end = addFlightRect(start, dN, length);
    if (i < input.flights.length - 1) {
      const landing = input.landings?.[i];
      if (landing) {
        const halfLW = input.width / 2;
        const perpN = { x: -dN.z, z: dN.x };
        const lEnd = { x: end.x + dN.x * landing.depth, z: end.z + dN.z * landing.depth };
        accumulate({ x: end.x - perpN.x * halfLW, z: end.z - perpN.z * halfLW });
        accumulate({ x: end.x + perpN.x * halfLW, z: end.z + perpN.z * halfLW });
        accumulate({ x: lEnd.x - perpN.x * halfLW, z: lEnd.z - perpN.z * halfLW });
        accumulate({ x: lEnd.x + perpN.x * halfLW, z: lEnd.z + perpN.z * halfLW });
      }
    }
    cursor = end;
    prevDir = dN;
  }
  if (!isFinite(minU) || !isFinite(minV)) return null;
  const corner = (lu, lv) => ({
    x: origin.x + u.x * lu + v.x * lv,
    z: origin.z + u.z * lu + v.z * lv
  });
  return [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
}

function pointInPoly$1(p, poly, tol = 1e-6) {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b.x - a.x, ez = b.z - a.z;
    const L2 = ex * ex + ez * ez;
    if (L2 < 1e-18) continue;
    let t = ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a.x + t * ex, qz = a.z + t * ez;
    if (Math.hypot(p.x - qx, p.z - qz) <= tol) return true;
  }
  return pointInPolygonXZ(p.x, p.z, poly);
}
function allCornersInside(corners, poly, tol = 1e-3) {
  if (poly.length < 3 || corners.length === 0) return true;
  return corners.every((c) => pointInPoly$1(c, poly, tol));
}
function computeInwardContainmentOffset(footprintCornersWorld, shellPolyWorld, inwardDirWorld, stepM = 0.1, maxM = 3) {
  if (shellPolyWorld.length < 3 || footprintCornersWorld.length === 0) return { dx: 0, dz: 0 };
  if (allCornersInside(footprintCornersWorld, shellPolyWorld)) return { dx: 0, dz: 0 };
  const len = Math.hypot(inwardDirWorld.x, inwardDirWorld.z);
  if (len < 1e-9) return { dx: 0, dz: 0 };
  const ux = inwardDirWorld.x / len, uz = inwardDirWorld.z / len;
  const step = stepM > 1e-6 ? stepM : 0.1;
  for (let d = step; d <= maxM + 1e-9; d += step) {
    const dx = ux * d, dz = uz * d;
    const shifted = footprintCornersWorld.map((c) => ({ x: c.x + dx, z: c.z + dz }));
    if (allCornersInside(shifted, shellPolyWorld)) return { dx, dz };
  }
  return { dx: 0, dz: 0 };
}
function polyCentroid(poly) {
  if (poly.length === 0) return { x: 0, z: 0 };
  let cx = 0, cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / poly.length, z: cz / poly.length };
}
function solveStairContainmentWorld(footprintCornersWorld, shellPolyWorld, inwardDirWorld) {
  const n = footprintCornersWorld.length;
  if (shellPolyWorld.length < 3 || n === 0) {
    return { dx: 0, dz: 0, alreadyInside: true, viaCentroid: false, cornersInShell: n };
  }
  const alreadyInside = allCornersInside(footprintCornersWorld, shellPolyWorld);
  const centroid = polyCentroid(shellPolyWorld);
  let fx = 0, fz = 0;
  for (const c of footprintCornersWorld) {
    fx += c.x;
    fz += c.z;
  }
  fx /= n;
  fz /= n;
  const centroidDir = { x: centroid.x - fx, z: centroid.z - fz };
  const inward = Math.hypot(inwardDirWorld.x, inwardDirWorld.z) > 1e-6 ? inwardDirWorld : centroidDir;
  let { dx, dz } = computeInwardContainmentOffset(footprintCornersWorld, shellPolyWorld, inward, 0.1, 4);
  let viaCentroid = false;
  if (dx === 0 && dz === 0 && !alreadyInside && Math.hypot(centroidDir.x, centroidDir.z) > 1e-6) {
    const off2 = computeInwardContainmentOffset(footprintCornersWorld, shellPolyWorld, centroidDir, 0.05, 8);
    dx = off2.dx;
    dz = off2.dz;
    if (dx !== 0 || dz !== 0) viaCentroid = true;
  }
  const shifted = footprintCornersWorld.map((c) => ({ x: c.x + dx, z: c.z + dz }));
  const cornersInShell = shifted.filter((c) => pointInPoly$1(c, shellPolyWorld, 1e-3)).length;
  return { dx, dz, alreadyInside, viaCentroid, cornersInShell };
}

const GROUND_CORRIDOR_DIRECT = ["bedroom", "study", "bathroom"];
const UPPER_CORRIDOR_DIRECT = ["bedroom", "master", "study", "bathroom"];
function clampStoreyCount$1(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}
function allocateProgramToStoreys(program, storeyCount, perStoreyOverrides) {
  const storeys = clampStoreyCount$1(storeyCount);
  const hasOverrides = !!perStoreyOverrides && perStoreyOverrides.some((o) => o != null && Object.keys(o).length > 0);
  console.log(
    `[D-TGL] §DIAG-ALLOC brief: storeys=${storeys} bedrooms=${program.bedrooms} baths=${program.bathrooms} masterEnSuite=${program.masterEnSuite === true} kitchen=${program.includeKitchen !== false} living=${program.livingRoom === true} hall=${program.entranceHall === true} openPlanKD=${program.openPlanKitchenDining === true}`
  );
  const logAllocStorey = (s) => {
    const p = s.program;
    console.log(
      `[D-TGL] §DIAG-ALLOC storey[${s.storeyIndex}] role=${s.role} bedrooms=${Math.max(0, Math.floor(p.bedrooms))} baths=${Math.max(0, Math.floor(p.bathrooms))} kitchen=${p.includeKitchen !== false} living=${p.livingRoom === true} hall=${p.entranceHall === true} ensuite=${p.masterEnSuite === true}`
    );
  };
  if (storeys === 1) {
    const out2 = [
      { storeyIndex: 0, role: "ground", program: { ...program, entranceHall: true } }
    ];
    if (hasOverrides) applyPerStoreyOverrides(out2, perStoreyOverrides);
    assertHallSingleton(out2);
    out2.forEach(logAllocStorey);
    return out2;
  }
  const totalBedrooms = Math.max(0, Math.floor(program.bedrooms));
  const totalBathrooms = Math.max(0, Math.floor(program.bathrooms));
  const groundBedrooms = totalBedrooms >= 2 ? 1 : 0;
  const upperBedrooms = totalBedrooms - groundBedrooms;
  const groundBathrooms = totalBathrooms > 0 ? 1 : 0;
  const upperBathrooms = totalBathrooms - groundBathrooms;
  const upperCount = storeys - 1;
  const bedroomsPerUpper = distributeEven(upperBedrooms, upperCount);
  const bathroomsPerUpper = distributeEven(upperBathrooms, upperCount);
  const bedroomCounts = [groundBedrooms, ...bedroomsPerUpper];
  const bathroomCounts = [groundBathrooms, ...bathroomsPerUpper];
  applyFloorOverrides(program.roomFloorByName, storeys, bedroomCounts, bathroomCounts);
  const out = [];
  out.push({
    storeyIndex: 0,
    role: "ground",
    program: {
      bedrooms: bedroomCounts[0] ?? 0,
      bathrooms: bathroomCounts[0] ?? 0,
      // The master (with its en-suite) is upstairs by default, so the
      // ground keeps no en-suite even if the house has one.
      masterEnSuite: false,
      // Kitchen/dining + living + entrance hall are house-entrance features.
      includeKitchen: true,
      // §A.21.x-KITCHEN — the house kitchen lives on the ground floor only
      openPlanKitchenDining: program.openPlanKitchenDining,
      livingRoom: program.livingRoom,
      // §HALL-SINGLETON (ADR-0063 #1) — the ground storey ALWAYS carries the one
      // entrance hall (the house's single entry). Forced ON regardless of the
      // brief flag so a brief that omits it never yields a hall-less house.
      entranceHall: true,
      // §FORCE-CORRIDOR-DIRECT — the corridor directly serves the ground private rooms.
      corridorDirectRoomTypes: GROUND_CORRIDOR_DIRECT,
      ...program.roomAreas ? { roomAreas: program.roomAreas } : {},
      ...program.roomAreasByName ? { roomAreasByName: program.roomAreasByName } : {}
    }
  });
  for (let i = 0; i < upperCount; i++) {
    const isFirstUpper = i === 0;
    const role = "upper";
    out.push({
      storeyIndex: i + 1,
      role,
      program: {
        bedrooms: bedroomCounts[i + 1] ?? 0,
        bathrooms: bathroomCounts[i + 1] ?? 0,
        masterEnSuite: isFirstUpper ? program.masterEnSuite : false,
        includeKitchen: false,
        // §A.21.x-KITCHEN — SPEC-CASA §3: upper storeys have NO kitchen
        openPlanKitchenDining: false,
        livingRoom: false,
        // §LANDING-NOT-HALL (G14, 2026-06-09) — an UPPER storey must NOT mint an
        // entrance hall. An "Entrance Hall" is where the FRONT DOOR lands and can
        // ONLY exist on the GROUND (entrance) floor; an upper storey is reached by
        // the stair, which arrives at a LANDING (circulation), not an entrance hall.
        // The bubble graph mints a `hall` named "Entrance Hall" purely from
        // `entranceHall === true`, so we leave it OFF here — the stair-arrival
        // circulation seed is the `corridor` the engine already mints whenever
        // bedrooms+bathrooms > 0 (guaranteed on every upper storey by
        // `enrichStoreyProgramToPlate`'s upper room-set floor), named "Landing" on
        // upper storeys by the executor's naming pass.
        entranceHall: false,
        // §FORCE-CORRIDOR-DIRECT — first floor and above: EVERY habitable room (except
        // en-suite/closet) connects DIRECTLY to the corridor spine (the founder's rule).
        corridorDirectRoomTypes: UPPER_CORRIDOR_DIRECT,
        ...program.roomAreas ? { roomAreas: program.roomAreas } : {},
        ...program.roomAreasByName ? { roomAreasByName: program.roomAreasByName } : {}
      }
    });
  }
  if (hasOverrides) applyPerStoreyOverrides(out, perStoreyOverrides);
  assertHallSingleton(out);
  out.forEach(logAllocStorey);
  return out;
}
function applyPerStoreyOverrides(out, overrides) {
  for (let i = 0; i < out.length; i++) {
    const ov = overrides[out[i].storeyIndex];
    if (!ov || Object.keys(ov).length === 0) continue;
    const base = out[i].program;
    const merged = { ...base };
    let bedroomsExplicit = false;
    if (typeof ov.bedrooms === "number" && Number.isFinite(ov.bedrooms)) {
      merged.bedrooms = Math.max(0, Math.floor(ov.bedrooms));
      bedroomsExplicit = true;
    }
    if (typeof ov.bathrooms === "number" && Number.isFinite(ov.bathrooms)) {
      merged.bathrooms = Math.max(0, Math.floor(ov.bathrooms));
    }
    if (typeof ov.livingRoom === "boolean") merged.livingRoom = ov.livingRoom;
    if (typeof ov.includeKitchen === "boolean") merged.includeKitchen = ov.includeKitchen;
    if (typeof ov.openPlanKitchenDining === "boolean") merged.openPlanKitchenDining = ov.openPlanKitchenDining;
    if (typeof ov.masterEnSuite === "boolean") merged.masterEnSuite = ov.masterEnSuite;
    if (ov.roomAreas && Object.keys(ov.roomAreas).length > 0) {
      merged.roomAreas = { ...base.roomAreas ?? {}, ...ov.roomAreas };
    }
    if (ov.corridorDirectRoomTypes && ov.corridorDirectRoomTypes.length > 0) {
      merged.corridorDirectRoomTypes = [...ov.corridorDirectRoomTypes];
    }
    out[i] = { ...out[i], program: merged, ...bedroomsExplicit ? { bedroomsExplicit: true } : {} };
    console.log(
      `[D-TGL] §PER-STOREY-PROGRAM storey[${out[i].storeyIndex}] override applied: bed=${merged.bedrooms} bath=${merged.bathrooms} kitchen=${merged.includeKitchen !== false} living=${merged.livingRoom === true} openPlanKD=${merged.openPlanKitchenDining === true} ensuite=${merged.masterEnSuite === true}`
    );
  }
}
function assertHallSingleton(out) {
  let groundFlag = false;
  let upperFlags = 0;
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    const wantsHall = s.program.entranceHall === true;
    if (s.role === "ground") {
      if (!wantsHall) out[i] = { ...s, program: { ...s.program, entranceHall: true } };
      groundFlag = true;
    } else {
      if (wantsHall) {
        out[i] = { ...s, program: { ...s.program, entranceHall: false } };
        upperFlags++;
      }
    }
  }
  const groundHalls = out.filter((s) => s.role === "ground" && s.program.entranceHall === true).length;
  const upperHalls = out.filter((s) => s.role !== "ground" && s.program.entranceHall === true).length;
  const ok = groundHalls === 1 && upperHalls === 0;
  console.log(
    `[D-TGL] §HALL-SINGLETON storeys=${out.length} groundHall=${groundHalls} upperHalls=${upperHalls} ${ok ? "✓" : "⚠ CORRECTED"}` + (groundFlag ? "" : " (no ground storey!)") + (upperFlags > 0 ? ` strippedUpperHall=${upperFlags}` : "")
  );
}
function classifyRoomName(roomName) {
  const n = roomName.toLowerCase();
  if (n.includes("kitchen") || n.includes("living") || n.includes("dining") || n.includes("entrance hall") || n === "hall") {
    return "pinned";
  }
  if (n.includes("bedroom")) return "bedroom";
  if (n.includes("bathroom") || n.includes("en-suite") || n.includes("ensuite") || n.includes("wc")) {
    return "bathroom";
  }
  return "pinned";
}
function parseFloorNodeId(nodeId) {
  const m = /^storey:(\d+)\/(.+)$/.exec(nodeId.trim());
  if (!m) return null;
  const sourceStorey = Number.parseInt(m[1], 10);
  const roomName = m[2].trim();
  if (!Number.isFinite(sourceStorey) || !roomName) return null;
  return { sourceStorey, roomName };
}
function applyFloorOverrides(overrides, storeys, bedroomCounts, bathroomCounts) {
  if (!overrides) return;
  const entries = Object.keys(overrides).sort();
  for (const nodeId of entries) {
    const target = overrides[nodeId];
    const reject = (reason) => {
      console.log(`[D-TGL] §DIAG-FLOOR-OVERRIDE moved ${nodeId} → REJECTED: ${reason}`);
    };
    if (typeof target !== "number" || !Number.isFinite(target)) {
      reject("non-finite target");
      continue;
    }
    const targetStorey = Math.floor(target);
    const parsed = parseFloorNodeId(nodeId);
    if (!parsed) {
      reject("node id not storey-qualified (storey:<s>/<name>)");
      continue;
    }
    const { sourceStorey, roomName } = parsed;
    if (targetStorey < 0 || targetStorey >= storeys) {
      reject(`target storey ${targetStorey} out of range [0,${storeys - 1}]`);
      continue;
    }
    if (sourceStorey < 0 || sourceStorey >= storeys) {
      reject(`source storey ${sourceStorey} out of range`);
      continue;
    }
    if (targetStorey === sourceStorey) {
      reject("source == target storey (no move)");
      continue;
    }
    const kind = classifyRoomName(roomName);
    if (kind === "pinned") {
      reject(`"${roomName}" is a floor-pinned type (kitchen/dining/living/hall stay GROUND-only)`);
      continue;
    }
    const counts = kind === "bedroom" ? bedroomCounts : bathroomCounts;
    if ((counts[sourceStorey] ?? 0) <= 0) {
      reject(`no ${kind} on source storey ${sourceStorey} to move`);
      continue;
    }
    counts[sourceStorey] = (counts[sourceStorey] ?? 0) - 1;
    counts[targetStorey] = (counts[targetStorey] ?? 0) + 1;
    console.log(`[D-TGL] §DIAG-FLOOR-OVERRIDE moved ${roomName} (${kind}) storey ${sourceStorey} → storey ${targetStorey}`);
  }
}
function distributeEven(total, buckets) {
  if (buckets <= 0) return [];
  const base = Math.floor(total / buckets);
  const rem = total - base * buckets;
  const out = [];
  for (let i = 0; i < buckets; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

const MAX_GROUND_FILL_BEDROOMS = 2;
const TARGET_FILL_FRACTION = 0.85;
function bathroomsForBedrooms(bedrooms) {
  return Math.max(1, Math.floor(bedrooms / 2));
}
function fillGroundPlate(program, plateAreaM2, bedroomsExplicit = false) {
  if (bedroomsExplicit) {
    const beds = Math.max(0, Math.floor(program.bedrooms));
    const baths = Math.max(0, Math.floor(program.bathrooms));
    const addStudy2 = plateAreaM2 >= 200;
    const addUtility2 = plateAreaM2 >= 240;
    return {
      ...program,
      bedrooms: beds,
      bathrooms: baths,
      masterEnSuite: false,
      // the master/en-suite stays upstairs
      includeStudy: program.includeStudy === true || addStudy2,
      includeUtility: program.includeUtility === true || addUtility2
    };
  }
  const allocatedGroundBeds = Math.max(0, Math.floor(program.bedrooms));
  const largeGroundCap = Math.min(3, Math.max(MAX_GROUND_FILL_BEDROOMS, Math.floor(plateAreaM2 / 90)));
  const xlGuestBeds = plateAreaM2 >= 270 ? 2 : 1;
  const bedCap = allocatedGroundBeds === 0 ? largeGroundCap : Math.max(1, Math.min(xlGuestBeds, allocatedGroundBeds + (xlGuestBeds - 1)));
  const floored = {
    ...program,
    bedrooms: Math.max(1, Math.floor(program.bedrooms)),
    bathrooms: Math.max(1, Math.floor(program.bathrooms))
  };
  const scaled = scaleProgramToShell(floored, plateAreaM2, "ground");
  const groundBeds = Math.min(bedCap, Math.max(floored.bedrooms, scaled.bedrooms));
  const addStudy = plateAreaM2 >= 200;
  const addUtility = plateAreaM2 >= 240;
  return {
    ...floored,
    bedrooms: groundBeds,
    // 1 bath per 2 bedrooms, ≥ the existing count (a WC + a guest bath).
    bathrooms: Math.max(floored.bathrooms, bathroomsForBedrooms(groundBeds)),
    // The master/en-suite stays UPSTAIRS — the ground never gets one here
    // (mirrors `allocateProgramToStoreys`, which keeps masterEnSuite false on
    // the ground role).
    masterEnSuite: false,
    // §HOUSE-GROUND-PUBLIC-SET — grow the PUBLIC room set on a large plate. Never
    // turn a user-stated flag OFF (only OR-in): a brief that already asked for a
    // study/utility keeps it.
    includeStudy: floored.includeStudy === true || addStudy,
    includeUtility: floored.includeUtility === true || addUtility
  };
}
function enrichStoreyProgramToPlate(program, plateAreaM2, role, opts = {}) {
  const beforeBeds = Math.max(0, Math.floor(program.bedrooms));
  const beforeBaths = Math.max(0, Math.floor(program.bathrooms));
  const targetAreaM2 = plateAreaM2 > 0 ? plateAreaM2 * TARGET_FILL_FRACTION : 0;
  console.log(
    `[D-TGL] §DIAG-ENRICH before: role=${role} plateAreaM2=${Math.round(plateAreaM2)} targetFillM2=${Math.round(targetAreaM2)} (frac=${TARGET_FILL_FRACTION}) bedrooms=${beforeBeds} baths=${beforeBaths} living=${program.livingRoom === true} kitchen=${program.includeKitchen !== false} hall=${program.entranceHall === true} growBedrooms=${opts.growBedrooms === true} growGroundRooms=${opts.growGroundRooms === true}`
  );
  const logEnrichAfter = (r, why) => {
    const ab = Math.max(0, Math.floor(r.bedrooms));
    const abt = Math.max(0, Math.floor(r.bathrooms));
    console.log(
      `[D-TGL] §DIAG-ENRICH after: role=${role} path=${why} bedrooms=${beforeBeds}->${ab} (+${ab - beforeBeds}) baths=${beforeBaths}->${abt} (+${abt - beforeBaths}) living=${r.livingRoom === true} kitchen=${r.includeKitchen !== false} dining=${r.openPlanKitchenDining === true} ensuite=${r.masterEnSuite === true}`
    );
    return r;
  };
  if (!(plateAreaM2 > 0)) return logEnrichAfter({ ...program }, "no-plate");
  let enriched = { ...program };
  if (role === "ground") {
    enriched = {
      ...enriched,
      livingRoom: true,
      entranceHall: true,
      includeKitchen: enriched.includeKitchen ?? true,
      // A ground floor reads as a home with a dining zone; default open-plan
      // on so the kitchen has a dining companion rather than the kitchen blob
      // stretching to fill the plate.
      // §RESPECT-OPENPLAN-TOGGLE (founder 2026-06-17 "I unchecked open-plan but it
      // stays open") — DEFERRED: honouring the unchecked box needs a TRI-STATE
      // (explicit-false vs unset) because the boolean default `false` here is
      // indistinguishable from a user uncheck, so `?? true` broke the empty-brief
      // ground-public-set guarantee (houseProgramFloor.test.ts:238). Needs an
      // optional `openPlanKitchenDining?: boolean` through the brief schema +
      // modal, then respect only an explicitly-stated false. Tracked, not forced.
      openPlanKitchenDining: true,
      // §DIAG-MERGE-DIVIDER (tracker §57.3, 2026-06-11) — the open-plan merge on a
      // HOUSE ground floor is the literal KITCHEN + DINING (one kitchen-diner). The
      // LIVING room is a SEPARATE, fully WALLED room — never merged into the dining
      // zone. PREVIOUSLY the ground forced openPlanKitchenDining=true under the
      // legacy "lounge-diner" edge, which opened LIVING ↔ DINING and SUPPRESSED the
      // divider between them, so room detection flooded the gap and shipped the
      // compound "Living Room / Dining" (and on deeper plates a corridor/bathroom
      // was swept in). Forcing this false moves the open threshold to kitchen↔dining
      // and keeps Living's sealing partition. (Never turn a user-stated TRUE off —
      // but the ground enrich never sets this true, so this is the authoritative
      // ground default.) Apartment path never calls fillGroundPlate/this branch, so
      // the apartment output is byte-identical (the flag defaults to legacy there).
      openPlanLivingDining: false
    };
  } else if (role === "upper") {
    enriched = {
      ...enriched,
      bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
      bathrooms: Math.max(1, Math.floor(enriched.bathrooms)),
      entranceHall: false,
      includeKitchen: false,
      openPlanKitchenDining: false,
      livingRoom: false
    };
    console.log(
      `[D-TGL] §LANDING-NOT-HALL role=upper hall=false circulation=corridor->Landing (beds=${Math.max(1, Math.floor(enriched.bedrooms))} baths=${Math.max(1, Math.floor(enriched.bathrooms))})`
    );
  }
  if (role === "ground" && opts.growGroundRooms && !opts.growBedrooms) {
    return logEnrichAfter(
      fillGroundPlate(enriched, plateAreaM2, opts.bedroomsExplicit === true),
      "fillGroundPlate"
    );
  }
  if (!opts.growBedrooms) return logEnrichAfter(enriched, "room-set-floor");
  const floored = {
    ...enriched,
    bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
    bathrooms: Math.max(1, Math.floor(enriched.bathrooms))
  };
  const scaled = scaleProgramToShell(floored, plateAreaM2, "upper");
  enriched = {
    ...enriched,
    bedrooms: Math.max(floored.bedrooms, scaled.bedrooms),
    bathrooms: Math.max(floored.bathrooms, scaled.bathrooms),
    // A house with ≥3 bedrooms gets a master en-suite (parity with
    // scaleProgramToShell); never DOWN-grade an explicit en-suite.
    masterEnSuite: enriched.masterEnSuite || scaled.masterEnSuite
  };
  return logEnrichAfter(enriched, "grow-bedrooms");
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;
function roofBaseElevationM(storeyCount, floorToFloorM, baseElevationM = 0, wallHeightM) {
  const storeys = Number.isFinite(storeyCount) ? Math.max(1, Math.floor(storeyCount)) : 1;
  const ftf = Number.isFinite(floorToFloorM) && floorToFloorM > 0 ? floorToFloorM : 3;
  const base = Number.isFinite(baseElevationM) ? baseElevationM : 0;
  const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : ftf;
  const topStoreyFloorY = base + (storeys - 1) * ftf;
  return r6(topStoreyFloorY + wh);
}
function roofBaseOffsetM(floorToFloorM, wallHeightM) {
  const ftf = Number.isFinite(floorToFloorM) && floorToFloorM > 0 ? floorToFloorM : 3;
  const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : ftf;
  return r6(wh);
}
const DOOR_END_CLEAR_M = 0.15;
const MIN_DOOR_WIDTH_M = 0.7;
function isDoorWithinWallSpan(offsetM, widthM, wallLengthM, clearM = DOOR_END_CLEAR_M) {
  if (!Number.isFinite(offsetM) || !Number.isFinite(widthM) || !Number.isFinite(wallLengthM)) return false;
  if (widthM <= 0 || wallLengthM <= 0) return false;
  const clear = Math.max(0, clearM);
  return offsetM >= clear - COINCIDENT_M && offsetM + widthM <= wallLengthM - clear + COINCIDENT_M;
}
function clampDoorToWallSpan(offsetM, widthM, wallLengthM, clearM = DOOR_END_CLEAR_M) {
  if (!Number.isFinite(wallLengthM) || wallLengthM <= 0) return null;
  const clear = Math.max(0, clearM);
  const maxWidth = wallLengthM - 2 * clear;
  if (maxWidth < MIN_DOOR_WIDTH_M) return null;
  const w = Math.min(Math.max(MIN_DOOR_WIDTH_M, Number.isFinite(widthM) && widthM > 0 ? widthM : maxWidth), maxWidth);
  const minOff = clear;
  const maxOff = wallLengthM - w - clear;
  const desired = Number.isFinite(offsetM) ? offsetM : (wallLengthM - w) / 2;
  const off = Math.min(Math.max(minOff, desired), Math.max(minOff, maxOff));
  return { offsetM: r6(off), widthM: r6(w) };
}
function wallVerticalExtents(floorElevationsM, wallHeightM, slabThicknessM) {
  const n = floorElevationsM.length;
  const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : 3;
  const half = (Number.isFinite(slabThicknessM) && slabThicknessM > 0 ? slabThicknessM : 0) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const floor = floorElevationsM[i];
    const isGround = i === 0;
    const isTop = i === n - 1;
    const baseY = isGround ? floor : floor - half;
    const topY = isTop ? floor + wh : floor + wh + half;
    out.push({ baseY: r6(baseY), topY: r6(topY), heightM: r6(topY - baseY) });
  }
  return out;
}
function wallExtentForLevel(floorElevationM, wallHeightM, slabThicknessM, hasLevelBelow, hasLevelAbove) {
  const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : 3;
  const half = (Number.isFinite(slabThicknessM) && slabThicknessM > 0 ? slabThicknessM : 0) / 2;
  const baseY = hasLevelBelow ? floorElevationM - half : floorElevationM;
  const topY = hasLevelAbove ? floorElevationM + wh + half : floorElevationM + wh;
  return { baseY: r6(baseY), topY: r6(topY), heightM: r6(topY - baseY) };
}

const CIRCULATION_TYPES = /* @__PURE__ */ new Set(["corridor", "hall", "stair", "landing", "lobby"]);
const SERVED_WITHIN = /* @__PURE__ */ new Set(["ensuite", "enSuite", "closet", "wardrobe", "walkin"]);
function builtPlanReach(option) {
  const rooms = (option.rooms ?? []).filter(
    (r) => !!r && typeof r.name === "string" && r.name.length > 0
  );
  const measuredOnDoorGraph = rooms.length > 0 && rooms.every((r) => Array.isArray(r.doorAdjacentTo));
  const typeOf = (r) => String(r.type ?? "").toLowerCase();
  const isCirc = (t) => CIRCULATION_TYPES.has(t);
  const isDestination = (r) => !isCirc(typeOf(r)) && !SERVED_WITHIN.has(typeOf(r));
  const destinations = rooms.filter(isDestination);
  if (destinations.length === 0) return { strandedRoomNames: [], measuredOnDoorGraph };
  const idxByName = /* @__PURE__ */ new Map();
  rooms.forEach((r, i) => {
    const a = idxByName.get(r.name);
    if (a) a.push(i);
    else idxByName.set(r.name, [i]);
  });
  const adj = rooms.map(() => []);
  rooms.forEach((r, i) => {
    for (const n of (measuredOnDoorGraph ? r.doorAdjacentTo : r.adjacentTo) ?? []) {
      if (typeof n !== "string") continue;
      for (const j of idxByName.get(n) ?? []) {
        if (j === i) continue;
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  });
  const sorted = rooms.map((r, i) => ({ r, i })).sort((a, b) => a.r.name < b.r.name ? -1 : a.r.name > b.r.name ? 1 : a.i - b.i);
  const root = sorted.find((x) => typeOf(x.r) === "hall") ?? sorted.find((x) => typeOf(x.r) === "corridor") ?? sorted.find((x) => typeOf(x.r) === "stair") ?? sorted.find((x) => isCirc(typeOf(x.r))) ?? sorted[0];
  const seen = /* @__PURE__ */ new Set([root.i]);
  const queue = [root.i];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of (adj[cur] ?? []).slice().sort((x, y) => x - y)) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  const stranded = [];
  rooms.forEach((r, i) => {
    if (isDestination(r) && !seen.has(i)) stranded.push(r.name);
  });
  stranded.sort();
  return { strandedRoomNames: stranded, measuredOnDoorGraph };
}
const list = (names) => names.join(", ");
function renderLine(v) {
  const head = `Storey ${v.storeyIndex} (${v.levelId})`;
  if (v.status === "not-measured") {
    return `${head}: NOT MEASURED — ${v.notMeasuredDetail ?? "no circulation verdict exists for this storey."}`;
  }
  if (v.status === "sound") return "";
  const parts = [];
  if (v.doorlessRoomNames.length > 0) parts.push(`no door at all: ${list(v.doorlessRoomNames)}`);
  if (v.strandedRoomNames.length > 0) {
    parts.push(`cannot be reached from the entrance in the BUILT plan: ${list(v.strandedRoomNames)}`);
  }
  if (v.unreachableRoomNames.length > 0) {
    parts.push(`unreachable per the engine's own plan graph: ${list(v.unreachableRoomNames)}`);
  }
  if (v.unroutedToCirculationRoomNames.length > 0) {
    parts.push(`no door onto circulation (served through another room): ${list(v.unroutedToCirculationRoomNames)}`);
  }
  if (v.corridorStairGap) parts.push("the corridor does not meet the stair");
  if (v.corridorHallGap) parts.push("the corridor does not meet the entrance hall");
  if (v.failedRules.length > 0) parts.push(`rules failed: ${list(v.failedRules)}`);
  if (v.roomListUnderstates) {
    parts.push(
      "the circulation spine is broken, so anything reachable ONLY through the far side is cut off too — the rooms named above are NOT the whole list"
    );
  }
  const label = v.status === "sealed" ? "SEALED" : "UNSOUND";
  return `${head}: ${label} — ${parts.join(" · ")}`;
}
function judgeStoreyCirculation(input) {
  const base = {
    storeyIndex: input.storeyIndex,
    levelId: input.levelId,
    failedRules: [],
    unreachableRoomNames: [],
    unroutedToCirculationRoomNames: [],
    doorlessRoomNames: [],
    strandedRoomNames: [],
    corridorStairGap: false,
    corridorHallGap: false,
    // NOT-MEASURED storeys carry empty lists, and an empty list is not a short list —
    // the `notMeasuredReason` already says nothing was measured. Understatement is a
    // claim about a MEASURED list, so it is false here rather than vacuously true.
    roomListUnderstates: false
  };
  if (!input.option) {
    const partial2 = {
      ...base,
      status: "not-measured",
      notMeasuredReason: "no-layout-for-storey",
      notMeasuredDetail: `this storey shipped no layout at all (the engine returned ${input.optionCount} candidate${input.optionCount === 1 ? "" : "s"}), so its circulation was never evaluated. This is not a pass.`
    };
    return { ...partial2, line: renderLine(partial2) };
  }
  const c = input.option.circulation;
  const reach = builtPlanReach(input.option);
  if (!c) {
    const partial2 = {
      ...base,
      status: "not-measured",
      notMeasuredReason: "engine-verdict-absent",
      strandedRoomNames: reach.strandedRoomNames,
      roomListUnderstates: !reach.measuredOnDoorGraph,
      notMeasuredDetail: "this storey shipped a layout that carries no circulation verdict — it did not come from the deterministic layout engine, so no hard rule was ever evaluated against it. This is not a pass. " + (reach.strandedRoomNames.length > 0 ? `Walking the doors that DID ship, these rooms cannot be reached from the entrance: ${list(reach.strandedRoomNames)}.` : reach.measuredOnDoorGraph ? "Walking the doors that DID ship, every room is reachable — but that is one check, not the rule set." : "Its rooms carry no door graph, so not even reachability could be checked.")
    };
    return { ...partial2, line: renderLine(partial2) };
  }
  const spineSevered = c.corridorStairGap || c.corridorHallGap;
  const sealed = c.unreachableRoomNames.length > 0 || c.doorlessRoomNames.length > 0 || reach.strandedRoomNames.length > 0 || spineSevered;
  const otherDefect = !c.hardValid || c.unroutedToCirculationRoomNames.length > 0;
  const status = sealed ? "sealed" : otherDefect ? "unsound" : "sound";
  const failedRules = reach.strandedRoomNames.length > 0 && c.hardFailedRules.length === 0 ? ["built-plan-reach (failed in the SHIPPED door graph; the engine's own rules all passed)"] : c.hardFailedRules.length > 0 ? c.hardFailedRules : sealed ? ["reach (rule not named by the engine)"] : c.hardFailedRules;
  const partial = {
    storeyIndex: input.storeyIndex,
    levelId: input.levelId,
    status,
    failedRules,
    unreachableRoomNames: c.unreachableRoomNames,
    unroutedToCirculationRoomNames: c.unroutedToCirculationRoomNames,
    doorlessRoomNames: c.doorlessRoomNames,
    strandedRoomNames: reach.strandedRoomNames,
    corridorStairGap: c.corridorStairGap,
    corridorHallGap: c.corridorHallGap,
    // A severed spine strands rooms the engine's list omits; a missing door graph
    // means the reach BFS fell back to wall adjacency, which INFLATES reachability.
    // Either way the lists above are short and must not be shown as exhaustive.
    roomListUnderstates: spineSevered || !reach.measuredOnDoorGraph
  };
  return { ...partial, line: renderLine(partial) };
}
const plural = (n, one, many) => n === 1 ? one : many;
function renderHeadline(total, sealed, unsound, notMeasured) {
  const clauses = [];
  if (sealed > 0) {
    clauses.push(
      `${sealed} of ${total} ${plural(total, "storey", "storeys")} ships with a sealed room (a room with no door, or one the entrance cannot reach)`
    );
  }
  if (unsound > 0) {
    clauses.push(
      `${unsound} ${plural(unsound, "storey", "storeys")} failed a hard circulation rule without sealing a room`
    );
  }
  if (notMeasured > 0) {
    clauses.push(
      `${notMeasured} ${plural(notMeasured, "storey", "storeys")} could not be checked at all — NOT MEASURED, which is not the same as sound`
    );
  }
  return `${clauses.join("; ")}.`;
}
function buildHouseCirculationReport(inputs) {
  const storeys = inputs.map(judgeStoreyCirculation);
  const sealedStoreys = storeys.filter((v) => v.status === "sealed");
  const unsoundStoreys = storeys.filter((v) => v.status === "unsound");
  const notMeasuredStoreys = storeys.filter((v) => v.status === "not-measured");
  const storeysSound = storeys.filter((v) => v.status === "sound").length;
  const report = {
    storeys,
    storeysTotal: storeys.length,
    storeysSound,
    storeysSealed: sealedStoreys.length,
    storeysUnsound: unsoundStoreys.length,
    storeysNotMeasured: notMeasuredStoreys.length
  };
  if (sealedStoreys.length === 0 && unsoundStoreys.length === 0 && notMeasuredStoreys.length === 0) {
    return { ...report, banner: null };
  }
  const severity = sealedStoreys.length > 0 ? "blocking" : notMeasuredStoreys.length > 0 ? "unknown" : "advisory";
  const failedRules = Array.from(
    new Set(storeys.flatMap((v) => v.failedRules))
  ).sort();
  const measured = storeys.length - notMeasuredStoreys.length;
  const qualifier = `Checked ${measured} of ${storeys.length} ${plural(storeys.length, "storey", "storeys")} · the layout was generated and SHIPPED anyway — this is a warning about what was built, not a refusal to build it · a storey listed as NOT MEASURED has not been judged sound.`;
  return {
    ...report,
    banner: {
      severity,
      headline: renderHeadline(
        storeys.length,
        sealedStoreys.length,
        unsoundStoreys.length,
        notMeasuredStoreys.length
      ),
      qualifier,
      sealedStoreys,
      unsoundStoreys,
      notMeasuredStoreys,
      failedRules,
      lines: storeys.filter((v) => v.line.length > 0).map((v) => v.line)
    }
  };
}

const DEFAULT_FLOOR_TO_FLOOR_M = 3;
const DEFAULT_BASE_ELEVATION_M = 0;
const DEFAULT_ROOF_KIND = "gable";
const DEFAULT_ROOF_PITCH_DEG = 30;
const STAIR_RISER_TARGET_M = 0.18;
const STAIR_DEFAULT_LAT_DEG = 45;
function resolveFlightPlans(core, totalRisers, principalAxisRad) {
  const runAlongZ = core.rectMm.h >= core.rectMm.w;
  const toWorld = (d) => {
    const r = principalAxisRad === 0 ? d : rotatePt(d, principalAxisRad, { x: 0, z: 0 });
    return { x: r.x, y: 0, z: r.z };
  };
  const dir1 = toWorld(runAlongZ ? { x: 0, z: 1 } : { x: 1, z: 0 });
  if (core.shape === "I") {
    return [{ riserCount: totalRisers, direction: dir1 }];
  }
  const { before, after } = splitRisersForShape(core.shape, totalRisers);
  const a1 = runAlongZ ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const a2 = core.shape === "L" ? { x: -a1.z, z: a1.x } : { x: -a1.x, z: -a1.z };
  const dir2 = toWorld(a2);
  return [
    { riserCount: before, direction: dir1 },
    { riserCount: after, direction: dir2 }
  ];
}
function totalRisersForGap(floorToFloorM) {
  return Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
}
function clampStoreyCount(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}
const r3 = (n) => Math.round(n * 1e3) / 1e3;
function stairCoreAreaM2(rectMm) {
  return rectMm.w / 1e3 * (rectMm.h / 1e3);
}
const DEFAULT_VARIANT_COUNT = 3;
function bestStoreyOptionIndex(options) {
  if (options.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if ((options[i].score?.overall ?? 0) > (options[best].score?.overall ?? 0)) best = i;
  }
  return best;
}
function generateHouseLayout(shell, program, constraints, weights, opts) {
  const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, DEFAULT_VARIANT_COUNT);
  return assembleHouse(enumerated, (_storeyIdx, options) => {
    const idx = bestStoreyOptionIndex(options);
    return idx >= 0 ? options[idx] ?? null : null;
  });
}
function generateHouseLayoutOptions(shell, program, constraints, weights, opts, count = DEFAULT_VARIANT_COUNT) {
  const wanted = Math.max(1, Math.floor(Number.isFinite(count) ? count : 3));
  const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, wanted);
  const out = [];
  const seenSelections = /* @__PURE__ */ new Set();
  for (let v = 0; v < wanted; v++) {
    const selection = enumerated.perStorey.map((storey, s) => {
      const n = storey.options.length;
      if (n === 0) return -1;
      return v === 0 ? bestStoreyOptionIndex(storey.options) : (v + s) % n;
    });
    const key = selection.join(",");
    if (seenSelections.has(key)) continue;
    seenSelections.add(key);
    const result = assembleHouse(enumerated, (storeyIdx, options) => {
      const idx = selection[storeyIdx];
      return idx != null && idx >= 0 ? options[idx] ?? null : null;
    });
    const scored = result.perStoreyLayout.filter(
      (o) => o != null
    );
    const overallScore = scored.length > 0 ? Math.round(scored.reduce((s, o) => s + (o.score?.overall ?? 0), 0) / scored.length) : 0;
    out.push({ result, overallScore, variantIndex: out.length });
  }
  out.sort((a, b) => b.overallScore - a.overallScore || a.variantIndex - b.variantIndex);
  return out.map((o, i) => ({ ...o, variantIndex: i }));
}
function containStairCoreUpstream(reserved, shellWorld, totalRisers, floorToFloorM, principalAxisRad, pivot, storeyCount) {
  const flights = resolveFlightPlans(reserved, totalRisers, principalAxisRad);
  const fpInput = {
    rectMm: reserved.rectMm,
    shape: reserved.shape,
    flights: flights.map((f) => ({ riserCount: f.riserCount, direction: f.direction })),
    risersBeforeLanding: reserved.risersBeforeLanding,
    interiorSide: reserved.interiorSide,
    principalAxisRad,
    pivot,
    floorToFloorM,
    startY: 0
    // footprint is XZ-only; y is ignored by computeStairFootprintRect
  };
  const built0 = computeStairWorldFootprint(fpInput, { x: 0, z: 0 });
  const fp0 = built0.footprintWorld;
  if (!fp0 || fp0.length < 3 || shellWorld.length < 3) {
    return { containOffsetWorld: { x: 0, z: 0 }, footprintWorld: fp0, footprintLayout: null };
  }
  const toLayout = (fp) => principalAxisRad === 0 ? fp : fp.map((c) => rotatePt(c, -principalAxisRad, pivot));
  const sideLayout = reserved.interiorSide === "left" ? { x: 1, z: 0 } : reserved.interiorSide === "right" ? { x: -1, z: 0 } : reserved.interiorSide === "back" ? { x: 0, z: -1 } : { x: 0, z: 0 };
  const inwardWorld = principalAxisRad === 0 ? sideLayout : rotatePt(sideLayout, principalAxisRad, { x: 0, z: 0 });
  const solved = solveStairContainmentWorld(fp0, shellWorld, inwardWorld);
  console.log(
    `[house-layout] §DIAG-STAIR-CONTAIN-UPSTREAM storey=0..${storeyCount - 1} offset=(${solved.dx.toFixed(2)},${solved.dz.toFixed(2)}) cornersInShell=${solved.cornersInShell}/4${solved.alreadyInside ? " (already-contained)" : solved.viaCentroid ? " (via-centroid)" : ""}`
  );
  const fpFinal = solved.dx === 0 && solved.dz === 0 ? fp0 : fp0.map((c) => ({ x: c.x + solved.dx, z: c.z + solved.dz }));
  const kind = reserved.interiorSide;
  const r1Corner = kind !== "central";
  const r2WorstAspect = kind === "back" || kind === "left" || kind === "right";
  const r4Contained = solved.cornersInShell === 4;
  const x0 = Math.min(...fpFinal.map((c) => c.x)), z0 = Math.min(...fpFinal.map((c) => c.z));
  const x1 = Math.max(...fpFinal.map((c) => c.x)), z1 = Math.max(...fpFinal.map((c) => c.z));
  const keepOutCorners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const keepOutInShell = keepOutCorners.filter((c) => allCornersInside([c], shellWorld)).length;
  const r3NoRoomOverlap = keepOutInShell === 4;
  const v = (ok) => ok ? "✓" : "⚠ VIOLATION";
  console.log(
    `[house-layout] §DIAG-STAIR-RULE kind=${kind} R1-corner-not-central=${v(r1Corner)} R2-worst-aspect-wall=${v(r2WorstAspect)} R3-no-room-overlap(keepOutInShell=${keepOutInShell}/4)=${v(r3NoRoomOverlap)} R4-footprint-in-shell(cornersInShell=${solved.cornersInShell}/4)=${v(r4Contained)}`
  );
  const centralSpine = kind === "central";
  const r1ok = r1Corner || centralSpine;
  const r2ok = r2WorstAspect || centralSpine;
  if (!r1ok || !r2ok || !r3NoRoomOverlap || !r4Contained) {
    console.warn(
      `[house-layout] §DIAG-STAIR-RULE ⚠ one or more stair rules VIOLATED (kind=${kind} — a MID-EDGE/marooned stair holes the subdivision; cornersInShell<4 pokes the shell). See §DIAG-STAIR candidate scores above for WHY this candidate won.`
    );
  }
  const worldCellArea = (x1 - x0) * (z1 - z0);
  const e01 = Math.hypot(fpFinal[1].x - fpFinal[0].x, fpFinal[1].z - fpFinal[0].z);
  const e12 = Math.hypot(fpFinal[2].x - fpFinal[1].x, fpFinal[2].z - fpFinal[1].z);
  const footprintArea = Math.max(1e-6, e01 * e12);
  const fpLayout = toLayout(fpFinal);
  const lx0 = Math.min(...fpLayout.map((c) => c.x)), lz0 = Math.min(...fpLayout.map((c) => c.z));
  const lx1 = Math.max(...fpLayout.map((c) => c.x)), lz1 = Math.max(...fpLayout.map((c) => c.z));
  const layoutCellArea = (lx1 - lx0) * (lz1 - lz0);
  const cellToFootprintLayout = layoutCellArea / footprintArea;
  const cellToFootprintWorld = worldCellArea / footprintArea;
  const disposition = centralSpine ? "central-spine (U, two banks)" : `cornered (${kind})`;
  console.log(
    `[house-layout] §DIAG-STAIR-FOOTPRINT-RATIO storey=0..${storeyCount - 1} carvedCell=${layoutCellArea.toFixed(1)}m² footprint=${footprintArea.toFixed(1)}m² cellToFootprint=${cellToFootprintLayout.toFixed(2)}× (worldAABB=${worldCellArea.toFixed(1)}m²=${cellToFootprintWorld.toFixed(2)}×, rotation-inflated) disposition=${disposition}${cellToFootprintLayout > 1.6 ? " ⚠ OVERSIZED (carved stair cell bigger than a tight ~1.5 m landing)" : " ✓ tight (carved keep-out)"}`
  );
  const containOffsetWorld = { x: solved.dx, z: solved.dz };
  if (solved.dx === 0 && solved.dz === 0) {
    return { containOffsetWorld, footprintWorld: fp0, footprintLayout: toLayout(fp0) };
  }
  const fpContained = fp0.map((c) => ({ x: c.x + solved.dx, z: c.z + solved.dz }));
  return { containOffsetWorld, footprintWorld: fpContained, footprintLayout: toLayout(fpContained) };
}
function enumeratePerStorey(shell, program, constraints, weights, opts, count) {
  const storeyCount = clampStoreyCount(opts.storeyCount);
  const floorToFloorM = opts.floorToFloorM && opts.floorToFloorM > 0 ? opts.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
  const baseElevationM = opts.baseElevationM ?? DEFAULT_BASE_ELEVATION_M;
  const levelIdForStorey = opts.levelIdForStorey ?? ((i) => `storey-${i}`);
  const roofKind = opts.roofKind ?? DEFAULT_ROOF_KIND;
  const footprint = shell.perimeter.map((p) => ({ x: p.x, z: p.z }));
  const rawAngle = principalAxisAngle(footprint);
  const principalAxisRad = Math.abs(rawAngle) >= 0.01 ? rawAngle : 0;
  const pivot = footprint.length > 0 ? footprint.reduce((a, p) => ({ x: a.x + p.x, z: a.z + p.z }), { x: 0, z: 0 }) : { x: 0, z: 0 };
  if (footprint.length > 0) {
    pivot.x /= footprint.length;
    pivot.z /= footprint.length;
  }
  const footprintLayout = principalAxisRad === 0 ? footprint : footprint.map((p) => rotatePt(p, -principalAxisRad, pivot));
  const storeyPrograms = allocateProgramToStoreys(program, storeyCount, opts.perStoreyOverrides);
  const totalRisers = totalRisersForGap(floorToFloorM);
  const stairSolar = (() => {
    const latDeg = opts.solar?.latDeg ?? STAIR_DEFAULT_LAT_DEG;
    const worldSun = equatorFacingDir(latDeg);
    const sunDirLayout = worldSun ? (() => {
      const r = principalAxisRad === 0 ? { x: worldSun.x, z: worldSun.y } : rotatePt({ x: worldSun.x, z: worldSun.y }, -principalAxisRad, { x: 0, z: 0 });
      return { x: r.x, y: r.z };
    })() : null;
    return { latDeg, sunDirLayout };
  })();
  const reservedCore = storeyCount > 1 ? reserveStairCoreShaped(footprintLayout, storeyCount, totalRisers, stairSolar) : null;
  const contained = reservedCore ? containStairCoreUpstream(reservedCore, footprint, totalRisers, floorToFloorM, principalAxisRad, pivot, storeyCount) : null;
  const core = reservedCore;
  const containOffsetWorld = contained ? contained.containOffsetWorld : { x: 0, z: 0 };
  const coreFootprintWorld = contained ? contained.footprintWorld : null;
  const coreFootprintLayout = contained ? contained.footprintLayout : null;
  const coreRect = core ? core.rectMm : null;
  const coreAreaM2 = coreRect ? stairCoreAreaM2(coreRect) : 0;
  if (core) {
    console.log(
      `[house-layout] §DIAG-STAIR-RESERVE storey=${storeyCount > 1 ? "0.." + (storeyCount - 1) : "0"} shape=${core.shape} kind=${core.interiorSide} rect=${Math.round(core.rectMm.x)},${Math.round(core.rectMm.y)},${Math.round(core.rectMm.w)},${Math.round(core.rectMm.h)}mm rot=${principalAxisRad.toFixed(4)}rad`
    );
  }
  const keepOutRectsLayout = core && coreFootprintLayout && coreFootprintLayout.length >= 3 ? [{
    x0: Math.min(...coreFootprintLayout.map((c) => c.x)),
    z0: Math.min(...coreFootprintLayout.map((c) => c.z)),
    x1: Math.max(...coreFootprintLayout.map((c) => c.x)),
    z1: Math.max(...coreFootprintLayout.map((c) => c.z))
  }] : void 0;
  const keepOutRectsWorld = core && coreFootprintWorld && coreFootprintWorld.length >= 3 ? [{
    x0: Math.min(...coreFootprintWorld.map((c) => c.x)),
    z0: Math.min(...coreFootprintWorld.map((c) => c.z)),
    x1: Math.max(...coreFootprintWorld.map((c) => c.x)),
    z1: Math.max(...coreFootprintWorld.map((c) => c.z))
  }] : coreRect ? (() => {
    const corners = [
      { x: coreRect.x / 1e3, z: coreRect.y / 1e3 },
      { x: (coreRect.x + coreRect.w) / 1e3, z: coreRect.y / 1e3 },
      { x: (coreRect.x + coreRect.w) / 1e3, z: (coreRect.y + coreRect.h) / 1e3 },
      { x: coreRect.x / 1e3, z: (coreRect.y + coreRect.h) / 1e3 }
    ].map((c) => principalAxisRad === 0 ? c : rotatePt(c, principalAxisRad, pivot));
    return [{
      x0: Math.min(...corners.map((c) => c.x)),
      z0: Math.min(...corners.map((c) => c.z)),
      x1: Math.max(...corners.map((c) => c.x)),
      z1: Math.max(...corners.map((c) => c.z))
    }];
  })() : void 0;
  const residualExcludeRectsWorld = coreRect ? (() => {
    const corners = [
      { x: coreRect.x / 1e3, z: coreRect.y / 1e3 },
      { x: (coreRect.x + coreRect.w) / 1e3, z: coreRect.y / 1e3 },
      { x: (coreRect.x + coreRect.w) / 1e3, z: (coreRect.y + coreRect.h) / 1e3 },
      { x: coreRect.x / 1e3, z: (coreRect.y + coreRect.h) / 1e3 }
    ].map((c) => principalAxisRad === 0 ? c : rotatePt(c, principalAxisRad, pivot));
    return [{
      x0: Math.min(...corners.map((c) => c.x)),
      z0: Math.min(...corners.map((c) => c.z)),
      x1: Math.max(...corners.map((c) => c.x)),
      z1: Math.max(...corners.map((c) => c.z))
    }];
  })() : void 0;
  const residualExcludeRectsLayout = coreRect ? [{
    x0: coreRect.x / 1e3,
    z0: coreRect.y / 1e3,
    x1: (coreRect.x + coreRect.w) / 1e3,
    z1: (coreRect.y + coreRect.h) / 1e3
  }] : void 0;
  const perStorey = [];
  for (const sp of storeyPrograms) {
    const i = sp.storeyIndex;
    const usableAreaM2 = coreRect ? Math.max(1, shell.netAreaM2 - coreAreaM2) : shell.netAreaM2;
    const growBedrooms = (sp.role === "upper" || storeyCount <= 1) && sp.bedroomsExplicit !== true;
    const growGroundRooms = sp.role === "ground" && storeyCount > 1;
    const enrichedProgram = enrichStoreyProgramToPlate(
      sp.program,
      usableAreaM2,
      sp.role,
      { growBedrooms, growGroundRooms, bedroomsExplicit: sp.bedroomsExplicit === true }
    );
    const storeyProgram = sp.role === "ground" ? { ...enrichedProgram, groundFloorWetRoomPublicFallback: true } : enrichedProgram;
    const band = houseStoreyBand({ program: storeyProgram});
    const presentedAreaM2 = band.grossTargetM2 >= usableAreaM2 * 0.5 ? usableAreaM2 : Math.min(usableAreaM2, band.grossMaxM2);
    const storeyShell = presentedAreaM2 !== shell.netAreaM2 ? { ...shell, netAreaM2: presentedAreaM2 } : shell;
    console.log(
      `[house-layout] §DIAG-STOREY i=${i} role=${sp.role} usableArea=${usableAreaM2.toFixed(1)} presentedArea=${presentedAreaM2.toFixed(1)} grossTarget=${band.grossTargetM2.toFixed(1)} grossMax=${band.grossMaxM2.toFixed(1)} program={bed:${storeyProgram.bedrooms},bath:${storeyProgram.bathrooms},kitchen:${storeyProgram.includeKitchen ?? false},living:${storeyProgram.livingRoom ?? false},dining:${storeyProgram.openPlanKitchenDining ?? false},hall:${storeyProgram.entranceHall ?? false},ensuite:${storeyProgram.masterEnSuite ?? false}} stair=${core ? `${core.shape}@(${(core.rectMm.x / 1e3).toFixed(1)},${(core.rectMm.y / 1e3).toFixed(1)}) ${(core.rectMm.w / 1e3).toFixed(1)}×${(core.rectMm.h / 1e3).toFixed(1)}m` : "none"}`
    );
    const options = generateDeterministicLayouts(
      storeyShell,
      storeyProgram,
      constraints,
      weights,
      Math.max(1, count),
      void 0,
      void 0,
      opts.solar,
      // House-aware envelope gate: judge the plate by its FULL programme, not
      // bedroom count. Replaces the per-storey area-clamp kludge (Deviation B).
      validateHouseStorey,
      // §STAIR-KEEPOUT (A.21.D21) — carve the stair core out of every storey's
      // buildable region (incl. the ground floor, so the run is clear there too).
      keepOutRectsWorld,
      // tuning — house orchestrator uses engine defaults.
      void 0,
      // §DIAG-FILL-RESIDUAL (§65.2) — the RESERVED stair-core cell the residual-claim
      // pass must keep clear (the modal "Stair" cell, offset from the shipped footprint).
      residualExcludeRectsWorld,
      // style — house orchestrator uses no interior style here.
      void 0,
      // §STAIR-KEEPOUT-LAYOUT-TIGHT — the TIGHT layout-frame keep-out / residual-exclude.
      // When present these SUPERSEDE the world rects (avoiding the double-AABB inflation
      // that bloated the stair on a skewed plate). Axis-aligned plate ⇒ identical values.
      keepOutRectsLayout,
      residualExcludeRectsLayout,
      // §GROUND-COUNT-CONSTRAINT (founder 2026-06-18) — when this storey's bedroom
      // count was EXPLICITLY pinned per-level, lock it through the subdivider's
      // plate-density round-up so an explicit Ground bedrooms=1 ships EXACTLY 1
      // (was bumped to round(plateArea/130) ≥ 2). AUTO storeys leave it false.
      sp.bedroomsExplicit === true,
      // §SPINE-FIRST P4 — opt-in (from window.__pryzmSpineFirst via the controller). The engine
      // self-gates to all-private (upper) storeys; the ground floor (public rooms) falls through
      // to the legacy carve. Absent/false ⇒ byte-identical.
      opts.spineFirst === true
    );
    perStorey.push({ storeyIndex: i, options });
  }
  return {
    perStorey,
    footprint,
    core,
    coreRect,
    containOffsetWorld,
    totalRisers,
    floorToFloorM,
    baseElevationM,
    levelIdForStorey,
    roofKind,
    principalAxisRad,
    pivot
  };
}
function assembleHouse(h, select) {
  const { footprint, core, coreRect, containOffsetWorld, totalRisers, floorToFloorM, baseElevationM, levelIdForStorey, roofKind, principalAxisRad, pivot } = h;
  const storeys = [];
  const perStoreyLayout = [];
  const circulationInputs = [];
  for (const sp of h.perStorey) {
    const i = sp.storeyIndex;
    const levelId = levelIdForStorey(i);
    const elevationM = r3(baseElevationM + i * floorToFloorM);
    const chosen = select(i, sp.options);
    perStoreyLayout.push(chosen);
    circulationInputs.push({
      storeyIndex: i,
      levelId,
      option: chosen,
      optionCount: sp.options.length
    });
    storeys.push({
      levelId,
      storeyIndex: i,
      elevationM,
      floorToFloorM,
      footprint: footprint.map((p) => ({ x: p.x, z: p.z }))
    });
  }
  const stairs = [];
  if (core && coreRect && storeys.length >= 2) {
    const flights = resolveFlightPlans(core, totalRisers, principalAxisRad);
    for (let i = 0; i < storeys.length - 1; i++) {
      stairs.push({
        rectMm: { ...coreRect },
        fromLevelId: storeys[i].levelId,
        toLevelId: storeys[i + 1].levelId,
        shape: core.shape,
        flights: flights.map((f) => ({ riserCount: f.riserCount, direction: { ...f.direction } })),
        ...core.shape !== "I" ? { landingDepthM: core.landingDepthM, risersBeforeLanding: core.risersBeforeLanding } : {},
        footprintMm: { w: coreRect.w, h: coreRect.h },
        // A.21.D24 — the angle + pivot the editor rotates the stair footprint
        // (startPosition / startOverride) back to world by (+angle about pivot).
        principalAxisRad,
        pivot: { x: pivot.x, z: pivot.z },
        // §STAIR-HALF-LANDING-INWARD (2026-06-09) — carry the core's placement kind
        // so the editor folds a U-stair's half-landing TOWARD the plate interior
        // (away from the flush perimeter wall). Layout-frame, same as `rectMm`.
        interiorSide: core.interiorSide,
        // §STAIR-CONTAIN-UPSTREAM (2026-06-09) — the WORLD-XZ inward-containment
        // offset solved at reserve time (against the rotated shell). The executor
        // applies this SAME shift to the shipped body so it matches the carved
        // keep-out; its §STAIR-CONTAIN then VERIFIES (a no-op nudge). {0,0} when the
        // reserved footprint already fits (axis-aligned plates byte-identical).
        containOffsetWorld: { x: containOffsetWorld.x, z: containOffsetWorld.z }
      });
    }
  }
  const voids = [];
  if (coreRect) {
    for (let i = 1; i < storeys.length; i++) {
      voids.push({ levelId: storeys[i].levelId, rectMm: { ...coreRect } });
    }
  }
  const topStorey = storeys[storeys.length - 1];
  const roof = {
    levelId: topStorey.levelId,
    footprint: footprint.map((p) => ({ x: p.x, z: p.z })),
    kind: roofKind,
    ...roofKind === "flat" ? {} : { pitchDeg: DEFAULT_ROOF_PITCH_DEG },
    baseElevationM: roofBaseElevationM(storeys.length, floorToFloorM, baseElevationM, floorToFloorM),
    baseOffsetM: roofBaseOffsetM(floorToFloorM, floorToFloorM)
  };
  const circulation = buildHouseCirculationReport(circulationInputs);
  if (circulation.banner) {
    const b = circulation.banner;
    console.warn(
      `[house-layout] §DIAG-CI-1-BANNER severity=${b.severity} — ${b.headline}
` + b.lines.map((l) => `  ${l}`).join("\n") + `
  ${b.qualifier}`
    );
  }
  return { storeys, perStoreyLayout, stairs, voids, roof, circulation };
}

const DEFAULT_SHELL_SNAP_M = 0.6;
const SHELL_SNAP_SPAN_MARGIN_M = 0.1;
const DEFAULT_PARTITION_WELD_M = 0.5;
const DEFAULT_GRID_M = 1e-3;
const DIRECTION_PRESERVE_DOT = 0.99;
const USABLE_MIN_LEN_M = 0.8;
const MOVE_CAP_FACTOR = 1;
function unitSeg(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < EPSILON_ZERO) return { ax: a.x, az: a.z, ux: 1, uz: 0, len: 0 };
  return { ax: a.x, az: a.z, ux: dx / len, uz: dz / len, len };
}
function closestOnSeg(p, s) {
  if (s.len < EPSILON_ZERO) return { x: s.ax, z: s.az, perp: Math.hypot(p.x - s.ax, p.z - s.az), along: 0 };
  const rx = p.x - s.ax, rz = p.z - s.az;
  const t = Math.max(0, Math.min(s.len, rx * s.ux + rz * s.uz));
  const cx = s.ax + s.ux * t, cz = s.az + s.uz * t;
  return { x: cx, z: cz, perp: Math.hypot(p.x - cx, p.z - cz), along: t };
}
function weldPartitionsToShell(partitions, shellWalls, options = {}) {
  const shellSnapTolM = options.shellSnapTolM ?? DEFAULT_SHELL_SNAP_M;
  const partitionWeldTolM = options.partitionWeldTolM ?? DEFAULT_PARTITION_WELD_M;
  const gridM = options.gridM ?? DEFAULT_GRID_M;
  const snapToGrid = (n2) => Math.round(n2 / gridM) * gridM;
  const MIN_LEN_M = 0.05;
  const shellSegs = shellWalls.map((w) => unitSeg(w.start, w.end));
  const eps = [];
  for (const w of partitions) {
    eps.push({ x: w.start.x, z: w.start.z });
    eps.push({ x: w.end.x, z: w.end.z });
  }
  for (const ep of eps) {
    let bestPerp = shellSnapTolM;
    let best = null;
    for (const s of shellSegs) {
      if (s.len < EPSILON_ZERO) continue;
      const c = closestOnSeg(ep, s);
      if (c.along <= SHELL_SNAP_SPAN_MARGIN_M || c.along >= s.len - SHELL_SNAP_SPAN_MARGIN_M) continue;
      if (c.perp < bestPerp) {
        bestPerp = c.perp;
        best = { x: c.x, z: c.z };
      }
    }
    if (best) {
      ep.x = best.x;
      ep.z = best.z;
    }
  }
  const spanSegs = partitions.map((_, i) => unitSeg(eps[i * 2], eps[i * 2 + 1]));
  const TJUNC_MARGIN_M = 0.1;
  const TJUNC_SNAP_TOL_M = 0.3;
  for (let i = 0; i < eps.length; i++) {
    const ownPart = i >> 1;
    let bestPerp = TJUNC_SNAP_TOL_M;
    let best = null;
    for (let q = 0; q < spanSegs.length; q++) {
      if (q === ownPart) continue;
      const s = spanSegs[q];
      if (s.len < EPSILON_ZERO) continue;
      const c = closestOnSeg(eps[i], s);
      if (c.perp < bestPerp && c.along > TJUNC_MARGIN_M && c.along < s.len - TJUNC_MARGIN_M) {
        bestPerp = c.perp;
        best = { x: c.x, z: c.z };
      }
    }
    if (best) {
      eps[i].x = best.x;
      eps[i].z = best.z;
    }
  }
  const n = eps.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i, j) => {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  const tolSq = partitionWeldTolM * partitionWeldTolM;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (i >> 1 === j >> 1) continue;
      const dx = eps[i].x - eps[j].x, dz = eps[i].z - eps[j].z;
      if (dx * dx + dz * dz <= tolSq) union(i, j);
    }
  }
  const clusters = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) (clusters.get(find(i)) ?? clusters.set(find(i), []).get(find(i))).push(i);
  const centroidX = new Array(n);
  const centroidZ = new Array(n);
  for (const members of clusters.values()) {
    let sx = 0, sz = 0;
    for (const m of members) {
      sx += eps[m].x;
      sz += eps[m].z;
    }
    const px = snapToGrid(sx / members.length), pz = snapToGrid(sz / members.length);
    for (const m of members) {
      centroidX[m] = px;
      centroidZ[m] = pz;
    }
  }
  const moveCapSq = partitionWeldTolM * MOVE_CAP_FACTOR * (partitionWeldTolM * MOVE_CAP_FACTOR);
  const usableMinSq = USABLE_MIN_LEN_M * USABLE_MIN_LEN_M;
  const welded = new Array(n);
  for (const members of clusters.values()) {
    const px = centroidX[members[0]], pz = centroidZ[members[0]];
    for (const m of members) {
      const ox = centroidX[m ^ 1], oz = centroidZ[m ^ 1];
      const newLenSq = (px - ox) * (px - ox) + (pz - oz) * (pz - oz);
      const moveSq = (px - eps[m].x) * (px - eps[m].x) + (pz - eps[m].z) * (pz - eps[m].z);
      if (newLenSq < usableMinSq || moveSq > moveCapSq) {
        welded[m] = { x: snapToGrid(eps[m].x), z: snapToGrid(eps[m].z) };
      } else {
        welded[m] = { x: px, z: pz };
      }
    }
  }
  for (let i = 0; i < partitions.length; i++) {
    const a = welded[i * 2];
    const b = welded[i * 2 + 1];
    const oS = partitions[i].start, oE = partitions[i].end;
    const oLen = Math.hypot(oE.x - oS.x, oE.z - oS.z);
    const wLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (oLen < EPSILON_ZERO || wLen < EPSILON_ZERO) continue;
    const odx = (oE.x - oS.x) / oLen, odz = (oE.z - oS.z) / oLen;
    const wdx = (b.x - a.x) / wLen, wdz = (b.z - a.z) / wLen;
    const dot = odx * wdx + odz * wdz;
    if (dot >= DIRECTION_PRESERVE_DOT) continue;
    const moveA = Math.hypot(a.x - oS.x, a.z - oS.z);
    const moveB = Math.hypot(b.x - oE.x, b.z - oE.z);
    const projLen = (b.x - a.x) * odx + (b.z - a.z) * odz;
    const L = Math.max(MIN_LEN_M, Math.abs(projLen));
    if (moveA <= moveB) {
      welded[i * 2 + 1] = { x: snapToGrid(a.x + odx * L), z: snapToGrid(a.z + odz * L) };
    } else {
      welded[i * 2] = { x: snapToGrid(b.x - odx * L), z: snapToGrid(b.z - odz * L) };
    }
  }
  const out = [];
  for (let i = 0; i < partitions.length; i++) {
    const a = welded[i * 2];
    const b = welded[i * 2 + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_LEN_M) continue;
    out.push({ id: partitions[i].id, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
  }
  return out;
}
function nearestOnSeg$1(p, a, b) {
  const ex = b.x - a.x, ez = b.z - a.z;
  const L2 = ex * ex + ez * ez;
  if (L2 < EPSILON_ZERO) return { pt: { x: a.x, z: a.z }, dist: Math.hypot(p.x - a.x, p.z - a.z) };
  let t = ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const pt = { x: a.x + t * ex, z: a.z + t * ez };
  return { pt, dist: Math.hypot(p.x - pt.x, p.z - pt.z) };
}
function pointInsideRing(p, ring, tolM) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (nearestOnSeg$1(p, ring[i], ring[(i + 1) % n]).dist <= tolM) return true;
  }
  return pointInPolygonXZ(p.x, p.z, ring);
}
function nearestOnRing(p, ring) {
  let best = ring[0], bestD = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const r = nearestOnSeg$1(p, ring[i], ring[(i + 1) % n]);
    if (r.dist < bestD) {
      bestD = r.dist;
      best = r.pt;
    }
  }
  return best;
}
function clampPartitionsInsideShell(partitions, shellRing, tolM = 0.05) {
  if (shellRing.length < 3) return partitions.map((p) => ({ id: p.id, start: { ...p.start }, end: { ...p.end } }));
  const clamp = (p) => pointInsideRing(p, shellRing, tolM) ? { x: p.x, z: p.z } : nearestOnRing(p, shellRing);
  return partitions.map((w) => ({ id: w.id, start: clamp(w.start), end: clamp(w.end) }));
}

function nearestOnSeg(p, a, b) {
  const ex = b.x - a.x, ez = b.z - a.z;
  const L2 = ex * ex + ez * ez;
  if (L2 < EPSILON_ZERO) return { pt: { x: a.x, z: a.z }, dist: Math.hypot(p.x - a.x, p.z - a.z) };
  let t = ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const pt = { x: a.x + t * ex, z: a.z + t * ez };
  return { pt, dist: Math.hypot(p.x - pt.x, p.z - pt.z) };
}
function pointRing(p, ring) {
  const n = ring.length;
  let edgeDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = nearestOnSeg(p, ring[i], ring[(i + 1) % n]).dist;
    if (d < edgeDist) edgeDist = d;
  }
  const inside = pointInPolygonXZ(p.x, p.z, ring);
  return { inside, edgeDist };
}
function checkShellContainment(partitions, shellRing, tolM = 0.05) {
  if (shellRing.length < 3) return { violations: [], count: 0, maxOvershootM: 0 };
  const violations = [];
  let maxOvershootM = 0;
  const test = (id, end, p) => {
    const r = pointRing(p, shellRing);
    if (r.inside || r.edgeDist <= tolM) return;
    const overshootM = r.edgeDist;
    violations.push({ id, end, overshootM, point: { x: p.x, z: p.z } });
    if (overshootM > maxOvershootM) maxOvershootM = overshootM;
  };
  for (const w of partitions) {
    test(w.id, "start", w.start);
    test(w.id, "end", w.end);
  }
  return { violations, count: violations.length, maxOvershootM };
}
function checkWindowCornerOverflow(windows, hostSegments, tolM = 0.02) {
  const segById = /* @__PURE__ */ new Map();
  for (const s of hostSegments) segById.set(s.id, s);
  const violations = [];
  let maxOverflowM = 0;
  for (const w of windows) {
    const seg = segById.get(w.hostWallId);
    if (!seg) continue;
    const len = Math.hypot(seg.end.x - seg.start.x, seg.end.z - seg.start.z);
    if (len < EPSILON_ZERO) continue;
    const half = w.widthM / 2;
    const lo = w.offsetM - half;
    const hi = w.offsetM + half;
    if (lo < -tolM) {
      const overflowM = -lo;
      violations.push({ windowId: w.id, hostWallId: w.hostWallId, side: "start", overflowM });
      if (overflowM > maxOverflowM) maxOverflowM = overflowM;
    }
    if (hi > len + tolM) {
      const overflowM = hi - len;
      violations.push({ windowId: w.id, hostWallId: w.hostWallId, side: "end", overflowM });
      if (overflowM > maxOverflowM) maxOverflowM = overflowM;
    }
  }
  return { violations, count: violations.length, maxOverflowM };
}

function deriveProjectNorthFrame(footprintWorld) {
  const raw = principalAxisAngle(footprintWorld);
  const thetaRad = Math.abs(raw) >= 0.01 ? raw : 0;
  let cx = 0, cz = 0;
  for (const p of footprintWorld) {
    cx += p.x;
    cz += p.z;
  }
  const n = footprintWorld.length || 1;
  return { thetaRad, pivot: { x: cx / n, z: cz / n } };
}
function rectifyShellRing(ring, snapTolM = 0.5) {
  const n = ring.length;
  if (n < 3) return ring.map((p) => ({ x: p.x, z: p.z }));
  const edgeAxis = [];
  const edgeConst = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
    if (dx >= dz) {
      if (dz <= snapTolM) {
        edgeAxis.push("x");
        edgeConst.push((a.z + b.z) / 2);
      } else {
        edgeAxis.push("d");
        edgeConst.push(0);
      }
    } else {
      if (dx <= snapTolM) {
        edgeAxis.push("z");
        edgeConst.push((a.x + b.x) / 2);
      } else {
        edgeAxis.push("d");
        edgeConst.push(0);
      }
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const orig = ring[i];
    let x = orig.x, z = orig.z;
    for (const e of [prev, i]) {
      if (edgeAxis[e] === "z") x = edgeConst[e];
      else if (edgeAxis[e] === "x") z = edgeConst[e];
    }
    out.push({ x, z });
  }
  return out;
}
function rebaseEndpointsToDrawnShell(welded, rectifiedRing, drawnRing, onEdgeTolM = 0.05) {
  const n = rectifiedRing.length;
  if (n < 3 || drawnRing.length !== n) {
    return welded.map((w) => ({ id: w.id, start: { ...w.start }, end: { ...w.end } }));
  }
  const CORNER_EPS_M = 0.3;
  const transfer = (p) => {
    let bestV = -1, bestVD = CORNER_EPS_M;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(p.x - drawnRing[i].x, p.z - drawnRing[i].z);
      if (d < bestVD) {
        bestVD = d;
        bestV = i;
      }
    }
    if (bestV >= 0) return { x: drawnRing[bestV].x, z: drawnRing[bestV].z };
    let bestPerp = onEdgeTolM;
    let bestT = -1, bestEdge = -1;
    for (let i = 0; i < n; i++) {
      const a = rectifiedRing[i], b = rectifiedRing[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-12) continue;
      let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const fx = a.x + t * dx, fz = a.z + t * dz;
      const perp = Math.hypot(p.x - fx, p.z - fz);
      if (perp < bestPerp) {
        bestPerp = perp;
        bestT = t;
        bestEdge = i;
      }
    }
    if (bestEdge < 0) return { x: p.x, z: p.z };
    const da = drawnRing[bestEdge], db = drawnRing[(bestEdge + 1) % n];
    return { x: da.x + bestT * (db.x - da.x), z: da.z + bestT * (db.z - da.z) };
  };
  return welded.map((w) => ({ id: w.id, start: transfer(w.start), end: transfer(w.end) }));
}
function ringToWalls(ring, ids) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    out.push({ id: ids?.[i] ?? `pn-shell-${i}`, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
  }
  return out;
}
function projectNorthWeld(partitionsWorld, shellWallsWorld, frame, tightWeld, opts) {
  const { thetaRad, pivot } = frame;
  const shellRingWorld = shellWallsWorld.map((w) => ({ x: w.start.x, z: w.start.z }));
  const shellIds = shellWallsWorld.map((w) => w.id);
  if (thetaRad === 0 || shellRingWorld.length < 3) {
    const welded = weldPartitionsToShell(partitionsWorld, shellWallsWorld);
    return {
      partitions: welded,
      shellRingWorld,
      shellWallsWorld: shellWallsWorld.map((w) => ({ ...w })),
      thetaRad: 0
    };
  }
  const deRot = (p) => rotatePt(p, -thetaRad, pivot);
  const partsPN = partitionsWorld.map((w) => ({ id: w.id, start: deRot(w.start), end: deRot(w.end) }));
  const shellRingPN = shellRingWorld.map(deRot);
  const rectifiedPN = rectifyShellRing(shellRingPN);
  const shellWallsPN = ringToWalls(rectifiedPN, shellIds);
  const weldedPN = weldPartitionsToShell(
    partsPN,
    shellWallsPN,
    tightWeld ? {
      ...tightWeld.shellSnapTolM !== void 0 ? { shellSnapTolM: tightWeld.shellSnapTolM } : {},
      ...tightWeld.partitionWeldTolM !== void 0 ? { partitionWeldTolM: tightWeld.partitionWeldTolM } : {}
    } : {}
  );
  const weldedPNFinal = opts?.rebaseToDrawnShell ? rebaseEndpointsToDrawnShell(weldedPN, rectifiedPN, shellRingPN) : weldedPN;
  const reRot = (p) => rotatePt(p, thetaRad, pivot);
  const partitions = weldedPNFinal.map((w) => ({ id: w.id, start: reRot(w.start), end: reRot(w.end) }));
  const rectifiedWorld = rectifiedPN.map(reRot);
  const shellWallsWorldOut = shellWallsPN.map((w) => ({ id: w.id, start: reRot(w.start), end: reRot(w.end) }));
  return {
    partitions,
    shellRingWorld: rectifiedWorld,
    shellWallsWorld: shellWallsWorldOut,
    thetaRad
  };
}
function projectNorthWeldBoundary(boundaryWorld, shellWallsWorld, frame, shellSnapTolM, rebaseToDrawnShell) {
  const res = projectNorthWeld([boundaryWorld], shellWallsWorld, frame, {
    ...shellSnapTolM !== void 0 ? { shellSnapTolM } : {},
    partitionWeldTolM: 0
  }, rebaseToDrawnShell ? { rebaseToDrawnShell: true } : void 0);
  return res.partitions[0] ?? null;
}
function projectNorthWeldSet(partitionsWorld, boundariesWorld, shellWallsWorld, frame, tightWeld) {
  const core = projectNorthWeld(partitionsWorld, shellWallsWorld, frame, tightWeld);
  const boundaries = boundariesWorld.map((b) => projectNorthWeldBoundary(b, shellWallsWorld, frame, tightWeld?.shellSnapTolM) ?? b);
  return {
    partitions: core.partitions,
    boundaries,
    shellRingWorld: core.shellRingWorld,
    shellWallsWorld: core.shellWallsWorld,
    thetaRad: core.thetaRad
  };
}

const DEFAULT_OFFSET_M = 3;
function computeBuildingElevationMarks(footprint, opts = {}) {
  if (!footprint || footprint.length < 3) return [];
  const offset = opts.offsetM && opts.offsetM > 0 ? opts.offsetM : DEFAULT_OFFSET_M;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!(maxX > minX) || !(maxZ > minZ)) return [];
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  return [
    // North = the +Z façade; mark sits north of it, viewer looks −Z (south).
    { direction: "N", anchor: { x: midX, z: maxZ + offset }, facing: { x: 0, z: -1 }, label: "North Elevation" },
    // South = the −Z façade; mark south of it, viewer looks +Z (north).
    { direction: "S", anchor: { x: midX, z: minZ - offset }, facing: { x: 0, z: 1 }, label: "South Elevation" },
    // East = the +X façade; mark east of it, viewer looks −X (west).
    { direction: "E", anchor: { x: maxX + offset, z: midZ }, facing: { x: -1, z: 0 }, label: "East Elevation" },
    // West = the −X façade; mark west of it, viewer looks +X (east).
    { direction: "W", anchor: { x: minX - offset, z: midZ }, facing: { x: 1, z: 0 }, label: "West Elevation" }
  ];
}

const DEFAULT_CROP_MARGIN_M = 0.5;
function bbox$3(poly) {
  if (!poly || poly.length < 3) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!(maxX > minX) || !(maxZ > minZ)) return null;
  return { minX, minZ, maxX, maxZ };
}
function roomCropRegion(roomPolygon, marginM = DEFAULT_CROP_MARGIN_M) {
  const b = bbox$3(roomPolygon);
  if (!b) return null;
  const m = marginM >= 0 ? marginM : DEFAULT_CROP_MARGIN_M;
  return { minX: b.minX - m, minZ: b.minZ - m, maxX: b.maxX + m, maxZ: b.maxZ + m };
}
function computeRoomInteriorElevationMarks(roomPolygon) {
  const b = bbox$3(roomPolygon);
  if (!b) return [];
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [
    { wall: "N", anchor: { x: cx, z: cz }, facing: { x: 0, z: 1 }, label: "Interior Elevation — North wall" },
    { wall: "S", anchor: { x: cx, z: cz }, facing: { x: 0, z: -1 }, label: "Interior Elevation — South wall" },
    { wall: "E", anchor: { x: cx, z: cz }, facing: { x: 1, z: 0 }, label: "Interior Elevation — East wall" },
    { wall: "W", anchor: { x: cx, z: cz }, facing: { x: -1, z: 0 }, label: "Interior Elevation — West wall" }
  ];
}

const num$1 = (prefix, n) => `A-${prefix}${n.toString().padStart(2, "0")}`;
function planDocumentationSet(input) {
  const sheets = [];
  const levels = input.levels ?? [];
  const rooms = input.rooms ?? [];
  levels.forEach((lvl, i) => {
    sheets.push({
      sheetNumber: num$1("1", i + 1),
      name: `${lvl.name} — Plan`,
      discipline: "A",
      views: [{ kind: "plan", label: `${lvl.name} Plan`, levelId: lvl.levelId }]
    });
  });
  const elevs = computeBuildingElevationMarks(input.footprint);
  if (elevs.length > 0) {
    sheets.push({
      sheetNumber: num$1("2", 1),
      name: "Building Elevations",
      discipline: "A",
      views: elevs.map((m) => ({ kind: "building-elevation", label: m.label, elevationMark: m }))
    });
  }
  levels.forEach((lvl, i) => {
    sheets.push({
      sheetNumber: num$1("3", i + 1),
      name: `${lvl.name} — Set-Out Plan`,
      discipline: "A",
      views: [{ kind: "set-out", label: `${lvl.name} Set-Out`, levelId: lvl.levelId }]
    });
  });
  let roomSeq = 0;
  for (const lvl of levels) {
    for (const room of rooms.filter((r) => r.levelId === lvl.levelId)) {
      const crop = roomCropRegion(room.polygon);
      if (!crop) continue;
      roomSeq += 1;
      const views = [
        { kind: "room-plan", label: `${room.name} — Plan`, levelId: room.levelId, cropRegion: crop },
        ...computeRoomInteriorElevationMarks(room.polygon).map((m) => ({
          kind: "room-elevation",
          label: `${room.name} — ${m.label}`,
          levelId: room.levelId,
          elevationMark: m
        }))
      ];
      sheets.push({ sheetNumber: num$1("4", roomSeq), name: `${room.name} — Room`, discipline: "A", views });
    }
  }
  return sheets;
}

const MIN_OPENING_M = 0.4;
const EPS_M = 1e-4;
function clampOpeningToWall(offset, width, storedLen) {
  if (!Number.isFinite(storedLen) || storedLen <= EPS_M) return null;
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return null;
  if (storedLen < MIN_OPENING_M - EPS_M) return null;
  const w = Math.max(MIN_OPENING_M, Math.min(width, storedLen));
  const off = Math.min(Math.max(offset, 0), storedLen - w);
  const clamped = Math.abs(off - offset) > EPS_M || Math.abs(w - width) > EPS_M;
  return { offset: off, width: w, clamped };
}

const BEDROOM_TYPES$2 = /* @__PURE__ */ new Set(["master", "bedroom"]);
function unitLetter(index) {
  let i = Math.max(0, Math.floor(index));
  let out = "";
  for (; ; ) {
    out = String.fromCharCode(65 + i % 26) + out;
    i = Math.floor(i / 26) - 1;
    if (i < 0) return out;
  }
}
function unitTypeForBedrooms(bedrooms) {
  const b = Math.max(0, Math.floor(bedrooms));
  return b === 0 ? "studio" : `${b}-bed`;
}
function bedroomsInLayout(apt) {
  const rooms = apt.layout?.rooms ?? [];
  let n = 0;
  for (const r of rooms) if (r.type && BEDROOM_TYPES$2.has(r.type)) n++;
  return n;
}
function cellAreaM2(apt) {
  const r = apt.cell?.rect;
  if (!r) return 0;
  const a = Math.abs(r.x1 - r.x0) * Math.abs(r.z1 - r.z0);
  return Math.round(a * 1e3) / 1e3;
}
function planBuildingUnits(perLevelApartments) {
  const units = [];
  for (const level of perLevelApartments ?? []) {
    if (!level?.apartments?.length) continue;
    let placed = 0;
    for (const apt of level.apartments) {
      if (apt.status !== "ok" || !apt.layout) continue;
      const indexOnLevel = placed++;
      const levelCode = String(level.levelIndex).padStart(2, "0");
      const unitNumber = `${levelCode}${unitLetter(indexOnLevel)}`;
      const bedrooms = bedroomsInLayout(apt);
      units.push({
        levelIndex: level.levelIndex,
        indexOnLevel,
        unitNumber,
        name: `Apartment ${unitNumber}`,
        unitType: unitTypeForBedrooms(bedrooms),
        bedrooms,
        typology: apt.typology,
        grossUnitAreaM2: cellAreaM2(apt),
        roomCount: (apt.layout.rooms ?? []).length
      });
    }
  }
  return units;
}

const ARCHETYPES = {
  "bedroom": {
    occupancy: "bedroom",
    minAreaM2: 6,
    items: [
      // Rules: every bedroom requires a bed, 2 bedside tables, lighting, a wardrobe.
      // §FURNITURE-SPEC: bed + wardrobe NEVER on the window wall (privacy +
      // thermal envelope + the wardrobe would block daylight) and prefer a
      // wall WITHOUT the door (you don't sleep next to the door swing).
      { kind: "bed", anchor: "wall-opposite-door", facing: "to-wall", required: true, group: "bed", excludeWindowWall: true, excludeDoorSwing: true },
      { kind: "bedside_table", anchor: "beside", facing: "to-wall", required: true, group: "bed", count: 2 },
      // §67.1 (2026-06-11) — a rug in FRONT OF / under the bed (centred on
      // the bed via the 'under' anchor). Collision-EXEMPT: it underlaps the
      // bed + bedside tables. Placed after the bed so it reads the bed pose.
      { kind: "rug", anchor: "under", facing: "to-wall", required: false, group: "bed" },
      { kind: "wardrobe", anchor: "wall-longest", facing: "to-wall", required: true, excludeWindowWall: true, excludeDoorSwing: true },
      // F1.12 (2026-05-30) — Bedroom dressing. Dresser on longest free
      // wall (yields to the wardrobe); vanity_table beside the window
      // for natural light when applying makeup.
      // F4 follow-up (2026-05-31) — both tagged with the 'dressing'
      // activity group so they read as a coherent dressing zone
      // (architect's semantic grouping; the solver's leader/beside
      // pairing keeps each item at its own anchor since neither uses
      // `anchor: 'beside'`).
      { kind: "dresser", anchor: "wall-longest", facing: "to-wall", required: false, group: "dressing", excludeWindowWall: true, excludeDoorSwing: true },
      { kind: "vanity_table", anchor: "wall-window", facing: "to-wall", required: false, group: "dressing", excludeDoorSwing: true },
      // §OVERBED-WALL-TAPESTRY (founder, 2026-06-18) — woven decorative
      // textile wall-hanging above the bed wall (paired with the bed group —
      // it reads as a headboard accent). Replaces the F1.10 wall_mirror in
      // THIS over-bed slot only; the founder praised the mirror's POSITION,
      // so the anchor/group/facing are unchanged — only the kind swaps to a
      // tapestry (warm multi-colour woven look — WallTapestryBuilder). The
      // window-wall (group: 'curtains') wall_mirror below is untouched.
      { kind: "wall_tapestry", anchor: "beside", facing: "into-room", required: false, group: "bed" },
      // F1.11 (2026-05-30) — Curtain rod on the window wall (S7 precursor).
      // §bedroom-mirror (2026-06-11) — the founder asked for the bedroom's
      // curtain PANEL to be swapped for a MIRROR. The two flanking
      // curtain_panel slabs become two wall_mirror panels (reflective
      // mirror material — see styleFinish MIRROR_KINDS + MirrorMaterial.ts).
      // The rod stays; the LIVING-ROOM curtain_panel is untouched.
      { kind: "curtain_rod", anchor: "wall-window", facing: "to-wall", required: false, group: "curtains" },
      { kind: "wall_mirror", anchor: "beside", facing: "to-wall", required: false, group: "curtains", count: 2 },
      // F3.3 (2026-05-30) — Optional reading chair in a corner of
      // larger bedrooms (the classic primary-bedroom reading nook).
      { kind: "lounge_chair", anchor: "corner", facing: "into-room", required: false },
      { kind: "lamp", anchor: "corner", facing: "into-room", required: true }
      // lighting
    ]
  },
  "living-room": {
    occupancy: "living-room",
    minAreaM2: 9,
    // F4.1 / S1 (2026-06-01) — the living-room hosts the Media Wall
    // activity system. The existing tv + tv_unit items (F1.3, group:
    // 'media') already produce the build; the annotation surfaces the
    // composition by name for downstream tooling (Family Platform P0,
    // AI hints, schedules, IFC-α exports). See ./activityArchetypes.ts.
    activitySystems: ["media-wall"],
    items: [
      // §FURNITURE-SPEC: sofa prefers a wall WITHOUT the door — the door wall
      // is the entry path; the sofa anchors on the opposite/long wall.
      { kind: "sofa", anchor: "wall-longest", facing: "into-room", required: true, group: "sofa", excludeDoorSwing: true },
      { kind: "coffee_table", anchor: "beside", facing: "into-room", required: false, group: "sofa" },
      // §67.1 (2026-06-11) — a rug in FRONT OF the sofa / under the coffee
      // table (centred on the sofa group via the 'under' anchor). Collision-
      // EXEMPT — it underlaps the sofa + coffee table.
      { kind: "rug", anchor: "under", facing: "into-room", required: false, group: "sofa" },
      // F1.3 (2026-05-30) — Media wall (S1 activity system anchor).
      // The TV unit anchors on the wall opposite the sofa (the "media
      // wall"), excluding the window wall (no daylight glare on the
      // screen) and the door wall. The wall-mounted TV sits in the
      // same group above the unit — the engine pairs them via the
      // 'media' group and yields the TV to the unit's chosen wall.
      { kind: "tv_unit", anchor: "wall-opposite-door", facing: "into-room", required: false, group: "media", excludeWindowWall: true, excludeDoorSwing: true },
      { kind: "tv", anchor: "beside", facing: "into-room", required: false, group: "media" },
      // F1.2 (2026-05-30) — Glass-front bookshelf as optional living-room
      // storage. Anchors on the longest free wall, excludes window wall
      // (tall piece blocks daylight) and the door wall.
      { kind: "bookshelf_glass", anchor: "wall-longest", facing: "to-wall", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      // F1.10 (2026-05-30) — Wall art above the sofa (paired group).
      { kind: "wall_art", anchor: "beside", facing: "into-room", required: false, group: "sofa", excludeWindowWall: true },
      // §DECOR-WALLS (founder 2026-06-18) — a woven textile wall-hanging over the
      // sofa (the founder's living-room refs). Same wall-hosted 'beside' path as the
      // bedroom tapestry; per-room pattern+size variety from §DECOR-VARIETY. Optional
      // + excludeWindowWall so it never blocks daylight or competes for the same span
      // as the wall_art (the placer relocates/skips whichever doesn't fit).
      { kind: "wall_tapestry", anchor: "beside", facing: "into-room", required: false, group: "sofa", excludeWindowWall: true },
      // F1.11 (2026-05-30) — Curtains on the living-room window wall.
      { kind: "curtain_rod", anchor: "wall-window", facing: "to-wall", required: false, group: "curtains" },
      { kind: "curtain_panel", anchor: "beside", facing: "to-wall", required: false, group: "curtains", count: 2 },
      // F3.2 (2026-05-30) — Optional second seat for larger living rooms.
      // Anchored at a corner so it pairs with the sofa as the secondary
      // conversation seat without disturbing the sofa-coffee axis.
      { kind: "lounge_chair", anchor: "corner", facing: "into-room", required: false },
      { kind: "lamp", anchor: "corner", facing: "into-room", required: false },
      // lighting
      // §LIVING-SECOND-SEAT (founder 2026-06-19) — a SECOND conversation area
      // for LARGE living rooms (≥26 m²): another sofa anchored on a free wall,
      // a small unit (lounge chair) + coffee table beside it, and its own rug,
      // all grouped 'sofa2' so they cluster as a distinct seating zone away
      // from the primary sofa. minAreaM2-gated → normal rooms are unchanged.
      // The sofa (a non-beside item) sets the 'sofa2' leader the beside/under
      // items follow; excludeDoorSwing keeps it off the entry path.
      { kind: "sofa", anchor: "wall-longest", facing: "into-room", required: false, group: "sofa2", excludeDoorSwing: true, minAreaM2: 26 },
      { kind: "lounge_chair", anchor: "beside", facing: "into-room", required: false, group: "sofa2", minAreaM2: 26 },
      { kind: "coffee_table", anchor: "beside", facing: "into-room", required: false, group: "sofa2", minAreaM2: 26 },
      { kind: "rug", anchor: "under", facing: "into-room", required: false, group: "sofa2", minAreaM2: 26 }
    ]
  },
  "kitchen": {
    occupancy: "kitchen",
    minAreaM2: 5,
    items: [
      // §FURNITURE-SPEC: the L-shape kitchen wraps TWO adjacent walls — emitted
      // as two perpendicular straight runs. Both anchor `wall-longest` with
      // excludeDoorSwing; the cascading anchor-wall resolver puts the second
      // on a perpendicular wall once the first claims the primary (longest)
      // wall, naturally forming an L at the corner. The second run is optional
      // — small kitchens that can't fit two runs gracefully degrade to one.
      { kind: "kitchen_straight", anchor: "wall-longest", facing: "to-wall", required: true, excludeDoorSwing: true },
      { kind: "kitchen_straight", anchor: "wall-longest", facing: "to-wall", required: false, excludeDoorSwing: true },
      // F1.14 (2026-05-30) — Tall pantry on a wall PERPENDICULAR to the
      // main kitchen run (so the run keeps its working stretch). Anchor
      // 'wall-longest' yields to the kitchen runs that claimed it first,
      // landing on the next-longest free wall.
      { kind: "pantry_cabinet", anchor: "wall-longest", facing: "to-wall", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      // F-FRIDGE (2026-06-05) — the kitchen tall appliance. Anchors on the
      // longest free wall (yields to the counter runs + pantry that claimed
      // it first → lands on the next free wall, typically the end of a run),
      // excludeWindowWall (a 1.8 m tall box would block daylight) +
      // excludeDoorSwing. Optional so a tiny galley kitchen ships clean.
      { kind: "fridge", anchor: "wall-longest", facing: "into-room", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      // §KITCHEN-ISLAND (2026-05-29) — optional centre island for open-plan
      // kitchens. Placed AFTER the wall runs so the island only lands when
      // the room still has clear centroid space (smaller kitchens have the
      // run's clearFront covering the centroid → island drops cleanly).
      // facing 'into-room' rotates the cabinet doors to face the cook side.
      { kind: "kitchen_island", anchor: "center", facing: "into-room", required: false },
      // F4 follow-up (2026-05-31) — kitchens have windows (programRules
      // .kitchen.needsWindow = true; the sink wants natural light). Mirror
      // the bedroom/living-room curtain pattern: rod on the window wall +
      // two panels flanking.
      { kind: "curtain_rod", anchor: "wall-window", facing: "to-wall", required: false, group: "curtains" },
      { kind: "curtain_panel", anchor: "beside", facing: "to-wall", required: false, group: "curtains", count: 2 }
    ]
  },
  "dining-room": {
    occupancy: "dining-room",
    minAreaM2: 7,
    items: [
      { kind: "dining_table", anchor: "center", facing: "into-room", required: true, group: "dining" },
      { kind: "dining_chair", anchor: "beside", facing: "into-room", required: false, group: "dining", count: 4 },
      // §67.1 (2026-06-11) — a rug UNDER the dining table (centred on the
      // table via the 'under' anchor). Collision-EXEMPT — it underlaps the
      // table + chairs (the classic "anchor the dining zone" rug).
      { kind: "rug", anchor: "under", facing: "into-room", required: false, group: "dining" },
      // §DECOR-WALLS (founder 2026-06-18) — a woven textile wall-hanging as a dining
      // feature wall (per-room pattern+size variety from §DECOR-VARIETY). Wall-hosted
      // 'beside' path; optional + excludeWindowWall.
      { kind: "wall_tapestry", anchor: "beside", facing: "into-room", required: false, group: "dining", excludeWindowWall: true },
      // F1.9 (2026-05-30) — Dining-room storage. Sideboard preferred
      // over buffet (lower profile reads better against the dining
      // table's silhouette). Both anchor on the longest free wall.
      { kind: "sideboard", anchor: "wall-longest", facing: "to-wall", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      { kind: "buffet", anchor: "wall-longest", facing: "to-wall", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      // F4 follow-up (2026-05-31) — dining rooms have windows
      // (programRules.dining.needsWindow = true). Curtains on the
      // window wall, mirroring the bedroom/living-room pattern.
      { kind: "curtain_rod", anchor: "wall-window", facing: "to-wall", required: false, group: "curtains" },
      { kind: "curtain_panel", anchor: "beside", facing: "to-wall", required: false, group: "curtains", count: 2 }
    ]
  },
  "bathroom": {
    occupancy: "bathroom",
    minAreaM2: 2.5,
    // Rules: a bathroom requires a toilet, a washbasin and a shower/bath. The
    // washbasin is a Plumbing-system fixture (no plain furniture kind yet); it is
    // listed as a requiredFixture in the rules DB and sourced from the plumbing
    // catalogue at the wiring layer. The renderable furniture kinds are placed here.
    // §FURNITURE-SPEC: the toilet is NOT on the door wall — you face it side-on
    // as you open the door, and the door swing collides with the toilet zone.
    items: [
      { kind: "toilet_radiator", anchor: "wall-longest", facing: "into-room", required: true, excludeDoorSwing: true },
      { kind: "shower_glass_panel", anchor: "corner", facing: "into-room", required: true },
      // F1.5 (2026-05-30) — S4 bathroom vanity system. Vanity anchors
      // on the wall opposite the door (the user faces it on entry to
      // wash hands). Mirror sits above the vanity (shares 'vanity'
      // group). Towel rail mounts beside.
      // F4 follow-up (2026-05-31) — towel_rail joins the 'vanity' group
      // so it lands next to the basin (the architect's expectation —
      // towel reach is from the basin, not a random free wall).
      { kind: "vanity_unit", anchor: "wall-opposite-door", facing: "into-room", required: false, group: "vanity", excludeDoorSwing: true },
      { kind: "bathroom_mirror", anchor: "beside", facing: "into-room", required: false, group: "vanity" },
      { kind: "towel_rail", anchor: "beside", facing: "to-wall", required: false, group: "vanity", excludeDoorSwing: true },
      // F1.6' (2026-05-30) — drop-in bath on the longest free wall.
      // Optional (required: false) so tight bathrooms — where the
      // 1.7 m × 0.7 m footprint won't fit after the toilet, shower,
      // and vanity have claimed walls — ship clean with shower-only.
      // excludeDoorSwing + excludeWindowWall so the bath doesn't
      // foul the door or block the window's daylight axis.
      { kind: "bath", anchor: "wall-longest", facing: "into-room", required: false, excludeDoorSwing: true, excludeWindowWall: true }
    ]
  },
  // F3.5 (2026-05-31) — WC archetype. The cloakroom-toilet variant of the
  // bathroom (no shower, no full vanity). Uses the F1.7 compact primitives
  // — wc_washbasin (wall-hung small basin) + wc_mirror (compact mirror).
  // Programme rule (programRules.wc) caps doors to 1 and forbids access
  // from bedroom / kitchen / living. Access only from corridor or hall.
  //
  // §FURNITURE-SPEC: tight footprint — typical UK cloakroom WC is 1.2 m²
  // with a 0.9 m short side. Toilet on the plumbing wall (wet_wall);
  // washbasin perpendicular OR opposite; mirror above the washbasin in
  // the 'wc-basin' group for relative placement.
  "wc": {
    occupancy: "wc",
    minAreaM2: 1.2,
    items: [
      { kind: "toilet_radiator", anchor: "wall-longest", facing: "into-room", required: true, excludeDoorSwing: true },
      { kind: "wc_washbasin", anchor: "wall-opposite-door", facing: "into-room", required: true, group: "wc-basin", excludeDoorSwing: true },
      { kind: "wc_mirror", anchor: "beside", facing: "into-room", required: false, group: "wc-basin" }
    ]
  },
  // §FURNISH-WC-PAN (2026-06-24) — EN-SUITE archetype. The apartment / house
  // generators stamp a master en-suite as `occupancyType: 'ensuite'` (see
  // roomDimensions.ensuite — a tighter envelope than the shared bathroom).
  // Until now there was NO 'ensuite' archetype, so archetypeFor('ensuite')
  // returned null and the en-suite shipped EMPTY: no toilet, no basin, no
  // shower. This is the compact wet-room — it mirrors the 'bathroom' wet
  // fixtures but uses the cloakroom-scale wc_washbasin (the full vanity_unit
  // does not fit a typical ~4 m² en-suite) and drops the optional drop-in bath.
  //
  // §FURNITURE-SPEC: the TOILET (toilet_radiator slot) is required and anchors
  // 'wall-longest' with excludeDoorSwing — so it lands against a wall, NOT on
  // the door wall, and the solver's clearFront (0.60 m, from footprints.ts)
  // reserves knee clearance in front of it. The shower corner-anchors and the
  // solver places it AFTER the toilet so it avoids the toilet's clear-front.
  // Placement is fully deterministic (the solver carries no RNG — fixed
  // candidate order, ties broken by lower x then z).
  "ensuite": {
    occupancy: "ensuite",
    minAreaM2: 2.2,
    items: [
      // Toilet pan — required, against a wall, off the door, clear in front.
      { kind: "toilet_radiator", anchor: "wall-longest", facing: "into-room", required: true, excludeDoorSwing: true },
      // Shower enclosure — required, tucked into a corner away from the door.
      { kind: "shower_glass_panel", anchor: "corner", facing: "into-room", required: true },
      // Compact wall-hung basin opposite the door (faced on entry) + mirror.
      { kind: "wc_washbasin", anchor: "wall-opposite-door", facing: "into-room", required: true, group: "ensuite-basin", excludeDoorSwing: true },
      { kind: "wc_mirror", anchor: "beside", facing: "into-room", required: false, group: "ensuite-basin" }
    ]
  },
  "entrance-lobby": {
    occupancy: "entrance-lobby",
    minAreaM2: 3,
    // F4.2 / S2 (2026-06-01) — the entrance-lobby hosts the Entry Storage
    // activity system. The existing shoe_cabinet + console_table +
    // coat_rack + entry_bench + wall_mirror items (F1.4 / F3.8, group:
    // 'entry') already produce the build; this annotation names the
    // composition for downstream tooling (Family Platform P0, AI hints,
    // schedules, IFC-α exports). See ./activityArchetypes.ts.
    activitySystems: ["entry-storage"],
    items: [
      // §FURNITURE-SPEC: the entrance table is on a wall perpendicular to the
      // front door (the door wall is the swing zone — it must stay clear).
      { kind: "entrance_table", anchor: "wall-longest", facing: "into-room", required: false, excludeDoorSwing: true },
      // F1.4 (2026-05-30) — S2 entry storage activity system.
      //   • shoe_cabinet anchors on the longest free wall (often the
      //     same wall as the console — solver yields).
      //   • coat_rack stands in a corner; small footprint, no wall claim.
      //   • console_table prefers the wall opposite the front door
      //     (the "lobby" wall the user faces on entry — keys/mail
      //     drop landing zone).
      //   • entry_bench is the smallest item; placed last, beside the
      //     shoe_cabinet if room remains.
      { kind: "shoe_cabinet", anchor: "wall-longest", facing: "to-wall", required: false, group: "entry", excludeDoorSwing: true },
      { kind: "console_table", anchor: "wall-opposite-door", facing: "into-room", required: false, group: "entry", excludeDoorSwing: true },
      { kind: "coat_rack", anchor: "corner", facing: "into-room", required: false },
      { kind: "entry_bench", anchor: "beside", facing: "into-room", required: false, group: "entry" },
      // F3.8 (2026-05-30) — wall_mirror above the console_table (the
      // classic "lobby mirror" — quick glance on the way out). Pairs
      // with the 'entry' group and yields to the console's chosen wall.
      { kind: "wall_mirror", anchor: "beside", facing: "into-room", required: false, group: "entry" }
    ]
  },
  "private-office": {
    occupancy: "private-office",
    minAreaM2: 5,
    items: [
      // F1.1 (2026-05-30) — Study workstation proper. The dining-table-
      // as-desk workaround is retired now that desk + desk_chair ship
      // contract-complete (FurnitureType union, FurnitureCategoryMap,
      // DeskBuilder, DeskChairBuilder, FurnitureFactory arms, ai-host
      // FurnitureKind, footprints, programRules.study furnitureSpec).
      //   • desk anchors on the WINDOW WALL so natural light falls
      //     across the worktop from the side (no glare on a monitor).
      //   • desk_chair sits BESIDE the desk in the same group, facing
      //     the wall (i.e. the user faces the wall to work).
      { kind: "desk", anchor: "wall-window", facing: "into-room", required: true, group: "desk" },
      { kind: "desk_chair", anchor: "beside", facing: "to-wall", required: false, group: "desk", count: 1 },
      // F1.2 (2026-05-30) — Open bookshelf as the canonical study
      // companion to the desk. Anchors on the longest free wall (not
      // the window wall — tall piece blocks daylight) and yields to
      // the desk's window-wall claim.
      { kind: "bookshelf", anchor: "wall-longest", facing: "to-wall", required: false, excludeWindowWall: true, excludeDoorSwing: true },
      // F4 follow-up (2026-05-31) — studies have windows
      // (programRules.study.needsWindow = true; the desk anchors on the
      // window wall). Curtains soften the daylight on the worktop.
      { kind: "curtain_rod", anchor: "wall-window", facing: "to-wall", required: false, group: "curtains" },
      { kind: "curtain_panel", anchor: "beside", facing: "to-wall", required: false, group: "curtains", count: 2 }
    ]
  },
  // Circulation / utility — intentionally unfurnished (keep clear).
  "corridor": { occupancy: "corridor", minAreaM2: 0, items: [] },
  // F1.8 (2026-05-30) — Utility / laundry archetype. Closes F3.6.
  // S5 activity system: plumbing wall carries the washer + dryer side-
  // by-side (or stacked when the run is short), utility cabinet on
  // longest free wall for storage, utility sink optional (medium-large
  // rooms only), drying rack wall-mounted above the washer/dryer line.
  // Door swing kept clear from every appliance.
  "utility-room": {
    occupancy: "utility-room",
    minAreaM2: 2,
    items: [
      { kind: "washing_machine_standalone", anchor: "wall-longest", facing: "into-room", required: true, group: "laundry", excludeDoorSwing: true },
      { kind: "tumble_dryer", anchor: "beside", facing: "into-room", required: false, group: "laundry" },
      { kind: "utility_cabinet", anchor: "wall-longest", facing: "to-wall", required: false, excludeDoorSwing: true },
      { kind: "utility_sink", anchor: "wall-longest", facing: "into-room", required: false, excludeDoorSwing: true },
      { kind: "drying_rack", anchor: "beside", facing: "to-wall", required: false, group: "laundry" }
    ]
  }
};
function archetypeFor(occupancy) {
  return ARCHETYPES[occupancy] ?? null;
}

const FP = {
  // Bedroom
  // §FURNITURE-SPEC (2026-05-28): UK double 1.35 × 1.90 m + 0.60 m circulation
  // each side + 0.80 m clearance at the foot. Mirrors programRules.bedroom
  // furnitureSpec[bed]; pinned by the furnishRules.test.ts consistency check.
  bed: { w: 1.35, l: 1.9, h: 0.5, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
  bedside_table: { w: 0.45, l: 0.4, h: 0.5, baseOffset: 0, clearFront: 0, clearSides: 0 },
  wardrobe: { w: 1.2, l: 0.6, h: 2, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  // Living
  sofa: { w: 2, l: 0.9, h: 0.8, baseOffset: 0, clearFront: 0.45, clearSides: 0.1 },
  coffee_table: { w: 1.1, l: 0.6, h: 0.4, baseOffset: 0, clearFront: 0.3, clearSides: 0.1 },
  // Dining
  dining_table: { w: 1.4, l: 0.9, h: 0.75, baseOffset: 0, clearFront: 0.9, clearSides: 0.9 },
  dining_chair: { w: 0.5, l: 0.5, h: 0.9, baseOffset: 0, clearFront: 0, clearSides: 0 },
  // Entrance
  entrance_table: { w: 1, l: 0.4, h: 0.8, baseOffset: 0, clearFront: 0.3, clearSides: 0 },
  // Lighting (floor / corner lamp) — small footprint, kept out of circulation.
  lamp: { w: 0.35, l: 0.35, h: 1.5, baseOffset: 0, clearFront: 0.1, clearSides: 0 },
  // Bathroom fixtures
  // §63.5 (2026-06-11) — the heated TOWEL-RAIL radiator is WALL-MOUNTED + RAISED
  // (bottom rail ~300 mm AFF, the standard mount), NOT floor-standing mid-wall.
  // baseOffset 0.30 lifts it off the floor; the placement (placeAgainstWall) keeps
  // it flush + into-room (back on the wall). w/l/clear* stay pinned to the
  // programRules furnitureSpec (sizeW 400 / sizeD 700 / clearFoot 600 / clearSide
  // 100 mm) — only baseOffset (not pinned) changes here.
  toilet_radiator: { w: 0.4, l: 0.7, h: 0.8, baseOffset: 0.3, clearFront: 0.6, clearSides: 0.1 },
  shower_glass_panel: { w: 0.9, l: 0.9, h: 2, baseOffset: 0, clearFront: 0.2, clearSides: 0 },
  // F1.6' (2026-05-30) — drop-in residential bath (UK standard
  // 1700×700×500 mm). clearFront 0.45 leaves stepping-over room at
  // the long edge; clearSides 0.05 since baths typically butt tight
  // against adjacent walls + the toilet/vanity. Required: false in
  // the bathroom archetype so tight rooms ship clean.
  bath: { w: 1.7, l: 0.7, h: 0.5, baseOffset: 0, clearFront: 0.45, clearSides: 0.05 },
  // F1.7 (2026-05-30) — WC primitives.
  //   wc_washbasin: wall-hung, 450 × 300 mm projection at 0.85 m rim.
  //     clearFront 0.55 leaves elbow room; clearSides 0.05 since the WC
  //     archetype packs them tight against the toilet.
  //   wc_mirror:    wall-mounted, 400 × 30 × 600 mm at 1.20 m baseOffset.
  //     No clearance — flat panel on the wall.
  wc_washbasin: { w: 0.45, l: 0.3, h: 0.15, baseOffset: 0.85, clearFront: 0.55, clearSides: 0.05 },
  wc_mirror: { w: 0.4, l: 0.03, h: 0.6, baseOffset: 1.2, clearFront: 0, clearSides: 0 },
  // F1.8 (2026-05-30) — Utility / laundry primitives.
  //   washing_machine_standalone + tumble_dryer: 600×600×850 mm (UK
  //     standard front-loader cabinet). clearFront 0.70 leaves loading
  //     room; clearSides 0.00 since they typically butt up against each
  //     other side-by-side OR stack vertically (the stacked variant
  //     handled by the archetype, not the footprint).
  //   utility_cabinet: tall 600×400×2000 mm storage tower. clearFront
  //     0.60 leaves door-swing room.
  //   utility_sink: deep stainless 500×350×850 mm sink. clearFront 0.60.
  //   drying_rack: wall-mounted at 1.60 m baseOffset, projects 0.40 m
  //     into the room. clearFront 0.00 (it's above head height) but
  //     small clearSides for the brackets.
  washing_machine_standalone: { w: 0.6, l: 0.6, h: 0.85, baseOffset: 0, clearFront: 0.7, clearSides: 0 },
  tumble_dryer: { w: 0.6, l: 0.6, h: 0.85, baseOffset: 0, clearFront: 0.7, clearSides: 0 },
  utility_cabinet: { w: 0.6, l: 0.4, h: 2, baseOffset: 0, clearFront: 0.6, clearSides: 0.05 },
  utility_sink: { w: 0.5, l: 0.35, h: 0.85, baseOffset: 0, clearFront: 0.6, clearSides: 0.05 },
  drying_rack: { w: 0.8, l: 0.4, h: 0.05, baseOffset: 1.6, clearFront: 0, clearSides: 0.1 },
  // Kitchen runs — parametric placeholders (resolved from config arm lengths).
  kitchen_straight: { w: 3, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 1, clearSides: 0 },
  kitchen_l_shape: { w: 3, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 1, clearSides: 0 },
  kitchen_u_shape: { w: 3, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 1, clearSides: 0 },
  // §KITCHEN-ISLAND (2026-05-29) — standard centre island: 2.0 × 0.9 m
  // counter, 0.9 m kitchen-side circulation each side. Required: false in
  // the archetype, so small kitchens with the run's clearFront blocking
  // the centroid drop the island automatically — only large open-plan
  // kitchens get one.
  kitchen_island: { w: 2, l: 0.9, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0.9 },
  // F-FRIDGE (2026-06-05) — standard free-standing fridge/freezer: 0.60 m wide
  // × 0.65 m deep × 1.80 m tall, ~1.0 m door-open + standing clearance in front.
  fridge: { w: 0.6, l: 0.65, h: 1.8, baseOffset: 0, clearFront: 1, clearSides: 0 },
  // A.21.D20 (2026-06-06) — kitchen appliances + cabinet modules. All sized
  // to the standard 600 mm module so they sit flush IN the worktop run (depth
  // 0.60 m, worktop height 0.90 m). `clearFront` reserves the working/standing
  // zone in front; sides 0 so modules butt flush along the run.
  //   sink:       under-mount in the worktop — modelled as a 600 module.
  //   hob:        cooktop in the worktop; extractor mounts above it.
  //   oven:       under-counter built-in oven (0.90 m cabinet height).
  //   dishwasher: integrated 600 appliance (worktop height).
  //   washing_machine: front-loader 600 module (kitchen/utility run).
  //   extractor:  wall-mounted hood over the hob at 1.50 m baseOffset.
  //   base_unit:  the generic 600 base cabinet the run is composed from.
  //   wall_unit:  600 wall cabinet at 1.45 m baseOffset (above the worktop).
  sink: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  hob: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  oven: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  dishwasher: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  washing_machine: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  extractor: { w: 0.6, l: 0.45, h: 0.45, baseOffset: 1.5, clearFront: 0, clearSides: 0 },
  base_unit: { w: 0.6, l: 0.6, h: 0.9, baseOffset: 0, clearFront: 0.9, clearSides: 0 },
  wall_unit: { w: 0.6, l: 0.35, h: 0.7, baseOffset: 1.45, clearFront: 0, clearSides: 0 },
  // F1.1 (2026-05-30) — Study workstation.
  //   desk: 1.40 m wide × 0.70 m deep × 0.75 m worktop height. 0.90 m
  //         front clearance so the user can roll the chair back without
  //         hitting an opposite wall; 0.45 m side clearance for the chair
  //         tucked under one end.
  //   desk_chair: 0.55 × 0.55 footprint, 0.90 m tall. No additional
  //         clearance — its movement zone is covered by the desk's
  //         clearFront.
  desk: { w: 1.4, l: 0.7, h: 0.75, baseOffset: 0, clearFront: 0.9, clearSides: 0.45 },
  desk_chair: { w: 0.55, l: 0.55, h: 0.9, baseOffset: 0, clearFront: 0, clearSides: 0 },
  // F1.2 (2026-05-30) — Bookshelf (open + glass-front variants).
  //   0.80 m wide × 0.35 m deep × 1.80 m tall. 0.60 m front clearance
  //   so the user can stand back to read titles + retrieve books
  //   without bumping the wall behind them. No side clearance — the
  //   solver may pack two side-by-side along a long wall.
  bookshelf: { w: 0.8, l: 0.35, h: 1.8, baseOffset: 0, clearFront: 0.6, clearSides: 0 },
  bookshelf_glass: { w: 0.8, l: 0.35, h: 1.8, baseOffset: 0, clearFront: 0.6, clearSides: 0 },
  // F1.3 (2026-05-30) — Media wall. §TV-50-LARGER (founder 2026-06-19): both the
  // panel and the console are ~50% larger (a big cinema TV + matching console).
  //   tv: 2.10 m wide × 0.08 m deep × 1.20 m tall. Wall-mounted — baseOffset
  //       lowered to 1.00 m so the bigger panel's centre stays at seated eye
  //       level (top ≈ 2.20 m, clears a 2.7 m ceiling). The media item is
  //       window/door-safe (tv_unit excludeWindowWall+excludeDoorSwing; the TV
  //       yields to the unit's wall), and required:false so it skips a wall it
  //       can't fit rather than clashing.
  //   tv_unit: 2.40 m wide × 0.40 m deep × 0.65 m tall. Sits under the TV. 0.60 m
  //       front clearance so the sofa doesn't crowd the front of the unit.
  tv: { w: 2.1, l: 0.08, h: 1.2, baseOffset: 1.05, clearFront: 0, clearSides: 0 },
  tv_unit: { w: 2.4, l: 0.4, h: 0.65, baseOffset: 0, clearFront: 0.6, clearSides: 0 },
  // F1.4 (2026-05-30) — Entry storage. All anchored on hall walls; the
  // shoe cabinet + console need step-back clearance; the coat rack +
  // entry bench take floor-only space.
  shoe_cabinet: { w: 0.9, l: 0.35, h: 0.9, baseOffset: 0, clearFront: 0.5, clearSides: 0 },
  coat_rack: { w: 0.45, l: 0.45, h: 1.8, baseOffset: 0, clearFront: 0.3, clearSides: 0 },
  console_table: { w: 1, l: 0.3, h: 0.85, baseOffset: 0, clearFront: 0.4, clearSides: 0 },
  entry_bench: { w: 1.2, l: 0.4, h: 0.45, baseOffset: 0, clearFront: 0.5, clearSides: 0 },
  // F1.5 (2026-05-30) — Bathroom vanity system (S4).
  //   vanity_unit floor-anchored cabinet 1.0 × 0.5 × 0.85 m.
  //   bathroom_mirror wall-hung 0.8 × 0.04 × 0.7 m, baseOffset 1.10 m
  //     (above the vanity countertop).
  //   towel_rail wall-hung 0.5 × 0.10 × 0.8 m, baseOffset 0.40 m.
  vanity_unit: { w: 1, l: 0.5, h: 0.85, baseOffset: 0, clearFront: 0.7, clearSides: 0.05 },
  bathroom_mirror: { w: 0.8, l: 0.04, h: 0.7, baseOffset: 1.1, clearFront: 0, clearSides: 0 },
  towel_rail: { w: 0.5, l: 0.1, h: 0.8, baseOffset: 0.4, clearFront: 0, clearSides: 0 },
  // F1.9 (2026-05-30) — Dining-room storage.
  //   buffet (tall): 1.50 m × 0.45 m × 0.90 m, 0.70 m front clearance
  //   sideboard (low): 1.80 m × 0.45 m × 0.75 m, 0.70 m front clearance
  buffet: { w: 1.5, l: 0.45, h: 0.9, baseOffset: 0, clearFront: 0.7, clearSides: 0 },
  sideboard: { w: 1.8, l: 0.45, h: 0.75, baseOffset: 0, clearFront: 0.7, clearSides: 0 },
  // F1.10 (2026-05-30) — Wall decor (both wall-mounted, no floor footprint
  // — clearFront 0 because they don't extrude meaningfully into the room).
  //   wall_art: 0.6 × 0.04 × 0.9 m, baseOffset 1.20 m (centre at eye level).
  //   wall_mirror: 0.5 × 0.04 × 0.8 m, baseOffset 1.20 m.
  wall_art: { w: 0.6, l: 0.04, h: 0.9, baseOffset: 1.2, clearFront: 0, clearSides: 0 },
  wall_mirror: { w: 0.5, l: 0.04, h: 0.8, baseOffset: 1.2, clearFront: 0, clearSides: 0 },
  // §OVERBED-WALL-TAPESTRY (founder, 2026-06-18) — woven textile wall-hanging
  // that replaces the over-bed wall_mirror. Same thin wall-mounted panel family
  // (l ≈ 0.04 m, no floor footprint) at the SAME eye/over-bed mount height
  // (baseOffset 1.20 m) so the praised over-bed POSITION is unchanged; a touch
  // wider + taller than the mirror so it reads as a decorative hanging.
  wall_tapestry: { w: 0.8, l: 0.04, h: 1, baseOffset: 1.2, clearFront: 0, clearSides: 0 },
  // F1.13 (2026-05-30) — Lounge chair semantic alias (Barcelona silhouette).
  //   0.85 m × 0.85 m × 0.95 m, generous footprint typical of a lounge chair.
  lounge_chair: { w: 0.85, l: 0.85, h: 0.95, baseOffset: 0, clearFront: 0.2, clearSides: 0.1 },
  // F1.14 (2026-05-30) — Tall narrow kitchen pantry.
  //   0.60 m × 0.45 m × 2.10 m, 1.0 m front clearance (door swing + user reach).
  pantry_cabinet: { w: 0.6, l: 0.45, h: 2.1, baseOffset: 0, clearFront: 1, clearSides: 0 },
  // F1.12 (2026-05-30) — Bedroom dressing.
  //   dresser 1.20 × 0.50 × 0.85 m, 0.80 m front clearance (drawer pull-out).
  //   vanity_table 0.90 × 0.45 × 0.75 m, 0.85 m front clearance (chair pull-out).
  dresser: { w: 1.2, l: 0.5, h: 0.85, baseOffset: 0, clearFront: 0.8, clearSides: 0 },
  vanity_table: { w: 0.9, l: 0.45, h: 0.75, baseOffset: 0, clearFront: 0.85, clearSides: 0.1 },
  // F1.11 (2026-05-30) — Curtains.
  //   curtain_rod: 2.0 m wide (sized at runtime to bridge window), 0.04 m deep,
  //     0.04 m tall envelope; mounted at baseOffset 2.40 m (ceiling-adjacent).
  //   curtain_panel: 1.0 m wide × 0.05 m deep × 2.40 m tall fabric panel.
  //     Cross-room; archetype places TWO per rod (left + right) via count: 2.
  curtain_rod: { w: 2, l: 0.04, h: 0.04, baseOffset: 2.4, clearFront: 0, clearSides: 0 },
  curtain_panel: { w: 1, l: 0.05, h: 2.4, baseOffset: 0, clearFront: 0, clearSides: 0 },
  // §67.1 (2026-06-11) — soft-furnishing RUG. A thin flat rug (1.60 × 2.30 m)
  // sitting ON the floor (baseOffset 0, h 0.02). ZERO clearances + collision-
  // EXEMPT (placeSolver `under` anchor): it underlaps the bed / dining table /
  // sofa it is laid beneath, so it must NOT reserve space or block placement.
  // The engine resizes it at placement to fit under the leader.
  rug: { w: 1.6, l: 2.3, h: 0.02, baseOffset: 0, clearFront: 0, clearSides: 0 },
  // §67.3 (2026-06-11) — L-shape / corner sofa. `w` (2.60 m) is the main run
  // along the anchor wall; `l` (2.00 m) is the side run's depth into the room.
  // clearFront 0.45 (like the straight sofa) keeps the coffee-table / walkway
  // zone; clearSides 0.10. Mirrors the geometry-furniture CornerSofaBuilder
  // (width = main run, length = side run).
  corner_sofa: { w: 2.6, l: 2, h: 0.85, baseOffset: 0, clearFront: 0.45, clearSides: 0.1 },
  // §LIVING-SOCIAL-ZONE (founder, 2026-06-21) — living/family social-zone furniture.
  //   armchair: single accent chair 0.90 × 0.85 m, 0.45 m front (foot/leg room), 0.10 sides.
  //   sofa_unit: modular sofa section 1.00 × 0.95 m (one bay; the planner tiles several into a run);
  //     0.45 m front walkway, 0.05 sides so units butt flush along the run.
  //   side_table: small accent table 0.50 × 0.50 m beside the seating; minimal clearance.
  //   fireplace: floor-standing glass-faced hearth 1.20 × 0.45 m against a wall; 0.80 m hearth
  //     clearance in front (fire safety / no furniture in the radiant zone), 0.20 sides.
  armchair: { w: 0.9, l: 0.85, h: 0.8, baseOffset: 0, clearFront: 0.45, clearSides: 0.1 },
  sofa_unit: { w: 1, l: 0.95, h: 0.8, baseOffset: 0, clearFront: 0.45, clearSides: 0.05 },
  side_table: { w: 0.5, l: 0.5, h: 0.55, baseOffset: 0, clearFront: 0.1, clearSides: 0.05 },
  fireplace: { w: 1.2, l: 0.45, h: 0.6, baseOffset: 0, clearFront: 0.8, clearSides: 0.2 },
  // §67.2 (2026-06-11) — bed variety. The integrated set's variant beds. Sized
  // to the BedFactory presets (nordic 1.80 × 2.20, solid_wood 1.75 × 2.20) with
  // the plain `bed`'s circulation clearances (0.80 foot, 0.60 sides). The
  // plain `bed` footprint above stays the rules-DB-pinned 1.35 × 1.90.
  nordic_bed: { w: 1.8, l: 2.2, h: 0.5, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
  solid_wood_bed: { w: 1.75, l: 2.2, h: 0.55, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
  // §BED-4-TYPES (2026-06-12) → §BED-HEADBOARD-FLUSH (founder #7, 2026-06-12) —
  // the three JapaneseBedBuilder variants in the editor's bed picker. The
  // footprint `l` (depth into the room, head→foot) MUST equal the variant's TRUE
  // mesh DECK length so the wall-anchored placement leaves the headboard flush on
  // the wall (the headboard adds a further ~5 cm rear overhang, handled at
  // placement via BED_REAR_OVERHANG). The BedEngine builds:
  //   • platform → PLINTH_L = max(1.80, cfg.length)   → length-parametric (2.20).
  //   • float    → DECK_L   = 2.10 + 0.20  = 2.30      → FIXED (ignores cfg.length).
  //   • walnut   → DECK_L   = 2.10 + 2×0.10 = 2.30      → FIXED (ignores cfg.length).
  // The walnut footprint was 1.80 × 2.00 — 0.60 m SHORTER than its (then 2.60 m)
  // deck — so its headboard projected ~0.35 m past the footprint back edge and
  // PENETRATED the head wall (founder #7). The walnut deck overhang was reduced to
  // 0.10 m (BedEngine.buildWalnut) → a queen-sane 1.80 × 2.30 m deck (same depth as
  // float), and the footprint now tracks it EXACTLY so the headboard sits flush + the
  // bed fits a standard bedroom. `w` = deck width (bedside WINGS overhang it at the
  // head end, not reserved — same convention as float). Clearances mirror the plain
  // bed (0.80 foot, 0.60 sides).
  japanese_platform_bed: { w: 2, l: 2.2, h: 0.45, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
  japanese_float_bed: { w: 2, l: 2.3, h: 0.45, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 },
  japanese_walnut_bed: { w: 1.8, l: 2.3, h: 0.5, baseOffset: 0, clearFront: 0.8, clearSides: 0.6 }
};
function footprintOf(kind) {
  return FP[kind];
}

const EPS$2 = 1e-6;
function pointInPolygon$1(p, poly) {
  return pointInPolygonXZ(p.x, p.z, poly);
}
function footprintCorners(cx, cz, w, l, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const hw = w / 2, hl = l / 2;
  const local = [{ x: -hw, z: -hl }, { x: hw, z: -hl }, { x: hw, z: hl }, { x: -hw, z: hl }];
  const r = local.map((p) => ({ x: cx + p.x * c + p.z * s, z: cz - p.x * s + p.z * c }));
  return [r[0], r[1], r[2], r[3]];
}
const quadCenter = (q) => ({
  x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
  z: (q[0].z + q[1].z + q[2].z + q[3].z) / 4
});
function quadInPolygon(q, poly) {
  if (!pointInPolygon$1(quadCenter(q), poly)) return false;
  for (const c of q) if (!pointInPolygon$1(c, poly)) return false;
  return true;
}
function quadsOverlap(a, b) {
  const project = (q, ax) => {
    let mn = Infinity, mx = -Infinity;
    for (const p of q) {
      const d = p.x * ax.x + p.z * ax.z;
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    return [mn, mx];
  };
  for (const q of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p1 = q[i], p2 = q[i + 1 & 3];
      const axis = { x: -(p2.z - p1.z), z: p2.x - p1.x };
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (maxA < minB + EPS$2 || maxB < minA + EPS$2) return false;
    }
  }
  return true;
}
const quadOverlapsAny = (q, others) => others.some((o) => quadsOverlap(q, o));

const wallMid = (w) => ({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 });
function wallDir(w) {
  const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}
const yawFromNormal = (n) => Math.atan2(n.x, n.z);
const dot = (a, b) => a.x * b.x + a.z * b.z;
function longestWall(walls) {
  let best = null;
  for (const w of walls) {
    if (!best || w.length > best.length + 1e-9 || Math.abs(w.length - best.length) < 1e-9 && wallMid(w).x < wallMid(best).x - 1e-9) best = w;
  }
  return best;
}
function wallOppositeDoor(walls, doors) {
  if (doors.length === 0) return longestWall(walls);
  const dn = doors[0].normal;
  let best = null, bestScore = Infinity;
  for (const w of walls) {
    const score = dot(w.inwardNormal, dn);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = w;
    }
  }
  return best ?? longestWall(walls);
}
function openingOnWall(o, w) {
  const d = wallDir(w);
  const t = (o.center.x - w.a.x) * d.x + (o.center.z - w.a.z) * d.z;
  if (t < -0.05 || t > w.length + 0.05) return false;
  const px = w.a.x + d.x * t, pz = w.a.z + d.z * t;
  return Math.hypot(o.center.x - px, o.center.z - pz) < 0.3;
}
const wallHasWindow = (w, windows) => windows.some((win) => openingOnWall(win, w));
const wallHasDoor = (w, doors) => doors.some((d) => openingOnWall(d, w));
function wallWithWindow(walls, windows) {
  let best = null;
  for (const w of walls) {
    if (wallHasWindow(w, windows) && (!best || w.length > best.length)) best = w;
  }
  return best ?? longestWall(walls);
}

const GAP$2 = 0.02;
const SLIDE_STEP = 0.25;
const add$2 = (a, b, s = 1) => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const perp = (n) => ({ x: n.z, z: -n.x });
const dot2$2 = (a, b) => a.x * b.x + a.z * b.z;
const len2$1 = (a) => Math.hypot(a.x, a.z);
const norm2$1 = (a) => {
  const l = len2$1(a) || 1;
  return { x: a.x / l, z: a.z / l };
};
const BED_KINDS = /* @__PURE__ */ new Set([
  "bed",
  "nordic_bed",
  "solid_wood_bed",
  // §BED-4-TYPES (2026-06-12) — the three JapaneseBedBuilder picker variants.
  "japanese_platform_bed",
  "japanese_float_bed",
  "japanese_walnut_bed"
]);
const isBedKind = (k) => BED_KINDS.has(k);
const BED_REAR_OVERHANG$1 = {
  bed: 0,
  // BedBuilder: headboard inside the frame → flush.
  japanese_platform_bed: 0.05,
  // BedEngine platform HB_THICKNESS.
  japanese_float_bed: 0.05,
  // BedEngine float HB_THICKNESS.
  japanese_walnut_bed: 0.05,
  // BedEngine walnut HB_THICKNESS.
  nordic_bed: 0.04,
  // BedEngine nordic HB_THICKNESS.
  solid_wood_bed: 0.05
  // BedEngine solid_wood HB_THICKNESS.
};
const bedRearOverhang = (k) => BED_REAR_OVERHANG$1[k] ?? 0;
const BED_SIDE_OVERHANG$1 = {
  bed: 0,
  japanese_platform_bed: 0.5,
  // BedEngine.buildPlatform NS_W
  japanese_float_bed: 0.45,
  // BedEngine.buildFloat   WING_W
  japanese_walnut_bed: 0.4,
  // BedEngine.buildWalnut  WING_W
  nordic_bed: 0,
  solid_wood_bed: 0
};
const bedSideOverhang = (k) => BED_SIDE_OVERHANG$1[k] ?? 0;
function bedOccupiedQuad(item) {
  const fp = item.footprint;
  const side = bedSideOverhang(item.kind);
  const rear = bedRearOverhang(item.kind);
  if (side === 0 && rear === 0) {
    return footprintCorners(item.position.x, item.position.z, fp.w, fp.l, item.rotationY);
  }
  const n = { x: Math.sin(item.rotationY), z: Math.cos(item.rotationY) };
  const cx = item.position.x - n.x * (rear / 2);
  const cz = item.position.z - n.z * (rear / 2);
  return footprintCorners(cx, cz, fp.w + 2 * side, fp.l + rear, item.rotationY);
}
const SOFA_KINDS$1 = /* @__PURE__ */ new Set(["sofa", "corner_sofa"]);
const isSofaKind = (k) => SOFA_KINDS$1.has(k);
const WALL_HOSTED_BESIDE = /* @__PURE__ */ new Set([
  "bathroom_mirror",
  "wc_mirror",
  "wall_mirror",
  "wall_art",
  "tv",
  "towel_rail",
  // §OVERBED-WALL-TAPESTRY (2026-06-18) — the over-bed textile hanging mounts
  // exactly like the wall_mirror it replaces: pinned to the bed wall ABOVE the
  // bed at its baseOffset (eye/over-bed height), so the praised position holds.
  "wall_tapestry"
]);
const isWallHostedBeside = (k) => WALL_HOSTED_BESIDE.has(k);
const WALL_HOSTED_SIDE = /* @__PURE__ */ new Set(["towel_rail"]);
const isWallHostedSide = (k) => WALL_HOSTED_SIDE.has(k);
function doorObstacles$1(input) {
  return input.doors.map((d) => {
    const swingR = Math.max(d.width, 0.9);
    const c = add$2(d.center, d.normal, swingR / 2);
    return footprintCorners(c.x, c.z, d.width, swingR, yawFromNormal(d.normal));
  });
}
function clearFrontRectFor(p) {
  const fp = p.item.footprint;
  if (fp.clearFront <= 0) return null;
  const yaw = p.item.rotationY;
  const n = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const cx = p.item.position.x + n.x * (fp.l / 2 + fp.clearFront / 2);
  const cz = p.item.position.z + n.z * (fp.l / 2 + fp.clearFront / 2);
  return footprintCorners(cx, cz, fp.w, fp.clearFront, yaw);
}
function placeAgainstWall(kind, wall, input, obstacles) {
  const fp = footprintOf(kind);
  const yaw = yawFromNormal(wall.inwardNormal);
  const base = add$2(wallMid(wall), wall.inwardNormal, fp.l / 2 + (wall.thickness ?? 0) / 2 + GAP$2);
  const dir = wallDir(wall);
  const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
  const offsets = [0];
  for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) {
    offsets.push(s, -s);
  }
  for (const off of offsets) {
    const c = add$2(base, dir, off);
    const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
      return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad };
    }
  }
  return null;
}
function placeBedAgainstWall(kind, wall, input, obstacles) {
  const fp = footprintOf(kind);
  const overhang = bedRearOverhang(kind);
  const yaw = yawFromNormal(wall.inwardNormal);
  const n = wall.inwardNormal;
  const base = add$2(wallMid(wall), n, fp.l / 2 + overhang + (wall.thickness ?? 0) / 2 + GAP$2);
  const fullLen = fp.l + overhang;
  const dir = wallDir(wall);
  const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
  const offsets = [0];
  for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) {
    offsets.push(s, -s);
  }
  for (const off of offsets) {
    const c = add$2(base, dir, off);
    const deckQuad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    const fullCtr = add$2(c, n, -overhang / 2);
    const fullQuad = footprintCorners(fullCtr.x, fullCtr.z, fp.w, fullLen, yaw);
    if (quadInPolygon(fullQuad, input.polygon) && !quadOverlapsAny(deckQuad, obstacles)) {
      return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad: deckQuad };
    }
  }
  return null;
}
function placeAtPoint(kind, c, yaw, input, obstacles) {
  const fp = footprintOf(kind);
  const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
  if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
    return { item: { kind, position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z }, rotationY: yaw, footprint: fp, hostedSpaceId: input.roomId }, quad };
  }
  return null;
}
function placeCenterRobust(kind, centerYaw, input, obstacles) {
  const fpBase = footprintOf(kind);
  const vcx = input.polygon.reduce((s, p) => s + p.x, 0) / Math.max(1, input.polygon.length);
  const vcz = input.polygon.reduce((s, p) => s + p.z, 0) / Math.max(1, input.polygon.length);
  const centres = [input.centroid, { x: vcx, z: vcz }];
  const yaws = [centerYaw, centerYaw + Math.PI / 2];
  const scales = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55];
  for (const scale of scales) {
    const w = fpBase.w * scale;
    const l = fpBase.l * scale;
    for (const c of centres) {
      for (const yaw of yaws) {
        const quad = footprintCorners(c.x, c.z, w, l, yaw);
        if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
          const footprint = scale === 1 ? fpBase : { ...fpBase, w, l };
          return {
            item: {
              kind,
              position: { x: c.x, y: input.levelElevation + fpBase.baseOffset, z: c.z },
              rotationY: yaw,
              footprint,
              hostedSpaceId: input.roomId
            },
            quad
          };
        }
      }
    }
  }
  return null;
}
function pickByAnchor(spec, walls, input) {
  switch (spec.anchor) {
    case "wall-opposite-door":
      return wallOppositeDoor(walls, input.doors);
    case "wall-window":
      return wallWithWindow(walls, input.windows);
    case "wall-longest":
    default:
      return longestWall(walls);
  }
}
function resolveAnchorWalls(spec, input) {
  const dropWindow = !!spec.excludeWindowWall && spec.anchor !== "wall-window";
  const dropDoor = !!spec.excludeDoorSwing;
  const allWalls = input.walls;
  const noWindow = (w) => !dropWindow || !wallHasWindow(w, input.windows);
  const noDoor = (w) => !dropDoor || !wallHasDoor(w, input.doors);
  const tiers = [];
  if (dropWindow || dropDoor) tiers.push(allWalls.filter((w) => noWindow(w) && noDoor(w)));
  if (dropDoor && dropWindow) tiers.push(allWalls.filter(noWindow));
  tiers.push(allWalls);
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  const push = (w) => {
    if (w && !seen.has(w)) {
      seen.add(w);
      ordered.push(w);
    }
  };
  for (const tier of tiers) {
    if (tier.length === 0) continue;
    push(pickByAnchor(spec, tier, input));
    for (const w of tier) push(w);
  }
  return ordered;
}
function leaderIsWallAnchored(L, input) {
  const n = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };
  const fx = L.position.x - n.x * (L.footprint.l / 2);
  const fz = L.position.z - n.z * (L.footprint.l / 2);
  for (const w of input.walls) {
    const dir = wallDir(w);
    const t = (fx - w.a.x) * dir.x + (fz - w.a.z) * dir.z;
    if (t < -0.05 || t > w.length + 0.05) continue;
    const px = w.a.x + dir.x * t, pz = w.a.z + dir.z * t;
    if (Math.hypot(fx - px, fz - pz) < 0.12) return true;
  }
  return false;
}
function placeOnLeaderWall(spec, leader, input) {
  const out = [];
  const L = leader.item;
  const n = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };
  const d = perp(n);
  const fp = footprintOf(spec.kind);
  const count = spec.count ?? 1;
  const wallFaceX = L.position.x - n.x * (L.footprint.l / 2);
  const wallFaceZ = L.position.z - n.z * (L.footprint.l / 2);
  const baseX = wallFaceX + n.x * (fp.l / 2);
  const baseZ = wallFaceZ + n.z * (fp.l / 2);
  const sideMount = isWallHostedSide(spec.kind);
  const sideShift = L.footprint.w / 2 + fp.w / 2 + GAP$2;
  const span = Math.max(L.footprint.w - fp.w, 0);
  for (let i = 0; i < count; i++) {
    const t = sideMount ? count === 1 ? sideShift : (i % 2 === 0 ? 1 : -1) * sideShift : count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
    const cx = baseX + d.x * t;
    const cz = baseZ + d.z * t;
    const yaw = L.rotationY;
    const quad = footprintCorners(cx, cz, fp.w, fp.l, yaw);
    out.push({
      item: {
        kind: spec.kind,
        position: { x: cx, y: input.levelElevation + fp.baseOffset, z: cz },
        rotationY: yaw,
        footprint: fp,
        hostedSpaceId: input.roomId
      },
      quad
    });
  }
  return out;
}
function placeBeside(spec, leader, input, obstacles) {
  const out = [];
  const L = leader.item;
  const n = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };
  const d = perp(n);
  const fp = footprintOf(spec.kind);
  const count = spec.count ?? 1;
  const tryPush = (c, yaw) => {
    const p = placeAtPoint(spec.kind, c, yaw, input, obstacles);
    if (p) {
      out.push(p);
      obstacles.push(p.quad);
    }
  };
  if (isWallHostedBeside(spec.kind) && leaderIsWallAnchored(L, input)) {
    for (const p of placeOnLeaderWall(spec, leader, input)) out.push(p);
    return out;
  }
  if (isBedKind(L.kind)) {
    const wallPt = add$2({ x: L.position.x, z: L.position.z }, n, -L.footprint.l / 2);
    const headCtr = add$2(wallPt, n, fp.l / 2 + GAP$2);
    const side = L.footprint.w / 2 + fp.w / 2 + GAP$2;
    const slots = [side, -side].slice(0, count);
    for (const s of slots) {
      const before = out.length;
      for (let extra = 0; extra <= 4 * SLIDE_STEP + 1e-6; extra += SLIDE_STEP) {
        tryPush(add$2(headCtr, d, s + Math.sign(s) * extra), L.rotationY);
        if (out.length > before) break;
      }
    }
  } else if (leader.cornerAnchored) {
    const pk = cornerSofaPocket(L, fp);
    tryPush(pk.center, pk.yaw);
  } else if (isSofaKind(L.kind)) {
    const c = add$2({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.35 + fp.l / 2);
    tryPush(c, L.rotationY);
  } else if (L.kind === "dining_table") {
    const tc = { x: L.position.x, z: L.position.z };
    const half = { fwd: L.footprint.l / 2 + fp.l / 2 + GAP$2, side: L.footprint.w / 2 + fp.l / 2 + GAP$2 };
    const slots = [
      { c: add$2(tc, n, half.fwd), yaw: L.rotationY + Math.PI },
      { c: add$2(tc, n, -half.fwd), yaw: L.rotationY },
      { c: add$2(tc, d, half.side), yaw: L.rotationY - Math.PI / 2 },
      { c: add$2(tc, d, -half.side), yaw: L.rotationY + Math.PI / 2 }
    ];
    for (const s of slots.slice(0, count)) tryPush(s.c, s.yaw);
  } else {
    tryPush(add$2({ x: L.position.x, z: L.position.z }, n, L.footprint.l / 2 + 0.1 + fp.l / 2), L.rotationY + Math.PI);
  }
  return out;
}
function placeUnder(spec, leader, input) {
  const fpBase = footprintOf(spec.kind);
  const L = leader.item;
  const n = { x: Math.sin(L.rotationY), z: Math.cos(L.rotationY) };
  const yaw = L.rotationY;
  let targetW;
  let targetL;
  if (L.kind === "dining_table") {
    targetW = L.footprint.w + 1.4;
    targetL = L.footprint.l + 1.4;
  } else if (isSofaKind(L.kind)) {
    targetW = L.footprint.w;
    targetL = Math.max(fpBase.l, L.footprint.l + 0.9);
  } else {
    targetW = L.footprint.w + 0.5;
    targetL = L.footprint.l + 0.7;
  }
  let cx = L.position.x;
  let cz = L.position.z;
  if (leader.cornerAnchored) {
    const pk = cornerSofaPocket(L);
    cx = pk.center.x;
    cz = pk.center.z;
  } else if (isSofaKind(L.kind)) {
    const shift = L.footprint.l / 2 + 0.35;
    cx += n.x * shift;
    cz += n.z * shift;
  } else if (isBedKind(L.kind) && bedSideOverhang(L.kind) > 0) {
    const shift = L.footprint.l / 2;
    cx += n.x * shift;
    cz += n.z * shift;
    targetL = Math.max(fpBase.l, 1.6);
  }
  for (let scale = 1; scale >= 0.4 - 1e-9; scale -= 0.1) {
    const w = targetW * scale;
    const l = targetL * scale;
    const quad = footprintCorners(cx, cz, w, l, yaw);
    if (quadInPolygon(quad, input.polygon)) {
      const footprint = { ...fpBase, w, l };
      return {
        item: {
          kind: spec.kind,
          position: { x: cx, y: input.levelElevation + fpBase.baseOffset, z: cz },
          rotationY: yaw,
          footprint,
          hostedSpaceId: input.roomId
        },
        quad
      };
    }
  }
  return null;
}
function cornerPoints(input, inset) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of input.polygon) {
    x0 = Math.min(x0, p.x);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    z1 = Math.max(z1, p.z);
  }
  const corners = [
    { x: x0 + inset, z: z0 + inset },
    { x: x1 - inset, z: z0 + inset },
    { x: x1 - inset, z: z1 - inset },
    { x: x0 + inset, z: z1 - inset }
  ];
  const door = input.doors[0];
  if (!door) return corners;
  const dx = door.center.x, dz = door.center.z;
  const dist2 = (c) => (c.x - dx) * (c.x - dx) + (c.z - dz) * (c.z - dz);
  return [...corners].sort((a, b) => {
    const da = dist2(a), db = dist2(b);
    if (db !== da) return db - da;
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
  });
}
const CORNER_SOFA_SEAT_DEPTH = 0.9;
const POCKET_GAP = 0.4;
function findRoomCorners(input) {
  const W = input.walls;
  const out = [];
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
  const legFrom = (w, v) => near(w.a, v) ? norm2$1({ x: w.b.x - v.x, z: w.b.z - v.z }) : norm2$1({ x: w.a.x - v.x, z: w.a.z - v.z });
  for (let i = 0; i < W.length; i++) {
    for (let j = i + 1; j < W.length; j++) {
      const wi = W[i], wj = W[j];
      const verts = [];
      for (const a of [wi.a, wi.b]) for (const b of [wj.a, wj.b]) if (near(a, b)) verts.push(a);
      if (verts.length === 0) continue;
      const v = verts[0];
      const e1 = legFrom(wi, v), e2 = legFrom(wj, v);
      if (Math.abs(dot2$2(e1, e2)) > 0.2) continue;
      out.push({ p: v, e1, e2 });
    }
  }
  return out;
}
function mediaFacingDir(input, from) {
  const noWin = input.walls.filter((w) => !wallHasWindow(w, input.windows) && !wallHasDoor(w, input.doors));
  const media = wallOppositeDoor(noWin.length ? noWin : input.walls, input.doors);
  if (media) {
    const m = wallMid(media);
    return norm2$1({ x: m.x - from.x, z: m.z - from.z });
  }
  return norm2$1({ x: input.centroid.x - from.x, z: input.centroid.z - from.z });
}
function placeCornerSofa(input, obstacles) {
  const fp = footprintOf("corner_sofa");
  const corners = findRoomCorners(input);
  if (corners.length === 0) return null;
  const cands = [];
  for (const corner of corners) {
    const tries = [
      { u: corner.e1, v: corner.e2 },
      { u: corner.e2, v: corner.e1 }
    ];
    for (const { u, v } of tries) {
      const forcedV = { x: -u.z, z: u.x };
      if (dot2$2(forcedV, v) < 0.95) continue;
      const yaw = Math.atan2(-u.z, u.x);
      const pos = { x: corner.p.x + (u.x + v.x) * GAP$2, z: corner.p.z + (u.z + v.z) * GAP$2 };
      const cx = pos.x + u.x * (fp.w / 2) + v.x * (fp.l / 2);
      const cz = pos.z + u.z * (fp.w / 2) + v.z * (fp.l / 2);
      const quad = footprintCorners(cx, cz, fp.w, fp.l, yaw);
      if (!quadInPolygon(quad, input.polygon)) continue;
      if (quadOverlapsAny(quad, obstacles)) continue;
      const open = norm2$1({ x: u.x + v.x, z: u.z + v.z });
      const face = mediaFacingDir(input, { x: cx, z: cz });
      const openScore = dot2$2(open, face);
      cands.push({ quad, pos, yaw, score: openScore });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
  const best = cands[0];
  return {
    item: {
      kind: "corner_sofa",
      position: { x: best.pos.x, y: input.levelElevation + fp.baseOffset, z: best.pos.z },
      rotationY: best.yaw,
      footprint: fp,
      hostedSpaceId: input.roomId
    },
    quad: best.quad
  };
}
function cornerSofaLegQuads(L) {
  const yaw = L.rotationY;
  const u = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const v = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const corner = { x: L.position.x, z: L.position.z };
  const seatDepth = CORNER_SOFA_SEAT_DEPTH;
  const w = L.footprint.w, l = L.footprint.l;
  const mc = {
    x: corner.x + u.x * (w / 2) + v.x * (seatDepth / 2),
    z: corner.z + u.z * (w / 2) + v.z * (seatDepth / 2)
  };
  const mainQuad = footprintCorners(mc.x, mc.z, w, seatDepth, yaw);
  const sc = {
    x: corner.x + u.x * (seatDepth / 2) + v.x * (l / 2),
    z: corner.z + u.z * (seatDepth / 2) + v.z * (l / 2)
  };
  const sideQuad = footprintCorners(sc.x, sc.z, seatDepth, l, yaw);
  return [mainQuad, sideQuad];
}
function cornerSofaPocket(L, fp) {
  const yaw = L.rotationY;
  const u = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const v = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const corner = { x: L.position.x, z: L.position.z };
  const open = norm2$1({ x: u.x + v.x, z: u.z + v.z });
  const reachU = CORNER_SOFA_SEAT_DEPTH + POCKET_GAP + (fp ? fp.w / 2 : 0.45);
  const reachV = CORNER_SOFA_SEAT_DEPTH + POCKET_GAP + (fp ? fp.l / 2 : 0.45);
  const center = {
    x: corner.x + u.x * reachU + v.x * reachV,
    z: corner.z + u.z * reachU + v.z * reachV
  };
  return { center, open, yaw };
}
function sofaPose(sofa) {
  const v = { x: Math.sin(sofa.rotationY), z: Math.cos(sofa.rotationY) };
  if (sofa.kind === "corner_sofa") {
    const u = { x: Math.cos(sofa.rotationY), z: -Math.sin(sofa.rotationY) };
    const halfMain = sofa.footprint.w / 2, seatDepth = 0.45;
    const seat = {
      x: sofa.position.x + u.x * halfMain + v.x * seatDepth,
      z: sofa.position.z + u.z * halfMain + v.z * seatDepth
    };
    return { fwd: v, seat };
  }
  return { fwd: v, seat: { x: sofa.position.x, z: sofa.position.z } };
}
function focalWallForSofa(sofa, input) {
  const { fwd } = sofaPose(sofa);
  const dirs = sofa.kind === "corner_sofa" ? [fwd, { x: Math.cos(sofa.rotationY), z: -Math.sin(sofa.rotationY) }] : [fwd];
  const prefer = input.walls.filter((w) => !wallHasWindow(w, input.windows) && !wallHasDoor(w, input.doors));
  const longest = longestWall(prefer);
  let best = null;
  let bestScore = Infinity, bestIsLongest = true;
  for (const look of dirs) {
    for (const w of prefer) {
      const faces = dot2$2(w.inwardNormal, look);
      if (faces >= -0.5) continue;
      const isLongest = w === longest;
      if (faces < bestScore - 1e-3 || Math.abs(faces - bestScore) <= 1e-3 && bestIsLongest && !isLongest) {
        bestScore = faces;
        best = w;
        bestIsLongest = isLongest;
      }
    }
  }
  return best;
}
function placeMediaOppositeSofa(kind, sofa, input, obstacles) {
  const wall = focalWallForSofa(sofa, input);
  if (!wall) return null;
  const fp = footprintOf(kind);
  const yaw = yawFromNormal(wall.inwardNormal);
  const { seat } = sofaPose(sofa);
  const dir = wallDir(wall);
  const t0 = (seat.x - wall.a.x) * dir.x + (seat.z - wall.a.z) * dir.z;
  const tClamped = Math.max(fp.w / 2 + GAP$2, Math.min(t0, wall.length - fp.w / 2 - GAP$2));
  const baseOnWall = add$2(wall.a, dir, tClamped);
  const base = add$2(baseOnWall, wall.inwardNormal, fp.l / 2 + (wall.thickness ?? 0) / 2 + GAP$2);
  const maxSlide = Math.max(0, wall.length / 2 - fp.w / 2);
  const offsets = [0];
  for (let s = SLIDE_STEP; s <= maxSlide + 1e-6; s += SLIDE_STEP) {
    offsets.push(s, -s);
  }
  for (const off of offsets) {
    const c = add$2(base, dir, off);
    const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
      return {
        item: {
          kind,
          position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
          rotationY: yaw,
          footprint: fp,
          hostedSpaceId: input.roomId
        },
        quad
      };
    }
  }
  return null;
}
function roomTiltYaw(walls) {
  const w = longestWall(walls);
  if (!w) return 0;
  const d = wallDir(w);
  const a = Math.atan2(-d.z, d.x);
  const q = Math.PI / 2;
  return a - Math.round(a / q) * q;
}
function applyArchetype(input, archetype, obstacles, leaders) {
  if (input.areaM2 < archetype.minAreaM2 || input.walls.length === 0) return [];
  const added = [];
  const centerYaw = roomTiltYaw(input.walls);
  for (const spec of archetype.items) {
    if (spec.minAreaM2 !== void 0 && input.areaM2 < spec.minAreaM2) continue;
    if (spec.anchor === "beside") {
      const leader = spec.group ? leaders.get(spec.group) : void 0;
      if (!leader) continue;
      for (const p2 of placeBeside(spec, leader, input, obstacles)) added.push(p2);
      continue;
    }
    if (spec.anchor === "under") {
      const leader = spec.group ? leaders.get(spec.group) : void 0;
      if (!leader) continue;
      const rug = placeUnder(spec, leader, input);
      if (rug) added.push(rug);
      continue;
    }
    let p = null;
    let cornerAnchored = false;
    if (spec.anchor === "center") {
      p = spec.required ? placeCenterRobust(spec.kind, centerYaw, input, obstacles) : placeAtPoint(spec.kind, input.centroid, centerYaw, input, obstacles);
    } else if (spec.anchor === "corner") {
      const fp = footprintOf(spec.kind);
      for (const c of cornerPoints(input, Math.max(fp.w, fp.l) / 2 + GAP$2)) {
        p = placeAtPoint(spec.kind, c, centerYaw, input, obstacles);
        if (p) break;
      }
    } else if (spec.kind === "corner_sofa") {
      p = placeCornerSofa(input, obstacles);
      if (p) {
        cornerAnchored = true;
      } else {
        for (const wall of resolveAnchorWalls(spec, input)) {
          p = placeAgainstWall(spec.kind, wall, input, obstacles);
          if (p) break;
        }
      }
    } else if (spec.kind === "tv_unit") {
      const sofaLeader = leaders.get("sofa");
      if (sofaLeader) p = placeMediaOppositeSofa(spec.kind, sofaLeader.item, input, obstacles);
      if (!p) {
        for (const wall of resolveAnchorWalls(spec, input)) {
          p = placeAgainstWall(spec.kind, wall, input, obstacles);
          if (p) break;
        }
      }
    } else if (isBedKind(spec.kind)) {
      for (const wall of resolveAnchorWalls(spec, input)) {
        p = placeBedAgainstWall(spec.kind, wall, input, obstacles);
        if (p) break;
      }
    } else {
      for (const wall of resolveAnchorWalls(spec, input)) {
        p = placeAgainstWall(spec.kind, wall, input, obstacles);
        if (p) break;
      }
    }
    if (p) {
      if (cornerAnchored) p.cornerAnchored = true;
      added.push(p);
      if (cornerAnchored) for (const q of cornerSofaLegQuads(p.item)) obstacles.push(q);
      else if (isBedKind(p.item.kind)) obstacles.push(bedOccupiedQuad(p.item));
      else obstacles.push(p.quad);
      if (!spec.group) {
        const cf = clearFrontRectFor(p);
        if (cf) obstacles.push(cf);
      }
      if (spec.group) leaders.set(spec.group, p);
    }
  }
  return added;
}
function placeRoom(input, archetype) {
  const obstacles = doorObstacles$1(input);
  const leaders = /* @__PURE__ */ new Map();
  return applyArchetype(input, archetype, obstacles, leaders).map((p) => p.item);
}
function placeRoomMulti(input, archetypes) {
  if (input.walls.length === 0) return [];
  const obstacles = doorObstacles$1(input);
  const leaders = /* @__PURE__ */ new Map();
  const placed = [];
  for (const a of [...archetypes].sort(_compoundPriority)) {
    for (const p of applyArchetype(input, a, obstacles, leaders)) placed.push(p);
  }
  return placed.map((p) => p.item);
}
const _COMPOUND_ORDER = {
  "living-room": 1,
  "dining-room": 2,
  "entrance-lobby": 3,
  "kitchen": 9
};
function _compoundPriority(a, b) {
  return (_COMPOUND_ORDER[a.occupancy] ?? 5) - (_COMPOUND_ORDER[b.occupancy] ?? 5);
}

const KIND_TO_MODULE$1 = {
  sink: "SinkUnit",
  hob: "HobUnit",
  oven: "OvenTower",
  dishwasher: "Dishwasher",
  fridge: "Fridge",
  extractor: "Extractor",
  base_unit: "BaseCabinet",
  washing_machine: "BaseCabinet",
  // a run-mounted washer occupies a base cell
  kitchen_island: "Island",
  pantry_cabinet: "Pantry"
};
function moduleFor(kind, ontology = KITCHEN_ONTOLOGY) {
  const type = KIND_TO_MODULE$1[kind];
  return type ? ontology.modules[type] ?? kitchenModule(type) : void 0;
}
const dist$3 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function isTallUnit(kind) {
  return kind === "fridge" || kind === "pantry_cabinet";
}
function halfExtents$1(p) {
  const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
  const ew = q === 1 || q === 3 ? p.footprint.l : p.footprint.w;
  const el = q === 1 || q === 3 ? p.footprint.w : p.footprint.l;
  return { hx: ew / 2, hz: el / 2 };
}
function aabbOf(p) {
  const { hx, hz } = halfExtents$1(p);
  const c = p.position;
  return { x0: c.x - hx, z0: c.z - hz, x1: c.x + hx, z1: c.z + hz };
}
const aabbOverlap = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
function inCorner(p, polygon, tol) {
  const c = { x: p.position.x, z: p.position.z };
  for (const v of polygon) {
    if (dist$3(c, v) <= tol) return true;
  }
  return false;
}
function underAnyWindow$2(p, windows) {
  const ab = aabbOf(p);
  for (const w of windows) {
    const half = w.width / 2;
    if (w.center.x >= ab.x0 - half && w.center.x <= ab.x1 + half && w.center.z >= ab.z0 - half && w.center.z <= ab.z1 + half) {
      return w;
    }
  }
  return null;
}
function doorSwingAabb(d) {
  const cx = d.center.x + d.normal.x * 0.45;
  const cz = d.center.z + d.normal.z * 0.45;
  const along = d.width / 2;
  const depth = 0.45;
  const facesX = Math.abs(d.normal.x) > Math.abs(d.normal.z);
  const hx = facesX ? depth : along;
  const hz = facesX ? along : depth;
  return { x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz };
}
function validateKitchenLayout(placed, room, ontology = KITCHEN_ONTOLOGY) {
  const violations = [];
  const polygon = room.polygon;
  const doors = room.doors ?? [];
  const windows = room.windows ?? [];
  const floor = placed.filter((p) => p.kind !== "extractor" && p.footprint.baseOffset < 0.5);
  const mm = (n) => n / 1e3;
  for (const p of floor) {
    const meta = moduleFor(p.kind, ontology);
    const at = { x: p.position.x, z: p.position.z };
    if (meta?.forbiddenZones?.includes("corner")) {
      if (inCorner(p, polygon, 0.75)) {
        violations.push({
          rule: "C01-corner",
          kind: p.kind,
          position: at,
          detail: `${p.kind} (${meta.moduleType}) sits in a room corner (forbidden)`
        });
      }
    }
    if (p.kind === "hob" && meta) {
      if (meta.forbiddenZones?.includes("underWindow")) {
        const win = underAnyWindow$2(p, windows);
        if (win) {
          violations.push({
            rule: "HOB-window",
            kind: p.kind,
            position: at,
            detail: `hob sits under a window aperture (fire/draught risk)`
          });
        }
      }
      const sideMin = mm(meta.clearance.sideMm ?? 0);
      if (sideMin > 0) {
        const tallNeighbour = floor.find(
          (o) => o !== p && isTallUnit(o.kind) && Math.abs(o.rotationY - p.rotationY) < 1e-3
        );
        if (tallNeighbour) {
          const gap = edgeGapAlongWall(p, tallNeighbour);
          if (gap >= 0 && gap < sideMin - 1e-6) {
            violations.push({
              rule: "HOB-side",
              kind: p.kind,
              position: at,
              detail: `hob ${(gap * 1e3).toFixed(0)}mm from ${tallNeighbour.kind} (< ${meta.clearance.sideMm}mm side-clearance)`
            });
          }
        }
      }
    }
    if (p.kind === "dishwasher" && meta) {
      const frontMin = mm(meta.clearance.frontMm ?? 0);
      if (frontMin > 0 && p.footprint.clearFront + 1e-6 < frontMin) {
        violations.push({
          rule: "DW-front",
          kind: p.kind,
          position: at,
          detail: `dishwasher front clearance ${(p.footprint.clearFront * 1e3).toFixed(0)}mm < ${meta.clearance.frontMm}mm`
        });
      }
    }
    if (p.kind === "fridge" && meta) {
      const sideMin = mm(meta.clearance.sideMm ?? 0);
      if (sideMin > 0) {
        const neighbour = floor.filter((o) => o !== p && isTallUnit(o.kind) && Math.abs(o.rotationY - p.rotationY) < 1e-3).map((o) => ({ o, gap: edgeGapAlongWall(p, o) })).filter((g) => g.gap >= 0).sort((a, b) => a.gap - b.gap)[0];
        if (neighbour && neighbour.gap < sideMin - 1e-6) {
          violations.push({
            rule: "FR-vent",
            kind: p.kind,
            position: at,
            detail: `fridge ${(neighbour.gap * 1e3).toFixed(0)}mm from ${neighbour.o.kind} (< ${meta.clearance.sideMm}mm vent gap)`
          });
        }
      }
    }
    const ab = aabbOf(p);
    for (const d of doors) {
      if (aabbOverlap(ab, doorSwingAabb(d))) {
        violations.push({
          rule: "SWING-door",
          kind: p.kind,
          position: at,
          detail: `${p.kind} overlaps a door swing zone`
        });
        break;
      }
    }
    if (p.kind === "fridge" || p.kind === "pantry_cabinet") {
      const win = underAnyWindow$2(p, windows);
      if (win) {
        violations.push({
          rule: "WIN-overlap",
          kind: p.kind,
          position: at,
          detail: `tall ${p.kind} overlaps a window aperture (blocks daylight)`
        });
      }
    }
  }
  return { valid: violations.length === 0, violations };
}
function edgeGapAlongWall(a, b) {
  const q = Math.round(a.rotationY / (Math.PI / 2)) & 3;
  const alongX = q === 0 || q === 2;
  const ea = aabbOf(a), eb = aabbOf(b);
  if (alongX) {
    if (ea.z1 < eb.z0 - 0.3 || eb.z1 < ea.z0 - 0.3) return -1;
    if (eb.x0 >= ea.x1) return eb.x0 - ea.x1;
    if (ea.x0 >= eb.x1) return ea.x0 - eb.x1;
    return 0;
  }
  if (ea.x1 < eb.x0 - 0.3 || eb.x1 < ea.x0 - 0.3) return -1;
  if (eb.z0 >= ea.z1) return eb.z0 - ea.z1;
  if (ea.z0 >= eb.z1) return ea.z0 - eb.z1;
  return 0;
}
function formatKitchenViolations(roomId, res) {
  if (res.valid) return `§DIAG-KITCHEN-RULES room=${roomId} valid — 0 HARD violations`;
  const summary = res.violations.map((v) => `${v.rule}:${v.kind}`).join(", ");
  return `§DIAG-KITCHEN-RULES room=${roomId} INVALID ${res.violations.length} HARD violation(s) — ${summary}`;
}

const KITCHEN_SCORECARD_WEIGHTS = {
  workflow: 25,
  circulation: 20,
  storage: 15,
  mep: 10,
  naturalLight: 10,
  buildability: 10,
  cost: 5,
  aesthetics: 5
};
function weightedTotal(axes, weights = KITCHEN_SCORECARD_WEIGHTS) {
  const sumW = weights.workflow + weights.circulation + weights.storage + weights.mep + weights.naturalLight + weights.buildability + weights.cost + weights.aesthetics;
  if (sumW <= 0) return 0;
  const num = axes.workflow * weights.workflow + axes.circulation * weights.circulation + axes.storage * weights.storage + axes.mep * weights.mep + axes.naturalLight * weights.naturalLight + axes.buildability * weights.buildability + axes.cost * weights.cost + axes.aesthetics * weights.aesthetics;
  return num / sumW;
}

const dist$2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01$2 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
const round2$1 = (n) => Math.round(n * 100) / 100;
const KIND_TO_MODULE = {
  sink: "SinkUnit",
  hob: "HobUnit",
  oven: "OvenTower",
  dishwasher: "Dishwasher",
  fridge: "Fridge",
  extractor: "Extractor",
  base_unit: "BaseCabinet",
  washing_machine: "BaseCabinet",
  kitchen_island: "Island",
  pantry_cabinet: "Pantry"
};
function storageVolumeOf(kind, ontology) {
  const type = KIND_TO_MODULE[kind];
  if (!type) return 0;
  const meta = ontology.modules[type] ?? kitchenModule(type);
  return meta?.storageVolumeL ?? 0;
}
function halfExtents(p) {
  const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
  const ew = q === 1 || q === 3 ? p.footprint.l : p.footprint.w;
  const el = q === 1 || q === 3 ? p.footprint.w : p.footprint.l;
  return { hx: ew / 2, hz: el / 2 };
}
function looseTriangle(placed) {
  const find = (k) => {
    const p = placed.find((x) => x.kind === k);
    return p ? { x: p.position.x, z: p.position.z } : null;
  };
  const sink = find("sink"), hob = find("hob"), fridge = find("fridge");
  if (!sink || !hob || !fridge) return null;
  return { sink, hob, fridge };
}
function runTriangle(run) {
  const cfg = run.kitchenConfig;
  if (!cfg?.units) return null;
  const yaw = run.rotationY;
  const cellW = 0.6;
  const len = cfg.length;
  const dirX = Math.cos(yaw), dirZ = -Math.sin(yaw);
  const c = run.position;
  const pointFor = (arm, index) => {
    const along = (index + 0.5) * cellW - len / 2;
    const base = { x: c.x + dirX * along, z: c.z + dirZ * along };
    if (arm === "main") return base;
    const end = arm === "left" ? { x: c.x - dirX * (len / 2), z: c.z - dirZ * (len / 2) } : { x: c.x + dirX * (len / 2), z: c.z + dirZ * (len / 2) };
    const px = Math.sin(yaw), pz = Math.cos(yaw);
    const off = (index + 0.5) * cellW;
    return { x: end.x + px * off, z: end.z + pz * off };
  };
  const slotFor = (appliances) => {
    const u = cfg.units.find((x) => x.appliance && appliances.includes(x.appliance));
    return u ? pointFor(u.arm, u.index) : null;
  };
  const sink = slotFor(["sink_inox", "sink"]);
  const hob = slotFor(["hob"]);
  const fridge = slotFor(["fridge_combi_silver", "fridge"]);
  if (!sink || !hob || !fridge) return null;
  return { sink, hob, fridge };
}
function workTriangle(placed) {
  const loose = looseTriangle(placed);
  if (loose) return loose;
  const run = placed.find((p) => p.kind === "kitchen_straight" || p.kind === "kitchen_l_shape" || p.kind === "kitchen_u_shape");
  return run ? runTriangle(run) : null;
}
const LEG_LO = 1.2, LEG_HI = 2.7;
const PERIM_LO = 4, PERIM_HI = 7.9;
function bandScore(v, lo, hi, span) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return clamp01$2(1 - d / span);
}
function workflowAxis(placed) {
  const tri = workTriangle(placed);
  if (!tri) return 40;
  const lSH = dist$2(tri.sink, tri.hob);
  const lHF = dist$2(tri.hob, tri.fridge);
  const lFS = dist$2(tri.fridge, tri.sink);
  const legs = [lSH, lHF, lFS];
  const perim = lSH + lHF + lFS;
  const legSpan = 1.5;
  const perimSpan = 3;
  const legCredit = legs.reduce((s, l) => s + bandScore(l, LEG_LO, LEG_HI, legSpan), 0) / 3;
  const perimS = bandScore(perim, PERIM_LO, PERIM_HI, perimSpan);
  let axis = 100 * (0.7 * legCredit + 0.3 * perimS);
  for (const l of legs) {
    if (l > LEG_HI || l < LEG_LO) {
      const over = l > LEG_HI ? l - LEG_HI : LEG_LO - l;
      axis *= clamp01$2(1 - over / 1);
    }
  }
  return axis;
}
const AISLE_MIN = 1, AISLE_IDEAL = 1.2;
function bbox$2(poly) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, minZ, maxX, maxZ };
}
function circulationAxis$1(placed, room) {
  const floor = placed.filter((p) => p.footprint.baseOffset < 0.5);
  if (floor.length === 0) return 50;
  const bb = bbox$2(room.polygon);
  const span = Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
  let maxDepth = 0;
  for (const p of floor) {
    const { hz } = halfExtents(p);
    maxDepth = Math.max(maxDepth, hz * 2);
  }
  const onTwoOpposite = runsOnOppositeWalls(floor, bb);
  const aisle = onTwoOpposite ? span - 2 * maxDepth : span - maxDepth;
  if (aisle >= AISLE_IDEAL) return 100;
  if (aisle <= 0.4) return 0;
  if (aisle >= AISLE_MIN) return 80 + 20 * ((aisle - AISLE_MIN) / (AISLE_IDEAL - AISLE_MIN));
  return 80 * ((aisle - 0.4) / (AISLE_MIN - 0.4));
}
function runsOnOppositeWalls(floor, bb) {
  const near = (v, edge) => Math.abs(v - edge) < 1;
  let loX = false, hiX = false, loZ = false, hiZ = false;
  for (const p of floor) {
    if (near(p.position.x, bb.minX)) loX = true;
    if (near(p.position.x, bb.maxX)) hiX = true;
    if (near(p.position.z, bb.minZ)) loZ = true;
    if (near(p.position.z, bb.maxZ)) hiZ = true;
  }
  return loX && hiX || loZ && hiZ;
}
const STORAGE_TARGET_L = 1400;
function storageAxis(placed, ontology) {
  let vol = 0;
  for (const p of placed) {
    if (p.kitchenConfig?.units) {
      const base = ontology.modules["BaseCabinet"]?.storageVolumeL ?? 260;
      const cabinetUnits = p.kitchenConfig.units.filter((u) => !u.appliance).length;
      vol += cabinetUnits * base;
    } else {
      vol += storageVolumeOf(p.kind, ontology);
    }
  }
  return 100 * clamp01$2(vol / STORAGE_TARGET_L);
}
function mepAxis(placed, room) {
  const windows = room.windows ?? [];
  let score = 60;
  const hob = placed.find((p) => p.kind === "hob");
  const sink = placed.find((p) => p.kind === "sink");
  if (hob) {
    score += underAnyWindow$1(hob, windows) ? 0 : 20;
  } else {
    score += 20;
  }
  if (hob && sink) {
    const sameWall = Math.abs(hob.rotationY - sink.rotationY) < 1e-3;
    if (sameWall) score += 20;
  } else {
    score += 20;
  }
  return Math.min(100, score);
}
function underAnyWindow$1(p, windows) {
  const { hx, hz } = halfExtents(p);
  const c = p.position;
  for (const w of windows) {
    const half = w.width / 2;
    if (w.center.x >= c.x - hx - half && w.center.x <= c.x + hx + half && w.center.z >= c.z - hz - half && w.center.z <= c.z + hz + half) return true;
  }
  return false;
}
function naturalLightAxis$1(placed, room) {
  const windows = room.windows ?? [];
  if (windows.length === 0) return 50;
  const sink = placed.find((p) => p.kind === "sink");
  if (sink) {
    if (underAnyWindow$1(sink, windows)) return 100;
    const d = Math.min(...windows.map((w) => dist$2({ x: sink.position.x, z: sink.position.z }, w.center)));
    return 100 * clamp01$2(1 - d / 2.5);
  }
  const run = placed.find((p) => p.kind === "kitchen_straight" || p.kind === "kitchen_l_shape" || p.kind === "kitchen_u_shape");
  if (run && underAnyWindow$1(run, windows) && run.kitchenConfig?.units?.some((u) => u.appliance === "sink_inox" || u.appliance === "sink")) {
    return 100;
  }
  return 50;
}
function buildabilityAxis(placed) {
  const run = placed.find((p) => p.kind === "kitchen_straight" || p.kind === "kitchen_l_shape" || p.kind === "kitchen_u_shape");
  if (run) return run.kind === "kitchen_straight" ? 100 : 90;
  const floor = placed.filter((p) => p.footprint.baseOffset < 0.5);
  if (floor.length === 0) return 50;
  const groups = /* @__PURE__ */ new Map();
  for (const p of floor) {
    const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
    const alongX = q === 0 || q === 2;
    const key = `${q}:${alongX ? round2$1(p.position.z) : round2$1(p.position.x)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const largest = Math.max(...groups.values());
  return 100 * (largest / floor.length);
}
function costAxis(placed) {
  const run = placed.find((p) => p.kind === "kitchen_straight" || p.kind === "kitchen_l_shape" || p.kind === "kitchen_u_shape");
  if (run) {
    return run.kind === "kitchen_straight" ? 100 : run.kind === "kitchen_l_shape" ? 80 : 60;
  }
  const floor = placed.filter((p) => p.footprint.baseOffset < 0.5);
  const orientations = new Set(floor.map((p) => Math.round(p.rotationY / (Math.PI / 2)) & 3));
  const corners = Math.max(0, orientations.size - 1);
  return Math.max(0, 100 - corners * 20);
}
function aestheticsAxis(placed, room) {
  const floor = placed.filter((p) => p.footprint.baseOffset < 0.5);
  if (floor.length === 0) return 50;
  let sx = 0, sz = 0;
  for (const p of floor) {
    sx += p.position.x;
    sz += p.position.z;
  }
  const cx = sx / floor.length, cz = sz / floor.length;
  const bb = bbox$2(room.polygon);
  const halfSpan = Math.max(1e-3, Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ) / 2);
  const off = dist$2({ x: cx, z: cz }, room.centroid) / halfSpan;
  return 100 * clamp01$2(1 - off);
}
function scoreKitchenLayout(placed, room, opts = {}) {
  const ontology = opts.ontology ?? KITCHEN_ONTOLOGY;
  const weights = opts.weights ?? KITCHEN_SCORECARD_WEIGHTS;
  const axes = {
    workflow: round2$1(workflowAxis(placed)),
    circulation: round2$1(circulationAxis$1(placed, room)),
    storage: round2$1(storageAxis(placed, ontology)),
    mep: round2$1(mepAxis(placed, room)),
    naturalLight: round2$1(naturalLightAxis$1(placed, room)),
    buildability: round2$1(buildabilityAxis(placed)),
    cost: round2$1(costAxis(placed)),
    aesthetics: round2$1(aestheticsAxis(placed, room))
  };
  return {
    valid: opts.valid ?? true,
    hardFailures: opts.hardFailures ?? [],
    axes,
    total: round2$1(weightedTotal(axes, weights))
  };
}
function formatKitchenScore(roomId, tag, score) {
  const a = score.axes;
  const axes = `wf=${a.workflow} circ=${a.circulation} stor=${a.storage} mep=${a.mep} light=${a.naturalLight} build=${a.buildability} cost=${a.cost} aes=${a.aesthetics}`;
  const validTag = score.valid ? "valid" : `INVALID[${score.hardFailures.join(",")}]`;
  return `§DIAG-KITCHEN-SCORE room=${roomId} ${tag} total=${score.total} ${validTag} — ${axes}`;
}

const MODULE = 0.6;
const GAP$1 = 0.02;
const add$1 = (a, b, s = 1) => ({ x: a.x + b.x * s, z: a.z + b.z * s });
function normaliseKitchenLayout(v) {
  return v === "I" || v === "L" || v === "U" ? v : "auto";
}
function runWalls(input) {
  const walls = [...input.walls];
  const score = (w) => {
    let s = w.length;
    if (wallHasDoor(w, input.doors)) s -= 100;
    if (wallHasWindow(w, input.windows)) s -= 0.5;
    return s;
  };
  return walls.sort((a, b) => {
    const d = score(b) - score(a);
    if (Math.abs(d) > 1e-9) return d;
    const ma = wallMid(a), mb = wallMid(b);
    return ma.x !== mb.x ? ma.x - mb.x : ma.z - mb.z;
  });
}
function perpendicular$1(a, b) {
  const da = wallDir(a), db = wallDir(b);
  return Math.abs(da.x * db.x + da.z * db.z) < 0.2;
}
const L_MIN_PRIMARY = 1.6;
const L_MIN_SECONDARY = 1.2;
const U_BACK_WALL_MAX = 3.6;
const U_MIN_THIRD = 1.2;
function canHostL(walls) {
  const chain = buildChain$1(walls, 2);
  return chain.length >= 2 && chain[0].length >= L_MIN_PRIMARY && chain[1].length >= L_MIN_SECONDARY;
}
function canHostU(walls) {
  const chain = buildChain$1(walls, 3);
  if (chain.length < 3) return false;
  const back = chain[1];
  return back.length <= U_BACK_WALL_MAX && chain[0].length >= U_MIN_THIRD && chain[2].length >= U_MIN_THIRD;
}
function chooseShape$1(input, walls, pref) {
  const usable = walls.filter((w) => !wallHasDoor(w, input.doors));
  const longest = usable.reduce((m, w) => Math.max(m, w.length), 0);
  const decide = () => {
    if (pref !== "auto") {
      if (pref === "U" && usable.length >= 3) return { shape: "U", why: "brief=U" };
      if (pref === "L" && usable.length >= 2) return { shape: "L", why: "brief=L" };
      if (pref === "I") return { shape: "I", why: "brief=I" };
    }
    if (usable.length >= 3 && input.areaM2 >= 6 && canHostU(usable)) {
      return { shape: "U", why: `3+ walls, back≤${U_BACK_WALL_MAX}m, area=${input.areaM2.toFixed(1)}m²` };
    }
    if (usable.length >= 2 && canHostL(usable)) {
      return { shape: "L", why: "2 perpendicular usable walls (corner fits)" };
    }
    if (usable.length >= 2 && !canHostL(usable)) {
      return { shape: "I", why: "two usable walls but parallel/too-short → no corner" };
    }
    return { shape: "I", why: `single-wall galley (usable=${usable.length})` };
  };
  const { shape, why } = decide();
  console.log(
    `§DIAG-KITCHEN room=${input.roomId} shape=${shape} pref=${pref} usableWalls=${usable.length} longest=${longest.toFixed(2)}m area=${input.areaM2.toFixed(1)}m² — ${why}`
  );
  return shape;
}
function buildChain$1(walls, want) {
  if (want <= 1) return walls.length > 0 ? [walls[0]] : [];
  let best = [];
  for (const start of walls) {
    const chain = [start];
    const used = /* @__PURE__ */ new Set([start]);
    let extended = true;
    while (chain.length < want && extended) {
      extended = false;
      for (const w of walls) {
        if (used.has(w)) continue;
        if (perpendicular$1(chain[chain.length - 1], w)) {
          chain.push(w);
          used.add(w);
          extended = true;
          break;
        }
      }
    }
    if (chain.length > best.length) best = chain;
    if (best.length >= want) break;
  }
  return best;
}
function pickArms$1(walls, shape) {
  const want = shape === "U" ? 3 : shape === "L" ? 2 : 1;
  return buildChain$1(walls, want);
}
function isWindowSpineCandidate(w, windows) {
  return wallHasWindow(w, windows);
}
function windowOnWall(spine, input) {
  const d = wallDir(spine);
  const mid = wallMid(spine);
  let best = null;
  let bestScore = Infinity;
  for (const win of input.windows) {
    const t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
    if (t < -0.05 || t > spine.length + 0.05) continue;
    const px = spine.a.x + d.x * t, pz = spine.a.z + d.z * t;
    if (Math.hypot(win.center.x - px, win.center.z - pz) > 0.3) continue;
    const score = Math.hypot(win.center.x - mid.x, win.center.z - mid.z);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = win;
    }
  }
  return best;
}
function orderArmsForWindowSink(arms, shape, input) {
  const defaultSpine = arms.length >= 3 ? 1 : 0;
  if (arms.length < 2) return { arms, spineIdx: defaultSpine };
  const candidates = arms.map((w, i) => ({ w, i })).filter(({ w }) => isWindowSpineCandidate(w, input.windows)).sort((a, b) => {
    const ext = (b.w.isExterior ? 1 : 0) - (a.w.isExterior ? 1 : 0);
    if (ext !== 0) return ext;
    const len = b.w.length - a.w.length;
    if (Math.abs(len) > 1e-9) return len;
    return a.i - b.i;
  });
  if (candidates.length === 0) return { arms, spineIdx: defaultSpine };
  const chosen = candidates[0].i;
  if (chosen === defaultSpine) return { arms, spineIdx: defaultSpine };
  if (shape === "L") {
    const reordered = [...arms];
    const tmp = reordered[0];
    reordered[0] = reordered[chosen];
    reordered[chosen] = tmp;
    return { arms: reordered, spineIdx: 0 };
  }
  return { arms, spineIdx: defaultSpine };
}
function sinkOffsetUnderWindow(spine, input, fromEnd, sinkW) {
  const win = windowOnWall(spine, input);
  if (!win) return null;
  const d = wallDir(spine);
  const t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
  const along = fromEnd ? spine.length - t : t;
  const cursor = along - sinkW / 2;
  return Math.max(GAP$1, Math.min(cursor, spine.length - sinkW - GAP$1));
}
function moduleSequencesByArm(armCount, opts) {
  const wm = opts.washingMachine ? ["washing_machine"] : [];
  if (armCount >= 3) {
    return [
      ["dishwasher", "base_unit"],
      // arm-1 (left, from corner A, inset)
      ["sink", "base_unit", "hob", "oven", ...wm],
      // arm-2 SPINE (back wall, from corner A)
      ["base_unit", "fridge", "base_unit"]
      // arm-3 (right, from corner B, inset)
    ];
  }
  if (armCount === 2) {
    return [
      ["sink", "dishwasher", "hob", "oven", ...wm],
      // primary SPINE, from shared corner
      ["base_unit", "fridge", "base_unit"]
      // secondary, from shared corner (inset)
    ];
  }
  return [["sink", "base_unit", "hob", "oven", "base_unit", "fridge", "dishwasher", ...wm]];
}
function layAlongWall$1(wall, kinds, input, obstacles, startOffset, fromEnd = false) {
  const baseDir = wallDir(wall);
  const dir = fromEnd ? { x: -baseDir.x, z: -baseDir.z } : baseDir;
  const origin = fromEnd ? wall.b : wall.a;
  const yaw = yawFromNormal(wall.inwardNormal);
  const placed = [];
  const placedKinds = [];
  let cursor = startOffset;
  let consumed = 0;
  for (const kind of kinds) {
    const fp = footprintOf(kind);
    const w = fp.w;
    if (cursor + w > wall.length - GAP$1) break;
    const alongCtr = cursor + w / 2;
    const onWall = add$1(origin, dir, alongCtr);
    const c = add$1(onWall, wall.inwardNormal, fp.l / 2 + GAP$1);
    const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    consumed++;
    if (!quadInPolygon(quad, input.polygon) || quadOverlapsAny(quad, obstacles)) {
      cursor += w + GAP$1;
      continue;
    }
    placed.push({
      kind,
      position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
      rotationY: yaw,
      footprint: fp,
      hostedSpaceId: input.roomId
    });
    placedKinds.push(kind);
    obstacles.push(quad);
    cursor += w + GAP$1;
  }
  return { placed, consumed, placedKinds };
}
function sharedCornerIsB(wall, ref) {
  const d = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const aMin = Math.min(d(wall.a, ref.a), d(wall.a, ref.b));
  const bMin = Math.min(d(wall.b, ref.a), d(wall.b, ref.b));
  return bMin < aMin;
}
function doorObstacles(input) {
  return input.doors.map((d) => {
    const swingR = Math.max(d.width, 0.9);
    const c = add$1(d.center, d.normal, swingR / 2);
    return footprintCorners(c.x, c.z, d.width, swingR, yawFromNormal(d.normal));
  });
}
const ISLAND_MIN_ROOM_DIM = 3.5;
const ISLAND_MIN_AREA = 12;
function bbox$1(poly) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, minZ, maxX, maxZ };
}
function tryIsland(input, obstacles) {
  const bb = bbox$1(input.polygon);
  const spanX = bb.maxX - bb.minX, spanZ = bb.maxZ - bb.minZ;
  const minDim = Math.min(spanX, spanZ);
  if (minDim < ISLAND_MIN_ROOM_DIM || input.areaM2 < ISLAND_MIN_AREA) return null;
  const fp = footprintOf("kitchen_island");
  const yaw = spanX >= spanZ ? 0 : Math.PI / 2;
  const c = input.centroid;
  const body = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
  if (!quadInPolygon(body, input.polygon) || quadOverlapsAny(body, obstacles)) return null;
  const envW = fp.w + 2 * fp.clearSides;
  const envL = fp.l + 2 * fp.clearFront;
  const env = footprintCorners(c.x, c.z, envW, envL, yaw);
  if (!quadInPolygon(env, input.polygon) || quadOverlapsAny(env, obstacles)) return null;
  return {
    kind: "kitchen_island",
    position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
    rotationY: yaw,
    footprint: fp,
    hostedSpaceId: input.roomId
  };
}
function candidateShapes(input, layout) {
  if (layout !== "auto") {
    return [layout];
  }
  const usable = runWalls(input).filter((w) => !wallHasDoor(w, input.doors));
  const shapes = ["I"];
  if (usable.length >= 2 && canHostL(usable)) shapes.push("L");
  if (usable.length >= 3 && input.areaM2 >= 6 && canHostU(usable)) shapes.push("U");
  return shapes;
}
function scoreCandidate(placed, input) {
  const v = validateKitchenLayout(placed, input);
  const score = scoreKitchenLayout(placed, input, {
    valid: v.valid,
    hardFailures: v.violations.map((x) => x.rule)
  });
  return { score, hardCount: v.violations.length };
}
function generateAndRank(input, layout, opts, plan, tag) {
  if (input.walls.length === 0 || input.areaM2 <= 0) return [];
  const shapes = candidateShapes(input, layout);
  const cands = [];
  const shapeOrder = { I: 0, L: 1, U: 2 };
  for (const shape of shapes) {
    const placed = plan(input, shape, opts);
    if (placed.length === 0) continue;
    const { score, hardCount } = scoreCandidate(placed, input);
    cands.push({ shape, order: shapeOrder[shape], placed, score, hardCount });
    console.log(formatKitchenScore(input.roomId, `cand=${tag}/${shape}`, score));
  }
  if (cands.length === 0) return [];
  cands.sort((a, b) => {
    if (a.score.valid !== b.score.valid) return a.score.valid ? -1 : 1;
    if (a.hardCount !== b.hardCount) return a.hardCount - b.hardCount;
    if (Math.abs(a.score.total - b.score.total) > 1e-9) return b.score.total - a.score.total;
    return a.order - b.order;
  });
  const winner = cands[0];
  console.log(
    `§DIAG-KITCHEN-SCORE room=${input.roomId} WON=${tag}/${winner.shape} total=${winner.score.total} valid=${winner.score.valid} (from ${cands.length} candidate(s): ${cands.map((c) => `${c.shape}:${c.score.total}`).join(", ")})`
  );
  return winner.placed;
}
function planKitchen(input, layout = "auto", opts = {}) {
  return generateAndRank(input, layout, opts, planKitchenSingle, "modules");
}
function planKitchenSingle(input, layout = "auto", opts = {}) {
  if (input.walls.length === 0 || input.areaM2 <= 0) return [];
  const obstacles = doorObstacles(input);
  const usableWalls = runWalls(input).filter((w) => !wallHasDoor(w, input.doors));
  const walls = usableWalls.length > 0 ? usableWalls : runWalls(input);
  const shape = chooseShape$1(input, walls, layout);
  const rawArms = pickArms$1(walls, shape);
  if (rawArms.length === 0) return [];
  const { arms, spineIdx } = orderArmsForWindowSink(rawArms, shape, input);
  const spine = arms[spineIdx];
  const perArm = moduleSequencesByArm(arms.length, { washingMachine: !!opts.washingMachine });
  const out = [];
  const spineRef = arms[spineIdx === 0 ? 1 : 0] ?? spine;
  const spineFromEnd = sharedCornerIsB(spine, spineRef);
  const sinkOffset = sinkOffsetUnderWindow(spine, input, spineFromEnd, footprintOf("sink").w);
  const order = [spineIdx, ...arms.map((_, i) => i).filter((i) => i !== spineIdx)];
  for (const i of order) {
    const arm = arms[i];
    const kinds = perArm[i] ?? [];
    const ref = i === spineIdx ? spineRef : spine;
    const fromEnd = i === spineIdx ? spineFromEnd : sharedCornerIsB(arm, ref);
    const inset = i === spineIdx ? sinkOffset !== null ? sinkOffset : GAP$1 : MODULE + GAP$1;
    const { placed } = layAlongWall$1(arm, kinds, input, obstacles, inset, fromEnd);
    out.push(...placed);
  }
  if (out.length === 0) return [];
  const hob = out.find((p) => p.kind === "hob");
  if (hob) {
    const fp = footprintOf("extractor");
    out.push({
      kind: "extractor",
      position: { x: hob.position.x, y: input.levelElevation + fp.baseOffset, z: hob.position.z },
      rotationY: hob.rotationY,
      footprint: fp,
      hostedSpaceId: input.roomId
    });
  }
  const island = tryIsland(input, obstacles);
  if (island) out.push(island);
  reportKitchenRules(input.roomId, out, input);
  return out;
}
function reportKitchenRules(roomId, placed, input) {
  const res = validateKitchenLayout(placed, input);
  console.log(formatKitchenViolations(roomId, res));
  return res;
}
const KITCHEN_DEPTH = 0.6;
const KITCHEN_HEIGHT = 0.9;
const KITCHEN_UNIT_W = 0.6;
const KITCHEN_MIN_RUN = 1.2;
function unitsForArm(armLength) {
  return Math.max(1, Math.floor((armLength + 1e-6) / KITCHEN_UNIT_W));
}
function clampInt(v, lo, hi, fallback) {
  if (hi < lo) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
function sinkUnitIndexUnderWindow(spine, input, numUnits, unitW, mainLen) {
  const win = windowOnWall(spine, input);
  if (!win || numUnits <= 1) return 0;
  const d = wallDir(spine);
  let t = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
  const runStart = (spine.length - mainLen) / 2;
  t -= runStart;
  const cell = Math.floor(t / unitW);
  return clampInt(cell, 0, numUnits - 1, 0);
}
function mainCornerCells(numMain, hasLeft, hasRight) {
  const s = /* @__PURE__ */ new Set();
  if (hasLeft && numMain >= 1) s.add(0);
  if (hasRight && numMain >= 1) s.add(numMain - 1);
  return s;
}
function nudgeOffCorner(cell, numMain, corners) {
  if (!corners.has(cell)) return cell;
  for (let r = 1; r < numMain; r++) {
    if (cell - r >= 0 && !corners.has(cell - r)) return cell - r;
    if (cell + r < numMain && !corners.has(cell + r)) return cell + r;
  }
  return cell;
}
function mainCellUnderWindow(spine, input, i, unitW, mainLen) {
  const win = windowOnWall(spine, input);
  if (!win) return false;
  const d = wallDir(spine);
  const wt = (win.center.x - spine.a.x) * d.x + (win.center.z - spine.a.z) * d.z;
  const ct = (spine.length - mainLen) / 2 + i * unitW + unitW / 2;
  return Math.abs(ct - wt) <= (unitW + win.width) / 2;
}
function planKitchenRun(input, layout = "auto", opts = {}) {
  return generateAndRank(input, layout, opts, planKitchenRunSingle, "run");
}
function planKitchenRunSingle(input, layout = "auto", opts = {}) {
  if (input.walls.length === 0 || input.areaM2 <= 0) return [];
  const usableWalls = runWalls(input).filter((w) => !wallHasDoor(w, input.doors));
  const walls = usableWalls.length > 0 ? usableWalls : runWalls(input);
  const shape = chooseShape$1(input, walls, layout);
  const rawArms = pickArms$1(walls, shape);
  if (rawArms.length === 0) return [];
  const { arms, spineIdx } = orderArmsForWindowSink(rawArms, shape, input);
  const spine = arms[spineIdx];
  const mainLen = Math.min(spine.length, KITCHEN_UNIT_W * 12);
  if (mainLen < KITCHEN_MIN_RUN) return [];
  const numMain = unitsForArm(mainLen);
  const secondaries = arms.filter((_, i) => i !== spineIdx);
  const hasLeft = (shape === "L" || shape === "U") && secondaries.length >= 1;
  const hasRight = shape === "U" && secondaries.length >= 2;
  const leftLen = hasLeft ? Math.max(0, Math.min(secondaries[0].length, KITCHEN_UNIT_W * 8) - KITCHEN_DEPTH) : 0;
  const rightLen = hasRight ? Math.max(0, Math.min(secondaries[1].length, KITCHEN_UNIT_W * 8) - KITCHEN_DEPTH) : 0;
  const numLeft = leftLen >= KITCHEN_UNIT_W ? unitsForArm(leftLen) : 0;
  const numRight = rightLen >= KITCHEN_UNIT_W ? unitsForArm(rightLen) : 0;
  const layoutType = numRight > 0 ? "kitchen_u_shape" : numLeft > 0 ? "kitchen_l_shape" : "kitchen_straight";
  console.log(
    `§DIAG-KITCHEN room=${input.roomId} RUN layoutType=${layoutType} chosenShape=${shape} mainUnits=${numMain} leftUnits=${numLeft} rightUnits=${numRight} mainLen=${mainLen.toFixed(2)}m leftLen=${leftLen.toFixed(2)}m rightLen=${rightLen.toFixed(2)}m`
  );
  const units = [];
  const main = [];
  for (let i = 0; i < numMain; i++) main.push({ index: i, arm: "main", front: "door" });
  const setAppliance = (arr, idx, appliance) => {
    if (idx >= 0 && idx < arr.length) arr[idx].appliance = appliance;
  };
  const cornerCells = mainCornerCells(numMain, numLeft >= 1, numRight >= 1);
  const sinkCell = nudgeOffCorner(
    sinkUnitIndexUnderWindow(spine, input, numMain, KITCHEN_UNIT_W, mainLen),
    numMain,
    cornerCells
  );
  setAppliance(main, sinkCell, "sink_inox");
  let hobCell = numMain >= 3 ? clampInt(sinkCell + 2, 0, numMain - 1, sinkCell) : numMain >= 2 ? sinkCell === numMain - 1 ? sinkCell - 1 : numMain - 1 : sinkCell;
  hobCell = nudgeOffCorner(hobCell, numMain, cornerCells);
  if (numMain >= 2 && hobCell !== sinkCell && !cornerCells.has(hobCell)) setAppliance(main, hobCell, "hob");
  if (opts.washingMachine && numMain >= 4) {
    const wmCell = [0, 1, numMain - 1, numMain - 2].find((i) => i !== sinkCell && i !== hobCell);
    if (wmCell !== void 0) setAppliance(main, wmCell, "washing_machine_white");
  }
  const left = [];
  for (let i = 0; i < numLeft; i++) left.push({ index: i, arm: "left", front: "door" });
  const right = [];
  for (let i = 0; i < numRight; i++) right.push({ index: i, arm: "right", front: "door" });
  if (numLeft >= 2) {
    setAppliance(left, 1, "fridge_combi_silver");
  } else if (numRight >= 2) {
    setAppliance(right, 1, "fridge_combi_silver");
  } else {
    const used = new Set(main.filter((u) => u.appliance).map((u) => u.index));
    const free = (i) => !used.has(i) && !cornerCells.has(i);
    let fridgeCell = -1;
    for (let i = numMain - 1; i >= 0; i--) {
      if (free(i) && !mainCellUnderWindow(spine, input, i, KITCHEN_UNIT_W, mainLen)) {
        fridgeCell = i;
        break;
      }
    }
    if (fridgeCell < 0) for (let i = numMain - 1; i >= 0; i--) {
      if (free(i)) {
        fridgeCell = i;
        break;
      }
    }
    if (fridgeCell < 0) for (let i = numMain - 1; i >= 0; i--) {
      if (!used.has(i)) {
        fridgeCell = i;
        break;
      }
    }
    if (fridgeCell >= 0) setAppliance(main, fridgeCell, "fridge_combi_silver");
  }
  units.push(...main, ...left, ...right);
  const config = {
    layoutType,
    depth: KITCHEN_DEPTH,
    length: round6$3(mainLen),
    height: KITCHEN_HEIGHT,
    numUnits: numMain,
    // L/U arm fields are omitted (not set to undefined) so the config is
    // clean under exactOptionalPropertyTypes.
    ...numLeft > 0 ? { lengthLeft: round6$3(leftLen), numUnitsLeft: numLeft } : {},
    ...numRight > 0 ? { lengthRight: round6$3(rightLen), numUnitsRight: numRight } : {},
    // Default materials — oak doors + marble worktop, matching the carousel
    // default (buildDefaultKitchenConfig); the user can re-finish via the UI.
    frontMaterialId: "wood-oak",
    countertopMaterialId: "stone-marble-white",
    units
  };
  const yaw = yawFromNormal(spine.inwardNormal);
  const mid = wallMid(spine);
  const cx = mid.x + spine.inwardNormal.x * (KITCHEN_DEPTH / 2);
  const cz = mid.z + spine.inwardNormal.z * (KITCHEN_DEPTH / 2);
  const footprint = {
    w: round6$3(mainLen),
    l: KITCHEN_DEPTH,
    h: KITCHEN_HEIGHT,
    baseOffset: 0,
    clearFront: 1,
    clearSides: 0
  };
  const result = [{
    kind: layoutType,
    position: { x: round6$3(cx), y: input.levelElevation, z: round6$3(cz) },
    rotationY: yaw,
    footprint,
    hostedSpaceId: input.roomId,
    kitchenConfig: config
  }];
  reportKitchenRules(input.roomId, result, input);
  return result;
}
const round6$3 = (n) => Math.round(n * 1e6) / 1e6;
function kitchenTrianglePoints(placed) {
  const find = (k) => {
    const p = placed.find((x) => x.kind === k);
    return p ? { x: p.position.x, z: p.position.z } : null;
  };
  const sink = find("sink"), hob = find("hob"), fridge = find("fridge");
  if (!sink || !hob || !fridge) return null;
  return { sink, hob, fridge };
}

const GAP = 0.02;
const add = (a, b, s = 1) => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const WARDROBE = "wardrobe";
const BED_SIDE_OVERHANG = {
  japanese_platform_bed: 0.5,
  japanese_float_bed: 0.45,
  japanese_walnut_bed: 0.4
};
const BED_REAR_OVERHANG = {
  japanese_platform_bed: 0.05,
  japanese_float_bed: 0.05,
  japanese_walnut_bed: 0.05
};
function bedOccupiedObstacle(p) {
  const side = BED_SIDE_OVERHANG[p.kind] ?? 0;
  const rear = BED_REAR_OVERHANG[p.kind] ?? 0;
  if (side === 0 && rear === 0) {
    return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
  }
  const n = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };
  return footprintCorners(
    p.position.x - n.x * (rear / 2),
    p.position.z - n.z * (rear / 2),
    p.footprint.w + 2 * side,
    p.footprint.l + rear,
    p.rotationY
  );
}
function normaliseWardrobeLayout(v) {
  return v === "I" || v === "L" || v === "U" ? v : "auto";
}
function perpendicular(a, b) {
  const da = wallDir(a), db = wallDir(b);
  return Math.abs(da.x * db.x + da.z * db.z) < 0.2;
}
function candidateWalls(input) {
  const ok = input.walls.filter(
    (w) => !wallHasDoor(w, input.doors) && !wallHasWindow(w, input.windows)
  );
  return ok.sort((a, b) => {
    if (Math.abs(b.length - a.length) > 1e-9) return b.length - a.length;
    const ma = wallMid(a), mb = wallMid(b);
    return ma.x !== mb.x ? ma.x - mb.x : ma.z - mb.z;
  });
}
function chooseShape(walls, pref) {
  if (pref !== "auto") {
    if (pref === "U" && walls.length >= 3) return "U";
    if (pref === "L" && walls.length >= 2) return "L";
    if (pref === "I") return "I";
  }
  if (walls.length >= 3) return "U";
  if (walls.length >= 2) return "L";
  return "I";
}
function buildChain(walls, want) {
  if (want <= 1) return walls.length > 0 ? [walls[0]] : [];
  let best = [];
  for (const start of walls) {
    const chain = [start];
    const used = /* @__PURE__ */ new Set([start]);
    let extended = true;
    while (chain.length < want && extended) {
      extended = false;
      for (const w of walls) {
        if (used.has(w)) continue;
        if (perpendicular(chain[chain.length - 1], w)) {
          chain.push(w);
          used.add(w);
          extended = true;
          break;
        }
      }
    }
    if (chain.length > best.length) best = chain;
    if (best.length >= want) break;
  }
  return best;
}
function pickArms(walls, shape) {
  const want = shape === "U" ? 3 : shape === "L" ? 2 : 1;
  return buildChain(walls, want);
}
function layAlongWall(wall, input, obstacles) {
  const fp = footprintOf(WARDROBE);
  const dir = wallDir(wall);
  const yaw = yawFromNormal(wall.inwardNormal);
  const out = [];
  let cursor = GAP;
  while (cursor + fp.w <= wall.length - GAP) {
    const alongCtr = cursor + fp.w / 2;
    const onWall = add(wall.a, dir, alongCtr);
    const c = add(onWall, wall.inwardNormal, fp.l / 2 + GAP);
    const quad = footprintCorners(c.x, c.z, fp.w, fp.l, yaw);
    if (quadInPolygon(quad, input.polygon) && !quadOverlapsAny(quad, obstacles)) {
      out.push({
        kind: WARDROBE,
        position: { x: c.x, y: input.levelElevation + fp.baseOffset, z: c.z },
        rotationY: yaw,
        footprint: fp,
        hostedSpaceId: input.roomId
      });
      obstacles.push(quad);
    }
    cursor += fp.w + GAP;
  }
  return out;
}
function planWardrobe(input, existing, layout = "auto") {
  if (input.walls.length === 0) return [];
  const walls = candidateWalls(input);
  if (walls.length === 0) return [];
  const shape = chooseShape(walls, layout);
  const arms = pickArms(walls, shape);
  if (arms.length === 0) return [];
  const obstacles = existing.filter((p) => p.kind !== WARDROBE).map(bedOccupiedObstacle);
  for (const d of input.doors) {
    const swingR = Math.max(d.width, 0.9);
    obstacles.push(footprintCorners(
      d.center.x + d.normal.x * (swingR / 2),
      d.center.z + d.normal.z * (swingR / 2),
      d.width,
      swingR,
      yawFromNormal(d.normal)
    ));
  }
  const out = [];
  for (const arm of arms) {
    out.push(...layAlongWall(arm, input, obstacles));
  }
  return out;
}

const LAMP$1 = "lamp";
const BEDSIDE_LAMP_FP = {
  w: 0.15,
  l: 0.15,
  h: 0.22,
  baseOffset: 0,
  clearFront: 0,
  clearSides: 0
};
function placeBedsideLamps(input, placed) {
  const tables = placed.filter((p) => p.kind === "bedside_table");
  const out = [];
  for (const t of tables) {
    const surfaceY = t.position.y + t.footprint.h;
    out.push({
      kind: LAMP$1,
      position: { x: t.position.x, y: surfaceY, z: t.position.z },
      rotationY: t.rotationY,
      footprint: BEDSIDE_LAMP_FP,
      hostedSpaceId: input.roomId
    });
  }
  return out;
}

const BED_TYPES = ["bed", "japanese_platform_bed", "japanese_float_bed", "japanese_walnut_bed"];
function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function chooseBedType(roomId) {
  return BED_TYPES[stableHash(roomId) % BED_TYPES.length];
}
function bedHasIntegratedBedside(type) {
  return type !== "bed";
}
function bedHasIntegratedLamps(type) {
  return type === "japanese_float_bed";
}
function applyBedType(archetype, type) {
  if (type === "bed") return archetype;
  const items = archetype.items.filter((it) => it.kind !== "bedside_table").map((it) => it.kind === "bed" ? { ...it, kind: type } : it);
  return { ...archetype, items };
}
const INTEGRATED_LAMP_FP = {
  w: 0.15,
  l: 0.15,
  h: 0.22,
  baseOffset: 0,
  clearFront: 0,
  clearSides: 0
};
const LAMP = "lamp";
const INTEGRATED_BEDSIDE_HALF_WIDTH = {
  japanese_platform_bed: 0.5,
  // NS_W  (BedEngine.buildPlatform nightstand)
  japanese_walnut_bed: 0.4
  // WING_W (BedEngine.buildWalnut bedside wing)
};
const INTEGRATED_BEDSIDE_DEPTH = {
  japanese_platform_bed: 0.5,
  // NS_D   (BedEngine.buildPlatform nightstand)
  japanese_walnut_bed: 0.55
  // WING_L (BedEngine.buildWalnut bedside wing)
};
function placeIntegratedBedLamps(input, placed, doorQuads = []) {
  const bed = placed.find((p) => bedHasIntegratedBedside(p.kind));
  if (!bed) return [];
  if (bedHasIntegratedLamps(bed.kind)) return [];
  const n = { x: Math.sin(bed.rotationY), z: Math.cos(bed.rotationY) };
  const d = { x: n.z, z: -n.x };
  const fp = bed.footprint;
  const surfaceDepth = INTEGRATED_BEDSIDE_DEPTH[bed.kind] ?? 0;
  const depthFwd = surfaceDepth / 2;
  const headX = bed.position.x - n.x * (fp.l / 2) + n.x * depthFwd;
  const headZ = bed.position.z - n.z * (fp.l / 2) + n.z * depthFwd;
  const surfaceHalfW = INTEGRATED_BEDSIDE_HALF_WIDTH[bed.kind] ?? 0;
  const side = fp.w / 2 + surfaceHalfW / 2;
  const lampY = bed.position.y + 0.3;
  const out = [];
  for (const s of [side, -side]) {
    const lx = headX + d.x * s, lz = headZ + d.z * s;
    const LAMP_HALF = 0.13;
    const obx = lx + d.x * Math.sign(s) * LAMP_HALF;
    const obz = lz + d.z * Math.sign(s) * LAMP_HALF;
    if (!pointInPolygon$1({ x: lx, z: lz }, input.polygon)) continue;
    if (!pointInPolygon$1({ x: obx, z: obz }, input.polygon)) continue;
    if (doorQuads.length > 0 && quadOverlapsAny(footprintCorners(lx, lz, INTEGRATED_LAMP_FP.w, INTEGRATED_LAMP_FP.l, bed.rotationY), doorQuads)) {
      continue;
    }
    out.push({
      kind: LAMP,
      position: { x: lx, y: lampY, z: lz },
      rotationY: bed.rotationY,
      footprint: INTEGRATED_LAMP_FP,
      hostedSpaceId: input.roomId
    });
  }
  return out;
}

const L_SOFA_MIN_AREA_M2 = 16;
function preferCornerSofa(areaM2, roomW, roomD) {
  if (areaM2 < L_SOFA_MIN_AREA_M2) return false;
  const fp = footprintOf("corner_sofa");
  const shorter = Math.min(roomW, roomD);
  const longer = Math.max(roomW, roomD);
  return longer >= fp.w + 0.9 && shorter >= fp.l + 0.9;
}
function polygonExtent(polygon) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of polygon) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  return { w: x1 - x0, d: z1 - z0 };
}
function applyCornerSofa(archetype, useCorner) {
  if (!useCorner) return archetype;
  const items = archetype.items.map(
    (it) => it.kind === "sofa" ? { ...it, kind: "corner_sofa" } : it
  );
  return { ...archetype, items };
}

const EPS$1 = 1e-6;
const ACCENT_KINDS = /* @__PURE__ */ new Set(["lamp"]);
const isAccent = (k) => ACCENT_KINDS.has(k);
const UNDERLAY_H_M = 0.05;
const isUnderlay = (p) => p.footprint.baseOffset < EPS$1 && p.footprint.h <= UNDERLAY_H_M;
const MOUNT_BASE_M = 0.4;
const isMounted = (p) => p.footprint.baseOffset >= MOUNT_BASE_M;
function quadFor$1(p) {
  return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
}
function bandsOverlap(a, b) {
  const aLo = a.footprint.baseOffset, aHi = aLo + a.footprint.h;
  const bLo = b.footprint.baseOffset, bHi = bLo + b.footprint.h;
  return aHi > bLo + EPS$1 && bHi > aLo + EPS$1;
}
function validatorWouldClash(a, b, qa, qb) {
  if (!bandsOverlap(a, b)) return false;
  if (isUnderlay(a) !== isUnderlay(b)) return false;
  if (isMounted(a) !== isMounted(b)) return false;
  return quadsOverlap(qa, qb);
}
function findHostIndex(accent, others, otherQuads) {
  let best = -1;
  let bestD = Infinity;
  const ac = { x: accent.position.x, z: accent.position.z };
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (isAccent(o.kind) || isUnderlay(o) || isMounted(o)) continue;
    if (!pointInQuad(ac, otherQuads[i])) continue;
    const d = (o.position.x - ac.x) ** 2 + (o.position.z - ac.z) ** 2;
    if (d < bestD - EPS$1) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
function pointInQuad(p, q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[i + 1 & 3];
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (cross > EPS$1) {
      if (sign < 0) return false;
      sign = 1;
    } else if (cross < -EPS$1) {
      if (sign > 0) return false;
      sign = -1;
    }
  }
  return true;
}
function resolveAccentOverlaps(placed) {
  const bodies = placed.filter((p) => !isAccent(p.kind));
  const bodyQuads = bodies.map(quadFor$1);
  const result = [];
  const placedAccents = [];
  const placedAccentQuads = [];
  for (const p of placed) {
    if (!isAccent(p.kind)) {
      result.push(p);
      continue;
    }
    const hostIdx = findHostIndex(p, bodies, bodyQuads);
    let accent = p;
    if (hostIdx >= 0) {
      const host = bodies[hostIdx];
      const hostTop = host.footprint.baseOffset + host.footprint.h;
      if (Math.abs(accent.footprint.baseOffset - hostTop) > EPS$1) {
        accent = { ...accent, footprint: { ...accent.footprint, baseOffset: hostTop } };
      }
    }
    const candidates = nudgeCandidates(accent, hostIdx >= 0 ? bodies[hostIdx] : null);
    let chosen = null;
    for (const cand of candidates) {
      const cq = quadFor$1(cand);
      let clash = false;
      for (let i = 0; i < bodies.length; i++) {
        if (i === hostIdx) continue;
        if (validatorWouldClash(cand, bodies[i], cq, bodyQuads[i])) {
          clash = true;
          break;
        }
      }
      if (!clash) {
        for (let j = 0; j < placedAccents.length; j++) {
          if (validatorWouldClash(cand, placedAccents[j], cq, placedAccentQuads[j])) {
            clash = true;
            break;
          }
        }
      }
      if (!clash) {
        chosen = { item: cand, quad: cq };
        break;
      }
    }
    if (chosen) {
      result.push(chosen.item);
      placedAccents.push(chosen.item);
      placedAccentQuads.push(chosen.quad);
    }
  }
  return result;
}
function nudgeCandidates(accent, host) {
  const out = [accent];
  if (!host) return out;
  const hx = host.position.x, hz = host.position.z;
  const dx = hx - accent.position.x, dz = hz - accent.position.z;
  const len = Math.hypot(dx, dz);
  if (len < EPS$1) return out;
  const ux = dx / len, uz = dz / len;
  const STEP = 0.05;
  for (let s = STEP; s <= len + EPS$1; s += STEP) {
    out.push({
      ...accent,
      position: { x: accent.position.x + ux * s, y: accent.position.y, z: accent.position.z + uz * s }
    });
  }
  return out;
}

const dist$1 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01$1 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
const round2 = (n) => Math.round(n * 100) / 100;
const dot2$1 = (a, b) => a.x * b.x + a.z * b.z;
const norm2 = (a) => {
  const l = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / l, z: a.z / l };
};
const forwardOf = (p) => ({ x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) });
const xz = (p) => ({ x: p.position.x, z: p.position.z });
const isCornerSofa = (p) => p.kind === "corner_sofa";
function sofaForward(p) {
  const v = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };
  return v;
}
function sofaSeatCentre(p) {
  if (!isCornerSofa(p)) return xz(p);
  const u = { x: Math.cos(p.rotationY), z: -Math.sin(p.rotationY) };
  const v = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };
  const halfMain = p.footprint.w / 2;
  const seatDepth = 0.45;
  return {
    x: p.position.x + u.x * halfMain + v.x * seatDepth,
    z: p.position.z + u.z * halfMain + v.z * seatDepth
  };
}
const LIVING_MODULES = {
  Sofa: {
    moduleType: "Sofa",
    widthMm: 2e3,
    depthMm: 900,
    heightMm: 800,
    services: {},
    clearance: { frontMm: 900 },
    // walkway / coffee-table zone in front
    preferredAdjacent: ["CoffeeTable", "SideTable"],
    forbiddenAdjacent: [],
    weights: { workflow: 10, ergonomic: 8, cost: 4, visual: 8, scoreWeight: 10 }
  },
  CornerSofa: {
    moduleType: "CornerSofa",
    widthMm: 2600,
    depthMm: 2e3,
    heightMm: 850,
    services: {},
    clearance: { frontMm: 900 },
    preferredAdjacent: ["CoffeeTable"],
    forbiddenAdjacent: [],
    weights: { workflow: 10, ergonomic: 8, cost: 6, visual: 8, scoreWeight: 10 }
  },
  MediaUnit: {
    moduleType: "MediaUnit",
    widthMm: 1600,
    depthMm: 400,
    heightMm: 500,
    services: { power: true },
    clearance: { frontMm: 600 },
    // the sofa keeps off the front of the unit
    preferredAdjacent: ["Tv"],
    forbiddenAdjacent: [],
    // T04-style: a tall/wide media wall never over a window (daylight glare on
    // the screen + the unit would block the aperture).
    forbiddenZones: ["underWindow"],
    weights: { workflow: 9, ergonomic: 7, cost: 6, visual: 8, scoreWeight: 9 }
  },
  Tv: {
    moduleType: "Tv",
    widthMm: 1400,
    depthMm: 80,
    heightMm: 800,
    services: { power: true },
    clearance: {},
    preferredAdjacent: ["MediaUnit"],
    forbiddenAdjacent: [],
    forbiddenZones: ["underWindow"],
    weights: { workflow: 9, ergonomic: 7, cost: 4, visual: 7, scoreWeight: 9 }
  },
  CoffeeTable: {
    moduleType: "CoffeeTable",
    widthMm: 1100,
    depthMm: 600,
    heightMm: 400,
    services: {},
    clearance: { frontMm: 300 },
    preferredAdjacent: ["Sofa"],
    forbiddenAdjacent: [],
    weights: { workflow: 6, ergonomic: 7, cost: 3, visual: 6, scoreWeight: 6 }
  },
  LoungeChair: {
    moduleType: "LoungeChair",
    widthMm: 850,
    depthMm: 850,
    heightMm: 950,
    services: {},
    clearance: { frontMm: 200 },
    preferredAdjacent: ["CoffeeTable"],
    forbiddenAdjacent: [],
    weights: { workflow: 5, ergonomic: 7, cost: 3, visual: 6, scoreWeight: 5 }
  }
};
const LIVING_ONTOLOGY = { roomType: "living-room", modules: LIVING_MODULES };
const LIVING_SCORECARD_WEIGHTS = {
  workflow: 25,
  // sofa↔TV alignment (TV faces + opposite the sofa)
  circulation: 15,
  // aisle between sofa front and TV unit
  storage: 10,
  // conversation grouping
  mep: 10,
  // focal-wall use (TV unit on a real wall, on the sofa axis)
  naturalLight: 10,
  // daylight not blocked
  buildability: 15,
  // viewing-distance comfort band
  cost: 5,
  // balance
  aesthetics: 10
  // TV centred on the sofa centre-line
};
const VIEW_DIST_LO = 2;
const VIEW_DIST_HI = 4.5;
const FACE_COS_MIN = 0.82;
const OPP_COS_MIN = 0.82;
const FOCAL_COS_MIN = 0.76;
const AISLE_MIN_M = 0.9;
const SOFA_KINDS = /* @__PURE__ */ new Set(["sofa", "corner_sofa"]);
const TV_KINDS = /* @__PURE__ */ new Set(["tv", "tv_unit"]);
function resolveLivingItems(placed) {
  const sofa = placed.find((p) => SOFA_KINDS.has(p.kind)) ?? null;
  const tvPanel = placed.find((p) => p.kind === "tv") ?? null;
  const mediaUnit = placed.find((p) => p.kind === "tv_unit") ?? null;
  const coffeeTable = placed.find((p) => p.kind === "coffee_table") ?? null;
  return { sofa, tv: tvPanel ?? mediaUnit, mediaUnit, coffeeTable };
}
function underAnyWindow(p, windows) {
  const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
  const ew = q === 1 || q === 3 ? p.footprint.l : p.footprint.w;
  const el = q === 1 || q === 3 ? p.footprint.w : p.footprint.l;
  const c = xz(p);
  for (const w of windows) {
    const half = w.width / 2;
    if (w.center.x >= c.x - ew / 2 - half && w.center.x <= c.x + ew / 2 + half && w.center.z >= c.z - el / 2 - half && w.center.z <= c.z + el / 2 + half) return w;
  }
  return null;
}
function validateLivingLayout(placed, room, ontology = LIVING_ONTOLOGY) {
  const violations = [];
  const windows = room.windows ?? [];
  const { sofa, tv, mediaUnit } = resolveLivingItems(placed);
  if (sofa && tv) {
    const sofaC = sofaSeatCentre(sofa);
    const tvC = xz(tv);
    const sofaFwd = sofaForward(sofa);
    const tvFwd = forwardOf(tv);
    const sofaToTv = norm2({ x: tvC.x - sofaC.x, z: tvC.z - sofaC.z });
    const tvToSofa = { x: -sofaToTv.x, z: -sofaToTv.z };
    const viewDist = dist$1(sofaC, tvC);
    if (dot2$1(tvFwd, tvToSofa) < FACE_COS_MIN) {
      violations.push({
        rule: "TV-FACE",
        kind: tv.kind,
        position: tvC,
        detail: `the ${tv.kind} does not face the sofa (facing·toSofa=${dot2$1(tvFwd, tvToSofa).toFixed(2)} < ${FACE_COS_MIN})`
      });
    }
    if (dot2$1(sofaFwd, sofaToTv) < OPP_COS_MIN) {
      violations.push({
        rule: "TV-OPP",
        kind: tv.kind,
        position: tvC,
        detail: `the ${tv.kind} is not opposite the sofa across the coffee table (sofaFwd·toTv=${dot2$1(sofaFwd, sofaToTv).toFixed(2)} < ${OPP_COS_MIN})`
      });
    }
    if (viewDist < VIEW_DIST_LO - 1e-6 || viewDist > VIEW_DIST_HI + 1e-6) {
      violations.push({
        rule: "TV-DIST",
        kind: tv.kind,
        position: tvC,
        detail: `sofa↔${tv.kind} viewing distance ${viewDist.toFixed(2)}m outside [${VIEW_DIST_LO}, ${VIEW_DIST_HI}]m`
      });
    }
    if (dot2$1(sofaFwd, sofaToTv) < FOCAL_COS_MIN) {
      violations.push({
        rule: "SOFA-FOCAL",
        kind: sofa.kind,
        position: sofaC,
        detail: `the sofa does not face the focal wall (sofaFwd·toTv=${dot2$1(sofaFwd, sofaToTv).toFixed(2)} < ${FOCAL_COS_MIN})`
      });
    }
    const front = mediaUnit ?? tv;
    const frontC = xz(front);
    const sofaHalf = isCornerSofa(sofa) ? 0.45 : sofa.footprint.l / 2;
    const gap = dist$1(sofaC, frontC) - sofaHalf - front.footprint.l / 2;
    if (gap >= 0 && gap < AISLE_MIN_M - 1e-6) {
      violations.push({
        rule: "AISLE",
        kind: front.kind,
        position: frontC,
        detail: `aisle between sofa front and ${front.kind} is ${gap.toFixed(2)}m (< ${AISLE_MIN_M}m)`
      });
    }
  }
  for (const p of placed) {
    if (TV_KINDS.has(p.kind) && p.footprint.h >= 0.7) {
      const w = underAnyWindow(p, windows);
      if (w) {
        violations.push({
          rule: "TV-WINDOW",
          kind: p.kind,
          position: xz(p),
          detail: `${p.kind} overlaps a window aperture (glare + blocks daylight)`
        });
      }
    }
  }
  return { valid: violations.length === 0, violations };
}
function formatLivingViolations(roomId, res) {
  if (res.valid) return `§DIAG-LIVING-RULES room=${roomId} valid — 0 HARD violations`;
  const summary = res.violations.map((v) => `${v.rule}:${v.kind}`).join(", ");
  return `§DIAG-LIVING-RULES room=${roomId} INVALID ${res.violations.length} HARD violation(s) — ${summary}`;
}
function alignmentAxis(items) {
  const { sofa, tv } = items;
  if (!sofa || !tv) return 40;
  const sofaC = sofaSeatCentre(sofa), tvC = xz(tv);
  const sofaFwd = sofaForward(sofa), tvFwd = forwardOf(tv);
  const sofaToTv = norm2({ x: tvC.x - sofaC.x, z: tvC.z - sofaC.z });
  const tvToSofa = { x: -sofaToTv.x, z: -sofaToTv.z };
  const grade = (cos, floor) => clamp01$1((cos - floor) / (1 - floor));
  const face = grade(dot2$1(tvFwd, tvToSofa), FACE_COS_MIN);
  const opp = grade(dot2$1(sofaFwd, sofaToTv), OPP_COS_MIN);
  return 100 * (0.5 * face + 0.5 * opp);
}
function circulationAxis(items) {
  const { sofa, mediaUnit, tv } = items;
  const front = mediaUnit ?? tv;
  if (!sofa || !front) return 50;
  const sofaHalf = isCornerSofa(sofa) ? 0.45 : sofa.footprint.l / 2;
  const gap = dist$1(sofaSeatCentre(sofa), xz(front)) - sofaHalf - front.footprint.l / 2;
  if (gap >= 1.2) return 100;
  if (gap <= 0.3) return 0;
  if (gap >= AISLE_MIN_M) return 80 + 20 * ((gap - AISLE_MIN_M) / (1.2 - AISLE_MIN_M));
  return 80 * ((gap - 0.3) / (AISLE_MIN_M - 0.3));
}
function conversationAxis(placed, items) {
  const { sofa, coffeeTable } = items;
  if (!sofa) return 50;
  const sofaC = sofaSeatCentre(sofa), sofaFwd = sofaForward(sofa);
  const focus = coffeeTable ? xz(coffeeTable) : { x: sofaC.x + sofaFwd.x * 1, z: sofaC.z + sofaFwd.z * 1 };
  const seats = placed.filter((p) => SOFA_KINDS.has(p.kind) || p.kind === "lounge_chair");
  if (seats.length <= 1) return 70;
  const seatPt = (s) => SOFA_KINDS.has(s.kind) ? sofaSeatCentre(s) : xz(s);
  const near = seats.filter((s) => dist$1(seatPt(s), focus) <= 2.8).length;
  return 100 * clamp01$1(near / seats.length);
}
function focalWallAxis(items, room) {
  const { sofa, mediaUnit, tv } = items;
  const unit = mediaUnit ?? tv;
  if (!sofa || !unit) return 50;
  let score = 50;
  const walls = room.walls ?? [];
  const n = forwardOf(unit);
  const backX = unit.position.x - n.x * (unit.footprint.l / 2);
  const backZ = unit.position.z - n.z * (unit.footprint.l / 2);
  const onWall = walls.some((w) => {
    const d = norm2({ x: w.b.x - w.a.x, z: w.b.z - w.a.z });
    const t = (backX - w.a.x) * d.x + (backZ - w.a.z) * d.z;
    if (t < -0.1 || t > w.length + 0.1) return false;
    const px = w.a.x + d.x * t, pz = w.a.z + d.z * t;
    return Math.hypot(backX - px, backZ - pz) < 0.25;
  });
  if (onWall) score += 25;
  const sofaC = sofaSeatCentre(sofa);
  const sofaToUnit = norm2({ x: xz(unit).x - sofaC.x, z: xz(unit).z - sofaC.z });
  if (dot2$1(sofaForward(sofa), sofaToUnit) > 0.9) score += 25;
  return Math.min(100, score);
}
function naturalLightAxis(placed, room) {
  const windows = room.windows ?? [];
  if (windows.length === 0) return 50;
  let blocked = 0;
  for (const p of placed) {
    if ((TV_KINDS.has(p.kind) || p.kind === "bookshelf_glass") && p.footprint.h >= 0.7) {
      if (underAnyWindow(p, windows)) blocked++;
    }
  }
  return blocked === 0 ? 100 : Math.max(0, 100 - blocked * 50);
}
function viewingDistanceAxis(items) {
  const { sofa, tv } = items;
  if (!sofa || !tv) return 50;
  const v = dist$1(sofaSeatCentre(sofa), xz(tv));
  if (v >= VIEW_DIST_LO && v <= VIEW_DIST_HI) return 100;
  const d = v < VIEW_DIST_LO ? VIEW_DIST_LO - v : v - VIEW_DIST_HI;
  return 100 * clamp01$1(1 - d / 2);
}
function balanceAxis(placed, room) {
  const floor = placed.filter((p) => p.footprint.baseOffset < 0.5);
  if (floor.length === 0) return 50;
  let sx = 0, sz = 0;
  for (const p of floor) {
    sx += p.position.x;
    sz += p.position.z;
  }
  const cx = sx / floor.length, cz = sz / floor.length;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of room.polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const halfSpan = Math.max(1e-3, Math.max(maxX - minX, maxZ - minZ) / 2);
  const off = dist$1({ x: cx, z: cz }, room.centroid) / halfSpan;
  return 100 * clamp01$1(1 - off);
}
function symmetryAxis(items) {
  const { sofa, mediaUnit, tv } = items;
  const unit = mediaUnit ?? tv;
  if (!sofa || !unit) return 50;
  const sofaC = sofaSeatCentre(sofa), unitC = xz(unit);
  const fwd = sofaForward(sofa);
  const along = perpAlong(sofaC, unitC, fwd);
  return 100 * clamp01$1(1 - along / 1);
}
function perpAlong(p, q, fwd) {
  const dx = q.x - p.x, dz = q.z - p.z;
  const along = dx * fwd.x + dz * fwd.z;
  const px = dx - along * fwd.x, pz = dz - along * fwd.z;
  return Math.hypot(px, pz);
}
function scoreLivingLayout(placed, room, opts = {}) {
  const weights = opts.weights ?? LIVING_SCORECARD_WEIGHTS;
  const items = resolveLivingItems(placed);
  const axes = {
    workflow: round2(alignmentAxis(items)),
    circulation: round2(circulationAxis(items)),
    storage: round2(conversationAxis(placed, items)),
    mep: round2(focalWallAxis(items, room)),
    naturalLight: round2(naturalLightAxis(placed, room)),
    buildability: round2(viewingDistanceAxis(items)),
    cost: round2(balanceAxis(placed, room)),
    aesthetics: round2(symmetryAxis(items))
  };
  return {
    valid: opts.valid ?? true,
    hardFailures: opts.hardFailures ?? [],
    axes,
    total: round2(weightedTotal(axes, weights))
  };
}
function formatLivingScore(roomId, tag, score) {
  const a = score.axes;
  const axes = `align=${a.workflow} circ=${a.circulation} conv=${a.storage} focal=${a.mep} light=${a.naturalLight} view=${a.buildability} bal=${a.cost} sym=${a.aesthetics}`;
  const validTag = score.valid ? "valid" : `INVALID[${score.hardFailures.join(",")}]`;
  return `§DIAG-LIVING-SCORE room=${roomId} ${tag} total=${score.total} ${validTag} — ${axes}`;
}

function furnishRoom(input, options = {}) {
  if (input.occupancy === "kitchen") {
    const kl = normaliseKitchenLayout(options.kitchenLayout);
    const run = planKitchenRun(input, kl, { washingMachine: !!options.kitchenWashingMachine });
    if (run.length > 0) return run;
    return planKitchen(input, kl, { washingMachine: !!options.kitchenWashingMachine });
  }
  const baseArchetype = archetypeFor(input.occupancy);
  if (!baseArchetype || baseArchetype.items.length === 0) return [];
  let archetype = baseArchetype;
  let bedType = null;
  if (input.occupancy === "bedroom") {
    bedType = chooseBedType(input.roomId);
    archetype = applyBedType(baseArchetype, bedType);
  } else if (input.occupancy === "living-room") {
    const ext = polygonExtent(input.polygon);
    archetype = applyCornerSofa(baseArchetype, preferCornerSofa(input.areaM2, ext.w, ext.d));
  }
  const placed = placeRoom(input, archetype);
  if (input.occupancy === "living-room") {
    reportLivingRules(input, placed);
  }
  if (input.occupancy === "bedroom") {
    const withWardrobe = withWardrobePlan(input, placed, normaliseWardrobeLayout(options.wardrobeLayout));
    const lamps = bedType && bedHasIntegratedBedside(bedType) ? placeIntegratedBedLamps(input, withWardrobe, doorObstacles$1(input)) : placeBedsideLamps(input, withWardrobe);
    return resolveAccentOverlaps([...withWardrobe, ...lamps]);
  }
  return placed;
}
function furnishRoomCompound(input, occupancies, options = {}) {
  const nonKitchen = occupancies.filter((o) => o !== "kitchen");
  const hasKitchen = occupancies.includes("kitchen");
  const archetypes = nonKitchen.map((o) => archetypeFor(o)).filter((a) => a !== null && a.items.length > 0);
  const placed = [];
  if (archetypes.length > 0) placed.push(...placeRoomMulti(input, archetypes));
  if (hasKitchen) {
    const kl = normaliseKitchenLayout(options.kitchenLayout);
    const wm = !!options.kitchenWashingMachine;
    const run = planKitchenRun(input, kl, { washingMachine: wm });
    placed.push(...run.length > 0 ? run : planKitchen(input, kl, { washingMachine: wm }));
  }
  return placed;
}
function reportLivingRules(input, placed) {
  const res = validateLivingLayout(placed, input);
  const score = scoreLivingLayout(placed, input, {
    valid: res.valid,
    hardFailures: res.violations.map((v) => v.rule)
  });
  console.log(formatLivingViolations(input.roomId, res));
  console.log(formatLivingScore(input.roomId, "placed", score));
  return res;
}
function withWardrobePlan(input, placed, layout) {
  const wardrobeIdx = placed.findIndex((p) => p.kind === "wardrobe");
  if (wardrobeIdx < 0) return placed;
  const run = planWardrobe(input, placed, layout);
  if (run.length === 0) return placed;
  const out = placed.filter((p) => p.kind !== "wardrobe");
  out.push(...run);
  return out;
}

const PALETTE_TABLE = {
  // NORDIC — pale ash/birch/light-oak wood, white + soft cool greys, light
  // linen/wool upholstery, matte finishes, light wood floor.
  nordic: {
    upholstery: { color: "#D9D6CE", material: "fabric" },
    // soft linen grey-white
    wood: { color: "#E2D6BE", material: "wood" },
    // pale ash / birch
    table: { color: "#D8C9A8", material: "wood" },
    // light oak
    metal: { color: "#9FA4A8", material: "metal" },
    // brushed matte steel
    soft: { color: "#C7CCC9", material: "fabric" },
    // cool wool grey
    neutral: { color: "#ECEAE4", material: "metal" },
    // white-grey
    mirror: { color: "#EEF2F4", material: "mirror" },
    // §63.1 — silver mirror
    floorColor: "#E2D6BE",
    wallAccent: "#F3F1EC"
    // off-white
  },
  // MEDITERRANEAN — warm terracotta + lime-plaster walls, olive/ochre/sand
  // accents, ceramic/terracotta tile floor, rattan/cane + warm wood, wrought iron.
  mediterranean: {
    upholstery: { color: "#C7A36B", material: "fabric" },
    // sand / ochre linen
    wood: { color: "#9C6B3C", material: "wood" },
    // warm honey wood / cane
    table: { color: "#8A5A33", material: "wood" },
    // warm walnut-brown
    metal: { color: "#3B352E", material: "metal" },
    // wrought iron (dark)
    soft: { color: "#7A8450", material: "fabric" },
    // olive green textile
    neutral: { color: "#C97B4A", material: "wood" },
    // terracotta
    mirror: { color: "#EEEAE0", material: "mirror" },
    // §63.1 — warm silver mirror
    floorColor: "#C8794D",
    // terracotta tile
    wallAccent: "#EFE3CE"
    // lime plaster
  },
  // MINIMALIST — monochrome white/grey/black, lacquer + glass, hidden hardware,
  // polished concrete / large-format pale tile floor, low-contrast.
  minimalist: {
    upholstery: { color: "#C9C9C9", material: "fabric" },
    // mid grey
    wood: { color: "#E8E8E8", material: "wood" },
    // white lacquer
    table: { color: "#DADADA", material: "glass" },
    // glass / pale lacquer
    metal: { color: "#4A4A4A", material: "metal" },
    // matte black accent
    soft: { color: "#B5B5B5", material: "fabric" },
    // low-contrast grey
    neutral: { color: "#DFDFDF", material: "metal" },
    // light grey
    mirror: { color: "#F0F3F5", material: "mirror" },
    // §63.1 — cool silver mirror
    floorColor: "#DCDCDC",
    // polished concrete / pale tile
    wallAccent: "#F4F4F4"
    // near-white
  },
  // CLASSIC — dark walnut/mahogany case-goods, brass/bronze hardware, deep rich
  // upholstery (burgundy/navy/forest), marble + dark herringbone wood floor.
  classic: {
    upholstery: { color: "#6E2230", material: "fabric" },
    // deep burgundy
    wood: { color: "#5A3A22", material: "wood" },
    // dark walnut / mahogany
    table: { color: "#4E3320", material: "wood" },
    // mahogany
    metal: { color: "#B08D3C", material: "metal" },
    // brass / bronze
    soft: { color: "#1F3A5F", material: "fabric" },
    // deep navy
    neutral: { color: "#7D6A4A", material: "wood" },
    // aged brass-brown
    mirror: { color: "#E8EAEC", material: "mirror" },
    // §63.1 — antiqued silver mirror
    floorColor: "#5A3A22",
    // dark herringbone wood
    wallAccent: "#E7E0D2"
    // warm parchment / marble
  }
};
const ALIASES = {
  modern: "minimalist",
  minimal: "minimalist",
  minimalist: "minimalist",
  warm: "mediterranean",
  mediterranean: "mediterranean",
  classic: "classic",
  nordic: "nordic",
  // Friendly synonyms the RAC / free-text might emit.
  scandinavian: "nordic",
  scandi: "nordic",
  traditional: "classic",
  rustic: "mediterranean",
  cozy: "mediterranean",
  cosy: "mediterranean",
  contemporary: "minimalist"
};
const DEFAULT_STYLE = "nordic";
const UPHOLSTERED = /* @__PURE__ */ new Set([
  "sofa",
  "lounge_chair",
  "bed",
  "dining_chair",
  "desk_chair",
  "entry_bench",
  "vanity_stool",
  "armchair",
  "bench",
  "ottoman",
  "stool",
  // §67.2 / §67.3 (2026-06-11) — the L-shape corner sofa + the integrated bed
  // variants read the upholstery palette (fabric), like the straight sofa/bed.
  "corner_sofa",
  "nordic_bed",
  "solid_wood_bed",
  // §BED-4-TYPES (2026-06-12) — the three JapaneseBedBuilder picker variants
  // read the upholstery palette too (the mattress/textile reads fabric).
  "japanese_platform_bed",
  "japanese_float_bed",
  "japanese_walnut_bed"
]);
const SOFT_KINDS = /* @__PURE__ */ new Set([
  "rug",
  // §OVERBED-WALL-TAPESTRY (founder, 2026-06-18) — the woven over-bed textile
  // wall-hanging reads the 'soft' palette slot → a FABRIC finish (not the
  // 'mirror' reflective material the wall_mirror it replaces used). The warm
  // multi-colour woven look itself is rendered by WallTapestryBuilder; this
  // routing just carries the honest textile material on the emitted element.
  "wall_tapestry"
]);
const TABLE_KINDS = /* @__PURE__ */ new Set([
  "dining_table",
  "coffee_table",
  "console_table",
  "desk",
  "entrance_table",
  "table",
  "vanity_table",
  "side_table",
  "bedside_table"
]);
const WOOD_KINDS = /* @__PURE__ */ new Set([
  "bookshelf",
  "bookshelf_glass",
  "wardrobe",
  "dresser",
  "sideboard",
  "buffet",
  "shoe_cabinet",
  "tv_unit",
  "pantry_cabinet",
  "cabinet",
  "shelf",
  "shelving"
]);
const MIRROR_KINDS = /* @__PURE__ */ new Set([
  "wall_mirror",
  "bathroom_mirror",
  "wc_mirror"
]);
function normaliseStyle(s) {
  if (typeof s !== "string") return DEFAULT_STYLE;
  return ALIASES[s.toLowerCase().trim()] ?? DEFAULT_STYLE;
}
function categoryFor(kind) {
  if (MIRROR_KINDS.has(kind)) return "mirror";
  if (SOFT_KINDS.has(kind)) return "soft";
  if (UPHOLSTERED.has(kind)) return "upholstery";
  if (TABLE_KINDS.has(kind)) return "table";
  if (WOOD_KINDS.has(kind)) return "wood";
  return "neutral";
}
const NEW_STYLE_INPUTS = {
  farmhouse: "farmhouse",
  countryside: "farmhouse",
  country: "farmhouse",
  japanese: "japanese",
  japandi: "japanese",
  zen: "japanese",
  industrial: "industrial",
  warehouse: "industrial",
  loft: "industrial"
};
function newStyleSlots(style, category) {
  if (typeof style !== "string") return null;
  const id = NEW_STYLE_INPUTS[style.toLowerCase().trim()];
  if (!id) return null;
  const slot = STYLE_REGISTRY[id].furniture[category];
  return { color: slot.color, material: slot.material };
}
function styleFinishFor(style, kind) {
  const category = categoryFor(kind);
  const ns = newStyleSlots(style, category);
  if (ns) return ns;
  const canonical = normaliseStyle(style);
  const palette = PALETTE_TABLE[canonical];
  const slot = palette[category];
  return { color: slot.color, material: slot.material };
}

const round6$2 = (n) => Math.round(n * 1e6) / 1e6;
function buildFurnishCommands(placed, levelId, levelElevation, mintId, style) {
  const commands = [];
  const ids = [];
  const warnings = [];
  const finishStyle = normaliseStyle(style);
  for (const p of placed) {
    if (!(p.footprint.w > 0) || !(p.footprint.l > 0)) {
      warnings.push(`${p.kind} skipped — degenerate footprint`);
      continue;
    }
    const id = mintId("furniture");
    ids.push(id);
    const finish = styleFinishFor(finishStyle, p.kind);
    const kc = p.kitchenConfig;
    const base = {
      id,
      furnitureType: p.kind,
      position: { x: round6$2(p.position.x), y: round6$2(p.position.y), z: round6$2(p.position.z) },
      rotation: round6$2(p.rotationY),
      // SCALAR yaw (radians)
      levelId,
      baseOffset: round6$2(p.position.y - levelElevation),
      color: finish.color,
      // A.21.D4 — style colour (hex)
      material: finish.material,
      // A.21.D4 — style finish
      metadata: { hostedSpaceId: p.hostedSpaceId, style: finishStyle }
    };
    const payload = kc ? {
      ...base,
      width: round6$2(kc.length),
      length: round6$2(kc.depth),
      height: round6$2(kc.height),
      furnitureCategory: "kitchen",
      kitchenConfig: kc
    } : {
      ...base,
      width: round6$2(p.footprint.w),
      length: round6$2(p.footprint.l),
      height: round6$2(p.footprint.h)
    };
    commands.push({ command: "furniture.create", payload });
  }
  return { levelId, commands, ids, totalElementCount: commands.length, warnings };
}

const KITCHEN_TRIANGLE = {
  LEG_MIN_HARD: 1.2,
  // < this is unworkable (crowding)
  LEG_MIN_SOFT: 1.5,
  // < this is tight
  LEG_MAX_SOFT: 2.4,
  // > this is loose
  LEG_MAX_HARD: 2.7,
  // > this is wasteful
  SUM_MIN_HARD: 3.6,
  SUM_MAX_SOFT: 6.6,
  // recommended ceiling
  SUM_MAX_HARD: 7.9
  // NKBA absolute cap
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function validateKitchenTriangle(input) {
  const { kitchenId, sink, stove, fridge } = input;
  const hard = [];
  const soft = [];
  const legs = [
    { name: "sink↔stove", d: dist(sink, stove) },
    { name: "stove↔fridge", d: dist(stove, fridge) },
    { name: "fridge↔sink", d: dist(fridge, sink) }
  ];
  for (const leg of legs) {
    if (leg.d < KITCHEN_TRIANGLE.LEG_MIN_HARD - 1e-6) {
      hard.push({
        roomId: kitchenId,
        severity: "hard",
        metric: `legMin:${leg.name}`,
        delta: 1,
        reason: `kitchen leg ${leg.name} is ${leg.d.toFixed(2)} m < hard min ${KITCHEN_TRIANGLE.LEG_MIN_HARD} m (workspace crowded — primary fixtures too close)`
      });
    } else if (leg.d > KITCHEN_TRIANGLE.LEG_MAX_HARD + 1e-6) {
      hard.push({
        roomId: kitchenId,
        severity: "hard",
        metric: `legMax:${leg.name}`,
        delta: 1,
        reason: `kitchen leg ${leg.name} is ${leg.d.toFixed(2)} m > hard max ${KITCHEN_TRIANGLE.LEG_MAX_HARD} m (workflow wastes time walking between primary fixtures)`
      });
    }
  }
  if (hard.length === 0) {
    for (const leg of legs) {
      if (leg.d < KITCHEN_TRIANGLE.LEG_MIN_SOFT) {
        const range = KITCHEN_TRIANGLE.LEG_MIN_SOFT - KITCHEN_TRIANGLE.LEG_MIN_HARD;
        const delta = Math.min(1, (KITCHEN_TRIANGLE.LEG_MIN_SOFT - leg.d) / range);
        soft.push({
          roomId: kitchenId,
          severity: "soft",
          metric: `legTight:${leg.name}`,
          delta,
          reason: `kitchen leg ${leg.name} is tight (${leg.d.toFixed(2)} m, comfortable ≥ ${KITCHEN_TRIANGLE.LEG_MIN_SOFT} m)`
        });
      } else if (leg.d > KITCHEN_TRIANGLE.LEG_MAX_SOFT) {
        const range = KITCHEN_TRIANGLE.LEG_MAX_HARD - KITCHEN_TRIANGLE.LEG_MAX_SOFT;
        const delta = Math.min(1, (leg.d - KITCHEN_TRIANGLE.LEG_MAX_SOFT) / range);
        soft.push({
          roomId: kitchenId,
          severity: "soft",
          metric: `legLoose:${leg.name}`,
          delta,
          reason: `kitchen leg ${leg.name} is loose (${leg.d.toFixed(2)} m, comfortable ≤ ${KITCHEN_TRIANGLE.LEG_MAX_SOFT} m)`
        });
      }
    }
  }
  const sum = legs.reduce((s, l) => s + l.d, 0);
  if (sum < KITCHEN_TRIANGLE.SUM_MIN_HARD - 1e-6) {
    hard.push({
      roomId: kitchenId,
      severity: "hard",
      metric: "sumMin",
      delta: 1,
      reason: `kitchen triangle sum is ${sum.toFixed(2)} m < hard min ${KITCHEN_TRIANGLE.SUM_MIN_HARD} m (degenerate triangle — fixtures collapsed onto one point)`
    });
  } else if (sum > KITCHEN_TRIANGLE.SUM_MAX_HARD + 1e-6) {
    hard.push({
      roomId: kitchenId,
      severity: "hard",
      metric: "sumMax",
      delta: 1,
      reason: `kitchen triangle sum is ${sum.toFixed(2)} m > hard max ${KITCHEN_TRIANGLE.SUM_MAX_HARD} m (NKBA cap exceeded — kitchen too spread out)`
    });
  } else if (sum > KITCHEN_TRIANGLE.SUM_MAX_SOFT) {
    const range = KITCHEN_TRIANGLE.SUM_MAX_HARD - KITCHEN_TRIANGLE.SUM_MAX_SOFT;
    const delta = Math.min(1, (sum - KITCHEN_TRIANGLE.SUM_MAX_SOFT) / range);
    soft.push({
      roomId: kitchenId,
      severity: "soft",
      metric: "sumLoose",
      delta,
      reason: `kitchen triangle sum is loose (${sum.toFixed(2)} m, comfortable ≤ ${KITCHEN_TRIANGLE.SUM_MAX_SOFT} m)`
    });
  }
  return {
    admissible: hard.length === 0,
    hardFindings: hard,
    softFindings: soft
  };
}

const KITCHEN_RUN_KINDS = /* @__PURE__ */ new Set([
  "kitchen_straight",
  "kitchen_l_shape",
  "kitchen_u_shape"
]);
const ptOf = (p) => ({ x: p.position.x, z: p.position.z });
function trianglePointsFromConfig(run) {
  const cfg = run.kitchenConfig;
  if (!cfg || !cfg.units || cfg.units.length === 0) return null;
  const yaw = run.rotationY;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const L = cfg.length;
  const depth = cfg.depth;
  const mainUnitW = cfg.numUnits > 0 ? L / cfg.numUnits : L;
  const leftLen = cfg.lengthLeft ?? 0, numLeft = cfg.numUnitsLeft ?? 0;
  const rightLen = cfg.lengthRight ?? 0, numRight = cfg.numUnitsRight ?? 0;
  const leftUnitW = numLeft > 0 ? leftLen / numLeft : 0;
  const rightUnitW = numRight > 0 ? rightLen / numRight : 0;
  const toWorld = (lx, lz) => ({
    x: run.position.x + lx * cos + lz * sin,
    z: run.position.z - lx * sin + lz * cos
  });
  const cellLocal = (arm, i) => {
    if (arm === "main") return { x: -L / 2 + (i + 0.5) * mainUnitW, z: 0 };
    if (arm === "left") {
      if (leftUnitW <= 0) return null;
      return { x: -L / 2 + depth / 2, z: depth / 2 + (i + 0.5) * leftUnitW };
    }
    if (arm === "right") {
      if (rightUnitW <= 0) return null;
      return { x: L / 2 - depth / 2, z: depth / 2 + (i + 0.5) * rightUnitW };
    }
    return null;
  };
  const findAppliance = (match) => {
    for (const u of cfg.units) {
      if (u.appliance && match(u.appliance)) {
        const loc = cellLocal(u.arm, u.index);
        if (loc) return toWorld(loc.x, loc.z);
      }
    }
    return null;
  };
  const sink = findAppliance((a) => a.includes("sink"));
  const stove = findAppliance((a) => a.includes("hob") || a.includes("stove") || a.includes("cooktop") || a.includes("oven"));
  const fridge = findAppliance((a) => a.includes("fridge"));
  if (!sink || !stove || !fridge) return null;
  return { sink, stove, fridge };
}
function validateKitchenFromFurniture(kitchenRoomId, placed) {
  const sinkP = placed.find((p) => p.kind === "sink");
  const hobP = placed.find((p) => p.kind === "hob");
  const fridgeP = placed.find((p) => p.kind === "fridge");
  if (sinkP && hobP && fridgeP) {
    return validateKitchenTriangle({
      kitchenId: kitchenRoomId,
      sink: ptOf(sinkP),
      stove: ptOf(hobP),
      fridge: ptOf(fridgeP)
    });
  }
  for (const run2 of placed) {
    if (!KITCHEN_RUN_KINDS.has(run2.kind) || !run2.kitchenConfig) continue;
    const tri = trianglePointsFromConfig(run2);
    if (tri) {
      return validateKitchenTriangle({
        kitchenId: kitchenRoomId,
        sink: tri.sink,
        stove: tri.stove,
        fridge: tri.fridge
      });
    }
  }
  const runs = placed.filter((p) => KITCHEN_RUN_KINDS.has(p.kind));
  const island = placed.find((p) => p.kind === "kitchen_island");
  if (runs.length === 0) return null;
  if (island && runs.length >= 1) {
    const sink = ptOf(runs[0]);
    const stove = ptOf(island);
    const fridge = runs[1] ? ptOf(runs[1]) : { x: 2 * runs[0].position.x - island.position.x, z: 2 * runs[0].position.z - island.position.z };
    return validateKitchenTriangle({
      kitchenId: kitchenRoomId,
      sink,
      stove,
      fridge
    });
  }
  if (runs.length >= 2) {
    const sink = ptOf(runs[0]);
    const stove = ptOf(runs[1]);
    const fridge = {
      x: (runs[0].position.x + runs[1].position.x) / 2,
      z: (runs[0].position.z + runs[1].position.z) / 2
    };
    return validateKitchenTriangle({
      kitchenId: kitchenRoomId,
      sink,
      stove,
      fridge
    });
  }
  const run = runs[0];
  const along = [
    { x: run.position.x - run.footprint.w * 0.25, z: run.position.z },
    { x: run.position.x, z: run.position.z },
    { x: run.position.x + run.footprint.w * 0.25, z: run.position.z }
  ];
  return validateKitchenTriangle({
    kitchenId: kitchenRoomId,
    sink: along[0],
    stove: along[1],
    fridge: along[2]
  });
}

const EPS = 1e-6;
function quadFor(p) {
  return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
}
function ccw(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function segSeg(p1, p2, p3, p4) {
  const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
  return (d1 > EPS && d2 < -EPS || d1 < -EPS && d2 > EPS) && (d3 > EPS && d4 < -EPS || d3 < -EPS && d4 > EPS);
}
function segCrossesQuad(p1, p2, quad) {
  if (pointInPolygon$1(p1, quad) || pointInPolygon$1(p2, quad)) return true;
  for (let i = 0; i < 4; i++) {
    if (segSeg(p1, p2, quad[i], quad[i + 1 & 3])) return true;
  }
  return false;
}
function validateFurnishedRoom(input, placed) {
  const warnings = [];
  const quads = placed.map(quadFor);
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (!pointInPolygon$1({ x: p.position.x, z: p.position.z }, input.polygon)) {
      warnings.push(`${p.kind}[${i}] centre (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)}) lies OUTSIDE the room polygon`);
    }
  }
  const MOUNT_BASE_M = 0.4;
  const UNDERLAY_H_M = 0.05;
  const isUnderlay = (p) => p.footprint.baseOffset < EPS && p.footprint.h <= UNDERLAY_H_M;
  const isMounted = (p) => p.footprint.baseOffset >= MOUNT_BASE_M;
  const bandsOverlap = (a, b) => {
    const aLo = a.footprint.baseOffset, aHi = aLo + a.footprint.h;
    const bLo = b.footprint.baseOffset, bHi = bLo + b.footprint.h;
    return aHi > bLo + EPS && bHi > aLo + EPS;
  };
  for (let i = 0; i < quads.length; i++) {
    for (let j = i + 1; j < quads.length; j++) {
      const a = placed[i], b = placed[j];
      if (!bandsOverlap(a, b)) continue;
      if (isUnderlay(a) !== isUnderlay(b)) continue;
      if (isMounted(a) !== isMounted(b)) continue;
      if (quadsOverlap(quads[i], quads[j])) {
        warnings.push(`${a.kind}[${i}] OVERLAPS ${b.kind}[${j}]`);
      }
    }
  }
  for (let di = 0; di < input.doors.length; di++) {
    const d = input.doors[di];
    const entry = {
      x: d.center.x + d.normal.x * 0.5,
      z: d.center.z + d.normal.z * 0.5
    };
    if (!pointInPolygon$1(entry, input.polygon)) continue;
    for (let ri = 0; ri < quads.length; ri++) {
      if (segCrossesQuad(entry, input.centroid, quads[ri])) {
        warnings.push(`door[${di}] → centroid path BLOCKED by ${placed[ri].kind}[${ri}]`);
        break;
      }
    }
  }
  if (input.occupancy === "kitchen") {
    const tri = validateKitchenFromFurniture(input.roomId, placed);
    if (tri !== null) {
      for (const f of tri.hardFindings) {
        warnings.push(`kitchen-triangle (HARD): ${f.reason}`);
      }
      for (const f of tri.softFindings) {
        warnings.push(`kitchen-triangle: ${f.reason}`);
      }
    }
  }
  return { roomId: input.roomId, ok: warnings.length === 0, warnings };
}

const A = (occupancy, items) => ({ occupancy, items });
const LIGHTING_ARCHETYPES = {
  // Large social spaces — pendant for character, downlight for compact ones.
  // §MORE-LIGHTING (#11) — + a pair of FLOOR lamps in the corners (an arc lamp
  // + a wood-post standard lamp) so the lounge reads warmly lit beyond the
  // single ceiling fixture. Spread across the two corners farthest from the door.
  "living-room": A("living-room", [
    { kind: "pendant_ceramic_bell", minAreaM2: 25 },
    { kind: "pendant", minAreaM2: 12 },
    { kind: "downlight", minAreaM2: 0 },
    { kind: "floor_arc_brass", minAreaM2: 12, mount: "floor" },
    { kind: "floor_wood_post", minAreaM2: 18, mount: "floor" }
  ]),
  // F1.15 (2026-05-30) — dining rooms ≥ 10 m² get a pendant_cluster
  // centerpiece (typically above the dining table); smaller rooms drop
  // back to a single pendant; tiny ones get a downlight.
  "dining-room": A("dining-room", [
    { kind: "pendant_cluster", minAreaM2: 10 },
    { kind: "pendant", minAreaM2: 6 },
    { kind: "downlight", minAreaM2: 0 }
  ]),
  // F1.15 (2026-05-30) — kitchens ≥ 12 m² get a pendant_cluster (above
  // the island when present); smaller kitchens stay on linear_led which
  // is the task-light staple over a single run; tiny ones get a
  // downlight.
  "kitchen": A("kitchen", [
    { kind: "pendant_cluster", minAreaM2: 12 },
    { kind: "linear_led", minAreaM2: 8 },
    { kind: "downlight", minAreaM2: 0 },
    // §FLOOR-LAMPS-MORE-ROOMS (founder 2026-06-19) — an accent floor lamp in a
    // corner of a LARGER kitchen (the engine seats it clear of the run/counters).
    { kind: "floor_wood_post", minAreaM2: 14, mount: "floor" }
  ]),
  // Private / bedroom — softer pendant.
  // §MORE-LIGHTING (#11) — + a corner floor lamp (a reading standard lamp in the
  // far corner) so the bedroom has ambient + accent light beyond the ceiling
  // fixture (the bedside reading lamps are placed by the FURNITURE engine).
  "bedroom": A("bedroom", [
    { kind: "pendant_conical", minAreaM2: 14 },
    { kind: "pendant", minAreaM2: 9 },
    { kind: "downlight", minAreaM2: 0 },
    { kind: "floor_tripod_black", minAreaM2: 10, mount: "floor" }
  ]),
  // Service rooms — utilitarian downlight only.
  // Bathroom: ambient ceiling downlight + vanity mirror task light (F1.5',
  // 2026-05-30). The mirror_light is mount: 'wall' — emitted IN ADDITION
  // to the first-fit ceiling pick rather than instead of it (see types.ts
  // §LightingArchetype contract).
  "bathroom": A("bathroom", [
    { kind: "downlight", minAreaM2: 0 },
    { kind: "mirror_light", minAreaM2: 0, mount: "wall" }
  ]),
  "utility-room": A("utility-room", [{ kind: "downlight", minAreaM2: 0 }]),
  // F3.9 (2026-05-30) — corridors of any usable length read better with a
  // continuous linear_led ceiling strip than a centroid downlight; the
  // strip suggests circulation directionally. ≥ 3 m² is a soft threshold
  // (a 0.8 m × 4 m corridor = 3.2 m²); below that the room is too tight
  // for a strip and a downlight does the job.
  "corridor": A("corridor", [
    { kind: "linear_led", minAreaM2: 3 },
    { kind: "downlight", minAreaM2: 0 }
  ]),
  // Reception + office.
  "entrance-lobby": A("entrance-lobby", [
    { kind: "pendant_pebble", minAreaM2: 6 },
    { kind: "downlight", minAreaM2: 0 },
    // §FLOOR-LAMPS-MORE-ROOMS — a welcoming floor lamp in the hall corner.
    { kind: "floor_tripod_black", minAreaM2: 5, mount: "floor" }
  ]),
  "private-office": A("private-office", [
    { kind: "pendant", minAreaM2: 12 },
    { kind: "downlight", minAreaM2: 0 },
    // §FLOOR-LAMPS-MORE-ROOMS — an arc reading lamp in the study corner.
    { kind: "floor_arc_brass", minAreaM2: 7, mount: "floor" }
  ])
};
function archetypeForLighting(occupancy) {
  return LIGHTING_ARCHETYPES[occupancy];
}

const DEFAULT_CEILING_H = 2.7;
const WALL_FIXTURE_Y = 1.8;
const CEIL_AREA_PER_LIGHT_M2 = 12;
const CEIL_MAX_LIGHTS = 6;
const CEIL_WALL_INSET_M = 0.6;
const FLOOR_LAMP_INSET = 0.45;
function cornerSeats(input) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of input.polygon) {
    x0 = Math.min(x0, p.x);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    z1 = Math.max(z1, p.z);
  }
  const i = FLOOR_LAMP_INSET;
  const corners = [
    { x: x0 + i, z: z0 + i },
    { x: x1 - i, z: z0 + i },
    { x: x1 - i, z: z1 - i },
    { x: x0 + i, z: z1 - i }
  ];
  const cx = input.centroid.x, cz = input.centroid.z;
  const d2 = (p) => (p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz);
  return [...corners].sort((a, b) => d2(b) - d2(a) || a.x - b.x || a.z - b.z);
}
function pointInPoly(px, pz, poly) {
  return pointInPolygonXZ(px, pz, poly);
}
function ceilingGridSeats(polygon, centroid, areaM2) {
  const n = Math.max(1, Math.min(CEIL_MAX_LIGHTS, Math.round(areaM2 / CEIL_AREA_PER_LIGHT_M2)));
  if (n <= 1) return [centroid];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of polygon) {
    x0 = Math.min(x0, p.x);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    z1 = Math.max(z1, p.z);
  }
  const ix0 = x0 + CEIL_WALL_INSET_M, ix1 = x1 - CEIL_WALL_INSET_M;
  const iz0 = z0 + CEIL_WALL_INSET_M, iz1 = z1 - CEIL_WALL_INSET_M;
  if (ix1 <= ix0 || iz1 <= iz0) return [centroid];
  const aspect = (ix1 - ix0) / Math.max(1e-6, iz1 - iz0);
  const rows = Math.max(1, Math.round(Math.sqrt(n / Math.max(1e-6, aspect))));
  const cols = Math.max(1, Math.ceil(n / rows));
  const seats = [];
  for (let r = 0; r < rows && seats.length < n; r++) {
    for (let c = 0; c < cols && seats.length < n; c++) {
      const x = cols === 1 ? (ix0 + ix1) / 2 : ix0 + (c + 0.5) / cols * (ix1 - ix0);
      const z = rows === 1 ? (iz0 + iz1) / 2 : iz0 + (r + 0.5) / rows * (iz1 - iz0);
      if (pointInPoly(x, z, polygon)) seats.push({ x, z });
    }
  }
  return seats.length > 0 ? seats : [centroid];
}
function lightRoom(input) {
  const arch = archetypeForLighting(input.occupancy);
  if (!arch || arch.items.length === 0) return [];
  const ceilY = typeof input.ceilingY === "number" ? input.ceilingY : input.levelElevation + DEFAULT_CEILING_H;
  const out = [];
  const ceilingItem = arch.items.find(
    (it) => (it.mount ?? "ceiling") === "ceiling" && input.areaM2 >= it.minAreaM2
  );
  if (ceilingItem) {
    for (const seat of ceilingGridSeats(input.polygon, input.centroid, input.areaM2)) {
      out.push({
        kind: ceilingItem.kind,
        origin: { x: seat.x, y: ceilY, z: seat.z },
        roomId: input.roomId,
        ceilingMounted: true
      });
    }
  }
  const wallY = input.levelElevation + WALL_FIXTURE_Y;
  for (const it of arch.items) {
    if (it.mount !== "wall") continue;
    if (input.areaM2 < it.minAreaM2) continue;
    out.push({
      kind: it.kind,
      origin: { x: input.centroid.x, y: wallY, z: input.centroid.z },
      roomId: input.roomId,
      ceilingMounted: false
    });
  }
  const seats = cornerSeats(input);
  let seatIx = 0;
  for (const it of arch.items) {
    if (it.mount !== "floor") continue;
    if (input.areaM2 < it.minAreaM2) continue;
    const n = it.count ?? 1;
    for (let k = 0; k < n; k++) {
      const seat = seats[seatIx % Math.max(1, seats.length)] ?? input.centroid;
      seatIx++;
      out.push({
        kind: it.kind,
        origin: { x: seat.x, y: input.levelElevation, z: seat.z },
        roomId: input.roomId,
        ceilingMounted: false
      });
    }
  }
  return out;
}

function resolveLightingBasis(outcome) {
  if (outcome === void 0) {
    return {
      basis: "unfurnished",
      disclosure: "Furnish outcome unknown — no furnish report was available when lighting ran. Lighting was computed without furniture; the floor may be unfurnished."
    };
  }
  if (outcome.state === "dropped") {
    return {
      basis: "unfurnished",
      disclosure: `Furnish stage DROPPED — ${outcome.reason}. Lighting was computed on an UNFURNISHED floor. The furnish stage never completed; this is not the same as "furnished with zero items".`
    };
  }
  if (outcome.placedCount === 0) {
    return {
      basis: "furnished",
      disclosure: `Furnish completed with 0 items placed` + (typeof outcome.roomCount === "number" ? ` across ${outcome.roomCount} room(s)` : "") + " — the engine reported zero items appropriate. Lighting was computed on that reported floor."
    };
  }
  return { basis: "furnished", disclosure: null };
}

function toSchemaLightingKind(kind) {
  switch (kind) {
    case "downlight":
      return "downlight";
    case "pendant":
    case "pendant_pebble":
    case "pendant_ceramic_bell":
    case "pendant_conical":
    case "pendant_cluster":
      return "pendant";
    case "linear_led":
      return "strip";
    case "mirror_light":
      return "wall-sconce";
    // Floor / table lamps have no dedicated schema kind and the geometry
    // renderer can't produce them; fall back to a downlight so the room is
    // still lit rather than silently dropped.
    case "floor_wood_post":
    case "floor_arc_brass":
    case "floor_tripod_black":
    case "table_terracotta":
      return "downlight";
    default:
      return "downlight";
  }
}
const round6$1 = (n) => Math.round(n * 1e6) / 1e6;
function buildLightingCommands(placed, levelId, mintId, furnishOutcome) {
  const commands = [];
  const ids = [];
  const warnings = [];
  for (const p of placed) {
    if (!Number.isFinite(p.origin.x) || !Number.isFinite(p.origin.y) || !Number.isFinite(p.origin.z)) {
      warnings.push(`${p.kind} skipped — non-finite origin`);
      continue;
    }
    const id = mintId("lighting");
    ids.push(id);
    commands.push({
      command: "lighting.create",
      payload: {
        id,
        // §FIX-LIGHTING-KIND-ENUM — map the rich archetype kind → a
        // schema-valid base so the fixture validates + renders (was
        // dropped with LightingSchemaError → dark rooms).
        kind: toSchemaLightingKind(p.kind),
        origin: { x: round6$1(p.origin.x), y: round6$1(p.origin.y), z: round6$1(p.origin.z) },
        levelId
      }
    });
  }
  const { basis, disclosure } = resolveLightingBasis(furnishOutcome);
  return {
    levelId,
    commands,
    ids,
    totalElementCount: commands.length,
    warnings,
    basis,
    basisDisclosure: disclosure
  };
}

function polyAreaXZ(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s * 0.5);
}
function ceilingForRoom(input) {
  const arch = archetypeForCeiling(input.occupancy);
  if (!arch) return null;
  if (input.polygon.length < 3) return null;
  if (polyAreaXZ(input.polygon) < 0.05) return null;
  const ceilingHeightM = input.ceilingHeightM ?? arch.ceilingHeightM;
  const thicknessM = input.thicknessM ?? arch.thicknessM;
  const ceilY = input.levelElevation + ceilingHeightM;
  const boundary = input.polygon.map((p) => ({
    x: p.x,
    y: ceilY,
    z: p.z
  }));
  return {
    roomId: input.roomId,
    levelId: input.levelId,
    boundary,
    ceilingHeightM,
    thicknessM,
    materialColor: arch.materialColor,
    ...arch.materialId ? { materialId: arch.materialId } : {}
  };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
function buildCeilingCommands(placed, levelId, mintId) {
  const warnings = [];
  const ids = [];
  const entries = [];
  for (const p of placed) {
    if (p.boundary.length < 3) {
      warnings.push(`room "${p.roomId}" skipped — boundary < 3 points`);
      continue;
    }
    let area2 = 0;
    for (let i = 0; i < p.boundary.length; i++) {
      const a = p.boundary[i], b = p.boundary[(i + 1) % p.boundary.length];
      area2 += a.x * b.z - b.x * a.z;
    }
    if (Math.abs(area2) / 2 < 0.05) {
      warnings.push(`room "${p.roomId}" skipped — degenerate boundary (area ${(Math.abs(area2) / 2).toFixed(4)} m² < 0.05)`);
      continue;
    }
    if (!Number.isFinite(p.ceilingHeightM) || p.ceilingHeightM <= 0) {
      warnings.push(`room "${p.roomId}" skipped — invalid ceilingHeight`);
      continue;
    }
    if (!Number.isFinite(p.thicknessM) || p.thicknessM <= 0 || p.thicknessM >= p.ceilingHeightM) {
      warnings.push(`room "${p.roomId}" skipped — invalid thickness vs ceilingHeight`);
      continue;
    }
    const id = mintId("ceiling");
    ids.push(id);
    entries.push({
      id,
      levelId: p.levelId || levelId,
      boundary: p.boundary.map((v) => ({ x: round6(v.x), y: round6(v.y), z: round6(v.z) })),
      ceilingHeight: round6(p.ceilingHeightM),
      thickness: round6(p.thicknessM),
      materialColor: p.materialColor,
      ...p.materialId ? { materialId: p.materialId } : {}
    });
  }
  const commands = entries.length > 0 ? [{ command: "ceiling.batch.create", payload: { ceilings: entries, levelId } }] : [];
  return { levelId, commands, ids, totalElementCount: entries.length, warnings };
}

const DEG = Math.PI / 180;
const DEFAULT_GRID_SPACING_M = 0.5;
const DEFAULT_SAMPLE_HEIGHT_M = 0;
const DEFAULT_MAX_SAMPLE_POINTS = 4e3;
const DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE = 2.5;
const DEFAULT_DIFFUSE_SKY_WEIGHT = 0.18;
function sub2(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}
function dot2(a, b) {
  return a.x * b.x + a.z * b.z;
}
function len2(a) {
  return Math.hypot(a.x, a.z);
}
function bbox(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}
function pointInPolygon(p, poly) {
  return pointInPolygonXZ(p.x, p.z, poly);
}
function sunDirection(azimuthDeg, elevationDeg) {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  const ce = Math.cos(el);
  return {
    x: Math.sin(az) * ce,
    y: Math.sin(el),
    z: -Math.cos(az) * ce
  };
}
function defaultSunSamples(latitudeDeg) {
  const lat = Number.isFinite(latitudeDeg) ? latitudeDeg : 51.5;
  const north = lat >= 0;
  const noonAz = north ? 180 : 0;
  const eastAz = (noonAz - 45 + 360) % 360;
  const westAz = (noonAz + 45) % 360;
  const decls = [
    { d: 23.44, w: 1, tag: "summer" },
    { d: 0, w: 1.5, tag: "equinox" },
    // equinox weighted higher (representative)
    { d: -23.44, w: 0.8, tag: "winter" }
  ];
  const noonElev = (decl) => 90 - Math.abs(lat - decl);
  const out = [];
  for (const { d, w, tag } of decls) {
    const en = noonElev(d);
    const eFlank = Math.max(0, en * 0.6);
    out.push({ azimuthDeg: eastAz, elevationDeg: eFlank, weight: 0.7 * w, label: `${tag} AM` });
    out.push({ azimuthDeg: noonAz, elevationDeg: en, weight: 1 * w, label: `${tag} noon` });
    out.push({ azimuthDeg: westAz, elevationDeg: eFlank, weight: 0.7 * w, label: `${tag} PM` });
  }
  return out;
}
function prepAperture(w) {
  const d = sub2(w.b, w.a);
  const L = len2(d);
  if (L < EPSILON_ZERO) return null;
  const dir = { x: d.x / L, z: d.z / L };
  const nLen = len2(w.outwardNormal);
  if (nLen < EPSILON_ZERO) return null;
  const outward = { x: w.outwardNormal.x / nLen, z: w.outwardNormal.z / nLen };
  const heightM = w.headM - w.sillM;
  if (heightM <= EPSILON_ZERO) return null;
  return {
    a: { x: w.a.x, z: w.a.z },
    dir,
    len: L,
    outward,
    sillM: w.sillM,
    headM: w.headM,
    heightM,
    area: L * heightM,
    midH: (w.sillM + w.headM) / 2
  };
}
function apertureContribution(P, pY, sun, ap, poly) {
  const sunHoriz = { x: sun.x, z: sun.z };
  const facing = dot2(sunHoriz, ap.outward);
  if (facing <= EPSILON_ZERO) return 0;
  const toPlane = dot2(sub2(ap.a, P), ap.outward);
  const denom = facing;
  const s = toPlane / denom;
  if (s <= EPSILON_ZERO) return 0;
  const hx = P.x + s * sun.x;
  const hz = P.z + s * sun.z;
  const hy = pY + s * sun.y;
  const along = (hx - ap.a.x) * ap.dir.x + (hz - ap.a.z) * ap.dir.z;
  if (along < -EPSILON_ZERO || along > ap.len + EPSILON_ZERO) return 0;
  if (hy < ap.sillM - EPSILON_ZERO || hy > ap.headM + EPSILON_ZERO) return 0;
  const mid = { x: (P.x + hx) / 2, z: (P.z + hz) / 2 };
  if (!pointInPolygon(mid, poly)) return 0;
  const dx = hx - P.x, dz = hz - P.z, dy = hy - pY;
  const dist2 = dx * dx + dy * dy + dz * dz;
  if (dist2 < EPSILON_ZERO) return 0;
  const solidAngle = ap.area * facing / (Math.PI * dist2);
  const floorCos = sun.y;
  if (floorCos <= EPSILON_ZERO) return 0;
  return solidAngle * floorCos;
}
function diffuseContribution(P, ap, poly) {
  const cx = ap.a.x + ap.dir.x * (ap.len / 2);
  const cz = ap.a.z + ap.dir.z * (ap.len / 2);
  const toC = { x: cx - P.x, z: cz - P.z };
  if (dot2(toC, ap.outward) <= EPSILON_ZERO) return 0;
  const mid = { x: (P.x + cx) / 2, z: (P.z + cz) / 2 };
  if (!pointInPolygon(mid, poly)) return 0;
  const dx = cx - P.x, dz = cz - P.z, dy = ap.midH;
  const dist2 = dx * dx + dy * dy + dz * dz;
  if (dist2 < EPSILON_ZERO) return 0;
  return ap.area / (Math.PI * dist2);
}
function computeRoomDaylight(input, sunSamples, opts = {}) {
  const spacing = opts.gridSpacingM ?? DEFAULT_GRID_SPACING_M;
  const sampleH = opts.sampleHeightM ?? DEFAULT_SAMPLE_HEIGHT_M;
  const fullRaw = opts.fullDaylightRawPerSample ?? DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE;
  const maxPts = opts.maxSamplePoints ?? DEFAULT_MAX_SAMPLE_POINTS;
  const diffuseW = opts.diffuseSkyWeight ?? DEFAULT_DIFFUSE_SKY_WEIGHT;
  const pYrel = sampleH;
  const poly = input.polygon;
  const apertures = input.windows.map(prepAperture).filter((g) => g !== null);
  if (poly.length < 3) {
    return emptyResult(input, 0);
  }
  const { minX, maxX, minZ, maxZ } = bbox(poly);
  const spanX = Math.max(0, maxX - minX);
  const spanZ = Math.max(0, maxZ - minZ);
  let step = spacing > EPSILON_ZERO ? spacing : DEFAULT_GRID_SPACING_M;
  let nx = Math.floor(spanX / step) + 1;
  let nz = Math.floor(spanZ / step) + 1;
  while (nx * nz > maxPts && step < 100) {
    step *= 1.5;
    nx = Math.floor(spanX / step) + 1;
    nz = Math.floor(spanZ / step) + 1;
  }
  const startX = minX + (spanX - step * (nx - 1)) / 2;
  const startZ = minZ + (spanZ - step * (nz - 1)) / 2;
  const points = [];
  for (let iz = 0; iz < nz; iz++) {
    const z = startZ + iz * step;
    for (let ix = 0; ix < nx; ix++) {
      const x = startX + ix * step;
      const p = { x, z };
      if (pointInPolygon(p, poly)) points.push(p);
    }
  }
  if (points.length === 0) {
    points.push(centroidOf(poly));
  }
  let aboveHorizonWeight = 0;
  for (const s of sunSamples) {
    if ((s.elevationDeg ?? 0) > 0) aboveHorizonWeight += Math.max(0, s.weight ?? 1);
  }
  const perWindowRaw = new Array(apertures.length).fill(0);
  let raw = 0;
  let litTests = 0;
  let totalTests = 0;
  for (const P of points) {
    for (const s of sunSamples) {
      if ((s.elevationDeg ?? 0) <= 0) continue;
      const w = s.weight ?? 1;
      if (w <= 0) continue;
      const dir = sunDirection(s.azimuthDeg, s.elevationDeg);
      totalTests++;
      let litThisTest = false;
      for (let wi = 0; wi < apertures.length; wi++) {
        const c = apertureContribution(P, pYrel, dir, apertures[wi], poly);
        if (c > 0) {
          const weighted = c * w;
          raw += weighted;
          perWindowRaw[wi] += weighted;
          litThisTest = true;
        }
      }
      if (litThisTest) litTests++;
    }
    if (diffuseW > 0 && aboveHorizonWeight > 0) {
      for (let wi = 0; wi < apertures.length; wi++) {
        const d = diffuseContribution(P, apertures[wi], poly);
        if (d > 0) {
          const weighted = d * diffuseW * aboveHorizonWeight;
          raw += weighted;
          perWindowRaw[wi] += weighted;
        }
      }
    }
  }
  const sampleCount = points.length;
  const rawPerSample = sampleCount > 0 ? raw / sampleCount : 0;
  const score = clamp01(rawPerSample / (fullRaw > EPSILON_ZERO ? fullRaw : DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE));
  const sunlitFraction = totalTests > 0 ? litTests / totalTests : 0;
  const windows = apertures.map((_, wi) => ({
    windowIndex: wi,
    label: input.windows[wi]?.label,
    raw: perWindowRaw[wi],
    fraction: raw > EPSILON_ZERO ? perWindowRaw[wi] / raw : 0
  })).sort((p, q) => q.raw - p.raw);
  return {
    roomId: input.roomId,
    name: input.name,
    roomType: input.roomType,
    score,
    raw,
    sampleCount,
    sunlitFraction,
    windows
  };
}
function computeBuildingDaylight(rooms, sunSamples, opts = {}) {
  const results = rooms.map((r) => computeRoomDaylight(r, sunSamples, opts));
  const sorted = results.slice().sort((a, b) => b.score - a.score);
  const meanScore = sorted.length > 0 ? sorted.reduce((acc, r) => acc + r.score, 0) / sorted.length : 0;
  return {
    rooms: sorted,
    meanScore,
    brightestRoomId: sorted.length > 0 ? sorted[0].roomId : void 0,
    darkestRoomId: sorted.length > 0 ? sorted[sorted.length - 1].roomId : void 0
  };
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function centroidOf(poly) {
  let cx = 0, cz = 0, A = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cr = p.x * q.z - q.x * p.z;
    A += cr;
    cx += (p.x + q.x) * cr;
    cz += (p.z + q.z) * cr;
  }
  A *= 0.5;
  if (Math.abs(A) < EPSILON_ZERO) {
    let sx = 0, sz = 0;
    for (const p of poly) {
      sx += p.x;
      sz += p.z;
    }
    return { x: sx / poly.length, z: sz / poly.length };
  }
  return { x: cx / (6 * A), z: cz / (6 * A) };
}
function emptyResult(input, score) {
  return {
    roomId: input.roomId,
    name: input.name,
    roomType: input.roomType,
    score,
    raw: 0,
    sampleCount: 0,
    sunlitFraction: 0,
    windows: []
  };
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function roomDims(minArea_m2, gridSize) {
  const cells = Math.ceil(minArea_m2 / (gridSize * gridSize));
  const w = Math.ceil(Math.sqrt(cells));
  const d = Math.ceil(cells / w);
  return { w, d };
}
function rectDistance(c1, r1, w1, d1, c2, r2, w2, d2) {
  const xOverlap = Math.max(0, Math.min(c1 + w1, c2 + w2) - Math.max(c1, c2));
  const yOverlap = Math.max(0, Math.min(r1 + d1, r2 + d2) - Math.max(r1, r2));
  if (xOverlap > 0 && yOverlap > 0) return 0;
  const xDist = xOverlap > 0 ? 0 : Math.max(c1, c2) - Math.min(c1 + w1, c2 + w2);
  const yDist = yOverlap > 0 ? 0 : Math.max(r1, r2) - Math.min(r1 + d1, r2 + d2);
  return xDist + yDist;
}
function areAdjacent(c1, r1, w1, d1, c2, r2, w2, d2) {
  return rectDistance(c1, r1, w1, d1, c2, r2, w2, d2) <= 1;
}
const ROOM_COLOURS = {
  "bed": "#AED9E0",
  "bedroom": "#AED9E0",
  "patient": "#AED9E0",
  "hdu": "#AED9E0",
  "staff": "#FAD7A0",
  "office": "#FAD7A0",
  "utility": "#D5DBDB",
  "clean": "#D5DBDB",
  "dirty": "#BFC9CA",
  "wc": "#A9CCE3",
  "toilet": "#A9CCE3",
  "bathroom": "#A9CCE3",
  "treatment": "#A8D8A8",
  "clinic": "#A8D8A8",
  "corridor": "#F9E79F",
  "circulation": "#F9E79F",
  "meeting": "#E8DAEF",
  "reception": "#FDEBD0",
  "storage": "#E5E8E8",
  "plant": "#D5D8DC"
};
function roomColour(roomType) {
  const key = roomType.toLowerCase();
  for (const [k, v] of Object.entries(ROOM_COLOURS)) {
    if (key.includes(k)) return v;
  }
  return "#D6EAF8";
}
function overlaps(a, col, row, w, d) {
  return !(col + w <= a.col || col >= a.col + a.w || row + d <= a.row || row >= a.row + a.d);
}
function isValidPlacement(placed, col, row, w, d, gridW, gridH) {
  if (col < 0 || row < 0 || col + w > gridW || row + d > gridH) return false;
  return !placed.some((p) => overlaps(p, col, row, w, d));
}
function scorePosition(placed, idToSpec, spec, col, row) {
  let cost = 0;
  const adjReqs = spec.briefRoom.adjacencyRequirements;
  if (adjReqs.length === 0) return 0;
  for (const p of placed) {
    const pSpec = idToSpec.get(p.id);
    if (!pSpec) continue;
    const pType = pSpec.briefRoom.roomType.toLowerCase();
    const isRequired = adjReqs.some((req) => pType.includes(req.toLowerCase()) || req.toLowerCase().includes(pType));
    if (isRequired) {
      cost -= 1e3;
    }
    const dist = rectDistance(col, row, spec.w, spec.d, p.col, p.row, p.w, p.d);
    cost += dist;
  }
  return cost;
}
function tryPlaceAll(specs, gridW, gridH, anchorIndex, rng) {
  const placed = [];
  const idToSpec = new Map(specs.map((s) => [s.id, s]));
  const anchor = specs[anchorIndex];
  const anchorCol = Math.floor((gridW - anchor.w) / 2);
  const anchorRow = Math.floor((gridH - anchor.d) / 2);
  if (!isValidPlacement(placed, anchorCol, anchorRow, anchor.w, anchor.d, gridW, gridH)) {
    return null;
  }
  placed.push({ id: anchor.id, col: anchorCol, row: anchorRow, w: anchor.w, d: anchor.d });
  const remaining = specs.filter((_, i) => i !== anchorIndex);
  for (const spec of remaining) {
    const candidates = [];
    for (let c = 0; c <= gridW - spec.w; c++) {
      for (let r = 0; r <= gridH - spec.d; r++) {
        if (!isValidPlacement(placed, c, r, spec.w, spec.d, gridW, gridH)) continue;
        const isAdj = placed.some((p) => areAdjacent(c, r, spec.w, spec.d, p.col, p.row, p.w, p.d));
        if (!isAdj && placed.length > 0) continue;
        const score = scorePosition(placed, idToSpec, spec, c, r);
        candidates.push({ col: c, row: r, score });
      }
    }
    if (candidates.length === 0) {
      for (let c = 0; c <= gridW - spec.w; c++) {
        for (let r = 0; r <= gridH - spec.d; r++) {
          if (!isValidPlacement(placed, c, r, spec.w, spec.d, gridW, gridH)) continue;
          const score = scorePosition(placed, idToSpec, spec, c, r);
          candidates.push({ col: c, row: r, score });
        }
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score || rng() - 0.5);
    const best = candidates[0];
    placed.push({ id: spec.id, col: best.col, row: best.row, w: spec.w, d: spec.d });
  }
  return placed;
}
function scoreAdjacency(rooms, brief) {
  const results = [];
  let satisfied = 0;
  let total = 0;
  for (const room of rooms) {
    const briefRoom = brief.rooms.find((br) => br.roomType === room.briefRoomType);
    if (!briefRoom || briefRoom.adjacencyRequirements.length === 0) continue;
    for (const req of briefRoom.adjacencyRequirements) {
      total++;
      const neighbour = rooms.find(
        (r) => r.id !== room.id && r.briefRoomType.toLowerCase().includes(req.toLowerCase()) && areAdjacent(
          room.gridCol,
          room.gridRow,
          room.widthCells,
          room.depthCells,
          r.gridCol,
          r.gridRow,
          r.widthCells,
          r.depthCells
        )
      );
      const ok = !!neighbour;
      if (ok) satisfied++;
      results.push({
        roomId: room.id,
        requiredType: req,
        satisfied: ok,
        ...neighbour ? { neighbourId: neighbour.id } : {}
      });
    }
  }
  return { results, score: total === 0 ? 100 : Math.round(satisfied / total * 100) };
}
function scoreCirculation(rooms, boundingBox) {
  const totalArea = rooms.reduce((s, r) => s + r.area_m2, 0);
  const bboxArea = boundingBox.width_m * boundingBox.depth_m;
  if (bboxArea === 0) return 0;
  const ratio = totalArea / bboxArea;
  const efficiency = 1 - Math.abs(ratio - 0.7) * 2;
  return Math.max(0, Math.min(100, Math.round(efficiency * 100)));
}
class LayoutGenerator {
  /**
   * Generate up to 10 layout variants for the given brief.
   * Each variant is deterministic for its seed (0–9).
   * Never reads from the global store — pure function.
   */
  async generate(brief) {
    const { boundingBox, gridSize_m = 1, maxVariants = 10 } = brief;
    const gridW = Math.floor(boundingBox.width_m / gridSize_m);
    const gridH = Math.floor(boundingBox.depth_m / gridSize_m);
    const allSpecs = [];
    for (const br of brief.rooms) {
      const { w, d } = roomDims(br.minArea_m2, gridSize_m);
      for (let i = 0; i < br.count; i++) {
        allSpecs.push({
          id: `gen-${br.roomType.replace(/\s+/g, "-").toLowerCase()}-${i}`,
          briefRoom: br,
          instanceIndex: i,
          w,
          d
        });
      }
    }
    const byConnectivity = [...allSpecs].sort(
      (a, b) => b.briefRoom.adjacencyRequirements.length - a.briefRoom.adjacencyRequirements.length
    );
    const layouts = [];
    const maxSeeds = Math.min(maxVariants, 10);
    for (let seed = 0; seed < maxSeeds; seed++) {
      const rng = mulberry32(seed * 7919 + 31337);
      const anchorCandidates = byConnectivity.slice(0, Math.min(3, byConnectivity.length));
      const anchorSpec = anchorCandidates[seed % anchorCandidates.length];
      const shuffled = [...allSpecs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const shuffledAnchorIdx = shuffled.findIndex((s) => s.id === anchorSpec.id);
      const placed = tryPlaceAll(shuffled, gridW, gridH, shuffledAnchorIdx, rng);
      if (!placed) continue;
      const generatedRooms = placed.map((p) => {
        const spec = shuffled.find((s) => s.id === p.id);
        const name = spec.briefRoom.count > 1 ? `${spec.briefRoom.roomType} ${spec.instanceIndex + 1}` : spec.briefRoom.roomType;
        return {
          id: p.id,
          name,
          roomType: spec.briefRoom.roomType,
          ...spec.briefRoom.templateId !== void 0 ? { templateId: spec.briefRoom.templateId } : {},
          briefRoomType: spec.briefRoom.roomType,
          gridCol: p.col,
          gridRow: p.row,
          widthCells: p.w,
          depthCells: p.d,
          x_m: p.col * gridSize_m,
          z_m: p.row * gridSize_m,
          width_m: p.w * gridSize_m,
          depth_m: p.d * gridSize_m,
          area_m2: p.w * p.d * (gridSize_m * gridSize_m)
        };
      });
      const totalGIA = generatedRooms.reduce((s, r) => s + r.area_m2, 0);
      const violations = constraintEngine.validateLayout(generatedRooms);
      const complianceScore = violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 15);
      const { results: adjResults, score: adjScore } = scoreAdjacency(generatedRooms, brief);
      const circScore = scoreCirculation(generatedRooms, boundingBox);
      const total = Math.round(complianceScore * 0.4 + circScore * 0.3 + adjScore * 0.3);
      layouts.push({
        variantIndex: seed,
        seed,
        rooms: generatedRooms,
        score: {
          total,
          compliance: complianceScore,
          circulation: circScore,
          adjacency: adjScore
        },
        adjacencyResults: adjResults,
        totalGIA_m2: totalGIA,
        complianceViolations: violations,
        boundingBox,
        isCompliant: violations.length === 0
      });
    }
    layouts.sort((a, b) => b.score.total - a.score.total);
    return layouts;
  }
}
const layoutGenerator = new LayoutGenerator();

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const VALID_ELEMENT_TYPES = /* @__PURE__ */ new Set([
  "wall",
  "slab",
  "floor",
  "column",
  "beam",
  "door",
  "window",
  "roof",
  "stair",
  "stairs",
  "railing",
  "ceiling",
  "furniture",
  "curtainwall",
  "curtain-wall",
  "opening",
  "room"
]);
class AIResponseParser {
  /**
   * Phase 3.3 — Actionable Logs
   *
   * Extracts element IDs (UUIDs) from the QueryResult that the AI referenced.
   * Uses `result.elements` first (typed references), then scans `result.answer`
   * text for UUID patterns as fallback.
   *
   * Returns de-duplicated UUID array.
   */
  static extractElementRefs(result) {
    const seen = /* @__PURE__ */ new Set();
    const ids = [];
    if (result.elements && Array.isArray(result.elements)) {
      result.elements.forEach((el) => {
        if (el.id && !seen.has(el.id)) {
          seen.add(el.id);
          ids.push(el.id);
        }
      });
    }
    if (result.answer) {
      const matches = result.answer.match(UUID_PATTERN) ?? [];
      matches.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      });
    }
    return ids;
  }
  /**
   * Phase 3.3 — Actionable Logs
   *
   * Returns element IDs that currently exist in the scene / stores.
   * Filters the refs from extractElementRefs by checking known stores.
   */
  static filterExistingElements(ids) {
    if (ids.length === 0) return [];
    const stores = [
      "wallStore",
      "slabStore",
      "doorStore",
      "windowStore",
      "columnStore",
      "furnitureStore",
      "roofStore",
      "stairStore",
      "curtainWallStore",
      "beamStore",
      "ceilingStore",
      "floorStore"
    ];
    const existingIds = /* @__PURE__ */ new Set();
    for (const storeName of stores) {
      const store = window[storeName];
      if (store?.getAll) {
        try {
          store.getAll().forEach((el) => {
            if (el.id) existingIds.add(el.id);
          });
        } catch {
        }
      }
    }
    return ids.filter((id) => existingIds.has(id));
  }
  /**
   * Phase 3.1 — Ghost Preview
   *
   * Scans `result.answer` for a JSON code block containing a `proposal` object
   * with an `elements` array conforming to ElementSchema.
   *
   * Looks for patterns like:
   * ```json
   * { "proposal": { "elements": [...] } }
   * ```
   * or top-level `{ "elements": [...] }` inside a code fence.
   *
   * Returns validated ElementSchema[] or empty array if none found / invalid.
   */
  static extractGhostProposal(result) {
    if (!result.answer) return [];
    const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g;
    let match;
    while ((match = fencePattern.exec(result.answer)) !== null) {
      const raw = (match[1] ?? "").trim();
      const schemas = this._tryParseElementSchemas(raw);
      if (schemas.length > 0) return schemas;
    }
    const braceStart = result.answer.indexOf("{");
    if (braceStart >= 0) {
      const candidate = result.answer.slice(braceStart);
      const schemas = this._tryParseElementSchemas(candidate);
      if (schemas.length > 0) return schemas;
    }
    return [];
  }
  // ── Internal helpers ─────────────────────────────────────────────────────
  static _tryParseElementSchemas(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const els = parsed?.proposal?.elements ?? parsed?.elements;
    if (!Array.isArray(els)) return [];
    const valid = [];
    for (const el of els) {
      const schema = this._validateElementSchema(el);
      if (schema) valid.push(schema);
    }
    return valid;
  }
  static _validateElementSchema(el) {
    if (!el || typeof el !== "object") return null;
    const type = (el.type ?? el.elementType ?? "").toLowerCase();
    const levelId = el.levelId ?? el.level_id;
    const id = el.id ?? crypto.randomUUID();
    if (!type || !VALID_ELEMENT_TYPES.has(type)) {
      console.warn("[AIResponseParser] Rejected element: invalid type", type);
      return null;
    }
    if (!levelId || typeof levelId !== "string") {
      console.warn("[AIResponseParser] Rejected element: missing levelId", el);
      return null;
    }
    const placement = el.placement ?? {};
    const parameters = el.parameters ?? {};
    const metadata = el.metadata ?? {};
    return { id, type, levelId, placement, parameters, metadata };
  }
}

class AIQuotaExceededError extends Error {
  feature;
  constructor(feature = Feature.AI_ELEMENT_CREATOR) {
    super("[AIElementFactory] AI quota exceeded for current billing period.");
    this.name = "AIQuotaExceededError";
    this.feature = feature;
  }
}
const SYSTEM_PROMPT = `You are a BIM element geometry generator for a THREE.js renderer. Output ONLY valid JSON. No markdown, no code fences, no explanation.

══════════════════════════════════════════════════════════════
STEP 1 — ANALYSE THE IMAGE FIRST
══════════════════════════════════════════════════════════════
Identify: base type, pole/leg count, shade type (globe/drum/cone/bowl), materials, proportions.

══════════════════════════════════════════════════════════════
SCHEMA
══════════════════════════════════════════════════════════════
{
  "version": "1.0",
  "elementType": "ai_<snake_case>",
  "displayName": "Name",
  "boundingBox": { "w": m, "h": m, "d": m },
  "baseOffset": 0,
  "components": [...],
  "parameters": [...],
  "metadata": { "generatedAt": "<ISO8601>", "prompt": "<prompt>", "aiModel": "claude-sonnet-4-20250514" }
}

AIComponent fields:
  id, label, shape, dimensions, position {x,y,z}, rotation {x,y,z} (DEGREES), material {color,metalness,roughness}

Shapes: box(width,height,depth) | cylinder(radiusBottom,radiusTop?,height,segments) | sphere(radius,segments) | cone(radiusBottom,height,segments) | torus(radius,tube,segments)

══════════════════════════════════════════════════════════════
CRITICAL — COMPONENT ID NAMING (the engine uses IDs for auto-placement)
══════════════════════════════════════════════════════════════
The rendering engine reads component IDs to auto-snap parts into correct positions.
YOU MUST use these exact keyword patterns:

BASE/STRUCTURE IDs must contain one of: leg, pole, base, disc, stand, stem, post, column, bar, strut
  -> These are the STRUCTURAL anchor. The shade snaps to the TOP of the tallest structural component.
  -> Examples: "base_disc", "pole_main", "leg_front_left"

SHADE/GLOBE IDs must contain one of: shade, globe, drum, bowl, diffuser, glass, orb
  -> The engine MOVES this component to sit on top of the structure automatically.
  -> You do NOT need to calculate the correct Y — engine does it. Set position.y = your best guess.
  -> Examples: "globe_shade", "shade_drum", "glass_globe", "bowl_shade"
  -> For a frosted sphere globe: use id = "globe_shade", shape = "sphere"

COLLAR/CUP IDs must contain one of: collar, cup, socket
  -> Small connector piece between pole top and globe bottom.
  -> Engine snaps to globe bottom automatically. Set position.y = 0.
  -> Example: "collar_cup", "socket_neck"

TORUS SHAPES: Only use torus if you can CLEARLY see a ring in the image.
  -> If you use a torus and its ID does NOT contain collar/cup/socket, it will be HIDDEN by the engine.
  -> DO NOT add decorative torus rings that are not visible in the image.

HIDDEN (these IDs are filtered out): cable, cord, wire, plug, switch, deco_ring, decorative

══════════════════════════════════════════════════════════════
GLOBE FLOOR LAMP — USE THIS EXACT STRUCTURE
══════════════════════════════════════════════════════════════
For a lamp with: round flat base + single vertical pole + frosted sphere globe on top:

{
  "components": [
    {
      "id": "base_disc",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.17, "radiusTop": 0.17, "height": 0.04, "segments": 32 },
      "position": { "x": 0, "y": 0.02, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "pole_main",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.012, "radiusTop": 0.012, "height": 1.38, "segments": 16 },
      "position": { "x": 0, "y": 0.73, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "collar_cup",
      "shape": "cylinder",
      "dimensions": { "radiusBottom": 0.028, "radiusTop": 0.022, "height": 0.04, "segments": 16 },
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#b5952a", "metalness": 0.8, "roughness": 0.3 }
    },
    {
      "id": "globe_shade",
      "shape": "sphere",
      "dimensions": { "radius": 0.155, "segments": 32 },
      "position": { "x": 0, "y": 0, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "material": { "color": "#f8f6f0", "metalness": 0.0, "roughness": 0.1, "transparent": true, "opacity": 0.88 }
    }
  ]
}

Adjust dimensions and materials to match the image exactly. Add more detail components as needed.

══════════════════════════════════════════════════════════════
CROSSED-LEG FLOOR LAMP
══════════════════════════════════════════════════════════════
4 legs crossing at ~65% height (y=1.07 for 1.65m lamp), splay 20 degrees:
  leg_front_left:  pos={x:-0.05, y:1.07, z: 0.05}, rot={x: 20, y:0, z:-20}
  leg_front_right: pos={x: 0.05, y:1.07, z: 0.05}, rot={x: 20, y:0, z: 20}
  leg_back_left:   pos={x:-0.05, y:1.07, z:-0.05}, rot={x:-20, y:0, z:-20}
  leg_back_right:  pos={x: 0.05, y:1.07, z:-0.05}, rot={x:-20, y:0, z: 20}
  crossing_joint:  sphere at {x:0, y:1.07, z:0}

══════════════════════════════════════════════════════════════
Y POSITIONING — Y is UP, position.y = CENTRE of component
══════════════════════════════════════════════════════════════
Vertical cylinder from floor: position.y = height / 2
Stacked: pos_N.y = heights_below + own_height / 2
Shade/globe: engine corrects position automatically — set to best guess

══════════════════════════════════════════════════════════════
MATERIALS
══════════════════════════════════════════════════════════════
Brass satin:    { "color": "#b5952a", "metalness": 0.8, "roughness": 0.30 }
Brass polished: { "color": "#c9a84c", "metalness": 0.9, "roughness": 0.10 }
Warm oak:       { "color": "#c8874a", "metalness": 0.0, "roughness": 0.80 }
Dark walnut:    { "color": "#4a2e1a", "metalness": 0.0, "roughness": 0.85 }
Fabric cream:   { "color": "#f0ece0", "metalness": 0.0, "roughness": 1.00 }
Fabric white:   { "color": "#f5f5f0", "metalness": 0.0, "roughness": 1.00 }
Brushed steel:  { "color": "#a8a8a8", "metalness": 0.9, "roughness": 0.30 }
Chrome:         { "color": "#d4d4d4", "metalness": 1.0, "roughness": 0.05 }
Matte black:    { "color": "#1a1a1a", "metalness": 0.7, "roughness": 0.60 }
Opal glass:     { "color": "#f8f6f0", "metalness": 0.0, "roughness": 0.10, "transparent": true, "opacity": 0.88 }
Frosted glass:  { "color": "#f0f0f0", "metalness": 0.0, "roughness": 0.05, "transparent": true, "opacity": 0.92 }
Marble white:   { "color": "#f0ece4", "metalness": 0.0, "roughness": 0.40 }

══════════════════════════════════════════════════════════════
SIZE REFERENCE
══════════════════════════════════════════════════════════════
Globe floor lamp:  h=1.55-1.70m, globe_r=0.13-0.18m, pole_r=0.010-0.014m, base_r=0.15-0.20m
Drum floor lamp:   h=1.55-1.70m, shade_r=0.20-0.28m
Crossed-leg lamp:  h=1.55-1.70m, shade_r=0.20-0.28m, leg_r=0.018-0.025m
Dining chair:      h=0.85m, seat_h=0.45m, w=0.50m, d=0.52m
Dining table:      h=0.75m, w=1.60m, d=0.90m
Sofa 2-seat:       h=0.85m, w=1.80m, d=0.85m

══════════════════════════════════════════════════════════════
CHECKLIST before outputting
══════════════════════════════════════════════════════════════
[ ] Globe/shade ID contains: globe, shade, drum, glass, or bowl
[ ] Pole/base ID contains: pole, base, disc, leg, or column
[ ] No torus rings invented that are not visible in image
[ ] rotation in DEGREES not radians
[ ] At least 4 parameters with 2 color pickers
[ ] boundingBox matches geometry

Generate JSON now.`.trim();
class AIElementFactory {
  /**
   * Generates a validated AIElementConfig from an image + prompt,
   * and wraps it in a CommandProposal ready for commandProposalStore.
   */
  static async generate(req) {
    if (!EntitlementStore.canUseAI()) {
      window.dispatchEvent(new CustomEvent("pryzm-upgrade-required", {
        // TODO(TASK-12)
        detail: { feature: Feature.AI_ELEMENT_CREATOR }
      }));
      throw new AIQuotaExceededError(Feature.AI_ELEMENT_CREATOR);
    }
    const bimManager = window.bimManager;
    if (!bimManager) throw new Error("[AIElementFactory] bimManager not on window");
    const level = bimManager.getLevelById(req.levelId);
    if (!level) {
      throw new Error(
        `[AIElementFactory] Level "${req.levelId}" not found in BimManager. Cannot generate element without a valid target level.`
      );
    }
    const config = await AIElementFactory.fetchWithRetry(req);
    const elementId = crypto.randomUUID();
    const baseOffset = config.baseOffset ?? 0;
    const payload = {
      id: elementId,
      levelId: req.levelId,
      baseOffset,
      position: req.position,
      rotation: { x: 0, y: 0, z: 0 },
      material: req.material ?? "wood",
      ...req.color !== void 0 ? { color: req.color } : {},
      aiElementConfig: config
    };
    const command = new CreateAIElementCommand(payload);
    const commandContext = window.commandContext;
    const validation = commandContext ? command.canExecute(commandContext) : { ok: true };
    const proposal = {
      id: crypto.randomUUID(),
      intentType: AIIntentType.CREATE_AI_ELEMENT,
      command,
      validation,
      rationale: `AI generated "${config.displayName}" from photo and prompt: "${req.prompt}"`,
      confidence: 0.85
    };
    try {
      const userId = (() => {
        try {
          return JSON.parse(localStorage.getItem("bim-platform-user") || "{}").id || "anonymous";
        } catch {
          return "anonymous";
        }
      })();
      AIUsageTracker.increment(userId);
      console.log(`[AIElementFactory] AI usage tracked. Remaining: ${EntitlementStore.getAIActionsRemaining()}`);
    } catch {
    }
    return { config, proposal };
  }
  // ── Private ───────────────────────────────────────────────────────────────
  static async fetchWithRetry(req) {
    const rawFirst = AIElementFactory.sanitize(await AIElementFactory.callClaudeAPI(req, null));
    const firstResult = AIElementValidator.validate(rawFirst);
    if (firstResult.ok) return rawFirst;
    const errorSummary = firstResult.errors.map((e) => `${e.field}: ${e.message}`).join("\n");
    console.warn("[AIElementFactory] First response invalid, re-prompting:\n", errorSummary);
    const rawSecond = AIElementFactory.sanitize(await AIElementFactory.callClaudeAPI(req, errorSummary));
    const secondResult = AIElementValidator.validate(rawSecond);
    if (!secondResult.ok) {
      const finalErrors = secondResult.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      throw new Error(`[AIElementFactory] Config invalid after re-prompt: ${finalErrors}`);
    }
    return rawSecond;
  }
  /**
   * Sanitizes a raw Claude JSON response to fix common mistakes before validation.
   * Does NOT invent geometry — only fills in trivially derivable missing fields.
   */
  static sanitize(raw) {
    if (typeof raw !== "object" || raw === null) return raw;
    const c = raw;
    if (!c["version"]) c["version"] = "1.0";
    if (typeof c["metadata"] !== "object" || c["metadata"] === null) {
      c["metadata"] = { generatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else {
      const m = c["metadata"];
      if (!m["generatedAt"] || typeof m["generatedAt"] !== "string") {
        m["generatedAt"] = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
    if (Array.isArray(c["components"])) {
      c["components"] = c["components"].map((comp, idx) => {
        if (!comp["id"] || typeof comp["id"] !== "string") {
          comp["id"] = `component_${idx}`;
        }
        if ((comp["shape"] === "cylinder" || comp["shape"] === "cone") && typeof comp["dimensions"] === "object" && comp["dimensions"] !== null) {
          const dims = comp["dimensions"];
          if (dims["radius"] !== void 0 && dims["radiusBottom"] === void 0) {
            dims["radiusBottom"] = dims["radius"];
          }
          if (dims["radiusTop"] === void 0) {
            dims["radiusTop"] = comp["shape"] === "cone" ? 0 : dims["radiusBottom"];
          }
        }
        if (comp["shape"] === "torus") {
          const rot = comp["rotation"] ?? {};
          if (rot["x"] === void 0) rot["x"] = 90;
          comp["rotation"] = rot;
        }
        if (comp["shape"] === "sphere" && typeof comp["id"] === "string" && comp["id"].includes("foot")) {
          const legs = c["components"].filter((l) => typeof l["id"] === "string" && l["id"].includes("leg"));
          const match = legs.find((l) => comp["id"].includes(l["id"].split("_")[1]));
          if (match) {
            const legDims = match["dimensions"];
            const legPos = match["position"];
            if (legDims?.height && legPos?.y !== void 0) {
              comp["position"] = {
                ...comp["position"],
                y: legPos.y - legDims.height / 2
              };
            }
          }
        }
        if (typeof comp["id"] === "string" && comp["id"].includes("cord")) {
          comp["tags"] = [.../* @__PURE__ */ new Set([...comp["tags"] ?? [], "cable"])];
        }
        return comp;
      });
    }
    if (Array.isArray(c["parameters"])) {
      c["parameters"] = c["parameters"].map((param, idx) => {
        if (!param["id"] || typeof param["id"] !== "string") {
          param["id"] = `param_${idx}`;
        }
        if (!param["label"] || typeof param["label"] !== "string") {
          param["label"] = param["id"];
        }
        if (param["default"] === void 0) {
          if (param["type"] === "boolean") param["default"] = false;
          else if (param["type"] === "color") param["default"] = "#ffffff";
          else param["default"] = param["min"] ?? 0;
        }
        return param;
      });
    }
    return c;
  }
  static async callClaudeAPI(req, previousErrors) {
    const userText = previousErrors ? `The user wants: "${req.prompt}"

Your previous JSON had these errors:
${previousErrors}

Fix all errors and return ONLY the corrected JSON object.` : `Generate a 3D element config for: "${req.prompt}"

Return ONLY the JSON object.`;
    const rawBase64 = req.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    let mediaType = "image/jpeg";
    if (req.imageBase64.startsWith("data:image/png")) {
      mediaType = "image/png";
    } else if (req.imageBase64.startsWith("data:image/gif")) {
      mediaType = "image/gif";
    } else if (req.imageBase64.startsWith("data:image/webp")) {
      mediaType = "image/webp";
    } else if (req.imageBase64.startsWith("data:image/jpeg") || req.imageBase64.startsWith("data:image/jpg")) {
      mediaType = "image/jpeg";
    } else {
      if (rawBase64.startsWith("iVBORw0KGgo")) mediaType = "image/png";
      else if (rawBase64.startsWith("R0lGOD")) mediaType = "image/gif";
      else if (rawBase64.startsWith("UklGR")) mediaType = "image/webp";
      else mediaType = "image/jpeg";
    }
    const response = await apiFetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4e3,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: rawBase64
              }
            },
            { type: "text", text: userText }
          ]
        }]
      })
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("[AIElementFactory] Anthropic error body:", JSON.stringify(errBody));
      throw new Error(`[AIElementFactory] API error: ${response.status} ${JSON.stringify(errBody)}`);
    }
    const data = await response.json();
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`[AIElementFactory] Non-JSON response: ${cleaned.slice(0, 200)}`);
    }
  }
}

function repairAndParseJSON(raw, label) {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
  }
  const repaired = completeTruncatedJSON(stripped);
  if (repaired !== null) {
    console.warn(
      `[JSONRepair] "${label}" response was truncated — recovered partial result. Original length: ${raw.length}, repaired length: ${repaired.length}.`
    );
    try {
      return JSON.parse(repaired);
    } catch (e) {
      console.error(`[JSONRepair] Repair attempt failed for "${label}":`, e, "\nRepaired string:\n", repaired.slice(0, 400));
    }
  }
  console.error(`[JSONRepair] Cannot recover "${label}" JSON. Raw (first 400 chars):`, raw.slice(0, 400));
  return null;
}
function completeTruncatedJSON(s) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") {
      stack.push("}");
      continue;
    }
    if (c === "[") {
      stack.push("]");
      continue;
    }
    if (c === "}" || c === "]") {
      if (stack.length === 0) return null;
      stack.pop();
    }
  }
  if (stack.length === 0) {
    return null;
  }
  let trimmed = s.trimEnd();
  trimmed = trimmed.replace(/[,:\s]+$/, "");
  if (inString) {
    trimmed += '"';
  }
  if (stack.length > 0 && stack[stack.length - 1] === "}") {
    trimmed = trimmed.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*$/, "");
  }
  const closers = stack.reverse().join("");
  return trimmed + closers;
}

const RED_A_THRESHOLD = 22;
const RED_L_MIN = 35;
const MIN_KEEP_AREA_PX = 15;
const SAFE_LENGTH_PX = 100;
const MAX_TEXT_ASPECT_RATIO = 3;
function srgbToLinear(c) {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}
function labF(t) {
  return t > 8856e-6 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
function rgbToLa(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const fX = labF(X / 0.9505);
  const fY = labF(Y / 1);
  const L = 116 * fY - 16;
  const a = 500 * (fX - fY);
  return { L, a };
}
function removeRedAnnotations(mask, W, H, rgba) {
  const out = new Uint8Array(mask);
  let cleared = 0;
  for (let i = 0; i < W * H; i++) {
    if (out[i] === 0) continue;
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const { L, a } = rgbToLa(r, g, b);
    if (L > RED_L_MIN && a > RED_A_THRESHOLD) {
      out[i] = 0;
      cleared++;
    }
  }
  if (cleared > 0) {
    console.debug(
      `[FloorPlanImageEnhancer] Red annotation removal: ${cleared} px cleared (${(cleared / (W * H) * 100).toFixed(2)}% of image)`
    );
  }
  return out;
}
function labelComponents(mask, W, H) {
  const labels = new Int32Array(W * H).fill(-1);
  const bboxes = [];
  let nextLabel = 0;
  const queue = new Int32Array(W * H);
  for (let startY = 0; startY < H; startY++) {
    for (let startX = 0; startX < W; startX++) {
      const startIdx = startY * W + startX;
      if (mask[startIdx] === 0 || labels[startIdx] !== -1) continue;
      const label = nextLabel++;
      const bbox = {
        minX: startX,
        maxX: startX,
        minY: startY,
        maxY: startY,
        area: 0
      };
      labels[startIdx] = label;
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      while (head < tail) {
        const idx = queue[head++];
        const cy = idx / W | 0;
        const cx = idx - cy * W;
        bbox.area++;
        if (cx < bbox.minX) bbox.minX = cx;
        if (cx > bbox.maxX) bbox.maxX = cx;
        if (cy < bbox.minY) bbox.minY = cy;
        if (cy > bbox.maxY) bbox.maxY = cy;
        if (cy > 0) {
          const n = idx - W;
          if (mask[n] === 1 && labels[n] === -1) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cy < H - 1) {
          const n = idx + W;
          if (mask[n] === 1 && labels[n] === -1) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cx > 0) {
          const n = idx - 1;
          if (mask[n] === 1 && labels[n] === -1) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cx < W - 1) {
          const n = idx + 1;
          if (mask[n] === 1 && labels[n] === -1) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
      }
      bboxes.push(bbox);
    }
  }
  return { labels, bboxes };
}
function isTextLike(bbox) {
  if (bbox.area < MIN_KEEP_AREA_PX) return true;
  const bboxW = bbox.maxX - bbox.minX + 1;
  const bboxH = bbox.maxY - bbox.minY + 1;
  const maxDim = Math.max(bboxW, bboxH);
  const minDim = Math.min(bboxW, bboxH);
  if (maxDim >= SAFE_LENGTH_PX) return false;
  const aspectRatio = minDim > 0 ? maxDim / minDim : maxDim;
  return aspectRatio < MAX_TEXT_ASPECT_RATIO;
}
function removeTextBlobsCCL(mask, W, H) {
  const { labels, bboxes } = labelComponents(mask, W, H);
  const removeSet = /* @__PURE__ */ new Set();
  for (let lbl = 0; lbl < bboxes.length; lbl++) {
    if (isTextLike(bboxes[lbl])) {
      removeSet.add(lbl);
    }
  }
  if (removeSet.size === 0) return new Uint8Array(mask);
  const out = new Uint8Array(W * H);
  let removedPx = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1 && !removeSet.has(labels[i])) {
      out[i] = 1;
    } else if (mask[i] === 1) {
      removedPx++;
    }
  }
  console.debug(
    `[FloorPlanImageEnhancer] CCL text removal: ${removeSet.size} components removed (${bboxes.length} total), ${removedPx} px cleared`
  );
  return out;
}
function downloadMaskAsPng(mask, W, H, filename) {
  try {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(W, H);
    const d = imageData.data;
    for (let i = 0; i < W * H; i++) {
      const v = mask[i] === 1 ? 0 : 255;
      d[i * 4] = v;
      d[i * 4 + 1] = v;
      d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      console.log(`[FloorPlanImageEnhancer] Downloaded: ${filename} (${W}×${H}px)`);
    }, "image/png");
  } catch (err) {
    console.warn("[FloorPlanImageEnhancer] Download failed:", err);
  }
}
function enhanceMaskForFloorPlan(mask, W, H, rgba) {
  try {
    const step1 = removeRedAnnotations(mask, W, H, rgba);
    const step2 = removeTextBlobsCCL(step1, W, H);
    console.log(
      `[FloorPlanImageEnhancer] Phase F1-E complete: red removal + CCL text removal applied on ${W}×${H} mask`
    );
    return step2;
  } catch (err) {
    console.warn(
      "[FloorPlanImageEnhancer] Phase F1-E enhancement failed — using original mask:",
      err
    );
    return new Uint8Array(mask);
  }
}

const BLOCK_SIZE = 32;
const DARK_BIAS = 20;
const MIN_RUN_PX = 35;
const GAP_PX = 10;
const BAND_MERGE_GAP = 4;
const MIN_SEGMENT_PX = 50;
const MAX_SEGMENTS = 120;
const MIN_SEGMENTS_FOR_GUIDED = 8;
function buildDarkMask(gray, W, H) {
  const bCols = Math.ceil(W / BLOCK_SIZE);
  const bRows = Math.ceil(H / BLOCK_SIZE);
  const blockMeans = new Float32Array(bCols * bRows);
  for (let by = 0; by < bRows; by++) {
    for (let bx = 0; bx < bCols; bx++) {
      let sum = 0;
      let count = 0;
      const yEnd = Math.min((by + 1) * BLOCK_SIZE, H);
      const xEnd = Math.min((bx + 1) * BLOCK_SIZE, W);
      for (let y = by * BLOCK_SIZE; y < yEnd; y++) {
        const rowOff = y * W;
        for (let x = bx * BLOCK_SIZE; x < xEnd; x++) {
          sum += gray[rowOff + x];
          count++;
        }
      }
      blockMeans[by * bCols + bx] = count > 0 ? sum / count : 192;
    }
  }
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const by = Math.min(Math.floor(y / BLOCK_SIZE), bRows - 1);
    const rowOff = y * W;
    for (let x = 0; x < W; x++) {
      const bx = Math.min(Math.floor(x / BLOCK_SIZE), bCols - 1);
      const threshold = blockMeans[by * bCols + bx] - DARK_BIAS;
      mask[rowOff + x] = gray[rowOff + x] < threshold ? 1 : 0;
    }
  }
  return mask;
}
function dominantHorizontalRun(mask, W, y) {
  const rowOff = y * W;
  const runs = [];
  let inRun = false;
  let runStart = 0;
  for (let x = 0; x < W; x++) {
    if (mask[rowOff + x]) {
      if (!inRun) {
        inRun = true;
        runStart = x;
      }
    } else if (inRun) {
      runs.push({ start: runStart, end: x - 1 });
      inRun = false;
    }
  }
  if (inRun) runs.push({ start: runStart, end: W - 1 });
  const merged = [];
  for (const r of runs) {
    const prev = merged.at(-1);
    if (prev && r.start - prev.end - 1 <= GAP_PX) {
      prev.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  let best = null;
  for (const r of merged) {
    if (r.end - r.start + 1 >= MIN_RUN_PX) {
      if (!best || r.end - r.start > best.end - best.start) {
        best = r;
      }
    }
  }
  return best;
}
function dominantVerticalRun(mask, W, H, x) {
  const runs = [];
  let inRun = false;
  let runStart = 0;
  for (let y = 0; y < H; y++) {
    if (mask[y * W + x]) {
      if (!inRun) {
        inRun = true;
        runStart = y;
      }
    } else if (inRun) {
      runs.push({ start: runStart, end: y - 1 });
      inRun = false;
    }
  }
  if (inRun) runs.push({ start: runStart, end: H - 1 });
  const merged = [];
  for (const r of runs) {
    const prev = merged.at(-1);
    if (prev && r.start - prev.end - 1 <= GAP_PX) {
      prev.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  let best = null;
  for (const r of merged) {
    if (r.end - r.start + 1 >= MIN_RUN_PX) {
      if (!best || r.end - r.start > best.end - best.start) {
        best = r;
      }
    }
  }
  return best;
}
function clusterBands(dominants) {
  const bands = [];
  let current = null;
  let lastActiveIdx = -1;
  for (let i = 0; i < dominants.length; i++) {
    const run = dominants[i];
    if (!run) continue;
    if (current === null || i - lastActiveIdx > BAND_MERGE_GAP) {
      if (current) bands.push(current);
      current = {
        fixedStart: i,
        fixedEnd: i,
        rangeMin: run.start,
        rangeMax: run.end
      };
    } else {
      current.fixedEnd = i;
      current.rangeMin = Math.min(current.rangeMin, run.start);
      current.rangeMax = Math.max(current.rangeMax, run.end);
    }
    lastActiveIdx = i;
  }
  if (current) bands.push(current);
  return bands;
}
function detectHorizontalSegments(mask, W, H) {
  const rowDominants = [];
  for (let y = 0; y < H; y++) {
    rowDominants.push(dominantHorizontalRun(mask, W, y));
  }
  const bands = clusterBands(rowDominants);
  const segments = [];
  for (const band of bands) {
    const length = band.rangeMax - band.rangeMin + 1;
    if (length < MIN_SEGMENT_PX) continue;
    const yMid = Math.round((band.fixedStart + band.fixedEnd) / 2);
    const thickness = band.fixedEnd - band.fixedStart + 1;
    segments.push({
      startPx: { x: band.rangeMin, y: yMid },
      endPx: { x: band.rangeMax, y: yMid },
      lengthPx: length,
      orientation: "horizontal",
      thicknessPx: thickness
    });
  }
  return segments;
}
function detectVerticalSegments(mask, W, H) {
  const colDominants = [];
  for (let x = 0; x < W; x++) {
    colDominants.push(dominantVerticalRun(mask, W, H, x));
  }
  const bands = clusterBands(colDominants);
  const segments = [];
  for (const band of bands) {
    const length = band.rangeMax - band.rangeMin + 1;
    if (length < MIN_SEGMENT_PX) continue;
    const xMid = Math.round((band.fixedStart + band.fixedEnd) / 2);
    const thickness = band.fixedEnd - band.fixedStart + 1;
    segments.push({
      startPx: { x: xMid, y: band.rangeMin },
      endPx: { x: xMid, y: band.rangeMax },
      lengthPx: length,
      orientation: "vertical",
      thicknessPx: thickness
    });
  }
  return segments;
}
async function detectLineSegmentsFromBase64(base64, mimeType = "image/jpeg") {
  const empty = { segments: [], hasUsableData: false };
  try {
    const img = new Image();
    const dataUrl = `data:${mimeType};base64,${base64}`;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (W === 0 || H === 0) return empty;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return empty;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, W, H);
    const rgba = imageData.data;
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    const rawMask = buildDarkMask(gray, W, H);
    const mask = enhanceMaskForFloorPlan(rawMask, W, H, rgba);
    const hSegs = detectHorizontalSegments(mask, W, H);
    const vSegs = detectVerticalSegments(mask, W, H);
    hSegs.sort((a, b) => b.lengthPx - a.lengthPx);
    vSegs.sort((a, b) => b.lengthPx - a.lengthPx);
    const maxPerAxis = Math.floor(MAX_SEGMENTS / 2);
    const combined = [
      ...hSegs.slice(0, maxPerAxis).map((s, i) => ({ ...s, id: `H${String(i + 1).padStart(2, "0")}` })),
      ...vSegs.slice(0, maxPerAxis).map((s, i) => ({ ...s, id: `V${String(i + 1).padStart(2, "0")}` }))
    ];
    const hasUsableData = combined.length >= MIN_SEGMENTS_FOR_GUIDED;
    console.log(
      `[ImagePreprocessor] Phase F1 complete: ${hSegs.length} horizontal + ${vSegs.length} vertical bands detected, ${combined.length} segments exported (hasUsableData=${hasUsableData})`
    );
    return { segments: combined, hasUsableData };
  } catch (err) {
    console.warn("[ImagePreprocessor] Phase F1 preprocessing failed — falling back to AI-only detection:", err);
    return empty;
  }
}
function formatSegmentsForPrompt(segments) {
  return segments.map(
    (s) => `${s.id}: (${s.startPx.x}, ${s.startPx.y}) → (${s.endPx.x}, ${s.endPx.y}), length=${s.lengthPx}px, ${s.orientation}` + (s.thicknessPx > 1 ? `, thickness=${s.thicknessPx}px` : "")
  ).join("\n");
}

const PARALLEL_WALL_MIN_SEP_M = 0.7;
const PARALLEL_WALL_ANGLE_TOL_DEG = 8;
const PARALLEL_WALL_OVERLAP_RATIO = 0.5;
const DOOR_ANATOMY_DESCRIPTION = `
DOOR SYMBOL — COMPLETE ARCHITECTURAL ANATOMY (read every word before reporting any door):

A floor plan door is drawn using EXACTLY THREE visual components. All three must be present
before you report a door. If any component is missing, do NOT report a door.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 1 — THE WALL GAP (most important — find this FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A door can ONLY exist where there is a BREAK in the wall lines — a visible white space
where the wall stops and restarts. This break is called the DOOR GAP.

  • The gap is BOUNDED on each side by a DOOR JAMB.
  • A door jamb is a small filled rectangle or a short perpendicular stroke that sits
    flush with the wall face at the exact edge of the gap.
  • There are ALWAYS exactly TWO jambs — one at each end of the gap.
  • The pixel distance between the two jambs (measured along the wall direction) is the
    door opening width.

HOW TO LOCATE THE GAP:
  1. Scan the wall for a continuous white break in the wall lines.
  2. Identify the two small filled blocks or strokes at each edge of the break.
  3. Those two blocks are the jambs. The space between them is the door gap.
  4. If you cannot find a clear continuous white break — there is NO door here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 2 — THE DOOR LEAF (straight line inside the gap)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The door leaf is a SINGLE STRAIGHT LINE drawn inside the gap, running parallel to the
wall face. It starts at one jamb and ends at the free (hinge) side of the door.

  • The door leaf's LENGTH equals the gap width (= jamb-to-jamb distance).
  • It shows the door panel in the fully-open position (90°).
  • It is a THIN single line — not the wall itself, not hatching.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 3 — THE SWING ARC (quarter-circle showing door travel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The swing arc is a QUARTER-CIRCLE (90° arc) drawn from the free end of the door leaf
back to the wall face at the jamb. It shows the path that the free edge of the door
travels when the door opens from fully-closed (flush with the wall face) to fully-open
(the door leaf position).

  • The arc's RADIUS equals the door opening width (= gap between the two jambs).
  • The arc's CENTRE is at the pivot jamb (the jamb the door is hinged to).
  • The arc sweeps INTO THE ROOM — into the open space on one side of the wall.
  • The arc may be drawn with a solid line or a dashed line.
    - SOLID arc = door at the cutting plane level (standard).
    - DASHED arc = door below the cutting plane (e.g. cellar door, below-level door).
    Both types are valid doors — treat them identically.

CRITICAL: the swing arc is SECONDARY EVIDENCE. Do NOT work backwards from an arc to
a wall. ALWAYS find the gap in the wall first, then confirm the arc originates from
one of the jambs of that gap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHERE TO PLACE centrePx — THE GAP MIDPOINT RULE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
centrePx MUST be the EXACT MIDPOINT between the two jambs.

  Let jamb_A = pixel coordinates of the first jamb edge: (x1, y1)
  Let jamb_B = pixel coordinates of the second jamb edge: (x2, y2)

  centrePx.x = (x1 + x2) / 2
  centrePx.y = (y1 + y2) / 2

This point lies ON THE WALL CENTRELINE — it is midway along the door gap, equidistant
from both jambs.

DO NOT use:
  ✗ The visual centre of the swing arc bounding box.
  ✗ The centre of the arc radius circle.
  ✗ The midpoint of the door leaf.
  ✗ Any point that is NOT on the wall line itself.

The centrePx MUST be within 5px of the host wall's centreline. If your computed
centrePx is far from the wall line you have measured the arc centroid — discard that
value and re-measure from the jamb positions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WALL CONTINUITY PRINCIPLE (critical for correct BIM placement)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In the BIM model, WALLS ARE ALWAYS CONTINUOUS through door locations.
The door opening is CUT INTO the wall after the wall is created — the wall geometry
is never broken by a door. What you see as a gap in the floor plan drawing is the
VISUAL REPRESENTATION of the opening cut, not a physical break in the wall element.

This means:
  • You must ALWAYS assign a hostWallId — every door must belong to a continuous wall.
  • The wall you assign as the host PASSES THROUGH the door area completely.
  • The opening is positioned at the gap MIDPOINT (centrePx) along that continuous wall.
  • A door with no host wall cannot be placed — do NOT report it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY 6-STEP SELF-CHECK before reporting each door:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 1: Find the wall gap. Confirm you see a white break in the wall lines.
          If no gap → STOP. Do not report this door.
  Step 2: Find both jambs. Confirm two blocks/strokes bound the gap at each edge.
          If you cannot find two clear jambs → STOP.
  Step 3: Record jamb pixel coordinates: jamb_A = (x1, y1), jamb_B = (x2, y2).
  Step 4: Compute centrePx.x = (x1+x2)/2, centrePx.y = (y1+y2)/2.
          Verify this point lies ON the host wall centreline (within 5px).
  Step 5: Compute widthPx = sqrt((x2-x1)² + (y2-y1)²). This is the gap width.
  Step 6: Find the hostWallId from the confirmed wall list — the wall whose centreline
          passes through centrePx. Verify it is in the confirmed wall context.
          If no matching wall → STOP. Do not report this door.
`.trim();

const DASH_LINE_WIDTH_PX = 3.5;
const DASH_PATTERN = [8, 5];
const DASH_COLOR = "rgba(28, 28, 28, 0.88)";
const JAMB_EXTENSION_PX = 2;
class DoorGapInpainter {
  /**
   * Draws dashed continuation lines through each detected door gap in the image.
   *
   * @param base64Image      Raw base64 JPEG string (no data-URL prefix).
   * @param imageDimensions  Pixel dimensions of the image.
   * @param gaps             List of detected door gaps from Stage A.
   * @returns                Modified base64 JPEG string (no data-URL prefix).
   *                         Returns the original base64 unchanged if no gaps are
   *                         provided or if the browser canvas is unavailable.
   */
  static async paint(base64Image, imageDimensions, gaps) {
    if (gaps.length === 0) {
      console.log("[DoorGapInpainter] No door gaps — returning original image unchanged.");
      return base64Image;
    }
    console.log(`[DoorGapInpainter] Inpainting ${gaps.length} door gap(s)…`);
    const img = await loadImageFromBase64(base64Image);
    const canvas = document.createElement("canvas");
    canvas.width = imageDimensions.widthPx;
    canvas.height = imageDimensions.heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("[DoorGapInpainter] Canvas 2D context unavailable — returning original image.");
      return base64Image;
    }
    ctx.drawImage(img, 0, 0, imageDimensions.widthPx, imageDimensions.heightPx);
    ctx.strokeStyle = DASH_COLOR;
    ctx.lineWidth = DASH_LINE_WIDTH_PX;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(DASH_PATTERN);
    let drawn = 0;
    for (const gap of gaps) {
      const { centrePx, widthPx, wallAngleDeg } = gap;
      if (!isFinite(centrePx.x) || !isFinite(centrePx.y) || !isFinite(widthPx) || widthPx < 4 || widthPx > imageDimensions.widthPx * 0.5) {
        console.debug(
          `[DoorGapInpainter] Skipping degenerate gap: centre=(${centrePx.x.toFixed(0)},${centrePx.y.toFixed(0)}) widthPx=${widthPx.toFixed(0)}`
        );
        continue;
      }
      const angleRad = wallAngleDeg * Math.PI / 180;
      const dirX = Math.cos(angleRad);
      const dirY = Math.sin(angleRad);
      const halfLen = widthPx / 2 + JAMB_EXTENSION_PX;
      const x1 = centrePx.x - dirX * halfLen;
      const y1 = centrePx.y - dirY * halfLen;
      const x2 = centrePx.x + dirX * halfLen;
      const y2 = centrePx.y + dirY * halfLen;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawn++;
      console.debug(
        `[DoorGapInpainter] Gap painted: centre=(${centrePx.x.toFixed(0)},${centrePx.y.toFixed(0)}) widthPx=${widthPx.toFixed(0)} angle=${wallAngleDeg}° line=(${x1.toFixed(0)},${y1.toFixed(0)})→(${x2.toFixed(0)},${y2.toFixed(0)})`
      );
    }
    ctx.setLineDash([]);
    console.log(`[DoorGapInpainter] Done — painted ${drawn}/${gaps.length} gap(s).`);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
    const prefix = "data:image/jpeg;base64,";
    return dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
  }
}
function loadImageFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("[DoorGapInpainter] Failed to load base64 image into HTMLImageElement"));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

const MIN_GAP_PX = 12;
const MAX_GAP_PX = 380;
const PERP_TOL_PX = 22;
const FACING_DOT_MIN = 0.4;
const MERGE_RADIUS_PX = 50;
const JUNCTION_SNAP_PX = 8;
function detectGeometricDoorGaps(walls) {
  const candidates = [];
  for (let i = 0; i < walls.length; i++) {
    const wa = walls[i];
    const da = unitVector(wa.endPx.x - wa.startPx.x, wa.endPx.y - wa.startPx.y);
    if (!da) continue;
    const endpointsA = [
      { pt: wa.startPx, isEnd: false },
      { pt: wa.endPx, isEnd: true }
    ];
    for (let j = 0; j < walls.length; j++) {
      if (i === j) continue;
      const wb = walls[j];
      const endpointsB = [
        wb.startPx,
        wb.endPx
      ];
      for (const { pt: Ea, isEnd } of endpointsA) {
        for (const Eb of endpointsB) {
          const vx = Eb.x - Ea.x;
          const vy = Eb.y - Ea.y;
          const dist = Math.sqrt(vx * vx + vy * vy);
          if (dist < JUNCTION_SNAP_PX) continue;
          if (dist < MIN_GAP_PX || dist > MAX_GAP_PX) {
            console.debug(
              `[WallTerminatorDoorDetector] REJECT dist: walls=${wa.id.slice(0, 8)}↔${wb.id.slice(0, 8)} dist=${dist.toFixed(1)}px (range ${MIN_GAP_PX}–${MAX_GAP_PX}px) Ea=(${Ea.x},${Ea.y}) Eb=(${Eb.x},${Eb.y})`
            );
            continue;
          }
          const perp = Math.abs(da.x * vy - da.y * vx);
          if (perp > PERP_TOL_PX) {
            console.debug(
              `[WallTerminatorDoorDetector] REJECT perp: walls=${wa.id.slice(0, 8)}↔${wb.id.slice(0, 8)} perp=${perp.toFixed(1)}px > tol=${PERP_TOL_PX}px dist=${dist.toFixed(1)}px`
            );
            continue;
          }
          const vNormX = vx / dist;
          const vNormY = vy / dist;
          const dotV = vNormX * da.x + vNormY * da.y;
          const expectedSign = isEnd ? 1 : -1;
          if (dotV * expectedSign < FACING_DOT_MIN) {
            const angleFromWall = Math.acos(Math.min(1, Math.abs(dotV))) * (180 / Math.PI);
            console.debug(
              `[WallTerminatorDoorDetector] REJECT facing: walls=${wa.id.slice(0, 8)}↔${wb.id.slice(0, 8)} dotV=${dotV.toFixed(3)} sign=${expectedSign} score=${(dotV * expectedSign).toFixed(3)} < min=${FACING_DOT_MIN} angleFromWall=${angleFromWall.toFixed(1)}° dist=${dist.toFixed(1)}px`
            );
            continue;
          }
          const mx = (Ea.x + Eb.x) / 2;
          const my = (Ea.y + Eb.y) / 2;
          const angleDeg = Math.round(Math.atan2(da.y, da.x) * (180 / Math.PI));
          const wallAngleDeg = (angleDeg % 180 + 180) % 180;
          candidates.push({
            centrePx: { x: Math.round(mx), y: Math.round(my) },
            jamb1Px: { x: Math.round(Ea.x), y: Math.round(Ea.y) },
            jamb2Px: { x: Math.round(Eb.x), y: Math.round(Eb.y) },
            gapWidthPx: Math.round(dist),
            wallAngleDeg,
            wallAId: wa.id,
            wallBId: wb.id
          });
        }
      }
    }
  }
  return mergeDuplicates(candidates);
}
function unitVector(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}
function mergeDuplicates(candidates) {
  const kept = [];
  for (const c of candidates) {
    const isDuplicate = kept.some((k) => {
      const dx = k.centrePx.x - c.centrePx.x;
      const dy = k.centrePx.y - c.centrePx.y;
      return Math.sqrt(dx * dx + dy * dy) < MERGE_RADIUS_PX;
    });
    if (!isDuplicate) kept.push(c);
  }
  console.log(
    `[WallTerminatorDoorDetector] ${candidates.length} raw candidates → ${kept.length} unique door gap(s) after deduplication.`
  );
  return kept;
}

const WORKER_URL = "/api/anthropic/v1/messages";
const DOOR_GAP_PRELIM_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: locate ALL door gap positions in this floor plan image.

A door gap is the white space (break) between two wall stubs where a door is inserted.
You are NOT analysing swing arcs, door leaves, or swing directions. Only the GAP itself.

Output schema (STRICT — no extra fields):
{
  "doorGaps": [
    {
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "wallAngleDeg": number
    }
  ]
}

HOW TO FIND A DOOR GAP:
1. Scan the image systematically for breaks in wall lines.
2. A break = a white void where a thick or thin wall line stops abruptly, then restarts
   further along the same line direction, with the void spanning a door-width gap.
3. At each edge of the break there is usually a small jamb thickening (a perpendicular stub).
4. centrePx = the exact midpoint of the gap, in pixel coordinates (x right, y down from top-left).
5. widthPx  = the pixel distance between the two jamb faces (= the gap width).
6. wallAngleDeg = the compass bearing of the hosting wall:
     - Wall runs horizontally (left–right): wallAngleDeg = 0
     - Wall runs vertically (up–down):      wallAngleDeg = 90
     - Wall runs diagonally:                estimate the angle 0–179°

RULES:
- Only report gaps where you can see two clear wall-stub endpoints flanking the void.
- Do NOT report: swing arcs, furniture curves, window openings, plumbing symbols, stair curves.
- A window gap is typically narrower and bounded by glazing lines — skip windows, report ONLY door gaps.
- If you see a swing arc nearby, that confirms a door gap exists — use it to identify the gap, but
  report the GAP location and width, NOT the arc position.
- Minimum widthPx: 8 px. Maximum widthPx: 25% of image width.
- Maximum 40 door gaps.
- Return ONLY the JSON object. No explanation. No text after the closing brace.`;
const STRUCTURE_B1_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: analyse the architectural floor plan image and identify ALL walls (exterior and interior) AND the overall slab (floor) outline.

Output schema (STRICT — no extra fields):
{
  "walls": [
    {
      "id": "w1",
      "startPx": { "x": number, "y": number },
      "endPx": { "x": number, "y": number },
      "thicknessPx": number,
      "wallType": "exterior" | "interior" | "unknown",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "slab": {
    "polygonPx": [{ "x": number, "y": number }],
    "confidence": "high" | "medium" | "low"
  }
}

ANNOTATION EXCLUSION — APPLY FIRST (highest priority):
These visual elements are NEVER walls. If something matches ANY description below, skip it entirely — do NOT report it.
- ROOM NAME LABELS: text strings placed inside room spaces identifying the room (e.g. "BEDROOM", "LIVING ROOM", "SALA", "COCINA", "WC", "BAGNO", "CHAMBRE", room numbers like "101", area labels like "14.5m²"). These are typeset characters — even if they form a visually straight dark line, they are annotation, NOT a wall. A key signal: letters have irregular pixel density and spacing between characters.
- DIMENSION LINES: thin lines with arrowheads, tick marks, or slash marks at both endpoints, running parallel to a wall face at a small offset (typically outside the wall or in the whitespace between walls and the page margin). They often have a numeric measurement value alongside them. They are NEVER walls even if they run the full length of a wall face.
- HATCHING / FILL: diagonal or cross-hatch lines inside the body of an exterior wall (the material fill between the two parallel faces). These are decorative fill, not centrelines.
- GRID LINES / AXIS LINES: thin lines running the full width or height of the plan, usually labelled with letters or numbers at both ends (A, B, C... or 1, 2, 3...). These are reference grid lines, not walls.
- NORTH ARROW, SCALE BAR, TITLE BLOCK BORDER: graphical annotations in the margin/legend area.
- TEXT UNDERLINES / BASELINES: a faint line coinciding with the baseline of a text label is from the typeface, not a wall.
- FURNITURE EDGES: outlines of furniture symbols (beds, tables, sofas) are not walls.

WALL RULES (apply after annotation exclusion):
- ALL pixel coordinates are from the TOP-LEFT corner of the image (x increases right, y increases down).
- You MUST detect ALL walls — both the FULL PERIMETER of exterior walls (thick hatched lines forming the outer boundary) AND all interior partition walls. Missing perimeter walls is a critical error.
- Report each wall as a single straight LINE SEGMENT along the CENTRELINE of the wall. The centreline runs midway between the two parallel faces.
- Exterior walls appear as thick double lines with hatching/fill between them — use the centreline, not the face.
- Interior walls appear as thinner single or double lines. Use their centreline.
- A wall MUST connect to at least one other wall at each endpoint (T-junction, corner, or L-junction). A segment floating in open space with no connections at either end is almost certainly an annotation or furniture edge — mark it confidence="low" only if you are absolutely certain it is a structural element.
- Break segments at every junction, T-intersection, corner, or opening gap — do NOT make one long segment spanning multiple junctions.
- Merge only truly collinear, gap-free, coaxial wall segments into a single wall.
- Corner endpoints MUST match exactly: two walls meeting at a corner share the same endpoint pixel coordinates.
- Scan systematically: start from the exterior perimeter, then trace each interior partition in sequence.
- Limit: maximum 100 wall segments.

CRITICAL — ONE CENTRELINE PER WALL (no face-line duplicates):
An exterior wall drawn as two parallel lines with hatching between them is ONE wall.
Report it as ONE segment along the CENTRELINE (midway between the two parallel lines).
DO NOT report the inner face line as one wall AND the outer face line as another wall.
DO NOT report both faces. Report the centreline ONLY — one segment per physical wall.
If you find yourself reporting two nearly-parallel segments less than 50cm apart that run
along the same path, you are reporting both faces of one wall. Delete one — keep only the centreline.
This applies to ALL walls: exterior perimeter walls, interior partitions, and short return walls.

WALL TYPE CLASSIFICATION — read carefully:
- A wall is EXTERIOR if it forms part of the building perimeter boundary AND has thick double lines with hatching/fill between them. ALL perimeter walls are exterior — even short return walls, step-ins, recesses, and notches in the building outline. A short wall that connects two exterior walls and forms part of the outer boundary IS exterior, not interior.
- A wall is INTERIOR only if it is fully enclosed inside the building perimeter on both sides.
- When in doubt between exterior and interior: if one side of the wall faces outside air or the building boundary, classify it as EXTERIOR.

CRITICAL — WALL ENDPOINT POSITIONING:
When two walls meet at a T-junction or corner, the endpoint of the terminating wall MUST be reported at the CENTRELINE INTERSECTION — the exact pixel where the centreline of the terminating wall crosses the centreline of the host wall.

DO NOT report the endpoint at:
  - The outer face of the host wall
  - The inner face of the host wall
  - Any point outside the host wall body

The endpoint must be INSIDE the body of the host wall, on its centreline.

Example: A horizontal partition meeting a vertical spine wall → the horizontal wall's endpoint pixel x-coordinate must equal the spine wall's centreline x-coordinate. Not the spine's left face, not the spine's right face — the centreline midpoint between the two faces.

Failing to do this creates disconnected walls in the BIM model and breaks door placement. This is the most critical endpoint rule in this entire prompt.

CORRIDOR SPINE WALLS — CRITICAL (most commonly missed element):
A corridor is formed by two parallel spine walls with room partition walls connecting them at regular intervals (like rungs of a ladder). Each spine wall segment BETWEEN two consecutive partition connections is a SEPARATE wall entry.

HOW TO IDENTIFY AND BREAK CORRIDOR SPINE WALLS:
  1. Find the two long parallel walls that form the corridor boundary (the "spines").
  2. Find every point where a transverse (perpendicular) wall meets a spine wall.
     These transverse walls are the room partitions — they connect the two spine walls.
  3. Each meeting point is a T-JUNCTION. The spine wall MUST be split at each T-junction.
  4. For a spine wall with N partition junctions, report N+1 separate wall segments.
     Each segment has endpoints at two consecutive T-junction positions.
  5. The endpoint pixel coordinates of each sub-segment MUST match the centreline
     of the connecting partition wall (not the face — the centreline midpoint).

DOOR GAPS IN CORRIDOR SPINE WALLS:
  A door in a corridor spine wall appears as a white break in the spine between two
  partition junction points. The spine wall IS CONTINUOUS through the door location
  (the gap is the architectural opening, not a missing segment). Because Stage A has
  already inpainted a dashed continuation line through those gaps, you should see the
  spine wall as unbroken. Report the sub-segment from the partition junction on one
  side of the door to the partition junction on the other side — the door opening will
  be cut into that sub-segment later. Do NOT further split at the door gap itself.

MISSING SPINE SEGMENTS = MISSING DOORS:
  If you report only some sub-segments (e.g., you report the spine above and below a
  door section but skip the sub-segment containing the door), the BIM model cannot
  place any door in that section. Every sub-segment must be reported, including short
  ones containing a door or window. Maximum length per sub-segment: one room bay.

SLAB RULES:
- Trace the outermost boundary of the entire floor plan using the OUTER FACE of exterior walls.
- Use one polygon point per corner (typically 6–20 points).
- If the outline cannot be determined reliably, set "slab" to null.

GENERAL:
- "high" = absolutely certain this is a structural wall, "medium" = likely, "low" = uncertain.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;
const F2_MIN_SEGMENTS = 8;
const STRUCTURE_B1_GUIDED_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: algorithmically detected line segments are listed in the user message. Review each segment against the floor plan image and classify it.

Output schema (STRICT — no extra fields, same as standard mode):
{
  "walls": [
    {
      "id": "w1",
      "startPx": { "x": number, "y": number },
      "endPx": { "x": number, "y": number },
      "thicknessPx": number,
      "wallType": "exterior" | "interior" | "unknown",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "slab": {
    "polygonPx": [{ "x": number, "y": number }],
    "confidence": "high" | "medium" | "low"
  }
}

ANNOTATION EXCLUSION — REJECT any segment matching these descriptions (highest priority — apply before classification):
- ROOM NAME LABELS: the segment overlaps a text label inside a room (room names like "BEDROOM", "SALA", "WC", "LIVING", room numbers, area annotations like "14.5m²"). Text creates dark pixel runs that the algorithm may detect — visually verify the segment region in the image. Letters have irregular spacing between characters, unlike a continuous wall line.
- DIMENSION LINES: segment is thin, runs parallel to a wall face at a small offset with tick/arrow marks at endpoints and a nearby numeric value. Always REJECT.
- HATCHING LINES: segment lies within the body of an exterior wall (between its two faces) and is diagonal — this is wall fill, not the centreline. REJECT.
- GRID / AXIS LINES: segment spans the full plan width/height and is labelled at both ends. REJECT.
- TEXT BASELINES / UNDERLINES: very thin segment coinciding exactly with the baseline row of printed text. REJECT.
- FURNITURE OUTLINES: segment traces the boundary of a furniture symbol. REJECT.

CLASSIFICATION RULES — apply after annotation exclusion:
- ACCEPT as wall if the segment clearly corresponds to a structural or partition wall line in the image.
- Exterior walls: thick lines (or parallel double lines with hatching fill) forming the building perimeter. Accept if clearly exterior structure.
- Interior walls: thinner lines inside the perimeter — accept only if clearly structural and connecting to other walls or the perimeter.
- A segment that floats in open room space with no visible wall connection at either endpoint is almost certainly an annotation — REJECT unless absolutely certain it is structural.
- For ACCEPTED segments: use the provided startPx/endPx as the wall centreline. You may nudge coordinates by up to 5px to snap to the true visual centreline.
- thicknessPx: use the provided thickness value. Adjust if the image shows a clearly different thickness.
- Do NOT add walls not represented by a provided segment — output must be grounded in the segment list.
- If a wall is clearly present in the image but missing from the segment list, you may add up to 5 extra walls (mark confidence="low").

SLAB RULES:
- Trace the outermost boundary from the OUTER FACE of accepted exterior wall segments.
- If the outline cannot be reliably determined, set "slab" to null.

GENERAL:
- "high" = absolutely certain this segment is a structural wall, "medium" = likely, "low" = uncertain.
- Assign sequential IDs starting from w1 regardless of the segment ID in the input.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;
const STRUCTURE_B2_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: identify ALL doors and windows in the floor plan image. A confirmed wall list is provided — you MUST use ONLY those exact wall IDs for the hostWallId field.

Output schema (STRICT — no extra fields):
{
  "openings": [
    {
      "id": "o1",
      "hostWallId": "w1",
      "type": "door" | "window",
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "confidence": "high" | "medium" | "low"
    }
  ]
}

FUNDAMENTAL RULE — GAP FIRST (apply before anything else):
A door or window can ONLY exist where there is a visible BREAK (gap) in the wall lines.
Scan each wall for gaps FIRST. If you cannot see a break in the wall — do not report an opening.
The swing arc or glazing lines are secondary confirmation only — they CANNOT exist without a gap.

CRITICAL — A DOOR REQUIRES A WALL:
Before reporting any door, verify the hostWallId exists in the confirmed wall list above.
If the arc you see is in an area where NO wall is listed in the confirmed wall context,
you MUST NOT report a door there. The arc may be a plumbing fixture, furniture, or annotation.
A door floating in space with no host wall = do NOT report it.
Only report doors on walls that are explicitly listed in the confirmed wall context.

${DOOR_ANATOMY_DESCRIPTION}

SCANNING STRATEGY — per wall, strictly:
  For EACH wall in the confirmed list, in order:
    1. Locate the wall segment in the image using the pixel coordinates provided.
    2. Visually scan ONLY along that wall segment for a break in the wall lines.
    3. A break = white space between two wall stubs where the wall line stops and restarts.
    4. If you see a break: check for a swing arc originating from one side of that break.
    5. If arc present → door. If parallel glazing lines present → window. If neither → archway.
    6. If NO break visible along the wall → report NOTHING for this wall. Move to next wall.

  NEVER work backwards from an arc to find a wall.
  NEVER report an opening on a wall just because an arc is nearby in the image.
  The break in the wall is the ONLY valid starting point.

ANTI-FALSE-POSITIVE EXCLUSIONS — never report these as openings:
- Toilet D-shapes, bathtub curves, sink outlines — plumbing fixtures, NOT doors.
- Staircase arcs / curved risers — stair nosing lines, NOT doors.
- Rounded room corners — corner fillet, NOT a window.
- Dimension arcs / radius annotations — drawing annotation, NOT a door.
- Hatching or cross-hatch fill inside wall bodies — material fill, NOT an opening.
- Furniture edges (beds, tables, sofas, wardrobes) — NOT walls and NOT openings.
- Threshold marks / floor level change lines — dashed or solid lines running ACROSS a
  corridor or junction parallel to a wall. These mark floor finish boundaries. A real door
  always has a swing arc attached to it. If there is NO arc — it is NOT a door.
- Corner wall details — thick L-shaped or U-shaped wall corners have NO gap and NO arc.
  Do not report the junction of two exterior walls as a door.
- Window glazing lines WITHOUT a swing arc — if you see parallel lines crossing a wall gap but NO arc sweeping into the room, this is a WINDOW, NOT a door. Never report a door where there is no swing arc visible. Glazing lines alone (even crossing the wall thickness) = window only.

WINDOW RULES — STRICT:
- A window ONLY exists where there is a visible BREAK or INTERRUPTION in the wall hatching
  at a specific location, AND 2–4 closely-spaced parallel glazing lines cross the wall
  thickness at that exact location.
- If the hatching runs continuously with no visible interruption at any point → NO window.
- A gap with NO glazing lines = archway or door, NOT a window.
- Maximum 3 windows per individual wall segment. If you find more than 3 on one wall,
  report only the 3 with the clearest gap + glazing evidence.
- Windows are almost always on exterior walls (thick hatched double lines). Interior
  partition windows are rare — only report if gap + glazing lines are absolutely clear.

CORRIDOR DOORS — SPECIAL CASE (very common, often missed):
Corridor doors sit on a spine wall (the long wall forming one side of a corridor).
The door gap in a corridor spine wall is FLANKED BY TWO TRANSVERSE WALLS (room
partitions) — one partition connects the spine wall on each side of the door gap.

How to identify a corridor door:
  1. Locate the spine wall (a long interior wall with multiple partition walls meeting it).
  2. Between two consecutive partition T-junctions on the spine, look for a white break.
  3. At each edge of the break you will see the end of a partition wall (the door jamb).
  4. A swing arc curves into the corridor (or into the room) from one of those jambs.
  5. centrePx = midpoint between the two partition endpoints flanking the gap.
  6. hostWallId = the spine wall sub-segment that runs between those two partitions.

IMPORTANT: even if the spine wall sub-segment appears very short (just the width of one
door bay), it IS a valid wall. Assign the door to that sub-segment. Do not assign it
to an adjacent longer sub-segment or to one of the transverse partitions.

If a geometric door gap centre has been provided (see list above), and you see a swing
arc near that location on a spine wall, CONFIRM it as a corridor door using the provided
centrePx. The hostWallId = the spine wall whose centreline passes through that centrePx.

DASHED ARC DOORS:
- A dashed swing arc indicates a door below the cutting plane (e.g. an external door,
  cellar hatch, or door on a lower level). Treat the same as a solid arc door.
- Find the wall gap first, then confirm the dashed arc swings from one jamb.
- Report with confidence="medium" unless the gap is also very clearly visible.

DOUBLE-SWING DOORS:
When two quarter-circle arcs meet symmetrically at a wall gap — one arc swinging to each side — this is ONE double-swing door. Rules:
  - Report as a SINGLE opening with type="door"
  - centrePx = midpoint of the full gap (between the two outer jambs)
  - widthPx = full gap width spanning both leaves
  - confidence = "high" if both arcs and both jambs are clearly visible
Do NOT report two separate openings. The deduplication logic will not catch this reliably if the two centres are far apart — you must report it as one from the start.

OPENING RULES:
- hostWallId MUST be one of the exact wall IDs listed in the confirmed wall context. Do NOT
  invent new IDs. Match to the wall whose centreline the gap sits on.
- centrePx MUST lie ON or within 5 px of the host wall centreline. If your centrePx is far
  from all wall centrelines, you have measured the arc centroid — correct it to the gap midpoint.
- WALL MISSING: if you see a clear door arc but the wall it sits on is NOT in the confirmed
  wall list, DO NOT report that door. The wall detection missed it — reporting a door without
  a wall will place it incorrectly. Skip it.
- Report EVERY door and EVERY window you can identify with confidence ≥ medium.
- Omit openings you are less than 50% certain about — do not pad with low-confidence guesses.
- Limit: maximum 40 openings (doors + windows combined).

GENERAL:
- "high" = gap AND indicator (arc/glazing) both clearly visible.
- "medium" = gap visible but indicator unclear, OR indicator clear but gap slightly ambiguous.
- "low" = use only if you are 50–65% certain. Omit entirely if below 50%.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;
const FURNITURE_SYSTEM_PROMPT = `You are an expert architectural floor plan symbol analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: identify furniture and plumbing fixture symbols in the floor plan image.

Furniture symbols to detect:
- bed: rectangle with circle (pillow) at one end
- wardrobe: rectangle with diagonal lines or sliding door marks
- sofa: rectangle with armrests; corner_sofa: L-shape
- dining_table: rectangle surrounded by small chair rectangles
- dining_chair: small square near dining table
- coffee_table: small rectangle near sofa
- bedside_table: small square beside a bed
- entrance_table: small rectangular table near entrance
- toilet: D-shape (cistern + oval bowl)
- sink: rectangle with circle inside
- bath: large rectangle with rounded ends
- shower_glass_panel: square/rectangle with diagonal line

Output schema (STRICT — no extra fields):
{
  "furniture": [
    {
      "id": "f1",
      "furnitureType": string,
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "depthPx": number,
      "rotationDeg": number,
      "room": string,
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Rules:
- furnitureType must be one of: bed, wardrobe, corner_wardrobe, sofa, corner_sofa, dining_table, dining_chair, coffee_table, bedside_table, entrance_table, toilet, sink, bath, shower_glass_panel
- rotationDeg: 0 = symbol facing right, 90 = facing down, 180 = facing left, 270 = facing up
- room: best guess room name e.g. "bedroom", "bathroom", "kitchen", "living_room"
- Pixel coordinates from top-left (x=right, y=down).
- Limit output to a maximum of 25 furniture items.
- Return ONLY the JSON object. No explanation. No trailing text after the closing brace.`;
async function callClaude(options) {
  const { model, systemPrompt, userText, imageBase64, maxTokens } = options;
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageBase64
            }
          },
          { type: "text", text: userText }
        ]
      }]
    })
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`[FloorPlanAIFactory] API error ${response.status}: ${JSON.stringify(errBody)}`);
  }
  const data = await response.json();
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return text.replace(/```json|```/g, "").trim();
}
function safeParseJSON(raw, label) {
  const result = repairAndParseJSON(raw, label);
  if (result !== null) return result;
  throw new Error(`[FloorPlanAIFactory] Unrecoverable JSON from ${label}. See console for details.`);
}
function buildAnnotationZoneText(annotations) {
  if (!annotations || annotations.length === 0) return "";
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const a of annotations) {
    const key = `${a.text}|${Math.round(a.x / 10)}|${Math.round(a.y / 10)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(a);
    }
  }
  const capped = unique.slice(0, 60);
  const lines = capped.map(
    (a) => `  "${a.text}" at pixel region x=${a.x}–${a.x + a.width}, y=${a.y}–${a.y + a.height}`
  );
  return `

KNOWN TEXT ANNOTATIONS in this plan (extracted from PDF — these are text labels, NOT walls):
Do NOT trace any of these regions as wall segments:
` + lines.join("\n");
}
function buildWallContextText(walls) {
  if (walls.length === 0) return "(no walls detected in stage B1)";
  const lines = walls.map(
    (w) => `${w.id} (${w.wallType}): from pixel (${Math.round(w.startPx.x)}, ${Math.round(w.startPx.y)}) to pixel (${Math.round(w.endPx.x)}, ${Math.round(w.endPx.y)})`
  );
  return lines.join("\n");
}
function buildGeometricDoorCentreText(gaps) {
  if (gaps.length === 0) return "";
  const lines = gaps.map((g, i) => {
    const angleName = Math.abs(g.wallAngleDeg % 180) < 10 ? "horizontal wall" : Math.abs(g.wallAngleDeg % 180 - 90) < 10 ? "vertical wall" : `wall at ${g.wallAngleDeg}°`;
    return `  Gap ${i + 1}: centrePx=(${g.centrePx.x}, ${g.centrePx.y}), gapWidthPx=${g.gapWidthPx}, ${angleName}, jambs at (${g.jamb1Px.x},${g.jamb1Px.y}) and (${g.jamb2Px.x},${g.jamb2Px.y}) [walls: ${g.wallAId} / ${g.wallBId}]`;
  });
  return `

GEOMETRICALLY-COMPUTED DOOR GAP CENTRES (Phase H — wall terminator midpoint formula):
These centrePx values were calculated EXACTLY using M = ((x1+x2)/2, (y1+y2)/2) where
x1,y1 and x2,y2 are the pixel coordinates of the two facing wall terminator endpoints.
They are more accurate than visual arc-centroid estimation.

` + lines.join("\n") + `

INSTRUCTIONS FOR EACH GAP ABOVE:
1. Look at pixel location centrePx in the image.
2. If you see a door swing arc (thin curved line) near that location → confirm as DOOR.
3. Use the provided centrePx EXACTLY as the "centrePx" field in your output.
   DO NOT adjust it toward the arc centroid or bounding box centre.
4. Assign hostWallId = the wall from the confirmed list above whose centreline the gap sits on.
   The "walls" field in the gap line above shows the two candidate wall IDs.
5. If NO arc is present → it may be a window (check for glazing lines) or an archway. Report correctly.
6. If you identify additional doors NOT in this list (your visual scan found an arc in a new location),
   report them too — but use the standard gap-midpoint rule for their centrePx.`;
}
class FloorPlanAIFactory {
  /**
   * Stage A: Preliminary door gap detection (runs BEFORE Stage B1).
   *
   * Uses Claude Haiku for speed and cost efficiency. Its sole purpose is to
   * locate door gap positions and wall orientations so DoorGapInpainter can
   * draw dashed continuation lines through those gaps. The modified image is
   * then passed to Stage B1 (wall detection) so that the wall-detection AI sees
   * a visual cue that a wall exists through the door area — eliminating broken
   * or missing wall segments at door openings.
   *
   * Stage A does NOT require hostWallId — walls have not been detected yet.
   * Returns only: centrePx, widthPx, wallAngleDeg for each detected gap.
   */
  static async analyseDoorGapsPreliminary(opts) {
    console.log("[FloorPlanAIFactory] Stage A: detecting door gaps for pre-inpainting…");
    try {
      const raw = await callClaude({
        model: "claude-haiku-4-5-20251014",
        systemPrompt: DOOR_GAP_PRELIM_SYSTEM_PROMPT,
        userText: `Locate all door gap positions in this floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px. Return only valid JSON matching the schema.`,
        imageBase64: opts.base64Image,
        maxTokens: 1024
      });
      const parsed = safeParseJSON(raw, "A-door-gaps");
      const gaps = Array.isArray(parsed?.doorGaps) ? parsed.doorGaps.filter(
        (g) => g && typeof g.centrePx?.x === "number" && typeof g.centrePx?.y === "number" && typeof g.widthPx === "number" && typeof g.wallAngleDeg === "number"
      ) : [];
      console.log(`[FloorPlanAIFactory] Stage A complete: ${gaps.length} door gap(s) detected.`);
      return gaps;
    } catch (err) {
      console.warn("[FloorPlanAIFactory] Stage A failed (non-fatal) — proceeding without door gap inpainting:", err);
      return [];
    }
  }
  /**
   * Stage B1: Detect walls and slab outline ONLY.
   * Uses Claude Sonnet. No openings — openings are handled by B2 with wall context.
   *
   * PHASE C: This is the first half of the two-step structure detection split.
   */
  static async analyseWallsAndSlab(opts) {
    const contextNote = opts.extractedText ? `

Extracted text from the PDF (use for room labels and scale context only — do NOT trace these as walls):
${opts.extractedText.slice(0, 500)}` : "";
    const annotationZone = buildAnnotationZoneText(opts.textAnnotations);
    if (annotationZone) {
      console.log(`[FloorPlanAIFactory] Stage B1: injecting ${opts.textAnnotations.length} annotation exclusion zones into prompt (Phase G)`);
    }
    const segments = opts.detectedSegments ?? [];
    const useGuidedMode = segments.length >= F2_MIN_SEGMENTS;
    let systemPrompt;
    let userText;
    if (useGuidedMode) {
      const segmentBlock = formatSegmentsForPrompt(segments);
      systemPrompt = STRUCTURE_B1_GUIDED_SYSTEM_PROMPT;
      userText = `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}${annotationZone}

Phase F1 algorithmic pre-processing detected ${segments.length} line segments in this image:
` + segmentBlock + `

For each segment above, classify it as a wall (exterior/interior) or reject it. Pay special attention to the ANNOTATION EXCLUSION rules — reject any segment that overlaps a known text annotation zone listed above, or that clearly matches a dimension line, room label, or hatching line. Also identify the floor slab boundary. Do NOT report openings — those are handled in a separate step. Return only valid JSON matching the schema.`;
      console.log(`[FloorPlanAIFactory] Stage B1 (GUIDED — Phase F2): classifying ${segments.length} pre-detected segments…`);
    } else {
      systemPrompt = STRUCTURE_B1_SYSTEM_PROMPT;
      userText = `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}${annotationZone}

Identify ALL structural walls and the floor slab boundary. Apply the ANNOTATION EXCLUSION rules first — do NOT report room name labels, dimension lines, hatching, or other annotation as walls. Do NOT report openings (doors/windows) — those will be identified in a separate step. Return only valid JSON matching the schema.`;
      console.log(`[FloorPlanAIFactory] Stage B1 (standard): detecting walls and slab (F1 yielded ${segments.length} segments — below guided threshold)…`);
    }
    const raw = await callClaude({
      model: "claude-sonnet-4-20250514",
      systemPrompt,
      userText,
      imageBase64: opts.base64Image,
      maxTokens: 8192
    });
    const parsed = safeParseJSON(raw, "B1-walls-slab");
    const walls = Array.isArray(parsed.walls) ? parsed.walls : [];
    console.log(`[FloorPlanAIFactory] Stage B1 complete: ${walls.length} walls, slab=${parsed.slab ? "yes" : "no"}`);
    return {
      walls,
      slab: parsed.slab ?? null
    };
  }
  /**
   * Stage B2: Detect openings (doors & windows) using confirmed wall IDs as context.
   * Claude receives the wall list from B1 as plain text so it cannot hallucinate
   * wall IDs — it must pick from the provided list.
   *
   * PHASE C: This is the second half of the two-step structure detection split.
   * Success criterion: hostWallId match rate >95% vs ~70% with the combined call.
   */
  static async analyseOpenings(opts, walls, geometricDoorGaps = []) {
    const wallContext = buildWallContextText(walls);
    const geometricCentreBlock = buildGeometricDoorCentreText(geometricDoorGaps);
    const contextNote = opts.extractedText ? `

Extracted text from the PDF:
${opts.extractedText.slice(0, 300)}` : "";
    const userText = `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}

Confirmed walls from stage B1 (use ONLY these exact IDs for hostWallId — do not invent new IDs):
${wallContext}${geometricCentreBlock}

Identify ALL doors and windows in the plan. For each opening, assign it to the wall from the list above whose centreline it sits on. ` + (geometricDoorGaps.length > 0 ? `PRIORITY: process the geometrically-computed door gap centres listed above FIRST — these have mathematically precise centrePx values. Then scan for any additional doors your visual analysis finds. ` : "") + `Return only valid JSON matching the schema.`;
    console.log(
      `[FloorPlanAIFactory] Stage B2: detecting openings with ${walls.length} wall IDs` + (geometricDoorGaps.length > 0 ? ` + ${geometricDoorGaps.length} geometric door gap centres (Phase H) as context…` : "…")
    );
    const raw = await callClaude({
      model: "claude-sonnet-4-20250514",
      systemPrompt: STRUCTURE_B2_SYSTEM_PROMPT,
      userText,
      imageBase64: opts.base64Image,
      maxTokens: 4096
    });
    const parsed = safeParseJSON(raw, "B2-openings");
    const openings = Array.isArray(parsed.openings) ? parsed.openings : [];
    console.log(`[FloorPlanAIFactory] Stage B2 complete: ${openings.length} openings`);
    return openings;
  }
  /**
   * Stage B (combined): Run B1 (walls/slab) then B2 (openings with wall context).
   * This replaces the old single-call analyseStructure() with a two-step pipeline
   * per Phase C of the PDF_TO_BIM_DEEP_AUDIT reconstruction strategy.
   *
   * The public interface is unchanged — callers still receive
   * { walls, openings, slab } exactly as before.
   */
  static async analyseStructure(opts) {
    const { walls, slab } = await FloorPlanAIFactory.analyseWallsAndSlab(opts);
    let openings = [];
    if (opts.includeStructure) {
      openings = await FloorPlanAIFactory.analyseOpenings(opts, walls);
    }
    return { walls, openings, slab };
  }
  /**
   * Stage C: Analyse furniture and plumbing fixtures.
   * Uses Claude Haiku for cost efficiency. Unchanged from original implementation.
   */
  static async analyseFurniture(opts) {
    const contextNote = opts.extractedText ? `

Extracted text from PDF:
${opts.extractedText.slice(0, 300)}` : "";
    const userText = `Identify all furniture and plumbing fixture symbols in this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}

Return only valid JSON matching the schema.`;
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251014",
      systemPrompt: FURNITURE_SYSTEM_PROMPT,
      userText,
      imageBase64: opts.base64Image,
      maxTokens: 2048
    });
    const parsed = safeParseJSON(raw, "furniture");
    return Array.isArray(parsed.furniture) ? parsed.furniture : [];
  }
  /**
   * Full pipeline: run Stage B (B1 → B2) and optionally Stage C, return combined analysis.
   * Public interface UNCHANGED — FloorPlanImportPanel.ts is not affected.
   */
  static async analyse(opts, onProgress) {
    const analysis = {
      walls: [],
      openings: [],
      slab: null,
      furniture: [],
      imageDimensions: { widthPx: opts.widthPx, heightPx: opts.heightPx }
    };
    if (opts.includeStructure) {
      onProgress?.("Stage A: Locating door gaps for wall-continuity inpainting…");
      const doorGaps = await FloorPlanAIFactory.analyseDoorGapsPreliminary(opts);
      const inpaintedBase64 = await DoorGapInpainter.paint(
        opts.base64Image,
        { widthPx: opts.widthPx, heightPx: opts.heightPx },
        doorGaps
      );
      const optsInpainted = {
        ...opts,
        base64Image: inpaintedBase64
      };
      const segments = opts.detectedSegments ?? [];
      const b1Label = segments.length >= F2_MIN_SEGMENTS ? `Stage B1 (guided — ${segments.length} pre-detected segments): Classifying walls and slab…` : "Stage B1: Detecting walls and slab outline…";
      onProgress?.(b1Label);
      const { walls, slab } = await FloorPlanAIFactory.analyseWallsAndSlab(optsInpainted);
      analysis.walls = walls;
      analysis.slab = slab;
      const geometricDoorGaps = detectGeometricDoorGaps(walls);
      if (geometricDoorGaps.length > 0) {
        console.log(
          `[FloorPlanAIFactory] Phase H: ${geometricDoorGaps.length} geometric door gap(s) detected — injecting precise centrePx values into Stage B2 prompt.`
        );
      }
      onProgress?.(`Stage B2: Detecting openings (doors & windows) using ${walls.length} confirmed walls + ${geometricDoorGaps.length} geometric door centres…`);
      analysis.openings = await FloorPlanAIFactory.analyseOpenings(opts, walls, geometricDoorGaps);
    }
    if (opts.includeFurniture || opts.includePlumbing) {
      onProgress?.("Stage C: Analysing furniture & fixtures…");
      const furniture = await FloorPlanAIFactory.analyseFurniture(opts);
      analysis.furniture = furniture;
    }
    return analysis;
  }
}

function getOpeningSubType(p) {
  const t = p.intentType.toUpperCase();
  if (t.includes("DOOR")) return "door";
  if (t.includes("WINDOW")) return "window";
  return "other";
}
function sortIntoExecutionOrder(proposals) {
  const walls = [];
  const slabs = [];
  const doors = [];
  const windows = [];
  const other = [];
  for (const p of proposals) {
    switch (p.command.type) {
      case CommandType.CREATE_WALL:
        walls.push(p);
        break;
      case CommandType.CREATE_SLAB:
        slabs.push(p);
        break;
      case CommandType.ADD_OPENING: {
        const sub = getOpeningSubType(p);
        if (sub === "door") doors.push(p);
        else if (sub === "window") windows.push(p);
        else other.push(p);
        break;
      }
      default:
        other.push(p);
    }
  }
  return [...walls, ...slabs, ...doors, ...windows, ...other];
}
function appendAudit(proposal, approvedBy) {
  try {
    aiApprovalStore.append({
      id: crypto.randomUUID(),
      proposalId: proposal.id,
      intent: proposal.intentType,
      commandType: proposal.command.type,
      commandSnapshot: proposal.command.serialize(),
      approvedBy,
      approvedAt: (/* @__PURE__ */ new Date()).toISOString(),
      rationale: proposal.rationale,
      confidence: proposal.confidence,
      validationSummary: proposal.validation.ok ? "VALID" : proposal.validation.reason || "FAILED"
    });
  } catch (e) {
    console.warn("[FloorPlanBatchExecutor] Audit append failed:", e);
  }
}
class FloorPlanBatchExecutor {
  /**
   * Execute all proposals in dependency order.
   *
   * For ADD_OPENING commands whose host wall is not yet in the store but is
   * present in the proposals list, the wall is executed first automatically
   * (same guard logic as AIPanel.approveProposal).
   *
   * @param proposals - All proposals generated by FloorPlanCommandBatcher.
   * @param onProgress - Optional callback for UI progress updates.
   * @returns BatchExecutionResult with counts and any failures.
   */
  static execute(proposals, onProgress) {
    const manager = window.commandManager;
    if (!manager) {
      console.error("[FloorPlanBatchExecutor] commandManager not available");
      const failedAll = proposals.map((p) => ({
        proposal: p,
        reason: "CommandManager unavailable — page may need a refresh"
      }));
      return {
        succeeded: 0,
        failed: proposals.length,
        summary: { walls: 0, slab: 0, doors: 0, windows: 0, other: 0 },
        failedProposals: failedAll
      };
    }
    const sorted = sortIntoExecutionOrder(proposals);
    const total = sorted.length;
    let succeeded = 0;
    let failed = 0;
    const failedProposals = [];
    const summary = { walls: 0, slab: 0, doors: 0, windows: 0, other: 0 };
    const executedProposalIds = /* @__PURE__ */ new Set();
    for (let i = 0; i < sorted.length; i++) {
      const proposal = sorted[i];
      const cmd = proposal.command;
      if (executedProposalIds.has(proposal.id)) continue;
      onProgress?.(`Executing ${proposal.intentType}…`, i, total);
      try {
        if (cmd.type === CommandType.ADD_OPENING && cmd.targetIds[0]) {
          const wallId = cmd.targetIds[0];
          const wallStore = window.wallStore;
          const wallExists = wallStore ? !!wallStore.getById(wallId) : false;
          if (!wallExists) {
            const wallProposal = sorted.find(
              (p) => p.command.type === CommandType.CREATE_WALL && p.command.targetIds[0] === wallId && !executedProposalIds.has(p.id)
            );
            if (wallProposal) {
              console.log("[FloorPlanBatchExecutor] Auto-executing parent wall:", wallId);
              const wallResult = manager.execute(wallProposal.command, {
                source: "PDF_IMPORT_BATCH",
                proposalId: wallProposal.id
              });
              if (wallResult.success) {
                executedProposalIds.add(wallProposal.id);
                summary.walls++;
                succeeded++;
                appendAudit(wallProposal, "System (auto-dependency)");
              } else {
                const reason = wallResult.info?.join(", ") || "Failed to auto-create parent wall";
                console.warn("[FloorPlanBatchExecutor] Parent wall failed:", reason);
              }
            }
          }
        }
        const result = manager.execute(cmd, {
          source: "PDF_IMPORT_BATCH",
          proposalId: proposal.id
        });
        if (result.success) {
          executedProposalIds.add(proposal.id);
          succeeded++;
          switch (cmd.type) {
            case CommandType.CREATE_WALL:
              summary.walls++;
              break;
            case CommandType.CREATE_SLAB:
              summary.slab++;
              break;
            case CommandType.ADD_OPENING: {
              const sub = getOpeningSubType(proposal);
              if (sub === "door") summary.doors++;
              else if (sub === "window") summary.windows++;
              else summary.other++;
              break;
            }
            default:
              summary.other++;
          }
          appendAudit(proposal, "User (batch)");
        } else {
          failed++;
          const reason = result.info?.join(", ") || "Execution failed";
          failedProposals.push({ proposal, reason });
          console.warn(`[FloorPlanBatchExecutor] Failed: ${proposal.intentType} — ${reason}`);
        }
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        failedProposals.push({ proposal, reason });
        console.error(`[FloorPlanBatchExecutor] Error: ${proposal.intentType}`, err);
      }
    }
    onProgress?.("Complete", total, total);
    window.dispatchEvent(new CustomEvent("model-updated"));
    window.dispatchEvent(new CustomEvent("ai-model-update"));
    window.dispatchEvent(new CustomEvent("update-view-browser"));
    console.log(
      `[FloorPlanBatchExecutor] Done — ${succeeded} succeeded / ${failed} failed`,
      summary
    );
    return { succeeded, failed, summary, failedProposals };
  }
}

const MIN_WALL_LENGTH_M$1 = 0.6;
const SNAP_M = 0.3;
const MIN_ROOM_AREA_M2 = 0.5;
const GRID_SCALE = 4;
const THICKNESS_MIN_PX = 8;
const ORTHO_TOL_DEG = 5;
const ACCEPT_THRESHOLD = 8;
const REVIEW_MIN_THRESHOLD = 5;
class WallCandidateScorer {
  /**
   * Score all wall candidates.
   *
   * @param walls          - Resolved wall list (after crossing split).
   * @param openings       - AI-detected openings (before wall assignment).
   * @param imageWidthPx   - Width of the original AI image in pixels.
   * @param imageHeightPx  - Height of the original AI image in pixels.
   * @param pxPerMeter     - Image-space pixels per world-space metre.
   * @returns              Per-wall WallScore[] in the same order as `walls`.
   */
  score(walls, openings, imageWidthPx, imageHeightPx, pxPerMeter) {
    if (walls.length === 0) return [];
    const roomBorderCount = this._computeRoomBoundaryMembership(
      walls,
      imageWidthPx,
      imageHeightPx,
      pxPerMeter
    );
    const wallHasOpening = /* @__PURE__ */ new Map();
    for (const wall of walls) {
      const matched = openings.some(
        (o) => o.hostWallAiId === wall.aiId || wall.aiId.startsWith(o.hostWallAiId + "_s")
      );
      wallHasOpening.set(wall.wallUUID, matched);
    }
    const dominantAngles = this._computeDominantAngles(walls);
    return walls.map((wall) => {
      const breakdown = {
        thickness: this._scoreThickness(wall),
        roomBoundary: this._scoreRoomBoundary(wall, roomBorderCount),
        topologicalConnection: this._scoreTopologicalConnection(
          wall,
          walls,
          wallHasOpening
        ),
        length: this._scoreLength(wall),
        orientation: this._scoreOrientation(wall, dominantAngles),
        pixelDensity: this._scorePixelDensity()
      };
      const totalScore = breakdown.thickness + breakdown.roomBoundary + breakdown.topologicalConnection + breakdown.length + breakdown.orientation + breakdown.pixelDensity;
      let decision;
      let reviewFlag = false;
      let rejectReason;
      if (totalScore >= ACCEPT_THRESHOLD) {
        decision = "accept";
      } else if (totalScore >= REVIEW_MIN_THRESHOLD) {
        decision = "review";
        reviewFlag = true;
      } else {
        decision = "reject";
        rejectReason = "low_wall_score";
      }
      const result = {
        wallUUID: wall.wallUUID,
        totalScore,
        breakdown,
        decision,
        reviewFlag
      };
      if (rejectReason !== void 0) {
        result.rejectReason = rejectReason;
      }
      return result;
    });
  }
  // ── Signal 1: Thickness (weight 3) ──────────────────────────────────────
  _scoreThickness(wall) {
    return wall.thicknessPx >= THICKNESS_MIN_PX ? 3 : 0;
  }
  // ── Signal 2: Room boundary membership (weight 3) ───────────────────────
  /**
   * Rasterize all walls to a downscaled binary grid, then BFS flood-fill
   * all connected empty-pixel regions. Count how many valid-area rooms each
   * wall borders (via 8-connectivity with its rasterized pixels).
   *
   * Returns a Map<wallUUID, roomCount>.
   */
  _computeRoomBoundaryMembership(walls, imageWidthPx, imageHeightPx, pxPerMeter) {
    const gridW = Math.max(1, Math.ceil(imageWidthPx / GRID_SCALE));
    const gridH = Math.max(1, Math.ceil(imageHeightPx / GRID_SCALE));
    const totalCells = gridW * gridH;
    const grid = new Uint8Array(totalCells);
    const wallPixelSets = /* @__PURE__ */ new Map();
    for (const wall of walls) {
      wallPixelSets.set(wall.wallUUID, /* @__PURE__ */ new Set());
    }
    for (const wall of walls) {
      const pixSet = wallPixelSets.get(wall.wallUUID);
      if (pixSet === void 0) continue;
      const gx1 = Math.floor(wall.rawPixel.startPx.x / GRID_SCALE);
      const gy1 = Math.floor(wall.rawPixel.startPx.y / GRID_SCALE);
      const gx2 = Math.floor(wall.rawPixel.endPx.x / GRID_SCALE);
      const gy2 = Math.floor(wall.rawPixel.endPx.y / GRID_SCALE);
      const radius = Math.max(1, Math.ceil(wall.thicknessPx / GRID_SCALE / 2));
      this._rasterizeLine(grid, gx1, gy1, gx2, gy2, radius, gridW, gridH, pixSet);
    }
    const minRoomAreaCells = Math.max(
      4,
      Math.round(MIN_ROOM_AREA_M2 * pxPerMeter * pxPerMeter / (GRID_SCALE * GRID_SCALE))
    );
    const regionId = new Uint32Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      if (grid[i] === 1) regionId[i] = 1;
    }
    const regionAreas = [0, 0];
    let nextRegion = 2;
    const queue = new Int32Array(totalCells);
    for (let startIdx = 0; startIdx < totalCells; startIdx++) {
      if (regionId[startIdx] !== 0) continue;
      const thisRegion = nextRegion++;
      regionAreas.push(0);
      regionId[startIdx] = thisRegion;
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      let area = 0;
      while (head < tail) {
        const cellIdx = queue[head++];
        area++;
        const cx = cellIdx % gridW;
        const cy = Math.floor(cellIdx / gridW);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
            const ni = ny * gridW + nx;
            if (regionId[ni] !== 0) continue;
            regionId[ni] = thisRegion;
            queue[tail++] = ni;
          }
        }
      }
      regionAreas[thisRegion] = area;
    }
    const validRooms = /* @__PURE__ */ new Set();
    for (let r = 2; r < regionAreas.length; r++) {
      const area = regionAreas[r];
      if (area !== void 0 && area >= minRoomAreaCells) {
        validRooms.add(r);
      }
    }
    const result = /* @__PURE__ */ new Map();
    for (const wall of walls) {
      const pixSet = wallPixelSets.get(wall.wallUUID);
      if (pixSet === void 0) {
        result.set(wall.wallUUID, 0);
        continue;
      }
      const borderedRooms = /* @__PURE__ */ new Set();
      for (const cellIdx of pixSet) {
        const cx = cellIdx % gridW;
        const cy = Math.floor(cellIdx / gridW);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
            const ni = ny * gridW + nx;
            const r = regionId[ni];
            if (r !== void 0 && validRooms.has(r)) {
              borderedRooms.add(r);
            }
          }
        }
      }
      result.set(wall.wallUUID, borderedRooms.size);
    }
    return result;
  }
  /**
   * Bresenham's line algorithm with a circular brush of `radius` grid cells.
   * Writes 1 into `grid` at each covered cell and records cell indices in `outPixels`.
   */
  _rasterizeLine(grid, x1, y1, x2, y2, radius, gridW, gridH, outPixels) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let cx = x1;
    let cy = y1;
    const r2 = radius * radius;
    for (; ; ) {
      for (let ry = -radius; ry <= radius; ry++) {
        for (let rx = -radius; rx <= radius; rx++) {
          if (rx * rx + ry * ry > r2) continue;
          const nx = cx + rx;
          const ny = cy + ry;
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
          const idx = ny * gridW + nx;
          grid[idx] = 1;
          outPixels.add(idx);
        }
      }
      if (cx === x2 && cy === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }
  _scoreRoomBoundary(wall, roomBorderCount) {
    const count = roomBorderCount.get(wall.wallUUID) ?? 0;
    return count >= 1 ? 3 : 0;
  }
  // ── Signal 3: Topological connection (weight 1) ──────────────────────────
  _scoreTopologicalConnection(wall, allWalls, wallHasOpening) {
    if (wallHasOpening.get(wall.wallUUID) === true) return 1;
    for (const other of allWalls) {
      if (other.wallUUID === wall.wallUUID) continue;
      if (wall.start.distanceTo(other.start) < SNAP_M || wall.start.distanceTo(other.end) < SNAP_M || wall.end.distanceTo(other.start) < SNAP_M || wall.end.distanceTo(other.end) < SNAP_M) {
        return 1;
      }
    }
    return 0;
  }
  // ── Signal 4: Length (weight 1) ─────────────────────────────────────────
  _scoreLength(wall) {
    const len = wall.start.distanceTo(wall.end);
    return len >= MIN_WALL_LENGTH_M$1 ? 1 : 0;
  }
  // ── Signal 5: Orientation (weight 1) ────────────────────────────────────
  /**
   * Find dominant non-orthogonal angles across all walls (for diagonal-wing plans).
   * Returns angle values in [0, 180) degrees that appear in >= 2 walls and
   * account for >= 50% of the peak bin count (5° bins).
   */
  _computeDominantAngles(walls) {
    const ORTHO_EXCLUSION = 10;
    const angles = walls.map((w) => {
      const dx = w.end.x - w.start.x;
      const dz = w.end.z - w.start.z;
      let a = Math.atan2(dz, dx) * 180 / Math.PI;
      if (a < 0) a += 180;
      if (a >= 180) a -= 180;
      return a;
    });
    const nonOrtho = angles.filter(
      (a) => Math.abs(a) > ORTHO_EXCLUSION && Math.abs(a - 90) > ORTHO_EXCLUSION && Math.abs(a - 180) > ORTHO_EXCLUSION
    );
    if (nonOrtho.length < 2) return [];
    const bins = /* @__PURE__ */ new Map();
    for (const a of nonOrtho) {
      const bin = Math.round(a / 5) * 5;
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
    if (bins.size === 0) return [];
    const maxCount = Math.max(...bins.values());
    if (maxCount < 2) return [];
    return Array.from(bins.entries()).filter(([, count]) => count >= 2 && count >= maxCount * 0.5).map(([bin]) => bin);
  }
  _scoreOrientation(wall, dominantAngles) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    let angle = Math.atan2(dz, dx) * 180 / Math.PI;
    if (angle < 0) angle += 180;
    if (angle >= 180) angle -= 180;
    if (angle <= ORTHO_TOL_DEG || Math.abs(angle - 90) <= ORTHO_TOL_DEG || Math.abs(angle - 180) <= ORTHO_TOL_DEG) {
      return 1;
    }
    for (const dom of dominantAngles) {
      if (Math.abs(angle - dom) <= ORTHO_TOL_DEG) return 1;
    }
    return 0;
  }
  // ── Signal 6: Pixel density uniformity (weight 1) ───────────────────────
  /**
   * Coefficient of variation of dark-pixel counts sampled along the segment.
   * Because the image raster data is not available at the scoring stage
   * (only Claude's JSON analysis is passed to the batcher), this signal defaults
   * to awarding full credit. A real wall is not penalised for lack of image access.
   *
   * If image data is provided in a future extension of this scorer, replace this
   * method with actual column-by-column dark-pixel sampling.
   */
  _scorePixelDensity() {
    return 1;
  }
}

const MAX_GAP_TO_WALL_RATIO = 0.7;
const CORRIDOR_JAMB_PROXIMITY_PX = 200;
function findCollinearEndpoints(targetWall, walls, openingCentrePx, collinearDistTol = 12) {
  const dx = targetWall.endPx.x - targetWall.startPx.x;
  const dy = targetWall.endPx.y - targetWall.startPx.y;
  const wallPixelLen = Math.hypot(dx, dy);
  if (wallPixelLen < 1) return null;
  const wDirX = dx / wallPixelLen;
  const wDirY = dy / wallPixelLen;
  const ocDx = openingCentrePx.x - targetWall.startPx.x;
  const ocDy = openingCentrePx.y - targetWall.startPx.y;
  const openingProj1D = ocDx * wDirX + ocDy * wDirY;
  const candidates1D = [];
  for (const w of walls) {
    for (const pt of [w.startPx, w.endPx]) {
      const toPtX = pt.x - targetWall.startPx.x;
      const toPtY = pt.y - targetWall.startPx.y;
      const perpD = Math.abs(toPtX * wDirY - toPtY * wDirX);
      if (perpD > collinearDistTol) continue;
      const proj1D = toPtX * wDirX + toPtY * wDirY;
      candidates1D.push(proj1D);
    }
  }
  const ENDPOINT_EXCLUSION_PX = 10;
  const filteredCandidates = candidates1D.filter(
    (p) => p > ENDPOINT_EXCLUSION_PX && p < wallPixelLen - ENDPOINT_EXCLUSION_PX
  );
  const below = filteredCandidates.filter((p) => p < openingProj1D - 1);
  const above = filteredCandidates.filter((p) => p > openingProj1D + 1);
  if (below.length === 0 || above.length === 0) return null;
  const isJunctionNode = (proj1D) => {
    if (Math.abs(proj1D - openingProj1D) <= CORRIDOR_JAMB_PROXIMITY_PX) {
      return false;
    }
    const ptX = targetWall.startPx.x + proj1D * wDirX;
    const ptY = targetWall.startPx.y + proj1D * wDirY;
    let hasCollinearEndpoint = false;
    for (const w of walls) {
      for (const pt of [w.startPx, w.endPx]) {
        const d = Math.hypot(pt.x - ptX, pt.y - ptY);
        if (d >= collinearDistTol) continue;
        const wLen = Math.hypot(w.endPx.x - w.startPx.x, w.endPx.y - w.startPx.y);
        if (wLen < 1) continue;
        const wdx = (w.endPx.x - w.startPx.x) / wLen;
        const wdy = (w.endPx.y - w.startPx.y) / wLen;
        const dot = Math.abs(wdx * wDirX + wdy * wDirY);
        if (dot >= 0.5) {
          hasCollinearEndpoint = true;
          break;
        }
      }
      if (hasCollinearEndpoint) break;
    }
    if (hasCollinearEndpoint) return false;
    for (const w of walls) {
      for (const pt of [w.startPx, w.endPx]) {
        const d = Math.hypot(pt.x - ptX, pt.y - ptY);
        if (d >= collinearDistTol) continue;
        const wLen = Math.hypot(w.endPx.x - w.startPx.x, w.endPx.y - w.startPx.y);
        if (wLen < 1) continue;
        const wdx = (w.endPx.x - w.startPx.x) / wLen;
        const wdy = (w.endPx.y - w.startPx.y) / wLen;
        const dot = Math.abs(wdx * wDirX + wdy * wDirY);
        if (dot < 0.5) return true;
      }
    }
    let count = 0;
    for (const w of walls) {
      const dStart = Math.hypot(w.startPx.x - ptX, w.startPx.y - ptY);
      const dEnd = Math.hypot(w.endPx.x - ptX, w.endPx.y - ptY);
      if (dStart < collinearDistTol || dEnd < collinearDistTol) count++;
    }
    return count >= 3;
  };
  const validBelow = below.filter((p) => !isJunctionNode(p));
  const validAbove = above.filter((p) => !isJunctionNode(p));
  if (validBelow.length === 0 || validAbove.length === 0) return null;
  const closestBelow = Math.max(...validBelow);
  const closestAbove = Math.min(...validAbove);
  if (closestAbove <= closestBelow) return null;
  const gapStart = closestBelow;
  const gapEnd = closestAbove;
  const gapIsFilled = walls.some((w) => {
    const wSegDx = w.endPx.x - w.startPx.x;
    const wSegDy = w.endPx.y - w.startPx.y;
    const wSegLen = Math.hypot(wSegDx, wSegDy);
    if (wSegLen < 1) return false;
    const wDx2 = wSegDx / wSegLen;
    const wDy2 = wSegDy / wSegLen;
    const dot = Math.abs(wDx2 * wDirX + wDy2 * wDirY);
    if (dot < 0.985) return false;
    const perpD = Math.abs(
      (w.startPx.x - targetWall.startPx.x) * wDirY - (w.startPx.y - targetWall.startPx.y) * wDirX
    );
    if (perpD > collinearDistTol) return false;
    const s1D = (w.startPx.x - targetWall.startPx.x) * wDirX + (w.startPx.y - targetWall.startPx.y) * wDirY;
    const e1D = (w.endPx.x - targetWall.startPx.x) * wDirX + (w.endPx.y - targetWall.startPx.y) * wDirY;
    const wMin = Math.min(s1D, e1D);
    const wMax = Math.max(s1D, e1D);
    const overlap = Math.min(wMax, gapEnd) - Math.max(wMin, gapStart);
    return overlap > (gapEnd - gapStart) * 0.5;
  });
  if (gapIsFilled) return null;
  const gapWidthPx = gapEnd - gapStart;
  if (gapWidthPx > wallPixelLen * MAX_GAP_TO_WALL_RATIO) {
    console.debug(
      `[DoorGeometricValidator] Gap ${gapWidthPx.toFixed(0)}px rejected — spans ${(gapWidthPx / wallPixelLen * 100).toFixed(0)}% of wall (max ${MAX_GAP_TO_WALL_RATIO * 100}%)`
    );
    return null;
  }
  const gapCentreOffset1D = (gapStart + gapEnd) / 2;
  const correctedCentrePx = {
    x: targetWall.startPx.x + wDirX * gapCentreOffset1D,
    y: targetWall.startPx.y + wDirY * gapCentreOffset1D
  };
  return { gapCentreOffset1D, gapStart1D: gapStart, gapEnd1D: gapEnd, gapWidthPx, correctedCentrePx };
}

const SNAP_GRID_M = 0.05;
const CORNER_SNAP_THRESHOLD_M = 0.1;
const MIN_WALL_LENGTH_M = 0.15;
const DUPLICATE_WALL_THRESHOLD_M = 0.25;
const DEFAULT_WALL_HEIGHT = 3;
const DEFAULT_WALL_THICKNESS = 0.2;
const DEFAULT_SLAB_THICKNESS = 0.2;
const HOST_TIEBREAK_MAX_DIST_M = 0.75;
function measureEffectiveMetersPerPixel(underlayTool, imgWidthPx) {
  const PROBE_SPAN_PX = 100;
  const a = underlayTool.pixelToWorld(0, 0);
  const b = underlayTool.pixelToWorld(PROBE_SPAN_PX, 0);
  if (a && b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z) / PROBE_SPAN_PX;
    if (isFinite(d) && d > 0) return d;
  }
  const planWidthMeters = underlayTool.getState()?.planWidthMeters ?? 10;
  return planWidthMeters / Math.max(1, imgWidthPx);
}
const FURNITURE_TYPE_MAP = {
  bed: "bed",
  wardrobe: "wardrobe",
  corner_wardrobe: "corner_wardrobe",
  sofa: "corner_sofa",
  corner_sofa: "corner_sofa",
  white_corner_sofa: "white_corner_sofa",
  dining_table: "dining_table",
  dining_chair: "dining_chair",
  coffee_table: "coffee_table",
  bedside_table: "bedside_table",
  entrance_table: "entrance_table",
  shower_glass_panel: "shower_glass_panel"
};
const PLUMBING_TYPE_MAP = {
  toilet: "toilet",
  sink: "sink",
  bath: "bath"
};
function snapToGrid(v, gridSize) {
  return Math.round(v / gridSize) * gridSize;
}
function snapVec3(v, gridSize) {
  return new Vector3(
    snapToGrid(v.x, gridSize),
    v.y,
    snapToGrid(v.z, gridSize)
  );
}
function pointToSegmentDistanceXZ(point, segStart, segEnd) {
  const segVec = new Vector3(segEnd.x - segStart.x, 0, segEnd.z - segStart.z);
  const segLen = segVec.length();
  if (segLen < 1e-3) {
    return {
      distance: new Vector3(point.x - segStart.x, 0, point.z - segStart.z).length(),
      projectedOffset: 0
    };
  }
  const segDir = segVec.clone().normalize();
  const toPoint = new Vector3(point.x - segStart.x, 0, point.z - segStart.z);
  const proj = Math.max(0, Math.min(segLen, toPoint.dot(segDir)));
  const closestX = segStart.x + segDir.x * proj;
  const closestZ = segStart.z + segDir.z * proj;
  const dist = new Vector3(point.x - closestX, 0, point.z - closestZ).length();
  return { distance: dist, projectedOffset: proj };
}
function boostConfidence(raw, boost) {
  if (!boost) return raw;
  if (raw === "low") return "medium";
  if (raw === "medium") return "high";
  return "high";
}
const FURNITURE_DEFAULTS = {
  bed: { width: 1.6, length: 2, height: 0.5 },
  wardrobe: { width: 1.2, length: 0.6, height: 2.2 },
  corner_wardrobe: { width: 1.5, length: 1.5, height: 2.2 },
  sofa: { width: 2, length: 0.85, height: 0.85 },
  corner_sofa: { width: 2.4, length: 1.6, height: 0.85 },
  white_corner_sofa: { width: 2.4, length: 1.6, height: 0.85 },
  dining_table: { width: 1.6, length: 0.9, height: 0.75 },
  dining_chair: { width: 0.45, length: 0.45, height: 0.9 },
  coffee_table: { width: 1, length: 0.5, height: 0.45 },
  bedside_table: { width: 0.5, length: 0.4, height: 0.55 },
  entrance_table: { width: 0.8, length: 0.3, height: 0.8 },
  shower_glass_panel: { width: 0.9, length: 0.9, height: 2 },
  toilet: { width: 0.36, length: 0.66, height: 0.8 },
  sink: { width: 0.5, length: 0.4, height: 0.85 },
  bath: { width: 0.75, length: 1.7, height: 0.6 }
};
class FloorPlanCommandBatcher {
  static batch(options) {
    const {
      analysis,
      underlayTool,
      targetLevelId,
      wallHeight = DEFAULT_WALL_HEIGHT,
      includeWalls = true,
      includeSlab = true,
      includeFurniture = true,
      includePlumbing = true,
      includeOpenings = true
    } = options;
    const proposals = [];
    let skipped = 0;
    const summary = { walls: 0, slab: 0, furniture: 0, plumbing: 0, openings: 0, rooms: 0 };
    const metersPerPx = measureEffectiveMetersPerPixel(
      underlayTool,
      analysis.imageDimensions.widthPx
    );
    const proposedSpansByWall = /* @__PURE__ */ new Map();
    const spanConflicts = (wallUUID, leftEdge, width) => {
      const spans = proposedSpansByWall.get(wallUUID);
      if (!spans) return false;
      const s0 = leftEdge - COINCIDENT_M;
      const s1 = leftEdge + width + COINCIDENT_M;
      return spans.some((sp) => s0 < sp.end && s1 > sp.start);
    };
    const claimSpan = (wallUUID, leftEdge, width) => {
      const spans = proposedSpansByWall.get(wallUUID) ?? [];
      spans.push({ start: leftEdge, end: leftEdge + width });
      proposedSpansByWall.set(wallUUID, spans);
    };
    const wallDiagnostics = [];
    const openingDiagnostics = [];
    const diagStats = {
      tJunctionSnaps: 0,
      cornerMerges: 0,
      crossingSplits: 0,
      tooShortSkipped: 0,
      duplicateSkipped: 0,
      pixelMapFailed: 0,
      isolatedAnnotationSkipped: 0,
      wallsAccepted: 0,
      wallScorerRejected: 0,
      wallScorerReview: 0
    };
    const acceptedWalls = [];
    const wallAiIdToEntry = /* @__PURE__ */ new Map();
    if (includeWalls) {
      const wallCoordsRaw = [];
      for (const w of analysis.walls) {
        const startWorld = underlayTool.pixelToWorld(w.startPx.x, w.startPx.y);
        const endWorld = underlayTool.pixelToWorld(w.endPx.x, w.endPx.y);
        if (!startWorld || !endWorld) {
          skipped++;
          diagStats.pixelMapFailed++;
          wallDiagnostics.push({
            index: wallDiagnostics.length,
            aiId: w.id,
            aiWallType: w.wallType,
            aiConfidence: w.confidence,
            rawPixel: {
              startPx: w.startPx,
              endPx: w.endPx,
              thicknessPx: w.thicknessPx
            },
            worldCoords: null,
            postProcessing: { isCrossingSplit: false },
            skipReason: "pixel_map_failed",
            status: "skipped"
          });
          continue;
        }
        wallCoordsRaw.push({
          start: snapVec3(startWorld, SNAP_GRID_M),
          end: snapVec3(endWorld, SNAP_GRID_M),
          data: w
        });
      }
      const junctionStats = resolveWallJunctions(wallCoordsRaw, CORNER_SNAP_THRESHOLD_M);
      diagStats.tJunctionSnaps = junctionStats.tSnaps;
      diagStats.cornerMerges = junctionStats.cornerSnaps;
      {
        const NEAR_MISS_SEARCH_M = 0.5;
        const ALREADY_CONNECTED_M = 0.25;
        const T_INTERIOR_MIN = 0.05;
        const T_INTERIOR_MAX = 0.95;
        for (let i = 0; i < wallCoordsRaw.length; i++) {
          for (const key of ["start", "end"]) {
            const ep = wallCoordsRaw[i][key];
            let alreadyConnected = false;
            outer: for (let k = 0; k < wallCoordsRaw.length; k++) {
              if (k === i) continue;
              for (const kPt of [wallCoordsRaw[k].start, wallCoordsRaw[k].end]) {
                const ddx = ep.x - kPt.x;
                const ddz = ep.z - kPt.z;
                if (Math.sqrt(ddx * ddx + ddz * ddz) < ALREADY_CONNECTED_M) {
                  alreadyConnected = true;
                  break outer;
                }
              }
            }
            if (alreadyConnected) continue;
            let bestDist = NEAR_MISS_SEARCH_M;
            let bestSnap = null;
            for (let j = 0; j < wallCoordsRaw.length; j++) {
              if (j === i) continue;
              const segStart = wallCoordsRaw[j].start;
              const segEnd = wallCoordsRaw[j].end;
              const sdx = segEnd.x - segStart.x;
              const sdz = segEnd.z - segStart.z;
              const segLen2 = sdx * sdx + sdz * sdz;
              if (segLen2 < 1e-8) continue;
              const t = Math.max(0, Math.min(
                1,
                ((ep.x - segStart.x) * sdx + (ep.z - segStart.z) * sdz) / segLen2
              ));
              if (t < T_INTERIOR_MIN || t > T_INTERIOR_MAX) continue;
              const cx = segStart.x + t * sdx;
              const cz = segStart.z + t * sdz;
              const dist = Math.sqrt((ep.x - cx) ** 2 + (ep.z - cz) ** 2);
              if (dist < bestDist) {
                bestDist = dist;
                bestSnap = new Vector3(cx, 0, cz);
              }
            }
            if (bestSnap) {
              console.debug(
                `[FloorPlanCommandBatcher] Near-miss snap: wall[${i}].${key} (${ep.x.toFixed(3)},${ep.z.toFixed(3)}) → (${bestSnap.x.toFixed(3)},${bestSnap.z.toFixed(3)}) dist=${bestDist.toFixed(3)}m`
              );
              ep.copy(bestSnap);
              diagStats.tJunctionSnaps++;
            }
          }
        }
      }
      const { result: splitEntries, splitCount } = splitWallsAtCrossings(wallCoordsRaw);
      diagStats.crossingSplits = splitCount;
      let wallCoords;
      if (splitCount === 0) {
        wallCoords = wallCoordsRaw;
      } else {
        const parentSegCount = /* @__PURE__ */ new Map();
        for (const se of splitEntries) {
          parentSegCount.set(se.parentIdx, (parentSegCount.get(se.parentIdx) ?? 0) + 1);
        }
        const parentSegIdx = /* @__PURE__ */ new Map();
        wallCoords = splitEntries.map((se) => {
          const count = parentSegCount.get(se.parentIdx) ?? 1;
          const segIdx = parentSegIdx.get(se.parentIdx) ?? 0;
          parentSegIdx.set(se.parentIdx, segIdx + 1);
          const parentData = wallCoordsRaw[se.parentIdx].data;
          return {
            start: se.start,
            end: se.end,
            data: count > 1 ? { ...parentData, id: `${parentData.id}_s${segIdx}` } : parentData
          };
        });
      }
      const scorerResolvedWalls = wallCoords.map((wc) => ({
        wallUUID: wc.data.id,
        aiId: wc.data.id,
        start: wc.start,
        end: wc.end,
        thicknessPx: wc.data.thicknessPx,
        aiWallType: wc.data.wallType,
        rawPixel: {
          startPx: wc.data.startPx,
          endPx: wc.data.endPx
        }
      }));
      const scorerResolvedOpenings = analysis.openings.map((o) => ({
        id: o.id,
        hostWallAiId: o.hostWallId,
        type: o.type
      }));
      const pxPerMeterForScoring = 1 / metersPerPx;
      const wallScoreResults = new WallCandidateScorer().score(
        scorerResolvedWalls,
        scorerResolvedOpenings,
        analysis.imageDimensions.widthPx,
        analysis.imageDimensions.heightPx,
        pxPerMeterForScoring
      );
      const wallScoreMap = new Map(wallScoreResults.map((s) => [s.wallUUID, s]));
      for (const wc of wallCoords) {
        const { start, end, data } = wc;
        const wallLength = start.distanceTo(end);
        const splitMatch = data.id.match(/^(.+)_s\d+$/);
        const isCrossingSplit = splitMatch !== null;
        const splitFromAiId = splitMatch ? splitMatch[1] : void 0;
        const rawPixel = {
          startPx: data.startPx,
          endPx: data.endPx,
          thicknessPx: data.thicknessPx
        };
        const thicknessRawM = data.thicknessPx * metersPerPx;
        const thicknessSnapped = snapToGrid(thicknessRawM, SNAP_GRID_M);
        const thickness = data.wallType === "exterior" ? Math.max(0.2, Math.min(0.4, thicknessSnapped)) : data.wallType === "interior" ? Math.max(0.1, Math.min(0.25, thicknessSnapped)) : Math.max(0.1, Math.min(0.5, thicknessSnapped));
        if (wallLength < MIN_WALL_LENGTH_M) {
          skipped++;
          diagStats.tooShortSkipped++;
          wallDiagnostics.push({
            index: wallDiagnostics.length,
            aiId: data.id,
            aiWallType: data.wallType,
            aiConfidence: data.confidence,
            rawPixel,
            worldCoords: {
              start: { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
              end: { x: parseFloat(end.x.toFixed(4)), z: parseFloat(end.z.toFixed(4)) },
              lengthM: parseFloat(wallLength.toFixed(4)),
              thicknessM: parseFloat(thickness.toFixed(4)),
              thicknessRawM: parseFloat(thicknessRawM.toFixed(4))
            },
            postProcessing: { isCrossingSplit, ...splitFromAiId !== void 0 ? { splitFromAiId } : {} },
            skipReason: "too_short",
            status: "skipped"
          });
          continue;
        }
        const isDuplicate = acceptedWalls.some((accepted) => {
          const endpointMatch = accepted.start.distanceTo(start) < DUPLICATE_WALL_THRESHOLD_M && accepted.end.distanceTo(end) < DUPLICATE_WALL_THRESHOLD_M || accepted.start.distanceTo(end) < DUPLICATE_WALL_THRESHOLD_M && accepted.end.distanceTo(start) < DUPLICATE_WALL_THRESHOLD_M;
          if (endpointMatch) return true;
          const aLen = accepted.start.distanceTo(accepted.end);
          const bLen = start.distanceTo(end);
          if (aLen < 0.01 || bLen < 0.01) return false;
          const aDx = (accepted.end.x - accepted.start.x) / aLen;
          const aDz = (accepted.end.z - accepted.start.z) / aLen;
          const bDx = (end.x - start.x) / bLen;
          const bDz = (end.z - start.z) / bLen;
          const dot = Math.abs(aDx * bDx + aDz * bDz);
          const angleDeg = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
          if (angleDeg > PARALLEL_WALL_ANGLE_TOL_DEG) return false;
          const toPtX = start.x - accepted.start.x;
          const toPtZ = start.z - accepted.start.z;
          const perpDist = Math.abs(toPtX * aDz - toPtZ * aDx);
          if (perpDist >= PARALLEL_WALL_MIN_SEP_M) return false;
          const proj0 = (start.x - accepted.start.x) * aDx + (start.z - accepted.start.z) * aDz;
          const proj1 = (end.x - accepted.start.x) * aDx + (end.z - accepted.start.z) * aDz;
          const overlapStart = Math.max(0, Math.min(proj0, proj1));
          const overlapEnd = Math.min(aLen, Math.max(proj0, proj1));
          const overlapLen = overlapEnd - overlapStart;
          const minLen = Math.min(aLen, bLen);
          return overlapLen >= minLen * PARALLEL_WALL_OVERLAP_RATIO;
        });
        if (isDuplicate) {
          skipped++;
          diagStats.duplicateSkipped++;
          wallDiagnostics.push({
            index: wallDiagnostics.length,
            aiId: data.id,
            aiWallType: data.wallType,
            aiConfidence: data.confidence,
            rawPixel,
            worldCoords: {
              start: { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
              end: { x: parseFloat(end.x.toFixed(4)), z: parseFloat(end.z.toFixed(4)) },
              lengthM: parseFloat(wallLength.toFixed(4)),
              thicknessM: parseFloat(thickness.toFixed(4)),
              thicknessRawM: parseFloat(thicknessRawM.toFixed(4))
            },
            postProcessing: { isCrossingSplit, ...splitFromAiId !== void 0 ? { splitFromAiId } : {} },
            skipReason: "duplicate",
            status: "skipped"
          });
          continue;
        }
        const wallScore = wallScoreMap.get(data.id);
        if (data.wallType !== "exterior" && wallScore?.decision === "reject") {
          skipped++;
          diagStats.wallScorerRejected++;
          wallDiagnostics.push({
            index: wallDiagnostics.length,
            aiId: data.id,
            aiWallType: data.wallType,
            aiConfidence: data.confidence,
            rawPixel,
            worldCoords: {
              start: { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
              end: { x: parseFloat(end.x.toFixed(4)), z: parseFloat(end.z.toFixed(4)) },
              lengthM: parseFloat(wallLength.toFixed(4)),
              thicknessM: parseFloat(thickness.toFixed(4)),
              thicknessRawM: parseFloat(thicknessRawM.toFixed(4))
            },
            postProcessing: { isCrossingSplit, ...splitFromAiId !== void 0 ? { splitFromAiId } : {} },
            skipReason: "low_wall_score",
            status: "skipped",
            wallScore: {
              totalScore: wallScore.totalScore,
              breakdown: wallScore.breakdown,
              decision: wallScore.decision
            }
          });
          continue;
        }
        const isReviewFlagged = data.wallType !== "exterior" && wallScore?.decision === "review";
        if (isReviewFlagged) diagStats.wallScorerReview++;
        const connectsCorner = acceptedWalls.some(
          (other) => other.start.distanceTo(start) < 0.01 || other.end.distanceTo(start) < 0.01 || other.start.distanceTo(end) < 0.01 || other.end.distanceTo(end) < 0.01
        );
        const boostedConf = boostConfidence(data.confidence, connectsCorner);
        const wallId = v4();
        const cmd = new CreateWallCommand(wallId, {
          start: { x: start.x, z: start.z },
          end: { x: end.x, z: end.z },
          height: wallHeight,
          thickness: thickness || DEFAULT_WALL_THICKNESS,
          levelId: targetLevelId
        });
        const wallTypeLabel = data.wallType === "exterior" ? "Exterior" : "Interior";
        const reviewMarker = isReviewFlagged ? " ⚠ review" : "";
        proposals.push({
          id: v4(),
          intentType: "PDF_IMPORT_WALL",
          command: cmd,
          rationale: `[PDF Import] ${wallTypeLabel} wall — confidence: ${boostedConf}${reviewMarker}`,
          validation: { ok: true },
          confidence: boostedConf === "high" ? 0.95 : boostedConf === "medium" ? 0.75 : 0.5
        });
        summary.walls++;
        diagStats.wallsAccepted++;
        acceptedWalls.push({ wallUUID: wallId, start: start.clone(), end: end.clone(), data });
        wallAiIdToEntry.set(data.id, { wallUUID: wallId, worldStart: start.clone(), worldEnd: end.clone() });
        wallDiagnostics.push({
          index: wallDiagnostics.length,
          aiId: data.id,
          aiWallType: data.wallType,
          aiConfidence: data.confidence,
          rawPixel,
          worldCoords: {
            start: { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
            end: { x: parseFloat(end.x.toFixed(4)), z: parseFloat(end.z.toFixed(4)) },
            lengthM: parseFloat(wallLength.toFixed(4)),
            thicknessM: parseFloat(thickness.toFixed(4)),
            thicknessRawM: parseFloat(thicknessRawM.toFixed(4))
          },
          postProcessing: { isCrossingSplit, ...splitFromAiId !== void 0 ? { splitFromAiId } : {} },
          status: "accepted",
          wallUUID: wallId,
          finalConfidence: boostedConf,
          ...wallScore && {
            wallScore: {
              totalScore: wallScore.totalScore,
              breakdown: wallScore.breakdown,
              decision: wallScore.decision
            }
          }
        });
      }
    }
    {
      const parentAliasAdded = /* @__PURE__ */ new Set();
      for (const [aiId, entry] of wallAiIdToEntry) {
        const splitMatch = aiId.match(/^(.+)_s\d+$/);
        if (splitMatch) {
          const parentAiId = splitMatch[1];
          if (!parentAliasAdded.has(parentAiId) && !wallAiIdToEntry.has(parentAiId)) {
            wallAiIdToEntry.set(parentAiId, entry);
            parentAliasAdded.add(parentAiId);
          }
        }
      }
    }
    const wallGraph = buildWallGraph(acceptedWalls);
    const topology = computeTopology(wallGraph);
    summary.rooms = topology.rooms.length;
    const wallUUIDToWorld = new Map(
      acceptedWalls.map((aw) => [aw.wallUUID, {
        worldStart: { x: aw.start.x, z: aw.start.z },
        worldEnd: { x: aw.end.x, z: aw.end.z }
      }])
    );
    const wallUUIDToCoords = new Map(
      acceptedWalls.map((aw) => [aw.wallUUID, { worldStart: aw.start, worldEnd: aw.end }])
    );
    const wallUUIDToDetectedWall = new Map(
      acceptedWalls.map((aw) => [aw.wallUUID, aw.data])
    );
    const openingCentresForAssignment = includeOpenings ? analysis.openings.flatMap((o) => {
      const w = underlayTool.pixelToWorld(o.centrePx.x, o.centrePx.y);
      return w ? [{ id: o.id, centre: { x: w.x, z: w.z } }] : [];
    }) : [];
    const graphOpeningAssignment = assignOpeningsToWalls(openingCentresForAssignment, wallGraph);
    if (includeSlab) {
      let polygon = [];
      let slabRationale = "";
      let slabConfidence = 0.7;
      if (topology.outerFacePolygon && topology.outerFacePolygon.length >= 3) {
        polygon = topology.outerFacePolygon.map((p) => ({
          x: snapToGrid(p.x, SNAP_GRID_M),
          y: snapToGrid(p.z, SNAP_GRID_M)
        }));
        slabRationale = `[PDF Import] Floor slab from topology outer face (Phase E) — ${polygon.length} vertices`;
        slabConfidence = 0.92;
      } else if (analysis.slab) {
        for (const px of analysis.slab.polygonPx) {
          const world = underlayTool.pixelToWorld(px.x, px.y);
          if (!world) continue;
          polygon.push({ x: snapToGrid(world.x, SNAP_GRID_M), y: snapToGrid(world.z, SNAP_GRID_M) });
        }
        slabRationale = `[PDF Import] Floor slab from AI plan boundary (topology fallback) — confidence: ${analysis.slab.confidence}`;
        slabConfidence = analysis.slab.confidence === "high" ? 0.9 : 0.7;
      }
      if (polygon.length >= 3) {
        const centreX = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
        const centreZ = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
        const slabId = v4();
        const cmd = new CreateSlabCommand({
          id: slabId,
          width: 0,
          depth: 0,
          thickness: DEFAULT_SLAB_THICKNESS,
          position: { x: centreX, y: 0, z: centreZ },
          levelId: targetLevelId,
          polygon
        });
        proposals.push({
          id: v4(),
          intentType: "PDF_IMPORT_SLAB",
          command: cmd,
          rationale: slabRationale,
          validation: { ok: true },
          confidence: slabConfidence
        });
        summary.slab++;
      }
    }
    if (includeOpenings && analysis.openings.length > 0) {
      const CONF_RANK = { high: 0, medium: 1, low: 2 };
      const orderedOpenings = [...analysis.openings].sort((a, b) => {
        const c = CONF_RANK[a.confidence] - CONF_RANK[b.confidence];
        if (c !== 0) return c;
        if (a.type !== b.type) return a.type === "door" ? -1 : 1;
        return 0;
      });
      for (const opening of orderedOpenings) {
        let wallEntry;
        let diagAssignMethod = "no_host_found";
        const graphAssignedWallId = graphOpeningAssignment.get(opening.id);
        if (graphAssignedWallId) {
          const coords = wallUUIDToCoords.get(graphAssignedWallId);
          if (coords) {
            const graphAssignedDetectedWall = wallUUIDToDetectedWall.get(graphAssignedWallId);
            const graphGapProbe = graphAssignedDetectedWall ? findCollinearEndpoints(
              graphAssignedDetectedWall,
              analysis.walls,
              opening.centrePx
            ) : null;
            if (graphGapProbe !== null) {
              wallEntry = { wallUUID: graphAssignedWallId, ...coords };
              diagAssignMethod = "spatial_graph";
            } else {
              console.debug(
                `[FloorPlanCommandBatcher] Opening ${opening.id}: graph-assigned wall ${graphAssignedWallId} has no confirmed gap — scanning for better host wall`
              );
              const openingCentreWorld = underlayTool.pixelToWorld(
                opening.centrePx.x,
                opening.centrePx.y
              );
              if (openingCentreWorld) {
                const candidates = acceptedWalls.map((aw) => {
                  const { distance } = pointToSegmentDistanceXZ(
                    openingCentreWorld,
                    aw.start,
                    aw.end
                  );
                  return { aw, distance };
                }).filter((c) => c.distance <= HOST_TIEBREAK_MAX_DIST_M).sort((a, b) => a.distance - b.distance).slice(0, 6);
                for (const { aw } of candidates) {
                  const gapProbe = findCollinearEndpoints(
                    aw.data,
                    analysis.walls,
                    opening.centrePx
                  );
                  if (gapProbe !== null) {
                    const altCoords = wallUUIDToCoords.get(aw.wallUUID);
                    if (altCoords) {
                      console.debug(
                        `[FloorPlanCommandBatcher] Opening ${opening.id}: gap-probe tiebreaker → wall ${aw.wallUUID} (gap ${gapProbe.gapWidthPx.toFixed(0)}px)`
                      );
                      wallEntry = { wallUUID: aw.wallUUID, ...altCoords };
                      diagAssignMethod = "spatial_graph";
                      break;
                    }
                  }
                }
              }
              if (!wallEntry) {
                wallEntry = { wallUUID: graphAssignedWallId, ...coords };
                diagAssignMethod = "spatial_graph";
                console.debug(
                  `[FloorPlanCommandBatcher] Opening ${opening.id}: gap-probe found no better wall — keeping graph assignment`
                );
              }
            }
            const aiEntry = wallAiIdToEntry.get(opening.hostWallId);
            if (aiEntry && aiEntry.wallUUID !== wallEntry.wallUUID) {
              console.debug(
                `[FloorPlanCommandBatcher] Opening ${opening.id}: spatial → wall ${wallEntry.wallUUID}, AI hostWallId → wall ${aiEntry.wallUUID} (using spatial)`
              );
            }
          }
        }
        if (!wallEntry) {
          const aiEntry = wallAiIdToEntry.get(opening.hostWallId);
          if (aiEntry) {
            wallEntry = aiEntry;
            diagAssignMethod = "ai_hostwall_fallback";
            console.debug(
              `[FloorPlanCommandBatcher] Opening ${opening.id}: Phase E spatial missed — falling back to AI hostWallId "${opening.hostWallId}"`
            );
          } else {
            console.warn(
              `[FloorPlanCommandBatcher] Opening ${opening.id}: both spatial and AI hostWallId "${opening.hostWallId}" failed — skipping`
            );
            skipped++;
            const cwSkip = underlayTool.pixelToWorld(opening.centrePx.x, opening.centrePx.y);
            openingDiagnostics.push({
              aiId: opening.id,
              type: opening.type,
              aiHostWallId: opening.hostWallId,
              centrePx: opening.centrePx,
              centreWorld: cwSkip ? { x: parseFloat(cwSkip.x.toFixed(4)), z: parseFloat(cwSkip.z.toFixed(4)) } : null,
              widthM: 0,
              assignment: { method: "no_host_found", assignedWallUUID: null },
              status: "skipped_no_host"
            });
            continue;
          }
        }
        const centreWorld = underlayTool.pixelToWorld(opening.centrePx.x, opening.centrePx.y);
        if (!centreWorld) {
          skipped++;
          continue;
        }
        const wallStart = wallEntry.worldStart;
        const wallEnd = wallEntry.worldEnd;
        const { projectedOffset } = pointToSegmentDistanceXZ(centreWorld, wallStart, wallEnd);
        const wallLength = wallStart.distanceTo(wallEnd);
        if (wallLength < 0.01) {
          skipped++;
          continue;
        }
        let offset = projectedOffset;
        const hostDetectedWall = wallUUIDToDetectedWall.get(wallEntry.wallUUID);
        if (hostDetectedWall) {
          const gapResult = findCollinearEndpoints(
            hostDetectedWall,
            analysis.walls,
            opening.centrePx
          );
          if (gapResult) {
            const gapCentreWorld = underlayTool.pixelToWorld(
              gapResult.correctedCentrePx.x,
              gapResult.correctedCentrePx.y
            );
            if (gapCentreWorld) {
              const { projectedOffset: gapWorldOffset } = pointToSegmentDistanceXZ(
                gapCentreWorld,
                wallStart,
                wallEnd
              );
              offset = gapWorldOffset;
              console.debug(
                `[FloorPlanCommandBatcher] Opening ${opening.id}: axis-locked offset ${projectedOffset.toFixed(3)} → ${offset.toFixed(3)} m (gap ${gapResult.gapWidthPx.toFixed(0)}px, correctedCentrePx used)`
              );
            }
          }
        }
        if (!isFinite(offset)) {
          skipped++;
          continue;
        }
        const openingWidthM = Math.max(0.5, Math.min(
          3,
          snapToGrid(opening.widthPx * metersPerPx, SNAP_GRID_M)
        ));
        const halfW = openingWidthM / 2;
        const WALL_EDGE_TOLERANCE_M = SNAP_GRID_M;
        if (openingWidthM >= wallLength - WALL_EDGE_TOLERANCE_M) {
          console.warn(
            `[FloorPlanCommandBatcher] Opening ${opening.id} skipped — width ${openingWidthM.toFixed(2)} m >= wall length ${wallLength.toFixed(2)} m`
          );
          skipped++;
          continue;
        }
        const clampedCentre = Math.max(halfW, Math.min(offset, wallLength - halfW));
        const leftEdgeOffset = clampedCentre - halfW;
        if (spanConflicts(wallEntry.wallUUID, leftEdgeOffset, openingWidthM)) {
          console.warn(
            `[FloorPlanCommandBatcher] Opening ${opening.id} skipped — span [${leftEdgeOffset.toFixed(2)}, ${(leftEdgeOffset + openingWidthM).toFixed(2)}] m overlaps an already-proposed opening on wall ${wallEntry.wallUUID}`
          );
          skipped++;
          openingDiagnostics.push({
            aiId: opening.id,
            type: opening.type,
            aiHostWallId: opening.hostWallId,
            centrePx: opening.centrePx,
            centreWorld: { x: parseFloat(centreWorld.x.toFixed(4)), z: parseFloat(centreWorld.z.toFixed(4)) },
            widthM: parseFloat(openingWidthM.toFixed(4)),
            assignment: { method: diagAssignMethod, assignedWallUUID: wallEntry.wallUUID },
            status: "skipped_occupancy_conflict"
          });
          continue;
        }
        const isWindow = opening.type === "window";
        const openingData = {
          type: opening.type,
          ...isWindow ? { windowType: "single" } : { doorType: "single" },
          width: openingWidthM,
          height: isWindow ? 1.2 : 2.1,
          offset: leftEdgeOffset,
          sillHeight: isWindow ? 0.9 : 0
        };
        claimSpan(wallEntry.wallUUID, leftEdgeOffset, openingWidthM);
        const cmd = new CreateWallOpeningCommand({
          wallId: wallEntry.wallUUID,
          openingData
        });
        proposals.push({
          id: v4(),
          intentType: isWindow ? "PDF_IMPORT_WINDOW" : "PDF_IMPORT_DOOR",
          command: cmd,
          rationale: `[PDF Import] ${isWindow ? "Window" : "Door"} in wall ${opening.hostWallId} — confidence: ${opening.confidence}`,
          validation: { ok: true },
          confidence: opening.confidence === "high" ? 0.9 : opening.confidence === "medium" ? 0.7 : 0.5
        });
        summary.openings++;
        openingDiagnostics.push({
          aiId: opening.id,
          type: opening.type,
          aiHostWallId: opening.hostWallId,
          centrePx: opening.centrePx,
          centreWorld: { x: parseFloat(centreWorld.x.toFixed(4)), z: parseFloat(centreWorld.z.toFixed(4)) },
          widthM: parseFloat(openingWidthM.toFixed(4)),
          assignment: {
            method: diagAssignMethod,
            assignedWallUUID: wallEntry.wallUUID
          },
          status: "accepted"
        });
      }
    }
    if (includeOpenings && analysis.walls.length > 0) {
      const RECOVERY_MATCH_RADIUS_PX = 60;
      const MAX_RECOVERY_DOORS = 10;
      const recoveryGaps = detectGeometricDoorGaps(analysis.walls);
      let recoveryCount = 0;
      for (const gap of recoveryGaps) {
        if (recoveryCount >= MAX_RECOVERY_DOORS) break;
        const alreadyCovered = analysis.openings.some((o) => {
          const dx = o.centrePx.x - gap.centrePx.x;
          const dy = o.centrePx.y - gap.centrePx.y;
          return Math.sqrt(dx * dx + dy * dy) < RECOVERY_MATCH_RADIUS_PX;
        });
        if (alreadyCovered) continue;
        const wallAEntry = acceptedWalls.find((aw) => aw.data.id === gap.wallAId || aw.data.id.startsWith(gap.wallAId + "_s"));
        const wallBEntry = acceptedWalls.find((aw) => aw.data.id === gap.wallBId || aw.data.id.startsWith(gap.wallBId + "_s"));
        if (!wallAEntry && !wallBEntry) continue;
        const gapWidthM = gap.gapWidthPx * metersPerPx;
        if (gapWidthM < 0.5 || gapWidthM > 2.5) continue;
        const openingWidthM = Math.max(0.5, Math.min(2.5, snapToGrid(gapWidthM, SNAP_GRID_M)));
        const gapCentreWorld = underlayTool.pixelToWorld(gap.centrePx.x, gap.centrePx.y);
        if (!gapCentreWorld) continue;
        let bestWall = null;
        let bestDist = 0.5;
        for (const aw of acceptedWalls) {
          const { distance } = pointToSegmentDistanceXZ(gapCentreWorld, aw.start, aw.end);
          if (distance < bestDist) {
            bestDist = distance;
            bestWall = aw;
          }
        }
        if (!bestWall) continue;
        const wallStart = bestWall.start;
        const wallEnd = bestWall.end;
        const wallLength = wallStart.distanceTo(wallEnd);
        if (wallLength < 0.01) continue;
        if (openingWidthM >= wallLength - SNAP_GRID_M) continue;
        const { projectedOffset } = pointToSegmentDistanceXZ(gapCentreWorld, wallStart, wallEnd);
        const halfW = openingWidthM / 2;
        const clampedCentre = Math.max(halfW, Math.min(projectedOffset, wallLength - halfW));
        const leftEdgeOffset = clampedCentre - halfW;
        if (spanConflicts(bestWall.wallUUID, leftEdgeOffset, openingWidthM)) {
          console.debug(
            `[FloorPlanCommandBatcher] Recovery gap at (${gap.centrePx.x},${gap.centrePx.y}) skipped — span overlaps an already-proposed opening on wall ${bestWall.wallUUID}`
          );
          continue;
        }
        const cmd = new CreateWallOpeningCommand({
          wallId: bestWall.wallUUID,
          openingData: {
            type: "door",
            doorType: "single",
            width: openingWidthM,
            height: 2.1,
            offset: leftEdgeOffset,
            sillHeight: 0
          }
        });
        claimSpan(bestWall.wallUUID, leftEdgeOffset, openingWidthM);
        proposals.push({
          id: v4(),
          intentType: "PDF_IMPORT_DOOR",
          command: cmd,
          rationale: `[PDF Import] Door recovered from geometric gap analysis — gap ${gap.gapWidthPx}px (${gapWidthM.toFixed(2)}m) between walls ${gap.wallAId}/${gap.wallBId}`,
          validation: { ok: true },
          confidence: 0.6
          // medium-low — visual confirmation was skipped
        });
        summary.openings++;
        recoveryCount++;
        openingDiagnostics.push({
          aiId: `geom_recovery_${recoveryCount}`,
          type: "door",
          aiHostWallId: gap.wallAId,
          centrePx: gap.centrePx,
          centreWorld: { x: parseFloat(gapCentreWorld.x.toFixed(4)), z: parseFloat(gapCentreWorld.z.toFixed(4)) },
          widthM: parseFloat(openingWidthM.toFixed(4)),
          assignment: { method: "geometric_recovery", assignedWallUUID: bestWall.wallUUID },
          status: "accepted"
        });
        console.debug(
          `[FloorPlanCommandBatcher] Geometric recovery door ${recoveryCount}: gap centre (${gap.centrePx.x},${gap.centrePx.y}) → wall ${bestWall.wallUUID} (perp=${bestDist.toFixed(3)}m, width=${openingWidthM.toFixed(2)}m)`
        );
      }
      if (recoveryCount > 0) {
        console.log(`[FloorPlanCommandBatcher] Geometric recovery: created ${recoveryCount} missed door(s).`);
      }
    }
    for (const f of analysis.furniture) {
      const worldCentre = underlayTool.pixelToWorld(f.centrePx.x, f.centrePx.y);
      if (!worldCentre) {
        skipped++;
        continue;
      }
      const isPlumbing = f.furnitureType in PLUMBING_TYPE_MAP;
      const isFurniture = f.furnitureType in FURNITURE_TYPE_MAP;
      if (isPlumbing && includePlumbing) {
        const plumbingId = v4();
        const fixtureType = PLUMBING_TYPE_MAP[f.furnitureType];
        const defaults = FURNITURE_DEFAULTS[f.furnitureType] ?? { width: 0.5, length: 0.6, height: 0.8 };
        const cmd = new CreatePlumbingFixtureCommand({
          id: plumbingId,
          fixtureType,
          position: { x: snapToGrid(worldCentre.x, SNAP_GRID_M), y: 0, z: snapToGrid(worldCentre.z, SNAP_GRID_M) },
          rotation: { x: 0, y: f.rotationDeg * Math.PI / 180, z: 0 },
          levelId: targetLevelId,
          baseOffset: 0,
          width: defaults.width,
          height: defaults.height,
          length: defaults.length
        });
        proposals.push({
          id: v4(),
          intentType: "PDF_IMPORT_PLUMBING",
          command: cmd,
          rationale: `[PDF Import] ${fixtureType} in ${f.room} — confidence: ${f.confidence}`,
          validation: { ok: true },
          confidence: f.confidence === "high" ? 0.9 : f.confidence === "medium" ? 0.7 : 0.5
        });
        summary.plumbing++;
      } else if (isFurniture && includeFurniture) {
        const furnitureId = v4();
        const furnitureType = FURNITURE_TYPE_MAP[f.furnitureType];
        const widthM = Math.max(0.3, snapToGrid(f.widthPx * metersPerPx, SNAP_GRID_M));
        const depthM = Math.max(0.3, snapToGrid(f.depthPx * metersPerPx, SNAP_GRID_M));
        const defaults = FURNITURE_DEFAULTS[f.furnitureType] ?? { width: 1, length: 1, height: 1 };
        const cmd = new CreateFurnitureCommand({
          id: furnitureId,
          furnitureType,
          position: { x: snapToGrid(worldCentre.x, SNAP_GRID_M), y: 0, z: snapToGrid(worldCentre.z, SNAP_GRID_M) },
          rotation: { x: 0, y: f.rotationDeg * Math.PI / 180, z: 0 },
          levelId: targetLevelId,
          baseOffset: 0,
          width: widthM || defaults.width,
          length: depthM || defaults.length,
          height: defaults.height,
          material: "wood"
        });
        proposals.push({
          id: v4(),
          intentType: "PDF_IMPORT_FURNITURE",
          command: cmd,
          rationale: `[PDF Import] ${f.furnitureType} in ${f.room} — confidence: ${f.confidence}`,
          validation: { ok: true },
          confidence: f.confidence === "high" ? 0.9 : f.confidence === "medium" ? 0.7 : 0.5
        });
        summary.furniture++;
      } else {
        skipped++;
      }
    }
    return {
      proposals,
      skippedCount: skipped,
      summary,
      wallUUIDToWorld,
      wallGraph,
      rooms: topology.rooms,
      wallDiagnostics,
      postProcessingStats: diagStats,
      openingDiagnostics
    };
  }
}

function buildWallExportJSON(report) {
  const pp = report.postProcessing;
  const accepted = report.walls.filter((w) => w.status === "accepted");
  const skipped = report.walls.filter((w) => w.status === "skipped");
  const mapWall = (w) => ({
    index: w.index,
    aiId: w.aiId,
    status: w.status,
    ...w.skipReason ? { skipReason: w.skipReason } : {},
    type: w.aiWallType,
    aiConfidence: w.aiConfidence,
    ...w.finalConfidence ? { finalConfidence: w.finalConfidence } : {},
    isCrossingSplit: w.postProcessing.isCrossingSplit,
    ...w.postProcessing.splitFromAiId ? { splitFromParentAiId: w.postProcessing.splitFromAiId } : {},
    rawPixels: {
      startPx: w.rawPixel.startPx,
      endPx: w.rawPixel.endPx,
      thicknessPx: w.rawPixel.thicknessPx
    },
    worldCoords: w.worldCoords ? {
      start: w.worldCoords.start,
      end: w.worldCoords.end,
      lengthM: w.worldCoords.lengthM,
      thicknessM: w.worldCoords.thicknessM,
      thicknessRawM: w.worldCoords.thicknessRawM
    } : null,
    ...w.wallUUID ? { wallUUID: w.wallUUID } : {}
  });
  return {
    schemaVersion: "2.0",
    exportType: "walls_focused",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary: {
      totalAIDetected: report.walls.length,
      accepted: accepted.length,
      skipped: skipped.length,
      skippedTooShort: pp.tooShortSkipped,
      skippedDuplicate: pp.duplicateSkipped,
      skippedPixelMapFailed: pp.pixelMapFailed,
      skippedIsolatedAnnotation: pp.isolatedAnnotationSkipped,
      skippedLowWallScore: pp.wallScorerRejected,
      reviewFlagged: pp.wallScorerReview,
      crossingSplitsApplied: pp.crossingSplits,
      tJunctionSnaps: pp.tJunctionSnaps,
      cornerMerges: pp.cornerMerges
    },
    calibration: {
      pxPerMeter: report.metadata.pxPerMeter,
      imageDimensions: report.metadata.imageDimensions,
      planSizeM: report.metadata.planSizeM,
      calibrationMethod: report.metadata.calibrationMethod
    },
    walls: [...accepted, ...skipped].map(mapWall)
  };
}
function downloadWallJSON(report, filename = "pryzm-walls.json") {
  _triggerDownload(JSON.stringify(buildWallExportJSON(report), null, 2), filename);
}
function downloadDiagnosticJSON(report, filename = "pryzm-pipeline-report.json") {
  _triggerDownload(JSON.stringify(report, null, 2), filename);
}
function _triggerDownload(json, filename) {
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    console.log(`[FloorPlanDiagnostics] Downloaded: ${filename} (${json.length} chars)`);
  } catch (err) {
    console.error("[FloorPlanDiagnostics] Download failed:", err);
  }
}
function buildReportMetadata(widthPx, heightPx, pxPerMeter, calibrationMethod) {
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    imageDimensions: { widthPx, heightPx },
    pxPerMeter,
    calibrationMethod,
    planSizeM: {
      width: pxPerMeter > 0 ? parseFloat((widthPx / pxPerMeter).toFixed(3)) : 0,
      height: pxPerMeter > 0 ? parseFloat((heightPx / pxPerMeter).toFixed(3)) : 0
    }
  };
}

function _store(name) {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}
class WorldModelAdapterImpl {
  /**
   * Full building context for AI prompts.
   * Covers all levels, rooms, structural elements, and semantic relationships.
   */
  getFullBuildingContext(projectId) {
    const roomsD = this._roomsDetermination();
    const wallsD = this._wallsDetermination();
    const doorsD = this._doorsDetermination();
    const windowsD = this._windowsDetermination();
    const undeterminedReads = [roomsD, wallsD, doorsD, windowsD].filter((d) => d.kind === "undetermined").map((d) => ({
      scope: d.scope,
      reason: d.reason,
      ...d.detail !== void 0 ? { detail: d.detail } : {}
    }));
    const rooms = roomsD.kind === "determined" ? roomsD.elements : [];
    const levels = this._getLevels();
    const levelMap = /* @__PURE__ */ new Map();
    for (const level of levels) {
      levelMap.set(level.levelId, level);
    }
    const roomSummaries = rooms.map((room) => {
      const adjQ = semanticGraphManager.getAdjacentRooms(room.id);
      const connQ = semanticGraphManager.getConnectedRooms(room.id);
      const containsQ = semanticGraphManager.getContainedElements(room.id);
      const adjacentRoomIds = adjQ.ok ? adjQ.adjacentRoomIds : null;
      const connectedRoomIds = connQ.ok ? connQ.connectedRoomIds : null;
      const containedIds = containsQ.ok ? containsQ.containedIds : null;
      const undeterminedRelationships = [
        ...adjQ.ok ? [] : [{ family: "adjacentTo", reason: adjQ.reason }],
        ...connQ.ok ? [] : [{ family: "connectedTo", reason: connQ.reason }],
        ...containsQ.ok ? [] : [{ family: "contains", reason: containsQ.reason }]
      ];
      const levelEntry = levelMap.get(room.levelId);
      if (levelEntry) {
        levelEntry.totalAreaM2 += room.computed?.area ?? 0;
        levelEntry.roomCount += 1;
      }
      return {
        id: room.id,
        name: room.name ?? "Unnamed Room",
        levelId: room.levelId,
        occupancyType: room.occupancyType ?? "unassigned",
        areaM2: room.computed?.area ?? 0,
        boundingWallCount: boundingWallCountOrUnknown(room),
        adjacentRoomIds,
        connectedRoomIds,
        containedElementIds: containedIds,
        undeterminedRelationships
      };
    });
    const wallCount = countOrUnknown(wallsD);
    const roomCount = countOrUnknown(roomsD);
    const doorCount = countOrUnknown(doorsD);
    const windowCount = countOrUnknown(windowsD);
    return {
      projectId,
      snapshotAt: Date.now(),
      levels: Array.from(levelMap.values()),
      // A total assembled from a partially-read model is not a total.
      totalElements: sumOrUnknown([wallCount, roomCount, doorCount, windowCount]),
      semanticRelationshipCount: semanticGraphManager.size,
      wallCount,
      roomCount,
      doorCount,
      windowCount,
      undeterminedReads,
      rooms: roomSummaries
    };
  }
  /**
   * Compliance context — violations and warnings from ConstraintEngine.
   * Lazy-loaded to avoid circular imports.
   */
  getComplianceContext() {
    try {
      const roomsD = this._roomsDetermination();
      if (roomsD.kind === "undetermined") {
        return this._complianceUndetermined(roomsD.reason, roomsD.detail);
      }
      const rooms = roomsD.elements;
      const violations = [];
      const warnings = [];
      const ctx = {
        roomStore: _store("roomStore"),
        doorStore: _store("doorStore"),
        windowStore: _store("windowStore"),
        wallStore: _store("wallStore"),
        stairStore: _store("stairStore"),
        bimManager: _store("bimManager")
      };
      let allResults;
      if (!constraintEngine.validateAll) {
        return this._complianceUndetermined(
          "ENGINE_NOT_AVAILABLE",
          "the constraint engine is not composed in this runtime, so no rule was evaluated"
        );
      }
      try {
        allResults = constraintEngine.validateAll(ctx);
      } catch (e) {
        return this._complianceUndetermined(
          "PLANNER_THREW",
          `constraintEngine.validateAll threw: ${String(e?.message ?? e)}`
        );
      }
      const failedElementIds = /* @__PURE__ */ new Set();
      for (const result of allResults) {
        const elementId = result.elementId ?? "unknown";
        const entry = {
          ruleId: result.ruleId ?? "unknown",
          elementId,
          elementType: result.elementType ?? this._inferElementType(elementId),
          severity: result.severity ?? "warning",
          message: result.message ?? ""
        };
        if (result.severity === "error") violations.push(entry);
        else warnings.push(entry);
        failedElementIds.add(elementId);
      }
      const total = rooms.length;
      const failedCount = failedElementIds.size;
      const passRate = total > 0 ? Math.max(0, (total - failedCount) / total) : 1;
      return {
        checkedAt: Date.now(),
        totalElements: total,
        violations,
        warnings,
        passRate
      };
    } catch (e) {
      return this._complianceUndetermined(
        "PLANNER_THREW",
        `compliance evaluation threw: ${String(e?.message ?? e)}`
      );
    }
  }
  /**
   * The honest compliance answer when nothing could be evaluated (C78 §5).
   * `passRate: null` — never `1`, never `0`: a rate nobody computed has no
   * value, and BOTH numbers would be positive claims.
   */
  _complianceUndetermined(reason, detail) {
    return {
      checkedAt: Date.now(),
      totalElements: null,
      violations: [],
      warnings: [],
      passRate: null,
      undetermined: {
        scope: "project compliance",
        reason,
        ...detail !== void 0 ? { detail } : {}
      }
    };
  }
  /**
   * Programme context — target vs actual areas per room.
   * Uses room.targetAreaM2 if set (from ProgrammePanel brief assignment).
   */
  getProgrammeContext() {
    const rooms = this._getRooms();
    const programmeRooms = [];
    let totalGrossAreaM2 = 0;
    let compliantCount = 0;
    for (const room of rooms) {
      const actualArea = room.computed?.area ?? 0;
      const targetArea = room.targetAreaM2 ?? 0;
      totalGrossAreaM2 += actualArea;
      let deviationPct = 0;
      let status = "pass";
      if (targetArea > 0) {
        deviationPct = (actualArea - targetArea) / targetArea * 100;
        if (Math.abs(deviationPct) > 20) status = "fail";
        else if (Math.abs(deviationPct) > 10) status = "warning";
      }
      if (status === "pass") compliantCount++;
      programmeRooms.push({
        roomId: room.id,
        name: room.name ?? "Unnamed",
        occupancyType: room.occupancyType ?? "unassigned",
        targetAreaM2: targetArea,
        actualAreaM2: actualArea,
        deviationPct,
        status
      });
    }
    const complianceRate = rooms.length > 0 ? compliantCount / rooms.length : 1;
    return {
      totalRooms: rooms.length,
      totalGrossAreaM2,
      rooms: programmeRooms,
      complianceRate
    };
  }
  /**
   * Relationship context for a single element — used by RelationshipExplorerPanel
   * and AI prompts that reason about specific elements.
   */
  getRelationshipContext(elementId) {
    const allRels = semanticGraphManager.getRelationships(elementId);
    const elementType = this._inferElementType(elementId);
    const relationships = allRels.map((rel) => ({
      type: rel.type,
      direction: rel.sourceId === elementId ? "outgoing" : "incoming",
      relatedId: rel.sourceId === elementId ? rel.targetId : rel.sourceId,
      ...rel.metadata !== void 0 ? { metadata: rel.metadata } : {}
    }));
    return { elementId, elementType, relationships };
  }
  /**
   * Compact JSON string for AI prompt injection.
   * Strips geometry; keeps only semantic data.
   */
  toPromptContext(projectId) {
    const ctx = this.getFullBuildingContext(projectId);
    return JSON.stringify({
      projectId: ctx.projectId,
      levels: ctx.levels.map((l) => ({ id: l.levelId, name: l.name, rooms: l.roomCount, areaMtSq: l.totalAreaM2.toFixed(1) })),
      rooms: ctx.rooms.map((r) => ({
        id: r.id.substring(0, 8),
        name: r.name,
        type: r.occupancyType,
        areaMtSq: r.areaM2.toFixed(1),
        // §GR13-ADJACENCY-READER — the LLM-facing half. `null` reaches
        // the model as the WORD "unknown", exactly as `renderCount`
        // already does for the store counts below: an empty ARRAY here
        // reads to a model as "this room borders nothing", which is a
        // conclusion no one drew.
        adjacentTo: r.adjacentRoomIds === null ? "unknown" : r.adjacentRoomIds.map((id) => id.substring(0, 8)),
        connectedTo: r.connectedRoomIds === null ? "unknown" : r.connectedRoomIds.map((id) => id.substring(0, 8)),
        ...r.undeterminedRelationships.length > 0 ? { couldNotDetermine: r.undeterminedRelationships.map((u) => `${u.family} (${u.reason})`) } : {}
      })),
      semanticRelationships: ctx.semanticRelationshipCount,
      // §C78-U-INV-4 — the LLM-facing half of the fix. An unknown count
      // reaches the model as the WORD "unknown", never as a `0` it would
      // reason from. Serialising a fabricated zero here is how "the store
      // did not answer" became "the building has no walls" in English.
      wallCount: renderCount(ctx.wallCount),
      doorCount: renderCount(ctx.doorCount),
      windowCount: renderCount(ctx.windowCount),
      // Named, so the model is told WHAT it was not told (C78 §5).
      ...ctx.undeterminedReads.length > 0 ? { couldNotDetermine: ctx.undeterminedReads.map((u) => `${u.scope} (${u.reason})`) } : {}
    }, null, 2);
  }
  // ── Private helpers ───────────────────────────────────────────────────────
  // ── §C78-U-INV-4 · store reads that can REFUSE ────────────────────────────
  // These returned `[]` for BOTH "this project holds no walls" and "the store
  // is absent / threw". The adapter then counted the `[]` and
  // `toPromptContext` serialised the count into an LLM prompt — so an
  // infrastructure failure told the model, in JSON, that the building has no
  // walls. See storeReadDetermination.ts. The `Determination` suffix is kept
  // in the name so a future `?? []` at a call site reads as obviously wrong.
  _roomsDetermination() {
    return determineStoreRead(_store("roomStore"), "roomStore");
  }
  _wallsDetermination() {
    return determineStoreRead(_store("wallStore"), "wallStore");
  }
  /** Doors may live in their own store OR inside WallStore; either is a real
   *  answer. Only when NEITHER can be read is the count unknown. */
  _doorsDetermination() {
    const primary = determineStoreRead(_store("doorStore"), "doorStore");
    if (primary.kind === "determined") return primary;
    return determineStoreRead(_store("wallStore"), "wallStore", "getAllDoors");
  }
  _windowsDetermination() {
    const primary = determineStoreRead(_store("windowStore"), "windowStore");
    if (primary.kind === "determined") return primary;
    return determineStoreRead(_store("wallStore"), "wallStore", "getAllWindows");
  }
  /** The rooms themselves, or `[]` when unreadable — used only where the
   *  determination has ALREADY been reported, never to manufacture a count. */
  _getRooms() {
    const d = this._roomsDetermination();
    return d.kind === "determined" ? d.elements : [];
  }
  _getLevels() {
    try {
      const levels = _store("wallStore")?.getLevels?.() ?? [];
      return levels.map((l) => ({
        levelId: l.id,
        name: l.name ?? `Level ${l.id}`,
        elevation: l.elevation ?? 0,
        roomCount: 0,
        totalAreaM2: 0
      }));
    } catch {
      return [];
    }
  }
  _inferElementType(elementId) {
    try {
      return elementRegistry.getStoreType(elementId) ?? "unknown";
    } catch {
      return "unknown";
    }
  }
  // ── G-3: Decision context for AI prompts ──────────────────────────────────
  /**
   * Returns all non-dismissed decision records formatted as a compact,
   * readable AI context string.
   *
   * Format per record:
   *   "[Room 14, WA042] Enlarged to 18m² (template min 12m²) — bariatric patient equipment"
   *
   * Optionally filtered by elementId scope (pass undefined for all).
   * Used by AI prompt builders to inject design rationale into the context window.
   */
  getDecisionContext(scope) {
    try {
      const records = decisionRecordStore.getNonDismissed?.() ?? [];
      const filtered = scope?.elementId ? records.filter((r) => r.elementId === scope.elementId) : records;
      if (filtered.length === 0) return "";
      const lines = filtered.map((r) => {
        const typeLabel = {
          deviation: "Deviation",
          override: "Override",
          preference: "Preference",
          external: "External"
        };
        const label = typeLabel[r.decisionType] ?? r.decisionType;
        const rationale = r.decision ? ` — ${r.decision}` : " (no rationale recorded)";
        const date = r.recordedAt ? new Date(r.recordedAt).toLocaleDateString() : "";
        return `[${label}] ${r.elementId}${date ? ` (${date})` : ""}${rationale}`;
      });
      return `

## Recorded Design Decisions
${lines.join("\n")}`;
    } catch {
      return "";
    }
  }
  /**
   * Returns all non-dismissed decision records as structured objects.
   * Used by RationaleExporter to generate design justification documents.
   */
  getDecisionRecords(scope) {
    try {
      const all = decisionRecordStore.getAll?.() ?? [];
      return scope?.elementId ? all.filter((r) => r.elementId === scope.elementId) : all;
    } catch {
      return [];
    }
  }
}
const worldModelAdapter = new WorldModelAdapterImpl();

class GenerativeDesignAdvisor {
  async advise(brief, violations) {
    try {
      const resp = await fetch("/api/ai/generative/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, violations })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      return this._parseResponse(data, brief, violations);
    } catch (e) {
      console.error("[GenerativeDesignAdvisor] advise failed:", e.message);
      return {
        canGenerate: false,
        suggestions: [{
          id: "fallback-resize",
          type: "resize_bbox",
          title: "Try a larger bounding box",
          description: `Increase the bounding box to fit all ${brief.rooms.reduce((s, r) => s + r.count, 0)} rooms with circulation space.`,
          briefPatch: {
            boundingBox: {
              width_m: Math.ceil(brief.boundingBox.width_m * 1.25),
              depth_m: Math.ceil(brief.boundingBox.depth_m * 1.25)
            }
          }
        }],
        rawText: e.message
      };
    }
  }
  _parseResponse(data, brief, violations) {
    const rawText = data?.rawText ?? data?.content?.[0]?.text ?? "";
    const suggestions = [];
    const lines = rawText.split("\n").filter((l) => l.trim());
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (lower.includes("bounding box") || lower.includes("increase") || lower.includes("enlarge")) {
        const dims = line.match(/(\d+)\s*[m×x]\s*(\d+)/);
        suggestions.push({
          id: `suggestion-${i}`,
          type: "resize_bbox",
          title: "Resize bounding box",
          description: line.trim(),
          ...dims ? { briefPatch: { boundingBox: { width_m: parseInt(dims[1], 10), depth_m: parseInt(dims[2], 10) } } } : {}
        });
      } else if (lower.includes("adjacen") || lower.includes("hub") || lower.includes("spoke")) {
        suggestions.push({
          id: `suggestion-${i}`,
          type: "reorder_adjacency",
          title: "Revise adjacency requirements",
          description: line.trim()
        });
      } else if (lower.includes("reduc") || lower.includes("remov") || lower.includes("fewer")) {
        suggestions.push({
          id: `suggestion-${i}`,
          type: "reduce_programme",
          title: "Reduce programme",
          description: line.trim()
        });
      } else if (line.trim().length > 20) {
        suggestions.push({
          id: `suggestion-${i}`,
          type: "general",
          title: "Suggestion",
          description: line.trim()
        });
      }
    });
    if (suggestions.length === 0) {
      suggestions.push({
        id: "fallback",
        type: "resize_bbox",
        title: "Increase bounding box by 25%",
        description: `The current ${brief.boundingBox.width_m}m × ${brief.boundingBox.depth_m}m bounding box may be too small. Try ${Math.ceil(brief.boundingBox.width_m * 1.25)}m × ${Math.ceil(brief.boundingBox.depth_m * 1.25)}m.`,
        briefPatch: {
          boundingBox: {
            width_m: Math.ceil(brief.boundingBox.width_m * 1.25),
            depth_m: Math.ceil(brief.boundingBox.depth_m * 1.25)
          }
        }
      });
    }
    return {
      canGenerate: violations.length === 0,
      suggestions: suggestions.slice(0, 5),
      rawText
    };
  }
}
const generativeAdvisor = new GenerativeDesignAdvisor();

class StairComplianceReporter {
  generateReport(stair, levelHeight) {
    const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
    const blondel = 2 * stair.riserHeight + stair.treadDepth;
    const blondelOk = blondel >= 0.6 && blondel <= 0.65;
    const lines = [
      `Stair ${stair.properties.mark ?? stair.id}:`,
      `  Shape: ${stair.shape} (${stair.flights.length} flight${stair.flights.length !== 1 ? "s" : ""})`,
      `  Risers: ${totalRisers} × ${(stair.riserHeight * 1e3).toFixed(0)}mm (range: ${STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1e3}–${STAIR_CONSTRAINTS.MAX_RISER_HEIGHT * 1e3}mm) ${stair.riserHeight >= STAIR_CONSTRAINTS.MIN_RISER_HEIGHT && stair.riserHeight <= STAIR_CONSTRAINTS.MAX_RISER_HEIGHT ? "✓" : "✗"}`,
      `  Tread: ${(stair.treadDepth * 1e3).toFixed(0)}mm (min: ${STAIR_CONSTRAINTS.MIN_TREAD_DEPTH * 1e3}mm) ${stair.treadDepth >= STAIR_CONSTRAINTS.MIN_TREAD_DEPTH ? "✓" : "✗"}`,
      `  Width: ${(stair.width * 1e3).toFixed(0)}mm ${stair.width >= STAIR_CONSTRAINTS.MIN_WIDTH ? "✓" : "✗"}${stair.accessibilityType === "accessible" && stair.width >= STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH ? " (accessible ✓)" : ""}`,
      `  Blondel formula (2R+T): ${(blondel * 1e3).toFixed(0)}mm — ${blondelOk ? "comfortable range ✓" : "outside 600–650mm range ⚠"}`,
      `  Total rise: ${(totalRisers * stair.riserHeight * 1e3).toFixed(0)}mm / level height: ${(levelHeight * 1e3).toFixed(0)}mm`,
      `  Fire rating: ${stair.fireRating ?? "not set ⚠"}`,
      `  Accessibility: ${stair.accessibilityType ?? "standard"}`,
      `  Material: ${stair.properties.material ?? "default"}`,
      `  Stringer: ${stair.properties.stringerType ?? "none"}`,
      `  Nosing: ${stair.properties.nosingType ?? "none"}${stair.properties.nosingDepth ? ` (${(stair.properties.nosingDepth * 1e3).toFixed(0)}mm)` : ""}`
    ];
    return lines.join("\n");
  }
  generateCompactSummary(stair) {
    const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
    const ok = stair.riserHeight >= STAIR_CONSTRAINTS.MIN_RISER_HEIGHT && stair.riserHeight <= STAIR_CONSTRAINTS.MAX_RISER_HEIGHT && stair.treadDepth >= STAIR_CONSTRAINTS.MIN_TREAD_DEPTH && stair.width >= STAIR_CONSTRAINTS.MIN_WIDTH;
    return `${stair.properties.mark ?? "Stair"} — ${stair.shape} shape, ${totalRisers} risers, ${(stair.width * 1e3).toFixed(0)}mm wide ${ok ? "✓" : "⚠"}`;
  }
}

const DIMENSIONAL_LIMITS = {
  // ── Circulation ──────────────────────────────────────────────────────────
  corridor: { areaMaxM2: 8, widthMaxM: 2.5, aspectRatioMax: Infinity, minUsableWallM: 0, minCirculationWidthM: 1, minFrontageM: void 0, minLightRatio: void 0 },
  entrance_hall: { areaMaxM2: 10, widthMaxM: 3.5, aspectRatioMax: 3, minUsableWallM: 1, minCirculationWidthM: 1.2, minFrontageM: void 0, minLightRatio: void 0 },
  // Apartment-layout RoomType union calls the entrance lobby `hall`. Mirror
  // the spec's `entrance_hall` limits onto `hall` so the current vocabulary
  // is validated without renaming. (When the union later splits hall vs
  // entrance_hall the two rows can diverge.)
  hall: { areaMaxM2: 10, widthMaxM: 3.5, aspectRatioMax: 3, minUsableWallM: 1, minCirculationWidthM: 1.2, minFrontageM: void 0, minLightRatio: void 0 },
  // ── Wet rooms ────────────────────────────────────────────────────────────
  bathroom: { areaMaxM2: 15, widthMaxM: 3, aspectRatioMax: 2.5, minUsableWallM: 1.5, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  wc: { areaMaxM2: 6, widthMaxM: 2, aspectRatioMax: 2.5, minUsableWallM: 0.6, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  ensuite: { areaMaxM2: 12, widthMaxM: 3, aspectRatioMax: 2.5, minUsableWallM: 1.5, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  // ── Service ──────────────────────────────────────────────────────────────
  utility_room: { areaMaxM2: 10, widthMaxM: 3, aspectRatioMax: 2.5, minUsableWallM: 1.2, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  // Apartment-layout RoomType union calls this `utility`.
  utility: { areaMaxM2: 10, widthMaxM: 3, aspectRatioMax: 2.5, minUsableWallM: 1.2, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  // ── Public / social ──────────────────────────────────────────────────────
  kitchen: { areaMaxM2: 40, widthMaxM: 6, aspectRatioMax: 3.5, minUsableWallM: 2.4, minCirculationWidthM: void 0, minFrontageM: 1.5, minLightRatio: 0.1 },
  // Apartment-layout vocabulary uses `dining` (not `dining_room`).
  dining_room: { areaMaxM2: 30, widthMaxM: 6, aspectRatioMax: 2.5, minUsableWallM: 1.6, minCirculationWidthM: void 0, minFrontageM: 2, minLightRatio: 0.1 },
  dining: { areaMaxM2: 30, widthMaxM: 6, aspectRatioMax: 2.5, minUsableWallM: 1.6, minCirculationWidthM: void 0, minFrontageM: 2, minLightRatio: 0.1 },
  living_room: { areaMaxM2: 60, widthMaxM: 8, aspectRatioMax: 2.5, minUsableWallM: 2.4, minCirculationWidthM: void 0, minFrontageM: 2.5, minLightRatio: 0.1 },
  living: { areaMaxM2: 60, widthMaxM: 8, aspectRatioMax: 2.5, minUsableWallM: 2.4, minCirculationWidthM: void 0, minFrontageM: 2.5, minLightRatio: 0.1 },
  // ── Private (sleeping / work) ────────────────────────────────────────────
  bedroom: { areaMaxM2: 25, widthMaxM: 5, aspectRatioMax: 2.5, minUsableWallM: 1.4, minCirculationWidthM: void 0, minFrontageM: 1.5, minLightRatio: 0.1 },
  master_bedroom: { areaMaxM2: 35, widthMaxM: 6, aspectRatioMax: 2.5, minUsableWallM: 1.8, minCirculationWidthM: void 0, minFrontageM: 2, minLightRatio: 0.1 },
  // Apartment-layout RoomType union uses `master`.
  master: { areaMaxM2: 35, widthMaxM: 6, aspectRatioMax: 2.5, minUsableWallM: 1.8, minCirculationWidthM: void 0, minFrontageM: 2, minLightRatio: 0.1 },
  private_office: { areaMaxM2: 20, widthMaxM: 5, aspectRatioMax: 3, minUsableWallM: 1.4, minCirculationWidthM: void 0, minFrontageM: 1.5, minLightRatio: 0.1 },
  // Apartment-layout RoomType union uses `study`.
  study: { areaMaxM2: 20, widthMaxM: 5, aspectRatioMax: 3, minUsableWallM: 1.4, minCirculationWidthM: void 0, minFrontageM: 1.5, minLightRatio: 0.1 },
  // ── Spec-listed types not yet in the apartment-layout RoomType union ─────
  storage: { areaMaxM2: 8, widthMaxM: 3, aspectRatioMax: 4, minUsableWallM: 0.6, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 },
  balcony: { areaMaxM2: 20, widthMaxM: 3.5, aspectRatioMax: 6, minUsableWallM: 0, minCirculationWidthM: void 0, minFrontageM: void 0, minLightRatio: void 0 }
};
function limitsFor(roomType) {
  return DIMENSIONAL_LIMITS[roomType];
}

function validateAreaMax(rooms) {
  const out = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const max = limits.areaMaxM2;
    if (!(room.areaM2 > max)) continue;
    out.push({
      classId: "G-1",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: room.areaM2,
      maximum: max,
      message: `G-1 area-max: ${room.type} '${room.id}' is ${room.areaM2.toFixed(2)} m², programmatic max is ${max.toFixed(2)} m² (above this ceiling the room is a different programmatic type).`
    });
  }
  return out;
}

function validateWidthMax(rooms) {
  const out = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const max = limits.widthMaxM;
    if (!(room.widthM > max)) continue;
    out.push({
      classId: "G-2",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: room.widthM,
      maximum: max,
      message: `G-2 width-max: ${room.type} '${room.id}' is ${room.widthM.toFixed(2)} m wide, programmatic max is ${max.toFixed(2)} m (above this ceiling the room is a different programmatic type).`
    });
  }
  return out;
}

function validateAspect(rooms) {
  const out = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const max = limits.aspectRatioMax;
    if (!isFinite(max)) continue;
    const longer = Math.max(room.widthM, room.lengthM);
    const shorter = Math.min(room.widthM, room.lengthM);
    if (!(shorter > 0)) continue;
    const ratio = longer / shorter;
    if (!(ratio > max)) continue;
    out.push({
      classId: "G-3",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: ratio,
      maximum: max,
      message: `G-3 aspect-ratio: ${room.type} '${room.id}' is ${ratio.toFixed(2)}:1 (${longer.toFixed(2)} m × ${shorter.toFixed(2)} m), programmatic max is ${max.toFixed(2)}:1 (above this ceiling the room is a "tunnel" — unusable in plan).`
    });
  }
  return out;
}

function validateWallUsability(rooms) {
  const out = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const min = limits.minUsableWallM;
    if (!(min > 0)) continue;
    if (!(room.longestUsableWallM < min)) continue;
    out.push({
      classId: "G-5",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: room.longestUsableWallM,
      // G-5 is a MINIMUM, but `maximum` is the field name DimensionalViolation
      // uses for "the threshold the room violated". The framework spec keeps
      // one structural field per row so the UI/score-axis stays uniform; the
      // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
      // G-5 is a floor).
      maximum: min,
      message: `G-5 wall-usability: ${room.type} '${room.id}' has longest usable wall ${room.longestUsableWallM.toFixed(2)} m, programmatic min is ${min.toFixed(2)} m (no continuous wall long enough for the primary furniture piece).`
    });
  }
  return out;
}

function validateCirculationWidth(rooms) {
  const out = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const min = limits.minCirculationWidthM;
    if (min === void 0) continue;
    if (!(room.widthM < min)) continue;
    out.push({
      classId: "G-6",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: room.widthM,
      // G-6 is a MINIMUM, but `maximum` is the field name DimensionalViolation
      // uses for "the threshold the room violated". The framework spec keeps
      // one structural field per row so the UI/score-axis stays uniform; the
      // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
      // G-5/G-6 are floors).
      maximum: min,
      message: `G-6 circulation-width: ${room.type} '${room.id}' is ${room.widthM.toFixed(2)} m wide, programmatic min is ${min.toFixed(2)} m (below this floor the passageway fails Part M / ADA wheelchair pass-through).`
    });
  }
  return out;
}

function notMeasuredNote(classId, roomId, roomType, field, reason) {
  return Object.freeze({ classId, roomId, roomType, field, reason });
}

function evaluateFrontage(rooms) {
  const out = [];
  const notMeasured = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const min = limits.minFrontageM;
    if (min === void 0) continue;
    if (typeof room.externalFrontageM !== "number" || !Number.isFinite(room.externalFrontageM)) {
      notMeasured.push(notMeasuredNote(
        "G-7",
        room.id,
        room.type,
        "externalFrontageM",
        `external frontage not measured by this report — G-7 (min ${min.toFixed(2)} m) NOT CHECKED for ${room.type} '${room.id}'`
      ));
      continue;
    }
    if (!(room.externalFrontageM < min)) continue;
    out.push({
      classId: "G-7",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: room.externalFrontageM,
      // G-7 is a MINIMUM, but `maximum` is the field name DimensionalViolation
      // uses for "the threshold the room violated". The framework spec keeps
      // one structural field per row so the UI/score-axis stays uniform; the
      // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
      // G-5/G-6/G-7 are floors).
      maximum: min,
      message: `G-7 frontage: ${room.type} '${room.id}' has external frontage ${room.externalFrontageM.toFixed(2)} m, programmatic min is ${min.toFixed(2)} m (below this floor the room cannot satisfy daylight + ventilation requirements).`
    });
  }
  return { violations: out, notMeasured };
}

const SOCIAL_TYPES$1 = /* @__PURE__ */ new Set([
  "living_room",
  "living",
  "dining_room",
  "dining",
  "family_room"
]);
const PRIVATE_TYPES = /* @__PURE__ */ new Set([
  "bedroom",
  "master_bedroom",
  "master"
]);
const KITCHEN_TYPES = /* @__PURE__ */ new Set([
  "kitchen"
]);
function validateHierarchy(rooms) {
  const social = rooms.filter((r) => SOCIAL_TYPES$1.has(r.type));
  const priv = rooms.filter((r) => PRIVATE_TYPES.has(r.type));
  const kitchens = rooms.filter((r) => KITCHEN_TYPES.has(r.type));
  if (social.length === 0 || priv.length === 0) return [];
  const out = [];
  const largestSocial = social.reduce((a, b) => a.areaM2 >= b.areaM2 ? a : b);
  const largestPrivate = priv.reduce((a, b) => a.areaM2 >= b.areaM2 ? a : b);
  if (!(largestSocial.areaM2 > largestPrivate.areaM2)) {
    out.push({
      classId: "G-8",
      roomId: largestSocial.id,
      roomType: largestSocial.type,
      severity: "error",
      observed: largestSocial.areaM2,
      maximum: largestPrivate.areaM2,
      message: `G-8 hierarchy: largest social room ${largestSocial.type} '${largestSocial.id}' is ${largestSocial.areaM2.toFixed(2)} m², not larger than largest private room ${largestPrivate.type} '${largestPrivate.id}' at ${largestPrivate.areaM2.toFixed(2)} m² (public > private hierarchy inverted).`
    });
  }
  if (kitchens.length > 0) {
    const largestKitchen = kitchens.reduce((a, b) => a.areaM2 >= b.areaM2 ? a : b);
    const smallestPrivate = priv.reduce((a, b) => a.areaM2 <= b.areaM2 ? a : b);
    if (largestKitchen.areaM2 < smallestPrivate.areaM2) {
      out.push({
        classId: "G-8",
        roomId: largestKitchen.id,
        roomType: largestKitchen.type,
        severity: "error",
        observed: largestKitchen.areaM2,
        maximum: smallestPrivate.areaM2,
        message: `G-8 hierarchy: kitchen '${largestKitchen.id}' is ${largestKitchen.areaM2.toFixed(2)} m², smaller than smallest private room ${smallestPrivate.type} '${smallestPrivate.id}' at ${smallestPrivate.areaM2.toFixed(2)} m² (kitchen ≥ smallest sleeping space rule).`
      });
    }
  }
  return out;
}

function evaluateLighting(rooms) {
  const out = [];
  const notMeasured = [];
  for (const room of rooms) {
    const limits = limitsFor(room.type);
    if (limits === void 0) continue;
    const min = limits.minLightRatio;
    if (min === void 0) continue;
    if (!(room.areaM2 > 0)) continue;
    if (typeof room.glazedAreaM2 !== "number" || !Number.isFinite(room.glazedAreaM2)) {
      notMeasured.push(notMeasuredNote(
        "G-10",
        room.id,
        room.type,
        "glazedAreaM2",
        `glazed area not measured by this report — G-10 (min ratio ${min.toFixed(2)}) NOT CHECKED for ${room.type} '${room.id}'`
      ));
      continue;
    }
    const ratio = room.glazedAreaM2 / room.areaM2;
    if (!(ratio < min)) continue;
    out.push({
      classId: "G-10",
      roomId: room.id,
      roomType: room.type,
      severity: "error",
      observed: ratio,
      // G-10 is a MINIMUM, but `maximum` is the field name
      // DimensionalViolation uses for "the threshold the room
      // violated". The framework spec keeps one structural field per
      // row so the UI/score-axis stays uniform; the `classId`
      // disambiguates direction (G-1/G-2/G-3 are ceilings,
      // G-5/G-6/G-7/G-10 are floors).
      maximum: min,
      message: `G-10 lighting: ${room.type} '${room.id}' has glazed-to-floor ratio ${ratio.toFixed(3)} (${room.glazedAreaM2.toFixed(2)} m² / ${room.areaM2.toFixed(2)} m²), programmatic min is ${min.toFixed(2)} (below this floor the room cannot satisfy Building Regs Part F1 daylight requirements).`
    });
  }
  return { violations: out, notMeasured };
}

const MANDATORY_ADJACENCIES = [
  {
    fromType: "master_bedroom",
    toType: "ensuite",
    condition: "if-toType-exists",
    message: "master_bedroom must be adjacent to ensuite when ensuite is present"
  },
  {
    fromType: "kitchen",
    toType: "dining_room",
    condition: "if-toType-exists",
    message: "kitchen must be adjacent to dining_room when a separate dining_room exists"
  },
  {
    fromType: "entrance_hall",
    toType: ["living_room", "kitchen", "corridor"],
    condition: "always",
    message: "entrance_hall must reach a social space or circulation"
  },
  {
    fromType: "utility_room",
    toType: "kitchen",
    condition: "if-fromType-exists",
    message: "utility_room must be adjacent to kitchen"
  },
  {
    fromType: "wc",
    toType: ["corridor", "entrance_hall"],
    condition: "always",
    message: "wc must be accessible from a circulation space, not directly off a private room"
  },
  {
    fromType: "bathroom",
    toType: ["corridor", "entrance_hall"],
    condition: "always",
    message: "bathroom must be accessible from a circulation space"
  }
];
function hasEdge$2(edges, aId, bId) {
  for (const e of edges) {
    if (e.aId === aId && e.bId === bId || e.aId === bId && e.bId === aId) return true;
  }
  return false;
}
function validateMandatoryAdjacency(rooms, edges) {
  const violations = [];
  for (const rule of MANDATORY_ADJACENCIES) {
    const toTypes = typeof rule.toType === "string" ? [rule.toType] : rule.toType;
    const condition = rule.condition ?? "always";
    if (condition === "if-toType-exists") {
      const anyPartner = rooms.some((r) => toTypes.includes(r.type));
      if (!anyPartner) continue;
    }
    const fromRooms = rooms.filter((r) => r.type === rule.fromType);
    for (const fromRoom of fromRooms) {
      const partnerIds = rooms.filter((r) => toTypes.includes(r.type)).map((r) => r.id);
      const satisfied = partnerIds.some((pid) => hasEdge$2(edges, fromRoom.id, pid));
      if (satisfied) continue;
      const partnerLabel = toTypes.length === 1 ? toTypes[0] : toTypes.join("|");
      violations.push({
        classId: "A-1",
        severity: "error",
        roomAId: fromRoom.id,
        roomATypeName: rule.fromType,
        roomBTypeName: partnerLabel,
        // Embed BOTH ids in the message for traceability (the
        // partner id is omitted when no partner exists; the human-
        // readable type label is always present).
        message: `[${fromRoom.id}] (${rule.fromType}) ↛ ${partnerLabel}: ${rule.message}`
      });
    }
  }
  return violations;
}

const PREFERRED_ADJACENCIES = [
  {
    fromType: "kitchen",
    toType: "utility_room",
    condition: "if-toType-exists",
    reason: "service cluster: appliances share plumbing/electrical"
  },
  {
    fromType: "living_room",
    toType: "balcony",
    condition: "if-toType-exists",
    reason: "outdoor extension of social space"
  },
  {
    fromType: "master_bedroom",
    toType: "private_office",
    condition: "if-toType-exists",
    reason: "home-office privacy gradient"
  },
  {
    fromType: "entrance_hall",
    toType: "wc",
    condition: "if-toType-exists",
    reason: "guest-wc convenience near entry"
  },
  {
    fromType: "bedroom",
    toType: "bathroom",
    condition: "if-toType-exists",
    reason: "morning routine adjacency"
  },
  {
    fromType: "kitchen",
    toType: "living_room",
    condition: "if-toType-exists",
    reason: "open-plan social flow when no separate dining"
  }
];
function hasEdge$1(edges, aId, bId) {
  for (const e of edges) {
    if (e.aId === aId && e.bId === bId || e.aId === bId && e.bId === aId) return true;
  }
  return false;
}
function validatePreferredAdjacency(rooms, edges) {
  const violations = [];
  for (const rule of PREFERRED_ADJACENCIES) {
    const toTypes = typeof rule.toType === "string" ? [rule.toType] : rule.toType;
    const anyPartner = rooms.some((r) => toTypes.includes(r.type));
    if (!anyPartner) continue;
    const fromRooms = rooms.filter((r) => r.type === rule.fromType);
    for (const fromRoom of fromRooms) {
      const partnerIds = rooms.filter((r) => toTypes.includes(r.type)).map((r) => r.id);
      const satisfied = partnerIds.some((pid) => hasEdge$1(edges, fromRoom.id, pid));
      if (satisfied) continue;
      const partnerLabel = toTypes.length === 1 ? toTypes[0] : toTypes.join("|");
      violations.push({
        classId: "A-2",
        severity: "warning",
        roomAId: fromRoom.id,
        roomATypeName: rule.fromType,
        roomBTypeName: partnerLabel,
        message: `[${fromRoom.id}] (${rule.fromType}) ↛ ${partnerLabel}: ${rule.reason}`
      });
    }
  }
  return violations;
}

const FORBIDDEN_ADJACENCIES = [
  {
    fromType: "bathroom",
    toType: "kitchen",
    reason: "hygiene separation — no direct door between wet-fixture room and food prep"
  },
  {
    fromType: "wc",
    toType: "kitchen",
    reason: "hygiene separation"
  },
  {
    fromType: "wc",
    toType: "dining_room",
    reason: "hygiene separation"
  },
  {
    fromType: "bedroom",
    toType: "kitchen",
    reason: "acoustic + smell separation (open-plan kitchen IS permitted, but a direct door from a private bedroom is not)"
  },
  {
    fromType: "master_bedroom",
    toType: "kitchen",
    reason: "acoustic + smell separation (open-plan kitchen IS permitted, but a direct door from a private bedroom is not)"
  },
  {
    fromType: "ensuite",
    toType: "kitchen",
    reason: "hygiene + privacy combined"
  }
];
function validateForbiddenAdjacency(rooms, edges) {
  const violations = [];
  const typeOf = /* @__PURE__ */ new Map();
  for (const r of rooms) typeOf.set(r.id, r.type);
  for (const rule of FORBIDDEN_ADJACENCIES) {
    for (const e of edges) {
      const aType = typeOf.get(e.aId);
      const bType = typeOf.get(e.bId);
      if (aType === void 0 || bType === void 0) continue;
      let fromId = null;
      if (aType === rule.fromType && bType === rule.toType) {
        fromId = e.aId;
      } else if (bType === rule.fromType && aType === rule.toType) {
        fromId = e.bId;
      }
      if (fromId === null) continue;
      violations.push({
        classId: "A-3",
        severity: "error",
        roomAId: fromId,
        roomATypeName: rule.fromType,
        roomBTypeName: rule.toType,
        message: `[${fromId}] (${rule.fromType}) ↔ ${rule.toType}: FORBIDDEN — ${rule.reason}`
      });
    }
  }
  return violations;
}

const SEMI_PUBLIC_PARTNERS = /* @__PURE__ */ new Set([
  "corridor",
  "entrance_hall",
  "hall",
  "living_room",
  "dining_room"
]);
const BEDROOM_TYPES$1 = /* @__PURE__ */ new Set(["bedroom", "master_bedroom"]);
function buildAdjacency(rooms, edges) {
  const typeOf = /* @__PURE__ */ new Map();
  for (const r of rooms) typeOf.set(r.id, r.type);
  const adj = /* @__PURE__ */ new Map();
  for (const r of rooms) adj.set(r.id, []);
  for (const e of edges) {
    const aT = typeOf.get(e.aId);
    const bT = typeOf.get(e.bId);
    if (aT === void 0 || bT === void 0) continue;
    adj.get(e.aId).push({ id: e.bId, type: bT });
    adj.get(e.bId).push({ id: e.aId, type: aT });
  }
  return adj;
}
function validatePrivacyGradient(rooms, edges) {
  const violations = [];
  const adj = buildAdjacency(rooms, edges);
  for (const room of rooms) {
    if (BEDROOM_TYPES$1.has(room.type)) {
      const neighbours = adj.get(room.id) ?? [];
      const hasSemiPublic = neighbours.some((n) => SEMI_PUBLIC_PARTNERS.has(n.type));
      const hasBedroomNeighbour = neighbours.some((n) => BEDROOM_TYPES$1.has(n.type));
      if (hasBedroomNeighbour && !hasSemiPublic) {
        violations.push({
          classId: "A-4",
          severity: "error",
          roomAId: room.id,
          roomATypeName: room.type,
          roomBTypeName: "bedroom",
          message: `[${room.id}] (${room.type}) ↔ bedroom: ${room.type === "master_bedroom" ? "master accessed via another bedroom — privacy gradient violation" : "bedroom accessed only via another bedroom — privacy gradient violation"}`
        });
        continue;
      }
    }
    if (room.type === "ensuite") {
      const neighbours = adj.get(room.id) ?? [];
      const bedroomNeighbours = neighbours.filter((n) => BEDROOM_TYPES$1.has(n.type));
      const nonBedroomNeighbours = neighbours.filter((n) => !BEDROOM_TYPES$1.has(n.type));
      let defect = null;
      if (nonBedroomNeighbours.length > 0) {
        defect = `ensuite reachable from non-bedroom (${nonBedroomNeighbours[0].type}) — privacy gradient violation`;
      } else if (bedroomNeighbours.length === 0) {
        defect = "ensuite has no bedroom host — privacy gradient violation";
      } else if (bedroomNeighbours.length >= 2) {
        defect = `ensuite shared by ${bedroomNeighbours.length} bedrooms — ensuites must be single-host`;
      }
      if (defect !== null) {
        violations.push({
          classId: "A-4",
          severity: "error",
          roomAId: room.id,
          roomATypeName: "ensuite",
          roomBTypeName: "bedroom",
          message: `[${room.id}] (ensuite) ↔ bedroom: ${defect}`
        });
      }
    }
  }
  return violations;
}

const ACOUSTIC_INCOMPATIBLE = [
  {
    aType: "utility_room",
    bType: "bedroom",
    reason: "washing machine / dryer noise incompatible with sleeping"
  },
  {
    aType: "utility_room",
    bType: "master_bedroom",
    reason: "washing machine / dryer noise incompatible with sleeping"
  },
  {
    aType: "kitchen",
    bType: "bedroom",
    reason: "kitchen activity + extractor noise incompatible with sleeping (direct edge — open plan is configured at the apartment level, not a direct bedroom edge)"
  },
  {
    aType: "kitchen",
    bType: "master_bedroom",
    reason: "kitchen activity + extractor noise incompatible with sleeping (direct edge — open plan is configured at the apartment level, not a direct bedroom edge)"
  },
  {
    aType: "living_room",
    bType: "bedroom",
    reason: "TV / conversation noise incompatible with sleeping"
  },
  {
    aType: "living_room",
    bType: "master_bedroom",
    reason: "TV / conversation noise incompatible with sleeping"
  }
];
function validateAcousticSeparation(rooms, edges) {
  const violations = [];
  const typeOf = /* @__PURE__ */ new Map();
  for (const r of rooms) typeOf.set(r.id, r.type);
  for (const rule of ACOUSTIC_INCOMPATIBLE) {
    for (const e of edges) {
      const aType = typeOf.get(e.aId);
      const bType = typeOf.get(e.bId);
      if (aType === void 0 || bType === void 0) continue;
      let aId = null;
      if (aType === rule.aType && bType === rule.bType) {
        aId = e.aId;
      } else if (bType === rule.aType && aType === rule.bType) {
        aId = e.bId;
      }
      if (aId === null) continue;
      violations.push({
        classId: "A-5",
        severity: "warning",
        roomAId: aId,
        roomATypeName: rule.aType,
        roomBTypeName: rule.bType,
        message: `[${aId}] (${rule.aType}) ↔ ${rule.bType}: ACOUSTIC — ${rule.reason}`
      });
    }
  }
  return violations;
}

const WET_TYPES = [
  "bathroom",
  "wc",
  "ensuite",
  "kitchen",
  "utility_room",
  "utility"
];
function hasEdge(edges, aId, bId) {
  for (const e of edges) {
    if (e.aId === aId && e.bId === bId || e.aId === bId && e.bId === aId) return true;
  }
  return false;
}
function validateWetCluster(rooms, edges) {
  const wetSet = new Set(WET_TYPES);
  const wetRooms = rooms.filter((r) => wetSet.has(r.type));
  if (wetRooms.length <= 1) return [];
  const wetIds = new Set(wetRooms.map((r) => r.id));
  const violations = [];
  const totalWet = wetRooms.length;
  for (const room of wetRooms) {
    let wetNeighbours = 0;
    for (const other of wetRooms) {
      if (other.id === room.id) continue;
      if (!wetIds.has(other.id)) continue;
      if (hasEdge(edges, room.id, other.id)) wetNeighbours += 1;
    }
    if (wetNeighbours > 0) continue;
    violations.push({
      classId: "A-6",
      severity: "warning",
      roomAId: room.id,
      roomATypeName: room.type,
      roomBTypeName: "wet-cluster",
      message: `[${room.id}] (${room.type}) ↛ wet-cluster: wet-room ${room.type} not clustered: 0 wet-room neighbours despite ${totalWet} wet-rooms in apartment`
    });
  }
  return violations;
}

const NEEDS_FRONTAGE = [
  "living_room",
  "living",
  "master_bedroom",
  "master",
  "bedroom",
  "kitchen",
  "dining_room",
  "dining",
  "private_office",
  "study"
];
function evaluateFrontageTopology(rooms) {
  const needSet = new Set(NEEDS_FRONTAGE);
  const violations = [];
  const notMeasured = [];
  for (const room of rooms) {
    if (!needSet.has(room.type)) continue;
    if (typeof room.hasExteriorEdge !== "boolean") {
      notMeasured.push(notMeasuredNote(
        "A-7",
        room.id,
        room.type,
        "hasExteriorEdge",
        `exterior-edge contact not measured by this report — A-7 NOT CHECKED for ${room.type} '${room.id}'`
      ));
      continue;
    }
    if (room.hasExteriorEdge) continue;
    violations.push({
      classId: "A-7",
      severity: "error",
      roomAId: room.id,
      roomATypeName: room.type,
      roomBTypeName: "exterior",
      message: `[${room.id}] (${room.type}) ↛ exterior: habitable room has no exterior edge — cannot receive daylight or admit a code-required window opening`
    });
  }
  return { violations, notMeasured };
}

const SOCIAL_TYPES = /* @__PURE__ */ new Set([
  "living_room",
  "living",
  "dining_room",
  "dining",
  "family_room"
]);
const BEDROOM_TYPES = /* @__PURE__ */ new Set([
  "bedroom",
  "master_bedroom",
  "master"
]);
function bfsDepths(rooms, edges, entranceRoomId) {
  const known = /* @__PURE__ */ new Set();
  for (const r of rooms) known.add(r.id);
  const adj = /* @__PURE__ */ new Map();
  for (const r of rooms) adj.set(r.id, []);
  for (const e of edges) {
    if (!known.has(e.aId) || !known.has(e.bId)) continue;
    adj.get(e.aId).push(e.bId);
    adj.get(e.bId).push(e.aId);
  }
  const depth = /* @__PURE__ */ new Map();
  for (const r of rooms) depth.set(r.id, Number.POSITIVE_INFINITY);
  depth.set(entranceRoomId, 0);
  const queue = [entranceRoomId];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = depth.get(cur);
    for (const next of adj.get(cur) ?? []) {
      if (depth.get(next) === Number.POSITIVE_INFINITY) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}
function validateSequencing(input) {
  const { rooms, edges, entranceRoomId } = input;
  const entrance = rooms.find((r) => r.id === entranceRoomId);
  if (entrance === void 0) return [];
  const violations = [];
  const depth = bfsDepths(rooms, edges, entranceRoomId);
  const typeOf = /* @__PURE__ */ new Map();
  for (const r of rooms) typeOf.set(r.id, r.type);
  const neighbourTypes = /* @__PURE__ */ new Map();
  for (const r of rooms) neighbourTypes.set(r.id, []);
  for (const e of edges) {
    const aT = typeOf.get(e.aId);
    const bT = typeOf.get(e.bId);
    if (aT === void 0 || bT === void 0) continue;
    neighbourTypes.get(e.aId).push({ id: e.bId, type: bT });
    neighbourTypes.get(e.bId).push({ id: e.aId, type: aT });
  }
  const socialRooms = rooms.filter((r) => SOCIAL_TYPES.has(r.type));
  const bedroomRooms = rooms.filter((r) => BEDROOM_TYPES.has(r.type));
  let maxSocialDepth = Number.NEGATIVE_INFINITY;
  for (const s of socialRooms) {
    const d = depth.get(s.id) ?? Number.POSITIVE_INFINITY;
    if (d !== Number.POSITIVE_INFINITY && d > maxSocialDepth) {
      maxSocialDepth = d;
    }
  }
  const hasReachableSocial = maxSocialDepth !== Number.NEGATIVE_INFINITY;
  for (const room of rooms) {
    const d = depth.get(room.id) ?? Number.POSITIVE_INFINITY;
    if (hasReachableSocial && bedroomRooms.length > 0 && BEDROOM_TYPES.has(room.type) && d !== Number.POSITIVE_INFINITY && d < maxSocialDepth) {
      violations.push({
        classId: "A-8",
        severity: "warning",
        roomAId: room.id,
        roomATypeName: room.type,
        roomBTypeName: "social",
        message: `[${room.id}] (${room.type}) ↔ social: bedroom at depth ${d} is shallower than social rooms at depth ${maxSocialDepth} — privacy gradient sequencing violated`
      });
    }
    if (room.type === "ensuite") {
      const hosts = (neighbourTypes.get(room.id) ?? []).filter((n) => BEDROOM_TYPES.has(n.type));
      if (hosts.length > 0) {
        let minHostDepth = Number.POSITIVE_INFINITY;
        for (const h of hosts) {
          const hd = depth.get(h.id) ?? Number.POSITIVE_INFINITY;
          if (hd < minHostDepth) minHostDepth = hd;
        }
        if (d !== Number.POSITIVE_INFINITY && minHostDepth !== Number.POSITIVE_INFINITY && d <= minHostDepth) {
          violations.push({
            classId: "A-8",
            severity: "warning",
            roomAId: room.id,
            roomATypeName: "ensuite",
            roomBTypeName: "bedroom",
            message: `[${room.id}] (ensuite) ↔ bedroom: ensuite at depth ${d} is not deeper than its host bedroom at depth ${minHostDepth} — sequencing sub-optimal`
          });
        }
      }
    }
    if (d === Number.POSITIVE_INFINITY) {
      violations.push({
        classId: "A-8",
        severity: "warning",
        roomAId: room.id,
        roomATypeName: room.type,
        roomBTypeName: "entrance",
        message: `[${room.id}] (${room.type}) ↔ entrance: ${room.type} at ${room.id} is unreachable from entrance — sequencing graph is disconnected`
      });
    }
  }
  return violations;
}

function validateApartmentLayout(input) {
  const g7 = evaluateFrontage(input.rooms);
  const g10 = evaluateLighting(input.rooms);
  const dimensional = [
    ...validateAreaMax(input.rooms),
    ...validateWidthMax(input.rooms),
    ...validateAspect(input.rooms),
    ...validateWallUsability(input.rooms),
    ...validateCirculationWidth(input.rooms),
    ...g7.violations,
    ...validateHierarchy(input.rooms),
    ...g10.violations
  ];
  const a7 = evaluateFrontageTopology(input.rooms);
  const topology = [
    ...validateMandatoryAdjacency(input.rooms, input.edges),
    ...validatePreferredAdjacency(input.rooms, input.edges),
    ...validateForbiddenAdjacency(input.rooms, input.edges),
    ...validatePrivacyGradient(input.rooms, input.edges),
    ...validateAcousticSeparation(input.rooms, input.edges),
    ...validateWetCluster(input.rooms, input.edges),
    ...a7.violations,
    // A-8 requires entranceRoomId — SKIP if not provided.
    ...input.entranceRoomId !== void 0 ? validateSequencing({
      rooms: input.rooms,
      edges: input.edges,
      entranceRoomId: input.entranceRoomId
    }) : []
  ];
  let errors = 0;
  let warnings = 0;
  const byClass = /* @__PURE__ */ Object.create(null);
  for (const v of dimensional) {
    if (v.severity === "error") errors++;
    else warnings++;
    byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
  }
  for (const v of topology) {
    if (v.severity === "error") errors++;
    else warnings++;
    byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
  }
  const notMeasured = [
    ...g7.notMeasured,
    ...g10.notMeasured,
    ...a7.notMeasured
  ];
  return Object.freeze({
    dimensional: Object.freeze(dimensional),
    topology: Object.freeze(topology),
    errors,
    warnings,
    total: dimensional.length + topology.length,
    violationsByClass: Object.freeze(byClass),
    notMeasured: Object.freeze(notMeasured)
  });
}
function passesLegality(report) {
  return report.errors === 0;
}
function summarise(report) {
  if (report.total === 0) return "0 violations";
  const classKeys = Object.keys(report.violationsByClass).sort();
  const tally = classKeys.map((k) => `${k}×${report.violationsByClass[k]}`).join(", ");
  const errorWord = report.errors === 1 ? "error" : "errors";
  const warnWord = report.warnings === 1 ? "warning" : "warnings";
  return `${report.total} violations: ${report.errors} ${errorWord}, ${report.warnings} ${warnWord} (${tally})`;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
}
function toRoom(src, opts) {
  const rectW = num(src.rect?.w) ?? 0;
  const rectH = num(src.rect?.h) ?? 0;
  const areaM2 = num(src.areaM2) ?? rectW * rectH;
  const widthM = num(src.widthM) ?? Math.min(rectW, rectH);
  const lengthM = num(src.lengthM) ?? Math.max(rectW, rectH);
  const longestUsableWallM = num(src.longestUsableWallM) ?? num(opts.defaultLongestUsableWallM) ?? Math.max(widthM, lengthM);
  const externalFrontageM = num(src.externalFrontageM) ?? num(opts.defaultExternalFrontageM);
  const hasExteriorEdge = typeof src.hasExteriorEdge === "boolean" ? src.hasExteriorEdge : externalFrontageM !== void 0 ? externalFrontageM > 0 : void 0;
  const glazedAreaM2 = num(src.glazedAreaM2) ?? num(opts.defaultGlazedAreaM2);
  return Object.freeze({
    id: src.id,
    type: src.type,
    areaM2,
    widthM,
    lengthM,
    longestUsableWallM,
    ...externalFrontageM !== void 0 ? { externalFrontageM } : {},
    ...hasExteriorEdge !== void 0 ? { hasExteriorEdge } : {},
    ...glazedAreaM2 !== void 0 ? { glazedAreaM2 } : {}
  });
}
function toEdge(src) {
  return Object.freeze({ aId: src.aId, bId: src.bId });
}
function toValidationInput(dto, opts = {}) {
  const rooms = Object.freeze(dto.rooms.map((r) => toRoom(r, opts)));
  const edges = Object.freeze((dto.edges ?? []).map(toEdge));
  const out = dto.entranceRoomId !== void 0 ? { rooms, edges, entranceRoomId: dto.entranceRoomId } : { rooms, edges };
  return Object.freeze(out);
}

function sortedClassIds(report) {
  const set = /* @__PURE__ */ new Set();
  for (const v of report.dimensional) set.add(v.classId);
  for (const v of report.topology) set.add(v.classId);
  return Array.from(set).sort();
}
const CLASS_LABEL = Object.freeze({
  "G-1": "G-1 area-max",
  "G-2": "G-2 width-max",
  "G-3": "G-3 aspect-ratio",
  "G-5": "G-5 wall-usability",
  "G-6": "G-6 circulation-width",
  "G-7": "G-7 frontage",
  "G-8": "G-8 hierarchy",
  "G-10": "G-10 lighting",
  "A-1": "A-1 mandatory",
  "A-2": "A-2 preferred",
  "A-3": "A-3 forbidden",
  "A-4": "A-4 privacy",
  "A-5": "A-5 acoustic",
  "A-6": "A-6 wet-cluster",
  "A-7": "A-7 frontage-topology"
});
function noun(count, singular, plural) {
  return count === 1 ? singular : plural;
}
function notMeasuredSection(notes) {
  const sorted = [...notes].sort((a, b) => a.classId === b.classId ? a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0 : a.classId < b.classId ? -1 : 1);
  const classes = Array.from(new Set(sorted.map((n) => n.classId))).sort();
  const lines = [];
  lines.push("### NOT MEASURED — checks that could not run");
  lines.push(
    `${sorted.length} ${noun(sorted.length, "check", "checks")} SKIPPED because the value they compare was never measured by this report (${classes.join(", ")}). These are NOT violations, and their absence from the counts above is NOT a pass.`
  );
  for (const n of sorted) {
    lines.push(`- **${n.classId}** [${n.roomId}] (${n.field}): ${n.reason}`);
  }
  return lines;
}
function classSeverity(report, classId) {
  let sawWarning = false;
  for (const v of report.dimensional) {
    if (v.classId !== classId) continue;
    if (v.severity === "error") return "error";
    if (v.severity === "warning") sawWarning = true;
  }
  for (const v of report.topology) {
    if (v.classId !== classId) continue;
    if (v.severity === "error") return "error";
    if (v.severity === "warning") sawWarning = true;
  }
  return sawWarning ? "warning" : "-";
}
function formatViolationReport(report, opts = {}) {
  const verbose = opts.verbose ?? true;
  const maxPerClass = opts.maxPerClass ?? 5;
  const includeLegend = opts.includeLegend ?? true;
  const notMeasured = report.notMeasured ?? [];
  if (report.total === 0) {
    const head = [
      "## Apartment Layout Validation Report",
      "",
      "**No violations.** Layout passes all 15 validator slices."
    ];
    return notMeasured.length === 0 ? head.join("\n") : [...head, "", ...notMeasuredSection(notMeasured)].join("\n");
  }
  const lines = [];
  lines.push("## Apartment Layout Validation Report");
  lines.push("");
  lines.push(
    `**Total**: ${report.total} ${noun(report.total, "violation", "violations")} (${report.errors} ${noun(report.errors, "error", "errors")}, ${report.warnings} ${noun(report.warnings, "warning", "warnings")})`
  );
  lines.push("");
  lines.push("### Summary by class");
  lines.push("| Class | Count | Severity |");
  lines.push("| --- | --- | --- |");
  const classes = sortedClassIds(report);
  for (const cid of classes) {
    const label = CLASS_LABEL[cid] ?? cid;
    const count = report.violationsByClass[cid] ?? 0;
    const sev = classSeverity(report, cid);
    lines.push(`| ${label} | ${count} | ${sev} |`);
  }
  if (verbose) {
    if (report.dimensional.length > 0) {
      lines.push("");
      lines.push("### Dimensional violations (G-classes)");
      const byClass = /* @__PURE__ */ new Map();
      for (const v of report.dimensional) {
        const arr = byClass.get(v.classId) ?? [];
        arr.push(v);
        byClass.set(v.classId, arr);
      }
      const dimClasses = Array.from(byClass.keys()).sort();
      for (const cid of dimClasses) {
        const arr = byClass.get(cid);
        const shown = arr.slice(0, maxPerClass);
        for (const v of shown) {
          lines.push(
            `- **${v.classId}** [${v.roomId}]: observed ${v.observed}, max ${v.maximum} — "${v.message}"`
          );
        }
        if (arr.length > shown.length) {
          const more = arr.length - shown.length;
          lines.push(`- ...${more} more truncated`);
        }
      }
    }
    if (report.topology.length > 0) {
      lines.push("");
      lines.push("### Topology violations (A-classes)");
      const byClass = /* @__PURE__ */ new Map();
      for (const v of report.topology) {
        const arr = byClass.get(v.classId) ?? [];
        arr.push(v);
        byClass.set(v.classId, arr);
      }
      const topoClasses = Array.from(byClass.keys()).sort();
      for (const cid of topoClasses) {
        const arr = byClass.get(cid);
        const shown = arr.slice(0, maxPerClass);
        for (const v of shown) {
          lines.push(
            `- **${v.classId}** [${v.roomAId} → ${v.roomBTypeName}]: "${v.message}"`
          );
        }
        if (arr.length > shown.length) {
          const more = arr.length - shown.length;
          lines.push(`- ...${more} more truncated`);
        }
      }
    }
  }
  if (notMeasured.length > 0) {
    lines.push("");
    lines.push(...notMeasuredSection(notMeasured));
  }
  if (includeLegend) {
    lines.push("");
    lines.push("### Legend");
    lines.push("- G-1..G-10: dimensional constraints");
    lines.push("- A-1..A-8: topological constraints");
    lines.push("- error: hard legality fail");
    lines.push("- warning: soft penalty");
  }
  return lines.join("\n");
}
function formatViolationLine(report) {
  const unrun = report.notMeasured ?? [];
  const suffix = unrun.length === 0 ? "" : ` · ${unrun.length} ${noun(unrun.length, "check", "checks")} NOT MEASURED (${Array.from(new Set(unrun.map((n) => n.classId))).sort().join(", ")})`;
  if (report.total === 0) return `0 violations${suffix}`;
  const tallyKeys = Object.keys(report.violationsByClass).sort();
  const tally = tallyKeys.map((k) => `${k}×${report.violationsByClass[k]}`).join(", ");
  return `${report.total} ${noun(report.total, "violation", "violations")}: ${report.errors} ${noun(report.errors, "error", "errors")}, ${report.warnings} ${noun(report.warnings, "warning", "warnings")} (${tally})${suffix}`;
}
function groupByClass(report) {
  const bag = /* @__PURE__ */ new Map();
  for (const v of report.dimensional) {
    const arr = bag.get(v.classId) ?? [];
    arr.push(v);
    bag.set(v.classId, arr);
  }
  for (const v of report.topology) {
    const arr = bag.get(v.classId) ?? [];
    arr.push(v);
    bag.set(v.classId, arr);
  }
  const sorted = /* @__PURE__ */ new Map();
  for (const k of Array.from(bag.keys()).sort()) sorted.set(k, bag.get(k));
  return sorted;
}
function groupByRoom(report) {
  const bag = /* @__PURE__ */ new Map();
  for (const v of report.dimensional) {
    const arr = bag.get(v.roomId) ?? [];
    arr.push(v);
    bag.set(v.roomId, arr);
  }
  for (const v of report.topology) {
    const arr = bag.get(v.roomAId) ?? [];
    arr.push(v);
    bag.set(v.roomAId, arr);
  }
  const sorted = /* @__PURE__ */ new Map();
  for (const k of Array.from(bag.keys()).sort()) sorted.set(k, bag.get(k));
  return sorted;
}

function validateAndFormatLayout(dto, opts = {}) {
  const input = toValidationInput(dto, opts.adapter);
  const report = validateApartmentLayout(input);
  const summaryLine = formatViolationLine(report);
  const markdownReport = formatViolationReport(report, opts.format);
  const passes = passesLegality(report);
  return Object.freeze({
    report,
    passesLegality: passes,
    summaryLine,
    markdownReport
  });
}

const BYOM_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "anthropic",
    label: "Claude",
    blurb: "Anthropic — the same family PRYZM runs by default.",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    auth: "api-key",
    defaultBaseUrl: "https://api.anthropic.com/v1/messages",
    allowsCustomBaseUrl: false,
    connectSrcOrigin: "https://api.anthropic.com",
    defaultModel: "claude-haiku-4-5",
    browserDirect: "supported-opt-in",
    browserDirectNote: "Anthropic serves browser requests only when the request carries its explicit browser opt-in header. PRYZM sends that header for you.",
    keyHint: "sk-ant-",
    dialect: "anthropic"
  }),
  Object.freeze({
    id: "openai",
    label: "ChatGPT",
    blurb: "OpenAI — GPT models via the Chat Completions API.",
    consoleUrl: "https://platform.openai.com/api-keys",
    auth: "api-key",
    defaultBaseUrl: "https://api.openai.com/v1/chat/completions",
    allowsCustomBaseUrl: false,
    connectSrcOrigin: "https://api.openai.com",
    defaultModel: "gpt-4o-mini",
    browserDirect: "supported-undocumented",
    browserDirectNote: "Measured 2026-08-23: the endpoint does answer a browser preflight. But OpenAI does not document that, and its own guides tell developers to keep keys on a server — so it could stop working without notice. If it does, you will see the error itself; PRYZM will not silently reroute the request.",
    keyHint: "sk-",
    dialect: "openai"
  }),
  Object.freeze({
    id: "google",
    label: "Gemini",
    blurb: "Google AI Studio — Gemini models.",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    auth: "api-key",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    allowsCustomBaseUrl: false,
    connectSrcOrigin: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash",
    browserDirect: "supported-undocumented",
    browserDirectNote: "Measured 2026-08-23: the endpoint does answer a browser preflight. Google does not document that and advises a backend proxy for client apps, so it could stop working without notice. If it does, you will see the error itself; PRYZM will not silently reroute the request.",
    keyHint: null,
    dialect: "google"
  }),
  Object.freeze({
    id: "deepseek",
    label: "DeepSeek",
    blurb: "DeepSeek — an OpenAI-compatible endpoint.",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    auth: "api-key",
    defaultBaseUrl: "https://api.deepseek.com/chat/completions",
    allowsCustomBaseUrl: false,
    connectSrcOrigin: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    browserDirect: "supported-undocumented",
    browserDirectNote: "Measured 2026-08-23: the endpoint does answer a browser preflight. DeepSeek does not document browser use either way, so it could stop working without notice. If it does, you will see the error itself; PRYZM will not silently reroute the request.",
    keyHint: "sk-",
    dialect: "openai"
  }),
  Object.freeze({
    id: "openrouter",
    label: "OpenRouter",
    blurb: "OpenRouter — one key, many models.",
    consoleUrl: "https://openrouter.ai/keys",
    auth: "api-key",
    defaultBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
    allowsCustomBaseUrl: false,
    connectSrcOrigin: "https://openrouter.ai",
    defaultModel: "anthropic/claude-3.5-haiku",
    browserDirect: "supported-documented",
    browserDirectNote: "OpenRouter documents calling it straight from a web page and its preflight was confirmed on 2026-08-23. This is the best-supported of the hosted options.",
    keyHint: "sk-or-",
    dialect: "openai"
  }),
  Object.freeze({
    id: "ollama",
    label: "Ollama (fully local)",
    blurb: "Runs on your own machine. No key, and your prompt never leaves it.",
    consoleUrl: "https://ollama.com/download",
    auth: "none",
    defaultBaseUrl: "http://localhost:11434/v1/chat/completions",
    allowsCustomBaseUrl: true,
    connectSrcOrigin: "http://localhost:11434",
    defaultModel: "llama3.1",
    browserDirect: "local-opt-in",
    browserDirectNote: "Two things must be true, and both are on your machine, not ours. (1) Ollama only accepts 127.0.0.1 and 0.0.0.0 origins by default — start it with OLLAMA_ORIGINS set to the address this page is served from. (2) Chrome 142+ and recent Firefox ask permission before a web page may reach your local network; Safari refuses outright. Running PRYZM from http://localhost avoids all of it. See C105 §3.4.",
    keyHint: null,
    dialect: "openai"
  })
]);
function findProvider(id) {
  return BYOM_PROVIDERS.find((p) => p.id === id) ?? null;
}
function byomConnectSrcOrigins() {
  return BYOM_PROVIDERS.map((p) => p.connectSrcOrigin);
}
function buildUrl(provider, baseUrl, model) {
  if (provider.dialect === "google") {
    return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(model)}:generateContent`;
  }
  return baseUrl;
}
function buildHeaders(provider, secret) {
  const h = { "content-type": "application/json" };
  switch (provider.dialect) {
    case "anthropic":
      h["x-api-key"] = secret;
      h["anthropic-version"] = "2023-06-01";
      h["anthropic-dangerous-direct-browser-access"] = "true";
      break;
    case "google":
      h["x-goog-api-key"] = secret;
      break;
    case "openai":
      if (provider.auth === "api-key") h["authorization"] = `Bearer ${secret}`;
      break;
  }
  if (provider.id === "openrouter") {
    h["HTTP-Referer"] = "https://pryzm.app";
    h["X-Title"] = "PRYZM";
  }
  return h;
}
function buildBody(provider, req, model) {
  const maxTokens = req.maxTokens ?? 1024;
  switch (provider.dialect) {
    case "anthropic":
      return {
        model,
        max_tokens: maxTokens,
        ...req.system ? { system: req.system } : {},
        messages: [{ role: "user", content: req.user }],
        ...req.stopSequences ? { stop_sequences: [...req.stopSequences] } : {}
      };
    case "google":
      return {
        ...req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {},
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...req.stopSequences ? { stopSequences: [...req.stopSequences] } : {}
        }
      };
    case "openai":
      return {
        model,
        max_tokens: maxTokens,
        messages: [
          ...req.system ? [{ role: "system", content: req.system }] : [],
          { role: "user", content: req.user }
        ],
        ...req.stopSequences ? { stop: [...req.stopSequences] } : {}
      };
  }
}
function parseResponse(provider, data, fallbackModel) {
  const d = data ?? {};
  switch (provider.dialect) {
    case "anthropic": {
      const content = Array.isArray(d.content) ? d.content : [];
      if (!content.length) return null;
      const text = content.filter((b) => b.type === "text").map((b) => typeof b.text === "string" ? b.text : "").join("");
      const usage = d.usage ?? {};
      return {
        text,
        model: typeof d.model === "string" ? d.model : fallbackModel,
        inputTokens: numOr0(usage.input_tokens),
        outputTokens: numOr0(usage.output_tokens),
        ...typeof d.stop_reason === "string" ? { stopReason: d.stop_reason } : {}
      };
    }
    case "google": {
      const cands = Array.isArray(d.candidates) ? d.candidates : [];
      if (!cands.length) return null;
      const first = cands[0] ?? {};
      const content = first.content ?? {};
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const text = parts.map((p) => typeof p.text === "string" ? p.text : "").join("");
      const usage = d.usageMetadata ?? {};
      return {
        text,
        model: typeof d.modelVersion === "string" ? d.modelVersion : fallbackModel,
        inputTokens: numOr0(usage.promptTokenCount),
        outputTokens: numOr0(usage.candidatesTokenCount),
        ...typeof first.finishReason === "string" ? { stopReason: first.finishReason } : {}
      };
    }
    case "openai": {
      const choices = Array.isArray(d.choices) ? d.choices : [];
      if (!choices.length) return null;
      const head = choices[0] ?? {};
      const msg = head.message ?? {};
      const usage = d.usage ?? {};
      return {
        text: typeof msg.content === "string" ? msg.content : "",
        model: typeof d.model === "string" ? d.model : fallbackModel,
        inputTokens: numOr0(usage.prompt_tokens),
        outputTokens: numOr0(usage.completion_tokens),
        ...typeof head.finish_reason === "string" ? { stopReason: head.finish_reason } : {}
      };
    }
  }
}
function numOr0(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

class ByomSecretLeakError extends Error {
  kind = "byom-secret-leak";
  constructor(where) {
    super(
      `[byom] refused to emit a value from "${where}" because it matched a provider-credential shape. A user-supplied API key must never reach a log, span, error report or project file (C105 §4.4). Emit the provider ID and the masked descriptor instead.`
    );
    this.name = "ByomSecretLeakError";
  }
}
const SECRET_PATTERNS = Object.freeze([
  /sk-ant-[A-Za-z0-9_-]{8,}/,
  // Anthropic
  /sk-or-[A-Za-z0-9_-]{8,}/,
  // OpenRouter
  /sk-proj-[A-Za-z0-9_-]{8,}/,
  // OpenAI project keys
  /sk-[A-Za-z0-9_-]{20,}/,
  // OpenAI / DeepSeek classic
  /AIza[A-Za-z0-9_-]{20,}/,
  // Google API keys
  /\bBearer\s+[A-Za-z0-9._-]{20,}/i,
  // any bearer header that leaked into text
  /[A-Za-z0-9_-]{40,}/
  // generic high-entropy tail
]);
function looksLikeSecret(value) {
  if (typeof value !== "string" || value.length < 8) return false;
  return SECRET_PATTERNS.some((re) => re.test(value));
}
function redactSecrets(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), "[redacted]");
  }
  return out;
}
function assertNoSecret(value, where) {
  if (looksLikeSecret(value)) throw new ByomSecretLeakError(where);
}
function maskCredential(secret) {
  if (typeof secret !== "string" || secret.length === 0) return "(none)";
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)} (${secret.length} chars)`;
}

const BYOM_STORAGE_PREFIX = "pryzm-byom-";
const BYOM_ACTIVE_KEY = `${BYOM_STORAGE_PREFIX}active`;
function entryKey(id) {
  return `${BYOM_STORAGE_PREFIX}p-${id}`;
}
class ByomVault {
  constructor(storage, area) {
    this.storage = storage;
    this.area = area;
  }
  storage;
  area;
  /** Providers with a stored entry in THIS area. */
  configuredProviders() {
    let keys;
    try {
      keys = this.storage.keys();
    } catch {
      return [];
    }
    const out = [];
    for (const k of keys) {
      if (!k.startsWith(`${BYOM_STORAGE_PREFIX}p-`)) continue;
      const id = k.slice(`${BYOM_STORAGE_PREFIX}p-`.length);
      const provider = findProvider(id);
      if (provider) out.push(provider.id);
    }
    return out;
  }
  /** Which provider the user selected, or `null` for "use PRYZM's default". */
  activeProviderId() {
    let raw;
    try {
      raw = this.storage.get(BYOM_ACTIVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    return findProvider(raw)?.id ?? null;
  }
  /** Select the provider the chat should use. `null` returns to PRYZM's key. */
  setActiveProvider(id) {
    try {
      if (id === null) this.storage.remove(BYOM_ACTIVE_KEY);
      else this.storage.set(BYOM_ACTIVE_KEY, id);
    } catch {
    }
  }
  /**
   * Store a credential. `secret` may be empty ONLY for a keyless provider —
   * an empty key for an `api-key` provider is a misconfiguration and is
   * REJECTED rather than saved, because a saved-but-empty key produces a 401
   * the user will read as "my key is wrong" when in fact nothing was stored.
   */
  save(provider, input) {
    const secret = (input.secret ?? "").trim();
    if (provider.auth === "api-key" && !secret) {
      return { ok: false, reason: `${provider.label} needs an API key. Nothing was saved.` };
    }
    if (!provider.allowsCustomBaseUrl && input.baseUrl && input.baseUrl !== provider.defaultBaseUrl) {
      return { ok: false, reason: `${provider.label} does not accept a custom address. Nothing was saved.` };
    }
    const entry = {
      ...secret ? { k: secret } : {},
      ...input.model?.trim() ? { m: input.model.trim() } : {},
      ...input.baseUrl?.trim() ? { u: input.baseUrl.trim() } : {}
    };
    try {
      this.storage.set(entryKey(provider.id), JSON.stringify(entry));
    } catch (err) {
      return {
        ok: false,
        reason: "This browser refused to store the key (private mode, or site data is blocked)."
      };
    }
    return { ok: true };
  }
  /** Forget one provider's credential. */
  clear(id) {
    try {
      this.storage.remove(entryKey(id));
    } catch {
    }
    if (this.activeProviderId() === id) this.setActiveProvider(null);
  }
  /** Forget everything BYOM in this area. Used by the UI's "remove all". */
  clearAll() {
    for (const id of this.configuredProviders()) this.clear(id);
    this.setActiveProvider(null);
  }
  read(id) {
    let raw;
    try {
      raw = this.storage.get(entryKey(id));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  /** Non-secret view of one provider's configuration, or `null` if unset. */
  describe(id) {
    const provider = findProvider(id);
    if (!provider) return null;
    const entry = this.read(id);
    if (!entry) return null;
    return {
      providerId: provider.id,
      area: this.area,
      model: entry.m ?? provider.defaultModel,
      baseUrl: entry.u ?? provider.defaultBaseUrl,
      maskedKey: maskCredential(entry.k ?? ""),
      enabled: this.activeProviderId() === provider.id
    };
  }
  /**
   * The secret-bearing resolve. ⛔ The ONLY caller that should hold this value
   * is `createByomRelay`, and it must drop it after the fetch.
   */
  resolve(id) {
    const descriptor = this.describe(id);
    if (!descriptor) return null;
    const provider = findProvider(id);
    if (!provider) return null;
    const entry = this.read(id);
    const secret = entry?.k ?? "";
    if (provider.auth === "api-key" && !secret) return null;
    return { ...descriptor, secret };
  }
}
class ByomVaultSet {
  constructor(session, device) {
    this.session = session;
    this.device = device;
  }
  session;
  device;
  /** Ordered most-ephemeral first. */
  vaults() {
    return [this.session, this.device];
  }
  /**
   * What the user SELECTED, regardless of whether a credential for it can be
   * resolved.
   *
   * ⚠ This is deliberately a DIFFERENT method from `activeProviderId()`, and the
   * difference is load-bearing. "The user chose nothing" and "the user chose
   * Claude but the stored key is gone" are two different situations with two
   * different things to tell them, and an earlier draft of this class collapsed
   * them into one `null` — which made a vanished key indistinguishable from a
   * deliberate default. `byomVaultAndRoute.test.ts §ROUTE` caught it.
   * (§CONTEXT-DATA-HONESTY: failure and emptiness are never the same value.)
   */
  selectedProviderId() {
    for (const v of this.vaults()) {
      const id = v.activeProviderId();
      if (id) return id;
    }
    return null;
  }
  /** The selected provider that also RESOLVES, or `null`. */
  activeProviderId() {
    for (const v of this.vaults()) {
      const id = v.activeProviderId();
      if (id && v.describe(id)) return id;
    }
    return null;
  }
  /** Non-secret view of every configured provider, across both areas. */
  describeAll() {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const v of this.vaults()) {
      for (const id of v.configuredProviders()) {
        if (seen.has(id)) continue;
        const d = v.describe(id);
        if (!d) continue;
        seen.add(id);
        out.push(d);
      }
    }
    return out;
  }
  /** Resolve the ACTIVE credential, or `null` when the user has none selected. */
  resolveActive() {
    const id = this.activeProviderId();
    if (!id) return null;
    for (const v of this.vaults()) {
      const c = v.resolve(id);
      if (c) return c;
    }
    return null;
  }
}
function assertDescriptorIsSafe(d, where) {
  for (const [field, value] of Object.entries(d)) {
    if (field === "maskedKey") continue;
    assertNoSecret(value, `${where}.${field}`);
  }
}

class ByomProviderError extends Error {
  constructor(providerId, providerLabel, status, providerMessage, blockedByBrowser) {
    super(`[byom:${providerId}] ${status || "network"} — ${providerMessage}`);
    this.providerId = providerId;
    this.providerLabel = providerLabel;
    this.status = status;
    this.providerMessage = providerMessage;
    this.blockedByBrowser = blockedByBrowser;
    this.name = "ByomProviderError";
  }
  providerId;
  providerLabel;
  status;
  providerMessage;
  blockedByBrowser;
  kind = "byom-provider-error";
  /** One sentence for the chat transcript. Says WHOSE fault and WHAT to do. */
  userMessage() {
    if (this.blockedByBrowser) {
      return `Your browser blocked the call to ${this.providerLabel} before it left this device (${this.providerMessage}). Your key was not sent anywhere else, and PRYZM did not substitute its own. Check that ${this.providerLabel} allows calls from a web page, or switch back to PRYZM's built-in AI in AI provider keys.`;
    }
    if (this.status === 401 || this.status === 403) {
      return `${this.providerLabel} rejected your API key (${this.status}): ${this.providerMessage}. PRYZM did NOT fall back to its own key — nothing was spent on your behalf. Re-check the key in AI provider keys, or clear it to return to PRYZM's built-in AI.`;
    }
    if (this.status === 429) {
      return `${this.providerLabel} rate-limited your key (429): ${this.providerMessage}. PRYZM did NOT fall back to its own key. Wait and retry, or clear the key to return to PRYZM's built-in AI.`;
    }
    return `${this.providerLabel} could not answer (${this.status}): ${this.providerMessage}. PRYZM did NOT fall back to its own key.`;
  }
}
function describeProviderError(body) {
  const cap = (s) => redactSecrets(s).slice(0, 400);
  if (typeof body === "string") return cap(body) || "no detail supplied";
  const d = body ?? {};
  const err = d.error;
  if (typeof err === "string") return cap(err);
  if (err && typeof err === "object") {
    const e = err;
    if (typeof e.message === "string") return cap(e.message);
    if (typeof e.type === "string") return cap(e.type);
  }
  if (typeof d.message === "string") return cap(d.message);
  if (typeof d.detail === "string") return cap(d.detail);
  try {
    return cap(JSON.stringify(body));
  } catch {
    return "no detail supplied";
  }
}
function createByomRelay(credential, fetchImpl = globalThis.fetch) {
  const provider = findProvider(credential.providerId);
  if (!provider) {
    throw new Error(`[byom] unknown provider id "${credential.providerId}"`);
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("[byom] no fetch implementation available");
  }
  return {
    async complete(req) {
      const model = credential.model || provider.defaultModel;
      const url = buildUrl(provider, credential.baseUrl || provider.defaultBaseUrl, model);
      const headers = buildHeaders(provider, credential.secret);
      const body = JSON.stringify(buildBody(provider, req, model));
      let resp;
      try {
        resp = await fetchImpl(url, { method: "POST", headers, body });
      } catch (err) {
        const detail = redactSecrets(err instanceof Error ? err.message : String(err));
        throw new ByomProviderError(provider.id, provider.label, 0, detail, true);
      }
      if (!resp.ok) {
        let parsed2 = null;
        try {
          parsed2 = await resp.json();
        } catch {
          try {
            parsed2 = await resp.text();
          } catch {
            parsed2 = null;
          }
        }
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          describeProviderError(parsed2),
          false
        );
      }
      let data;
      try {
        data = await resp.json();
      } catch (err) {
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          redactSecrets(`the response was not JSON: ${err instanceof Error ? err.message : String(err)}`),
          false
        );
      }
      const parsed = parseResponse(provider, data, model);
      if (!parsed) {
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          "the response carried no completion",
          false
        );
      }
      return {
        text: parsed.text,
        // ⛔ Zero because PRYZM paid zero. See the header, and C105 §5.2.
        costUsd: 0,
        model: parsed.model,
        tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
        ...parsed.stopReason ? { stopReason: parsed.stopReason } : {}
      };
    }
  };
}

const PRYZM_ROUTE = (reason) => ({
  keyClass: "pryzm-managed",
  reason,
  providerId: null,
  providerLabel: "PRYZM",
  privacyStatement: "This request goes to PRYZM, which relays it to Anthropic. It is covered by your PRYZM plan and its quota.",
  quotaApplies: true,
  billsToPryzm: true
});
function resolveAiRoute(vaults) {
  if (!vaults) return PRYZM_ROUTE("vault-unavailable");
  let credential;
  let selectedId;
  try {
    selectedId = vaults.selectedProviderId();
    credential = vaults.resolveActive();
  } catch {
    return PRYZM_ROUTE("vault-unavailable");
  }
  if (!selectedId) return PRYZM_ROUTE("no-provider-selected");
  if (!credential) return PRYZM_ROUTE("user-provider-unresolvable");
  const provider = findProvider(credential.providerId);
  if (!provider) return PRYZM_ROUTE("user-provider-unresolvable");
  const destination = provider.auth === "none" ? `${provider.label}, which runs on this machine — the prompt does not leave your computer` : `${provider.label}, using your own API key`;
  return {
    keyClass: "user-supplied",
    reason: "user-provider-active",
    providerId: provider.id,
    providerLabel: provider.label,
    privacyStatement: `This request goes straight from this browser to ${destination}. It does not pass through PRYZM, is not covered by your PRYZM quota, and is billed by ${provider.label}, not PRYZM.`,
    quotaApplies: false,
    billsToPryzm: false
  };
}
function routeAttributionLine(route) {
  if (route.keyClass === "user-supplied") {
    return `(answered with your own ${route.providerLabel} key — this did not use PRYZM's AI quota)`;
  }
  if (route.reason === "user-provider-unresolvable") {
    return "(answered with PRYZM's built-in AI — the provider you selected has no usable key stored, so nothing was sent to it)";
  }
  return "(answered with PRYZM's built-in AI)";
}
function routeProvenanceFields(route) {
  return Object.freeze({
    "ai.key.class": route.keyClass,
    "ai.key.provider": route.providerId ?? "pryzm",
    "ai.route.reason": route.reason,
    "ai.quota.applies": route.quotaApplies,
    "ai.spend.bills_to_pryzm": route.billsToPryzm
  });
}

const IMAGE_NOUN = "(?:images?|photos?|photographs?|pictures?|pics?|snapshots?|screenshots?|renders?|renderings?|attachments?|jpe?g|png|heic|webp)";
const DETERMINER = "(?:(?:the|this|that|these|those|my|a|an|attached|uploaded|given|provided|supplied|reference|referenced|above|following|shown|same|first|second)\\s+){0,3}";
const REFERRING = "(?:as\\s+(?:per|in|shown\\s+in|seen\\s+in|on)|per|from|like|matching|matched|match|based\\s+on|copied\\s+from|copying|copy|replicating|replicate|following|according\\s+to|same\\s+as|similar\\s+to|resembling|in|of|using|use|with)";
const IMAGE_REFERENCE_RE = new RegExp(
  `\\b(?:${REFERRING}\\s+${DETERMINER}${IMAGE_NOUN}|(?:the\\s+|this\\s+|that\\s+|my\\s+)?(?:attached|uploaded|enclosed)\\s+${DETERMINER}${IMAGE_NOUN}|(?:this|that)\\s+${IMAGE_NOUN})\\b`,
  "i"
);
const IMAGE_NEGATION_RE = new RegExp(
  `\\b(?:without|no|not|ignore|ignoring|skip|skipping|forget|disregard|drop)\\s+(?:${REFERRING}\\s+)?(?:any\\s+)?${DETERMINER}${IMAGE_NOUN}\\b`,
  "i"
);
const NOT_REFERENCED = { referenced: false, phrase: null, negated: false };
function readImageReference(text) {
  if (typeof text !== "string" || text.length === 0) return NOT_REFERENCED;
  if (IMAGE_NEGATION_RE.test(text)) {
    return { referenced: false, phrase: null, negated: true };
  }
  const m = IMAGE_REFERENCE_RE.exec(text);
  if (m === null) return NOT_REFERENCED;
  return { referenced: true, phrase: m[0].trim(), negated: false };
}
function missingImageRefusal(phrase) {
  const quoted = phrase === null ? "an image" : `"${phrase}"`;
  return `You asked for the façade ${quoted}, and no image is attached to this message — so I have nothing to read a façade off, and I will not build a plain block and let it look like I used a photo. Attach one with the 📎 button beside the input, drag it onto this panel, or paste it with Ctrl+V, then send the same sentence again. JPEG, PNG, WebP, AVIF and HEIC are all read directly — a phone photo needs no conversion. If you did not mean a photograph, send the same sentence with "ignore the image" and I will build from your words alone.`;
}

export { AIElementFactory, AIIntentType, AIResponseParser, AiBus, AiPlane, AiResponseCacheFetchAdapter, BYOM_ACTIVE_KEY, BYOM_PROVIDERS, BYOM_STORAGE_PREFIX, ByomProviderError, ByomSecretLeakError, ByomVault, ByomVaultSet, CONFIDENCE_THRESHOLDS, DEFAULT_DESIGN_PARAMS, DEFAULT_DOOR_HEIGHT_M, DEFAULT_DOOR_WIDTH_M, DEFAULT_WALL_HEIGHT_M, DEFAULT_WALL_THICKNESS_M, DoorGapInpainter, ENTRANCE_DOOR_HEIGHT_M, ENTRANCE_DOOR_WIDTH_M, FloorPlanAIFactory, FloorPlanBatchExecutor, FloorPlanCommandBatcher, GENERATE_3_OPTIONS_COST_USD_ESTIMATE, GENERATE_3_OPTIONS_HARD_CEILING_USD, GENERATE_3_OPTIONS_MAX_TOKENS, GENERATE_3_OPTIONS_MODEL, GENERATE_3_OPTIONS_SYSTEM_PROMPT, GenerativeDesignAdvisor, HABITABILITY_COVERAGE, LIGHTING_ARCHETYPES, MIN_WALL_LENGTH_M$2 as MIN_WALL_LENGTH_M, MockAiResponseCache, MockVoiceTranscriber, OPTION_STYLES, OPTION_STYLE_LABELS, PER_OPTION_BUDGET_USD, PLAN_CRITIQUE_COST_USD_ESTIMATE, PLAN_CRITIQUE_MAX_ITEMS, PLAN_CRITIQUE_MAX_TOKENS, PLAN_CRITIQUE_MODEL, PLAN_CRITIQUE_SYSTEM_PROMPT, SPAN_ON_RING_M, StairComplianceReporter, WallCandidateScorer, WorkflowRegistry, _resetVoiceCommandLoaderForTesting, aiApprovalStore, allChatCapabilities, allCornersInside, allocateProgramToStoreys, applySemanticIntent, archetypeFor, archetypeForCeiling, archetypeForLighting, assertDescriptorIsSafe, assertNoSecret, buildBody, buildCeilingCommands, buildCritiquePrompt, buildFurnishCommands, buildHeaders, buildLayoutCommands, buildLayoutPlan, buildLightingCommands, buildOptionPrompt, buildPlannerFacts, buildPlannerPrompt, buildPlannerVocabulary, buildReportMetadata, buildRoomScopedLayoutPayload, buildUrl, buildWallExportJSON, byomConnectSrcOrigins, capabilityFieldShapes, ceilingForRoom, checkShellContainment, checkWindowCornerOverflow, clampDoorToWallSpan, clampOpeningToWall, clampPartitionsInsideShell, computeBuildingDaylight, computeBuildingElevationMarks, computeInwardContainmentOffset, computeRoomDaylight, computeRoomInteriorElevationMarks, computeStairWorldFootprint, coverageFor, createByomRelay, createGenerate3OptionsImpl, createPlanCritiqueImpl, defaultSunSamples, deriveProjectNorthFrame, describeProviderError, descriptiveReportReason, designParamsToEngineTuning, designParamsToScoringWeights, detectGeometricDoorGaps, detectLineSegmentsFromBase64, downloadDiagnosticJSON, downloadMaskAsPng, downloadWallJSON, enhanceMaskForFloorPlan, findCollinearEndpoints, findLevel, findProvider, formatSegmentsForPrompt, formatViolationLine, formatViolationReport, furnishRoom, furnishRoomCompound, generate3OptionsDescriptor, generateHouseLayout, generateHouseLayoutOptions, generativeAdvisor, getAiHost, getVoiceCommand, groupByClass, groupByRoom, hashWorkflowRequest, isAiHostLoaded, isDoorWithinWallSpan, kitchenTrianglePoints, layoutGenerator, lengthToMeters, lightRoom, loadTranscriber, looksLikeSecret, maskCredential, measureEffectiveMetersPerPixel, missingImageRefusal, nonImperativeReason, normaliseKitchenLayout, normaliseWardrobeLayout, noteResolution, parseCritiqueItems, parseOption, parseOptionCommands, parsePlanIntent, parseResponse, parseWallTypeIntent, passesLegality, planBuildingUnits, planCritiqueDescriptor, planDocumentationSet, planKitchen, planUtterance, planWardrobe, projectNorthWeld, projectNorthWeldBoundary, projectNorthWeldSet, readImageReference, rectifyShellRing, redactSecrets, removeRedAnnotations, removeTextBlobsCCL, repairAndParseJSON, reserveStairCore, reserveStairCoreShaped, resetPlannerShapeCache, resolveAiRoute, resolveChatCapability, resolveCompoundUtterance, resolveEntranceDoor, resolveLightingBasis, resolveNaturalLanguage, resolveTotalRisers, resolveUtterance, resolveUtteranceIntent, roofBaseElevationM, roofBaseOffsetM, roomColour, roomCropRegion, roomRingEdges, routeAttributionLine, routeProvenanceFields, solveStairContainmentWorld, splitPlanClauses, splitRisersForShape, structuredCountryCount, summarise, sunDirection, toValidationInput, unitLetter, unitTypeForBedrooms, validateAndFormatLayout, validateApartmentLayout, validateFurnishedRoom, validatePlannerOutput, voiceCommandDescriptor, wallExtentForLevel, wallVerticalExtents, weldPartitionsToShell, withWorkflowSpan, withWorkflowSpanSync, worldModelAdapter };
