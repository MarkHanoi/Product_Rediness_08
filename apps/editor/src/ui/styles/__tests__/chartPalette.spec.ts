/**
 * §CHART-CATEGORICAL-SCALE (L-3001 · ADR-0343 §D.5 / §U.2 · SPEC §6) — the guard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE AND NOT A COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-0343 §U.2 refused to name eight hex values, on the grounds that asserting
 * CVD-safety without simulating it is "a hypothesis wearing the confidence of a
 * measurement". The values are named in `tokens.ts` now — so the simulation has
 * to be re-runnable, or the claim decays into exactly the comment §U.2 refused
 * to write.
 *
 * This file RE-DERIVES the colour-vision-deficiency simulation from the SHIPPED
 * token values on every run. Editing a hex in `tokens.ts` re-measures it here.
 * There is no baseline and no allowlist: a change that pushes two series closer
 * than the stated floor fails, and the failure message names the pair.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT ESTABLISHES, AND WHAT IT CANNOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Establishes: under the Machado/Oliveira/Fernandes (2009) severity-1.0 model,
 * every pair of series colours is separated by at least the stated CIEDE2000
 * floor in all three dichromacies, and the set spans a real lightness range.
 *
 * CANNOT establish: that a human with a CVD can read a specific chart. A
 * simulation model is a model. Nothing here paints a pixel, measures a rendered
 * colour, or tests a legend. The reason `tokens.ts` ALSO mandates a label and a
 * separator on every fill is that this arm is not, and cannot be, sufficient —
 * four of the eight are under 3:1 on white and are unreadable as hue alone.
 *
 * The maths is written out here rather than imported so the guard cannot be
 * satisfied by editing a shared helper: the assertion and its arithmetic move
 * together or not at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const TOKENS = join(REPO, 'apps/editor/src/ui/styles/tokens.ts');

// ── The floor, stated once ────────────────────────────────────────────────────
//
// 10.0 CIEDE2000. Measured today the set clears it at 11.13 (tritan, cat-2 vs
// cat-6). The floor is BELOW the measurement on purpose — it is a floor, not a
// pin, so an intentional hue tweak has room and an accidental collapse does not.
// ⛔ Lowering this number is not a fix. Every darker yellow tried for cat-8
// dropped the floor to ~1-5 by collapsing into the orange family; the answer was
// a different colour, never a smaller floor.
const MIN_DELTA_E = 10.0;

// ── Machado, Oliveira & Fernandes (2009), severity 1.0, linear sRGB ───────────
const MATRIX: Record<string, number[][]> = {
    normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** sRGB 0-255 → linear 0-1. */
function toLinear(v: number): number {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function simulate(hex: string, kind: string): [number, number, number] {
    const m = MATRIX[kind]!;
    const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
    return [
        m[0]![0]! * r + m[0]![1]! * g + m[0]![2]! * b,
        m[1]![0]! * r + m[1]![1]! * g + m[1]![2]! * b,
        m[2]![0]! * r + m[2]![1]! * g + m[2]![2]! * b,
    ];
}

/** Linear sRGB → CIE Lab (D65). */
function toLab(rgbLinear: [number, number, number]): [number, number, number] {
    const [r, g, b] = rgbLinear;
    let X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    let Y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.0;
    let Z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    [X, Y, Z] = [f(X), f(Y), f(Z)];
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function ciede2000(p: [number, number, number], q: [number, number, number]): number {
    const [L1, a1, b1] = p;
    const [L2, a2, b2] = q;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const ang = (x: number, y: number): number => {
        if (x === 0 && y === 0) return 0;
        const d = (Math.atan2(y, x) * 180) / Math.PI;
        return d < 0 ? d + 360 : d;
    };
    const h1p = ang(a1p, b1);
    const h2p = ang(a2p, b2);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp: number;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else {
        hbp = (h1p + h2p) / 2;
        if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 180 : -180;
    }
    const T = 1
        - 0.17 * Math.cos(((hbp - 30) * Math.PI) / 180)
        + 0.24 * Math.cos((2 * hbp * Math.PI) / 180)
        + 0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180)
        - 0.20 * Math.cos(((4 * hbp - 63) * Math.PI) / 180);
    const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
    return Math.sqrt(
        Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh),
    );
}

/** Read the shipped token values. The guard measures the PRODUCT, not a copy. */
function shippedPalette(): Array<{ name: string; hex: string }> {
    const src = readFileSync(TOKENS, 'utf8');
    const out: Array<{ name: string; hex: string }> = [];
    for (let i = 1; i <= 8; i++) {
        const m = new RegExp(`--app-cat-${i}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(src);
        expect(m, `--app-cat-${i} is not declared in tokens.ts`).not.toBeNull();
        out.push({ name: `--app-cat-${i}`, hex: m![1]!.toUpperCase() });
    }
    const u = /--app-cat-unassigned\s*:\s*(#[0-9a-fA-F]{6})\s*;/.exec(src);
    expect(u, '--app-cat-unassigned is not declared in tokens.ts').not.toBeNull();
    out.push({ name: '--app-cat-unassigned', hex: u![1]!.toUpperCase() });
    return out;
}

describe('§CHART-CATEGORICAL-SCALE — the eight series are CVD-separable', () => {
    const palette = shippedPalette();

    it('all nine roles are declared and distinct', () => {
        expect(palette).toHaveLength(9);
        expect(new Set(palette.map((p) => p.hex)).size).toBe(9);
    });

    it('series 1 is the brand accent — the scale leaves monochrome, it does not leave the brand', () => {
        expect(palette[0]!.hex).toBe('#6600FF');
    });

    for (const kind of ['normal', 'deutan', 'protan', 'tritan']) {
        it(`no two roles are closer than ΔE00 ${MIN_DELTA_E} under ${kind}`, () => {
            const labs = palette.map((p) => toLab(simulate(p.hex, kind)));
            let min = Infinity;
            let worst = '';
            for (let i = 0; i < palette.length; i++) {
                for (let j = i + 1; j < palette.length; j++) {
                    const d = ciede2000(labs[i]!, labs[j]!);
                    if (d < min) {
                        min = d;
                        worst = `${palette[i]!.name} (${palette[i]!.hex}) vs ${palette[j]!.name} (${palette[j]!.hex})`;
                    }
                }
            }
            // The failure message carries the pair, so a regression is actionable
            // rather than just red. (MEMORY §refusing-half-needs-its-escape-hatch.)
            expect(min, `closest pair under ${kind}: ${worst} → ΔE00 ${min.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
        });
    }

    it('lightness is a genuine second channel, not an accident', () => {
        // Every colour-blind-safe categorical scale earns its safety from L* as
        // much as from hue. If the spread ever collapses, the set has quietly
        // become hue-only even if the ΔE arms still pass.
        const Ls = palette.map((p) => toLab(simulate(p.hex, 'normal'))[0]).sort((a, b) => a - b);
        expect(Ls[Ls.length - 1]! - Ls[0]!).toBeGreaterThan(40);
    });

    it('tokens.ts states that colour is never the only channel', () => {
        // The low-contrast members are the reason. This asserts the RULE is
        // written where the values are, so the next person adding a chart reads
        // it at the point of use rather than in an ADR they will not open.
        const src = readFileSync(TOKENS, 'utf8');
        expect(src).toContain('COLOUR IS NEVER THE ONLY CHANNEL');
    });
});
