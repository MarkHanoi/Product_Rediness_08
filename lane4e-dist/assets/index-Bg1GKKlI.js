import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';
import { p as polygonSignedAreaOrdinates, C as COINCIDENT_M, d as arePointsCoincident2D, c as isNumericallyZero } from './SteelProfileLibrary-NgbfwhrM.js';
import { D as DescriptorInvariantError } from './assertValidDescriptor-tuQbjkHa.js';
import { a as asMaterialKey, t as triangulateRingOrdinates, b as triangulationAreaDeviation } from './triangulatePolygon-D2k7Jml-.js';

const HASH_SCHEMA_VERSION$3 = "extrude:1";
const MIN_PROFILE_VERTS = 3;
const MIN_HEIGHT_M = 1e-6;
const DEGENERATE_AREA_M2 = 1e-9;
const produceExtrude = (profile, heightM, options) => {
  if (profile.length < MIN_PROFILE_VERTS) {
    throw new DescriptorInvariantError(
      `produceExtrude: profile needs at least ${MIN_PROFILE_VERTS} vertices, got ${profile.length}.`
    );
  }
  if (!Number.isFinite(heightM) || heightM <= MIN_HEIGHT_M) {
    throw new DescriptorInvariantError(
      `produceExtrude: heightM must be a finite positive number > ${MIN_HEIGHT_M}, got ${heightM}.`
    );
  }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      throw new DescriptorInvariantError(
        `produceExtrude: profile[${i}] has non-finite coords (x=${p.x}, z=${p.z}).`
      );
    }
  }
  const signedArea = computeSignedArea(profile);
  if (Math.abs(signedArea) < DEGENERATE_AREA_M2) {
    throw new DescriptorInvariantError(
      `produceExtrude: profile area is degenerate (|A|=${Math.abs(signedArea).toExponential(3)} m²).`
    );
  }
  const ccw = signedArea > 0 ? profile.slice() : [...profile].reverse();
  const appliedReversal = signedArea < 0;
  const worldY = options?.worldY ?? 0;
  const topY = worldY + heightM;
  const material = options?.material ?? asMaterialKey("extrude|default");
  const n = ccw.length;
  const totalVerts = 6 * n;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);
  for (let i = 0; i < n; i++) {
    const p = ccw[i];
    position[3 * i + 0] = p.x;
    position[3 * i + 1] = worldY;
    position[3 * i + 2] = p.z;
    normal[3 * i + 0] = 0;
    normal[3 * i + 1] = -1;
    normal[3 * i + 2] = 0;
    uv[2 * i + 0] = p.x;
    uv[2 * i + 1] = p.z;
  }
  for (let i = 0; i < n; i++) {
    const p = ccw[i];
    const base = n + i;
    position[3 * base + 0] = p.x;
    position[3 * base + 1] = topY;
    position[3 * base + 2] = p.z;
    normal[3 * base + 0] = 0;
    normal[3 * base + 1] = 1;
    normal[3 * base + 2] = 0;
    uv[2 * base + 0] = p.x;
    uv[2 * base + 1] = p.z;
  }
  for (let i = 0; i < n; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % n];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    const nx = len > 0 ? ez / len : 0;
    const nz = len > 0 ? -ex / len : 0;
    const sideBase = 2 * n + 4 * i;
    position[3 * (sideBase + 0) + 0] = a.x;
    position[3 * (sideBase + 0) + 1] = worldY;
    position[3 * (sideBase + 0) + 2] = a.z;
    position[3 * (sideBase + 1) + 0] = b.x;
    position[3 * (sideBase + 1) + 1] = worldY;
    position[3 * (sideBase + 1) + 2] = b.z;
    position[3 * (sideBase + 2) + 0] = b.x;
    position[3 * (sideBase + 2) + 1] = topY;
    position[3 * (sideBase + 2) + 2] = b.z;
    position[3 * (sideBase + 3) + 0] = a.x;
    position[3 * (sideBase + 3) + 1] = topY;
    position[3 * (sideBase + 3) + 2] = a.z;
    for (let k = 0; k < 4; k++) {
      normal[3 * (sideBase + k) + 0] = nx;
      normal[3 * (sideBase + k) + 1] = 0;
      normal[3 * (sideBase + k) + 2] = nz;
    }
    uv[2 * (sideBase + 0) + 0] = 0;
    uv[2 * (sideBase + 0) + 1] = 0;
    uv[2 * (sideBase + 1) + 0] = len;
    uv[2 * (sideBase + 1) + 1] = 0;
    uv[2 * (sideBase + 2) + 0] = len;
    uv[2 * (sideBase + 2) + 1] = heightM;
    uv[2 * (sideBase + 3) + 0] = 0;
    uv[2 * (sideBase + 3) + 1] = heightM;
  }
  const capTriangles = triangulateCap(ccw);
  const sideTriCount = 2 * n;
  const totalTris = 2 * capTriangles.length / 3 + sideTriCount;
  const totalIndices = 3 * totalTris;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);
  let cursor = 0;
  for (let t = 0; t < capTriangles.length; t += 3) {
    index[cursor++] = capTriangles[t + 0];
    index[cursor++] = capTriangles[t + 2];
    index[cursor++] = capTriangles[t + 1];
  }
  for (let t = 0; t < capTriangles.length; t += 3) {
    index[cursor++] = capTriangles[t + 0] + n;
    index[cursor++] = capTriangles[t + 1] + n;
    index[cursor++] = capTriangles[t + 2] + n;
  }
  for (let i = 0; i < n; i++) {
    const sideBase = 2 * n + 4 * i;
    index[cursor++] = sideBase + 0;
    index[cursor++] = sideBase + 1;
    index[cursor++] = sideBase + 2;
    index[cursor++] = sideBase + 0;
    index[cursor++] = sideBase + 2;
    index[cursor++] = sideBase + 3;
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of ccw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const descriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: worldY, z: minZ },
      max: { x: maxX, y: topY, z: maxZ }
    },
    groups: [
      { start: 0, count: totalIndices, materialIndex: 0 }
    ],
    materialKeys: [material],
    hash: composeExtrudeHash(ccw, heightM, worldY, material)
  };
  return Object.freeze({ ...descriptor, appliedReversal });
};
function composeExtrudeHash(profileCcw, heightM, worldY, material) {
  const verts = profileCcw.map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`).join("|");
  return `${HASH_SCHEMA_VERSION$3}|h=${heightM.toFixed(6)}|y=${worldY.toFixed(6)}|m=${material}|v=${verts}`;
}
function computeSignedArea(profile) {
  return polygonSignedAreaOrdinates(profile.length, (i) => profile[i].x, (i) => profile[i].z);
}
const TRIANGULATION_AREA_DEVIATION_TOL = 1e-6;
function triangulateCap(polygon) {
  const n = polygon.length;
  if (n === 3) return [0, 1, 2];
  const xAt = (i) => polygon[i].x;
  const yAt = (i) => polygon[i].z;
  const tris = triangulateRingOrdinates(n, xAt, yAt);
  const deviation = triangulationAreaDeviation(n, xAt, yAt, tris);
  if (deviation > TRIANGULATION_AREA_DEVIATION_TOL) {
    throw new DescriptorInvariantError(
      `produceExtrude: cap triangulation covers the wrong area (relative deviation ${deviation.toExponential(3)}); profile may be self-intersecting.`
    );
  }
  return tris;
}

const HASH_SCHEMA_VERSION$2 = "sweep:1";
const produceSweep = (profile, path, options = {}) => {
  if (profile.length < 3) {
    throw new DescriptorInvariantError(
      `produceSweep: profile must have ≥ 3 points (got ${profile.length}).`
    );
  }
  if (path.length < 2) {
    throw new DescriptorInvariantError(
      `produceSweep: path must have ≥ 2 points (got ${path.length}).`
    );
  }
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new DescriptorInvariantError(`produceSweep: path[${i}] non-finite.`);
    }
  }
  const closed = options.closed === true;
  const material = options.material ?? asMaterialKey("sweep|default");
  const N = profile.length;
  const M = path.length;
  const frames = buildParallelTransportFrames(path, closed);
  const sideVerts = N * M;
  const capVerts = closed ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);
  for (let s = 0; s < M; s++) {
    const f = frames[s];
    const o = path[s];
    for (let p = 0; p < N; p++) {
      const pp = profile[p];
      const v = s * N + p;
      position[3 * v + 0] = o.x + f.right.x * pp.u + f.up.x * pp.v;
      position[3 * v + 1] = o.y + f.right.y * pp.u + f.up.y * pp.v;
      position[3 * v + 2] = o.z + f.right.z * pp.u + f.up.z * pp.v;
      const t = profileTangent2D(profile, p);
      const nU = t.dv;
      const nV = -t.du;
      const len = Math.hypot(nU, nV) || 1;
      const nUu = nU / len;
      const nVv = nV / len;
      normal[3 * v + 0] = f.right.x * nUu + f.up.x * nVv;
      normal[3 * v + 1] = f.right.y * nUu + f.up.y * nVv;
      normal[3 * v + 2] = f.right.z * nUu + f.up.z * nVv;
      uv[2 * v + 0] = s / Math.max(1, M - 1);
      uv[2 * v + 1] = p / N;
    }
  }
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    const f0 = frames[0];
    const fN = frames[M - 1];
    const o0 = path[0];
    const oN = path[M - 1];
    for (let p = 0; p < N; p++) {
      const pp = profile[p];
      const sIdx = startBase + p;
      const eIdx = endBase + p;
      position[3 * sIdx + 0] = o0.x + f0.right.x * pp.u + f0.up.x * pp.v;
      position[3 * sIdx + 1] = o0.y + f0.right.y * pp.u + f0.up.y * pp.v;
      position[3 * sIdx + 2] = o0.z + f0.right.z * pp.u + f0.up.z * pp.v;
      position[3 * eIdx + 0] = oN.x + fN.right.x * pp.u + fN.up.x * pp.v;
      position[3 * eIdx + 1] = oN.y + fN.right.y * pp.u + fN.up.y * pp.v;
      position[3 * eIdx + 2] = oN.z + fN.right.z * pp.u + fN.up.z * pp.v;
      normal[3 * sIdx + 0] = -f0.tangent.x;
      normal[3 * sIdx + 1] = -f0.tangent.y;
      normal[3 * sIdx + 2] = -f0.tangent.z;
      normal[3 * eIdx + 0] = fN.tangent.x;
      normal[3 * eIdx + 1] = fN.tangent.y;
      normal[3 * eIdx + 2] = fN.tangent.z;
      uv[2 * sIdx + 0] = pp.u;
      uv[2 * sIdx + 1] = pp.v;
      uv[2 * eIdx + 0] = pp.u;
      uv[2 * eIdx + 1] = pp.v;
    }
  }
  const stations = closed ? M : M - 1;
  const sideIndexCount = stations * N * 6;
  const capIndexCount = closed ? 0 : 2 * (N - 2) * 3;
  const totalIndices = sideIndexCount + capIndexCount;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);
  let cursor = 0;
  for (let s = 0; s < stations; s++) {
    const r0 = s;
    const r1 = closed ? (s + 1) % M : s + 1;
    for (let p = 0; p < N; p++) {
      const pNext = (p + 1) % N;
      const a = r0 * N + p;
      const b = r0 * N + pNext;
      const c = r1 * N + pNext;
      const d = r1 * N + p;
      index[cursor++] = a;
      index[cursor++] = b;
      index[cursor++] = c;
      index[cursor++] = a;
      index[cursor++] = c;
      index[cursor++] = d;
    }
  }
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    for (let p = 1; p < N - 1; p++) {
      index[cursor++] = startBase;
      index[cursor++] = startBase + p + 1;
      index[cursor++] = startBase + p;
      index[cursor++] = endBase;
      index[cursor++] = endBase + p;
      index[cursor++] = endBase + p + 1;
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i], y = position[i + 1], z = position[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const descriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    },
    groups: [{ start: 0, count: totalIndices, materialIndex: 0 }],
    materialKeys: [material],
    hash: composeSweepHash(profile, path, closed, material)
  };
  return Object.freeze(descriptor);
};
function composeSweepHash(profile, path, closed, material) {
  const pf = profile.map((p) => `${p.u.toFixed(6)},${p.v.toFixed(6)}`).join("|");
  const pa = path.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`).join("|");
  return `${HASH_SCHEMA_VERSION$2}|c=${closed ? 1 : 0}|m=${material}|pf=${pf}|pa=${pa}`;
}
function profileTangent2D(profile, i) {
  const next = profile[(i + 1) % profile.length];
  const prev = profile[(i - 1 + profile.length) % profile.length];
  return { du: next.u - prev.u, dv: next.v - prev.v };
}
function buildParallelTransportFrames(path, closed) {
  const frames = [];
  const tangents = [];
  for (let i = 0; i < path.length; i++) {
    const a = closed ? path[(i - 1 + path.length) % path.length] : path[Math.max(0, i - 1)];
    const b = closed ? path[(i + 1) % path.length] : path[Math.min(path.length - 1, i + 1)];
    tangents.push(normalize$1({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }));
  }
  const t0 = tangents[0];
  const ref = pickReference(t0);
  let up = normalize$1(cross$1(t0, ref));
  let right = normalize$1(cross$1(up, t0));
  frames.push({ tangent: t0, up, right });
  for (let i = 1; i < tangents.length; i++) {
    const prevT = tangents[i - 1];
    const t = tangents[i];
    const axis = cross$1(prevT, t);
    const axisLen = Math.hypot(axis.x, axis.y, axis.z);
    if (axisLen < 1e-9) {
      frames.push({ tangent: t, up, right });
      continue;
    }
    const dotTT = clamp(prevT.x * t.x + prevT.y * t.y + prevT.z * t.z, -1, 1);
    const angle = Math.acos(dotTT);
    const k = { x: axis.x / axisLen, y: axis.y / axisLen, z: axis.z / axisLen };
    up = normalize$1(rotateAroundAxis(up, k, angle));
    right = normalize$1(cross$1(up, t));
    frames.push({ tangent: t, up, right });
  }
  return frames;
}
function pickReference(t) {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  if (ax <= ay && ax <= az) return { x: 1, y: 0, z: 0 };
  if (ay <= ax && ay <= az) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}
