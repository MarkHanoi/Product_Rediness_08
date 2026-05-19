/**
 * PryzmIconsBasic.ts
 *
 * Basic architectural + tool-mode + landscape icons.
 * Part of the PryzmIcons split (WS-B S85-WIRE).
 * Re-exported via PryzmIcons.ts barrel — do not import this file directly.
 */
const BL  = 'fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"';
const BD  = 'fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"';
const BDD = 'fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2"';
const BP  = 'fill="none" stroke="currentColor" stroke-width="3"   stroke-linecap="round" stroke-linejoin="round"';

function blk(shapes: string, vb: string, size = 28): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" style="display:block">${shapes}</svg>`;
}

/** Re-size an icon SVG string without changing its internal geometry. */
export function sized(iconFn: string, size: number): string {
    const svgTagEnd = iconFn.indexOf('>');
    const svgTag    = iconFn.slice(0, svgTagEnd);
    const newTag    = svgTag
        .replace(/\bwidth="\d+"/, `width="${size}"`)
        .replace(/\bheight="\d+"/, `height="${size}"`);
    return newTag + iconFn.slice(svgTagEnd);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 1 — Wall · Slab · Door · Window
// ─────────────────────────────────────────────────────────────────────────────

export const wall = blk(`
<polygon points="15.1,9.2 77.6,33.9 77.6,95 15.1,70.3" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<polygon points="15.1,9.2 23.5,6.3 85.9,30.9 77.6,33.9" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
<polygon points="77.6,33.9 85.9,30.9 86,92 77.6,95" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
`, '-4 -4 108 108');

export const slab = blk(`
<polygon points="210,100 300,100 288,115 198,115" ${BL}/>
<polygon points="210,100 300,100 300,120 210,120" ${BL}/>
<polygon points="300,100 288,115 288,135 300,120" ${BL}/>
<polygon points="210,120 300,120 288,135 198,135" ${BL}/>
<line x1="222" y1="106" x2="278" y2="106" ${BDD}/>
<line x1="222" y1="109" x2="278" y2="109" ${BDD}/>
`, '196 98 107 40');

export const door = blk(`
<polygon points="385,60 375,70 375,150 385,140" ${BL}/>
<polygon points="375,150 465,150 475,140 385,140" ${BL}/>
<polygon points="385,65 428,65 428,140 385,140"  ${BL}/>
<polygon points="428,65 438,75 438,150 428,140"  ${BL}/>
<line x1="385" y1="65"  x2="465" y2="65"  ${BL}/>
<line x1="465" y1="65"  x2="465" y2="140" ${BL}/>
<line x1="465" y1="140" x2="385" y2="140" ${BL}/>
<circle cx="422" cy="102" r="2.5" ${BL}/>
<path d="M385,65 Q441,65 438,75" ${BDD}/>
<line x1="392" y1="82"  x2="421" y2="82"  ${BD}/>
<line x1="392" y1="128" x2="421" y2="128" ${BD}/>
<line x1="392" y1="82"  x2="392" y2="128" ${BD}/>
<line x1="421" y1="82"  x2="421" y2="128" ${BD}/>
`, '373 58 105 95');

export const windowIcon = blk(`
<polygon points="555,55 635,55 635,145 555,145" ${BL}/>
<polygon points="555,55 545,65 545,155 555,145" ${BL}/>
<polygon points="545,155 635,155 645,145 555,145" ${BL}/>
<polygon points="555,55 635,55 625,65 545,65"    ${BL}/>
<rect x="563" y="68" width="64" height="69" ${BL}/>
<line x1="595" y1="68"  x2="595" y2="137"  ${BD}/>
<line x1="563" y1="102" x2="627" y2="102"  ${BD}/>
<polygon points="555,68 563,68 563,137 555,137" ${BL}/>
<line x1="567" y1="72"  x2="577" y2="82"  ${BDD}/>
<line x1="598" y1="72"  x2="608" y2="82"  ${BDD}/>
<line x1="567" y1="106" x2="577" y2="116" ${BDD}/>
<line x1="598" y1="106" x2="608" y2="116" ${BDD}/>
`, '543 53 105 106');

// ─────────────────────────────────────────────────────────────────────────────
// ROW 2 — Curtain · Ceiling · Stair · Handrail
// ─────────────────────────────────────────────────────────────────────────────

export const curtainWall = blk(`
<line x1="0.0" y1="1.41" x2="94.65" y2="26.33" ${BP}/>
<line x1="0.0" y1="1.41" x2="0.0" y2="75.08" ${BP}/>
<line x1="0.51" y1="75.1" x2="94.85" y2="100.0" ${BP}/>
<line x1="94.75" y1="26.33" x2="94.75" y2="99.99" ${BP}/>
<line x1="5.35" y1="0.0" x2="100.0" y2="24.91" ${BD}/>
<line x1="99.84" y1="24.91" x2="99.84" y2="98.58" ${BD}/>
<line x1="94.75" y1="26.46" x2="99.97" y2="24.91" ${BD}/>
<line x1="0.25" y1="1.55" x2="5.47" y2="0.0" ${BD}/>
<line x1="94.75" y1="99.62" x2="99.97" y2="98.07" ${BD}/>
<line x1="1.66" y1="3.27" x2="31.09" y2="10.85" ${BL}/>
<line x1="1.4" y1="26.06" x2="31.0" y2="33.73" ${BL}/>
<line x1="31.09" y1="10.87" x2="30.95" y2="33.59" ${BL}/>
<line x1="1.54" y1="3.27" x2="1.4" y2="25.99" ${BL}/>
<line x1="2.93" y1="4.86" x2="2.93" y2="25.35" ${BL}/>
<line x1="29.42" y1="11.57" x2="29.42" y2="32.19" ${BL}/>
<line x1="2.93" y1="4.86" x2="29.52" y2="11.77" ${BL}/>
<line x1="2.93" y1="25.36" x2="29.52" y2="32.33" ${BL}/>
<line x1="1.4" y1="27.48" x2="30.84" y2="35.06" ${BL}/>
<line x1="1.15" y1="50.09" x2="30.75" y2="57.76" ${BL}/>
<line x1="30.83" y1="34.9" x2="30.69" y2="57.62" ${BL}/>
<line x1="1.29" y1="27.3" x2="1.15" y2="50.02" ${BL}/>
<line x1="2.93" y1="28.89" x2="2.93" y2="49.38" ${BL}/>
<line x1="29.16" y1="35.6" x2="29.16" y2="56.23" ${BL}/>
<line x1="2.67" y1="28.89" x2="29.26" y2="35.8" ${BL}/>
<line x1="2.93" y1="49.39" x2="29.52" y2="56.36" ${BL}/>
<line x1="1.15" y1="51.15" x2="30.58" y2="58.74" ${BL}/>
<line x1="0.89" y1="73.77" x2="30.49" y2="81.44" ${BL}/>
<line x1="30.58" y1="58.75" x2="30.44" y2="81.47" ${BL}/>
<line x1="1.03" y1="51.15" x2="0.89" y2="73.87" ${BL}/>
<line x1="2.67" y1="52.74" x2="2.67" y2="73.24" ${BL}/>
<line x1="28.91" y1="59.46" x2="28.91" y2="80.08" ${BL}/>
<line x1="2.42" y1="52.74" x2="29.01" y2="59.66" ${BL}/>
<line x1="2.67" y1="73.24" x2="29.26" y2="80.21" ${BL}/>
<line x1="32.47" y1="11.57" x2="61.91" y2="19.15" ${BL}/>
<line x1="32.22" y1="34.19" x2="61.82" y2="41.86" ${BL}/>
<line x1="61.91" y1="19.17" x2="61.77" y2="41.89" ${BL}/>
<line x1="32.62" y1="11.4" x2="32.47" y2="34.12" ${BL}/>
<line x1="34.0" y1="12.99" x2="34.0" y2="33.48" ${BL}/>
<line x1="60.49" y1="19.7" x2="60.49" y2="40.32" ${BL}/>
<line x1="33.75" y1="12.99" x2="60.34" y2="19.9" ${BL}/>
<line x1="34.0" y1="33.48" x2="60.59" y2="40.46" ${BL}/>
<line x1="32.47" y1="35.6" x2="61.91" y2="43.19" ${BL}/>
<line x1="32.22" y1="58.22" x2="61.82" y2="65.89" ${BL}/>
<line x1="61.91" y1="43.2" x2="61.77" y2="65.92" ${BL}/>
<line x1="32.36" y1="35.43" x2="32.22" y2="58.15" ${BL}/>
<line x1="33.75" y1="37.02" x2="33.75" y2="57.51" ${BL}/>
<line x1="60.24" y1="43.73" x2="60.24" y2="64.35" ${BL}/>
<line x1="33.75" y1="37.02" x2="60.34" y2="43.93" ${BL}/>
<line x1="33.75" y1="57.52" x2="60.34" y2="64.49" ${BL}/>
<line x1="32.22" y1="59.28" x2="61.66" y2="66.86" ${BL}/>
<line x1="31.97" y1="82.08" x2="61.57" y2="89.74" ${BL}/>
<line x1="61.65" y1="66.88" x2="61.51" y2="89.6" ${BL}/>
<line x1="32.11" y1="59.28" x2="31.97" y2="82.0" ${BL}/>
<line x1="33.49" y1="60.87" x2="33.49" y2="81.37" ${BL}/>
<line x1="59.98" y1="67.59" x2="59.98" y2="88.21" ${BL}/>
<line x1="33.49" y1="60.87" x2="60.08" y2="67.78" ${BL}/>
<line x1="33.49" y1="81.37" x2="60.08" y2="88.34" ${BL}/>
<line x1="63.55" y1="19.7" x2="92.99" y2="27.28" ${BL}/>
<line x1="63.29" y1="42.32" x2="92.9" y2="49.99" ${BL}/>
<line x1="92.98" y1="27.3" x2="92.84" y2="50.02" ${BL}/>
<line x1="63.43" y1="19.53" x2="63.29" y2="42.24" ${BL}/>
<line x1="64.82" y1="21.12" x2="64.82" y2="41.61" ${BL}/>
<line x1="91.31" y1="27.83" x2="91.31" y2="48.45" ${BL}/>
<line x1="64.82" y1="21.12" x2="91.41" y2="28.03" ${BL}/>
<line x1="64.82" y1="41.61" x2="91.41" y2="48.59" ${BL}/>
<line x1="63.29" y1="43.73" x2="92.73" y2="51.31" ${BL}/>
<line x1="63.04" y1="66.35" x2="92.64" y2="74.02" ${BL}/>
<line x1="92.73" y1="51.33" x2="92.58" y2="74.05" ${BL}/>
<line x1="63.43" y1="43.56" x2="63.29" y2="66.28" ${BL}/>
<line x1="64.82" y1="45.15" x2="64.82" y2="65.64" ${BL}/>
<line x1="91.06" y1="51.86" x2="91.06" y2="72.48" ${BL}/>
<line x1="64.57" y1="45.15" x2="91.16" y2="52.06" ${BL}/>
<line x1="64.82" y1="65.64" x2="91.41" y2="72.62" ${BL}/>
<line x1="63.04" y1="67.59" x2="92.48" y2="75.17" ${BL}/>
<line x1="62.78" y1="90.2" x2="92.39" y2="97.87" ${BL}/>
<line x1="92.47" y1="75.01" x2="92.33" y2="97.73" ${BL}/>
<line x1="63.18" y1="67.41" x2="63.04" y2="90.13" ${BL}/>
<line x1="64.57" y1="69.0" x2="64.57" y2="89.49" ${BL}/>
<line x1="90.8" y1="75.72" x2="90.8" y2="96.34" ${BL}/>
<line x1="64.31" y1="69.0" x2="90.9" y2="75.91" ${BL}/>
<line x1="64.57" y1="89.5" x2="91.16" y2="96.47" ${BL}/>
`, '-4 -4 108 108');

export const ceiling = blk(`
<polygon points="210,72 300,72 288,84 198,84" ${BL}/>
<polygon points="210,72 300,72 300,88 210,88" ${BL}/>
<polygon points="300,72 288,84 288,100 300,88" ${BL}/>
<polygon points="198,84 288,84 288,100 198,100" ${BL}/>
<line x1="222" y1="88" x2="278" y2="88" ${BDD}/>
<line x1="240" y1="84" x2="240" y2="100" ${BDD}/>
<line x1="260" y1="84" x2="260" y2="100" ${BDD}/>
`, '196 70 107 33');

export const stair = blk(`
<polygon points="415,154 445,154 445,164 415,164" ${BL}/>
<polygon points="445,154 455,146 455,156 445,164" ${BL}/>
<polygon points="415,164 445,164 455,156 425,156" ${BL}/>
<polygon points="415,144 445,144 445,154 415,154" ${BL}/>
<polygon points="445,144 455,136 455,156 445,154" ${BL}/>
<polygon points="415,144 445,144 455,136 425,136" ${BL}/>
<polygon points="415,134 445,134 445,144 415,144" ${BL}/>
<polygon points="415,124 445,124 445,134 415,134" ${BL}/>
<polygon points="445,124 455,116 455,136 445,134" ${BL}/>
<polygon points="415,124 445,124 455,116 425,116" ${BL}/>
<polygon points="415,114 445,114 445,124 415,124" ${BL}/>
<polygon points="415,104 445,104 445,114 415,114" ${BL}/>
<polygon points="445,104 455,96  455,116 445,114" ${BL}/>
<polygon points="415,104 445,104 455,96  425,96"  ${BL}/>
<polygon points="415,94  445,94  445,104 415,104" ${BL}/>
<polygon points="415,84  445,84  445,94  415,94"  ${BL}/>
<polygon points="445,84  455,76  455,96  445,94"  ${BL}/>
<polygon points="415,84  445,84  455,76  425,76"  ${BL}/>
`, '413 74 46 93');

export const stairL = blk(`
<path d="M5,80 L5,5 L38,5 L38,50 L80,50 L80,80 Z" ${BL}/>
<line x1="5"  y1="15" x2="38" y2="15" ${BD}/>
<line x1="5"  y1="25" x2="38" y2="25" ${BD}/>
<line x1="5"  y1="35" x2="38" y2="35" ${BD}/>
<line x1="5"  y1="45" x2="38" y2="45" ${BD}/>
<line x1="52" y1="50" x2="52" y2="80" ${BD}/>
<line x1="64" y1="50" x2="64" y2="80" ${BD}/>
<line x1="76" y1="50" x2="76" y2="80" ${BD}/>
<polyline points="18,47 18,38 22,41" ${BD}/>
<polyline points="60,60 66,60 63,65" ${BD}/>
`, '0 0 85 85');

export const stairU = blk(`
<path d="M5,80 L5,5 L88,5 L88,80 L55,80 L55,50 L38,50 L38,80 Z" ${BL}/>
<line x1="5"  y1="58" x2="38" y2="58" ${BD}/>
<line x1="5"  y1="66" x2="38" y2="66" ${BD}/>
<line x1="5"  y1="74" x2="38" y2="74" ${BD}/>
<line x1="55" y1="58" x2="88" y2="58" ${BD}/>
<line x1="55" y1="66" x2="88" y2="66" ${BD}/>
<line x1="55" y1="74" x2="88" y2="74" ${BD}/>
<line x1="38" y1="50" x2="55" y2="50" ${BDD}/>
<polyline points="18,54 18,44 22,48" ${BD}/>
<polyline points="72,54 72,44 68,48" ${BD}/>
`, '0 0 93 85');

export const handrail = blk(`
<polygon points="558,148 564,148 564,120 558,120" ${BL}/>
<polygon points="558,120 564,120 566,118 560,118" ${BL}/>
<polygon points="564,120 566,118 566,146 564,148" ${BL}/>
<polygon points="580,130 586,130 586,102 580,102" ${BL}/>
<polygon points="580,102 586,102 588,100 582,100" ${BL}/>
<polygon points="586,102 588,100 588,128 586,130" ${BL}/>
<polygon points="602,112 608,112 608,84  602,84"  ${BL}/>
<polygon points="602,84  608,84  610,82  604,82"  ${BL}/>
<polygon points="608,84  610,82  610,110 608,112" ${BL}/>
<line x1="548" y1="148" x2="572" y2="148" ${BDD}/>
<line x1="570" y1="130" x2="594" y2="130" ${BDD}/>
<line x1="592" y1="112" x2="616" y2="112" ${BDD}/>
<polygon points="556,118 610,82  618,86  564,122" ${BL}/>
<polygon points="564,122 618,86  618,92  564,128" ${BL}/>
<polygon points="556,118 564,122 564,128 556,124" ${BL}/>
<polygon points="610,82  618,86  618,92  610,88"  ${BL}/>
`, '545 80 76 72');

// ─────────────────────────────────────────────────────────────────────────────
// ROW 3 — Ramp · Column · Beam · Roof
// ─────────────────────────────────────────────────────────────────────────────

export const ramp = blk(`
<polygon points="38,148 128,148 116,160 26,160"   ${BL}/>
<polygon points="38,148 128,100 116,112 26,160"   ${BL}/>
<polygon points="38,148 128,100 128,108 38,156"   ${BL}/>
<polygon points="128,100 116,112 116,120 128,108" ${BL}/>
<polygon points="26,160  116,112 116,120 26,168"  ${BL}/>
<line x1="48"  y1="153" x2="118" y2="109" ${BDD}/>
<line x1="60"  y1="158" x2="118" y2="116" ${BDD}/>
<line x1="72"  y1="163" x2="118" y2="123" ${BDD}/>
<line x1="72"  y1="138" x2="98"  y2="120" ${BD}/>
<polyline points="90,117 98,120 95,128" ${BD}/>
`, '23 98 109 74');

export const column = blk(`
<polygon points="218,148 292,148 280,158 206,158" ${BL}/>
<polygon points="218,142 292,142 292,148 218,148" ${BL}/>
<polygon points="218,142 292,142 280,152 206,152" ${BL}/>
<polygon points="292,142 280,152 280,158 292,148" ${BL}/>
<polygon points="281,95  289,89  289,141 281,141" ${BL}/>
<polygon points="229,95  281,95  281,141 229,141" ${BL}/>
<polygon points="229,95  281,95  269,105 217,105" ${BL}/>
<polygon points="218,58  292,58  292,64  218,64"  ${BL}/>
<polygon points="218,58  292,58  280,68  206,68"  ${BL}/>
<polygon points="292,58  280,68  280,74  292,64"  ${BL}/>
<polygon points="229,64  281,64  281,95  229,95"  ${BL}/>
<polygon points="229,64  281,64  269,74  217,74"  ${BL}/>
`, '204 56 90 106');

export const beam = blk(`
<polygon points="383,108 391,104 391,122 383,126" ${BL}/>
<polygon points="383,108 391,104 475,80  467,84"  ${BL}/>
<polygon points="383,126 467,102 475,98  391,122" ${BL}/>
<polygon points="391,122 475,98  475,112 391,136" ${BL}/>
<polygon points="475,98  483,94  483,108 475,112" ${BL}/>
<polygon points="391,136 475,112 483,108 399,132" ${BL}/>
<circle cx="388" cy="126" r="2.5" ${BD}/>
<circle cx="470" cy="103" r="2.5" ${BD}/>
`, '381 78 105 62');

export const roof = blk(`
<polygon points="548,148 564,148 564,110 548,110" ${BL}/>
<polygon points="548,110 564,110 572,104 556,104" ${BL}/>
<polygon points="626,124 642,124 642,86  626,86"  ${BL}/>
<polygon points="626,86  642,86  650,80  634,80"  ${BL}/>
<polygon points="548,110 626,86  626,94  548,118" ${BL}/>
<polygon points="626,86  642,80  642,88  626,94"  ${BL}/>
<polygon points="548,110 556,104 634,80  626,86"  ${BL}/>
<polygon points="548,118 626,94  626,98  548,122" ${BL}/>
<line x1="556" y1="112" x2="626" y2="89"  ${BDD}/>
<line x1="563" y1="114" x2="626" y2="92"  ${BDD}/>
<line x1="570" y1="116" x2="626" y2="95"  ${BDD}/>
<line x1="572" y1="108" x2="565" y2="120" ${BDD}/>
<line x1="590" y1="102" x2="583" y2="114" ${BDD}/>
<line x1="608" y1="96"  x2="601" y2="108" ${BDD}/>
`, '546 78 107 73');

// ─────────────────────────────────────────────────────────────────────────────
// ROW 4 — Column (interior) · Bed · Sofa · Chair
// ─────────────────────────────────────────────────────────────────────────────

export const columnInterior = blk(`
<polygon points="55,148 115,148 125,140 65,140" ${BL}/>
<polygon points="55,148 115,148 115,154 55,154" ${BL}/>
<polygon points="115,148 125,140 125,146 115,154" ${BL}/>
<polygon points="68,80  102,80  102,140 68,140"  ${BL}/>
<polygon points="102,80  112,72  112,132 102,140" ${BL}/>
<polygon points="68,80  102,80  112,72  78,72"   ${BL}/>
<polygon points="55,72  115,72  125,64  65,64"   ${BL}/>
<polygon points="55,72  115,72  115,80  55,80"   ${BL}/>
<polygon points="115,72  125,64  125,72  115,80" ${BL}/>
`, '53 62 78 95');

export const bed = blk(`
<polygon points="198,148 288,148 300,138 210,138" ${BL}/>
<polygon points="198,100 288,100 288,148 198,148" ${BL}/>
<polygon points="288,100 300,90  300,138 288,148" ${BL}/>
<polygon points="202,96  286,96  298,86  214,86"  ${BL}/>
<polygon points="202,96  286,96  286,104 202,104" ${BL}/>
<polygon points="286,96  298,86  298,94  286,104" ${BL}/>
<polygon points="198,100 288,100 298,90  208,90"  ${BL}/>
<polygon points="198,90  208,90  208,100 198,100" ${BL}/>
<line x1="198" y1="148" x2="198" y2="158" ${BL}/>
<line x1="288" y1="148" x2="288" y2="158" ${BL}/>
<line x1="300" y1="138" x2="300" y2="148" ${BL}/>
`, '196 84 107 77');

export const sofa = blk(`
<polygon points="382,118 472,118 472,148 382,148" ${BL}/>
<polygon points="382,118 472,118 484,108 394,108" ${BL}/>
<polygon points="472,118 484,108 484,138 472,148" ${BL}/>
<polygon points="382,88  394,88  394,118 382,118" ${BL}/>
<polygon points="382,88  394,88  406,78  394,78"  ${BL}/>
<polygon points="394,88  406,78  406,108 394,108" ${BL}/>
<polygon points="460,88  472,88  472,118 460,118" ${BL}/>
<polygon points="460,88  472,88  484,78  472,78"  ${BL}/>
<polygon points="472,88  484,78  484,108 472,118" ${BL}/>
<polygon points="465,88  477,88  477,78  465,78"  ${BL}/>
<line x1="420" y1="118" x2="420" y2="88"  ${BDD}/>
<line x1="420" y1="108" x2="432" y2="98"  ${BDD}/>
<line x1="382" y1="148" x2="382" y2="158" ${BL}/>
<line x1="458" y1="148" x2="458" y2="158" ${BL}/>
<line x1="470" y1="138" x2="470" y2="148" ${BL}/>
`, '380 76 108 86');

export const chair = blk(`
<polygon points="558,118 618,118 618,138 558,138" ${BL}/>
<polygon points="558,118 618,118 630,108 568,108" ${BL}/>
<polygon points="618,118 630,108 630,128 618,138" ${BL}/>
<polygon points="558,78  618,78  618,118 558,118" ${BL}/>
<polygon points="558,78  618,78  630,68  568,68"  ${BL}/>
<polygon points="618,78  630,68  630,108 618,118" ${BL}/>
<polygon points="558,98  568,98  568,118 558,118" ${BL}/>
<polygon points="558,98  568,98  580,88  570,88"  ${BL}/>
<polygon points="568,98  580,88  580,108 568,118" ${BL}/>
<polygon points="618,98  630,98  630,118 618,118" ${BL}/>
<polygon points="618,98  630,98  630,88  618,88"  ${BL}/>
<line x1="563" y1="138" x2="563" y2="158" ${BL}/>
<line x1="613" y1="138" x2="613" y2="158" ${BL}/>
<line x1="625" y1="128" x2="625" y2="148" ${BL}/>
`, '556 66 78 95');

// ─────────────────────────────────────────────────────────────────────────────
// ROW 5 — Table · Shelf · Child Toy · Computer
// ─────────────────────────────────────────────────────────────────────────────

export const table = blk(`
<polygon points="45,90  125,90  137,80  57,80" ${BL}/>
<polygon points="45,90  125,90  125,98  45,98" ${BL}/>
<polygon points="125,90  137,80  137,88  125,98" ${BL}/>
<line x1="53"  y1="98"  x2="53"  y2="155" ${BL}/>
<line x1="117" y1="98"  x2="117" y2="155" ${BL}/>
<line x1="129" y1="88"  x2="129" y2="145" ${BL}/>
<line x1="53"  y1="134" x2="117" y2="134" ${BD}/>
<line x1="117" y1="134" x2="129" y2="124" ${BD}/>
`, '42 78 98 80');

export const shelf = blk(`
<polygon points="200,60  290,60  290,155 200,155" ${BL}/>
<polygon points="200,60  290,60  302,50  212,50"  ${BL}/>
<polygon points="290,60  302,50  302,145 290,155" ${BL}/>
<polygon points="200,85  290,85  302,75  212,75"  ${BL}/>
<polygon points="200,85  290,85  290,91  200,91"  ${BL}/>
<polygon points="290,85  302,75  302,81  290,91"  ${BL}/>
<polygon points="200,115 290,115 302,105 212,105" ${BL}/>
<polygon points="200,115 290,115 290,121 200,121" ${BL}/>
<polygon points="290,115 302,105 302,111 290,121" ${BL}/>
<polygon points="200,145 290,145 302,135 212,135" ${BL}/>
<polygon points="200,145 290,145 290,151 200,151" ${BL}/>
<polygon points="290,145 302,135 302,141 290,151" ${BL}/>
`, '198 48 107 110');

// ─────────────────────────────────────────────────────────────────────────────
// ROW 6 — Plant · Drawing · Carpet · Lamp
// ─────────────────────────────────────────────────────────────────────────────

export const plant = blk(`
<polygon points="54,128 116,128 128,118 66,118"  ${BL}/>
<polygon points="54,128 116,128 116,138 54,138"  ${BL}/>
<polygon points="116,128 128,118 128,128 116,138" ${BL}/>
<polygon points="58,138 112,138 122,130 68,130"  ${BL}/>
<polygon points="58,138 112,138 108,155 62,155"  ${BL}/>
<polygon points="112,138 122,130 118,147 108,155" ${BL}/>
<polygon points="58,118 112,118 122,110 68,110"  ${BD}/>
<line x1="85"  y1="118" x2="85"  y2="78" ${BL}/>
<line x1="85"  y1="98"  x2="65"  y2="82" ${BL}/>
<line x1="85"  y1="90"  x2="105" y2="76" ${BL}/>
<ellipse cx="58"  cy="78" rx="10" ry="6" transform="rotate(-20,58,78)"  ${BL}/>
<ellipse cx="112" cy="72" rx="10" ry="6" transform="rotate(-20,112,72)" ${BL}/>
<ellipse cx="85"  cy="70" rx="8"  ry="5" ${BL}/>
`, '44 66 92 93');

export const drawing = blk(`
<polygon points="200,58  300,58  312,48  212,48"  ${BL}/>
<polygon points="200,58  300,58  300,148 200,148" ${BL}/>
<polygon points="300,58  312,48  312,138 300,148" ${BL}/>
<polygon points="207,65  293,65  293,141 207,141" ${BD}/>
<polygon points="207,65  293,65  305,55  219,55"  ${BD}/>
<line x1="215" y1="108" x2="285" y2="108" ${BD}/>
<polyline points="218,108 232,82 246,108" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<polyline points="238,108 255,90 272,108" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<line x1="215" y1="120" x2="285" y2="120" ${BDD}/>
<line x1="215" y1="130" x2="285" y2="130" ${BDD}/>
`, '198 46 117 105');

export const carpet = blk(`
<polygon points="376,90  476,90  488,80  388,80"  ${BL}/>
<polygon points="376,90  476,90  476,148 376,148" ${BL}/>
<polygon points="476,90  488,80  488,138 476,148" ${BL}/>
<ellipse cx="376" cy="119" rx="6" ry="29" ${BL}/>
<line x1="376" y1="104" x2="476" y2="104" ${BDD}/>
<line x1="376" y1="119" x2="476" y2="119" ${BDD}/>
<line x1="376" y1="134" x2="476" y2="134" ${BDD}/>
`, '368 78 123 74');

export const lamp = blk(`
<polygon points="568,148 622,148 634,138 580,138" ${BL}/>
<polygon points="568,148 622,148 622,156 568,156" ${BL}/>
<polygon points="622,148 634,138 634,146 622,156" ${BL}/>
<line x1="595" y1="138" x2="595" y2="90" ${BL}/>
<polygon points="572,90  618,90  630,80  584,80"     ${BL}/>
<polygon points="565,110 625,110 618,90  572,90"     ${BL}/>
<polygon points="625,110 637,100 630,80  618,90"     ${BL}/>
<polygon points="565,110 625,110 637,100 577,100"    ${BL}/>
<line x1="580" y1="116" x2="574" y2="126" ${BD}/>
<line x1="595" y1="118" x2="595" y2="130" ${BD}/>
<line x1="610" y1="116" x2="616" y2="126" ${BD}/>
`, '562 78 78 82');

// ─────────────────────────────────────────────────────────────────────────────
// Room — floor-plan room icon (top-down room boundary with wall thickness)
// ─────────────────────────────────────────────────────────────────────────────
export const room = blk(`
<rect x="8" y="8" width="84" height="84" rx="2" ${BL}/>
<rect x="16" y="16" width="68" height="68" rx="1" ${BD}/>
<line x1="16" y1="62" x2="16" y2="84" ${BL}/>
<line x1="8"  y1="62" x2="8"  y2="84" ${BL}/>
<line x1="8"  y1="62" x2="16" y2="62" ${BD}/>
<polyline points="34,84 34,90 58,90 58,84" ${BD}/>
`, '0 0 100 100');

// ─────────────────────────────────────────────────────────────────────────────
// Floor — isometric thin floor slab with tile grid (distinct from thick Slab)
// ─────────────────────────────────────────────────────────────────────────────
export const floor = blk(`
<polygon points="210,104 300,104 288,116 198,116" ${BL}/>
<polygon points="210,104 300,104 300,110 210,110" ${BL}/>
<polygon points="300,104 288,116 288,122 300,110" ${BL}/>
<line x1="243" y1="104" x2="231" y2="116" ${BDD}/>
<line x1="270" y1="104" x2="258" y2="116" ${BDD}/>
<line x1="212" y1="108" x2="298" y2="108" ${BDD}/>
<line x1="210" y1="112" x2="296" y2="112" ${BDD}/>
`, '196 102 107 24');

// ─────────────────────────────────────────────────────────────────────────────
// Railing — isometric U-frame railing: top rail + two vertical end posts
// Matches Railing.SVG — no bottom rail, open-bottom U bracket in isometric view
// ─────────────────────────────────────────────────────────────────────────────
export const railing = blk(`
<polygon points="8,20 92,20 98,16 14,16"  ${BL}/>
<polygon points="8,20 92,20 92,26  8,26"  ${BL}/>
<polygon points="92,20 98,16 98,22 92,26" ${BL}/>
<polygon points="8,26  16,26 16,90  8,90" ${BL}/>
<polygon points="16,26 20,22 20,86 16,90" ${BL}/>
<polygon points="84,26 92,26 92,90 84,90" ${BL}/>
<polygon points="92,26 98,22 98,86 92,90" ${BL}/>
`, '-4 -4 108 108');

// ─────────────────────────────────────────────────────────────────────────────
// Services — isometric rectangular MEP duct/pipe (section header for SERVICES)
// ─────────────────────────────────────────────────────────────────────────────
export const services = blk(`
<polygon points="38,88  128,88  116,100 26,100" ${BL}/>
<polygon points="38,88  128,88  128,112 38,112" ${BL}/>
<polygon points="128,88 116,100 116,124 128,112" ${BL}/>
<polygon points="38,112 128,112 116,124 26,124" ${BL}/>
<line x1="66"  y1="88" x2="66"  y2="112" ${BDD}/>
<line x1="94"  y1="88" x2="94"  y2="112" ${BDD}/>
<line x1="40"  y1="100" x2="126" y2="100" ${BDD}/>
`, '22 86 110 42');

// ─────────────────────────────────────────────────────────────────────────────
// MODE PICKER ICONS — Plan-view diagrammatic icons used in mode picker HUDs.
// These are exported so mode pickers can import them instead of having local
// inline build*() functions scattered across each picker file.
// ─────────────────────────────────────────────────────────────────────────────

/** Wall — Linear mode: two parallel horizontal lines (plan section), left→right */
export const wallLinear = `<svg viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="4"  y1="16" x2="60" y2="16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="4"  y1="28" x2="60" y2="28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="4"  y1="14" x2="4"  y2="30" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="60" y1="14" x2="60" y2="30" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
</svg>`;

/** Wall — Orthogonal mode: L-shaped wall corner in plan view */
export const wallOrtho = `<svg viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polyline points="4,6 4,56 60,56"
            stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="16,6 16,44 60,44"
            stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="4"  y1="6"  x2="16" y2="6"  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="58" y1="44" x2="58" y2="56" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** Wall — Curved mode: two concentric arc lines in plan (arc wall cross-section) */
export const wallCurved = `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4,44 Q32,4 60,44"
        stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M14,44 Q32,16 50,44"
        stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <line x1="4"  y1="42" x2="14" y2="42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="42" x2="60" y2="42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** Wall — By Slab mode: plan-view slab perimeter (outer rect) with wall-thickness inner rect */
export const wallBySlab = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="5"  y="5"  width="54" height="54" rx="2" stroke="currentColor" stroke-width="3.5"/>
  <rect x="16" y="16" width="32" height="32" rx="1" stroke="currentColor" stroke-width="2"/>
</svg>`;

/** Door — Single leaf swinging from left jamb (plan view, quarter-arc swing) */
export const doorSingle = `<svg viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="4"  y1="10" x2="24" y2="10" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="60" y1="10" x2="60" y2="10" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="24" y1="6"  x2="24" y2="14" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="24" y1="10" x2="24" y2="46" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M24,46 A36,36 0 0,0 60,10"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="3.5 2.5"
        stroke-linecap="round" fill="none"/>
  <circle cx="24" cy="46" r="2" fill="currentColor"/>
</svg>`;

/** Door — Double leaf, two panels swinging from opposite jambs (plan view) */
export const doorDouble = `<svg viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="4"  y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="52" y1="10" x2="60" y2="10" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="12" y1="6"  x2="12" y2="14" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="52" y1="6"  x2="52" y2="14" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="12" y1="10" x2="12" y2="38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="52" y1="10" x2="52" y2="38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M12,38 A28,28 0 0,0 40,10"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="3.5 2.5"
        stroke-linecap="round" fill="none"/>
  <path d="M52,38 A28,28 0 0,1 24,10"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="3.5 2.5"
        stroke-linecap="round" fill="none"/>
  <circle cx="12" cy="38" r="2" fill="currentColor"/>
  <circle cx="52" cy="38" r="2" fill="currentColor"/>
</svg>`;

/** Window — Single pane filling the opening (plan view) */
export const windowSingle = `<svg viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="4"  y1="20" x2="16" y2="20" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="48" y1="20" x2="60" y2="20" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="16" y1="14" x2="16" y2="26" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="48" y1="14" x2="48" y2="26" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <rect x="16" y="16" width="32" height="8" rx="1"
        fill="currentColor" opacity="0.18"/>
  <rect x="16" y="16" width="32" height="8" rx="1"
        stroke="currentColor" stroke-width="1.5" fill="none"/>
</svg>`;

/** Window — Double pane with central mullion (plan view) */
export const windowDouble = `<svg viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <line x1="4"  y1="20" x2="12" y2="20" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="52" y1="20" x2="60" y2="20" stroke="currentColor" stroke-width="4"   stroke-linecap="round"/>
  <line x1="12" y1="14" x2="12" y2="26" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <line x1="52" y1="14" x2="52" y2="26" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
  <rect x="12" y="16" width="18" height="8" rx="1"
        fill="currentColor" opacity="0.18"/>
  <rect x="12" y="16" width="18" height="8" rx="1"
        stroke="currentColor" stroke-width="1.5" fill="none"/>
  <rect x="34" y="16" width="18" height="8" rx="1"
        fill="currentColor" opacity="0.18"/>
  <rect x="34" y="16" width="18" height="8" rx="1"
        stroke="currentColor" stroke-width="1.5" fill="none"/>
  <line x1="30" y1="14" x2="30" y2="26" stroke="currentColor" stroke-width="2"   stroke-linecap="round"/>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// STAIR SHAPE ICONS — Plan-view diagrammatic icons for I / L / U stair shapes.
// ─────────────────────────────────────────────────────────────────────────────

/** Stair I — straight single-run flight in plan view */
export const stairI = blk(`
<rect x="28" y="52" width="44" height="10" rx="1" ${BL}/>
<rect x="28" y="65" width="38" height="10" rx="1" ${BL}/>
<rect x="28" y="78" width="32" height="10" rx="1" ${BL}/>
<rect x="28" y="91" width="26" height="10" rx="1" ${BL}/>
<rect x="28" y="104" width="20" height="10" rx="1" ${BL}/>
<line x1="28" y1="52" x2="28" y2="114" ${BL}/>
`, '24 48 56 70');

/** Stair L — two flights at 90° in plan view (step-count variant) */
export const stairLSteps = blk(`
<rect x="28" y="52" width="42" height="9" rx="1" ${BL}/>
<rect x="28" y="63" width="36" height="9" rx="1" ${BL}/>
<rect x="28" y="74" width="30" height="9" rx="1" ${BL}/>
<rect x="28" y="85" width="10" height="9" rx="1" ${BL}/>
<rect x="28" y="96" width="10" height="9" rx="1" ${BL}/>
<rect x="28" y="107" width="10" height="9" rx="1" ${BL}/>
<line x1="28" y1="52" x2="28" y2="116" ${BL}/>
`, '24 48 56 72');

/** Stair U — two parallel flights with 180° landing in plan view (step-count variant) */
export const stairUSteps = blk(`
<rect x="28" y="52" width="40" height="9" rx="1" ${BL}/>
<rect x="28" y="63" width="34" height="9" rx="1" ${BL}/>
<rect x="28" y="74" width="28" height="9" rx="1" ${BL}/>
<rect x="72" y="74" width="28" height="9" rx="1" ${BL}/>
<rect x="78" y="63" width="22" height="9" rx="1" ${BL}/>
<rect x="84" y="52" width="16" height="9" rx="1" ${BL}/>
<line x1="28"  y1="52" x2="28"  y2="83" ${BL}/>
<line x1="100" y1="52" x2="100" y2="83" ${BL}/>
<line x1="28"  y1="83" x2="100" y2="83" ${BDD}/>
`, '24 48 80 48');

// ─────────────────────────────────────────────────────────────────────────────
// ROOF VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Roof — Poly (shed / flat polygon roof) — plan view polygon with ridge */
export const roofPoly = blk(`
<polygon points="38,100 78,60 128,68 118,120 60,130" ${BL}/>
<line x1="38"  y1="100" x2="118" y2="120" ${BDD}/>
<line x1="78"  y1="60"  x2="88"  y2="110" ${BDD}/>
`, '30 55 108 82');

// ─────────────────────────────────────────────────────────────────────────────
// INTERIORS — Additional icons beyond sofa / bed / chair / table
// ─────────────────────────────────────────────────────────────────────────────

/** Furniture — Generic: simple plan-view chair silhouette */
export const furniture = blk(`
<polygon points="38,80 88,80 88,140 38,140" ${BL}/>
<polygon points="38,80 88,80 96,72 46,72" ${BL}/>
<polygon points="88,80 96,72 96,132 88,140" ${BL}/>
<line x1="44" y1="140" x2="44" y2="155" ${BL}/>
<line x1="82" y1="140" x2="82" y2="155" ${BL}/>
<line x1="94" y1="132" x2="94" y2="147" ${BL}/>
`, '34 68 68 92');

/** Wardrobe — rectangle with centre split + arc handles (plan view) */
export const wardrobe = blk(`
<polygon points="200,60 300,60 312,50 212,50" ${BL}/>
<polygon points="200,60 300,60 300,148 200,148" ${BL}/>
<polygon points="300,60 312,50 312,138 300,148" ${BL}/>
<line x1="250" y1="60" x2="250" y2="148" ${BL}/>
<path d="M215,105 Q230,95 248,103" ${BD}/>
<path d="M285,105 Q270,95 252,103" ${BD}/>
`, '198 48 117 103');

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE — Additional structural element icons
// ─────────────────────────────────────────────────────────────────────────────

/** Structural Column — square filled cross-section in plan view */
export const structuralColumn = blk(`
<rect x="38" y="52" width="84" height="84" rx="2" ${BL}/>
<rect x="50" y="64" width="60" height="60" rx="1" ${BD}/>
<line x1="38" y1="52" x2="122" y2="136" ${BDD}/>
<line x1="122" y1="52" x2="38" y2="136" ${BDD}/>
`, '30 44 100 100');

/** Foundation — rectangular foundation with hatch ground lines (elevation) */
export const foundation = blk(`
<rect x="28" y="80" width="104" height="36" rx="2" ${BL}/>
<line x1="18" y1="116" x2="142" y2="116" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<line x1="18" y1="120" x2="32"  y2="132" ${BD}/>
<line x1="36" y1="120" x2="50"  y2="132" ${BD}/>
<line x1="54" y1="120" x2="68"  y2="132" ${BD}/>
<line x1="72" y1="120" x2="86"  y2="132" ${BD}/>
<line x1="90" y1="120" x2="104" y2="132" ${BD}/>
<line x1="108" y1="120" x2="122" y2="132" ${BD}/>
<line x1="126" y1="120" x2="140" y2="132" ${BD}/>
<rect x="64" y="44" width="32" height="36" rx="1" ${BL}/>
`, '14 40 132 98');

/** Brace — diagonal cross in a rectangle (plan/elevation) */
export const brace = blk(`
<rect x="28" y="52" width="104" height="84" rx="2" ${BL}/>
<line x1="28" y1="52"  x2="132" y2="136" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<line x1="132" y1="52" x2="28"  y2="136" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
`, '20 44 120 100');

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES — Additional MEP element icons
// ─────────────────────────────────────────────────────────────────────────────

/** Pipe — thin cylinder with flanges at each end (elevation/plan) */
export const pipe = blk(`
<line x1="28" y1="94"  x2="132" y2="94"  stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
<line x1="28" y1="106" x2="132" y2="106" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="28"  cy="100" rx="6" ry="12" ${BL}/>
<ellipse cx="132" cy="100" rx="6" ry="12" ${BL}/>
`, '18 84 124 32');

/** Electrical Outlet — circle with horizontal line (schematic symbol) */
export const electricalOutlet = blk(`
<circle cx="80" cy="94" r="36" ${BL}/>
<line x1="44" y1="94" x2="116" y2="94" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<line x1="66" y1="80" x2="66"  y2="94" ${BD}/>
<line x1="94" y1="80" x2="94"  y2="94" ${BD}/>
`, '40 54 80 80');

// ─────────────────────────────────────────────────────────────────────────────
// LANDSCAPE — Plan-view landscape element icons
// ─────────────────────────────────────────────────────────────────────────────

/** Tree — circle canopy with trunk dot in plan view */
export const tree = blk(`
<circle cx="80" cy="90" r="46" ${BP}/>
<circle cx="80" cy="90" r="28" ${BD}/>
<circle cx="80" cy="90" r="6" ${BL}/>
<line x1="80" y1="84" x2="80" y2="44" ${BD}/>
`, '28 36 104 108');

/** Bath — plan view: outer tub with rounded inner basin and drain */
export const pryzmBath = blk(`
<rect x="10" y="22" width="80" height="56" rx="8" ry="8" ${BP}/>
<rect x="20" y="32" width="50" height="36" rx="6" ry="6" ${BL}/>
<circle cx="78" cy="50" r="3" ${BL}/>
`, '-4 -4 108 108');

/** Toilet — plan view: tank rectangle behind oval bowl */
export const pryzmToilet = blk(`
<rect x="22" y="10" width="56" height="20" rx="3" ry="3" ${BP}/>
<ellipse cx="50" cy="60" rx="28" ry="30" ${BP}/>
<ellipse cx="50" cy="60" rx="20" ry="22" ${BL}/>
`, '-4 -4 108 108');

/** Sink — plan view: rectangular vanity with bowl and faucet */
export const pryzmSink = blk(`
<rect x="10" y="18" width="80" height="64" rx="6" ry="6" ${BP}/>
<rect x="22" y="32" width="56" height="42" rx="6" ry="6" ${BL}/>
<line x1="50" y1="18" x2="50" y2="28" ${BL}/>
<circle cx="50" cy="30" r="2.5" ${BL}/>
`, '-4 -4 108 108');

/** Shower — plan view: square tray with central circular shower head */
export const pryzmShower = blk(`
<rect x="12" y="12" width="76" height="76" rx="4" ry="4" ${BP}/>
<circle cx="50" cy="50" r="14" ${BL}/>
<circle cx="50" cy="50" r="2" ${BD}/>
<circle cx="44" cy="50" r="1.5" ${BD}/>
<circle cx="56" cy="50" r="1.5" ${BD}/>
<circle cx="50" cy="44" r="1.5" ${BD}/>
<circle cx="50" cy="56" r="1.5" ${BD}/>
`, '-4 -4 108 108');

/** Room Bounding — dashed square outline (plan-view boundary marker) */
export const pryzmRoomBounding = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" width="28" height="28" style="display:block"><rect x="10" y="10" width="80" height="80" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 6"/></svg>`;

/** Landscape (category icon) — front-elevation tree with cloud-shape canopy and Y-branch trunk */
export const pryzmLandscape = blk(`
<path d="M 22,42
         C 12,38 10,26 22,22
         C 18,10 32,6 38,14
         C 42,2 58,2 64,12
         C 72,4 86,10 84,22
         C 96,24 96,38 86,42
         C 92,52 82,58 74,54
         C 72,62 60,60 56,54
         C 52,62 44,62 40,54
         C 32,60 22,54 24,46
         Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<line x1="50" y1="100" x2="50" y2="60" ${BL}/>
<line x1="50" y1="60"  x2="38" y2="40" ${BL}/>
<line x1="50" y1="60"  x2="62" y2="40" ${BL}/>
<line x1="50" y1="60"  x2="50" y2="32" ${BL}/>
<line x1="44" y1="50"  x2="40" y2="44" ${BD}/>
<line x1="56" y1="50"  x2="60" y2="44" ${BD}/>
`, '-1 -3 108 108');

/** Hedge — irregular blob outline plan view */
export const hedge = blk(`
<path d="M38,100 Q44,72 62,66 Q76,58 92,66 Q108,58 122,68 Q136,78 132,100 Q136,120 120,128 Q104,138 88,130 Q72,138 56,128 Q40,118 38,100 Z" ${BL}/>
<path d="M54,100 Q58,82 70,78 Q84,72 96,80 Q108,74 118,84 Q122,98 116,110 Q108,122 96,118 Q84,124 72,116 Q58,112 54,100 Z" ${BD}/>
`, '30 52 112 94');

/** Planting Bed — organic shape outline in plan view */
export const plantingBed = blk(`
<path d="M30,110 Q38,72 64,60 Q90,50 112,66 Q134,58 144,82 Q152,106 136,126 Q118,146 92,140 Q66,148 46,130 Q28,114 30,110 Z" ${BL}/>
<circle cx="60"  cy="92"  r="8" ${BD}/>
<circle cx="88"  cy="76"  r="6" ${BD}/>
<circle cx="114" cy="88"  r="7" ${BD}/>
<circle cx="100" cy="114" r="9" ${BD}/>
<circle cx="68"  cy="118" r="6" ${BD}/>
`, '22 44 136 112');

/** Hard Landscaping — grid of squares / pavers in plan view */
export const hardLandscaping = blk(`
<rect x="30" y="52" width="100" height="88" rx="2" ${BL}/>
<line x1="30"  y1="74"  x2="130" y2="74"  ${BD}/>
<line x1="30"  y1="96"  x2="130" y2="96"  ${BD}/>
<line x1="30"  y1="118" x2="130" y2="118" ${BD}/>
<line x1="63"  y1="52"  x2="63"  y2="140" ${BD}/>
<line x1="97"  y1="52"  x2="97"  y2="140" ${BD}/>
`, '22 44 116 104');

