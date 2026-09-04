// LANE E2b (Wave E2, REPORT §S item 5) — minimal deterministic XML scanner for the APP GML 2.0
// parser. PURE + TOTAL: string in → element tree or a NAMED refusal with byte offset + element
// path; it never throws, touches no DOM (`DOMParser` is deliberately absent — the package
// discipline set by `balearsMuibFitxa.ts`: identical behaviour in browser, node and worker), no
// I/O, no clock, no RNG. It is a SCANNER, not a validator: well-formedness + namespace
// resolution only; APP-schema shape is enforced one layer up (`parseAppGml.ts`).
//
// Scope decisions (each refusal is a NAMED token, never a silent skip):
//   • DOCTYPE is refused (`doctype-not-allowed`) — no entity expansion surface, by construction.
//   • Undeclared namespace prefixes are refused — a GML document with broken xmlns wiring is
//     malformed input, not "close enough".
//   • Only the five XML entities + numeric character references are decoded; anything else is
//     `unknown-entity` (we would otherwise silently corrupt text content).
//   • Depth is capped (256) so a hostile input cannot blow the stack.

/** One attribute, with its namespace resolved (default xmlns does NOT apply to attributes). */
export interface XmlAttr {
    readonly qname: string;
    readonly prefix: string;
    readonly local: string;
    /** Resolved namespace URI; '' for un-prefixed attributes. */
    readonly ns: string;
    readonly value: string;
}

/** One element. `text` is the concatenation of DIRECT text/CDATA children (entity-decoded). */
export interface XmlElement {
    readonly qname: string;
    readonly prefix: string;
    readonly local: string;
    /** Resolved namespace URI; '' if unbound (no default xmlns in scope). */
    readonly ns: string;
    readonly attrs: readonly XmlAttr[];
    readonly children: readonly XmlElement[];
    readonly text: string;
    /** Slash path with 1-based same-qname sibling ordinals, e.g. `/wfs:FeatureCollection/wfs:member[3]/app:StrefaPlanistyczna[1]`. */
    readonly path: string;
}

/** The closed set of well-formedness refusal reasons the scanner can emit. */
export type XmlRefusalReason =
    | 'not-xml'
    | 'doctype-not-allowed'
    | 'malformed-tag'
    | 'malformed-attribute'
    | 'duplicate-attribute'
    | 'unclosed-element'
    | 'mismatched-close-tag'
    | 'unexpected-close-tag'
    | 'trailing-content'
    | 'unterminated-comment'
    | 'unterminated-cdata'
    | 'unterminated-pi'
    | 'unknown-entity'
    | 'undeclared-namespace-prefix'
    | 'nesting-too-deep';

export type XmlScanOutcome =
    | { readonly ok: true; readonly root: XmlElement }
    | {
          readonly ok: false;
          readonly reason: XmlRefusalReason;
          /** 0-based character offset into the input where the defect was seen. */
          readonly offset: number;
          /** Element path at the point of refusal ('' when the defect precedes the root). */
          readonly path: string;
          readonly detail: string;
      };

const MAX_DEPTH = 256;

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

interface MutableElement {
    qname: string;
    prefix: string;
    local: string;
    ns: string;
    attrs: XmlAttr[];
    children: MutableElement[];
    text: string;
    path: string;
}

class ScanRefusal {
    constructor(
        readonly reason: XmlRefusalReason,
        readonly offset: number,
        readonly path: string,
        readonly detail: string,
    ) {}
}

