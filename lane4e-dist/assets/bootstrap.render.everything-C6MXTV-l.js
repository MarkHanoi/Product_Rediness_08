import { M as MaterialPool, b as bindStore } from './dispatcher-wbP0dOm1.js';
import { F as FrameScheduler } from './LODManager-DHqndFcX.js';
import { aG as withSpanSync, G as withSpan } from './ElementStore-CQe7ZDFd.js';
import { WebGLRenderer } from './three.module-zvZFyv9V.js';
import { ao as Scene, o as PerspectiveCamera, ax as AmbientLight, au as DirectionalLight, a as Vector2, M as Mesh, V as Vector3, i as MathUtils, B as BufferGeometry, j as BufferAttribute, b as Box3, e as Sphere, cy as MeshStandardMaterial, D as DoubleSide, C as Color, G as Group, aI as Material, b0 as MeshBasicMaterial } from './three.core-Bv4ks8y-.js';
import { bootstrapWithEverything } from './bootstrap.everything-C8iEhoAS.js';
import { D as DescriptorInvariantError } from './assertValidDescriptor-tuQbjkHa.js';
import { a as asMaterialKey, e as earcut } from './triangulatePolygon-D2k7Jml-.js';
import { m as materialHex, p as polygonSignedAreaOrdinates } from './SteelProfileLibrary-NgbfwhrM.js';
import './trace-api-BIfvUk_c.js';
import './attachStores-BMAC7-uX.js';
import './decode-CN54oYFr.js';
import './DoorTypeChange-C0A5VweF.js';
import './WindowTypeChange-BhhzXbXs.js';
import './CreatePlumbingFixtureCommand-DUwQtpaf.js';

const NO_JOINS = Object.freeze({});

