const LEADING_DETERMINERS_RE = /^(?:(?:all|every|each|both|the|these|those|this|selected)\s+)+/;
const ELEMENT_NOUN_ONLY_RE =
  /^(?:walls?|wall segments?|building|project|model|site|elements?|sides?|faces?)$/;
function isNotAPlace(phrase: string): boolean {
  const p = phrase.trim().toLowerCase().replace(LEADING_DETERMINERS_RE, '').trim();
  return p.length === 0 || ELEMENT_NOUN_ONLY_RE.test(p);
}
for (const s of ['all walls','every wall segment','the walls','the selected walls','the kitchen','block b','house 2','south facade','ground floor','all wall segments','every wall']) {
  console.log(`${isNotAPlace(s) ? 'NOT-A-PLACE' : 'IS-A-PLACE  '}  "${s}"`);
}
