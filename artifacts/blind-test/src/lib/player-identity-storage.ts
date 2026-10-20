export type PlayerIdentityStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function readPlayerIdentity(
  key: string,
  persistentStorage: PlayerIdentityStorage,
  legacyStorage: PlayerIdentityStorage,
): string {
  try {
    const persistentValue = persistentStorage.getItem(key);
    if (persistentValue) return persistentValue;
    const legacyValue = legacyStorage.getItem(key) ?? "";
    if (legacyValue) persistentStorage.setItem(key, legacyValue);
    return legacyValue;
  } catch {
    return legacyStorage.getItem(key) ?? "";
  }
}

export function storePlayerIdentity(
  key: string,
  value: string,
  persistentStorage: PlayerIdentityStorage,
  legacyStorage: PlayerIdentityStorage,
): void {
  try {
    persistentStorage.setItem(key, value);
    legacyStorage.removeItem(key);
  } catch {
    legacyStorage.setItem(key, value);
  }
}