function normalize$1(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross$1(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function rotateAroundAxis(v, k, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = k.x * v.x + k.y * v.y + k.z * v.z;
  const cr = cross$1(k, v);
  return {
    x: v.x * cos + cr.x * sin + k.x * dot * (1 - cos),
    y: v.y * cos + cr.y * sin + k.y * dot * (1 - cos),
    z: v.z * cos + cr.z * sin + k.z * dot * (1 - cos)
  };
}
function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

const HASH_SCHEMA_VERSION$1 = "loft:1";
const produceLoft = (sections, options = {}) => {
  if (sections.length < 2) {
    throw new DescriptorInvariantError(
      `produceLoft: need ≥ 2 sections (got ${sections.length}).`
    );
  }
  const N = sections[0].profile.length;
  if (N < 3) {
    throw new DescriptorInvariantError(`produceLoft: profile must have ≥ 3 points (got ${N}).`);
  }
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.profile.length !== N) {
      throw new DescriptorInvariantError(
        `produceLoft: section ${i} has ${s.profile.length} verts; expected ${N}.`
      );
    }
  }
  const closed = options.closed === true;
  const material = options.material ?? asMaterialKey("loft|default");
  const M = sections.length;
  const sideVerts = N * M;
  const capVerts = closed ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);
  for (let s = 0; s < M; s++) {
    const sec = sections[s];
    const o = sec.worldOrigin;
    for (let p = 0; p < N; p++) {
      const v = s * N + p;
      const pp = sec.profile[p];
      position[3 * v + 0] = o.x + sec.right.x * pp.u + sec.up.x * pp.v;
      position[3 * v + 1] = o.y + sec.right.y * pp.u + sec.up.y * pp.v;
      position[3 * v + 2] = o.z + sec.right.z * pp.u + sec.up.z * pp.v;
      uv[2 * v + 0] = s / Math.max(1, M - 1);
      uv[2 * v + 1] = p / N;
    }
  }
  for (let s = 0; s < M; s++) {
    const sNext = closed ? (s + 1) % M : Math.min(M - 1, s + 1);
    const sPrev = closed ? (s - 1 + M) % M : Math.max(0, s - 1);
    for (let p = 0; p < N; p++) {
      const pNext = (p + 1) % N;
      const pPrev = (p - 1 + N) % N;
      const here = vec(position, s * N + p);
      const right = vec(position, s * N + pNext);
      const left = vec(position, s * N + pPrev);
      const fwd = vec(position, sNext * N + p);
      const back = vec(position, sPrev * N + p);
      const tU = sub(right, left);
      const tS = sub(fwd, back);
      let n = cross(tS, tU);
      if (Math.hypot(n.x, n.y, n.z) < 1e-12) {
        n = cross(sub(right, here), sub(fwd, here));
      }
      n = normalize(n);
      const v = s * N + p;
      normal[3 * v + 0] = n.x;
      normal[3 * v + 1] = n.y;
      normal[3 * v + 2] = n.z;
    }
  }
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    const startN = sectionNormal(sections[0]);
    const endN = sectionNormal(sections[M - 1]);
    const sec0 = sections[0];
    const secN = sections[M - 1];
    for (let p = 0; p < N; p++) {
      const sIdx = startBase + p;
      const eIdx = endBase + p;
      const pp0 = sec0.profile[p];
      const ppN = secN.profile[p];
      position[3 * sIdx + 0] = sec0.worldOrigin.x + sec0.right.x * pp0.u + sec0.up.x * pp0.v;
      position[3 * sIdx + 1] = sec0.worldOrigin.y + sec0.right.y * pp0.u + sec0.up.y * pp0.v;
      position[3 * sIdx + 2] = sec0.worldOrigin.z + sec0.right.z * pp0.u + sec0.up.z * pp0.v;
      position[3 * eIdx + 0] = secN.worldOrigin.x + secN.right.x * ppN.u + secN.up.x * ppN.v;
      position[3 * eIdx + 1] = secN.worldOrigin.y + secN.right.y * ppN.u + secN.up.y * ppN.v;
      position[3 * eIdx + 2] = secN.worldOrigin.z + secN.right.z * ppN.u + secN.up.z * ppN.v;
      normal[3 * sIdx + 0] = -startN.x;
      normal[3 * sIdx + 1] = -startN.y;
      normal[3 * sIdx + 2] = -startN.z;
      normal[3 * eIdx + 0] = endN.x;
      normal[3 * eIdx + 1] = endN.y;
      normal[3 * eIdx + 2] = endN.z;
      uv[2 * sIdx + 0] = pp0.u;
      uv[2 * sIdx + 1] = pp0.v;
      uv[2 * eIdx + 0] = ppN.u;
      uv[2 * eIdx + 1] = ppN.v;
    }
  }
  const stations = closed ? M : M - 1;
  const sideIndexCount = stations * N * 6;
  const capIndexCount = closed ? 0 : 2 * (N - 2) * 3;
  const totalIndices = sideIndexCount + capIndexCount;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);
  let cursor = 0;
  for (let s = 0; s < stations; s++) {
    const r0 = s;
    const r1 = closed ? (s + 1) % M : s + 1;
    for (let p = 0; p < N; p++) {
      const pNext = (p + 1) % N;
      const a = r0 * N + p;
      const b = r0 * N + pNext;
      const c = r1 * N + pNext;
      const d = r1 * N + p;
      index[cursor++] = a;
      index[cursor++] = b;
      index[cursor++] = c;
      index[cursor++] = a;
      index[cursor++] = c;
      index[cursor++] = d;
    }
  }
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    for (let p = 1; p < N - 1; p++) {
      index[cursor++] = startBase;
      index[cursor++] = startBase + p + 1;
      index[cursor++] = startBase + p;
      index[cursor++] = endBase;
      index[cursor++] = endBase + p;
      index[cursor++] = endBase + p + 1;
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i], y = position[i + 1], z = position[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const descriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    },
    groups: [{ start: 0, count: totalIndices, materialIndex: 0 }],
    materialKeys: [material],
    hash: composeLoftHash(sections, closed, material)
  };
  return Object.freeze(descriptor);
};
function composeLoftHash(sections, closed, material) {
  const parts = sections.map((s) => {
    const pf = s.profile.map((p) => `${p.u.toFixed(6)},${p.v.toFixed(6)}`).join(",");
    const o = `${s.worldOrigin.x.toFixed(6)},${s.worldOrigin.y.toFixed(6)},${s.worldOrigin.z.toFixed(6)}`;
    const r = `${s.right.x.toFixed(6)},${s.right.y.toFixed(6)},${s.right.z.toFixed(6)}`;
    const u = `${s.up.x.toFixed(6)},${s.up.y.toFixed(6)},${s.up.z.toFixed(6)}`;
    return `${o}|${r}|${u}|${pf}`;
  });
  return `${HASH_SCHEMA_VERSION$1}|c=${closed ? 1 : 0}|m=${material}|s=${parts.join("||")}`;
}
function sectionNormal(s) {
  return normalize(cross(s.right, s.up));
}
function vec(arr, idx) {
  return { x: arr[3 * idx], y: arr[3 * idx + 1], z: arr[3 * idx + 2] };
}
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

