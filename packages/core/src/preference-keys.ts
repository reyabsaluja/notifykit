export const GLOBAL_PREFERENCE_KEY = "__global__";

export function categoryPreferenceKey(category: string): string {
  return `__category:${category}__`;
}

export function isSyntheticPreferenceKey(key: string): boolean {
  return (
    key === GLOBAL_PREFERENCE_KEY ||
    (key.startsWith("__category:") && key.endsWith("__"))
  );
}
