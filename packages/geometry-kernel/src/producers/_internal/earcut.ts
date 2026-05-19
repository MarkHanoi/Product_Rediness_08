// earcut — minimal pure-TS polygon triangulator (THREE-free).
//
// A trimmed port of the public-domain `mapbox/earcut` algorithm.
// Returns a flat list of vertex indices, three per triangle.  Supports
// a single outer ring with optional inner hole rings (rings flattened
// into one Vec2 array; `holeIndices[]` gives the start index of each
// hole).  Output indices are into the flat input array.
//
// We embed a slim copy here rather than pull in the npm package so the
// kernel keeps its zero-runtime-dependency property (P1 from
// `01-TARGET-ARCHITECTURE.md §0`).
//
// Algorithm reference: https://github.com/mapbox/earcut (ISC)

export function earcut(
  data: ReadonlyArray<number>,
  holeIndices?: ReadonlyArray<number>,
): number[] {
  const dim = 2;
  const hasHoles = holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices![0]! * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  let minX = 0, minY = 0, maxX = 0, maxY = 0, x = 0, y = 0, invSize = 0;

  if (hasHoles) outerNode = eliminateHoles(data, holeIndices!, outerNode, dim);

  // Compute z-order curve hashing bounds for large polygons.
  if (data.length > 80 * dim) {
    minX = maxX = data[0]!;
    minY = maxY = data[1]!;
    for (let i = dim; i < outerLen; i += dim) {
      x = data[i]!;
      y = data[i + 1]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
  return triangles;
}

interface Node {
  i: number;
  x: number;
  y: number;
  prev: Node;
  next: Node;
  z: number;
  prevZ: Node | null;
  nextZ: Node | null;
  steiner: boolean;
}

function linkedList(
  data: ReadonlyArray<number>,
  start: number,
  end: number,
  dim: number,
  clockwise: boolean,
): Node | null {
  let last: Node | null = null;
  if (clockwise === (signedArea(data, start, end, dim) > 0)) {
    for (let i = start; i < end; i += dim) last = insertNode(i, data[i]!, data[i + 1]!, last);
  } else {
    for (let i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i]!, data[i + 1]!, last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function filterPoints(start: Node | null, end?: Node): Node | null {
  if (!start) return start;
  if (!end) end = start;
  let p: Node = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}

function earcutLinked(
  ear: Node | null,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
  pass: number,
): void {
  if (!ear) return;
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

  let stop: Node = ear;
  let prev: Node, next: Node;

  while (ear.prev !== ear.next) {
    prev = ear.prev;
    next = ear.next;

    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }

    ear = next;

    if (ear === stop) {
      // try filtering and try again
      if (!pass) {
        const filtered = filterPoints(ear);
        if (filtered) earcutLinked(filtered, triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        const filtered = filterPoints(ear);
        ear = cureLocalIntersections(filtered!, triangles, dim);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }
      break;
    }
  }
}

function isEar(ear: Node): boolean {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x;
  const ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);

  let p = c.next;
  while (p !== a) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.next;
  }
  return true;
}

function isEarHashed(ear: Node, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x;
  const ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);

  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);

  let p = ear.prevZ;
  let n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
      p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.prevZ;
    if (
      n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 &&
      n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
      p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (
      n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 &&
      n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) return false;
    n = n.nextZ;
  }
  return true;
}

function cureLocalIntersections(start: Node, triangles: number[], dim: number): Node {
  let p: Node = start;
  do {
    const a = p.prev, b = p.next.next;
    if (
      !equals(a, b) &&
      intersects(a, p, p.next, b) &&
      locallyInside(a, b) &&
      locallyInside(b, a)
    ) {
      triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p)!;
}

function splitEarcut(
  start: Node,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
): void {
  let a: Node = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next)!;
        c = filterPoints(c, c.next)!;
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function eliminateHoles(
  data: ReadonlyArray<number>,
  holeIndices: ReadonlyArray<number>,
  outerNode: Node,
  dim: number,
): Node {
  const queue: Node[] = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i]! * dim;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1]! * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (list) {
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
  }
  queue.sort((a, b) => a.x - b.x);
  let outer = outerNode;
  for (const h of queue) outer = eliminateHole(h, outer);
  return outer;
}