const HASH_SCHEMA_VERSION = "revolve:1";
const TWO_PI = Math.PI * 2;
const MIN_SEGMENTS = 3;
const produceRevolve = (profile, options = {}) => {
  if (profile.length < 2) {
    throw new DescriptorInvariantError(
      `produceRevolve: profile must have ≥ 2 points (got ${profile.length}).`
    );
  }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (!Number.isFinite(p.r) || !Number.isFinite(p.y)) {
      throw new DescriptorInvariantError(
        `produceRevolve: profile[${i}] non-finite (r=${p.r}, y=${p.y}).`
      );
    }
    if (p.r < -1e-12) {
      throw new DescriptorInvariantError(
        `produceRevolve: profile[${i}].r must be ≥ 0 (got ${p.r}).`
      );
    }
  }
  const segments = Math.max(MIN_SEGMENTS, Math.floor(options.segments ?? 24));
  const start = options.startAngle ?? 0;
  const end = options.endAngle ?? TWO_PI;
  const sweep = end - start;
  if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-9) {
    throw new DescriptorInvariantError("produceRevolve: sweep must be non-zero.");
  }
  const isFull = Math.abs(Math.abs(sweep) - TWO_PI) < 1e-6;
  const ringCount = isFull ? segments : segments + 1;
  const worldY = options.worldY ?? 0;
  const material = options.material ?? asMaterialKey("revolve|default");
  const N = profile.length;
  const sideVerts = N * ringCount;
  const capVerts = isFull ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);
  for (let r = 0; r < ringCount; r++) {
    const a = start + sweep * r / segments;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let p = 0; p < N; p++) {
      const v = r * N + p;
      const pp = profile[p];
      position[3 * v + 0] = pp.r * cos;
      position[3 * v + 1] = pp.y + worldY;
      position[3 * v + 2] = pp.r * sin;
      const t = profileTangent(profile, p);
      const rNx = t.dy;
      const rNy = -t.dr;
      const len = Math.hypot(rNx, rNy) || 1;
      const radialN = rNx / len;
      const verticalN = rNy / len;
      normal[3 * v + 0] = radialN * cos;
      normal[3 * v + 1] = verticalN;
      normal[3 * v + 2] = radialN * sin;
      uv[2 * v + 0] = r / segments;
      uv[2 * v + 1] = p / Math.max(1, N - 1);
    }
  }
  if (!isFull) {
    const startCos = Math.cos(start), startSin = Math.sin(start);
    const endCos = Math.cos(end), endSin = Math.sin(end);
    const capStartBase = sideVerts;
    const capEndBase = sideVerts + N;
    for (let p = 0; p < N; p++) {
      const pp = profile[p];
      const sIdx = capStartBase + p;
      const eIdx = capEndBase + p;
      position[3 * sIdx + 0] = pp.r * startCos;
      position[3 * sIdx + 1] = pp.y + worldY;
      position[3 * sIdx + 2] = pp.r * startSin;
      position[3 * eIdx + 0] = pp.r * endCos;
      position[3 * eIdx + 1] = pp.y + worldY;
      position[3 * eIdx + 2] = pp.r * endSin;
      normal[3 * sIdx + 0] = startSin;
      normal[3 * sIdx + 1] = 0;
      normal[3 * sIdx + 2] = -startCos;
      normal[3 * eIdx + 0] = -endSin;
      normal[3 * eIdx + 1] = 0;
      normal[3 * eIdx + 2] = endCos;
      uv[2 * sIdx + 0] = pp.r;
      uv[2 * sIdx + 1] = pp.y;
      uv[2 * eIdx + 0] = pp.r;
      uv[2 * eIdx + 1] = pp.y;
    }
  }
  const sideIndexCount = (N - 1) * segments * 6;
  const capIndexCount = isFull ? 0 : 2 * (N - 1) * 3;
  const totalIndices = sideIndexCount + capIndexCount;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);
  let cursor = 0;
  for (let s = 0; s < segments; s++) {
    const r0 = s;
    const r1 = isFull ? (s + 1) % ringCount : s + 1;
    for (let p = 0; p < N - 1; p++) {
      const a = r0 * N + p;
      const b = r0 * N + (p + 1);
      const c = r1 * N + (p + 1);
      const d = r1 * N + p;
      index[cursor++] = a;
      index[cursor++] = b;
      index[cursor++] = c;
      index[cursor++] = a;
      index[cursor++] = c;
      index[cursor++] = d;
    }
  }
  if (!isFull) {
    const capStartBase = sideVerts;
    const capEndBase = sideVerts + N;
    for (let p = 0; p < N - 1; p++) {
      index[cursor++] = capStartBase;
      index[cursor++] = capStartBase + p + 1;
      index[cursor++] = capStartBase + p;
      index[cursor++] = capEndBase;
      index[cursor++] = capEndBase + p;
      index[cursor++] = capEndBase + p + 1;
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i], y = position[i + 1], z = position[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const descriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    },
    groups: [{ start: 0, count: totalIndices, materialIndex: 0 }],
    materialKeys: [material],
    hash: composeRevolveHash(profile, segments, start, end, worldY, material)
  };
  return Object.freeze(descriptor);
};
function composeRevolveHash(profile, segments, start, end, worldY, material) {
  const verts = profile.map((p) => `${p.r.toFixed(6)},${p.y.toFixed(6)}`).join("|");
  return `${HASH_SCHEMA_VERSION}|s=${segments}|a=${start.toFixed(6)}|b=${end.toFixed(6)}|y=${worldY.toFixed(6)}|m=${material}|v=${verts}`;
}
function profileTangent(profile, i) {
  const prev = profile[Math.max(0, i - 1)];
  const next = profile[Math.min(profile.length - 1, i + 1)];
  return { dr: next.r - prev.r, dy: next.y - prev.y };
}

