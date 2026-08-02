import { openSync, readSync, closeSync } from 'node:fs';
for (const ine of ['08019', '28079', '30030', '14021', '46250', '27028']) {
    const fd = openSync(`.cache/CP_${ine}.gml`, 'r');
    const buf = Buffer.alloc(400000);
    readSync(fd, buf, 0, 400000, 0);
    closeSync(fd);
    const s = buf.toString('latin1');
    const m = [...s.matchAll(/srsName="([^"]+)"/g)].map((x) => x[1]);
    console.log(ine, [...new Set(m)].slice(0, 3).join(' | '));
}
