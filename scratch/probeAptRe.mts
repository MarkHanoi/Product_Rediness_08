import { BUILDING_PLACE_NOUN_SRC, namesABuildingPlace } from '../packages/ai-host/src/intents/SpatialScopeTail.js';
const rebuilt = new RegExp(String.raw`\b${BUILDING_PLACE_NOUN_SRC}\b`);
const original = /\b(?:buildings?|blocks?|towers?|complex)\b/;
console.log('source equal:', rebuilt.source === original.source, '|', rebuilt.source);
let diff = 0;
for (const t of ['block b','building 2','towers','complex','the kitchen','house 2','blocked','a tower','south','in block b']) {
  if (rebuilt.test(t) !== original.test(t)) { diff++; console.log('DIFFERS', t); }
}
console.log('behaviour differences:', diff);
console.log('namesABuildingPlace: block b =', namesABuildingPlace('block b'), '| the kitchen =', namesABuildingPlace('the kitchen'), '| blocked =', namesABuildingPlace('blocked'));