const UNIT_KIND = {
  mm: "length",
  cm: "length",
  m: "length",
  deg: "angle",
  rad: "angle"
};
const UNIT_NAMES = Object.freeze(Object.keys(UNIT_KIND));
const CANONICAL_LENGTH_UNIT = "mm";
const LENGTH_TO_CANONICAL = {
  mm: { mm: 1, cm: 10, m: 1e3 },
  m: { mm: 1e-3, cm: 0.01, m: 1 }
};
const ANGLE_TO_CANONICAL = {
  rad: 1,
  deg: Math.PI / 180
};
class UnitMismatchError extends Error {
  left;
  right;
  operation;
  constructor(details) {
    super(
      `[family-runtime/units] unit mismatch at ${JSON.stringify(details.operation)}: kind '${details.left}' and kind '${details.right}'` + (details.detail === void 0 ? "" : ` (${details.detail})`)
    );
    this.name = "UnitMismatchError";
    this.left = details.left;
    this.right = details.right;
    this.operation = details.operation;
  }
}
function toCanonical(value, unit) {
  if (unit === null) return value;
  if (UNIT_KIND[unit] === "angle") {
    return value * ANGLE_TO_CANONICAL[unit];
  }
  return value * LENGTH_TO_CANONICAL[CANONICAL_LENGTH_UNIT][unit];
}
function kindOf(unit) {
  return unit === null ? "scalar" : UNIT_KIND[unit];
}
function kindOfDataType(dataType) {
  switch (dataType) {
    case "length":
      return "length";
    case "angle":
      return "angle";
    case "number":
    case "count":
    case "boolean":
      return "scalar";
    case "string":
      return "unknown";
  }
}
function isPermissive(k) {
  return k === "scalar" || k === "unknown";
}
function unifyKinds(left, right, operation) {
  if (left === right) return left;
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "scalar") return right;
  if (right === "scalar") return left;
  throw new UnitMismatchError({
    left,
    right,
    operation,
    detail: "both operands of this operation must measure the same quantity"
  });
}
function multiplyKinds(left, right) {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "scalar") return right;
  if (right === "scalar") return left;
  if (left === "length" && right === "length") return "area";
  if (left === "length" && right === "area" || left === "area" && right === "length") return "volume";
  return "unknown";
}
function divideKinds(left, right) {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (right === "scalar") return left;
  if (left === right) return "scalar";
  if (left === "area" && right === "length") return "length";
  if (left === "volume" && right === "area") return "length";
  if (left === "volume" && right === "length") return "area";
  return "unknown";
}
function assertAngleArgument(k, fnName) {
  if (k === "angle" || isPermissive(k)) return;
  throw new UnitMismatchError({
    left: "angle",
    right: k,
    operation: fnName,
    detail: `${fnName}() takes an angle`
  });
}

class LexError extends Error {
  constructor(message, position) {
    super(`[family-runtime/lex] ${message} at position ${position}`);
    this.position = position;
    this.name = "LexError";
  }
  position;
}
const IDENT_HEAD = /[A-Za-z_]/;
const IDENT_TAIL = /[A-Za-z_0-9]/;
const DIGIT = /[0-9]/;
const UNIT_KEYWORDS = new Set(UNIT_NAMES);
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (i + 1 < src.length) {
      const two = src.slice(i, i + 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
        out.push({ kind: "cmp", op: two, start: i });
        i += 2;
        continue;
      }
    }
    if (c === "<" || c === ">") {
      out.push({ kind: "cmp", op: c, start: i });
      i += 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "(" || c === ")" || c === ",") {
      out.push({ kind: "op", op: c, start: i });
      i += 1;
      continue;
    }
    if (DIGIT.test(c) || c === "." && i + 1 < src.length && DIGIT.test(src[i + 1])) {
      const numTok = readNumber(src, i);
      out.push(numTok.token);
      i = numTok.next;
      continue;
    }
    if (IDENT_HEAD.test(c)) {
      let j = i + 1;
      while (j < src.length && IDENT_TAIL.test(src[j])) j += 1;
      const name = src.slice(i, j);
      out.push({ kind: "ident", name, start: i });
      i = j;
      continue;
    }
    throw new LexError(`unexpected character ${JSON.stringify(c)}`, i);
  }
  return out;
}
function readNumber(src, start) {
  let i = start;
  let sawDot = false;
  if (src[i] === ".") {
    sawDot = true;
    i += 1;
  }
  while (i < src.length) {
    const c = src[i];
    if (DIGIT.test(c)) {
      i += 1;
      continue;
    }
    if (c === ".") {
      if (sawDot) throw new LexError("invalid number: two dots", i);
      sawDot = true;
      i += 1;
      continue;
    }
    break;
  }
  const literal = src.slice(start, i);
  const value = Number(literal);
  if (!Number.isFinite(value)) {
    throw new LexError(`invalid numeric literal ${JSON.stringify(literal)}`, start);
  }
  let unit = null;
  let cursor = i;
  while (cursor < src.length) {
    const c = src[cursor];
    if (c === " " || c === "	") {
      cursor += 1;
      continue;
    }
    break;
  }
  const sawWhitespace = cursor !== i;
  if (cursor < src.length && IDENT_HEAD.test(src[cursor])) {
    let j = cursor + 1;
    while (j < src.length && IDENT_TAIL.test(src[j])) j += 1;
    const candidate = src.slice(cursor, j);
    if (UNIT_KEYWORDS.has(candidate)) {
      unit = candidate;
      i = j;
    } else if (!sawWhitespace) {
      throw new LexError(
        `unexpected identifier ${JSON.stringify(candidate)} after number; insert an operator or use a unit (${UNIT_NAMES.join(" | ")})`,
        cursor
      );
    }
  }
  return {
    token: { kind: "number", value, unit, start },
    next: i
  };
}

