export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

let installed: PreferenceStorage | undefined;
function storage(): PreferenceStorage | undefined {
  if (installed) return installed;
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}
export function installPreferences(value: PreferenceStorage) { installed = value; }
export const preferences: PreferenceStorage = {
  getItem: key => storage()?.getItem(key) ?? null,
  setItem: (key, value) => storage()?.setItem(key, value),
  removeItem: key => storage()?.removeItem(key),
  key: index => storage()?.key(index) ?? null,
  get length() { return storage()?.length ?? 0; },
};
