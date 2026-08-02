// §MURCIA-ENVELOPE-MAX — THE CAPTCHA / FICHA DETECTOR, and why it is not the obvious one.
//
// ⛔ THE OBVIOUS TEST IS WRONG AND WOULD HAVE VOIDED THE WHOLE HARVEST.
//    Radware Bot Manager injects its JS sensor (`SSJSInternal`, `__uzdbm_*`, perfdrive
//    references) into EVERY response from urbmurcia.carm.es — INCLUDING successful ficha
//    pages. A detector that reads "mentions perfdrive/SSJSInternal" as "this is a CAPTCHA"
//    therefore discards GENUINE FICHAS and reports the channel as unreachable.
//    Verified against a known-good capture: raw-fichas/ficha-4921.html is a real
//    26 892-byte ficha AND matches /perfdrive/ AND matches /SSJSInternal/.
//
//    This is the "HTTP 200 IS NOT SUCCESS" trap in its second, nastier form: the naive fix
//    for it (look for the bot-defence marker) is ALSO wrong, in the opposite direction.
//
// The correct test is POSITIVE ON THE DOCUMENT, not negative on the defence:
//    ficha   = carries the stored-procedure banner AND the ámbito table
//    captcha = carries the literal Radware CAPTCHA title AND no ámbito table

export const CAPTCHA_TITLE = /Radware Captcha Page|Please solve this CAPTCHA/i;
export const FICHA_MARKER = /PROCEDURE FICHA \( *WIde IN Number *\)/i;
export const FICHA_TABLE = /Ámbito seleccionado|mbito seleccionado/i;

export function classify(html) {
  const isFicha = FICHA_MARKER.test(html) && FICHA_TABLE.test(html);
  if (isFicha) return 'ficha';
  if (CAPTCHA_TITLE.test(html)) return 'captcha';
  return 'other';
}