class ParseError extends Error {
  constructor(message, position) {
    super(`[family-runtime/parse] ${message} at position ${position}`);
    this.position = position;
    this.name = "ParseError";
  }
  position;
}
function parse(src) {
  const tokens = tokenize(src);
  if (tokens.length === 0) {
    throw new ParseError("empty expression", 0);
  }
  const state = { tokens, index: 0 };
  const ast = parseExpr(state);
  if (state.index !== tokens.length) {
    throw new ParseError(`unexpected token after expression`, tokens[state.index].start);
  }
  return ast;
}
function peek(state) {
  return state.index < state.tokens.length ? state.tokens[state.index] : null;
}
function consume(state) {
  const t = peek(state);
  if (t === null) {
    const last = state.tokens[state.tokens.length - 1];
    throw new ParseError("unexpected end of expression", last ? last.start : 0);
  }
  state.index += 1;
  return t;
}
function parseExpr(state) {
  return parseCompare(state);
}
function parseCompare(state) {
  const left = parseAddsub(state);
  const t = peek(state);
  if (t !== null && t.kind === "cmp") {
    consume(state);
    const right = parseAddsub(state);
    return { kind: "cmp", op: t.op, left, right };
  }
  return left;
}
function parseAddsub(state) {
  let left = parseMuldiv(state);
  while (true) {
    const t = peek(state);
    if (t !== null && t.kind === "op" && (t.op === "+" || t.op === "-")) {
      consume(state);
      const right = parseMuldiv(state);
      left = { kind: "arith", op: t.op, left, right };
      continue;
    }
    break;
  }
  return left;
}
function parseMuldiv(state) {
  let left = parseUnary(state);
  while (true) {
    const t = peek(state);
    if (t !== null && t.kind === "op" && (t.op === "*" || t.op === "/")) {
      consume(state);
      const right = parseUnary(state);
      left = { kind: "arith", op: t.op, left, right };
      continue;
    }
    break;
  }
  return left;
}
function parseUnary(state) {
  const t = peek(state);
  if (t !== null && t.kind === "op" && t.op === "-") {
    consume(state);
    const child = parseUnary(state);
    return { kind: "neg", child };
  }
  return parseCall(state);
}
function parseCall(state) {
  const t = peek(state);
  if (t !== null && t.kind === "ident") {
    const next = state.tokens[state.index + 1];
    if (next && next.kind === "op" && next.op === "(") {
      consume(state);
      consume(state);
      const args = [];
      const peeked = peek(state);
      if (!(peeked && peeked.kind === "op" && peeked.op === ")")) {
        args.push(parseExpr(state));
        while (true) {
          const sep = peek(state);
          if (sep && sep.kind === "op" && sep.op === ",") {
            consume(state);
            args.push(parseExpr(state));
            continue;
          }
          break;
        }
      }
      const close = peek(state);
      if (!(close && close.kind === "op" && close.op === ")")) {
        throw new ParseError(`expected ')' to close call to ${JSON.stringify(t.name)}`, close ? close.start : t.start);
      }
      consume(state);
      return { kind: "call", name: t.name, args };
    }
  }
  return parsePrimary(state);
}
function parsePrimary(state) {
  const t = peek(state);
  if (t === null) {
    throw new ParseError("unexpected end of expression", state.tokens[state.tokens.length - 1]?.start ?? 0);
  }
  if (t.kind === "number") {
    consume(state);
    return { kind: "number", value: t.value, unit: t.unit };
  }
  if (t.kind === "ident") {
    consume(state);
    return { kind: "ident", name: t.name };
  }
  if (t.kind === "op" && t.op === "(") {
    consume(state);
    const inner = parseExpr(state);
    const close = peek(state);
    if (!(close && close.kind === "op" && close.op === ")")) {
      throw new ParseError(`expected ')'`, close ? close.start : t.start);
    }
    consume(state);
    return inner;
  }
  throw new ParseError(`unexpected token`, t.start);
}
function collectIdentifiers(ast, into = /* @__PURE__ */ new Set()) {
  switch (ast.kind) {
    case "number":
      return into;
    case "ident":
      into.add(ast.name);
      return into;
    case "neg":
      return collectIdentifiers(ast.child, into);
    case "arith":
    case "cmp":
      collectIdentifiers(ast.left, into);
      collectIdentifiers(ast.right, into);
      return into;
    case "call":
      for (const a of ast.args) collectIdentifiers(a, into);
      return into;
  }
}