function buildMiterPrism(worldStart, worldEnd, centerlineStart, centerlineEnd, halfT, height, baseOffset, startMN, endMN) {
  const dx = worldEnd.x - worldStart.x;
  const dz = worldEnd.z - worldStart.z;
  const dlen = Math.sqrt(dx * dx + dz * dz) || 1;
  const wallDirX = dx / dlen;
  const wallDirZ = dz / dlen;
  const outwardX = -wallDirZ;
  const outwardZ = wallDirX;
  const Sx = worldStart.x, Sz = worldStart.z;
  const Ex = worldEnd.x, Ez = worldEnd.z;
  const yBot = worldStart.y + baseOffset;
  const yTop = worldStart.y + baseOffset + height;
  const startBase = (sign, y) => [
    Sx + outwardX * sign * halfT,
    y,
    Sz + outwardZ * sign * halfT
  ];
  const endBase = (sign, y) => [
    Ex + outwardX * sign * halfT,
    y,
    Ez + outwardZ * sign * halfT
  ];
  const project = (base, miterOriginX, miterOriginZ, mn, dirX, dirZ) => {
    if (!mn) return base;
    const mnDotDir = mn.nx * dirX + mn.nz * dirZ;
    if (Math.abs(mnDotDir) < 1e-9) return base;
    const dxp = miterOriginX - base[0];
    const dzp = miterOriginZ - base[2];
    const t = (mn.nx * dxp + mn.nz * dzp) / mnDotDir;
    return [base[0] + t * dirX, base[1], base[2] + t * dirZ];
  };
  const sOB = project(startBase(1, yBot), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sOT = project(startBase(1, yTop), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sIB = project(startBase(-1, yBot), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sIT = project(startBase(-1, yTop), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const eOB = project(endBase(1, yBot), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eOT = project(endBase(1, yTop), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eIB = project(endBase(-1, yBot), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eIT = project(endBase(-1, yTop), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const pos = [];
  const nrm = [];
  function tri(a, b, c, nx, ny, nz) {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  function quad(a, b, c, d, nx, ny, nz) {
    tri(a, b, c, nx, ny, nz);
    tri(a, c, d, nx, ny, nz);
  }
  quad(sOB, eOB, eOT, sOT, outwardX, 0, outwardZ);
  quad(sIB, sIT, eIT, eIB, -outwardX, 0, -outwardZ);
  quad(sOT, eOT, eIT, sIT, 0, 1, 0);
  quad(sIB, eIB, eOB, sOB, 0, -1, 0);
  quad(sOB, sOT, sIT, sIB, -wallDirX, 0, -wallDirZ);
  quad(eOB, eIB, eIT, eOT, wallDirX, 0, wallDirZ);
  return { positions: pos, normals: nrm };
}
function miterAngleToNormal(wallDirX, wallDirZ, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const nx = wallDirX * c - wallDirZ * s;
  const nz = wallDirX * s + wallDirZ * c;
  const len = Math.sqrt(nx * nx + nz * nz) || 1;
  return { nx: nx / len, nz: nz / len };
}

function resolveMiters(wallDirX, wallDirZ, joinData) {
  const start = joinData.start && Math.abs(joinData.start.miterAngleRad) > 1e-9 ? miterAngleToNormal(wallDirX, wallDirZ, joinData.start.miterAngleRad) : null;
  const end = joinData.end && Math.abs(joinData.end.miterAngleRad) > 1e-9 ? miterAngleToNormal(-wallDirX, -wallDirZ, joinData.end.miterAngleRad) : null;
  return { start, end };
}

function projectCapVertex(vx, vz, originX, originZ, tanX, tanZ, mn) {
  const mnDotTan = mn.nx * tanX + mn.nz * tanZ;
  if (Math.abs(mnDotTan) < 1e-9) return [vx, vz];
  const t = (mn.nx * (originX - vx) + mn.nz * (originZ - vz)) / mnDotTan;
  return [vx + t * tanX, vz + t * tanZ];
}

function arcToPoints(p0, p1, p2, segments) {
  const out = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const oneMt = 1 - t;
    const a = oneMt * oneMt;
    const b = 2 * oneMt * t;
    const c = t * t;
    out[i] = {
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
      z: a * p0.z + b * p1.z + c * p2.z
    };
  }
  return out;
}

function computeStations(start, end, control, segments) {
  const pts = arcToPoints(start, control, end, segments);
  const n = pts.length;
  const stations = [];
  for (let i = 0; i < n; i++) {
    let tx, tz;
    if (i < n - 1) {
      tx = pts[i + 1].x - pts[i].x;
      tz = pts[i + 1].z - pts[i].z;
    } else {
      tx = pts[i].x - pts[i - 1].x;
      tz = pts[i].z - pts[i - 1].z;
    }
    const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tLen;
    tz /= tLen;
    stations.push({
      cx: pts[i].x - start.x,
      cz: pts[i].z - start.z,
      nx: -tz,
      nz: tx
    });
  }
  return stations;
}
function buildCurvedLayerGeometry(layerOffset, stations, wallHeight, wallBaseOffset, halfT, startMN, endMN, startCapTan, endCapTan) {
  const n = stations.length;
  const yBot = wallBaseOffset;
  const yTop = wallBaseOffset + wallHeight;
  const layerStations = stations.map((s) => ({
    cx: s.cx + s.nx * layerOffset,
    cz: s.cz + s.nz * layerOffset,
    nx: s.nx,
    nz: s.nz
  }));
  const positions = [];
  const normals = [];
  function pushTri(a, b, c) {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    normals.push(a[3], a[4], a[5], b[3], b[4], b[5], c[3], c[4], c[5]);
  }
  const outerVBot = (s) => [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  const outerVTop = (s) => [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, s.nx, 0, s.nz];
  const innerVBot = (s) => [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  const innerVTop = (s) => [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, -s.nx, 0, -s.nz];
  const topOuter = (s) => [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, 0, 1, 0];
  const topInner = (s) => [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, 0, 1, 0];
  const botOuter = (s) => [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, 0, -1, 0];
  const botInner = (s) => [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, 0, -1, 0];
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(outerVBot(A), outerVTop(B), outerVTop(A));
    pushTri(outerVBot(A), outerVBot(B), outerVTop(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(innerVBot(A), innerVTop(A), innerVTop(B));
    pushTri(innerVBot(A), innerVTop(B), innerVBot(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(topInner(A), topOuter(A), topOuter(B));
    pushTri(topInner(A), topOuter(B), topInner(B));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = layerStations[i];
    const B = layerStations[i + 1];
    pushTri(botInner(A), botOuter(B), botOuter(A));
    pushTri(botInner(A), botInner(B), botOuter(B));
  }
  {
    const s = layerStations[0];
    let tanX, tanZ;
    if (startCapTan) {
      tanX = startCapTan.x;
      tanZ = startCapTan.z;
    } else {
      const dtx = layerStations[1].cx - s.cx;
      const dtz = layerStations[1].cz - s.cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl;
      tanZ = dtz / dl;
    }
    const cnx = -tanX, cnz = -tanZ;
    let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
    let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
    if (startMN) {
      [oX, oZ] = projectCapVertex(oX, oZ, 0, 0, tanX, tanZ, startMN);
      [iX, iZ] = projectCapVertex(iX, iZ, 0, 0, tanX, tanZ, startMN);
    }
    const oBo = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, oTo, iTo);
    pushTri(oBo, iTo, iBo);
  }
  {
    const s = layerStations[n - 1];
    let tanX, tanZ;
    if (endCapTan) {
      tanX = endCapTan.x;
      tanZ = endCapTan.z;
    } else {
      const dtx = s.cx - layerStations[n - 2].cx;
      const dtz = s.cz - layerStations[n - 2].cz;
      const dl = Math.sqrt(dtx * dtx + dtz * dtz) || 1;
      tanX = dtx / dl;
      tanZ = dtz / dl;
    }
    const cnx = tanX, cnz = tanZ;
    let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
    let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
    const endOriginX = stations[n - 1].cx;
    const endOriginZ = stations[n - 1].cz;
    if (endMN) {
      [oX, oZ] = projectCapVertex(oX, oZ, endOriginX, endOriginZ, tanX, tanZ, endMN);
      [iX, iZ] = projectCapVertex(iX, iZ, endOriginX, endOriginZ, tanX, tanZ, endMN);
    }
    const oBo = [oX, yBot, oZ, cnx, 0, cnz];
    const oTo = [oX, yTop, oZ, cnx, 0, cnz];
    const iBo = [iX, yBot, iZ, cnx, 0, cnz];
    const iTo = [iX, yTop, iZ, cnx, 0, cnz];
    pushTri(oBo, iTo, oTo);
    pushTri(oBo, iBo, iTo);
  }
  return { positions, normals };
}

function addUniqueBreak(values, value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  if (!values.some((v) => Math.abs(v - rounded) < 1e-6)) values.push(rounded);
}
function normaliseOpeningRects(openings, wallLength, wallHeight) {
  const rects = [];
  for (const op of openings) {
    const left = Math.max(0, op.offset);
    const right = Math.min(wallLength, op.offset + op.width);
    const bottom = Math.max(0, op.sillHeight ?? 0);
    const top = Math.min(wallHeight, (op.sillHeight ?? 0) + op.height);
    if (right - left > 1e-3 && top - bottom > 1e-3) {
      rects.push({ left, right, bottom, top });
    }
  }
  return rects;
}
function buildContinuousLayerGeometry(rects, wallLength, wallHeight, wallBaseOffset, baseStart, directionX, directionZ, outwardX, outwardZ, layerCenter, layerThickness, startMN, endMN) {
  const xs = [0, wallLength];
  const ys = [0, wallHeight];
  for (const rect of rects) {
    addUniqueBreak(xs, rect.left);
    addUniqueBreak(xs, rect.right);
    addUniqueBreak(ys, rect.bottom);
    addUniqueBreak(ys, rect.top);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const xCount = xs.length - 1;
  const yCount = ys.length - 1;
  const solid = [];
  for (let i = 0; i < xCount; i++) {
    solid[i] = [];
    for (let j = 0; j < yCount; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      solid[i][j] = !rects.some(
        (rect) => cx > rect.left + 1e-4 && cx < rect.right - 1e-4 && cy > rect.bottom + 1e-4 && cy < rect.top - 1e-4
      );
    }
  }
  const positions = [];
  const normals = [];
  const half = layerThickness / 2;
  const back = layerCenter - half;
  const front = layerCenter + half;
  const startMnDotDir = startMN ? startMN.nx * directionX + startMN.nz * directionZ : 0;
  const startMnDotOut = startMN ? startMN.nx * outwardX + startMN.nz * outwardZ : 0;
  const endMnDotDir = endMN ? endMN.nx * directionX + endMN.nz * directionZ : 0;
  const endMnDotOut = endMN ? endMN.nx * outwardX + endMN.nz * outwardZ : 0;
  const resolve = (x, y, z) => {
    let effectiveX = x;
    if (startMN && x < 1e-5 && Math.abs(startMnDotDir) > 1e-4) {
      effectiveX = -(startMnDotOut * z) / startMnDotDir;
    } else if (endMN && Math.abs(x - wallLength) < 1e-5 && Math.abs(endMnDotDir) > 1e-4) {
      effectiveX = wallLength - endMnDotOut * z / endMnDotDir;
    }
    const wx = baseStart.x + directionX * effectiveX + outwardX * z;
    const wy = baseStart.y + wallBaseOffset + y;
    const wz = baseStart.z + directionZ * effectiveX + outwardZ * z;
    return [wx, wy, wz];
  };
  const isSolid = (i, j) => i >= 0 && i < xCount && j >= 0 && j < yCount && solid[i][j];
  function pushQuad(a, b, c, d, nx, ny, nz) {
    const A = resolve(a[0], a[1], a[2]);
    const B = resolve(b[0], b[1], b[2]);
    const C = resolve(c[0], c[1], c[2]);
    const D = resolve(d[0], d[1], d[2]);
    positions.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    positions.push(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, nz);
  }
  for (let i = 0; i < xCount; i++) {
    for (let j = 0; j < yCount; j++) {
      if (!solid[i][j]) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const y0 = ys[j];
      const y1 = ys[j + 1];
      pushQuad(
        [x0, y0, front],
        [x1, y0, front],
        [x1, y1, front],
        [x0, y1, front],
        outwardX,
        0,
        outwardZ
      );
      pushQuad(
        [x1, y0, back],
        [x0, y0, back],
        [x0, y1, back],
        [x1, y1, back],
        -outwardX,
        0,
        -outwardZ
      );
      if (!isSolid(i - 1, j)) {
        pushQuad(
          [x0, y0, back],
          [x0, y0, front],
          [x0, y1, front],
          [x0, y1, back],
          -directionX,
          0,
          -directionZ
        );
      }
      if (!isSolid(i + 1, j)) {
        pushQuad(
          [x1, y0, front],
          [x1, y0, back],
          [x1, y1, back],
          [x1, y1, front],
          directionX,
          0,
          directionZ
        );
      }
      if (!isSolid(i, j - 1)) {
        pushQuad(
          [x1, y0, front],
          [x0, y0, front],
          [x0, y0, back],
          [x1, y0, back],
          0,
          -1,
          0
        );
      }
      if (!isSolid(i, j + 1)) {
        pushQuad(
          [x0, y1, back],
          [x0, y1, front],
          [x1, y1, front],
          [x1, y1, back],
          0,
          1,
          0
        );
      }
    }
  }
  return { positions, normals };
}
function buildLayeredOpeningsLayers(wall, baseStart, directionX, directionZ, outwardX, outwardZ, wallLength, startMN, endMN) {
  const layers = wall.layers ?? [];
  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);
  const rects = normaliseOpeningRects(wall.openings, wallLength, wall.height);
  let cursor = -totalThickness / 2;
  const out = [];
  for (const layer of layers) {
    const center = cursor + layer.thickness / 2;
    cursor += layer.thickness;
    const geom = buildContinuousLayerGeometry(
      rects,
      wallLength,
      wall.height,
      wall.baseOffset,
      baseStart,
      directionX,
      directionZ,
      outwardX,
      outwardZ,
      center,
      layer.thickness,
      startMN,
      endMN
    );
    out.push({ layer, layerCenter: center, geometry: geom });
  }
  return out;
}

const NO_MATERIAL_COLOR = "#d4c5b0";
const UNRESOLVED_PREFIX$2 = "unresolved:";
function resolveMaterialColorSlot(input, familyDefault) {
  const override = input.materialColor;
  if (override && override.length > 0) return override.toLowerCase();
  const id = input.materialId;
  if (id && id.length > 0 && id !== "_") {
    const hex = materialHex(id);
    if (hex) return hex.toLowerCase();
    return `${UNRESOLVED_PREFIX$2}${id}`;
  }
  return familyDefault;
}
function resolveColorSlot(input) {
  return resolveMaterialColorSlot(input, NO_MATERIAL_COLOR);
}
function composeMaterialKey(input) {
  const sys = input.systemTypeId ?? "_";
  const mat = input.materialId ?? "_";
  const col = resolveColorSlot(input);
  const lay = input.layerName ?? "_";
  return asMaterialKey(`wall|${sys}|${mat}|${col}|${lay}`);
}

const WALL_HASH_SCHEMA_VERSION = 1;
function f$1(n) {
  if (n === null || n === void 0 || !Number.isFinite(n)) return "_";
  return n.toFixed(4);
}
function hashOpening(o) {
  const t = o.type === "door" ? `d${o.doorType ?? ""}` : `w${o.windowType ?? ""}`;
  return `${o.id}:${t}:${f$1(o.offset)}:${f$1(o.width)}:${f$1(o.height)}:${f$1(o.sillHeight)}`;
}
function hashJoin(jd) {
  const sm = jd.start ? `${f$1(jd.start.miterAngleRad)}@${jd.start.neighbourId}` : "sq";
  const em = jd.end ? `${f$1(jd.end.miterAngleRad)}@${jd.end.neighbourId}` : "sq";
  return `${sm}|${em}`;
}
function composeWallGeometryHash(wall, joinData, worldY) {
  const a = wall.baseLine[0];
  const b = wall.baseLine[1];
  const base = `${f$1(a.x)},${f$1(a.y)},${f$1(a.z)}|${f$1(b.x)},${f$1(b.y)},${f$1(b.z)}`;
  const dims = `${f$1(wall.height)}|${f$1(wall.thickness)}|${f$1(wall.baseOffset)}`;
  const curveStr = wall.curve ? `c:${f$1(wall.curve.control.x)},${f$1(wall.curve.control.y)},${f$1(wall.curve.control.z)}:${wall.curve.segments}` : "straight";
  const sortedOpenings = [...wall.openings].sort(
    (x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0
  );
  const openingsStr = sortedOpenings.length === 0 ? "no-op" : sortedOpenings.map(hashOpening).join(";");
  const sys = `${wall.systemTypeId ?? "_"}|${wall.materialId ?? "_"}|${wall.materialColor ?? "_"}`;
  const layersStr = wall.layers && wall.layers.length > 0 ? wall.layers.map((l) => `${f$1(l.thickness)}:${l.materialId ?? "_"}:${l.function}`).join(",") : "no-layers";
  const join = hashJoin(joinData);
  const worldYStr = f$1(worldY);
  return [
    `v${WALL_HASH_SCHEMA_VERSION}`,
    base,
    dims,
    wall.levelId,
    curveStr,
    openingsStr,
    sys,
    layersStr,
    join,
    worldYStr
  ].join("|");
}

function concatRaw(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const ranges = [];
  for (const { geometry, materialKey } of parts) {
    const startVertex = positions.length / 3;
    positions.push(...geometry.positions);
    normals.push(...geometry.normals);
    const vCount = geometry.positions.length / 3;
    if (geometry.uvs && geometry.uvs.length === vCount * 2) {
      uvs.push(...geometry.uvs);
    } else {
      for (let i = 0; i < vCount; i++) {
        uvs.push(geometry.positions[i * 3], geometry.positions[i * 3 + 2]);
      }
    }
    const triCount = vCount;
    ranges.push({
      start: startVertex,
      count: triCount,
      materialKey
    });
  }
  return { positions, normals, uvs, ranges };
}

function canonZero(v) {
  return v === 0 ? 0 : v;
}

function serializeDescriptor(raw, hash) {
  const vCount = raw.positions.length / 3;
  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vCount; i++) {
    const px = canonZero(raw.positions[i * 3]);
    const py = canonZero(raw.positions[i * 3 + 1]);
    const pz = canonZero(raw.positions[i * 3 + 2]);
    position[i * 3] = px;
    position[i * 3 + 1] = py;
    position[i * 3 + 2] = pz;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
    if (pz < minZ) minZ = pz;
    if (pz > maxZ) maxZ = pz;
    const nx = raw.normals[i * 3];
    const ny = raw.normals[i * 3 + 1];
    const nz = raw.normals[i * 3 + 2];
    const lenSq = nx * nx + ny * ny + nz * nz;
    const inv = lenSq > 0 ? 1 / Math.sqrt(lenSq) : 0;
    normal[i * 3] = canonZero(nx * inv);
    normal[i * 3 + 1] = canonZero(ny * inv);
    normal[i * 3 + 2] = canonZero(nz * inv);
    uv[i * 2] = canonZero(raw.uvs[i * 2]);
    uv[i * 2 + 1] = canonZero(raw.uvs[i * 2 + 1]);
  }
  if (vCount === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }
  const indexLen = vCount;
  const useUint32 = vCount >= 65536;
  const index = useUint32 ? new Uint32Array(indexLen) : new Uint16Array(indexLen);
  for (let i = 0; i < indexLen; i++) index[i] = i;
  const materialKeys = [];
  const groups = [];
  for (const r of raw.ranges) {
    let materialIndex = materialKeys.indexOf(r.materialKey);
    if (materialIndex === -1) {
      materialIndex = materialKeys.length;
      materialKeys.push(r.materialKey);
    }
    groups.push({ start: r.start, count: r.count, materialIndex });
  }
  return {
    position,
    normal,
    uv,
    index,
    bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    groups,
    materialKeys,
    hash
  };
}

function implicitLayers(wall) {
  return [
    {
      name: "wall",
      function: "structure",
      thickness: wall.thickness,
      materialId: wall.materialId,
      materialColor: wall.materialColor
    }
  ];
}
function planarLength(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}
const produceWall = (dto, joinData, worldY) => {
  const [start, end] = dto.baseLine;
  const wallLength = planarLength(start, end);
  if (wallLength < 1e-6) {
    throw new DescriptorInvariantError(
      `wall.baseLine has zero planar length (${wallLength.toExponential(3)} m); refusing to produce a degenerate descriptor`
    );
  }
  const dirX = (end.x - start.x) / wallLength;
  const dirZ = (end.z - start.z) / wallLength;
  const outwardX = -dirZ;
  const outwardZ = dirX;
  const baseStart = { x: start.x, y: worldY, z: start.z };
  const baseEnd = { x: end.x, z: end.z };
  const miters = resolveMiters(dirX, dirZ, joinData);
  const layers = dto.layers && dto.layers.length > 0 ? dto.layers : implicitLayers(dto);
  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);
  const isCurved = !!dto.curve;
  const hasOpenings = dto.openings.length > 0;
  const parts = [];
  if (isCurved) {
    const stations = computeStations(
      start,
      end,
      dto.curve.control,
      dto.curve.segments
    );
    const startCapTan = stations.length >= 2 ? (() => {
      const a = stations[0];
      const b = stations[1];
      const tx = b.cx - a.cx;
      const tz = b.cz - a.cz;
      const tl = Math.sqrt(tx * tx + tz * tz) || 1;
      return { x: tx / tl, z: tz / tl };
    })() : null;
    const endCapTan = stations.length >= 2 ? (() => {
      const a = stations[stations.length - 2];
      const b = stations[stations.length - 1];
      const tx = b.cx - a.cx;
      const tz = b.cz - a.cz;
      const tl = Math.sqrt(tx * tx + tz * tz) || 1;
      return { x: tx / tl, z: tz / tl };
    })() : null;
    let cursor = -totalThickness / 2;
    for (const layer of layers) {
      const center = cursor + layer.thickness / 2;
      cursor += layer.thickness;
      const local = buildCurvedLayerGeometry(
        center,
        stations,
        dto.height,
        dto.baseOffset,
        layer.thickness / 2,
        miters.start,
        miters.end,
        startCapTan,
        endCapTan
      );
      const shifted = shiftPositions(local.positions, baseStart.x, worldY, baseStart.z);
      parts.push({
        geometry: { positions: shifted, normals: local.normals },
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name
        })
      });
    }
  } else if (hasOpenings) {
    const dtoForLayered = dto.layers && dto.layers.length > 0 ? dto : { ...dto, layers: implicitLayers(dto) };
    const layered = buildLayeredOpeningsLayers(
      dtoForLayered,
      baseStart,
      dirX,
      dirZ,
      outwardX,
      outwardZ,
      wallLength,
      miters.start,
      miters.end
    );
    for (const { layer, geometry } of layered) {
      parts.push({
        geometry,
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name
        })
      });
    }
  } else {
    let cursor = -totalThickness / 2;
    for (const layer of layers) {
      const center = cursor + layer.thickness / 2;
      cursor += layer.thickness;
      const layerStart = {
        x: baseStart.x + outwardX * center,
        y: baseStart.y,
        z: baseStart.z + outwardZ * center
      };
      const layerEnd = {
        x: baseEnd.x + outwardX * center,
        z: baseEnd.z + outwardZ * center
      };
      const raw = buildMiterPrism(
        layerStart,
        layerEnd,
        baseStart,
        baseEnd,
        layer.thickness / 2,
        dto.height,
        dto.baseOffset,
        miters.start,
        miters.end
      );
      parts.push({
        geometry: raw,
        materialKey: composeMaterialKey({
          systemTypeId: dto.systemTypeId,
          materialId: layer.materialId ?? dto.materialId,
          materialColor: layer.materialColor ?? dto.materialColor,
          layerName: layer.name
        })
      });
    }
  }
  const concatenated = concatRaw(parts);
  const hash = composeWallGeometryHash(dto, joinData, worldY);
  return serializeDescriptor(concatenated, hash);
};
function shiftPositions(positions, dx, dy, dz) {
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] + dx;
    out[i + 1] = positions[i + 1] + dy;
    out[i + 2] = positions[i + 2] + dz;
  }
  return out;
}

const FRAME_FALLBACK_COLOR$1 = "#8b7058";
const LEAF_FALLBACK_COLOR = "#c2a684";
function composeDoorMaterialKey(systemTypeId, materialId, color, slot) {
  return asMaterialKey(`door|${systemTypeId}|${materialId}|${color}|${slot}`);
}
function localToWorld$1(lx, ly, lz, p, liftY) {
  return [
    p.origin.x + p.axis.x * lx + p.normal.x * ly,
    p.origin.y + lz + liftY,
    p.origin.z + p.axis.z * lx + p.normal.z * ly
  ];
}
function localNormalToWorld$1(lnx, lny, lnz, p) {
  return [
    p.axis.x * lnx + p.normal.x * lny,
    lnz,
    p.axis.z * lnx + p.normal.z * lny
  ];
}
function appendBox$1(buf, cx, cy, cz, sx, sy, sz, p, liftY) {
  const indexStart = buf.indices.length;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    // -X
    { n: [-1, 0, 0], v: [
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy - hy, cz + hz]
    ] },
    // +X
    { n: [1, 0, 0], v: [
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz]
    ] },
    // -Y
    { n: [0, -1, 0], v: [
      [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz]
    ] },
    // +Y
    { n: [0, 1, 0], v: [
      [cx - hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz]
    ] },
    // -Z (bottom)
    { n: [0, 0, -1], v: [
      [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz]
    ] },
    // +Z (top)
    { n: [0, 0, 1], v: [
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz]
    ] }
  ];
  for (const face of faces) {
    const baseV = buf.positions.length / 3;
    const [wnx, wny, wnz] = localNormalToWorld$1(face.n[0], face.n[1], face.n[2], p);
    const len = Math.hypot(wnx, wny, wnz) || 1;
    const nx = wnx / len, ny = wny / len, nz = wnz / len;
    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = face.v[i];
      const [wx, wy, wz] = localToWorld$1(lx, ly, lz, p, liftY);
      buf.positions.push(wx, wy, wz);
      buf.normals.push(nx, ny, nz);
    }
    buf.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    buf.indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
  }
  return { start: indexStart, count: buf.indices.length - indexStart };
}
function computeBounds$1(positions) {
  if (positions.length < 3) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  let minX = positions[0], minY = positions[1], minZ = positions[2];
  let maxX = minX, maxY = minY, maxZ = minZ;
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}
function produceDoor(door, placement) {
  const buf = { positions: [], normals: [], uvs: [], indices: [] };
  const groups = [];
  const systemTypeId = "";
  const frameMaterialId = door.frameMaterialId ?? "";
  const leafMaterialId = door.leafMaterialId ?? "";
  const frameColor = resolveMaterialColorSlot(
    { materialId: door.frameMaterialId, materialColor: door.frameColor },
    FRAME_FALLBACK_COLOR$1
  );
  const leafColor = resolveMaterialColorSlot(
    { materialId: door.leafMaterialId, materialColor: door.leafColor },
    LEAF_FALLBACK_COLOR
  );
  const materialKeys = [
    composeDoorMaterialKey(systemTypeId, frameMaterialId, frameColor, "frame"),
    composeDoorMaterialKey(systemTypeId, leafMaterialId, leafColor, "leaf")
  ];
  const w = door.width;
  const h = door.height;
  const fW = door.frameWidth;
  const frameDepth = Math.max(0.04, placement.wallThickness * 0.8);
  const leafDepth = Math.max(0.03, frameDepth * 0.5);
  const liftY = door.sillHeight;
  const frameStart = buf.indices.length;
  appendBox$1(buf, -w / 2 + fW / 2, 0, h / 2, fW, frameDepth, h, placement, liftY);
  appendBox$1(buf, w / 2 - fW / 2, 0, h / 2, fW, frameDepth, h, placement, liftY);
  const headW = Math.max(0, w - 2 * fW);
  if (headW > 0) {
    appendBox$1(buf, 0, 0, h - fW / 2, headW, frameDepth, fW, placement, liftY);
  } else {
    appendBox$1(buf, 0, 0, h - fW / 2, w, frameDepth, fW, placement, liftY);
  }
  groups.push({
    start: frameStart,
    count: buf.indices.length - frameStart,
    materialIndex: 0
  });
  const leafStart = buf.indices.length;
  const leafW = Math.max(0.05, w - 2 * fW);
  const leafH = Math.max(0.05, h - fW);
  appendBox$1(buf, 0, 0, leafH / 2, leafW, leafDepth, leafH, placement, liftY);
  groups.push({
    start: leafStart,
    count: buf.indices.length - leafStart,
    materialIndex: 1
  });
  const positionArr = new Float32Array(buf.positions);
  const normalArr = new Float32Array(buf.normals);
  const uvArr = new Float32Array(buf.uvs);
  const vertexCount = positionArr.length / 3;
  const indexArr = vertexCount < 65536 ? new Uint16Array(buf.indices) : new Uint32Array(buf.indices);
  return {
    position: positionArr,
    normal: normalArr,
    uv: uvArr,
    index: indexArr,
    bounds: computeBounds$1(buf.positions),
    groups,
    materialKeys,
    hash: composeDoorGeometryHash(door, placement)
  };
}
function composeDoorGeometryHash(door, placement) {
  const r = (n) => Math.round(n * 1e4) / 1e4;
  return [
    "door:v1",
    door.id,
    r(door.width),
    r(door.height),
    r(door.sillHeight),
    r(door.frameWidth),
    r(door.frameThickness),
    door.frameColor ?? FRAME_FALLBACK_COLOR$1,
    door.leafColor ?? LEAF_FALLBACK_COLOR,
    // ⭐ C100 §2.1 / S17 — the ids join the hash because the descriptor CARRIES the
    // material keys. Without them, changing a door's material while its colour
    // fields stay put would leave a cached descriptor — and its old keys — in place:
    // the record would name the new material and the mesh would keep the old one,
    // which is §COMMITTED-IS-NOT-REACHABLE reintroduced through a cache.
    door.frameMaterialId ?? "",
    door.leafMaterialId ?? "",
    r(placement.origin.x),
    r(placement.origin.y),
    r(placement.origin.z),
    r(placement.axis.x),
    r(placement.axis.y),
    r(placement.axis.z),
    r(placement.normal.x),
    r(placement.normal.y),
    r(placement.normal.z),
    r(placement.wallThickness)
  ].join("|");
}

