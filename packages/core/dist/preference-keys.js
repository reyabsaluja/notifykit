export const GLOBAL_PREFERENCE_KEY = "__global__";
export function categoryPreferenceKey(category) {
    return `__category:${category}__`;
}
export function isSyntheticPreferenceKey(key) {
    return (key === GLOBAL_PREFERENCE_KEY ||
        (key.startsWith("__category:") && key.endsWith("__")));
}
//# sourceMappingURL=preference-keys.js.map