function variadic(reduce) {
  return (args) => {
    let acc = args[0];
    for (let i = 1; i < args.length; i += 1) acc = reduce(acc, args[i]);
    return acc;
  };
}
const BUILTIN_FUNCTIONS = Object.freeze({
  // `min`/`max` compare their arguments, so the arguments must measure the
  // same thing: `min(Width, Tilt)` is refused for the same reason
  // `Width + Tilt` is.
  min: { name: "min", minArgs: 1, maxArgs: 64, call: variadic(Math.min), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  max: { name: "max", minArgs: 1, maxArgs: 64, call: variadic(Math.max), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  if: {
    name: "if",
    minArgs: 3,
    maxArgs: 3,
    // `cond != 0` is treated as truthy.  Comparisons in the DSL
    // already evaluate to 0/1, so this is the natural composition.
    call: (args) => args[0] !== 0 ? args[1] : args[2],
    argKind: "any",
    // The two branches must agree — a conditional that returns a length on
    // one arm and an angle on the other has no single kind — but the
    // CONDITION is unconstrained, hence `unifyFrom: 1`.
    resultKind: "unify",
    unifyFrom: 1
  },
  // Trigonometry takes an angle and returns a ratio.  `sin(Width)` is a real
  // defect that currently evaluates silently to a plausible number.
  sin: { name: "sin", minArgs: 1, maxArgs: 1, call: (a) => Math.sin(a[0]), argKind: "angle", resultKind: "scalar", unifyFrom: 0 },
  cos: { name: "cos", minArgs: 1, maxArgs: 1, call: (a) => Math.cos(a[0]), argKind: "angle", resultKind: "scalar", unifyFrom: 0 },
  tan: { name: "tan", minArgs: 1, maxArgs: 1, call: (a) => Math.tan(a[0]), argKind: "angle", resultKind: "scalar", unifyFrom: 0 },
  // `sqrt` and `pow` change the DIMENSION of their argument in a way this
  // engine has no vocabulary for — `derived`, never a confident answer.
  sqrt: { name: "sqrt", minArgs: 1, maxArgs: 1, call: (a) => Math.sqrt(a[0]), argKind: "any", resultKind: "derived", unifyFrom: 0 },
  // The rounding family preserves what it is handed: |a length| is a length,
  // and rounding one does not make it dimensionless.
  abs: { name: "abs", minArgs: 1, maxArgs: 1, call: (a) => Math.abs(a[0]), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  round: { name: "round", minArgs: 1, maxArgs: 1, call: (a) => Math.round(a[0]), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  floor: { name: "floor", minArgs: 1, maxArgs: 1, call: (a) => Math.floor(a[0]), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  ceil: { name: "ceil", minArgs: 1, maxArgs: 1, call: (a) => Math.ceil(a[0]), argKind: "any", resultKind: "unify", unifyFrom: 0 },
  pow: { name: "pow", minArgs: 2, maxArgs: 2, call: (a) => Math.pow(a[0], a[1]), argKind: "any", resultKind: "derived", unifyFrom: 0 }
});
function lookupBuiltin(name) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_FUNCTIONS, name) ? BUILTIN_FUNCTIONS[name] : null;
}

const sinks = /* @__PURE__ */ new Set();
function emitSpan(record) {
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
    }
  }
}

function asQuantity(v) {
  return typeof v === "number" ? { value: v, kind: "scalar" } : v;
}
class ExpressionEvalError extends Error {
  code;
  constructor(code, message) {
    super(`[family-runtime/eval] ${message}`);
    this.name = "ExpressionEvalError";
    this.code = code;
  }
}
function evaluate(src, scope = {}) {
  let ast;
  try {
    ast = parse(src);
  } catch (e) {
    if (e instanceof ParseError || e instanceof LexError) {
      throw new ExpressionEvalError("parse", e.message);
    }
    throw e;
  }
  return evaluateAst(ast, scope, { src });
}
function evaluateAst(ast, scope, context = {}) {
  return evaluateAstQuantity(ast, scope, context).value;
}
function evaluateAstQuantity(ast, scope, context = {}) {
  const start = nowMs$1();
  let quantity;
  let value;
  let status = "ok";
  let errorMessage;
  try {
    quantity = walk(ast, scope);
    value = quantity.value;
    if (!Number.isFinite(value)) {
      throw new ExpressionEvalError("non-finite", `evaluation produced non-finite value ${value}`);
    }
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    emitSpan({
      name: "pryzm.family.parameter.evaluate",
      startedAt: Date.now(),
      durationMs: Math.max(0, nowMs$1() - start),
      status,
      attributes: spanAttrs(context, ast),
      ...errorMessage !== void 0 ? { errorMessage } : {}
    });
    throw err;
  }
  emitSpan({
    name: "pryzm.family.parameter.evaluate",
    startedAt: Date.now(),
    durationMs: Math.max(0, nowMs$1() - start),
    status,
    attributes: {
      ...spanAttrs(context, ast),
      "family.parameter.value": value,
      // The kind is on the span for the same reason it is on the return:
      // an observability surface that reports a value without its quantity
      // kind is the erasure again, one layer out.
      "family.parameter.quantityKind": quantity.kind
    }
  });
  return quantity;
}
function spanAttrs(ctx, ast) {
  const ids = Array.from(collectIdentifiers(ast)).sort().join(",");
  const out = {
    "family.parameter.identifierCount": ids === "" ? 0 : ids.split(",").length,
    "family.parameter.identifiers": ids
  };
  if (ctx.parameterId !== void 0) out["family.parameter.id"] = ctx.parameterId;
  if (ctx.src !== void 0) out["family.parameter.expression"] = ctx.src;
  return out;
}
function walk(ast, scope) {
  switch (ast.kind) {
    case "number":
      return { value: toCanonical(ast.value, ast.unit), kind: kindOf(ast.unit) };
    case "ident": {
      if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) {
        throw new ExpressionEvalError("unknown-identifier", `unknown identifier ${JSON.stringify(ast.name)}`);
      }
      const q = asQuantity(scope[ast.name]);
      if (!Number.isFinite(q.value)) {
        throw new ExpressionEvalError("non-finite", `identifier ${JSON.stringify(ast.name)} resolved to non-finite value ${q.value}`);
      }
      return q;
    }
    case "neg": {
      const c = walk(ast.child, scope);
      return { value: -c.value, kind: c.kind };
    }
    case "arith": {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      switch (ast.op) {
        // `+` and `-` are the operators that REQUIRE agreement — adding a
        // length to an angle is the mismatch spec §11 demands be detected.
        case "+":
          return { value: a.value + b.value, kind: unifyKinds(a.kind, b.kind, "+") };
        case "-":
          return { value: a.value - b.value, kind: unifyKinds(a.kind, b.kind, "-") };
        // `*` and `/` are the operators that BUILD derived kinds. They never
        // refuse: `Width * Height` is an area, and a rule that refused
        // unlike kinds here would refuse real formulas.
        case "*":
          return { value: a.value * b.value, kind: multiplyKinds(a.kind, b.kind) };
        case "/": {
          if (b.value === 0) throw new ExpressionEvalError("div-by-zero", `division by zero (${a.value} / 0)`);
          return { value: a.value / b.value, kind: divideKinds(a.kind, b.kind) };
        }
      }
      throw new ExpressionEvalError("parse", `unknown arithmetic op ${ast.op}`);
    }
    case "cmp": {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      unifyKinds(a.kind, b.kind, ast.op);
      const truth = (() => {
        switch (ast.op) {
          case "<":
            return a.value < b.value;
          case ">":
            return a.value > b.value;
          case "<=":
            return a.value <= b.value;
          case ">=":
            return a.value >= b.value;
          case "==":
            return a.value === b.value;
          case "!=":
            return a.value !== b.value;
        }
        throw new ExpressionEvalError("parse", `unknown comparison op ${ast.op}`);
      })();
      return { value: truth ? 1 : 0, kind: "scalar" };
    }
    case "call": {
      const fn = lookupBuiltin(ast.name);
      if (fn === null) {
        throw new ExpressionEvalError("unknown-function", `unknown function ${JSON.stringify(ast.name)}`);
      }
      if (ast.args.length < fn.minArgs || ast.args.length > fn.maxArgs) {
        const arityMsg = fn.minArgs === fn.maxArgs ? `expected ${fn.minArgs}` : `expected ${fn.minArgs}–${fn.maxArgs}`;
        throw new ExpressionEvalError("arity", `function ${JSON.stringify(fn.name)} got ${ast.args.length} args (${arityMsg})`);
      }
      const args = ast.args.map((a) => walk(a, scope));
      const kind = callResultKind(fn, args);
      const out = fn.call(args.map((a) => a.value));
      if (!Number.isFinite(out)) {
        throw new ExpressionEvalError("non-finite", `function ${JSON.stringify(fn.name)} produced non-finite value ${out}`);
      }
      return { value: out, kind };
    }
  }
}
function callResultKind(fn, args) {
  if (fn.argKind === "angle") {
    for (const a of args) assertAngleArgument(a.kind, fn.name);
  }
  switch (fn.resultKind) {
    case "scalar":
      return "scalar";
    case "unify": {
      const considered = args.slice(fn.unifyFrom);
      let acc = considered.length === 0 ? "scalar" : considered[0].kind;
      for (let i = 1; i < considered.length; i += 1) {
        acc = unifyKinds(acc, considered[i].kind, fn.name);
      }
      return acc;
    }
    case "derived":
      return args.every((a) => a.kind === "scalar") ? "scalar" : "unknown";
  }
}
function nowMs$1() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const NAME_RX = /^[A-Za-z][A-Za-z0-9_ ]{0,63}$/;
function resolveParameter(input) {
  const start = nowMs();
  const diagnostics = [];
  const { parameters } = input;
  const seen = /* @__PURE__ */ new Set();
  const byName = /* @__PURE__ */ new Map();
  for (const p of parameters) {
    if (!NAME_RX.test(p.name)) {
      diagnostics.push({
        severity: "error",
        code: "invalid-name",
        parameterId: p.id,
        message: `parameter name ${JSON.stringify(p.name)} does not match ^[A-Za-z][A-Za-z0-9_ ]{0,63}$`
      });
    }
    if (seen.has(p.name)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-name",
        parameterId: p.id,
        message: `duplicate parameter name ${JSON.stringify(p.name)}`
      });
    }
    seen.add(p.name);
    byName.set(p.name, p);
  }
  const compiled = [];
  for (const p of parameters) {
    if (p.expression === null || p.expression.trim() === "") {
      compiled.push({ param: p, ast: null, deps: [] });
      continue;
    }
    try {
      const ast = parse(p.expression);
      const deps = Array.from(collectIdentifiers(ast)).filter((d) => byName.has(d));
      compiled.push({ param: p, ast, deps });
    } catch (e) {
      const msg = e instanceof ParseError || e instanceof LexError ? e.message : String(e);
      diagnostics.push({
        severity: "error",
        code: "expression-parse",
        parameterId: p.id,
        message: msg
      });
      compiled.push({ param: p, ast: null, deps: [] });
    }
  }
  const inDegree = /* @__PURE__ */ new Map();
  const dependents = /* @__PURE__ */ new Map();
  for (const c of compiled) {
    inDegree.set(c.param.id, c.deps.length);
    for (const dep of c.deps) {
      const depParam = byName.get(dep);
      if (!depParam) continue;
      const list = dependents.get(depParam.id) ?? [];
      list.push(c.param.id);
      dependents.set(depParam.id, list);
    }
  }
  const ready = [];
  for (const [id, deg] of inDegree) if (deg === 0) ready.push(id);
  const order = [];
  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) ready.push(child);
    }
  }
  if (order.length !== compiled.length) {
    const cyclic = compiled.filter((c) => !order.includes(c.param.id)).map((c) => c.param);
    for (const p of cyclic) {
      diagnostics.push({
        severity: "error",
        code: "cycle",
        parameterId: p.id,
        message: `parameter ${JSON.stringify(p.name)} participates in a dependency cycle`
      });
    }
  }
  const values = {};
  const compiledById = new Map(compiled.map((c) => [c.param.id, c]));
  for (const id of order) {
    const c = compiledById.get(id);
    const p = c.param;
    const override = pickOverride(p, input.type, input.instanceOverrides);
    if (override !== void 0) {
      if (typeof override === "number" && !Number.isFinite(override)) {
        diagnostics.push({
          severity: "error",
          code: "invalid-override",
          parameterId: p.id,
          message: `non-finite override value ${override}`
        });
        continue;
      }
      values[p.name] = override;
      continue;
    }
    if (c.ast !== null && p.dataType !== "string") {
      if (p.defaultValue !== null) {
        diagnostics.push({
          severity: "warn",
          code: "superseded-default",
          parameterId: p.id,
          message: `parameter ${JSON.stringify(p.name)} carries BOTH an expression and a defaultValue ${JSON.stringify(p.defaultValue)}; per ADR-0376 D4 the expression wins and the default is dead. Re-run introduce-expression to record it as supersededDefault.`
        });
      }
      try {
        const kindedScope = {};
        for (const [k, v2] of Object.entries(values)) {
          if (typeof v2 !== "number") continue;
          const declaring = byName.get(k);
          if (declaring === void 0) continue;
          kindedScope[k] = { value: v2, kind: kindOfDataType(declaring.dataType) };
        }
        const v = evaluateAst(c.ast, kindedScope, { src: p.expression ?? void 0, parameterId: p.id });
        values[p.name] = v;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        diagnostics.push({
          severity: "error",
          code: unitAwareCode(e),
          parameterId: p.id,
          message: msg
        });
      }
      continue;
    }
    if (p.defaultValue !== null) {
      if (typeof p.defaultValue === "number" && !Number.isFinite(p.defaultValue)) {
        diagnostics.push({
          severity: "error",
          code: "invalid-default",
          parameterId: p.id,
          message: `non-finite default value ${p.defaultValue}`
        });
        continue;
      }
      values[p.name] = p.defaultValue;
      continue;
    }
  }
  const ok = !diagnostics.some((d) => d.severity === "error");
  emitSpan({
    name: "pryzm.family.bake.resolveType",
    startedAt: Date.now(),
    durationMs: Math.max(0, nowMs() - start),
    status: ok ? "ok" : "error",
    attributes: {
      "family.parameterCount": parameters.length,
      "family.typeId": input.type?.id ?? "",
      "family.typeName": input.type?.name ?? "",
      "family.resolvedCount": Object.keys(values).length,
      "family.diagnosticCount": diagnostics.length,
      "family.errorCount": diagnostics.filter((d) => d.severity === "error").length
    }
  });
  if (ok) {
    return { ok: true, values, order, diagnostics };
  }
  return { ok: false, diagnostics };
}
function unitAwareCode(e) {
  if (e instanceof UnitMismatchError) return "unit-mismatch";
  if (e instanceof ExpressionEvalError && e.code === "unknown-identifier") return "unknown-identifier";
  return "expression-eval";
}
function pickOverride(p, type, instance) {
  if (Object.prototype.hasOwnProperty.call(instance, p.id)) {
    return instance[p.id];
  }
  if (type && Object.prototype.hasOwnProperty.call(type.values, p.id)) {
    return type.values[p.id];
  }
  return void 0;
}
function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const RUNTIME_LENGTH_UNITS_PER_METRE = 1e3;
function runtimeLengthToMetres(value) {
  return value / RUNTIME_LENGTH_UNITS_PER_METRE;
}