const FRAME_FALLBACK_COLOR = "#3a3a3a";
const GLASS_COLOR = "#a4c8e1";
function composeWindowMaterialKey(systemTypeId, materialId, color, slot) {
  return asMaterialKey(`window|${systemTypeId}|${materialId}|${color}|${slot}`);
}
function localToWorld(lx, ly, lz, p) {
  return [
    p.origin.x + p.axis.x * lx + p.normal.x * ly,
    p.origin.y + lz,
    p.origin.z + p.axis.z * lx + p.normal.z * ly
  ];
}
function localNormalToWorld(lnx, lny, lnz, p) {
  return [
    p.axis.x * lnx + p.normal.x * lny,
    lnz,
    p.axis.z * lnx + p.normal.z * lny
  ];
}
function appendBox(buf, cx, cy, cz, sx, sy, sz, p) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [-1, 0, 0], v: [[cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy - hy, cz + hz]] },
    { n: [1, 0, 0], v: [[cx + hx, cy + hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz]] },
    { n: [0, -1, 0], v: [[cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz]] },
    { n: [0, 1, 0], v: [[cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]] },
    { n: [0, 0, -1], v: [[cx - hx, cy + hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz]] },
    { n: [0, 0, 1], v: [[cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]] }
  ];
  for (const face of faces) {
    const baseV = buf.positions.length / 3;
    const [wnx, wny, wnz] = localNormalToWorld(face.n[0], face.n[1], face.n[2], p);
    const len = Math.hypot(wnx, wny, wnz) || 1;
    const nx = wnx / len, ny = wny / len, nz = wnz / len;
    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = face.v[i];
      const [wx, wy, wz] = localToWorld(lx, ly, lz, p);
      buf.positions.push(wx, wy, wz);
      buf.normals.push(nx, ny, nz);
    }
    buf.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    buf.indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
  }
}
function computeMullionsX(width, columns) {
  if (columns <= 1) return [];
  const left = -width / 2;
  const out = [];
  const col = width / columns;
  for (let i = 1; i < columns; i++) out.push(left + i * col);
  return out;
}
function computeMullionsZ(_height, sillToHead, rows) {
  if (rows <= 1) return [];
  const out = [];
  const r = sillToHead / rows;
  for (let i = 1; i < rows; i++) out.push(i * r);
  return out;
}
function computeBounds(positions) {
  if (positions.length < 3) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  let mnX = positions[0], mnY = positions[1], mnZ = positions[2];
  let mxX = mnX, mxY = mnY, mxZ = mnZ;
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < mnX) mnX = x;
    if (x > mxX) mxX = x;
    if (y < mnY) mnY = y;
    if (y > mxY) mxY = y;
    if (z < mnZ) mnZ = z;
    if (z > mxZ) mxZ = z;
  }
  return { min: { x: mnX, y: mnY, z: mnZ }, max: { x: mxX, y: mxY, z: mxZ } };
}
function produceWindow(win, placement) {
  const buf = { positions: [], normals: [], uvs: [], indices: [] };
  const groups = [];
  const systemTypeId = "";
  const frameMaterialId = win.frameMaterialId ?? "";
  const glassMaterialId = win.glassMaterialId ?? "";
  const frameColor = resolveMaterialColorSlot(
    { materialId: win.frameMaterialId, materialColor: win.frameColor },
    FRAME_FALLBACK_COLOR
  );
  const glassColor = resolveMaterialColorSlot(
    { materialId: win.glassMaterialId },
    GLASS_COLOR
  );
  const materialKeys = [
    composeWindowMaterialKey(systemTypeId, frameMaterialId, frameColor, "frame"),
    composeWindowMaterialKey(systemTypeId, glassMaterialId, glassColor, "glass")
  ];
  const w = win.width;
  const h = win.height;
  const fW = win.frameWidth;
  const frameDepth = Math.max(0.04, placement.wallThickness * 0.8);
  const grid = placement.grid ?? { columns: 1, rows: 1, mullionThickness: 0.04 };
  const mullionT = Math.max(0.01, grid.mullionThickness);
  const frameStart = buf.indices.length;
  appendBox(buf, -w / 2 + fW / 2, 0, h / 2, fW, frameDepth, h, placement);
  appendBox(buf, w / 2 - fW / 2, 0, h / 2, fW, frameDepth, h, placement);
  const innerW = Math.max(0.05, w - 2 * fW);
  appendBox(buf, 0, 0, h - fW / 2, innerW, frameDepth, fW, placement);
  appendBox(buf, 0, 0, fW / 2, innerW, frameDepth, fW, placement);
  const innerH = Math.max(0.05, h - 2 * fW);
  const mullionsX = computeMullionsX(innerW, grid.columns);
  for (const mx of mullionsX) {
    appendBox(buf, mx, 0, h / 2, mullionT, frameDepth * 0.9, innerH, placement);
  }
  const mullionsZ = computeMullionsZ(innerH, innerH, grid.rows);
  for (const mz of mullionsZ) {
    appendBox(buf, 0, 0, fW + mz, innerW, frameDepth * 0.9, mullionT, placement);
  }
  groups.push({ start: frameStart, count: buf.indices.length - frameStart, materialIndex: 0 });
  const glassStart = buf.indices.length;
  const glassDepth = Math.max(5e-3, frameDepth * 0.05);
  appendBox(buf, 0, 0, fW + innerH / 2, innerW, glassDepth, innerH, placement);
  groups.push({ start: glassStart, count: buf.indices.length - glassStart, materialIndex: 1 });
  const positionArr = new Float32Array(buf.positions);
  const normalArr = new Float32Array(buf.normals);
  const uvArr = new Float32Array(buf.uvs);
  const vertexCount = positionArr.length / 3;
  const indexArr = vertexCount < 65536 ? new Uint16Array(buf.indices) : new Uint32Array(buf.indices);
  return {
    position: positionArr,
    normal: normalArr,
    uv: uvArr,
    index: indexArr,
    bounds: computeBounds(buf.positions),
    groups,
    materialKeys,
    hash: composeWindowGeometryHash(win, placement)
  };
}
function composeWindowGeometryHash(win, placement) {
  const r = (n) => Math.round(n * 1e4) / 1e4;
  const grid = placement.grid ?? { columns: 1, rows: 1, mullionThickness: 0.04 };
  return [
    "window:v1",
    win.id,
    r(win.width),
    r(win.height),
    r(win.sillHeight),
    r(win.frameWidth),
    r(win.frameThickness),
    win.frameColor ?? FRAME_FALLBACK_COLOR,
    // ⭐ C100 §2.1 / S17 — the ids join the hash because the descriptor CARRIES the
    // material keys. Without them a cached descriptor would keep its old keys while
    // the record named a new material: §COMMITTED-IS-NOT-REACHABLE through a cache.
    win.frameMaterialId ?? "",
    win.glassMaterialId ?? "",
    grid.columns,
    grid.rows,
    r(grid.mullionThickness),
    r(placement.origin.x),
    r(placement.origin.y),
    r(placement.origin.z),
    r(placement.axis.x),
    r(placement.axis.y),
    r(placement.axis.z),
    r(placement.normal.x),
    r(placement.normal.y),
    r(placement.normal.z),
    r(placement.wallThickness)
  ].join("|");
}

