export const GLOBAL_PREFERENCE_KEY = "__global__";

export function categoryPreferenceKey(category: string): string {
  return `__category:${category}__`;
}

export function isSyntheticPreferenceKey(key: string): boolean {
  return (
    key === GLOBAL_PREFERENCE_KEY ||
    isCategoryPreferenceKey(key)
  );
}

export function isCategoryPreferenceKey(key: string): boolean {
  return key.startsWith("__category:") && key.endsWith("__");
}

export function parseCategoryFromKey(key: string): string | null {
  if (!isCategoryPreferenceKey(key)) return null;
  return key.slice("__category:".length, -"__".length);
}