class ProfileEvalError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ProfileEvalError";
  }
  code;
}
const MIN_POINTS = 3;
const MIN_CURVE_SEGMENTS = 2;
const MIN_CIRCLE_SEGMENTS = 3;
const MAX_CURVE_SEGMENTS = 512;
const REFERENCE_KEYS = ["p1", "p2", "center"];
function segmentsForSweep(radiusM, sweepRad, minimum = MIN_CURVE_SEGMENTS) {
  const sweep = Math.abs(sweepRad);
  if (!Number.isFinite(radiusM) || radiusM <= COINCIDENT_M) return minimum;
  const ratio = 1 - COINCIDENT_M / radiusM;
  const maxStepRad = 2 * Math.acos(Math.min(1, Math.max(-1, ratio)));
  if (!(maxStepRad > 0)) return MAX_CURVE_SEGMENTS;
  const n = Math.ceil(sweep / maxStepRad);
  if (!Number.isFinite(n)) return MAX_CURVE_SEGMENTS;
  return Math.min(MAX_CURVE_SEGMENTS, Math.max(minimum, n));
}
function profileToPolygon(profile, scope = {}) {
  const byId = /* @__PURE__ */ new Map();
  for (const e of profile.entities) byId.set(e.id, e);
  const referenced = /* @__PURE__ */ new Set();
  for (const e of profile.entities) {
    for (const key of REFERENCE_KEYS) {
      const v = e.data[key];
      if (typeof v === "string" && byId.has(v)) referenced.add(v);
    }
  }
  const emitted = [];
  const push = (p) => {
    const last2 = emitted[emitted.length - 1];
    if (last2) {
      if (last2.sourceId === p.sourceId && !last2.onCurve && !p.onCurve) return;
      if ((last2.onCurve || p.onCurve) && arePointsCoincident2D(last2.x, last2.z, p.x, p.z)) return;
    }
    emitted.push(p);
  };
  for (const e of profile.entities) {
    if (referenced.has(e.id)) continue;
    switch (e.kind) {
      case "point": {
        const { x, z } = readPointCoords(profile, e, scope);
        push({ x, z, sourceId: e.id, onCurve: false });
        break;
      }
      case "line": {
        for (const key of ["p1", "p2"]) {
          const target = resolveReference(profile, e, key, byId);
          const { x, z } = readPointCoords(profile, target, scope);
          push({ x, z, sourceId: target.id, onCurve: false });
        }
        break;
      }
      case "circle": {
        const centre = readPointCoords(profile, resolveReference(profile, e, "center", byId), scope);
        const radius = readLength(profile, e, "radius", scope);
        const segments = segmentsForSweep(radius, Math.PI * 2, MIN_CIRCLE_SEGMENTS);
        for (let i = 0; i < segments; i++) {
          const t = Math.PI * 2 * i / segments;
          push({
            x: centre.x + radius * Math.cos(t),
            z: centre.z + radius * Math.sin(t),
            sourceId: e.id,
            onCurve: true
          });
        }
        break;
      }
      case "arc": {
        const centre = readPointCoords(profile, resolveReference(profile, e, "center", byId), scope);
        const radius = readLength(profile, e, "radius", scope);
        const a0 = readAngle(profile, e, "startAngle", scope);
        const a1 = readAngle(profile, e, "endAngle", scope);
        const sweep = a1 - a0;
        const segments = segmentsForSweep(radius, sweep);
        for (let i = 0; i <= segments; i++) {
          const t = a0 + sweep * i / segments;
          push({
            x: centre.x + radius * Math.cos(t),
            z: centre.z + radius * Math.sin(t),
            sourceId: e.id,
            onCurve: true
          });
        }
        break;
      }
      case "spline": {
        throw new ProfileEvalError(
          "profile-needs-solver",
          `[profileToPolygon] profile ${profile.id} entity ${e.id} is a 'spline'; no spline control-point spelling is defined by ProfileEntitySchema or by the sketch surface, so the curve is not determined by the document.`
        );
      }
    }
  }
  const points = emitted.map((p) => ({ x: p.x, z: p.z }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > MIN_POINTS && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) {
    points.pop();
  }
  if (points.length < MIN_POINTS) {
    throw new ProfileEvalError(
      "profile-too-few-points",
      `[profileToPolygon] profile ${profile.id} resolved to ${points.length} unique points; need at least ${MIN_POINTS}.`
    );
  }
  return points;
}
function resolveReference(profile, entity, key, byId) {
  const raw = entity.data[key];
  if (typeof raw !== "string") {
    throw new ProfileEvalError(
      "profile-needs-solver",
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') has no '${key}' reference (got ${JSON.stringify(raw)}); the entity is not determined by the document. See §4D-ENTITY-READ-CONTRACT.`
    );
  }
  const target = byId.get(raw);
  if (!target) {
    throw new ProfileEvalError(
      "profile-needs-solver",
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') references '${key}'=${JSON.stringify(raw)}, which is not an entity of this profile; the entity is not determined by the document.`
    );
  }
  if (target.kind !== "point") {
    throw new ProfileEvalError(
      "profile-needs-solver",
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') references '${key}'=${target.id}, which is a '${target.kind}' and not a 'point'. See §4D-ENTITY-READ-CONTRACT.`
    );
  }
  return target;
}
function readPointCoords(profile, entity, scope) {
  return {
    x: readLength(profile, entity, "x", scope),
    z: readLength(profile, entity, "z", scope)
  };
}
function readLength(profile, entity, key, scope) {
  const raw = entity.data[key];
  if (typeof raw === "number") return finite(profile, entity, key, raw);
  if (typeof raw === "string") {
    return finite(profile, entity, key, runtimeLengthToMetres(evalExpression(profile, entity, key, raw, scope)));
  }
  throw missingKey(profile, entity, key, raw);
}
function readAngle(profile, entity, key, scope) {
  const raw = entity.data[key];
  if (typeof raw === "number") return finite(profile, entity, key, raw);
  if (typeof raw === "string") {
    return finite(profile, entity, key, evalExpression(profile, entity, key, raw, scope));
  }
  throw missingKey(profile, entity, key, raw);
}
function evalExpression(profile, entity, key, src, scope) {
  try {
    return evaluate(src, scope);
  } catch (err) {
    const detail = err instanceof ExpressionEvalError || err instanceof Error ? err.message : String(err);
    throw new ProfileEvalError(
      "profile-needs-solver",
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} key '${key}' holds expression ${JSON.stringify(src)} which did not evaluate against the resolved parameter scope: ${detail}`
    );
  }
}
function finite(profile, entity, key, v) {
  if (!Number.isFinite(v)) {
    throw new ProfileEvalError(
      "profile-non-finite-coord",
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} key '${key}' resolved to a non-finite value (${String(v)}).`
    );
  }
  return v;
}
function missingKey(profile, entity, key, raw) {
  return new ProfileEvalError(
    "profile-needs-solver",
    `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') has no numeric or expression value for '${key}' (got ${JSON.stringify(raw)}); the entity is under-determined. See §4D-ENTITY-READ-CONTRACT.`
  );
}

function adapterCapabilities(adapter) {
  const out = [];
  if (adapter.extrude) out.push("extrude");
  if (adapter.sweep) out.push("sweep");
  if (adapter.loft) out.push("loft");
  if (adapter.revolve) out.push("revolve");
  return out;
}
const kernelGeometryAdapter = {
  id: "@pryzm/geometry-kernel",
  extrude: (profile, heightM, options) => produceExtrude(profile, heightM, options),
  sweep: (profile, path, options) => produceSweep(profile, path, options),
  loft: (sections, options) => produceLoft(sections, options),
  revolve: (profile, options) => produceRevolve(profile, options)
};

