// apps/editor — A.21.D17 Living Building Graph: the Canvas2D renderer.
//
// L5, P2-safe (Canvas 2D only — no THREE). DPR-aware. Draws, per the founder
// prototype's draw loop but RE-SKINNED for a WHITE canvas (dark text on light,
// NOT the prototype's dark surfaces):
//   • edges as quadratic curves, dashed per relationship LAYER, one stroke per
//     active layer the edge carries (so an adjacent+acoustic pair shows both),
//   • nodes as room-type-coloured circles sized by √area,
//   • a SUN halo (environmental layer) + an ACOUSTIC ring (acoustic layer),
//     each scaled by the node's metric,
//   • labels + an area badge,
//   • hit-testing (`pick`) for click → inspect.
//
// The renderer is stateless beyond the canvas/ctx + DPR; the overlay owns the
// graph, layer state, sim + interaction and calls `draw()` each frame.

import {
  EDGE_LAYER_COLOUR,
  ROOM_TYPE_COLOUR,
  type EdgeLayer,
  type GraphEdge,
  type GraphNode,
  type LayerState,
  type LiveGraph,
} from './livingGraphSchema';

const ACCENT = '#6600ff';

/** Per-layer dash pattern so layers are distinguishable without colour alone. */
const LAYER_DASH: Record<EdgeLayer, number[]> = {
  adjacency: [], // solid — physical touch
  circulation: [2, 4], // dotted — movement
  environmental: [8, 5], // long dash — sun aspect
  acoustic: [4, 4], // even dash — separation
  structural: [10, 3, 2, 3], // dash-dot — riser cluster
};

export interface DrawState {
  /** The currently focused (clicked) node id, if any. */
  focusedId: string | null;
  /** The currently hovered node id, if any. */
  hoveredId: string | null;
  /** Pan offset (canvas centre + this) — lets the overlay frame the field. */
  offsetX: number;
  offsetY: number;
}

export class LivingGraphCanvas {
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  /** Resize the backing store to the element box × DPR. */
  resize(): void {
    this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = this.canvas.clientWidth || 360;
    const h = this.canvas.clientHeight || 300;
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
  }

  /** Layout space is centred on the canvas + the overlay's pan offset. */
  private toScreen(n: GraphNode, st: DrawState): { x: number; y: number } {
    const cx = (this.canvas.clientWidth || 360) / 2 + st.offsetX;
    const cy = (this.canvas.clientHeight || 300) / 2 + st.offsetY;
    return { x: cx + n.x, y: cy + n.y };
  }

  /** Hit-test a client-space point → the nearest node within its radius. */
  pick(clientX: number, clientY: number, graph: LiveGraph, st: DrawState): GraphNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of graph.nodes) {
      const p = this.toScreen(n, st);
      const d = Math.hypot(p.x - mx, p.y - my);
      const hit = Math.max(n.radius, 14);
      if (d < hit && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Paint one frame. White canvas, dark text — brand. */
  draw(graph: LiveGraph, active: LayerState, st: DrawState): void {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth || 360;
    const H = this.canvas.clientHeight || 300;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // White card field with a faint lavender wash (brand, NOT dark).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const wash = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.max(W, H) * 0.7);
    wash.addColorStop(0, 'rgba(102,0,255,0.05)');
    wash.addColorStop(1, 'rgba(102,0,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    // 1) Edges — one curved, dashed stroke per ACTIVE layer the edge carries.
    ctx.lineCap = 'round';
    for (const e of graph.edges) {
      const from = byId.get(e.a);
      const to = byId.get(e.b);
      if (!from || !to) continue;
      const activeLayers = e.layers.filter((l) => active[l]);
      if (activeLayers.length === 0) continue;
      const a = this.toScreen(from, st);
      const b = this.toScreen(to, st);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Fan multiple active layers out with small parallel bows so they're all
      // visible (the prototype draws one curve per active relation).
      activeLayers.forEach((layer, idx) => {
        const spread = (idx - (activeLayers.length - 1) / 2) * 10;
        const bow = len * 0.12 + 6 + spread;
        const cxp = mx + nx * bow;
        const cyp = my + ny * bow;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cxp, cyp, b.x, b.y);
        ctx.strokeStyle = EDGE_LAYER_COLOUR[layer];
        ctx.setLineDash(LAYER_DASH[layer]);
        ctx.lineWidth = 1 + Math.min(2.4, e.weight * 0.8);
        ctx.stroke();
      });
    }
    ctx.setLineDash([]);

    // 2) Sun halos (environmental) + acoustic rings (acoustic), under the cores.
    for (const n of graph.nodes) {
      const p = this.toScreen(n, st);
      if (active.environmental && n.sunExposure > 0.4) {
        const haloR = n.radius + 6 + n.sunExposure * 22;
        const g = ctx.createRadialGradient(p.x, p.y, n.radius, p.x, p.y, haloR);
        g.addColorStop(0, `rgba(255,176,32,${0.05 + n.sunExposure * 0.22})`);
        g.addColorStop(1, 'rgba(255,176,32,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      if (active.acoustic && n.noiseLevel > 0.5) {
        const ringR = n.radius + 4 + n.noiseLevel * 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(225,75,140,${0.25 + n.noiseLevel * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3) Node cores — room-type colour, √area radius, focus/hover ring.
    for (const n of graph.nodes) {
      const p = this.toScreen(n, st);
      const isFocus = st.focusedId === n.id;
      const isHover = st.hoveredId === n.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = ROOM_TYPE_COLOUR[n.type];
      ctx.fill();
      ctx.lineWidth = isFocus ? 3 : isHover ? 2 : 1.25;
      ctx.strokeStyle = isFocus || isHover ? ACCENT : 'rgba(255,255,255,0.9)';
      ctx.stroke();
    }

    // 4) Labels + area badge — dark text on the white field.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of graph.nodes) {
      const p = this.toScreen(n, st);
      const strong = st.focusedId === n.id || st.hoveredId === n.id;
      ctx.font = strong ? '600 12px system-ui, sans-serif' : '500 11px system-ui, sans-serif';
      const ly = p.y - n.radius - 12;
      // Label pill.
      const text = n.label;
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = strong ? 'rgba(102,0,255,0.92)' : 'rgba(36,26,58,0.82)';
      roundRect(ctx, p.x - tw / 2, ly - 8, tw, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, p.x, ly);
      // Area badge inside the node when it's big enough.
      if (n.areaSqm > 0 && n.radius > 18) {
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText(`${n.areaSqm.toFixed(0)} m²`, p.x, p.y);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Re-export so the overlay's inspector can colour the type chip. */
export { ROOM_TYPE_COLOUR };
export type { GraphEdge };