function decodeEntities(raw: string, offset: number, path: string): string {
    if (raw.indexOf('&') === -1) return raw;
    return raw.replace(/&([^;&\s]{0,32});?/g, (whole, body: string, idx: number) => {
        if (!whole.endsWith(';')) {
            throw new ScanRefusal('unknown-entity', offset + idx, path, `unterminated entity "${whole}"`);
        }
        switch (body) {
            case 'amp':
                return '&';
            case 'lt':
                return '<';
            case 'gt':
                return '>';
            case 'quot':
                return '"';
            case 'apos':
                return "'";
            default: {
                if (body.startsWith('#x') || body.startsWith('#X')) {
                    const cp = Number.parseInt(body.slice(2), 16);
                    if (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
                } else if (body.startsWith('#')) {
                    const cp = Number.parseInt(body.slice(1), 10);
                    if (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
                }
                throw new ScanRefusal('unknown-entity', offset + idx, path, `unknown entity "&${body};"`);
            }
        }
    });
}

function splitQName(qname: string): { prefix: string; local: string } {
    const colon = qname.indexOf(':');
    if (colon === -1) return { prefix: '', local: qname };
    return { prefix: qname.slice(0, colon), local: qname.slice(colon + 1) };
}

function isNameOk(prefix: string, local: string): boolean {
    return (prefix === '' || NAME_RE.test(prefix)) && NAME_RE.test(local);
}

/**
 * Scan an XML document string into an element tree. Total: every possible input yields either
 * `{ ok: true }` or a named refusal — never an exception.
 */
export function scanXml(input: string): XmlScanOutcome {
    try {
        return scanInner(input);
    } catch (e) {
        if (e instanceof ScanRefusal) {
            return { ok: false, reason: e.reason, offset: e.offset, path: e.path, detail: e.detail };
        }
        // Defensive totality: anything else is still reported as a refusal, deterministically.
        return { ok: false, reason: 'malformed-tag', offset: 0, path: '', detail: `internal: ${String(e)}` };
    }
}

function scanInner(input: string): XmlScanOutcome {
    let i = 0;
    const n = input.length;
    // BOM
    if (input.charCodeAt(0) === 0xfeff) i = 1;

    const skipWs = () => {
        while (i < n) {
            const c = input.charCodeAt(i);
            if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
            else break;
        }
    };

    const skipMisc = (path: string) => {
        // whitespace, comments, PIs (incl. the XML declaration) before/after the root element
        for (;;) {
            skipWs();
            if (input.startsWith('<?', i)) {
                const end = input.indexOf('?>', i + 2);
                if (end === -1) throw new ScanRefusal('unterminated-pi', i, path, 'processing instruction never closed');
                i = end + 2;
                continue;
            }
            if (input.startsWith('<!--', i)) {
                const end = input.indexOf('-->', i + 4);
                if (end === -1) throw new ScanRefusal('unterminated-comment', i, path, 'comment never closed');
                i = end + 3;
                continue;
            }
            if (input.startsWith('<!DOCTYPE', i) || input.startsWith('<!doctype', i)) {
                throw new ScanRefusal('doctype-not-allowed', i, path, 'DOCTYPE declarations are refused (no entity expansion surface)');
            }
            return;
        }
    };

    skipMisc('');
    if (i >= n || input.charCodeAt(i) !== 0x3c /* < */) {
        return { ok: false, reason: 'not-xml', offset: i, path: '', detail: 'no root element found (input does not start with an XML tag)' };
    }

    /** Parse the tag at `i` (which points at '<'). Returns the element with children parsed. */
    const parseElement = (
        nsStack: ReadonlyArray<ReadonlyMap<string, string>>,
        parentPath: string,
        siblingCounts: Map<string, number>,
        depth: number,
    ): MutableElement => {
        if (depth > MAX_DEPTH) throw new ScanRefusal('nesting-too-deep', i, parentPath, `element nesting exceeds ${MAX_DEPTH}`);
        const tagStart = i;
        i++; // consume '<'
        // read qname
        let j = i;
        while (j < n && !' \t\r\n/>'.includes(input[j] as string)) j++;
        const qname = input.slice(i, j);
        const { prefix, local } = splitQName(qname);
        if (qname === '' || !isNameOk(prefix, local)) {
            throw new ScanRefusal('malformed-tag', tagStart, parentPath, `invalid element name "${qname}"`);
        }
        i = j;

        const ordinal = (siblingCounts.get(qname) ?? 0) + 1;
        siblingCounts.set(qname, ordinal);
        const path = `${parentPath}/${qname}[${ordinal}]`;

        // attributes
        const attrsRaw: Array<{ qname: string; prefix: string; local: string; value: string }> = [];
        const seenAttr = new Set<string>();
        let selfClosing = false;
        for (;;) {
            skipWs();
            if (i >= n) throw new ScanRefusal('unclosed-element', tagStart, path, `tag <${qname}> never closed`);
            const c = input[i] as string;
            if (c === '>') {
                i++;
                break;
            }
            if (c === '/') {
                if (input[i + 1] !== '>') throw new ScanRefusal('malformed-tag', i, path, `stray "/" in tag <${qname}>`);
                i += 2;
                selfClosing = true;
                break;
            }
            // attribute name
            let k = i;
            while (k < n && !' \t\r\n=/>'.includes(input[k] as string)) k++;
            const aq = input.slice(i, k);
            const { prefix: ap, local: al } = splitQName(aq);
            if (aq === '' || !isNameOk(ap, al)) {
                throw new ScanRefusal('malformed-attribute', i, path, `invalid attribute name "${aq}" in <${qname}>`);
            }
            i = k;
            skipWs();
            if (input[i] !== '=') throw new ScanRefusal('malformed-attribute', i, path, `attribute "${aq}" in <${qname}> has no value`);
            i++;
            skipWs();
            const quote = input[i];
            if (quote !== '"' && quote !== "'") {
                throw new ScanRefusal('malformed-attribute', i, path, `attribute "${aq}" value is not quoted`);
            }
            const vEnd = input.indexOf(quote, i + 1);
            if (vEnd === -1) throw new ScanRefusal('malformed-attribute', i, path, `attribute "${aq}" value never closed`);
            const rawValue = input.slice(i + 1, vEnd);
            const value = decodeEntities(rawValue, i + 1, path);
            i = vEnd + 1;
            if (seenAttr.has(aq)) throw new ScanRefusal('duplicate-attribute', i, path, `duplicate attribute "${aq}" in <${qname}>`);
            seenAttr.add(aq);
            attrsRaw.push({ qname: aq, prefix: ap, local: al, value });
        }

        // namespace scope for this element
        let scope: Map<string, string> | null = null;
        for (const a of attrsRaw) {
            if (a.qname === 'xmlns') {
                scope = scope ?? new Map(nsStack[nsStack.length - 1]);
                scope.set('', a.value);
            } else if (a.prefix === 'xmlns') {
                scope = scope ?? new Map(nsStack[nsStack.length - 1]);
                scope.set(a.local, a.value);
            }
        }
        const inScope: ReadonlyMap<string, string> = scope ?? (nsStack[nsStack.length - 1] as ReadonlyMap<string, string>);

        const resolveElementNs = (p: string): string => {
            const bound = inScope.get(p);
            if (bound !== undefined) return bound;
            if (p === '') return ''; // no default namespace in scope
            throw new ScanRefusal('undeclared-namespace-prefix', tagStart, path, `element prefix "${p}:" is not declared`);
        };
        const resolveAttrNs = (p: string): string => {
            if (p === '' || p === 'xmlns') return '';
            const bound = inScope.get(p);
            if (bound !== undefined) return bound;
            if (p === 'xml') return 'http://www.w3.org/XML/1998/namespace';
            throw new ScanRefusal('undeclared-namespace-prefix', tagStart, path, `attribute prefix "${p}:" is not declared`);
        };

        const el: MutableElement = {
            qname,
            prefix,
            local,
            ns: resolveElementNs(prefix),
            attrs: attrsRaw.map((a) => ({ qname: a.qname, prefix: a.prefix, local: a.local, ns: resolveAttrNs(a.prefix), value: a.value })),
            children: [],
            text: '',
            path,
        };
        if (selfClosing) return el;

        // content
        const childCounts = new Map<string, number>();
        const nextStack = [...nsStack, inScope];
        for (;;) {
            if (i >= n) throw new ScanRefusal('unclosed-element', tagStart, path, `element <${qname}> never closed`);
            const lt = input.indexOf('<', i);
            if (lt === -1) throw new ScanRefusal('unclosed-element', tagStart, path, `element <${qname}> never closed`);
            if (lt > i) {
                el.text += decodeEntities(input.slice(i, lt), i, path);
                i = lt;
            }
            if (input.startsWith('</', i)) {
                const end = input.indexOf('>', i + 2);
                if (end === -1) throw new ScanRefusal('unclosed-element', i, path, `close tag of <${qname}> never terminated`);
                const closeName = input.slice(i + 2, end).trim();
                if (closeName !== qname) {
                    throw new ScanRefusal('mismatched-close-tag', i, path, `expected </${qname}>, found </${closeName}>`);
                }
                i = end + 1;
                return el;
            }
            if (input.startsWith('<!--', i)) {
                const end = input.indexOf('-->', i + 4);
                if (end === -1) throw new ScanRefusal('unterminated-comment', i, path, 'comment never closed');
                i = end + 3;
                continue;
            }
            if (input.startsWith('<![CDATA[', i)) {
                const end = input.indexOf(']]>', i + 9);
                if (end === -1) throw new ScanRefusal('unterminated-cdata', i, path, 'CDATA section never closed');
                el.text += input.slice(i + 9, end);
                i = end + 3;
                continue;
            }
            if (input.startsWith('<?', i)) {
                const end = input.indexOf('?>', i + 2);
                if (end === -1) throw new ScanRefusal('unterminated-pi', i, path, 'processing instruction never closed');
                i = end + 2;
                continue;
            }
            if (input.startsWith('<!', i)) {
                throw new ScanRefusal('doctype-not-allowed', i, path, 'markup declarations inside content are refused');
            }
            el.children.push(parseElement(nextStack, path, childCounts, depth + 1));
        }
    };

    const rootCounts = new Map<string, number>();
    const root = parseElement([new Map<string, string>()], '', rootCounts, 1);

    skipMisc(root.path);
    if (i < n) {
        return { ok: false, reason: 'trailing-content', offset: i, path: root.path, detail: 'content found after the document element' };
    }
    return { ok: true, root: root as XmlElement };
}

// ---- tree helpers (used by parseAppGml; exported for tests) ----------------------------------

/** Direct children matching namespace + local name. */
export function childrenNs(el: XmlElement, ns: string, local: string): readonly XmlElement[] {
    return el.children.filter((c) => c.ns === ns && c.local === local);
}

/** First direct child matching namespace + local name, or null. */
export function childNs(el: XmlElement, ns: string, local: string): XmlElement | null {
    for (const c of el.children) if (c.ns === ns && c.local === local) return c;
    return null;
}

/** Un-namespaced (or any-namespace) attribute value by local name, or null. */
export function attrLocal(el: XmlElement, local: string): string | null {
    for (const a of el.attrs) if (a.local === local && a.prefix !== 'xmlns' && a.qname !== 'xmlns') return a.value;
    return null;
}

/** Attribute value by namespace + local name, or null. */
export function attrNs(el: XmlElement, ns: string, local: string): string | null {
    for (const a of el.attrs) if (a.ns === ns && a.local === local) return a.value;
    return null;
}

/** Trimmed direct text content. */
export function textOf(el: XmlElement): string {
    return el.text.trim();
}
