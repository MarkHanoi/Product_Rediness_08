import { aO as STANDARD_MATERIAL_LIBRARY, cL as materialHexById, cM as findMaterialById, cN as TechnicalDrawing } from './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';

const NO_MATERIAL_SWATCH = "#e0d8d0";
const OPT_NONE = "";
const OPT_KEEP_LEGACY = "__legacy__";
const OPT_KEEP_UNRESOLVED = "__unresolved__";
function finishMaterialHex(id) {
  if (!id) return void 0;
  return materialHexById(id);
}
function finishMaterialLabel(id) {
  if (!id) return void 0;
  return findMaterialById(id)?.label;
}
function finishMaterialState(currentId, legacyName) {
  const id = currentId?.trim();
  if (id) return finishMaterialHex(id) ? "resolved" : "unresolved";
  return legacyName?.trim() ? "legacy" : "empty";
}
const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function suggestMaterialForLegacyName(legacyName) {
  const want = normalise(legacyName ?? "");
  if (want.length < 3) return void 0;
  for (const m of STANDARD_MATERIAL_LIBRARY) {
    if (normalise(m.label) === want) return m.id;
  }
  const wantWords = want.split(" ").filter((w) => w.length > 2);
  if (wantWords.length === 0) return void 0;
  for (const m of STANDARD_MATERIAL_LIBRARY) {
    const have = normalise(m.label).split(" ");
    if (wantWords.every((w) => have.includes(w))) return m.id;
  }
  return void 0;
}
function buildFinishMaterialSelect(opts) {
  const currentId = opts.currentId?.trim() || void 0;
  const legacyName = opts.legacyName?.trim() || void 0;
  const state = finishMaterialState(currentId, legacyName);
  const wrap = document.createElement("div");
  wrap.className = "fms-wrap";
  wrap.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;min-width:0;";
  wrap.dataset.finishState = state;
  const swatch = document.createElement("div");
  swatch.className = "fms-swatch";
  const paintSwatch = (hex) => {
    swatch.style.background = hex ?? NO_MATERIAL_SWATCH;
  };
  swatch.style.cssText = "width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);";
  paintSwatch(finishMaterialHex(currentId));
  const sel = document.createElement("select");
  sel.className = "dw-select fms-select";
  sel.style.cssText = "flex:1 1 auto;min-width:0;";
  if (opts.disabled) {
    sel.disabled = true;
    if (opts.disabledReason) sel.title = opts.disabledReason;
  }
  const addOption = (value, text, selected = false) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    if (selected) o.selected = true;
    sel.appendChild(o);
    return o;
  };
  if (state === "legacy") {
    addOption(OPT_KEEP_LEGACY, `⚠ "${legacyName}" — not a library material`, true);
    const suggestion = suggestMaterialForLegacyName(legacyName);
    if (suggestion) {
      addOption(suggestion, `↪ Use ${finishMaterialLabel(suggestion)}`);
    }
    addOption(OPT_NONE, "— no material —");
    wrap.title = `This finish carries the text "${legacyName}", which is not a material in the library. Pick one to give it a colour, a carbon factor and a place in the schedules. Your text is kept until you do.`;
  } else if (state === "unresolved") {
    addOption(OPT_KEEP_UNRESOLVED, `⚠ Unresolved material (${currentId})`, true);
    addOption(OPT_NONE, "— no material —");
    wrap.title = `This finish references the material id "${currentId}", which is not in the library. It has not been changed. Pick a material to replace the reference.`;
  } else {
    addOption(OPT_NONE, "— select material —", state === "empty");
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const m of STANDARD_MATERIAL_LIBRARY) {
    const list = grouped.get(m.category) ?? [];
    list.push(m);
    grouped.set(m.category, list);
  }
  Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([cat, mats]) => {
    const grp = document.createElement("optgroup");
    grp.label = cat;
    for (const m of mats) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      if (m.id === currentId) o.selected = true;
      grp.appendChild(o);
    }
    sel.appendChild(grp);
  });
  sel.addEventListener("change", () => {
    const value = sel.value;
    if (value === OPT_KEEP_LEGACY || value === OPT_KEEP_UNRESOLVED) return;
    const hex = finishMaterialHex(value);
    paintSwatch(hex);
    wrap.dataset.finishState = value ? hex ? "resolved" : "unresolved" : "empty";
    wrap.title = "";
    opts.onChange(value, hex ?? NO_MATERIAL_SWATCH, finishMaterialLabel(value) ?? "");
  });
  wrap.appendChild(swatch);
  wrap.appendChild(sel);
  return wrap;
}

function appendDwGroup(body, title) {
  const g = document.createElement("div");
  g.className = "dw-group";
  g.textContent = title;
  body.appendChild(g);
}
function appendDwNote(body, text) {
  const n = document.createElement("div");
  n.className = "dw-note";
  n.textContent = text;
  body.appendChild(n);
  return n;
}

function projectToDrawingSpace(lines, drawing) {
  return TechnicalDrawing.toDrawingSpace(
    lines,
    drawing
  );
}

export { appendDwGroup as a, buildFinishMaterialSelect as b, appendDwNote as c, finishMaterialLabel as d, finishMaterialState as e, finishMaterialHex as f, projectToDrawingSpace as p, suggestMaterialForLegacyName as s };