const SLAB_HASH_SCHEMA_VERSION = 1;
function f(n) {
  if (n === null || n === void 0 || !Number.isFinite(n)) return "_";
  return n.toFixed(4);
}
function composeSlabGeometryHash(slab, worldY) {
  const boundary = slab.boundary.map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`).join(";");
  const holes = slab.holes.map(
    (loop) => loop.map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`).join(";")
  ).join("|");
  const dims = `${f(slab.thickness)}|${f(slab.baseOffset)}`;
  const sys = `${slab.systemTypeId ?? "_"}|${slab.materialId ?? "_"}|${slab.materialColor ?? "_"}`;
  return [
    `slab:v${SLAB_HASH_SCHEMA_VERSION}`,
    boundary,
    holes,
    dims,
    slab.levelId,
    sys,
    f(worldY)
  ].join("|");
}

const TOP_FALLBACK_COLOR = "#cfcfcf";
const BOTTOM_FALLBACK_COLOR = "#a8a8a8";
const SIDE_FALLBACK_COLOR = "#9a9a9a";
function composeSlabMaterialKey(systemTypeId, materialId, color, slot) {
  return asMaterialKey(`slab|${systemTypeId}|${materialId}|${color}|${slot}`);
}
function signedArea(loop) {
  return polygonSignedAreaOrdinates(loop.length, (i) => loop[i].x, (i) => loop[i].z);
}
function ensureCCW(loop) {
  return signedArea(loop) >= 0 ? [...loop] : [...loop].reverse();
}
function ensureCW(loop) {
  return signedArea(loop) <= 0 ? [...loop] : [...loop].reverse();
}
function triangulate(outer, holes) {
  const vertices = [...outer];
  const flat = [];
  for (const v of outer) flat.push(v.x, v.z);
  const holeIndices = [];
  for (const hole of holes) {
    holeIndices.push(vertices.length);
    for (const v of hole) {
      vertices.push(v);
      flat.push(v.x, v.z);
    }
  }
  const triangles = earcut(flat, holeIndices);
  return { vertices, triangles };
}
const produceSlab = (slab, _joinData, worldY) => {
  if (slab.boundary.length < 3) {
    throw new DescriptorInvariantError(
      `[produceSlab] slab.boundary requires ≥3 points; got ${slab.boundary.length}`
    );
  }
  const outer = ensureCCW(
    slab.boundary.map((p) => ({ x: p.x, z: p.z }))
  );
  const holes = slab.holes.filter((h) => h.length >= 3).map((h) => ensureCW(h.map((p) => ({ x: p.x, z: p.z }))));
  const yTop = worldY + slab.baseOffset;
  const yBot = yTop - slab.thickness;
  const systemTypeId = slab.systemTypeId ?? "";
  const materialId = slab.materialId ?? "";
  const color = slab.materialColor ?? TOP_FALLBACK_COLOR;
  const topKey = composeSlabMaterialKey(systemTypeId, materialId, color, "top");
  const bottomKey = composeSlabMaterialKey(systemTypeId, materialId, slab.materialColor ?? BOTTOM_FALLBACK_COLOR, "bottom");
  const sideKey = composeSlabMaterialKey(systemTypeId, materialId, slab.materialColor ?? SIDE_FALLBACK_COLOR, "side");
  const tri = triangulate(outer, holes);
  const topPositions = [];
  const topNormals = [];
  const topUvs = [];
  for (let i = 0; i < tri.triangles.length; i += 3) {
    const ia = tri.triangles[i];
    const ib = tri.triangles[i + 1];
    const ic = tri.triangles[i + 2];
    const a = tri.vertices[ia];
    const b = tri.vertices[ib];
    const c = tri.vertices[ic];
    topPositions.push(a.x, yTop, a.z, b.x, yTop, b.z, c.x, yTop, c.z);
    topNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    topUvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
  }
  const botPositions = [];
  const botNormals = [];
  const botUvs = [];
  for (let i = 0; i < tri.triangles.length; i += 3) {
    const ia = tri.triangles[i];
    const ib = tri.triangles[i + 2];
    const ic = tri.triangles[i + 1];
    const a = tri.vertices[ia];
    const b = tri.vertices[ib];
    const c = tri.vertices[ic];
    botPositions.push(a.x, yBot, a.z, b.x, yBot, b.z, c.x, yBot, c.z);
    botNormals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    botUvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
  }
  const sidePositions = [];
  const sideNormals = [];
  const sideUvs = [];
  function emitSideStrip(loop, outwardSign) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez) || 1;
      const nx = -ez / len * outwardSign;
      const nz = ex / len * outwardSign;
      const aBot = [a.x, yBot, a.z];
      const bBot = [b.x, yBot, b.z];
      const aTop = [a.x, yTop, a.z];
      const bTop = [b.x, yTop, b.z];
      sidePositions.push(...aBot, ...bBot, ...bTop);
      sideNormals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      sideUvs.push(0, 0, len, 0, len, slab.thickness);
      sidePositions.push(...aBot, ...bTop, ...aTop);
      sideNormals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      sideUvs.push(0, 0, len, slab.thickness, 0, slab.thickness);
    }
  }
  emitSideStrip(outer, 1);
  for (const hole of holes) emitSideStrip(hole, -1);
  const parts = [
    { geometry: { positions: topPositions, normals: topNormals, uvs: topUvs }, materialKey: topKey },
    { geometry: { positions: botPositions, normals: botNormals, uvs: botUvs }, materialKey: bottomKey },
    { geometry: { positions: sidePositions, normals: sideNormals, uvs: sideUvs }, materialKey: sideKey }
  ];
  const concat = concatRaw(parts);
  const hash = composeSlabGeometryHash(slab, worldY);
  return serializeDescriptor(concat, hash);
};