const tracer = trace.getTracer("@pryzm/family-instance");
class FamilyBakeError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
    this.name = "FamilyBakeError";
  }
  code;
  diagnostics;
}
async function bakeFamilyInstance(input) {
  return tracer.startActiveSpan(
    "pryzm.family.bake.instance",
    {
      attributes: {
        "family.id": input.family.manifest.id,
        "family.semver": input.family.manifest.semver,
        "family.schemaHash": input.family.schemaHash,
        "family.typeId": input.typeId
      }
    },
    async (span) => {
      try {
        const { family, typeId } = input;
        const adapter = input.adapter ?? kernelGeometryAdapter;
        const fType = family.document.types.find((t) => t.id === typeId);
        if (!fType) {
          throw new FamilyBakeError(
            "unknown-type",
            `[bakeFamilyInstance] family ${family.manifest.id} has no type ${typeId}; available: ${family.document.types.map((t) => t.id).join(", ")}`
          );
        }
        const overrides = coerceOverrides(input.instanceOverrides ?? {});
        const numericTypeValues = {};
        for (const [k, v] of Object.entries(fType.values)) {
          numericTypeValues[k] = typeof v === "boolean" ? v ? 1 : 0 : v;
        }
        const ftype = { id: fType.id, name: fType.name, values: numericTypeValues };
        const parameters = family.document.parameters;
        const resolved = resolveParameter({
          parameters,
          type: ftype,
          instanceOverrides: overrides
        });
        if (!resolved.ok) {
          throw new FamilyBakeError(
            "resolver-failed",
            `[bakeFamilyInstance] resolver failed for type ${typeId} with ${resolved.diagnostics.length} diagnostic(s)`,
            resolved.diagnostics
          );
        }
        const values = resolved.values;
        const diagnostics = resolved.diagnostics;
        const scope = buildEvalScope(parameters, values);
        if (family.document.solids.length === 0) {
          throw new FamilyBakeError(
            "no-solids",
            `[bakeFamilyInstance] family ${family.manifest.id} has zero solids; cannot bake an instance.`
          );
        }
        const baked = [];
        const unsupported = [];
        for (const solid of family.document.solids) {
          const out = bakeOneSolid(solid, family.document, values, scope, adapter);
          if (out.ok) {
            baked.push(out.baked);
          } else {
            unsupported.push(out.unsupported);
          }
        }
        const ok = baked.length > 0;
        span.setAttributes({
          "family.bake.adapter": adapter.id,
          "family.bake.solidCount": family.document.solids.length,
          "family.bake.bakedCount": baked.length,
          "family.bake.unsupportedCount": unsupported.length,
          "family.bake.diagnosticCount": diagnostics.length
        });
        span.setStatus({ code: ok ? SpanStatusCode.OK : SpanStatusCode.ERROR });
        return { ok, baked, unsupported, resolvedValues: values, diagnostics };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        throw err;
      } finally {
        span.end();
      }
    }
  );
}
function buildEvalScope(parameters, values) {
  const kindByName = /* @__PURE__ */ new Map();
  for (const p of parameters) kindByName.set(p.name, kindOfDataType(p.dataType));
  const scope = {};
  for (const [name, v] of Object.entries(values)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    scope[name] = { value: v, kind: kindByName.get(name) ?? "scalar" };
  }
  return scope;
}
function refuse(solid, reason, message) {
  return { ok: false, unsupported: { solidId: solid.id, kind: solid.kind, reason, message } };
}
function bakeOneSolid(solid, document, values, scope, adapter) {
  switch (solid.kind) {
    case "extrude": {
      if (!adapter.extrude) return noCapability(solid, adapter);
      const profile = document.profiles.find((p) => p.id === solid.profileId);
      if (!profile) {
        return refuse(
          solid,
          "profile-eval-failed",
          `[bakeFamilyInstance] extrude solid ${solid.id} references missing profile ${solid.profileId}`
        );
      }
      let polygon;
      try {
        polygon = profileToPolygon(profile, scope);
      } catch (err) {
        const code = err instanceof ProfileEvalError ? err.code : "profile-eval-failed";
        return refuse(
          solid,
          code === "profile-needs-solver" ? "unsupported-feature" : "profile-eval-failed",
          err.message
        );
      }
      if (!isPlusY(solid.direction)) {
        return refuse(
          solid,
          "unsupported-feature",
          `[bakeFamilyInstance] extrude solid ${solid.id} asks for direction (${solid.direction.x}, ${solid.direction.y}, ${solid.direction.z}); the adapter's extrude capability builds along +Y only and would SILENTLY produce a vertical extrusion instead. Refused rather than substituted (spec §75). Closing it needs a direction/axis on ExtrudeOptions in @pryzm/geometry-kernel — see §4D-SCHEMA-DELTA.`
        );
      }
      const lengthRuntime = evalLengthExpression(solid.lengthExpression, values);
      if (lengthRuntime === null) {
        return refuse(
          solid,
          "invalid-length",
          `[bakeFamilyInstance] extrude solid ${solid.id} could not evaluate lengthExpression "${solid.lengthExpression}" against the resolved scope.`
        );
      }
      const heightM = runtimeLengthToMetres(lengthRuntime);
      if (!Number.isFinite(heightM) || heightM <= 0) {
        return refuse(
          solid,
          "invalid-length",
          `[bakeFamilyInstance] extrude solid ${solid.id} resolved heightM=${heightM} (lengthExpression=${solid.lengthExpression}); must be > 0.`
        );
      }
      const descriptor = adapter.extrude(polygon, heightM, {});
      return { ok: true, baked: { solidId: solid.id, kind: "extrude", descriptor } };
    }
    case "sweep":
      return refuse(
        solid,
        "unsupported-feature",
        `[bakeFamilyInstance] sweep solid ${solid.id}: the adapter '${adapter.id}' PROVIDES sweep, but the document cannot describe one. \`pathProfileId\` names a 2-D Profile bound to a ReferencePlane, and produceSweep needs a WORLD 3-D path; ReferencePlaneSchema carries {id, name, origin, normal, isHost} and NO in-plane basis, so the lift is short one rotational degree of freedom. \`options.closed\` has no field on the arm. This is a SCHEMA gap, not a solver gap and not a tessellation gap — see §4D-SCHEMA-DELTA.`
      );
    case "loft":
      return refuse(
        solid,
        "unsupported-feature",
        `[bakeFamilyInstance] loft solid ${solid.id}: the adapter '${adapter.id}' PROVIDES loft, but the document cannot describe one. produceLoft needs each section's \`right\` and \`up\` (the in-plane basis) and requires every section to carry the SAME vertex count; ReferencePlaneSchema persists no basis and \`profileIds[]\` states no arity rule. SCHEMA gap — see §4D-SCHEMA-DELTA.`
      );
    case "revolve":
      return refuse(
        solid,
        "unsupported-feature",
        `[bakeFamilyInstance] revolve solid ${solid.id}: the adapter '${adapter.id}' PROVIDES revolve, but the document cannot describe one. produceRevolve measures \`r\` from an AXIS it hard-wires to world +Y, and the revolve arm persists no axis; nor does the document record which profile ordinate is \`r\` and which is \`y\`. \`sweepDeg\` and \`segments\` ARE supplied. SCHEMA gap — see §4D-SCHEMA-DELTA.`
      );
    case "boolean":
      return refuse(
        solid,
        "unsupported-feature",
        `[bakeFamilyInstance] boolean solid ${solid.id}: \`produceBoolean\` exists and works, but evaluating a boolean feature requires a FEATURE-GRAPH ORDER — which solids are consumed by the boolean and therefore must not also appear in the output. \`featureEdges[]\` was added by lane 4B and DECLARED INERT (ADR-0376 D7 OPEN). Picking an evaluation order here would decide D7 by accident and freeze it. Refused pending D7.`
      );
  }
}
function noCapability(solid, adapter) {
  const caps = adapterCapabilities(adapter);
  return refuse(
    solid,
    "unsupported-feature",
    `[bakeFamilyInstance] solid ${solid.id} is kind '${solid.kind}' and the injected adapter '${adapter.id}' does not provide that capability (provides: ${caps.length > 0 ? caps.join(", ") : "none"}).`
  );
}
function isPlusY(d) {
  return isNumericallyZero(d.x) && isNumericallyZero(d.z) && d.y > 0;
}
function evalLengthExpression(expr, values) {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return null;
  const direct = values[trimmed];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  const literal = Number.parseFloat(trimmed);
  if (Number.isFinite(literal) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return literal;
  }
  return null;
}
function coerceOverrides(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === "boolean" ? v ? 1 : 0 : v;
  }
  return out;
}

export { FamilyBakeError, ProfileEvalError, RUNTIME_LENGTH_UNITS_PER_METRE, adapterCapabilities, bakeFamilyInstance, kernelGeometryAdapter, profileToPolygon, runtimeLengthToMetres, segmentsForSweep };
