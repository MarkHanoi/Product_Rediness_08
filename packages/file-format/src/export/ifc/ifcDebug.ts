export const ifcLog = (...args: any[]) => {
    console.log('%c[IFC]', 'color:#00aaff;font-weight:bold;', ...args);
};

export const ifcError = (...args: any[]) => {
    console.error('%c[IFC ERROR]', 'color:#ff4444;font-weight:bold;', ...args);
};