class Pipeline {
  passList;
  setupComplete = /* @__PURE__ */ new Set();
  constructor(passes) {
    if (passes.length === 0) {
      throw new Error("[Pipeline] cannot construct an empty pipeline.");
    }
    this.passList = [...passes];
  }
  /** Read-only view of the registered passes.  Useful for tests and
   *  for the IdleAccumulator to register against the same set. */
  get passes() {
    return this.passList;
  }
  /** Append a pass at the end of the pipeline.  Used by bootstrap to
   *  add post-FX behind the `?postfx=on` flag. */
  add(pass) {
    if (this.passList.some((p) => p.id === pass.id)) {
      throw new Error(`[Pipeline] duplicate pass id: ${pass.id}`);
    }
    this.passList.push(pass);
  }
  /** Run every pass in registration order.  Each pass.render() is
   *  wrapped in a `pryzm.render.pass` span. */
  render(ctx, dt = 0, frameIndex = 0) {
    ctx.renderer.info.reset();
    for (const pass of this.passList) {
      if (!this.setupComplete.has(pass.id)) {
        pass.setup(ctx);
        this.setupComplete.add(pass.id);
      }
      withSpanSync(
        "pryzm.render.pass",
        {
          "pass.id": pass.id,
          "pass.priority": pass.priority,
          "pass.idle_budget_frames": pass.idleBudgetFrames,
          "pass.idle_frame_index": frameIndex
        },
        (span) => {
          const t0 = performance.now();
          const converged = pass.render(ctx, dt, frameIndex);
          const dur = performance.now() - t0;
          span.setAttribute("pass.duration_ms", Number(dur.toFixed(3)));
          span.setAttribute("pass.converged", converged);
        }
      );
    }
  }
  resize(width, height) {
    for (const pass of this.passList) pass.resize(width, height);
  }
  dispose() {
    for (const pass of this.passList) pass.dispose();
    this.setupComplete.clear();
  }
}

class ClearPass {
  id = "clear";
  priority = "pre-render";
  idleBudgetFrames = 0;
  clearColor;
  constructor(clearColor) {
    this.clearColor = clearColor;
  }
  setup(_ctx) {
  }
  render(ctx, _dt, _frameIndex) {
    ctx.renderer.autoClear = true;
    ctx.renderer.setClearColor(this.clearColor, 1);
    return true;
  }
  resize(_width, _height) {
  }
  dispose() {
  }
}

class MeshPass {
  id = "mesh";
  priority = "render";
  idleBudgetFrames = 0;
  setup(_ctx) {
  }
  render(ctx, _dt, _frameIndex) {
    ctx.renderer.render(ctx.scene, ctx.camera);
    return true;
  }
  resize(_width, _height) {
  }
  dispose() {
  }
}

class RendererInitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RendererInitError";
  }
}
class Renderer {
  mode;
  canvas;
  scene;
  camera;
  /** Underlying THREE renderer.  Internal — DO NOT export across the
   *  package boundary.  Bench/test fixtures access via the
   *  `_internalThreeRenderer()` accessor below. */
  threeRenderer;
  pipeline;
  disposed = false;
  /** Monotonic frame counter — used as `pass.idle_frame_index` in the
   *  per-pass OTel span and as the jitter index by TRAA. */
  frameIndex = 0;
  /** @internal — tests + bench only.  Do NOT use from app code. */
  _internalThreeRenderer() {
    return this.threeRenderer;
  }
  constructor(mode, canvas, threeRenderer, opts) {
    this.mode = mode;
    this.canvas = canvas;
    this.threeRenderer = threeRenderer;
    this.scene = new Scene();
    const aspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1;
    this.camera = new PerspectiveCamera(50, aspect, 0.1, 1e3);
    this.camera.position.set(3, 3, 3);
    this.camera.lookAt(0, 0, 0);
    const ambient = new AmbientLight(16777215, 0.6);
    const directional = new DirectionalLight(16777215, 0.8);
    directional.position.set(5, 10, 5);
    this.scene.add(ambient, directional);
    this.pipeline = new Pipeline([
      new ClearPass(opts.clearColor ?? 2105380),
      new MeshPass()
    ]);
  }
  /** Canonical alias for `render()` per chunks/22 §22.3 Flow 3 stage 5
   *  ("First frame painted → `runtime.scene.renderer.frame()`").
   *  Delegates straight to `render()` — `render()` is the
   *  Three.js-convention name kept for FrameScheduler interop and
   *  back-compat with existing call sites; `frame()` is the
   *  architectural-spec name.  In a future wave `render()` becomes a
   *  deprecated alias. */
  frame() {
    this.render();
  }
  /** Render one frame.  Wrapped in `pryzm.frame.render` OTel span; the
   *  scheduler's `markDirty('camera')` + tick listener pump this. */
  render() {
    if (this.disposed) return;
    this.frameIndex++;
    withSpanSync(
      "pryzm.frame.render",
      { "pryzm.renderer.mode": this.mode },
      (span) => {
        this.pipeline.render(this.renderContext(), 0, this.frameIndex);
        const info = this.threeRenderer.info;
        span.setAttributes({
          "pryzm.renderer.draw_calls": info.render.calls,
          "pryzm.renderer.triangles": info.render.triangles
        });
      }
    );
  }
  /** Append a post-FX RenderPass.  Bootstrap calls this once for each
   *  of Bloom / TRAA / SSGI when the `?postfx=on` flag is present. */
  addPass(pass) {
    this.pipeline.add(pass);
  }
  /** Snapshot the current RenderContext — used by IdleAccumulator
   *  bind-time (`accumulator.attachContext(renderer.renderContext())`). */
  renderContext() {
    const size = new Vector2();
    this.threeRenderer.getSize(size);
    return {
      renderer: this.threeRenderer,
      scene: this.scene,
      camera: this.camera,
      width: size.x,
      height: size.y
    };
  }
  /** Bind the renderer's `render()` to a FrameScheduler tick listener.
   *  Call once during bootstrap; the returned disposer removes the
   *  binding.  S06-T7 paired-session boot wiring uses this. */
  attachTo(scheduler, listenerId = "renderer.draw") {
    return scheduler.addTickListener(
      listenerId,
      () => this.render(),
      "render"
    );
  }
  /** Resize the canvas + camera aspect.  Call from a ResizeObserver in
   *  the host page (bootstrap wires this). */
  resize(width, height) {
    if (this.disposed) return;
    if (width <= 0 || height <= 0) return;
    this.threeRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.pipeline.resize(width, height);
  }
  /** Tear down the THREE renderer + scene + pipeline.  Idempotent. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pipeline.dispose();
    this.threeRenderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) m.dispose();
        } else {
          obj.material?.dispose();
        }
      }
    });
  }
  /** Boot path.  Promise so we can await the WebGPU adapter request.
   *  See ADR-007 for the resolution table. */
  static async init(canvas, opts = {}) {
    const requestedMode = opts.mode ?? "auto";
    return withSpan(
      "pryzm.renderer.init",
      { "pryzm.renderer.mode_requested": requestedMode },
      async (span) => {
        const resolved = await resolveMode(requestedMode, opts.gpuProvider);
        const three = createThreeRenderer(canvas, resolved, opts);
        span.setAttributes({ "pryzm.renderer.mode": resolved });
        return new Renderer(resolved, canvas, three, opts);
      }
    );
  }
}
async function resolveMode(requested, gpuProvider) {
  if (requested === "webgl2") return "webgl2";
  const gpu = gpuProvider ? gpuProvider() : getNavigatorGpu();
  if (gpu === void 0) {
    if (requested === "webgpu") {
      throw new RendererInitError(
        '[Renderer] mode="webgpu" requested but navigator.gpu is unavailable on this client.'
      );
    }
    return "webgl2";
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) {
      if (requested === "webgpu") {
        throw new RendererInitError(
          '[Renderer] mode="webgpu" requested but no compatible GPU adapter was returned.'
        );
      }
      return "webgl2";
    }
    return "webgpu";
  } catch (err) {
    if (requested === "webgpu") {
      throw new RendererInitError(
        `[Renderer] mode="webgpu" requested but adapter request failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return "webgl2";
  }
}
function getNavigatorGpu() {
  if (typeof navigator === "undefined") return void 0;
  return navigator.gpu;
}
function createThreeRenderer(canvas, mode, opts) {
  const contextType = mode === "webgl2" ? "webgl2" : "webgl2";
  const context = canvas.getContext(contextType);
  if (context === null) {
    throw new RendererInitError(
      `[Renderer] canvas.getContext('${contextType}') returned null — is the canvas already locked to a different context?`
    );
  }
  const renderer = new WebGLRenderer({
    canvas,
    context,
    antialias: true,
    powerPreference: "high-performance"
  });
  const ratio = typeof window !== "undefined" && window.devicePixelRatio ? Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 2) : 1;
  renderer.setPixelRatio(ratio);
  if (canvas.width > 0 && canvas.height > 0) {
    renderer.setSize(canvas.width, canvas.height, false);
  }
  renderer.setClearColor(opts.clearColor ?? 2105380, 1);
  return renderer;
}

const PITCH_LIMIT = Math.PI / 2 - 0.05;
class CameraController {
  camera;
  target;
  minDistance;
  maxDistance;
  orbitSensitivity;
  panSensitivity;
  zoomSensitivity;
  dirtyKey;
  element;
  scheduler;
  /** Spherical state, rebuilt from the camera on construction.
   *  yaw (around Y), pitch (above XZ), distance from target. */
  yaw = 0;
  pitch = 0;
  distance = 1;
  dragging = null;
  lastX = 0;
  lastY = 0;
  disposed = false;
  constructor(camera, element, scheduler, opts = {}) {
    this.camera = camera;
    this.element = element;
    this.scheduler = scheduler;
    this.target = opts.target?.clone() ?? new Vector3(0, 0, 0);
    this.minDistance = opts.minDistance ?? 0.5;
    this.maxDistance = opts.maxDistance ?? 100;
    this.orbitSensitivity = opts.orbitSensitivity ?? 5e-3;
    this.panSensitivity = opts.panSensitivity ?? 2e-3;
    this.zoomSensitivity = opts.zoomSensitivity ?? 0.1;
    this.dirtyKey = opts.dirtyKey ?? "camera";
    const offset = new Vector3().subVectors(camera.position, this.target);
    this.distance = opts.distance ?? Math.max(offset.length(), this.minDistance);
    this.yaw = Math.atan2(offset.x, offset.z);
    this.pitch = Math.asin(
      this.distance > 0 ? MathUtils.clamp(offset.y / this.distance, -1, 1) : 0
    );
    this.applyTransform();
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("contextmenu", this.onContextMenu);
  }
  // ── S17 view-state interop (additive) ─────────────────────────────
  //
  // `snapshot()` / `applyPose()` give the ViewController a way to read
  // the current camera pose and animate to a target pose without
  // touching the controller's internal yaw/pitch/distance state
  // directly.  Both are pure-data operations — they do NOT install
  // event listeners, take ownership of the camera object, or alter
  // the controller's input bindings.  See ADR-0016
  // §"Implementation notes" for the contract.
  /** Snapshot the current camera pose (position + target + up).  The
   *  returned vectors are CLONES — mutating them after the call is
   *  safe.  Used by `ViewController.switchTo()` to capture the
   *  starting pose for the camera animation. */
  snapshot() {
    return {
      position: this.camera.position.clone(),
      target: this.target.clone(),
      up: this.camera.up.clone()
    };
  }
  /** Snapshot the current camera pose as plain `{x, y, z}` objects
   *  (W-02).  Identical semantics to `snapshot()` but the result has
   *  no THREE dependency — `@pryzm/view-state` consumes this so it
   *  can interpolate camera transitions without importing THREE. */
  snapshotPlain() {
    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.target.x, y: this.target.y, z: this.target.z },
      up: { x: this.camera.up.x, y: this.camera.up.y, z: this.camera.up.z }
    };
  }
  // Cached scratch vectors used by `interpolateTo()` so the renderer
  // — not the caller — owns the THREE allocations.  Re-used across
  // ticks to keep the per-frame allocation cost at zero.
  _interpScratch = {
    pos: new Vector3(),
    tgt: new Vector3(),
    up: new Vector3()
  };
  /** Interpolate from `start` toward `end` at parameter `t ∈ [0, 1]`
   *  and apply the resulting pose to the camera (W-02).  This is the
   *  THREE-free interpolation primitive `ViewController.switchTo()`
   *  drives once per `pre-render` tick.
   *
   *  Inputs are plain `{x, y, z}` tuples; the THREE math (component
   *  lerp, matrix recompose via `applyPose()`) lives entirely inside
   *  the renderer.  Marks the scheduler dirty under `dirtyKey` exactly
   *  once per call, courtesy of `applyPose()`. */
  interpolateTo(start, end, t) {
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = this._interpScratch;
    s.pos.set(
      start.position.x + (end.position.x - start.position.x) * tt,
      start.position.y + (end.position.y - start.position.y) * tt,
      start.position.z + (end.position.z - start.position.z) * tt
    );
    s.tgt.set(
      start.target.x + (end.target.x - start.target.x) * tt,
      start.target.y + (end.target.y - start.target.y) * tt,
      start.target.z + (end.target.z - start.target.z) * tt
    );
    s.up.set(
      start.up.x + (end.up.x - start.up.x) * tt,
      start.up.y + (end.up.y - start.up.y) * tt,
      start.up.z + (end.up.z - start.up.z) * tt
    );
    this.applyPose({ position: s.pos, target: s.tgt, up: s.up });
  }
  /** Apply a pose to the camera.  Updates internal yaw/pitch/distance
   *  via `syncFromCamera()` so subsequent orbit / pan input from the
   *  user picks up from the new pose without snapping.  Marks the
   *  scheduler dirty under `dirtyKey` so the next frame renders. */
  applyPose(pose) {
    this.target.copy(pose.target);
    this.camera.up.copy(pose.up);
    this.camera.position.copy(pose.position);
    this.camera.lookAt(this.target);
    this.syncFromCamera();
    this.scheduler.markDirty(this.dirtyKey);
  }
  /** Force a re-derivation of yaw/pitch/distance from the camera's
   *  current world position.  Useful after a programmatic
   *  `camera.position.set(...)` outside the controller. */
  syncFromCamera() {
    const offset = new Vector3().subVectors(this.camera.position, this.target);
    this.distance = Math.max(offset.length(), this.minDistance);
    this.yaw = Math.atan2(offset.x, offset.z);
    this.pitch = Math.asin(
      this.distance > 0 ? MathUtils.clamp(offset.y / this.distance, -1, 1) : 0
    );
    this.applyTransform();
  }
  /** Programmatic orbit — used by tests + the demo's "wiggle" intro. */
  orbit(yawDelta, pitchDelta) {
    this.yaw += yawDelta;
    this.pitch = MathUtils.clamp(this.pitch + pitchDelta, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }
  /** Programmatic zoom — wheel deltas route through here. */
  zoom(factor) {
    this.distance = MathUtils.clamp(
      this.distance * factor,
      this.minDistance,
      this.maxDistance
    );
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }
  /** Programmatic pan — translates the target in the camera's right/up
   *  plane.  Used by tests and right-button drag. */
  pan(dxPx, dyPx) {
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const scale = this.panSensitivity * this.distance;
    this.target.addScaledVector(right, -dxPx * scale);
    this.target.addScaledVector(up, dyPx * scale);
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
    }
  }
  applyTransform() {
    const cosPitch = Math.cos(this.pitch);
    const x = this.distance * cosPitch * Math.sin(this.yaw);
    const y = this.distance * Math.sin(this.pitch);
    const z = this.distance * cosPitch * Math.cos(this.yaw);
    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z
    );
    this.camera.lookAt(this.target);
  }
  onPointerDown(ev) {
    if (this.disposed) return;
    if (ev.button === 2) this.dragging = "pan";
    else this.dragging = "orbit";
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
    }
  }
  onPointerMove(ev) {
    if (this.disposed || this.dragging === null) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    if (this.dragging === "orbit") {
      this.orbit(-dx * this.orbitSensitivity, -dy * this.orbitSensitivity);
    } else {
      this.pan(dx, dy);
    }
  }
  onPointerUp(_ev) {
    this.dragging = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
    }
  }
  onWheel(ev) {
    if (this.disposed) return;
    ev.preventDefault();
    const factor = 1 + Math.sign(ev.deltaY) * this.zoomSensitivity;
    this.zoom(factor);
  }
  onContextMenu(ev) {
    ev.preventDefault();
  }
}

function buildBufferGeometry(descriptor) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(descriptor.position, 3));
  g.setAttribute("normal", new BufferAttribute(descriptor.normal, 3));
  g.setAttribute("uv", new BufferAttribute(descriptor.uv, 2));
  g.setIndex(new BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) {
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  }
  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  g.boundingBox = new Box3(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, max.y, max.z)
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const dx = max.x - cx;
  const dy = max.y - cy;
  const dz = max.z - cz;
  g.boundingSphere = new Sphere(
    new Vector3(cx, cy, cz),
    Math.sqrt(dx * dx + dy * dy + dz * dz)
  );
  return g;
}
function disposeGeometry(geometry) {
  geometry.dispose();
}

const PRYZM1_WALL_ROUGHNESS = 0.85;
const PRYZM1_WALL_METALNESS = 0.05;
const FALLBACK_COLOR = "#d4c5b0";
function colorOfWallMaterialKey(key) {
  const parts = key.split("|");
  if (parts.length < 5 || parts[0] !== "wall") return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}
function makeWallMaterialFactory(key) {
  const color = colorOfWallMaterialKey(key);
  return () => new MeshStandardMaterial({
    color: new Color(color),
    roughness: PRYZM1_WALL_ROUGHNESS,
    metalness: PRYZM1_WALL_METALNESS,
    side: DoubleSide
  });
}

const GEOMETRY_FIELDS$3 = [
  "baseLine",
  "curve",
  "height",
  "thickness",
  "baseOffset",
  "layers",
  "openings",
  "systemTypeId"
];
const MATERIAL_FIELDS$3 = ["materialColor", "materialId"];
function dtoVisible(dto) {
  return dto.visible !== false;
}
function geometryDirty$2(prev, next) {
  for (const k of GEOMETRY_FIELDS$3) {
    const a = prev[k];
    const b = next[k];
    if (a === b) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}
function materialDirty$2(prev, next) {
  for (const k of MATERIAL_FIELDS$3) {
    if (prev[k] !== next[k]) {
      return true;
    }
  }
  return false;
}
function visibilityDirty(prev, next) {
  return dtoVisible(prev) !== dtoVisible(next);
}
class WallCommitter {
  constructor(pool) {
    this.pool = pool;
  }
  pool;
  primitiveType = "wall";
  entries = /* @__PURE__ */ new Map();
  // Telemetry counters — read by tests + the OTel `pryzm.committer.commit`
  // span emission helper.  Reset by the host on dispose.
  meshesCreated = 0;
  meshesDisposed = 0;
  geometryRebuilds = 0;
  geometrySkippedByHash = 0;
  materialRebinds = 0;
  visibilityToggles = 0;
  // ── PrimitiveCommitter impl ────────────────────────────────────────
  onAdd(id, dto) {
    const root = new Group();
    root.name = `wall:${id}`;
    const descriptor = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
    const geometry = buildBufferGeometry(descriptor);
    const handles = this.acquireHandles(descriptor);
    const materials = handles.map((h) => h.material);
    const mesh = new Mesh(geometry, materials);
    mesh.name = `wall:${id}:mesh`;
    root.add(mesh);
    root.userData.descriptorHash = descriptor.hash;
    this.meshesCreated += 1;
    let proxyMesh = null;
    if (!dtoVisible(dto)) {
      proxyMesh = makeProxyMesh(geometry);
      mesh.visible = false;
      root.add(proxyMesh);
      this.visibilityToggles += 1;
    }
    this.entries.set(id, {
      mesh,
      proxyMesh,
      materialHandles: handles,
      descriptorHash: descriptor.hash,
      prevDto: dto
    });
    return root;
  }
  onUpdate(id, dto, root) {
    const entry = this.entries.get(id);
    if (entry === void 0) {
      return;
    }
    const prev = entry.prevDto;
    const geomChanged = geometryDirty$2(prev, dto);
    const matChanged = materialDirty$2(prev, dto);
    const visChanged = visibilityDirty(prev, dto);
    if (geomChanged) {
      const next = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
      if (next.hash === entry.descriptorHash) {
        this.geometrySkippedByHash += 1;
      } else {
        this.replaceGeometry(root, entry, next);
        this.geometryRebuilds += 1;
      }
    } else {
      this.geometrySkippedByHash += 1;
    }
    if (!geomChanged && matChanged) {
      this.rebindMaterials(entry, dto);
      this.materialRebinds += 1;
    }
    if (visChanged) {
      this.toggleProxy(root, entry, dto);
      this.visibilityToggles += 1;
    }
    entry.prevDto = dto;
  }
  onRemove(id, root) {
    const entry = this.entries.get(id);
    if (entry === void 0) return;
    this.disposeEntry(root, entry);
    this.entries.delete(id);
    this.meshesDisposed += 1;
  }
  onDispose() {
    for (const [, entry] of this.entries) {
      disposeGeometry(entry.mesh.geometry);
      if (entry.proxyMesh) disposeGeometry(entry.proxyMesh.geometry);
      for (const h of entry.materialHandles) h.release();
    }
    this.entries.clear();
  }
  // ── Test + telemetry hooks ─────────────────────────────────────────
  /** Number of walls currently committed.  Test hook. */
  walls() {
    return this.entries.size;
  }
  /** Snapshot of internal counters.  Used by `pryzm.committer.commit`
   *  span emission and by tests that assert geometry-vs-material-vs-
   *  visibility branching. */
  stats() {
    return {
      walls: this.entries.size,
      meshesCreated: this.meshesCreated,
      meshesDisposed: this.meshesDisposed,
      geometryRebuilds: this.geometryRebuilds,
      geometrySkippedByHash: this.geometrySkippedByHash,
      materialRebinds: this.materialRebinds,
      visibilityToggles: this.visibilityToggles
    };
  }
  /** @internal — selection-highlight committer reads the current entry
   *  to source its outline geometry.  Exposed via the barrel only. */
  getEntry(id) {
    return this.entries.get(id);
  }
  // ── Internals ──────────────────────────────────────────────────────
  acquireHandles(descriptor) {
    return descriptor.materialKeys.map(
      (key) => this.pool.acquire(key, makeWallMaterialFactory(key))
    );
  }
  replaceGeometry(root, entry, next) {
    const newGeometry = buildBufferGeometry(next);
    const newHandles = this.acquireHandles(next);
    const newMaterials = newHandles.map((h) => h.material);
    const oldGeometry = entry.mesh.geometry;
    entry.mesh.geometry = newGeometry;
    entry.mesh.material = newMaterials;
    if (entry.proxyMesh) {
      const oldProxyGeo = entry.proxyMesh.geometry;
      entry.proxyMesh.geometry = newGeometry;
      if (oldProxyGeo !== oldGeometry) disposeGeometry(oldProxyGeo);
    }
    disposeGeometry(oldGeometry);
    for (const h of entry.materialHandles) h.release();
    entry.materialHandles = newHandles;
    entry.descriptorHash = next.hash;
    root.userData.descriptorHash = next.hash;
  }
  rebindMaterials(entry, dto) {
    const next = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
    const newHandles = this.acquireHandles(next);
    const newMaterials = newHandles.map((h) => h.material);
    entry.mesh.material = newMaterials;
    if (entry.proxyMesh) ;
    for (const h of entry.materialHandles) h.release();
    entry.materialHandles = newHandles;
  }
  toggleProxy(root, entry, dto) {
    const visible = dtoVisible(dto);
    if (visible) {
      if (entry.proxyMesh) {
        const proxyMat = entry.proxyMesh.material;
        if (proxyMat instanceof Material) proxyMat.dispose();
        else if (Array.isArray(proxyMat)) for (const m of proxyMat) m.dispose();
        root.remove(entry.proxyMesh);
        entry.proxyMesh = null;
      }
      entry.mesh.visible = true;
    } else {
      if (!entry.proxyMesh) {
        entry.proxyMesh = makeProxyMesh(entry.mesh.geometry);
        root.add(entry.proxyMesh);
      }
      entry.mesh.visible = false;
    }
  }
  disposeEntry(root, entry) {
    root.remove(entry.mesh);
    if (entry.proxyMesh) {
      root.remove(entry.proxyMesh);
      const proxyMat = entry.proxyMesh.material;
      if (proxyMat instanceof Material) proxyMat.dispose();
      else if (Array.isArray(proxyMat)) for (const m of proxyMat) m.dispose();
    }
    disposeGeometry(entry.mesh.geometry);
    for (const h of entry.materialHandles) h.release();
    entry.materialHandles = [];
  }
}
function makeProxyMesh(geometry) {
  const mat = new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    transparent: false
  });
  const mesh = new Mesh(geometry, mat);
  mesh.name = mesh.name || "wall:proxy";
  return mesh;
}

function buildSlabBufferGeometry(descriptor) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(descriptor.position, 3));
  g.setAttribute("normal", new BufferAttribute(descriptor.normal, 3));
  g.setAttribute("uv", new BufferAttribute(descriptor.uv, 2));
  g.setIndex(new BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) {
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  }
  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  g.boundingBox = new Box3(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, max.y, max.z)
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const radius = Math.hypot(max.x - cx, max.y - cy, max.z - cz);
  g.boundingSphere = new Sphere(new Vector3(cx, cy, cz), radius);
  return g;
}
function disposeSlabGeometry(g) {
  if (g) g.dispose();
}

const TOP_ROUGHNESS = 0.85;
const TOP_METALNESS = 0.05;
const BOTTOM_ROUGHNESS = 0.95;
const BOTTOM_METALNESS = 0;
const SIDE_ROUGHNESS = 0.9;
const SIDE_METALNESS = 0;
const FALLBACK_COLOURS = {
  top: "#cfcfcf",
  bottom: "#a8a8a8",
  side: "#9a9a9a"
};
function slotOfSlabMaterialKey(key) {
  const parts = key.split("|");
  const slot = parts[4];
  return slot && slot in FALLBACK_COLOURS ? slot : "top";
}
function colorOfSlabMaterialKey(key) {
  const parts = key.split("|");
  if (parts.length < 5) return FALLBACK_COLOURS.top;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return FALLBACK_COLOURS[slotOfSlabMaterialKey(key)] ?? FALLBACK_COLOURS.top;
}
function makeSlabMaterialFactory(key) {
  const color = colorOfSlabMaterialKey(key);
  const slot = slotOfSlabMaterialKey(key);
  let roughness = TOP_ROUGHNESS;
  let metalness = TOP_METALNESS;
  if (slot === "bottom") {
    roughness = BOTTOM_ROUGHNESS;
    metalness = BOTTOM_METALNESS;
  } else if (slot === "side") {
    roughness = SIDE_ROUGHNESS;
    metalness = SIDE_METALNESS;
  }
  return () => new MeshStandardMaterial({
    color: new Color(color),
    roughness,
    metalness,
    side: DoubleSide
  });
}

const GEOMETRY_FIELDS$2 = [
  "boundary",
  "holes",
  "thickness",
  "baseOffset",
  "levelId"
];
const MATERIAL_FIELDS$2 = ["materialId", "materialColor", "systemTypeId"];
function dirty(prev, next, fields) {
  for (const k of fields) {
    const a = prev[k];
    const b = next[k];
    if (k === "boundary" || k === "holes") {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}
class SlabCommitter {
  primitiveType = "slab";
  entries = /* @__PURE__ */ new Map();
  materialPool;
  worldY;
  stats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0
  };
  constructor(deps) {
    if (!deps.materialPool) throw new Error("[SlabCommitter] materialPool is required");
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }
  onAdd(id, dto) {
    const desc = produceSlab(dto, NO_JOINS, this.worldY());
    const geometry = buildSlabBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = "slab";
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto
    });
    return mesh;
  }
  onUpdate(id, dto, mesh) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS$2);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS$2);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceSlab(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildSlabBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeSlabGeometry(mesh.geometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceSlab(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      const newHandles = this.acquireHandles(desc);
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      this.stats.materialSwaps += 1;
    }
  }
  onRemove(id, mesh) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeSlabGeometry(mesh.geometry);
    this.entries.delete(id);
  }
  onDispose() {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeSlabGeometry(entry.mesh.geometry);
    }
    this.entries.clear();
  }
  acquireHandles(desc) {
    return desc.materialKeys.map(
      (key) => this.materialPool.acquire(key, makeSlabMaterialFactory(key))
    );
  }
}

function buildDoorBufferGeometry(descriptor) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(descriptor.position, 3));
  g.setAttribute("normal", new BufferAttribute(descriptor.normal, 3));
  g.setAttribute("uv", new BufferAttribute(descriptor.uv, 2));
  g.setIndex(new BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) {
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  }
  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  g.boundingBox = new Box3(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, max.y, max.z)
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const radius = Math.hypot(max.x - cx, max.y - cy, max.z - cz);
  g.boundingSphere = new Sphere(new Vector3(cx, cy, cz), radius);
  return g;
}
function disposeDoorGeometry(g) {
  if (g) g.dispose();
}

const PRYZM1_DOOR_ROUGHNESS = 0.6;
const PRYZM1_DOOR_METALNESS = 0.05;
const FALLBACK_FRAME_COLOR$1 = "#8b7058";
const FALLBACK_LEAF_COLOR = "#c2a684";
const UNRESOLVED_PREFIX$1 = "unresolved:";
const UNRESOLVED_MATERIAL_COLOR$1 = "#ff00ff";
const DOOR_KEYWORD_COLORS = [
  [/walnut|mahogany|ebony|wenge/, "#5a3a28"],
  [/oak|teak|cedar|cherry|iroko|merbau|hardwood/, "#a0724a"],
  [/timber|wood|pine|birch|ash|maple|larch|spruce|fir|softwood|plywood|veneer|mdf|laminate/, "#c2a684"],
  [/bronze/, "#9d724c"],
  [/brass|gold/, "#c8a840"],
  [/anthracite|charcoal|graphite|jet|black/, "#3c3c3c"],
  [/aluminium|aluminum|\balu\b|steel|metal|chrome|silver|inox/, "#c0c4c8"],
  [/glass|glazed|glazing/, "#a4c8e1"],
  [/upvc|u-pvc|pvc|vinyl|white/, "#f0f0f0"],
  [/grey|gray/, "#8a8a8a"]
];
function inferDoorColor(parts) {
  const hay = `${parts[1] ?? ""} ${parts[2] ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const [re, col] of DOOR_KEYWORD_COLORS) {
    if (re.test(hay)) return col;
  }
  return null;
}
function colorOfDoorMaterialKey(key) {
  const parts = key.split("|");
  if (parts.length < 5 || parts[0] !== "door") return FALLBACK_LEAF_COLOR;
  const col = parts[3];
  if (col && col.startsWith(UNRESOLVED_PREFIX$1)) return UNRESOLVED_MATERIAL_COLOR$1;
  if (col && col.length > 0) return col;
  return inferDoorColor(parts) ?? (parts[4] === "frame" ? FALLBACK_FRAME_COLOR$1 : FALLBACK_LEAF_COLOR);
}
function makeDoorMaterialFactory(key) {
  const color = colorOfDoorMaterialKey(key);
  return () => new MeshStandardMaterial({
    color: new Color(color),
    roughness: PRYZM1_DOOR_ROUGHNESS,
    metalness: PRYZM1_DOOR_METALNESS,
    side: DoubleSide
  });
}

const GEOMETRY_FIELDS$1 = [
  "width",
  "height",
  "sillHeight",
  "offset",
  "frameThickness",
  "frameWidth",
  "wallId",
  // TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): swing is geometry-affecting —
  // a swing change must trigger a full produceDoor() rebuild so the hinge side
  // and open-angle geometry reflect the new direction.
  "swing"
];
const MATERIAL_FIELDS$1 = ["frameColor", "leafColor"];
function geometryDirty$1(prev, next) {
  for (const k of GEOMETRY_FIELDS$1) {
    if (prev[k] !== next[k]) {
      return true;
    }
  }
  return false;
}
function materialDirty$1(prev, next) {
  for (const k of MATERIAL_FIELDS$1) {
    if (prev[k] !== next[k]) {
      return true;
    }
  }
  return false;
}
function wallLength$1(wall) {
  const [a, b] = wall.baseLine;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function resolveDoorPlacement(door, wall) {
  const [start, end] = wall.baseLine;
  const len = wallLength$1(wall);
  const dx = (end.x - start.x) / (len || 1);
  const dz = (end.z - start.z) / (len || 1);
  const nx = -dz;
  const nz = dx;
  const tCentre = door.offset + door.width / 2;
  return {
    axis: { x: dx, y: 0, z: dz },
    normal: { x: nx, y: 0, z: nz },
    origin: {
      x: start.x + dx * tCentre,
      y: start.y + door.sillHeight,
      z: start.z + dz * tCentre
    },
    wallThickness: wall.thickness
  };
}
class DoorCommitter {
  primitiveType = "door";
  entries = /* @__PURE__ */ new Map();
  wallsSnapshot;
  materialPool;
  stats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0
  };
  constructor(deps) {
    if (!deps.wallsSnapshot) throw new Error("[DoorCommitter] wallsSnapshot is required");
    if (!deps.materialPool) throw new Error("[DoorCommitter] materialPool is required");
    this.wallsSnapshot = deps.wallsSnapshot;
    this.materialPool = deps.materialPool;
  }
  onAdd(id, dto) {
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) {
      const empty = new Mesh(new BufferGeometry(), []);
      empty.userData.elementId = id;
      empty.userData.primitiveType = "door";
      this.entries.set(id, {
        mesh: empty,
        materialHandles: [],
        descriptorHash: "",
        prevDto: dto
      });
      return empty;
    }
    const placement = resolveDoorPlacement(dto, wall);
    const desc = produceDoor(dto, placement);
    const geometry = buildDoorBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new Mesh(
      geometry,
      handles.map((h) => h.material)
    );
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = "door";
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto
    });
    return mesh;
  }
  onUpdate(id, dto, mesh) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) return;
    const geomChanged = geometryDirty$1(entry.prevDto, dto);
    const matChanged = materialDirty$1(entry.prevDto, dto);
    entry.prevDto = dto;
    if (geomChanged) {
      const placement = resolveDoorPlacement(dto, wall);
      const newHash = composeDoorGeometryHash(dto, placement);
      if (newHash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      const desc = produceDoor(dto, placement);
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildDoorBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeDoorGeometry(mesh.geometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const placement = resolveDoorPlacement(dto, wall);
      const desc = produceDoor(dto, placement);
      for (const h of entry.materialHandles) h.release();
      const newHandles = this.acquireHandles(desc);
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      this.stats.materialSwaps += 1;
    }
  }
  onRemove(id, mesh) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeDoorGeometry(mesh.geometry);
    this.entries.delete(id);
  }
  onDispose() {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeDoorGeometry(entry.mesh.geometry);
    }
    this.entries.clear();
  }
  acquireHandles(desc) {
    return desc.materialKeys.map(
      (key) => this.materialPool.acquire(key, makeDoorMaterialFactory(key))
    );
  }
}