function eliminateHole(hole: Node, outerNode: Node): Node {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next)!;
}

function findHoleBridge(hole: Node, outerNode: Node): Node | null {
  let p: Node = outerNode;
  const hx = hole.x, hy = hole.y;
  let qx = -Infinity, m: Node | null = null;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;
  const stop = m;
  const mx = m.x, my = m.y;
  let tanMin = Infinity, tan: number;
  p = m;
  do {
    if (
      hx >= p.x && p.x >= mx && hx !== p.x &&
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)
    ) {
      tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function sectorContainsSector(m: Node, p: Node): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

function indexCurve(start: Node, minX: number, minY: number, invSize: number): void {
  let p: Node = start;
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  p.prevZ!.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}

function sortLinked(list: Node): Node {
  let i: number, p: Node | null, q: Node | null, e: Node | null, tail: Node | null, numMerges: number, pSize: number, qSize: number;
  let inSize = 1;
  do {
    p = list;
    list = null as unknown as Node;
    tail = null;
    numMerges = 0;
    while (p) {
      numMerges++;
      q = p;
      pSize = 0;
      for (i = 0; i < inSize; i++) {
        pSize++;
        q = q.nextZ;
        if (!q) break;
      }
      qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p;
          p = p!.nextZ;
          pSize--;
        } else {
          e = q;
          q = q!.nextZ;
          qSize--;
        }
        if (tail) tail.nextZ = e;
        else list = e!;
        e!.prevZ = tail;
        tail = e;
      }
      p = q;
    }
    tail!.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}

function zOrder(x: number, y: number, minX: number, minY: number, invSize: number): number {
  let xi = ((x - minX) * invSize) | 0;
  let yi = ((y - minY) * invSize) | 0;
  xi = (xi | (xi << 8)) & 0x00ff00ff;
  xi = (xi | (xi << 4)) & 0x0f0f0f0f;
  xi = (xi | (xi << 2)) & 0x33333333;
  xi = (xi | (xi << 1)) & 0x55555555;
  yi = (yi | (yi << 8)) & 0x00ff00ff;
  yi = (yi | (yi << 4)) & 0x0f0f0f0f;
  yi = (yi | (yi << 2)) & 0x33333333;
  yi = (yi | (yi << 1)) & 0x55555555;
  return xi | (yi << 1);
}

function getLeftmost(start: Node): Node {
  let p: Node = start, leftmost: Node = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}

function pointInTriangle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  px: number, py: number,
): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
         (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
         (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

function isValidDiagonal(a: Node, b: Node): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) &&
      (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) ||
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0));
}

function area(p: Node, q: Node, r: Node): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p1: Node, p2: Node): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

function intersects(p1: Node, q1: Node, p2: Node, q2: Node): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function onSegment(p: Node, q: Node, r: Node): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
         q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function intersectsPolygon(a: Node, b: Node): boolean {
  let p: Node = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
        intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function locallyInside(a: Node, b: Node): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function middleInside(a: Node, b: Node): boolean {
  let p: Node = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
        (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) {
      inside = !inside;
    }
    p = p.next;
  } while (p !== a);
  return inside;
}

function splitPolygon(a: Node, b: Node): Node {
  const a2: Node = { i: a.i, x: a.x, y: a.y, prev: null as unknown as Node, next: null as unknown as Node, z: 0, prevZ: null, nextZ: null, steiner: false };
  const b2: Node = { i: b.i, x: b.x, y: b.y, prev: null as unknown as Node, next: null as unknown as Node, z: 0, prevZ: null, nextZ: null, steiner: false };
  const an = a.next, bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

function insertNode(i: number, x: number, y: number, last: Node | null): Node {
  const p: Node = { i, x, y, prev: null as unknown as Node, next: null as unknown as Node, z: 0, prevZ: null, nextZ: null, steiner: false };
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: Node): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function signedArea(data: ReadonlyArray<number>, start: number, end: number, dim: number): number {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j]! - data[i]!) * (data[i + 1]! + data[j + 1]!);
    j = i;
  }
  return sum;
}
