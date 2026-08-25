// window shim for node probes — must be the FIRST import of every wj91 probe.
const w = globalThis as any;
w.window = w;
w.addEventListener ??= () => {};
w.removeEventListener ??= () => {};
w.dispatchEvent ??= () => true;
w.document ??= {
    createElement: () => ({ getContext: () => null, style: {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
};
export {};