function buildWindowBufferGeometry(descriptor) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(descriptor.position, 3));
  g.setAttribute("normal", new BufferAttribute(descriptor.normal, 3));
  g.setAttribute("uv", new BufferAttribute(descriptor.uv, 2));
  g.setIndex(new BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) {
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  }
  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  g.boundingBox = new Box3(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, max.y, max.z)
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const radius = Math.hypot(max.x - cx, max.y - cy, max.z - cz);
  g.boundingSphere = new Sphere(new Vector3(cx, cy, cz), radius);
  return g;
}
function disposeWindowGeometry(g) {
  if (g) g.dispose();
}

const PRYZM1_FRAME_ROUGHNESS = 0.55;
const PRYZM1_FRAME_METALNESS = 0.05;
const PRYZM1_GLASS_ROUGHNESS = 0.05;
const PRYZM1_GLASS_METALNESS = 0;
const PRYZM1_GLASS_OPACITY = 0.35;
const FALLBACK_FRAME_COLOR = "#cccccc";
const FALLBACK_GLASS_COLOR = "#a4c8e1";
const UNRESOLVED_PREFIX = "unresolved:";
const UNRESOLVED_MATERIAL_COLOR = "#ff00ff";
const FRAME_KEYWORD_COLORS = [
  [/walnut|mahogany|ebony|wenge/, "#5a3a28"],
  // dark hardwood
  [/oak|teak|cedar|cherry|iroko|merbau|hardwood/, "#a0724a"],
  // mid hardwood
  [/timber|wood|pine|birch|ash|maple|larch|spruce|fir|softwood|plywood|clt|glulam|bamboo|veneer/, "#c8a96e"],
  // light timber
  [/bronze/, "#9d724c"],
  [/brass|gold/, "#c8a840"],
  [/anthracite|charcoal|graphite|jet|black/, "#3c3c3c"],
  [/aluminium|aluminum|\balu\b|steel|metal|chrome|silver|inox/, "#c0c4c8"],
  [/upvc|u-pvc|pvc|vinyl|white/, "#f0f0f0"],
  [/grey|gray/, "#8a8a8a"]
];
function inferFrameColor(parts) {
  const hay = `${parts[1] ?? ""} ${parts[2] ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const [re, col] of FRAME_KEYWORD_COLORS) {
    if (re.test(hay)) return col;
  }
  return null;
}
function colorOfWindowMaterialKey(key) {
  const parts = key.split("|");
  if (parts.length < 5 || parts[0] !== "window") return FALLBACK_GLASS_COLOR;
  const col = parts[3];
  if (col && col.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  if (col && col.length > 0) return col;
  if (parts[4] === "frame") {
    return inferFrameColor(parts) ?? FALLBACK_FRAME_COLOR;
  }
  return FALLBACK_GLASS_COLOR;
}
function slotOfWindowMaterialKey(key) {
  const parts = key.split("|");
  return parts[4] === "frame" ? "frame" : "glass";
}
function makeWindowMaterialFactory(key) {
  const color = colorOfWindowMaterialKey(key);
  const slot = slotOfWindowMaterialKey(key);
  return () => {
    if (slot === "frame") {
      return new MeshStandardMaterial({
        color: new Color(color),
        roughness: PRYZM1_FRAME_ROUGHNESS,
        metalness: PRYZM1_FRAME_METALNESS,
        side: DoubleSide
      });
    }
    return new MeshStandardMaterial({
      color: new Color(color),
      roughness: PRYZM1_GLASS_ROUGHNESS,
      metalness: PRYZM1_GLASS_METALNESS,
      transparent: true,
      opacity: PRYZM1_GLASS_OPACITY,
      side: DoubleSide
    });
  };
}

const GEOMETRY_FIELDS = [
  "width",
  "height",
  "sillHeight",
  "offset",
  "frameThickness",
  "frameWidth",
  "wallId",
  "windowType"
];
const MATERIAL_FIELDS = ["frameColor"];
function geometryDirty(prev, next) {
  for (const k of GEOMETRY_FIELDS) {
    if (prev[k] !== next[k]) {
      return true;
    }
  }
  return false;
}
function materialDirty(prev, next) {
  for (const k of MATERIAL_FIELDS) {
    if (prev[k] !== next[k]) {
      return true;
    }
  }
  return false;
}
function wallLength(wall) {
  const [a, b] = wall.baseLine;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function resolveWindowPlacement(win, wall) {
  const [start, end] = wall.baseLine;
  const len = wallLength(wall);
  const dx = (end.x - start.x) / (len || 1);
  const dz = (end.z - start.z) / (len || 1);
  const nx = -dz;
  const nz = dx;
  const tCentre = win.offset + win.width / 2;
  return {
    axis: { x: dx, y: 0, z: dz },
    normal: { x: nx, y: 0, z: nz },
    origin: {
      x: start.x + dx * tCentre,
      y: start.y + win.sillHeight,
      z: start.z + dz * tCentre
    },
    wallThickness: wall.thickness
  };
}
class WindowCommitter {
  primitiveType = "window";
  entries = /* @__PURE__ */ new Map();
  wallsSnapshot;
  materialPool;
  stats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0
  };
  constructor(deps) {
    if (!deps.wallsSnapshot) throw new Error("[WindowCommitter] wallsSnapshot is required");
    if (!deps.materialPool) throw new Error("[WindowCommitter] materialPool is required");
    this.wallsSnapshot = deps.wallsSnapshot;
    this.materialPool = deps.materialPool;
  }
  onAdd(id, dto) {
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) {
      const empty = new Mesh(new BufferGeometry(), []);
      empty.userData.elementId = id;
      empty.userData.primitiveType = "window";
      this.entries.set(id, {
        mesh: empty,
        materialHandles: [],
        descriptorHash: "",
        prevDto: dto
      });
      return empty;
    }
    const placement = resolveWindowPlacement(dto, wall);
    const desc = produceWindow(dto, placement);
    const geometry = buildWindowBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = "window";
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto
    });
    return mesh;
  }
  onUpdate(id, dto, mesh) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) return;
    const geomChanged = geometryDirty(entry.prevDto, dto);
    const matChanged = materialDirty(entry.prevDto, dto);
    entry.prevDto = dto;
    if (geomChanged) {
      const placement = resolveWindowPlacement(dto, wall);
      const newHash = composeWindowGeometryHash(dto, placement);
      if (newHash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      const desc = produceWindow(dto, placement);
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildWindowBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeWindowGeometry(mesh.geometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const placement = resolveWindowPlacement(dto, wall);
      const desc = produceWindow(dto, placement);
      for (const h of entry.materialHandles) h.release();
      const newHandles = this.acquireHandles(desc);
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      this.stats.materialSwaps += 1;
    }
  }
  onRemove(id, mesh) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeWindowGeometry(mesh.geometry);
    this.entries.delete(id);
  }
  onDispose() {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeWindowGeometry(entry.mesh.geometry);
    }
    this.entries.clear();
  }
  acquireHandles(desc) {
    return desc.materialKeys.map(
      (key) => this.materialPool.acquire(key, makeWindowMaterialFactory(key))
    );
  }
}

async function bootstrapRenderEverything(opts) {
  const adoptedInner = opts.inner !== void 0;
  const inner = opts.inner ?? await bootstrapWithEverything(opts);
  const materialPool = new MaterialPool();
  const wallStore = inner.stores.wall;
  if (wallStore === void 0) {
    throw new Error(
      "[bootstrap.render.everything] expected a wall store on `runtime.stores.wall` but found none — check that the wall plugin is in `ALL_PLUGINS`."
    );
  }
  const wallsSnapshot = () => {
    const state = wallStore.getState();
    const out = {};
    for (const [id, dto] of state) out[id] = dto;
    return out;
  };
  const wallCommitter = new WallCommitter(materialPool);
  const slabCommitter = new SlabCommitter({
    materialPool,
    worldY: () => 0
  });
  const doorCommitter = new DoorCommitter({
    materialPool,
    wallsSnapshot
  });
  const windowCommitter = new WindowCommitter({
    materialPool,
    wallsSnapshot
  });
  inner.host.register(wallCommitter);
  inner.host.register(slabCommitter);
  inner.host.register(doorCommitter);
  inner.host.register(windowCommitter);
  const bindings = [];
  const bindOne = (storeKey, primitiveType) => {
    const store = inner.stores[storeKey];
    if (store === void 0) return;
    bindings.push(bindStore(store, primitiveType, inner.host));
  };
  bindOne("wall", "wall");
  bindOne("slab", "slab");
  bindOne("door", "door");
  bindOne("window", "window");
  const scheduler = opts.scheduler ?? new FrameScheduler();
  const ownsScheduler = opts.scheduler === void 0;
  let renderer = null;
  let rendererError = null;
  let detachRenderer = null;
  let detachReconciler = null;
  let camera = null;
  try {
    renderer = await Renderer.init(opts.canvas, { mode: opts.mode ?? "auto" });
    detachReconciler = installSceneReconciler(inner.host, renderer, scheduler);
    camera = new CameraController(renderer.camera, opts.canvas, scheduler);
    detachRenderer = renderer.attachTo(scheduler, "renderer.draw");
    if (ownsScheduler) scheduler.start();
    scheduler.markDirty("camera");
  } catch (err) {
    rendererError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      "[bootstrap.render.everything] renderer init failed — continuing in headless/data-only mode.  Bus + stores still work, no pixels will paint:",
      rendererError
    );
  }
  if (!adoptedInner) inner.start();
  let torn = false;
  return {
    ...inner,
    renderer,
    scheduler,
    camera,
    rendererMode: renderer?.mode ?? "unavailable",
    rendererError,
    materialPool,
    tearDown() {
      if (torn) return;
      torn = true;
      if (detachRenderer !== null) {
        try {
          detachRenderer();
        } catch {
        }
      }
      if (detachReconciler !== null) {
        try {
          detachReconciler();
        } catch {
        }
      }
      if (camera !== null) {
        try {
          camera.dispose();
        } catch {
        }
      }
      for (const b of bindings) {
        try {
          b.dispose();
        } catch {
        }
      }
      if (renderer !== null) {
        try {
          renderer.dispose();
        } catch {
        }
      }
      if (ownsScheduler) {
        try {
          scheduler.stop();
        } catch {
        }
      }
      if (!adoptedInner) {
        try {
          inner.tearDown();
        } catch {
        }
      }
    }
  };
}
function installSceneReconciler(host, renderer, scheduler) {
  const tracked = /* @__PURE__ */ new Set();
  const dispose = scheduler.addTickListener(
    "renderer.scene-reconcile",
    () => {
      const live = /* @__PURE__ */ new Set();
      for (const obj of host.registry.values()) {
        live.add(obj);
        if (!tracked.has(obj)) {
          tracked.add(obj);
          renderer.scene.add(obj);
        }
      }
      if (tracked.size > live.size) {
        for (const obj of tracked) {
          if (!live.has(obj)) {
            tracked.delete(obj);
            renderer.scene.remove(obj);
          }
        }
      }
    },
    "pre-render"
  );
  return () => {
    dispose();
    tracked.clear();
  };
}

export { bootstrapRenderEverything };
